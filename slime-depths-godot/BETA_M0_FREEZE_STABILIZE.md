# Beta Milestone 0 — Freeze & Stabilize

**Rationale**: The architecture audit (2026-05-20) identified that the
codebase still lands a `fix` commit every 4-5 feature iters, with several
direct regressions of the prior 1-2 iters. Before adding the M1 meta-
progression wrapper, we need ONE sprint of zero new features — just
shoring up the foundations so M1 doesn't compound on quicksand.

## Scope: small, focused, no new gameplay

Goal: 6-8 surgical fixes that prevent the most-likely beta-blocker crash
classes and unmaintainable patterns.

## Items

### M0.1 — Save migration foundation (architecture risk #1)

Problem: `save_version: 5` is written but `load_from_dict` never reads
it. Any schema change after release silently drops or corrupts saves.

Fix:
- Add `_migrate(d: Dictionary, from_version: int) -> Dictionary` helper
- Wire into `load_from_dict` as the first step after reading version
- Stub `_migrate` returns the dict unchanged for v1-5 (current state)
- Add `tests/test_save_migration.gd` — round-trips a v3 dict and
  verifies the migrated v5 result has expected shape

Why: M1 introduces NEW save schema (MetaSave + SettingsSave). The
migration path must exist BEFORE M1 lands, or we corrupt every
existing save the first time.

### M0.2 — Boss phase-transition test

Problem: Iron Revenant / Broodmother / Ember Tyrant phase transitions
have zero test coverage. A balance regression here breaks every boss.

Fix:
- `tests/test_boss_phases.gd` — spawn ember_tyrant (or a mock with
  same phase data), drain HP to 64%, assert `enemy_type` swapped to
  phase2 variant. Drain to 29%, assert phase3 swap.

### M0.3 — Shared enemy cache (performance + group-walk dedup)

Problem: `enemy.gd:1131-1152` admits O(n²) separation; `main.gd:743`
walks the enemies group every `_process`; projectile/hero/enemy all
walk the same group dozens of times per frame.

Fix:
- `main.gd` caches `_enemies_snapshot: Array[Node]` refreshed once per
  `_process` tick
- Add helper `_get_enemies_snapshot()` that consumers call
- Update the 8-10 most expensive group walks to read the snapshot
- Add comment: "do not call get_nodes_in_group('enemies') directly;
  use _get_enemies_snapshot()"

Note: keep this surgical — only the hot paths. Don't refactor
everything to async.

### M0.4 — Dead code purge

Problem: `scripts/prototype/*.gd` (4 files, ~33 KB) compiles but is
unreferenced. Stray `boss_snap.png`, `boss_snap2.png`, and a literal
`nul` file at worktree root.

Fix:
- `git rm` the 4 prototype files
- `git rm` the 3 cruft files
- Verify load gate still passes

### M0.5 — `@onready` UI path resilience

Problem: ~20 `@onready var = $UI/Path` in main.gd. If any UI node is
renamed in main.tscn, every consumer crashes silently at runtime.

Fix (cheap version):
- Add a `_validate_onready_uis()` method called in `_ready` that
  pushes a clear `push_error` for any null `@onready` var
- Test panics with a clear message instead of a runtime null-instance
  crash

(Deeper fix — extracting HUD.gd — is M2-or-later work; this is the
"shore up" version.)

### M0.6 — Type-guarded `as Node2D` audit

Problem: `enemy.gd:1145` and a handful of similar sites call
`(e as Node2D).global_position` after weak guards (e.g. `_dying`
check only). Returns null on non-Node2D and crashes.

Fix:
- Grep `as Node2D`, `as Hero`, `as Enemy` — 47 sites
- For each: confirm the preceding line has `node is Node2D` or
  `is_instance_valid(node) and node is Node2D`
- Add the missing guards (or skip continue) where absent

### M0.7 — Relic-stacking sanity test

Problem: `modifier_total_f` summation across 5+ owned relics has no
test. Synergy-critical math.

Fix:
- `tests/test_relic_stacking.gd` — grant 4 relics each adding
  `sword_damage_bonus: 1`, assert `modifier_total("sword_damage_bonus")`
  returns 4. Test float modifiers similarly.

### M0.8 — Stabilize HEAD smoke run

Problem: 31 fix commits in last 200 = average ~1 in 6 commits is a
revert. Need to confirm HEAD is clean.

Fix:
- Run all 7 audit tests
- Headless game run 10s, check for SCRIPT ERROR
- Manual playtest: enter run, clear room 1, claim relic, walk through
  branch door, clear room 2, die. Verify no crashes.
- If any issue surfaces, fix before M0 commit

## Order

M0.1 → M0.4 (cruft purge, low risk) → M0.5 (null-guard) → M0.6 (type-
guard) → M0.7 (relic test) → M0.2 (boss phase test) → M0.3 (enemy
snapshot) → M0.8 (smoke run).

## Deliverable

- Single commit / merged PR titled `chore(godot iter-218): M0 freeze
  + stabilize`
- All 7 existing tests pass + 3 new ones (save_migration, boss_phases,
  relic_stacking, plus the existing 7 = 10 tests green)
- No new features
- Headless smoke run clean
- Ready for M1 meta-progression to layer on top

## Estimated effort

~3-4 sprint days. Smaller than M1.

## What it BUYS us

- Save schema can evolve cleanly into MetaSave + SettingsSave for M1
- Beta-release blocker risk drops materially (the O(n²) and crash-prone
  casts are the most common "shipping a Godot game" gotchas)
- Test framework has real behavior coverage of the highest-risk math
  paths
- 6 weeks of accumulated tech debt cleared before content sprint
