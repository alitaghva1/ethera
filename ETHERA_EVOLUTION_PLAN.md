# ETHERA: Evolution RPG — Complete Implementation Plan

**Version:** 1.0
**Date:** April 5, 2026
**Status:** AWAITING APPROVAL — No code changes until approved

---

## Table of Contents

1. [Game Vision Summary](#1-game-vision-summary)
2. [Full Project Audit](#2-full-project-audit)
3. [Gap Analysis](#3-gap-analysis)
4. [System Design Plan](#4-system-design-plan)
5. [Asset Plan](#5-asset-plan)
6. [Implementation Roadmap](#6-implementation-roadmap)

---

## 1. Game Vision Summary

Ethera transforms from a wizard-centric dungeon crawler into an evolution-based RPG. The player begins as a **Slime** — the weakest creature in the dungeon — and evolves through four forms, each playing like a fundamentally different game:

**Evolution Path:** Slime → Skeleton → Broken Wizard → Lich/Necromancer

**The Talisman:** A mysterious artifact that persists across all forms. It is the narrative thread binding the evolution chain and the mechanical backbone that carries forward certain permanent upgrades. The talisman is found early (or starts with the player) and grows in power as the player evolves.

**Design Pillars:**
- Each form feels like a different game with different mechanics
- Evolution is earned through meaningful gameplay milestones, not just XP
- The talisman creates continuity — you never feel like you've "lost" progress
- Difficulty curves reset with each evolution to teach new mechanics
- The dungeon environment itself changes to reflect the player's growing power

---

## 2. Full Project Audit

### 2.1 Architecture

The entire game is a **single HTML file** (`ethera.html`, 10,866 lines) using HTML5 Canvas and vanilla JavaScript. There is no module system, no build step, no framework.

**Code Organization (by line range):**

| Lines | System | Description |
|-------|--------|-------------|
| 1–42 | HTML/CSS | Document structure, canvas element, hidden name input, intro overlay |
| 43–195 | Configuration | Tile constants, sprite registries, asset paths, movement physics constants |
| 196–268 | Global State | Camera, gamePhase, light system, cinematic state, music config |
| 270–403 | Music System | 2-channel crossfade, combat/cinematic tracks, stings, duck/pause |
| 404–674 | SFX System | Web Audio API procedural sounds (22+ distinct effects) |
| 675–838 | Game Feel + Leveling | Screen shake, hit pause, slow-mo, XP state, 15 upgrade definitions |
| 840–946 | Menus + Asset Loader | Menu state, journal state, name entry, loadImage/loadAssets |
| 949–1453 | Map System | Floor/object/blocked arrays, 3 zone generators (Zone 1: 6 rooms, Zone 2: 5 rooms, Zone 3: boss arena) |
| 1456–1523 | Player Object | Position, velocity, facing, state machine, dodge state, HP/mana |
| 1525–2044 | Inventory & Equipment | 4 equip slots, 4 rarity tiers, 11 stat types, stat caps, item generation, key items, journal |
| 2055–2318 | Chests & Zone Loading | Zone-aware chest definitions, loadZone() full reinitialization |
| 2320–2500 | Doors & Transitions | Zone exit definitions, key requirements, fade transitions |
| 2543–3611 | Grimoire Menu | 5-tab dark fantasy character menu (status, equipment, key items, quests, minimap) |
| 3613–3680 | Combat Parameters | COMBAT, PLAYER_STATS, TOWER, DIFFICULTY tunable objects |
| 3682–3995 | Input System | WASD movement, space dodge, mouse attack/summon, menu hotkeys |
| 4003–4500 | Rendering Core | Coordinate helpers, collision, tile rendering, wizard drawing |
| 4500–4975 | Player Update | Movement physics, dodge, mana regen, projectile spawning, upgrades |
| 4976–5498 | Projectile System | Fireball movement, wall bounce, trail rendering, impact explosions |
| 5498–5540 | Enemy Definitions | 5 types: slime, skeleton, skelarch, armoredskel, werewolf |
| 5540–5954 | Wave System | Spawn zones, wave definitions (3 zones), dynamic generation, state machine |
| 5955–7500 | Enemy AI & Combat | Per-type AI (lunge, flank, ranged, shield, charge), collision, damage |
| 7050–7548 | Tower System | Summon placement, targeting, firing, chain lightning, rendering |
| 7549–7860 | VFX | Placement preview, tower bolts, fog of war, particles |
| 7860–8157 | Level-Up Screen | 3-card upgrade selection UI with hover effects |
| 8158–8500 | HUD Systems | HP/mana/XP bars, crosshair, pickup texts, camera follow |
| 8500–8960 | Game Loop | Main loop with phase routing (preMenu, menu, cinematic, playing, death) |
| 8960–9243 | Main Menu | Pre-menu, title screen, button rendering, embers |
| 9244–9508 | Controls & World Drops | Controls screen, world drop/key drop rendering |
| 9510–9990 | Inventory UI | Layout, slot rendering, item icons, tooltips |
| 9990–10190 | Death/Pause/Restart | Death screen, pause overlay, full restartGame() reset |
| 10191–10439 | Render Pipeline | Main render() function — depth-sorted isometric rendering |
| 10441–10580 | Save/Load | 3 localStorage slots, serialization/deserialization |
| 10580–10866 | Name Entry, Load Screen, Init | Name entry UI, load screen, runIntro(), init() |

### 2.2 Movement & Physics

- **Continuous free movement** on an isometric grid (not tile-locked)
- Acceleration/deceleration model with configurable constants (ACCEL, DECEL, MAX_SPEED)
- Hitbox is circular (radius 0.18 tiles)
- Collision uses two systems: AABB for walls (blocked tiles) and circle-vs-circle for objects
- `canMoveTo()` checks both wall and object collisions, returns collision type
- `wallProximity()` used for edge-case resolution

### 2.3 Combat Systems

**Wand Attack (Left Click):**
- Fires projectiles toward mouse cursor
- Cooldown-based with equipment speed bonuses
- 7 upgrade paths: multishot, pierce, explode, bounce, bigshot, firerate, orbit
- Projectiles have trail rendering, wall bounce physics, impact explosions
- Object pooling for performance

**Phase Jump Dodge (Space):**
- Brief invulnerability window
- Ghost afterimage trail effect
- Cooldown timer with HUD indicator
- Acceleration burst in movement direction

**Summoning Tower (Right Click):**
- Mana sacrifice mechanic — tower duration = mana spent (in seconds)
- Locked mana shown on mana bar
- Channeling ritual circle animation before placement
- Tower auto-targets nearest enemy, fires arcane bolts
- Chain lightning upgrade path
- Limited to 1 summon at a time (upgradeable)

**Enemy AI (5 types):**
- **Slime:** Lunge attack, simple chase AI
- **Skeleton:** Flanking movement, melee attack
- **Skeleton Archer (skelarch):** Ranged AI, fires arrows, maintains distance
- **Armored Skeleton:** Shield mechanic, reduced damage from front
- **Werewolf:** Boss enemy, charge attack, high HP

### 2.4 RPG Systems

**Inventory:** 12-slot backpack, 4 equipment slots (wand, robe, amulet, ring)

**Equipment:** 4 rarity tiers (common, uncommon, rare, epic), 11 stat types with caps, 5 item templates per slot, zone-aware drop rates

**Level-Up:** XP from kills, 15 upgrades across 3 categories (wand/passive/tower), 3-choice card selection per level

**Key Items & Journal:** Story progression keys, readable journal pages, quest tracking

**Grimoire Menu:** 5-tab character menu with status, equipment, key items, quests, minimap

### 2.5 Progression & Zones

Three zones with wave-based combat:
- **Zone 1 "The Undercroft":** 6 rooms (Cell, Corridor, Guard Hall, Corridor 2, Great Hall, Secret Alcove), 4-6 waves
- **Zone 2 "Ruined Tower":** 5 rooms, harder enemies, 4-6 waves
- **Zone 3 "The Spire":** Boss arena, werewolf boss fight, 4 waves

Zone transitions use fade-out → narrative text → fade-in with key requirements.

### 2.6 Save/Load

3 localStorage slots, saves: zone, position, level, XP, inventory, upgrades, key items, wave number. Version field for future migration.

### 2.7 Audio

**Music:** 2-channel crossfade system, separate tracks for menu, cinematic, 4 combat themes, death, victory, plus stings. Duck/pause support.

**SFX:** All procedural via Web Audio API — 22+ distinct sounds including fireball, enemy hurt/death, player hurt/death, dodge, tower, items, cinematic effects. Polyphony control.

### 2.8 Visual Polish

- Isometric depth-sorted rendering with sprite interleaving
- Dynamic torchlight with flickering and fog of war
- Cinematic intro sequence (camera pan, wizard rising, text reveals, SFX cues)
- Screen shake, hit pause, slow-mo on big moments
- Ghost afterimages on dodge
- Particle systems (dust, cast sparks, death particles, impact sparks)
- Custom pixel cursor system (default, pointer, none states)
- Display scaling (reference 1920px width, DPR-aware)

### 2.9 Known Issues & Technical Debt

1. **Monolithic file:** 10,866 lines in one file makes navigation difficult. No module boundaries.
2. **Global state everywhere:** ~50+ top-level mutable variables. No encapsulation.
3. **Hardcoded wizard identity:** The player is assumed to be a wizard throughout — sprite paths, animation names, attack types, UI text all reference "wizard."
4. **No form/class system:** No abstraction for player forms. Changing the player character requires touching dozens of systems.
5. **`drawInventoryUI()` is disabled** (line 9836: `return;` at top) — inventory moved to Grimoire Equipment tab, but the dead code remains.
6. **`drawRoomAmbientTint()` is disabled** (line 7803: function body replaced with comment).
7. **Magic numbers scattered** throughout rendering code (pixel offsets, alpha values, timing constants).
8. **No error boundaries:** If any asset fails to load, the game crashes silently.
9. **`restartGame()` doesn't reload zone** — it resets player to Zone 1 position but doesn't re-generate the dungeon. Chests are manually reset via `openedChests` set.
10. **Save system doesn't persist opened chests** — reopening a save resets all chests.
11. **No autosave** — `getAutoSaveSlot()` exists but is never called automatically.
12. **Collision resolution can push player through walls** in high-velocity edge cases.

---

## 3. Gap Analysis

### 3.1 Systems That Can Be Reused As-Is

| System | Lines | Notes |
|--------|-------|-------|
| Music system | 270–403 | Track crossfade, stings, duck — fully generic |
| SFX engine | 404–674 | Web Audio API foundation — individual sounds will change per form |
| Screen shake / hit pause / slow-mo | 675–740 | Completely form-agnostic |
| Asset loader | 840–946 | `loadImage()` and `loadAssets()` just need new entries |
| Map system (arrays + generation framework) | 949–1170 | Array structure is generic; dungeon layout generators can be extended |
| Zone loading framework | 2055–2318 | `loadZone()` pattern works for any zone |
| Zone transition system | 2320–2500 | Fade transitions are form-agnostic |
| Camera system | 8534–8570 | Smooth lerp follow works for any entity |
| Display scaling | 8962–8988 | Resolution-independent |
| Save/load framework | 10441–10580 | Needs new fields but structure is reusable |
| Main menu + pre-menu | 8990–9243 | Visual presentation is form-agnostic |
| Name entry + load screen | 10580–10778 | Fully reusable |
| Game loop structure | 8577–8960 | Phase routing pattern is extensible |

### 3.2 Systems That Need Modification

| System | Current State | Required Changes |
|--------|--------------|-----------------|
| **Player object** (1456–1523) | Wizard-specific (hp, mana, dodge state) | Abstract into form-based player with per-form stats, abilities, state |
| **Input system** (3682–3995) | Hardcoded wizard controls (fireball, summon, dodge) | Route inputs through form-specific ability handlers |
| **Player update** (4500–4975) | Wizard movement + fireball + dodge + mana | Per-form update functions with different physics and abilities |
| **Player rendering** (4003–4500) | `drawWizard()` with wizard sprites | Per-form `drawPlayer()` dispatching to form-specific renderers |
| **Projectile system** (4976–5498) | Fireball-only | Generalize to support different projectile types per form |
| **HUD** (8192–8436) | HP/Mana/XP bars tuned for wizard | Per-form HUD (slime: no mana bar; skeleton: stamina; wizard: mana; lich: soul energy) |
| **Level-up system** (675–838) | 15 wizard-specific upgrades | Per-form upgrade pools |
| **Inventory & equipment** (1525–2044) | Wizard equipment (wand/robe/amulet/ring) | Gate behind wizard form; other forms have different or no equipment |
| **Grimoire menu** (2543–3611) | Wizard-centric tabs | Adapt tabs per form (slime has no equipment tab, etc.) |
| **Wave system** (5540–5954) | Fixed wave compositions per zone | Per-form difficulty curves and enemy compositions |
| **Enemy definitions** (5498–5540) | 5 types as opponents | Slime and skeleton types need player-form variants |
| **Combat parameters** (3613–3680) | Wizard-tuned | Per-form combat parameter sets |
| **Cinematic intro** (8670–8858) | Wizard awakening narrative | Per-form evolution cinematics |
| **Restart** (10105–10189) | Resets to wizard at Zone 1 | Must account for current form and evolution state |
| **Save/load data** (10453–10558) | Wizard-only fields | Add currentForm, talismanState, evolutionProgress, form-specific data |

### 3.3 Systems That Must Be Built From Scratch

| System | Description | Complexity |
|--------|-------------|------------|
| **Form State Machine** | Manages current form, form-specific stats/abilities, form transitions | HIGH |
| **Evolution Trigger System** | Detects when evolution conditions are met, initiates transformation | MEDIUM |
| **Evolution Cinematic System** | Per-form transformation cutscenes (visual + narrative + SFX) | HIGH |
| **Talisman System** | Persistent artifact with cross-form upgrades, visual presence, UI | MEDIUM |
| **Slime Mechanics** | Absorb, split, bounce, ooze trail, slime-specific physics | HIGH |
| **Skeleton Mechanics** | Bone throw, reassemble, shield bash, stamina system | HIGH |
| **Lich Mechanics** | Soul harvest, undead army, dark magic, soul energy resource | HIGH |
| **Broken Wizard Variant** | Modified wizard with weaker stats, talisman-powered recovery arc | MEDIUM |
| **Per-Form SFX Sets** | New procedural sounds for each form's abilities | MEDIUM |
| **Per-Form Music** | Atmosphere shifts per form (optional — can reuse with modifications) | LOW |
| **Form-Specific Upgrade Pools** | Unique upgrades for slime, skeleton, lich (wizard pool exists) | MEDIUM |
| **Talisman UI** | Visual representation in HUD, grimoire, and world | LOW |

---

## 4. System Design Plan

### 4.1 Form State Machine

```
FormSystem {
    currentForm: 'slime' | 'skeleton' | 'wizard' | 'lich'
    formData: {
        slime:    { absorbed: 0, splitCount: 0, maxSize: 3 ... }
        skeleton: { stamina: 100, boneAmmo: 6, shieldHP: 50 ... }
        wizard:   { mana: 100, spellbook: [...], summons: [...] ... }
        lich:     { soulEnergy: 0, undeadArmy: [...], darkSpells: [...] ... }
    }
    talisman: { level: 1, xp: 0, perks: [...] }
    evolutionProgress: { currentMilestones: {...}, nextForm: '...' }
}
```

**Form switching alters:**
- Sprite set and animation definitions
- Movement physics (slime bounces, skeleton walks, wizard glides, lich floats)
- Available abilities (mapped to same input keys but different actions)
- HUD layout (resource bars, ability icons)
- Upgrade pool
- Combat parameters
- Which Grimoire tabs are available

**Form data persists** — if you evolve from skeleton to wizard, your skeleton stats are frozen. If the game ever allows de-evolution (optional future feature), those stats are still there.

### 4.2 Per-Form Ability Mapping

| Input | Slime | Skeleton | Wizard | Lich |
|-------|-------|----------|--------|------|
| **Left Click** | Acid spit (short range) | Bone throw | Fireball wand | Soul bolt |
| **Right Click** | Split (create decoy) | Shield bash / block | Summon tower | Raise undead |
| **Space** | Bounce jump (high arc) | Roll dodge | Phase jump | Shadow step (teleport) |
| **E** | Absorb (eat small enemy) | Reassemble (heal from bones) | Interact | Soul harvest (drain corpse) |
| **Resource** | Size (grows by absorbing) | Stamina (regens slowly) | Mana (regens, locked by towers) | Soul energy (gained from kills) |

### 4.3 Evolution Triggers

Each evolution has specific conditions — not just "reach level X":

**Slime → Skeleton:**
- Absorb X enemies total (cumulative)
- Reach maximum slime size at least once
- Survive Y waves
- Find the first talisman fragment (key item)
- Narrative: The slime absorbs a fallen skeleton and the talisman resonates, triggering bone-formation

**Skeleton → Broken Wizard:**
- Collect all bone fragments (key items scattered in skeleton zones)
- Defeat a mini-boss skeleton champion
- The talisman reaches level 2 (charged by kills + exploration)
- Narrative: The skeleton discovers a wizard's broken staff — the talisman fuses with it, and magical awareness floods in

**Broken Wizard → Lich:**
- Master all wizard spell schools (unlock at least 1 upgrade from each category)
- Complete a ritual requiring specific key items
- The talisman reaches level 3
- Narrative: The wizard embraces the darkness, the talisman cracks open to reveal its true power — undeath

### 4.4 Talisman System

The talisman is a **permanent item** that exists outside the inventory system. It has its own UI element (always visible in the HUD corner) and its own progression:

**Talisman Properties:**
- Level (1–5, increases through evolution milestones + specific actions)
- XP (earned from all combat across all forms)
- Perks (passive bonuses that work in ALL forms): bonus HP%, damage%, speed%, XP gain%
- Visual glow intensity scales with level

**Talisman in HUD:** Small icon in top-right corner, subtle pulse, click to inspect in Grimoire.

**Talisman in Grimoire:** Dedicated tab (replaces or adds to existing tabs) showing: talisman level, XP progress, active perks, lore text, evolution history.

**Talisman in World:** Rendered as a floating orbiting artifact near the player character in all forms. Subtle visual — doesn't clutter combat.

### 4.5 Slime Form — Detailed Design

**Movement:** Bouncy physics — the slime doesn't walk, it bounces/oozes. Higher acceleration, lower max speed, slight "squash and stretch" on landing. No precision movement — slimes are clumsy.

**Size Mechanic:** The slime grows by absorbing defeated enemies. Size 1 (start) → Size 5 (maximum). Larger size = more HP, more damage, but slower and bigger hitbox. Size decays slowly if not absorbing. Getting hit knocks size down.

**Abilities:**
- **Acid Spit (LMB):** Short-range projectile, leaves acid puddle on ground that damages enemies over time. Range and damage scale with size.
- **Split (RMB):** At size 3+, the slime can split into 2 smaller slimes. The AI-controlled clone attacks enemies for a duration, then expires. The player controls the main slime at reduced size.
- **Bounce Jump (Space):** High arc jump — goes over enemies and obstacles. Deals landing damage based on size. Short cooldown.
- **Absorb (E):** When near a very low HP enemy, the slime can absorb it. Instant kill + size increase + small heal.

**Enemies during Slime phase:** Only other slimes and weak dungeon creatures. No skeletons or wizards yet — the player IS the lowest creature. The dungeon feels huge and threatening.

**Upgrades (Slime pool):**
1. Acid Potency — spit deals more damage + larger puddle
2. Elastic Body — bounce higher, deal more landing damage
3. Rapid Mitosis — split clone lasts longer
4. Iron Stomach — absorb faster, gain more size
5. Ooze Trail — leave damaging trail when moving at size 4+
6. Regenerative Gel — passive HP regen scales with size
7. Acid Rain — spit arcs upward, rains down on area (AoE upgrade)
8. Hive Mind — can have 2 split clones simultaneously

### 4.6 Skeleton Form — Detailed Design

**Movement:** Normal walking speed (similar to current wizard but slightly faster). Skeleton has a stamina bar that depletes with heavy actions and regens over time.

**Abilities:**
- **Bone Throw (LMB):** Ranged attack — throws bones at cursor. Limited ammo (6 bones, regenerate over time). Bones can ricochet off walls once.
- **Shield Bash (RMB):** Brief shield raise that blocks incoming damage + pushes nearby enemies back. Costs stamina.
- **Roll Dodge (Space):** Quick roll in movement direction. Brief invulnerability. Costs stamina. Faster than wizard phase jump but shorter range.
- **Reassemble (E):** Heal by collecting bone fragments dropped by defeated skeleton enemies. Context-sensitive — only works near bone pickups.

**Enemies during Skeleton phase:** Other skeletons (including armored variants), plus slimes. The player is now mid-tier in the dungeon hierarchy. Skeleton archers and armored skeletons are tougher peers.

**Upgrades (Skeleton pool):**
1. Bone Barrage — throw 2 bones simultaneously
2. Calcium Fortification — +max HP, +shield HP
3. Quick Recovery — stamina regens faster
4. Bone Boomerang — thrown bones return to player
5. Shrapnel Shield — shield bash sends bone fragments outward
6. Undying Resolve — survive lethal hit once per zone (1 HP)
7. Marrow Leech — bone hits steal small HP
8. War Cry — periodic AoE fear effect that stuns nearby enemies

### 4.7 Wizard (Broken) Form — Detailed Design

This is largely the **current game** but with a narrative wrapper. The wizard starts "broken" — reduced stats, limited spell access. The talisman gradually restores power.

**Key differences from current wizard:**
- Starts with 60% of normal HP and mana
- Only 1 fireball projectile (no multishot at start)
- No summoning tower initially — unlocked at talisman level 2.5
- Phase jump has longer cooldown initially
- Equipment system becomes available (current inventory system)
- As talisman levels up during this phase, stats gradually increase to full

**The existing 15 upgrade pool works here**, but the first few levels feel like "recovering" lost power rather than gaining new power. Narratively, this is the wizard remembering who they were.

### 4.8 Lich Form — Detailed Design

**Movement:** Floating/hovering — the lich doesn't touch the ground. Smooth gliding movement. Highest base speed of all forms.

**Soul Energy:** Replaces mana. Does NOT regenerate passively. Gained ONLY from killing enemies and harvesting corpses. This creates aggressive playstyle — you must kill to fuel your abilities.

**Abilities:**
- **Soul Bolt (LMB):** Long-range dark magic projectile. Passes through enemies (innate pierce). Costs soul energy.
- **Raise Undead (RMB):** Target a corpse — raise it as a temporary undead ally. The raised undead fights for you. Up to 3 undead minions. Costs soul energy.
- **Shadow Step (Space):** Short-range teleport to cursor position. Leaves a damaging dark cloud at origin point. Costs soul energy.
- **Soul Harvest (E):** Channel on a corpse to gain a large burst of soul energy. Takes time — vulnerable during channel.

**Enemies during Lich phase:** All enemy types including new "holy" enemies that resist dark magic. Boss encounters with other liches or necromancers. The player is now the apex predator — but enemies scale to match.

**Upgrades (Lich pool):**
1. Soul Siphon — kills generate more soul energy
2. Necrotic Blast — soul bolt explodes on final hit
3. Army of the Dead — raise up to 5 undead simultaneously
4. Spectral Cloak — brief invisibility after shadow step
5. Life Tap — convert HP to soul energy (emergency fuel)
6. Death Aura — passive damage to nearby enemies
7. Corpse Explosion — detonate corpses/undead for AoE damage
8. Phylactery — on death, revive at 30% HP once per zone (lich's version of undying)

---

## 5. Asset Plan

### 5.1 Available Assets in Project Folder

| Asset Pack | Contents | Used For |
|-----------|----------|----------|
| Tiny RPG Character Asset Pack v1.03b | 20 characters @ 100x100 including **Slime** (7 anims), **Skeleton** (7 anims), **Wizard** (6 anims) | Player forms (slime, skeleton, wizard) + enemies |
| Isometric Miniature Dungeon (2.3) | 256x512 dungeon tiles | All zone floor/wall/prop rendering |
| Isometric Medieval Town | Town tiles | Potential lich throne zone or hub area |
| Isometric Nature | Nature tiles | Outdoor zones (potential skeleton wilderness area) |
| Isometric Blocks | Abstract/voxel tiles | UI elements, special zones |
| Isometric Tower Defense | Tower sprites | Wizard summoning system (currently used) |
| Fantasy UI Borders | Panel borders, dividers | Menu/grimoire UI (currently used) |
| Free - Raven Fantasy Icons | Item icons 16x16, 32x32, 64x64 | Inventory items (currently used) |
| Cursor Pixel Pack | Custom cursors | Cursor system (currently used) |
| Super Asset Bundle #5 | UI bars, holders, tabs, buttons, item icons | HUD elements |
| Pixel Fantasy 30 Tracks | Menu, cinematic, combat1-4, death, victory, stings | All game music (currently used) |
| Impact Sounds + UI Audio | Audio packs | SFX layering |
| Humble Gift v1.3 | Additional art (PNG + Aseprite) | Supplementary sprites |

### 5.2 Per-Form Asset Requirements

#### Slime Form

| Asset | Status | Source | Notes |
|-------|--------|--------|-------|
| Slime idle animation | **EXISTS** | Tiny RPG → Slime/Idle | 100x100, currently used as enemy |
| Slime walk animation | **EXISTS** | Tiny RPG → Slime/Walk | Same sprite set |
| Slime attack animations | **EXISTS** | Tiny RPG → Slime/Attack01, Attack02 | Acid spit visual |
| Slime hurt animation | **EXISTS** | Tiny RPG → Slime/Hurt | |
| Slime death animation | **EXISTS** | Tiny RPG → Slime/Death | Used for enemy death, reusable |
| Acid spit projectile | **BUILD** | Procedural (Canvas) | Green/acid-colored fireball variant |
| Acid puddle ground effect | **BUILD** | Procedural (Canvas) | Animated ground decal |
| Size scaling | **MODIFY** | Scale existing sprites | Draw at 0.8x–1.8x based on size level |
| Split clone visual | **MODIFY** | Tint existing slime sprite | Translucent duplicate |
| Bounce jump arc effect | **BUILD** | Procedural (Canvas) | Shadow on ground + squash/stretch |
| Absorb VFX | **BUILD** | Procedural (Canvas) | Enemy shrinking into slime |
| Slime HUD elements | **BUILD** | Procedural (Canvas) | Size meter instead of mana bar |

#### Skeleton Form

| Asset | Status | Source | Notes |
|-------|--------|--------|-------|
| Skeleton idle animation | **EXISTS** | Tiny RPG → Skeleton/Idle | 100x100, currently used as enemy |
| Skeleton walk animation | **EXISTS** | Tiny RPG → Skeleton/Walk | |
| Skeleton attack animations | **EXISTS** | Tiny RPG → Skeleton/Attack01, Attack02 | Bone throw visual |
| Skeleton block animation | **EXISTS** | Tiny RPG → Skeleton/Block | Shield bash visual |
| Skeleton hurt animation | **EXISTS** | Tiny RPG → Skeleton/Hurt | |
| Skeleton death animation | **EXISTS** | Tiny RPG → Skeleton/Death | |
| Bone projectile | **BUILD** | Procedural (Canvas) | Small white bone shape |
| Shield effect | **BUILD** | Procedural (Canvas) | Brief translucent shield overlay |
| Roll dodge trail | **MODIFY** | Adapt ghost afterimage system | Bone-colored afterimages |
| Bone fragment pickups | **BUILD** | Procedural (Canvas) | Small bone shapes on ground |
| Stamina bar HUD | **MODIFY** | Adapt mana bar | Yellow/green color, same layout |
| Reassemble VFX | **BUILD** | Procedural (Canvas) | Bones flying toward player |

#### Wizard (Broken) Form

| Asset | Status | Source | Notes |
|-------|--------|--------|-------|
| Wizard all animations | **EXISTS** | Tiny RPG → Wizard/* | Currently the player character |
| Fireball projectile | **EXISTS** | Current implementation | Fully built |
| Phase jump effects | **EXISTS** | Current ghost afterimages | Fully built |
| Tower summon assets | **EXISTS** | Isometric Tower Defense + procedural | Fully built |
| All wizard HUD | **EXISTS** | Current HP/mana/XP bars | Fully built |
| "Broken" visual modifier | **BUILD** | Procedural (Canvas) | Darker tint, occasional flicker, cracked staff glow |
| Stat recovery VFX | **BUILD** | Procedural (Canvas) | Talisman pulse when stats increase |

#### Lich Form

| Asset | Status | Source | Notes |
|-------|--------|--------|-------|
| Lich character sprite | **NEEDED** | Options below | No lich in Tiny RPG pack |
| Soul bolt projectile | **BUILD** | Procedural (Canvas) | Dark purple/black fireball variant |
| Raise undead VFX | **BUILD** | Procedural (Canvas) | Dark circle + skeleton rising |
| Shadow step VFX | **BUILD** | Procedural (Canvas) | Dark cloud burst + reappear |
| Soul harvest VFX | **BUILD** | Procedural (Canvas) | Soul wisps flowing from corpse to player |
| Undead minion sprites | **MODIFY** | Tint existing skeleton sprites | Dark/ghostly tint |
| Soul energy bar HUD | **MODIFY** | Adapt mana bar | Purple/dark color, drains instead of regens |
| Dark aura effect | **BUILD** | Procedural (Canvas) | Pulsing dark circle around player |
| Floating/hover movement | **BUILD** | Procedural (Canvas) | Ground shadow + bob animation |

**Lich Sprite Options:**
1. **Modify the Wizard sprite** — add dark tint, glowing eyes, tattered robe effect via procedural Canvas overlays. Simplest, maintains art consistency.
2. **Use the Priest sprite** from Tiny RPG pack with dark tint — similar silhouette, different feel.
3. **Commission or find a lich sprite** — best quality but requires external sourcing.
4. **Pure procedural rendering** — draw the lich entirely with Canvas. High effort but complete creative control.

**Recommendation:** Option 1 (modified Wizard sprite) for initial implementation. The "broken wizard → lich" evolution is visually communicated by progressively darkening the wizard sprite and adding procedural effects (floating particles, dark aura, glowing eye overlay, tattered cloak edges). This is consistent with the existing approach of heavy procedural VFX layered on sprite bases.

#### Talisman (All Forms)

| Asset | Status | Source | Notes |
|-------|--------|--------|-------|
| Talisman world sprite | **BUILD** | Procedural (Canvas) | Small glowing orbiting diamond shape |
| Talisman HUD icon | **BUILD** | Procedural (Canvas) | Corner icon with pulse effect |
| Talisman grimoire art | **BUILD** | Procedural (Canvas) | Larger detailed version in menu |
| Talisman evolution VFX | **BUILD** | Procedural (Canvas) | Dramatic glow + particle burst on level up |

### 5.3 Asset Summary

| Category | Exists | Modify | Build New | Total |
|----------|--------|--------|-----------|-------|
| Slime Form | 6 | 2 | 5 | 13 |
| Skeleton Form | 6 | 2 | 4 | 12 |
| Wizard Form | 6 | 0 | 2 | 8 |
| Lich Form | 0 | 2 | 7 | 9 |
| Talisman | 0 | 0 | 4 | 4 |
| **Total** | **18** | **6** | **22** | **46** |

The heavy use of procedural Canvas rendering (current game already does this extensively) means most "Build New" items are code, not external art files.

---

## 6. Implementation Roadmap

### Phase 0: Stabilize & Refactor (Estimated: 2–3 sessions)

**Goal:** Prepare the codebase for the form system without changing gameplay.

**Tasks:**
1. Extract the player object into an abstraction layer — create a `PlayerForm` interface pattern with `update()`, `draw()`, `getAbilities()`, `getHUD()` methods
2. Create a `FormSystem` manager that wraps the current wizard-specific code
3. Move wizard-specific constants into a `WIZARD_FORM` config object
4. Abstract the input system to route through form-specific ability handlers instead of directly calling `spawnFireball()` etc.
5. Abstract `drawWizard()` into `drawPlayer()` that dispatches to the active form's renderer
6. Add `currentForm` to save/load serialization
7. Clean up dead code (`drawInventoryUI` return, `drawRoomAmbientTint` empty body)
8. Fix `restartGame()` to properly reload zones

**Testable outcome:** Game plays exactly as before, but internally the wizard is running through the form abstraction layer.

### Phase 1: Form System Foundation + Talisman (Estimated: 2–3 sessions)

**Goal:** Build the form switching infrastructure and talisman.

**Tasks:**
1. Implement `FormSystem` state machine with `switchForm()`, `getCurrentForm()`, `getFormData()`
2. Build talisman data model (level, xp, perks) and persistence
3. Add talisman to HUD (corner icon with glow)
4. Add talisman tab to Grimoire menu
5. Implement evolution trigger detection system (milestone checking)
6. Build evolution cinematic framework (reuse cinematic system patterns from intro)
7. Add form-specific upgrade pool routing
8. Add form-specific HUD routing

**Testable outcome:** Can manually trigger form switches via debug key. Talisman appears in HUD and Grimoire. Evolution cinematics play.

### Phase 2: Slime Form (Estimated: 3–4 sessions)

**Goal:** Build the complete slime experience as the game's opening.

**Tasks:**
1. Implement slime movement physics (bouncy, squash/stretch)
2. Build slime renderer using existing Slime sprites + procedural size scaling
3. Implement acid spit (LMB) — projectile + ground puddle DOT
4. Implement split (RMB) — AI-controlled clone
5. Implement bounce jump (Space) — arc physics + landing damage
6. Implement absorb (E) — enemy consumption + size growth
7. Build size mechanic (growth, decay, visual scaling, stat scaling)
8. Create slime-specific HUD (size meter replacing mana bar)
9. Create slime upgrade pool (8 upgrades)
10. Design slime-phase zones and wave compositions (weak enemies only)
11. Build slime→skeleton evolution trigger and cinematic
12. Implement slime-specific SFX (squelch, acid sizzle, bounce impact, absorb gulp)

**Testable outcome:** Complete slime playthrough from start to skeleton evolution. All slime abilities work. Talisman progresses.

### Phase 3: Skeleton Form (Estimated: 3–4 sessions)

**Goal:** Build the complete skeleton experience.

**Tasks:**
1. Implement skeleton movement (standard walk + stamina system)
2. Build skeleton renderer using existing Skeleton sprites
3. Implement bone throw (LMB) — limited ammo + ricochet
4. Implement shield bash (RMB) — block + pushback
5. Implement roll dodge (Space) — stamina cost + brief invuln
6. Implement reassemble (E) — bone pickup healing
7. Build stamina system (depletion, regeneration, UI bar)
8. Create skeleton-specific HUD (stamina bar)
9. Create skeleton upgrade pool (8 upgrades)
10. Design skeleton-phase zones and wave compositions (skeleton peers + slimes)
11. Build skeleton→wizard evolution trigger and cinematic
12. Implement skeleton-specific SFX (bone rattle, throw whoosh, shield clang, bone crunch)

**Testable outcome:** Complete skeleton playthrough from evolution to wizard transformation. All skeleton abilities work. Talisman continues progressing.

### Phase 4: Wizard RPG Refactor (Estimated: 1–2 sessions)

**Goal:** Adapt the existing wizard gameplay into the "broken wizard" narrative.

**Tasks:**
1. Implement "broken" wizard modifier — reduced starting stats that scale up with talisman level
2. Add visual "broken" effects (darker tint, flicker, cracked staff glow)
3. Gate equipment system behind wizard form (other forms have no equipment)
4. Gate summoning tower behind talisman level 2.5
5. Adjust wizard upgrade pool to feel like "recovery" at early levels
6. Build wizard→lich evolution trigger and cinematic
7. Ensure all current wizard features work through form abstraction
8. Add new wizard-phase SFX for talisman-powered moments

**Testable outcome:** Wizard phase plays with the "recovery" arc. Stats start low and improve. Evolution to lich triggers correctly.

### Phase 5: Lich Form (Estimated: 3–4 sessions)

**Goal:** Build the endgame lich experience.

**Tasks:**
1. Implement lich movement (floating/hovering, ground shadow + bob)
2. Build lich renderer (modified wizard sprite with dark VFX overlays)
3. Implement soul bolt (LMB) — piercing dark projectile
4. Implement raise undead (RMB) — corpse targeting + minion AI
5. Implement shadow step (Space) — teleport + dark cloud
6. Implement soul harvest (E) — channel on corpses for energy
7. Build soul energy system (no passive regen, gained from kills/harvest)
8. Create lich-specific HUD (soul energy bar)
9. Create lich upgrade pool (8 upgrades)
10. Design lich-phase zones and wave compositions (all enemies + holy enemies)
11. Implement undead minion AI (reuse enemy AI patterns with allied targeting)
12. Implement lich-specific SFX (dark magic hum, soul drain, undead moan, shadow whisper)
13. Build final boss encounter or victory condition

**Testable outcome:** Complete lich playthrough. Endgame content works. Full evolution chain is playable start to finish.

### Phase 6: Polish & Integration (Estimated: 2–3 sessions)

**Goal:** Full playthrough polish, bug fixing, balance tuning.

**Tasks:**
1. Full playthrough testing — slime → skeleton → wizard → lich
2. Balance pass on all forms (HP, damage, ability costs, enemy difficulty)
3. Balance talisman progression curve
4. Polish evolution cinematics (timing, VFX, narrative text)
5. Add autosave at evolution milestones
6. Polish form-specific Grimoire tabs
7. Save/load testing across all forms
8. Performance profiling (ensure form switching doesn't cause frame drops)
9. Menu subtitle update ("The Awakening" → "The Evolution" or similar)
10. Final SFX and music pass (ensure transitions between form themes are smooth)

**Testable outcome:** Complete game playable from main menu through all four forms to victory. Polished, balanced, bug-free.

---

## Estimated Total: 16–23 sessions

Each "session" represents a focused development period (likely 1 Cowork conversation per session, assuming deep focus work).

**Critical path:** Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6

Phases 2–5 could theoretically be reordered, but the narrative flow (slime → skeleton → wizard → lich) should be built in sequence to ensure the evolution chain works end-to-end.

---

## Approval Checkpoint

This document is ready for review. **No code will be written or modified until this plan is approved.**

Questions to consider before approval:
1. Does the evolution path (Slime → Skeleton → Wizard → Lich) feel right? Any form you'd swap or add?
2. Are the per-form abilities aligned with your vision? Any ability you'd change?
3. Is the talisman system (persistent cross-form artifact) what you had in mind?
4. Are the evolution triggers (milestone-based, not just level) the right approach?
5. Should Phase 0 (refactor) be more or less aggressive?
6. Any specific enemy types or boss encounters you want in specific phases?
7. The lich sprite: modified wizard (Option 1) or different approach?

**Awaiting your go/no-go, Armin.**
