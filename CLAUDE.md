# Ethera (folder: `slime-depths/`)

Top-down action roguelite. Vanilla JS / canvas / HTML5. In-game title "ETHERA",
tagline "beneath the ruin". Single hero class (Knight). Four floors with
branching DAG maps. ~40 relics + fusions, memories, ascension tiers, hamlet
NPCs, daily challenges.

## ⚠️ START-OF-SESSION CHECK (do this before ANY edits)

New agents default to branching off `main`. Before you make changes:

```bash
git fetch origin
git log --oneline -5 main             # review recent commits
git branch --show-current             # which branch am I on?
gh pr list --state open               # any open PRs to stack on?
```

If there's an open PR with a branch ahead of `main`, your work probably
belongs on top of that branch. Prior incident (2026-04-23): an agent built
a whole sprint on top of `main` while PR #3 with 28 commits sat unmerged —
the sprint was useful but landed on stale state (8 HP hero, old relic
pool, no Ember Tyrant / Hermit / Oracle content) and had to be redone.

**Rule**: if in doubt, switch to the most-recent-open-PR's branch OR ask.

## Session summary (most recent, 2026-04-24 overnight — strategy + relics pass)

Branch `claude/musing-snyder-c13579`, 8 commits ahead of main. Two spec
agents surveyed the strategy axis (boss phases, DAG branching, room
pacing) and the relics axis (VS/BoI comparison, counter visibility,
synergies). Plans landed, then the overnight session started shipping:

- **Pickup banner wrap** (`f50cad4`): long relic descs like Hourglass of
  Respite used to overflow the 480px frame into the HUD. `drawPickupFlash`
  now pre-measures flavor + desc with the existing `wrapPedestalText`
  helper and grows `boxH` to fit. Added `__testPickup` / `__testPickupFlash`
  dev hooks (tree-shaken from production).

- **Visible proc counters + pedestal teasers** (`e9be6fa`):
  new `counterPips.js` renders themed pip rows under the hero for
  chain_lightning / pyromancer / soul_burst — fills with each hit/kill,
  flashes on trigger. New `pedestalTeaser.js` draws looping ghost effects
  on hovered pedestals (stormcaller bolt, chain arcs, hymn aura, etc.) so
  the player sees WHAT the relic does before committing.

- **Set-bonus themes** (`d9cb000` + `3fbbc59`): new `themes.js` tags all
  46 in-play relics into STORM / FLAME / BLOOD / VOW / SHADOW. Own 3 of
  a theme → RESONANCE (tier-1 stat); own 5 → ASCENDANCE (tier-2 stat +
  mechanical flavor + visible aura under hero). Tier-2 flavors:
  - STORM: dodge releases a 56px shock pulse
  - FLAME: 50px heat aura ticks 1 dmg/s (stacks with hymn)
  - BLOOD: on room clear, regen 25% of missing HP + spark burst
  - VOW: first damage each room absorbed entirely (like second_wind for hits)
  - SHADOW: 0.8s post-dodge flanking window, every hit forced-crit
  HUD chip strip above the fusions row; hover tooltip explains tier + path.

- **Elite affix hover** (`6dc78c5`): hovering the mouse over an elite
  shows a card with the affix NAME + a one-line description
  (Frost/Ember/Venom/Warded). Shifts encounter prep from "die and learn
  the badge" to "read the threat." `drawEliteAffixTooltips` in
  enemies.js, called after drawPickupFlash in main.js render.

- **Tier-scaled altar HP cost** (`68bab87`): altar HP cost now matches
  offered tier (common=2, rare=4, legendary=7, mythic=9; curse: Starving
  doubles). Legendary+ altars get a pulsing red halo + larger label so
  the player FEELS the trade before walking on. Existing "won't suicide"
  guard handles the new costs correctly.

- **Asymmetric DAG — first pass** (`96c39e4`): every non-start node now
  carries `path: 'safe' | 'standard' | 'perilous'` (via `pathForKind`
  helper). Floor-2+ layer-1 becomes `[combat, elite]` (was `[combat,
  combat]` — two identical choices). Elite rooms' pedestal offers
  use `rollRelicOffer`'s new `opts.minTier = 'rare'` so perilous paths
  actually pay. Map renders "RISK · RARE+" / "REST" sub-labels on
  perilous / safe nodes so forks read strategic not aesthetic.

