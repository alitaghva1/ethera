extends SceneTree

# iter-260 / Wave 9 — Unified reward economy smoke test.
#
# The iter-259 boon catalog grew from 15 → 30 entries across THREE tiers
# (common / rare / legendary). Common is the iter-259 roster; rare adds
# 10 PROC mechanics; legendary adds 5 ASPECT mechanic-shifters. The
# boon offer roll now uses tier weights (ramps up across the run) plus
# theme bias (owned-relic theme spread). Rooms gain a `room_type` field
# so the player reads what KIND of room they're in (gauntlet/vault/etc).
#
# Verifies (the iter-260 contract):
#
#   A. boon_catalog.gd has 30 entries (15 common + 10 rare + 5 legendary).
#   B. Per-theme breakdown: each of 5 themes has exactly 3 common + 2
#      rare + 1 legendary = 6 entries.
#   C. Every rare boon has a `proc_flag` field; every legendary boon
#      has a `proc_flag` field. Common boons MAY omit it.
#   D. The 10 rare boon ids exist with expected names.
#   E. The 5 legendary boon ids exist with expected names.
#   F. room_config.gd has the new `room_type` @export field.
#   G. room_03.tres declares room_type = "gauntlet".
#   H. roll_boon_offers(3) returns 3 unique boon ids on a fresh run.
#   I. roll_boon_offers respects the first-level-up tier ramp (70/25/5)
#      — a fresh run with a large sample should have ≥1 common pick
#      on average (probabilistic guard, but with 30 samples the
#      probability of zero commons is ~1e-15).
#   J. main.gd source contains the room-type icon spawning hook + the
#      gauntlet XP multiplier wire-up.
#   K. hero.gd source contains the 10 rare proc handler tags +
#      the 5 legendary aspect tags (source-grep guard).
#   L. game_state.gd source contains has_boon() and record_boon_pick()
#      + the owned_boons / level_ups_this_run fields.

