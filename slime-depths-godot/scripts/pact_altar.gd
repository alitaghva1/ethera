# Pact Altar — iter 227 / Fun Ideas Team. A FAUSTIAN BARGAIN counterpart
# to the shrine that spawns as a 4th option in shrine rooms.
#
# Where a shrine grants one clean stat boost, a Pact Altar offers a
# stronger immediate BOON paired with a per-run CURSE. The player chooses
# courage vs. caution: do they take the +2 attack at the cost of -1 max
# HP for the rest of the run, or do they walk past and just pray?
#
# Design DNA — three north stars from the doctrine:
#   • Hades — Hera/Demeter-style boons with a tradeoff axis. Every gift
#     has a price.
#   • The Binding of Isaac — Devil Room / Curse Room. Health is currency.
#     The dangerous choice is also the strongest choice.
#   • Noita — chemistry of permanence. Status that sticks for the run.
#
# Curse-side modifier model:
#   Curses fold into GameState.shrine_bonuses via the existing
#   grant_shrine_bonus(key, value) helper. The same modifier_total /
#   modifier_total_f path that surfaces shrine boons also surfaces these
#   curses — no parallel API. A negative max_hp_bonus is a real, live
#   stat reduction the hero reads on spawn.
#
# Boon-side immediate effects:
#   Dispatched by kind string. "relic" grants a legendary relic from the
#   unowned pool. "heal_full" heals the hero to full + raises max HP by
#   1. "gold" awards 25 gold. "shards" awards 8 ether_shards (the
#   between-run currency from iter-219).
#
# Pray-once contract:
#   Shares the "shrine_offer" group with the stat shrines, so claiming a
#   pact dismisses the sibling shrines AND vice-versa. Player picks ONE
#   ritual in a shrine room, period.
#
# Visual identity:
#   Where shrines are warm gold + colored rune, the pact altar is dark
#   obsidian + bloodred glow + slow ominous pulse. Reads as cursed at a
#   glance — the player should hesitate before walking up.
class_name PactAltar
extends Area2D

const INTERACT_RADIUS: float = 40.0

# Pact catalog. Each pact carries:
#   id           — unique stable identifier (for tests, save migration)
#   label        — short banner name shown on the altar
#   boon_text    — one-line description of the immediate reward
#   curse_text   — one-line description of the persistent cost
#   boon         — { kind: ..., value: ... } executed on _accept
#   curse        — { modifier_key: ..., modifier_value: ... } applied to
#                  GameState.shrine_bonuses
#
# Four catalog entries — one boon-kind each so the 4-pact draw always
# has variety. The roll picks ONE at spawn so the player isn't faced
# with N choices in one altar (that's what the 3 sibling shrines are
# for); the altar is single-offer to keep the decision pure.
const PACT_CATALOG: Array = [
	{
		"id": "vow_of_blood",
		"label": "VOW OF BLOOD",
		"boon_text": "+2 MELEE DAMAGE",
		"curse_text": "-1 MAX HP",
		"boon": {"kind": "stat", "modifier_key": "sword_damage_bonus", "modifier_value": 2},
		"curse": {"modifier_key": "max_hp_bonus", "modifier_value": -1},
	},
	{
		"id": "vow_of_ash",
		"label": "VOW OF ASH",
		"boon_text": "GAIN A LEGENDARY RELIC",
		"curse_text": "-15% MOVE SPEED",
		"boon": {"kind": "relic", "tier": "legendary"},
		"curse": {"modifier_key": "move_speed_mul", "modifier_value": -0.15},
	},
	{
		"id": "vow_of_dusk",
		"label": "VOW OF DUSK",
		"boon_text": "+8 ETHER SHARDS",
		"curse_text": "-1 MAX HP",
		"boon": {"kind": "shards", "amount": 8},
		"curse": {"modifier_key": "max_hp_bonus", "modifier_value": -1},
	},
	{
		"id": "vow_of_iron",
		"label": "VOW OF IRON",
		"boon_text": "+1 MAX HP · FULL HEAL",
		"curse_text": "LOSE 1 DAMAGE REDUCTION",
		"boon": {"kind": "heal_full", "value": 1},
		"curse": {"modifier_key": "damage_taken_reduction", "modifier_value": -1},
	},
]

# Selected pact info (rolled in _ready). Tests can set _forced_pact_id
# before _ready to pin a specific pact for deterministic verification.
var _pact: Dictionary = {}
var _forced_pact_id: String = ""

var _hero_in_range: bool = false
var _claimed: bool = false
var _t: float = 0.0

