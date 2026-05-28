#!/usr/bin/env python3
"""
relic_sim.py — empirical relic-pool analysis for ETHERA (iter-96 prep).

Runs N simulated playthroughs, each one picking ~6 relics across the 4-floor
arc using a greedy-by-expected-value AI. Outputs:

  • Pick rate per relic        — how often it appears in a 6-relic build
  • DPS contribution           — additive damage per relic
  • Survival contribution      — effective HP delta
  • "Dead picks"               — relics never chosen by any of the AI strategies
  • Build identity histograms  — theme distribution at run-end

The sim doesn't model frame-perfect combat. It models the BUILD MATH that a
player implicitly evaluates when choosing one of 3 relics: how much does
this relic improve my DPS / survival / utility?

Source of truth: the audit returned by the relic-registry survey (iter-95 state).
"""

import io
import random
import statistics
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

# Windows console defaults to cp1252; force UTF-8 so the box-drawing
# characters in the report render correctly.
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")
if sys.stderr.encoding and sys.stderr.encoding.lower() != "utf-8":
    sys.stderr.reconfigure(encoding="utf-8")


# ─────────────────────────────────────────────────────────────────────────
# Hero base stats — mirrors scripts/hero.gd constants (iter-95)
# ─────────────────────────────────────────────────────────────────────────

BASE_HP            = 3
BASE_SWORD_DMG     = 1
BASE_BLAST_DMG     = 1
BASE_ATTACK_CD     = 0.40   # s
BASE_BLAST_CD      = 0.55   # s
BASE_ATTACK_ARC    = 0.55   # PI multiplier
BASE_ATTACK_RANGE  = 56
BASE_MOVE_SPEED    = 200.0
CRIT_DMG_MUL       = 1.5

# Enemy proxies — composite "average" enemy for the build-math sim. Real
# game has slime/skeleton/wizard/elite variants; the BUILD score isn't
# sensitive to which specific enemy we model, only to the aggregate
# damage/HP economy.
AVG_ENEMY_HP       = 3.0
AVG_ENEMY_DMG      = 1.0
ENEMY_HITS_PER_ROOM = 4    # how many times an enemy gets a swing at the hero per room (modeled)
ENEMIES_PER_ROOM   = 5
ROOMS_PER_FLOOR    = 6
FLOORS_PER_RUN     = 4


# ─────────────────────────────────────────────────────────────────────────
# Relic registry — iter-95 snapshot
# DEAD markers flag mods whose modifier key is no longer read by hero.gd
# (the dodge ability was removed in iter-95). Each entry:
#   id, name, tier, themes, mods, trigger_kind, dead_keys
# ─────────────────────────────────────────────────────────────────────────

# iter-96: retired DODGE_* keys. dash_strike_cooldown_mul +
# dash_strike_post_iframes_bonus_f are the new live keys that read in
# hero.gd's _start_dash_strike. The sim treats them as "DPS-relevant
# because more dashes per fight = more AoE" and "survival-relevant
# because longer post-iframes = more free repositioning."
DEAD_KEYS = set()  # iter-96 cleaned up the dead-modifier slots

