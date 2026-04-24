// Shared constants + prompt library for Knight sprite generation.
// Every script pulls from here so the character stays consistent across
// base + animation states.

// Target sprite resolution. 96 matches the hero's on-screen HERO_DRAW
// size and the chibi proportions of the reference character the user
// built in the PixelLab UI (92×92, rounded up). Animations will later
// use animateWithSkeleton which accepts 16/32/64/128/256; we'll feed
// it our 96-base and let it scale — or we pad to 128 on the reference.
export const SPR = 96;

// Canonical RNG seed — locks the character's face/pose/palette across
// every call. If we regen a single state, same seed keeps it on-model.
export const SEED = 730041;

// Structured params reused by every call. Matches the user's
// original PixelLab UI character (ID e04407b4-8457-42e6-8edf-3ca9e59d02f5):
// "low top-down view" + closed-helm chibi + muted fantasy palette.
export const COMMON = {
  view: 'low top-down',                         // the UI default
  direction: 'south',                           // game flips horizontally in code
  outline: 'single color black outline',
  shading: 'basic shading',                     // flatter look matches chibi style
  detail: 'medium detail',
  textGuidanceScale: 8,
  noBackground: true,
};

// Prompt library. `moderate` is the default — it's the exact prompt the
// user used in the PixelLab web UI to make the character they liked.
// Terse / descriptive variants exist for quick A/B during prompt tuning.
export const KNIGHT_PROMPTS = {
  terse:
    'chibi knight, silver plate, red tabard, longsword, pixel art',
  moderate:
    'top-down chibi knight, silver plate armor, red tabard, closed helm, ' +
    'longsword, pixel art, muted fantasy palette',
  descriptive:
    'top-down chibi knight in polished silver plate armor with vivid crimson ' +
    'tabard, closed pointed helm with narrow visor slit, longsword held low at ' +
    'the right side, small round buckler on left arm, leather belt with gold ' +
    'buckle, heroic stance, dark fantasy roguelite pixel art, muted fantasy ' +
    'palette with clean silver body and rich red accents',
};

// Per-state frame counts — match hero.js:1302-1311 exactly so the
// new PNGs are drop-in compatible once SPR flips to 128.
export const ANIM_STATES = {
  idle:   { frames: 6, fps: 6,  loop: true  },
  walk:   { frames: 8, fps: 12, loop: true  },
  attack: { frames: 7, fps: 18, loop: false },
  hurt:   { frames: 4, fps: 12, loop: false },
  death:  { frames: 4, fps: 8,  loop: false },
};

// Raw generation artifacts live here. Assembled sheets land in
// public/assets/characters/. The `out/` dir is gitignored so we can
// regenerate freely without polluting the repo.
export const OUT_DIR = 'scripts/pixellab/out';
export const ASSEMBLED_DIR = 'public/assets/characters';
