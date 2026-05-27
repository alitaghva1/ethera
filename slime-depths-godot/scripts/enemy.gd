# Enemy — iter 14 rewrite. ONE enemy script + ONE enemy scene for the
# whole roster. Per-type data (sheets, frame counts, stats, behavior)
# lives in EnemyType resource .tres files under scenes/enemies/.
#
# Why this rewrite: pre-iter-14 each enemy had its own .tscn (with ~30
# hand-declared AtlasTexture sub-resources for its anims) plus its own
# .gd subclass extending Enemy. Adding a 5th enemy was a multi-file
# undertaking. With the new shape, "new enemy" = "new .tres file" —
# everything else is shared.
#
# Lifecycle:
#   1. main.gd instantiates scenes/enemy.tscn, sets enemy_type = the
#      relevant .tres, then add_child's it.
#   2. _ready() reads enemy_type, builds SpriteFrames from the sheets
#      programmatically, sets stats, plays idle.
#   3. _physics_process dispatches to one of four behavior ticks based
#      on enemy_type.behavior.
#   4. take_hit / knockback / death (inherited from this single script)
#      work the same regardless of type.
#
# Behaviors:
#   chase_contact      walk straight at hero, body-bump on touch
#   telegraphed_melee  approach → stop + windup tint → swing in cone
#   shoot              kite to prefer_dist → cast projectile cycle
#   stationary_shoot   never move; cast projectile when hero in range
#   bomber             kamikaze charge → prime + scale → detonate AoE
#   healer             keep distance from hero → windup tint → pulse heal
#                      to the most-wounded ally in HEAL_RADIUS
#   summoner           kite from hero → windup spiral → spawn 1-2 bonecap
#                      minions within SUMMON_RADIUS (cap 3 concurrent)
#   wraith             fast melee that periodically PHASES — vanishes,
#                      reappears BEHIND hero, lands a flanking strike.
#                      Invulnerable + non-colliding during the phase window.
#
# All behaviors use the same death + knockback + take_hit machinery —
# the behavior switch only affects per-tick AI.
class_name Enemy
extends CharacterBody2D

const PROJECTILE_SCENE = preload("res://scenes/projectile.tscn")
# Iter 27 — shared ground-shadow texture. Same asset hero uses; sized
# per-instance below by collision_radius so a slime gets a small
# shadow and the iron_revenant gets a big one. Drawn under the sprite
# so the enemy reads as standing ON the floor rather than floating.
const SHADOW_TEXTURE: Texture2D = preload("res://assets/decor/shadow_ellipse.png")
# iter-81: preload AttackFeel rather than using class_name. Defensive
# (matches the screen_flash.gd autoload pattern) so the static
# apply_hit_feedback_tier call in take_hit resolves at parse time
# regardless of class_name registration order.
const AttackFeel = preload("res://scripts/attack_feel.gd")
# iter-88: FxSpriteCls (renamed locally to avoid clash with the
# class_name FxSprite — preload resolves at parse time before
# class_name registration in enemy.gd's load order).
const FxSpriteCls = preload("res://scripts/fx_sprite.gd")

# Iter 257 / Wave 6 — per-kind death decal. Spawned at the end of
# _die() so when an enemy falls it leaves a PERSISTENT visible mark
# matching its identity: a slime splat is green, a skeleton leaves
# scattered bone shards, an ember leaves warm ash, casters leave dark
# ash piles, spectral foes leave ghost-mist with violet pips, generic
# melee mortals leave blood pools. Decals fade over 6-8s — additive
# to the iter-83 BloodMark (which still spawns from main.gd's
# _on_enemy_died handler, providing a uniform splat underneath).
# Identifies the enemy by enemy_type.display_name (lower-cased,
# spaces→underscores) so the .tres files stay un-touched. Falls back
# to "blood" for any unmapped display_name.
const CORPSE_DECAL_SCENE: PackedScene = preload("res://scenes/corpse_decal.tscn")
const DEATH_DECAL_KIND_MAP: Dictionary = {
	# Slime — irregular green splat splash.
	"slime":             "slime",
	# Ember-family — warm scorched-ash piles (smoldering remains).
	"ember":             "ember",
	"ember_bomber":      "ember",
	"ember_tyrant":      "ember",
	# Skeletal — bone-shard scatter with dust under-layer.
	"skel":              "skeleton",
	"skeleton":          "skeleton",
	"armored_skeleton":  "skeleton",
	"bone_summoner":     "skeleton",
	# Spectral / wraith / incorporeal — pale ghost-mist + violet pips.
	"rogue_wraith":      "bone",
	"spectral_priest":   "bone",
	"bulwark":           "bone",  # armored ghost — fits spectral palette
	"moth":              "bone",  # ethereal flyer
	# Casters — dark soot pile (robes burned away).
	"wiz":               "ash",
	"wizard":            "ash",
	"priest":            "ash",
	"dreadmage":         "ash",
	"archer":            "ash",
	"glyph_warden":      "ash",
	"bonecap":           "ash",
	# Melee mortals + corporeal beasts — red blood pool.
	"lancer":            "blood",
	"orc":               "blood",
	"werewolf":          "blood",
	"crypt_spider":      "blood",
	"broodmother":       "blood",
	"iron_revenant":     "blood",
	"tuskbrod":          "blood",
}

# Iter 15 — spawn-in window. Newly-spawned enemies fade from a bright
# red translucent ghost to full opacity over SPAWN_IN_DURATION seconds.
# During this window: no AI, no take_hit, velocity locked to zero. This
# gives the player a clear visual telegraph that "an enemy is materializing
# HERE" instead of the iter-14 behavior where enemies popped into existence
# at full opacity and immediately started chasing.
# iter-79 retune: after the spawn-portal experiment was removed (iters
# 75-78), the per-enemy fade-in is once again THE spawn telegraph. User
# feedback through that arc was that the iter-15 "bright red ghost" was
# too aggressive — it screamed danger the way a hazard would.
#   • duration 0.5s → 0.35s (faster — less time as a ghost)
#   • start color 1.8/0.3/0.3 → 1.25/0.45/0.55 (muted, slightly pink-cooled,
#     reads "arriving" not "hot danger")
#   • alpha 0.3 → 0.40 (slightly more visible so the player still notices)
const SPAWN_IN_DURATION := 0.35
const SPAWN_IN_START_COLOR := Color(1.25, 0.45, 0.55, 0.40)
# Iter 147 — telegraph the spawn position on the GROUND so the player
# can read where a new enemy is materializing even before the red-
# translucent sprite is fully visible. Auto-frees at lifetime end.
const SPAWN_TELEGRAPH_SCENE: PackedScene = preload("res://scenes/fx/spawn_telegraph.tscn")
const SPAWN_IN_END_COLOR   := Color(1.0, 1.0, 1.0, 1.0)   # normal

# Set by the spawner (main.gd) BEFORE add_child. If null at _ready time
# we push_warning and the enemy degenerates to a passive lump — that's
# noisy enough that misconfigured spawns are visible immediately.
@export var enemy_type: EnemyType = null

@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D
@onready var collision: CollisionShape2D = $CollisionShape2D

# ── Universal state ───────────────────────────────────────────────────
var hp: int = 1
var _dying := false
var _death_timer := 0.0
var _hero: Node2D = null

# Iter 13 knockback — linear-decay velocity push that suspends AI for
# its window. apply_knockback() arms; _physics_process consumes.
var _knockback_time := 0.0
var _knockback_total := 0.0
var _knockback_velocity := Vector2.ZERO

# Iter 15 — spawn-in countdown. Set on _ready; ticks down each physics
# frame. While > 0, AI is suspended, take_hit returns early, and the
# sprite modulates from SPAWN_IN_START_COLOR to SPAWN_IN_END_COLOR.
var _spawn_in_time := SPAWN_IN_DURATION

# ── Per-behavior state ────────────────────────────────────────────────
# chase_contact
var _contact_cd := 0.0
# iter-106: brief window after a chase_contact body-bump during which
# the sprite plays the "attack" animation (if the enemy has one) so
# the hit reads visually. Pre-iter-106 the slime / orc / ember /
# werewolf bumped the hero while gliding in their walk animation —
# the attack sheets were declared in the .tres files and built into
# the SpriteFrames at _ready, then never triggered. This timer is
# the bridge: set in the contact-damage block, drained by the tick.
var _contact_attack_anim_time: float = 0.0
const CONTACT_ATTACK_ANIM_DURATION: float = 0.25

# iter-110: brief hurt-anim hold after take_hit. Mirrors the contact-
# attack-anim pattern above but on the receiving end. Set in take_hit
# when the enemy has a hurt_sheet, drained by every behavior tick. The
# behavior animation dispatch checks this flag and plays "hurt" until
# it expires. 0.18s ≈ 3 frames at HURT_ANIM_FPS = 18, which is the
# slime-depths feel-window for "hit registered" recoil before the
# enemy resumes its AI.
var _hurt_anim_time: float = 0.0
const HURT_ANIM_DURATION: float = 0.18
# Iter 169 — stuck detection + side-step. Pre-iter-169 chase_contact
# enemies wedged against walls / pillars / each other just pushed
# into the obstacle forever (no pathfinding). User read: "Enemy AI
# seems dumb in general and gets stuck a lot."
#
# Heuristic (cheap, no NavigationAgent2D): every STUCK_CHECK_INTERVAL
# seconds, compare the enemy's position to where it WAS at the last
# check. If the intended velocity is non-zero (the enemy is trying
# to move) AND actual movement was less than STUCK_DIST_THRESHOLD,
# the enemy is wedged. Override velocity with a perpendicular
# direction for STUCK_DODGE_DURATION so the enemy "side-steps" around
# the obstacle. After the dodge window the normal AI resumes — if
# the enemy is STILL stuck, the next check fires another dodge in
# the OPPOSITE direction (50/50 randomized so a pile of enemies
# doesn't collectively rubber-band the same way).
const STUCK_CHECK_INTERVAL: float = 0.55
const STUCK_DIST_THRESHOLD: float = 14.0
const STUCK_DODGE_DURATION: float = 0.40
var _stuck_check_timer: float = 0.0
var _stuck_check_pos: Vector2 = Vector2.ZERO
var _stuck_dodge_timer: float = 0.0
var _stuck_dodge_dir: Vector2 = Vector2.ZERO

# Iter 173 — boids-style separation. Pre-iter-173 when 4+ enemies
# converged on the hero they all stacked on the same point — looked
# like a single fat enemy, not a pack. Now each chase tick adds a
# small lateral force pushing AWAY from nearby allies, weighted by
# inverse distance. The hero is naturally encircled instead of
# dog-piled. SEPARATION_FORCE 0.45 keeps the chase primary; this
# isn't an AI overhaul, it's a spacing nudge.
const SEPARATION_RADIUS: float = 56.0
const SEPARATION_FORCE: float = 0.45
# Iter 152 — idle bob: subtle vertical sin oscillation on the sprite
# during non-action states so enemies look ALIVE instead of statues
# pinned to the floor. Each enemy gets a random phase at _ready so a
# clump doesn't bob in lockstep — that lockstep would read as "synced
# zombies," the opposite of alive. Amplitude is 1.5 px which is sub-
# pixel-ish for our 64-px sprites: visible only at peripheral focus,
# never distracting.
const IDLE_BOB_AMP: float = 1.5
const IDLE_BOB_FREQ: float = 2.0  # Hz
var _idle_bob_phase: float = 0.0
# Iter 153 — ground shadow under each enemy. Built programmatically in
# _ready so enemy.tscn stays untouched. Pulses in COUNTER-phase with
# the iter-152 sprite bob (shadow shrinks when sprite is high, grows
# when sprite is low) — same trick as iter-132 hero shadow_pulse.
# Reinforces "feet on the floor" read; enemies without a shadow look
# like they're floating, especially boss enemies that have larger
# sprites.
const SHADOW_BASE_ALPHA: float = 0.26  # Iter 217 Phase 6 — softened from 0.35. Tighter contact shadow reads as "the silhouette meets the floor" without the heavy underprint.
const SHADOW_PULSE_AMP: float = 0.12  # ±12% of base scale at peak bob
var _shadow: Polygon2D = null
var _shadow_base_scale: Vector2 = Vector2.ONE
# Iter 145 — sprite-scale punch on hit. Stacks parallel with the white-
# flash modulate so the enemy "recoils" visually from each hit. Crit
# punch is stronger (1.32 vs 1.15) so crits read distinctly bigger at
# a glance — pairs with the iter-138 red crit splash ring.
const HIT_SCALE_PUNCH: float = 1.15
const HIT_SCALE_PUNCH_CRIT: float = 1.32
const HURT_ANIM_FPS: float = 18.0
# telegraphed_melee state machine
enum MeleeState { IDLE, WINDUP, SWING, COOLDOWN }
var _melee_state: MeleeState = MeleeState.IDLE
var _melee_timer := 0.0
var _melee_aim := Vector2.RIGHT
# shoot / stationary_shoot state machine. Iter 16: dropped the
# vestigial COOLDOWN value — the original code transitioned to it
# briefly then bounced straight back to IDLE on the next tick, doing
# nothing. The cooldown timer drains in IDLE's else-branch instead.
enum CastState { IDLE, WINDUP }
var _cast_state: CastState = CastState.IDLE
var _cast_timer := 0.0
var _cast_aim := Vector2.RIGHT

# Iter 230 / Expansion Team R2 — shield_walker (Bulwark) state.
#
# `_shield_facing` is updated every tick toward the hero so the 90°
# front cone (±SHIELD_CONE_HALF rad of this vector) is always pointing
# at the most current threat direction. take_hit reads this together
# with `source_pos` (3rd optional arg) to decide whether incoming
# damage is FRONT (reduce 75%) or REAR/FLANK (full damage + break
# shield).
#
# `_shield_broken_time` is the remaining duration of the "shield is
# down" window — set to SHIELD_BREAK_DURATION when a flank lands. While
# > 0, ALL damage applies at full value (front hits no longer reduced)
# AND the shield arc Polygon2D fades to alpha 0.18 to communicate the
# vulnerable window. Player can punish for 1.5 s before the shield
# restores.
#
# `_shield_arc` is the Polygon2D rendered as a child of the enemy node,
# pointing in `_shield_facing`. Built once in _ready when the enemy is
# of behavior == "shield_walker"; rotation updated every tick.
const SHIELD_CONE_HALF: float = PI * 0.25      # 45° each side = 90° cone
const SHIELD_REDUCTION: float = 0.25           # 1 - 0.75 — pass 25% through
const SHIELD_BREAK_DURATION: float = 1.5       # window of full damage after flank
const SHIELD_ARC_RADIUS: float = 36.0
const SHIELD_ARC_COLOR: Color = Color(0.55, 0.78, 1.20, 0.55)
const SHIELD_ARC_BROKEN_ALPHA: float = 0.18
var _shield_facing: Vector2 = Vector2.RIGHT
var _shield_broken_time: float = 0.0
var _shield_arc: Polygon2D = null

# Iter 234 / Expansion Team R3 — flying_orbit (Moth) state.
#
# A flying enemy that circles the hero at a steady radius, occasionally
# darting in for a contact attack. Brings a NEW tactical axis — until
# iter-234 every enemy moved on the 2D plane, so flying creates the
# first archetype the player has to read with a different positioning
# instinct (can't be flanked by simply walking around; presents from
# above; crosses where the player can't).
#
# State machine:
#   ORBIT  — pick a tangent direction (clockwise or counter), set
#            velocity perpendicular to the hero-vector + a small radial
#            correction so the moth holds a stable orbit radius.
#            Periodically (DIVE_INTERVAL) commit to a DIVE.
#   DIVE   — straight-line lunge at the hero for DIVE_DURATION. Contact
#            damage applies during the dive (same body-bump shape as
#            chase_contact). After DIVE_DURATION elapses, return to
#            ORBIT (radius re-establishes naturally via the correction).
#
# Tunables: orbit radius 180 px (mid-screen, comfortable dash range so
# the player can close OR shoot), orbit speed equals move_speed
# (uses enemy_type.move_speed; ~80 in the moth.tres), dive duration
# 0.4s straight-line at 1.6× move_speed so the dive READS as a sudden
# threat — not just "the moth got a little closer."
const MOTH_ORBIT_RADIUS: float = 180.0
const MOTH_ORBIT_RADIUS_TOLERANCE: float = 28.0   # ± window for radial correction
const MOTH_DIVE_INTERVAL: float = 3.5             # cycle time between dives
const MOTH_DIVE_DURATION: float = 0.4
const MOTH_DIVE_SPEED_MULT: float = 1.6           # × move_speed during dive
const MOTH_RADIAL_CORRECTION: float = 0.45        # weight of radial pullback vs tangent

enum MothState { ORBIT, DIVE }
var _moth_state: MothState = MothState.ORBIT
var _moth_dive_cooldown: float = 0.0
var _moth_dive_timer: float = 0.0
var _moth_dive_dir: Vector2 = Vector2.RIGHT
# +1 = clockwise, -1 = counter-clockwise. Randomized per spawn so two
# moths don't orbit in lockstep + a single moth visually commits to one
# orbital direction the player can read.
var _moth_orbit_sign: float = 1.0

# Iter 238 / Expansion Team R4 — charger (Tuskbrod) state.
#
# Completes the missing-archetype trio (shield/flying/charger). 3-state
# machine: WANDER (slow approach) → TELEGRAPH (~1.0s windup with locked
# aim ray) → CHARGE (~0.5s straight-line lunge at 4× speed).
#
# State machine:
#   WANDER     — approach hero at half move_speed (lumbering tank). Tick
#                the windup cooldown; when in range + cooldown clear,
#                enter TELEGRAPH.
#   TELEGRAPH  — stop, face hero, lock aim direction. Sprite scales up +
#                warm-red windup tint pulses. A bright red Line2D child
#                appears showing the LANE the charge will follow — stays
#                LOCKED at telegraph-start so a sidestepping hero can
#                escape the path (the charger commits early). After
#                CHARGER_WINDUP_DURATION elapse, enter CHARGE.
#   CHARGE     — set velocity = locked_aim × move_speed × CHARGE_SPEED_MULT.
#                Damage on contact at +1 above normal (high-impact slam).
#                After CHARGER_CHARGE_DURATION, return to WANDER with
#                stun. The aim ray hides during charge.
#
# Constants chosen for readability: a 1.0s telegraph is long enough for a
# dodge or sidestep, short enough to feel decisive. A 0.5s charge at
# 4× speed (200 px/s on a 50 px/s base) covers ~100 px — about three
# hero-widths, threatening but not "wall-to-wall instant death."
const CHARGER_WINDUP_DURATION: float = 1.0
const CHARGER_CHARGE_DURATION: float = 0.5
const CHARGER_RECOVERY_DURATION: float = 0.6
const CHARGER_WANDER_SPEED_MULT: float = 0.5
const CHARGER_CHARGE_SPEED_MULT: float = 4.0
const CHARGER_TRIGGER_RANGE: float = 220.0    # within this distance → telegraph
const CHARGER_CONTACT_DAMAGE_BONUS: int = 1   # +1 over enemy_type.contact_damage during charge
const CHARGER_AIM_RAY_LENGTH: float = 360.0
const CHARGER_AIM_RAY_WIDTH: float = 5.0
const CHARGER_AIM_RAY_COLOR: Color = Color(1.25, 0.35, 0.25, 0.75)

enum ChargerState { WANDER, TELEGRAPH, CHARGE, RECOVERY }
var _charger_state: ChargerState = ChargerState.WANDER
var _charger_timer: float = 0.0
var _charger_aim: Vector2 = Vector2.RIGHT
var _charger_aim_ray: Line2D = null
# Iter 230 — last-known damage source position. Set transiently by
# take_hit's 3rd optional arg so the shield damage-direction check can
# decide FRONT vs FLANK. Fallback (no source given) keeps the legacy
# "always full damage" path so non-shield enemies behave unchanged.
var _last_damage_source_pos: Vector2 = Vector2.ZERO
var _last_damage_source_valid: bool = false

signal died_at(world_pos: Vector2)
# Iter 37 — boss phase machine. Emitted by take_hit the first time hp
# drops below enemy_type.phase2_hp_threshold * max_hp. main.gd connects
# this on boss spawn to fire the "ENRAGED" banner + camera punch.
# Non-boss enemies CAN also use phase 2 if their enemy_type has
# phase2_overrides set, but typically only bosses author it.
signal phase_changed(phase: int)

# Iter 37 — current phase. Starts at 1; transitions to 2 the first time
# HP crosses the phase2 threshold (default 50%). Used to gate the
# transition to once-per-enemy (re-crossing the threshold from healing
# can't retrigger).
var _phase: int = 1

# iter-103 — elite affix per-instance state. Set by main.gd._spawn_enemy_type
# AFTER instantiate but BEFORE add_child, so the affix is applied at
# _ready time (where the visual tint lands). Values:
#   ""        no affix (default — most enemies)
#   "frost"   slows hero on contact (apply_slow 1.0s × 0.6)
#   "ember"   spawns death AoE damaging hero in radius
#   "venom"   applies DoT on contact (apply_venom 2.0s → 4 ticks)
#   "warded"  -1 incoming damage (clamped min 1 so DoT-only setups
#             aren't fully invalidated)
# Rolled at spawn time in main.gd for floor 2+ non-boss enemies at
# a base 22% chance — see _maybe_apply_elite_affix in main.gd.
var elite_affix: String = ""
const ELITE_AFFIX_TINTS: Dictionary = {
	"frost":  Color(0.55, 0.85, 1.20, 1.0),   # cool cyan-blue
	"ember":  Color(1.30, 0.65, 0.45, 1.0),   # warm red-orange
	"venom":  Color(0.65, 1.20, 0.55, 1.0),   # sickly green
	"warded": Color(1.20, 1.10, 0.75, 1.0),   # silver-gold
}
const ELITE_AFFIX_NAMES: Dictionary = {
	"frost":  "FROST",
	"ember":  "EMBER",
	"venom":  "VENOM",
	"warded": "WARDED",
}
# iter-229 / Polish Team R2 — affix tooltip text. Surface the affix
# rules in-game so the player learns "what does that cyan glow do"
# without dying to discover it. main.gd._update_affix_tooltip reads
# this dict when a hovered/proximate elite enemy is detected.
const ELITE_AFFIX_DESCRIPTIONS: Dictionary = {
	"frost":  "Slows you on contact (1.0s, 40% slower).",
	"ember":  "Explodes on death — 2 damage in a 56px radius.",
	"venom":  "Applies VENOM on contact — 4 dmg over 2.0s.",
	"warded": "Takes -1 damage from all incoming hits (min 1).",
}
# Frost slow tuning.
const ELITE_FROST_DURATION: float = 1.0
const ELITE_FROST_MULTIPLIER: float = 0.6
# Venom DoT tuning. duration passed to apply_venom; hero ticks at 0.5s
# for HERO_VENOM_TICK_INTERVAL → 2.0s = 4 ticks × 1 dmg = 4 total.
const ELITE_VENOM_DURATION: float = 2.0
# Ember death AoE tuning.
const ELITE_EMBER_RADIUS: float = 56.0
const ELITE_EMBER_DAMAGE: int = 2
# Warded incoming-damage reduction.
const ELITE_WARDED_DR: int = 1

# iter-103: apply on-contact elite affix effect to the hero. Called
# from every enemy-contact-damage site (chase_contact body bump,
# bomber detonation, wraith strike, telegraphed_melee swing). Each
# affix dispatches to the hero's matching apply_* method:
#   frost  → apply_slow(1.0s, 0.6×)
#   venom  → apply_venom(2.0s, 4 ticks × 1 dmg = 4 over 2s)
#   ember  → fires in _die() instead (death explosion, not on-contact)
#   warded → defensive only, clamps incoming damage in take_hit
# No-op for non-affix enemies and for affix=="ember"/"warded".
#
# iter-104: spawn a labeled floater on the hero so the player sees
# which affix just procced. Without the floater, status effects fire
# silently and players have to trial-and-error which colored enemy
# does what.
# iter-229 / Polish Team R2 — build the display label that the hero's
# take_damage(_, _, source_name) records so the death screen can show
# "CAUSE OF DEATH: Frost Slime" rather than "(unknown)". Prepends the
# affix when present (e.g. "Frost Slime", "Ember Wraith") so an elite
# kill reads visibly different from its non-elite peer's contact death.
func _affix_aware_source_name() -> String:
	if enemy_type == null:
		return ""
	var base: String = str(enemy_type.display_name)
	if base == "":
		return ""
	if elite_affix != "" and ELITE_AFFIX_NAMES.has(elite_affix):
		var aname: String = str(ELITE_AFFIX_NAMES[elite_affix]).capitalize()
		return "%s %s" % [aname, base]
	return base

func _apply_contact_affix() -> void:
	if _hero == null or not is_instance_valid(_hero):
		return
	if elite_affix == "frost" and _hero.has_method("apply_slow"):
		_hero.apply_slow(ELITE_FROST_DURATION, ELITE_FROST_MULTIPLIER)
		_spawn_affix_floater("SLOW", ELITE_AFFIX_TINTS["frost"], _hero.global_position)
	elif elite_affix == "venom" and _hero.has_method("apply_venom"):
		_hero.apply_venom(ELITE_VENOM_DURATION)
		_spawn_affix_floater("VENOM", ELITE_AFFIX_TINTS["venom"], _hero.global_position)

