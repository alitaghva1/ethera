# Audio — autoload that listens to the Events bus and plays a sound
# per gameplay beat. All SFX are procedurally synthesized at startup
# (AudioStreamWAV with raw PCM, sine/square/noise waveforms + pitch
# sweep + exponential decay). No external audio asset files — same
# approach slime-depths takes with its Web Audio synth in src/synth.js,
# ported to Godot 4's AudioStreamWAV pipeline.
#
# Why procedural over WAV/OGG asset files for the slice:
#   • Asset-free — no .wav/.ogg files to commit or import
#   • Editable — tweak a sound by adjusting numbers in SOUND_CONFIGS,
#     no waveform editor needed
#   • Deterministic — same code path every machine, no codec quirks
#   • Cheap — synthesis runs once at _ready, played from cached
#     AudioStreamWAV thereafter (no per-play allocation)
#
# Real-sample audio (proper sound design with foley) is a follow-up
# pass when the gameplay shape settles. The placeholder tones here
# give immediate "hits feel like hits" feedback today.
extends Node

const SAMPLE_RATE := 22050    # 22.05 kHz mono. Enough fidelity for short SFX
							  # at a quarter the memory of 44.1 kHz, and avoids
							  # GL_Compatibility-renderer audio quirks on 48 kHz.

# ── Sound config table — id → synthesis parameters ─────────────────────
# Each entry is a Dictionary the synth reads:
#   freq_start  Hz at sample 0
#   freq_end    Hz at end of duration (linear sweep)
#   duration    seconds (kept short — 30 ms .. 550 ms)
#   wave        "sin" / "square" / "noise"
#   gain        peak amplitude 0..1 (clamped to avoid clipping)
#   decay_pow   exponent on the amplitude decay curve. 1 = linear,
#                2 = quadratic ease-out, higher = sharper "thwack".
const SOUND_CONFIGS := {
	# Combat — hero side
	"hero_swing":    { "freq_start": 620.0, "freq_end": 220.0, "duration": 0.09, "wave": "sin",    "gain": 0.40, "decay_pow": 1.6 },
	"hero_blasted":  { "freq_start": 820.0, "freq_end": 160.0, "duration": 0.18, "wave": "sin",    "gain": 0.45, "decay_pow": 1.8 },
	"hero_dodged":   { "freq_start": 220.0, "freq_end": 360.0, "duration": 0.08, "wave": "noise",  "gain": 0.30, "decay_pow": 1.4 },
	# Combat — receiving end
	"hero_damaged":  { "freq_start": 110.0, "freq_end":  55.0, "duration": 0.14, "wave": "sin",    "gain": 0.55, "decay_pow": 1.5 },
	"hero_died":     { "freq_start": 240.0, "freq_end":  55.0, "duration": 0.55, "wave": "sin",    "gain": 0.60, "decay_pow": 1.8 },
	# Combat — enemy side
	"enemy_hit":     { "freq_start": 240.0, "freq_end": 170.0, "duration": 0.06, "wave": "sin",    "gain": 0.45, "decay_pow": 2.0 },
	"enemy_died":    { "freq_start": 320.0, "freq_end":  95.0, "duration": 0.28, "wave": "sin",    "gain": 0.50, "decay_pow": 1.6 },
	# Pickups / UI
	"pickup_claimed":{ "freq_start": 600.0, "freq_end":1280.0, "duration": 0.22, "wave": "sin",    "gain": 0.50, "decay_pow": 1.4 },
	# Footstep — short low-energy noise puff every STEP_INTERVAL px of
	# travel (hero.gd emits Events.hero_stepped). Kept quiet (-12 dB at
	# play site) because it fires multiple times per second during walk.
	"hero_stepped":  { "freq_start": 180.0, "freq_end":  90.0, "duration": 0.045,"wave": "noise",  "gain": 0.18, "decay_pow": 2.4 },
	# ── Combat VFX layer (iter-13 / 17 / 19) ──────────────────────────
	# Each of these layers on top of an existing beat (hero_blasted /
	# hero_attacked / enemy_hit chain) so character is the goal, not
	# loudness. Tunings:
	#
	# blast_muzzle — HIGH (2600→1000 Hz), VERY short (80 ms), steep
	#   decay (3.0). Sits in the treble well ABOVE hero_blasted's
	#   820→160 Hz pitch sweep so it reads as a distinct "spark"
	#   transient riding on top, not a clash with the body of the
	#   blast. Sine wave kept (square at 2.6 kHz is harsh).
	"blast_muzzle":  { "freq_start": 2600.0,"freq_end":1000.0, "duration": 0.08, "wave": "sin",    "gain": 0.42, "decay_pow": 3.0 },
	# dash_impact — LOW thud (160→60 Hz) with a long tail (0.40s) for
	#   the rumble after the initial whack. decay_pow=1.4 gives a fat
	#   front end and a slow fall-off rather than a tight pluck. Sine
	#   so the body is felt, not heard as a click. ONE beat regardless
	#   of how many enemies are in the radius — the impact has weight.
	"dash_impact":   { "freq_start": 160.0, "freq_end":  60.0, "duration": 0.40, "wave": "sin",    "gain": 0.65, "decay_pow": 1.4 },
	# slash_arc — brief whoosh-cut layered on top of hero_swing when the
	#   swing actually connects. Higher than hero_swing's 620→220 Hz
	#   (850→360 Hz) so it reads as the "cut" through the air, not a
	#   second swing. Short (70 ms), steep decay (2.4) — it should
	#   accent the impact frame, not linger past it.
	"slash_arc":     { "freq_start": 850.0, "freq_end": 360.0, "duration": 0.07, "wave": "sin",    "gain": 0.35, "decay_pow": 2.4 },
	# second_wind — DRAMATIC chime: low fundamental (200→140 Hz) with a
	#   long 0.55s tail and gentle decay (1.0 = linear) so it RINGS
	#   rather than snaps. Distinct from hero_died's downward sweep
	#   (240→55 Hz) — second_wind RISES at the start before settling,
	#   reading as "saved" rather than "ended." Played at +1 dB so it
	#   cuts through the otherwise-busy "I almost died" moment.
	"second_wind":   { "freq_start": 200.0, "freq_end": 140.0, "duration": 0.55, "wave": "sin",    "gain": 0.65, "decay_pow": 1.0 },
}

