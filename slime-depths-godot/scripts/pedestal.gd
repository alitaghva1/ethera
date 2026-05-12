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
@onready var name_label: Label = $InfoPanel/NameLabel
@onready var desc_label: Label = $InfoPanel/DescLabel
@onready var prompt: Label = $Prompt
@onready var glow: PointLight2D = $PointLight2D
# Iter 28 — new framing nodes. info_panel is the bordered backdrop
# behind the name+desc; halo_sprite is the soft tier-colored glow
# under the icon; tier_cap is the colored strip at the top of the
# plinth that indicates rarity even when the orb is off-screen.
@onready var info_panel: Panel = $InfoPanel
@onready var halo_sprite: Sprite2D = $HaloSprite
@onready var tier_cap: ColorRect = $TierCap

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
	# Iter 64 — defensive autowrap pin. The .tscn already sets
	# autowrap_mode=3 (WORD_SMART), but pin it in code so any future
	# theme/scene edit that drops the override can't reintroduce the
	# mid-word break bug (e.g. "blas:" instead of "blast" on FOCUSED EYE).
	desc_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	desc_label.clip_text = false
	# Iter 64 — sync panel height across the 3-pedestal offer so a long
	# description (FOCUSED EYE, AVATAR OF FLAME) doesn't render with a
	# taller frame than its siblings. Run on the next frame after every
	# pedestal's _ready has computed its DescLabel layout. Uniform width
	# is already enforced by the .tscn (-98 to 98 offsets, locked).
	call_deferred("_sync_offer_panel_height")
	# Iter 21 — tier dispatch. Defaults to "common" if a relic is
	# missing the field so a typo never makes the pedestal disappear.
	var tier: String = str(info.get("tier", "common"))
	_apply_tier_visuals(tier)
	# Iter 28 — swap in the real relic art with NORMALIZED scale.
	# Source icons range 32×32 to 209×192 (same chaos that caused the
	# iter-26 HUD bug). A flat 0.6 scale rendered 32-px icons at 19 px
	# and 192-px icons at 115 px — wildly inconsistent on the row of
	# three pedestals. Now we read the texture's actual size and
	# compute scale = TARGET_ICON_DISPLAY / max(width, height), so
	# every icon renders at ~56 px regardless of source resolution.
	var icon_path: String = str(info.get("icon_path", ""))
	if icon_path != "" and ResourceLoader.exists(icon_path):
		var tex: Resource = ResourceLoader.load(icon_path)
		if tex is Texture2D:
			orb.texture = tex
			var tex_size: Vector2 = (tex as Texture2D).get_size()
			var max_dim: float = maxf(tex_size.x, tex_size.y)
			if max_dim > 0.0:
				var s: float = 56.0 / max_dim
				orb.scale = Vector2(s, s)
			# Soften the tier tint on the icon itself — the painted art
			# reads poorly under heavy color overlays. The Halo + glow
			# carry the tier hue at full strength.
			orb.modulate = orb.modulate.lerp(Color.WHITE, 0.6)
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
	# Iter 28 — base Y shifted from -56 to -80 to fit the taller plinth +
	# new InfoPanel above. HaloSprite + PointLight2D bob in phase with
	# the orb so the whole frame breathes together.
	var bob_y: float = -80.0 + sin(t * 2.2) * _bob_amplitude
	orb.position.y = bob_y
	if halo_sprite != null:
		halo_sprite.position.y = bob_y
	if glow != null:
		glow.position.y = bob_y
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
			_tint_frame(GLOW_COLOR_RARE)
			_build_rare_ring()
		"legendary":
			orb.modulate = ORB_TINT_LEGENDARY
			_glow_energy_base = GLOW_ENERGY_BASE_LEGENDARY
			_bob_amplitude = BOB_AMP_LEGENDARY
			if glow != null:
				glow.color = GLOW_COLOR_LEGENDARY
			_tint_frame(GLOW_COLOR_LEGENDARY)
			_build_legendary_aura()
		_:
			orb.modulate = ORB_TINT_COMMON
			_glow_energy_base = GLOW_ENERGY_BASE_COMMON
			_bob_amplitude = BOB_AMP_COMMON
			if glow != null:
				glow.color = GLOW_COLOR_COMMON
			_tint_frame(GLOW_COLOR_COMMON)

# Iter 28 — apply tier color to the three new framing nodes:
#   • InfoPanel — duplicates the stylebox so each pedestal instance
#     owns its own (Godot StyleBoxFlat is a resource and mutating it
#     in place would affect every pedestal sharing the .tscn's default).
#     Border color = tier; bg stays dark for text legibility.
#   • HaloSprite — modulate to tier color, slightly desaturated alpha
#     so the halo reads as ambient glow not a solid disk.
#   • TierCap — tier-colored strip on top of the plinth so the rarity
#     reads even when the orb is dimmed or off-screen.
func _tint_frame(tier_color: Color) -> void:
	if info_panel != null:
		var sb_existing: StyleBox = info_panel.get_theme_stylebox("panel")
		var sb: StyleBoxFlat = (sb_existing.duplicate() as StyleBoxFlat) if sb_existing is StyleBoxFlat else StyleBoxFlat.new()
		sb.border_color = tier_color
		info_panel.add_theme_stylebox_override("panel", sb)
	if halo_sprite != null:
		halo_sprite.modulate = Color(tier_color.r, tier_color.g, tier_color.b, 0.55)
	if tier_cap != null:
		tier_cap.color = tier_color

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

