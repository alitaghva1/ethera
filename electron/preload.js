// ============================================================
//  PRELOAD — Bridge between Node.js and the game
// ============================================================
// Exposes safe file-system save/load to the game via window.ethera
// The game code checks for window.ethera and uses it if available,
// otherwise falls back to localStorage (browser mode).

const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// We get the save directory from the main process via IPC
let savePath = null;

// Request save path from main process on load
ipcRenderer.invoke('get-save-path').then(p => { savePath = p; });

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

  // Auto-updater IPC
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_e, info) => callback(info)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (_e, info) => callback(info)),
  onUpdateError: (callback) => ipcRenderer.on('update-error', (_e, err) => callback(err)),
  installUpdate: () => ipcRenderer.send('install-update'),
});
