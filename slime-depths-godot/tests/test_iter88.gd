extends SceneTree

# Iter 88 — Frostwindz hand-painted slash + portal sprite-sheet packs
# imported as drop-in replacements for the iter-87 PixelLab versions.
#
# The user dropped two new asset packs into the project root:
#   "Pixel Art Animations - Slashes" — 9-frame curved slash, 5 colors,
#                                     painterly hand-drawn, 128×128 per frame
#   "Pixel Art Animated Portal"      — 7-frame summoning portal, 64×64
#
# Both major quality improvements over iter-87:
#   slash_arc — 4 PixelLab-generated frames → 9 painted frames
#   spawn_portal — NEW (iter-86's procedural SpawnBurst replaced)
func _initialize() -> void:
	var ok := true

	# ═══ Slash sheet upgrade ═══
	var slash_meta_path := "res://assets/fx/slash_arc_meta.json"
	if not FileAccess.file_exists(slash_meta_path):
		push_error("FAIL: slash_arc_meta.json missing")
		ok = false
	else:
		var f := FileAccess.open(slash_meta_path, FileAccess.READ)
		var meta = JSON.parse_string(f.get_as_text())
		f.close()
		if not (meta is Dictionary):
			push_error("FAIL: slash_arc_meta.json invalid")
			ok = false
		else:
			# iter-88 has 9 frames @ 128px from Frostwindz pack.
			# (iter-87 was 4 frames @ 64px from PixelLab.)
			if int(meta.get("frames", 0)) != 9:
				push_error("FAIL: slash_arc frames should be 9 (Frostwindz pack), got %d" % int(meta.get("frames", 0)))
				ok = false
			elif int(meta.get("cell_size", 0)) != 128:
				push_error("FAIL: slash_arc cell_size should be 128, got %d" % int(meta.get("cell_size", 0)))
				ok = false
			else:
				print("OK slash_arc: 9 frames @ 128px from Frostwindz pack")

	# ═══ Spawn portal NEW ═══
	if not ResourceLoader.exists("res://assets/fx/spawn_portal_sheet.png"):
		push_error("FAIL: spawn_portal_sheet.png missing")
		ok = false
	else:
		print("OK spawn_portal_sheet.png exists")

	var portal_meta_path := "res://assets/fx/spawn_portal_meta.json"
	if not FileAccess.file_exists(portal_meta_path):
		push_error("FAIL: spawn_portal_meta.json missing")
		ok = false
	else:
		var f := FileAccess.open(portal_meta_path, FileAccess.READ)
		var meta = JSON.parse_string(f.get_as_text())
		f.close()
		if int(meta.get("frames", 0)) != 7:
			push_error("FAIL: spawn_portal frames should be 7, got %d" % int(meta.get("frames", 0)))
			ok = false
		elif int(meta.get("cell_size", 0)) != 64:
			push_error("FAIL: spawn_portal cell_size should be 64, got %d" % int(meta.get("cell_size", 0)))
			ok = false
		else:
			print("OK spawn_portal: 7 frames @ 64px from Frostwindz pack")

	# ═══ Runtime smoke for both sheets ═══
	var fxs := load("res://scripts/fx_sprite.gd")
	if fxs != null and fxs.has_method("spawn"):
		var host := Node2D.new()
		root.add_child(host)
		for sheet_name in ["slash_arc", "spawn_portal"]:
			var fx = fxs.spawn(host, Vector2(640, 384), sheet_name, {})
			if fx == null:
				push_error("FAIL: FxSprite.spawn returned null for %s" % sheet_name)
				ok = false
			elif fx.sprite_frames == null:
				push_error("FAIL: %s SpriteFrames not built" % sheet_name)
				ok = false
			elif not fx.sprite_frames.has_animation("play"):
				push_error("FAIL: %s missing 'play' animation" % sheet_name)
				ok = false
			else:
				var fc: int = fx.sprite_frames.get_frame_count("play")
				print("OK %s instantiates with %d frames in 'play' animation" % [sheet_name, fc])

	# ═══ enemy.gd uses portal sheet ═══
	var enemy_src := FileAccess.get_file_as_string("res://scripts/enemy.gd")
	if not enemy_src.contains("\"spawn_portal\""):
		push_error("FAIL: enemy.gd doesn't spawn the spawn_portal FxSprite")
		ok = false
	else:
		print("OK enemy.gd spawns spawn_portal companion at enemy materialization")

	# ═══ iter-86 SpawnBurst REMOVED ═══
	for path in [
		"res://scripts/spawn_burst.gd",
		"res://scenes/fx/spawn_burst.tscn",
	]:
		if ResourceLoader.exists(path):
			push_error("FAIL: %s should be deleted (iter-88 supersedes)" % path)
			ok = false
	if ok:
		print("OK iter-86 SpawnBurst files deleted (superseded by Frostwindz portal)")

	# ═══ screen_flash scale tuning updated for 128-px cells ═══
	# iter-88 first bumped the divisor from /9.3 (64-px cells) to /18.0 (128-px).
	# iter-90 retuned to /28.0 to bring the slash visual within ATTACK_RANGE
	# (the slash was reading as a giant disconnected overlay at /18.0).
	# We still assert the 64-px-cell divisor is gone — that's the real iter-88
	# guarantee. Specific 128-px divisor is verified in test_iter90.gd.
	var sf_src := FileAccess.get_file_as_string("res://scripts/screen_flash.gd")
	if sf_src.contains("/ 9.3"):
		push_error("FAIL: screen_flash.gd still has 64-px-cell scale_mul divisor (/ 9.3)")
		ok = false
	else:
		print("OK screen_flash.gd scale_mul no longer uses 64-px-cell divisor")

	if ok:
		print("=== ITER 88 INTEGRATION PASSED ===")
	else:
		print("=== ITER 88 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
