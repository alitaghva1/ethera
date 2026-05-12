# Projectile — a flying bolt that damages whatever group it's aimed at.
# Used for both the hero's blast spell AND enemy ranged casts (wizard's
# arcane orb, future bomber lobs, etc).
#
# Configure per-instance:
#   • target_group   "enemies" (hero blast) or "hero" (enemy cast)
#   • damage         flat damage on hit
#   • velocity       initial direction × speed
#   • orb_tint       optional Color (defaults to magenta for hero,
#                     cyan-blue for enemy)
#
# Refactored Iter 4 to support both hero + enemy attacks via a single
# scene + script. Previously hero-only. The collision_mask is set in
# code (not in the .tscn) so the project doesn't need two parallel
# scenes with hardcoded masks for the same behavior.
class_name Projectile
extends Area2D

const SPEED    := 520.0
const LIFETIME := 1.4

# Iter 65 — FIRE_POOL preload for BLAST × FLAME ability evolution. On
# projectile impact against an enemy, if `flame_impact_pool_life` was
# locked > 0 at spawn (FLAME theme tier ≥ 1 on the hero), spawn a fire
# pool at the impact point. Hosted on get_parent() (main scene root) so
# the pool persists after the projectile queue_frees.
const FIRE_POOL_SCENE: PackedScene = preload("res://scenes/fire_pool.tscn")

# Iter 67 — CHAIN_ARC preload for BLAST × STORM ability evolution. On
# projectile impact against an enemy, if `storm_chain_count` was locked
# > 0 at spawn (STORM theme tier ≥ 1 on the hero), pick the N nearest
# OTHER enemies within `storm_chain_radius` of the impact, apply chain
# damage to each, and spawn a ChainArc visual from impact → each target.
# No re-chaining from chain-hit enemies (single hop per blast) — chain
# damage is applied via take_hit directly, NOT by spawning a new
# projectile, which would otherwise risk a chain loop.
const CHAIN_ARC_SCENE: PackedScene = preload("res://scenes/fx/chain_arc.tscn")

@export var target_group: String = "enemies"
@export var orb_tint: Color = Color(1, 0.55, 1, 1)         # magenta default

var velocity := Vector2.ZERO
var damage   := 1
# executioner relic — set TRUE at fire time by hero._start_blast when the
# relic was owned at cast. Locked at fire time so a late pickup doesn't
# retroactively buff in-flight orbs. Evaluated against the target's HP
# ratio in _on_body_entered (the only point at which the projectile knows
# WHO it's about to hurt).
var executioner_active: bool = false

# Iter 43 — crit flag locked at spawn (hero._spawn_blast_projectile
# rolls _roll_crit per projectile). Passed to enemy.take_hit so the
# crit damage number renders correctly. Same locked-at-fire pattern
# as executioner_active so a relic gained mid-flight doesn't
# retroactively crit.
var is_crit: bool = false
# Iter 43 — burn duration locked at spawn (0 = no burn). hero reads
# burn_chance_f at spawn time, rolls, sets duration if successful.
# Projectile applies the burn on hit alongside the damage.
var burn_duration: float = 0.0
# Iter 46 — slow duration locked at spawn (0 = no slow). Same locked-
# at-fire pattern as burn. Projectile applies slow on every enemy it
# touches (pierce + ricochet propagate the proc across all hits).
var slow_duration: float = 0.0
# Iter 65 — BLAST × FLAME ability evolution. Locked at spawn from the
# hero's FLAME theme tier (0 = none, 0.5s = tier 1, 0.8s = tier 2).
# On enemy hit, projectile spawns a FirePool at the impact point with
# this `_life`. Same locked-at-fire pattern as burn/slow so a relic
# picked up mid-flight doesn't retroactively buff in-flight orbs.
var flame_impact_pool_life: float = 0.0
# Iter 67 — BLAST × STORM ability evolution. Locked at spawn from the
# hero's STORM theme tier:
#   tier 1 (≥2 STORM relics): chain to 1 enemy within 120px, full dmg.
#   tier 2 (≥4 STORM relics): chain to 2 enemies within 160px, 0.6× dmg.
# Same locked-at-spawn pattern as burn/slow/flame_impact_pool_life so a
# relic picked up mid-flight doesn't retroactively buff in-flight orbs.
# storm_chain_dmg_mul lets tier 2 use a 60% chain damage modifier while
# tier 1 keeps full damage on its single chain link.
var storm_chain_count: int = 0
var storm_chain_radius: float = 0.0
var storm_chain_dmg_mul: float = 1.0

