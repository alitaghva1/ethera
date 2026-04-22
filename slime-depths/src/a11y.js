// ============================================================================
// ACCESSIBILITY — user-preference hooks
//
// Respects the OS/browser `prefers-reduced-motion` setting. When active,
// camera shake + zoom pulse amplitude get scaled down heavily and hit-stop
// freeze-frames are shortened. The CSS side is handled in index.html via a
// matching @media (prefers-reduced-motion: reduce) block that disables the
// breathing title glow, sigil rotation, and menu hover bounces.
//
// Why this matters: shake + hit-stop + zoom kicks together cause motion
// sickness for a measurable minority of players (vestibular disorders,
// migraines, post-concussion sensitivity). Modern platform review criteria
// increasingly require respecting the OS preference.
// ============================================================================

let _cachedReducedMotion = null;

/**
 * Returns true if the user/OS has requested reduced motion. Cached per
 * session — if the preference changes mid-session we'd need an mql.onchange
 * listener, but this is vanishingly rare in practice and the cache avoids
 * matchMedia calls in hot paths (shake is called dozens of times per second).
 */
export function prefersReducedMotion() {
  if (_cachedReducedMotion !== null) return _cachedReducedMotion;
  try {
    _cachedReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_) {
    _cachedReducedMotion = false;
  }
  return _cachedReducedMotion;
}