# Cached visual refs assembled in _ready.
var _plinth: Polygon2D = null
var _obelisk: Polygon2D = null
var _rune: Polygon2D = null
var _glow: PointLight2D = null
var _label: Label = null
var _boon_label: Label = null
var _curse_label: Label = null
var _prompt: Label = null

# Per-frame visual constants tuned for "ominous obsidian, bloodred light"
const OBSIDIAN_DARK: Color = Color(0.10, 0.06, 0.09, 1.0)
const OBSIDIAN_HIGHLIGHT: Color = Color(0.32, 0.20, 0.26, 0.95)
const BLOODRED: Color = Color(0.95, 0.20, 0.28, 1.0)
const BLOODRED_DIM: Color = Color(0.55, 0.10, 0.16, 0.85)
const BANNER_GOLD: Color = Color(1.0, 0.85, 0.50, 1.0)

func _ready() -> void:
	add_to_group("shrine_offer")        # share the dismiss group with shrines
	add_to_group("pact_altar")           # distinct group for tests + future hooks
	body_entered.connect(_on_body_entered)
	body_exited.connect(_on_body_exited)
	var shape: CollisionShape2D = CollisionShape2D.new()
	var circle: CircleShape2D = CircleShape2D.new()
	circle.radius = INTERACT_RADIUS
	shape.shape = circle
	add_child(shape)
	# Pick one pact at random — or honor the test-forced id if set.
	_pact = _pick_pact()
	_build_visuals()

# Roll one pact from the catalog. Honors _forced_pact_id so the test
# suite can pin a deterministic pact and verify the curse / boon
# dispatch path end-to-end.
func _pick_pact() -> Dictionary:
	if _forced_pact_id != "":
		for p in PACT_CATALOG:
			if str(p.get("id", "")) == _forced_pact_id:
				return p
	var idx: int = randi() % PACT_CATALOG.size()
	return PACT_CATALOG[idx]

func _build_visuals() -> void:
	# Plinth — dark obsidian base, smaller + sharper than the shrine's.
	_plinth = Polygon2D.new()
	_plinth.polygon = PackedVector2Array([
		Vector2(-20, 0), Vector2(-24, -6), Vector2(-24, -22),
		Vector2(-20, -28), Vector2(20, -28), Vector2(24, -22),
		Vector2(24, -6), Vector2(20, 0),
	])
	_plinth.color = OBSIDIAN_DARK
	add_child(_plinth)
	# Obelisk — tall narrow black slab rising above the plinth. Reads
	# as a tombstone / cursed monolith silhouette.
	_obelisk = Polygon2D.new()
	_obelisk.polygon = PackedVector2Array([
		Vector2(-12, -28), Vector2(-12, -56),
		Vector2(0, -64),                       # peaked top
		Vector2(12, -56), Vector2(12, -28),
	])
	_obelisk.color = OBSIDIAN_DARK
	add_child(_obelisk)
	# Obelisk highlight — bloodred outline along the top edges for
	# silhouette readability against dark biomes.
	var rim: Line2D = Line2D.new()
	rim.points = PackedVector2Array([
		Vector2(-12, -56), Vector2(0, -64), Vector2(12, -56),
	])
	rim.width = 1.8
	rim.default_color = BLOODRED_DIM
	rim.antialiased = true
	add_child(rim)
	# Rune — bloodred drop inscribed on the obelisk face. Small + sharp,
	# pulses in sync with the glow.
	_rune = Polygon2D.new()
	_rune.polygon = PackedVector2Array([
		Vector2(0, -52),
		Vector2(5, -44), Vector2(5, -38),
		Vector2(0, -32),
		Vector2(-5, -38), Vector2(-5, -44),
	])
	_rune.color = BLOODRED
	add_child(_rune)
	# Bloodred PointLight2D — low energy, slow pulse, conveys cursed
	# heat without overwhelming the cool biome lighting.
	_glow = PointLight2D.new()
	_glow.energy = 1.2
	_glow.texture_scale = 1.5
	_glow.color = BLOODRED
	_glow.range_z_min = -1024
	_glow.range_z_max = 1024
	_glow.position = Vector2(0, -40)
	add_child(_glow)
	# Banner labels — pact title + the boon/curse trade reads from a
	# distance so the player can make the decision approaching the altar.
	_label = Label.new()
	_label.text = str(_pact.get("label", "PACT"))
	_label.add_theme_font_size_override("font_size", 16)
	_label.add_theme_color_override("font_color", BANNER_GOLD)
	_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.95))
	_label.add_theme_constant_override("outline_size", 4)
	_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_label.position = Vector2(-90, -110)
	_label.size = Vector2(180, 22)
	add_child(_label)
	_boon_label = Label.new()
	_boon_label.text = "+ " + str(_pact.get("boon_text", ""))
	_boon_label.add_theme_font_size_override("font_size", 11)
	_boon_label.add_theme_color_override("font_color", Color(0.65, 1.0, 0.65, 0.95))
	_boon_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	_boon_label.add_theme_constant_override("outline_size", 3)
	_boon_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_boon_label.position = Vector2(-100, -90)
	_boon_label.size = Vector2(200, 14)
	add_child(_boon_label)
	_curse_label = Label.new()
	_curse_label.text = "- " + str(_pact.get("curse_text", ""))
	_curse_label.add_theme_font_size_override("font_size", 11)
	_curse_label.add_theme_color_override("font_color", Color(1.0, 0.55, 0.55, 0.95))
	_curse_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	_curse_label.add_theme_constant_override("outline_size", 3)
	_curse_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_curse_label.position = Vector2(-100, -76)
	_curse_label.size = Vector2(200, 14)
	add_child(_curse_label)
	_prompt = Label.new()
	_prompt.text = "[E] ACCEPT PACT"
	_prompt.add_theme_font_size_override("font_size", 12)
	_prompt.add_theme_color_override("font_color", BLOODRED)
	_prompt.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	_prompt.add_theme_constant_override("outline_size", 3)
	_prompt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_prompt.position = Vector2(-70, 8)
	_prompt.size = Vector2(140, 16)
	_prompt.visible = false
	add_child(_prompt)

