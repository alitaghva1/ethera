# StoneShardBurst — iter 72 redesign FX for IRON SKIN. A brief grey-cream
# spark burst spawned at the hero when an incoming hit gets reduced by
# iron_skin's flat damage-taken-reduction. Reads as "the blow chipped off
# stone." Pairs cleanly with the existing blood_drop ouch cue: blood
# spatters for the wound, stone sparks fly for the deflection — both can
# appear on the same hit (when the hit was partially absorbed) so the
# player feels both "I took damage" and "my armor saved some."
#
# Why a fixed-geometry Polygon2D burst (vs CPUParticles2D):
# - The shards are FEW (6 of them) and need to fly along DETERMINISTIC
#   tangent angles to read as ricocheting fragments rather than smoke.
# - Polygon2D + a per-frame transform tween is fewer moving parts than
#   wrangling a CPUParticles2D for a 0.4s effect with only 6 particles.
# - Mirrors blood_drop's "small fixed scene" idiom — keeps the FX kit
#   readable.
#
# Setup contract: no setup call required — the shards are pre-baked into
# the scene at fixed positions in local space, and _ready() drives the
# tween outward from the spawn point.
class_name StoneShardBurst
extends Node2D

const LIFETIME: float = 0.45
# How far each shard flies outward in local space.
const SHARD_REACH: float = 28.0
# Number of shards radiating out.
const SHARD_COUNT: int = 6
# Local-space radius of each shard polygon.
const SHARD_SIZE: float = 4.5

var _elapsed: float = 0.0
var _shards: Array[Polygon2D] = []
var _shard_dirs: Array[Vector2] = []
var _initialized: bool = false

func _ready() -> void:
	# Iter 69 — z_index 2 puts the burst on the standard FX layer.
	z_index = 2
	_build_shards()
	_initialized = true

# Build SHARD_COUNT small polygons distributed evenly around the spawn
# point. Each is colored a stony grey-cream so the visual reads as
# "armor fragments" rather than blood or fire.
func _build_shards() -> void:
	for i in range(SHARD_COUNT):
		var angle: float = (TAU / float(SHARD_COUNT)) * float(i) + randf_range(-0.15, 0.15)
		var dir: Vector2 = Vector2(cos(angle), sin(angle))
		_shard_dirs.append(dir)
		var shard: Polygon2D = Polygon2D.new()
		# Quad polygon — 4 verts make a small chunky shard rather than a
		# circle (more "broken stone" than "ember").
		var verts: PackedVector2Array = PackedVector2Array()
		for j in range(4):
			var a: float = (TAU / 4.0) * float(j) + PI / 4.0
			verts.append(Vector2(cos(a), sin(a)) * SHARD_SIZE)
		shard.polygon = verts
		shard.color = Color(0.78, 0.74, 0.65, 0.95)
		# Spawn at origin, will tween outward in _process.
		shard.position = Vector2.ZERO
		add_child(shard)
		_shards.append(shard)

func _process(delta: float) -> void:
	if not _initialized:
		return
	_elapsed += delta
	var t: float = _elapsed / LIFETIME
	if t >= 1.0:
		queue_free()
		return
	# Ease-out: snaps outward fast, decelerates. Same curve as the ring FX
	# for kit consistency.
	var s_t: float = 1.0 - pow(1.0 - t, 2.2)
	var reach: float = SHARD_REACH * s_t
	# Fade — shards stay visible the whole flight but lose alpha toward
	# the end so they vanish on the deceleration.
	var alpha: float = 0.95 * (1.0 - pow(t, 1.8))
	# Spin — slight rotational drift so the shards tumble visibly.
	var spin: float = t * 1.8
	for i in range(_shards.size()):
		var shard: Polygon2D = _shards[i]
		if shard == null:
			continue
		shard.position = _shard_dirs[i] * reach
		shard.rotation = spin * (1.0 if i % 2 == 0 else -1.0)
		var c: Color = shard.color
		c.a = alpha
		shard.color = c