# iter-104: floater helper. Wraps DamageNumber.spawn with a slightly
# higher vertical offset and the affix tint, so proc feedback reads
# distinct from damage numbers (which spawn at -28). Parented to the
# enemy's parent (the room scene) so the label survives this enemy's
# death (relevant for ember's death AoE label).
func _spawn_affix_floater(label: String, color: Color, anchor_pos: Vector2) -> void:
	var host: Node = get_parent()
	if host == null:
		return
	var n: DamageNumber = DamageNumber.spawn(
		anchor_pos + Vector2(0, -88),
		label,
		color,
	)
	host.add_child(n)

# Iter 43 — burn status. Set by hero.gd when a FLAME-themed proc (e.g.
# Embers of Ruin relic) rolls successfully. Each tick deals 1 damage
# every _burn_tick_interval; total burn life = _burn_remaining. Burn
# DOES NOT count as a "hit" for is_crit visuals — the burn tick is a
# discreet orange floater, not a crit highlight. Burn damage CAN kill
# (calls _die normally) so a chain of burns can finish off low-HP mobs.
const BURN_TICK_INTERVAL: float = 0.4
const BURN_DAMAGE_PER_TICK: int = 1
var _burn_remaining: float = 0.0
var _burn_tick_timer: float = 0.0
# Cached for restoring the sprite tint when burn fades.
var _burn_active: bool = false

func apply_burn(duration: float) -> void:
	# Refresh: a fresh burn application either extends the existing
	# burn OR resets to `duration` (whichever is longer). Avoids
	# back-to-back applications producing shorter total burn than a
	# single big proc.
	if _dying:
		return
	# Iter 53 — emit audio cue only on the FIRST tick of a fresh burn
	# (was_burning false → true). Refresh applications during an
	# already-active burn don't re-trigger the sound to avoid drone.
	var was_burning: bool = _burn_active
	_burn_remaining = max(_burn_remaining, duration)
	_burn_tick_timer = 0.0   # first tick fires within ~one frame
	_burn_active = true
	if not was_burning:
		Events.enemy_burned.emit(global_position)
	# Iter 202 — Noita-tier status combo. If this enemy was already
	# slowed when burn lands, trigger the SHATTER combo (thermal
	# shock — frost-stiff body + sudden heat = extra damage burst).
	# Single-direction guard via _shatter_cd avoids loop-firing when
	# multiple sources stack burn over the same window.
	if _slow_remaining > 0.0 and _shatter_cd <= 0.0:
		_trigger_shatter_combo()

# Iter 46 — slow status. Multiplies the enemy's effective move_speed by
# _slow_multiplier (defaults 1.0 = no slow). Tick down _slow_remaining
# each physics frame; when it hits 0, reset multiplier to 1.0.
# Stronger slows OVERRIDE weaker ones (min comparison) so a Glacial
# Resonance proc lands a 0.40 multiplier on top of a Frost Pulse's 0.60
# rather than the weaker effect winning. Sprite gets a blue tint while
# slowed so the player reads the status at a glance.
const SLOW_DEFAULT_MULTIPLIER: float = 0.55   # 45% slow
var _slow_remaining: float = 0.0
var _slow_multiplier: float = 1.0

func apply_slow(duration: float, multiplier: float = SLOW_DEFAULT_MULTIPLIER) -> void:
	if _dying:
		return
	# Iter 53 — emit audio cue only on the FIRST application of a slow
	# (previously unslowed → slowed). Refresh applications during an
	# active slow don't re-trigger.
	var was_slowed: bool = _slow_remaining > 0.0
	_slow_remaining = max(_slow_remaining, duration)
	# Stronger slow wins (lower multiplier = more slowed).
	_slow_multiplier = min(_slow_multiplier, multiplier)
	if not was_slowed:
		Events.enemy_slowed.emit(global_position)
	# Iter 202 — Noita-tier status combo. Mirror of the burn-onto-slow
	# case in apply_burn above: if this enemy is already BURNING when
	# slow lands, the same SHATTER combo fires (thermal shock — heat
	# meets frost). Symmetric so the trigger order doesn't matter.
	if _burn_remaining > 0.0 and _shatter_cd <= 0.0:
		_trigger_shatter_combo()

# Iter 202 — status combo dispatcher. Noita's signature design move:
# two compatible statuses combining into a third effect that's bigger
# than either alone. Combos wired so far:
#   BURN + SLOW   → SHATTER       (thermal shock damage burst — iter 202)
#   BURN + DEATH  → KINDLE_SPREAD (flames jump to neighbors — iter 212)
#   SLOW + CRIT   → PETRIFY       (brief stun on crit-against-slowed — iter 215)
#   BURN + PUSH   → SCATTER_FLAMES (knockback burning enemy → embers — iter 215)
# Hero-side combos (BACKDRAFT, RIME_TRAIL) live in hero.gd because they
# fire on hero actions (parry, dash-through) rather than enemy state
# transitions.
# Cooldown prevents loop-firing when multiple sources stack the trigger
# status in the same frame.
const SHATTER_COMBO_COOLDOWN: float = 0.45
const SHATTER_COMBO_DAMAGE: int = 2
var _shatter_cd: float = 0.0

# Iter 212 — KINDLE_SPREAD combo constants. When a BURNING enemy dies,
# fire jumps to all enemies within KINDLE_RADIUS. Short duration so the
# chain stays bounded (a chained kindle's burn is shorter than the
# initial burn that killed the enemy, so chain dies out naturally).
const KINDLE_RADIUS: float = 96.0
const KINDLE_BURN_DURATION: float = 1.5

# Iter 215 — PETRIFY combo (Phase 4 / SLOW + CRIT). When a slowed enemy
# is hit with a CRIT, they're briefly stunned — can't move, can't
# attack, can't cast. Strong CONTROL payoff for the player. Cooldown
# is per-enemy so back-to-back crits on a slowed target don't infinite-
# stun them. The stun TIMER is read by behavior ticks (chase/shoot/
# telegraphed_melee) to short-circuit AI and freeze velocity.
const PETRIFY_DURATION: float = 0.6
const PETRIFY_COOLDOWN: float = 1.2
var _petrify_remaining: float = 0.0
var _petrify_cd: float = 0.0

# Iter 215 — SCATTER_FLAMES combo (Phase 4 / BURN + KNOCKBACK). When a
# burning enemy is knocked back, embers scatter from its body — nearby
# enemies catch a short burn. Reinforces positioning: knocking burning
# foes into clusters punishes positioning even more.
const SCATTER_FLAMES_RADIUS: float = 64.0
const SCATTER_FLAMES_BURN_DURATION: float = 0.8
const SCATTER_FLAMES_COOLDOWN: float = 0.5
var _scatter_flames_cd: float = 0.0

func _trigger_shatter_combo() -> void:
	_shatter_cd = SHATTER_COMBO_COOLDOWN
	# iter-229 / Polish Team R2 — bump the run-scope SHATTER counter
	# for the death-screen "STATUS COMBOS FIRED" summary line. Guarded
	# for headless tests that don't autoload GameState.
	if Engine.has_singleton("GameState") or Engine.get_main_loop().root.has_node("/root/GameState"):
		var gs: Node = Engine.get_main_loop().root.get_node_or_null("/root/GameState")
		if gs != null and gs.has_method("note_combo_fired"):
			gs.note_combo_fired("shatter")
	# Apply combo damage. take_hit handles the death path + tier
	# feedback + damage number + audio so we get the full feedback
	# stack for free.
	take_hit(SHATTER_COMBO_DAMAGE, false)
	# Visual: bright cyan-white expanding ring at the enemy. Read as
	# "frost shattered by heat" — pale frost color rather than the
	# warm orange of a fire pulse, since the freeze is what BREAKS.
	var ring: Polygon2D = Polygon2D.new()
	var pts: PackedVector2Array = PackedVector2Array()
	var verts: int = 18
	var r: float = (enemy_type.collision_radius if enemy_type != null else 16.0) * 2.2
	for i in range(verts):
		var ang: float = float(i) / verts * TAU
		pts.append(Vector2(cos(ang) * r, sin(ang) * r * 0.85))
	ring.polygon = pts
	ring.color = Color(0.75, 0.92, 1.0, 0.78)
	ring.scale = Vector2(0.25, 0.25)
	ring.z_index = 3
	add_child(ring)
	var tw: Tween = create_tween().set_parallel(true)
	tw.tween_property(ring, "scale", Vector2(1.15, 1.15), 0.22)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(ring, "modulate:a", 0.0, 0.22)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.chain().tween_callback(ring.queue_free)
	# Pop a "SHATTER" damage floater above the head (orange-pink crit
	# styling tells the player a special proc happened, not a regular
	# hit).
	var dn_pos: Vector2 = global_position + Vector2(0, -40)
	var dn: DamageNumber = DamageNumber.spawn(
		dn_pos, "SHATTER!", Color(0.95, 0.78, 0.55)
	)
	var parent_for_dn: Node = get_parent()
	if parent_for_dn != null:
		parent_for_dn.add_child(dn)

# Iter 212 — KINDLE_SPREAD combo. Called from _die() when this enemy
# dies while BURN is active. Iterates all enemies in the room and
# applies a short-duration burn to each one within KINDLE_RADIUS that
# isn't already dying. Visual: orange expanding ring at the corpse +
# "KINDLE" floater. Second Noita-tier status combo wired into the same
# dispatcher pattern as SHATTER. Reuses existing apply_burn so the
# downstream tick + audio + tint stack happens for free.
func _trigger_kindle_spread() -> void:
	var hit_count: int = 0
	for node in get_tree().get_nodes_in_group("enemies"):
		if node == self or not is_instance_valid(node):
			continue
		# Same _dying guard as the separation-vector loop — don't ignite
		# corpses or in-flight death animations.
		if node.get("_dying"):
			continue
		if not (node is Node2D):
			continue
		var dist: float = global_position.distance_to((node as Node2D).global_position)
		if dist > KINDLE_RADIUS:
			continue
		if node.has_method("apply_burn"):
			node.call("apply_burn", KINDLE_BURN_DURATION)
			hit_count += 1
	# No neighbors in range → skip visual (no point in a kindle ring
	# nothing reacted to).
	if hit_count == 0:
		return
	# iter-229 / Polish Team R2 — bump the run-scope KINDLE counter.
	# Single bump per spread event, not per ignited neighbor — the
	# stat reads as "how many times you kindled" rather than total
	# fires propagated.
	var gs2: Node = Engine.get_main_loop().root.get_node_or_null("/root/GameState")
	if gs2 != null and gs2.has_method("note_combo_fired"):
		gs2.note_combo_fired("kindle")
	# Visual: warm-orange expanding ring centered on the corpse. Reads
	# as "fire jumping outward." Slightly slower expansion than SHATTER
	# (0.36 s vs 0.22 s) — gives more time to see the chain land.
	var ring: Polygon2D = Polygon2D.new()
	var pts: PackedVector2Array = PackedVector2Array()
	var verts: int = 18
	for i in range(verts):
		var ang: float = float(i) / verts * TAU
		pts.append(Vector2(cos(ang) * KINDLE_RADIUS, sin(ang) * KINDLE_RADIUS * 0.7))
	ring.polygon = pts
	ring.color = Color(1.0, 0.55, 0.18, 0.55)
	ring.scale = Vector2(0.15, 0.15)
	ring.z_index = 3
	# Iter 212 — parent the ring to scene root rather than self so it
	# isn't culled when this corpse queue_frees in ~0.8s. Otherwise the
	# ring blinks out mid-expansion when the dying enemy is removed.
	var sroot: Node = get_parent()
	if sroot == null:
		sroot = get_tree().current_scene
	if sroot != null:
		sroot.add_child(ring)
		ring.global_position = global_position
		var tw: Tween = ring.create_tween().set_parallel(true)
		tw.tween_property(ring, "scale", Vector2(1.0, 1.0), 0.36)\
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		tw.tween_property(ring, "modulate:a", 0.0, 0.36)\
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		tw.chain().tween_callback(ring.queue_free)
	# KINDLE floater (orange) above the corpse.
	var dn_pos: Vector2 = global_position + Vector2(0, -40)
	var dn: DamageNumber = DamageNumber.spawn(
		dn_pos, "KINDLE!", Color(1.0, 0.65, 0.30)
	)
	var parent_for_dn: Node = get_parent()
	if parent_for_dn != null:
		parent_for_dn.add_child(dn)

# Iter 215 — PETRIFY combo dispatcher (Phase 4 / SLOW + CRIT). Called
# from take_hit() when is_crit AND _slow_remaining > 0. Stuns the
# enemy for PETRIFY_DURATION seconds (read by behavior ticks to skip
# AI). Cooldown prevents stun-locking a slowed target with consecutive
# crits.
func _trigger_petrify() -> void:
	_petrify_cd = PETRIFY_COOLDOWN
	_petrify_remaining = PETRIFY_DURATION
	velocity = Vector2.ZERO
	# Visual: ice-blue ring + crackle pattern. Reads as the enemy
	# locked in place by sudden cold-shock force.
	var ring: Polygon2D = Polygon2D.new()
	var pts: PackedVector2Array = PackedVector2Array()
	var verts: int = 14
	var r: float = (enemy_type.collision_radius if enemy_type != null else 16.0) * 1.6
	for i in range(verts):
		var ang: float = float(i) / verts * TAU
		pts.append(Vector2(cos(ang) * r, sin(ang) * r * 0.9))
	ring.polygon = pts
	ring.color = Color(0.62, 0.85, 1.0, 0.78)
	ring.scale = Vector2(0.3, 0.3)
	ring.z_index = 3
	add_child(ring)
	var tw: Tween = create_tween().set_parallel(true)
	tw.tween_property(ring, "scale", Vector2(1.0, 1.0), 0.22)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(ring, "modulate:a", 0.0, PETRIFY_DURATION + 0.1)\
		.set_trans(Tween.TRANS_LINEAR)
	tw.chain().tween_callback(ring.queue_free)
	# Floater. Cool blue tone — control payoff, not damage payoff.
	var dn_pos: Vector2 = global_position + Vector2(0, -40)
	var dn: DamageNumber = DamageNumber.spawn(
		dn_pos, "PETRIFY!", Color(0.65, 0.88, 1.0)
	)
	var parent_for_dn: Node = get_parent()
	if parent_for_dn != null:
		parent_for_dn.add_child(dn)

# Iter 215 — SCATTER_FLAMES combo dispatcher (Phase 4 / BURN + KNOCKBACK).
# Called from apply_knockback() when this enemy is burning. Spawns a
# small ember pulse at the enemy's CURRENT position (BEFORE the
# knockback moves them) and applies a short burn to neighbors within
# SCATTER_FLAMES_RADIUS. Reinforces positioning play.
func _trigger_scatter_flames() -> void:
	_scatter_flames_cd = SCATTER_FLAMES_COOLDOWN
	# Apply short burn to nearby enemies (NOT including self — self is
	# already burning, and the chain shouldn't double-amplify the
	# already-burning enemy who triggered this).
	var r2: float = SCATTER_FLAMES_RADIUS * SCATTER_FLAMES_RADIUS
	var hit_count: int = 0
	for node in get_tree().get_nodes_in_group("enemies"):
		if node == self or not is_instance_valid(node):
			continue
		if node.get("_dying"):
			continue
		if not (node is Node2D):
			continue
		var d: Vector2 = (node as Node2D).global_position - global_position
		if d.length_squared() <= r2 and node.has_method("apply_burn"):
			node.call("apply_burn", SCATTER_FLAMES_BURN_DURATION)
			hit_count += 1
	# Visual: small warm burst at the enemy's CURRENT position (the
	# burst stays where the scatter happened even when the enemy gets
	# knocked away). Parent to scene root so it persists past this
	# enemy's potential death.
	var ring: Polygon2D = Polygon2D.new()
	var pts: PackedVector2Array = PackedVector2Array()
	var verts: int = 12
	for i in range(verts):
		var ang: float = float(i) / verts * TAU
		pts.append(Vector2(cos(ang) * SCATTER_FLAMES_RADIUS * 0.9, sin(ang) * SCATTER_FLAMES_RADIUS * 0.7))
	ring.polygon = pts
	ring.color = Color(1.0, 0.58, 0.20, 0.58)
	ring.scale = Vector2(0.2, 0.2)
	ring.z_index = 2
	var sroot: Node = get_parent()
	if sroot == null:
		sroot = get_tree().current_scene
	if sroot != null:
		sroot.add_child(ring)
		ring.global_position = global_position
		var tw: Tween = ring.create_tween().set_parallel(true)
		tw.tween_property(ring, "scale", Vector2(1.0, 1.0), 0.28)\
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		tw.tween_property(ring, "modulate:a", 0.0, 0.28)\
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		tw.chain().tween_callback(ring.queue_free)
	# Floater only fires if at least one neighbor caught fire — silent
	# scatter on an isolated burning enemy still LOOKS right (the
	# burst still plays), but the SCATTER! word is reserved for the
	# moment that actually spread.
	if hit_count > 0:
		var dn_pos: Vector2 = global_position + Vector2(0, -40)
		var dn: DamageNumber = DamageNumber.spawn(
			dn_pos, "SCATTER!", Color(1.0, 0.62, 0.25)
		)
		var parent_for_dn: Node = get_parent()
		if parent_for_dn != null:
			parent_for_dn.add_child(dn)

# Iter 46 — slow-aware speed read. Used by all behavior ticks instead
# of direct enemy_type.move_speed accesses so slow applies uniformly
# across chase / approach / kite / shoot behaviors.
func _effective_move_speed() -> float:
	if enemy_type == null:
		return 0.0
	return enemy_type.move_speed * _slow_multiplier

# Iter 70 — baseline modulate read. Returns the EnemyType's authored
# sprite_modulate, defaulting to white if no type is bound. Used by
# every status-effect restoration path (burn fade, slow fade, melee/
# cast/heal/summoner windup-end, _die, knockback) instead of a hard-
# coded white so enemies that REUSE another's sheets but author a
# baseline tint (e.g. spectral_priest greener than priest) retain
# their distinguishing color after the status clears.
func _baseline_modulate() -> Color:
	if enemy_type == null:
		return Color(1, 1, 1, 1)
	# iter-103: if the enemy has an elite affix, the baseline tint
	# multiplies the EnemyType's natural sprite_modulate with the affix
	# tint. Burn / slow / windup status tints still override temporarily
	# (those bypass _baseline_modulate by assigning directly to
	# sprite.modulate), but every restore-to-baseline path here picks up
	# the affix coloring. Multiplicative (not replacement) so an enemy
	# with a non-default sprite_modulate (spectral_priest green, etc.)
	# blends with the affix rather than losing its base identity.
	var base: Color = enemy_type.sprite_modulate
	if elite_affix != "" and ELITE_AFFIX_TINTS.has(elite_affix):
		var affix_tint: Color = ELITE_AFFIX_TINTS[elite_affix]
		base = Color(base.r * affix_tint.r, base.g * affix_tint.g, base.b * affix_tint.b, base.a)
	return base

func _ready() -> void:
	add_to_group("enemies")
	if enemy_type == null:
		push_warning("Enemy spawned with no enemy_type set — will sit inert.")
		return
	_build_sprite_frames()
	_apply_type_to_sprite_and_collision()
	hp = enemy_type.max_hp
	# Cache hero reference. Group is set by hero.gd's _ready.
	var heroes: Array = get_tree().get_nodes_in_group("hero")
	if heroes.size() > 0:
		_hero = heroes[0]
	sprite.play(&"idle")
	# Iter 20 — shoot-behavior enemies start with a cooldown already
	# running, so they can't fire on the FIRST tick after spawn-in. Pre-
	# fix, a bonecap (stationary turret) would instant-cast the moment
	# the player walked into range with zero windup, since _cast_timer
	# defaulted to 0.0. The full cast_cooldown is too long for a fair
	# warmup; use half (matches the player's average reaction window).
	if enemy_type.behavior == "shoot" or enemy_type.behavior == "stationary_shoot":
		_cast_timer = enemy_type.cast_cooldown * 0.5
	# Iter 147 — spawn telegraph. Bright red ground-ring pulse at the
	# enemy's feet for SPAWN_IN_DURATION seconds so the player sees
	# WHERE materialization is happening in peripheral vision, not
	# just the (already-present) red-translucent sprite fade. Self-
	# destructs at its own lifetime; no cleanup needed here. Bosses
	# already have their own boss-intro cinematic; skip the ground
	# telegraph for them (the cinematic IS the telegraph).
	if _spawn_in_time > 0.0 and not enemy_type.is_boss:
		var tele: Node2D = SPAWN_TELEGRAPH_SCENE.instantiate() as Node2D
		if tele != null:
			add_child(tele)
	# Iter 152 — randomize idle-bob phase so a clump of enemies doesn't
	# bob in lockstep. randf() gives a 0..1 value; multiplied by TAU
	# spreads phases evenly across the sin cycle.
	_idle_bob_phase = randf() * TAU
	# Iter 153 — build ground shadow. Built programmatically (not in the
	# .tscn) so the shadow scales with enemy_type.sprite_scale at spawn
	# time; bosses get a bigger shadow, slimes get a smaller one.
	_build_ground_shadow()
	# Iter 177 — apply the iter-117 sprite outline shader. Pre-iter-177
	# only the hero used it; enemies blended into the dark floor with
	# no rim definition. Now every enemy sprite gets a 1-px near-black
	# outline so the silhouette pops the same way the hero's does.
	# Bosses get a slightly thicker outline (1.5 px) so their bigger
	# sprites carry the silhouette weight too.
	_apply_outline_shader()
	# Iter 166 — first-encounter banner. If this enemy type hasn't been
	# seen this session, briefly show its display_name above the head.
	# Helps players learn the 20-enemy roster — Hades canonical. Bosses
	# skipped (they have their own iter-148 intro cinematic).
	_maybe_show_first_encounter_banner()
	# Iter 230 / Expansion Team R2 — shield_walker (Bulwark) shield arc.
	# Built as a Polygon2D child node so the visual lives next to the
	# enemy automatically (rotates / moves with it, despawns on death).
	# Only spawn the arc for enemies whose behavior tag is "shield_walker"
	# so non-shield enemies pay zero overhead.
	if enemy_type.behavior == "shield_walker":
		_ensure_shield_arc()
	# Iter 234 / Expansion Team R3 — flying_orbit (Moth) per-spawn orbit
	# direction. 50/50 clockwise vs counter so a pair of moths visually
	# split (one orbits left, one orbits right) instead of stacking on
	# the same arc. Read once at spawn — the moth COMMITS to one
	# direction for its lifetime; the dive recovery reuses the same sign
	# so the orbit re-establishes naturally on the post-dive arc.
	if enemy_type.behavior == "flying_orbit":
		_moth_orbit_sign = 1.0 if randf() < 0.5 else -1.0
		# Stagger first dive so multiple moths in a wave don't all dive on
		# the same frame.
		_moth_dive_cooldown = MOTH_DIVE_INTERVAL * randf_range(0.5, 1.0)
	# Iter 238 / Expansion Team R4 — charger (Tuskbrod) aim-ray Line2D.
	# Built once at spawn so the show/hide path during the state machine
	# is just an alpha toggle (no per-frame allocation). The line is
	# invisible (alpha 0) by default and only fades in during TELEGRAPH.
	if enemy_type.behavior == "charger":
		_ensure_charger_aim_ray()

# Iter 177 — outline shader applied at runtime so every enemy gets
# the same silhouette definition the hero has had since iter-117.
# ShaderMaterial built programmatically vs baked into enemy.tscn so
# the .tscn stays minimal and the shader-param tuning lives in
# code where it's easy to scan/adjust per enemy class.
#
# Outline color matches the hero (dark blue (0.04, 0.04, 0.08)) so
# every silhouette in the scene shares the same edge family.
# Width 1.0 px for normal enemies; 1.5 for bosses so their bigger
# sprites carry the outline weight proportionally.
const OUTLINE_SHADER: Shader = preload("res://assets/shaders/sprite_outline.gdshader")
const OUTLINE_COLOR: Color = Color(0.04, 0.04, 0.08, 0.85)

func _apply_outline_shader() -> void:
	if sprite == null:
		return
	var mat: ShaderMaterial = ShaderMaterial.new()
	mat.shader = OUTLINE_SHADER
	mat.set_shader_parameter("outline_color", OUTLINE_COLOR)
	var width: float = 1.5 if (enemy_type != null and enemy_type.is_boss) else 1.0
	mat.set_shader_parameter("outline_width", width)
	sprite.material = mat

# Iter 166 — first-encounter banner. Each unique enemy type the player
# meets THIS SESSION gets a one-shot floating label above the head:
# fade in 0.2 s, hold 1.1 s, fade out 0.4 s. Helps the player learn
# the 20-enemy roster. Skipped for:
#   • Bosses (they have their own iter-22 / iter-148 cinematics)
#   • Enemies whose type is already in GameState.seen_enemy_names_session
# The "_session" field resets only on game launch (in-memory autoload),
# so repeated runs in one session won't re-spam intros — the player
# learns once per game-launch then plays uninterrupted.
const FIRST_ENCOUNTER_FADE_IN: float = 0.20
const FIRST_ENCOUNTER_HOLD: float = 1.10
const FIRST_ENCOUNTER_FADE_OUT: float = 0.40

