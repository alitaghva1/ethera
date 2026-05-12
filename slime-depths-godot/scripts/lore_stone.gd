# LoreStone — iter 38. Optional discoverable interactable. Smaller +
# more understated than Shrine: a 16-px glowing crystal on the floor
# with a slow pulse + tiny floating "?" hint that appears when the
# hero is nearby. Walk close, press E → read a 1-2 line lore
# fragment + receive a small stat bonus.
#
# Visual philosophy: lore stones are FOUND, not advertised. The
# silhouette is small (won't dominate a screenshot) but the rune
# pulse + glow are eye-catching once the player notices them. The
# interact prompt only shows on proximity to avoid HUD clutter.
#
# Reward philosophy: stat values are MEANINGFULLY smaller than
# shrines (0.5 HP equivalent — but no such thing as half HP, so we
# rotate between flat +1 / +0.05 / +0.5 effects keyed to the lore
# theme). Players who find all 6 across multiple runs get a real
# bonus stack; players who never look don't fall behind by much.
extends Area2D

const INTERACT_RADIUS: float = 30.0

# Per-instance config — set by main.gd before add_child.
var lore_text: String = ""
var stat_key: String = ""
var stat_value = 0

var _hero_in_range: bool = false
var _claimed: bool = false
var _t: float = 0.0

var _crystal: Polygon2D = null
var _glow: PointLight2D = null
var _hint: Label = null
var _prompt: Label = null

func _ready() -> void:
	add_to_group("lore_stones")
	body_entered.connect(_on_body_entered)
	body_exited.connect(_on_body_exited)
	# Collision: small circle, lets the hero get close before the
	# prompt appears (more "you have to notice it" than "the world
	# yells at you to interact").
	var shape: CollisionShape2D = CollisionShape2D.new()
	var circle: CircleShape2D = CircleShape2D.new()
	circle.radius = INTERACT_RADIUS
	shape.shape = circle
	add_child(shape)
	_build_visuals()

func _build_visuals() -> void:
	# Crystal — small 6-vert diamond, pale violet so it reads as
	# "old magic / lost knowledge" not gameplay-relevant flash.
	_crystal = Polygon2D.new()
	_crystal.polygon = PackedVector2Array([
		Vector2(0, -10), Vector2(7, -4), Vector2(7, 4),
		Vector2(0, 10), Vector2(-7, 4), Vector2(-7, -4),
	])
	_crystal.color = Color(0.72, 0.55, 0.95, 1.0)
	add_child(_crystal)
	# Inner highlight — smaller bright facet so the crystal reads as
	# faceted rather than flat. Slight offset for a glint.
	var facet: Polygon2D = Polygon2D.new()
	facet.polygon = PackedVector2Array([
		Vector2(-2, -6), Vector2(2, -8), Vector2(3, -4),
		Vector2(0, -2), Vector2(-2, -4),
	])
	facet.color = Color(1.0, 0.92, 1.0, 0.85)
	add_child(facet)
	# Glow — small PointLight2D at the crystal. Energy pulses slowly
	# in _process. Color matches the crystal so the glow doesn't
	# look like a different effect.
	_glow = PointLight2D.new()
	_glow.energy = 0.65
	_glow.texture_scale = 0.5
	_glow.color = Color(0.85, 0.65, 1.0, 1.0)
	_glow.range_z_min = -1024
	_glow.range_z_max = 1024
	add_child(_glow)
	# Hint glyph — small "?" that appears when hero is in range.
	# Acts as an "interact possible" signal without yelling at the
	# player (no full prompt label, just a curiosity-marker).
	_hint = Label.new()
	_hint.text = "?"
	_hint.add_theme_font_size_override("font_size", 16)
	_hint.add_theme_color_override("font_color", Color(0.9, 0.85, 1.0, 1.0))
	_hint.add_theme_color_override("font_outline_color", Color(0.2, 0, 0.3, 0.95))
	_hint.add_theme_constant_override("outline_size", 3)
	_hint.position = Vector2(-6, -38)
	_hint.size = Vector2(12, 16)
	add_child(_hint)
	# Interact prompt — appears with the hint when in range.
	_prompt = Label.new()
	_prompt.text = "[E] READ"
	_prompt.add_theme_font_size_override("font_size", 11)
	_prompt.add_theme_color_override("font_color", Color(0.92, 0.92, 1.0, 0.9))
	_prompt.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	_prompt.add_theme_constant_override("outline_size", 3)
	_prompt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_prompt.position = Vector2(-32, 14)
	_prompt.size = Vector2(64, 14)
	_prompt.visible = false
	add_child(_prompt)

func _process(delta: float) -> void:
	_t += delta
	if _claimed:
		return
	# Crystal pulse — soft scale + glow energy sin wave. Slow period
	# (3s) so the stone feels "asleep, waiting" not flashing.
	if _crystal != null:
		var s: float = 1.0 + 0.07 * sin(_t * 2.0)
		_crystal.scale = Vector2(s, s)
	if _glow != null:
		_glow.energy = 0.55 + 0.20 * (0.5 + 0.5 * sin(_t * 1.5))
	# Hint floats softly above the crystal even when not in range —
	# makes the stone discoverable at a glance once spotted.
	if _hint != null:
		_hint.position.y = -38 + 1.5 * sin(_t * 2.4)
		_hint.modulate.a = 0.5 + 0.3 * (0.5 + 0.5 * sin(_t * 2.1))

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
		_read()
		get_viewport().set_input_as_handled()

# Read the lore stone. Grants the configured stat bonus + shows the
# lore text via a temporary banner above the hero. Once-per-stone
# per run; the stone fades + frees on read.
func _read() -> void:
	_claimed = true
	if _prompt != null:
		_prompt.visible = false
	if _hint != null:
		_hint.visible = false
	# Grant the stat bonus.
	if stat_key != "":
		GameState.grant_shrine_bonus(stat_key, stat_value)
	# Banner — pale violet to match the crystal palette.
	if lore_text != "":
		var heroes: Array = get_tree().get_nodes_in_group("hero")
		var anchor_pos: Vector2 = global_position + Vector2(0, -64)
		if not heroes.is_empty():
			var h = heroes[0]
			if h is Node2D:
				anchor_pos = (h as Node2D).global_position + Vector2(0, -88)
		var num: DamageNumber = DamageNumber.spawn(
			anchor_pos,
			lore_text,
			Color(0.92, 0.82, 1.0),
		)
		# iter-72 bug-fix: defensive get_parent() null guard — same pattern
		# as chest.gd / pedestal.gd. Parent is normally main.gd; bail clean
		# if it's been freed mid-read.
		var parent_node: Node = get_parent()
		if parent_node != null:
			parent_node.add_child(num)
		else:
			num.queue_free()
	# Outro tween — crystal scales up briefly then fades out, glow dims.
	monitoring = false
	var tween: Tween = create_tween().set_parallel(true)
	if _crystal != null:
		tween.tween_property(_crystal, "scale", Vector2(1.6, 1.6), 0.4).set_ease(Tween.EASE_OUT)
		tween.tween_property(_crystal, "modulate:a", 0.0, 0.5)
	if _glow != null:
		tween.tween_property(_glow, "energy", 0.0, 0.45)
	tween.chain().tween_callback(queue_free)
