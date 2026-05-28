#!/usr/bin/env python3
"""
Relic-pick simulator for Slime Depths balance auditing.

Models the game's actual rollRelicOffer logic (relics.js:1217) — tier-weighted
draw, owned-relic exclusion, weaponOnly filter, fallback chain — and runs N
simulated runs across multiple player heuristics to surface:
  - Dead picks: relics that get picked <X% of the time when offered
  - Auto-picks: relics that get picked >Y% of the time when offered
  - Isolated relics: ones that never participate in fusions a player will form
  - Theme/slot tier achievement rates per heuristic

Data is hand-encoded from src/relics.js (67 relics), src/fusions.js (28
fusions), src/themes.js (RELIC_THEMES tagging), and the audit pass run
2026-04-30.  Source of truth: TIER_WEIGHTS_BY_FLOOR copied verbatim from
relics.js:1058. Run weaponClass='sword' (default) — wand/dagger/hammer
weaponOnly relics are filtered out, mirroring real player flow.

Usage:
    python relic_sim.py [--runs N] [--seed S]

Output is plain stdout markdown so it diffs cleanly across runs.
"""

import random
import sys
from collections import Counter, defaultdict

# ─── DATA ──────────────────────────────────────────────────────────────

# (id, tier, affects, themes, weaponOnly)
# affects: set of {'sword', 'blast', 'shield', 'any'}
# themes:  set with single theme or empty
# weaponOnly: 'sword' | 'dagger' | 'hammer' | 'wand' | None
RELICS = [
    # Common
    ('bloodrite',           'common', {'sword', 'blast'}, {'blood'},  None),
    ('bloodstone',          'common', {'sword'},          {'blood'},  None),
    ('bulwark',             'common', {'shield'},         {'vow'},    None),
    ('dash_master',         'common', {'shield'},         {'storm'},  None),
    ('executioner',         'common', {'sword', 'blast'}, {'blood'},  None),
    ('gale_step',           'common', {'shield'},         {'storm'},  None),
    ('heavy_blow',          'common', {'sword'},          {'blood'},  None),
    ('hourglass_of_respite','common', {'any'},            {'blood'},  None),
    ('iron_greaves',        'common', {'sword', 'blast'}, {'vow'},    None),
    ('iron_resolve',        'common', {'shield'},         {'vow'},    None),
    ('ironhide',            'common', {'any'},            {'vow'},    None),
    ('keen_edge',           'common', {'sword', 'blast'}, {'shadow'}, None),
    ('long_reach',          'common', {'sword', 'blast'}, {'shadow'}, None),
    ('mirror_shard',        'common', {'shield'},         {'vow'},    None),
    ('nimble_step',         'common', {'shield'},         {'shadow'}, None),
    ('oathshield',          'common', {'shield'},         {'vow'},    None),
    ('phoenix_tear',        'common', {'any'},            {'flame'},  None),
    ('reaver',              'common', {'sword', 'blast'}, {'blood'},  None),
    ('second_wind',         'common', {'shield'},         {'vow'},    None),
    ('serrated_edge',       'common', {'sword', 'blast'}, {'flame'},  None),
    ('spore_bloom',         'common', {'sword', 'blast'}, {'flame'},  None),
    ('swift_arm',           'common', {'sword', 'blast'}, {'storm'},  None),
    ('vitality',            'common', {'any'},            {'blood'},  None),
    ('warlord',             'common', {'sword', 'blast'}, {'blood'},  None),
    # Rare
    ('adaptive_edge',       'rare',   {'sword', 'blast'}, set(),      None),
    ('aegis_pulse',         'rare',   {'shield'},         {'storm'},  None),
    ('arcane_quiver',       'rare',   {'sword'},          {'shadow'}, None),
    ('chain_lightning',     'rare',   {'sword', 'blast'}, {'storm'},  None),
    ('counterstrike',       'rare',   {'shield'},         {'vow'},    None),
    ('earthen_hold',        'rare',   {'sword'},          {'vow'},    'hammer'),
    ('echo_step',           'rare',   {'shield'},         set(),      None),
    ('echoing_strike',      'rare',   {'sword', 'blast'}, {'shadow'}, None),
    ('explosive_kill',      'rare',   {'sword', 'blast'}, {'flame'},  None),
    ('flicker_step',        'rare',   {'shield'},         {'shadow'}, 'dagger'),
    ('honest_edge',         'rare',   {'sword'},          {'vow'},    'sword'),
    ('hymn_of_embers',      'rare',   {'any'},            {'flame'},  None),
    ('marrow_pact',         'rare',   {'sword', 'blast'}, {'blood'},  None),
    ('mountain_strike',     'rare',   {'sword'},          {'vow'},    'hammer'),
    ('pyromancer',          'rare',   {'sword', 'blast'}, {'flame'},  None),
    ('resonance_stone',     'rare',   {'sword', 'blast'}, set(),      None),
    ('ringing_steel',       'rare',   {'sword'},          {'vow'},    'sword'),
    ('soul_burst',          'rare',   {'sword', 'blast'}, {'blood'},  None),
    ('soulreaver',          'rare',   {'sword', 'blast'}, {'blood'},  None),
    ('splintered_light',    'rare',   {'blast'},          {'shadow'}, None),
    ('storm_conduit',       'rare',   {'blast'},          {'storm'},  None),
    ('thunder_step',        'rare',   {'shield'},         {'storm'},  None),
    ('twin_pulse',          'rare',   {'sword'},          {'shadow'}, 'dagger'),
    ('vampiric_aura',       'rare',   {'sword'},          {'blood'},  None),
    # Legendary
    ('avatar_of_flame',     'legendary', {'sword'},          {'flame'},  None),
    ('ethereal_binding',    'legendary', {'any'},            {'blood'},  None),
    ('gilded_hoard',        'legendary', {'any'},            {'vow'},    None),
    ('patient_lens',        'legendary', {'blast'},          {'shadow'}, None),
    ('phase_flicker',       'legendary', {'blast'},          set(),      None),
    ('phoenix_cloak',       'legendary', {'any'},            {'flame'},  None),
    ('razor_pace',          'legendary', {'sword'},          {'shadow'}, 'dagger'),
    ('stormcaller',         'legendary', {'any'},            {'storm'},  None),
    ('temporal_eye',        'legendary', {'shield'},         {'shadow'}, None),
    ('twin_fang_pact',      'legendary', {'sword', 'blast'}, set(),      None),
    ('vow_eternal',         'legendary', {'sword'},          {'vow'},    'sword'),
    ('wanderers_cloak',     'legendary', {'shield'},         {'shadow'}, None),
    ('whisper_veil',        'legendary', {'shield'},         {'shadow'}, None),
    ('world_ender',         'legendary', {'sword'},          {'vow'},    'hammer'),
    # Mythic
    ('cataclysm',           'mythic', {'sword', 'blast'}, {'flame'},  None),
    ('coin_of_tyrant',      'mythic', {'any'},            {'flame'},  None),
    ('eye_of_ether',        'mythic', {'sword', 'blast'}, {'shadow'}, None),
    ('heart_of_wound',      'mythic', {'any'},            {'flame'},  None),
    ('stride_of_ash',       'mythic', {'shield'},         {'flame'},  None),
]

