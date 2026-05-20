extends SceneTree

# Iter 228 / Bug Team R2 — Relic-stacking math regression test.
#
# `GameState.modifier_total(key)` is the single source of truth that
# every combat consumer reads to decide damage / cooldowns / max HP /
# crit chance / etc. It folds THREE distinct contribution sources:
#   1. owned_relics[*].mods[key]    — registered relic modifiers
#   2. shrine_bonuses[key]          — per-run shrine grants + curses
#   3. theme_stat_bonuses()[key]    — resonance (≥2 owned per theme)
# Plus a few special-cases for upgrade-tree levels.
#
# This guards architecture-audit gap "no relic-stacking sanity test."
# We exercise the three folds independently AND combined, so a future
# refactor that breaks ONE fold (e.g. accidentally drops theme bonuses
# during a registry rewrite) fails the test with a clear delta.
#
# Coverage:
#   • Multi-relic int stacking on sword_damage_bonus.
#   • Float variant via modifier_total_f on crit_chance_f.
#   • shrine_bonuses fold into the same total.
#   • theme_stat_bonuses fold (own 2 STORM relics → +1 blast_damage_bonus
#     even if the relics' own mods don't list blast damage).
#   • Combined: relic + shrine + theme all visible in one read.
#   • Idempotence: granting the same relic twice does not double-count.