func _maybe_show_first_encounter_banner() -> void:
	if enemy_type == null or enemy_type.is_boss:
		return
	var name: String = str(enemy_type.display_name)
	if name == "" or name == "Enemy":
		return
	if name in GameState.seen_enemy_names_session:
		return
	GameState.seen_enemy_names_session.append(name)
	# Build a small Label as a CHILD of the enemy node — it follows the
	# enemy's position so even if the player moves the camera the
	# banner stays visually anchored to the introducing creature.
	var lbl: Label = Label.new()
	lbl.text = name.to_upper()
	lbl.add_theme_font_size_override("font_size", 16)
	lbl.add_theme_color_override("font_color", Color(1.0, 0.93, 0.80, 1.0))
	lbl.add_theme_color_override("font_outline_color", Color(0.08, 0.04, 0.02, 0.95))
	lbl.add_theme_constant_override("outline_size", 3)
	lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	# Width centered around the enemy center: 240 px wide, offset_left = -120.
	# Position above the head — y -60 is roughly above any enemy silhouette
	# given our sprite_y_offset values of -20 to -32.
	lbl.size = Vector2(240, 24)
	lbl.position = Vector2(-120, -64)
	lbl.modulate.a = 0.0
	# z_index +5 so it draws above the enemy + its shadow + spawn ring.
	lbl.z_index = 5
	add_child(lbl)
	var tw: Tween = create_tween()
	tw.tween_property(lbl, "modulate:a", 1.0, FIRST_ENCOUNTER_FADE_IN)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_interval(FIRST_ENCOUNTER_HOLD)
	tw.tween_property(lbl, "modulate:a", 0.0, FIRST_ENCOUNTER_FADE_OUT)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.tween_callback(lbl.queue_free)

# Iter 153 — construct the per-enemy ground shadow Polygon2D. 12-segment
# elliptical disc with 1.0:0.45 aspect ratio (matches the spawn_telegraph
# top-down perspective squash). Radius scales linearly with sprite_scale,
# baseline 14 px at scale=1.0 so a slime (scale ~0.6) gets ~8 px, a
# boss (scale ~1.3) gets ~18 px. Color is dark with 0.35 alpha — visible
# on bright floors, not opaque on dark ones.
#
# z_index = -2 places it BEHIND both the sprite (z=0) and the iter-147
# spawn_telegraph (z=-1) — the spawn telegraph briefly OVERLAYS the
# shadow during materialization, then disappears leaving the shadow
# alone.
func _build_ground_shadow() -> void:
	if enemy_type == null:
		return
	var sc: float = enemy_type.sprite_scale
	# Iter 217 Phase 6 — radius softened from 14 → 11 px-at-scale-1.0 so
	# a slime gets ~7 px and a boss gets ~14 px. Combined with the
	# alpha drop from 0.35 → 0.26, the shadow reads as "the silhouette
	# anchors to the floor" instead of "the enemy casts a 3D shadow."
	var rx: float = 11.0 * sc
	var ry: float = rx * 0.45
	var pts: PackedVector2Array = PackedVector2Array()
	for i in range(12):
		var ang: float = (float(i) / 12.0) * TAU
		pts.append(Vector2(cos(ang) * rx, sin(ang) * ry))
	_shadow = Polygon2D.new()
	_shadow.name = "Shadow"
	_shadow.position = Vector2(0, 12)  # at the "feet" — same as spawn_telegraph
	_shadow.color = Color(0, 0, 0, SHADOW_BASE_ALPHA)
	_shadow.polygon = pts
	_shadow.z_index = -2
	_shadow_base_scale = Vector2.ONE
	add_child(_shadow)

# Build SpriteFrames from per-state sheets. Each state becomes one
# animation; frames are AtlasTextures pointing into the sheet at
# (idx * cell_size, 0). Same trick as hero.gd's _build_sprite_frames
# but driven by an EnemyType resource instead of an inline table.
func _build_sprite_frames() -> void:
	var t: EnemyType = enemy_type
	var sf: SpriteFrames = SpriteFrames.new()
	if sf.has_animation("default"):
		sf.remove_animation("default")
	# Use a small inline table so we don't repeat the slice loop four times.
	# Each row: (anim_name, sheet, frame_count, fps, loop).
	# iter-110: hurt row added. Plays once at HURT_ANIM_FPS for ~0.15s
	# when the enemy takes damage AND has a hurt_sheet declared. Loop
	# false so it doesn't replay forever; enemy.gd routes back to walk/
	# idle after the hold window expires.
	var rows: Array = [
		[&"idle",   t.idle_sheet,   t.frames_idle,   t.fps_idle,   true],
		[&"walk",   t.walk_sheet,   t.frames_walk,   t.fps_walk,   true],
		[&"attack", t.attack_sheet, t.frames_attack, t.fps_attack, false],
		[&"hurt",   t.hurt_sheet,   t.frames_hurt,   HURT_ANIM_FPS,  false],
		[&"death",  t.death_sheet,  t.frames_death,  t.fps_death,  false],
	]
	for row in rows:
		var anim_name: StringName = row[0]
		var sheet: Texture2D = row[1]
		var n_frames: int = row[2]
		var fps: float = row[3]
		var loop: bool = row[4]
		# attack_sheet may be null for chase_contact types. Skip cleanly —
		# they never request the "attack" anim so the missing slot is fine.
		if sheet == null or n_frames <= 0:
			continue
		sf.add_animation(anim_name)
		sf.set_animation_speed(anim_name, fps)
		sf.set_animation_loop(anim_name, loop)
		for fr in n_frames:
			var atlas: AtlasTexture = AtlasTexture.new()
			atlas.atlas = sheet
			atlas.region = Rect2(fr * t.cell_size, 0, t.cell_size, t.cell_size)
			sf.add_frame(anim_name, atlas)
	sprite.sprite_frames = sf

# Apply per-type sprite + collision tweaks. Kept tiny — the enemy.tscn
# carries reasonable defaults (scale, offset, collision shape) and we
# just overwrite them with the type's values.
func _apply_type_to_sprite_and_collision() -> void:
	var t: EnemyType = enemy_type
	sprite.scale = Vector2(t.sprite_scale, t.sprite_scale)
	sprite.position.y = t.sprite_y_offset
	# Iter 70 — start with the SPAWN_IN_START red ghost (the spawn-in fade
	# in _physics_process lerps from this toward _baseline_modulate over
	# SPAWN_IN_DURATION). Without this initialization the first frame
	# would briefly paint the enemy at sprite_modulate before the fade
	# overrides it — a 1-frame pop is visible at small framerates.
	sprite.modulate = SPAWN_IN_START_COLOR
	# iter-88 — spawn portal companion FX. Hand-painted Frostwindz
	# portal sprite sheet (7 frames @ 14fps, ~0.5s lifetime) — purple
	# summoning vortex opening, sparking, closing. Replaces the
	# iter-86 SpawnBurst (which was procedural floor-crack + wisps
	# CPUParticles2D) since the painted asset reads dramatically better.
	# Spawned into the parent scene so the FX lives in world space
	# and trails off after the enemy materializes.
	#
	# Scale 1.5× makes the 64-px sheet read ~96px in-world — visible
	# but not dominating. z_index 2 sits above floor/blood marks but
	# below the enemy sprite (default z) so the enemy emerges THROUGH
	# the portal rather than behind it.
	var parent_for_burst: Node = get_parent()
	if parent_for_burst != null:
		FxSpriteCls.spawn(parent_for_burst, global_position, "spawn_portal", {
			"scale": Vector2(1.5, 1.5),
			"z_index": 2,
		})
	# Collision shape — fresh CircleShape2D every spawn so we don't share
	# a shape resource across all instances of one type (Godot would
	# complain about resource mutation if we changed it later anyway).
	var shape: CircleShape2D = CircleShape2D.new()
	shape.radius = t.collision_radius
	collision.shape = shape
	# Iter 27 (REMOVED iter-192) — enemy ground shadow.
	#
	# Iter 192 batch 1 — Removed entirely per user direction. The fixed-
	# position (0, 4) shadow ellipse didn't track each enemy_type's
	# sprite_y_offset variation, so enemies with negative offsets had
	# their visual feet land ABOVE the shadow → "floating" reading.
	# Fix options were (a) per-enemy shadow Y derived from offset, or
	# (b) remove. User flagged (b) as the cleaner choice:
	#   "if contact shadows still look wrong, remove them entirely."
	#
	# Removal works because the room provides other grounding:
	#   • Decor scatter (bones / runes / blood) under enemies' feet
	#   • Wall + pillar drop shadows define floor depth
	#   • CanvasModulate creates a dim ambient that the bottom rows of
	#     enemy sprites blend into, anchoring them to the floor
	# Without an ellipse shadow, top-down 2D enemies sit cleanly on
	# the floor by virtue of their own pixel-art bottom edges (the same
	# reason Hollow Knight + Isaac + Hyper Light Drifter don't draw
	# ellipse shadows under their actors).

# ── Physics tick — universal scaffolding + behavior dispatch ──────────
# Iter 152 — idle bob runs in _process (separate from physics) so the
# visual oscillation is smooth at the render framerate, not snapped to
# the physics step. Gated to suppress during action states where other
# sprite-position writers might already be active or where the bob
# would fight an in-flight transform tween:
#   • _dying           — death anim takes over the sprite
#   • _spawn_in_time   — spawn-in fade owns the modulate; position
#                         stays at baseline (no fight, but visually
#                         the materialization beat should be still)
#   • _hurt_anim_time  — hurt anim should look like a real flinch,
#                         not a flinch + ambient bob
# Outside those, the bob is constant — applied to walk + attack +
# idle. Walk + attack feels right (the bob layered over locomotion
# reads as "breathing while moving"). Attack mid-windup carries an
# iter-139 scale ramp but the iter-139 path doesn't touch
# position, so the bob coexists cleanly.
func _process(_delta: float) -> void:
	if enemy_type == null or sprite == null:
		return
	if _dying or _spawn_in_time > 0.0 or _hurt_anim_time > 0.0:
		return
	var t: float = Time.get_ticks_msec() / 1000.0
	var sin_v: float = sin((t * TAU * IDLE_BOB_FREQ) + _idle_bob_phase)
	var bob: float = sin_v * IDLE_BOB_AMP
	sprite.position.y = enemy_type.sprite_y_offset + bob
	# Iter 153 — shadow pulse in COUNTER-phase with the bob. When the
	# sprite is HIGH (sin_v > 0 → bob > 0 → sprite moved up), the foot
	# is "off the ground," so shadow SHRINKS. When sprite is LOW
	# (sin_v < 0 → bob < 0 → sprite settled down), foot is "on the
	# ground," shadow GROWS. Counter-phase by negating sin_v before
	# applying the pulse amplitude.
	if _shadow != null:
		var shadow_pulse: float = -sin_v * SHADOW_PULSE_AMP
		_shadow.scale = _shadow_base_scale * (1.0 + shadow_pulse)

func _physics_process(delta: float) -> void:
	# Iter 202 — status combo cooldown tick. Decrements even during
	# spawn-in / knockback / death so the value stays sane across all
	# states. Empty cooldown = next status application can trigger
	# the SHATTER combo again.
	_shatter_cd = maxf(0.0, _shatter_cd - delta)
	# Iter 215 — Phase 4 combo cooldown ticks. Same always-on
	# decrement pattern.
	_petrify_cd = maxf(0.0, _petrify_cd - delta)
	_petrify_remaining = maxf(0.0, _petrify_remaining - delta)
	_scatter_flames_cd = maxf(0.0, _scatter_flames_cd - delta)
	# Death drain → free. Skip all gameplay logic so corpses don't keep
	# chasing the hero.
	if _dying:
		_death_timer -= delta
		if _death_timer <= 0.0:
			queue_free()
		return
	# Iter 43 — burn tick. Drains _burn_remaining and applies tick
	# damage at intervals. Runs BEFORE spawn-in / knockback gates so
	# burns persist through knockbacks (consistent with player
	# expectations — getting hit doesn't extinguish a fire). Skip
	# during _spawn_in_time so an enemy can't be pre-burned-to-death.
	if _burn_active and _spawn_in_time <= 0.0:
		_burn_remaining -= delta
		_burn_tick_timer -= delta
		# iter-101 BUG FIX: paint the sprite warm-orange while burning.
		# The slow-tick block below carries a comment ("Don't overwrite
		# the burn tint — orange wins") that gates AROUND a burn tint
		# which was never actually applied anywhere. FLAME DoT relics
		# (Embers of Ruin, Cataclysm) had no enemy-side visual feedback
		# — players saw one orange damage number and nothing else for
		# the remaining ~3 ticks. Now the sprite reads as on fire while
		# the DoT runs.
		if sprite != null:
			sprite.modulate = Color(1.35, 0.75, 0.40, 1.0)
		if _burn_tick_timer <= 0.0:
			_burn_tick_timer = BURN_TICK_INTERVAL
			hp -= BURN_DAMAGE_PER_TICK
			# Orange floater so burn damage reads distinct from melee/
			# crit/spike damage. Smaller font (default) so a stream of
			# burns doesn't dominate the HUD.
			var dn: DamageNumber = DamageNumber.spawn(
				global_position + Vector2(0, -28),
				str(BURN_DAMAGE_PER_TICK),
				Color(1.0, 0.55, 0.20),
			)
			var parent_b: Node = get_parent()
			if parent_b != null:
				parent_b.add_child(dn)
			Events.enemy_hit.emit(global_position)
			if hp <= 0:
				_die()
				return
		if _burn_remaining <= 0.0:
			_burn_active = false
			# iter-101: restore baseline (or slow tint if also slowed)
			# now that the burn ended. Slow tick below handles the slow
			# case separately when burn isn't active.
			if sprite != null:
				if _slow_remaining > 0.0:
					sprite.modulate = Color(0.7, 0.9, 1.2, 1.0)
				else:
					sprite.modulate = _baseline_modulate()
	# Iter 46 — slow tick. Drains _slow_remaining; resets multiplier
	# when it expires. Applied via _effective_move_speed() in the
	# behavior ticks; this block just manages the timer. Sprite gets
	# a cyan-blue modulate while slowed so the status is visible.
	if _slow_remaining > 0.0:
		_slow_remaining -= delta
		if _slow_remaining <= 0.0:
			_slow_multiplier = 1.0
			if sprite != null and not _burn_active:
				sprite.modulate = _baseline_modulate()
		elif sprite != null and not _burn_active:
			# Don't overwrite the burn tint (orange wins — burn is more
			# damaging). Only paint blue when slowed-without-burning.
			sprite.modulate = Color(0.7, 0.9, 1.2, 1.0)
	# Iter 15 spawn-in fade. While ticking down, the enemy is locked,
	# invulnerable (see take_hit guard), and modulating from red-ghost
	# to full opacity. This is the visual telegraph window for
	# wave-spawn placement.
	# Iter 70 — lerp end target is _baseline_modulate() (was a hardcoded
	# SPAWN_IN_END_COLOR white). Enemies that authored a sprite_modulate
	# on their EnemyType (e.g. spectral_priest green) settle into THAT
	# tint after spawn-in, not white.
	if _spawn_in_time > 0.0:
		_spawn_in_time = max(0.0, _spawn_in_time - delta)
		var st: float = 1.0 - (_spawn_in_time / SPAWN_IN_DURATION)
		sprite.modulate = SPAWN_IN_START_COLOR.lerp(_baseline_modulate(), st)
		velocity = Vector2.ZERO
		# Iter 20 bugfix — only call play() if we're not already on idle.
		# AnimatedSprite2D.play() RESTARTS the animation from frame 0;
		# calling it every physics tick during the 0.5 s spawn-in window
		# pinned the idle anim to frame 0 forever (it never cycled).
		# Same compare-and-set trick hero.gd uses in _play_anim.
		if sprite.sprite_frames != null and sprite.sprite_frames.has_animation(&"idle"):
			if sprite.animation != &"idle" or not sprite.is_playing():
				sprite.play(&"idle")
		return
	# Knockback overrides AI. Velocity decays linearly to zero by the end
	# of the window, then control hands back to the behavior tick.
	if _knockback_time > 0.0:
		_knockback_time = max(0.0, _knockback_time - delta)
		var k_t: float = _knockback_time / _knockback_total if _knockback_total > 0.0 else 0.0
		velocity = _knockback_velocity * k_t
		move_and_slide()
		return
	if enemy_type == null:
		return
	# Iter 215 — PETRIFY combo gate (Phase 4). While petrified, the
	# enemy is frozen: no AI, no movement, no attack. Velocity zeroed
	# so any in-flight movement doesn't carry over. Placed AFTER the
	# knockback block so a knockback in progress still resolves (the
	# enemy can't "use petrify as iframes from knockback") but BEFORE
	# behavior dispatch so AI ticks are skipped entirely.
	if _petrify_remaining > 0.0:
		velocity = Vector2.ZERO
		move_and_slide()
		return
	# Behavior dispatch — one branch per supported tag. Unknown tags fall
	# through to chase_contact (the most forgiving default).
	match enemy_type.behavior:
		"telegraphed_melee":
			_tick_telegraphed_melee(delta)
		"shoot":
			_tick_shoot(delta)
		"stationary_shoot":
			_tick_stationary_shoot(delta)
		"bomber":
			_tick_bomber(delta)
		"healer":
			_tick_healer(delta)
		"summoner":
			_tick_summoner(delta)
		"wraith":
			_tick_wraith(delta)
		"glyph_warden":
			_tick_glyph_warden(delta)
		"shield_walker":
			_tick_shield_walker(delta)
		"flying_orbit":
			_tick_flying_orbit(delta)
		"charger":
			_tick_charger(delta)
		_:
			_tick_chase_contact(delta)

# ── Behavior: chase_contact ───────────────────────────────────────────
# Walk straight at hero. Body-bump deals damage on a timer while in
# contact range. Used by slime, crypt_spider, orc, ember, werewolf.
# Iter 169 / 172 — stuck-detection + wall-slide. Two-layer logic:
#
#   1) WALL-SLIDE (iter-172) — primary fix. After move_and_slide
#      reports a collision with a static body, recompute velocity to
#      run TANGENT to the wall (projected onto the wall plane,
#      preferring the tangent direction that's still pointing toward
#      the hero). This is what move_and_slide ALMOST does internally,
#      but when the input velocity is near-perpendicular to the wall
#      the slide extracts only the residual tangential component
#      which is too small to extricate — so we replace velocity with
#      the FULL-SPEED tangent.
#
#   2) RANDOM-PERPENDICULAR DODGE (iter-169) — fallback. If after
#      STUCK_CHECK_INTERVAL the enemy moved less than STUCK_DIST_THRESHOLD
#      despite a non-zero intended velocity, force a 50/50 perpendicular
#      direction for STUCK_DODGE_DURATION. Handles the rare case where
#      wall-slide picks the wrong side of an L-shaped wedge.
#
# Caller pattern (chase_contact / telegraphed_melee IDLE chase):
#   var intended := dir_to_hero * speed
#   velocity = _maybe_stuck_dodge(delta, intended)
#   move_and_slide()
#   velocity = _apply_wall_slide(intended)     # ← iter-172 post-hoc
#
# Why post-hoc: we need get_slide_collision_count() which only has
# meaningful values AFTER move_and_slide(). The slide-adjusted
# velocity takes effect on the NEXT frame's move_and_slide(), which
# is fine — that's how Godot's CharacterBody2D propagates anyway.
func _maybe_stuck_dodge(delta: float, intended: Vector2) -> Vector2:
	# Currently in a dodge window — keep using the perpendicular dir
	# at the intended speed.
	if _stuck_dodge_timer > 0.0:
		_stuck_dodge_timer -= delta
		return _stuck_dodge_dir * intended.length()
	# Tick the stuck-check timer; only evaluate when interval elapses.
	_stuck_check_timer += delta
	if _stuck_check_timer < STUCK_CHECK_INTERVAL:
		return intended
	_stuck_check_timer = 0.0
	var moved: float = global_position.distance_to(_stuck_check_pos)
	_stuck_check_pos = global_position
	if intended.length() < 1.0 or moved >= STUCK_DIST_THRESHOLD:
		return intended
	# Stuck. Pick a perpendicular direction. 50/50 left/right.
	var dir: Vector2 = intended.normalized()
	var perp: Vector2 = Vector2(-dir.y, dir.x)
	if randf() < 0.5:
		perp = -perp
	_stuck_dodge_dir = perp
	_stuck_dodge_timer = STUCK_DODGE_DURATION
	return perp * intended.length()

# Iter 173 — boids separation force. Returns a unit vector pointing
# AWAY from nearby allies, weighted by inverse distance (closer
# enemies push harder). Returns Vector2.ZERO if no neighbors are
# within SEPARATION_RADIUS. Dying / fading-corpse enemies are
# ignored so survivors don't dodge ghosts. O(n²) per frame but n
# is small (≤ ~10/wave) and the check is cheap arithmetic.
func _compute_separation_vector() -> Vector2:
	var v: Vector2 = Vector2.ZERO
	var n: int = 0
	# Iter 236 / Bug Team R4 — consume main.gd's per-frame enemies snapshot
	# instead of re-walking the SceneTree group every physics tick. At 30+
	# enemies (phase-3 Tyrant + summons) the old `get_nodes_in_group` walk
	# compounded across consumers (separation + AoE + ricochet) into dozens
	# of tree walks per frame. Single source of truth now refreshes once
	# per _process; we just read it here. Falls back to the direct group
	# walk when no main scene exposes the snapshot (e.g. iter-224 test that
	# instantiates enemies under a bare holder Node2D) — keeps the function
	# usable outside the production scene graph.
	var iterable: Array = []
	var scene: Node = get_tree().current_scene
	if scene != null and scene.has_method("get_enemy_snapshot"):
		iterable = scene.call("get_enemy_snapshot")
	else:
		iterable = get_tree().get_nodes_in_group("enemies")
	for e in iterable:
		if e == self or not is_instance_valid(e):
			continue
		# Iter 191 — fix Godot 4 runtime crash. `bool(x)` constructor is
		# not callable in 4.x; the cast throws "Nonexistent 'bool'
		# constructor." e.get("_dying") returns the bool value (or null
		# if the property is missing); GDScript truthiness handles both
		# null → false and bool → its own value, so the wrap is
		# unnecessary AND broken.
		if e.get("_dying"):
			continue
		# Iter 224 — Bug Team defensive guard. The "enemies" group is
		# joined by Enemy instances today (all Node2D-derived), but a
		# future breakable / debug node mistakenly added would crash this
		# per-physics-frame loop on the bare `as Node2D` coerce →
		# primitive null on `.global_position`. is_instance_valid alone
		# doesn't tell us if the member is a Node2D.
		if not (e is Node2D):
			continue
		var d: Vector2 = global_position - (e as Node2D).global_position
		var dist: float = d.length()
		if dist > 0.001 and dist < SEPARATION_RADIUS:
			v += d / (dist * dist)  # inverse-distance squared weight
			n += 1
	if n > 0 and v.length() > 0.001:
		v = v.normalized()
	return v

# Iter 172 — wall-slide. Call AFTER move_and_slide(). When the enemy
# hit a static body this frame, project the INTENDED velocity (the
# chase direction × speed) onto the wall tangent — the direction
# along the wall surface. This is what move_and_slide's residual
# slide does naturally, but only with the SHRUNK tangential component;
# we want the FULL-SPEED tangent so the enemy keeps moving along
# the wall instead of grinding to a halt.
#
# Picks the tangent that's still pointing toward the hero (a wall
# has TWO tangent directions, we want the one that progresses
# toward our chase target).
func _apply_wall_slide(intended: Vector2) -> void:
	if intended.length() < 1.0:
		return
	if get_slide_collision_count() == 0:
		return
	if _hero == null or not is_instance_valid(_hero):
		return
	# Use the FIRST collision normal. If multiple, average them?
	# For our scale (one enemy hitting one wall) the first is enough.
	var col: KinematicCollision2D = get_slide_collision(0)
	if col == null:
		return
	var normal: Vector2 = col.get_normal()
	# Two tangent directions perpendicular to the wall normal.
	var tan_a: Vector2 = Vector2(-normal.y, normal.x)
	var tan_b: Vector2 = Vector2(normal.y, -normal.x)
	# Pick the tangent that's closer to "toward hero" direction.
	var to_hero: Vector2 = (_hero.global_position - global_position)
	if to_hero.length_squared() < 0.01:
		return
	var aim: Vector2 = to_hero.normalized()
	var chosen: Vector2 = tan_a if tan_a.dot(aim) > tan_b.dot(aim) else tan_b
	velocity = chosen * intended.length()

