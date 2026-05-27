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
# Iter 178 — bob amplitudes standardized. Pre-iter-178 legendary was
# 8.0 (visibly distinct lift) but the inconsistency read as "the
# legendary is broken / jumping" next to its 4.0 siblings. Same
# amplitude across all tiers; tier is communicated by the orb tint,
# tier_cap, halo color, and now the active glow ring — no need to
# overload the bob with rarity info.
const BOB_AMP_COMMON: float = 5.0
const BOB_AMP_RARE: float = 5.0
const BOB_AMP_LEGENDARY: float = 5.0
const RARE_RING_RADIUS: float = 30.0
const RARE_RING_VERTS: int = 12
const RARE_RING_DURATION: float = 1.4
# Iter 67 — pedestal info-panel layout constants.
# DESC_INNER_WIDTH = 196 px panel - 4 px L pad - 4 px R pad. Pinned as
# custom_minimum_size.x on DescLabel so get_minimum_size().y reflects
# the WRAPPED content height; without it Godot returns the single-line
# height and the height-sync was a no-op for descriptions ≥ 2 lines.
# MAX_PANEL_HEIGHT bounds the upward growth so a runaway flavor text
# can't shove the panel off-screen — if needed > MAX, drop font size 1
# point and re-measure. 160 px ≈ 8 wrapped lines at font_size=11.
# Iter 178 — panel narrowed from 196 → 168 px, so DescLabel inner width
# is 160 px (168 - 4 - 4 padding). Was 188.
const DESC_INNER_WIDTH: float = 160.0
# iter-108 readability pass: MAX_PANEL_HEIGHT bumped 160→220 to fit the
# 14-pt description font (was 12 pt). Longer descriptions like
# AVATAR OF FLAME (155 chars) still need 5-6 wrapped lines at the new
# font, and at line_separation = 2 each row eats ~22 px vs the prior
# ~18, so the cap had to grow ~30%. DESC_FONT_SHRUNK fallback raised
# 11→13 — the previous 11-pt shrink was almost as small as the
# pre-iter-108 base font; that's not really "readable fallback."
const MAX_PANEL_HEIGHT: float = 220.0
const DESC_FONT_SHRUNK: int = 13

@export var relic_id: String = "iron_fang"

# Iter 235 / Fun Ideas Team R3 — Cursed Pickup variant. When the main.gd
# pedestal-offer roller picks a curse for this pedestal, it sets
# cursed_curse_id to one of the CursedPickup.CURSE_CATALOG ids before
# _ready fires. The pedestal then renders a dark-violet aura + badge,
# and _claim applies the curse via CursedPickup.apply_curse alongside
# the normal grant_relic. Empty string = uncursed (vast majority).
@export var cursed_curse_id: String = ""

# Iter 235 — cursed visual constants. Distinct from the tier palette so
# a cursed COMMON still reads "this is the dangerous one" against an
# adjacent clean LEGENDARY. The dark-violet sits between BoI curse-room
# purple and Hades shop magenta — recognizable risk grammar.
const CURSED_AURA_COLOR: Color = Color(0.55, 0.20, 0.65, 0.55)
const CURSED_BADGE_BG: Color = Color(0.20, 0.08, 0.25, 0.90)
const CURSED_BADGE_FG: Color = Color(0.95, 0.65, 1.0, 1.0)

# iter-237 / Polish Team R4 — cursed COMMIT drama constants. The
# pickup moment was anticlimactic in iter-235 (claim → curse silently
# applied → outro tween). These constants drive a 0.4s-scaled-time
# slow-mo (real-time 0.2s) + violet flame burst + 1.5s embedded aura
# under the hero so the player feels the curse landing.
#
# Time-scale machinery: a SceneTreeTimer with ignore_time_scale=true
# restores Engine.time_scale to 1.0 after CURSED_SLOWMO_REAL_TIME real
# seconds, independent of the pedestal's queue_free lifetime. The
# pedestal's outro tween (0.35s) ends well after the slowmo restore.
const CURSED_SLOWMO_SCALE: float = 0.5
const CURSED_SLOWMO_REAL_TIME: float = 0.2     # 0.4s scaled @ 0.5x = 0.2s real
const CURSED_FLAME_PARTICLES: int = 24
const CURSED_FLAME_LIFETIME: float = 0.8
const CURSED_FLAME_COLOR: Color = Color(0.78, 0.30, 0.95, 1.0)
const CURSED_EMBED_AURA_DUR: float = 1.5
const CURSED_EMBED_AURA_COLOR: Color = Color(0.62, 0.22, 0.78, 0.85)

# Cached visual refs for the cursed overlay so _claim / _dismiss can
# tween them in parallel with the orb fade. Both null on a clean pickup.
var _cursed_aura: PointLight2D = null
var _cursed_badge: Node2D = null

