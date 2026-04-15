"""
Build slime sprite sheets from an 8-direction turnaround image.

Input: slime 8 frame.jpg (2 rows x 4 cols turnaround)
Output: 16 PNG sprite strips (8 dirs x 2 anims) in ethera/assets/characters/PVGames/Slime/

Layout of input (from the generated turnaround):
  Top row: S, SW, W, NW
  Bottom row: N, NE, E, SE

Each output strip: 10 frames at 150x150px = 1500x150 PNG
Animation is generated via squash/stretch transforms of the base image.
"""

from PIL import Image, ImageFilter
import os
import math

# --- Config ---
INPUT_PATH = 'C:/Users/14164/Documents/Claude/Projects/Project - Ethera/slime 8 frame.jpg'
OUTPUT_DIR = 'C:/Users/14164/Documents/Claude/Projects/Project - Ethera/ethera/.claude/worktrees/eager-sinoussi/ethera/assets/characters/PVGames/Slime'

FRAME_W = 150
FRAME_H = 150
NUM_FRAMES = 10

# Direction mapping: (row, col) in the turnaround image -> direction name
# Top row L->R: S, SW, W, NW
# Bottom row L->R: N, NE, E, SE
DIR_MAP = {
    'S':  (0, 0),
    'SW': (0, 1),
    'W':  (0, 2),
    'NW': (0, 3),
    'N':  (1, 0),
    'NE': (1, 1),
    'E':  (1, 2),
    'SE': (1, 3),
}

def extract_slime_from_cell(img, row, col, cell_w, cell_h):
    """Extract the slime blob from a cell, cropping tightly and centering on FRAME_WxFRAME_H."""
    x1 = col * cell_w
    y1 = row * cell_h
    cell = img.crop((x1, y1, x1 + cell_w, y1 + cell_h))

    # Find the bounding box of non-black content
    # Convert to grayscale, threshold
    gray = cell.convert('L')
    pixels = gray.load()
    min_x, min_y, max_x, max_y = cell_w, cell_h, 0, 0
    for y in range(cell_h):
        for x in range(cell_w):
            if pixels[x, y] > 20:  # threshold for non-black
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)

    if max_x <= min_x or max_y <= min_y:
        # Fallback: use whole cell
        min_x, min_y = 0, 0
        max_x, max_y = cell_w - 1, cell_h - 1

    # Add small padding
    pad = 4
    min_x = max(0, min_x - pad)
    min_y = max(0, min_y - pad)
    max_x = min(cell_w - 1, max_x + pad)
    max_y = min(cell_h - 1, max_y + pad)

    # Crop to bounding box
    cropped = cell.crop((min_x, min_y, max_x + 1, max_y + 1))

    # Scale to fit within FRAME_W x FRAME_H with margin
    blob_w, blob_h = cropped.size
    target_size = int(FRAME_W * 0.65)  # smaller — leave 30%+ bottom padding like wizard sprites
    scale = min(target_size / blob_w, target_size / blob_h)
    new_w = max(1, int(blob_w * scale))
    new_h = max(1, int(blob_h * scale))
    scaled = cropped.resize((new_w, new_h), Image.LANCZOS)

    # Position slime in upper portion of frame with ~30% bottom padding.
    # This matches how wizard sprites have their body in the top ~70% of the frame,
    # which makes yAnchor=0.72 work correctly for isometric depth sorting.
    canvas = Image.new('RGBA', (FRAME_W, FRAME_H), (0, 0, 0, 0))
    offset_x = (FRAME_W - new_w) // 2
    offset_y = max(0, int(FRAME_H * 0.05))  # pin near top with small top margin

    # Convert scaled image to RGBA and strip black background
    scaled_rgba = scaled.convert('RGBA')
    px = scaled_rgba.load()
    for y in range(scaled_rgba.height):
        for x in range(scaled_rgba.width):
            r, g, b, a = px[x, y]
            brightness = r + g + b
            if brightness < 45:
                px[x, y] = (0, 0, 0, 0)  # near-black → transparent
            elif brightness < 90:
                # Dark fringe → partial alpha for smooth edges
                px[x, y] = (r, g, b, min(255, int((brightness - 45) * (255 / 45))))

    canvas.paste(scaled_rgba, (offset_x, offset_y), scaled_rgba)

    return canvas


def build_animation_strip(base_frame, anim_type):
    """
    Build a 10-frame animation strip from a single base frame.

    idle: gentle breathing squash/stretch cycle
    walk: bouncier movement with more pronounced squash
    """
    strip = Image.new('RGBA', (FRAME_W * NUM_FRAMES, FRAME_H), (0, 0, 0, 0))

    for i in range(NUM_FRAMES):
        t = i / NUM_FRAMES  # 0.0 to 0.9
        angle = t * 2 * math.pi  # full cycle

        if anim_type == 'idle':
            sx = 1.0 + math.sin(angle) * 0.04
            sy = 1.0 - math.sin(angle) * 0.04
            offset_y = math.sin(angle) * 2
        else:  # walk
            sx = 1.0 + math.sin(angle) * 0.07
            sy = 1.0 - math.sin(angle) * 0.07
            offset_y = -abs(math.sin(angle)) * 6

        new_w = max(1, int(FRAME_W * sx))
        new_h = max(1, int(FRAME_H * sy))

        transformed = base_frame.resize((new_w, new_h), Image.LANCZOS)

        frame = Image.new('RGBA', (FRAME_W, FRAME_H), (0, 0, 0, 0))
        paste_x = (FRAME_W - new_w) // 2
        paste_y = (FRAME_H - new_h) // 2 + int(offset_y)

        paste_x = max(-new_w + 1, min(FRAME_W - 1, paste_x))
        paste_y = max(-new_h + 1, min(FRAME_H - 1, paste_y))

        frame.paste(transformed, (paste_x, paste_y), transformed)

        strip.paste(frame, (i * FRAME_W, 0), frame)

    return strip


def main():
    print(f"Loading turnaround from: {INPUT_PATH}")
    img = Image.open(INPUT_PATH)
    w, h = img.size
    cell_w = w // 4
    cell_h = h // 2
    print(f"Image: {w}x{h}, Cell: {cell_w}x{cell_h}")

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Extract base frames for each direction
    base_frames = {}
    for dir_name, (row, col) in DIR_MAP.items():
        base = extract_slime_from_cell(img, row, col, cell_w, cell_h)
        base_frames[dir_name] = base
        print(f"  Extracted {dir_name} from row={row}, col={col}")

    # Build animation strips for each direction and animation type
    for dir_name, base in base_frames.items():
        for anim in ['idle', 'walk']:
            strip = build_animation_strip(base, anim)
            out_path = os.path.join(OUTPUT_DIR, f'{anim}-{dir_name}.png')
            strip.save(out_path, 'PNG')
            print(f"  Saved: {anim}-{dir_name}.png ({strip.size[0]}x{strip.size[1]})")

    print(f"\nDone! {len(base_frames) * 2} sprite strips saved to {OUTPUT_DIR}")


if __name__ == '__main__':
    main()
