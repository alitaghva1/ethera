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
		var freq := lerp(freq_start, freq_end, t)
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
		var amp_env := pow(1.0 - t, decay_pow)
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

# ── Public volume API (for settings screen) ───────────────────────────

# 0..1 linear → AudioServer master-bus volume in dB. Clamps below
# -60 dB to effectively-mute when slider is at zero (audio rarely
# benefits from going lower; below that is just float noise).
func set_master_volume(linear_0_to_1: float) -> void:
	var v := clamp(linear_0_to_1, 0.0, 1.0)
	var db := linear_to_db(v) if v > 0.001 else -80.0
	AudioServer.set_bus_volume_db(AudioServer.get_bus_index("Master"), db)