# Iter 41 — pierce + ricochet mechanics. Both are set by hero._start_blast
# at cast time from STORM-themed relics ("piercing_quarrel" → pierce,
# "ricochet_talisman" → ricochet) so adding a new pierce/bounce relic
# is a single GameState.modifier_total read on the spawn side.
#
# pierce_count: max enemies the projectile can pass through before
#   queue_free. 0 (default) = first hit ends the projectile (iter-30
#   baseline). 1+ = pass through that many enemies.
#
# ricochet_count: max bounces to nearby unhit enemies after a regular
#   hit. 0 (default) = no bounce. On bounce: redirect velocity toward
#   the nearest enemy NOT in _hit_ids within RICOCHET_RANGE and decrement
#   the counter. Out of bounces or no eligible target = queue_free.
#
# pierce and ricochet STACK: a projectile with pierce=1 + ricochet=1
# pierces enemy A, hits enemy B, bounces to enemy C, hits C, queue_frees.
# Per-hit damage stays at `damage` for both (no falloff).
const RICOCHET_RANGE: float = 200.0
var pierce_count: int = 0
var ricochet_count: int = 0
# Track which enemies this projectile has already hit so pierce + ricochet
# can't loop back to a previous target.
var _hit_ids: Dictionary = {}

@onready var glow: PointLight2D = $PointLight2D
@onready var orb: Sprite2D = $Sprite2D
var _life := LIFETIME
# Iter 60 — projectile damage-scale factor cached for _physics_process to
# apply to glow energy each frame (since _physics_process overwrites
# glow.energy unconditionally per lifetime, the spawn-time energy
# bump would be lost otherwise).
var _dmg_scale: float = 1.0

func _ready() -> void:
	body_entered.connect(_on_body_entered)
	# Configure collisions based on who we're meant to hurt.
	# Layer naming (project.godot): 1=world, 2=hero, 3=enemies, 4=hero_attack
	# Always hit world walls (1). Plus the target's layer:
	#   target=enemies → mask=1+4=5 (world + enemies layer 3)
	#   target=hero    → mask=1+2=3 (world + hero layer 2)
	collision_mask = 1 + (4 if target_group == "enemies" else 2)
	# Place self on the matching attack layer so anything that filters
	# "incoming attacks" can pick us out.
	collision_layer = 8 if target_group == "enemies" else 16
	# Apply tint + light color from per-cast configuration.
	if orb != null:
		orb.modulate = orb_tint
	if glow != null:
		glow.color = orb_tint
	# Align visuals to flight direction.
	if velocity.length() > 0.0:
		rotation = velocity.angle()
	# Iter 19 — spawn-pop. Start at 60% scale and ease out to full
	# size over 50 ms. Combined with the muzzle flash spawned by
	# hero.gd at the same world position, the launch reads as a
	# punctuated "BANG fire" instead of "projectile fades in".
	# Iter 60 — final scale also reflects DAMAGE so upgrades are
	# visually legible. Base damage=1 → scale 1.0; each +1 damage adds
	# +20% size, capped at +60% (so a damage-4+ projectile reads as
	# ~"bullet 60% larger" without becoming so big it covers the room).
	# This makes Arcane Pulse (+1) feel like an actual upgrade —
	# previously the orb looked identical to a base blast.
	# Also bake glow energy bump so the visual+light scale together.
	_dmg_scale = 1.0 + clampf(float(damage - 1) * 0.20, 0.0, 0.60)
	# Iter 61 — ability SHAPE evolution. The mechanics flags set on the
	# projectile at spawn (pierce_count, ricochet_count) drive visible
	# shape changes so the player can SEE what their projectile does:
	#   pierce > 0    → elongated along velocity (arrow-like)
	#   ricochet > 0  → outer ring halo (bouncy)
	#   both          → elongated arrow with halo (a "homing dart")
	# Visual reads at a glance — a player who picked up Piercing Quarrel
	# sees their blast morph into a longer streak immediately on next cast.
	var aspect_x: float = 1.0
	var aspect_y: float = 1.0
	if pierce_count > 0:
		# Stretch along the velocity axis (sprite is rotated to face
		# velocity in _ready, so .x is along the flight path).
		aspect_x = 1.40
		aspect_y = 0.85
	var target_scale: Vector2 = Vector2(aspect_x, aspect_y) * _dmg_scale
	scale = Vector2(0.6, 0.6) * _dmg_scale
	var tw: Tween = create_tween()
	tw.set_trans(Tween.TRANS_QUAD)
	tw.set_ease(Tween.EASE_OUT)
	tw.tween_property(self, "scale", target_scale, 0.05)
	# Ricochet halo — outer Line2D ring drawn around the orb. Scales
	# with damage too (matches the orb glow size). Only built when
	# ricochet_count > 0; absence means base orb shape.
	if ricochet_count > 0:
		_build_ricochet_halo()

