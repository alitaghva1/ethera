"""
Build character sprite sheets from 8-direction turnaround images.

Handles: skeleton (black bg), lich (white bg), wizard (white bg)
Uses same approach as build_slime_sprites.py:
  - Slice turnaround into 8 directional views
  - Strip background to transparent
  - Position content in top ~70% of frame (matching yAnchor=0.72)
  - Generate idle + walk animation strips with subtle motion

Layout of input turnaround (2 rows x 4 cols):
  Top row: S, SW, W, NW
  Bottom row: N, NE, E, SE
"""

from PIL import Image
import os
import math

# --- Frame dimensions must match what the game expects ---
FRAME_W = 160   # matches PV_WIZARD_FW / PV_LICH_FW
FRAME_H = 200   # taller frame for humanoid characters (wizard uses 160x200)
NUM_FRAMES = 10

DIR_MAP = {
    'S':  (0, 0), 'SW': (0, 1), 'W':  (0, 2), 'NW': (0, 3),
    'N':  (1, 0), 'NE': (1, 1), 'E':  (1, 2), 'SE': (1, 3),
}

# --- Character configs ---
CHARACTERS = {
    'skeleton': {
        'input': 'C:/Users/14164/Documents/Claude/Projects/Project - Ethera/Skelaton.jpg',
        'output_dir': 'C:/Users/14164/Documents/Claude/Projects/Project - Ethera/ethera/.claude/worktrees/eager-sinoussi/ethera/assets/characters/PVGames/Skeleton',
        'bg_type': 'black',
        'bg_threshold': 50,     # pixels darker than this → transparent
        'bg_fringe': 90,        # pixels between threshold and fringe → partial alpha
    },
    'lich': {
        'input': 'C:/Users/14164/Documents/Claude/Projects/Project - Ethera/lich.jpg',
        'output_dir': 'C:/Users/14164/Documents/Claude/Projects/Project - Ethera/ethera/.claude/worktrees/eager-sinoussi/ethera/assets/characters/PVGames/Lich',
        'bg_type': 'white',
        'bg_threshold': 700,    # pixels brighter than this → transparent (sum of RGB)
        'bg_fringe': 620,       # pixels between fringe and threshold → partial alpha
    },
    'wizard': {
        'input': 'C:/Users/14164/Documents/Claude/Projects/Project - Ethera/wizard.jpg',
        'output_dir': 'C:/Users/14164/Documents/Claude/Projects/Project - Ethera/ethera/.claude/worktrees/eager-sinoussi/ethera/assets/characters/PVGames/Wizard',
        'bg_type': 'white',
        'bg_threshold': 700,
        'bg_fringe': 620,
    },
}


def strip_background(img_rgba, bg_type, threshold, fringe):
    """Convert background pixels to transparent based on bg type."""
    px = img_rgba.load()
    w, h = img_rgba.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            brightness = r + g + b
            if bg_type == 'black':
                if brightness < threshold:
                    px[x, y] = (0, 0, 0, 0)
                elif brightness < fringe:
                    px[x, y] = (r, g, b, min(255, int((brightness - threshold) * (255 / (fringe - threshold)))))
            else:  # white
                if brightness > threshold:
                    px[x, y] = (0, 0, 0, 0)
                elif brightness > fringe:
                    px[x, y] = (r, g, b, min(255, int((threshold - brightness) * (255 / (threshold - fringe)))))
    return img_rgba


