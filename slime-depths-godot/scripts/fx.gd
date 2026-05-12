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

const HIT_SPARK_SCENE: PackedScene   = preload("res://scenes/fx/hit_spark.tscn")
const DEATH_BURST_SCENE: PackedScene = preload("res://scenes/fx/death_burst.tscn")
const BLOOD_DROP_SCENE: PackedScene  = preload("res://scenes/fx/blood_drop.tscn")
# iter-95: DODGE_DUST_SCENE removed — dodge ability deleted. The dust
# puff was tied to the dodge motion; dash_strike (now the only defensive
# movement) already spawns its own dash_trail particle trail behind the
# hero.

# Cached camera reference + the active shake tween. Camera gets
# re-resolved whenever it's null / freed — cheap, and survives scene
# changes without explicit reconnection. The tween is tracked so we
# can kill the previous shake before starting a new one (otherwise
# overlapping shakes fight each other and can drift away from zero).
var _camera: Camera2D = null
var _shake_tween: Tween = null

func _ready() -> void:
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

# Public shake wrapper — for callers outside FX (e.g. main.gd reacts
# to dash strike impact). Same parameters as _shake; just gives us a
# non-underscored API surface for autoload calls.
func shake(amp: float, dur: float) -> void:
	_shake(amp, dur)

# Camera shake — generate a short sequence of jittery offsets that
# end exactly at Vector2.ZERO. amp = peak displacement in pixels;
# dur = total duration in seconds. Splits the duration into 4 hops
# so the shake has visible texture (just lerping offset → 0 reads as
# a soft drift, not a punch).
func _shake(amp: float, dur: float) -> void:
	var cam := _get_camera()
	if cam == null:
		return
	# Kill any in-flight shake so we always end at (0,0) — without
	# this, a fresh shake mid-old-shake leaves a residual offset.
	if _shake_tween != null and _shake_tween.is_valid():
		_shake_tween.kill()
	# Snap to a punchy starting offset, then tween in 4 hops with
	# decaying amplitude back to zero. Each hop is randomized so it
	# doesn't feel mechanical.
	const HOPS := 4
	var hop_dur := dur / float(HOPS)
	_shake_tween = create_tween()
	cam.offset = Vector2(randf_range(-amp, amp), randf_range(-amp, amp))
	for i in range(HOPS):
		var falloff := 1.0 - (float(i + 1) / float(HOPS))  # 0.75, 0.5, 0.25, 0
		var target := Vector2(
			randf_range(-amp, amp) * falloff,
			randf_range(-amp, amp) * falloff,
		)
		# Last hop is forced to zero — guarantees we end clean even if
		# randf_range rolls a non-zero number on falloff=0.
		if i == HOPS - 1:
			target = Vector2.ZERO
		_shake_tween.tween_property(cam, "offset", target, hop_dur)

# ── Particle helpers ──────────────────────────────────────────────────

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

func _on_enemy_died(world_pos: Vector2) -> void:
	_shake(6.0, 0.12)
	_spawn(DEATH_BURST_SCENE, world_pos)

func _on_pickup_claimed(world_pos: Vector2, _name: String) -> void:
	# Reuse hit-spark gold for now — a dedicated pickup burst can land
	# later when relic art is finalized.
	_spawn(HIT_SPARK_SCENE, world_pos)

func _on_hero_died(world_pos: Vector2) -> void:
	_shake(18.0, 0.4)
	_spawn(DEATH_BURST_SCENE, world_pos)
