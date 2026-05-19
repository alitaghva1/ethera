# Main (dungeon room runner) — generic room scene that builds itself
# from the Floor autoload's current_room_config (a RoomConfig .tres
# resource). Same scene file handles all 3 rooms of a floor; per-room
# variation comes from data.
#
# Iter 6 architecture vs Iter 3-5 (single hardcoded room):
#   • SPAWN_POINTS + WAVES + torch positions now live in RoomConfig
#     .tres resources (scenes/rooms/room_NN.tres). main.gd reads
#     RunState.current_room_config at _ready and configures itself.
#   • main.tscn no longer has hand-placed Torch nodes; torches spawn
#     from the config so per-room layouts vary visually.
#   • On wave clear: spawn Door (not last room) OR Pedestal (last).
#   • Door → RunState.advance() → reload main.tscn → room rebuilds with
#     the next config. Linear progression; DAG/branching is future work.
#
# Hit-stop, death screen, kill counting, signals unchanged from Iter 5.
extends Node2D

const DAMAGE_NUMBER_SCENE         = preload("res://scenes/damage_number.tscn")
const PEDESTAL_SCENE: PackedScene = preload("res://scenes/pedestal.tscn")
const TORCH_SCENE: PackedScene    = preload("res://scenes/torch.tscn")
const PILLAR_SCENE: PackedScene   = preload("res://scenes/pillar.tscn")
const CHEST_SCENE: PackedScene    = preload("res://scenes/chest.tscn")
const DOOR_SCENE: PackedScene     = preload("res://scenes/door.tscn")
const SHRINE_SCENE: PackedScene   = preload("res://scenes/shrine.tscn")
const LORE_STONE_SCENE: PackedScene = preload("res://scenes/lore_stone.tscn")
const FAMILIAR_SCENE: PackedScene = preload("res://scenes/familiar.tscn")
const DEATH_SCREEN_SCENE: PackedScene = preload("res://scenes/death_screen.tscn")
const PAUSE_SCREEN_SCENE: PackedScene = preload("res://scenes/pause_screen.tscn")
const RELIC_ICON_SCENE: PackedScene = preload("res://scenes/relic_icon.tscn")

# Enemy roster — iter 14 data-driven shape. ONE shared enemy.tscn for
# all types; the type-specific data (sheets, stats, behavior, AI
# tunables) lives in EnemyType .tres files under scenes/enemies/.
# Adding a new enemy = one new .tres + one entry in this dict. No
# per-enemy scene, no per-enemy script, no manual AtlasTexture wrangling.
const ENEMY_SCENE: PackedScene = preload("res://scenes/enemy.tscn")
const ENEMY_TYPES := {
	"slime":             preload("res://scenes/enemies/slime.tres"),
	"crypt_spider":      preload("res://scenes/enemies/crypt_spider.tres"),
	"orc":               preload("res://scenes/enemies/orc.tres"),
	"ember":             preload("res://scenes/enemies/ember.tres"),
	"werewolf":          preload("res://scenes/enemies/werewolf.tres"),
	"skel":              preload("res://scenes/enemies/skel.tres"),
	"lancer":            preload("res://scenes/enemies/lancer.tres"),
	"armored_skeleton":  preload("res://scenes/enemies/armored_skeleton.tres"),
	"wizard":            preload("res://scenes/enemies/wiz.tres"),
	"archer":            preload("res://scenes/enemies/archer.tres"),
	"priest":            preload("res://scenes/enemies/priest.tres"),
	"dreadmage":         preload("res://scenes/enemies/dreadmage.tres"),
	"bonecap":           preload("res://scenes/enemies/bonecap.tres"),
	# Iter 47 — bomber kamikaze enemy. Uses the new "bomber" behavior
	# in enemy.gd — charges hero, primes 0.45s with red pulse, then
	# explodes for AoE damage and self-destructs.
	"ember_bomber":      preload("res://scenes/enemies/ember_bomber.tres"),
	# Iter 65 — support caster. Uses the "healer" behavior in enemy.gd.
	# Stays at ~200 px from the hero and heals the most-wounded ally
	# within 120 px on a 3.5s cycle (0.6s windup + green pulse ring).
	# Squishy (4 HP, 60 px/s) so the player can focus-kill if they read
	# the green telegraph in time.
	"spectral_priest":   preload("res://scenes/enemies/spectral_priest.tres"),
	# Iter 66 — summoner caster. Uses the "summoner" behavior in enemy.gd.
	# Kites at ~240 px and on a 5s cycle spawns 1-2 bonecaps around itself
	# (0.8s windup + dark expanding ring + 1.0s recovery). Capped at 3
	# live minions to prevent wave-stuffing. Slightly tankier (6 HP) than
	# the spectral_priest since it has no direct attack of its own.
	"bone_summoner":     preload("res://scenes/enemies/bone_summoner.tres"),
	# Iter 68 — flanking phantom. Uses the "wraith" behavior in enemy.gd.
	# Fast melee (130 px/s) that periodically PHASES on a 4.5s cycle:
	# vanishes 0.35s, teleports BEHIND the hero, reappears 0.18s with a
	# violet shimmer, then lands a 2-damage flanking strike if still in
	# reach. Invulnerable during phase but squishy (4 HP) in chase /
	# 0.8s strike recovery — the player can punish a missed flank.
	"rogue_wraith":      preload("res://scenes/enemies/rogue_wraith.tres"),
	# Iter 72 — trap-layer conjurer. Uses the "glyph_warden" behavior in
	# enemy.gd. Kites at ~220 px and on a 3.5s cycle plants a stationary
	# glyph hazard at its OWN feet (0.7s gold-amber windup + spinning
	# rune mark inscribed on the ground as telegraph). Glyphs arm 0.6s
	# after placement then sit as floor damage for up to 6.0s — hero
	# stepping in their radius takes 1 damage + brief slow. Crucially,
	# glyphs OUTLIVE the warden: kill the warden, its previously-laid
	# glyphs keep ticking. First enemy that authors persistent dynamic
	# ground hazards. Squishy support (5 HP, 65 px/s) — no direct attack.
	"glyph_warden":      preload("res://scenes/enemies/glyph_warden.tres"),
	# Iter 17 — boss type. Spawned alone in room 3's final wave; the
	# is_boss flag drives the HP-bar UI and the boss tracking in
	# _process. Wave-clear detection treats it like any other enemy.
	"iron_revenant":     preload("res://scenes/enemies/iron_revenant.tres"),
	"broodmother":       preload("res://scenes/enemies/broodmother.tres"),
}

const HIT_STOP_SCALE    := 0.05
const HIT_STOP_TIME     := 0.08
# Iter 13 — lighter hit-stop when the player CONNECTS (vs takes damage).
# Brief enough that mashing attack still feels responsive, heavy enough
# that each hit has a tiny "thud" of friction. Scales up slightly on
# multi-hit (clamped) so a clean cleave-through reads bigger.
const SWING_HIT_STOP_SCALE := 0.18
const SWING_HIT_STOP_TIME  := 0.035
# Iter 140 — CRIT swings get a deeper, longer freeze. Genre cue: Hades and
# Isaac both punch hit-stop noticeably harder on crits / heavy hits, and
# the moment of "wait, did I just—" is what makes crits feel celebratory
# instead of being a hidden +damage stat. The freeze is closer to the
# took-damage stop (0.05/0.08) than to the normal swing stop (0.18/0.035)
# — the swing FEELS heavier without yanking control away as long as a
# real damage stop. Scale 0.05 = 95% time slowdown (vs 82% on normal
# swing); hold 0.10s gives the player ~6 frames to read the crit splash
# ring before motion resumes.
const CRIT_SWING_HIT_STOP_SCALE := 0.05
const CRIT_SWING_HIT_STOP_TIME  := 0.10
const DASH_HIT_STOP_SCALE  := 0.10
const DASH_HIT_STOP_TIME   := 0.07
# Iter 148 — boss death savor beat. After a boss takes its lethal hit,
# slow-mo for 0.6 real-seconds + heavy camera shake. The FloorClearBurst
# BIG variant already plays after _on_wave_cleared resolves, so this
# fills the ~1 s gap between "killing blow lands" and "FLOOR CLEAR
# banner appears" with a proper boss-fight punctuation moment.
#
# 0.35 time-scale is heavier than the crit hit-stop (0.05) but lasts
# 6× longer — feel grammar: brief deep freezes for crits, sustained
# milder slow-mo for bosses. The 14-amp / 0.45-time shake is bigger
# than a crushing kill (11/0.22) so boss deaths read as a distinct
# class of event.
const BOSS_DEATH_TIME_SCALE: float = 0.35
const BOSS_DEATH_HIT_STOP_TIME: float = 0.6
const BOSS_DEATH_SHAKE_AMP: float = 14.0
const BOSS_DEATH_SHAKE_TIME: float = 0.45
# iter-87 → iter-94: the sprite-sheet replacement for the dash impact
# read as a "broken square" in playtest (the AtlasTexture cell boundary
# was visible). iter-94 reverts to the procedural dash_impact.tscn (still
# loaded anyway for SOUL_BURST relic reuse in hero.gd) so the impact has
# no visible cell edge. FxSprite is kept loaded — slash_arc and other
# sheet-based FX still use it.
const FxSprite = preload("res://scripts/fx_sprite.gd")
const DASH_IMPACT_SCENE = preload("res://scenes/fx/dash_impact.tscn")
# iter-79: spawn portal system REMOVED. Four iterations (75/76/77/78) of
# patching a "summoning portal" visual on top of the existing iter-15
# enemy spawn-in fade never landed right — the JS reference (slime-depths/)
# doesn't have one at all, enemies just appear with a sprite fade. Reverted
# to that simpler approach; the iter-15 SPAWN_IN_START_COLOR fade in
# enemy.gd is now tuned subtler so it reads as "incoming" without
# dominating the screen.
# Iter 30 — hazard scenes. The room reads its hazard_kind string and
# we pick the scene to instantiate at each hazard_positions entry.
# Iter 31 — added fire_jet, slow_zone, lightning_rod for mixed-hazard
# rooms (consumed via room.hazards Array[Dictionary], see _spawn_hazards).
# Single dict entry per kind keeps the lookup cheap + makes adding
# a new hazard a one-line addition.
const HAZARD_SCENES := {
	"spike_pit": preload("res://scenes/hazards/spike_pit.tscn"),
	"fire_jet": preload("res://scenes/hazards/fire_jet.tscn"),
	"slow_zone": preload("res://scenes/hazards/slow_zone.tscn"),
	"lightning_rod": preload("res://scenes/hazards/lightning_rod.tscn"),
}
# Iter 15 — pacing pass. Earlier values felt sluggish: 1.6s between
# waves left dead-air, and 1.0s pre-first-wave kept the player idle on
# room entry. Tighter values keep the loop pumping.
const WAVE_CLEAR_PAUSE  := 0.9     # seconds between waves
const INITIAL_WAVE_DELAY := 0.6    # seconds from _ready to wave 1 spawn
# Stagger between enemies WITHIN a wave. ALL-at-once spawning made each
# wave feel chaotic; spacing the spawns ~0.18s apart sells "enemies are
# arriving" instead of "enemies popped." Combined with the spawn-in fade
# in enemy.gd, each individual unit has ~0.7s of telegraph before it
# actually engages — long enough to read, short enough to not stall combat.
const SPAWN_STAGGER     := 0.18
const DOOR_POSITION     := Vector2(1140, 384)   # east-wall door spawn

# Iter 22 — death cinematic tuning. The hero's lethal hit triggers a
# slow-mo + camera-zoom + radial-vignette + YOU DIED banner sequence
# before the existing death_screen overlay takes over. Time scale is
# OWNED by the cinematic during this window; do not reset it in
# _on_hero_died (the cinematic restores it at t=1.6s).
const DEATH_TIME_SCALE_MIN: float = 0.25
const DEATH_CAMERA_ZOOM_END: Vector2 = Vector2(1.4, 1.4)
const DEATH_BANNER_DELAY: float = 0.4
const DEATH_VEIL_FADE_TIME: float = 0.8
const DEATH_VEIL_FINAL_ALPHA: float = 0.72
const DEATH_RESTORE_AT: float = 1.2
const DEATH_SHOW_SCREEN_AT: float = 1.6

# Iter 22 — wave-start center banner. A big text overlay that fades in
# above the play field for each wave so the player gets a Hades-style
# "WAVE N" punctuation between rounds. Driven entirely by tween from
# _show_wave_banner; the existing wave_label corner readout stays.
const WAVE_BANNER_DURATION: float = 1.0   # total time visible
const WAVE_BANNER_HOLD: float = 0.4       # hold-at-peak before fading

# Iter 22 — boss intro feel. When an EnemyType with is_boss=true
# spawns we ALSO throw a heavy camera shake + a brief red wash to
# punctuate the moment. Pre-iter-22 bosses just appeared with the
# normal red spawn-in tint.
const BOSS_INTRO_SHAKE_AMP: float = 16.0
const BOSS_INTRO_SHAKE_TIME: float = 0.45

# Fallback when main.tscn is launched directly without RunState.start_floor()
# having been called (e.g. F5 from the editor on main.tscn). Picks the
# first room so the scene is testable in isolation.
const FALLBACK_ROOM_CONFIG := "res://scenes/rooms/room_01.tres"

enum WaveState { PRE, ACTIVE, CLEAR, COMPLETE, DEAD }

@onready var hero: Hero = $Hero
@onready var hp_label: Label = $UI/HPLabel
# iter-125: custom polygon heart pips replace the Unicode HPLabel.
# _update_hp populates this row with one pip per max_hp slot; iter-113
# damage / heal pulse targets the row's scale + modulate.
@onready var heart_row: HBoxContainer = $UI/HeartRow
@onready var status_label: Label = $UI/StatusLabel
@onready var kills_label: Label = $UI/KillsLabel
@onready var wave_label: Label = $UI/WaveLabel
# Iter 158 — run timer HUD. Updated each _process tick from
# RunState.run_elapsed_seconds(). Stops updating when _alive flips
# false (hero death finalizes via GameState.finalize_run_time).
@onready var run_timer_label: Label = $UI/RunTimerLabel
# Iter 161 — persistent room progress (always-visible "ROOM 3 / 6"
# under the heart row). Synced with room_label inside _update_room_label.
@onready var room_progress_label: Label = $UI/RoomProgressLabel
# Iter 160 — first-run tutorial prompt label. Lifecycle managed by
# the tutorial state machine below. Hidden (modulate.a = 0) until
# armed in _ready (only on first-ever run AND room 0).
@onready var tutorial_label: Label = $UI/TutorialLabel
@onready var room_label: Label = $UI/RoomLabel
@onready var boss_bar: VBoxContainer = $UI/BossBar
@onready var boss_name: Label = $UI/BossBar/Name
@onready var boss_hp_bar: ProgressBar = $UI/BossBar/Bar
# HUD relic strip — horizontal row of small badges, one per owned
# relic. Populated by _rebuild_relic_strip on _ready and refreshed
# whenever Events.pickup_claimed fires (a new relic was just granted).
@onready var relic_strip: HBoxContainer = $UI/RelicStrip

# Iter 39 — theme chip strip. Code-built HBoxContainer mounted on the
# UI CanvasLayer just below the relic strip. Each chip is a Control-
# rooted PanelContainer with theme-colored border, theme name label,
# tier indicator (— / ◆◆ / ◆◆◆◆), and a count badge. Built lazily on
# first refresh + repopulated by _rebuild_theme_chips on each relic
# grant. Iter 74 — graduated from plain Labels to proper Panel chips
# with tier-state visuals (dim → resonance → ascendance) + tier-up
# flash on threshold cross.
var theme_chip_strip: HBoxContainer = null

# Iter 74 — previous-tier cache keyed by theme name. _rebuild_theme_chips
# compares each theme's new tier to the cached value; if it INCREASED
# the chip plays a brief "you just unlocked this" pulse on appear. Reset
# on hero death via _rebuild_theme_chips' natural refresh (death respawn
# starts with no relics → all tiers back to 0 → first pickup re-fires
# the flash, which is the desired feel).
var _theme_prev_tiers: Dictionary = {}

# Iter 48 — singleton tooltip panel for theme chips. Lazily built on
# first hover, shown/hidden via the chip's mouse_entered/exited
# callbacks. Reused across chips (re-textd + repositioned per hover)
# rather than spawning a new tooltip per chip.
var _theme_tooltip: Control = null

# Iter 54 — combo counter HUD. Built lazily on the first combo_changed
# event. Anchored top-right under the WAVE label. Hidden when combo
# <= 4 (no clutter for small streaks); appears + scales up at tier
# thresholds (10/25/50/100).
var _combo_label: Label = null
# Iter 155 — directional damage indicator. ColorRect overlay on the
# UI CanvasLayer that paints a red bar along the screen edge nearest
# the damage source. Lazily created on first damage event.
var _dmg_indicator: ColorRect = null
var _dmg_indicator_tween: Tween = null
# Iter 151 — track previous combo so we can detect "streak broken"
# transitions (combo dropping from a meaningful tier ≥ 10 to 0) and
# fire a red flash + scale punch. Reset to 0 on respawn / new run is
# implicit because main.gd is reloaded per room transition.
var _prev_combo: int = 0
var _combo_break_tween: Tween = null

# Iter 48 — per-theme resonance + ascendance descriptions for tooltip
# content. Keyed to the theme strings used by GameState. Authored
# inline here (vs in game_state.gd) since this is UI-facing content
# and the mechanics descriptions are in the relic registry already.
const THEME_TOOLTIP_DESC: Dictionary = {
	"storm": {
		"resonance": "+1 blast damage",
		"ascendance": "every swing fires an extra chain bolt",
	},
	"flame": {
		"resonance": "+1 sword damage",
		"ascendance": "kills drop a fire pool (1 dmg/0.4s × 2s)",
	},
	"blood": {
		"resonance": "+1 max HP",
		"ascendance": "room-clear heal restores +25% missing HP",
	},
	"vow": {
		"resonance": "+1 damage taken reduction",
		"ascendance": "each shield catch restores 1 HP",
	},
	"shadow": {
		# iter-95/96: dodge ability removed, theme procs reanchored to
		# dash strike. Resonance stat-bonus is now crit + move speed.
		"resonance": "+5% crit chance, +5% move speed",
		"ascendance": "dash strike fires a 60-px shockwave (1 dmg)",
	},
}

# Active room config — driven by Floor autoload. Cached at _ready so
# late edits to RunState.current_room_config mid-run don't cause stutter.
var _room: RoomConfig = null
var _spawn_points: Array[Vector2] = []
var _waves: Array = []

# Iter 32 — branch modifier consumed from RunState.pending_branch at
# _ready. Persists for the room's lifetime so _spawn_pedestal_offer can
# bias tier weights at room clear. "" = no modifier active.
var _branch_modifier: String = ""

# Iter 33 — queued shrine spawn pairs ([kind, position], …) handed
# off from _enter_shrine_room to the deferred timer callback
# _do_spawn_pending_shrines. Cleared after consumption.
var _pending_shrine_spawns: Array = []

# Iter 36 — per-visit RNG. Seeded at room load with (room_idx * 1000
# + dungeon_runs) so each run's visit to a given room gets a fresh
# but in-run-stable pattern: pillar jitter, wave pool selection, and
# any future per-visit rolls draw from this stream rather than the
# global random (which is shared by spawn shuffle / decor / etc).
var _visit_rng: RandomNumberGenerator = null

var _wave_index := -1
var _wave_state := WaveState.PRE
var _alive := true
var _kills := 0
# iter-113: track previous HUD values so _update_hp / _update_kills can
# detect WHICH WAY the value changed (damage/heal/kill) and flash the
# correct accent color. Initial -1 sentinel means "no prior value" so the
# first _update_hp call on scene load doesn't flash a phantom heal.
var _prev_hp: int = -1
var _prev_kills: int = -1
# Cached tweens so a rapid sequence of hits doesn't pile up overlapping
# scale tweens (last one would always win, but the in-flight ones would
# fight). Same kill-previous-tween pattern as ScreenFlash._flash_tween.
var _hp_pulse_tween: Tween = null
var _kills_pulse_tween: Tween = null
# iter-144: wave-clear pulse on the corner wave_label. Same pulse-cache
# pattern as _hp_pulse_tween / _kills_pulse_tween. Pulses on every
# mid-wave clear (not the final room clear — that one fires
# FloorClearBurst, which is its own loud celebration).
var _wave_label_pulse_tween: Tween = null
# iter-142: low-HP heartbeat tell. When the hero drops into the danger
# zone (hp ≤ max(2, max_hp / 3)), the heart row breathes — a slow
# looping scale + warm-red modulate pulse — until hp recovers or the
# hero dies. _hp_low_pulse_active gates re-starts so the looping tween
# doesn't get re-created on every _update_hp call while in-danger.
var _hp_low_pulse_tween: Tween = null
var _hp_low_pulse_active: bool = false
# iter-119: control-hint auto-fade. After HINT_FADE_DELAY seconds of
# unchanged StatusLabel text, the label tweens its alpha down so the
# help text stops competing with combat reads.
# iter-123: TARGET is now 0.0 (fully invisible), not 0.30 (dim-but-
# visible). Controls should never be PERMANENTLY in the HUD — the
# first-time hint shows briefly then leaves the screen entirely.
# Delay also shortened 8 → 5 s — playtester read on the iter-119
# version was "controls hang around forever." Gameplay events that
# set status_label.text reset the timer + restore full alpha via the
# poll-and-compare path; no call-site changes needed.
const HINT_FADE_DELAY: float = 5.0
const HINT_FADE_DURATION: float = 1.0
const HINT_FADED_ALPHA: float = 0.0
var _status_hint_fade_t: float = 0.0
var _last_status_text: String = ""
var _status_fade_tween: Tween = null

# iter-124: wave-label auto-fade. The wave_label is set from 8 different
# call sites (wave start, wave clear, room clear, treasure / shrine
# room enter, run complete, etc.). Rather than wrapping each setter
# in a tween, we poll the text from _process — when it changes, snap
# alpha to 1.0 and reset a timer; after WAVE_HOLD_DURATION the alpha
# tweens down to 0 over WAVE_FADE_DURATION. Same shape as the iter-119
# status fade.
#
# Net effect: any wave-transition text pops in for ~1.5s of readable
# time then fades to invisible. Wave info becomes EVENT-DRIVEN, not
# resting HUD.
const WAVE_HOLD_DURATION: float = 1.6
const WAVE_FADE_DURATION: float = 1.0
var _wave_label_fade_t: float = 0.0
var _last_wave_text: String = ""
var _wave_fade_tween: Tween = null
var _hit_stop_timer := 0.0
var _death_screen: Node = null

# Iter 160 — first-run tutorial state machine. Runs only on the very
# first room of the very first run (GameState.has_completed_tutorial
# = false). Each step gates on a specific input the player must
# perform; once detected, advances to the next prompt. Tracking
# distance traveled instead of a single "first key press" so a stray
# button mash doesn't skip the MOVE step.
enum TutorialState {
	OFF,             # tutorial not active (subsequent rooms / runs)
	WAIT_MOVE,       # show "MOVE — WASD" until ~200 px traveled
	WAIT_ATTACK,     # show "ATTACK — LEFT MOUSE" until attack pressed
	WAIT_DASH,       # show "DASH — SHIFT" until dash strike pressed
	WAIT_PICKUP,     # show "PICK UP RELIC — Walk to glowing pedestal"
	DONE,            # short fade-out then OFF + persist completion
}
var _tutorial_state: TutorialState = TutorialState.OFF
var _tutorial_distance_moved: float = 0.0
const TUTORIAL_MOVE_THRESHOLD: float = 200.0
const TUTORIAL_FADE_DUR: float = 0.45
var _tutorial_fade_tween: Tween = null
# Iter 15 — count of enemies queued by _start_wave that haven't
# actually spawned yet (timer-deferred). The wave-clear check in
# _process needs to know about these so the staggered spawn window
# doesn't trigger false-positive "all enemies dead" between the first
# kill and the last spawn.
var _pending_spawns := 0
# iter-79: removed _active_wave_portals / _active_wave_portal_nodes /
# _wave_spawn_override_pos state. The portal system (iters 75-78) is
# gone — enemies spawn at random _spawn_points per the iter-15 path.
# Iter 16 — guard against pickup_claimed firing twice on the same room
# (e.g. a hypothetical double-event from a relic with multiple effects).
# Set true the first time a pedestal grants in this room; reset on
# scene reload. Drives the door/run-complete branch.
var _room_pickup_resolved := false
# Iter 178 — offer-vignette CanvasLayer. Mounted by _spawn_offer_vignette
# when the relic offer appears, dismissed by _dismiss_offer_vignette
# when the player claims (or the offer otherwise resolves).
var _offer_vignette: CanvasLayer = null
# Iter 17 — boss tracking. Set on spawn when an enemy_type with
# is_boss=true is instantiated. _process polls this each frame to
# refresh the HP bar. Cleared (instance invalid) when the boss
# dies, hiding the bar.
var _boss_ref: Enemy = null
# Iter 157 — track previous boss HP so the polling tick can detect a
# DAMAGE event (hp dropped) and fire a brief pulse on the boss HP bar
# Control. Without this, the bar smoothly decremented with no on-hit
# emphasis — boss hits felt identical to small ticks.
var _prev_boss_hp: int = 0
var _boss_hp_pulse_tween: Tween = null
# iter-133: Track death cinematic resources for cleanup before scene reload.
# Without cleanup, tweens and particles accumulate across retries → 2 FPS.
var _death_tweens: Array[Tween] = []
var _death_veil_layer: CanvasLayer = null

