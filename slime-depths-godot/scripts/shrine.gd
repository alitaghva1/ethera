# Shrine — iter 33. Interactable stat-grant offering for shrine rooms.
# Parallels Pedestal (Area2D + walk-near + press E → claim), but
# grants a permanent (within-run) stat boost via GameState.shrine_bonuses
# instead of a relic. Three flavors:
#
#   stat_kind = "hp"     +1 max HP (cap raised; hero also healed +1).
#   stat_kind = "dash"   -0.15s dash strike cooldown. (iter-100 — was
#                        "dodge" granting dodge_cd_reduction_f which was
#                        a typo'd dead key AND tied to the iter-95
#                        removed dodge ability. Re-anchored to the only
#                        mobility option left.)
#   stat_kind = "atk"    +1 melee damage.
#
# Pray-once contract: claiming any shrine in the room dismisses the
# siblings (same pattern as pedestal_offer) and triggers the exit
# door via Events.pickup_claimed("shrine_<kind>"). Players can't
# greedy-pray all three in one visit.
#
# Visuals are code-built (no .tscn child nodes) so adding/retuning a
# stat type stays a single-file edit: tweak the kind dict + the
# colors. The .tscn is a thin Area2D shell whose only job is to
# attach this script + a circular CollisionShape2D.
extends Area2D

const INTERACT_RADIUS: float = 36.0

# Per-kind cosmetic + grant config. Key = stat_kind string set by
# main.gd at spawn. value.label drives the floating name banner;
# value.color drives the rune + light tint; value.modifier_key +
# value.modifier_value land on GameState.shrine_bonuses.
const SHRINE_KINDS: Dictionary = {
	"hp": {
		"label": "VITALITY",
		"subtitle": "+1 MAX HP",
		"color": Color(1.0, 0.45, 0.45, 1.0),
		"modifier_key": "max_hp_bonus",
		"modifier_value": 1,
	},
	# iter-100: renamed dodge → dash. The dodge ability was removed in
	# iter-95; this shrine entry was doubly broken because it pointed at
	# `dodge_cd_reduction_f` which never existed as a live modifier key
	# anyway (the iter-95 dead key was `dodge_cooldown_mul`, also gone).
	# Now grants a -15% dash strike cooldown via `dash_strike_cooldown_mul`
	# — the live key hero.gd reads in _start_dash_strike. ALACRITY label
	# survives — it still means "quick-move stat" for the player.
	"dash": {
		"label": "ALACRITY",
		"subtitle": "-15% DASH STRIKE CD",
		"color": Color(0.55, 0.9, 1.0, 1.0),
		"modifier_key": "dash_strike_cooldown_mul",
		"modifier_value": -0.15,
	},
	"atk": {
		"label": "WRATH",
		"subtitle": "+1 MELEE DMG",
		"color": Color(1.0, 0.65, 0.30, 1.0),
		"modifier_key": "sword_damage_bonus",
		"modifier_value": 1,
	},
}

@export var stat_kind: String = "hp"

var _hero_in_range: bool = false
var _claimed: bool = false
var _t: float = 0.0

# Cached visual refs assembled in _ready.
var _plinth: Polygon2D = null
var _rune: Polygon2D = null
var _glow: PointLight2D = null
var _label: Label = null
var _subtitle: Label = null
var _prompt: Label = null

func _ready() -> void:
	add_to_group("shrine_offer")
	body_entered.connect(_on_body_entered)
	body_exited.connect(_on_body_exited)
	# CollisionShape2D — circular. Built in code so a new shrine type
	# can override INTERACT_RADIUS without scene edits.
	var shape: CollisionShape2D = CollisionShape2D.new()
	var circle: CircleShape2D = CircleShape2D.new()
	circle.radius = INTERACT_RADIUS
	shape.shape = circle
	add_child(shape)
	# Build visuals from the kind config.
	var cfg: Dictionary = SHRINE_KINDS.get(stat_kind, SHRINE_KINDS["hp"])
	var tint: Color = cfg.get("color", Color.WHITE)
	_build_visuals(tint, cfg)

