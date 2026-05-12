# BloodMark — iter 83 immersion pass: persistent floor marks left by
# enemy deaths. Sits at z = -1 (above floor wash, below decor/hero) so
# the room visibly accumulates battle damage through a wave.
#
# Two-layer render: wide soft halo + smaller saturated core. Matches the
# JS reference (slime-depths/src/room.js drawRoomMarks, lines 686-712):
# outer ellipse with low alpha provides the soft blood-pool feel; inner
# ellipse saturates the center so it reads as "wet splat" instead of a
# faded stain. Per-instance jitter on vertex radii breaks the symmetry
# so no two marks look identical.
#
# Self-frees after FULL_LIFE (30s). Alpha fades from FADE_START on, so
# marks earlier in a wave have faded by wave-clear — the room feels
# lived-in without becoming visually noisy by room exit.
class_name BloodMark
extends Node2D

# Total visible lifetime. 30s is long enough that the marks survive a
# full multi-wave room (~25-30s) so the player sees the battle damage
# accumulate, short enough that they fade by the next room.
const FULL_LIFE: float = 30.0

# When alpha begins easing toward 0. 20s in — leaves a 10s fade tail.
const FADE_START: float = 20.0

# Pool size + per-instance jitter so each splat has unique silhouette.
const RADIUS_BASE: float = 16.0
const RADIUS_JITTER: float = 4.0

# How many vertices per polygon ring. Higher = smoother, but blood
# pools want to read irregular not perfect — keep low.
const POLY_VERTS: int = 14

# Per-vertex radial jitter strength. 0.85-1.10 of base radius gives
# the splat an irregular outline without making it unreadable.
const VERT_JITTER_LOW: float = 0.85
const VERT_JITTER_HIGH: float = 1.10

# Halo vs core alpha. Halo is the soft outer ring at low alpha; core
# is the inner saturated splash. Together they read as a wet pool.
const HALO_ALPHA: float = 0.45
const CORE_ALPHA: float = 0.78

# Y-scale on the ellipse so the pool reads as ground-projected (looks
# at from above with foreshortening) rather than a perfect circle.
const Y_SQUASH: float = 0.50

# Default blood color — dark crimson. Spawn() can override per enemy
# type (scorch black for ember enemies, grey-purple for undead, etc.)
# but the current call site uses the default for all enemies.
const DEFAULT_COLOR: Color = Color(0.55, 0.10, 0.15)

var _color: Color = DEFAULT_COLOR
var _radius: float = RADIUS_BASE
var _age: float = 0.0
# Per-instance vertex jitter offsets, computed in _ready so the shape
# stays consistent across frames (vs randf in _draw which would wobble).
var _vert_jitter: PackedFloat32Array = PackedFloat32Array()

# Static factory — mirrors AttackFeel / SpawnPortal patterns. Spawn the
# scene, randomize per-instance shape, parent under `host`.
static func spawn(host: Node, world_pos: Vector2, color: Color = DEFAULT_COLOR) -> BloodMark:
	var scene: PackedScene = load("res://scenes/fx/blood_mark.tscn") as PackedScene
	if scene == null:
		return null
	var m: BloodMark = scene.instantiate() as BloodMark
	if m == null:
		return null
	m.global_position = world_pos + Vector2(0, 4)  # slight Y offset — pool below body
	m._color = color
	m._radius = RADIUS_BASE + randf_range(-RADIUS_JITTER, RADIUS_JITTER)
	# Set z_index BEFORE add_child so it's correct from the first
	# frame (vs waiting for _ready, which defers a frame and lets the
	# mark briefly render at z=0 — on top of decor/hero — before
	# snapping back to z=-1).
	m.z_index = -1
	m.rotation = randf() * TAU
	host.add_child(m)
	return m

func _ready() -> void:
	# z_index + rotation already set by spawn() before add_child. _ready
	# only handles per-instance jitter precomputation.
	# Precompute the per-vertex jitter so the silhouette stays stable
	# across frames (re-rolling in _draw would wobble the shape).
	_vert_jitter.resize(POLY_VERTS)
	for i in range(POLY_VERTS):
		_vert_jitter[i] = randf_range(VERT_JITTER_LOW, VERT_JITTER_HIGH)
	queue_redraw()

func _process(delta: float) -> void:
	_age += delta
	# Only queue_redraw when alpha actually changes — during the hold
	# phase nothing visual changes, so skip the redraw.
	if _age >= FADE_START:
		queue_redraw()
	if _age >= FULL_LIFE:
		queue_free()

func _draw() -> void:
	# Compute the fade multiplier. Holds at 1.0 until FADE_START, then
	# linearly to 0 by FULL_LIFE.
	var fade: float = 1.0
	if _age > FADE_START:
		fade = 1.0 - (_age - FADE_START) / max(0.001, FULL_LIFE - FADE_START)
		fade = clampf(fade, 0.0, 1.0)
	# OUTER halo polygon — wide irregular ellipse.
	var halo_pts: PackedVector2Array = PackedVector2Array()
	var core_pts: PackedVector2Array = PackedVector2Array()
	for i in range(POLY_VERTS):
		var ang: float = (TAU / float(POLY_VERTS)) * float(i)
		var j: float = _vert_jitter[i]
		halo_pts.append(Vector2(cos(ang) * _radius * j,
								sin(ang) * _radius * Y_SQUASH * j))
		core_pts.append(Vector2(cos(ang) * _radius * 0.52 * j,
								sin(ang) * _radius * 0.30 * j))
	draw_colored_polygon(halo_pts, Color(_color.r, _color.g, _color.b, HALO_ALPHA * fade))
	draw_colored_polygon(core_pts, Color(_color.r, _color.g, _color.b, CORE_ALPHA * fade))
