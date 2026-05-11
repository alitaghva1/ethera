# GameState — tiny autoload singleton for state that needs to survive
# scene transitions. Right now it just tracks total kills across the
# whole session (hamlet → dungeon → hamlet → dungeon...).
#
# This is where future state goes too: hero HP carryover, currency,
# unlocked relics, hamlet upgrade tiers. Keeping it minimal so the
# slice doesn't grow a save system before we know we want one.
extends Node

var session_kills := 0
var dungeon_runs := 0       # number of times the player entered the dungeon
var last_run_kills := 0     # kills in the most recent run (shown in hamlet)

func register_kill() -> void:
	session_kills += 1

func start_dungeon_run() -> void:
	dungeon_runs += 1
	last_run_kills = 0

func register_run_kill() -> void:
	last_run_kills += 1
	session_kills += 1
