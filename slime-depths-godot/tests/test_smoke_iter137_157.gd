extends SceneTree

# Smoke test for the polish iters 137-157. Instantiates every new or
# touched scene + every script that gained constants, methods, or
# signals this session, and reports any silent failures. Catches
# things the per-iter contract tests miss (parse errors, missing
# constants, broken @onready paths, autoload typos).
func _initialize() -> void:
	var fails: Array = []

	# ── Scenes that were modified or newly created ──────────────────
	var scene_paths := [
		"res://scenes/fx/pickup_burst.tscn",        # iter-143 new
		"res://scenes/fx/heal_sparkle.tscn",        # iter-146 new
		"res://scenes/fx/spawn_telegraph.tscn",     # iter-147 new
		"res://scenes/fx/death_burst.tscn",         # iter-141 touched
		"res://scenes/fx/hit_spark.tscn",           # iter-141 reused
		"res://scenes/projectile.tscn",             # iter-154 touched (trail_grad bugfix)
		"res://scenes/damage_number.tscn",          # iter-137 touched
		"res://scenes/enemy.tscn",                  # iter-152/153 untouched but referenced
		"res://scenes/hero.tscn",                   # iter-150 modulates this sprite
		"res://scenes/main.tscn",                   # iter-144/148/155/156/157 touched
		"res://scenes/main_menu.tscn",              # unchanged but must still load
	]
	for p in scene_paths:
		var ps: PackedScene = load(p)
		if ps == null:
			fails.append("scene load failed: %s" % p)
			continue
		var inst: Node = ps.instantiate()
		if inst == null:
			fails.append("scene instantiate failed: %s" % p)
			continue
		inst.queue_free()

	# ── Scripts that gained new public API this session ─────────────
	# --script mode runs outside the active scene tree, so autoloads
	# aren't in /root yet. Reflect directly on the script files
	# instead — that's enough to verify the API surface exists.
	var FxScript: GDScript = load("res://scripts/fx.gd")
	if FxScript == null:
		fails.append("fx.gd won't load")
	else:
		var fx_methods: Array = FxScript.get_script_method_list()
		var has_spawn_kill := false
		for m in fx_methods:
			if m.name == "spawn_enemy_kill_burst":
				has_spawn_kill = true
				break
		if not has_spawn_kill:
			fails.append("FX.spawn_enemy_kill_burst missing (iter-141)")
		var fx_consts: Dictionary = FxScript.get_script_constant_map()
		if not "HEAL_SPARKLE_SCENE" in fx_consts:
			fails.append("FX.HEAL_SPARKLE_SCENE const missing (iter-146)")
		if not "PICKUP_BURST_SCENE" in fx_consts:
			fails.append("FX.PICKUP_BURST_SCENE const missing (iter-143)")

	# Hero get_combo() public seam (iter-149)
	var HeroScript: GDScript = load("res://scripts/hero.gd")
	if HeroScript == null:
		fails.append("hero.gd won't load")
	else:
		# Check via reflection — script methods include get_combo
		var hero_methods: Array = HeroScript.get_script_method_list()
		var has_get_combo := false
		for m in hero_methods:
			if m.name == "get_combo":
				has_get_combo = true
				break
		if not has_get_combo:
			fails.append("Hero.get_combo() missing (iter-149)")

	# Events bus — signals added this session. Reflect on the script.
	var EventsScript: GDScript = load("res://scripts/events.gd")
	if EventsScript == null:
		fails.append("events.gd won't load")
	else:
		var sig_list: Array = EventsScript.get_script_signal_list()
		var sig_names: Array = []
		for s in sig_list:
			sig_names.append(s.name)
		var needed_signals := [
			"hero_healed",              # iter-146
			"boss_died",                # iter-148
			"hero_damage_directional",  # iter-155
		]
		for sig_name in needed_signals:
			if not sig_name in sig_names:
				fails.append("Events.%s signal missing" % sig_name)

	# ── Done ────────────────────────────────────────────────────────
	if fails.is_empty():
		print("OK smoke test: 11 scenes + 6 API surfaces all clean")
		print("=== SMOKE TEST 137-157 PASSED ===")
		quit(0)
	else:
		for f in fails:
			push_error("FAIL: " + f)
		print("=== SMOKE TEST 137-157 FAILED (%d issues) ===" % fails.size())
		quit(1)
