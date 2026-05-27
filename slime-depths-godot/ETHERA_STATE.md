# ETHERA — Project State Summary

A handoff document for outside collaborators (ChatGPT, design reviewers,
new contributors). Snapshot of the game as it stands today. Keep updated
when major systems change.

Date of snapshot: 2026-05-20 (iter-242 = Loop Tightening sprint complete)
Branch: `claude/wizard-kit-sprint-3` @ commit `aa9665e` (60 commits ahead of `main`)

**Loop Tightening Sprint (iter-242)**:
After the user identified that "we have a lot for the player to use but a
lot feels mid; that core loop doesnt feel good/tight," parallel diagnosis
+ research agents profiled our loop and surveyed VS / BoI / Hades / RoR2
/ Dead Cells. Synthesis: "content is there; pace between content is what's
killing it." 5 levers shipped in iter-242 (`aa9665e`):

  • **L1 — Per-kill soul gems + always-visible kill counter** (VS reward-
    heartbeat pattern). Each enemy death spawns a violet diamond that
    flies to hero, bumping `☠ N` in the HUD with audio blip. Milestones
    at 5/10/25/50/100 flash gold + ring chime.
  • **L2 — Compress room intro** (1.95s UI ceremony → 0.6s). INITIAL_
    WAVE_DELAY 0.6→0.2; ROOM_BANNER_HOLD 1.5→0.6; first wave overlaps
    banner fade-out.
  • **L3 — Compress wave clear + warp door to pedestal**. WAVE_CLEAR_
    PAUSE 0.9→0.3. Single-door rooms now spawn the door 40 px east of
    the LAST claimed pedestal, eliminating the 2.5s walk-to-east-wall
    dead time. Branch doors keep east-edge positions (DAG integrity).
  • **L4 — Tier-differentiated pickup audio**. Common chime / rare
    2-note rise / legendary 4-step arpeggio / mythic wash (existing).
    94% of pickups now audibly distinct vs. pre-iter-242 uniform tone.
  • **L5 — Sword swing-cancel** (Hades cancel + Dead Cells input buffer
    pattern). ATTACK_COOLDOWN 0.40 → 0.18 — re-trigger LMB at ~45%
    through prior swing for snappy mash feel without anim lock.

Tests +2 (test_iter242_soul_gem.gd, test_iter242_loop_constants.gd).

**Round 4 (iter-236..239)**:
  • Bug Team R4 (iter-236): shipped the long-deferred shared enemy
    snapshot in main.gd (refreshed once per _process), wired
    surgically into enemy.gd's separation hot path. Plus a full save
    round-trip test populating all 19 persisted fields, serializing,
    wiping, loading, asserting equality. No save/load bugs surfaced.
    Tests +2.
  • Polish Team R4 (iter-237): death screen relics grouped by tier
    (common/rare/legendary/mythic) with theme chip colors per relic.
    Cursed pickup commit drama — slow-mo + violet flame burst + 1.5s
    embed aura + "CURSED <name>" floater. Tests +1.
  • Expansion Team R4 (iter-238): TUSKBROD charger enemy completes
    the shield/flying/charger trio of missing AI patterns. 4-state
    machine: WANDER → TELEGRAPH (red aim ray) → CHARGE (4× speed,
    2 damage) → RECOVERY. HP 5, copper/red werewolf. Wired into
    room_06 BROOD CHAMBER wave 2. Tests +1.
  • Fun Ideas R4 (iter-239): FLOOR-WIDE MODIFIERS (Pact lite).
    5 modifiers (HEAT WAVE / SWIFT FOES / THICKER BLOOD / DARKER
    PATHS / CLOCKED) — pick any combination at run start for an
    additive ether reward multiplier (1.0 → 2.10× max). Pre-run
    modal in main_menu, HUD chip strip during runs. HEAT WAVE fully
    wired to hero damage path; 4 others scaffolded with correct
    multiplier math. Tests +1.

