extends SceneTree

# Iter 149 — Slash arc combo escalation.
#
# Pre-iter-149 the slash_arc visual was driven by build state (relic
# count, dominant theme, charged/finisher context) but was UNAWARE of
# the combo counter. A player at 1 combo and a player at 100 combo
# swung identically — the only visible escalation was the HUD label's
# tier ramp (iter-114). The combat moment-to-moment didn't FEEL like
# the streak meant anything.
#
# Genre cue: Hades, Isaac, Dead Cells all amplify the swing/shot
# visuals when the player is on a streak. The combo counter and the
# weapon visual should reinforce each other.
#
# Iter-149 threads `combo` into AttackFeel.compose_slash_opts via the
# ctx dictionary, applying tiered amplification matching the HUD
# combo-label thresholds (10 / 25 / 50 / 100):
#
#   combo ≥ 10  → width × 1.05,  trail + 1
#   combo ≥ 25  → width × 1.10,  trail + 2
#   combo ≥ 50  → width × 1.18,  trail + 3,  color blends 20% gold
#   combo ≥ 100 → width × 1.30,  trail + 4,  color blends 30% gold-orange
#
# Color shifts apply via the existing _mix helper so the slash arc
# warms toward gold at peak streaks — "the build is going off" without
# anyone needing to glance at the HUD.
#
# Architecture:
#   • hero.gd gains `get_combo() -> int` — read-only seam, keeps the
#     internal _combo private so combo math stays inside hero.gd.
#   • screen_flash.gd._on_hero_attacked (the slash_arc spawner) calls
#     hero.get_combo() and passes via ctx["combo"]. Defensive
#     has_method check so boss-intro sim swings (where hero may not
#     be the live player node) gracefully default to combo=0.
#   • attack_feel.compose_slash_opts reads ctx["combo"], applies the
#     tier ramp AFTER the existing theme-blend math so combo amp
#     stacks on top of theme/build/charged.
func _initialize() -> void:
	var ok := true

	var hero_gd := FileAccess.get_file_as_string("res://scripts/hero.gd")
	var sf_gd   := FileAccess.get_file_as_string("res://scripts/screen_flash.gd")
	var af_gd   := FileAccess.get_file_as_string("res://scripts/attack_feel.gd")

	# ═══ Hero exposes get_combo() getter ═══
	if "func get_combo() -> int:" not in hero_gd:
		push_error("FAIL: hero.gd should define public get_combo() -> int")
		ok = false
	if "return _combo" not in hero_gd:
		push_error("FAIL: get_combo() body should return _combo")
		ok = false

	# ═══ screen_flash builds combo into ctx ═══
	if "hero.has_method(\"get_combo\")" not in sf_gd:
		push_error("FAIL: screen_flash should defensively check hero.has_method(\"get_combo\")")
		ok = false
	if "int(hero.get_combo())" not in sf_gd:
		push_error("FAIL: screen_flash should derive combo from hero.get_combo()")
		ok = false
	if "\"combo\": combo," not in sf_gd:
		push_error("FAIL: screen_flash ctx should include \"combo\": combo entry")
		ok = false

	# ═══ compose_slash_opts reads combo from ctx ═══
	if "var combo: int = int(ctx.get(\"combo\", 0))" not in af_gd:
		push_error("FAIL: compose_slash_opts should read combo from ctx with default 0")
		ok = false

	# ═══ Tier amplification ladder ═══
	# 100+ tier
	if "if combo >= 100:" not in af_gd:
		push_error("FAIL: missing combo >= 100 tier amplification")
		ok = false
	if "width *= 1.30" not in af_gd:
		push_error("FAIL: combo 100+ should width *= 1.30")
		ok = false
	if "trail_count += 4" not in af_gd:
		push_error("FAIL: combo 100+ should trail_count += 4")
		ok = false
	if "_mix(base, Color(1.0, 0.65, 0.30), 0.30)" not in af_gd:
		push_error("FAIL: combo 100+ should blend base with gold-orange 30%")
		ok = false

	# 50-99 tier
	if "elif combo >= 50:" not in af_gd:
		push_error("FAIL: missing combo >= 50 tier amplification")
		ok = false
	if "width *= 1.18" not in af_gd:
		push_error("FAIL: combo 50+ should width *= 1.18")
		ok = false
	if "trail_count += 3" not in af_gd:
		push_error("FAIL: combo 50+ should trail_count += 3")
		ok = false
	if "_mix(base, Color(1.0, 0.78, 0.40), 0.20)" not in af_gd:
		push_error("FAIL: combo 50+ should blend base with warm gold 20%")
		ok = false

	# 25-49 tier
	if "elif combo >= 25:" not in af_gd:
		push_error("FAIL: missing combo >= 25 tier amplification")
		ok = false
	if "width *= 1.10" not in af_gd:
		push_error("FAIL: combo 25+ should width *= 1.10")
		ok = false
	if "trail_count += 2" not in af_gd:
		push_error("FAIL: combo 25+ should trail_count += 2")
		ok = false

	# 10-24 tier
	if "elif combo >= 10:" not in af_gd:
		push_error("FAIL: missing combo >= 10 tier amplification")
		ok = false
	if "width *= 1.05" not in af_gd:
		push_error("FAIL: combo 10+ should width *= 1.05")
		ok = false
	if "trail_count += 1" not in af_gd:
		push_error("FAIL: combo 10+ should trail_count += 1")
		ok = false

	if ok:
		print("OK combo slash amp: x1.05/x1.10/x1.18/x1.30 width + 1/2/3/4 trails @ 10/25/50/100")
		print("=== ITER 149 INTEGRATION PASSED ===")
	else:
		print("=== ITER 149 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