RELICS = {
    # ── COMMON ───────────────────────────────────────────────────────────
    "iron_fang":        ("Iron Fang",        "common", ["flame"], {"sword_damage_bonus": 1}, "passive+on_hit_proc"),
    "arcane_pulse":     ("Arcane Pulse",     "common", ["storm"], {"blast_damage_bonus": 1}, "passive+on_blast_proc"),
    "stoneheart":       ("Stoneheart",       "common", ["blood"], {"max_hp_bonus": 1}, "passive+first_kill_heal"),
    "iron_skin":        ("Iron Skin",        "common", ["vow"],   {"damage_taken_reduction": 1}, "passive+on_block_proc"),
    "iron_will":        ("Iron Will",        "common", ["vow"],   {"max_hp_bonus": 2}, "passive"),  # iter-96 Phase B: 1 → 2 HP, stripped lying DR claim
    "iron_grip":        ("Iron Grip",        "common", ["flame"], {"knockback_force_mul": 0.25, "damage_taken_reduction": 1}, "passive"),  # iter-96 Phase B retune
    "sturdy_step":      ("Sturdy Step",      "common", ["vow"],   {"damage_taken_reduction": 1}, "passive"),  # iter-96 Phase A retune (was DEAD)
    "focused_eye":      ("Focused Eye",      "common", ["storm"], {"blast_damage_bonus": 1, "projectile_speed_mul": 0.2}, "passive"),
    "lifestone":        ("Lifestone",        "common", ["blood"], {"max_hp_bonus": 1}, "passive+regen_8_kills"),  # iter-96 Phase B: +every-8-kills heal
    "keen_focus":       ("Keen Focus",       "common", ["flame"], {"crit_chance_f": 0.15, "crit_damage_bonus_f": 0.10}, "passive"),  # iter-96 Phase B retune
    # iter-102 NEW commons — fix theme ascendance reach (sim iter-96b
    # showed VOW 0.0% / SHADOW 0.1% ascendance hit rate due to small
    # pool size).
    "bulwark":          ("Bulwark",          "common", ["vow"],    {"max_hp_bonus": 1, "damage_taken_reduction": 1}, "passive"),
    "umbral_thread":    ("Umbral Thread",    "common", ["shadow"], {"crit_chance_f": 0.10}, "passive"),
    "dusk_walker":      ("Dusk Walker",      "common", ["storm", "shadow"], {"move_speed_mul": 0.15, "projectile_speed_mul": 0.15}, "passive"),

    # ── RARE ─────────────────────────────────────────────────────────────
    "swift_strike":     ("Swift Strike",     "rare",   ["flame"], {"sword_cooldown_mul": -0.2}, "passive"),
    "dash_master":      ("Dash Master",      "rare",   ["shadow"], {"dash_strike_cooldown_mul": -0.3}, "passive"),  # iter-96 rename (was dodge_master / DEAD)
    "nimble":           ("Nimble",           "rare",   ["shadow"], {"move_speed_mul": 0.3}, "passive"),
    "swift_focus":      ("Swift Focus",      "rare",   ["storm"], {"blast_cooldown_mul": -0.3}, "passive"),
    "long_reach":       ("Long Reach",       "rare",   ["flame"], {"attack_range_mul": 0.25, "sword_damage_bonus": 1}, "passive"),  # iter-96 Phase B retune
    "arcane_quiver":    ("Arcane Quiver",    "rare",   ["storm"], {"projectile_speed_mul": 0.30, "pierce_count": 1}, "passive"),  # iter-96 Phase B retune
    "wide_arc":         ("Wide Arc",         "rare",   ["flame"], {"attack_arc_mul": 0.60}, "passive"),
    "stalwart":         ("Stalwart",         "rare",   ["vow"],   {"max_hp_bonus": 1, "damage_taken_reduction": 1}, "passive"),
    "gale_step":        ("Gale Step",        "rare",   ["shadow"], {"move_speed_mul": 0.25, "dash_strike_post_iframes_bonus_f": 0.05}, "passive"),  # iter-96 retune
    "aegis_plate":      ("Aegis Plate",      "rare",   ["vow"],   {"max_hp_bonus": 2, "damage_taken_reduction": 1}, "passive"),
    "piercing_quarrel": ("Piercing Quarrel", "rare",   ["storm"], {"pierce_count": 1}, "passive"),
    "ricochet_talisman":("Ricochet Talisman","rare",   ["storm"], {"ricochet_count": 1}, "passive"),
    "focused_strike":   ("Focused Strike",   "rare",   [],        {"crit_chance_f": 0.25}, "passive"),
    "embers_of_ruin":   ("Embers of Ruin",   "rare",   ["flame"], {"burn_chance_f": 0.25}, "passive+on_hit_proc"),
    "drinking_edge":    ("Drinking Edge",    "rare",   ["blood"], {"lifesteal_chance_f": 0.15}, "on_kill_proc"),
    "combustion_core":  ("Combustion Core",  "rare",   ["flame"], {"explode_on_kill_chance_f": 0.20}, "on_kill_proc"),
    "tempest_cloak":    ("Tempest Cloak",    "rare",   ["storm", "shadow"], {"move_speed_mul": 0.15, "projectile_speed_mul": 0.15}, "passive"),  # iter-96 retune
    "frost_pulse":      ("Frost Pulse",      "rare",   ["storm"], {"slow_chance_f": 0.30}, "passive+on_hit_proc"),
    "wisp_companion":   ("Wisp Companion",   "rare",   [],        {"familiar_count": 1}, "active_familiar"),

    # ── LEGENDARY ────────────────────────────────────────────────────────
    "twin_cast":        ("Twin Cast",        "legendary", ["storm"], {"projectile_count": 1}, "passive"),
    "crimson_hunger":   ("Crimson Hunger",   "legendary", ["blood"], {"lifesteal_chance_f": 0.30}, "on_kill_proc"),
    "detonator":        ("Detonator",        "legendary", ["flame"], {"explode_on_kill_chance_f": 0.40}, "on_kill_proc"),
    "glacial_resonance":("Glacial Resonance","legendary", ["storm"], {"slow_chance_f": 0.50, "max_hp_bonus": 1}, "passive+on_hit_proc"),
    "phantom_squad":    ("Phantom Squad",    "legendary", [],        {"familiar_count": 2}, "active_familiar"),
    "heart_of_stone":   ("Heart of Stone",   "legendary", ["blood"], {"max_hp_bonus": 3, "damage_taken_reduction": 1}, "passive"),  # iter-96 Phase B retune (was 2 HP / no DR, dominated by aegis_plate)
    "boots_of_haste":   ("Boots of Haste",   "legendary", ["shadow"], {"move_speed_mul": 0.6}, "passive"),
    "second_wind":      ("Second Wind",      "legendary", ["vow"],   {}, "on_lethal_proc"),
    "bloodstone":       ("Bloodstone",       "legendary", ["blood"], {}, "on_kill_counter_heal"),
    "arcane_resonance": ("Arcane Resonance", "legendary", ["storm"], {}, "on_blast_counter_double"),
    "chain_lightning":  ("Chain Lightning",  "legendary", ["storm"], {}, "on_hit_counter_arc"),
    "phoenix_feather":  ("Phoenix Feather",  "legendary", ["vow"],   {}, "on_lethal_full_heal"),
    "executioner":      ("Executioner",      "legendary", ["flame"], {}, "low_hp_dmg_boost"),
    "soul_burst":       ("Soul Burst",       "legendary", ["shadow"], {}, "on_kill_counter_aoe"),
    "iron_resolve":     ("Iron Resolve",     "legendary", ["vow"],   {}, "first_wound_absorb"),

    # ── MYTHIC ───────────────────────────────────────────────────────────
    "cataclysm":        ("Cataclysm",        "mythic",  ["flame"], {"explode_on_kill_chance_f": 0.50, "burn_chance_f": 0.25}, "passive+on_kill"),
    "eye_of_ether":     ("Eye of Ether",     "mythic",  ["storm"], {"pierce_count": 2, "ricochet_count": 2, "projectile_count": 1}, "passive"),
    "soul_reaver":      ("Soul Reaver",      "mythic",  ["blood"], {"lifesteal_chance_f": 0.40, "max_hp_bonus": 2, "crit_chance_f": 0.20}, "passive+on_kill"),
    "phantom_step":     ("Phantom Step",     "mythic",  ["shadow"], {"move_speed_mul": 0.50, "dash_strike_cooldown_mul": -0.40, "dash_strike_post_iframes_bonus_f": 0.15}, "passive"),  # iter-96 retune
}


