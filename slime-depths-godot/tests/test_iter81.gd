extends SceneTree

# Iter 81 — Workstream A of the post-iter-78 plan: port the JS attack-feel
# composer pattern to Godot. Three pieces:
#
#   1. attack_feel.gd     — NEW module (class AttackFeel) with
#      compose_slash_opts(hero, ctx), apply_hit_feedback_tier(target,
#      damage, opts), bolt_damage_tier(damage), THEME_RGB lookup,
#      dominant_theme(hero) helper.
#
#   2. slash_arc.gd       — REWRITTEN to a JS-style multi-trail
#      _draw()-based composite. No more BladeRig + 3 Line2Ds + HiltFlash
#      + TipBurst Polygon2D children — just _draw() with quadratic-Bezier
#      blade strokes at time offsets. The .tscn shrunk to a bare Node2D
#      + script.
#
#   3. screen_flash.gd / enemy.gd / fx.gd — call sites wired to use
#      the composer (slash spawn) + the tier feedback (take_hit).
func _initialize() -> void:
	var ok := true

	# ═══ AttackFeel module ═══

	var af := load("res://scripts/attack_feel.gd")
	if af == null:
		push_error("FAIL: attack_feel.gd failed to load")
		ok = false
		quit(1)
		return
	print("OK attack_feel.gd loads")

	# Required statics: compose_slash_opts, apply_hit_feedback_tier,
	# bolt_damage_tier, dominant_theme.
	for fn in ["compose_slash_opts", "apply_hit_feedback_tier",
			   "bolt_damage_tier", "dominant_theme"]:
		if not af.has_method(fn):
			push_error("FAIL: AttackFeel missing static %s" % fn)
			ok = false
	if ok:
		print("OK AttackFeel has all 4 static methods")

	# Verify compose_slash_opts returns the expected keys.
	# (Call statically without a hero — function uses GameState.theme_tier
	# fallback when hero is null, so a minimal call exercises the path.)
	var opts = af.compose_slash_opts(null, {"swing_index": 0, "swing_sign": 1})
	if not (opts is Dictionary):
		push_error("FAIL: compose_slash_opts didn't return Dictionary")
		ok = false
	else:
		for key in ["width", "trail_count", "arc", "dur", "color", "swing_sign"]:
			if not opts.has(key):
				push_error("FAIL: compose_slash_opts missing key '%s'" % key)
				ok = false
		if ok:
			print("OK compose_slash_opts returns {width, trail_count, arc, dur, color, swing_sign}")

	# bolt_damage_tier returns 0..3 by thresholds.
	if af.bolt_damage_tier(5) != 0 \
		or af.bolt_damage_tier(20) != 1 \
		or af.bolt_damage_tier(35) != 2 \
		or af.bolt_damage_tier(60) != 3:
		push_error("FAIL: bolt_damage_tier thresholds wrong")
		ok = false
	else:
		print("OK bolt_damage_tier(5/20/35/60) → 0/1/2/3")

	# THEME_RGB lookup has all 5 themes.
	var src := FileAccess.get_file_as_string("res://scripts/attack_feel.gd")
	for t in ["storm", "flame", "blood", "vow", "shadow"]:
		if not src.contains("\"%s\":" % t):
			push_error("FAIL: THEME_RGB missing theme %s" % t)
			ok = false
	if ok:
		print("OK THEME_RGB has all 5 themes")

	# ═══ slash_arc.gd rewrite ═══

	var slash_scene := load("res://scenes/fx/slash_arc.tscn")
	if slash_scene == null:
		push_error("FAIL: slash_arc.tscn failed to load")
		ok = false
		quit(1)
		return
	print("OK slash_arc.tscn loads")

	# Runtime smoke — instantiate, add to a tree, exercise setup().
	var host := Node2D.new()
	root.add_child(host)
	var slash: Node2D = slash_scene.instantiate() as Node2D
	if slash == null:
		push_error("FAIL: slash_arc instance is null")
		ok = false
	else:
		host.add_child(slash)
		if slash.has_method("setup"):
			# Call with the composer's opts dict shape.
			var test_opts: Dictionary = {
				"width": 14.0, "trail_count": 3, "arc": PI * 0.75,
				"dur": 0.20, "color": Color(1.0, 1.0, 1.0), "swing_sign": 1,
				"reach": 60.0,
			}
			slash.call("setup", Vector2(1.0, 0.0), test_opts)
			print("OK slash_arc.setup(aim, opts_dict) accepted")
			# Backward-compat: int swing_sign form.
			slash.call("setup", Vector2(1.0, 0.0), -1)
			print("OK slash_arc.setup(aim, swing_sign_int) backward-compat works")
		else:
			push_error("FAIL: slash_arc missing setup()")
			ok = false

	var slash_src := FileAccess.get_file_as_string("res://scripts/slash_arc.gd")
	# The rewrite is _draw()-based — must contain _draw() + draw_polyline.
	if not slash_src.contains("func _draw"):
		push_error("FAIL: slash_arc.gd missing _draw() (rewrite is _draw-based)")
		ok = false
	elif not slash_src.contains("draw_polyline"):
		push_error("FAIL: slash_arc.gd doesn't use draw_polyline (multi-trail strokes)")
		ok = false
	else:
		print("OK slash_arc.gd uses _draw + draw_polyline")

	# Quadratic Bezier blade sampling — _sample_blade_curve helper.
	if not slash_src.contains("_sample_blade_curve"):
		push_error("FAIL: slash_arc.gd missing _sample_blade_curve helper")
		ok = false
	else:
		print("OK slash_arc.gd has _sample_blade_curve (curved blade shape)")

	# Old iter-75 @onready var bindings should be GONE (the architectural
	# change — slash is now _draw-rendered, not scene-tree-children).
	# "BladeRig" can still appear in the historical comment explaining
	# what was removed — only @onready var references count.
	if slash_src.contains("@onready var _blade") \
		or slash_src.contains("@onready var _ghost") \
		or slash_src.contains("@onready var _hilt_flash") \
		or slash_src.contains("@onready var _outer_ring") \
		or slash_src.contains("@onready var _tip_burst") \
		or slash_src.contains("@onready var _hilt_sparkle"):
		push_error("FAIL: slash_arc.gd still has iter-75 @onready var bindings")
		ok = false
	else:
		print("OK slash_arc.gd has no leftover @onready var bindings")

	# ═══ Call sites wired ═══

	var sf_src := FileAccess.get_file_as_string("res://scripts/screen_flash.gd")
	if not sf_src.contains("AttackFeel.compose_slash_opts"):
		push_error("FAIL: screen_flash.gd doesn't call AttackFeel.compose_slash_opts")
		ok = false
	else:
		print("OK screen_flash.gd calls AttackFeel.compose_slash_opts")

	# The old iter-60 scale-by-sword_damage_bonus hack should be gone.
	if sf_src.contains("sword_dmg_bonus") and sf_src.contains("inst.scale = Vector2(slash_scale"):
		push_error("FAIL: screen_flash.gd still has iter-60 scale-by-bonus hack (superseded by composer width-scaling)")
		ok = false
	else:
		print("OK screen_flash.gd: iter-60 manual scale hack removed (composer handles it)")

	var enemy_src := FileAccess.get_file_as_string("res://scripts/enemy.gd")
	if not enemy_src.contains("AttackFeel.apply_hit_feedback_tier"):
		push_error("FAIL: enemy.gd take_hit doesn't call AttackFeel.apply_hit_feedback_tier")
		ok = false
	else:
		print("OK enemy.gd take_hit calls AttackFeel.apply_hit_feedback_tier")

	# fx.gd _on_enemy_hit should no longer apply the uniform shake (tier
	# system handles it now). It still spawns hit_spark.
	var fx_src := FileAccess.get_file_as_string("res://scripts/fx.gd")
	var fx_idx: int = fx_src.find("func _on_enemy_hit")
	if fx_idx >= 0:
		var fx_body: String = fx_src.substr(fx_idx, 400)
		if fx_body.contains("_shake(4.0"):
			push_error("FAIL: fx.gd _on_enemy_hit still has uniform _shake(4.0, ...)")
			ok = false
		else:
			print("OK fx.gd _on_enemy_hit: uniform shake removed (tier system drives it now)")

	if ok:
		print("=== ITER 81 INTEGRATION PASSED ===")
	else:
		print("=== ITER 81 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
