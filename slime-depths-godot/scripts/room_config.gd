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
