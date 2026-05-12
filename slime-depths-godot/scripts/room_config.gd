# RoomConfig — per-room data resource. The dungeon scene (main.tscn /
# scripts/main.gd) reads ONE of these at _ready to know which torches to
# spawn, where enemies enter from, what wave compositions to fight,
# and whether to drop a door (for the next room) or a pedestal (for
# end-of-floor) on clear.
#
# This is the Godot-native replacement for the hardcoded SPAWN_POINTS /
# WAVES constants that used to live in main.gd. Adding a 4th room is now
# "drop a new .tres file in scenes/rooms/ + append it to Floor's array",
# zero code changes.
#
# Wave format (untyped Array because GDScript's Array[Dictionary] export
# inspector is awkward for nested data):
#   waves: [
#     [["slime", 3], ["crypt_spider", 1]],   # wave 1
#     [["skel", 2], ["slime", 2]],            # wave 2
#     ...
#   ]
# Each wave is an array of [type_id: String, count: int] pairs that the
# room runner instantiates via its ENEMY_SCENES dict.
class_name RoomConfig
extends Resource

# Hero spawn position in world pixels. Default = west side, mid-height
# (the entry point from the hamlet's south portal).
@export var hero_spawn: Vector2 = Vector2(192, 384)

# Torch placements — each Vector2 is a world-pixel position where a
# Torch scene gets instantiated at _ready. 6 torches is the standard
# "dungeon-ringed-by-light" layout; per-room variation comes from
# moving them to suggest different room atmospheres.
@export var torch_positions: Array[Vector2] = []

# Enemy spawn points. Each room picks one from this list (round-robin
# via the wave runner) when spawning a mob. Different positions per
# room let enemies enter from different sides for compositional variety.
@export var spawn_points: Array[Vector2] = []

# Wave compositions (see file-header comment for format).
@export var waves: Array = []

# Pillar placements — each Vector2 is a world-pixel position where a
# Pillar scene gets instantiated at _ready. Pillars are collidable
# stone columns the hero must walk around; per-room placement gives
# each room a distinct combat geometry. Don't place ON spawn_points
# or hero_spawn — the player or an enemy would get stuck.
@export var pillar_positions: Array[Vector2] = []

# Chest placements — each Vector2 is a world-pixel position where a
# Chest scene gets instantiated at _ready. Chests take 2 hits from
# the hero's sword to break open + drop gold + fire pickup events.
# Chests live in the "breakables" group so they don't block
# wave-clear; see main.gd's _process filter.
@export var chest_positions: Array[Vector2] = []

# When true, this is the floor finale: room runner spawns a Pedestal
# (relic offering) on clear instead of a Door. When false, spawns a
# Door at the east wall to advance to the next room.
@export var is_last_room: bool = false

# Display name shown in the wave HUD ("WAVE 1 / 3  ·  RUIN PATH"). Helps
# orient the player as they move through a multi-room floor.
@export var display_name: String = "DUNGEON"

# Iter 18 — per-room visual character.
# ambient_tint: the CanvasModulate color applied by main.gd at _ready.
# Drives the "deeper = darker" feeling without re-authoring backgrounds.
# Default is the iter-13 cold-purple; rooms override per their mood
# (entry chamber lighter, boss room red-tinted, etc).
@export var ambient_tint: Color = Color(0.32, 0.30, 0.38, 1)
# decor_density: how many procedural rubble/crack decals to scatter
# across the play area. main.gd places them randomly within the
# walkable bounds, avoiding hero_spawn / spawn_points / room center
# so they don't crowd combat space. 0 = no decor.
@export var decor_density: int = 14

# Iter 30 — interior walls. Each Rect2 = (top-left position in world
# coords, width × height). main.gd spawns a StaticBody2D + visible
# Polygon2D for each, partitioning the otherwise-open 1280×720 arena
# into corridors / chambers / cover slots. Wall thickness 16-32 reads
# well at the camera's zoom. Pre-iter-30 rooms had zero interior
# obstacles — every combat collapsed into the same kite-and-strafe.
# Empty array = open arena (old behavior).
@export var wall_rects: Array[Rect2] = []

