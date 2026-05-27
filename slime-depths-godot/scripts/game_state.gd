# GameState — autoload singleton for state that survives scene
# transitions. Tracks session metrics + owned relics (the start of
# the run-loop progression system).
#
# Relic model (Iter 3 stub):
#   Each relic is a record in RELIC_REGISTRY keyed by id. Owned relics
#   are an array of ids on GameState. Damage/stat queries fold every
#   owned relic's bonuses into a single number — matches slime-depths'
#   approach in src/relics.js where hero.weaponDamageMul etc. is a
#   precomputed sum from all owned items.
#
# To add a relic:
#   1. Add an entry to RELIC_REGISTRY (id → name / description / mods)
#   2. Spawn a Pedestal with that relic_id somewhere in a scene
#   3. The hero auto-queries the bonus on attack/blast
extends Node

# Iter 239 / Fun Ideas Team R4 — FloorModifiers script preload. Use a
# Script constant rather than the class_name global so headless test
# runs (which don't go through the editor's class registration) can
# resolve the identifier. Same pattern as main.gd / hero.gd use for
# ReactionWebScript + other sibling-script references.
const FloorModifiers: Script = preload("res://scripts/floor_modifiers.gd")

# ── Session metrics ──────────────────────────────────────────────────
# session_kills: accumulates across runs forever (lifetime counter).
# dungeon_runs: how many runs the player has STARTED (BEGIN pressed).
# last_run_kills: kills in the most recent run (resets on new run).
# best_run_kills: max last_run_kills across all runs (iter 23) — shown
#   on the main-menu stats panel. Updated at the START of each new run
#   by promoting the previous run's value, so death OR run-complete
#   both contribute (whichever flow ended the previous run).
var session_kills := 0
var dungeon_runs := 0
var last_run_kills := 0
var best_run_kills := 0
# Iter 158 — run time tracking. last_run_time captured at run end
# (hero death or final-boss victory) from RunState.run_elapsed_seconds();
# best_run_time is the MIN (faster = better) across all runs, with -1.0
# sentinel meaning "no run completed yet." Persisted in save_to_dict.
var last_run_time: float = 0.0
var best_run_time: float = -1.0

# iter-229 / Polish Team R2 — death-screen run summary stats. Captured
# in main.gd._on_hero_died via finalize_run_death_stats(); read by
# death_screen.gd._rebuild_cause_of_death + _rebuild_combat_summary.
# Cleared in start_dungeon_run so each fresh run starts clean. NOT
# persisted in save_to_dict — these are intra-run scratch state, only
# meaningful between hero-death and the next start_dungeon_run.
var last_run_death_source: String = ""
var last_run_biggest_hit: int = 0
# Status-combo counter — incremented from enemy.gd's
# _trigger_shatter_combo / _trigger_kindle_spread via note_combo_fired().
# Dictionary[String,int] e.g. {"shatter": 4, "kindle": 2}. Empty means
# no combos fired this run — death_screen suppresses the line.
var last_run_combo_counts: Dictionary = {}
# iter-245 / Director Phase 3 — biggest hit-streak this run. Bumped from
# main.gd._on_hero_combo_changed every time the live combo counter sets
# a new high. Reset to 0 in start_dungeon_run. Surfaced on the death
# screen so a player who racked a 73-hit streak gets to SEE that fact
# next to "BIGGEST HIT" — twin numbers for "your biggest moment of
# damage" + "your biggest moment of flow."
var best_combo_this_run: int = 0

# iter-246 / Director Phase 4 — pedestal-offer counter for the first-3
# rare-biased pattern (VS chest 1-1-3-1-5 grammar). Incremented in
# main.gd::_spawn_pedestal_offer for every pedestal handed to the
# player. Reset to 0 in start_dungeon_run so each fresh run gets the
# guaranteed early dopamine pattern. The bias only applies while this
# counter is below PEDESTAL_FIRST_3_BIAS_LIMIT (3); after that the
# normal TIER_WEIGHTS_BY_ROOM table takes over.
var _pedestal_offers_this_run: int = 0

# iter-246 / Director Phase 4 — per-save record of "first time this
# room cleared" events. Keyed by RoomConfig.display_name so the bonus
# fires exactly once per save per room across all runs. Migrated to
# save_version 9. Surfaced as a +25 / +75 (boss) ether shard payout
# the FIRST time a new player clears each room — converts the long
# tail of unlock progression into a visible milestone.
var floor_clear_bonuses_claimed: Array[String] = []

# iter-246 / Director Phase 4 — theme-tier stinger memo. Tracks the
# highest tier we've ALREADY shown a stinger for, per theme. Whenever
# GameState.theme_tier(name) advances past the recorded mark, main.gd
# fires the full-screen stinger + brass sweep. Cleared on
# start_dungeon_run so each run can re-discover its themes from zero.
# Not persisted — purely intra-run state.
var _theme_tier_seen: Dictionary = {
	"storm": 0, "flame": 0, "blood": 0, "vow": 0, "shadow": 0,
}

# HP carryover between rooms within a single floor run. -1 = no carry
# (Hero uses MAX_HP + max_hp_bonus on spawn). Set by Hero.gd's
# tree_exiting hook when leaving the dungeon scene alive; reset to -1
# by RunState.start_floor() / end_floor() so each new run begins fresh.
# Without this, every room transition would silently full-heal the
# player, defeating the multi-room difficulty curve.
var persisted_hp: int = -1

# iter-105: phoenix_feather true once-per-run gate. Iter-101 surfaced
# that the relic's description claimed "Once per run" but the hero-
# local flag reset every room (since hero re-instantiates on each room
# load). Iter-101 honest-fix updated the DESCRIPTION to "Each room."
# Iter-105 reverts to the original design — promotes the flag to
# GameState so it survives room transitions. Reset on start_dungeon_run
# so each new run gets a fresh revive.
#
# Why honor the original intent: at 6 rooms/floor, per-room revive
# was mythic-tier output on a legendary stat-line. Six full-HP saves
# trivializes any single-room threat. Phoenix should be a dramatic
# one-shot save, not a per-encounter safety net (that's second_wind's
# job — which now honestly says "Each room" in its description).
var phoenix_feather_used: bool = false

# iter-123: persistent "I've seen the controls" flag. The first-ever
# room load shows a brief controls hint via main.gd's StatusLabel; the
# iter-119 auto-fade carries it off-screen after 5 s. After that first
# show this flag is set + saved, so the hint never re-appears across
# rooms, runs, or sessions. Cleared by SaveSystem on a "wipe profile"
# action (not implemented yet — when it lands, just include this
# field in the reset list).
var has_seen_controls_hint: bool = false
# Iter 160 — first-run tutorial. Set true after the player completes
# the 4-step prompt sequence (MOVE → ATTACK → DASH → PICK UP RELIC)
# in their very first run's room 0. Persistent, so subsequent runs
# never see the tutorial again unless the save is wiped.
var has_completed_tutorial: bool = false

# Iter 219 / Beta M1.0 — Persistent meta-progression currency. Ether
# Shards accumulate across runs and (in a future M1.1) spend in the hub
# on upgrade tree nodes (Resilience / Quick Step / etc., see
# BETA_M1_META_DESIGN.md). Per the audit findings, this is the #1
# beta-readiness gap — every death needs to produce SOME permanent
# progress for the loop to retain players.
#
# Drop sources (wired in main.gd):
#   Room cleared (non-boss):     +5
#   Boss kill (any boss):        +15
#   Run completion (Tyrant):     +30 (one-time bonus on top of clear)
#
# Persists through save_to_dict / load_from_dict. Migration path covers
# pre-iter-219 saves (will load as 0 shards, which is correct).
var ether_shards: int = 0
# Lifetime accumulator — does NOT decrement on spending. Surface for
# "total earned" stats / future achievements.
var ether_lifetime_earned: int = 0

# Iter 239 / Fun Ideas Team R4 — floor-wide modifiers (Pact of
# Punishment lite). Array of mod_ids from FloorModifiers.MODIFIER_CATALOG.
# Selected at the pre-run modal (main_menu.gd) BEFORE BEGIN finalizes,
# cleared on start_dungeon_run() so each new run starts neutral.
# Multiplier consumed by award_ether_shards via
# FloorModifiers.compute_ether_multiplier(). NOT persisted in
# save_to_dict — these are per-run choices, re-asked on every BEGIN
# press (matches the Hades Pact flow).
var active_floor_modifiers: Array[String] = []

# Iter 220 / Beta M1.1 — Permanent upgrade tree state. 5-node Mirror-of-
# Night-equivalent. Each entry is current level (0..max). Levels persist
# via save_to_dict. Effects applied at hero spawn (main.gd reads them).
# Spend prices defined in UPGRADE_TREE; spent via spend_upgrade_node().
var upgrade_levels: Dictionary = {
	"resilience": 0,    # +1 max HP per level  (0..3)
	"quick_step": 0,    # +1 dodge charge       (0..1)
	"first_talisman": 0,# unlock starting relic (0..2 → unlock slot, then raise tier)
	"tribute": 0,       # +N starting gold      (0..2)
	"bound_vow": 0,     # unlock active-relic slot (0..1)
}

# Upgrade tree spec. Each entry has max_level (= upgrade_levels[id]
# clamp), costs[] (length = max_level, indexed by NEXT level to buy
# minus 1 — i.e. costs[0] is the price to go 0→1), display_name +
# description for UI. The hub UI (M1.2) and the main-menu Records
# panel (M1.1) both read this same spec.
const UPGRADE_TREE: Dictionary = {
	"resilience": {
		"display_name": "RESILIENCE",
		"description": "+1 max HP per level.",
		"max_level": 3,
		"costs": [50, 100, 200],
	},
	"quick_step": {
		"display_name": "QUICK STEP",
		"description": "+1 starting dodge charge.",
		"max_level": 1,
		"costs": [150],
	},
	"first_talisman": {
		"display_name": "FIRST TALISMAN",
		"description": "Start each run with a relic. Level 2 raises its tier.",
		"max_level": 2,
		"costs": [100, 300],
	},
	"tribute": {
		"display_name": "TRIBUTE",
		"description": "+50 starting gold, +200 at level 2.",
		"max_level": 2,
		"costs": [60, 150],
	},
	"bound_vow": {
		"display_name": "BOUND VOW",
		"description": "Unlock the active-relic slot (R) at hub.",
		"max_level": 1,
		"costs": [400],
	},
}

# Spend `ether_shards` to advance the node's level by 1. Returns true on
# success, false if max-level reached, unknown id, or insufficient
# shards. Callers should save after a successful upgrade.
func upgrade_node(node_id: String) -> bool:
	if not UPGRADE_TREE.has(node_id):
		return false
	var spec: Dictionary = UPGRADE_TREE[node_id]
	var current_level: int = int(upgrade_levels.get(node_id, 0))
	var max_level: int = int(spec.get("max_level", 0))
	if current_level >= max_level:
		return false
	var costs: Array = spec.get("costs", [])
	if current_level >= costs.size():
		return false  # mis-specced data
	var cost: int = int(costs[current_level])
	if not spend_ether_shards(cost):
		return false
	upgrade_levels[node_id] = current_level + 1
	return true