- **iron_resolve retune** (`f1fcfe0`): first stat-stick retune. Base
  -25% dmg → -20% + conditional PARRY (stand still ≥0.3s AND face the
  attacker → -85% dmg + stagger attacker 0.45s + spark/flash/SFX).
  Pattern ready to reuse on keen_edge, warlord, etc.

### Known shape of the branch when pushing forward

- `src/counterPips.js`, `src/pedestalTeaser.js`, `src/themes.js` are the
  new modules. All gated behind existing imports — zero breakage to
  existing run flow.
- `hero.activeThemes` map is the canonical tier state. Any code that
  needs a theme check reads it as `(hero.activeThemes?.storm || 0) >= 2`
  etc. Bonus fields (`hero.themeAtkSpdBonus`, etc.) are read in existing
  combat paths — zero duplication, zero stacking bugs.
- Elite rooms are still the same makeCombatRoom output (just with
  `eliteRoom: true` flag); asymmetric DAG is currently cosmetic path
  + reward-bias only. Deeper asymmetry (per-path spawn pools, extra
  rooms on perilous, safe-path common-only caps) is teed up for a
  follow-up session.
- Dev hooks that exist: `__testPickup(id)`, `__testPickupFlash(id, tier)`
  for banner layout testing. All gated on `import.meta.env.DEV`.

### Verification status

Lint + typecheck + build all green. Visual verification done for
themes HUD + ascendance aura via DOM-overlay capture trick. Full
end-to-end playthrough NOT yet done (preview tab was backgrounded for
part of the session, throttling rAF). Playtest before landing to main.

---

## Earlier session summary (2026-04-24 evening)

Boss-intro darkness bug — finally resolved. Root-cause diagnosis:
prior fixes all tried to salvage a multi-layer composite (pixel-art
portrait on transparent PNG + zone-backdrop + veil + post-FX). Each
layer was a fresh surface for GPU color management / HDR tone-mapping
to dim. Portraits themselves were 20–40% mean luminance with magenta-
flagged transparent corners that bilinear-scaled into dark halos.

Fix (commit `c08c0f1`): 6 dedicated full-frame boss-intro scenes
(Nano Banana, 1376×768, in `slime-depths/assets/backdrops/boss_intro_
*.jpg`) with the boss embedded in their thematic environment and the
lower third pre-shadowed for typography. Intro renders the scene
full-bleed + a lower-third darken gradient + gold/cream typography.
No compositing left to sabotage. Intro code ~40% shorter.

Playtest confirmed on the user's display (the one that crushed the old
composite to black): the new scenes render at correct brightness with
clean typography.

---

PR #3 merged + 11 follow-up commits shipped directly to main. Previous
HEAD was `c9ec21a`. Major changes since PR #3:

- **Sprint 1 content**: mythic 4th rarity tier (Eye of Ether, Cataclysm at
  6% per pick on floor 4), floor-clear gold cascade, projectile impact
  VFX, 10 silent achievements, memory unlock progress bars, fusion-chip
  on pedestals, boss-biased loot drops with thematic pools per boss,
  mini-boss elevated rewards, Mirror Shard recursion guard, THE STAR +
  THE MAGICIAN tarot effect wiring.
- **Unified cinematic freeze**: floor card / boss intro / phase intro
  now all run through one early-return block in `tick()` with wall-
  clock clamps that prevent stuck overlays (previously pause-mid-intro
  could freeze the letterbox on screen forever). Hero motion and
  combat fully frozen during any intro.
- **Boss intro darkness architectural rework** (378d449): post-FX
  pipeline (bloom + biome grade + chromatic aberration + washes +
  darkness + vignette) wholesale-skipped during intros. `ctx.shadowBlur`
  removed from portrait drawImage (replaced with pre-rendered radial
  glow) and from name text (replaced with double-stroke outline).
  Root-cause fix for "portrait crushed to black" playtest bug.
- **Responsive UI**: menu scales via CSS transform on viewports
  ≤900/600/450px. Rotate-to-landscape prompt for phone portrait.
  HUD controls bar removed (tips.js contextual system covers it).
- **Icon-loader bugfix** (c9ec21a): `relic_hourglass.png` and
  `relic_lantern.png` were orphaned on disk but missing from
  loader.js — fixed, Hourglass of Respite now renders its icon.

Unresolved / needs playtest on non-dev machines:

- ~~Boss intro darkness~~ — RESOLVED by commit `c08c0f1` via dedicated
  full-frame boss-intro scenes. See session summary above.
