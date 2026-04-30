// ============================================================================
// ASCENSION — systems-roguelite long-tail engagement
//
// Each cleared floor-4 run unlocks the next Ascension tier. Higher tiers
// stack MODIFIERS (each named and described) on top of the run. Essence
// reward scales with tier so hardcore players feel the climb is worth it.
//
// Design principles (from Slay the Spire's A1–A20):
//   1. Each tier adds exactly ONE mechanical rule — not just "enemies do
//      more damage", because that's not interesting.
//   2. The rule must be legible in one sentence and observable in-run.
//   3. Higher tiers never trivialize lower-tier builds — they force
//      RE-STRATEGIZING.
//   4. The pacing of unlocks (must clear A[n] to unlock A[n+1]) means a
//      player progresses through tiers at their own pace.
//
// Starting with tiers 1–5 for this pass; 6–10 to be added after playtest
// telemetry from these five.
// ============================================================================

const STORAGE_KEY = 'ethera:ascension:v1';

// Ordered tiers. Each tier extends its PREDECESSORS — they all stack.
// `essenceMul` is the reward multiplier FOR THAT SPECIFIC TIER (e.g. A3
// gives 1.30× total essence; A1/A2 still apply their rules at A3).
export const ASCENSION_TIERS = [
  // Tier 0 is the baseline — no modifiers, no extra essence.
  {
    tier: 0,
    name: 'Standard',
    short: 'a standard descent',
    rule: null,
    essenceMul: 1.0,
  },
  {
    tier: 1,
    name: 'Ascension I — The Weight',
    short: 'enemies carry more iron',
    rule: 'Enemy HP +25%',
    essenceMul: 1.10,
    modifiers: { enemyHpMul: 1.25 },
  },
  {
    tier: 2,
    name: 'Ascension II — The Early Dark',
    short: 'the ruin pushes back from the first door',
    rule: 'Elite affixes can appear on floor 1',
    essenceMul: 1.20,
    modifiers: { enemyHpMul: 1.25, eliteFloor1: true },
  },
  {
    tier: 3,
    name: 'Ascension III — The Half Rest',
    short: 'sanctuaries close early',
    rule: 'Sanctuaries restore only 50% HP',
    essenceMul: 1.30,
    modifiers: { enemyHpMul: 1.25, eliteFloor1: true, sanctuaryHealMul: 0.5 },
  },
  {
    tier: 4,
    name: 'Ascension IV — The Awakened',
    short: 'bosses remember their old names',
    rule: 'Bosses enrage earlier (70% HP instead of 50%)',
    essenceMul: 1.45,
    modifiers: { enemyHpMul: 1.25, eliteFloor1: true, sanctuaryHealMul: 0.5, bossEnrageAt: 0.70 },
  },
  {
    tier: 5,
    name: 'Ascension V — The Silent Pact',
    short: 'the names you remember refuse to answer',
    rule: 'Memory slot neutralized — no Memory effect, no gift, no pact',
    essenceMul: 1.65,
    modifiers: { enemyHpMul: 1.25, eliteFloor1: true, sanctuaryHealMul: 0.5, bossEnrageAt: 0.70, memoryDisabled: true },
  },
  {
    tier: 6,
    name: 'Ascension VI — The Purged',
    short: 'the gods will not speak to you',
    rule: 'Legendary and Mythic relics removed from the pool',
    essenceMul: 1.85,
    modifiers: {
      enemyHpMul: 1.25, eliteFloor1: true, sanctuaryHealMul: 0.5, bossEnrageAt: 0.70,
      memoryDisabled: true, legendaryDisabled: true,
    },
  },
  {
    tier: 7,
    name: 'Ascension VII — The Unwritten',
    short: 'the path you cannot see is the path you must take',
    rule: 'One node in each layer of the map is hidden until you commit',
    essenceMul: 2.05,
    modifiers: {
      enemyHpMul: 1.25, eliteFloor1: true, sanctuaryHealMul: 0.5, bossEnrageAt: 0.70,
      memoryDisabled: true, legendaryDisabled: true, hiddenMapNode: true,
    },
  },
  {
    tier: 8,
    name: 'Ascension VIII — The Counted',
    short: 'the ruin remembers how long you took',
    rule: 'After 6 minutes per floor, enemies gain +40% speed + damage',
    essenceMul: 2.30,
    modifiers: {
      enemyHpMul: 1.25, eliteFloor1: true, sanctuaryHealMul: 0.5, bossEnrageAt: 0.70,
      memoryDisabled: true, legendaryDisabled: true, hiddenMapNode: true,
      floorTimeLimitSec: 360, floorTimeoutEnemyMul: 1.40,
    },
  },
  {
    tier: 9,
    name: 'Ascension IX — The Uncounted',
    short: 'the ledger does not count the paths you chose',
    rule: 'Essence rewards are 0.40× on all non-boss kills',
    essenceMul: 2.55,
    modifiers: {
      enemyHpMul: 1.25, eliteFloor1: true, sanctuaryHealMul: 0.5, bossEnrageAt: 0.70,
      memoryDisabled: true, legendaryDisabled: true, hiddenMapNode: true,
      floorTimeLimitSec: 360, floorTimeoutEnemyMul: 1.40,
      nonBossEssenceMul: 0.40,
    },
  },
  {
    tier: 10,
    name: 'Ascension X — The Unbroken',
    short: 'if you survive, the ruin forgets your name for one hour',
    rule: 'All above, plus: run rewards ONE payout at Ember Tyrant kill (tripled)',
    essenceMul: 3.00,  // headline number; the bossOnlyPayout flag overrides per-source accrual
    modifiers: {
      enemyHpMul: 1.25, eliteFloor1: true, sanctuaryHealMul: 0.5, bossEnrageAt: 0.70,
      memoryDisabled: true, legendaryDisabled: true, hiddenMapNode: true,
      floorTimeLimitSec: 360, floorTimeoutEnemyMul: 1.40,
      nonBossEssenceMul: 0.0,   // zero out per-kill essence during run
      finalBossEssenceMul: 3.0, // triple payout only on ember_tyrant defeat
    },
  },
];