# Cost to reach the NEXT level on node_id, or -1 if already maxed / unknown.
func upgrade_next_cost(node_id: String) -> int:
	if not UPGRADE_TREE.has(node_id):
		return -1
	var spec: Dictionary = UPGRADE_TREE[node_id]
	var current_level: int = int(upgrade_levels.get(node_id, 0))
	var max_level: int = int(spec.get("max_level", 0))
	if current_level >= max_level:
		return -1
	var costs: Array = spec.get("costs", [])
	if current_level >= costs.size():
		return -1
	return int(costs[current_level])

# Helper for hero / main.gd to read effect amounts.
func upgrade_level(node_id: String) -> int:
	return int(upgrade_levels.get(node_id, 0))
# Iter 166 — first-encounter banner. Tracks which enemy display_names
# have already been intro'd THIS SESSION (cleared on game launch by
# nature of being an in-memory autoload field). Each new enemy type
# that spawns checks this set; if absent, fires a brief banner above
# the enemy's head + adds the name. Bosses skip this — they have
# their own iter-148 intro cinematic.
var seen_enemy_names_session: Array[String] = []

# ── Relic registry ───────────────────────────────────────────────────
# Modifier keys read by hero.gd:
#   sword_damage_bonus      (int)    added to LMB-swing damage
#   blast_damage_bonus      (int)    added to RMB-projectile damage
#   max_hp_bonus            (int)    added to Hero.MAX_HP at spawn
#   damage_taken_reduction  (int)    flat subtract from incoming damage
#   sword_cooldown_mul      (float)  multiplier delta on ATTACK_COOLDOWN
#   blast_cooldown_mul      (float)  multiplier delta on BLAST_COOLDOWN  (iter 17)
#   dodge_cooldown_mul          (float)  RETIRED (iter-95 → iter-96). No relic
#                                        declares this anymore — repurposed to
#                                        dash_strike_cooldown_mul below.
#   move_speed_mul              (float)  multiplier delta on SPEED
#   attack_range_mul            (float)  multiplier delta on ATTACK_RANGE  (iter 17)
#   knockback_force_mul         (float)  multiplier delta on melee + dash knockback  (iter 21)
#   dodge_iframes_bonus_f       (float)  RETIRED (iter-95 → iter-96). Repurposed
#                                        as dash_strike_post_iframes_bonus_f below.
#   dash_strike_cooldown_mul    (float)  iter-96. Multiplier delta on
#                                        DASH_STRIKE_COOLDOWN. Floor 0.25s in hero.gd.
#                                        Used by dash_master (-0.3), phantom_step (-0.4).
#   dash_strike_post_iframes_bonus_f (float)  iter-96. Extra seconds added to
#                                        DASH_STRIKE_POST_IFRAMES (default 0.10s).
#                                        Used by phantom_step (+0.15), gale_step (+0.05).
#   crit_damage_bonus_f         (float)  iter-96 Phase B. Additive bonus to the
#                                        base CRIT_DAMAGE_MUL of 1.5. Used by
#                                        keen_focus (+0.10 → 1.6× crits).
#   projectile_speed_mul    (float)  multiplier delta on hero blast velocity  (iter 21)
#   attack_arc_mul          (float)  multiplier delta on ATTACK_ARC half-angle  (iter 21)
# Float-typed mods are folded via modifier_total_f (see below).
#
# Tier (iter 17): "common" / "rare" / "legendary". Drives the pedestal
# offer-roll weighting (commoners are likely in room 1, rares in room
# 2, legendaries gate to room 3) and future per-tier visual treatment.
#
# Triggered effects (iter 17 + iter 72) — relics whose effect can't be
# expressed (entirely) as a flat modifier. hero.gd checks has_relic(<id>)
# at the relevant beat. Listed for inventory clarity:
#   second_wind         revive once at 1 HP on the killing blow
#   bloodstone          heal +1 HP every 3 enemy kills
#   arcane_resonance    every 4th blast deals 2× damage
#   executioner         +150% damage to enemies below 25% HP
#   soul_burst          every 5th kill detonates an 80px AoE for 1 dmg
#   iron_resolve        first wound each room is absorbed
#   iron_fang           (iter 72) +1 sword dmg + every 6th hit drops ember burst
#   arcane_pulse        (iter 72) +1 blast dmg + every 5th cast forks bolt
#   stoneheart          (iter 72) +1 max HP + first kill each room heals +1
#   iron_skin           (iter 72) -1 dmg + deflect FX + every 4th block knocks back
const RELIC_REGISTRY := {
	# Iter 72 — IRON FANG redesign. +1 sword damage AS BEFORE, plus an
	# every-6th-hit ember burst at the impact point (40-px AoE for 1
	# damage, FLAME-orange ring visual). Mechanic + visual replaces the
	# old pure stat-stick — the ember burst is what a FLAME-themed
	# common relic should look like at-a-glance. Hero handler reads
	# the relic id with has_relic + a per-run _iron_fang_hit_counter
	# (mirrors _sword_hit_counter / _blast_counter pattern).
	"iron_fang": {
		"name": "IRON FANG",
		"description": "+1 sword damage. Every 6th sword hit detonates a small ember burst at the strike, scorching nearby enemies.",
		"tier": "common",
		"icon_path": "res://assets/icons/relic_damage.png",
		"mods": { "sword_damage_bonus": 1 },
		"themes": ["flame"],
	},
	# Iter 72 — ARCANE PULSE redesign. +1 blast damage AS BEFORE, plus an
	# every-5th-blast "arcane surge": that cast also forks a small
	# magenta-violet bolt to the nearest off-target enemy within 140px
	# for 1 damage. Visual: arcane_bolt FX (chain_arc grammar with a
	# distinct violet palette). The relic now COMPOSES with itself
	# (counter ticks every cast) rather than disappearing into the
	# damage line.
	"arcane_pulse": {
		"name": "ARCANE PULSE",
		"description": "+1 blast damage. Every 5th blast also forks a violet bolt to a nearby enemy.",
		"tier": "common",
		"icon_path": "res://assets/icons/relic_arcane_quiver.png",
		"mods": { "blast_damage_bonus": 1 },
		"themes": ["storm"],
	},
	# Iter 72 — STONEHEART redesign. +1 max HP AS BEFORE, plus a
	# first-kill-each-room emerald pulse around the hero that heals +1 HP
	# (capped). Reads as "the relic mends you on a kill" — visible, gated
	# on a per-room flag so it can't farm trivial heals from a long wave.
	# Independent of bloodstone (every-3rd-kill heal) so a player with
	# both gets: room kill 1 → stoneheart heal, kill 3 → bloodstone heal,
	# kill 6 → bloodstone, etc. Visible distinction in floater color.
	"stoneheart": {
		"name": "STONEHEART",
		"description": "+1 max HP. The first enemy felled each room sends a vital pulse — heal +1 HP.",
		"tier": "common",
		"icon_path": "res://assets/icons/relic_max_hp.png",
		"mods": { "max_hp_bonus": 1 },
		"themes": ["blood"],
	},
	# Iter 72 — IRON SKIN redesign. -1 incoming damage AS BEFORE, plus a
	# visible stone-shard deflect burst that fires every time the
	# reduction actually saves damage. Every 4th time the reduction
	# triggers, the hero also releases a 60-px shard-push that knocks
	# adjacent enemies away (no damage — purely defensive spacing tool).
	# Counter persists per-run (mirrors _sword_hit_counter pattern). The
	# new mechanic gives IRON SKIN a positional/defensive identity
	# distinct from iron_resolve (full first-hit absorb) and stalwart
	# (HP buffer + reduction).
	"iron_skin": {
		"name": "IRON SKIN",
		"description": "-1 incoming damage. Hits chip stone fragments off you. Every 4th deflection releases a shard-push that knocks back nearby enemies.",
		"tier": "common",
		"icon_path": "res://assets/icons/relic_ironhide.png",
		"mods": { "damage_taken_reduction": 1 },
		"themes": ["vow"],
	},
	# iter-96 Phase B retune: previous description PROMISED "first-hit DR"
	# but no handler existed in hero.gd — pure lying chrome. Stripped the
	# false promise + bumped HP 1 → 2 so iron_will is now the
	# straightforward HP-bigger-than-lifestone common. Differentiates
	# from `lifestone` (which gained a regen proc below) and from
	# `sturdy_step` (DR-focused). Three distinct VOW commons.
	"iron_will": {
		"name": "IRON WILL",
		"description": "Endure. +2 max HP.",
		"tier": "common",
		"icon_path": "res://assets/icons/relic_iron_greaves.png",
		"mods": { "max_hp_bonus": 2 },
		"themes": ["vow"],
	},
	# iter-96 Phase B retune: knockback alone was a 0.1% pick rate dud.
	# Added flat -1 incoming damage so the relic has a survival axis.
	# Stays in FLAME (the "hit hard, keep enemies off" identity).
	"iron_grip": {
		"name": "IRON GRIP",
		"description": "Strikes shove harder. +25% knockback force, -1 incoming damage.",
		"tier": "common",
		"icon_path": "res://assets/icons/relic_heavy_blow.png",
		"mods": { "knockback_force_mul": 0.25, "damage_taken_reduction": 1 },
		"themes": ["flame"],
	},
	# iter-96 retune: dodge_iframes_bonus_f became a dead key when iter-95
	# removed the dodge ability. Repurposed to a flat -1 damage taken — a
	# common VOW stat-stick that actually does something.
	"sturdy_step": {
		"name": "STURDY STEP",
		"description": "Steady on your feet. -1 incoming damage.",
		"tier": "common",
		"icon_path": "res://assets/icons/relic_iron_greaves.png",
		"mods": { "damage_taken_reduction": 1 },
		"themes": ["vow"],
	},
	"focused_eye": {
		"name": "FOCUSED EYE",
		"description": "Sharper casting. +1 blast damage, blast projectiles travel +20% faster.",
		"tier": "common",
		"icon_path": "res://assets/icons/relic_eye_of_ether.png",
		"mods": { "blast_damage_bonus": 1, "projectile_speed_mul": 0.2 },
		"themes": ["storm"],
	},
	# Iter 40 — common BLOOD entry. iter-96 Phase B retune: pure +1 HP
	# at common was strictly dominated. Added a slow regen proc (every
	# 8 kills, heal 1 HP) to give lifestone a build identity distinct
	# from iron_will (now +2 HP flat). Pairs with bloodstone (legendary
	# every-3rd-kill) for a BLOOD regen ramp.
	"lifestone": {
		"name": "LIFESTONE",
		"description": "A pulsing red gem fused to your heart. +1 max HP. Every 8 kills, heal 1 HP.",
		"tier": "common",
		"icon_path": "res://assets/icons/relic_bloodstone.png",
		"mods": { "max_hp_bonus": 1 },
		"themes": ["blood"],
	},
	# iter-102 NEW: VOW common. Pool was 8 relics (smallest of the
	# defense-themed pools); sim showed VOW ascendance triggering in
	# 0.0% of greedy runs. Adds a second pure-DR VOW common alongside
	# sturdy_step so the theme has TWO common ramps (was 1) — gives
	# players a real chance to land 2 VOW relics by floor 1 and 4 by
	# floor 3. Flavor distinct from sturdy_step (-1 dmg taken) by
	# adding a small max_hp_bonus too: bulwark is "stand your ground"
	# vs sturdy_step's "weather it." Different shapes, same theme.
	"bulwark": {
		"name": "BULWARK",
		"description": "Brace and endure. +1 max HP, -1 incoming damage.",
		"tier": "common",
		"icon_path": "res://assets/icons/relic_bulwark.png",
		"mods": { "max_hp_bonus": 1, "damage_taken_reduction": 1 },
		"themes": ["vow"],
	},
	# iter-102 NEW: SHADOW common. Pool was 6 relics; sim showed SHADOW
	# ascendance triggering in 0.1% of greedy runs. Single-mod crit-chance
	# entry tier — pairs naturally with keen_focus / focused_strike for
	# a crit ramp build that also banks SHADOW theme tier. Common at
	# +10% crit (smaller than keen_focus's 15%) so it doesn't outshine
	# the FLAME-themed crit anchor.
	"umbral_thread": {
		"name": "UMBRAL THREAD",
		"description": "Strike from shadow. +10% crit chance.",
		"tier": "common",
		"icon_path": "res://assets/icons/relic_eye_of_ether.png",
		"mods": { "crit_chance_f": 0.10 },
		"themes": ["shadow"],
	},
	# iter-102 NEW: dual-theme STORM+SHADOW common. Cheap two-theme
	# entry; one pickup contributes to both pools at the same time —
	# similar pattern to tempest_cloak (rare storm+shadow) but at
	# common tier. Move-speed + projectile-speed combo reads as
	# "step quickly, fire quickly" — on-brand for both themes.
	"dusk_walker": {
		"name": "DUSK WALKER",
		"description": "Quick step, quick shot. +15% move speed, +15% projectile speed.",
		"tier": "common",
		"icon_path": "res://assets/icons/relic_nimble_step.png",
		"mods": { "move_speed_mul": 0.15, "projectile_speed_mul": 0.15 },
		"themes": ["storm", "shadow"],
	},
	"swift_strike": {
		"name": "SWIFT STRIKE",
		"description": "Sword cooldown -20%.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_attack_speed.png",
		"mods": { "sword_cooldown_mul": -0.2 },
		"themes": ["flame"],
	},
	# iter-96 retune: was DODGE MASTER, anchored to a now-deleted ability.
	# Renamed to DASH MASTER — same SHADOW theme, same flavor of "move
	# more often," but the cooldown reduction now hits dash_strike (the
	# only mobility option after iter-95).
	"dash_master": {
		"name": "DASH MASTER",
		"description": "Dash strike cooldown -30%.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_dodge.png",
		"mods": { "dash_strike_cooldown_mul": -0.3 },
		"themes": ["shadow"],
	},
	"nimble": {
		"name": "NIMBLE",
		"description": "Move speed +30%.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_nimble_step.png",
		"mods": { "move_speed_mul": 0.3 },
		"themes": ["shadow"],
	},
	"swift_focus": {
		"name": "SWIFT FOCUS",
		"description": "Blast cooldown -30%. Cast faster.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_swift_arm.png",
		"mods": { "blast_cooldown_mul": -0.3 },
		"themes": ["storm", "shadow"],
	},
	# iter-96 Phase B retune: range-only was 3.2% pick rate. Added +1
	# sword damage so the relic commits to melee builds with a real DPS
	# axis. Stays in FLAME — the melee theme.
	"long_reach": {
		"name": "LONG REACH",
		"description": "Sword swings reach +25% farther. +1 sword damage.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_long_reach.png",
		"mods": { "attack_range_mul": 0.25, "sword_damage_bonus": 1 },
		"themes": ["flame"],
	},
	# iter-96 Phase B retune: speed-only was 2.2% pick rate (dud-tier).
	# Added pierce_count:1 so the relic actually changes how blasts feel.
	# Now it's the rare "blast hits through one enemy" — pairs with
	# piercing_quarrel for a 2-pierce stack, or twin_cast for projectile
	# count × pierce.
	"arcane_quiver": {
		"name": "ARCANE QUIVER",
		"description": "Blast projectiles travel +30% faster and pierce through 1 enemy.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_arcane_quiver.png",
		"mods": { "projectile_speed_mul": 0.30, "pierce_count": 1 },
		"themes": ["storm"],
	},
	"wide_arc": {
		"name": "WIDE ARC",
		"description": "Sword swings cleave a +60% wider arc.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_keen_edge.png",
		"mods": { "attack_arc_mul": 0.60 },
		"themes": ["flame"],
	},
	"stalwart": {
		"name": "STALWART",
		"description": "Stand your ground. +1 max HP, -1 incoming damage.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_bulwark.png",
		"mods": { "max_hp_bonus": 1, "damage_taken_reduction": 1 },
		"themes": ["vow"],
	},
	# iter-96 retune: dodge_iframes_bonus_f → dash_strike_post_iframes_bonus_f.
	# Move-speed bump (0.20 → 0.25) so this no longer reads as a strictly
	# worse nimble; the dash i-frames extension adds a defensive flavor
	# distinct from nimble's pure mobility.
	"gale_step": {
		"name": "GALE STEP",
		"description": "Wind at your back. +25% move speed, +0.05s dash strike post-iframes.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_gale_step.png",
		"mods": { "move_speed_mul": 0.25, "dash_strike_post_iframes_bonus_f": 0.05 },
		"themes": ["shadow"],
	},
	# Iter 40 — new rare VOW relic. Stronger VOW pick that gives both
	# the HP buffer AND the chip-damage reduction, so a stalwart-style
	# tank build is accessible at rare tier (not just legendary).
	"aegis_plate": {
		"name": "AEGIS PLATE",
		"description": "Lacquered armor of the old guard. +2 max HP, -1 incoming damage.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_bulwark.png",
		"mods": { "max_hp_bonus": 2, "damage_taken_reduction": 1 },
		"themes": ["vow"],
	},
	# Iter 41 — projectile pipeline expansion. Adds two NEW modifier
	# keys (pierce_count, ricochet_count) read by hero._start_blast at
	# cast time and locked onto each spawned projectile.
	"piercing_quarrel": {
		"name": "PIERCING QUARREL",
		"description": "Blasts pass through 1 enemy before stopping.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_long_reach.png",
		"mods": { "pierce_count": 1 },
		"themes": ["storm"],
	},
	"ricochet_talisman": {
		"name": "RICOCHET TALISMAN",
		"description": "Blasts ricochet to a nearby enemy after the first hit.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_chain_lightning.png",
		"mods": { "ricochet_count": 1 },
		"themes": ["storm"],
	},
	# Iter 42 — multi-shot legendary. Doubles every blast into a spread
	# pair. Stacks with pierce_count + ricochet_count — a Twin Cast +
	# Piercing Quarrel + Ricochet Talisman build lays down 2 shots that
	# each pierce 1 enemy then bounce. Real bullet-hell density.
	"twin_cast": {
		"name": "TWIN CAST",
		"description": "Every blast fires two projectiles in a spread.",
		"tier": "legendary",
		"icon_path": "res://assets/icons/relic_echoing_strike.png",
		"mods": { "projectile_count": 1 },
		"themes": ["storm"],
	},
	# Iter 42 — crit chance entry-tier. iter-96 Phase B retune: added
	# crit_damage_bonus_f:0.10 so the relic delivers a +25% expected
	# damage from crits (was just chance, capped at 1.5× damage).
	# Pairs with focused_strike (rare crit chance) for the FLAME crit
	# ramp build.
	"keen_focus": {
		"name": "KEEN FOCUS",
		"description": "+15% crit chance, +10% crit damage.",
		"tier": "common",
		"icon_path": "res://assets/icons/relic_eye_of_ether.png",
		"mods": { "crit_chance_f": 0.15, "crit_damage_bonus_f": 0.10 },
		"themes": ["flame"],
	},
	# Iter 42 — crit chance rare. Same mechanic, bigger stack. Stacks
	# multiplicatively with FLAME ascendance (fire pool on every kill)
	# because higher crit rate = more kills = more pools.
	"focused_strike": {
		"name": "FOCUSED STRIKE",
		"description": "+25% chance for hits to crit for 1.5× damage.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_executioner.png",
		"mods": { "crit_chance_f": 0.25 },
		"themes": ["flame"],
	},
	# Iter 43 — burn DoT. New axis: applies a 1.6s burn (4 ticks of 1
	# damage @ 0.4s each) on hit. Compounds with FLAME ascendance fire
	# pools (pools damage in-zone; burns damage the moving enemies).
	# A FLAME-ascendant player with this relic chains: hit → burn ticks +
	# pool stands → kill → pool drops → next mob enters → repeat.
	"embers_of_ruin": {
		"name": "EMBERS OF RUIN",
		"description": "+25% chance for hits to ignite enemies. Burning enemies take 1 damage every 0.4s for 1.6s.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_phoenix.png",
		"mods": { "burn_chance_f": 0.25 },
		"themes": ["flame"],
	},
	# Iter 44 — lifesteal on kill. Independent of bloodstone (every-3rd
	# kill flat heal) so the two stack naturally: a player with both gets
	# bloodstone's deterministic regen + chance for extra heals on top.
	# Drinking Edge is dual-themed (BLOOD primary for the regen role,
	# FLAME secondary because it ALSO requires aggression to trigger).
	"drinking_edge": {
		"name": "DRINKING EDGE",
		"description": "+15% chance to heal 1 HP on enemy kill.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_bloodstone.png",
		"mods": { "lifesteal_chance_f": 0.15 },
		"themes": ["blood", "flame"],
	},
	# Iter 44 — legendary lifesteal. Higher rate, BLOOD-only theme.
	# Pairs perfectly with executioner (kills below 25% HP) + crit
	# stacks (low-HP enemies one-shot more often → more kills).
	"crimson_hunger": {
		"name": "CRIMSON HUNGER",
		"description": "+30% chance to heal 1 HP on enemy kill. Vampiric tendrils stitch wounds shut.",
		"tier": "legendary",
		"icon_path": "res://assets/icons/relic_bloodstone.png",
		"mods": { "lifesteal_chance_f": 0.30 },
		"themes": ["blood"],
	},
	# Iter 45 — chance-based kill explosion. Drives the bullet-hell
	# chain-reaction loop: an exploding kill damages nearby enemies,
	# which may themselves explode, etc. Pair with executioner (+150%
	# damage to <25% HP enemies) and the chain death-cascade can clear
	# a wave from a single 1-shot kill on a wounded mob.
	"combustion_core": {
		"name": "COMBUSTION CORE",
		"description": "+20% chance for kills to detonate a 72-px AoE for 2 damage.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_phoenix.png",
		"mods": { "explode_on_kill_chance_f": 0.20 },
		"themes": ["flame"],
	},
	"detonator": {
		"name": "DETONATOR",
		"description": "+40% chance for kills to detonate a 72-px AoE for 2 damage. The brood remembers fire.",
		"tier": "legendary",
		"icon_path": "res://assets/icons/relic_soul_burst.png",
		"mods": { "explode_on_kill_chance_f": 0.40 },
		"themes": ["flame"],
	},
	# Iter 45 — dual-theme STORM/SHADOW relic. Cheap entry into BOTH
	# themes simultaneously, so one pick contributes to two resonance
	# tallies. Pairs naturally — both themes favor mobility + procs.
	# iter-96 retune: dropped the dead dodge_iframes mod, bumped the two
	# live mods to compensate (0.10 → 0.15 each). Still a dual-theme
	# STORM/SHADOW rare for cheap two-theme entry.
	"tempest_cloak": {
		"name": "TEMPEST CLOAK",
		"description": "Wind and lightning answer your call. +15% move speed, +15% projectile speed.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_gale_step.png",
		"mods": {
			"move_speed_mul": 0.15,
			"projectile_speed_mul": 0.15,
		},
		"themes": ["storm", "shadow"],
	},
	# Iter 46 — STORM slow debuff. Rare entry tier. Paired with chain
	# bolt / multi-shot / pierce / ricochet, slow stacks the chase
	# tempo against the enemy: they move at 55% speed for 1.4s while
	# you cleave + arc bolts. Anti-aggro positioning tool.
	"frost_pulse": {
		"name": "FROST PULSE",
		"description": "+30% chance for hits to slow enemies (55% speed for 1.4s).",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_chain_lightning.png",
		"mods": { "slow_chance_f": 0.30 },
		"themes": ["storm"],
	},
	# Iter 46 — STORM slow legendary. Higher rate + an HP buffer so
	# the player doesn't have to glass-cannon for the slow build. The
	# +max HP tag also gates a bit of synergy with BLOOD (a player
	# who picks this AND any 1 BLOOD relic gets BLOOD resonance from
	# the dual benefits even though the relic itself is mono-themed).
	"glacial_resonance": {
		"name": "GLACIAL RESONANCE",
		"description": "+50% chance for hits to slow enemies. +1 max HP. The cold seeps into your bones.",
		"tier": "legendary",
		"icon_path": "res://assets/icons/relic_echoing_strike.png",
		"mods": { "slow_chance_f": 0.50, "max_hp_bonus": 1 },
		"themes": ["storm"],
	},
	# Iter 50 — MYTHIC tier (4th rarity). Each one stacks multiple
	# axes of an existing build to a run-defining degree. Rolls only
	# on floor 2 (rooms 4-6) at 2-6% per offer. With 35 other relics
	# in the pool a player might see one mythic per 3-5 runs — they
	# stay as the chase prize that defines a memorable run.
	"cataclysm": {
		"name": "CATACLYSM",
		"description": "+50% chance for kills to detonate a 72-px AoE for 2 damage. +25% chance for hits to ignite. The dungeon answers your hunger.",
		"tier": "mythic",
		"icon_path": "res://assets/icons/relic_soul_burst.png",
		"mods": { "explode_on_kill_chance_f": 0.50, "burn_chance_f": 0.25 },
		"themes": ["flame"],
	},
	"eye_of_ether": {
		"name": "EYE OF ETHER",
		"description": "Blasts pierce 2, ricochet 2, and fire 1 extra projectile. The arcane sees through everything.",
		"tier": "mythic",
		"icon_path": "res://assets/icons/relic_eye_of_ether.png",
		"mods": { "pierce_count": 2, "ricochet_count": 2, "projectile_count": 1 },
		"themes": ["storm"],
	},
	"soul_reaver": {
		"name": "SOUL REAVER",
		"description": "+40% chance to heal 1 HP on kill. +2 max HP. +20% chance for hits to crit. Each life feeds the next.",
		"tier": "mythic",
		"icon_path": "res://assets/icons/relic_bloodstone.png",
		"mods": { "lifesteal_chance_f": 0.40, "max_hp_bonus": 2, "crit_chance_f": 0.20 },
		"themes": ["blood"],
	},
	# iter-96 retune: 2 of 3 mods were dead post-iter-95 (dodge ability
	# removed). Reanchored to dash_strike — same flavor ("you move between
	# heartbeats") via the only mobility option that's left. The combined
	# -0.40 dash cooldown + 0.15s post-iframes makes dash strike feel
	# genuinely chained-together, distinct from boots_of_haste legendary
	# which is pure walk speed.
	"phantom_step": {
		"name": "PHANTOM STEP",
		"description": "+50% move speed. -40% dash strike cooldown. +0.15s dash strike post-iframes. You move between heartbeats.",
		"tier": "mythic",
		"icon_path": "res://assets/icons/relic_nimble_step.png",
		"mods": {
			"move_speed_mul": 0.50,
			"dash_strike_cooldown_mul": -0.40,
			"dash_strike_post_iframes_bonus_f": 0.15,
		},
		"themes": ["shadow"],
	},
	# Iter 201 — SOUL SURGE. First ACTIVE relic in the registry. Every
	# other relic is passive (constant stat / occasional proc); this one
	# binds to a key (R) and triggers an explicit AoE burst around the
	# hero on press, on a 18-second cooldown. Establishes the active-
	# item pattern Isaac's D6 + Blank Card rely on — once one active
	# relic exists, future relics can use the same handler hook.
	# Mods carry an `active` tag the hero reads to wire input + cooldown.
	"soul_surge": {
		"name": "SOUL SURGE",
		"description": "Press [R] to release a violent burst around you, dealing 3 damage to all enemies within 100 px. 18 s cooldown.",
		"tier": "mythic",
		"icon_path": "res://assets/icons/relic_nimble_step.png",
		"mods": {
			"active_soul_surge": 1,
		},
		"themes": ["shadow"],
	},
	# Iter 213 — VEILSTEP (Phase 2 / Cycle 23). Second active relic;
	# defensive teleport. Press [R] to phase along the aim direction
	# ~140 px with full iframes during the transit. The verb is
	# REPOSITION, not damage — gets you out of a swarm, cancels an
	# incoming attack frame, repositions for combo. 14 s cooldown so
	# it's spammable enough to feel like a real second dodge, but
	# expensive enough that you commit to the choice.
	"veilstep": {
		"name": "VEILSTEP",
		"description": "Press [R] to phase ~140 px toward your cursor. Immune to damage during the step. 14 s cooldown.",
		"tier": "legendary",
		"icon_path": "res://assets/icons/relic_dodge.png",
		"mods": {
			"active_veilstep": 1,
		},
		"themes": ["shadow"],
	},
	# Iter 213 — ASHEN SEAL (Phase 2). Third active relic; drop a
	# stationary burning ward at hero's feet. For 4 s the ward ticks
	# BURN onto every enemy within 80 px (composes with SHATTER and
	# KINDLE_SPREAD combos). Verb is CROWD CONTROL / SPACE CONTROL —
	# drop it before a doorway, fall back, let the burn stack do the
	# work. 20 s cooldown matches its effect duration ratio.
	"ashen_seal": {
		"name": "ASHEN SEAL",
		"description": "Press [R] to scorch a sigil at your feet — enemies within 80 px catch fire for 4 s. 20 s cooldown.",
		"tier": "legendary",
		"icon_path": "res://assets/icons/relic_phoenix.png",
		"mods": {
			"active_ashen_seal": 1,
		},
		"themes": ["flame"],
	},
	# Iter 213 — BLOOD TITHE (Phase 2). Fourth active relic; trade HP
	# for power. Press [R] when HP > 1: -1 current HP, +50 % damage for
	# 6 s, AND every kill during the window heals 1 HP. The window can
	# net positive (you can come out richer than you went in) if you
	# clear well, BUT a missed kill window means flat HP loss for
	# nothing. 30 s cooldown. Verb is RISK / TEMPO — push it when you
	# have momentum and threats stacked.
	"blood_tithe": {
		"name": "BLOOD TITHE",
		"description": "Press [R] (HP > 1) to pay 1 HP for +50 % damage for 6 s. Every kill in the window heals 1 HP. 30 s cooldown.",
		"tier": "legendary",
		"icon_path": "res://assets/icons/relic_bloodstone.png",
		"mods": {
			"active_blood_tithe": 1,
		},
		"themes": ["blood"],
	},
	# Iter 203 — ECHO QUILL. Noita-tier spell-modifier relic. Pre-iter-203
	# blast was always a single-cast event (modified by relics, but
	# fundamentally one trigger = one fire). Echo Quill MODIFIES the
	# cast itself: every blast now ALSO fires a second projectile 0.16
	# s later, from the same hero position, aimed at the latest mouse
	# direction. Reads as "the spell has an after-image / echo."
	# Implementation hook: hero._start_blast detects has_relic("echo_quill")
	# and schedules a follow-up Projectile spawn via a per-cast timer.
	# Doesn't stack with itself (one echo per cast); compounds well with
	# Twin Cast (legendary) → 4 projectiles per trigger.
	"echo_quill": {
		"name": "ECHO QUILL",
		"description": "Every blast fires a SECOND projectile shortly after, aimed at your current cursor. The spell echoes.",
		"tier": "legendary",
		"icon_path": "res://assets/icons/relic_arcane_quiver.png",
		"mods": {
			"blast_echo_count": 1,
		},
		"themes": ["storm"],
	},
	# Iter 214 — SPLIT CINDER (Phase 3 spell modifier #1). Every 3rd blast
	# cast also fires 2 smaller ember sub-projectiles at ±30° from the
	# aim. Each ember does 1 damage, scaled to 70 % size, warm orange
	# tint. The verb is COVERAGE — your blast occasionally fans into
	# crowd-fragment hits without dropping focused single-target output.
	# FLAME theme. Compounds with ECHO QUILL (echo cast also rolls the
	# counter, so a sustained burst can get visually wild).
	"split_cinder": {
		"name": "SPLIT CINDER",
		"description": "Every 3rd blast also fires 2 ember sub-shots at ±30°. Smaller, single-damage, but extra coverage.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_phoenix.png",
		"mods": {
			"split_cinder_active": 1,
		},
		"themes": ["flame"],
	},
	# Iter 214 — GRAVITY NEEDLE (Phase 3 #2). All blast projectiles emit
	# a low-key gravitational drag — enemies within 32 px of the
	# projectile's flight path get a brief slow (0.5 s) applied as a
	# NEAR-MISS effect. Doesn't deal damage; the slow is the entire
	# point. Combos with SHATTER (apply burn while they're slowed →
	# free SHATTER procs) and feeds RIME_TRAIL / future combos. SHADOW
	# theme. Visible trail: faint violet smear behind the projectile.
	"gravity_needle": {
		"name": "GRAVITY NEEDLE",
		"description": "Blasts drag at nearby enemies — anyone within 32 px of the projectile's path is briefly slowed.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_dodge.png",
		"mods": {
			"gravity_needle_active": 1,
		},
		"themes": ["shadow"],
	},
	# Iter 214 — STATIC RUNES (Phase 3 #3). Every 4th blast cast bumps
	# storm_chain_count on the spawned projectile(s) by +1, so the cast
	# arcs to one extra enemy regardless of STORM theme tier. Visible
	# but restrained — a single sharp chain arc per proc, no screen
	# clutter. Compounds with STORM theme tier (tier 1 + Runes proc
	# = 2 chains on that cast). STORM theme. Damage on the chain is
	# 0.8× to avoid making this a flat upgrade vs STORM tier 2.
	"static_runes": {
		"name": "STATIC RUNES",
		"description": "Every 4th blast also arcs a chain bolt to one extra enemy nearby (1× damage chain, additive with STORM).",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_chain_lightning.png",
		"mods": {
			"static_runes_active": 1,
		},
		"themes": ["storm"],
	},
	# Iter 56 — familiar pet relics. Drive familiar_count modifier
	# which main.gd._sync_familiars reads to spawn / despawn wisps
	# that orbit the hero and auto-fire at nearby enemies. Pairs
	# perfectly with the STORM bullet-hell direction: hero swings +
	# chains arcs + multi-shot blasts + 1-3 familiars also fire =
	# full screen coverage.
	"wisp_companion": {
		"name": "WISP COMPANION",
		"description": "A glowing wisp orbits you and fires bolts at nearby enemies.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_chain_lightning.png",
		"mods": { "familiar_count": 1 },
		"themes": ["storm"],
	},
	"phantom_squad": {
		"name": "PHANTOM SQUAD",
		"description": "Two more wisps join the orbit. Three lightning-bolts seek alongside you.",
		"tier": "legendary",
		"icon_path": "res://assets/icons/relic_echoing_strike.png",
		"mods": { "familiar_count": 2 },
		"themes": ["storm"],
	},
	# iter-96 Phase B retune: was legendary +2 HP, which the rare
	# aegis_plate (+2 HP, -1 DR) strictly dominated. Bumped to +3 HP
	# and added -1 DR so heart_of_stone is a real legendary tank
	# stat-stick, distinct from aegis_plate and a worthy late-floor pick.
	"heart_of_stone": {
		"name": "HEART OF STONE",
		"description": "+3 max HP, -1 incoming damage.",
		"tier": "legendary",
		"icon_path": "res://assets/icons/relic_max_hp.png",
		"mods": { "max_hp_bonus": 3, "damage_taken_reduction": 1 },
		"themes": ["blood"],
	},
	"boots_of_haste": {
		"name": "BOOTS OF HASTE",
		"description": "Move speed +60%. The dungeon blurs by.",
		"tier": "legendary",
		"icon_path": "res://assets/icons/relic_nimble_step.png",
		"mods": { "move_speed_mul": 0.6 },
		"themes": ["shadow"],
	},
	# iter-96 Phase B retune: description now honest about behavior —
	# the per-room hero re-instantiation means _second_wind_used resets
	# on room transition, so the relic fires once per ROOM (not per run
	# as the old description claimed). That makes it the "safety net
	# per encounter" relic, distinct from phoenix_feather's premium
	# "once per run, full HP" revive. Also bumped post-revive i-frames
	# from HIT_IFRAMES*2.0 to HIT_IFRAMES*2.5 in hero.take_damage so the
	# brief invuln window feels generous enough to reposition.
	"second_wind": {
		"name": "SECOND WIND",
		"description": "A killing blow each room leaves you at 1 HP instead — and grants extended invulnerability.",
		"tier": "legendary",
		"icon_path": "res://assets/icons/relic_second_wind.png",
		"mods": {},   # triggered — see hero.take_damage
		"themes": ["blood"],
	},
	"bloodstone": {
		"name": "BLOODSTONE",
		"description": "Every 3rd enemy slain heals 1 HP.",
		"tier": "legendary",
		"icon_path": "res://assets/icons/relic_bloodstone.png",
		"mods": {},   # triggered — see hero._on_enemy_died_for_relics
		"themes": ["blood"],
	},
	"arcane_resonance": {
		"name": "ARCANE RESONANCE",
		"description": "Every 4th blast strikes for double.",
		"tier": "legendary",
		"icon_path": "res://assets/icons/relic_echoing_strike.png",
		"mods": {},   # triggered — see hero._start_blast
		"themes": ["storm"],
	},
	"chain_lightning": {
		"name": "CHAIN LIGHTNING",
		"description": "Every 4th sword hit arcs to a 2nd enemy nearby.",
		"tier": "legendary",
		"icon_path": "res://assets/icons/relic_chain_lightning.png",
		"mods": {},   # triggered — see hero._resolve_melee_strike
		"themes": ["storm"],
	},
	# iter-105: phoenix_feather restored to original design intent —
	# truly once per RUN, not per room. The gating flag was promoted
	# from a hero-instance var (which reset on every room reload) to
	# GameState.phoenix_feather_used, which only resets in
	# start_dungeon_run. Description reverted to the honest "Once per
	# run" claim. (Iter-101 had updated text to "Each room" to match
	# the buggy behavior as a stop-gap; iter-105 fixes the BEHAVIOR
	# instead.)
	"phoenix_feather": {
		"name": "PHOENIX FEATHER",
		"description": "Once per run, a killing blow restores you to FULL HP.",
		"tier": "legendary",
		"icon_path": "res://assets/icons/relic_phoenix.png",
		"mods": {},   # triggered — see hero.take_damage (preempts second_wind)
		"themes": ["blood"],
	},
	"executioner": {
		"name": "EXECUTIONER",
		"description": "+150% damage to enemies below 25% HP.",
		"tier": "legendary",
		"icon_path": "res://assets/icons/relic_executioner.png",
		"mods": {},   # triggered — see hero._resolve_melee_strike / _resolve_dash_strike_hit / projectile.gd
		"themes": ["flame"],
	},
	"soul_burst": {
		"name": "SOUL BURST",
		"description": "Every 5th enemy slain detonates a small soul burst.",
		"tier": "legendary",
		"icon_path": "res://assets/icons/relic_soul_burst.png",
		"mods": {},   # triggered — see hero._on_enemy_died_for_relics
		"themes": ["flame"],
	},
	"iron_resolve": {
		"name": "IRON RESOLVE",
		"description": "The first wound each room is fully absorbed.",
		"tier": "legendary",
		"icon_path": "res://assets/icons/relic_iron_resolve.png",
		"mods": {},   # triggered — see hero.take_damage
		"themes": ["vow"],
	},
	# Iter 226 / Expansion Team — currency relic #1. Ether Magnet
	# multiplies ether shard rewards from all sources (room clear, boss
	# kill, run complete, lucky_knife bonus drop) by 1.25× for the rest
	# of the run. Folds via `ether_shard_drop_mul_f` modifier read in
	# GameState.award_ether_shards. SHADOW themed (covert / scavenger
	# flavor) — also bolsters SHADOW resonance which was the thinnest
	# pool pre-iter-102.
	"ether_magnet": {
		"name": "ETHER MAGNET",
		"description": "+25% Ether Shards from all sources for the rest of this run. Shards bend toward you.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_eye_of_ether.png",
		"mods": { "ether_shard_drop_mul_f": 0.25 },
		"themes": ["shadow"],
	},
	# Iter 226 / Expansion Team — counter/reactive relic. Sacrificial
	# Echo follows the bloodstone every-N-kills heal pattern: every 5th
	# kill heals +1 HP (capped at max_hp). Distinct cadence from
	# bloodstone (every 3) and lifestone (every 8) so a player can stack
	# all three for a layered BLOOD regen ramp at 3 / 5 / 8 kill ticks.
	# Triggered — handler reads has_relic + per-run counter in hero.gd
	# (_sacrificial_echo_counter).
	"sacrificial_echo": {
		"name": "SACRIFICIAL ECHO",
		"description": "Every 5th enemy slain whispers life back into you — heal 1 HP.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_bloodstone.png",
		"mods": {},   # triggered — see hero._on_enemy_died_for_relics
		"themes": ["blood"],
	},
	# Iter 226 / Expansion Team — summon archetype #1 (stationary turret).
	# Sums via `summon_turret_count` modifier; main.gd._sync_turrets()
	# parallels _sync_familiars(). Turret spawns at hero's room-entry
	# position, stays put, scans for enemies in 200px and fires every
	# 1.5s. STORM theme parity with familiars (wisp_companion /
	# phantom_squad) — but the verb is "drop a ward" not "orbit you,"
	# so positional choice now matters: where you stand on room load
	# is where the turret guards.
	"summon_stone": {
		"name": "SUMMON STONE",
		"description": "At room start, conjure a stationary turret that strikes nearby enemies every 1.5s.",
		"tier": "legendary",
		"icon_path": "res://assets/icons/relic_chain_lightning.png",
		"mods": { "summon_turret_count": 1 },
		"themes": ["storm"],
	},
	# Iter 226 / Expansion Team — currency relic #2. Lucky Knife
	# couples the crit build to the meta-currency loop: any sword crit
	# that kills its target has `crit_bonus_ether_chance_f` to drop
	# +1 Ether Shard at the kill site. Reads as "lucky cuts pay you
	# back" — pairs naturally with keen_focus / focused_strike /
	# umbral_thread / SHADOW theme tier (which all increase crit
	# chance, which increases the proc rate). Folds via
	# `crit_bonus_ether_chance_f` (0..1 float modifier) read at the
	# crit-kill site in hero._resolve_melee_strike.
	"lucky_knife": {
		"name": "LUCKY KNIFE",
		"description": "Sword crits that kill have a 25% chance to drop +1 Ether Shard at the strike. Lucky cuts repay themselves.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_executioner.png",
		"mods": { "crit_bonus_ether_chance_f": 0.25 },
		"themes": ["shadow"],
	},
}

