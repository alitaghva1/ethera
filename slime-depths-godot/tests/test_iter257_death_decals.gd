extends SceneTree

# Iter 257 / Wave 6 — Enemy Death Drama smoke test.
#
# When an enemy dies, leave a PERSISTENT visible decal on the floor
# matching its identity. Pre-iter-257 every death only spawned the
# uniform iter-83 BloodMark (from main.gd._on_enemy_died). Now each
# enemy KIND leaves a distinct corpse residue:
#   • slime     → irregular green splat
#   • skeleton  → scattered bone shards + dust pile
#   • ember     → warm-orange ash cloud with central glow
#   • blood     → dark-red splash pool (fallback / melee mortals)
#   • bone      → pale ghost-mist + violet pips (spectral / wraith)
#   • ash       → grey-dark soot pile (casters reduced to robes)
#
# Verifies:
#   A. CorpseDecal scene + script load cleanly + class registers
#   B. DEATH_DECAL_KIND_MAP exists in enemy.gd with ≥ 18 entries
#      (every spawnable enemy type mapped to a decal kind)
#   C. Spawning a CorpseDecal with kind="blood" creates Polygon2D
#      children — the visual ACTUALLY builds
#   D. Each of the 6 supported kinds builds without error (each
#      spawn instantiates Polygon2D children, no errors thrown)
#   E. CorpseDecal exposes a `lifetime` property ≥ 5.0
#   F. enemy.gd's _die spawns a CorpseDecal (source-grep — guards
#      against the hook being silently removed)

