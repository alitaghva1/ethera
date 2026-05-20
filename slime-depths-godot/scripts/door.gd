# Door — Area2D trigger spawned in the dungeon's east wall after the
# room clears. Walking into it advances RunState to the next room and
# reloads the dungeon scene.
#
# Iter 12: hamlet removed. Door is the ONLY scene-transition surface
# in active gameplay — it advances to the next room, or routes to the
# main menu defensively if RunState.advance() returns false (which
# normally shouldn't happen because the last room spawns a Pedestal,
# not a Door, but we handle it cleanly).
#
# Iter 18 visual rework: layered stone arched doorway. The pulse +
# scale animation lives on the inner Portal polygon now (not the
# whole node); the arch FRAME stays solid so the silhouette reads
# stably while the glow breathes. The PointLight2D + CPUParticles2D
# in the scene do the heavy lifting on "this is alive" — we just
# modulate the portal alpha + scale on a slow sine.
class_name Door
extends Area2D

# iter-118: Single vortex ring + floor rune pulse. The iter-27 counter-
# rotating pair was visually chaotic — pre-iter-118 PROXIMITY check held,
# but the visual budget was over-spent (one ring + the floor rune carry
# the motion now). Floor rune pulses 1:1 with the core so the portal
# breathes as one entity. Glow intensifier still applies on hero proximity.
const VORTEX_RPS: float = 0.45
const CORE_PULSE_HZ: float = 2.4
const PROXIMITY_RADIUS: float = 140.0
const PROXIMITY_INTENSITY_BOOST: float = 0.55   # tamer than iter-27's 0.75
const RUNE_BASE_ALPHA: float = 1.0
const RUNE_PULSE_DEPTH: float = 0.30  # rune alpha varies ±RUNE_PULSE_DEPTH from base

@onready var vortex: Line2D = $Vortex
@onready var portal_core: Polygon2D = $PortalCore
@onready var portal_glow: PointLight2D = $PortalGlow
@onready var motes: CPUParticles2D = $Motes
@onready var floor_rune: Sprite2D = $FloorRune
@onready var stone_ring: Line2D = $StoneRing
@onready var stone_ring_highlight: Line2D = $StoneRingHighlight
@onready var label: Label = $Label
@onready var subtitle: Label = $Subtitle

# Iter 32 — branch metadata. Set by main.gd BEFORE add_child() when
# spawning a multi-door fork. _ready applies them to the label/tint/
# glow color. Empty branch_kind = legacy single-door behavior (the
# iter-30 "ONWARD →" cyan-magenta portal).
var branch_label: String = ""
var branch_kind: String = ""
var branch_subtitle: String = ""

# Iter 33 — destination room path override. When non-empty, the door
# tells RunState to load THIS room file next (rather than the linear
# FLOOR_ROOMS[idx+1] slot). Used for branch entries that route to
# treasure / shrine / other non-combat detours. "" = follow linear
# floor sequence (the iter-32 default for safe / standard / risk).
var branch_room_path: String = ""

var _firing := false
var _base_glow_energy: float = 1.1
var _base_core_scale: Vector2 = Vector2.ONE
# iter-118: captured at _ready BEFORE _apply_branch_styling may overwrite
# the rune.modulate with a branch tint. _process then animates only the
# alpha channel relative to this captured base, so a green-tinted safe
# door keeps its green while the brightness breathes.
var _rune_base_alpha: float = 1.0
# Cached hero reference for the proximity check. Resolved lazily on
# first _process tick so the door doesn't depend on _ready ordering
# vs the hero (hero is in the scene already, but defensive is cheap).
var _hero: Node2D = null

