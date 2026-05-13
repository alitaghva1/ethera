# ============================================================================
# ATTACK FEEL — composers + tier helpers for visible build growth.
#
# Ported from slime-depths/src/attackFeel.js (the JS reference). Genre
# principle: stats are abstract, visuals are felt. A damage buff that
# doesn't change the visual is a hidden buff.
#
# Three pieces:
#
#   1. compose_slash_opts(hero, ctx) — reads hero state (relic count,
#      active themes, charged/finisher context) and returns a Dictionary
#      of slash visual params:
#        { width, trail_count, arc, dur, color, swing_sign }
#      Width scales with relic count (1 + 0.06 × N, capped 1.6×).
#      Storm theme adds +1 trail. Flame tier-2 widens arc 8%.
#      Theme tint BLENDS into base color at 18-35% per tier.
#
#   2. apply_hit_feedback_tier(target, damage, opts) — fires shake +
#      hit-spark count based on `damage / target.max_hp`:
#        nick      <0.08   tiny spark, no shake
#        solid     <0.25   light shake, small spark count
#        heavy     <0.60   mid shake, more sparks
#        crushing  ≥0.60   hard shake, many sparks
#      Crits upgrade the shake amp + spark count and add a red splash ring.
#
#   3. bolt_damage_tier(damage) — returns 0..3 size tier for blast bolts.
#
# This is a STATIC helper class — no instance state, no autoload. Hero
# calls compose_slash_opts at swing-start; enemy.gd calls
# apply_hit_feedback_tier at take_hit; projectile.gd reads bolt_damage_tier.
# ============================================================================
class_name AttackFeel
extends RefCounted

# Theme RGB lookup. Mirrors ThemePalette but kept as a separate const so
# attack-feel doesn't reach across modules for color math. Values match
# the JS reference (slime-depths/src/attackFeel.js THEME_RGB) scaled to
# Godot's 0..1 Color range.
const THEME_RGB: Dictionary = {
	"storm":  Color(0.45, 0.78, 1.0),   # #72c6ff
	"flame":  Color(1.0,  0.48, 0.16),  # #ff7a2a
	"blood":  Color(0.82, 0.25, 0.31),  # #d04050
	"vow":    Color(1.0,  0.85, 0.33),  # #ffd855
	"shadow": Color(0.53, 0.36, 0.66),  # #865ca8
}

# Pick the dominant theme — the one with the highest tier. Ties resolve
# in declaration order (storm > flame > blood > vow > shadow). Returns
# empty dict if no theme has tier > 0.
static func dominant_theme(_hero) -> Dictionary:
	var best_id := ""
	var best_tier := 0
	for id in ["storm", "flame", "blood", "vow", "shadow"]:
		var t: int = GameState.theme_tier(id) if GameState.has_method("theme_tier") else 0
		if t > best_tier:
			best_id = id
			best_tier = t
	if best_id == "":
		return {}
	return {"id": best_id, "tier": best_tier, "rgb": THEME_RGB[best_id]}

# Linear color mix. ratio 0 = a, 1 = b. Alpha follows a.
static func _mix(a: Color, b: Color, ratio: float) -> Color:
	return Color(
		a.r * (1.0 - ratio) + b.r * ratio,
		a.g * (1.0 - ratio) + b.g * ratio,
		a.b * (1.0 - ratio) + b.b * ratio,
		a.a,
	)