# Fusion: (id, name, parts, result_tier)
FUSIONS = [
    ('aegis_wall',     ('bulwark', 'iron_resolve')),
    ('avalanche',      ('mountain_strike', 'heavy_blow')),
    ('blood_moon',     ('vampiric_aura', 'bloodrite')),
    ('conflagration',  ('pyromancer', 'avatar_of_flame')),
    ('crescendo',      ('ringing_steel', 'soulreaver')),
    ('final_verdict',  ('eye_of_ether', 'executioner')),
    ('forked_sky',     ('splintered_light', 'chain_lightning')),
    ('kingslayer',     ('long_reach', 'serrated_edge')),
    ('martyr_bloom',   ('marrow_pact', 'vampiric_aura')),
    ('mortal_cadence', ('razor_pace', 'executioner')),
    ('mountains_heart',('ironhide', 'vitality')),
    ('obsidian_edge',  ('keen_edge', 'serrated_edge')),
    ('phantom_blade',  ('soulreaver', 'echoing_strike')),
    ('rebirth_pyre',   ('phoenix_cloak', 'cataclysm')),
    ('ringbearer',     ('vitality', 'bloodstone')),
    ('riposte',        ('counterstrike', 'wanderers_cloak')),
    ('shatterpoint',   ('mirror_shard', 'counterstrike')),
    ('sparrows_dance', ('swift_arm', 'gale_step')),
    ('stalwart',       ('iron_resolve', 'aegis_pulse')),
    ('starweave',      ('keen_edge', 'eye_of_ether')),
    ('storm_dance',    ('chain_lightning', 'thunder_step')),
    ('stormveil',      ('stormcaller', 'whisper_veil')),
    ('sworn_reply',    ('vow_eternal', 'counterstrike')),
    ('tempest',        ('heavy_blow', 'warlord')),
    ('tesla_storm',    ('chain_lightning', 'explosive_kill')),
    ('weaving_step',   ('second_wind', 'nimble_step')),
    ('wildfire_choir', ('hymn_of_embers', 'pyromancer')),
    ('witness',        ('bloodstone', 'ethereal_binding')),
]

