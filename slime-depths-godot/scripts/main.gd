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
const DASH_HIT_STOP_SCALE  := 0.10
const DASH_HIT_STOP_TIME   := 0.07
const DASH_IMPACT_SCENE: PackedScene = preload("res://scenes/fx/dash_impact.tscn")
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
@onready var status_label: Label = $UI/StatusLabel
@onready var kills_label: Label = $UI/KillsLabel
@onready var wave_label: Label = $UI/WaveLabel
@onready var room_label: Label = $UI/RoomLabel
@onready var boss_bar: VBoxContainer = $UI/BossBar
@onready var boss_name: Label = $UI/BossBar/Name
@onready var boss_hp_bar: ProgressBar = $UI/BossBar/Bar
# HUD relic strip — horizontal row of small badges, one per owned
# relic. Populated by _rebuild_relic_strip on _ready and refreshed
# whenever Events.pickup_claimed fires (a new relic was just granted).
@onready var relic_strip: HBoxContainer = $UI/RelicStrip

# Iter 39 — theme chip strip. Code-built HBoxContainer mounted on the
# UI CanvasLayer just below the relic strip. Each chip is a Label
# colored per theme with a "◆" glyph count for tier (◆ = resonance,
# ◆◆ = ascendance). Built lazily on first refresh + repopulated by
# _rebuild_theme_chips on each relic grant.
var theme_chip_strip: HBoxContainer = null

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
		"ascendance": "each parry restores 1 HP",
	},
	"shadow": {
		"resonance": "+0.08s dodge i-frames",
		"ascendance": "dodge fires a 60-px shockwave (1 dmg)",
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
var _hit_stop_timer := 0.0
var _death_screen: Node = null
# Iter 15 — count of enemies queued by _start_wave that haven't
# actually spawned yet (timer-deferred). The wave-clear check in
# _process needs to know about these so the staggered spawn window
# doesn't trigger false-positive "all enemies dead" between the first
# kill and the last spawn.
var _pending_spawns := 0
# Iter 16 — guard against pickup_claimed firing twice on the same room
# (e.g. a hypothetical double-event from a relic with multiple effects).
# Set true the first time a pedestal grants in this room; reset on
# scene reload. Drives the door/run-complete branch.
var _room_pickup_resolved := false
# Iter 17 — boss tracking. Set on spawn when an enemy_type with
# is_boss=true is instantiated. _process polls this each frame to
# refresh the HP bar. Cleared (instance invalid) when the boss
# dies, hiding the bar.
var _boss_ref: Enemy = null

func _ready() -> void:
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
	_death_screen = DEATH_SCREEN_SCENE.instantiate()
	add_child(_death_screen)
	_death_screen.retry_pressed.connect(_on_death_retry)
	_death_screen.menu_pressed.connect(_on_death_to_menu)
	_update_hp(hero.hp)
	_update_kills()
	_update_room_label()
	_rebuild_relic_strip()
	status_label.text = "LMB swing · RMB blast · SPACE dodge · Q parry · SHIFT dash"
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
	if _hit_stop_timer > 0.0:
		_hit_stop_timer -= 1.0 / 60.0
		if _hit_stop_timer <= 0.0:
			Engine.time_scale = 1.0
	# Iter 17 — boss HP bar refresh + hide on death. Polling avoids
	# adding an hp_changed signal to every enemy just to drive one UI.
	if _boss_ref != null:
		if is_instance_valid(_boss_ref) and _boss_ref.hp > 0:
			boss_hp_bar.value = float(_boss_ref.hp)
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
	# 8 px past the wall's outer edge in all directions, with vertex-color
	# fade from solid-center to transparent-edge. Reads as "the wall casts
	# a shadow on the floor" and grounds the wall to the room — previously
	# the wall polygon looked like it was floating on the tile grid.
	# Added BEFORE the wall body so it draws underneath.
	var shadow_extra: float = 8.0
	var shadow: Polygon2D = Polygon2D.new()
	shadow.polygon = PackedVector2Array([
		Vector2(-w - shadow_extra, -h - shadow_extra),
		Vector2(w + shadow_extra, -h - shadow_extra),
		Vector2(w + shadow_extra, h + shadow_extra),
		Vector2(-w - shadow_extra, h + shadow_extra),
	])
	var sh_edge: Color = Color(0, 0, 0, 0.0)
	var sh_core: Color = Color(0, 0, 0, 0.55)
	# Per-vertex colors: corners transparent, would-ideally be a circle
	# but quad-with-edge-fade reads acceptably as ambient occlusion at
	# this scale. Top corners slightly less dark (light angle assumes
	# overhead-ish), bottom corners full so the bottom shadow lip wins.
	shadow.vertex_colors = PackedColorArray([sh_edge, sh_edge, sh_core, sh_core])
	shadow.z_index = -1
	body.add_child(shadow)
	# Visible body — dark stone polygon at the same position as the
	# collider. Rounded corners via Line2D outline since Polygon2D
	# doesn't natively support corner radii.
	var poly: Polygon2D = Polygon2D.new()
	poly.polygon = PackedVector2Array([
		Vector2(-w, -h), Vector2(w, -h), Vector2(w, h), Vector2(-w, h),
	])
	poly.color = Color(0.18, 0.16, 0.22, 1)
	body.add_child(poly)
	# Lighter top-edge bevel — a 4-px Line2D across the top of the
	# wall, slightly warm grey. Sells "this is a stone block with
	# light catching its top edge."
	var top_edge: Line2D = Line2D.new()
	top_edge.points = PackedVector2Array([
		Vector2(-w + 2, -h), Vector2(w - 2, -h),
	])
	top_edge.width = 3.0
	top_edge.default_color = Color(0.42, 0.36, 0.30, 1)
	top_edge.antialiased = true
	body.add_child(top_edge)
	# Bottom shadow strip — dark band along the wall's bottom edge,
	# offset down 2 px so it reads as a contact shadow on the floor.
	var bot_shadow: Line2D = Line2D.new()
	bot_shadow.points = PackedVector2Array([
		Vector2(-w + 4, h + 2), Vector2(w - 4, h + 2),
	])
	bot_shadow.width = 4.0
	bot_shadow.default_color = Color(0, 0, 0, 0.45)
	bot_shadow.antialiased = true
	body.add_child(bot_shadow)
	return body

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
		_spawn_decor_at(pos)
		placed += 1
	# Iter 52 — second pass: larger "rubble pile" clusters scattered
	# around the room. Each pile is 4 decor pieces clustered within
	# ~14 px so they read as a single debris pile rather than 4 stray
	# stains. Spawn ~5 piles per room (independent of decor_density)
	# so even low-decor rooms get the heavier visual anchors.
	# Same collision rules as the single-piece scatter — avoid hero
	# spawn / enemy spawn / pillar / chest / center.
	var pile_count: int = 5
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
		# Tight cluster of 4 pieces.
		for _i in range(4):
			var off: Vector2 = Vector2(randf_range(-14, 14), randf_range(-10, 10))
			_spawn_decor_at(pos + off)
		piles_placed += 1
	# Iter 52 — stone speckle highlights. Subtle bright pips scattered
	# across the floor at z=-2 so they sit BELOW regular decor but
	# ABOVE the biome floor wash. Reads as "granite flecks / weathered
	# stone shine" — breaks up the otherwise-uniform floor backdrop
	# noticeably better than the larger decor alone. Density is fixed
	# (28 per room) since these are smaller / cheaper than full decor.
	for _i in range(28):
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
	var dark: Color = Color(0, 0, 0, 0.45)
	var clear: Color = Color(0, 0, 0, 0.0)
	# Vignette thickness inward (px) per side. Larger = more dramatic
	# but eats more play-area readability.
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

# Iter 51 — ambient dust motes. Sparse drifting particles across the
# play area for atmospheric depth. Slow upward drift, low alpha, brief
# lifetime so the dust never accumulates visibly — reads as "the air
# is moving slightly." Color picked from biome warm/cool to harmonize
# with the room's existing tint.
func _spawn_ambient_motes() -> void:
	var motes: CPUParticles2D = CPUParticles2D.new()
	motes.name = "AmbientMotes"
	motes.amount = 32
	motes.lifetime = 6.0
	motes.emitting = true
	motes.preprocess = 3.0   # fill the field before _ready completes
	# Emission rect covers the playable area; particles spawn anywhere
	# inside the room boundaries.
	motes.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
	motes.emission_rect_extents = Vector2(560.0, 290.0)
	motes.position = Vector2(640, 384)
	# Slow upward drift with random spread.
	motes.direction = Vector2(0, -1)
	motes.spread = 60.0
	motes.initial_velocity_min = 6.0
	motes.initial_velocity_max = 14.0
	motes.gravity = Vector2.ZERO
	motes.damping_min = 0.2
	motes.damping_max = 0.6
	# Tiny scale, low alpha.
	motes.scale_amount_min = 0.6
	motes.scale_amount_max = 1.4
	# Per-biome tint — match the wash so dust harmonizes with the room.
	var tint: Color = Color(0.85, 0.85, 0.85, 0.22)
	if _room != null:
		match _room.biome:
			"ember":
				tint = Color(1.0, 0.78, 0.5, 0.22)
			"sanctuary":
				tint = Color(0.78, 0.85, 1.0, 0.22)
			"ossuary":
				tint = Color(0.95, 0.92, 0.78, 0.22)
			_:
				tint = Color(0.85, 0.85, 0.85, 0.22)
	# Color ramp — fades in/out so motes appear from nothing + vanish.
	var ramp: Gradient = Gradient.new()
	ramp.offsets = PackedFloat32Array([0.0, 0.2, 0.8, 1.0])
	ramp.colors = PackedColorArray([
		Color(tint.r, tint.g, tint.b, 0.0),
		tint,
		tint,
		Color(tint.r, tint.g, tint.b, 0.0),
	])
	motes.color_ramp = ramp
	motes.z_index = 5   # above floor/decor, below hero/enemies
	add_child(motes)

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

# Iter 18 — entry banner. The room_label sits permanently in the HUD
# but goes from FULL-ATTENTION (scale 1.6, full opacity, centered)
# down to a small persistent corner-style label over 2 seconds. The
# initial big state catches the eye as the scene loads; the settled
# state stays for orientation.
const ROOM_ENTRY_DURATION := 2.0
const ROOM_ENTRY_START_SCALE := 1.7
const ROOM_ENTRY_END_SCALE := 1.0
func _animate_room_entry() -> void:
	if room_label == null:
		return
	room_label.pivot_offset = room_label.size / 2.0
	room_label.scale = Vector2(ROOM_ENTRY_START_SCALE, ROOM_ENTRY_START_SCALE)
	room_label.modulate = Color(1, 1, 1, 1)
	var tween := create_tween().set_parallel(true)
	tween.tween_property(
		room_label, "scale",
		Vector2(ROOM_ENTRY_END_SCALE, ROOM_ENTRY_END_SCALE),
		ROOM_ENTRY_DURATION,
	).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.tween_property(
		room_label, "modulate:a",
		0.75,
		ROOM_ENTRY_DURATION,
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
	for i in range(spawn_queue.size()):
		# Small jitter on top of the base stagger so the rhythm doesn't
		# feel metronomic. Tween-friendly Bind so each closure captures
		# its own type_id (vs all closures seeing the last one).
		var delay: float = i * SPAWN_STAGGER + randf_range(0.0, 0.08)
		var t: SceneTreeTimer = get_tree().create_timer(delay)
		var captured: String = spawn_queue[i]
		t.timeout.connect(func (): _spawn_enemy_type(captured))

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
	if _wave_index + 1 < _waves.size():
		wave_label.text = "WAVE %d CLEAR  ·  next in %.1fs" % [_wave_index + 1, WAVE_CLEAR_PAUSE]
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
		status_label.text = "Choose a relic · walk near and press [E]"
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
	enemy.global_position = _spawn_points[randi() % _spawn_points.size()]
	enemy.died_at.connect(_on_enemy_died)
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
	# Order is fixed (hp / dodge / atk) so the LEFT-MOST shrine is
	# always HP — players can rely on visual position to read the
	# offer rather than having to walk up to each one.
	var stat_kinds: Array[String] = ["hp", "dodge", "atk"]
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
	_rebuild_relic_strip()
	_resolve_room_pickup()

func _spawn_door() -> void:
	# Iter 32 — when the cleared room declared branches, spawn 2-3 fork
	# doors instead of the single iter-30 portal. The player reads the
	# label + peek and walks into the path they want. Each branch door
	# carries its kind so door.gd sets RunState.pending_branch on entry.
	if _room != null and not _room.branches.is_empty():
		_spawn_branch_doors(_room.branches)
		return
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

func _on_hero_swing_connected(hit_count: int) -> void:
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
	Engine.time_scale = SWING_HIT_STOP_SCALE
	_hit_stop_timer = SWING_HIT_STOP_TIME + multi_bonus

func _on_hero_dash_strike_landed(world_pos: Vector2, hit_count: int) -> void:
	# Spawn impact VFX at the end of the dash regardless of hits —
	# the player committed to the dash and deserves visual payoff.
	var impact: Node2D = DASH_IMPACT_SCENE.instantiate() as Node2D
	if impact != null:
		impact.global_position = world_pos
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
	# Below 5: hide (no clutter for normal play).
	if new_value < 5:
		_combo_label.visible = false
		_combo_label.scale = Vector2.ONE
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

func _update_hp(v: int) -> void:
	var hearts := ""
	var max_hp: int = Hero.MAX_HP + GameState.modifier_total("max_hp_bonus", 0)
	for i in range(max_hp):
		hearts += "♥ " if i < v else "♡ "
	hp_label.text = hearts.strip_edges()

func _update_kills() -> void:
	kills_label.text = "KILLS  %d" % _kills

func _update_room_label() -> void:
	if _room == null or RunState.current_room_index < 0:
		room_label.text = ""
		return
	var total: int = RunState.FLOOR_ROOMS.size()
	var idx: int = RunState.current_room_index + 1
	room_label.text = "%s  ·  ROOM %d / %d" % [_room.display_name, idx, total]

# Rebuild the HUD relic strip from GameState.owned_relics. Called on
# _ready (so a hypothetical mid-run reload still shows the right
# badges) and on every pickup_claimed event. Clears the strip first,
# then spawns one RelicIcon per owned id. Each icon repaints itself
# in set_relic based on the tier/name pulled from RELIC_REGISTRY, so
# the strip doesn't need to know anything about visuals.
func _rebuild_relic_strip() -> void:
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

# Iter 39 — theme chip strip builder. Iterates GameState.active_themes
# (only themes with tier >= 1 appear) and emits one Label chip per
# theme. Color-coded per theme; glyph count communicates tier
# (◆ resonance, ◆◆ ascendance). The strip lives in the same UI
# CanvasLayer so it doesn't move with the world camera.
func _rebuild_theme_chips() -> void:
	# Lazily build the container on first rebuild. UI is a CanvasLayer
	# (queried via $UI from the @onready hp_label path); we mount the
	# strip there so it inherits the canvas-layer rendering of the
	# rest of the HUD (immune to world-camera transforms).
	var ui: CanvasLayer = $UI as CanvasLayer
	if theme_chip_strip == null:
		theme_chip_strip = HBoxContainer.new()
		theme_chip_strip.name = "ThemeChipStrip"
		theme_chip_strip.offset_left = 16.0
		theme_chip_strip.offset_top = 126.0
		theme_chip_strip.offset_right = 900.0
		theme_chip_strip.offset_bottom = 150.0
		theme_chip_strip.add_theme_constant_override("separation", 8)
		theme_chip_strip.mouse_filter = Control.MOUSE_FILTER_IGNORE
		ui.add_child(theme_chip_strip)
	# Clear any prior chips. Also kill any orphan tooltip in case a
	# strip rebuild happens mid-hover (a relic granted while the
	# player was hovering a chip → strip rebuilds → tooltip still
	# pointed at the now-freed chip).
	for child in theme_chip_strip.get_children():
		child.queue_free()
	_hide_theme_tooltip()
	# Theme palette — keyed to in-game flavor (cyan storm, red flame,
	# crimson blood, ivory vow, indigo shadow). Both bg + text are
	# defined so each chip reads as a distinct identity.
	var theme_colors: Dictionary = {
		"storm": Color(0.55, 0.85, 1.0, 1.0),
		"flame": Color(1.0, 0.55, 0.30, 1.0),
		"blood": Color(0.95, 0.45, 0.45, 1.0),
		"vow": Color(0.92, 0.92, 0.78, 1.0),
		"shadow": Color(0.78, 0.65, 1.0, 1.0),
	}
	var active: Dictionary = GameState.active_themes()
	for theme in active.keys():
		var tier: int = int(active[theme])
		var lbl: Label = Label.new()
		var glyph: String = "◆" if tier == 1 else "◆◆"
		lbl.text = "%s  %s" % [str(theme).to_upper(), glyph]
		lbl.add_theme_font_size_override("font_size", 13)
		var col: Color = theme_colors.get(theme, Color.WHITE)
		lbl.add_theme_color_override("font_color", col)
		lbl.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.92))
		lbl.add_theme_constant_override("outline_size", 3)
		# Iter 48 — hover tooltip showing the theme's bonuses. Each
		# Label gets mouse_filter STOP so the chip catches the mouse
		# (default IGNORE would let it pass through). bind() captures
		# the theme name into the callback so the hover handler knows
		# which chip fired without needing per-chip handler methods.
		lbl.mouse_filter = Control.MOUSE_FILTER_STOP
		lbl.mouse_entered.connect(_on_theme_chip_hover.bind(str(theme), lbl))
		lbl.mouse_exited.connect(_on_theme_chip_unhover)
		theme_chip_strip.add_child(lbl)

