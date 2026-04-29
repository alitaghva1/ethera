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
  // Familiarity counter — bumped on every dialogue open. Tier
  // thresholds at FAMILIARITY_TIERS gate deeper topics + soften
  // the displayed status label ("a stranger" → "trusted").
  npcFamiliarity: {},
  // Last-visit timestamp (ms epoch) per NPC — drives the
  // "longAbsence" reactive greeting trigger. Updated on
  // dialogue open, AFTER the reactive greeting check.
  npcLastVisit: {},
  // Last-seen-greeting key per NPC — prevents the same reactive
  // greeting from re-firing on consecutive opens within a session.
  // Cleared on run lifecycle events (death, victory) so a new
  // run state can trigger fresh greetings.
  npcGreetingShown: {},
  // Preoccupation rotation — the NPC's current "thinking about X"
  // index. Bumped occasionally so the line surfaces on some opens
  // and the NPC's apparent attention drifts between visits.
  npcPreoccupationIdx: {},
  // Last-run summary — written by main.js at run end (death + victory
  // paths). Cleared after the next run starts so each outcome triggers
  // exactly one wave of reactive greetings across the hamlet visits.
  lastRunOutcome: null,        // 'death' | 'victory' | null
  lastRunFloor: 0,             // floor reached at run end
  lastRunBossesKilled: 0,      // bosses killed in that run
  lastRunRelics: 0,            // relics picked in that run
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
// KEEPER WAKE MONOLOGUE — first-ever entry cinematic.
//
// Replaces the abstract "ETHERA / a wound the world remembers" prologue
// (text on a black screen with no speaker). Now the Keeper herself is
// the speaker; the lines play in the live hamlet over a translucent
// darkness, with a sigil halo on her painted position. Reframes the
// whole roguelite: the player's first run isn't an introduction to
// the ruin — it's their SECOND descent. The Keeper has already pulled
// them out once. Every subsequent death + return is more of the same
// thing she has been doing all along.
//
// 7 beats, advanced by click/space/enter, type-on character reveal so
// each line reads as SPOKEN. The final beat — "I am always here when
// you come back" — is the load-bearing line; it makes every future
// roguelite death have a witness.
// ============================================================================
export const KEEPER_WAKE_BEATS = [
  'You are awake.',
  'I was beginning to think you would not be.',
  'I pulled you up the stairs four nights ago. You were not breathing. The ruin had taken most of what you were carrying — your sword, your boots, your name. You came back without them.',
  'The fire here is small. It is also patient. So am I.',
  'You will want to go back down. They always do. The place below has had many names. Ethera is the one we are using this season. The wound, in its own language.',
  'When you are ready, the door waits where the path drops away. You will need to find what is yours again — or what will pass for yours.',
  'I am the Keeper. I will be here when you come back. I am always here when you come back.',
];

// ============================================================================
// FAMILIARITY TIERS — Skyrim disposition + Stardew heart-style relationship.
//
// Bumped by 1 on each dialogue open (capped at 30 to keep the system from
// running away). Tier crossings unlock deeper topics on each NPC and
// adjust the displayed status label ("a stranger" → "trusted") so the
// player can feel the relationship deepen.
//
// Tier 0 stranger:    just met or rarely visited — only universal topics
// Tier 1 acquainted:  5+ visits — first deeper topic unlocks per NPC
// Tier 2 friend:      15+ visits — second deeper topic unlocks
// Tier 3 trusted:     30+ visits — final personal topic unlocks
// ============================================================================
export const FAMILIARITY_TIERS = [
  { min: 0,  id: 'stranger',   label: 'a stranger' },
  { min: 5,  id: 'acquainted', label: 'an acquaintance' },
  { min: 15, id: 'friend',     label: 'a friend' },
  { min: 30, id: 'trusted',    label: 'trusted' },
];
export function getFamiliarityTier(npcId) {
  const n = (hamletState.npcFamiliarity[npcId] | 0);
  let tier = 0;
  for (let i = 0; i < FAMILIARITY_TIERS.length; i++) {
    if (n >= FAMILIARITY_TIERS[i].min) tier = i;
  }
  return tier;
}
export function getFamiliarityLabel(npcId) {
  return FAMILIARITY_TIERS[getFamiliarityTier(npcId)].label;
}
// Bump familiarity on dialogue open. Capped so a determined player can't
// inflate it indefinitely with empty visits — at 30 the relationship is
// "trusted" and there's nothing more to unlock anyway.
export function bumpFamiliarity(npcId) {
  const cur = hamletState.npcFamiliarity[npcId] | 0;
  if (cur >= 30) return cur;
  hamletState.npcFamiliarity[npcId] = cur + 1;
  saveHamletState();
  return cur + 1;
}

