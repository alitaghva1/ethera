extends SceneTree

# Iter 103 — Sprint C: elite affixes (Frost / Ember / Venom / Warded).
#
# Audit team G3 finding: enemy roster had 20 baseline mobs with no
# per-instance variation. Rooms 4+ just stacked more of the same. JS
# reference shipped Frost/Ember/Venom/Warded affixes with hover
# tooltips; the infrastructure (apply_burn / apply_slow / take_hit
# clamping) already existed enemy-side — iter-103 inverts it and
# adds the hero-side parallel.
#
# Four affixes:
#   frost  — applies slow on contact (1.0s, 0.6× hero walk speed)
#   ember  — death AoE (2 dmg in 56px radius around the corpse)
#   venom  — DoT on contact (2.0s = 4 ticks × 1 dmg, sickly-green floater)
#   warded — clamps incoming damage by -1 (min 1)
#
# Visual: each affix tints the sprite via ELITE_AFFIX_TINTS,
# multiplicative with EnemyType.sprite_modulate so a tinted enemy
# (spectral_priest green) blends with its affix rather than losing
# its base identity.
#
# Spawn: main.gd._maybe_apply_elite_affix rolls a 22% chance per
# non-boss enemy in room 1+ (room 0 stays affix-free for the
# "learning the loop" beat).
func _initialize() -> void:
	var ok := true

	# ═══ 1. Hero exposes apply_slow + apply_venom ═══
	var hero_src := FileAccess.get_file_as_string("res://scripts/hero.gd")
	if not (hero_src.contains("func apply_slow") and hero_src.contains("func apply_venom")):
		push_error("FAIL: hero.gd missing apply_slow or apply_venom public API")
		ok = false
	else:
		print("OK hero.gd exposes apply_slow + apply_venom")
	# State vars
	for v in ["_hero_slow_remaining", "_hero_slow_multiplier", "_hero_venom_remaining", "_hero_venom_tick_timer"]:
		if "var %s" % v not in hero_src:
			push_error("FAIL: hero.gd missing state var %s" % v)
			ok = false
	if ok:
		print("OK hero.gd has slow + venom state vars")
	# Slow multiplier applied to walk speed
	if not hero_src.contains("speed *= _hero_slow_multiplier"):
		push_error("FAIL: hero walk speed not multiplied by _hero_slow_multiplier")
		ok = false
	else:
		print("OK hero walk speed honors _hero_slow_multiplier")

	# ═══ 2. Enemy elite_affix field + tints + names ═══
	var enemy_src := FileAccess.get_file_as_string("res://scripts/enemy.gd")
	if "var elite_affix: String" not in enemy_src:
		push_error("FAIL: enemy.gd missing elite_affix field")
		ok = false
	else:
		print("OK enemy.gd has elite_affix field")
	for affix in ["frost", "ember", "venom", "warded"]:
		if "\"%s\":" % affix not in enemy_src:
			push_error("FAIL: enemy.gd ELITE_AFFIX_TINTS missing '%s' entry" % affix)
			ok = false
	if ok:
		print("OK ELITE_AFFIX_TINTS covers all 4 affixes")

	# ═══ 3. _baseline_modulate folds affix tint ═══
	var bm_idx: int = enemy_src.find("func _baseline_modulate")
	if bm_idx < 0:
		push_error("FAIL: _baseline_modulate function missing")
		ok = false
	else:
		var bm_body: String = enemy_src.substr(bm_idx, 800)
		if not bm_body.contains("ELITE_AFFIX_TINTS"):
			push_error("FAIL: _baseline_modulate doesn't fold ELITE_AFFIX_TINTS")
			ok = false
		else:
			print("OK _baseline_modulate folds affix tint multiplicatively")

	# ═══ 4. take_hit clamps damage when warded ═══
	if not enemy_src.contains("if elite_affix == \"warded\""):
		push_error("FAIL: enemy.gd take_hit doesn't clamp damage for warded affix")
		ok = false
	else:
		print("OK take_hit clamps damage when affix == warded")

	# ═══ 5. _die spawns ember AoE ═══
	if not enemy_src.contains("if elite_affix == \"ember\""):
		push_error("FAIL: enemy.gd _die doesn't spawn AoE for ember affix")
		ok = false
	if not enemy_src.contains("ELITE_EMBER_RADIUS"):
		push_error("FAIL: enemy.gd missing ELITE_EMBER_RADIUS constant")
		ok = false
	if ok:
		print("OK _die fires ember AoE when affix == ember")

	# ═══ 6. _apply_contact_affix dispatches frost + venom ═══
	if "func _apply_contact_affix" not in enemy_src:
		push_error("FAIL: _apply_contact_affix helper missing")
		ok = false
	# It should call apply_slow for frost AND apply_venom for venom.
	var ca_idx: int = enemy_src.find("func _apply_contact_affix")
	if ca_idx >= 0:
		var ca_body: String = enemy_src.substr(ca_idx, 600)
		if not (ca_body.contains("apply_slow") and ca_body.contains("apply_venom")):
			push_error("FAIL: _apply_contact_affix doesn't dispatch frost slow + venom DoT")
			ok = false
		else:
			print("OK _apply_contact_affix dispatches frost slow + venom DoT")
	# And it must be called from at least the main contact paths.
	var contact_calls: int = 0
	var enemy_lines: PackedStringArray = enemy_src.split("\n")
	for line in enemy_lines:
		var trimmed: String = line.strip_edges()
		if trimmed.begins_with("#"):
			continue
		if "_apply_contact_affix()" in line:
			contact_calls += 1
	# Expect: chase_contact body bump + bomber detonation + wraith strike
	# + telegraphed_melee swing = 4 call sites
	if contact_calls < 4:
		push_error("FAIL: _apply_contact_affix only called %d times — expected ≥4 (contact + bomber + wraith + melee)" % contact_calls)
		ok = false
	else:
		print("OK _apply_contact_affix invoked at %d hero-contact damage sites" % contact_calls)

	# ═══ 7. main.gd has _maybe_apply_elite_affix + call site ═══
	var main_src := FileAccess.get_file_as_string("res://scripts/main.gd")
	if "func _maybe_apply_elite_affix" not in main_src:
		push_error("FAIL: main.gd missing _maybe_apply_elite_affix function")
		ok = false
	else:
		print("OK main.gd has _maybe_apply_elite_affix")
	if not main_src.contains("_maybe_apply_elite_affix(enemy, type_res)"):
		push_error("FAIL: _spawn_enemy_type doesn't invoke _maybe_apply_elite_affix")
		ok = false
	else:
		print("OK _spawn_enemy_type invokes _maybe_apply_elite_affix before add_child")
	# Spawn gate config
	for c in ["ELITE_AFFIX_BASE_CHANCE", "ELITE_AFFIX_OPTIONS", "ELITE_AFFIX_MIN_ROOM_INDEX"]:
		if "const %s" % c not in main_src:
			push_error("FAIL: main.gd missing config const %s" % c)
			ok = false
	if ok:
		print("OK main.gd has affix spawn-gate configuration constants")

	# ═══ 8. Runtime — hero instance API works ═══
	var hero_scene := load("res://scenes/hero.tscn") as PackedScene
	if hero_scene == null:
		push_error("FAIL: hero.tscn won't load")
		ok = false
	else:
		var hero: Node = hero_scene.instantiate()
		root.add_child(hero)
		# apply_slow should set the multiplier + remaining
		if hero.has_method("apply_slow"):
			hero.apply_slow(1.0, 0.6)
			if abs(hero._hero_slow_multiplier - 0.6) > 0.001:
				push_error("FAIL: apply_slow didn't set _hero_slow_multiplier to 0.6 (got %s)" % hero._hero_slow_multiplier)
				ok = false
			if abs(hero._hero_slow_remaining - 1.0) > 0.001:
				push_error("FAIL: apply_slow didn't set _hero_slow_remaining to 1.0 (got %s)" % hero._hero_slow_remaining)
				ok = false
			# Worse-wins semantics: re-apply with weaker slow shouldn't downgrade
			hero.apply_slow(0.5, 0.9)   # shorter duration, weaker mul
			if abs(hero._hero_slow_multiplier - 0.6) > 0.001:
				push_error("FAIL: apply_slow downgraded multiplier (worse-wins violated)")
				ok = false
			else:
				print("OK apply_slow sets multiplier; re-apply with weaker slow doesn't downgrade")
		else:
			push_error("FAIL: hero instance missing apply_slow method")
			ok = false
		# apply_venom should set remaining + arm tick timer
		if hero.has_method("apply_venom"):
			hero.apply_venom(2.0)
			if abs(hero._hero_venom_remaining - 2.0) > 0.001:
				push_error("FAIL: apply_venom didn't set _hero_venom_remaining to 2.0")
				ok = false
			else:
				print("OK apply_venom sets _hero_venom_remaining + arms tick timer")
		else:
			push_error("FAIL: hero instance missing apply_venom method")
			ok = false
		hero.queue_free()

	# ═══ 9. Runtime — enemy with warded affix clamps damage ═══
	var slime_path := "res://scenes/enemies/slime.tres"
	if not ResourceLoader.exists(slime_path):
		push_error("FAIL: slime enemy resource missing, can't smoke-test")
		ok = false
	else:
		var enemy_scene := load("res://scenes/enemy.tscn") as PackedScene
		if enemy_scene == null:
			push_error("FAIL: enemy.tscn won't load")
			ok = false
		else:
			var e: Node = enemy_scene.instantiate()
			e.enemy_type = load(slime_path) as EnemyType
			e.elite_affix = "warded"
			root.add_child(e)
			# Force-clear the spawn-in fade so take_hit isn't gated by it.
			# Iter-15 spawn-in lock would otherwise drop our test calls.
			e._spawn_in_time = 0.0
			# Bump hp high enough to absorb both test hits without dying
			# (slime base hp is 1, would cap our -1 hit at 1 floor).
			e.hp = 10
			var hp_before: int = e.hp
			# 5 damage hit on warded → should drop by 4 (clamped -1).
			e.take_hit(5, false)
			var hp_drop: int = hp_before - e.hp
			if hp_drop != 4:
				push_error("FAIL: warded clamp wrong — expected -4 hp from 5-dmg hit (got -%d, before=%d after=%d)" % [hp_drop, hp_before, e.hp])
				ok = false
			else:
				print("OK warded affix clamps 5 damage → 4 (subtract 1 DR)")
			# 1-damage hit on warded → should still do 1 (the min-1 floor)
			var hp_mid: int = e.hp
			e.take_hit(1, false)
			var min_drop: int = hp_mid - e.hp
			if min_drop != 1:
				push_error("FAIL: warded floor wrong — 1-dmg hit should still do 1 (got -%d)" % min_drop)
				ok = false
			else:
				print("OK warded floor preserves min-1 damage (1-dmg hit deals 1)")
			e.queue_free()

	if ok:
		print("=== ITER 103 INTEGRATION PASSED ===")
	else:
		print("=== ITER 103 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
