# Ethera — Beta-Readiness Roadmap

Master synthesis after 5-agent parallel audit (2026-05-20). Authoritative
document for the beta push. Supersedes ad-hoc planning.

## Top-line finding

**Ethera is already past Slay the Spire's EA content bar** (75 cards × 2
chars, ~50 relics → ours: 59 relics + 4 actives + 4 spell mods + 21
enemies + 4 biomes + 6 status combos + branching DAG). The gap to beta
is **WRAPPER + POLISH**, not core content. Adding more enemies or relics
before shipping the wrapper would be wasted effort.

## Cross-audit gap matrix (5 agents)

### From CONTENT audit
1. Gold drops are cosmetic — no wallet, no shop. **No currency loop.**
2. 3 bosses all single-entity HP-phase. **No arena-mechanic or paired
   bosses.** No floor-4 boss (referenced but not authored).
3. 21 enemies = only 8 distinct AI patterns (reskin density).
   **Missing: flying, shield, charger.**
4. Hazards static-only. **No moving / destructible / timed hazards.**
5. Rooms architecturally identical (1280×768 rectangles).

### From ARCHITECTURE audit
1. **No save migration path** — `save_version: 5` written but never
   read on load. Beta-shipping blocker.
2. **No boss-phase or relic-stacking tests.** Synergy-critical math
   uncovered.
3. **Per-frame O(n²) group walks** — enemy.gd admits "bets n≤10" in
   comments. Phase-3 Tyrant exceeds.
4. **6062-line main.gd** + 3150-line hero.gd + 3030-line enemy.gd.
   Unmaintainable past beta.
5. **82/183 tests are parse-gate string greps**, not behavior tests.
6. **31 fix commits in last 200** with multiple direct revert patterns.
   Codebase still landing crash fixes regularly.
7. **Hamlet vestiges + dead `prototype/` + cruft files** at worktree
   root (`boss_snap.png`, `nul`).

### From PLAYER EXPERIENCE audit
1. **No persistent meta-progression** — every run wipes owned_relics.
2. **No achievement viewer** — 12 achievements unlock silently with
   no in-game way to view them.
3. **No cooldown indicators** for sword / blast / shield / dash. Only
   [R] active relic shows CD.
4. **No rebindable inputs / colorblind / shake slider / motion
   reduction.** Settings screen is single master-volume + read-only
   controls table.
5. **Elite-affix tooltips missing.** Web build has them; Godot port
   doesn't.
6. **Tutorial only covers 4/8 verbs** (move, attack, dash, pickup).
   No blast, shield, parry, active-relic teaching.
7. **No quit-confirm in pause menu.** One misclick on a 30-min run.

### From AUDIO/VISUAL audit
1. **All 25 SFX are procedural sine sweeps** in `audio.gd`. No
   recorded foley anywhere. Single biggest A/V blocker.
2. **5 of 6 music tracks unwired** (`vault.ogg`, `abyss.ogg`,
   `inferno.ogg`, `boss.ogg`, plus `ambient.ogg` partial). Sitting
   on disk doing nothing. **Quick win.**
3. **No authored prop art** — chest, door, pedestal, shrine, pillar,
   all hazards are `Polygon2D` / `ColorRect` debug primitives.
4. **One floor texture** for all 9 rooms (`procedural_dungeon.png`,
   currently disabled in favor of solid Polygon2D).
5. **2 relic icons missing**: `relic_pyromancer.png`,
   `relic_cataclysm.png` — referenced but not on disk.
6. Missing event SFX: room-clear, door-open, chest-open, shrine-pray,
   boss-clear, projectile-impact.

### From WEB RESEARCH audit
1. Hades EA = 4 weapons / 2 biomes / 1 boss. **We're past that.**
2. StS EA = 2 chars × 75 cards. **We're past that.**
3. Hub/meta-progression is #1 across all genre exemplars.
4. Tutorial = rigged first run, not separate mode.
5. Save = Resource-based dual file (settings + meta).
6. Accessibility kit = 2-day sprint (Rogue Prince of Persia ref).
7. Audio = Sonniss GDC bundle (royalty-free) + FMOD-for-Godot.
8. Run-recovery = "Resume run?" on crash relaunch.

