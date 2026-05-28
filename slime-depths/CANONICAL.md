# Canonical Game World — Slime Depths

This document is the source of truth for "what direction is this project going."
Future agents should read this BEFORE making architectural decisions. Conflicts
between code and this document should be resolved by aligning code with this
document, not the other way around — unless this document is explicitly updated
first.

Last updated: 2026-05-08 (Phases 1-6 of unification cleanup landed; verification pass closed 5 issues).

## The canonical game

**Five hand-drawn zones** played as **arena-style wave defense** with **XP-driven
level-ups** and **boss-kill chests** as the reward loop. Hamlet remains the
run-start hub. Single hero (mage). 30-40 minute runs.

```
hamlet → ruins → cemetery → crypt → mountain → volcano → win/death → hamlet
```

Each zone is one Tiled-authored map. Player drops in, 3 waves auto-spawn,
boss arrives at the map's signature location, kill = portal to next zone.
Kills drop XP gems → level-up modal → pick-1-of-3 perks. Boss death drops
a relic chest (Phase 3 work).

## Canonical systems (source of truth)

| System | Files | Owner |
|---|---|---|
| Zone progression | `src/zoneEncounters.js`, `src/zoneRunner.js`, `src/zonePortal.js` | Wave/boss/portal flow |
| Zone visual identity | `src/zones.js`, `src/zoneAmbient.js`, `src/zoneHud.js` | Per-zone profile + ambient + HUD |
| Reward loop | `src/xpSystem.js`, `src/perks.js`, `src/levelUpModal.js` | XP gems + perks |
| Hub | `src/hamlet.js`, `src/hamletScene.js`, `src/hamletFloor.js` | Run-start hub |
| Hero | `src/hero.js` (mage) | Single hero class |
| Bake pipeline | `scripts/bake-crypt-sample-room.js`, `scripts/lib/tmx.js` | Tiled .tmx → .png + .json |
| Bake outputs | `public/assets/rooms/{ruins,cemetery,crypt,mountain,volcano}_sample.{png,_anims.png,.json}` | Runtime zone art |
| Atlas slicing | `src/atlas.js` | Wang-tile atlas slicing for hamlet floor |

## Deprecated systems (quarantined; will be removed)

These still exist and still function, but no new code should depend on them.
They are scheduled for deletion in a future phase.

