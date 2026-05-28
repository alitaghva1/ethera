# BoonCatalog — iter-259 / Wave 8 (catalog) + iter-260 / Wave 9 (expansion).
#
# When the per-room XP bar fills (see main.gd::_advance_room_xp), the
# game shows a 3-card "pick one" modal instead of the silent pedestal
# spawn the iter-246 Phase 4 implementation used. Each card is a BOON:
# an additive, run-local permanent buff that folds into the existing
# shrine_bonuses Dict on the GameState autoload — plus, since iter-260,
# a `proc_flag` channel for hand-implemented mechanics that don't fit
# the simple modifier-fold pattern.
#
# Why bonuses live in shrine_bonuses (not a new namespace):
#   • shrine_bonuses already participates transparently in
#     modifier_total / modifier_total_f via game_state.gd:1830.
#   • It's already cleared in start_dungeon_run (so bonuses don't
#     carry across runs — same semantics we want for boons).
#   • Zero downstream consumer changes — hero.gd / projectile.gd /
#     reaction_web.gd just read modifier_total and see the boon
#     contribution alongside relic + theme + upgrade-tree mods.
#
# iter-260 / Wave 9 — the catalog now spans 30 entries across THREE
# TIERS (common / rare / legendary). Common is the original iter-259
# 15-entry roster (flat stat sticks). Rare adds 10 PROC mechanics
# (per-Nth-kill / per-Nth-blast / on-perfect-dodge / etc.) hooked into
# the existing event handlers in hero.gd via a `proc_flag` channel.
# Legendary adds 5 ASPECT mechanic-shifters that combine modifiers +
# proc hooks for stronger build pivots.
#
# Design philosophy:
#   • Common boons are SMALL — +1 damage, +8% crit, -15% cooldown. The
#     VS dopamine beat is "I picked something" not "this card was the
#     game-winner." Tier-1 weight matches a common-tier relic on its
#     stickiest mod, NOT a legendary stat bomb.
#   • Rare boons add a MECHANIC HOOK — fire pools on Nth kill, chain
#     bolts on Nth blast, perfect-dodge invisibility windows. They're
#     not flat stat sticks — they CHANGE how combat flows when you
#     own them. This is what graduates boons from "filler" to
#     "build-relevant" once tier weights ramp up.
#   • Legendary boons are ASPECTS — a substantial modifier + a proc.
#     Bloodroot Aspect bumps max HP +2 AND adds 25% lifesteal in one
#     pick. Voidwalk Aspect bumps dodge cooldown -30% AND extends the
#     perfect-dodge buffer window from 1.5s to 2.5s. These are the
#     "doubling down on theme" payoff for late picks.
#   • Boons stack ADDITIVELY (shrine_bonuses[key] += value) so a player
#     who picks "+1 sword damage" three times reaches a build-relevant
#     bonus over the course of a run — same as relic stacking already
#     does for sword_damage_bonus.
#   • Boons are THEMED so a player chasing a STORM build can lean into
#     storm picks and feel the resonance build up. Each theme has the
#     same shape: 3 common + 2 rare + 1 legendary = 6 boons per theme,
#     30 total. The roll logic (see roll_boon_offers below) biases the
#     sample by the player's owned-relic theme spread.
extends RefCounted
class_name BoonCatalog

