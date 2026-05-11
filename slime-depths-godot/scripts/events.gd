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
signal hero_stepped(world_pos: Vector2)                  # hero footstep tick (every ~26px walked)
signal enemy_hit(world_pos: Vector2)                     # any enemy took damage
signal enemy_died(world_pos: Vector2)                    # any enemy died
signal pickup_claimed(world_pos: Vector2, name: String)  # relic / pedestal claimed
signal hero_died(world_pos: Vector2)                     # run-ending hit

# ── New combat-VFX beats (iter-13/17/19) ──────────────────────────────
# Emitted by gameplay code at the precise frame of each visual event so
# audio (and any future system) can react without duplicating timing
# logic. Each one is fire-and-forget — listeners must be idempotent.
#
# hero_blast_muzzle:
#   The magenta-pink polygon burst at the blast origin, ~0.05s before
#   the projectile reaches full size. Distinct from hero_blasted (which
#   covers the projectile launch itself). Currently audio.gd layers a
#   muzzle SFX onto the existing hero_blasted handler so this works
#   without a wiring change in hero.gd — but the signal is here for
#   explicit emit when hero.gd is wired later.
#
# hero_dash_impacted:
#   Fires ONCE when the dash-strike AoE shockwave/ring lands, regardless
#   of how many enemies are caught in the radius. Distinct from the
#   per-enemy enemy_hit chain so the impact has one big beat rather than
#   N enemy_hit ticks layered up.
#
# hero_swing_connected:
#   Fires when a sword swing actually connects with at least one enemy
#   (NOT on whiff). Audio uses this to layer a brief whoosh-cut on hits;
#   plain swing audio is already covered by hero_attacked at swing-start.
#
# hero_second_wind:
#   Fires when the second_wind relic procs — the hero would have died
#   but is left at 1 HP instead. Plays a long dramatic chime.
signal hero_blast_muzzle(world_pos: Vector2)             # blast muzzle-flash beat (iter-19)
signal hero_dash_impacted(world_pos: Vector2)            # dash-strike AoE shockwave landed (iter-13)
signal hero_swing_connected(world_pos: Vector2)          # sword swing connected on at least one enemy (iter-13)
signal hero_second_wind(world_pos: Vector2)              # second_wind relic saved the hero from death (iter-17)