# Iter 178 — Plinth is now a Node2D wrapper around 3 Polygon2Ds + 1
# Line2D (was a single Panel). Same name + path so _claim / _dismiss
# tweens that target `plinth.modulate:a` still work — Node2D inherits
# CanvasItem.modulate which propagates to children visually.
@onready var plinth: Node2D = $Plinth
@onready var orb: Sprite2D = $Orb
@onready var name_label: Label = $InfoPanel/NameLabel
@onready var desc_label: Label = $InfoPanel/DescLabel
@onready var prompt: Label = $Prompt
# Iter 163 — theme synergy line below the InfoPanel. Populated at
# _ready based on this relic's themes vs the player's currently
# owned relics. Empty when the relic has no themes.
@onready var synergy_label: Label = $SynergyLabel

# Iter 163 — theme display names + per-theme color tints. Matches
# the slime-depths/src/themes.js palette + the iter-66 audio
# ascendance colors. Falls back to neutral white when a theme isn't
# in this table (defensive — RELIC_REGISTRY only contains these 5).
const THEME_DISPLAY: Dictionary = {
	"storm":  "STORM",
	"flame":  "FLAME",
	"blood":  "BLOOD",
	"vow":    "VOW",
	"shadow": "SHADOW",
}
const THEME_COLORS: Dictionary = {
	"storm":  Color(0.55, 0.85, 1.0,  1.0),
	"flame":  Color(1.0,  0.62, 0.30, 1.0),
	"blood":  Color(0.90, 0.30, 0.36, 1.0),
	"vow":    Color(1.0,  0.88, 0.50, 1.0),
	"shadow": Color(0.72, 0.55, 0.92, 1.0),
}
@onready var glow: PointLight2D = $PointLight2D
# Iter 28 — new framing nodes. info_panel is the bordered backdrop
# behind the name+desc; halo_sprite is the soft tier-colored glow
# under the icon; tier_cap is the colored strip at the top of the
# plinth that indicates rarity even when the orb is off-screen.
@onready var info_panel: Panel = $InfoPanel
@onready var halo_sprite: Sprite2D = $HaloSprite
# Iter 178 — TierCap is now a Polygon2D under the Plinth wrapper.
# Was a ColorRect at the pedestal root pre-iter-178.
@onready var tier_cap: Polygon2D = $Plinth/TierCap
# Iter 178 — new framing nodes. Resolved by node path; the Plinth
# wrapper holds the 3 stone pieces + outline.
@onready var active_glow_ring: Polygon2D = $ActiveGlowRing
@onready var vertical_aura: Sprite2D = $VerticalAura
@onready var orb_shadow: Polygon2D = $OrbShadow
@onready var plinth_side: Polygon2D = $Plinth/PlinthSide
@onready var plinth_top: Polygon2D = $Plinth/PlinthTop
# Tracks the active-glow alpha tween so a rapid enter/exit doesn't
# pile alpha. Same kill-prior pattern as main.gd's pulse helpers.
var _active_glow_tween: Tween = null

