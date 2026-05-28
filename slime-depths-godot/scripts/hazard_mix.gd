# Iter 253 / Wave 3 — HazardMix.
#
# Generic effect node spawned by HazardInteractions when two hazards'
# areas overlap and the pair appears in MIXING_MATRIX. The mix lives at
# the overlap centroid for a fixed lifetime and applies its reaction
# every tick to enemies + hero inside its radius. Visual signature is
# chosen per `mix_kind` so the player can identify the reaction at a
# glance.
#
# Five mix kinds (see hazard_interactions.gd for the matrix):
#
#   boiling_acid     — violet-orange disc + grey steam. Ticks 1 dmg to
#                      enemies + hero every TICK_INTERVAL. The "2× damage"
#                      framing in the design doc maps to "fast tick"
#                      (0.4s vs the contributing hazards' 0.5–0.7s
#                      cadences, so net dmg/s is higher).
#
#   electrified_font — violet disc + blue arc particles. Ticks 1 dmg to
#                      enemies every TICK_INTERVAL + applies a 0.3s
#                      soft-stun (slow with multiplier 0.0 → effectively
#                      can't move). Hero unaffected — this is an
#                      anti-mob mix that rewards funneling enemies into
#                      the overlap.
#
#   burning_spikes   — orange tint marker. The spike_pit script remains
#                      the damage source; this mix just applies a 2s
#                      burn status to any enemy it ticks over. Visual
#                      role is the "this spike pit is on fire" marker.
#
#   submerged_spikes — violet tint marker. Mirror of burning_spikes —
#                      applies a 1.5s slow status instead.
#
#   greater_fire     — small confirmation pip; the actual buff is
#                      applied to the underlying fire_pool by
#                      HazardInteractions._apply_greater_fire_buff.
#                      This node is a visual receipt only.
#
# Z-order: z=1, same as the hazards' ground footprints, so the mix
# layers on top of the floor decor but under hero / enemies / FX.
extends Node2D

# Field set by HazardInteractions BEFORE add_child so _ready can pick
# them up. mix_kind drives visual + behavior selection.
var mix_kind: String = ""
var radius: float = 24.0
var lifetime: float = 4.0

# Damage / status tunings — single source so the test can sanity-check
# without instantiating the scene.
const TICK_INTERVAL: float = 0.4
const TICK_DAMAGE: int = 1
const BURN_DURATION: float = 2.0
const SLOW_DURATION: float = 1.5
const STUN_DURATION: float = 0.3
const STUN_MULTIPLIER: float = 0.0  # soft-stun: enemy speed × 0

var _life: float = 0.0
var _tick: float = 0.0
# Per-enemy hit cooldown so two ticks per second don't double-up when an
# enemy crosses the mix boundary repeatedly. Maps instance_id → next
# eligible time.
var _next_enemy_tick: Dictionary = {}
# Mirror cooldown for the hero so boiling_acid doesn't ramp damage past
# the design intent (1 dmg per TICK_INTERVAL).
var _next_hero_tick: float = 0.0

# Visual children (lazily built in _ready based on mix_kind).
var _disc: Polygon2D = null
var _steam: CPUParticles2D = null
var _arc_lines: Array[Line2D] = []
var _ember_particles: CPUParticles2D = null

func _ready() -> void:
	_life = lifetime
	z_index = 2
	_build_visuals()

func _physics_process(delta: float) -> void:
	_life -= delta
	if _life <= 0.0:
		queue_free()
		return
	_tick -= delta
	if _tick <= 0.0:
		_apply_tick()
		_tick = TICK_INTERVAL
	# Pulse the disc alpha so the mix reads as ACTIVE during its lifetime.
	if _disc != null:
		var pulse: float = 0.55 + 0.30 * sin(_life * 6.0)
		_disc.modulate.a = pulse
	# Fade in the final 0.4s so disappearance reads as "spent" rather
	# than "yanked." Multiply on top of the pulse via modulate.a clamp.
	if _life < 0.4:
		var fade_t: float = clampf(_life / 0.4, 0.0, 1.0)
		modulate.a = fade_t
	# Electrified font — re-build the chain arcs each tick so they track
	# the current enemy positions. Visual only; damage is in _apply_tick.
	if mix_kind == "electrified_font":
		_update_arc_visuals()

# ──── Visual construction ────────────────────────────────────────────