func _process(delta: float) -> void:
	_t += delta
	if _claimed:
		return
	# Slow ominous pulse — slower cadence than shrine (2.4 → 1.4) so the
	# altar reads as "patient, heavy" rather than "active, ready".
	if _rune != null:
		var pulse: float = 1.0 + 0.10 * sin(_t * 1.4)
		_rune.scale = Vector2(pulse, pulse)
	if _glow != null:
		_glow.energy = 1.0 + 0.4 * (0.5 + 0.5 * sin(_t * 1.0))

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
		_accept_pact()
		get_viewport().set_input_as_handled()

# Accept this altar's rolled pact. Dispatch the boon, apply the curse,
# fire the pickup_claimed event so main.gd treats this as the "shrine
# room cleared" beat (door spawn), dismiss sibling shrines + altars, and
# run the outro tween.
func _accept_pact() -> void:
	_claimed = true
	if _prompt != null:
		_prompt.visible = false
	# 1. Apply the curse via the existing shrine_bonuses path. This is the
	#    permanent (within-run) cost. Folds through modifier_total /
	#    modifier_total_f automatically.
	var curse: Dictionary = _pact.get("curse", {})
	var curse_key: String = str(curse.get("modifier_key", ""))
	var curse_value = curse.get("modifier_value", 0)
	if curse_key != "":
		# GameState autoload — only call if available (test stubs may
		# not bring the autoload up; the test stages GameState manually).
		var gs: Node = _get_game_state()
		if gs != null and gs.has_method("grant_shrine_bonus"):
			gs.call("grant_shrine_bonus", curse_key, curse_value)
	# 2. Dispatch the boon. Kind-string switch keeps the catalog data-
	#    driven; adding a new boon kind is one branch + one catalog row.
	_dispatch_boon(_pact.get("boon", {}))
	# 3. Banner — bloodred "PACT SEALED" floater above the altar. Uses the
	#    static spawn helper from damage_number.gd (same pattern as
	#    shrine._pray banner).
	var label_text: String = "%s SEALED" % str(_pact.get("label", "PACT"))
	var num: DamageNumber = DamageNumber.spawn(
		global_position + Vector2(0, -130),
		label_text,
		BLOODRED,
	)
	var parent_node: Node = get_parent()
	if parent_node != null:
		parent_node.add_child(num)
	else:
		num.queue_free()
	# 4. Dismiss sibling shrine_offer entries (sister shrines + sibling
	#    altars if more than one ever rolled in the same room).
	for other in get_tree().get_nodes_in_group("shrine_offer"):
		if not is_instance_valid(other):
			continue
		if other != self and other.has_method("_dismiss"):
			other._dismiss()
	# 5. Notify main.gd via the pickup event bus — same beat as a shrine
	#    pray. The name "pact_<id>" lets future telemetry distinguish
	#    pact picks from shrine prays without a new signal.
	if Engine.has_singleton("Events") or _has_events_autoload():
		Events.pickup_claimed.emit(global_position, "pact_" + str(_pact.get("id", "")))
	# 6. Outro tween — rune + glow fade, obelisk dims, then queue_free.
	monitoring = false
	var tween: Tween = create_tween().set_parallel(true)
	if _rune != null:
		tween.tween_property(_rune, "modulate:a", 0.0, 0.5)
		tween.tween_property(_rune, "scale", Vector2(1.8, 1.8), 0.5).set_ease(Tween.EASE_OUT)
	if _glow != null:
		tween.tween_property(_glow, "energy", 0.0, 0.4)
	if _label != null:
		tween.tween_property(_label, "modulate:a", 0.4, 0.4)
	if _boon_label != null:
		tween.tween_property(_boon_label, "modulate:a", 0.4, 0.4)
	if _curse_label != null:
		tween.tween_property(_curse_label, "modulate:a", 0.4, 0.4)
	tween.chain().tween_callback(queue_free)