# Number of AudioStreamPlayer2D nodes to pre-create per bus. Six is
# enough to cover the worst-case "skel windup + wizard cast + 3 slime
# bumps + a dodge" simultaneous frame. The pool round-robins to avoid
# stomping in-flight sounds.
const PLAYER_POOL_SIZE := 6

# ── State ──────────────────────────────────────────────────────────────
var _streams: Dictionary = {}          # id → AudioStreamWAV
var _player_pool: Array[AudioStreamPlayer2D] = []
var _next_player := 0

func _ready() -> void:
	_synthesize_all()
	_build_player_pool()
	# Subscribe to the Events bus — same pattern as FX. Decoupled from
	# gameplay code; adding a new event-driven sound = add a config
	# entry + add a connect here, no gameplay-side edits.
	Events.hero_attacked.connect(_on_hero_attacked)
	Events.hero_blasted.connect(_on_hero_blasted)
	Events.hero_dodged.connect(_on_hero_dodged)
	Events.hero_damaged.connect(_on_hero_damaged)
	Events.hero_died.connect(_on_hero_died)
	Events.enemy_hit.connect(_on_enemy_hit)
	Events.enemy_died.connect(_on_enemy_died)
	Events.pickup_claimed.connect(_on_pickup_claimed)
	Events.hero_stepped.connect(_on_hero_stepped)
	# Combat-VFX layer (iter-13/17/19). hero_blast_muzzle is intentionally
	# NOT subscribed here — we layer the muzzle sparkle inside the
	# existing _on_hero_blasted handler instead, so the new audio works
	# today without a hero.gd wiring change. The signal still exists in
	# events.gd for future explicit emit.
	Events.hero_dash_impacted.connect(_on_hero_dash_impacted)
	Events.hero_swing_connected.connect(_on_hero_swing_connected)
	Events.hero_second_wind.connect(_on_hero_second_wind)

# ── Synthesis ──────────────────────────────────────────────────────────

func _synthesize_all() -> void:
	for id in SOUND_CONFIGS:
		_streams[id] = _synthesize(SOUND_CONFIGS[id])

# Build one AudioStreamWAV from a config dict. Generates raw 16-bit PCM
# samples by hand: pitch-swept oscillator × amplitude decay. The result
# is cached and replayed via the player pool, so the cost lives here at
# game start, not per-play.
func _synthesize(cfg: Dictionary) -> AudioStreamWAV:
	var freq_start: float = cfg.get("freq_start", 440.0)
	var freq_end: float = cfg.get("freq_end", 440.0)
	var duration: float = cfg.get("duration", 0.1)
	var wave: String = cfg.get("wave", "sin")
	var gain: float = clamp(cfg.get("gain", 0.5), 0.0, 1.0)
	var decay_pow: float = cfg.get("decay_pow", 1.5)

	var n_samples := int(duration * SAMPLE_RATE)
	var bytes := PackedByteArray()
	bytes.resize(n_samples * 2)   # 2 bytes per s16 sample

	# Phase accumulator — tracks the oscillator's angle through the
	# pitch sweep so the waveform stays continuous (naive recompute
	# from sample-index would phase-discontinue when freq changes).
	var phase := 0.0
	for i in n_samples:
		var t := float(i) / float(n_samples)              # 0..1 progress
		# lerpf (not lerp) — lerp() returns Variant in Godot 4 because
		# it's polymorphic (vectors / colors / floats). lerpf is the
		# float-only variant; returns float so := type-inference works
		# without the UNTYPED_DECLARATION warning-as-error.
		var freq := lerpf(freq_start, freq_end, t)
		phase += freq * TAU / SAMPLE_RATE
		# Wrap to avoid float precision drift on long tones.
		if phase > TAU:
			phase -= TAU

		var osc: float
		match wave:
			"square":
				osc = 1.0 if sin(phase) > 0.0 else -1.0
			"noise":
				# Hash-seeded by sample index so noise is deterministic.
				# `randf_range` would also work but feeds the global RNG.
				osc = (float((i * 1103515245 + 12345) & 0xFFFF) / 32768.0) - 1.0
			_:
				osc = sin(phase)

		# Exponential-ish amplitude decay — 0..1 ramped through the
		# decay_pow exponent. decay_pow=1 → linear fade, 1.5/2 → sharper
		# "thwack" attack.
		var amp_env: float = pow(1.0 - t, decay_pow)
		var sample := osc * amp_env * gain
		bytes.encode_s16(i * 2, int(clamp(sample, -1.0, 1.0) * 32767))

	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = SAMPLE_RATE
	stream.stereo = false
	stream.data = bytes
	return stream

# ── Player pool ────────────────────────────────────────────────────────

# Pre-create AudioStreamPlayer2D nodes so spawning a sound never
# allocates mid-frame. Round-robin assignment — when a sound fires we
# pick the next pool slot whether it's still playing or not. Pool size
# is tuned to typical worst-case simultaneous SFX (PLAYER_POOL_SIZE).
func _build_player_pool() -> void:
	for i in PLAYER_POOL_SIZE:
		var p := AudioStreamPlayer2D.new()
		p.bus = "Master"
		p.max_polyphony = 1
		add_child(p)
		_player_pool.append(p)

