# ScreenFlash — autoload CanvasLayer that paints brief full-screen color
# washes on big gameplay beats AND coordinates two new directional combat
# VFX (slash arc on hero_attacked, blast trail on hero_blasted).
#
# Why an autoload (vs. a node in main.tscn): the player moves between
# main_menu ↔ dungeon ↔ death screen, and the flash overlay should
# "always be there" without re-wiring. Same logic as the FX autoload —
# connect once to the Events bus and survive scene changes.
#
# CanvasLayer ordering — two overlay layers exist now (iter 12 removed
# the Dialogue autoload alongside the hamlet):
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

# iter-87 — SLASH_ARC_SCENE removed. The procedural slash_arc.gd (iters
# 60/73/75/81) is replaced by a PixelLab-generated sprite-sheet animation
# played via FxSprite. We don't preload anything for the slash here —
# FxSprite.spawn() handles loading the sheet + building the SpriteFrames
# on first use.
# iter-81: preload AttackFeel rather than using its class_name. ScreenFlash
# is an autoload (loads BEFORE class_name registration for non-autoloaded
# RefCounted scripts), so `AttackFeel.method()` via class_name fails at
# parse time. Preload binds the script statically so the static methods
# resolve cleanly.
const AttackFeel = preload("res://scripts/attack_feel.gd")
const FxSprite = preload("res://scripts/fx_sprite.gd")
const BLAST_TRAIL_SCENE: PackedScene = preload("res://scenes/fx/blast_trail.tscn")

# The single full-viewport ColorRect that paints every flash. Built in
# _ready and re-used — we tween its `color` rather than spawning/freeing.
var _rect: ColorRect = null

# The active fade tween. Tracked so a fresh flash can kill it before
# starting a new one (otherwise concurrent flashes fight for the rect's
# color and leave residual tint).
var _flash_tween: Tween = null

# Iter 19 — sign counter for alternating slash-arc tilt. Bumps each
# time a slash arc spawns; the arc reads its parity to decide whether
# to tilt CW or CCW. Living on ScreenFlash (the spawn site) means the
# Events.hero_attacked signal signature stays unchanged.
var _swing_counter: int = 0

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
	Events.hero_shielded.connect(_on_hero_shielded)
	Events.hero_attacked.connect(_on_hero_attacked)
	Events.hero_blasted.connect(_on_hero_blasted)
	Events.enemy_died.connect(_on_enemy_died)
	Events.pickup_claimed.connect(_on_pickup_claimed)
	Events.hero_died.connect(_on_hero_died)
	# Iter 148 — gold wash on boss-defeated, longer & warmer than the
	# generic enemy_died white pop. Pairs with main.gd's slow-mo + shake
	# for a layered "you killed the boss" beat that lands BEFORE the
	# FloorClearBurst gold cascade takes over.
	Events.boss_died.connect(_on_boss_died)

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

# ── Scene transition fades (iter-112) ─────────────────────────────────
#
# Two public helpers for cross-scene fade-to-black / fade-from-black,
# both built on the same ColorRect _flash() uses. Crucial design points:
#
#   • The autoload SURVIVES scene changes, so a fade started here
#     persists across change_scene_to_file. The caller awaits the
#     promise returned by fade_to_black BEFORE swapping scenes, so the
#     screen is fully opaque when the new scene loads — no half-faded
#     ugly frame.
#   • fade_from_black sets the rect to opaque immediately, THEN tweens
#     it to transparent. Called from the destination scene's _ready so
#     the player sees a clean fade-up rather than a snap-onto-already-
#     loaded geometry.
#   • Both kill any in-flight _flash_tween so a fade isn't fighting a
#     residual hit-flash (e.g. a damage flash 50ms before a door
#     walk-through into the next room).
#
# Why not async-callbacks or signals: the await-on-timer pattern from
# callers is more readable than a signal+callback dance, and Godot's
# create_tween().finished signal is also awaitable directly so the
# helper could return Tween — but the rect-color discipline is simpler
# to reason about as "fade to opaque + duration constant" than as a
# tween handle the caller has to track.
const FADE_BLACK := Color(0.0, 0.0, 0.0, 1.0)
const FADE_CLEAR := Color(0.0, 0.0, 0.0, 0.0)

