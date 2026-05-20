extends SceneTree

# Phase 1 audit gate. Forces compile of every top-level scene that the
# game uses outside main.tscn so a parse error in menu / death / pedestal /
# pause / settings / etc. is caught before features are added on top.
# Iter 209's check_main_loads.gd already covers main.tscn's transitive
# graph; this complements it by covering the runtime-instantiated scenes.

const SCENES_TO_LOAD: Array[String] = [
	"res://scenes/main.tscn",
	"res://scenes/main_menu.tscn",
	"res://scenes/death_screen.tscn",
	"res://scenes/pause_screen.tscn",
	"res://scenes/settings_screen.tscn",
	"res://scenes/pedestal.tscn",
	"res://scenes/pickup_banner.tscn",
	"res://scenes/boss_intro.tscn",
	"res://scenes/achievement_popup.tscn",
	"res://scenes/door.tscn",
	"res://scenes/shrine.tscn",
	"res://scenes/pact_altar.tscn",
	"res://scenes/chest.tscn",
	"res://scenes/torch.tscn",
	"res://scenes/pillar.tscn",
	"res://scenes/projectile.tscn",
	"res://scenes/enemy.tscn",
	"res://scenes/hero.tscn",
	"res://scenes/relic_icon.tscn",
	"res://scenes/damage_number.tscn",
	"res://scenes/familiar.tscn",
	"res://scenes/lore_stone.tscn",
	"res://scenes/fire_pool.tscn",
	"res://scenes/hazards/slow_zone.tscn",
]

func _initialize() -> void:
	print("[scenes-audit] starting")
	var fail_count: int = 0
	for path in SCENES_TO_LOAD:
		var res: Resource = load(path)
		if res == null:
			printerr("FAIL: %s did not load" % path)
			fail_count += 1
			continue
		if not (res is PackedScene):
			printerr("FAIL: %s is not a PackedScene (got %s)" % [path, res.get_class()])
			fail_count += 1
			continue
		print("[scenes-audit] ok: %s" % path)
	if fail_count == 0:
		print("[scenes-audit] ALL %d scenes loaded clean" % SCENES_TO_LOAD.size())
		quit(0)
	else:
		printerr("[scenes-audit] %d failures of %d" % [fail_count, SCENES_TO_LOAD.size()])
		quit(1)
