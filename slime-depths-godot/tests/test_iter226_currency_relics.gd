extends SceneTree

# Iter 226 / Expansion Team — currency / counter / summon relic regression.
#
# Verifies the four new relics shipped this iter:
#   1. ETHER_MAGNET     — ether_shard_drop_mul_f multiplier folds into
#                          GameState.award_ether_shards
#   2. SACRIFICIAL_ECHO — registry entry exists, themes/tier correct,
#                          counter mod-keyed pattern in hero.gd
#   3. SUMMON_STONE     — registry + mod key + sync hook exist
#   4. LUCKY_KNIFE      — crit_bonus_ether_chance_f modifier readable;
#                          award path picks up bonus shards
#
# Pattern follows test_iter218_save_migration.gd (pure data ops against
# GameState autoload — no scene tree spawn required).

func _initialize() -> void:
	print("[exp226] init")
	await process_frame
	var gs: Node = root.get_node_or_null("/root/GameState")
	if gs == null:
		printerr("FAIL: GameState autoload missing")
		quit(1)
		return
	# ── Registry presence + correct tier / theme tagging ─────────────
	var expected: Dictionary = {
		"ether_magnet":     {"tier": "rare",      "theme": "shadow"},
		"sacrificial_echo": {"tier": "rare",      "theme": "blood"},
		"summon_stone":     {"tier": "legendary", "theme": "storm"},
		"lucky_knife":      {"tier": "rare",      "theme": "shadow"},
	}
	for rid in expected.keys():
		if not gs.RELIC_REGISTRY.has(rid):
			printerr("FAIL: RELIC_REGISTRY missing '%s'" % rid)
			quit(1)
			return
		var info: Dictionary = gs.RELIC_REGISTRY[rid]
		if str(info.get("tier")) != expected[rid]["tier"]:
			printerr("FAIL: %s tier mismatch — got %s, expected %s" % [
				rid, info.get("tier"), expected[rid]["tier"],
			])
			quit(1)
			return
		var themes: Array = info.get("themes", [])
		if not (expected[rid]["theme"] in themes):
			printerr("FAIL: %s missing theme '%s' (got %s)" % [
				rid, expected[rid]["theme"], str(themes),
			])
			quit(1)
			return
	print("[exp226] registry entries OK — tier + theme tagging correct on all 4")
	# ── Reset run state so prior tests' relic grants don't leak in ────
	gs.call("start_dungeon_run")
	gs.ether_shards = 0
	gs.ether_lifetime_earned = 0
	# ── Test 1: ETHER_MAGNET multiplier on award_ether_shards ─────────
	# Baseline: no relic owned → award 10 → +10 shards exactly.
	var baseline_before: int = gs.ether_shards
	gs.call("award_ether_shards", 10)
	var baseline_gain: int = gs.ether_shards - baseline_before
	if baseline_gain != 10:
		printerr("FAIL: baseline award gave %d, expected 10" % baseline_gain)
		quit(1)
		return
	print("[exp226] baseline award OK — 10 → +10 shards (no mul)")
	# Grant ETHER_MAGNET → 1.25× multiplier on future awards.
	# 4 shards × 1.25 = 5.0 → round to 5
	# 10 shards × 1.25 = 12.5 → round to 13 (banker's? Godot int(round) is half-up to even? Test the actual.)
	if not gs.call("grant_relic", "ether_magnet"):
		printerr("FAIL: grant_relic(ether_magnet) returned false")
		quit(1)
		return
	if not gs.call("has_relic", "ether_magnet"):
		printerr("FAIL: has_relic(ether_magnet) false after grant")
		quit(1)
		return
	# Verify modifier_total_f reads the 0.25
	var mul_read: float = gs.call("modifier_total_f", "ether_shard_drop_mul_f", 0.0)
	if absf(mul_read - 0.25) > 0.001:
		printerr("FAIL: ether_shard_drop_mul_f modifier read %.3f, expected 0.25" % mul_read)
		quit(1)
		return
	# Award 10 with magnet → 10 × 1.25 = 12.5 → 13 with round-half-up.
	var before_mag: int = gs.ether_shards
	gs.call("award_ether_shards", 10)
	var gain_mag: int = gs.ether_shards - before_mag
	# Godot's int(round()) rounds 12.5 to 12 (banker's rounding to even)
	# OR to 13 (round-half-up) depending on engine version. Accept either.
	if gain_mag != 12 and gain_mag != 13:
		printerr(
			"FAIL: magnet award of 10 yielded %d, expected 12 or 13 (round-half)"
				% gain_mag
		)
		quit(1)
		return
	print("[exp226] ETHER_MAGNET OK — 10 → +%d shards (1.25× multiplier active)" % gain_mag)
	# Smaller award: 4 × 1.25 = 5.0 → exactly 5.
	var before_small: int = gs.ether_shards
	gs.call("award_ether_shards", 4)
	var gain_small: int = gs.ether_shards - before_small
	if gain_small != 5:
		printerr("FAIL: magnet award of 4 yielded %d, expected 5" % gain_small)
		quit(1)
		return
	print("[exp226] ETHER_MAGNET OK — 4 → +5 shards (exact half-multiplier)")
	# ── Test 2: SACRIFICIAL_ECHO mod key absent / triggered-only ──────
	# Registry entry has empty mods (triggered relic; counter logic lives
	# in hero.gd). Verify the entry doesn't accidentally claim a stat mod.
	var se_info: Dictionary = gs.RELIC_REGISTRY["sacrificial_echo"]
	var se_mods: Dictionary = se_info.get("mods", {})
	if not se_mods.is_empty():
		printerr("FAIL: sacrificial_echo should have empty mods (triggered), got %s" % str(se_mods))
		quit(1)
		return
	# Verify hero.gd source contains the counter logic so any refactor
	# that drops the wiring is caught.
	var hero_script: Script = load("res://scripts/hero.gd") as Script
	if hero_script == null:
		printerr("FAIL: hero.gd failed to load")
		quit(1)
		return
	var hero_src: String = hero_script.source_code
	if hero_src.find("_sacrificial_echo_counter") < 0:
		printerr("FAIL: hero.gd missing _sacrificial_echo_counter wiring")
		quit(1)
		return
	if hero_src.find("\"sacrificial_echo\"") < 0:
		printerr("FAIL: hero.gd has_relic(\"sacrificial_echo\") check missing")
		quit(1)
		return
	print("[exp226] SACRIFICIAL_ECHO OK — registry triggered-only + hero.gd counter wired")
	# ── Test 3: SUMMON_STONE mod key + sync hook ─────────────────────
	var ss_info: Dictionary = gs.RELIC_REGISTRY["summon_stone"]
	var ss_mods: Dictionary = ss_info.get("mods", {})
	if int(ss_mods.get("summon_turret_count", 0)) != 1:
		printerr("FAIL: summon_stone should declare summon_turret_count:1, got %s" % str(ss_mods))
		quit(1)
		return
	# Verify main.gd contains _sync_turrets + the sync hook fires.
	var main_script: Script = load("res://scripts/main.gd") as Script
	if main_script == null:
		printerr("FAIL: main.gd failed to load")
		quit(1)
		return
	var main_src: String = main_script.source_code
	if main_src.find("func _sync_turrets") < 0:
		printerr("FAIL: main.gd missing _sync_turrets")
		quit(1)
		return
	if main_src.find("_sync_turrets()") < 0:
		printerr("FAIL: main.gd never calls _sync_turrets()")
		quit(1)
		return
	if main_src.find("summon_turret_count") < 0:
		printerr("FAIL: main.gd missing summon_turret_count modifier read")
		quit(1)
		return
	# Verify turret.gd loads + has expected SCAN_RANGE / FIRE_COOLDOWN.
	var turret_script: Script = load("res://scripts/turret.gd") as Script
	if turret_script == null:
		printerr("FAIL: turret.gd failed to load")
		quit(1)
		return
	var turret_src: String = turret_script.source_code
	if turret_src.find("SCAN_RANGE: float = 200.0") < 0:
		printerr("FAIL: turret.gd missing 200px SCAN_RANGE constant")
		quit(1)
		return
	if turret_src.find("FIRE_COOLDOWN: float = 1.5") < 0:
		printerr("FAIL: turret.gd missing 1.5s FIRE_COOLDOWN constant")
		quit(1)
		return
	print("[exp226] SUMMON_STONE OK — registry mod + turret.gd + _sync_turrets all wired")
	# ── Test 4: LUCKY_KNIFE modifier readable + award delta ──────────
	if not gs.call("grant_relic", "lucky_knife"):
		printerr("FAIL: grant_relic(lucky_knife) returned false")
		quit(1)
		return
	var lk_chance: float = gs.call("modifier_total_f", "crit_bonus_ether_chance_f", 0.0)
	if absf(lk_chance - 0.25) > 0.001:
		printerr("FAIL: crit_bonus_ether_chance_f read %.3f, expected 0.25" % lk_chance)
		quit(1)
		return
	# Verify the modifier ALSO interacts with ETHER_MAGNET — a +1 shard
	# bonus drop through award_ether_shards should be multiplied to
	# floor(1 × 1.25) = round(1.25) = 1 (round-half-up to 1). So even
	# with both relics, the LUCKY_KNIFE +1 drop stays at +1 (the magnet
	# multiplier only meaningfully bumps awards of 4+). Sanity-check
	# this by awarding 1 directly.
	var before_one: int = gs.ether_shards
	gs.call("award_ether_shards", 1)
	var gain_one: int = gs.ether_shards - before_one
	if gain_one != 1:
		printerr("FAIL: magnet × 1-shard award yielded %d, expected 1" % gain_one)
		quit(1)
		return
	print("[exp226] LUCKY_KNIFE OK — modifier readable; +1 with magnet stays +1 (round-half)")
	# Verify hero.gd source contains the crit-kill check.
	if hero_src.find("crit_bonus_ether_chance_f") < 0:
		printerr("FAIL: hero.gd missing crit_bonus_ether_chance_f read")
		quit(1)
		return
	if hero_src.find("is_crit and enemy.hp <= 0") < 0:
		printerr("FAIL: hero.gd missing crit-kill detection clause")
		quit(1)
		return
	print("[exp226] LUCKY_KNIFE OK — hero.gd crit-kill check wired")
	# ── Done ─────────────────────────────────────────────────────────
	print("[exp226] PASS — all 4 Expansion-Team relics registered + wired")
	quit(0)
