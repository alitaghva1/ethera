extends SceneTree

# Iter 153 — Enemy ground shadow + bob-synced pulse.
#
# Pre-iter-153 enemies had NO shadow. The hero has had one since
# iter-132 (with iter-132's bob-synced shadow pulse for ground
# contact). Enemies floating above the floor — especially boss
# enemies with larger sprites — read as un-grounded in the room.
#
# Genre cue: in Hades every entity has a shadow. In Isaac sprites
# are tile-aligned (less of an issue since the pixel grid sells
# ground contact), but our smoother style needs the explicit shadow.
#
# Iter-153 builds a Polygon2D shadow programmatically in _ready:
#   • Elliptical (12 vertices, 1.0:0.45 aspect — top-down perspective
#     squash, matches iter-147 spawn_telegraph)
#   • Radius 14 px × enemy_type.sprite_scale — boss gets bigger,
#     slime gets smaller
#   • Color (0, 0, 0, 0.35) — visible on bright floors, soft on dark
#   • z_index = -2 (BEHIND sprite z=0 and spawn_telegraph z=-1)
#   • Position (0, +12) — at the "feet," matching spawn_telegraph
#
# Pulse: in _process the shadow scale oscillates in COUNTER-PHASE
# with the iter-152 sprite bob:
#   • sprite HIGH (bob > 0) → "foot off ground" → shadow SHRINKS
#   • sprite LOW  (bob < 0) → "foot on ground"  → shadow GROWS
#   • ±12% scale at bob peak
# Mirrors iter-132 hero shadow_pulse — visual grammar consistency.
func _initialize() -> void:
	var ok := true

	var gd := FileAccess.get_file_as_string("res://scripts/enemy.gd")

	# ═══ Constants ═══
	if "SHADOW_BASE_ALPHA: float = 0.35" not in gd:
		push_error("FAIL: missing SHADOW_BASE_ALPHA = 0.35")
		ok = false
	if "SHADOW_PULSE_AMP: float = 0.12" not in gd:
		push_error("FAIL: missing SHADOW_PULSE_AMP = 0.12 (±12% of base scale)")
		ok = false

	# ═══ Shadow tracking vars ═══
	if "var _shadow: Polygon2D = null" not in gd:
		push_error("FAIL: missing _shadow: Polygon2D = null")
		ok = false
	if "var _shadow_base_scale: Vector2 = Vector2.ONE" not in gd:
		push_error("FAIL: missing _shadow_base_scale: Vector2 = Vector2.ONE")
		ok = false

	# ═══ Builder function ═══
	if "func _build_ground_shadow() -> void:" not in gd:
		push_error("FAIL: missing _build_ground_shadow() helper")
		ok = false
	# Scaled by sprite_scale
	if "var rx: float = 14.0 * sc" not in gd:
		push_error("FAIL: shadow rx should be 14.0 * sprite_scale")
		ok = false
	if "var ry: float = rx * 0.45" not in gd:
		push_error("FAIL: shadow ry should be rx * 0.45 (perspective squash)")
		ok = false
	# Correct positioning + z-order
	if "_shadow.position = Vector2(0, 12)" not in gd:
		push_error("FAIL: shadow should be at (0, 12) — feet level")
		ok = false
	if "_shadow.z_index = -2" not in gd:
		push_error("FAIL: shadow z_index should be -2 (behind sprite + telegraph)")
		ok = false
	if "Color(0, 0, 0, SHADOW_BASE_ALPHA)" not in gd:
		push_error("FAIL: shadow color should be Color(0, 0, 0, SHADOW_BASE_ALPHA)")
		ok = false

	# ═══ _ready calls the builder ═══
	if "_build_ground_shadow()" not in gd:
		push_error("FAIL: _ready should call _build_ground_shadow()")
		ok = false

	# ═══ _process applies counter-phase pulse ═══
	if "var shadow_pulse: float = -sin_v * SHADOW_PULSE_AMP" not in gd:
		push_error("FAIL: shadow_pulse should be NEGATED sin_v (counter-phase to bob)")
		ok = false
	if "_shadow.scale = _shadow_base_scale * (1.0 + shadow_pulse)" not in gd:
		push_error("FAIL: shadow.scale should be _shadow_base_scale * (1.0 + shadow_pulse)")
		ok = false

	if ok:
		print("OK enemy shadow: 14px*scale elliptical, alpha 0.35, ±12%% pulse counter to bob")
		print("=== ITER 153 INTEGRATION PASSED ===")
	else:
		print("=== ITER 153 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