# ── Boon table ─────────────────────────────────────────────────────────
# Each boon entry:
#   theme       "flame" / "storm" / "blood" / "vow" / "shadow" — picks
#               the card border + glyph + which theme counter biases
#               the roll (see roll_boon_offers below).
#   tier        "common" / "rare" / "legendary" — drives card border
#               color, tier label, glow strength. Rare+legendary use
#               higher-weight proc/aspect mechanics.
#   name        Display string in the card (UPPERCASE, 1-3 words).
#   desc        Short benefit text — under 40 chars to fit the card.
#   mods        Dict of modifier_key → numeric_value. ADDED to
#               shrine_bonuses on selection. Int values for "_bonus"
#               keys, float values for "_mul" / "_f" keys (the same
#               convention modifier_total / modifier_total_f use).
#               Empty dict for proc-only boons (the mechanic is owned
#               by a proc_flag handler in hero.gd) and flavor-only
#               boons (vow_temper).
#   proc_flag   Optional. String tag the rare proc handlers read via
#               GameState.has_boon(proc_flag) so the mechanic is
#               gated on selection without needing a new field per
#               proc. Common boons omit this; rare/legendary boons
#               that hook into hero.gd hand-implementations declare it.
const BOONS: Dictionary = {
	# ══════════════════════════════════════════════════════════════════
	# COMMON tier — flat stat sticks (the iter-259 roster).
	# ══════════════════════════════════════════════════════════════════
	# ── FLAME — damage + crit + burn ──────────────────────────────────
	"flame_strike": {
		"theme": "flame",
		"tier": "common",
		"name": "FLAME STRIKE",
		"desc": "+1 sword damage",
		"mods": {"sword_damage_bonus": 1},
	},
	"flame_focus": {
		"theme": "flame",
		"tier": "common",
		"name": "FLAME FOCUS",
		"desc": "+8% crit chance",
		"mods": {"crit_chance_f": 0.08},
	},
	"flame_pyre": {
		"theme": "flame",
		"tier": "common",
		"name": "FLAME PYRE",
		"desc": "+15% burn chance",
		"mods": {"burn_chance_f": 0.15},
	},
	# ── STORM — blast + velocity + uptime ─────────────────────────────
	"storm_chain": {
		"theme": "storm",
		"tier": "common",
		"name": "STORM CHAIN",
		"desc": "+1 blast damage",
		"mods": {"blast_damage_bonus": 1},
	},
	"storm_spark": {
		"theme": "storm",
		"tier": "common",
		"name": "STORM SPARK",
		"desc": "-15% blast cooldown",
		# Negative — _mul keys are SIGNED multiplicative deltas (1.0 + key)
		# so -0.15 reads as "shorter cooldown" exactly like keen_edge etc.
		"mods": {"blast_cooldown_mul": -0.15},
	},
	"storm_velocity": {
		"theme": "storm",
		"tier": "common",
		"name": "STORM VELOCITY",
		"desc": "+12% projectile speed",
		"mods": {"projectile_speed_mul": 0.12},
	},
	# ── BLOOD — HP + lifesteal + impact ───────────────────────────────
	"blood_vigor": {
		"theme": "blood",
		"tier": "common",
		"name": "BLOOD VIGOR",
		"desc": "+1 max HP",
		"mods": {"max_hp_bonus": 1},
	},
	"blood_mend": {
		"theme": "blood",
		"tier": "common",
		"name": "BLOOD MEND",
		"desc": "+15% lifesteal chance",
		"mods": {"lifesteal_chance_f": 0.15},
	},
	"blood_fervor": {
		"theme": "blood",
		"tier": "common",
		"name": "BLOOD FERVOR",
		"desc": "+10% knockback force",
		"mods": {"knockback_force_mul": 0.10},
	},
	# ── VOW — defensive + steel + first-hit absorb ────────────────────
	"vow_aegis": {
		"theme": "vow",
		"tier": "common",
		"name": "VOW AEGIS",
		"desc": "-1 incoming damage",
		"mods": {"damage_taken_reduction": 1},
	},
	"vow_steel": {
		"theme": "vow",
		"tier": "common",
		"name": "VOW STEEL",
		"desc": "+2 max HP",
		# Twice blood_vigor — vow_steel pays slot cost in HP-only with
		# no DR change; blood's identity gets lifesteal + impact, vow's
		# identity gets the heavier HP wedge.
		"mods": {"max_hp_bonus": 2},
	},
	"vow_temper": {
		"theme": "vow",
		"tier": "common",
		"name": "VOW TEMPER",
		"desc": "first hit each room absorbed",
		# FUTURE EXPANSION — the per-room first-hit-absorbed mechanic
		# does NOT exist yet as a modifier key. Card is offered as
		# flavor (it reads as a VOW pick) and the apply path is a
		# no-op for now. When the mechanic lands, swap mods to e.g.
		# {"vow_temper_absorb": 1} and consume it in hero.gd::take_damage.
		"mods": {},
	},
	# ── SHADOW — dash + slow + tempo ──────────────────────────────────
	"shadow_step": {
		"theme": "shadow",
		"tier": "common",
		"name": "SHADOW STEP",
		"desc": "-20% dash cooldown",
		"mods": {"dash_strike_cooldown_mul": -0.20},
	},
	"shadow_silence": {
		"theme": "shadow",
		"tier": "common",
		"name": "SHADOW SILENCE",
		"desc": "+15% slow chance",
		"mods": {"slow_chance_f": 0.15},
	},
	"shadow_haste": {
		"theme": "shadow",
		"tier": "common",
		"name": "SHADOW HASTE",
		"desc": "+8% movement speed",
		# iter-260: renamed from shadow_veil (which now denotes the rare
		# perfect-dodge invisibility proc). Same mod, sharper name.
		"mods": {"move_speed_mul": 0.08},
	},
	# ══════════════════════════════════════════════════════════════════
	# RARE tier — proc mechanics (the iter-260 expansion).
	#
	# Each rare boon has a `proc_flag` string read by a hand-implemented
	# handler in hero.gd. `mods` is empty for most because the mechanic
	# IS the value — there's no flat stat to fold. The handler reads
	# GameState.has_boon(proc_flag) to gate the effect on selection.
	# ══════════════════════════════════════════════════════════════════
	# ── FLAME rare ────────────────────────────────────────────────────
	"flame_offering": {
		"theme": "flame",
		"tier": "rare",
		"name": "FLAME OFFERING",
		"desc": "5th kill spawns fire pool",
		# Handler: hero.gd::_on_enemy_died_for_relics increments a
		# counter; on counter % 5 == 0, spawn a 60-px FIRE_POOL at the
		# kill site (lifetime 1.5s).
		"mods": {},
		"proc_flag": "flame_offering",
	},
	"flame_chain": {
		"theme": "flame",
		"tier": "rare",
		"name": "FLAME CHAIN",
		"desc": "burn deaths kindle wider",
		# Handler: enemy.gd checks GameState.has_boon("flame_chain")
		# at KINDLE_SPREAD time (when a burning enemy dies + ignites
		# neighbors). When owned, the spread radius is +25%. We wire
		# this via a modifier-style read so existing code stays simple:
		# enemy.gd reads the boon flag, multiplies the radius constant.
		"mods": {},
		"proc_flag": "flame_chain",
	},
	# ── STORM rare ────────────────────────────────────────────────────
	"storm_tithe": {
		"theme": "storm",
		"tier": "rare",
		"name": "STORM TITHE",
		"desc": "4th blast chains 140px",
		# Handler: hero.gd::_resolve_blast_fire increments
		# _storm_tithe_counter; on % 4 == 0, fire a chain bolt to the
		# nearest enemy within 140 px for 1 damage. Independent of the
		# STORM theme tier's chain logic (those are on the projectile).
		"mods": {},
		"proc_flag": "storm_tithe",
	},
	"storm_surge": {
		"theme": "storm",
		"tier": "rare",
		"name": "STORM SURGE",
		"desc": "10th blast fires 3 shots",
		# Handler: hero.gd::_resolve_blast_fire increments
		# _storm_surge_counter; on % 10 == 0, the cast fires 3
		# projectiles in a spread instead of the base 1 (or
		# base+projectile_count, picking the LARGER of the two).
		"mods": {},
		"proc_flag": "storm_surge",
	},
	# ── BLOOD rare ────────────────────────────────────────────────────
	"blood_echo": {
		"theme": "blood",
		"tier": "rare",
		"name": "BLOOD ECHO",
		"desc": "+1 HP every 5 kills",
		# Handler: hero.gd::_on_enemy_died_for_relics accumulates
		# 0.2 HP per kill into _blood_echo_accumulator; when the
		# accumulator >= 1.0, heal 1 HP + subtract 1.0. Reads at the
		# player as "+1 HP every 5 kills."
		"mods": {},
		"proc_flag": "blood_echo",
	},
	"blood_hunger": {
		"theme": "blood",
		"tier": "rare",
		"name": "BLOOD HUNGER",
		"desc": "low-HP kills +1 shard",
		# Handler: hero.gd::_on_enemy_died_for_relics checks if the
		# killing enemy was at < 25% of its max HP when it died (the
		# killing blow took them below — we read the snapshot stored
		# in the enemy before queue_free). If so, award 1 ether shard.
		# Reads at the player as "executions pay you back."
		"mods": {},
		"proc_flag": "blood_hunger",
	},
	# ── VOW rare ──────────────────────────────────────────────────────
	"vow_shatter": {
		"theme": "vow",
		"tier": "rare",
		"name": "VOW SHATTER",
		"desc": "first hit reflects 1 dmg",
		# Handler: hero.gd::take_damage. The FIRST damaging hit each
		# room reflects 1 damage to the attacker (if source_pos is
		# known and an enemy is at that position). Per-room flag
		# auto-resets on scene reload (mirrors _iron_resolve flag).
		"mods": {},
		"proc_flag": "vow_shatter",
	},
	"vow_stand": {
		"theme": "vow",
		"tier": "rare",
		"name": "VOW STAND",
		"desc": "stand still: +50% next hit",
		# Handler: hero.gd::_physics_process tracks an idle timer
		# (incremented when velocity ≈ 0). When idle ≥ 1.5s AND the
		# boon is owned, arm a flag. The next sword hit consumes the
		# flag for a +50% damage multiplier on that connect.
		"mods": {},
		"proc_flag": "vow_stand",
	},
	# ── SHADOW rare ───────────────────────────────────────────────────
	"shadow_bind": {
		"theme": "shadow",
		"tier": "rare",
		"name": "SHADOW BIND",
		"desc": "perfect-dodge slow 1.0s",
		# Handler: hero.gd::_trigger_perfect_dodge. After the dodge
		# triggers, scan enemies within 200 px and apply_slow(1.0,
		# 0.5) — slow them to 50% speed for 1.0s. Stacks AFTER the
		# vanilla slow if any.
		"mods": {},
		"proc_flag": "shadow_bind",
	},
	"shadow_veil": {
		"theme": "shadow",
		"tier": "rare",
		"name": "SHADOW VEIL",
		"desc": "perfect-dodge: invisible 1.5s",
		# Handler: hero.gd::_trigger_perfect_dodge. Sets
		# _shadow_veil_invisible_time = 1.5. While > 0:
		#   • Hero sprite modulate.a → 0.40 (visually shrouded)
		#   • Hero added to "invisible_to_enemies" group
		# Enemy AI checks this group and skips aggro pursuit while
		# the hero is in it.
		"mods": {},
		"proc_flag": "shadow_veil",
	},
	# ══════════════════════════════════════════════════════════════════
	# LEGENDARY tier — aspect mechanic-shifters (the iter-260 capstone).
	#
	# Each legendary is a SUBSTANTIAL pivot — a strong modifier-set
	# combined with a proc that changes how a theme plays. These are
	# the "doubling down on theme" payoff for late picks.
	# ══════════════════════════════════════════════════════════════════
	"inferno_aspect": {
		"theme": "flame",
		"tier": "legendary",
		"name": "INFERNO ASPECT",
		"desc": "every 3rd hit ignites",
		# Handler: hero.gd::_resolve_melee_strike. Increments
		# _inferno_aspect_hit_counter on each connecting hit. On
		# counter % 3 == 0, force-ignite the target (apply_burn 2.0s)
		# regardless of burn_chance_f.
		"mods": {},
		"proc_flag": "inferno_aspect",
	},
	"tempest_aspect": {
		"theme": "storm",
		"tier": "legendary",
		"name": "TEMPEST ASPECT",
		"desc": "blasts chain twice more",
		# Handler: hero.gd::_spawn_blast_projectile. When owned,
		# p.storm_chain_count += 2 — additive to whatever the STORM
		# theme tier sets (so STORM tier 2 + Tempest = 4 chains).
		# storm_chain_radius defaults populated if zero.
		"mods": {},
		"proc_flag": "tempest_aspect",
	},
	"bloodroot_aspect": {
		"theme": "blood",
		"tier": "legendary",
		"name": "BLOODROOT ASPECT",
		"desc": "+2 HP & +25% lifesteal",
		# Pure modifier-based aspect: max_hp_bonus +2 AND
		# lifesteal_chance_f +0.25. No proc hook required — the
		# vanilla lifesteal-on-kill roll consumes the bumped chance.
		"mods": {
			"max_hp_bonus": 2,
			"lifesteal_chance_f": 0.25,
		},
		"proc_flag": "bloodroot_aspect",
	},
	"bulwark_aspect": {
		"theme": "vow",
		"tier": "legendary",
		"name": "BULWARK ASPECT",
		"desc": "-1 dmg & 1st hit absorbed",
		# Modifier-based aspect: damage_taken_reduction +1 (iron_skin
		# behavior) AND the iron_resolve "first hit each room absorbed"
		# flag is granted via proc_flag handler. Reads in
		# hero.gd::take_damage as a parallel branch to iron_resolve.
		"mods": {
			"damage_taken_reduction": 1,
		},
		"proc_flag": "bulwark_aspect",
	},
	"voidwalk_aspect": {
		"theme": "shadow",
		"tier": "legendary",
		"name": "VOIDWALK ASPECT",
		"desc": "-30% dash CD & 2.5s pf-buffer",
		# Modifier-based aspect: dash_strike_cooldown_mul -0.30 AND
		# proc_flag bumps perfect-dodge buffer time from 1.5s → 2.5s.
		# Hero.gd reads has_boon("voidwalk_aspect") inside
		# _trigger_perfect_dodge to pick the extended buffer window.
		"mods": {
			"dash_strike_cooldown_mul": -0.30,
		},
		"proc_flag": "voidwalk_aspect",
	},
}