# Build the visual node tree per mix_kind. Called once at _ready. Each
# branch composes Polygon2D / CPUParticles2D primitives — no external
# asset loads so a test can instantiate the script without the .tscn.
func _build_visuals() -> void:
	match mix_kind:
		"boiling_acid":
			_build_disc(Color(0.62, 0.30, 0.85, 0.62))
			_build_steam()
		"electrified_font":
			_build_disc(Color(0.45, 0.30, 0.85, 0.55))
		"burning_spikes":
			_build_disc(Color(1.0, 0.55, 0.18, 0.45))
			_build_embers(Color(1.0, 0.75, 0.30, 1.0))
		"submerged_spikes":
			_build_disc(Color(0.30, 0.15, 0.50, 0.52))
		"greater_fire":
			# Small bright confirmation pip — the actual buff is on the
			# underlying fire_pool. Keep this lightweight so it doesn't
			# fight the now-larger pool for attention.
			_build_disc(Color(1.0, 0.85, 0.45, 0.45))
			_build_embers(Color(1.0, 0.95, 0.55, 1.0))
		_:
			# Unknown kind — render a faint white placeholder so a
			# regression in the matrix surfaces visibly.
			_build_disc(Color(0.95, 0.95, 0.95, 0.30))

# Build the main disc polygon. 16-segment near-circle scaled to radius.
# Stored as `_disc` so _physics_process can pulse its modulate.
func _build_disc(disc_color: Color) -> void:
	_disc = Polygon2D.new()
	var pts: PackedVector2Array = PackedVector2Array()
	var segs: int = 16
	for i in range(segs):
		var a: float = TAU * float(i) / float(segs)
		# Slight 0.85 inner radius on odd points → jagged edge so the
		# disc reads as "energy field" not "static decal."
		var r: float = radius if (i % 2 == 0) else radius * 0.85
		pts.append(Vector2(cos(a), sin(a)) * r)
	_disc.polygon = pts
	_disc.color = disc_color
	add_child(_disc)

# Rising grey steam — boiling_acid's signature visual. Drifts upward
# from the disc. Sparse (amount=8) so it reads as "vapor escaping," not
# "fog machine."
func _build_steam() -> void:
	_steam = CPUParticles2D.new()
	_steam.amount = 8
	_steam.lifetime = 1.2
	_steam.preprocess = 0.4
	_steam.emission_shape = CPUParticles2D.EMISSION_SHAPE_SPHERE
	_steam.emission_sphere_radius = radius * 0.7
	_steam.direction = Vector2(0, -1)
	_steam.spread = 25.0
	_steam.gravity = Vector2(0, -8)
	_steam.initial_velocity_min = 14.0
	_steam.initial_velocity_max = 28.0
	_steam.damping_min = 0.4
	_steam.damping_max = 1.0
	_steam.scale_amount_min = 1.4
	_steam.scale_amount_max = 2.8
	# Build a soft grey-violet gradient at runtime so we don't need a
	# scene-file gradient resource.
	var grad: Gradient = Gradient.new()
	grad.offsets = PackedFloat32Array([0.0, 0.25, 0.75, 1.0])
	grad.colors = PackedColorArray([
		Color(0.55, 0.45, 0.55, 0.0),
		Color(0.62, 0.50, 0.65, 0.55),
		Color(0.40, 0.36, 0.45, 0.30),
		Color(0.20, 0.20, 0.25, 0.0),
	])
	_steam.color_ramp = grad
	_steam.z_index = 4
	add_child(_steam)

# Small ember particle emitter — used by burning_spikes + greater_fire
# to sell "fire is here." Tinted by mix_kind via the color arg.
func _build_embers(tint: Color) -> void:
	_ember_particles = CPUParticles2D.new()
	_ember_particles.amount = 10
	_ember_particles.lifetime = 0.6
	_ember_particles.preprocess = 0.2
	_ember_particles.emission_shape = CPUParticles2D.EMISSION_SHAPE_SPHERE
	_ember_particles.emission_sphere_radius = radius * 0.5
	_ember_particles.direction = Vector2(0, -1)
	_ember_particles.spread = 18.0
	_ember_particles.gravity = Vector2(0, -22)
	_ember_particles.initial_velocity_min = 28.0
	_ember_particles.initial_velocity_max = 56.0
	_ember_particles.scale_amount_min = 0.6
	_ember_particles.scale_amount_max = 1.4
	var grad: Gradient = Gradient.new()
	grad.offsets = PackedFloat32Array([0.0, 0.3, 1.0])
	grad.colors = PackedColorArray([
		Color(tint.r, tint.g, tint.b, 0.0),
		tint,
		Color(tint.r * 0.4, tint.g * 0.2, tint.b * 0.0, 0.0),
	])
	_ember_particles.color_ramp = grad
	_ember_particles.z_index = 3
	add_child(_ember_particles)

