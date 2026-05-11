# ScreenFlash — autoload CanvasLayer that paints brief full-screen color
# washes on big gameplay beats AND coordinates two new directional combat
# VFX (slash arc on hero_attacked, blast trail on hero_blasted).
#
# Why an autoload (vs. a node in main.tscn): the player moves between
# hamlet ↔ dungeon ↔ death screen, and the flash overlay should "always
# be there" without re-wiring. Same logic as the FX autoload — connect
# once to the Events bus and survive scene changes.
#
# CanvasLayer ordering — three overlay layers exist now:
#   100  Dialogue
#   180  ScreenFlash   ← us. Above HUD, below death screen.
#   200  death_screen
# So a damage flash paints on top of the HUD (intentional — should be
# *felt*) but doesn't paint over the run-end overlay (which has its own
# crimson framing already).
#
# The full-screen wash is a single ColorRect built in _ready() rather
# than a .tscn so the autoload can register from project.godot with no
# scene dependency. mouse_filter = IGNORE so the rect never eats clicks
# from HUD or pedestal interactions.
#
# Tween policy: every fresh flash kills the previous flash's tween
# before starting a new one. Without this guard, rapid hits (e.g.
# damage + dodge in the same frame) would compound alpha values and
# leave the screen tinted permanently.
extends CanvasLayer

const SLASH_ARC_SCENE: PackedScene   = preload("res://scenes/fx/slash_arc.tscn")
const BLAST_TRAIL_SCENE: PackedScene = preload("res://scenes/fx/blast_trail.tscn")

# The single full-viewport ColorRect that paints every flash. Built in
# _ready and re-used — we tween its `color` rather than spawning/freeing.
var _rect: ColorRect = null

# The active fade tween. Tracked so a fresh flash can kill it before
# starting a new one (otherwise concurrent flashes fight for the rect's
# color and leave residual tint).
var _flash_tween: Tween = null

func _ready() -> void:
	# Layer 180: above HUD (100), below death_screen (200). Picked
	# explicitly rather than relying on autoload registration order
	# because autoload order doesn't control CanvasLayer stacking.
	layer = 180

	# Build the wash ColorRect programmatically. anchors_preset = 15
	# (FULL_RECT) makes it stretch with the viewport without needing a
	# Container parent. mouse_filter = IGNORE (2) means clicks pass
	# through to whatever's beneath us — HUD buttons, pedestals, etc.
	_rect = ColorRect.new()
	_rect.name = "FlashRect"
	_rect.anchor_left = 0.0
	_rect.anchor_top = 0.0
	_rect.anchor_right = 1.0
	_rect.anchor_bottom = 1.0
	_rect.offset_left = 0.0
	_rect.offset_top = 0.0
	_rect.offset_right = 0.0
	_rect.offset_bottom = 0.0
	_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_rect.color = Color(0.0, 0.0, 0.0, 0.0)
	add_child(_rect)

	# Connect to the gameplay event bus. Single _ready on an autoload
	# means no risk of duplicate connections, but we still defensively
	# avoid re-connecting if something weird happens.
	Events.hero_damaged.connect(_on_hero_damaged)
	Events.hero_dodged.connect(_on_hero_dodged)
	Events.hero_attacked.connect(_on_hero_attacked)
	Events.hero_blasted.connect(_on_hero_blasted)
	Events.enemy_died.connect(_on_enemy_died)
	Events.pickup_claimed.connect(_on_pickup_claimed)
	Events.hero_died.connect(_on_hero_died)

# ── Flash helper ──────────────────────────────────────────────────────

# Paint a wash starting at `color` and tween its alpha to 0 over `dur`.
# Kills any in-flight fade so a quick succession of hits doesn't pile
# up alpha and leave the screen permanently tinted.
func _flash(color: Color, dur: float) -> void:
	if _rect == null:
		return
	if _flash_tween != null and _flash_tween.is_valid():
		_flash_tween.kill()
	_rect.color = color
	# Tween toward a transparent version of the SAME hue — keeps the
	# fade reading as "color fades out" rather than "color shifts to
	# black." End-state must have alpha = 0 cleanly.
	var end_color: Color = Color(color.r, color.g, color.b, 0.0)
	_flash_tween = create_tween()
	_flash_tween.tween_property(_rect, "color", end_color, dur)

# ── Directional VFX spawn ─────────────────────────────────────────────

# Spawn a directional VFX scene (slash arc / blast trail) at the given
# world position, oriented along `aim`. Parented to current_scene so it
# lives in the gameplay coordinate space — parenting to `self` (the
# CanvasLayer) would put it outside the camera transform.
func _spawn_directional(scene: PackedScene, world_pos: Vector2, aim: Vector2) -> void:
	var inst: Node2D = scene.instantiate() as Node2D
	if inst == null:
		return
	inst.global_position = world_pos
	if inst.has_method("setup"):
		inst.call("setup", aim)
	var parent: Node = get_tree().current_scene
	if parent == null:
		# Defensive — current_scene is briefly null during scene swaps.
		# Don't leak a Node2D that has no parent.
		inst.queue_free()
		return
	parent.add_child(inst)

# ── Signal handlers ───────────────────────────────────────────────────

func _on_hero_damaged(_world_pos: Vector2) -> void:
	# Red, mid-strength, quick fade — should *feel* like a slap.
	_flash(Color(0.95, 0.2, 0.2, 0.35), 0.25)

func _on_hero_dodged(_world_pos: Vector2) -> void:
	# Cyan, very brief — reinforces the i-frame moment without
	# overwhelming the screen. (Matches the dust-puff cool palette in
	# dodge_dust.tscn.)
	_flash(Color(0.5, 0.85, 1.0, 0.15), 0.15)

func _on_hero_attacked(world_pos: Vector2, aim: Vector2) -> void:
	# No screen flash on swing — only on hit. The slash arc IS the
	# visual feedback for the swing.
	_spawn_directional(SLASH_ARC_SCENE, world_pos, aim)

func _on_hero_blasted(world_pos: Vector2, aim: Vector2) -> void:
	# Blast trail along the aim direction. The projectile itself
	# continues separately; this is the muzzle/launch streak.
	_spawn_directional(BLAST_TRAIL_SCENE, world_pos, aim)

func _on_enemy_died(_world_pos: Vector2) -> void:
	# Tiny white pop — sells "you killed something" globally for any
	# enemy anywhere on screen. Short duration so it doesn't fight the
	# death_burst particle for attention.
	_flash(Color(1.0, 1.0, 0.92, 0.10), 0.12)

func _on_pickup_claimed(_world_pos: Vector2, _name: String) -> void:
	# Gold wash — same hue family as the hit-spark / damage-number
	# palette. Longer fade than a hit since pickups are rare beats.
	_flash(Color(1.0, 0.85, 0.45, 0.30), 0.40)

func _on_hero_died(_world_pos: Vector2) -> void:
	# Heaviest flash in the kit. Lingers long enough that the death
	# screen's own CanvasLayer (200) takes over while red is still
	# tinting the world below it.
	_flash(Color(0.85, 0.1, 0.1, 0.55), 0.60)
