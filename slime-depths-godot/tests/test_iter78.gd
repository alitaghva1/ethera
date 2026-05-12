extends SceneTree

# Iter 78 — design refinement on iter-77 portal.
#
# User feedback: portal STILL fought visually with fire spots, and there
# were too many portal-open events (3 portals × 1-3 waves = 3-9 per room),
# diluting the impact of the opening moment.
#
# Three design changes:
#   1. Color shift magenta-purple → cool indigo (fire is orange; indigo
#      sits 90° off on the color wheel rather than complementary, so the
#      two no longer vibrate against each other)
#   2. Ember motion: rising upward → sinking inward (fire embers rise;
#      portal embers now SINK toward center — different motion grammar)
#   3. Portals persist across waves in a room (open once, all waves emerge
#      through the same portals, close on room clear). Combined with
#      MAX_WAVE_PORTALS 3 → 2, a typical room sees ONE open event total
#      instead of 3-9.
func _initialize() -> void:
	var ok := true

	# ═══ Color shift to indigo ═══
	var portal_src := FileAccess.get_file_as_string("res://scripts/spawn_portal.gd")

	# _portal_color base should be cool indigo (0.30, 0.20, 0.60), not
	# warm magenta-purple (0.55, 0.25, 0.75).
	if portal_src.contains("Color(0.55, 0.25, 0.75)"):
		push_error("FAIL: spawn_portal.gd still has the iter-77 magenta-purple base — should be indigo")
		ok = false
	elif not portal_src.contains("Color(0.30, 0.20, 0.60)"):
		push_error("FAIL: spawn_portal.gd missing indigo base Color(0.30, 0.20, 0.60)")
		ok = false
	else:
		print("OK _portal_color base shifted to cool indigo")

	# RUNE_COLOR should be indigo (0.40 R, not 0.55 R).
	if portal_src.contains("RUNE_COLOR: Color = Color(0.55, 0.30, 0.70"):
		push_error("FAIL: RUNE_COLOR still magenta — should be indigo")
		ok = false
	else:
		print("OK RUNE_COLOR shifted bluer/indigo")

	# ═══ Ember motion: inward sink (not upward rise) ═══

	# Should use SPHERE_SURFACE (ring outline) not SPHERE (filled disc)
	# so embers spawn at the OUTER edge and travel inward.
	if not portal_src.contains("EMISSION_SHAPE_SPHERE_SURFACE"):
		push_error("FAIL: ember emission should be SPHERE_SURFACE (ring outline)")
		ok = false
	else:
		print("OK embers spawn on ring outline (SPHERE_SURFACE)")

	# Negative initial_velocity (= inward against radial-outward default)
	if not portal_src.contains("-EMBER_VELOCITY_MAX") and not portal_src.contains("-EMBER_VELOCITY_MIN"):
		push_error("FAIL: ember initial_velocity should be negative (inward sink)")
		ok = false
	else:
		print("OK ember initial_velocity is negative (inward sink)")

	# No gravity (rising was caused by negative gravity in iter-77)
	if portal_src.contains("EMBER_GRAVITY"):
		push_error("FAIL: EMBER_GRAVITY constant should be removed — embers sink radially, no gravity")
		ok = false
	else:
		print("OK EMBER_GRAVITY removed (pure inward sink, no upward bias)")

	# Ember count reduced
	if not portal_src.contains("EMBER_AMOUNT: int = 4"):
		push_error("FAIL: EMBER_AMOUNT should be 4 (was 6 in iter-77)")
		ok = false
	else:
		print("OK EMBER_AMOUNT reduced 6 → 4")

	# ═══ Frequency: persistence across waves + lower cap ═══
	var main_src := FileAccess.get_file_as_string("res://scripts/main.gd")

	# MAX_WAVE_PORTALS lowered to 2.
	if not main_src.contains("MAX_WAVE_PORTALS: int = 2"):
		push_error("FAIL: MAX_WAVE_PORTALS should be 2 (was 3 in iter-77)")
		ok = false
	else:
		print("OK MAX_WAVE_PORTALS lowered 3 → 2")

	# _open_wave_portals should be idempotent — early-return if already open.
	var open_idx: int = main_src.find("func _open_wave_portals")
	if open_idx < 0:
		push_error("FAIL: func _open_wave_portals not found")
		ok = false
	else:
		var open_body: String = main_src.substr(open_idx, 800)
		# The first thing in the body should be the idempotency guard.
		if not (open_body.contains("not _active_wave_portals.is_empty") or
				open_body.contains("_active_wave_portals.size() > 0")):
			push_error("FAIL: _open_wave_portals lacks idempotency guard (must skip if already open)")
			ok = false
		else:
			print("OK _open_wave_portals is idempotent (no-op when already open)")

	# _on_wave_cleared should only close portals on the room-clear (else)
	# branch, not on every inter-wave clear.
	var closed_idx: int = main_src.find("func _on_wave_cleared")
	if closed_idx < 0:
		push_error("FAIL: func _on_wave_cleared not found")
		ok = false
	else:
		var cleared_body: String = main_src.substr(closed_idx, 1500)
		# Find the close call inside the body.
		var close_pos: int = cleared_body.find("_close_active_wave_portals")
		var else_pos: int = cleared_body.find("else:")
		if close_pos < 0:
			push_error("FAIL: _on_wave_cleared no longer calls _close_active_wave_portals at all")
			ok = false
		elif close_pos < else_pos:
			push_error("FAIL: _close_active_wave_portals called BEFORE the else branch — should only fire on room clear, not every wave")
			ok = false
		else:
			print("OK _close_active_wave_portals called only in room-clear branch")

	if ok:
		print("=== ITER 78 INTEGRATION PASSED ===")
	else:
		print("=== ITER 78 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
