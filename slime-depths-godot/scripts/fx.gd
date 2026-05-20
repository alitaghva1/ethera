# FX — autoload. Listens to Events and applies game-feel polish:
# camera shake + spawns the right particle scene at the right place.
#
# Why an autoload (vs a node in main.tscn): camera shake + particles
# follow the *active* scene, and the player moves between hamlet and
# dungeon (and on death, back). Keeping FX as a singleton means
# nothing has to re-wire between scene swaps — the signal bus stays
# live across `change_scene_to_file`, and we re-resolve the Camera2D
# lazily.
#
# Camera shake approach: we tween `camera.offset` from a noisy starting
# value back to (0,0) over a short window. Crucially, the tween *ends*
# at (0,0) so a hard cut from one shake to another can't leave the
# camera permanently offset. Stomping any in-flight tween before
# starting a new one keeps overlapping events (e.g. enemy_hit during
# enemy_died) from compounding into nausea-shake.
#
# Particles use CPUParticles2D, not GPUParticles2D, on purpose. The
# project runs the GL Compatibility renderer (see project.godot), which
# does NOT support GPUParticles2D properly. CPUParticles2D works
# everywhere and the volumes we're spawning are tiny (≤16 particles).
extends Node

const HIT_SPARK_SCENE: PackedScene    = preload("res://scenes/fx/hit_spark.tscn")
const DEATH_BURST_SCENE: PackedScene  = preload("res://scenes/fx/death_burst.tscn")
const BLOOD_DROP_SCENE: PackedScene   = preload("res://scenes/fx/blood_drop.tscn")
# iter-143: dedicated gold-ring + spark celebration for relic / shrine
# pickups. Gold chest pickups keep the smaller hit_spark behavior so
# gold-drop frequency doesn't visually inflate (every "gold" pickup
# popping with a full ring would devalue the celebration moment).
const PICKUP_BURST_SCENE: PackedScene = preload("res://scenes/fx/pickup_burst.tscn")
# iter-146: heal sparkle — green upward-drift particles spawned at
# hero position whenever heal() actually gained HP. Pairs with iter-
# 113's HUD heart-row green pulse so heals read both in-HUD and
# in-world. Reuses hit_spark.gd (just a queue_free timer) — only the
# scene's color ramp + gravity differ.
const HEAL_SPARKLE_SCENE: PackedScene = preload("res://scenes/fx/heal_sparkle.tscn")
# iter-95: DODGE_DUST_SCENE removed — dodge ability deleted. The dust
# puff was tied to the dodge motion; dash_strike (now the only defensive
# movement) already spawns its own dash_trail particle trail behind the
# hero.

# Cached camera reference. Camera gets re-resolved whenever it's null /
# freed — cheap, and survives scene changes without explicit reconnection.
var _camera: Camera2D = null

# ── Iter 180 — trauma-based screen shake ─────────────────────────────
# Replaces the iter-30 4-hop tween shake. Trauma model (Squirrel
# Eiserloh / KidsCanCode recipe): each "punch" event adds to a 0..1
# trauma counter; the per-frame camera offset is sampled from
# FastNoiseLite, scaled by trauma^2 (squaring keeps tiny hits subtle
# and big hits violent), and trauma decays linearly at TRAUMA_DECAY/s.
# Multiple punches in quick succession ADD rather than fight each
# other (the old tween path stomped every prior shake, so a hit during
# an enemy_died had its shake cancelled). _process drives the offset
# every frame; when trauma reaches 0 the offset snaps back to (0,0).
#
# MAX_OFFSET = absolute peak pixel displacement at trauma=1.0. Tuned
# down from the iter-30 raw amps (peaked at ~18 px in a single hop)
# because the noise-driven path samples continuously — sustained 18 px
# reads as nausea, while a 16 px peak with quadratic falloff reads as
# a solid punch then settles.
const MAX_OFFSET: float = 16.0
const TRAUMA_DECAY: float = 1.6
# Higher = faster shake oscillation. 22 reads as a "rapid punch" — low
# enough to not look like static, high enough to feel violent.
const NOISE_SPEED: float = 22.0