**Round 3 (iter-232..235)**:
  • Bug Team R3 (iter-232): 3 coverage tests — migration v6/v7/v8,
    upgrade tree spend math, achievement unlock flow. Surfaced one
    typed-array gotcha (Array[String] vs Array literal). Tests +3.
  • Polish Team R3 (iter-233): hero-side status chips (FROST/SLOW +
    VENOM with duration labels) following the hero in world space.
    Closes "no in-game evidence of active statuses" UX gap. Tests +1.
  • Expansion Team R3 (iter-234): MOTH flying enemy — first airborne
    archetype. flying_orbit behavior (180 px radius orbit + occasional
    dive). is_flying field on EnemyType. Wired into room_05 OSSUARY
    waves 1 + 3. Tests +1.
  • Fun Ideas R3 (iter-235): CURSED PICKUP variant. 10% chance any
    non-mythic pedestal offer is cursed; accepting grants the relic
    PLUS a permanent run modifier (HUNGRY VEINS / STAGGERED STEP /
    DARK HUNGER / VEILED SIGHT). Cursed pedestals show violet aura +
    badge. Routes through shrine_bonuses → modifier_total. Tests +1.

**Round 2 (iter-228..231)**:
  • Bug Team R2 (iter-228): boss-phase regression test + relic-stacking
    sanity test (6 fold cases). Per-frame O(n²) snapshot deferred for
    a quiet sprint. Tests +2.
  • Polish Team R2 (iter-229): elite-affix tooltip card surfacing at
    96 px proximity (FROST/EMBER/VENOM/WARDED rules text), death-screen
    "FELLED BY <enemy>" cause line, BIGGEST HIT counter, SHATTER×N ·
    KINDLE×N combo tallies. New ELITE_AFFIX_DESCRIPTIONS dict. Tests +1.
  • Expansion Team R2 (iter-230): BULWARK shield enemy archetype.
    New shield_walker behavior — 90° front cone reduces damage 75%;
    flank/rear hits break shield for 1.5 s, full damage during the
    window. HP 4, steel-blue tinted skeleton sprites. Wired into
    room_05 OSSUARY wave 3. Tests +1.
  • Fun Ideas R2 (iter-231): REACTION WEB HUD chip strip. 6 small
    labels (one per status combo) that surface ARMED / PARTIAL /
    hidden based on owned relics + theme tiers + base hero
    capability. Educates the chemistry system. New reaction_web.gd
    sensor layer. Tests +1.

**Recent**: 4-team parallel sprint (Bug / Polish / Expansion / Fun Ideas):
  • Iter-224 (Bug Team): 5 defensive `as Node2D` + `is_instance_valid`
    guards on per-frame enemy group walks (separation loop, all hero
    AoE scans). Tests +1.
  • Iter-225 (Polish Team): ability cooldown chips for LMB/RMB/Q/SHIFT
    (auto-hide when ready), Achievement Viewer modal with 13 entries
    (gold/dim per locked/unlocked, spoiler-protection). Tests +1.
  • Iter-226 (Expansion Team): 4 new relics — ETHER MAGNET (+25%
    shards), SACRIFICIAL ECHO (+1 HP per 5 kills), SUMMON STONE
    (stationary turret), LUCKY KNIFE (crit-kill ether bonus). New
    `turret.gd` + auto-spawn at room start. Tests +1.
  • Iter-227 (Fun Ideas Team): RITUAL PACT ALTAR — Faustian-bargain
    counterpart to the iter-33 stat shrine. 4 catalog pacts pairing
    a boon with a curse (BLOOD +2 atk/-1 HP, ASH legendary/-15%
    speed, DUSK +8 shards/-1 HP, IRON +1 HP&heal/-1 DR). Distinct
    obsidian + bloodred visuals. Routes through existing
    shrine_bonuses → modifier_total chain. New scene + .gd. Tests +1.

