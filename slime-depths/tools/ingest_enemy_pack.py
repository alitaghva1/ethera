#!/usr/bin/env python3
"""
Slime-Depths / Ethera — enemy pack ingest pipeline.

Converts a third-party sprite pack into the game's 100x100 horizontal-strip
format. The game expects four files per enemy:
    {prefix}_idle.png    horizontal strip of idle-animation frames
    {prefix}_walk.png    horizontal strip of walk-animation frames
    {prefix}_attack.png  horizontal strip of attack-animation frames
    {prefix}_death.png   horizontal strip of death-animation frames

Each frame is 100x100. Frame count varies per animation (5-12 typical).
Layout: frame 0 is leftmost, subsequent frames to the right.

Usage:
    python tools/ingest_enemy_pack.py warden dreadmage haunt
    python tools/ingest_enemy_pack.py --list

Add a new enemy → add an entry to PACKS below → run. No game code changes
required to produce the sprites; the enemies.js wiring is a separate step.
"""

import sys
import os
from PIL import Image

# Paths — script expected to live at slime-depths/tools/
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SLIME_DEPTHS_DIR = os.path.dirname(SCRIPT_DIR)
# The source art packs live at the git-repo root (two levels up from here).
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(SLIME_DEPTHS_DIR))))
GAME_ENEMIES_DIR = os.path.join(SLIME_DEPTHS_DIR, 'assets', 'enemies')

TARGET_FRAME_SIZE = 100  # game renders everyone in 100x100 cells

# ============================================================================
# PACK CONFIGS — each entry maps a third-party asset folder to the four
# required animation strips. 'anchor' controls how the scaled frame is
# positioned inside the 100x100 output cell:
#   'bottom' = ground enemies that stand on the floor (most)
#   'center' = flying enemies or featureless orbs
# ============================================================================
PACKS = {
    # -------------------------------------------------------
    # WARDEN — mini-boss tier undead, slow heavy hitter.
    # Source: 500x100 strips (5 frames of 100x100) — already game-sized.
    # -------------------------------------------------------
    'warden': {
        'source_root': 'Undead executioner/Undead executioner puppet/png',
        'anchor': 'bottom',
        'mappings': {
            'idle':   'idle.png',
            'walk':   'idle2.png',       # pack has no walk; re-use idle2 for locomotion
            'attack': 'attacking.png',
            'death':  'death.png',
        },
    },

    # -------------------------------------------------------
    # DREAD-MAGE — tier-3 caster with dual-pattern attacks.
    # Source: 2000x250 strips (8 frames of 250x250) — downsampled to 100x100.
    # -------------------------------------------------------
    'dreadmage': {
        'source_root': 'EVil Wizard 2/EVil Wizard 2/Sprites',
        'anchor': 'bottom',
        'mappings': {
            'idle':   'Idle.png',
            'walk':   'Run.png',
            'attack': 'Attack1.png',
            'death':  'Death.png',
        },
    },

    # -------------------------------------------------------
    # HAUNT — airborne harasser that floats over pillars.
    # Source: ~316x69 strips — small frames, upscaled with nearest-neighbor.
    # Anchor: center, since the demon's sprite has no ground-plane.
    # -------------------------------------------------------
    'haunt': {
        'source_root': 'Flying Demon 2D Pixel Art/Flying Demon 2D Pixel Art/Sprites/without_outline',
        'anchor': 'center',
        'mappings': {
            'idle':   'IDLE.png',
            'walk':   'FLYING.png',
            'attack': 'ATTACK.png',
            'death':  'DEATH.png',
        },
    },
}


def detect_frame_count(src_w, src_h):
    """Heuristic: source is a horizontal strip of roughly-square frames.
    Frame count = round(src_w / src_h). Works for 500x100 (5), 2000x250 (8),
    316x69 (~4.58 → 5, or 4 if we floor). We bias toward the floor for
    safety — a frame too many would slice into the next animation's
    artifacts; one too few just wastes frames the pack provided."""
    ratio = src_w / max(1, src_h)
    # Specific common ratios we trust (prefer floor on .5 boundary)
    rounded = int(ratio + 0.2)
    return max(1, rounded)