func _ready() -> void:
	# iter-112: Fade up from black on entry. The menu / settings / death
	# screen all faded the screen to opaque-black via the ScreenFlash
	# autoload before changing scenes; this call here on the destination
	# side completes the cross-fade so the dungeon doesn't snap on. If
	# the scene was loaded directly (F5 from editor), the rect is already
	# transparent → fade_from_black snaps it to black for one frame then
	# fades back, which is fine.
	ScreenFlash.fade_from_black(0.45)
	# Resolve the active room config — fall back to room_01 for
	# editor-direct launches so the scene is debuggable in isolation.
	if RunState.current_room_config == null:
		# load() returns Variant in Godot 4 — explicit Resource typing
		# stops the := inference warning under strict 4.6 mode.
		var fb: Resource = load(FALLBACK_ROOM_CONFIG)
		if fb is RoomConfig:
			RunState.current_room_index = 0
			RunState.current_room_config = fb
	# Explicit cast — RunState is an autoload, parser sees its fields
	# as Variant. `as RoomConfig` keeps the typed _room field happy.
	_room = RunState.current_room_config as RoomConfig
	if _room != null:
		_spawn_points = _room.spawn_points
		# Iter 36 — per-visit variation seed. Seeds with the room slot
		# AND the run counter so within one run the variation is stable
		# (no mid-run swap weirdness), but each new run rolls fresh.
		# Wrapped in its own RNG instance so room-level rolls don't
		# burn the global random sequence relied on by spawn shuffle /
		# decor scatter / projectile jitter elsewhere.
		_visit_rng = RandomNumberGenerator.new()
		_visit_rng.seed = int((RunState.current_room_index + 1) * 1000 + GameState.dungeon_runs)
		# Iter 36 — wave variant pool. If the room declares waves_pool,
		# pick ONE entry as this visit's wave composition; otherwise
		# fall back to the baseline `waves` field.
		var base_waves: Array = _room.waves
		if not _room.waves_pool.is_empty():
			var pool_idx: int = _visit_rng.randi() % _room.waves_pool.size()
			var picked = _room.waves_pool[pool_idx]
			if picked is Array:
				base_waves = picked as Array
		# Iter 32 — branching modifiers can mutate waves. Deep-copy so we
		# never mutate the source RoomConfig resource (a "+1 enemy" risk
		# bump on first visit would otherwise persist on subsequent runs).
		_waves = base_waves.duplicate(true)
		_apply_pending_branch_modifier()
		# Iter 18 — per-room ambient tint applied to the CanvasModulate.
		# Drives the "deeper = different mood" feeling: room 1 light
		# purple, room 2 deep purple, room 3 (boss) red-purple. The
		# torches layer their warm light on top, so the floor under
		# them still reads gold.
		var modulate_node: CanvasModulate = $CanvasModulate
		if modulate_node != null:
			modulate_node.color = _room.ambient_tint
		_spawn_torches(_room.torch_positions)
		# Decor — collidable stone pillars + breakable chests. Both spawn
		# from per-room arrays in the same data-driven shape as torches.
		# Order matters cosmetically (pillars first → chests render on
		# top in z-order) but neither one depends on the other.
		# Iter 36 — pillar positions get a per-visit ±position_jitter
		# offset so the room reads as related-but-not-identical across
		# multiple runs. Hazards / spawn_points are deliberately NOT
		# jittered — those are load-bearing for timing + composition.
		var pillars: Array[Vector2] = _maybe_jitter_pillars(_room.pillar_positions, _room.position_jitter)
		_spawn_pillars(pillars)
		_spawn_chests(_room.chest_positions)
		# Iter 30 — interior walls + hazards. Interior walls partition
		# the otherwise-open 1280×720 arena into corridors / chambers /
		# cover. Hazards push the player to keep moving. Both are
		# data-driven from RoomConfig — empty arrays = open arena
		# (the iter-23 default behavior).
		_spawn_interior_walls(_room.wall_rects)
		# iter-115: Room readability chrome. Layers a quiet center
		# floor wash, thick perimeter wall mass + top-edge highlights,
		# inner wall shadow strips (AO at the wall→floor seam), and
		# corner darkness. Must run AFTER interior walls so the perimeter
		# wall art's tree-order positions us under the hero (which is
		# move_child'd to -1 at the end of _ready). See _spawn_room_chrome.
		_spawn_room_chrome()
		_spawn_hazards(_room.hazard_positions, _room.hazard_kind)
		# Iter 31 — mixed-hazard list. Each entry is a Dictionary with
		# "kind" + "position" (+ optional "phase"/"interval" for cyclic
		# hazards). Spawns alongside the legacy single-kind list above
		# so iter-30 rooms keep working.
		_spawn_hazards_mixed(_room.hazards)
		# Iter 34 — biome floor overlay + centerpiece accents BEFORE
		# decor. The overlay sits at z=-2 (behind decor and most other
		# layers); accents at z=-1 so they ride along with the rubble
		# but read as authored landmarks rather than scatter. The biome
		# dispatcher is data-driven from _room.biome; "crypt" is the
		# iter-30 default look.
		_apply_biome_visuals(_room.biome)
		# Iter 183 item 2 — perimeter prop clusters (set-dressing islands).
		# Places PixelLab brazier/pillar-brazier props with decals at the
		# room's 4 corners. The "rectangular test arena" feel goes away when
		# the perimeter has authored landmarks instead of bare wall mass.
		# (ChatGPT critique #2: "room reads like a generated box rather than
		# a designed combat space.") Skipped on a per-corner basis if a
		# pillar / chest / wall / spawn is already there.
		_spawn_perimeter_prop_clusters()
		# Iter 51 — atmospheric polish: vignette + dust motes. Both
		# code-built so adding a new room doesn't require .tscn edits.
		_spawn_vignette_overlay()
		_spawn_ambient_motes()
		# Iter 38 — optional secret content: spawn lore stones in their
		# authored hidden positions. Done BEFORE decor so the stones
		# get drawn under the random rubble (z-order parity with chests).
		_spawn_lore_stones(_room.lore_stones)
		# Iter 18 — scatter procedural rubble across the play area so
		# the floor doesn't read as a blank slate. Runs AFTER pillar /
		# chest spawn so decor placement can avoid those positions.
		_scatter_decor(_room.decor_density)
		hero.global_position = _room.hero_spawn
		# Iter 59 — push hero to the END of the children list so it
		# renders ON TOP of all the spawn pipeline's outputs (hazards,
		# pillars, chests, decor, lore stones, biome accents). All of
		# those share z_index=0 (default) with the hero; without this
		# reorder they cover the hero because they're added LATER in
		# the tree. enemies spawned during waves still come AFTER hero
		# in tree order — that overlap is brief + transient (combat
		# contact) vs hazards which are persistent floor props.
		move_child(hero, -1)
		# Iter 18 — animate the room-name label on entry. Starts big +
		# bright, settles to small + dim over 2s. Gives the player a
		# Hades-style "you have arrived" beat without a separate UI.
		_animate_room_entry()
	else:
		push_warning("main.gd: no RoomConfig available; running with empty layout")

	hero.hp_changed.connect(_on_hero_hp_changed)
	hero.hero_died.connect(_on_hero_died)
	# Iter 54 — combo counter HUD label. Connected after the chip strip
	# is built so the combo label can mount on the same UI canvas.
	hero.combo_changed.connect(_on_hero_combo_changed)
	# Iter 22 — death cinematic. hero_death_started fires alongside
	# hero_died but lets us run the slow-mo / zoom / banner BEFORE
	# the death_screen overlay takes over (which _on_hero_died
	# defers to via a 1.6s timer in the cinematic).
	hero.hero_death_started.connect(_on_hero_death_started)
	hero.hit_received.connect(_on_hero_hit_received)
	# Iter 13 — react to hero offense beats. swing_connected fires when
	# a normal melee swing hits at least one enemy (brief hit-stop);
	# dash_strike_landed fires at the END of the dash AoE scan whether
	# or not it connected (heavy shake + impact VFX always; bigger
	# hit-stop only if it landed).
	hero.swing_connected.connect(_on_hero_swing_connected)
	hero.dash_strike_landed.connect(_on_hero_dash_strike_landed)
	# Iter 16 — pedestal offer flow. We listen on the Events bus rather
	# than per-pedestal because pedestals come and go in groups of 3
	# and we want one resolution path regardless of which one was
	# picked.
	Events.pickup_claimed.connect(_on_pickup_claimed)
	# Iter 55 — boss summon listener. Bosses fire this signal at phase
	# transitions to request adds; main.gd has the ENEMY_TYPES preload
	# dict so it owns the actual spawn. Decouples enemy.gd from the
	# scene-side registry.
	Events.enemy_summon_requested.connect(_on_enemy_summon_requested)
	# Iter 57 — achievement unlock popup banner.
	Events.achievement_unlocked.connect(_on_achievement_unlocked)
	# Iter 148 — boss-defeated savor beat. Slow-mo + heavy shake when
	# a boss takes its lethal hit. FloorClearBurst still plays after
	# _on_wave_cleared resolves — this fills the gap between the hit
	# landing and the celebration banner appearing.
	Events.boss_died.connect(_on_boss_died)
	# Iter 155 — directional damage indicator on offscreen-source hits.
	Events.hero_damage_directional.connect(_on_hero_damage_directional)
	_death_screen = DEATH_SCREEN_SCENE.instantiate()
	add_child(_death_screen)
	_death_screen.retry_pressed.connect(_on_death_retry)
	_death_screen.menu_pressed.connect(_on_death_to_menu)
	_update_hp(hero.hp)
	_update_kills()
	_update_room_label()
	_rebuild_relic_strip()
	# iter-95: dodge removed, parry renamed to shield. Defensive toolkit
	# is now SHIELD (Q, timing catch) + DASH (Shift, mobility + i-frames).
	#
	# iter-123: first-time-only controls hint. Show the brief tutorial
	# ONCE per save profile; after that the hint never re-appears across
	# rooms, runs, or sessions. The flag is saved immediately so a quit
	# during the first room still records that the hint was shown.
	# iter-119's _process_status_fade carries the hint off-screen over
	# HINT_FADE_DELAY (5 s) + HINT_FADE_DURATION (1 s).
	if not GameState.has_seen_controls_hint:
		status_label.text = "LMB swing  ·  RMB blast  ·  Q shield  ·  SHIFT dash"
		GameState.has_seen_controls_hint = true
		SaveSystem.save_now()
	else:
		status_label.text = ""
	# Iter 160 — first-run tutorial prompts. Activates only on the
	# very first room of the very first run (has_completed_tutorial
	# false). Plays out a 4-step sequence: MOVE → ATTACK → DASH →
	# PICK UP. Sets the flag + saves once DONE so it never appears
	# again, even across runs / sessions, until the save is wiped.
	if not GameState.has_completed_tutorial and RunState.current_room_index == 0:
		_arm_tutorial()
	wave_label.text = "WAVE 1 / %d  incoming" % max(1, _waves.size())
	# Iter 33 — special-room dispatch. Combat rooms run the wave timer
	# as before; treasure / shrine rooms skip waves and route through
	# dedicated helpers that spawn their own content. The room_kind
	# field is "combat" by default so existing rooms keep iter-30
	# behavior with zero per-room changes.
	var kind: String = _room.room_kind if _room != null else "combat"
	match kind:
		"treasure":
			_enter_treasure_room()
		"shrine":
			_enter_shrine_room()
		_:
			var t := get_tree().create_timer(INITIAL_WAVE_DELAY)
			t.timeout.connect(func (): _start_wave(0))

func _process(_delta: float) -> void:
	# iter-119: tick the status-hint auto-fade. Uses get_process_delta_time
	# directly so we don't have to rename `_delta` (kept underscored to
	# preserve "param unused" intent for the existing _process body).
	_process_status_fade(get_process_delta_time())
	# iter-124: same poll for the wave_label so wave transitions are
	# transient instead of permanent.
	_process_wave_fade(get_process_delta_time())
	# Iter 158 — run timer HUD. Polled rather than tween-driven because
	# the display formatting (m:ss) snaps each second and a tween would
	# fight the snapping. Stops updating after hero death (_alive flips
	# false in _on_hero_died) so the last visible time is the death-time.
	_update_run_timer_label()
	# Iter 160 — tutorial progression. Cheap branch when state is OFF
	# (early-out on the first line) so the polling cost is negligible
	# in the steady state.
	if _tutorial_state != TutorialState.OFF:
		_tick_tutorial(get_process_delta_time())
	if _hit_stop_timer > 0.0:
		_hit_stop_timer -= 1.0 / 60.0
		if _hit_stop_timer <= 0.0:
			Engine.time_scale = 1.0
	# Iter 17 — boss HP bar refresh + hide on death. Polling avoids
	# adding an hp_changed signal to every enemy just to drive one UI.
	if _boss_ref != null:
		if is_instance_valid(_boss_ref) and _boss_ref.hp > 0:
			# Iter 157 — pulse the bar Control on every HP drop. We poll
			# this tick anyway; one int compare is free. Without this
			# beat the HP bar smoothly decremented with no on-hit
			# emphasis — boss hits looked identical to small ticks.
			# Only fires on DECREASE (heals don't pulse) and skips the
			# initial spawn-tick (_prev_boss_hp = 0 means we haven't
			# armed yet — first hp set runs this update path and arms
			# the tracker for next frame).
			if _prev_boss_hp > 0 and _boss_ref.hp < _prev_boss_hp:
				_pulse_boss_bar()
			boss_hp_bar.value = float(_boss_ref.hp)
			_prev_boss_hp = _boss_ref.hp
		else:
			boss_bar.visible = false
			# Iter 57 — boss-kill achievements. Identified by the boss's
			# display_name at the moment of death (boss_name label still
			# carries the upper-cased name we set at spawn). Each boss
			# unlocks its dedicated achievement; future bosses get new
			# entries via the registry.
			var bn: String = boss_name.text
			if bn == "IRON REVENANT":
				GameState.unlock_achievement("iron_revenant_slain")
			elif bn == "BROODMOTHER":
				GameState.unlock_achievement("broodmother_slain")
			_boss_ref = null
			# Iter 157 — reset pulse tracker so next boss-spawn starts
			# clean. Without this, killing one boss then spawning the
			# next would have _prev_boss_hp = (dead boss HP at death)
			# leftover, which is technically harmless but conceptually
			# stale.
			_prev_boss_hp = 0
	if _wave_state == WaveState.ACTIVE:
		# Filter out "breakables" (chests) — they join the "enemies"
		# group so the hero's sword swing iteration finds them, but
		# they must NOT count toward the wave-clear threshold or wave
		# 1 would never clear while a chest still stood unbroken.
		var live: int = get_tree().get_nodes_in_group("enemies").filter(
			func (n: Node) -> bool: return not n.is_in_group("breakables")
		).size()
		# Iter 15: also wait for _pending_spawns to drain. Staggered
		# spawns from _start_wave defer enemy instantiation via timers;
		# without this guard, killing the first enemy before the second
		# spawns would false-positive "wave clear."
		if live == 0 and _pending_spawns == 0:
			_on_wave_cleared()

func _spawn_torches(positions: Array[Vector2]) -> void:
	for pos in positions:
		var t: Node2D = TORCH_SCENE.instantiate()
		t.position = pos
		t.add_to_group("torches")   # iter 35 — dim_lights events iterate this group
		add_child(t)

# Iter 36 — pillar position jitter. Returns a NEW array (doesn't
# mutate the source RoomConfig.pillar_positions) with each entry
# offset by ±jitter radius drawn from _visit_rng. jitter <= 0 or
# missing RNG returns the original array unchanged.
#
# Rationale: pillars are decorative cover; a ±15px shift doesn't
# break combat geometry but reads as a real per-visit variant. Spawn
# points + hazards are NOT jittered (those gate combat timing).
func _maybe_jitter_pillars(positions: Array[Vector2], jitter: float) -> Array[Vector2]:
	if jitter <= 0.0 or _visit_rng == null:
		return positions
	var out: Array[Vector2] = []
	for p in positions:
		var off: Vector2 = Vector2(
			_visit_rng.randf_range(-jitter, jitter),
			_visit_rng.randf_range(-jitter, jitter),
		)
		out.append(p + off)
	return out

func _spawn_pillars(positions: Array[Vector2]) -> void:
	for pos in positions:
		var p: Pillar = PILLAR_SCENE.instantiate()
		p.position = pos
		add_child(p)

# Iter 38 — optional content spawner. Each entry from RoomConfig.
# lore_stones spawns one LoreStone with its position + lore text +
# stat grant config wired BEFORE add_child so _ready picks it up
# on first frame. Unknown stat_keys still work (GameState.shrine_
# bonuses accepts arbitrary keys and just contributes nothing to
# downstream modifier_total reads).
func _spawn_lore_stones(entries: Array[Dictionary]) -> void:
	if entries.is_empty():
		return
	for entry in entries:
		var stone: Area2D = LORE_STONE_SCENE.instantiate() as Area2D
		stone.set("lore_text", str(entry.get("text", "")))
		stone.set("stat_key", str(entry.get("stat_key", "")))
		stone.set("stat_value", entry.get("stat_value", 0))
		var pos: Vector2 = entry.get("position", Vector2.ZERO) as Vector2
		stone.position = pos
		add_child(stone)

func _spawn_chests(positions: Array[Vector2]) -> void:
	for pos in positions:
		var c: Chest = CHEST_SCENE.instantiate()
		c.position = pos
		add_child(c)

# Iter 30 — interior walls. For each rect in wall_rects, build a
# StaticBody2D + CollisionShape2D matching the rect, plus a visible
# Polygon2D backdrop + Line2D outline so the wall reads against the
# floor. Walls go on collision layer 1 ("world") to match the outer
# wall colliders in main.tscn — enemies + projectiles already collide
# with that layer, so we get full physics integration for free.
#
# Visual: dark blue-grey body (matches the iter-18 door stone) + a
# warmer light-grey top edge so vertical walls cast an implied shadow
# downward. Built in code (vs adding nodes per-room in the .tscn) so
# adding a new room's layout is just a wall_rects edit in its .tres.
func _spawn_interior_walls(rects: Array[Rect2]) -> void:
	for r in rects:
		var body: StaticBody2D = _build_interior_wall(r)
		add_child(body)

# Iter 35 — extracted wall builder so wave_events.raise_wall can build
# a wall WITHOUT immediately adding it (it gets tweened in from below
# floor). Returns a StaticBody2D positioned at the rect's center with
# all visual children attached but NOT yet in the tree.
func _build_interior_wall(r: Rect2) -> StaticBody2D:
	var body: StaticBody2D = StaticBody2D.new()
	body.collision_layer = 1
	body.collision_mask = 0
	body.position = r.position + r.size * 0.5
	var shape: CollisionShape2D = CollisionShape2D.new()
	var rect_shape: RectangleShape2D = RectangleShape2D.new()
	rect_shape.size = r.size
	shape.shape = rect_shape
	body.add_child(shape)
	var w: float = r.size.x * 0.5
	var h: float = r.size.y * 0.5
	# Iter 51 — drop shadow polygon. Soft dark ellipse footprint extending
	# past the wall's outer edge with vertex-color fade so the wall feels
	# grounded vs floating.
	# Iter 179 — extended the bottom shadow significantly + softened the
	# top-side fade so the wall reads as a STONE BLOCK with a real cast
	# shadow on the floor below it (light from above-front).
	var shadow_top_extra: float = 6.0
	var shadow_side_extra: float = 8.0
	var shadow_bot_extra: float = 14.0
	var shadow: Polygon2D = Polygon2D.new()
	shadow.polygon = PackedVector2Array([
		Vector2(-w - shadow_side_extra, -h - shadow_top_extra),
		Vector2(w + shadow_side_extra, -h - shadow_top_extra),
		Vector2(w + shadow_side_extra, h + shadow_bot_extra),
		Vector2(-w - shadow_side_extra, h + shadow_bot_extra),
	])
	var sh_edge: Color = Color(0, 0, 0, 0.0)
	var sh_core: Color = Color(0, 0, 0, 0.60)
	# Per-vertex colors: top corners feather out (light catches top of
	# block, no shadow up there), bottom corners deep dark (long cast
	# shadow on the floor below). Sells "block casts shadow forward."
	shadow.vertex_colors = PackedColorArray([sh_edge, sh_edge, sh_core, sh_core])
	shadow.z_index = -1
	body.add_child(shadow)
	# Iter 179 — proper 3D-stone depth recipe (was iter-30 flat polygon
	# + 3 px top bevel + 4 px bottom line, which read as a grey planks
	# in the user's iter-178 playtest). Now stacked as:
	#   SIDE FACE  (dark stone, fills the body below the top face)
	#   TOP FACE   (lighter stone, top 4 px — the surface light hits)
	#   SEAM       (1 px black, top-face/side-face junction shadow)
	#   HIGHLIGHT  (sub-pixel warm cream line, very top edge)
	#   CONTACT    (gradient polygon below the wall, replaces the 4 px
	#               line shadow — feels like the block sits on the floor)
	# Top-face depth scales with wall height: 3 px for thin walls, up to
	# 6 px for tall walls. Min 2 so it always reads.
	var top_face_h: float = clamp(h * 0.22, 2.0, 6.0)
	# SIDE FACE — dark stone, occupies everything below top_face_h.
	var side_face: Polygon2D = Polygon2D.new()
	side_face.polygon = PackedVector2Array([
		Vector2(-w, -h + top_face_h),
		Vector2(w, -h + top_face_h),
		Vector2(w, h),
		Vector2(-w, h),
	])
	# Slight vertical gradient (lighter at top, darker at bottom) so
	# the slab doesn't read as a single flat color. vertex_colors
	# expects clockwise from top-left.
	var side_top: Color = Color(0.22, 0.20, 0.26, 1.0)
	var side_bot: Color = Color(0.13, 0.12, 0.16, 1.0)
	side_face.vertex_colors = PackedColorArray([side_top, side_top, side_bot, side_bot])
	body.add_child(side_face)
	# TOP FACE — lighter stone, catches the overhead light.
	var top_face: Polygon2D = Polygon2D.new()
	top_face.polygon = PackedVector2Array([
		Vector2(-w, -h),
		Vector2(w, -h),
		Vector2(w, -h + top_face_h),
		Vector2(-w, -h + top_face_h),
	])
	top_face.color = Color(0.38, 0.34, 0.40, 1.0)
	body.add_child(top_face)
	# HIGHLIGHT — thin warm-cream pinstripe along the very top edge.
	# Sub-px width via antialias so it reads as a beveled rim, not a
	# painted stripe.
	var top_edge: Line2D = Line2D.new()
	top_edge.points = PackedVector2Array([
		Vector2(-w + 2, -h + 0.5), Vector2(w - 2, -h + 0.5),
	])
	top_edge.width = 1.5
	top_edge.default_color = Color(0.58, 0.50, 0.40, 0.85)
	top_edge.antialiased = true
	body.add_child(top_edge)
	# SEAM — 1 px dark line at the top-face/side-face junction. This
	# is the single edit that most sells "two faces meeting at an
	# angle" vs "one slab painted two colors."
	var seam: Line2D = Line2D.new()
	seam.points = PackedVector2Array([
		Vector2(-w, -h + top_face_h),
		Vector2(w, -h + top_face_h),
	])
	seam.width = 1.0
	seam.default_color = Color(0.04, 0.03, 0.05, 0.85)
	seam.antialiased = true
	body.add_child(seam)
	# Iter 184 batch 2 — masonry seams matching the perimeter wall
	# pattern (PERIMETER_MASONRY_SPACING = 160 px). Wall mass on the
	# perimeter now shows stone-block divisions; without this the
	# interior walls would read as smooth slabs while perimeter reads
	# as masonry — visual inconsistency. Seams are vertical near-black
	# 1-px lines across the SIDE FACE, spaced 56 px apart (denser than
	# perimeter because interior walls are shorter; 56 is roughly
	# 1/3 of 160 scaled for the smaller block size). Skipped if the
	# wall is too narrow for at least one interior seam.
	var seam_spacing: float = 56.0
	var seam_x: float = -w + seam_spacing
	while seam_x < w - 4.0:
		var masonry: Line2D = Line2D.new()
		masonry.points = PackedVector2Array([
			Vector2(seam_x, -h + top_face_h + 1),
			Vector2(seam_x, h - 1),
		])
		masonry.width = 1.0
		masonry.default_color = Color(0.04, 0.03, 0.06, 0.70)
		masonry.antialiased = true
		body.add_child(masonry)
		seam_x += seam_spacing
	# CONTACT — soft gradient strip just below the wall's bottom edge.
	# Quad polygon with vertex-color fade: solid black at top (where
	# it meets the wall) → transparent at bottom (12 px below). Adds
	# the contact-shadow that grounds the wall — Hades + Isaac both
	# do this under every prop.
	var contact: Polygon2D = Polygon2D.new()
	contact.polygon = PackedVector2Array([
		Vector2(-w + 3, h),
		Vector2(w - 3, h),
		Vector2(w - 9, h + 10),
		Vector2(-w + 9, h + 10),
	])
	var contact_solid: Color = Color(0, 0, 0, 0.55)
	var contact_fade: Color = Color(0, 0, 0, 0.0)
	contact.vertex_colors = PackedColorArray([contact_solid, contact_solid, contact_fade, contact_fade])
	body.add_child(contact)
	return body

# ── iter-115: Room readability chrome ───────────────────────────────────
#
# Pre-iter-115 the room looked like a prototype: procedural_dungeon.png
# painted a textured floor with a dark border, and the 4 boundary walls
# in main.tscn were collision-only — no extra art. Result: walls felt
# thin (just the printed edge of the floor texture), the floor noise
# competed with combat in the play-area center, and the wall-to-floor
# seam had no AO. Iter-115 adds three layers of programmatic chrome:
#
#   1. CENTER FLOOR MUTE — a single dark Polygon2D covering the center
#      ~75% of the play area at 22% alpha. Mutes the floor noise where
#      combat happens; edges keep their tile variation for atmosphere.
#   2. PERIMETER WALL MASS — 4 solid Polygon2D strips along the room's
#      outer border, painted the same dark stone tone as interior walls.
#      Sells "the room is bounded by thick stone," not "a thin frame
#      painted on the floor." Plus per-side top-edge highlight Line2Ds
#      where the wall meets the floor (warm gray) so the silhouette
#      reads as receding-up rather than coplanar with the floor.
#   3. INNER WALL SHADOWS + CORNER AO — gradient strips fading from
#      dark at the wall edge to clear ~32 px into the floor. Plus
#      stronger darkness at the 4 corners. Reads as the ambient
#      occlusion you'd expect along the seam of a stone room.
#
# All chrome is added to the same canvas layer as the world (no separate
# CanvasLayer — it's part of the room geometry). Tree order is BEFORE
# the `move_child(hero, -1)` at the end of _ready, so the hero draws
# on top of every chrome polygon. z_index values mirror the existing
# shadow-stack: z=-1 for floor decor + wall AO + center wash; default
# z=0 for the wall mass + top-edge highlights.
# iter-123: PLAY_AREA_MIN.y reverted 128 → 96 alongside the WallTop
# move in main.tscn. The iter-122 HUD shelf was scrapped in favor of
# minimal floating text — no shelf means no need to reserve vertical
# space for it, so the play area extends to its natural y=96 boundary
# again. iter-115's chrome layers auto-redraw against the original
# bounds.
const PLAY_AREA_MIN: Vector2 = Vector2(96, 96)
const PLAY_AREA_MAX: Vector2 = Vector2(1184, 672)
const SCREEN_SIZE: Vector2 = Vector2(1280, 768)

# Visual tuning constants — single source of truth so per-biome swaps
# (a future iter) can re-skin without hunting through code. Center mute
# alpha stays below 0.25 so combat readability isn't sacrificed.
const CHROME_CENTER_MUTE_COLOR: Color = Color(0.05, 0.04, 0.07, 0.22)
const CHROME_WALL_STONE_COLOR: Color = Color(0.10, 0.08, 0.13, 1.0)
const CHROME_WALL_TOP_HIGHLIGHT: Color = Color(0.48, 0.42, 0.32, 0.85)
const CHROME_INNER_SHADOW_DARK: Color = Color(0, 0, 0, 0.55)
const CHROME_INNER_SHADOW_CLEAR: Color = Color(0, 0, 0, 0)
# Iter 183 item 3 — alpha 0.65 → 0.80 to push the corner darkness as
# the iter-183 item-1 floor / item-2 brazier lights create proper warm
# pools. Deeper corner AO = stronger "lit islands surrounded by
# darkness" composition (ChatGPT critique #4 + Hades pattern).
const CHROME_CORNER_DARK: Color = Color(0, 0, 0, 0.80)
# How far the AO shadow strip reaches into the play area from each wall.
# 32 px is large enough to read as a real shadow but small enough that
# combat doesn't get visually compressed.
const CHROME_INNER_SHADOW_DEPTH: float = 32.0
# Corner AO triangle reach. Larger than the inner-shadow depth so the
# corners read distinctly deeper than the straight edges.
const CHROME_CORNER_DEPTH: float = 96.0
# Center mute inset from the play-area edges. Polygon covers PLAY_AREA
# minus a CENTER_INSET margin so the wall AO strips can still read at
# full strength along the edges.
const CHROME_CENTER_INSET: float = 60.0

func _spawn_room_chrome() -> void:
	_spawn_perimeter_wall_mass()
	_spawn_wall_top_edge_highlights()
	_spawn_center_floor_mute()
	_spawn_wall_inner_shadows()
	_spawn_corner_ao()
	# iter-120: edge-only atmosphere. Scratches on the perimeter wall
	# mass + low-alpha stains along the wall→floor seam + small rubble
	# clusters at corners. All gated to the OUTER 80 px of the room so
	# the playable center stays uncluttered (the explicit goal of the
	# iter-115 center mute).
	_spawn_wall_atmosphere()
	# Iter 184 batch 1 — masonry seams on perimeter wall mass + 2-3
	# wall overlays (chains/blood/cobweb/crack/rune from PixelLab) +
	# a single subtle central floor anchor sigil. Three small additions
	# that together break the "perfect rectangle" feel.
	_spawn_perimeter_masonry_seams()
	_spawn_wall_overlays()
	_spawn_floor_focal_anchor()

# Solid dark stone fills along the 4 perimeter wall regions (the
# unused frame between the playable interior and the viewport edge).
# Opaque so the texture noise inside procedural_dungeon.png's dark
# border doesn't peek through — gives a uniform mass read.
func _spawn_perimeter_wall_mass() -> void:
	var play_min := PLAY_AREA_MIN
	var play_max := PLAY_AREA_MAX
	var screen := SCREEN_SIZE
	# TOP strip — y=0 to y=play_min.y
	_add_rect_polygon(Rect2(0, 0, screen.x, play_min.y), CHROME_WALL_STONE_COLOR, 0)
	# BOTTOM strip — y=play_max.y to y=screen.y
	_add_rect_polygon(Rect2(0, play_max.y, screen.x, screen.y - play_max.y), CHROME_WALL_STONE_COLOR, 0)
	# LEFT strip — x=0 to x=play_min.x (covers full height; top + bottom
	# strips already covered the corners, but a tiny overlap is invisible)
	_add_rect_polygon(Rect2(0, play_min.y, play_min.x, play_max.y - play_min.y), CHROME_WALL_STONE_COLOR, 0)
	# RIGHT strip — x=play_max.x to x=screen.x
	_add_rect_polygon(Rect2(play_max.x, play_min.y, screen.x - play_max.x, play_max.y - play_min.y), CHROME_WALL_STONE_COLOR, 0)

# Per-side warm-gray Line2D where each wall meets the floor. Mirrors
# the iter-30 interior-wall top-edge highlight grammar — sells "this
# is a stone block with light catching its inside edge."
func _spawn_wall_top_edge_highlights() -> void:
	var play_min := PLAY_AREA_MIN
	var play_max := PLAY_AREA_MAX
	# Inset 2 px from the corner so the 4 highlights don't double up
	# in the corner pixels.
	# TOP highlight
	_add_line(
		Vector2(play_min.x + 2, play_min.y),
		Vector2(play_max.x - 2, play_min.y),
		CHROME_WALL_TOP_HIGHLIGHT, 2.5, 0,
	)
	# BOTTOM highlight (slightly dimmer — floor side is in shadow)
	var bot_color := Color(
		CHROME_WALL_TOP_HIGHLIGHT.r * 0.5,
		CHROME_WALL_TOP_HIGHLIGHT.g * 0.5,
		CHROME_WALL_TOP_HIGHLIGHT.b * 0.5,
		CHROME_WALL_TOP_HIGHLIGHT.a,
	)
	_add_line(
		Vector2(play_min.x + 2, play_max.y),
		Vector2(play_max.x - 2, play_max.y),
		bot_color, 2.5, 0,
	)
	# LEFT highlight
	_add_line(
		Vector2(play_min.x, play_min.y + 2),
		Vector2(play_min.x, play_max.y - 2),
		CHROME_WALL_TOP_HIGHLIGHT, 2.5, 0,
	)
	# RIGHT highlight
	_add_line(
		Vector2(play_max.x, play_min.y + 2),
		Vector2(play_max.x, play_max.y - 2),
		CHROME_WALL_TOP_HIGHLIGHT, 2.5, 0,
	)

# Single low-alpha rectangle muting the texture noise in the play-area
# center. Stays inside CENTER_INSET margins so the perimeter wall AO
# below can still read at full strength along the edges.
func _spawn_center_floor_mute() -> void:
	var inset: float = CHROME_CENTER_INSET
	var r := Rect2(
		PLAY_AREA_MIN + Vector2(inset, inset),
		PLAY_AREA_MAX - PLAY_AREA_MIN - Vector2(inset * 2.0, inset * 2.0),
	)
	_add_rect_polygon(r, CHROME_CENTER_MUTE_COLOR, -1)

# 4 gradient strips fading from solid dark at the wall edge to clear
# CHROME_INNER_SHADOW_DEPTH px into the floor. Reads as the AO line you'd
# expect along the seam between vertical stone and horizontal floor.
func _spawn_wall_inner_shadows() -> void:
	var play_min := PLAY_AREA_MIN
	var play_max := PLAY_AREA_MAX
	var depth: float = CHROME_INNER_SHADOW_DEPTH
	var dark := CHROME_INNER_SHADOW_DARK
	var clear := CHROME_INNER_SHADOW_CLEAR
	# TOP edge: gradient from wall (dark) down to floor (clear)
	_add_quad_vertex_colors(
		Vector2(play_min.x, play_min.y),
		Vector2(play_max.x, play_min.y),
		Vector2(play_max.x, play_min.y + depth),
		Vector2(play_min.x, play_min.y + depth),
		[dark, dark, clear, clear],
		-1,
	)
	# BOTTOM edge
	_add_quad_vertex_colors(
		Vector2(play_min.x, play_max.y - depth),
		Vector2(play_max.x, play_max.y - depth),
		Vector2(play_max.x, play_max.y),
		Vector2(play_min.x, play_max.y),
		[clear, clear, dark, dark],
		-1,
	)
	# LEFT edge
	_add_quad_vertex_colors(
		Vector2(play_min.x, play_min.y),
		Vector2(play_min.x + depth, play_min.y),
		Vector2(play_min.x + depth, play_max.y),
		Vector2(play_min.x, play_max.y),
		[dark, clear, clear, dark],
		-1,
	)
	# RIGHT edge
	_add_quad_vertex_colors(
		Vector2(play_max.x - depth, play_min.y),
		Vector2(play_max.x, play_min.y),
		Vector2(play_max.x, play_max.y),
		Vector2(play_max.x - depth, play_max.y),
		[clear, dark, dark, clear],
		-1,
	)

# 4 corner AO triangles — deeper darkness at the inside corners than
# the straight-edge AO. Compounds with the inner_shadows so corners read
# distinctly heavier than mid-wall.
func _spawn_corner_ao() -> void:
	var play_min := PLAY_AREA_MIN
	var play_max := PLAY_AREA_MAX
	var d: float = CHROME_CORNER_DEPTH
	var dark := CHROME_CORNER_DARK
	var clear := CHROME_INNER_SHADOW_CLEAR
	# Top-left: dark at corner vertex, clear at the other 3
	_add_quad_vertex_colors(
		play_min,
		play_min + Vector2(d, 0),
		play_min + Vector2(d, d),
		play_min + Vector2(0, d),
		[dark, clear, clear, clear],
		-1,
	)
	# Top-right
	var tr := Vector2(play_max.x, play_min.y)
	_add_quad_vertex_colors(
		tr + Vector2(-d, 0),
		tr,
		tr + Vector2(0, d),
		tr + Vector2(-d, d),
		[clear, dark, clear, clear],
		-1,
	)
	# Bottom-left
	var bl := Vector2(play_min.x, play_max.y)
	_add_quad_vertex_colors(
		bl + Vector2(0, -d),
		bl + Vector2(d, -d),
		bl + Vector2(d, 0),
		bl,
		[clear, clear, clear, dark],
		-1,
	)
	# Bottom-right
	var br := play_max
	_add_quad_vertex_colors(
		br + Vector2(-d, -d),
		br + Vector2(0, -d),
		br,
		br + Vector2(-d, 0),
		[clear, clear, dark, clear],
		-1,
	)