# ── Theme palette ──────────────────────────────────────────────────────
# Border + accent colors per theme. Match the existing iter-39 resonance
# stinger / iter-245 HUD theme chip palette so a STORM boon FEELS the
# same color as a STORM relic chip and the STORM resonance flash.
const THEME_COLORS: Dictionary = {
	"flame":  Color(1.00, 0.50, 0.20, 1.0),
	"storm":  Color(0.50, 0.78, 1.00, 1.0),
	"blood":  Color(0.88, 0.22, 0.30, 1.0),
	"vow":    Color(0.85, 0.78, 0.55, 1.0),
	"shadow": Color(0.65, 0.45, 0.85, 1.0),
}

# Glyph shown on the card. Single-character symbols readable at 48 px
# without needing a custom icon import — same approach the affix tooltip
# system uses.
const THEME_GLYPHS: Dictionary = {
	"flame":  "*",   # ember mark
	"storm":  "+",   # cross of lightning
	"blood":  "#",   # heavy mark
	"vow":    "^",   # chevron / pact
	"shadow": "~",   # waveform / shroud
}

# iter-260 / Wave 9 — per-tier border color + label text. Common is the
# dim grey baseline; rare lifts to a cool blue; legendary lifts to warm
# gold. Same palette philosophy as the relic-card pickup banner.
const TIER_COLORS: Dictionary = {
	"common":    Color(0.55, 0.50, 0.45, 1.0),
	"rare":      Color(0.45, 0.65, 0.95, 1.0),
	"legendary": Color(1.00, 0.78, 0.40, 1.0),
}