func _tick_chase_contact(delta: float) -> void:
	var t: EnemyType = enemy_type
	_contact_cd = max(0.0, _contact_cd - delta)
	# iter-106: brief attack-anim window after a body-bump (see decl
	# at line ~104). Drains every tick; when > 0 we hold the attack
	# pose instead of letting walk/idle override below.
	_contact_attack_anim_time = max(0.0, _contact_attack_anim_time - delta)
	# iter-110: hurt-anim hold has higher priority than attack-anim
	# hold — getting hit interrupts whatever the enemy was doing.
	_hurt_anim_time = max(0.0, _hurt_anim_time - delta)
	if _hurt_anim_time > 0.0 and t.frames_hurt > 0:
		# Hold the hurt pose; AI still updates velocity but visually
		# the enemy is staggered. Don't override sprite below.
		if _hero != null and is_instance_valid(_hero):
			var to_hero_h: Vector2 = _hero.global_position - global_position
			sprite.flip_h = to_hero_h.x < 0
		move_and_slide()
		return
	if _hero == null or not is_instance_valid(_hero):
		velocity = Vector2.ZERO
		sprite.play(&"idle")
		return
	var to_hero: Vector2 = _hero.global_position - global_position
	var dist: float = to_hero.length()
	# Save the intended velocity outside the if so we can wall-slide
	# after move_and_slide regardless of which branch we took.
	var intended: Vector2 = Vector2.ZERO
	if t.can_move() and dist > 1.0:
		# Iter 169 — stuck-dodge fallback (random perpendicular for
		# long-stuck cases). Iter 172 — wall-slide post-move below
		# handles the COMMON "I'm hitting a wall right now" case.
		# Iter 173 — separation. Blend a lateral force pushing away
		# from nearby allies so 4+ chasers encircle the hero instead
		# of stacking on one point. SEPARATION_FORCE 0.45 keeps the
		# chase primary; the separation is a spacing nudge, not an
		# AI overhaul.
		var to_dir: Vector2 = to_hero.normalized()
		var speed: float = _effective_move_speed()
		var sep: Vector2 = _compute_separation_vector()
		intended = (to_dir + sep * SEPARATION_FORCE).normalized() * speed
		velocity = _maybe_stuck_dodge(delta, intended)
		# iter-106: hold "attack" pose during the post-hit window so
		# the sprite reads as the bite/lunge that landed damage.
		# Fall back to walk if the enemy has no attack frames OR the
		# window has expired.
		if _contact_attack_anim_time > 0.0 and t.frames_attack > 0:
			sprite.play(&"attack")
		else:
			sprite.play(&"walk")
	else:
		velocity = Vector2.ZERO
		if _contact_attack_anim_time > 0.0 and t.frames_attack > 0:
			sprite.play(&"attack")
		else:
			sprite.play(&"idle")
	sprite.flip_h = to_hero.x < 0
	move_and_slide()
	# Iter 172 — if we hit a wall this frame, re-aim velocity along
	# the wall tangent toward the hero. Takes effect next frame.
	# No-op when we didn't collide or weren't trying to move.
	_apply_wall_slide(intended)
	if dist < t.contact_range and _contact_cd <= 0.0:
		_contact_cd = t.contact_cooldown
		# iter-106: arm the attack-anim hold so the next ~250 ms plays
		# the attack pose. Only set when the enemy actually has attack
		# frames declared (no-op for legacy contact mobs with frames_attack=0).
		if t.frames_attack > 0:
			_contact_attack_anim_time = CONTACT_ATTACK_ANIM_DURATION
		if _hero.has_method("take_damage"):
			# iter-70 polish: pass our position so hero knockback is
			# AWAY from us, not hero-facing-inversion fallback.
			# iter-229: pass display_name so death screen can show
			# "CAUSE OF DEATH: Slime" instead of "(unknown)".
			_hero.take_damage(t.contact_damage, global_position, _affix_aware_source_name())
			# iter-103: elite affix on-contact effects. Frost slows the
			# hero; venom applies a DoT. Ember + warded fire elsewhere
			# (_die and take_hit). Guarded by has_method so the call
			# is robust to test contexts where _hero isn't a full hero.
			_apply_contact_affix()
			# Iter 198 — per-enemy signature contact attack. Pre-iter-
			# 198 every chase_contact enemy did identical body-bumps
			# (5 stat reskins per agent audit). Now orc slams, slime
			# bounces, etc. Empty contact_attack = legacy bump only.
			if t.contact_attack != "":
				_apply_contact_signature(t.contact_attack)

# Iter 198 — per-enemy signature contact-attack dispatch. Routes the
# enemy's contact_attack tag to a specific visual + mechanical extra
# that fires alongside the base body-bump damage. Each signature is
# small enough not to lengthen the contact moment (still feels like
# "the enemy hit me"), but distinct enough that orc-slam reads
# different from slime-bounce reads different from werewolf-leap.
func _apply_contact_signature(kind: String) -> void:
	match kind:
		"slam":
			# ORC SLAM — heavy thump ring. Visual: dark ground-shake
			# polygon expanding from enemy feet. Also adds trauma to
			# camera (light shake on top of the existing hit shake).
			# Reads as "the orc planted a heavy foot and the ground
			# shook." Doesn't deal extra damage — the visual + shake is
			# what makes the orc feel WEIGHTY vs other chasers.
			_spawn_slam_ring()
			if FX != null and FX.has_method("add_trauma"):
				FX.add_trauma(0.15)
		"bounce":
			# SLIME BOUNCE — recoil knockback ON THE SLIME ITSELF. Slime
			# hops backward 80 px over 0.18 s after each contact, then
			# re-engages. Reads as "rubber-ball physics." Uses the
			# existing iter-13 knockback path (apply_knockback) but with
			# direction AWAY from the hero.
			if _hero != null and is_instance_valid(_hero):
				var away: Vector2 = (global_position - _hero.global_position).normalized()
				# Iter 206 — fix iter-198 regression. apply_knockback
				# signature is (dir, force, duration) — 3 args. The
				# original call passed (vec * scalar, scalar) which is
				# only 2 args. Parser caught it on cold-load (smoke
				# test didn't trigger the path because no enemies spawn
				# at scene-load).
				apply_knockback(away, 420.0, 0.18)
		"leap":
			# WEREWOLF LEAP — short forward velocity burst as the
			# werewolf "pounces" through the hero. Sets velocity in the
			# current chase direction for 0.12 s, then resumes normal
			# chase. Reads as "leap-through" pass.
			if _hero != null and is_instance_valid(_hero):
				var toward: Vector2 = (_hero.global_position - global_position).normalized()
				velocity = toward * 400.0
		"ignite":
			# EMBER IGNITE — small warm pulse ring at the ember's feet.
			# Pure visual; the ember's existing on-death AoE handles
			# the damage layer. This makes the ember READ as fire
			# every time it bumps, even when it survives.
			_spawn_ignite_pulse()
		_:
			pass

# Iter 198 — slam ring. Dark expanding ground-shake circle for ORC.
# Sized to enemy's collision radius × 2.5. Color near-black with low
# alpha so it reads as a shadow/dust shockwave, not a damage hitbox.
# Tweens scale up + alpha down over 240 ms then queue_frees.
func _spawn_slam_ring() -> void:
	if enemy_type == null:
		return
	var r: float = enemy_type.collision_radius * 2.5
	var ring: Polygon2D = Polygon2D.new()
	var pts: PackedVector2Array = PackedVector2Array()
	var verts: int = 16
	for i in range(verts):
		var ang: float = float(i) / verts * TAU
		pts.append(Vector2(cos(ang) * r, sin(ang) * r * 0.6))
	ring.polygon = pts
	ring.position = Vector2(0, 12)
	ring.color = Color(0.03, 0.02, 0.03, 0.55)
	ring.scale = Vector2(0.3, 0.3)
	ring.z_index = -1
	add_child(ring)
	var tw: Tween = create_tween().set_parallel(true)
	tw.tween_property(ring, "scale", Vector2(1.0, 1.0), 0.24)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(ring, "modulate:a", 0.0, 0.24)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.chain().tween_callback(ring.queue_free)

# Iter 198 — ignite pulse. Warm orange/red expanding ring for EMBER.
# Same shape as slam ring but in warm fire color, slightly smaller +
# faster. Pure visual cue that the ember is hot to touch.
func _spawn_ignite_pulse() -> void:
	if enemy_type == null:
		return
	var r: float = enemy_type.collision_radius * 2.0
	var ring: Polygon2D = Polygon2D.new()
	var pts: PackedVector2Array = PackedVector2Array()
	var verts: int = 14
	for i in range(verts):
		var ang: float = float(i) / verts * TAU
		pts.append(Vector2(cos(ang) * r, sin(ang) * r * 0.7))
	ring.polygon = pts
	ring.position = Vector2(0, 6)
	ring.color = Color(1.0, 0.45, 0.18, 0.55)
	ring.scale = Vector2(0.35, 0.35)
	ring.z_index = -1
	add_child(ring)
	var tw: Tween = create_tween().set_parallel(true)
	tw.tween_property(ring, "scale", Vector2(1.1, 1.1), 0.18)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(ring, "modulate:a", 0.0, 0.18)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.chain().tween_callback(ring.queue_free)

# ── Behavior: bomber ──────────────────────────────────────────────────
# Iter 47 — kamikaze enemy. Charges hero at high speed. When close
# enough, starts a brief windup (red flash + scale pulse), then
# self-detonates for AoE damage to hero. Always dies on detonation
# regardless of HP. Used by ember_bomber and future kamikaze variants.
#
# State machine:
#   APPROACH   — chase hero at move_speed. When dist < BOMBER_PRIME_DIST,
#                transition to PRIMING.
#   PRIMING    — windup tint + scale pulse for BOMBER_PRIME_TIME. Locked
#                in place; if hero leaves the radius, abort + return
#                to APPROACH. If timer expires while hero in radius,
#                detonate.
#   DETONATING — apply AoE damage + spawn VFX + queue _die.
#
# Reuses contact_range (RoomConfig prime distance), contact_damage
# (detonation damage), contact_cooldown (re-arm interval) from
# EnemyType so authoring stays in the existing schema.
enum BomberState { APPROACH, PRIMING, DETONATING }
const BOMBER_PRIME_TIME: float = 0.45
const BOMBER_EXPLODE_RADIUS: float = 48.0
var _bomber_state: BomberState = BomberState.APPROACH
var _bomber_prime_timer: float = 0.0

func _tick_bomber(delta: float) -> void:
	var t: EnemyType = enemy_type
	if _hero == null or not is_instance_valid(_hero):
		velocity = Vector2.ZERO
		sprite.play(&"idle")
		return
	var to_hero: Vector2 = _hero.global_position - global_position
	var dist: float = to_hero.length()
	match _bomber_state:
		BomberState.APPROACH:
			if t.can_move() and dist > 1.0:
				velocity = to_hero.normalized() * _effective_move_speed()
				sprite.play(&"walk")
			else:
				velocity = Vector2.ZERO
				sprite.play(&"idle")
			sprite.flip_h = to_hero.x < 0
			move_and_slide()
			# Transition to PRIMING when in contact range.
			if dist < t.contact_range:
				_bomber_state = BomberState.PRIMING
				_bomber_prime_timer = BOMBER_PRIME_TIME
				if sprite != null:
					# Red pulse — telegraph the impending detonation.
					sprite.modulate = Color(1.6, 0.7, 0.6, 1.0)
		BomberState.PRIMING:
			velocity = Vector2.ZERO
			move_and_slide()
			_bomber_prime_timer -= delta
			# Scale pulse — sin wave so the bomber visibly grows
			# closer to detonation.
			if sprite != null:
				var pulse_t: float = 1.0 - (_bomber_prime_timer / BOMBER_PRIME_TIME)
				var s: float = 1.0 + 0.18 * pulse_t
				sprite.scale = Vector2(s, s)
				sprite.modulate = Color(
					1.0 + 0.6 * pulse_t,
					0.7 - 0.2 * pulse_t,
					0.5,
					1.0,
				)
			# Abort priming if hero escapes — gives the player a
			# real "dodge the bomb" beat. Distance check uses
			# contact_range * 1.6 as the abort threshold (slight
			# hysteresis so frame-perfect edges don't oscillate).
			if dist > t.contact_range * 1.6:
				_bomber_state = BomberState.APPROACH
				if sprite != null:
					sprite.modulate = _baseline_modulate()
					sprite.scale = Vector2(t.sprite_scale, t.sprite_scale)
				return
			if _bomber_prime_timer <= 0.0:
				_bomber_state = BomberState.DETONATING
				_bomber_detonate()
		BomberState.DETONATING:
			pass   # _bomber_detonate triggers _die; rest of state is moot

func _bomber_detonate() -> void:
	# Hero damage if within blast radius. Damage = contact_damage
	# (authored on the EnemyType — bombers typically have 2 contact dmg).
	if _hero != null and is_instance_valid(_hero):
		var d: float = _hero.global_position.distance_to(global_position)
		if d < BOMBER_EXPLODE_RADIUS:
			if _hero.has_method("take_damage"):
				# iter-70 polish: knockback away from the bomber blast center.
				_hero.take_damage(enemy_type.contact_damage, global_position, _affix_aware_source_name())
				# iter-103: bomber detonation also applies the affix on-hit.
				_apply_contact_affix()
	# Spawn an orange-red VFX. Reuse damage_number for a "BOOM" floater
	# since dash_impact is hero-owned and shouldn't be preloaded here.
	# A custom bomber blast scene could land later.
	var dn: DamageNumber = DamageNumber.spawn(
		global_position,
		"BOOM",
		Color(1.0, 0.45, 0.20),
	)
	var parent_b: Node = get_parent()
	if parent_b != null:
		parent_b.add_child(dn)
	# Bombers always die on detonate — even if hero dodged.
	_die()

# ── Behavior: healer ──────────────────────────────────────────────────
# Iter 65 — support caster. Stays at HEALER_PREFER_DIST from the hero
# (kites away if hero gets too close), scans the `enemies` group at
# HEAL_INTERVAL ticks for the most-wounded ally in HEAL_RADIUS, and
# emits a HEAL_AMOUNT heal on a brief windup. Heals are gated by
# is_instance_valid + _dying so dead enemies can't be resurrected, and
# the most-wounded sort uses hp/max_hp ratio so a 1/10 elite is healed
# before a 2/4 squishy.
#
# State machine:
#   IDLE        — keep ~HEALER_PREFER_DIST from hero, scan for targets;
#                 transition to WINDUP when a wounded ally is in range
#                 AND _heal_cooldown_timer <= 0.
#   WINDUP      — 0.6s windup with a green/teal tint pulse on the healer.
#                 Locked in place. Target stored as _heal_target; if the
#                 target dies or leaves radius during windup, abort back
#                 to IDLE (no cooldown — let the healer pick again).
#   HEAL_PULSE  — single-frame state: apply the heal, spawn the pulse-
#                 ring VFX, transition straight to COOLDOWN.
#   COOLDOWN    — drain _heal_cooldown_timer; while > 0, kite as in IDLE
#                 but skip target scanning. Transition to IDLE at 0.
#
# Telegraph: WINDUP paints the healer in a green tint that intensifies
# over the windup, so the player can read "healer is about to cast" at
# a glance. On HEAL_PULSE we spawn a Polygon2D ring that scales out
# from the healer to the target and fades, drawn under the sprite layer
# so it reads as a ground effect rather than an in-air projectile.
enum HealerState { IDLE, WINDUP, HEAL_PULSE, COOLDOWN }
const HEAL_INTERVAL: float = 3.5
const HEAL_WINDUP: float = 0.6
const HEAL_RADIUS: float = 120.0
const HEAL_AMOUNT: int = 2
const HEALER_PREFER_DIST: float = 200.0
const HEALER_MIN_DIST: float = 160.0
# Ring pulse visual config. The ring expands from ~10 px at the healer
# to ring_max_radius at the target, fades alpha to 0 across PULSE_LIFE.
const HEAL_PULSE_LIFE: float = 0.45
const HEAL_PULSE_RING_SEGMENTS: int = 28
const HEAL_PULSE_RING_WIDTH: float = 4.0
const HEAL_TINT_PEAK: Color = Color(0.6, 1.6, 1.1, 1.0)   # green/teal at peak windup
var _healer_state: HealerState = HealerState.IDLE
var _healer_timer: float = 0.0
var _heal_cooldown_timer: float = 0.0
var _heal_target: Enemy = null

func _tick_healer(delta: float) -> void:
	var t: EnemyType = enemy_type
	if _hero == null or not is_instance_valid(_hero):
		velocity = Vector2.ZERO
		sprite.play(&"idle")
		return
	var to_hero: Vector2 = _hero.global_position - global_position
	var dist: float = to_hero.length()
	sprite.flip_h = to_hero.x < 0
	match _healer_state:
		HealerState.IDLE:
			_healer_movement(to_hero, dist)
			# Scan for a heal target. Pick the most-wounded ally in
			# HEAL_RADIUS; if found AND cooldown is clear, transition.
			if _heal_cooldown_timer > 0.0:
				_heal_cooldown_timer = max(0.0, _heal_cooldown_timer - delta)
			else:
				var target: Enemy = _find_heal_target()
				if target != null:
					_heal_target = target
					_healer_state = HealerState.WINDUP
					_healer_timer = HEAL_WINDUP
					sprite.play(&"attack")
		HealerState.WINDUP:
			velocity = Vector2.ZERO
			move_and_slide()
			# Bail if target died / despawned / left HEAL_RADIUS during
			# windup — no cooldown so the healer can pick again next tick.
			if not _heal_target_valid():
				_heal_target = null
				_healer_state = HealerState.IDLE
				sprite.modulate = _baseline_modulate()
				return
			# Green tint ramps from 0 to peak across the windup so the
			# player reads "the healer is winding up a cast."
			# Iter 70 — lerp source is _baseline_modulate() so an enemy
			# with an authored tint (e.g. spectral_priest green) stays
			# distinguishable through the windup ramp.
			var wt: float = 1.0 - (_healer_timer / HEAL_WINDUP)
			sprite.modulate = _baseline_modulate().lerp(HEAL_TINT_PEAK, wt)
			_healer_timer -= delta
			if _healer_timer <= 0.0:
				_healer_state = HealerState.HEAL_PULSE
		HealerState.HEAL_PULSE:
			# One-frame state — apply heal + spawn VFX, then enter cooldown.
			_apply_heal()
			sprite.modulate = _baseline_modulate()
			_healer_state = HealerState.COOLDOWN
			_heal_cooldown_timer = HEAL_INTERVAL
			_heal_target = null
		HealerState.COOLDOWN:
			# Kite as in IDLE but skip target scanning until cooldown done.
			_healer_movement(to_hero, dist)
			_heal_cooldown_timer = max(0.0, _heal_cooldown_timer - delta)
			if _heal_cooldown_timer <= 0.0:
				_healer_state = HealerState.IDLE

# Healer kite movement. Pushes away from the hero if too close, pulls
# closer if too far, idles in the dead zone between MIN_DIST and
# PREFER_DIST. Speed scales with _effective_move_speed() so slow status
# still applies as expected.
func _healer_movement(to_hero: Vector2, dist: float) -> void:
	var t: EnemyType = enemy_type
	if t.can_move() and dist < HEALER_MIN_DIST:
		# Hero is too close — back away.
		velocity = -to_hero.normalized() * _effective_move_speed()
		sprite.play(&"walk")
		move_and_slide()
	elif t.can_move() and dist > HEALER_PREFER_DIST + 40.0:
		# Hero is far — drift toward HEAL range, but stay slow.
		velocity = to_hero.normalized() * _effective_move_speed() * 0.6
		sprite.play(&"walk")
		move_and_slide()
	else:
		velocity = Vector2.ZERO
		sprite.play(&"idle")

# Scan the `enemies` group for the most-wounded ally in HEAL_RADIUS.
# Excludes self, dying enemies, enemies still in spawn-in fade, and
# allies at full HP. Sort key = hp ratio ascending → lowest-ratio wins.
func _find_heal_target() -> Enemy:
	var best: Enemy = null
	var best_ratio: float = INF
	for node in get_tree().get_nodes_in_group("enemies"):
		if node == self:
			continue
		if not (node is Enemy):
			continue
		var e: Enemy = node
		if e._dying:
			continue
		if e._spawn_in_time > 0.0:
			continue
		if e.enemy_type == null:
			continue
		if e.hp >= e.enemy_type.max_hp:
			continue
		if global_position.distance_to(e.global_position) > HEAL_RADIUS:
			continue
		var ratio: float = float(e.hp) / float(maxi(1, e.enemy_type.max_hp))
		if ratio < best_ratio:
			best_ratio = ratio
			best = e
	return best

# Confirm the stashed _heal_target is still a valid heal candidate.
# Same rules as _find_heal_target plus a still-in-radius check.
func _heal_target_valid() -> bool:
	if _heal_target == null:
		return false
	if not is_instance_valid(_heal_target):
		return false
	if _heal_target._dying:
		return false
	if _heal_target.enemy_type == null:
		return false
	if _heal_target.hp >= _heal_target.enemy_type.max_hp:
		return false
	if global_position.distance_to(_heal_target.global_position) > HEAL_RADIUS:
		return false
	return true

# Apply the heal pulse: bump target HP (capped at max_hp), spawn the
# green floater so the player reads "+2", and spawn the expanding ring
# VFX from healer toward target.
func _apply_heal() -> void:
	if not _heal_target_valid():
		return
	var target: Enemy = _heal_target
	var heal_amount: int = mini(HEAL_AMOUNT, target.enemy_type.max_hp - target.hp)
	if heal_amount <= 0:
		return
	target.hp += heal_amount
	# Green floater above the target — distinct color from damage
	# numbers so the player reads "this enemy was healed."
	var dn: DamageNumber = DamageNumber.spawn(
		target.global_position + Vector2(0, -28),
		"+" + str(heal_amount),
		Color(0.55, 1.0, 0.65, 1.0),
	)
	var parent: Node = get_parent()
	if parent != null:
		parent.add_child(dn)
	# Brief healing flash on the target so it reads as receiving the
	# pulse, not just a free HP refill. Matches the take_hit tween shape.
	if target.sprite != null:
		var tw: Tween = target.create_tween()
		tw.tween_property(target.sprite, "modulate", Color(0.6, 1.6, 1.1, 1), 0.06)
		tw.tween_property(target.sprite, "modulate", Color(1, 1, 1, 1), 0.18)
	# Spawn the pulse ring VFX — expands from the healer toward the
	# target across HEAL_PULSE_LIFE, then queue_frees itself.
	_spawn_heal_pulse(target.global_position)

# Code-built ring VFX. A Node2D wrapper holds a Polygon2D ring (built
# from HEAL_PULSE_RING_SEGMENTS sample points around a circle); a tween
# scales it up + fades alpha across HEAL_PULSE_LIFE, then queue_frees.
# No new .tscn required.
func _spawn_heal_pulse(target_pos: Vector2) -> void:
	var parent: Node = get_parent()
	if parent == null:
		return
	var fx: Node2D = Node2D.new()
	fx.global_position = global_position
	fx.z_index = -1   # under the sprite layer so it reads as ground FX
	parent.add_child(fx)
	# Build the ring as a stroked polygon. Polygon2D doesn't have a
	# native ring primitive; we author a thin annulus by sampling the
	# outer + inner circles and concatenating them with a winding
	# reversal in the middle.
	var ring: Polygon2D = Polygon2D.new()
	var outer_r: float = 28.0
	var inner_r: float = max(0.5, outer_r - HEAL_PULSE_RING_WIDTH)
	var verts: PackedVector2Array = PackedVector2Array()
	for i in range(HEAL_PULSE_RING_SEGMENTS):
		var a: float = (TAU / float(HEAL_PULSE_RING_SEGMENTS)) * float(i)
		verts.append(Vector2(cos(a), sin(a)) * outer_r)
	# Inner loop in reverse so the polygon is a true annulus, not a
	# disc with a chord through it.
	for i in range(HEAL_PULSE_RING_SEGMENTS - 1, -1, -1):
		var a: float = (TAU / float(HEAL_PULSE_RING_SEGMENTS)) * float(i)
		verts.append(Vector2(cos(a), sin(a)) * inner_r)
	ring.polygon = verts
	ring.color = Color(0.55, 1.0, 0.7, 0.85)
	fx.add_child(ring)
	# Compute final scale so the ring's outer edge lands roughly at the
	# target's position. Stops one-shot effects from going off-screen
	# when the target is at the very edge of HEAL_RADIUS.
	var travel: float = global_position.distance_to(target_pos)
	var final_scale: float = max(1.2, (travel + 24.0) / outer_r)
	var tw: Tween = fx.create_tween()
	tw.set_parallel(true)
	tw.tween_property(fx, "scale", Vector2(final_scale, final_scale), HEAL_PULSE_LIFE) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(ring, "modulate:a", 0.0, HEAL_PULSE_LIFE) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	# Drift the ring's center toward the target so it visually "travels"
	# rather than spawning around the healer. Half-distance offset reads
	# as "directed pulse" without losing the source anchor.
	var mid: Vector2 = (global_position + target_pos) * 0.5
	tw.tween_property(fx, "global_position", mid, HEAL_PULSE_LIFE) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	# Reap the FX node when the tween finishes so we don't leak nodes
	# every cast (3.5s cooldown × long room = dozens of orphans).
	tw.chain().tween_callback(fx.queue_free)

# Iter 65 — test-only force-trigger entry point for the headless
# verification script. Skips the windup/cooldown gating so a test can
# assert "calling this heals the wounded ally" without simulating
# 4+ seconds of physics_process ticks. Production AI always goes
# through the IDLE → WINDUP → HEAL_PULSE → COOLDOWN flow.
func _force_heal_for_test(target: Enemy) -> void:
	_heal_target = target
	_apply_heal()