# ── iter-120: Edge-only atmosphere ───────────────────────────────────
#
# Restrained decoration along the wall→floor seam to dirty up the
# perimeter without crowding the play-area center. THREE sub-layers:
#
#   WALL SCRATCHES — short dark Line2Ds (4-14 px) drawn on the
#   perimeter wall mass. Random rotation ±25° from perpendicular to the
#   wall. Reads as ancient stone with weathered etchings.
#
#   EDGE STAINS — low-alpha dark Polygon2D blots in the strip between
#   wall and 60 px into the floor. Distinct from the iter-115 AO
#   gradient (which is a uniform falloff strip) — stains are
#   irregular splotches that catch the eye as wear marks.
#
#   CORNER RUBBLE — 3 small dark pebble shapes clustered at each of
#   the 4 inside corners. Anchors the AO with physical detail.
#
# All three layers stay in the OUTER 80 px of the room. _scatter_decor
# (iter-18+) handles play-area decor; this iter is purely the rim
# detail that _scatter_decor was leaving sparse.
const ATMOSPHERE_SCRATCH_COUNT: int = 24
const ATMOSPHERE_STAIN_COUNT: int = 18
const ATMOSPHERE_CORNER_RUBBLE_PER_CORNER: int = 3
# Pre-cached colors so the spawn loop doesn't recreate Color objects.
const ATMOSPHERE_SCRATCH_COLOR: Color = Color(0.04, 0.03, 0.06, 0.7)
const ATMOSPHERE_STAIN_COLOR: Color = Color(0.05, 0.04, 0.08, 0.45)
const ATMOSPHERE_RUBBLE_COLOR: Color = Color(0.12, 0.10, 0.14, 0.85)

func _spawn_wall_atmosphere() -> void:
	_spawn_wall_scratches()
	_spawn_edge_stains()
	_spawn_corner_rubble()

# Short dark scratches drawn on the perimeter wall mass. 6 per wall
# (24 total). Random offset along each wall, perpendicular-ish rotation.
func _spawn_wall_scratches() -> void:
	var per_wall: int = ATMOSPHERE_SCRATCH_COUNT / 4
	var walls := _atmosphere_wall_strips()
	for w in walls:
		# w is a Dictionary with "axis" ("h" or "v"), "fixed" (the wall
		# y/x coord), "from", "to" (range along the axis), "perp_dir"
		# (-1 or +1 — where INTO the wall mass is)
		var axis: String = w["axis"]
		var fixed: float = w["fixed"]
		var from: float = w["from"]
		var to: float = w["to"]
		var perp: int = int(w["perp"])
		for i in per_wall:
			var t: float = randf_range(from, to)
			var depth_into_wall: float = randf_range(8.0, 24.0)
			var scratch_len: float = randf_range(4.0, 14.0)
			var pos: Vector2
			if axis == "h":
				# Wall runs horizontal (top or bottom). Fixed coord is y;
				# scratch is positioned along x=t, y=fixed+perp*depth.
				pos = Vector2(t, fixed + perp * depth_into_wall)
			else:
				pos = Vector2(fixed + perp * depth_into_wall, t)
			# Scratch direction: mostly perpendicular to the wall but
			# with ±25° jitter so scratches don't all look parallel.
			var base_angle: float = 0.0 if axis == "v" else PI * 0.5
			var angle: float = base_angle + randf_range(-0.44, 0.44)
			var dir: Vector2 = Vector2(cos(angle), sin(angle))
			var line: Line2D = Line2D.new()
			line.points = PackedVector2Array([
				pos - dir * (scratch_len * 0.5),
				pos + dir * (scratch_len * 0.5),
			])
			line.width = 1.0
			line.default_color = ATMOSPHERE_SCRATCH_COLOR
			line.antialiased = true
			line.z_index = 1
			add_child(line)

# Irregular dark blots in the strip near the walls. 4-5 per side.
func _spawn_edge_stains() -> void:
	var per_side: int = ATMOSPHERE_STAIN_COUNT / 4
	var walls := _atmosphere_wall_strips()
	for w in walls:
		var axis: String = w["axis"]
		var fixed: float = w["fixed"]
		var from: float = w["from"]
		var to: float = w["to"]
		var perp: int = int(w["perp"])
		# Stains live INSIDE the room, in the 16..60 px band from the wall.
		for i in per_side:
			var along: float = randf_range(from, to)
			var into_floor: float = randf_range(16.0, 60.0)
			var pos: Vector2
			if axis == "h":
				pos = Vector2(along, fixed - perp * into_floor)
			else:
				pos = Vector2(fixed - perp * into_floor, along)
			# 6-vert irregular blob — randf jitter per vertex creates a
			# different silhouette each spawn.
			var r: float = randf_range(8.0, 16.0)
			var verts: PackedVector2Array = PackedVector2Array()
			for j in 6:
				var a: float = TAU * float(j) / 6.0
				var jr: float = r * randf_range(0.65, 1.15)
				verts.append(Vector2(cos(a) * jr, sin(a) * jr))
			var stain: Polygon2D = Polygon2D.new()
			stain.polygon = verts
			stain.color = ATMOSPHERE_STAIN_COLOR
			stain.position = pos
			stain.rotation = randf_range(0.0, TAU)
			stain.z_index = -1
			add_child(stain)

# Small pebble clusters at each inside corner. 3 pebbles per corner,
# tight ±8 px scatter, dark color so they read as rubble accumulating
# in the corners.
func _spawn_corner_rubble() -> void:
	var pad: float = 18.0
	var corners: Array[Vector2] = [
		PLAY_AREA_MIN + Vector2(pad, pad),
		Vector2(PLAY_AREA_MAX.x - pad, PLAY_AREA_MIN.y + pad),
		PLAY_AREA_MAX - Vector2(pad, pad),
		Vector2(PLAY_AREA_MIN.x + pad, PLAY_AREA_MAX.y - pad),
	]
	for corner in corners:
		for i in ATMOSPHERE_CORNER_RUBBLE_PER_CORNER:
			var off := Vector2(randf_range(-12.0, 12.0), randf_range(-12.0, 12.0))
			var pebble: Polygon2D = Polygon2D.new()
			var s: float = randf_range(3.0, 6.0)
			var verts: PackedVector2Array = PackedVector2Array()
			for j in 5:
				var a: float = TAU * float(j) / 5.0
				var jr: float = s * randf_range(0.7, 1.15)
				verts.append(Vector2(cos(a) * jr, sin(a) * jr))
			pebble.polygon = verts
			pebble.color = ATMOSPHERE_RUBBLE_COLOR
			pebble.position = corner + off
			pebble.rotation = randf_range(0.0, TAU)
			pebble.z_index = 0
			add_child(pebble)

# Returns the 4 wall-strip parameters used by the scratch + stain spawners.
# Each dict carries: axis ("h" for horizontal wall, "v" for vertical),
# fixed (the wall's coord on its NORMAL axis), from/to (range along the
# wall), and perp (+1 / -1, the direction INTO the wall from the play
# area). Single source of truth so scratch + stain offsets stay aligned.
func _atmosphere_wall_strips() -> Array[Dictionary]:
	var play_min := PLAY_AREA_MIN
	var play_max := PLAY_AREA_MAX
	# Inset from the corners so atmosphere doesn't collide with the
	# corner rubble piles at the very edge.
	var inset: float = 40.0
	return [
		# TOP wall — horizontal, fixed y = play_min.y, perp = -1 (into wall = up)
		{"axis": "h", "fixed": play_min.y, "from": play_min.x + inset, "to": play_max.x - inset, "perp": -1},
		# BOTTOM wall — fixed y = play_max.y, perp = +1 (into wall = down)
		{"axis": "h", "fixed": play_max.y, "from": play_min.x + inset, "to": play_max.x - inset, "perp": +1},
		# LEFT wall — vertical, fixed x = play_min.x, perp = -1 (into wall = left)
		{"axis": "v", "fixed": play_min.x, "from": play_min.y + inset, "to": play_max.y - inset, "perp": -1},
		# RIGHT wall — fixed x = play_max.x, perp = +1
		{"axis": "v", "fixed": play_max.x, "from": play_min.y + inset, "to": play_max.y - inset, "perp": +1},
	]

# ── Generic primitive helpers (used only by _spawn_room_chrome). ──────
# Kept inline rather than extracted to a separate file because they
# only ever take Polygon2D / Line2D nodes added as children of the main
# scene. Same shape grammar as floor_clear_burst._make_rect.
func _add_rect_polygon(r: Rect2, c: Color, z: int) -> void:
	var p: Polygon2D = Polygon2D.new()
	p.polygon = PackedVector2Array([
		r.position,
		r.position + Vector2(r.size.x, 0),
		r.end,
		r.position + Vector2(0, r.size.y),
	])
	p.color = c
	p.z_index = z
	add_child(p)

func _add_line(a: Vector2, b: Vector2, c: Color, w: float, z: int) -> void:
	var ln: Line2D = Line2D.new()
	ln.points = PackedVector2Array([a, b])
	ln.width = w
	ln.default_color = c
	ln.antialiased = true
	ln.z_index = z
	add_child(ln)

func _add_quad_vertex_colors(v0: Vector2, v1: Vector2, v2: Vector2, v3: Vector2, colors: Array, z: int) -> void:
	var p: Polygon2D = Polygon2D.new()
	p.polygon = PackedVector2Array([v0, v1, v2, v3])
	p.vertex_colors = PackedColorArray(colors)
	p.z_index = z
	add_child(p)

# ── Iter 183 Item 2 — Perimeter prop clusters ────────────────────────
#
# Background: the iter-? room was a 1280×720 rectangle with pillars in
# the middle and decor scatter across the floor. Reads as "generated
# box" (ChatGPT critique #2). The Hades / Isaac pattern is "set-
# dressing islands" along the perimeter — authored prop clusters at
# the corners + edges that give the room recognizable architectural
# anchors while keeping the center clear for combat.
#
# What this places: at each of 4 corner positions (inset 200/220 px),
# spawn an anchor prop (random pick between bowl-brazier and pillar-
# brazier from PixelLab assets) + a ground shadow + a warm PointLight2D
# at the flame + 2-3 random decals (skull / bone / shards / crack /
# blood) scattered within 36 px of the prop base. Per-corner skip
# chance (20%) so not every room gets all 4 — variation between rooms.
#
# Skipped per-corner if pillar / chest / spawn / wall / hazard already
# occupies the area (radius 80 px). Seed is room-scoped so the cluster
# layout is stable within a run but fresh per run.
const PROP_BRAZIER_TEX: Texture2D = preload("res://assets/props/dungeon_brazier.png")
const PROP_PILLAR_BRAZIER_TEX: Texture2D = preload("res://assets/props/dungeon_pillar_brazier.png")
const PROP_FRAME_SIZE: int = 64
const DECAL_TEXTURES: Array[Texture2D] = [
	preload("res://assets/decor/decal_skull.png"),
	preload("res://assets/decor/decal_bone.png"),
	preload("res://assets/decor/decal_shards.png"),
	preload("res://assets/decor/decal_crack.png"),
	preload("res://assets/decor/decal_blood.png"),
]
# Four corner cluster positions. Inset 200/220 px from the corner so
# the prop sits inside the playable area but reads as "edge."
const PERIMETER_CLUSTER_POSITIONS: Array[Vector2] = [
	Vector2(200, 220),
	Vector2(1080, 220),
	Vector2(200, 548),
	Vector2(1080, 548),
]
# Per-cluster skip chance (some rooms get 3 anchors, some get 4).
const PERIMETER_CLUSTER_SKIP_CHANCE: float = 0.20
# Min distance to a pre-existing obstacle before we count a corner as
# "blocked" and skip its cluster.
const PERIMETER_OBSTACLE_RADIUS: float = 80.0

func _spawn_perimeter_prop_clusters() -> void:
	if _room == null:
		return
	# Build occupied list from per-room data so we don't place a prop on
	# top of an existing landmark. Pillar/chest positions are Vector2;
	# walls and hazards need rect-center conversion.
	var occupied: Array[Vector2] = []
	occupied.append_array(_room.pillar_positions)
	occupied.append_array(_room.chest_positions)
	occupied.append_array(_room.spawn_points)
	for h_pos in _room.hazard_positions:
		occupied.append(h_pos)
	for wall_r in _room.wall_rects:
		occupied.append(wall_r.position + wall_r.size * 0.5)
	# Seed RNG per-room so cluster prop choice + decal scatter is stable
	# within a run but fresh per run.
	var rng: RandomNumberGenerator = RandomNumberGenerator.new()
	rng.seed = (RunState.current_room_index + 1) * 7919 + GameState.dungeon_runs * 17 + 31
	for base_pos in PERIMETER_CLUSTER_POSITIONS:
		if _too_close_to_occupied(base_pos, occupied, PERIMETER_OBSTACLE_RADIUS):
			continue
		# Skip 20% of corners so not every room has all 4 — variation.
		if rng.randf() < PERIMETER_CLUSTER_SKIP_CHANCE:
			continue
		var jitter: Vector2 = Vector2(
			rng.randf_range(-14.0, 14.0),
			rng.randf_range(-14.0, 14.0)
		)
		var pos: Vector2 = base_pos + jitter
		var use_pillar: bool = rng.randf() < 0.45  # 45% pillar-brazier, 55% bowl
		_spawn_prop_anchor(pos, use_pillar)
		# 2-3 decals scattered within 36 px of the anchor base.
		var num_decals: int = rng.randi_range(2, 3)
		for i in range(num_decals):
			var off: Vector2 = Vector2(
				rng.randf_range(-36.0, 36.0),
				rng.randf_range(-30.0, 30.0)
			)
			_spawn_decal_at(pos + off, rng)

func _spawn_prop_anchor(pos: Vector2, is_pillar: bool) -> void:
	# Ground shadow under the prop. Pillar variant is narrower than
	# bowl. Drawn FIRST so tree order puts it under the body sprite.
	var shadow: Polygon2D = Polygon2D.new()
	var shadow_w: float = 22.0 if is_pillar else 28.0
	shadow.polygon = _ellipse_polygon(shadow_w, 8.0, 14)
	shadow.position = pos + Vector2(0, 4)
	shadow.color = Color(0, 0, 0, 0.55)
	shadow.z_index = 0
	add_child(shadow)
	# Prop sprite — AtlasTexture isolating frame 0 of the 7-frame sheet.
	# We render it static (no animation) — the warm flame light below
	# carries the "alive" cue; animating the sprite + light together
	# would cost cycles for marginal perception gain at this distance.
	var sprite: Sprite2D = Sprite2D.new()
	var atlas: AtlasTexture = AtlasTexture.new()
	atlas.atlas = PROP_PILLAR_BRAZIER_TEX if is_pillar else PROP_BRAZIER_TEX
	atlas.region = Rect2(0, 0, PROP_FRAME_SIZE, PROP_FRAME_SIZE)
	sprite.texture = atlas
	sprite.position = pos
	# offset.y = -28 puts the sprite's bottom ~4 px BELOW the position.
	# The prop's "feet" land just below the position so it reads as
	# standing on the floor (not floating above).
	sprite.offset = Vector2(0, -28)
	sprite.z_index = 2
	add_child(sprite)
	# Warm brazier light. Flame is near the TOP of the 64×64 sprite, so
	# the light source sits ~38 px above the position.
	# Iter 183 item 3 — bumped energy 0.55 → 0.95 to keep proportion
	# with the torch boost (energy 1.55 → 1.95) so corner braziers add
	# real warm pools rather than disappearing under the new deeper
	# corner AO (0.65 → 0.80 alpha). texture_scale 1.0 → 1.35 widens
	# the brazier's pool reach so the cluster feels lit, not just
	# tinted at the centerpoint.
	var light: PointLight2D = PointLight2D.new()
	light.color = Color(1.0, 0.62, 0.28, 1.0)
	light.energy = 0.95
	light.position = pos + Vector2(0, -38)
	light.range_z_min = -1024
	light.range_z_max = 1024
	light.shadow_enabled = false
	light.texture = _prop_light_radial_tex(128)
	light.texture_scale = 1.35
	light.z_index = 3
	add_child(light)

func _spawn_decal_at(pos: Vector2, rng: RandomNumberGenerator) -> void:
	var sprite: Sprite2D = Sprite2D.new()
	sprite.texture = DECAL_TEXTURES[rng.randi() % DECAL_TEXTURES.size()]
	sprite.position = pos
	# Random rotation so the same decal looks distinct at different
	# placements. Scale variation 0.75-1.1 adds light size variation.
	sprite.rotation = rng.randf() * TAU
	var s: float = rng.randf_range(0.75, 1.1)
	sprite.scale = Vector2(s, s)
	# Alpha variance so decals look like weathered remnants of varying
	# age, not freshly painted.
	sprite.modulate = Color(1, 1, 1, rng.randf_range(0.55, 0.88))
	sprite.z_index = 0
	add_child(sprite)

func _too_close_to_occupied(pos: Vector2, occupied: Array[Vector2], radius: float) -> bool:
	for occ in occupied:
		if pos.distance_to(occ) < radius:
			return true
	return false

func _ellipse_polygon(rx: float, ry: float, vertices: int) -> PackedVector2Array:
	var pts: PackedVector2Array = PackedVector2Array()
	for i in range(vertices):
		var t: float = float(i) / vertices * TAU
		pts.append(Vector2(cos(t) * rx, sin(t) * ry))
	return pts

func _prop_light_radial_tex(size: int) -> Texture2D:
	var grad: Gradient = Gradient.new()
	grad.offsets = PackedFloat32Array([0, 0.6, 1])
	grad.colors = PackedColorArray([
		Color(1, 1, 1, 1),
		Color(1, 1, 1, 0.4),
		Color(1, 1, 1, 0),
	])
	var tex: GradientTexture2D = GradientTexture2D.new()
	tex.gradient = grad
	tex.width = size
	tex.height = size
	tex.fill = GradientTexture2D.FILL_RADIAL
	tex.fill_from = Vector2(0.5, 0.5)
	tex.fill_to = Vector2(1.0, 0.5)
	return tex

# ── Iter 184 Batch 1 — Room composition (break the rectangle) ─────────
#
# Three small additions that together fix the "perfect rectangle test
# arena" feel without making the room busier:
#
# 1. Perimeter masonry seams: thin near-black vertical/horizontal Line2D
#    breaks across the perimeter wall mass every ~160 px. Reads as the
#    seams between cut stone blocks — the wall is now MASONRY, not a
#    flat slab.
#
# 2. Wall overlays: 2-3 PixelLab decals (chains, blood, cobweb, crack,
#    rune) placed asymmetrically on the wall mass per room. Authored
#    detail at the perimeter; very different from procedural decor.
#
# 3. Floor focal anchor: a single subtle warm-gold ceremonial circle
#    drawn into the floor at room center. Reads as "this is a ritual
#    chamber" rather than "this is an arena." Alpha kept very low so it
#    doesn't compete with combat — it's a SETTING cue, not a feature.

const WALL_OVERLAY_TEXTURES: Array[Texture2D] = [
	preload("res://assets/decor/wall_overlay_chains.png"),
	preload("res://assets/decor/wall_overlay_blood.png"),
	preload("res://assets/decor/wall_overlay_cobweb.png"),
	preload("res://assets/decor/wall_overlay_crack_v.png"),
	preload("res://assets/decor/wall_overlay_rune.png"),
]
# Candidate positions on the 4 perimeter wall strips. Top + bottom
# strips are 96 px tall (PLAY_AREA_MIN.y = 96); left + right are 96 px
# wide. 48×48 overlays fit comfortably centered. Asymmetric coverage:
# 4 candidates on top/bottom each, 2 on left/right each = 12 total.
const WALL_OVERLAY_CANDIDATES: Array[Vector2] = [
	Vector2(220, 44),    # top, left section
	Vector2(440, 44),    # top, center-left
	Vector2(840, 44),    # top, center-right
	Vector2(1060, 44),   # top, right section
	Vector2(220, 696),   # bottom, left
	Vector2(440, 696),   # bottom, center-left
	Vector2(840, 696),   # bottom, center-right
	Vector2(1060, 696),  # bottom, right
	Vector2(48, 220),    # left, top
	Vector2(48, 520),    # left, bottom
	Vector2(1232, 220),  # right, top
	Vector2(1232, 520),  # right, bottom
]
const PERIMETER_MASONRY_SPACING: float = 160.0
const PERIMETER_MASONRY_COLOR: Color = Color(0.03, 0.02, 0.04, 0.85)

# Perimeter wall masonry — thin dark seams every PERIMETER_MASONRY_SPACING
# px across the top + bottom + left + right wall strips. Sells "this is
# stone block masonry" rather than "flat dark slab." Z = 1 puts them
# above the perimeter wall mass (z = 0) but below the wall top-edge
# highlights (z = 0, tree-later) — no visual stacking conflicts.
func _spawn_perimeter_masonry_seams() -> void:
	var screen: Vector2 = SCREEN_SIZE
	var play_min: Vector2 = PLAY_AREA_MIN
	var play_max: Vector2 = PLAY_AREA_MAX
	# Top + bottom strips: vertical seam lines.
	# Start at PERIMETER_MASONRY_SPACING px in, march across.
	var x: float = PERIMETER_MASONRY_SPACING
	while x < screen.x:
		# Top strip seam — short vertical line in the 0..96 band.
		_add_line(
			Vector2(x, 8), Vector2(x, play_min.y - 4),
			PERIMETER_MASONRY_COLOR, 1.0, 1
		)
		# Bottom strip seam — short vertical line in 672..720 band.
		_add_line(
			Vector2(x, play_max.y + 4), Vector2(x, screen.y - 8),
			PERIMETER_MASONRY_COLOR, 1.0, 1
		)
		x += PERIMETER_MASONRY_SPACING
	# Left + right strips: horizontal seam lines in the inner play-height
	# range. Start at play_min.y + spacing, march down.
	var y: float = play_min.y + PERIMETER_MASONRY_SPACING * 0.5
	while y < play_max.y:
		# Left strip seam — short horizontal line in 0..96 band.
		_add_line(
			Vector2(8, y), Vector2(play_min.x - 4, y),
			PERIMETER_MASONRY_COLOR, 1.0, 1
		)
		# Right strip seam.
		_add_line(
			Vector2(play_max.x + 4, y), Vector2(screen.x - 8, y),
			PERIMETER_MASONRY_COLOR, 1.0, 1
		)
		y += PERIMETER_MASONRY_SPACING

# Wall overlays — 2-3 random PixelLab decals placed on the perimeter
# wall mass per room. Sits at z = 1 so it's above the wall mass and the
# masonry seams (both z = 0..1) but below the prop sprites at z = 2.
# Tree-order also places it after the perimeter mass spawn so it draws
# on top.
func _spawn_wall_overlays() -> void:
	var rng: RandomNumberGenerator = RandomNumberGenerator.new()
	rng.seed = (RunState.current_room_index + 1) * 4133 + GameState.dungeon_runs * 13 + 71
	var num_overlays: int = rng.randi_range(2, 3)
	# Pull-without-replacement so we don't double-stack on the same
	# candidate position.
	var pool: Array[Vector2] = WALL_OVERLAY_CANDIDATES.duplicate()
	for i in range(num_overlays):
		if pool.is_empty():
			break
		var idx: int = rng.randi() % pool.size()
		var pos: Vector2 = pool[idx]
		pool.remove_at(idx)
		var sprite: Sprite2D = Sprite2D.new()
		sprite.texture = WALL_OVERLAY_TEXTURES[rng.randi() % WALL_OVERLAY_TEXTURES.size()]
		sprite.position = pos
		# Optional horizontal flip so the same overlay can look distinct
		# at left-side vs right-side placements.
		sprite.flip_h = rng.randf() < 0.5
		# Alpha variance so overlays read as weathered/aged.
		sprite.modulate = Color(1, 1, 1, rng.randf_range(0.62, 0.88))
		sprite.z_index = 1
		add_child(sprite)

# Floor focal anchor — a single subtle warm-gold ring at room center.
# This is the "this room is a ritual chamber" cue that breaks the
# "this room is a test arena" reading. Built from a Line2D outline
# circle + 4 small cardinal pip Polygon2Ds. Very low alpha (~0.22) so
# the player notices it as ATMOSPHERE not as gameplay geometry.
# Centered at (640, 384) — directly under the room center. Hero spawns
# elsewhere (per _room.hero_spawn) so it doesn't conflict.
func _spawn_floor_focal_anchor() -> void:
	var c: Vector2 = Vector2(640, 384)
	var ring_radius: float = 56.0
	# Outline ring: 24-vert polyline closing the loop, dim warm gold.
	var ring: Line2D = Line2D.new()
	var pts: PackedVector2Array = PackedVector2Array()
	var verts: int = 28
	for i in range(verts + 1):
		var t: float = float(i) / verts * TAU
		pts.append(c + Vector2(cos(t) * ring_radius, sin(t) * ring_radius))
	ring.points = pts
	ring.width = 1.5
	ring.default_color = Color(0.55, 0.42, 0.22, 0.28)
	ring.antialiased = true
	ring.z_index = -1
	add_child(ring)
	# 4 cardinal pips inset from the ring — tiny diamond polygons that
	# read as "the cardinal points of a ritual seal."
	var pip_offset: float = ring_radius - 8.0
	var pip_positions: Array[Vector2] = [
		c + Vector2(0, -pip_offset),
		c + Vector2(pip_offset, 0),
		c + Vector2(0, pip_offset),
		c + Vector2(-pip_offset, 0),
	]
	for pp in pip_positions:
		var pip: Polygon2D = Polygon2D.new()
		pip.polygon = PackedVector2Array([
			Vector2(0, -3), Vector2(3, 0), Vector2(0, 3), Vector2(-3, 0),
		])
		pip.position = pp
		pip.color = Color(0.62, 0.48, 0.26, 0.32)
		pip.z_index = -1
		add_child(pip)
	# 4 short tick marks between the pips (NE, SE, SW, NW) at 45° angles.
	# Adds the "carved into stone" detail without crowding the ring.
	var tick_angles: Array[float] = [PI * 0.25, PI * 0.75, PI * 1.25, PI * 1.75]
	for angle in tick_angles:
		var tick_inner: Vector2 = c + Vector2(cos(angle), sin(angle)) * (ring_radius - 7.0)
		var tick_outer: Vector2 = c + Vector2(cos(angle), sin(angle)) * (ring_radius + 3.0)
		var tick: Line2D = Line2D.new()
		tick.points = PackedVector2Array([tick_inner, tick_outer])
		tick.width = 1.0
		tick.default_color = Color(0.55, 0.42, 0.22, 0.28)
		tick.antialiased = true
		tick.z_index = -1
		add_child(tick)

# Iter 30 — hazards (legacy single-kind path). For each position in
# hazard_positions, instantiate the scene matching hazard_kind. Unknown
# kinds emit a one-time warning (so misconfigured rooms surface
# immediately) but otherwise no-op.
func _spawn_hazards(positions: Array[Vector2], kind: String) -> void:
	if kind == "" or positions.is_empty():
		return
	var scene: PackedScene = HAZARD_SCENES.get(kind)
	if scene == null:
		push_warning("main.gd: unknown hazard_kind '%s' — skipping" % kind)
		return
	for pos in positions:
		var h: Node2D = scene.instantiate() as Node2D
		h.position = pos
		add_child(h)

# Iter 31 — mixed-hazard spawn path. Reads Array[Dictionary] from
# RoomConfig.hazards; each entry describes ONE hazard. Supports
# heterogeneous kinds (spike pit + fire jet + slow zone in the same
# room). Per-kind extra fields like "phase" (fire_jet / lightning_rod
# cycle offset) and "interval" (lightning_rod cadence) are written
# onto the instance BEFORE add_child so _ready picks them up.
func _spawn_hazards_mixed(entries: Array[Dictionary]) -> void:
	if entries.is_empty():
		return
	for entry in entries:
		var kind: String = entry.get("kind", "") as String
		if kind == "":
			continue
		var scene: PackedScene = HAZARD_SCENES.get(kind)
		if scene == null:
			push_warning("main.gd: unknown hazard kind '%s' in hazards[] — skipping" % kind)
			continue
		var h: Node2D = scene.instantiate() as Node2D
		var pos: Vector2 = entry.get("position", Vector2.ZERO) as Vector2
		h.position = pos
		# Per-kind extras. Read explicitly rather than blast all keys
		# onto the node — keeps the contract narrow + makes typos
		# surface during authoring.
		if entry.has("phase") and ("phase" in h):
			h.set("phase", entry.get("phase", 0.0))
		if entry.has("interval") and ("interval" in h):
			h.set("interval", entry.get("interval", 3.0))
		add_child(h)