func _build_visuals(tint: Color, cfg: Dictionary) -> void:
	# Plinth — 36 wide × 28 tall dark stone base.
	_plinth = Polygon2D.new()
	_plinth.polygon = PackedVector2Array([
		Vector2(-18, 0), Vector2(-22, -4), Vector2(-22, -22),
		Vector2(-18, -26), Vector2(18, -26), Vector2(22, -22),
		Vector2(22, -4), Vector2(18, 0),
	])
	_plinth.color = Color(0.16, 0.14, 0.20, 1)
	add_child(_plinth)
	# Plinth highlight — Line2D outline along the top for silhouette.
	var rim: Line2D = Line2D.new()
	rim.points = PackedVector2Array([
		Vector2(-22, -22), Vector2(-18, -26), Vector2(18, -26), Vector2(22, -22),
	])
	rim.width = 1.5
	rim.default_color = Color(0.5, 0.46, 0.4, 0.9)
	rim.antialiased = true
	add_child(rim)
	# Rune — colored hex/diamond sitting on top of the plinth. Sin-
	# pulses scale via _process. The shape (8-vert star-ish) reads as
	# an arcane symbol rather than just a colored disc.
	_rune = Polygon2D.new()
	_rune.polygon = PackedVector2Array([
		Vector2(0, -14), Vector2(6, -22), Vector2(14, -30),
		Vector2(6, -38), Vector2(0, -46), Vector2(-6, -38),
		Vector2(-14, -30), Vector2(-6, -22),
	])
	_rune.color = tint
	_rune.position = Vector2(0, 14)   # so rune center sits above plinth top
	add_child(_rune)
	# Point light — soft tinted glow.
	_glow = PointLight2D.new()
	_glow.energy = 1.4
	_glow.texture_scale = 1.6
	_glow.color = tint
	_glow.range_z_min = -1024
	_glow.range_z_max = 1024
	_glow.position = Vector2(0, -16)
	add_child(_glow)
	# Floating name + subtitle Labels (info banner above the shrine).
	_label = Label.new()
	_label.text = str(cfg.get("label", "SHRINE"))
	_label.add_theme_font_size_override("font_size", 16)
	_label.add_theme_color_override("font_color", Color(1.0, 0.92, 0.7, 1))
	_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.95))
	_label.add_theme_constant_override("outline_size", 4)
	_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_label.position = Vector2(-80, -88)
	_label.size = Vector2(160, 22)
	add_child(_label)
	_subtitle = Label.new()
	_subtitle.text = str(cfg.get("subtitle", ""))
	_subtitle.add_theme_font_size_override("font_size", 11)
	_subtitle.add_theme_color_override("font_color", Color(0.92, 0.92, 1.0, 0.92))
	_subtitle.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
	_subtitle.add_theme_constant_override("outline_size", 3)
	_subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_subtitle.position = Vector2(-90, -68)
	_subtitle.size = Vector2(180, 16)
	add_child(_subtitle)
	_prompt = Label.new()
	_prompt.text = "[E] PRAY"
	_prompt.add_theme_font_size_override("font_size", 12)
	_prompt.add_theme_color_override("font_color", Color(1.0, 0.85, 0.5, 1))
	_prompt.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	_prompt.add_theme_constant_override("outline_size", 3)
	_prompt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_prompt.position = Vector2(-50, 6)
	_prompt.size = Vector2(100, 16)
	_prompt.visible = false
	add_child(_prompt)

func _process(delta: float) -> void:
	_t += delta
	if _claimed:
		return
	# Rune pulse — sin-driven scale around 1.0. Modest amplitude so
	# the shrine reads as "active but waiting" not "frantic."
	if _rune != null:
		var pulse: float = 1.0 + 0.08 * sin(_t * 2.4)
		_rune.scale = Vector2(pulse, pulse)
	if _glow != null:
		_glow.energy = 1.2 + 0.4 * (0.5 + 0.5 * sin(_t * 2.0))

func _on_body_entered(body: Node) -> void:
	if _claimed:
		return
	if body.is_in_group("hero"):
		_hero_in_range = true
		if _prompt != null:
			_prompt.visible = true