var _hero_in_range: bool = false
var _claimed: bool = false
# Per-tier tuning written by _apply_tier_visuals; consumed by _process.
var _glow_energy_base: float = GLOW_ENERGY_BASE_COMMON
var _bob_amplitude: float = BOB_AMP_COMMON
# Iter 252 / Wave 2 lighting — breathing-pulse multiplier. A continuous
# Tween in _ready cycles this 0.85 → 1.30 → 0.85 over 2.0 s (slow
# ritual-chamber breath). _process multiplies the bob-modulated energy by
# this so the breath layers ON TOP of the bob without fighting it. Held
# at field scope so _claim can spike it briefly before the queue_free
# fade-out tween takes over. The actual visible energy at any instant is:
#   glow.energy = (_glow_energy_base + bob_phase * 0.25) * _breathing_mul.
var _breathing_mul: float = 1.0
var _breathing_tween: Tween = null
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
	# Iter 178 — clip_text TRUE so long descriptions clip cleanly at the
	# fixed-size panel edge. Pre-iter-178 the panel grew to fit text;
	# now we have a fixed 168×76 premium card and clipping is the
	# correct overflow handling. Text gets truncated at the panel
	# bottom rather than pushing into the orb space below.
	desc_label.clip_text = true
	# Iter 67 — pin DescLabel inner width + top-alignment in code, so
	# get_minimum_size().y returns the WRAPPED-content height instead of
	# the single-line height (the iter-64 sync was measuring the wrong
	# value, which is why long descriptions still overflowed). 188 =
	# 196 px panel - 4 px L pad - 4 px R pad (offset_left=4, _right=-4).
	# Top-align means all 3 panels' first lines visually agree at the
	# panel top edge regardless of how many wrapped lines each has.
	desc_label.custom_minimum_size = Vector2(DESC_INNER_WIDTH, 0)
	desc_label.vertical_alignment = VERTICAL_ALIGNMENT_TOP
	# Iter 64/67 — sync panel height across the 3-pedestal offer so a long
	# description (FOCUSED EYE, AVATAR OF FLAME) doesn't render with a
	# taller frame than its siblings. Run on the next frame after every
	# pedestal's _ready has computed its DescLabel layout. Uniform width
	# is already enforced by the .tscn (-98 to 98 offsets, locked).
	_sync_offer_panel_height_async()
	# Iter 21 — tier dispatch. Defaults to "common" if a relic is
	# missing the field so a typo never makes the pedestal disappear.
	var tier: String = str(info.get("tier", "common"))
	_apply_tier_visuals(tier)
	# Iter 235 — cursed pickup overlay. If main.gd's pedestal-offer roller
	# tagged this pedestal as cursed before add_child, render the dark-
	# violet aura + small CURSED badge above the name label so the
	# player can SEE the risk from approach distance.
	if cursed_curse_id != "":
		_build_cursed_overlay()
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
				# Iter 178 — TARGET 56 → 44. Smaller icon so it doesn't
				# overlap the (now smaller) info panel above during bob,
				# and the row of three pedestals reads as premium-sized
				# rather than crowded.
				var s: float = 44.0 / max_dim
				orb.scale = Vector2(s, s)
			# Soften the tier tint on the icon itself — the painted art
			# reads poorly under heavy color overlays. The Halo + glow
			# carry the tier hue at full strength.
			orb.modulate = orb.modulate.lerp(Color.WHITE, 0.6)
	# Iter 16 — pedestals spawned as part of a 3-choice offer join
	# this group so they can dismiss each other on claim.
	add_to_group("pedestal_offer")
	# Iter 163 — populate the theme synergy line. Reads this relic's
	# themes array, looks up the player's current owned counts, and
	# decides whether picking this relic would tip into RESONANCE
	# (≥2 owned) or ASCENDANCE (≥4 owned) — both displayed with
	# a star + theme color so the build payoff is legible at a glance.
	_populate_synergy_label(info)
	# Iter 165 — rise-in animation. Pre-iter-165 pedestals just snapped
	# into existence at their fixed spawn positions when the wave
	# cleared — felt like a debug spawn, not a reward. Now each one
	# scales from 0.4 → 1.0 + fades alpha 0 → 1 over 0.55 s with
	# TRANS_BACK ease-out for a slight overshoot. Reads as "rising
	# from the floor / materializing" which is the right beat for
	# the relic-offer moment. All 3 rise simultaneously (the parent
	# spawns them on the same frame); no per-pedestal stagger because
	# matching the SoundCloud/wave-clear timing matters more than
	# choreographing the three.
	_play_rise_in_animation()
	# Iter 252 / Wave 2 lighting — start the slow gold breathing pulse so
	# the pedestal reads as a lit ritual focus from across a dark room.
	# Layered on top of the bob-driven energy ripple in _process via
	# _breathing_mul (see field comment + _process docstring).
	_start_breathing_pulse()

# Iter 252 / Wave 2 lighting — slow continuous pulse (2.0 s cycle) on the
# breathing multiplier. Tween held at field scope so _claim can kill it
# before spiking energy on pickup. Loops infinite while the pedestal is
# unclaimed; cleared in _claim / _dismiss before the outro tween.
func _start_breathing_pulse() -> void:
	if _breathing_tween != null and _breathing_tween.is_valid():
		_breathing_tween.kill()
	_breathing_tween = create_tween().set_loops()
	# 0.85 → 1.30 → 0.85 over 2.0 s. Range chosen so the breath is felt
	# but doesn't flicker — same rate-of-change a sleeping creature's
	# chest follows.
	_breathing_tween.tween_property(self, "_breathing_mul", 1.30, 1.0)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	_breathing_tween.tween_property(self, "_breathing_mul", 0.85, 1.0)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)

func _play_rise_in_animation() -> void:
	modulate.a = 0.0
	scale = Vector2(0.4, 0.4)
	var tw: Tween = create_tween().set_parallel(true)
	tw.tween_property(self, "modulate:a", 1.0, 0.55)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(self, "scale", Vector2.ONE, 0.55)\
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)

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
	var bob_phase: float = sin(t * 2.2)
	var bob_y: float = -80.0 + bob_phase * _bob_amplitude
	orb.position.y = bob_y
	if halo_sprite != null:
		halo_sprite.position.y = bob_y
	if glow != null:
		glow.position.y = bob_y
		# Iter 252 — layered modulation: tier base + bob ripple + slow
		# breathing pulse (driven by _breathing_tween started in _ready).
		# All three signals are multiplicative on the underlying tier base,
		# so a LEGENDARY breath swells dramatically while COMMON breathes
		# subtly — rarity stays legible at every phase of the cycle.
		glow.energy = (_glow_energy_base + bob_phase * 0.25) * _breathing_mul
	# Iter 178 — orb shadow shrinks/grows inverse to bob: when the orb
	# lifts (bob_phase < 0 in our sin sign convention here means UP
	# since y goes more-negative when bob_phase is negative — orb.y
	# = -80 + phase*amp, so phase = +1 means y = -75, phase = -1
	# means y = -85). When orb is HIGHER (phase ≈ -1), the shadow
	# should SHRINK. Map phase ∈ [-1, +1] to shadow scale ∈ [0.7, 1.1].
	# Same depth cue main characters in 2D platformers use.
	if orb_shadow != null:
		var shadow_scale: float = lerpf(0.7, 1.1, (bob_phase + 1.0) * 0.5)
		orb_shadow.scale = Vector2(shadow_scale, shadow_scale)