# Iter 18 — procedural decor scatter. Builds N small Polygon2D rubble
# clusters at random walkable positions, avoiding the hero spawn /
# enemy spawn points / room center so the decor doesn't crowd combat
# space. Each rubble is 4-5 irregular dark vertices at low alpha with
# slight Y-jitter and rotation — keeps the floor reading as "ancient"
# rather than "blank tile."
#
# Why procedural (vs hand-placed in RoomConfig): scatters are
# perceptually noise, not gameplay-significant. Hand-authoring 60
# positions across 3 rooms is wasted effort; randomness with a guard
# on minimum distance from gameplay-relevant points is cheaper +
# gives the room a different "feel" each load without re-authoring.
func _scatter_decor(count: int) -> void:
	if count <= 0:
		return
	# Iter 184 batch 2 — decor density was tuned against a noisy texture
	# floor that masked individual decor pieces. With iter-183 item 1's
	# solid dark BaseFloor, every decor piece is much more visible — the
	# previous 30-60 single-piece scatter + 5 piles + 28 speckles totaled
	# 80-110 pieces per room which now reads as visual clutter rather
	# than weathering (directive: "Less but better").
	#
	# Multiply input count by 0.55 (~45% reduction). This respects the
	# per-room .tres files (which declare relative density) while
	# bringing absolute counts in line with the new readable floor.
	count = int(count * 0.55)
	if count <= 0:
		return
	# Walkable bounds — inside the wall colliders, with a margin so
	# decor doesn't visually clip into walls. Hardcoded to match
	# main.tscn's wall positions (96/1184 horizontally, 96/672
	# vertically) plus the 30-px decor radius.
	var play_left: float = 130.0
	var play_right: float = 1150.0
	var play_top: float = 130.0
	var play_bottom: float = 640.0
	var min_dist_spawn: float = 90.0
	var min_dist_pillar: float = 60.0
	var min_dist_chest: float = 50.0
	var min_dist_center: float = 100.0  # leave the middle clear (pedestal lands there)
	# iter-118: reserve clear space around every future door spawn so
	# decor doesn't appear inside or directly adjacent to the portal
	# silhouette. Door positions are deterministic per room (see
	# _door_positions_for_room) so we can compute them at scatter time
	# even though the doors don't physically spawn until wave-clear.
	var door_positions: Array[Vector2] = _door_positions_for_room()
	var center := Vector2(640, 384)
	var attempts: int = 0
	var placed: int = 0
	var max_attempts: int = count * 30  # generous; aborts if room is over-constrained
	while placed < count and attempts < max_attempts:
		attempts += 1
		var pos := Vector2(
			randf_range(play_left, play_right),
			randf_range(play_top, play_bottom),
		)
		if pos.distance_to(_room.hero_spawn) < min_dist_spawn:
			continue
		if pos.distance_to(center) < min_dist_center:
			continue
		var bad := false
		for sp in _room.spawn_points:
			if pos.distance_to(sp) < min_dist_spawn:
				bad = true
				break
		if bad:
			continue
		for pp in _room.pillar_positions:
			if pos.distance_to(pp) < min_dist_pillar:
				bad = true
				break
		if bad:
			continue
		for cp in _room.chest_positions:
			if pos.distance_to(cp) < min_dist_chest:
				bad = true
				break
		if bad:
			continue
		# iter-118: reserve area around door positions.
		for dp in door_positions:
			if pos.distance_to(dp) < DOOR_CLEARANCE_RADIUS:
				bad = true
				break
		if bad:
			continue
		_spawn_decor_at(pos)
		placed += 1
	# Iter 52 — second pass: larger "rubble pile" clusters scattered
	# around the room. Each pile is 4 decor pieces clustered within
	# ~14 px so they read as a single debris pile rather than 4 stray
	# stains. Spawn ~5 piles per room (independent of decor_density)
	# so even low-decor rooms get the heavier visual anchors.
	# Same collision rules as the single-piece scatter — avoid hero
	# spawn / enemy spawn / pillar / chest / center.
	# Iter 184 batch 2 — pile_count 5 → 3. With iter-183 item 2's 4
	# perimeter prop clusters already providing authored anchors at the
	# corners, 5 procedural debris piles in the middle was over-stuffing
	# the floor. 3 piles + 4 corner clusters = 7 anchored points around
	# the room, which is the Hades "few-but-deliberate" density.
	var pile_count: int = 3
	var piles_placed: int = 0
	var pile_attempts: int = 0
	while piles_placed < pile_count and pile_attempts < pile_count * 20:
		pile_attempts += 1
		var pos := Vector2(
			randf_range(play_left, play_right),
			randf_range(play_top, play_bottom),
		)
		if pos.distance_to(_room.hero_spawn) < min_dist_spawn:
			continue
		if pos.distance_to(center) < min_dist_center + 30.0:   # extra margin for the bigger pile silhouette
			continue
		var bad_p := false
		for sp in _room.spawn_points:
			if pos.distance_to(sp) < min_dist_spawn:
				bad_p = true
				break
		if bad_p:
			continue
		for pp in _room.pillar_positions:
			if pos.distance_to(pp) < min_dist_pillar + 12.0:
				bad_p = true
				break
		if bad_p:
			continue
		# iter-118: piles also avoid door zones (extra-wide margin since
		# piles span ~28 px diameter — larger than single decor).
		for dp in door_positions:
			if pos.distance_to(dp) < DOOR_CLEARANCE_RADIUS + 14.0:
				bad_p = true
				break
		if bad_p:
			continue
		# Tight cluster of 4 pieces.
		for _i in range(4):
			var off: Vector2 = Vector2(randf_range(-14, 14), randf_range(-10, 10))
			_spawn_decor_at(pos + off)
		piles_placed += 1
	# Iter 52 — stone speckle highlights. Subtle bright pips scattered
	# across the floor at z=-2 so they sit BELOW regular decor but
	# ABOVE the biome floor wash. Reads as "granite flecks / weathered
	# stone shine" — breaks up the otherwise-uniform floor backdrop
	# noticeably better than the larger decor alone.
	# Iter 184 batch 2 — 28 → 18 to match the cycle 3 decor density
	# reduction. The solid dark BaseFloor lets every speckle read more
	# clearly than the old noisy texture did, so fewer is enough.
	for _i in range(18):
		var sp_pos: Vector2 = Vector2(
			randf_range(110.0, 1170.0),
			randf_range(110.0, 660.0),
		)
		var pip: Polygon2D = Polygon2D.new()
		var sz: float = randf_range(1.5, 3.0)
		pip.polygon = PackedVector2Array([
			Vector2(sz, 0), Vector2(0, sz), Vector2(-sz, 0), Vector2(0, -sz),
		])
		# Warm-grey speckle with low alpha so it reads as floor
		# texture grain rather than discrete props.
		pip.color = Color(
			randf_range(0.45, 0.65),
			randf_range(0.40, 0.58),
			randf_range(0.36, 0.50),
			randf_range(0.22, 0.38),
		)
		pip.position = sp_pos
		pip.rotation = randf_range(0.0, TAU)
		pip.z_index = -2
		add_child(pip)

# Iter 34 — biome-aware decor. The biome of the current room (read
# from _room.biome at the dispatcher) controls which decor flavor we
# instantiate at each rubble position. "crypt" preserves the iter-18
# dark stains; new biomes get distinct shape + color recipes for
# instantly-readable atmosphere.
func _spawn_decor_at(pos: Vector2) -> void:
	var biome: String = _room.biome if _room != null else "crypt"
	match biome:
		"ossuary":
			_spawn_decor_ossuary(pos)
		"ember":
			_spawn_decor_ember(pos)
		"sanctuary":
			_spawn_decor_sanctuary(pos)
		_:
			_spawn_decor_crypt(pos)

# Crypt — iter-18 baseline. 4-vert dark grey-brown ellipse stain.
func _spawn_decor_crypt(pos: Vector2) -> void:
	var rubble := Polygon2D.new()
	var r1: float = randf_range(8.0, 14.0)
	var r2: float = randf_range(6.0, 11.0)
	var pts := PackedVector2Array()
	pts.append(Vector2(-r1 + randf_range(-2, 2), randf_range(-1, 1)))
	pts.append(Vector2(randf_range(-2, 2), -r2 + randf_range(-1, 1)))
	pts.append(Vector2(r1 + randf_range(-2, 2), randf_range(-1, 1)))
	pts.append(Vector2(randf_range(-2, 2), r2 + randf_range(-1, 1)))
	rubble.polygon = pts
	rubble.color = Color(
		randf_range(0.10, 0.18),
		randf_range(0.09, 0.14),
		randf_range(0.08, 0.13),
		randf_range(0.35, 0.55),
	)
	rubble.position = pos
	rubble.rotation = randf_range(0.0, TAU)
	rubble.z_index = -1
	add_child(rubble)

# Ossuary — small bone fragments. Authored as elongated ivory
# polygons (6 vertices, longer than tall) tilted at random angles.
# Brighter than crypt stains (alpha 0.5-0.7) so the bones stand out
# against the dark backdrop and read as scattered remains.
func _spawn_decor_ossuary(pos: Vector2) -> void:
	var bone := Polygon2D.new()
	var len_: float = randf_range(8.0, 16.0)
	var th: float = randf_range(2.0, 3.5)
	# Bone shape: two bulbous knobs at the ends + thin shaft. Mirrors
	# a femur silhouette in 6 verts.
	bone.polygon = PackedVector2Array([
		Vector2(-len_ - 2, -th - 1), Vector2(-len_ + th, -th * 0.6),
		Vector2(len_ - th, -th * 0.6), Vector2(len_ + 2, -th - 1),
		Vector2(len_ + 2, th + 1), Vector2(len_ - th, th * 0.6),
		Vector2(-len_ + th, th * 0.6), Vector2(-len_ - 2, th + 1),
	])
	bone.color = Color(
		randf_range(0.78, 0.92),
		randf_range(0.72, 0.85),
		randf_range(0.62, 0.74),
		randf_range(0.55, 0.75),
	)
	bone.position = pos
	bone.rotation = randf_range(0.0, TAU)
	bone.z_index = -1
	add_child(bone)

# Ember — small glowing red/orange pip. Two-layer composition: outer
# halo (low alpha, warm) + inner core (high alpha, bright). Adds a
# tiny PointLight2D for the rare "active ember" so a few decors
# actually cast light. The light is gated to ~20% of spawns so we
# don't fragment the lighting budget.
func _spawn_decor_ember(pos: Vector2) -> void:
	var halo := Polygon2D.new()
	var r: float = randf_range(7.0, 12.0)
	halo.polygon = PackedVector2Array([
		Vector2(r, 0), Vector2(r * 0.7, r * 0.7),
		Vector2(0, r), Vector2(-r * 0.7, r * 0.7),
		Vector2(-r, 0), Vector2(-r * 0.7, -r * 0.7),
		Vector2(0, -r), Vector2(r * 0.7, -r * 0.7),
	])
	halo.color = Color(0.85, 0.35, 0.15, randf_range(0.28, 0.45))
	halo.position = pos
	halo.rotation = randf_range(0.0, TAU)
	halo.z_index = -1
	add_child(halo)
	# Inner core — smaller bright pip.
	var core := Polygon2D.new()
	var cr: float = r * 0.42
	core.polygon = PackedVector2Array([
		Vector2(cr, 0), Vector2(cr * 0.7, cr * 0.7),
		Vector2(0, cr), Vector2(-cr * 0.7, cr * 0.7),
		Vector2(-cr, 0), Vector2(-cr * 0.7, -cr * 0.7),
		Vector2(0, -cr), Vector2(cr * 0.7, -cr * 0.7),
	])
	core.color = Color(1.0, 0.78, 0.40, randf_range(0.7, 0.9))
	core.position = pos
	core.z_index = -1
	add_child(core)
	# ~1-in-5 spawns get a tiny light so the room reads as "alive
	# with embers" without flooding every spawn with a light.
	if randf() < 0.20:
		var light := PointLight2D.new()
		light.energy = 0.5
		light.texture_scale = 0.6
		light.color = Color(1.0, 0.7, 0.35, 1.0)
		light.position = pos
		light.range_z_min = -1024
		light.range_z_max = 1024
		add_child(light)

# Sanctuary — faint blue rune marks. 8-vert star/glyph shape,
# pale-cyan low-alpha so the runes read as inscribed lines rather
# than glowing geometry. No light — sanctuary's mood is calm + cold.
func _spawn_decor_sanctuary(pos: Vector2) -> void:
	var rune := Polygon2D.new()
	var r: float = randf_range(7.0, 11.0)
	var ri: float = r * 0.42
	# 8-point star: outer point, inner point, outer point, …
	rune.polygon = PackedVector2Array([
		Vector2(r, 0), Vector2(ri * 0.7, ri * 0.7),
		Vector2(0, r), Vector2(-ri * 0.7, ri * 0.7),
		Vector2(-r, 0), Vector2(-ri * 0.7, -ri * 0.7),
		Vector2(0, -r), Vector2(ri * 0.7, -ri * 0.7),
	])
	rune.color = Color(
		randf_range(0.55, 0.72),
		randf_range(0.68, 0.85),
		randf_range(0.85, 1.0),
		randf_range(0.35, 0.55),
	)
	rune.position = pos
	rune.rotation = randf_range(0.0, TAU)
	rune.z_index = -1
	add_child(rune)
	# Subtle white-blue inner mark, smaller, brighter.
	var pip := Polygon2D.new()
	var pr: float = r * 0.28
	pip.polygon = PackedVector2Array([
		Vector2(pr, 0), Vector2(pr * 0.7, pr * 0.7),
		Vector2(0, pr), Vector2(-pr * 0.7, pr * 0.7),
		Vector2(-pr, 0), Vector2(-pr * 0.7, -pr * 0.7),
		Vector2(0, -pr), Vector2(pr * 0.7, -pr * 0.7),
	])
	pip.color = Color(0.85, 0.92, 1.0, 0.72)
	pip.position = pos
	pip.z_index = -1
	add_child(pip)

# Iter 34 — biome floor overlay + centerpiece. Called once per room
# load. The overlay is a single large Polygon2D covering the
# walkable area, tinted with the biome's wash color at very low
# alpha so it shifts the floor MOOD without overriding the static
# backdrop's pattern. Centerpiece accents are larger fixed-position
# props that establish the biome's identity at a glance.
# Iter 51 — screen-edge vignette. Frames the play area with a soft
# darkening at the corners + screen edges. Built as 4 Polygon2D wedges
# (top / bottom / left / right) with vertex-colored fades from dark
# (edge) to transparent (toward center). Polygon2D supports per-vertex
# colors out of the box; no shader needed.
#
# Lives on a CanvasLayer between the world and the UI so the HUD draws
# above it (vignette doesn't darken the hearts / wave label) but the
# world below gets the framing effect. Layer 30 = above world (0),
# below boss banner (40) + UI HUD (varies).
func _spawn_vignette_overlay() -> void:
	var layer: CanvasLayer = CanvasLayer.new()
	layer.layer = 30
	layer.name = "VignetteLayer"
	add_child(layer)
	# Screen extends — using the room/viewport area (1280x720). 4 wedge
	# polygons make a hollow frame: each is a quad with outer-corner
	# vertices dark and inner-corner vertices transparent.
	#
	# iter-116: Pre-iter-116 dark alpha was 0.45 over a 160 px reach.
	# Playtester read: "edges feel slightly dim but corners aren't
	# noticeably darker than mid-edges." Pushed alpha to 0.62 + added
	# 4 dedicated corner-darkening triangles so the corners are
	# distinctly deeper than the straight edges. The wedge thickness
	# stays at 160 px (any larger eats combat-readable play area).
	var dark: Color = Color(0, 0, 0, 0.62)
	var clear: Color = Color(0, 0, 0, 0.0)
	var w: float = 160.0
	# TOP wedge: outer edge along y=0, inner edge along y=w.
	var top: Polygon2D = Polygon2D.new()
	top.polygon = PackedVector2Array([
		Vector2(0, 0), Vector2(1280, 0), Vector2(1280, w), Vector2(0, w),
	])
	top.vertex_colors = PackedColorArray([dark, dark, clear, clear])
	top.z_index = 0
	layer.add_child(top)
	# BOTTOM wedge.
	var bot: Polygon2D = Polygon2D.new()
	bot.polygon = PackedVector2Array([
		Vector2(0, 720 - w), Vector2(1280, 720 - w), Vector2(1280, 720), Vector2(0, 720),
	])
	bot.vertex_colors = PackedColorArray([clear, clear, dark, dark])
	layer.add_child(bot)
	# LEFT wedge.
	var lf: Polygon2D = Polygon2D.new()
	lf.polygon = PackedVector2Array([
		Vector2(0, 0), Vector2(w, 0), Vector2(w, 720), Vector2(0, 720),
	])
	lf.vertex_colors = PackedColorArray([dark, clear, clear, dark])
	layer.add_child(lf)
	# RIGHT wedge.
	var rt: Polygon2D = Polygon2D.new()
	rt.polygon = PackedVector2Array([
		Vector2(1280 - w, 0), Vector2(1280, 0), Vector2(1280, 720), Vector2(1280 - w, 720),
	])
	rt.vertex_colors = PackedColorArray([clear, dark, dark, clear])
	layer.add_child(rt)
	# iter-116: 4 corner darkening triangles compounded on top of the
	# wedges. Each triangle has its corner vertex at 0.50 extra alpha so
	# corners read distinctly deeper than mid-walls. Corner reach 220 px
	# (larger than the 160 px wedge reach) so the darkness PROGRESSES
	# from "dim mid-edge" to "deep corner" smoothly as the eye scans.
	var corner_dark: Color = Color(0, 0, 0, 0.50)
	var cw: float = 220.0
	_add_vignette_corner(layer, Vector2(0, 0), Vector2(cw, cw), 0, corner_dark, clear)         # TL
	_add_vignette_corner(layer, Vector2(1280 - cw, 0), Vector2(1280, cw), 1, corner_dark, clear) # TR
	_add_vignette_corner(layer, Vector2(1280 - cw, 720 - cw), Vector2(1280, 720), 2, corner_dark, clear) # BR
	_add_vignette_corner(layer, Vector2(0, 720 - cw), Vector2(cw, 720), 3, corner_dark, clear)  # BL

# Helper for the iter-116 corner pieces. `corner_index` 0=TL, 1=TR, 2=BR,
# 3=BL — selects which vertex of the quad gets the dark color; the other
# three are clear. Single helper avoids the 16-line copy-paste a literal
# 4× quad block would need.
func _add_vignette_corner(layer: CanvasLayer, top_left: Vector2, bot_right: Vector2, corner_index: int, dark: Color, clear: Color) -> void:
	var p: Polygon2D = Polygon2D.new()
	p.polygon = PackedVector2Array([
		top_left,
		Vector2(bot_right.x, top_left.y),
		bot_right,
		Vector2(top_left.x, bot_right.y),
	])
	var colors := [clear, clear, clear, clear]
	colors[corner_index] = dark
	p.vertex_colors = PackedColorArray(colors)
	layer.add_child(p)

# iter-82 immersion pass: biome-specific ambient particle systems.
#
# The previous (iter-51) implementation was ONE generic mote emitter
# with only the tint varying per biome. All 4 biomes shared the same
# motion (slow upward drift), the same density (32 particles), and
# the same scale range — so the player's eye couldn't read crypt vs
# ember biome from the AIR alone. Tint alone wasn't enough.
#
# This rewrite gives each biome its own motion grammar + density +
# secondary accent emitter, so the AIR ITSELF tells you what biome
# you're in:
#
#   CRYPT       Pale grey dust drifting DOWNWARD slowly. Air feels
#               "settled" — old stone, stillness, dust falling from
#               cracks in the ceiling. Sparse (24 particles).
#   OSSUARY     Bone-pale motes drifting in lazy SWIRLS (high angular
#               velocity, low linear speed). "Pale spirits passing
#               through." Medium density (32).
#   EMBER       Orange-yellow sparks rising UPWARD with bigger scale
#               + secondary BIG-EMBER emitter (sparse, slow, brighter).
#               "Heat rising off the floor." High density (48 + 12).
#   SANCTUARY   Cool-blue rune motes drifting upward + outward with
#               slight rotation. Secondary GLYPH emitter for occasional
#               larger drifting runes. "Sacred air, magic ambient."
#               Medium density (28 + 8).
#
# All emitters at z_index = 5 (above floor/decor, below hero/enemies).
# Each is parented to main so they free with the scene on reload.
func _spawn_ambient_motes() -> void:
	var biome: String = _room.biome if _room != null else "crypt"
	# Build the primary mote emitter — biome-specific parameters.
	var primary: CPUParticles2D = _build_ambient_mote_primary(biome)
	add_child(primary)
	# Some biomes get a SECOND emitter for distinctive accents that the
	# base motes can't carry alone (rising embers, drifting runes).
	# Returning null = no secondary for this biome.
	var accent: CPUParticles2D = _build_ambient_mote_accent(biome)
	if accent != null:
		add_child(accent)

# Per-biome primary mote emitter. Different motion / density / scale
# per biome so the AIR alone reads biome identity.
func _build_ambient_mote_primary(biome: String) -> CPUParticles2D:
	var motes: CPUParticles2D = CPUParticles2D.new()
	motes.name = "AmbientMotes"
	motes.emitting = true
	motes.preprocess = 3.0
	motes.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
	motes.emission_rect_extents = Vector2(560.0, 290.0)
	motes.position = Vector2(640, 384)
	motes.gravity = Vector2.ZERO
	motes.z_index = 5
	var tint: Color
	match biome:
		"crypt":
			# Pale dust falling slowly. Air feels still — gravity does
			# the work, no horizontal drift.
			motes.amount = 24
			motes.lifetime = 7.0
			motes.direction = Vector2(0, 1)     # DOWNWARD (was always up)
			motes.spread = 35.0
			motes.initial_velocity_min = 4.0
			motes.initial_velocity_max = 10.0
			motes.damping_min = 0.4
			motes.damping_max = 0.9
			motes.scale_amount_min = 0.5
			motes.scale_amount_max = 1.0
			motes.angular_velocity_min = -8.0
			motes.angular_velocity_max = 8.0
			tint = Color(0.78, 0.76, 0.74, 0.20)
		"ossuary":
			# Bone-pale motes in LAZY SWIRLS — high angular velocity, low
			# linear speed, so each mote orbits/drifts rather than streaks.
			motes.amount = 32
			motes.lifetime = 8.0
			motes.direction = Vector2(0, -1)
			motes.spread = 180.0                # full circle — random direction
			motes.initial_velocity_min = 3.0
			motes.initial_velocity_max = 9.0
			motes.tangential_accel_min = -18.0  # tangential = lazy curve
			motes.tangential_accel_max = 18.0
			motes.angular_velocity_min = -40.0
			motes.angular_velocity_max = 40.0
			motes.damping_min = 0.2
			motes.damping_max = 0.5
			motes.scale_amount_min = 0.6
			motes.scale_amount_max = 1.3
			tint = Color(0.96, 0.93, 0.80, 0.22)
		"ember":
			# Sparks RISING upward — denser, slightly faster, bigger scale
			# variance so the eye reads "things floating up off the heat."
			motes.amount = 48
			motes.lifetime = 5.0
			motes.direction = Vector2(0, -1)
			motes.spread = 25.0
			motes.initial_velocity_min = 14.0
			motes.initial_velocity_max = 32.0
			motes.gravity = Vector2(0, -12.0)   # negative gravity = rising acceleration
			motes.damping_min = 0.1
			motes.damping_max = 0.4
			motes.scale_amount_min = 0.7
			motes.scale_amount_max = 1.8
			tint = Color(1.0, 0.65, 0.32, 0.26)
		"sanctuary":
			# Cool-blue runes drifting upward + outward with slow rotation.
			motes.amount = 28
			motes.lifetime = 7.5
			motes.direction = Vector2(0, -1)
			motes.spread = 75.0
			motes.initial_velocity_min = 5.0
			motes.initial_velocity_max = 12.0
			motes.tangential_accel_min = -6.0
			motes.tangential_accel_max = 6.0
			motes.angular_velocity_min = -20.0
			motes.angular_velocity_max = 20.0
			motes.damping_min = 0.3
			motes.damping_max = 0.6
			motes.scale_amount_min = 0.6
			motes.scale_amount_max = 1.4
			tint = Color(0.72, 0.82, 1.0, 0.24)
		_:
			# Unknown biome — fall back to the iter-51 generic mote.
			motes.amount = 32
			motes.lifetime = 6.0
			motes.direction = Vector2(0, -1)
			motes.spread = 60.0
			motes.initial_velocity_min = 6.0
			motes.initial_velocity_max = 14.0
			motes.damping_min = 0.2
			motes.damping_max = 0.6
			motes.scale_amount_min = 0.6
			motes.scale_amount_max = 1.4
			tint = Color(0.85, 0.85, 0.85, 0.22)
	# Common color ramp pattern — fades in/out so motes appear from
	# nothing + vanish before the scale-cap reads "particle dying."
	var ramp: Gradient = Gradient.new()
	ramp.offsets = PackedFloat32Array([0.0, 0.18, 0.82, 1.0])
	ramp.colors = PackedColorArray([
		Color(tint.r, tint.g, tint.b, 0.0),
		tint,
		tint,
		Color(tint.r, tint.g, tint.b, 0.0),
	])
	motes.color_ramp = ramp
	return motes

# Per-biome accent emitter — adds a second visual layer for distinctive
# biomes that need more than just primary motes to read. Returns null
# for biomes where the primary alone is enough (crypt, ossuary).
func _build_ambient_mote_accent(biome: String) -> CPUParticles2D:
	match biome:
		"ember":
			# Big slow rising embers — fewer, larger, brighter than the
			# primary spark layer. Reads as "the floor itself is giving
			# off heat-flecks" rather than the dense spark shower.
			var p: CPUParticles2D = CPUParticles2D.new()
			p.name = "AmbientMotesAccent"
			p.emitting = true
			p.preprocess = 4.0
			p.amount = 12
			p.lifetime = 8.0
			p.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
			p.emission_rect_extents = Vector2(540.0, 280.0)
			p.position = Vector2(640, 384)
			p.direction = Vector2(0, -1)
			p.spread = 12.0
			p.initial_velocity_min = 6.0
			p.initial_velocity_max = 14.0
			p.gravity = Vector2(0, -4.0)
			p.scale_amount_min = 1.6
			p.scale_amount_max = 3.0
			p.angular_velocity_min = -12.0
			p.angular_velocity_max = 12.0
			p.z_index = 5
			var tint: Color = Color(1.0, 0.50, 0.20, 0.34)
			var ramp: Gradient = Gradient.new()
			ramp.offsets = PackedFloat32Array([0.0, 0.15, 0.7, 1.0])
			ramp.colors = PackedColorArray([
				Color(tint.r, tint.g, tint.b, 0.0),
				tint,
				Color(tint.r * 0.9, tint.g * 0.5, tint.b * 0.4, tint.a * 0.7),
				Color(tint.r * 0.7, tint.g * 0.3, tint.b * 0.2, 0.0),
			])
			p.color_ramp = ramp
			return p
		"sanctuary":
			# Drifting larger rune-flecks — slower, more visible, with
			# rotation so they read as "glyph fragments floating in
			# magic air."
			var p: CPUParticles2D = CPUParticles2D.new()
			p.name = "AmbientMotesAccent"
			p.emitting = true
			p.preprocess = 4.0
			p.amount = 8
			p.lifetime = 9.0
			p.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
			p.emission_rect_extents = Vector2(540.0, 280.0)
			p.position = Vector2(640, 384)
			p.direction = Vector2(0, -1)
			p.spread = 100.0
			p.initial_velocity_min = 4.0
			p.initial_velocity_max = 9.0
			p.tangential_accel_min = -5.0
			p.tangential_accel_max = 5.0
			p.angular_velocity_min = -45.0
			p.angular_velocity_max = 45.0
			p.scale_amount_min = 1.4
			p.scale_amount_max = 2.4
			p.z_index = 5
			var tint: Color = Color(0.55, 0.78, 1.0, 0.35)
			var ramp: Gradient = Gradient.new()
			ramp.offsets = PackedFloat32Array([0.0, 0.2, 0.8, 1.0])
			ramp.colors = PackedColorArray([
				Color(tint.r, tint.g, tint.b, 0.0),
				tint,
				tint,
				Color(tint.r, tint.g, tint.b, 0.0),
			])
			p.color_ramp = ramp
			return p
		_:
			return null

func _apply_biome_visuals(biome: String) -> void:
	var wash: Color = Color(0, 0, 0, 0)
	match biome:
		"ossuary":
			wash = Color(0.35, 0.32, 0.22, 0.18)
		"ember":
			wash = Color(0.45, 0.18, 0.10, 0.22)
		"sanctuary":
			wash = Color(0.20, 0.28, 0.45, 0.22)
		"crypt":
			wash = Color(0.12, 0.10, 0.16, 0.15)
		_:
			wash = Color(0, 0, 0, 0)
	if wash.a > 0.0:
		var overlay: Polygon2D = Polygon2D.new()
		# Cover the play area (160..1120 x 130..640) — wider than the
		# strict walkable bounds so the wash bleeds out under walls
		# and torches rather than ending in a hard edge.
		overlay.polygon = PackedVector2Array([
			Vector2(140, 110), Vector2(1140, 110),
			Vector2(1140, 660), Vector2(140, 660),
		])
		overlay.color = wash
		overlay.z_index = -2
		add_child(overlay)
	_spawn_biome_centerpieces(biome)

# Iter 34 — biome centerpieces. Large authored accents that anchor
# the biome's identity (a big rune circle for sanctuary, an ash pool
# for ember, a bone pile for ossuary). Two accents per room at
# corners that read clearly without crowding the combat space.
func _spawn_biome_centerpieces(biome: String) -> void:
	# Fixed corners (slightly inset from the playable bounds) so the
	# centerpieces are visible but don't block combat lanes.
	var positions: Array[Vector2] = [
		Vector2(220, 200), Vector2(1060, 560),
	]
	for pos in positions:
		match biome:
			"ossuary":
				_spawn_centerpiece_bone_pile(pos)
			"ember":
				_spawn_centerpiece_ash_pool(pos)
			"sanctuary":
				_spawn_centerpiece_rune_circle(pos)
			"crypt":
				_spawn_centerpiece_crack(pos)
			_:
				pass

func _spawn_centerpiece_crack(pos: Vector2) -> void:
	# Long jagged crack across the floor. Single Line2D, 5 vertices,
	# dark grey, semi-transparent. Reads as "structural damage."
	var crack := Line2D.new()
	var jitter: float = 6.0
	crack.points = PackedVector2Array([
		Vector2(-40, randf_range(-jitter, jitter)),
		Vector2(-15, randf_range(-jitter, jitter) - 4),
		Vector2(8, randf_range(-jitter, jitter) + 2),
		Vector2(28, randf_range(-jitter, jitter) - 2),
		Vector2(48, randf_range(-jitter, jitter)),
	])
	crack.width = 2.5
	crack.default_color = Color(0.06, 0.05, 0.09, 0.85)
	crack.antialiased = true
	crack.position = pos
	crack.rotation = randf_range(0.0, TAU)
	crack.z_index = -1
	add_child(crack)

func _spawn_centerpiece_bone_pile(pos: Vector2) -> void:
	# Small pile of 4-6 overlapping bones at one position. Distinctly
	# more "concentrated" than the scattered single-bone decor — reads
	# as a real ossuary heap.
	for i in range(5):
		var off: Vector2 = Vector2(randf_range(-18, 18), randf_range(-10, 10))
		_spawn_decor_ossuary(pos + off)

func _spawn_centerpiece_ash_pool(pos: Vector2) -> void:
	# Large dark ash patch with a few glowing embers on top.
	var pool := Polygon2D.new()
	pool.polygon = PackedVector2Array([
		Vector2(28, 0), Vector2(22, 16), Vector2(8, 26),
		Vector2(-8, 26), Vector2(-22, 16), Vector2(-28, 0),
		Vector2(-22, -16), Vector2(-8, -26),
		Vector2(8, -26), Vector2(22, -16),
	])
	pool.color = Color(0.10, 0.06, 0.04, 0.85)
	pool.position = pos
	pool.z_index = -1
	add_child(pool)
	# 3 ember pips on top of the ash.
	for i in range(3):
		var off: Vector2 = Vector2(randf_range(-14, 14), randf_range(-12, 12))
		_spawn_decor_ember(pos + off)

