# Ethera — Beta-Readiness Research Findings

Compiled 2026-05-20 from web-research agent pass. Reference document for
the multi-phase beta push.

## Calibration: where Ethera sits on the content axis

| Shipped roguelite | EA launch content | Ethera today |
|-------------------|-------------------|--------------|
| **Slay the Spire** EA | 2 characters, ~75 cards, ~50 relics | 1 class, 53 relics, 4 actives, 4 spell mods, 21 enemies |
| **Hades** EA | 4 weapons, 2 biomes finished, 1 boss | 7 rooms, 4 biomes, 3 bosses |
| **Dead Cells** EA | "30-40% complete," handful of biomes | 7 rooms in linear DAG |
| **BoI** (original) | 196 items, ~50 enemies | 53 relics, 21 enemies |

**Verdict**: Ethera is **above** StS's EA content bar (75 cards × 2 chars)
and roughly at parity with Hades's EA biome count if we count our four
biomes. The gap is **meta-progression wrapper + polish**, not core
content. Don't add more enemies/relics before shipping the wrapper.

## TOP 10 BETA TAKEAWAYS (prioritized for Ethera's situation)

### 1. Meta-progression hub is the #1 missing pillar.
Every successful roguelite ships EA with a hub that converts deaths into
permanent progress.
- Hades: House Contractor + Mirror of Night
- StS: per-character ascension unlocks
- Dead Cells: Collector
Even a **5-node stub** is enough for EA:
- +1 starting HP
- +1 starting dodge charge
- Starting-relic slot
- Starting-gold +N
- Unlockable starting active relic

### 2. Tutorial = scripted first run, not a separate mode.
Hades's first run is rigged: guaranteed Zeus boon, scripted dialog,
training-wheel enemies. Replicate:
- First run drops a known relic (probably IRON FANG — beginner-friendly)
- First elite has dampened HP / damage
- One-shot tooltips on first encounter of each new mechanic

### 3. Accessibility kit is a 2-day sprint.
Reference: The Rogue Prince of Persia (2025 indie gold standard).
Checklist:
- Rebindable inputs (KB+M + controller, with conflict warning)
- Screen-shake intensity slider (default 50%)
- 3 colorblind filters (Deuteranopia / Protanopia / Tritanopia) + high contrast
- Text-scale slider (up to +30%)
- Independent Master / Music / SFX volume sliders
- Motion-reduction toggle (kills camera lerp + parallax)
- Button-prompt visibility toggle

### 4. Save system: Resource-based, TWO files.
- `user://settings.tres` — bindings, volumes, accessibility
- `user://meta.tres` — unlocks, currency, run history
Never co-mingle — corrupt-save reports are the #1 EA review-bomb risk.

### 5. Audio: Sonniss bundle + FMOD-for-Godot.
- **Sonniss GDC Bundle** — annual royalty-free SFX archive (lifetime
  commercial use, no attribution required). Pull every year.
- **FMOD has an official Godot integration** — vertical layering
  (stem mute/unmute on combat-intensity parameter) is the standard
  roguelite music pattern.
- Compose 4 biome themes + 1 boss stinger + 1 hub theme = 5-7 tracks
  is enough for EA.

### 6. Run-recovery is a 2025 table-stake.
If game crashes mid-run, on relaunch prompt "Resume run?". Hades, Dead
Cells, StS all do this. Snapshot one save per room cleared. Reuses
the same save-system pattern as item 4.

### 7. Ship 2 biomes "done" and 2 biomes "in development."
Hades EA model: don't pretend everything is polished. EA tag two biomes
as "more polish coming." Allows ship without art-pass paralysis.

### 8. Steam EA store page: gameplay trailer + honest "what's in / what's not in" box.
Steam's #1 EA rule is "don't promise specifics." Use buckets ("more
biomes / more relics / more classes coming") not dates.

### 9. Pre-EA: get 30 people on a free playtest branch.
Mega Crit's "75 cards is the right balance" came from playtesting, not
theorycrafting. Two weeks of telemetry on per-relic win rates catches
the worst-balanced 5 relics before strangers see them.

### 10. Honest content-bucket disclosure.
Steam now flags titles silent 12+ months as "abandoned." Update store
page on a cadence even if it's just patch notes.

## Reference URLs (vetted)

- [Steamworks Early Access guidelines](https://partner.steamgames.com/doc/store/earlyaccess) — Valve's 7 rules
- [TheGamer: 10 Biggest Changes to Hades Since EA](https://www.thegamer.com/hades-changes-early-access/) — concrete content counts
- [Slay the Spire (Wikipedia)](https://en.wikipedia.org/wiki/Slay_the_Spire) — Mega Crit's EA content target
- [Dead Cells (Wikipedia)](https://en.wikipedia.org/wiki/Dead_Cells) — % completion at EA
- [Godot Docs: Saving games](https://docs.godotengine.org/en/stable/tutorials/io/saving_games.html) — official patterns
- [GDQuest: Saving and Loading in Godot 4](https://www.gdquest.com/library/save_game_godot4/) — Resource-based tutorial
- [Sonniss GDC bundles](https://sonniss.com/gameaudiogdc/) — annual SFX archive
- [Can I Play That: Rogue Prince of Persia accessibility](https://caniplaythat.com/2025/08/21/the-rogue-prince-of-persia-accessibility-details/) — accessibility checklist

## What this means for our roadmap

Don't add **more content** until we add the **wrapper**. Specifically:

**Beta Milestone 1 (M1) — Meta + Saves** (2-3 sprint weeks)
- Resource-based dual-save system
- 5-node Mirror-of-Night-equivalent hub upgrade tree
- Persistent currency carrying over runs
- Run-recovery prompt on crash relaunch

**Beta Milestone 2 (M2) — Accessibility + Settings** (1-2 sprint weeks)
- Rebindable inputs with conflict detection
- Screen-shake slider
- 3 colorblind filters
- Master/Music/SFX volume sliders
- Text-scale + motion-reduction toggles

**Beta Milestone 3 (M3) — Audio Pass** (3-4 sprint weeks, gated on Sonniss + composer)
- Pull Sonniss bundles, integrate FMOD-Godot
- Compose 4 biome themes + boss stinger + hub theme
- Replace placeholder SFX with curated bundle picks
- Wire vertical layering for combat-intensity

**Beta Milestone 4 (M4) — Tutorial + Onboarding** (1 sprint week)
- First-run scripted boons / dampened elite
- One-shot tooltips on first encounter of each verb
- Tutorial state machine extending iter-160

**Beta Milestone 5 (M5) — Steam Page + Marketing** (parallel-track)
- Gameplay trailer
- "what's in / what's not in" buckets
- Press kit
- Free playtest branch via Steamworks

**M1 alone** would move the dial more than 10x what another batch of
combat content would. Wrapper-first.