# ─────────────────────────────────────────────────────────────────────────
# Build state — accumulates relic mods + tracks "felt" stats
# ─────────────────────────────────────────────────────────────────────────

@dataclass
class Build:
    relics: List[str] = field(default_factory=list)

    def has(self, rid: str) -> bool:
        return rid in self.relics

    def add(self, rid: str) -> None:
        self.relics.append(rid)

    def theme_count(self, theme: str) -> int:
        return sum(1 for rid in self.relics if theme in RELICS[rid][2])

    def mod(self, key: str) -> float:
        if key in DEAD_KEYS:
            return 0.0   # dead modifier reads as zero
        total = 0.0
        for rid in self.relics:
            mods = RELICS[rid][3]
            total += mods.get(key, 0)
        return total

    def mod_int(self, key: str) -> int:
        return int(round(self.mod(key)))


# ─────────────────────────────────────────────────────────────────────────
# Combat math — the heart of the AI's value function
# ─────────────────────────────────────────────────────────────────────────

def _effective_crit_mul(b: Build) -> float:
    """Folded crit damage multiplier (iter-96). Base 1.5× + crit_damage_bonus_f.
    keen_focus grants +0.10 → 1.6× when stacked."""
    return CRIT_DMG_MUL + b.mod("crit_damage_bonus_f")


