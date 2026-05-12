extends SceneTree

# Iter 84 — world-grounding immersion pass. Two pieces:
#   1. Pillar floor shadow (pillars were the only major obstacle still
#      missing a ground shadow — walls, chests, enemies, hero all have one)
#   2. Hero footstep dust on every step (audio was already there;
#      visual companion was missing)
func _initialize() -> void:
	var ok := true

	# ═══ Pillar shadow ═══

	var pillar_scene := load("res://scenes/pillar.tscn")
	if pillar_scene == null:
		push_error("FAIL: pillar.tscn failed to load")
		ok = false
		quit(1)
		return
	print("OK pillar.tscn loads")

	# Instantiate and look for the Shadow child node.
	var host := Node2D.new()
	root.add_child(host)
	var pillar: Node = pillar_scene.instantiate()
	host.add_child(pillar)
	var shadow: Node = pillar.get_node_or_null("Shadow")
	if shadow == null:
		push_error("FAIL: pillar.tscn missing Shadow child node")
		ok = false
	elif not (shadow is Sprite2D):
		push_error("FAIL: pillar Shadow should be Sprite2D, got %s" % shadow.get_class())
		ok = false
	else:
		print("OK pillar has Shadow Sprite2D child")
		# Shadow should be DARK (low modulate.r/g/b) with partial alpha.
		var spr: Sprite2D = shadow as Sprite2D
		var mod: Color = spr.modulate
		if mod.r > 0.1 or mod.g > 0.1 or mod.b > 0.1:
			push_error("FAIL: pillar Shadow modulate not dark (got %s)" % str(mod))
			ok = false
		elif mod.a < 0.3 or mod.a > 0.8:
			push_error("FAIL: pillar Shadow alpha out of 0.3-0.8 sweet spot (got %s)" % mod.a)
			ok = false
		else:
			print("OK pillar Shadow modulate is dark with subtle alpha (%s)" % str(mod))
		# Y offset positive (below pillar base).
		if spr.position.y < 0.0:
			push_error("FAIL: pillar Shadow Y offset should be positive (below base), got %s" % spr.position.y)
			ok = false
		else:
			print("OK pillar Shadow Y offset is below base (%s)" % spr.position.y)

	# ═══ Footstep dust ═══

	var dust_scene := load("res://scenes/fx/footstep_dust.tscn")
	if dust_scene == null:
		push_error("FAIL: footstep_dust.tscn failed to load")
		ok = false
	else:
		print("OK footstep_dust.tscn loads")

	var dust_script := load("res://scripts/footstep_dust.gd")
	if dust_script == null:
		push_error("FAIL: footstep_dust.gd failed to load")
		ok = false
	elif not dust_script.has_method("spawn"):
		push_error("FAIL: FootstepDust missing static spawn()")
		ok = false
	else:
		print("OK FootstepDust has static spawn()")

	# Runtime smoke — instantiate at a position via the static factory.
	var dust = dust_script.spawn(host, Vector2(640, 384))
	if dust == null:
		push_error("FAIL: FootstepDust.spawn returned null")
		ok = false
	else:
		print("OK FootstepDust.spawn instantiates + parents to host")

	# Hero.gd hooks the spawn at the step beat.
	var hero_src := FileAccess.get_file_as_string("res://scripts/hero.gd")
	var step_idx: int = hero_src.find("Events.hero_stepped.emit")
	if step_idx < 0:
		push_error("FAIL: hero.gd no longer emits hero_stepped")
		ok = false
	else:
		# Check the window right AFTER the emit for the dust spawn call.
		var window: String = hero_src.substr(step_idx, 600)
		if not window.contains("FootstepDust.spawn"):
			push_error("FAIL: hero.gd doesn't spawn FootstepDust at the step beat")
			ok = false
		else:
			print("OK hero.gd spawns FootstepDust on Events.hero_stepped")

	# Confirm the spawn uses get_parent() (= main scene) so dust stays
	# in world space, not parented to hero (which would drag it along).
	if not hero_src.contains("var parent_for_dust"):
		push_error("FAIL: hero.gd should resolve get_parent() for footstep dust host")
		ok = false
	else:
		print("OK hero.gd parents footstep dust under main (world space)")

	if ok:
		print("=== ITER 84 INTEGRATION PASSED ===")
	else:
		print("=== ITER 84 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
