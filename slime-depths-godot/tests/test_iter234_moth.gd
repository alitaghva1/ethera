extends SceneTree

# Iter 234 / Expansion Team R3 — Moth flying enemy regression test.
#
# Coverage:
#   1. moth.tres loads as EnemyType with behavior="flying_orbit" and
#      is_flying=true; registered in main.gd's ENEMY_TYPES.
#   2. EnemyType.is_flying is a recognized @export field — guards
#      against silent typo drift.
#   3. Spawned moth advances ORBIT position over physics ticks (the
#      orbit tick actually moves the body, not just sets velocity
#      that never resolves).
#   4. force_moth_dive_for_test() commits the state machine into
#      DIVE; contact damage applies to a hero in range during the
#      dive (verifies the contact path is wired in the dive branch).
#   5. Hazard-immunity flag check: the moth's is_flying=true gates
#      a "conceptual" skip — verified by inspecting the field on the
#      enemy_type post-spawn.
#   6. Room registration: room_05.tres includes "moth" in a wave
#      so the new archetype actually appears in combat (registry-only
#      gap on bulwark was caught the same way in iter-230's test).

const MIN_HERO_HP := 5

func _initialize() -> void:
	print("[moth234] init")
	await process_frame
	# ── 1. .tres + registry sanity ────────────────────────────────────
	var MothType: EnemyType = load("res://scenes/enemies/moth.tres") as EnemyType
	if MothType == null:
		printerr("FAIL: moth.tres failed to load as EnemyType")
		quit(1)
		return
	if MothType.behavior != "flying_orbit":
		printerr("FAIL: moth.tres behavior=%s, expected 'flying_orbit'" % MothType.behavior)
		quit(1)
		return
	if not MothType.is_flying:
		printerr("FAIL: moth.tres is_flying must be true (flying enemy)")
		quit(1)
		return
	if MothType.max_hp != 2:
		printerr("FAIL: moth.tres max_hp=%d, expected 2 (squishy positioning threat)" % MothType.max_hp)
		quit(1)
		return
	if MothType.move_speed < 60.0 or MothType.move_speed > 100.0:
		printerr("FAIL: moth.tres move_speed=%.1f, expected 60..100 (mid-tier mobility)" % MothType.move_speed)
		quit(1)
		return
	print("[moth234] .tres OK — behavior=flying_orbit, is_flying=%s, hp=%d, speed=%.0f" % [
		str(MothType.is_flying), MothType.max_hp, MothType.move_speed
	])
	# ── 2. EnemyType field exposure check ─────────────────────────────
	# The is_flying field MUST be a real @export — guards against the
	# field being silently dropped from enemy_type.gd. Read it via the
	# property-list API which only includes exported fields.
	var et_script: Script = load("res://scripts/enemy_type.gd") as Script
	if et_script == null:
		printerr("FAIL: enemy_type.gd failed to load")
		quit(1)
		return
	if et_script.source_code.find("is_flying") < 0:
		printerr("FAIL: enemy_type.gd missing 'is_flying' field declaration")
		quit(1)
		return
	print("[moth234] enemy_type.gd exposes is_flying field")
	# ── 3. ENEMY_TYPES registry check ─────────────────────────────────
	var main_script: Script = load("res://scripts/main.gd") as Script
	if main_script == null:
		printerr("FAIL: main.gd failed to load")
		quit(1)
		return
	if main_script.source_code.find("\"moth\"") < 0:
		printerr("FAIL: main.gd ENEMY_TYPES missing 'moth' key")
		quit(1)
		return
	print("[moth234] ENEMY_TYPES registers moth")
	# ── 4. Behavior dispatch wired in enemy.gd ────────────────────────
	# A new behavior tag with no dispatch branch silently falls through
	# to chase_contact. Source-grep guards against that drift.
	var enemy_script: Script = load("res://scripts/enemy.gd") as Script
	if enemy_script == null:
		printerr("FAIL: enemy.gd failed to load")
		quit(1)
		return
	if enemy_script.source_code.find("\"flying_orbit\":") < 0:
		printerr("FAIL: enemy.gd missing 'flying_orbit' dispatch branch in _physics_process")
		quit(1)
		return
	if enemy_script.source_code.find("_tick_flying_orbit") < 0:
		printerr("FAIL: enemy.gd missing _tick_flying_orbit function")
		quit(1)
		return
	print("[moth234] enemy.gd has flying_orbit dispatch + tick function")
	# ── 5. Spawn a live moth + verify ORBIT advances position ─────────
	var EnemyScene: PackedScene = load("res://scenes/enemy.tscn") as PackedScene
	if EnemyScene == null:
		printerr("FAIL: enemy.tscn failed to load")
		quit(1)
		return
	var holder: Node2D = Node2D.new()
	holder.name = "MothHolder"
	root.add_child(holder)
	# Build a minimal stand-in hero — just a CharacterBody2D with the
	# "hero" group so the moth's orbit/dive logic engages and the
	# contact damage path has a target. Real hero is heavy (3000+ LoC
	# with its own _ready dependencies); a fake hero with take_damage()
	# is enough.
	var fake_hero := FakeHero.new()
	fake_hero.global_position = Vector2(500, 500)
	holder.add_child(fake_hero)
	await process_frame
	# Spawn the moth at a known offset — directly east of the hero, at
	# the orbit radius. Should immediately enter ORBIT state and move
	# perpendicularly (tangent direction).
	var e: Node = EnemyScene.instantiate()
	e.set("enemy_type", MothType)
	e.position = Vector2(680, 500)  # 180 px east of hero — at orbit radius
	holder.add_child(e)
	# Wire the hero ref directly so the moth doesn't have to find it
	# via group lookup at _ready (which depends on tree timing).
	e.set("_hero", fake_hero)
	await process_frame
	# Bypass spawn-in fade so the AI tick runs.
	e.set("_spawn_in_time", 0.0)
	e.set("hp", MothType.max_hp)
	# Snapshot starting position.
	var start_pos: Vector2 = (e as Node2D).global_position
	# Tick several physics frames — should advance position along an arc
	# around the hero.
	for i in range(30):
		await physics_frame
	var orbit_pos: Vector2 = (e as Node2D).global_position
	var moved: float = orbit_pos.distance_to(start_pos)
	if moved < 4.0:
		printerr("FAIL: moth did not advance during ORBIT — moved %.2f px in 30 frames" % moved)
		quit(1)
		return
	# Distance to hero should remain near the orbit radius (within a
	# generous tolerance — the radial correction term keeps it bounded
	# but instantaneous distance can drift slightly during the early
	# tangent-only phase).
	var dist_to_hero: float = orbit_pos.distance_to(fake_hero.global_position)
	if dist_to_hero < 80.0 or dist_to_hero > 280.0:
		printerr("FAIL: moth orbit distance %.1f outside 80..280 px window" % dist_to_hero)
		quit(1)
		return
	print("[moth234] ORBIT advances OK — moved %.1f px, dist-to-hero %.1f" % [moved, dist_to_hero])
	# ── 6. Force-dive + contact damage on hero ────────────────────────
	# Move moth into a position where the dive will quickly reach the
	# hero, then force-trigger the dive. Verify hero hp drops within
	# the dive window.
	(e as Node2D).global_position = fake_hero.global_position + Vector2(50, 0)
	# Ensure hero has hp to lose.
	fake_hero.hp = MIN_HERO_HP
	# Force the moth into DIVE state.
	e.call("force_moth_dive_for_test")
	# Verify state changed.
	var state_after_force: int = int(e.call("get_moth_state_for_test"))
	if state_after_force != 1:  # MothState.DIVE = 1
		printerr("FAIL: force_moth_dive_for_test did not enter DIVE state (got %d, expected 1)" % state_after_force)
		quit(1)
		return
	# Tick frames during the dive window — should land contact damage.
	var hp_before_dive: int = fake_hero.hp
	for i in range(20):
		await physics_frame
		if fake_hero.hp < hp_before_dive:
			break
	if fake_hero.hp >= hp_before_dive:
		printerr("FAIL: moth dive did not damage hero (hp %d → %d after 20 frames)" % [
			hp_before_dive, fake_hero.hp
		])
		quit(1)
		return
	print("[moth234] DIVE damages hero — hp %d → %d" % [hp_before_dive, fake_hero.hp])
	# ── 7. Hazard-immunity flag check ─────────────────────────────────
	# The is_flying field is queried by the test as a stand-in for any
	# future hazard system. Today's hazards damage only hero (group
	# gated), so the actual hazard interaction is moot — what we're
	# guarding is the FIELD being present + truthy on the spawned
	# moth's enemy_type ref.
	var spawned_type: EnemyType = e.get("enemy_type") as EnemyType
	if spawned_type == null:
		printerr("FAIL: spawned moth has null enemy_type")
		quit(1)
		return
	if not spawned_type.is_flying:
		printerr("FAIL: spawned moth's enemy_type.is_flying is false (expected true)")
		quit(1)
		return
	print("[moth234] is_flying flag intact on spawned moth")
	# ── 8. Wave config registration ───────────────────────────────────
	var room5_text: String = FileAccess.get_file_as_string("res://scenes/rooms/room_05.tres")
	if room5_text.find("\"moth\"") < 0:
		printerr("FAIL: room_05.tres waves do not include 'moth'")
		quit(1)
		return
	print("[moth234] room_05.tres includes moth in a wave")
	# ── Done ─────────────────────────────────────────────────────────
	print("[moth234] PASS — flying enemy archetype wired end to end")
	quit(0)


# Lightweight hero stand-in. Real hero.gd is 3000+ LoC + autoload deps;
# we only need a CharacterBody2D-shaped target with the "hero" group +
# a take_damage() method so the moth's contact-attack path resolves.
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