- Preview MCP tool spawns (slime-depths-pr3, slime-depths-main-verify,
  plus any MCP-managed preview instance) have been unstable — hung
  python processes on ports 5174–5177 and intermittent
  "Unable to connect" errors. Workaround that reliably works:
  `python slime-depths/serve.py <port>` via plain Bash
  `run_in_background` on a fresh port (5176/5177/etc.). The
  `.claude/launch.json` has an extra `slime-depths-5176` config for
  that use case.

## Debug hooks (available at runtime from devtools console)

- `window.__startRun()` — skip the menu, drop straight into a run
- `window.__dbg()` — dump hero/enemies/camera/room/transition state
- `window.__forceGoto(idx)` — teleport to floor[idx] via synchronous
  transition. Does NOT go through the graph → loadRoom path.
- `window.__testBossIntro(type, durationSec)` — set bossIntroTime +
  bossIntroBoss directly. Synthetic — doesn't spawn the enemy.
- `window.__jumpToBoss()` — real boss-room entry via graph + loadRoom.
  Triggers the actual `data.kind === 'boss'` branch (portrait + FX +
  enemies spawn). Use this to verify the boss cinematic in-context.
- `window.__clearIntros()` — zeros all active intro timers
  (`bossIntroTime`, `floorCardTime`, `phaseIntroTime`) so
  `__testBossIntro` / `__jumpToBoss` render cleanly without the
  floor card overlaying. `__dbg()` now includes those timer values.

## Where the code lives

- `slime-depths/` — the active game. All gameplay edits go here.
- `ethera/` — the paused 44K-LoC isometric ARPG. Reference-only; don't edit
  unless explicitly asked. The pivot to `slime-depths/` happened 2026-04-20.

## Dev server

**Preferred (Vite):**

```bash
cd slime-depths && npm install        # first time only
cd slime-depths && npm run dev        # port 5173, HMR enabled
```

Vite walks the import graph from `src/main.js` (referenced by `index.html`)
and serves modules with on-the-fly transforms. Assets in `public/assets/`
are served verbatim at `/assets/...` — the same URLs the loader uses in
production.

**Production build:**

```bash
cd slime-depths && npm run build      # emits dist/ (single bundled JS + copied public/)
```

**Fallback (legacy Python server):**

```bash
python slime-depths/serve.py 5173     # ThreadingHTTPServer with WinError catch
```

