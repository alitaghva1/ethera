// ESLint flat config (v9+). Kept deliberately permissive — this is a living
// codebase, not a greenfield project. CI should catch *new* problems, not
// spend the first 100 commits fighting existing style choices. Strictness
// ratchets up over time as TypeScript migration proceeds.
import js from '@eslint/js';
import globals from 'globals';

export default [
  // Global ignores — everything under these paths is out of scope.
  {
    ignores: ['dist/**', 'public/**', 'node_modules/**', 'sim/**', 'tools/**'],
  },

  // Recommended JS baseline (no-undef, no-unused-private-class-members, etc.)
  js.configs.recommended,

  // Game source (src/) — browser globals, ESM, permissive rules.
  {
    files: ['src/**/*.js', 'src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      // The codebase uses single quotes nearly everywhere — enforce it as a
      // warning so new code stays consistent without forcing a mass reformat.
      quotes: ['warn', 'single', { avoidEscape: true, allowTemplateLiterals: true }],

      // Game engines are full of intentionally-unused function parameters
      // (event handlers, callback signatures, animation hooks). Don't flag
      // unused ARGS. Variables prefixed with `_` are intentional. Caught
      // errors (`} catch (e) {`) are often swallowed on purpose — allow the
      // conventional `e`/`_e` names without nagging.
      'no-unused-vars': [
        'warn',
        {
          args: 'none',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
          ignoreRestSiblings: true,
        },
      ],

      // Some code paths legitimately swallow errors from corrupted localStorage
      // or third-party APIs. Empty catches are intentional in those spots.
      'no-empty': ['warn', { allowEmptyCatch: true }],

      // Game loops + state machines use `while (true)` and constant-condition
      // guards. Would be pure noise.
      'no-constant-condition': 'off',

      // Debug output is part of the dev workflow — the `__dbg()` hooks rely
      // on it. `console.log` in production is acceptable for a solo-dev game.
      'no-console': 'off',

      // Canvas-space math reuses x/y/i/j in nested scopes intentionally.
      'no-shadow': 'off',
    },
  },

  // Node context — build tooling and config files.
  {
    files: ['vite.config.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
];