# ============================================================================
# SWORD SLASH COMPOSER
# ============================================================================
#
# Returns a Dictionary the slash_arc setup() consumes:
#   width        float — base stroke width (scaled by build size)
#   trail_count  int   — number of time-offset ghost arcs (motion blur)
#   arc          float — sweep angle in radians (e.g. PI * 0.75)
#   dur          float — total visible duration in seconds
#   color        Color — base stroke color, blended toward dominant theme
#   swing_sign   int   — +1 / -1 for CW / CCW sweep direction (caller passes)
#
# `ctx` is an optional Dictionary of contextual flags:
#   is_charged   bool  — released a charge-attack (bigger / gold)
#   is_finisher  bool  — chain finisher (bigger / orange)
#   swing_index  int   — 0 / 1 / 2 in the chain (style varies per index)
#   swing_sign   int   — passed through to opts.swing_sign
static func compose_slash_opts(hero, ctx: Dictionary = {}) -> Dictionary:
	var is_charged: bool = bool(ctx.get("is_charged", false))
	var is_finisher: bool = bool(ctx.get("is_finisher", false))
	var swing_index: int = int(ctx.get("swing_index", 0))
	var swing_sign: int = int(ctx.get("swing_sign", 1))
	# Iter 149 — combo amplification. Defaults to 0 when caller doesn't
	# supply it (e.g. boss intro sim swings).
	var combo: int = int(ctx.get("combo", 0))

	# Base values — match the JS weapon "sword" defaults.
	var width: float = 14.0 * (1.6 if is_charged else (1.3 if is_finisher else 1.0))
	var trail_count: int = 3 + (3 if is_charged else (1 if is_finisher else 0))
	var arc: float = PI * 0.75 * (1.25 if is_charged else (1.15 if is_finisher else 1.0))
	var dur: float = 0.20 * (1.4 if is_charged else (1.15 if is_finisher else 1.0))

	# BUILD GROWTH — width scales with owned relic count. 1-relic build
	# keeps base width; 10-relic build swings ~60% thicker. Cap at +60%
	# so the slash doesn't dominate the screen on max builds.
	var relic_count: int = 0
	if hero != null and "owned_relics" in GameState:
		relic_count = (GameState.owned_relics as Array).size()
	var relic_growth: float = min(1.6, 1.0 + 0.06 * float(max(0, relic_count)))
	width *= relic_growth

	# THEME BIAS — storm adds +1 trail (faster-feel motion), flame tier-2
	# widens arc 8% (sweep feels heavier). Blood/vow/shadow stay neutral
	# on shape (they tint color below).
	var dom: Dictionary = dominant_theme(hero)
	if not dom.is_empty():
		if dom.id == "storm" and dom.tier >= 1:
			trail_count += 1
		if dom.id == "flame" and dom.tier >= 2:
			arc *= 1.08

	# Base color choice — gold on charged release, ember on finisher,
	# cream on swing-index 1, default off-white otherwise.
	var base: Color = Color(1.0, 1.0, 1.0)
	if is_charged:
		base = Color(1.0, 0.90, 0.55)
	elif is_finisher:
		base = Color(1.0, 0.47, 0.31)
	elif swing_index == 1:
		base = Color(1.0, 0.92, 0.78)

	# THEME TINT BLEND — dominant theme color blends into base at 18% per
	# tier, capped 35%. Charged release stays gold for clarity (no blend).
	if not dom.is_empty() and not is_charged:
		var blend: float = min(0.35, 0.18 * float(dom.tier))
		base = _mix(base, dom.rgb, blend)

	# Iter 149 — combo amplification. Mirrors the HUD label's 10/25/50/100
	# tier thresholds so the slash arc visibly grows in lockstep with the
	# combo counter readout. Width / trail / color all escalate; arc width
	# stays fixed (escalating that AND width would push the slash off-
	# screen on max combo). Tier 4 (100+) shifts color toward gold-warm
	# so the player FEELS the streak peaking, not just sees a number.
	# Charged releases keep their gold-clarity rule from above — combo
	# amplification stacks on top of theme/build/charged math.
	if combo >= 100:
		width *= 1.30
		trail_count += 4
		base = _mix(base, Color(1.0, 0.65, 0.30), 0.30)
	elif combo >= 50:
		width *= 1.18
		trail_count += 3
		base = _mix(base, Color(1.0, 0.78, 0.40), 0.20)
	elif combo >= 25:
		width *= 1.10
		trail_count += 2
	elif combo >= 10:
		width *= 1.05
		trail_count += 1

	return {
		"width": width,
		"trail_count": trail_count,
		"arc": arc,
		"dur": dur,
		"color": base,
		"swing_sign": swing_sign,
	}

