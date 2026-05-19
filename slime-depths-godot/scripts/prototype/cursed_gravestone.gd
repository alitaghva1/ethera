# CursedGravestone — the prototype's core mechanic. A heavy RigidBody2D
# tethered to ToyHero via a damped spring. Hold the pull input to yank
# the gravestone toward the player; release to let it carry momentum.
# When it slams into an enemy above MIN_DAMAGE_VEL, the enemy takes a
# hit and gets knocked back.
#
# Physics design — damped spring with two stiffness modes:
#
#   IDLE     low stiffness (rest length = TETHER_REST_LENGTH).
#            The gravestone trails behind the player at ~140 px,
#            settling there as you walk around.
#
#   PULLING  high stiffness (rest length = 0).
#            The spring's rest position collapses to the player's
#            location, so the gravestone accelerates inward. If the
#            player rotates while pulling, the gravestone swings in a
#            circular arc — that's the "swing" feel.
#
# Hooke's law (F = k * extension along player-gravestone axis) plus
# linear damping (F_d = -c * velocity) bleeds off oscillation. The
# damping is HANDLED MANUALLY in _physics_process — built-in linear_damp
# would compound and fight the spring's tuning.
#
# A hard distance cap (MAX_TETHER_LENGTH) snaps the gravestone back
# if it drifts beyond reach — happens at full player speed across the
# room. Without it the gravestone would whip violently and never
# settle.
#
# Collision setup:
#   Gravestone layer 8 (hero_attack), mask = 1 + 4 = 5
#     → collides with world walls AND enemies
#     → does NOT collide with hero (hero is layer 2, not in mask)
#       so the tether doesn't tangle on the player's own collider.
#
# Hit detection: contact_monitor + body_entered. On enter, if the body
# is in the "toy_enemies" group AND linear velocity exceeds
# MIN_DAMAGE_VEL, call body.take_hit(impact_vel, knockback_impulse).
class_name CursedGravestone
extends RigidBody2D

# ── Tether tuning ────────────────────────────────────────────────────
# Retuned for the readability pass — smaller room (680×440 interior)
# means shorter rest length, tighter cap. Gravestone starts ~100 px
# from hero so it reads "leashed" from the first frame.
const TETHER_REST_LENGTH: float = 100.0
const PULL_STIFFNESS_IDLE: float = 22.0
const PULL_STIFFNESS_ACTIVE: float = 260.0
const TETHER_DAMPING: float = 3.0
const MAX_TETHER_LENGTH: float = 260.0
# Stiffness coefficient applied to the (dist - MAX) overflow when the
# gravestone drifts past the hard cap. Steeper than the active pull
# so a fly-away always snaps cleanly back into reach.
const SNAP_BACK_STIFFNESS: float = 28.0

# ── Damage / impact thresholds ───────────────────────────────────────
# Below MIN_DAMAGE_VEL the gravestone is just being repositioned and
# shouldn't chip-damage enemies it brushes against. Above, it's a slam.
const MIN_DAMAGE_VEL: float = 260.0
# Fraction of the gravestone's velocity transferred into enemy
# knockback. 0.55 means a 400 px/s slam transfers a ~220 px/s shove.
const ENEMY_KNOCKBACK_MULT: float = 0.55

# ── Danger glow tuning ───────────────────────────────────────────────
# Velocity overshoot above MIN_DAMAGE_VEL that maps to peak glow alpha.
# A slam at MIN_DAMAGE_VEL + DANGER_GLOW_FULL_OVERSHOOT shows the glow
# at GLOW_PEAK_ALPHA. Below the threshold the glow stays at 0.
const DANGER_GLOW_FULL_OVERSHOOT: float = 220.0
const GLOW_PEAK_ALPHA: float = 0.70

@export var player_path: NodePath
# Base-typed (not class_name ToyHero) to avoid a cross-file class_name
# resolution issue at first-load. The script reads `.pulling` via
# duck-typing — set wherever a ToyHero is the actual node.
var _player: CharacterBody2D = null
# Visual children cached at _ready. Each physics tick we set their
# modulate / default_color based on linear_velocity overshoot above
# MIN_DAMAGE_VEL. Two channels react in unison so the slam state
# READS UNAMBIGUOUSLY:
#   • DangerGlow (Polygon2D behind body) — red halo around silhouette
#   • Outline    (Line2D tracing the body) — lerps from dark navy to
#                  saturated red so the body itself glows on slam
const OUTLINE_BASE_COLOR: Color = Color(0.08, 0.06, 0.10, 1.0)
const OUTLINE_DANGER_COLOR: Color = Color(1.0, 0.28, 0.20, 1.0)
var _danger_glow: Polygon2D = null
var _outline: Line2D = null