var owned_relics: Array[String] = []

# Iter 33 — shrine grants. Permanent (within-run) stat bonuses from
# Shrine Of Vows prayer rooms. Stacks WITH relic modifiers via
# modifier_total / modifier_total_f (both sum shrine_bonuses[key]
# into their relic-side total). Cleared on start_dungeon_run so
# bonuses don't carry across runs.
#
# Key naming matches the relic modifier convention (e.g.
# "max_hp_bonus", "melee_damage_bonus", "dodge_cd_mul_f") so callers
# don't need to know about shrines specifically — they just read the
# combined modifier_total and shrine values participate transparently.
var shrine_bonuses: Dictionary = {}

func grant_shrine_bonus(key: String, value) -> void:
	var current = shrine_bonuses.get(key, 0)
	shrine_bonuses[key] = current + value

# Iter 57 — achievements. Persistent across runs (save_to_dict
# includes unlocked_achievements). Tracks milestones that the player
# accomplishes across all play sessions, giving long-term goals
# beyond the per-run roguelite loop.
#
# Registry maps id → {name, description}. Adding a new achievement
# is a single entry here + the corresponding unlock check at the
# emit site (kill counter / combo / boss death / etc).
#
# Achievements never UN-lock — once granted, they persist forever
# (until the save file is deleted). The unlock_achievement helper
# guards against re-firing and emits Events.achievement_unlocked
# so the HUD popup banner can show.
const ACHIEVEMENTS := {
	"first_blood": {
		"name": "FIRST BLOOD",
		"description": "Slay your first enemy.",
	},
	"centurion": {
		"name": "CENTURION",
		"description": "Slay 100 enemies in a single run.",
	},
	"hot_streak": {
		"name": "HOT STREAK",
		"description": "Reach a 50-hit combo.",
	},
	"perfect_streak": {
		"name": "PERFECT STREAK",
		"description": "Reach a 100-hit combo.",
	},
	"mythic_find": {
		"name": "MYTHIC FIND",
		"description": "Claim a mythic-tier relic.",
	},
	"phase_3_survivor": {
		"name": "PHASE 3 SURVIVOR",
		"description": "Witness a boss enter phase 3.",
	},
	"iron_revenant_slain": {
		"name": "IRON CRYPT CLEARED",
		"description": "Defeat the Iron Revenant.",
	},
	"broodmother_slain": {
		"name": "QUEEN OF SPIDERS",
		"description": "Defeat the Broodmother.",
	},
	"flame_devotee": {
		"name": "FLAME DEVOTEE",
		"description": "Own 4 FLAME relics in one run.",
	},
	"storm_devotee": {
		"name": "STORM DEVOTEE",
		"description": "Own 4 STORM relics in one run.",
	},
	"blood_devotee": {
		"name": "BLOOD DEVOTEE",
		"description": "Own 4 BLOOD relics in one run.",
	},
	"vow_devotee": {
		"name": "VOW DEVOTEE",
		"description": "Own 4 VOW relics in one run.",
	},
	"shadow_devotee": {
		"name": "SHADOW DEVOTEE",
		"description": "Own 4 SHADOW relics in one run.",
	},
}