# Per-relic fusion-partner lookup: id -> set(partner_ids)
FUSION_PARTNERS = defaultdict(set)
for _, parts in FUSIONS:
    a, b = parts
    FUSION_PARTNERS[a].add(b)
    FUSION_PARTNERS[b].add(a)

# RELIC_DEFS lookup: id -> (tier, affects, themes, weaponOnly)
RELIC_DEFS = {r[0]: (r[1], r[2], r[3], r[4]) for r in RELICS}

TIER_WEIGHTS_BY_FLOOR = {
    1: {'common': 1.0,  'rare': 0.0,  'legendary': 0.0,  'mythic': 0.0},
    2: {'common': 0.60, 'rare': 0.35, 'legendary': 0.05, 'mythic': 0.0},
    3: {'common': 0.45, 'rare': 0.40, 'legendary': 0.15, 'mythic': 0.0},
    4: {'common': 0.25, 'rare': 0.42, 'legendary': 0.23, 'mythic': 0.10},
}

FALLBACK_ORDER = ['mythic', 'legendary', 'rare', 'common']

# Pedestals per floor (rough — see audit). Floor 1 starts with 1 pedestal,
# floors 2-4 each have ~3 + altar/secret. Picks-per-pedestal=1, offers=3.
PEDESTALS_PER_FLOOR = {1: 1, 2: 3, 3: 3, 4: 3}


# ─── ROLLER (mirrors rollRelicOffer in relics.js:1217) ──────────────────

def weighted_tier(floor_level, rng):
    weights = TIER_WEIGHTS_BY_FLOOR.get(floor_level, TIER_WEIGHTS_BY_FLOOR[1])
    r = rng.random()
    acc = 0
    for t, w in weights.items():
        acc += w
        if r <= acc:
            return t
    return 'common'


def roll_offer(n, floor_level, owned_ids, weapon_class, rng):
    """Mirror rollRelicOffer: weighted tier draw, weaponOnly filter, fallback chain."""
    available_by_tier = {'common': [], 'rare': [], 'legendary': [], 'mythic': []}
    for rid, (tier, _, _, weapon_only) in RELIC_DEFS.items():
        if rid in owned_ids:
            continue
        if weapon_only and weapon_only != weapon_class:
            continue
        available_by_tier[tier].append(rid)

    picks = []
    for _ in range(n):
        target = weighted_tier(floor_level, rng)
        try_order = [target] + [t for t in FALLBACK_ORDER if t != target]
        got = None
        for t in try_order:
            if available_by_tier[t]:
                idx = rng.randrange(len(available_by_tier[t]))
                got = available_by_tier[t].pop(idx)
                break
        if not got:
            break
        picks.append(got)
    return picks


# ─── PICK HEURISTICS ────────────────────────────────────────────────────

TIER_RANK = {'common': 0, 'rare': 1, 'legendary': 2, 'mythic': 3}


def heuristic_random(offer, owned, rng):
    return rng.choice(offer)


def heuristic_greedy_tier(offer, owned, rng):
    """Pick the highest-tier relic; ties broken by id sort for determinism."""
    return max(offer, key=lambda r: (TIER_RANK[RELIC_DEFS[r][0]], r))


def heuristic_synergy_fusion(offer, owned, rng):
    """Prefer relics that complete (or move toward) fusions with current build.
    Score = +3 if completes a fusion this pick, +1 per fusion partner already
    in build. Tiebreak: tier rank."""
    def score(rid):
        partners = FUSION_PARTNERS.get(rid, set())
        completes = sum(1 for p in partners if p in owned)
        # +5 if literally completes a fusion (one partner owned)
        return (completes * 3 + (5 if completes else 0), TIER_RANK[RELIC_DEFS[rid][0]], rid)
    return max(offer, key=score)


