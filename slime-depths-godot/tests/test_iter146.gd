extends SceneTree

# Iter 146 — Hero heal visual feedback in world space.
#
# Pre-iter-146 heal events fired hp_changed which iter-113 caught for a
# heart-row green pulse. That's HUD-side feedback. The HERO SPRITE
# itself showed no in-world tell — a player focused on combat could
# miss the heal entirely until they looked at the HUD.
#
# Genre baseline: both Hades and Isaac confirm heals in-world (Hades
# does a brief green aura under Zagreus on health pickup; Isaac shows
# a brief upward green particle drift). The shared trait: the heal is
# legible WHERE the hero is, not just in the corner.
#
# Iter-146 architecture:
#   1. New `Events.hero_healed(world_pos: Vector2, amount: int)` signal.
#   2. hero.heal() emits it after `hp_changed.emit(hp)` so handlers see
#      the new hp value. Passes the ACTUAL gain (post-cap clamp) so a
#      heal-for-5 that only yielded 1 HP doesn't lie about magnitude.
#   3. New `scenes/fx/heal_sparkle.tscn` — green upward-drift particles
#      (10 particles, gravity (0, -120), narrow upward cone 65°). Reuses
#      hit_spark.gd for the queue_free lifecycle. Distinct from hit
#      spark (gold radial), pickup_burst (gold ring + chunkier sparks),
#      and death_burst (red falling embers). The grammar:
#        • Color: green vs gold vs red
#        • Vertical motion: UP vs flat vs DOWN
#      so any of the four event types reads correctly without text.
#   4. fx.gd subscribes to hero_healed → spawns HEAL_SPARKLE_SCENE.
func _initialize() -> void:
	var ok := true

	var events_gd  := FileAccess.get_file_as_string("res://scripts/events.gd")
	var hero_gd    := FileAccess.get_file_as_string("res://scripts/hero.gd")
	var fx_gd      := FileAccess.get_file_as_string("res://scripts/fx.gd")
	var heal_tscn  := FileAccess.get_file_as_string("res://scenes/fx/heal_sparkle.tscn")

	# ═══ Signal added to events bus ═══
	if "signal hero_healed(world_pos: Vector2, amount: int)" not in events_gd:
		push_error("FAIL: missing signal hero_healed(world_pos: Vector2, amount: int) in events.gd")
		ok = false

	# ═══ Hero emits the signal after hp_changed ═══
	if "Events.hero_healed.emit(global_position, actual_gain)" not in hero_gd:
		push_error("FAIL: hero.heal should emit Events.hero_healed(pos, actual_gain) after hp_changed")
		ok = false
	# Actual-gain calc preserves cap-clamped value
	if "var actual_gain: int = hp - prev" not in hero_gd:
		push_error("FAIL: actual_gain should be derived from hp - prev (post-cap clamp)")
		ok = false

	# ═══ Heal sparkle scene exists + has correct shape ═══
	var scene: PackedScene = load("res://scenes/fx/heal_sparkle.tscn")
	if scene == null:
		push_error("FAIL: heal_sparkle.tscn failed to load")
		ok = false
	else:
		var inst: Node = scene.instantiate()
		if inst == null:
			push_error("FAIL: heal_sparkle.tscn doesn't instantiate")
			ok = false
		else:
			if not (inst is Node2D):
				push_error("FAIL: heal_sparkle root should be Node2D")
				ok = false
			if inst.get_node_or_null("CPUParticles2D") == null:
				push_error("FAIL: heal_sparkle missing CPUParticles2D child")
				ok = false
			inst.queue_free()

	# ═══ Scene config — green color + upward gravity ═══
	if "gravity = Vector2(0, -120)" not in heal_tscn:
		push_error("FAIL: heal_sparkle should use gravity (0, -120) for upward drift")
		ok = false
	if "direction = Vector2(0, -1)" not in heal_tscn:
		push_error("FAIL: heal_sparkle direction should be (0, -1) — narrow upward cone")
		ok = false
	if "spread = 65.0" not in heal_tscn:
		push_error("FAIL: heal_sparkle spread should be 65° — narrow cone, not radial")
		ok = false
	# Green family in the ramp — bright spring-green start
	if "0.78, 1.0, 0.62, 1.0" not in heal_tscn:
		push_error("FAIL: heal_sparkle color ramp should start with bright spring-green (0.78, 1.0, 0.62, 1.0)")
		ok = false

	# ═══ fx.gd preloads + subscribes + handles ═══
	if "HEAL_SPARKLE_SCENE: PackedScene = preload(\"res://scenes/fx/heal_sparkle.tscn\")" not in fx_gd:
		push_error("FAIL: fx.gd should preload HEAL_SPARKLE_SCENE")
		ok = false
	if "Events.hero_healed.connect(_on_hero_healed)" not in fx_gd:
		push_error("FAIL: fx.gd should subscribe to hero_healed")
		ok = false
	if "func _on_hero_healed(world_pos: Vector2, _amount: int) -> void:" not in fx_gd:
		push_error("FAIL: fx.gd should define _on_hero_healed handler")
		ok = false
	if "_spawn(HEAL_SPARKLE_SCENE, world_pos)" not in fx_gd:
		push_error("FAIL: handler should spawn HEAL_SPARKLE_SCENE at world_pos")
		ok = false

	if ok:
		print("OK heal visual: green upward-drift sparkle at hero pos on every gainful heal")
		print("=== ITER 146 INTEGRATION PASSED ===")
	else:
		print("=== ITER 146 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
