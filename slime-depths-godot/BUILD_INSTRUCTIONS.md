# Ethera — Build & Release Instructions

For the user when ready to ship to Steam / itch.io.

## Prerequisites

- Godot 4.6.2-stable (the build version in `project.godot`)
- Export templates installed via Godot editor: Editor → Manage Export Templates
- Steam SDK (for Steamworks integration — only when integrating Steam features)

## Local development build

```bash
# Verify the project parses cleanly
godot --headless --script tests/check_main_loads.gd
godot --headless --script tests/check_all_scenes_load.gd

# Full audit (46 tests — 35 baseline + 3 added by iter-248..250
# combat redesign + 1 added by iter-254 room shape variety + 1 added by
# iter-255 atmospheric density push + 1 added by iter-256 destructibles
# / secret walls + 1 added by iter-257 enemy death decals + 1 added by
# iter-258 music dynamics + 1 added by iter-259 VS-style level-up boons
# + 1 added by iter-260 unified reward economy (30-boon catalog +
# tier-weighted roll + room reward identity).
# Combat redesign removes parry input, adds sword 3-hit combo, blast
# windup commitment, and perfect-dodge mechanic. See
# ETHERA_COMBAT_DESIGN.md. Wave 5A iter-254 re-authors room_04 as RING
# and room_06 as MULTI-CHAMBER to add geometric variety. Wave 4
# iter-255 doubles ambient mote density, adds per-biome accent
# emitters, applies BIOME_DARKNESS_MULTIPLIER, and bumps torch + hero
# rim light to push high-contrast atmosphere. Wave 5B+5C iter-256
# makes pillars / lanterns / sarcophagi destructible via hero sword
# Hit 3 + dash-strike pierce, projectile blast (lanterns only), and
# adds a 30%/room secret crackable wall that awards 30 ether shards.
# Wave 6 iter-257 leaves persistent kind-specific corpse decals when an
# enemy dies. Wave 7 iter-258 adds Hades-style reactive music dynamics
# — single biome OGG feels calm between waves and intense during combat
# via volume + low-pass cutoff modulation on a dedicated Music bus.
# Wave 8 iter-259 REPLACES the iter-246 silent mid-room pedestal spawn
# with a VS-style pause-the-game, pick-one-of-three boon modal. Wave 9
# iter-260 GRADUATES the boon catalog from 15 flat stat sticks into a
# 30-entry roster across 3 tiers (15 common + 10 rare proc-mechanics +
# 5 legendary mechanic-shifter aspects), wires has_boon/proc hooks for
# the 10 rare + 5 legendary mechanics, adds modal polish (tier border
# color, tier label, theme glyph, build-match halo), introduces a
# room_type field + visible icon, retags room_03 as gauntlet, and
# implements theme-biased + tier-ramped roll logic.)
for t in check_main_loads check_all_scenes_load test_iter212_kindle \
         test_iter213_actives test_iter214_modifiers test_iter215_combos \
         test_iter216_dag test_iter218_save_migration \
         test_iter224_defensive_guards test_iter225_polish \
         test_iter226_currency_relics test_iter227_pact_altar \
         test_iter228_boss_phases test_iter228_relic_stacking \
         test_iter229_polish test_iter230_bulwark \
         test_iter231_reaction_web test_iter232_migration_v6_v8 \
         test_iter232_upgrade_tree test_iter232_achievements \
         test_iter233_hero_status_chips test_iter234_moth \
         test_iter235_cursed_pickup test_iter236_enemy_snapshot \
         test_iter236_save_roundtrip test_iter237_polish \
         test_iter238_tuskbrod test_iter239_floor_modifiers \
         test_iter240_modal_polish test_iter241_modifier_modal \
         test_iter242_soul_gem test_iter242_loop_constants \
         test_iter243_phase1_feel test_iter244_phase2_visual \
         test_iter245_phase3_hud test_iter246_phase4_juice \
         test_iter248_combo test_iter249_blast_windup \
         test_iter250_perfect_dodge test_iter254_room_shapes \
         test_iter255_atmospheric_density test_iter256_destructibles \
         test_iter257_death_decals test_iter258_music_dynamics \
         test_iter259_level_up_boons test_iter260_unified_rewards; do
    godot --headless --script "tests/$t.gd"
done
```