# Rebuild Line2D arc nodes between enemies inside the electrified_font.
# Called every physics frame for the electrified mix so arcs track
# enemy motion. Cheap: ≤ MAX_ARCS pairs * one Line2D each, all
# children of `self` so they're freed with the mix.
func _update_arc_visuals() -> void:
	const MAX_ARCS: int = 4
	# Clear previous arcs — Line2D nodes don't pool, so re-allocate each
	# tick is fine (≤ 4 nodes).
	for ln in _arc_lines:
		if is_instance_valid(ln):
			ln.queue_free()
	_arc_lines.clear()
	var tree: SceneTree = get_tree()
	if tree == null:
		return
	var enemies: Array[Node] = tree.get_nodes_in_group("enemies")
	var inside: Array = []
	for e in enemies:
		if not is_instance_valid(e) or not (e is Node2D):
			continue
		var e2d: Node2D = e as Node2D
		if e2d.global_position.distance_to(global_position) <= radius:
			inside.append(e2d)
	# Build arcs between consecutive enemies in `inside` (capped).
	var arcs_built: int = 0
	for k in range(inside.size() - 1):
		if arcs_built >= MAX_ARCS:
			break
		var a: Node2D = inside[k]
		var b: Node2D = inside[k + 1]
		var line: Line2D = Line2D.new()
		# Convert global enemy positions into mix-local space — Line2D
		# is parented to `self` so coordinates are relative.
		line.points = PackedVector2Array([
			a.global_position - global_position,
			b.global_position - global_position,
		])
		line.width = 1.6
		line.default_color = Color(0.65, 0.85, 1.0, 0.85)
		line.joint_mode = Line2D.LINE_JOINT_BEVEL
		line.antialiased = true
		line.z_index = 5
		add_child(line)
		_arc_lines.append(line)
		arcs_built += 1

# ──── Tick application ───────────────────────────────────────────────

# Apply the mix's effect to all valid targets inside `radius`. Called
# every TICK_INTERVAL. Handles enemies + hero per the matrix; greater_
# fire is a no-op here (the fire_pool buff is the gameplay payoff).
func _apply_tick() -> void:
	var tree: SceneTree = get_tree()
	if tree == null:
		return
	var now: float = Time.get_ticks_msec() / 1000.0
	# Enemies — common across most mixes.
	var enemies: Array[Node] = tree.get_nodes_in_group("enemies")
	for e in enemies:
		if not is_instance_valid(e) or not (e is Node2D):
			continue
		var e2d: Node2D = e as Node2D
		if e2d.global_position.distance_to(global_position) > radius:
			continue
		var eid: int = e.get_instance_id()
		var next: float = float(_next_enemy_tick.get(eid, 0.0))
		if now < next:
			continue
		_next_enemy_tick[eid] = now + TICK_INTERVAL * 0.9
		_apply_enemy_effect(e)
	# Hero — only some mixes affect the hero (boiling_acid does).
	if mix_kind == "boiling_acid":
		var heroes: Array[Node] = tree.get_nodes_in_group("hero")
		if heroes.size() > 0 and now >= _next_hero_tick:
			var hero: Node = heroes[0]
			if is_instance_valid(hero) and hero is Node2D:
				var h2d: Node2D = hero as Node2D
				if h2d.global_position.distance_to(global_position) <= radius:
					if hero.has_method("take_damage"):
						hero.take_damage(TICK_DAMAGE, global_position)
					_next_hero_tick = now + TICK_INTERVAL

# Apply the per-enemy mix effect. Damage routing uses take_hit (the
# canonical enemy damage entry — supports crits / source-position
# knockback). Status application uses apply_burn / apply_slow which
# exist on enemy.gd today.
func _apply_enemy_effect(enemy: Node) -> void:
	match mix_kind:
		"boiling_acid":
			if enemy.has_method("take_hit"):
				enemy.take_hit(TICK_DAMAGE, false, global_position)
		"electrified_font":
			if enemy.has_method("take_hit"):
				enemy.take_hit(TICK_DAMAGE, false, global_position)
			# Soft-stun via 0.0 slow multiplier for STUN_DURATION.
			# apply_slow uses min() on multiplier so a 0.0 overrides any
			# active partial slow for the duration.
			if enemy.has_method("apply_slow"):
				enemy.apply_slow(STUN_DURATION, STUN_MULTIPLIER)
		"burning_spikes":
			# No direct damage — the underlying spike_pit deals damage.
			# Apply burn so enemies passing over a burning spike pit get
			# the lingering DOT.
			if enemy.has_method("apply_burn"):
				enemy.apply_burn(BURN_DURATION)
		"submerged_spikes":
			if enemy.has_method("apply_slow"):
				enemy.apply_slow(SLOW_DURATION)
		"greater_fire":
			# No-op per design. The fire_pool buff carries the payoff.
			pass
		_:
			pass
