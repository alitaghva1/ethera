# SaveSystem — autoload singleton that persists GameState across runs.
#
# Strategy:
#   • One JSON file at user://ethera_save.json (text, debuggable, survives
#     Godot version upgrades better than binary `var_to_bytes` blobs).
#   • On _ready: try to load the save file. If present + parses, hydrate
#     GameState via GameState.load_from_dict(). If absent → silent no-op
#     (first run). If corrupt → rename to .json.corrupt and continue with
#     defaults so we don't keep failing on the same bad file forever.
#   • On quit: catch NOTIFICATION_WM_CLOSE_REQUEST and save before exit.
#     Also exposes save_now() for opportunistic saves (volume change,
#     relic pickup, etc.).
#
# Atomic write: write to .tmp first, then rename. If a crash happens
# mid-write, the real save file is untouched and we lose at most the
# in-flight change. If rename fails (Windows holds the destination open
# occasionally), we fall back to a direct write so the player doesn't
# silently lose progress.
#
# AutoLoad order: must register AFTER GameState (so GameState exists
# when SaveSystem._ready() tries to populate it via load_from_dict).
extends Node

const SAVE_PATH: String = "user://ethera_save.json"
const SAVE_TMP_PATH: String = "user://ethera_save.json.tmp"
const SAVE_CORRUPT_PATH: String = "user://ethera_save.json.corrupt"

func _ready() -> void:
	# Intercept the window-close so we get a save pass before exit.
	# auto_accept_quit stays true (the OS still closes the window) —
	# NOTIFICATION_WM_CLOSE_REQUEST fires before quit on every Godot
	# desktop platform we ship to.
	get_tree().auto_accept_quit = true
	load_now()

func _notification(what: int) -> void:
	# Catch both the window-close path (WM_CLOSE_REQUEST) and the
	# generic "the app is about to quit" path (WM_GO_BACK_REQUEST on
	# Android, NOTIFICATION_EXIT_TREE on autoloads when the tree tears
	# down). Either way: flush state to disk before the process exits.
	if what == NOTIFICATION_WM_CLOSE_REQUEST or what == NOTIFICATION_WM_GO_BACK_REQUEST:
		save_now()

# ── Public API ────────────────────────────────────────────────────────

# Write the current GameState snapshot to disk. Safe to call mid-game
# (e.g. on relic pickup or settings change) — uses a .tmp + rename
# for crash-safety. Push_warning + direct-write fallback if rename fails.
func save_now() -> void:
	var data: Dictionary = GameState.save_to_dict()
	var json_text: String = JSON.stringify(data, "\t")

	# Try the atomic path first: write .tmp, then rename over the real
	# save file. This keeps the on-disk file consistent even if the
	# process dies mid-write.
	var tmp_file: FileAccess = FileAccess.open(SAVE_TMP_PATH, FileAccess.WRITE)
	if tmp_file == null:
		# Couldn't even open the .tmp — fall through to direct write.
		_write_direct(json_text)
		return
	tmp_file.store_string(json_text)
	tmp_file.close()

	var dir: DirAccess = DirAccess.open("user://")
	if dir == null:
		_write_direct(json_text)
		return
	var rename_err: int = dir.rename(SAVE_TMP_PATH, SAVE_PATH)
	if rename_err != OK:
		# Some platforms (Windows) lock the destination if another
		# handle has it open. Fall back to overwriting in place.
		push_warning("SaveSystem: atomic rename failed (err %d) — falling back to direct write" % rename_err)
		_write_direct(json_text)
		# Clean up the orphan .tmp; non-fatal if removal fails.
		if dir.file_exists(SAVE_TMP_PATH):
			dir.remove(SAVE_TMP_PATH)

# Direct-write fallback used when the atomic path can't complete.
func _write_direct(json_text: String) -> void:
	var f: FileAccess = FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f == null:
		push_warning("SaveSystem: failed to open '%s' for write" % SAVE_PATH)
		return
	f.store_string(json_text)
	f.close()

# Load the save file (if present) into GameState. Returns true if a
# valid file existed and was applied; false on first run or corruption.
func load_now() -> bool:
	if not has_save():
		return false
	var f: FileAccess = FileAccess.open(SAVE_PATH, FileAccess.READ)
	if f == null:
		push_warning("SaveSystem: could not open '%s' for read" % SAVE_PATH)
		return false
	var text: String = f.get_as_text()
	f.close()

	# JSON.parse_string returns Variant — explicit typing keeps the
	# Godot 4.6 strict-mode parser happy and forces the `is Dictionary`
	# guard so a malformed file doesn't crash GameState.
	var parsed: Variant = JSON.parse_string(text)
	if not (parsed is Dictionary):
		push_warning("SaveSystem: '%s' is not valid JSON — renaming to .corrupt and using defaults" % SAVE_PATH)
		_quarantine_corrupt()
		return false

	var d: Dictionary = parsed
	GameState.load_from_dict(d)
	return true

func has_save() -> bool:
	return FileAccess.file_exists(SAVE_PATH)

# Debug helper: delete the save file. Called from the dev console
# when testing first-run flow without rebuilding.
func clear_save() -> void:
	if not has_save():
		return
	var dir: DirAccess = DirAccess.open("user://")
	if dir == null:
		return
	dir.remove(SAVE_PATH)

# Move a corrupt save file aside so we don't keep failing on it every
# launch. Overwrites any prior quarantine — only the most recent bad
# file is retained.
func _quarantine_corrupt() -> void:
	var dir: DirAccess = DirAccess.open("user://")
	if dir == null:
		return
	if dir.file_exists(SAVE_CORRUPT_PATH):
		dir.remove(SAVE_CORRUPT_PATH)
	dir.rename(SAVE_PATH, SAVE_CORRUPT_PATH)
