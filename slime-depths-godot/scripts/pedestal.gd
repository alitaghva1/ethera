# Pedestal — stationary relic offering. Spawned by the wave runner
# after the final wave clears. Walk near + press E → grants the
# configured relic to GameState, then poofs.
#
# Visual is intentionally readable from the doorway: a pulsing colored
# orb on a stone plinth + the relic NAME floating above. The player
# can SEE what they're claiming before committing — mirrors slime-
# depths' pedestalTeaser pattern where pre-pickup hints describe
# the relic effect.
#
# Iter 21 — tier visuals. Pedestals dispatch to _apply_tier_visuals on
# ready, tinting the orb / glow / bob amplitude and conditionally
# attaching effect nodes (Line2D ring for rare, CPUParticles2D aura
# for legendary). All children are code-built so adding a new tier
# later is one match-branch — the .tscn stays the common baseline.
class_name Pedestal
extends Area2D

# Tier visual constants. Indexed by tier string from RELIC_REGISTRY.
# Edit one constant block to retune; no scene-file edits needed.
const ORB_TINT_COMMON: Color = Color(0.85, 0.78, 0.55)
const ORB_TINT_RARE: Color = Color(0.45, 0.75, 1.0)
const ORB_TINT_LEGENDARY: Color = Color(0.85, 0.45, 1.0)
const GLOW_COLOR_COMMON: Color = Color(1.0, 0.85, 0.45)
const GLOW_COLOR_RARE: Color = Color(0.55, 0.8, 1.0)
const GLOW_COLOR_LEGENDARY: Color = Color(0.9, 0.55, 1.0)
const GLOW_ENERGY_BASE_COMMON: float = 1.3
const GLOW_ENERGY_BASE_RARE: float = 1.95
const GLOW_ENERGY_BASE_LEGENDARY: float = 2.6
const BOB_AMP_COMMON: float = 4.0
const BOB_AMP_RARE: float = 4.0
const BOB_AMP_LEGENDARY: float = 8.0
const RARE_RING_RADIUS: float = 30.0
const RARE_RING_VERTS: int = 12
const RARE_RING_DURATION: float = 1.4

@export var relic_id: String = "iron_fang"

@onready var plinth: Panel = $Plinth
@onready var orb: Sprite2D = $Orb
@onready var name_label: Label = $NameLabel
@onready var desc_label: Label = $DescLabel
@onready var prompt: Label = $Prompt
@onready var glow: PointLight2D = $PointLight2D

var _hero_in_range: bool = false
var _claimed: bool = false
# Per-tier tuning written by _apply_tier_visuals; consumed by _process.
var _glow_energy_base: float = GLOW_ENERGY_BASE_COMMON
var _bob_amplitude: float = BOB_AMP_COMMON
# Refs to optional tier effect children so _claim/_dismiss can dim them
# alongside the orb. Both are null on a common pedestal.
var _rare_ring: Line2D = null
var _legendary_aura: CPUParticles2D = null

func _ready() -> void:
	body_entered.connect(_on_body_entered)
	body_exited.connect(_on_body_exited)
	# Pull display from the registry so future relics auto-inherit
	# the right labels.
	var info: Dictionary = GameState.relic_info(relic_id)
	name_label.text = str(info.get("name", relic_id))
	desc_label.text = str(info.get("description", ""))
	prompt.visible = false
	# Iter 21 — tier dispatch. Defaults to "common" if a relic is
	# missing the field so a typo never makes the pedestal disappear.
	var tier: String = str(info.get("tier", "common"))
	_apply_tier_visuals(tier)
	# Iter 16 — pedestals spawned as part of a 3-choice offer join
	# this group so they can dismiss each other on claim.
	add_to_group("pedestal_offer")

func _process(delta: float) -> void:
	if _claimed:
		return
	var t: float = Time.get_ticks_msec() / 1000.0
	# Vertical bob + halo pulse — the orb feels "alive" while waiting.
	# Bob amplitude is tier-scaled (legendaries lift higher) so even at
	# rest the rarity reads at distance.
	orb.position.y = -56.0 + sin(t * 2.2) * _bob_amplitude
	if glow != null:
		glow.energy = _glow_energy_base + sin(t * 2.2) * 0.25

# ── Tier visuals ─────────────────────────────────────────────────────
# Dispatch table. Unknown tiers fall through to the common baseline so
# a future "mythic" string in the registry won't render as an invisible
# pedestal — it just renders as common until this match grows a branch.
func _apply_tier_visuals(tier: String) -> void:
	match tier:
		"rare":
			orb.modulate = ORB_TINT_RARE
			_glow_energy_base = GLOW_ENERGY_BASE_RARE
			_bob_amplitude = BOB_AMP_RARE
			if glow != null:
				glow.color = GLOW_COLOR_RARE
			_build_rare_ring()
		"legendary":
			orb.modulate = ORB_TINT_LEGENDARY
			_glow_energy_base = GLOW_ENERGY_BASE_LEGENDARY
			_bob_amplitude = BOB_AMP_LEGENDARY
			if glow != null:
				glow.color = GLOW_COLOR_LEGENDARY
			_build_legendary_aura()
		_:
			orb.modulate = ORB_TINT_COMMON
			_glow_energy_base = GLOW_ENERGY_BASE_COMMON
			_bob_amplitude = BOB_AMP_COMMON
			if glow != null:
				glow.color = GLOW_COLOR_COMMON

