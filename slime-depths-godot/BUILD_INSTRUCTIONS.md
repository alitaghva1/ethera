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

# Full audit (29 tests)
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
         test_iter240_modal_polish; do
    godot --headless --script "tests/$t.gd"
done
```

All 29 should print PASS / OK.

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
                   tests/test_iter240_modal_polish; do
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