func _ready() -> void:
	contact_monitor = true
	max_contacts_reported = 6
	gravity_scale = 0.0
	linear_damp = 0.0  # manual damping — see header
	body_entered.connect(_on_body_entered)
	if player_path != NodePath():
		_player = get_node_or_null(player_path) as CharacterBody2D
	_danger_glow = get_node_or_null("DangerGlow") as Polygon2D
	_outline = get_node_or_null("Outline") as Line2D

func _physics_process(_delta: float) -> void:
	if _player == null or not is_instance_valid(_player):
		return
	var to_player: Vector2 = _player.global_position - global_position
	var dist: float = to_player.length()
	if dist < 0.001:
		return
	var dir: Vector2 = to_player / dist
	# Spring rest collapses to 0 when pulling, otherwise rests at
	# TETHER_REST_LENGTH so the gravestone trails behind at a
	# comfortable distance instead of glued to the player.
	# Duck-typed read: ToyHero exposes `pulling` as a public var.
	var pulling: bool = bool(_player.get("pulling"))
	var rest_length: float = 0.0 if pulling else TETHER_REST_LENGTH
	var extension: float = dist - rest_length
	var stiffness: float = PULL_STIFFNESS_ACTIVE if pulling else PULL_STIFFNESS_IDLE
	var spring_force: Vector2 = dir * extension * stiffness
	var damping_force: Vector2 = -linear_velocity * TETHER_DAMPING
	apply_central_force(spring_force + damping_force)
	# Hard cap — when the gravestone has been flung out (e.g. player
	# sprinted across the room mid-swing), snap it back forcefully.
	if dist > MAX_TETHER_LENGTH:
		var snap_back: Vector2 = dir * (dist - MAX_TETHER_LENGTH) * SNAP_BACK_STIFFNESS
		apply_central_force(snap_back)
	_update_danger_glow()

# Drive the danger-state visuals based on velocity overshoot. Two
# layers react in unison:
#
#   • DangerGlow polygon alpha — ramps 0 → GLOW_PEAK_ALPHA across
#     DANGER_GLOW_FULL_OVERSHOOT px/s of overshoot. The halo extends
#     past the body silhouette so the player sees a red aura.
#   • Outline Line2D color — lerps from dark navy (OUTLINE_BASE) to
#     saturated red (OUTLINE_DANGER) over the same overshoot range.
#     The body's own silhouette LIGHTS UP, which is much higher-
#     contrast than the under-body glow alone.
#
# Both off the same `t = overshoot / DANGER_GLOW_FULL_OVERSHOOT` so
# they ramp together. Below MIN_DAMAGE_VEL both reset to baseline.
func _update_danger_glow() -> void:
	var v: float = linear_velocity.length()
	var overshoot: float = v - MIN_DAMAGE_VEL
	var t: float = clampf(overshoot / DANGER_GLOW_FULL_OVERSHOOT, 0.0, 1.0)
	if _danger_glow != null:
		var c: Color = _danger_glow.color
		c.a = t * GLOW_PEAK_ALPHA
		_danger_glow.color = c
	if _outline != null:
		_outline.default_color = OUTLINE_BASE_COLOR.lerp(OUTLINE_DANGER_COLOR, t)

func _on_body_entered(body: Node) -> void:
	var impact_vel: float = linear_velocity.length()
	if body.is_in_group("toy_enemies"):
		# Enemy slam path — apply damage + knockback if above threshold.
		if impact_vel < MIN_DAMAGE_VEL:
			return
		if not body.has_method("take_hit"):
			return
		# Knockback direction = away from the gravestone (NOT along
		# its velocity vector). For a glancing blow this matters:
		# the player wants the enemy shoved off the gravestone, not
		# punted along its trajectory (which could pull the enemy
		# AHEAD of the gravestone and re-hit it on the next frame).
		var knockback_dir: Vector2 = (body.global_position - global_position).normalized()
		body.take_hit(impact_vel, knockback_dir * impact_vel * ENEMY_KNOCKBACK_MULT)
		return
	# Wall / pillar / chokepoint slab — anything on the world layer
	# (1) that isn't an enemy. Below threshold = silent (the stone is
	# just being repositioned). At/above = fire a small wall-slam
	# feedback (light shake + spark, no hit-stop, no audio sting).
	# Tells the player "the stone is dangerous AND solid" without
	# pretending a wall hit is a kill.
	if impact_vel < MIN_DAMAGE_VEL:
		return
	var room: Node = get_tree().current_scene
	if room != null and room.has_method("on_gravestone_wall_slam"):
		room.on_gravestone_wall_slam(global_position, impact_vel)
