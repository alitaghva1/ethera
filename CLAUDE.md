# Ethera (folder: `slime-depths/`)

Top-down action roguelite. Vanilla JS / canvas / HTML5. In-game title "ETHERA",
tagline "beneath the ruin". Single hero class (Knight). Four floors with
branching DAG maps. ~40 relics + fusions, memories, ascension tiers, hamlet
NPCs, daily challenges.

## ⚠️ START-OF-SESSION CHECK (do this before ANY edits)

New agents default to branching off `main`, but `main` is often **behind the
active working branch**. Before you make changes:

```bash
git fetch origin
git branch --show-current             # which branch am I on?
git log --oneline main..HEAD          # is this branch ahead of main?
gh pr list --state open               # what PRs are unmerged?
```

If there is an open PR with a branch ahead of `main`, **your work almost
certainly belongs on top of that branch, not on `main`**. Prior incident
(2026-04-23): an agent built a whole sprint on top of `main` while PR #3 with
28 commits sat unmerged — the sprint was useful but landed on stale state
(8 HP hero, old relic pool, no Ember Tyrant / Hermit / Oracle content) and
had to be redone on top of the PR #3 branch.

**Rule**: if in doubt, switch to the most-recent-open-PR's branch OR ask.

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

## Rarity tiers (as of Sprint 1 / 2026-04-23)

common → rare → legendary → **mythic** (new). Mythic rolls only on floor 4 at
~6% per pick. Currently promoted: Eye of Ether, Cataclysm. Mythic pickup gets
a 5.5s banner, full-screen halo wash, layered bell + sub-bass sting.

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
