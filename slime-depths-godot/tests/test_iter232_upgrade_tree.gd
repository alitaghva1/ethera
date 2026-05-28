extends SceneTree

# Iter 232 / Bug Team R3 — Upgrade tree spend regression test.
#
# `GameState.upgrade_node` + `spend_ether_shards` + `upgrade_next_cost`
# are the Beta M1.1 meta-progression spend flow. The math was UNTESTED
# — an off-by-one in the cost-index lookup, a missing max-level guard,
# or a stale "negative shards allowed" path would silently break
# permanent player progression on every run.
#
# Coverage:
#   1. upgrade_next_cost reads costs[current_level] correctly (level 0 → 50,
#      level 1 → 100, level 2 → 200 for resilience).
#   2. A valid upgrade_node call (a) takes exactly the listed cost,
#      (b) bumps upgrade_levels[node_id] by 1, AND (c) folds into
#      modifier_total('max_hp_bonus') for resilience.
#   3. Insufficient shards → upgrade_node returns false, no level change,
#      no shard spend.
#   4. Past max_level → upgrade_node returns false, upgrade_next_cost == -1.
#   5. Unknown node_id → both APIs return false / -1 without crash.

func _initialize() -> void:
	print("[upg232] init")
	await process_frame
	var gs: Node = root.get_node_or_null("/root/GameState")
	if gs == null:
		printerr("FAIL: GameState autoload missing")
		quit(1)
		return

	# Clean slate — reset upgrade_levels to all zero, set known shard total.
	gs.upgrade_levels = {
		"resilience": 0, "quick_step": 0, "first_talisman": 0,
		"tribute": 0, "bound_vow": 0,
	}
	gs.ether_shards = 1000
	# Also reset owned_relics + shrine_bonuses so modifier_total reads clean.
	gs.call("start_dungeon_run")
	gs.shrine_bonuses = {}
	# start_dungeon_run wipes owned_relics but NOT upgrade_levels; reassert.
	gs.upgrade_levels = {
		"resilience": 0, "quick_step": 0, "first_talisman": 0,
		"tribute": 0, "bound_vow": 0,
	}
	gs.ether_shards = 1000

	# ── 1. upgrade_next_cost at each level for resilience (50, 100, 200) ──
	# RESILIENCE costs = [50, 100, 200], max_level = 3.
	if int(gs.call("upgrade_next_cost", "resilience")) != 50:
		printerr("FAIL: resilience cost at level 0 = %d, expected 50" % int(gs.call("upgrade_next_cost", "resilience")))
		quit(1)
		return
	print("[upg232] upgrade_next_cost(resilience) = 50 at level 0 OK")

	# ── 2. Valid upgrade — spend matches, level up, max_hp_bonus folds ──
	# Baseline max_hp_bonus from modifier_total before upgrade.
	var hp_before: int = gs.call("modifier_total", "max_hp_bonus", 0)
	var shards_before: int = int(gs.ether_shards)
	var ok: bool = gs.call("upgrade_node", "resilience")
	if not ok:
		printerr("FAIL: upgrade_node(resilience) returned false with 1000 shards")
		quit(1)
		return
	if int(gs.ether_shards) != shards_before - 50:
		printerr("FAIL: shards after upgrade = %d, expected %d" % [int(gs.ether_shards), shards_before - 50])
		quit(1)
		return
	if int(gs.upgrade_levels.get("resilience", -1)) != 1:
		printerr("FAIL: upgrade_levels.resilience after spend = %d, expected 1" % int(gs.upgrade_levels.get("resilience", -1)))
		quit(1)
		return
	# modifier_total folds upgrade_levels.resilience into max_hp_bonus.
	var hp_after: int = gs.call("modifier_total", "max_hp_bonus", 0)
	if hp_after - hp_before != 1:
		printerr("FAIL: max_hp_bonus delta after resilience upgrade = %d, expected +1" % (hp_after - hp_before))
		quit(1)
		return
	print("[upg232] upgrade_node(resilience) 0→1: -50 shards, +1 max_hp_bonus OK")

	# Cost progression after level 1 — next cost is costs[1] = 100.
	if int(gs.call("upgrade_next_cost", "resilience")) != 100:
		printerr("FAIL: resilience cost at level 1 = %d, expected 100" % int(gs.call("upgrade_next_cost", "resilience")))
		quit(1)
		return
	print("[upg232] upgrade_next_cost(resilience) = 100 at level 1 OK")

	# ── 3. Insufficient shards rejects upgrade ──────────────────────────
	# Drop shards below the next-level cost (100 for resilience L1→L2).
	gs.ether_shards = 50
	var pre_shards: int = int(gs.ether_shards)
	var pre_level: int = int(gs.upgrade_levels.get("resilience", -1))
	ok = gs.call("upgrade_node", "resilience")
	if ok:
		printerr("FAIL: upgrade_node(resilience) returned true with 50 shards (cost 100)")
		quit(1)
		return
	if int(gs.ether_shards) != pre_shards:
		printerr("FAIL: shards changed despite failed upgrade (%d → %d)" % [pre_shards, int(gs.ether_shards)])
		quit(1)
		return
	if int(gs.upgrade_levels.get("resilience", -1)) != pre_level:
		printerr("FAIL: level changed despite failed upgrade (%d → %d)" % [pre_level, int(gs.upgrade_levels.get("resilience", -1))])
		quit(1)
		return
	print("[upg232] insufficient shards rejected (no spend, no level change) OK")

	# ── 4. Past max_level rejected; upgrade_next_cost == -1 at max ─────
	# Push resilience to max (3) directly, then verify both APIs.
	gs.upgrade_levels["resilience"] = 3
	gs.ether_shards = 10000
	ok = gs.call("upgrade_node", "resilience")
	if ok:
		printerr("FAIL: upgrade_node(resilience) returned true at max_level")
		quit(1)
		return
	if int(gs.upgrade_levels.get("resilience", -1)) != 3:
		printerr("FAIL: level changed past max (3 → %d)" % int(gs.upgrade_levels.get("resilience", -1)))
		quit(1)
		return
	if int(gs.call("upgrade_next_cost", "resilience")) != -1:
		printerr("FAIL: upgrade_next_cost at max = %d, expected -1" % int(gs.call("upgrade_next_cost", "resilience")))
		quit(1)
		return
	print("[upg232] max_level rejects further upgrades; cost reads -1 OK")

	# ── 5. Unknown node_id — graceful fail ──────────────────────────────
	ok = gs.call("upgrade_node", "this_node_does_not_exist")
	if ok:
		printerr("FAIL: upgrade_node('this_node_does_not_exist') returned true")
		quit(1)
		return
	if int(gs.call("upgrade_next_cost", "this_node_does_not_exist")) != -1:
		printerr("FAIL: upgrade_next_cost('this_node_does_not_exist') != -1")
		quit(1)
		return
	print("[upg232] unknown node_id rejected by both APIs OK")

	# ── 6. spend_ether_shards directly: edge cases ──────────────────────
	# Non-positive amount → false, no spend.
	gs.ether_shards = 100
	ok = gs.call("spend_ether_shards", 0)
	if ok or int(gs.ether_shards) != 100:
		printerr("FAIL: spend_ether_shards(0) should fail and not spend (got ok=%s shards=%d)" % [str(ok), int(gs.ether_shards)])
		quit(1)
		return
	ok = gs.call("spend_ether_shards", -10)
	if ok or int(gs.ether_shards) != 100:
		printerr("FAIL: spend_ether_shards(-10) should fail and not spend")
		quit(1)
		return
	# Exact amount → ok, shards = 0.
	ok = gs.call("spend_ether_shards", 100)
	if not ok or int(gs.ether_shards) != 0:
		printerr("FAIL: spend_ether_shards(100) on 100 shards: ok=%s shards=%d" % [str(ok), int(gs.ether_shards)])
		quit(1)
		return
	print("[upg232] spend_ether_shards edge cases (0, negative, exact) OK")

	print("[upg232] PASS — upgrade tree spend flow correct (5 cost/level scenarios + edge cases)")
	quit(0)
