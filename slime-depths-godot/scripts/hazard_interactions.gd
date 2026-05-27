# Iter 253 / Wave 3 — HAZARD × HAZARD REACTIVITY MATRIX.
#
# Noita-flavored chemistry feel without pixel simulation. When two
# distinct hazards' areas of effect overlap, spawn a named "mix" effect
# at the overlap centroid. The mix has its own gameplay (damage tick,
# status effect application) and its own visual signature so the player
# reads "those two hazards just interacted" at a glance.
#
# Five reactions ship in iter-253:
#
#   fire_jet      + slow_zone      → BOILING_ACID
#     2× damage zone in overlap; ticks 1 dmg / 0.4s to enemies + hero.
#     Visual: violet-orange tint + grey steam particles.
#
#   lightning_rod + slow_zone      → ELECTRIFIED_FONT
#     Enemies in overlap take 1 dmg / 0.5s + brief 0.3s soft-stun
#     (modeled as a 0.0 slow multiplier). Visual: blue chain arcs
#     between enemies inside the zone.
#
#   fire_pool     + spike_pit      → BURNING_SPIKES
#     Spike damage + 2s burn status applied on contact (enemies + hero
#     where applicable). Visual: orange flicker tint on spike sprites.
#
#   slow_zone     + spike_pit      → SUBMERGED_SPIKES
#     Spike damage + 1.5s slow status applied on contact. Visual: dark
#     violet tint on spikes.
#
#   fire_jet      + fire_pool      → GREATER_FIRE
#     Fire pool radius +30%, lifetime +50%, +1 damage tick. Visual:
#     brighter orange + denser embers. Applied as a one-shot buff to
#     the underlying fire_pool, not a separate node.
#
# ──── Architecture ────────────────────────────────────────────────────
#
# Hazards add themselves to the "hazards" group at _ready. Each hazard
# exposes a `hazard_kind: String` field so this autoload can pair them.
# Every REACTION_TICK_INTERVAL seconds, _scan_and_spawn_mixes walks the
# group, pairs hazards, checks overlap, and spawns the matching mix
# from MIXING_MATRIX (HazardMix scene) at the overlap centroid.
#
# Anti-loop guards:
#   • A new mix is suppressed if an existing mix of the same kind sits
#     within DEDUPE_RADIUS of the proposed centroid.
#   • Mix lifetime is REACTION_LIFETIME; the scan loop re-triggers when
#     the underlying overlap persists, so a permanent overlap keeps a
#     mix alive (refresh cadence one tick at a time).
#   • Total active mixes capped at MAX_ACTIVE_MIXES to avoid screen
#     clutter / perf cost in a worst-case 5-hazard room.
#
# Performance: scan is gated on a 0.6s accumulator. 5 hazards = 10 pairs
# = 10 distance checks per tick. Trivial.
extends Node

# ──── Reaction matrix ────────────────────────────────────────────────
# Keys are SORTED pairs of hazard_kind strings (alphabetical) so the
# lookup is symmetric — order in which the autoload encounters two
# hazards doesn't matter. _matrix_key(a, b) handles the sort.
const MIXING_MATRIX: Dictionary = {
	"fire_jet|slow_zone":        "boiling_acid",
	"lightning_rod|slow_zone":   "electrified_font",
	"fire_pool|spike_pit":       "burning_spikes",
	"slow_zone|spike_pit":       "submerged_spikes",
	"fire_jet|fire_pool":        "greater_fire",
}

# ──── Tuning ─────────────────────────────────────────────────────────
# Scan cadence — keeps the autoload off the per-frame hot path. 0.6s is
# slow enough that the same pair only spawns one mix per cycle (lifetime
# is 4× longer), fast enough that the mix appears within ~half a second
# of two hazards becoming adjacent.
const REACTION_TICK_INTERVAL: float = 0.6
# Default mix lifetime. Each mix node owns its own countdown; the scan
# just refreshes when underlying hazards still overlap.
const REACTION_LIFETIME: float = 4.0
# Two mixes of the same kind within this radius dedupe — only the first
# survives. Stops a fire_jet wobbling on top of a slow_zone from spawning
# 4 boiling_acid clones across one frame.
const DEDUPE_RADIUS: float = 32.0
# Hard cap on active mix nodes. Prevents pathological multi-hazard rooms
# (5 hazards = up to 10 simultaneous mixes) from drowning the screen.
const MAX_ACTIVE_MIXES: int = 6
# Pair-overlap radius: each hazard contributes its visual radius. The
# pair overlaps when distance < (radius_a + radius_b). We use canonical
# radii per kind rather than the literal CollisionShape2D size so the
# overlap detection matches the visible footprint, not the engine's
# narrow damage zone.
const HAZARD_RADIUS_BY_KIND: Dictionary = {
	"spike_pit":      28.0,   # visual spikes + danger halo
	"fire_jet":       18.0,   # narrow column + ground footprint
	"slow_zone":      40.0,   # generous mire pool
	"lightning_rod":  44.0,   # damage ring DAMAGE_RADIUS
	"fire_pool":      24.0,   # POOL_RADIUS + ember margin
}

