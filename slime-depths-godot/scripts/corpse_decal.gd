# CorpseDecal — iter 257 / Wave 6 death drama. Persistent visible decals
# left on the floor when an enemy dies, with per-kind identity (a slime
# splat looks different from a skeleton bone pile, looks different from
# an ember ash heap). Adds the "world remembers what happened here"
# Noita-feeling without any physics simulation — pure visual residue.
#
# Why this is additive to BloodMark (iter-83): BloodMark is a UNIFORM
# small dark crimson splat spawned for EVERY enemy death from main.gd's
# _on_enemy_died handler. It's identical for every kind of foe — slime
# vs skeleton vs ember vs wizard all leave the same dot. CorpseDecal
# adds per-IDENTITY visuals on TOP: bone shards for skeletal foes,
# scorched ash for embers, blood pools for melee mortals, ghost-mist
# for spectral things, ash piles for casters, splat shapes for slimes.
# Both can stack — main.gd still spawns BloodMark, enemy.gd's _die now
# also spawns a CorpseDecal of the appropriate kind.
#
# Each visual is built programmatically in _ready as a Polygon2D (or
# a small tree of them) — no scene authoring required for new kinds.
# This way adding a 7th kind is just a new branch in _build_visual().
#
# z_index = -1 places this BELOW hero / enemies / hazards, ABOVE floor
# wash + decor cluster (which are at z = -2 / -3 / -4). Result: corpses
# pile up UNDER the action, not over it — combat readability preserved.
#
# Lifetime: 7s default. Final 1.5s tween alpha to 0 so the decay reads
# as "fading away" rather than abrupt pop. Stack-friendly — 5 slimes
# dying at the same spot just overlap; the alpha slightly stacks but
# the visual stays legible (since each individual stays well under 1.0
# alpha).
class_name CorpseDecal
extends Node2D

# Total lifetime in seconds. 7s covers a "wave" of combat (several
# enemies dying in sequence) so the floor visibly accumulates body
# residue from the fight, then it clears before the next room.
@export var lifetime: float = 7.0

# How long the fade-out tail lasts. Alpha holds at 1.0 for
# (lifetime - FADE_DURATION), then linearly tweens to 0 over the
# remaining time. Slightly long so the decals soften into the floor
# rather than vanishing.
const FADE_DURATION: float = 1.5

# Per-kind tunables. Each kind has a distinct silhouette + palette so
# the floor visually distinguishes between which species died here.
# All Colors include the alpha that BURNS INTO the polygon at spawn —
# the fade-out tween multiplies the modulate on top of these.
const KIND_SLIME: String = "slime"
const KIND_SKELETON: String = "skeleton"
const KIND_EMBER: String = "ember"
const KIND_BLOOD: String = "blood"
const KIND_BONE: String = "bone"       # spectral / ghost — soft pale mist
const KIND_ASH: String = "ash"         # caster — grey-dark soot pile

# Slime: irregular green splat. Wider than tall (ground-projected
# foreshortening). 6-9 verts, randomly jittered so each splat is
# unique. Color 0.82 alpha — wet-look saturation without obscuring
# the floor underneath.
const SLIME_COLOR: Color = Color(0.32, 0.58, 0.22, 0.82)
const SLIME_WIDTH: float = 18.0      # half-width (so total visual ≈ 36 px)
const SLIME_HEIGHT: float = 8.0      # half-height
const SLIME_MIN_VERTS: int = 6
const SLIME_MAX_VERTS: int = 9
const SLIME_RADIAL_JITTER: float = 0.45   # ± fraction of base radius

