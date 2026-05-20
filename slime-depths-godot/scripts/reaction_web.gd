# Iter 231 / Fun Ideas Team R2 — REACTION WEB requirements table.
#
# The game has 6 STATUS COMBOS that fire automatically when two trigger
# conditions stack on the same enemy or moment:
#
#   SHATTER          burn + slow         — +2 damage pulse (enemy.gd)
#   KINDLE_SPREAD    burn + death        — burn jumps to neighbors
#   PETRIFY          slow + crit         — stuns the enemy briefly
#   SCATTER_FLAMES   burn + knockback    — embers spread on hit
#   BACKDRAFT        burn + parry        — Q catch fires flame burst
#   RIME_TRAIL       slow + dash-through — dash leaves frost pulse
#
# Combos are powerful, but unless the player already KNOWS the system,
# they cannot easily tell which combos their build can actually fire.
# A run with embers_of_ruin + frost_pulse trivially arms SHATTER; a run
# with only embers_of_ruin half-arms SHATTER (burn yes, slow no). The
# REACTION WEB HUD chip strip surfaces this state in real time so
# build-aware play is REWARDED rather than gated behind reading the wiki.
#
# This file is the SINGLE SOURCE OF TRUTH for combo→half-capability
# mapping. main.gd's _build_reaction_web_chips + _update_reaction_web
# read this table and render six small chips on the HUD. Each chip:
#   • Hidden          when neither half is capable (unarmable)
#   • Dim "needs X"   when ONE half is capable (partial)
#   • Bright themed   when BOTH halves are capable (armed)
#
# The "kind" strings on each side are decoupled from concrete relic ids,
# so adding a new burn-source relic doesn't require editing this table —
# you just update the burn capability check in is_capability_active. The
# table only describes the COMBO STRUCTURE.
#
# Constraint per Fun Ideas Team R2 mandate: status combo trigger logic
# in enemy.gd / hero.gd is NOT touched, and RELIC_REGISTRY is NOT
# modified. This file is purely additive — a read-only sensor over the
# existing systems.
class_name ReactionWeb
extends RefCounted

# Six combos, each with the two CAPABILITY KINDS its trigger needs.
# kind_a / kind_b are the strings consumed by is_capability_active().
# label is the HUD chip text (kept short — 8 chars max so a row of 6
# chips fits a 1280-wide HUD without wrapping).
# theme is the COLOR THEME used by ThemePalette.color_for() — picked to
# match the dominant element of each combo (frost+fire combos lean to
# their stronger half; pure mobility combos pick the related theme).
#
# Notes on each combo's theme choice:
#   SHATTER         — flame (burning enemy gets shattered by the cold)
#   KINDLE_SPREAD   — flame (it's literally fire jumping)
#   PETRIFY         — shadow (control payoff, not damage; matches the
#                     iter-215 ice-blue floater + SHADOW ascendance
#                     forced-crit window which is the natural source)
#   SCATTER_FLAMES  — flame
#   BACKDRAFT       — flame
#   RIME_TRAIL      — storm (slow source is STORM relics + dash-through)
const COMBO_REQUIREMENTS: Dictionary = {
	"shatter": {
		"label": "SHATTER",
		"theme": "flame",
		"kind_a": "burn",
		"kind_b": "slow",
	},
	"kindle_spread": {
		"label": "KINDLE",
		"theme": "flame",
		"kind_a": "burn",
		"kind_b": "kill",
	},
	"petrify": {
		"label": "PETRIFY",
		"theme": "shadow",
		"kind_a": "slow",
		"kind_b": "crit",
	},
	"scatter_flames": {
		"label": "SCATTER",
		"theme": "flame",
		"kind_a": "burn",
		"kind_b": "knockback",
	},
	"backdraft": {
		"label": "BACKDRAFT",
		"theme": "flame",
		"kind_a": "burn",
		"kind_b": "parry",
	},
	"rime_trail": {
		"label": "RIME",
		"theme": "storm",
		"kind_a": "slow",
		"kind_b": "dash",
	},
}

# The 7 capability kinds the table can reference. Listed here as a
# constant so the test can assert each kind on each combo entry is one
# of these — catches typos like "burns" or "stop" that would silently
# always return false from is_capability_active.
const KNOWN_KINDS: Array = [
	"burn", "slow", "crit", "kill", "knockback", "parry", "dash",
]