# ── Tier visuals ─────────────────────────────────────────────────────
# Dispatch table. Unknown tiers fall through to the common baseline so
# a future "mythic" string in the registry won't render as an invisible
# pedestal — it just renders as common until this match grows a branch.
# Iter 163 — synergy display. For each theme this relic carries:
#   • Compute `would_have = current_owned + 1` (post-pickup count).
#   • If would_have >= ASCENDANCE_THRESHOLD AND current < threshold →
#     "STORM ★ ASCENDANCE" — biggest payoff, gold star + theme tint.
#   • If would_have >= RESONANCE_THRESHOLD AND current < threshold →
#     "STORM ★ RESONANCE" — tipping into the first synergy tier.
#   • Else if current_owned >= 1 → "STORM ×3" — informational; the
#     player already has stacks but isn't tipping into a new tier.
#   • Else → "STORM" alone — flat theme tag for newcomers.
#
# When the relic has multiple themes (e.g. nightblade is storm+shadow)
# we line them up separated by " · ". Color is the FIRST theme's tint;
# the secondary theme inherits brightness via the outline. Keeps the
# label single-line + readable.
func _populate_synergy_label(info: Dictionary) -> void:
	if synergy_label == null:
		return
	var themes: Array = info.get("themes", [])
	if themes.is_empty():
		synergy_label.text = ""
		return
	var parts: Array[String] = []
	var primary_color: Color = Color(0.85, 0.85, 0.95, 1.0)
	var any_tipping: bool = false
	for i in range(themes.size()):
		var t: String = str(themes[i])
		var display: String = THEME_DISPLAY.get(t, t.to_upper())
		var owned: int = 0
		if "theme_count" in GameState:
			owned = GameState.theme_count(t)
		var would_have: int = owned + 1
		var resonance_thr: int = GameState.RESONANCE_THRESHOLD if "RESONANCE_THRESHOLD" in GameState else 2
		var ascendance_thr: int = GameState.ASCENDANCE_THRESHOLD if "ASCENDANCE_THRESHOLD" in GameState else 4
		var segment: String = display
		if would_have >= ascendance_thr and owned < ascendance_thr:
			segment = "%s ★ ASCENDANCE" % display
			any_tipping = true
		elif would_have >= resonance_thr and owned < resonance_thr:
			segment = "%s ★ RESONANCE" % display
			any_tipping = true
		elif owned >= 1:
			segment = "%s ×%d" % [display, would_have]
		parts.append(segment)
		if i == 0:
			primary_color = THEME_COLORS.get(t, primary_color)
	synergy_label.text = "  ·  ".join(parts)
	# When any theme is tipping into a new tier, brighten the
	# overall color so the line POPS. Otherwise dim it slightly so
	# the "informational" case reads as quiet annotation.
	if any_tipping:
		synergy_label.add_theme_color_override("font_color", primary_color)
	else:
		var dimmed: Color = primary_color.lerp(Color(0.78, 0.78, 0.86, 1.0), 0.45)
		synergy_label.add_theme_color_override("font_color", dimmed)

func _apply_tier_visuals(tier: String) -> void:
	match tier:
		"rare":
			orb.modulate = ORB_TINT_RARE
			_glow_energy_base = GLOW_ENERGY_BASE_RARE
			_bob_amplitude = BOB_AMP_RARE
			if glow != null:
				glow.color = GLOW_COLOR_RARE
			_tint_frame(GLOW_COLOR_RARE)
			# Iter 178 — rare ring removed. Pre-iter-178 rare pedestals
			# spawned a Line2D ring (iter-21) that competed with the
			# new ActiveGlowRing for attention. Rarity is now in
			# tier_cap + halo + vertical aura + border + orb tint —
			# five overlapping channels. The extra ring was noise.
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
		# Iter 178 — soft border. Pre-iter-178 active state slammed a
		# harsh 2-px white border; the default rest state still used
		# the full tier saturation. Now: rest state uses a dim mix of
		# tier color + dark cream (subdued), active state (via
		# _on_body_entered's glow ring + brightened halo) carries the
		# attention. Border width is locked to 1 px in the .tscn.
		var dim_border: Color = tier_color.lerp(Color(0.50, 0.42, 0.30, 1.0), 0.35)
		sb.border_color = Color(dim_border.r, dim_border.g, dim_border.b, 0.85)
		info_panel.add_theme_stylebox_override("panel", sb)
	if halo_sprite != null:
		halo_sprite.modulate = Color(tier_color.r, tier_color.g, tier_color.b, 0.55)
	if tier_cap != null:
		# Iter 178 — TierCap is now a Polygon2D, not ColorRect. Use .color.
		tier_cap.color = tier_color
	# Iter 178 — vertical aura takes the tier color. Alpha is locked
	# in the gradient texture; we only swap the hue via modulate.
	if vertical_aura != null:
		vertical_aura.modulate = Color(tier_color.r, tier_color.g, tier_color.b, 0.55)
	# Iter 178 — pre-tint the active glow ring so it's ready to
	# brighten on body_entered. Alpha 0 baseline (invisible at rest).
	if active_glow_ring != null:
		active_glow_ring.color = Color(tier_color.r, tier_color.g, tier_color.b, 0.0)

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

