# Relic Audit + Sim Findings — iter-96 prep

Three converging signals: a static catalog audit, a competitor-roguelite
benchmark, and a 2000-run Monte Carlo sim. All three point at the same
weak spots in the iter-95 relic pool.

## Headline findings

1. **The pool is 65% passive stat-sticks.** Of 48 relics, ~31 are pure
   modifier-folding (`+X% damage`, `+1 HP`). Hades and Slay the Spire lean
   the other way: relics are TRIGGER+OUTCOME, not passive numbers. This
   is the single biggest "boring pool" complaint substrate.

2. **6 relics are mechanically dead** because iter-95 removed the dodge
   ability without retuning the relics that scaled with it:
   - `sturdy_step` (common) — only mod is `dodge_iframes_bonus_f` ← DEAD
   - `dodge_master` (rare) — only mod is `dodge_cooldown_mul` ← DEAD
   - `phantom_step` (mythic) — 2 of 3 mods dead → effectively a +50% MS
     mythic that's **worse than `boots_of_haste` legendary**
   - `gale_step` (rare) — partial DEAD; strictly worse than `nimble`
   - `tempest_cloak` (rare) — partial DEAD; anemic without the iframes
   - SHADOW theme resonance bonus reads the dead `dodge_iframes_bonus_f`
     key → tier-1 SHADOW grants a no-op stat

3. **Sim confirms 4 relics are functionally invisible** (≤2% pick rate
   even by greedy AI across 2000 runs):
   - `iron_grip` — 0.1%
   - `sturdy_step` — 0.2% (DEAD)
   - `dodge_master` — 1.1% (DEAD)
   - `arcane_quiver` — 2.2%
   - `executioner` — 2.1% (sim under-models low-HP scaling; the relic is
     stronger than this suggests, but UX is opaque)

4. **Theme bonuses rarely fire.** Greedy strategy across 2000 runs hits
   each theme's ascendance (4+ relics) at:
   - STORM 9.4% · FLAME 2.0% · BLOOD 0.4% · VOW 0.3% · SHADOW 0.1%
   
   At 6 relics total per run, you'd need 4/6 = 67% of picks dedicated to
   one theme to trigger ascendance. With DPS+survival pressure, that's
   nearly impossible. **Drop thresholds 3/5 → 2/4** so build identity
   arrives by floor 2-3 (Hades duo-boon style).

5. **Three relic pairs are strictly dominated** (same effect, different
   framing):
   - `iron_will` ≈ `lifestone` (both pure +1 HP common; iron_will's
     description LIES about first-hit DR)
   - `aegis_plate` (rare, +2 HP/-1 DR) **beats** `heart_of_stone`
     (legendary, +2 HP only) — tier inflation
   - `phoenix_feather` beats `second_wind` — both lethal-blow procs,
     phoenix fully heals while SW gives 1 HP

## Sim output highlights (2000 runs × greedy AI)

**Top 10 picks (the actual meta):**
```
iron_skin              common      37.9%
iron_fang              common      36.2%
arcane_pulse           common      29.1%
focused_eye            common      26.6%
stoneheart             common      25.7%
stalwart               rare        22.9%
aegis_plate            rare        22.4%
detonator              legendary   22.4%
twin_cast              legendary   21.8%
piercing_quarrel       rare        18.9%
```

The greedy AI converges on **common+rare anchors + a few legendary
multipliers**. Mythic tier is sparsely picked (eye_of_ether 17%, the rest
≤15%) because they show up late and the build is mostly locked in.

**Bottom quintile (likely needs retune):**
```
iron_grip              common       0.1%
sturdy_step            common       0.2%   [DEAD-mod]
dodge_master           rare         1.1%   [DEAD-mod]
arcane_quiver          rare         2.2%
executioner            legendary    2.1%
long_reach             rare         3.9%
heart_of_stone         legendary    4.0%
phantom_step           mythic       4.0%   [DEAD-mod]
second_wind            legendary    4.2%
phoenix_feather        legendary    5.4%
```

## Recommended iter-96 plan (the "relic retune" pass)

### Phase A — Fix the dead (Δ1 day)

Repurpose each dead-modifier relic so its declared effects actually fire:

