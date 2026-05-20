# Beta Milestone 1 — Meta-progression + Save System Design

Pre-implementation design for the Mirror-of-Night-equivalent upgrade
tree, persistent currency, and dual-save Resource files.

## 1. Goals

- Player deaths feel productive — every death banks something toward a
  permanent unlock.
- 5-node minimum upgrade tree (per research, this is enough for EA).
- Save system: two Resource files, never co-mingled. Migration-safe.
- Run-recovery: if game crashes mid-run, "Resume run?" prompt on relaunch.

## 2. Save File Schema

### `user://settings.tres` — accessibility + bindings + audio levels
```gdscript
class_name SettingsSave extends Resource

# Audio
@export var master_volume: float = 1.0
@export var music_volume: float = 0.8
@export var sfx_volume: float = 1.0

# Accessibility
@export var screen_shake_intensity: float = 1.0  # 0.0 = off
@export var motion_reduction: bool = false
@export var colorblind_mode: String = "none"     # "none"|"deuter"|"prota"|"trita"|"highcontrast"
@export var text_scale: float = 1.0              # 1.0 default; up to 1.3
@export var button_prompts_visible: bool = true

# Input bindings (action → list of InputEvent dicts)
@export var input_bindings: Dictionary = {}

# Version (for migration)
@export var save_version: int = 1
```

### `user://meta.tres` — persistent run state
```gdscript
class_name MetaSave extends Resource

# Currency — accumulates from gold drops + clear bonuses, persists at death.
@export var ether_shards: int = 0          # primary currency
@export var ether_lifetime_earned: int = 0 # statistic

# Upgrade tree node levels (key = node_id, value = 0..max_level)
@export var upgrade_levels: Dictionary = {
    "starting_hp": 0,        # 0..3 → +1/+1/+1 starting HP
    "starting_dodge": 0,     # 0..1 → +1 starting dodge charge
    "starting_relic": 0,     # 0..2 → unlock starting relic slot; tier
    "starting_gold": 0,      # 0..2 → +50/+100/+200 starting gold
    "active_relic_slot": 0,  # 0..1 → unlock active-relic auto-claim
}

# Achievements (id → unlock-time-msec, 0 = locked)
@export var achievements: Dictionary = {}

# Run history
@export var total_runs: int = 0
@export var total_deaths: int = 0
@export var total_clears: int = 0
@export var best_run_seconds: float = 0.0

# Crash-recovery snapshot — populated at each room clear, cleared at
# run-end (death or victory). If present at boot, prompt "Resume run?".
@export var crash_recovery: Dictionary = {
    # current_room_index: int
    # owned_relics: Array[String]
    # hp: int
    # gold: int
    # active_relic_cd: float
    # ... etc
}

@export var save_version: int = 1
```

## 3. Upgrade Tree (5 nodes, EA-minimum)

Costs in **Ether Shards**. Drop rates target: median run = 30-50 shards.

| Node | Levels | Cost per level | Effect per level |
|------|--------|----------------|------------------|
| **Resilience** | 0→3 | 50 / 100 / 200 | +1 max HP |
| **Quick Step** | 0→1 | 150 | +1 dodge charge |
| **First Talisman** | 0→2 | 100 / 300 | Unlock starting-relic slot; L2 raises start-relic tier |
| **Tribute** | 0→2 | 60 / 150 | +50 / +200 starting gold |
| **Bound Vow** | 0→1 | 400 | Unlock active-relic slot in hamlet (player picks which active starts bound to [R]) |

Total to max all = **50+100+200 + 150 + 100+300 + 60+150 + 400 = 1510 shards**.
At median 40/run, that's ~38 runs to fully max. Hades takes ~20-40 runs
to first clear; this is in the right zone.

## 4. Ether Shard Drop Rules

- 5 shards per room cleared (35 per max run)
- 10 shards on first kill of each boss (one-time per save)
- 20 shards on first Ember Tyrant clear (one-time per save)
- 1 shard per 25 gold accumulated in run (paid on death/clear)

This means: a player who DIES on floor 3 still earns ~15-20 shards.
A player who CLEARS gets ~50-70.

## 5. Hub Room (minimal version)

Defer the full 8-NPC hamlet — too much for M1. Instead:

- New scene: `scenes/hub.tscn` — single room with 5 carved-stone pillars
  representing the upgrade nodes
- Hero walks up to a pillar → press E to invest
- One Door at east wall: BEGIN RUN

`main_menu.tscn` BEGIN button now routes to `hub.tscn` instead of
directly to `main.tscn`. Hub is the persistent meta-progression space.

Future expansion (post-M1): NPC dialog, oracle prophecies, smith
upgrades, etc.

## 6. Save / Load API

In `scripts/save_system.gd`:

```gdscript
const SETTINGS_PATH := "user://settings.tres"
const META_PATH := "user://meta.tres"

func load_settings() -> SettingsSave: ...
func save_settings(s: SettingsSave) -> void: ...

func load_meta() -> MetaSave: ...
func save_meta(m: MetaSave) -> void: ...

func snapshot_crash_recovery(snapshot: Dictionary) -> void:
    # Called on room clear with current run state
    var m := load_meta()
    m.crash_recovery = snapshot
    save_meta(m)

func has_crash_recovery() -> bool: ...
func consume_crash_recovery() -> Dictionary: ...
func clear_crash_recovery() -> void: ...
```

Migration: on load, check `save_version`. If older, apply per-version
migration step. Always write back with current version.

## 7. UI Surfaces

- **Hub HUD chip**: top-right shows "ETHER ◇ 47" alongside the run-state
  HUD chips (which only render during runs anyway).
- **Hub pillar interact prompt**: when hero is within 96 px of a pillar,
  show a label: "[E] RESILIENCE — invest 50 ◇" (greyed if can't afford).
- **Invest confirmation**: brief flash + +1 to the displayed level on
  the pillar.
- **Main menu Records button**: shows total_runs / total_deaths /
  total_clears / best_run_seconds.

## 8. Crash-recovery prompt

On `main_menu.tscn` _ready, if `SaveSystem.has_crash_recovery()`:
- Show modal: "It looks like your last run ended unexpectedly. Resume?"
- YES → restore snapshot, route to main.tscn at current_room_index
- NO → consume_crash_recovery, route normally

## 9. Test Plan

- `test_meta_save_roundtrip.gd` — write → load → verify fields preserved
- `test_meta_save_migration.gd` — load save_version=0 file, verify
  migration runs cleanly
- `test_crash_recovery.gd` — snapshot, simulate crash, verify recovery
  dict is consumable
- `test_upgrade_invest.gd` — invest ether, verify level + currency change

## 10. Order of Operations

Implementation sequence:
1. Define `SettingsSave` and `MetaSave` Resource classes
2. Write `save_system.gd` load/save/snapshot API
3. Test round-trip
4. Build `hub.tscn` with 5 stone pillars + 1 door
5. Wire `main_menu` BEGIN → `hub` → BEGIN RUN door → `main.tscn`
6. Wire ether shard drops on room clear / boss kill / death
7. Build invest UI (pillar interact)
8. Apply upgrades at hero spawn (read meta.upgrade_levels)
9. Crash-recovery snapshot on each room clear
10. Run-recovery prompt on main menu
11. Tests + ship as iter-218
