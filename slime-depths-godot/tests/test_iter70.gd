extends SceneTree

# Iter 70 integration test — verifies the three parallel tracks +
# central-controller polish layer all composed.
#
# Track A (assets): EnemyType.sprite_modulate field + per-enemy tints
# Track B (feel):   hero.gd accel ramp + aim assist + knockback
# Track C (menu):   redesigned main_menu.tscn with embers + title
# Polish:           source_pos plumbed through all hero-damage callers
func _initialize() -> void:
	var ok := true

	# ── Track A: assets ──────────────────────────────────────────
	var et_src := FileAccess.get_file_as_string("res://scripts/enemy_type.gd")
	if not et_src.contains("sprite_modulate"):
		push_error("FAIL: enemy_type.gd missing sprite_modulate field")
		ok = false
	else:
		print("OK EnemyType has sprite_modulate field")

	# Spectral priest has green tint
	var priest: Resource = load("res://scenes/enemies/spectral_priest.tres")
	if priest == null:
		push_error("FAIL: spectral_priest.tres failed to load")
		ok = false
	else:
		var mod: Color = priest.get("sprite_modulate")
		if mod == Color(1, 1, 1, 1):
			push_error("FAIL: spectral_priest sprite_modulate is white (no tint)")
			ok = false
		else:
			print("OK spectral_priest tinted: %s" % str(mod))

	# Bone summoner has purple-red tint
	var summ: Resource = load("res://scenes/enemies/bone_summoner.tres")
	if summ == null:
		push_error("FAIL: bone_summoner.tres failed to load")
		ok = false
	else:
		var mod: Color = summ.get("sprite_modulate")
		if mod == Color(1, 1, 1, 1):
			push_error("FAIL: bone_summoner sprite_modulate is white (no tint)")
			ok = false
		else:
			print("OK bone_summoner tinted: %s" % str(mod))

	# Rogue wraith has violet+ghostly alpha
	var wraith: Resource = load("res://scenes/enemies/rogue_wraith.tres")
	if wraith == null:
		push_error("FAIL: rogue_wraith.tres failed to load")
		ok = false
	else:
		var mod: Color = wraith.get("sprite_modulate")
		if mod.a >= 1.0:
			push_error("FAIL: rogue_wraith alpha should be <1.0 (ghostly), got %s" % mod.a)
			ok = false
		else:
			print("OK rogue_wraith ghostly: %s" % str(mod))

	# enemy.gd has _baseline_modulate helper
	var enemy_src := FileAccess.get_file_as_string("res://scripts/enemy.gd")
	if not enemy_src.contains("_baseline_modulate"):
		push_error("FAIL: enemy.gd missing _baseline_modulate helper")
		ok = false
	else:
		print("OK enemy.gd has _baseline_modulate helper")

	# ── Track B: feel ────────────────────────────────────────────
	var hero_src := FileAccess.get_file_as_string("res://scripts/hero.gd")
	if not hero_src.contains("move_toward"):
		push_error("FAIL: hero.gd doesn't use move_toward (no accel ramp)")
		ok = false
	else:
		print("OK hero.gd uses move_toward for accel ramp")

	if not hero_src.contains("_apply_aim_assist"):
		push_error("FAIL: hero.gd missing _apply_aim_assist")
		ok = false
	else:
		print("OK hero.gd has _apply_aim_assist")

	if not hero_src.contains("_knockback_dir"):
		push_error("FAIL: hero.gd missing _knockback_dir state")
		ok = false
	else:
		print("OK hero.gd has knockback state")

	if not hero_src.contains("source_pos"):
		push_error("FAIL: hero.gd take_damage doesn't have source_pos param")
		ok = false
	else:
		print("OK hero.gd take_damage has source_pos param")

	# ── Central-controller polish: source_pos plumbed ────────────
	# enemy.gd should pass global_position on hero damage
	if not enemy_src.contains("take_damage(t.contact_damage, global_position)"):
		push_error("FAIL: enemy.gd contact damage doesn't pass source_pos")
		ok = false
	elif not enemy_src.contains("take_damage(WRAITH_STRIKE_DAMAGE, global_position)"):
		push_error("FAIL: enemy.gd wraith strike doesn't pass source_pos")
		ok = false
	else:
		print("OK enemy.gd plumbs source_pos to take_damage")

	# projectile.gd hero-fallback path passes source_pos
	var proj_src := FileAccess.get_file_as_string("res://scripts/projectile.gd")
	if not proj_src.contains("body.take_damage(dmg_out, global_position)"):
		push_error("FAIL: projectile.gd hero-damage path doesn't pass source_pos")
		ok = false
	else:
		print("OK projectile.gd hero-damage plumbs source_pos")

	# fire_jet hazard
	var jet_src := FileAccess.get_file_as_string("res://scripts/fire_jet.gd")
	if not jet_src.contains("take_damage(DAMAGE_PER_TICK, global_position)"):
		push_error("FAIL: fire_jet.gd doesn't pass source_pos")
		ok = false
	else:
		print("OK fire_jet.gd plumbs source_pos")

	# lightning_rod hazard
	var rod_src := FileAccess.get_file_as_string("res://scripts/lightning_rod.gd")
	if not rod_src.contains("take_damage(DAMAGE_PER_STRIKE, global_position)"):
		push_error("FAIL: lightning_rod.gd doesn't pass source_pos")
		ok = false
	else:
		print("OK lightning_rod.gd plumbs source_pos")

	# ── Track C: menu ────────────────────────────────────────────
	var menu := load("res://scenes/main_menu.tscn")
	if menu == null:
		push_error("FAIL: main_menu.tscn failed to load")
		ok = false
	else:
		print("OK main_menu.tscn loads")

	var menu_src := FileAccess.get_file_as_string("res://scenes/main_menu.tscn")
	if not menu_src.contains("EmberParticles") and not menu_src.contains("CPUParticles2D"):
		push_error("FAIL: main_menu.tscn has no ember particles")
		ok = false
	else:
		print("OK main_menu.tscn has ember particles")

	if not menu_src.contains("ETHERA") and not menu_src.contains("E T H E R A"):
		push_error("FAIL: main_menu.tscn doesn't include ETHERA title")
		ok = false
	else:
		print("OK main_menu.tscn has ETHERA title")

	if ok:
		print("=== ITER 70 INTEGRATION PASSED ===")
	else:
		print("=== ITER 70 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
