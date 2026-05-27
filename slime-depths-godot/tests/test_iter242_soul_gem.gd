extends SceneTree

# iter-242 / Loop Tightening LEVER 1 — soul gem smoke test.
#
# Verifies the per-kill collectible flow:
#   1. scripts/soul_gem.gd loads as a Script and the class is reachable.
#   2. scenes/soul_gem.tscn loads as a PackedScene and instantiates to a
#      Node2D with the script attached.
#   3. main.gd::_on_enemy_died wires the soul-gem spawn (source-level check
#      — we can't instantiate main.tscn into an autoloaded harness without
#      the full bootstrap, so we read the source code and confirm the
#      spawn call + helper exist).
#   4. main.gd::_spawn_soul_gem references SOUL_GEM_SCENE + the hero/Audio
#      bind pattern (source check).
#   5. session_kills increment path stays wired (no regression — gem
#      pickup audio is decoupled from the count, GameState.register_run_kill
#      remains the canonical bump).
#
# We test gravitation behavior by instantiating the gem in isolation,
# binding a dummy hero Node2D, and stepping a few physics frames. The
# gem should move TOWARD the hero each step.

func _initialize() -> void:
	print("[iter242gem] init")
	await process_frame

	# ── A. soul_gem.gd loads + class is reachable ─────────────────────
	var gem_script: Script = load("res://scripts/soul_gem.gd") as Script
	if gem_script == null:
		printerr("FAIL: soul_gem.gd failed to load as Script")
		quit(1)
		return
	var gem_src: String = gem_script.source_code
	# Required symbols. Defensive set; if any go missing during a refactor
	# the gem's lever-1 contract breaks.
	var required_gem_symbols: Array = [
		"class_name SoulGem",
		"PRE_PULL_DELAY",
		"MAGNET_START",
		"MAGNET_MAX",
		"MAGNET_ACCEL",
		"PICKUP_RADIUS",
		"func bind",
		"func _physics_process",
		"func _on_collected",
	]
	for s in required_gem_symbols:
		if gem_src.find(s) < 0:
			printerr("FAIL: soul_gem.gd missing symbol %s" % s)
			quit(1)
			return
	print("[iter242gem] soul_gem.gd OK — all 9 required symbols present")

	# ── B. soul_gem.tscn loads + instantiates ────────────────────────
	var gem_packed: PackedScene = load("res://scenes/soul_gem.tscn") as PackedScene
	if gem_packed == null:
		printerr("FAIL: soul_gem.tscn failed to load as PackedScene")
		quit(1)
		return
	var gem: Node2D = gem_packed.instantiate() as Node2D
	if gem == null:
		printerr("FAIL: soul_gem.tscn instantiated but is not a Node2D")
		quit(1)
		return
	if not gem.has_method("bind"):
		printerr("FAIL: instantiated gem missing bind() method")
		quit(1)
		return
	print("[iter242gem] soul_gem.tscn OK — instantiates to Node2D with bind()")

	# ── C. Gravitation moves the gem toward the hero ─────────────────
	# Set up a minimal SceneTree environment: place the gem at origin,
	# the dummy hero at (300, 0), call bind, and step physics frames.
	# We add the gem under root so its _ready runs and `_physics_process`
	# ticks each frame.
	root.add_child(gem)
	gem.global_position = Vector2(0, 0)
	var dummy_hero := Node2D.new()
	root.add_child(dummy_hero)
	dummy_hero.global_position = Vector2(300, 0)
	gem.bind(dummy_hero, null)  # null audio ref — gem code defends against null
	# Step past PRE_PULL_DELAY (0.15 s) so the magnet activates.
	# We can't truly fast-forward physics time in a SceneTree script, but
	# we can manually advance the gem's _elapsed via the public surface
	# (the field is `_elapsed` — set via Object set if needed). Simpler:
	# we wait a few frames and verify the SPEED logic kicks in via the
	# gem's exported fields. To make the test deterministic, we cheat:
	# call _physics_process(delta) directly with a delta > PRE_PULL_DELAY.
	# This is a unit-test surface — production gravitation is unchanged.
	var start_pos: Vector2 = gem.global_position
	# First simulated tick — primes _elapsed past PRE_PULL_DELAY.
	if gem.has_method("_physics_process"):
		gem._physics_process(0.20)  # past PRE_PULL_DELAY, magnet engages
		# After this call gem should have moved a little toward the hero
		# (positive X). MAGNET_START * 0.20 = 16 px floor.
		var first_pos: Vector2 = gem.global_position
		if first_pos.x <= start_pos.x:
			printerr("FAIL: gem did not move toward hero after 1 magnet tick (start.x=%f, after.x=%f)" % [start_pos.x, first_pos.x])
			quit(1)
			return
		# Step a few more frames to ensure it keeps gravitating.
		for i in range(5):
			gem._physics_process(0.10)
		var later_pos: Vector2 = gem.global_position
		if later_pos.x <= first_pos.x:
			printerr("FAIL: gem stopped moving toward hero (first.x=%f, later.x=%f)" % [first_pos.x, later_pos.x])
			quit(1)
			return
		print("[iter242gem] gravitation OK — gem moved %.1f → %.1f → %.1f toward hero at (300, 0)" % [start_pos.x, first_pos.x, later_pos.x])
	else:
		printerr("FAIL: gem has no _physics_process to drive")
		quit(1)
		return
	dummy_hero.queue_free()
	gem.queue_free()

	# ── D. main.gd wires gem spawn from _on_enemy_died ───────────────
	var main_script: Script = load("res://scripts/main.gd") as Script
	if main_script == null:
		printerr("FAIL: main.gd failed to load as Script")
		quit(1)
		return
	var src: String = main_script.source_code
	# The kill handler must call the spawn helper.
	if src.find("_spawn_soul_gem(world_pos)") < 0:
		printerr("FAIL: main.gd::_on_enemy_died missing _spawn_soul_gem call")
		quit(1)
		return
	# Spawn helper must instantiate SOUL_GEM_SCENE and bind hero+Audio.
	if src.find("SOUL_GEM_SCENE = preload(\"res://scenes/soul_gem.tscn\")") < 0:
		printerr("FAIL: main.gd missing SOUL_GEM_SCENE preload")
		quit(1)
		return
	if src.find("gem.bind(hero, Audio)") < 0:
		printerr("FAIL: main.gd::_spawn_soul_gem does not bind hero+Audio")
		quit(1)
		return
	print("[iter242gem] main.gd spawn wiring OK — _on_enemy_died → _spawn_soul_gem → bind(hero, Audio)")

	# ── E. GameState.session_kills bump path still intact ────────────
	# Pre-iter-242 main.gd::_on_enemy_died called register_run_kill +
	# register_kill. Gem layer is ADDITIVE — these must still fire.
	if src.find("GameState.register_run_kill()") < 0:
		printerr("FAIL: main.gd::_on_enemy_died lost register_run_kill call")
		quit(1)
		return
	if src.find("RunState.register_kill()") < 0:
		printerr("FAIL: main.gd::_on_enemy_died lost RunState.register_kill call")
		quit(1)
		return
	# Manual bump test — verify session_kills still increments through the
	# GameState API (gem doesn't replace it). Pull the autoload via
	# get_node so the typed reference doesn't hit GDScript's compile-time
	# identifier resolution on the SceneTree harness (autoloads ARE in
	# /root once the first frame ticks, but identifier-bound access can
	# be flakey under --script harnesses on Godot 4.6).
	var gs: Node = root.get_node_or_null("/root/GameState")
	if gs == null:
		printerr("FAIL: GameState autoload missing from /root")
		quit(1)
		return
	var pre_kills: int = int(gs.get("session_kills"))
	gs.call("register_kill")
	var post_kills: int = int(gs.get("session_kills"))
	if post_kills != pre_kills + 1:
		printerr("FAIL: gs.register_kill did not increment session_kills (was %d, now %d)" % [pre_kills, post_kills])
		quit(1)
		return
	print("[iter242gem] session_kills bump OK — %d → %d through GameState.register_kill" % [pre_kills, post_kills])

	# ── F. Kill counter chip is visible (LEVER 1 second half) ────────
	# The HUD chip is the visible target the gem flies toward (visually).
	# Pre-iter-242 KillsLabel was hidden (iter-124). Now it's flipped on.
	var main_packed: PackedScene = load("res://scenes/main.tscn") as PackedScene
	if main_packed == null:
		printerr("FAIL: main.tscn failed to load")
		quit(1)
		return
	# Parse the .tscn text to confirm the visible flag was removed (or set
	# to true). We can't instantiate without the full autoload stack so we
	# read the .tscn source via FileAccess.
	var f := FileAccess.open("res://scenes/main.tscn", FileAccess.READ)
	if f == null:
		printerr("FAIL: could not open main.tscn for inspection")
		quit(1)
		return
	var tscn: String = f.get_as_text()
	f.close()
	# The KillsLabel block must NOT contain "visible = false" anymore.
	var label_idx: int = tscn.find("[node name=\"KillsLabel\"")
	if label_idx < 0:
		printerr("FAIL: KillsLabel node missing from main.tscn")
		quit(1)
		return
	# Pull the slice of the file from label_idx to the next "[node " marker.
	var next_node_idx: int = tscn.find("[node ", label_idx + 1)
	var label_block: String = (
		tscn.substr(label_idx, next_node_idx - label_idx) if next_node_idx >= 0
		else tscn.substr(label_idx)
	)
	if label_block.find("visible = false") >= 0:
		printerr("FAIL: KillsLabel still has visible = false — iter-242 should flip it on")
		quit(1)
		return
	# Skull glyph in text — confirms iter-242 format change.
	if label_block.find("☠") < 0:
		printerr("FAIL: KillsLabel text does not contain skull glyph (iter-242 format)")
		quit(1)
		return
	print("[iter242gem] kill counter chip OK — visible + skull glyph format applied")

	print("[iter242gem] PASS")
	quit(0)