var unlocked_achievements: Array[String] = []

# Idempotent — re-fire is a silent no-op. Emits the unlock event +
# saves immediately so a crash after unlock doesn't lose the
# achievement. Returns true if this call actually unlocked it.
func unlock_achievement(id: String) -> bool:
	if not ACHIEVEMENTS.has(id):
		return false
	if id in unlocked_achievements:
		return false
	unlocked_achievements.append(id)
	Events.achievement_unlocked.emit(id)
	# Save immediately so the unlock persists even if the game crashes.
	if Engine.get_main_loop().root.has_node("/root/SaveSystem"):
		var ss = Engine.get_main_loop().root.get_node("/root/SaveSystem")
		if ss.has_method("save_now"):
			ss.save_now()
	return true

# Helper for the theme-devotee achievements — checks current count.
func _check_theme_devotee_achievements() -> void:
	var theme_to_id: Dictionary = {
		"flame": "flame_devotee",
		"storm": "storm_devotee",
		"blood": "blood_devotee",
		"vow": "vow_devotee",
		"shadow": "shadow_devotee",
	}
	for theme in theme_to_id.keys():
		if theme_count(theme) >= 4:
			unlock_achievement(theme_to_id[theme])

# Iter 39 — theme tagging + resonance. Each relic in RELIC_REGISTRY
# carries a "themes" array (one or two strings from STORM / FLAME /
# BLOOD / VOW / SHADOW). Owning N relics of a theme unlocks tiered
# bonuses:
#   tier 1 (RESONANCE)  — 2+ owned: small stat fold (handled in
#                         modifier_total via theme_stat_bonuses)
#   tier 2 (ASCENDANCE) — 4+ owned: mechanical flavor (e.g. STORM
#                         fires a mini-bolt on every Nth swing —
#                         hooked in hero.gd via theme_tier checks)
#
# theme_count tallies the player's currently-owned relics that
# include `theme` in their themes array. Used by HUD chips, by the
# resonance/ascendance gates in hero.gd, and by modifier_total's
# theme_stat_bonuses fold.
const RESONANCE_THRESHOLD: int = 2
const ASCENDANCE_THRESHOLD: int = 4

