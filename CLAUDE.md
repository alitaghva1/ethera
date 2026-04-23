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

## Session summary (most recent, 2026-04-23/24)

PR #3 merged + 11 follow-up commits shipped directly to main. Current HEAD
is `c9ec21a`. Major changes since PR #3:

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

- Boss intro darkness STILL REPORTED DARK by primary playtester after
  all fixes above. Cannot reproduce on dev preview (Chromium) — pixel
  samples show correct brown Grudnok tones. Likely environment-specific
  (GPU driver / display / cache). Diagnostic hook `__dumpIntroPixels()`
  was offered to user for telemetry; not yet run. If recurring,
  consider: re-encoding portrait PNGs with baked-in brightness, or
  adding an in-game "intro brightness" setting.
- Preview MCP tool spawns (slime-depths-pr3, slime-depths-main-verify)
  have been unstable in this session — hung python processes on ports
  5174/5175. Workaround: `python slime-depths/serve.py 5173` via
  plain Bash `run_in_background` works reliably.

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

## Where the code lives

- `slime-depths/` — the active game. All gameplay edits go here.
- `ethera/` — the paused 44K-LoC isometric ARPG. Reference-only; don't edit
  unless explicitly asked. The pivot to `slime-depths/` happened 2026-04-20.

## Dev server

```bash
python slime-depths/serve.py 5173
```

The `serve.py` is a no-cache `http.server` subclass — module edits reload
without cache-bust tags. Do NOT revert to plain `python -m http.server` or
the cache-bust sigils will creep back in.

## Core files (in `slime-depths/src/`)

- `main.js` — entry, game loop, boss-clear flow, HUD rendering glue
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

- Don't run `python -m http.server` on slime-depths — use `serve.py`
- Don't delete other worktrees under `.claude/worktrees/`
- Don't force-push to `main` — and NEVER to an open PR branch without asking
- Don't add features to `ethera/` (the paused ARPG) unless explicitly asked
- Don't introduce cache-bust `?v=...` suffixes on module imports — the no-cache
  dev server handles it