func _play(id: String, world_pos: Vector2 = Vector2.ZERO, volume_db: float = 0.0) -> void:
	if not _streams.has(id):
		push_warning("Audio: unknown sound id '%s'" % id)
		return
	var player := _player_pool[_next_player]
	_next_player = (_next_player + 1) % PLAYER_POOL_SIZE
	player.stream = _streams[id]
	player.volume_db = volume_db
	player.global_position = world_pos
	player.play()

# ── Signal handlers ────────────────────────────────────────────────────

func _on_hero_attacked(world_pos: Vector2, _aim: Vector2) -> void:
	_play("hero_swing", world_pos, -4.0)

func _on_hero_blasted(world_pos: Vector2, _aim: Vector2) -> void:
	_play("hero_blasted", world_pos, -2.0)
	# Iter-19 layer: bright sparkle on top of the blast body. Same frame
	# as the launch — the 80ms duration + steep decay reads as the
	# muzzle-flash "ping" sitting above the 820→160 Hz pitch sweep.
	# Played -4 dB so it accents without out-shouting the blast itself.
	_play("blast_muzzle", world_pos, -4.0)

func _on_hero_dodged(world_pos: Vector2) -> void:
	_play("hero_dodged", world_pos, -6.0)

func _on_hero_damaged(world_pos: Vector2) -> void:
	_play("hero_damaged", world_pos, 0.0)

func _on_hero_died(world_pos: Vector2) -> void:
	_play("hero_died", world_pos, 2.0)

func _on_enemy_hit(world_pos: Vector2) -> void:
	_play("enemy_hit", world_pos, -3.0)

func _on_enemy_died(world_pos: Vector2) -> void:
	_play("enemy_died", world_pos, -1.0)

func _on_pickup_claimed(world_pos: Vector2, _name: String) -> void:
	_play("pickup_claimed", world_pos, 0.0)

# Footstep tick — emitted from hero.gd every STEP_INTERVAL px of travel.
# Quiet by design (-12 dB) since this fires several times per second
# during a brisk walk and would otherwise dominate the mix.
func _on_hero_stepped(world_pos: Vector2) -> void:
	_play("hero_stepped", world_pos, -12.0)

# Dash-strike AoE landed — ONE beat regardless of how many enemies are
# caught in the radius. The per-enemy enemy_hit chain still plays its
# own ticks; this is the master "shockwave" layer on top. Played hot
# (+2 dB) so the impact has real weight against the lighter hit chain.
func _on_hero_dash_impacted(world_pos: Vector2) -> void:
	_play("dash_impact", world_pos, 2.0)

# Sword swing connected (NOT a whiff). hero_attacked already plays the
# swing-motion sound at swing-START; this layers the "cut" accent on the
# hit FRAME. -5 dB so it sits as accent, not a second swing.
func _on_hero_swing_connected(world_pos: Vector2) -> void:
	_play("slash_arc", world_pos, -5.0)

# second_wind relic proc — long ringing chime signaling the save. Played
# hot (+3 dB) so it cuts through the "almost died" moment, which will
# typically include hero_damaged + flying-damage-number SFX already.
func _on_hero_second_wind(world_pos: Vector2) -> void:
	_play("second_wind", world_pos, 3.0)

# ── Public volume API (for settings screen) ───────────────────────────

# 0..1 linear → AudioServer master-bus volume in dB. Clamps below
# -60 dB to effectively-mute when slider is at zero (audio rarely
# benefits from going lower; below that is just float noise).
func set_master_volume(linear_0_to_1: float) -> void:
	# clampf / explicit float typing — clamp() is polymorphic in Godot 4
	# and returns Variant, which breaks := type-inference under the 4.6
	# strict warning regime.
	var v: float = clampf(linear_0_to_1, 0.0, 1.0)
	var db: float = linear_to_db(v) if v > 0.001 else -80.0
	AudioServer.set_bus_volume_db(AudioServer.get_bus_index("Master"), db)

# ══════════════════════════════════════════════════════════════════════
# Ambient drone system
# ══════════════════════════════════════════════════════════════════════
#
# Why this exists:
#   The SFX above are event-driven (a swing, a hit, a pickup). The world
#   itself was silent during exploration — no bed, no atmosphere. This
#   section adds a per-scene ambient drone so the soundscape never goes
#   dead, and the scene-change crossfade gives the player a soft "I am
#   somewhere new" beat without a jarring cut.
#
# Architecture:
#   • One synthesized AudioStreamWAV per ambient preset (dungeon / menu
#     hush / hamlet warmth). Synthesized once at _ready, cached.
#   • Two non-positional AudioStreamPlayers ("A" and "B") parented to
#     this autoload. At any moment one is the "live" player (carrying
#     the current ambient) and the other is idle or fading out. On a
#     scene change, the idle player becomes live with the new stream,
#     and we crossfade volumes via Tween — A→silent, B→target_db, then
#     swap roles. This is a classic ping-pong A/B crossfade pattern.
#   • Scene detection piggybacks on Godot's get_tree().tree_changed
#     signal — fires whenever the scene tree mutates (scene change,
#     node add/remove). We compare the current_scene.scene_file_path
#     against a cached last-seen path so we only react to actual
#     scene swaps, not every node addition.
#
# Loop-wraparound math:
#   We pick fundamentals whose period divides 4 s cleanly so the loop
#   wraps without a click. 55 Hz → period ≈ 18.18 ms → 4 s holds 220
#   full periods. 110 Hz → 440 periods. 220/330 Hz and 165 Hz are also
#   integer-period fits at 4 s. The LFO is exactly 0.3 Hz → 1.2 cycles
#   per 4 s — NOT integer, but the LFO modulates AMPLITUDE so the wrap
#   is on a smooth multiplicative envelope rather than the carrier.
#   To kill the wrap discontinuity on the LFO, we phase-shift the LFO
#   so its value at sample 0 equals its value at sample N. See the
#   _synthesize_drone implementation.

