"""
Hamlet NPC placement audit.

Reads the paired hamlet scene + mask images, classifies pixels by color
signature, clusters them into features, and proposes NPC anchor positions
that:
  1. Sit beside the right thematic prop (gravestones, smith forge, etc.)
  2. Land on a walkable cell per BOTH the mask AND the tree-darkness rule
  3. Prefer the cell directly south of the feature (NPC faces camera)

World coordinate system: 1376x768 (matches the mask). The visual image is
saved at 2x resolution (2752x1536), so visual lookups go through a scale
factor.

Outputs:
  scripts/hamlet_audit.json — full proposal with bboxes + rationale
  Console summary printed at the end.
"""

from __future__ import annotations

import json
import os
import sys
from collections import deque
from dataclasses import dataclass

from PIL import Image

# ---------------------------------------------------------------------------
# Paths + canonical world dimensions
# ---------------------------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
ASSET_DIR = os.path.join(REPO_ROOT, "slime-depths", "public", "assets", "hamlet")
VISUAL_PATH = os.path.join(ASSET_DIR, "scene_v2.jpg")
MASK_PATH = os.path.join(ASSET_DIR, "scene_v2_mask.jpg")
OUT_JSON = os.path.join(SCRIPT_DIR, "hamlet_audit.json")

WORLD_W = 1376
WORLD_H = 768
TREE_DARK_THRESHOLD = 45        # matches hamletFloor.js
MASK_BLOCK_THRESHOLD = 128      # matches hamletFloor.js (white = blocked)


# ---------------------------------------------------------------------------
# Pixel classifiers — operate on (R, G, B) tuples in 0..255.
# ---------------------------------------------------------------------------
def lum(rgb):
    r, g, b = rgb
    return (r + g + b) / 3.0


def is_fire(rgb):
    """High R, R clearly above G, blue suppressed. Captures candle flame +
    forge brazier glow. Tightened B<130 vs the brief's 150 because the
    altar candles bleed onto whitish wax and we don't want that picked up."""
    r, g, b = rgb
    return r > 150 and r > g * 1.3 and b < 130


def is_portal_rune(rgb):
    """Glowing blue/violet circle — B dominant by a clear margin over R+G."""
    r, g, b = rgb
    return b > 150 and b > r + 30 and b > g + 30


def is_tree(rgb):
    """Trees in this scene render as near-black silhouettes."""
    return lum(rgb) < TREE_DARK_THRESHOLD


def is_grass(rgb):
    """Walkable grass — green dominant, mid-range luminance."""
    r, g, b = rgb
    if not (g > r and g > b):
        return False
    L = lum(rgb)
    return 90 <= L <= 200 and (g - r) > 10


def is_cobble(rgb):
    """Walkable cobble — neutral grey, mid luminance."""
    r, g, b = rgb
    if max(abs(r - g), abs(g - b), abs(r - b)) > 30:
        return False
    L = lum(rgb)
    return 110 <= L <= 200


def is_wall(rgb):
    """Compound stone wall — neutral grey but darker than cobble floor."""
    r, g, b = rgb
    if max(abs(r - g), abs(g - b), abs(r - b)) > 25:
        return False
    L = lum(rgb)
    return 50 <= L <= 110


def is_gravestone(rgb):
    """Gravestone silhouettes — mid-grey rectangles, neutral, slightly
    darker than wall stones but lighter than tree shadow. The key: they
    appear surrounded by grass."""
    r, g, b = rgb
    if max(abs(r - g), abs(g - b), abs(r - b)) > 20:
        return False
    L = lum(rgb)
    return 60 <= L <= 120


def is_wood_book(rgb):
    """Bookcase + scrolls — warm wood brown."""
    r, g, b = rgb
    return 70 <= r <= 140 and 40 <= g <= 100 and 20 <= b <= 70 and r > g and g > b


def is_canvas_tent(rgb):
    """Tent canvas — light warm tan."""
    r, g, b = rgb
    return 150 <= r <= 220 and 140 <= g <= 200 and 90 <= b <= 160 and r > b


