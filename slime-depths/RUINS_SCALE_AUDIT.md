# Zone 1 (Ancient Ruins) — Scale Audit

> "The map setup looks good, but it feels off between the size of enemies, the size of the character, the size of the world and the camera as well."

This doc measures every size that contributes to that feel, identifies what's actually wrong, and proposes a one-thing-at-a-time fix order. **No code changes yet** — review and pick which to do first.

---

## 1. Measurements (design pixels, before zoom)

### World

| Thing | Value |
|---|---|
| Design canvas | **1280 × 720** (`camera.viewW/H`) |
| Tile size | **48 px** (`TILE = 48` in `room.js`) |
| Ruins map | **40 × 24 tiles** = 1920 × 1152 px (1.5× viewport wide, 1.6× tall) |
| Source TMX tile | 32 px (bake scales 32 → 48 for runtime) |

### Camera

| Thing | Value | Notes |
|---|---|---|
| `_baselineZoom` | 1.0 (desktop) / 1.4 (mobile) | set once in `setBaselineZoom` |
| `camera.zoom` (live) | `_baselineZoom × (1 + pulseMod + breathe)` | overwritten every frame in `updateCamera` |
| `ruins.cameraZoom` (intended) | **0.75** | set in `zoneEncounters.js` |
| `ruins.cameraZoom` (actual) | **1.0** ⚠️ | **BUG** — `updateCamera` overwrites the zone zoom on the next tick |

**At zoom 1.0 the camera shows ~26.7 × 15 tiles.** At the intended 0.75 it would show ~35.5 × 20 tiles (most of the 40×24 map at once, with smaller sprites).

### Hero

| Thing | Value |
|---|---|
| `SPR` (sprite cell) | 128 |
| `HERO_DRAW` (on-screen size) | 60 |
| Body fraction in idle frame | **0.88** (measured: 112 / 128) |
| **Visible hero body height** | **53 px** = 60 × 0.88 |

### Ruins enemies (current waves)

| Enemy | cellSize | drawSize | bodyFrac | Visible H | × hero |
|---|---|---|---|---|---|
| orc_warrior (W1, W2) | 96 | **88** | 0.88 | **77 px** | **1.45×** |
| moose (W2, W3) | 128 | **110** | 0.85 | **94 px** | **1.77×** |
| orc_mage_enemy (W3) | 96 | **88** | 0.78 | **69 px** | **1.30×** |
| stone_golem (boss) | 128 | 105 | 0.92 × 1.45 boss | **140 px** | 2.64× ✓ ok for boss |

### Reference: existing Tiny RPG enemies (other zones, for calibration)

| Enemy | drawSize | bodyFrac | Visible H | × hero |
|---|---|---|---|---|
| orc (F2-F4) | 120 | ~0.55 | ~66 | 1.24× |
| skel (F1) | 80 | ~0.55 | ~44 | 0.83× |
| crypt_spider (F1) | 54 | ~0.45 | ~24 | 0.45× |
| wizard | 110 | ~0.50 | ~55 | 1.04× |

---

## 2. What's wrong

### Issue A: ERW enemies are systematically too big (the dominant cause of "feels off")

ERW pack source frames are **tightly cropped** — body fills the source canvas at ~0.85-0.92. Tiny RPG source frames have lots of breathing room — body fills ~0.5 of canvas. We set the same kind of `drawSize` numbers for both, so ERW enemies render **~1.6× larger than equivalent Tiny RPG enemies** at the same `drawSize`.

In Zone 1 right now: a regular ruins-orc grunt (1.45× hero) reads as MORE imposing than a wizard from another zone (1.04× hero). That's the size-mismatch the user is feeling.

**Fix**: lower `drawSize` on the four new ERW enemies so visible body lands around target bands:
- Trash mob (orc_warrior): visible 50-55 px → drawSize **62-65**
- Caster (orc_mage_enemy): visible 55-60 px → drawSize **70-75**
- Heavy (moose): visible 70-80 px → drawSize **85-95**
- Boss (stone_golem): visible 110-130 px → drawSize **80-90** (currently 105 → 140 visible)

### Issue B: per-zone `cameraZoom` is dead code

`zoneEncounters.js` sets `ruins.cameraZoom = 0.75` (and other zones at 0.65-0.85). On zone load, `main.js:8264` writes `camera.zoom = 0.75`. But `updateCamera` then overwrites it every frame with `_baselineZoom × (1 + pulse)`. **Net effect: zone zoom is ignored. Ruins plays at 1.0, not 0.75 as the comments claim.**