const TIER_LABELS: Dictionary = {
	"common":    "COMMON",
	"rare":      "RARE",
	"legendary": "LEGENDARY",
}

# iter-260 — tier weights per level-up. The first level-up of a run
# heavily favors common (training wheels); each subsequent level-up
# shifts weight into rare + legendary. Caps at 30/50/20 so common is
# never zeroed out (a player who's seen every rare should still
# occasionally get common picks) and legendary maxes at 20% (so
# late-run picks feel exciting but aren't guaranteed game-warpers).
#
# Schema: index into TIER_WEIGHT_RAMP by level-up ordinal (0-indexed).
# A run with 5 level-ups uses entries 0..4. Beyond the array length,
# clamps to the last entry (a deep run gets the maxed-out late weights).
const TIER_WEIGHT_RAMP: Array[Dictionary] = [
	{"common": 0.70, "rare": 0.25, "legendary": 0.05},  # 1st level-up
	{"common": 0.60, "rare": 0.30, "legendary": 0.10},  # 2nd
	{"common": 0.50, "rare": 0.35, "legendary": 0.15},  # 3rd
	{"common": 0.40, "rare": 0.42, "legendary": 0.18},  # 4th
	{"common": 0.30, "rare": 0.50, "legendary": 0.20},  # 5th+ (capped)
]