func theme_count(theme: String) -> int:
	var n: int = 0
	for rid in owned_relics:
		var info: Dictionary = RELIC_REGISTRY.get(rid, {})
		var themes: Array = info.get("themes", [])
		if theme in themes:
			n += 1
	return n

# Returns 0 (none), 1 (resonance, ≥2 owned), or 2 (ascendance, ≥4
# owned). Used by HUD + by hero.gd's combat hooks to gate the
# mechanical flavor (ascendance) effects.
func theme_tier(theme: String) -> int:
	var n: int = theme_count(theme)
	if n >= ASCENDANCE_THRESHOLD:
		return 2
	if n >= RESONANCE_THRESHOLD:
		return 1
	return 0

# Per-theme resonance bonuses. Returns a Dictionary of modifier_key →
# value to fold into modifier_total / modifier_total_f.
# Resonance bonus (≥2 owned):
#   STORM   +1 blast damage
#   FLAME   +1 sword damage
#   BLOOD   +1 max HP
#   VOW     +1 damage taken reduction on first hit each room
#           (stacks with iron_will's first-hit, applies to ALL
#           VOW owners — flat folded as 1 incoming dmg reduction).
#   SHADOW  +5% crit chance, +5% move speed (iter-96 retune — was
#           +0.08s dodge i-frames pre-iter-95 dodge deletion)
# Ascendance (≥4 owned) bonuses are mechanical effects, handled by
# hero.gd / projectile.gd hooks; this function only returns the
# stat-fold contributions.
func theme_stat_bonuses() -> Dictionary:
	var out: Dictionary = {}
	if theme_tier("storm") >= 1:
		out["blast_damage_bonus"] = int(out.get("blast_damage_bonus", 0)) + 1
	if theme_tier("flame") >= 1:
		out["sword_damage_bonus"] = int(out.get("sword_damage_bonus", 0)) + 1
	if theme_tier("blood") >= 1:
		out["max_hp_bonus"] = int(out.get("max_hp_bonus", 0)) + 1
	if theme_tier("vow") >= 1:
		out["damage_taken_reduction"] = int(out.get("damage_taken_reduction", 0)) + 1
	# iter-96: SHADOW resonance used to grant `dodge_iframes_bonus_f`
	# which became a dead key when iter-95 deleted the dodge ability.
	# Re-anchored to two live, on-brand mods — crit chance + move speed.
	# Both feel "shadowy" (precision strikes + glide between heartbeats)
	# and stack naturally with the SHADOW relic identity.
	if theme_tier("shadow") >= 1:
		out["crit_chance_f"] = float(out.get("crit_chance_f", 0.0)) + 0.05
		out["move_speed_mul"] = float(out.get("move_speed_mul", 0.0)) + 0.05
	return out