# Returns true if the hero can currently produce a status of the given
# kind. Reads ONLY from GameState (modifier_total_f folds owned-relic
# mods + theme bonuses + memory mods together already, so we don't need
# to walk owned_relics ourselves for the chance-based kinds).
#
# Built-in capabilities (knockback, parry, dash, kill) are always true —
# every hero has melee swing, Q shield, SHIFT dash, and enemies can die.
# This means SCATTER_FLAMES / BACKDRAFT / RIME_TRAIL / KINDLE_SPREAD
# only ever flip between "partial" (burn or slow missing) and "armed".
# That's intentional: half the win of the chip strip is showing that
# the SECOND half of those combos is free.
static func is_capability_active(kind: String, gs: Node) -> bool:
	if gs == null:
		return false
	match kind:
		"burn":
			# burn_chance_f covers embers_of_ruin (0.25), cataclysm (0.25),
			# detonator (no — that's explode), inferno relics, etc.
			# Also handle the ashen_seal ACTIVE relic — it pours burn on
			# press regardless of chance. The active is registered via
			# get_owned_active_id() if equipped.
			# Finally, FLAME ascendance (≥4 owned) drops fire pools on
			# kill that themselves apply burn ticks → counts as
			# "can apply burn" even if no chance-based relic is owned.
			if gs.has_method("modifier_total_f"):
				if gs.modifier_total_f("burn_chance_f", 0.0) > 0.0:
					return true
			if gs.has_method("get_owned_active_id"):
				if str(gs.get_owned_active_id()) == "ashen_seal":
					return true
			if gs.has_method("theme_tier"):
				if int(gs.theme_tier("flame")) >= 2:
					return true
			return false
		"slow":
			# slow_chance_f covers frost_pulse (0.30) and glacial_resonance
			# (0.50). No active relic applies slow as of iter-231 — STORM
			# ascendance launches chain bolts but those don't slow.
			if gs.has_method("modifier_total_f"):
				return gs.modifier_total_f("slow_chance_f", 0.0) > 0.0
			return false
		"crit":
			# crit_chance_f is the base + relic-driven roll source. SHADOW
			# resonance also folds +5 % crit_chance_f via
			# theme_stat_bonuses, so a SHADOW-2 build with no crit relic
			# still arms PETRIFY. modifier_total_f reads through that fold.
			if gs.has_method("modifier_total_f"):
				return gs.modifier_total_f("crit_chance_f", 0.0) > 0.0
			return false
		"kill", "knockback", "parry", "dash":
			# Built-in hero abilities — no relic gating. Always true while
			# the hero is alive. Caller should still bail when hero == null
			# (handled by the chip updater in main.gd).
			return true
		_:
			# Unknown kind. Defensive: returning false hides the chip
			# rather than crashing, but the test gates against this case
			# by asserting every COMBO_REQUIREMENTS kind is in KNOWN_KINDS.
			return false

# Returns one of "armed" (both halves capable), "partial" (one half
# capable), or "unarmable" (neither half capable). Pure read against
# GameState; safe to call every second from _process without
# allocating.
static func evaluate_combo(combo_id: String, gs: Node) -> String:
	var spec: Dictionary = COMBO_REQUIREMENTS.get(combo_id, {})
	if spec.is_empty():
		return "unarmable"
	var a_ok: bool = is_capability_active(str(spec.get("kind_a", "")), gs)
	var b_ok: bool = is_capability_active(str(spec.get("kind_b", "")), gs)
	if a_ok and b_ok:
		return "armed"
	if a_ok or b_ok:
		return "partial"
	return "unarmable"

# Returns the kind string of the MISSING half (or "" if both/neither
# are present). Used by main.gd to write the "needs SLOW" hint chip
# text without re-walking the spec.
static func missing_kind(combo_id: String, gs: Node) -> String:
	var spec: Dictionary = COMBO_REQUIREMENTS.get(combo_id, {})
	if spec.is_empty():
		return ""
	var a: String = str(spec.get("kind_a", ""))
	var b: String = str(spec.get("kind_b", ""))
	var a_ok: bool = is_capability_active(a, gs)
	var b_ok: bool = is_capability_active(b, gs)
	if a_ok and not b_ok:
		return b
	if b_ok and not a_ok:
		return a
	return ""