func _initialize() -> void:
	print("[stack228] init")
	await process_frame
	var gs: Node = root.get_node_or_null("/root/GameState")
	if gs == null:
		printerr("FAIL: GameState autoload missing")
		quit(1)
		return
	# Start from a clean state. start_dungeon_run() clears owned_relics
	# + shrine_bonuses + persisted_hp. Used by iter-227 as the canonical
	# "reset between tests" entry point.
	gs.call("start_dungeon_run")
	gs.shrine_bonuses = {}
	# Sanity — baseline must read 0 for the key we're about to fold.
	var base_sword: int = gs.call("modifier_total", "sword_damage_bonus", 0)
	if base_sword != 0:
		printerr("FAIL: baseline sword_damage_bonus = %d, expected 0" % base_sword)
		quit(1)
		return
	# ── 1. Multi-relic int stacking ───────────────────────────────────
	# These four are FLAME-themed relics that each add +1 sword_damage_bonus:
	#   iron_fang (common, FLAME)        → +1 sword_damage_bonus
	#   long_reach (rare, FLAME)         → +1 sword_damage_bonus (plus range)
	# Two FLAME relics also triggers FLAME resonance (≥2 owned), which
	# folds an ADDITIONAL +1 sword_damage_bonus via theme_stat_bonuses.
	# To isolate the multi-relic fold from the theme fold, we first stack
	# four relics each contributing +1 sword (some FLAME, some not), then
	# subtract the theme contribution.
	var sword_donors: Array[String] = ["iron_fang", "long_reach"]
	for rid in sword_donors:
		var ok: bool = gs.call("grant_relic", rid)
		if not ok and not gs.call("has_relic", rid):
			printerr("FAIL: grant_relic(%s) failed and not owned" % rid)
			quit(1)
			return
	# After granting these two FLAME relics, FLAME resonance fires
	# (theme_count('flame') == 2 ≥ RESONANCE_THRESHOLD 2). Expected:
	#   relic mods:   +1 (iron_fang) + +1 (long_reach) = 2
	#   theme fold:   +1 (FLAME resonance)
	#   shrine fold:  0
	#   total:        3
	var total_after_flame_2: int = gs.call("modifier_total", "sword_damage_bonus", 0)
	if total_after_flame_2 != 3:
		printerr(
			"FAIL: after 2 FLAME relics (each +1 sword + resonance +1) total=%d, expected 3" % total_after_flame_2
		)
		quit(1)
		return
	print("[stack228] 2 FLAME relics → sword_damage_bonus = 3 (2 mods + 1 resonance)")
	# Idempotence — re-granting an already-owned relic returns false and
	# does NOT bump the count.
	var dup_ret: bool = gs.call("grant_relic", "iron_fang")
	if dup_ret:
		printerr("FAIL: grant_relic(iron_fang) twice returned true — duplicate granted")
		quit(1)
		return
	var total_after_dup: int = gs.call("modifier_total", "sword_damage_bonus", 0)
	if total_after_dup != 3:
		printerr("FAIL: duplicate grant changed total — got %d, expected 3" % total_after_dup)
		quit(1)
		return
	print("[stack228] duplicate grant_relic OK — total unchanged at 3")
	# ── 2. Float modifier fold via modifier_total_f ──────────────────
	# umbral_thread (common, SHADOW) → crit_chance_f +0.10
	# Granting 2 SHADOW relics triggers SHADOW resonance which folds an
	# ADDITIONAL +0.05 crit_chance_f. We control for resonance by
	# checking the delta after EACH grant.
	var crit_base: float = gs.call("modifier_total_f", "crit_chance_f", 0.0)
	if absf(crit_base) > 0.0001:
		printerr("FAIL: baseline crit_chance_f = %.3f, expected 0.0" % crit_base)
		quit(1)
		return
	gs.call("grant_relic", "umbral_thread")
	var crit_after_one: float = gs.call("modifier_total_f", "crit_chance_f", 0.0)
	if absf(crit_after_one - 0.10) > 0.0001:
		printerr(
			"FAIL: 1 umbral_thread crit_chance_f = %.3f, expected 0.10" % crit_after_one
		)
		quit(1)
		return
	# Add a second SHADOW relic to fire resonance. dusk_walker is
	# storm+shadow dual-theme; granting it bumps both theme counts.
	gs.call("grant_relic", "dusk_walker")
	# Expected crit_chance_f now:
	#   relic mods:   0.10 (umbral_thread) + 0.00 (dusk_walker has none)
	#   theme fold:   +0.05 (SHADOW resonance — 2 owned)
	#   total:        0.15
	var crit_after_two: float = gs.call("modifier_total_f", "crit_chance_f", 0.0)
	if absf(crit_after_two - 0.15) > 0.0001:
		printerr(
			"FAIL: 2 SHADOW relics crit_chance_f = %.3f, expected 0.15 (0.10 mod + 0.05 resonance)" % crit_after_two
		)
		quit(1)
		return
	print("[stack228] SHADOW resonance OK — crit_chance_f %.2f → %.2f (+0.05 from theme)" % [
		crit_after_one, crit_after_two
	])
	# ── 3. shrine_bonus fold ─────────────────────────────────────────
	# grant_shrine_bonus must show up in the SAME modifier_total read.
	# Reset to clean for clarity, then grant + verify combined.
	gs.shrine_bonuses = {}
	gs.call("start_dungeon_run")
	gs.shrine_bonuses = {}
	gs.call("grant_shrine_bonus", "sword_damage_bonus", 4)
	var shrine_only_sword: int = gs.call("modifier_total", "sword_damage_bonus", 0)
	if shrine_only_sword != 4:
		printerr("FAIL: shrine-only sword_damage_bonus = %d, expected 4" % shrine_only_sword)
		quit(1)
		return
	# Layer 2 FLAME relics on top — total should be shrine(4) + relics(2) + resonance(1) = 7.
	gs.call("grant_relic", "iron_fang")
	gs.call("grant_relic", "long_reach")
	var combined_sword: int = gs.call("modifier_total", "sword_damage_bonus", 0)
	if combined_sword != 7:
		printerr(
			"FAIL: shrine(4) + 2 FLAME relics combined sword_damage_bonus = %d, expected 7" % combined_sword
		)
		quit(1)
		return
	print("[stack228] shrine + relics + theme fold OK — sword_damage_bonus = 7 (4 + 2 + 1)")
	# ── 4. Theme tier transitions ─────────────────────────────────────
	# Verify theme_count + theme_tier transitions cleanly between 0 → 1
	# → 2 (resonance → ascendance). Use STORM since dusk_walker already
	# contributed to it; build up to 4 STORM-tagged relics for ascendance.
	gs.call("start_dungeon_run")
	gs.shrine_bonuses = {}
	if gs.call("theme_count", "storm") != 0:
		printerr("FAIL: post-start storm count = %d, expected 0" % gs.call("theme_count", "storm"))
		quit(1)
		return
	# Single STORM relic — below RESONANCE_THRESHOLD.
	gs.call("grant_relic", "arcane_pulse")
	if gs.call("theme_tier", "storm") != 0:
		printerr(
			"FAIL: 1 STORM relic theme_tier = %d, expected 0 (below RESONANCE_THRESHOLD)" % gs.call("theme_tier", "storm")
		)
		quit(1)
		return
	# Second STORM relic — at RESONANCE.
	gs.call("grant_relic", "focused_eye")
	if gs.call("theme_tier", "storm") != 1:
		printerr(
			"FAIL: 2 STORM relics theme_tier = %d, expected 1 (RESONANCE)" % gs.call("theme_tier", "storm")
		)
		quit(1)
		return
	# Three STORM relics — still RESONANCE (below ascendance gate 4).
	gs.call("grant_relic", "piercing_quarrel")
	if gs.call("theme_tier", "storm") != 1:
		printerr(
			"FAIL: 3 STORM relics theme_tier = %d, expected 1 (still resonance)" % gs.call("theme_tier", "storm")
		)
		quit(1)
		return
	# Four STORM relics — ASCENDANCE. arcane_quiver is STORM.
	gs.call("grant_relic", "arcane_quiver")
	if gs.call("theme_tier", "storm") != 2:
		printerr(
			"FAIL: 4 STORM relics theme_tier = %d, expected 2 (ASCENDANCE)" % gs.call("theme_tier", "storm")
		)
		quit(1)
		return
	print("[stack228] theme tier ladder OK — 1 → 0, 2 → 1 (RESONANCE), 4 → 2 (ASCENDANCE)")
	# STORM resonance/ascendance both fold +1 blast_damage_bonus
	# (theme_stat_bonuses returns +1 at tier >= 1; ascendance bonuses
	# are mechanical, not stat-fold). So 4 STORM relics → blast_damage_bonus
	# from theme is +1 regardless of which tier we're at.
	# Direct read: each owned blast-damage relic contributes its mod
	# plus the +1 theme fold.
	var blast_total: int = gs.call("modifier_total", "blast_damage_bonus", 0)
	# arcane_pulse +1, focused_eye +1, piercing_quarrel 0, arcane_quiver 0,
	# plus +1 STORM resonance = 3.
	if blast_total != 3:
		printerr(
			"FAIL: 4 STORM relics blast_damage_bonus = %d, expected 3 (2 mods + 1 theme)" % blast_total
		)
		quit(1)
		return
	print("[stack228] 4 STORM blast_damage_bonus = 3 (2 mods + 1 theme)")
	# ── 5. active_themes Dictionary reflects state ────────────────────
	var actives: Dictionary = gs.call("active_themes")
	if not actives.has("storm"):
		printerr("FAIL: active_themes missing 'storm' after 4 STORM relics")
		quit(1)
		return
	if int(actives.get("storm", 0)) != 2:
		printerr(
			"FAIL: active_themes['storm'] = %d, expected 2 (ascendance)" % int(actives.get("storm", 0))
		)
		quit(1)
		return
	print("[stack228] active_themes OK — storm at tier 2")
	# ── 6. Negative shrine_bonus (curse) reads through correctly ─────
	# Pact-altar curses bank negative modifiers through the SAME shrine
	# bonus path; iter-227 tests this end-to-end via grant_shrine_bonus.
	# Repeated here to ensure NEGATIVE shrines also fold into combined
	# totals (regression on a possible "max(0, total)" clamp).
	gs.call("start_dungeon_run")
	gs.shrine_bonuses = {}
	gs.call("grant_shrine_bonus", "max_hp_bonus", -1)
	gs.call("grant_relic", "iron_will")  # +2 max_hp_bonus
	var hp_combined: int = gs.call("modifier_total", "max_hp_bonus", 0)
	# Expected: -1 (shrine curse) + 2 (relic) + 0 (no BLOOD theme yet,
	# iron_will is VOW not BLOOD; check theme):
	# Actually iron_will is VOW themed, and 1 VOW relic is below
	# resonance (need 2). So theme fold = 0. Total = -1 + 2 = 1.
	if hp_combined != 1:
		printerr(
			"FAIL: curse(-1) + iron_will(+2) max_hp_bonus = %d, expected 1" % hp_combined
		)
		quit(1)
		return
	print("[stack228] negative shrine + positive relic fold OK — max_hp_bonus = 1")
	# ── Done ─────────────────────────────────────────────────────────
	print("[stack228] PASS — all 6 modifier-fold cases correct")
	quit(0)
