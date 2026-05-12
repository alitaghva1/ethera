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

# Iter 27 — rotation rates for the counter-spinning vortex rings.
# Outer ring spins CW at OUTER_RPS revolutions/sec; inner spins CCW
# (negative) at INNER_RPS, which is intentionally faster so the
# counter-rotation reads as a real swirl rather than two parallel
# spinning circles. PROXIMITY_RADIUS triggers the intensifier when
# the hero is within range.
const OUTER_RPS: float = 0.45
const INNER_RPS: float = -0.85
const CORE_PULSE_HZ: float = 2.4
const PROXIMITY_RADIUS: float = 140.0
const PROXIMITY_INTENSITY_BOOST: float = 0.75  # added to glow energy when in range

@onready var vortex_outer: Line2D = $VortexOuter
@onready var vortex_inner: Line2D = $VortexInner
@onready var portal_core: Polygon2D = $PortalCore
@onready var portal_glow: PointLight2D = $PortalGlow
@onready var motes: CPUParticles2D = $Motes
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
var _base_glow_energy: float = 1.8
var _base_core_scale: Vector2 = Vector2.ONE
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
	# Iter 32 — apply branch metadata if this is a branch-door fork.
	# Legacy (single-door) spawns leave branch_kind = "" and the door
	# keeps the iter-27 magenta-cyan portal look + "ONWARD →" label.
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
			# Unknown kind — leave the iter-27 magenta-cyan default in place.
			tint = Color(1, 1, 1, 1)
	if vortex_outer != null:
		vortex_outer.modulate = tint
	if vortex_inner != null:
		vortex_inner.modulate = tint
	if portal_core != null:
		portal_core.modulate = tint
	if portal_glow != null:
		# Re-tint the cast light too — the floor pool color shifts to
		# the branch palette so the door's identity propagates outward.
		portal_glow.color = tint
	if label != null:
		label.add_theme_color_override("font_color", label_color)
	if subtitle != null:
		subtitle.add_theme_color_override("font_color", label_color)

func _process(delta: float) -> void:
	var t: float = Time.get_ticks_msec() / 1000.0
	# Counter-rotating vortex rings — accumulating rotation each tick
	# (vs sin-based) so the spin is constant-velocity rather than
	# oscillating. Outer CW, inner CCW (faster) for the swirl effect.
	if vortex_outer != null:
		vortex_outer.rotation += OUTER_RPS * TAU * delta
	if vortex_inner != null:
		vortex_inner.rotation += INNER_RPS * TAU * delta
	# Core dot pulses scale 0.85→1.15 in phase with the glow energy.
	# Sin-based so the pulse breathes rather than snaps.
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
	# Motes emit faster when hero is close — particle stream density
	# scales with player attention. Default rate is `amount / lifetime`;
	# we modulate by toggling emitting + adjusting amount_ratio if the
	# Godot version supports it. Simpler: leave amount fixed and rely
	# on the glow + core feedback to sell the proximity beat.

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
	if RunState.advance():
		# More rooms left — reload the dungeon scene so it re-reads
		# the new current_room_config from RunState.
		await get_tree().create_timer(0.15).timeout
		get_tree().change_scene_to_file("res://scenes/main.tscn")
	else:
		# Last room already cleared — RunState returned false. Should
		# not normally happen because the last room spawns a Pedestal
		# instead of a Door, but route to the main menu defensively.
		RunState.end_floor()
		await get_tree().create_timer(0.15).timeout
		get_tree().change_scene_to_file("res://scenes/main_menu.tscn")