# Iter 30 — hazards (single-kind, legacy). Per-room positional damage
# sources. main.gd reads hazard_kind to pick the scene to instantiate
# at each hazard_positions entry. This format is kept for the rooms
# authored in iter 30 (all-spike-pit). Iter 31+ uses `hazards` below
# for mixed-kind rooms; both lists spawn at load.
@export var hazard_positions: Array[Vector2] = []
@export var hazard_kind: String = ""

# Iter 31 — mixed-hazard array. Each entry is a Dictionary describing
# one hazard, letting a single room mix spike pits + fire jets + slow
# zones + lightning rods without needing N parallel arrays.
#
# Entry schema (all per-kind fields optional):
#   {
#     "kind": String,          # "spike_pit" | "fire_jet" | "slow_zone" | "lightning_rod"
#     "position": Vector2,     # world-pixel placement
#     "phase": float,          # fire_jet/lightning_rod cycle offset (0..1)
#                              # so adjacent jets don't fire in lockstep.
#     "interval": float,       # lightning_rod: seconds between strikes.
#   }
#
# Supported kinds:
#   "spike_pit"     periodic 1-damage Area2D — camp-punishing static hazard.
#   "fire_jet"      cyclic OFF (telegraph glow) → ON (damage column) loop.
#                   Forces rhythmic movement around timed windows.
#   "slow_zone"     passive Area2D, no damage, halves move speed while inside.
#                   Avoidance pressure WITHOUT killing the player.
#   "lightning_rod" every N seconds emits a vertical bolt with a brief
#                   telegraph. AoE damage in a fixed radius around the rod.
#
# Hazards push the player to MOVE rather than camp — combined with
# interior walls, this is how rooms start to drive tactical play
# instead of being passive arenas.
@export var hazards: Array[Dictionary] = []

# Iter 32 — branching room choice. When non-empty, the room spawns N
# branch doors at clear instead of the single iter-30 door. Each entry
# in `branches` defines ONE option offered to the player.
#
# Entry schema:
#   {
#     "label": String,   # short text shown above the door, eg "RISK"
#     "kind": String,    # "safe" | "standard" | "risk" — drives modifier
#                        # applied to the NEXT room. See RunState.apply_branch.
#     "subtitle": String # optional, second-line peek text eg "rare relics +1 enemy"
#   }
#
# Branch kind effects (applied at next-room _ready via
# RunState.pending_branch):
#   "safe"      Heal +1 HP on entry. Pedestal/relic offer is forced to
#               common tier only (modest reward, room itself unchanged
#               but the safety net is the heal).
#   "standard"  No modifier. The iter-30 default behavior.
#   "risk"      +1 enemy added to wave 1. Pedestal/relic offer is forced
#               to rare tier minimum.
#
# Empty array = iter-30 single-door legacy behavior at DOOR_POSITION.
@export var branches: Array[Dictionary] = []

# Iter 33 — room category. Drives main.gd's behavior at _ready: combat
# rooms run waves + spawn relic offer on clear; treasure rooms skip
# the wave runner and spawn an immediate forced-legendary pedestal
# offer; shrine rooms skip waves and spawn interactable Shrine nodes
# at shrine_positions for one-pray-per-room stat boosts.
#
# Values:
#   "combat"    iter-30 default — wave runner + clear → pedestal + door
#   "treasure"  no waves; pedestal offer auto-spawns at _ready, forced
#               legendary tier (or rare fallback if no legendary owned).
#   "shrine"    no waves; 3 Shrine nodes at shrine_positions, each
#               offers ONE permanent stat boost. Door spawns after
#               first pray.
@export var room_kind: String = "combat"

# Iter 33 — shrine placements (only consumed when room_kind == "shrine").
# Each position spawns one Shrine node at _ready. Each Shrine offers
# one stat boost type — main.gd assigns types round-robin so a 3-shrine
# room gets one each of HP / DODGE_CD / ATK_DMG.
@export var shrine_positions: Array[Vector2] = []

