extends SceneTree

# Iter 130 — Minimalist Dark Souls menu pass: kill all title motion,
# tune the embers to lazy drift.
#
# Playtester verdict on iter-129: "The title is moving like a 3D movie.
# I want you to take inspiration from Dark Souls — minimalist kind of
# homepage that hits though. Large on well thought out particle
# effects, good logo on the image."
#
# Genre reference: Dark Souls 1/3, Bloodborne, Elden Ring, Hollow
# Knight, Demon's Souls — every one of these games keeps the title
# LOGO completely static. No scale pulse, no breath, no parallax on
# the brand mark. The world has motion (embers, smoke, fog) but the
# logo is rock solid. That contrast IS the gravitas.
#
# Diagnosis of the iter-129 "3D movie" read:
#   • iter-111 widened the title scale pulse to 0.94..1.06 over 1.25s
#     on infinite loop. The scale animation reads as "Hollywood title
#     zoom" no matter how subtle.
#   • iter-111 also added a 4 px mouse parallax to the title. Tiny
#     but constant motion — every cursor move nudges the logo.
#   • iter-129's halo pulse coupling (alpha 0.36..0.50) added a third
#     layer of motion behind the title.
# Three independent motion sources stacked → "3D movie."
#
# Iter-130 strips all of it:
#
#   TITLE — NOW STATIC
#     • _start_title_pulse() removed (was creating the infinite-loop
#       scale tween)
#     • _apply_title_scale() removed (was the per-frame target of the
#       pulse + drove title_halo.modulate.a)
#     • _title_tween var removed
#     • TITLE_PULSE_MIN / MAX / HALF_DURATION constants removed
#     • _start_title_pulse() call deleted from _ready
#     • PARALLAX_TITLE_MAX_PX 4.0 → 0.0 (title doesn't drift with cursor)
#
#   TITLEHALO — NATURAL ALPHA
#     Without _apply_title_scale forcing modulate.a, the halo's
#     TextureRect modulate stays at its default 1.0, and the gradient
#     texture's natural ~0.22 peak alpha shows through. That's the
#     intended "quiet warm pool of ancient torchlight" the iter-127/129
#     pulse range never quite achieved.
#
#   TORCH EMBERS — DARK SOULS PACING
#     LeftTorchEmbers + RightTorchEmbers retuned:
#       amount 22 → 14 (sparser)
#       initial_velocity 22-46 → 10-24 (half-speed lazy drift)
#       lifetime 1.6 → 3.2s (linger long enough to read)
#       damping 0.6-1.4 → 0.3-0.7 (velocity holds longer)
#       scale 0.06-0.10 → 0.08-0.14 (slightly larger to read at sparser count)
#       tangential_accel ±10 → ±5 (gentler swirl)
#
#   BACKDROP PARALLAX PRESERVED
#     PARALLAX_BACKDROP_MAX_PX stays at 10 px. The world reacts to
#     the cursor; the brand doesn't move.
func _initialize() -> void:
	var ok := true

	var gd := FileAccess.get_file_as_string("res://scripts/main_menu.gd")
	var tscn := FileAccess.get_file_as_string("res://scenes/main_menu.tscn")

	# ═══ Title pulse system fully removed ═══
	for forbidden in ["func _start_title_pulse", "func _apply_title_scale", "var _title_tween"]:
		if forbidden in gd:
			push_error("FAIL: %s still present — iter-130 deleted the whole pulse system" % forbidden)
			ok = false
	# Constants gone too — _start_title_pulse() call site removed from _ready
	if "TITLE_PULSE_MIN := " in gd:
		push_error("FAIL: TITLE_PULSE_MIN constant still declared")
		ok = false
	if "TITLE_PULSE_MAX := " in gd:
		push_error("FAIL: TITLE_PULSE_MAX constant still declared")
		ok = false
	if "TITLE_PULSE_HALF_DURATION" in gd and not gd.contains("# the _start_title_pulse"):
		push_error("FAIL: TITLE_PULSE_HALF_DURATION constant still declared")
		ok = false
	# _start_title_pulse() call must be gone from _ready
	if gd.contains("\t_start_title_pulse()"):
		push_error("FAIL: _start_title_pulse() call still in _ready")
		ok = false
	if ok:
		print("OK title scale pulse system fully retired (function + tween + constants + call)")

	# ═══ Title parallax magnitude zeroed ═══
	if "PARALLAX_TITLE_MAX_PX := 0.0" not in gd:
		push_error("FAIL: PARALLAX_TITLE_MAX_PX should be 0.0 (title doesn't drift)")
		ok = false
	# Backdrop parallax preserved
	if "PARALLAX_BACKDROP_MAX_PX := 10.0" not in gd:
		push_error("FAIL: backdrop parallax magnitude should still be 10 (world reacts; brand doesn't)")
		ok = false
	if ok:
		print("OK title parallax disabled (0 px); backdrop parallax preserved (10 px)")

	# ═══ Torch embers retuned for Dark Souls pacing ═══
	# Both LeftTorchEmbers + RightTorchEmbers should have the new values.
	# We do a structural check on the .tscn — count occurrences of each
	# new parameter; should be 2 (one per emitter).
	var amount_count: int = 0
	var velocity_min_count: int = 0
	var lifetime_count: int = 0
	for line in tscn.split("\n"):
		var t: String = String(line).strip_edges()
		if t == "amount = 14":
			amount_count += 1
		elif t == "initial_velocity_min = 10.0":
			velocity_min_count += 1
		elif t == "lifetime = 3.2":
			lifetime_count += 1
	if amount_count < 2:
		push_error("FAIL: only %d emitters at amount=14, expected 2 (Left+Right TorchEmbers)" % amount_count)
		ok = false
	if velocity_min_count < 2:
		push_error("FAIL: only %d emitters at initial_velocity_min=10, expected 2" % velocity_min_count)
		ok = false
	if lifetime_count < 2:
		push_error("FAIL: only %d emitters at lifetime=3.2, expected 2" % lifetime_count)
		ok = false
	# Old fast values must be GONE
	if "amount = 22\nlifetime = 1.6" in tscn:
		push_error("FAIL: pre-iter-130 torch ember values still present (amount=22, lifetime=1.6)")
		ok = false
	if ok:
		print("OK torch embers tuned: 14 sparse particles, 10-24 px/s lazy drift, 3.2s lifetime")

	# ═══ Anchored emitters preserved ═══
	for required in ["name=\"LeftTorchEmbers\"", "name=\"RightTorchEmbers\"", "name=\"MistParticles\""]:
		if required not in tscn:
			push_error("FAIL: %s missing — iter-129 contract violated" % required)
			ok = false

	# ═══ Runtime ═══
	var scene: PackedScene = load("res://scenes/main_menu.tscn")
	if scene == null:
		push_error("FAIL: main_menu.tscn no longer loads after iter-130 cleanup")
		ok = false

	if ok:
		print("=== ITER 130 INTEGRATION PASSED ===")
	else:
		print("=== ITER 130 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