# Iter 64 — panel-height uniformity across a pedestal_offer group.
# Called via call_deferred from every pedestal's _ready, so by the time
# this runs the DescLabel has measured its wrapped content. Each pedestal
# computes its own "needed" height from desc_label.get_content_height,
# then we max across the offer group and apply that height to ALL
# pedestals' InfoPanels. Result: 3 uniformly-sized panels even when one
# description is 1 line and another is 5.
#
# The .tscn-defined minimum (120 px tall, -220 to -100) is the floor —
# we never SHRINK below the baked design, only grow upward when a long
# description like AVATAR OF FLAME (155 chars) needs more room.
func _sync_offer_panel_height() -> void:
	if not is_instance_valid(info_panel) or not is_instance_valid(desc_label):
		return
	# Baseline from the .tscn — keep this as the floor so common-case
	# short descriptions don't visually shrink the panel.
	const BASELINE_TOP: float = -220.0
	const BASELINE_BOTTOM: float = -100.0
	const BASELINE_HEIGHT: float = BASELINE_BOTTOM - BASELINE_TOP  # 120
	const DESC_VERTICAL_MARGIN: float = 38.0  # NameLabel area (34) + bottom pad (4)
	var max_needed: float = BASELINE_HEIGHT
	# Walk the offer group and ask each sibling pedestal what height its
	# DescLabel needs. get_minimum_size on an autowrapped Label returns
	# the content height for its current width — exactly what we want.
	for other in get_tree().get_nodes_in_group("pedestal_offer"):
		if not is_instance_valid(other):
			continue
		var other_desc: Label = other.get_node_or_null("InfoPanel/DescLabel") as Label
		if other_desc == null:
			continue
		# Force a layout pass so get_minimum_size reflects the wrapped
		# content, not the pre-wrap single-line height.
		other_desc.reset_size()
		var desc_h: float = other_desc.get_minimum_size().y
		var needed: float = desc_h + DESC_VERTICAL_MARGIN
		if needed > max_needed:
			max_needed = needed
	# Apply the unified height (anchored at the panel BOTTOM so the
	# Orb/Plinth stack below stays put — the panel grows UPWARD).
	for other in get_tree().get_nodes_in_group("pedestal_offer"):
		if not is_instance_valid(other):
			continue
		var other_panel: Panel = other.get_node_or_null("InfoPanel") as Panel
		if other_panel == null:
			continue
		other_panel.offset_top = BASELINE_BOTTOM - max_needed
		other_panel.offset_bottom = BASELINE_BOTTOM

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
		# Iter 53 — mythic tier audio. Layered on top of the generic
		# pickup_claimed chime so the rare 4th-tier acquisition has
		# its own dramatic rising sweep. Mythic-tier check reads the
		# relic registry, no special pedestal state needed.
		var tier_info: Dictionary = GameState.relic_info(relic_id)
		if str(tier_info.get("tier", "common")) == "mythic":
			Events.pickup_mythic.emit(global_position)
	# Brief outro tween — orb swells + fades, plinth dims, then we
	# delete the pedestal. Disable collision immediately so a queued
	# interact doesn't double-trigger.
	monitoring = false
	var tween: Tween = create_tween().set_parallel(true)
	tween.tween_property(orb, "scale", orb.scale * 1.8, 0.35).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_property(orb, "modulate:a", 0.0, 0.35)
	tween.tween_property(glow, "energy", 0.0, 0.35)
	tween.tween_property(plinth, "modulate:a", 0.4, 0.35)
	# Iter 28 — fade the new framing nodes alongside the orb. info_panel
	# carries the tier-colored backdrop + labels; halo_sprite frames the
	# icon; tier_cap is the strip atop the plinth. Without these the
	# outro would dim the orb but leave the labels + frame at full
	# opacity, which reads as "the relic vanished but its sign stayed."
	if info_panel != null:
		tween.tween_property(info_panel, "modulate:a", 0.0, 0.35)
	if halo_sprite != null:
		tween.tween_property(halo_sprite, "modulate:a", 0.0, 0.35)
	if tier_cap != null:
		tween.tween_property(tier_cap, "modulate:a", 0.0, 0.35)
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
	# Iter 28 — info_panel carries name+desc as children, so fading the
	# panel automatically dims the labels with it. Halo + cap fade in
	# parallel so the entire shrine recedes as a unit.
	if info_panel != null:
		tween.tween_property(info_panel, "modulate:a", 0.0, 0.45)
	if halo_sprite != null:
		tween.tween_property(halo_sprite, "modulate:a", 0.0, 0.45)
	if tier_cap != null:
		tween.tween_property(tier_cap, "modulate:a", 0.0, 0.45)
	# Match the claim outro: tier effects fade with the orb.
	if _rare_ring != null:
		tween.tween_property(_rare_ring, "modulate:a", 0.0, 0.45)
	if _legendary_aura != null:
		_legendary_aura.emitting = false
	tween.chain().tween_callback(queue_free)
