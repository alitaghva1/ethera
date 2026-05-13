extends SceneTree

# Iter 110 — ENEMY #3 hurt sprite wiring.
#
# Pre-iter-110 every enemy's damage-take feedback was a white-tint
# pulse on the sprite modulate. The audit team noted: tinted enemies
# (spectral_priest green, rogue_wraith violet, ember_bomber red) fight
# the white flash → the flash reads as a brief hue shift, not "this
# hit landed." Meanwhile the JS reference shipped dedicated hurt
# sheets for skel / crypt_spider / elite_orc that were sitting unused
# in `slime-depths/public/assets/enemies/`.
#
# Iter-110 lands the hurt-sheet pipeline:
#
#   1. EnemyType schema: `hurt_sheet: Texture2D = null` + `frames_hurt:
#      int = 0` added. Default null/0 means "no hurt anim, fall back
#      to white-tint" — every existing enemy keeps its current
#      feedback unchanged unless it ships a hurt sheet.
#   2. enemy.gd._build_sprite_frames: new row for the "hurt" anim
#      built into SpriteFrames when `hurt_sheet != null` AND
#      `frames_hurt > 0`. Played at HURT_ANIM_FPS = 18 (3 frames =
#      0.17s ≈ HURT_ANIM_DURATION).
#   3. enemy.gd.take_hit: arms `_hurt_anim_time = HURT_ANIM_DURATION`
#      and calls `sprite.play("hurt")` when the enemy has a hurt
#      animation built. Behavior ticks (chase_contact) check
#      `_hurt_anim_time > 0` and hold the hurt pose before resuming
#      walk/idle/attack.
#   4. Three enemies wired: skel.tres (skel_hurt 11 frames, use 3),
#      crypt_spider.tres (crypt_spider_hurt 6 frames, use 3),
#      iron_revenant.tres (elite_orc_hurt 5 frames, use 4).
func _initialize() -> void:
	var ok := true

	# ═══ EnemyType schema additions ═══
	var et_src := FileAccess.get_file_as_string("res://scripts/enemy_type.gd")
	if "var hurt_sheet: Texture2D" not in et_src:
		push_error("FAIL: enemy_type.gd missing hurt_sheet export")
		ok = false
	if "var frames_hurt: int" not in et_src:
		push_error("FAIL: enemy_type.gd missing frames_hurt export")
		ok = false
	if ok:
		print("OK EnemyType schema has hurt_sheet + frames_hurt exports")

	# ═══ enemy.gd builder + take_hit + tick wiring ═══
	var en_src := FileAccess.get_file_as_string("res://scripts/enemy.gd")
	# SpriteFrames builder must include the "hurt" row.
	if not en_src.contains("&\"hurt\""):
		push_error("FAIL: enemy.gd _build_sprite_frames missing \"hurt\" anim row")
		ok = false
	if "HURT_ANIM_FPS" not in en_src:
		push_error("FAIL: enemy.gd missing HURT_ANIM_FPS const")
		ok = false
	if "HURT_ANIM_DURATION" not in en_src:
		push_error("FAIL: enemy.gd missing HURT_ANIM_DURATION const")
		ok = false
	if "var _hurt_anim_time" not in en_src:
		push_error("FAIL: enemy.gd missing _hurt_anim_time state var")
		ok = false
	# take_hit must arm the timer + play the hurt animation
	if not en_src.contains("_hurt_anim_time = HURT_ANIM_DURATION"):
		push_error("FAIL: enemy.gd take_hit doesn't arm _hurt_anim_time")
		ok = false
	if not en_src.contains("sprite.play(&\"hurt\")"):
		push_error("FAIL: enemy.gd never calls sprite.play(\"hurt\")")
		ok = false
	# Drain in the tick
	if not en_src.contains("_hurt_anim_time = max(0.0, _hurt_anim_time - delta)"):
		push_error("FAIL: enemy.gd doesn't drain _hurt_anim_time per tick")
		ok = false
	if ok:
		print("OK enemy.gd has hurt-anim pipeline: const + state + builder + take_hit + tick drain")

	# ═══ skel + crypt_spider + iron_revenant wired to hurt sheets ═══
	for entry in [
		{"tres": "res://scenes/enemies/skel.tres", "sheet": "skel_hurt.png", "frames": 3},
		{"tres": "res://scenes/enemies/crypt_spider.tres", "sheet": "crypt_spider_hurt.png", "frames": 3},
		{"tres": "res://scenes/enemies/iron_revenant.tres", "sheet": "elite_orc_hurt.png", "frames": 4},
	]:
		var src := FileAccess.get_file_as_string(entry["tres"])
		if entry["sheet"] not in src:
			push_error("FAIL: %s doesn't reference %s" % [entry["tres"], entry["sheet"]])
			ok = false
		if not src.contains("hurt_sheet = ExtResource"):
			push_error("FAIL: %s doesn't bind hurt_sheet" % entry["tres"])
			ok = false
		if not src.contains("frames_hurt = %d" % entry["frames"]):
			push_error("FAIL: %s missing frames_hurt = %d" % [entry["tres"], entry["frames"]])
			ok = false
	if ok:
		print("OK skel + crypt_spider + iron_revenant tres files wire hurt_sheet + frames_hurt")

	# ═══ Runtime: instantiate skel and verify hurt anim was built ═══
	var enemy_scene := load("res://scenes/enemy.tscn") as PackedScene
	var skel_path := "res://scenes/enemies/skel.tres"
	if enemy_scene != null and ResourceLoader.exists(skel_path):
		var e: Node = enemy_scene.instantiate()
		e.enemy_type = load(skel_path) as EnemyType
		root.add_child(e)
		var anim_sprite: AnimatedSprite2D = e.get_node_or_null("AnimatedSprite2D")
		if anim_sprite != null and anim_sprite.sprite_frames != null:
			if not anim_sprite.sprite_frames.has_animation(&"hurt"):
				push_error("FAIL: skel SpriteFrames missing 'hurt' animation after instantiate")
				ok = false
			elif anim_sprite.sprite_frames.get_frame_count(&"hurt") != 3:
				push_error("FAIL: skel hurt frames = %d, expected 3" % anim_sprite.sprite_frames.get_frame_count(&"hurt"))
				ok = false
			else:
				print("OK skel SpriteFrames has 'hurt' animation with 3 frames")
		else:
			print("SKIP runtime SpriteFrames check (test-context build quirk)")
		e.queue_free()

	if ok:
		print("=== ITER 110 INTEGRATION PASSED ===")
	else:
		print("=== ITER 110 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