# Skeleton: 3-4 small white-grey bone shard polygons scattered in
# a 24 px radius + a smaller dust under-layer. Reads as "bones
# crumbled into a heap" — different silhouette from any other kind.
const SKELETON_BONE_COLOR: Color = Color(0.85, 0.82, 0.72, 0.78)
const SKELETON_DUST_COLOR: Color = Color(0.6, 0.55, 0.45, 0.45)
const SKELETON_SHARD_COUNT_MIN: int = 3
const SKELETON_SHARD_COUNT_MAX: int = 4
const SKELETON_SCATTER_RADIUS: float = 24.0
const SKELETON_SHARD_LENGTH: float = 9.0   # bone shard major axis
const SKELETON_SHARD_WIDTH: float = 2.6     # bone shard minor axis
const SKELETON_DUST_RADIUS: float = 14.0   # under-layer dust pile

# Ember: warm orange ash cloud + faint warm-glow point. Reads as
# "smoldering remains" — the player should feel heat lingering in
# the spot for a moment after the ember falls.
const EMBER_ASH_COLOR: Color = Color(0.55, 0.30, 0.18, 0.65)
const EMBER_GLOW_COLOR: Color = Color(1.0, 0.55, 0.22, 0.55)
const EMBER_ASH_RADIUS: float = 15.0
const EMBER_GLOW_RADIUS: float = 4.0

# Blood: dark red pool, irregular splash shape — wider than tall.
# Similar to BloodMark but a touch larger + a distinct splash
# silhouette (asymmetric tails) so multiple deaths in one spot
# don't all look like the same circular splat.
const BLOOD_POOL_COLOR: Color = Color(0.42, 0.10, 0.08, 0.85)
const BLOOD_WIDTH: float = 14.0
const BLOOD_HEIGHT: float = 9.0
const BLOOD_VERTS: int = 12
const BLOOD_RADIAL_JITTER: float = 0.30

# Bone (spectral / wraith death): pale ghost-mist polygon + a few
# violet pip fragments scattered nearby. Cool palette — reads as
# "something incorporeal dissipated here" rather than a body splat.
const SPECTRAL_MIST_COLOR: Color = Color(0.62, 0.68, 0.72, 0.50)
const SPECTRAL_MIST_RADIUS: float = 18.0
const SPECTRAL_PIP_COLOR: Color = Color(0.78, 0.55, 1.0, 0.65)
const SPECTRAL_PIP_COUNT: int = 4
const SPECTRAL_PIP_RADIUS: float = 1.8
const SPECTRAL_PIP_SCATTER: float = 16.0

# Ash (caster death): grey-dark soot pile. Smaller than blood but
# distinct color — robed casters reduced to scorched clothing remnants.
const ASH_COLOR: Color = Color(0.20, 0.18, 0.18, 0.78)
const ASH_WIDTH: float = 13.0
const ASH_HEIGHT: float = 7.0
const ASH_VERTS: int = 10
const ASH_RADIAL_JITTER: float = 0.28

# Kind of decal. Set by the spawner (enemy.gd._die) before add_child
# so _ready can read it. Falls back to "blood" if a weird value lands.
var kind: String = "blood"

func _ready() -> void:
	# z_index = -1: above floor wash but below hero (z=0) and enemies
	# (z=0..4 from sprite + windup rings). Combat readability rules:
	# the corpse pile must sit UNDER the live combat, never over it.
	z_index = -1
	# Random rotation so each decal looks distinct even when several
	# spawn at the same spot.
	rotation = randf() * TAU
	_build_visual()
	# Schedule the fade-out tween. Hold opaque for (lifetime - FADE_DURATION),
	# then tween modulate.a from 1.0 to 0.0 over FADE_DURATION. Free at
	# the end of the tween so we don't have stale Node2Ds hanging around.
	# Uses create_tween (not SceneTreeTimer) so it survives scene paus-
	# ing cleanly via process_mode inheritance.
	var hold: float = max(0.01, lifetime - FADE_DURATION)
	var tw: Tween = create_tween()
	tw.tween_interval(hold)
	tw.tween_property(self, "modulate:a", 0.0, FADE_DURATION) \
		.set_trans(Tween.TRANS_LINEAR).set_ease(Tween.EASE_IN)
	tw.tween_callback(queue_free)