# Iter 61 — build a circular halo ring around the projectile to signal
# "this one bounces". Done as a Line2D so the ring stays a thin
# outline (not a filled disc that'd cover the orb). Color matches
# orb_tint so the halo reads as part of the projectile, not a
# separate floating ring.
func _build_ricochet_halo() -> void:
	var halo: Line2D = Line2D.new()
	# 12-vert near-circle at radius 14 (in projectile local space).
	var r: float = 14.0
	var pts: PackedVector2Array = PackedVector2Array()
	var n: int = 12
	for i in range(n + 1):
		var a: float = (TAU / float(n)) * float(i)
		pts.append(Vector2(cos(a) * r, sin(a) * r))
	halo.points = pts
	halo.width = 2.0
	halo.default_color = Color(orb_tint.r, orb_tint.g, orb_tint.b, 0.85)
	halo.joint_mode = 2   # Line2D.LINE_JOINT_ROUND
	halo.antialiased = true
	# z below sprite so the orb draws on top of the rim (cleaner read).
	halo.z_index = -1
	add_child(halo)

func _physics_process(delta: float) -> void:
	global_position += velocity * delta
	_life -= delta
	if _life <= 0.0:
		queue_free()
	if glow != null:
		# Iter 60 — scale base energy by damage so a +damage build's
		# projectiles glow brighter (matches their larger silhouette).
		glow.energy = max(0.3, 1.6 * _dmg_scale * (_life / LIFETIME))