func _spawn_centerpiece_rune_circle(pos: Vector2) -> void:
	# Larger circle of small rune marks arranged around a perimeter.
	# 6 runes evenly spaced + 1 center rune. Reads as "ritual ground."
	for i in range(6):
		var ang: float = (TAU / 6.0) * i
		var off: Vector2 = Vector2(cos(ang) * 22.0, sin(ang) * 22.0)
		_spawn_decor_sanctuary(pos + off)
	# Center rune slightly larger via being two stacked.
	_spawn_decor_sanctuary(pos)

# iter-124 — Transient room banner. Pre-iter-124 the room_label faded
# from full-attention down to 0.75 alpha but stayed VISIBLE permanently,
# pulling attention from combat. Genre peers (Hades, Dead Cells, Skyrim,
# Diablo, Hyper Light Drifter, Risk of Rain 2, Enter the Gungeon) all
# show location names as transient on-enter banners and never permanently.
# Iter-124 matches that pattern:
#
#   Phase 1 (0.0 → 0.30s): fade in from 0 alpha to 1.0, scale 1.7 → 1.0
#   Phase 2 (0.30 → 1.80s): hold at scale 1.0, alpha 1.0 (~1.5s readable)
#   Phase 3 (1.80 → 3.00s): fade out alpha 1.0 → 0 over 1.2s
#   After 3.0s: room_label is invisible until the next room load.
#
# _update_room_label still writes the text (so the banner shows the
# right thing on entry); the modulate alpha controls visibility.
const ROOM_BANNER_FADE_IN: float = 0.30
const ROOM_BANNER_HOLD: float = 1.50
const ROOM_BANNER_FADE_OUT: float = 1.20
const ROOM_BANNER_START_SCALE: float = 1.7
const ROOM_BANNER_END_SCALE: float = 1.0

func _animate_room_entry() -> void:
	if room_label == null:
		return
	room_label.pivot_offset = room_label.size / 2.0
	room_label.scale = Vector2(ROOM_BANNER_START_SCALE, ROOM_BANNER_START_SCALE)
	room_label.modulate = Color(1, 1, 1, 0.0)
	# Phase 1: fade IN + scale down to rest. Parallel tween so both
	# happen simultaneously.
	var tw_in: Tween = create_tween().set_parallel(true)
	tw_in.tween_property(room_label, "scale",
		Vector2(ROOM_BANNER_END_SCALE, ROOM_BANNER_END_SCALE),
		ROOM_BANNER_FADE_IN
	).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw_in.tween_property(room_label, "modulate:a", 1.0,
		ROOM_BANNER_FADE_IN
	).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	# Phase 2 + 3: hold, then fade out. Sequential timeline starts at
	# t=0 alongside the in-tween; the interval covers the in + hold
	# windows before the out-tween kicks.
	var tw_out: Tween = create_tween()
	tw_out.tween_interval(ROOM_BANNER_FADE_IN + ROOM_BANNER_HOLD)
	tw_out.tween_property(room_label, "modulate:a", 0.0,
		ROOM_BANNER_FADE_OUT
	).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)

func _start_wave(idx: int) -> void:
	if not _alive or idx >= _waves.size():
		return
	_wave_index = idx
	_wave_state = WaveState.ACTIVE
	wave_label.text = "WAVE %d / %d" % [idx + 1, _waves.size()]
	# Iter 22 — center-screen wave banner. Punctuation between rounds;
	# the corner wave_label stays as the persistent readout.
	_show_wave_banner(idx + 1, _waves.size())
	# Iter 35 — fire any wave_events keyed to this wave index. Runs
	# BEFORE the enemy spawn timers so a "raise_wall" event finishes
	# its 0.6s animation before enemies arrive (modifies cover layout
	# without trapping spawning enemies inside a wall).
	_handle_wave_events(idx)
	# Iter 15 — flatten the wave composition, shuffle so the same type
	# doesn't always lead the parade, then dispatch spawns on a stagger.
	# _pending_spawns tracks the queue so _process's wave-clear check
	# can wait for it to drain (timers fire after first kills otherwise).
	var spawn_queue: Array[String] = []
	for pair in _waves[idx]:
		var type_id: String = pair[0]
		var count: int = pair[1]
		for i in range(count):
			spawn_queue.append(type_id)
	spawn_queue.shuffle()
	_pending_spawns = spawn_queue.size()
	# iter-79: removed wave-portal pool. Each enemy now spawns directly
	# at a random _spawn_point via _spawn_enemy_type (the iter-15 baseline
	# behavior). The portal system that lived here in iters 75-78 has been
	# deleted — see the comment block above _spawn_enemy_type.
	for i in range(spawn_queue.size()):
		# Small jitter on top of the base stagger so the rhythm doesn't
		# feel metronomic. Tween-friendly Bind so each closure captures
		# its own type_id (vs all closures seeing the last one).
		var delay: float = i * SPAWN_STAGGER + randf_range(0.0, 0.08)
		var t: SceneTreeTimer = get_tree().create_timer(delay)
		var captured: String = spawn_queue[i]
		t.timeout.connect(func (): _spawn_enemy_type(captured))

# iter-79: _open_wave_portals / _spawn_wave_enemy / _close_active_wave_portals
# / _is_portal_position_valid all REMOVED. See top-of-file comment above
# SPAWN_PORTAL_SCENE — the JS reference doesn't have a portal system and
# four iterations of patching ours never landed right. Enemies now spawn
# via _spawn_enemy_type directly. _gather_hazard_positions kept as a
# generally-useful helper (used by other features that need to know where
# hazards are).

# iter-75 followup: gather every authored hazard position in the room.
# RoomConfig keeps hazard positions in two separate arrays for legacy
# reasons:
#   hazard_positions  — Array[Vector2]   (iter-30 layout; spike_pit by default)
#   hazards           — Array[Dictionary] of {kind, position, [phase], ...}
#                       (iter-31 typed hazards: fire_jet, lightning_rod, etc.)
# We union both into a single Vector2 list.
func _gather_hazard_positions() -> Array[Vector2]:
	var result: Array[Vector2] = []
	if _room == null:
		return result
	for hp in _room.hazard_positions:
		result.append(hp)
	for h in _room.hazards:
		if h is Dictionary and h.has("position"):
			var p = h["position"]
			if p is Vector2:
				result.append(p)
	return result


# Iter 35 — wave-event dispatcher. Iterates _room.wave_events, filters
# to entries matching `wave_idx`, dispatches each by `kind`. Unknown
# kinds emit a one-time warning + no-op so a misconfigured event can't
# crash the run.
func _handle_wave_events(wave_idx: int) -> void:
	if _room == null:
		return
	for entry in _room.wave_events:
		var w = entry.get("wave", -1)
		if int(w) != wave_idx:
			continue
		var kind: String = str(entry.get("kind", ""))
		match kind:
			"activate_hazard":
				_event_activate_hazard(entry)
			"raise_wall":
				_event_raise_wall(entry)
			"dim_lights":
				_event_dim_lights(entry)
			"announce":
				_event_announce(entry)
			_:
				push_warning("main.gd: unknown wave_event kind '%s'" % kind)

# Spawn a hazard mid-fight with a brief scale-in tween so the player
# sees it materialize (vs popping into place). Reuses HAZARD_SCENES
# from iter 31 so any kind authored there is available as an event.
func _event_activate_hazard(entry: Dictionary) -> void:
	var hk: String = str(entry.get("hazard_kind", ""))
	var scene: PackedScene = HAZARD_SCENES.get(hk)
	if scene == null:
		push_warning("main.gd: activate_hazard unknown kind '%s'" % hk)
		return
	var pos: Vector2 = entry.get("position", Vector2.ZERO) as Vector2
	var h: Node2D = scene.instantiate() as Node2D
	h.position = pos
	if entry.has("phase") and ("phase" in h):
		h.set("phase", entry.get("phase", 0.0))
	if entry.has("interval") and ("interval" in h):
		h.set("interval", entry.get("interval", 3.0))
	# Tween-in: start at scale 0, grow to 1 over 0.35s with ease-out.
	# Modulate alpha matches so the materialization reads as a fade-in
	# rather than just an instant pop.
	h.scale = Vector2(0.0, 0.0)
	h.modulate.a = 0.0
	add_child(h)
	var tween: Tween = create_tween().set_parallel(true)
	tween.tween_property(h, "scale", Vector2(1.0, 1.0), 0.35).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.tween_property(h, "modulate:a", 1.0, 0.25)

# Raise a wall from below floor over 0.6s. The wall is BUILT in its
# final position via _build_interior_wall, then offset down 80px,
# then tweened back to 0. Collision is live the whole time — there's
# a brief moment where the player can be physically pushed by the
# rising wall, but the tween is fast enough that this reads as
# "ground emerging" not "lag glitch."
func _event_raise_wall(entry: Dictionary) -> void:
	if not entry.has("rect"):
		push_warning("main.gd: raise_wall missing 'rect'")
		return
	var r: Rect2 = entry.get("rect") as Rect2
	var body: StaticBody2D = _build_interior_wall(r)
	var final_y: float = body.position.y
	body.position.y = final_y + 80.0  # start below floor
	body.modulate.a = 0.0
	add_child(body)
	var tween: Tween = create_tween().set_parallel(true)
	tween.tween_property(body, "position:y", final_y, 0.6).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.tween_property(body, "modulate:a", 1.0, 0.4)

# Dim torches by tweening every torch's PointLight2D energy by the
# given multiplier. Used for boss-room atmospheric drama. The dim is
# permanent for the room — there's no "restore lights" event yet, so
# author it as a one-way escalation.
func _event_dim_lights(entry: Dictionary) -> void:
	var mul: float = float(entry.get("energy_mul", 0.4))
	mul = clampf(mul, 0.0, 1.0)
	# Torches flicker their PointLight2D.energy every frame in
	# torch.gd._process, so a tween targeting light.energy is clobbered.
	# Instead we tween the torch's own energy_mul field; _process picks
	# it up via a final * energy_mul scaling.
	for torch in get_tree().get_nodes_in_group("torches"):
		if not is_instance_valid(torch):
			continue
		if not ("energy_mul" in torch):
			continue
		var tween: Tween = create_tween()
		tween.tween_property(torch, "energy_mul", mul, 0.9).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)

# Show a brief escalation banner on status_label. Pairs naturally
# with activate_hazard / raise_wall events to telegraph the change
# ("the floor shifts", "embers awaken", etc).
func _event_announce(entry: Dictionary) -> void:
	var text: String = str(entry.get("text", ""))
	if text == "":
		return
	status_label.text = text

func _on_wave_cleared() -> void:
	_wave_state = WaveState.CLEAR
	# iter-79: portal close-call removed along with the portal system.
	if _wave_index + 1 < _waves.size():
		wave_label.text = "WAVE %d CLEAR  ·  next in %.1fs" % [_wave_index + 1, WAVE_CLEAR_PAUSE]
		# iter-144: mid-wave clear payoff. Without this beat, surviving a
		# wave reads as just a text-update — the player has no visible
		# acknowledgment that they accomplished something. Genre peers
		# (Hades' "well-fought" stinger, Isaac's wave-clear pop) layer a
		# tiny celebration here so the moment lands.
		#
		# Three lightweight cues, all comfortably under the 0.9s
		# WAVE_CLEAR_PAUSE so they finish before the next wave spawns:
		#   • wave_label scale + gold-cream pulse (0.45s)
		#   • Brief camera shake (1.8 amp / 0.08s — quieter than a kill
		#     shake at 6.0 / 0.12, louder than nothing)
		#   • Small gold spark at the hero position (HIT_SPARK_SCENE
		#     reuse — same gold semantic as iter-143's pickup spark
		#     fallback)
		# The final-wave clear (else branch below) already gets the
		# FloorClearBurst loud celebration — no need to double-up.
		_pulse_label(wave_label, "_wave_label_pulse_tween", 1.20, KILLS_FLASH_MODULATE, 0.45)
		FX.shake(1.8, 0.08)
		if is_instance_valid(hero):
			var spark_pos: Vector2 = hero.global_position + Vector2(0, -10)
			var spark: Node2D = FX.HIT_SPARK_SCENE.instantiate() as Node2D
			if spark != null:
				spark.global_position = spark_pos
				add_child(spark)
		var t := get_tree().create_timer(WAVE_CLEAR_PAUSE)
		t.timeout.connect(func (): _start_wave(_wave_index + 1))
	else:
		_wave_state = WaveState.COMPLETE
		wave_label.text = "ROOM CLEAR"
		# Iter 16 — Hades-style chamber reward. Small heal + a 3-relic
		# choice spawn EVERY room (not just the last). The room only
		# becomes "done" once a pedestal is claimed; until then the
		# door / run-complete is gated behind the pickup.
		_heal_on_room_clear()
		# Iter 71 — celebration burst. Two flavors:
		#   BIG (variant B): floor-end (_room.is_last_room) OR any wave
		#     in this room had an is_boss=true enemy type. Gold cascade
		#     from screen top + 56px "FLOOR CLEAR" banner + radial wash.
		#     ~3s — pure visual celebration; game continues underneath.
		#   SMALL (variant A): every other combat clear. Subtle gold
		#     sparkle + small "ROOM CLEAR" label, ~1.5s. Doesn't gate
		#     progression — player can run through the door immediately.
		# The burst is on its own CanvasLayer (layer=45, above the wave
		# banner at 40, below death veil at 50) so it never fights the
		# iter-18 entry banner (which only fires on _ready of a new
		# room) or the iter-22 wave banner (different lifecycle).
		var is_big: bool = false
		if _room != null and _room.is_last_room:
			is_big = true
		elif _room != null and _room_had_boss():
			is_big = true
		FloorClearBurst.spawn(self, is_big)
		# Iter 178 — shorter status copy + a soft floor-darkening vignette
		# while the offer is up. Pre-iter-178 the long instructional
		# string ("Choose a relic · walk near and press [E]") competed
		# with the pedestals themselves for the player's attention; the
		# [E] CLAIM prompt on each pedestal already teaches the action.
		# The vignette suppresses random floor decor noise so the eye
		# goes to the reward row, not the rubble.
		status_label.text = "Choose one relic"
		_spawn_offer_vignette()
		_spawn_pedestal_offer(3)

# Iter 71 — scan the active room's wave compositions for any enemy type
# flagged is_boss=true. Used by _on_wave_cleared to pick the BIG vs
# SMALL clear-burst flavor. Reads _room.waves (live config, not the
# RoomConfig template — these are post-jitter / post-pool-pick) and
# resolves each [type_id, count] pair against ENEMY_TYPES.
# Returns true if ANY wave in the room contained a boss; false otherwise.
func _room_had_boss() -> bool:
	if _room == null:
		return false
	for wave in _waves:
		for pair in wave:
			if pair == null or pair.size() < 1:
				continue
			var type_id: String = str(pair[0])
			var et: EnemyType = ENEMY_TYPES.get(type_id)
			if et != null and et.is_boss:
				return true
	return false

# Iter 55 — handle a boss summon request. Spawns the requested enemy
# type at the given position. Mirrors _spawn_enemy_type but skips the
# wave-runner _pending_spawns counter (summons aren't part of a wave;
# they're mid-wave reinforcements that wave-clear should NOT wait for).
# Wait — actually wave-clear DOES need to wait for them: a boss room
# is "cleared" when the boss dies + any remaining enemies are gone.
# Solution: increment _pending_spawns BEFORE spawn so the running
# wave-clear poll sees them as pending — the post-add decrement
# in _spawn_enemy_type's path already balances, but here we manage
# it inline. Actually simpler: just add to "enemies" group and let
# the wave-clear poll (which counts live enemies) handle it.
func _on_enemy_summon_requested(world_pos: Vector2, type_id: String) -> void:
	if not _alive:
		return
	if not ENEMY_TYPES.has(type_id):
		push_warning("main.gd: enemy_summon_requested unknown type '%s'" % type_id)
		return
	var type_res: EnemyType = ENEMY_TYPES.get(type_id)
	var enemy: Enemy = ENEMY_SCENE.instantiate()
	enemy.enemy_type = type_res
	enemy.global_position = world_pos
	enemy.died_at.connect(_on_enemy_died)
	add_child(enemy)

func _spawn_enemy_type(type_id: String) -> void:
	# Iter 15: drain the pending counter regardless of whether we
	# actually spawn — a dead player or empty spawn_points still
	# needs the counter to decrement so the wave-clear check unblocks.
	_pending_spawns = maxi(0, _pending_spawns - 1)
	if not _alive or _spawn_points.is_empty():
		return
	# Resolve EnemyType for this id; fall back to slime if missing
	# (typo'd a wave entry, or a room references an enemy that hasn't
	# landed yet). The resolved type is assigned to the spawned node
	# BEFORE add_child so enemy.gd's _ready can see it.
	var type_res: EnemyType = ENEMY_TYPES.get(type_id, ENEMY_TYPES["slime"])
	var enemy: Enemy = ENEMY_SCENE.instantiate()
	enemy.enemy_type = type_res
	# iter-79: simplified back to random-spawn-point pick (iter-15 baseline).
	# The portal override system that lived here in iters 75-78 is gone.
	enemy.global_position = _spawn_points[randi() % _spawn_points.size()]
	enemy.died_at.connect(_on_enemy_died)
	# iter-103: elite affix roll. Floor 2+, non-boss enemies have a 22%
	# chance to roll one of 4 affixes (frost / ember / venom / warded).
	# Set BEFORE add_child so _ready picks it up for the baseline tint.
	# Bosses skip — they have their own phase mechanics + scaling.
	_maybe_apply_elite_affix(enemy, type_res)
	add_child(enemy)
	# Iter 17 — boss spawn hook. The type's is_boss flag drives the HP
	# bar UI. We bind via reference + _process polling rather than
	# adding an hp_changed signal to every enemy (the bar only needs
	# updates for one enemy in the whole scene).
	if type_res != null and type_res.is_boss:
		_boss_ref = enemy
		boss_name.text = type_res.display_name.to_upper()
		boss_hp_bar.max_value = float(type_res.max_hp)
		boss_hp_bar.value = float(type_res.max_hp)
		boss_bar.visible = true
		# Iter 157 — arm the pulse tracker with the boss's full HP so
		# the first damage tick reads as a decrement (vs the 0-baseline
		# we'd otherwise compare against, which would fire a false
		# pulse on the first frame).
		_prev_boss_hp = type_res.max_hp
		# Iter 37 — wire the phase-changed signal for boss escalation.
		# Connects ONLY for bosses (the signal exists on every Enemy but
		# we don't need cinematic feedback when, say, a regular elite
		# spider crosses 50% HP — that's just plinking). Bind to a
		# closure that captures the enemy ref so the banner can show
		# the boss's display name.
		# Iter 55 — same closure now handles phase 2 AND phase 3 via the
		# `phase` int parameter — _on_boss_phase_changed dispatches.
		var boss_name_str: String = type_res.display_name.to_upper()
		enemy.phase_changed.connect(func (phase: int): _on_boss_phase_changed(phase, boss_name_str))
		# Iter 22 — boss intro punctuation. Heavy camera shake + brief
		# red screen wash to mark the moment a boss enters. The shake
		# is bigger than the dash-strike connect (10 amp) so the player
		# can tell "this is something serious." ScreenFlash autoload
		# handles the wash if it exists; FX autoload handles the shake.
		if Engine.has_singleton("FX") or true:   # FX is always available; autoload
			FX.shake(BOSS_INTRO_SHAKE_AMP, BOSS_INTRO_SHAKE_TIME)
		_show_boss_intro_banner(type_res.display_name)
		# Wizard-kit sprint 3 — cinematic boss-arrival NAME CARD on top
		# of the iter-22 red banner. Letterboxed + letterspaced cream-gold
		# typography + optional role subtitle, ~2.3s total. Layered at
		# CanvasLayer 48 so it reads as the moment's headline beat (above
		# iter-71's floor_clear_burst at 45 and the iter-22 banner at 40,
		# below the iter-22 death veil at 50). Self-frees on tween-finish;
		# matches PickupBanner.spawn / FloorClearBurst.spawn convention.
		BossIntro.spawn(self, type_res.display_name)

# Iter 16 — Hades-style 3-pedestal choice (or fewer if the registry
# is running low). Pedestals spawn in a row centered on the room and
# join the "pedestal_offer" group; claiming one dismisses the others
# via pedestal.gd's _claim sibling-sweep. If the player has already
# picked the entire registry, we skip pedestals entirely and resolve
# straight to the door (otherwise we'd offer phantom claims).
# Iter 21 — tier weights per room. Earlier rooms favor commons; later
# rooms bias toward legendaries so the player feels progress with each
# clear. Each slot in the 3-pedestal offer rolls independently against
# these weights, then a relic of that tier is drawn (without
# replacement within the offer). Falls back to other tiers cleanly if
# the rolled tier has no unowned relics left.
const TIER_WEIGHTS_BY_ROOM := [
	# Iter 50 — mythic tier added. 4th rarity, run-defining effects.
	# Floor 1 (rooms 1-3): zero mythic chance — first floor is the
	#   "learn the basics" act. Mythics would trivialize it.
	# Floor 2 (rooms 4-6): mythic appears with small (1-6%) chance,
	#   gated behind owning at least one rare/legendary so a fresh
	#   build doesn't get a 1% mythic on room 4 that breaks the
	#   ramp curve. The roll itself respects available relics so
	#   small contribution + small pool = rare event in practice.
	{ "common": 75.0, "rare": 22.0, "legendary":  3.0, "mythic":  0.0 },   # room 1
	{ "common": 45.0, "rare": 45.0, "legendary": 10.0, "mythic":  0.0 },   # room 2
	{ "common": 20.0, "rare": 45.0, "legendary": 35.0, "mythic":  0.0 },   # room 3 (boss)
	{ "common": 50.0, "rare": 30.0, "legendary": 18.0, "mythic":  2.0 },   # room 4
	{ "common": 35.0, "rare": 40.0, "legendary": 22.0, "mythic":  3.0 },   # room 5
	{ "common": 15.0, "rare": 35.0, "legendary": 44.0, "mythic":  6.0 },   # room 6 (boss)
]

# iter-103 — elite affix roll. Called from _spawn_enemy_type for every
# wave-spawned enemy. Rooms 2+ get a 22% chance to roll one of four
# affixes (frost / ember / venom / warded). Room 1 stays affix-free
# so new players aren't ambushed by status-effect surprises before
# they've internalized the basic combat loop.
#
# RunState exposes current_room_index 0..N within a floor (the game
# is currently single-floor with multiple rooms). Gate at index ≥ 1
# so the first room of every run is affix-free.
#
# Skipped for bosses (their phase escalation IS their elite identity).
#
# Affix distribution: uniform across the 4 — no weighting. Tunable
# via ELITE_AFFIX_BASE_CHANCE if late-game rooms need different rates.
const ELITE_AFFIX_BASE_CHANCE: float = 0.22
const ELITE_AFFIX_OPTIONS: Array[String] = ["frost", "ember", "venom", "warded"]
const ELITE_AFFIX_MIN_ROOM_INDEX: int = 1

func _maybe_apply_elite_affix(enemy: Enemy, type_res: EnemyType) -> void:
	if enemy == null or type_res == null:
		return
	# Skip bosses — their phase escalation IS their elite identity.
	if type_res.is_boss:
		return
	# Room gate — affixes start in room 2 onward.
	var room_idx: int = 0
	if RunState != null and "current_room_index" in RunState:
		room_idx = int(RunState.current_room_index)
	if room_idx < ELITE_AFFIX_MIN_ROOM_INDEX:
		return
	if randf() > ELITE_AFFIX_BASE_CHANCE:
		return
	enemy.elite_affix = ELITE_AFFIX_OPTIONS[randi() % ELITE_AFFIX_OPTIONS.size()]

# Iter 33 — TREASURE ROOM entry. Skips the wave runner entirely.
# Spawns a 3-pedestal offer immediately, with by_tier biased to
# legendary-only (falls through to rare → common only if every
# legendary is owned). The trade vs combat is: NO relic offer at the
# room you'd have fought = no choice between 3 tiers, BUT what you
# DO get is locked at high tier. Net = skip combat, guarantee elite.
func _enter_treasure_room() -> void:
	status_label.text = "TREASURE VAULT · Claim your prize"
	wave_label.text = "[ TREASURE ROOM ]"
	_wave_state = WaveState.COMPLETE   # so _process doesn't enter the
									   # wave-clear branch + double-spawn
	# Lean on the existing "treasure" branch-modifier path inside
	# _spawn_pedestal_offer: it pins by_tier to legendary-only.
	_branch_modifier = "treasure"
	# Short delay so the player sees they entered the room before
	# pedestals materialize. Matches INITIAL_WAVE_DELAY's pacing.
	var t: SceneTreeTimer = get_tree().create_timer(0.65)
	t.timeout.connect(func (): _spawn_pedestal_offer(3))

# Iter 33 — SHRINE ROOM entry. Skips waves; spawns 3 Shrine nodes at
# shrine_positions (or a 3-slot fallback if positions empty). Each
# shrine grants ONE permanent stat boost on first pray; first pray
# also triggers _resolve_room_pickup so the exit door appears (same
# beat as claiming a pedestal in a combat room).
func _enter_shrine_room() -> void:
	status_label.text = "ALTAR OF VOWS · Pray at one shrine"
	wave_label.text = "[ SHRINE ROOM ]"
	_wave_state = WaveState.COMPLETE
	# Round-robin the three stat kinds across whatever shrines spawn.
	# Order is fixed (hp / dash / atk) so the LEFT-MOST shrine is
	# always HP — players can rely on visual position to read the
	# offer rather than having to walk up to each one.
	# iter-100: was "dodge" — dodge ability removed in iter-95. The
	# middle shrine now reduces dash strike cooldown (the only mobility
	# option left).
	var stat_kinds: Array[String] = ["hp", "dash", "atk"]
	var positions: Array[Vector2] = _room.shrine_positions
	if positions.is_empty():
		# Fallback layout — 3 shrines centered horizontally on the
		# arena, slightly above the y=384 hero line so the player
		# can see all three on entry from the west.
		positions = [Vector2(440, 360), Vector2(640, 360), Vector2(840, 360)]
	var n: int = mini(positions.size(), stat_kinds.size())
	# Pre-bind the kind+position pairs so the deferred spawn doesn't
	# need to recompute mins or capture loop indices via lambda.
	var spawn_pairs: Array = []
	for i in range(n):
		spawn_pairs.append([stat_kinds[i], positions[i]])
	_pending_shrine_spawns = spawn_pairs
	var t: SceneTreeTimer = get_tree().create_timer(0.4)
	t.timeout.connect(_do_spawn_pending_shrines)

# Iter 33 — deferred shrine spawner. Reads _pending_shrine_spawns
# (built by _enter_shrine_room) and instantiates one Shrine per pair.
# Lives as a named method (vs an inline lambda) because GDScript
# lambdas with multi-line for-loops are flaky — extracting to a
# proper method gives clean stack traces if a spawn ever errors.
func _do_spawn_pending_shrines() -> void:
	for pair in _pending_shrine_spawns:
		var kind: String = pair[0]
		var pos: Vector2 = pair[1]
		var sh: Node2D = SHRINE_SCENE.instantiate() as Node2D
		sh.global_position = pos
		sh.set("stat_kind", kind)
		add_child(sh)
	_pending_shrine_spawns.clear()

func _spawn_pedestal_offer(count: int) -> void:
	# Bucket all unowned relics by tier so the roller can pick a tier
	# first then draw from that tier's pool. Drawing-without-replacement
	# within the offer prevents duplicates among the 3 pedestals.
	var by_tier: Dictionary = { "common": [], "rare": [], "legendary": [], "mythic": [] }
	for rid in GameState.RELIC_REGISTRY.keys():
		if GameState.has_relic(rid):
			continue
		var info: Dictionary = GameState.relic_info(rid)
		var tier: String = str(info.get("tier", "common"))
		if by_tier.has(tier):
			(by_tier[tier] as Array).append(rid)
	# Iter 32 — branch modifier biases the by_tier pool BEFORE the
	# weighted roll, so "safe" gives a stable common floor and "risk"
	# guarantees the offer cannot drop below rare. Tier filtering is
	# applied destructively to a local copy so the original pool is
	# preserved for the weights-driven roll on standard / no-branch
	# rooms.
	if _branch_modifier == "safe":
		# Safe: cap upside at common. If common is empty (everything
		# owned at that tier), fall through to the unbiased pool
		# rather than starve the offer.
		if not (by_tier["common"] as Array).is_empty():
			by_tier["rare"] = []
			by_tier["legendary"] = []
			by_tier["mythic"] = []
	elif _branch_modifier == "risk":
		# Risk: drop common entirely so the floor becomes rare. If
		# rare AND legendary AND mythic are empty, fall through unbiased
		# so the player still gets SOMETHING.
		if not ((by_tier["rare"] as Array).is_empty() and (by_tier["legendary"] as Array).is_empty() and (by_tier["mythic"] as Array).is_empty()):
			by_tier["common"] = []
	elif _branch_modifier == "treasure":
		# Iter 33 — treasure room (the player skipped combat for this).
		# Force legendary only. If every legendary is owned, gracefully
		# fall back to rare-only (still better than the iter-30 baseline
		# mixed offer) so the room can't be visited as a dead end.
		if not (by_tier["legendary"] as Array).is_empty():
			by_tier["common"] = []
			by_tier["rare"] = []
		elif not (by_tier["rare"] as Array).is_empty():
			by_tier["common"] = []
	# Pick the weight table for the current room index. -1 (no floor
	# state) falls through to room 1 weights as a defensive default.
	var room_idx: int = RunState.current_room_index if RunState.current_room_index >= 0 else 0
	room_idx = clampi(room_idx, 0, TIER_WEIGHTS_BY_ROOM.size() - 1)
	var weights: Dictionary = TIER_WEIGHTS_BY_ROOM[room_idx]
	# Roll up to `count` distinct relics, each from a tier-weighted draw.
	var picks: Array[String] = []
	for i in range(count):
		var tier_pick: String = _weighted_tier_pick(weights, by_tier)
		if tier_pick == "":
			break   # no unowned relics in any tier
		var pool: Array = by_tier[tier_pick]
		var idx: int = randi() % pool.size()
		picks.append(str(pool[idx]))
		pool.remove_at(idx)   # without-replacement inside the offer
	var n: int = picks.size()
	if n == 0:
		# Nothing left to offer; full heal as consolation, then route.
		hero.heal(99)
		_resolve_room_pickup()
		return
	# Lay out the pedestals in a horizontal row centered on the play
	# field. 200 px spacing reads as "three distinct choices" without
	# crowding the player into accidentally claiming the wrong one.
	var center_x: float = 640.0
	var y: float = 384.0
	var spacing: float = 200.0
	var start_x: float = center_x - spacing * (n - 1) / 2.0
	for i in range(n):
		var ped: Pedestal = PEDESTAL_SCENE.instantiate()
		ped.global_position = Vector2(start_x + spacing * i, y)
		ped.relic_id = picks[i]
		add_child(ped)

