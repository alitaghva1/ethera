# BoonCatalog — iter-259 / Wave 8 — VS-style level-up choice catalog.
#
# When the per-room XP bar fills (see main.gd::_advance_room_xp), the
# game shows a 3-card "pick one" modal instead of the silent pedestal
# spawn the iter-246 Phase 4 implementation used. Each card is a BOON:
# an additive, run-local permanent buff that folds into the existing
# shrine_bonuses Dict on the GameState autoload.
#
# Why bonuses live in shrine_bonuses (not a new namespace):
#   • shrine_bonuses already participates transparently in
#     modifier_total / modifier_total_f via game_state.gd:1830.
#   • It's already cleared in start_dungeon_run (so bonuses don't
#     carry across runs — same semantics we want for boons).
#   • Zero downstream consumer changes — hero.gd / projectile.gd /
#     reaction_web.gd just read modifier_total and see the boon
#     contribution alongside relic + theme + upgrade-tree mods.
#
# 15 boons, 3 per theme (FLAME / STORM / BLOOD / VOW / SHADOW). All mod
# keys match the modifier_total() convention already used by relics so
# the same combat hooks consume them transparently. The exception is
# `vow_temper` — "first hit each room absorbed" — which has no mod-key
# implementation yet; we still offer the card (it reads as flavor) and
# note the mechanic as future expansion below.
#
# Design philosophy:
#   • Boons are SMALL — +1 damage, +8% crit, -15% cooldown. The VS
#     dopamine beat is "I picked something" not "this card was the
#     game-winner." Tier-1 weight matches a common-tier relic on its
#     stickiest mod, NOT a legendary stat bomb.
#   • Boons stack ADDITIVELY (shrine_bonuses[key] += value) so a player
#     who picks "+1 sword damage" three times reaches a build-relevant
#     bonus over the course of a run — same as relic stacking already
#     does for sword_damage_bonus.
#   • Boons are THEMED so a player chasing a STORM build can lean into
#     storm picks and feel the resonance build up.
extends RefCounted
class_name BoonCatalog

# ── Boon table ─────────────────────────────────────────────────────────
# Each boon entry:
#   theme     "flame" / "storm" / "blood" / "vow" / "shadow" — picks
#             the card border + glyph + which theme counter biases
#             the roll (see roll_three(strongest_theme) below).
#   name      Display string in the card (UPPERCASE, 1-3 words).
#   desc      Short benefit text — under 40 chars to fit the card.
#   mods      Dict of modifier_key → numeric_value. ADDED to
#             shrine_bonuses on selection. Int values for "_bonus"
#             keys, float values for "_mul" / "_f" keys (the same
#             convention modifier_total / modifier_total_f use).
#             Empty dict for flavor-only boons (vow_temper).
const BOONS: Dictionary = {
	# ── FLAME — damage + crit + burn ──────────────────────────────────
	"flame_strike": {
		"theme": "flame",
		"name": "FLAME STRIKE",
		"desc": "+1 sword damage",
		"mods": {"sword_damage_bonus": 1},
	},
	"flame_focus": {
		"theme": "flame",
		"name": "FLAME FOCUS",
		"desc": "+8% crit chance",
		"mods": {"crit_chance_f": 0.08},
	},
	"flame_pyre": {
		"theme": "flame",
		"name": "FLAME PYRE",
		"desc": "+15% burn chance",
		"mods": {"burn_chance_f": 0.15},
	},
	# ── STORM — blast + velocity + uptime ─────────────────────────────
	"storm_chain": {
		"theme": "storm",
		"name": "STORM CHAIN",
		"desc": "+1 blast damage",
		"mods": {"blast_damage_bonus": 1},
	},
	"storm_spark": {
		"theme": "storm",
		"name": "STORM SPARK",
		"desc": "-15% blast cooldown",
		# Negative — _mul keys are SIGNED multiplicative deltas (1.0 + key)
		# so -0.15 reads as "shorter cooldown" exactly like keen_edge etc.
		"mods": {"blast_cooldown_mul": -0.15},
	},
	"storm_velocity": {
		"theme": "storm",
		"name": "STORM VELOCITY",
		"desc": "+12% projectile speed",
		"mods": {"projectile_speed_mul": 0.12},
	},
	# ── BLOOD — HP + lifesteal + impact ───────────────────────────────
	"blood_vigor": {
		"theme": "blood",
		"name": "BLOOD VIGOR",
		"desc": "+1 max HP",
		"mods": {"max_hp_bonus": 1},
	},
	"blood_mend": {
		"theme": "blood",
		"name": "BLOOD MEND",
		"desc": "+15% lifesteal chance",
		"mods": {"lifesteal_chance_f": 0.15},
	},
	"blood_fervor": {
		"theme": "blood",
		"name": "BLOOD FERVOR",
		"desc": "+10% knockback force",
		"mods": {"knockback_force_mul": 0.10},
	},
	# ── VOW — defensive + steel + first-hit absorb ────────────────────
	"vow_aegis": {
		"theme": "vow",
		"name": "VOW AEGIS",
		"desc": "-1 incoming damage",
		"mods": {"damage_taken_reduction": 1},
	},
	"vow_steel": {
		"theme": "vow",
		"name": "VOW STEEL",
		"desc": "+2 max HP",
		# Twice blood_vigor — vow_steel pays slot cost in HP-only with
		# no DR change; blood's identity gets lifesteal + impact, vow's
		# identity gets the heavier HP wedge.
		"mods": {"max_hp_bonus": 2},
	},
	"vow_temper": {
		"theme": "vow",
		"name": "VOW TEMPER",
		"desc": "first hit each room absorbed",
		# FUTURE EXPANSION — the per-room first-hit-absorbed mechanic
		# does NOT exist yet as a modifier key. Card is offered as
		# flavor (it reads as a VOW pick) and the apply path is a
		# no-op for now. When the mechanic lands, swap mods to e.g.
		# {"vow_temper_absorb": 1} and consume it in hero.gd::take_damage.
		"mods": {},
	},
	# ── SHADOW — dash + slow + tempo ──────────────────────────────────
	"shadow_step": {
		"theme": "shadow",
		"name": "SHADOW STEP",
		"desc": "-20% dash cooldown",
		"mods": {"dash_strike_cooldown_mul": -0.20},
	},
	"shadow_silence": {
		"theme": "shadow",
		"name": "SHADOW SILENCE",
		"desc": "+15% slow chance",
		"mods": {"slow_chance_f": 0.15},
	},
	"shadow_veil": {
		"theme": "shadow",
		"name": "SHADOW VEIL",
		"desc": "+8% movement speed",
		"mods": {"move_speed_mul": 0.08},
	},
}

