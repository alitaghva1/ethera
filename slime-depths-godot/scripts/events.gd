# Events — global signal bus. Autoload as `Events`.
#
# Gameplay code emits these signals at the moments worth reacting to;
# the FX autoload (and future systems: audio, achievements, telemetry)
# subscribe. Decouples the FX layer from gameplay logic — hero.gd and
# enemy.gd don't need to know about cameras, particle scenes, or
# downstream consumers. They just announce what happened.
#
# Convention: every signal carries a world-space position so listeners
# can spawn / shake / sound at the right place without re-querying
# state. Aim vectors are passed when meaningful (attacks, blasts).
extends Node

signal hero_damaged(world_pos: Vector2)                  # hero takes a hit
signal hero_dodged(world_pos: Vector2)                   # hero dodge-rolled
signal hero_attacked(world_pos: Vector2, aim: Vector2)   # sword swing started
signal hero_blasted(world_pos: Vector2, aim: Vector2)    # blast spell cast
signal enemy_hit(world_pos: Vector2)                     # any enemy took damage
signal enemy_died(world_pos: Vector2)                    # any enemy died
signal pickup_claimed(world_pos: Vector2, name: String)  # relic / pedestal claimed
signal hero_died(world_pos: Vector2)                     # run-ending hit
