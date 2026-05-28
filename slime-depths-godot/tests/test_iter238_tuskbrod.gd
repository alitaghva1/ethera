extends SceneTree

# Iter 238 / Expansion Team R4 — Tuskbrod charger regression test.
#
# Completes the shield/flying/charger missing-archetype trio. Guards the
# new `charger` behavior tag, its 4-state machine (WANDER → TELEGRAPH
# → CHARGE → RECOVERY), the locked-aim Line2D visual, and the charge-
# bonus contact damage.
#
# Coverage:
#   1. tuskbrod.tres loads as EnemyType with behavior="charger",
#      max_hp=5, registered in main.gd's ENEMY_TYPES.
#   2. enemy.gd dispatches "charger" → _tick_charger (source-grep
#      guards against the new behavior tag silently falling through
#      to chase_contact).
#   3. force_charger_telegraph_for_test() advances state WANDER →
#      TELEGRAPH; the aim-ray Line2D is visible (alpha > 0) during
#      TELEGRAPH.
#   4. force_charger_charge_for_test() advances state to CHARGE; the
#      aim-ray hides. Contact damage during the charge is the bonus
#      value (contact_damage + CHARGER_CONTACT_DAMAGE_BONUS = 2).
#   5. After the charge timer drains, state advances to RECOVERY then
#      back to WANDER (verifies the post-charge stun + return cycle).
#   6. room_06.tres includes "tuskbrod" in a wave (registry → combat
#      end-to-end check — gap that snared the iter-230 / iter-234
#      archetypes the same way).