# ── Theme palette ──────────────────────────────────────────────────────
# Border + accent colors per theme. Match the existing iter-39 resonance
# stinger / iter-245 HUD theme chip palette so a STORM boon FEELS the
# same color as a STORM relic chip and the STORM resonance flash.
const THEME_COLORS: Dictionary = {
	"flame":  Color(1.00, 0.50, 0.20, 1.0),
	"storm":  Color(0.50, 0.78, 1.00, 1.0),
	"blood":  Color(0.88, 0.22, 0.30, 1.0),
	"vow":    Color(0.85, 0.78, 0.55, 1.0),
	"shadow": Color(0.65, 0.45, 0.85, 1.0),
}

# Glyph shown on the card. Single-character symbols readable at 48 px
# without needing a custom icon import — same approach the affix tooltip
# system uses.
const THEME_GLYPHS: Dictionary = {
	"flame":  "*",   # ember mark
	"storm":  "+",   # cross of lightning
	"blood":  "#",   # heavy mark
	"vow":    "^",   # chevron / pact
	"shadow": "~",   # waveform / shroud
}

# ── Public API ─────────────────────────────────────────────────────────

# Look up a boon definition by id. Returns an empty Dictionary on miss
# so callers can guard via `if not boon.is_empty()` without a null check.
static func get_boon(id: String) -> Dictionary:
	return BOONS.get(id, {})

# Return all boon ids that match the requested theme. Used by the
# theme-bias step in roll_three() — when the player has a strong theme,
# we bias ONE of the three cards toward that theme's pool.
static func ids_for_theme(theme: String) -> Array[String]:
	var out: Array[String] = []
	for id in BOONS:
		if str(BOONS[id].get("theme", "")) == theme:
			out.append(id)
	return out

# Roll 3 distinct boon ids for the level-up modal. If `strongest_theme`
# is provided and non-empty, there's a 70% chance to seed the FIRST
# pick from that theme's pool — biases the modal toward whichever
# theme the player is already building, classic VS-style "doubling
# down" beat without locking out off-theme picks. The remaining 2
# picks are uniformly random from the unpicked pool.
#
# Returns an Array[String] of exactly 3 unique ids. The dict has 15
# entries so a 3-pick draw is always possible.
static func roll_three(strongest_theme: String = "") -> Array[String]:
	var pool: Array[String] = []
	for id in BOONS:
		pool.append(id)
	var picked: Array[String] = []
	# Theme-bias step. 70% chance to force ONE of the three to be from
	# strongest_theme; the rng draw still resolves so a bias HIT picks
	# a uniform-random member of that theme's pool.
	if strongest_theme != "" and randf() < 0.70:
		var themed: Array[String] = []
		for id in pool:
			if str(BOONS[id].get("theme", "")) == strongest_theme:
				themed.append(id)
		if not themed.is_empty():
			var biased: String = themed[randi() % themed.size()]
			picked.append(biased)
			pool.erase(biased)
	# Fill the remaining slots from the uniform pool without
	# replacement. shuffle()+pop_back is the cheapest way to draw N
	# distinct elements from an Array.
	pool.shuffle()
	while picked.size() < 3 and not pool.is_empty():
		picked.append(pool.pop_back())
	return picked
