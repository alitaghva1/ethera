#!/usr/bin/env python3
"""
ETHERA — balance simulator (systems-roguelite audit pass)

Mirrors the JavaScript damage / relic / enemy math from src/ and runs
Monte Carlo simulations to surface:
  * Dead relics: appear in builds but contribute little to DPS
  * Dominant relics: trivialize combat when present
  * Build-variety entropy: is every high-performing build the same 3 relics?
  * Time-to-kill pacing: can mid-tier builds clear each floor's boss in a
    reasonable window without getting one-shot?

Run:   python3 sim/balance.py
Output: stdout design report. No writes to the game.

This script intentionally does NOT import any JS — it re-declares the
relevant constants below. When we rebalance in src/, we mirror the change
here so the sim and the game agree.
"""

import random
import statistics
import sys
from collections import Counter, defaultdict

# Windows default console is cp1252; force UTF-8 so our symbols render.
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

# ============================================================================
#  MIRRORED GAME DATA (from slime-depths/src/)
# ============================================================================

# src/weapons.js — three weapon classes with distinct DPS profiles
WEAPONS = {
    'sword':  {'damage': 32, 'cooldown': 0.42, 'reach': 72},
    'dagger': {'damage': 18, 'cooldown': 0.26, 'reach': 58},
    'hammer': {'damage': 72, 'cooldown': 0.68, 'reach': 92},
}

# src/relics.js — common/rare/legendary pool. Each relic is modeled as a
# function that mutates a hero dict (same shape as in hero.js resetHero()).
# We simplify stochastic procs into expected-value multipliers in expected_dps().

RELICS_COMMON = [
    ('serrated_edge',  lambda h: h.update(damageMul=h['damageMul']*1.30)),
    ('swift_arm',      lambda h: h.update(attackCooldownMul=h['attackCooldownMul']*0.75)),
    ('long_reach',     lambda h: h.update(reachMul=h['reachMul']*1.25)),
    ('nimble_step',    lambda h: h.update(dodgeCooldownMul=h['dodgeCooldownMul']*0.50)),
    ('iron_greaves',   lambda h: h.update(speedMul=h['speedMul']*1.20)),
    ('ironhide',       lambda h: h.update(maxHp=h['maxHp']+2)),
    ('bloodstone',     lambda h: h.update(lifesteal=h['lifesteal']+0.10)),
    ('phoenix_tear',   lambda h: h.update(revives=h['revives']+1)),
    ('iron_resolve',   lambda h: h.update(damageTakenMul=h['damageTakenMul']*0.75)),
    ('keen_edge',      lambda h: h.update(critChance=h['critChance']+0.15)),
    ('vitality',       lambda h: h.update(regenRate=h['regenRate']+0.125)),
    ('heavy_blow',     lambda h: h.update(knockbackMul=h['knockbackMul']*2.5)),
    ('dash_master',    lambda h: h.update(dodgeDistMul=h['dodgeDistMul']*1.35)),
    ('executioner',    lambda h: h.update(executeThreshold=0.40, executeMul=1.5)),
    ('warlord',        lambda h: h.update(damageMul=h['damageMul']*(1+0.08*h['relicCount']))),
    ('reaver',         lambda h: (
        h.update(lifesteal=h['lifesteal']+0.15),
        h.update(critChance=max(h['critChance'], 0.08)))),
    ('bloodrite',      lambda h: h.update(bloodrite=True)),
    ('gale_step',      lambda h: h.update(dodgeDistMul=h['dodgeDistMul']*1.35)),
]

RELICS_RARE = [
    ('chain_lightning',  lambda h: h.update(chainLightning=True)),
    ('explosive_kill',   lambda h: h.update(explosiveKill=True)),
    ('soul_burst',       lambda h: h.update(soulBurst=True)),
    ('thunder_step',     lambda h: h.update(thunderStep=True)),
    ('vampiric_aura',    lambda h: h.update(vampiricAura=True)),
    ('echoing_strike',   lambda h: h.update(echoingStrike=True)),
    ('pyromancer',       lambda h: h.update(pyromancer=True)),
    ('soulreaver',       lambda h: h.update(soulreaver=True)),
    ('counterstrike',    lambda h: h.update(counterstrike=True)),
    ('aegis_pulse',      lambda h: h.update(aegisPulse=True)),
]

