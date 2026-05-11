# Hamlet — the player-controlled hub between dungeon runs. Three NPCs
# the player can talk to, three building footprints for atmosphere,
# and a portal at the south leading to the dungeon (main.tscn).
#
# The dungeon is on the OTHER side: when the player dies in main.tscn
# it auto-returns to this scene. GameState.last_run_kills carries the
# kill count back so the status label shows the result.
extends Node2D

@onready var status_label: Label = $UI/StatusLabel
@onready var run_label: Label = $UI/RunLabel

func _ready() -> void:
	# Surface session state — only shown after the first run.
	if GameState.dungeon_runs > 0:
		run_label.text = "Last run  ·  %d kills  ·  run %d" % [
			GameState.last_run_kills, GameState.dungeon_runs
		]
	else:
		run_label.text = ""
	status_label.text = "Hamlet — [E] talk to NPCs · walk south to enter the dungeon"
