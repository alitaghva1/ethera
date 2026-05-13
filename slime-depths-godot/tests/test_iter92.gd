extends SceneTree

# Iter 92 — main menu redesign with painted backdrop.
#
# User feedback: the start screen "is just so garbage." Pre-iter-92 menu
# was hand-drawing atmosphere with a faint Polygon2D arch silhouette,
# gradients, and embers. The JS reference (slime-depths/src/menuScreen.js)
# uses a PAINTED backdrop (menu_backdrop.jpg) — archway with two torches,
# stairs into mist, vines on stone. That asset existed but was never
# ported to Godot.
#
# Iter-92 changes:
#   1. Import slime-depths/public/assets/menu/menu_backdrop.jpg into
#      slime-depths-godot/assets/menu/ and reference it as a full-screen
#      TextureRect (stretch_mode = keep_aspect_covered).
#   2. Delete the ArchSilhouette Polygon2D — backdrop has its own arch.
#   3. Delete BackgroundGradient — painted backdrop is now the ground.
#   4. Add TitleHalo — warm radial glow behind the title block, alpha
#      breathes with the title scale tween.
#   5. Add two torch-position ember emitters so the painted torches read
#      as alive (embers rise from each painted flame).
#   6. Stage TitleBlock at the TOP of the viewport (on the dark cavern
#      roof above the arch peak) and CenterStack inside the archway
#      interior (visually opening into the dungeon).
#   7. Rename BEGIN → AWAKEN to match the JS CTA atmosphere.
#   8. Diamond flourishes around the tagline: "◇ b e n e a t h ... ◇".
func _initialize() -> void:
	var ok := true

	# ═══ Backdrop asset present ═══
	var backdrop_path := "res://assets/menu/menu_backdrop.jpg"
	if not ResourceLoader.exists(backdrop_path):
		push_error("FAIL: menu_backdrop.jpg missing at %s" % backdrop_path)
		ok = false
	else:
		var tex: Texture2D = load(backdrop_path) as Texture2D
		if tex == null:
			push_error("FAIL: menu_backdrop.jpg failed to load as Texture2D")
			ok = false
		else:
			print("OK menu_backdrop.jpg imported (%dx%d)" % [tex.get_width(), tex.get_height()])

	# ═══ main_menu.tscn structure ═══
	var src := FileAccess.get_file_as_string("res://scenes/main_menu.tscn")

	if not src.contains("menu_backdrop.jpg"):
		push_error("FAIL: main_menu.tscn doesn't reference menu_backdrop.jpg")
		ok = false
	else:
		print("OK main_menu.tscn references the painted backdrop")

	if not src.contains("name=\"BackdropImage\""):
		push_error("FAIL: main_menu.tscn missing BackdropImage TextureRect")
		ok = false
	else:
		print("OK main_menu.tscn has BackdropImage TextureRect node")

	# Old procedural-atmosphere nodes should be gone.
	if src.contains("name=\"ArchSilhouette\""):
		push_error("FAIL: main_menu.tscn still has ArchSilhouette Polygon2D (backdrop replaces it)")
		ok = false
	else:
		print("OK ArchSilhouette removed (painted backdrop has its own arch)")

	if src.contains("name=\"BackgroundGradient\""):
		push_error("FAIL: main_menu.tscn still has BackgroundGradient (backdrop replaces it)")
		ok = false
	else:
		print("OK BackgroundGradient removed (painted backdrop is the ground)")

	# Halo + torch embers.
	if not src.contains("name=\"TitleHalo\""):
		push_error("FAIL: main_menu.tscn missing TitleHalo node")
		ok = false
	else:
		print("OK TitleHalo node present (warm radial behind title)")

	for torch_name in ["LeftTorchEmbers", "RightTorchEmbers"]:
		if not src.contains("name=\"%s\"" % torch_name):
			push_error("FAIL: main_menu.tscn missing %s emitter" % torch_name)
			ok = false
		else:
			print("OK %s emitter present (sells painted torch as alive)" % torch_name)

	# Renamed BEGIN button text → AWAKEN (per JS reference).
	if not src.contains("text = \"AWAKEN\""):
		push_error("FAIL: main_menu.tscn doesn't have AWAKEN button text (JS-reference CTA)")
		ok = false
	else:
		print("OK BEGIN renamed to AWAKEN (JS-reference atmospheric CTA)")

	# Diamond flourishes around tagline.
	if not src.contains("◇"):
		push_error("FAIL: main_menu.tscn tagline missing diamond flourishes")
		ok = false
	else:
		print("OK tagline has ◇ diamond flourishes (JS reference)")

	# ═══ main_menu.gd wiring ═══
	var gd := FileAccess.get_file_as_string("res://scripts/main_menu.gd")

	if not gd.contains("title_halo"):
		push_error("FAIL: main_menu.gd doesn't reference title_halo @onready")
		ok = false
	else:
		print("OK main_menu.gd has @onready title_halo binding")

	if not gd.contains("left_torch_embers") or not gd.contains("right_torch_embers"):
		push_error("FAIL: main_menu.gd missing torch ember @onready bindings")
		ok = false
	else:
		print("OK main_menu.gd binds both torch ember emitters")

	# Halo alpha should be driven by the title scale tween.
	if not gd.contains("title_halo.modulate"):
		push_error("FAIL: main_menu.gd doesn't drive title_halo.modulate (no breath sync)")
		ok = false
	else:
		print("OK title_halo modulate alpha tracks title scale tween")

	# Torch positions should be percentage-based (resize-safe).
	if not gd.contains("LEFT_TORCH_REL_X") or not gd.contains("RIGHT_TORCH_REL_X"):
		push_error("FAIL: torch ember positions not percentage-anchored (won't survive resize)")
		ok = false
	else:
		print("OK torch ember positions are percentage-anchored (resize-safe)")

	# ═══ Scene loads cleanly ═══
	var scene := load("res://scenes/main_menu.tscn") as PackedScene
	if scene == null:
		push_error("FAIL: main_menu.tscn no longer loads")
		ok = false
	else:
		var inst: Node = scene.instantiate()
		if inst == null:
			push_error("FAIL: main_menu.tscn failed to instantiate")
			ok = false
		else:
			# Critical children must be present after instantiation.
			# iter-129 — EmberParticles dropped from this list (bottom
			# spray removed per "tiny random spray" playtest feedback;
			# the two torch ember emitters carry the iter-92 atmospheric
			# contract together with the iter-111 MistParticles).
			for child_path in ["BackdropImage", "TitleHalo", "LeftTorchEmbers", "RightTorchEmbers", "TitleBlock", "CenterStack"]:
				if inst.get_node_or_null(child_path) == null:
					push_error("FAIL: instantiated main_menu missing %s" % child_path)
					ok = false
			# AWAKEN button text must survive instantiation.
			var begin: Button = inst.get_node_or_null("CenterStack/BeginButton")
			if begin == null:
				push_error("FAIL: BeginButton missing on instantiated scene")
				ok = false
			elif begin.text != "AWAKEN":
				push_error("FAIL: BeginButton text is '%s', expected 'AWAKEN'" % begin.text)
				ok = false
			else:
				print("OK instantiated scene has all expected nodes + AWAKEN button")
			inst.queue_free()

	if ok:
		print("=== ITER 92 INTEGRATION PASSED ===")
	else:
		print("=== ITER 92 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