`serve.py` is kept around as a dependency-free fallback — it also still
serves the dev tree. It does NOT serve the production `dist/` correctly
because the built `index.html` references bundled JS. Use `npm run preview`
(Vite's production preview server) if you need to smoke-test the build.
Do NOT run plain `python -m http.server`; it lacks the no-cache headers.

## Quality scripts (slime-depths/)

```bash
npm run lint            # ESLint — 0 errors required, warnings allowed
npm run lint:fix        # auto-fix what can be fixed safely
npm run format          # Prettier — writes to files (opt-in globs only)
npm run format:check    # Prettier — read-only; CI uses this
npm run typecheck       # tsc --noEmit; checkJs is OFF so .js files don't typecheck
```

Configs:
- `eslint.config.js` — flat config. Permissive (warnings not errors on
  style issues, no-undef IS enforced — that's how the `clearFusions`
  import bug got caught during initial rollout).
- `.prettierrc.json` — 100-col, single-quote, 2-space, trailing-comma es5.
  `src/` is in `.prettierignore` to avoid a mass-reformat that would
  trash git blame. When you touch a file, format it; retire from the
  ignore list as you go.
- `tsconfig.json` — `allowJs: true` + `checkJs: false`. Gradual migration
  posture: existing .js compiles without typecheck nagging; new .ts
  files get strict mode from day 1.

CI at `.github/workflows/ci.yml` runs lint + format:check + typecheck +
build on every PR, plus `npm ci` on `electron/` to catch dependency drift.

## TypeScript migration status

Three files are `.ts` and strict-typed (settings, stats, records).
Everything else is `.js` compiled under `allowJs + checkJs: false` so JS
code still works unchanged. The migration is gradual on purpose — one
file at a time, small + stable ones first.

When converting a file:
1. Write `src/<name>.ts` with types (use the settings/stats/records files
   as templates — interface for shape, return-type annotations, type-only
   imports where useful)
2. `git rm src/<name>.js`
3. Update every consumer: change `from './<name>.js'` to `from './<name>'`
   (extensionless — Vite + tsconfig bundler resolution handles both dev
   server and Rollup build)
4. `npm run lint && npm run typecheck && npm run build` — all green
5. Smoke-test in browser (the game should load identically)

Next candidates (all small + stable): `meta.js`, `music.js`, `storage.js`,
`daily.js`, `profile.js`. After those, start on consumers — converting
a consumer of an already-typed module is where the types start pulling
their weight (compile errors for typo'd field names, etc.).

## Electron (desktop/Steam target)

- `electron/main.js` — dev loads Vite at `http://localhost:5173`;
  production loads from the packaged `slime-depths/dist/` at
  `extraResources/game/index.html`.
- `electron/preload.js` exposes `window.ethera.*` — both the legacy
  slot-based save API and a newer `kvGet/kvSet/kvRemove/kvKeys/kvClear`
  IPC surface. **The KV surface is exposed but NOT YET called from
  game code.** A future session should wire `storage.js` to dispatch
  through it when `window.ethera` is present, so Steam packages write
  to `userData/saves/storage.json` (Steam-Cloud-friendly) instead of
  Chromium's sandboxed localStorage.
- Build: `cd electron && npm run build:win` (prebuild hook auto-runs
  `npm run build` in slime-depths/ first).

## Core files (in `slime-depths/src/`)

- `main.js` — entry, game loop, boss-clear flow, HUD rendering glue
  (~5950 lines; shrinking as concerns get extracted — see below)
- `debug.js` — `window.__startRun/__dbg/__jumpToBoss/etc.` (dev-only,
  tree-shaken from production builds via `import.meta.env.DEV`)
- `menuEmbers.js` — ambient gold ember particle system for menu / hamlet
- `floorCardRender.js` — the "FLOOR I — THE UNDERCROFT" intro card render
- `hero.js` — hero state + abilities (dodge, dash-strike, weapons)
- `relics.js` — relic registry, tier weights per floor, rollRelicOffer
- `pedestals.js` — pickup points, tier-scaled visuals, pickup flash banner
- `hud.js` — hearts, ability pips, relic strip, boss HP bar, ascension chip
- `achievements.js` — milestone registry, popup queue, `unlockAch`
- `projectiles.js` — enemy projectiles (arrows, wizard orbs), impact VFX
- `fx.js` — damage numbers, slash VFX, hit-stop, relic icon composer
- `particles.js` — pooled hit-sparks, death-bursts, dust, sparkles
- `floor.js` / `floorGraph.js` — floor generation + branching DAG map
- `hamlet.js` — hub area, 8 NPCs (wanderer, oracle, gravekeeper, smith, etc.)
- `memories.js` — 14 memories (run-start constraint+gift systems)
- `ascension.js` — 10 ascension tiers (I–X modifiers)
- `fusions.js` — 17 relic fusions (e.g. `blood_moon = bloodstone + reaver`)

## Rarity tiers

common → rare → legendary → **mythic**. Mythic rolls only on floor 4 at ~6%
per pick. Currently promoted: Eye of Ether, Cataclysm. Mythic pickup: 5.5s
banner, full-screen halo wash, layered bell + sub-bass sting.

## Boss loot pools (added Sprint 1)

Each boss drops a single guaranteed pedestal from a themed pool on clear:

- **Grudnok** (orc, floor 1) — brawler kit: heavy_blow, serrated_edge,
  warlord, ironhide, executioner
- **Iron Revenant** (bone_captain, floor 2) — life-drain: bloodstone,
  reaver, bloodrite, phoenix_tear, vampiric_aura
- **Broodmother** (floor 3) — bursts: explosive_kill, soul_burst,
  chain_lightning, pyromancer, thunder_step
- **Ember Tyrant** (floor 4) — endgame legendaries: avatar_of_flame,
  phoenix_cloak, wanderers_cloak, ethereal_binding, aegis_pulse. 20%
  chance to roll from mythic pool (cataclysm / eye_of_ether) instead.

## Commit style

Imperative subject prefixed by type (`feat:`, `fix:`, `content:`, `feedback:`,
`balance:`, `chore:`, `release:`). Body explains **why**, not **what**.
Include `Co-Authored-By` line for Claude Code commits.

## Things NOT to do

- Don't run `python -m http.server` on slime-depths — use `npm run dev` (or `serve.py` fallback)
- Don't delete other worktrees under `.claude/worktrees/`
- Don't force-push to `main` — and NEVER to an open PR branch without asking
- Don't add features to `ethera/` (the paused ARPG) unless explicitly asked
- Don't introduce cache-bust `?v=...` suffixes on module imports — the no-cache
  dev server handles it
