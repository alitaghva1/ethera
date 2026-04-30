# Dungeon Rebuild Plan — Enemies, Rooms, Boss Arenas

Goal: bring the dungeon visuals + room design up to the same quality bar as the new mage hero. After this lands, **everything in combat looks like it belongs to the same game.**

---

## Why this session matters

The mage migration to PixelLab worked — hero now reads as proper pixel-art game art. The dungeon side hasn't caught up. **The audit (saved in this session's history) found:**

- Hero visible body: 74 px (now shrunk to ~56 after `f3e1fe3`)
- All four FLOOR BOSSES: 22-36 px visible — **smaller than the hero**
- Minions: 9-25 px — hero is 3-8× their height
- Root cause: hero fills 93% of its 128-cell, Tiny-RPG enemies fill 11-23% of their 100-cell. Two systems were never rebalanced.

Nothing in combat will feel right until this is fixed. Hamlet redesign matters less if the dungeon experience is broken.

---

## Three priorities — do them in this order

### Priority 1 — Boss visual presence (fast win, ~30 min)

Bosses are *the* fight that should feel imposing. Right now they're smaller than the hero. The audit gave concrete numbers; just apply them.

**File**: `slime-depths/src/enemies.js`

**Changes** (find each enemy's `drawSize` field):

| Enemy (in-game name) | type id | Current drawSize | Target drawSize |
|---|---|---|---|
| Iron Revenant (floor 2 boss) | `bone_captain` | 108 | **180** |
| Broodmother (floor 3 boss) | `broodmother` | 134 | **220** |
| Ember Tyrant (floor 4 boss) | `ember_tyrant` | 118 | **220** |
| Hermit (mini-boss) | `hermit` | 118 | **180** |

Note: Grudnok (floor 1 boss / `orc` type) draws from the orc minion sheet at 100. Either bump that to ~160 (which makes the orc minions huge too — bad) or give Grudnok its own sheet. **Recommendation**: leave Grudnok minion-sized for now; it's the floor-1 tutorial boss and doesn't need to be massive. Future asset pass will give it its own sheet.

After change, run the game, jump into each boss room (`window.__jumpToBoss()` in console), screenshot, judge by eye. If a value looks wrong, halve the bump.

### Priority 2 — Audit the dungeon rooms themselves (medium effort)

Combat rooms today: ~6 layouts (combat / elite / reward / altar / challenge / boss). Room walls + floor are tiled from `room.js` using a single biome palette per floor. Look at this honestly:

**Things that probably look weak**:
- Floor tile uses the same procedural pattern across all rooms in a floor
- Wall pixel-art is 1-tile-tall, repeats horizontally — feels grid-y
- No environmental variety inside a single floor
- Boss arenas use the same wall/floor as combat rooms (they should feel different)
- No "interesting room" types — every combat room is a 20×14 rectangle with maybe pillars and pits

**To diagnose** (do this first in the session):
1. Run the game, complete one full floor
2. Screenshot 3-4 rooms (combat, elite, reward, boss)
3. Compare against the mage. What feels janky?

**Likely fixes** (in priority order):
- Generate per-floor wall + floor tilesets via PixelLab (one Wang set per floor's biome)
- Swap out the procedural floor patterns for the new tiles
- Generate distinct boss-arena floor tilesets (specific to each boss's theme — iron/ember/blood/etc.)

### Priority 3 — Migrate enemies to PixelLab (long, 5-10 sessions)

Same workflow as the mage: each enemy gets a 128-cell PixelLab character with idle/attack/death animations. Drop into `imports/enemies/<name>/`, run a per-enemy importer.

**Don't do this all in one session.** Pick the 2-3 most-visible enemies first:
- **Slime** (floor 1, the tutorial enemy — every player sees it)
- **Skeleton** (floor 1-2, common)
- **Wizard** (multi-floor, projectile enemy — needs to read clearly)

Generate them in PixelLab Characters tab using the **same prompt structure as the mage**:
```
top-down chibi <enemy>, <visual details>, hostile stance, dark fantasy
roguelite pixel art, muted fantasy palette
```

Specific prompts:

#### Slime
```
top-down chibi slime monster, translucent green gel body, glowing eyes,
small pseudopods, low-to-ground stance, dark fantasy roguelite pixel
art, muted fantasy palette with toxic green accents
```
Animations needed: idle (4-6 frames), hop/move (6 frames), attack-lunge (4 frames), death (4 frames). Skip walk preset, use Custom V3 with action `"hopping forward"`.

#### Skeleton
```
top-down chibi skeleton warrior, bone-white body, tattered grey cloth
wraps, rusty short sword in right hand, hollow eye sockets, hostile
ready stance, dark fantasy roguelite pixel art, muted fantasy palette
```
Animations: idle, walk (Running preset), attack (Custom V3 "sword swing forward"), hurt (Reactions), death (Custom V3 "skeleton crumbling to bones").

#### Wizard (enemy, not the player mage — different design!)
```
top-down chibi enemy wizard, dark purple robe with red trim, hooded
face with red glowing eyes, dark wooden staff with red crystal,
hostile casting stance, dark fantasy roguelite pixel art, muted
fantasy palette with sinister red accents
```
Different palette (red vs. our mage's blue) so the player reads "this is a hostile caster" instantly. Animations: idle, walk, cast attack (Custom V3 "casting dark magic forward"), hurt, death.

Drop each export folder into `slime-depths/scripts/pixellab/imports/enemies/<name>/`. Use the existing `import-character.js` script (already class-agnostic — `--char slime --class slime` etc.) to convert exports into game-ready sheets at `public/assets/enemies/<name>_<state>.png`.

After import, update `enemies.js` to use the new sheet paths + the new SPR=128 scale (matching the hero), drop the per-enemy `drawSize` Tiny-RPG-compensation values to ~96 (since enemies will fill most of the cell now).

---

## What I (Claude) will do once you start the session

1. Read the current state — verify last commit (`f3e1fe3`) is the latest.
2. Apply Priority 1 (boss drawSize bumps) — 5 minutes, instantly visible improvement.
3. Help you diagnose Priority 2 — screenshot rooms, list specific issues.
4. If you generate new enemy assets in PixelLab, integrate them via the existing pipeline.

## Commands you'll find useful

In the dev console (F12 → Console tab):

```js
window.__startRun()           // skip menu, drop into a fresh run
window.__forceGoto(idx)       // teleport to floor[idx] — use to skip combat
window.__jumpToBoss()         // enter boss room of current floor
window.__dbg()                // dump hero + room + camera state
window.__clearIntros()        // skip stuck intro overlays
```

## What's NOT in scope this session

- Hamlet rebuild — that's the OTHER session, see `HAMLET_PLAN.md`
- New relic / fusion content
- New floor / boss content (e.g. Floor 5)
- Music / SFX
- UI redesign

Stay focused on **dungeon visual + room quality**. Everything else is a different conversation.

---

## Asset budget for the session

You have 5000 PixelLab generations / month at Tier 2. Per the audit, a full enemy character (5 animations × 8 directions, generated through the UI) burns ~40-60 generations. So:
- 3 enemy characters fully animated = ~150 generations
- 4 boss-arena Wang tilesets = ~10 generations
- Comfortably fits in your monthly allowance. No USD cost.

---

## Known unknowns

- Whether enemy authoring works at the exact same chibi proportions as the mage (boss enemies might benefit from being LARGER — taller hood, longer torso)
- Whether per-floor wall tilesets are achievable in PixelLab Maps editor at the right resolution (we'll find out)
- Whether the existing `enemies.js` AI (movement / attack / projectile patterns) needs adjustment for new sprites — probably no, since AI uses positions not pixels