# ---------------------------------------------------------------------------
# Pixel sampling helpers
# ---------------------------------------------------------------------------
@dataclass
class Imgs:
    visual: Image.Image
    mask: Image.Image
    vis_scale_x: float
    vis_scale_y: float
    vis_pix: any
    mask_pix: any

    def world_to_visual(self, x, y):
        return int(x * self.vis_scale_x), int(y * self.vis_scale_y)

    def visual_at(self, world_x, world_y):
        vx, vy = self.world_to_visual(world_x, world_y)
        if vx < 0 or vy < 0 or vx >= self.visual.width or vy >= self.visual.height:
            return (0, 0, 0)
        p = self.vis_pix[vx, vy]
        if isinstance(p, int):
            return (p, p, p)
        return p[:3]

    def mask_at(self, world_x, world_y):
        if world_x < 0 or world_y < 0 or world_x >= self.mask.width or world_y >= self.mask.height:
            return 255
        p = self.mask_pix[int(world_x), int(world_y)]
        if isinstance(p, int):
            return p
        return sum(p[:3]) // 3


def load_images():
    visual = Image.open(VISUAL_PATH).convert("RGB")
    mask = Image.open(MASK_PATH).convert("RGB")
    sx = visual.width / WORLD_W
    sy = visual.height / WORLD_H
    return Imgs(
        visual=visual,
        mask=mask,
        vis_scale_x=sx,
        vis_scale_y=sy,
        vis_pix=visual.load(),
        mask_pix=mask.load(),
    )


# ---------------------------------------------------------------------------
# Walkability — same logic as the runtime but in Python.
# ---------------------------------------------------------------------------
def is_walkable(imgs: Imgs, world_x, world_y) -> bool:
    if world_x < 0 or world_y < 0 or world_x >= WORLD_W or world_y >= WORLD_H:
        return False
    if imgs.mask_at(world_x, world_y) > MASK_BLOCK_THRESHOLD:
        return False
    rgb = imgs.visual_at(world_x, world_y)
    if lum(rgb) < TREE_DARK_THRESHOLD:
        return False
    return True


# ---------------------------------------------------------------------------
# Clustering — flood-fill connected pixels matching a predicate. We
# downsample to a coarse grid first (STEP=4 in world space) for speed; the
# resulting bboxes are upscaled back to world coordinates.
# ---------------------------------------------------------------------------
CLUSTER_STEP = 4         # world-space stride for clustering scan


def build_class_grid(imgs: Imgs, predicate, *, region=None):
    """Return a 2D list of bools at CLUSTER_STEP resolution: True where
    `predicate(rgb_at_visual)` is satisfied."""
    cols = WORLD_W // CLUSTER_STEP
    rows = WORLD_H // CLUSTER_STEP
    grid = [[False] * cols for _ in range(rows)]
    x_lo, y_lo, x_hi, y_hi = region or (0, 0, WORLD_W, WORLD_H)
    for r in range(rows):
        wy = r * CLUSTER_STEP + CLUSTER_STEP // 2
        if wy < y_lo or wy >= y_hi:
            continue
        for c in range(cols):
            wx = c * CLUSTER_STEP + CLUSTER_STEP // 2
            if wx < x_lo or wx >= x_hi:
                continue
            rgb = imgs.visual_at(wx, wy)
            if predicate(rgb):
                grid[r][c] = True
    return grid, cols, rows


def find_clusters(grid, cols, rows, *, min_size=3):
    """Connected-component scan. Returns list of dicts:
    {'bbox': (wx1, wy1, wx2, wy2), 'cx': float, 'cy': float, 'count': int}."""
    visited = [[False] * cols for _ in range(rows)]
    out = []
    for r0 in range(rows):
        for c0 in range(cols):
            if not grid[r0][c0] or visited[r0][c0]:
                continue
            q = deque()
            q.append((r0, c0))
            visited[r0][c0] = True
            cells = []
            while q:
                r, c = q.popleft()
                cells.append((r, c))
                for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    nr, nc = r + dr, c + dc
                    if 0 <= nr < rows and 0 <= nc < cols and not visited[nr][nc] and grid[nr][nc]:
                        visited[nr][nc] = True
                        q.append((nr, nc))
            if len(cells) < min_size:
                continue
            rs = [c[0] for c in cells]
            cs = [c[1] for c in cells]
            wy1 = min(rs) * CLUSTER_STEP
            wy2 = (max(rs) + 1) * CLUSTER_STEP
            wx1 = min(cs) * CLUSTER_STEP
            wx2 = (max(cs) + 1) * CLUSTER_STEP
            cx = sum(cs) / len(cs) * CLUSTER_STEP + CLUSTER_STEP / 2
            cy = sum(rs) / len(rs) * CLUSTER_STEP + CLUSTER_STEP / 2
            out.append({
                "bbox": (wx1, wy1, wx2, wy2),
                "cx": cx,
                "cy": cy,
                "count": len(cells),
            })
    out.sort(key=lambda c: c["count"], reverse=True)
    return out


