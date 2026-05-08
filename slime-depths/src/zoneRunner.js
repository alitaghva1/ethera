// ============================================================================
// ZONE RUNNER — Stand-and-Hold wave state machine.
//
// Owns the per-zone progression:
//   idle           → waiting (initial 1s after zone load)
//   waveActive     → wave N spawned, fighting until enemies array empty
//   waveCleared    → 1.5s breathing room before next wave
//   bossPending    → all waves cleared, 2s dramatic pause, then spawn boss
//   bossActive     → boss fight (single enemy, no respawns)
//   complete       → boss dead, portal spawned, waiting for hero to enter it
//
// The runner is a tick-driven module: caller invokes updateZoneRunner(dt)
// every frame and the runner internally advances. State changes are
// idempotent. Caller queries getZoneRunnerState() to render HUD.
//
// Spawn placement: each enemy spawns at the configured spawnPoints[from[i]]
// position (in tile coords; converted to world px). If that cell is
// blocked by collision, we nudge inward up to 3 cells.
// ============================================================================

import { spawnEnemy, enemies } from './enemies.js';
import { TILE } from './room.js';
import { getZoneEncounters, ZONE_DIFFICULTY } from './zoneEncounters.js';

const STATE_IDLE        = 'idle';
const STATE_WAVE_ACTIVE = 'waveActive';
const STATE_WAVE_CLEAR  = 'waveCleared';
const STATE_BOSS_PEND   = 'bossPending';
const STATE_BOSS_ACTIVE = 'bossActive';
const STATE_COMPLETE    = 'complete';

const FIRST_WAVE_DELAY    = 1.0;     // s after zone load before wave 1
const INTER_WAVE_DELAY    = 1.5;     // s between waves
const PRE_BOSS_DELAY      = 2.2;     // s after final wave before boss arrives

const _runner = {
  zoneName:   null,
  encounters: null,
  state:      STATE_IDLE,
  waveIdx:    0,
  timer:      0,            // counts down toward next state-transition event
  bossEntity: null,         // the boss enemy reference (so we can detect death)
  onComplete: null,         // callback when zone is complete (boss dead + portal entered)
};

/**
 * Begin a zone. Resets the state machine, schedules wave 1 to spawn after
 * FIRST_WAVE_DELAY. Caller should have already loaded the bake + applied
 * the zone profile before this fires.
 */
export function startZoneRun(zoneName, opts = {}) {
  const enc = getZoneEncounters(zoneName);
  if (!enc) {
    console.warn('[zoneRunner] no encounters config for', zoneName);
    return false;
  }
  _runner.zoneName   = zoneName;
  _runner.encounters = enc;
  _runner.state      = STATE_IDLE;
  _runner.waveIdx    = 0;
  _runner.timer      = FIRST_WAVE_DELAY;
  _runner.bossEntity = null;
  _runner.onComplete = opts.onComplete || null;
  return true;
}

/** Stop the runner (e.g. on death / hamlet return).
 *
 * Also clears any global hooks that the run installed (window.__onEnemyKilled).
 * Without this, an aborted zone-run leaves XP-gem drops firing into legacy
 * runs that follow it. Phase 1 stabilization fix B1 — see audit.
 */
export function stopZoneRun() {
  _runner.zoneName   = null;
  _runner.encounters = null;
  _runner.state      = STATE_IDLE;
  _runner.waveIdx    = 0;
  _runner.timer      = 0;
  _runner.bossEntity = null;
  _runner.onComplete = null;
  if (typeof window !== 'undefined' && window.__onEnemyKilled) {
    window.__onEnemyKilled = null;
  }
}

/** Frame tick. Called from main update loop. */
export function updateZoneRunner(dt) {
  if (!_runner.encounters) return;
  _runner.timer -= dt;

  switch (_runner.state) {
    case STATE_IDLE:
      // Wait FIRST_WAVE_DELAY then spawn wave 1.
      if (_runner.timer <= 0) _spawnWave(0);
      break;

    case STATE_WAVE_ACTIVE:
      // Wave is in progress — wait until all enemies dead.
      if (enemies.length === 0) {
        _runner.state = STATE_WAVE_CLEAR;
        _runner.timer = INTER_WAVE_DELAY;
      }
      break;

    case STATE_WAVE_CLEAR:
      // Breather between waves.
      if (_runner.timer <= 0) {
        const nextIdx = _runner.waveIdx + 1;
        if (nextIdx < _runner.encounters.waves.length) {
          _spawnWave(nextIdx);
        } else {
          _runner.state = STATE_BOSS_PEND;
          _runner.timer = PRE_BOSS_DELAY;
        }
      }
      break;

    case STATE_BOSS_PEND:
      // Dramatic pause before boss spawn.
      if (_runner.timer <= 0) _spawnBoss();
      break;

    case STATE_BOSS_ACTIVE: {
      // Wait for boss death (boss is the only enemy in the array).
      const bossDead = _runner.bossEntity
        && (_runner.bossEntity.dead || _runner.bossEntity.hp <= 0);
      const boss = _runner.bossEntity;
      if (bossDead) {
        _runner.state = STATE_COMPLETE;
        _runner.timer = 0;
        const pos = boss ? { x: boss.x, y: boss.y } : null;
        if (_runner.onComplete) _runner.onComplete({ bossPos: pos });
      } else if (enemies.length === 0) {
        // Defensive: if the boss got removed without our death-flag detection
        // (cleanup paths), still mark complete. Use last-known boss pos.
        _runner.state = STATE_COMPLETE;
        _runner.timer = 0;
        const pos = boss ? { x: boss.x, y: boss.y } : null;
        if (_runner.onComplete) _runner.onComplete({ bossPos: pos });
      }
      break;
    }

    case STATE_COMPLETE:
      // Idle. Caller listens for portal entry.
      break;
  }
}

