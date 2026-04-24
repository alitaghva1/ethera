// Keyframe deltas per animation state, in NORMALIZED image space (0..1).
// Each state declares its output frame count + a small set of named
// keyframes; the generator interpolates between them at runtime.
//
// Coordinate convention: (0,0) = top-left of the sprite. Positive Y is
// DOWN toward the feet, negative Y is UP toward the head. All deltas
// are applied on top of each direction's estimated rest pose, so we
// only author the motion VERB ("left leg forward"), not per-direction
// pixel coordinates.

// Tweening helpers
function lerp(a, b, t) { return a + (b - a) * t; }
function sinPingPong(t) { return (Math.sin(t * Math.PI * 2 - Math.PI / 2) + 1) / 2; }
// Blend two keyframes' deltas by t (0..1). Returns a single delta map.
function blendDelta(a, b, t) {
  const out = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) out[k] = lerp(a[k] || 0, b[k] || 0, t);
  return out;
}

// Apply a delta map to a rest pose → returns a full keypoint set.
export function applyDelta(rest, delta) {
  return rest.map((k) => ({ ...k, y: k.y + (delta[k.label] || 0), x: k.x + (delta[`${k.label}_X`] || 0) }));
}

// Build N interpolated keypoint frames for a given state. `tween` is
// 'sin' for ping-pong oscillation (idle breath, walk) or 'linear-path'
// for keyframe-sequenced motion (attack, hurt, death).
export function buildFrames(state, rest) {
  const { count, keyframes, tween } = state;
  if (count < 2) throw new Error('state.count must be >= 2');

  const frames = [];
  if (tween === 'sin' && keyframes.length === 2) {
    // Ping-pong between keyframes[0] (t=0) ↔ keyframes[1] (t=1).
    for (let i = 0; i < count; i++) {
      const u = i / count;                // 0..1 exclusive of 1
      const t = sinPingPong(u);
      frames.push(applyDelta(rest, blendDelta(keyframes[0].delta, keyframes[1].delta, t)));
    }
  } else {
    // Linear sequential tween along the keyframe list. For count frames
    // distributed across (keyframes.length - 1) segments, each frame is
    // an interpolation within its segment.
    const segs = keyframes.length - 1;
    for (let i = 0; i < count; i++) {
      const u = (i / (count - 1)) * segs;    // position along segment chain
      const k0 = Math.min(Math.floor(u), segs - 1);
      const k1 = k0 + 1;
      const t = u - k0;
      frames.push(applyDelta(rest, blendDelta(keyframes[k0].delta, keyframes[k1].delta, t)));
    }
  }
  return frames;
}

// STATE LIBRARY — five animation states + frame counts matching our
// current hero.js expectations exactly (idle 6, walk 8, attack 7,
// hurt 4, death 4).
export const POSES = {
  idle: {
    count: 6,
    tween: 'sin',
    keyframes: [
      { name: 'rest',   delta: {} },
      { name: 'breath', delta: { NOSE: -0.004, NECK: -0.003 } },
    ],
  },
  walk: {
    count: 8,
    tween: 'sin',
    keyframes: [
      { name: 'left_stride',
        delta: {
          'LEFT HIP': -0.008, 'LEFT KNEE': -0.04, 'LEFT LEG': -0.055,
          'RIGHT HIP': 0.006, 'RIGHT KNEE': 0.02, 'RIGHT LEG': 0.02,
        } },
      { name: 'right_stride',
        delta: {
          'RIGHT HIP': -0.008, 'RIGHT KNEE': -0.04, 'RIGHT LEG': -0.055,
          'LEFT HIP': 0.006, 'LEFT KNEE': 0.02, 'LEFT LEG': 0.02,
        } },
    ],
  },
  attack: {
    count: 7,
    tween: 'linear-path',
    keyframes: [
      { name: 'rest',   delta: {} },
      { name: 'windup',
        delta: {
          'RIGHT ELBOW': -0.05, 'RIGHT ARM': -0.07,
          'LEFT ELBOW': -0.02,  'LEFT ARM': -0.03,
          NECK: -0.006,
        } },
      { name: 'strike',
        delta: {
          'RIGHT ELBOW': 0.04,  'RIGHT ARM': 0.08,
          'LEFT ELBOW': 0.02,   'LEFT ARM': 0.04,
          NECK: 0.006,
        } },
      { name: 'recover', delta: {} },
    ],
  },
  hurt: {
    count: 4,
    tween: 'linear-path',
    keyframes: [
      { name: 'rest',   delta: {} },
      { name: 'recoil', delta: {
          NECK: 0.02, NOSE: 0.02,
          'LEFT SHOULDER': 0.02, 'RIGHT SHOULDER': 0.02,
          'LEFT ELBOW': 0.015, 'RIGHT ELBOW': 0.015,
        } },
      { name: 'recover', delta: {} },
    ],
  },
  death: {
    count: 4,
    tween: 'linear-path',
    keyframes: [
      { name: 'rest',   delta: {} },
      { name: 'stagger', delta: { NECK: 0.04, NOSE: 0.05 } },
      { name: 'fall',    delta: { NECK: 0.12, NOSE: 0.18,
          'LEFT SHOULDER': 0.08, 'RIGHT SHOULDER': 0.08,
          'LEFT ELBOW': 0.12, 'RIGHT ELBOW': 0.12,
        } },
    ],
  },
};

// The 8 compass directions PixelLab supports, listed in the order we'll
// use for sprite sheet ROWS (north-first clockwise). This determines
// the grid layout on every assembled sheet.
export const DIRECTIONS = [
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
];

export const STATES = ['idle', 'walk', 'attack', 'hurt', 'death'];
