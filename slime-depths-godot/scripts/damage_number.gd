# Damage number — a floating Label that drifts up + fades out, then
# frees itself. Spawned by enemies on hit/death.
#
# Usage:
#   var n = DamageNumber.spawn(world_pos, "1", Color.WHITE)
#   add_child(n)
#
# Iter 74 (sprint-3): variant system. Optional 4th arg picks a visual
# style: "normal" (default — what every existing caller gets), "crit",
# "heal", "hero_damage", "resist". Each variant tunes color, size,
# rise distance, lifetime, prefix/suffix text, and motion quirks
# (wobble / shake / arc). All existing callers continue to work
# unchanged because the variant param is optional with a "normal"
# default that matches the pre-iter-74 behavior.
#
# Ported from slime-depths/src/fx.js → spawnDamageNumber.
class_name DamageNumber
extends Label

# iter-243 / Director Phase 1 — RISE knocked from 40 → 24. Numbers
# spawn AT the impact point now (enemy collision-radius top, not the
# enemy head + -64 offset many callers used). A short 24 px float keeps
# the number anchored to WHERE the hit happened — pre-iter-243 the
# 40 px float plus various caller offsets had numbers drifting halfway
# up to the HUD before fading. Hades / Isaac / Diablo all use ~20-30 px
# rises for normal hits; the eye reads "above the impact" without
# losing the impact site.
const RISE        := 24.0     # px drifted up over life
const LIFETIME    := 0.7      # sec total
const FADE_DELAY  := 0.2      # sec at full opacity before fade starts

# Stagger range — when many numbers spawn at the same world position
# (e.g. multi-hit chain lightning), each picks a small horizontal
# offset in this range on _ready so they fan out instead of stacking
# illegibly on top of each other.
const STAGGER_X   := 12.0

# Iter 43 — per-instance _life + _rise so spawn_crit can override them
# (crit numbers rise farther + linger longer). Defaults match the
# pre-iter-43 constants.
var _life: float = LIFETIME
var _rise: float = RISE
var _start_y: float
var _base_x: float = 0.0     # captured after stagger jitter — wobble/shake math reads from this

# Iter 74 — per-variant motion params. These get set by spawn() based
# on the variant string and read by _process every frame.
var _variant: String = "normal"
var _wobble_amp: float = 0.0          # px — horizontal sin wobble (crit only)
var _wobble_freq: float = 14.0        # rad/s
var _shake_amp: float = 0.0           # px — first-frames horizontal jitter (hero_damage)
var _shake_time: float = 0.0          # sec — how long shake lasts
var _gravity: float = 0.0             # px/sec² — slows the rise (arc curve)
var _vy: float = 0.0                  # px/sec — current vertical velocity (negative = rising)
var _use_physics_rise: bool = false   # if true, _vy + _gravity drives Y instead of the eased curve

var _init_life: float = LIFETIME
var _t: float = 0.0                   # accumulated lifetime for wobble phase

# ──────────────────────────────────────────────────────────────────────
# Spawn entry points
# ──────────────────────────────────────────────────────────────────────
#
# spawn() is the canonical entry. The 3-arg form preserves every
# existing caller's contract: `DamageNumber.spawn(pos, str, color)`
# returns a "normal" variant number whose look is identical to the
# pre-iter-74 default. The optional 4th arg selects a visual variant.
#
# Variants:
#   "normal"       — default. Caller's text + color, standard size/rise.
#   "crit"         — 1.5× size, red-orange, "!" suffix, wobble, longer life.
#                    Caller can pass any text; if text is purely digits
#                    the "!" is appended automatically.
#   "heal"         — green-ish, "+" prefix (auto-added if missing),
#                    slower rise, longer life.
#   "hero_damage"  — light red, brief on-spawn shake, slightly larger.
#   "resist"       — dim grey, smaller, marks blocked/reduced hits.
#
# The color param is HONORED for "normal" (existing behavior). For
# styled variants the variant's preset color WINS over the caller's
# color so the visual contract holds even when callers haven't been
# updated. Callers that want to override a variant color can pass
# "normal" + their own color (the legacy path).
static func spawn(
	at: Vector2,
	text: String,
	color: Color = Color(1, 0.95, 0.7),
	variant: String = "normal",
) -> DamageNumber:
	var n: DamageNumber = preload("res://scenes/damage_number.tscn").instantiate()
	n.global_position = at
	n._variant = variant
	# Outline for legibility on the busy floor — every variant gets it
	# so the number stays readable against any backdrop.
	n.add_theme_color_override("font_outline_color", Color(0.04, 0.03, 0.06, 0.95))
	n.add_theme_constant_override("outline_size", 4)
	_apply_variant(n, text, color, variant)
	return n