function _spawnWave(idx) {
  const enc = _runner.encounters;
  const wave = enc.waves[idx];
  if (!wave) return;
  _runner.waveIdx = idx;
  _runner.state   = STATE_WAVE_ACTIVE;

  // Phase 5 — apply per-zone difficulty multipliers. Each spawn carries
  // the zone's hpMul + damageMul so cemetery enemies are tougher than
  // ruins enemies, etc. Curves to ~2.2× HP / 1.6× dmg by volcano.
  const diff = ZONE_DIFFICULTY[_runner.zoneName] || { hpMul: 1, damageMul: 1 };

  for (let i = 0; i < wave.types.length; i++) {
    const type = wave.types[i];
    const fromIdx = wave.from[i % wave.from.length] || 0;
    const sp = enc.spawnPoints[fromIdx] || enc.spawnPoints[0];
    const wx = (sp.x + 0.5) * TILE;
    const wy = (sp.y + 0.5) * TILE;
    const elite = !!(wave.eliteIdx && wave.eliteIdx.includes(i));
    const opts = {
      hpMul: diff.hpMul,
      damageMul: diff.damageMul,
    };
    if (elite) opts.elite = true;
    spawnEnemy(type, wx, wy, opts);
  }
}

function _spawnBoss() {
  const enc = _runner.encounters;
  const sp = enc.bossLocation;
  const wx = (sp.x + 0.5) * TILE;
  const wy = (sp.y + 0.5) * TILE;
  // Phase 4 — pass through optional `bossOpts` (affix / hpMul / damageMul)
  // so each zone's boss feels distinct even when sharing a sprite. The
  // cemetery's GRAVE WARDEN is a frost-affixed variant of the same
  // bone_captain model used by the crypt's IRON REVENANT, etc.
  // Phase 5 — also apply per-zone difficulty (hpMul + damageMul) on top
  // of the boss's base + bossOpts. Multiplicative so a 1.4× tankier
  // bossOpts at zone 5 (×2.2) lands at 3.1× — a real climax fight.
  const diff = ZONE_DIFFICULTY[_runner.zoneName] || { hpMul: 1, damageMul: 1 };
  const baseOpts = enc.bossOpts ? { ...enc.bossOpts } : {};
  const opts = {
    ...baseOpts,
    hpMul: (baseOpts.hpMul || 1) * diff.hpMul,
    damageMul: (baseOpts.damageMul || 1) * diff.damageMul,
  };
  spawnEnemy(enc.bossType, wx, wy, opts);
  // Capture the just-spawned enemy as the boss reference. Bosses are
  // pushed onto enemies last, so the tail is ours.
  _runner.bossEntity = enemies[enemies.length - 1] || null;
  _runner.state = STATE_BOSS_ACTIVE;
}

// ── Read accessors (HUD, debug) ──────────────────────────────────────

export function getZoneRunnerState() {
  return {
    zoneName:    _runner.zoneName,
    state:       _runner.state,
    waveIdx:     _runner.waveIdx,
    waveCount:   _runner.encounters ? _runner.encounters.waves.length : 0,
    timer:       Math.max(0, _runner.timer),
    enemyCount:  enemies.length,
    bossSpawned: _runner.state === STATE_BOSS_ACTIVE || _runner.state === STATE_COMPLETE,
    isComplete:  _runner.state === STATE_COMPLETE,
  };
}

export const ZONE_RUNNER_STATES = {
  IDLE:        STATE_IDLE,
  WAVE_ACTIVE: STATE_WAVE_ACTIVE,
  WAVE_CLEAR:  STATE_WAVE_CLEAR,
  BOSS_PEND:   STATE_BOSS_PEND,
  BOSS_ACTIVE: STATE_BOSS_ACTIVE,
  COMPLETE:    STATE_COMPLETE,
};