RELICS_LEGENDARY = [
    ('eye_of_ether',     lambda h: (
        h.update(critChance=h['critChance']+0.20),
        h.update(pierceCrit=True))),
    ('cataclysm',        lambda h: h.update(cataclysm=True)),
    ('wanderers_cloak',  lambda h: h.update(wandererCloak=True)),
    ('ethereal_binding', lambda h: h.update(etherealBinding=True)),
    ('phoenix_cloak',    lambda h: (
        h.update(revives=h['revives']+1),
        h.update(phoenixCloak=True))),
    ('avatar_of_flame',  lambda h: (
        h.update(avatarOfFlame=True),
        h.update(damageMul=h['damageMul']*1.15))),
]

ALL_RELICS = {r[0]: (tier, r[1]) for tier, pool in
              [('common', RELICS_COMMON), ('rare', RELICS_RARE), ('legendary', RELICS_LEGENDARY)]
              for r in pool}

# src/fusions.js — selected pairs that form named combos. For the sim we
# approximate each fusion as an additional 8-15% DPS uplift when both
# components are present. Real game applies them non-linearly.
FUSIONS = {
    ('chain_lightning', 'explosive_kill'): ('tesla_storm', 1.15),
    ('vampiric_aura', 'bloodrite'):       ('blood_moon', 1.10),
    ('phoenix_cloak', 'cataclysm'):       ('rebirth_pyre', 1.08),
    ('pyromancer', 'avatar_of_flame'):    ('conflagration', 1.22),
    ('soulreaver', 'echoing_strike'):     ('phantom_blade', 1.18),
    ('chain_lightning', 'thunder_step'):  ('storm_dance', 1.12),
    ('counterstrike', 'wanderers_cloak'): ('riposte', 1.10),
    ('ironhide', 'vitality'):             ("mountains_heart", 1.10),
    ('keen_edge', 'serrated_edge'):       ('obsidian_edge', 1.15),
    ('heavy_blow', 'warlord'):            ('tempest', 1.20),
    ('eye_of_ether', 'executioner'):      ('final_verdict', 1.25),
    ('iron_resolve', 'aegis_pulse'):      ('stalwart', 1.08),
    ('swift_arm', 'gale_step'):           ('sparrows_dance', 1.12),
    ('bloodstone', 'ethereal_binding'):   ('witness', 1.05),
}

# src/floor.js — per-floor enemy scaling
FLOOR_ENEMY_MULS = {
    1: {'dmg': 1.15, 'hp': 1.10},
    2: {'dmg': 1.40, 'hp': 1.30},
    3: {'dmg': 1.70, 'hp': 1.55},
    4: {'dmg': 2.00, 'hp': 1.80},
}

# src/relics.js — tier rolls per floor
TIER_WEIGHTS = {
    1: {'common': 1.00, 'rare': 0.00, 'legendary': 0.00},
    2: {'common': 0.65, 'rare': 0.35, 'legendary': 0.00},
    3: {'common': 0.45, 'rare': 0.40, 'legendary': 0.15},
    4: {'common': 0.30, 'rare': 0.45, 'legendary': 0.25},
}

# src/enemies.js — boss base HP, multiplied by 3 (boss) and floor hpMul
_BASE_BOSS_HP = {1: 150, 2: 180, 3: 240, 4: 280}
BOSS_HP = {f: hp * 3 * FLOOR_ENEMY_MULS[f]['hp'] for f, hp in _BASE_BOSS_HP.items()}

# ============================================================================
#  HERO CONSTRUCTION
# ============================================================================

def new_hero(weapon):
    return {
        'weapon': weapon,
        'maxHp': 8, 'hp': 8, 'revives': 0,
        'damageMul': 1.0, 'attackCooldownMul': 1.0, 'reachMul': 1.0,
        'dodgeCooldownMul': 1.0, 'speedMul': 1.0, 'lifesteal': 0.0,
        'damageTakenMul': 1.0, 'critChance': 0.0, 'critMul': 2.0,
        'regenRate': 0.0, 'knockbackMul': 1.0, 'dodgeDistMul': 1.0,
        'executeThreshold': 0.0, 'executeMul': 1.5,
        'bloodrite': False, 'chainLightning': False, 'explosiveKill': False,
        'thunderStep': False, 'pyromancer': False, 'soulreaver': False,
        'counterstrike': False, 'aegisPulse': False, 'pierceCrit': False,
        'cataclysm': False, 'wandererCloak': False, 'phoenixCloak': False,
        'avatarOfFlame': False, 'etherealBinding': False, 'vampiricAura': False,
        'soulBurst': False, 'echoingStrike': False,
        'relics': [], 'relicCount': 0,
    }


def apply_relic(hero, rid, effect):
    effect(hero)
    hero['relics'].append(rid)
    hero['relicCount'] = len(hero['relics'])


