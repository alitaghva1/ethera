extends SceneTree

# Iter 97 — combat movement feel rework.
#
# User playtest feedback: "When you use melee it dashes forward in an
# almost unrealistic way. When you shoot or use melee while moving it
# seems to feel unnatural, we got this fixed in the version of the game
# that didn't use Godot but not this."
#
# Two coordinated changes, both anchored on the JS reference at
# slime-depths/src/hero.js:
#
# 1. Removed the additive forward lunge (LUNGE_SPEED=220, LUNGE_TIME=0.10)
#    that fired every swing. The JS code has no such impulse — the
#    "feels unnatural while moving" complaint came from the lunge stacking
#    on top of move_toward walk acceleration out-of-sync.
#
# 2. Replaced the lunge with a stance multiplier: ATTACK_MOVE_SPEED_MUL=0.35.
#    While _is_attacking, walk speed scales to 35%. "Committed swing"
#    feel matching Hades/Diablo/PoE (hero.js:1812-1817 documents this
#    as the design intent).
#
# 3. Added BLAST_FACING_WINDOW=0.32. After a blast cast, the sprite
#    commits to the aim direction for 0.32s even while WASD movement
#    continues. Prevents "walking west + shooting east → sprite faces
#    west" (hero.js:1413-1420).
func _initialize() -> void:
	var ok := true
	var hero_src := FileAccess.get_file_as_string("res://scripts/hero.gd")

	# ═══ 1. LUNGE removed ═══
	# Constants gone — none of LUNGE_SPEED / LUNGE_TIME should be
	# declared as const anywhere. (Comments mentioning the removal are OK.)
	var lines: PackedStringArray = hero_src.split("\n")
	for line in lines:
		var trimmed: String = line.strip_edges()
		if trimmed.begins_with("#"):
			continue
		if "const LUNGE_SPEED" in line or "const LUNGE_TIME" in line:
			push_error("FAIL: LUNGE_* const still declared: %s" % trimmed)
			ok = false
		# Active-code references to _lunge_time/_lunge_dir would be live
		# uses of the removed state vars.
		for tok in ["_lunge_time", "_lunge_dir"]:
			if "var %s" % tok in line or "%s = " % tok in line or "%s +" % tok in line:
				push_error("FAIL: live reference to removed %s: %s" % [tok, trimmed])
				ok = false
	print("OK no live LUNGE_* / _lunge_* references in hero.gd")

	# ═══ 2. ATTACK_MOVE_SPEED_MUL = 0.35 present and applied ═══
	# Whitespace-tolerant: the source uses aligned spacing
	# `const ATTACK_MOVE_SPEED_MUL := 0.35` with optional padding spaces.
	if not (hero_src.contains("ATTACK_MOVE_SPEED_MUL") and hero_src.contains(":= 0.35")):
		push_error("FAIL: ATTACK_MOVE_SPEED_MUL = 0.35 const missing")
		ok = false
	else:
		print("OK ATTACK_MOVE_SPEED_MUL = 0.35 declared (matches JS hero.js:1818)")
	# It must be APPLIED to speed in _physics_process. Look for
	# `speed *= ATTACK_MOVE_SPEED_MUL` or similar.
	if not (hero_src.contains("speed *= ATTACK_MOVE_SPEED_MUL") or hero_src.contains("speed * ATTACK_MOVE_SPEED_MUL")):
		push_error("FAIL: ATTACK_MOVE_SPEED_MUL not applied to walk speed in _physics_process")
		ok = false
	else:
		print("OK walk speed scales by ATTACK_MOVE_SPEED_MUL while _is_attacking")
	# It must be guarded by _is_attacking — otherwise the slow would
	# fire all the time.
	# Look at the line where ATTACK_MOVE_SPEED_MUL is used and confirm
	# an `if _is_attacking:` appears within the preceding 3 lines.
	var amsm_idx: int = hero_src.find("speed *= ATTACK_MOVE_SPEED_MUL")
	if amsm_idx > 0:
		var preceding: String = hero_src.substr(max(0, amsm_idx - 200), 200)
		if "if _is_attacking" not in preceding:
			push_error("FAIL: ATTACK_MOVE_SPEED_MUL applied unconditionally (not guarded by _is_attacking)")
			ok = false
		else:
			print("OK ATTACK_MOVE_SPEED_MUL guarded by `if _is_attacking`")

	# ═══ 3. BLAST_FACING_WINDOW + state vars + arming + facing branch ═══
	# Whitespace-tolerant.
	if not (hero_src.contains("BLAST_FACING_WINDOW") and hero_src.contains(":= 0.32")):
		push_error("FAIL: BLAST_FACING_WINDOW = 0.32 const missing")
		ok = false
	else:
		print("OK BLAST_FACING_WINDOW = 0.32 declared (matches JS hero.js:1420)")
	if not (hero_src.contains("var _blast_facing_time") and hero_src.contains("var _blast_facing_dir")):
		push_error("FAIL: _blast_facing_time / _blast_facing_dir state vars missing")
		ok = false
	else:
		print("OK _blast_facing_time + _blast_facing_dir state vars declared")
	# Decayed in _physics_process
	if not hero_src.contains("_blast_facing_time = max(0.0, _blast_facing_time - delta)"):
		push_error("FAIL: _blast_facing_time isn't decayed in _physics_process")
		ok = false
	else:
		print("OK _blast_facing_time decays each tick")
	# Armed in _start_blast
	var sb_idx: int = hero_src.find("func _start_blast()")
	if sb_idx < 0:
		push_error("FAIL: _start_blast function missing")
		ok = false
	else:
		var sb_body: String = hero_src.substr(sb_idx, 1500)
		if not sb_body.contains("_blast_facing_time = BLAST_FACING_WINDOW"):
			push_error("FAIL: _start_blast doesn't arm _blast_facing_time")
			ok = false
		elif not sb_body.contains("_blast_facing_dir = aim"):
			push_error("FAIL: _start_blast doesn't capture the aim direction")
			ok = false
		else:
			print("OK _start_blast arms the BLAST_FACING_WINDOW")
	# Read in _compute_facing
	var cf_idx: int = hero_src.find("func _compute_facing")
	if cf_idx < 0:
		push_error("FAIL: _compute_facing function missing")
		ok = false
	else:
		var cf_body: String = hero_src.substr(cf_idx, 1000)
		if not (cf_body.contains("_blast_facing_time > 0.0") and cf_body.contains("_blast_facing_dir")):
			push_error("FAIL: _compute_facing doesn't honor _blast_facing_time")
			ok = false
		else:
			print("OK _compute_facing honors the blast facing window")

	# ═══ 4. Runtime smoke — hero scene loads + new methods present ═══
	var scene := load("res://scenes/hero.tscn") as PackedScene
	if scene == null:
		push_error("FAIL: hero.tscn no longer loads after iter-97")
		ok = false
	else:
		var inst: Node = scene.instantiate()
		if inst == null:
			push_error("FAIL: hero scene failed to instantiate")
			ok = false
		else:
			# Default state — facing window should be 0
			if "_blast_facing_time" not in inst:
				push_error("FAIL: instantiated hero missing _blast_facing_time property")
				ok = false
			elif inst._blast_facing_time != 0.0:
				push_error("FAIL: _blast_facing_time default should be 0.0, got %s" % inst._blast_facing_time)
				ok = false
			else:
				print("OK hero instance has _blast_facing_time defaulting to 0.0")
			# ATTACK_MOVE_SPEED_MUL accessible as a class const
			if "ATTACK_MOVE_SPEED_MUL" not in inst:
				push_error("FAIL: ATTACK_MOVE_SPEED_MUL not exposed on instance")
				ok = false
			elif inst.ATTACK_MOVE_SPEED_MUL != 0.35:
				push_error("FAIL: ATTACK_MOVE_SPEED_MUL value is %s, expected 0.35" % inst.ATTACK_MOVE_SPEED_MUL)
				ok = false
			else:
				print("OK ATTACK_MOVE_SPEED_MUL exposed as const, value = 0.35")
			inst.queue_free()

	if ok:
		print("=== ITER 97 INTEGRATION PASSED ===")
	else:
		print("=== ITER 97 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
