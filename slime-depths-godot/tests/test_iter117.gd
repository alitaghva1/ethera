extends SceneTree

# Iter 117 — Entity readability pass (part 3 of the visual presentation
# pass).
#
# Pre-iter-117:
#   • Hero had ground shadow (iter-52, alpha 0.60) + rim light (iter-116)
#     but NO outline. Against the iter-115 muted floor + iter-116 deeper
#     vignette, the player silhouette could blur into ambient.
#   • Enemy shadow alpha 0.45 was lighter than hero's 0.60 — enemies
#     read as "less grounded" than the player, which made the silhouette
#     hierarchy fuzzy.
#
# Iter-117 closes the gap:
#
#   HERO OUTLINE SHADER
#     New res://assets/shaders/sprite_outline.gdshader. 8-tap edge
#     detector: any TRANSPARENT pixel with an OPAQUE neighbor within
#     outline_width pixels gets painted outline_color, modulated by the
#     neighbor's alpha for smooth AA. Applied to hero.tscn's
#     AnimatedSprite2D as a ShaderMaterial with outline_color leaning
#     very-dark blue (matches iter-115 CHROME_WALL_STONE_COLOR) so the
#     hero pops as DEEPER than the floor without reading as stark
#     cartoon black.
#
#   ENEMY SHADOW PARITY
#     Enemy shadow modulate 0.45 → 0.55 (closer to hero's 0.60). Brings
#     the enemy silhouette hierarchy in line — both grounded, player
#     still subtly heavier due to rim-light bias from iter-116.
func _initialize() -> void:
	var ok := true

	# ═══ Shader file exists ═══
	if not FileAccess.file_exists("res://assets/shaders/sprite_outline.gdshader"):
		push_error("FAIL: sprite_outline.gdshader missing")
		ok = false
	else:
		var shader_src := FileAccess.get_file_as_string("res://assets/shaders/sprite_outline.gdshader")
		if "shader_type canvas_item" not in shader_src:
			push_error("FAIL: shader_type should be canvas_item")
			ok = false
		if "outline_color" not in shader_src:
			push_error("FAIL: outline shader missing outline_color uniform")
			ok = false
		if "outline_width" not in shader_src:
			push_error("FAIL: outline shader missing outline_width uniform")
			ok = false
		if "TEXTURE_PIXEL_SIZE" not in shader_src:
			push_error("FAIL: outline shader doesn't use TEXTURE_PIXEL_SIZE (no atlas-aware sampling)")
			ok = false
		if ok:
			print("OK sprite_outline.gdshader exists with outline_color + outline_width uniforms")

	# ═══ Hero scene wires the outline material ═══
	var hero_src := FileAccess.get_file_as_string("res://scenes/hero.tscn")
	if "sprite_outline.gdshader" not in hero_src:
		push_error("FAIL: hero.tscn doesn't reference sprite_outline.gdshader")
		ok = false
	if "ShaderMaterial" not in hero_src:
		push_error("FAIL: hero.tscn missing ShaderMaterial sub_resource")
		ok = false
	if "hero_outline_mat" not in hero_src:
		push_error("FAIL: hero.tscn missing hero_outline_mat sub_resource id")
		ok = false
	if "material = SubResource(\"hero_outline_mat\")" not in hero_src:
		push_error("FAIL: hero.tscn AnimatedSprite2D not assigned the outline material")
		ok = false
	if ok:
		print("OK hero.tscn AnimatedSprite2D wears sprite_outline ShaderMaterial")

	# ═══ Enemy shadow alpha bumped ═══
	var enemy_src := FileAccess.get_file_as_string("res://scripts/enemy.gd")
	if "Color(0, 0, 0, 0.55)" not in enemy_src:
		push_error("FAIL: enemy.gd shadow modulate should be 0.55 (was 0.45 — parity with hero 0.60)")
		ok = false
	if ok:
		print("OK enemy shadow alpha 0.45 → 0.55 (parity with hero 0.60)")

	# ═══ Runtime: hero instance has the material applied ═══
	var hero_scene: PackedScene = load("res://scenes/hero.tscn")
	if hero_scene != null:
		var h: Node = hero_scene.instantiate()
		var anim: AnimatedSprite2D = h.get_node_or_null("AnimatedSprite2D")
		if anim != null:
			if anim.material == null:
				push_error("FAIL: instantiated hero AnimatedSprite2D has no material")
				ok = false
			elif not anim.material is ShaderMaterial:
				push_error("FAIL: hero AnimatedSprite2D material isn't a ShaderMaterial")
				ok = false
			else:
				var sm: ShaderMaterial = anim.material as ShaderMaterial
				if sm.shader == null:
					push_error("FAIL: hero ShaderMaterial has null shader")
					ok = false
				elif sm.get_shader_parameter("outline_width") == null:
					push_error("FAIL: outline_width param not set on the runtime material")
					ok = false
				else:
					var ow: float = float(sm.get_shader_parameter("outline_width"))
					if ow <= 0.0 or ow > 4.0:
						push_error("FAIL: outline_width = %f outside reasonable range [0..4]" % ow)
						ok = false
					else:
						print("OK runtime hero has outline shader applied (width=%f)" % ow)
		h.queue_free()

	if ok:
		print("=== ITER 117 INTEGRATION PASSED ===")
	else:
		print("=== ITER 117 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