# Iter 67 — fire-and-forget wrapper. The async coroutine below must
# await a frame before measuring, but _ready itself is not async; this
# wrapper bridges. Using call_deferred would re-introduce the iter-64
# bug where the label hadn't yet wrapped when min-size was queried.
func _sync_offer_panel_height_async() -> void:
	_sync_offer_panel_height()

# Iter 64/67 — panel-height uniformity across a pedestal_offer group.
#
# ROOT CAUSE of the iter-64 follow-up bug: get_minimum_size() on an
# autowrap Label only returns the WRAPPED height when (a) the label has
# completed at least one layout pass with its final width, AND (b) the
# label has a defined inner width (custom_minimum_size.x). Iter 64 set
# neither — it called reset_size() then immediately read get_minimum_size,
# which returned the SINGLE-LINE height (because reset_size collapses
# the rect, undoing whatever wrap pass had happened). So all 3 panels
# stayed at the baseline 120 px even when a description needed 5 lines,
# and the long-description text overflowed the panel bottom.
#
# FIX (iter 67):
#   1. Pin DescLabel custom_minimum_size.x = DESC_INNER_WIDTH in _ready.
#      This is the width Godot will wrap to; without it, autowrap height
#      is undefined.
#   2. await get_tree().process_frame TWICE here. One frame for Godot
#      to apply the custom_minimum_size; a second for the wrap pass to
#      complete. After that, get_minimum_size().y returns the true
#      wrapped content height.
#   3. If the max needed height exceeds MAX_PANEL_HEIGHT, shrink the
#      desc font_size from 12 → 11 on every sibling, await two more
#      frames, and re-measure. Caps runaway growth on legendary-tier
#      flavor text without sacrificing legibility.
#
# The .tscn-defined minimum (120 px tall, -220 to -100) is the floor —
# we never SHRINK below the baked design, only grow upward when a long
# description like AVATAR OF FLAME (155 chars) needs more room.
func _sync_offer_panel_height() -> void:
	# Iter 178 — sync simplified. Pre-iter-178 this function MEASURED
	# the tallest description's wrapped height across the 3-pedestal
	# offer and grew every panel upward to match, with a font-shrink
	# fallback when MAX_PANEL_HEIGHT was exceeded. That was right for
	# the iter-28 design (variable-height cards expanding to fit
	# flavor text).
	#
	# The iter-178 design uses FIXED-size cards (168×76) with
	# clip_text = true on DescLabel — long descriptions clip cleanly
	# rather than blowing the card up. No measurement needed; just
	# pin every offer's panel to the iter-178 baked offsets so a
	# theme change or scene re-instance can't drift.
	if not is_instance_valid(info_panel):
		return
	const PANEL_TOP: float = -196.0
	const PANEL_BOTTOM: float = -120.0
	# One frame for sibling pedestals to have completed _ready (the
	# offer group is fully populated by then). No measure await
	# needed — fixed sizes.
	await get_tree().process_frame
	if not is_inside_tree():
		return
	for other in get_tree().get_nodes_in_group("pedestal_offer"):
		if not is_instance_valid(other):
			continue
		var other_panel: Panel = other.get_node_or_null("InfoPanel") as Panel
		if other_panel == null:
			continue
		other_panel.offset_top = PANEL_TOP
		other_panel.offset_bottom = PANEL_BOTTOM

# Iter 67 helper — walks the offer group and returns the tallest
# "needed" height (DescLabel wrapped height + vertical margin), clamped
# to at least the baseline. Split out so the font-shrink fallback path
# can re-call it after retuning font_size.
func _measure_max_desc_height(baseline: float, vmargin: float) -> float:
	var max_needed: float = baseline
	for other in get_tree().get_nodes_in_group("pedestal_offer"):
		if not is_instance_valid(other):
			continue
		var other_desc: Label = other.get_node_or_null("InfoPanel/DescLabel") as Label
		if other_desc == null:
			continue
		var desc_h: float = other_desc.get_minimum_size().y
		var needed: float = desc_h + vmargin
		if needed > max_needed:
			max_needed = needed
	return max_needed

func _on_body_entered(body: Node) -> void:
	if _claimed:
		return
	if body.is_in_group("hero"):
		_hero_in_range = true
		prompt.visible = true
		_set_active_glow(true)