export const MAX_ASCENSION = ASCENSION_TIERS.length - 1;

// Persisted state: { unlocked: max tier unlocked, active: tier selected for next run }
let _state = { unlocked: 0, active: 0 };

export function loadAscension() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed) {
      _state.unlocked = Math.max(0, Math.min(MAX_ASCENSION, parsed.unlocked | 0));
      _state.active = Math.max(0, Math.min(_state.unlocked, parsed.active | 0));
    }
  } catch (_e) {
    // Corrupt save — start fresh; user keeps their other progression.
  }
}

function saveAscension() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_state)); } catch (_e) {}
}

export function getAscensionTier() { return _state.active; }
export function getUnlockedTier() { return _state.unlocked; }

/** Return the definition of the currently-active tier. */
export function activeAscension() { return ASCENSION_TIERS[_state.active]; }

/** Modifier lookup — returns merged modifiers from the active tier. */
export function ascensionModifiers() {
  return (ASCENSION_TIERS[_state.active] && ASCENSION_TIERS[_state.active].modifiers) || {};
}

/** Combined essence multiplier for the active tier. */
export function ascensionEssenceMul() {
  return (ASCENSION_TIERS[_state.active] || {}).essenceMul || 1.0;
}

/** Select a tier for the next run. Clamped to [0, unlocked]. */
export function setAscensionTier(t) {
  _state.active = Math.max(0, Math.min(_state.unlocked, t | 0));
  saveAscension();
}

/** Call on successful floor-4 clear — unlocks the next tier. */
export function onRunCompletedAtTier(completedTier) {
  if (completedTier >= _state.unlocked && _state.unlocked < MAX_ASCENSION) {
    _state.unlocked = completedTier + 1;
    saveAscension();
    return true; // signals "new tier unlocked" so UI can toast
  }
  return false;
}