# iter-260 — theme bias weight bump. When the level-up roll selects a
# boon whose theme matches a theme the player owns ≥ 2 relics in, the
# entry gets a +30% weight multiplier. Encourages "doubling down"
# without locking out off-theme picks (a build-relevant relic-theme
# match still has a chance to roll, just biased not forced).
const THEME_BIAS_WEIGHT_MUL: float = 1.30

# ── Public API ─────────────────────────────────────────────────────────

# Look up a boon definition by id. Returns an empty Dictionary on miss
# so callers can guard via `if not boon.is_empty()` without a null check.
static func get_boon(id: String) -> Dictionary:
	return BOONS.get(id, {})

# Return all boon ids that match the requested theme. Used by the
# theme-bias step in roll_boon_offers() — when the player has owned
# relics in a theme, we bias toward that theme's pool.
static func ids_for_theme(theme: String) -> Array[String]:
	var out: Array[String] = []
	for id in BOONS:
		if str(BOONS[id].get("theme", "")) == theme:
			out.append(id)
	return out

# Return all boon ids that match the requested tier. Used by the
# tier-weighted roll step in roll_boon_offers(). Tier strings are
# "common" / "rare" / "legendary".
static func ids_for_tier(tier: String) -> Array[String]:
	var out: Array[String] = []
	for id in BOONS:
		if str(BOONS[id].get("tier", "")) == tier:
			out.append(id)
	return out

