# FxSprite — generic AnimatedSprite2D wrapper for PixelLab-generated
# combat FX sprite sheets.
#
# The PixelLab generation script (slime-depths/scripts/pixellab/
# generate-godot-fx-pack.js) outputs horizontal strip PNGs at
# assets/fx/<name>_sheet.png with sidecar <name>_meta.json describing
# frame count + fps + cell size. This class loads both, builds a
# SpriteFrames resource at runtime, plays the animation once, and
# self-frees on animation_finished.
#
# DOES NOT manually squash or stretch frames. Godot's nearest-neighbor
# scaling preserves pixel-art crunch at any target size — sheet stays
# at its native 64×64 per cell and we set `.scale` on the node to
# reach the desired on-screen size. This is the "let it animate
# properly" path the user asked for.
#
# Sheet cache: once loaded, the SpriteFrames is reused across spawns
# of the same FX name. Building SpriteFrames does a JSON parse + N
# AtlasTexture allocations — cheap but worth caching so a 30-enemy
# wave's worth of hit_sparks doesn't rebuild SpriteFrames 30×.
#
# Spawn API:
#   FxSprite.spawn(host, world_pos, "slash_arc", {
#       rotation: aim_angle,
#       scale: Vector2(2.0, 2.0),
#       modulate: Color(1, 1, 1, 1),
#   })
#
# Layering: caller picks z_index via opts.z_index (default 5 — above
# floor/decor, level with hero/enemies). Float-level FX should set
# z_index = 1; over-character FX use 5+.
class_name FxSprite
extends AnimatedSprite2D

# Cache of (sheet_name → SpriteFrames). Class-level (not per-instance)
# so all spawns of "slash_arc" share one SpriteFrames resource.
static var _sf_cache: Dictionary = {}

# Static factory. Mirrors BloodMark.spawn / SpawnBurst.spawn pattern.
# Returns the created FxSprite, or null on failure (sheet missing etc.).
static func spawn(host: Node, world_pos: Vector2, sheet_name: String, opts: Dictionary = {}) -> FxSprite:
	var sf: SpriteFrames = _get_or_build_sprite_frames(sheet_name)
	if sf == null:
		push_warning("FxSprite.spawn: failed to load sheet '%s'" % sheet_name)
		return null
	var fx: FxSprite = FxSprite.new()
	fx.sprite_frames = sf
	# z_index BEFORE add_child so the first frame renders at the right
	# layer (same pattern as iter-83 BloodMark + iter-86 SpawnBurst).
	fx.z_index = int(opts.get("z_index", 5))
	fx.global_position = world_pos
	fx.rotation = float(opts.get("rotation", 0.0))
	fx.scale = opts.get("scale", Vector2(1.0, 1.0))
	fx.modulate = opts.get("modulate", Color(1.0, 1.0, 1.0, 1.0))
	# Wire the auto-free on animation_finished. Each FxSprite is
	# single-shot — fires its animation, then queue_frees.
	fx.animation_finished.connect(fx.queue_free)
	host.add_child(fx)
	fx.play("play")
	return fx

# Loads a sheet + meta and builds the SpriteFrames. Cached per sheet_name.
# Returns null if either file is missing (e.g. the PixelLab generation
# hasn't been run yet, or the sheet name is misspelled).
static func _get_or_build_sprite_frames(sheet_name: String) -> SpriteFrames:
	if _sf_cache.has(sheet_name):
		return _sf_cache[sheet_name]
	var sheet_path: String = "res://assets/fx/%s_sheet.png" % sheet_name
	var meta_path: String = "res://assets/fx/%s_meta.json" % sheet_name
	if not ResourceLoader.exists(sheet_path):
		push_warning("FxSprite: sheet missing — %s" % sheet_path)
		return null
	var sheet: Texture2D = load(sheet_path) as Texture2D
	if sheet == null:
		push_warning("FxSprite: sheet failed to load as Texture2D — %s" % sheet_path)
		return null
	# Read meta sidecar. Use FileAccess (not load) so we read the .json
	# as raw text — Godot's resource importer treats .json as Resource
	# which would parse it as a Godot Dictionary if it had the right
	# magic, but PixelLab outputs plain JSON.
	if not FileAccess.file_exists(meta_path):
		push_warning("FxSprite: meta missing — %s" % meta_path)
		return null
	var f := FileAccess.open(meta_path, FileAccess.READ)
	if f == null:
		push_warning("FxSprite: meta failed to open — %s" % meta_path)
		return null
	var meta_text: String = f.get_as_text()
	f.close()
	var parsed = JSON.parse_string(meta_text)
	if parsed == null or not (parsed is Dictionary):
		push_warning("FxSprite: meta JSON parse failed — %s" % meta_path)
		return null
	var meta: Dictionary = parsed
	var n_frames: int = int(meta.get("frames", 0))
	var fps: float = float(meta.get("fps", 24.0))
	var cell: int = int(meta.get("cell_size", 64))
	if n_frames <= 0 or cell <= 0:
		push_warning("FxSprite: meta has invalid frames=%d cell=%d" % [n_frames, cell])
		return null
	# Build SpriteFrames with one animation named "play" containing
	# n_frames AtlasTexture frames cropped from the sheet.
	var sf: SpriteFrames = SpriteFrames.new()
	sf.remove_animation("default")  # SpriteFrames ships with one — drop it
	sf.add_animation("play")
	sf.set_animation_loop("play", false)
	sf.set_animation_speed("play", fps)
	for i in range(n_frames):
		var atlas: AtlasTexture = AtlasTexture.new()
		atlas.atlas = sheet
		atlas.region = Rect2(float(i * cell), 0.0, float(cell), float(cell))
		sf.add_frame("play", atlas)
	_sf_cache[sheet_name] = sf
	return sf