func _ready() -> void:
	body_entered.connect(_on_body_entered)
	if portal_glow != null:
		_base_glow_energy = portal_glow.energy
	if portal_core != null:
		_base_core_scale = portal_core.scale
	# iter-118: capture rune alpha BEFORE _apply_branch_styling can stamp
	# a branch tint over the modulate. The pulse in _process tweens the
	# alpha around this captured value.
	if floor_rune != null:
		_rune_base_alpha = floor_rune.modulate.a
	# Iter 32 — apply branch metadata if this is a branch-door fork.
	# Legacy (single-door) spawns leave branch_kind = "" and the door
	# keeps the iter-118 cyan-magenta portal look + "ONWARD →" label.
	if branch_kind != "":
		_apply_branch_styling()

# Iter 32 — branch-door visual theming. Tints the vortex rings, glow
# light, and core dot per branch_kind so the player reads each door's
# RISK / SAFE / STANDARD identity at a glance from across the room.
# Also rewrites the label text + subtitle to peek what's behind.
#
# Tint approach: modulate the Line2D / PointLight2D color WITHOUT
# touching the per-vertex gradients (those keep the swirl readable).
# Result reads like "the same portal, but burning red for risk / glowing
# green for safe" — same shape, different mood.
func _apply_branch_styling() -> void:
	if label != null and branch_label != "":
		label.text = branch_label
	if subtitle != null:
		subtitle.text = branch_subtitle
		subtitle.visible = branch_subtitle != ""
	var tint: Color = Color(1, 1, 1, 1)
	var label_color: Color = Color(1, 0.88, 0.7, 1)
	match branch_kind:
		"safe":
			tint = Color(0.55, 1.0, 0.65, 1.0)
			label_color = Color(0.75, 1.0, 0.85, 1.0)
		"risk":
			tint = Color(1.0, 0.55, 0.45, 1.0)
			label_color = Color(1.0, 0.78, 0.65, 1.0)
		"standard":
			tint = Color(0.95, 0.92, 1.0, 1.0)
			label_color = Color(0.92, 0.92, 1.0, 1.0)
		"treasure":
			# Iter 33 — gold-warm treasure portal. Same energy as the
			# risk variant (urgent) but warmth-shifted toward "reward"
			# instead of "threat" — yellow gold rather than red.
			tint = Color(1.0, 0.85, 0.35, 1.0)
			label_color = Color(1.0, 0.92, 0.6, 1.0)
		"shrine":
			# Iter 33 — pale blue-violet shrine portal, reads as
			# "sanctified / mystical" vs safe's warmer healing green.
			tint = Color(0.65, 0.75, 1.0, 1.0)
			label_color = Color(0.82, 0.88, 1.0, 1.0)
		_:
			# Unknown kind — leave the iter-118 cyan-magenta default in place.
			tint = Color(1, 1, 1, 1)
	# iter-118: tint the single vortex + core + glow + floor rune so the
	# door's branch identity propagates outward into the floor pool too.
	if vortex != null:
		vortex.modulate = tint
	if portal_core != null:
		portal_core.modulate = tint
	if portal_glow != null:
		portal_glow.color = tint
	if floor_rune != null:
		floor_rune.modulate = tint
	if label != null:
		label.add_theme_color_override("font_color", label_color)
	if subtitle != null:
		subtitle.add_theme_color_override("font_color", label_color)

