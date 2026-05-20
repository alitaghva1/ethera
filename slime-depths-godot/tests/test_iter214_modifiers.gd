extends SceneTree

# Iter 214 / Phase 3 — Spell modifier registry sanity test. Verifies
# the 3 new modifier relics exist with proper mod keys + theme tags.
# Per-modifier runtime behavior (GRAVITY NEEDLE near-miss slow,
# SPLIT CINDER ember spawn, STATIC RUNES chain bump) requires firing
# actual projectiles in a live scene — not feasible in a pure script
# test without spinning up the full hero + main flow. This test
# guarantees the REGISTRY-side wiring is correct; runtime side is
# covered by manual playtest.

func _initialize() -> void:
	print("[modifiers] init")
	await process_frame
	var gs: Node = root.get_node_or_null("/root/GameState")
	if gs == null:
		printerr("FAIL: GameState autoload missing")
		quit(1)
		return
	var checks: Array = [
		{
			"id": "split_cinder",
			"name": "SPLIT CINDER",
			"mod_key": "split_cinder_active",
			"theme": "flame",
		},
		{
			"id": "gravity_needle",
			"name": "GRAVITY NEEDLE",
			"mod_key": "gravity_needle_active",
			"theme": "shadow",
		},
		{
			"id": "static_runes",
			"name": "STATIC RUNES",
			"mod_key": "static_runes_active",
			"theme": "storm",
		},
	]
	var fail_count: int = 0
	for spec in checks:
		var info: Dictionary = gs.relic_info(spec["id"])
		if info.is_empty():
			printerr("FAIL: %s not in RELIC_REGISTRY" % spec["id"])
			fail_count += 1
			continue
		if info.get("name", "") != spec["name"]:
			printerr("FAIL: %s name mismatch — got '%s' expected '%s'" % [
				spec["id"], info.get("name", ""), spec["name"]
			])
			fail_count += 1
			continue
		var mods: Dictionary = info.get("mods", {})
		if not mods.has(spec["mod_key"]):
			printerr("FAIL: %s mods missing key '%s'" % [spec["id"], spec["mod_key"]])
			fail_count += 1
			continue
		var themes: Array = info.get("themes", [])
		if not (spec["theme"] in themes):
			printerr("FAIL: %s themes missing '%s' (got %s)" % [spec["id"], spec["theme"], str(themes)])
			fail_count += 1
			continue
		print("[modifiers] OK: %s (theme=%s, mod=%s)" % [spec["id"], spec["theme"], spec["mod_key"]])
	if fail_count == 0:
		print("[modifiers] PASS — all 3 modifier relics wired correctly")
		quit(0)
	else:
		printerr("[modifiers] %d failures" % fail_count)
		quit(1)