# iter-260 — roll N distinct boon ids for the level-up modal using the
# new tier weights + theme bias logic. Replaces the iter-259 roll_three
# (kept below for back-compat with the modal's existing call).
#
# Algorithm:
#   1. Pick a tier weight set by clamping GameState.level_ups_this_run
#      into TIER_WEIGHT_RAMP. The first level-up heavily favors common;
#      late level-ups shift weight to rare + legendary.
#   2. For each of N picks, roll a tier (weighted), then pick a boon
#      from that tier's pool. Each boon's draw weight gets +30% if its
#      theme matches a theme the player owns ≥ 2 relics in (theme bias).
#   3. Filter out already-owned boons and already-picked boons within
#      this offer. If a tier's pool is exhausted, fall back to other
#      tiers (graceful degradation on a deep run).
#
# Returns an Array[String] of up to `count` unique ids. Typically 3.
static func roll_boon_offers(count: int = 3) -> Array[String]:
	# Determine the level-up ordinal from GameState. Pre-iter-260 this
	# field doesn't exist; default to 0 (first level-up) which gives the
	# friendly 70/25/5 split.
	var level_up_index: int = 0
	var gs: Node = Engine.get_main_loop().root.get_node_or_null("/root/GameState")
	if gs != null and "level_ups_this_run" in gs:
		level_up_index = int(gs.level_ups_this_run)
	# Clamp into ramp.
	var ramp_idx: int = clampi(level_up_index, 0, TIER_WEIGHT_RAMP.size() - 1)
	var weights: Dictionary = TIER_WEIGHT_RAMP[ramp_idx]
	# Build per-tier pools, filtering out already-owned boons.
	var owned_boons: Dictionary = {}
	if gs != null and "owned_boons" in gs:
		for bid in gs.owned_boons:
			owned_boons[bid] = true
	var pools: Dictionary = {
		"common": [],
		"rare": [],
		"legendary": [],
	}
	for id in BOONS:
		if owned_boons.has(id):
			continue
		var tier: String = str(BOONS[id].get("tier", "common"))
		if pools.has(tier):
			(pools[tier] as Array).append(id)
	# Determine theme-bias set (themes the player owns ≥ 2 relics in).
	var bias_themes: Dictionary = {}
	if gs != null and gs.has_method("theme_count"):
		for theme in ["flame", "storm", "blood", "vow", "shadow"]:
			if int(gs.theme_count(theme)) >= 2:
				bias_themes[theme] = true
	var picked: Array[String] = []
	for i in range(count):
		# Pick a tier weighted.
		var tier_pick: String = _weighted_tier_pick(weights, pools)
		if tier_pick == "":
			break    # all tiers exhausted
		# Pick a boon from that tier's pool with theme-bias weighting.
		var pool: Array = pools[tier_pick]
		if pool.is_empty():
			# Tier-pick logic should have skipped empty pools, but
			# defensive.
			break
		var chosen: String = _weighted_boon_pick(pool, bias_themes)
		if chosen == "":
			break
		picked.append(chosen)
		pool.erase(chosen)
	return picked