def heuristic_theme_stacker(offer, owned, rng):
    """Lock onto whichever theme has the most owned; greedy-tier as tiebreak."""
    theme_counts = Counter()
    for rid in owned:
        for theme in RELIC_DEFS[rid][2]:
            theme_counts[theme] += 1

    def score(rid):
        themes = RELIC_DEFS[rid][2]
        own_theme_score = max((theme_counts[t] for t in themes), default=0)
        return (own_theme_score, TIER_RANK[RELIC_DEFS[rid][0]], rid)
    return max(offer, key=score)


def heuristic_slot_stacker(offer, owned, rng):
    """Lock onto the slot with the most owned (sword vs blast vs shield).
    'any' counts toward all slots. Tiebreak: tier."""
    slot_counts = Counter()
    for rid in owned:
        affects = RELIC_DEFS[rid][1]
        for slot in affects:
            if slot != 'any':
                slot_counts[slot] += 1

    def score(rid):
        affects = RELIC_DEFS[rid][1]
        own_slot_score = max((slot_counts[s] for s in affects if s != 'any'), default=0)
        if 'any' in affects:
            own_slot_score = max(own_slot_score, max(slot_counts.values(), default=0))
        return (own_slot_score, TIER_RANK[RELIC_DEFS[rid][0]], rid)
    return max(offer, key=score)


HEURISTICS = {
    'random': heuristic_random,
    'greedy_tier': heuristic_greedy_tier,
    'synergy_fusion': heuristic_synergy_fusion,
    'theme_stacker': heuristic_theme_stacker,
    'slot_stacker': heuristic_slot_stacker,
}


# ─── RUN SIMULATION ─────────────────────────────────────────────────────

def simulate_run(heuristic_fn, weapon_class, rng):
    """Simulate one run. Returns (owned_ids, fusions_formed, offer_log).
    offer_log: list of (relic_id, was_picked) for each relic in each offer."""
    owned = []
    offer_log = []
    for floor in (1, 2, 3, 4):
        for _ in range(PEDESTALS_PER_FLOOR[floor]):
            offer = roll_offer(3, floor, set(owned), weapon_class, rng)
            if not offer:
                continue
            picked = heuristic_fn(offer, owned, rng)
            for r in offer:
                offer_log.append((r, r == picked))
            owned.append(picked)

    # Count fusions formed (set of completed pairs)
    owned_set = set(owned)
    fusions_formed = []
    for fid, parts in FUSIONS:
        if parts[0] in owned_set and parts[1] in owned_set:
            fusions_formed.append(fid)

    return owned, fusions_formed, offer_log


def get_themes(rid):
    return RELIC_DEFS[rid][2]


def get_slots(rid):
    return RELIC_DEFS[rid][1]


def theme_tier_at_run_end(owned):
    """0=none, 1=resonance, 2=ascendance. Storm uses asymmetric threshold
    (2/4) reflecting its smaller relic pool — without it, storm asc rate
    is 4-8x lower than blood."""
    counts = Counter()
    for rid in owned:
        for t in get_themes(rid):
            counts[t] += 1
    tiers = {}
    # PROPOSED PATCH — per-theme thresholds so smaller pools don't get
    # punished. Storm has 8 relics, others have 12-15. With uniform 3/5
    # thresholds storm asc requires nearly the entire pool.
    # Mirrors THEME_THRESHOLDS in src/themes.js — storm has a smaller pool
    # (8 relics vs 12-15 for the others) so its ascendance threshold drops
    # to 4. Resonance stays uniform at 3 across all themes.
    THEME_THRESH = {
        'storm':  (3, 4),
        'flame':  (3, 5),
        'blood':  (3, 5),
        'vow':    (3, 5),
        'shadow': (3, 5),
    }
    for theme in ('storm', 'flame', 'blood', 'vow', 'shadow'):
        c = counts.get(theme, 0)
        res, asc = THEME_THRESH[theme]
        if c >= asc:
            tiers[theme] = 2
        elif c >= res:
            tiers[theme] = 1
        else:
            tiers[theme] = 0
    return tiers


def slot_tier_at_run_end(owned):
    counts = Counter()
    for rid in owned:
        affects = get_slots(rid)
        for slot in affects:
            if slot != 'any':
                counts[slot] += 1
    tiers = {}
    for slot in ('sword', 'blast', 'shield'):
        c = counts.get(slot, 0)
        if c >= 5:
            tiers[slot] = 2
        elif c >= 3:
            tiers[slot] = 1
        else:
            tiers[slot] = 0
    return tiers


