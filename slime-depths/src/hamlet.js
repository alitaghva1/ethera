// ============================================================================
// LIVING HAMLET — between-run hub that grows from the player's choices.
//
// Not a kingdom-management sim: the hamlet is a VISIBLE RECORD of progress,
// not a thing you babysit. NPCs arrive by achievement, each brings a
// service + a multi-run dialogue arc. Over time the painted backdrop
// shifts from ruin → place, showing your work on the world.
//
// Compared to Hades' hub (static) and Isaac (no hub at all), the hamlet
// is unique in that PLAYER ACTIONS CHANGE ITS STATE. You rebuild what
// was undone, one descent at a time.
//
// Each NPC has:
//   id, name, title : display
//   role           : one-line summary
//   portrait       : image key (loaded via loader.js), falls back to silhouette
//   x, y           : % position on the hamlet backdrop (for hotspot placement)
//   unlockCheck    : (records, stats, ctx) => bool — is this NPC present?
//   unlockHint     : string shown on the locked silhouette ("a door, unopened")
//   arcStages      : array of { advance, text } — dialogue unfolds by stage
//   service        : { type, label, run } — what clicking "use service" does
//
// Arc progression:
//   Stage 0 advances when `advance` returns true (typically "first meet").
//   Each use of the service bumps the stage if advance() of the next stage
//   is met. Final stage's reward can grant a permanent boon.
// ============================================================================

import { meta, hasUnlock } from './meta.js';

const STATE_KEY = 'ethera:hamlet_state:v1';

// Persistent hamlet state
export const hamletState = {
  npcArcStage: {},       // id → integer (0 = just arrived)
  npcArrivalRun: {},     // id → runsStarted at which they arrived (for flavor)
  npcServiceCount: {},   // id → how many times you've used their service
  npcDialogueSeen: {},   // id+stage → true (so we know when to show "new" indicator)
  // Hamlet growth stage (0=ruin, 1=kindled, 2=thriving, 3=restored)
  // Currently derived from NPC count; we may let players spend essence to
  // accelerate it in later phases.
  // growthStage: 0,    // kept commented; derived function below for now
};

import { safeLoadJSON, safeSaveJSON } from './storage.js';