| relic            | current (dead) mod                                       | proposed (live) mod                                    |
|------------------|-----------------------------------------------------------|----------------------------------------------------------|
| `sturdy_step`    | `dodge_iframes_bonus_f: 0.15`                            | `damage_taken_reduction: 1` (mini-stalwart)             |
| `dodge_master`   | `dodge_cooldown_mul: -0.3`                               | rename → `dash_master`, `dash_strike_cooldown_mul: -0.3` (new modifier key, read in `hero.gd:2207`) |
| `phantom_step`   | `move_speed_mul: 0.5, dodge_*: dead`                     | `move_speed_mul: 0.5, dash_strike_cooldown_mul: -0.4, dash_strike_post_iframes_bonus_f: 0.15` (two new keys) |
| `gale_step`      | `move_speed_mul: 0.2, dodge_iframes_bonus_f: 0.1`        | `move_speed_mul: 0.25, dash_strike_post_iframes_bonus_f: 0.05` |
| `tempest_cloak`  | `move_speed_mul: 0.1, dodge_iframes_bonus_f: 0.05, projectile_speed_mul: 0.1` | `move_speed_mul: 0.15, projectile_speed_mul: 0.15` (drop the dead key, bump the live ones) |
| SHADOW resonance | `dodge_iframes_bonus_f: 0.08`                            | `crit_chance_f: 0.05, move_speed_mul: 0.05`             |

### Phase B — Retune the weak (Δ0.5 day)

| relic            | issue                                                   | fix                                                                          |
|------------------|----------------------------------------------------------|------------------------------------------------------------------------------|
| `iron_grip`      | 0.1% pick rate; knockback-only                          | Add `damage_taken_reduction: 1` (knockback as defensive utility)             |
| `iron_will`      | description lies about first-hit DR                     | Code the first-hit DR handler in `hero.gd._handle_first_hit_each_room()`, OR strip the description                  |
| `lifestone`      | pure +1 HP, identical to working iron_will              | Add small regen: +1 HP every 8 kills                                         |
| `keen_focus`     | crit-chance solo is weak at common                      | Add `crit_damage_bonus_f: 0.10`                                              |
| `arcane_quiver`  | speed-only, no damage                                   | Add `blast_damage_bonus: 1` OR `pierce_count: 1`                             |
| `long_reach`     | reach-only, no damage axis                              | Add `sword_damage_bonus: 1` (commits to melee builds)                        |
| `executioner`    | strong but invisible to player                          | Add visible HUD pip when below 25% HP threshold                              |
| `heart_of_stone` | strictly worse than aegis_plate (rare beats legendary)  | Bump to `max_hp_bonus: 3, damage_taken_reduction: 1`                         |
| `second_wind`    | strictly worse than phoenix_feather                     | Differentiate: revive once at FULL HP but only after floor 2 cleared; phoenix becomes "revive at lethal blow, cap 1 per floor" |

### Phase C — Theme rebalance (Δ0.5 day)

1. **Lower thresholds 3/5 → 2/4** so resonance fires by mid-floor 1 and
   ascendance by floor 2-3. Players hit identity moments faster.

2. **Add 2-3 VOW relics** to bring the pool from 5 → 7-8. VOW currently
   has the smallest pool and rarely hits ascendance. Candidates:
   - Common: `bulwark` (`damage_taken_reduction: 1`)
   - Rare: `unyielding` (when SHIELD catches a hit, gain `max_hp_bonus: 1` for the room)
   - Legendary: `oath_of_blood` (every hit you SHIELD-catch heals 1 HP)

3. **SHADOW resonance fix** (covered in Phase A) + add 1-2 SHADOW
   relics. Currently only 6, all post-iter-95 reanchored. Add:
   - Common: `umbral_thread` (`crit_chance_f: 0.10`)
   - Rare: `night_step` (`move_speed_mul: 0.2, crit_chance_f: 0.10`)

### Phase D — UX upgrades (deferred to iter-97 if scope tight, Δ1 day)

1. **Visible proc counters** for `iron_fang`, `arcane_pulse`,
   `chain_lightning`, `soul_burst`, `bloodstone`, `combustion_core`,
   `arcane_resonance`. JS reference has `counterPips.js` that renders
   themed pip rows under the hero. Port that to Godot HUD.

2. **Telegraphed fusions on pedestal hover.** When hovering a relic,
   show "Pairs with X → Z" preview. Converts "boring pickup" into
   "foundation pick I should grab for later." This is the StS approach.

3. **Hidden Quality field** (1-5) per relic, biases pool weights so
   floor-1 commons avoid Q1 trash and floor-4 mythics start at Q5+.
   Isaac Repentance pattern.

## What this means for fusions

The user originally asked about fusions next. Recommendation: **do iter-96
(Phase A+B+C, ~2 days) FIRST**, then fusions. Rationale:

1. Fusions multiply the existing relic pool. If the pool has 8 dead/weak
   relics, fusions inherit that weakness — most fusion pairs will involve
   a junk component.

2. Phase A+B converts 8 dead relics into 8 useful relics. That's 17% more
   pool quality. Fusions land on a healthier base.

3. Phase C drops theme thresholds — fusions can build naturally on theme
   identity (e.g. `tesla_storm` = STORM-only fusion).

The recommended sequence:
1. **iter-96**: Phase A (dead → live), Phase B (weak → solid), Phase C
   (theme rebalance). Each phase ~0.5-1 day. Total ~2 days.
2. **iter-97**: Phase D UX + introduce fusion system on the healthier pool.
