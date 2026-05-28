extends SceneTree

# Iter 89 — slash position fix. The iter-88 Frostwindz slash sheet has
# its arc visual mass concentrated in the upper-right diagonal of the
# 128px cell. With the AnimatedSprite2D centered at hero position +
# VFX_HEIGHT_OFFSET, that put the arc off-axis from the swing
# direction — user reported the slash "is almost happening ahead or
# behind it" depending on aim direction.
#
# Fix: AnimatedSprite2D.offset in LOCAL coords (rotates with the node)
# shifts the texture forward in the aim direction. Default Vector2.ZERO
# keeps existing FX behavior unchanged.
func _initialize() -> void:
	var ok := true

	# ═══ FxSprite accepts offset opt ═══
	var fxs := load("res://scripts/fx_sprite.gd")
	if fxs == null:
		push_error("FAIL: fx_sprite.gd failed to load")
		ok = false
	else:
		var src := FileAccess.get_file_as_string("res://scripts/fx_sprite.gd")
		if not src.contains("fx.offset = opts.get(\"offset\""):
			push_error("FAIL: fx_sprite.gd doesn't read opts.offset")
			ok = false
		else:
			print("OK fx_sprite.gd accepts opts.offset for AnimatedSprite2D.offset")

	# ═══ Runtime smoke — pass offset and verify it lands on the sprite ═══
	if fxs != null and fxs.has_method("spawn"):
		var host := Node2D.new()
		root.add_child(host)
		var test_offset := Vector2(48.0, 0.0)
		var fx = fxs.spawn(host, Vector2(640, 384), "slash_arc", {
			"offset": test_offset,
		})
		if fx == null:
			push_error("FAIL: FxSprite.spawn returned null for slash_arc")
			ok = false
		elif fx.offset != test_offset:
			push_error("FAIL: FxSprite.offset not propagated, got %s expected %s" % [str(fx.offset), str(test_offset)])
			ok = false
		else:
			print("OK FxSprite propagates opts.offset to AnimatedSprite2D.offset")

	# ═══ screen_flash.gd passes a forward offset for slash ═══
	var sf_src := FileAccess.get_file_as_string("res://scripts/screen_flash.gd")
	if not sf_src.contains("SLASH_FORWARD_OFFSET"):
		push_error("FAIL: screen_flash.gd doesn't define SLASH_FORWARD_OFFSET const")
		ok = false
	else:
		print("OK screen_flash.gd has SLASH_FORWARD_OFFSET const")

	if not sf_src.contains("\"offset\": Vector2(SLASH_FORWARD_OFFSET, 0.0)"):
		push_error("FAIL: screen_flash.gd doesn't pass offset to FxSprite.spawn")
		ok = false
	else:
		print("OK screen_flash.gd passes forward offset to slash FxSprite")

	# ═══ Offset is non-zero (sanity — zero offset would defeat the fix) ═══
	# Regex out the const value to assert it's > 0.
	var re := RegEx.new()
	re.compile("SLASH_FORWARD_OFFSET:\\s*float\\s*=\\s*(\\d+(?:\\.\\d+)?)")
	var m := re.search(sf_src)
	if m == null:
		push_error("FAIL: SLASH_FORWARD_OFFSET constant not parseable")
		ok = false
	else:
		var val: float = float(m.get_string(1))
		if val <= 0.0:
			push_error("FAIL: SLASH_FORWARD_OFFSET is %s, should be > 0 to push slash forward" % val)
			ok = false
		elif val > 80.0:
			push_error("FAIL: SLASH_FORWARD_OFFSET %s is too large (>80) — slash would be far in front of hero" % val)
			ok = false
		else:
			print("OK SLASH_FORWARD_OFFSET = %s (forward push within reasonable range)" % val)

	if ok:
		print("=== ITER 89 INTEGRATION PASSED ===")
	else:
		print("=== ITER 89 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