# Fade the screen to opaque black over `dur`. After this returns (await
# this method to wait for it to finish), the rect sits at full-black
# until something clears it — typically the next scene calling
# fade_from_black on _ready.
func fade_to_black(dur: float = 0.30) -> void:
	if _rect == null:
		return
	if _flash_tween != null and _flash_tween.is_valid():
		_flash_tween.kill()
	_flash_tween = create_tween()
	_flash_tween.tween_property(_rect, "color", FADE_BLACK, dur)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	# Await the tween so the caller can `await ScreenFlash.fade_to_black()`
	# and continue once the screen is fully black.
	await _flash_tween.finished

# Snap the rect to opaque black RIGHT NOW, then tween it to transparent
# over `dur`. Called from a destination scene's _ready (e.g. main.gd
# after a room reload) to fade in from black instead of snapping the
# new world onto screen.
func fade_from_black(dur: float = 0.40) -> void:
	if _rect == null:
		return
	if _flash_tween != null and _flash_tween.is_valid():
		_flash_tween.kill()
	_rect.color = FADE_BLACK
	_flash_tween = create_tween()
	_flash_tween.tween_property(_rect, "color", FADE_CLEAR, dur)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)

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

func _on_hero_shielded(_world_pos: Vector2) -> void:
	# iter-95: was _on_hero_dodged. The dodge ability is gone — this
	# brief cyan flash now reinforces the SHIELD raise + catch beats
	# (parry_shield.gd's bubble visual is the primary feedback; the
	# flash sells the i-frame moment in the player's peripheral vision).
	_flash(Color(0.5, 0.85, 1.0, 0.15), 0.15)

func _on_hero_attacked(world_pos: Vector2, aim: Vector2) -> void:
	# iter-87: slash visual is now a PixelLab-generated sprite-sheet
	# animation played via FxSprite. Replaces the procedural multi-trail
	# Polygon2D render that lived in slash_arc.gd through iters 60/73/75/81.
	# The composer (AttackFeel) still drives build-scaling + theme tinting
	# — width grows with relic count, color blends toward dominant theme —
	# but the BASE VISUAL is now a painted pixel-art arc instead of
	# geometric primitives. The painterly look was the gap procedural
	# rendering couldn't close.
	_swing_counter += 1
	var swing_sign: int = 1 if (_swing_counter % 2) == 0 else -1
	var hero: Node = null
	var heroes: Array = get_tree().get_nodes_in_group("hero")
	if not heroes.is_empty():
		hero = heroes[0]
	# Iter 149 — pass current combo state to the composer so the slash arc
	# can visibly amplify at the same 10/25/50/100 tier thresholds the
	# HUD label escalates on. A hero at 50+ combo gets a wider, longer-
	# trailed, warmer slash — the build escalation isn't just a number
	# in the corner. Default combo = 0 if hero lacks the getter (e.g.
	# during boss-intro sim spawn).
	var combo: int = 0
	if hero != null and hero.has_method("get_combo"):
		combo = int(hero.get_combo())
	var ctx: Dictionary = {
		"swing_index": _swing_counter % 2,
		"swing_sign": swing_sign,
		"combo": combo,
	}
	var opts: Dictionary = AttackFeel.compose_slash_opts(hero, ctx)
	# iter-90: parent the slash to the HERO node (was current_scene). Two
	# wins from this:
	#   1. The slash follows the hero's forward lunge + any WASD input
	#      during the 0.18s swing. Previously the slash hung in world
	#      space while the hero moved 11+ px forward — user-reported
	#      "floaty, not connected to the character frame."
	#   2. Slash auto-frees with the hero on death (no orphan VFX after
	#      a death mid-swing).
	# Falls back to current_scene if the hero lookup fails (e.g. boss
	# intro fires hero_attacked from an off-stage sim).
	var parent: Node = hero if hero != null else get_tree().current_scene
	if parent == null:
		return
	# Map composer opts → FxSprite params:
	#   width (12-22)   → sprite scale.x. iter-88: sheet cell bumped
	#                     from 64px (PixelLab) to 128px (Frostwindz pack),
	#                     so the divisor + clamp range halve. Effective
	#                     in-world size stays ~90-170px wide.
	#   color           → modulate tint (theme blend lives here)
	#   swing_sign      → scale.y sign — flips the sweep direction so
	#                     consecutive swings alternate above/below the
	#                     hero like a one-two combo
	#   aim.angle()     → rotation so the arc points where the player is
	#                     swinging at
	# iter-90: tighter scale so the slash visual roughly matches
	# ATTACK_RANGE (56 px in hero.gd) rather than overshooting it.
	#   width=14 (default) → 14/28 ≈ 0.50 → 128*0.50 = 64 px sprite
	#   width=22 (max relics) → 22/28 ≈ 0.79 → clamped to 0.70 → 90 px
	# Was /18.0 + clamp (0.7-1.3) which produced a 90-166 px sprite —
	# 1.5x-2.7x the hero's 60 px drawn height, reading as a giant
	# disconnected overlay. /28 + (0.4-0.7) keeps the slash within
	# hero proportions while still scaling visibly with build width.
	var scale_mul: float = clampf(float(opts.get("width", 14.0)) / 28.0, 0.4, 0.7)
	# iter-89: shift the slash texture FORWARD in local coords so the
	# arc's visual mass appears IN FRONT of the hero. The Frostwindz
	# slash sheet has its arc concentrated in the upper-right diagonal
	# of the 128px cell — centered on hero, that puts the slash mass
	# off-axis from the swing direction (the user-reported "ahead or
	# behind" feel). Local-coord offset rotates with the node, so the
	# texture always shifts in the aim direction regardless of which
	# way the hero is facing.
	#
	# 48 native px ≈ 38% of the 128px cell — pushes the "swing origin"
	# of the slash to the hero position, with the arc's full sweep
	# extending forward. Tune if playtesting reads it as too-far or
	# too-close.
	const SLASH_FORWARD_OFFSET: float = 48.0
	FxSprite.spawn(parent, world_pos, "slash_arc", {
		"rotation": aim.angle(),
		"scale": Vector2(scale_mul, scale_mul * float(swing_sign)),
		"modulate": opts.get("color", Color(1.0, 1.0, 1.0, 1.0)),
		"z_index": 5,
		"offset": Vector2(SLASH_FORWARD_OFFSET, 0.0),
	})