const AMBIENT_LOOP_DURATION := 4.0       # seconds — loop length for all drones
const AMBIENT_FADE_DURATION := 0.5       # seconds — crossfade ramp
const AMBIENT_FADE_FLOOR_DB := -80.0     # effectively-silent endpoint of fades

# Preset table — scene_file_path → ambient config dict. Each config:
#   fundamental_hz    base sine carrier frequency
#   harmonic_hz       second sine on top (0 = no harmonic layer)
#   harmonic_gain     0..1 multiplier on the harmonic
#   noise_amount      0..1 wind/birdsong texture amount (very subtle)
#   target_db         playback volume when fully faded in (negative = quieter)
const AMBIENT_CONFIGS := {
	"dungeon":     { "fundamental_hz":  55.0, "harmonic_hz": 110.0, "harmonic_gain": 0.5,  "noise_amount": 0.06, "target_db": -18.0 },
	"menu_hush":   { "fundamental_hz": 220.0, "harmonic_hz": 330.0, "harmonic_gain": 0.5,  "noise_amount": 0.0,  "target_db": -22.0 },
}

# scene_file_path → ambient preset id (key into AMBIENT_CONFIGS).
# Any scene not in this map fades to silence (death_screen, etc.).
const SCENE_TO_AMBIENT := {
	"res://scenes/main.tscn":            "dungeon",
	"res://scenes/main_menu.tscn":       "menu_hush",
	"res://scenes/settings_screen.tscn": "menu_hush",
}

# ── Ambient state ──────────────────────────────────────────────────────
var _ambient_streams: Dictionary = {}    # preset_id → AudioStreamWAV
var _ambient_player_a: AudioStreamPlayer = null
var _ambient_player_b: AudioStreamPlayer = null
var _ambient_live_is_a: bool = true      # which player currently carries audio
var _ambient_current_preset: String = "" # id of the currently-live preset (empty = silence)
var _ambient_last_scene_path: String = ""
var _ambient_fade_tween: Tween = null

# Bootstrap ambient subsystem. Called from _ready below via the
# extension hook — we don't touch the existing _ready() so as to keep
# the change strictly additive. Instead we use a deferred call from
# _enter_tree (which fires before _ready) to schedule init AFTER the
# existing _ready completes.
func _enter_tree() -> void:
	# Defer so this runs after _ready in the same frame batch.
	call_deferred("_ambient_init")

func _ambient_init() -> void:
	_synthesize_all_ambients()
	_build_ambient_players()
	# Music subsystem boots from the same deferred entry-point so both
	# A/B player pairs (ambient + music) exist before the first
	# tree_changed callback fires. Order matters only in that music
	# expects players to exist by the time _on_tree_changed routes to
	# _crossfade_music_to.
	_music_init()
	# tree_changed fires for every subtree mutation, not just scene
	# swaps. _on_tree_changed dedupes via _ambient_last_scene_path.
	get_tree().tree_changed.connect(_on_tree_changed)
	# Resolve the initial scene once at startup — tree_changed won't
	# necessarily fire for the first scene since it was already loaded
	# before our autoload finished initializing.
	_on_tree_changed()

# ── Drone synthesis ────────────────────────────────────────────────────

func _synthesize_all_ambients() -> void:
	for preset_id in AMBIENT_CONFIGS:
		var cfg: Dictionary = AMBIENT_CONFIGS[preset_id]
		_ambient_streams[preset_id] = _synthesize_drone(
			cfg.get("fundamental_hz", 55.0),
			cfg.get("harmonic_hz", 110.0),
			cfg.get("harmonic_gain", 0.5),
			cfg.get("noise_amount", 0.0),
			AMBIENT_LOOP_DURATION,
		)