def fusion_multiplier(relics):
    """Stacked multiplier from all fusions that fire given the owned relic set."""
    mul = 1.0
    rs = set(relics)
    for (a, b), (_name, m) in FUSIONS.items():
        if a in rs and b in rs:
            mul *= m
    return mul


# ============================================================================
#  DPS / SURVIVAL MODEL
# ============================================================================

def expected_dps(hero):
    """Expected DPS including crits, procs, combo, fusions."""
    w = WEAPONS[hero['weapon']]
    attacks_per_sec = 1.0 / (w['cooldown'] * hero['attackCooldownMul'])
    base_hit = w['damage'] * hero['damageMul']

    crit = hero['critChance']
    eff_crit = (1 - crit) + crit * hero['critMul']
    hit = base_hit * eff_crit

    proc_bonus = 1.0
    # Additive DPS from procs that fire periodically — approximate expected value.
    if hero['chainLightning']:  proc_bonus *= 1.23
    if hero['explosiveKill']:   proc_bonus *= 1.12
    if hero['echoingStrike']:   proc_bonus *= 1.60
    if hero['pyromancer']:      proc_bonus *= 1.15
    if hero['cataclysm']:       proc_bonus *= 1.15
    if hero['avatarOfFlame']:   proc_bonus *= 1.10
    if hero['vampiricAura']:    proc_bonus *= 1.05
    if hero['pierceCrit'] and crit >= 0.15:
        proc_bonus *= 1.10

    exec_bonus = 1.0
    if hero['executeThreshold'] > 0:
        # Assume ~25% of combat damage lands on sub-threshold enemies
        exec_bonus = 1.0 + 0.25 * (hero['executeMul'] - 1)

    # Average combo tier active — rough 50% uptime at tier 10 (+12%)
    combo_bonus = 1.06

    if hero['soulreaver']:
        attacks_per_sec *= 1.25
    if hero['wandererCloak']:
        attacks_per_sec *= 1.20

    fus = fusion_multiplier(hero['relics'])

    return hit * attacks_per_sec * proc_bonus * exec_bonus * combo_bonus * fus


def survival_metric(hero):
    """Effective HP — raw HP / damage taken multiplier, plus revive/lifesteal value."""
    base = hero['maxHp'] / hero['damageTakenMul']
    revive_ehp = hero['revives'] * 0.4 * hero['maxHp']
    lifesteal_ehp = hero['lifesteal'] * 80   # rough: 10% lifesteal over 20 kills = 8 HP recovered
    regen_ehp = hero['regenRate'] * 300       # rough: 0.125/s over 300s run = 37 HP over time
    return base + revive_ehp + lifesteal_ehp + regen_ehp


# ============================================================================
#  RUN SIMULATION
# ============================================================================

def pick_weighted_tier(floor):
    r = random.random()
    acc = 0
    for tier, w in TIER_WEIGHTS[floor].items():
        acc += w
        if r <= acc:
            return tier
    return 'common'


def roll_relic(floor, already_owned):
    tier = pick_weighted_tier(floor)
    pools = {'common': RELICS_COMMON, 'rare': RELICS_RARE, 'legendary': RELICS_LEGENDARY}
    for t in [tier, 'legendary', 'rare', 'common']:
        available = [r for r in pools[t] if r[0] not in already_owned]
        if available:
            return (t, random.choice(available))
    return None


def simulate_run(weapon='sword', picks_per_floor=2):
    hero = new_hero(weapon)
    owned = set()
    for floor in range(1, 5):
        for _ in range(picks_per_floor):
            roll = roll_relic(floor, owned)
            if not roll: continue
            _tier, (rid, effect) = roll
            apply_relic(hero, rid, effect)
            owned.add(rid)
    return hero


# ============================================================================
#  ANALYSIS PIPELINE
# ============================================================================

def analyze(n=10000, picks_per_floor=2):
    rows = []
    for _ in range(n):
        wpn = random.choice(list(WEAPONS.keys()))
        hero = simulate_run(wpn, picks_per_floor)
        dps = expected_dps(hero)
        ehp = survival_metric(hero)
        rows.append({
            'weapon': wpn,
            'dps': dps,
            'ehp': ehp,
            'ttk': {f: BOSS_HP[f] / dps for f in BOSS_HP},
            'relics': tuple(hero['relics']),
            'relicCount': hero['relicCount'],
        })
    return rows


def pct(values, q):
    """Percentile without numpy."""
    s = sorted(values)
    idx = int(q * (len(s) - 1))
    return s[idx]


def print_section(title):
    print()
    print('=' * 72)
    print(title)
    print('=' * 72)


