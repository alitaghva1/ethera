# Pedestal — stationary relic offering. Spawned by the wave runner
# after the final wave clears. Walk near + press E → grants the
# configured relic to GameState, then poofs.
#
# Visual is intentionally readable from the doorway: a pulsing colored
# orb on a stone plinth + the relic NAME floating above. The player
# can SEE what they're claiming before committing — mirrors slime-
# depths' pedestalTeaser pattern where pre-pickup hints describe
# the relic effect.
class_name Pedestal
extends Area2D

@export var relic_id: String = "iron_fang"

@onready var plinth: ColorRect = $Plinth
@onready var orb: Sprite2D = $Orb
@onready var name_label: Label = $NameLabel
@onready var desc_label: Label = $DescLabel
@onready var prompt: Label = $Prompt
@onready var glow: PointLight2D = $PointLight2D

var _hero_in_range := false
var _claimed := false

func _ready() -> void:
	body_entered.connect(_on_body_entered)
	body_exited.connect(_on_body_exited)
	# Pull display from the registry so future relics auto-inherit
	# the right labels.
	var info: Dictionary = GameState.relic_info(relic_id)
	name_label.text = str(info.get("name", relic_id))
	desc_label.text = str(info.get("description", ""))
	prompt.visible = false
	# Iter 16 — pedestals spawned as part of a 3-choice offer join
	# this group so they can dismiss each other on claim.
	add_to_group("pedestal_offer")

func _process(delta: float) -> void:
	if _claimed:
		return
	var t := Time.get_ticks_msec() / 1000.0
	# Vertical bob + halo pulse — the orb feels "alive" while waiting.
	orb.position.y = -56.0 + sin(t * 2.2) * 4.0
	if glow != null:
		glow.energy = 1.3 + sin(t * 2.2) * 0.25

func _on_body_entered(body: Node) -> void:
	if _claimed:
		return
	if body.is_in_group("hero"):
		_hero_in_range = true
		prompt.visible = true

func _on_body_exited(body: Node) -> void:
	if body.is_in_group("hero"):
		_hero_in_range = false
		prompt.visible = false

func _input(ev: InputEvent) -> void:
	if _claimed or not _hero_in_range:
		return
	if ev.is_action_pressed("interact"):
		_claim()
		get_viewport().set_input_as_handled()

func _claim() -> void:
	_claimed = true
	prompt.visible = false
	# Iter 16: dismiss every other pedestal in the current offer FIRST,
	# so by the time we emit pickup_claimed (which main.gd listens for
	# to spawn the door), the player can't sneak in a second claim.
	# Also keeps siblings from doubling up by both responding to the
	# same E-press in a tightly-spaced offer.
	for other in get_tree().get_nodes_in_group("pedestal_offer"):
		if other != self and other.has_method("_dismiss"):
			other._dismiss()
	var granted: bool = GameState.grant_relic(relic_id)
	# Spawn a pickup banner (damage-number-shaped). Yellow + bigger
	# than damage numbers so it reads as a real beat.
	var n: DamageNumber = DamageNumber.spawn(
		global_position + Vector2(0, -100),
		str(GameState.relic_info(relic_id).get("name", relic_id)) + (" CLAIMED" if granted else " (already owned)"),
		Color(1, 0.85, 0.45)
	)
	get_parent().add_child(n)
	if granted:
		Events.pickup_claimed.emit(global_position, relic_id)
	# Brief outro tween — orb swells + fades, plinth dims, then we
	# delete the pedestal. Disable collision immediately so a queued
	# interact doesn't double-trigger.
	monitoring = false
	var tween := create_tween().set_parallel(true)
	tween.tween_property(orb, "scale", Vector2(2.0, 2.0), 0.35).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_property(orb, "modulate:a", 0.0, 0.35)
	tween.tween_property(glow, "energy", 0.0, 0.35)
	tween.tween_property(plinth, "modulate:a", 0.4, 0.35)
	tween.chain().tween_callback(queue_free)

# Iter 16 — dismissed (un-chosen) sibling in a 3-pedestal offer. No
# relic granted, no pickup_claimed event; just a softer outro tween
# than _claim so the dismissed pedestals visibly recede rather than
# pop. Marks _claimed so a queued E-press can't re-trigger it.
func _dismiss() -> void:
	if _claimed:
		return
	_claimed = true
	prompt.visible = false
	monitoring = false
	var tween := create_tween().set_parallel(true)
	tween.tween_property(orb, "modulate:a", 0.0, 0.45)
	tween.tween_property(glow, "energy", 0.0, 0.45)
	tween.tween_property(plinth, "modulate:a", 0.25, 0.45)
	tween.tween_property(name_label, "modulate:a", 0.0, 0.45)
	tween.tween_property(desc_label, "modulate:a", 0.0, 0.45)
	tween.chain().tween_callback(queue_free)
