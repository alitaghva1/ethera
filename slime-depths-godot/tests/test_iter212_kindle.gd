extends SceneTree

# Iter 212 — KINDLE_SPREAD runtime test. Verifies the burn-on-death
# chain works end-to-end:
#   1. Build two Slimes at positions 40 px apart (within KINDLE_RADIUS).
#   2. Burn e1, force-kill it via take_hit(99).
#   3. Assert e2's _burn_remaining is > 0 after a few frames — proves
#      the kindle landed.
#
# Run: godot --headless --script tests/test_iter212_kindle.gd
#
# Known noise: the test environment spawns enemies outside main.gd's
# normal flow, so FX initialization (fx_sprite.gd) prints "Parent node
# is busy setting up children" warnings during _ready. These are TEST-
# SETUP artifacts; production code where main.gd manages enemy spawn
# ordering doesn't see them. The test PASS/FAIL line is what counts.

func _initialize() -> void:
	print("[kindle] init")
	# Load assets lazily AFTER autoloads register (preload at file top
	# tries to resolve at parse time, before the Events autoload exists).
	var SlimeType: Resource = load("res://scenes/enemies/slime.tres")
	var EnemyScene: PackedScene = load("res://scenes/enemy.tscn")
	if SlimeType == null or EnemyScene == null:
		printerr("FAIL: missing slime.tres or enemy.tscn")
		quit(1)
		return
	# Need a minimal scene so the enemy can resolve its parent + tree.
	var holder: Node2D = Node2D.new()
	holder.name = "Holder"
	root.add_child(holder)
	# Two enemies — one will burn-die, the other should receive the kindle.
	var e1: Node = EnemyScene.instantiate()
	e1.set("enemy_type", SlimeType)
	e1.position = Vector2(200, 200)
	e1.add_to_group("enemies")
	holder.add_child(e1)
	var e2: Node = EnemyScene.instantiate()
	e2.set("enemy_type", SlimeType)
	e2.position = Vector2(240, 200)  # 40 px away — well within KINDLE_RADIUS (96)
	e2.add_to_group("enemies")
	holder.add_child(e2)
	# Wait one frame so _ready runs on both.
	await process_frame
	# Skip spawn-in invulnerability (0.35s by default) so take_hit
	# doesn't early-return. Setting directly is fine for the test.
	e1.set("_spawn_in_time", 0.0)
	e2.set("_spawn_in_time", 0.0)
	if e1.has_method("apply_burn"):
		print("[kindle] applying burn to e1")
		e1.call("apply_burn", 3.0)
	else:
		printerr("FAIL: e1 missing apply_burn")
		quit(1)
		return
	# Diagnostics BEFORE kill: confirm burn was applied and e1 is in
	# enemies group.
	print("[kindle] pre-kill: e1._burn_remaining=%.2f e1._dying=%s in_enemies=%s" % [
		e1.get("_burn_remaining"),
		str(e1.get("_dying")),
		str(e1.is_in_group("enemies")),
	])
	print("[kindle] e2 in enemies group: %s" % str(e2.is_in_group("enemies")))
	# Force-kill e1 by piping lethal damage through take_hit.
	if e1.has_method("take_hit"):
		print("[kindle] killing e1 with 99 dmg take_hit")
		e1.call("take_hit", 99, false)
	else:
		printerr("FAIL: e1 missing take_hit")
		quit(1)
		return
	# Diagnostics AFTER kill: did e1._dying flip? Did burn_remaining
	# survive the kill (it should — burn isn't cleared on death) so
	# _trigger_kindle_spread should have fired.
	print("[kindle] post-kill: e1._dying=%s e1._burn_remaining=%.2f" % [
		str(e1.get("_dying")),
		e1.get("_burn_remaining"),
	])
	# Let _die() + _trigger_kindle_spread + tweens settle for a few frames.
	for i in range(8):
		await process_frame
	# Verify e2's burn was applied (kindle landed).
	var e2_burn_remaining: float = e2.get("_burn_remaining")
	if e2_burn_remaining > 0.0:
		print("[kindle] PASS — e2 burn_remaining = %.2f" % e2_burn_remaining)
		quit(0)
	else:
		printerr("FAIL: e2 was not kindled (burn_remaining = %.2f)" % e2_burn_remaining)
		quit(1)
