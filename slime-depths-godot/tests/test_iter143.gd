extends SceneTree

# Iter 143 — Pickup celebration burst.
#
# Pre-iter-143 every Events.pickup_claimed fired the same hit_spark in
# fx.gd._on_pickup_claimed — an 8-particle gold spray with no ring.
# The comment in the code literally said "reuse hit-spark gold for now
# — a dedicated pickup burst can land later when relic art is finalized."
# That "later" is now.
#
# Genre baseline: relic / boon pickups in Hades and item pickups in
# Isaac both get a CELEBRATION beat distinct from generic gold drops.
# Hades does a ring + radiant golden burst; Isaac does a small burst
# with a bright "ding." The shared trait: the player should FEEL the
# acquisition, not just see a number tick up.
#
# Iter-143 introduces PickupBurst — a gold-palette equivalent of
# death_pulse: two concentric Line2D rings (cream-gold core under deep
# amber halo) expanding outward over 0.4s + 14 chunky gold sparks (vs
# hit_spark's 8 small sparks). Distinct from:
#   • death_pulse / death_burst (red-blood family) — different semantic
#   • crit splash ring (saturated red-orange) — different combat beat
#   • hit_spark (small gold) — still spawns for gold drops
#
# Routing in fx.gd._on_pickup_claimed:
#   • RELIC (in GameState.RELIC_REGISTRY) OR shrine_* → PICKUP_BURST
#   • gold chest drops, future keys, anything else → HIT_SPARK
# Filter mirrors main.gd's own pickup gate at _on_pickup_claimed line
# ~2580 so the two layers agree on what "counts" as a real acquisition.
func _initialize() -> void:
	var ok := true

	var fx_gd := FileAccess.get_file_as_string("res://scripts/fx.gd")

	# ═══ Pickup burst scene loads ═══
	var burst_scene: PackedScene = load("res://scenes/fx/pickup_burst.tscn")
	if burst_scene == null:
		push_error("FAIL: pickup_burst.tscn failed to load")
		ok = false
	else:
		# Sanity-check the script attaches and instantiates cleanly.
		var inst: Node = burst_scene.instantiate()
		if inst == null:
			push_error("FAIL: pickup_burst.tscn doesn't instantiate")
			ok = false
		else:
			if not (inst is Node2D):
				push_error("FAIL: pickup_burst should be a Node2D")
				ok = false
			# Halo + Core children present
			if inst.get_node_or_null("Halo") == null:
				push_error("FAIL: PickupBurst missing Halo Line2D child")
				ok = false
			if inst.get_node_or_null("Core") == null:
				push_error("FAIL: PickupBurst missing Core Line2D child")
				ok = false
			if inst.get_node_or_null("CPUParticles2D") == null:
				push_error("FAIL: PickupBurst missing CPUParticles2D child")
				ok = false
			inst.queue_free()

	# ═══ fx.gd preloads the new scene ═══
	if "PICKUP_BURST_SCENE: PackedScene = preload(\"res://scenes/fx/pickup_burst.tscn\")" not in fx_gd:
		push_error("FAIL: fx.gd should preload PICKUP_BURST_SCENE")
		ok = false

	# ═══ Routing logic uses RELIC_REGISTRY + shrine_ prefix ═══
	if "GameState.RELIC_REGISTRY.has(_name)" not in fx_gd:
		push_error("FAIL: pickup routing should gate on GameState.RELIC_REGISTRY.has(_name)")
		ok = false
	if "_name.begins_with(\"shrine_\")" not in fx_gd:
		push_error("FAIL: pickup routing should also include shrine_ prefix")
		ok = false
	if "_spawn(PICKUP_BURST_SCENE, world_pos)" not in fx_gd:
		push_error("FAIL: relic/shrine branch should spawn PICKUP_BURST_SCENE")
		ok = false
	# Legacy hit_spark fallback for gold drops, etc.
	var pickup_func_idx: int = fx_gd.find("func _on_pickup_claimed(world_pos: Vector2, _name: String)")
	if pickup_func_idx < 0:
		push_error("FAIL: _on_pickup_claimed function missing")
		ok = false
	else:
		var next_func_idx: int = fx_gd.find("\nfunc ", pickup_func_idx + 1)
		if next_func_idx < 0:
			next_func_idx = fx_gd.length()
		var body: String = fx_gd.substr(pickup_func_idx, next_func_idx - pickup_func_idx)
		if "_spawn(HIT_SPARK_SCENE, world_pos)" not in body:
			push_error("FAIL: non-relic fallback should still spawn HIT_SPARK_SCENE")
			ok = false

	# ═══ pickup_burst.gd has expected constants + lifecycle ═══
	var pickup_gd := FileAccess.get_file_as_string("res://scripts/pickup_burst.gd")
	if "DURATION: float = 0.4" not in pickup_gd:
		push_error("FAIL: pickup_burst.gd should use DURATION = 0.4 (between dash 0.3 and death 0.6)")
		ok = false
	if "RING_SCALE_END: float = 2.75" not in pickup_gd:
		push_error("FAIL: pickup_burst.gd should use RING_SCALE_END = 2.75")
		ok = false
	if "z_index = 2" not in pickup_gd:
		push_error("FAIL: pickup_burst.gd should set z_index = 2 (matches dash_impact/death_pulse layer)")
		ok = false
	if "queue_free()" not in pickup_gd:
		push_error("FAIL: pickup_burst.gd must self-destruct via queue_free at lifetime end")
		ok = false

	if ok:
		print("OK pickup celebration: concentric gold rings + 14 sparks for relic/shrine claims")
		print("=== ITER 143 INTEGRATION PASSED ===")
	else:
		print("=== ITER 143 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
