extends SceneTree

# Iter 154 — Enemy projectile motion trail.
#
# Pre-iter-154 the magenta orb projectile streaked in a straight line
# with no visible tail — felt floaty/uncommitted, especially the
# fast bonecap shots that crossed the room in under 0.3s. A bolt
# without a trail reads as "geometric circle moving across a
# background," not as "energy bolt with momentum."
#
# Genre cue: Isaac tears, Hades cast/special projectiles, every
# bullet-hell game's enemy bullets all have a particle trail. The
# trail does double duty:
#   1. Reinforces speed visually — a 8-particle stream behind a
#      fast bolt reads as "this is moving FAST"
#   2. Improves readability — the trail line traces the bolt's
#      recent path, helping the player parse where it came from
#      and where it's going
#
# Iter-154 adds a CPUParticles2D Trail child to projectile.tscn:
#   • amount 12, lifetime 0.28s — short trail (the bolt outruns
#     the particles inside a tenth of a second)
#   • direction (-1, 0) in local coords — emits BACKWARDS along the
#     projectile's local +X. The script already rotates the node to
#     face velocity (line 134: rotation = velocity.angle()), so
#     local -X is behind the bolt in world space.
#   • local_coords = false — bakes each particle's world position at
#     emit time. Particles stay in world space as the bolt races
#     forward → "left behind" read instead of "stuck to me."
#   • Color ramp matches the orb's magenta-purple modulate so the
#     trail reads as the SAME entity decaying, not separate FX.
func _initialize() -> void:
	var ok := true

	var tscn := FileAccess.get_file_as_string("res://scenes/projectile.tscn")

	# ═══ Trail CPUParticles2D node present ═══
	if "[node name=\"Trail\" type=\"CPUParticles2D\" parent=\".\"]" not in tscn:
		push_error("FAIL: projectile.tscn should contain a Trail CPUParticles2D node")
		ok = false

	# ═══ Trail emits backwards in local coords ═══
	if "direction = Vector2(-1, 0)" not in tscn:
		push_error("FAIL: trail direction should be Vector2(-1, 0) — backwards along projectile's local +X")
		ok = false
	if "local_coords = false" not in tscn:
		push_error("FAIL: trail local_coords must be false so particles stay in world space")
		ok = false

	# ═══ Particle counts + lifetime ═══
	if "amount = 12" not in tscn:
		push_error("FAIL: trail amount should be 12")
		ok = false
	if "lifetime = 0.28" not in tscn:
		push_error("FAIL: trail lifetime should be 0.28s")
		ok = false

	# ═══ Color ramp resource exists ═══
	if "[sub_resource type=\"Gradient\" id=\"trail_grad\"]" not in tscn:
		push_error("FAIL: missing trail_grad Gradient sub_resource")
		ok = false
	# Magenta-purple family (matches orb modulate)
	if "1.0, 0.55, 1.0, 1.0" not in tscn:
		push_error("FAIL: trail gradient should start with magenta (1.0, 0.55, 1.0, 1.0)")
		ok = false

	# ═══ load_steps incremented (was 7, now 9 for the 2 new sub_resources) ═══
	if "load_steps=9" not in tscn:
		push_error("FAIL: load_steps should be 9 (incremented from 7 by trail_grad + Trail)")
		ok = false

	# ═══ Runtime — projectile scene still loads with the new trail ═══
	var scene: PackedScene = load("res://scenes/projectile.tscn")
	if scene == null:
		push_error("FAIL: projectile.tscn no longer loads with trail addition")
		ok = false
	else:
		var inst: Node = scene.instantiate()
		if inst == null:
			push_error("FAIL: projectile.tscn doesn't instantiate")
			ok = false
		else:
			if inst.get_node_or_null("Trail") == null:
				push_error("FAIL: instantiated projectile missing Trail child")
				ok = false
			inst.queue_free()

	if ok:
		print("OK projectile trail: 12-particle magenta tail trailing behind each bolt")
		print("=== ITER 154 INTEGRATION PASSED ===")
	else:
		print("=== ITER 154 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