def slash_dps(b: Build) -> float:
    """Effective slash DPS = damage_per_hit * hits_per_second * crit_factor *
    proc_factor. Wide arc adds a 'cleave' multiplier since the slash hits
    more enemies per swing. Pierce/ricochet don't apply to slash."""
    dmg = BASE_SWORD_DMG + b.mod_int("sword_damage_bonus")
    cd_mul = 1.0 + b.mod("sword_cooldown_mul")
    hps = 1.0 / max(0.05, BASE_ATTACK_CD * cd_mul)
    arc_factor = 1.0 + 0.5 * b.mod("attack_arc_mul")  # wide arc → more cleave
    crit = min(0.95, b.mod("crit_chance_f"))
    crit_mul = _effective_crit_mul(b)
    crit_factor = 1.0 + crit * (crit_mul - 1.0)
    # On-hit procs add flat DPS estimate
    proc_dps = 0.0
    if b.has("chain_lightning"):
        proc_dps += hps * 0.25      # every-4th-hit arcs to 2nd enemy
    if b.has("iron_fang"):
        proc_dps += hps * (1.0/6.0) * 2.5  # every-6th-hit ember burst (AoE dmg estimate)
    return dmg * hps * arc_factor * crit_factor + proc_dps


def blast_dps(b: Build) -> float:
    """Effective blast DPS. Projectile count multiplies. Pierce + ricochet
    add hit-instances per cast."""
    dmg = BASE_BLAST_DMG + b.mod_int("blast_damage_bonus")
    cd_mul = 1.0 + b.mod("blast_cooldown_mul")
    cps = 1.0 / max(0.05, BASE_BLAST_CD * cd_mul)
    proj_count = 1 + b.mod_int("projectile_count")
    pierce = b.mod_int("pierce_count")
    ricochet = b.mod_int("ricochet_count")
    hits_per_cast = proj_count * (1 + 0.6 * pierce + 0.4 * ricochet)
    crit = min(0.95, b.mod("crit_chance_f"))
    crit_mul = _effective_crit_mul(b)
    crit_factor = 1.0 + crit * (crit_mul - 1.0)
    base = dmg * hits_per_cast * cps * crit_factor
    proc_dps = 0.0
    if b.has("arcane_resonance"):
        proc_dps += cps * 0.25 * dmg   # every-4th-blast x2 damage
    if b.has("arcane_pulse"):
        proc_dps += cps * (1.0/5.0) * dmg  # every-5th-blast forks
    return base + proc_dps


def kill_proc_dps_bonus(b: Build) -> float:
    """Effective DPS contribution from on-kill procs (explode/lifesteal/aoe
    cascades). Estimated as 'each kill triggers proc with prob P, proc adds
    average X damage to a nearby enemy.'"""
    # Average kills per second from existing DPS estimate
    avg_dps = max(slash_dps(b), blast_dps(b))
    kills_per_sec = avg_dps / AVG_ENEMY_HP
    bonus = 0.0
    explode_chance = min(1.0, b.mod("explode_on_kill_chance_f"))
    if b.has("cataclysm"):
        explode_chance = min(1.0, explode_chance + 0.5)
    if b.has("detonator"):
        explode_chance = min(1.0, explode_chance + 0.4)
    bonus += kills_per_sec * explode_chance * 2.0  # 2 dmg cascade estimate
    if b.has("soul_burst"):
        bonus += kills_per_sec * (1.0/5.0) * 3.0   # every-5th-kill big AoE
    if b.has("combustion_core"):
        # already folded above; combustion_core adds explode_on_kill 0.2
        pass
    return bonus


def familiar_dps(b: Build) -> float:
    """Wisp companions. Each adds ~0.5 dmg/s of autonomous fire."""
    count = b.mod_int("familiar_count")
    return count * 0.5


def total_dps(b: Build) -> float:
    return slash_dps(b) + blast_dps(b) * 0.6 + kill_proc_dps_bonus(b) + familiar_dps(b)
    # Blast DPS weighted 60% because slashes are easier to land in melee range