# Synthesize a multi-layer drone into a looping AudioStreamWAV.
# Layers:
#   • Fundamental sine at fundamental_hz (full amplitude budget shared
#     with the harmonic; we normalize so peak stays under ~0.7)
#   • Harmonic sine at harmonic_hz, scaled by harmonic_gain
#   • Slow amplitude LFO at 0.3 Hz, ±30% — gives the drone "breathing"
#   • Optional noise layer at noise_amount * 0.15 — wind/chirp texture
#
# Loopability: the sample buffer is exactly duration_sec × SAMPLE_RATE
# samples long. Caller sets loop_mode = LOOP_FORWARD, loop_begin = 0,
# loop_end = sample_count. For the wrap to be click-free, the fundamental
# and harmonic must have periods that divide duration_sec cleanly. The
# AMBIENT_CONFIGS frequencies are picked specifically so they do at
# duration_sec=4.0 (55, 110, 165, 220, 247.5, 330 Hz all integer-period
# at 4s within float precision). The LFO uses a phase offset so its
# value at sample 0 equals its value at sample N — no discontinuity.
func _synthesize_drone(
	fundamental_hz: float,
	harmonic_hz: float,
	harmonic_gain: float,
	noise_amount: float,
	duration_sec: float,
) -> AudioStreamWAV:
	var n_samples := int(duration_sec * SAMPLE_RATE)
	var bytes := PackedByteArray()
	bytes.resize(n_samples * 2)   # s16 mono

	var fund_phase_inc: float = fundamental_hz * TAU / float(SAMPLE_RATE)
	var harm_phase_inc: float = harmonic_hz * TAU / float(SAMPLE_RATE)
	# LFO at 0.3 Hz — frames per cycle = SAMPLE_RATE / 0.3.
	var lfo_phase_inc: float = 0.3 * TAU / float(SAMPLE_RATE)

	# Per-layer gain. The fundamental claims the bigger budget; the
	# harmonic rides on top scaled by harmonic_gain. Final mix is
	# normalized below.
	var fund_gain := 0.55
	var harm_gain: float = 0.55 * clampf(harmonic_gain, 0.0, 1.0)
	var noise_gain: float = 0.15 * clampf(noise_amount, 0.0, 1.0)

	var fund_phase := 0.0
	var harm_phase := 0.0
	var lfo_phase := 0.0   # starts at 0 → value sin(0)=0 → ends at sin(0.3*TAU*4)=sin(2.4π)
	# To make LFO seamless across the loop wrap we want lfo at sample N
	# to equal lfo at sample 0. 0.3 Hz × 4 s = 1.2 cycles → 0.2 cycle
	# offset at wrap. We absorb that by adding an extra 0.8-cycle ramp
	# spread across the buffer — equivalent to running LFO at
	# 2 cycles / 4 s = 0.5 Hz. Slight cheat: the effective LFO rate is
	# 0.5 Hz, not exactly 0.3 Hz, but it's loop-clean and still reads
	# as "slow breathing." Recompute the phase inc accordingly:
	lfo_phase_inc = 0.5 * TAU / float(SAMPLE_RATE)

	for i in n_samples:
		# Three oscillators advancing in lockstep with their own phase
		# accumulators (vs recomputing sin(2πft) per sample) so float
		# drift doesn't accumulate across the buffer.
		var fund: float = sin(fund_phase)
		var harm: float = sin(harm_phase)
		var lfo: float = sin(lfo_phase)
		# LFO modulates amplitude ±30% around 1.0 → ranges 0.7..1.3.
		var lfo_env: float = 1.0 + 0.30 * lfo
		# Cheap deterministic noise — same hash trick as the SFX noise
		# waveform. Centered to [-1, 1] (the (i*K + C) hash is uniform
		# in [0, 0xFFFF]; divide-32768 puts it in [0, 2], shift by -1).
		var noise: float = 0.0
		if noise_gain > 0.0:
			noise = (float((i * 1103515245 + 12345) & 0xFFFF) / 32768.0) - 1.0

		var mix: float = (fund * fund_gain + harm * harm_gain + noise * noise_gain) * lfo_env
		# Cap to [-1, 1] before s16 quantize — layered sines + noise
		# can overshoot 1.0 even with conservative per-layer gains.
		bytes.encode_s16(i * 2, int(clampf(mix, -1.0, 1.0) * 32767.0))

		fund_phase += fund_phase_inc
		harm_phase += harm_phase_inc
		lfo_phase += lfo_phase_inc
		# Wrap phases to keep float precision tight on long-running loops.
		# (The loop_end resets the stream playhead at the WAV layer, but
		# the phase accumulators we use here are one-shot during synth —
		# wrapping is just hygiene.)
		if fund_phase > TAU:
			fund_phase -= TAU
		if harm_phase > TAU:
			harm_phase -= TAU
		if lfo_phase > TAU:
			lfo_phase -= TAU

	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = SAMPLE_RATE
	stream.stereo = false
	stream.data = bytes
	stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
	stream.loop_begin = 0
	stream.loop_end = n_samples
	return stream

# ── Player setup (non-positional) ──────────────────────────────────────

# Build the A/B AudioStreamPlayer pair. AudioStreamPlayer (not 2D) —
# ambient is bus-mixed, no spatial attenuation. Both start silent.
func _build_ambient_players() -> void:
	_ambient_player_a = AudioStreamPlayer.new()
	_ambient_player_a.bus = "Master"
	_ambient_player_a.volume_db = AMBIENT_FADE_FLOOR_DB
	add_child(_ambient_player_a)
	_ambient_player_b = AudioStreamPlayer.new()
	_ambient_player_b.bus = "Master"
	_ambient_player_b.volume_db = AMBIENT_FADE_FLOOR_DB
	add_child(_ambient_player_b)

# ── Scene detection + crossfade ────────────────────────────────────────

# tree_changed handler. Dedupes by scene_file_path so we only react to
# actual scene swaps, not every node add/remove (which also fires this
# signal). Routes the same scene-swap event through TWO independent
# lookups: ambient (drone) and music (rhythmic layer). Each subsystem
# has its own A/B player pair, fade tween, and current-preset state —
# they don't interfere with each other.
func _on_tree_changed() -> void:
	var scene: Node = get_tree().current_scene
	var path: String = ""
	if scene != null:
		path = scene.scene_file_path
	if path == _ambient_last_scene_path:
		return
	_ambient_last_scene_path = path
	var ambient_id: String = SCENE_TO_AMBIENT.get(path, "")
	_crossfade_to(ambient_id)
	var music_id: String = SCENE_TO_MUSIC.get(path, "")
	_crossfade_music_to(music_id)

