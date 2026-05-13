extends SceneTree

# Iter 155 — Directional damage indicator.
#
# Pre-iter-155 when the hero took damage from offscreen — a bonecap
# turret behind a wall, a projectile arriving from camera periphery
# — the player got the same feedback as a melee hit at point-blank
# range: screen flash, heart pulse, knockback. None of it told them
# WHERE the threat was. Surviving the room meant frantically
# scanning the screen edges to find what just hit them.
#
# Genre cue: Hollow Knight, Hades, even modern Isaac mods all paint
# a directional red glow on the screen edge nearest an offscreen
# damage source. Tells the player where to look.
#
# Iter-155:
#   • New Events.hero_damage_directional(source_pos, hero_pos) signal
#     — emitted from hero.take_damage ONLY when source_pos is known
#     (not the iter-70 Vector2.INF sentinel). DoT ticks and
#     environmental hazards stay silent — a misdirected indicator
#     would teach the player to mistrust the cue.
#   • main.gd lazy-creates a ColorRect overlay on the UI CanvasLayer,
#     anchored/positioned to the screen edge nearest the source.
#     Edge picker: |dx| > |dy| → horizontal-dominant → LEFT or RIGHT
#     by sign; else → TOP or BOTTOM by sign (Godot 2D +Y = down).
#   • Tween: snap to alpha 0.55, fade to 0 over 0.55s. Kill any
#     in-flight tween on rapid hits so latest direction wins.
#   • Thickness 96 px — chunky enough to read in peripheral vision.
func _initialize() -> void:
	var ok := true

	var events_gd := FileAccess.get_file_as_string("res://scripts/events.gd")
	var hero_gd   := FileAccess.get_file_as_string("res://scripts/hero.gd")
	var main_gd   := FileAccess.get_file_as_string("res://scripts/main.gd")

	# ═══ Signal ═══
	if "signal hero_damage_directional(source_pos: Vector2, hero_pos: Vector2)" not in events_gd:
		push_error("FAIL: missing signal hero_damage_directional in events.gd")
		ok = false

	# ═══ Hero emits when source_pos known ═══
	if "Events.hero_damage_directional.emit(source_pos, global_position)" not in hero_gd:
		push_error("FAIL: hero.take_damage should emit hero_damage_directional when source is known")
		ok = false
	if "if source_pos.x != INF:" not in hero_gd:
		push_error("FAIL: emit should be gated by source_pos.x != INF (skip unknown sources)")
		ok = false

	# ═══ main.gd constants ═══
	if "DMG_INDICATOR_THICKNESS: float = 96.0" not in main_gd:
		push_error("FAIL: missing DMG_INDICATOR_THICKNESS = 96.0")
		ok = false
	if "DMG_INDICATOR_PEAK_ALPHA: float = 0.55" not in main_gd:
		push_error("FAIL: missing DMG_INDICATOR_PEAK_ALPHA = 0.55")
		ok = false
	if "DMG_INDICATOR_FADE_DUR: float = 0.55" not in main_gd:
		push_error("FAIL: missing DMG_INDICATOR_FADE_DUR = 0.55")
		ok = false
	if "DMG_INDICATOR_COLOR: Color = Color(0.85, 0.10, 0.12, 1.0)" not in main_gd:
		push_error("FAIL: missing DMG_INDICATOR_COLOR red baseline")
		ok = false

	# ═══ State vars ═══
	if "var _dmg_indicator: ColorRect = null" not in main_gd:
		push_error("FAIL: missing _dmg_indicator: ColorRect = null")
		ok = false
	if "var _dmg_indicator_tween: Tween = null" not in main_gd:
		push_error("FAIL: missing _dmg_indicator_tween: Tween = null")
		ok = false

	# ═══ Subscribe + handler ═══
	if "Events.hero_damage_directional.connect(_on_hero_damage_directional)" not in main_gd:
		push_error("FAIL: main.gd should subscribe to hero_damage_directional")
		ok = false
	if "func _on_hero_damage_directional(source_pos: Vector2, hero_pos: Vector2) -> void:" not in main_gd:
		push_error("FAIL: _on_hero_damage_directional handler missing")
		ok = false

	# ═══ Edge-picker logic — 4 branches ═══
	if "if abs(d.x) > abs(d.y):" not in main_gd:
		push_error("FAIL: edge picker should branch on |dx| > |dy|")
		ok = false
	# All four edge anchor patterns present
	if "_dmg_indicator.anchor_left = 1.0" not in main_gd:
		push_error("FAIL: missing right-edge anchor (anchor_left = 1.0)")
		ok = false
	if "_dmg_indicator.anchor_right = 0.0" not in main_gd:
		push_error("FAIL: missing left-edge anchor (anchor_right = 0.0)")
		ok = false
	if "_dmg_indicator.anchor_top = 1.0" not in main_gd:
		push_error("FAIL: missing bottom-edge anchor (anchor_top = 1.0)")
		ok = false
	if "_dmg_indicator.anchor_bottom = 0.0" not in main_gd:
		push_error("FAIL: missing top-edge anchor (anchor_bottom = 0.0)")
		ok = false

	# ═══ Fade tween fires on every hit ═══
	if "tween_property(_dmg_indicator, \"color:a\", 0.0, DMG_INDICATOR_FADE_DUR)" not in main_gd:
		push_error("FAIL: indicator should fade color:a → 0 over DMG_INDICATOR_FADE_DUR")
		ok = false

	if ok:
		print("OK directional damage indicator: 96 px red edge bar, fades 0.55 → 0 over 0.55 s")
		print("=== ITER 155 INTEGRATION PASSED ===")
	else:
		print("=== ITER 155 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
