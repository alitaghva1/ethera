# Cursed Pickup — iter 235 / Fun Ideas Team R3.
#
# A 10% chance variant on relic pedestals. The relic is granted exactly
# as a normal pedestal, but accepting it ALSO applies a permanent (within-
# run) CURSE — a shrine_bonuses mutation — that haunts the player for
# the rest of the run.
#
# Design DNA — three north stars from the doctrine:
#   • Hades — Charon shop curses + Pact of Punishment tradeoffs. Power
#     for permanent penalty.
#   • The Binding of Isaac — Curse Rooms / Devil deals. The dangerous
#     choice is the strongest choice. Stat-aware risk.
#   • Noita — cursed wands trade for power. Permanence is real.
#
# Why this fits the Ethera doctrine (separate from Pact Altar):
#   The Pact Altar is a stand-alone shrine variant — opt-in by walking
#   up to the dark altar. Cursed Pickups, in contrast, attach to the
#   STANDARD relic offer flow and make every reward choice live with the
#   subtle threat "is this one cursed?" The player must read the
#   pedestal aura + badge BEFORE pressing E, which raises the stakes of
#   every pickup moment without burdening the room with extra props.
#
# Roll model:
#   • 10% chance per pedestal at spawn time. Each pedestal in a 3-offer
#     row rolls independently.
#   • MYTHIC tier offers are EXCLUDED. Mythics are once-per-run drops
#     (floor 4 only, ~6% per pick); curse'ing them would feel hostile.
#     The player who finally sees a Cataclysm should get to claim it
#     cleanly without losing -1 max HP for the privilege.
#
# Curse catalog (4 entries):
#   • HUNGRY VEINS    — -1 max HP, +1 sword damage, +1 blast damage
#                       (the relic feels "double-strength" via direct
#                       stat folds without touching theme tier math).
#   • STAGGERED STEP  — -8% move speed, +1 sword damage
#   • DARK HUNGER     — -1 damage reduction, +25% ether shard drops
#   • VEILED SIGHT    — -1 max HP, +10% crit chance
#
# All curse + boon writes go through GameState.grant_shrine_bonus, which
# folds via modifier_total / modifier_total_f — the same modifier-summing
# path used by relic mods, shrine prayers, and Pact Altars. No parallel
# API; the curse IS a shrine_bonus, just negatively-signed.
#
# Test deterministic seam:
#   • should_offer_cursed(tier, rng) takes an explicit RandomNumberGenerator
#     so the test suite can pin a seed and verify 0%-fail / 100%-pass
#     edges. Production callers can pass null to use the default RNG.
class_name CursedPickup
extends RefCounted

# 10% chance — Charon-shop frequency. Tuned to be RARE enough that the
# player can usually take a clean reward, but COMMON enough that the
# "cursed pedestal" aura is a recognized texture by the time they hit
# floor 2.
const CURSE_CHANCE: float = 0.10

# Catalog of 4 curses. Each entry carries:
#   id              — stable identifier (tests, save migration)
#   label           — short banner name for the cursed badge / banner
#   curse_text      — one-line description of the penalty
#   boon_text       — one-line description of the bonus
#   bonuses         — Array of {modifier_key, modifier_value} dicts.
#                     ALL entries are passed to grant_shrine_bonus on
#                     accept. Negative values are the curse; positive
#                     values are the second-relic-effect bonus.
const CURSE_CATALOG: Array = [
	{
		"id": "hungry_veins",
		"label": "HUNGRY VEINS",
		"curse_text": "-1 MAX HP",
		"boon_text": "+1 MELEE · +1 BLAST DAMAGE",
		"bonuses": [
			{"modifier_key": "max_hp_bonus",         "modifier_value": -1},
			{"modifier_key": "sword_damage_bonus",   "modifier_value": 1},
			{"modifier_key": "blast_damage_bonus",   "modifier_value": 1},
		],
	},
	{
		"id": "staggered_step",
		"label": "STAGGERED STEP",
		"curse_text": "-8% MOVE SPEED",
		"boon_text": "+1 MELEE DAMAGE",
		"bonuses": [
			{"modifier_key": "move_speed_mul",     "modifier_value": -0.08},
			{"modifier_key": "sword_damage_bonus", "modifier_value": 1},
		],
	},
	{
		"id": "dark_hunger",
		"label": "DARK HUNGER",
		"curse_text": "-1 DAMAGE REDUCTION",
		"boon_text": "+25% ETHER SHARD DROPS",
		"bonuses": [
			{"modifier_key": "damage_taken_reduction", "modifier_value": -1},
			{"modifier_key": "ether_shard_drop_mul_f", "modifier_value": 0.25},
		],
	},
	{
		"id": "veiled_sight",
		"label": "VEILED SIGHT",
		"curse_text": "-1 MAX HP",
		"boon_text": "+10% CRIT CHANCE",
		"bonuses": [
			{"modifier_key": "max_hp_bonus",   "modifier_value": -1},
			{"modifier_key": "crit_chance_f", "modifier_value": 0.10},
		],
	},
]

# Returns true if THIS pedestal should be offered as a cursed variant.
# Mythic offers are always EXCLUDED — that tier is already a once-per-
# run reward and curse'ing it would feel hostile.
#
# Caller passes in either:
#   • An explicit RandomNumberGenerator (tests pin seed for determinism)
#   • null (production path — falls back to the global randf())
#
# Tier is read off the relic's registry entry by the caller.
static func should_offer_cursed(tier: String, rng: RandomNumberGenerator) -> bool:
	if tier == "mythic":
		return false
	var roll: float
	if rng != null:
		roll = rng.randf()
	else:
		roll = randf()
	return roll < CURSE_CHANCE

# Pick one curse from the catalog. Uses the explicit RNG when provided
# (deterministic tests); production callers pass null for default randi().
static func pick_curse_id(rng: RandomNumberGenerator) -> String:
	var idx: int
	if rng != null:
		idx = rng.randi() % CURSE_CATALOG.size()
	else:
		idx = randi() % CURSE_CATALOG.size()
	return str(CURSE_CATALOG[idx].get("id", ""))

# Returns the catalog entry for a given id, or {} if not found. Used by
# the pedestal to populate the cursed badge + by tests to verify the
# bonus list shape.
static func get_curse(curse_id: String) -> Dictionary:
	for entry in CURSE_CATALOG:
		if str(entry.get("id", "")) == curse_id:
			return entry
	return {}

# Apply a curse's full bonus list to GameState. Each bonus folds
# through grant_shrine_bonus → shrine_bonuses[key] += value → surfaces
# in modifier_total / modifier_total_f. Returns true if the curse was
# applied; false if id is unknown or GameState is missing.
static func apply_curse(curse_id: String, gs: Node) -> bool:
	var entry: Dictionary = get_curse(curse_id)
	if entry.is_empty():
		return false
	if gs == null or not gs.has_method("grant_shrine_bonus"):
		return false
	var bonuses: Array = entry.get("bonuses", [])
	for b in bonuses:
		var key: String = str(b.get("modifier_key", ""))
		var val = b.get("modifier_value", 0)
		if key == "":
			continue
		gs.call("grant_shrine_bonus", key, val)
	return true