def fit_into_cell(frame_rgba, size, anchor='bottom'):
    """Scale the frame to fit inside size x size, preserving aspect ratio,
    and paste onto a transparent square canvas at the given anchor."""
    fw, fh = frame_rgba.size
    scale = size / max(fw, fh)
    new_w = max(1, int(round(fw * scale)))
    new_h = max(1, int(round(fh * scale)))
    # Pixel-art convention: use nearest-neighbor for upscale (preserves
    # hard edges), Lanczos for downscale (anti-aliased — smoother).
    resample = Image.NEAREST if scale >= 1 else Image.LANCZOS
    scaled = frame_rgba.resize((new_w, new_h), resample)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    if anchor == 'bottom':
        # Ground enemies: align to bottom, center horizontally.
        ox = (size - new_w) // 2
        oy = size - new_h
    else:
        # Center for flying / orb enemies.
        ox = (size - new_w) // 2
        oy = (size - new_h) // 2
    out.paste(scaled, (ox, oy), scaled)
    return out


def process_strip(source_path, output_path, anchor):
    """Load a horizontal strip, rescale each frame to 100x100, write as
    a new strip. Returns (frame_count, out_width, out_height)."""
    src = Image.open(source_path).convert('RGBA')
    sw, sh = src.size
    frame_count = detect_frame_count(sw, sh)
    frame_w = sw // frame_count
    frame_h = sh

    out_w = frame_count * TARGET_FRAME_SIZE
    out_h = TARGET_FRAME_SIZE
    out = Image.new('RGBA', (out_w, out_h), (0, 0, 0, 0))

    for i in range(frame_count):
        x = i * frame_w
        frame = src.crop((x, 0, x + frame_w, frame_h))
        # If the frame has large empty margins, we COULD trim them first —
        # but that risks misalignment across frames. Keep the raw extraction.
        cell = fit_into_cell(frame, TARGET_FRAME_SIZE, anchor=anchor)
        out.paste(cell, (i * TARGET_FRAME_SIZE, 0), cell)

    out.save(output_path, 'PNG')
    return frame_count, out_w, out_h


def ingest_pack(prefix, verbose=True):
    cfg = PACKS.get(prefix)
    if not cfg:
        print(f'! unknown pack: {prefix}')
        return False
    source_root = os.path.join(PROJECT_ROOT, cfg['source_root'])
    anchor = cfg.get('anchor', 'bottom')
    if verbose:
        print(f'\n--- Ingesting: {prefix} (source: {cfg["source_root"]}, anchor: {anchor}) ---')
    any_written = False
    for state, source_file in cfg['mappings'].items():
        src = os.path.join(source_root, source_file)
        dst = os.path.join(GAME_ENEMIES_DIR, f'{prefix}_{state}.png')
        if not os.path.exists(src):
            print(f'  ! skip {state}: source missing at {src}')
            continue
        try:
            count, w, h = process_strip(src, dst, anchor)
            print(f'  {state:7} {source_file:24} -> {prefix}_{state}.png  ({count} frames, {w}x{h})')
            any_written = True
        except Exception as e:
            print(f'  ! failed {state}: {e}')
    return any_written


def main(argv):
    if len(argv) < 2 or argv[1] in ('-h', '--help'):
        print(__doc__)
        print('Known packs:', ', '.join(PACKS.keys()))
        sys.exit(0)
    if argv[1] == '--list':
        for name, cfg in PACKS.items():
            print(f'  {name}: {cfg["source_root"]}')
        sys.exit(0)
    ok_all = True
    for prefix in argv[1:]:
        ok = ingest_pack(prefix)
        ok_all = ok_all and ok
    print('\n=== ' + ('DONE' if ok_all else 'COMPLETED WITH ISSUES') + ' ===')


if __name__ == '__main__':
    main(sys.argv)