def report(rows):
    print_section('DPS DISTRIBUTION')
    dps = [r['dps'] for r in rows]
    print(f'  n={len(rows)}')
    print(f'  min={min(dps):.0f}, p10={pct(dps, 0.10):.0f}, p50={pct(dps, 0.50):.0f}, p90={pct(dps, 0.90):.0f}, max={max(dps):.0f}')

    print_section('PER-WEAPON DPS (p50 / p90)')
    for w in WEAPONS:
        wr = [r['dps'] for r in rows if r['weapon'] == w]
        print(f'  {w:7}  p50={pct(wr, 0.50):>5.0f}   p90={pct(wr, 0.90):>5.0f}   n={len(wr)}')

    print_section('BOSS TIME-TO-KILL (seconds, floor → p10 / p50 / p90)')
    print('  (low p10 = speedruns, high p90 = drag-out grinds)')
    for f in BOSS_HP:
        ttks = [r['ttk'][f] for r in rows]
        print(f'  floor {f} (HP {BOSS_HP[f]:.0f}):  p10={pct(ttks, 0.10):>5.1f}s   p50={pct(ttks, 0.50):>5.1f}s   p90={pct(ttks, 0.90):>5.1f}s')

    print_section('RELIC APPEARANCE RATE (% of builds containing)')
    rc = Counter()
    for r in rows:
        for rid in r['relics']:
            rc[rid] += 1
    sorted_rc = rc.most_common()
    print('  Top 5 (most frequently in builds):')
    for rid, c in sorted_rc[:5]:
        print(f'    {rid:22}  {100*c/len(rows):>5.1f}%  (n={c})')
    print('  Bottom 5:')
    for rid, c in sorted_rc[-5:]:
        print(f'    {rid:22}  {100*c/len(rows):>5.1f}%  (n={c})')

    print_section('RELIC DPS UPLIFT (avg DPS when owned vs not)')
    print('  Negative = "dead weight" relic, zero-to-positive = healthy, big positive = dominant')
    avg_all = statistics.mean(dps)
    relic_dps = defaultdict(list)
    for r in rows:
        for rid in r['relics']:
            relic_dps[rid].append(r['dps'])
    contrib = []
    for rid, dpses in relic_dps.items():
        if len(dpses) < 50: continue  # ignore rare cases
        avg_with = statistics.mean(dpses)
        uplift = avg_with - avg_all
        contrib.append((rid, uplift, avg_with, len(dpses), ALL_RELICS[rid][0]))
    contrib.sort(key=lambda x: -x[1])
    print('  {:<22} {:<5} {:>8} {:>8}'.format('relic', 'tier', 'uplift', 'avg DPS'))
    for rid, uplift, avg_with, n, tier in contrib:
        mark = '↑' if uplift > 30 else ('↓' if uplift < -10 else ' ')
        print(f'  {rid:<22} {tier:<5} {uplift:>+8.0f} {avg_with:>8.0f}  {mark}')

    print_section('BUILD-VARIETY ENTROPY (are high-DPS builds homogeneous?)')
    # Sort by DPS, take top 10% of runs, count most common relics in them
    top_cut = sorted(rows, key=lambda r: -r['dps'])[:max(100, len(rows) // 10)]
    top_counts = Counter()
    for r in top_cut:
        for rid in r['relics']:
            top_counts[rid] += 1
    print(f'  Looking at top {len(top_cut)} runs by DPS:')
    print('  Relics most present in top builds:')
    for rid, c in top_counts.most_common(10):
        print(f'    {rid:<22}  {100*c/len(top_cut):>5.1f}%  ({ALL_RELICS[rid][0]})')

    print_section('FUSION ACTIVATION RATE')
    fusion_hits = Counter()
    for r in rows:
        rset = set(r['relics'])
        for (a, b), (name, _) in FUSIONS.items():
            if a in rset and b in rset:
                fusion_hits[name] += 1
    for name, c in fusion_hits.most_common():
        print(f'  {name:<22}  {100*c/len(rows):>5.1f}%  (n={c})')

    print_section('SURVIVAL — expected EHP distribution')
    ehps = [r['ehp'] for r in rows]
    print(f'  p10={pct(ehps, 0.10):.1f}, p50={pct(ehps, 0.50):.1f}, p90={pct(ehps, 0.90):.1f}')


if __name__ == '__main__':
    print('ETHERA balance simulator — Monte Carlo over random builds')
    print('Picks per floor: 2  (≈8 relics/run)')
    random.seed(42)  # reproducible
    rows = analyze(n=10000, picks_per_floor=2)
    report(rows)
