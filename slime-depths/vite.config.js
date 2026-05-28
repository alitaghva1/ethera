import { defineConfig } from 'vite';
import { rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

// Vite config for slime-depths.
//
// Design notes:
// - `base: './'` makes all emitted HTML/asset URLs relative. Required so the
//   built bundle works under Electron's `file://` protocol and any deployment
//   that's not mounted at a domain root. Absolute `/` would 404 in packaged.
// - `strictPort` keeps us on 5173 — the project's canonical dev port from
//   CLAUDE.md + memory. If the port is busy, fail loudly rather than roam.
// - `publicDir: 'public'` + the public/assets/ directory holds the 174 game
//   assets (images, audio) that loader.js references by string URL. Vite
//   doesn't see those references (they're not ES imports), so we keep them
//   out of the asset pipeline entirely. Vite copies public/ to dist/ as-is
//   and serves it verbatim in dev. URLs like `/assets/backdrops/foo.jpg`
//   resolve identically in dev and built output.
// - `assetsInlineLimit: 4096` is only for ES-imported assets (none today);
//   harmless default.
//
// Entry point is read from `slime-depths/index.html`'s <script type="module">
// tag — Vite walks the import graph from src/main.js automatically.

// Phase 2 unification — strip bake-time-only directories from the production
// bundle. `public/assets/packs/` (~105MB of TMX source + tilesets + props) is
// INPUT to scripts/bake-crypt-sample-room.js. The runtime consumes the BAKED
// outputs at `public/assets/rooms/*.{png,json}`, never the source. Without
// this plugin, `npm run build` would copy the 4993-file pack tree verbatim
// into dist/, ballooning the production payload by 100+ MB. The bake outputs
// (rooms/) are kept; packs/ is removed post-copy.
const stripBakeSources = () => ({
  name: 'slime-depths-strip-bake-sources',
  apply: 'build',
  async closeBundle() {
    const targets = [
      'dist/assets/packs',          // ~105 MB TMX source
    ];
    for (const t of targets) {
      const p = resolve(process.cwd(), t);
      try {
        await stat(p);
        await rm(p, { recursive: true, force: true });
        // eslint-disable-next-line no-console
        console.log(`[strip-bake-sources] removed ${t}`);
      } catch (_e) {
        // Path didn't exist — nothing to remove. Quiet success.
      }
    }
  },
});

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    assetsInlineLimit: 4096,
  },
  publicDir: 'public',
  plugins: [stripBakeSources()],
});