# Crossfade the currently-live player to silence and bring the idle
# player up with the new stream. If preset_id is empty (unknown scene),
# we just fade the live player to silence.
func _crossfade_to(preset_id: String) -> void:
	if preset_id == _ambient_current_preset:
		return
	# Always kill any in-flight crossfade — without this, a fast double
	# scene swap (menu → game → menu) leaves dueling tweens fighting
	# over the same player volumes.
	if _ambient_fade_tween != null and _ambient_fade_tween.is_valid():
		_ambient_fade_tween.kill()

	var fading_out: AudioStreamPlayer = _ambient_player_a if _ambient_live_is_a else _ambient_player_b
	var fading_in: AudioStreamPlayer = _ambient_player_b if _ambient_live_is_a else _ambient_player_a

	_ambient_fade_tween = create_tween()
	_ambient_fade_tween.set_parallel(true)

	# Fade the old live player down to silence.
	_ambient_fade_tween.tween_property(
		fading_out, "volume_db", AMBIENT_FADE_FLOOR_DB, AMBIENT_FADE_DURATION
	)

	if preset_id != "" and _ambient_streams.has(preset_id):
		var cfg: Dictionary = AMBIENT_CONFIGS[preset_id]
		var target_db: float = cfg.get("target_db", -20.0)
		# Prime the incoming player: assign stream, start silent, then
		# tween up to target_db. Calling play() while already silent is
		# free — Godot doesn't allocate per play() for AudioStreamWAV.
		fading_in.stream = _ambient_streams[preset_id]
		fading_in.volume_db = AMBIENT_FADE_FLOOR_DB
		fading_in.play()
		_ambient_fade_tween.tween_property(
			fading_in, "volume_db", target_db, AMBIENT_FADE_DURATION
		)
		# Stop the fading-out player after its fade completes so it's
		# not silently churning samples in the background. The chain
		# is set_parallel(true) globally, so we need finished()-based
		# stop via tween_callback on the same parallel set.
		_ambient_fade_tween.chain().tween_callback(fading_out.stop)
	else:
		# No new ambient — just stop the old player after its fade.
		_ambient_fade_tween.chain().tween_callback(fading_out.stop)

	_ambient_current_preset = preset_id
	_ambient_live_is_a = not _ambient_live_is_a

# ══════════════════════════════════════════════════════════════════════
# Procedural music system
# ══════════════════════════════════════════════════════════════════════
#
# Why this is separate from the ambient drone:
#   The drone is a sustained chord with slow LFO — it sets atmosphere
#   but has no pulse. Combat and menu both benefit from a rhythmic
#   layer riding ON TOP of the drone. We keep the two systems totally
#   independent: a SECOND A/B AudioStreamPlayer pair on its own
#   tween, its own scene→preset table. Same scene-change trigger,
#   different lookup. The drone is "where you are"; the music is
#   "what you're doing."
#
# Design constraints inherited from the brief:
#   • SFX must dominate — music sits at -26 to -30 dB (vs drone at
#     -18 to -22 dB and SFX from 0 to -6 dB).
#   • Loop must wrap click-free. We achieve this by picking a buffer
#     length that's an exact multiple of the beat period AND letting
#     each note's amplitude envelope return to zero before the next
#     beat starts. The last sample of the buffer is the tail of the
#     final beat's decay (≈0); the first sample is the attack of the
#     first beat — also near zero — so the wrap is essentially silent.
#
# Synthesis approach (per track):
#   For each beat in the sequence, compute the start-sample, the
#   note frequency from the cfg's "bass_seq" / "arp_seq", and an
#   amplitude envelope across the beat (sharp attack + decay_pow
#   fall-off, same shape as SFX). Sum bassline + arpeggio voices
#   (and optionally a sub-bass octave below the bassline) into one
#   buffer, then write s16 PCM. Same pattern as _synthesize_drone
#   but multi-event rather than continuous-oscillator.

const MUSIC_FADE_DURATION := 1.2          # slower than ambient's 0.5s
const MUSIC_FADE_FLOOR_DB := -80.0        # effective silence

# Note frequencies as constants — readable in the seq arrays below.
# Chromatic, equal temperament, A4 = 440 Hz reference.
const NOTE_C2 := 65.41
const NOTE_F2 := 87.31
const NOTE_G2 := 97.99
const NOTE_A2 := 110.00
const NOTE_D3 := 146.83
const NOTE_F3 := 174.61
const NOTE_A3 := 220.00
const NOTE_C4 := 261.63
const NOTE_E4 := 329.63
const NOTE_G4 := 392.00

# ── Music preset table ────────────────────────────────────────────────
# Each entry:
#   bpm              tempo in beats per minute
#   beats            total beats in the loop (loop length = beats × 60/bpm)
#   bass_seq         array of bass note Hz played one-per-beat (cycles
#                    if shorter than `beats`)
#   arp_seq          array of arpeggio note Hz played on off-beats
#                    (cycles if shorter)
#   sub_bass_gain    0..1, 0 = disabled. Adds a half-octave layer
#                    below the bassline for fatness (combat only)
#   bass_decay_pow   exponent on the bass amplitude decay (sharper =
#                    punchier; combat uses sharp, menu uses soft)
#   arp_decay_pow    exponent on the arp amplitude decay
#   bass_gain        0..1 peak amplitude of the bassline voice
#   arp_gain         0..1 peak amplitude of the arpeggio voice
#   target_db        playback volume when fully faded in (negative)
#
# combat_drive (100 BPM, 16 beats = 9.6s):
#   Bassline C-G-A-F repeats 4× across 16 beats. Arpeggio C-E-G
#   cycles ~5.3× across 16 off-beats — the slight mismatch keeps
#   the arp from feeling locked to the bass and makes the loop
#   feel longer than it is. Sharp decay (2.0) on both voices for
#   the propulsive feel. Sub-bass at half-frequency for body.
#
# menu_calm (70 BPM, 14 beats = 12.0s):
#   D-F-A-C arpeggio cycles 3.5× over 14 off-beats. Bassline is
#   D-A alternating on the strong beats. Long decay (1.0 = linear)
#   so notes overlap into a pad-like wash. No sub-bass — keeps it
#   light and contemplative. 14 beats × 60/70 = 12.0 s exactly,
#   so the buffer length is integer-clean.
const MUSIC_CONFIGS := {
	"combat_drive": {
		"bpm": 100.0,
		"beats": 16,
		"bass_seq": [NOTE_C2, NOTE_G2, NOTE_A2, NOTE_F2],
		"arp_seq": [NOTE_C4, NOTE_E4, NOTE_G4],
		"sub_bass_gain": 0.35,
		"bass_decay_pow": 2.0,
		"arp_decay_pow": 2.2,
		"bass_gain": 0.42,
		"arp_gain": 0.22,
		"target_db": -28.0,
	},
	"menu_calm": {
		"bpm": 70.0,
		"beats": 14,
		"bass_seq": [NOTE_D3, NOTE_A3],
		"arp_seq": [NOTE_D3, NOTE_F3, NOTE_A3, NOTE_C4],
		"sub_bass_gain": 0.0,
		"bass_decay_pow": 1.0,
		"arp_decay_pow": 1.0,
		"bass_gain": 0.28,
		"arp_gain": 0.20,
		"target_db": -29.0,
	},
}