# Rare ring — Line2D circle (12 verts, closed) on a slow scale-up +
# fade-out loop at the plinth's top edge. Stays just under the orb so
# it reads as "this pedestal is humming with energy" without occluding
# the orb's bob path. Built in code so the .tscn stays common-only.
func _build_rare_ring() -> void:
	var ring: Line2D = Line2D.new()
	ring.name = "RareRing"
	ring.width = 2.0
	ring.default_color = Color(GLOW_COLOR_RARE.r, GLOW_COLOR_RARE.g, GLOW_COLOR_RARE.b, 0.85)
	# Build a closed 12-vertex circle in local space. Final vertex
	# repeats the first so the polyline visibly closes without a seam.
	var pts: PackedVector2Array = PackedVector2Array()
	var verts: int = maxi(RARE_RING_VERTS, 4)
	for i in range(verts + 1):
		var theta: float = (TAU * float(i)) / float(verts)
		pts.append(Vector2(cos(theta), sin(theta)) * RARE_RING_RADIUS)
	ring.points = pts
	# Position at the top of the plinth (y=-28 is plinth top per .tscn).
	# Squashing y a touch sells the perspective — the ring sits on a
	# tilted top, not floating perpendicular to the camera.
	ring.position = Vector2(0, -28)
	ring.scale = Vector2(1.0, 0.45)
	add_child(ring)
	_rare_ring = ring
	# Self-restarting loop. set_loops(0) = forever; the tween belongs to
	# `ring` so it dies when the pedestal does (no orphan callbacks).
	var tween: Tween = ring.create_tween().set_loops()
	tween.tween_property(ring, "scale", Vector2(1.4, 0.63), RARE_RING_DURATION).from(Vector2(1.0, 0.45))
	tween.parallel().tween_property(ring, "modulate:a", 0.0, RARE_RING_DURATION).from(0.85)

# Legendary aura — small purple sparks rising continuously from around
# the plinth. CPUParticles2D (not GPU) for parity with the rest of the
# project's FX layer (see fx.gd header for the WebGL-portability
# rationale). Sparks rise narrow-spread and fade so the eye reads the
# orb as the source — the aura frames it, doesn't compete with it.
func _build_legendary_aura() -> void:
	var aura: CPUParticles2D = CPUParticles2D.new()
	aura.name = "LegendaryAura"
	# Anchor at plinth-top center; sparks emit from a horizontal band
	# slightly wider than the plinth itself so they appear to rise
	# from around (not just above) the base.
	aura.position = Vector2(0, -28)
	aura.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
	aura.emission_rect_extents = Vector2(26, 4)
	aura.amount = 12
	aura.lifetime = 1.0
	aura.preprocess = 1.0  # start mid-cycle so the aura is "on" instantly
	aura.emitting = true
	aura.explosiveness = 0.0
	# Direction.UP + 60° spread = sparks drift upward in a soft cone.
	aura.direction = Vector2(0, -1)
	aura.spread = 60.0
	aura.gravity = Vector2(0, -20)  # gentle upward float, no real gravity
	aura.initial_velocity_min = 20.0
	aura.initial_velocity_max = 45.0
	aura.damping_min = 0.5
	aura.damping_max = 1.0
	aura.scale_amount_min = 1.5
	aura.scale_amount_max = 2.5
	# Purple → transparent ramp. Brighter at birth so a fresh spark
	# pops, fading to invisible by mid-life — particles cleanly dissolve
	# rather than abruptly disappearing.
	var grad: Gradient = Gradient.new()
	grad.offsets = PackedFloat32Array([0.0, 0.5, 1.0])
	grad.colors = PackedColorArray([
		Color(0.95, 0.7, 1.0, 1.0),
		Color(0.85, 0.45, 1.0, 0.7),
		Color(0.5, 0.2, 0.8, 0.0),
	])
	aura.color_ramp = grad
	add_child(aura)
	_legendary_aura = aura

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
	# Iter 20 — guard against a sibling that was queue_freed earlier
	# in the same frame (rare but possible if a chained outro tween
	# fired its tween_callback this frame). Godot 4 normally filters
	# freed instances from get_nodes_in_group, but defensive check
	# costs nothing.
	for other in get_tree().get_nodes_in_group("pedestal_offer"):
		if not is_instance_valid(other):
			continue
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
	var tween: Tween = create_tween().set_parallel(true)
	tween.tween_property(orb, "scale", Vector2(2.0, 2.0), 0.35).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_property(orb, "modulate:a", 0.0, 0.35)
	tween.tween_property(glow, "energy", 0.0, 0.35)
	tween.tween_property(plinth, "modulate:a", 0.4, 0.35)
	# Fade tier effect nodes alongside the orb so a legendary outro
	# doesn't leave a stray particle stream after the orb is gone.
	# CPUParticles2D's "emitting" stops new sparks; in-flight sparks
	# fade out naturally over their remaining lifetime — well within
	# our 0.35s tween + queue_free delay.
	if _rare_ring != null:
		tween.tween_property(_rare_ring, "modulate:a", 0.0, 0.35)
	if _legendary_aura != null:
		_legendary_aura.emitting = false
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
	var tween: Tween = create_tween().set_parallel(true)
	tween.tween_property(orb, "modulate:a", 0.0, 0.45)
	tween.tween_property(glow, "energy", 0.0, 0.45)
	tween.tween_property(plinth, "modulate:a", 0.25, 0.45)
	tween.tween_property(name_label, "modulate:a", 0.0, 0.45)
	tween.tween_property(desc_label, "modulate:a", 0.0, 0.45)
	# Match the claim outro: tier effects fade with the orb.
	if _rare_ring != null:
		tween.tween_property(_rare_ring, "modulate:a", 0.0, 0.45)
	if _legendary_aura != null:
		_legendary_aura.emitting = false
	tween.chain().tween_callback(queue_free)