func _on_body_exited(body: Node) -> void:
	if body.is_in_group("hero"):
		_hero_in_range = false
		prompt.visible = false
		_set_active_glow(false)

# Iter 178 — active glow ring + soft halo brighten when the hero is in
# range. Replaces the prior "harsh white border" pattern. Brings the
# tier color forward instead of layering a neutral outline on top —
# preserves rarity grammar at the moment of selection.
const ACTIVE_GLOW_PEAK_ALPHA: float = 0.45
const ACTIVE_GLOW_TWEEN_DUR: float = 0.18

func _set_active_glow(on: bool) -> void:
	if active_glow_ring == null:
		return
	if _active_glow_tween != null and _active_glow_tween.is_valid():
		_active_glow_tween.kill()
	var target_alpha: float = ACTIVE_GLOW_PEAK_ALPHA if on else 0.0
	_active_glow_tween = create_tween()
	_active_glow_tween.tween_property(active_glow_ring, "color:a", target_alpha, ACTIVE_GLOW_TWEEN_DUR)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)

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
	# Iter 235 — apply the cursed-pickup curse alongside the relic grant.
	# Folds through GameState.shrine_bonuses → modifier_total, same path
	# as Pact Altar curses + Shrine of Vows boons. Only fires when the
	# relic was actually granted (a re-pickup of an owned relic shouldn't
	# re-apply the curse).
	if granted and cursed_curse_id != "":
		CursedPickup.apply_curse(cursed_curse_id, GameState)
		# Tiny "+ curse name" floater above the standard pickup banner
		# so the player gets explicit feedback on what just hit them.
		var curse_entry: Dictionary = CursedPickup.get_curse(cursed_curse_id)
		var curse_label: String = str(curse_entry.get("label", "CURSE"))
		var num: DamageNumber = DamageNumber.spawn(
			global_position + Vector2(0, -140),
			"+ " + curse_label,
			CURSED_BADGE_FG,
		)
		var parent_node_curse: Node = get_parent()
		if parent_node_curse != null:
			parent_node_curse.add_child(num)
		else:
			num.queue_free()
		# iter-237 / Polish Team R4 — commit drama. Slow-mo + violet
		# flame burst + 1.5s embedded aura under the hero. Plus a
		# deep-violet "CURSED <NAME>" floater above the existing
		# curse-effect floater so the player gets a two-line stack
		# explaining what just happened. The drama helper handles the
		# time-scale restore on its own SceneTreeTimer so the pedestal
		# can queue_free below without leaking slow-mo.
		var dramatic_label: DamageNumber = DamageNumber.spawn(
			global_position + Vector2(0, -172),
			"CURSED " + curse_label,
			CURSED_EMBED_AURA_COLOR,
		)
		if parent_node_curse != null:
			parent_node_curse.add_child(dramatic_label)
		else:
			dramatic_label.queue_free()
		_play_cursed_commit_drama()
	# Spawn a pickup banner (damage-number-shaped). Yellow + bigger
	# than damage numbers so it reads as a real beat.
	var n: DamageNumber = DamageNumber.spawn(
		global_position + Vector2(0, -100),
		str(GameState.relic_info(relic_id).get("name", relic_id)) + (" CLAIMED" if granted else " (already owned)"),
		Color(1, 0.85, 0.45)
	)
	# iter-72 bug-fix: defensive get_parent() null guard. Parent should
	# always be main.gd, but during scene teardown (an unlikely but
	# possible interleave with a final-frame claim) it could be null.
	var parent_node: Node = get_parent()
	if parent_node != null:
		parent_node.add_child(n)
	else:
		n.queue_free()
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
	# Iter 252 / Wave 2 lighting — kill the breathing pulse and spike the
	# light briefly so the claim moment reads as a flash of acknowledgment
	# before the pedestal recedes. The 0.35s tween below fades glow.energy
	# to 0 starting from this elevated spike value (1.5× tier base) — the
	# player sees a bright flare → dim → gone. _process won't overwrite
	# the glow during the fade because _claimed is set TRUE at the top of
	# this function and _process early-returns on _claimed.
	if _breathing_tween != null and _breathing_tween.is_valid():
		_breathing_tween.kill()
	if glow != null:
		glow.energy = _glow_energy_base * 1.5
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
	# Iter 235 — fade the cursed overlay alongside the orb. PointLight2D
	# tweens energy → 0; the badge Node2D's children inherit modulate.
	if _cursed_aura != null:
		tween.tween_property(_cursed_aura, "energy", 0.0, 0.35)
	if _cursed_badge != null:
		tween.tween_property(_cursed_badge, "modulate:a", 0.0, 0.35)
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
	# Iter 252 / Wave 2 lighting — stop the breathing pulse so the
	# dismissed pedestal recedes cleanly. Without this, the looped tween
	# keeps writing _breathing_mul each frame; _process early-returns on
	# _claimed so it wouldn't reach glow.energy anyway, but killing the
	# tween is cheap and keeps the tween bank clean for GC.
	if _breathing_tween != null and _breathing_tween.is_valid():
		_breathing_tween.kill()
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
	# Iter 235 — fade the cursed overlay with the rest of the pedestal.
	if _cursed_aura != null:
		tween.tween_property(_cursed_aura, "energy", 0.0, 0.45)
	if _cursed_badge != null:
		tween.tween_property(_cursed_badge, "modulate:a", 0.0, 0.45)
	tween.chain().tween_callback(queue_free)