# ---------------------------------------------------------------------------
# Find a walkable anchor near a feature, preferring south-of-feature.
# ---------------------------------------------------------------------------
def find_walkable_anchor(imgs: Imgs, feature_cx, feature_cy, feature_bbox,
                          max_radius=60, south_margin=8, padding=14):
    """Search for a walkable cell within max_radius of feature center.
    Prefers cells south of the feature (positive dy) and slightly aligned
    horizontally (small |dx|) so the NPC stands beside their thing facing
    the camera. Anchor must satisfy mask + tree-darkness AND have padding
    `padding` px clear on each side so the sprite doesn't clip into the
    prop or wall. `south_margin` is the minimum gap below the prop's
    southern edge — push to 30+ for tents/gravestones where the visible
    silhouette extends well past the colored cluster."""
    fx1, fy1, fx2, fy2 = feature_bbox
    # Start the south-search just past the feature's southern edge.
    south_start = fy2 + south_margin
    best = None
    best_score = float("inf")
    for dy in range(0, max_radius + 1, 4):
        for dx in range(-max_radius, max_radius + 1, 4):
            if dx * dx + dy * dy > max_radius * max_radius:
                continue
            x = int(feature_cx + dx)
            y = int(south_start + dy)
            if not (0 <= x < WORLD_W and 0 <= y < WORLD_H):
                continue
            if not is_walkable(imgs, x, y):
                continue
            ok = True
            for ox, oy in ((-padding, 0), (padding, 0), (0, -padding), (0, padding)):
                if not is_walkable(imgs, x + ox, y + oy):
                    ok = False
                    break
            if not ok:
                continue
            # Score: prefer center-south. Small dx good, modest dy good.
            score = abs(dx) * 1.0 + abs(dy - 18) * 0.5
            if score < best_score:
                best_score = score
                best = (x, y)
    if best:
        return best
    # Fallback: full-disk search around feature center, looser preference.
    import math
    for r in range(max(16, south_margin), max_radius + 1, 4):
        for ang_step in range(0, 360, 12):
            a = math.radians(ang_step)
            x = int(feature_cx + r * math.cos(a))
            y = int(feature_cy + r * math.sin(a))
            if not (0 <= x < WORLD_W and 0 <= y < WORLD_H):
                continue
            if is_walkable(imgs, x, y):
                ok = True
                for ox, oy in ((-padding, 0), (padding, 0), (0, -padding), (0, padding)):
                    if not is_walkable(imgs, x + ox, y + oy):
                        ok = False
                        break
                if ok:
                    return (x, y)
    return None