# ── Behavior: summoner ────────────────────────────────────────────────
# Iter 66 — caster that periodically spawns minion enemies during
# combat. Kites from the hero at SUMMONER_KEEP_DIST; on the SUMMON_
# INTERVAL cycle, telegraphs with a dark expanding ring + sprite tint,
# then fires 1-2 enemy_summon_requested events for bonecaps around
# itself. Tracks summoned minions on the instance and caps the live
# pool at SUMMONER_MAX_MINIONS so a single summoner can't infinitely
# stuff the arena.
#
# State machine (mirrors healer pattern):
#   IDLE      — kite at KEEP_DIST. When _summon_cooldown_timer <= 0 AND
#               live-minion-count < cap, transition to WINDUP.
#   WINDUP    — SUMMON_WINDUP seconds. Locked in place. Dark-red tint
#               ramps on the sprite + an expanding dark ring is spawned
#               under the sprite layer as telegraph. Transitions to
#               SUMMON when the timer expires.
#   SUMMON    — one-frame state: pick 1-2 spawn positions around the
#               summoner inside SUMMON_RADIUS, emit enemy_summon_
#               requested for each (main.gd subscribes and instantiates
#               bonecaps via its ENEMY_TYPES pathway). Transition to
#               COOLDOWN with _summon_cooldown_timer set to
#               SUMMON_COOLDOWN.
#   COOLDOWN  — kite as in IDLE but no scan; drain timer; back to IDLE.
#
# Live-minion tracking is per-summoner: we stash WeakRefs to spawned
# minions in _summoned_minions and prune dead/invalid entries before
# the cap check. Using WeakRef so a freed Enemy doesn't keep the array
# entry alive; the cap reflects the current live count.
enum SummonerState { IDLE, WINDUP, SUMMON, COOLDOWN }
const SUMMON_INTERVAL: float = 5.0
const SUMMON_WINDUP: float = 0.8
const SUMMON_COOLDOWN: float = 1.0
const SUMMON_RADIUS: float = 80.0
const SUMMON_KEEP_DIST: float = 240.0
const SUMMONER_MIN_DIST: float = 200.0
const SUMMONER_MAX_MINIONS: int = 3
const SUMMONER_MINION_TYPE: String = "bonecap"
const SUMMONER_TINT_PEAK: Color = Color(1.4, 0.45, 0.55, 1.0)   # dark red at peak windup
# Visual telegraph: dark-red expanding ring (same Polygon2D-annulus
# trick as the heal pulse), scaled out from a small radius at the
# summoner across the windup so the player can read "summoner is
# about to spawn something HERE."
const SUMMON_RING_SEGMENTS: int = 28
const SUMMON_RING_WIDTH: float = 4.0
var _summoner_state: SummonerState = SummonerState.IDLE
var _summoner_timer: float = 0.0
var _summon_cooldown_timer: float = 0.0
var _summoned_minions: Array = []   # Array[WeakRef], pruned on cap check

func _tick_summoner(delta: float) -> void:
	var t: EnemyType = enemy_type
	if _hero == null or not is_instance_valid(_hero):
		velocity = Vector2.ZERO
		sprite.play(&"idle")
		return
	var to_hero: Vector2 = _hero.global_position - global_position
	var dist: float = to_hero.length()
	sprite.flip_h = to_hero.x < 0
	match _summoner_state:
		SummonerState.IDLE:
			_summoner_movement(to_hero, dist)
			# Tick cooldown and scan to summon. Only fire if we're
			# under the live-minion cap — pruning happens inside the
			# cap-count helper.
			if _summon_cooldown_timer > 0.0:
				_summon_cooldown_timer = max(0.0, _summon_cooldown_timer - delta)
			elif _live_minion_count() < SUMMONER_MAX_MINIONS:
				_summoner_state = SummonerState.WINDUP
				_summoner_timer = SUMMON_WINDUP
				sprite.play(&"attack")
				_spawn_summon_telegraph()
		SummonerState.WINDUP:
			velocity = Vector2.ZERO
			move_and_slide()
			# Dark-red tint ramps from 0 to peak across the windup.
			# Distinct from the healer's green tint so the player reads
			# "summoner is winding up" vs "healer is winding up".
			# Iter 70 — lerp from baseline so e.g. bone_summoner's authored
			# purple-red tint stays read through the ramp.
			var wt: float = 1.0 - (_summoner_timer / SUMMON_WINDUP)
			sprite.modulate = _baseline_modulate().lerp(SUMMONER_TINT_PEAK, wt)
			_summoner_timer -= delta
			if _summoner_timer <= 0.0:
				_summoner_state = SummonerState.SUMMON
		SummonerState.SUMMON:
			# One-frame state — fire the summons, then enter cooldown.
			_apply_summon()
			sprite.modulate = _baseline_modulate()
			_summoner_state = SummonerState.COOLDOWN
			_summon_cooldown_timer = SUMMON_COOLDOWN
		SummonerState.COOLDOWN:
			_summoner_movement(to_hero, dist)
			_summon_cooldown_timer = max(0.0, _summon_cooldown_timer - delta)
			if _summon_cooldown_timer <= 0.0:
				_summoner_state = SummonerState.IDLE
				_summon_cooldown_timer = SUMMON_INTERVAL - SUMMON_WINDUP - SUMMON_COOLDOWN

# Summoner kite movement. Same shape as _healer_movement but with the
# summoner's KEEP_DIST. Backs away if hero is closer than MIN_DIST,
# pulls in if past KEEP_DIST + 40 px, idles in the dead zone between.
func _summoner_movement(to_hero: Vector2, dist: float) -> void:
	var t: EnemyType = enemy_type
	if t.can_move() and dist < SUMMONER_MIN_DIST:
		velocity = -to_hero.normalized() * _effective_move_speed()
		sprite.play(&"walk")
		move_and_slide()
	elif t.can_move() and dist > SUMMON_KEEP_DIST + 40.0:
		velocity = to_hero.normalized() * _effective_move_speed() * 0.6
		sprite.play(&"walk")
		move_and_slide()
	else:
		velocity = Vector2.ZERO
		sprite.play(&"idle")

# Prune stale WeakRef entries from _summoned_minions and return the
# live count. Done lazily on each cap check so a dying minion's slot
# frees up on the next summoner tick rather than needing a connect-
# back from the minion.
func _live_minion_count() -> int:
	var alive: Array = []
	for w in _summoned_minions:
		if w == null:
			continue
		var ref: WeakRef = w
		var node: Object = ref.get_ref()
		if node == null:
			continue
		if not (node is Enemy):
			continue
		var e: Enemy = node
		if e._dying or not is_instance_valid(e):
			continue
		alive.append(w)
	_summoned_minions = alive
	return alive.size()

# Fire the summon request events. Spawns 1-2 minions at random
# positions inside SUMMON_RADIUS of the summoner, capped by remaining
# room under SUMMONER_MAX_MINIONS. Uses Events.enemy_summon_requested
# so main.gd's existing handler (originally added for boss phase
# summons) instantiates the enemies via ENEMY_TYPES — keeps this
# script free of the preload dict.
#
# We DEFERRED-connect each spawned Enemy's tree_entered so we can grab
# a reference and stash it in _summoned_minions for cap tracking.
# Since main.gd add_child's the new enemy synchronously, we instead
# match by querying the "enemies" group right after emission — the
# new spawn is the closest unowned enemy at the summon point.
func _apply_summon() -> void:
	var room: int = _live_minion_count()
	var slots: int = SUMMONER_MAX_MINIONS - room
	if slots <= 0:
		return
	var count: int = mini(slots, 1 + randi() % 2)   # 1 or 2 per summon
	for i in range(count):
		var ang: float = randf() * TAU
		var r: float = randf_range(SUMMON_RADIUS * 0.35, SUMMON_RADIUS)
		var spawn_pos: Vector2 = global_position + Vector2(cos(ang) * r, sin(ang) * r)
		# Spawn a small dark burst at each minion's spawn point so the
		# arrival reads on screen rather than just appearing.
		_spawn_summon_burst(spawn_pos)
		Events.enemy_summon_requested.emit(spawn_pos, SUMMONER_MINION_TYPE)
		# Track the newly-spawned minion. main.gd's handler runs
		# synchronously on the signal emit, so by this line the
		# minion is already in the "enemies" group at spawn_pos.
		# Find it by closest-to-spawn_pos (cheap: a wave is rarely
		# more than ~12 enemies) and stash its WeakRef.
		var best: Enemy = null
		var best_d: float = INF
		for node in get_tree().get_nodes_in_group("enemies"):
			if not (node is Enemy):
				continue
			var e: Enemy = node
			if e == self:
				continue
			var d: float = e.global_position.distance_to(spawn_pos)
			if d < best_d and d < 2.0:   # spawned exactly at spawn_pos
				best_d = d
				best = e
		if best != null:
			_summoned_minions.append(weakref(best))

# Spawn the windup telegraph ring at the summoner. Same Polygon2D
# annulus trick as _spawn_heal_pulse but in dark red and expanding
# in place (no drift toward a target). The ring grows from a small
# radius to ~outer_r across SUMMON_WINDUP, then queue_frees.
func _spawn_summon_telegraph() -> void:
	var parent: Node = get_parent()
	if parent == null:
		return
	var fx: Node2D = Node2D.new()
	fx.global_position = global_position
	fx.z_index = -1   # under the sprite so it reads as a ground FX
	parent.add_child(fx)
	var ring: Polygon2D = Polygon2D.new()
	var outer_r: float = 24.0
	var inner_r: float = max(0.5, outer_r - SUMMON_RING_WIDTH)
	var verts: PackedVector2Array = PackedVector2Array()
	for i in range(SUMMON_RING_SEGMENTS):
		var a: float = (TAU / float(SUMMON_RING_SEGMENTS)) * float(i)
		verts.append(Vector2(cos(a), sin(a)) * outer_r)
	for i in range(SUMMON_RING_SEGMENTS - 1, -1, -1):
		var a: float = (TAU / float(SUMMON_RING_SEGMENTS)) * float(i)
		verts.append(Vector2(cos(a), sin(a)) * inner_r)
	ring.polygon = verts
	ring.color = Color(0.85, 0.25, 0.30, 0.75)
	fx.add_child(ring)
	# Scale out across the windup; ending scale ~ SUMMON_RADIUS / outer_r
	# so the ring reaches the spawn-out radius at the moment summons fire.
	var final_scale: float = max(1.5, SUMMON_RADIUS / outer_r)
	fx.scale = Vector2(0.4, 0.4)
	var tw: Tween = fx.create_tween()
	tw.set_parallel(true)
	tw.tween_property(fx, "scale", Vector2(final_scale, final_scale), SUMMON_WINDUP) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(ring, "modulate:a", 0.0, SUMMON_WINDUP) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.chain().tween_callback(fx.queue_free)

# Small dark burst at each minion spawn point. A scaling-out + fading
# dark-red circle so the moment of arrival reads on screen.
func _spawn_summon_burst(pos: Vector2) -> void:
	var parent: Node = get_parent()
	if parent == null:
		return
	var fx: Node2D = Node2D.new()
	fx.global_position = pos
	fx.z_index = -1
	parent.add_child(fx)
	var dot: Polygon2D = Polygon2D.new()
	var verts: PackedVector2Array = PackedVector2Array()
	var burst_r: float = 14.0
	var segments: int = 20
	for i in range(segments):
		var a: float = (TAU / float(segments)) * float(i)
		verts.append(Vector2(cos(a), sin(a)) * burst_r)
	dot.polygon = verts
	dot.color = Color(0.7, 0.2, 0.25, 0.85)
	fx.add_child(dot)
	var tw: Tween = fx.create_tween()
	tw.set_parallel(true)
	tw.tween_property(fx, "scale", Vector2(1.6, 1.6), 0.3) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(dot, "modulate:a", 0.0, 0.3) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.chain().tween_callback(fx.queue_free)

# Iter 66 — test-only force-trigger for headless verification. Skips
# the windup/cooldown gating so a test can assert "summoner emits a
# spawn request" without simulating ~6 seconds of physics ticks.
func _force_summon_for_test() -> void:
	_apply_summon()

# ── Behavior: wraith ──────────────────────────────────────────────────
# Iter 68 — flanking melee phantom. Chases hero at high speed; when
# within WRAITH_PHASE_RANGE and the phase cooldown is clear, the wraith
# VANISHES (alpha 1.0 → 0.3, collision off) for WRAITH_PHASE_OUT_TIME,
# then reappears BEHIND the hero (offset opposite hero motion / facing)
# and lands a single flanking strike on the hero if still in reach.
#
# Counterplay: the wraith is invulnerable during PHASE_OUT/PHASE_IN
# (both alpha-faded + collision-disabled — sword swings whiff, projectiles
# pass through), but it's squishy in CHASE / STRIKE_RECOVERY (4 HP). So
# the player can punish a wraith that's already committed to its strike
# wind-down. The 4.5s interval keeps the phase from feeling spammy.
#
# State machine:
#   IDLE              — no hero in sight; sit at zero velocity. Transitions
#                       to CHASE the moment a hero ref exists.
#   CHASE             — pursue hero at WRAITH_CHASE_SPEED. When within
#                       WRAITH_PHASE_RANGE AND _wraith_cooldown_timer <= 0,
#                       transition to PHASE_OUT.
#   PHASE_OUT         — vanish window. Alpha tween 1.0 → 0.3, collision
#                       suppressed, vanish-mote burst spawned. After
#                       WRAITH_PHASE_OUT_TIME, teleport to behind-hero
#                       and transition to PHASE_IN.
#   PHASE_IN          — reappear window. Alpha tween 0.3 → 1.0, shimmer
#                       FX spawned at the new position. On expiry, swing
#                       at hero if within WRAITH_STRIKE_REACH.
#   STRIKE_RECOVERY   — 0.8s vulnerable pause. Normal speed + alpha;
#                       lets the player punish a missed flank.
enum WraithState { IDLE, CHASE, PHASE_OUT, PHASE_IN, STRIKE_RECOVERY }
const WRAITH_CHASE_SPEED: float = 130.0
const WRAITH_PHASE_INTERVAL: float = 4.5
const WRAITH_PHASE_RANGE: float = 220.0
const WRAITH_PHASE_OUT_TIME: float = 0.35
const WRAITH_PHASE_IN_TIME: float = 0.18
const WRAITH_REAPPEAR_OFFSET: float = 40.0
const WRAITH_STRIKE_DAMAGE: int = 2
const WRAITH_STRIKE_REACH: float = 36.0
const WRAITH_STRIKE_RECOVERY_TIME: float = 0.8
const WRAITH_INVULN_DURING_PHASE: bool = true
# Alpha targets for the phase fade. Not fully transparent so the player
# can still TRACK the wraith during PHASE_OUT (anti-frustration — the
# vanish reads as "ghostly", not "off-screen").
const WRAITH_PHASE_ALPHA: float = 0.3
# Vanish-mote burst — small purple/black motes scattered around the
# wraith's PHASE_OUT origin so the disappearance reads on-screen.
const WRAITH_PHASE_FX_SCENE: PackedScene = preload("res://scenes/fx/wraith_phase_in.tscn")
var _wraith_state: WraithState = WraithState.IDLE
var _wraith_timer: float = 0.0
var _wraith_cooldown_timer: float = 0.0
# Saved collision layer/mask during PHASE_OUT/PHASE_IN so we can restore
# the wraith's normal collision profile when it reappears. Stashed via
# the CharacterBody2D collision_layer/collision_mask read; the body
# starts non-colliding at PHASE_OUT and stays so until STRIKE_RECOVERY.
var _wraith_saved_layer: int = 0
var _wraith_saved_mask: int = 0

func _tick_wraith(delta: float) -> void:
	if _hero == null or not is_instance_valid(_hero):
		velocity = Vector2.ZERO
		sprite.play(&"idle")
		return
	var to_hero: Vector2 = _hero.global_position - global_position
	var dist: float = to_hero.length()
	# Don't flip the sprite during the phase windows — it'd flicker as the
	# wraith teleports across the hero. Only update facing on grounded
	# states (CHASE / STRIKE_RECOVERY).
	match _wraith_state:
		WraithState.IDLE:
			velocity = Vector2.ZERO
			sprite.play(&"idle")
			# Once the hero ref is present (set at _ready), there's no real
			# "idle" — drop straight to CHASE so the wraith engages.
			_wraith_state = WraithState.CHASE
		WraithState.CHASE:
			sprite.flip_h = to_hero.x < 0
			if dist > 1.0:
				velocity = to_hero.normalized() * (WRAITH_CHASE_SPEED * _slow_multiplier)
				sprite.play(&"walk")
			else:
				velocity = Vector2.ZERO
				sprite.play(&"idle")
			move_and_slide()
			# Tick phase cooldown and check for trigger conditions.
			if _wraith_cooldown_timer > 0.0:
				_wraith_cooldown_timer = max(0.0, _wraith_cooldown_timer - delta)
			elif dist <= WRAITH_PHASE_RANGE:
				_enter_wraith_phase_out()
		WraithState.PHASE_OUT:
			velocity = Vector2.ZERO
			# Don't move during phase-out — the wraith is dissolving in
			# place; teleport happens at the end of the window.
			_wraith_timer -= delta
			# Sprite stays on the last walk frame; alpha-tween is handled
			# at PHASE_OUT entry. Nothing tick-driven here beyond the timer.
			if _wraith_timer <= 0.0:
				_perform_wraith_teleport()
		WraithState.PHASE_IN:
			velocity = Vector2.ZERO
			_wraith_timer -= delta
			if _wraith_timer <= 0.0:
				_apply_wraith_strike()
				_enter_wraith_strike_recovery()
		WraithState.STRIKE_RECOVERY:
			sprite.flip_h = to_hero.x < 0
			velocity = Vector2.ZERO
			sprite.play(&"idle")
			_wraith_timer -= delta
			if _wraith_timer <= 0.0:
				_wraith_state = WraithState.CHASE
				_wraith_cooldown_timer = WRAITH_PHASE_INTERVAL

# Enter PHASE_OUT: stash collision profile, suppress collisions, start
# the alpha tween, spawn the vanish-mote burst. The teleport itself
# happens at the END of the timer in _perform_wraith_teleport.
func _enter_wraith_phase_out() -> void:
	_wraith_state = WraithState.PHASE_OUT
	_wraith_timer = WRAITH_PHASE_OUT_TIME
	# Stash + clear collision so sword swings whiff and projectiles pass
	# through. The body still exists; it just isn't on any layer.
	if WRAITH_INVULN_DURING_PHASE:
		_wraith_saved_layer = collision_layer
		_wraith_saved_mask = collision_mask
		collision_layer = 0
		collision_mask = 0
	# Alpha tween — full opacity to ghostly. Tween locks to PHASE_OUT_TIME
	# so it lands the moment the teleport fires.
	# Iter 70 — tween TARGET preserves the type's baseline RGB tint (e.g.
	# rogue_wraith's violet) and only drops alpha to WRAITH_PHASE_ALPHA.
	# Was hardcoded Color(1,1,1,a) which would have snapped a violet
	# wraith to neutral white mid-phase.
	if sprite != null:
		var base_phase: Color = _baseline_modulate()
		var phase_color: Color = Color(base_phase.r, base_phase.g, base_phase.b, WRAITH_PHASE_ALPHA)
		var tw: Tween = create_tween()
		tw.tween_property(
			sprite,
			"modulate",
			phase_color,
			WRAITH_PHASE_OUT_TIME,
		).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	# Vanish-mote burst at the disappearance point — small purple/black
	# Polygon2D specks scattered around the wraith.
	_spawn_wraith_vanish_motes(global_position)

# Compute the BEHIND-HERO target and teleport. "Behind" is determined by
# hero motion direction when moving, falling back to the hero→wraith
# vector inverted when idle (i.e. teleport to opposite side of where the
# wraith currently is — preserves flank fantasy even when the hero
# stands still).
func _perform_wraith_teleport() -> void:
	if _hero == null or not is_instance_valid(_hero):
		_enter_wraith_strike_recovery()
		return
	var hero_pos: Vector2 = _hero.global_position
	var hero_forward: Vector2 = Vector2.ZERO
	# Prefer hero velocity (last-frame motion) — if the hero is running,
	# "behind" is opposite their movement. CharacterBody2D.velocity is
	# public so we can read it without poking into private fields. The
	# `in` check defends against a future hero-class refactor that might
	# move velocity off the CharacterBody2D path.
	if "velocity" in _hero:
		var hv: Vector2 = _hero.velocity
		if hv.length_squared() > 1.0:
			hero_forward = hv.normalized()
	# Fallback: if the hero is stationary, use the wraith→hero vector as
	# "forward" (so the wraith reappears on the OPPOSITE side of the hero
	# from where it started — still a flank, just along the LOS axis).
	if hero_forward == Vector2.ZERO:
		var from_wraith: Vector2 = hero_pos - global_position
		if from_wraith.length_squared() > 1.0:
			hero_forward = from_wraith.normalized()
		else:
			# Truly degenerate (wraith on top of hero) — just pick right.
			hero_forward = Vector2.RIGHT
	# Teleport BEHIND hero = hero_pos minus hero_forward × offset.
	global_position = hero_pos - hero_forward * WRAITH_REAPPEAR_OFFSET
	# Face the hero on reappearance so the strike telegraph reads natural.
	sprite.flip_h = (hero_pos.x - global_position.x) < 0
	_enter_wraith_phase_in()

# Enter PHASE_IN: start the reappear alpha tween, spawn the shimmer FX.
# Collision STAYS off through this window — the wraith is still phasing.
func _enter_wraith_phase_in() -> void:
	_wraith_state = WraithState.PHASE_IN
	_wraith_timer = WRAITH_PHASE_IN_TIME
	if sprite != null:
		var tw: Tween = create_tween()
		tw.tween_property(
			sprite,
			"modulate",
			Color(1, 1, 1, 1),
			WRAITH_PHASE_IN_TIME,
		).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	# Spawn the shimmer-in FX at the new position. This is the visual
	# read for the player: "wraith appears HERE — dodge NOW."
	_spawn_wraith_phase_in_fx(global_position)

# Apply the flanking strike. Damage lands only if the hero is within
# WRAITH_STRIKE_REACH at the moment of expiry, so a panicked hero who
# rolled away during PHASE_IN escapes the swing.
func _apply_wraith_strike() -> void:
	if _hero == null or not is_instance_valid(_hero):
		return
	var d: float = _hero.global_position.distance_to(global_position)
	if d <= WRAITH_STRIKE_REACH and _hero.has_method("take_damage"):
		# iter-70 polish: knockback away from where the wraith reappeared
		# (its post-teleport global_position). Sells the "I got flanked"
		# moment visually — hero gets shoved forward, AWAY from the wraith
		# behind them.
		_hero.take_damage(WRAITH_STRIKE_DAMAGE, global_position, _affix_aware_source_name())
		# iter-103: wraith strike applies the affix on-hit.
		_apply_contact_affix()
		# Brief attack pose so the swing reads even if the player wasn't
		# looking at the wraith mid-teleport.
		if sprite != null and sprite.sprite_frames != null \
				and sprite.sprite_frames.has_animation(&"attack"):
			sprite.play(&"attack")

# Enter STRIKE_RECOVERY: restore collision profile, settle to full alpha,
# arm the next phase via WRAITH_PHASE_INTERVAL when the timer expires.
func _enter_wraith_strike_recovery() -> void:
	_wraith_state = WraithState.STRIKE_RECOVERY
	_wraith_timer = WRAITH_STRIKE_RECOVERY_TIME
	# Restore collision so the player can punish the recovery window.
	if WRAITH_INVULN_DURING_PHASE:
		collision_layer = _wraith_saved_layer if _wraith_saved_layer != 0 else 4
		collision_mask = _wraith_saved_mask if _wraith_saved_mask != 0 else 1
	if sprite != null:
		# Iter 70 — restore to the type's baseline modulate (was hardcoded
		# white), so e.g. rogue_wraith's violet tint persists after phase.
		sprite.modulate = _baseline_modulate()

# Vanish-mote burst — 5 small purple/black Polygon2D specks scattered
# around the disappearance point, drifting outward and fading. Same
# self-tween+queue_free pattern the summoner uses.
func _spawn_wraith_vanish_motes(pos: Vector2) -> void:
	var parent: Node = get_parent()
	if parent == null:
		return
	var mote_count: int = 5
	for i in range(mote_count):
		var ang: float = (TAU / float(mote_count)) * float(i) + randf_range(-0.3, 0.3)
		var mote: Node2D = Node2D.new()
		mote.global_position = pos + Vector2(cos(ang), sin(ang)) * 4.0
		mote.z_index = -1
		parent.add_child(mote)
		var poly: Polygon2D = Polygon2D.new()
		var verts: PackedVector2Array = PackedVector2Array()
		var r: float = 3.0
		var segments: int = 8
		for j in range(segments):
			var a: float = (TAU / float(segments)) * float(j)
			verts.append(Vector2(cos(a), sin(a)) * r)
		poly.polygon = verts
		# Deep purple-black — distinct from the summoner's dark red and
		# the healer's green. Wraith owns the "shadow / phase" color.
		poly.color = Color(0.30, 0.18, 0.45, 0.90)
		mote.add_child(poly)
		var drift: Vector2 = Vector2(cos(ang), sin(ang)) * 22.0
		var tw: Tween = mote.create_tween()
		tw.set_parallel(true)
		tw.tween_property(mote, "global_position", mote.global_position + drift, 0.28) \
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		tw.tween_property(poly, "modulate:a", 0.0, 0.28) \
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		tw.chain().tween_callback(mote.queue_free)

