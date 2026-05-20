extends SceneTree

# Iter 213 / Phase 2 — Active relic dispatcher regression test.
# Verifies GameState.get_owned_active_id() returns the right id under
# four conditions:
#   1. No actives owned → "".
#   2. Only soul_surge owned → "soul_surge".
#   3. Only veilstep owned → "veilstep".
#   4. veilstep + soul_surge → "veilstep" (priority order in
#      ACTIVE_RELIC_IDS — veilstep listed before soul_surge so it
#      claims the button).
# Also confirms the three new registry entries exist and are well-formed.

func _initialize() -> void:
	print("[actives] init")
	# Autoloads aren't added to /root until at least one process_frame
	# has ticked. Wait one frame before resolving GameState.
	await process_frame
	var gs: Node = root.get_node_or_null("/root/GameState")
	if gs == null:
		printerr("FAIL: GameState autoload missing")
		quit(1)
		return
	# Confirm the three new registry entries exist.
	for required_id in ["veilstep", "ashen_seal", "blood_tithe"]:
		var info: Dictionary = gs.relic_info(required_id)
		if info.is_empty():
			printerr("FAIL: registry entry '%s' missing" % required_id)
			quit(1)
			return
		print("[actives] registry has %s — name=%s tier=%s" % [
			required_id, info.get("name", "?"), info.get("tier", "?")
		])
	# Reset state.
	_clear_inventory(gs)
	# Case 1: no actives.
	var got: String = gs.get_owned_active_id()
	if got != "":
		printerr("FAIL: empty inventory should return '', got '%s'" % got)
		quit(1)
		return
	print("[actives] case 1 OK: no actives → ''")
	# Case 2: only soul_surge.
	gs.grant_relic("soul_surge")
	got = gs.get_owned_active_id()
	if got != "soul_surge":
		printerr("FAIL: soul_surge only should return 'soul_surge', got '%s'" % got)
		quit(1)
		return
	print("[actives] case 2 OK: soul_surge only → 'soul_surge'")
	# Case 3: clear, only veilstep.
	_clear_inventory(gs)
	gs.grant_relic("veilstep")
	got = gs.get_owned_active_id()
	if got != "veilstep":
		printerr("FAIL: veilstep only should return 'veilstep', got '%s'" % got)
		quit(1)
		return
	print("[actives] case 3 OK: veilstep only → 'veilstep'")
	# Case 4: veilstep + soul_surge — veilstep wins (priority order).
	gs.grant_relic("soul_surge")
	got = gs.get_owned_active_id()
	if got != "veilstep":
		printerr("FAIL: priority order broken — veilstep + soul_surge should return 'veilstep', got '%s'" % got)
		quit(1)
		return
	print("[actives] case 4 OK: veilstep + soul_surge → 'veilstep' (priority)")
	# Case 5: ashen_seal beats soul_surge but loses to veilstep.
	_clear_inventory(gs)
	gs.grant_relic("soul_surge")
	gs.grant_relic("ashen_seal")
	got = gs.get_owned_active_id()
	if got != "ashen_seal":
		printerr("FAIL: ashen_seal + soul_surge should return 'ashen_seal', got '%s'" % got)
		quit(1)
		return
	print("[actives] case 5 OK: ashen_seal + soul_surge → 'ashen_seal'")
	print("[actives] PASS — all 5 dispatcher cases correct")
	quit(0)

# Helper: empty the typed Array[String] in-place. `gs.set("owned_relics", [])`
# silently fails because of the untyped→typed mismatch — accessing the
# property directly + calling .clear() works.
func _clear_inventory(gs: Node) -> void:
	var arr = gs.get("owned_relics")
	if arr != null:
		arr.clear()