# Iter 43 — crit helper kept for backward compatibility. Iter 74
# routes it through the unified variant system so the styling stays
# in one place.
static func spawn_crit(at: Vector2, damage: int) -> DamageNumber:
	return spawn(at, str(damage), Color(1.0, 0.85, 0.40), "crit")

# ──────────────────────────────────────────────────────────────────────
# Variant application — applies per-variant styling to the spawned
# instance. Keeping this in one place means new variants land as a
# single match arm without touching the lifecycle code.
# ──────────────────────────────────────────────────────────────────────
static func _apply_variant(
	n: DamageNumber,
	text: String,
	color: Color,
	variant: String,
) -> void:
	match variant:
		"crit":
			# Bigger font, warm red-orange tint, "!" suffix on digit-only
			# text. Wobble + longer life + bigger rise so the crit reads
			# as the highlight of the moment.
			# iter-137 — font_size 33 -> 36 to widen the gap from the new
			# 28 pt normal baseline. Crits should feel ~30% bigger than
			# regular hits, not just 18%.
			# iter-243 / Director Phase 1 — normal damage baseline is now
			# 42 pt (was 28). Crit gets +30 % on top → ~55 pt. Color also
			# shifts toward GOLD (was red-orange) — the brief calls for
			# gold crit feedback to differentiate from the red enemy-
			# damage / hero-damage family.
			var crit_text: String = text
			if not crit_text.ends_with("!") and crit_text.is_valid_int():
				crit_text += "!"
			n.text = crit_text
			n.add_theme_color_override("font_color", Color(1.0, 0.85, 0.40, 1.0))
			n.add_theme_color_override("font_outline_color", Color(0.20, 0.10, 0.0, 0.95))
			n.add_theme_constant_override("outline_size", 5)
			n.add_theme_font_size_override("font_size", 55)
			n.add_theme_constant_override("letter_spacing", 1)
			n._life = 1.0
			n._init_life = 1.0
			n._rise = 64.0
			n._wobble_amp = 3.0
			n._wobble_freq = 14.0
			# Physics rise — fast initial fly-up, gravity decelerates it.
			# Creates a satisfying "pop and settle" arc.
			n._use_physics_rise = true
			n._vy = -130.0
			n._gravity = 90.0
		"heal":
			# Soft green, "+" prefix (auto-added if caller didn't), slow
			# steady rise. Reads as "good thing happened."
			var heal_text: String = text
			if not heal_text.begins_with("+"):
				heal_text = "+" + heal_text
			n.text = heal_text
			n.add_theme_color_override("font_color", Color(0.5, 1.0, 0.55, 1.0))
			n.add_theme_font_size_override("font_size", 24)
			n._life = 1.1
			n._init_life = 1.1
			n._rise = 48.0
		"hero_damage":
			# Light red, slightly bigger than normal, one-shot shake on
			# spawn so the player FEELS the hit register in the HUD.
			# iter-137 — font 26 -> 32. Player damage is more important
			# than enemy damage; should hit harder visually too.
			n.text = text
			n.add_theme_color_override("font_color", Color(1.0, 0.35, 0.35, 1.0))
			n.add_theme_color_override("font_outline_color", Color(0.18, 0.0, 0.02, 0.95))
			n.add_theme_constant_override("outline_size", 5)
			n.add_theme_font_size_override("font_size", 32)
			n._life = 0.85
			n._init_life = 0.85
			n._rise = 44.0
			n._shake_amp = 5.0
			n._shake_time = 0.10
		"resist":
			# Dim grey, smaller — marks "shrugged it off". Wrapped in
			# parens to read distinct from a normal damage number.
			var resist_text: String = text
			if not resist_text.begins_with("("):
				resist_text = "(" + resist_text + ")"
			n.text = resist_text
			n.add_theme_color_override("font_color", Color(0.65, 0.65, 0.7, 0.9))
			n.add_theme_font_size_override("font_size", 18)
			n._life = 0.55
			n._init_life = 0.55
			n._rise = 28.0
		_:
			# "normal" or unrecognized variant — preserve legacy contract:
			# caller's text + color, default size, default rise/life.
			# iter-137 — magnitude-based size scaling. Hades / Isaac /
			# Diablo / virtually every action-roguelike scales damage
			# numbers by hit magnitude so the player FEELS heavy hits
			# without doing math. If the text parses as an integer, we
			# add 0-8 pt on top of the 28 pt baseline depending on hit
			# size. 1 dmg = 28 pt baseline; 3 dmg = 30 pt; 6 dmg = 32 pt;
			# 10+ dmg = 36 pt (caps at +8 to leave headroom under crit).
			# iter-243 / Director Phase 1 — +50 % across the board for
			# damage-number legibility. Normal baseline 28 → 42 pt; the
			# +0..+8 magnitude bonus stretches to +0..+12 to keep the
			# heavy-hit ramp proportional. Crit floats at +30 % on top
			# of THIS baseline (55 pt), so the crit is still the
			# unmistakable highlight beat.
			n.text = text
			n.add_theme_color_override("font_color", color)
			if text.is_valid_int():
				var dmg: int = abs(text.to_int())
				var bonus: int = clampi(dmg - 1, 0, 12)
				n.add_theme_font_size_override("font_size", 42 + bonus)
				# Heavier hits also rise slightly further — extra weight
				# in vertical motion reinforces the "this was a big hit"
				# read without needing extra pixels.
				n._rise = RISE + float(bonus) * 1.5