# Build the visual for `kind`. Each branch creates Polygon2D children
# directly on `self`. Adding a new kind = adding a new branch here.
func _build_visual() -> void:
	match kind:
		KIND_SLIME:
			_build_slime()
		KIND_SKELETON:
			_build_skeleton()
		KIND_EMBER:
			_build_ember()
		KIND_BLOOD:
			_build_blood()
		KIND_BONE:
			_build_spectral()
		KIND_ASH:
			_build_ash()
		_:
			# Unknown kind → fall back to blood pool. Defensive: any
			# misspelled `kind` value should still leave a visible
			# decal rather than blank space.
			_build_blood()

# ── Slime: irregular wet green splat ──────────────────────────────────
func _build_slime() -> void:
	var verts: int = randi_range(SLIME_MIN_VERTS, SLIME_MAX_VERTS)
	var poly: PackedVector2Array = PackedVector2Array()
	for i in range(verts):
		var ang: float = (TAU / float(verts)) * float(i)
		# Per-vertex jitter so the silhouette breaks the symmetry
		# but stays roughly elliptical.
		var j: float = 1.0 + randf_range(-SLIME_RADIAL_JITTER, SLIME_RADIAL_JITTER)
		poly.append(Vector2(
			cos(ang) * SLIME_WIDTH * j,
			sin(ang) * SLIME_HEIGHT * j,
		))
	var p: Polygon2D = Polygon2D.new()
	p.polygon = poly
	p.color = SLIME_COLOR
	add_child(p)

# ── Skeleton: scattered bone shards over dust ─────────────────────────
func _build_skeleton() -> void:
	# Under-layer dust pile reads as "the bones tumbled in a small heap
	# of pulverized fragments." Drawn first so the shards layer on top.
	var dust: Polygon2D = Polygon2D.new()
	var dust_verts: int = 12
	var dust_poly: PackedVector2Array = PackedVector2Array()
	for i in range(dust_verts):
		var ang: float = (TAU / float(dust_verts)) * float(i)
		var j: float = 1.0 + randf_range(-0.20, 0.20)
		dust_poly.append(Vector2(
			cos(ang) * SKELETON_DUST_RADIUS * j,
			sin(ang) * SKELETON_DUST_RADIUS * 0.45 * j,
		))
	dust.polygon = dust_poly
	dust.color = SKELETON_DUST_COLOR
	add_child(dust)
	# 3-4 small elongated bone-shard quads scattered within scatter radius.
	# Each shard is a rotated rectangle (4-vert polygon) so the shape
	# reads as "bone fragment" rather than a generic blob.
	var count: int = randi_range(SKELETON_SHARD_COUNT_MIN, SKELETON_SHARD_COUNT_MAX)
	for _i in range(count):
		var shard: Polygon2D = Polygon2D.new()
		var hl: float = SKELETON_SHARD_LENGTH * 0.5
		var hw: float = SKELETON_SHARD_WIDTH * 0.5
		shard.polygon = PackedVector2Array([
			Vector2(-hl, -hw),
			Vector2(hl, -hw),
			Vector2(hl, hw),
			Vector2(-hl, hw),
		])
		shard.color = SKELETON_BONE_COLOR
		# Position somewhere in the scatter circle.
		var ang: float = randf() * TAU
		var r: float = randf_range(0.0, SKELETON_SCATTER_RADIUS)
		shard.position = Vector2(cos(ang) * r, sin(ang) * r * 0.55)
		shard.rotation = randf() * TAU
		add_child(shard)