# Helper for HUD: returns the active themes (tier >= 1) keyed to
# their tier so the chip strip can render them in display order
# without re-counting.
func active_themes() -> Dictionary:
	var out: Dictionary = {}
	for theme in ["storm", "flame", "blood", "vow", "shadow"]:
		var t: int = theme_tier(theme)
		if t > 0:
			out[theme] = t
	return out

# ── Persisted settings ───────────────────────────────────────────────
# Master audio volume in linear 0..1 space. Source-of-truth for the
# settings slider; the slider seeds itself from this value on open and
# writes back through SaveSystem on change. Audio.set_master_volume()
# is the consumer (converts to dB for the Master bus).
var master_volume: float = 0.7

# Iter 221 / Beta M2 — Accessibility settings. Persist via save_to_dict
# (save_version v8). Read at the use site (audio.gd, fx.gd, hero.gd,
# main.gd) so changes take effect immediately on settings save without
# requiring a scene reload.
var music_volume: float = 0.8           # multiplies master for music bus
var sfx_volume: float = 1.0             # multiplies master for SFX bus
var screen_shake_intensity: float = 1.0 # 0.0 = off, 1.0 = full trauma
var motion_reduction: bool = false      # kills camera lerp + parallax
var text_scale: float = 1.0             # 1.0 → 1.3 maximum
var colorblind_mode: String = "none"    # "none"|"deuter"|"prota"|"trita"|"highcontrast"

# ── Save / load serialization ────────────────────────────────────────
# Round-tripped through SaveSystem (user://ethera_save.json). Versioned
# so future schema changes can be migrated rather than dropped. Keep
# this dict flat — JSON tolerates nesting fine, but a flat shape is
# easiest to diff in a text editor when debugging save files.
func save_to_dict() -> Dictionary:
	return {
		"save_version": SAVE_VERSION_CURRENT,   # iter 218 — extracted constant for migration
		"owned_relics": owned_relics,
		"session_kills": session_kills,
		"dungeon_runs": dungeon_runs,
		"last_run_kills": last_run_kills,
		"best_run_kills": best_run_kills,
		"last_run_time": last_run_time,
		"best_run_time": best_run_time,
		"master_volume": master_volume,
		"unlocked_achievements": unlocked_achievements,
		"has_seen_controls_hint": has_seen_controls_hint,
		"has_completed_tutorial": has_completed_tutorial,
		"ether_shards": ether_shards,
		"ether_lifetime_earned": ether_lifetime_earned,
		"upgrade_levels": upgrade_levels.duplicate(),
		"music_volume": music_volume,
		"sfx_volume": sfx_volume,
		"screen_shake_intensity": screen_shake_intensity,
		"motion_reduction": motion_reduction,
		"text_scale": text_scale,
		"colorblind_mode": colorblind_mode,
		# iter-246 / Director Phase 4 — persistent list of room
		# display_names whose first-clear bonus has already paid out.
		# Saved across sessions so the per-room bonus is truly
		# one-time-per-save (not per-run). Stored as Array[String]
		# (JSON serializes cleanly).
		"floor_clear_bonuses_claimed": floor_clear_bonuses_claimed,
	}

# Current save schema version. Bump when fields are added/removed in a
# breaking way; add a corresponding migration step in _migrate_save_dict.
# Iter 218 / Beta M0.F — extracted as a constant so `_migrate_save_dict`
# can target it explicitly and tests can introspect.
# iter-246 / Director Phase 4 — bumped 8 → 9 to introduce
# floor_clear_bonuses_claimed (new per-save list of room
# display_names whose first-clear payout has been claimed).
const SAVE_VERSION_CURRENT: int = 9

# Iter 218 / Beta M0.F — Save migration foundation. The audit found
# save_version was written but never read on load — any future schema
# break would silently corrupt or drop player progress. This helper is
# now called at the top of load_from_dict; it normalizes an arbitrary
# (older) save into the CURRENT schema shape. Each version bump that
# breaks shape MUST add a step here.
#
# Convention: migrations are forward-only (v3 → v4 → v5 step-by-step,
# never v3 → v5 directly). Keeps each step small and auditable.
func _migrate_save_dict(d: Dictionary) -> Dictionary:
	var from_version: int = int(d.get("save_version", 0))
	# Already current — nothing to do.
	if from_version >= SAVE_VERSION_CURRENT:
		return d
	# v0 → v1: pre-versioned saves (no save_version key, no
	# best_run_kills). Fall through to v1+ logic below.
	if from_version < 1:
		# Initialize the new fields with safe defaults; later
		# migrations may refine.
		if not d.has("best_run_kills"):
			d["best_run_kills"] = d.get("last_run_kills", 0)
		from_version = 1
	# v1 → v2: introduced master_volume.
	if from_version < 2:
		if not d.has("master_volume"):
			d["master_volume"] = 0.7
		from_version = 2
	# v2 → v3: introduced unlocked_achievements.
	if from_version < 3:
		if not d.has("unlocked_achievements"):
			d["unlocked_achievements"] = []
		from_version = 3
	# v3 → v4: introduced has_seen_controls_hint.
	if from_version < 4:
		if not d.has("has_seen_controls_hint"):
			d["has_seen_controls_hint"] = false
		from_version = 4
	# v4 → v5: introduced last_run_time, best_run_time,
	# has_completed_tutorial.
	if from_version < 5:
		if not d.has("last_run_time"):
			d["last_run_time"] = 0.0
		if not d.has("best_run_time"):
			d["best_run_time"] = -1.0
		if not d.has("has_completed_tutorial"):
			d["has_completed_tutorial"] = false
		from_version = 5
	# v5 → v6: introduced ether_shards + ether_lifetime_earned
	# (Beta M1.0 persistent currency).
	if from_version < 6:
		if not d.has("ether_shards"):
			d["ether_shards"] = 0
		if not d.has("ether_lifetime_earned"):
			d["ether_lifetime_earned"] = 0
		from_version = 6
	# v6 → v7: introduced upgrade_levels (Beta M1.1 upgrade tree).
	if from_version < 7:
		if not d.has("upgrade_levels"):
			d["upgrade_levels"] = {
				"resilience": 0, "quick_step": 0, "first_talisman": 0,
				"tribute": 0, "bound_vow": 0,
			}
		from_version = 7
	# v7 → v8: introduced accessibility settings (Beta M2 batch).
	if from_version < 8:
		if not d.has("music_volume"):
			d["music_volume"] = 0.8
		if not d.has("sfx_volume"):
			d["sfx_volume"] = 1.0
		if not d.has("screen_shake_intensity"):
			d["screen_shake_intensity"] = 1.0
		if not d.has("motion_reduction"):
			d["motion_reduction"] = false
		if not d.has("text_scale"):
			d["text_scale"] = 1.0
		if not d.has("colorblind_mode"):
			d["colorblind_mode"] = "none"
		from_version = 8
	# v8 → v9: iter-246 / Director Phase 4 — introduced the per-save
	# floor_clear_bonuses_claimed list (first-clear ether shard payout
	# memo, keyed by RoomConfig.display_name). Pre-v9 saves default
	# to empty: the existing player gets to re-experience the
	# first-clear payout on their next run through each room, which
	# is the desired upgrade behavior (it's a long-tail completion
	# carrot, not a permanent loss).
	if from_version < 9:
		if not d.has("floor_clear_bonuses_claimed"):
			d["floor_clear_bonuses_claimed"] = []
		from_version = 9
	# Future versions: add `if from_version < N:` block here.
	d["save_version"] = SAVE_VERSION_CURRENT
	return d