# Iter 178 — offer-room vignette. Spawned alongside _spawn_pedestal_offer
# to dim the floor + outer edges so the player's eye is drawn to the
# pedestal row. NOT a full overlay — a darkening Polygon2D anchored
# at room edges with a brighter cutout around the pedestal row.
# Hades / Isaac reward rooms both use this trick to reduce floor-noise
# competition with the cards.
#
# Structure (built programmatically — no .tscn dependency):
#   CanvasLayer (layer 5, between world and HUD)
#   └ ColorRect (full-screen, dark)
#       baked alpha 0.35 — subtle, not a blackout. With the iter-115
#       cave-wall chrome ALSO on screen the effect is "the floor
#       around the offer goes quiet" rather than "the world dimmed."
# Future: a true radial-cutout via shader would carve a brighter
# circle around the pedestals. For now the full-screen dim plus the
# pedestals' tier-colored point lights provide enough contrast.
const OFFER_VIGNETTE_ALPHA: float = 0.35
const OFFER_VIGNETTE_FADE_IN: float = 0.45
const OFFER_VIGNETTE_FADE_OUT: float = 0.35
const OFFER_VIGNETTE_LAYER: int = 5

func _spawn_offer_vignette() -> void:
	if _offer_vignette != null and is_instance_valid(_offer_vignette):
		return
	var layer: CanvasLayer = CanvasLayer.new()
	layer.layer = OFFER_VIGNETTE_LAYER
	layer.name = "OfferVignette"
	var rect: ColorRect = ColorRect.new()
	rect.color = Color(0.02, 0.02, 0.05, 0.0)  # start invisible, fade in
	rect.anchor_right = 1.0
	rect.anchor_bottom = 1.0
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(rect)
	add_child(layer)
	_offer_vignette = layer
	# Fade in over OFFER_VIGNETTE_FADE_IN seconds — smooth transition
	# from "combat just ended" to "now look at this."
	var tw: Tween = create_tween()
	tw.tween_property(rect, "color:a", OFFER_VIGNETTE_ALPHA, OFFER_VIGNETTE_FADE_IN)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)

func _dismiss_offer_vignette() -> void:
	if _offer_vignette == null or not is_instance_valid(_offer_vignette):
		return
	var layer: CanvasLayer = _offer_vignette
	_offer_vignette = null
	# Fade the ColorRect alpha to 0, then free the whole CanvasLayer.
	var rect: ColorRect = null
	for child in layer.get_children():
		if child is ColorRect:
			rect = child
			break
	if rect == null:
		layer.queue_free()
		return
	var tw: Tween = create_tween()
	tw.tween_property(rect, "color:a", 0.0, OFFER_VIGNETTE_FADE_OUT)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.tween_callback(layer.queue_free)

# Weighted random tier picker. Empty tiers are excluded from the roll
# entirely (their weight contribution becomes 0), so weights
# dynamically re-balance as the player drains the pool. Returns ""
# only when EVERY tier is empty — caller treats that as offer-exhausted.
func _weighted_tier_pick(weights: Dictionary, by_tier: Dictionary) -> String:
	var total: float = 0.0
	for tier in weights:
		var pool: Array = by_tier.get(tier, [])
		if not pool.is_empty():
			total += float(weights[tier])
	if total <= 0.0:
		return ""
	var roll: float = randf() * total
	var acc: float = 0.0
	for tier in weights:
		var pool2: Array = by_tier.get(tier, [])
		if pool2.is_empty():
			continue
		acc += float(weights[tier])
		if roll <= acc:
			return str(tier)
	return ""

# Heal the hero +1 on room clear (Hades chamber-heal convention).
# Spawns a green "+1" damage number rising from the hero's head so the
# beat is visible. No-op if already at cap so the number doesn't lie.
# Iter 40 — BLOOD ascendance (4+ BLOOD relics owned). On top of the
# baseline +1, restore 25% of MISSING HP (rounded up). Reads as "your
# blood-soaked relics knit you back together after the fight." With
# bloodstone + heart_of_stone + 2 more BLOOD relics, the player ends
# every room near-full.
func _heal_on_room_clear() -> void:
	if not is_instance_valid(hero) or hero.hp <= 0:
		return
	var cap: int = Hero.MAX_HP + GameState.modifier_total("max_hp_bonus", 0)
	if hero.hp >= cap:
		return
	# Baseline heal.
	hero.heal(1)
	var heal_amount: int = 1
	# BLOOD ascendance — fill 25% of remaining missing HP (after the
	# +1 above). ceili so partial fractions round up — "tiny missing
	# bar = full top-off."
	if GameState.theme_tier("blood") >= 2:
		var missing: int = cap - hero.hp
		if missing > 0:
			var extra: int = int(ceili(float(missing) * 0.25))
			if extra > 0:
				hero.heal(extra)
				heal_amount += extra
	var n: DamageNumber = DamageNumber.spawn(
		hero.global_position + Vector2(0, -56),
		"+%d" % heal_amount,
		Color(0.55, 1.0, 0.55),
	)
	add_child(n)

# Single entry point invoked when a pedestal in the current offer is
# claimed. Drives the room-end branch (door vs run-complete). Guarded
# against double-fire by _room_pickup_resolved so a hypothetical
# secondary pickup event doesn't double-spawn doors.
func _resolve_room_pickup() -> void:
	if _room_pickup_resolved:
		return
	_room_pickup_resolved = true
	# Iter 178 — tear down the offer vignette now that a relic was picked
	# (or the offer otherwise resolved). The room returns to its normal
	# brightness for the walk-to-door beat.
	_dismiss_offer_vignette()
	if _room != null and _room.is_last_room:
		_show_run_complete()
	else:
		# Iter 32 — branching rooms read "the path forks"; single-door
		# legacy rooms keep the iter-30 single-passage line.
		if _room != null and not _room.branches.is_empty():
			status_label.text = "The path forks · choose your passage"
		else:
			status_label.text = "The way deeper has opened · walk east to descend"
		_spawn_door()

func _on_pickup_claimed(_world_pos: Vector2, _name: String) -> void:
	# Iter 20 bugfix — Events.pickup_claimed also fires when chests open
	# (with _name = "gold"). Pre-fix, breaking ANY chest in ANY wave
	# called _resolve_room_pickup() → spawned the floor-exit door right
	# in the middle of combat. Filter: only RELIC ids resolve the room.
	# Non-relic pickups (gold today, future keys/coins) still refresh
	# the HUD if relevant but don't advance the floor.
	# Iter 33 — shrine pickups also resolve the room (single-pray-per-
	# shrine-room contract). They aren't in RELIC_REGISTRY, so the iter-
	# 20 filter rejects them by default; explicit pass-through here.
	if not GameState.RELIC_REGISTRY.has(_name) and not _name.begins_with("shrine_"):
		return
	# Iter 72 — spawn the celebratory pickup banner (480-px frame,
	# theme-colored border, ~3.35 s standard / ~5.5 s + mythic wash).
	# Shrine pickups aren't in RELIC_REGISTRY so the registry check
	# below filters them out — PickupBanner is relic-only feedback.
	# `self` (main) is the host per iter 61's test-mode-safe convention.
	if GameState.RELIC_REGISTRY.has(_name):
		PickupBanner.spawn(_name, self)
	# Pedestal-side dismissal of siblings already happened in
	# pedestal._claim; we only need to drive the room-end branch.
	# Also refresh the HUD relic strip — a new relic just landed in
	# GameState.owned_relics and the strip needs a badge for it.
	# Iter 156 — pass the picked-up name so the new icon gets the
	# arrival tween (scale punch + gold pop) on the strip rebuild.
	# Shrines (_name = "shrine_*") aren't in RELIC_REGISTRY → no
	# matching icon → no tween fires for them, which is correct.
	_rebuild_relic_strip(_name)
	_resolve_room_pickup()
	# Iter 160 — tutorial: WAIT_PICKUP advances when a RELIC pickup
	# happens (filtered above; shrines pass-through but we want a
	# RELIC specifically for the tutorial). The advance fades the
	# prompt out + flags completion in _finalize_tutorial.
	if _tutorial_state == TutorialState.WAIT_PICKUP and GameState.RELIC_REGISTRY.has(_name):
		_advance_tutorial(TutorialState.DONE, "")

# iter-118: Portal placement clearance. Doors visually want at least
# DOOR_CLEARANCE_RADIUS px of free space around their spawn position so
# they don't overlap torches/pillars/chests/hazards/etc. Single source
# of truth — _scatter_decor reads it to gap decor from door zones, and
# _validate_door_placement uses it to warn on per-room conflicts.
const DOOR_CLEARANCE_RADIUS: float = 90.0

# Returns every position where a door MIGHT spawn in this room — used by
# _scatter_decor to reserve clear space (decor that lands inside any
# door's clearance gets skipped) and by _validate_door_placement to
# audit per-room data files for overlap. Logic mirrors _spawn_branch_doors:
# 1 door → DOOR_POSITION; 2 doors → y={270, 498}; 3 doors → y={200, 384, 568}.
func _door_positions_for_room() -> Array[Vector2]:
	var positions: Array[Vector2] = []
	if _room == null:
		positions.append(DOOR_POSITION)
		return positions
	if _room.branches.is_empty():
		positions.append(DOOR_POSITION)
		return positions
	var n: int = mini(_room.branches.size(), 3)
	match n:
		1:
			positions.append(DOOR_POSITION)
		2:
			positions.append(Vector2(DOOR_POSITION.x, 270.0))
			positions.append(Vector2(DOOR_POSITION.x, 498.0))
		3:
			positions.append(Vector2(DOOR_POSITION.x, 200.0))
			positions.append(Vector2(DOOR_POSITION.x, 384.0))
			positions.append(Vector2(DOOR_POSITION.x, 568.0))
		_:
			positions.append(DOOR_POSITION)
	return positions

# iter-118: Audit each authored room for door↔obstacle overlap. Runs
# once per door spawn. If any torch/pillar/chest/hazard/spawn-point is
# within DOOR_CLEARANCE_RADIUS of a door position, log a warning so a
# misconfigured room.tres surfaces immediately. Non-fatal — the door
# still spawns; the warning helps the level designer (or future me)
# fix the conflict in data rather than the engine silently masking it.
func _validate_door_placement(door_positions: Array[Vector2]) -> void:
	if _room == null:
		return
	for dp in door_positions:
		_warn_if_within(dp, _room.torch_positions, "torch")
		_warn_if_within(dp, _room.pillar_positions, "pillar")
		_warn_if_within(dp, _room.chest_positions, "chest")
		_warn_if_within(dp, _room.hazard_positions, "hazard")
		_warn_if_within(dp, _room.spawn_points, "spawn_point")
		# hazards[] (mixed-kind list) carries {position: Vector2}
		for h in _room.hazards:
			if h is Dictionary and h.has("position"):
				var hp = h["position"]
				if hp is Vector2 and (dp.distance_to(hp) < DOOR_CLEARANCE_RADIUS):
					push_warning("door at %s sits %s px from hazard (%s) at %s — within DOOR_CLEARANCE_RADIUS" % [dp, dp.distance_to(hp), str(h.get("kind", "?")), hp])

func _warn_if_within(door_pos: Vector2, positions: Array, label: String) -> void:
	for p in positions:
		if p is Vector2 and door_pos.distance_to(p) < DOOR_CLEARANCE_RADIUS:
			push_warning("door at %s sits %s px from %s at %s — within DOOR_CLEARANCE_RADIUS (%s)" % [door_pos, door_pos.distance_to(p), label, p, DOOR_CLEARANCE_RADIUS])

func _spawn_door() -> void:
	# Iter 32 — when the cleared room declared branches, spawn 2-3 fork
	# doors instead of the single iter-30 portal. The player reads the
	# label + peek and walks into the path they want. Each branch door
	# carries its kind so door.gd sets RunState.pending_branch on entry.
	if _room != null and not _room.branches.is_empty():
		_spawn_branch_doors(_room.branches)
		return
	# iter-118: validate placement against authored obstacles before spawn.
	_validate_door_placement([DOOR_POSITION])
	var door: Door = DOOR_SCENE.instantiate()
	door.global_position = DOOR_POSITION
	add_child(door)

# Iter 32 — multi-door fork. Place N doors along the east edge,
# vertically spaced so each is reachable as a distinct destination.
# Positions per-N:
#   2 branches: y=270, 498
#   3 branches: y=200, 384, 568
# 4+ branches: clamp to 3 (excess entries silently dropped so a
# misconfigured room degrades gracefully rather than crashing).
func _spawn_branch_doors(branches: Array[Dictionary]) -> void:
	var n: int = mini(branches.size(), 3)
	var ys: Array[float] = []
	match n:
		1:
			ys = [DOOR_POSITION.y]
		2:
			ys = [270.0, 498.0]
		3:
			ys = [200.0, 384.0, 568.0]
		_:
			ys = [DOOR_POSITION.y]
	# iter-118: validate the WHOLE branch fan against authored obstacles
	# before any door spawns. Pre-iter-118 a misconfigured room could
	# place a torch directly under a branch door y-offset (e.g. y=200
	# overlapping torch_positions[0]) and the player would see a portal
	# growing INSIDE a flame — caught at warning time now.
	var positions: Array[Vector2] = []
	for y in ys:
		positions.append(Vector2(DOOR_POSITION.x, y))
	_validate_door_placement(positions)
	for i in range(n):
		var entry: Dictionary = branches[i]
		var door: Door = DOOR_SCENE.instantiate()
		# Set branch metadata BEFORE add_child so door._ready picks
		# the label / tint / glow color up on first frame.
		door.branch_kind = str(entry.get("kind", "standard"))
		door.branch_label = str(entry.get("label", "ONWARD"))
		door.branch_subtitle = str(entry.get("subtitle", ""))
		# Iter 33 — destination room path override. Branches that route
		# to a non-combat room (treasure / shrine) set "room_path" in
		# the branches Dictionary; legacy safe/standard/risk leaves it
		# absent so we follow the linear FLOOR_ROOMS sequence.
		door.branch_room_path = str(entry.get("room_path", ""))
		door.global_position = Vector2(DOOR_POSITION.x, ys[i])
		add_child(door)

# Iter 32 — branch modifier dispatch. Called from _ready right after
# _waves is populated. Reads RunState.pending_branch (set by the
# branch-door we came through), applies one-shot effects, then clears
# it so a subsequent legacy single-door advance doesn't re-fire the
# modifier on the next-next room.
#
# Effects per kind:
#   "safe"      Heal +1 (capped at max HP) on entry. Stored kind
#               drops pedestal offer's tier ceiling to common-only.
#   "risk"      Random pair in wave 0 gets +1 count. Stored kind
#               raises pedestal offer's tier floor to rare.
#   "standard"  No effect; kind stored only for HUD parity.
#   ""          No branch was set (legacy single-door room) — early-out.
func _apply_pending_branch_modifier() -> void:
	var kind: String = RunState.pending_branch
	RunState.pending_branch = ""   # always consume — single-use per room
	if kind == "":
		return
	_branch_modifier = kind
	match kind:
		"safe":
			# Defer heal slightly so the damage-number's spawn point is
			# the hero's resting position (not the spawn-flicker frame).
			# Mirrors _heal_on_room_clear's timing pattern.
			var t: SceneTreeTimer = get_tree().create_timer(0.25)
			t.timeout.connect(_apply_safe_heal)
		"risk":
			if not _waves.is_empty():
				var w0 = _waves[0]
				if w0 is Array and (w0 as Array).size() > 0:
					var pair_idx: int = randi() % (w0 as Array).size()
					var pair = (w0 as Array)[pair_idx]
					if pair is Array and (pair as Array).size() >= 2:
						(pair as Array)[1] = int((pair as Array)[1]) + 1
		"standard":
			pass

# Iter 32 — safe-branch heal. Extracted so the timer callback has a
# stable target. Heal is capped at max HP (no-op overflow); +1 floater
# spawns regardless to confirm the player chose the safe branch.
func _apply_safe_heal() -> void:
	if not is_instance_valid(hero) or hero.hp <= 0:
		return
	var cap: int = Hero.MAX_HP + GameState.modifier_total("max_hp_bonus", 0)
	if hero.hp < cap:
		hero.heal(1)
	var n: DamageNumber = DamageNumber.spawn(
		hero.global_position + Vector2(0, -56),
		"+1 SAFE",
		Color(0.65, 1.0, 0.7),
	)
	add_child(n)

func _on_enemy_died(world_pos: Vector2) -> void:
	_kills += 1
	GameState.register_run_kill()
	RunState.register_kill()
	_update_kills()
	var n: DamageNumber = DamageNumber.spawn(world_pos + Vector2(0, -36), "+1", Color(1, 0.95, 0.7))
	add_child(n)
	# iter-83 immersion pass: persistent blood mark on the floor at the
	# kill site. Sits at z=-1 (above floor wash, below decor/hero) and
	# fades over FULL_LIFE=30s so the room visibly accumulates battle
	# damage through a wave and clears by next room. Matches the JS
	# reference's drawRoomMarks atmosphere — empty space after a kill
	# carries narrative of what happened.
	BloodMark.spawn(self, world_pos)

func _on_hero_swing_connected(hit_count: int, any_crit: bool = false) -> void:
	# Iter 21 — bridge to the audio bus. audio.gd subscribes to
	# Events.hero_swing_connected for the slash_arc whoosh-cut layered
	# on the existing hero_swing sound. We're the only emitter; hero
	# already gates its swing_connected signal on hit_count > 0.
	Events.hero_swing_connected.emit(hero.global_position)
	# Brief hit-stop on a connecting melee swing. The freeze scale is
	# the hero-took-damage one's bigger sibling — same machinery, just
	# lighter / shorter. Don't stack: if we're already mid-stop from
	# the hero-getting-hit handler, leave that one alone (it's bigger).
	if _hit_stop_timer > 0.0:
		return
	# Tiny bonus on multi-hit, clamped so a cleave-through doesn't
	# freeze the screen.
	var multi_bonus: float = mini(hit_count - 1, 2) * 0.01
	# Iter 140 — branch on `any_crit`. Crit swings drop into a deeper
	# (95% slowdown) and longer (~6 frames) freeze. The multi-hit bonus
	# stacks on either path so a 3-hit crit cleave still scales up.
	if any_crit:
		Engine.time_scale = CRIT_SWING_HIT_STOP_SCALE
		_hit_stop_timer = CRIT_SWING_HIT_STOP_TIME + multi_bonus
	else:
		Engine.time_scale = SWING_HIT_STOP_SCALE
		_hit_stop_timer = SWING_HIT_STOP_TIME + multi_bonus

# Iter 148 — boss-defeated cinematic moment. Fired right after the
# boss takes its lethal hit, BEFORE _on_wave_cleared resolves and
# spawns FloorClearBurst. The slow-mo + shake creates a "wait, did
# I just—" beat that makes the boss kill feel weighty. The hit-stop
# uses the existing _hit_stop_timer machinery — Engine.time_scale
# resets to 1.0 automatically via the _process loop when the timer
# elapses. Boss-death stop OVERRIDES any in-flight crit/swing/dash
# stop (those checks `if _hit_stop_timer > 0.0: return`, so we
# unconditionally set here regardless of an existing tiny stop).
func _on_boss_died(_world_pos: Vector2, _boss_name: String) -> void:
	Engine.time_scale = BOSS_DEATH_TIME_SCALE
	_hit_stop_timer = BOSS_DEATH_HIT_STOP_TIME
	FX.shake(BOSS_DEATH_SHAKE_AMP, BOSS_DEATH_SHAKE_TIME)

# Iter 155 — directional damage indicator. Paint a brief red bar
# along the screen edge nearest the damage source so the player can
# spot offscreen threats (bonecap turrets behind a wall, projectiles
# arriving from outside camera view). Only fires when source_pos is
# known (DoT ticks / environmental hazards don't emit
# hero_damage_directional, see hero.gd take_damage).
#
# Edge picker: pick the dominant axis of (source - hero) in world
# coords. If |dx| > |dy| → horizontal axis dominant → LEFT or RIGHT
# edge; else → TOP or BOTTOM edge. Sign picks which side.
#
# Tween: snap to alpha 0.55 + position to chosen edge, then fade
# alpha → 0 over 0.55s. Kill any in-flight tween so rapid succession
# of hits doesn't pile up alpha (the latest direction wins).
const DMG_INDICATOR_THICKNESS: float = 96.0
const DMG_INDICATOR_PEAK_ALPHA: float = 0.55
const DMG_INDICATOR_FADE_DUR: float = 0.55
const DMG_INDICATOR_COLOR: Color = Color(0.85, 0.10, 0.12, 1.0)

func _on_hero_damage_directional(source_pos: Vector2, hero_pos: Vector2) -> void:
	# Lazy-init. Mount on the UI CanvasLayer so it sits above world
	# render but below death veil. Mouse filter STOP so the indicator
	# absorbs no input (it'd be a tooltip-eating problem otherwise).
	if _dmg_indicator == null:
		var ui: CanvasLayer = $UI as CanvasLayer
		_dmg_indicator = ColorRect.new()
		_dmg_indicator.name = "DamageDirectionalIndicator"
		_dmg_indicator.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_dmg_indicator.color = DMG_INDICATOR_COLOR
		_dmg_indicator.color.a = 0.0
		ui.add_child(_dmg_indicator)
	# Reset all anchors then re-pin to the chosen edge. anchor_left =
	# anchor_right = 0..1 in screen-fraction space; offset_* in px.
	var d: Vector2 = source_pos - hero_pos
	# Position the ColorRect at the dominant-axis edge.
	if abs(d.x) > abs(d.y):
		# Horizontal-dominant — pick LEFT or RIGHT edge.
		_dmg_indicator.anchor_top = 0.0
		_dmg_indicator.anchor_bottom = 1.0
		_dmg_indicator.offset_top = 0.0
		_dmg_indicator.offset_bottom = 0.0
		if d.x > 0.0:
			# Source to the RIGHT — paint right edge.
			_dmg_indicator.anchor_left = 1.0
			_dmg_indicator.anchor_right = 1.0
			_dmg_indicator.offset_left = -DMG_INDICATOR_THICKNESS
			_dmg_indicator.offset_right = 0.0
		else:
			# Source to the LEFT — paint left edge.
			_dmg_indicator.anchor_left = 0.0
			_dmg_indicator.anchor_right = 0.0
			_dmg_indicator.offset_left = 0.0
			_dmg_indicator.offset_right = DMG_INDICATOR_THICKNESS
	else:
		# Vertical-dominant — pick TOP or BOTTOM edge.
		_dmg_indicator.anchor_left = 0.0
		_dmg_indicator.anchor_right = 1.0
		_dmg_indicator.offset_left = 0.0
		_dmg_indicator.offset_right = 0.0
		if d.y > 0.0:
			# Source BELOW (Godot 2D +Y is down) — paint bottom edge.
			_dmg_indicator.anchor_top = 1.0
			_dmg_indicator.anchor_bottom = 1.0
			_dmg_indicator.offset_top = -DMG_INDICATOR_THICKNESS
			_dmg_indicator.offset_bottom = 0.0
		else:
			# Source ABOVE — paint top edge.
			_dmg_indicator.anchor_top = 0.0
			_dmg_indicator.anchor_bottom = 0.0
			_dmg_indicator.offset_top = 0.0
			_dmg_indicator.offset_bottom = DMG_INDICATOR_THICKNESS
	# Kill any in-flight fade so a rapid succession of hits doesn't
	# pile up alpha (last direction wins).
	if _dmg_indicator_tween != null and _dmg_indicator_tween.is_valid():
		_dmg_indicator_tween.kill()
	_dmg_indicator.color = Color(DMG_INDICATOR_COLOR.r, DMG_INDICATOR_COLOR.g, DMG_INDICATOR_COLOR.b, DMG_INDICATOR_PEAK_ALPHA)
	_dmg_indicator_tween = create_tween()
	_dmg_indicator_tween.tween_property(_dmg_indicator, "color:a", 0.0, DMG_INDICATOR_FADE_DUR)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)

func _on_hero_dash_strike_landed(world_pos: Vector2, hit_count: int) -> void:
	# iter-94: dash impact reverts from the iter-87 PixelLab sprite-sheet
	# back to the procedural dash_impact.tscn (which we already keep
	# loaded for SOUL_BURST relic reuse). The sheet's cell boundary was
	# rendering as a visible "broken square" in playtest — the procedural
	# scene has no such boundary and looks cleaner. The forward dash
	# shield + trailing particles supplied by hero.gd's dash_shield +
	# dash_trail spawns now carry most of the in-flight visual weight;
	# this landing impact reads as the moment-of-stop punctuation.
	var impact: Node2D = DASH_IMPACT_SCENE.instantiate() as Node2D
	if impact != null:
		impact.global_position = world_pos
		if impact.has_method("set_dash_dir") and hit_count > 0:
			# Orient the streaks back along the dash direction — the
			# hero just stopped moving so global_position is the landing
			# point. We don't have direct access to dash_dir here; the
			# procedural scene falls back to a ±100° arc if no hint is
			# provided, which still reads correctly. No-op if absent.
			pass
		add_child(impact)
	# Iter 21 — bridge to the audio bus. audio.gd subscribes to
	# Events.hero_dash_impacted for the low-thud body of the impact.
	# Fires ONCE per dash regardless of hit_count — the per-enemy
	# enemy_hit chain handles the secondary "ka-tinks."
	Events.hero_dash_impacted.emit(world_pos)
	# Heavy shake on connect; lighter "thump" shake on whiff so the
	# dash still has some recoil weight even when you miss.
	if hit_count > 0:
		FX.shake(10.0, 0.16)
		# Hit-stop only on connect — a whiffed dash shouldn't freeze
		# the screen mid-movement. Skip if a heavier hero-damage stop
		# is already running.
		if _hit_stop_timer <= 0.0:
			Engine.time_scale = DASH_HIT_STOP_SCALE
			_hit_stop_timer = DASH_HIT_STOP_TIME
	else:
		FX.shake(4.0, 0.10)

func _on_hero_hit_received() -> void:
	Engine.time_scale = HIT_STOP_SCALE
	_hit_stop_timer = HIT_STOP_TIME
	var n: DamageNumber = DamageNumber.spawn(
		hero.global_position + Vector2(0, -50),
		"-1",
		Color(1, 0.45, 0.45)
	)
	add_child(n)

func _on_hero_hp_changed(new_hp: int) -> void:
	_update_hp(new_hp)

# Iter 54 — combo counter HUD updater. Lazy-builds the Label on first
# call so the .tscn stays untouched. Visibility gates at combo >= 5 to
# avoid HUD spam during short streaks. Color + scale ramp at tier
# thresholds (10/25/50/100) — bigger + warmer as the streak grows.
func _on_hero_combo_changed(new_value: int) -> void:
	# Lazy-init: mount on the UI CanvasLayer top-right.
	if _combo_label == null:
		var ui: CanvasLayer = $UI as CanvasLayer
		_combo_label = Label.new()
		_combo_label.name = "ComboLabel"
		# Top-right corner anchor, under the WAVE label.
		_combo_label.anchor_left = 1.0
		_combo_label.anchor_right = 1.0
		_combo_label.offset_left = -240.0
		_combo_label.offset_top = 92.0
		_combo_label.offset_right = -16.0
		_combo_label.offset_bottom = 132.0
		_combo_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		_combo_label.add_theme_font_size_override("font_size", 22)
		_combo_label.add_theme_color_override("font_color", Color(1, 0.92, 0.6, 1))
		_combo_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.95))
		_combo_label.add_theme_constant_override("outline_size", 4)
		_combo_label.pivot_offset = Vector2(112, 20)
		ui.add_child(_combo_label)
	# Iter 151 — combo BREAK feedback. If the new value is 0 AND we
	# were in a meaningful tier (≥ 10), the player just LOST a real
	# streak (most commonly: they took damage). Flash the label red +
	# scale-punch before the visibility hide kicks in. The 0.6 s
	# total beat (peak red @ 0.08, fade to dimmer red @ 0.32, hide at
	# 0.20 alpha-out) is short enough to read at a glance but long
	# enough to register the loss. Without this beat, losing a 50+
	# combo on a single bad hit felt invisible — players didn't
	# notice the streak ended until they checked the corner.
	# Note: we DO want the visibility=false to kick at the end so the
	# label doesn't hang around after the break beat. The chain
	# tween includes a final scale-reset for safety.
	if new_value == 0 and _prev_combo >= 10 and _combo_label != null:
		_show_combo_break()
		_prev_combo = new_value
		return
	# Below 5: hide (no clutter for normal play).
	if new_value < 5:
		_combo_label.visible = false
		_combo_label.scale = Vector2.ONE
		_prev_combo = new_value
		return
	_combo_label.visible = true
	_combo_label.text = "x%d COMBO" % new_value
	# Tier ramp — bigger size + warmer hue as the streak grows.
	# 5+ default; 10+ slightly warmer; 25+ orange-yellow; 50+ red-hot;
	# 100+ peak crimson + larger.
	var size: int = 22
	var col: Color = Color(1, 0.92, 0.6, 1)
	if new_value >= 100:
		size = 38
		col = Color(1.0, 0.45, 0.30, 1)
	elif new_value >= 50:
		size = 32
		col = Color(1.0, 0.65, 0.30, 1)
	elif new_value >= 25:
		size = 28
		col = Color(1.0, 0.82, 0.40, 1)
	elif new_value >= 10:
		size = 24
		col = Color(1.0, 0.92, 0.50, 1)
	_combo_label.add_theme_font_size_override("font_size", size)
	_combo_label.add_theme_color_override("font_color", col)
	# Bump pulse on tier crossings (10/25/50/100 exactly) — punch tween.
	if new_value == 10 or new_value == 25 or new_value == 50 or new_value == 100:
		var tw: Tween = create_tween().set_parallel(true)
		tw.tween_property(_combo_label, "scale", Vector2(1.35, 1.35), 0.08)
		tw.chain().tween_property(_combo_label, "scale", Vector2.ONE, 0.18)
	_prev_combo = new_value

# Iter 151 — combo break flash. Shown only when a meaningful streak
# (≥ 10) drops to 0. Three-phase tween:
#   1. Snap to red + scale 1.30 (instant — the "OOF" frame)
#   2. Tween scale → 1.0, modulate → dim red over 0.30s
#   3. Final alpha fade-out + hide so the label clears
# The label text shifts to "STREAK LOST" so the player has a clear
# message in addition to the color punch.
func _show_combo_break() -> void:
	if _combo_label == null:
		return
	if _combo_break_tween != null and _combo_break_tween.is_valid():
		_combo_break_tween.kill()
	_combo_label.visible = true
	_combo_label.text = "STREAK LOST"
	_combo_label.scale = Vector2(1.30, 1.30)
	_combo_label.modulate = Color(1.5, 0.35, 0.30, 1.0)  # HDR-red punch
	_combo_break_tween = create_tween().set_parallel(true)
	_combo_break_tween.tween_property(_combo_label, "scale", Vector2.ONE, 0.30)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	_combo_break_tween.tween_property(_combo_label, "modulate", Color(0.85, 0.32, 0.30, 1.0), 0.30)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	# Phase 2: fade alpha → 0 + hide. Chain so the alpha fade starts
	# AFTER the scale + modulate settle.
	_combo_break_tween.chain().tween_property(_combo_label, "modulate:a", 0.0, 0.30)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	_combo_break_tween.tween_callback(func ():
		if _combo_label != null:
			_combo_label.visible = false
			_combo_label.scale = Vector2.ONE
			_combo_label.modulate = Color(1, 1, 1, 1)
	)