| System | Files | Removal target |
|---|---|---|
| DAG floor graph | `src/floor.js`, `src/floorGraph.js`, `src/mapScreen.js` | Phase 4 (after menu wires to zones) |
| Per-room kinds (combat / elite / event / sanctuary / reward / shop / altar / chestroom / trove / boss) | scattered in `src/main.js`, `src/floor.js`, `src/floorGraph.js` | Phase 4 |
| Procedural room rendering | `src/room.js` (drawFloorTile, drawWallTile, per-biome wear, etc.) | Phase 3 (after hamlet migrates) |
| Room shells / templates | `src/roomShells.js`, `src/roomTemplates/` | Phase 3 |
| Door portals | `src/doorPortals.js` | Phase 4 |
| Old DAG entry point | `__startRun()`, `loadRoom(idx)`, `beginNextFloor()` in `src/main.js` | Phase 4 |
| Old asset slot naming | `public/assets/characters/knight_*.png` (contains mage) | Phase 3 (rename to `mage_*.png`) |
| Old PixelLab tile sheets | `public/assets/tiles/floor_crypt_*.png`, `wall_crypt_*.png` (25 PNGs) | Phase 3 (delete from `loader.js`, then disk) |
| Floor-card cinematic (legacy form) | `src/floorCardRender.js` | Phase 6 (refactor to zone-aware, don't delete) |

## Quarantined assets (bake-time only, not in production)

| Path | Status | Why |
|---|---|---|
| `public/assets/packs/` (~105MB, 4993 files) | Build-stripped | Bake-time INPUT to `scripts/bake-crypt-sample-room.js`. Output lives in `public/assets/rooms/`. Removed from `dist/` by Vite plugin in `vite.config.js`. |

## Asset eras

| Era | What | Examples |
|---|---|---|
| **Old (legacy)** | PixelLab AI-generated, Nano-Banana paintings, procedural tile rendering | `assets/characters/knight_*.png` (mage), `assets/tiles/wall_crypt_*.png`, `assets/icons/*` (Nano-Banana relics), `assets/backdrops/*` |
| **New (canonical)** | Epic RPG World pack, Tiled-baked composites | `assets/rooms/*_sample.png`, `assets/packs/*` (bake-time only) |
| **Mixed** | Will be standardized in Phase 3-5 | `assets/enemies/*` (Tiny-RPG kit + PixelLab + 1 Epic-RPG-imported crypt_spider) |

## What is OK to do today

- Add new zones to `src/zoneEncounters.js`. Add corresponding `src/zones.js` profile.
- Add new perks to `src/perks.js`.
- Tune wave compositions, boss spawn locations, camera zooms.
- Bake new TMX rooms via `scripts/bake-crypt-sample-room.js` and register them in `src/loader.js`.
- Edit `src/walkabilityOverlay.js` overrides into sidecar JSONs and re-bake.

## What is NOT OK to do today

- Add new room kinds to the DAG system. Use waves instead.
- Add new procedural-render code paths in `src/room.js`. The bake is canonical.
- Reach through `window.*` debug hooks from production code paths. Phase 1 fixed this; don't re-introduce it.
- Add new pedestal-spawn logic gated on `data.kind`. Use the `zoneRunner` callbacks.
- Reference `public/assets/packs/*` from runtime code (not just from scripts/).

## Cleanup status (2026-05-08)

| Phase | Status | Commit |
|---|---|---|
| Audit | ✅ Done (analysis only) | — |
| 1 — Stabilize | ✅ Done | `725a9af` |
| 2 — Canonical world | ✅ Done | `6f75b28` |
| 3 — Asset/visual unification | ✅ Done | `fafe53b` |
| 4 — Menu wired to zones | ✅ Done | `1146e3a` |
| 5 — Gameplay feel | ✅ Done | `753f0ab` |
| 6 — Polish (zone-card + boss spawn) | ✅ Done | `caf1f55` |
| Verification | ✅ Done | `dae969b` |

The canonical zone flow is now reachable from the menu, fully resets on
restart, cleans up cleanly on death, and ships visual polish (zone-enter
cards, boss-spawn impact, scale unification, per-zone difficulty).

## Closed (formerly open) questions

1. ✅ **Cemetery boss identity** — `THE GRAVE WARDEN`, frost-affixed bone_captain (1.4× HP, 0.9× damage). Distinct fight feel without new asset.
2. ✅ **Hero/enemy scale band** — orc 220→120, wizard 200→110, bone_captain 320→160, broodmother 360→180, ember_tyrant 380→200. Hitboxes unchanged.
3. ✅ **Top-of-screen HUD layout** — XP bar shrunk to leave 240px right clearance for floor panel; level label compacted to "L7" inset on bar's right edge.
4. ✅ **Menu CTA** — routes to `beginCanonicalDescent('ruins')`. All 6 entry points updated (menu first-time, beginDescent, weapon picker, tarot, death-restart, R-key).

## Open questions / unresolved (deferred)

1. **Procedural fallback for hamlet** — `hamletFloor.js` still uses procedural floor rendering. Either migrate hamlet to a baked TMX or accept hamlet as the single legitimate consumer of `room.js` procedural code. **Not blocking.**
2. **HUD `currentFloorLevel` reads stay at 1 during canonical runs** — cosmetic (volcano shows "F1/4" on the floor panel). Telemetry/recordDeath also writes floor=1 for every zone. Fix is a per-call substitution: when `room.kind === 'tmx_crypt_sample'`, derive floor from `getZoneLevel(activeZone)`. Reviewer flagged as HIGH but cosmetic; deferred.
3. **DAG legacy code still present** — `floor.js`, `floorGraph.js`, `mapScreen.js`, `doorPortals.js`, `roomShells.js` still in `src/`, marked LEGACY but not deleted. They're fully quarantined (zone runs nullify their state, gates exclude them) but the bytes still ship in the bundle. Future cleanup can delete after confidence in canonical flow.
4. **Pause-modal Quit during zone run** — sets `hero.hp=0; hero.state='dead'`, which triggers FIX-B's death cleanup. Verified working but not exercised in code-review.

## How to use this document

If you're an agent picking up work on this project:

1. **Read this first.** Skip CLAUDE.md if it conflicts (CLAUDE.md is older).
2. **Identify which phase your work belongs to** (1 = stabilize / 2 = canonical / 3 = visual / 4 = world gen / 5 = feel / 6 = polish).
3. **Don't redesign.** Don't add new systems unless the current phase explicitly asks for them.
4. **Quarantine before delete.** Mark legacy systems with comments before removing files.
5. **Update this document** if your work changes the canonical landscape.