def extract_from_cell(img, row, col, cell_w, cell_h, bg_type, threshold, fringe):
    """Extract character from a turnaround cell, strip bg, center in frame."""
    x1 = col * cell_w
    y1 = row * cell_h
    cell = img.crop((x1, y1, x1 + cell_w, y1 + cell_h)).convert('RGBA')

    # Strip background
    cell = strip_background(cell, bg_type, threshold, fringe)

    # Find bounding box of non-transparent content
    px = cell.load()
    min_x, min_y, max_x, max_y = cell_w, cell_h, 0, 0
    for y in range(cell_h):
        for x in range(cell_w):
            if px[x, y][3] > 20:
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)

    if max_x <= min_x or max_y <= min_y:
        return Image.new('RGBA', (FRAME_W, FRAME_H), (0, 0, 0, 0))

    # Crop to content with small padding
    pad = 4
    min_x = max(0, min_x - pad)
    min_y = max(0, min_y - pad)
    max_x = min(cell_w - 1, max_x + pad)
    max_y = min(cell_h - 1, max_y + pad)
    cropped = cell.crop((min_x, min_y, max_x + 1, max_y + 1))

    # Scale to fit within frame with ~30% bottom padding (body in top 70%)
    blob_w, blob_h = cropped.size
    target_h = int(FRAME_H * 0.68)  # content occupies top 68% of frame
    target_w = int(FRAME_W * 0.80)  # leave some horizontal margin
    scale = min(target_w / blob_w, target_h / blob_h)
    new_w = max(1, int(blob_w * scale))
    new_h = max(1, int(blob_h * scale))
    scaled = cropped.resize((new_w, new_h), Image.LANCZOS)

    # Place in upper portion of frame — content top starts at ~5% with ~30% bottom padding
    canvas = Image.new('RGBA', (FRAME_W, FRAME_H), (0, 0, 0, 0))
    offset_x = (FRAME_W - new_w) // 2
    offset_y = max(0, int(FRAME_H * 0.03))  # small top margin
    canvas.paste(scaled, (offset_x, offset_y), scaled)

    return canvas


def build_animation_strip(base_frame, anim_type):
    """Build a 10-frame animation strip with subtle idle/walk motion."""
    strip = Image.new('RGBA', (FRAME_W * NUM_FRAMES, FRAME_H), (0, 0, 0, 0))

    for i in range(NUM_FRAMES):
        t = i / NUM_FRAMES
        angle = t * 2 * math.pi

        if anim_type == 'idle':
            # Gentle breathing sway
            offset_y = math.sin(angle) * 2
            sx_scale = 1.0
            sy_scale = 1.0
        else:  # walk
            # Slight bob
            offset_y = -abs(math.sin(angle)) * 4
            sx_scale = 1.0
            sy_scale = 1.0

        new_w = max(1, int(FRAME_W * sx_scale))
        new_h = max(1, int(FRAME_H * sy_scale))
        transformed = base_frame.resize((new_w, new_h), Image.LANCZOS)

        frame = Image.new('RGBA', (FRAME_W, FRAME_H), (0, 0, 0, 0))
        paste_x = (FRAME_W - new_w) // 2
        paste_y = (FRAME_H - new_h) // 2 + int(offset_y)
        paste_x = max(-new_w + 1, min(FRAME_W - 1, paste_x))
        paste_y = max(-new_h + 1, min(FRAME_H - 1, paste_y))
        frame.paste(transformed, (paste_x, paste_y), transformed)

        strip.paste(frame, (i * FRAME_W, 0), frame)

    return strip


def build_character(name, config):
    print(f"\n=== Building {name} ===")
    img = Image.open(config['input'])
    w, h = img.size
    cell_w, cell_h = w // 4, h // 2
    print(f"  Source: {w}x{h}, cell={cell_w}x{cell_h}, bg={config['bg_type']}")

    os.makedirs(config['output_dir'], exist_ok=True)

    # Extract base frames
    base_frames = {}
    for dir_name, (row, col) in DIR_MAP.items():
        base = extract_from_cell(img, row, col, cell_w, cell_h,
                                  config['bg_type'], config['bg_threshold'], config['bg_fringe'])
        base_frames[dir_name] = base

    # Build idle + walk strips
    for dir_name, base in base_frames.items():
        for anim in ['idle', 'walk']:
            strip = build_animation_strip(base, anim)
            out_path = os.path.join(config['output_dir'], f'{anim}-{dir_name}.png')
            strip.save(out_path, 'PNG')
            print(f"  Saved: {anim}-{dir_name}.png ({strip.size[0]}x{strip.size[1]})")

    # Verify content placement in the S idle frame
    s_frame = base_frames['S']
    px = s_frame.load()
    top, bottom = FRAME_H, 0
    for y in range(FRAME_H):
        for x in range(FRAME_W):
            if px[x, y][3] > 20:
                top = min(top, y)
                bottom = max(bottom, y)
    print(f"  Content: top={top}px, bottom={bottom}px, height={bottom-top}px")
    print(f"  Bottom padding: {FRAME_H - bottom}px ({100*(FRAME_H-bottom)//FRAME_H}%)")
    print(f"  Content ends at: {100*bottom//FRAME_H}% of frame")


def main():
    for name, config in CHARACTERS.items():
        build_character(name, config)
    print(f"\nDone! All sprite sheets generated.")


if __name__ == '__main__':
    main()