# Iter 235 / Fun Ideas Team R3 — Cursed pedestal overlay. Two parts:
#   A) Dark-violet PointLight2D anchored at the orb's bob center, low
#      energy + slow pulse — distinct from the tier glow's color +
#      cadence so a cursed COMMON reads differently from a clean RARE
#      at distance.
#   B) Small CURSED badge (Polygon2D background + Label text) docked
#      above the InfoPanel so the player sees both the relic name AND
#      the curse name BEFORE pressing E. Reads "cursed pedestal" from
#      anywhere on screen.
#
# Both nodes are tracked on _cursed_aura / _cursed_badge so the
# _claim and _dismiss tweens above can fade them in parallel with the
# orb. The pulse is driven by a self-restarting Tween on the aura so
# we don't have to add another _process branch.
func _build_cursed_overlay() -> void:
	# A) Aura — dark-violet point light at orb center, low energy so it
	# adds menace WITHOUT washing out the tier color underneath.
	var aura: PointLight2D = PointLight2D.new()
	aura.name = "CursedAura"
	aura.color = CURSED_AURA_COLOR
	aura.energy = 0.85
	aura.texture_scale = 1.7
	aura.position = Vector2(0, -80)  # match orb bob center
	aura.range_z_min = -1024
	aura.range_z_max = 1024
	add_child(aura)
	_cursed_aura = aura
	# Slow pulse — separate from the orb's tier-glow pulse so the two
	# don't sync up and merge visually. 1.6 s period chosen for "patient,
	# hungry" feel rather than "active, ready."
	var pulse_tween: Tween = aura.create_tween().set_loops()
	pulse_tween.tween_property(aura, "energy", 1.25, 0.8)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	pulse_tween.tween_property(aura, "energy", 0.65, 0.8)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	# B) Badge — small "CURSED" label with a dark-violet pill background.
	# Anchored above the InfoPanel so it's the FIRST thing the player
	# reads when approaching the pedestal.
	var badge: Node2D = Node2D.new()
	badge.name = "CursedBadge"
	badge.position = Vector2(0, -208)
	add_child(badge)
	_cursed_badge = badge
	# Pill background — rounded rectangle approximated with a 12-vertex
	# polygon (looks rounded enough at this size without the cost of
	# a StyleBoxFlat). Width sized to fit "CURSED" at font_size 12.
	var pill: Polygon2D = Polygon2D.new()
	const PILL_HALF_W: float = 38.0
	const PILL_HALF_H: float = 9.0
	const PILL_R: float = 6.0
	var pill_pts: PackedVector2Array = PackedVector2Array()
	# Build rounded rect: 4 corner arcs joined by straight edges.
	# 4 arcs × 4 verts each = 16 verts total — cheap.
	for corner in 4:
		var cx: float = (PILL_HALF_W - PILL_R) * (1 if (corner == 0 or corner == 3) else -1)
		var cy: float = (PILL_HALF_H - PILL_R) * (1 if (corner >= 2) else -1)
		var start_angle: float = float(corner) * (TAU / 4.0) - TAU * 0.25
		for v in 4:
			var ang: float = start_angle + (TAU / 16.0) * v
			pill_pts.append(Vector2(cx + PILL_R * cos(ang), cy + PILL_R * sin(ang)))
	pill.polygon = pill_pts
	pill.color = CURSED_BADGE_BG
	badge.add_child(pill)
	# Label — "CURSED" at font_size 11, foreground in the magenta tint
	# with a heavy outline for readability over any tier color or biome.
	var label: Label = Label.new()
	label.text = "CURSED"
	label.add_theme_font_size_override("font_size", 11)
	label.add_theme_color_override("font_color", CURSED_BADGE_FG)
	label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.95))
	label.add_theme_constant_override("outline_size", 3)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.position = Vector2(-PILL_HALF_W, -PILL_HALF_H - 1)
	label.size = Vector2(PILL_HALF_W * 2.0, PILL_HALF_H * 2.0 + 2)
	badge.add_child(label)

