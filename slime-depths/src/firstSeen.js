// ============================================================================
// FIRST-SEEN — generic "have I seen this before?" set, persisted across runs.
//
// A single localStorage-backed Set keyed by `${kind}:${id}` strings. The
// pattern factors out the bespoke "seen X once" flags scattered across the
// codebase (PROLOGUE_KEY, EPILOGUE_KEY, the tips seen-set, etc.) so any new
// "first time" beat — first hamlet entry, first boss-kind sighting, first
// mythic, first elite affix — can register a one-line check instead of
// growing a parallel KEY/HAS/MARK trio every time.
//
// API:
//   loadFirstSeen()         — call once at boot, hydrates the set from disk
//   markSeen(kind, id?)     — adds (kind:id) to the set, persists, returns
//                             true if it was new, false if already seen
//   hasSeen(kind, id?)      — pure read; does NOT mark
//   isFirstTime(kind, id?)  — atomic check-and-mark for one-time cinematics
//                             (returns true exactly once for any (kind:id))
//
// `id` defaults to 'any' so kinds without sub-ids (e.g. `hamlet:wake`,
// `mythic:any`) read naturally as `isFirstTime('hamlet', 'wake')` or
// `isFirstTime('mythic')`.
//
// Conventions for kind/id strings (keep these stable — they're persisted):
//   hamlet:wake          first-ever hamlet entry "you wake here" cinematic
//   descent:1            first-ever descent into floor 1 (suppress floor card?)
//   boss:<id>            first sighting of a specific boss (epithet stage)
//   mythic:any           first mythic relic acquisition
//   affix:<id>           first encounter with an elite affix
//   floor:<n>            first arrival at floor n (codex unlock?)
// ============================================================================

import { safeLoadJSON, safeSaveJSON } from './storage.js';

const KEY = 'ethera:first_seen:v1';
const seen = new Set();

export function loadFirstSeen() {
  const arr = safeLoadJSON(KEY, null, Array.isArray);
  if (arr) for (const id of arr) seen.add(id);
}

function save() {
  safeSaveJSON(KEY, [...seen]);
}

/**
 * Mark a (kind, id) tuple as seen. Idempotent.
 * @returns {boolean} true if newly added, false if already in the set.
 */
export function markSeen(kind, id = 'any') {
  const k = `${kind}:${id}`;
  if (seen.has(k)) return false;
  seen.add(k);
  save();
  return true;
}

/**
 * Pure read — does NOT mark. Use this when you need the answer without
 * committing to a "first time" event firing.
 */
export function hasSeen(kind, id = 'any') {
  return seen.has(`${kind}:${id}`);
}

/**
 * Atomic check-and-mark for one-time cinematics. Returns true exactly once
 * for any (kind, id); subsequent calls return false. Use for any beat that
 * should fire once, ever, and never again — e.g. the hamlet wake, a first-
 * boss epithet stage, a first-mythic full-screen vignette.
 */
export function isFirstTime(kind, id = 'any') {
  const k = `${kind}:${id}`;
  if (seen.has(k)) return false;
  seen.add(k);
  save();
  return true;
}