def effective_hp(b: Build) -> float:
    """Effective HP = max_hp * damage_reduction_factor * iframe_bonus_factor.
    Plus lifesteal+regen estimated as 'each kill restores some HP.'"""
    hp = BASE_HP + b.mod_int("max_hp_bonus")
    # SHIELD ascendance grants first-hit absorb; not modeled, but iron_resolve does
    dr = b.mod_int("damage_taken_reduction")
    # vs dmg=1 enemies, DR=1 means hits do 0 (free hits). Above that, hits do
    # base-DR. Model as effective HP multiplier.
    enemy_dmg = max(0.0, AVG_ENEMY_DMG - dr)
    hits_to_die = hp / enemy_dmg if enemy_dmg > 0 else 999.0
    eff_hp = min(999.0, hits_to_die * AVG_ENEMY_DMG)
    # Revive procs
    if b.has("phoenix_feather"):
        eff_hp += BASE_HP + b.mod_int("max_hp_bonus")  # full revive
    elif b.has("second_wind"):
        eff_hp += 1
    # Per-room first-wound absorb
    if b.has("iron_resolve"):
        eff_hp += ROOMS_PER_FLOOR * FLOORS_PER_RUN  # 1 free hit per room
    # Bloodstone regen — every 3rd kill heals 1 HP
    if b.has("bloodstone"):
        eff_hp += ENEMIES_PER_ROOM * ROOMS_PER_FLOOR * FLOORS_PER_RUN / 3.0
    # iter-96 Phase B: lifestone slow regen — every 8th kill heals 1 HP
    if b.has("lifestone"):
        eff_hp += ENEMIES_PER_ROOM * ROOMS_PER_FLOOR * FLOORS_PER_RUN / 8.0
    # iter-96 Phase B: second_wind extended i-frames bump → roughly +1
    # avoided-hit per room of activity beyond the base revive value
    if b.has("second_wind"):
        # Was: just +1 to eff_hp below. Bump represents the 1.4s i-frames
        # giving ~2 avoided ticks of repositioning per revive.
        eff_hp += 1   # additional iframe value on top of the base +1
    # Lifesteal regen
    lifesteal = min(0.95, b.mod("lifesteal_chance_f"))
    if lifesteal > 0:
        eff_hp += lifesteal * ENEMIES_PER_ROOM * ROOMS_PER_FLOOR * FLOORS_PER_RUN * 0.5
    # Stoneheart first-kill regen
    if b.has("stoneheart"):
        eff_hp += ROOMS_PER_FLOOR * FLOORS_PER_RUN * 1
    return eff_hp


def utility_score(b: Build) -> float:
    """Movement / control / status. Move speed lets you reposition; slow
    chance debuffs enemies; range lets you stay out of swings.

    iter-96: also score dash_strike CD reduction + post-iframes bonus,
    since those control how often you can re-engage AND how much free
    repositioning you get per engage."""
    score = 0.0
    score += b.mod("move_speed_mul") * 5.0
    score += b.mod("attack_range_mul") * 3.0
    score += min(0.95, b.mod("slow_chance_f")) * 4.0
    score += min(0.95, b.mod("burn_chance_f")) * 3.0
    # Dash CD reduction → more dash AoEs per fight. Each -10% CD ≈ +10%
    # dash-uptime, which translates to extra AoE damage + extra i-frame
    # coverage. -0.30 (dash_master) gives roughly +30% defensive uptime.
    score += -b.mod("dash_strike_cooldown_mul") * 6.0
    # Post-iframes extend the "free reposition" tail of each dash. 0.10
    # base + bonus is the safety window. Each +0.05s of bonus is meaningful.
    score += b.mod("dash_strike_post_iframes_bonus_f") * 8.0
    return score


def theme_bonus(b: Build) -> float:
    """Theme set bonuses. iter-95 has 5 themes with resonance (2+) and
    ascendance (4+) tiers. Most ascendance tier-2 mechanics fire on
    dash_strike or melee."""
    bonus = 0.0
    for theme in ("storm", "flame", "blood", "vow", "shadow"):
        count = b.theme_count(theme)
        if count >= 2:
            bonus += 1.0  # resonance — small flat stat bump
        if count >= 4:
            bonus += 3.0  # ascendance — mechanic unlock
    return bonus