# Instantiate the wraith_phase_in shimmer scene at the reappear point.
# Falls back to a code-built burst if the scene resource isn't available
# (defensive — keeps the gameplay loop working even if the .tscn is
# missing on a partial sync).
func _spawn_wraith_phase_in_fx(pos: Vector2) -> void:
	var parent: Node = get_parent()
	if parent == null:
		return
	if WRAITH_PHASE_FX_SCENE == null:
		_spawn_wraith_vanish_motes(pos)
		return
	var fx: Node2D = WRAITH_PHASE_FX_SCENE.instantiate()
	fx.global_position = pos
	parent.add_child(fx)

# Iter 68 — test-only force-trigger for headless verification. Skips the
# CHASE → PHASE_OUT cooldown gating so a test can assert "phase strikes
# the hero" without simulating 4.5+ seconds of physics ticks.
func _force_wraith_phase_for_test() -> void:
	_enter_wraith_phase_out()

# ── Behavior: telegraphed_melee ───────────────────────────────────────
# Approach → stop + windup-tint → swing in cone → cooldown. Damage
# resolves on swing-start so a dodging hero escapes the cone.
# Used by skel, armored_skeleton, lancer, etc.
func _tick_telegraphed_melee(delta: float) -> void:
	var t: EnemyType = enemy_type
	if _hero == null or not is_instance_valid(_hero):
		velocity = Vector2.ZERO
		sprite.play(&"idle")
		return
	var to_hero: Vector2 = _hero.global_position - global_position
	var dist: float = to_hero.length()
	sprite.flip_h = to_hero.x < 0
	match _melee_state:
		MeleeState.IDLE:
			if dist > t.melee_reach * 0.85:
				if t.can_move():
					# Iter 169 — stuck-dodge fallback for long-pinned cases.
					# Iter 172 — wall-slide post-move handles "grinding
					# against this wall right now."
					# Iter 173 — separation force so multiple melee enemies
					# spread instead of stacking.
					var to_dir: Vector2 = to_hero.normalized()
					var speed: float = _effective_move_speed()
					var sep: Vector2 = _compute_separation_vector()
					var intended: Vector2 = (to_dir + sep * SEPARATION_FORCE).normalized() * speed
					velocity = _maybe_stuck_dodge(delta, intended)
					sprite.play(&"walk")
					move_and_slide()
					_apply_wall_slide(intended)
				else:
					velocity = Vector2.ZERO
					sprite.play(&"idle")
			else:
				velocity = Vector2.ZERO
				sprite.play(&"idle")
				_melee_state = MeleeState.WINDUP
				_melee_timer = t.melee_windup
				_melee_aim = to_hero.normalized()
		MeleeState.WINDUP:
			velocity = Vector2.ZERO
			sprite.play(&"idle")
			# Red telegraph tint pulses over the windup so the player can
			# read "about to swing" at a glance, distinct from the
			# shoot-windup cyan.
			# Iter 70 — channel the red pulse THROUGH the baseline tint so
			# tinted enemies keep their identity color underneath the
			# windup signal (multiplicative: baseline.r * 1, baseline.g/b
			# fade darker per wt).
			# iter-139 — strengthened the windup telegraph for Hades-tier
			# clarity. Two changes:
			#   (1) green/blue fade depth 0.6 → 0.75 so the red signal is
			#       louder at peak windup (player sees red enemy unmistakably)
			#   (2) ADD a monotonic scale pulse (1.0 → 1.08) so the enemy
			#       visibly "tenses up" before the strike. Same grammar
			#       the bomber prime already uses (line ~683). Color cue
			#       + motion cue together = readable at a glance during
			#       chaotic multi-enemy combat.
			# iter-243 / Director Phase 1 — ground swing-arc telegraph.
			# Paint a warm amber cone in the facing direction during
			# windup so the player can SEE the danger zone before the
			# strike lands. Reads as "this 70-px wedge in front of the
			# orc is about to be unsafe" — Hades / Dead Cells / Hyper
			# Light all use this readable-windup grammar. Drawn at
			# z_index -1 so it sits under the enemy sprite (looks like
			# ground decal, not floating UI). Alpha eases from 0 → 0.65
			# over the windup so the cue grows louder as the strike
			# nears, mirroring the existing tint+scale pulse.
			var wt: float = 1.0 - (_melee_timer / t.melee_windup)
			var base: Color = _baseline_modulate()
			sprite.modulate = Color(base.r, base.g * (1.0 - wt * 0.75), base.b * (1.0 - wt * 0.75), base.a)
			var sc: float = t.sprite_scale * (1.0 + 0.08 * wt)
			sprite.scale = Vector2(sc, sc)
			_update_telegraph_arc(wt, t.melee_reach, t.melee_cone)
			_melee_timer -= delta
			if _melee_timer <= 0.0:
				_melee_state = MeleeState.SWING
				_melee_timer = t.melee_swing
				sprite.play(&"attack")
				# Hide the windup arc on swing-fire — danger zone is now
				# the actual attack, the telegraph's job is done.
				_hide_telegraph_arc()
				# Damage check at swing-start — final position lets dodge
				# escape if the hero leaves the cone in time.
				var final_to_hero: Vector2 = _hero.global_position - global_position
				if final_to_hero.length() <= t.melee_reach \
				   and abs(final_to_hero.angle_to(_melee_aim)) < t.melee_cone \
				   and _hero.has_method("take_damage"):
					# iter-70 polish: knockback away from the attacker.
					_hero.take_damage(t.melee_damage, global_position, _affix_aware_source_name())
					# iter-103: telegraphed-melee swing applies the affix.
					_apply_contact_affix()
		MeleeState.SWING:
			velocity = Vector2.ZERO
			_melee_timer -= delta
			if _melee_timer <= 0.0:
				_melee_state = MeleeState.COOLDOWN
				_melee_timer = t.melee_cooldown - t.melee_swing
				sprite.modulate = _baseline_modulate()
				# iter-139 — restore base scale at swing-end so cooldown
				# state doesn't keep the tensed-up silhouette.
				sprite.scale = Vector2(t.sprite_scale, t.sprite_scale)
				# iter-243 — defensive: arc may still be visible if SWING
				# entered via an edge case path (zero windup time, etc.).
				_hide_telegraph_arc()
		MeleeState.COOLDOWN:
			if t.can_move() and dist > t.melee_reach * 0.85:
				velocity = to_hero.normalized() * _effective_move_speed()
				sprite.play(&"walk")
				move_and_slide()
			else:
				velocity = Vector2.ZERO
				sprite.play(&"idle")
			_melee_timer -= delta
			if _melee_timer <= 0.0:
				_melee_state = MeleeState.IDLE

# iter-243 / Director Phase 1 — telegraphed-melee ground arc telegraph.
# Lazy-created Polygon2D child shaped as a warm amber cone in the
# direction the enemy is about to swing. The arc is shown during
# WINDUP only and hidden on swing-fire (when the danger is now the
# actual attack VFX). Reads as "ground decal" because z_index = -1
# puts it UNDER the enemy sprite — same trick the dash trail / fire
# pool use for ground-anchored feedback.
#
# Arc geometry: 12-segment 90° cone fan (sufficient resolution to look
# smooth at melee_reach ≈ 50-70 px). Half-cone matches the actual
# damage cone (t.melee_cone radians half-width) so what the player
# SEES is what the player can be hit by. Color: warm amber
# Color(1.0, 0.78, 0.30, 0.65) — the windup red sprite tint already
# lives in the upper hemisphere of the screen, the amber-on-floor cue
# is the second readable channel (color + position) that lets a
# player react to multiple windups at once.
const TELEGRAPH_ARC_SEGMENTS: int = 12
const TELEGRAPH_ARC_COLOR: Color = Color(1.0, 0.78, 0.30, 0.65)
var _telegraph_arc: Polygon2D = null

func _ensure_telegraph_arc() -> Polygon2D:
	if _telegraph_arc != null and is_instance_valid(_telegraph_arc):
		return _telegraph_arc
	_telegraph_arc = Polygon2D.new()
	_telegraph_arc.z_index = -1
	_telegraph_arc.color = TELEGRAPH_ARC_COLOR
	_telegraph_arc.modulate.a = 0.0
	add_child(_telegraph_arc)
	return _telegraph_arc

func _update_telegraph_arc(wt: float, reach: float, half_cone: float) -> void:
	# wt is windup progress 0..1; arc fades in from 0.0 to its full
	# alpha (carried in TELEGRAPH_ARC_COLOR.a) over the windup.
	var arc: Polygon2D = _ensure_telegraph_arc()
	# Build the cone polygon in LOCAL space (rotated by aim angle below).
	# Vertex 0 is the origin; the remaining N+1 vertices fan across the
	# cone arc. The shape is a pie slice.
	var pts: PackedVector2Array = PackedVector2Array()
	pts.append(Vector2.ZERO)
	for i in range(TELEGRAPH_ARC_SEGMENTS + 1):
		var f: float = float(i) / float(TELEGRAPH_ARC_SEGMENTS)
		var ang: float = -half_cone + f * (2.0 * half_cone)
		pts.append(Vector2(cos(ang), sin(ang)) * reach)
	arc.polygon = pts
	# Rotate to face the locked-in melee aim direction.
	arc.rotation = _melee_aim.angle()
	# Fade alpha in with the windup so the cue grows louder as the
	# strike nears — ease-in 0 → ~0.65.
	var ease: float = clampf(wt / 0.10, 0.0, 1.0) if wt < 0.10 else 1.0
	arc.modulate.a = ease
	arc.visible = true

func _hide_telegraph_arc() -> void:
	if _telegraph_arc == null or not is_instance_valid(_telegraph_arc):
		return
	_telegraph_arc.visible = false
	_telegraph_arc.modulate.a = 0.0

# ── Behavior: shoot ───────────────────────────────────────────────────
# Kite + cast. Backs away if hero is closer than min_dist, approaches if
# farther than prefer_dist, and casts when in cast_range with cooldown
# clear. Used by wiz, archer, priest, dreadmage, skel_archer.
func _tick_shoot(delta: float) -> void:
	var t: EnemyType = enemy_type
	if _hero == null or not is_instance_valid(_hero):
		velocity = Vector2.ZERO
		sprite.play(&"idle")
		return
	var to_hero: Vector2 = _hero.global_position - global_position
	var dist: float = to_hero.length()
	sprite.flip_h = to_hero.x < 0
	match _cast_state:
		CastState.IDLE:
			if t.can_move() and dist < t.min_dist:
				velocity = -to_hero.normalized() * _effective_move_speed()
				sprite.play(&"walk")
				move_and_slide()
			elif t.can_move() and dist > t.prefer_dist:
				velocity = to_hero.normalized() * _effective_move_speed()
				sprite.play(&"walk")
				move_and_slide()
			else:
				velocity = Vector2.ZERO
				sprite.play(&"idle")
			if dist <= t.cast_range and _cast_timer <= 0.0:
				_cast_state = CastState.WINDUP
				_cast_timer = t.cast_windup
				_cast_aim = to_hero.normalized()
				sprite.play(&"attack")
			else:
				_cast_timer = max(0.0, _cast_timer - delta)
		CastState.WINDUP:
			velocity = Vector2.ZERO
			sprite.play(&"attack")
			# Cyan telegraph — distinct from the melee red. Player learns
			# "blue glow = ranged, red glow = melee."
			# Iter 70 — channel through the baseline so tinted ranged
			# enemies (none right now, but future-proof) keep identity.
			var wt: float = 1.0 - (_cast_timer / t.cast_windup)
			var base: Color = _baseline_modulate()
			sprite.modulate = Color(base.r * (1.0 - wt * 0.5), base.g, base.b, base.a)
			_cast_timer -= delta
			if _cast_timer <= 0.0:
				_fire_projectile()
				# Return straight to IDLE with the cooldown timer set;
				# IDLE's else-branch drains it before next cast is armed.
				_cast_state = CastState.IDLE
				_cast_timer = t.cast_cooldown
				sprite.modulate = _baseline_modulate()

# ── Behavior: stationary_shoot ────────────────────────────────────────
# Identical to shoot but skips all movement attempts. Implemented as
# shoot-with-can_move-false so we don't duplicate the state machine.
# The shoot tick already guards movement with t.can_move() so we just
# forward.
func _tick_stationary_shoot(delta: float) -> void:
	_tick_shoot(delta)

# Re-aim at hero at the moment of cast — running during windup is a
# reasonable dodge, but instant teleport between aim and release would
# be too cheesy. Matches the wizard's old fire_orb convention.
func _fire_projectile() -> void:
	var t: EnemyType = enemy_type
	if _hero != null and is_instance_valid(_hero):
		_cast_aim = (_hero.global_position - global_position).normalized()
	# Iter 200 — per-caster signature pattern. Pre-iter-200 every ranged
	# enemy fired identical single shots; agent audit flagged the 4
	# ranged casters as reskin-grade variety. Dispatch on the new
	# EnemyType.projectile_pattern field.
	match t.projectile_pattern:
		"spread":
			# WIZARD — 3-way fan. Center shot + ±0.20 rad off-shots.
			# Reads as "the wizard chants a triple-cone spell."
			_fire_one_projectile(t, _cast_aim, 1.0, 1.0, 0)
			_fire_one_projectile(t, _cast_aim.rotated( 0.22), 1.0, 1.0, 0)
			_fire_one_projectile(t, _cast_aim.rotated(-0.22), 1.0, 1.0, 0)
		"pierce":
			# ARCHER — single shot with pierce_count = 1. The arrow
			# passes through the hero once and continues. Reads as
			# "the archer's bow has bonecutter penetration."
			_fire_one_projectile(t, _cast_aim, 1.15, 1.0, 1)
		"heavy":
			# DREADMAGE — slow but big. 0.6× velocity, 1.4× visual
			# scale. The slower flight gives the player time to dodge,
			# but the projectile reads as a heavier threat. Pairs with
			# dreadmage's 1.0s cast windup — the player has time to
			# react to both windup AND flight.
			_fire_one_projectile(t, _cast_aim, 0.6, 1.4, 0)
		_:
			# Default — preserve legacy single-shot for un-tagged casters.
			_fire_one_projectile(t, _cast_aim, 1.0, 1.0, 0)

# Iter 200 — single projectile spawn helper. Extracts the spawn logic
# from _fire_projectile so the new pattern dispatcher can reuse it.
# Params:
#   aim_dir          — normalized direction vector for this shot
#   speed_scale      — Projectile.SPEED multiplier (0.6 for heavy, etc)
#   visual_scale     — orb / sprite scale (1.4 for heavy reads bigger)
#   pierce           — pierce_count value (1 for archer, 0 for others)
func _fire_one_projectile(t: EnemyType, aim_dir: Vector2, speed_scale: float, visual_scale: float, pierce: int) -> void:
	var p: Projectile = PROJECTILE_SCENE.instantiate()
	p.target_group = "hero"
	p.orb_tint = t.projectile_tint
	p.global_position = global_position + Vector2(0, -28) + aim_dir * 22.0
	p.velocity = aim_dir * Projectile.SPEED * speed_scale
	p.damage = t.projectile_damage
	p.pierce_count = pierce
	# Defer the visual_scale apply to _ready of the projectile via the
	# orb sprite path — projectile spawns its sprite in _ready.
	if visual_scale != 1.0:
		p.scale = Vector2(visual_scale, visual_scale)
	get_parent().add_child(p)

# ── Universal: take_hit + knockback + death ───────────────────────────

func take_hit(damage: int, is_crit: bool = false, source_pos: Variant = null) -> void:
	# Iter 15: ignore hits during the spawn-in fade so the player can't
	# pre-kill an enemy that's still materializing. Mirrors the AI lock —
	# the enemy isn't "present" yet.
	if _dying or _spawn_in_time > 0.0:
		return
	# Iter 230 / Expansion Team R2 — record the optional damage source
	# position so `_apply_shield_damage_filter` (called below) can
	# decide FRONT vs FLANK on shield_walker enemies. Cleared at the
	# end of this function so subsequent hits don't reuse a stale value.
	# Defensive: accept Vector2 OR null/anything-else; only the Vector2
	# branch sets the "valid" flag.
	if source_pos is Vector2:
		_last_damage_source_pos = source_pos
		_last_damage_source_valid = true
	else:
		_last_damage_source_valid = false
	# iter-103: WARDED elite affix clamps incoming damage by -1, min 1.
	# Floor of 1 so a player with all 1-damage attacks isn't fully shut
	# out (would invalidate the entire common-tier slash). Clamp BEFORE
	# the hp subtract so the damage number floater shows the clamped
	# value the player actually dealt.
	# iter-104: also spawn a "WARDED" floater above the enemy on the
	# FIRST hit where the clamp actually applies (damage > 1). Avoids
	# spamming the floater on 1-damage hits where the clamp is a no-op.
	if elite_affix == "warded":
		var original_damage: int = damage
		damage = maxi(1, damage - ELITE_WARDED_DR)
		if original_damage > 1:
			_spawn_affix_floater("WARDED", ELITE_AFFIX_TINTS["warded"], global_position)
	# Iter 230 — shield_walker directional reduction. No-op for any
	# other behavior tag (returns damage unchanged). For Bulwark:
	#   FRONT hit + intact → 75% reduction
	#   FRONT hit + broken → full damage (already paying for being open)
	#   FLANK / REAR + intact → full damage AND shield breaks 1.5 s
	# See `_apply_shield_damage_filter` for the math.
	damage = _apply_shield_damage_filter(damage)
	hp -= damage
	# Iter 215 — PETRIFY combo (Phase 4). Crit hits on a slowed enemy
	# briefly stun them. Fires BEFORE the death-check below so an
	# enemy that survives the crit is petrified; an enemy that dies
	# from the crit just dies (no need to petrify the dying frame).
	# Per-enemy cooldown prevents back-to-back crits from chain-stunning.
	if is_crit and _slow_remaining > 0.0 and _petrify_cd <= 0.0 and hp > 0:
		_trigger_petrify()
	# iter-110: arm the hurt-anim hold IF the enemy ships a hurt_sheet.
	# Behavior ticks check _hurt_anim_time > 0 + frames_hurt > 0 and
	# play the "hurt" animation for the hold window before resuming
	# walk/idle/attack. Enemies without a hurt sheet fall through to
	# the existing white-tint flash only.
	if enemy_type != null and enemy_type.frames_hurt > 0 and sprite != null \
			and sprite.sprite_frames != null and sprite.sprite_frames.has_animation(&"hurt"):
		_hurt_anim_time = HURT_ANIM_DURATION
		sprite.play(&"hurt")
	# Iter 43 — per-hit damage number. Crit hits use spawn_crit (yellow,
	# bigger, "!" suffix, longer life); normal hits use the standard
	# white number.
	# iter-243 / Director Phase 1 — spawn at the IMPACT POINT, not the
	# enemy head. Pre-iter-243 num_pos = global_position + (0, -28),
	# which on a 50-px-tall enemy floated the number well ABOVE the
	# silhouette — reads as "near the enemy" not "ON the enemy". New
	# rule: spawn at the top of the collision disc (global_position
	# minus collision_radius). On a slime (r=14) the number lands at
	# 14 px above feet — right on the silhouette top. On Tuskbrod or a
	# boss (r=28-40) it lands at the chest. Pair with damage_number.gd's
	# RISE=24 (was 40) so the number stays anchored to the hit, not
	# drifting halfway to the HUD.
	var impact_offset: float = enemy_type.collision_radius if enemy_type != null else 16.0
	var num_pos: Vector2 = global_position - Vector2(0, impact_offset)
	var dn: DamageNumber
	if is_crit:
		dn = DamageNumber.spawn_crit(num_pos, damage)
	else:
		dn = DamageNumber.spawn(num_pos, str(damage), Color(1, 0.95, 0.9))
	var parent: Node = get_parent()
	if parent != null:
		parent.add_child(dn)
	if sprite != null:
		# Iter 43 — crit flash is warmer (gold) so the player sees both
		# the damage number AND the sprite reaction confirm the crit.
		# Iter 145 — STACKED scale punch in parallel with the modulate
		# flash. Pre-iter-145 only the modulate flashed white — the
		# sprite stayed the same size, so a 1-damage nick on a boss
		# looked visually identical to a 50-damage crit on the same
		# boss (both got the same white flash + same size). Adding a
		# brief scale punch (1.15× normal, 1.32× crit) makes the enemy
		# visibly RECOIL from the hit, then settle back. Genre cue:
		# Hades enemies all do a squash-and-stretch reaction frame on
		# hit — for sprites without a hurt sheet (most of our trash
		# mobs), this tween adds the missing "OOF" beat. Stacks with
		# the iter-110 hurt-anim hold if the enemy has one — the scale
		# punch lands BEFORE the hurt anim plays out so they don't
		# fight; the punch is the impact, hurt is the recovery.
		var flash_color: Color = Color(3, 2.4, 1.5, 1) if is_crit else Color(2, 2, 2, 1)
		var base_scale: Vector2 = Vector2.ONE
		if enemy_type != null:
			base_scale = Vector2(enemy_type.sprite_scale, enemy_type.sprite_scale)
		var punch_factor: float = HIT_SCALE_PUNCH_CRIT if is_crit else HIT_SCALE_PUNCH
		var tween: Tween = create_tween().set_parallel(true)
		tween.tween_property(sprite, "modulate", flash_color, 0.04)
		tween.tween_property(sprite, "scale", base_scale * punch_factor, 0.04)
		tween.chain().set_parallel(true)
		tween.tween_property(sprite, "modulate", Color(1, 1, 1, 1), 0.10)
		tween.tween_property(sprite, "scale", base_scale, 0.10)
		# Iter 181 — shader-driven hit flash. The modulate tween above
		# MULTIPLIES the sprite color (so dark pixels stay dark, bright
		# pixels saturate); the shader flash REPLACES the interior with
		# pure white. This is the Hades / Isaac canonical "the silhouette
		# pops bone-white on impact" effect that the modulate alone can't
		# achieve. Lives in parallel to the modulate tween — both peak at
		# frame 2 and decay over ~120 ms.
		if sprite.material is ShaderMaterial:
			var mat: ShaderMaterial = sprite.material as ShaderMaterial
			mat.set_shader_parameter("flash_strength", 1.0)
			var flash_tween: Tween = create_tween()
			flash_tween.tween_property(mat, "shader_parameter/flash_strength", 0.0, 0.12)\
				.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	Events.enemy_hit.emit(global_position)
	# iter-243 / Director Phase 1 — size-class hit audio. The signal
	# above plays the baseline enemy_hit thud (and fx's hit_spark);
	# we layer a size-variant on top so a 0.55-scale slime gets a
	# bright tin "tic" and a 1.4-scale Tuskbrod gets a chest thump.
	# Layering rather than replacing means existing emitters (chest,
	# prototype room) keep their baseline behavior — the variant
	# kicks in only when enemy_type carries a sprite_scale field.
	# Plays at -5 dB so it tints the thud rather than out-shouting it.
	# Robust to enemy_type == null (fall back to medium variant).
	var s_scale: float = 1.0
	if enemy_type != null:
		s_scale = enemy_type.sprite_scale
	var hit_variant: String = "enemy_hit_medium"
	if s_scale < 0.7:
		hit_variant = "enemy_hit_small"
	elif s_scale > 1.2:
		hit_variant = "enemy_hit_large"
	var audio_node: Node = Engine.get_main_loop().root.get_node_or_null("/root/Audio") if Engine.get_main_loop() != null else null
	if audio_node != null and audio_node.has_method("_play"):
		audio_node.call("_play", hit_variant, global_position, -5.0)
	# iter-81 (Workstream A): tiered hit feedback. damage / max_hp ratio
	# picks a tier (nick/solid/heavy/crushing) and fires shake + extra
	# sparks scaled to it. Replaces the previous uniform FX.shake(4,
	# 0.06) which fired the SAME shake on a 1-dmg nick of a boss as on
	# a 200-dmg crushing crit. fx.gd's _on_enemy_hit still spawns the
	# baseline hit_spark; this adds tier-specific extras on top + the
	# tier-scaled shake.
	AttackFeel.apply_hit_feedback_tier(self, damage, {"is_crit": is_crit})
	# Iter 53 — audio sparkle for crit hits. Layered on top of the
	# enemy_hit "thud" so the crit feedback hits both visually (yellow
	# damage number) and audibly (rising sparkle chime).
	if is_crit:
		Events.enemy_crit_hit.emit(global_position)
	# Iter 37 — phase transition check. Only triggers when:
	#   - we're still in phase N
	#   - enemy_type declares phaseN_overrides (non-empty)
	#   - phaseN_hp_threshold > 0 (kill-switch respect)
	#   - current hp is at or below threshold
	#   - hit didn't drop hp to 0 (avoid firing during death frame)
	# Done BEFORE the death check so an enemy can't "skip" a phase by
	# being burst from 100% to 0%. Iter 55 — extended to phase 3.
	# Phase 3 can fire on the SAME hit as phase 2 (e.g. a massive crit
	# drops hp from 100% to 20%) — checked after phase 2 transition so
	# the ratio sees the post-mutation max_hp (though max_hp is rarely
	# changed by phase overrides, the order is defensive).
	if hp > 0 and _phase == 1 and enemy_type != null:
		var thr2: float = enemy_type.phase2_hp_threshold
		if thr2 > 0.0 and not enemy_type.phase2_overrides.is_empty():
			var ratio: float = float(hp) / float(maxi(1, enemy_type.max_hp))
			if ratio <= thr2:
				_trigger_phase_2()
	if hp > 0 and _phase == 2 and enemy_type != null:
		var thr3: float = enemy_type.phase3_hp_threshold
		if thr3 > 0.0 and not enemy_type.phase3_overrides.is_empty():
			var ratio: float = float(hp) / float(maxi(1, enemy_type.max_hp))
			if ratio <= thr3:
				_trigger_phase_3()
	if hp <= 0:
		_die()