All 46 should print PASS / OK. (The 40th test for "BACKDRAFT migration"
is folded into test_iter250_perfect_dodge's `BACKDRAFT trigger wired
from perfect-dodge` assertion — no separate file needed since the
function is unchanged; only the caller moved.)

## Export presets (set up in Godot editor)

1. **Windows Desktop** — target `dist/win/ethera.exe`
2. **macOS** — target `dist/mac/ethera.app` (requires notarization for Steam)
3. **Linux/X11** — target `dist/linux/ethera.x86_64`

For each:
- Project → Export → Add Preset
- Set Architecture: x86_64
- Embed PCK: ON (single-file release)
- Set application icon (TBD asset)

## Steam Early Access checklist

Per Valve's seven EA rules:

- [ ] Steam Early Access tag enabled on store page
- [ ] Trailer uploaded (gameplay, not concept video)
- [ ] Store page description avoids specific date promises
- [ ] "What's in / What's not in" section honest about current state
  (use `STEAM_STORE_PAGE.md` text)
- [ ] EA branding visible in builds shipped to keys
- [ ] Parity pricing across platforms
- [ ] No permanent discounts on EA
- [ ] Update cadence committed (≥quarterly recommended)

Steam Cloud / Achievements integration (optional for EA launch):

- [ ] Add `steam_appid.txt` to project root (Steam SDK requirement)
- [ ] Wire 12 in-game achievements to Steam achievement IDs (1:1 map
      to `GameState.ACHIEVEMENTS` keys)
- [ ] Wire `user://ethera_save.json` to Steam Cloud auto-sync

## itch.io alternative path (faster, lower-friction)

If Steam appid is not yet provisioned:

1. Export Windows + Mac + Linux builds
2. Upload to itch.io as a Free / Pay-what-you-want / Fixed-price game
3. Use the same `STEAM_STORE_PAGE.md` body text (adapt copy)
4. Pull telemetry / feedback via itch.io's comment system + a Discord
5. Migrate save data when Steam launches: store `user://ethera_save.json`
   in a known location; Steam build can detect + migrate the itch save.

## Build version bookkeeping

When shipping a build:

1. Bump `SAVE_VERSION_CURRENT` if save schema changes (and add a
   `_migrate_save_dict` step)
2. Tag the git commit: `git tag -a v0.5.0-ea -m "EA milestone N"`
3. Update `ETHERA_STATE.md` snapshot date + commit hash
4. Update `BETA_ROADMAP.md` to reflect what shipped

## Continuous-integration recommendation

Pre-shipping, set up a GitHub Action that runs the 8 audit tests on
every push. Sample workflow stub:

```yaml
# .github/workflows/audit.yml
on: [push, pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: chickensoft-games/setup-godot@v2
        with:
          version: 4.6.2-stable
          use-dotnet: false
      - run: |
          cd slime-depths-godot
          for t in tests/check_main_loads tests/check_all_scenes_load \
                   tests/test_iter212_kindle tests/test_iter213_actives \
                   tests/test_iter214_modifiers tests/test_iter215_combos \
                   tests/test_iter216_dag tests/test_iter218_save_migration \
                   tests/test_iter224_defensive_guards tests/test_iter225_polish \
                   tests/test_iter226_currency_relics tests/test_iter227_pact_altar \
                   tests/test_iter228_boss_phases tests/test_iter228_relic_stacking \
                   tests/test_iter229_polish tests/test_iter230_bulwark \
                   tests/test_iter231_reaction_web tests/test_iter232_migration_v6_v8 \
                   tests/test_iter232_upgrade_tree tests/test_iter232_achievements \
                   tests/test_iter233_hero_status_chips tests/test_iter234_moth \
                   tests/test_iter235_cursed_pickup tests/test_iter236_enemy_snapshot \
                   tests/test_iter236_save_roundtrip tests/test_iter237_polish \
                   tests/test_iter238_tuskbrod tests/test_iter239_floor_modifiers \
                   tests/test_iter240_modal_polish tests/test_iter241_modifier_modal \
                   tests/test_iter242_soul_gem tests/test_iter242_loop_constants \
                   tests/test_iter243_phase1_feel tests/test_iter244_phase2_visual \
                   tests/test_iter245_phase3_hud tests/test_iter246_phase4_juice \
                   tests/test_iter248_combo tests/test_iter249_blast_windup \
                   tests/test_iter250_perfect_dodge; do
              godot --headless --script "$t.gd" || exit 1
          done
```

## Post-release content cadence

Per BETA_ROADMAP.md, content milestones AFTER EA launch:
- M6 — Floor 4 biome + boss
- M7 — Fusion system port from web prototype
- M8 — ~~Charger enemy archetype~~ (shipped iter-238 as Tuskbrod — shield/flying/charger trio complete; M8 → pick the next archetype gap)
- M9 — Prop art pass (chest / door / pedestal / shrine sprites)
- M10 — Hub NPC system (8 hamlet characters)

Each is a separate ~2-week sprint.