func _on_body_exited(body: Node) -> void:
	if body.is_in_group("hero"):
		_hero_in_range = false
		if _prompt != null:
			_prompt.visible = false

func _input(ev: InputEvent) -> void:
	if _claimed or not _hero_in_range:
		return
	if ev.is_action_pressed("interact"):
		_pray()
		get_viewport().set_input_as_handled()

# Pray-once contract. Grants the configured stat, dismisses sibling
# shrines (so the player can't greedy-pray all three in one room),
# emits Events.pickup_claimed("shrine_<kind>") so main.gd spawns the
# exit door, and runs an outro tween to dim + remove the shrine.
func _pray() -> void:
	_claimed = true
	# Iter 222 / Beta M3 — shrine-pray SFX (was silent per A/V audit).
	# Distinct rising sweep at 660→1980 Hz reads as "spirit ascending".
	if Audio != null and Audio.has_method("_play"):
		Audio._play("shrine_pray", global_position)
	if _prompt != null:
		_prompt.visible = false
	var cfg: Dictionary = SHRINE_KINDS.get(stat_kind, SHRINE_KINDS["hp"])
	var key: String = str(cfg.get("modifier_key", ""))
	var value = cfg.get("modifier_value", 0)
	if key != "":
		GameState.grant_shrine_bonus(key, value)
	# HP shrine also fires a +1 heal immediately so the cap-raise is
	# visible (and the player has a slightly bigger buffer for the
	# next combat). Other shrines have no on-grant feedback beyond
	# the banner.
	if stat_kind == "hp":
		var heroes: Array = get_tree().get_nodes_in_group("hero")
		if not heroes.is_empty():
			var h = heroes[0]
			if h.has_method("heal"):
				h.heal(1)
	# Banner — yellow pickup-style number above the shrine.
	var label_text: String = "%s GRANTED" % str(cfg.get("subtitle", ""))
	var num: DamageNumber = DamageNumber.spawn(
		global_position + Vector2(0, -110),
		label_text,
		Color(1, 0.85, 0.45),
	)
	# iter-72 bug-fix: defensive get_parent() null guard — same pattern
	# as chest.gd / pedestal.gd. Parent is normally main.gd; bail clean
	# if it's been freed mid-claim.
	var parent_node: Node = get_parent()
	if parent_node != null:
		parent_node.add_child(num)
	else:
		num.queue_free()
	# Dismiss siblings.
	for other in get_tree().get_nodes_in_group("shrine_offer"):
		if not is_instance_valid(other):
			continue
		if other != self and other.has_method("_dismiss"):
			other._dismiss()
	# Tell main.gd "room cleared" via the existing pickup event bus.
	Events.pickup_claimed.emit(global_position, "shrine_" + stat_kind)
	# Outro tween — rune fades, plinth dims.
	monitoring = false
	var tween: Tween = create_tween().set_parallel(true)
	if _rune != null:
		tween.tween_property(_rune, "modulate:a", 0.0, 0.5)
		tween.tween_property(_rune, "scale", Vector2(1.6, 1.6), 0.5).set_ease(Tween.EASE_OUT)
	if _glow != null:
		tween.tween_property(_glow, "energy", 0.0, 0.4)
	if _label != null:
		tween.tween_property(_label, "modulate:a", 0.35, 0.4)
	tween.chain().tween_callback(queue_free)

# Sibling dismissal. Sister shrines call this when one is prayed at.
# Fades the visuals and disables interaction without granting anything.
func _dismiss() -> void:
	if _claimed:
		return
	_claimed = true
	monitoring = false
	if _prompt != null:
		_prompt.visible = false
	var tween: Tween = create_tween().set_parallel(true)
	if _rune != null:
		tween.tween_property(_rune, "modulate:a", 0.0, 0.35)
	if _glow != null:
		tween.tween_property(_glow, "energy", 0.0, 0.3)
	if _label != null:
		tween.tween_property(_label, "modulate:a", 0.30, 0.3)
	if _subtitle != null:
		tween.tween_property(_subtitle, "modulate:a", 0.30, 0.3)
	tween.chain().tween_callback(queue_free)
