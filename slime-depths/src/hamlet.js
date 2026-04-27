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

import { meta } from './meta.js';

const STATE_KEY = 'ethera:hamlet_state:v1';

// Persistent hamlet state
export const hamletState = {
  npcArcStage: {},       // id → integer (0 = just arrived)
  npcArrivalRun: {},     // id → runsStarted at which they arrived (for flavor)
  npcServiceCount: {},   // id → how many times you've used their service
  npcDialogueSeen: {},   // id+stage → true (so we know when to show "new" indicator)
  // Casual chat rotation — index per NPC into their chatLines array.
  // Bumped each time the player clicks the SPEAK button so the chat
  // stays fresh across visits without burning all lines in one sitting.
  npcChatIdx: {},        // id → integer (current line index)
  // Topic dialogue (Morrowind-style) — track which topic answers
  // the player has already heard from each NPC. Used to render
  // a subtle "new topic" dot on chips the player hasn't clicked yet.
  // Key shape: `${npcId}_${topicId}`. Persisted across runs.
  npcTopicSeen: {},
  // Milestone counters for reactive dialogue. Main.js bumps these at the
  // right run-lifecycle events (boss kill, fortune drawn, etc.) so NPC
  // arcStage advance() checks can key off them.
  fortunesDrawn: 0,      // how many Oracle's Fortunes cards the player has drawn
  // Hamlet growth stage (0=ruin, 1=kindled, 2=thriving, 3=restored)
  // Currently derived from NPC count; we may let players spend essence to
  // accelerate it in later phases.
  // growthStage: 0,    // kept commented; derived function below for now
};