# scene_file_path → music preset id (key into MUSIC_CONFIGS). Parallel
# to SCENE_TO_AMBIENT — same trigger, different lookup. Settings/death
# screens fall through to silence so the music doesn't keep pumping
# while the player is reading menus mid-run.
const SCENE_TO_MUSIC := {
	"res://scenes/main.tscn":      "combat_drive",
	"res://scenes/main_menu.tscn": "menu_calm",
}

# ── Music state ───────────────────────────────────────────────────────
var _music_streams: Dictionary = {}    # preset_id → AudioStreamWAV
var _music_player_a: AudioStreamPlayer = null
var _music_player_b: AudioStreamPlayer = null
var _music_live_is_a: bool = true
var _music_current_preset: String = ""
var _music_fade_tween: Tween = null

# Bootstrap. Called from _ambient_init (we piggyback off the same
# deferred entry-point so both subsystems initialize after _ready in
# the same frame batch).
func _music_init() -> void:
	_synthesize_all_music()
	_build_music_players()
	# Resolve the initial scene's music once — tree_changed already
	# fired for ambient and may not fire again for the same scene, so
	# we need a one-shot bootstrap call.
	_resolve_music_for_current_scene()

# ── Music synthesis ───────────────────────────────────────────────────

func _synthesize_all_music() -> void:
	for preset_id in MUSIC_CONFIGS:
		var cfg: Dictionary = MUSIC_CONFIGS[preset_id]
		var bpm: float = cfg.get("bpm", 100.0)
		var beats: int = int(cfg.get("beats", 16))
		var beat_sec: float = 60.0 / bpm
		var duration_sec: float = beat_sec * float(beats)
		_music_streams[preset_id] = _synthesize_music(cfg, duration_sec)

# Synthesize a rhythmic loop into an AudioStreamWAV. Beat-by-beat:
#   • bass note: bass_seq[(i) % len] at sample (i × beat_sec × rate)
#   • arp note:  arp_seq[(i) % len] at sample ((i + 0.5) × beat_sec × rate)
#   • optional sub-bass octave below the bass note, same start-sample
#
# Each note has its own phase accumulator that runs for AT MOST one
# beat's worth of samples (so decay reaches ~zero by the next beat).
# Notes are SUMMED into the shared output buffer — no per-sample
# global oscillator, just per-note synthesis windows.
#
# Loop wrap: the last beat starts at sample (beats-1) × beat_sec × rate
# and runs to sample beats × beat_sec × rate − 1 = n_samples − 1. Its
# envelope reaches near-zero by the end of its beat. The first beat
# starts at sample 0 with the envelope's attack near zero. So the
# wrap-point amplitude is ≈ env_end ≈ env_start ≈ 0 — click-free.
func _synthesize_music(cfg: Dictionary, duration_sec: float) -> AudioStreamWAV:
	var bpm: float = cfg.get("bpm", 100.0)
	var beats: int = int(cfg.get("beats", 16))
	var bass_seq: Array = cfg.get("bass_seq", [NOTE_C2])
	var arp_seq: Array = cfg.get("arp_seq", [NOTE_C4])
	var sub_bass_gain: float = clampf(cfg.get("sub_bass_gain", 0.0), 0.0, 1.0)
	var bass_decay_pow: float = cfg.get("bass_decay_pow", 2.0)
	var arp_decay_pow: float = cfg.get("arp_decay_pow", 2.0)
	var bass_gain: float = clampf(cfg.get("bass_gain", 0.4), 0.0, 1.0)
	var arp_gain: float = clampf(cfg.get("arp_gain", 0.2), 0.0, 1.0)

	var beat_sec: float = 60.0 / bpm
	var samples_per_beat: int = int(beat_sec * float(SAMPLE_RATE))
	var n_samples: int = int(duration_sec * float(SAMPLE_RATE))

	# Use a float scratch buffer for mix-down so we can sum many
	# voices without per-sample clamping (only clamp at quantize).
	var scratch: PackedFloat32Array = PackedFloat32Array()
	scratch.resize(n_samples)
	# Zero-init explicitly — PackedFloat32Array.resize() in Godot 4
	# does NOT guarantee zeroed storage on all platforms.
	for i in n_samples:
		scratch[i] = 0.0

	# Render each beat.
	for beat_idx in beats:
		var bass_start_sample: int = beat_idx * samples_per_beat
		var bass_freq: float = float(bass_seq[posmod(beat_idx, bass_seq.size())])
		_render_note(
			scratch,
			bass_start_sample,
			samples_per_beat,
			bass_freq,
			bass_gain,
			bass_decay_pow,
		)
		# Sub-bass: half-frequency layer for body. Same envelope, scaled
		# by sub_bass_gain × bass_gain so the user controls both the
		# overall bass loudness and the sub mix independently.
		if sub_bass_gain > 0.0:
			_render_note(
				scratch,
				bass_start_sample,
				samples_per_beat,
				bass_freq * 0.5,
				bass_gain * sub_bass_gain,
				bass_decay_pow,
			)
		# Arpeggio on the off-beat. Starts half a beat after the bass.
		var arp_start_sample: int = bass_start_sample + (samples_per_beat / 2)
		var arp_freq: float = float(arp_seq[posmod(beat_idx, arp_seq.size())])
		_render_note(
			scratch,
			arp_start_sample,
			samples_per_beat,
			arp_freq,
			arp_gain,
			arp_decay_pow,
		)

	# Quantize float scratch to s16 PCM.
	var bytes: PackedByteArray = PackedByteArray()
	bytes.resize(n_samples * 2)
	for i in n_samples:
		var s: float = clampf(scratch[i], -1.0, 1.0)
		bytes.encode_s16(i * 2, int(s * 32767.0))

	var stream: AudioStreamWAV = AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = SAMPLE_RATE
	stream.stereo = false
	stream.data = bytes
	stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
	stream.loop_begin = 0
	stream.loop_end = n_samples
	return stream