# Sibling dismissal. Mirrors shrine.gd._dismiss so the existing dismiss
# loop in shrine.gd reaches us too (and the loop in _accept_pact reaches
# the shrines). Same signature, same fade-out tween shape.
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
		tween.tween_property(_label, "modulate:a", 0.32, 0.3)
	if _boon_label != null:
		tween.tween_property(_boon_label, "modulate:a", 0.32, 0.3)
	if _curse_label != null:
		tween.tween_property(_curse_label, "modulate:a", 0.32, 0.3)
	tween.chain().tween_callback(queue_free)

# Boon dispatcher. Each branch is small and isolated so the test suite
# can stage a single pact at a time and verify the dispatch path lands
# the expected GameState mutation.
func _dispatch_boon(boon: Dictionary) -> void:
	var kind: String = str(boon.get("kind", ""))
	var gs: Node = _get_game_state()
	match kind:
		"stat":
			# Permanent (within-run) stat — uses the same shrine_bonuses
			# path as the curse side. The boon side just happens to be
			# additive in the desired direction.
			var key: String = str(boon.get("modifier_key", ""))
			var val = boon.get("modifier_value", 0)
			if key != "" and gs != null and gs.has_method("grant_shrine_bonus"):
				gs.call("grant_shrine_bonus", key, val)
		"relic":
			# Pull a random unowned legendary from RELIC_REGISTRY. If the
			# legendary pool is exhausted, fall back to any unowned relic
			# of any tier (defensive — late-run player with most relics
			# owned shouldn't get a null pact).
			if gs == null:
				return
			var tier: String = str(boon.get("tier", "legendary"))
			var candidates: Array = []
			if gs.has_method("relic_info"):
				var registry: Dictionary = gs.get("RELIC_REGISTRY") as Dictionary
				for rid in registry.keys():
					if gs.call("has_relic", rid):
						continue
					var info: Dictionary = registry.get(rid, {})
					if str(info.get("tier", "common")) == tier:
						candidates.append(rid)
				# Fallback to any unowned if tier is empty.
				if candidates.is_empty():
					for rid in registry.keys():
						if not gs.call("has_relic", rid):
							candidates.append(rid)
			if not candidates.is_empty():
				var pick: String = candidates[randi() % candidates.size()]
				gs.call("grant_relic", pick)
		"shards":
			# Award between-run currency. Uses the documented
			# award_ether_shards path which folds the ETHER_MAGNET
			# multiplier (etc.) so the boon respects relic synergies.
			var amount: int = int(boon.get("amount", 0))
			if amount > 0 and gs != null and gs.has_method("award_ether_shards"):
				gs.call("award_ether_shards", amount)
		"heal_full":
			# Raise max HP by `value`, then heal the hero to full. The
			# +max_hp uses the shrine_bonuses key so it survives room
			# transitions; the heal is a one-shot hero.heal() call.
			var bump: int = int(boon.get("value", 0))
			if bump != 0 and gs != null and gs.has_method("grant_shrine_bonus"):
				gs.call("grant_shrine_bonus", "max_hp_bonus", bump)
			var heroes: Array = get_tree().get_nodes_in_group("hero")
			if not heroes.is_empty():
				var h = heroes[0]
				if h.has_method("heal"):
					h.call("heal", 99)   # overheal clamps to max in hero.gd

# Safe GameState autoload accessor — returns null when the autoload
# isn't present (test stubs skip it deliberately). Real game runs always
# have it.
func _get_game_state() -> Node:
	if not is_inside_tree():
		return null
	var n: Node = get_tree().root.get_node_or_null("/root/GameState")
	return n

# Safe Events autoload check. Engine.has_singleton requires the
# explicit C++ singleton hook; autoloads are tree-level so we have to
# look them up via get_node.
func _has_events_autoload() -> bool:
	if not is_inside_tree():
		return false
	return get_tree().root.get_node_or_null("/root/Events") != null