# ─── REPORT ─────────────────────────────────────────────────────────────

def run_simulation(n_runs, weapon_class, seed):
    rng = random.Random(seed)
    out = {}
    for hname, hfn in HEURISTICS.items():
        offered = Counter()
        picked = Counter()
        all_picks = Counter()
        fusion_total = 0
        runs_with_fusion = 0
        theme_tier_sum = Counter()
        slot_tier_sum = Counter()
        run_fusion_counts = []
        for _ in range(n_runs):
            owned, fusions, offer_log = simulate_run(hfn, weapon_class, rng)
            for r, was_picked in offer_log:
                offered[r] += 1
                if was_picked:
                    picked[r] += 1
            for r in owned:
                all_picks[r] += 1
            fusion_total += len(fusions)
            if fusions:
                runs_with_fusion += 1
            run_fusion_counts.append(len(fusions))
            for theme, tier in theme_tier_at_run_end(owned).items():
                theme_tier_sum[(theme, tier)] += 1
            for slot, tier in slot_tier_at_run_end(owned).items():
                slot_tier_sum[(slot, tier)] += 1

        # Pick rate when offered
        pick_rates = {}
        for rid in RELIC_DEFS:
            if offered[rid] > 0:
                pick_rates[rid] = picked[rid] / offered[rid]
            else:
                pick_rates[rid] = None

        out[hname] = {
            'offered': offered,
            'picked': picked,
            'all_picks': all_picks,
            'pick_rates': pick_rates,
            'fusion_total': fusion_total,
            'runs_with_fusion': runs_with_fusion,
            'avg_fusions_per_run': fusion_total / n_runs,
            'theme_tier_sum': theme_tier_sum,
            'slot_tier_sum': slot_tier_sum,
            'run_fusion_counts': run_fusion_counts,
        }
    return out


def fmt_pct(v):
    if v is None:
        return ' n/a'
    return f'{v*100:5.1f}%'


