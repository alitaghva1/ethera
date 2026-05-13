extends SceneTree

# Iter 113 — HUD pulse feedback on HP loss / heal / kill increment.
#
# Pre-iter-113 _update_hp and _update_kills were bare text assignments:
# the heart row would silently change from "♥ ♥ ♥" to "♥ ♥ ♡" with no
# visual punctuation. Same for the kill counter — it just ticked up.
# Without a screen flash + camera shake (already there), the HUD never
# actually drew the eye to "you just lost HP" / "you just killed
# something." Most of the feedback was off-screen at the world position
# of the hit, not at the HUD where the resting reading happens.
#
# Iter-113 wires a snap-up scale + HDR modulate brighten on every HUD
# update, direction-aware:
#
#   HP DOWN  → scale 1.0 → 1.22 → 1.0 + red-leaning brighten
#              (modulate (1.8, 1.0, 1.0))
#   HP UP    → scale 1.0 → 1.12 → 1.0 + green-leaning brighten
#              (modulate (1.0, 1.8, 1.0))
#   KILL     → scale 1.0 → 1.18 → 1.0 + warm-cream brighten
#              (modulate (1.6, 1.6, 1.4))
#
# Shared _pulse_label helper kills any in-flight pulse on the same
# label before starting a new one (so rapid hits don't pile scales)
# and re-pivots the label's center each call (so the scale punches
# symmetrically — default Control pivot is top-left).
#
# First-frame _prev_hp = -1 sentinel guards the initial _update_hp call
# on scene load so spawn-in to full HP doesn't fire a phantom heal flash.
func _initialize() -> void:
	var ok := true

	var main_src := FileAccess.get_file_as_string("res://scripts/main.gd")

	# ═══ Direction-aware HUD pulse state ═══
	if "var _prev_hp: int = -1" not in main_src:
		push_error("FAIL: main.gd missing _prev_hp sentinel")
		ok = false
	if "var _prev_kills: int = -1" not in main_src:
		push_error("FAIL: main.gd missing _prev_kills sentinel")
		ok = false
	if "_hp_pulse_tween" not in main_src:
		push_error("FAIL: main.gd missing _hp_pulse_tween cache")
		ok = false
	if "_kills_pulse_tween" not in main_src:
		push_error("FAIL: main.gd missing _kills_pulse_tween cache")
		ok = false
	if ok:
		print("OK HUD pulse state vars + tween caches present")

	# ═══ Modulate palette ═══
	if "HP_DAMAGE_FLASH_MODULATE" not in main_src:
		push_error("FAIL: missing HP_DAMAGE_FLASH_MODULATE color")
		ok = false
	if "HP_HEAL_FLASH_MODULATE" not in main_src:
		push_error("FAIL: missing HP_HEAL_FLASH_MODULATE color")
		ok = false
	if "KILLS_FLASH_MODULATE" not in main_src:
		push_error("FAIL: missing KILLS_FLASH_MODULATE color")
		ok = false
	if "HUD_NEUTRAL_MODULATE" not in main_src:
		push_error("FAIL: missing HUD_NEUTRAL_MODULATE color")
		ok = false
	if ok:
		print("OK modulate palette (damage/heal/kills/neutral) defined")

	# ═══ Shared _pulse_label helper ═══
	if "func _pulse_label" not in main_src:
		push_error("FAIL: missing _pulse_label helper")
		ok = false
	# Should kill any prior tween before starting new one
	if not main_src.contains("if prev != null and prev.is_valid():"):
		push_error("FAIL: _pulse_label doesn't kill prior tween (would stack scales)")
		ok = false
	# Pivot must be re-set each call so center-of-label scaling works
	if not main_src.contains("label.pivot_offset = label.size * 0.5"):
		push_error("FAIL: _pulse_label doesn't re-pivot to label center")
		ok = false
	if ok:
		print("OK _pulse_label helper kills prior tween + re-pivots")

	# ═══ _update_hp + _update_kills wire the pulse correctly ═══
	# HP-DOWN path uses HP_DAMAGE_FLASH_MODULATE
	if not main_src.contains("_pulse_label(hp_label, \"_hp_pulse_tween\", 1.22, HP_DAMAGE_FLASH_MODULATE"):
		push_error("FAIL: _update_hp doesn't call damage-direction pulse")
		ok = false
	# HP-UP path uses HP_HEAL_FLASH_MODULATE
	if not main_src.contains("_pulse_label(hp_label, \"_hp_pulse_tween\", 1.12, HP_HEAL_FLASH_MODULATE"):
		push_error("FAIL: _update_hp doesn't call heal-direction pulse")
		ok = false
	# Kills monotonic increment fires its pulse
	if not main_src.contains("_pulse_label(kills_label, \"_kills_pulse_tween\", 1.18, KILLS_FLASH_MODULATE"):
		push_error("FAIL: _update_kills doesn't call kill pulse")
		ok = false
	if ok:
		print("OK _update_hp branches damage vs heal, _update_kills pulses on increment")

	# ═══ First-call sentinel guards ═══
	# _update_hp should skip pulse when _prev_hp == -1
	if not main_src.contains("if _prev_hp >= 0 and v != _prev_hp:"):
		push_error("FAIL: _update_hp doesn't gate pulse on _prev_hp >= 0")
		ok = false
	if not main_src.contains("if _prev_kills >= 0 and _kills > _prev_kills:"):
		push_error("FAIL: _update_kills doesn't gate pulse on _prev_kills >= 0")
		ok = false
	if ok:
		print("OK first-frame sentinels gate the pulse correctly")

	if ok:
		print("=== ITER 113 INTEGRATION PASSED ===")
	else:
		print("=== ITER 113 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
