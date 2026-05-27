extends SceneTree

# iter-256 / Wave 5B+5C — DESTRUCTIBLES + SECRET WALLS smoke test.
#
# Verifies the three destructible classes (pillar / lantern /
# sarcophagus) + the secret crackable wall behave as specified:
#
#   A. Pillar take_hit decrements hp; on hp<=0 rubble pile spawns and
#      the pillar drops from the "obstacles" group.
#   B. Lantern take_hit(1) triggers a fire pool spawn at the lantern
#      position + tweens light energy off. Lantern joins the
#      "breakable_lanterns" group at _ready.
#   C. Sarcophagus take_hit decrements hp; on hp<=0 the sarcophagus
#      breaks and either drops ether shards or emits an
#      enemy_summon_requested signal.
#   D. SecretWall take_hit twice → awards 30 ether shards via
#      GameState.award_ether_shards + plays the pickup_legendary chime.
#   E. Group registration: Pillar in "obstacles", Torch in
#      "breakable_lanterns", SecretWall in "secret_walls".
#
# Pattern follows iter-253 / iter-254 — instantiate the props in the
# test SceneTree, manually invoke take_hit, and assert state.

func _initialize() -> void:
	print("[iter256destruct] init")
	await process_frame

	# ── E (first). Group registration on _ready. ──────────────────────
	var pillar_scene: PackedScene = load("res://scenes/pillar.tscn") as PackedScene
	if pillar_scene == null:
		printerr("FAIL: pillar.tscn failed to load as PackedScene")
		quit(1)
		return
	var torch_scene: PackedScene = load("res://scenes/torch.tscn") as PackedScene
	if torch_scene == null:
		printerr("FAIL: torch.tscn failed to load as PackedScene")
		quit(1)
		return
	var sarc_scene: PackedScene = load("res://scenes/sarcophagus.tscn") as PackedScene
	if sarc_scene == null:
		printerr("FAIL: sarcophagus.tscn failed to load as PackedScene")
		quit(1)
		return
	var sw_scene: PackedScene = load("res://scenes/secret_wall.tscn") as PackedScene
	if sw_scene == null:
		printerr("FAIL: secret_wall.tscn failed to load as PackedScene")
		quit(1)
		return

	var p_check: Node = pillar_scene.instantiate()
	root.add_child(p_check)
	await process_frame
	if not p_check.is_in_group("obstacles"):
		printerr("FAIL: pillar not in 'obstacles' group after _ready")
		quit(1)
		return
	var t_check: Node = torch_scene.instantiate()
	root.add_child(t_check)
	await process_frame
	if not t_check.is_in_group("breakable_lanterns"):
		printerr("FAIL: torch not in 'breakable_lanterns' group after _ready")
		quit(1)
		return
	var sw_check: Node = sw_scene.instantiate()
	root.add_child(sw_check)
	await process_frame
	if not sw_check.is_in_group("secret_walls"):
		printerr("FAIL: secret_wall not in 'secret_walls' group after _ready")
		quit(1)
		return
	# Sarcophagus too — same group as pillar.
	var sarc_check: Node = sarc_scene.instantiate()
	root.add_child(sarc_check)
	await process_frame
	if not sarc_check.is_in_group("obstacles"):
		printerr("FAIL: sarcophagus not in 'obstacles' group after _ready")
		quit(1)
		return
	print("[iter256destruct] E OK — groups registered (obstacles/breakable_lanterns/secret_walls)")
	p_check.queue_free()
	t_check.queue_free()
	sw_check.queue_free()
	sarc_check.queue_free()
	await process_frame

	# ── A. Pillar HP + rubble spawn ──────────────────────────────────
	var pillar: Node = pillar_scene.instantiate()
	root.add_child(pillar)
	await process_frame
	# Initial hp comes from MAX_HP=5.
	var initial_hp: int = int(pillar.get("hp"))
	if initial_hp != 5:
		printerr("FAIL: pillar initial hp = %d, expected 5" % initial_hp)
		quit(1)
		return
	# One heavy hit drops to 3.
	pillar.call("take_hit", 2, Vector2(100, 100))
	await process_frame
	var hp_after_hit: int = int(pillar.get("hp"))
	if hp_after_hit != 3:
		printerr("FAIL: pillar hp after take_hit(2) = %d, expected 3" % hp_after_hit)
		quit(1)
		return
	if pillar.get("_collapsed"):
		printerr("FAIL: pillar collapsed prematurely at hp=3")
		quit(1)
		return
	print("[iter256destruct] A1 OK — pillar hp 5 → 3 after take_hit(2)")
	# Knock pillar to 0. take_hit(3) puts it at hp=0 → collapses.
	pillar.call("take_hit", 3, Vector2(100, 100))
	await process_frame
	if not pillar.get("_collapsed"):
		printerr("FAIL: pillar did not collapse at hp<=0")
		quit(1)
		return
	# Pillar should be out of "obstacles" group.
	if pillar.is_in_group("obstacles"):
		printerr("FAIL: collapsed pillar still in 'obstacles' group")
		quit(1)
		return
	# Rubble pile should be a new sibling in the obstacles group at the
	# pillar's world position. Find by group + position match.
	var obstacles: Array = get_nodes_in_group("obstacles")
	var found_rubble: bool = false
	for o in obstacles:
		if o == pillar:
			continue
		if not (o is StaticBody2D):
			continue
		if (o as StaticBody2D).global_position.distance_to((pillar as Node2D).global_position) < 4.0:
			found_rubble = true
			break
	if not found_rubble:
		printerr("FAIL: pillar collapse did not spawn a rubble pile in 'obstacles' group at pillar position")
		quit(1)
		return
	print("[iter256destruct] A2 OK — collapse leaves a rubble pile in 'obstacles' group")
	# Cleanup
	for o in obstacles:
		if is_instance_valid(o):
			o.queue_free()
	if is_instance_valid(pillar):
		pillar.queue_free()
	await process_frame

	# ── B. Lantern break → fire pool spawn ───────────────────────────
	# We need to count fire pool children before + after the break.
	# fire_pool.tscn is the FirePool Area2D — find by class string.
	var torch_for_break: Node = torch_scene.instantiate()
	root.add_child(torch_for_break)
	await process_frame
	# Pre-break: no FirePool sibling.
	var pre_fire_pools: int = _count_fire_pools_under(root)
	# Trigger the break.
	torch_for_break.call("take_hit", 1)
	await process_frame
	# Post-break: at least one new FirePool spawned.
	var post_fire_pools: int = _count_fire_pools_under(root)
	if post_fire_pools <= pre_fire_pools:
		printerr("FAIL: lantern break did not spawn a fire pool (pre=%d, post=%d)" % [pre_fire_pools, post_fire_pools])
		quit(1)
		return
	# Lantern should have _broken = true.
	if not torch_for_break.get("_broken"):
		printerr("FAIL: lantern _broken not set after take_hit(1)")
		quit(1)
		return
	# Lantern removed from group.
	if torch_for_break.is_in_group("breakable_lanterns"):
		printerr("FAIL: broken lantern still in 'breakable_lanterns' group")
		quit(1)
		return
	print("[iter256destruct] B OK — lantern break spawns fire pool + flags _broken")
	# Cleanup (the tween will queue_free the torch after 0.4s; we don't
	# wait — just remove dead refs).
	for fp in get_nodes_in_group("hazards"):
		if is_instance_valid(fp):
			fp.queue_free()
	await process_frame

	# ── C. Sarcophagus HP + break path ───────────────────────────────
	# We test the HP decrement (not the random roll outcome — that's
	# non-deterministic). Verify hp=2 → take_hit(2) → _broken.
	var sarc: Node = sarc_scene.instantiate()
	root.add_child(sarc)
	await process_frame
	var sarc_hp: int = int(sarc.get("hp"))
	if sarc_hp != 2:
		printerr("FAIL: sarcophagus initial hp = %d, expected 2" % sarc_hp)
		quit(1)
		return
	sarc.call("take_hit", 1, Vector2(100, 100))
	await process_frame
	if int(sarc.get("hp")) != 1:
		printerr("FAIL: sarcophagus hp after take_hit(1) = %d, expected 1" % int(sarc.get("hp")))
		quit(1)
		return
	if sarc.get("_broken"):
		printerr("FAIL: sarcophagus broken too early at hp=1")
		quit(1)
		return
	sarc.call("take_hit", 1, Vector2(100, 100))
	await process_frame
	if not sarc.get("_broken"):
		printerr("FAIL: sarcophagus did not break at hp=0")
		quit(1)
		return
	print("[iter256destruct] C OK — sarcophagus hp 2 → 1 → 0 + breaks")
	# Cleanup
	if is_instance_valid(sarc):
		sarc.queue_free()
	await process_frame

	# ── D. SecretWall award ether shards on break ────────────────────
	# Access GameState via /root/GameState node lookup so the test
	# script parses standalone (the global `GameState` autoload isn't
	# resolved at parse-time in the --script mode). Same indirection
	# pattern iter226 uses.
	var gs: Node = root.get_node_or_null("/root/GameState")
	if gs == null:
		printerr("FAIL: /root/GameState autoload missing")
		quit(1)
		return
	var pre_shards: int = int(gs.get("ether_shards"))
	var sw: Node = sw_scene.instantiate()
	root.add_child(sw)
	await process_frame
	# Two hits to break (hp=2). First hit doesn't award.
	sw.call("take_hit", 1, Vector2(100, 100))
	await process_frame
	if int(gs.get("ether_shards")) != pre_shards:
		printerr("FAIL: ether shards awarded on first hit (should require 2)")
		quit(1)
		return
	if sw.get("_broken"):
		printerr("FAIL: secret_wall broken on first hit (hp should be 1)")
		quit(1)
		return
	sw.call("take_hit", 1, Vector2(100, 100))
	await process_frame
	if not sw.get("_broken"):
		printerr("FAIL: secret_wall did not break on second hit")
		quit(1)
		return
	# award_ether_shards multiplies by 1.0 (no ether_magnet relic),
	# adds 30 to the counter.
	var delta: int = int(gs.get("ether_shards")) - pre_shards
	if delta != 30:
		printerr("FAIL: secret_wall break awarded %d shards, expected 30" % delta)
		quit(1)
		return
	if sw.is_in_group("secret_walls"):
		printerr("FAIL: broken secret_wall still in 'secret_walls' group")
		quit(1)
		return
	print("[iter256destruct] D OK — secret_wall break awards 30 ether shards")

	# Cleanup. Reset the shard counter so any later tests start fresh.
	gs.set("ether_shards", pre_shards)
	if is_instance_valid(sw):
		sw.queue_free()
	await process_frame

	print("[iter256destruct] PASS")
	quit(0)

# Count Area2D children of `parent` whose script is fire_pool.gd.
# Used to verify the lantern break actually spawned a fire pool.
func _count_fire_pools_under(parent: Node) -> int:
	var n: int = 0
	for child in parent.get_children():
		# fire_pool.tscn extends Area2D with hazard_kind = "fire_pool".
		if child is Area2D and "hazard_kind" in child:
			if (child as Area2D).get("hazard_kind") == "fire_pool":
				n += 1
		# Recurse one level (the torch's parent is root in this test;
		# fire pools spawn as siblings).
	return n

