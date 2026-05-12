# EnemyType — Resource describing one kind of enemy. The generic
# enemy.gd reads this at _ready to build its SpriteFrames, set its
# stats, and pick which AI tick to run.
#
# Why a Resource (vs a script per enemy): adding a new enemy used to
# be authoring a hand-rolled .tscn with ~30 AtlasTexture sub-resources
# plus a per-enemy .gd extending Enemy. That's why the roster sat at 4.
# With this resource shape, a new enemy is a single .tres asset — fill
# in sheets, frame counts, and stats; pick a behavior tag; done.
#
# Sheet layout convention (matches the slime-depths PixelLab sheets):
#   Each state's sheet is one ROW of cell_size × cell_size frames laid
#   out horizontally. Frames are sampled at (frame_idx * cell_size, 0).
#   These aren't 8-directional sheets like the hero; enemies use a
#   single facing + sprite.flip_h for east/west.
class_name EnemyType
extends Resource

# ── Identity ──────────────────────────────────────────────────────────
@export var display_name: String = "Enemy"
# Iter 17 — boss flag. True = main.gd shows the floating HP bar UI and
# binds it to this enemy's hp. Only one boss should be alive at a time;
# main.gd's _boss_ref tracks the most recent boss spawn.
@export var is_boss: bool = false
# Behavior tag — enemy.gd dispatches its tick by string match. Keeping
# this stringly-typed (not an enum) means new .tres files don't need a
# script-side enum addition; just type the new tag and add a branch in
# enemy.gd if it's truly a new behavior.
#   "chase_contact"      walk at hero, body-bump for damage
#   "telegraphed_melee"  approach → windup-tint → swing in cone
#   "shoot"              kite + cast projectile in range
#   "stationary_shoot"   never move, fire when hero in range
@export var behavior: String = "chase_contact"

# ── Sprite sheets ─────────────────────────────────────────────────────
# attack_sheet is optional — chase_contact enemies (slimes, spiders) may
# not have a dedicated attack pose; they just keep playing walk while
# touching. Code in enemy.gd guards null.
@export_group("Sheets")
@export var idle_sheet: Texture2D
@export var walk_sheet: Texture2D
@export var attack_sheet: Texture2D = null
@export var death_sheet: Texture2D

# ── Sprite layout ─────────────────────────────────────────────────────
# cell_size: side length of one frame's bounding box in source-pixel
#   space. The pack-of-PixelLab humanoids ship at 100; tiny-rpg skeleton
#   ships at 128; crypt spider ships at 64.
# sprite_scale: AnimatedSprite2D.scale on the X+Y axes. Tuned per type
#   so different-cell-size sheets render at coherent screen sizes.
# sprite_y_offset: AnimatedSprite2D.position.y. Negative = lifts sprite
#   off the feet anchor (collision is a circle at origin). Most humanoids
#   want ~-8 to -16 to align feet with the ground.
# sprite_modulate: Iter 70 — baseline color tint applied to the
#   AnimatedSprite2D at spawn (after the spawn-in red fade settles).
#   Used to visually distinguish enemies that REUSE another enemy's
#   sprite sheets — without this, e.g. priest and spectral_priest are
#   visually identical in combat. Default (1,1,1,1) = no tint (passes
#   through the sheet unchanged). Status-effect tints (burn orange,
#   slow blue, healer-windup green, etc.) override this temporarily in
#   enemy.gd; once the status clears the code restores sprite_modulate
#   as the baseline. Choose tints that READ at small sprite scales —
#   subtle hue shifts (e.g. 1.05 / 0.95) won't differentiate; 1.3 / 0.7
#   reads clearly even on a 60-px-tall sprite mid-combat.
@export_group("Layout")
@export var cell_size: int = 100
@export var sprite_scale: float = 0.6
@export var sprite_y_offset: float = -10.0
@export var collision_radius: float = 16.0
@export var sprite_modulate: Color = Color(1, 1, 1, 1)

# ── Frame counts ──────────────────────────────────────────────────────
# Per-state frame counts. attack_frames can be 0 for chase_contact types
# with no attack sheet.
@export_group("Frame counts", "frames_")
@export var frames_idle: int = 6
@export var frames_walk: int = 8
@export var frames_attack: int = 6
@export var frames_death: int = 4

# ── FPS ───────────────────────────────────────────────────────────────
# AnimatedSprite2D playback speed per state. Set so each anim plays out
# in roughly the gameplay duration of its phase (e.g. attack_fps matched
# to melee_swing or cast_windup).
@export_group("FPS", "fps_")
@export var fps_idle: float = 6.0
@export var fps_walk: float = 8.0
@export var fps_attack: float = 12.0
@export var fps_death: float = 8.0