import { safeLoadJSON, safeSaveJSON } from './storage.js';
// Milestone-triggered NPC dialogue reads from these at advance() time.
// Read-only references — no state written back into those modules.
// `meta` is already imported at the top of the file (line 29).
import { records } from './records';
import { seenRelicIds } from './relics.js';
import { curseCount } from './curses.js';

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
// TOPIC CATALOG — Morrowind/Skyrim-style dialogue system.
//
// The hamlet's NPCs share a small set of subjects they can speak about. Each
// topic is a clickable chip in the dialogue modal. When the player clicks
// a topic chip, the NPC's answer for that topic replaces the body text.
// Different NPCs have different perspectives on the SAME topic — the Smith,
// the Wanderer, and the Keeper might each describe the others, building up
// a layered picture of the hamlet through gossip and memory.
//
// `visible(state, ctx)` gates topic availability:
//   - Universal topics (the_ruin, the_hamlet) are always visible.
//   - Cross-NPC topics (the_smith, the_oracle) appear only after that NPC
//     has arrived in the hamlet.
//   - Watcher-related topics gate on watcher state (player must have heard
//     at least one utterance).
//
// `label` is the chip text. Kept short for layout density — the modal can
// fit ~6-8 chips comfortably without wrapping awkwardly.
// ============================================================================
export const TOPICS = {
  // ---- Universal ----------------------------------------------------------
  the_ruin: {
    label: 'The Ruin',
    visible: () => true,
  },
  the_hamlet: {
    label: 'This Place',
    visible: () => true,
  },
  the_watcher: {
    label: 'The Watcher',
    // Only available after the player has heard the watcher speak at least
    // once. Lazy-load watcher state to avoid a circular import.
    visible: () => {
      try {
        const w = safeLoadJSON('watcher_v1', null);
        return !!(w && (w.runs | 0) >= 1 && typeof w.lastSpokenLine === 'string' && w.lastSpokenLine.length > 0);
      } catch (_e) { return false; }
    },
  },
  yourself: {
    label: 'Myself',
    visible: () => true,
  },
  // ---- Cross-NPC subjects (gated on NPC presence) -------------------------
  the_keeper:      { label: 'The Keeper',      visible: () => true },   // always present
  the_smith:       { label: 'The Smith',       visible: (s) => s.npcArcStage.smith !== undefined },
  the_archivist:   { label: 'The Archivist',   visible: (s) => s.npcArcStage.archivist !== undefined },
  the_gravekeeper: { label: 'The Gravekeeper', visible: (s) => s.npcArcStage.gravekeeper !== undefined },
  the_oracle:      { label: 'The Oracle',      visible: (s) => s.npcArcStage.oracle !== undefined },
  the_wanderer:    { label: 'The Wanderer',    visible: (s) => s.npcArcStage.wanderer !== undefined },
};
export const ALL_TOPIC_IDS = Object.keys(TOPICS);

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
      {
        // Milestone — any boss killed, any descent ever. Reframes what
        // the player is actually doing when they bring essence home.
        advance: () => (records && (records.bossKills | 0) >= 1),
        text: [
          'You came back with blood on you tonight. Not yours — not all of it.',
          'The essence you bring is heavier after a kill. Did you know that? It remembers the weight of the thing it came from.',
          'I will keep it well. Some of it I will not even spend.',
        ],
      },
    ],
    service: {
      type: 'meta_shop',
      label: 'ESSENCE',
      // Click handler set up at hamlet-render site (we route to the existing meta shop).
    },
    // Casual conversation lines — surfaced via the SPEAK button in the
    // dialogue modal, distinct from arcStages (story-critical flavor).
    // Cycles through on each click; persists index in hamletState.
    // Voice: warm, elegiac, the keeper as steward of small flames.
    chatLines: [
      'The fire holds. That is most of my work.',
      'You came in quieter than usual. Did the ruin not see you out?',
      'Sometimes I think the candles know when you are coming. They lean toward the door.',
      'I have been here long enough to remember when the hamlet had names. They will come back.',
      'Sit a moment. The descent will keep.',
      'When you go down again, leave the door ajar. The light reaches further than you think.',
    ],
    // Topic answers — Morrowind-style. Click a chip in the dialogue
    // modal to hear the Keeper's take on each subject. Voice stays
    // warm + elegiac. She knows everyone and the place.
    topics: {
      the_ruin: 'The ruin was here before the hamlet, and the hamlet was here before the village, and the village was here before the name. We have always been at the lip of it. I do not know if it watches. I know it remembers.',
      the_hamlet: 'A name we lost. A fire we kept. Some of the houses are still standing because we set them on fire, briefly, every winter — to remind them they are houses. It works.',
      the_watcher: 'I have not heard the voice. You have. That is your part of the work, not mine. I tend the door.',
      yourself: 'You came in barefoot, the first time. I do not think you noticed. The fire did. It still leans when you arrive.',
      the_keeper: 'I tend the fire. There is no other name beneath that one. Someone called me a different word, once, in a different season. I have forgotten which.',
      the_smith: 'He came down the road with soot on him and did not say from where. I gave him soup. He still has not told me. I do not need him to.',
      the_archivist: 'She writes you in. She has told me. I do not look at the pages. The book belongs to her.',
      the_gravekeeper: 'He arrived the way a bell arrives — heard before seen. We made room. Someone has to count, even here.',
      the_oracle: 'She came back from somewhere most do not return from. I watched her step over the threshold. She paused, the way a guest pauses, and then came in anyway.',
      the_wanderer: 'He stopped walking. It is rarer than you think. Most who pass through stop only long enough to ask the road.',
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
      {
        // Milestone — player has a banked heirloom (any time). Smith comments
        // on the piece he's already holding for the next descent.
        advance: () => (meta && meta.heirloom),
        text: [
          'I see what you gave me last. It asks to be carried — again.',
          'I have hung it by the door. When you go next, it goes with you.',
          'Some pieces are not made to sit on my workbench. They want to be used.',
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
    // Voice: terse, blue-collar, fond but unsentimental. Talks about steel.
    chatLines: [
      'Mornin\'. Or whatever it is up here.',
      'Strike\'s easier when the steel knows what you want from it.',
      'Bring me what doesn\'t serve you anymore. I\'ll find what does.',
      'The anvil takes two voices — mine, and whatever you laid on it.',
      'Don\'t flinch when the hammer comes down. You\'re not the one on the block.',
      'I was a soldier once. Then a smith. Now mostly a smith.',
    ],
    // Voice: brevity. He answers what he knows and shrugs at the rest.
    // He sees the others as bodies in a room, not as personalities.
    topics: {
      the_ruin: 'It eats things. Some of those things come back as steel. The rest don\'t come back at all. That is a metallurgist\'s way of looking at it. It is also true.',
      the_hamlet: 'It needed a forge. I had a hammer. The arrangement was not complicated.',
      the_watcher: 'Heard about it. Don\'t know it. Doesn\'t come down for steel.',
      yourself: 'You hit harder when you carry less doubt. I notice. Not many notice that about themselves.',
      the_keeper: 'Fed me. Didn\'t ask. I owe her a roof beam if the place ever needs one.',
      the_smith: 'I was a soldier once. Then a smith. Now mostly a smith. The other parts went into the work.',
      the_archivist: 'Reads. A lot. I\'ve never read a book that improved a hammer. I assume the books are doing other things.',
      the_gravekeeper: 'He counts. I appreciate someone who counts. Means he\'ll notice if I go missing.',
      the_oracle: 'She told me my next strike would land slightly left. She was right. I do not know how I feel about it.',
      the_wanderer: 'Walks lighter than a man with a pack should. He\'ll move on when he\'s done. They always do.',
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
      {
        // Milestone — 20+ relics discovered across saves. The codex is
        // getting heavy enough that the archivist feels it.
        advance: () => (seenRelicIds && seenRelicIds.size >= 20),
        text: [
          'You have given me more than I had left to write.',
          'The book is heavier now. I cannot close it with one hand anymore. That is a good weight.',
          'Keep bringing. I have space yet.',
        ],
      },
    ],
    service: {
      type: 'memory_codex',
      label: 'MEMORIES',
    },
    // Voice: scholarly, careful, fond of margins.
    chatLines: [
      'I have written you in. Not to worry — I do not show the book to anyone.',
      'A relic\'s name is the first thing the ruin tries to take. I keep them here, in case.',
      'Yesterday I copied a page that had been written before. Identical hand. Different ink.',
      'Memory is not a record. Memory is a habit of returning to the same room in the head.',
      'I have a corner reserved for the relics you have not yet found. They are all named in pencil.',
      'Do you ever wonder which entry of mine is about you?',
    ],
    // Voice: precise. She has notes on everything and lets you read
    // some of them. The others are her colleagues; she has opinions.
    topics: {
      the_ruin: 'The ruin is older than its name and the name is old. I have a section of the book devoted to its etymologies. None of them agree, and that is the most useful thing they say about it.',
      the_hamlet: 'The hamlet is a place that decided not to be a memory. Every place gets that choice exactly once. Most do not take it. This one did.',
      the_watcher: 'I have a page for it. The page is mostly empty. It is one of my favorite pages.',
      yourself: 'I have written more about you than about anyone else who has come through, including the ones who left famous. I will not show you the entries. They are not for you yet.',
      the_keeper: 'She is older than she looks. I have not asked how. I do not think she would lie about it; I think she would simply not know what year to give me.',
      the_smith: 'Soldier first. There are knots in the hammer-arc he makes that come from carrying a longer, lighter blade. He doesn\'t know I noticed. I have not told him.',
      the_archivist: 'I read. I write. I have argued with the book three times this week and been correct only twice. The book has a vote.',
      the_gravekeeper: 'He counts the dead. He counts the LIVING too, but only when they are alone. I caught him counting me once. I forgave him. I think.',
      the_oracle: 'She knows things I would have to read three books to know. I have asked her where she got them. She said: from below. I have been thinking about that for some time.',
      the_wanderer: 'I have a list of the roads he has walked, by inference from his pack. Eleven so far. I will not show him.',
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
      {
        // Milestone — three or more curses active. The player's gone all-in.
        advance: () => (typeof curseCount === 'function' && curseCount() >= 3),
        text: [
          'You carry three at once, now. Most cannot.',
          'The dead notice who walks into the dark carrying more than they were given. They make room on the stone when you pass.',
          'I do not envy what you have become. But I recognize it.',
        ],
      },
    ],
    service: {
      type: 'curses_panel',
      label: 'CURSES',
    },
    // Voice: grim, watchful, ledger-keeper. Calm where calm should not be.
    chatLines: [
      'The ledger does not need your name. It already has it.',
      'Three more came up the path while you were below. None of them you. Yet.',
      'Some bargains are paid in advance. Some come due only at the gate.',
      'I do not bury, here. The ruin keeps what it takes — I only count.',
      'You stand differently than the last time. That is information.',
      'I will be watching. Try not to need me before you need me.',
    ],
    // Voice: clinical, watchful. He likes precision; he treats the
    // others as entries in a different ledger — kindly, but at remove.
    topics: {
      the_ruin: 'The ruin is the most honest thing in this region. It does not pretend to be anything other than what it is, and what it is, is hungry. Most things lie about that.',
      the_hamlet: 'A boundary. Where the count ends and the count keeps going. We pretend the line is a door. The line is a number, written on the air.',
      the_watcher: 'It does not deal with me. We are in similar work but not the same work. I count the lost. It counts something else. I have not asked which side of the line.',
      yourself: 'Three hundred and twelve breaths above resting, when you arrive. Two hundred and four when you leave. You sleep here, briefly, and you do not know it. Your counts say so.',
      the_keeper: 'Older than her ledger would be, if she kept one. I asked her once if she counted candles. She said she counts mornings. That is the same thing.',
      the_smith: 'Has more weight in him than the work suggests. I have not asked what it is. I think he carries it on purpose.',
      the_archivist: 'A counter, like me, but with more letters. Different inventory. We have an understanding. We do not compare books.',
      the_gravekeeper: 'I count what is gone and what is still here. Eventually those two columns balance. Until then, I work.',
      the_oracle: 'She sees forward. I see backward. We do not interfere with each other\'s ranges. It is a courtesy I appreciate.',
      the_wanderer: 'A long traveler stopping is rarer than a tower falling. He is in my ledger as an event, not a person.',
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
      {
        // Milestone — 3+ fortunes drawn. Player is actually USING the deck.
        advance: (s) => (s.fortunesDrawn | 0) >= 3,
        text: [
          'You have begun to read the deck. I can see it in how you hold the cards before you choose.',
          'Do not mistake that for knowing the deck. The deck learns you much faster than you learn it.',
          'I will draw again when you ask. I find I like the asking.',
        ],
      },
    ],
    service: {
      type: 'oracle_forecast',
      label: 'GAZE',
    },
    // Voice: cryptic, dryly observational, oddly fond.
    chatLines: [
      'I have already seen what you are about to ask. Ask anyway.',
      'The forward-dark is patient with me. Not always with you.',
      'A future is the shape of a past that has not arrived yet.',
      'You glance at the door more than the others. You are nearly ready to go.',
      'When you survive, it is because someone refused to look. That is not always me.',
      'Cards do not lie. They do, however, omit a great deal.',
    ],
    // Voice: she has been below — actually through. Most of her answers
    // come from the other side of the ruin, not the near side. She is
    // the only NPC who can speak to the watcher with familiarity.
    topics: {
      the_ruin: 'The ruin is a corridor with two doors. I came in through one and out through the other. I came back the long way. That is what makes me an oracle and not a survivor.',
      the_hamlet: 'A door. The hamlet is a door. We pretend it is a building because we live in it, but every wall is a frame and every window is a glance. We are all on the threshold of somewhere.',
      the_watcher: 'It spoke to me when I went through. It still speaks, occasionally, when it has nothing better to do. We are not friends. We are colleagues.',
      yourself: 'You are a question the ruin keeps asking. I have not yet decided what the answer is. That is not pessimism. That is craft.',
      the_keeper: 'The Keeper is the door. The fire is the hinge. I do not say that to be cryptic; I say it because it is the simplest summary I have.',
      the_smith: 'Carries an old grief politely. He will not name it. Naming it would cost more than carrying it. I respect this.',
      the_archivist: 'She writes down what I tell her. She thinks I do not know. I always know. She writes it differently than I said it. That is also fine.',
      the_gravekeeper: 'The most honest man here. He has invented a way of looking at the world that does not require him to lie to himself. I am still working on mine.',
      the_oracle: 'I do not predict. I REMEMBER FORWARD. Different craft, same stillness. I will tell you what I saw if you can pay for the seeing.',
      the_wanderer: 'He has walked all the way around the place his life is going. Now he is sitting at the center. He has not noticed yet. He will.',
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
      {
        // Milestone — reached the final floor at least once. Wanderer
        // recognizes the traveler who has seen the throne.
        advance: () => (records && (records.maxFloor | 0) >= 4),
        text: [
          'So you\u2019ve seen the throne.',
          'You came back anyway. Most who get that far do not — not because the throne kills them, though it often does. Because coming back is harder than staying.',
          'That is the part of this story I was waiting to see.',
        ],
      },
    ],
    service: {
      type: 'wanderer_gift',
      label: 'A GIFT',
    },
    // Voice: introspective, road-worn, tired in a peaceful way.
    chatLines: [
      'My pack is lighter than it was last time. That is what packs do, when stopped.',
      'Walking is a habit. Stopping is a discipline. I am still learning the second.',
      'The road home is the one you find on the way to somewhere else.',
      'I met a wanderer once who did not stop. We did not have much to say.',
      'You bring news without telling me any. Posture is a kind of map.',
      'Rest a little. Even the road sleeps, between travelers.',
    ],
    // Voice: introspective. He knows everyone the way travelers know
    // the towns they pass through — by the marks on the road, the
    // shape of the people, the way doors are hung.
    topics: {
      the_ruin: 'The ruin is the only road I have not walked. I came up to the lip of it once. Looked down. Decided I was carrying enough already. That is not cowardice. That is inventory.',
      the_hamlet: 'The hamlet is what happens when a place has been lived in long enough that the place starts living back. I have seen this maybe four times. It is always the same shape and always different.',
      the_watcher: 'Heard about it. Some travelers say they hear it most clearly at altitude — on a pass, near a peak. Down here, it is muffled. That suits me.',
      yourself: 'You walk like someone who has not yet decided whether they are coming home or leaving. I know that walk well. It changes only when you decide.',
      the_keeper: 'The fire is what stopped me. Most fires are owned by someone who would rather you stand outside it. This one was not.',
      the_smith: 'A soldier who became a smith. There is a road from the one to the other. I have walked it. Not for myself — for a friend.',
      the_archivist: 'She has written about me, I think. I do not mind. There are worse fates than being indexed.',
      the_gravekeeper: 'He counts people the way I count miles. We have the same hands.',
      the_oracle: 'She has been down further than I have ever walked. I respect a traveler who came back. Most do not. That is what makes them travelers.',
      the_wanderer: 'I have stopped. Not for good. For long enough. The road will be there when I want it. The road is patient. That is most of what the road is.',
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

// Casual chat — return the next chat line for an NPC and bump the index.
// Returns null if the NPC has no chatLines (graceful fallback). The index
// wraps modulo the chatLines length so the conversation stays alive
// indefinitely; players cycling through eventually see the same line again
// after a full pass, which is fine — the lines are atmospheric, not unique.
export function getNextChatLine(npcId) {
  const def = NPCS[npcId];
  if (!def || !Array.isArray(def.chatLines) || def.chatLines.length === 0) return null;
  const cur = hamletState.npcChatIdx[npcId] | 0;
  const line = def.chatLines[cur % def.chatLines.length];
  hamletState.npcChatIdx[npcId] = (cur + 1) % def.chatLines.length;
  saveHamletState();
  return line;
}

// Returns true if the NPC has any chatLines defined. Used by the dialogue
// modal to gate the SPEAK button (no point showing it for an NPC with
// nothing casual to say).
export function npcHasChat(npcId) {
  const def = NPCS[npcId];
  return !!(def && Array.isArray(def.chatLines) && def.chatLines.length > 0);
}

// ============================================================================
// TOPIC DIALOGUE HELPERS
//
// availableTopicsForNpc — the set of topic chips the modal should render
// for a given NPC. Filtered by:
//   1. NPC has an answer for the topic (def.topics[topicId] is a non-empty
//      string)
//   2. The topic's visible() gate passes (cross-NPC topics gate on whether
//      that NPC has arrived; the_watcher gates on watcher state)
//   3. We never show the chip for the NPC's own topic about themselves
//      (e.g. the Smith answers `the_smith` about the Smith — already
//      covered by chatLines/arcStages, no need for self-referential chip)
//
// getTopicAnswer — returns the answer string and marks the topic as seen.
//
// hasUnseenTopics — used by the SPEAK/topic-button area to render a
// "•" indicator hinting "there's something new to ask about."
// ============================================================================

export function availableTopicsForNpc(npcId) {
  const def = NPCS[npcId];
  if (!def || !def.topics) return [];
  const out = [];
  for (const tid of ALL_TOPIC_IDS) {
    const topic = TOPICS[tid];
    if (!topic) continue;
    // Skip self-reference — Smith's "the_smith" topic is suppressed
    // when the Smith is the speaker (it would be circular).
    if (tid === `the_${npcId}`) continue;
    // NPC must have an answer
    const answer = def.topics[tid];
    if (typeof answer !== 'string' || answer.length === 0) continue;
    // Topic must pass visibility gate
    try {
      if (!topic.visible(hamletState)) continue;
    } catch (_e) { continue; }
    out.push({ id: tid, label: topic.label });
  }
  return out;
}

export function getTopicAnswer(npcId, topicId) {
  const def = NPCS[npcId];
  if (!def || !def.topics) return null;
  const answer = def.topics[topicId];
  if (typeof answer !== 'string' || answer.length === 0) return null;
  // Mark seen
  hamletState.npcTopicSeen[`${npcId}_${topicId}`] = true;
  saveHamletState();
  return answer;
}

export function isTopicSeen(npcId, topicId) {
  return !!hamletState.npcTopicSeen[`${npcId}_${topicId}`];
}

export function hasUnseenTopics(npcId) {
  const topics = availableTopicsForNpc(npcId);
  for (const t of topics) {
    if (!isTopicSeen(npcId, t.id)) return true;
  }
  return false;
}