var _trauma: float = 0.0
var _shake_time: float = 0.0
var _noise: FastNoiseLite = null

func _ready() -> void:
	# Iter 180 — initialize the noise generator once. FastNoiseLite default
	# is SIMPLEX_SMOOTH at frequency 0.01; we override frequency to 1.0 and
	# control "speed" via the time multiplier in _process so the same noise
	# field works at any framerate.
	_noise = FastNoiseLite.new()
	_noise.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	_noise.frequency = 1.0
	# Random seed so back-to-back runs don't shake identically (cosmetic;
	# without this every fresh game starts with the same noise pattern).
	_noise.seed = randi()
	# Connect once at game start. _ready on an autoload only fires the
	# single time, so there's no risk of duplicate connections — but we
	# CONNECT_PERSIST would also be wrong here (autoloads outlive every
	# scene anyway, so they wouldn't be cleared even without the flag).
	Events.hero_damaged.connect(_on_hero_damaged)
	# iter-95: hero_dodged subscriber removed alongside the dodge ability.
	# Audio + screen flash still react to the renamed hero_shielded signal
	# (raised + caught beats); this FX layer has no DODGE_DUST_SCENE to
	# spawn anymore.
	Events.hero_attacked.connect(_on_hero_attacked)
	Events.hero_blasted.connect(_on_hero_blasted)
	Events.enemy_hit.connect(_on_enemy_hit)
	Events.enemy_died.connect(_on_enemy_died)
	Events.pickup_claimed.connect(_on_pickup_claimed)
	Events.hero_died.connect(_on_hero_died)
	# iter-146: world-space heal sparkle.
	Events.hero_healed.connect(_on_hero_healed)

# ── Camera resolve + shake ────────────────────────────────────────────

# Find the active Camera2D via tree-walk. We use find_child on the
# current_scene (rather than caching at _ready) because the camera
# lives inside the dungeon's Hero, not the autoload — and scene swaps
# (hamlet → dungeon → hamlet on death) replace it each time. The
# recursive find is O(scene-tree-size) but only runs when our cached
# reference is stale, so it's a non-issue in practice.
func _get_camera() -> Camera2D:
	if is_instance_valid(_camera):
		return _camera
	var scene := get_tree().current_scene
	if scene == null:
		return null
	var found := scene.find_child("Camera2D", true, false)
	if found is Camera2D:
		_camera = found
		return _camera
	return null

# Iter 180 — canonical trauma entry point. Callers use this when they
# already know a magnitude in trauma units (0.0 = nothing, 1.0 =
# maximum violent shake). Most existing callers go through `shake`
# (amp/dur back-compat path) which converts amp → trauma internally.
func add_trauma(amount: float) -> void:
	# Iter 221 / Beta M2 — accessibility intensity gate. The settings
	# screen-shake slider (0.0 → 1.0) scales every incoming trauma. A
	# player who is shake-sensitive can drop it to 0.0 and the camera
	# never shakes. Default 1.0 preserves the existing feel exactly.
	# Read at call time so changes apply immediately on slider drag.
	var scale: float = 1.0
	if Engine.has_singleton("GameState") or Engine.get_main_loop().root.has_node("/root/GameState"):
		var gs: Node = Engine.get_main_loop().root.get_node("/root/GameState")
		if gs != null and "screen_shake_intensity" in gs:
			scale = clampf(float(gs.screen_shake_intensity), 0.0, 1.0)
	_trauma = clampf(_trauma + amount * scale, 0.0, 1.0)

# Back-compat shake API. The amp/dur arguments are legacy from the
# iter-30 tween-based shake; we now convert amp to a trauma value and
# ignore dur (trauma decays at a fixed rate so all shake events share
# one cohesive feel). amp/20 → trauma roughly matches the old
# amp-magnitudes:
#   amp  →  trauma  → trauma²  (offset multiplier)
#   1.8  →   0.09   →   0.008  (wave-clear blip, barely visible)
#   4.0  →   0.20   →   0.040  (chip kill)
#   6.0  →   0.30   →   0.090  (normal kill)
#   12.0 →   0.60   →   0.360  (hero damaged — solid punch)
#   18.0 →   0.90   →   0.810  (hero died — violent)
# The quadratic curve is what makes Hades-style juice possible: small
# events stay readable, big events feel earned.
func shake(amp: float, dur: float) -> void:
	# `dur` accepted for API compatibility but unused — trauma curve has
	# its own decay rate. Underscore prefix dropped because callers
	# pass real values.
	var _ignored: float = dur
	add_trauma(clampf(amp / 20.0, 0.0, 1.0))