# Tolerant loader: every field has a default, missing keys are ignored,
# wrong-type values fall back to defaults. This is the forward-compat
# contract for older save files (e.g. a v0 file with no master_volume
# still loads, just keeps the default volume). JSON round-trips ints
# as floats, so we coerce numeric fields back to int explicitly.
# Iter 218 / Beta M0.F — runs _migrate_save_dict FIRST so an older
# schema is normalized to current before per-field reads. Each per-
# field read already had its own default, so this is belt-and-suspenders,
# but explicit migration makes future breaking-change paths obvious.
func load_from_dict(d: Dictionary) -> void:
	d = _migrate_save_dict(d)
	session_kills = int(d.get("session_kills", 0))
	dungeon_runs = int(d.get("dungeon_runs", 0))
	last_run_kills = int(d.get("last_run_kills", 0))
	# best_run_kills (iter 23) — defaults to last_run_kills when missing
	# (v1 save files), so an old save loaded into v2 gets a reasonable
	# starting "best" instead of 0.
	best_run_kills = int(d.get("best_run_kills", last_run_kills))
	# Iter 158 — run-time fields. Missing on pre-v5 saves → 0.0 last, -1.0
	# best (sentinel for "no completed run yet").
	last_run_time = float(d.get("last_run_time", 0.0))
	best_run_time = float(d.get("best_run_time", -1.0))
	master_volume = clampf(float(d.get("master_volume", 0.7)), 0.0, 1.0)
	# iter-123: tolerant load of the controls-hint flag. Missing key on
	# pre-v4 saves → false (player hasn't seen the hint on this profile,
	# so it shows on next room load — desired behavior on upgrade).
	# Iter 196 — fix iter-191 regression. `as bool` returns null on
	# primitive types in Godot 4; explicit == true comparison gives a
	# real bool safe for typed assignment.
	has_seen_controls_hint = d.get("has_seen_controls_hint", false) == true
	# Iter 160 — tutorial completion flag. Missing on pre-v5 saves → false
	# (the existing player sees the tutorial on their next first room
	# load — fine, it's a 30-second beat that auto-completes once they
	# play).
	has_completed_tutorial = d.get("has_completed_tutorial", false) == true
	# Iter 219 / Beta M1.0 — persistent Ether Shard currency. Migration
	# defaults pre-v6 saves to 0 shards (player starts the meta loop
	# from scratch on first launch with the new currency).
	ether_shards = int(d.get("ether_shards", 0))
	ether_lifetime_earned = int(d.get("ether_lifetime_earned", 0))
	# Iter 220 / Beta M1.1 — upgrade tree levels. Validate each known
	# node_id; ignore unknown keys (forward compat with future trees).
	var loaded_up: Variant = d.get("upgrade_levels", {})
	if loaded_up is Dictionary:
		for k in upgrade_levels.keys():
			if loaded_up.has(k):
				upgrade_levels[k] = int(loaded_up[k])
	# Iter 221 / Beta M2 — accessibility settings.
	music_volume = clampf(float(d.get("music_volume", 0.8)), 0.0, 1.0)
	sfx_volume = clampf(float(d.get("sfx_volume", 1.0)), 0.0, 1.0)
	screen_shake_intensity = clampf(float(d.get("screen_shake_intensity", 1.0)), 0.0, 1.0)
	motion_reduction = d.get("motion_reduction", false) == true
	text_scale = clampf(float(d.get("text_scale", 1.0)), 1.0, 1.3)
	var cm: Variant = d.get("colorblind_mode", "none")
	if cm is String:
		colorblind_mode = String(cm)

	# Array[String] needs a fresh typed array — JSON returns a plain
	# Array (no element typing) so we rebuild element-by-element and
	# skip anything that isn't actually a string. Defensive against a
	# user hand-editing the save file and putting garbage in here.
	var loaded_relics: Variant = d.get("owned_relics", [])
	var fresh: Array[String] = []
	if loaded_relics is Array:
		for rid in loaded_relics:
			if rid is String:
				fresh.append(rid)
	owned_relics = fresh
	# Iter 57 — load achievements. Same tolerant pattern as owned_relics:
	# typed Array[String] rebuild element-by-element, skip garbage.
	# Missing key on older save files → empty array (no unlocks yet),
	# graceful first-time-with-new-version upgrade.
	var loaded_achievements: Variant = d.get("unlocked_achievements", [])
	var fresh_ach: Array[String] = []
	if loaded_achievements is Array:
		for ach in loaded_achievements:
			if ach is String and ACHIEVEMENTS.has(ach):
				fresh_ach.append(ach)
	unlocked_achievements = fresh_ach

	# iter-246 / Director Phase 4 — floor_clear_bonuses_claimed list.
	# JSON returns untyped Array; rebuild as Array[String] element-by-
	# element, skipping non-strings (defensive against hand-edited saves).
	var loaded_bonuses: Variant = d.get("floor_clear_bonuses_claimed", [])
	var fresh_bonuses: Array[String] = []
	if loaded_bonuses is Array:
		for room_name in loaded_bonuses:
			if room_name is String:
				fresh_bonuses.append(room_name)
	floor_clear_bonuses_claimed = fresh_bonuses

# ── Session API ──────────────────────────────────────────────────────
func start_dungeon_run() -> void:
	# Iter 23 — promote the PREVIOUS run's kill count to best_run_kills
	# BEFORE resetting last_run_kills. Captures both flows (death → menu
	# → BEGIN, and run-complete → menu → BEGIN) without requiring an
	# explicit end-run hook.
	if last_run_kills > best_run_kills:
		best_run_kills = last_run_kills
	# Iter 158 — same promotion for time. last_run_time is captured by
	# finalize_run_time() at hero death OR final-boss victory; here we
	# promote it to best_run_time (faster = better, so MIN rather than
	# MAX). The -1 sentinel on best means "no completed run yet" and any
	# positive last_run_time wins on the first comparison.
	if last_run_time > 0.0 and (best_run_time < 0.0 or last_run_time < best_run_time):
		best_run_time = last_run_time
	# Reset last_run_time so the in-run HUD label can show 0:00 freshly
	# while the new run starts. RunState.start_floor() sets the actual
	# run_start_msec on the very next call.
	last_run_time = 0.0
	dungeon_runs += 1
	last_run_kills = 0
	# Iter 16 bug fix: roguelite contract — a new run starts with no
	# relics. Previously owned_relics was never cleared, so relics from
	# the first run persisted into the second (and third, and fourth…),
	# defeating the choose-3-of-N decision loop. SaveSystem still
	# persists the array between sessions, but a fresh run wipes it.
	# Long-term metaprogression (true persistent unlocks) would live in
	# a separate field.
	owned_relics = []
	shrine_bonuses = {}            # iter 33 — clear stat grants from prior run
	persisted_hp = -1
	# iter-105: phoenix_feather true once-per-run reset.
	phoenix_feather_used = false
	# iter-229 / Polish Team R2 — clear death-screen run summary stats.
	# These are intra-run scratch (captured at hero death, read by the
	# death overlay, cleared here when the next run begins).
	last_run_death_source = ""
	last_run_biggest_hit = 0
	last_run_combo_counts = {}
	# iter-245 / Director Phase 3 — biggest combo streak this run. Clear
	# alongside the other intra-run summary stats so each fresh run
	# starts at 0 regardless of how big the prior run's streak got.
	best_combo_this_run = 0
	# iter-246 / Director Phase 4 — reset the pedestal-offer counter so
	# the first 3 pedestals of THIS run get the rare-biased pattern
	# (VS chest 1-1-3-1-5 grammar). Without this, a fresh run wouldn't
	# trigger the early-dopamine bias.
	_pedestal_offers_this_run = 0
	# iter-246 / Director Phase 4 — reset the theme-tier stinger memo
	# so each run can re-discover its STORM / FLAME / BLOOD / VOW /
	# SHADOW thresholds. Tier 0 = "never shown a stinger for this
	# theme in this run." The map is constructed by key list so adding
	# a new theme just requires the new key here.
	_theme_tier_seen = {
		"storm": 0, "flame": 0, "blood": 0, "vow": 0, "shadow": 0,
	}
	# iter-239 / Fun Ideas Team R4 — DO NOT clear active_floor_modifiers
	# here. The pre-run modal (main_menu.gd) writes to the field BEFORE
	# calling start_dungeon_run(), so a clear here would wipe the
	# player's choices on the very transition that should commit them.
	# Modifiers are cleared by main_menu when the player declines / when
	# they exit back to the menu after a death, NOT mid-handoff.
	#
	# Reset HP carryover too — without this, a quit-mid-run could leave
	# persisted_hp populated and the next run's hero would spawn at the
	# saved HP value instead of full health.

func register_run_kill() -> void:
	last_run_kills += 1
	session_kills += 1
	# Iter 57 — kill-based achievement checks.
	if last_run_kills == 1:
		unlock_achievement("first_blood")
	if last_run_kills >= 100:
		unlock_achievement("centurion")

# Iter 158 — snapshot the current run timer into last_run_time and
# persist immediately. Called once per run, from main.gd at either:
#   • Hero death (final defeat)
#   • Final-boss victory (when Broodmother is_last_room cleared)
# Idempotent: re-calling within the same run just overwrites with the
# same elapsed value. Doesn't promote to best_run_time here — that
# happens on the NEXT start_dungeon_run() so we don't have to detect
# whether the just-ended run was a victory vs death (best-time should
# arguably only count victories, but for the prototype we treat any
# completed-shape run as worthy of the leaderboard).
func finalize_run_time() -> void:
	if Engine.get_main_loop().root.has_node("/root/RunState"):
		var rs = Engine.get_main_loop().root.get_node("/root/RunState")
		if rs.has_method("run_elapsed_seconds"):
			last_run_time = float(rs.run_elapsed_seconds())
	# Persist immediately so a crash post-finalize doesn't lose it.
	if Engine.get_main_loop().root.has_node("/root/SaveSystem"):
		var ss = Engine.get_main_loop().root.get_node("/root/SaveSystem")
		if ss.has_method("save_now"):
			ss.save_now()