# Iter 48 — theme chip hover handler. Shows a tooltip Panel near the
# hovered chip with the theme name, owned count, and the resonance
# + ascendance bonus descriptions (ascendance grayed if not yet
# unlocked). Single tooltip reused across hovers — _theme_tooltip
# holds the panel ref, repositioned + retextd per hover.
func _on_theme_chip_hover(theme: String, anchor_label: Control) -> void:
	_hide_theme_tooltip()
	var info: Dictionary = THEME_TOOLTIP_DESC.get(theme, {})
	if info.is_empty():
		return
	var owned_count: int = GameState.theme_count(theme)
	var tier: int = GameState.theme_tier(theme)
	var ui: CanvasLayer = $UI as CanvasLayer
	# Theme palette — same as the chip color for visual continuity.
	var theme_colors: Dictionary = {
		"storm": Color(0.55, 0.85, 1.0, 1.0),
		"flame": Color(1.0, 0.55, 0.30, 1.0),
		"blood": Color(0.95, 0.45, 0.45, 1.0),
		"vow": Color(0.92, 0.92, 0.78, 1.0),
		"shadow": Color(0.78, 0.65, 1.0, 1.0),
	}
	var col: Color = theme_colors.get(theme, Color.WHITE)
	var panel: PanelContainer = PanelContainer.new()
	var sb: StyleBoxFlat = StyleBoxFlat.new()
	sb.bg_color = Color(0.06, 0.05, 0.09, 0.96)
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
	# Slow-mo: time_scale 1.0 → 0.25 over 0.4s.
	var t_time: Tween = create_tween()
	t_time.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
	t_time.tween_property(Engine, "time_scale", DEATH_TIME_SCALE_MIN, 0.4)
	# Camera punch-in to 1.4× over 0.6s. The camera lives under Hero;
	# we tween its zoom directly.
	var cam: Camera2D = $Hero/Camera2D
	if cam != null:
		var t_cam: Tween = create_tween()
		t_cam.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
		t_cam.tween_property(cam, "zoom", DEATH_CAMERA_ZOOM_END, 0.6).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	# Build a full-screen crimson veil + banner on a fresh CanvasLayer
	# above the HUD (layer 50; HUD is 0, death_screen is 200, so we
	# sit between). Veil fades to alpha 0.72; banner crashes in from
	# offset_top=-400 to -60 with a back-ease so it overshoots.
	var veil_layer: CanvasLayer = CanvasLayer.new()
	veil_layer.layer = 50
	add_child(veil_layer)
	var veil: ColorRect = ColorRect.new()
	veil.color = Color(0.1, 0.0, 0.0, 0.0)
	veil.anchor_right = 1.0
	veil.anchor_bottom = 1.0
	veil.mouse_filter = Control.MOUSE_FILTER_IGNORE
	veil_layer.add_child(veil)
	var t_veil: Tween = create_tween()
	t_veil.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
	t_veil.tween_property(veil, "color:a", DEATH_VEIL_FINAL_ALPHA, DEATH_VEIL_FADE_TIME)
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
	# Restore time_scale at 1.2s, show death_screen at 1.6s.
	var t_end: Tween = create_tween()
	t_end.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
	t_end.tween_interval(DEATH_RESTORE_AT)
	t_end.tween_property(Engine, "time_scale", 1.0, DEATH_SHOW_SCREEN_AT - DEATH_RESTORE_AT)
	t_end.tween_callback(func() -> void:
		if _death_screen != null and _death_screen.has_method("show_death"):
			_death_screen.show_death(_kills)
	)
	# world_pos param reserved for future use (e.g. spawn an arrow
	# pointing at the death site from the death_screen). Silences the
	# UNUSED_PARAMETER warning.
	var _unused: Vector2 = world_pos