# Iter 34 — biome flavor. Distinct visual themes layered on top of the
# (still shared) procedural_dungeon backdrop. Drives:
#   1) a large biome-tinted Polygon2D overlay at z=-2 (color wash)
#   2) the SHAPE + COLOR of procedural decor (dark stains vs. bones
#      vs. embers vs. runes — see main.gd._spawn_decor_at_*)
#   3) 1-3 large biome "centerpiece" accents at room corners / center
#
# Together these make a "crypt" room look palpably different from an
# "ember" room even though both reuse the same wall geometry + ambient
# tint pipeline. Adding a new biome stays a single-file edit on the
# main.gd BIOME_OVERLAY_COLORS + decor dispatcher.
#
# Values:
#   "crypt"      iter-30 default — dark grey-brown stains. Cold neutral.
#   "ossuary"    pale ivory bone fragments + greyed floor wash.
#   "ember"      warm orange ember pips + reddish floor wash + glow.
#   "sanctuary"  faint blue rune glyphs + cool indigo floor wash.
@export var biome: String = "crypt"

# Iter 35 — mid-fight dynamic events. Each entry fires when the
# specified wave starts (0-indexed: wave 0 = first wave, wave 1 =
# second, etc). Lets a room ESCALATE mid-combat rather than being a
# static arena. Empty array = no events (iter-30 baseline).
#
# Entry schema (kind-specific extras vary):
#   {
#     "wave": int,       # 0-based wave index that triggers this event
#     "kind": String,    # one of the event kinds below
#     # — kind-specific extras —
#     "position": Vector2,    # for activate_hazard / raise_wall
#     "hazard_kind": String,  # for activate_hazard ("fire_jet" etc.)
#     "phase": float,         # for activate_hazard (cycle offset)
#     "interval": float,      # for activate_hazard (lightning_rod cadence)
#     "rect": Rect2,          # for raise_wall (target wall geometry)
#     "energy_mul": float,    # for dim_lights (target torch energy fraction)
#     "text": String,         # for announce (banner text)
#   }
#
# Event kinds:
#   "activate_hazard"  spawn a new hazard at `position` with a brief
#                      scale-in tween. Used to escalate threat mid-fight.
#   "raise_wall"       build a wall matching `rect`, position it below
#                      floor, tween up over 0.6s. Changes cover layout
#                      mid-combat — the player has to re-read the room.
#   "dim_lights"       tween every torch's energy down by `energy_mul`
#                      (e.g. 0.35 = "lights drop to 35% of original").
#                      Atmospheric, boss-room dramatic.
#   "announce"         show `text` as a brief banner on status_label.
#                      Companion event — pair with activate_hazard etc.
#                      to telegraph the change.
@export var wave_events: Array[Dictionary] = []

# Iter 36 — procedural variation per visit. Two opt-in mechanisms
# so a room that's seen multiple times across runs doesn't read as
# pixel-identical. Both are seeded with RunState.current_room_index
# + GameState.dungeon_runs so the variation is DETERMINISTIC inside
# a single run (no mid-run swap weirdness) but DIFFERENT between
# runs (visit 1 has pattern A, visit 2 picks B/C/etc.).
#
# position_jitter: max radius in pixels for the per-visit jitter
#   applied to pillar_positions on load. 0 = no jitter (iter-30
#   baseline). 12-20 reads as "this room remembers being similar
#   but not identical" without breaking carefully-placed chokepoints.
#   Hazards and spawn_points are NOT jittered — those are
#   load-bearing for gameplay timing.
@export var position_jitter: float = 0.0

# waves_pool: optional Array of waves entries. When non-empty,
# main.gd rolls per-visit to pick ONE pool entry as the wave
# composition (replacing this RoomConfig's `waves` field for the
# current visit). Each pool entry is structured identically to
# `waves` (Array of Array of [type_id, count] pairs).
#
# Empty array = use the baseline `waves` field every visit
# (iter-30 behavior).
#
# Authoring tip: keep pool entries balanced in total enemy count
# + tier so the variation is FLAVOR not difficulty swings.
@export var waves_pool: Array = []