# Internal alias kept so the prior `_shake` name still works if any
# call site uses it. Public path is `shake` or `add_trauma`.
func _shake(amp: float, dur: float) -> void:
	shake(amp, dur)

# Per-frame trauma decay + camera offset sample. Runs every tick.
# Three noise samples (offset on two separate "y" rows of the field
# so they're decorrelated) drive x/y offset. Trauma squared keeps
# small hits subtle; raw trauma would over-shake on light feedback.
func _process(delta: float) -> void:
	if _trauma <= 0.0:
		# Idle path. If a camera was previously shaken and we drifted to
		# exactly 0 trauma, ensure the offset is fully reset so we don't
		# leave a sub-pixel residual after the noise samples settle.
		var cam_idle := _get_camera()
		if cam_idle != null and cam_idle.offset != Vector2.ZERO:
			cam_idle.offset = Vector2.ZERO
		return
	_trauma = maxf(0.0, _trauma - TRAUMA_DECAY * delta)
	_shake_time += delta
	var cam := _get_camera()
	if cam == null:
		return
	var t: float = _shake_time * NOISE_SPEED
	var shake_curve: float = _trauma * _trauma
	# Sample two decorrelated rows of the noise field for x/y. The y=0
	# vs y=137.0 rows are far enough apart in FastNoiseLite's simplex
	# space that they read as independent without needing a 3-axis noise.
	var off_x: float = _noise.get_noise_2d(t, 0.0) * MAX_OFFSET * shake_curve
	var off_y: float = _noise.get_noise_2d(t, 137.0) * MAX_OFFSET * shake_curve
	cam.offset = Vector2(off_x, off_y)

# ── Particle helpers ──────────────────────────────────────────────────

# Iter 181 — programmatic radial impact ring. Used by _on_enemy_hit (and
# any future hit-feedback call site) to spawn a brief soft cream/gold
# pop at impact location. Built inline rather than as a .tscn:
#   • Stateless visual (one gradient + scale tween + fade tween + free)
#     — a 9-line function reads cleaner than a 30-line scene file.
#   • Procedural GradientTexture2D = no asset to maintain, color/falloff
#     all tunable in one place.
#   • z_index 6 puts it above ground decor (z 0) and floor chrome (z 1)
#     but below the hero (default z 0 in canvas with manual ordering;
#     hit spark is z 4) — the ring is meant to PAIR with the spark, not
#     drown it.
# scale_factor lets future callers spawn bigger rings for boss / heavy
# hits without each hit-handler reimplementing the gradient math.
func _spawn_impact_ring(world_pos: Vector2, scale_factor: float = 1.0) -> void:
	var scene := get_tree().current_scene
	if scene == null:
		return
	var grad: Gradient = Gradient.new()
	grad.offsets = PackedFloat32Array([0.0, 0.55, 0.82, 1.0])
	# Warm cream center fading through gold to transparent. The 0.55
	# offset is where the bright rim sits — pre-rim mostly transparent,
	# post-rim quick falloff. Result is a "ring" rather than a "ball."
	grad.colors = PackedColorArray([
		Color(1.0, 0.95, 0.85, 0.0),
		Color(1.0, 0.92, 0.72, 0.55),
		Color(1.0, 0.78, 0.45, 0.30),
		Color(1.0, 0.78, 0.45, 0.0),
	])
	var tex: GradientTexture2D = GradientTexture2D.new()
	tex.gradient = grad
	tex.width = 96
	tex.height = 96
	tex.fill = GradientTexture2D.FILL_RADIAL
	tex.fill_from = Vector2(0.5, 0.5)
	tex.fill_to = Vector2(1.0, 0.5)
	var ring: Sprite2D = Sprite2D.new()
	ring.texture = tex
	ring.global_position = world_pos
	ring.scale = Vector2(0.25, 0.25) * scale_factor
	ring.modulate.a = 1.0
	ring.z_index = 6
	scene.add_child(ring)
	# Scale up + fade out in parallel over 140 ms. EASE_OUT on scale so
	# the ring expands FAST then slows (like an air shockwave); EASE_IN
	# on alpha so it stays bright early and fades late, peaking the
	# visual at the same moment the shader hit-flash peaks.
	var tw: Tween = create_tween().set_parallel(true)
	tw.tween_property(ring, "scale", Vector2(1.4, 1.4) * scale_factor, 0.14)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(ring, "modulate:a", 0.0, 0.14)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	# Free after the parallel batch finishes. Chain a non-parallel
	# callback so it runs once both tweens are done, not midway.
	tw.chain().tween_callback(ring.queue_free)

