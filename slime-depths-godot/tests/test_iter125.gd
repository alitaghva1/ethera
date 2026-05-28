extends SceneTree

# Iter 125 — Big visual pass on HP + relics + sets.
#
# Playtester screenshot showed three problems on the treasure-vault HUD:
#   • Hearts (♥ / ♡ Unicode at 22 pt, dark red) read as "small + hard
#     to see against a warm-brown floor"
#   • Single 40 px magenta-bordered RelicIcon floating in the corner =
#     "oversized badge"
#   • Standalone "BLOOD 1/4" pill chip = different visual language
#     stapled below the relic, unrelated to the icon above it
#
# Genre review pointed at: Hades / Risk of Rain 2 / Slay the Spire all
# show owned items + set status as ONE coherent strip, not two
# different UI widgets. Heart visuals from Hollow Knight / Enter the
# Gungeon / Hyper Light Drifter use custom geometry, not generic font
# glyphs, for max contrast.
#
# Iter-125 lands three coordinated changes:
#
#   1. CUSTOM POLYGON HEARTS
#      HPLabel hidden. New HeartRow HBoxContainer in main.tscn.
#      main.gd::_make_heart_pip builds a 30×30 Control with four
#      layered Polygon2Ds + Line2D — pixel-art heart with shadow,
#      body, highlight, outline. _update_hp rebuilds pip count when
#      max_hp_bonus changes; _set_pip_filled toggles filled vs empty
#      state by re-coloring the body + dimming the shadow. iter-113
#      damage/heal pulse retargeted from hp_label to heart_row.
#
#   2. RELIC ICON SHRUNK + REFINED
#      relic_icon.gd::ICON_SIZE 40 → 32 px. Border width 2 → 1 px.
#      Corner radius 5 → 3 px. Legendary shadow size 4 → 3. Fallback
#      glyph font 22 → 18 pt. Reads as a refined badge, not a thick
#      magenta-rimmed frame.
#
#   3. THEME CHIPS REPLACED BY INLINE DIAMOND GLYPHS
#      Old _build_theme_chip produced a 108×54 Panel with theme name +
#      "◆◆" tier dots + "1/4" count badge. Iter-125's _build_theme_chip
#      returns a 24×24 Control with a colored diamond Polygon2D:
#        • tier 0 (1-2 owned)  → dim diamond (alpha 0.50)
#        • tier 1 (Resonance)  → bright diamond + subtle scale pulse
#        • tier 2 (Ascendance) → bright + pulsing outer halo
#      Detail (name + count + tier) lives in the hover tooltip via the
#      same _on_theme_chip_hover wiring as before — no API break.
#      Theme glyphs are appended INTO relic_strip itself, after the
#      relic icons, so the HUD reads as one unified row.
#      Standalone theme_chip_strip container is dropped (queue_free'd
#      on first rebuild if it exists from a prior iter-74 build).
func _initialize() -> void:
	var ok := true

	var main_tscn := FileAccess.get_file_as_string("res://scenes/main.tscn")
	var main_gd := FileAccess.get_file_as_string("res://scripts/main.gd")
	var relic_gd := FileAccess.get_file_as_string("res://scripts/relic_icon.gd")

	# ═══ Heart Row wired ═══
	if "name=\"HeartRow\"" not in main_tscn:
		push_error("FAIL: main.tscn missing HeartRow container")
		ok = false
	if "@onready var heart_row" not in main_gd:
		push_error("FAIL: main.gd missing heart_row @onready ref")
		ok = false
	if "func _make_heart_pip" not in main_gd:
		push_error("FAIL: missing _make_heart_pip builder")
		ok = false
	if "func _set_pip_filled" not in main_gd:
		push_error("FAIL: missing _set_pip_filled helper")
		ok = false
	# HPLabel kept but hidden (visible = false) so any stale references
	# don't null-crash.
	if "[node name=\"HPLabel\" type=\"Label\" parent=\"UI\"]\nvisible = false" not in main_tscn:
		push_error("FAIL: HPLabel should be visible=false (kept as inert placeholder)")
		ok = false
	if ok:
		print("OK polygon heart pips: HeartRow container + _make_heart_pip + _set_pip_filled")

	# ═══ Heart pulse retargeted from label to row ═══
	# iter-113 _pulse_label(hp_label, ...) used to fire on the now-hidden
	# Label. iter-125 retargets to heart_row.
	if "_pulse_label(heart_row," not in main_gd:
		push_error("FAIL: iter-113 pulse should target heart_row, not hp_label")
		ok = false
	if "_pulse_label(hp_label," in main_gd:
		push_error("FAIL: leftover _pulse_label(hp_label, ...) call — pulse fires on hidden node")
		ok = false
	# _pulse_label signature must accept Control (not Label) now
	if "func _pulse_label(label: Control" not in main_gd:
		push_error("FAIL: _pulse_label signature should accept Control (was Label)")
		ok = false
	if ok:
		print("OK iter-113 HP pulse retargeted to heart_row Control")

	# ═══ Relic icon refined ═══
	if "ICON_SIZE: float = 32.0" not in relic_gd:
		push_error("FAIL: relic_icon.gd ICON_SIZE should be 32 (was 40)")
		ok = false
	if "sb.border_width_left = 1" not in relic_gd:
		push_error("FAIL: relic frame border_width should be 1 (was 2)")
		ok = false
	if "sb.corner_radius_top_left = 3" not in relic_gd:
		push_error("FAIL: relic frame corner_radius should be 3 (was 5)")
		ok = false
	if "sb.shadow_size = 3" not in relic_gd:
		push_error("FAIL: legendary shadow_size should be 3 (was 4)")
		ok = false
	if ok:
		print("OK relic icon refined: 32 px + 1 px border + radius 3 + shadow 3")

	# ═══ Theme chips → diamond glyphs ═══
	if "THEME_GLYPH_SIZE" not in main_gd:
		push_error("FAIL: missing THEME_GLYPH_SIZE constant")
		ok = false
	if "THEME_GLYPH_RADIUS" not in main_gd:
		push_error("FAIL: missing THEME_GLYPH_RADIUS constant")
		ok = false
	# Old 108×54 chip should be gone — search for the obsolete spec
	# strings that defined it.
	if "Vector2(108, 54)" in main_gd:
		push_error("FAIL: 108×54 chip dimensions still present — old pill not removed")
		ok = false
	if "_letterspace_theme(theme)" in main_gd:
		# Function may stay but should NOT be called in _build_theme_chip
		# anymore (was used for the chip's "B L O O D" text label)
		var idx := main_gd.find("func _build_theme_chip")
		var body := main_gd.substr(idx, 2200) if idx >= 0 else ""
		if "_letterspace_theme(theme)" in body:
			push_error("FAIL: _build_theme_chip still uses letterspaced theme name (chip text shouldn't exist anymore)")
			ok = false
	# Glyphs should be appended to relic_strip, NOT a standalone container
	if "relic_strip.add_child(glyph)" not in main_gd:
		push_error("FAIL: theme glyphs not appended to relic_strip")
		ok = false
	# Standalone theme_chip_strip should be torn down on rebuild
	if "theme_chip_strip.queue_free()" not in main_gd:
		push_error("FAIL: legacy theme_chip_strip not freed on rebuild")
		ok = false
	if ok:
		print("OK theme chips replaced by 24×24 diamond glyphs appended to relic_strip")

	# ═══ Tier-up flash + hover tooltip preserved ═══
	# Both wiring patterns must still exist — the new glyph is still a
	# Control with .scale + .modulate, so the existing flash function
	# applies. Hover uses the same _on_theme_chip_hover.bind(theme, root).
	if "_play_theme_chip_tier_flash(glyph)" not in main_gd:
		push_error("FAIL: tier-up flash not wired on the new glyph")
		ok = false
	if "_on_theme_chip_hover.bind(theme, root)" not in main_gd:
		push_error("FAIL: hover tooltip wiring missing on glyph root")
		ok = false
	if ok:
		print("OK tier-up flash + hover tooltip preserved on new glyph")

	# ═══ Runtime — scene loads + heart row exists ═══
	var scene: PackedScene = load("res://scenes/main.tscn")
	if scene == null:
		push_error("FAIL: main.tscn no longer loads after refactor")
		ok = false

	if ok:
		print("=== ITER 125 INTEGRATION PASSED ===")
	else:
		print("=== ITER 125 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