func _initialize() -> void:
	print("[iter257decals] init")
	await process_frame

	# ── A. CorpseDecal scene + script load ───────────────────────────
	var decal_scene: PackedScene = load("res://scenes/corpse_decal.tscn") as PackedScene
	if decal_scene == null:
		printerr("FAIL: corpse_decal.tscn failed to load")
		quit(1)
		return
	var decal_script: Script = load("res://scripts/corpse_decal.gd") as Script
	if decal_script == null:
		printerr("FAIL: corpse_decal.gd failed to load")
		quit(1)
		return
	print("[iter257decals] A OK — CorpseDecal scene + script load")

	# ── B. DEATH_DECAL_KIND_MAP exists with ≥ 18 entries ────────────
	var enemy_script: Script = load("res://scripts/enemy.gd") as Script
	if enemy_script == null:
		printerr("FAIL: enemy.gd failed to load")
		quit(1)
		return
	var kind_map: Dictionary = enemy_script.get("DEATH_DECAL_KIND_MAP")
	if kind_map == null:
		printerr("FAIL: enemy.gd missing DEATH_DECAL_KIND_MAP constant")
		quit(1)
		return
	if kind_map.size() < 18:
		printerr("FAIL: DEATH_DECAL_KIND_MAP has %d entries, expected ≥ 18" % kind_map.size())
		quit(1)
		return
	# Spot-check a handful of representative entries.
	if kind_map.get("slime", "") != "slime":
		printerr("FAIL: DEATH_DECAL_KIND_MAP['slime'] = %s, expected 'slime'" % str(kind_map.get("slime")))
		quit(1)
		return
	if kind_map.get("ember", "") != "ember":
		printerr("FAIL: DEATH_DECAL_KIND_MAP['ember'] = %s, expected 'ember'" % str(kind_map.get("ember")))
		quit(1)
		return
	if kind_map.get("skel", "") != "skeleton":
		printerr("FAIL: DEATH_DECAL_KIND_MAP['skel'] = %s, expected 'skeleton'" % str(kind_map.get("skel")))
		quit(1)
		return
	if kind_map.get("rogue_wraith", "") != "bone":
		printerr("FAIL: DEATH_DECAL_KIND_MAP['rogue_wraith'] = %s, expected 'bone'" % str(kind_map.get("rogue_wraith")))
		quit(1)
		return
	if kind_map.get("wizard", "") != "ash" and kind_map.get("wiz", "") != "ash":
		printerr("FAIL: DEATH_DECAL_KIND_MAP missing wizard/wiz → ash mapping")
		quit(1)
		return
	if kind_map.get("orc", "") != "blood":
		printerr("FAIL: DEATH_DECAL_KIND_MAP['orc'] = %s, expected 'blood'" % str(kind_map.get("orc")))
		quit(1)
		return
	print("[iter257decals] B OK — DEATH_DECAL_KIND_MAP has %d entries (≥ 18)" % kind_map.size())

	# ── C. Spawn a CorpseDecal with kind="blood" + verify children ──
	# Parent under root so add_child + _ready run normally.
	var holder: Node2D = Node2D.new()
	holder.name = "DecalHolder"
	root.add_child(holder)
	var d_blood: Node = decal_scene.instantiate()
	d_blood.set("kind", "blood")
	holder.add_child(d_blood)
	await process_frame
	# After _ready, the decal should have at least one Polygon2D child
	# (blood is a single polygon; others have 2+).
	var children_blood: Array = d_blood.get_children()
	var poly_count_blood: int = 0
	for ch in children_blood:
		if ch is Polygon2D:
			poly_count_blood += 1
	if poly_count_blood < 1:
		printerr("FAIL: kind='blood' produced 0 Polygon2D children")
		quit(1)
		return
	# z_index should be -1 so corpses sit below combatants.
	if (d_blood as Node2D).z_index != -1:
		printerr("FAIL: CorpseDecal z_index=%d, expected -1" % (d_blood as Node2D).z_index)
		quit(1)
		return
	print("[iter257decals] C OK — blood kind builds %d Polygon2D + z_index=-1" % poly_count_blood)

	# ── D. Each of the 6 kinds builds without error ─────────────────
	var kinds: Array = ["slime", "skeleton", "ember", "blood", "bone", "ash"]
	for k in kinds:
		var d: Node = decal_scene.instantiate()
		d.set("kind", k)
		holder.add_child(d)
		await process_frame
		var pcount: int = 0
		for ch in d.get_children():
			if ch is Polygon2D:
				pcount += 1
		if pcount < 1:
			printerr("FAIL: kind='%s' produced 0 Polygon2D children" % k)
			quit(1)
			return
	print("[iter257decals] D OK — all 6 kinds build successfully (slime/skeleton/ember/blood/bone/ash)")

	# ── E. CorpseDecal exposes lifetime ≥ 5.0 ────────────────────────
	var d_for_life: Node = decal_scene.instantiate()
	holder.add_child(d_for_life)
	await process_frame
	var lifetime_val: float = float(d_for_life.get("lifetime"))
	if lifetime_val < 5.0:
		printerr("FAIL: CorpseDecal.lifetime = %.2f, expected ≥ 5.0" % lifetime_val)
		quit(1)
		return
	print("[iter257decals] E OK — CorpseDecal.lifetime = %.2f (≥ 5.0)" % lifetime_val)

	# ── F. enemy.gd._die spawns a CorpseDecal (source-grep guard) ───
	var enemy_src: String = enemy_script.source_code
	if enemy_src.find("CORPSE_DECAL_SCENE") < 0:
		printerr("FAIL: enemy.gd missing CORPSE_DECAL_SCENE preload")
		quit(1)
		return
	if enemy_src.find("_spawn_corpse_decal") < 0:
		printerr("FAIL: enemy.gd missing _spawn_corpse_decal function")
		quit(1)
		return
	# Make sure the call is INSIDE _die (defensive: scope-check via
	# substring window from _die declaration).
	var die_idx: int = enemy_src.find("func _die")
	if die_idx < 0:
		printerr("FAIL: enemy.gd missing _die function")
		quit(1)
		return
	# Scan from _die onward to the next top-level func — find the next
	# "\nfunc " after _die's body.
	var next_func_idx: int = enemy_src.find("\nfunc ", die_idx + 5)
	var die_body: String = enemy_src.substr(die_idx, max(0, next_func_idx - die_idx)) if next_func_idx >= 0 else enemy_src.substr(die_idx)
	if die_body.find("_spawn_corpse_decal") < 0:
		printerr("FAIL: _die does not call _spawn_corpse_decal")
		quit(1)
		return
	print("[iter257decals] F OK — _die spawns CorpseDecal via _spawn_corpse_decal()")

	print("[iter257decals] PASS — enemy death drama wired end to end")
	quit(0)