# ---------------------------------------------------------------------------
# Region selection — feature predicates are already very specific, but
# limiting to a quadrant filters out spurious matches (e.g. wood-color
# pixels inside the smith forge brazier shouldn't be tagged as "books").
# ---------------------------------------------------------------------------
def in_region(cx, cy, region):
    x1, y1, x2, y2 = region
    return x1 <= cx <= x2 and y1 <= cy <= y2


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------
def main():
    if not os.path.exists(VISUAL_PATH):
        print(f"ERROR: visual not found at {VISUAL_PATH}", file=sys.stderr)
        sys.exit(1)
    if not os.path.exists(MASK_PATH):
        print(f"ERROR: mask not found at {MASK_PATH}", file=sys.stderr)
        sys.exit(1)

    imgs = load_images()
    print(f"[hamlet_audit] visual {imgs.visual.size}, mask {imgs.mask.size}")
    print(f"[hamlet_audit] world {WORLD_W}x{WORLD_H}, scale x{imgs.vis_scale_x:.2f} y{imgs.vis_scale_y:.2f}")

    # --- FIRE clusters (4 expected) ---------------------------------------
    fire_grid, fc, fr = build_class_grid(imgs, is_fire)
    fires = find_clusters(fire_grid, fc, fr, min_size=2)
    print(f"[fires] found {len(fires)} clusters: {[(int(f['cx']), int(f['cy']), f['count']) for f in fires[:8]]}")

    # --- PORTAL clusters --------------------------------------------------
    portal_grid, pc, pr = build_class_grid(imgs, is_portal_rune)
    portals = find_clusters(portal_grid, pc, pr, min_size=10)
    print(f"[portal] found {len(portals)} clusters: {[(int(p['cx']), int(p['cy']), p['count']) for p in portals[:5]]}")

    # --- GRAVESTONE clusters (NW quadrant only) ---------------------------
    nw_region = (200, 100, 600, 360)
    grave_grid, gc, gr = build_class_grid(imgs, is_gravestone, region=nw_region)
    graves = find_clusters(grave_grid, gc, gr, min_size=8)
    # Filter: must be inside the NW region; we already restricted the grid.
    print(f"[graves] found {len(graves)} clusters: {[(int(g['cx']), int(g['cy']), g['count']) for g in graves[:5]]}")

    # --- BOOK/SCROLL clusters (W/SW quadrant) -----------------------------
    sw_region = (200, 350, 600, 600)
    book_grid, bc, br = build_class_grid(imgs, is_wood_book, region=sw_region)
    books = find_clusters(book_grid, bc, br, min_size=5)
    print(f"[books] found {len(books)} clusters: {[(int(b['cx']), int(b['cy']), b['count']) for b in books[:5]]}")

    # --- TENT cluster (SE quadrant) ---------------------------------------
    se_region = (760, 350, 1180, 600)
    tent_grid, tc, tr = build_class_grid(imgs, is_canvas_tent, region=se_region)
    tents = find_clusters(tent_grid, tc, tr, min_size=10)
    print(f"[tents] found {len(tents)} clusters: {[(int(t['cx']), int(t['cy']), t['count']) for t in tents[:5]]}")

    # ----------------------------------------------------------------------
    # Resolve features:
    #   shrine    = altar candles cluster (top-center, smallest fire that
    #               sits NORTH of the firepit; usually multiple candle dots)
    #   firepit   = central plaza fire (medium-high, near image center)
    #   smith     = forge brazier (top-right)
    #   smith2    = small brazier near anvil (mid-right)
    # We pick by position rather than size because all four can look similar.
    # ----------------------------------------------------------------------
    fire_by_role = {}
    if fires:
        # Group fires near the altar (y < 240, x near center 600-800).
        altar_fires = [f for f in fires if f["cy"] < 240 and 500 <= f["cx"] <= 900]
        if altar_fires:
            # Merge their bboxes into one shrine bbox.
            x1 = min(f["bbox"][0] for f in altar_fires)
            y1 = min(f["bbox"][1] for f in altar_fires)
            x2 = max(f["bbox"][2] for f in altar_fires)
            y2 = max(f["bbox"][3] for f in altar_fires)
            cx = sum(f["cx"] * f["count"] for f in altar_fires) / sum(f["count"] for f in altar_fires)
            cy = sum(f["cy"] * f["count"] for f in altar_fires) / sum(f["count"] for f in altar_fires)
            count = sum(f["count"] for f in altar_fires)
            fire_by_role["shrine"] = {"cx": cx, "cy": cy, "bbox": (x1, y1, x2, y2), "count": count}

        # Central firepit: x roughly 700-900, y roughly 320-420
        plaza_fires = [
            f for f in fires
            if 600 <= f["cx"] <= 950 and 320 <= f["cy"] <= 420
            and f["cy"] >= 240
        ]
        if plaza_fires:
            best = max(plaza_fires, key=lambda f: f["count"])
            fire_by_role["firepit"] = {
                "cx": best["cx"], "cy": best["cy"],
                "bbox": best["bbox"], "count": best["count"],
            }

        # Smith forge area — right side, upper half. The painted scene has
        # two adjacent flames here: the main forge mouth (large bright
        # yellow-white glow ~y=200) and a small brazier just south of the
        # anvil (deep red-orange ~y=247). Both are smith-related; we want
        # the SOUTHERN one as the anchor target so the smith stands beside
        # the anvil on cobble rather than pinned against the forge wall.
        smith_fires = [f for f in fires if f["cx"] > 940 and f["cy"] < 280]
        if smith_fires:
            # "forge" = whichever is highest (lowest y)
            forge = min(smith_fires, key=lambda f: f["cy"])
            fire_by_role["smith_forge"] = {
                "cx": forge["cx"], "cy": forge["cy"],
                "bbox": forge["bbox"], "count": forge["count"],
            }
            # "brazier" = whichever is southernmost (highest y) — the one
            # next to the anvil. If only one fire here, reuse it.
            brazier = max(smith_fires, key=lambda f: f["cy"])
            fire_by_role["smith_brazier"] = {
                "cx": brazier["cx"], "cy": brazier["cy"],
                "bbox": brazier["bbox"], "count": brazier["count"],
            }

    # Portal — pick the largest portal-blue cluster.
    portal_feat = None
    if portals:
        best = portals[0]
        portal_feat = {
            "cx": best["cx"], "cy": best["cy"],
            "bbox": best["bbox"], "count": best["count"],
        }

    # Gravestones — pick largest cluster in the NW grass area. We then
    # pick a representative position at the cluster's southern edge so the
    # gravekeeper stands BELOW the stones rather than on top of them.
    grave_feat = None
    if graves:
        best = graves[0]
        grave_feat = {
            "cx": best["cx"], "cy": best["cy"],
            "bbox": best["bbox"], "count": best["count"],
        }

    book_feat = None
    if books:
        best = books[0]
        book_feat = {
            "cx": best["cx"], "cy": best["cy"],
            "bbox": best["bbox"], "count": best["count"],
        }

    tent_feat = None
    if tents:
        best = tents[0]
        tent_feat = {
            "cx": best["cx"], "cy": best["cy"],
            "bbox": best["bbox"], "count": best["count"],
        }

    # ----------------------------------------------------------------------
    # Build halos JSON
    # ----------------------------------------------------------------------
    halos = {}
    if "shrine" in fire_by_role:
        f = fire_by_role["shrine"]
        halos["shrine"] = {
            "x": int(f["cx"]),
            "y": int(f["cy"]),
            "feature_bbox": [int(v) for v in f["bbox"]],
            "evidence": f"altar candles cluster of {f['count']} fire pixels in NW altar zone",
        }
    if "firepit" in fire_by_role:
        f = fire_by_role["firepit"]
        halos["firepit"] = {
            "x": int(f["cx"]),
            "y": int(f["cy"]),
            "feature_bbox": [int(v) for v in f["bbox"]],
            "evidence": f"plaza firepit cluster of {f['count']} fire pixels at central plaza",
        }
    if portal_feat:
        halos["portal"] = {
            "x": int(portal_feat["cx"]),
            "y": int(portal_feat["cy"]),
            "feature_bbox": [int(v) for v in portal_feat["bbox"]],
            "evidence": f"portal-blue cluster of {portal_feat['count']} pixels (R<<B and G<<B)",
        }

    # ----------------------------------------------------------------------
    # NPC anchors
    #   keeper      — south of plaza firepit
    #   smith       — south of smith forge brazier
    #   archivist   — south of bookcase
    #   gravekeeper — south of gravestones
    #   oracle      — south of altar candles (next to shrine)
    #   wanderer    — south of tent
    # ----------------------------------------------------------------------
    npc_proposals = {}

    def propose(npc_id, feat, label, *, max_radius=80, south_margin=8, padding=14, fallback=None):
        if not feat:
            if fallback:
                npc_proposals[npc_id] = fallback
            return
        bbox = feat["bbox"] if isinstance(feat["bbox"], tuple) else tuple(feat["bbox"])
        anchor = find_walkable_anchor(
            imgs, feat["cx"], feat["cy"], bbox,
            max_radius=max_radius, south_margin=south_margin, padding=padding,
        )
        if not anchor:
            print(f"[WARN] no walkable anchor near {npc_id} feature ({feat['cx']:.0f},{feat['cy']:.0f})")
            if fallback:
                npc_proposals[npc_id] = fallback
            return
        x, y = anchor
        npc_proposals[npc_id] = {
            "x": x,
            "y": y,
            "feature_bbox": [int(v) for v in bbox],
            "rationale": f"stands south of {label}, on walkable cell (mask + tree-darkness validated)",
        }

    if "firepit" in fire_by_role:
        propose("keeper", fire_by_role["firepit"], "the central plaza firepit (hub merchant)",
                south_margin=20)

    # Smith — anchor near the SOUTHERNMOST smith fire (the small brazier
    # by the anvil), which sits at cobble plaza level. The forge mouth
    # itself is buried in the building wall and has no walkable cell south.
    smith_anchor_feat = fire_by_role.get("smith_brazier") or fire_by_role.get("smith_forge")
    if smith_anchor_feat:
        propose("smith", smith_anchor_feat, "the smith forge / anvil brazier",
                south_margin=24, max_radius=90)

    if book_feat:
        propose("archivist", book_feat, "the bookcase + scrolls nook",
                south_margin=12)

    # Gravekeeper — gravestones cluster only catches the grey rectangles,
    # not the cross + grass between them. Push south by 24px so the NPC
    # stands BELOW the headstone row, not between two stones.
    if grave_feat:
        propose("gravekeeper", grave_feat, "the graveyard headstones",
                south_margin=24, max_radius=80)

    # Oracle — stand south of the candles, but the shrine altar table
    # extends below the candles and is mask-blocked, so we need a generous
    # south_margin to clear it.
    if "shrine" in fire_by_role:
        propose("oracle", fire_by_role["shrine"], "the altar shrine candles",
                south_margin=40, max_radius=100)

    # Wanderer — tent silhouette extends well past the canvas-color cluster
    # (front flap, bedroll, pots all darker / different hues). Push 35+px
    # south of the cluster bbox to clear the painted prop.
    if tent_feat:
        propose("wanderer", tent_feat, "the canvas tent + bedroll camp",
                south_margin=40, max_radius=100)

    # ----------------------------------------------------------------------
    # Spawn point — south entry path, ~80px inside compound from south wall.
    # The south path is a vertical cobble corridor centered roughly on x=688.
    # We scan upward from y=767 along x=688 until we hit a walkable cell,
    # then move ~80px further inside.
    # ----------------------------------------------------------------------
    def find_spawn():
        spawn_x = 688
        # Walk upward along the south entry corridor.
        for y in range(WORLD_H - 1, 400, -1):
            if is_walkable(imgs, spawn_x, y):
                # Now scan upward to find the south wall gap entry — first
                # walkable point where x=688 stays walkable for at least
                # 30 pixels of vertical run.
                run = 0
                start = None
                for yy in range(y, 400, -1):
                    if is_walkable(imgs, spawn_x, yy):
                        if start is None:
                            start = yy
                        run += 1
                        if run >= 80:
                            # Spawn ~80px inside the run.
                            spawn_y = start - 80
                            return (spawn_x, max(spawn_y, start - 80))
                    else:
                        run = 0
                        start = None
                # Fallback if no long run found.
                return (spawn_x, y)
        return (688, 700)

    spawn_x, spawn_y = find_spawn()
    spawn = {
        "x": spawn_x,
        "y": spawn_y,
        "rationale": "south entry path, ~80px inside the compound from the south wall gap (walkable validated)",
    }

    # ----------------------------------------------------------------------
    # Compose final JSON
    # ----------------------------------------------------------------------
    out = {
        "scene_dimensions": {"w": WORLD_W, "h": WORLD_H},
        "halos": halos,
        "npcs": npc_proposals,
        "spawn": spawn,
    }
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    print(f"[hamlet_audit] wrote {OUT_JSON}")

    # ----------------------------------------------------------------------
    # Console summary — current vs proposed for each NPC
    # ----------------------------------------------------------------------
    CURRENT = {
        "HAMLET_HERO_SPAWN": (688, 700),
        "PORTAL_POS": (687, 367),
        "SHRINE_POS": (703, 207),
        "FIREPIT_POS": (782, 361),
        "keeper": (580, 430),
        "smith": (1050, 280),
        "archivist": (326, 516),
        "gravekeeper": (350, 280),
        "oracle": (676, 240),
        "wanderer": (936, 516),
    }
    print("\n=== POSITION DELTAS ===")
    halo_keys = [("PORTAL_POS", "portal"), ("SHRINE_POS", "shrine"), ("FIREPIT_POS", "firepit")]
    for cur_key, halo_key in halo_keys:
        cur = CURRENT[cur_key]
        new = halos.get(halo_key)
        if new:
            dx, dy = new["x"] - cur[0], new["y"] - cur[1]
            print(f"  {cur_key:18s}: {cur} -> ({new['x']},{new['y']})  delta=({dx:+d},{dy:+d})")
        else:
            print(f"  {cur_key:18s}: {cur} -> NOT FOUND")
    for npc_id in ("keeper", "smith", "archivist", "gravekeeper", "oracle", "wanderer"):
        cur = CURRENT[npc_id]
        new = npc_proposals.get(npc_id)
        if new:
            dx, dy = new["x"] - cur[0], new["y"] - cur[1]
            print(f"  npc {npc_id:11s}: {cur} -> ({new['x']},{new['y']})  delta=({dx:+d},{dy:+d})")
        else:
            print(f"  npc {npc_id:11s}: {cur} -> NOT FOUND")
    sp = spawn
    sp_cur = CURRENT["HAMLET_HERO_SPAWN"]
    print(f"  HAMLET_HERO_SPAWN : {sp_cur} -> ({sp['x']},{sp['y']})  delta=({sp['x']-sp_cur[0]:+d},{sp['y']-sp_cur[1]:+d})")


if __name__ == "__main__":
    main()
