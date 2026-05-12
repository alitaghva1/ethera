extends SceneTree

# Iter 104 — elite affix teaching layer.
#
# Iter-103 landed the affix system (Frost/Ember/Venom/Warded) but
# proc'd silently — players had to trial-and-error which colored
# enemy did what. Iter-104 adds proc-time floaters so the player
# learns the language in the moment:
#
#   • Frost slow applied → "SLOW" floater above hero (cyan tint)
#   • Venom DoT applied → "VENOM" floater above hero (green tint)
#   • Warded damage clamped (only when clamp was non-trivial — i.e.
#     original damage > 1) → "WARDED" floater above enemy (silver-gold)
#   • Ember death AoE fires → "BURST" floater at corpse (red-orange)
#
# Floaters use DamageNumber.spawn at -88 px (higher than the standard
# -28 damage-number anchor) so proc feedback reads distinct from
# regular damage numbers, and use the affix's own tint color so the
# visual link is immediate.
func _initialize() -> void:
	var ok := true
	var enemy_src := FileAccess.get_file_as_string("res://scripts/enemy.gd")

	# ═══ 1. _spawn_affix_floater helper exists ═══
	if "func _spawn_affix_floater" not in enemy_src:
		push_error("FAIL: _spawn_affix_floater helper missing")
		ok = false
	else:
		print("OK enemy.gd has _spawn_affix_floater helper")

	# Floater offset y=-88 (above the standard -28 damage anchor)
	var sf_idx: int = enemy_src.find("func _spawn_affix_floater")
	if sf_idx >= 0:
		var sf_body: String = enemy_src.substr(sf_idx, 500)
		if "Vector2(0, -88)" not in sf_body:
			push_error("FAIL: affix floater not at y=-88 (would collide with damage numbers)")
			ok = false
		else:
			print("OK affix floaters anchored at y=-88 (distinct from damage numbers at -28)")

	# ═══ 2. Frost slow application spawns SLOW floater ═══
	var ca_idx: int = enemy_src.find("func _apply_contact_affix")
	if ca_idx >= 0:
		var ca_body: String = enemy_src.substr(ca_idx, 1000)
		if "_spawn_affix_floater(\"SLOW\"" not in ca_body:
			push_error("FAIL: frost path doesn't spawn 'SLOW' floater")
			ok = false
		if "_spawn_affix_floater(\"VENOM\"" not in ca_body:
			push_error("FAIL: venom path doesn't spawn 'VENOM' floater")
			ok = false
	if ok:
		print("OK frost + venom proc paths spawn labeled floaters")

	# ═══ 3. Warded clamp spawns WARDED floater (only when damage > 1) ═══
	if not enemy_src.contains("_spawn_affix_floater(\"WARDED\""):
		push_error("FAIL: warded clamp doesn't spawn 'WARDED' floater")
		ok = false
	# Ensure the floater is gated on `original_damage > 1` so 1-damage
	# chip hits don't spam the floater on every tick.
	if not enemy_src.contains("if original_damage > 1"):
		push_error("FAIL: warded floater not gated on damage > 1 — would spam on chip hits")
		ok = false
	if ok:
		print("OK warded floater spawns only when clamp is meaningful (damage > 1)")

	# ═══ 4. Ember death AoE spawns BURST floater ═══
	if not enemy_src.contains("_spawn_affix_floater(\"BURST\""):
		push_error("FAIL: ember death AoE doesn't spawn 'BURST' floater")
		ok = false
	else:
		print("OK ember death AoE spawns 'BURST' floater at corpse")

	# ═══ 5. Each floater uses the matching affix tint ═══
	# Look for the four affix-tint dict accesses in proc paths.
	for affix in ["frost", "venom", "warded", "ember"]:
		if "ELITE_AFFIX_TINTS[\"%s\"]" % affix not in enemy_src:
			push_error("FAIL: floater for affix '%s' doesn't pull color from ELITE_AFFIX_TINTS" % affix)
			ok = false
	if ok:
		print("OK each floater uses its matching ELITE_AFFIX_TINTS color")

	# ═══ 6. Runtime smoke — instantiate enemy + warded clamp triggers floater ═══
	# We can't easily intercept the floater spawn (it's a transient
	# Node2D under the parent), but we CAN confirm the clamp + floater
	# code path runs without error.
	var enemy_scene := load("res://scenes/enemy.tscn") as PackedScene
	var slime_path := "res://scenes/enemies/slime.tres"
	if enemy_scene != null and ResourceLoader.exists(slime_path):
		var e: Node = enemy_scene.instantiate()
		e.enemy_type = load(slime_path) as EnemyType
		e.elite_affix = "warded"
		root.add_child(e)
		e._spawn_in_time = 0.0
		e.hp = 10
		# 5-damage hit with warded → clamp + floater spawn
		var children_before: int = root.get_child_count()
		e.take_hit(5, false)
		# DamageNumber gets added to the host (the parent of the enemy,
		# which is root in our test context).
		var children_after: int = root.get_child_count()
		if children_after <= children_before:
			push_error("FAIL: warded clamp didn't spawn the WARDED floater (child count unchanged)")
			ok = false
		else:
			print("OK warded clamp spawns a child (the WARDED floater)")
		e.queue_free()

	if ok:
		print("=== ITER 104 INTEGRATION PASSED ===")
	else:
		print("=== ITER 104 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