Earlier this session: M0-M5 beta milestones shipped (iter-218-223).
12 audit tests green. See `BETA_ROADMAP.md` for M6-M10 post-EA cadence.

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

**Active relics** (4 total — Isaac D6 pattern, iter-201 + iter-213). Bound
to [R]. Dispatcher: `GameState.get_owned_active_id()` — priority order
in `ACTIVE_RELIC_IDS` decides which is bound when player owns multiple.

- `SOUL_SURGE` — mythic, SHADOW. 100 px AoE damage burst around hero,
  3 damage to all enemies. 18 s CD.
- `VEILSTEP` — legendary, SHADOW. Phase ~140 px toward cursor with
  iframes during the blink. 14 s CD. Verb: reposition.
- `ASHEN_SEAL` — legendary, FLAME. Drops a burning sigil at hero's feet
  that ticks BURN to enemies within 80 px for 4 s. 20 s CD. Verb: zone
  control. Composes with SHATTER + KINDLE_SPREAD.
- `BLOOD_TITHE` — legendary, BLOOD. -1 HP, +50% damage for 6 s, +1 HP
  per kill in the window. 30 s CD. Verb: risk/tempo.

**Spell-modifier relics** (4 total — Noita pattern, iter-203 + iter-214):

- `ECHO_QUILL` — legendary, STORM. Every blast fires a SECOND projectile
  0.16 s later at fresh cursor aim. Multi-shot compounds.
- `SPLIT_CINDER` — rare, FLAME. Every 3rd cast also fires 2 ember sub-
  projectiles at ±30° from aim. 1 damage each, smaller scale.
- `GRAVITY_NEEDLE` — rare, SHADOW. Projectiles drag — enemies within
  32 px of the flight path get a brief 0.5 s slow (0.65×). Per-
  projectile bookkeeping prevents stacking on one pass.
- `STATIC_RUNES` — rare, STORM. Every 4th cast bumps storm_chain_count
  +1 on spawned projectiles. Additive with STORM theme tier.

## 4. Run Structure

- **Branching DAG of 7 rooms with 2 choice points** (`floor_state.gd`,
  iter-216).
- Linear sequence: room_01 → room_02 → [CHOICE] → room_03 → room_04 →
  [CHOICE] → room_05 → room_06 → room_07.
- **Choice point 1** (after room_02): ALTAR (shrine detour) / VAULT
  (treasure detour) / BRAVE (risk: +1 enemy, rare-tier pedestal).
- **Choice point 2** (after room_04): VAULT / ALTAR / BRAVE (same
  3-way pattern with reordered priority).
- After detour, sequence resumes — pending_branch_path is consumed
  on first read in `RunState._load_current`.
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

**Status combos (6 — Noita-tier chemistry, iter-202 + iter-212 + iter-215)**:

Enemy-side combos (fire on enemy state transitions, dispatched from `enemy.gd`):
- `BURN + SLOW → SHATTER` (iter-202): +2 damage burst, fires from
  either direction (apply onto already-statused enemy). Per-enemy CD.
- `BURN + DEATH → KINDLE_SPREAD` (iter-212): burning enemy dies →
  flames jump 96 px to all neighbors, 1.5 s burn. Chains naturally.
- `SLOW + CRIT → PETRIFY` (iter-215): slowed enemy hit with crit →
  0.6 s stun. Per-enemy 1.2 s CD prevents chain-stunlock.
- `BURN + KNOCKBACK → SCATTER_FLAMES` (iter-215): burning enemy
  knocked → embers spread to neighbors (64 px, 0.8 s burn).
  Per-enemy 0.5 s CD.

Hero-side combos (fire on hero actions, dispatched from `hero.gd`):
- `BURN + PARRY → BACKDRAFT` (iter-215): burning enemy within 96 px
  when parry catches → 1 dmg + 1 s burn to all enemies in range.
  Free CD via the parry system.
