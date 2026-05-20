# ETHERA — Project State Summary

A handoff document for outside collaborators (ChatGPT, design reviewers,
new contributors). Snapshot of the game as it stands today. Keep updated
when major systems change.

Date of snapshot: 2026-05-19
Branch: `claude/wizard-kit-sprint-3` @ commit `4bbb759` (20 commits ahead of `main`)

---

## 1. The Game

**Ethera** — top-down dark-fantasy action roguelite.

- **Logline**: a single mage descends through a corrupted crypt-fortress
  whose magical containment has failed. Each floor is a self-contained
  ritual chamber where some kind of unstable magical material has
  leaked, stained, and corrupted the space. Beat the floor's keeper to
  push deeper.
- **Tagline**: "beneath the ruin."
- **Genre**: top-down 2D, single-screen rooms, real-time action,
  permadeath, run-based meta-progression.
- **Design north star** — we want to land between three references:
  - **Hades** — moment-to-moment combat FEEL (juicy hit reactions, parry
    chime, dash-cancel grammar, room-as-location reading).
  - **The Binding of Isaac** — content density and item-combination
    surprise; the run is a slot machine of synergies.
  - **Noita** — environmental danger, magical-material storytelling, and
    status-combo chain reactions ("every spell touches every other
    spell").
- **Constraint** — we are explicitly NOT making a side-scroller, NOT
  copying Noita's pixel simulation, and NOT relying on post-FX/bloom/
  shader gimmicks. Atmosphere comes from authored polygons + a few
  particle layers, not from heavy GPU effects.

## 2. Tech & Architecture

- **Engine**: Godot 4.6.2 (stable), GDScript with strict typing.
- **Repo layout**:
  - `slime-depths-godot/` — the **active** Godot port. All gameplay
    edits go here.
  - `slime-depths/` — older HTML5 / Canvas vanilla-JS prototype. Still
    in the repo for reference. NOT shipping platform anymore.
  - `ethera/` — paused 44K-LoC isometric ARPG. Reference only.
- **Resolution**: 1280 × 768. Single-screen rooms; camera is locked.
- **Play area**: `(96, 96) → (1184, 672)` — a ~1088×576 interior bounded
  by a 96-px perimeter wall mass.
- **Asset pipeline**:
  - Character / enemy sprites are PixelLab-generated PNG sheets,
    imported with a custom Node script (`scripts/pixellab/import-*.js`).
  - Floors use a procedural dungeon texture pack + per-biome ambient
    tints stamped at room load.
  - Props (torches, pillars, sarcophagi, cursed font) are authored
    `.tscn` scenes assembled from Polygon2D / Sprite2D primitives.
- **Save / settings**: JSON in `user://` via custom save_system.gd.
- **Tests**:
  - `tests/check_main_loads.gd` — load gate, confirms `main.tscn`
    parses and required nodes exist.
  - `tests/test_iter212_kindle.gd` — regression test for the
    KINDLE_SPREAD status combo. Pattern for future combo tests.

## 3. Player Toolkit

The hero is a single MAGE class.

- **Movement**: 8-directional, with 8-dir sprite sheets.
- **Sword swing** (`hero.gd` — primary melee). Short arc in the aim
  direction. Spawns slash VFX + hit spark on connect.
- **Blast** (`hero.gd` — primary ranged spell). Spawns a `projectile`
  that travels in the aim direction. The spell is modifiable by
  ECHO_QUILL relic (Noita-flavor).
- **Dodge** (i-frame burst, brief invuln + position shove). Iter-197
  added a Hades-style **dash-cancel**: dodge interrupts the swing.
- **Parry chime** (iter-197) — visual + audio cue when an enemy attack
  hits during a parry window.
- **Aim** is independent of movement direction (twin-stick or
  mouse-relative).

**Active relic** (Isaac D6 pattern, iter-201):

- `SOUL_SURGE` — 1 active relic so far. Button press fires an effect
  with a cooldown. HUD cooldown chip wired in iter-204.

**Spell-modifier relic** (Noita pattern, iter-203):

- `ECHO_QUILL` — every Nth blast doubles. The first hint of Noita's
  spell-modifier wand system.

## 4. Run Structure

- **Linear DAG of 7 main rooms**. No branching choices yet
  (`FLOOR_ROOMS` in `floor_state.gd`).
- Rooms 1-6 = combat rooms. Room 7 = TYRANT'S HEARTH boss room (iter-207).
- 9 room templates exist: 7 numbered + 1 shrine + 1 treasure variant.
  Shrine and treasure aren't yet integrated into the linear path —
  they're available as a future branching layer.
- **3 bosses** are wired:
  - **Iron Revenant** (HP 12, telegraphed_melee) — mid-run boss.
  - **Broodmother** (HP 16, chase_contact) — mid-run boss.
  - **Ember Tyrant** (HP 16, telegraphed_melee, phase 2 at 65% HP,
    phase 3 at 30% HP) — the new run-end boss in room_07.
- Older codebase mentions a **Grudnok** floor-1 boss; in the Godot port,
  the floor-1 boss role currently falls to one of the elite/orc
  encounters (cleanup pending).

## 5. Content Roster

**Enemies (21 total)** — defined as `.tres` resources, runtime behavior
dispatched by the `behavior` field:

- chase_contact: Slime, Orc, Werewolf, Ember (1 HP swarmer), Crypt Spider,
  Broodmother (boss)
- telegraphed_melee: Skeleton, Armored Skeleton, Lancer, Iron Revenant
  (boss), Ember Tyrant (boss)
- shoot / stationary_shoot: Archer (pierce), Wizard (3-way spread),
  Priest, Dreadmage (heavy), Bonecap
- summoner: Bone Summoner — spawns minions
- healer: Spectral Priest — heals wounded allies
- bomber: Ember Bomber — fuse → AoE on death
- wraith: Rogue Wraith — phase-in attacks
- glyph_warden: plants stationary floor traps, then kites — unique
  behavior; outlives its planted glyphs.

**Status effects (2)**:

- BURN — DoT (tick damage), refreshable, has sprite tint.
- SLOW — multiplies enemy `move_speed`; stronger slows override weaker.

**Status combos (2 — both Noita-tier)**:

- `BURN + SLOW → SHATTER` (iter-202): thermal shock, +2 damage burst,
  fires from either status direction (apply_burn-onto-slowed or
  apply_slow-onto-burning). Cooldown-gated so it can't loop-fire.
- `BURN + DEATH → KINDLE_SPREAD` (iter-212): a burning enemy that dies
  spreads burn (1.5 s) to all enemies within 96 px. Chains naturally —
  if the spread ignites a slowed enemy, SHATTER fires on it, which can
  kill it, which can KINDLE_SPREAD again.

**Relics (53 total in `RELIC_REGISTRY`)**:

- 13 common (basic stat-sticks with a small mechanical hook)
- 19 rare (mid-tier procs and combat-pattern shapers)
- 16 legendary (build-defining capstone effects)
- 5 mythic (Eye of Ether, Cataclysm tier — only roll on floor 4 at
  ~6% rate)

Themes tagged on each relic (`themes` field): STORM, FLAME, BLOOD, VOW,
SHADOW. 3-of-theme triggers RESONANCE (small stat boost); 5-of-theme
triggers ASCENDANCE (tier-2 mechanical bonus + visible aura under hero).

**Biomes (4)**:

- **crypt** — pale dust, cool stone, sparse motes drifting down.
- **ossuary** — bone-pale motes in lazy swirls, dense.
- **ember** — heat-rise particles, rising sparks, warm palette.
- **sanctuary** — cool-blue runes drifting upward.

Each biome has its own:
- `ambient_tint` for the `CanvasModulate`
- `BaseFloor` color
- Torch color (warm gold / cool teal / ember orange)
- Ambient particle system (primary + optional accent)

**Hazards**:

- **Slow Zone** (`slow_zone.tscn`) — the canonical "cursed alchemical
  font" at room center. Carved-stone basin with toxic green pool,
  ripple ring, two bubbles, swirl wisps, footprint halo, proximity
  wake-up (visual responds when hero closes in). Iter-209 added 4 seep
  trails + 2 acid stains around it.
- **Spike Pit**, **Fire Jet**, **Lightning Rod**, **Glyph Trap** —
  authored hazard objects.

## 6. Visual / Atmosphere Doctrine

Cycle 19-22 (May 2026) was a Noita-inspired **material storytelling
pass** that established the room's atmosphere stack:

- **Layer 0**: BaseFloor (z = -3) — per-biome solid color.
- **Layer 1**: Procedural dungeon texture decals.
- **Layer 2**: Material story clusters (iter-209, z = -1) — 2-3 per room
  at perimeter positions. 4 kinds: burn_scrape (charcoal streaks),
  blood_smear (dried red blots), fungal_patch (sickly green spore
  cluster), corruption_crack (dark line + green leak). Per-room seeded.
- **Layer 3**: Wall-to-cluster seepage trails (iter-210, z = -2) — each
  cluster gets a tapered polygon trail from the nearest wall edge,
  colored to match. Source jittered ±18 px along the wall so it
  doesn't read as geometric.
- **Layer 4**: Active flow particles (iter-211, z = -2) — each trail
  gets a sparse CPUParticles2D emitter (3 particles in flight) drifting
  along the trail toward the cluster. ~1.3 s emission cadence. Tells
  the player the corruption is STILL ACTIVELY FLOWING.
- **Layer 5**: Perimeter rubble (z = +1) — 2-3 chunk piles at corner
  positions.
- **Layer 6**: Wall overlays (z = +1) — 1-4 PixelLab decals on the
  perimeter wall mass.
- **Layer 7**: Floor focal anchor (z = -1) — a subtle warm-gold ritual
  ring at room center, sells "this is a ritual chamber not a test
  arena."
- **Layer 8**: Ambient motes (z = +5) — biome-specific particle clouds.

**Lighting**:

- `CanvasModulate` for global biome tint.
- `PointLight2D` on torches (warm/cool/ember per biome).
- `PointLight2D` on the cursed font (toxic-green pool).
- Soft Polygon2D contact shadows under hero + enemies (deliberately
  small + subtle after the iter-189/192 audit that removed fake-3D
  long-cast shadows).

**HUD doctrine**:

- Heart pips top-left.
- Ability cooldowns top-middle (dodge, dash-strike, active relic).
- Relic chip strip + theme chips top-right.
- Damage feedback: edge vignette (iter-194) — NOT a blanket red wash.
- Pickup banner full-width below mid-screen with auto-resizing for long
  flavor + desc.

**Boss intro**:

- 6 dedicated 1376×768 boss intro scenes (Nano Banana / NaN images).
- Full-bleed image + lower-third darken gradient + gold typography.
- Post-FX pipeline wholesale-skipped during intros (prevents GPU
  tone-mapping crushing the portrait to black).

## 7. Combat Feel

- **Hit feedback** — iter-181 shader-driven pure-white silhouette flash
  + iter-145 stacked scale punch (1.15× normal / 1.32× crit) + damage
  number + audio. Tier-scaled — a 1-damage nick on a boss doesn't fire
  the same shake as a 50-damage crit.
- **Audio cues** — parry chime, dash whoosh, crit sparkle, burn ignite,
  slow apply, shatter ring, kindle whoosh.
- **Camera shake** — trauma-based (iter-145), exponentially decays.
- **Slow-mo on boss death** + heavy shake (iter-148) — the "savor beat."
- **Floater colors** — white (normal), gold (crit), pink-orange
  (SHATTER), orange (KINDLE).

## 8. What's Strong Right Now

- Room visual atmosphere reads as *cursed crypt with leaked magical
  material* — three layered storytelling passes.
- 21-enemy roster with 9 distinct behaviors. No reskin-grade enemies
  after iter-200 (ranged casters now have distinct projectile patterns:
  spread / pierce / heavy) and iter-198 (chase_contact enemies have
  signature attacks).
- 53 relics with mechanical hooks (not pure stat sticks); theme system
  rewards intentional building.
- 2 status combos fire with full visual + audio + floater feedback.
- Stability — load gate test + KINDLE_SPREAD runtime test ship green.
  4 weeks of agents grinding bugs out of edge cases.

## 9. Known Weak Axes (the next ChatGPT-prompt targets)

**Toolkit depth** — the biggest gap to the references.

- Only **1 active relic** (Soul Surge). Hades has 6 weapons × multiple
  modifiers, BoI has dozens of actives. Adding 2-3 more actives with
  distinct verbs (panic-button, crowd-control, defensive teleport,
  resource-tradeoff) would dramatically deepen run-feel. Pattern is
  established (cooldown HUD chip already exists from iter-204).
- Only **1 spell modifier** (Echo Quill). Noita's wand system has
  dozens of modifiers and triggers — even 4-5 more modifier-class
  relics would let players feel like they're "building a spell."
- Only **2 status combos**. Noita's matrix is rich: water+electricity,
  oil+fire, poison+ignite. A roadmap of 4-6 more combos (e.g.,
  `BURN + KNOCKBACK → SCATTER_FLAMES`, `SLOW + CRIT → PETRIFY`) would
  make the toolkit feel like a chemistry set.

**Run shape**:

- Linear 7-room sequence. No branching, no choice tension, no
  Hades-style "which path do I take into this floor" reading.
- No shop / curiosity / shrine rooms in the main path (the .tres files
  exist but aren't yet branched in).
- No meta-progression unlocks tied to runs. Each run starts identical.

**Encounter density / pacing**:

- Rooms are all the same shape (single arena). No multi-room "zones"
  or sequence puzzles.
- No mini-boss encounters between regular rooms.
- Wave timing is roughly uniform — no Hades-style "this room introduces
  the new enemy, the next room remixes it" curriculum.

**Hamlet / hub**:

- The Godot port currently goes straight to a run. The web build had a
  hamlet hub with 8 NPCs (oracle, gravekeeper, smith, etc.). Re-porting
  those into the Godot build would give the meta-progression loop
  somewhere to LIVE.

**Class variety**:

- Single class (mage). Future axis: classes selectable from hamlet,
  each with a different blast spell shape + sword swing.

## 10. Constraints / Rules I Follow

For any new work, the rules:

- Do **NOT** turn the game into a side-scroller.
- Do **NOT** copy Noita's pixel-simulation camera or full material grid.
- Do **NOT** rely on post-FX gimmicks (bloom, chromatic aberration,
  screen-shake-as-feedback, heavy blur, hit flash that drowns the
  silhouette).
- Do **NOT** overdecorate the floor with random scatter; prefer 5
  authored marks over 50 tiny random marks.
- Do **NOT** introduce cache-bust `?v=...` suffixes or shader hacks.
- Do **NOT** push directly to `main` or force-push any open PR branch
  without explicit user confirmation.
- DO prefer **strong individual storytelling beats** over volume.
- DO write **regression tests** when adding mechanic combos.
- DO keep additions consistent with the **existing dispatcher patterns**
  (status combo dispatcher, active relic cooldown, theme tagger, etc.)
  rather than inventing new ones.

## 11. Reference axis — where we stand vs the three north stars

| Axis                       | Hades  | BoI    | Noita  | Ethera today |
|----------------------------|:------:|:------:|:------:|:------------:|
| Hit feel / juice           | ★★★    | ★★     | ★★     | ★★★ (close)  |
| Room as authored location  | ★★★    | ★★     | ★★     | ★★ (rising)  |
| Item / relic combo density | ★★     | ★★★    | ★★★    | ★★           |
| Active toolkit verbs       | ★★★    | ★★★    | ★★     | ★            |
| Status combo chemistry     | ★      | ★★     | ★★★    | ★★ (2 combos)|
| Run branching / shape      | ★★★    | ★★★    | ★★★    | ★            |
| Boss readability + phases  | ★★★    | ★★     | ★★     | ★★           |
| Environmental storytelling | ★★     | ★★     | ★★★    | ★★★          |
| Meta-progression loop      | ★★★    | ★★     | ★      | ★            |

The biggest deltas are: **active toolkit**, **run branching**, **boss
phases**, and **meta-progression**. Material/atmosphere is now at parity
with Noita; combat feel is in shouting distance of Hades.

## 12. How to use this document with ChatGPT

When asking ChatGPT for design help, paste this whole document as the
first message in a new chat, then ask one focused question per turn —
e.g.:

- "Given the state above, design 3 active relics with distinct verbs
  that fit the existing theme system (STORM/FLAME/BLOOD/VOW/SHADOW).
  For each, give: name, button-press effect, cooldown in seconds,
  theme tag, sketch of HUD/visual feedback."
- "Propose 4 new status combos using ONLY the existing BURN and SLOW
  statuses (don't introduce new ones). Each should pair a status with
  a different trigger (hit, death, crit, dodge-through, knockback).
  Give name, math, feedback grammar."
- "Suggest a branching-DAG shape for the 7-room run that preserves the
  Ember Tyrant as the end-of-run boss but introduces meaningful
  fork choices on floors 3-5. Format as ASCII graph."
- "Audit the relic roster (53 total) for archetype coverage gaps —
  what build-defining patterns are missing?"

Keeping each prompt narrow gives ChatGPT room to be specific rather
than generic.