## Beta milestone sequencing (revised after audits)

### M0 — Freeze & Stabilize (THIS sprint, ~3 days)
*Inserted after architecture audit found ongoing crash-fix churn.
No new features. Foundations only.*

- A. Wire the 5 unwired music tracks (A/V audit, quick win)
- B. Save migration foundation (`game_state.gd` migrate helper)
- C. Cooldown indicators on hero abilities (UX audit)
- D. Achievement viewer scene (UX audit — 12 unlocks invisible!)
- E. Quit-confirm modal in pause (UX audit)
- F. Dead code purge (`prototype/`, cruft files)
- G. Boss-phase + relic-stacking regression tests
- H. Replace 2 broken relic icons (A/V audit)

### M1 — Meta + Saves (~1 week)
- MetaSave + SettingsSave Resource pattern
- 5-node upgrade tree (Resilience / Quick Step / First Talisman /
  Tribute / Bound Vow)
- Ether Shard currency from kills + bosses + clears
- Crash-recovery snapshot + Resume Run? prompt
- Minimal `hub.tscn` between menu and run

### M2 — Accessibility + Settings (~1 week)
- Rebindable inputs with conflict detection
- Master / Music / SFX volume sliders (audio.gd already split-ready)
- Screen-shake intensity slider (default 50%)
- 3 colorblind filters (Deuter / Prota / Trita) + high contrast
- Text-scale slider (1.0 → 1.3)
- Motion-reduction toggle

### M3 — Audio Pass (~2-3 weeks, gated on Sonniss + composer)
- Pull current Sonniss GDC bundle
- Replace 25 procedural SFX with curated bundle picks
- Wire the 6 OGG tracks per-biome via `SCENE_TO_MUSIC`
- Add room-clear, door-traverse, chest-open, shrine-pray, boss-clear,
  projectile-impact SFX
- Optional: FMOD-for-Godot for vertical layering (combat intensity)

### M4 — Tutorial + Onboarding (~3 days)
- Extend `TutorialState` machine to teach BLAST, SHIELD, PARRY, [R]
- Scripted first run: rigged starter relic, dampened first elite
- One-shot tooltips for first encounter of each enemy archetype
- Elite-affix tooltip (port from web build)
- Status-combo codex page

### M5 — Steam Page + Marketing (parallel-track, ~1 week)
- Gameplay trailer (10-90s)
- Steam EA store page with "what's in / what's not in" bucket
- Press kit (screenshots, GIFs, copy)
- Free playtest branch via Steamworks
- 30-tester pre-EA telemetry

### M6+ — Content Polish (post-beta or staggered into beta)
- Floor 4 biome (frost / void) — fills the unhomed
  frost_pulse / venom-affix content
- 2 new boss patterns (arena-mechanic, paired)
- 3 new enemy archetypes (flying, shield, charger)
- Fusion system port from JS prototype
- Prop art pass (chest / door / pedestal / shrine / pillar / hazards)

## Stage gate criteria

- Each milestone gets its own `BETA_M<n>_*.md` design doc before code
- Each milestone ships with regression tests
- After each milestone: full audit-test run (all `tests/test_*.gd`)
- After M2: external playtester onboarding
- Beta launch trigger: M0-M4 shipped + playtester feedback incorporated

## Open questions (to surface to user)

1. **Audio budget**: Are we OK paying a composer for 5-7 tracks +
   stingers? Sonniss SFX bundle is free.
2. **Art budget**: Do we authorize 6-8 prop sprite commissions for M6,
   or accept the polygon look as a stylistic choice?
3. **Steam timeline**: When does the user want EA to actually launch?
   Drives M5 urgency.
4. **Playtest channel**: Steamworks free playtest, or itch.io build
   distribution?