# iter-229 / Polish Team R2 — snapshot the dying hero's stats into
# GameState so the death-screen overlay can render them. Mirrors the
# finalize_run_time() pattern (one-shot copy on hero death). Skips
# the save_now persist call because these fields aren't in save_to_dict
# (they're intra-run scratch — the next start_dungeon_run clears them).
func finalize_run_death_stats(source_name: String, biggest_hit: int) -> void:
	last_run_death_source = source_name
	last_run_biggest_hit = biggest_hit

# iter-229 / Polish Team R2 — bump the named-combo counter. Called
# from enemy.gd at the SHATTER / KINDLE trigger sites. Lazy-creates
# the dict entry, so the call is safe on the first ever proc of a
# given combo type.
func note_combo_fired(combo_name: String) -> void:
	if combo_name == "":
		return
	var prev: int = int(last_run_combo_counts.get(combo_name, 0))
	last_run_combo_counts[combo_name] = prev + 1

# Back-compat for hamlet's existing call.
func register_kill() -> void:
	session_kills += 1

# ── Active Relic Registry ────────────────────────────────────────────
# Iter 213 — Phase 2 active relic toolkit. List of all relics that bind
# to the [R] button. Priority is array order — if the player owns more
# than one, the first in this list "claims" the button. (BoI-style:
# the player only has ONE active slot conceptually, even if multiple
# active items have been picked up. Future enhancement: hamlet UI to
# swap which active is bound.) When adding a new active here, also:
#   1. Add a registry entry above (with "active_<id>" mod key).
#   2. Add a _trigger_<id> handler in hero.gd.
#   3. Add a label entry in main.gd's _active_relic_label_text.
const ACTIVE_RELIC_IDS: Array[String] = [
	"veilstep",      # SHADOW — defensive teleport (iter 213)
	"ashen_seal",    # FLAME  — burning sigil drop (iter 213)
	"blood_tithe",   # BLOOD  — risk/reward tempo (iter 213)
	"soul_surge",    # SHADOW — AoE damage burst (iter 201)
]

# Returns the id of the FIRST owned active relic, or "" if none. The
# hero's input handler uses this to decide which _trigger_* to invoke
# on [R] press.
func get_owned_active_id() -> String:
	for id in ACTIVE_RELIC_IDS:
		if id in owned_relics:
			return id
	return ""

# ── Beta M1.0 — Ether Shard API ──────────────────────────────────────
# Iter 219 — persistent currency awarded at gameplay events. The
# accumulator persists ACROSS RUNS via save_to_dict. Spending happens in
# a future M1.1 hub scene against the 5-node upgrade tree.
const SHARDS_PER_ROOM_CLEAR: int = 5
const SHARDS_PER_BOSS_KILL: int = 15
const SHARDS_PER_RUN_COMPLETE: int = 30  # bonus on top of clear / boss

# Awards `amount` ether shards. Updates lifetime counter too. Saves
# IMPLICITLY — caller is responsible for invoking SaveSystem.save() at
# the right moment (typically on death/clear/transition, not per-room
# event, to avoid disk churn).
#
# Iter 226 / Expansion Team — ETHER MAGNET multiplier. Folds
# `ether_shard_drop_mul_f` from owned relics + shrines + themes
# (currently only ether_magnet sets it, but the modifier-total path
# means future relics / shrine grants can stack additively). A 1.25×
# multiplier on amount=5 awards 6 shards (round-half-up via int(round)).
# Floor at 0 (no clamp needed — amount > 0 check above + multiplier
# is additive on a non-negative base).
func award_ether_shards(amount: int) -> void:
	if amount <= 0:
		return
	var mul: float = 1.0 + modifier_total_f("ether_shard_drop_mul_f", 0.0)
	# Iter 239 / Fun Ideas Team R4 — floor modifier ether-bonus
	# accumulator. Multiplies on TOP of the existing ether_magnet (etc.)
	# relic multiplier so the two systems compose: a player on
	# THICKER_BLOOD + SWIFT_FOES with ether_magnet equipped gets the
	# (1.25 × ether_magnet) × (1 + 0.25 + 0.15) shards. Additive WITHIN
	# floor modifiers, multiplicative ACROSS systems — the simplest
	# composition that doesn't compound the "yes I want everything"
	# build into 5×+ output.
	mul *= FloorModifiers.compute_ether_multiplier()
	var final_amount: int = int(round(float(amount) * mul))
	if final_amount <= 0:
		return
	ether_shards += final_amount
	ether_lifetime_earned += final_amount

# Convenience: ether shard drop for clearing a (non-boss) room.
func award_shards_for_room_clear() -> void:
	award_ether_shards(SHARDS_PER_ROOM_CLEAR)

# Convenience: ether shard drop for killing a boss.
func award_shards_for_boss_kill() -> void:
	award_ether_shards(SHARDS_PER_BOSS_KILL)

# Convenience: bonus on top of the final boss kill for a full clear.
func award_shards_for_run_complete() -> void:
	award_ether_shards(SHARDS_PER_RUN_COMPLETE)

# Future M1.1 — spend API. Returns true if spent, false if insufficient.
# Stub returning false for now so the hub can plumb it without crashing.
func spend_ether_shards(amount: int) -> bool:
	if amount <= 0:
		return false
	if ether_shards < amount:
		return false
	ether_shards -= amount
	return true

# iter-246 / Director Phase 4 — pedestal-offer counter API. main.gd calls
# this once per pedestal cluster spawn so GameState can drive the
# first-3-rare-biased pattern (VS chest 1-1-3-1-5 grammar). Returns the
# 1-based offer number (1 = first ever this run, 2 = second, etc.) so
# the caller can branch on it. Cheap, intentionally not persisted —
# resets on start_dungeon_run.
const PEDESTAL_FIRST_3_BIAS_LIMIT: int = 3

func note_pedestal_offer_spawned() -> int:
	_pedestal_offers_this_run += 1
	return _pedestal_offers_this_run

# iter-246 / Director Phase 4 — read-only access to the offer counter.
# Returns the COUNT of offers already spawned this run (0 before the
# first one). Used by the first-3-rare-biased logic in main.gd's
# pedestal-spawn helper to decide whether to force a minimum tier.
func pedestal_offers_this_run() -> int:
	return _pedestal_offers_this_run

# iter-246 / Director Phase 4 — first-clear room bonus. Returns the
# ether-shard amount to award if this is the first clear ever (this
# save) of the named room, or 0 if already claimed. is_last_room
# bumps the payout from FIRST_CLEAR_BONUS to FIRST_CLEAR_BONUS_BOSS
# so the player feels the boss room's narrative weight at the meta
# layer. Records the room as claimed on success.
const FIRST_CLEAR_BONUS: int = 25
const FIRST_CLEAR_BONUS_BOSS: int = 75

func try_award_first_clear_bonus(room_display_name: String, is_boss_room: bool) -> int:
	if room_display_name == "":
		return 0
	if room_display_name in floor_clear_bonuses_claimed:
		return 0
	floor_clear_bonuses_claimed.append(room_display_name)
	var amount: int = FIRST_CLEAR_BONUS_BOSS if is_boss_room else FIRST_CLEAR_BONUS
	award_ether_shards(amount)
	return amount

# iter-246 / Director Phase 4 — RESONANCE build-moment stinger gate.
# Returns the highest theme_tier we've NEVER fired a stinger for, or 0
# if the current tier doesn't exceed the recorded mark. Records the
# new mark on success so the same threshold doesn't fire twice in a
# row. Called from main.gd whenever owned_relics changes (on pickup).
# Returns 0 if the recorded mark is already ≥ current — caller should
# treat 0 as "no stinger needed."
func note_theme_tier_for_stinger(theme: String) -> int:
	if not _theme_tier_seen.has(theme):
		return 0
	var current_tier: int = theme_tier(theme)
	var seen_tier: int = int(_theme_tier_seen.get(theme, 0))
	if current_tier <= seen_tier:
		return 0
	_theme_tier_seen[theme] = current_tier
	return current_tier

# ── Relic API ────────────────────────────────────────────────────────
func has_relic(id: String) -> bool:
	return id in owned_relics

func grant_relic(id: String) -> bool:
	if has_relic(id):
		return false
	if not RELIC_REGISTRY.has(id):
		push_warning("GameState.grant_relic: unknown id '%s'" % id)
		return false
	owned_relics.append(id)
	# Iter 57 — achievement triggers tied to relic grant.
	# Mythic find: any mythic-tier relic claimed unlocks the achievement.
	# Theme devotee: 4+ owned of a single theme.
	var info: Dictionary = RELIC_REGISTRY.get(id, {})
	if str(info.get("tier", "common")) == "mythic":
		unlock_achievement("mythic_find")
	_check_theme_devotee_achievements()
	return true

func relic_info(id: String) -> Dictionary:
	return RELIC_REGISTRY.get(id, {})

# Sum a modifier across all owned relics. Pass the modifier key
# (e.g. "sword_damage_bonus") and the default if no relic adds to it.
func modifier_total(key: String, default_value: int = 0) -> int:
	var total := default_value
	for rid in owned_relics:
		var info: Dictionary = RELIC_REGISTRY.get(rid, {})
		var mods: Dictionary = info.get("mods", {})
		total += int(mods.get(key, 0))
	# Iter 33 — fold shrine grants into the same total so callers
	# don't need a parallel API.
	total += int(shrine_bonuses.get(key, 0))
	# Iter 39 — fold theme resonance bonuses. theme_stat_bonuses()
	# computes the active resonance contributions once per call;
	# downstream consumers (hero.gd, projectile.gd) see one combined
	# total without needing to know about themes.
	var theme_bonuses: Dictionary = theme_stat_bonuses()
	total += int(theme_bonuses.get(key, 0))
	# Iter 220 / Beta M1.1 — fold permanent upgrade tree levels into
	# the same total so the meta-progression effects show up wherever
	# relic mods do. No new code paths needed in consumers.
	#   resilience → max_hp_bonus per level
	#   quick_step → dodge_charge_bonus per level (consumed by hero)
	if key == "max_hp_bonus":
		total += int(upgrade_levels.get("resilience", 0))
	elif key == "dodge_charge_bonus":
		total += int(upgrade_levels.get("quick_step", 0))
	return total

# Float variant for fractional mods (e.g. -0.2 cooldown, +0.3 speed).
# Int casting in modifier_total would silently round these to 0, which
# is why this lives as a separate helper rather than a single overload.
func modifier_total_f(key: String, default_value: float = 0.0) -> float:
	var total := default_value
	for rid in owned_relics:
		var info: Dictionary = RELIC_REGISTRY.get(rid, {})
		var mods: Dictionary = info.get("mods", {})
		total += float(mods.get(key, 0.0))
	total += float(shrine_bonuses.get(key, 0.0))
	var theme_bonuses: Dictionary = theme_stat_bonuses()
	total += float(theme_bonuses.get(key, 0.0))
	return total