func _on_death_retry() -> void:
	# Retry = restart THIS floor from room 0. Easier UX than dropping
	# the player into the room they died on with no preamble.
	Engine.time_scale = 1.0
	GameState.start_dungeon_run()
	RunState.start_floor()
	get_tree().reload_current_scene()

# Iter 16 — run-complete sequence. Replaces the previous "claim the
# pedestal, then ESC to leave" flow (which left the player staring at
# a stale 'walk to pedestal' status_label with no celebratory beat).
# Now: a brief gold banner + summary, then auto-return to menu after
# 2.5s so the run actually FEELS like it ended.
const RUN_COMPLETE_DELAY := 2.5
func _show_run_complete() -> void:
	wave_label.text = "RUN COMPLETE"
	# Compose a one-line summary of what the player walked out with.
	# Uses the GOLD color family so it reads distinctly from the
	# crimson death banner.
	var relic_names: Array[String] = []
	for rid in GameState.owned_relics:
		var info: Dictionary = GameState.relic_info(rid)
		relic_names.append(str(info.get("name", rid)))
	var summary: String = "%d kills" % _kills
	if relic_names.size() > 0:
		summary += "  ·  " + " · ".join(relic_names)
	status_label.text = summary
	# Big floating banner so the moment registers even if the player's
	# eyes are still tracking the hero, not the HUD corner.
	var banner: DamageNumber = DamageNumber.spawn(
		hero.global_position + Vector2(0, -96),
		"FLOOR COMPLETE",
		Color(1, 0.85, 0.45),
	)
	add_child(banner)
	Engine.time_scale = 1.0
	var t := get_tree().create_timer(RUN_COMPLETE_DELAY)
	t.timeout.connect(_on_death_to_menu)