# Spawn a particle scene at world_pos. Parented to the active scene so
# the particle is part of the same coordinate space as the gameplay —
# attaching to `self` (the FX autoload) would put it outside any
# scene-camera transforms and it would render at a wrong screen pos.
# The particle scene's own script is responsible for queue_free'ing
# itself after its lifetime (see scripts/hit_spark.gd etc.).
func _spawn(scene: PackedScene, world_pos: Vector2, rot: float = 0.0) -> Node2D:
	# `rot` param name avoids shadowing Node2D.rotation (SHADOWED_VARIABLE
	# warning in Godot 4 if we named it the same as the property we set).
	var inst: Node2D = scene.instantiate()
	inst.global_position = world_pos
	inst.rotation = rot
	var parent := get_tree().current_scene
	if parent == null:
		# Extremely defensive — current_scene is null only during scene
		# changes, but we don't want a crash if an event fires mid-swap.
		inst.queue_free()
		return null
	parent.add_child(inst)
	return inst

# ── Signal handlers ───────────────────────────────────────────────────

func _on_hero_damaged(world_pos: Vector2) -> void:
	_shake(12.0, 0.18)
	_spawn(BLOOD_DROP_SCENE, world_pos)

func _on_hero_attacked(_world_pos: Vector2, _aim: Vector2) -> void:
	# Sword swings don't shake on their own — only the hits matter,
	# and those are handled by enemy_hit. We don't spawn particles
	# here either right now (the swing arc is the visual). Hook left
	# in place so future content (slash whoosh, weapon-trail) can land
	# in one spot. Params prefixed with `_` to silence Godot's
	# UNUSED_PARAMETER warning until we wire content in.
	pass

func _on_hero_blasted(_world_pos: Vector2, _aim: Vector2) -> void:
	# Same as above — the projectile itself is the VFX. Reserved for
	# future muzzle-flash content.
	pass

func _on_enemy_hit(world_pos: Vector2) -> void:
	# iter-81 (Workstream A): shake was uniform 4.0/0.06 regardless of
	# damage — a 1-dmg nick on a boss looked identical to a crushing
	# crit. AttackFeel.apply_hit_feedback_tier (called from enemy.gd's
	# take_hit) now drives shake scaled by damage/max_hp ratio. This
	# handler keeps spawning the baseline hit_spark (every hit deserves
	# at least one visible spark), but the shake is the tier system's
	# job now.
	_spawn(HIT_SPARK_SCENE, world_pos)
	# Iter 181 — radial "impact pop": a soft warm-cream ring that
	# scales from 0.25 → 1.4 and fades out over 140 ms. Pairs with
	# the shader hit-flash (in enemy.gd take_hit) to sell the impact
	# moment. Single-frame instantiated Sprite2D with a procedural
	# radial gradient — no scene file needed for a stateless effect.
	_spawn_impact_ring(world_pos)

func _on_enemy_died(world_pos: Vector2) -> void:
	# iter-141: the burst spawn + shake moved to spawn_enemy_kill_burst,
	# which enemy.gd calls directly with size + heavy-kill info. Without
	# that data the burst was uniform — a 1-HP slime popped identically
	# to a boss. Keeping this stub so the existing `Events.enemy_died`
	# connection still binds (other autoloads / future audio polish may
	# care about the position alone), but the visual work happens in the
	# new path.
	pass