# ============================================================================
# HIT FEEDBACK TIERS
# ============================================================================
#
# Damage-as-fraction-of-max-hp drives the tier:
#   nick      <0.08   tiny spark, no shake
#   solid     <0.25   light shake, hit_spark x2
#   heavy     <0.60   mid shake, hit_spark x4
#   crushing  ≥0.60   hard shake, hit_spark x7, screen flash
#
# Crits add a red splash ring on top + bump the tier's shake/spark.
#
# `target` must expose `enemy_type.max_hp` (Enemy node) for the ratio
# calculation. If the field is missing/zero, the function returns "nick"
# and fires nothing — safe degradation.
#
# Calls FX.shake() directly (autoload). The hit_spark scene is spawned
# via FX._on_enemy_hit's existing path — this function ADDS extra sparks
# on top for heavy/crushing tiers via the hit_spark.tscn preload.
static func apply_hit_feedback_tier(target, damage: int, opts: Dictionary = {}) -> String:
	var is_crit: bool = bool(opts.get("is_crit", false))
	var max_hp: int = 1
	if target != null and "enemy_type" in target and target.enemy_type != null \
			and "max_hp" in target.enemy_type:
		max_hp = max(1, int(target.enemy_type.max_hp))
	var ratio: float = float(damage) / float(max_hp)

	var tier: String
	if ratio < 0.08:
		tier = "nick"
	elif ratio < 0.25:
		tier = "solid"
	elif ratio < 0.60:
		tier = "heavy"
	else:
		tier = "crushing"

	# Per-tier shake/spark/flash params. Keep in sync with the JS
	# applyHitFeedbackTier table — same tier names + similar magnitudes.
	var shake_amp: float = 0.0
	var shake_dur: float = 0.0
	var spark_n: int = 1
	match tier:
		"nick":
			shake_amp = 1.5;   shake_dur = 0.08; spark_n = 1
		"solid":
			shake_amp = 4.0;   shake_dur = 0.12; spark_n = 2
		"heavy":
			shake_amp = 7.0;   shake_dur = 0.16; spark_n = 4
		"crushing":
			shake_amp = 11.0;  shake_dur = 0.22; spark_n = 7

	# Crit upgrades shake/spark. Spark count gets +2 splash sparks
	# regardless of tier.
	if is_crit:
		shake_amp = min(13.0, shake_amp * 1.45)
		spark_n += 2

	# Apply feedback. FX.shake clobbers any in-flight shake (see fx.gd
	# _shake) so the latest call wins — that's what we want; if multiple
	# hits land in one frame, the strongest tier dominates.
	if shake_amp > 0.0 and Engine.has_singleton("FX"):
		pass  # autoload accessed via global name below
	if shake_amp > 0.0:
		FX.shake(shake_amp, shake_dur)

	# Sparks beyond the first one. fx.gd's _on_enemy_hit already spawns
	# the first hit_spark for every enemy_hit Event; this layer adds the
	# tier-specific extras around the target's head for higher tiers.
	if spark_n > 1 and target != null:
		var base_pos: Vector2 = target.global_position + Vector2(0, -8)
		# Use FX autoload's hit_spark scene if available, otherwise no-op
		# (defensive — the autoload may not be loaded in test contexts).
		var hit_spark_scene: PackedScene = null
		if "HIT_SPARK_SCENE" in FX:
			hit_spark_scene = FX.HIT_SPARK_SCENE
		var parent: Node = target.get_parent()
		if hit_spark_scene != null and parent != null:
			# Skip the first spark — fx.gd already spawned it. Spawn
			# spark_n-1 extras at slight offsets to fan out the burst.
			for i in range(spark_n - 1):
				var ang: float = (float(i) / float(max(1, spark_n - 1))) * TAU + randf() * 0.5
				var r: float = 6.0 + randf() * 10.0
				var s: Node2D = hit_spark_scene.instantiate() as Node2D
				if s != null:
					s.global_position = base_pos + Vector2(cos(ang), sin(ang)) * r
					parent.add_child(s)
		# Crit splash ring.
		# iter-138 — bumped from 5 → 9 sparks, ring radius 12-18 → 18-32,
		# per-spark scale ×1.4, color shifted to a more saturated red-
		# orange (was salmon-pink). Crits now SHOUT visually instead of
		# just adding "5 extra particles." Modulate propagates to the
		# Node2D's child CPUParticles2D so the gold color_ramp gets
		# multiplied by the red tint — the sparks read as red embers
		# bursting outward, not as red-tinted gold sparks.
		if is_crit and hit_spark_scene != null and parent != null:
			for i in range(9):
				var ang2: float = (float(i) / 9.0) * TAU + randf() * 0.35
				var r2: float = 18.0 + randf() * 14.0
				var s2: Node2D = hit_spark_scene.instantiate() as Node2D
				if s2 != null:
					s2.global_position = base_pos + Vector2(cos(ang2), sin(ang2)) * r2
					s2.modulate = Color(1.10, 0.22, 0.16, 1.0)
					s2.scale = Vector2(1.4, 1.4)
					parent.add_child(s2)
	return tier

# ============================================================================
# BLAST BOLT DAMAGE TIER
# ============================================================================
#
# Returns 0..3 for projectile size scaling at spawn time:
#   0 = tap fire    (small bolt)
#   1 = woven      (mid damage)
#   2 = high damage
#   3 = crushing   (charged or 50+ damage)
static func bolt_damage_tier(damage: int) -> int:
	if damage >= 50: return 3
	if damage >= 30: return 2
	if damage >= 18: return 1
	return 0