# Iter 37 — boss phase 2 transition. Duplicates the enemy_type so we
# can mutate it without polluting the shared resource, applies the
# phase2_overrides on the copy, fires a brief red enrage tint on the
# sprite, and emits phase_changed(2) so main.gd can show its banner.
# Idempotent — guarded by _phase == 1 in take_hit so it only fires
# once per enemy lifetime.
func _trigger_phase_2() -> void:
	_phase = 2
	# Copy the EnemyType so our mutations don't leak to other enemies
	# (or persist after this run since resources are cached). After
	# this point, enemy_type points at the local duplicate.
	var local: EnemyType = enemy_type.duplicate() as EnemyType
	var overrides: Dictionary = local.phase2_overrides
	for key in overrides:
		if key in local:
			local.set(key, overrides[key])
	enemy_type = local
	# Visual feedback — brief red enrage flash on the sprite. Distinct
	# from the white hit-flash (modulate(2,2,2)) so the player reads
	# "the boss just got worse" rather than "the boss just got hit."
	if sprite != null:
		var t: Tween = create_tween()
		t.tween_property(sprite, "modulate", Color(2.5, 0.8, 0.6, 1), 0.10)
		t.tween_property(sprite, "modulate", Color(1, 1, 1, 1), 0.40)
	# Iter 53 — audio sting for the phase transition. Same beat as the
	# "ENRAGED" banner + camera shake from main.gd. Gated to is_boss
	# enemies via the enemy_type flag so non-boss enemies with
	# phase2_overrides (future elites) don't trigger the boss-specific
	# sting — they get a smaller in-built audio cue if needed later.
	if enemy_type != null and enemy_type.is_boss:
		Events.boss_enraged.emit(global_position)
	# Iter 55 — phase-2 summon. If the EnemyType configured adds for
	# this phase, fire N enemy_summon_requested events; main.gd
	# subscribes and instantiates them via its existing _spawn_enemy_type
	# pathway. Decouples the spawn from this script (which doesn't
	# know about ENEMY_TYPES preload).
	_request_phase_summons(enemy_type.phase2_summon_type, enemy_type.phase2_summon_count)
	phase_changed.emit(2)

# Iter 55 — boss phase 3. Same architecture as phase 2: duplicates the
# enemy_type, applies phase3_overrides on the local copy, fires red
# tint flash, emits boss_phase_3 + phase_changed(3), fires summons if
# configured. Idempotent via _phase >= 3 guard in take_hit.
func _trigger_phase_3() -> void:
	_phase = 3
	var local: EnemyType = enemy_type.duplicate() as EnemyType
	var overrides: Dictionary = local.phase3_overrides
	for key in overrides:
		if key in local:
			local.set(key, overrides[key])
	enemy_type = local
	# Visual: brighter / hotter red than phase 2 — desperation state.
	if sprite != null:
		var t: Tween = create_tween()
		t.tween_property(sprite, "modulate", Color(3.2, 0.5, 0.3, 1), 0.10)
		t.tween_property(sprite, "modulate", Color(1, 1, 1, 1), 0.50)
	if enemy_type.is_boss:
		Events.boss_phase_3.emit(global_position)
	_request_phase_summons(enemy_type.phase3_summon_type, enemy_type.phase3_summon_count)
	phase_changed.emit(3)

# Iter 55 — emit N summon requests for the specified type. main.gd
# listens to Events.enemy_summon_requested and instantiates. Spawn
# positions are picked here as offsets from the boss so they appear
# in a ring around her — telegraphs "she called for help" visually.
func _request_phase_summons(type_id: String, count: int) -> void:
	if type_id == "" or count <= 0:
		return
	for i in range(count):
		var ang: float = (TAU / float(count)) * float(i) + randf_range(-0.4, 0.4)
		var dist: float = randf_range(80.0, 112.0)
		var spawn_pos: Vector2 = global_position + Vector2(cos(ang) * dist, sin(ang) * dist)
		Events.enemy_summon_requested.emit(spawn_pos, type_id)

func apply_knockback(dir: Vector2, force: float, duration: float) -> void:
	if _dying or duration <= 0.0:
		return
	if dir.length_squared() < 0.0001:
		return
	_knockback_velocity = dir.normalized() * force
	_knockback_time = duration
	_knockback_total = duration
	# Iter 215 — SCATTER_FLAMES combo (Phase 4). Burning enemy taking a
	# knockback sheds embers at its current position before the push
	# moves it. Cooldown prevents back-to-back knocks from double-
	# firing on the same enemy.
	if _burn_remaining > 0.0 and _scatter_flames_cd <= 0.0:
		_trigger_scatter_flames()

func _die() -> void:
	_dying = true
	_death_timer = enemy_type.death_duration if enemy_type != null else 0.8
	velocity = Vector2.ZERO
	if sprite != null:
		# Iter 70 — restore baseline so a tinted enemy (e.g. spectral_priest
		# green, rogue_wraith violet) keeps its identity color through the
		# death anim. Was hardcoded white, which made a green priest snap
		# to a regular-priest white corpse — visually jarring.
		sprite.modulate = _baseline_modulate()
		if sprite.sprite_frames != null and sprite.sprite_frames.has_animation(&"death"):
			sprite.play(&"death")
	set_collision_layer_value(3, false)
	set_collision_mask_value(2, false)
	# iter-103: EMBER elite affix — death explosion. Spawns a small AoE
	# at the impact location, dealing damage to the hero if within
	# ELITE_EMBER_RADIUS. Reuses the hero's distance-check pattern;
	# does NOT damage other enemies (focused on hero threat). Routed
	# through the hero's take_damage so iframes / DR mods still apply.
	# iter-104: spawn a "BURST" floater at the corpse so the player
	# sees the AoE moment even if they were out of range — teaches
	# "don't stand on ember corpses" for the next encounter.
	if elite_affix == "ember":
		_spawn_affix_floater("BURST", ELITE_AFFIX_TINTS["ember"], global_position)
		if _hero != null and is_instance_valid(_hero):
			var d_hero: float = _hero.global_position.distance_to(global_position)
			if d_hero <= ELITE_EMBER_RADIUS and _hero.has_method("take_damage"):
				# iter-229: tag ember death AoE distinctly so the death
				# screen attributes the kill to the explosion specifically
				# rather than "(unknown)" — the ember enemy itself is dead
				# at this point, so the contact path can't fire.
				_hero.take_damage(ELITE_EMBER_DAMAGE, global_position, "Ember Burst")
	died_at.emit(global_position)
	Events.enemy_died.emit(global_position)
	# Iter 148 — boss-defeated savor beat. Fired AFTER the generic
	# enemy_died emit so subscribers that filter on is_boss don't have
	# to check enemy_type themselves. main.gd handler installs the
	# slow-mo + heavy shake; screen_flash.gd flashes gold.
	if enemy_type != null and enemy_type.is_boss:
		Events.boss_died.emit(global_position, enemy_type.display_name)
	# iter-141 — direct call into FX with size + heavy info. The
	# generic enemy_died signal can't carry these (it has 4 subscribers,
	# three of which are gameplay logic that don't care about
	# sprite_scale), so VFX gets its own explicit call. Heavy = boss or
	# any enemy with max_hp ≥ 8 (covers elites + chunkier mobs). The
	# burst's chunkiness scales with sprite_scale so a 1-HP slime pops
	# modest while a boss pops big — consistent grammar instead of a
	# 16-particle uniform blip on every death.
	var s_factor: float = 1.0
	var is_heavy_kill: bool = false
	if enemy_type != null:
		s_factor = enemy_type.sprite_scale
		is_heavy_kill = enemy_type.is_boss or enemy_type.max_hp >= 8
	FX.spawn_enemy_kill_burst(global_position, s_factor, is_heavy_kill)
	# Iter 212 — KINDLE_SPREAD combo. If this enemy was burning when it
	# died, the flames jump to nearby enemies. Fires AFTER the kill
	# burst FX so the corpse's burst reads as the "source" of the
	# spreading ring. apply_burn refresh rules (max of remaining vs new
	# duration) mean already-burning neighbors aren't re-amplified, so
	# chain damage stays bounded by the initial burn that killed THIS
	# enemy.
	if _burn_remaining > 0.0:
		_trigger_kindle_spread()
	# Iter 257 / Wave 6 — drop a persistent identity-matched decal on the
	# floor at the death spot. Slime → green splat, skeleton → bone shards,
	# ember → warm ash, casters → soot pile, spectral → ghost mist + pips,
	# everything else → blood pool. Parented to the scene root (not self)
	# so the decal SURVIVES this enemy's queue_free at death_duration end;
	# the decal handles its own lifetime + fade-out tween. Defensive guards
	# for headless / no-current-scene paths in tests.
	_spawn_corpse_decal()

# Iter 257 — pick the decal kind from this enemy's display_name (looked
# up in DEATH_DECAL_KIND_MAP). The mapping uses the normalized form of
# display_name (lowercased, spaces → underscores) so a .tres declaring
# "Bone Summoner" → "bone_summoner" matches the existing main.gd
# ENEMY_TYPES key convention. Returns "blood" for any unmapped enemy
# so death always leaves a visible mark.
func _death_decal_kind() -> String:
	if enemy_type == null:
		return "blood"
	var name_raw: String = str(enemy_type.display_name)
	if name_raw == "":
		return "blood"
	var key: String = name_raw.to_lower().replace(" ", "_")
	if DEATH_DECAL_KIND_MAP.has(key):
		return DEATH_DECAL_KIND_MAP[key]
	return "blood"

# Iter 257 — instantiate + parent the corpse decal at the enemy's
# global position. Parented to the SCENE ROOT (or get_parent fallback)
# so the decal outlives this enemy when it queue_frees at the end of
# its death animation. The decal handles its own lifetime + alpha
# fade-out tween — fire-and-forget.
func _spawn_corpse_decal() -> void:
	if CORPSE_DECAL_SCENE == null:
		return
	var decal_node: Node = CORPSE_DECAL_SCENE.instantiate()
	if decal_node == null:
		return
	# Set kind BEFORE add_child so _ready can read it for visual build.
	decal_node.set("kind", _death_decal_kind())
	# Parent to the scene root so the decal survives this enemy's
	# queue_free. Fall back to get_parent() (room node) if for some
	# reason current_scene is null — headless tests can hit that path.
	var host: Node = null
	var tree: SceneTree = get_tree()
	if tree != null:
		host = tree.current_scene
	if host == null:
		host = get_parent()
	if host == null:
		# Last-resort: drop the decal on the floor (free immediately —
		# something is very wrong with the scene tree).
		decal_node.queue_free()
		return
	host.add_child(decal_node)
	# Position AFTER add_child so global_position lands correctly.
	if decal_node is Node2D:
		(decal_node as Node2D).global_position = global_position

# ── Behavior: glyph_warden ────────────────────────────────────────────
# Iter 72 — conjurer / trap-layer. Kites the hero at WARDEN_KEEP_DIST
# (same shape as healer/summoner movement) and on a GLYPH_INTERVAL cycle
# plants a STATIONARY glyph hazard at the warden's OWN feet. The glyph
# arms 0.6s after placement (visible pulsing rune mark), then sits as
# floor damage for up to GLYPH_LIFETIME seconds — if the hero steps in
# the glyph's radius while armed, it detonates for GLYPH_DAMAGE + a
# brief slow, then despawns. Crucially, glyphs OUTLIVE their warden:
# kill the warden, the planted glyphs keep ticking. Forces the player to
# remember "the warden was standing HERE three seconds ago" and avoid
# that ground while focusing other threats.
#
# Why this is novel vs the existing 19-strong roster:
#   - chase_contact / charge / bomber all run AT you; they don't poison
#     the floor.
#   - healer / summoner / wraith are all centered on themselves or other
#     enemies — they don't change the SPATIAL game.
#   - existing hazards (spike_pit, fire_jet, lightning_rod) are STATIC
#     room features placed at design time. The glyph warden adds the
#     first ENEMY-AUTHORED dynamic hazard — every fight against a
#     warden produces a different floor pattern.
#
# State machine (mirrors healer/summoner shape):
#   IDLE       — kite at WARDEN_KEEP_DIST; tick _glyph_cooldown_timer.
#                When timer <=0 transition to WINDUP.
#   WINDUP     — GLYPH_WINDUP seconds. Locked in place. Gold-eye tint
#                ramps on the sprite + a small spinning rune mark
#                grows on the ground at the warden's feet. The mark
#                is the placement telegraph: it tells the player
#                "a glyph is going to live HERE."
#   PLACE      — one-frame: instantiate the glyph_trap scene at the
#                warden's current global_position. Hand off ownership
#                to the room parent so the glyph outlives the warden.
#   COOLDOWN   — kite as in IDLE but skip the scan; drain timer; back
#                to IDLE when 0.
#
# Telegraph stack:
#   1. Gold-yellow sprite tint ramping during WINDUP — same convention
#      as healer green / summoner dark-red / wraith violet.
#   2. Spinning rune mark drawn on the ground UNDER the warden during
#      WINDUP. Reads as "a glyph is being inscribed HERE." Spawned at
#      WINDUP entry; tween scales + fades it to its final size as the
#      windup elapses.
#   3. The placed glyph itself ARMS over 0.6s — its inner ring pulses
#      from amber to bright red as it transitions from disarmed (safe)
#      to armed (hot). The player has a ~0.6s window after the warden
#      lifts the glyph to escape its radius.
enum WardenState { IDLE, WINDUP, PLACE, COOLDOWN }
const GLYPH_INTERVAL: float = 3.5
const GLYPH_WINDUP: float = 0.7
const GLYPH_COOLDOWN: float = 0.6
const WARDEN_KEEP_DIST: float = 220.0
const WARDEN_MIN_DIST: float = 180.0
const WARDEN_TINT_PEAK: Color = Color(1.55, 1.30, 0.55, 1.0)   # gold/amber rune light
const GLYPH_TRAP_SCENE: PackedScene = preload("res://scenes/fx/glyph_trap.tscn")
# Inscription mark — small spinning rune drawn UNDER the warden during
# WINDUP so the player can read "the warden is laying a glyph HERE." A
# stylized 6-pointed star (two interlocked triangles) inscribed in a
# faint circle. Code-built like the healer's pulse ring; one Polygon2D
# per triangle plus an outline Polygon2D for the circle.
const INSCRIPTION_MARK_COLOR: Color = Color(1.0, 0.78, 0.30, 0.85)
const INSCRIPTION_MARK_RADIUS: float = 22.0
var _warden_state: WardenState = WardenState.IDLE
var _warden_timer: float = 0.0
var _glyph_cooldown_timer: float = 0.0
# WeakRef to the inscription-mark FX so we can spin it during WINDUP
# without leaking a strong reference (the FX self-frees on PLACE or
# state-abort via its own tween chain).
var _warden_inscription_ref: WeakRef = null

func _tick_glyph_warden(delta: float) -> void:
	if _hero == null or not is_instance_valid(_hero):
		velocity = Vector2.ZERO
		sprite.play(&"idle")
		return
	var to_hero: Vector2 = _hero.global_position - global_position
	var dist: float = to_hero.length()
	sprite.flip_h = to_hero.x < 0
	match _warden_state:
		WardenState.IDLE:
			_warden_movement(to_hero, dist)
			if _glyph_cooldown_timer > 0.0:
				_glyph_cooldown_timer = max(0.0, _glyph_cooldown_timer - delta)
			else:
				_warden_state = WardenState.WINDUP
				_warden_timer = GLYPH_WINDUP
				sprite.play(&"attack")
				_spawn_inscription_mark()
		WardenState.WINDUP:
			velocity = Vector2.ZERO
			move_and_slide()
			# Gold-eye tint ramps from baseline to WARDEN_TINT_PEAK so the
			# player reads "warden is winding up a glyph." Same iter-70
			# baseline-aware lerp pattern as healer/summoner so tinted
			# warden variants stay distinguishable through the ramp.
			var wt: float = 1.0 - (_warden_timer / GLYPH_WINDUP)
			sprite.modulate = _baseline_modulate().lerp(WARDEN_TINT_PEAK, wt)
			# Spin the inscription mark if still alive (it self-frees on
			# PLACE or abort). The rotation speed scales with windup
			# progress so the rune visibly accelerates toward placement.
			_spin_inscription_mark(delta, wt)
			_warden_timer -= delta
			if _warden_timer <= 0.0:
				_warden_state = WardenState.PLACE
		WardenState.PLACE:
			# One-frame state — plant the glyph + transition to cooldown.
			_apply_glyph_place()
			sprite.modulate = _baseline_modulate()
			_warden_state = WardenState.COOLDOWN
			_glyph_cooldown_timer = GLYPH_COOLDOWN
		WardenState.COOLDOWN:
			_warden_movement(to_hero, dist)
			_glyph_cooldown_timer = max(0.0, _glyph_cooldown_timer - delta)
			if _glyph_cooldown_timer <= 0.0:
				_warden_state = WardenState.IDLE
				# Re-arm the long interval — subtract windup + cooldown
				# already spent so the visible "next glyph in N seconds"
				# beat reads as a steady cycle, not GLYPH_INTERVAL after
				# the COOLDOWN exits.
				_glyph_cooldown_timer = max(0.0, GLYPH_INTERVAL - GLYPH_WINDUP - GLYPH_COOLDOWN)

# Warden kite movement. Same shape as _healer_movement / _summoner_movement
# but with WARDEN_KEEP_DIST. Backs away if hero is closer than MIN_DIST,
# pulls in if past KEEP_DIST + 40 px, idles in the dead zone between.
func _warden_movement(to_hero: Vector2, dist: float) -> void:
	var t: EnemyType = enemy_type
	if t.can_move() and dist < WARDEN_MIN_DIST:
		velocity = -to_hero.normalized() * _effective_move_speed()
		sprite.play(&"walk")
		move_and_slide()
	elif t.can_move() and dist > WARDEN_KEEP_DIST + 40.0:
		velocity = to_hero.normalized() * _effective_move_speed() * 0.6
		sprite.play(&"walk")
		move_and_slide()
	else:
		velocity = Vector2.ZERO
		sprite.play(&"idle")

# Plant the glyph hazard at the warden's CURRENT feet position. The
# trap.tscn is added to the WARDEN's parent (the room), NOT as a child
# of the warden — so the glyph outlives the warden. This is the design
# centerpiece: killing the warden does NOT clear its previously-laid
# traps, forcing the player to navigate around its legacy.
func _apply_glyph_place() -> void:
	var parent: Node = get_parent()
	if parent == null:
		return
	if GLYPH_TRAP_SCENE == null:
		return
	var trap: Node2D = GLYPH_TRAP_SCENE.instantiate()
	trap.global_position = global_position
	parent.add_child(trap)
	# Free the inscription mark — the glyph itself is now visible at
	# the same spot, so the mark would just be visual noise on top of
	# the new trap.
	if _warden_inscription_ref != null:
		var node: Object = _warden_inscription_ref.get_ref()
		if node != null and node is Node2D and is_instance_valid(node):
			(node as Node2D).queue_free()
		_warden_inscription_ref = null

# Build the inscription-mark FX at the warden's feet. A code-built
# 6-pointed star (two overlapping triangles) inside a faint circle,
# initially scaled small and faded; tween scales it up across WINDUP
# and ramps alpha to peak so it READS as "rune being drawn." On
# PLACE / abort the mark is queue_freed in _apply_glyph_place; on
# state-abort (warden interrupted by knockback / death) the mark
# self-frees via a safety SceneTreeTimer.
func _spawn_inscription_mark() -> void:
	var parent: Node = get_parent()
	if parent == null:
		return
	var fx: Node2D = Node2D.new()
	fx.global_position = global_position
	fx.z_index = -1
	parent.add_child(fx)
	# Outer faint circle so the star reads as inscribed.
	var ring: Polygon2D = Polygon2D.new()
	var ring_segments: int = 24
	var outer_r: float = INSCRIPTION_MARK_RADIUS
	var inner_r: float = max(0.5, outer_r - 1.4)
	var verts: PackedVector2Array = PackedVector2Array()
	for i in range(ring_segments):
		var a: float = (TAU / float(ring_segments)) * float(i)
		verts.append(Vector2(cos(a), sin(a)) * outer_r)
	for i in range(ring_segments - 1, -1, -1):
		var a: float = (TAU / float(ring_segments)) * float(i)
		verts.append(Vector2(cos(a), sin(a)) * inner_r)
	ring.polygon = verts
	ring.color = Color(INSCRIPTION_MARK_COLOR.r, INSCRIPTION_MARK_COLOR.g, INSCRIPTION_MARK_COLOR.b, 0.55)
	fx.add_child(ring)
	# Two interlocking triangles → 6-pointed star. Triangle A points up,
	# triangle B points down; together they form the rune.
	var star_r: float = INSCRIPTION_MARK_RADIUS * 0.78
	var tri_a: Polygon2D = Polygon2D.new()
	tri_a.polygon = PackedVector2Array([
		Vector2(cos(-PI/2.0), sin(-PI/2.0)) * star_r,
		Vector2(cos(-PI/2.0 + TAU/3.0), sin(-PI/2.0 + TAU/3.0)) * star_r,
		Vector2(cos(-PI/2.0 + 2.0 * TAU/3.0), sin(-PI/2.0 + 2.0 * TAU/3.0)) * star_r,
	])
	tri_a.color = INSCRIPTION_MARK_COLOR
	fx.add_child(tri_a)
	var tri_b: Polygon2D = Polygon2D.new()
	tri_b.polygon = PackedVector2Array([
		Vector2(cos(PI/2.0), sin(PI/2.0)) * star_r,
		Vector2(cos(PI/2.0 + TAU/3.0), sin(PI/2.0 + TAU/3.0)) * star_r,
		Vector2(cos(PI/2.0 + 2.0 * TAU/3.0), sin(PI/2.0 + 2.0 * TAU/3.0)) * star_r,
	])
	tri_b.color = INSCRIPTION_MARK_COLOR
	fx.add_child(tri_b)
	# Start small + faded, tween up to full scale + alpha across windup.
	fx.scale = Vector2(0.35, 0.35)
	fx.modulate.a = 0.45
	var tw: Tween = fx.create_tween()
	tw.set_parallel(true)
	tw.tween_property(fx, "scale", Vector2(1.0, 1.0), GLYPH_WINDUP) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(fx, "modulate:a", 1.0, GLYPH_WINDUP) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	_warden_inscription_ref = weakref(fx)
	# Safety reap — if the warden dies mid-windup the PLACE branch never
	# runs, so the mark needs to self-free. Free after WINDUP + a small
	# guard window; the PLACE branch frees it earlier on the normal path.
	var safety: SceneTreeTimer = get_tree().create_timer(GLYPH_WINDUP + 0.4)
	safety.timeout.connect(func():
		if _warden_inscription_ref == null:
			return
		var node: Object = _warden_inscription_ref.get_ref()
		if node != null and node is Node2D and is_instance_valid(node):
			(node as Node2D).queue_free()
		_warden_inscription_ref = null
	)

# Spin the inscription-mark during WINDUP. Rotation speed scales with
# windup-progress so the rune visibly ACCELERATES into placement —
# reads as "the warden is finishing the spell."
func _spin_inscription_mark(delta: float, wt: float) -> void:
	if _warden_inscription_ref == null:
		return
	var node: Object = _warden_inscription_ref.get_ref()
	if node == null or not (node is Node2D) or not is_instance_valid(node):
		return
	var n: Node2D = node
	# Base spin = 1.5 rad/s; ramps to 5.0 rad/s at peak windup.
	var spin: float = lerp(1.5, 5.0, wt)
	n.rotation += spin * delta

# Iter 72 — test-only force-trigger for headless verification. Skips
# the windup/cooldown gating so a test can assert "calling this plants
# a glyph trap" without simulating ~4 seconds of physics_process ticks.
# Production AI always goes through IDLE → WINDUP → PLACE → COOLDOWN.
func _force_glyph_place_for_test() -> void:
	_apply_glyph_place()

