# SpawnBurst — iter 86 immersion pass. Small companion FX spawned
# alongside an enemy's iter-15 sprite-fade spawn-in. Reads as "the
# floor briefly opens, the enemy steps through."
#
# Decisively NOT a portal — that was the iter-75-78 experiment that
# four iters of patching never got right. The lesson from that saga:
# spawn-in FX should feel like an ATTRIBUTE of the enemy itself
# (something they bring with them), not a SEPARATE wave-level system
# that competes for attention.
#
# Composition (~24 px total footprint):
#   FloorCrack  — small irregular dark polygon under the spawn point,
#                 alpha-pulses in then fades out across ~0.5s. Drawn
#                 in _draw() (no scene-tree child) so per-instance
#                 vertex jitter doesn't bloat the .tscn.
#   Wisps       — CPUParticles2D scene child. 7-particle one-shot
#                 burst rising AROUND (not AT) the spawn point with
#                 mild outward drift, dark-indigo color ramp, ~0.55s
#                 lifetime. Sized so wisps emerge from a 12-px ring
#                 at the enemy's feet without obscuring the sprite.
#
# Lifecycle: spawned at SPAWN_BURST_LIFETIME=0.6s, self-frees after.
class_name SpawnBurst
extends Node2D

# Total visible lifetime in seconds. Slightly longer than enemy.gd's
# SPAWN_IN_DURATION (0.35s post iter-79) so the wisps trail OFF after
# the enemy is fully materialized — gives the moment a clean tail.
const LIFETIME: float = 0.60

# Floor crack render — small irregular polygon. Tunable so the crack
# stays subtle (it's a companion to the enemy fade, not the main event).
const CRACK_RADIUS: float = 14.0
const CRACK_VERTS: int = 10
const CRACK_PEAK_ALPHA: float = 0.55

# Y offset so the crack sits at the enemy's FEET, not center. Enemies
# vary in height; we go with a conservative +6 that works for most
# small/medium enemies. Bosses look fine with the offset too since
# their feet/base are typically near sprite-origin Y.
const FEET_Y_OFFSET: float = 6.0

var _age: float = 0.0
# Per-vertex jitter precomputed in _ready so the crack silhouette
# stays stable across frames (same iter-83 BloodMark pattern).
var _vert_jitter: PackedFloat32Array = PackedFloat32Array()

static func spawn(host: Node, world_pos: Vector2) -> SpawnBurst:
	var scene: PackedScene = load("res://scenes/fx/spawn_burst.tscn") as PackedScene
	if scene == null:
		return null
	var b: SpawnBurst = scene.instantiate() as SpawnBurst
	if b == null:
		return null
	# Spawn AT the world_pos. We offset the crack draw by FEET_Y_OFFSET
	# inside _draw rather than globally so wisps still emit around the
	# enemy's center, not below its feet.
	b.global_position = world_pos
	# z_index = 1 (above floor wash, below decor/hero/enemy sprites)
	# set BEFORE add_child so the first frame renders at the right
	# layer — same pattern as iter-83 BloodMark.
	b.z_index = 1
	host.add_child(b)
	return b

func _ready() -> void:
	# Precompute per-vertex jitter for the crack — random radial
	# offsets so the silhouette reads as an organic crack pattern
	# rather than a clean polygon.
	_vert_jitter.resize(CRACK_VERTS)
	for i in range(CRACK_VERTS):
		_vert_jitter[i] = randf_range(0.65, 1.15)
	queue_redraw()

func _process(delta: float) -> void:
	_age += delta
	queue_redraw()
	if _age >= LIFETIME:
		queue_free()

func _draw() -> void:
	# Alpha envelope — fade in over the first 25%, hold for the middle,
	# fade out over the last 35%. The crack is visible THROUGHOUT the
	# enemy's spawn-in fade.
	var t: float = _age / LIFETIME
	var alpha_env: float
	if t < 0.25:
		alpha_env = t / 0.25
	elif t < 0.65:
		alpha_env = 1.0
	else:
		alpha_env = 1.0 - (t - 0.65) / 0.35
	alpha_env = clampf(alpha_env, 0.0, 1.0)
	# Irregular polygon at the enemy's feet — dark indigo, alpha-modulated.
	var pts: PackedVector2Array = PackedVector2Array()
	# Y-squashed for ground-projected feel (matches the iter-83 blood
	# mark convention: floor marks read as ellipses, not circles).
	const Y_SQUASH: float = 0.45
	for i in range(CRACK_VERTS):
		var ang: float = (TAU / float(CRACK_VERTS)) * float(i)
		var j: float = _vert_jitter[i]
		pts.append(Vector2(
			cos(ang) * CRACK_RADIUS * j,
			sin(ang) * CRACK_RADIUS * Y_SQUASH * j + FEET_Y_OFFSET,
		))
	var crack_col: Color = Color(0.18, 0.12, 0.28, CRACK_PEAK_ALPHA * alpha_env)
	draw_colored_polygon(pts, crack_col)