# ── Ember: warm ash cloud with central glow ───────────────────────────
func _build_ember() -> void:
	# Outer warm-brown ash cloud (12-vert ellipse).
	var ash: Polygon2D = Polygon2D.new()
	var ash_verts: int = 12
	var ash_poly: PackedVector2Array = PackedVector2Array()
	for i in range(ash_verts):
		var ang: float = (TAU / float(ash_verts)) * float(i)
		var j: float = 1.0 + randf_range(-0.25, 0.25)
		ash_poly.append(Vector2(
			cos(ang) * EMBER_ASH_RADIUS * j,
			sin(ang) * EMBER_ASH_RADIUS * 0.55 * j,
		))
	ash.polygon = ash_poly
	ash.color = EMBER_ASH_COLOR
	add_child(ash)
	# Central faint glow — small bright dot. Reads as "the last embers
	# still smoldering." Tiny 8-vert disc.
	var glow: Polygon2D = Polygon2D.new()
	var glow_verts: int = 8
	var glow_poly: PackedVector2Array = PackedVector2Array()
	for i in range(glow_verts):
		var ang: float = (TAU / float(glow_verts)) * float(i)
		glow_poly.append(Vector2(
			cos(ang) * EMBER_GLOW_RADIUS,
			sin(ang) * EMBER_GLOW_RADIUS,
		))
	glow.polygon = glow_poly
	glow.color = EMBER_GLOW_COLOR
	add_child(glow)

# ── Blood: dark red splash pool ───────────────────────────────────────
func _build_blood() -> void:
	var poly: PackedVector2Array = PackedVector2Array()
	for i in range(BLOOD_VERTS):
		var ang: float = (TAU / float(BLOOD_VERTS)) * float(i)
		var j: float = 1.0 + randf_range(-BLOOD_RADIAL_JITTER, BLOOD_RADIAL_JITTER)
		poly.append(Vector2(
			cos(ang) * BLOOD_WIDTH * j,
			sin(ang) * BLOOD_HEIGHT * j,
		))
	var p: Polygon2D = Polygon2D.new()
	p.polygon = poly
	p.color = BLOOD_POOL_COLOR
	add_child(p)

# ── Spectral: pale ghost-mist + violet pips ───────────────────────────
func _build_spectral() -> void:
	# Soft mist disc — slightly larger than blood, fully alpha-soft.
	var mist: Polygon2D = Polygon2D.new()
	var mist_verts: int = 14
	var mist_poly: PackedVector2Array = PackedVector2Array()
	for i in range(mist_verts):
		var ang: float = (TAU / float(mist_verts)) * float(i)
		var j: float = 1.0 + randf_range(-0.22, 0.22)
		mist_poly.append(Vector2(
			cos(ang) * SPECTRAL_MIST_RADIUS * j,
			sin(ang) * SPECTRAL_MIST_RADIUS * 0.55 * j,
		))
	mist.polygon = mist_poly
	mist.color = SPECTRAL_MIST_COLOR
	add_child(mist)
	# A handful of violet pips scattered around — magical residue.
	for _i in range(SPECTRAL_PIP_COUNT):
		var pip: Polygon2D = Polygon2D.new()
		var pip_verts: int = 6
		var pip_poly: PackedVector2Array = PackedVector2Array()
		for i in range(pip_verts):
			var ang: float = (TAU / float(pip_verts)) * float(i)
			pip_poly.append(Vector2(
				cos(ang) * SPECTRAL_PIP_RADIUS,
				sin(ang) * SPECTRAL_PIP_RADIUS,
			))
		pip.polygon = pip_poly
		pip.color = SPECTRAL_PIP_COLOR
		var ang: float = randf() * TAU
		var r: float = randf_range(2.0, SPECTRAL_PIP_SCATTER)
		pip.position = Vector2(cos(ang) * r, sin(ang) * r * 0.6)
		add_child(pip)

# ── Ash: dark soot pile (casters) ─────────────────────────────────────
func _build_ash() -> void:
	var poly: PackedVector2Array = PackedVector2Array()
	for i in range(ASH_VERTS):
		var ang: float = (TAU / float(ASH_VERTS)) * float(i)
		var j: float = 1.0 + randf_range(-ASH_RADIAL_JITTER, ASH_RADIAL_JITTER)
		poly.append(Vector2(
			cos(ang) * ASH_WIDTH * j,
			sin(ang) * ASH_HEIGHT * j,
		))
	var p: Polygon2D = Polygon2D.new()
	p.polygon = poly
	p.color = ASH_COLOR
	add_child(p)