def build_score(b: Build) -> float:
    """Composite score the AI optimizes when picking a relic."""
    dps = total_dps(b)
    surv = effective_hp(b)
    util = utility_score(b)
    theme = theme_bonus(b)
    # Weighted combination — empirically tuned: DPS dominates but survival
    # matters multiplicatively (a glass cannon dies fast).
    return dps * (surv ** 0.4) + util * 2.0 + theme * 5.0


def pick_best(b: Build, options: List[str]) -> str:
    """Greedy: simulate adding each option, pick the highest delta."""
    base = build_score(b)
    best = options[0]
    best_delta = -1e9
    for rid in options:
        if b.has(rid):
            continue  # can't pick a relic you already own
        candidate = Build(relics=b.relics + [rid])
        delta = build_score(candidate) - base
        if delta > best_delta:
            best_delta = delta
            best = rid
    return best


# ─────────────────────────────────────────────────────────────────────────
# Run simulation — 6 picks across the 4-floor arc with tier-weighted offers
# ─────────────────────────────────────────────────────────────────────────

def tier_weights(floor: int) -> Dict[str, float]:
    """Floor-aware tier weighting. Floor 1: mostly common. Floor 4: mostly
    legendary, sprinkle of mythic. Mirrors main.gd tier-bias logic."""
    if floor == 1:
        return {"common": 0.65, "rare": 0.30, "legendary": 0.05, "mythic": 0.00}
    elif floor == 2:
        return {"common": 0.35, "rare": 0.50, "legendary": 0.15, "mythic": 0.00}
    elif floor == 3:
        return {"common": 0.15, "rare": 0.45, "legendary": 0.35, "mythic": 0.05}
    else:  # floor 4
        return {"common": 0.05, "rare": 0.25, "legendary": 0.55, "mythic": 0.15}


def roll_offer(floor: int, owned: List[str], rng: random.Random) -> List[str]:
    """Roll 3 distinct relics for a pedestal offer."""
    weights = tier_weights(floor)
    pool_by_tier = defaultdict(list)
    for rid, (_n, tier, _t, _m, _k) in RELICS.items():
        if rid not in owned:
            pool_by_tier[tier].append(rid)
    offer = []
    attempts = 0
    while len(offer) < 3 and attempts < 100:
        attempts += 1
        # Pick a tier by weight
        r = rng.random()
        acc = 0.0
        chosen_tier = "common"
        for tier, w in weights.items():
            acc += w
            if r < acc:
                chosen_tier = tier
                break
        if not pool_by_tier[chosen_tier]:
            continue
        candidate = rng.choice(pool_by_tier[chosen_tier])
        if candidate not in offer:
            offer.append(candidate)
    return offer


def simulate_run(rng: random.Random, strategy: str = "greedy") -> Build:
    """Simulate one full run = 6 pedestal offers, one per ~half-floor."""
    b = Build()
    # 6 picks: 1 floor1 + 2 floor2 + 2 floor3 + 1 floor4 (rough cadence)
    schedule = [1, 2, 2, 3, 3, 4]
    for floor in schedule:
        offer = roll_offer(floor, b.relics, rng)
        if not offer:
            continue
        if strategy == "greedy":
            pick = pick_best(b, offer)
        elif strategy == "random":
            pick = rng.choice(offer)
        elif strategy == "defensive":
            # Always pick max effective_hp delta
            base = effective_hp(b)
            pick = max(offer, key=lambda r: effective_hp(Build(relics=b.relics + [r])) - base)
        elif strategy == "aggressive":
            # Always pick max total_dps delta
            base = total_dps(b)
            pick = max(offer, key=lambda r: total_dps(Build(relics=b.relics + [r])) - base)
        else:
            pick = offer[0]
        b.add(pick)
    return b


# ─────────────────────────────────────────────────────────────────────────
# Report generation
# ─────────────────────────────────────────────────────────────────────────

