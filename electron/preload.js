// ============================================================
//  PRELOAD — Bridge between Node.js and the game
// ============================================================
// Exposes safe file-system save/load to the game via window.ethera.
// The game code checks for window.ethera and uses it if available,
// otherwise falls back to localStorage (browser mode).
//
// Two surfaces are exposed:
// 1. saveSlot/loadSlot/listSaves/deleteSlot — legacy slot-based API.
//    Currently unused by the game but kept for backward compat.
// 2. kvGet/kvSet/kvRemove/kvKeys/kvClear — key-value API that mirrors
//    localStorage semantics (string keys, string values, sync calls,
//    null on miss). This is the Steam-ready storage path: instead of
//    the game persisting into the Chromium-sandboxed localStorage
//    (which Steam Cloud can't see), all state goes into a single
//    `storage.json` file under `userData/saves/` that Steam's cloud
//    sync can pick up.
//
//    Wiring into storage.js happens in a follow-up session when we
//    can run Electron end-to-end; today the surface is exposed but
//    unused so browser flow stays untouched.

const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// Synchronously fetch the save path at preload init so the KV store is
// ready before the game's first read. Sync IPC is fine here — the main
// process has the path cached as a constant; no real work happens.
const savePath = ipcRenderer.sendSync('get-save-path-sync');
const kvFile = savePath ? path.join(savePath, 'storage.json') : null;

// In-memory KV mirror of storage.json. Loaded lazily on first access so
// preload finishes fast even if the save file is large. Writes go through
// _flushKv which rewrites the whole file (kv payloads are a few KB —
// simpler than diff-based writes, no observable perf cost).
let _kv = null;

function _loadKv() {
  if (_kv !== null) return _kv;
  if (!kvFile) { _kv = {}; return _kv; }
  try {
    if (fs.existsSync(kvFile)) {
      _kv = JSON.parse(fs.readFileSync(kvFile, 'utf8')) || {};
    } else {
      _kv = {};
    }
  } catch (e) {
    console.error('[kv] load failed, starting fresh:', e);
    _kv = {};
  }
  return _kv;
}

function _flushKv() {
  if (!savePath || !kvFile) return false;
  try {
    if (!fs.existsSync(savePath)) fs.mkdirSync(savePath, { recursive: true });
    fs.writeFileSync(kvFile, JSON.stringify(_loadKv(), null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('[kv] flush failed:', e);
    return false;
  }
}

contextBridge.exposeInMainWorld('ethera', {
  // Check if we're running in Electron
  isElectron: true,

  // Get the saves directory path
  getSavePath: () => savePath,

  // Save a slot to a local JSON file
  saveSlot: (slotIdx, data) => {
    if (!savePath) return false;
    try {
      if (!fs.existsSync(savePath)) {
        fs.mkdirSync(savePath, { recursive: true });
      }
      const filePath = path.join(savePath, `save_slot_${slotIdx}.json`);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      return true;
    } catch (e) {
      console.error('Failed to save to file:', e);
      return false;
    }
  },

  // Load a slot from a local JSON file
  loadSlot: (slotIdx) => {
    if (!savePath) return null;
    try {
      const filePath = path.join(savePath, `save_slot_${slotIdx}.json`);
      if (!fs.existsSync(filePath)) return null;
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      console.error('Failed to load save file:', e);
      return null;
    }
  },

  // List all save files (for the load menu)
  listSaves: () => {
    if (!savePath) return [];
    try {
      if (!fs.existsSync(savePath)) return [];
      return fs.readdirSync(savePath)
        .filter(f => f.startsWith('save_slot_') && f.endsWith('.json'))
        .map(f => {
          const idx = parseInt(f.replace('save_slot_', '').replace('.json', ''));
          const raw = fs.readFileSync(path.join(savePath, f), 'utf8');
          return { slot: idx, data: JSON.parse(raw) };
        });
    } catch (e) {
      console.error('Failed to list saves:', e);
      return [];
    }
  },

  // Delete a save slot
  deleteSlot: (slotIdx) => {
    if (!savePath) return false;
    try {
      const filePath = path.join(savePath, `save_slot_${slotIdx}.json`);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return true;
    } catch (e) {
      console.error('Failed to delete save:', e);
      return false;
    }
  },

  // -----------------------------------------------------------------
  //  Key-Value storage — mirrors localStorage semantics.
  //  All values are strings (like localStorage). JSON encoding/decoding
  //  happens in the game's storage.js wrapper, not here.
  // -----------------------------------------------------------------
  kvGet: (key) => {
    const kv = _loadKv();
    return Object.prototype.hasOwnProperty.call(kv, key) ? kv[key] : null;
  },
  kvSet: (key, valueString) => {
    if (typeof valueString !== 'string') {
      console.error('[kv] setItem expects a string value, got', typeof valueString);
      return false;
    }
    const kv = _loadKv();
    kv[key] = valueString;
    return _flushKv();
  },
  kvRemove: (key) => {
    const kv = _loadKv();
    delete kv[key];
    return _flushKv();
  },
  kvKeys: () => Object.keys(_loadKv()),
  kvClear: () => {
    _kv = {};
    return _flushKv();
  },

  // Auto-updater IPC
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_e, info) => callback(info)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (_e, info) => callback(info)),
  onUpdateError: (callback) => ipcRenderer.on('update-error', (_e, err) => callback(err)),
  installUpdate: () => ipcRenderer.send('install-update'),
});
