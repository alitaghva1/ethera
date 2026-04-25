# Two-Session Handoff Plan

State as of commit `f3e1fe3` (branch `claude/musing-snyder-c13579`, 15 commits ahead of `main`).

The work has reached a clean handoff point. Two future sessions are pre-planned, fully scoped, with drop folders + importers already wired up. Pick which one to start; they're independent.

---

## Where we are

**Hero**: replaced. The new mage is rendering in-game with 8-directional sprites, 5 animation states, all generated via the PixelLab UI Character Creator. Pipeline is fully reproducible via `scripts/pixellab/`. Hero size dropped from 80→60 to fix a major scale mismatch with enemies (sized audit confirmed hero was 2-3× taller than every boss).

**Hamlet**: still uses procedural shapes drawn in code. Looks "janky" — not real pixel art. Plan exists to rebuild the floor + buildings using PixelLab's Map Editor + Objects tab.

**Dungeon**: enemies still using old Tiny-RPG sprites (small in their cells, mismatched style). Bosses are 2-3× SMALLER than the new hero. Plan exists to migrate priority enemies + bump boss draw sizes.

**Pipeline tools**: PixelLab API integrated, `@pixellab-code/pixellab@1.0.2` installed, scripts under `scripts/pixellab/` (client.js, import-character.js, import-props.js, plus the now-defunct API generator that the user-driven UI workflow replaces).

---

## Session A — Hamlet Rebuild

**Read**: `slime-depths/scripts/pixellab/HAMLET_PLAN.md`

**Goal**: replace the procedural floor + procedural building shapes with PixelLab-authored pixel art.

**Decision tree at session start**:
1. User opens https://pixellab.ai/maps and tells Claude what the Map Editor lets them do
2. Based on what's available, pick:
   - **Path A** (Map Editor end-to-end → single backdrop PNG)
   - **Path B** (PixelLab Wang tilesets + Sprite Fusion authoring)
3. Then user generates assets, drops them in `scripts/pixellab/imports/`, Claude wires them in

**Drop folders ready**:
- `scripts/pixellab/imports/props/` (for individual building/prop PNGs)
- `scripts/pixellab/imports/hamlet-map/` (for tilemap exports)

**Tools ready**:
- `scripts/pixellab/import-props.js` (props importer, knows which prop maps to which game element)

**Estimated effort**: 1-3 hours of generation + iteration in PixelLab UI; ~30-60 min of Claude integration once assets land.

---

## Session B — Dungeon Rebuild

**Read**: `slime-depths/scripts/pixellab/DUNGEON_PLAN.md`

**Goal**: bring dungeon visuals up to the mage's quality bar. Three priorities:

1. **Boss drawSize bumps** (instant — 5 min code change, 4 boss values updated)
2. **Room visual audit** (medium — diagnose, then targeted tilemap work)
3. **Enemy migration to PixelLab** (long — same workflow as mage, do priority 3 enemies first: slime, skeleton, wizard)

**Drop folders to create**: `scripts/pixellab/imports/enemies/<name>/` (one per enemy character)

**Tools to reuse**:
- `scripts/pixellab/import-character.js` (already class-agnostic — `--char slime --class slime` works)

**Estimated effort**: Priority 1 = 30 min; Priority 2 = 2 hours; Priority 3 = 5-10 sessions over time.

---

## What's already committed and works

| Commit | What | Status |
|---|---|---|
| `075c5cf` | Knight 8-dir API pipeline (deprecated path) | Kept for code, sheets overwritten |
| `2d52cd7` | Hero spawn-in-wall fix | Live |
| `479e64b` | Mage UI-pipeline import | Live (knight slot) |
| `33c5d51` | Sprite bottom-align fix | Live |
| `fb94a7c` | Hamlet plan + props importer scaffold | Ready to run |
| `f3e1fe3` | Hero shrink 80→60 | Live |

**All commits are local on `claude/musing-snyder-c13579`.** Not pushed yet — that's an intentional "user pushes when ready" gate. To push:

```bash
git push origin claude/musing-snyder-c13579
gh pr create --title "PixelLab character pipeline + mage hero" --body "(generated)"
```

---

## Tooling setup that any future session needs to know

- **API key**: in `slime-depths/.env` as `PIXELLAB_API_KEY=...`. Gitignored.
- **SDK**: `@pixellab-code/pixellab@1.0.2`, plus `sharp` for PNG composition.
- **Imports gitignored**: `scripts/pixellab/imports/` is excluded — exports are large and regenerable.
- **Out artifacts gitignored**: `scripts/pixellab/out/` likewise.
- **Final assets committed**: `slime-depths/public/assets/characters/*.png` ARE committed.
- **Ground truth dimensions**: SPR=128, HERO_DRAW=60. Don't change these without a re-audit.
- **Direction order** (sheet rows): N, NE, E, SE, S, SW, W, NW (north-first clockwise). PixelLab UI uses south-first; the importer remaps.

---

## Recommended order

If you have to pick one to do first, **do Session B (Dungeon) first.** Reason: the boss-size fix in Priority 1 is a 5-minute change that fixes the most jarring sizing problem in the game. Once combat readability is OK, hamlet polish has more impact because the player isn't already frustrated.

If you have a clear hour and want to maximize visible improvement: **Session B Priority 1 only** (boss drawSize bumps), commit, ship.

If you have a clear afternoon for hamlet generation: **Session A** is the bigger creative payoff.

---

## What to tell the next-session Claude when you start

> "I'm starting <session A | B>. Read `<HAMLET_PLAN.md | DUNGEON_PLAN.md>` and tell me what you'd start with. Don't generate anything in PixelLab — wait for me to do that part. Last commit was `f3e1fe3` on branch `claude/musing-snyder-c13579`."
