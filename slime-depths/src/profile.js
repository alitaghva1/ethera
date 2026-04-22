// ============================================================================
// PROFILE / SAVE-SLOT SYSTEM — "JOURNALS"
//
// The game maintains three independent save slots (Journals I, II, III), each
// with its own essence, records, unlocks, discovered relics, hamlet state,
// etc. Switching journals reloads the page.
//
// NOTE: internal code still uses `profile_*` storage keys and variable names
// like `volumesEl`, `showVolumesModal` — those are implementation details
// from a previous "Volumes" naming and are not user-visible. The UI reads
// "Journal I / II / III" everywhere.
//
// ARCHITECTURE: a single monkey-patch of localStorage at bootstrap time
// prefixes every read/write/delete with `profile_<activeId>:`. The rest of
// the codebase is unchanged — modules continue to call
// `localStorage.getItem('ethera:records:v1')` etc. and it Just Works.
//
// Keys beginning with `_profile:` bypass the prefix — those are the meta-
// state of the profile system itself (which volume is active, migration
// flags) and must persist across all volumes.
//
// MIGRATION: on first load after this system ships, an existing save under
// the legacy (unprefixed) keys is copied to `profile_i:<key>` so the player
// lands back on their save untouched. Legacy originals are left in place
// for one release as rollback insurance.
// ============================================================================

// Unprefixed metadata keys — never scoped to a profile.
const ACTIVE_KEY = '_profile:active';
const MIGRATED_KEY = '_profile:migrated:v1';

// Valid profile IDs, in display order.
export const PROFILE_IDS = ['i', 'ii', 'iii'];

// Every game key that existed before this system — needed for first-boot
// migration. Do NOT regex-match; an explicit list is the rollback anchor.
// If new game keys are added, they'll auto-route through the prefix and
// need no entry here. This list is historical only.
const LEGACY_KEYS = [
  // ethera: family
  'ethera:achievements:v1',
  'ethera:curses:v1',
  'ethera:daily:v1',
  'ethera:seen_enemies:v1',
  'ethera:fusions_discovered:v1',
  'ethera:hamlet_state:v1',
  'ethera:memory_selected:v1',
  'ethera:memories_unlocked:v1',
  'ethera:records:v1',
  'ethera:seen_relics:v1',
  'ethera:ruin:v1',
  'ethera:settings:v1',
  'ethera:tarot_seen:v1',
  'ethera:seen_tips:v1',
  'ethera:seen_prologue:v1',
  'ethera:seen_epilogue:v1',
  'ethera:run_snapshot:v1',
  // slimeDepths: family (only meta.js uses this prefix)
  'slimeDepths:meta:v1',
];

// Captured BEFORE patching — these call through to the native localStorage
// and are used for profile-metadata access (bypassing the prefix).
let _rawGet, _rawSet, _rawRemove, _rawKey, _rawLength;

// Cached active profile id (read once at bootstrap).
let _activeProfileId = 'i';

// Has installProfilePrefix() run yet? Guard against double-install.
let _installed = false;

/**
 * Install the localStorage monkey-patch. MUST be called before any other
 * module reads localStorage, i.e. at the top of main.js's module body.
 *
 * - Captures native get/set/remove so profile-metadata reads bypass the patch
 * - Reads the active profile id (default 'i')
 * - On first boot after this system ships, copies legacy keys into the
 *   active profile's namespace
 * - Patches localStorage.{getItem,setItem,removeItem} to auto-prefix
 */
