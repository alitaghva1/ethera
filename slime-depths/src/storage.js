// ============================================================================
// STORAGE HEALTH — detect blocked localStorage, warn the player.
//
// Release-prep pass: all 16+ modules that persist state use
// `try { localStorage.setItem(...) } catch(e) {}` patterns that silently
// swallow failures. On Safari private browsing, iOS low-storage, or
// corporate extension blocks, saves fail silently and the player sees
// progress evaporate between sessions with no explanation.
//
// This module probes storage availability once at boot and, if blocked,
// renders a small persistent indicator at the bottom of the screen so
// the player knows their run won't carry over.
//
// NOT in scope: migrating the 16 call sites to go through a wrapper.
// Each module already has its own try/catch; rewiring them is a follow-up.
// ============================================================================

let _available = null;
let _warningEl = null;

export function isStorageAvailable() {
  if (_available !== null) return _available;
  try {
    const probe = '__ethera_storage_probe__';
    localStorage.setItem(probe, '1');
    if (localStorage.getItem(probe) !== '1') throw new Error('read-back failed');
    localStorage.removeItem(probe);
    _available = true;
  } catch (_e) {
    _available = false;
  }
  return _available;
}

/**
 * Call once at boot. If storage is blocked, renders a persistent warning
 * chip. No-op otherwise (and no-op if called twice — element is singleton).
 */
export function showStorageWarningIfBlocked() {
  if (isStorageAvailable()) return;
  if (_warningEl) return;
  _warningEl = document.createElement('div');
  _warningEl.id = '__etheraStorageWarning';
  _warningEl.setAttribute('role', 'alert');
  _warningEl.style.cssText = [
    'position:fixed',
    'bottom:10px',
    'left:50%',
    'transform:translateX(-50%)',
    'background:rgba(46,14,18,0.9)',
    'color:#ff9a9a',
    'padding:6px 14px',
    'font-family:Georgia,serif',
    'font-size:11px',
    'letter-spacing:2px',
    'font-style:italic',
    'border:1px solid rgba(160,96,96,0.6)',
    'box-shadow:0 0 18px rgba(216,90,90,0.25)',
    'z-index:9999',
    'pointer-events:none',
    'user-select:none',
  ].join(';');
  _warningEl.textContent = '\u26A0 progress will not save \u2014 browser storage is blocked';
  (document.body || document.documentElement).appendChild(_warningEl);
}
