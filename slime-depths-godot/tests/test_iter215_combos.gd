extends SceneTree

# Iter 215 / Phase 4 — Status combo regression test.
# Verifies the two enemy-side combos that fire on enemy state:
#   1. PETRIFY (SLOW + CRIT) — slowed enemy hit with is_crit=true → stunned.
#   2. SCATTER_FLAMES (BURN + KNOCKBACK) — burning enemy knocked → nearby
#      enemy catches a short burn.
# Hero-side combos (BACKDRAFT, RIME_TRAIL) require a full hero+main flow
# to test in isolation and aren't covered here — they're protected by
# manual playtest. Registry-side and dispatcher-side wiring is what this
# test guards.

func _initialize() -> void:
	print("[combos] init")
	await process_frame
	var SlimeType: Resource = load("res://scenes/enemies/slime.tres")
	var EnemyScene: PackedScene = load("res://scenes/enemy.tscn")
	if SlimeType == null or EnemyScene == null:
		printerr("FAIL: missing slime.tres or enemy.tscn")
		quit(1)
		return
	# Test 1 — PETRIFY.
	# Build a slowed slime, hit with crit. Should set _petrify_remaining > 0.
	var holder: Node2D = Node2D.new()
	holder.name = "PetrifyHolder"
	root.add_child(holder)
	var e_pet: Node = EnemyScene.instantiate()
	e_pet.set("enemy_type", SlimeType)
	e_pet.position = Vector2(200, 200)
	e_pet.add_to_group("enemies")
	holder.add_child(e_pet)
	await process_frame
	e_pet.set("_spawn_in_time", 0.0)
	# Apply slow first (5 seconds, default multiplier).
	if e_pet.has_method("apply_slow"):
		e_pet.call("apply_slow", 5.0)
	else:
		printerr("FAIL: e_pet missing apply_slow")
		quit(1)
		return
	# Crit hit (slime has 1 HP — give it enough HP to survive: bump to 99).
	e_pet.set("hp", 99)
	e_pet.call("take_hit", 1, true)  # is_crit = true
	# Settle one frame.
	await process_frame
	var pet_rem: float = e_pet.get("_petrify_remaining")
	if pet_rem <= 0.0:
		printerr("FAIL: PETRIFY did not fire — _petrify_remaining=%.3f" % pet_rem)
		quit(1)
		return
	print("[combos] PETRIFY OK — _petrify_remaining=%.3f" % pet_rem)
	# Test 2 — SCATTER_FLAMES.
	# Build a burning slime + a neighbor 32px away. Knock the burning
	# slime. Neighbor should receive a short burn.
	var holder2: Node2D = Node2D.new()
	holder2.name = "ScatterHolder"
	root.add_child(holder2)
	var e_burn: Node = EnemyScene.instantiate()
	e_burn.set("enemy_type", SlimeType)
	e_burn.position = Vector2(400, 200)
	e_burn.add_to_group("enemies")
	holder2.add_child(e_burn)
	var e_nbr: Node = EnemyScene.instantiate()
	e_nbr.set("enemy_type", SlimeType)
	e_nbr.position = Vector2(432, 200)  # 32 px away
	e_nbr.add_to_group("enemies")
	holder2.add_child(e_nbr)
	await process_frame
	e_burn.set("_spawn_in_time", 0.0)
	e_nbr.set("_spawn_in_time", 0.0)
	# Bump e_burn HP high so the burn tick doesn't kill it (1-HP slime
	# would die on the first burn tick → KINDLE_SPREAD fires → that
	# noises the SCATTER_FLAMES signal). With high HP, only SCATTER
	# can produce the neighbor's burn within the test window.
	e_burn.set("hp", 99)
	# Burn e_burn first.
	if e_burn.has_method("apply_burn"):
		e_burn.call("apply_burn", 3.0)
	else:
		printerr("FAIL: e_burn missing apply_burn")
		quit(1)
		return
	# Knock e_burn.
	if e_burn.has_method("apply_knockback"):
		e_burn.call("apply_knockback", Vector2(1, 0), 100.0, 0.2)
	else:
		printerr("FAIL: e_burn missing apply_knockback")
		quit(1)
		return
	# Let SCATTER_FLAMES dispatch run.
	for i in range(4):
		await process_frame
	var nbr_burn: float = e_nbr.get("_burn_remaining")
	if nbr_burn <= 0.0:
		printerr("FAIL: SCATTER_FLAMES did not spread burn — neighbor burn=%.3f" % nbr_burn)
		quit(1)
		return
	print("[combos] SCATTER_FLAMES OK — neighbor burn_remaining=%.3f" % nbr_burn)
	print("[combos] PASS — PETRIFY + SCATTER_FLAMES both fired correctly")
	quit(0)