export function installProfilePrefix() {
  if (_installed) return;
  _installed = true;

  _rawGet = localStorage.getItem.bind(localStorage);
  _rawSet = localStorage.setItem.bind(localStorage);
  _rawRemove = localStorage.removeItem.bind(localStorage);
  _rawKey = localStorage.key.bind(localStorage);
  // `length` is a getter on the prototype — can't bind, access via closure.
  _rawLength = () => localStorage.length;

  // Read the active profile id. Default 'i'. Validate against known set.
  try {
    const stored = _rawGet(ACTIVE_KEY);
    if (stored && PROFILE_IDS.indexOf(stored) !== -1) {
      _activeProfileId = stored;
    } else {
      _rawSet(ACTIVE_KEY, _activeProfileId);
    }
  } catch (e) { /* fall through */ }

  // One-time migration: copy legacy (unprefixed) keys into profile_i.
  // This only runs on the FIRST boot after this system ships. For all
  // subsequent boots (any profile active), the migrated flag short-circuits.
  try {
    const migrated = _rawGet(MIGRATED_KEY);
    if (!migrated) {
      for (const key of LEGACY_KEYS) {
        const val = _rawGet(key);
        if (val === null) continue;
        const target = 'profile_i:' + key;
        if (_rawGet(target) === null) _rawSet(target, val);
        // Leave legacy originals in place for one release — rollback safety.
      }
      _rawSet(MIGRATED_KEY, '1');
    }
  } catch (e) { /* non-fatal */ }

  // Patch read/write/remove. Profile-meta keys (_profile:*) bypass the prefix.
  const scopedKey = (k) => {
    if (typeof k !== 'string') return k;
    if (k.startsWith('_profile:')) return k;
    return 'profile_' + _activeProfileId + ':' + k;
  };
  localStorage.getItem = (k) => _rawGet(scopedKey(k));
  localStorage.setItem = (k, v) => _rawSet(scopedKey(k), v);
  localStorage.removeItem = (k) => _rawRemove(scopedKey(k));
}

export function getActiveProfileId() { return _activeProfileId; }

/**
 * Switch to a different profile. Reloads the page so all module in-memory
 * state gets rebuilt from the new slot's storage.
 */
export function setActiveProfile(id) {
  if (PROFILE_IDS.indexOf(id) === -1) return;
  if (id === _activeProfileId) return;
  _rawSet(ACTIVE_KEY, id);
  location.reload();
}

/**
 * Delete all keys belonging to a profile. If the deleted profile is the
 * active one, we also reload (the player needs a fresh start).
 */
export function deleteProfile(id) {
  if (PROFILE_IDS.indexOf(id) === -1) return;
  const prefix = 'profile_' + id + ':';
  // Snapshot keys first — mutation during iteration is undefined behavior.
  const toDelete = [];
  for (let i = 0; i < _rawLength(); i++) {
    const k = _rawKey(i);
    if (k && k.startsWith(prefix)) toDelete.push(k);
  }
  for (const k of toDelete) _rawRemove(k);
  if (id === _activeProfileId) location.reload();
}

/**
 * Read a summary of a profile WITHOUT switching to it. Returns:
 *   { id, exists, essence, maxFloor, runsStarted, runsCompleted, isActive }
 */
export function getProfileSummary(id) {
  const prefix = 'profile_' + id + ':';
  const out = {
    id,
    exists: false,
    essence: 0,
    maxFloor: 0,
    runsStarted: 0,
    runsCompleted: 0,
    isActive: id === _activeProfileId,
  };
  try {
    // meta.js stores { essence, unlocked } under slimeDepths:meta:v1
    const metaRaw = _rawGet(prefix + 'slimeDepths:meta:v1');
    if (metaRaw) {
      const meta = JSON.parse(metaRaw);
      out.essence = meta.essence | 0;
      out.exists = true;
    }
    // records.js stores { maxFloor, runsStarted, runsCompleted, ... }
    const recordsRaw = _rawGet(prefix + 'ethera:records:v1');
    if (recordsRaw) {
      const rec = JSON.parse(recordsRaw);
      out.maxFloor = rec.maxFloor | 0;
      out.runsStarted = rec.runsStarted | 0;
      out.runsCompleted = rec.runsCompleted | 0;
      out.exists = true;
    }
  } catch (e) { /* empty or corrupt — return defaults */ }
  return out;
}

export function listProfiles() {
  return PROFILE_IDS.map(getProfileSummary);
}

// Human-readable roman numeral for a profile id.
export function profileLabel(id) {
  return ({ i: 'I', ii: 'II', iii: 'III' })[id] || id.toUpperCase();
}