# Tier-pick helper. Walks `weights` ({"common": 0.7, ...}) skipping any
# tier whose `pools` entry is empty. Re-normalizes weight over the
# non-empty tiers so a depleted common tier just shifts the rare +
# legendary weights to fill 100%.
static func _weighted_tier_pick(weights: Dictionary, pools: Dictionary) -> String:
	var total: float = 0.0
	for tier in weights:
		if pools.has(tier) and not (pools[tier] as Array).is_empty():
			total += float(weights[tier])
	if total <= 0.0:
		return ""
	var r: float = randf() * total
	var accum: float = 0.0
	for tier in weights:
		if pools.has(tier) and not (pools[tier] as Array).is_empty():
			accum += float(weights[tier])
			if r <= accum:
				return str(tier)
	return ""

# Boon-pick helper. Weighted-random pick from `pool` where each boon's
# weight is 1.0 + (THEME_BIAS_WEIGHT_MUL - 1.0) if its theme is in
# `bias_themes`, else 1.0. The bias is multiplicative: a flat 30% bump
# on top of the uniform 1.0 baseline = 1.3 weight for bias entries.
static func _weighted_boon_pick(pool: Array, bias_themes: Dictionary) -> String:
	var total: float = 0.0
	for id in pool:
		var theme: String = str(BOONS[id].get("theme", ""))
		var w: float = THEME_BIAS_WEIGHT_MUL if bias_themes.has(theme) else 1.0
		total += w
	if total <= 0.0:
		return ""
	var r: float = randf() * total
	var accum: float = 0.0
	for id in pool:
		var theme: String = str(BOONS[id].get("theme", ""))
		var w: float = THEME_BIAS_WEIGHT_MUL if bias_themes.has(theme) else 1.0
		accum += w
		if r <= accum:
			return str(id)
	return str(pool[-1])

# ── Back-compat (iter-259) ─────────────────────────────────────────────
# The iter-259 modal calls roll_three(strongest_theme). It's preserved
# for the existing modal path (and the iter-259 test's call surface).
# Under the hood it now defers to roll_boon_offers so the iter-260
# tier/theme logic applies to the same call site.
static func roll_three(strongest_theme: String = "") -> Array[String]:
	# strongest_theme arg is preserved for signature compatibility but
	# ignored — roll_boon_offers now reads bias_themes from GameState
	# directly.
	var _ignored: String = strongest_theme
	return roll_boon_offers(3)