func _on_body_entered(body: Node) -> void:
	# Wall (or any non-target body) — always ends the projectile.
	# Pierce and ricochet only apply to target_group hits.
	if not body.is_in_group(target_group):
		queue_free()
		return
	# Don't re-hit an enemy we already pierced/ricocheted off of.
	# Defends against the projectile registering multiple body_entered
	# in the same frame on a single enemy (Area2D weirdness).
	var bid: int = body.get_instance_id()
	if _hit_ids.has(bid):
		return
	_hit_ids[bid] = true
	# Enemies expose take_hit; hero exposes take_damage. Both are
	# safe-to-call no-ops if missing.
	var dmg_out: int = damage
	# executioner — gate ONLY on enemy bodies (skip for friendly-fire
	# orbs aimed at "hero"). 25% HP threshold matches the melee path.
	if executioner_active and target_group == "enemies" and _is_low_hp(body):
		dmg_out = int(round(float(damage) * 2.5))
	if body.has_method("take_hit"):
		body.take_hit(dmg_out, is_crit)
	elif body.has_method("take_damage"):
		# Hero is the only body without take_hit. Pass the projectile's
		# global_position as the damage source so hero knockback shoves
		# the player AWAY from the incoming arrow / orb, not along a
		# facing-inversion guess (iter-70 polish).
		body.take_damage(dmg_out, global_position)
	# Iter 43 — projectile burn application. Locked at spawn from
	# hero's burn_chance_f roll. Apply alongside the damage so a
	# pierce/ricochet projectile burns every enemy it traverses.
	if burn_duration > 0.0 and body.has_method("apply_burn"):
		body.apply_burn(burn_duration)
	# Iter 46 — projectile slow application. Same locked-at-spawn
	# pattern as burn. Pierce/ricochet propagate the slow across all
	# hits on the projectile's path.
	if slow_duration > 0.0 and body.has_method("apply_slow"):
		body.apply_slow(slow_duration)
	# Iter 65 — BLAST × FLAME ability evolution. Hero owns ≥2 FLAME
	# relics → tier 1 spawns a 0.5s mini-pool; ≥4 → tier 2 spawns a
	# 0.8s pool. Only fires on ENEMY impact (skip for friendly-fire
	# orbs aimed at the hero). Pool is hosted on get_parent() (main
	# scene root) so it persists after the projectile queue_frees on
	# the last hit. _life set BEFORE add_child so fire_pool's
	# _physics_process uses the overridden lifetime, matching iter 61
	# / iter 64's host pattern.
	if flame_impact_pool_life > 0.0 and target_group == "enemies":
		var host: Node = get_parent()
		if host != null:
			var pool: Node2D = FIRE_POOL_SCENE.instantiate() as Node2D
			if pool != null:
				pool.global_position = global_position
				pool.set("_life", flame_impact_pool_life)
				host.add_child(pool)
	# Iter 67 — BLAST × STORM chain lightning. Only fires on ENEMY impact
	# (skip for friendly-fire orbs aimed at the hero) and only if the
	# count + radius were locked > 0 at spawn (STORM theme tier ≥ 1).
	# Finds the N nearest enemies within radius using the same group-iter
	# pattern as _redirect_to_nearest_enemy / hero._try_chain_from — the
	# project's consistent "find enemies near me" pattern. Skips the just-
	# hit body so the chain can't loop back to the original target, and
	# applies damage via take_hit directly (NOT a fresh Projectile spawn)
	# to guarantee single-hop semantics with no risk of an infinite chain.
	# Chain arc visuals are hosted on get_parent() so they persist after
	# the projectile queue_frees on the last pierce/ricochet hit.
	if storm_chain_count > 0 and target_group == "enemies":
		_fire_storm_chains(body)
	# Iter 41 — pierce > ricochet > queue_free. Pierce takes priority
	# because it's "keep going in a straight line" (no velocity change);
	# ricochet is a fallback that REDIRECTS velocity when pierce is out.
	# This ordering means a pierce+ricochet projectile uses pierces first
	# (cheap straight shots) then bounces (more dramatic) — reads as a
	# satisfying progression rather than a single ambiguous behavior.
	if pierce_count > 0:
		pierce_count -= 1
		return
	if ricochet_count > 0 and target_group == "enemies":
		var found: bool = _redirect_to_nearest_enemy()
		if found:
			ricochet_count -= 1
			return
	queue_free()

# Iter 41 — pick the nearest enemy NOT already hit, within RICOCHET_RANGE,
# and aim velocity at them while preserving speed. Returns true if a
# new target was selected (caller decrements ricochet_count); false
# means no eligible target → caller queue_frees.
func _redirect_to_nearest_enemy() -> bool:
	var tree: SceneTree = get_tree()
	if tree == null:
		return false
	var best: Node = null
	var best_dist: float = RICOCHET_RANGE
	for enemy in tree.get_nodes_in_group("enemies"):
		if not is_instance_valid(enemy):
			continue
		if _hit_ids.has(enemy.get_instance_id()):
			continue
		var d: float = enemy.global_position.distance_to(global_position)
		if d < best_dist:
			best_dist = d
			best = enemy
	if best == null:
		return false
	var to_target: Vector2 = best.global_position - global_position
	if to_target.length() < 0.1:
		return false
	# Preserve speed; just redirect.
	var speed: float = velocity.length()
	if speed < 1.0:
		speed = SPEED
	velocity = to_target.normalized() * speed
	# Align sprite + spawn-pop a brief visual cue so the bounce reads.
	rotation = velocity.angle()
	var tw: Tween = create_tween()
	tw.set_trans(Tween.TRANS_QUAD)
	tw.set_ease(Tween.EASE_OUT)
	tw.tween_property(self, "scale", Vector2(1.25, 1.25), 0.06)
	tw.tween_property(self, "scale", Vector2.ONE, 0.10)
	return true

