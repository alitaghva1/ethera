// ============================================================================
// DEV DEBUG HOOKS
//
// Attaches convenience functions to `window.__*` for use from DevTools console
// during development. Examples:
//
//   __startRun()                       skip menu, drop straight into a run
//   __dbg()                            dump hero / enemies / intro-timer state
//   __clearIntros()                    zero all intro timers (for clean A/B)
//   __forceGoto(idx)                   synchronous transition to floor[idx]
//   __jumpToBoss()                     real boss-room entry via graph flow
//   __testBossIntro('orc', 2.2)        synthetic intro render, no enemy spawn
//
// Install is gated by `import.meta.env.DEV`, which is:
//   - `true` under `npm run dev` (Vite serves the source)
//   - `false` under `npm run build` → tree-shaken out of the prod bundle
//
// This keeps the hooks available for in-browser dev while stripping them
// entirely from the Steam / Itch build. No `__jumpToBoss` leaking into a
// shipped game; no bundle-size cost for debug code in release.
//
// All hook bodies live in main.js as closures passed to installDebugHooks —
// that's how they read and write module-scoped state (bossIntroTime,
// floorCardTime, etc.) without pretending ES modules have pass-by-reference.
// ============================================================================

export function installDebugHooks(hooks) {
  for (const [name, fn] of Object.entries(hooks)) {
    // Expose as `window.__<name>` — the `__` prefix marks "dev only" by
    // convention (matches the existing `__cascadeUntil`, `__dbg`, etc.).
    window['__' + name] = fn;
  }
}