// True if the next bump would CROSS into a higher familiarity tier
// (stranger → acquainted at 5, acquainted → friend at 15, friend →
// trusted at 30). Used by openDialogue to fire a tier-up chord +
// brief banner so the relationship's deepening is felt, not just
// silently reflected in the subtitle label.
export function nextBumpCrossesTier(npcId) {
  const cur = hamletState.npcFamiliarity[npcId] | 0;
  if (cur >= 30) return false;
  const next = cur + 1;
  // Tier mins (must mirror FAMILIARITY_TIERS)
  for (const t of FAMILIARITY_TIERS) {
    if (cur < t.min && next >= t.min) return t;
  }
  return false;
}

// ============================================================================
// REACTIVE GREETING CONTEXT — built once per dialogue open.
//
// Inspects player records + last-run summary + last-visit time to flag
// which reactive triggers are "live" right now. Each NPC's
// reactiveGreetings array is filtered against this context; the first
// matching line wins.
//
// Run-end summary fields (lastRunOutcome, lastRunFloor, lastRunRelics,
// lastRunBossesKilled) live on hamletState — main.js writes them at
// run end (death + victory paths). They're cleared after the next
// run starts so a death-greeting only fires ONCE between runs.
// ============================================================================
export function buildGreetingContext(records, ctx) {
  return {
    runs:           (records && records.runsStarted) | 0,
    runsCompleted:  (records && records.runsCompleted) | 0,
    maxFloor:       (records && records.maxFloor) | 0,
    bossKills:      (records && records.bossKillsAllTime) | 0,
    seenRelicCount: (ctx && ctx.seenRelicIds) ? ctx.seenRelicIds.size : 0,
    // Convenience flags pre-computed for greeting `when` predicates.
    // The lastRun* fields are written by main.js on run end. They're
    // ephemeral — cleared after the next run starts so each death
    // gets exactly one "you fell" greeting per NPC visit chain.
    justDied:    hamletState.lastRunOutcome === 'death',
    justVictory: hamletState.lastRunOutcome === 'victory',
    narrowDeath: hamletState.lastRunOutcome === 'death' && (hamletState.lastRunFloor | 0) >= 3,
    // mythicTouched: originally gated on the player having seen any
    // mythic relic (eye_of_ether / cataclysm). Mythics roll only on
    // floor 4 at ~6%, so most players never tripped this flag and the
    // four mythic-tier reactive greetings sat dead. Hamlet audit P0 —
    // also flag on first legendary discovery so the "you carry
    // something the others have not" beat fires earlier in the climb.
    mythicTouched: !!(ctx && ctx.seenRelicIds && (
      ctx.seenRelicIds.has('eye_of_ether') ||
      ctx.seenRelicIds.has('cataclysm') ||
      // any legendary in the seen set is rare enough to count
      ctx.seenRelicIds.has('avatar_of_flame') ||
      ctx.seenRelicIds.has('phoenix_cloak') ||
      ctx.seenRelicIds.has('wanderers_cloak') ||
      ctx.seenRelicIds.has('ethereal_binding') ||
      ctx.seenRelicIds.has('aegis_pulse') ||
      ctx.seenRelicIds.has('vow_eternal') ||
      ctx.seenRelicIds.has('honest_edge') ||
      ctx.seenRelicIds.has('ringing_steel')
    )),
    // longAbsence + isFirstMeeting resolved per-NPC at filter time.
  };
}
// Per-NPC long-absence helper — true if it's been more than `hours`
// since the player last opened this NPC's dialogue. Returns true on
// first visit too (no prior timestamp).
export function isLongAbsence(npcId, hours = 72) {
  const last = hamletState.npcLastVisit[npcId] || 0;
  if (!last) return false;     // first visit isn't a "long absence" — that's its own trigger
  const ms = Date.now() - last;
  return ms >= hours * 3600 * 1000;
}
// First-meeting helper — true if we've never recorded a visit to this NPC.
// The greeting "first meeting" only fires once. After that, npcLastVisit
// is set and subsequent opens read as "you returned."
export function isFirstMeeting(npcId) {
  return !hamletState.npcLastVisit[npcId];
}
// Stamp a visit. Called from openDialogue AFTER the greeting + preoccupation
// have been resolved (so they read against the OLD state, not the new).
export function stampVisit(npcId) {
  hamletState.npcLastVisit[npcId] = Date.now();
  saveHamletState();
}