func _on_death_to_menu() -> void:
	# Iter 12: hamlet removed. ESC / MENU button returns to the main
	# menu — the menu's BEGIN re-seeds RunState.start_floor() so we
	# end_floor here defensively rather than relying on the menu side.
	Engine.time_scale = 1.0
	RunState.end_floor()
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
# Iter 57 — achievement unlock popup. Briefly shows the achievement
# name + description at the top-center of the screen, then fades.
# Stacks in vertical sequence if multiple unlock back-to-back (e.g.
# centurion + flame_devotee on the same kill).
var _achievement_popup_count: int = 0   # how many popups currently visible

func _on_achievement_unlocked(id: String) -> void:
	if not GameState.ACHIEVEMENTS.has(id):
		return
	var info: Dictionary = GameState.ACHIEVEMENTS[id]
	var nm: String = str(info.get("name", id))
	var desc: String = str(info.get("description", ""))
	var layer: CanvasLayer = CanvasLayer.new()
	layer.layer = 42
	add_child(layer)
	var panel: PanelContainer = PanelContainer.new()
	var sb: StyleBoxFlat = StyleBoxFlat.new()
	sb.bg_color = Color(0.06, 0.05, 0.09, 0.95)
	sb.border_color = Color(1.0, 0.85, 0.40, 0.95)
	sb.border_width_left = 2
	sb.border_width_top = 2
	sb.border_width_right = 2
	sb.border_width_bottom = 2
	sb.corner_radius_top_left = 4
	sb.corner_radius_top_right = 4
	sb.corner_radius_bottom_right = 4
	sb.corner_radius_bottom_left = 4
	sb.content_margin_left = 14.0
	sb.content_margin_top = 8.0
	sb.content_margin_right = 14.0
	sb.content_margin_bottom = 8.0
	panel.add_theme_stylebox_override("panel", sb)
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.anchor_left = 0.5
	panel.anchor_right = 0.5
	panel.anchor_top = 0.0
	panel.anchor_bottom = 0.0
	# Stack vertically — successive popups appear below the prior.
	var slot: int = _achievement_popup_count
	panel.offset_left = -190
	panel.offset_right = 190
	panel.offset_top = 110 + (slot * 70)
	panel.offset_bottom = 170 + (slot * 70)
	panel.modulate = Color(1, 1, 1, 0)
	layer.add_child(panel)
	var box: VBoxContainer = VBoxContainer.new()
	box.add_theme_constant_override("separation", 2)
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_child(box)
	var heading: Label = Label.new()
	heading.text = "★ ACHIEVEMENT UNLOCKED ★"
	heading.add_theme_font_size_override("font_size", 11)
	heading.add_theme_color_override("font_color", Color(1.0, 0.85, 0.40, 1))
	heading.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.95))
	heading.add_theme_constant_override("outline_size", 2)
	heading.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	heading.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_child(heading)
	var name_lbl: Label = Label.new()
	name_lbl.text = nm
	name_lbl.add_theme_font_size_override("font_size", 18)
	name_lbl.add_theme_color_override("font_color", Color(1, 0.95, 0.85, 1))
	name_lbl.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.95))
	name_lbl.add_theme_constant_override("outline_size", 3)
	name_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_child(name_lbl)
	var desc_lbl: Label = Label.new()
	desc_lbl.text = desc
	desc_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	desc_lbl.custom_minimum_size = Vector2(360, 0)
	desc_lbl.add_theme_font_size_override("font_size", 12)
	desc_lbl.add_theme_color_override("font_color", Color(0.80, 0.78, 0.72, 1))
	desc_lbl.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.95))
	desc_lbl.add_theme_constant_override("outline_size", 2)
	desc_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	desc_lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_child(desc_lbl)
	_achievement_popup_count += 1
	# Drop-in tween + hold + fade out + queue_free + slot release.
	var tw: Tween = create_tween()
	tw.tween_property(panel, "modulate:a", 1.0, 0.25)
	tw.tween_interval(3.0)
	tw.tween_property(panel, "modulate:a", 0.0, 0.6)
	tw.tween_callback(layer.queue_free)
	tw.tween_callback(func ():
		_achievement_popup_count = max(0, _achievement_popup_count - 1)
	)

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