# executioner helper — duplicated shape of hero._is_executable so the
# projectile can evaluate at impact without coupling to the hero node.
# Reads body.hp (int) and body.enemy_type.max_hp (int); returns false
# defensively on missing fields so a degenerate enemy never crashes.
func _is_low_hp(body: Node) -> bool:
	if not is_instance_valid(body):
		return false
	if not ("hp" in body):
		return false
	var cur_hp: int = int(body.get("hp"))
	var max_val: int = 0
	if "enemy_type" in body:
		var et: Variant = body.get("enemy_type")
		if et != null and "max_hp" in et:
			max_val = int(et.get("max_hp"))
	if max_val <= 0:
		return false
	var ratio: float = float(cur_hp) / float(max_val)
	return ratio < 0.25

# Iter 67 — Fire STORM chain bolts off an impact. Picks the storm_chain_count
# nearest enemies within storm_chain_radius of the impact point (NOT the
# projectile's current position, since the projectile may briefly move
# past the body in the same physics step). Each chain link applies
# `damage * storm_chain_dmg_mul` via take_hit (NOT a new projectile —
# we want single-hop, no infinite recursion), spawns a ChainArc visual
# from impact → target, and is excluded from subsequent picks this hit.
# `source_body` is the body the projectile just hit; we add it to the
# exclusion set + _hit_ids so pierce/ricochet doesn't re-find it either.
func _fire_storm_chains(source_body: Node) -> void:
	if storm_chain_count <= 0 or storm_chain_radius <= 0.0:
		return
	var tree: SceneTree = get_tree()
	if tree == null:
		return
	var host: Node = get_parent()
	# Track which enemies have already been chained from this single
	# impact so picking the "next nearest" can't double-target. Seed with
	# the source body's instance id so the chain doesn't loop back.
	var chained: Dictionary = {}
	if is_instance_valid(source_body):
		chained[source_body.get_instance_id()] = true
	var impact_pos: Vector2 = global_position
	var chain_dmg: int = maxi(1, int(round(float(damage) * storm_chain_dmg_mul)))
	# Run up to storm_chain_count passes, each picking the nearest enemy
	# NOT yet chained this impact. Stops early if no eligible target
	# remains (out of enemies, or all the nearby ones already chained).
	for _i in range(storm_chain_count):
		var best: Node = null
		var best_dist: float = storm_chain_radius
		for enemy in tree.get_nodes_in_group("enemies"):
			if not is_instance_valid(enemy):
				continue
			var eid: int = enemy.get_instance_id()
			if chained.has(eid):
				continue
			# Also skip enemies already hit by this projectile (pierce/
			# ricochet) — chaining to one of them would feel like wasted
			# bolts when the player can see the same enemy already
			# exploded.
			if _hit_ids.has(eid):
				continue
			var d: float = enemy.global_position.distance_to(impact_pos)
			if d < best_dist:
				best_dist = d
				best = enemy
		if best == null:
			break
		chained[best.get_instance_id()] = true
		# Apply chain damage directly via take_hit (no projectile spawn,
		# no further storm_chain_count propagation — single-hop chain).
		# Pass is_crit forward so the visual crit beat carries through.
		if best.has_method("take_hit"):
			best.take_hit(chain_dmg, is_crit)
		# Spawn ChainArc visual on the parent host so it survives our
		# queue_free. Skip if no host (test mode without a parent — keep
		# damage application but no visual rather than crashing).
		if host != null:
			var arc: Node = CHAIN_ARC_SCENE.instantiate()
			if arc != null:
				# setup() before add_child so _ready() sees the
				# endpoints when it builds the line geometry.
				if arc.has_method("setup"):
					arc.call("setup", impact_pos, best.global_position)
				host.add_child(arc)