// Run-lifecycle hook — main.js calls this on death + victory.
// The lastRun* state persists from run-end through the next hamlet
// visit chain; it is OVERWRITTEN by the next recordRunEnd, not
// explicitly cleared. The per-NPC `npcGreetingShown` map is reset
// here so reactive greetings can fire afresh on the next visits.
// Practical effect: each death or victory triggers exactly one
// fresh wave of greetings across the NPCs, then the wave settles
// until the player ends another run.
export function recordRunEnd(outcome, floor, bossesKilled, relics) {
  hamletState.lastRunOutcome = outcome;             // 'death' | 'victory'
  hamletState.lastRunFloor = floor | 0;
  hamletState.lastRunBossesKilled = bossesKilled | 0;
  hamletState.lastRunRelics = relics | 0;
  hamletState.npcGreetingShown = {};
  saveHamletState();
}

// ============================================================================
// REACTIVE GREETING RESOLVER
//
// Returns the first greeting line whose `when` predicate matches the current
// context, OR null if no reactive greeting applies. Each NPC's greeting is
// shown at most once per "run-end wave" — once the player has seen a
// greeting for a given key, it doesn't re-fire until the wave is cleared.
//
// Predicate forms supported (any field on the def):
//   when: 'firstMeeting'         — function shorthand
//   when: 'longAbsence'
//   when: 'justDied'
//   when: 'justVictory'
//   when: 'narrowDeath'
//   when: 'mythicTouched'
//   when: (ctx, npcId) => bool   — function form
// ============================================================================
function _matchPredicate(when, ctx, npcId) {
  if (typeof when === 'function') {
    try { return !!when(ctx, npcId); } catch (_e) { return false; }
  }
  if (typeof when !== 'string') return false;
  switch (when) {
    case 'firstMeeting':  return isFirstMeeting(npcId);
    case 'longAbsence':   return isLongAbsence(npcId);
    case 'justDied':      return !!ctx.justDied;
    case 'justVictory':   return !!ctx.justVictory;
    case 'narrowDeath':   return !!ctx.narrowDeath;
    case 'mythicTouched': return !!ctx.mythicTouched;
    default: return false;
  }
}
export function resolveReactiveGreeting(npcId, ctx) {
  const def = NPCS[npcId];
  if (!def || !Array.isArray(def.reactiveGreetings)) return null;
  // Per-NPC suppression: don't repeat the same greeting twice in a row
  // within a single run-end wave (cleared on new run-end).
  const shownKey = hamletState.npcGreetingShown[npcId];
  for (let i = 0; i < def.reactiveGreetings.length; i++) {
    const g = def.reactiveGreetings[i];
    if (!g || !g.text) continue;
    if (!_matchPredicate(g.when, ctx, npcId)) continue;
    const key = g.key || `${i}_${g.when}`;
    if (key === shownKey) continue;     // already shown this wave
    // Stamp the greeting key so we don't fire it again until the wave clears
    hamletState.npcGreetingShown[npcId] = key;
    saveHamletState();
    return g.text;
  }
  return null;
}