- `SLOW + DASH-THROUGH → RIME_TRAIL` (iter-215): dash slices a slowed
  enemy → frost pulse at hit point, 1.2 s slow at 0.55× to enemies
  in 84 px. One per dash.

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
  material* — three layered storytelling passes (iter-209/210/211).
- 21-enemy roster with 9 distinct behaviors. No reskin-grade enemies.
- 53 relics + 4 actives (SOUL_SURGE / VEILSTEP / ASHEN_SEAL / BLOOD_TITHE,
  iter-213) + 4 spell modifiers (ECHO_QUILL / SPLIT_CINDER /
  GRAVITY_NEEDLE / STATIC_RUNES, iter-203 + iter-214).
- 6 status combos (SHATTER / KINDLE_SPREAD / PETRIFY / SCATTER_FLAMES /
  BACKDRAFT / RIME_TRAIL) all with VFX + audio + floater feedback.
- Branching DAG with 2 choice points (iter-216).
- Stability — 7 audit tests (`tests/`) all green: load gate, scenes
  audit, KINDLE regression, actives dispatcher, modifier registry,
  combos runtime, DAG branching. Continuous deletion of crash bugs.

## 9. Known Weak Axes (next-up beta gaps)

**Meta-progression / between-run state**:

- No persistent unlocks. Each run starts identical. Need: achievements,
  unlocked relics, ascension tier progress, run records.
- No hamlet hub. Web build had 8 NPCs (oracle / gravekeeper / smith /
  etc.) — Godot port goes straight from menu to dungeon. Hub gives the
  meta loop somewhere to LIVE.
- No currency. Gold pickup exists but doesn't carry over.

**Audio**:

- Likely the weakest axis. Most SFX are placeholder. No per-biome music.
  No boss music. Menu probably silent.

**Onboarding / tutorial**:

- No tutorial. New player drops straight into combat with no controls
  explanation. The iter-160 "WAIT_PICKUP tutorial state" is the only
  scaffolding.

**Accessibility / settings**:

- Settings screen exists but unaudited. No confirmed rebindable inputs,
  no colorblind options, no reduced-motion toggle, no screen-shake
  toggle (the trauma system has no off-switch).

**Content density at scale**:

- 21 enemies / 3 bosses / 7 rooms is ABOVE prototype but BELOW shipped
  beta. Hades shipped EA with ~30 enemies / 4 bosses / 4 biome arenas;
  Dead Cells EA had ~40+ enemies / 6 biomes; BoI vanilla had 196 items.
  Roughly: we'd want ~30 enemies / 5 bosses / 10 rooms / 80 relics
  for "feels like a real game."

**Class variety**:

- Single class (mage). Future axis: classes from hamlet with different
  blast spell shape + sword swing.

**Marketing / Steam-readiness**:

- No Steam page. No trailer. No screenshots curated for marketing. No
  press kit. No build pipeline targeting steam_appid.txt.

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
| Active toolkit verbs       | ★★★    | ★★★    | ★★     | ★★ (4 actives) |
| Status combo chemistry     | ★      | ★★     | ★★★    | ★★★ (6 combos) |
| Run branching / shape      | ★★★    | ★★★    | ★★★    | ★★ (2 forks) |
| Boss readability + phases  | ★★★    | ★★     | ★★     | ★★           |
| Environmental storytelling | ★★     | ★★     | ★★★    | ★★★          |
| Meta-progression loop      | ★★★    | ★★     | ★      | ★            |
| Audio depth                | ★★★    | ★★     | ★★★    | ★            |
| Tutorial / onboarding      | ★★★    | ★★     | ★      | ★            |
| Accessibility / settings   | ★★★    | ★★★    | ★★     | ★            |

The biggest deltas now: **meta-progression**, **audio depth**, **tutorial /
onboarding**, **accessibility**. Phases 2-6 (May 2026) closed the toolkit,
combo, and branching gaps. Material/atmosphere is at parity with Noita;
combat feel is in shouting distance of Hades.

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