func _initialize() -> void:
	print("[iter260unified] init")
	await process_frame
	var ok := true

	# ═══ A. BoonCatalog has 30 entries ═════════════════════════════════
	var catalog_script: Script = load("res://scripts/boon_catalog.gd") as Script
	if catalog_script == null:
		printerr("FAIL: boon_catalog.gd failed to load as Script")
		quit(1)
		return
	var const_map: Dictionary = catalog_script.get_script_constant_map()
	if not const_map.has("BOONS"):
		printerr("FAIL: boon_catalog.gd missing BOONS const")
		quit(1)
		return
	var boons: Dictionary = const_map["BOONS"]
	if boons.size() != 30:
		printerr("FAIL: BOONS has %d entries, expected 30" % boons.size())
		ok = false
	# Tier counts.
	var tier_counts: Dictionary = {"common": 0, "rare": 0, "legendary": 0}
	for id in boons:
		var t: String = str(boons[id].get("tier", ""))
		if tier_counts.has(t):
			tier_counts[t] = int(tier_counts[t]) + 1
	if tier_counts["common"] != 15:
		printerr("FAIL: common tier has %d boons, expected 15" % tier_counts["common"])
		ok = false
	if tier_counts["rare"] != 10:
		printerr("FAIL: rare tier has %d boons, expected 10" % tier_counts["rare"])
		ok = false
	if tier_counts["legendary"] != 5:
		printerr("FAIL: legendary tier has %d boons, expected 5" % tier_counts["legendary"])
		ok = false
	if ok:
		print("[iter260unified] A OK — BOONS has 30 entries (15 common + 10 rare + 5 legendary)")

	# ═══ B. Per-theme breakdown: 3 common + 2 rare + 1 legendary ═══════
	var per_theme: Dictionary = {}
	for id in boons:
		var theme: String = str(boons[id].get("theme", ""))
		var tier: String = str(boons[id].get("tier", ""))
		if not per_theme.has(theme):
			per_theme[theme] = {"common": 0, "rare": 0, "legendary": 0}
		(per_theme[theme] as Dictionary)[tier] = int((per_theme[theme] as Dictionary).get(tier, 0)) + 1
	var expected_themes: Array[String] = ["flame", "storm", "blood", "vow", "shadow"]
	for theme in expected_themes:
		if not per_theme.has(theme):
			printerr("FAIL: theme '%s' missing entirely" % theme)
			ok = false
			continue
		var counts: Dictionary = per_theme[theme]
		if int(counts.get("common", 0)) != 3:
			printerr("FAIL: theme '%s' has %d common boons, expected 3" % [theme, int(counts.get("common", 0))])
			ok = false
		if int(counts.get("rare", 0)) != 2:
			printerr("FAIL: theme '%s' has %d rare boons, expected 2" % [theme, int(counts.get("rare", 0))])
			ok = false
		if int(counts.get("legendary", 0)) != 1:
			printerr("FAIL: theme '%s' has %d legendary boons, expected 1" % [theme, int(counts.get("legendary", 0))])
			ok = false
	if ok:
		print("[iter260unified] B OK — each theme has 3 common + 2 rare + 1 legendary")

	# ═══ C. Rare + legendary boons declare proc_flag ═══════════════════
	for id in boons:
		var tier: String = str(boons[id].get("tier", "common"))
		if tier == "rare" or tier == "legendary":
			var pf: String = str(boons[id].get("proc_flag", ""))
			if pf == "":
				printerr("FAIL: %s boon '%s' missing proc_flag field" % [tier, id])
				ok = false
	if ok:
		print("[iter260unified] C OK — all rare/legendary boons declare proc_flag")

	# ═══ D. Expected 10 rare boon names exist ══════════════════════════
	var expected_rares: Array[String] = [
		"flame_offering", "flame_chain",
		"storm_tithe", "storm_surge",
		"blood_echo", "blood_hunger",
		"vow_shatter", "vow_stand",
		"shadow_bind", "shadow_veil",
	]
	for id in expected_rares:
		if not boons.has(id):
			printerr("FAIL: rare boon id '%s' missing from catalog" % id)
			ok = false
		else:
			var tier: String = str(boons[id].get("tier", ""))
			if tier != "rare":
				printerr("FAIL: boon '%s' has tier '%s', expected 'rare'" % [id, tier])
				ok = false
	if ok:
		print("[iter260unified] D OK — all 10 rare boons present + correctly tiered")

	# ═══ E. Expected 5 legendary boon names exist ══════════════════════
	var expected_legendaries: Array[String] = [
		"inferno_aspect", "tempest_aspect", "bloodroot_aspect",
		"bulwark_aspect", "voidwalk_aspect",
	]
	for id in expected_legendaries:
		if not boons.has(id):
			printerr("FAIL: legendary boon id '%s' missing from catalog" % id)
			ok = false
		else:
			var tier: String = str(boons[id].get("tier", ""))
			if tier != "legendary":
				printerr("FAIL: boon '%s' has tier '%s', expected 'legendary'" % [id, tier])
				ok = false
	if ok:
		print("[iter260unified] E OK — all 5 legendary boons present + correctly tiered")

	# ═══ F. room_config.gd has the new room_type field ═════════════════
	var rc_src: String = FileAccess.get_file_as_string("res://scripts/room_config.gd")
	if rc_src.find("@export var room_type") < 0:
		printerr("FAIL: room_config.gd missing @export var room_type")
		ok = false
	# Default must be "standard" so legacy rooms aren't accidentally
	# re-tagged.
	if rc_src.find('room_type: String = "standard"') < 0:
		printerr("FAIL: room_type default is not \"standard\"")
		ok = false
	if ok:
		print("[iter260unified] F OK — room_config.gd has room_type @export field with 'standard' default")

	# ═══ G. room_03.tres declares room_type = "gauntlet" ═══════════════
	var r3_src: String = FileAccess.get_file_as_string("res://scenes/rooms/room_03.tres")
	if r3_src.find('room_type = "gauntlet"') < 0:
		printerr("FAIL: room_03.tres does not declare room_type = \"gauntlet\"")
		ok = false
	else:
		print("[iter260unified] G OK — room_03.tres is tagged as gauntlet")

	# ═══ H. roll_boon_offers(3) returns 3 unique ids ═══════════════════
	# Reset GameState state for a clean roll.
	var gs: Node = root.get_node_or_null("/root/GameState")
	if gs == null:
		printerr("FAIL: /root/GameState autoload not found")
		quit(1)
		return
	if "owned_boons" in gs:
		gs.set("owned_boons", {})
	if "level_ups_this_run" in gs:
		gs.set("level_ups_this_run", 0)
	if "owned_relics" in gs:
		gs.set("owned_relics", [])
	var picks: Array = catalog_script.call("roll_boon_offers", 3)
	if picks.size() != 3:
		printerr("FAIL: roll_boon_offers(3) returned %d picks, expected 3" % picks.size())
		ok = false
	else:
		var unique_set: Dictionary = {}
		for p in picks:
			unique_set[p] = true
		if unique_set.size() != 3:
			printerr("FAIL: roll_boon_offers(3) returned duplicates: %s" % picks)
			ok = false
		else:
			print("[iter260unified] H OK — roll_boon_offers(3) returned 3 unique ids: ", picks)

	# ═══ I. First-level-up tier ramp respects common-bias ══════════════
	# At level_up_index 0 the weights are 70/25/5. Across 30 samples we
	# expect ~21 commons. We accept ≥ 10 commons (probabilistic floor).
	gs.set("owned_boons", {})
	gs.set("level_ups_this_run", 0)
	var common_count: int = 0
	var sample_size: int = 30
	for i in range(sample_size):
		gs.set("owned_boons", {})    # reset between rolls
		var sample: Array = catalog_script.call("roll_boon_offers", 1)
		if sample.size() > 0:
			var entry: Dictionary = boons.get(str(sample[0]), {})
			if str(entry.get("tier", "")) == "common":
				common_count += 1
	# Probabilistic floor — 70% expected = 21; allow ≥ 10 (extremely
	# generous tolerance, p(< 10 | n=30, p=0.7) ≈ 1e-8).
	if common_count < 10:
		printerr("FAIL: first level-up returned only %d/%d commons, expected ≥ 10 (tier-ramp common-bias)" % [common_count, sample_size])
		ok = false
	else:
		print("[iter260unified] I OK — first level-up tier ramp returned %d/%d commons (≥ 10)" % [common_count, sample_size])

	# ═══ J. main.gd has room-type icon hook + gauntlet XP multiplier ═══
	var main_src: String = FileAccess.get_file_as_string("res://scripts/main.gd")
	if main_src.find("_spawn_room_type_icon") < 0:
		printerr("FAIL: main.gd missing _spawn_room_type_icon helper")
		ok = false
	if main_src.find("_resolve_effective_room_type") < 0:
		printerr("FAIL: main.gd missing _resolve_effective_room_type helper")
		ok = false
	# Gauntlet XP multiplier guard.
	if main_src.find('"gauntlet"') < 0:
		printerr("FAIL: main.gd does not reference 'gauntlet' room_type")
		ok = false
	# _advance_room_xp applies gauntlet XP bonus.
	var adv_idx: int = main_src.find("func _advance_room_xp")
	if adv_idx >= 0:
		var adv_end: int = main_src.find("\nfunc ", adv_idx + 5)
		var adv_body: String = main_src.substr(adv_idx, max(0, adv_end - adv_idx)) if adv_end >= 0 else main_src.substr(adv_idx)
		if adv_body.find("gauntlet") < 0:
			printerr("FAIL: _advance_room_xp body doesn't reference gauntlet bonus")
			ok = false
	if ok:
		print("[iter260unified] J OK — main.gd has room-type icon + gauntlet XP bonus")

	# ═══ K. hero.gd source contains 9 rare + 4 legendary proc handlers
	# flame_chain hooks in enemy.gd (KINDLE_SPREAD radius); bloodroot_
	# aspect is pure-modifier (no proc hook needed — its mods dict
	# carries max_hp_bonus + lifesteal_chance_f). Verify both DO appear
	# in their respective sources.
	var hero_src: String = FileAccess.get_file_as_string("res://scripts/hero.gd")
	if hero_src == "":
		printerr("FAIL: failed to read hero.gd")
		quit(1)
		return
	var hero_proc_tags: Array[String] = [
		# Rare (9 in hero.gd):
		"flame_offering",
		"storm_tithe", "storm_surge",
		"blood_echo", "blood_hunger",
		"vow_shatter", "vow_stand",
		"shadow_bind", "shadow_veil",
		# Legendary (4 in hero.gd; bloodroot_aspect is pure-modifier):
		"inferno_aspect", "tempest_aspect",
		"bulwark_aspect", "voidwalk_aspect",
	]
	for tag in hero_proc_tags:
		if hero_src.find(tag) < 0:
			printerr("FAIL: hero.gd has no reference to proc tag '%s'" % tag)
			ok = false
	# flame_chain hooks in enemy.gd's _trigger_kindle_spread.
	var enemy_src: String = FileAccess.get_file_as_string("res://scripts/enemy.gd")
	if enemy_src.find("flame_chain") < 0:
		printerr("FAIL: enemy.gd has no reference to 'flame_chain' (KINDLE_SPREAD bump)")
		ok = false
	# bloodroot_aspect is pure-modifier — verify it's at least IN the
	# catalog with the expected mod keys (max_hp_bonus + lifesteal_chance_f).
	var bloodroot: Dictionary = boons.get("bloodroot_aspect", {})
	var br_mods: Dictionary = bloodroot.get("mods", {})
	if not br_mods.has("max_hp_bonus") or not br_mods.has("lifesteal_chance_f"):
		printerr("FAIL: bloodroot_aspect is missing expected modifier keys")
		ok = false
	if ok:
		print("[iter260unified] K OK — hero.gd has 9 rare + 4 legendary proc tags; enemy.gd has flame_chain; bloodroot_aspect is pure-modifier")

	# ═══ L. game_state.gd has has_boon / record_boon_pick / owned_boons
	var gs_src: String = FileAccess.get_file_as_string("res://scripts/game_state.gd")
	if gs_src.find("func has_boon") < 0:
		printerr("FAIL: game_state.gd missing func has_boon")
		ok = false
	if gs_src.find("func record_boon_pick") < 0:
		printerr("FAIL: game_state.gd missing func record_boon_pick")
		ok = false
	if gs_src.find("owned_boons") < 0:
		printerr("FAIL: game_state.gd missing owned_boons field")
		ok = false
	if gs_src.find("level_ups_this_run") < 0:
		printerr("FAIL: game_state.gd missing level_ups_this_run field")
		ok = false
	if ok:
		print("[iter260unified] L OK — game_state.gd has has_boon/record_boon_pick + owned_boons + level_ups_this_run")

	if not ok:
		printerr("[iter260unified] FAIL — see errors above")
		quit(1)
		return
	print("[iter260unified] PASS — unified reward economy wired end to end")
	quit(0)