# iter-141 — Hades/Isaac-tier kill burst. enemy.gd calls this directly
# at death-emit time with the enemy's sprite_scale and an is_heavy flag
# (boss or max_hp >= 8). The burst's visual chunkiness scales with the
# enemy's size, so trash mobs pop modest while bosses pop big — the
# combat scene has consistent grammar instead of a 16-particle uniform
# blip regardless of what just died.
#
# scale_factor    enemy_type.sprite_scale (clamped 0.85..1.4 — bounded
#                 so a max-scale boss doesn't dominate the screen and a
#                 min-scale enemy still reads chunky)
# is_heavy        if true: shake amp/time goes 6.0/0.12 → 9.0/0.16, plus
#                 3 white "flash core" sparks land at small radius
#                 BEFORE the falling red embers — that white-flash beat
#                 is what makes boss/elite kills FEEL fundamentally
#                 different from a chip kill in Hades / Isaac
func spawn_enemy_kill_burst(world_pos: Vector2, scale_factor: float, is_heavy: bool) -> void:
	var clamped: float = clampf(scale_factor, 0.85, 1.4)
	# Spawn the burst scene; we need to set scale on the instance, so we
	# inline the spawn (vs _spawn helper that just spawns + positions).
	var scene := get_tree().current_scene
	if scene != null:
		var burst: Node2D = DEATH_BURST_SCENE.instantiate() as Node2D
		if burst != null:
			burst.global_position = world_pos
			burst.scale = Vector2(clamped, clamped)
			scene.add_child(burst)
	# Heavy kills: white flash-core layer + heavier shake. The 3 sparks
	# land within an 8 px radius so they read as a single bright pulse,
	# not as a second ring (the iter-138 crit splash IS a ring; we don't
	# want death bursts to mimic crit splashes — they live in different
	# beats).
	if is_heavy:
		_shake(9.0, 0.16)
		if scene != null:
			for i in range(3):
				var ang: float = randf() * TAU
				var r: float = randf() * 8.0
				var s: Node2D = HIT_SPARK_SCENE.instantiate() as Node2D
				if s != null:
					s.global_position = world_pos + Vector2(cos(ang), sin(ang)) * r
					s.modulate = Color(1.4, 1.35, 1.05, 1.0)  # HDR white core
					scene.add_child(s)
	else:
		_shake(6.0, 0.12)

func _on_pickup_claimed(world_pos: Vector2, _name: String) -> void:
	# iter-143: route by pickup importance.
	#   • Relics (anything in GameState.RELIC_REGISTRY) → PICKUP_BURST
	#     concentric gold rings + 14 chunky sparks. Mirrors main.gd's
	#     own filter at _on_pickup_claimed line ~2580 — these are the
	#     genuine acquisitions worth celebrating.
	#   • Shrines ("shrine_*") → also PICKUP_BURST. The free-stat pickup
	#     is rare enough to merit the same celebration.
	#   • Everything else (gold drops from chests, future keys, etc.) →
	#     small HIT_SPARK like before. Gold drops are FREQUENT — a full
	#     ring every chest break would inflate the visual language and
	#     drown out actual relic claims.
	var is_relic: bool = GameState.RELIC_REGISTRY.has(_name)
	var is_shrine: bool = _name.begins_with("shrine_")
	if is_relic or is_shrine:
		_spawn(PICKUP_BURST_SCENE, world_pos)
	else:
		_spawn(HIT_SPARK_SCENE, world_pos)

func _on_hero_died(world_pos: Vector2) -> void:
	_shake(18.0, 0.4)
	_spawn(DEATH_BURST_SCENE, world_pos)

# iter-146: world-space heal feedback. Spawns the green upward-drift
# sparkle at the hero position. The `amount` is currently unused
# visually — small heals and big heals get the same sparkle — because
# the iter-113 HUD heart-row green pulse already conveys magnitude
# (pip count change). Future polish could scale the sparkle amount
# proportionally, but the current 10-particle baseline reads cleanly
# at any heal size.
func _on_hero_healed(world_pos: Vector2, _amount: int) -> void:
	_spawn(HEAL_SPARKLE_SCENE, world_pos)