# iter-237 / Polish Team R4 — cursed-pickup commit drama.
#
# Hook point: called from _claim() AFTER the curse is applied + the
# "+ <LABEL>" floater is spawned. Three layered effects so the moment
# "feels embedded":
#
#   1. Engine slow-mo at CURSED_SLOWMO_SCALE (0.5) for 0.4s scaled time
#      (= CURSED_SLOWMO_REAL_TIME real seconds). The restore SceneTreeTimer
#      runs with ignore_time_scale=true so it fires reliably even though
#      Engine.time_scale is mid-stretch.
#   2. Violet flame burst at the HERO position (not the pedestal — the
#      curse is landing ON the hero) using a CPUParticles2D one-shot.
#      Lives ~0.8s real-time then queue_frees itself.
#   3. Pulsing violet PointLight2D under the hero for 1.5s, signaling the
#      curse is "embedded" into the build. Fades out via a tween.
#
# Defensive design: all spawned nodes are attached to the parent (main.gd
# scene) — NOT the pedestal — because the pedestal queue_frees ~0.35s
# after this call. Attaching to the parent keeps the burst and aura
# alive past pedestal teardown.
#
# Hero lookup: scan for the first node in group "hero" (the same group
# used by the on_body_entered handler above). If no hero is found
# (test stubs, headless preview, transition windows), fall back to the
# pedestal's global_position so the burst at least plays somewhere
# visible.
func _play_cursed_commit_drama() -> void:
	# 1. Slow-mo. We do NOT participate in main.gd's _hit_stop_timer —
	# that's tied to combat hit-stops and getting interleaved here would
	# stomp on each other. Independent one-shot timer keeps the two
	# systems decoupled.
	Engine.time_scale = CURSED_SLOWMO_SCALE
	# ignore_time_scale=true → counts in real seconds regardless of the
	# slow-mo we just set. Without this, the restore would itself be
	# slowed and the curse drama would stretch into the outro tween.
	var restore_timer: SceneTreeTimer = get_tree().create_timer(
		CURSED_SLOWMO_REAL_TIME, true, false, true,
	)
	restore_timer.timeout.connect(_restore_time_scale_after_curse)
	# 2. Violet flame burst at the hero. Attach to parent so it
	# outlives the pedestal. Hero may be missing in test/preview — the
	# fallback to pedestal position keeps the call safe.
	var hero_pos: Vector2 = global_position
	var heroes: Array = get_tree().get_nodes_in_group("hero")
	if heroes.size() > 0 and heroes[0] is Node2D:
		hero_pos = (heroes[0] as Node2D).global_position
	var burst: CPUParticles2D = CPUParticles2D.new()
	burst.name = "CursedCommitBurst"
	burst.position = hero_pos
	burst.one_shot = true
	burst.emitting = true
	burst.explosiveness = 0.95
	burst.amount = CURSED_FLAME_PARTICLES
	burst.lifetime = CURSED_FLAME_LIFETIME
	burst.spread = 180.0
	burst.initial_velocity_min = 110.0
	burst.initial_velocity_max = 170.0
	burst.gravity = Vector2(0, -80)         # rises like flame
	burst.scale_amount_min = 1.6
	burst.scale_amount_max = 2.8
	burst.color = CURSED_FLAME_COLOR
	burst.z_index = 10                       # over the hero sprite
	# Auto-cleanup so the scene doesn't accumulate dead particle nodes.
	var burst_parent: Node = get_parent()
	if burst_parent != null:
		burst_parent.add_child(burst)
		burst.get_tree().create_timer(CURSED_FLAME_LIFETIME + 0.3).timeout\
			.connect(burst.queue_free)
	else:
		burst.queue_free()
	# 3. Pulsing violet aura under the hero. PointLight2D so it tints
	# the hero sprite + floor patch around them. Tween energy with a
	# sine curve so it visibly throbs over the 1.5s "embedded" window,
	# then fades to 0 and frees.
	if burst_parent == null:
		return
	var embed_aura: PointLight2D = PointLight2D.new()
	embed_aura.name = "CursedEmbedAura"
	embed_aura.position = hero_pos
	embed_aura.color = CURSED_EMBED_AURA_COLOR
	embed_aura.energy = 0.0
	embed_aura.texture_scale = 1.4
	embed_aura.range_z_min = -1024
	embed_aura.range_z_max = 1024
	burst_parent.add_child(embed_aura)
	# Pulse in for 0.18s, hold + throb for 1.1s (two pulses), then fade
	# out for 0.22s. Total ~1.5s matches CURSED_EMBED_AURA_DUR.
	var pulse_tween: Tween = embed_aura.create_tween()
	pulse_tween.tween_property(embed_aura, "energy", 1.2, 0.18)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	pulse_tween.tween_property(embed_aura, "energy", 0.6, 0.30)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	pulse_tween.tween_property(embed_aura, "energy", 1.2, 0.30)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	pulse_tween.tween_property(embed_aura, "energy", 0.6, 0.30)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	pulse_tween.tween_property(embed_aura, "energy", 0.0, 0.42)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	pulse_tween.tween_callback(embed_aura.queue_free)

# Single-purpose restore: snap Engine.time_scale back to 1.0. Lives as
# a named method (not a lambda) so the test suite can verify the
# slow-mo wiring via source-grep without depending on inline closure
# text.
func _restore_time_scale_after_curse() -> void:
	Engine.time_scale = 1.0