# ── Combat stats ──────────────────────────────────────────────────────
@export_group("Stats")
@export var max_hp: int = 1
@export var move_speed: float = 90.0   # px/s. 0 = never moves (also see can_move()).
@export var death_duration: float = 0.8

# ── Behavior tunables ─────────────────────────────────────────────────
# Each group is only used when behavior matches. They're all declared
# here so a .tres can specify any of them inline without needing a
# subclass-per-behavior split.
@export_group("Contact (chase_contact)")
@export var contact_damage: int = 1
@export var contact_cooldown: float = 0.6
@export var contact_range: float = 36.0   # touch distance

@export_group("Melee (telegraphed_melee)")
@export var melee_reach: float = 54.0
@export var melee_windup: float = 0.55
@export var melee_swing: float = 0.35
@export var melee_cooldown: float = 0.90
@export var melee_damage: int = 1
@export var melee_cone: float = 1.25   # half-angle in radians, ~PI*0.4

@export_group("Ranged (shoot / stationary_shoot)")
@export var prefer_dist: float = 320.0
@export var min_dist: float = 220.0
@export var cast_range: float = 480.0
@export var cast_windup: float = 0.70
@export var cast_cooldown: float = 1.80
@export var projectile_damage: int = 1
# Cool blue by default = "enemy magic"; archers / priests override.
@export var projectile_tint: Color = Color(0.4, 0.7, 1, 1)

# Tells the AI whether to issue any movement commands. False = the enemy
# is rooted in place even during chase/shoot phases (used by bonecap-
# style turret enemies).
func can_move() -> bool:
	return move_speed > 0.0

# Iter 37 — boss phase 2 overrides. When non-empty, the enemy transitions
# to phase 2 the first time hp crosses below 50% (phase2_hp_threshold by
# default). At transition, enemy.gd DUPLICATES this resource (so the
# shared .tres stays clean) and overrides the listed fields with the
# values from this Dictionary.
#
# Supported override keys = any @export field on EnemyType. Common ones:
#   "melee_cooldown" / "melee_windup" / "melee_damage"
#   "contact_damage" / "contact_cooldown"
#   "move_speed"
#   "projectile_damage" / "cast_cooldown"
#
# Empty dict = no phase 2 (default — regular enemies stay one-phase).
# A non-empty dict on a non-boss enemy ALSO triggers normally; phase
# transitions aren't gated by is_boss. (Lets future "elite" mobs share
# the same machinery.)
@export var phase2_overrides: Dictionary = {}

# When to trigger phase 2. 0.5 = 50% HP. Set to 0 to disable phase 2
# even if phase2_overrides is non-empty (useful as a kill-switch for
# tuning). Threshold compared as `hp / max_hp <= phase2_hp_threshold`.
@export_range(0.0, 1.0, 0.05) var phase2_hp_threshold: float = 0.5

# Iter 55 — phase 3 overrides. Same shape as phase2_overrides; applied
# the first time hp crosses phase3_hp_threshold (typically 0.25 = 25%).
# Stacks ON TOP of phase 2's mutations — at phase 3, the enemy_type
# is duplicated again and phase3_overrides applied to the local copy.
# Result: phase-3 values are absolute (e.g. melee_windup=0.4 means
# "0.4s windup in phase 3", not "0.4s OFFSET from phase 2").
#
# Empty dict = no phase 3 (default — most enemies stop at phase 1).
@export var phase3_overrides: Dictionary = {}

@export_range(0.0, 1.0, 0.05) var phase3_hp_threshold: float = 0.25

# Iter 55 — phase-transition summon. Optional adds spawned when the
# enemy transitions to phase 2 OR phase 3. Drives "boss in trouble →
# calls for help" dramatic moments. Spawn positions are picked at
# random within ~96 px of the boss.
#
#   phase2_summon_type / phase3_summon_type: enemy id from main.gd's
#     ENEMY_TYPES dict ("skel", "crypt_spider", "ember_bomber", etc.).
#     Empty string = no summons at that phase.
#   phase2_summon_count / phase3_summon_count: how many to spawn.
#     0 = no summons even if the type is set.
@export var phase2_summon_type: String = ""
@export var phase2_summon_count: int = 0
@export var phase3_summon_type: String = ""
@export var phase3_summon_count: int = 0