This is genuinely a bug. The fix is to either:
- **B1**: Apply zone zoom by calling `setBaselineZoom(zEnc.cameraZoom)` instead of writing to `camera.zoom`. Then `updateCamera`'s formula naturally folds the zone factor in.
- **B2**: Add a `_zoneZoom` factor to the `updateCamera` formula: `camera.zoom = _baselineZoom × _zoneZoom × (1 + pulse + breathe)`.

B2 is cleaner because it preserves the mobile baseline as a separate axis. Recommended.

**But before fixing**: decide whether ruins should actually be at 0.75 or 1.0. At 0.75 the visible map is much wider (35×20 tiles vs 26×15) but everything is 25% smaller — hero would shrink to 40 visible px which is on the edge of "postage-stamp small."

My read: **ruins should stay at 1.0 zoom** (current accidental behavior) once enemies are sized down. Drop the `cameraZoom: 0.75` field from ruins to make the data match reality. Other zones might want to keep their pulled-back zoom for their bigger maps (mountain 45×54, volcano 90×60 — those NEED a wider view).

### Issue C: hero visible body is small relative to canvas

Hero at 53 px on a 720 px canvas = 7.4% of canvas height. Industry-typical for top-down ARPGs is 8-12% (Hades hero is ~12%, Diablo isometric is ~10%, Vampire Survivors is ~6% — closest to ours).

Not necessarily wrong, but if Issue A is fixed AND ruins stays at 1.0 zoom, the hero will feel small. Consider:
- **C1**: Bump `HERO_DRAW` 60 → 70 (+17%) so visible hero is 62 px (~8.6% of canvas).
- Tiny tradeoff: hero hitbox `HERO_RADIUS` is 12 (foot-half-W). Visual change only — gameplay collision is unchanged.

This is a subjective call. I'd hold C until A and B land — A might already make the hero feel right.

### Issue D: world tiles are 48 px — relative to a 53 px hero, that's "hero is exactly 1 tile tall"

That's correct for a top-down RPG (you walk around obstacles your size). NOT a problem. Recording for completeness.

---

## 3. Proposed fix order (one thing at a time)

### Fix 1 — Resize the four new ERW enemies (HIGHEST PRIORITY)

This is the dominant cause of "feels off". Single-file change to `src/enemies.js`. No asset re-imports needed — just lower `drawSize` numbers.

Specific deltas:

| Enemy | Current drawSize | Proposed | New visible H | × hero |
|---|---|---|---|---|
| orc_warrior | 88 | **62** | 55 px | 1.04× |
| orc_mage_enemy | 88 | **72** | 56 px | 1.06× |
| moose | 110 | **88** | 75 px | 1.41× |
| stone_golem (boss) | 105 | **85** | 113 px | 2.13× |

Result: orc grunts become hero-peers (1.04× — same league), moose reads as a notably bigger heavy (1.41×), stone_golem stays clearly boss-sized (2.13×). All in line with Tiny RPG enemy sizing in other zones.

**Risk**: visible body too small relative to hitbox. The radius (collision) doesn't change with drawSize, only the sprite scales. Could land in a "hero hits visual where there's no body" state. We verify by playtest.

### Fix 2 — Drop the dead `cameraZoom: 0.75` from ruins (LOW priority, code-cleanup)

Currently misleading. Either:
- Just delete the field (ruins stays at the actual 1.0 zoom).
- Or wire B2 so it actually applies. Decide separately per-zone.

Recommend: drop the field for now, file the proper zone-zoom wiring as a follow-up. The behavior the user is currently seeing (1.0 zoom) is the one we'll keep for ruins.

### Fix 3 (optional) — Bump HERO_DRAW 60 → 70

Hold until after Fix 1. Reassess if hero still feels small post-resize.

---

## 4. What NOT to change

- TILE = 48: that's the canonical world unit. Changing it cascades through every collision/spawn calc.
- Bake source resolution: 32 → 48 scaling is the contract between TMX authoring and runtime.
- Hero hitbox (HERO_FEET_HALF_W=12, HERO_FEET_HALF_H=7): visible-only changes don't touch collision.
- Stone golem boss-mul (1.45×): boss-tier scaling is global and works for the other 4 bosses.

---

## 5. Recommendation

**Do Fix 1 first**. It's a 4-line change to `enemies.js`, no asset work. Playtest. If hero now feels right relative to enemies, we're done with the dominant issue. Only escalate to Fix 2/3 if the perception persists.

Awaiting your call on which to start with (and whether the proposed `drawSize` deltas in Fix 1 land where you want — happy to dial them up/down before applying).