# iter-125: heart-pip geometry. 12-vertex pixel-art heart, anchored at
# its visual centroid. Clockwise from the bottom-tip. Scaled up
# HEART_SCALE × to get a ~26 px wide visible heart inside a 30 px pip.
#
# Stored as a non-const var because Godot 4's `const` only accepts
# literal expressions — `PackedVector2Array([Vector2(...), ...])` calls
# the Vector2 constructor at evaluation time, which the parser rejects
# in a const context. Lazy-init pattern: empty array sentinel, filled
# on first call to _heart_verts_polygon().
var _heart_verts_cache: PackedVector2Array = PackedVector2Array()
const HEART_SCALE: float = 2.4

func _heart_verts_polygon() -> PackedVector2Array:
	if _heart_verts_cache.is_empty():
		_heart_verts_cache = PackedVector2Array([
			Vector2(0, 5),      # bottom tip (anchor)
			Vector2(4, 3),      # right lower curve
			Vector2(5, 0),      # right mid
			Vector2(5, -2),     # right upper
			Vector2(3, -3.5),   # right lobe peak
			Vector2(1, -3),     # right arch top (inner notch side)
			Vector2(0, -1.5),   # center notch
			Vector2(-1, -3),    # left arch top
			Vector2(-3, -3.5),  # left lobe peak
			Vector2(-5, -2),    # left upper
			Vector2(-5, 0),     # left mid
			Vector2(-4, 3),     # left lower curve
		])
	return _heart_verts_cache
const HEART_PIP_SIZE: float = 30.0
# Iter 170 — pip colors brightened. Pre-iter-170 the hearts read as
# dim-red-on-dark and merged with the dungeon's warm-brown floor in
# screenshots (user-reported "hearts almost gone behind tints"). Now:
#   • FILL is HDR-saturated (1.25 red, slight pink) — pops on any
#     floor color via the >1 modulate.
#   • EMPTY is mauve-grey (0.42, 0.32, 0.34) instead of near-black
#     so missing-HP slots remain LEGIBLE (was "lost a heart? what
#     heart?" on dark backgrounds).
#   • OUTLINE pure-black + thicker via the iter-125 Line2D so the
#     pip silhouette holds against any backdrop.
#   • SHADOW alpha bumped 0.55 → 0.70 so the drop-shadow visibly
#     anchors each pip on the floor.
const HEART_FILL_COLOR: Color = Color(1.25, 0.36, 0.40, 1.0)
const HEART_EMPTY_COLOR: Color = Color(0.42, 0.32, 0.34, 0.90)
const HEART_OUTLINE_COLOR: Color = Color(0.0, 0.0, 0.0, 1.0)
const HEART_SHADOW_COLOR: Color = Color(0.0, 0.0, 0.0, 0.70)
const HEART_HIGHLIGHT_COLOR: Color = Color(1.0, 0.72, 0.62, 0.85)

func _update_hp(v: int) -> void:
	var max_hp: int = Hero.MAX_HP + GameState.modifier_total("max_hp_bonus", 0)
	# iter-125: rebuild pip count when max_hp changes (relic pickup that
	# bumps max_hp_bonus). Cheap because the pips are simple polygons.
	if heart_row != null:
		if heart_row.get_child_count() != max_hp:
			for child in heart_row.get_children():
				child.queue_free()
			for i in range(max_hp):
				heart_row.add_child(_make_heart_pip())
		# Toggle fill state per pip. Children already exist after the
		# rebuild branch above; if max_hp didn't change we just update colors.
		var pips: Array = heart_row.get_children()
		for i in range(pips.size()):
			_set_pip_filled(pips[i], i < v)
	# iter-113: punch the heart row when HP changes. Direction-aware:
	#   • HP DOWN  → scale 1.0 → 1.22 → 1.0 — reads as "you took a hit."
	#   • HP UP    → scale 1.0 → 1.12 → 1.0 — gentler, "you healed."
	# First call (_prev_hp == -1) skips the pulse so spawn-in doesn't
	# flash a phantom heal up to full HP. iter-125: pulse retargeted from
	# the (now-hidden) HPLabel to the new heart_row Control.
	if _prev_hp >= 0 and v != _prev_hp and heart_row != null:
		if v < _prev_hp:
			_pulse_label(heart_row, "_hp_pulse_tween", 1.22, HP_DAMAGE_FLASH_MODULATE, 0.32)
		else:
			_pulse_label(heart_row, "_hp_pulse_tween", 1.12, HP_HEAL_FLASH_MODULATE, 0.28)
	_prev_hp = v
	# iter-142: low-HP heartbeat tell.
	#   • v > 0 and v ≤ threshold → start (or keep) breathing
	#   • else → stop + reset modulate / scale
	# Threshold floors at 2 so a 6-HP hero pulses at ≤2 (matches the JS
	# reference's "two heart" danger zone) and a 9-HP boosted hero pulses
	# at ≤3. v == 0 means hero just died — kill the loop so the death
	# screen doesn't overlay a still-breathing heart row.
	if heart_row != null:
		var low_th: int = _hp_low_threshold()
		if v > 0 and v <= low_th:
			# Entering / staying in the danger zone. If a damage pulse just
			# kicked in (still tweening), defer the loop start so the
			# damage flash plays out cleanly first. Otherwise start now.
			if not _hp_low_pulse_active:
				if _hp_pulse_tween != null and _hp_pulse_tween.is_valid():
					_hp_pulse_tween.finished.connect(_start_hp_low_pulse, CONNECT_ONE_SHOT)
				else:
					_start_hp_low_pulse()
		else:
			_stop_hp_low_pulse()

# iter-142: derive the low-HP threshold from current max_hp. Floor at 2
# so the breathing always kicks in with at least 2 hearts of warning
# (anything tighter feels like a surprise rather than a danger tell).
func _hp_low_threshold() -> int:
	var max_hp: int = Hero.MAX_HP + GameState.modifier_total("max_hp_bonus", 0)
	return maxi(2, max_hp / 3)

# iter-142: start the heart-row breathing pulse. Re-checks hp at fire
# time (a deferred call via CONNECT_ONE_SHOT could race with a heal),
# kills any prior loop, then starts a SINE ping-pong:
#   scale + modulate ramp up over HP_LOW_PULSE_DUR/2 (warm red HDR)
#   scale + modulate ramp down over HP_LOW_PULSE_DUR/2 (neutral)
#   set_loops() repeats forever until _stop_hp_low_pulse() kills.
func _start_hp_low_pulse() -> void:
	if heart_row == null:
		return
	if not is_instance_valid(hero) or hero.hp <= 0:
		return
	if hero.hp > _hp_low_threshold():
		return
	if _hp_low_pulse_tween != null and _hp_low_pulse_tween.is_valid():
		_hp_low_pulse_tween.kill()
	heart_row.pivot_offset = heart_row.size * 0.5
	var half_dur: float = HP_LOW_PULSE_DUR * 0.5
	var tw: Tween = create_tween().set_loops()
	tw.set_parallel(true)
	tw.tween_property(heart_row, "scale", Vector2(HP_LOW_PULSE_SCALE, HP_LOW_PULSE_SCALE), half_dur)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	tw.tween_property(heart_row, "modulate", HP_LOW_PULSE_MODULATE, half_dur)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	tw.chain().set_parallel(true)
	tw.tween_property(heart_row, "scale", Vector2.ONE, half_dur)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	tw.tween_property(heart_row, "modulate", HUD_NEUTRAL_MODULATE, half_dur)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	_hp_low_pulse_tween = tw
	_hp_low_pulse_active = true

# iter-142: stop the heart-row breathing pulse and reset to neutral. Safe
# to call when nothing is running (no-op).
func _stop_hp_low_pulse() -> void:
	if _hp_low_pulse_tween != null and _hp_low_pulse_tween.is_valid():
		_hp_low_pulse_tween.kill()
	_hp_low_pulse_tween = null
	_hp_low_pulse_active = false
	if heart_row != null:
		heart_row.scale = Vector2.ONE
		heart_row.modulate = HUD_NEUTRAL_MODULATE

# iter-125: build one heart pip. The pip is a Control sized
# HEART_PIP_SIZE × HEART_PIP_SIZE with three layered Polygon2Ds:
#   • Shadow — same shape, offset (+1, +1.5) px, dark 0.55 alpha
#   • Body   — same shape, color set by _set_pip_filled (full red or
#              dim grey)
#   • Outline — Line2D tracing the heart silhouette in near-black
# The pip's geometry is in LOCAL coords centered at (PIP_SIZE/2, PIP_SIZE/2)
# so HBoxContainer + horizontal layout puts them in a clean row.
func _make_heart_pip() -> Control:
	var pip: Control = Control.new()
	pip.custom_minimum_size = Vector2(HEART_PIP_SIZE, HEART_PIP_SIZE)
	pip.size = Vector2(HEART_PIP_SIZE, HEART_PIP_SIZE)
	pip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var center: Vector2 = Vector2(HEART_PIP_SIZE * 0.5, HEART_PIP_SIZE * 0.5)
	var template: PackedVector2Array = _heart_verts_polygon()
	var scaled: PackedVector2Array = PackedVector2Array()
	for vert in template:
		scaled.append(vert * HEART_SCALE)
	# Shadow first (drawn first → underneath).
	var shadow: Polygon2D = Polygon2D.new()
	shadow.polygon = scaled
	shadow.color = HEART_SHADOW_COLOR
	shadow.position = center + Vector2(1.0, 1.5)
	shadow.name = "Shadow"
	pip.add_child(shadow)
	# Body — fill changes between HEART_FILL_COLOR / HEART_EMPTY_COLOR
	# in _set_pip_filled.
	var body: Polygon2D = Polygon2D.new()
	body.polygon = scaled
	body.color = HEART_FILL_COLOR
	body.position = center
	body.name = "Body"
	pip.add_child(body)
	# Inner highlight — a small lighter polygon offset up-left on the
	# left lobe. Sells "this heart catches a torchlight pulse."
	var highlight: Polygon2D = Polygon2D.new()
	var hl_pts: PackedVector2Array = PackedVector2Array([
		Vector2(-3, -3) * HEART_SCALE * 0.7,
		Vector2(-1.5, -2) * HEART_SCALE * 0.7,
		Vector2(-2, -0.5) * HEART_SCALE * 0.7,
		Vector2(-4, -1.5) * HEART_SCALE * 0.7,
	])
	highlight.polygon = hl_pts
	highlight.color = HEART_HIGHLIGHT_COLOR
	highlight.position = center + Vector2(-1.0, -1.0)
	highlight.name = "Highlight"
	pip.add_child(highlight)
	# Outline — Line2D closing back to vertex 0 so the silhouette reads
	# crisp against bright torch sparks underneath.
	var outline: Line2D = Line2D.new()
	var outline_pts: PackedVector2Array = PackedVector2Array()
	for vert in template:
		outline_pts.append(vert * HEART_SCALE)
	outline_pts.append(template[0] * HEART_SCALE)
	outline.points = outline_pts
	# Iter 170 — outline width 1.5 → 2.5 for stronger silhouette
	# definition on dark dungeon backdrops. The hearts are small
	# (~24 px wide); a 1.5 px outline got eaten by the floor texture.
	outline.width = 2.5
	outline.default_color = HEART_OUTLINE_COLOR
	outline.antialiased = true
	outline.position = center
	outline.name = "Outline"
	pip.add_child(outline)
	return pip

# Toggle a pip between "filled" (current HP) and "empty" (lost HP).
# Color the body + show / hide the highlight + dim the shadow so an
# empty pip reads visually distinct from a filled one at a glance.
func _set_pip_filled(pip: Control, filled: bool) -> void:
	var body: Polygon2D = pip.get_node_or_null("Body") as Polygon2D
	var highlight: Polygon2D = pip.get_node_or_null("Highlight") as Polygon2D
	var shadow: Polygon2D = pip.get_node_or_null("Shadow") as Polygon2D
	if body != null:
		body.color = HEART_FILL_COLOR if filled else HEART_EMPTY_COLOR
	if highlight != null:
		highlight.visible = filled
	if shadow != null:
		# Dim the shadow on empty pips so the pip recedes visually.
		shadow.modulate.a = 1.0 if filled else 0.5

# iter-113: HUD pulse palette. Label modulate is a per-pixel MULTIPLY on
# top of the theme_override font_color, so to BRIGHTEN we set components
# above 1.0 (Godot 2D modulate accepts >1 as HDR brighten). Lower the
# blue/green channels relative to red to keep damage flash red-leaning;
# the opposite for heal so the player's eye reads green→good. Kill
# flash brightens uniformly for cream-gold pop.
const HP_DAMAGE_FLASH_MODULATE: Color = Color(1.8, 1.0, 1.0, 1.0)
const HP_HEAL_FLASH_MODULATE: Color = Color(1.0, 1.8, 1.0, 1.0)
const KILLS_FLASH_MODULATE: Color = Color(1.6, 1.6, 1.4, 1.0)
const HUD_NEUTRAL_MODULATE: Color = Color(1.0, 1.0, 1.0, 1.0)
# iter-142: low-HP heartbeat tell. Hades / Isaac both surface "you're in
# trouble" before the player consciously reads the heart count — a
# looping scale + warm-red modulate breathe on the heart row that
# starts when hp falls into the danger zone (max(2, max_hp/3)) and
# stops when hp recovers or the hero dies. SINE ease keeps it
# breathing organically (no sharp triangle wave), HDR red boost
# (1.45, 0.55, 0.55) brightens on torch-lit floors. 0.9s full cycle
# = peripheral-vision pace, slow enough not to feel like a stutter.
const HP_LOW_PULSE_MODULATE: Color = Color(1.45, 0.55, 0.55, 1.0)
const HP_LOW_PULSE_DUR: float = 0.9
const HP_LOW_PULSE_SCALE: float = 1.08

func _update_kills() -> void:
	kills_label.text = "KILLS  %d" % _kills
	# iter-113: punch the kill counter on every increment. Only ever
	# pulses up (kills are monotonic), so no direction branching. Skipping
	# the pulse on the initial set (_prev_kills == -1) matches the
	# _update_hp pattern — no phantom-flash on scene load.
	if _prev_kills >= 0 and _kills > _prev_kills:
		_pulse_label(kills_label, "_kills_pulse_tween", 1.18, KILLS_FLASH_MODULATE, 0.30)
	_prev_kills = _kills

# Shared scale + modulate flash helper. Pivot is set to the label's
# center so the scale animates symmetrically (default Control pivot is
# top-left, which makes the scale visually pull DOWN and RIGHT — wrong
# for a punch). tween_field_name is the string name of the cached Tween
# var on `self`, so the helper can kill any prior pulse on the same
# target before starting a new one (otherwise a rapid hit sequence stacks
# scales / modulates).
#
# Two-stage tween:
#   1. Snap to scale_peak + flash_modulate (no tween — instant)
#   2. Tween back to scale=1.0 + neutral-white modulate over `total_dur`
# The snap-then-tween shape reads as a HIT rather than a slow grow.
#
# Note: flash_modulate is the WHOLE Color, used as Godot's HDR-multiply
# tint over the theme_override font_color. Values > 1 brighten the
# corresponding channel (no clamp in Godot 2D). End state is white
# (1,1,1,1) which yields the resting font_color from the theme override.
func _pulse_label(label: Control, tween_field_name: String, scale_peak: float, flash_modulate: Color, total_dur: float) -> void:
	if label == null:
		return
	# Kill any in-flight pulse on this label so we always end at neutral.
	var prev: Tween = get(tween_field_name)
	if prev != null and prev.is_valid():
		prev.kill()
	# Pivot at center so scale punches symmetrically. label.size won't
	# resolve correctly until the layout has been processed at least
	# once, but at this point in the frame it has been (we're called
	# from the hp_changed signal, which fires after physics_process /
	# layout pass on the same frame).
	label.pivot_offset = label.size * 0.5
	label.scale = Vector2(scale_peak, scale_peak)
	label.modulate = flash_modulate
	var tw: Tween = create_tween().set_parallel(true)
	tw.tween_property(label, "scale", Vector2.ONE, total_dur)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(label, "modulate", HUD_NEUTRAL_MODULATE, total_dur)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	set(tween_field_name, tw)

func _update_room_label() -> void:
	if _room == null or RunState.current_room_index < 0:
		room_label.text = ""
		if room_progress_label != null:
			room_progress_label.text = ""
		return
	var total: int = RunState.FLOOR_ROOMS.size()
	var idx: int = RunState.current_room_index + 1
	# Iter 179 — split: the dramatic banner is just the room NAME (it
	# fades after a beat anyway). The persistent top-left chip carries
	# the X/Y progress. Before this they BOTH carried "ROOM X/Y" so for
	# the first 2-3s of every room you saw the same number twice.
	room_label.text = _room.display_name
	if room_progress_label != null:
		room_progress_label.text = "ROOM %d / %d" % [idx, total]

# iter-119: control-hint / status-text auto-fade. Polls status_label.text
# each tick — if it changed since last poll, reset the fade timer +
# snap alpha back to 1.0. If it's been unchanged for HINT_FADE_DELAY
# seconds, kick off a one-shot fade tween down to HINT_FADED_ALPHA so
# the help text stops competing with combat reads.
#
# Polling avoids having to wrap all 9 call sites that set
# status_label.text — they keep working unmodified, and this loop
# handles state reset automatically.
# Iter 160 — first-run tutorial. State machine spelled out in the
# TutorialState enum at the top of the file. Each step is a
# single-line text prompt with a defined input gate; once detected,
# advance to the next step. The DONE state runs once on transition
# in (set GameState flag + persist), then OFF.
#
# Design notes:
#   • Distance-based gate on MOVE (not "first input") so a stray
#     button press during loading doesn't skip the prompt.
#   • Input.is_action_just_pressed used for ATTACK and DASH so the
#     gate fires whether or not the swing/dash actually CONNECTED
#     with anything — the player learning to dash doesn't have an
#     enemy nearby to dash through.
#   • PICK UP gate uses the existing Events.pickup_claimed signal
#     subscriber (_on_pickup_claimed) — extended to also advance
#     the tutorial state when in WAIT_PICKUP. Filter on the name
#     being in RELIC_REGISTRY so chest "gold" pickups don't count.
func _arm_tutorial() -> void:
	if tutorial_label == null:
		return
	_tutorial_state = TutorialState.WAIT_MOVE
	_tutorial_distance_moved = 0.0
	_set_tutorial_text("MOVE  —  W A S D")

func _tick_tutorial(delta: float) -> void:
	match _tutorial_state:
		TutorialState.WAIT_MOVE:
			if hero != null:
				_tutorial_distance_moved += hero.velocity.length() * delta
				if _tutorial_distance_moved >= TUTORIAL_MOVE_THRESHOLD:
					_advance_tutorial(TutorialState.WAIT_ATTACK, "ATTACK  —  LEFT MOUSE")
		TutorialState.WAIT_ATTACK:
			if Input.is_action_just_pressed("attack"):
				_advance_tutorial(TutorialState.WAIT_DASH, "DASH  —  SHIFT")
		TutorialState.WAIT_DASH:
			if Input.is_action_just_pressed("dash_strike"):
				_advance_tutorial(TutorialState.WAIT_PICKUP, "PICK UP  —  Walk to glowing pedestal")
		TutorialState.WAIT_PICKUP:
			# Advance hook lives in _on_pickup_claimed extension below.
			pass
		TutorialState.DONE:
			_finalize_tutorial()
		_:
			pass

func _advance_tutorial(next: TutorialState, prompt: String) -> void:
	_tutorial_state = next
	if next == TutorialState.DONE:
		# Fade-out flow handled by _finalize_tutorial; don't show new text.
		_finalize_tutorial()
		return
	_set_tutorial_text(prompt)

func _set_tutorial_text(text: String) -> void:
	if tutorial_label == null:
		return
	tutorial_label.text = text
	# Fade in (kills any in-flight fade so back-to-back advances
	# always settle at full alpha).
	if _tutorial_fade_tween != null and _tutorial_fade_tween.is_valid():
		_tutorial_fade_tween.kill()
	tutorial_label.modulate.a = 0.0
	_tutorial_fade_tween = create_tween()
	_tutorial_fade_tween.tween_property(tutorial_label, "modulate:a", 1.0, TUTORIAL_FADE_DUR)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)

func _finalize_tutorial() -> void:
	# Move to OFF immediately so the tick loop early-outs. Fade the
	# label out over the same duration. Persist the flag.
	_tutorial_state = TutorialState.OFF
	GameState.has_completed_tutorial = true
	SaveSystem.save_now()
	if tutorial_label == null:
		return
	if _tutorial_fade_tween != null and _tutorial_fade_tween.is_valid():
		_tutorial_fade_tween.kill()
	_tutorial_fade_tween = create_tween()
	_tutorial_fade_tween.tween_property(tutorial_label, "modulate:a", 0.0, TUTORIAL_FADE_DUR)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)

# Iter 158 — format current run elapsed seconds as "m:ss" into the
# HUD label. Reads RunState.run_elapsed_seconds() (returns 0.0 when
# not in an active run, so the HUD stays at "0:00" on edge cases).
# Capped at 99:59 — runs reaching that mark exceed the design budget
# and the column-width assumption.
func _update_run_timer_label() -> void:
	if run_timer_label == null:
		return
	# Freeze the displayed time once the hero is dead so the death
	# screen sees the same value GameState.finalize_run_time captured.
	if not _alive:
		return
	var t: float = RunState.run_elapsed_seconds()
	var total_sec: int = int(t)
	var m: int = mini(99, total_sec / 60)
	var s: int = total_sec % 60
	run_timer_label.text = "%d:%02d" % [m, s]

func _process_status_fade(delta: float) -> void:
	if status_label == null:
		return
	if status_label.text != _last_status_text:
		# New text → reset fade.
		_last_status_text = status_label.text
		_status_hint_fade_t = 0.0
		if _status_fade_tween != null and _status_fade_tween.is_valid():
			_status_fade_tween.kill()
			_status_fade_tween = null
		var m: Color = status_label.modulate
		m.a = 1.0
		status_label.modulate = m
		return
	_status_hint_fade_t += delta
	# Fire the fade tween exactly once when we cross the delay threshold.
	# is_valid() check prevents stacking new tweens each frame while the
	# fade is in flight; the threshold-vs-alpha check prevents re-firing
	# after the fade settled.
	if _status_hint_fade_t > HINT_FADE_DELAY and status_label.modulate.a > HINT_FADED_ALPHA + 0.01:
		if _status_fade_tween != null and _status_fade_tween.is_valid():
			return
		_status_fade_tween = create_tween()
		_status_fade_tween.set_trans(Tween.TRANS_QUAD)
		_status_fade_tween.set_ease(Tween.EASE_OUT)
		_status_fade_tween.tween_property(status_label, "modulate:a", HINT_FADED_ALPHA, HINT_FADE_DURATION)

# iter-124: poll-and-fade for wave_label.text. Same shape as
# _process_status_fade but with no permanent "dim" state — any wave
# transition pops the label in at full alpha; after WAVE_HOLD_DURATION
# it fades to 0 over WAVE_FADE_DURATION. Net effect: wave / room-clear
# / run-complete text appears as transient banner pulses, never resting.
#
# Empty text triggers an immediate fade-out — _show_run_complete and
# similar setters that clear the label end the transient cleanly.
func _process_wave_fade(delta: float) -> void:
	if wave_label == null:
		return
	if wave_label.text != _last_wave_text:
		_last_wave_text = wave_label.text
		_wave_label_fade_t = 0.0
		if _wave_fade_tween != null and _wave_fade_tween.is_valid():
			_wave_fade_tween.kill()
			_wave_fade_tween = null
		# Empty new text → don't snap to alpha 1.0; let the existing
		# alpha continue its current course. Otherwise full opacity.
		if wave_label.text != "":
			var m: Color = wave_label.modulate
			m.a = 1.0
			wave_label.modulate = m
		return
	_wave_label_fade_t += delta
	# Fade out once hold elapses, and only if the label isn't already
	# faded. is_valid() check prevents re-firing while a fade is in
	# flight.
	if _wave_label_fade_t > WAVE_HOLD_DURATION and wave_label.modulate.a > 0.01:
		if _wave_fade_tween != null and _wave_fade_tween.is_valid():
			return
		_wave_fade_tween = create_tween()
		_wave_fade_tween.set_trans(Tween.TRANS_QUAD)
		_wave_fade_tween.set_ease(Tween.EASE_OUT)
		_wave_fade_tween.tween_property(wave_label, "modulate:a", 0.0, WAVE_FADE_DURATION)

# Rebuild the HUD relic strip from GameState.owned_relics. Called on
# _ready (so a hypothetical mid-run reload still shows the right
# badges) and on every pickup_claimed event. Clears the strip first,
# then spawns one RelicIcon per owned id. Each icon repaints itself
# in set_relic based on the tier/name pulled from RELIC_REGISTRY, so
# the strip doesn't need to know anything about visuals.
func _rebuild_relic_strip(newly_added_id: String = "") -> void:
	if relic_strip == null:
		return
	for child in relic_strip.get_children():
		child.queue_free()
	for rid in GameState.owned_relics:
		var icon: RelicIcon = RELIC_ICON_SCENE.instantiate()
		relic_strip.add_child(icon)
		# set_relic must run after add_child — the script's _ready
		# may rely on the node being in the tree (autoload access,
		# parent lookup for tooltips).
		icon.set_relic(rid)
		# Iter 156 — celebrate the new icon. When this rebuild was
		# triggered by a fresh pickup AND this icon represents that
		# pickup, snap it to bigger + gold-tinted then tween back to
		# rest size + neutral over 0.45 s. Without this beat the new
		# relic just "appears" in the strip — the PickupBanner does
		# the headline, but the HUD-strip arrival was invisible.
		if newly_added_id != "" and rid == newly_added_id:
			_animate_new_relic_icon(icon)
	# Iter 39 — refresh theme chips. Reading active themes off
	# GameState every rebuild keeps the strip in sync with the relic
	# roster (a newly-granted relic that pushes a theme over 2/4
	# owned crosses a tier instantly).
	_rebuild_theme_chips()
	# Iter 56 — sync familiars to the familiar_count modifier. A relic
	# pickup that grants familiars triggers _rebuild_relic_strip
	# (already wired by _on_pickup_claimed), and the sync method
	# spawns / despawns familiars to match the new total.
	_sync_familiars()

# Iter 157 — boss HP bar damage pulse. Fired on every HP DECREASE
# detected in _process (the boss tracking poll). Snap-then-tween
# pattern matching _pulse_label: scale 1.06 + slight red modulate
# on entry, parallel tween both back to rest over 0.22 s. Pivot is
# the boss_bar Control's center so the scale punch animates
# symmetrically. Kill any prior pulse so a rapid succession of hits
# always ends at neutral.
func _pulse_boss_bar() -> void:
	if boss_bar == null:
		return
	if _boss_hp_pulse_tween != null and _boss_hp_pulse_tween.is_valid():
		_boss_hp_pulse_tween.kill()
	boss_bar.pivot_offset = boss_bar.size * 0.5
	boss_bar.scale = Vector2(1.06, 1.06)
	boss_bar.modulate = Color(1.5, 0.85, 0.85, 1.0)  # warm red HDR
	_boss_hp_pulse_tween = create_tween().set_parallel(true)
	_boss_hp_pulse_tween.tween_property(boss_bar, "scale", Vector2.ONE, 0.22)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	_boss_hp_pulse_tween.tween_property(boss_bar, "modulate", Color(1, 1, 1, 1), 0.22)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)

# Iter 156 — new-icon arrival tween. Snaps the icon to 1.45x scale +
# gold modulate, then parallel-tweens both back to rest over 0.45 s.
# Pivot is set to icon center so the scale punch animates symmetrically.
# Same architectural shape as _pulse_label — short, sharp, kill-prior-
# tween-via-overwrite, ends at neutral so a follow-up tween from
# another system can't be left fighting an in-flight modulate.
func _animate_new_relic_icon(icon: Control) -> void:
	if icon == null:
		return
	icon.pivot_offset = icon.size * 0.5
	icon.scale = Vector2(1.45, 1.45)
	icon.modulate = Color(1.6, 1.35, 0.85, 1.0)  # HDR gold pop
	var tw: Tween = create_tween().set_parallel(true)
	tw.tween_property(icon, "scale", Vector2.ONE, 0.45)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(icon, "modulate", Color(1, 1, 1, 1), 0.45)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)

# Iter 56 — familiar sync. Reads the current familiar_count modifier
# total and ensures exactly that many Familiar nodes exist in the
# "familiars" group. Adds spawn at hero position; removes excess (in
# case of a future relic that REMOVES a familiar). Orbit phase is
# distributed evenly so multiple familiars spread out around the hero.
func _sync_familiars() -> void:
	var target_count: int = GameState.modifier_total("familiar_count", 0)
	var existing: Array = get_tree().get_nodes_in_group("familiars")
	# Spawn missing.
	while existing.size() < target_count:
		var fam: Node2D = FAMILIAR_SCENE.instantiate() as Node2D
		# Distribute orbit phases so 2 familiars are on opposite sides,
		# 3 are at 120° spacing, etc.
		fam.orbit_phase = (TAU / float(max(1, target_count))) * float(existing.size())
		fam.global_position = hero.global_position if is_instance_valid(hero) else Vector2(640, 384)
		add_child(fam)
		existing = get_tree().get_nodes_in_group("familiars")
	# Despawn excess (rare — only if a future de-grant relic ships).
	while existing.size() > target_count:
		var f: Node = existing.pop_back()
		if is_instance_valid(f):
			f.queue_free()