function _isHamletShape(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function loadHamletState() {
  const parsed = safeLoadJSON(STATE_KEY, null, _isHamletShape);
  if (parsed) Object.assign(hamletState, parsed);
}
export function saveHamletState() {
  safeSaveJSON(STATE_KEY, hamletState);
}

// ============================================================================
// NPC ROSTER — shipped Phase 1
//
// Keeper (always present) — wraps the existing essence shop.
// Smith (floor 2 clear) — reforge two relics into one higher-tier.
// Archivist (10 relics seen) — surfaces Memory unlock hints + codex access.
//
// Phase 2+ roster (planned, not shipped):
//   Oracle, Gravekeeper, Wanderer-in-Hamlet
// ============================================================================

export const NPCS = {
  keeper: {
    id: 'keeper',
    name: 'The Keeper',
    title: 'of the last candle',
    role: 'Tends the hamlet. Trades essence for permanent boons.',
    portrait: 'npc_keeper',
    x: 54, y: 74,                      // at the central firepit (painted backdrop)
    tint: '#f4d9a0',
    unlockCheck: () => true,           // always present
    unlockHint: '',
    arcStages: [
      {
        advance: () => true,           // first meet, always
        text: [
          'You return, traveler.',
          'The fire here burns small, but it burns. That is thanks to what you carry back — every time you return, a little of the ruin comes with you, and a little of the light returns in trade.',
          'Essence, they call it. I can shape it into things that endure between your descents. Speak to me when you have it to spend.',
        ],
      },
      {
        advance: (s) => s.npcServiceCount.keeper >= 1,
        text: [
          'You have spent well.',
          'I can feel the shape of you changing, descent by descent. Some part of the ruin forgets the old you now — but the hamlet remembers.',
          'Come closer. There is more to buy, and I know you have more to give.',
        ],
      },
      {
        advance: (s) => s.npcServiceCount.keeper >= 4,
        text: [
          'Do you wonder, sometimes, where I keep the fire when you are not here?',
          'In truth — I do not. It goes out. I wait in the dark. And then you come back, and I strike it again.',
          'That is what a keeper does. That is what you do too, whether you know it or not.',
        ],
      },
    ],
    service: {
      type: 'meta_shop',
      label: 'ESSENCE',
      // Click handler set up at hamlet-render site (we route to the existing meta shop).
    },
  },

  smith: {
    id: 'smith',
    name: 'The Smith',
    title: 'reforger of broken oaths',
    role: 'Melts two relics into one of higher tier.',
    portrait: 'npc_smith',
    x: 24, y: 74,                      // at the painted forge doorway (left)
    tint: '#ff8a60',
    unlockCheck: (records) => records.maxFloor >= 2,
    unlockHint: 'A forge, cold. Reach floor 2 to kindle it.',
    arcStages: [
      {
        advance: () => true,
        text: [
          'You walked far enough to find me.',
          'That means something. Not many do — the ruin eats the ones who turn back.',
          'Bring me two relics. I will give you one that is more than both. The older name for this was reforging. I do it with a hammer and a little blood, and I do not ask which of the two was yours to begin with.',
        ],
      },
      {
        advance: (s) => s.npcServiceCount.smith >= 1,
        text: [
          'Good steel remembers its last strike. Better steel remembers who held it.',
          'What you brought me was not the relics you took from the ruin. It was the weight of your hand on them. That is what I folded into the new piece.',
          'Come back with more weight.',
        ],
      },
      {
        advance: (s) => s.npcServiceCount.smith >= 3,
        text: [
          'You know my name, don\'t you. You heard it said, deep down.',
          'I will not tell you whether it is true. It is enough that you carry it now.',
          'Bring the next ones.',
        ],
      },
    ],
    service: {
      type: 'reforge',
      label: 'REFORGE',
      // Click handler: opens a UI where the player picks 2 equipped relics
      // and gets 1 of a higher tier. Phase 2 since it needs a picker UI.
      disabledReason: 'Reforge requires an active run. Speak to me after a descent.',
    },
  },

  archivist: {
    id: 'archivist',
    name: 'The Archivist',
    title: 'of names half-remembered',
    role: 'Reveals Memory unlock conditions. Keeps the codex.',
    portrait: 'npc_archivist',
    x: 72, y: 74,                      // at the painted scriptorium dome (right)
    tint: '#b0c8ff',
    unlockCheck: (_records, _stats, ctx) => {
      if (!ctx || !ctx.seenRelicIds) return false;
      return ctx.seenRelicIds.size >= 10;
    },
    unlockHint: 'A reader, waiting. Discover 10 relics to draw them out.',
    arcStages: [
      {
        advance: () => true,
        text: [
          'You have been busy.',
          'Every relic you bring back I write down — the shape of it, the weight, the cold against the page. I do not name them; they have their own names.',
          'What I CAN tell you is what else is out there. And what you would need to become to pull it loose.',
        ],
      },
      {
        advance: (s) => s.npcServiceCount.archivist >= 1,
        text: [
          'Memories are different from relics. Relics are things you find. Memories are things you ARE.',
          'The ones you can no longer remember, you can still remember how to remember. That is why I am here.',
          'Look again when you have done more. The book has more names in it than you have read.',
        ],
      },
      {
        advance: (s) => s.npcServiceCount.archivist >= 4,
        text: [
          'You have read nearly every page I have written for you.',
          'There are more in the back. I wrote them before you came. I will show you — someday.',
          'Not today. Today you go back down.',
        ],
      },
    ],
    service: {
      type: 'memory_codex',
      label: 'MEMORIES',
    },
  },

  // ==========================================================================
  // GRAVEKEEPER — trades hardship for essence. He owns the curses, replacing
  // the main-menu curses chip with a proper narrative home. Unlocks at 5
  // descents or 2 bosses killed (he arrives when you've left enough behind).
  // ==========================================================================
  gravekeeper: {
    id: 'gravekeeper',
    name: 'The Gravekeeper',
    title: 'who counts the vanished',
    role: 'Trades hardship for reward. Owns the curses.',
    portrait: 'npc_gravekeeper',
    x: 10, y: 74,
    tint: '#d85a5a',
    unlockCheck: (records) => records.runsStarted >= 5 || records.bossKillsAllTime >= 2,
    unlockHint: 'He arrives when you have left enough behind. Descend five times.',
    arcStages: [
      {
        advance: () => true,
        text: [
          'You return often enough that I have had to start counting. Most do not reach that number.',
          'I keep the ledger of what you have given up. Every descent leaves something. Sometimes a life. More often, less.',
          'If you want to offer more — on purpose — I can help. The ruin pays well for deliberate suffering. It is the accidental kind it finds boring.',
        ],
      },
      {
        advance: (s) => (s.npcServiceCount.gravekeeper | 0) >= 1,
        text: [
          'The ruin noticed. Of course it did.',
          'Keep the pact you made, or there is no pact at all. I have seen many bargainers try to cancel their side halfway down. The ruin does not allow it.',
          'You are allowed to change your terms between descents. Not during. Remember that.',
        ],
      },
      {
        advance: (s) => (s.npcServiceCount.gravekeeper | 0) >= 3,
        text: [
          'You bargain well. Calmly. That bothers me more than if you had bargained badly.',
          'Someone who bargains calmly has already accepted the loss. I wonder if you know what yours is, yet.',
          'I will still count for you. I just wanted you to know I was watching.',
        ],
      },
    ],
    service: {
      type: 'curses_panel',
      label: 'CURSES',
    },
  },

  // ==========================================================================
  // ORACLE — shows what lies in the next descent. The forecast is deterministic
  // game data (biome names, bosses, enemy types) dressed up as seeing. Unlocks
  // at floor 3 clear — she only appears once the player has seen enough of
  // the ruin that foreknowledge becomes worth having.
  // ==========================================================================
  oracle: {
    id: 'oracle',
    name: 'The Oracle',
    title: 'of the forward-looking dark',
    role: 'Shows what lies in the next descent.',
    portrait: 'npc_oracle',
    x: 38, y: 74,                      // between the forge and the firepit
    tint: '#b49aff',
    unlockCheck: (records) => records.maxFloor >= 3,
    unlockHint: 'She watches the forward-dark. Reach floor 3 and she will turn toward you.',
    arcStages: [
      {
        advance: () => true,
        text: [
          'I do not predict. I remember forward — different craft, same stillness.',
          'Below, the shape of what awaits rarely changes. Only its hunger does. Ask, and I will show you the shape.',
          'You pay for the seeing. Not the outcome. The outcome is yours.',
        ],
      },
      {
        advance: (s) => (s.npcServiceCount.oracle | 0) >= 1,
        text: [
          'You returned. Good. Most who buy a glimpse forget what they saw within an hour of going back below.',
          'Memory is cheaper than foresight, but they ask the same discipline of you.',
        ],
      },
      {
        advance: (s) => (s.npcServiceCount.oracle | 0) >= 3,
        text: [
          'You have been paying enough attention that I want to tell you something I do not usually say.',
          'I did not come from above. I came from below. I was through the ruin once — whole, on the other side.',
          'I came back to watch. I am still deciding what I saw.',
        ],
      },
    ],
    service: {
      type: 'oracle_forecast',
      label: 'GAZE',
    },
  },

  // ==========================================================================
  // WANDERER-IN-HAMLET — the wanderer from your runs has stopped walking and
  // settled here. Offers a random common relic (cheaper than Smith's specific
  // pick). Unlocks after one completed run OR 10 runs started — he arrives
  // when he sees you might actually be going somewhere.
  // ==========================================================================
  wanderer: {
    id: 'wanderer',
    name: 'The Wanderer',
    title: 'who has stopped walking',
    role: 'Offers a random gift from the road.',
    portrait: 'npc_wanderer_hamlet',
    x: 89, y: 74,                      // far right, past the scriptorium
    tint: '#ffc880',
    unlockCheck: (records) => records.runsCompleted >= 1 || records.runsStarted >= 10,
    unlockHint: 'He arrives when he sees you might be going somewhere. Complete one ascent.',
    arcStages: [
      {
        advance: () => true,
        text: [
          'I have stopped walking. It happens, even to us. Do not look surprised.',
          'What is in my pack is of no use to me here. I would rather someone carry it than it carry me.',
          'Pay what you can spare. I do not pretend to know what it is worth.',
        ],
      },
      {
        advance: (s) => (s.npcServiceCount.wanderer | 0) >= 1,
        text: [
          'Mm. You took it. Most travelers do not accept gifts from strangers — too many old stories about what they cost later.',
          'This is a story about the opposite of that. But it will take a while to finish.',
        ],
      },
      {
        advance: (s) => (s.npcServiceCount.wanderer | 0) >= 3,
        text: [
          'You have been kind to me. I am not used to being given time.',
          'Soon — not today — I will take back to the road. There is a piece of this story I would like to see before I go.',
          'When I do, look in my pack once more. I will leave something.',
        ],
      },
    ],
    service: {
      type: 'wanderer_gift',
      label: 'A GIFT',
    },
  },
};

export const ALL_NPC_IDS = Object.keys(NPCS);

// Check which NPCs should be present right now. Called when the hamlet screen
// opens; newly-arrived NPCs get their arcStage initialized to 0 so their
// first-meet dialogue is flagged as "new".
export function refreshNpcPresence(records, stats, ctx) {
  const newlyArrived = [];
  for (const id of ALL_NPC_IDS) {
    const def = NPCS[id];
    if (hamletState.npcArcStage[id] !== undefined) continue;  // already arrived
    try {
      if (def.unlockCheck(records, stats, ctx)) {
        hamletState.npcArcStage[id] = 0;
        hamletState.npcArrivalRun[id] = records.runsStarted | 0;
        hamletState.npcServiceCount[id] = 0;
        newlyArrived.push(def);
      }
    } catch (e) {}
  }
  if (newlyArrived.length) saveHamletState();
  return newlyArrived;
}

// Advance an NPC's arc if possible. Called after service use or on re-visit.
// Returns the NEW stage if it advanced (so UI can flag "new dialogue").
export function tryAdvanceArc(npcId) {
  const def = NPCS[npcId];
  if (!def) return -1;
  const cur = hamletState.npcArcStage[npcId];
  if (cur === undefined) return -1;          // not arrived yet
  const nextStage = cur + 1;
  const next = def.arcStages[nextStage];
  if (!next) return -1;                       // already at final stage
  try {
    if (next.advance(hamletState)) {
      hamletState.npcArcStage[npcId] = nextStage;
      saveHamletState();
      return nextStage;
    }
  } catch (e) {}
  return -1;
}

// Record that the player used an NPC's service. Triggers potential arc advance.
export function recordServiceUse(npcId) {
  if (!NPCS[npcId]) return;
  hamletState.npcServiceCount[npcId] = (hamletState.npcServiceCount[npcId] || 0) + 1;
  saveHamletState();
  tryAdvanceArc(npcId);
}

// Mark a stage's dialogue as seen (so we can flag unread stages in UI)
export function markDialogueSeen(npcId) {
  const s = hamletState.npcArcStage[npcId];
  if (s === undefined) return;
  hamletState.npcDialogueSeen[`${npcId}_${s}`] = true;
  saveHamletState();
}
export function hasUnreadDialogue(npcId) {
  const s = hamletState.npcArcStage[npcId];
  if (s === undefined) return false;
  return !hamletState.npcDialogueSeen[`${npcId}_${s}`];
}

// Derive hamlet "growth stage" from number of present NPCs — 0..3.
// Used by UI to pick a backdrop tint / future alternate painted states.
export function hamletGrowthStage() {
  const count = Object.keys(hamletState.npcArcStage).length;
  if (count <= 1) return 0;        // ruin — only keeper
  if (count <= 2) return 1;        // kindled
  if (count <= 4) return 2;        // thriving
  return 3;                        // restored
}

export function presentNpcs() {
  return ALL_NPC_IDS.filter(id => hamletState.npcArcStage[id] !== undefined)
                    .map(id => NPCS[id]);
}

export function totalNpcs() { return ALL_NPC_IDS.length; }
export function presentNpcCount() { return presentNpcs().length; }
