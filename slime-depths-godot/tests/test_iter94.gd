extends SceneTree

# Iter 94 — combat VFX simplification per user playtest feedback:
#
#   "Parry/shield are a bit much, lets just keep a shield or parry.
#    Shield should be like a coloured bubble effect around the main
#    character. Dash strike should be a shield effect with a particle
#    effect behind it as it shoots you in the direction of the strike.
#    The design for the dash strike is a broken square that looks like
#    its a size issue almost."
#
# Three changes:
#
# 1. **Parry = bubble around hero.** parry_shield.tscn rebuilt as a
#    single Node2D whose _draw() renders three concentric layers
#    (halo + core + rim). No more kite silhouette, no more reflect
#    beams, no more parry_burst sprite-sheet flourish on top. setup()
#    and shatter() API preserved so hero.gd's spawn/catch paths unchanged.
#
# 2. **Parry_burst sprite spawns deleted.** Both FxSpriteHelper.spawn(
#    "parry_burst", ...) calls in hero.gd (_start_parry + _on_parry_hit)
#    removed. The bubble alone IS the parry visual.
#
# 3. **Dash strike = forward shield + trailing particles + procedural
#    impact.** New dash_shield.tscn (translucent gold-cyan bubble) is
#    parented to the hero during the dash motion, paired with the
#    existing dash_trail.tscn behind. main.gd's FxSprite("dash_impact")
#    spawn at landing reverts to procedural dash_impact.tscn — kills
#    the visible "broken square" sprite-sheet cell boundary.
func _initialize() -> void:
	var ok := true

	# ═══ Parry bubble script + scene ═══
	var ps_src := FileAccess.get_file_as_string("res://scripts/parry_shield.gd")
	if not ps_src.contains("BUBBLE_RADIUS"):
		push_error("FAIL: parry_shield.gd doesn't define BUBBLE_RADIUS (no longer a bubble)")
		ok = false
	else:
		print("OK parry_shield.gd is now bubble-based (BUBBLE_RADIUS const present)")

	# The kite silhouette + BeamFan have been replaced by draw_circle/draw_arc.
	if ps_src.contains("FORWARD_OFFSET"):
		push_error("FAIL: parry_shield.gd still uses FORWARD_OFFSET (bubble should CENTER on hero, not sit in front)")
		ok = false
	else:
		print("OK parry_shield.gd FORWARD_OFFSET removed (bubble centers on hero)")

	if not (ps_src.contains("draw_circle") and ps_src.contains("draw_arc")):
		push_error("FAIL: parry_shield.gd doesn't draw circles + arc (no procedural bubble)")
		ok = false
	else:
		print("OK parry_shield.gd draws halo + core + rim via draw_circle/draw_arc")

	# Scene file should be the simplified single-node form.
	var ps_scene_src := FileAccess.get_file_as_string("res://scenes/fx/parry_shield.tscn")
	for legacy_node in ["BeamFan1", "BeamFan2", "BeamFan3", "Halo", "Core", "Boss", "Rim"]:
		if ps_scene_src.contains("name=\"%s\"" % legacy_node):
			push_error("FAIL: parry_shield.tscn still has legacy %s node (kite/beam composition not collapsed)" % legacy_node)
			ok = false
	if ok:
		print("OK parry_shield.tscn collapsed to single Node2D (no legacy kite/beam children)")

	# ═══ hero.gd no longer spawns parry_burst sprite ═══
	var hero_src := FileAccess.get_file_as_string("res://scripts/hero.gd")
	if hero_src.contains("\"parry_burst\""):
		push_error("FAIL: hero.gd still spawns 'parry_burst' FxSprite (should be removed — bubble is the only parry visual)")
		ok = false
	else:
		print("OK hero.gd no longer spawns parry_burst sheet (bubble-only parry)")

	# ═══ Dash shield REMOVED in iter-98 ═══
	# Pre-iter-98 the dash strike spawned a forward-facing cyan-gold
	# bubble companion (dash_shield). Iter-98 deleted it — the bubble
	# read as a "magic orb" and used the same color family as the
	# defensive parry shield while dash is an offensive ability.
	# test_iter98.gd owns the deletion contract.
	if ResourceLoader.exists("res://scenes/fx/dash_shield.tscn") or ResourceLoader.exists("res://scripts/dash_shield.gd"):
		push_error("FAIL: dash_shield files survived iter-98 deletion")
		ok = false
	else:
		print("OK dash_shield.* files deleted in iter-98 (superseded)")

	# ═══ main.gd dash_impact landing reverts to procedural ═══
	var main_src := FileAccess.get_file_as_string("res://scripts/main.gd")
	if main_src.contains("\"dash_impact\""):
		push_error("FAIL: main.gd still calls FxSprite.spawn with 'dash_impact' sheet (broken-square bug back)")
		ok = false
	else:
		print("OK main.gd no longer spawns dash_impact sprite sheet")
	if not main_src.contains("DASH_IMPACT_SCENE"):
		push_error("FAIL: main.gd doesn't preload DASH_IMPACT_SCENE for the procedural landing")
		ok = false
	elif not main_src.contains("DASH_IMPACT_SCENE.instantiate()"):
		push_error("FAIL: main.gd doesn't instantiate DASH_IMPACT_SCENE at dash landing")
		ok = false
	else:
		print("OK main.gd spawns procedural dash_impact.tscn at landing (no cell-boundary square)")

	# ═══ Runtime smoke — both scenes instantiate cleanly ═══
	var ps_scene := load("res://scenes/fx/parry_shield.tscn") as PackedScene
	if ps_scene == null:
		push_error("FAIL: parry_shield.tscn won't load")
		ok = false
	else:
		var ps: Node2D = ps_scene.instantiate() as Node2D
		if ps == null:
			push_error("FAIL: parry_shield instantiate failed")
			ok = false
		else:
			# API preserved.
			if not ps.has_method("setup"):
				push_error("FAIL: parry_shield missing setup() — hero.gd will crash on call")
				ok = false
			if not ps.has_method("shatter"):
				push_error("FAIL: parry_shield missing shatter() — hero.gd will crash on parry catch")
				ok = false
			# Test the calls don't error.
			ps.setup(Vector2.RIGHT)
			root.add_child(ps)
			print("OK ParryShield instantiates + setup() runs without errors")
			ps.queue_free()

	# iter-98 deleted DashShield. The runtime instantiate check is gone.
	print("SKIP DashShield instantiate (deleted in iter-98)")

	if ok:
		print("=== ITER 94 INTEGRATION PASSED ===")
	else:
		print("=== ITER 94 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
