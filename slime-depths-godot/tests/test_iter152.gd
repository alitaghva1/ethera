extends SceneTree

# Iter 152 — Enemy idle bob.
#
# Pre-iter-152 enemies were visually STATIC — they played their idle
# anim if available (some have animated frames; others have a single
# frame). The sprite.position.y was set once at _ready via
# enemy_type.sprite_y_offset and never moved. In rooms with multiple
# enemies clumped together, they read as "statues pinned to the
# floor" until they started chasing.
#
# Genre cue: hero already has iter-132's walk bob + iter-11's idle bob.
# Hades enemies all subtly breathe. Isaac enemies don't (the discrete
# pixel-art style is part of the visual identity), but our smoother
# style closer to Hades benefits from the alive-feeling motion.
#
# Iter-152 adds a 2 Hz × 1.5 px vertical sin bob on enemy sprites
# during non-action states:
#   • Skip during _dying (death anim owns the sprite)
#   • Skip during _spawn_in_time (the materialization fade should be
#     still — bobbing during fade-in looks like a glitch)
#   • Skip during _hurt_anim_time (hurt should look like a real
#     flinch, not flinch + bob)
#   • Otherwise (walk, idle, attack windup) — bob constant
#
# Each enemy randomizes _idle_bob_phase at _ready via randf() * TAU
# so a clump doesn't bob in lockstep. The phase spreads bobs evenly
# across the sin cycle — visually reads as "individuals breathing"
# instead of "synced zombies."
#
# Implementation lives in a new _process function (not _physics_process)
# so the bob runs at render framerate for smoothness — physics 60 Hz
# fixed step would feel choppy at low refresh.
func _initialize() -> void:
	var ok := true

	var gd := FileAccess.get_file_as_string("res://scripts/enemy.gd")

	# ═══ Constants ═══
	if "IDLE_BOB_AMP: float = 1.5" not in gd:
		push_error("FAIL: missing IDLE_BOB_AMP = 1.5 (subtle but visible)")
		ok = false
	if "IDLE_BOB_FREQ: float = 2.0" not in gd:
		push_error("FAIL: missing IDLE_BOB_FREQ = 2.0 Hz")
		ok = false
	if "var _idle_bob_phase: float = 0.0" not in gd:
		push_error("FAIL: missing _idle_bob_phase instance var")
		ok = false

	# ═══ Random phase init at _ready ═══
	if "_idle_bob_phase = randf() * TAU" not in gd:
		push_error("FAIL: _ready should randomize _idle_bob_phase via randf() * TAU")
		ok = false

	# ═══ _process exists with right gates ═══
	if "func _process(_delta: float) -> void:" not in gd:
		push_error("FAIL: missing _process(_delta) for the idle bob")
		ok = false
	if "if _dying or _spawn_in_time > 0.0 or _hurt_anim_time > 0.0:" not in gd:
		push_error("FAIL: _process should skip bob during dying/spawn-in/hurt-anim")
		ok = false

	# ═══ Bob math uses Time.get_ticks_msec() ═══
	if "Time.get_ticks_msec() / 1000.0" not in gd:
		push_error("FAIL: bob phase should use Time.get_ticks_msec() for global clock")
		ok = false
	# Iter 153 refactored the one-line bob into (sin_v, bob) so the shadow
	# pulse could share sin_v. Check the two-line form here.
	if "sin((t * TAU * IDLE_BOB_FREQ) + _idle_bob_phase)" not in gd:
		push_error("FAIL: bob phase formula should be sin(t*TAU*FREQ + phase)")
		ok = false
	if "sin_v * IDLE_BOB_AMP" not in gd:
		push_error("FAIL: bob amplitude should be sin_v * IDLE_BOB_AMP")
		ok = false

	# ═══ Bob applied as offset from baseline ═══
	if "sprite.position.y = enemy_type.sprite_y_offset + bob" not in gd:
		push_error("FAIL: bob should set sprite.position.y = enemy_type.sprite_y_offset + bob")
		ok = false

	if ok:
		print("OK enemy idle bob: 2 Hz × 1.5 px sin offset per enemy, random phase")
		print("=== ITER 152 INTEGRATION PASSED ===")
	else:
		print("=== ITER 152 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