func _process(delta: float) -> void:
	var t: float = Time.get_ticks_msec() / 1000.0
	# iter-118: single vortex rotation (the iter-27 counter-rotating
	# pair was visually chaotic — see scenes/door.tscn comment header).
	# Accumulating rotation each tick is constant-velocity rather than
	# oscillating; reads as "consistent swirl" not "wobble."
	if vortex != null:
		vortex.rotation += VORTEX_RPS * TAU * delta
	# Core dot pulses scale 0.85→1.15 in phase with the glow energy +
	# floor rune alpha — one breath unifies the portal's three layers.
	var pulse: float = sin(t * CORE_PULSE_HZ * TAU)
	if portal_core != null:
		var s: float = 1.0 + 0.15 * pulse
		portal_core.scale = _base_core_scale * s
	# Glow pulses with the core. Adds proximity-based intensifier when
	# the hero is within PROXIMITY_RADIUS — the door visibly "reacts"
	# to the player approaching, sells "step inside."
	if portal_glow != null:
		var energy: float = _base_glow_energy + 0.3 * pulse
		if _is_hero_in_range():
			energy += PROXIMITY_INTENSITY_BOOST
		portal_glow.energy = energy
	# iter-118: floor rune pulses in lockstep with the core. RUNE_BASE_ALPHA
	# is captured at _ready before any branch tinting touches the rune's
	# modulate; we modulate just the alpha channel here so a branch-tinted
	# rune (e.g. green for safe) keeps its hue while the brightness
	# breathes. Range is RUNE_BASE_ALPHA ± RUNE_PULSE_DEPTH.
	if floor_rune != null:
		var rune_mod: Color = floor_rune.modulate
		rune_mod.a = clampf(_rune_base_alpha + RUNE_PULSE_DEPTH * pulse, 0.0, 1.0)
		floor_rune.modulate = rune_mod

# Lazy hero resolution + distance check. Returns true when the hero
# is within PROXIMITY_RADIUS world units of the door's portal center.
# Returns false if the hero couldn't be resolved (hero in group not
# populated yet, etc.) — failure mode is "no intensifier," door
# still pulses normally.
func _is_hero_in_range() -> bool:
	if not is_instance_valid(_hero):
		var heroes: Array = get_tree().get_nodes_in_group("hero")
		if heroes.is_empty():
			return false
		_hero = heroes[0]
	return global_position.distance_to(_hero.global_position) < PROXIMITY_RADIUS

func _on_body_entered(body: Node) -> void:
	if _firing or not body.is_in_group("hero"):
		return
	_firing = true
	# Iter 222 / Beta M3 — door-traverse SFX (was silent per A/V audit).
	if Audio != null and Audio.has_method("_play"):
		Audio._play("door_traverse", global_position)
	# Brief delay so the player sees they hit the door before the
	# screen swaps. Reset time_scale defensively in case a hit-stop
	# was still in flight.
	Engine.time_scale = 1.0
	# Iter 32 — record the player's branch choice on RunState BEFORE
	# advancing so the next room's _ready can read it and apply the
	# corresponding modifier (heal, wave bump, pedestal tier shift).
	# Empty kind = legacy single-door run; pending_branch stays "" and
	# the next room loads with no modifier (iter-30 baseline).
	if branch_kind != "":
		RunState.pending_branch = branch_kind
	# Iter 33 — destination override. When the branch points to a
	# specific room file (treasure / shrine / etc.), tell RunState to
	# load THAT path next instead of the linear FLOOR_ROOMS slot.
	# Consumed inside RunState._load_current the moment it's read.
	if branch_room_path != "":
		RunState.pending_branch_path = branch_room_path
	# iter-112: the prior implementation paused 0.15s then snapped the
	# next room on. The pause was there so the player could SEE they hit
	# the door, but the snap-cut still felt abrupt. Replacing the bare
	# timer with a fade-to-black gives the same 0.25s pause AND ends on
	# fully-opaque black, so main.gd._ready can cross-fade up cleanly.
	# Subtotal across the transition: 0.25s fade out + room load +
	# 0.45s fade in from main.gd._ready.
	if RunState.advance():
		# More rooms left — reload the dungeon scene so it re-reads
		# the new current_room_config from RunState.
		await ScreenFlash.fade_to_black(0.25)
		get_tree().change_scene_to_file("res://scenes/main.tscn")
	else:
		# Last room already cleared — RunState returned false. Should
		# not normally happen because the last room spawns a Pedestal
		# instead of a Door, but route to the main menu defensively.
		RunState.end_floor()
		await ScreenFlash.fade_to_black(0.25)
		get_tree().change_scene_to_file("res://scenes/main_menu.tscn")