# Iter 39 — theme chip strip builder. Iterates ALL 5 themes (so the
# player sees pre-resonance progress, not just active themes once they
# cross 2) and emits one Panel chip per theme. Each chip surfaces:
#   • theme-colored border + dim fill (alpha gated by tier — 0.4 below
#     resonance, 0.6 at resonance, ascendance gets a faint outer glow)
#   • letterspaced theme name in cream-gold
#   • tier indicator row: "—" (below resonance), "◆◆" (resonance),
#     "◆◆◆◆" (ascendance)
#   • count badge in top-right corner showing exact owned (e.g. "2/4")
# Iter 74 — replaces the iter-39 plain-Label chip with a proper Control
# subtree so the strip reads as visual status, not text. Also caches
# previous tier in _theme_prev_tiers — when a theme's tier INCREASES
# on rebuild, the chip plays a brief scale-up + glow flash to signal
# "you just unlocked this." The strip lives in the same UI CanvasLayer
# so it doesn't move with the world camera.
func _rebuild_theme_chips() -> void:
	# iter-125 redesign — replaced the iter-74 standalone theme_chip_strip
	# (108×54 pill chips with name label + tier dots + count badge) with
	# small 22×22 inline diamond glyphs APPENDED INTO the relic_strip
	# itself. The HUD becomes a single unified row:
	#   [HP hearts row] / [relic icons … theme glyphs]
	# Detail that used to live in the chip's text (BLOOD / 1/4 / tier)
	# now lives in the hover tooltip; the resting visual is a single
	# colored diamond that pulses subtly at Resonance and gains a halo
	# at Ascendance.
	#
	# Free any orphaned legacy theme_chip_strip (iter-74 may have built
	# one before this iter; sweep it on first rebuild so the canvas
	# isn't left with dead nodes).
	if theme_chip_strip != null and is_instance_valid(theme_chip_strip):
		theme_chip_strip.queue_free()
		theme_chip_strip = null
	if relic_strip == null:
		return
	# The relic icons just got placed by _rebuild_relic_strip's parent
	# loop above — we don't touch them; we just append our glyphs at
	# the end of the HBoxContainer. The next pickup_claimed rebuild
	# will clear the whole strip and re-add both layers, keeping things
	# in sync.
	_hide_theme_tooltip()
	var themes_in_order: Array = ["storm", "flame", "blood", "vow", "shadow"]
	for theme in themes_in_order:
		var owned: int = GameState.theme_count(theme)
		var tier: int = GameState.theme_tier(theme)
		if owned <= 0:
			_theme_prev_tiers[theme] = tier
			continue
		var prev_tier: int = int(_theme_prev_tiers.get(theme, 0))
		var tier_up: bool = tier > prev_tier
		_theme_prev_tiers[theme] = tier
		var glyph: Control = _build_theme_chip(theme, owned, tier)
		relic_strip.add_child(glyph)
		if tier_up and tier >= 1:
			_play_theme_chip_tier_flash(glyph)

# Iter 125 — Build a single theme glyph (replaces the iter-74 pill).
# Returns a 24×24 Control hosting:
#   • Shadow Polygon2D (diamond, dark, offset +1/+1.5)
#   • Diamond Polygon2D in theme color — alpha 0.50 below Resonance,
#     1.0 at Resonance, brighter still at Ascendance
#   • Outline Line2D in near-black for crisp silhouette
#   • Ascendance: pulsing outer halo Polygon2D underneath
#   • Resonance: gentle scale-loop pulse on the root
# Hover wiring is identical to the pre-iter-125 chip so the existing
# _on_theme_chip_hover tooltip code keeps working.
const THEME_GLYPH_SIZE: float = 24.0
const THEME_GLYPH_RADIUS: float = 6.5

func _build_theme_chip(theme: String, owned: int, tier: int) -> Control:
	# `owned` is the tooltip-relevant count; the glyph itself only uses
	# tier for visual variation. owned still flows into the hover tip via
	# the existing _on_theme_chip_hover code (which re-reads GameState).
	var _unused_count: int = owned
	var col: Color = ThemePalette.color_for(theme)
	var root: Control = Control.new()
	root.name = "Glyph_" + theme
	root.custom_minimum_size = Vector2(THEME_GLYPH_SIZE, THEME_GLYPH_SIZE)
	root.size = Vector2(THEME_GLYPH_SIZE, THEME_GLYPH_SIZE)
	root.mouse_filter = Control.MOUSE_FILTER_STOP
	var center: Vector2 = Vector2(THEME_GLYPH_SIZE * 0.5, THEME_GLYPH_SIZE * 0.5)
	root.pivot_offset = center
	var r: float = THEME_GLYPH_RADIUS
	var diamond_pts: PackedVector2Array = PackedVector2Array([
		Vector2(0, -r), Vector2(r, 0), Vector2(0, r), Vector2(-r, 0),
	])
	# Ascendance — pulsing outer halo. Drawn first so it sits under the
	# diamond. Halo radius 1.8× core for a clear "aura" read.
	if tier >= 2:
		var halo: Polygon2D = Polygon2D.new()
		var hr: float = r * 1.8
		halo.polygon = PackedVector2Array([
			Vector2(0, -hr), Vector2(hr, 0), Vector2(0, hr), Vector2(-hr, 0),
		])
		halo.color = Color(col.r, col.g, col.b, 0.40)
		halo.position = center
		halo.name = "Halo"
		root.add_child(halo)
		var tw_halo: Tween = create_tween()
		tw_halo.set_loops()
		tw_halo.tween_property(halo, "modulate:a", 1.0, 0.85)\
			.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		tw_halo.tween_property(halo, "modulate:a", 0.40, 0.85)\
			.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	# Shadow — same diamond shape offset down-right.
	var shadow: Polygon2D = Polygon2D.new()
	shadow.polygon = diamond_pts
	shadow.color = Color(0, 0, 0, 0.55)
	shadow.position = center + Vector2(1.0, 1.5)
	root.add_child(shadow)
	# Core diamond — alpha encodes tier.
	var diamond: Polygon2D = Polygon2D.new()
	diamond.polygon = diamond_pts
	var fill_alpha: float = 0.50
	if tier >= 1:
		fill_alpha = 1.0
	diamond.color = Color(col.r, col.g, col.b, fill_alpha)
	diamond.position = center
	diamond.name = "Diamond"
	root.add_child(diamond)
	# Crisp outline so the silhouette holds against torch sparks.
	var outline: Line2D = Line2D.new()
	var ol_pts: PackedVector2Array = PackedVector2Array()
	for p in diamond_pts:
		ol_pts.append(p)
	ol_pts.append(diamond_pts[0])  # close the loop
	outline.points = ol_pts
	outline.width = 1.0
	outline.default_color = Color(0.05, 0.04, 0.07, 0.95)
	outline.antialiased = true
	outline.position = center
	root.add_child(outline)
	# Resonance pulse — subtle scale-loop. Lower amplitude than the
	# iter-74 chip (1.06 vs 1.04) since the glyph is smaller and the
	# pulse needs to read at this scale. Pivot already set on root.
	if tier == 1:
		var tw_pulse: Tween = create_tween()
		tw_pulse.set_loops()
		tw_pulse.tween_property(root, "scale", Vector2(1.08, 1.08), 0.9)\
			.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		tw_pulse.tween_property(root, "scale", Vector2(1.0, 1.0), 0.9)\
			.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	# Hover tooltip — exact same wiring as iter-74. _on_theme_chip_hover
	# rebuilds tooltip text from theme + GameState.theme_count, so the
	# tooltip still shows "BLOOD · 1/4 toward Resonance" with no glyph-
	# side data.
	root.mouse_entered.connect(_on_theme_chip_hover.bind(theme, root))
	root.mouse_exited.connect(_on_theme_chip_unhover)
	return root

# Iter 74 — letter-space a theme name for HUD display. Godot 4 Label
# has no native letter-spacing, so we hand-insert thin spaces between
# characters. "storm" → "S T O R M". Cached as a 5-entry lookup since
# the theme set is fixed.
func _letterspace_theme(theme: String) -> String:
	var upper: String = str(theme).to_upper()
	var out: PackedStringArray = []
	for i in upper.length():
		out.append(upper[i])
	return " ".join(out)

# Iter 74 — tier-up flash. Fires when a theme's tier increased on the
# current _rebuild_theme_chips pass. Brief scale-up (1.0 → 1.3 → 1.0
# over 0.5s) signals "you just unlocked this." Played on top of any
# resonance pulse — the one-shot tween here doesn't conflict with the
# looping pulse since they target the same property but the one-shot
# completes before the pulse's first cycle interferes.
func _play_theme_chip_tier_flash(chip: Control) -> void:
	if chip == null:
		return
	# Start small so the tween's tween_property "ramps in" from the
	# default 1.0; we override the start point explicitly so the
	# tier-up moment reads as a deliberate burst.
	chip.scale = Vector2(1.0, 1.0)
	var tw: Tween = create_tween()
	tw.tween_property(chip, "scale", Vector2(1.3, 1.3), 0.18).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(chip, "scale", Vector2(1.0, 1.0), 0.32).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_IN)

# Iter 48 — theme chip hover handler. Shows a tooltip Panel near the
# hovered chip with the theme name, owned count, and the resonance
# + ascendance bonus descriptions (ascendance grayed if not yet
# unlocked). Single tooltip reused across hovers — _theme_tooltip
# holds the panel ref, repositioned + retextd per hover. Iter 74 —
# tooltip bg now picks up a subtle theme tint so cyan-STORM and
# crimson-BLOOD tooltips look distinct at a glance, not just the
# border. Color helpers consolidated into ThemePalette.color_for.
func _on_theme_chip_hover(theme: String, anchor_label: Control) -> void:
	_hide_theme_tooltip()
	var info: Dictionary = THEME_TOOLTIP_DESC.get(theme, {})
	if info.is_empty():
		return
	var owned_count: int = GameState.theme_count(theme)
	var tier: int = GameState.theme_tier(theme)
	var ui: CanvasLayer = $UI as CanvasLayer
	var col: Color = ThemePalette.color_for(theme)
	var panel: PanelContainer = PanelContainer.new()
	var sb: StyleBoxFlat = StyleBoxFlat.new()
	# Tint the dark base background with a tiny lean toward the theme
	# color — 0.04 of the theme's RGB folded over the base 0.06 ink.
	# Keeps the tooltip readable (still very dark) while STORM tooltips
	# read cooler than FLAME tooltips at a glance.
	sb.bg_color = Color(
		0.06 + col.r * 0.04,
		0.05 + col.g * 0.04,
		0.09 + col.b * 0.04,
		0.96
	)
	sb.border_color = col
	sb.border_width_left = 1
	sb.border_width_top = 1
	sb.border_width_right = 1
	sb.border_width_bottom = 1
	sb.corner_radius_top_left = 4
	sb.corner_radius_top_right = 4
	sb.corner_radius_bottom_right = 4
	sb.corner_radius_bottom_left = 4
	sb.content_margin_left = 10.0
	sb.content_margin_top = 8.0
	sb.content_margin_right = 10.0
	sb.content_margin_bottom = 8.0
	panel.add_theme_stylebox_override("panel", sb)
	panel.custom_minimum_size = Vector2(220, 60)
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var box: VBoxContainer = VBoxContainer.new()
	box.add_theme_constant_override("separation", 4)
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_child(box)
	# Header — theme name + owned count.
	var hdr: Label = Label.new()
	hdr.text = "%s  ·  %d owned" % [theme.to_upper(), owned_count]
	hdr.add_theme_font_size_override("font_size", 14)
	hdr.add_theme_color_override("font_color", col)
	hdr.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.95))
	hdr.add_theme_constant_override("outline_size", 2)
	hdr.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_child(hdr)
	# Resonance line — dimmed grey if not active, full if active.
	var res_lbl: Label = Label.new()
	var res_text: String = "RESONANCE (2+):  " + str(info.get("resonance", ""))
	res_lbl.text = res_text
	res_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	res_lbl.custom_minimum_size = Vector2(200, 0)
	res_lbl.add_theme_font_size_override("font_size", 11)
	var res_color: Color = Color(0.85, 0.80, 0.66, 1) if tier >= 1 else Color(0.45, 0.43, 0.40, 1)
	res_lbl.add_theme_color_override("font_color", res_color)
	res_lbl.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.95))
	res_lbl.add_theme_constant_override("outline_size", 2)
	res_lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_child(res_lbl)
	# Ascendance line — same pattern.
	var asc_lbl: Label = Label.new()
	var asc_text: String = "ASCENDANCE (4+):  " + str(info.get("ascendance", ""))
	asc_lbl.text = asc_text
	asc_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	asc_lbl.custom_minimum_size = Vector2(200, 0)
	asc_lbl.add_theme_font_size_override("font_size", 11)
	var asc_color: Color = Color(1.0, 0.85, 0.45, 1) if tier >= 2 else Color(0.45, 0.43, 0.40, 1)
	asc_lbl.add_theme_color_override("font_color", asc_color)
	asc_lbl.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.95))
	asc_lbl.add_theme_constant_override("outline_size", 2)
	asc_lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_child(asc_lbl)
	ui.add_child(panel)
	_theme_tooltip = panel
	# Position: below the chip strip, anchored to the hovered chip's
	# left edge. Tooltip can extend right; if it would clip off the
	# screen edge we'd handle that — but the chip strip sits at top-
	# left so a 220-wide tooltip never clips at 1280-wide window.
	var chip_rect: Rect2 = anchor_label.get_global_rect()
	panel.global_position = Vector2(chip_rect.position.x, chip_rect.position.y + chip_rect.size.y + 4)

func _on_theme_chip_unhover() -> void:
	_hide_theme_tooltip()

func _hide_theme_tooltip() -> void:
	if _theme_tooltip != null and is_instance_valid(_theme_tooltip):
		_theme_tooltip.queue_free()
	_theme_tooltip = null

func _on_hero_died() -> void:
	_alive = false
	_wave_state = WaveState.DEAD
	status_label.text = ""
	wave_label.text = ""
	# Iter 158 — snapshot the run timer into GameState BEFORE the death
	# cinematic queues the death_screen overlay. SaveSystem persists
	# immediately inside finalize_run_time() so a crash mid-cinematic
	# doesn't lose the time.
	GameState.finalize_run_time()
	# Iter 22 — DO NOT reset Engine.time_scale here. The cinematic
	# triggered by hero_death_started owns the time scale for the next
	# 1.6 seconds (slow-mo to 0.25 then back to 1.0) and queues the
	# death_screen show. _on_hero_death_started runs at the same
	# moment as this handler, so the cinematic is already underway.

# Iter 22 — death cinematic. Slow-mo + camera zoom + crimson vignette
# fade + YOU DIED banner crashing in from above, then time scale
# restores and the death_screen overlay shows. All built from code
# (no scene file changes) so the sequence is one atomic addition.
# Tween pause modes are PROCESS so they keep running while time_scale
# is < 1.0 — otherwise the slow-mo would stall the tweens themselves.
func _on_hero_death_started(world_pos: Vector2) -> void:
	# iter-133: Clear previous death resources if somehow called twice
	_death_tweens.clear()
	if _death_veil_layer != null and is_instance_valid(_death_veil_layer):
		_death_veil_layer.queue_free()
		_death_veil_layer = null
	# Slow-mo: time_scale 1.0 → 0.25 over 0.4s.
	var t_time: Tween = create_tween()
	t_time.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
	t_time.tween_property(Engine, "time_scale", DEATH_TIME_SCALE_MIN, 0.4)
	_death_tweens.append(t_time)  # iter-133: track for cleanup
	# Camera punch-in to 1.4× over 0.6s. The camera lives under Hero;
	# we tween its zoom directly.
	var cam: Camera2D = $Hero/Camera2D
	if cam != null:
		var t_cam: Tween = create_tween()
		t_cam.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
		t_cam.tween_property(cam, "zoom", DEATH_CAMERA_ZOOM_END, 0.6).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		_death_tweens.append(t_cam)  # iter-133: track for cleanup
	# Build a full-screen crimson veil + banner on a fresh CanvasLayer
	# above the HUD (layer 50; HUD is 0, death_screen is 200, so we
	# sit between). Veil fades to alpha 0.72; banner crashes in from
	# offset_top=-400 to -60 with a back-ease so it overshoots.
	var veil_layer: CanvasLayer = CanvasLayer.new()
	veil_layer.layer = 50
	add_child(veil_layer)
	_death_veil_layer = veil_layer  # iter-133: track for cleanup
	var veil: ColorRect = ColorRect.new()
	veil.color = Color(0.1, 0.0, 0.0, 0.0)
	veil.anchor_right = 1.0
	veil.anchor_bottom = 1.0
	veil.mouse_filter = Control.MOUSE_FILTER_IGNORE
	veil_layer.add_child(veil)
	var t_veil: Tween = create_tween()
	t_veil.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
	t_veil.tween_property(veil, "color:a", DEATH_VEIL_FINAL_ALPHA, DEATH_VEIL_FADE_TIME)
	_death_tweens.append(t_veil)  # iter-133: track for cleanup
	var banner: Label = Label.new()
	banner.text = "YOU DIED"
	banner.add_theme_font_size_override("font_size", 96)
	banner.add_theme_color_override("font_color", Color(0.95, 0.1, 0.12))
	banner.add_theme_color_override("font_outline_color", Color(0, 0, 0))
	banner.add_theme_constant_override("outline_size", 8)
	banner.anchor_left = 0.5
	banner.anchor_right = 0.5
	banner.anchor_top = 0.3
	banner.anchor_bottom = 0.3
	banner.offset_left = -320
	banner.offset_right = 320
	banner.offset_top = -400   # off-screen above
	banner.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	veil_layer.add_child(banner)
	var t_banner: Tween = create_tween()
	t_banner.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
	t_banner.tween_interval(DEATH_BANNER_DELAY)
	t_banner.tween_property(banner, "offset_top", -60.0, 0.35).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_death_tweens.append(t_banner)  # iter-133: track for cleanup
	# Restore time_scale at 1.2s, show death_screen at 1.6s.
	var t_end: Tween = create_tween()
	t_end.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
	t_end.tween_interval(DEATH_RESTORE_AT)
	t_end.tween_property(Engine, "time_scale", 1.0, DEATH_SHOW_SCREEN_AT - DEATH_RESTORE_AT)
	t_end.tween_callback(func() -> void:
		if _death_screen != null and _death_screen.has_method("show_death"):
			_death_screen.show_death(_kills)
	)
	_death_tweens.append(t_end)  # iter-133: track for cleanup
	# world_pos param reserved for future use (e.g. spawn an arrow
	# pointing at the death site from the death_screen). Silences the
	# UNUSED_PARAMETER warning.
	var _unused: Vector2 = world_pos

# iter-133: Cleanup function to prevent resource accumulation across retries.
# Without this, death tweens + ambient particles survive scene reload and
# compound: 5+ tweens and 60+ particles per death → 2 FPS after a few retries.
func _cleanup_before_scene_change() -> void:
	# Kill all tracked death tweens
	for tween in _death_tweens:
		if tween != null and tween.is_valid():
			tween.kill()
	_death_tweens.clear()
	# Free the death veil layer (banner + veil ColorRect)
	if _death_veil_layer != null and is_instance_valid(_death_veil_layer):
		_death_veil_layer.queue_free()
		_death_veil_layer = null
	# Stop ALL CPUParticles2D in the scene tree — ambient motes, death bursts,
	# footstep dust, etc. They're re-created on scene load anyway.
	for node in get_tree().get_nodes_in_group("particles"):
		if node is CPUParticles2D:
			node.emitting = false
	# Also catch particles not in the group (ambient motes aren't grouped)
	for child in get_children():
		if child is CPUParticles2D:
			child.emitting = false
			child.queue_free()
	# Reset engine time scale in case death cinematic left it slow
	Engine.time_scale = 1.0

func _on_death_retry() -> void:
	# Retry = restart THIS floor from room 0. Easier UX than dropping
	# the player into the room they died on with no preamble.
	# iter-112: fade to black before reload — matches the menu→dungeon
	# transition fade, so the retry cycles through black instead of
	# snapping the death screen out and the room 1 in.
	_cleanup_before_scene_change()  # iter-133: prevent resource accumulation
	GameState.start_dungeon_run()
	RunState.start_floor()
	await ScreenFlash.fade_to_black(0.30)
	get_tree().reload_current_scene()

# Iter 16 — run-complete sequence. Replaces the previous "claim the
# pedestal, then ESC to leave" flow (which left the player staring at
# a stale 'walk to pedestal' status_label with no celebratory beat).
# Now: a brief gold banner + summary, then auto-return to menu after
# 2.5s so the run actually FEELS like it ended.
const RUN_COMPLETE_DELAY := 2.5
func _show_run_complete() -> void:
	wave_label.text = "RUN COMPLETE"
	# Iter 162 — capture the run time for the victory screen BEFORE
	# showing it (mirror of iter-158's hero-death capture path).
	# Without this, GameState.last_run_time would still hold the
	# previous run's value when victory screen reads it.
	GameState.finalize_run_time()
	# Big floating banner so the moment registers even if the player's
	# eyes are still tracking the hero, not the HUD corner.
	var banner: DamageNumber = DamageNumber.spawn(
		hero.global_position + Vector2(0, -96),
		"FLOOR COMPLETE",
		Color(1, 0.85, 0.45),
	)
	add_child(banner)
	Engine.time_scale = 1.0
	# Iter 162 — proper victory screen instead of fade-to-menu. Reuses
	# the death_screen scene with a show_victory variant that swaps
	# title text/color + REACHED line to celebratory copy. Buttons
	# still emit retry_pressed / menu_pressed (same handlers as death).
	#
	# Short delay so the FLOOR COMPLETE floater + FloorClearBurst BIG
	# cascade have time to land before the screen takes over.
	var t := get_tree().create_timer(RUN_COMPLETE_DELAY)
	t.timeout.connect(_on_victory_show)

# Iter 162 — bridge from the RUN_COMPLETE_DELAY timer to the
# victory-screen reveal. Same instance as the death screen (single
# overlay), just a different display call.
func _on_victory_show() -> void:
	if _death_screen != null and _death_screen.has_method("show_victory"):
		_death_screen.show_victory(_kills)

func _on_death_to_menu() -> void:
	# Iter 12: hamlet removed. ESC / MENU button returns to the main
	# menu — the menu's BEGIN re-seeds RunState.start_floor() so we
	# end_floor here defensively rather than relying on the menu side.
	# iter-112: fade to black before scene change so the dungeon → menu
	# transition matches the menu → dungeon fade (symmetric cinematic).
	_cleanup_before_scene_change()  # iter-133: prevent resource accumulation
	RunState.end_floor()
	await ScreenFlash.fade_to_black(0.30)
	get_tree().change_scene_to_file("res://scenes/main_menu.tscn")

func _unhandled_input(ev: InputEvent) -> void:
	if not _alive and ev is InputEventKey and ev.pressed:
		if ev.physical_keycode == KEY_R:
			_on_death_retry()
		elif ev.physical_keycode == KEY_ESCAPE:
			_on_death_to_menu()
	# ESC return after final-room pedestal claim too.
	if _wave_state == WaveState.COMPLETE and _alive and ev is InputEventKey and ev.pressed:
		if ev.physical_keycode == KEY_ESCAPE:
			_on_death_to_menu()
	# Mid-run ESC → mount pause overlay. Gated on _alive + not-complete
	# so the existing death-screen and run-complete ESC paths above
	# still win. Overlay is a CanvasLayer with PROCESS_MODE_WHEN_PAUSED;
	# once mounted, it pauses the tree and owns ESC itself (its own
	# _unhandled_input runs while ours is frozen). Multi-mount guard:
	# bail if a pause overlay already lives on us.
	if _alive and _wave_state != WaveState.COMPLETE and ev is InputEventKey and ev.pressed:
		if ev.physical_keycode == KEY_ESCAPE and not has_node("PauseScreen"):
			var pause: CanvasLayer = PAUSE_SCREEN_SCENE.instantiate()
			pause.name = "PauseScreen"
			add_child(pause)
			get_viewport().set_input_as_handled()

# Iter 22 — center-screen wave banner. Spawns a one-shot Label on a
# fresh CanvasLayer above the HUD, tweens it through
#   ALPHA: 0 → 1 (0.18s in) → hold for WAVE_BANNER_HOLD → fade to 0
#   SCALE: 1.4 → 1.0 (0.18s in) — settles from "crash in" to neutral
# then queue_frees both the layer and label. Lives outside main.tscn
# so adding wave 4/5/6 doesn't need scene edits, and the corner
# wave_label keeps its persistent role.
func _show_wave_banner(wave_idx_1based: int, wave_total: int) -> void:
	var layer: CanvasLayer = CanvasLayer.new()
	layer.layer = 40   # above HUD (0), below death veil (50)
	add_child(layer)
	var lbl: Label = Label.new()
	lbl.text = "WAVE %d / %d" % [wave_idx_1based, wave_total]
	lbl.add_theme_font_size_override("font_size", 56)
	lbl.add_theme_color_override("font_color", Color(1, 0.92, 0.7, 1))
	lbl.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.95))
	lbl.add_theme_constant_override("outline_size", 6)
	lbl.anchor_left = 0.5
	lbl.anchor_right = 0.5
	lbl.anchor_top = 0.42
	lbl.anchor_bottom = 0.42
	lbl.offset_left = -260
	lbl.offset_right = 260
	lbl.offset_top = -36
	lbl.offset_bottom = 36
	lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lbl.pivot_offset = Vector2(260, 36)
	lbl.modulate = Color(1, 1, 1, 0)
	lbl.scale = Vector2(1.4, 1.4)
	layer.add_child(lbl)
	# Punch-in: alpha + scale in parallel, then hold, then fade.
	var tw: Tween = create_tween().set_parallel(true)
	tw.tween_property(lbl, "modulate:a", 1.0, 0.18).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(lbl, "scale", Vector2.ONE, 0.18).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	var tw2: Tween = create_tween()
	tw2.tween_interval(0.18 + WAVE_BANNER_HOLD)
	tw2.tween_property(lbl, "modulate:a", 0.0, WAVE_BANNER_DURATION - 0.18 - WAVE_BANNER_HOLD)
	tw2.tween_callback(layer.queue_free)

# Iter 22 — boss intro banner. Bigger + redder than the wave banner;
# also longer-lived. Pairs with the FX.shake(BOSS_INTRO_SHAKE_AMP)
# call in _spawn_enemy_type to mark "this is something serious."
func _show_boss_intro_banner(display_name: String) -> void:
	var layer: CanvasLayer = CanvasLayer.new()
	layer.layer = 40
	add_child(layer)
	var lbl: Label = Label.new()
	lbl.text = display_name.to_upper()
	lbl.add_theme_font_size_override("font_size", 72)
	lbl.add_theme_color_override("font_color", Color(1, 0.35, 0.35, 1))
	lbl.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.95))
	lbl.add_theme_constant_override("outline_size", 7)
	lbl.anchor_left = 0.5
	lbl.anchor_right = 0.5
	lbl.anchor_top = 0.36
	lbl.anchor_bottom = 0.36
	lbl.offset_left = -360
	lbl.offset_right = 360
	lbl.offset_top = -48
	lbl.offset_bottom = 48
	lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lbl.pivot_offset = Vector2(360, 48)
	lbl.modulate = Color(1, 1, 1, 0)
	lbl.scale = Vector2(1.6, 1.6)
	layer.add_child(lbl)
	var tw: Tween = create_tween().set_parallel(true)
	tw.tween_property(lbl, "modulate:a", 1.0, 0.25).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(lbl, "scale", Vector2.ONE, 0.25).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	var tw2: Tween = create_tween()
	tw2.tween_interval(0.95)
	tw2.tween_property(lbl, "modulate:a", 0.0, 0.5)
	tw2.tween_callback(layer.queue_free)

# Iter 37 — boss phase-change handler. Fires when a boss crosses below
# its phase2_hp_threshold (default 50%) for the first time. Pairs the
# stat-mutation done by enemy._trigger_phase_2 with cinematic feedback:
# a red "<NAME> · ENRAGED" banner, a brief screen flash, and a camera
# punch. Connects ONCE per boss (the signal can only fire once because
# enemy.gd guards on _phase == 1).
func _on_boss_phase_changed(phase: int, boss_display_name: String) -> void:
	# Iter 55 — phase 3 banner branch. Phase 3 reads as "DESPERATE"
	# (vs phase 2's "ENRAGED") — deeper red tint, bigger banner,
	# heavier camera + screen flash. Different label text so the
	# player learns "phase 3 is the danger spike."
	if phase == 2:
		_show_boss_phase_banner(boss_display_name, "ENRAGED",
			Color(1.0, 0.55, 0.45, 1.0), 44, 7.0,
			Color(0.85, 0.18, 0.18, 0.32))
	elif phase == 3:
		_show_boss_phase_banner(boss_display_name, "DESPERATE",
			Color(1.0, 0.32, 0.30, 1.0), 52, 11.0,
			Color(0.95, 0.10, 0.10, 0.46))
		# Iter 57 — phase 3 achievement.
		GameState.unlock_achievement("phase_3_survivor")

# Iter 37 — boss phase 2 banner. Smaller + redder than the boss intro
# banner (this is a mid-fight beat, not an opener). Drops in from the
# top, holds 1.2s, fades.
# Iter 57 — achievement unlock popup. Inline implementation replaced
# by AchievementPopup (scenes/achievement_popup.tscn + script). Toast
# slides in from the top-right corner with a queue so back-to-back
# unlocks (boss kill triggering 3 at once) play sequentially rather
# than overlapping. `self` is the host per iter 61 convention.
func _on_achievement_unlocked(id: String) -> void:
	if not GameState.ACHIEVEMENTS.has(id):
		return
	var info: Dictionary = GameState.ACHIEVEMENTS[id]
	var nm: String = str(info.get("name", id))
	var desc: String = str(info.get("description", ""))
	AchievementPopup.spawn(self, nm, desc)

# Iter 55 — banner driver. Phase 2 and phase 3 share this with
# different label / color / size / shake-intensity / flash-color
# parameters so the player reads "phase 3 is the more dangerous state"
# via the visual escalation.
func _show_boss_phase_banner(
	boss_display_name: String,
	subtitle: String = "ENRAGED",
	color: Color = Color(1.0, 0.55, 0.45, 1.0),
	font_size: int = 44,
	shake_amp: float = 7.0,
	flash_color: Color = Color(0.85, 0.18, 0.18, 0.32),
) -> void:
	# Camera shake + screen flash for impact.
	if has_node("/root/FX"):
		var fx = get_node("/root/FX")
		if fx.has_method("shake"):
			fx.shake(shake_amp, 0.25)
	if has_node("/root/ScreenFlash"):
		var sf = get_node("/root/ScreenFlash")
		if sf.has_method("flash"):
			sf.flash(flash_color, 0.4)
	var layer: CanvasLayer = CanvasLayer.new()
	layer.layer = 40
	add_child(layer)
	var lbl: Label = Label.new()
	lbl.text = "%s · %s" % [boss_display_name, subtitle]
	lbl.add_theme_font_size_override("font_size", font_size)
	lbl.add_theme_color_override("font_color", color)
	lbl.add_theme_color_override("font_outline_color", Color(0.15, 0, 0, 0.95))
	lbl.add_theme_constant_override("outline_size", 6)
	lbl.anchor_left = 0.5
	lbl.anchor_right = 0.5
	lbl.anchor_top = 0.25
	lbl.anchor_bottom = 0.25
	lbl.offset_left = -360
	lbl.offset_right = 360
	lbl.offset_top = -36
	lbl.offset_bottom = 36
	lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lbl.pivot_offset = Vector2(360, 36)
	lbl.modulate = Color(1, 1, 1, 0)
	lbl.scale = Vector2(1.4, 1.4)
	layer.add_child(lbl)
	var tw: Tween = create_tween().set_parallel(true)
	tw.tween_property(lbl, "modulate:a", 1.0, 0.20).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(lbl, "scale", Vector2.ONE, 0.20).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	var tw2: Tween = create_tween()
	tw2.tween_interval(1.2)
	tw2.tween_property(lbl, "modulate:a", 0.0, 0.4)
	tw2.tween_callback(layer.queue_free)