func _on_hero_blasted(world_pos: Vector2, aim: Vector2) -> void:
	# Blast trail along the aim direction. The projectile itself
	# continues separately; this is the muzzle/launch streak.
	_spawn_directional(BLAST_TRAIL_SCENE, world_pos, aim)

func _on_enemy_died(_world_pos: Vector2) -> void:
	# Tiny white pop — sells "you killed something" globally for any
	# enemy anywhere on screen. Short duration so it doesn't fight the
	# death_burst particle for attention.
	_flash(Color(1.0, 1.0, 0.92, 0.10), 0.12)

# Iter 148 — boss-defeated gold wash. Bigger and warmer than the
# generic _on_enemy_died white pop, longer fade (0.55s vs 0.12s) so
# the screen-space punctuation registers ALONGSIDE the slow-mo + shake
# from main.gd's _on_boss_died handler. Color is a saturated warm gold
# matching the iter-71 FloorClearBurst BIG-variant palette so the
# whole boss-clear sequence reads as a unified beat: boss takes hit →
# gold flash + slow-mo + shake → flash fades → FloorClearBurst cascade
# kicks in.
func _on_boss_died(_world_pos: Vector2, _boss_name: String) -> void:
	_flash(Color(1.0, 0.78, 0.32, 0.32), 0.55)

func _on_pickup_claimed(_world_pos: Vector2, _name: String) -> void:
	# Gold wash — same hue family as the hit-spark / damage-number
	# palette. Longer fade than a hit since pickups are rare beats.
	_flash(Color(1.0, 0.85, 0.45, 0.30), 0.40)

func _on_hero_died(_world_pos: Vector2) -> void:
	# Heaviest flash in the kit. Lingers long enough that the death
	# screen's own CanvasLayer (200) takes over while red is still
	# tinting the world below it.
	_flash(Color(0.85, 0.1, 0.1, 0.55), 0.60)