func _initialize() -> void:
	print("[tuskbrod238] init")
	await process_frame
	# ── 1. .tres + registry sanity ────────────────────────────────────
	var TuskbrodType: EnemyType = load("res://scenes/enemies/tuskbrod.tres") as EnemyType
	if TuskbrodType == null:
		printerr("FAIL: tuskbrod.tres failed to load as EnemyType")
		quit(1)
		return
	if TuskbrodType.behavior != "charger":
		printerr("FAIL: tuskbrod.tres behavior=%s, expected 'charger'" % TuskbrodType.behavior)
		quit(1)
		return
	if TuskbrodType.max_hp != 5:
		printerr("FAIL: tuskbrod.tres max_hp=%d, expected 5 (tank-class)" % TuskbrodType.max_hp)
		quit(1)
		return
	if TuskbrodType.move_speed < 40.0 or TuskbrodType.move_speed > 70.0:
		printerr(
			"FAIL: tuskbrod.tres move_speed=%.1f, expected 40..70 (lumbering base)" % TuskbrodType.move_speed
		)
		quit(1)
		return
	print(
		"[tuskbrod238] .tres OK — behavior=charger, hp=%d, speed=%.0f" % [
			TuskbrodType.max_hp, TuskbrodType.move_speed
		]
	)
	# ── 2. main.gd ENEMY_TYPES registration ───────────────────────────
	var main_script: Script = load("res://scripts/main.gd") as Script
	if main_script == null:
		printerr("FAIL: main.gd failed to load")
		quit(1)
		return
	if main_script.source_code.find("\"tuskbrod\"") < 0:
		printerr("FAIL: main.gd ENEMY_TYPES missing 'tuskbrod' key")
		quit(1)
		return
	print("[tuskbrod238] ENEMY_TYPES registers tuskbrod")
	# ── 3. enemy.gd dispatch + tick function present ──────────────────
	var enemy_script: Script = load("res://scripts/enemy.gd") as Script
	if enemy_script == null:
		printerr("FAIL: enemy.gd failed to load")
		quit(1)
		return
	if enemy_script.source_code.find("\"charger\":") < 0:
		printerr("FAIL: enemy.gd missing 'charger' dispatch branch in _physics_process")
		quit(1)
		return
	if enemy_script.source_code.find("_tick_charger") < 0:
		printerr("FAIL: enemy.gd missing _tick_charger function")
		quit(1)
		return
	print("[tuskbrod238] enemy.gd has charger dispatch + tick function")
	# ── 4. Spawn a live tuskbrod + fake hero ─────────────────────────
	var EnemyScene: PackedScene = load("res://scenes/enemy.tscn") as PackedScene
	if EnemyScene == null:
		printerr("FAIL: enemy.tscn failed to load")
		quit(1)
		return
	var holder: Node2D = Node2D.new()
	holder.name = "TuskbrodHolder"
	root.add_child(holder)
	# Fake hero — same FakeHero shape used in the iter-234 moth test.
	# CharacterBody2D + "hero" group + take_damage method = enough for
	# the contact-damage path to resolve.
	var fake_hero := FakeHero.new()
	fake_hero.global_position = Vector2(500, 500)
	holder.add_child(fake_hero)
	await process_frame
	# Spawn the tuskbrod 80 px east of the hero — within charge range
	# but not on top of the hero.
	var e: Node = EnemyScene.instantiate()
	e.set("enemy_type", TuskbrodType)
	e.position = Vector2(580, 500)
	holder.add_child(e)
	# Wire the hero ref so the charger AI engages.
	e.set("_hero", fake_hero)
	await process_frame
	# Bypass spawn-in fade so AI ticks run.
	e.set("_spawn_in_time", 0.0)
	e.set("hp", TuskbrodType.max_hp)
	# ── 5. Initial state = WANDER ────────────────────────────────────
	# State enum: WANDER=0, TELEGRAPH=1, CHARGE=2, RECOVERY=3.
	var initial_state: int = int(e.call("get_charger_state_for_test"))
	if initial_state != 0:
		printerr(
			"FAIL: fresh tuskbrod state=%d, expected 0 (WANDER)" % initial_state
		)
		quit(1)
		return
	print("[tuskbrod238] initial state = WANDER OK")
	# Aim ray should be hidden during WANDER.
	if bool(e.call("is_charger_aim_ray_visible_for_test")):
		printerr("FAIL: aim ray visible during WANDER (should be hidden)")
		quit(1)
		return
	# ── 6. Force telegraph → state TELEGRAPH + aim ray visible ───────
	e.call("force_charger_telegraph_for_test")
	# Tick a couple physics frames so the TELEGRAPH branch executes and
	# the aim-ray visual updates. Single physics_frame fires BEFORE the
	# physics tick on the enemy; we need at least one full tick to have
	# run for _update_charger_aim_ray_visual(true) to take effect.
	for i in range(3):
		await physics_frame
	var telegraph_state: int = int(e.call("get_charger_state_for_test"))
	if telegraph_state != 1:
		printerr(
			"FAIL: force_charger_telegraph_for_test → state=%d, expected 1 (TELEGRAPH)" % telegraph_state
		)
		quit(1)
		return
	if not bool(e.call("is_charger_aim_ray_visible_for_test")):
		printerr("FAIL: aim ray not visible during TELEGRAPH (expected alpha > 0.5)")
		quit(1)
		return
	print("[tuskbrod238] TELEGRAPH state + aim ray visible OK")
	# ── 7. Force charge → state CHARGE + damages hero on contact ────
	# Position tuskbrod directly on top of hero so contact resolves on
	# the first physics frame of the charge.
	(e as Node2D).global_position = fake_hero.global_position + Vector2(20, 0)
	fake_hero.hp = 10  # Headroom for contact damage.
	e.call("force_charger_charge_for_test")
	# Verify state.
	var charge_state: int = int(e.call("get_charger_state_for_test"))
	if charge_state != 2:
		printerr(
			"FAIL: force_charger_charge_for_test → state=%d, expected 2 (CHARGE)" % charge_state
		)
		quit(1)
		return
	# Aim ray should now be HIDDEN (lane locked but visual hides during
	# the actual lunge — the lane was a windup affordance).
	# The visibility flag is set per-tick in _update_charger_aim_ray_visual.
	# Drive one physics frame so the CHARGE branch runs once and updates
	# the ray alpha.
	var hp_before_charge: int = fake_hero.hp
	# Tick several frames during the charge window. Contact range is
	# 38 px and we're 20 px away → first frame should land the hit.
	for i in range(8):
		await physics_frame
		if fake_hero.hp < hp_before_charge:
			break
	if fake_hero.hp >= hp_before_charge:
		printerr(
			"FAIL: charger contact during CHARGE did not damage hero (hp %d → %d)" % [
				hp_before_charge, fake_hero.hp
			]
		)
		quit(1)
		return
	# Verify the damage value is the BONUS (contact_damage + 1 = 2),
	# not the baseline contact_damage (1). The hero loses exactly 2 HP
	# on the first contact tick.
	var hp_delta: int = hp_before_charge - fake_hero.hp
	if hp_delta != 2:
		printerr(
			"FAIL: charge hit damage=%d, expected 2 (contact_damage 1 + CHARGER_CONTACT_DAMAGE_BONUS 1)" % hp_delta
		)
		quit(1)
		return
	print("[tuskbrod238] CHARGE damages hero — hp %d → %d (charge bonus = +1)" % [
		hp_before_charge, fake_hero.hp
	])
	# Aim ray should NOT be visible during charge (lane was already
	# committed; the visual cue was for the windup only).
	if bool(e.call("is_charger_aim_ray_visible_for_test")):
		printerr("FAIL: aim ray visible during CHARGE (should hide once lane is committed)")
		quit(1)
		return
	print("[tuskbrod238] aim ray hidden during CHARGE OK")
	# ── 8. After charge timer drains → RECOVERY then WANDER ──────────
	# CHARGE timer is 0.5s — tick enough physics frames to fully drain
	# both the CHARGE and RECOVERY (0.6s) timers. Godot's default
	# physics tick is 1/60s, so ~80 frames covers 1.33s.
	# We need to verify the state cycles through RECOVERY and lands
	# back at WANDER.
	var saw_recovery: bool = false
	var final_state: int = -1
	for i in range(120):
		await physics_frame
		var st: int = int(e.call("get_charger_state_for_test"))
		if st == 3:
			saw_recovery = true
		final_state = st
		if st == 0 and saw_recovery:
			# Returned to WANDER after passing through RECOVERY.
			break
	if not saw_recovery:
		printerr("FAIL: charger never entered RECOVERY (state 3) after charge")
		quit(1)
		return
	if final_state != 0:
		printerr(
			"FAIL: charger final state=%d, expected 0 (WANDER) after RECOVERY drained" % final_state
		)
		quit(1)
		return
	print("[tuskbrod238] state cycle CHARGE → RECOVERY → WANDER OK")
	# ── 9. Wave config registration ───────────────────────────────────
	# Verify room_06 actually spawns tuskbrod so it appears in combat
	# (registry-only gap was the failure mode that caught bulwark/moth
	# the same way).
	var room6_text: String = FileAccess.get_file_as_string("res://scenes/rooms/room_06.tres")
	if room6_text.find("\"tuskbrod\"") < 0:
		printerr("FAIL: room_06.tres waves do not include 'tuskbrod'")
		quit(1)
		return
	print("[tuskbrod238] room_06.tres includes tuskbrod in a wave")
	# ── Done ─────────────────────────────────────────────────────────
	print("[tuskbrod238] PASS — charger archetype wired end to end")
	quit(0)


# Lightweight hero stand-in. Mirrors the FakeHero from test_iter234_moth.gd.
# CharacterBody2D + "hero" group + take_damage() method — enough for the
# charger's contact-attack path to resolve.
class FakeHero extends CharacterBody2D:
	var hp: int = 10

	func _init() -> void:
		add_to_group("hero")
		var shape := CollisionShape2D.new()
		var circle := CircleShape2D.new()
		circle.radius = 14.0
		shape.shape = circle
		add_child(shape)

	func take_damage(amount: int, _source_pos: Variant = null, _source_name: String = "") -> void:
		hp -= amount
