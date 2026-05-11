# SpikePit — iter 30. Stationary Area2D hazard that ticks 1 damage to
# the hero on a cooldown while they're standing on it. Pushes the
# player to MOVE rather than camp in one corner of a room.
#
# Design:
#   - Hero takes damage IMMEDIATELY on entry (clear feedback that
#     stepping on a pit is bad) + every SPIKE_TICK_INTERVAL seconds
#     they stay on it.
#   - Damage routes through hero.take_damage which respects iframes /
#     parry / iron_resolve / phoenix_feather. So a single brush is
#     usually free (iframes from the last hit still active), but
#     standing on a pit eats HP fast.
#   - Visual pulse on tick: the spike polygons brighten briefly so
#     each damage event is reinforced beyond the floater.
#
# Why an Area2D + tick (vs e.g. constantly-damaging body):
#   - take_damage already has HIT_IFRAMES; constant damage would
#     redundantly bounce against that. A tick interval gives the
#     player breathing room mid-traversal.
extends Area2D

const SPIKE_TICK_INTERVAL: float = 0.7
const SPIKE_DAMAGE: int = 1
# Flash brighter for this long after each tick. Read alongside the
# damage number so the player sees CAUSE and EFFECT in one beat.
const SPIKE_FLASH_TIME: float = 0.10

var _hero: Node2D = null
var _hero_inside: bool = false
var _tick_timer: float = 0.0
var _flash_timer: float = 0.0
# Cached refs to all the spike polygons. We brighten them in unison
# on each tick rather than tracking individuals.
var _spikes: Array[Polygon2D] = []
var _spike_base_color: Color = Color(0.78, 0.74, 0.66, 1)

func _ready() -> void:
	body_entered.connect(_on_body_entered)
	body_exited.connect(_on_body_exited)
	# Collect spike refs — pedestal-style group lookup would be over-
	# engineering for 8 known children.
	for i in range(8):
		var s: Polygon2D = get_node_or_null("Spike%d" % i) as Polygon2D
		if s != null:
			_spikes.append(s)

func _physics_process(delta: float) -> void:
	# Tick damage while hero is inside. The timer ALWAYS counts down so
	# the first tick on entry fires immediately (timer starts at 0).
	# After damage, timer resets to SPIKE_TICK_INTERVAL.
	if _flash_timer > 0.0:
		_flash_timer = max(0.0, _flash_timer - delta)
		if _flash_timer <= 0.0:
			_restore_spike_color()
	if not _hero_inside:
		return
	_tick_timer -= delta
	if _tick_timer > 0.0:
		return
	if _hero == null or not is_instance_valid(_hero):
		_hero_inside = false
		return
	if _hero.has_method("take_damage"):
		_hero.take_damage(SPIKE_DAMAGE)
	_tick_timer = SPIKE_TICK_INTERVAL
	_flash_spikes()

func _on_body_entered(body: Node) -> void:
	if body.is_in_group("hero"):
		_hero = body
		_hero_inside = true
		# Don't reset _tick_timer here — keep it from prior visit so
		# rapid in-out-in dancing doesn't fully reset the cooldown.
		# A player can't just tap-out / tap-in to dodge the tick.

func _on_body_exited(body: Node) -> void:
	if body.is_in_group("hero"):
		_hero_inside = false

func _flash_spikes() -> void:
	_flash_timer = SPIKE_FLASH_TIME
	# Boost the spike polygons to near-white so each damage tick has
	# a visible CAUSE the player can connect to the floating "-1".
	for s in _spikes:
		s.color = Color(1.0, 0.95, 0.85, 1)

func _restore_spike_color() -> void:
	for s in _spikes:
		s.color = _spike_base_color