# ──────────────────────────────────────────────────────────────────────
# Lifecycle
# ──────────────────────────────────────────────────────────────────────
func _ready() -> void:
	# Tiny horizontal jitter so simultaneous numbers don't perfectly
	# overlap. Bounded so it doesn't break the "above the enemy" read.
	# Iter 74 — widened from ±8 to ±12 and exposed as STAGGER_X so chain
	# damage stacks read individually.
	global_position.x += randf_range(-STAGGER_X, STAGGER_X)
	_start_y = global_position.y
	_base_x = global_position.x
	# z_index sits above enemies (default 0) + most FX. The hud is on
	# its own CanvasLayer so it's unaffected.
	z_index = 100

func _process(delta: float) -> void:
	_life -= delta
	_t += delta
	if _life <= 0.0:
		queue_free()
		return
	# Normalize fraction off the SPAWN life so variants with longer
	# lifetimes animate smoothly without parallel timing constants.
	var t := 1.0 - (_life / _init_life)

	# Y motion — two paths. Crit uses physics integration (vy + gravity)
	# for a real arc; every other variant uses the original eased curve.
	if _use_physics_rise:
		_vy += _gravity * delta
		global_position.y += _vy * delta
	else:
		# Ease-out rise — fast early, settles at the top.
		global_position.y = _start_y - _rise * (1.0 - pow(1.0 - t, 2.0))

	# X motion — base position + optional wobble (crit) + optional
	# one-shot shake (hero_damage). Both modulate _base_x so they
	# stack additively without drift.
	var x: float = _base_x
	if _wobble_amp > 0.0:
		x += sin(_t * _wobble_freq) * _wobble_amp
	if _shake_amp > 0.0 and _t < _shake_time:
		x += randf_range(-_shake_amp, _shake_amp)
	global_position.x = x

	# Fade — hold opacity for FADE_DELAY then linear to 0.
	var hold_frac: float = FADE_DELAY / _init_life
	if t > hold_frac:
		var fade_t := (t - hold_frac) / (1.0 - hold_frac)
		modulate.a = 1.0 - fade_t
