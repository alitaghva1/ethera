extends SceneTree

# Iter 147 — Enemy spawn telegraph (ground ring).
#
# Pre-iter-147 enemies materialized via SPAWN_IN_START_COLOR → baseline
# modulate lerp over 0.35s. That fades the SPRITE in from red-
# translucent — tells the player WHEN an enemy is spawning if they're
# looking at it, but doesn't broadcast WHERE in peripheral vision.
# Multi-enemy waves where new mobs land behind/beside the hero could
# sandwich the player before they realized fresh spawns happened.
#
# Genre cue: Hades' wave-start lockdown shows tagged spawn points
# briefly before the enemies appear. Isaac's room-spawn fade-in is
# obvious because rooms are tiny; in our larger rooms the player can't
# always see every spawn position.
#
# Iter-147 adds a pulsing red ground ring (elliptical Polygon2D, 18 px
# radius × 0.55 Y squash for top-down perspective) parented under each
# spawning enemy at +12 px Y (at the enemy's feet). The ring's alpha
# follows a fast SIN pulse (6 Hz) clamped to [0.30, 0.70], tail-faded
# linearly over SPAWN_IN_DURATION (0.35s) so it eases out instead of
# vanishing on a high pulse frame. Self-destructs at lifetime end —
# no cleanup needed on the enemy side.
#
# Bosses are SKIPPED — they have their own iter-22 / boss_intro
# cinematic which acts as the spawn telegraph. Stacking a ground ring
# under a 2.3-second cinematic would be visual noise.
#
# Color choice: red-orange palette (1.0, 0.32, 0.32) matches the
# iter-138 crit splash ring family. Visual grammar:
#   • Red ring on ground = "combat-relevant spatial event"
#   • Gold ring (pickup_burst) = "good thing for player"
#   • Green particles (heal_sparkle) = "you gained HP"
func _initialize() -> void:
	var ok := true

	var enemy_gd := FileAccess.get_file_as_string("res://scripts/enemy.gd")
	var spawn_gd := FileAccess.get_file_as_string("res://scripts/spawn_telegraph.gd")
	var spawn_tscn := FileAccess.get_file_as_string("res://scenes/fx/spawn_telegraph.tscn")

	# ═══ Spawn telegraph scene loads ═══
	var scene: PackedScene = load("res://scenes/fx/spawn_telegraph.tscn")
	if scene == null:
		push_error("FAIL: spawn_telegraph.tscn failed to load")
		ok = false
	else:
		var inst: Node = scene.instantiate()
		if inst == null:
			push_error("FAIL: spawn_telegraph.tscn doesn't instantiate")
			ok = false
		else:
			if not (inst is Node2D):
				push_error("FAIL: spawn_telegraph root should be Node2D")
				ok = false
			if inst.get_node_or_null("Ring") == null:
				push_error("FAIL: spawn_telegraph missing Ring Polygon2D child")
				ok = false
			inst.queue_free()

	# ═══ enemy.gd preloads + spawns the telegraph ═══
	if "SPAWN_TELEGRAPH_SCENE: PackedScene = preload(\"res://scenes/fx/spawn_telegraph.tscn\")" not in enemy_gd:
		push_error("FAIL: enemy.gd should preload SPAWN_TELEGRAPH_SCENE")
		ok = false
	if "SPAWN_TELEGRAPH_SCENE.instantiate()" not in enemy_gd:
		push_error("FAIL: enemy._ready should instantiate SPAWN_TELEGRAPH_SCENE")
		ok = false

	# ═══ Boss gate: telegraph only when NOT a boss ═══
	if "not enemy_type.is_boss" not in enemy_gd:
		push_error("FAIL: enemy.gd should skip the telegraph for is_boss enemies (they have boss_intro cinematic)")
		ok = false

	# ═══ spawn_telegraph.gd has expected constants + pulse logic ═══
	if "TELEGRAPH_DURATION: float = 0.35" not in spawn_gd:
		push_error("FAIL: TELEGRAPH_DURATION should match enemy SPAWN_IN_DURATION (0.35s)")
		ok = false
	if "PULSE_FREQ: float = 6.0" not in spawn_gd:
		push_error("FAIL: PULSE_FREQ should be 6.0 Hz (fast enough to read 'WARNING')")
		ok = false
	if "PULSE_MIN_ALPHA: float = 0.30" not in spawn_gd:
		push_error("FAIL: PULSE_MIN_ALPHA should be 0.30 (visible minimum)")
		ok = false
	if "PULSE_MAX_ALPHA: float = 0.70" not in spawn_gd:
		push_error("FAIL: PULSE_MAX_ALPHA should be 0.70 (bright max without dominating)")
		ok = false
	if "queue_free()" not in spawn_gd:
		push_error("FAIL: spawn_telegraph must self-destruct at lifetime end")
		ok = false
	# Tail-fade logic present
	if "1.0 - (_elapsed / TELEGRAPH_DURATION)" not in spawn_gd:
		push_error("FAIL: spawn_telegraph should tail-fade linearly over TELEGRAPH_DURATION")
		ok = false

	# ═══ Scene config — elliptical ground ring at +12 px Y ═══
	if "position = Vector2(0, 12)" not in spawn_tscn:
		push_error("FAIL: Ring should be positioned at Vector2(0, 12) — at enemy feet")
		ok = false
	# Color baseline matches the iter-138 red-orange family
	if "color = Color(1.0, 0.32, 0.32, 1.0)" not in spawn_tscn:
		push_error("FAIL: Ring color should be Color(1.0, 0.32, 0.32, 1.0) — combat-red palette")
		ok = false

	if ok:
		print("OK spawn telegraph: pulsing red ground ring under non-boss enemies during spawn-in")
		print("=== ITER 147 INTEGRATION PASSED ===")
	else:
		print("=== ITER 147 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
