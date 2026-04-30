// ============================================================================
// DEATH TIPS — per-killer counsel that surfaces after repeated failures
//
// Tracks how many times each enemy type has killed the hero across runs.
// On the next run start, if any killer's count crosses a threshold, a
// contextual tip appears in the notification rail with specific counter-
// play advice. Fires at most once per run start; ranked by recency
// (most-recent killer first when multiple are above threshold).
//
// Data shape (localStorage):
//   ethera:deaths_by_killer:v1 → { [killerType]: count }
//
// Why this lives in its own module:
//   - The tips are content (writing) that benefits from being kept
//     separate from main.js's run-flow code.
//   - main.js's tips.js already tracks "first-time" tips; THIS layer is
//     the inverse — repeat-failure prompts. Different lifecycle, different
//     persistence key, easier to keep apart.
// ============================================================================

import { safeLoadJSON, safeSaveJSON } from './storage.js';
import { pushNotification } from './notifications.js';

const KEY = 'ethera:deaths_by_killer:v1';
const THRESHOLD = 3;          // tip fires after 3 deaths to the same killer

let _deaths = Object.create(null);     // killerType → count
let _lastDeathKiller = null;           // last killer this session — used for tip ranking

export function loadDeathTips() {
  const obj = safeLoadJSON(KEY, null, (v) => v && typeof v === 'object' && !Array.isArray(v));
  if (obj) {
    for (const k of Object.keys(obj)) {
      const n = obj[k] | 0;
      if (n > 0) _deaths[k] = n;
    }
  }
}

function _save() {
  safeSaveJSON(KEY, _deaths);
}

// Record a death attributable to `killerType`. Increments the counter
// and persists. Pass null/undefined silently (some deaths come with no
// attributable killer — falls into the dungeon, dies to a curse, etc).
export function recordKilledBy(killerType) {
  if (!killerType) return;
  _deaths[killerType] = (_deaths[killerType] | 0) + 1;
  _lastDeathKiller = killerType;
  _save();
}

// Per-killer counsel — short, specific, never scolding. Each one names
// the mechanic + the counter-play move. Voice matches tips.js's
// "restrained, second-person implied" rule.
const KILLER_TIPS = {
  slime: 'Slimes commit to a wide arc — sidestep into the gap, then counter.',
  skel: 'Skeletons swing FAST but interrupt easily — start your hit during their windup.',
  orc: 'Orc heavy swings have wider arcs but longer telegraphs. Watch the colour.',
  archer: 'Archers lock at cast. Move SIDEWAYS during their windup, not toward.',
  skel_archer: 'Bone archers fire in tighter volleys — kite behind cover, not in the open.',
  warden: 'The Warden punishes hesitation. Commit to a side; do not retreat through fire.',
  echo: 'The echo of self mirrors your old build. Read what they have, exploit what they lack.',
  bomber: 'The pulsing ring shows the blast radius. Outside it is safe.',
  lancer: 'Lancers commit to the charge line at windup. Step OFF the line, not back.',
  vanguard: 'Vanguards block frontal hits — flank them.',
  reflector: 'Reflectors return your damage. Stagger them with melee BEFORE shooting.',
  wizard: 'Wizard orbs home — break sightline behind a pillar or pillar-edge.',
  priest: 'Priests heal the most-damaged ally. Burst-down the nearest enemy first.',
  haunt: 'Haunts pass through walls. Do not assume distance is safety.',
  werewolf: 'Werewolves dash on sight. Shield UP at sight; counter on impact.',
  werebear: 'Werebears windup is long but the swing is wide. Step inside, not back.',
  dreadmage: 'Dreadmages cast in volleys — kill them first or break sightline.',
  knight_enemy: 'Knights have armour. Stagger them; perfect-block the heavy swing.',
  armored_skel: 'Armoured skeletons resist front damage. Flank or use shield-counter.',
  greatsword_skel: 'Greatswords sweep wide — circle close to the body, not perimeter.',
  soldier: 'Soldiers fight in pairs. Burst the closer one before the second can flank.',
  swordsman: 'Swordsmen punish hesitation. Commit, do not fade.',
  armored_axeman: 'Armoured axemen have huge arcs but slow recovery — counter the swing.',
  armored_orc: 'Armoured orcs absorb chip damage. Save charged swings for them.',
  knight_templar: 'Templars perfect-block your unbuffered hits. Time the charge instead.',
  orc_rider: 'Orc riders charge in straight lines. Step diagonally, never backward.',
  // Bosses — specific to each fight's signature mechanic.
  elite_orc: 'Grudnok roars before each cleave. The delay is your window.',
  bone_captain: 'Iron Revenant drains on hit. Shield UP during dashes, parry the rest.',
  broodmother: 'Broodmother summons bombers at low HP. Clear them before pressing.',
  ember_tyrant: 'Ember rings expand from his FEET. Step OFF the radial line, not just away.',
  hermit: 'The Hermit casts in arcs — break sightline at the cone edge.',
  // Environmental.
  spike: 'Spikes pulse on a clock. Watch the floor before committing to ground.',
  fire_pool: 'Fire pools cycle on/off. Cross during the dim moment.',
  fire_ring: 'Ember rings expand from the boss. Step OFF the radial line.',
  flame_trail: 'Flame trails linger after enemies pass. Do not retrace their footprints.',
  mimic: 'Some chests are hungry. The second-look hesitation gives them away.',
  projectile: 'Stray bolts come from off-screen. Keep moving when you cannot see all foes.',
};

// Pick the killer with the highest count above THRESHOLD, prefer the
// most-recent if there's a tie (so the player gets advice on the killer
// that JUST ended their run rather than a stale leader). Returns
// { killerType, tip } or null when nothing crosses threshold.
export function peekDeathTip() {
  let best = null;
  let bestCount = THRESHOLD - 1;     // anything <THRESHOLD is uninteresting
  for (const k of Object.keys(_deaths)) {
    const c = _deaths[k] | 0;
    if (c < THRESHOLD) continue;
    if (c > bestCount) {
      best = k;
      bestCount = c;
    } else if (c === bestCount && k === _lastDeathKiller) {
      best = k;     // recency tiebreak
    }
  }
  if (!best) return null;
  const tip = KILLER_TIPS[best];
  if (!tip) return null;
  return { killerType: best, count: bestCount, tip };
}

// Fire the death tip into the notification rail. Called once at run
// start AFTER loadRoom completes so the rail entry doesn't get
// suppressed by the floor-card cinematic. Returns true if a tip
// fired.
export function fireDeathTipIfReady() {
  const peeked = peekDeathTip();
  if (!peeked) return false;
  const { count, tip } = peeked;
  pushNotification({
    kind: 'tip',
    header: '— THE RUIN REMEMBERS —',
    title: `you have fallen ${count} times to this`,
    body: tip,
    tint: '#c8a8a8',           // muted crimson — death-coded
    life: 7.0,                  // extra life — counsel deserves to be read
  });
  return true;
}