// ============================================================================
// PREOCCUPATION RESOLVER — Pyre-style "what they're thinking about today."
// Returns one current preoccupation line (or null) and bumps the rotation
// index. Renders as a small italic preface above the body when a preoccupation
// is "active." We don't surface it on EVERY open — every 3rd visit feels
// natural — so the line lands as observation, not announcement.
// ============================================================================
export function getCurrentPreoccupation(npcId, ctx) {
  const def = NPCS[npcId];
  if (!def || !Array.isArray(def.preoccupations) || def.preoccupations.length === 0) return null;
  const visits = (hamletState.npcFamiliarity[npcId] | 0);
  // Surface roughly every 3rd visit (1/3 chance) — feels organic, not promo.
  if (visits === 0 || (visits % 3) !== 0) return null;
  // Rotate against the FULL preoccupation array (not the filtered eligible
  // set) so the saved index stays stable across visits whose `when` ctx
  // changes. Without this, the index `2` could point at preoccupation A
  // on a visit where one entry filters out, then preoccupation B on the
  // next when context shifts the eligible set — surfacing the wrong line
  // (e.g. an everyday line right after a death when a death-flavored
  // entry was meant to fire). Entries without text are always skipped.
  const all = def.preoccupations.filter(p => p && p.text);
  if (all.length === 0) return null;
  const start = (hamletState.npcPreoccupationIdx[npcId] | 0) % all.length;
  for (let step = 0; step < all.length; step++) {
    const i = (start + step) % all.length;
    const p = all[i];
    if (!p.when || _matchPredicate(p.when, ctx, npcId)) {
      hamletState.npcPreoccupationIdx[npcId] = (i + 1) % all.length;
      saveHamletState();
      return p.text;
    }
  }
  return null;
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
// Smith (floor 2 clear) — bank a chosen relic as next-run heirloom.
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
    portrait: 'npc_v2_keeper',
    x: 54, y: 74,                      // at the central firepit (painted backdrop)
    tint: '#f4d9a0',
    unlockCheck: () => true,           // always present
    unlockHint: '',
    arcStages: [
      {
        advance: () => true,           // first meet, always
        // Stage 0 reads as "the introduction is over, here is the
        // ongoing thing." The wake-cinematic monologue (KEEPER_WAKE_BEATS,
        // first-ever entry only) does the heavy narrative lift —
        // stage 0 just establishes the loop.
        text: [
          'You return.',
          'Every time you come back, a little of the ruin comes with you, and a little of the light returns in trade. They call it essence. I can shape it into things that endure between your descents.',
          'Speak when you have it to spend. The fire is patient.',
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
    // Reactive greetings — first matching predicate is shown ONCE per
    // run-end wave, prepended to the arcStage as a small italic preface.
    // Order matters: more specific triggers first, generic last.
    reactiveGreetings: [
      { when: 'firstMeeting', text: 'You are new. The fire knows you anyway. Sit, traveler.' },
      { when: 'narrowDeath',  text: 'You were close, were you not. I felt the air change.' },
      { when: 'justVictory',  text: 'Something happened down there. I can see it on you. Tell me later — first, the fire.' },
      { when: 'justDied',     text: 'You came back without all of yourself. Sit. The fire is warm enough for two.' },
      { when: 'longAbsence',  text: 'You were gone a long time. The candles waited. So did I.' },
      { when: 'mythicTouched',text: 'You carry something the others have not. The candles bend toward it. Be careful.' },
    ],
    // Preoccupations — surface ~1-in-3 visits, render as a small
    // italic line above the body. Voice: warm, observational, slightly
    // worried about the others.
    preoccupations: [
      { text: 'I have been thinking about the smith. He has not eaten today.' },
      { text: 'The wanderer settled differently this morning. Like he intends to stay.' },
      { text: 'The book is heavier than yesterday. The archivist has been busy.' },
      { when: 'justDied', text: 'I have been thinking about how I would tell the others, if you did not come back. I am glad I did not have to.' },
    ],
    // Personal topics — gated by familiarity tier. Stranger = nothing
    // unlocked. Acquaintance = first deep topic. Friend = second.
    // Trusted = the most personal disclosure.
    personalTopics: {
      the_name: { label: 'Your Name', minTier: 1, text: 'What did people call you, before? Not your name. The other one — the one only the people who fed you used. I had one of those. I have forgotten the people who used it. I have not forgotten the word.' },
      the_door: { label: 'A Way Out',  minTier: 2, text: 'There is a way out of this season that does not go down. I will not name it. I will not point to it. You have not asked. I respect that. When you are ready, ask.' },
      the_keeper_was: { label: 'Who You Were', minTier: 3, text: 'I was a girl who tended a fire in a different town. The town is gone. The fire — this fire — is the same one. I do not know how. I no longer try to know.' },
    },
  },

  smith: {
    id: 'smith',
    name: 'The Smith',
    title: 'keeper of warm steel',
    role: 'Bank one relic by the forge — it returns to you on your next descent.',
    portrait: 'npc_v2_smith',
    x: 24, y: 74,                      // at the painted forge doorway (left)
    tint: '#ff8a60',
    unlockCheck: (records) => records.maxFloor >= 2,
    unlockHint: 'A forge, cold. Reach floor 2 to kindle it.',
    arcStages: [
      {
        advance: () => true,
        // Hamlet-audit P0 — first-meeting dialogue used to promise a
        // two-relic merge that doesn't exist; the actual service banks
        // a single chosen relic (the heirloom) for next descent. Now
        // honest about the mechanic; the "anvil takes two voices"
        // flavor in chatLines + topics still holds at the abstract
        // level (smith + steel as two voices).
        text: [
          'You walked far enough to find me.',
          'That means something. Not many do — the ruin eats the ones who turn back.',
          'Bring me one piece you would carry again. I will keep it warm by the door. When you walk down next, it will go with you. The older name for this was an heirloom. I do not ask where it came from.',
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
      the_smith: 'Soldier, then smith. The middle stretch I keep to myself. The other parts went into the work.',
      // Hamlet-audit P1 — smith + gravekeeper were both veterans whose
      // personalTopics confirmed military pasts (the_war / the_gravekeeper_was)
      // but the cross-NPC topics never acknowledged the recognition.
      // Biggest available narrative win in the hamlet's social graph.
      the_archivist: 'Reads. A lot. I\'ve never read a book that improved a hammer. I assume the books are doing other things.',
      the_gravekeeper: 'He counts. I appreciate someone who counts. Means he\'ll notice if I go missing. He carries himself like a man who gave the orders. I carried out enough of them to recognize the posture. We have not spoken about it. We will not.',
      the_oracle: 'She told me my next strike would land slightly left. She was right. I do not know how I feel about it.',
      the_wanderer: 'Walks lighter than a man with a pack should. He\'ll move on when he\'s done. They always do.',
    },
    reactiveGreetings: [
      { when: 'firstMeeting', text: 'You\'re new. Mind the slag. Bring me what doesn\'t serve.' },
      { when: 'narrowDeath',  text: 'You came up bleeding. Don\'t bleed on the steel.' },
      { when: 'justVictory',  text: 'Something\'s different. You walk like you\'ve been listened to.' },
      { when: 'justDied',     text: 'Mm. Try a heavier weapon next time. Or a lighter one. Whichever you didn\'t.' },
      { when: 'longAbsence',  text: 'Thought you were dead. Glad to be wrong. Anvil missed you. So did I, a little.' },
    ],
    preoccupations: [
      { text: 'Anvil sang the wrong note this morning. Means weather\'s coming.' },
      { text: 'The wanderer asked me what war I fought in. I told him: the boring one.' },
      { text: 'Saw the keeper carry an empty pail. Either she forgot what she was doing or she was hauling something invisible. Both happen, here.' },
      { when: 'justDied', text: 'Hammer feels heavier when you don\'t come back. Don\'t make it a habit.' },
    ],
    personalTopics: {
      the_war: { label: 'The War', minTier: 1, text: 'It was a small one. Cities you\'ve never heard of fighting other cities you\'ve never heard of. We won. I do not know what we won. The man I was before came home with a hammer and an anvil. The man I was during did not come home at all.' },
      the_friend: { label: 'A Friend', minTier: 2, text: 'There was a man in my unit who could not hit anything. I taught him. He hit the wrong thing, eventually. That is why I am a smith. Not why I left the army — that came later. But why I am a smith.' },
      the_blade: { label: 'The Blade', minTier: 3, text: 'I made one weapon worth keeping in my whole life. I gave it to my friend before he died. It is somewhere in the ruin now. If you find it, do not bring it back. I do not want to see it. I want to know it is still being used.' },
    },
  },

  archivist: {
    id: 'archivist',
    name: 'The Archivist',
    title: 'of names half-remembered',
    role: 'Reveals Memory unlock conditions. Keeps the codex.',
    portrait: 'npc_v2_archivist',
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
    reactiveGreetings: [
      { when: 'firstMeeting', text: 'A new entry. I will need a fresh page. Sit, please — I will not be long.' },
      { when: 'narrowDeath',  text: 'I marked the page on which you nearly did not return. The ink is still wet.' },
      { when: 'justVictory',  text: 'You added a footnote to your own entry today. Not many do. Tell me the texture of it later.' },
      { when: 'justDied',     text: 'I have written you in again. The verb tense was easy this time. You will use the present tense for me.' },
      { when: 'longAbsence',  text: 'I had begun a new section about you. It is mostly questions. Now you are here to answer some.' },
      { when: 'mythicTouched',text: 'The book named what you carry before you brought it back. That has not happened in some time. I want to ask you about it.' },
    ],
    preoccupations: [
      { text: 'I copied a page wrong this morning, then realized I had copied it correctly. The original was wrong. The book has begun correcting me by my mistakes.' },
      { text: 'There is a margin in the codex where someone has been writing in pencil. It is not me. The handwriting matches mine.' },
      { text: 'The keeper read over my shoulder yesterday. I let her. She did not say anything. I think she liked it.' },
      { when: 'mythicTouched', text: 'The relic you carry has a long entry already. I had filed it under "rumors." Now I have a witness.' },
    ],
    personalTopics: {
      the_other_book: { label: 'The Other Book', minTier: 1, text: 'There is a second book. It is the same book. Different pages. The same spine. I do not know how that works. I keep them on different shelves so they do not argue.' },
      the_first_entry: { label: 'The First Page', minTier: 2, text: 'The first entry in the codex is about a relic that does not exist. I have never seen it. The entry is in my hand. I do not remember writing it. The hamlet had two NPCs when I arrived. The first entry is dated three years before that.' },
      the_archivist_was: { label: 'Before The Book', minTier: 3, text: 'I was a librarian in a city that no longer has a name. The library survived the city. I survived the library. The book — this book — is one of the volumes I rescued. The other volumes are still down there. I will not look for them. I have made my peace with what I saved.' },
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
    portrait: 'npc_v2_gravekeeper',
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
      the_smith: 'Has more weight in him than the work suggests. He was a soldier — I know the gait, the way men walk who have stood in lines. We were almost certainly in the same war, on the same side or the other. I have not asked. He has not offered. We make space for each other. That is enough.',
      the_archivist: 'A counter, like me, but with more letters. Different inventory. We have an understanding. We do not compare books.',
      the_gravekeeper: 'I count what is gone and what is still here. Eventually those two columns balance. Until then, I work.',
      the_oracle: 'She sees forward. I see backward. We do not interfere with each other\'s ranges. It is a courtesy I appreciate.',
      the_wanderer: 'A long traveler stopping is rarer than a tower falling. He is in my ledger as an event, not a person.',
    },
    reactiveGreetings: [
      { when: 'firstMeeting', text: 'I have your column ready. It is empty for now. I find that comforting. You may not.' },
      { when: 'narrowDeath',  text: 'I almost wrote your line. I had the quill down. Then you were here.' },
      { when: 'justVictory',  text: 'A boss\'s entry is heavier than a knight\'s. I added the weight just now.' },
      { when: 'justDied',     text: 'You returned. The ledger does not always allow returns. Whatever you bargained, the ruin honored.' },
      { when: 'longAbsence',  text: 'Your column had grown still. I was beginning to round it down.' },
    ],
    preoccupations: [
      { text: 'The smith\'s column has not changed in some time. That is information. Either he is being careful, or he is becoming the kind of person who does not show in ledgers.' },
      { text: 'A name appeared in the count this morning that I did not write. I will leave it. The ledger has the right to amend itself.' },
      { text: 'I counted the keeper\'s heartbeats once, while she slept by the fire. She has more than she should. I have not asked.' },
      { when: 'narrowDeath', text: 'Three close calls in the same descent leaves a residue on the page. I have been looking at yours.' },
    ],
    personalTopics: {
      the_count_in_you: { label: 'What He Counts', minTier: 1, text: 'I do not count your hours. I count the hours BETWEEN your descents. The waiting. That is the part most counters miss. The dead, after all, are easy to count. The not-yet-dead are the discipline.' },
      the_first_grave: { label: 'The First Grave', minTier: 2, text: 'I started counting because I lost a number, once. A number that would not let me sleep. I added one to it. The math relaxed. I am still adding. The number is no longer the original number, but the addition has become the work.' },
      the_gravekeeper_was: { label: 'Before The Ledger', minTier: 3, text: 'I was a soldier. I was a general. I was the man whose orders meant the columns of dead I now keep. I learned to count in the only school that teaches it correctly. I am here, in the hamlet, because counting backward is the only way I know to atone. I am very nearly back to zero.' },
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
    portrait: 'npc_v2_oracle',
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
    reactiveGreetings: [
      { when: 'firstMeeting', text: 'I saw you arrive. Three times, in fact, in three different futures. Sit. Two of the three were pleasant.' },
      { when: 'narrowDeath',  text: 'You almost. I told you. I told you the card and you nodded and then almost. That is how the deck works.' },
      { when: 'justVictory',  text: 'You took the path I refused to look at. I was right not to look. You were right to walk.' },
      { when: 'justDied',     text: 'I drew the card I drew. You did what you did. The forward-dark is patient with neither of us.' },
      { when: 'longAbsence',  text: 'You returned. I had stopped predicting your visits, which is when they become predictable.' },
      { when: 'mythicTouched',text: 'The cards rearranged themselves last night. I think you were the cause. I am not displeased.' },
    ],
    preoccupations: [
      { text: 'The deck shuffled itself this morning. It does this. I let it.' },
      { text: 'The wanderer has been dreaming of a road I have already walked. I have decided not to tell him.' },
      { text: 'A card I have not seen before fell out of the deck this week. I have not put it back. I have not yet looked at it.' },
      { when: 'longAbsence', text: 'I drew you, in your absence. The card I got was a door. Standing open.' },
    ],
    personalTopics: {
      the_door_below: { label: 'The Door Below', minTier: 1, text: 'Most who reach the throne stop there. I went past. There is a door behind the throne. It opens both ways. I came back through it. I do not know if I closed it.' },
      the_corridor: { label: 'The Corridor', minTier: 2, text: 'The ruin is not, in fact, a depth. It is a CORRIDOR. The descent is a foreshortening — you walk a long way and call it down. I walked the actual length once. It took longer than the descent. It taught me to read sideways.' },
      the_oracle_returned: { label: 'Why She Returned', minTier: 3, text: 'I came back because I saw, on the other side, what stopping doing this would look like. It looked like a quiet life I could live for as many years as I wanted, in a place that was kind. I came back to refuse it. I do not know if I will refuse it forever. But I refused it that day.' },
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
    portrait: 'npc_v2_wanderer',
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
    reactiveGreetings: [
      { when: 'firstMeeting', text: 'A new walker. Sit by the pack — that is where the conversations happen. Don\'t mind the road dust; it remembers being a road.' },
      { when: 'narrowDeath',  text: 'You came up close. I have come up close, in my walking. The trick is not to let it become a habit.' },
      { when: 'justVictory',  text: 'You walked further than most. The road I would offer you is shorter, and easier. Hear me out before you refuse it.' },
      { when: 'justDied',     text: 'The pack is here. Sit. Walking starts again when sitting ends — there\'s no hurry.' },
      { when: 'longAbsence',  text: 'You\'ve been on a road of your own. Tell me where it goes, when you have words for it.' },
    ],
    preoccupations: [
      { text: 'I dreamed of a road I have already walked, last night. That used to mean it was time to leave. Now I think it just means I have walked a lot of roads.' },
      { text: 'The smith asked me what war I fought in. I gave him the polite answer. He gave me the quiet of a man who heard the impolite one anyway.' },
      { text: 'The keeper sets aside soup for me, even when I tell her I have eaten. She is right and I am lying. I do not know how she knows.' },
      { when: 'firstMeeting', text: 'I have not introduced myself to a new traveler in a long time. I am out of practice with the opening.' },
    ],
    personalTopics: {
      the_friend_for: { label: 'For Whom He Walked', minTier: 1, text: 'I walked the road for someone who could not. I do not say her name. The roads remember names. I would rather they remembered her face.' },
      the_road_home: { label: 'The Road Home', minTier: 2, text: 'There is a road that goes back to where I started. I have not walked it. I will, some day. Not yet. Some roads you walk last because you want them to be the last thing.' },
      the_wanderer_was: { label: 'Before The Pack', minTier: 3, text: 'I was a man with a fixed address. A small one. Two rooms. A garden the size of a coin. I left it because someone needed someone to walk somewhere very far. I have been walking for years. The garden is gone. The two rooms are gone. The person I was walking for has been gone for longer than the garden. The walking is what I have left of all of them. I am not sad about this. I am, in fact, quite well.' },
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
  const tier = getFamiliarityTier(npcId);
  const out = [];
  // Universal topics from the global TOPICS catalog
  for (const tid of ALL_TOPIC_IDS) {
    const topic = TOPICS[tid];
    if (!topic) continue;
    if (tid === `the_${npcId}`) continue;     // suppress self-reference
    const answer = def.topics[tid];
    if (typeof answer !== 'string' || answer.length === 0) continue;
    try {
      if (!topic.visible(hamletState)) continue;
    } catch (_e) { continue; }
    out.push({ id: tid, label: topic.label });
  }
  // Per-NPC personal topics, keyed under def.personalTopics. Each entry is
  // { label, minTier, text } where minTier gates visibility on familiarity.
  // Reads as deeper conversation only the NPC's friends would hear.
  if (def.personalTopics) {
    for (const tid in def.personalTopics) {
      const t = def.personalTopics[tid];
      if (!t || typeof t.text !== 'string' || t.text.length === 0) continue;
      if ((t.minTier | 0) > tier) continue;
      out.push({ id: tid, label: t.label || tid, personal: true });
    }
  }
  return out;
}

export function getTopicAnswer(npcId, topicId) {
  const def = NPCS[npcId];
  if (!def) return null;
  // Try universal topic first, then fall back to per-NPC personal topic.
  let answer = (def.topics && def.topics[topicId]) || null;
  if (!answer && def.personalTopics && def.personalTopics[topicId]) {
    answer = def.personalTopics[topicId].text;
  }
  if (typeof answer !== 'string' || answer.length === 0) return null;
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