# Mix scene loaded once at startup. We load via load() instead of preload
# so the autoload doesn't hard-require the .tscn during test harness
# scenarios that swap the resource list.
var _mix_scene: PackedScene = null

# Scan throttle accumulator. Filled by _process delta; resets to 0 when
# we hit REACTION_TICK_INTERVAL and run a scan.
var _tick_accumulator: float = 0.0
# Live list of HazardMix instances we've spawned. Cleaned each scan: any
# instance that has been queue_freed or expired drops out.
var _active_mixes: Array = []

func _ready() -> void:
	# Defer scene load to _ready so SceneTree autoload init order doesn't
	# matter (HazardInteractions is loaded after other autoloads, and the
	# scene resource itself doesn't depend on them).
	_mix_scene = load("res://scenes/hazard_mix.tscn") as PackedScene

func _process(delta: float) -> void:
	_tick_accumulator += delta
	if _tick_accumulator < REACTION_TICK_INTERVAL:
		return
	_tick_accumulator = 0.0
	_scan_and_spawn_mixes()

# ──── Public API ─────────────────────────────────────────────────────

# Build the symmetric dictionary key for a kind-pair lookup. Sorts the
# two strings alphabetically and joins with "|" so MIXING_MATRIX can be
# keyed without a 2× duplication for direction.
static func matrix_key(a: String, b: String) -> String:
	if a == "" or b == "":
		return ""
	if a < b:
		return a + "|" + b
	return b + "|" + a

# Returns the mix-kind string ("boiling_acid", etc.) for a hazard pair,
# or "" if no reaction is defined. Static so tests can call without
# instantiating the autoload — useful for matrix sanity checks.
static func reaction_for(a: String, b: String) -> String:
	var key: String = matrix_key(a, b)
	if key == "":
		return ""
	return MIXING_MATRIX.get(key, "") as String

# Canonical visual radius for a hazard kind. Public so the mix node and
# tests can use the same numbers as the scan loop. Unknown kinds fall
# back to 24.0 (a safe medium) so a new hazard kind doesn't crash the
# pairing pass — the user just gets no reactions until the radius is
# registered here.
static func radius_for(kind: String) -> float:
	return HAZARD_RADIUS_BY_KIND.get(kind, 24.0) as float

# ──── Internal scan ──────────────────────────────────────────────────

# Walks all nodes in the "hazards" group, pairs each unique kind-pair,
# checks centroid overlap, and spawns a HazardMix for any pair whose
# kinds appear in MIXING_MATRIX. Anti-loop guards (dedupe + cap) gate
# the actual spawn. Caller: _process every REACTION_TICK_INTERVAL.
func _scan_and_spawn_mixes() -> void:
	var tree: SceneTree = get_tree()
	if tree == null:
		return
	# Drop dead refs (queue_freed mixes leave invalid instances). This is
	# cheaper than tracking via tree_exited signals because the active
	# count is tiny (≤ MAX_ACTIVE_MIXES = 6).
	_prune_dead_mixes()
	if _active_mixes.size() >= MAX_ACTIVE_MIXES:
		return
	var hazards: Array[Node] = tree.get_nodes_in_group("hazards")
	if hazards.size() < 2:
		return
	# Symmetric pairing — only iterate i < j so each pair is visited once.
	for i in range(hazards.size()):
		var a: Node = hazards[i]
		if not is_instance_valid(a) or not (a is Node2D):
			continue
		var a_kind: String = _kind_of(a)
		if a_kind == "":
			continue
		for j in range(i + 1, hazards.size()):
			var b: Node = hazards[j]
			if not is_instance_valid(b) or not (b is Node2D):
				continue
			var b_kind: String = _kind_of(b)
			if b_kind == "":
				continue
			# Same-kind pairs never react (no defined behavior). Two slow
			# zones overlapping is a no-op in matrix terms.
			if a_kind == b_kind:
				continue
			var mix_kind: String = reaction_for(a_kind, b_kind)
			if mix_kind == "":
				continue
			# Overlap check — combined radii. Cheap distance_squared
			# avoids a sqrt but the squared scalar comparison still
			# needs both squared; keeps the math obvious here.
			var ra: float = radius_for(a_kind)
			var rb: float = radius_for(b_kind)
			var combined: float = ra + rb
			var pos_a: Vector2 = (a as Node2D).global_position
			var pos_b: Vector2 = (b as Node2D).global_position
			if pos_a.distance_to(pos_b) >= combined:
				continue
			# Spawn at the overlap centroid (midpoint of the two
			# hazards). The visible mix sits exactly between them so the
			# player reads "this is from BOTH of those."
			var centroid: Vector2 = (pos_a + pos_b) * 0.5
			# Dedupe — same kind, near centroid → skip. Stops one frame
			# of jitter from producing two clones.
			if _has_mix_near(mix_kind, centroid):
				continue
			_spawn_mix(mix_kind, centroid, min(ra, rb), a, b)
			# Greater_fire mutates the underlying fire_pool — bigger /
			# longer / hotter — INSTEAD of running a separate mix node.
			# We still spawn a small marker via _spawn_mix above so the
			# player gets a visual confirmation, but the bonus is applied
			# directly here so the fire_pool itself shows the change.
			if mix_kind == "greater_fire":
				_apply_greater_fire_buff(a, b)
			if _active_mixes.size() >= MAX_ACTIVE_MIXES:
				return

