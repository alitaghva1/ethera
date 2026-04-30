// ============================================================================
// GLOBAL ERROR BOUNDARY
//
// Catches uncaught exceptions and unhandled promise rejections at the window
// level, then renders a friendly "something went wrong" overlay with a reload
// button instead of leaving the player staring at a frozen black canvas.
//
// Intentionally minimal: we surface the error message, not the full stack.
// A full stack on-screen would confuse non-dev players and leak internal
// structure. DevTools console still has the full stack (we re-log it).
// ============================================================================

let _errorEl = null;
let _firedOnce = false;

/**
 * Install global handlers. Call once at boot from main.js.
 * Safe to call multiple times — internally idempotent.
 */
export function installErrorBoundary() {
  if (installErrorBoundary._installed) return;
  installErrorBoundary._installed = true;

  window.addEventListener('error', (ev) => {
    const msg = ev?.error?.message || ev?.message || 'unknown error';
    console.error('[boundary] uncaught:', ev?.error || ev);
    showErrorOverlay(msg);
  });

  window.addEventListener('unhandledrejection', (ev) => {
    const msg = ev?.reason?.message || String(ev?.reason) || 'unhandled promise rejection';
    console.error('[boundary] unhandled rejection:', ev?.reason);
    showErrorOverlay(msg);
  });
}

/**
 * Phase 5 audit fix #3 — wrap a function in try/catch so render-loop
 * exceptions surface to the error overlay instead of leaving a frozen
 * canvas. The window-level handlers above catch uncaught exceptions
 * outside requestAnimationFrame, but a throw INSIDE the rAF callback
 * tears down the loop silently — the canvas freezes mid-frame and
 * window.onerror doesn't fire because rAF callbacks are wrapped in
 * the browser's own queue. This guard makes the catch explicit.
 *
 * Usage:
 *   const tick = guardRender(_tickInner);
 *   requestAnimationFrame(tick);
 *
 * The first thrown exception triggers the overlay; subsequent throws
 * are swallowed (overlay already shows, no point cascading). The
 * callback is NOT re-scheduled after a throw — letting the loop die
 * is the right call when state may be corrupted.
 *
 * @param {Function} fn
 * @returns {Function}
 */
export function guardRender(fn) {
  let _renderDied = false;
  return function (...args) {
    if (_renderDied) return;     // halt rAF chain after first fatal
    try {
      return fn.apply(this, args);
    } catch (err) {
      _renderDied = true;
      console.error('[boundary] render-loop fatal:', err);
      showErrorOverlay(err?.message || String(err) || 'render-loop fatal');
    }
  };
}

/**
 * Sentinel check for asset references. Pass the image (or any value)
 * + a name; warns ONCE per name and returns false when missing so
 * callers can early-return their draw without ctx.drawImage(undefined).
 * Failure mode the audit identified: a sprite that fails to load
 * silently makes ctx.drawImage a no-op, leaving the player to wonder
 * why their hero or enemy is invisible. This makes the gap audible
 * (in the dev console) without flooding it with repeated warnings.
 *
 * @param {*} value
 * @param {string} name
 * @returns {boolean} true when value is truthy
 */
const _warnedAssets = new Set();
export function assertAsset(value, name) {
  if (value) return true;
  if (!_warnedAssets.has(name)) {
    _warnedAssets.add(name);
    try { console.warn('[boundary] missing asset:', name); } catch (_e) {}
  }
  return false;
}

function showErrorOverlay(message) {
  // Only show the first fatal once — repeated errors in a render loop would
  // stack overlays infinitely. Subsequent errors still log to console.
  if (_firedOnce) return;
  _firedOnce = true;

  _errorEl = document.createElement('div');
  _errorEl.id = '__etheraErrorOverlay';
  _errorEl.setAttribute('role', 'alertdialog');
  _errorEl.setAttribute('aria-label', 'Ethera: a problem occurred');
  _errorEl.style.cssText = [
    'position:fixed', 'inset:0', 'display:flex', 'align-items:center',
    'justify-content:center', 'flex-direction:column', 'gap:18px',
    'background:radial-gradient(ellipse at center,#1a0a12 0%,#0a0410 60%,#050205 100%)',
    'color:#f4d9a0', 'font-family:Georgia,serif', 'z-index:99999',
    'padding:32px', 'box-sizing:border-box', 'text-align:center',
  ].join(';');

  // The message is HTML-escaped below via textContent assignment on the
  // child nodes. Never interpolate the error into innerHTML directly.
  const ornament = document.createElement('div');
  ornament.style.cssText = 'color:#c9a86a;font-size:11px;letter-spacing:6px;font-style:italic;opacity:0.8;';
  ornament.textContent = '\u2014 the ruin stutters \u2014';

  const title = document.createElement('h1');
  title.style.cssText = 'font-size:40px;margin:0;letter-spacing:8px;color:#d8556a;text-shadow:0 0 22px rgba(216,85,106,0.55);font-weight:400;';
  title.textContent = 'SOMETHING WENT WRONG';

  const subtitle = document.createElement('p');
  subtitle.style.cssText = 'margin:0;color:#c8a8a8;font-size:13px;letter-spacing:3px;font-style:italic;max-width:480px;line-height:1.6;';
  subtitle.textContent = 'An unexpected error interrupted the run. Your progress up to the last save is intact. You can reload to continue.';

  // Error details (collapsed, small) — honest but non-intimidating.
  const details = document.createElement('pre');
  details.style.cssText = 'margin:8px 0 0;color:#8a7a6a;font-family:monospace;font-size:11px;max-width:520px;white-space:pre-wrap;word-break:break-word;opacity:0.7;';
  details.textContent = message.substring(0, 240);

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:14px;margin-top:8px;';

  const reloadBtn = document.createElement('button');
  reloadBtn.style.cssText = 'background:linear-gradient(180deg,#3a2a20,#1a0f08);color:#f4d9a0;border:0;padding:12px 38px;font-size:14px;cursor:pointer;letter-spacing:5px;font-family:Georgia,serif;font-weight:bold;box-shadow:inset 0 0 0 1px #c9a86a, 0 0 22px rgba(201,168,106,0.25);transition:filter 0.18s ease;';
  reloadBtn.textContent = 'RELOAD';
  reloadBtn.onmouseenter = () => { reloadBtn.style.filter = 'brightness(1.18)'; };
  reloadBtn.onmouseleave = () => { reloadBtn.style.filter = 'none'; };
  reloadBtn.onclick = () => { location.reload(); };

  btnRow.appendChild(reloadBtn);
  _errorEl.appendChild(ornament);
  _errorEl.appendChild(title);
  _errorEl.appendChild(subtitle);
  _errorEl.appendChild(details);
  _errorEl.appendChild(btnRow);
  (document.body || document.documentElement).appendChild(_errorEl);
}