def print_report(results, n_runs):
    print(f'# RELIC SIMULATION REPORT - {n_runs} runs/heuristic, weapon=sword\n')
    print(f'Total relics in pool: {len(RELICS)} (sword-class only — '
          f'{sum(1 for r in RELICS if r[4] in (None, "sword"))} eligible)')
    print(f'Per-run pedestal count: {sum(PEDESTALS_PER_FLOOR.values())} '
          f'(F1:{PEDESTALS_PER_FLOOR[1]} + F2:{PEDESTALS_PER_FLOOR[2]} + '
          f'F3:{PEDESTALS_PER_FLOOR[3]} + F4:{PEDESTALS_PER_FLOOR[4]})\n')

    # ── 1. Fusion + theme/slot tier stats per heuristic
    print('## 1. SUMMARY PER HEURISTIC')
    print()
    print('| Heuristic       | Avg fusions/run | Runs w/ >=1 fusion | Themes T1+ | Themes T2 | Slots T1+ | Slots T2 |')
    print('|-----------------|-----------------|--------------------|------------|-----------|-----------|----------|')
    for h, r in results.items():
        themes_t1 = sum(c for (theme, t), c in r['theme_tier_sum'].items() if t >= 1) / n_runs
        themes_t2 = sum(c for (theme, t), c in r['theme_tier_sum'].items() if t >= 2) / n_runs
        slots_t1 = sum(c for (slot, t), c in r['slot_tier_sum'].items() if t >= 1) / n_runs
        slots_t2 = sum(c for (slot, t), c in r['slot_tier_sum'].items() if t >= 2) / n_runs
        print(f'| {h:15} | {r["avg_fusions_per_run"]:15.2f} | '
              f'{r["runs_with_fusion"]/n_runs*100:17.1f}% | '
              f'{themes_t1:9.2f}× | {themes_t2:8.2f}× | '
              f'{slots_t1:8.2f}× | {slots_t2:7.2f}× |')

    # ── 2. Pick rate when offered (greedy_tier as canonical)
    print('\n## 2. PICK-RATE WHEN OFFERED (greedy_tier heuristic)')
    print('A relic offered N times, picked K times -> pick rate K/N.\n')
    h = results['greedy_tier']
    sorted_relics = sorted(
        [(rid, h['pick_rates'][rid], h['offered'][rid])
         for rid in RELIC_DEFS if h['offered'][rid] >= 5],
        key=lambda x: (x[1] if x[1] is not None else -1)
    )
    print('### Bottom 15 (DEAD PICKS — never chosen):')
    print('| Relic | Tier | Pick rate | Offered |')
    print('|-------|------|-----------|---------|')
    for rid, pr, off in sorted_relics[:15]:
        tier = RELIC_DEFS[rid][0]
        print(f'| {rid:25} | {tier:10} | {fmt_pct(pr)} | {off:6} |')

    print('\n### Top 15 (AUTO-PICKS — always chosen):')
    print('| Relic | Tier | Pick rate | Offered |')
    print('|-------|------|-----------|---------|')
    for rid, pr, off in reversed(sorted_relics[-15:]):
        tier = RELIC_DEFS[rid][0]
        print(f'| {rid:25} | {tier:10} | {fmt_pct(pr)} | {off:6} |')

    # ── 3. Cross-heuristic comparison: which relics are universally weak?
    print('\n## 3. UNIVERSALLY-WEAK RELICS (low pick-rate across ALL heuristics)')
    print('A relic chosen <30% of the time across EVERY heuristic is structurally weak.\n')
    print('| Relic | Tier | random | greedy | synergy | theme | slot |')
    print('|-------|------|--------|--------|---------|-------|------|')
    weak = []
    for rid in RELIC_DEFS:
        rates = []
        for h in HEURISTICS:
            r = results[h]['pick_rates'][rid]
            if r is None:
                rates.append(None)
            else:
                rates.append(r)
        valid = [r for r in rates if r is not None]
        if not valid:
            continue
        if max(valid) < 0.30:
            weak.append((rid, rates))
    for rid, rates in sorted(weak, key=lambda x: (RELIC_DEFS[x[0]][0], x[0])):
        tier = RELIC_DEFS[rid][0]
        cells = ' | '.join(fmt_pct(r) for r in rates)
        print(f'| {rid:22} | {tier:10} | {cells} |')

    # ── 4. Fusion completion rate by heuristic (which fusions form?)
    print('\n## 4. FUSION-COMPLETION RATE PER HEURISTIC')
    print('% of runs that closed each fusion. <5% = fusion is functionally invisible to that player.\n')
    fusion_runs_by_h = defaultdict(lambda: defaultdict(int))
    rng = random.Random(99)  # re-run for fusion stats
    for hname, hfn in HEURISTICS.items():
        for _ in range(n_runs):
            owned, fusions, _ = simulate_run(hfn, 'sword', rng)
            for f in fusions:
                fusion_runs_by_h[hname][f] += 1
    print('| Fusion | random | greedy | synergy | theme | slot |')
    print('|--------|--------|--------|---------|-------|------|')
    for fid, _ in sorted(FUSIONS):
        cells = ' | '.join(
            f'{fusion_runs_by_h[h][fid]/n_runs*100:5.1f}%' for h in HEURISTICS
        )
        print(f'| {fid:18} | {cells} |')

    # ── 5. Theme tier achievement rate
    print('\n## 5. THEME ACHIEVEMENT RATE (per heuristic)')
    print('Pct of runs that hit T1 (3-relic resonance) or T2 (5-relic ascendance) per theme.\n')
    print('| Theme  |       | random | greedy | synergy | theme | slot |')
    print('|--------|-------|--------|--------|---------|-------|------|')
    for theme in ('storm', 'flame', 'blood', 'vow', 'shadow'):
        for tier_name, tier_min in (('T1+', 1), ('T2', 2)):
            cells = []
            for h in HEURISTICS:
                r = results[h]
                count = sum(c for (t, ti), c in r['theme_tier_sum'].items()
                            if t == theme and ti >= tier_min)
                cells.append(f'{count/n_runs*100:5.1f}%')
            cells_str = ' | '.join(cells)
            print(f'| {theme:6} | {tier_name:5} | {cells_str} |')


def main():
    n_runs = 1000
    seed = 42
    args = sys.argv[1:]
    if '--runs' in args:
        n_runs = int(args[args.index('--runs') + 1])
    if '--seed' in args:
        seed = int(args[args.index('--seed') + 1])

    print(f'Running {n_runs} runs/heuristic with seed={seed}\n')
    results = run_simulation(n_runs, 'sword', seed)
    print_report(results, n_runs)


if __name__ == '__main__':
    main()