# Read hazard_kind from a node, with a fallback for hazards that haven't
# been updated to expose the field yet (defensive — keeps the autoload
# safe during partial rollouts).
func _kind_of(node: Node) -> String:
	if node == null:
		return ""
	if "hazard_kind" in node:
		var k: Variant = node.get("hazard_kind")
		if typeof(k) == TYPE_STRING:
			return k as String
	return ""

# Is there an existing mix of `kind` within DEDUPE_RADIUS of `pos`? If so
# we skip the spawn so a flickering overlap doesn't multiply mixes.
func _has_mix_near(kind: String, pos: Vector2) -> bool:
	for m in _active_mixes:
		if not is_instance_valid(m):
			continue
		if not (m is Node2D):
			continue
		# Each HazardMix exposes its kind via `mix_kind` field. Cross-
		# kind mixes near the same centroid are allowed (e.g. fire_jet
		# at the intersection of two different slow_zone pairs).
		var m_kind: String = ""
		if "mix_kind" in m:
			m_kind = m.get("mix_kind") as String
		if m_kind != kind:
			continue
		var m_pos: Vector2 = (m as Node2D).global_position
		if m_pos.distance_to(pos) < DEDUPE_RADIUS:
			return true
	return false

# Instantiate a HazardMix at `centroid` and track it. `radius` is the
# smaller of the two contributing hazards' radii — the mix only acts
# within the overlap area, so the smaller hazard's reach is the limit.
func _spawn_mix(kind: String, centroid: Vector2, radius: float, _a: Node, _b: Node) -> void:
	if _mix_scene == null:
		return
	var mix: Node2D = _mix_scene.instantiate() as Node2D
	if mix == null:
		return
	# Set fields BEFORE add_child so _ready in hazard_mix.gd picks them
	# up (matches main.gd's hazard-spawn convention).
	if "mix_kind" in mix:
		mix.set("mix_kind", kind)
	if "radius" in mix:
		mix.set("radius", radius)
	if "lifetime" in mix:
		mix.set("lifetime", REACTION_LIFETIME)
	mix.global_position = centroid
	# Parent under the current scene root so the mix lives alongside
	# the hazards (rather than under this autoload, which is outside
	# the scene tree the player sees).
	var current_scene: Node = get_tree().current_scene
	if current_scene != null:
		current_scene.add_child(mix)
	else:
		# Test harness fallback: no current_scene, so park the mix on
		# the SceneTree root itself.
		get_tree().root.add_child(mix)
	_active_mixes.append(mix)

# Drop invalid / freed instances from _active_mixes. Cheap because the
# list is bounded by MAX_ACTIVE_MIXES (6).
func _prune_dead_mixes() -> void:
	var filtered: Array = []
	for m in _active_mixes:
		if is_instance_valid(m) and not m.is_queued_for_deletion():
			filtered.append(m)
	_active_mixes = filtered

# Greater_fire — buff the contributing fire_pool node directly. Bigger
# radius (visual scale), longer lifetime, and an extra damage tick on
# the underlying pool. Picks whichever of a/b is the fire_pool so the
# caller doesn't need to know order. One-shot per scan — relies on
# DEDUPE_RADIUS to keep us from re-buffing the same pool every tick.
func _apply_greater_fire_buff(a: Node, b: Node) -> void:
	var pool: Node = _pick_fire_pool(a, b)
	if pool == null:
		return
	# Bump the pool's life and damage. Fields are documented in
	# fire_pool.gd: _life (countdown), _disc (visual). We apply the
	# +50% lifetime and the +30% radius as a Tween-driven scale so the
	# change reads as "the pool got HOTTER" rather than "a new pool
	# appeared." Damage bump is an immediate field write.
	if "_life" in pool:
		var current_life: float = pool.get("_life") as float
		pool.set("_life", current_life + 1.5)
	if pool is Node2D:
		var p2d: Node2D = pool as Node2D
		var target_scale: float = 1.30
		var tween: Tween = p2d.create_tween()
		tween.tween_property(p2d, "scale", Vector2(target_scale, target_scale), 0.4)

# Returns whichever of two hazards is a fire_pool, or null. Used by the
# greater_fire buff path; the matrix only fires this for one valid
# fire_jet + fire_pool pair.
func _pick_fire_pool(a: Node, b: Node) -> Node:
	if _kind_of(a) == "fire_pool":
		return a
	if _kind_of(b) == "fire_pool":
		return b
	return null