def run_experiment(n_runs: int = 1000, seed: int = 42) -> None:
    strategies = ["greedy", "random", "defensive", "aggressive"]
    pick_counts: Dict[str, Counter] = {s: Counter() for s in strategies}
    final_scores: Dict[str, List[float]] = {s: [] for s in strategies}
    theme_counts: Dict[str, Counter] = {s: Counter() for s in strategies}

    for strategy in strategies:
        rng = random.Random(seed)
        for run_idx in range(n_runs):
            build = simulate_run(rng, strategy)
            for rid in build.relics:
                pick_counts[strategy][rid] += 1
            final_scores[strategy].append(build_score(build))
            # Theme histogram by run-end count
            for theme in ("storm", "flame", "blood", "vow", "shadow"):
                cnt = build.theme_count(theme)
                if cnt >= 2:
                    theme_counts[strategy][f"{theme}_resonance"] += 1
                if cnt >= 4:
                    theme_counts[strategy][f"{theme}_ascendance"] += 1

    # ── Output ──
    print(f"\n{'='*70}")
    print(f"ETHERA RELIC SIM — {n_runs} runs × 4 strategies")
    print(f"{'='*70}\n")

    # Pick rates by strategy
    print("── PICK RATES BY STRATEGY (% of runs containing each relic) ──")
    print(f"{'relic':<22} {'tier':<10} {'greedy':>8} {'random':>8} {'defensiv':>9} {'aggro':>8}")
    print("-" * 70)
    by_greedy = sorted(RELICS.keys(), key=lambda r: -pick_counts["greedy"][r])
    for rid in by_greedy:
        name = RELICS[rid][0]
        tier = RELICS[rid][1]
        rates = [100.0 * pick_counts[s][rid] / n_runs for s in strategies]
        flag = " ← DEAD" if any(k in DEAD_KEYS for k in RELICS[rid][3]) and rates[0] < 5 else ""
        print(f"{name:<22} {tier:<10} {rates[0]:>7.1f}% {rates[1]:>7.1f}% {rates[2]:>8.1f}% {rates[3]:>7.1f}%{flag}")

    # Strategy scores
    print(f"\n── AVG BUILD SCORE BY STRATEGY ──")
    for s in strategies:
        if final_scores[s]:
            avg = statistics.mean(final_scores[s])
            stdev = statistics.stdev(final_scores[s])
            print(f"  {s:<12} avg={avg:>7.2f}  stdev={stdev:>6.2f}")

    # Theme bonus reach
    print(f"\n── THEME BONUS REACH BY GREEDY STRATEGY (% runs) ──")
    for theme in ("storm", "flame", "blood", "vow", "shadow"):
        res = 100.0 * theme_counts["greedy"].get(f"{theme}_resonance", 0) / n_runs
        asc = 100.0 * theme_counts["greedy"].get(f"{theme}_ascendance", 0) / n_runs
        print(f"  {theme:<8} resonance(2+): {res:>5.1f}%   ascendance(4+): {asc:>5.1f}%")

    # Dead / never-picked relics
    print(f"\n── NEVER-PICKED BY GREEDY (potential dead pool) ──")
    never_picked = [rid for rid in RELICS if pick_counts["greedy"][rid] == 0]
    if never_picked:
        for rid in never_picked:
            print(f"  ✗ {rid:<22} ({RELICS[rid][1]})")
    else:
        print("  (none — every relic was picked at least once)")

    # Bottom-quintile picks
    print(f"\n── BOTTOM QUINTILE BY GREEDY PICK RATE (likely needs retune) ──")
    threshold = sorted(pick_counts["greedy"].values())[len(RELICS) // 5]
    weak = [rid for rid in RELICS if pick_counts["greedy"][rid] <= threshold]
    for rid in weak:
        rate = 100.0 * pick_counts["greedy"][rid] / n_runs
        dead_marker = " [DEAD-mod]" if any(k in DEAD_KEYS for k in RELICS[rid][3]) else ""
        print(f"  · {rid:<22} ({RELICS[rid][1]:<10}) {rate:>5.1f}%{dead_marker}")

    # Top-quintile picks
    print(f"\n── TOP QUINTILE BY GREEDY PICK RATE (defines the meta) ──")
    top_threshold = sorted(pick_counts["greedy"].values(), reverse=True)[len(RELICS) // 5]
    strong = [rid for rid in RELICS if pick_counts["greedy"][rid] >= top_threshold]
    strong.sort(key=lambda r: -pick_counts["greedy"][r])
    for rid in strong:
        rate = 100.0 * pick_counts["greedy"][rid] / n_runs
        print(f"  ★ {rid:<22} ({RELICS[rid][1]:<10}) {rate:>5.1f}%")

    print(f"\n{'='*70}\n")


if __name__ == "__main__":
    run_experiment(n_runs=2000, seed=42)