# ── Behavior: shield_walker (Bulwark) ─────────────────────────────────
# Iter 230 / Expansion Team R2 — directional-armor archetype.
#
# Walks like chase_contact toward the hero, but tracks `_shield_facing`
# (always pointing at the hero) so a 90° front cone reads as "this
# side is guarded." The cone is rendered as a Polygon2D child whose
# rotation matches `_shield_facing`. Damage taken from sources within
# the cone is reduced 75% by `_shield_damage_multiplier` (called from
# take_hit). Damage from outside the cone BREAKS the shield for 1.5 s
# — during the break the arc fades to alpha 0.18 and all damage
# applies at full value.
#
# This is the first enemy where flanking matters mechanically. Player
# learns to position around it (dash through, attack from behind) vs
# just bumping it head-on.
func _tick_shield_walker(delta: float) -> void:
	var t: EnemyType = enemy_type
	_contact_cd = max(0.0, _contact_cd - delta)
	_shield_broken_time = max(0.0, _shield_broken_time - delta)
	_hurt_anim_time = max(0.0, _hurt_anim_time - delta)
	if _hero == null or not is_instance_valid(_hero):
		velocity = Vector2.ZERO
		sprite.play(&"idle")
		_update_shield_arc_visual()
		return
	var to_hero: Vector2 = _hero.global_position - global_position
	var dist: float = to_hero.length()
	# Keep the facing vector hot — always pointing at the hero so the
	# shield naturally tracks. Skip when too close (would normalize zero
	# vector); preserve last facing in that case.
	if dist > 0.5:
		_shield_facing = to_hero.normalized()
	# Movement — chase the hero with the same separation + wall-slide
	# pattern as chase_contact so multiple bulwarks don't stack and
	# they navigate walls naturally.
	var intended: Vector2 = Vector2.ZERO
	if t.can_move() and dist > t.contact_range * 0.85:
		var to_dir: Vector2 = to_hero.normalized()
		var speed: float = _effective_move_speed()
		var sep: Vector2 = _compute_separation_vector()
		intended = (to_dir + sep * SEPARATION_FORCE).normalized() * speed
		velocity = _maybe_stuck_dodge(delta, intended)
		sprite.play(&"walk")
	else:
		velocity = Vector2.ZERO
		sprite.play(&"idle")
	sprite.flip_h = _shield_facing.x < 0
	move_and_slide()
	_apply_wall_slide(intended)
	# Contact damage on touch (same shape as chase_contact). Bulwark
	# doesn't have a signature contact_attack — its differentiator is
	# the directional shield, not the bump.
	if dist < t.contact_range and _contact_cd <= 0.0:
		_contact_cd = t.contact_cooldown
		if _hero.has_method("take_damage"):
			_hero.take_damage(t.contact_damage, global_position, _affix_aware_source_name())
			_apply_contact_affix()
	# Refresh the visual arc every tick — rotation tracks the facing
	# and alpha reflects the broken/intact state.
	_update_shield_arc_visual()

# Iter 230 — build the shield arc Polygon2D as a child of the enemy.
# Called once when a shield_walker enters _ready. We approximate the
# 90° cone with a triangle fan rooted at the enemy center, fanning
# out to SHIELD_ARC_RADIUS at the cone boundaries. The polygon's
# rotation is updated every tick to match `_shield_facing`.
func _ensure_shield_arc() -> void:
	if _shield_arc != null and is_instance_valid(_shield_arc):
		return
	var arc: Polygon2D = Polygon2D.new()
	var pts: PackedVector2Array = PackedVector2Array()
	pts.append(Vector2.ZERO)
	# Sample 9 edge points across the cone span so the boundary curves
	# smoothly rather than reading as a flat-edged triangle.
	var steps: int = 9
	for i in range(steps):
		var t: float = float(i) / float(steps - 1)
		var ang: float = lerp(-SHIELD_CONE_HALF, SHIELD_CONE_HALF, t)
		pts.append(Vector2(cos(ang), sin(ang)) * SHIELD_ARC_RADIUS)
	arc.polygon = pts
	arc.color = SHIELD_ARC_COLOR
	# Sit just under the sprite so it READS as "in front of the enemy"
	# without occluding the sprite itself. z_index -1 stacks below the
	# AnimatedSprite2D (z_index 0 by default) but above the ground
	# shadow (z_index -2 in iter-153).
	arc.z_index = -1
	# Lift slightly so the arc projects from the enemy's mid-body, not
	# its feet — matches the visual height of a held shield.
	arc.position = Vector2(0, -8)
	add_child(arc)
	_shield_arc = arc

# Iter 230 — rotate the shield arc to match `_shield_facing` and tint
# its alpha based on the broken/intact state. Called every tick by
# `_tick_shield_walker`. No-op when the arc doesn't exist (e.g. a
# shield enemy that was queued for delete mid-frame).
func _update_shield_arc_visual() -> void:
	if _shield_arc == null or not is_instance_valid(_shield_arc):
		return
	# Rotate so the arc's local +X (the cone's bisector at angle 0)
	# points along _shield_facing.
	_shield_arc.rotation = _shield_facing.angle()
	# Broken → faded, intact → full color.
	var target_alpha: float = SHIELD_ARC_BROKEN_ALPHA if _shield_broken_time > 0.0 else SHIELD_ARC_COLOR.a
	# Use modulate (preserves color when restored) so cleanup is one
	# property reset, not a per-vertex repaint.
	_shield_arc.modulate.a = target_alpha / max(0.001, SHIELD_ARC_COLOR.a)

# Iter 230 — damage-direction modifier for shield_walker enemies.
# Called from take_hit BEFORE the hp subtract. Returns the final
# damage value after shield reduction (or break-triggered amplification
# back to full). Non-shield enemies bypass this entirely (their
# behavior tag isn't "shield_walker"). For shield enemies:
#
#   * shield broken (window active) → return original damage,
#     do NOT break it again (you already broke it; double-breaking
#     would consume the same flank twice).
#   * source position unknown (legacy callers pass no 3rd arg) →
#     return original damage. Falls back to "always full damage"
#     so any damage path not yet plumbing source position stays
#     safe — see take_hit's `_last_damage_source_valid` gate.
#   * source within cone → 75% reduction (multiply by SHIELD_REDUCTION).
#   * source outside cone → return original damage AND break the
#     shield for SHIELD_BREAK_DURATION + spawn a flash VFX.
func _apply_shield_damage_filter(damage: int) -> int:
	if enemy_type == null or enemy_type.behavior != "shield_walker":
		return damage
	if _shield_broken_time > 0.0:
		# Shield is down — full damage. Don't re-break (it's already
		# broken; a flank during the window is "free" damage but
		# doesn't extend the window).
		return damage
	if not _last_damage_source_valid:
		# Unknown direction — fall back to "always full damage" so
		# damage paths that haven't plumbed the 3rd arg yet still
		# work (testing, future expansions). Conservative default.
		return damage
	var to_source: Vector2 = _last_damage_source_pos - global_position
	if to_source.length_squared() < 0.001:
		# Source on top of enemy — treat as omni, full damage.
		return damage
	var src_dir: Vector2 = to_source.normalized()
	# Angle between shield facing and incoming damage direction. If
	# within ±SHIELD_CONE_HALF, the attacker is in front — reduce.
	var angle: float = abs(_shield_facing.angle_to(src_dir))
	if angle <= SHIELD_CONE_HALF:
		# FRONT hit — shield absorbs 75%. Floor at 0 in case of integer
		# rounding (a 1-damage hit × 0.25 rounds to 0, which means the
		# shield fully nullifies tiny hits — desirable: low-damage
		# nicks should bounce off, big hits should chip through).
		return maxi(0, int(round(float(damage) * SHIELD_REDUCTION)))
	# FLANK / REAR hit — shield breaks for 1.5 s. Spawn a flash VFX
	# to telegraph the vulnerable window, then return FULL damage.
	_shield_broken_time = SHIELD_BREAK_DURATION
	_spawn_shield_break_flash()
	return damage

# Iter 230 — visual flash when the shield breaks. Quick white expanding
# ring at the enemy center that fades over 0.3 s. Pure VFX — no damage
# layer. Reads as "the guard just snapped open" so the player sees
# they've earned a 1.5 s window.
func _spawn_shield_break_flash() -> void:
	if get_parent() == null:
		return
	var ring: Polygon2D = Polygon2D.new()
	var pts: PackedVector2Array = PackedVector2Array()
	var verts: int = 18
	for i in range(verts):
		var ang: float = float(i) / verts * TAU
		pts.append(Vector2(cos(ang), sin(ang)) * SHIELD_ARC_RADIUS)
	ring.polygon = pts
	ring.color = Color(1.1, 1.05, 0.85, 0.65)
	ring.position = global_position + Vector2(0, -8)
	ring.scale = Vector2(0.45, 0.45)
	ring.z_index = 5
	get_parent().add_child(ring)
	var tw: Tween = create_tween().set_parallel(true)
	tw.tween_property(ring, "scale", Vector2(1.5, 1.5), 0.30) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(ring, "modulate:a", 0.0, 0.30) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.chain().tween_callback(ring.queue_free)

# Iter 230 — test-only helpers. Headless tests instantiate a Bulwark
# enemy, set a known facing + source-position, then call take_hit and
# read `hp` to verify the shield math. These accessors keep the test
# free of `set("_field", val)` private-member pokes.
func set_shield_facing_for_test(facing: Vector2) -> void:
	if facing.length_squared() < 0.001:
		return
	_shield_facing = facing.normalized()

func is_shield_broken_for_test() -> bool:
	return _shield_broken_time > 0.0

func get_shield_broken_time_for_test() -> float:
	return _shield_broken_time

func force_shield_restore_for_test() -> void:
	_shield_broken_time = 0.0

# ── Behavior: flying_orbit ───────────────────────────────────────────
# Iter 234 / Expansion Team R3 — Moth. The first AIRBORNE enemy in the
# roster. Pre-iter-234 every enemy moved on the 2D plane (chase /
# kite / orbit-to-cast / phase-flank); none of them OWNED the air as
# a positioning axis. The moth circles the hero at a steady radius
# and periodically dives in for a contact attack.
#
# Why a separate behavior tag (vs reusing chase_contact with a wider
# `contact_range`): chase_contact's body-bump shape is "walk straight
# at hero, slam, repeat." That gives no read on the moth's tactical
# identity — players just see "a slime that flew over the hazard."
# Orbit + commit-to-dive surfaces the air-mobility fantasy: the moth
# is HARD to pin from one direction (it'll just circle around), but
# it telegraphs its commitment via the dive arc.
#
# State machine:
#   ORBIT — pick perpendicular-to-hero-vector × _moth_orbit_sign as the
#           tangent direction. Blend in a small radial-correction term
#           (push outward when too close, pull inward when too far) so
#           the moth holds a stable orbit ± MOTH_ORBIT_RADIUS_TOLERANCE.
#           Tick _moth_dive_cooldown; when ≤ 0, commit to DIVE.
#   DIVE  — straight-line lunge at the hero for MOTH_DIVE_DURATION at
#           1.6× move_speed. Damage applies on body contact (same shape
#           as chase_contact). After DIVE_DURATION elapses, reset the
#           dive cooldown and return to ORBIT.
#
# Visual: walk anim during ORBIT (wing-flap), attack anim during DIVE
# (lunge pose). sprite.flip_h tracks the hero direction so the moth
# faces its target each frame.
func _tick_flying_orbit(delta: float) -> void:
	var t: EnemyType = enemy_type
	_contact_cd = max(0.0, _contact_cd - delta)
	_contact_attack_anim_time = max(0.0, _contact_attack_anim_time - delta)
	_hurt_anim_time = max(0.0, _hurt_anim_time - delta)
	if _hero == null or not is_instance_valid(_hero):
		velocity = Vector2.ZERO
		sprite.play(&"idle")
		return
	var to_hero: Vector2 = _hero.global_position - global_position
	var dist: float = to_hero.length()
	sprite.flip_h = to_hero.x < 0
	# Hurt anim hold (same shape as chase_contact / shield_walker).
	if _hurt_anim_time > 0.0 and t.frames_hurt > 0:
		# Don't override sprite below.
		move_and_slide()
		return
	match _moth_state:
		MothState.ORBIT:
			# Tangent direction: rotate the hero-vector 90° via the orbit
			# sign so the moth circles either clockwise or counter. Skip
			# tangent calc when degenerate (hero on top of moth) — fall
			# through to a straight-line approach so we never zero out
			# velocity mid-fight.
			var dir_to_hero: Vector2 = Vector2.RIGHT
			if dist > 0.5:
				dir_to_hero = to_hero / dist
			var tangent: Vector2 = Vector2(-dir_to_hero.y, dir_to_hero.x) * _moth_orbit_sign
			# Radial correction — push outward if too close, pull inward if
			# too far. Sign: + dir_to_hero pulls inward (toward hero), so
			# we negate when dist < radius (too close → push away).
			var radial_err: float = dist - MOTH_ORBIT_RADIUS
			var radial: Vector2 = Vector2.ZERO
			if abs(radial_err) > MOTH_ORBIT_RADIUS_TOLERANCE:
				# Direction: + dir_to_hero when too far (pull in), - when too close.
				var sign_in: float = sign(radial_err)
				radial = dir_to_hero * sign_in
			var blended: Vector2 = (tangent + radial * MOTH_RADIAL_CORRECTION).normalized()
			velocity = blended * (_effective_move_speed())
			sprite.play(&"walk")
			move_and_slide()
			# Tick dive cooldown — when it hits 0, commit to a DIVE. Only
			# dive if the hero is in reasonable reach (within ~2× orbit
			# radius) so a wandered-off hero doesn't get a free attack from
			# off-screen.
			_moth_dive_cooldown = max(0.0, _moth_dive_cooldown - delta)
			if _moth_dive_cooldown <= 0.0 and dist < MOTH_ORBIT_RADIUS * 2.0:
				_enter_moth_dive()
		MothState.DIVE:
			_moth_dive_timer = max(0.0, _moth_dive_timer - delta)
			# Straight-line lunge at the dive direction captured on entry.
			# Damage on body contact (same shape as chase_contact).
			velocity = _moth_dive_dir * (_effective_move_speed() * MOTH_DIVE_SPEED_MULT)
			if t.frames_attack > 0:
				sprite.play(&"attack")
			else:
				sprite.play(&"walk")
			move_and_slide()
			# Body contact during dive.
			if dist < t.contact_range and _contact_cd <= 0.0:
				_contact_cd = t.contact_cooldown
				if t.frames_attack > 0:
					_contact_attack_anim_time = CONTACT_ATTACK_ANIM_DURATION
				if _hero.has_method("take_damage"):
					_hero.take_damage(t.contact_damage, global_position, _affix_aware_source_name())
					_apply_contact_affix()
			if _moth_dive_timer <= 0.0:
				# Recovery: reset cooldown + return to orbit. Orbit re-
				# establishes naturally as the radial-correction term
				# kicks in next frame.
				_moth_dive_cooldown = MOTH_DIVE_INTERVAL
				_moth_state = MothState.ORBIT

# Enter DIVE: capture the dive direction at this instant + set the timer.
# Dive direction is fixed at entry (doesn't track the hero through the
# dive) so a dodging hero can EARN the escape — the moth commits.
func _enter_moth_dive() -> void:
	_moth_state = MothState.DIVE
	_moth_dive_timer = MOTH_DIVE_DURATION
	if _hero != null and is_instance_valid(_hero):
		var to_hero: Vector2 = _hero.global_position - global_position
		if to_hero.length_squared() > 0.001:
			_moth_dive_dir = to_hero.normalized()
		else:
			_moth_dive_dir = Vector2.RIGHT

# Iter 234 — test helpers. Headless tests instantiate a Moth and read
# orbit/state changes without poking private fields. Mirrors the
# Bulwark test-helper pattern from iter-230.
func get_moth_state_for_test() -> int:
	return int(_moth_state)

func force_moth_dive_for_test() -> void:
	_moth_dive_cooldown = 0.0
	_enter_moth_dive()

# ── Behavior: charger (Tuskbrod) ──────────────────────────────────────
# Iter 238 / Expansion Team R4 — completes the shield/flying/charger
# missing-archetype trio (R2 = shield_walker, R3 = flying_orbit, R4
# = charger).
#
# State machine (4 states; recovery is collapsed into a brief stun
# after the charge ends so the player gets a window to punish):
#
#   WANDER     — lumber toward hero at half move_speed. Reads as the
#                lulled, eyes-down phase of the beast. When the hero
#                comes within CHARGER_TRIGGER_RANGE, enter TELEGRAPH.
#   TELEGRAPH  — stop, face hero, capture aim direction ONCE at entry
#                so a sidestepping hero can escape the locked lane.
#                Sprite tints red + scales up (same telegraph grammar
#                the telegraphed_melee uses). The aim-ray Line2D fades
#                in showing the LANE the charge will follow. After
#                CHARGER_WINDUP_DURATION, enter CHARGE.
#   CHARGE     — set velocity = aim × move_speed × 4.0. Contact damage
#                = contact_damage + CHARGER_CONTACT_DAMAGE_BONUS (so
#                a charge hit reads heavier than a body-bump). The
#                aim-ray hides. After CHARGER_CHARGE_DURATION the
#                charger transitions to RECOVERY (brief stun).
#   RECOVERY   — stand still, breathe heavy. After CHARGER_RECOVERY_DURATION
#                return to WANDER. The recovery gives the player a
#                punish window: the charger is locked in place and
#                cannot re-telegraph until WANDER resumes.
#
# Player counterplay: dodge sideways out of the aim-ray lane during
# TELEGRAPH, OR parry the charge for a deflect window (parry already
# exists in hero.gd — no special wiring needed; the charge hit goes
# through take_damage which checks the parry window).
func _tick_charger(delta: float) -> void:
	var t: EnemyType = enemy_type
	_contact_cd = max(0.0, _contact_cd - delta)
	_hurt_anim_time = max(0.0, _hurt_anim_time - delta)
	if _hero == null or not is_instance_valid(_hero):
		velocity = Vector2.ZERO
		sprite.play(&"idle")
		_update_charger_aim_ray_visual(false)
		return
	var to_hero: Vector2 = _hero.global_position - global_position
	var dist: float = to_hero.length()
	sprite.flip_h = to_hero.x < 0
	match _charger_state:
		ChargerState.WANDER:
			# Lumbering approach at half speed. Reuse the chase_contact
			# separation + wall-slide pattern so a stack of two chargers
			# doesn't stack into one silhouette.
			if t.can_move() and dist > t.contact_range * 0.85:
				var to_dir: Vector2 = to_hero.normalized()
				var speed: float = _effective_move_speed() * CHARGER_WANDER_SPEED_MULT
				var sep: Vector2 = _compute_separation_vector()
				var intended: Vector2 = (to_dir + sep * SEPARATION_FORCE).normalized() * speed
				velocity = _maybe_stuck_dodge(delta, intended)
				sprite.play(&"walk")
				move_and_slide()
				_apply_wall_slide(intended)
			else:
				velocity = Vector2.ZERO
				sprite.play(&"idle")
			# Restore baseline sprite scale + tint in case we recently
			# exited a TELEGRAPH/CHARGE state with modified visuals.
			sprite.scale = Vector2(t.sprite_scale, t.sprite_scale)
			sprite.modulate = _baseline_modulate()
			_update_charger_aim_ray_visual(false)
			# Enter telegraph when in trigger range.
			if dist <= CHARGER_TRIGGER_RANGE:
				_enter_charger_telegraph()
		ChargerState.TELEGRAPH:
			velocity = Vector2.ZERO
			sprite.play(&"idle")
			# Red windup tint pulses over the windup so the player can
			# read "about to charge" — same grammar as telegraphed_melee
			# but on a longer duration (1.0s vs 0.35s). Through the
			# baseline so the copper tint stays readable underneath.
			var wt: float = 1.0 - (_charger_timer / CHARGER_WINDUP_DURATION)
			var base: Color = _baseline_modulate()
			sprite.modulate = Color(
				base.r,
				base.g * (1.0 - wt * 0.7),
				base.b * (1.0 - wt * 0.7),
				base.a
			)
			# Visible scale pulse so the silhouette TENSES UP (1.0 → 1.18).
			var sc: float = t.sprite_scale * (1.0 + 0.18 * wt)
			sprite.scale = Vector2(sc, sc)
			# Aim-ray stays LOCKED at telegraph-start — does not track
			# the hero through the windup. This is the counterplay
			# affordance: sidestep mid-windup to escape the lane.
			_update_charger_aim_ray_visual(true)
			_charger_timer -= delta
			if _charger_timer <= 0.0:
				_charger_state = ChargerState.CHARGE
				_charger_timer = CHARGER_CHARGE_DURATION
				sprite.play(&"attack")
		ChargerState.CHARGE:
			# Locked-velocity lunge along the captured aim direction.
			velocity = _charger_aim * (_effective_move_speed() * CHARGER_CHARGE_SPEED_MULT)
			sprite.play(&"attack")
			move_and_slide()
			# Body contact during charge — +1 damage bonus on top of
			# the enemy_type contact_damage (so a charge hit reads as
			# heavier than a regular bump).
			if dist < t.contact_range and _contact_cd <= 0.0:
				_contact_cd = t.contact_cooldown
				if _hero.has_method("take_damage"):
					var charge_dmg: int = t.contact_damage + CHARGER_CONTACT_DAMAGE_BONUS
					_hero.take_damage(charge_dmg, global_position, _affix_aware_source_name())
					_apply_contact_affix()
			# Hide aim ray during the actual charge.
			_update_charger_aim_ray_visual(false)
			# If we hit a wall (collision occurred during move_and_slide),
			# end the charge early so the charger doesn't keep grinding
			# into the wall for the full duration.
			if get_slide_collision_count() > 0:
				_charger_timer = 0.0
			_charger_timer -= delta
			if _charger_timer <= 0.0:
				_charger_state = ChargerState.RECOVERY
				_charger_timer = CHARGER_RECOVERY_DURATION
				velocity = Vector2.ZERO
				sprite.modulate = _baseline_modulate()
				sprite.scale = Vector2(t.sprite_scale, t.sprite_scale)
		ChargerState.RECOVERY:
			velocity = Vector2.ZERO
			sprite.play(&"idle")
			_charger_timer -= delta
			if _charger_timer <= 0.0:
				_charger_state = ChargerState.WANDER

# Iter 238 — enter TELEGRAPH: capture the aim direction at this instant
# (LOCKED for the entire windup) + set the timer. Locking aim early is
# the counterplay affordance: the player can sidestep out of the lane.
func _enter_charger_telegraph() -> void:
	_charger_state = ChargerState.TELEGRAPH
	_charger_timer = CHARGER_WINDUP_DURATION
	if _hero != null and is_instance_valid(_hero):
		var to_hero: Vector2 = _hero.global_position - global_position
		if to_hero.length_squared() > 0.001:
			_charger_aim = to_hero.normalized()
		else:
			_charger_aim = Vector2.RIGHT
	sprite.play(&"attack")

# Iter 238 — build the aim-ray Line2D as a child of the charger. Visible
# only during TELEGRAPH; alpha-toggled rather than queue_free'd so the
# state machine pays zero per-frame allocation cost.
func _ensure_charger_aim_ray() -> void:
	if _charger_aim_ray != null and is_instance_valid(_charger_aim_ray):
		return
	var line: Line2D = Line2D.new()
	line.width = CHARGER_AIM_RAY_WIDTH
	line.default_color = CHARGER_AIM_RAY_COLOR
	# Two-point line — origin to forward. Endpoints overwritten every
	# tick in _update_charger_aim_ray_visual to match the locked aim.
	line.add_point(Vector2.ZERO)
	line.add_point(Vector2(CHARGER_AIM_RAY_LENGTH, 0))
	line.z_index = -1
	# Start invisible — only TELEGRAPH shows it.
	line.modulate.a = 0.0
	add_child(line)
	_charger_aim_ray = line

# Iter 238 — refresh the aim-ray during the state machine. Visible flag
# controls alpha (1.0 during TELEGRAPH, 0.0 otherwise). Rotation tracks
# `_charger_aim` so the lane reads correctly even though aim is locked
# at telegraph-start (rotation updates here only when the line is
# visible — when hidden, rotation is moot).
func _update_charger_aim_ray_visual(visible_flag: bool) -> void:
	if _charger_aim_ray == null or not is_instance_valid(_charger_aim_ray):
		return
	if visible_flag:
		_charger_aim_ray.modulate.a = 1.0
		_charger_aim_ray.rotation = _charger_aim.angle()
	else:
		_charger_aim_ray.modulate.a = 0.0

# Iter 238 — test helpers. Headless tests instantiate a Tuskbrod and
# drive the state machine without simulating the full WANDER → TELEGRAPH
# trigger range / windup duration. Mirrors the Bulwark + Moth helper
# patterns from iter-230 / iter-234.
func get_charger_state_for_test() -> int:
	return int(_charger_state)

func force_charger_telegraph_for_test() -> void:
	_enter_charger_telegraph()

func force_charger_charge_for_test() -> void:
	# Skip the windup — go straight to CHARGE with aim locked at the
	# current hero direction.
	if _hero != null and is_instance_valid(_hero):
		var to_hero: Vector2 = _hero.global_position - global_position
		if to_hero.length_squared() > 0.001:
			_charger_aim = to_hero.normalized()
	_charger_state = ChargerState.CHARGE
	_charger_timer = CHARGER_CHARGE_DURATION
	sprite.play(&"attack")

func is_charger_aim_ray_visible_for_test() -> bool:
	if _charger_aim_ray == null or not is_instance_valid(_charger_aim_ray):
		return false
	return _charger_aim_ray.modulate.a > 0.5
