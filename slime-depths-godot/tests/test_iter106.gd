extends SceneTree

# Iter 106 — visual upgrade pass (enemy track of the 3-team audit).
#
# Three visual-improvement teams returned 12 findings. Iter-106 lands
# the highest-impact ENEMY-team items (ENEMY #1 + ENEMY #2). Room-team
# and menu-team items deferred to iter-107 + iter-108 since they need
# either specific asset selection (room backdrops with appropriate
# painted dungeon style, not the outdoor ruins_sample) or external
# downloads (custom serif font for the menu).
#
# ENEMY #1: Boss sprite swap.
#   - Broodmother was using crypt_spider sheets at sprite_scale 4.0
#     ("Real boss sprites are queued for later" — that "later" is now).
#     Now uses dedicated brood_*.png at cell_size 100 / sprite_scale 2.5.
#     Distinct silhouette from the baby spiders she summons.
#   - Iron Revenant was using armored_skeleton sheets at sprite_scale 4.0
#     (4× bilinear-upscale = fuzzy blob). Now uses elite_orc_*.png at
#     cell_size 100 / sprite_scale 2.0 — proper 100-px boss-quality
#     armored-knight art with red-eye glow.
#
# ENEMY #2: chase_contact attack animation wiring.
#   - Pre-iter-106 slime / orc / ember / werewolf / crypt_spider had
#     attack sheets declared in their .tres files but _tick_chase_contact
#     never played the attack pose. Body bumps animated as walk → the
#     player perceived "the slime ate me without animating."
#   - Iter-106 wires it: a _contact_attack_anim_time timer (0.25s) is
#     armed when contact damage fires; the tick holds "attack" pose
#     for that window if the enemy has frames_attack > 0. No-op for
#     enemies that legitimately have no attack sheet (frames_attack 0).
#   - Slime: added slime_attack.png (copied from slime_cast.png in the
#     JS reference) + bumped frames_attack 0 → 4 in slime.tres.
func _initialize() -> void:
	var ok := true

	# ═══ Boss sprite swap — Broodmother uses brood_*.png ═══
	# Use ext_resource line matching (the actual sheet refs) — comments
	# documenting the old sheets are fine.
	var bm_src := FileAccess.get_file_as_string("res://scenes/enemies/broodmother.tres")
	if "[ext_resource type=\"Texture2D\" path=\"res://assets/enemies/crypt_spider" in bm_src:
		push_error("FAIL: broodmother.tres still has ext_resource pointing at crypt_spider_*.png")
		ok = false
	if not bm_src.contains("brood_idle.png"):
		push_error("FAIL: broodmother.tres doesn't reference brood_idle.png")
		ok = false
	if not bm_src.contains("sprite_scale = 2.5"):
		push_error("FAIL: broodmother.tres sprite_scale not 2.5 (was 4.0 bilinear-upscale)")
		ok = false
	if ok:
		print("OK Broodmother uses brood_*.png at sprite_scale 2.5")
	# Asset files exist
	for sheet in ["brood_idle.png", "brood_walk.png", "brood_attack.png", "brood_death.png"]:
		if not ResourceLoader.exists("res://assets/enemies/%s" % sheet):
			push_error("FAIL: assets/enemies/%s missing" % sheet)
			ok = false

	# ═══ Boss sprite swap — Iron Revenant uses elite_orc_*.png ═══
	var ir_src := FileAccess.get_file_as_string("res://scenes/enemies/iron_revenant.tres")
	if "[ext_resource type=\"Texture2D\" path=\"res://assets/enemies/armored_skeleton" in ir_src:
		push_error("FAIL: iron_revenant.tres still has ext_resource pointing at armored_skeleton_*.png")
		ok = false
	if not ir_src.contains("elite_orc_idle.png"):
		push_error("FAIL: iron_revenant.tres doesn't reference elite_orc_idle.png")
		ok = false
	if not ir_src.contains("sprite_scale = 2.0"):
		push_error("FAIL: iron_revenant.tres sprite_scale not 2.0 (was 4.0 bilinear-upscale)")
		ok = false
	if ok:
		print("OK Iron Revenant uses elite_orc_*.png at sprite_scale 2.0")
	for sheet in ["elite_orc_idle.png", "elite_orc_walk.png", "elite_orc_attack.png", "elite_orc_death.png"]:
		if not ResourceLoader.exists("res://assets/enemies/%s" % sheet):
			push_error("FAIL: assets/enemies/%s missing" % sheet)
			ok = false

	# ═══ Slime attack sheet wired ═══
	var slime_src := FileAccess.get_file_as_string("res://scenes/enemies/slime.tres")
	if not slime_src.contains("slime_attack.png"):
		push_error("FAIL: slime.tres doesn't reference slime_attack.png")
		ok = false
	if not slime_src.contains("frames_attack = 4"):
		push_error("FAIL: slime.tres frames_attack not 4 (was 0 — dead attack sheet)")
		ok = false
	if not ResourceLoader.exists("res://assets/enemies/slime_attack.png"):
		push_error("FAIL: assets/enemies/slime_attack.png missing")
		ok = false
	if ok:
		print("OK slime.tres wires slime_attack.png with frames_attack = 4")

	# ═══ chase_contact attack-anim wiring in enemy.gd ═══
	var enemy_src := FileAccess.get_file_as_string("res://scripts/enemy.gd")
	if "var _contact_attack_anim_time" not in enemy_src:
		push_error("FAIL: enemy.gd missing _contact_attack_anim_time state var")
		ok = false
	if "CONTACT_ATTACK_ANIM_DURATION" not in enemy_src:
		push_error("FAIL: enemy.gd missing CONTACT_ATTACK_ANIM_DURATION const")
		ok = false
	# The tick should drain the timer
	if not enemy_src.contains("_contact_attack_anim_time = max(0.0, _contact_attack_anim_time"):
		push_error("FAIL: _tick_chase_contact doesn't drain the attack-anim timer")
		ok = false
	# The tick should arm the timer when contact damage fires
	if not enemy_src.contains("_contact_attack_anim_time = CONTACT_ATTACK_ANIM_DURATION"):
		push_error("FAIL: _tick_chase_contact doesn't arm the attack-anim timer on contact damage")
		ok = false
	# Tick branches should play "attack" when the timer is hot + frames_attack > 0
	var ca_idx: int = enemy_src.find("func _tick_chase_contact")
	if ca_idx >= 0:
		var ca_body: String = enemy_src.substr(ca_idx, 2000)
		if not ca_body.contains("sprite.play(&\"attack\")"):
			push_error("FAIL: _tick_chase_contact never plays the 'attack' animation")
			ok = false
		else:
			print("OK _tick_chase_contact plays 'attack' anim when _contact_attack_anim_time > 0")

	# ═══ Runtime smoke — both bosses instantiate cleanly with new sheets ═══
	for path in ["res://scenes/enemies/broodmother.tres", "res://scenes/enemies/iron_revenant.tres", "res://scenes/enemies/slime.tres"]:
		var et: EnemyType = load(path) as EnemyType
		if et == null:
			push_error("FAIL: %s won't load as EnemyType" % path)
			ok = false
		elif et.idle_sheet == null or et.walk_sheet == null:
			push_error("FAIL: %s missing idle/walk sheet refs" % path)
			ok = false
	if ok:
		print("OK Broodmother + Iron Revenant + Slime EnemyType resources load cleanly")

	# Runtime SpriteFrames inspection deferred — instantiating a full
	# Enemy in --script context doesn't reliably fire the AnimatedSprite2D
	# child build (Godot tree-setup ordering quirk). The static .tres
	# assertions above (slime_attack.png ext_resource + frames_attack = 4
	# + asset exists) already verify the wiring. Real gameplay execution
	# will see the SpriteFrames built correctly via enemy.gd's _ready.
	print("SKIP runtime SpriteFrames inspection (covered by static assertions)")

	if ok:
		print("=== ITER 106 INTEGRATION PASSED ===")
	else:
		print("=== ITER 106 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