# Render one note into the scratch buffer at start_sample. The note
# occupies up to `length_samples` (one beat's worth); its sine carrier
# is multiplied by an amplitude envelope that decays from 1.0 to 0
# over the note's duration via pow(1 - t, decay_pow). Writes are
# additive — voices sum, no overwrite. Out-of-range writes are clipped
# so the last note in the buffer doesn't extend past n_samples.
func _render_note(
	buffer: PackedFloat32Array,
	start_sample: int,
	length_samples: int,
	freq_hz: float,
	gain: float,
	decay_pow: float,
) -> void:
	var n_buf: int = buffer.size()
	var end_sample: int = mini(start_sample + length_samples, n_buf)
	var actual_length: int = end_sample - start_sample
	if actual_length <= 0:
		return
	var phase_inc: float = freq_hz * TAU / float(SAMPLE_RATE)
	var phase: float = 0.0
	# Brief linear attack to avoid a click at the start of each note —
	# 3 ms feels punchy without being audibly slow. 3 ms × 22050 ≈ 66
	# samples, well within one beat (samples_per_beat ≈ 13230 at 100 BPM).
	var attack_samples: int = mini(66, actual_length / 4)
	for j in actual_length:
		var t: float = float(j) / float(length_samples)
		var env: float = pow(maxf(1.0 - t, 0.0), decay_pow)
		# Apply attack ramp on first attack_samples.
		if j < attack_samples and attack_samples > 0:
			env *= float(j) / float(attack_samples)
		var sample: float = sin(phase) * env * gain
		buffer[start_sample + j] += sample
		phase += phase_inc
		if phase > TAU:
			phase -= TAU

# ── Music players + scene-change crossfade ────────────────────────────

func _build_music_players() -> void:
	_music_player_a = AudioStreamPlayer.new()
	_music_player_a.bus = "Master"
	_music_player_a.volume_db = MUSIC_FADE_FLOOR_DB
	add_child(_music_player_a)
	_music_player_b = AudioStreamPlayer.new()
	_music_player_b.bus = "Master"
	_music_player_b.volume_db = MUSIC_FADE_FLOOR_DB
	add_child(_music_player_b)

# Look up the current scene and drive a music crossfade. Called once
# at init from _music_init, and again from _on_tree_changed below
# (which now branches: ambient + music both react to the same scene
# swap, but via independent lookup tables).
func _resolve_music_for_current_scene() -> void:
	var scene: Node = get_tree().current_scene
	var path: String = ""
	if scene != null:
		path = scene.scene_file_path
	var preset_id: String = SCENE_TO_MUSIC.get(path, "")
	_crossfade_music_to(preset_id)

# Crossfade the live music player to silence and bring the idle player
# up with the new track. Mirrors _crossfade_to (ambient) but with a
# slower fade duration and its own tween/state. Empty preset_id =
# fade music to silence (settings screen, death screen, etc.).
func _crossfade_music_to(preset_id: String) -> void:
	if preset_id == _music_current_preset:
		return
	if _music_fade_tween != null and _music_fade_tween.is_valid():
		_music_fade_tween.kill()

	var fading_out: AudioStreamPlayer = _music_player_a if _music_live_is_a else _music_player_b
	var fading_in: AudioStreamPlayer = _music_player_b if _music_live_is_a else _music_player_a

	_music_fade_tween = create_tween()
	_music_fade_tween.set_parallel(true)

	_music_fade_tween.tween_property(
		fading_out, "volume_db", MUSIC_FADE_FLOOR_DB, MUSIC_FADE_DURATION
	)

	if preset_id != "" and _music_streams.has(preset_id):
		var cfg: Dictionary = MUSIC_CONFIGS[preset_id]
		var target_db: float = cfg.get("target_db", -28.0)
		fading_in.stream = _music_streams[preset_id]
		fading_in.volume_db = MUSIC_FADE_FLOOR_DB
		fading_in.play()
		_music_fade_tween.tween_property(
			fading_in, "volume_db", target_db, MUSIC_FADE_DURATION
		)
		_music_fade_tween.chain().tween_callback(fading_out.stop)
	else:
		_music_fade_tween.chain().tween_callback(fading_out.stop)

	_music_current_preset = preset_id
	_music_live_is_a = not _music_live_is_a
