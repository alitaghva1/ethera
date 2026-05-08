// Slime Depths — prototype entry
// Profile/save-slot system MUST be imported first: its side-effect
// monkey-patches localStorage so every subsequent load/save in any
// module is auto-scoped to the active Volume (I/II/III). Any module
// that reads localStorage at module-body time (currently none do —
// all load funcs are lazy) would need to run after this.
// Round-7 Sprint B refactor — listProfiles / setActiveProfile /
// deleteProfile moved to src/modals/volumesModal.js along with the
// rest of the volumes UI; profileLabel + getActiveProfileId still
// used here for the menu's "JOURNAL II" subtitle.
import { installProfilePrefix, getActiveProfileId, profileLabel } from './profile.js';
import { loadAll } from './loader.js';
import { initInput, mouse, keyJustPressed, endFrameInput } from './input.js';
import { camera, followCamera, updateCamera, screenToWorld, setCameraSize, shakeCamera, pulseZoom, setBaselineZoom, DESKTOP_BASELINE_ZOOM, MOBILE_BASELINE_ZOOM } from './camera.js';
import {
  buildRoomFromData, drawRoom, drawSpikes, drawFirePools, spikeDamageAt, firePoolDamageAt,
  spawnExtraFirePool, room, TILE, roomTorches,
  onDoorWorld, onPedestalWorld, consumePedestal, heroSpawnInRoom,
  setBiome, currentBiomePal, roomSecrets, roomNextKind, drawUrns, drawChests, drawDecorPillars, roomChests, setDoorLookup,
  snapshotPrevRoom, tickPrevRoom, clearPrevRoom, prevRoom,
  getValidNorthDoorXRange, drawDoorLintels, drawTallPropOcclusion,
  roomSpikes, roomFirePools, roomUrns, roomDecorPillars, invalidateTileCache,
} from './room.js';
import { MAX_FLOORS, FLOOR_ENEMY_MULS, BOSS_LOOT_POOL, EMBER_TYRANT_MYTHIC_POOL, EMBER_TYRANT_MYTHIC_CHANCE } from './floor.js';
// SYSTEMS PASS 2c — branching floor map. Runs now traverse a DAG instead
// of a flat 7-room array. `floor` becomes a dynamic array built up as the
// player commits to path nodes, which keeps all existing floor[roomIndex]
// call sites working unchanged.
import { generateFloorGraph, getNode as getFloorNode } from './floorGraph.js';
// `openFloorMap` is still imported — it powers the M-key peek (bird's-eye
// view of the DAG) wired up below. The PRIMARY path-pick flow is now
// wall-integrated functional doors (see doorPortals.js — the file name
// stuck even though it now manages real doors, not floating arches).
import { openFloorMap } from './mapScreen.js';
import {
  setupRoomDoors, clearDoors, updateDoors, onRoomCleared, onRoomLocked,
  drawDoorLabels, getDoorAt, roomDoors, releaseCrossingLock,
  getNearbySealedDoor, breakSeal,
} from './doorPortals.js';
// Wire the room module's lazy door lookup so isWallAtWorld + drawDoor
// can read the per-door open state without statically importing back.
setDoorLookup(getDoorAt);
let currentGraph = null;
let currentNodeId = null;
// Re-entrancy guard for the M-key map peek (clicking a node still commits
// — it's the legacy power-user path).
let _mapPickInFlight = false;
// Tracks whether onRoomCleared has fired for the current room, so we only
// trigger the open-doors animation once per clear. Reset on transition.
let _roomClearedNotified = false;

// ───── Combat-aware atmospheric dim ─────────────────────────────────────
// Drives the themed-room mote layer's "exhale" beat after combat clear.
// Lerps 0→1 toward 1 when combat is active (combat/boss/challenge room
// with live enemies, room not cleared) and back toward 0 otherwise.
//
// Dust + weather are now masked to outside-the-playable-rect AT ALL
// TIMES (see render block — `drawDust(..., 0)` / `drawWeather(..., 0)`)
// so they don't drive any combat-aware logic anymore; the playable
// area stays clean of ambient particles whether the player is fighting
// or exploring. The remaining job for the dim is the themed-mote layer
// alpha — those are theme-tinted (FLAME/STORM/BLOOD/VOW/SHADOW) and
// read as a magical signature, so dimming them to ~30% during combat
// and blooming back to 100% post-clear is the visible "exhale."
//
// Lerp asymmetric: 0.4s into combat (fast cleanup), 0.9s out (slower
// "room exhales after the fight" feel).
let _atmosphericDim = 0;
function updateAtmosphericDim(dt) {
  const kind = floor[roomIndex]?.kind;
  const isCombatRoom = kind === 'combat' || kind === 'boss' || kind === 'challenge';
  const hasLiveEnemies = enemies.some(e => !e.dead);
  const target = (isCombatRoom && !room.cleared && hasLiveEnemies) ? 1 : 0;
  // Asymmetric lerp rates — fade IN faster (cleaner combat reads sooner),
  // fade OUT slower (the post-clear "exhale" feels more rewarding when it
  // takes a moment to bloom back).
  const rate = (target > _atmosphericDim) ? 1 / 0.4 : 1 / 0.9;     // 1/sec
  const k = 1 - Math.exp(-rate * dt);
  _atmosphericDim += (target - _atmosphericDim) * k;
  if (_atmosphericDim < 0.0005) _atmosphericDim = 0;
  if (_atmosphericDim > 0.9995) _atmosphericDim = 1;
}
// Round-7 Sprint B refactor — seenEnemyTypes moved to
// src/modals/achievementsModal.js (used only by the bestiary tab).
import { spawnEnemy, updateEnemies, drawEnemy, drawEnemyTelegraphs, drawPerfectDodgeRing, drawEliteAffixTooltips, enemies, clearEnemies, updateFlames, drawFlames, clearFlames, updateEmberRings, drawEmberRings, clearEmberRings, drawCorpses, loadCodex, TYPES as ENEMY_TYPES } from './enemies.js';
import { updateProjectiles, drawProjectiles, clearProjectiles } from './projectiles.js';
import { hero, updateHero, drawHero, resetHero, damageHero } from './hero.js';
import { updateParticles, drawParticles, updateDust, drawDust, deathBurst, sparkle, updateWeather, drawWeather, updateAmbientCreatures, drawAmbientCreatures, clearAmbientCreatures } from './particles.js';
import { drawHud, updateHudAnims, resetHudAnims } from './hud.js';
import {
  setThemedRoomActive,
  clearThemedRoom,
  updateThemedRoomMotes,
  drawThemedRoomMotes,
} from './themedRoomMotes.js';
import { setMasterVolume, playSfx } from './sfx.js';
import { resetRelics, equipped as equippedRelics, rollRelicOffer, applyRelic, RELIC_DEFS, ALL_RELIC_IDS, seenRelicIds, loadSeenRelics, relicTier, isRelicForWeapon } from './relics.js';
import { stats, resetStats, calculateEssence, runDurationSeconds } from './stats';
// Round-7 Sprint B refactor — saveMeta moved to smithModal.js with the
// rest of the smith UI (heirloom refund path); no other main.js caller
// needed it. bankHeirloom is still used by the Wanderer's gift service.
import { meta, loadMeta, addEssence, purchaseUnlock, hasUnlock, UNLOCKS, bankHeirloom, consumeHeirloom } from './meta.js';
// Round-7 Sprint B refactor — WEAPONS + ALL_WEAPON_IDS + WEAPON_UNLOCKS
// moved to src/modals/weaponPickerModal.js (along with availableWeapons,
// re-exported for the two non-picker callers in main.js: the menu START
// short-circuit + loadRoom's null-weapon fallback grant).
// Round-7 Sprint B refactor — CURSES + ALL_CURSE_IDS + toggleCurse
// moved to src/modals/cursesModal.js along with the rest of the
// curses UI; isCursed / curseCount / curseEssenceMul / activeCurses
// / loadCurses still used here for run-state checks + save/load.
import { activeCurses, loadCurses, isCursed, curseCount, curseEssenceMul } from './curses.js';
// Round-7 Sprint B refactor — isUnlocked moved to achievementsModal
// (only the chronicles deeds tab calls it).
import { ACHIEVEMENTS, ACH_IDS, pendingPopups, loadAchievements, evaluateAchievements, totalUnlocked } from './achievements.js';
import { records, loadRecords, updateRecords, incrementRunsStarted } from './records';
// Round-7 Sprint B refactor — totalFusions + discoveredCount moved to
// src/modals/pauseModal.js with the rest of the relic-strip render.
// FUSIONS + discoveredFusions moved to achievementsModal (fusions tab).
import { loadDiscoveredFusions, activeFusions, clearFusions } from './fusions.js';
import { ruin, loadRuin, recordDeath, recordBossKill, recordRunComplete, getRoomStain, getBossRoomStain, agingLevel } from './ruin.js';
// Round-7 Sprint B refactor — seenCount + totalCards moved to
// src/modals/tarotRevealModal.js with the reveal render. drawnCards
// stays here: run snapshot/resume serializes it, and the Oracle's
// gift NPC mutates it post-pick.
import { TAROT, drawnCards, drawTarotHand, hasCard, isTarotRun, clearTarot, loadSeenTarot } from './tarot.js';
// Round-7 Sprint B refactor — setSfxVolume + setMusicVolumeSetting +
// setShakeScaleSetting moved to src/modals/{settings,pause}Modal.js
// (both modals own their own slider triplet).
import { settings, loadSettings, resolvePerfMode } from './settings';
import { applyMobileMode, installFirstTouchFallback } from './mobileMode.js';
import { initMobileControls } from './mobileControls.js';
import { daily, loadDaily, getTodayChallenge, markDailyCompleted, hasCompletedToday } from './daily.js';
import { loadTips, showTip, updateTips, drawTip, TIPS } from './tips.js';
import { updateNotifications, drawNotifications, clearNotifications, getNotificationStackBottom, pushNotification } from './notifications.js';
import { loadFirstSeen, hasSeen, markSeen, isFirstTime } from './firstSeen.js';
import { synthChord, synthFanfare, synthPing, synthGloom, synthThud, synthClick, startAmbientPad, stopAmbientPad } from './synth.js';
import { startIntro, updateIntro, drawIntro, isIntroActive, skipIntro } from './intro.js';
import {
  spawnRelicOffer, spawnAltarOffer, spawnShopOffer, spawnBossDrop, updatePedestals, drawPedestals, clearPedestals,
  pedestals, hasActivePedestals, drawPickupFlash, drawPedestalTooltip, suppressPickupFlash,
  setPickupFlashForTest, isPickupFlashActive,
  consumePendingPickup, drawPedestalPrompt, pushPedestal,
  getHoveredPedestalIndex,
} from './pedestals.js';
import { drawCounterPips, tickCounterPips } from './counterPips.js';
import { drawPedestalTeasers } from './pedestalTeaser.js';
import {
  requestModal as requestRelicChoiceModal,
  clearModal as clearRelicChoiceModal,
  isModalOpen as isRelicChoiceModalOpen,
  isFullyOpen as isRelicChoiceModalFullyOpen,
  updateModal as updateRelicChoiceModal,
  drawModal as drawRelicChoiceModal,
  handleModalKey as handleRelicChoiceModalKey,
  handleModalMouseMove as handleRelicChoiceModalMouseMove,
  handleModalClick as handleRelicChoiceModalClick,
  _debugState as _relicChoiceDebugState,
} from './relicChoiceModal.js';
// Dev-only — expose modal state for live debugging from devtools.
if (typeof window !== 'undefined') {
  window.__relicChoiceDebug = _relicChoiceDebugState;
  window.__requestRelicChoice = requestRelicChoiceModal;
}
import { drawThemeAura } from './themes.js';
import {
  drawWatcher,
  watcherOnRunStart, watcherOnRunResume,
  watcherOnDeath, watcherOnFloorEnter,
  watcherOnBossClear, watcherOnFinalBossEnter, watcherOnAscensionStart,
  watcherResetForTesting, watcherTestSpeak, watcherSnapshot,
  watcherLastLine, watcherDescentCount,
} from './watcher.js';
import {
  HAMLET_HERO_SPAWN, HAMLET_WALK_Y_MIN, HAMLET_WALK_Y_MAX, HAMLET_ZOOM,
  updateHamletScene, drawHamletBackdrop, drawHamletFx, drawHamletEntities, drawHamletOverlay, drawHamletInteractPrompt,
  consumeHamletInteract, resolveHamletCollision,
} from './hamletScene.js';
import { initMusic, playTrack, stopMusic, updateMusic, setMusicVolume, setIntensity as setMusicIntensity } from './music.js';
import { applyZoneProfile, getActiveZoneWash } from './zones.js';
import { updateZoneAmbient, drawZoneAmbient, drawZoneWash } from './zoneAmbient.js';
import {
  toggleWalkOverlay, drawWalkOverlay, isOverlayVisible as isWalkOverlayVisible,
  setOverlayZone, toggleCellAtWorld, exportOverrides as exportWalkOverrides,
  overrideCount as walkOverrideCount,
} from './walkabilityOverlay.js';
import { startZoneRun, stopZoneRun, updateZoneRunner, getZoneRunnerState } from './zoneRunner.js';
import {
  spawnZonePortal, clearZonePortal, updateZonePortal, drawZonePortal,
  isZonePortalActive,
} from './zonePortal.js';
import { getNextZone, getZoneEncounters } from './zoneEncounters.js';
import {
  resetXp, dropXpGemFromEnemy, dropBossXpBurst, updateXp, drawXpGems, drawXpBar,
  setOnLevelUp, getXpDebug,
} from './xpSystem.js';
import { drawZoneHud } from './zoneHud.js';
import {
  isLevelUpModalOpen, openLevelUpModal, drawLevelUpModal,
  updateLevelUpModalMouse, handleLevelUpModalClick, handleLevelUpModalKey,
} from './levelUpModal.js';
import { resetPerks, getActivePerksDebug } from './perks.js';
import { gold, resetGold, updateGold, drawGold } from './gold.js';
// Round-7 Sprint B refactor — composeRelicThumbDataURL +
// composeEnemyThumbDataURL moved to achievementsModal (used only by
// the bestiary + relicpedia + fusions tabs to compose grid thumbs).
import { consumeHitStop, updateFx, drawDamageNumbers, drawSlashes, clearFx, getTimeScale, updatePerfectDodge, drawPerfectDodgeOverlay, drawScreenFlash, updateScreenFlash, drawCounterIndicator, triggerScreenFlash, updateHitMarkers, drawHitMarkers, hueRotateForTint, spawnDamageNumber, updateSoulTethers, drawSoulTethers, clearSoulTethers } from './fx.js';
import { images as imageCache } from './loader.js';
import { updateSynergies, drawSynergies, drawComboOverlay, drawHeroShield, drawWandererTrail, drawPyroCharge, clearSynergies } from './synergies.js';
import { maybeSpawnWanderer, updateWanderer, drawWanderer, drawWandererTooltip, clearWanderer } from './wanderer.js';
// Round-7 Sprint B refactor — MEMORIES + ALL_MEMORY_IDS + unlockedMemories
// + selectedMemoryId + setSelectedMemory + memoriesUnlockedCount + totalMemories
// moved to src/modals/memoryModal.js with the rest of the memory UI.
// loadMemories + checkMemoryUnlocks + applySelectedMemory + getSelectedMemory
// + selectedMemoryId still used here for run-state setup, save snapshot,
// and the menu chip's updateMenuMemoryLabel readout.
import { selectedMemoryId, loadMemories, checkMemoryUnlocks, applySelectedMemory, getSelectedMemory } from './memories.js';
import { loadDeathTips, recordKilledBy, fireDeathTipIfReady } from './deathTips.js';
import { NPCS, ALL_NPC_IDS, hamletState, loadHamletState, saveHamletState, refreshNpcPresence, tryAdvanceArc, recordServiceUse, markDialogueSeen, getNextChatLine, npcHasChat, availableTopicsForNpc, getTopicAnswer, isTopicSeen, getFamiliarityLabel, bumpFamiliarity, nextBumpCrossesTier, buildGreetingContext, resolveReactiveGreeting, getCurrentPreoccupation, stampVisit, recordRunEnd, KEEPER_WAKE_BEATS } from './hamlet.js';
import { startMenuEmbers } from './menuEmbers.js';
import { drawFloorCard } from './floorCardRender.js';
import { updateBossIntro } from './bossIntroDom.js';
// Round-7 Sprint B refactor — modal extractions. Each module owns its
// own DOM construction + render logic; main.js wires onClose callbacks
// at boot since the modals can't import showMainMenu without creating
// a circular dep.
import { volumesEl, showVolumesModal as _showVolumesModal, setVolumesOnClose } from './modals/volumesModal.js';
import { cursesEl, showCursesModal as _showCursesModal, setCursesOnClose } from './modals/cursesModal.js';
import { showJournalModal as _showJournalModal, setJournalOnClose } from './modals/journalModal.js';
import { smithEl, showSmithModal as _showSmithModal } from './modals/smithModal.js';
import { memoryEl, showMemoryModal as _showMemoryModal, setMemoryOnClose, setMemoryOnPick } from './modals/memoryModal.js';
import { tarotRevealEl, showTarotRevealModal as _showTarotRevealModal, setTarotOnBegin, setTarotOnBack } from './modals/tarotRevealModal.js';
import { settingsEl, showSettingsModal as _showSettingsModal, setSettingsOnClose } from './modals/settingsModal.js';
import { weaponPickerEl, showWeaponPickerModal as _showWeaponPickerModal, setWeaponOnPick, setWeaponOnBack, availableWeapons } from './modals/weaponPickerModal.js';
import { pauseEl, setPauseVisible, setPauseOnResume, setPauseOnQuit, setPauseOnJournal } from './modals/pauseModal.js';
import { achEl, showAchievementsModal as _showAchievementsModal, setAchievementsOnClose, ENEMY_PORTRAIT_PATH } from './modals/achievementsModal.js';
import { oracleEl, oracleFortuneEl, showOracleForecast as _showOracleForecast } from './modals/oracleModal.js';
import { winEl, setupShop as _setupShop, hideShop, setWinOnRestart } from './modals/winModal.js';

// Side-effect: install the localStorage profile-prefix patch NOW, before any
// other module-body code could touch storage. All load*() funcs in other
// modules are lazy (called from boot()), so even though imports above have
// fully evaluated their module bodies, none of them read storage yet.
installProfilePrefix();

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
setCameraSize(canvas.width, canvas.height);

// Release-prep responsive pass: keep the camera and input-mapping in sync
// when the window resizes (desktop resize, mobile rotation, DPI/zoom change).
// The canvas internal resolution stays 1280x720; CSS handles visual scaling.
// Camera only reads width/height in world units, so no real size change —
// but input.js maps clientX/Y via getBoundingClientRect() which DOES depend
// on the laid-out size, so we force a layout settle by re-running setCameraSize.
//
// SECOND CONCERN — UI scale: the canvas auto-stretches to viewport
// (1920x1080 on 1080p, 3840x2160 on 4K) via CSS aspect-ratio, but DOM
// overlays (death screen / dialogue / menu / pause / etc.) had FIXED pixel
// typography and looked tiny on a 4K monitor. We measure the canvas's
// actual rendered width and set --ui-scale = renderedWidth / designWidth
// (designWidth = 1280). #hud (which contains every overlay) applies that
// scale via a single CSS transform — every modal size-matches the canvas
// at any viewport from 480p to 4K+ with zero per-element changes.
const DESIGN_WIDTH = 1280;
function _updateUiScale() {
  // getBoundingClientRect respects the canvas's CSS aspect-ratio rule, so
  // on a 21:9 ultrawide we get the LETTERBOXED canvas width (not viewport
  // width) — the HUD scales to match the visible canvas, not the empty
  // letterbox bars.
  const r = canvas.getBoundingClientRect();
  if (r.width <= 0) return;
  const scale = r.width / DESIGN_WIDTH;
  document.documentElement.style.setProperty('--ui-scale', String(scale));
}
let _resizeT = 0;
const _onResize = (settleMs) => {
  clearTimeout(_resizeT);
  _resizeT = setTimeout(() => {
    setCameraSize(canvas.width, canvas.height);
    _updateUiScale();
  }, settleMs);
};
window.addEventListener('resize', () => _onResize(100));
// Orientation change fires slightly ahead of resize on mobile — belt-and-braces.
window.addEventListener('orientationchange', () => _onResize(300));
// ResizeObserver on the canvas catches every size change — initial layout,
// dev-tools open/close, devicePixelRatio shifts, fullscreen toggles. Without
// this, the initial paint of modals could land at the wrong scale (canvas
// size at DOMContentLoaded isn't always final on first frame).
if (typeof ResizeObserver !== 'undefined') {
  const _ro = new ResizeObserver(() => _updateUiScale());
  _ro.observe(canvas);
}
// Belt-and-braces initial sync — run once on script load and once on full
// load. Either path catches the case where the canvas is already sized.
_updateUiScale();
if (document.readyState !== 'complete') {
  window.addEventListener('load', _updateUiScale, { once: true });
}

// Post-FX pipeline (bloom + chromatic aberration) moved to ./postfx.js
// as part of review #4 (main.js split). main.js still owns the render-loop
// order and keeps the window assignment below so hero.js can trigger the
// RGB split on damage without importing main.js.
import { triggerChromAberr, updateChromAberr, applyChromAberr, applyBloom, setPostfxPerfMode } from './postfx.js';
import { setAtmosphericPerfMode } from './room.js';
window.__triggerChromAberr = triggerChromAberr;

// Per-run gameplay metrics — collapsed from 7 individual window.__ globals
// into one object so the stat-tracker cluster reads and writes through a
// single namespace. All values are time-gated (staleness checks in the
// readers), so no explicit reset between runs is needed.
window.__gameMetrics = {
  killStreak: 0,
  killStreakShowUntil: 0,
  maxCombo: 0,
  lastHitTime: 0,
  lastHitFromX: 0,
  lastHitFromY: 0,
  lastKillTime: 0,
};

// Death/victory screen markup moved to ./deathScreen.js (review #4 split pass 2).
// Data-filling (stats, relics, essence) and event wiring stay in main.js.
import { DEATH_SCREEN_HTML } from './deathScreen.js';
// Between-floor + victory screen markup moved to ./winScreen.js (split
// pass 3). The HTML import is now consumed by src/modals/winModal.js
// (Round-7 Sprint B), not main.js — the line is preserved as a marker
// of where the markup lives, but main.js no longer imports it.
// Credits screen — third-party asset attribution (release-prep legal step).
import { CREDITS_SCREEN_HTML } from './creditsScreen.js';
// Controls / how-to-play primer — single-reference cheat sheet, a less
// contextual companion to the onboarding tips system.
import { CONTROLS_SCREEN_HTML } from './controlsScreen.js';
// Main menu markup — shown on page load. main.js owns DOM setup, event
// wiring (begin descent, mode chips, save-slot journal, link buttons), and
// the ember particle animation.
import { MENU_SCREEN_HTML } from './menuScreen.js';
// Ascension — systems-roguelite long-tail tiers. Each cleared floor-4 run
// unlocks the next tier's modifier + essence scaling.
import {
  loadAscension, ASCENSION_TIERS,
  ascensionEssenceMul, ascensionModifiers,
  getAscensionTier, getUnlockedTier, setAscensionTier,
  onRunCompletedAtTier,
} from './ascension.js';
loadAscension();
// Expose modifiers to enemies.js / floor.js via a window hook rather than
// a new import path. They call back during runtime to pick up the current
// tier's scalars.
window.__ascensionModifiers = ascensionModifiers;
// Storage health probe — surfaces a warning chip if localStorage is blocked.
import { showStorageWarningIfBlocked } from './storage.js';
showStorageWarningIfBlocked();

// Global error boundary — catches uncaught exceptions and unhandled promise
// rejections and renders a friendly "something went wrong" overlay instead
// of leaving the player staring at a frozen black canvas.
import { installErrorBoundary, guardRender } from './errorBoundary.js';
installErrorBoundary();

// Accessibility: apply prefers-reduced-motion preference once at boot.
// Camera shake + zoom pulse are scaled through camera.shakeScale (already a
// thing the settings panel controls); hit-stop durations are scaled through
// fx.js's setHitStopScale. CSS-side animation suppression is handled by a
// @media block in index.html.
import { prefersReducedMotion } from './a11y.js';
import { setShakeScale } from './camera.js';
import { setHitStopScale } from './fx.js';
if (prefersReducedMotion()) {
  setShakeScale(0.2);        // near-zero camera shake
  setHitStopScale(0.15);     // near-zero freeze-frames on impact
}

const loadingEl = document.getElementById('loading');
const deathEl = document.getElementById('deathScreen');
// Replace the stock death screen with a full run-summary UI
deathEl.style.flexDirection = 'column';
deathEl.style.padding = '20px';
deathEl.style.boxSizing = 'border-box';
// Slim death screen: title + ornament + subtitle + 2-line stats +
// 1-line essence + optional memory tag + button row ≈ 290 design px.
// Used to be ~720 px when this panel also hosted the meta-shop and
// watcher ledger; that content moved to the hamlet shrine. Keep
// safe-center + overflow-y:auto so the panel still degrades gracefully
// at narrow viewport scales.
deathEl.style.justifyContent = 'safe center';
deathEl.style.overflowY = 'auto';
deathEl.innerHTML = DEATH_SCREEN_HTML;
// `_restartBtnOverridden` was set by the old showSanctuary re-skin that
// repainted the death screen as a sanctuary panel. Sanctuary now lives
// in its own shrine modal, so this flag is currently always false.
// The click + R-key handlers below still guard on it so a future
// overlay flow that rebinds restartBtn.onclick can flip it true and
// suppress the default startRun() / showHamlet() behavior without
// having to teach every handler about a new flag.
let _restartBtnOverridden = false;
// When set, NPC service modals (curses / memory / sanctuary / smith /
// oracle) close back to the LIVE hamlet canvas underneath rather than
// re-entering the hamlet via showHamlet/enterHamletCanvas (which respawns
// the hero at the entrance, losing their position next to the NPC). The
// hamlet's render loop keeps drawing the canvas while a modal sits over
// it, so simply hiding the modal restores the player's view exactly
// where they left it. Each from-hamlet wrapper sets this true; the
// default close handler reads + clears it. Default false = main-menu
// access path (close goes to main menu as before).
let _serviceCloseToHamlet = false;
document.getElementById('restartBtn').addEventListener('click', () => {
  if (_restartBtnOverridden) return;
  // Post-DEATH path now detours through the hamlet so the authored
  // reactive-greeting wave (Keeper "you came back without all of yourself",
  // Smith "Mm. Try a heavier weapon", Gravekeeper ledger lines) actually
  // fires. recordRunEnd('death', ...) sets up `lastRunOutcome = 'death'`
  // + clears npcGreetingShown so a fresh wave is queued — but the previous
  // restartBtn → startRun() path skipped past the hamlet entirely, leaving
  // the wave permanently un-triggered. Round-6 player-sim audit flagged
  // this as the single highest-impact fix in the codebase: every
  // hand-authored death-aware NPC line was queued and never read.
  //
  // Victory still goes straight to startRun() — players who just won have
  // already seen the epilogue + animated meta shop on the death modal,
  // and a between-ascent hamlet detour breaks the "run it back" momentum
  // that Slay-the-Spire-style victory loops want. The hamlet still gains
  // the post-victory NPC reactions on whoever's next return; we just
  // don't force the walk on the immediate retry.
  if (hamletState.lastRunOutcome === 'death') {
    deathEl.style.display = 'none';
    showHamlet();
    return;
  }
  // Phase 4 unification — restart from death goes to canonical zone run.
  beginCanonicalDescent('ruins');
});
// Escape hatch from the death/victory screen back to the main menu. Essence
// is already banked by the time this screen shows, so the player can safely
// detour to change memories, visit the hamlet, switch save slot, etc.
document.getElementById('deathMenuBtn')?.addEventListener('click', () => {
  deathEl.style.display = 'none';
  showMainMenu();
});
// QUICK RESTART — skip the hamlet detour and go straight to F1. For
// players who've heard the reactive NPC dialogue and just want to
// keep running. Genre-fast death-to-respawn loop (~3 sec instead of
// ~15 sec via the walk-to-portal hamlet path).
//
// Honors _restartBtnOverridden — when sanctuary / wanderer-gift screens
// have temporarily rebound the death modal's primary button, this
// secondary path stays inert too so we don't bypass an active sub-flow.
document.getElementById('deathQuickRestartBtn')?.addEventListener('click', () => {
  if (_restartBtnOverridden) return;
  deathEl.style.display = 'none';
  // Phase 4 unification — quick restart routes to canonical zone run.
  beginCanonicalDescent('ruins');
});
document.getElementById('deathQuickRestartBtn')?.addEventListener('mouseenter', (e) => {
  e.target.style.opacity = '1';
  e.target.style.color = '#c9a86a';
});
document.getElementById('deathQuickRestartBtn')?.addEventListener('mouseleave', (e) => {
  e.target.style.opacity = '0.7';
  e.target.style.color = '#8a7a5a';
});
document.getElementById('deathMenuBtn')?.addEventListener('mouseenter', (e) => {
  e.target.style.opacity = '1';
  e.target.style.color = '#c9a86a';
});
document.getElementById('deathMenuBtn')?.addEventListener('mouseleave', (e) => {
  e.target.style.opacity = '0.7';
  e.target.style.color = '#8a7a5a';
});

// R-key shortcut for QUICK RESTART when the death screen is up. The
// in-game R key (line ~2375) is the pedestal-reroll hotkey, but it
// guards on `deathEl.style.display !== 'none'` and bails on death — so
// the keycode is free here. Mirrors the click handler exactly: respect
// _restartBtnOverridden, hide the modal, kick off a fresh run.
//
// Suppressed when the player is in a contextual sub-flow that needs
// keyboard focus (e.g. typing in a field), but those flows don't share
// the death screen state, so the deathEl-display check is enough.
window.addEventListener('keydown', (e) => {
  if (e.code !== 'KeyR') return;
  if (deathEl.style.display !== 'flex') return;
  if (_restartBtnOverridden) return;
  e.preventDefault();
  deathEl.style.display = 'none';
  // Phase 4 unification — R-key quick restart routes to canonical zone run.
  beginCanonicalDescent('ruins');
});

// Between-floor + victory screen — extracted to src/modals/winModal.js
// (Round-7 Sprint B). main.js retains the wrapper so the restart button
// can decide between startRun() (post-final-floor edge case) and
// beginNextFloor() based on the local currentFloorLevel state. The
// modal exports winEl for the dozen visibility-check sites scattered
// across main.js, plus setupShop / hideShop for the openFloorUi flow.
setWinOnRestart(() => {
  if (currentFloorLevel >= MAX_FLOORS) {
    startRun();
  } else {
    beginNextFloor();
  }
});


// Floor state
let floor = [];
let roomIndex = 0;
let currentFloorLevel = 1;       // 1..MAX_FLOORS
let transition = { active: false, phase: 'out', t: 0, toIndex: 0 };
let running = false;
// Monotonic run sequence — increments every time startRun / resumeRun
// begins a new run. Used by deferred timeouts/intervals (boss-drop
// poll, wave-2 spawn) to detect "this callback fired AFTER the run
// it was scheduled in ended" and bail cleanly. Without this guard,
// a 15s boss-drop poll can fire openFloorUi against a fresh run.
let _runSeq = 0;
let bossWinTriggered = false;
let gameTime = 0;
let heroSpikeCD = 0;
let roomLabelTime = 0;
let roomLabelText = '';
let roomLabelColor = '#ffd68a';
let paused = false;
// Full-screen floor intro card — shown when entering a new floor
let floorCardTime = 0;
let floorCardStartedAt = 0;       // wall-clock mark for stuck-overlay clamp
let floorCardRoman = '';
let floorCardName = '';
let floorCardFlavor = '';
let floorCardBackdrop = '';
// Total duration for the active floor card. 3.2s on first sight; 1.6s
// on repeat (cinematic skip-on-repeat — see triggerFloorCard). Drives
// both the timer countdown AND the alpha-curve normalization in
// floorCardRender, so they have to stay in sync.
let floorCardTotal = 3.2;

const FLOOR_CARD_DATA = {
  1: { roman: 'I',   name: 'THE UNDERCROFT',    flavor: 'cold stone remembers the dead',         backdrop: 'zone_undercroft' },
  2: { roman: 'II',  name: 'THE RUINED TOWER',  flavor: 'where kings once feasted, rats now feast', backdrop: 'zone_ruined_tower' },
  3: { roman: 'III', name: 'THE SPIRE',         flavor: 'the world has ended. something else begins.', backdrop: 'zone_spire' },
  4: { roman: 'IV',  name: 'THE THRONE OF RUIN', flavor: 'the wound at the world\u2019s heart',  backdrop: 'zone_throne_of_ruin' },
};

// Round-7 design-team narrative audit — replaced 5 of 13 lines that
// read as genre filler ("dust returns to dust", "ash to ash. ruin to
// ruin.", "the depths consume another", "the world continues without
// you", "another soul for the ruin", "even the brave fall here") with
// imagery rooted in the game's own world (the Keeper, the Watcher, the
// lantern, the stones, the ruin's reclaiming) so the death subtitle
// — the LAST thing the player reads on a run — earns its weight
// instead of recycling tropes any roguelite could write.
const DEATH_MESSAGES = [
  'your journey into Ethera ends',
  'the keeper sets her cup down. she does not look up.',
  'the lantern leans toward the next traveler',
  'your weight leaves the floor. nothing else moves.',
  'the watcher does not turn its head',
  'the ruin does not eulogize',
  'the dark will remember you, for a while',
  'the stones note your absence and forget you in the same breath',
  'you hear the door close behind you, unseen',
  'your name is already fading',
  'the wound at the heart of Ethera grows',
  'and the silence reclaims the hall',
  'the lantern gutters, the stone forgets',
];
const VICTORY_MESSAGES = [
  'but Ethera is older than any victory',
  'the fire bows — but the ruin abides',
  'for a moment, the dark was afraid',
  'the heart of the world still bleeds',
  'you walk out alive. few have.',
  'carry this fire. others may follow.',
];
// Boss intro cinematic — delay gameplay briefly when entering a boss room
let bossIntroTime = 0;                // ticks down from ~2.2s while intro plays
// Total duration for the active boss intro. 2.2s on first sight; 1.3s
// on repeat. Mirrors the floorCardTotal pattern — the timer needs to
// stay in sync with the CSS animation length picked by bossIntroDom.js.
let bossIntroTotal = 2.2;
// Whether the active boss intro is using the fast repeat-sighting variant.
// Routed to bossIntroDom.updateBossIntro every render frame.
let bossIntroFast = false;
let bossIntroBoss = null;             // reference to the boss for name display
let bossIntroStartedAt = 0;           // wall-clock timestamp — clamps intro at
                                       // 2.5s real-time even if the game pauses
                                       // mid-intro (previously the overlay got
                                       // stuck on screen until a full restart).
// Death ceremony — cinematic beat before summary UI appears
let deathCeremonyActive = false;
let deathCeremonyTime = 0;
let deathSummaryShown = false;
// First-run intro — track previous-frame active state so the tick loop
// can detect the cinematic's end (true→false edge) and resume the
// silenced biome music. The AWAKEN handler kills audio on intro start
// to leave the heartbeat alone; the resume needs to happen exactly
// once when the intro finishes.
let _wasIntroActive = false;
// First-death emotional-weight beat — only fires once per profile, when
// the player dies on their very first run. Holds "YOU HAVE FALLEN" on
// the red ceremony screen for an extra second, then fades the whole
// frame to pure black, THEN hands off to enterHamletCanvas (which
// brings up the keeper wake). Without this, the ceremony's text only
// gets ~0.9s of read time before the keeper's first letterbox bar
// snaps in and clobbers the moment. The fade-to-black gives the
// keeper wake a clean canvas to fade into instead of cutting from a
// red-saturated frame.
let _firstDeathFadeActive = false;
let _firstDeathFadeTime = 0;
const FIRST_DEATH_HOLD = 1.0;        // seconds: extra "YOU HAVE FALLEN" hold
const FIRST_DEATH_FADE = 1.2;        // seconds: red veil fading to pure black
const FIRST_DEATH_TOTAL = FIRST_DEATH_HOLD + FIRST_DEATH_FADE;
// Tab-title update throttle
let _lastTitleUpdateSec = -1;
// Pedestal/altar proximity hum timer + low-HP heartbeat timer
let _proximityHumT = 0;
let _heartbeatT = 0;
// Wizard-kit Sprint 3D UX cleanup — fusion banner moved to the rail.
// fusionBannerTime kept as a no-op timer (other code resets it during
// run start / death; ticker decays the value harmlessly). fusionBannerFusion
// removed entirely (not read anywhere now).
let fusionBannerTime = 0;
// Enemy codex banner — small "bestiary entry" card for first-time encounters.
// Queued by enemies.js via window.__pendingCodexEntry; we dequeue here and
// animate a top-center reveal. Multiple can be queued if a combat spawns
// several new types at once (rare, but handled).
// (Codex banner state removed — codex announcements now flow through
// the top-right notification rail via pushNotification({ kind: 'codex' }).
// See the __pendingCodexEntry handler in the tick.)
// Callback when Echo-of-Self dies — drop a pedestal with a relic from the
// past death's build as a "reclaim". Turns defeating your past self into a
// small but meaningful mechanical reward.
window.__onEchoDefeated = (echo) => {
  const build = echo.echoPastBuild || [];
  if (build.length === 0) return;
  // Pick a relic the hero doesn't already own, else fall back to first
  const unowned = build.filter(id => !equippedRelics.find(r => r.id === id) && RELIC_DEFS[id]);
  const relicId = unowned.length ? unowned[(Math.random() * unowned.length) | 0] : build[0];
  const relicDef = RELIC_DEFS[relicId];
  if (!relicDef) return;
  pushPedestal({
    x: echo.x, y: echo.y,
    relic: relicDef,
    tier: relicDef.tier || 'common',
    bonus: true,        // free drop, won't wipe sibling offers
  });
  // Dramatic feedback
  for (let k = 0; k < 18; k++) deathBurst(echo.x, echo.y - 8, '#c8d8ff');
  triggerScreenFlash('rgba(180, 200, 240, 0.25)', 0.4);
  shakeCamera(10, 0.3);
  synthChord(523, 1.0, 1.0);
  roomLabelText = '✦ RECLAIMED FROM THE ECHO ✦';
  roomLabelColor = '#c8d8ff';
  roomLabelTime = 2.5;
};

// Callback invoked by applyRelic when a fusion activates
window.__onFusionFormed = (fusion) => {
  // Wizard-kit Sprint 3D UX cleanup — fusion announcement routes to the
  // top-right rail (with kind: 'fusion' getting the FUSION FORGED header,
  // 4s life, amber tint). Was: centered manuscript banner with pulsing
  // icon, 3s, full-screen halo — stacked with the first-mythic banner
  // when both fired on the same pickup, creating unreadable visual
  // chaos. The non-blocking effects (audio, zoom, screen flash) stay —
  // they amplify the moment without claiming the screen.
  pushNotification({
    kind: 'fusion',
    title: fusion.name || 'Fusion',
    body: fusion.desc || '',
    tint: fusion.tint || '#ffb265',
    // First-ever discovery gets longer dwell so the player has time
    // to read it; repeat activations get standard 4s.
    life: fusion._firstDiscovery ? 6.0 : 4.0,
    header: fusion._firstDiscovery ? '— NEW FUSION DISCOVERED —' : '— FUSION FORGED —',
  });
  // Non-blocking effects amplify the moment without claiming the screen.
  synthChord(fusion._firstDiscovery ? 880 : 659, 1.0, fusion._firstDiscovery ? 1.2 : 0.8);
  if (fusion._firstDiscovery) {
    setTimeout(() => synthFanfare(1.0), 200);
  }
  pulseZoom(0.1, 0.6);
  triggerScreenFlash('rgba(180, 230, 255, 0.2)', 0.4);
  // Skip first_fusion tip — the rail entry IS the explanation now.
  // (Old code routed both an explanatory tip + a centered banner; the
  // tip became redundant once the banner moved to the same rail.)
};

// Suppressed: fusionBannerTime / fusionBannerFusion are kept as no-ops
// for backward compat with any save snapshot reset paths that zero
// them. Render block below skips entirely. Remove in a future cleanup
// once it's clear nothing else reads the names.

// MYTHIC: Coin of the Tyrant kill-chain reward. Called from enemies.js
// every 8th kill while the relic is owned. Drops a free common-tier
// relic on the floor at the kill position; walking onto it auto-applies
// like any other pedestal pickup.
window.__coinOfTyrantSpawnRelic = (x, y) => {
  // Roll one common relic. rollRelicOffer picks tier-weighted; on common
  // tier we just take whatever it returns and force a single result.
  // The dropped relic skips the magician-bias / theme-bias machinery —
  // it's a "free" pickup, not a strategic offer.
  const rolled = rollRelicOffer(1, 1);     // floor=1 → 100% common weight
  if (!rolled.length) return;
  pushPedestal({
    x, y,
    relic: rolled[0],
    tier: 'common',
    bonus: true,        // free drop, won't wipe sibling offers
  });
  // Brief flair — gold sparkle burst at the drop position so the player
  // sees the coin "fall" rather than just appearing on the floor.
  for (let k = 0; k < 12; k++) deathBurst(x, y, '#ffd070');
  for (let k = 0; k < 8; k++) sparkle(x + (Math.random() - 0.5) * 28, y + (Math.random() - 0.5) * 18, '#ffe5a0');
  try { synthPing(880, 0.32, 0.35); } catch (_e) {}
  try { synthClick(0.85, 0.55); } catch (_e) {}
};
// Boss phase-transition cinematic (fires when a boss enrages at 50% HP).
// First-encounter gating: full 1.6s banner with PHASE 2 title on first
// per-boss-type sighting, shorter 0.8s "flash + tag" on subsequent
// (since the player has already learned what enrage means). Captured
// at trigger time so the per-frame render stays lock-step.
let phaseIntroTime = 0;        // ticks down from 1.6s (first) or 0.8s (Nth)
let phaseIntroBoss = null;
let phaseIntroStartedAt = 0;   // wall-clock mark for stuck-overlay clamp
let phaseIntroIsFirstTime = false;

// ── Room reveal (camera arrival pan) ─────────────────────────────────
// Set in loadRoom for non-hamlet/non-start rooms; held for ~0.55s. While
// active, the followCamera call in the tick is overridden to point at
// the room center instead of the hero. After the timer expires, normal
// follow takes over and the camera lerps from center → hero, producing
// a brief "step into the space" pan. Decremented in real-time so it
// completes regardless of game-logic freeze (boss intro overlay, etc).
let _roomRevealTime = 0;
let _roomRevealCx = 0;
let _roomRevealCy = 0;
window.triggerBossPhaseIntro = (boss) => {
  if (!boss) return;
  phaseIntroIsFirstTime = isFirstTime('phase2', boss.type || 'unknown');
  phaseIntroTime = phaseIntroIsFirstTime ? 1.6 : 0.8;
  phaseIntroBoss = boss;
  phaseIntroStartedAt = performance.now();
  // Audio sting — was previously silent (audio review P0). The 1.6s/0.8s
  // letterbox + iframe grant fired with no audio at all, so the dramatic
  // beat where the boss's behavior changes had no sonic counterpart.
  // Descending dread synth + low thud for the first-time encounter; just
  // the thud for repeat phases. setMusicIntensity bumps the swell so
  // combat music grows with the threat.
  try {
    if (phaseIntroIsFirstTime) synthGloom(180, 1.0, 1.4);
    synthThud(60, 1.2, 0.4);
  } catch (_e) {}
  setMusicIntensity(1.0);
  // Visual escalation — comparison-vs-Hades-audit P0. Phase intro had
  // audio + iframes + behavior change, but no screen-level visual flash
  // signaling "the threat just escalated." Major-boss-third-phase is
  // the moment in every action game where the music swells AND the
  // screen reddens — it's the genre's strongest "watch out" cue.
  // Crimson screen flash at the moment of intro + a screen shake punch.
  // The phase-intro letterbox already provides the sustained focus
  // frame; this just adds the visceral kick at trigger time.
  try {
    triggerScreenFlash('rgba(220, 60, 70, 0.28)', 0.55);
    shakeCamera(phaseIntroIsFirstTime ? 14 : 10, 0.35);
    // Subtle held-zoom that releases over the intro duration —
    // mirrors the boss-intro entry rhythm (room reveals, threat
    // amplifies, then combat resumes). Smaller than boss-entry
    // (0.10 → 0.07) so the second phase intro doesn't feel as
    // weighty as meeting the boss for the first time.
    pulseZoom(phaseIntroIsFirstTime ? 0.08 : 0.06, phaseIntroIsFirstTime ? 1.1 : 0.7);
  } catch (_e) {}
  // Same belt-and-suspenders as the boss-room entry intro: grant iframes
  // covering the phase-2 banner (full or short) plus the post-intro
  // buffer. The hero was already trading blows with the boss when it
  // enraged, so the vulnerability window without this is real — an
  // enemy swing in flight when phase fires would land the moment the
  // intro-freeze clears. Cap at 2.4s for the long banner; 1.6s for the
  // short one (still enough to cover the flash + clamp tail).
  hero.iframes = Math.max(hero.iframes || 0, phaseIntroIsFirstTime ? 2.4 : 1.6);
};

// Main menu — shown on page load
const menuEl = document.createElement('div');
// Painted backdrop (Nano Banana, Apr 2026) — cinematic ruined archway with
// torches and descending stair. UI overlays sit above dark areas at top
// (title crown) and bottom (cards + chrome). Fallback radial-gradient
// preserved in case the image fails to load.
menuEl.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:safe center;flex-direction:column;background:#050308 url(assets/menu/menu_backdrop.jpg) center/cover no-repeat;color:#ddd;pointer-events:auto;font-family:Georgia,"Cormorant Garamond",serif;padding:24px;box-sizing:border-box;overflow:hidden;';
menuEl.innerHTML = MENU_SCREEN_HTML;
document.getElementById('hud').appendChild(menuEl);

// Canvas hamlet ember overlay — separate top-level canvas drawn over the
// game canvas with mix-blend-mode:screen so it adds warm gold specks
// without clearing game content. The startMenuEmbers callback below
// returns this canvas when the canvas hamlet is active.
const canvasHamletEmbersEl = document.createElement('canvas');
canvasHamletEmbersEl.id = 'canvasHamletEmbers';
canvasHamletEmbersEl.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;mix-blend-mode:screen;opacity:0.55;z-index:5;';
document.body.appendChild(canvasHamletEmbersEl);

// Menu ember particle system — see src/menuEmbers.js. The callback tells
// the ember loop which canvas to draw to each frame (menu / canvas hamlet
// / none). Used to also branch to a DOM-hamlet ember canvas; the DOM
// hamlet was retired in the same pass that drops `hamletEl`.
startMenuEmbers(() => {
  if (menuEl.style.display !== 'none') return document.getElementById('menuEmbers');
  // Canvas hamlet — embers drawn on the dedicated top-level overlay canvas.
  if (typeof room !== 'undefined' && room?.kind === 'hamlet' && running) {
    return canvasHamletEmbersEl;
  }
  return null;
});

// Menu mode state — "standard" | "daily" | "tarot". Drives what BEGIN DESCENT does.
let menuMode = 'standard';

// Chip state synced with menuMode. Unified color language: ALL modes use gold,
// differentiated only by WEIGHT — selected is filled + bright, unselected is
// ghostly text. The CTA stays gold across modes (same anchor), but picks up a
// subtle tint shift so "what you're about to do" is still unambiguous.
function refreshMenuModeChips() {
  const chips = document.querySelectorAll('.menuModeChip');
  chips.forEach(c => {
    const mode = c.dataset.mode;
    const selected = mode === menuMode;
    if (selected) {
      c.style.background = 'linear-gradient(180deg,rgba(58,42,32,0.9),rgba(30,20,12,0.9))';
      c.style.color = '#f4d9a0';
      c.style.boxShadow = 'inset 0 0 0 1px #c9a86a, 0 0 14px rgba(201,168,106,0.35), inset 0 0 10px rgba(244,217,160,0.08)';
      c.style.textShadow = '0 0 8px rgba(244,217,160,0.5)';
      c.style.opacity = '1';
    } else {
      c.style.background = 'transparent';
      c.style.color = '#6a5c48';
      c.style.boxShadow = 'none';
      c.style.textShadow = 'none';
      c.style.opacity = '0.7';
    }
  });

  // CTA tint — all gold, but subtle temperature shift per mode so the active
  // mode is faintly readable even from the CTA alone. Kept tight so we don't
  // break the "one warm palette" discipline.
  const cta = document.getElementById('menuNewRunBtn');
  const halo = document.getElementById('menuCtaHalo');
  if (cta) {
    let bg = 'linear-gradient(180deg,#3a2a20,#1a0f08)';
    let shadow = 'inset 0 0 0 1px #c9a86a, 0 0 28px rgba(201,168,106,0.25), inset 0 0 14px rgba(244,217,160,0.08)';
    let haloColor = 'rgba(201,168,106,0.18)';
    if (menuMode === 'daily') {
      // Slightly cooler gold — pre-dawn
      bg = 'linear-gradient(180deg,#322820,#180f08)';
      shadow = 'inset 0 0 0 1px #c9a86a, 0 0 30px rgba(201,168,106,0.30), inset 0 0 14px rgba(220,200,140,0.10)';
      haloColor = 'rgba(201,168,106,0.22)';
    } else if (menuMode === 'tarot') {
      // Warmer gold — candlelit
      bg = 'linear-gradient(180deg,#3e2c1c,#1c100a)';
      shadow = 'inset 0 0 0 1px #e8c080, 0 0 32px rgba(232,192,128,0.38), inset 0 0 14px rgba(255,220,160,0.12)';
      haloColor = 'rgba(232,192,128,0.28)';
    }
    cta.style.background = bg;
    cta.style.color = '#f4d9a0';
    cta.style.boxShadow = shadow;
    if (halo) halo.style.background = `radial-gradient(ellipse at center, ${haloColor}, transparent 70%)`;
  }

  // Mode hint — same gold as everything else, just italic/faded.
  const hintEl = document.getElementById('menuModeHint');
  if (hintEl) {
    let hint = '';
    if (menuMode === 'daily') {
      const c = getTodayChallenge();
      const streakText = daily.streak > 0 ? ` \u00b7 ${daily.streak}-day streak` : '';
      const doneText = hasCompletedToday() ? ' \u00b7 done today' : '';
      hint = `today's rite: ${c.curseName.toLowerCase()} + ${c.relicName.toLowerCase()}${streakText}${doneText}`;
    } else if (menuMode === 'tarot') {
      hint = 'three cards drawn before descent shape your fate';
    }
    hintEl.textContent = hint;
    hintEl.style.opacity = hint ? '0.75' : '0';
  }
}

document.querySelectorAll('.menuModeChip').forEach(chip => {
  chip.addEventListener('click', () => {
    menuMode = chip.dataset.mode;
    refreshMenuModeChips();
  });
});

// Wire the RESUME card — applies the snapshot and enters the saved floor.
document.getElementById('menuResumeBtn').addEventListener('click', () => {
  const snap = loadRunSnapshot();
  if (!snap) return;
  resumeRun(snap);
});

// Shared "begin the descent" routing — consumes the currently-selected menu
// mode (standard / daily / tarot). Previously only the main-menu BEGIN
// DESCENT button called this; now the in-hamlet descent portal calls it
// too, so the player enters the hamlet first, picks mode/ascension there,
// and steps into the portal to actually start the run.
function beginDescent() {
  if (menuMode === 'tarot') {
    drawTarotHand(3);
    showTarotReveal();
    return;
  }
  if (menuMode === 'daily') {
    daily.activeForRun = true;
    showTip('first_daily');
  }
  // Phase 4 unification — `beginDescent` now drops the player into the
  // canonical 5-zone progression (ruins → cemetery → crypt → mountain →
  // volcano) instead of the legacy DAG floor system. Weapon picker still
  // gates IF multi-weapon is available; on confirm, picker invokes
  // beginCanonicalDescent() (added below) to enter ruins.
  if (availableWeapons().length > 1) showWeaponPicker();
  else { hideAllOverlays(); beginCanonicalDescent(); }
}

// Phase 4 unification entry point — wraps enterCanonicalRun so call sites
// (menu CTA, beginDescent, weapon picker confirm) have a single helper to
// invoke. Also handles the small bookkeeping: clear any open overlays,
// hide the menu, mark `running = true` so the tick loop drives the world.
function beginCanonicalDescent(zoneName = 'ruins') {
  hideAllOverlays();
  if (menuEl) menuEl.style.display = 'none';
  running = true;
  hero.state = 'idle';
  hero.hp = hero.maxHp || 8;
  // Stop the menu / hamlet ambient pad — zone profile will start its
  // own track via applyZoneProfile() inside enterCanonicalRun.
  try { stopAmbientPad(); } catch (_e) {}
  enterCanonicalRun(zoneName);
}

document.getElementById('menuNewRunBtn').addEventListener('click', () => {
  // FIRST-EVER AWAKEN — drop the player straight into floor 1 with the
  // intro cinematic playing over their first room. The Keeper wake (and
  // the hamlet introduction itself) is now earned on first DEATH, not
  // pre-loaded as exposition. Restructure ported from ethera (intro.js
  // owns the overlay; the death-bypass below routes the first death to
  // enterHamletCanvas which plays the keeper wake on its own gate).
  //
  // Double-click guard — bug-hunter audit P0. The button has no debounce,
  // so a fast double-click would run startRun() / startIntro() / stopMusic()
  // twice, double-applying memory effects and resetting the intro timer to
  // zero mid-cinematic. Hide the menu synchronously before mutating state;
  // the second click hits a hidden menu and bails.
  if (menuEl.style.display === 'none') return;
  menuEl.style.display = 'none';
  // Use a SEPARATE gate ('intro:heartbeat') for the cinematic, distinct
  // from 'hamlet:wake' (which gates the keeper wake fired on first
  // death). Without separate gates, marking the intro as seen here
  // would also skip the keeper wake on first death — they need to fire
  // independently on the first run.
  const firstTime = !hasSeen('intro', 'heartbeat');
  if (firstTime) {
    hideAllOverlays();
    // Mark the intro-gate satisfied at the START of the first run, NOT
    // after the cinematic completes. Without this, a player who
    // reloads mid-floor-1 would re-enter the menu, click AWAKEN, and
    // get a duplicate intro cinematic on top of their resumed run.
    markSeen('intro', 'heartbeat');
    // Phase 4 unification — first-time players also drop into the
    // canonical 5-zone progression (ruins) instead of the legacy DAG.
    beginCanonicalDescent('ruins');
    // Suppress the floor card — the intro overlay owns the screen for
    // the next 28s. The floor-card "FLOOR I — THE UNDERCROFT" reveal
    // is what the intro IS doing thematically; running both would
    // double-up the cinematic.
    floorCardTime = 0;
    floorCardStartedAt = 0;
    startIntro();       // overlay heartbeat + text on top of the live world
    // Silence everything underneath the cinematic — startRun -> loadRoom
    // already fired playTrack('crypt') for floor 1, and the menu pad
    // is still running from the title screen. The heartbeat is the
    // ONLY thing the player should hear during the intro. Tick loop
    // will resume the biome track when the cinematic ends.
    //
    // stopMusic (not playTrack(null)) is critical here — playTrack
    // pauses all tracks but leaves `current` set to 'crypt', which
    // would make our subsequent end-of-intro playTrack('crypt')
    // resume call no-op via the `current === name` guard. stopMusic
    // explicitly nulls `current` so the resume actually fires.
    stopAmbientPad();
    stopMusic();
    return;
  }
  // Returning player — standard flow: hamlet hub, descend via portal.
  showHamlet();
});
document.getElementById('menuMetaBtn').addEventListener('click', () => {
  // "SANCTUARY" card now routes into the Living Hamlet hub; the Keeper NPC
  // is the one who actually holds the essence shop, so players discover
  // meta-upgrades through the hamlet rather than a flat modal.
  showHamlet();
});
document.getElementById('menuMemoryBtn').addEventListener('click', () => {
  showMemoryModal();
});
document.getElementById('menuVolumeBtn').addEventListener('click', () => {
  showVolumesModal();
});
document.getElementById('menuCursesBtn').addEventListener('click', () => {
  showCursesModal();
});
document.getElementById('menuAchBtn')?.addEventListener('click', () => {
  showAchievementsModal();
});
// New primary access points for the two secondary actions (hamlet + chronicles)
// replacing the old plaque-style meta cards. The old buttons still exist as
// hidden compat shells, so the click handlers above continue to work — these
// two just route to the same targets through visible text links.
document.getElementById('menuHamletLink')?.addEventListener('click', () => {
  showHamlet();
});
document.getElementById('menuChroniclesLink')?.addEventListener('click', () => {
  showAchievementsModal();
});
document.getElementById('menuSettingsBtn')?.addEventListener('click', () => {
  showSettingsModal();
});
// Credits link → in-game attribution modal. Created lazily on first click
// so we don't pay the DOM cost for a rarely-opened screen at boot.
let creditsEl = null;
let controlsEl = null;
// Phase 2 audit fix #6 — single-modal-at-a-time enforcement for the
// "info" modal family (controls + credits). Both are full-screen
// z-index:30 overlays opened from the menu; nothing in the original
// show functions closed the other before opening, so a programmatic
// path could stack them and the close button would only catch the
// topmost. Now every show* helper closes any currently-displayed info
// modal first, and the Esc key reaches them when the game isn't
// running (the regular Esc-pause guard returns early on `!running`).
function hideAllInfoModals() {
  if (creditsEl) creditsEl.style.display = 'none';
  if (controlsEl) controlsEl.style.display = 'none';
}
function isAnyInfoModalOpen() {
  return (creditsEl && creditsEl.style.display !== 'none')
      || (controlsEl && controlsEl.style.display !== 'none');
}
function showCredits() {
  hideAllInfoModals();
  if (!creditsEl) {
    creditsEl = document.createElement('div');
    creditsEl.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,#140a18 0%,#0a0610 65%,#050308 100%);color:#ddd;pointer-events:auto;font-family:Georgia,"Cormorant Garamond",serif;padding:24px;box-sizing:border-box;z-index:30;animation:modalFadeIn 0.22s ease-out;';
    creditsEl.innerHTML = CREDITS_SCREEN_HTML;
    document.getElementById('hud').appendChild(creditsEl);
    creditsEl.querySelector('#creditsCloseBtn')?.addEventListener('click', () => {
      creditsEl.style.display = 'none';
    });
  }
  creditsEl.style.display = 'flex';
}
document.getElementById('menuCreditsLink')?.addEventListener('click', showCredits);
// How-to-play link → single-reference primer modal. Same lazy-create pattern.
function showControls() {
  hideAllInfoModals();
  if (!controlsEl) {
    controlsEl = document.createElement('div');
    controlsEl.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,#140a18 0%,#0a0610 65%,#050308 100%);color:#ddd;pointer-events:auto;font-family:Georgia,"Cormorant Garamond",serif;padding:24px;box-sizing:border-box;z-index:30;animation:modalFadeIn 0.22s ease-out;';
    controlsEl.innerHTML = CONTROLS_SCREEN_HTML;
    document.getElementById('hud').appendChild(controlsEl);
    controlsEl.querySelector('#controlsCloseBtn')?.addEventListener('click', () => {
      controlsEl.style.display = 'none';
    });
  }
  controlsEl.style.display = 'flex';
}
document.getElementById('menuControlsLink')?.addEventListener('click', showControls);
// Esc-to-close for info modals. Mounted at module load (separate from the
// game-running Esc handler at ~line 2157, which returns early on !running
// and so never reached menu-opened modals). Stops propagation so the
// game-running handler doesn't ALSO process the same Esc.
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape') return;
  if (!isAnyInfoModalOpen()) return;
  hideAllInfoModals();
  e.preventDefault();
  e.stopPropagation();
}, true);    // capture phase so we beat the game-pause handler

// Relic-choice modal — capture-phase handler so its keys (←/→ for
// nav, E/Enter to take, Esc to back out) beat the world input
// handlers below. R for reroll falls through to the existing
// pedestal-reroll handler at line ~2258 (gold cost + spawn fresh
// offers); the modal's clearModal+requestModal in the reroll
// branch refreshes the visible cards.
window.addEventListener('keydown', (e) => {
  if (!isRelicChoiceModalFullyOpen()) return;
  const handled = handleRelicChoiceModalKey(e.code);
  if (handled) {
    e.preventDefault();
    e.stopPropagation();
  }
}, true);

// Mouse-click into a modal card commits the pick. Capture phase so it
// runs before the world's pointerdown handlers (which would otherwise
// fire LMB attack on the same frame). Mouse-move updates the modal's
// hover-card highlight.
window.addEventListener('pointerdown', (e) => {
  if (!isRelicChoiceModalFullyOpen()) return;
  if (e.button !== 0 && e.pointerType === 'mouse') return;     // LMB / touch only
  // Convert client coords to canvas pixels using the same math as input.js
  const c = document.querySelector('canvas');
  if (!c) return;
  const r = c.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return;
  const mx = (e.clientX - r.left) * (c.width / r.width);
  const my = (e.clientY - r.top) * (c.height / r.height);
  if (handleRelicChoiceModalClick(mx, my, c.width, c.height)) {
    e.preventDefault();
    e.stopPropagation();
  }
}, true);
window.addEventListener('pointermove', (e) => {
  if (!isRelicChoiceModalFullyOpen()) return;
  const c = document.querySelector('canvas');
  if (!c) return;
  const r = c.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return;
  const mx = (e.clientX - r.left) * (c.width / r.width);
  const my = (e.clientY - r.top) * (c.height / r.height);
  handleRelicChoiceModalMouseMove(mx, my, c.width, c.height);
});

// Ascension selector — show only if the player has unlocked at least tier 1
// (i.e. has ever cleared floor 4). Clicking cycles current → next unlocked
// → wraps back to 0. Hint line updates to describe the active tier's rule.
function refreshAscensionUI() {
  const row = document.getElementById('menuAscensionRow');
  const btn = document.getElementById('menuAscensionBtn');
  const hint = document.getElementById('menuAscensionHint');
  if (!row || !btn || !hint) return;
  const unlocked = getUnlockedTier();
  if (unlocked <= 0) { row.style.display = 'none'; hint.textContent = ''; return; }
  row.style.display = 'flex';
  const t = getAscensionTier();
  const def = ASCENSION_TIERS[t];
  btn.textContent = t === 0 ? 'STANDARD' : `ASCENSION ${['I','II','III','IV','V','VI','VII','VIII','IX','X'][t - 1] || t}`;
  // Tier 0 dim gold; higher tiers warmer. Visual weight of the climb.
  btn.style.color = t === 0 ? '#8a7a5a' : t >= 4 ? '#f4d9a0' : '#c9a86a';
  btn.style.opacity = t === 0 ? '0.7' : '1';
  hint.textContent = def.rule ? `\u2022 ${def.rule} \u2022 +${Math.round((def.essenceMul - 1) * 100)}% essence` : '';
}
document.getElementById('menuAscensionBtn')?.addEventListener('click', () => {
  const unlocked = getUnlockedTier();
  const cur = getAscensionTier();
  const next = (cur + 1) > unlocked ? 0 : cur + 1;
  setAscensionTier(next);
  refreshAscensionUI();
});
refreshAscensionUI();

// First-run welcome nudge — a player who has never opened the game before
// gets the how-to-play primer auto-opened once. Returning players with
// the seen-welcome flag are not disturbed. Falls back to no-op if
// localStorage is blocked.
//
// Note: profile.js patches localStorage to prefix keys with the active
// profile slot (e.g. 'ethera:seen_welcome:v1' becomes
// 'profile_i:ethera:seen_welcome:v1' in raw storage). We use
// localStorage.getItem which goes through the patched accessor so the
// prefix is handled automatically.
(function firstRunNudge() {
  try {
    if (localStorage.getItem('ethera:seen_welcome:v1')) return;
    // Mark the flag immediately, not on timer callback, so a fast
    // reload during the 900ms settle delay doesn't re-trigger it.
    try { localStorage.setItem('ethera:seen_welcome:v1', '1'); } catch (_) {}
    setTimeout(() => {
      // Skip if the player already clicked PLAY in the 900ms window —
      // the controls modal would otherwise stack on top of the wake
      // cinematic (or whatever entered state replaced the menu),
      // double-binding the player's input. Audit fix: gate on the
      // menu still being the visible overlay.
      if (menuEl.style.display !== 'flex') return;
      if (keeperWakeEl && keeperWakeEl.style.display === 'flex') return;
      showControls();
    }, 900);
  } catch (_) {
    // Storage-blocked path (Safari private mode etc.) — just skip the nudge.
  }
})();

// Initial state — sets chip highlight + CTA tint
refreshMenuModeChips();

// TAROT REVEAL — extracted to src/modals/tarotRevealModal.js (Round-7
// Sprint B). main.js retains the wrapper to preserve the
// hideAllOverlays-before-show contract + wire onBegin (start the run)
// and onBack (clear the drawn hand + return to menu) callbacks.
setTarotOnBegin(() => {
  // Phase 4 unification — tarot-mode confirm routes to canonical zone run.
  beginCanonicalDescent('ruins');
});
setTarotOnBack(() => {
  clearTarot();
  menuEl.style.display = 'flex';
});
function showTarotReveal() {
  hideAllOverlays();
  _showTarotRevealModal();
}

// Settings modal — extracted to src/modals/settingsModal.js (Round-7
// Sprint B). main.js retains the wrapper to preserve the
// hideAllOverlays-before-show contract + restore the main menu on close.
setSettingsOnClose(() => {
  menuEl.style.display = 'flex';
});
function showSettingsModal() {
  hideAllOverlays();
  _showSettingsModal();
}

// ============================================================================
// LIVING HAMLET - hub screen between main menu and descent.
//
// Implementation: hamlet is a regular `room` with `kind: 'hamlet'` rendered
// through the standard canvas pipeline (see hamletScene.js + room.js).
// Entry: `showHamlet()` -> `enterHamletCanvas()` -> loadRoom(hamletRoom).
//
// HISTORY: this used to be a DOM overlay (`hamletEl`, ~120 LOC of innerHTML
// templating + CSS-in-JS) layered over the menu, with a painted JPG backdrop
// and absolute-positioned NPC <button>s. The canvas hamlet shipped multiple
// sessions ago and the DOM path was retired. The DOM block was kept around
// for one release as a fast-revert hatch; that window has long closed and
// the dead code was removed in this pass.
// ============================================================================

function showHamlet() {
  // Thin wrapper around enterHamletCanvas. The legacy DOM-overlay hamlet
  // path used to live inline here behind a `return;` and was kept as
  // unreachable code for one release as a fast revert if the canvas
  // hamlet turned up a blocker. The canvas hamlet has shipped multiple
  // sessions in production now — the dead DOM path is gone. NPC-arc
  // sweep + the first-hamlet onboarding tip live inside
  // enterHamletCanvas (first_descent_hint covers the canvas-specific
  // "walk to portal, press E" cue).
  enterHamletCanvas();
}

// CANVAS HAMLET ENTRY — Approach B. Feature-flagged via window.__canvasHamlet.
// Loads a hamlet-kind room, spawns the hero at the entrance tile, and hands
// control to the hamletScene module (world-positioned NPCs + descent portal +
// Watcher shrine). Dialogue still opens via the existing dialogueEl DOM
// overlay when the hero interacts with an NPC; starting a run still routes
// to the existing startRun() flow when the hero walks into the portal.
function enterHamletCanvas() {
  // FIRST-EVER HAMLET ENTRY runs the Keeper wake cinematic — see
  // playKeeperWake() further down for the full block of design notes.
  // Short version: the player wakes from unconsciousness; thematically
  // they should see DARKNESS first, then hear the Keeper's voice,
  // then the hamlet itself. So we hide all overlays first (menu's
  // gold UI must not bleed through the wake's vignette), play the
  // wake (heavy radial gradient covers whatever the canvas is
  // painting pre-hamlet), and the re-entry on dismiss runs the
  // regular hamlet setup which renders the painted scene + NPCs +
  // hero next to the Keeper (via _freshFromWake spawn override).
  //
  // Gate semantics: hasSeen check + markSeen-on-dismiss (not
  // isFirstTime up front) so closing the tab mid-cinematic does NOT
  // consume it — the player gets the wake on their next launch.
  if (!hasSeen('hamlet', 'wake')) {
    hideAllOverlays();
    playKeeperWake(() => {
      markSeen('hamlet', 'wake');
      // The Keeper has just spoken at length about the player; even
      // before the first proper dialogue she is no longer a stranger.
      // Pre-seed her familiarity counter to acquainted-tier (5+) so
      // the player's first walk-up dialogue starts at "an acquaintance"
      // and her first personal topic (the_name) is already unlocked.
      // This rewards the cinematic with immediately-visible UI depth.
      hamletState.npcFamiliarity = hamletState.npcFamiliarity || {};
      if ((hamletState.npcFamiliarity.keeper | 0) < 5) {
        hamletState.npcFamiliarity.keeper = 5;
      }
      // Stamp a recent visit so the longAbsence reactive greeting
      // doesn't fire on the player's very next walk-up to her.
      hamletState.npcLastVisit = hamletState.npcLastVisit || {};
      hamletState.npcLastVisit.keeper = Date.now();
      saveHamletState();
      // One-shot flag — spawn override fires on the immediate
      // re-entry below so the hero appears next to the Keeper.
      _freshFromWake = true;
      enterHamletCanvas();
    });
    return;
  }

  // Capture _freshFromWake BEFORE the spawn block at line ~1215 resets
  // it. The bell-toll check below needs the original value, not the
  // post-spawn reset value, otherwise the wake-cinematic re-entry
  // would ring a bell on top of the wake's own audio.
  const _bellWasFreshFromWake = _freshFromWake;

  hideAllOverlays();
  startAmbientPad('hamlet');
  refreshNpcPresence(records, stats, { seenRelicIds });
  for (const id of ALL_NPC_IDS) {
    if (hamletState.npcArcStage[id] !== undefined) tryAdvanceArc(id);
  }

  // Build the hamlet room and slot it as floor[0]. The standard render +
  // camera pipeline consumes `room` / `floor[roomIndex]` without special
  // knowledge of the hamlet kind beyond the drawRoom branch in room.js.
  floor = [{
    kind: 'hamlet',
    pillarTemplate: 0,
    spawns: [],
    cleared: true,
    doors: { north: false, south: false },
  }];
  roomIndex = 0;
  buildRoomFromData(floor[0]);

  // Purge any transient combat state from a prior session (enemies, bullets,
  // pedestals, flame hazards, transitions, intro timers, pickup banner).
  // The hamlet is a non-combat room — nothing should carry over. Without
  // suppressPickupFlash a banner in flight when the player dies or quits
  // will animate over the hamlet on return (audit quick-win).
  clearEnemies();
  clearProjectiles();
  clearPedestals();
  clearFlames();
  clearEmberRings();
  suppressPickupFlash();
  // Door-transition residue must be wiped explicitly — neither loadRoom
  // nor buildRoomFromData touches doorPan / prevRoom (they're owned by
  // the transition flow, not the room flow). Without this, a hero who
  // died mid-pan or quit-to-menu mid-pan keeps `doorPan` non-null;
  // isDoorPanActive() then freezes hero/enemies/projectiles indefinitely
  // on the next tick after hamlet entry. Same for prevRoom: a stale
  // dungeon snapshot would render at offset coords across the hamlet
  // for ~1.8s of life before tickPrevRoom self-cleared.
  doorPan = null;
  clearPrevRoom();
  transition = { active: false, phase: 'out', t: 0, toIndex: 0 };
  bossIntroTime = 0; bossIntroBoss = null; bossIntroStartedAt = 0;
  floorCardTime = 0;
  phaseIntroTime = 0; phaseIntroBoss = null; phaseIntroStartedAt = 0;
  // Death-ceremony residue — without this reset, a player who died,
  // clicked MAIN MENU, then re-entered hamlet would see the red
  // "YOU HAVE FALLEN" canvas overlay stuck on top of the hamlet (the
  // ceremony's draw path keys off `deathCeremonyActive`, which only
  // got reset by startRun / resumeRun, not by hamlet re-entry).
  deathCeremonyActive = false;
  deathCeremonyTime = 0;
  deathSummaryShown = false;
  // Same hygiene for the first-death fade beat. Hamlet-entry resets it
  // so the black overlay doesn't bleed across into the hamlet view.
  _firstDeathFadeActive = false;
  _firstDeathFadeTime = 0;
  // Drop any pending top-right rail entries — a relic picked up in the
  // last dungeon room shouldn't keep its notification visible across
  // the hamlet transition.
  clearNotifications();

  // Spawn the hero at the hamlet entrance and snap the camera so there's no
  // lerp-in from wherever they last were. EXCEPTION: if this entry is
  // the one immediately following the Keeper wake cinematic, spawn the
  // hero next to the Keeper (her painted position is ~820, 600) so the
  // "I pulled you up the stairs" framing has visual continuity — the
  // player wakes up next to her, not down at the southern entrance.
  if (_freshFromWake) {
    _freshFromWake = false;
    hero.x = 790;
    hero.y = 660;
  } else {
    hero.x = HAMLET_HERO_SPAWN.x;
    hero.y = HAMLET_HERO_SPAWN.y;
  }
  hero.state = 'idle';
  hero.stateTime = 0;
  hero.vx = 0; hero.vy = 0;
  hero.iframes = 0;
  // Snap camera to spawn-aware initial position with HAMLET_ZOOM clamps.
  // World is 1376×768; clamps keep the (1280/zoom)×(720/zoom) view inside.
  camera.zoom = HAMLET_ZOOM;
  camera.x = Math.max(366, Math.min(1010, hero.x));
  camera.y = Math.max(206, Math.min(562, hero.y));
  camera.targetX = camera.x;
  camera.targetY = camera.y;
  // Disable ambient zoom breathe in hamlet — the ±0.6% sin oscillation
  // in updateCamera causes visible tile-edge shimmer on the pixel-art
  // tilemap (each frame the canvas scales slightly, snapping pixels to
  // different positions with imageSmoothingEnabled = false). Re-enabled
  // in startRun() for combat where the "living camera" feel is wanted.
  camera.breatheEnabled = false;
  // Reset any zoom pulse residue from a prior dungeon run, then re-apply
  // HAMLET_ZOOM (centralized constant from hamletScene.js — 1.75 gives
  // hero/NPCs proper visual scale against the painted backdrop).
  camera.zoomPulseAmt = 0;
  camera.zoomPulseTime = 0;
  camera.zoom = HAMLET_ZOOM;

  // Onboarding — first canvas-hamlet entry tells the player the goal
  // (find the portal, press E). Once-per-player via the seen-set in
  // tips.js so re-entry between runs doesn't repeat it.
  setTimeout(() => showTip('first_descent_hint'), 800);

  // Bell-toll on hamlet entry — distant low chord that lands ~600ms
  // after the hamlet is on screen. Reads as a place welcoming the
  // returning player. Suppressed on the first-ever entry (the keeper
  // wake cinematic owns its own audio space) and on rapid re-entry
  // within 20s (e.g. the player popped a modal then closed it — the
  // bell shouldn't ring twice for one continuous "visit").
  const _now = Date.now();
  const _lastBellAt = window.__hamletBellAt || 0;
  const _bellCooldownMs = 20_000;
  // Use the captured fresh-from-wake value (NOT the live _freshFromWake,
  // which is reset by the spawn block above). Without this capture, the
  // wake-cinematic re-entry would ring the bell on top of the wake's own
  // audio.
  if (!_bellWasFreshFromWake && _now - _lastBellAt > _bellCooldownMs) {
    window.__hamletBellAt = _now;
    setTimeout(() => {
      // Audit fix: gate at fire time on still-in-hamlet. Without this,
      // a player who descends into the dungeon within 600ms hears a
      // hamlet bell ring while they're already fighting on F1. Cheap
      // string check, no hidden state.
      if (room.kind !== 'hamlet') return;
      try {
        // Two slightly detuned tones rung 90ms apart for a deeper bell
        // overtone. Volumes kept low — atmospheric, not announcement.
        synthChord(196, 1.6, 0.55);          // G3 root
        // Inner timer for the second tone — fires 90ms later, well
        // within one frame. No additional gate needed (90ms is too
        // short for a meaningful state transition).
        setTimeout(() => synthChord(294, 1.4, 0.40), 90);  // D4 fifth
      } catch (_e) {}
    }, 600);
  }

  running = true;
  paused = false;
}


// ============================================================================
// DIALOGUE PANEL — overlay that opens when the player clicks an NPC. Shows
// the current arc stage's text, a SERVICE button (routes to meta shop /
// memory codex / reforge), and a CLOSE button.
// ============================================================================
const dialogueEl = document.createElement('div');
dialogueEl.style.cssText = `
  position:absolute;inset:0;display:none;align-items:center;justify-content:center;
  background:rgba(4,2,8,0.7);color:#ddd;pointer-events:auto;font-family:Georgia,"Cormorant Garamond",serif;
  z-index:20;backdrop-filter:blur(2px);
`;
dialogueEl.innerHTML = `
  <div id="dialoguePanel" style="
    max-width:880px;width:96%;
    display:grid;
    grid-template-columns:1fr 220px;
    gap:0;
    background:linear-gradient(180deg, rgba(24,18,14,0.97), rgba(12,8,10,0.98));
    box-shadow:0 0 30px rgba(0,0,0,0.9), inset 0 0 0 1px rgba(201,168,106,0.4), inset 0 0 18px rgba(0,0,0,0.5);
    position:relative;
    animation:modalFadeIn 0.3s ease-out;
  ">
    <!-- LEFT COLUMN: portrait + name + body + action buttons -->
    <div style="padding:24px 28px;display:flex;flex-direction:column;min-width:0;">
      <!-- Top row: portrait + name -->
      <!-- Header: NPC name + subtitle. Portrait removed (was a circular
           crop of the v2 sprite, but the head-zoom never landed cleanly
           across the varied aspect ratios — pixel-art crops at this size
           read as muddy rather than evocative). The name typography
           carries the identity. -->
      <div style="margin-bottom:14px;">
        <div id="dialogueName" style="font-size:22px;letter-spacing:5px;color:#f4d9a0;font-weight:400;margin-bottom:2px;"></div>
        <div id="dialogueTitle" style="font-size:11px;letter-spacing:3px;font-style:italic;opacity:0.6;"></div>
      </div>
      <!-- Gold hairline divider -->
      <div style="width:100%;height:1px;background:linear-gradient(90deg, transparent, rgba(201,168,106,0.45), transparent);margin-bottom:14px;"></div>
      <!-- Body: stage text -->
      <div id="dialogueText" style="font-size:14px;line-height:1.7;color:#d8cfae;margin-bottom:16px;min-height:120px;font-style:italic;flex:1;"></div>
      <!-- Service / speak / close buttons. SPEAK is the casual-chat path
           that cycles the NPC's chatLines without leaving the modal \u2014
           visually muted (text-link style) so the SERVICE button stays
           the primary action. -->
      <div style="display:flex;gap:12px;justify-content:flex-end;align-items:center;flex-wrap:wrap;">
        <button id="dialogueSpeakBtn" style="background:transparent;color:#a89060;border:1px solid rgba(168,144,96,0.4);padding:8px 16px;font-size:11px;cursor:pointer;letter-spacing:4px;font-family:Georgia,serif;font-style:italic;transition:all 0.2s ease;">SPEAK</button>
        <button id="dialogueServiceBtn" style="background:linear-gradient(180deg,#3a2a20,#1a0f08);color:#f4d9a0;border:0;padding:11px 24px;cursor:pointer;letter-spacing:4px;font-family:Georgia,serif;font-size:12px;font-weight:bold;box-shadow:inset 0 0 0 1px #c9a86a, 0 0 14px rgba(201,168,106,0.25);transition:all 0.2s ease;">SERVICE</button>
        <button id="dialogueCloseBtn" style="background:transparent;color:#8a7a6a;border:0;padding:8px 14px;font-size:11px;cursor:pointer;letter-spacing:4px;font-family:Georgia,serif;font-style:italic;transition:all 0.2s ease;">\u2190 FAREWELL</button>
      </div>
    </div>
    <!-- RIGHT COLUMN: numbered topic list (Morrowind / CRPG style).
         Click a topic OR press the matching number key (1-9) to ask.
         Empty (display:none) when the NPC has no topics. -->
    <div id="dialogueTopics" style="display:none;flex-direction:column;gap:4px;padding:24px 22px 24px 18px;border-left:1px solid rgba(201,168,106,0.22);background:linear-gradient(90deg, rgba(0,0,0,0.18), transparent);">
      <div style="font-size:9px;letter-spacing:4px;color:#c9a86a;font-weight:bold;opacity:0.65;margin-bottom:8px;text-align:center;">\u2014 ASK ABOUT \u2014</div>
    </div>
  </div>
`;
document.getElementById('hud').appendChild(dialogueEl);
document.getElementById('dialogueCloseBtn').addEventListener('click', () => {
  // Quiet click feedback so closing the modal feels as tactile as
  // opening it. Pitch slightly lower than SPEAK / topic-chip clicks
  // so the close reads as "step back" rather than "discover."
  try { synthClick(0.9, 0.25); } catch (_e) {}
  dialogueEl.style.display = 'none';
});
// Click-outside-to-close — backdrop dismiss is the standard modal
// idiom; players try it instinctively. Without this, they hunt for
// FAREWELL or hit Esc. Only fires when the click target is the
// backdrop itself (not the inner panel) to avoid swallowing button
// or chip clicks that bubble up.
dialogueEl.addEventListener('click', (e) => {
  if (e.target === dialogueEl) {
    try { synthClick(0.9, 0.22); } catch (_e) {}
    dialogueEl.style.display = 'none';
  }
});
// Keyboard shortcuts — 1-9 select numbered topic chips while the
// dialogue is open. Matches the CRPG/Morrowind affordance the
// vertical numbered list implies. Captures on document so input.js's
// in-game number-key handlers (none today, but defensive) don't
// double-fire. The click() call drives the same path as a mouse
// click — including click sfx + body swap + seen-state update.
document.addEventListener('keydown', (e) => {
  if (dialogueEl.style.display === 'none') return;
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  // Digit row only — Digit1..Digit9 maps to index 1..9.
  if (!/^Digit[1-9]$/.test(e.code)) return;
  const idx = parseInt(e.code.slice(5), 10);
  const chip = document.querySelector(`#dialogueTopics .dialogueTopicChip[data-topic-index="${idx}"]`);
  if (chip) {
    e.preventDefault();
    chip.click();
  }
}, true);
document.getElementById('dialogueCloseBtn').addEventListener('mouseenter', (e) => {
  e.target.style.color = '#ff9a9a';
  e.target.style.textShadow = '0 0 10px rgba(216,128,128,0.5)';
});
document.getElementById('dialogueCloseBtn').addEventListener('mouseleave', (e) => {
  e.target.style.color = '#8a7a6a';
  e.target.style.textShadow = 'none';
});
// SPEAK button — casual chat. Click cycles to the next chatLine via
// getNextChatLine(npcId), replacing the body text with that single line
// rendered in slightly more conversational typography. The current NPC
// id is stashed on the modal element when openDialogue runs.
document.getElementById('dialogueSpeakBtn').addEventListener('click', () => {
  const npcId = dialogueEl.dataset.npcId;
  if (!npcId) return;
  const def = NPCS[npcId];
  if (!def) return;
  const line = getNextChatLine(npcId);
  if (!line) return;
  // Soft click feedback - same synthClick the topic chips use, slightly
  // muted so the SPEAK button reads as a quieter "they're chatting"
  // beat vs. the SERVICE button's louder commit click.
  try { synthClick(1.05, 0.32); } catch (_e) {}
  // Replace body with the chat line. Use a different visual register -
  // a single-line cream paragraph with an italic dash before, signalling
  // "this is the NPC speaking now," distinct from the multi-paragraph
  // arc-stage flavor. Build via createElement + textContent so the line
  // string stays inert text (matches the same defensive pattern the
  // topic-answer + dialogue-body paths use).
  const textEl = document.getElementById('dialogueText');
  textEl.innerHTML = '';
  const p = document.createElement('p');
  p.style.cssText = `margin:0;line-height:1.7;font-style:italic;color:${def.tint || '#d8cfae'};`;
  const dash = document.createElement('span');
  dash.style.cssText = 'opacity:0.6;margin-right:8px;';
  dash.textContent = '—';
  p.appendChild(dash);
  p.appendChild(document.createTextNode(line));
  textEl.appendChild(p);
});
document.getElementById('dialogueSpeakBtn').addEventListener('mouseenter', (e) => {
  e.target.style.color = '#f4d9a0';
  e.target.style.borderColor = 'rgba(244,217,160,0.7)';
  e.target.style.background = 'rgba(244,217,160,0.06)';
});
document.getElementById('dialogueSpeakBtn').addEventListener('mouseleave', (e) => {
  e.target.style.color = '#a89060';
  e.target.style.borderColor = 'rgba(168,144,96,0.4)';
  e.target.style.background = 'transparent';
});

// ─── Sanctuary Shrine modal ──────────────────────────────────────────────
// The meta-progression shop. Used to live on the death screen; moved
// here as part of the "death = a moment, hamlet = the place" split.
// Players walk to the shrine in the hamlet (north slab, the painted
// altar prop) and press E to open this modal — same pattern as
// dialogue with NPCs, just without the conversation chrome.
//
// Reuses the existing renderMetaShop function (which now takes a
// container ID parameter). All purchase logic — first-purchase
// celebration, row-burst animation, audio cues — works unchanged.
const shrineEl = document.createElement('div');
shrineEl.style.cssText = `
  position:absolute;inset:0;display:none;align-items:center;justify-content:center;
  background:rgba(4,2,8,0.78);color:#ddd;pointer-events:auto;font-family:Georgia,serif;
  z-index:20;backdrop-filter:blur(2px);
`;
shrineEl.innerHTML = `
  <div id="shrinePanel" style="
    max-width:760px;width:92%;
    padding:30px 38px 24px;
    background:linear-gradient(180deg,rgba(20,12,28,0.97),rgba(8,4,12,0.99));
    box-shadow:0 0 32px rgba(0,0,0,0.9), inset 0 0 0 1px rgba(160,232,255,0.35), inset 0 0 18px rgba(0,0,0,0.5);
    position:relative;
    animation:modalFadeIn 0.3s ease-out;
  ">
    <!-- Header — cyan ornament (sanctuary palette) -->
    <div style="display:flex;align-items:center;gap:14px;justify-content:center;margin-bottom:8px;opacity:0.9;">
      <div style="width:64px;height:1px;background:linear-gradient(90deg,transparent,#a0e8ff);"></div>
      <div style="color:#a0e8ff;font-size:11px;letter-spacing:5px;font-weight:bold;text-shadow:0 0 8px rgba(160,232,255,0.4);">✧ SANCTUARY OF THE ABYSS ✧</div>
      <div style="width:64px;height:1px;background:linear-gradient(90deg,#a0e8ff,transparent);"></div>
    </div>
    <!-- Flavor line -->
    <div style="text-align:center;font-size:11px;letter-spacing:3px;font-style:italic;color:rgba(216,207,174,0.65);margin-bottom:18px;">
      bind the essence you carry back from the depths.
    </div>
    <!-- Unlock list — populated by renderMetaShop('shrineUnlockRow') -->
    <div id="shrineUnlockRow"></div>
    <!-- Close hint + button row -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:18px;">
      <div style="font-size:9px;letter-spacing:3px;color:rgba(160,232,255,0.5);font-style:italic;">ESC OR E TO LEAVE</div>
      <button id="shrineCloseBtn" style="background:transparent;color:#8a7a6a;border:0;padding:8px 14px;font-size:11px;cursor:pointer;letter-spacing:4px;font-family:Georgia,serif;font-style:italic;transition:color 0.2s ease;">← LEAVE</button>
    </div>
  </div>
`;
document.getElementById('hud').appendChild(shrineEl);

document.getElementById('shrineCloseBtn').addEventListener('click', () => {
  try { synthClick(0.9, 0.25); } catch (_e) {}
  shrineEl.style.display = 'none';
});
document.getElementById('shrineCloseBtn').addEventListener('mouseenter', (e) => {
  e.target.style.color = '#a0e8ff';
});
document.getElementById('shrineCloseBtn').addEventListener('mouseleave', (e) => {
  e.target.style.color = '#8a7a6a';
});
// Click-outside-to-close — backdrop dismiss, same as dialogue.
shrineEl.addEventListener('click', (e) => {
  if (e.target === shrineEl) {
    try { synthClick(0.9, 0.22); } catch (_e) {}
    shrineEl.style.display = 'none';
  }
});

function showSanctuaryShrine() {
  shrineEl.style.display = 'flex';
  // Build the unlock list into shrineUnlockRow. Animate on first reveal.
  renderMetaShop(true, 'shrineUnlockRow');
}
// ESC + E both close the shrine while it's open.
window.addEventListener('keydown', (e) => {
  if (shrineEl.style.display !== 'flex') return;
  if (e.code === 'Escape' || e.code === 'KeyE') {
    e.preventDefault();
    try { synthClick(0.9, 0.22); } catch (_e) {}
    shrineEl.style.display = 'none';
  }
});

function openDialogue(npcId) {
  const def = NPCS[npcId];
  if (!def) return;
  const stage = hamletState.npcArcStage[npcId];
  if (stage === undefined) {
    // Defensive — locked NPCs can't reach openDialogue through the normal
    // flow anymore (drawHamletEntities filters them out → never become
    // _nearest → consumeHamletInteract never returns their id). The
    // previous fallback fired a "SHROUDED FIGURE" notification; that
    // language was retired with the placeholder, so falling through
    // silently is the right behavior. If this branch ever does fire,
    // it's a wiring bug — not a player-facing state.
    return;
  }
  const stageDef = def.arcStages[stage] || def.arcStages[def.arcStages.length - 1];
  // Stash current npc id on the modal so the persistent SPEAK click
  // handler (set up once at module load) knows which NPC to route to.
  dialogueEl.dataset.npcId = npcId;

  // ── DEPTH PASS — build the reactive context BEFORE any state writes
  // (greeting/preoccupation/visit-stamp). The greeting needs to read
  // the OLD lastVisit timestamp (for longAbsence detection) and the
  // OLD familiarity counter; the visit stamp + bump fire after the
  // body is composed.
  const ctx = { seenRelicIds };
  const greetCtx = buildGreetingContext(records, ctx);
  const greeting = resolveReactiveGreeting(npcId, greetCtx);
  const preoccupation = getCurrentPreoccupation(npcId, greetCtx);
  const familiarityLabel = getFamiliarityLabel(npcId);

  // Name + familiarity-aware title
  document.getElementById('dialogueName').textContent = def.name;
  document.getElementById('dialogueName').style.color = def.tint || '#f4d9a0';
  document.getElementById('dialogueName').style.textShadow = `0 0 10px ${def.tint || '#c9a86a'}66`;
  // Subtitle now layers the role title + the relationship status, so the
  // player can feel the relationship deepen as familiarity grows.
  const titleText = def.title ? `${def.title} · ${familiarityLabel}` : familiarityLabel;
  document.getElementById('dialogueTitle').textContent = titleText;
  // (Portrait removed) Previously rendered the v2 NPC sprite as a
  // circular head-zoom crop, but the result read as muddy across the
  // varied aspect ratios — the sprites are designed for in-world
  // 100-px rendering, not for tight 72-px circular portraits. The
  // name typography + the NPC's tint color carry the identity now.
  // Both the dialoguePortrait DOM node and the per-render image build
  // were removed; the loader still ships the v2 portraits in case we
  // revisit (e.g. larger headshot panels keyed off a portrait
  // re-render of just the head region).

  // Body — three layers, top to bottom:
  //   1. Reactive greeting (if a trigger fires) — prepended in NPC tint
  //      as a quoted italic line, sits as a "they noticed something"
  //      preface to the regular flavor.
  //   2. Preoccupation (every ~3rd visit) — a small italic "they are
  //      thinking about X" line, distinct visual register from greeting.
  //   3. ArcStage paragraphs (the existing flavor for this milestone).
  // Build body via createElement + .textContent so greeting/preoccupation/
  // arc-stage strings stay inert text. All current strings are author-
  // controlled, but matching the same defensive pattern the topic-click
  // path uses (commit 02a2797) closes a class of future XSS risk.
  const textEl = document.getElementById('dialogueText');
  const paras = Array.isArray(stageDef.text) ? stageDef.text : [stageDef.text];
  const tint = def.tint || '#c9a86a';
  textEl.innerHTML = '';
  if (greeting) {
    const gp = document.createElement('p');
    gp.style.cssText = `margin:0 0 14px;color:${tint};font-style:italic;line-height:1.55;font-size:13px;border-left:2px solid ${tint}77;padding-left:12px;opacity:0.95;`;
    gp.textContent = greeting;
    textEl.appendChild(gp);
  }
  if (preoccupation) {
    const pp = document.createElement('p');
    pp.style.cssText = 'margin:0 0 12px;color:#a89070;font-style:italic;font-size:11px;letter-spacing:0.3px;opacity:0.75;';
    pp.textContent = `— ${preoccupation}`;
    textEl.appendChild(pp);
  }
  for (const para of paras) {
    const p = document.createElement('p');
    p.style.cssText = 'margin:0 0 12px;';
    p.textContent = para;
    textEl.appendChild(p);
  }
  // Mark this stage as read — removes the unread dot on return.
  // Deferred 1.5s and re-checked: a player who pops the modal and
  // immediately Esc-closes shouldn't lose the unread cue without
  // having actually read the body. The dataset check guards against
  // a quick switch to a different NPC (dataset.npcId moves).
  setTimeout(() => {
    if (dialogueEl.style.display !== 'none'
        && dialogueEl.dataset.npcId === npcId) {
      markDialogueSeen(npcId);
    }
  }, 1500);
  // Bump familiarity + stamp visit. Done AFTER greeting + preoccupation
  // resolved so they see the OLD state.
  // Detect tier crossings BEFORE bump so we can fire a "we know each
  // other better now" beat - chord + delayed banner. Without this, the
  // tier transitions (stranger -> acquainted at 5, etc.) only surfaced
  // as a quietly-changed subtitle label; players didn't notice.
  const tierCrossing = nextBumpCrossesTier(npcId);
  bumpFamiliarity(npcId);
  stampVisit(npcId);
  if (tierCrossing) {
    // Warm chord at the crossing - same primitive the wake cinematic
    // uses, dropped to a lower volume so it lands as "moment" not
    // "event." Fires inside the dialogue modal so the player hears
    // it overlap with reading the greeting.
    try { synthChord(330, 0.5, 1.4); } catch (_e) {}
    // Brief banner after the modal closes - queued via setTimeout so
    // it doesn't compete with the modal text for attention. Reuses
    // the existing showTip channel so it auto-dismisses cleanly. The
    // tip key is dynamic so each tier-up reads as a fresh beat.
    const tierKey = `familiarity_${tierCrossing.id}_${npcId}`;
    // Strip the "The " article from "The Keeper" / "The Smith" / etc.
    // before uppercasing — without this the banner reads "THE KEEPER
    // now sees you as..." with a redundant determiner that adds no
    // meaning and breaks the cadence ("KEEPER now sees you as..." is
    // tighter and matches how the player names them mentally).
    const rawName = def.name || 'They';
    const npcName = rawName.replace(/^The /, '').toUpperCase();
    setTimeout(() => {
      try {
        TIPS[tierKey] = { text: `${npcName} now sees you as ${tierCrossing.label}` };
        showTip(tierKey);
      } catch (_e) {}
    }, 1100);
  }
  // Wire the service button based on NPC service type
  const svcBtn = document.getElementById('dialogueServiceBtn');
  svcBtn.textContent = def.service.label || 'SERVICE';
  svcBtn.style.color = def.tint || '#f4d9a0';
  svcBtn.style.boxShadow = `inset 0 0 0 1px ${def.tint || '#c9a86a'}, 0 0 14px ${def.tint || '#c9a86a'}44`;
  svcBtn.onclick = () => {
    // Wanderer's gift flow stays inside the dialogue — its responses
    // (heirloom prompt, success line, can't-afford notice) update the
    // body in-place via showNpcResponse / showNpcConfirm. Closing the
    // dialogue would orphan those responses against the bare hamlet.
    // Other services (smith, oracle, etc.) open their own modals, so
    // closing the dialogue first prevents two stacked panels.
    if (def.service && def.service.type === 'wanderer_gift') {
      runNpcService(npcId);
      return;
    }
    dialogueEl.style.display = 'none';
    runNpcService(npcId);
  };
  // SPEAK button visibility — only show for NPCs with chatLines defined.
  // Lets future NPCs opt out of casual chat (e.g. silent NPCs) without
  // breaking the modal for existing roster.
  const speakBtn = document.getElementById('dialogueSpeakBtn');
  speakBtn.style.display = npcHasChat(npcId) ? '' : 'none';

  // Topic chips — Morrowind-style "ask about X" subjects. Each NPC has
  // their own perspective on the shared catalog (the_ruin, the_keeper,
  // the_watcher, etc.). Render as a wrap-flow row of subtle chips.
  // Unseen topics get a small dot to the right of the label.
  // Topic LIST — Morrowind / CRPG style. Each available topic renders as
  // a numbered button on the right column. Click OR press the matching
  // number key (1-9) to ask. Replaces the prior wrap-flow chip row that
  // didn't scale well and lost identity once stuffed alongside dense
  // body text. Empty state hides the whole right column.
  const topicsRow = document.getElementById('dialogueTopics');
  const topics = availableTopicsForNpc(npcId);
  topicsRow.innerHTML = '';
  // Reflow the panel grid based on topic availability — single column
  // when an NPC has no topics so the body uses the full panel width.
  const dialoguePanelEl = document.getElementById('dialoguePanel');
  if (topics.length > 0) {
    if (dialoguePanelEl) dialoguePanelEl.style.gridTemplateColumns = '1fr 220px';
    topicsRow.style.display = 'flex';
    // Re-add the section header that lives inside topicsRow (cleared by
    // innerHTML='' above).
    const head = document.createElement('div');
    head.style.cssText = 'font-size:9px;letter-spacing:4px;color:#c9a86a;font-weight:bold;opacity:0.65;margin-bottom:8px;text-align:center;';
    head.textContent = '— ASK ABOUT —';
    topicsRow.appendChild(head);
    // Build numbered buttons. Index limit 9 — keyboard shortcuts only go
    // up to digit-9; if any NPC ever exceeds 9 topics, additional ones
    // still render but lose the keyboard hotkey.
    topics.forEach((t, idx) => {
      const num = idx + 1;
      const chip = document.createElement('button');
      const seen = isTopicSeen(npcId, t.id);
      chip.className = 'dialogueTopicChip';
      chip.dataset.topicId = t.id;
      chip.dataset.topicIndex = String(num);
      chip.style.cssText = `
        display:grid;
        grid-template-columns:18px 1fr auto;
        align-items:center;
        gap:8px;
        background:transparent;
        color:${seen ? '#8a7a5a' : '#c9a86a'};
        border:1px solid rgba(201,168,106,${seen ? 0.18 : 0.4});
        border-left:2px solid ${seen ? 'rgba(201,168,106,0.3)' : '#c9a86a'};
        padding:7px 10px;
        font-size:10px;
        cursor:pointer;
        letter-spacing:2px;
        font-family:Georgia,serif;
        font-style:italic;
        transition:all 0.18s ease;
        text-align:left;
        width:100%;
      `;
      // Build via createElement + textContent — defensive pattern
      // (commit 02a2797). Topic labels are author-controlled today; the
      // pattern keeps that future-proof.
      const numEl = document.createElement('span');
      numEl.style.cssText = `font-size:10px;color:${seen ? '#7a6a5a' : '#a0e8ff'};font-weight:bold;font-style:normal;text-shadow:0 0 4px rgba(160,232,255,${seen ? 0 : 0.4});letter-spacing:0;`;
      numEl.textContent = num <= 9 ? String(num) : '·';
      chip.appendChild(numEl);
      const labelEl = document.createElement('span');
      labelEl.style.cssText = 'text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;';
      labelEl.textContent = t.label;
      chip.appendChild(labelEl);
      const dotEl = document.createElement('span');
      dotEl.style.cssText = `width:6px;height:6px;border-radius:50%;${seen ? 'background:transparent;' : 'background:#a0e8ff;box-shadow:0 0 4px rgba(160,232,255,0.7);'}`;
      chip.appendChild(dotEl);
      chip.addEventListener('click', () => {
        const ans = getTopicAnswer(npcId, t.id);
        if (!ans) return;
        // Click feedback - slightly higher pitch on UNSEEN topics
        // (a small "you discovered something" bell), softer on
        // already-seen so revisiting old answers stays mellow.
        try { synthClick(seen ? 1.0 : 1.4, seen ? 0.28 : 0.45); } catch (_e) {}
        // Replace body with the topic answer + a header line that
        // reads as "they're now speaking about X".
        const def2 = NPCS[npcId];
        const tint = def2.tint || '#c9a86a';
        const textEl2 = document.getElementById('dialogueText');
        textEl2.innerHTML = '';
        const headerEl = document.createElement('div');
        headerEl.style.cssText = `font-size:9px;letter-spacing:4px;color:${tint};opacity:0.65;margin-bottom:10px;font-style:italic;text-transform:uppercase;font-weight:bold;`;
        headerEl.textContent = `on ${t.label.toLowerCase()}`;
        textEl2.appendChild(headerEl);
        const bodyP = document.createElement('p');
        bodyP.style.cssText = 'margin:0;line-height:1.7;color:#d8cfae;font-style:italic;';
        bodyP.textContent = ans;
        textEl2.appendChild(bodyP);
        // Update this chip's visual state — it's been seen now.
        chip.style.color = '#8a7a5a';
        chip.style.borderColor = 'rgba(201,168,106,0.18)';
        chip.style.borderLeftColor = 'rgba(201,168,106,0.3)';
        numEl.style.color = '#7a6a5a';
        numEl.style.textShadow = 'none';
        dotEl.style.background = 'transparent';
        dotEl.style.boxShadow = 'none';
      });
      chip.addEventListener('mouseenter', (e) => {
        e.currentTarget.style.background = 'rgba(201,168,106,0.08)';
        e.currentTarget.style.borderColor = 'rgba(201,168,106,0.6)';
        e.currentTarget.style.borderLeftColor = '#f4d9a0';
        e.currentTarget.style.color = '#f4d9a0';
        e.currentTarget.style.transform = 'translateX(-2px)';
      });
      chip.addEventListener('mouseleave', (e) => {
        const stillSeen = isTopicSeen(npcId, e.currentTarget.dataset.topicId);
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.borderColor = `rgba(201,168,106,${stillSeen ? 0.18 : 0.4})`;
        e.currentTarget.style.borderLeftColor = stillSeen ? 'rgba(201,168,106,0.3)' : '#c9a86a';
        e.currentTarget.style.color = stillSeen ? '#8a7a5a' : '#c9a86a';
        e.currentTarget.style.transform = 'translateX(0)';
      });
      topicsRow.appendChild(chip);
    });
  } else {
    if (dialoguePanelEl) dialoguePanelEl.style.gridTemplateColumns = '1fr';
    topicsRow.style.display = 'none';
  }

  dialogueEl.style.display = 'flex';
}

// ============================================================================
// NPC RESPONSE HELPERS — replace native alert() / confirm() with in-dialogue
// body updates so service-flow responses stay inside the dialogue panel
// instead of breaking immersion with browser-chrome popups. The dialogue
// modal stays OPEN; only the body content changes. Player dismisses via
// FAREWELL / Esc / backdrop click as usual.
//
// `showNpcResponse(npcId, message)` — drop a single italic line into the
// body styled to match the NPC's tint (matches how the SPEAK button
// renders chatLines). Replaces alert().
//
// `showNpcConfirm(npcId, prompt, onYes, onNo)` — body shows a prompt
// followed by two inline YES / NO buttons. Replaces confirm().
//
// Topics list is hidden during a confirm prompt — we don't want the
// player accidentally clicking a topic chip and losing the confirmation
// state. Restored on next openDialogue / response.
// ============================================================================
function showNpcResponse(npcId, message) {
  const def = NPCS[npcId];
  if (!def) return;
  const tint = def.tint || '#c9a86a';
  const textEl = document.getElementById('dialogueText');
  if (!textEl) return;
  textEl.innerHTML = '';
  const p = document.createElement('p');
  p.style.cssText = `margin:0;line-height:1.7;font-style:italic;color:${tint};`;
  // Same opening-dash convention as SPEAK lines so the text reads as
  // "the NPC speaking" rather than a flat status string.
  const dash = document.createElement('span');
  dash.style.cssText = 'opacity:0.6;margin-right:8px;';
  dash.textContent = '—';
  p.appendChild(dash);
  p.appendChild(document.createTextNode(message));
  textEl.appendChild(p);
}

function showNpcConfirm(npcId, prompt, onYes, onNo) {
  const def = NPCS[npcId];
  if (!def) return;
  const tint = def.tint || '#c9a86a';
  const textEl = document.getElementById('dialogueText');
  if (!textEl) return;
  textEl.innerHTML = '';
  const p = document.createElement('p');
  p.style.cssText = 'margin:0 0 16px;line-height:1.7;color:#d8cfae;font-style:italic;';
  p.appendChild(document.createTextNode(prompt));
  textEl.appendChild(p);
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:14px;justify-content:flex-start;align-items:center;margin-top:6px;';
  const yesBtn = document.createElement('button');
  yesBtn.textContent = 'YES';
  yesBtn.style.cssText = `background:linear-gradient(180deg,${tint}33,rgba(10,6,16,0.85));color:${tint};border:0;padding:9px 26px;cursor:pointer;letter-spacing:4px;font-family:Georgia,serif;font-size:11px;font-weight:bold;box-shadow:inset 0 0 0 1px ${tint}, 0 0 12px ${tint}33;transition:all 0.18s ease;`;
  yesBtn.addEventListener('click', () => {
    try { synthClick(1.0, 0.4); } catch (_e) {}
    if (onYes) onYes();
  });
  yesBtn.addEventListener('mouseenter', (e) => { e.currentTarget.style.transform = 'translateY(-1px)'; });
  yesBtn.addEventListener('mouseleave', (e) => { e.currentTarget.style.transform = 'translateY(0)'; });
  const noBtn = document.createElement('button');
  noBtn.textContent = 'NO';
  noBtn.style.cssText = 'background:transparent;color:#8a7a6a;border:1px solid rgba(168,144,96,0.4);padding:9px 26px;cursor:pointer;letter-spacing:4px;font-family:Georgia,serif;font-size:11px;font-style:italic;transition:all 0.18s ease;';
  noBtn.addEventListener('click', () => {
    try { synthClick(0.9, 0.25); } catch (_e) {}
    if (onNo) onNo();
  });
  noBtn.addEventListener('mouseenter', (e) => { e.currentTarget.style.color = '#c9a86a'; e.currentTarget.style.borderColor = '#c9a86a'; });
  noBtn.addEventListener('mouseleave', (e) => { e.currentTarget.style.color = '#8a7a6a'; e.currentTarget.style.borderColor = 'rgba(168,144,96,0.4)'; });
  btnRow.appendChild(yesBtn);
  btnRow.appendChild(noBtn);
  textEl.appendChild(btnRow);
  // Suppress topic clicks during a confirm — easy way: hide the topic
  // column (the panel collapses to single column). Restored on next
  // openDialogue or showNpcResponse.
  const dpEl = document.getElementById('dialoguePanel');
  const tEl = document.getElementById('dialogueTopics');
  if (dpEl && tEl) {
    dpEl.style.gridTemplateColumns = '1fr';
    tEl.style.display = 'none';
  }
}

function runNpcService(npcId) {
  const def = NPCS[npcId];
  if (!def) return;
  const svc = def.service;
  recordServiceUse(npcId);
  switch (svc.type) {
    case 'meta_shop':
      // Route to the existing essence shop — reuse showSanctuary but route
      // its "back" to the hamlet instead of the main menu.
      showSanctuaryFromHamlet();
      break;
    case 'memory_codex':
      // Open the Memory modal; on close it'll return to menu — we reroute
      // the close handler to re-enter the hamlet instead.
      showMemoryFromHamlet();
      break;
    case 'reforge':
      // Opens the Smith's forge modal — pick a discovered relic, pay
      // essence to bank it as next run's starting heirloom.
      showSmithModal();
      break;
    case 'curses_panel':
      // Gravekeeper routes to the existing curses modal. Re-bind the close
      // button so it returns to the hamlet instead of the main menu.
      showCursesFromHamlet();
      break;
    case 'oracle_forecast':
      showOracleForecast();
      break;
    case 'wanderer_gift':
      showWandererGift();
      break;
    default:
      break;
  }
}

// Gravekeeper → existing curses modal with hamlet return routing.
function showCursesFromHamlet() {
  // Set the close-route flag BEFORE showing the modal — the modal's
  // close button reads it on click and routes to "stay on hamlet
  // canvas" instead of "show main menu". Replaces the old onclick-
  // override pattern (which doubled with the addEventListener and
  // also called showHamlet, respawning the hero at the entrance).
  _serviceCloseToHamlet = true;
  showCursesModal();
}

// Oracle modals (forecast + fortune) — extracted to
// src/modals/oracleModal.js (Round-7 Sprint B). Both are NPC-only and
// cross-reference each other; the module owns both DOMs and handles
// the hand-off internally. main.js retains the wrapper to preserve
// the hideAllOverlays-before-show contract.
function showOracleForecast() {
  hideAllOverlays();
  _showOracleForecast();
}

// ============================================================================
// WANDERER GIFT — pay essence for a random COMMON relic banked as heirloom
// for the next run. Cheaper than Smith's specific pick (30 vs 40+) but
// you don't get to choose which one. Pulls only from discovered relics.
// ============================================================================
const WANDERER_GIFT_COST = 30;

function showWandererGift() {
  // Pull common relics the player has actually seen + that work with
  // their current weapon (no wand-only gifts for sword players, etc.).
  const pool = ALL_RELIC_IDS.filter(id => {
    const def = RELIC_DEFS[id];
    return seenRelicIds.has(id)
      && (def.tier || 'common') === 'common'
      && isRelicForWeapon(id, hero.weapon);
  });
  // Hand off the actual gift bestowal so the heirloom-replacement confirm
  // can re-enter cleanly via the YES button without nesting flow.
  const _giveGift = () => {
    const rollId = pool[(Math.random() * pool.length) | 0];
    const rollDef = RELIC_DEFS[rollId];
    if (bankHeirloom(rollId, WANDERER_GIFT_COST)) {
      recordServiceUse('wanderer');
      try { synthChord(523, 0.7, 0.8); } catch (e) {}
      showNpcResponse('wanderer', `I hand you ${rollDef.name}. Carry it for me. It belongs on the road more than on a shelf.`);
    }
  };
  if (!pool.length) {
    showNpcResponse('wanderer', 'I rummage through my pack, frown, shake my head. Nothing to give you yet. Come back when you have seen more.');
    return;
  }
  if (meta.essence < WANDERER_GIFT_COST) {
    showNpcResponse('wanderer', `I wait patiently. You cannot spare the ${WANDERER_GIFT_COST} essence this requires. Return when you have more.`);
    return;
  }
  // Confirm if overwriting existing heirloom — inline YES/NO in the
  // dialogue body, no native browser popup.
  if (meta.heirloom) {
    const hDef = RELIC_DEFS[meta.heirloom];
    const hName = hDef ? hDef.name : meta.heirloom;
    showNpcConfirm(
      'wanderer',
      `You already carry ${hName} as an heirloom. Accept a random gift from me instead, replacing it? Your essence is not refunded.`,
      () => _giveGift(),
      () => showNpcResponse('wanderer', 'Then keep what you have. Both of us travel a road. We need not always trade.'),
    );
    return;
  }
  _giveGift();
}

function showSanctuaryFromHamlet() {
  // Post-rebuild: the Keeper's "ESSENCE" service and the in-hamlet
  // Sanctuary Shrine slab both converge on a single source of truth —
  // the shrine modal. The death screen used to double as a sanctuary
  // panel via DOM reuse (showSanctuary), but that mixed two unrelated
  // jobs and forced the death-screen template to keep elements like
  // #endRelics around just so the sanctuary mode could empty them.
  // The shrine modal owns its own DOM — no template gymnastics.
  showSanctuaryShrine();
}

function showMemoryFromHamlet() {
  // Set close-route flag BEFORE showing — memoryCloseBtn reads it and
  // routes "stay on hamlet" instead of "show main menu". Replaces the
  // old onclick-override pattern (which doubled with the
  // addEventListener and also called showHamlet, respawning the hero).
  _serviceCloseToHamlet = true;
  showMemoryModal();
}

// ============================================================================
// VOLUMES MODAL — save-slot manager. DOM + grid live in
// src/modals/volumesModal.js (Round-7 Sprint B refactor). main.js owns
// the onClose wiring (close button -> showMainMenu) and a thin wrapper
// that hideAllOverlays-then-shows so existing call sites stay
// unchanged. volumesEl is re-exported from the modal module so
// hideAllOverlays + the modal-active visibility check at the top of
// the tick loop continue to read the live element state.
// ============================================================================
setVolumesOnClose(() => showMainMenu());
function showVolumesModal() {
  hideAllOverlays();
  _showVolumesModal();
}

// ============================================================================
// CURSES MODAL — DOM + grid live in src/modals/cursesModal.js
// (Round-7 Sprint B refactor). Curses has a dual close path: opening
// from the Gravekeeper NPC just hides the modal so the hamlet
// canvas underneath shows through (the _serviceCloseToHamlet flag
// drives this); opening from the main menu routes back to
// showMainMenu. main.js's onClose closure picks between them.
// ============================================================================
setCursesOnClose(() => {
  if (_serviceCloseToHamlet) {
    // Opened from the Gravekeeper NPC — hamlet canvas is still drawing
    // underneath; just hide the modal to reveal it (preserves the hero's
    // position next to the NPC). showHamlet would respawn at entrance.
    _serviceCloseToHamlet = false;
  } else {
    showMainMenu();
  }
});
function showCursesModal() {
  hideAllOverlays();
  _showCursesModal();
}

// ============================================================================
// JOURNAL OF THE RUIN — DOM + render live in src/modals/journalModal.js
// (Round-7 Sprint B refactor). Reached only from the pause modal; close
// routes BACK to the pause modal (not the main menu), unlike the other
// modals. main.js's onClose closure restores pauseEl visibility.
// ============================================================================
setJournalOnClose(() => { pauseEl.style.display = 'flex'; });
function showJournalModal() {
  pauseEl.style.display = 'none';
  _showJournalModal();
}

// ============================================================================
// SMITH'S FORGE — DOM + render live in src/modals/smithModal.js
// (Round-7 Sprint B refactor). Simplest seam yet: Smith is reachable
// only from the Smith NPC in the hamlet, so the close button just
// hides the modal — no onClose callback injection. The hamlet canvas
// is still rendering underneath; hiding returns the player exactly
// where they left off next to the Smith.
// ============================================================================
function showSmithModal() {
  hideAllOverlays();
  _showSmithModal();
}

// ============================================================================
// MEMORY WEAVE — DOM + grid live in src/modals/memoryModal.js (Round-7
// Sprint B refactor). Two onCallback injection points:
//   - onClose: dual path (Archivist NPC just hides; main menu route
//     calls showMainMenu)
//   - onPick: fires after a memory is chosen or cleared so the menu's
//     bottom-left MEMORY chip updates its label/tint to match
// ============================================================================
setMemoryOnClose(() => {
  if (_serviceCloseToHamlet) {
    // Opened from the Archivist NPC — hamlet still drawing underneath.
    _serviceCloseToHamlet = false;
  } else {
    showMainMenu();
  }
});
setMemoryOnPick(() => updateMenuMemoryLabel());
function showMemoryModal() {
  hideAllOverlays();
  _showMemoryModal();
}

// Small label updater — the MEMORY button at the bottom-left of the menu
// shows the currently-selected memory name in italic, or "(none)" if unset.
function updateMenuMemoryLabel() {
  const lbl = document.getElementById('menuMemoryBtnLabel');
  if (!lbl) return;
  const def = getSelectedMemory();
  if (def) {
    lbl.textContent = def.name.replace(/^Memory of /, '').toUpperCase();
    lbl.style.color = def.tint || '#a89a7a';
  } else {
    lbl.textContent = 'MEMORY';
    lbl.style.color = '';
  }
}

// Chronicles modal — extracted to src/modals/achievementsModal.js
// (Round-7 Sprint B). main.js retains the wrapper to preserve the
// hideAllOverlays-before-show contract + restore the main menu on close.
// chronCard / chronTile / renderChroniclesTab / chronTab / ENEMY_PORTRAIT_PATH
// all moved into the module — only ENEMY_PORTRAIT_PATH is re-imported
// here for the __testBossIntro debug hook (returns the portrait path
// in its result blob).
setAchievementsOnClose(() => {
  showMainMenu();
});
function showAchievementsModal() {
  hideAllOverlays();
  _showAchievementsModal();
}

// Weapon picker — extracted to src/modals/weaponPickerModal.js (Round-7
// Sprint B). main.js retains the wrapper to preserve the menu-hide-before-
// show contract + wire onPick (set hero.weapon, kick startRun via
// hideAllOverlays) and onBack (restore the main menu) callbacks.
setWeaponOnPick((weaponId) => {
  hero.weapon = weaponId;
  // Phase 4 unification — weapon-pick confirm routes to canonical zone run.
  beginCanonicalDescent('ruins');
});
setWeaponOnBack(() => {
  menuEl.style.display = 'flex';
});
function showWeaponPicker() {
  menuEl.style.display = 'none';
  _showWeaponPickerModal();
}

function showMainMenu() {
  hideAllOverlays();
  menuEl.style.display = 'flex';
  document.title = 'Ethera \u00b7 beneath the ruin';
  // Ambient audio — the cold menu pad. Crossfades from any prior variant.
  startAmbientPad('menu');
  // Clear any previously-drawn tarot so next ordinary run isn't haunted by it
  clearTarot();
  // Re-sync mode chip highlight + CTA tint (last-selected mode persists)
  refreshMenuModeChips();
  // RESUME card — reveal if a run was interrupted. Shows the floor + loadout
  // so the player knows what they're returning to before committing.
  const resumeBtn = document.getElementById('menuResumeBtn');
  const resumeLine = document.getElementById('menuResumeLine');
  const snap = loadRunSnapshot();
  if (snap && resumeBtn && resumeLine) {
    const roman = snap.floorLevel === 1 ? 'I' : snap.floorLevel === 2 ? 'II' : snap.floorLevel === 3 ? 'III' : snap.floorLevel === 4 ? 'IV' : String(snap.floorLevel);
    const nR = (snap.relicIds || []).length;
    const relicStr = nR === 0 ? 'no relics' : nR === 1 ? '1 relic' : nR + ' relics';
    resumeLine.textContent = `Floor ${roman} \u00b7 ${snap.hp}/${snap.maxHp} HP \u00b7 ${relicStr}`;
    resumeBtn.style.display = 'block';
  } else if (resumeBtn) {
    resumeBtn.style.display = 'none';
  }
  // Populate the info cards with live values
  const sancVal = document.getElementById('menuSanctuaryValue');
  if (sancVal) sancVal.textContent = (meta.essence | 0);
  const chronVal = document.getElementById('menuChroniclesValue');
  if (chronVal) chronVal.textContent = totalUnlocked() + '/' + ACH_IDS.length;
  // Legacy element (hidden)
  const essLegacy = document.getElementById('menuEssence');
  if (essLegacy) essLegacy.textContent = meta.essence + ' essence banked';
  // Curses live in a corner button — update its label + glow if any active.
  const cursesBtn = document.getElementById('menuCursesBtn');
  const cursesLabel = document.getElementById('menuCursesBtnLabel');
  const count = curseCount();
  if (cursesBtn && cursesLabel) {
    if (count > 0) {
      // Active: lit crimson — text glows, no border (borderless discipline).
      cursesLabel.textContent = count + ' CURSE' + (count > 1 ? 'S' : '') + ' \u00b7 ' + curseEssenceMul().toFixed(2) + 'X';
      cursesBtn.style.color = '#d88080';
      cursesBtn.style.textShadow = '0 0 8px rgba(216,128,128,0.5)';
      cursesBtn.style.opacity = '1';
    } else {
      // Dormant: very dim text, blends into page.
      cursesLabel.textContent = 'CURSES';
      cursesBtn.style.color = '#8a4848';
      cursesBtn.style.textShadow = 'none';
      cursesBtn.style.opacity = '0.75';
    }
  }
  // Memory label — hidden legacy chip, still updates for compat.
  updateMenuMemoryLabel();
  // Volume label — shows which save-slot is currently loaded (I / II / III).
  const volLbl = document.getElementById('menuVolumeLabel');
  if (volLbl) volLbl.textContent = profileLabel(getActiveProfileId());
  // ACTIVE MODIFIERS — one-line indicator below the hamlet/chronicles links,
  // visible only when the player has a memory selected, a banked heirloom,
  // or curses enabled. Quiet when vanilla; surfaces only what's genuinely
  // about to shape the run.
  const modEl = document.getElementById('menuActiveModifiers');
  if (modEl) {
    const parts = [];
    const mem = getSelectedMemory();
    if (mem) parts.push(`<span style="color:${mem.tint};">\u2766 ${mem.name.replace(/^Memory of /,'')}</span>`);
    if (meta.heirloom) {
      const hDef = RELIC_DEFS[meta.heirloom];
      if (hDef) parts.push(`<span style="color:#ff8a60;">\u2692 ${hDef.name} (heirloom)</span>`);
    }
    const cc = curseCount();
    if (cc > 0) parts.push(`<span style="color:#d88080;">\u2620 ${cc} curse${cc>1?'s':''}</span>`);
    if (parts.length) {
      modEl.innerHTML = `<span style="opacity:0.6;">your descent carries:</span>  ${parts.join('  ·  ')}`;
      modEl.style.opacity = '0.85';
    } else {
      modEl.innerHTML = '';
      modEl.style.opacity = '0';
    }
  }
  // Legacy hidden indicator — kept at empty string for anything still reading it.
  const indEl = document.getElementById('menuCurseIndicator');
  if (indEl) indEl.textContent = '';
  // Lifetime records — reframed as italic manuscript flavor instead of a bare
  // stats line. "9 runs" becomes "you have descended nine times · the ruin
  // remembers." which sells the world rather than just surfacing a number.
  // Now rendered in the bottom-right corner as a quiet margin note.
  const recEl = document.getElementById('menuRecordsCorner');
  if (records.runsStarted > 0) {
    const numWord = (n) => {
      const words = ['zero','once','twice','three times','four times','five times','six times','seven times','eight times','nine times','ten times'];
      return n <= 10 ? words[n] : `${n} times`;
    };
    const pieces = [];
    // Lead line — descent count becomes the hook
    pieces.push(`you have descended ${numWord(records.runsStarted)}`);
    // Secondary details in a middle dot sequence
    const extra = [];
    if (records.maxFloor > 0) extra.push(`deepest floor ${records.maxFloor} of ${MAX_FLOORS}`);
    if (records.runsCompleted > 0) extra.push(`${records.runsCompleted} ${records.runsCompleted === 1 ? 'ascension' : 'ascensions'}`);
    if (records.maxCombo >= 20) extra.push(`longest chain ${records.maxCombo}`);
    if (extra.length) pieces.push(extra.join(' · '));
    // Closing tag — warm, foreboding
    pieces.push(records.runsCompleted > 0 ? 'the ruin yields, grudgingly' : 'the ruin remembers');
    recEl.innerHTML = pieces.map(p => `<div>${p}</div>`).join('');
  } else {
    recEl.textContent = '';
  }
  // Daily challenge info — shows today's modifiers + streak
  const dEl = document.getElementById('menuDailyInfo');
  if (dEl) {
    const c = getTodayChallenge();
    const doneToday = hasCompletedToday();
    const streakText = daily.streak > 0 ? ` · 🔥 ${daily.streak}-day streak` : '';
    const doneText = doneToday ? ' · ✓ done today' : '';
    dEl.innerHTML = `TODAY: <span style="color:#d85a5a;">${c.curseName}</span> + <span style="color:#f4d9a0;">${c.relicName}</span>${streakText}${doneText}`;
  }
}

// showSanctuary() removed during the "death = moment, hamlet = place"
// rebuild. The function used to repaint the death-screen DOM as a
// sanctuary view, which forced the death-screen template to ship with
// elements (#endRelics, etc.) that existed only so this function could
// empty them. Sanctuary now lives entirely in showSanctuaryShrine() —
// its own modal with its own DOM. showSanctuaryFromHamlet redirects
// there.

function hideAllOverlays() {
  menuEl.style.display = 'none';
  weaponPickerEl.style.display = 'none';
  cursesEl.style.display = 'none';
  if (achEl) achEl.style.display = 'none';
  if (settingsEl) settingsEl.style.display = 'none';
  if (tarotRevealEl) tarotRevealEl.style.display = 'none';
  if (memoryEl) memoryEl.style.display = 'none';
  if (dialogueEl) dialogueEl.style.display = 'none';
  if (volumesEl) volumesEl.style.display = 'none';
  if (smithEl) smithEl.style.display = 'none';
  if (typeof oracleEl !== 'undefined' && oracleEl) oracleEl.style.display = 'none';
  if (oracleFortuneEl) oracleFortuneEl.style.display = 'none';
  deathEl.style.display = 'none';
  winEl.style.display = 'none';
}

// Pause modal — extracted to src/modals/pauseModal.js (Round-7 Sprint B).
// main.js retains the `paused` flag + setPaused(p) since dozens of
// game-loop branches read paused. Pause modal exports setPauseVisible(p)
// which we call from setPaused to keep DOM in sync. Three button
// callbacks: resume (clear paused), quit (kill the run), journal (open
// the journal modal — its onClose restores pauseEl visibility).
setPauseOnResume(() => setPaused(false));
setPauseOnQuit(() => {
  paused = false;
  hero.hp = 0;
  hero.state = 'dead';
  hero.stateTime = 1;          // force immediate end-of-run
});
setPauseOnJournal(() => {
  showJournalModal();
});

function setPaused(p) {
  paused = p;
  setPauseVisible(p);
}

// AUTO-PAUSE ON WINDOW BLUR — if the tab/window loses focus while the player
// is mid-run, automatically pause so they don't get killed by offscreen enemies
// while checking Slack. Only engages if a run is running AND game isn't already
// on a menu/modal. Does NOT auto-resume — player must dismiss pause manually.
window.addEventListener('blur', () => {
  if (!running) return;
  // Don't re-pause if we're already in any overlay that halts gameplay.
  if (paused) return;
  if (deathEl.style.display === 'flex') return;
  if (winEl.style.display === 'flex') return;
  if (menuEl.style.display === 'flex') return;
  setPaused(true);
});
// Hidden-tab path (on some browsers blur doesn't fire but visibilitychange does)
document.addEventListener('visibilitychange', () => {
  if (document.hidden && running && !paused
      && deathEl.style.display !== 'flex'
      && winEl.style.display !== 'flex'
      && menuEl.style.display !== 'flex') {
    setPaused(true);
  }
});


// First-run intro skip — any key during the SKIP_AFTER..SKIP_BEFORE
// window jumps to the reveal phase. Capture phase so we eat the input
// before gameplay handlers (e.g. WASD) see it. Mouse click skip is
// handled by a canvas pointerdown listener below.
window.addEventListener('keydown', (e) => {
  if (!isIntroActive()) return;
  e.preventDefault();
  e.stopPropagation();
  skipIntro();
}, true);
canvas.addEventListener('pointerdown', () => {
  if (!isIntroActive()) return;
  skipIntro();
});

// ── Walkability overlay (dev tool) ─────────────────────────────────
// Backtick (`) toggles the tinted-grid overlay. Click cells while it's
// visible to override walkable/blocked. Capture-phase so clicks don't
// fall through to the hero attack on baked debug rooms.
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Backquote') return;
  if (e.target && e.target.tagName === 'INPUT') return;     // typing in a field
  toggleWalkOverlay();
  e.preventDefault();
});
// Level-up modal click + key handlers — capture phase so they consume
// before gameplay input fires. ESC / 1 / 2 / 3 also work.
canvas.addEventListener('pointerdown', (e) => {
  if (!isLevelUpModalOpen()) return;
  const r = canvas.getBoundingClientRect();
  const cssX = (e.clientX - r.left) * (canvas.width / r.width);
  const cssY = (e.clientY - r.top) * (canvas.height / r.height);
  if (handleLevelUpModalClick(cssX, cssY, canvas.width, canvas.height)) {
    e.stopPropagation();
    e.stopImmediatePropagation();
    e.preventDefault();
  }
}, true);
window.addEventListener('keydown', (e) => {
  if (!isLevelUpModalOpen()) return;
  if (handleLevelUpModalKey(e.code)) {
    e.stopPropagation();
    e.preventDefault();
  }
}, true);

canvas.addEventListener('pointerdown', (e) => {
  if (!isWalkOverlayVisible()) return;
  if (!room || !room.bakedImage) return;
  // Convert canvas-pixel → world-pixel using current camera transform.
  // Camera transform in render(): translate(-cam.x + halfW) then scale(zoom)
  // around screen center. Inverse: world = (screen - halfW) / zoom + cam.x + halfW
  // Simpler: account for the same translation/scale used in render().
  const r = canvas.getBoundingClientRect();
  const cssX = (e.clientX - r.left) * (canvas.width / r.width);
  const cssY = (e.clientY - r.top) * (canvas.height / r.height);
  const halfW = canvas.width / 2;
  const halfH = canvas.height / 2;
  const z = (camera && typeof camera.zoom === 'number') ? camera.zoom : 1;
  const camX = (camera && typeof camera.x === 'number') ? camera.x : 0;
  const camY = (camera && typeof camera.y === 'number') ? camera.y : 0;
  const worldX = (cssX - halfW) / z + camX + halfW;
  const worldY = (cssY - halfH) / z + camY + halfH;
  const result = toggleCellAtWorld(room, worldX, worldY);
  if (result) {
    // Consume so the gameplay click handler doesn't also fire.
    e.stopPropagation();
    e.stopImmediatePropagation();
    e.preventDefault();
  }
}, true);     // capture phase

// Hook ESC key to toggle pause (only when game is actively running)
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape') return;
  // Don't pause when death/win overlays are open
  if (!running) return;
  if (deathEl.style.display !== 'none') return;
  if (winEl.style.display !== 'none') return;
  // HAMLET CANVAS — ESC returns to the main menu instead of pausing. The
  // hamlet is a hub, not a combat room; pausing it has no meaning. Close
  // any open dialogue first so it doesn't linger over the menu.
  if (room.kind === 'hamlet') {
    if (dialogueEl && dialogueEl.style.display !== 'none') {
      // Mirror the close-button click feedback so Esc-close (the more
      // common dismissal path for keyboard users) feels equally tactile.
      try { synthClick(0.9, 0.25); } catch (_e) {}
      dialogueEl.style.display = 'none';
    } else {
      running = false;
      showMainMenu();
    }
    e.preventDefault();
    return;
  }
  setPaused(!paused);
  e.preventDefault();
});

// Mobile pause button — bridges ESC for touch devices. Calls the same
// path the keyboard handler uses (with the same hamlet-returns-to-menu
// + death/win-modal-blocked guards) so mobile and desktop pause flow
// through one toggle. Without this, the mobile player has no way to
// pause/quit/check the journal mid-run; their only quit-flow is closing
// the tab and losing the run.
const mobilePauseBtn = document.getElementById('mobilePauseBtn');
if (mobilePauseBtn) {
  mobilePauseBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!running) return;
    if (deathEl.style.display !== 'none') return;
    if (winEl.style.display !== 'none') return;
    if (room.kind === 'hamlet') {
      if (dialogueEl && dialogueEl.style.display !== 'none') {
        try { synthClick(0.9, 0.25); } catch (_e) {}
        dialogueEl.style.display = 'none';
      } else {
        running = false;
        showMainMenu();
      }
      return;
    }
    setPaused(!paused);
  });
}

// Mobile fullscreen entry — reclaims the ~80px of vertical browser chrome
// (URL bar / nav gutter) on mobile. Mobile browsers REQUIRE a user gesture
// to enter fullscreen, so we wire to the click event of an explicit button
// rather than calling requestFullscreen at boot.
//
// fullscreenchange listener toggles `body.in-fullscreen` so the CSS can
// hide the entry button once active. Standard + WebKit prefixed events
// both registered for older Safari.
const mobileFullscreenBtn = document.getElementById('mobileFullscreenBtn');
if (mobileFullscreenBtn) {
  mobileFullscreenBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const root = document.documentElement;
    const req = root.requestFullscreen || root.webkitRequestFullscreen || root.mozRequestFullScreen || root.msRequestFullscreen;
    if (!req) return;
    try {
      const p = req.call(root);
      // Modern browsers return a Promise; older Safari returns undefined.
      // Either path is acceptable — we just don't await.
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          // User denied or browser refused (insecure context, etc.) —
          // silently no-op. The button stays visible so the user can
          // try again.
        });
      }
    } catch (_e) {
      // No-op — fullscreen rejection is expected on some configurations.
    }
  });
}
function _onFullscreenChange() {
  const fs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
  document.body.classList.toggle('in-fullscreen', fs);
  // Resize fires naturally after fullscreen toggle; re-run our resize
  // settle pass so the camera + ui-scale catch up to the new viewport.
  if (typeof _onResize === 'function') _onResize(50);
}
document.addEventListener('fullscreenchange',       _onFullscreenChange);
document.addEventListener('webkitfullscreenchange', _onFullscreenChange);
document.addEventListener('mozfullscreenchange',    _onFullscreenChange);
document.addEventListener('MSFullscreenChange',     _onFullscreenChange);

// R — reroll pedestal offers for gold. Cost scales with floor (15g base).
// Round-7 — also supports shop rooms via a flat-rate reroll. Detection:
// any active pedestal carries p.shop=true means we're in a shop, route
// to spawnShopOffer to preserve the goldCost field. Combat reroll path
// stays untouched.
window.addEventListener('keydown', (e) => {
  if (e.code !== 'KeyR') return;
  if (!running || paused) return;
  if (deathEl.style.display !== 'none' || winEl.style.display !== 'none') return;
  if (!hasActivePedestals()) return;
  // Altars + secret wall pedestals skip reroll; only the standard 3-offer pedestals.
  // Detect via hpCost === 0 on ALL active pedestals.
  const activeStd = pedestals.filter(p => !p.picked && p.hpCost === 0);
  if (activeStd.length < 2) return;       // need multi-choice context
  const inShop = activeStd.some(p => p.shop);
  // Cost scales with floor depth for combat rerolls; flat 30g for shops.
  // Shops are mid-floor encounters where players have less gold than
  // post-combat clears, so the reroll cost has to be cheaper than a
  // single-relic price (40g common) to be a real choice.
  //   Combat   Round-1 formula  : 15 + floor*5  (20/25/30/35) — too cheap on F4
  //   Combat   Round-3 formula  : 30 + floor*15 (45/60/75/90) — too expensive on F1
  //   Combat   Round-6 formula  : 20 + floor*15 (35/50/65/80) — fits typical yields
  //   Shop     Round-7 formula  : flat 30g — cheaper than the cheapest item
  const cost = inShop ? 30 : (20 + currentFloorLevel * 15);
  if (gold.total < cost) {
    // Feedback: brief label + denied chirp
    roomLabelText = `REROLL NEEDS ${cost}g (you have ${gold.total})`;
    roomLabelColor = '#d85a5a';
    roomLabelTime = 1.6;
    synthClick(0.5, 1.0);
    return;
  }
  gold.total -= cost;
  // Spawn fresh offers — route based on room context.
  // Round-7-audit HIGH-2 fix: the original `spawnRelicOffer(level)`
  // call passed NO opts, so a re-rolled offer in an elite (perilous-
  // path) room lost minTier='rare', a roomReward='fusion' room lost
  // fusionBias=true, and a roomReward='legendary' room lost
  // minTier='legendary'. The player paid 35-80g for a downgraded
  // offer set, breaking the door's reward promise. Re-derive the
  // current room's opts from `data` (same logic as the post-clear
  // path at the combat-clear branch) and thread them through.
  clearPedestals();
  if (inShop) {
    spawnShopOffer(currentFloorLevel);
  } else {
    const _data = floor[roomIndex];
    const _isElitePath = !!_data?.eliteRoom;
    const _reward = _data?.roomReward;
    const _opts = {};
    if (_reward === 'legendary') _opts.minTier = 'legendary';
    else if (_isElitePath || _reward === 'rare+') _opts.minTier = 'rare';
    if (_reward === 'fusion') _opts.fusionBias = true;
    if (_data?.roomTheme) _opts.theme = _data.roomTheme;
    spawnRelicOffer(currentFloorLevel, _opts);
  }
  // Reset the modal so a stale seen-set doesn't suppress re-open;
  // the modal stays closed until the player presses E on the new
  // choice pedestal.
  clearRelicChoiceModal();
  // Feedback
  roomLabelText = `✦ REROLLED · -${cost}g ✦`;
  roomLabelColor = '#c9a86a';
  roomLabelTime = 1.4;
  for (const p of pedestals) {
    for (let k = 0; k < 10; k++) deathBurst(p.x, p.y, p.relic?.tint || '#f4d9a0');
  }
  synthPing(1200, 0.7, 0.25);
  setTimeout(() => synthPing(1400, 0.5, 0.2), 80);
  e.preventDefault();
});

// Pick N evenly-spaced x-tile positions in the north wall, with min 3-tile
// padding from each corner so doors never collide with corner-pillar art.
// For shaped rooms (L / T / plus), the valid door X range narrows so the
// door tile lands above the floor band, not above a carved corner. Imports
// the per-shape range from room.js.
function computeDoorXs(roomW, n, roomH, shape) {
  if (n <= 0) return [];
  const validRange = (roomH != null && shape != null)
    ? getValidNorthDoorXRange(roomW, roomH, shape)
    : { min: 3, max: roomW - 4 };
  if (n === 1) return [Math.floor((validRange.min + validRange.max) / 2)];
  const span = validRange.max - validRange.min;
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    out.push(Math.round(validRange.min + span * t));
  }
  for (let i = 1; i < out.length; i++) {
    if (out[i] - out[i - 1] < 3) out[i] = out[i - 1] + 3;
  }
  return out;
}

// ── PHASE 3: ADAPTIVE WAVE 2 COMPOSITION ─────────────────────────────────
// Tracks how much damage each enemy archetype dealt to the hero during
// wave 1 of a combat room. Wave 2's composition reads this tally and
// substitutes one wave-2 enemy of the dominant archetype for one of the
// COUNTER archetype, biasing toward the threat type the player handled
// LEAST well. Reads as "the room saw what worked against you and changed
// tactics."
//
// Counter mapping (intent: vary the challenge, not pile on weakness):
//   melee was hurting you most  → wave 2 swaps a melee for a ranged
//                                 (forces movement / repositioning)
//   ranged was hurting you most → wave 2 swaps a ranged for a melee/bomber
//                                 (forces engagement / closing distance)
//   bomber/lancer (rare archetypes) → no swap (tier pool may not have
//                                  enough of these to swap meaningfully)
//   no damage taken → wave 2 is unchanged (already balanced)
//
// Resets on combat-room enter. Hook is installed on combat rooms only,
// so non-combat rooms (sanctuary, altar, etc.) don't accidentally
// contribute damage that biases the next combat room.
let _wave1DamageTally = null;
const _COUNTER_ARCHETYPE = {
  melee: 'ranged',
  ranged: 'melee',
};
const _TIER_POOLS = {
  tier1: ['slime', 'skel', 'bomber'],
  tier2: ['skel', 'orc', 'archer', 'bomber'],
  tier3: ['orc', 'archer', 'bomber', 'lancer'],
};
function _tierPoolForFloor(level) {
  return _TIER_POOLS[level <= 1 ? 'tier1' : level <= 2 ? 'tier2' : 'tier3'];
}
function _archetypeOf(enemyType) {
  const def = ENEMY_TYPES[enemyType];
  return def ? def.behavior : null;
}
// Picks the archetype that dealt the most damage. Returns null if the
// tally is empty or all-zero (= player took no damage in wave 1, no
// signal to act on).
function _dominantArchetype(tally) {
  if (!tally) return null;
  let best = null, bestVal = 0;
  for (const k of Object.keys(tally)) {
    if (tally[k] > bestVal) {
      best = k;
      bestVal = tally[k];
    }
  }
  return best;
}
// Mutates wave2 in place — substitutes one enemy of the dominant
// archetype for a counter-archetype enemy from the same tier pool.
// No-ops when the tally is empty, no swap candidates exist, or the
// counter-archetype isn't represented in the tier pool.
//
// Spawn-distance guard: if the swap would replace a melee with a ranged
// enemy AT a spawn cell <100 px from the hero's current position, the
// swap is skipped. Balance review flagged that a point-blank archer
// spawning into a flanked hero is undodgeable on a 1-HP build. The
// guard preserves the "wave 2 adapts" intent except in the specific
// pathological case.
function _adaptWave2Composition(wave2, tally, level, heroX, heroY) {
  if (!wave2 || !tally) return;
  const dom = _dominantArchetype(tally);
  const counter = dom ? _COUNTER_ARCHETYPE[dom] : null;
  if (!counter) return;
  // Find the candidate swap (first enemy of the dominant archetype).
  // Filter out candidates whose SPAWN POSITION is too close to the hero
  // when the counter archetype is ranged — a point-blank archer spawn
  // is the worst-case swap.
  const isRangedCounter = (counter === 'ranged');
  const candidates = wave2.filter((s) => {
    if (_archetypeOf(s.type) !== dom) return false;
    if (isRangedCounter) {
      const sx = s.x * TILE + TILE / 2;
      const sy = s.y * TILE + TILE / 2;
      const dist = Math.hypot(heroX - sx, heroY - sy);
      if (dist < 100) return false;     // too close — would be undodgeable
    }
    return true;
  });
  if (candidates.length === 0) return;
  const candidate = candidates[0];
  const pool = _tierPoolForFloor(level);
  const counterTypes = pool.filter((t) => _archetypeOf(t) === counter);
  if (counterTypes.length === 0) return;
  candidate.type = counterTypes[Math.floor(Math.random() * counterTypes.length)];
}

function loadRoom(idx, entryFrom) {
  const data = floor[idx];
  data.entryFrom = entryFrom;
  // Phase 3: install / reset the wave-1 damage tracker for combat rooms.
  // Reset (not just install) so a previous combat room's tally doesn't
  // leak into this one. Non-combat rooms uninstall the hook so their
  // damage events (e.g. spike traps in challenge rooms) don't pollute
  // the next combat room's tally.
  if (data.kind === 'combat') {
    _wave1DamageTally = { melee: 0, ranged: 0, bomber: 0, lancer: 0 };
    if (typeof window !== 'undefined') {
      window.__recordCombatDamage = (sourceType, amount) => {
        const arch = _archetypeOf(sourceType);
        if (arch && _wave1DamageTally) {
          _wave1DamageTally[arch] = (_wave1DamageTally[arch] || 0) + amount;
        }
      };
    }
  } else {
    _wave1DamageTally = null;
    if (typeof window !== 'undefined') window.__recordCombatDamage = null;
  }
  // Round-7-audit POLISH — stop any lingering 'cleared' ambient pad
  // from the PREVIOUS room. The pad is started when a combat room
  // clears (warm post-clear atmosphere); once we're loading a new
  // room, that purpose is done and the pad shouldn't bleed into
  // the next encounter's combat audio. No-op if pad isn't running.
  // Hamlet's pad is unaffected — enterHamletCanvas constructs its
  // own floor[0] without calling loadRoom.
  try { stopAmbientPad(); } catch (_e) {}
  // Reset the relic-choice modal so a stale "seen pedestals" cache from
  // a previous room can't suppress the modal in the new room.
  clearRelicChoiceModal();
  // FUNCTIONAL DOORS — wipe stale state. Doors will be re-set up after
  // buildRoomFromData populates room.tiles + room.doors. The clear flag
  // resets so onRoomCleared fires once when this new room is finished.
  clearDoors();
  _roomClearedNotified = false;
  // Set next-room hint so door preview can render the right icon (unless Blind curse)
  roomNextKind.kind = isCursed('blind') ? null : (floor[idx + 1]?.kind || null);
  // Onboarding — trigger tips based on room kind transitions.
  //
  // first_combat fires PRE-AGGRO (0.4s after room load) on the first
  // combat room, not 2.2s in. Onboarding audit P1: the old delay let
  // a brand-new player lose half their HP before reading "Move with
  // WASD." Now the tip appears as enemies are still settling, while
  // the player still has full HP and can read it.
  if (data.kind === 'combat' && currentFloorLevel === 1) {
    // 1-HP design (Path 3): the SURVIVAL tip (first_starting_hp) fires
    // FIRST — at 200ms — because it covers the most life-critical
    // teaching: "one heart, time SHIELD to perfect-block." Tips have
    // concurrency=1 + 5.5s life + 0.8s gap, so they queue serially;
    // whichever fires first is what the player sees during their
    // first ~6s of combat. With 1 HP that window may be ALL the
    // combat they get on run 1, so survival info wins priority.
    setTimeout(() => showTip('first_starting_hp'), 200);
    // first_combat (controls) lands second — in 6+ seconds — once
    // first_starting_hp has cycled out. Player who survives that long
    // gets reinforcement on the input scheme.
    setTimeout(() => showTip('first_combat'), 400);
    // first_dodge is the safety net for perfect-block teaching. The
    // first_starting_hp tip already mentions it; this is redundant
    // belt-and-suspenders. De-dup ensures it doesn't fire if the
    // discovery-triggered version (in hero.js) already landed.
    //
    // Audit guard: fire only if player is still alive in combat. A
    // player who died in <4s would otherwise have the tip seen-marked
    // without ever seeing it (rail might defer past death anyway, but
    // this is cleaner). _runSeq capture handles run-restart between
    // queue and fire.
    const _firstDodgeSeq = _runSeq;
    setTimeout(() => {
      if (_runSeq !== _firstDodgeSeq || !running) return;
      if (!hero || hero.hp <= 0 || hero.state === 'dead') return;
      showTip('first_dodge');
    }, 4000);
  }
  // Start room — give the player a "walk through the door north" cue.
  // Onboarding audit P0. The start room is a non-combat tile so
  // first_combat won't fire here; new players sat there waiting for
  // something to happen. This explicit dungeon-descent hint fires
  // 1.2s after the heartbeat reveal to nudge them toward the door.
  if (data.kind === 'start' && currentFloorLevel === 1) {
    setTimeout(() => showTip('first_descent_dungeon'), 1200);
  }
  if (data.kind === 'reward') {
    showTip('first_pedestal');
    // Polish: feedback-audit team flagged that sanctuary rooms had no
    // tonal punctuation. Combat rooms fire a synthChord on clear (the
    // "exhale" beat); sanctuaries arrived already cleared and stayed
    // silent. Fire a softer chord on sanctuary entry so the player
    // hears "you reached safety" as much as they see it. Lower
    // frequency than the combat-clear chord (392 vs 523) so the two
    // beats stay distinct in the player's ear.
    setTimeout(() => { try { synthChord(392, 0.55, 1.2); } catch (_e) {} }, 300);
    // Stat tracking — sanctuariesVisited was declared in stats.ts +
    // reset every run but NEVER incremented anywhere (system audit
    // found dead). Wired up here on first entry per room so re-loads
    // (save/resume mid-sanctuary) don't double-count. Surfaces in the
    // run-end summary alongside wandererTrades.
    if (!data._sanctuaryCounted) {
      data._sanctuaryCounted = true;
      stats.sanctuariesVisited++;
    }
  }
  // Round-7 Phase 5 — first BLOOD GATE encounter. Fires if any of the
  // outgoing edges from this room target a sealed node. setupRoomDoors
  // hasn't run yet at this point in loadRoom, so we read directly off
  // the graph node's edges list and check each target's `sealed` flag.
  if (currentGraph && currentNodeId != null) {
    const planNode = getFloorNode(currentGraph, currentNodeId);
    if (planNode && planNode.edges?.length) {
      const hasSealed = planNode.edges.some(eid => {
        const t = getFloorNode(currentGraph, eid);
        return t && t.sealed;
      });
      if (hasSealed) setTimeout(() => showTip('first_blood_gate'), 1400);
    }
  }
  // Room-kind onboarding tips (review onboarding pass) — fire once per player,
  // a short delay so the room settles before the banner appears.
  if (data.kind === 'altar')      setTimeout(() => showTip('first_altar'),      1200);
  if (data.kind === 'trove')      setTimeout(() => showTip('first_trove'),      1200);
  if (data.kind === 'chestroom')  setTimeout(() => showTip('first_chestroom'),  1200);
  if (data.kind === 'boss')       setTimeout(() => showTip('first_boss'),       1800);
  // Detect vanguard presence for first shielded enemy encounter
  if (data.spawns?.some(s => s.type === 'vanguard')) setTimeout(() => showTip('first_vanguard'), 1500);
  // Detect any elite presence for the affix-badge explainer
  if (data.spawns?.some(s => s.elite)) setTimeout(() => showTip('first_elite'), 1700);
  // THE RUIN REMEMBERS — inject persistent stains from past runs into this room
  const stain = data.kind === 'boss'
    ? getBossRoomStain(currentFloorLevel)
    : getRoomStain(currentFloorLevel, idx);
  data.ruinStain = stain;
  data.ruinAging = agingLevel();
  // THE HANGED MAN — lose 1 HP on every room entry (no effect on death).
  // Meta consolidation (review #3): gate also honors hero.memoryHanged
  // so the migrated Memory of the Hanged Man triggers the same penalty.
  if (((isTarotRun() && hasCard('the_hanged_man')) || hero.memoryHanged) && hero.hp > 1 && hero.state !== 'dead') {
    hero.hp -= 1;
    triggerScreenFlash('rgba(120, 50, 120, 0.2)', 0.3);
  }
  // SYSTEMS PASS — SECOND WIND relic: first dodge per room is free.
  // Refreshes the charge on every room entry.
  if (hero.secondWind) hero.secondWindAvailable = true;
  // VOW T2 ascendance — "discipline blocks the first strike". Refresh the
  // per-room shield charge on every room entry. Consumed in damageHero.
  if ((hero.activeThemes?.vow || 0) >= 2) hero.themeVowShieldAvailable = true;
  // STORMCALLER first-proc-per-room label flag — so the relic name is
  // shown again next time the player walks into a fresh combat room.
  hero._stormcallerShownThisRoom = false;
  // VOW ETERNAL legendary — first sword hit each room is a guaranteed
  // crit. Refresh the readiness flag on every room entry; consumed in
  // updateHero on the first damage-dealing sword swing. Pairs by
  // intent with the VOW theme — both refresh per-room.
  if (hero.vowEternal) hero.vowEternalReady = true;
  // SHADOW T2 is a short window after dodge, not per-room, so no reset here.
  // ── Compute the door plan from the graph BEFORE building the room ──────
  // Each outgoing edge of the current node becomes a door tile in the
  // north wall. The plan is just the list of x-tile positions; the
  // doorPortals module will turn them into door objects with state.
  const planNode = currentGraph && currentNodeId != null
    ? getFloorNode(currentGraph, currentNodeId)
    : null;
  const planEdges = planNode && planNode.edges ? planNode.edges : [];
  if (planEdges.length > 0 && data.doors?.north !== false) {
    data.doorPlan = data.doorPlan || {};
    const w = data.w || 20;
    const h = data.h || 14;
    data.doorPlan.north = computeDoorXs(w, planEdges.length, h, data.shape || 'rect');
  } else {
    data.doorPlan = data.doorPlan || {};
    data.doorPlan.north = null;
  }
  buildRoomFromData(data);
  // ── Set up door state objects (now that tiles[] exists) ────────────────
  // Pass the door X positions explicitly so the door OBJECTS sit on the
  // same tiles the room build pass actually carved as 'door'. Critical
  // for shaped rooms where the valid door range is narrower than full width.
  setupRoomDoors(currentGraph, currentNodeId, {
    hasSouthEntry: data.doors?.south !== false && data.kind !== 'start',
    doorXs: data.doorPlan?.north || null,
  });
  clearEnemies();
  clearProjectiles();
  clearPedestals();
  clearFx();
  clearSoulTethers();
  clearFlames();
  clearEmberRings();
  clearSynergies();
  clearWanderer();
  clearAmbientCreatures();   // fresh bat/raven cycle per room
  // Meta consolidation (review #3): Memory of the Hermit flag piggybacks
  // on the existing Tarot Hermit path so the Wanderer spawn logic stays
  // in one place.
  maybeSpawnWanderer(data.kind, (isTarotRun() && hasCard('the_hermit')) || !!hero.memoryHermit, currentFloorLevel);
  // Themed-room ambient motes — drift theme-color particles through the
  // play space when the active room carries a roomTheme. Skipped on
  // boss / hamlet / start where it would compete with set-piece visuals.
  const motesEligible = data.kind !== 'boss' && data.kind !== 'hamlet' && data.kind !== 'start';
  setThemedRoomActive(motesEligible ? (data.roomTheme || null) : null);
  // Per-floor music: each biome has its own ambient track; all share boss track
  const biomeTrack = BIOME_BY_FLOOR[currentFloorLevel] || 'ambient';
  playTrack(data.kind === 'boss' ? 'boss' : biomeTrack);
  // Per-floor scaling applies to every enemy in every combat/boss room
  const floorMul = FLOOR_ENEMY_MULS[currentFloorLevel] || { dmg: 1, hp: 1 };
  for (const s of data.spawns) {
    spawnEnemy(s.type, s.x * TILE + TILE/2, s.y * TILE + TILE/2, {
      elite: !!s.elite,
      boss: !!s.boss,
      hpMul: s.hpMul || 1,
      damageMul: s.damageMul || 1,
      floorHpMul: floorMul.hp,
      floorDmgMul: floorMul.dmg,
      echoPastBuild: s.echoPastBuild,      // passthrough for echo mechanics
      echoCombo: s.echoCombo,
    });
  }
  // ECHO announcement when entering a room with an Echo haunting it
  if (data.hasEcho && !data._echoAnnounced) {
    data._echoAnnounced = true;
    roomLabelText = '✧ AN ECHO STIRS ✧';
    roomLabelColor = '#c8d8ff';
    roomLabelTime = 2.4;
    pulseZoom(0.08, 0.8);
    triggerScreenFlash('rgba(140, 160, 220, 0.18)', 0.35);
    synthChord(440, 1.0, 1.0);      // mournful chord
    setTimeout(() => synthGloom(210, 0.7, 0.9), 400);
  }
  // Round-7 ROOM REWARD globals — set on every loadRoom so per-kill +
  // per-event hooks (e.g. enemies.js's gold drop) can read the active
  // room's bias without needing to walk the graph or refetch data.
  // Cleared (multiplier = 1) on rooms with no reward bias so the buff
  // doesn't leak past a single room. Only 'gold' rooms multiply gold;
  // other rewards are applied at clear time via the spawnRelicOffer
  // path (see post-clear block) or at altar spawn (legendary tier).
  if (typeof window !== 'undefined') {
    window.__roomGoldMul = data.roomReward === 'gold' ? 1.5 : 1;
  }

  // Altar rooms spawn their tier-weighted pedestals immediately on entry.
  // Pass currentFloorLevel through so the roll respects the floor (legacy
  // `3` HP-cost arg is ignored; pedestals.js scales cost by drawn tier).
  // Round-7 — roomReward='legendary' forces minTier='legendary' so the
  // door's "LEGENDARY" promise matches the offered relics. Without this
  // an altar door labeled LEGENDARY could roll a common+rare offer pair
  // on F2-F3 (since altars use floor weights, not the door reward tag).
  if (data.kind === 'altar') {
    const altarOpts = data.roomReward === 'legendary' ? { minTier: 'legendary' } : {};
    if (data.roomTheme) altarOpts.theme = data.roomTheme;
    spawnAltarOffer(3, currentFloorLevel, altarOpts);
    // Modal opens via E-press on the choice pedestal (not auto-open).
  }

  // Round-7 Phase 4-lite — SHOP rooms spawn 3 priced pedestals on entry.
  // No enemies; cleared from the start so doors never close. Player can
  // buy any number of items (or none) and walk through the north door.
  // first_shop tip fires 1.2s after load — long enough for the room to
  // settle, short enough that a quick player still reads it before
  // pressing E.
  if (data.kind === 'shop') {
    spawnShopOffer(currentFloorLevel, data.roomTheme ? { theme: data.roomTheme } : {});
    setTimeout(() => showTip('first_shop'), 1200);
    // Shops are legacy multi-pedestal — no modal trigger here. Each
    // shop pedestal still uses E-press to buy individually.
  }

  // Boss room — dramatic intro: hold gameplay for ~2s while showing boss name
  if (data.kind === 'boss') {
    // THE WATCHER — first-time arrival at the final-floor throne is a
    // milestone utterance. Fires BEFORE the intro so the drawWatcher gate
    // (defers on bossIntroTime > 0) holds the line until the ceremony ends.
    if (currentFloorLevel >= MAX_FLOORS) watcherOnFinalBossEnter();
    bossIntroBoss = enemies.find(e => e.boss);
    // Cinematic skip-on-repeat — first time the player meets this boss
    // type they get the full 2.2s theatre treatment (full epithet read,
    // backdrop fade, name typography). Subsequent runs against the same
    // boss cut to ~2.0s — long enough to actually read BOSS tag + name
    // + flavor and brace for the fight. Earlier 1.3s sat below the
    // threshold where Hades / Hollow Knight cinematics typically live
    // (2.5–3.5s minimum even on repeats); 2.0s reads cleanly without
    // making the player feel they're tapping through the same scene
    // every descent. markSeen returns true on first sight; we invert it.
    const _bossKey = bossIntroBoss?.type || 'unknown';
    const _firstBoss = markSeen('boss_intro', _bossKey);
    bossIntroFast = !_firstBoss;
    bossIntroTotal = _firstBoss ? 2.2 : 2.0;
    bossIntroTime = bossIntroTotal;
    bossIntroStartedAt = performance.now();    // wall-clock mark for the 2.5s clamp
    // Hero invulnerability that covers the entire intro PLUS a post-intro
    // buffer (3.0s total: 2.2s intro + 0.3s wall-clock-clamp tail + 0.5s
    // so the player has time to orient before the boss's first swing lands).
    // The intro-freeze block in tick() already prevents updateHero/Enemies
    // from running, but this is belt-and-suspenders against:
    //   - the single same-frame window where the boss room loads + enemies
    //     spawn BEFORE the next-frame freeze kicks in
    //   - the "intro ends, boss swings instantly" micro-gap
    //   - any future refactor that accidentally lets damage through
    // Math.max preserves any longer iframes already in flight (e.g. from
    // a recent post-hurt stagger). Scales with bossIntroTotal so the
    // skip-on-repeat fast intro doesn't strand the player with leftover
    // invuln (1.3s intro + 0.3s tail + 0.5s orient = 2.1s on repeat;
    // 3.0s on first sight as before).
    hero.iframes = Math.max(hero.iframes || 0, bossIntroTotal + 0.8);
    shakeCamera(14, 0.5);
    pulseZoom(0.14, 1.0);                       // cinematic punch-in on boss entry
    // Audio stinger — deep metal impact to punctuate the intro
    playSfx('hero_hurt', { rate: 0.35, volume: 1.0 });
    setTimeout(() => playSfx('slime_death', { rate: 0.5, volume: 0.85 }), 180);
    setTimeout(() => playSfx('hero_hurt', { rate: 0.28, volume: 0.9 }), 520);
  } else {
    bossIntroTime = 0;
    bossIntroBoss = null;
    bossIntroStartedAt = 0;
  }

  // Show room name as a floating label for a moment (skip entrance and reward — those are obvious)
  const labelMap = {
    combat:    { text: 'COMBAT',            color: '#e0b0b0' },
    altar:     { text: 'ALTAR OF EXCHANGE', color: '#ff6a85' },
    challenge: { text: 'CHALLENGE',         color: '#ffb265' },
    boss:      { text: 'BOSS',              color: '#ff7055' },
    reward:    { text: 'SANCTUARY',         color: '#86e3a8' },
    trove:     { text: 'TROVE',             color: '#f4d9a0' },
  };
  if (labelMap[data.kind]) {
    roomLabelText = labelMap[data.kind].text;
    roomLabelColor = labelMap[data.kind].color;
    roomLabelTime = 1.8;
  }
  // Place hero at the appropriate entry side
  const sp = heroSpawnInRoom();
  hero.x = sp.x; hero.y = sp.y;
  hero.vx = 0; hero.vy = 0;
  // ── Room reveal (Hades/Isaac-tier camera arrival) ─────────────────
  // Comparison-vs-Hades audit P0: previously the camera SNAPPED to the
  // hero's spawn position the moment a room loaded. Top roguelites
  // pause briefly at the room's center so the player can read the
  // layout (where are the threats? exits? pickups?) before the camera
  // settles on the hero. Adds a half-beat of "stepping into the
  // space" without delaying combat — the existing camera lerp does
  // the smooth pan from center to hero automatically.
  //
  // Skipped for hamlet (player owns the framing in a safe space) and
  // for the dungeon's start room (the FLOOR I card already serves
  // that role on entry).
  if (data.kind !== 'hamlet' && data.kind !== 'start') {
    const cx = ((room.w || 20) * TILE) / 2;
    const cy = ((room.h || 14) * TILE) / 2;
    camera.x = cx; camera.y = cy;
    camera.targetX = cx; camera.targetY = cy;
    _roomRevealCx = cx;
    _roomRevealCy = cy;
    _roomRevealTime = 0.55;
  } else {
    // Snap camera instantly so the new room fills the frame on transition
    camera.x = hero.x; camera.y = hero.y;
    camera.targetX = hero.x; camera.targetY = hero.y;
    _roomRevealTime = 0;
  }
  roomIndex = idx;
}

const BIOME_BY_FLOOR = { 1: 'crypt', 2: 'vault', 3: 'abyss', 4: 'inferno' };

function triggerFloorCard(level) {
  const d = FLOOR_CARD_DATA[level] || { roman: '?', name: '???', flavor: '', backdrop: '' };
  floorCardRoman = d.roman;
  floorCardName = d.name;
  floorCardFlavor = d.flavor;
  floorCardBackdrop = d.backdrop || '';
  // Cinematic skip-on-repeat — first time you see this floor's card it
  // gets the full 3.2s theatre treatment so the typography + zone
  // backdrop land. Subsequent runs through the same floor cut to ~half
  // (1.6s) so the player isn't paying a tax on the cinematic every loop.
  // markSeen returns true on first sight; we invert it for the duration.
  const firstTime = markSeen('floor_card', level);
  floorCardTotal = firstTime ? 3.2 : 1.6;
  floorCardTime = floorCardTotal;
  floorCardStartedAt = performance.now();    // wall-clock mark for the clamp
  // Hero should NOT be moving while the card reads — zero velocity so the
  // freeze reads as a deliberate hold, not a pause at mid-stride.
  hero.vx = 0; hero.vy = 0;
  // Audio "lift" for the typography moment — without this, the splashy
  // 3.2s reveal reads as a silent freeze. A low resonant chord (E2 = 165Hz)
  // sells the descent's gravity. Pitched lower for floor 1 and rising
  // pentatonically per floor so the audio mirrors the descent.
  const baseFreq = 165;
  const freq = baseFreq * Math.pow(1.25, Math.max(0, level - 1));   // 165, 206, 258, 322
  synthChord(freq, 0.55, 1.6);
}

// (Old abstract Ethera prologue retired. The Keeper wake cinematic
// in playKeeperWake() below is the new first-entry intro — see the
// large block further down with the full design rationale.)

// ============================================================================
// KEEPER WAKE CINEMATIC — first-ever hamlet entry monologue.
//
// Replaces the abstract Ethera prologue (text on a black screen with no
// speaker). The Keeper is the actual speaker now; her lines play over a
// translucent darkness that LETS THE HAMLET SHOW THROUGH so the player
// sees her in the scene as she talks. Reframes the whole roguelite:
// the player’s first run isn’t an introduction to the ruin — it’s
// their SECOND descent. The Keeper has already pulled them out once.
// Every subsequent death + return is more of the same thing she has
// been doing all along.
//
// Visual structure:
//   - Translucent gradient overlay (lighter top, heavier bottom) so the
//     subtitle band reads cleanly without obscuring the painted scene.
//   - Speaker plate at top: small candle-flame sigil + "THE KEEPER".
//   - Subtitle band at y=78%: italic body text, type-on character
//     reveal so each beat reads as SPOKEN, advanced by click/space/enter.
//   - Skip hint fades in after the final beat finishes typing.
//
// Input lock: the wake fires from the menu state where `running=false`
// already gates hero update + the hamlet update branch. The capture-
// phase keydown handler in playKeeperWake eats Space/Enter/E/WASD
// before any gameplay handler could see them anyway. The
// `_wakeCinematicActive` flag is read by ONE consumer downstream:
// the per-tick `__centerBannerActive` recompute (~line 5125), so
// contextual tips (showTip) defer beneath the cinematic instead
// of stacking under the overlay.
// ============================================================================
let _wakeCinematicActive = false;
// One-shot flag: true for the single re-entry that follows the wake
// cinematic, then cleared. Spawns the hero NEXT TO the Keeper for that
// entry (sells the "she pulled you up the stairs" framing). All
// subsequent entries spawn at the regular HAMLET_HERO_SPAWN.
let _freshFromWake = false;

// REDESIGNED intro layout. Previous version (faint candle sigil + tiny
// "THE KEEPER" label at top + subtitle stuck at 78% y + skip-hint that
// only fades in on the FINAL beat) didn't telegraph "click to advance"
// — players reported the screen looking confused, not even knowing to
// progress. New layout: solid opaque backdrop (no canvas bleed-through),
// letterbox bars top + bottom for clear "cutscene" framing, speaker
// label inside the top bar, subtitle vertically centered with larger
// 24px italic, AND a continue prompt visible from beat 1 (pulses, says
// "click or SPACE" while typing-done OR "click to skip" while typing).
// Plus an always-visible "ESC skip" hint in the top-right.
const keeperWakeEl = document.createElement('div');
keeperWakeEl.style.cssText = 'position:absolute;inset:0;display:none;flex-direction:column;align-items:stretch;background:#0a0610;color:#f4d9a0;pointer-events:auto;font-family:Georgia,"Cormorant Garamond",serif;cursor:pointer;z-index:40;';
keeperWakeEl.innerHTML = `
  <!-- Subtle radial gold-warm wash over the solid backdrop. Reads as
       firelight in a dark room without making the backdrop translucent
       (the prior 92% gradient let the canvas world bleed through). -->
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%, rgba(40,28,20,0.55) 0%, rgba(12,6,14,0.0) 65%);pointer-events:none;"></div>

  <!-- TOP LETTERBOX — solid black bar with the speaker label centered. -->
  <div style="position:relative;height:64px;background:#000;display:flex;align-items:center;justify-content:center;flex-shrink:0;border-bottom:1px solid rgba(201,168,106,0.18);">
    <div id="wakeSpeaker" style="display:flex;align-items:center;gap:14px;opacity:0;transition:opacity 1s ease;">
      <!-- Small candle flame sigil to the LEFT of the name — a single
           flicker of warmth in the bar. -->
      <div style="position:relative;width:14px;height:14px;">
        <div style="position:absolute;inset:0;background:radial-gradient(circle at 50% 60%, #ffd680 0%, #c9a86a 40%, transparent 75%);box-shadow:0 0 10px rgba(255,214,128,0.5);"></div>
        <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:4px;height:7px;background:radial-gradient(circle at 50% 75%, #fff2c0 0%, #ffd680 60%, #c9a86a 100%);border-radius:50%/60% 60% 40% 40%;"></div>
      </div>
      <div style="font-size:13px;letter-spacing:9px;color:#c9a86a;font-style:italic;text-shadow:0 0 8px rgba(201,168,106,0.4);">THE KEEPER</div>
    </div>
    <!-- Always-visible Esc hint in the top-right of the letterbox. -->
    <div style="position:absolute;right:24px;top:50%;transform:translateY(-50%);font-size:9px;letter-spacing:3px;color:rgba(201,168,106,0.45);font-style:italic;">ESC TO SKIP</div>
  </div>

  <!-- CENTER STAGE — subtitle vertically centered between the bars. -->
  <div style="flex:1;display:flex;align-items:center;justify-content:center;position:relative;padding:20px;">
    <div id="wakeSubtitle" style="max-width:840px;width:90%;text-align:center;font-size:24px;line-height:1.55;font-style:italic;color:#f4d9a0;text-shadow:0 0 14px rgba(0,0,0,0.8);letter-spacing:0.5px;"></div>
  </div>

  <!-- BOTTOM LETTERBOX — continue prompt centered in the bar. Visible
       from beat 1 (gentle pulse) so the player always knows clicking
       advances. Text swaps between "click to skip" (typing) and
       "click or SPACE to continue" (typing-done). -->
  <div style="position:relative;height:64px;background:#000;display:flex;align-items:center;justify-content:center;flex-shrink:0;border-top:1px solid rgba(201,168,106,0.18);">
    <div id="wakePrompt" style="display:flex;align-items:center;gap:12px;opacity:0;transition:opacity 0.4s ease;">
      <span style="font-size:14px;color:#c9a86a;text-shadow:0 0 8px rgba(201,168,106,0.55);animation:wakePromptPulse 1.6s ease-in-out infinite;">▾</span>
      <span id="wakePromptText" style="font-size:11px;letter-spacing:5px;color:#c9a86a;font-style:italic;text-shadow:0 0 6px rgba(201,168,106,0.35);">CLICK OR PRESS SPACE TO CONTINUE</span>
      <span style="font-size:14px;color:#c9a86a;text-shadow:0 0 8px rgba(201,168,106,0.55);animation:wakePromptPulse 1.6s ease-in-out infinite;">▾</span>
    </div>
  </div>
`;
document.getElementById('hud').appendChild(keeperWakeEl);

// Inject the wake-prompt pulse keyframes once. Pulses opacity between
// 0.5 and 1.0 so the prompt feels alive without strobing.
(() => {
  const style = document.createElement('style');
  style.textContent = `@keyframes wakePromptPulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }`;
  document.head.appendChild(style);
})();

function playKeeperWake(onDone) {
  if (_wakeCinematicActive) return;
  _wakeCinematicActive = true;
  // Tip system listens for window.__centerBannerActive so contextual
  // tips (first_descent_hint, etc.) don’t fire over the cinematic.
  window.__centerBannerActive = true;
  const subtitleEl = document.getElementById('wakeSubtitle');
  const promptEl = document.getElementById('wakePrompt');
  const promptTextEl = document.getElementById('wakePromptText');
  const speakerEl = document.getElementById('wakeSpeaker');
  subtitleEl.textContent = '';
  promptEl.style.opacity = '0';
  speakerEl.style.opacity = '0';
  keeperWakeEl.style.display = 'flex';
  let idx = 0;
  let typing = false;
  let typeTimer = 0;
  let dismissed = false;
  // Tracks whether the player heard the final beat. Set true when
  // armFinalBeatDismiss fires (final beat fully on screen). Used by
  // done() to decide whether to play the closing chord - natural
  // completion gets a sting; Esc skip mid-cinematic stays silent.
  let reachedFinal = false;
  const done = () => {
    if (dismissed) return;
    dismissed = true;
    _wakeCinematicActive = false;
    window.__centerBannerActive = false;
    keeperWakeEl.style.display = 'none';
    document.removeEventListener('keydown', keyHandler, true);
    keeperWakeEl.removeEventListener('click', clickHandler);
    if (typeTimer) clearTimeout(typeTimer);
    // Closing chord - a fifth above the open chord (196 -> 294 Hz, perfect
    // fifth) lands as resolution. Only fires on natural completion so
    // Esc-skip mid-cinematic stays silent.
    if (reachedFinal) {
      try { synthChord(294, 0.6, 1.6); } catch (_e) {}
    }
    if (onDone) onDone();
  };
  // Type out the current beat. ~28ms per char, slowed on punctuation,
  // reads as paced speech. Returns control to the advance handler when
  // the full beat is on screen.
  // initialDelay (default 0) is the pause BEFORE the first character
  // appears. Used by the very first beat to give the open chord 1.1s
  // of lead-in before the keeper "speaks." typing is set true even
  // during this pause so an early click/keypress fast-forwards to
  // the full beat instead of accidentally skipping past beat 0.
  const typeBeat = (text, onTypeDone, initialDelay = 0) => {
    typing = true;
    // While typing, the prompt says "click to skip" — clearer than
    // having it read "continue" while a beat is still mid-reveal.
    promptTextEl.textContent = 'CLICK OR PRESS SPACE TO SKIP TYPING';
    let i = 0;
    const tick = () => {
      if (dismissed) return;
      if (i < text.length) {
        subtitleEl.textContent = text.slice(0, ++i);
        // Reveal the prompt the moment the FIRST character types — the
        // player always sees a visible "click to advance" affordance.
        if (i === 1 && promptEl.style.opacity !== '1') {
          promptEl.style.opacity = '1';
        }
        const ch = text[i - 1];
        const delay = (ch === ',' || ch === ';') ? 110 : (ch === '.' || ch === '?' || ch === '!') ? 240 : 28;
        // Soft per-punctuation tick — audio review P1. Without this the
        // mid-cinematic typewriter is silent between the open and close
        // chords, which feels muted. Click is low-volume (0.04) so it
        // reads as a soft breath/pause rather than a UI click — same
        // technique used by classic story-typewriter games.
        if (ch === '.' || ch === '?' || ch === '!' || ch === ',') {
          try { synthClick(2.0, 0.04); } catch (_e) {}
        }
        typeTimer = setTimeout(tick, delay);
      } else {
        typing = false;
        // Typing done — swap prompt to "continue" wording.
        promptTextEl.textContent = 'CLICK OR PRESS SPACE TO CONTINUE';
        if (onTypeDone) onTypeDone();
      }
    };
    if (initialDelay > 0) typeTimer = setTimeout(tick, initialDelay);
    else tick();
  };
  // Fires the "final beat is fully on screen" payload — show skip hint +
  // arm 10s auto-dismiss safety. Lifted out of typeBeat's onTypeDone so
  // the fast-forward branch (advance during typing) can also call it
  // when fast-forwarding the LAST beat. Without this, a player who
  // Space-spammed through and clicked once on the final beat got
  // stuck — no auto-dismiss timer ever scheduled.
  const armFinalBeatDismiss = () => {
    reachedFinal = true;
    // Final beat — swap the prompt to make the "this ends here" beat
    // explicit instead of just looking like another mid-cinematic
    // continue. The 10s auto-dismiss safety timer was REMOVED in the
    // accessibility pass: it dumped slow readers into the hamlet
    // mid-thought (a11y review P0). The "CLICK OR PRESS SPACE" prompt
    // is enough — players who want to leave can; players who want to
    // sit with the moment can.
    promptTextEl.textContent = 'CLICK OR PRESS SPACE TO ENTER THE HAMLET';
  };
  const advance = () => {
    if (dismissed) return;
    // Mid-typing advance fast-forwards to the end of the current beat.
    if (typing) {
      if (typeTimer) clearTimeout(typeTimer);
      subtitleEl.textContent = KEEPER_WAKE_BEATS[idx];
      typing = false;
      // If we just fast-forwarded the FINAL beat, arm the same dismiss
      // safety the natural-end onTypeDone would have armed.
      if (idx === KEEPER_WAKE_BEATS.length - 1) armFinalBeatDismiss();
      return;
    }
    idx++;
    if (idx >= KEEPER_WAKE_BEATS.length) {
      done();
      return;
    }
    const isLast = idx === KEEPER_WAKE_BEATS.length - 1;
    typeBeat(KEEPER_WAKE_BEATS[idx], () => {
      if (isLast) armFinalBeatDismiss();
    });
  };
  // Capture-phase keydown so the cinematic eats keys before gameplay
  // handlers (WASD, E-interact). Same handler covers advance + final
  // dismiss; Esc is an immediate skip.
  const keyHandler = (e) => {
    if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); return done(); }
    // Eat all gameplay-relevant keys so they don't accumulate in
    // input.js's keys[] map under the cinematic. Space/Enter/E
    // advance the beat; WASD + arrow keys are eaten silently so
    // the hero doesn't walk the moment the cinematic dismisses.
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE'
      || e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD'
      || e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') advance();
    }
  };
  const clickHandler = () => advance();
  document.addEventListener('keydown', keyHandler, true);
  keeperWakeEl.addEventListener('click', clickHandler);
  // Open chord — low, slow, the same warmth as the keeper’s tone.
  try { synthChord(196, 0.75, 1.8); } catch (e) {}
  // Speaker plate fades in first (0.4s); the first beat kicks off
  // typing 1.1s after that, giving the open chord lead-time. Using
  // typeBeat's initialDelay rather than a separate setTimeout means
  // an early advance (player rushing through) fast-forwards the
  // first beat instead of skipping past it to beat 1.
  setTimeout(() => { speakerEl.style.opacity = '1'; }, 400);
  typeBeat(KEEPER_WAKE_BEATS[0], null, 1100);
}

// EPILOGUE — shown once, ever, on the first full clear. Counterpart to the
// prologue: the prologue frames entering the ruin; the epilogue frames
// reaching the bottom. After dismissal, flow continues to showEndOfRun.
// Gated by firstSeen('epilogue', 'first_clear') — see hasSeen check at
// the win-call site below. The legacy 'ethera:seen_epilogue:v1' flag was
// retired in the same cleanup pass; firstSeen owns this beat now.
const EPILOGUE_BEATS = [
  'You walked to the bottom.',
  'For a moment, the ruin forgot its hunger.',
  'But Ethera is older than any victory.',
  'The wound you closed will open again \u2014',
  'and the dark, when it wakes, will remember your name.',
];
const epilogueEl = document.createElement('div');
epilogueEl.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:safe center;flex-direction:column;background:radial-gradient(ellipse at center,#1a0a0e 0%,#0a0610 60%,#020104 100%);color:#f4d9a0;pointer-events:auto;font-family:Georgia,"Cormorant Garamond",serif;padding:40px;box-sizing:border-box;cursor:pointer;z-index:40;overflow-y:auto;';
epilogueEl.innerHTML = `
  <div style="position:absolute;top:22px;left:22px;width:48px;height:48px;pointer-events:none;">
    <div style="position:absolute;top:0;left:0;width:48px;height:1px;background:linear-gradient(90deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;top:0;left:0;width:1px;height:48px;background:linear-gradient(180deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;top:-2px;left:-2px;width:4px;height:4px;background:#c9a86a;transform:rotate(45deg);"></div>
  </div>
  <div style="position:absolute;top:22px;right:22px;width:48px;height:48px;pointer-events:none;">
    <div style="position:absolute;top:0;right:0;width:48px;height:1px;background:linear-gradient(270deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;top:0;right:0;width:1px;height:48px;background:linear-gradient(180deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;top:-2px;right:-2px;width:4px;height:4px;background:#c9a86a;transform:rotate(45deg);"></div>
  </div>
  <div style="position:absolute;bottom:22px;left:22px;width:48px;height:48px;pointer-events:none;">
    <div style="position:absolute;bottom:0;left:0;width:48px;height:1px;background:linear-gradient(90deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;bottom:0;left:0;width:1px;height:48px;background:linear-gradient(0deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;bottom:-2px;left:-2px;width:4px;height:4px;background:#c9a86a;transform:rotate(45deg);"></div>
  </div>
  <div style="position:absolute;bottom:22px;right:22px;width:48px;height:48px;pointer-events:none;">
    <div style="position:absolute;bottom:0;right:0;width:48px;height:1px;background:linear-gradient(270deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;bottom:0;right:0;width:1px;height:48px;background:linear-gradient(0deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;bottom:-2px;right:-2px;width:4px;height:4px;background:#c9a86a;transform:rotate(45deg);"></div>
  </div>
  <!-- A small ornament above the text — sets this apart from the prologue. -->
  <div style="display:flex;align-items:center;gap:18px;margin-bottom:40px;opacity:0.7;">
    <div style="width:80px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
    <div style="color:#c9a86a;font-size:11px;letter-spacing:6px;font-style:italic;">the ruin yields</div>
    <div style="width:80px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
  </div>
  <div id="epilogueLines" style="display:flex;flex-direction:column;align-items:center;gap:28px;text-align:center;max-width:760px;"></div>
  <div id="epilogueSkip" style="position:absolute;bottom:42px;left:0;right:0;text-align:center;font-size:10px;letter-spacing:6px;color:#c9a86a;opacity:0;font-style:italic;transition:opacity 0.6s ease;">click or press any key to continue</div>
`;
document.getElementById('hud').appendChild(epilogueEl);

function playEpilogue(onDone) {
  const lines = document.getElementById('epilogueLines');
  const skip = document.getElementById('epilogueSkip');
  lines.innerHTML = '';
  epilogueEl.style.display = 'flex';
  let idx = 0;
  let dismissed = false;
  const done = () => {
    if (dismissed) return;
    dismissed = true;
    markSeen('epilogue', 'first_clear');
    epilogueEl.style.display = 'none';
    document.removeEventListener('keydown', keyHandler);
    epilogueEl.removeEventListener('click', clickHandler);
    if (onDone) onDone();
  };
  const keyHandler = () => done();
  const clickHandler = () => done();
  const revealNext = () => {
    if (idx >= EPILOGUE_BEATS.length) {
      skip.style.opacity = '0.75';
      document.addEventListener('keydown', keyHandler);
      epilogueEl.addEventListener('click', clickHandler);
      setTimeout(done, 7000);
      return;
    }
    const line = document.createElement('div');
    const isLast = idx === EPILOGUE_BEATS.length - 1;
    line.textContent = EPILOGUE_BEATS[idx];
    line.style.cssText = `
      font-size:${isLast ? 22 : 20}px;
      letter-spacing:${isLast ? 4 : 2}px;
      color:${isLast ? '#f4d9a0' : '#d8cfae'};
      font-style:${isLast ? 'normal' : 'italic'};
      opacity:0;
      transform:translateY(12px);
      transition:opacity 1.4s ease, transform 1.4s ease;
      text-shadow:${isLast ? '0 0 14px rgba(244,217,160,0.5)' : '0 0 8px rgba(0,0,0,0.6)'};
      line-height:1.5;
    `;
    lines.appendChild(line);
    requestAnimationFrame(() => {
      line.style.opacity = '1';
      line.style.transform = 'translateY(0)';
    });
    idx++;
    setTimeout(revealNext, isLast ? 1800 : 1700);
  };
  // Triumphant chord on open — inverse of the prologue's low ominous one.
  try { synthChord(523, 1.4, 1.6); setTimeout(() => synthChord(659, 1.0, 1.0), 400); } catch (e) {}
  setTimeout(revealNext, 700);
}

// ============================================================================
// RUN SNAPSHOT — save run state at floor boundaries so the player can resume
// after closing the browser / returning later. Only snapshots at boundaries
// (start of each floor), so mid-floor progress is lost — but the loadout
// survives. Keeps the save surface tiny and deterministic.
// ============================================================================
const RUN_SNAPSHOT_KEY = 'ethera:run_snapshot:v1';

/**
 * Phase 5 audit fix #6 — RunSnapshot shape, documented as the
 * authoritative schema. Future migrations + new fields land in this
 * typedef alongside the migration entry. Lives near the save/load
 * code so the contract + the consumers stay co-located.
 *
 * `_schema` increments per breaking change; see RUN_SNAPSHOT_SCHEMA
 * comment block below. Currently 1.
 *
 * @typedef {Object} RunSnapshot
 * @property {number} _schema             - schema version (RUN_SNAPSHOT_SCHEMA at write time)
 * @property {number} floorLevel          - floor index 1..MAX_FLOORS
 * @property {number} maxHp               - hero max HP at save time
 * @property {number} hp                  - hero current HP at save time
 * @property {number} gold                - gold.total
 * @property {string} weapon              - hero.weapon (sword/dagger/hammer/wand)
 * @property {('sword'|'blast')} activeWeapon - wizard-kit slot
 * @property {string[]} relicIds          - equipped relic ids in pickup order
 * @property {string[]} curseIds          - active curse ids
 * @property {string[]} tarotIds          - drawn tarot card ids
 * @property {?string} memoryId           - selected memory id (null if none)
 * @property {boolean} dailyActive        - run is the daily seed
 * @property {number} timestamp           - Date.now() at save
 * @property {RunSnapshotMods} mods       - non-relic multiplier bundle
 * @property {RunSnapshotCounters} counters - rhythm-counter state
 *
 * @typedef {Object} RunSnapshotMods
 * @property {number} damageMul
 * @property {number} damageTakenMul
 * @property {number} attackCooldownMul
 * @property {number} dodgeCooldownMul
 * @property {number} speedMul
 * @property {number} reachMul
 * @property {number} knockbackMul
 * @property {number} dodgeDistMul
 * @property {number} critChance
 * @property {number} critMul
 * @property {number} lifesteal
 * @property {number} regenRate
 * @property {number} executeThreshold
 * @property {number} executeMul
 * @property {number} boltLifeMul
 * @property {number} revives             - consumable count (phoenix saves)
 *
 * @typedef {Object} RunSnapshotCounters
 * @property {number} chainCount
 * @property {number} pyroCount
 * @property {number} soulKillCount
 * @property {number} arcaneQuiverHits
 * @property {number} ringingSteelStacks
 * @property {number} twinPulseTick
 * @property {number} mountainStrikeCounter
 * @property {number} razorPaceHits
 * @property {boolean} vowEternalReady
 *
 * @typedef {{from: number, to: number, migrate: (snap: any) => any}} RunSnapshotMigration
 */

// Phase 5 audit fix #1 — internal schema version stamped on each saved
// snapshot. Distinct from the `:v1` suffix in RUN_SNAPSHOT_KEY (that's
// the storage-bucket version; bumping it discards old data wholesale).
// SCHEMA_VERSION is a soft version that lets loadRunSnapshot detect
// "this snapshot was written by an older shape of the code" and run
// migrations or gracefully drop the snapshot rather than restoring
// half a build.
//
// Bump SCHEMA_VERSION when ANY of the following change in a way that
// post-load resumeRun can't reconstruct cleanly:
//   - shape of snap.mods (add/remove a multiplier field)
//   - shape of snap.counters
//   - top-level snapshot fields (memoryId, weapon, activeWeapon, etc.)
//   - meaning of an existing field (e.g. floorLevel encoding changes)
//
// Do NOT bump for additive-only changes that older code would silently
// ignore (e.g. adding a new relic id — relicIds is a string array,
// resumeRun's RELIC_DEFS lookup handles unknown ids gracefully).
//
// Add migrations to RUN_SNAPSHOT_MIGRATIONS in chronological order;
// each takes a snap pre-migration + returns the snap post-migration.
const RUN_SNAPSHOT_SCHEMA = 1;
// (currently empty — populated as schema bumps land)
const RUN_SNAPSHOT_MIGRATIONS = [
  // Example shape:
  // { from: 1, to: 2, migrate: (snap) => ({ ...snap, newField: defaultValue }) },
];

function saveRunSnapshot() {
  try {
    const snap = {
      // Schema version stamp — read by loadRunSnapshot to detect stale
      // shapes and (in the future) run migrations.
      _schema: RUN_SNAPSHOT_SCHEMA,
      floorLevel: currentFloorLevel,
      maxHp: hero.maxHp,
      hp: hero.hp,
      gold: gold.total,
      weapon: hero.weapon || 'sword',
      // Wizard-kit Sprint 3D — activeWeapon persists across save/resume.
      // Without this field, a player with blast equipped who quits/resumes
      // would silently lose their slot (resetHero defaults to 'sword').
      activeWeapon: hero.activeWeapon || 'sword',
      relicIds: equippedRelics.map(r => r.id),
      curseIds: [...activeCurses],
      tarotIds: drawnCards.map(c => c.id),
      // Memory the run STARTED with — pinned to snap so resumeRun can
      // replay applySelectedMemory(memoryId) and re-set the flag fields
      // (memoryBell, memoryNine, memoryHungryBlade, memoryHermit,
      // memoryHanged, etc.) that resetHero zeroes. Without this, every
      // memory's flag-driven behavior dies on resume — only the multiplier
      // bonuses survive (via snap.mods). Also preserves the run's memory
      // identity if the player swaps selection between save and resume.
      memoryId: selectedMemoryId,
      dailyActive: !!daily.activeForRun,
      timestamp: Date.now(),
      // Multiplier bundle — captures the FINAL run-start state of every
      // hero stat that gets mutated by non-relic sources (meta unlocks,
      // curse modifiers, tarot effects, memory bonuses). Without these,
      // resumeRun could only rebuild multipliers from the relics list,
      // silently losing every other multiplicative source. Per-bug
      // example: a glass_blade + sharpened_edge + the_hanged_man run
      // would lose damageMul × 1.4 × 1.10 × 1.30 = 2.002× → only the
      // relic part remained on resume. Same applies to damageTakenMul,
      // dodgeCooldownMul, etc.
      mods: {
        damageMul: hero.damageMul,
        damageTakenMul: hero.damageTakenMul,
        attackCooldownMul: hero.attackCooldownMul,
        dodgeCooldownMul: hero.dodgeCooldownMul,
        speedMul: hero.speedMul,
        reachMul: hero.reachMul,
        knockbackMul: hero.knockbackMul,
        dodgeDistMul: hero.dodgeDistMul,
        critChance: hero.critChance,
        critMul: hero.critMul,
        lifesteal: hero.lifesteal,
        regenRate: hero.regenRate,
        executeThreshold: hero.executeThreshold,
        executeMul: hero.executeMul,
        boltLifeMul: hero.boltLifeMul,
        // CONSUMABLE — revives are added by phoenix_cloak.apply() and
        // phoenix_tear.apply() at +1 each. Without persisting the live
        // count, a resume re-fires applyRelic and restores any revives
        // the player has already consumed (free phoenix on every resume).
        revives: hero.revives | 0,
      },
      // Rhythm-counter state — ALL of these decay to 0 across rooms
      // anyway (chain decay, swingChainTime), but a player who picks a
      // legendary like Vow Eternal during floor 2 and resumes from the
      // main menu rightfully expects the readiness flag to be honored.
      // Same for arcaneQuiverHits / pyroCount / chainCount — without
      // these, resume always wipes counter progress to zero, making a
      // mid-room interrupt feel like a silent regression.
      counters: {
        chainCount: hero.chainCount | 0,
        pyroCount: hero.pyroCount | 0,
        soulKillCount: hero.soulKillCount | 0,
        arcaneQuiverHits: hero.arcaneQuiverHits | 0,
        ringingSteelStacks: hero.ringingSteelStacks | 0,
        twinPulseTick: hero.twinPulseTick | 0,
        mountainStrikeCounter: hero.mountainStrikeCounter | 0,
        razorPaceHits: hero.razorPaceHits | 0,
        vowEternalReady: !!hero.vowEternalReady,
        // Save-snapshot completeness audit (Stage 1 of audit plan):
        // these counters all decay-zero on resetHero but represent real
        // mid-run progress that's worth preserving across browser-quit.
        // None of them are in `mods` because they're INT counters, not
        // float multipliers, but they have the same persistence rationale.
        coinOfTyrantCounter: hero.coinOfTyrantCounter | 0,
        sparrowCounter: hero.sparrowCounter | 0,
      },
    };
    localStorage.setItem(RUN_SNAPSHOT_KEY, JSON.stringify(snap));
  } catch (e) {}
}
function loadRunSnapshot() {
  try {
    const raw = localStorage.getItem(RUN_SNAPSHOT_KEY);
    if (!raw) return null;
    let s = JSON.parse(raw);
    if (!s || !s.floorLevel || s.floorLevel < 1 || s.floorLevel > MAX_FLOORS) return null;
    // Phase 5 audit fix #1 — schema-version validation + migration.
    // Snapshots without _schema are pre-versioning (legacy). Treat them
    // as schema=1 so the load path is forward-compatible from day one;
    // future bumps then have a clear "from=1" baseline to migrate
    // through. Snapshots from a NEWER schema than the running code
    // are dropped — the player's save is from a future version of the
    // code that this build doesn't know how to interpret.
    const incomingSchema = (typeof s._schema === 'number') ? s._schema : 1;
    if (incomingSchema > RUN_SNAPSHOT_SCHEMA) {
      // Forward-version save (e.g. player downgraded the game). Don't
      // try to interpret — fall through to fresh run.
      try { console.warn('[run snapshot] Drop save: schema', incomingSchema, '> current', RUN_SNAPSHOT_SCHEMA); } catch (_e) {}
      return null;
    }
    if (incomingSchema < RUN_SNAPSHOT_SCHEMA) {
      // Walk migrations chronologically. Each one takes a snap of its
      // .from version + returns a snap at .to. A missing migration
      // step is a logic bug (the dev added a SCHEMA bump but forgot
      // the migration); drop the save and warn loudly so it surfaces
      // in playtest rather than silently corrupting state.
      let cur = incomingSchema;
      while (cur < RUN_SNAPSHOT_SCHEMA) {
        const m = RUN_SNAPSHOT_MIGRATIONS.find(mm => mm.from === cur);
        if (!m) {
          try { console.warn('[run snapshot] Drop save: no migration from schema', cur, 'to', RUN_SNAPSHOT_SCHEMA); } catch (_e) {}
          return null;
        }
        try {
          s = m.migrate(s);
          cur = m.to;
        } catch (_err) {
          try { console.warn('[run snapshot] Migration', cur, '→', m.to, 'threw — drop save'); } catch (_e) {}
          return null;
        }
      }
    }
    return s;
  } catch (e) { return null; }
}
function clearRunSnapshot() {
  try { localStorage.removeItem(RUN_SNAPSHOT_KEY); } catch (e) {}
}

// Resume a previously-saved run — called from the main menu RESUME card.
// Rebuilds the hero loadout from the snapshot then enters floor N as if the
// player had just descended into it (fresh rooms, fresh enemies).
function resumeRun(snap) {
  // New run number — same rationale as startRun: invalidate stale
  // deferred callbacks from a prior aborted run.
  _runSeq++;
  // Phase 3 cleanup — null the wave-1 damage hook + tally so a stale
  // closure from the prior run can't pollute the new run's first
  // combat room before loadRoom installs the fresh hook.
  _wave1DamageTally = null;
  if (typeof window !== 'undefined') window.__recordCombatDamage = null;
  hideAllOverlays();
  // Reset baseline first
  resetHero();
  resetRelics();
  clearFusions();
  resetStats();
  resetGold();
  activeCurses.clear();
  clearTarot();
  // Weapon
  hero.weapon = snap.weapon || 'sword';
  // Curses
  for (const cid of (snap.curseIds || [])) activeCurses.add(cid);
  // Tarot — restore drawn cards from the snapshot. The previous code
  // had a misleading comment claiming this was "applied later by the
  // existing tarot active checks" but there was no such path: hasCard
  // / isTarotRun / drawnCards is the source of truth, and clearTarot()
  // above zeroed it. Without this push, a resumed run lost every
  // tarot effect (THE EMPRESS gold-double, THE FOOL no-weapon-start,
  // THE STAR extra sanctuary, THE HANGED MAN dmg-vs-HP cost, etc.).
  for (const tid of (snap.tarotIds || [])) {
    if (TAROT[tid]) drawnCards.push(TAROT[tid]);
  }
  // MEMORY — replay the memory the run STARTED with, BEFORE the relic
  // loop. resetHero zeroes memoryBell / memoryNine / memoryHungryBlade /
  // memoryHermit / memoryHanged etc.; without this replay every memory's
  // flag-driven behavior is silently dead on resume even though the
  // multiplier bonuses survive via snap.mods. The override id ignores
  // the player's CURRENT selection in case they swapped memories
  // between save and resume — the run continues with the memory it
  // started with.
  // Bug fix: capture the return value + write to window.__activeMemory
  // so the run-time HUD chip (drawMemoryHUD in hud.js) renders after
  // a resume. Previously startRun set this but resumeRun discarded the
  // return — the memory's mechanical effects survived a save/resume,
  // but the on-screen reminder of WHICH memory was active vanished
  // until the player restarted from the menu.
  const _resumedMemory = applySelectedMemory({ seenRelicIds }, snap.memoryId);
  if (typeof window !== 'undefined') {
    window.__activeMemory = _resumedMemory || null;
  }
  // Memory of the Debtor sets hero.startingGold = +100 on apply (it's
  // consumed by startRun's gold.total += hero.startingGold path at
  // line ~3556, then zeroed). resumeRun has no equivalent consumer
  // because gold.total is restored from snap.gold instead. Without
  // an explicit zero here, hero.startingGold lingers as a non-zero
  // field after resume — currently no other code reads it but a
  // future "if (hero.startingGold > 0)" branch would behave wrong.
  // Defensive clear: the gold has already been counted once when
  // the run started; the snapshot reflects that final state.
  hero.startingGold = 0;
  // Relics (apply each one; fusion hooks fire as expected)
  for (const rid of (snap.relicIds || [])) {
    if (RELIC_DEFS[rid]) applyRelic(rid);
  }
  // Restore HP / gold / maxHp AFTER relics (relics can change maxHp)
  hero.maxHp = snap.maxHp || hero.maxHp;
  hero.hp = Math.min(hero.maxHp, Math.max(1, snap.hp || hero.maxHp));
  gold.total = snap.gold | 0;
  daily.activeForRun = !!snap.dailyActive;
  // Wizard-kit Sprint 3D — restore weapon slot. Older saves (pre-3D)
  // won't have this field; default to 'sword' for backward compat.
  if (typeof snap.activeWeapon === 'string'
      && (snap.activeWeapon === 'sword' || snap.activeWeapon === 'blast')) {
    hero.activeWeapon = snap.activeWeapon;
  }
  // Multiplier bundle — restore AFTER relics have applied. Snap.mods
  // captures the FINAL run-start state of every multiplier the hero
  // accumulated (relic + meta unlocks + curse modifiers + tarot
  // effects + memory bonuses). Without this, resumeRun could only
  // rebuild multipliers from relics, silently losing the rest.
  // Restoring AFTER applyRelic clobbers the relic-only rebuild with
  // the correct final values; flag fields set by relic.apply() (e.g.
  // hero.chainLightning, hero.executeThreshold gates) are preserved
  // because they're not in snap.mods.
  if (snap.mods) {
    if (typeof snap.mods.damageMul === 'number')        hero.damageMul = snap.mods.damageMul;
    if (typeof snap.mods.damageTakenMul === 'number')   hero.damageTakenMul = snap.mods.damageTakenMul;
    if (typeof snap.mods.attackCooldownMul === 'number') hero.attackCooldownMul = snap.mods.attackCooldownMul;
    if (typeof snap.mods.dodgeCooldownMul === 'number') hero.dodgeCooldownMul = snap.mods.dodgeCooldownMul;
    if (typeof snap.mods.speedMul === 'number')         hero.speedMul = snap.mods.speedMul;
    if (typeof snap.mods.reachMul === 'number')         hero.reachMul = snap.mods.reachMul;
    if (typeof snap.mods.knockbackMul === 'number')     hero.knockbackMul = snap.mods.knockbackMul;
    if (typeof snap.mods.dodgeDistMul === 'number')     hero.dodgeDistMul = snap.mods.dodgeDistMul;
    if (typeof snap.mods.critChance === 'number')       hero.critChance = snap.mods.critChance;
    if (typeof snap.mods.critMul === 'number')          hero.critMul = snap.mods.critMul;
    if (typeof snap.mods.lifesteal === 'number')        hero.lifesteal = snap.mods.lifesteal;
    if (typeof snap.mods.regenRate === 'number')        hero.regenRate = snap.mods.regenRate;
    if (typeof snap.mods.executeThreshold === 'number') hero.executeThreshold = snap.mods.executeThreshold;
    if (typeof snap.mods.executeMul === 'number')       hero.executeMul = snap.mods.executeMul;
    if (typeof snap.mods.boltLifeMul === 'number')      hero.boltLifeMul = snap.mods.boltLifeMul;
    if (typeof snap.mods.revives === 'number')          hero.revives = snap.mods.revives;
  }
  // Rhythm-counter restore — applyRelic re-runs each relic's apply()
  // which re-zeros counters (e.g. razor_pace.apply sets razorPaceHits = 0).
  // Restoring here AFTER applyRelic preserves the snapshot's state.
  // Each field guarded by typeof so older snapshots without `counters`
  // don't break (defaults to 0/false from resetHero).
  if (snap.counters) {
    if (typeof snap.counters.chainCount === 'number')         hero.chainCount = snap.counters.chainCount;
    if (typeof snap.counters.pyroCount === 'number')          hero.pyroCount = snap.counters.pyroCount;
    if (typeof snap.counters.soulKillCount === 'number')      hero.soulKillCount = snap.counters.soulKillCount;
    if (typeof snap.counters.arcaneQuiverHits === 'number')   hero.arcaneQuiverHits = snap.counters.arcaneQuiverHits;
    if (typeof snap.counters.ringingSteelStacks === 'number') hero.ringingSteelStacks = snap.counters.ringingSteelStacks;
    if (typeof snap.counters.twinPulseTick === 'number')      hero.twinPulseTick = snap.counters.twinPulseTick;
    if (typeof snap.counters.mountainStrikeCounter === 'number') hero.mountainStrikeCounter = snap.counters.mountainStrikeCounter;
    if (typeof snap.counters.razorPaceHits === 'number')      hero.razorPaceHits = snap.counters.razorPaceHits;
    if (typeof snap.counters.vowEternalReady === 'boolean')   hero.vowEternalReady = snap.counters.vowEternalReady;
    // Save-completeness audit additions (forward-compatible with old snapshots
    // via typeof guard — pre-audit snapshots simply leave these at 0).
    if (typeof snap.counters.coinOfTyrantCounter === 'number') hero.coinOfTyrantCounter = snap.counters.coinOfTyrantCounter;
    if (typeof snap.counters.sparrowCounter === 'number')      hero.sparrowCounter = snap.counters.sparrowCounter;
  }
  // Daily challenge curse-id flag — drives generation-pipeline readers
  // even though the inline modifiers are now captured in snap.mods.
  if (daily.activeForRun) {
    const todaysChallenge = getTodayChallenge();
    window.__dailyCurseId = todaysChallenge.curseId;
  } else {
    window.__dailyCurseId = null;
  }
  // Enter floor N
  currentFloorLevel = Math.max(1, Math.min(MAX_FLOORS, snap.floorLevel));
  setBiome(BIOME_BY_FLOOR[currentFloorLevel]);
  window.__currentBiome = BIOME_BY_FLOOR[currentFloorLevel];
  window.__currentFloorLevel = currentFloorLevel;
  // SYSTEMS PASS 2c — initialize branching graph. `floor` grows as the
  // player commits to path nodes; starts with just the start room so
  // loadRoom(0) works on the existing linear-array code.
  // THE STAR tarot — adds an extra sanctuary node in layer 5 when active.
  currentGraph = generateFloorGraph(currentFloorLevel, { extraSanctuary: hasCard('the_star') });
  currentNodeId = currentGraph.startId;
  floor = [getFloorNode(currentGraph, currentNodeId).roomData];
  // ASCENSION VIII — track when this floor started so enemies.js can
  // apply the timeout multiplier when the floor runs long.
  window.__floorStartTime = performance.now();
  winEl.style.display = 'none';
  transition = { active: false, phase: 'out', t: 0, toIndex: 0 };
  bossWinTriggered = false;
  deathCeremonyActive = false;
  deathCeremonyTime = 0;
  deathSummaryShown = false;
  // Notification rail — drop stale entries from the previous run.
  clearNotifications();
  phaseIntroTime = 0;
  phaseIntroBoss = null;
  phaseIntroStartedAt = 0;
  floorCardStartedAt = 0;
  bossIntroStartedAt = 0;
  fusionBannerTime = 0;
  // THE WATCHER — resume doesn't bump the run counter, but it MUST reset
  // per-run state (so the death-depth line gate works) and notify the
  // entity of the current floor (so milestone utterances like first-floor-4
  // still fire if the player resumes into a not-yet-seen floor).
  watcherOnRunResume();
  watcherOnFloorEnter(currentFloorLevel);
  triggerFloorCard(currentFloorLevel);
  // Wipe any leftover transition residue (door pan + prevRoom snapshot)
  // — same guard as startRun. Without this, a player who saved mid-pan
  // and resumes finds the hero frozen by isDoorPanActive() with the
  // previous dungeon room still rendering as a fading ghost.
  doorPan = null;
  clearPrevRoom();
  loadRoom(0, 'south');
  // Reset HUD heart-tracking baseline so leftover lastSeenHp from a
  // previous run doesn't trigger a phantom heart-sparkle on the first
  // frame of resumed state.
  resetHudAnims();
  running = true;
  // Snapshot at run start so a player who quits floor 1 can resume floor 1.
  saveRunSnapshot();
}

function startRun() {
  // New run number — invalidates any stale timeouts/intervals from prior
  // runs (boss-drop poll, wave-2 spawn). They'll bail at the top of the
  // callback when they see _runSeq has moved past their captured value.
  _runSeq++;
  // Phase 3 cleanup — null the wave-1 damage hook + tally so a stale
  // closure from the prior run can't pollute the new run's first
  // combat room before loadRoom installs the fresh hook.
  _wave1DamageTally = null;
  if (typeof window !== 'undefined') window.__recordCombatDamage = null;
  // (Prologue gate moved to enterHamletCanvas — the prose lands when the
  // player wakes in the hamlet, not after they've already toured it.)
  // ORACLE'S FORTUNES — if a card was drawn in the hamlet, push it into the
  // tarot active set so the existing tarot-hook plumbing (hasCard() checks
  // across hero.js and main.js) fires the card's effects automatically.
  // Consumed on use; re-drawn next visit.
  if (window.__oracleCard) {
    const card = TAROT[window.__oracleCard];
    if (card) drawnCards.push(card);
    window.__oracleCard = null;
  }
  // Ambient pad fades out as the run begins — the real combat music system
  // (music.js, when OGG tracks land) will take over from here.
  stopAmbientPad();
  // Camera breathe stays OFF in combat too. The ±0.6% sin oscillation
  // (camera.js updateCamera) shifts zoom every frame, which snaps pixel-
  // art floor sprites to slightly different positions with
  // imageSmoothingEnabled=false → reads as a slow CRT-screen shimmer
  // across the cobblestone. Was originally enabled here for "living
  // camera" feel during combat lulls, but since the per-biome tile
  // sheets shipped (room.js drawFloorTile), the shimmer became visible
  // enough to kill the painted texture's authored look. Camera life
  // still comes from: zoom pulses on impact (camera.js zoomPulse*),
  // shake on hits, hero-follow lerp, and the slight dolly on dodge —
  // all well above the ±0.6% breathe threshold.
  camera.breatheEnabled = false;
  currentFloorLevel = 1;
  setBiome(BIOME_BY_FLOOR[currentFloorLevel]);
  window.__currentBiome = BIOME_BY_FLOOR[currentFloorLevel];
  window.__currentFloorLevel = currentFloorLevel;
  // SYSTEMS PASS 2c — initialize branching graph. `floor` grows as the
  // player commits to path nodes; starts with just the start room so
  // loadRoom(0) works on the existing linear-array code.
  // THE STAR tarot — adds an extra sanctuary node in layer 5 when active.
  currentGraph = generateFloorGraph(currentFloorLevel, { extraSanctuary: hasCard('the_star') });
  currentNodeId = currentGraph.startId;
  floor = [getFloorNode(currentGraph, currentNodeId).roomData];
  // ASCENSION VIII — track when this floor started so enemies.js can
  // apply the timeout multiplier when the floor runs long.
  window.__floorStartTime = performance.now();
  // THE RUIN REMEMBERS — 45% chance to spawn an Echo of Self in a random combat
  // room. The Echo inherits stats from your most recent death's build.
  if (ruin.deaths && ruin.deaths.length > 0 && Math.random() < 0.45) {
    const lastDeath = ruin.deaths[0];
    // Pick a combat room (not combat1 to avoid immediate encounter — let player settle)
    // SYSTEMS PASS 2c — in branching mode, `floor` starts with just the
    // start room. Iterate the graph's nodes (all roomData already
    // populated at generation) to find an echo-injection candidate.
    const candidates = currentGraph
      ? currentGraph.nodes.filter(n => n.roomData && n.roomData.kind === 'combat' && n.roomData.slotLabel !== 'combat1')
      : [];
    if (candidates.length > 0) {
      const target = candidates[(Math.random() * candidates.length) | 0];
      const targetRoom = target.roomData;
      // Echo stats scale with past build richness (more relics = stronger echo)
      const relicCount = Math.max(0, (lastDeath.build || []).length);
      const hpMul = 1.2 + relicCount * 0.18;     // 1-relic build → 1.38x, 5-relic → 2.1x
      const damageMul = 1.1 + relicCount * 0.10;
      // Add echo to spawns list (roughly center-left)
      targetRoom.spawns = targetRoom.spawns || [];
      targetRoom.spawns.push({
        type: 'echo',
        x: 10, y: 6,
        elite: true,
        hpMul, damageMul,
        echoPastBuild: lastDeath.build,   // stashed to grant reclaim on kill
        echoCombo: lastDeath.combo,
      });
      // Mark the room for announcement on entry
      targetRoom.hasEcho = true;
    }
  }
  const prevWeapon = hero.weapon || 'sword';
  resetHero();
  hero.weapon = prevWeapon;
  resetRelics();
  resetGold();
  resetStats();
  // Reset per-run gameplay metrics — without this, maxCombo from the previous
  // run leaks into stats._maxCombo at the next evaluateAchievements, which
  // instantly unlocks carnage_achieved / ceaseless on a fresh run.
  window.__gameMetrics.killStreak = 0;
  window.__gameMetrics.killStreakShowUntil = 0;
  window.__gameMetrics.maxCombo = 0;
  window.__gameMetrics.lastHitTime = 0;
  window.__gameMetrics.lastHitFromX = 0;
  window.__gameMetrics.lastHitFromY = 0;
  window.__gameMetrics.lastKillTime = 0;
  incrementRunsStarted();
  watcherOnRunStart();
  watcherOnFloorEnter(currentFloorLevel);
  try { watcherOnAscensionStart(getAscensionTier() || 0); } catch (e) {}
  triggerFloorCard(currentFloorLevel);
  clearPedestals();
  // Wipe any leftover transition residue from a prior run that ended
  // mid-pan (death during door pan, or quit-to-menu). Without this,
  // doorPan stays non-null and isDoorPanActive() freezes the new run
  // on its first tick; prevRoom would render the previous run's last
  // dungeon room as a fading ghost over the new floor.
  doorPan = null;
  clearPrevRoom();
  // Apply meta-progression unlocks to fresh run (UNLESS Forsaken curse active)
  if (!isCursed('forsaken')) {
    if (hasUnlock('vitality_charm')) { hero.maxHp += 3; hero.hp = hero.maxHp; }
    if (hasUnlock('steeled_resolve')) { hero.damageTakenMul *= 0.85; }
    if (hasUnlock('sharpened_edge')) { hero.damageMul *= 1.10; }
    if (hasUnlock('swift_boots')) { hero.dodgeCooldownMul *= 0.80; }
    if (hasUnlock('purse_of_depths')) { gold.total += 50; }
    if (hasUnlock('blessed_greaves')) { applyRelic('iron_greaves'); }
    if (hasUnlock('ancient_pact')) {
      // Filter for weapon compatibility — don't grant a wand-only relic
      // to a sword player (would be a dead pick they didn't choose).
      const pool = ALL_RELIC_IDS.filter(id =>
        !equippedRelics.find(r => r.id === id) && isRelicForWeapon(id, hero.weapon),
      );
      if (pool.length) applyRelic(pool[(Math.random() * pool.length) | 0]);
    }
  }
  // SMITH'S HEIRLOOM — consume any banked heirloom (a relic the player
  // reforged at the hamlet Smith before this run). Applied AFTER meta
  // unlocks so it stacks on top; cleared from meta.heirloom so it's
  // one-use-per-purchase. No-op if no heirloom banked or if it's already
  // an equipped relic.
  const heirloomId = consumeHeirloom();
  if (heirloomId && !equippedRelics.find(r => r.id === heirloomId)) {
    applyRelic(heirloomId);
    window.__heirloomAppliedThisRun = heirloomId;   // for reveal banner (optional)
  }
  // Apply CURSE effects to hero baseline stats
  if (isCursed('glass_blade')) {
    hero.damageMul *= 1.4;
    hero.damageTakenMul *= 1.6;
  }
  // â•â•â• TAROT DESCENT — apply drawn card effects â•â•â•
  window.__tarotEmpress = false;
  if (isTarotRun()) {
    if (hasCard('the_empress')) window.__tarotEmpress = true;
    // THE SUN — start with a random rare relic
    if (hasCard('the_sun')) {
      const rares = ALL_RELIC_IDS.filter(id => {
        const def = RELIC_DEFS[id];
        return def && def.tier === 'rare'
          && !equippedRelics.find(r => r.id === id)
          && isRelicForWeapon(id, hero.weapon);
      });
      if (rares.length) applyRelic(rares[(Math.random() * rares.length) | 0]);
    }
    // THE FOOL — start with no weapon (will be granted after first combat)
    if (hasCard('the_fool')) {
      hero.weapon = null;                 // unequipped until first clear
    }
    // THE EMPRESS — enemies hit 25% harder (gold 2x handled on drop)
    if (hasCard('the_empress')) {
      hero.damageTakenMul *= 1.25;
    }
    // THE HANGED MAN — +30% damage but lose 1 HP per room
    if (hasCard('the_hanged_man')) {
      hero.damageMul *= 1.3;
    }
    // DEATH, THE HERMIT, THE STAR, THE MAGICIAN — room-time effects applied elsewhere
  }
  // DAILY CHALLENGE — force today's curse (temporary, during run only)
  // and grant today's starting relic.
  if (daily.activeForRun) {
    const todaysChallenge = getTodayChallenge();
    // Apply relic as starter bonus
    applyRelic(todaysChallenge.relicId);
    // The curse itself is forced ON during the run via a transient flag read by isCursed()
    // For simplicity we just apply its effect inline if not already cursed:
    if (todaysChallenge.curseId === 'glass_blade' && !isCursed('glass_blade')) {
      hero.damageMul *= 1.4;
      hero.damageTakenMul *= 1.6;
    } else if (todaysChallenge.curseId === 'starving' && !isCursed('starving')) {
      hero.maxHp = Math.max(4, hero.maxHp - 2);
      hero.hp = hero.maxHp;
    } else if (todaysChallenge.curseId === 'forsaken' && !isCursed('forsaken')) {
      // Already-applied meta unlocks don't retroactively roll back; this is best-effort
    }
    // Other curses (ethers_curse, the_swarm, blind) affect generation already completed;
    // for daily purposes we apply them to future rooms via a one-off curse flag poke.
    window.__dailyCurseId = todaysChallenge.curseId;
  } else {
    window.__dailyCurseId = null;
  }
  // MEMORY WEAVE — apply the selected memory (if any) AFTER all other run-
  // start bonuses, so the memory's declared identity can override or compose
  // with them. Memory effects typically stack (e.g., +HP on top of curses),
  // but constraint flags like memoryAsh cap subsequent maxHp increases.
  const appliedMemory = applySelectedMemory({ seenRelicIds });
  if (appliedMemory) {
    // Transient flag — combat systems read this to know a memory is active.
    window.__activeMemory = appliedMemory;
    // Starting-gold support for Memory of the Debtor
    if (hero.startingGold) { gold.total += hero.startingGold | 0; hero.startingGold = 0; }
  } else {
    window.__activeMemory = null;
  }
  deathEl.style.display = 'none';
  winEl.style.display = 'none';
  transition = { active: false, phase: 'out', t: 0, toIndex: 0 };
  bossWinTriggered = false;
  deathCeremonyActive = false;
  deathCeremonyTime = 0;
  deathSummaryShown = false;
  phaseIntroTime = 0;
  phaseIntroBoss = null;
  phaseIntroStartedAt = 0;
  floorCardStartedAt = 0;
  bossIntroStartedAt = 0;
  fusionBannerTime = 0;
  // Clear fusion hero flags that might have stuck from a previous run
  hero.fusionTeslaStorm = false;
  hero.fusionBloodMoon = false;
  hero.fusionRebirthPyre = false;
  hero.fusionConflagration = false;
  hero.fusionPhantomBlade = false;
  hero.fusionStormDance = false;
  hero.fusionRiposte = false;
  hero.fusionMountainsHeart = false;
  hero.fusionObsidianEdge = false;
  hero.fusionTempest = false;
  // Weapon-signature fusion flags (April 2026 — see fusions.js)
  hero.fusionSwornReply = false;
  hero.fusionMortalCadence = false;
  hero.fusionAvalanche = false;
  hero.fusionCrescendo = false;
  hero.fusionForkedSky = false;
  // Previously dead fusions, now wired (Kingslayer adds speartip crit
  // bonus, Weaving Step adds post-cleansing-dodge i-frames):
  hero.fusionKingslayer = false;
  hero.fusionWeavingStep = false;
  hero.weavingStepReady = false;

  // (HP grace block removed per design audit. Roguelite design wants
  // difficulty to come from MASTERY + META PROGRESSION, not from
  // grace HP for new players. Vitality Charm meta unlock — 15 essence,
  // +3 max HP — is the genre-correct answer to "first runs feel
  // brutal." Players earn HP by dying and spending essence; they don't
  // get it for free in their first three attempts.)

  loadRoom(0, 'south');
  // Reset HUD heart-tracking baseline so leftover lastSeenHp from a
  // previous run doesn't trigger a phantom heart-sparkle on the first
  // frame of a fresh run.
  resetHudAnims();
  running = true;
  // Phase 4 — surface death-counsel if the player has fallen to the
  // same enemy/hazard 3+ times. Defers naturally during the floor-card
  // cinematic (notification rail respects __centerBannerActive) and
  // appears once the cinematic clears. Fires once per run start so
  // veterans don't get re-prompted with advice they already know;
  // showTip-style de-dup isn't needed because the tip is gated on
  // accumulated death count and re-evaluated each run.
  try { fireDeathTipIfReady(); } catch (e) {}
}

// Apply tarot pedestal modifiers — called after spawnRelicOffer/spawnAltarOffer
function applyTarotPedestalMods() {
  if (!isTarotRun()) return;
  // DEATH — flip standard relic pedestals into altars (cost HP)
  if (hasCard('death')) {
    const hpCost = 3;
    for (const p of pedestals) {
      if (p.hpCost === 0) p.hpCost = hpCost;
    }
  }
}

// Progress to next floor — keep hero HP, relics, gold, stats
function beginNextFloor() {
  currentFloorLevel = Math.min(MAX_FLOORS, currentFloorLevel + 1);
  stats.floorReached = Math.max(stats.floorReached, currentFloorLevel);
  setBiome(BIOME_BY_FLOOR[currentFloorLevel]);
  window.__currentBiome = BIOME_BY_FLOOR[currentFloorLevel];
  window.__currentFloorLevel = currentFloorLevel;
  // SYSTEMS PASS 2c — initialize branching graph. `floor` grows as the
  // player commits to path nodes; starts with just the start room so
  // loadRoom(0) works on the existing linear-array code.
  // THE STAR tarot — adds an extra sanctuary node in layer 5 when active.
  currentGraph = generateFloorGraph(currentFloorLevel, { extraSanctuary: hasCard('the_star') });
  currentNodeId = currentGraph.startId;
  floor = [getFloorNode(currentGraph, currentNodeId).roomData];
  // ASCENSION VIII — track when this floor started so enemies.js can
  // apply the timeout multiplier when the floor runs long.
  window.__floorStartTime = performance.now();
  winEl.style.display = 'none';
  transition = { active: false, phase: 'out', t: 0, toIndex: 0 };
  bossWinTriggered = false;
  watcherOnFloorEnter(currentFloorLevel);
  triggerFloorCard(currentFloorLevel);
  loadRoom(0, 'south');
  running = true;
  // Snapshot at floor boundary — this is the resume point if the player
  // closes the browser now.
  saveRunSnapshot();
  // Polish round 2 — quiet "run saved" toast at the floor boundary so
  // players know quitting now preserves their progress. Hades/Dead
  // Cells pattern: lower-priority confirmation that doesn't compete
  // with the floor card cinematic. Fires through the rail (which
  // queues during cinematics and drains after) so the floor card
  // gets the screen first; the save toast lands in its wake.
  // Short life (2.0s) — confirmation, not a story beat.
  try {
    pushNotification({
      kind: 'tip',
      header: '— RUN SAVED —',
      title: '',
      body: 'progress preserved.   you may quit if you must.',
      tint: '#86e3a8',     // sanctuary green — matches the "safe to leave" beat
      life: 2.5,
    });
  } catch (_e) {}
}

// Format a duration like 2:43
function fmtTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

// Phase 4 work — narrative subtitle composer. Picks a 1-line "defining
// moment" describing how the run ended + what was most impressive about
// it. Returns a string OR null (caller falls back to the random
// DEATH/VICTORY flavor lines for runs with no notable moments).
//
// Article-handling note: TYPES.displayName is uppercase ("SLIME"). The
// composer lowercases for narrative flow ("a slime") except for unique
// boss names which stay capitalized ("the Broodmother", "Iron Revenant").
function composeDefiningMoment(s, killerType, isVictory) {
  // Map enemy-type id → narrative phrase. Unique bosses use their
  // proper noun; minions get an article. Unknown types fall back to
  // a generic "the depths" so the line still reads.
  const KILLER_PHRASES = {
    slime:         'a slime',
    skel:          'a skeleton',
    orc:           'an orc',
    archer:        'a skeleton archer',
    skel_archer:   'a bone archer',
    bomber:        'a bomber',
    lancer:        'a lancer',
    vanguard:      'a vanguard',
    reflector:     'a reflector',
    wizard:        'a wizard',
    priest:        'a priest',
    warden:        'the Warden',
    echo:          'your own echo',
    elite_orc:     'Grudnok',
    bone_captain:  'Iron Revenant',
    broodmother:   'the Broodmother',
    ember_tyrant:  'the Ember Tyrant',
    hermit:        'the Hermit',
    haunt:         'a haunt',
    werewolf:      'a werewolf',
    werebear:      'a werebear',
    dreadmage:     'a dreadmage',
    knight_enemy:  'a knight',
    armored_skel:  'an armored skeleton',
    greatsword_skel: 'a greatsword skeleton',
    soldier:       'a soldier',
    swordsman:     'a swordsman',
    armored_axeman: 'an armored axeman',
    armored_orc:   'an armored orc',
    knight_templar: 'a templar',
    orc_rider:     'an orc rider',
    spike:         'the spikes',
    fire_pool:     'the flames',
    fire_ring:     'the fire ring',
    flame_trail:   'a flame trail',
    mimic:         'a mimic',
    projectile:    'a stray bolt',
  };
  const killerPhrase = KILLER_PHRASES[killerType] || null;
  // Pick the most-impressive run metric. Priority order — bosses >
  // CARNAGE combo > biggest hit > rampage combo > enemies-defeated
  // milestone > perfect dodges. First match wins.
  const mc = s._maxCombo | 0;
  const bh = s.biggestHit | 0;
  const ed = s.enemiesDefeated | 0;
  const pd = s.perfectDodges | 0;
  const bk = s.bossesKilled | 0;
  let beat = null;
  if (bk >= 1) {
    beat = bk >= 2 ? `you felled ${bk} bosses` : 'you felled a boss';
  } else if (mc >= 40) {
    beat = `your chain reached carnage — ${mc} hits`;
  } else if (bh >= 200) {
    beat = `your largest blow took ${bh}`;
  } else if (mc >= 20) {
    beat = `your chain reached rampage — ${mc} hits`;
  } else if (mc >= 10) {
    beat = `your chain held — ${mc} hits`;
  } else if (bh >= 80) {
    beat = `your largest blow took ${bh}`;
  } else if (ed >= 50) {
    beat = `you felled ${ed}`;
  } else if (pd >= 5) {
    beat = `you read ${pd} strikes`;
  }
  // Compose. Death cause leads when present; victory always leads with
  // its own clause. Only return a line when we have at least ONE element
  // (cause OR beat) — otherwise the random flavor message reads better
  // than a stat-less template.
  //
  // Returns a structured shape so the subtitle can style "what killed
  // you" (crimson) differently from "what you accomplished" (cream)
  // instead of mashing both into one italic prose line. .raw preserves
  // the legacy string form for any caller that wants the flat text.
  if (isVictory) {
    if (beat) return { raw: `the depths yielded — ${beat}`, cause: null, beat, isVictory: true };
    return null;     // caller uses random VICTORY_MESSAGES
  }
  if (killerPhrase && beat) return { raw: `felled by ${killerPhrase} — ${beat}`, cause: killerPhrase, beat, isVictory: false };
  if (killerPhrase) return { raw: `felled by ${killerPhrase}`, cause: killerPhrase, beat: null, isVictory: false };
  if (beat) return { raw: beat, cause: null, beat, isVictory: false };
  return null;       // caller uses random DEATH_MESSAGES
}

// Populate the end-of-run summary panel (death OR final victory)
function showEndOfRun(isVictory) {
  // Run ended — clear any resume snapshot. Fresh start from now on.
  clearRunSnapshot();
  // Themed-room motes shouldn't drift over the run-end overlay.
  clearThemedRoom();
  const title = document.getElementById('endTitle');
  const subtitle = document.getElementById('endSubtitle');
  const ornamentText = document.getElementById('endOrnamentText');
  const restartBtn = document.getElementById('restartBtn');
  const lineL = document.getElementById('endOrnamentLineL');
  const lineR = document.getElementById('endOrnamentLineR');
  const dotL = document.getElementById('endSubtitleDotL');
  const dotR = document.getElementById('endSubtitleDotR');
  // Phase 4 work — defining-moment narrative beat. The audit asked for
  // "narrative beats, not stats page" — the run-end was previously a
  // generic flavor line ("the ooze takes you back") + a stats grid.
  // The flavor was random, not specific to THIS run. Now we compose a
  // run-specific subtitle that names the death cause AND the most
  // impressive moment. Keeps the stats grid; just upgrades the subtitle
  // from generic → narrative.
  const _definingLine = composeDefiningMoment(stats, hero._lastHurtBy, isVictory);
  // Helpers for the structured subtitle. The defining-moment object can
  // be rendered as a tinted two-part line ("FELLED BY {killer} — {beat}")
  // for death, or a single cream line for victory. Falls back to a flat
  // random message when no specific beat exists.
  // letter-spacing override: the structured forms are LONGER than the
  // random flavor pool (which is what the static 5px CSS was tuned for),
  // so tighten to 3px when the longer form lands. Keeps the line within
  // the modal width at all viewport scales.
  const _renderSubtitleFlat = (txt, color, isStructured) => {
    subtitle.textContent = txt;
    subtitle.style.color = color;
    subtitle.style.letterSpacing = isStructured ? '3px' : '5px';
  };
  if (isVictory) {
    // VICTORY — pure gold palette, triumphant
    title.textContent = 'THE DEPTHS YIELD';
    title.style.color = '#f4d9a0';
    title.style.textShadow = '0 0 22px rgba(244,217,160,0.7)';
    const _isVictoryStructured = !!(_definingLine && _definingLine.raw);
    const _victoryText = _isVictoryStructured ? _definingLine.raw : VICTORY_MESSAGES[(Math.random() * VICTORY_MESSAGES.length) | 0];
    _renderSubtitleFlat(_victoryText, '#d8cfae', _isVictoryStructured);
    if (ornamentText) {
      ornamentText.textContent = 'the depths have yielded';
      ornamentText.style.color = '#c9a86a';
    }
    if (lineL) lineL.style.background = 'linear-gradient(90deg,transparent,#c9a86a,transparent)';
    if (lineR) lineR.style.background = 'linear-gradient(90deg,transparent,#c9a86a,transparent)';
    if (dotL) dotL.style.background = '#c9a86a';
    if (dotR) dotR.style.background = '#c9a86a';
    if (restartBtn) {
      restartBtn.textContent = 'BEGIN ANEW';
      restartBtn.style.color = '#f4d9a0';
    }
  } else {
    // DEATH — crimson title + ornaments (crimson is in the allowed palette
    // for danger); body stays gold for readability.
    title.textContent = 'YOU DIED';
    title.style.color = '#d8556a';
    title.style.textShadow = '0 0 18px rgba(216,85,106,0.6)';
    // Two-tone subtitle when we have a structured defining moment:
    //   FELLED BY {crimson killer} — {cream beat}
    // The visual split is the polish — previously the killer name got
    // buried in the prose flow ("felled by a slime — your largest..."),
    // making it hard to glance-read "what killed me?" at a glance.
    // Crimson on the killer phrase echoes the YOU DIED title color
    // and the ornament line color, anchoring the eye to the cause first.
    if (_definingLine && (_definingLine.cause || _definingLine.beat)) {
      const _causeHtml = _definingLine.cause
        ? `<span style="color:#e6809a;font-style:normal;font-weight:bold;text-shadow:0 0 6px rgba(216,85,106,0.4);">felled by ${_definingLine.cause}</span>`
        : '';
      const _beatHtml = _definingLine.beat
        ? `<span style="color:#d8cfae;text-shadow:0 0 4px rgba(244,217,160,0.18);">${_definingLine.beat}</span>`
        : '';
      const _sep = (_causeHtml && _beatHtml) ? `<span style="color:#7a5050;margin:0 6px;">—</span>` : '';
      subtitle.innerHTML = `${_causeHtml}${_sep}${_beatHtml}`;
      // The structured form can be longer than the legacy flavor lines
      // ("felled by an armored skeleton — your largest blow took 187"
      // is ~62 chars vs the random pool's typical ~25). Tighten the
      // letter-spacing from 5px to 3px in this case so the line stays
      // readable without overflowing the death modal at narrow scales.
      subtitle.style.letterSpacing = '3px';
    } else {
      // No specific beat or cause — fall back to the random flavor pool.
      subtitle.textContent = DEATH_MESSAGES[(Math.random() * DEATH_MESSAGES.length) | 0];
      subtitle.style.letterSpacing = '5px';
    }
    subtitle.style.color = '#c8a8a8';
    if (ornamentText) {
      ornamentText.textContent = 'your story ends here';
      ornamentText.style.color = '#d88080';
    }
    if (lineL) lineL.style.background = 'linear-gradient(90deg,transparent,#b05858,transparent)';
    if (lineR) lineR.style.background = 'linear-gradient(90deg,transparent,#b05858,transparent)';
    if (dotL) dotL.style.background = '#b05858';
    if (dotR) dotR.style.background = '#b05858';
    if (restartBtn) {
      // CONTINUE on death — the existing handler routes through the
      // hamlet on death (Keeper / Smith / etc reactive greetings),
      // which is more accurately a "continue" than a "restart" — the
      // world goes on, the player goes on, the next descent waits.
      restartBtn.textContent = 'CONTINUE';
      restartBtn.style.color = '#f4d9a0';
    }
  }

  // ─── Compact two-line stats ──────────────────────────────────────────
  // Replaced the prior 12-row gold plaque grid with two centered text
  // lines. Line 1 is the run signature (always); line 2 is whichever
  // of {enemies / bosses / relics / max combo} earned non-zero values.
  // Star-best markers render inline next to the value they apply to.
  const grid = document.getElementById('endStats');
  const duration = fmtTime(runDurationSeconds());
  const mc = stats._maxCombo | 0;
  const comboTier = mc >= 40 ? 'CARNAGE' : mc >= 20 ? 'RAMPAGE' : mc >= 10 ? 'FLURRY' : mc >= 5 ? 'CHAIN' : '';
  const comboTierColor = mc >= 40 ? '#ff4444' : mc >= 20 ? '#ff9966' : mc >= 10 ? '#ffcc66' : mc >= 5 ? '#88ddff' : '#888';
  // Evaluate NEW BEST records for this run (saves records to localStorage)
  const beatenRecords = updateRecords(stats, isVictory, runDurationSeconds());
  // MEMORY WEAVE — check if the run earned any new Memory unlocks. Newly-
  // unlocked memories are announced by a small banner above the death panel
  // so the player knows a new option is available for next descent.
  const newlyRememberedMemories = checkMemoryUnlocks(records, stats, { seenRelicIds });
  // Polish: feedback-audit team flagged that memory unlocks landed
  // SILENTLY — italic text in the death modal, no audio cue, no
  // celebratory beat. Memories are major identity unlocks; they
  // deserve their own sting. Layered chord + ping at +220ms for
  // resonance, second ping at +440ms when 2+ unlocked simultaneously
  // (rare but possible). Fires AFTER the run-end gold cascade audio
  // so the two beats don't muddy each other.
  if (newlyRememberedMemories && newlyRememberedMemories.length > 0) {
    setTimeout(() => {
      try {
        synthChord(440, 0.85, 1.0);              // gentle gold-tier chord
      } catch (_e) {}
      // Noise-floor reduction: stamp a window-level marker AT FIRE TIME
      // so the daily completion fanfare (which fires at openFloorUi
      // +1800ms ≈ 300ms AFTER the memory chord) can check "did memory
      // just fire?" and suppress its own sting. Without this, a
      // victory run that BOTH unlocks a memory AND completes the
      // daily fires 6 audio events across 800ms — too thick.
      // Memory takes priority because the unlock is rarer + more
      // meaningful; daily already had the streak HUD beat at portal
      // entry and a completion line in the run-end summary HTML, so
      // dropping the audio doesn't lose information.
      if (typeof window !== 'undefined') {
        window.__memoryChordFiredAt = performance.now();
      }
      setTimeout(() => { try { synthPing(880, 0.5, 0.32); } catch (_e) {} }, 220);
      if (newlyRememberedMemories.length > 1) {
        setTimeout(() => { try { synthPing(1040, 0.4, 0.28); } catch (_e) {} }, 440);
      }
    }, 1500);     // delay so the chord lands AFTER the death/victory sting
  }
  // LIVING HAMLET — check if any new NPCs should arrive based on the
  // refreshed records. They appear when the player next opens the hamlet.
  refreshNpcPresence(records, stats, { seenRelicIds });
  const newBestMark = (key) => beatenRecords.includes(key)
    ? ' <span style="color:#ffe070;font-size:10px;letter-spacing:1px;text-shadow:0 0 8px rgba(255,224,112,0.8);">★</span>' : '';
  // ── Compact two-line stats ───────────────────────────────────────────
  // Line 1 always shows: FLOOR · RUN TIME (the signature numbers).
  // Line 2 shows the highlight counts that earned a non-zero value
  // (enemies / bosses / relics / max combo). Zero-rows are skipped.
  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  const _statVal = (v, color = '#f4d9a0') => `<span style="color:${color};font-weight:bold;">${v}</span>`;
  const floorVal = ROMAN[stats.floorReached] || stats.floorReached;
  const _line1 = `FLOOR ${_statVal(floorVal)}${newBestMark('maxFloor')}  ·  RUN ${_statVal(duration)}${isVictory ? newBestMark('fastestClear') : ''}`;
  const _bits = [];
  if (stats.enemiesDefeated) {
    const eliteSuffix = stats.elitesDefeated ? ` <span style="opacity:0.55;font-size:11px;">(${stats.elitesDefeated} elite)</span>` : '';
    _bits.push(`${_statVal(stats.enemiesDefeated)} slain${eliteSuffix}${newBestMark('mostEnemies')}`);
  }
  if (stats.bossesKilled) {
    _bits.push(`${_statVal(stats.bossesKilled, '#ff9085')} ${stats.bossesKilled > 1 ? 'bosses' : 'boss'} felled${newBestMark('mostBosses')}`);
  }
  if (stats.relicsObtained) {
    _bits.push(`${_statVal(stats.relicsObtained)} relics${newBestMark('mostRelics')}`);
  }
  if (mc >= 5) {
    const tagSuffix = comboTier ? ` <span style="font-size:11px;color:${comboTierColor};letter-spacing:1px;">· ${comboTier}</span>` : '';
    _bits.push(`max combo ${_statVal(mc)}${tagSuffix}${newBestMark('maxCombo')}`);
  }
  grid.innerHTML = `<div>${_line1}</div>${_bits.length ? `<div style="opacity:0.85;font-size:12px;">${_bits.join('  ·  ')}</div>` : ''}`;
  // ── Memory tag — single italic line, hidden if no memory rolled ──
  const memoryTagEl = document.getElementById('endMemoryTag');
  if (memoryTagEl) {
    if (newlyRememberedMemories && newlyRememberedMemories.length > 0) {
      const names = newlyRememberedMemories.map(m =>
        `<span style="color:${m.tint};font-weight:bold;text-shadow:0 0 6px ${m.tint}66;">${m.name}</span>`
      ).join('  ·  ');
      memoryTagEl.innerHTML = `✦  remembered:  ${names}`;
      memoryTagEl.style.display = 'block';
    } else {
      memoryTagEl.style.display = 'none';
    }
  }
  // The legacy 12-row gold-plaque stats grid lived here. Replaced
  // by the two-line inline stats above. Watcher ledger paragraph +
  // trophy strip block also removed (next ~120 lines below). All
  // three jobs collapsed into the slim death screen.


  // Essence earned + add to persistent total. Curse AND Ascension
  // multipliers compound — hardcore players stacking A5 + multiple
  // curses get the biggest payouts.
  //
  // ASCENSION IX — "The Uncounted": non-boss portion is scaled by
  // nonBossEssenceMul (0.4× at A9, 0.0× at A10). Boss-derived portion
  // (floors reached + bosses killed) is unchanged until A10.
  //
  // ASCENSION X — "The Unbroken": final-boss kill at floor 4 multiplies
  // the ENTIRE boss-derived essence by finalBossEssenceMul (3.0×). Net:
  // A10 non-final-boss runs earn nearly nothing; completed ascensions
  // are the payoff.
  const totalEss = calculateEssence();
  const bossPortion = stats.bossesKilled * 8 + stats.floorReached * 4;
  const nonBossPortion = Math.max(0, totalEss - bossPortion);
  const am = (typeof window !== 'undefined' && window.__ascensionModifiers) ? window.__ascensionModifiers() : {};
  const nonBossMul = (am && typeof am.nonBossEssenceMul === 'number') ? am.nonBossEssenceMul : 1.0;
  const finalBossMul = (am && isVictory && typeof am.finalBossEssenceMul === 'number') ? am.finalBossEssenceMul : 1.0;
  const adjusted = nonBossPortion * nonBossMul + bossPortion * finalBossMul;
  const base = adjusted * (isVictory ? 2 : 1);
  const cMul = curseEssenceMul();
  const aMul = ascensionEssenceMul();
  const earned = Math.round(base * cMul * aMul);
  addEssence(earned);
  // On a floor-4 victory, unlock the next Ascension tier if applicable.
  let ascensionUnlockHtml = '';
  if (isVictory) {
    const cleared = getAscensionTier();
    const unlockedNew = onRunCompletedAtTier(cleared);
    if (unlockedNew) {
      // Queue a small banner — same hook used by codex entries.
      window.__pendingCodexEntry = {
        type: 'ascension_unlock',
        name: ASCENSION_TIERS[cleared + 1].name,
        flavor: ASCENSION_TIERS[cleared + 1].short,
        color: '#f4d9a0',
      };
      // Long-tail audit P0: the ascension unlock used to ONLY surface
      // as a banner on next-run start. By that time the player has
      // already returned to the hamlet and forgotten the moment. Now
      // headline the unlock in the end-of-run modal so victory and
      // tier-up land together as one beat.
      const next = ASCENSION_TIERS[cleared + 1];
      ascensionUnlockHtml = `
        <div style="margin-top:14px;padding:12px 18px;border:1.5px solid #c9a86a;background:linear-gradient(180deg,rgba(40,28,18,0.85),rgba(20,12,10,0.85));text-align:center;">
          <div style="font-size:10px;letter-spacing:5px;color:#c9a86a;font-style:italic;">— A NEW TIER UNLOCKED —</div>
          <div style="font-size:18px;letter-spacing:2px;color:#f4d9a0;font-family:Georgia,serif;font-weight:bold;margin-top:4px;">${next.name}</div>
          <div style="font-size:11px;font-style:italic;opacity:0.8;color:#e8d3a6;margin-top:4px;">${next.short}</div>
          <div style="font-size:10px;opacity:0.6;color:#bbaa88;margin-top:6px;">attempt this tier from the main menu</div>
        </div>
      `;
    }
  }

  // Essence display — single line. Progress bar, memory cards, and
  // meta-shop unlock list all moved to the hamlet Sanctuary Shrine
  // (N slab, E to interact). Death screen now just shows what was
  // earned + the running total, with optional curse bonus and the
  // ascension-tier-unlocked banner if a victory triggered one.
  const essEl = document.getElementById('endEssence');
  const curseTag = curseCount() > 0 ? ` <span style="color:#d85a5a;font-size:12px;">curse ${cMul.toFixed(2)}x</span>` : '';
  essEl.innerHTML = `+${earned} essence  <span style="opacity:0.55;font-size:13px;">(Total: ${meta.essence})</span>${curseTag}${ascensionUnlockHtml}`;

  // Reveal the death screen. Button text already set above ('BEGIN ANEW'
  // on victory, 'CONTINUE' on death). Meta-shop render call removed —
  // shop lives in the hamlet shrine now.
  deathEl.style.display = 'flex';

  // QUICK-RESTART discoverability nudge — only on DEATH (not victory).
  // The button sits at the same italic/muted weight as MAIN MENU on the
  // other side, which is the right balance (NEW RUN is the dramatic
  // primary action). But on first death the player may not even notice
  // the secondary path exists — they default to clicking the big NEW
  // RUN button + walk through the hamlet. Add a 4-cycle pulsing
  // text-shadow nudge that draws the eye briefly, then settles.
  // Subsequent deaths re-trigger the nudge but it's gentle enough to
  // ignore once the muscle memory is built.
  const _qrBtn = document.getElementById('deathQuickRestartBtn');
  if (_qrBtn && !isVictory) {
    _qrBtn.classList.remove('nudging');
    void _qrBtn.offsetWidth;            // force reflow → animation restart
    _qrBtn.classList.add('nudging');
  }
}

function renderMetaShop(animate = false, containerId = 'shrineUnlockRow') {
  // Compact LIST layout (replaced the prior card-grid). Each unlock is a
  // single horizontal row: [icon] [name + tooltip] [cost] [UNLOCK btn].
  // Two columns side-by-side so 10 unlocks fit in 5 rows \u2248 175 design px,
  // saving ~110px vs the 2-row card grid (~285 design px). The full
  // description hovers as a native title-tooltip \u2014 keeps info available
  // without dominating screen space when the player only wants to scan.
  //
  // The containerId parameter routes the rendered HTML to either the
  // hamlet shrine modal (default 'shrineUnlockRow') or any future
  // alternate container. Used to be hard-coded to 'metaShopRow' on the
  // death screen; that screen no longer hosts the shop after the
  // "death = moment, hamlet = place" architectural split.
  const row = document.getElementById(containerId);
  if (!row) return;
  row.innerHTML = '';

  // \u2500\u2500 Progress header (audit P1 \u2014 death-screen meta-loop visibility) \u2500\u2500
  // Without this, a new player on death-screen #1 sees the unlock grid
  // sitting inert with everything unaffordable and bounces \u2014 they don't
  // realize essence accumulates toward the upgrades. The header makes
  // the loop SEEN: shows current essence, names the cheapest unowned
  // unlock as the "next goal," and renders a progress bar that fills
  // as essence accumulates death-by-death. Once the next goal becomes
  // affordable, the bar glows + the row text flips to "READY" so the
  // player has a clear "click here" moment.
  const ownedIds = Object.keys(UNLOCKS).filter(id => hasUnlock(id));
  const unowned = Object.entries(UNLOCKS)
    .filter(([id]) => !hasUnlock(id))
    .map(([id, u]) => ({ id, ...u }))
    .sort((a, b) => a.cost - b.cost);
  // The "next goal" is the cheapest unowned unlock. If everything is
  // owned, show a victory state instead.
  const nextGoal = unowned[0];
  // Header div sits ABOVE the unlock grid as a separate block.
  const headerWrap = document.createElement('div');
  headerWrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;width:100%;max-width:780px;margin-bottom:8px;animation:winFadeIn 0.55s ease-out 1.0s both;';
  if (nextGoal) {
    const ownedCount = ownedIds.length;
    const totalUnlocks = Object.keys(UNLOCKS).length;
    const pct = Math.min(1, meta.essence / nextGoal.cost);
    const ready = pct >= 1;
    const remaining = Math.max(0, nextGoal.cost - meta.essence);
    // Progress-bar shell carries the breathing halo class only when
    // ready \u2014 pulls the eye to the actionable moment without nagging
    // when there's no action available yet.
    const _barShellClass = ready ? 'metaProgressBarReady' : '';
    headerWrap.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:baseline;font-family:Georgia,serif;font-size:10px;letter-spacing:1.5px;">
        <span style="color:${ready ? '#a0e8ff' : '#c9a86a'};font-weight:bold;">
          <span style="color:#a0e8ff;font-size:13px;">\u2726 ${meta.essence}</span>
          <span style="opacity:0.55;font-size:9px;margin-left:6px;">ESSENCE BANKED</span>
        </span>
        <span style="color:rgba(200,190,210,0.55);font-size:9px;">UNLOCKS: ${ownedCount} / ${totalUnlocks}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;font-family:Georgia,serif;">
        <span style="font-size:9px;color:rgba(200,190,210,0.55);letter-spacing:1.5px;flex-shrink:0;">NEXT</span>
        <div class="${_barShellClass}" style="flex:1;height:6px;background:rgba(20,12,28,0.85);border-radius:3px;overflow:hidden;border:1px solid ${nextGoal.tint}55;position:relative;">
          <div style="height:100%;width:${(pct * 100).toFixed(1)}%;background:linear-gradient(90deg,${nextGoal.tint}aa,${nextGoal.tint});transition:width 0.4s ease;"></div>
        </div>
        <span style="font-size:11px;color:${ready ? '#a0e8ff' : nextGoal.tint};font-weight:bold;letter-spacing:0.5px;flex-shrink:0;text-shadow:0 0 6px ${ready ? 'rgba(160,232,255,0.5)' : (nextGoal.tint + '44')};">
          ${nextGoal.name}
        </span>
        <span style="font-size:10px;color:${ready ? '#a0e8ff' : 'rgba(200,190,210,0.65)'};font-style:italic;flex-shrink:0;min-width:80px;text-align:right;">
          ${ready ? '\u00b7 READY' : `\u00b7 ${remaining} more`}
        </span>
      </div>
    `;
  } else {
    // All unlocks owned \u2014 celebratory header
    headerWrap.innerHTML = `
      <div style="text-align:center;font-family:Georgia,serif;font-size:11px;letter-spacing:3px;color:#f4d9a0;font-style:italic;text-shadow:0 0 8px rgba(244,217,160,0.5);">
        \u2726 ALL UNLOCKS BOUND \u00b7 ${meta.essence} ESSENCE BANKED \u2726
      </div>
    `;
  }
  row.appendChild(headerWrap);

  // 2-col grid; each cell is one unlock-row. Now nested inside row, with
  // the header above. Need a separate inner div so the grid layout works.
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:4px 12px;width:100%;';
  row.appendChild(grid);
  // Strip the grid layout off the parent \u2014 header + grid stack vertically
  row.style.display = 'flex';
  row.style.flexDirection = 'column';
  row.style.alignItems = 'center';
  row.style.gap = '0';
  row.style.maxWidth = '780px';
  row.style.width = '100%';
  let staggerIdx = 0;
  for (const id in UNLOCKS) {
    const u = UNLOCKS[id];
    const owned = hasUnlock(id);
    const canAfford = meta.essence >= u.cost;
    const rowEl = document.createElement('button');
    rowEl.title = u.flavor ? `${u.name} \u2014 ${u.desc}\n${u.flavor}` : `${u.name} \u2014 ${u.desc}`;
    rowEl.disabled = owned || !canAfford;
    // Stable id so the click handler can find this row AGAIN after
    // renderMetaShop() rebuilds the grid post-purchase. The DOM element
    // is replaced, but the new one shares this id, which lets us pin a
    // celebration animation to the just-bought row.
    rowEl.id = `metaUnlockRow_${id}`;
    const staggerDelay = 1.2 + staggerIdx * 0.04;
    staggerIdx++;
    // Whole row IS the buy button \u2014 saves the dedicated UNLOCK button's
    // width and gives a bigger click target. Disabled when owned or
    // can't afford (visual: dimmed + no hover).
    // --unlock-tint feeds the unlockBurst keyframe so the celebration
    // flash matches the unlock's themed color (gold for Vitality Charm,
    // cyan for future essence-cost reductions, etc.).
    const _tintR = parseInt((u.tint || '#c9a86a').slice(1, 3), 16);
    const _tintG = parseInt((u.tint || '#c9a86a').slice(3, 5), 16);
    const _tintB = parseInt((u.tint || '#c9a86a').slice(5, 7), 16);
    rowEl.style.cssText = `
      display:grid;
      grid-template-columns:24px 1fr auto;
      align-items:center;
      gap:8px;
      background:linear-gradient(90deg,rgba(30,20,38,0.7),rgba(16,8,20,0.55));
      border:1px solid ${u.tint}55;
      border-left:3px solid ${u.tint};
      padding:5px 10px;
      cursor:${canAfford && !owned ? 'pointer' : 'default'};
      font-family:Georgia,serif;
      transition:background 0.18s ease, border-color 0.18s ease, transform 0.12s ease;
      text-align:left;
      --unlock-tint:rgba(${_tintR},${_tintG},${_tintB},0.85);
      ${animate ? `animation:winCardSlide 0.45s ease-out ${staggerDelay}s both;` : ''}
      ${owned ? 'opacity:0.5;' : (canAfford ? '' : 'opacity:0.55;')}
    `;
    rowEl.innerHTML = `
      <img src="assets/icons/${u.icon}.png" style="width:24px;height:24px;image-rendering:pixelated;filter:hue-rotate(${hueRotateForTint(u.tint)}deg) saturate(1.15) drop-shadow(0 0 4px ${u.tint}88);" />
      <span style="display:flex;flex-direction:column;gap:0;min-width:0;">
        <span style="font-size:11px;font-weight:bold;color:${u.tint};letter-spacing:0.8px;text-shadow:0 0 4px ${u.tint}44;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${u.name}</span>
        <span style="font-size:9px;color:rgba(200,190,210,0.65);font-style:italic;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${u.desc}</span>
      </span>
      <span style="font-size:11px;color:${owned ? '#8ad4a2' : (canAfford ? '#a0e8ff' : '#7a6065')};letter-spacing:0.5px;text-shadow:0 0 6px ${owned ? 'rgba(138,212,162,0.4)' : (canAfford ? 'rgba(160,232,255,0.4)' : 'rgba(0,0,0,0.5)')};white-space:nowrap;font-weight:bold;">${owned ? '\u2713' : '\u2728 ' + u.cost}</span>
    `;
    if (!owned && canAfford) {
      rowEl.addEventListener('click', () => {
        // Detect FIRST EVER purchase before consumption — the player
        // crossing this threshold is a major roguelite progression
        // beat ("permanent power earned") and deserves more than a
        // double-ping. Subsequent purchases keep the cleaner cue.
        const isFirstUnlockEver = ownedIds.length === 0;
        if (purchaseUnlock(id)) {
          if (isFirstUnlockEver) {
            // First-purchase celebration — chord + visual burst on the
            // just-bought row + a pickup-banner-style notification
            // announcing what was bound. This is the moment the meta
            // loop locks in; it should FEEL like a milestone, not a
            // transaction. (Earlier version triggered a canvas screen
            // flash, but the death modal is a DOM overlay covering the
            // canvas — flash never showed. Animate the row itself.)
            try { synthChord(523, 1.2, 0.85); } catch (_e) {}
            setTimeout(() => { try { synthFanfare(0.65); } catch (_e) {} }, 180);
            try {
              pushNotification({
                kind: 'achievement',
                title: u.name.toUpperCase() + ' BOUND',
                body: u.desc + ' — every future descent begins with this.',
                tint: u.tint,
              });
            } catch (_e) {}
          } else {
            // Routine purchase — same double-ping as before, no fanfare
            try { synthPing(880, 0.45, 0.22); } catch (_e) {}
            setTimeout(() => { try { synthPing(1320, 0.4, 0.20); } catch (_e) {} }, 120);
          }
          renderMetaShop(false, containerId);
          // After the re-render, find the just-bought row by stable id
          // and toggle the burst animation. Has to happen AFTER
          // renderMetaShop() because that call rebuilds the grid and
          // the rowEl in this closure is stale. requestAnimationFrame
          // ensures the new node is in the layout tree before we
          // attach the class (otherwise the animation can be skipped
          // by some browsers when the node is brand-new).
          requestAnimationFrame(() => {
            const justBought = document.getElementById(`metaUnlockRow_${id}`);
            if (justBought) {
              justBought.classList.remove('unlockJustBought');
              // Force reflow so re-adding the class restarts the
              // animation if a player buys two in quick succession.
              void justBought.offsetWidth;
              justBought.classList.add('unlockJustBought');
            }
          });
        }
      });
      rowEl.addEventListener('mouseenter', () => {
        rowEl.style.background = `linear-gradient(90deg,${u.tint}22,${u.tint}11)`;
        rowEl.style.borderColor = `${u.tint}aa`;
        rowEl.style.transform = 'translateX(2px)';
      });
      rowEl.addEventListener('mouseleave', () => {
        rowEl.style.background = `linear-gradient(90deg,rgba(30,20,38,0.7),rgba(16,8,20,0.55))`;
        rowEl.style.borderColor = `${u.tint}55`;
        rowEl.style.transform = 'translateX(0)';
      });
    }
    grid.appendChild(rowEl);
  }
}

function beginTransition(toIndex, entryFrom) {
  transition.active = true;
  transition.phase = 'out';
  transition.t = 0;
  transition.toIndex = toIndex;
  transition.entryFrom = entryFrom;
  // Non-door transitions (boss-clear cascade, save-resume, debug) clear
  // any lingering residue so we don't carry a fading old room into a
  // fresh fade-in.
  clearPrevRoom();
  playSfx('click', { volume: 0.7, rate: 0.85 });
}

// ─── DOOR TRANSITION (continuous, no fade) ────────────────────────────────
// Hero just walked through an open north door. Instead of the fade-to-black
// that beginTransition uses, we:
//   1. Snapshot the current room as residue (prevRoom)
//   2. Load the new room — hero spawns at south-door tile
//   3. Position prevRoom in world coords so its NORTH door tile overlaps
//      the new room's SOUTH door tile (the "shared threshold")
//   4. The new room's south door is in the entry-dwell state — visually
//      open at first, then animates closed. Player sees the door slam
//      shut behind them and the old room fade out beyond it.
// Door pan — drives the smooth scroll between two rooms.
//
// CRITICAL: when loadRoom swaps to the new room, the world coordinate
// system shifts. Hero position (792, 30) in the OLD room's local coords
// is NOT the same world point after the swap — that local coord now
// refers to a spot in the NEW room. The prevRoom snapshot is rendered
// at offset (offsetX, offsetY) which captures the spatial relationship:
// adding the offset translates an OLD-local position into a NEW-world
// position that lands inside the prevRoom rendering.
//
// During the pan, the hero's world position is LERPED from the
// translated OLD position into the NEW spawn (south door of new room).
// Camera follows. Both rooms remain visible because prevRoom renders
// south of the new room — so the camera scrolls "north" past the
// closing door and into the new space.
let doorPan = null;
// { time, duration, fromX, fromY, toX, toY }

function beginDoorTransition(toIndex, oldDoorTileX) {
  // Capture OLD-LOCAL hero + camera positions BEFORE the swap.
  const oldHeroX = hero.x;
  const oldHeroY = hero.y;
  const oldCamX = camera.x;
  const oldCamY = camera.y;

  // Snapshot the room being LEFT, before loadRoom overwrites it. Pass
  // a per-door-tile open-amount map so the prev-room render keeps the
  // exit door visibly open during the 1.8s fade. Without this, the
  // live _getDoorAt callback (which queries the NEW room's doors)
  // would resolve null for the prev tile coords and the fallback
  // would render the just-used door as closed.
  const doorOpenAt = {};
  for (const d of roomDoors) doorOpenAt[d.tx + ',' + d.ty] = d.anim;
  snapshotPrevRoom({ offsetX: 0, offsetY: 0, doorOpenAt });
  // entryFrom='north' is the existing (inverted-feeling) convention that
  // makes heroSpawnInRoom place the hero at preferredY=h-2 — i.e. near
  // the SOUTH wall, one tile inside the door they just entered through.
  loadRoom(toIndex, 'north');
  // Hero is now at south door of new room. Compute the prevRoom offset
  // so its NORTH door tile overlaps the new room's SOUTH door tile in
  // world space (the "shared threshold").
  const newDoorX = Math.floor(room.w / 2);
  if (prevRoom) {
    prevRoom.offsetX = (newDoorX - oldDoorTileX) * TILE;
    prevRoom.offsetY = (room.h - 1) * TILE;
  }
  const offsetX = prevRoom ? prevRoom.offsetX : 0;
  const offsetY = prevRoom ? prevRoom.offsetY : 0;

  // Translate OLD-local positions → NEW-world positions. Adding the
  // prevRoom offset lands them inside the prevRoom rendering, which
  // is the same spot the player just was VISUALLY.
  const fromX = oldHeroX + offsetX;
  const fromY = oldHeroY + offsetY;
  const toX = hero.x;            // already at NEW spawn (south door)
  const toY = hero.y;
  const camFromX = oldCamX + offsetX;
  const camFromY = oldCamY + offsetY;

  // Reset camera to translated-OLD position so the existing lerp
  // (slowed to 2.0 for this pan) glides to the hero's destination.
  camera.x = camFromX;
  camera.y = camFromY;
  camera.lerp = 2.0;

  doorPan = { time: 0, duration: 0.7, fromX, fromY, toX, toY };
  playSfx('click', { volume: 0.55, rate: 1.05 });
}

// Tick the pan. Smoothly interpolates hero from the translated OLD
// position into the NEW spawn over the duration — no freeze, no
// teleport. Hero "walks through the door" in continuous world space.
function updateDoorPan(dt) {
  if (!doorPan) return;
  doorPan.time += dt;
  const t = Math.min(1, doorPan.time / doorPan.duration);
  // Ease-out cubic — quick start, gentle settle. Reads as "pushed
  // through the door" rather than mechanically lerped.
  const eased = 1 - Math.pow(1 - t, 3);
  hero.x = doorPan.fromX + (doorPan.toX - doorPan.fromX) * eased;
  hero.y = doorPan.fromY + (doorPan.toY - doorPan.fromY) * eased;
  hero.vx = 0;
  hero.vy = 0;
  if (doorPan.time >= doorPan.duration) {
    // Snap to exact target then restore normal physics + camera follow.
    hero.x = doorPan.toX;
    hero.y = doorPan.toY;
    doorPan = null;
    camera.lerp = 6.0;
  }
}

// Returns true while a door pan is in flight — used to suppress hero
// input + enemy AI so the camera move plays cleanly without combat
// interference. Exposed so the main tick can gate updates.
function isDoorPanActive() { return doorPan !== null; }

function updateTransition(dt) {
  if (!transition.active) return;
  const FADE = 0.35;
  transition.t += dt;
  if (transition.phase === 'out' && transition.t >= FADE) {
    loadRoom(transition.toIndex, transition.entryFrom);
    transition.phase = 'in';
    transition.t = 0;
  } else if (transition.phase === 'in' && transition.t >= FADE) {
    transition.active = false;
  }
}

function transitionAlpha() {
  if (!transition.active) return 0;
  const FADE = 0.35;
  const t = Math.min(1, transition.t / FADE);
  return transition.phase === 'out' ? t : (1 - t);
}

let lastT = performance.now();
// Phase 5 audit fix #3 — guardRender wraps the rAF body so any thrown
// exception surfaces to the error overlay rather than freezing the
// canvas mid-frame. window.onerror at the top of this file catches
// non-rAF throws but rAF callbacks are queued by the browser and
// throws inside them silently kill the loop. Renamed the inner body
// to `_tickInner`; the exported `tick` is the wrapped version that
// existing `requestAnimationFrame(tick)` call sites pick up unchanged.
function _tickInner(now) {
  const realDt = Math.min(0.033, (now - lastT) / 1000);
  lastT = now;

  // Mobile-controls visibility hook — body.game-running is set when the
  // run is active, cleared on menus / death / win / hamlet. CSS uses
  // this to hide #mobileControls and #mobilePauseBtn outside gameplay
  // (they were leaking onto the menu screen, which felt janky on
  // phone viewports). Cheap: one classList.toggle per frame; browsers
  // optimize no-op toggles to a tag check.
  document.body.classList.toggle('game-running', running);

  // Level-up modal — hard pause on gameplay. Skip the entire update
  // path but keep rendering so the modal animates. Mouse/key events
  // still fire to the modal handler. Music keeps flowing for ambience.
  if (isLevelUpModalOpen()) {
    updateMusic(realDt);
    render();
    endFrameInput();
    requestAnimationFrame(tick);
    return;
  }

  // When main menu / weapon picker is active, just animate dust + music
  if (menuEl.style.display !== 'none' || weaponPickerEl.style.display !== 'none') {
    updateDust(realDt, 0, 0);
    updateMusic(realDt);
    updateMenuAmbient(realDt);
    renderMenuBg();
    requestAnimationFrame(tick);
    return;
  }

  // Perfect-dodge time dilation runs on real time so it unwinds predictably.
  updatePerfectDodge(realDt);
  updateScreenFlash(realDt);
  updateSoulTethers(realDt);
  updateTips(realDt);                  // no-op shim; real tip lifecycle is in notifications.js
  updateNotifications(realDt);         // unified top-right rail (tips, pickups, etc.)
  // Relic-choice modal — fade animations + deferred-trigger advance.
  // Pass the current room kind so the modal knows what title to show.
  updateRelicChoiceModal(realDt, { roomKind: floor[roomIndex]?.kind });
  // Death ceremony slow-mo ramp (0.25x for first 1.2s, then ramps back)
  let deathSlowmo = 1;
  if (deathCeremonyActive) {
    if (deathCeremonyTime < 1.2) deathSlowmo = 0.25;
    else deathSlowmo = 0.25 + (Math.min(1, (deathCeremonyTime - 1.2) / 0.3)) * 0.75;
  }
  const dt = realDt * getTimeScale() * deathSlowmo;

  // Camera lookahead — Hades/HLD pattern. Polish-comparison audit: was
  // mouse-based (`(mw.x - hero.x) * 0.08`) which breaks on mobile (the
  // virtual joystick doesn't move the mouse pointer; mouse.x/y stays
  // wherever the last touch landed). Now uses hero.aimX/aimY — the
  // normalized aim vector is populated correctly for ALL input paths
  // (mouse, virtual joystick, auto-aim fallback) so the camera leans
  // the same way across platforms.
  // Suppressed during cinematics + non-combat hub (hamlet) so the
  // camera doesn't drift while the player isn't actively aiming.
  // Lerped via the existing camera.lerp follow so a quick aim flip
  // doesn't snap the view.
  const mw = screenToWorld(mouse.x, mouse.y);
  let leadX, leadY;
  if (room.kind === 'hamlet') {
    // Hamlet uses fixed framing; no lookahead.
    leadX = 0; leadY = 0;
  } else {
    // Lookahead — Hades/HLD pattern, biased toward aim direction so
    // off-screen threats register before contact. Tier-1 art-direction
    // sweep bumped from 40 → 80 px after the audit found 40 was on the
    // edge of perceptible (3% of canvas width); 80 reads as a clear
    // bias toward where the player is shooting/aiming without ever
    // taking the hero off-screen at the deepest hero-edge case
    // (hero radius 14 + 80 lead = 94 px from center, well inside the
    // 360 px half-canvas-height safe zone). Y multiplier 0.85 dampens
    // vertical lookahead so aiming up doesn't clip the HUD top band.
    leadX = (hero.aimX || 0) * 80;
    leadY = (hero.aimY || 0) * 80 * 0.85;
  }
  // Mouse position still preserved for `mw` consumers (cursor world
  // pos, used by other systems). Just not used for lookahead anymore.
  void mw;
  // Room reveal — when active, hold camera target at room center so
  // the player can read the layout before the camera commits to the
  // hero. Decremented in real time so the reveal completes even under
  // a floor-card / boss-intro overlay (the room reveal happens
  // invisibly in those cases, so when the overlay clears the camera
  // is already at the hero).
  if (_roomRevealTime > 0) {
    _roomRevealTime -= realDt;
    if (_roomRevealTime > 0) {
      followCamera(_roomRevealCx, _roomRevealCy);
    } else {
      _roomRevealTime = 0;
      followCamera(hero.x + leadX, hero.y + leadY);
    }
  } else {
    followCamera(hero.x + leadX, hero.y + leadY);
  }
  updateCamera(realDt);                    // camera uses real time (no slo-mo jitter)

  const frozen = consumeHitStop(realDt);

  // UNIFIED CINEMATIC FREEZE — any of the three intro overlays (floor card /
  // boss intro / phase-2 boss intro) freezes gameplay so combat can't happen
  // underneath the banner, hero can't walk through the veil, and enemies
  // don't attack a defenseless player. Particles / music / camera shake
  // still tick so the animation reads smoothly.
  //
  // Wall-clock clamps: each timer has a max real-world lifespan. If the
  // normal per-frame decrement gets stuck (pause mid-intro, rAF throttle,
  // state race), the clamp force-clears the timer so the overlay can never
  // persist past its wall cap.
  //
  // PAUSE FIX: when the player ESC-pauses mid-intro, the per-frame decrement
  // block below is gated on `!paused` (so the overlay holds), but the
  // wall-clock CLAMP would still fire after its threshold elapsed in real
  // time — clearing the intro that the player paused over. We work around
  // this by advancing the *startedAt* timestamps forward by the paused
  // delta each frame, effectively "stopping the wall clock" during pause.
  // The clamps still work correctly when not paused; pausing for any
  // duration just shifts the deadline forward.
  const nowMs = performance.now();
  if (paused) {
    const pausedDtMs = realDt * 1000;
    if (bossIntroStartedAt > 0) bossIntroStartedAt += pausedDtMs;
    if (floorCardStartedAt > 0) floorCardStartedAt += pausedDtMs;
    if (phaseIntroStartedAt > 0) phaseIntroStartedAt += pausedDtMs;
  }
  // Wall-clock clamp scales with bossIntroTotal — 300ms safety past the
  // natural end on both 2.2s (first-time) and 1.3s (repeat) durations.
  if (bossIntroTime > 0 && bossIntroStartedAt > 0 && nowMs - bossIntroStartedAt > bossIntroTotal * 1000 + 300) {
    bossIntroTime = 0; bossIntroBoss = null; bossIntroStartedAt = 0;
  }
  // Wall-clock clamp scales with floorCardTotal — we want a 1.3s safety
  // buffer past the natural end on both the 3.2s (first-time) and 1.6s
  // (repeat) durations.
  if (floorCardTime > 0 && floorCardStartedAt > 0 && nowMs - floorCardStartedAt > floorCardTotal * 1000 + 1300) {
    floorCardTime = 0; floorCardStartedAt = 0;
  }
  if (phaseIntroTime > 0 && phaseIntroStartedAt > 0 && nowMs - phaseIntroStartedAt > 2000) {
    phaseIntroTime = 0; phaseIntroBoss = null; phaseIntroStartedAt = 0;
  }
  const introActive = (bossIntroTime > 0 || floorCardTime > 0 || phaseIntroTime > 0) && !paused;
  if (introActive) {
    if (bossIntroTime > 0)  bossIntroTime  -= realDt;
    if (floorCardTime > 0)  floorCardTime  -= realDt;
    if (phaseIntroTime > 0) phaseIntroTime -= realDt;
    updateParticles(realDt);
    updateDust(realDt, camera.x, camera.y);
    updateMusic(realDt);
    updateFx(realDt);
    render();
    endFrameInput();
    requestAnimationFrame(tick);
    return;
  }

  // During the boss-clear cascade, running is already false (set on boss kill),
  // but the coin vacuum + particles need to keep ticking so coins magnetize
  // to the hero. Extend core updates for ~cascade_duration + 800ms.
  const cascadeActive = !!(window.__cascadeUntil && performance.now() < window.__cascadeUntil);
  if ((running || cascadeActive) && !transition.active && !frozen && !paused) {
    // During a door pan, hero/enemy/projectile updates are paused so the
    // camera scroll plays cleanly without combat or input interference.
    // The pan itself is ticked further below (updateDoorPan).
    const panActive = isDoorPanActive();
    // First-run intro lock — the heartbeat cinematic plays over a live
    // dungeon room (hero pre-spawned). Hero/enemy updates freeze for
    // the 28s of cinematic + the 2s reveal so the player isn't getting
    // chewed on by a slime while reading "they left you for dead". The
    // intro tick advances regardless of this gate.
    // Renamed from `introActive` to avoid shadowing the outer
    // `introActive` (boss/floor card cinematics, line ~5371).
    const wakeIntroActive = isIntroActive();
    // Hub-modal lock — when a dialogue or NPC-service modal is on screen
    // (player chatting with an NPC, browsing the smith forge, reading
    // the oracle, etc.), the hero must not respond to WASD or LMB. The
    // dialogue overlay traps mouse events but does NOT block keyboard,
    // so a player who held W while the modal opened would silently walk
    // behind it — sometimes off the NPC, sometimes onto the descent
    // portal, triggering a run start.
    const hubModalOpen = (
      (dialogueEl && dialogueEl.style.display !== 'none') ||
      (smithEl && smithEl.style.display !== 'none') ||
      (typeof oracleEl !== 'undefined' && oracleEl && oracleEl.style.display !== 'none') ||
      (cursesEl && cursesEl.style.display !== 'none') ||
      (memoryEl && memoryEl.style.display !== 'none') ||
      (settingsEl && settingsEl.style.display !== 'none') ||
      (achEl && achEl.style.display !== 'none') ||
      (volumesEl && volumesEl.style.display !== 'none')
    );
    // Relic choice modal pauses world updates so the hero can't drift
    // around while the player reads the cards. Pedestal rooms have no
    // enemies so this is a soft pause — visual only, no danger.
    const choiceModalActive = isRelicChoiceModalOpen();
    if (!panActive && !hubModalOpen && !wakeIntroActive && !choiceModalActive) {
      updateHero(dt, enemies, mw);
      updateEnemies(dt, hero);
      updateFlames(dt);
      updateEmberRings(dt);
      updateProjectiles(dt);
      updateSynergies(dt);
      updateWanderer(dt);
    }
    // Intro cinematic — advance the heartbeat-pulse + text-fade clock
    // every frame the cinematic is active, regardless of pause/transition
    // gates above. Uses realDt (not dt) so it ignores hit-stop time
    // dilation.
    if (wakeIntroActive) updateIntro(realDt);
    // Music resume — when the cinematic finishes, fire the floor's
    // biome track. AWAKEN handler killed the music to leave the
    // heartbeat alone in the soundscape; the cinematic ends with the
    // player in floor 1's start room with no transition pending, so
    // nothing else would re-trigger playTrack on its own. Detect the
    // true→false edge and resume.
    if (_wasIntroActive && !wakeIntroActive) {
      const biomeTrack = BIOME_BY_FLOOR[currentFloorLevel] || 'ambient';
      playTrack(biomeTrack);
    }
    _wasIntroActive = wakeIntroActive;
    updateGold(dt, hero);
    updateHudAnims(realDt);
    // Tick the prevRoom residue (the snapshot of the room we just left,
    // fading out behind the hero for "see where I came from" continuity).
    tickPrevRoom(realDt);
    // Tick the door pan — if active, this freezes hero in place while the
    // camera scrolls between rooms, then releases the hero to the new spawn.
    updateDoorPan(realDt);
    updateParticles(dt);
    updateThemedRoomMotes(realDt, canvas.width, canvas.height);
    updateZoneAmbient(realDt, canvas.width, canvas.height);
    // Stand-and-Hold zone runner — wave state machine + portal entity.
    // Only active when a zone run is in progress (started via __startZoneRun
    // or __loadCryptSample in zone-run mode). Idempotent when idle.
    updateZoneRunner(dt);
    updateZonePortal(dt, hero.x, hero.y);
    // XP gems — vacuum + collect. The level-up modal pauses gameplay
    // when open, but gem motion still ticks (so they don't freeze in air).
    updateXp(dt, hero.x, hero.y);
    updateDust(realDt, camera.x, camera.y);
    updateWeather(realDt, camera.x, camera.y);
    updateAmbientCreatures(realDt, camera.x, camera.y);
    // Atmospheric dim — drives a smooth 0→1 fade for ambient particle
    // layers (dust / weather / themed motes) during active combat.
    // Source of truth lives in the render block (called per frame regardless
    // of update gating); see _atmosphericDim usage below for the full
    // contract.
    updateAtmosphericDim(realDt);
    updateFx(dt);
    updateHitMarkers(dt);
    updatePedestals(dt);
    updateMusic(realDt);
    tickCounterPips(dt);
    // HAMLET CANVAS — proximity + interact tracking. Runs on every tick
    // so the interact prompt appears the moment the hero walks into range.
    if (room.kind === 'hamlet') {
      // Clamp hero to the hamlet's walkable Y band. The band is wide now
      // (y 340–648) so the hero can approach the tower, visit the shrine,
      // and wander the ruined edges. Hard Y-clamp first, then obstacle
      // resolution pushes the hero out of building footprints.
      if (hero.y < HAMLET_WALK_Y_MIN) { hero.y = HAMLET_WALK_Y_MIN; hero.vy = 0; }
      if (hero.y > HAMLET_WALK_Y_MAX) { hero.y = HAMLET_WALK_Y_MAX; hero.vy = 0; }
      resolveHamletCollision(hero);
      // Lock camera to the room center — the room is narrower than the
      // viewport (960 vs 1280) so there's a mandatory ~160px side-void.
      // Locking prevents the void from shifting as the hero moves and
      // keeps the painted backdrop perfectly framed.
      // Scene v2 backdrop is 1376×768. Viewport 1280×720 at HAMLET_ZOOM (1.75)
      // → visible window ~731×411 of world. Both axes scroll.
      //   X clamp: camera.x in [366, 1010]
      //   Y clamp: camera.y in [206, 562]
      // SNAP both axes — followCamera ran earlier in the tick with the
      // unclamped hero pos; we override here so the rendered frame uses
      // our clamped values (no lerp jitter at clamp boundaries).
      camera.zoom = HAMLET_ZOOM;
      const camX = Math.max(366, Math.min(1010, hero.x));
      const camY = Math.max(206, Math.min(562, hero.y));
      camera.x = camX; camera.targetX = camX;
      camera.y = camY; camera.targetY = camY;

      updateHamletScene(dt);
      if (keyJustPressed('KeyE')) {
        const act = consumeHamletInteract();
        if (act) {
          if (act.action === 'dialogue') openDialogue(act.npcId);
          else if (act.action === 'portal') { running = false; beginDescent(); }
          else if (act.action === 'shrine') showSanctuaryShrine();
          else if (act.action === 'noticeboard') {
            // Cycle through a small pool of flavor lines so re-reads
            // aren't always the same. Lines are short enough for the
            // 30px italic roomLabel without wrapping.
            const lines = [
              'BEWARE: SOME CHESTS BITE BACK',
              '"DESCEND. RETURN. THE SPARK GROWS."',
              'TIP: HOLD LMB TO CHARGE A HEAVIER SWING',
              '"THE FIRE HERE BURNS SMALL — BUT IT BURNS."',
              'TIP: DODGE GIVES BRIEF I-FRAMES',
            ];
            const i = (Math.floor(performance.now() / 1000) ^ 0x5b) % lines.length;
            roomLabelText = lines[i];
            roomLabelColor = '#c9a86a';
            roomLabelTime = 3.0;
            playSfx('click', { volume: 0.6, rate: 0.95 });
          }
        }
      }
    }

    // ─── PEDESTAL PICKUP + BLOOD GATE INTERACTION (DUNGEON ONLY) ───────
    // Round-7 user feedback — walking onto a pedestal used to be an
    // INSTANT pickup, which players said felt like an accidental claim
    // when traversing rooms quickly. Now the player must press E to
    // commit. consumePendingPickup is null-safe (returns null when no
    // pedestal is hovered) so the gate is cheap; we just skip during
    // hamlet/menu/dead states to keep keypresses scoped.
    //
    // Phase 5 of the rooms-redesign plan adds Blood Door seal-breaking
    // to the same E-press handler. Pedestal hover takes priority: if
    // a pedestal is in range, that's what the player meant; if not,
    // and a sealed door is in range, treat it as a seal-break attempt.
    // Single keypress, single intent.
    if (room.kind !== 'hamlet' && hero.state !== 'dead' && keyJustPressed('KeyE')) {
      // Choice pedestal — opens the relic-choice modal instead of
      // consuming the relic directly. The modal renders the
      // pedestal's offers as cards; player picks via mouse / keyboard.
      // Falls through to consumePendingPickup if the hovered pedestal
      // is not a choice pedestal (legacy shop / boss bonus / etc.).
      const _hovIdx = getHoveredPedestalIndex();
      const _hovPed = _hovIdx >= 0 ? pedestals[_hovIdx] : null;
      if (_hovPed && _hovPed.kind === 'choice' && !_hovPed.picked) {
        requestRelicChoiceModal();
        // No fall-through — the modal owns the rest of the interaction.
      } else {
      const result = consumePendingPickup();
      if (result === 'denied_hp') {
        // Altar with insufficient HP — flash a denied label so the
        // player understands why their press did nothing. Mirrors
        // the reroll "NOT ENOUGH GOLD" pattern.
        roomLabelText = `NOT ENOUGH HP TO PAY THIS ALTAR`;
        roomLabelColor = '#d85a5a';
        roomLabelTime = 1.6;
        synthClick(0.5, 1.0);
      } else if (result === 'denied_gold') {
        // Round-7 — Shop pedestal with insufficient gold. Mirrors the
        // altar deny pattern. The pedestal already shows a red border
        // on its price tag while affordable would be green, so this
        // label confirms what the player already saw visually.
        roomLabelText = `NOT ENOUGH GOLD`;
        roomLabelColor = '#d85a5a';
        roomLabelTime = 1.6;
        synthClick(0.5, 1.0);
      } else if (result === null) {
        // No pedestal hovered — fall through to the seal-break path so
        // the same key opens the same intent ("interact with whatever
        // I'm standing near"). Returns null when no door is sealed +
        // in range, so this is also cheap.
        const sealedDoor = getNearbySealedDoor(hero.x, hero.y);
        if (sealedDoor) {
          // PITY-COST RULE — the seal can never kill you outright.
          // Earlier code did `if (hero.hp <= sealCost) BLOCK` which
          // softlocked any run that reached a blood-altar door at
          // exactly the door's HP cost (or lower) — there's no
          // "go around" option in this game's graph. The fix:
          // effectiveCost = min(sealCost, hp - 1). The door always
          // opens; you always survive with at least 1 HP; at high
          // HP you pay the full sacrifice; at low HP the altar
          // takes only what you can spare.
          //
          // Genre-consistent (Hades altars, Slay-the-Spire events,
          // RoR shrines never one-shot you for accepting). Diegetic
          // justification: the altar is a TRADE, not an execution.
          // Adding a small "MERCY" feedback when the cost is
          // reduced lets the player understand what happened
          // without making them re-read the rules.
          const askedCost     = sealedDoor.sealCost | 0;
          const effectiveCost = Math.max(0, Math.min(askedCost, hero.hp - 1));
          const wasMercy      = effectiveCost < askedCost;
          // Pay the cost and break the seal. damageHero would route
          // through the hurt SFX + screen flash + iframes — wrong
          // for a deliberate trade. Decrement hero.hp directly so
          // the cost reads as a willing offering, not an attack.
          hero.hp -= effectiveCost;
          breakSeal(sealedDoor);
          // Audio: full-cost SEAL BROKEN gets the heavy thud + rising
          // chord. Mercy path uses a softer chord — the altar is
          // showing kindness, not cracking under pressure.
          try { synthThud(wasMercy ? 90 : 60, wasMercy ? 0.7 : 1.0, wasMercy ? 0.28 : 0.4); } catch (_e) {}
          try { synthChord(wasMercy ? 528 : 440, 0.7, 0.7); } catch (_e) {}
          shakeCamera(wasMercy ? 4 : 8, 0.3);
          // Mercy uses a warmer flash (gold/amber) instead of crimson
          // — visually distinct from the heavy "you bled for this" beat.
          triggerScreenFlash(
            wasMercy ? 'rgba(255, 200, 130, 0.16)' : 'rgba(220, 80, 90, 0.18)',
            0.35,
          );
          // Crimson sparkle burst at the door tile (mercy path uses
          // warm gold instead). The audio + camera + flash already
          // framed the moment; the particle burst anchors WHERE.
          const _doorWX = sealedDoor.tx * TILE + TILE / 2;
          const _doorWY = sealedDoor.ty * TILE + TILE;
          if (wasMercy) {
            for (let k = 0; k < 14; k++) {
              deathBurst(_doorWX, _doorWY, k % 2 === 0 ? '#f4c860' : '#ffe098');
            }
            for (let k = 0; k < 6; k++) {
              const ang = (k / 6) * Math.PI * 2;
              const r = 20 + Math.random() * 12;
              sparkle(_doorWX + Math.cos(ang) * r, _doorWY + Math.sin(ang) * r * 0.6, '#fff2c8');
            }
          } else {
            for (let k = 0; k < 18; k++) {
              deathBurst(_doorWX, _doorWY, k % 2 === 0 ? '#d04050' : '#ff8088');
            }
            for (let k = 0; k < 8; k++) {
              const ang = (k / 8) * Math.PI * 2;
              const r = 22 + Math.random() * 14;
              sparkle(_doorWX + Math.cos(ang) * r, _doorWY + Math.sin(ang) * r * 0.6, '#ffd0d8');
            }
          }
          // Banner copy reflects which path fired:
          //   Full cost  -> "✦ SEAL BROKEN ✦"          (crimson)
          //   Mercy      -> "✦ THE ALTAR SPARES YOU ✦"  (warm gold)
          // The mercy line conveys that the door opened despite the
          // full price not being met — without exposing the literal
          // pity-cost mechanic to the player.
          roomLabelText  = wasMercy ? `✦ THE ALTAR SPARES YOU ✦` : `✦ SEAL BROKEN ✦`;
          roomLabelColor = wasMercy ? '#f4d9a0' : '#ff8088';
          roomLabelTime  = 1.8;
        }
      }
      // result === non-null relic def: pedestal pickup happened, no
      // additional action needed — the pickup itself fires its own
      // banner + sfx via pedestals.js.
      } // end else (non-choice pedestal path)
    }

    // ─── TREASURE CHEST INTERACTION (DUNGEON ONLY) ─────────────────────
    // E pressed near a closed chest in a chestroom → open it + apply
    // reward immediately (animation is purely visual feedback).
    //
    // Treasure: drop gold scaled by floor; floor 3+ has a chance to roll
    //   a relic pedestal instead.
    // Mimic: damage hero 1 HP + spawn 1-2 floor-appropriate enemies near
    //   the chest. Room flips to !cleared so doors lock until enemies die.
    if (room.kind === 'chestroom' && keyJustPressed('KeyE')) {
      const HR = 80;     // interact range from hero center to chest center
      let nearest = null, nearestD2 = HR * HR;
      for (const c of roomChests) {
        if (c.state !== 'closed') continue;
        const cx = c.x * TILE + TILE / 2;
        const cy = c.y * TILE + TILE / 2;
        const dx = hero.x - cx, dy = hero.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < nearestD2) { nearest = c; nearestD2 = d2; }
      }
      if (nearest) {
        nearest.state = 'opening';
        nearest.frameTime = 0;
        const cx = nearest.x * TILE + TILE / 2;
        const cy = nearest.y * TILE + TILE / 2;
        if (nearest.variant === 'treasure') {
          // Floor-scaled gold + relic chance.
          // Tuned 2026-04-27 (Wave 2): expected value RISES with floor
          // depth to compensate for the rising mimic ratio. Floor 1-2
          // chests are gold-only. Floor 3 has 40% relic chance (was
          // 30%); floor 4 has 70% relic chance (was 50%) — meaningful
          // jump on the floor where 3 of 5 chests are mimics.
          const lvl = currentFloorLevel | 0;
          const goldAmt = 25 + lvl * 15 + ((Math.random() * 30) | 0);
          const relicChance = lvl >= 4 ? 0.70 : (lvl >= 3 ? 0.40 : 0);
          if (Math.random() < relicChance) {
            const relic = rollRelicOffer(1, lvl)[0];
            if (relic) {
              // Round-7-audit fix: factory infers `tier` from relic.id
              // so a mythic-pool chest pickup gets full mythic-tier
              // visuals + audio + cinematic. Was rendering as common
              // because the manual push omitted the tier field.
              pushPedestal({
                x: cx, y: cy + 8,     // slight offset so pedestal sits south of chest
                relic,
                bonus: true,          // free drop, won't wipe sibling offers
              });
            } else {
              import('./gold.js').then(g => g.dropGold(cx, cy, goldAmt));
            }
          } else {
            import('./gold.js').then(g => g.dropGold(cx, cy, goldAmt));
          }
          // Visual jackpot feedback — golden flash + cyan/gold sparkle
          // burst + roomLabel reveals 'TREASURE!' so the player gets a
          // clear positive payoff moment when the gamble paid off.
          triggerScreenFlash('rgba(255, 220, 140, 0.20)', 0.35);
          for (let i = 0; i < 12; i++) sparkle(cx + (Math.random() - 0.5) * 40, cy + (Math.random() - 0.5) * 30, '#9ad7ff');
          for (let i = 0; i < 8; i++) sparkle(cx + (Math.random() - 0.5) * 50, cy + (Math.random() - 0.5) * 36, '#ffe5a0');
          roomLabelText = '✦ TREASURE ✦';
          roomLabelColor = '#ffd27a';
          roomLabelTime = 1.6;
          playSfx('slime_death', { rate: 0.6, volume: 0.7 });
        } else {
          // MIMIC — damage + spawn enemies
          damageHero(1, hero.x, hero.y + 20, 'mimic');
          const lvl = currentFloorLevel | 0;
          // Floor-appropriate spawn types — must match keys in
          // enemies.js TYPES (verified 2026-04-27 after a P0 bug
          // where 'skeleton' and 'fire_imp' silently failed to spawn
          // because spawnEnemy returns early on missing TYPES[type]).
          const spawnType = lvl <= 1 ? 'slime'
                          : lvl === 2 ? 'skel'      // was 'skeleton' (does not exist)
                          : lvl === 3 ? 'wizard'
                          : 'ember';                // was 'fire_imp' (does not exist) — floor 4 fire-themed
          // Mimic difficulty bumped on floors 1-2: was 1 enemy / floor
          // (felt trivial for a 1-HP-damage trap). Now 2 normals on
          // every floor; floor 3+ also gets a 50% elite chance.
          const spawnCount = 2;
          const elite = lvl >= 3 && Math.random() < 0.5;
          for (let i = 0; i < spawnCount; i++) {
            const ang = (i / spawnCount) * Math.PI * 2 + Math.random() * 0.5;
            const sx = cx + Math.cos(ang) * 60;
            const sy = cy + Math.sin(ang) * 60;
            spawnEnemy(spawnType, sx, sy, { elite });
          }
          // Room becomes uncleared — doors lock until enemies die
          room.cleared = false;
          // Round-7-audit HIGH-3 fix: chest rooms ship `cleared: true`
          // so doors auto-open on entry. Without these two lines, the
          // mimic spawn flips cleared:false but the doors stay OPEN
          // and the player just walks out of the fight (free skip on
          // a 1-HP-trap encounter). onRoomLocked closes the doors
          // immediately; the _roomClearedNotified reset lets the
          // existing post-clear block at line 6502 fire onRoomCleared
          // again when the mimic dies and `cleared` flips back.
          onRoomLocked();
          _roomClearedNotified = false;
          // Visual jolt — bigger shake + flash + 'MIMIC!' reveal label
          // so the player gets the punishment-then-fight beat clearly.
          shakeCamera(12, 0.32);
          triggerScreenFlash('rgba(255, 80, 40, 0.28)', 0.35);
          roomLabelText = '⚠ MIMIC ⚠';
          roomLabelColor = '#ff6a55';
          roomLabelTime = 1.6;
          playSfx('hero_hurt', { rate: 0.7, volume: 0.85 });
          playSfx('slime_death', { rate: 0.35, volume: 0.6 });     // deeper roar
          // Burst of red death-particles where the chest sat — visual
          // 'something just came out of this chest' moment
          for (let i = 0; i < 14; i++) deathBurst(cx, cy - 10, '#ff6a55');
        }
      }
    }

    // ─── M-KEY MAP PEEK ────────────────────────────────────────────────
    // The clickable floor-map overlay is no longer the primary path picker
    // (doors do that now), but it's still useful as a "where am I in this
    // dungeon" reference. M opens it; clicking a node still commits — same
    // as the legacy flow — so power users who prefer the map keep it.
    if (currentGraph && currentNodeId !== null && keyJustPressed('KeyM') &&
        !_mapPickInFlight && room.kind !== 'hamlet') {
      _mapPickInFlight = true;
      openFloorMap(currentGraph, currentNodeId).then(pickedId => {
        _mapPickInFlight = false;
        if (pickedId == null) return;
        const curNode = getFloorNode(currentGraph, currentNodeId);
        const picked = getFloorNode(currentGraph, pickedId);
        if (!curNode || !picked) return;
        // Only allow committing via map if room is cleared (parity with doors)
        if (!room.cleared) return;
        curNode.visited = true;
        curNode.current = false;
        picked.current = true;
        currentNodeId = pickedId;
        floor.push(picked.roomData);
        clearDoors();
        _roomClearedNotified = false;
        beginTransition(floor.length - 1, 'south');
      });
    }

    gameTime += realDt;
    heroSpikeCD -= dt;
    if (roomLabelTime > 0) roomLabelTime -= realDt;
    // floorCardTime now decrements in the unified intro-freeze block above.
    if (fusionBannerTime > 0) fusionBannerTime -= realDt;
    updateChromAberr(realDt);
    // Pick up queued codex entries emitted by enemies.spawnEnemy.
    // Route to the top-right notification rail (same lane as fusions /
    // pickups / theme unlocks). Was a centered parchment banner that
    // dominated the upper canvas for 3.6s; rail entries are smaller,
    // shorter-lived, consistent with every other transient announcement.
    if (window.__pendingCodexEntry) {
      const E = window.__pendingCodexEntry;
      pushNotification({
        kind: 'codex',
        title: E.name,
        body: '“' + E.flavor + '”',
        tint: E.color || '#c0b090',
        header: '— A NEW ADVERSARY —',
        life: 4.0,
      });
      window.__pendingCodexEntry = null;
    }
    // Claim the center banner slot while ANY centered overlay is visible —
    // codex banner, floor intro card, boss intro, phase-2 banner, OR the
    // Keeper wake cinematic (first-ever entry monologue). Tips defer to
    // this so they don't fade in UNDER an active intro card.
    // Previously only the codex banner claimed the slot, which let
    // first-floor-tip showings (e.g. first_combat at floor-1 entry)
    // stack invisibly behind the FLOOR I — THE UNDERCROFT card.
    // Wake-cinematic-active was a per-frame fix: playKeeperWake sets
    // window.__centerBannerActive = true on start, but THIS block was
    // overwriting it every tick before the cinematic dismissed —
    // letting tips silently fire under the wake overlay.
    window.__centerBannerActive =
      floorCardTime > 0 ||
      bossIntroTime > 0 ||
      phaseIntroTime > 0 ||
      _wakeCinematicActive ||
      isIntroActive() ||    // heartbeat intro — defer notifications until reveal
      isRelicChoiceModalOpen() ||    // pedestal-choice modal claims the screen
      // Wizard-kit Sprint 3D UX audit — run-end states own the screen.
      // Suppresses pickup banner, notifications, tips so they don't
      // stack on top of "YOU HAVE FALLEN" / floor-clear / win modals.
      hero.state === 'dead' ||
      deathCeremonyActive ||
      _firstDeathFadeActive ||
      (deathEl && deathEl.style.display === 'flex') ||
      (winEl && winEl.style.display === 'flex');
    // Dynamic tab title — reflects run state. Throttled to ~2Hz via gameTime.
    if ((gameTime | 0) !== _lastTitleUpdateSec) {
      _lastTitleUpdateSec = gameTime | 0;
      const hpStr = `${hero.hp}/${hero.maxHp}`;
      const floorStr = `F${currentFloorLevel}/${MAX_FLOORS}`;
      const warn = hero.hp / hero.maxHp <= 0.30 ? '❤ ' : '';
      document.title = `${warn}Ethera · ${floorStr} · ${hpStr} HP`;
    }

    // MUSIC INTENSITY — Round-6 AV audit retune. Old formula was
    // `aliveCount / 5`, which gave a boss alone at full HP intensity
    // 0.2 while a trash room with 5 slimes hit 1.0 — bosses didn't
    // swell harder than chaff, and the music never reacted to the
    // hero's own peril. New formula composes three signals:
    //
    //   1. Density   — alive enemy count, capped at 0.7 (chaff alone
    //                  can't max the swell; that's reserved for bosses
    //                  + low-HP states).
    //   2. Boss tier — any boss in the room raises the floor to 0.65;
    //                  an ENRAGED (phase-2) boss forces 1.0 outright.
    //   3. Peril     — hero HP below 50% adds up to +0.35 linearly,
    //                  topping out at 0 HP. The music recognises that
    //                  the player is bleeding without needing the boss
    //                  to do anything.
    //
    // The smoothed, per-frame swell applied in music.js still tops out
    // at +35% volume (no new max). This change just makes the right
    // beats trigger it.
    const _roomKind = floor[roomIndex]?.kind;
    const aliveCount = enemies.filter(e => !e.dead).length;
    const isCombatRoom = _roomKind === 'combat' || _roomKind === 'boss' || _roomKind === 'challenge';
    let _musicIntensity = 0;
    if (isCombatRoom && aliveCount > 0) {
      let density = Math.min(0.7, aliveCount / 5);
      const bossAlive = enemies.some(e => e.boss && !e.dead);
      if (bossAlive) density = Math.max(density, 0.65);
      const bossEnraged = enemies.some(e => e.boss && e._enraged && !e.dead);
      if (bossEnraged) density = 1.0;
      const hpFrac = hero.hp / Math.max(1, hero.maxHp);
      const peril = hpFrac < 0.5 ? (1 - hpFrac / 0.5) * 0.35 : 0;
      _musicIntensity = Math.min(1, density + peril);
    }
    setMusicIntensity(_musicIntensity);

    // PROXIMITY HUM — subtle pedestal/altar/wanderer hum when hero is near.
    // Implemented as an intermittent low-volume ping that ramps with closeness.
    {
      let nearestPedestalD = Infinity;
      for (const p of pedestals) {
        if (p.picked) continue;
        const d = Math.hypot(hero.x - p.x, hero.y - p.y);
        if (d < nearestPedestalD) nearestPedestalD = d;
      }
      if (nearestPedestalD < 140) {
        // Audio review P1: don't ping during active combat — the hum
        // metronome stacks with low-HP heartbeat + fusion banner audio +
        // healchord into a noisy mix. In safe rooms (no live enemies)
        // the ping draws the player's eye to the pedestal; in combat
        // it just adds clutter. Suppress while any enemy is alive.
        const liveEnemyCount = enemies.filter((e) => !e.dead).length;
        if (liveEnemyCount === 0) {
          _proximityHumT -= realDt;
          if (_proximityHumT <= 0) {
            const closeness = 1 - nearestPedestalD / 140;
            synthPing(600 + closeness * 400, 0.25 + closeness * 0.3, 0.2);
            _proximityHumT = 0.75 - closeness * 0.3;
          }
        }
      }
    }

    // LOW-HP HEARTBEAT — synth thump synced with vignette pulse
    {
      const hpFrac = hero.hp / Math.max(1, hero.maxHp);
      if (hpFrac <= 0.20 && hero.hp > 0) {
        _heartbeatT -= realDt;
        if (_heartbeatT <= 0) {
          const urgency = 1 - (hpFrac / 0.20);
          synthThud(55 - urgency * 10, 0.4 + urgency * 0.3, 0.18);
          _heartbeatT = 0.7 - urgency * 0.3;     // faster as HP drops
        }
      } else {
        _heartbeatT = 0;
      }
    }

    // Two legacy ambient emitters used to live here:
    //   - "BIOME WEATHER — always-on ambient emitter" — sparkled 3.5
    //     gold flecks/sec across the whole viewport in vault (more in
    //     other biomes), via sparkle() into the main particle pool.
    //   - "Ambient combat wisps" — 4 warm-tan sparkles/sec spawning in
    //     a 480×280 box around the hero ONLY during active combat.
    //
    // Both used the main particle pool, which means they bypassed the
    // combat-aware atmospheric dim (dim only affects dust/weather/themed
    // motes). Net effect: combat space stayed cluttered with bright
    // motes even after the dim refactor — exactly the noise the audit
    // pass was supposed to clean up.
    //
    // They were also doing duplicate work — the dust + weather systems
    // already cover per-biome ambient texture, and they cleanly fade
    // during combat. The legacy emitters are pure redundancy with no
    // visual contribution dust+weather doesn't already make.
    //
    // Pre-boss atmosphere embers (next block) are kept — those are a
    // DIRECTIONAL cue (drift FROM the boss door), not random ambient.
    // PRE-BOSS ATMOSPHERE — when next room is boss, drift red embers from the
    // north door. Makes the approach feel heavy.
    if (roomNextKind.kind === 'boss' && room.doors.north) {
      // North door is at center-top of the room; drift embers downward from it.
      const doorX = Math.floor(room.w / 2) * TILE + TILE / 2;
      const doorY = 0;
      // ~6 embers per second
      if (Math.random() < realDt * 6) {
        sparkle(doorX + (Math.random() - 0.5) * 72, doorY + 12, '#ff6040');
      }
    }

    // Secret reward — once the cracked wall breaks, spawn a relic + gold pile
    if (roomSecrets.broken && !roomSecrets.rewardGiven) {
      roomSecrets.rewardGiven = true;
      const wx = roomSecrets.crackX * TILE + TILE/2;
      const wy = roomSecrets.crackY * TILE + TILE/2;
      // Pedestal spawned INSIDE the wall position (now floor) — tier-bumped reward
      // to reward curious players. Uses floor-level-appropriate roll.
      // Round-7-audit: factory infers tier so mythic secret-wall drops
      // (rare on F4) get full mythic-tier visual treatment. `bonus`
      // tag opts out of the sibling-pick wipe.
      const _secretRelic = rollRelicOffer(1, currentFloorLevel)[0];
      if (_secretRelic) {
        pushPedestal({ x: wx, y: wy, relic: _secretRelic, bonus: true });
      }
      // Fat gold pile — 30 coins now (was 15)
      gold.total += 0;        // no-op; guards against import issue
      import('./gold.js').then(g => g.dropGold(wx, wy, 30));
      // Full HP restore — secret rewards always include a heal
      hero.hp = hero.maxHp;
      // Dramatic particle burst + sparkle jackpot
      for (let i = 0; i < 24; i++) deathBurst(wx, wy, '#ffd68a');
      for (let i = 0; i < 14; i++) sparkle(wx + (Math.random() - 0.5) * 60, wy + (Math.random() - 0.5) * 40, '#fff2b8');
      shakeCamera(18, 0.45);
      triggerScreenFlash('rgba(255, 220, 140, 0.2)', 0.35);
      playSfx('slime_death', { rate: 0.45, volume: 0.85 });
      playSfx('click', { rate: 0.6, volume: 0.9 });
      roomLabelText = '✦ SECRET REVEALED ✦';
      roomLabelColor = '#ffd68a';
      roomLabelTime = 2.5;
    }

    // Spike damage — hero or enemy standing on an active spike
    if (heroSpikeCD <= 0) {
      const dmg = spikeDamageAt(hero.x, hero.y, gameTime);
      if (dmg > 0 && hero.state !== 'shield' && hero.state !== 'dash' && hero.state !== 'blink') {
        heroSpikeCD = 0.5;
        damageHero(dmg, hero.x, hero.y + 20, 'spike');
      }
    }
    // Fire pool damage (Broodmother arena)
    if (heroSpikeCD <= 0) {
      const fdmg = firePoolDamageAt(hero.x, hero.y, gameTime);
      if (fdmg > 0 && hero.state !== 'shield' && hero.state !== 'dash' && hero.state !== 'blink') {
        heroSpikeCD = 0.5;
        damageHero(fdmg, hero.x, hero.y + 20, 'fire_pool');
      }
    }
    // Broodmother enrage — spawn 2 more fire pools when she first enrages
    const brood = enemies.find(e => e.type === 'broodmother' && e._enraged && !e._arenaEscalated);
    if (brood) {
      brood._arenaEscalated = true;
      spawnExtraFirePool(8 * TILE + TILE/2, 7 * TILE + TILE/2, 0.3);
      spawnExtraFirePool(11 * TILE + TILE/2, 7 * TILE + TILE/2, 1.2);
    }
    for (const e of enemies) {
      if (e.dead) continue;
      if (!e._spikeCD) e._spikeCD = 0;
      e._spikeCD -= dt;
      if (e._spikeCD > 0) continue;
      const ed = spikeDamageAt(e.x, e.y, gameTime);
      if (ed > 0) {
        e._spikeCD = 0.5;
        e.takeDamage(ed * 15, 0, 1);    // spikes chew through enemies
      }
    }

    const data = floor[roomIndex];

    // Phase 1 stabilization fix B4 — short-circuit ALL legacy per-room
    // progression (combat/challenge/chestroom/boss/reward etc.) when the
    // active room is a baked TMX zone. The zone runner owns wave/clear
    // logic; without this gate, stale data.kind from a prior legacy room
    // could phantom-spawn pedestals between zone-run waves.
    const _inBakedZone = room.kind === 'tmx_crypt_sample';

    // Combat room progression: enemies dead → (optional wave2) → relic offer → cleared
    if (!_inBakedZone && data.kind === 'combat' && !room.cleared && enemies.length === 0) {
      // WAVE PATTERN — spawn second wave after a brief pause with warning VFX
      if (data.wave2 && !data._wave2Spawned) {
        data._wave2Spawned = true;
        // Phase 3: adapt wave 2 composition based on what hurt the
        // player in wave 1. Mutates data.wave2 in place — must run
        // BEFORE the spawn loop below reads it. Tally is consumed
        // here (set null) so a no-op replay from a stale window hook
        // can't double-mutate.
        _adaptWave2Composition(data.wave2, _wave1DamageTally, currentFloorLevel, hero.x, hero.y);
        _wave1DamageTally = null;
        if (typeof window !== 'undefined') window.__recordCombatDamage = null;
        // Announcement
        roomLabelText = '⚠ WAVE 2 INCOMING ⚠';
        roomLabelColor = '#ff9066';
        roomLabelTime = 2.2;
        shakeCamera(10, 0.3);
        triggerScreenFlash('rgba(255, 90, 60, 0.25)', 0.3);
        playSfx('slime_death', { rate: 0.4, volume: 0.85 });
        // Spawn after small delay with spawn burst on each.
        // Run-sequence + room-index guard — if the player dies/quits/
        // restarts in the 650ms window OR transitions to a different
        // room, the captured run/room won't match and the spawn bails.
        // Without this, phantom enemies could spawn on a stale `data`
        // reference into the now-active room.
        const wave2RunSeq = _runSeq;
        const wave2RoomIdx = roomIndex;
        setTimeout(() => {
          if (_runSeq !== wave2RunSeq || roomIndex !== wave2RoomIdx || !running) return;
          for (const s of data.wave2) {
            const sx = s.x * TILE + TILE / 2;
            const sy = s.y * TILE + TILE / 2;
            // Pre-spawn smoke + pop
            for (let k = 0; k < 10; k++) deathBurst(sx, sy, '#ff6040');
            spawnEnemy(s.type, sx, sy, { elite: s.elite, hpMul: s.hpMul, damageMul: s.damageMul, affix: s.affixId });
          }
          playSfx('hero_hurt', { rate: 0.38, volume: 0.7 });
        }, 650);
      } else if (pedestals.length === 0) {
        // Mini-boss rooms force floor-4 rarity weights — the mini-boss fight
        // is harder than a normal combat slot so the reward should reflect
        // that (higher rare + legendary chance, even a shot at mythic on F4).
        // Elite (perilous-path) rooms guarantee rare+ pedestals — risk pays.
        // Round-7 ROOM REWARD bias — composed on top of the elite/miniboss
        // baseline. roomReward='rare+' adds minTier promotion (matches
        // elite-path treatment); roomReward='fusion' adds forced fusion-
        // completer bias; roomReward='gold' drops bonus gold here so the
        // door's "GOLD" chip matches reality on clear.
        const isMiniboss = data.slotLabel === 'miniboss';
        const isElitePath = !!data.eliteRoom;
        const reward = data.roomReward;
        const offerLevel = isMiniboss ? 4 : currentFloorLevel;
        const offerOpts = {};
        if (reward === 'legendary') offerOpts.minTier = 'legendary';
        else if (isElitePath || reward === 'rare+') offerOpts.minTier = 'rare';
        if (reward === 'fusion') offerOpts.fusionBias = true;
        if (data.roomTheme) offerOpts.theme = data.roomTheme;
        if (reward === 'gold') {
          // Bonus gold pile — extra coins drop at hero center, on top of
          // the per-kill drops the gold-mul applied during combat. Gives
          // the room a tactile "the chest opens" beat.
          import('./gold.js').then(g => g.dropGold(hero.x, hero.y - 12, 12));
        }
        spawnRelicOffer(offerLevel, offerOpts);
        applyTarotPedestalMods();
        // Modal opens via E-press on the choice pedestal (not auto-open).
        if (isMiniboss) {
          // Extra flourish on mini-boss reward: brighter ping + sparkle burst
          // to telegraph "this one's better than the usual drop".
          playSfx('click', { volume: 0.9, rate: 0.9 });
          synthFanfare(0.55);
          for (let k = 0; k < 20; k++) {
            const ang = Math.random() * Math.PI * 2;
            const rad = 60 + Math.random() * 80;
            sparkle(hero.x + Math.cos(ang) * rad, hero.y + Math.sin(ang) * rad * 0.7, '#f4d9a0');
          }
        } else {
          playSfx('click', { volume: 0.7, rate: 1.05 });
        }
      } else if (!hasActivePedestals()) {
        room.cleared = true;
        room.clearedAt = performance.now() / 1000;     // drives corpse fade
        data.cleared = true;
        stats.roomsCleared++;
        // Small HP regen on clear — +1 HP (not starving cursed) to soften the
        // harder difficulty. Still easy to die if you take too many hits.
        if (!isCursed('starving') && hero.hp < hero.maxHp) {
          hero.hp = Math.min(hero.maxHp, hero.hp + 1);
          // BLOOD T2 ascendance — "killing sustains you" — recover 25% of
          // remaining missing HP on top of the clear tick. Scales with maxHp
          // so Ironhide+Vitality builds actually feel it.
          if ((hero.activeThemes?.blood || 0) >= 2 && hero.hp < hero.maxHp) {
            const bonus = Math.ceil((hero.maxHp - hero.hp) * 0.25);
            if (bonus > 0) {
              hero.hp = Math.min(hero.maxHp, hero.hp + bonus);
              // A subtle spark burst on the ascendance heal so the player sees it
              for (let k = 0; k < 6; k++) {
                const ang = (k / 6) * Math.PI * 2;
                sparkle(hero.x + Math.cos(ang) * 18, hero.y - 6 + Math.sin(ang) * 14, '#ff8a8a');
              }
            }
          }
        }
        // Celebratory clear fanfare — label + sound + sparkle burst radiating from hero
        const isMiniboss = data.slotLabel === 'miniboss';
        roomLabelText = isMiniboss ? '✦ MINI-BOSS FELLED ✦' : '✦ ROOM CLEARED ✦';
        roomLabelColor = isMiniboss ? '#f4d9a0' : '#86e3a8';
        roomLabelTime = isMiniboss ? 2.0 : 1.6;
        for (let k = 0; k < 18; k++) {
          const ang = (k / 18) * Math.PI * 2;
          const r = 80 + (k % 4) * 15;
          sparkle(hero.x + Math.cos(ang) * r, hero.y + Math.sin(ang) * r * 0.7, '#86e3a8');
        }
        playSfx('click', { volume: 0.8, rate: 1.5 });
        synthFanfare(0.85);            // rising C-major triad

        // ── EXHALE BEAT — combat-room "the room relaxes" pass ──
        // Audit P3: cleared rooms felt the SAME as active rooms minus the
        // enemies. No tonal shift, no body-language from the camera, no
        // lingering sparkle bed. Now: a soft camera pull-in (reads as
        // "shoulders dropping"), a delayed atmospheric chord (the
        // dungeon settling), and a gentle dust-mote scatter from the
        // hero outward. Mini-bosses get more drama.
        pulseZoom(isMiniboss ? 0.06 : 0.04, 1.4);
        // Settling dust — 8-12 motes drift outward + downward from the
        // hero's feet. Reads as "the room exhaling its tension."
        const exhaleDust = isMiniboss ? 14 : 10;
        for (let k = 0; k < exhaleDust; k++) {
          const ang = (k / exhaleDust) * Math.PI * 2 + Math.random() * 0.3;
          const dist = 30 + Math.random() * 60;
          // Re-using sparkle for the visible fade — different color
          // than the celebration burst above so the eye reads them as
          // two beats (bright triumph, then quiet settle).
          sparkle(hero.x + Math.cos(ang) * dist, hero.y + 8 + Math.sin(ang) * dist * 0.6, '#a8b0a4');
        }
        // Ambient "settle" tone — low atmospheric chord at 200ms. Sub
        // octave below the fanfare so the room feels released, not
        // continued. Skipped for mini-boss (the fanfare's sustained tail
        // already owns that audio space).
        //
        // Audit fix: capture _runSeq + check at fire time. Without the
        // guard, a player who quits-to-menu / dies in the 220ms window
        // would hear the chord land into a different scene.
        if (!isMiniboss) {
          const _exhaleSeq = _runSeq;
          setTimeout(() => {
            if (_runSeq !== _exhaleSeq || !running) return;
            try { synthChord(196, 0.9, 0.35); } catch (_e) {}
          }, 220);
        }
      }
    }

    // Challenge room — like combat but with EXTRA gold drop on clear + a relic pedestal row
    if (!_inBakedZone && data.kind === 'challenge' && !room.cleared && enemies.length === 0) {
      if (pedestals.length === 0) {
        import('./gold.js').then(g => g.dropGold(hero.x, hero.y - 20, 20));
        spawnRelicOffer(currentFloorLevel, data.roomTheme ? { theme: data.roomTheme } : {});
        // Modal opens via E-press on the choice pedestal.
        playSfx('click', { volume: 0.9, rate: 1.1 });
      } else if (!hasActivePedestals()) {
        room.cleared = true;
        room.clearedAt = performance.now() / 1000;
        data.cleared = true;
        stats.roomsCleared++;
      }
    }

    // Chestroom: starts cleared (no enemies); a mimic chest sets
    // room.cleared = false + spawns enemies. Once the player kills the
    // mimic spawns, flip cleared back to true so doors unlock and the
    // run can continue. Without this, opening a mimic permanently
    // locks the room (was the case before this clear-check landed).
    if (!_inBakedZone && data.kind === 'chestroom' && !room.cleared && enemies.length === 0) {
      room.cleared = true;
      room.clearedAt = performance.now() / 1000;
      data.cleared = true;
      stats.roomsCleared++;
    }

    // Boss room: instant clear on all enemies down.
    // Floor 3+ bosses drop a guaranteed legendary pedestal as reward.
    if (!_inBakedZone && data.kind === 'boss' && !room.cleared && enemies.length === 0) {
      room.cleared = true;
      room.clearedAt = performance.now() / 1000;
      data.cleared = true;
      stats.roomsCleared++;
      // THE WATCHER — first boss kill / first final-boss clear milestones.
      watcherOnBossClear(currentFloorLevel);
      playSfx('click', { volume: 0.6, rate: 1.15 });
      // Spawn legendary reward pedestal for mid-run bosses (not final — final gets end-screen)
      if (currentFloorLevel >= 3 && currentFloorLevel < MAX_FLOORS) {
        // Pick a legendary the player doesn't already have, weapon-compatible.
        // Fallback: any weapon-compatible legendary (even if owned). Final
        // fallback: any legendary at all — we always want a reward, even if
        // somehow every weapon-legendary is owned, which is a degenerate
        // edge case past the player's intended progression curve.
        const owned = new Set(equippedRelics.map(r => r.id));
        const legendaryPool = ALL_RELIC_IDS.filter(id => {
          const def = RELIC_DEFS[id];
          return def && def.tier === 'legendary'
            && !owned.has(id)
            && isRelicForWeapon(id, hero.weapon);
        });
        const legendaryId = legendaryPool.length
          ? legendaryPool[(Math.random() * legendaryPool.length) | 0]
          : (ALL_RELIC_IDS.find(id => RELIC_DEFS[id].tier === 'legendary' && isRelicForWeapon(id, hero.weapon))
             || ALL_RELIC_IDS.find(id => RELIC_DEFS[id].tier === 'legendary'));
        if (legendaryId) {
          // Round-7-audit fix: snapToClearTile nudges the pedestal to a
          // walkable cell if the geometric center happens to be a
          // pillar. Was a real bug on certain pillarTemplate values.
          const center = { x: Math.floor(room.w / 2) * TILE + TILE / 2, y: Math.floor(room.h / 2) * TILE + TILE / 2 };
          pushPedestal({
            x: center.x, y: center.y,
            relic: RELIC_DEFS[legendaryId],
            tier: 'legendary',
            bonus: true,        // mid-run boss reward, won't wipe sibling offers
            snapToClearTile: true,
          });
          // Extra flourish
          for (let i = 0; i < 20; i++) deathBurst(center.x, center.y, '#ffc8ff');
          playSfx('click', { volume: 0.9, rate: 0.6 });
          triggerScreenFlash('rgba(255, 200, 255, 0.15)', 0.3);
        }
      }
    }

    // Pedestal partial-heal on touch (once per room). Full heal is gated
    // behind gold so sanctuaries feel like a resource choice, not a free
    // reset. Starving curse disables it entirely.
    if (!_inBakedZone && data.kind === 'reward' && onPedestalWorld(hero.x, hero.y) && hero.hp < hero.maxHp) {
      if (!isCursed('starving') && consumePedestal()) {
        // Sanctuary heal — Round-6 economy retune.
        //   Round-1 : flat 3 HP — 100% at maxHp=3, ~25% at maxHp=12.
        //   Round-3 : max(3, floor(maxHp × 0.4)) — fixed F4 tank bracket
        //             but inverted incentives (low-HP got 100% restore,
        //             high-HP got tax-bracketed at ~40%).
        //   Round-6 : max(3, floor(maxHp × 0.5)) — same 100% at maxHp=3,
        //             50% across all higher pools. F4 tank with maxHp=10
        //             now heals 5 (was 4); maxHp=12 heals 6 (was 4).
        //             Cleaner curve, no anti-tank tax.
        // ASCENSION III — "The Half Rest": sanctuary healing halved.
        let baseHeal = Math.max(3, Math.floor(hero.maxHp * 0.5));
        const am = window.__ascensionModifiers && window.__ascensionModifiers();
        if (am && am.sanctuaryHealMul) baseHeal = Math.max(1, Math.floor(baseHeal * am.sanctuaryHealMul));
        const healed = Math.min(baseHeal, hero.maxHp - hero.hp);
        hero.hp = Math.min(hero.maxHp, hero.hp + healed);
        // Heal feedback — was a generic playSfx('click') that felt like UI
        // noise. Warm chord (440Hz / 0.5s / 0.8 vol) reads as restoration,
        // and a green floating "+N HP" floats up from the hero so the
        // gain registers visually even mid-combat-pickup transitions.
        try { synthChord(440, 0.5, 0.8); } catch (_e) {}
        spawnDamageNumber(hero.x, hero.y - 24, healed, { text: '+' + healed + ' HP', color: '#86e3a8' });
      }
    }

    // ─── FUNCTIONAL DOOR FLOW ──────────────────────────────────────────
    // 1. When room.cleared transitions to true, fire onRoomCleared once
    //    so doorPortals starts the open-animation on north doors.
    // 2. Tick door animations + check for hero crossing.
    // 3. Pre-committed rooms (idx < floor.length - 1, e.g. legacy linear
    //    fallback) still use the onDoorWorld tile-step path.

    if (room.cleared && !_roomClearedNotified) {
      onRoomCleared();
      _roomClearedNotified = true;
      // Audio confirmation — combat just ended and the doors are about
      // to open. Without this chord, the world becomes traversable in
      // silence and the player has no auditory cue that the encounter
      // actually finished. Boss clears get full SFX cascades elsewhere;
      // this is the equivalent for normal combat rooms. Skip on boss
      // rooms (boss-clear triggers its own fanfare via bossWinTriggered)
      // and start rooms (cleared from the start, no encounter to "end").
      if (data.kind !== 'boss' && data.kind !== 'start') {
        synthChord(523, 0.55, 0.65);
        // Round-7-audit POLISH — cleared-room ambient pad. After the
        // chord lands, the room had been silent until the next door
        // animation. Now a brief D-minor warm pad fades in (0.9s)
        // filling the post-combat moment with atmosphere. Pad gets
        // stopped on next loadRoom (see start of loadRoom) when the
        // player enters another combat-style room. Skipped on boss/
        // start rooms: boss has its own cinematic, start has no
        // "encounter to end" anyway.
        try { startAmbientPad('cleared'); } catch (_e) {}
      }
      // THE FOOL tarot — "Begin with no weapon, granted after first clear."
      // The original code nulled hero.weapon at run start but never
      // re-granted it; the player walked the rest of the run swinging on
      // the sword fallback in weaponDef() with no actual weapon owned.
      // Grant a random unlocked weapon now. Refresh relic offers so
      // newly-eligible weapon-themed picks aren't filtered out next room.
      if (hero.weapon === null && data.kind !== 'start') {
        const choices = availableWeapons();
        const granted = choices[(Math.random() * choices.length) | 0] || 'sword';
        hero.weapon = granted;
        try { synthFanfare(0.55); synthChord(523, 0.7, 0.7); } catch (_e) {}
        spawnDamageNumber(hero.x, hero.y - 32, 0, {
          text: 'WEAPON: ' + granted.toUpperCase(),
          color: '#f4d9a0',
        });
      }
    }

    // Tick door animations + check for the hero physically crossing an
    // open north door. Returns { targetNodeId, doorTileX } once a crossing
    // is detected — both pieces feed into the continuous-transition flow
    // so the prevRoom residue lines up with the door hero just walked through.
    const crossed = updateDoors(dt);
    // Crossing lock release — three failure paths can leave the
    // doorPortals module's _commitInFlight stuck true (softlock):
    //   (1) crossed reported but currentGraph / currentNodeId missing
    //   (2) crossed dispatched but graph nodes can't be resolved
    //   (3) caller can't push the new room (e.g. linear-only floor)
    // releaseCrossingLock() in each branch lets updateDoors retry next
    // frame instead of leaving the hero frozen on an open door tile.
    if (crossed && (!currentGraph || currentNodeId == null)) {
      releaseCrossingLock();
    }
    if (crossed && currentGraph && currentNodeId != null) {
      const curNode = getFloorNode(currentGraph, currentNodeId);
      const picked = getFloorNode(currentGraph, crossed.targetNodeId);
      if (!curNode || !picked) {
        releaseCrossingLock();
      } else {
        // Hidden-path reveal banner (Ascension VII) — preserved from old flow.
        if (picked._hidden) {
          const kindLabel = (picked.kind || '').toUpperCase();
          const colorByKind = {
            combat: '#e8d4b4', elite: '#d85a5a', event: '#c8a0ff',
            sanctuary: '#86e3a8', boss: '#ff9a55',
          };
          window.__pendingCodexEntry = {
            type: 'hidden_path_reveal',
            name: 'HIDDEN PATH REVEALED',
            flavor: 'the ' + kindLabel.toLowerCase() + ' was waiting for you',
            color: colorByKind[picked.kind] || '#d85a6a',
          };
          picked._hidden = false;
        }
        curNode.visited = true;
        curNode.current = false;
        picked.current = true;
        currentNodeId = crossed.targetNodeId;
        floor.push(picked.roomData);
        beginDoorTransition(floor.length - 1, crossed.doorTileX);
      }
    }

    // Legacy linear-floor fallback — when next room is already pushed
    // (e.g. from a save resume or pre-built linear floor), walk through
    // the literal north door tile to advance. Most modern flows go
    // through the door-crossing path above.
    const door = onDoorWorld(hero.x, hero.y);
    if (door && door.dir === 'north' && roomIndex < floor.length - 1
        && roomDoors.length === 0) {
      beginTransition(roomIndex + 1, 'south');
    }

    // Evaluate achievements periodically (on room transitions mostly, but cheap to re-evaluate)
    stats._legendaryEquipped = equippedRelics.some(r => r.tier === 'legendary' || r.tier === 'mythic');
    stats._maxCombo = Math.max(stats._maxCombo || 0, window.__gameMetrics.maxCombo || 0);
    // Hidden-achievement stat trackers — kept adjacent to keep touch points tight.
    const legendaryCount = equippedRelics.filter(r => r.tier === 'legendary' || r.tier === 'mythic').length;
    stats._maxLegendariesHeld = Math.max(stats._maxLegendariesHeld || 0, legendaryCount);
    stats._mythicEquipped = equippedRelics.some(r => r.tier === 'mythic');
    stats._bothMythicsHeld = equippedRelics.some(r => r.id === 'cataclysm') && equippedRelics.some(r => r.id === 'eye_of_ether');
    stats._maxFusions = Math.max(stats._maxFusions || 0, (activeFusions && activeFusions.length) || 0);
    evaluateAchievements(stats, meta);

    // Boss room cleared → show either "Shop + Descend" (next floor) or "Run Complete"
    // Excluded during baked zone runs — the zone runner owns boss/clear flow.
    if (!_inBakedZone && data.kind === 'boss' && room.cleared && !bossWinTriggered) {
      bossWinTriggered = true;
      running = false;
      // THE RUIN REMEMBERS — record this victory. Adds a scorch stain to the
      // boss arena that persists across runs, plus a journal entry.
      try {
        const bossDef = data.spawns?.find(s => s.boss);
        if (bossDef) recordBossKill({ bossType: bossDef.type, floor: currentFloorLevel });
      } catch (e) {}
      const isFinal = currentFloorLevel >= MAX_FLOORS;

      // FLOOR-CLEAR CASCADE — the Vampire Survivors "gem vacuum" moment.
      // Spawns a staggered chain of coins at the boss corpse + rising chord
      // pings + final fanfare with banner flash. Reuses gold.js's existing
      // streak/magnet logic so the cascade feels musically ascending.
      const corpse = enemies.find(e => e.boss) || { x: room.w * TILE / 2, y: room.h * TILE / 2 };
      const cascadeCount = isFinal ? 24 : 12 + currentFloorLevel * 2;
      const cascadeStep = isFinal ? 55 : 70;
      const cascadeDurationMs = cascadeCount * cascadeStep;
      // Keep hero / gold / particle updates ticking through the cascade window
      // even though `running` is now false. Without this, coins spawn but never
      // magnetize (updateGold is gated by `running && ...`).
      window.__cascadeUntil = performance.now() + cascadeDurationMs + 800;
      import('./gold.js').then(g => {
        for (let i = 0; i < cascadeCount; i++) {
          setTimeout(() => g.dropGold(corpse.x + (Math.random() - 0.5) * 24, corpse.y + (Math.random() - 0.5) * 16, 1), i * cascadeStep);
        }
      });
      // Rising chord pings — C-E-G-B-D ascending (523, 659, 784, 988, 1175 Hz).
      [523, 659, 784, 988, 1175].forEach((hz, idx) => {
        setTimeout(() => synthPing(hz, 0.55, 0.22), Math.min(cascadeDurationMs, idx * 150 + 80));
      });
      // Mid-cascade screen flash + shake to sell the "boss down" moment.
      setTimeout(() => {
        triggerScreenFlash(isFinal ? 'rgba(255, 230, 170, 0.35)' : 'rgba(180, 230, 200, 0.25)', 0.45);
        shakeCamera(isFinal ? 10 : 6, 0.25);
      }, 120);
      // Finale — synthFanfare + banner flash at the cascade tail
      setTimeout(() => {
        synthFanfare(isFinal ? 1.1 : 0.8);
        triggerScreenFlash(isFinal ? 'rgba(255, 210, 140, 0.45)' : 'rgba(200, 255, 220, 0.28)', 0.6);
        shakeCamera(isFinal ? 14 : 8, 0.35);
        if (isFinal) {
          synthThud(60, 1.2, 1.0);
          synthChord(880, 1.2, 1.6);
        } else {
          synthChord(784, 0.9, 1.0);
        }
      }, cascadeDurationMs + 150);

      const title = document.getElementById('winTitle');
      const subtitle = document.getElementById('winSubtitle');
      const btn = document.getElementById('winRestartBtn');

      // Determine the boss type so we can roll from its thematic drop pool.
      const bossTypeId = data.spawns?.find(s => s.boss)?.type;
      const dropPool = bossTypeId ? BOSS_LOOT_POOL[bossTypeId] : null;

      // openFloorUi — executes the floor-cleared state transition. For the
      // final boss, this means epilogue + run-complete screen; otherwise
      // the between-floor shop. Deferred so we can gate on the boss drop
      // pedestal pickup first.
      const openFloorUi = () => {
        if (isFinal) {
          stats._runComplete = true;
          try { stats._ascensionAtWin = getAscensionTier() || 0; } catch (e) {}
          if (daily.activeForRun) {
            // Capture streak BEFORE bank so the post-bank value reads
            // the new (incremented) streak — "you mastered today's
            // rite, your streak now stands at N."
            markDailyCompleted();
            // Polish: feedback-audit team flagged that daily completion
            // banked silently. The streak counter ticked up but the
            // moment passed without acknowledgment. Layered fanfare
            // (warm chord + bright high ping at +280ms) on top of
            // the existing victory cascade so the daily-specific
            // beat reads distinctly even amid the gold rain.
            //
            // Noise-floor reduction: each daily-fanfare beat checks at
            // FIRE time whether the memory chord just landed in the
            // recent past (memory chord fires at showEndOfRun+1500ms,
            // daily chord at openFloorUi+1800ms — both run synchronously
            // in the cascade callback so daily lands ~300ms after
            // memory). If memory just played, drop the daily beat —
            // 6 audio events in 800ms is too thick. Memory takes
            // priority because the unlock is rarer + more meaningful;
            // daily already has the streak HUD beat at portal entry
            // and a completion line in the run-end summary HTML.
            const _memoryJustFired = () => (typeof window !== 'undefined')
              && typeof window.__memoryChordFiredAt === 'number'
              && (performance.now() - window.__memoryChordFiredAt) < 600;
            setTimeout(() => {
              if (_memoryJustFired()) return;
              try { synthChord(659, 1.0, 1.4); } catch (_e) {}
            }, 1800);
            setTimeout(() => {
              if (_memoryJustFired()) return;
              try { synthPing(1760, 0.55, 0.28); } catch (_e) {}
            }, 2080);
            setTimeout(() => {
              if (_memoryJustFired()) return;
              try { synthPing(2200, 0.45, 0.24); } catch (_e) {}
            }, 2280);
          }
          daily.activeForRun = false;
          try { recordRunComplete(); } catch (e) {}
          evaluateAchievements(stats, meta);
          hideShop();
          // DEPTH PASS — record victory for hamlet reactive greetings.
          // Fires "you took the path I refused to look at" type lines
          // on the next NPC visit chain after a run completion.
          recordRunEnd('victory', currentFloorLevel, stats.bossesKilled | 0, equippedRelics.length | 0);
          if (!hasSeen('epilogue', 'first_clear')) {
            playEpilogue(() => showEndOfRun(true));
          } else {
            showEndOfRun(true);
          }
        } else {
          if (curseCount() > 0) stats._cursedFloorClear = Math.max(stats._cursedFloorClear || 0, curseCount());
          evaluateAchievements(stats, meta);
          title.textContent = 'FLOOR ' + currentFloorLevel + ' CLEARED';
          title.style.color = '#86e3a8';
          title.style.textShadow = '0 0 18px rgba(134,227,168,0.7)';
          subtitle.textContent = 'the depths merchant offers wares';
          btn.textContent = 'DESCEND';
          _setupShop(currentFloorLevel);
          winEl.style.display = 'flex';
        }
      };

      if (dropPool && dropPool.length > 0) {
        // BOSS-BIASED LOOT DROP — spawn a themed pedestal after the cascade
        // finale, then gate the floor-UI transition on the player picking
        // it up (or a 15s timeout so AFK players aren't stuck forever).
        const dropDelay = cascadeDurationMs + 400;
        setTimeout(() => {
          // Final boss gets a mythic-chance pool on top of the themed pool.
          const opts = { pool: dropPool };
          if (bossTypeId === 'ember_tyrant') {
            opts.mythicPool = EMBER_TYRANT_MYTHIC_POOL;
            opts.mythicChance = EMBER_TYRANT_MYTHIC_CHANCE;
          }
          spawnBossDrop(bossTypeId, corpse.x, corpse.y, opts);
          // Extend the cascade window so the pedestal + hero updates keep ticking
          window.__cascadeUntil = performance.now() + 16000;
        }, dropDelay);

        // Poll for pickup (or timeout). Once the pedestal is picked up, the
        // banner runs ~3s; add extra breath before opening the UI so banner
        // + transition don't overlap.
        // Run-sequence guard — if the player dies/quits/restarts during the
        // 15s timeout window, the captured _runSeq won't match and the poll
        // bails without firing openFloorUi against a fresh run state.
        //
        // BUGFIX 2026-05-06: previously each gate also checked `running`,
        // but `running = false` is set at line 5983 right when the
        // cascade starts (so the player can't move/take damage during
        // the celebration). With `running` false, the openFloorUi calls
        // ALL bailed → win modal never opened → game appeared frozen.
        // _runSeq alone correctly captures the death/quit/restart race;
        // `running` was redundant + actively breaking the flow.
        const pollStart = performance.now() + dropDelay;
        const pollRunSeq = _runSeq;
        const poll = setInterval(() => {
          if (_runSeq !== pollRunSeq) { clearInterval(poll); return; }
          const now = performance.now();
          if (now < pollStart) return;                          // wait for spawn
          if (!hasActivePedestals() && pedestals.length > 0) {
            // All spawned pedestals are picked (length>0 guards against pre-spawn state)
            clearInterval(poll);
            setTimeout(() => {
              if (_runSeq === pollRunSeq) openFloorUi();
            }, 3800);
          } else if (now - pollStart > 15000) {
            clearInterval(poll);
            // Same run-seq guard as the natural-pickup branch — without
            // it, a 15s-AFK-then-die-then-new-run race would fire
            // openFloorUi against a fresh run state and overlay the
            // between-floors shop on a player who hadn't earned it.
            if (_runSeq === pollRunSeq) openFloorUi();
          }
        }, 200);
      } else {
        // No loot pool for this boss type → fall back to original timing.
        // Pin the run-seq so a death+new-run race during the cascade
        // window doesn't fire openFloorUi on the fresh run. (See bugfix
        // note above re: `running` gate removal.)
        const fallbackRunSeq = _runSeq;
        setTimeout(() => {
          if (_runSeq === fallbackRunSeq) openFloorUi();
        }, cascadeDurationMs + 600);
      }
      if (isFinal) return;     // preserve the original early-return for final
    }

    // Death handling — cinematic ceremony before the summary reveal.
    // Phase 1 (0.9s → 2.5s): slow-mo + desaturate + zoom-in. Phase 2: show summary.
    if (hero.state === 'dead' && hero.stateTime > 0.9 && !deathCeremonyActive && !deathSummaryShown) {
      deathCeremonyActive = true;
      deathCeremonyTime = 0;
      // Wizard-kit Sprint 3D UX audit — actively cancel any in-flight
      // transient banners so they can't visibly persist into the death
      // ceremony / "YOU HAVE FALLEN" overlay. Belt-and-suspenders on
      // top of the __centerBannerActive suppression: the suppression
      // hides the banner mid-decay; this stops the timer entirely so
      // a stale pickedFlashTime can't pop back if the player goes
      // back to a state where the suppression is off (e.g. resume).
      suppressPickupFlash();
      clearNotifications();
      // THE WATCHER — fires a milestone or death-depth line. "Near final boss"
      // = dying in the floor-MAX boss room with the boss under 30% HP.
      try {
        const bossEnt = enemies.find(e => e.boss);
        const nearFinalBoss = currentFloorLevel >= MAX_FLOORS
          && data.kind === 'boss'
          && bossEnt && (bossEnt.hp / bossEnt.maxHp) < 0.30;
        watcherOnDeath(currentFloorLevel, !!nearFinalBoss);
      } catch (e) {}
      // THE RUIN REMEMBERS — record death event into persistent history.
      // Next runs will show a blood stain in this room + journal entry.
      try {
        recordDeath({
          floor: currentFloorLevel,
          roomIdx: roomIndex,
          build: equippedRelics.map(r => r.id),
          combo: window.__gameMetrics.maxCombo || stats._maxCombo || 0,
          maxHp: hero.maxHp,
          damageDealt: stats.damageDealt | 0,
        });
      } catch (e) {}
      // Phase 4 — record per-killer death count for the death-tips
      // system. Increments the count for hero._lastHurtBy (set by the
      // damageHero call that landed the killing blow). On NEXT run
      // start, if this killer's total >= THRESHOLD, a contextual tip
      // surfaces in the rail.
      try { recordKilledBy(hero._lastHurtBy); } catch (e) {}
      pulseZoom(0.22, 3.2);                  // slow held zoom-in
      shakeCamera(16, 0.5);
      triggerScreenFlash('rgba(180, 30, 40, 0.35)', 0.5);
      playSfx('hero_hurt', { rate: 0.3, volume: 1.0 });
      synthGloom(180, 1.0, 1.4);              // descending dread synth
      setTimeout(() => playSfx('slime_death', { rate: 0.35, volume: 0.9 }), 400);
      setTimeout(() => synthThud(60, 1.0, 0.35), 600);
    }
    if (deathCeremonyActive) {
      deathCeremonyTime += realDt;
      // After 1.8s of ceremony, show the summary
      if (deathCeremonyTime > 1.8 && !deathSummaryShown) {
        deathSummaryShown = true;
        running = false;
        daily.activeForRun = false;
        // DEPTH PASS — record the run end so the next hamlet visit
        // fires reactive greetings tied to the outcome ("you came back
        // without all of yourself", "Mm. Try a heavier weapon next
        // time"). recordRunEnd also clears the per-NPC greeting-shown
        // map so each NPC reacts fresh.
        recordRunEnd('death', currentFloorLevel, stats.bossesKilled | 0, equippedRelics.length | 0);
        // FIRST-DEATH BYPASS — if the player has never seen the keeper
        // wake (i.e., this is their first run, started via the heartbeat
        // intro), skip the death/sanctuary modal and route to the
        // hamlet via a smoothing beat: hold "YOU HAVE FALLEN" for an
        // extra second, then fade the whole frame to pure black, THEN
        // call enterHamletCanvas (which fades the keeper wake in over
        // the already-black canvas). Without this beat, the keeper's
        // first letterbox bar snaps in over a still-red ceremony frame,
        // which undercuts the weight of the death.
        if (!hasSeen('hamlet', 'wake')) {
          _firstDeathFadeActive = true;
          _firstDeathFadeTime = 0;
        } else {
          showEndOfRun(false);
        }
      }
    }
  } else if (transition.active) {
    updateTransition(realDt);
    updateParticles(realDt);
    updateFx(realDt);
    updateMusic(realDt);
    gameTime += realDt;
  } else if (frozen) {
    updateParticles(realDt * 0.2);
    updateFx(realDt * 0.2);
  } else if (paused) {
    // Keep music flowing during pause (so it doesn't cut out)
    updateMusic(realDt);
  }

  // First-death fade beat — runs OUTSIDE the running/transition/paused
  // chain because the moment we kick it off, running flips false and
  // none of those branches fire anymore. We need this to advance every
  // frame regardless of game state, so it lives next to render().
  // Holds the death screen, fades to pure black, then hands off to
  // enterHamletCanvas (which fires the keeper wake). See declaration
  // above for the full timing rationale.
  //
  // Pause hygiene: skip the tick while paused (so the player can't burn
  // through the cinematic by tab-switching), AND defensively unpause +
  // hide the pause overlay right before handoff to the keeper wake. The
  // blur/visibilitychange auto-pause path could otherwise deadlock the
  // wake under a stuck pause modal — bug-hunter audit P0.
  if (_firstDeathFadeActive && !paused) {
    _firstDeathFadeTime += realDt;
    if (_firstDeathFadeTime >= FIRST_DEATH_TOTAL) {
      _firstDeathFadeActive = false;
      // Belt-and-suspenders: even if a future code path lets the timer
      // tick past TOTAL while paused was true, this guarantees we hand
      // off cleanly with no overlay residue.
      if (paused) setPaused(false);
      pauseEl.style.display = 'none';
      enterHamletCanvas();
    }
  }

  render();
  endFrameInput();
  requestAnimationFrame(tick);
}

// Phase 5 audit fix #3 — exported `tick` is the guarded wrapper. All
// existing `requestAnimationFrame(tick)` call sites (4 inside
// _tickInner's branches + 1 at boot kickstart) pick up the wrap
// unchanged. A thrown exception during rendering kills the loop and
// surfaces the error overlay; subsequent rAF calls become no-ops so
// the page doesn't enter an infinite-overlay-stack state.
const tick = guardRender(_tickInner);

function render() {
  // Cursor restore — index.html sets `canvas { cursor: none }` so the
  // in-canvas aim crosshair can be the only visible pointer during
  // play. But when the relic-choice modal is open, the player needs
  // to see the system cursor to hover-pick a card. Toggle here so the
  // cursor follows whichever mode the player is in. Cheap to set
  // every frame (no-op if value matches current).
  const showSystemCursor = isRelicChoiceModalOpen();
  const wantedCursor = showSystemCursor ? 'default' : 'none';
  if (canvas.style.cursor !== wantedCursor) canvas.style.cursor = wantedCursor;

  ctx.fillStyle = '#0a0810';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  // Camera transform: translate then scale around screen center for zoom pulse.
  // Effective formula: screenPos = (worldPos - camera + halfScreen + shakeOffset) * zoom, pivoted at center.
  const z = camera.zoom || 1;
  const halfW = canvas.width / 2, halfH = canvas.height / 2;
  ctx.translate(halfW, halfH);
  ctx.scale(z, z);
  ctx.translate(-camera.x + camera.offsetX, -camera.y + camera.offsetY);

  drawRoom(ctx);

  // Walkability overlay (dev tool) — drawn in world space ON TOP of the
  // baked composite + tiles, BELOW hero/enemies, so it's always legible
  // without obscuring the gameplay layer when toggled. Only visible when
  // overlay is toggled on (backtick) and the room is a baked debug room.
  drawWalkOverlay(ctx, room, camera.x, camera.y);

  // Zone-run portal — drawn in world space on top of the floor, beneath
  // sprites/enemies/hero so the player can clearly see when they walk
  // onto it. No-op when no portal active.
  drawZonePortal(ctx);

  // XP gems — drawn in world space on top of floor, below sprites.
  // Pop arc + vacuum trail are visible above hero (they orbit briefly
  // before being consumed).
  drawXpGems(ctx);

  // Spikes + fire pools draw on top of floor, below sprites
  drawSpikes(ctx, gameTime);
  drawUrns(ctx, 1 / 60);                // fixed small dt — break anim is visual only
  drawDecorPillars(ctx);                  // sacred-chamber pillars in chestrooms / future altars
  drawChests(ctx, 1 / 60);               // chest open animation runs frame counters via dt
  drawFirePools(ctx, gameTime);
  // Wanderer halo draws beneath hero so hero sprite still reads
  drawWandererTrail(ctx);
  // Pyromancer pre-proc charge — orange ground glow under hero when
  // ONE hit from threshold. Drawn next to wanderer so both share the
  // same elliptical-clip ground-glow render path (no float-shadow).
  drawPyroCharge(ctx);

  // Enemy attack telegraphs + ember flame hazards render on the FLOOR, below sprites but above tiles
  drawEnemyTelegraphs(ctx);
  drawFlames(ctx);

  // Corpse stains sit on the floor beneath everything — drawn after telegraphs
  // (which render on the floor plane too) but before pedestals/wanderer/actors.
  // Pass `room` so drawCorpses can fade them out over 1.2s once cleared.
  drawCorpses(ctx, room);

  drawPedestals(ctx);
  drawPedestalTeasers(ctx);
  // Door labels — sigils + kind text float above each north door tile.
  // Drawn here so they appear on the wall plane, not blocked by hero/enemies.
  // Phase 1 stabilization fix B3 — gate door labels on the legacy DAG flow
  // being active (currentGraph set). Skips during hamlet AND during baked
  // zone runs (room.kind === 'tmx_crypt_sample'), which have no door graph.
  if (room.kind !== 'hamlet' && room.kind !== 'tmx_crypt_sample' && currentGraph) {
    drawDoorLabels(ctx);
  }
  drawWanderer(ctx);
  // HAMLET CANVAS — layered composition:
  //   Layer 1 (room.js drawRoom hamlet branch): procedural sky + stars + ground slab
  //   Layer 2 (drawHamletBackdrop):             cobblestone tiles + buildings
  //   Layer 3 (drawHamletEntities):             portal-tower, shrine, firepit, NPCs
  //   Layer 4 (drawList, hero + enemies):       player character on top
  //   Layer 5 (drawHamletInteractPrompt):       floating "E · TALK" labels
  if (room.kind === 'hamlet') {
    drawHamletBackdrop(ctx);
    drawHamletFx(ctx);                  // animated overlays (flames, etc.)
    drawHamletEntities(ctx);
    drawHamletOverlay(ctx);
  }
  // Theme ascendance aura — renders below the hero so the sprite sits on
  // the glow. Intentionally drawn before drawList so the hero paints on top.
  drawThemeAura(ctx);

  const drawList = [];
  drawList.push({ y: hero.y, draw: (c) => drawHero(c) });
  for (const e of enemies) drawList.push({ y: e.y, draw: (c) => drawEnemy(c, e) });
  drawList.sort((a, b) => a.y - b.y);
  for (const item of drawList) item.draw(ctx);

  // Polish round 2 — enemy hover glow. Hades / Diablo / Path of Exile
  // pattern: cursor-over-enemy gets a soft outline so the player has
  // immediate visual confirmation of "this is what I'm aiming at."
  // Was missing here — players had to infer hover from the cursor
  // position alone. Renders AFTER the drawList sort so the glow lands
  // on top of the enemy sprite. Only when alive + non-cinematic +
  // dungeon (hamlet has no combat hover).
  if (running && !paused && hero.state !== 'dead' && room.kind !== 'hamlet'
      && bossIntroTime <= 0 && !window.__centerBannerActive) {
    const _mw = screenToWorld(mouse.x, mouse.y);
    let _hoveredEnemy = null;
    let _hoveredD2 = 36 * 36;       // squared hover radius — generous so high-speed cursor still catches
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = e.x - _mw.x;
      const dy = (e.y - 14) - _mw.y;     // bias up-by-14 so the cursor-over-body reads, not cursor-on-shadow
      const d2 = dx * dx + dy * dy;
      const r = (e.radius || 18) + 12;
      const cap = r * r;
      if (d2 < cap && d2 < _hoveredD2) {
        _hoveredEnemy = e;
        _hoveredD2 = d2;
      }
    }
    if (_hoveredEnemy) {
      const e = _hoveredEnemy;
      const r = (e.radius || 18);
      const pulse = 0.55 + 0.20 * Math.sin(performance.now() / 220);
      // Soft outer halo — radial gradient, tint reads "selected target."
      // Boss-hover is more saturated to read the same intent against
      // larger sprites.
      const haloR = r + (e.boss ? 28 : 18);
      const halo = ctx.createRadialGradient(e.x, e.y - 8, r * 0.5, e.x, e.y - 8, haloR);
      const tintRgb = e.boss ? '255, 200, 120' : e.elite ? '255, 220, 140' : '220, 220, 255';
      halo.addColorStop(0, `rgba(${tintRgb}, ${(0.15 * pulse).toFixed(3)})`);
      halo.addColorStop(0.6, `rgba(${tintRgb}, ${(0.08 * pulse).toFixed(3)})`);
      halo.addColorStop(1, `rgba(${tintRgb}, 0)`);
      ctx.fillStyle = halo;
      ctx.fillRect(e.x - haloR, e.y - 8 - haloR, haloR * 2, haloR * 2);
      // Crisp inner ring — selection reticle, dashed for strategic feel.
      ctx.strokeStyle = `rgba(${tintRgb}, ${(0.65 * pulse).toFixed(3)})`;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(e.x, e.y - 8, r + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Door lintel occlusion pass — re-draws just the top half of each
  // door sprite over whatever the drawList put down. When the hero
  // (or an enemy) stands in a door tile, their head reads as BEHIND
  // the lintel/arch, selling "I'm IN the doorway" instead of "I'm
  // a sprite painted on top of the door." Cheap (tile scan + small
  // blit per door, rooms have at most ~5 door tiles).
  drawDoorLintels(ctx);

  // Tall-prop occlusion pass (audit T2.6). Pillars + chests are tall
  // enough that an actor north of them should read as BEHIND. Default
  // render order (props before y-sort) puts the actor on top of the
  // prop regardless of position. Re-blit each prop conditionally if
  // any live actor is north of its foot AND in its column. Sells the
  // "I'm walking behind this column" depth illusion without a full
  // y-sort refactor of the prop list.
  if (room.kind !== 'hamlet') {
    drawTallPropOcclusion(ctx, hero, enemies);
  }

  drawProjectiles(ctx);
  drawSynergies(ctx);
  drawHeroShield(ctx);
  // Perfect-dodge ring — gold pulse around the hero in the last 0.15s
  // of any enemy's melee windup. Round-6 combat-feel audit: the
  // perfect-dodge mechanic had no pre-strike telegraph, so the timing
  // window was effectively invisible. This teaches the player WHEN to
  // press SPACE for the counter bonus. Drawn after drawHeroShield so
  // the ring sits on top of the shield aura in the rare overlap.
  drawPerfectDodgeRing(ctx, hero);
  // Ember Tyrant phase-2 rings — drawn above actors so the wavefront
  // reads as a SCREEN-LEVEL hazard the player must dodge through, not
  // a floor decal hidden under enemy sprites. Drawn before slashes so
  // the hero's swing VFX still pop on top.
  drawEmberRings(ctx);
  drawGold(ctx);
  drawSlashes(ctx);
  // Proc counters — tiny pip rows under the hero (visible "every Nth
  // hit" meters for chain_lightning / pyromancer / soul_burst). Moved
  // ABOVE shield + perfect-dodge ring + ember ring + slashes (audit
  // T1.5): pips were previously buried under combat VFX exactly when
  // the player most needs to read them — boss phase 2 with the shield
  // up and an ember ring expanding. Now they ride on top of all
  // combat layers so the "next strike will proc" beat stays visible.
  drawCounterPips(ctx);
  // Soul tethers — Iron Revenant's life-drain VFX (and any future
  // hero↔enemy line). World-space, drawn after enemies/hero but before
  // particles so death-bursts can still pop on top.
  drawSoulTethers(ctx);
  drawParticles(ctx);
  // Atmospheric layer split — playable rect stays clean of ambient
  // particles AT ALL TIMES; the void around the dungeon walls carries
  // the atmospheric depth. Earlier passes tried to keep dust visible
  // in the playable area during exploration and only fade it during
  // combat ("room exhales after the fight"), but in vault biome dust
  // and weather are both warm-gold tones — even at exploration density
  // the player flagged the warm motes drifting through the floor as
  // visual noise. The reference roguelites (Hades, Dead Cells, Risk
  // of Rain) keep the gameplay plane clear and put atmosphere in the
  // background plane; this mirrors that.
  //
  // The "exhale" beat after combat clear now lives entirely on the
  // themed-room motes layer — they go from 30% during combat to 100%
  // post-combat (driven by _atmosphericDim, see below). Themed motes
  // are theme-tinted (FLAME orange, STORM cyan, etc.) so they read as
  // a deliberate magical signature, not biome ambience.
  //
  // Hamlet is exempt — its painted scene IS the world, and there's no
  // void around it to host atmospheric depth.
  const _playableMask = room.kind === 'hamlet'
    ? null
    : { left: 0, top: 0, right: room.w * TILE, bottom: room.h * TILE };
  // Atmospheric haze layer (Phase A bridge to hamlet's painterly density).
  // Was 0 alpha inside the playable mask — dungeon air read as sterile.
  // 0.20 inside-mask lets dust drift visibly through combat rooms at low
  // alpha so the air has the "weight + dust motes" the hamlet backdrop
  // has. Above-room void area still gets full-alpha dust (1.0 outside
  // the mask) to suggest atmosphere extending past the wall edge.
  drawDust(ctx, _playableMask, 0.20);
  // Weather (rain, snow) keeps its 0-inside-mask: those are EXTERNAL
  // weather effects only meaningful in the open-air hamlet, not inside
  // a stone dungeon corridor.
  drawWeather(ctx, _playableMask, 0);
  // Ambient creatures — bats, ravens, moths passing through. Silhouettes.
  drawAmbientCreatures(ctx);
  drawCounterIndicator(ctx, hero.x, hero.y);
  drawHitMarkers(ctx);
  drawDamageNumbers(ctx);
  // HAMLET interact prompt — floating "E · TALK TO THE KEEPER" label above
  // the nearest interactable. Drawn last inside the camera transform so it
  // sits on top of entities + the hero.
  if (room.kind === 'hamlet') {
    drawHamletInteractPrompt(ctx);
  }
  // PEDESTAL interact prompt — floating "E · TAKE [name]" / "E · PAY N HP
  // [name]" above the nearest hovered pedestal. Round-7 user feedback:
  // pickups now require an E-press confirmation. Skip during hamlet
  // (no pedestals there); chestroom pedestals reuse the same prompt
  // since they're regular pedestal entries spawned from the chest reward.
  //
  // Wizard-kit Sprint 3D UX audit — also skip during run-end states
  // (death ceremony, fallen overlay, win screen). The player can't
  // pick up a pedestal while the run-end UI owns the screen, and
  // the floating "E · TAKE" label was visibly stacking on top of
  // the death-fallen banner during pre-death pedestal hover.
  if (room.kind !== 'hamlet' && !window.__centerBannerActive) {
    drawPedestalPrompt(ctx);
  }
  // Treasure chest interact prompt — "E · OPEN" floating above the
  // nearest closed chest within range. Same visual style as hamlet
  // interact labels for player-facing consistency.
  if (room.kind === 'chestroom') {
    const HR = 80;
    let nearest = null, nearestD2 = HR * HR;
    for (const c of roomChests) {
      if (c.state !== 'closed') continue;
      const cx = c.x * TILE + TILE / 2;
      const cy = c.y * TILE + TILE / 2;
      const dx = hero.x - cx, dy = hero.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < nearestD2) { nearest = c; nearestD2 = d2; }
    }
    if (nearest) {
      const cx = nearest.x * TILE + TILE / 2;
      const cy = nearest.y * TILE + TILE / 2;
      const now = performance.now() / 1000;
      const floatOff = Math.sin(now * 2.2) * 3;
      const promptY = cy - 56 + floatOff;
      const label = 'E  ·  OPEN';
      ctx.save();
      ctx.font = 'bold 11px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const m = ctx.measureText(label);
      const padX = 10;
      const w = m.width + padX * 2;
      const h = 20;
      ctx.fillStyle = 'rgba(14, 10, 16, 0.88)';
      ctx.fillRect(cx - w / 2, promptY - h / 2, w, h);
      ctx.strokeStyle = 'rgba(201, 168, 106, 0.8)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - w / 2 + 0.5, promptY - h / 2 + 0.5, w - 1, h - 1);
      ctx.fillStyle = '#f4d9a0';
      ctx.fillText(label, cx, promptY);
      ctx.restore();
    }
  }
  ctx.restore();

  // INTRO CINEMATIC GATE — when any intro is active (floor card / boss intro
  // / phase intro), skip the ENTIRE mood-filter pipeline below: bloom,
  // biome grade, chromatic aberration, color washes, hero-centered
  // darkness, and screen vignette. These passes compound into ~70%
  // darkness during a boss intro, crushing the painted portrait to
  // near-black. Prior fixes suppressed individual layers but missed the
  // bloom + biome-grade multiply passes that run BEFORE the per-layer
  // gate. This gate covers everything in one shot — the intro gets its
  // own letterbox + veil for cinematic framing, nothing else.
  const introActiveNow = bossIntroTime > 0 || floorCardTime > 0 || phaseIntroTime > 0;

  const bloomKind = floor[roomIndex]?.kind;
  if (!introActiveNow && bloomKind !== 'hamlet') {
    // BLOOM PASS — bright-pixel bleed (torches, fire, gold). Suppressed
    // during intros so the portrait isn't pre-filtered before compositing.
    // Also suppressed for the hamlet — that scene is pre-lit by its painted
    // fire halos and dust motes; a bloom pass blows out the firepit into a
    // muddy bright blob and shifts the palette toward the dungeon look.
    // Bloom dial-down (Tier 2 atmosphere sweep, audit T2.10): previous
    // 0.52-0.68 was high for pixel art — bright pixels (torches, embers,
    // hero halo) were re-amplifying themselves each frame, blooming the
    // bloom and softening the hard pixel edges that pixel-art identity
    // depends on. Reference roguelites (Hades, Dead Cells) sit around
    // 0.20-0.35. Dropped to 0.32 default / 0.42 boss / 0.36 altar — the
    // bright accents still glow but the world stays crisp.
    // Per-biome dial: when a painted floor sheet is loaded for the
    // current biome, drop bloom further. The painterly stones already
    // carry their own light/shade variation; layering bloom on top
    // makes every cobblestone highlight pulse softly during the
    // chromatic-aberration / vignette passes, which reads as the
    // texture "breathing". Biomes still on procedural floor (vault /
    // abyss / inferno until their sheets ship) keep the original 0.32
    // since flat fills don't get that pulse.
    const _biomeId = BIOME_BY_FLOOR[currentFloorLevel];
    const _hasPaintedFloor = !!(_biomeId && imageCache[`floor_${_biomeId}_0`]);
    // Lighting overhaul (2026-05-07): bloom intensities cut by ~30-35%
    // across the board. Bloom has no color clamp (postfx.js line 94's
    // brightness/contrast filter lifts ALL bright pixels equally), so
    // any near-white sprite (torch core, hero halo, gold particles)
    // blooms flat-bright — that's the "lens flare bokeh" the user was
    // calling out. Lower bloom = less of those camera-like artifacts.
    // Boss + altar still get the strongest bloom for theatrical effect
    // but pulled back from 0.42/0.36 to 0.30/0.24.
    const bloomIntensity = bloomKind === 'boss' ? 0.30
      : bloomKind === 'altar' ? 0.24
      : _hasPaintedFloor ? 0.14
      : 0.20;
    applyBloom(ctx, canvas, bloomIntensity);

    // BIOME COLOR GRADE — two-pass tint giving each floor a distinct mood.
    // Multiply dims shadows/midtones; screen adds highlights. Suppressed
    // during intros because the multiply pass visibly darkens the portrait
    // even at 0.5× boss-room scale. Also skipped for hamlet — it already
    // paints its own sky/ground palette.
    const gradePal = currentBiomePal();
    if (gradePal.gradeMultiply) {
      const gradeScale = bloomKind === 'boss' ? 0.5 : 1.0;
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = gradePal.gradeAlpha * gradeScale;
      ctx.fillStyle = gradePal.gradeMultiply;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    if (gradePal.gradeScreen) {
      const gradeScale = bloomKind === 'boss' ? 0.6 : 1.0;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = gradePal.gradeScreenAlpha * gradeScale;
      ctx.fillStyle = gradePal.gradeScreen;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    // CHROMATIC ABERRATION — RGB channel split overlay when hero just took a hit
    // or a big impact landed. Brief and quartic-eased so it snaps out fast.
    applyChromAberr(ctx, canvas);
  }

  // Per-room color wash — subtle tonal cue for room kind, on top of biome wash
  const kind = floor[roomIndex]?.kind;
  const pal = currentBiomePal();
  // Biome ambient wash (always applied so each floor reads differently)
  if (pal.washColor && !introActiveNow) {
    ctx.fillStyle = pal.washColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  let wash = null;
  // Per-kind floor washes (audit D10): event rooms (sanctuary / altar /
  // reward / shop / trove / chestroom) all share the same 16×11 footprint
  // with pillarTemplate: 3 — they differ only by their center prop and
  // this wash. Previously sanctuary + shop had no wash assigned at all,
  // and altar/reward washes were too mild to register against the floor.
  // Each kind now has a distinct tonal identity:
  //   combat       — muted blood (the default, kept subtle so frequent
  //                  fights don't feel oppressive)
  //   sanctuary    — cool teal-green (rest, healing)
  //   reward       — warm gold-green (loot, achievement)
  //   altar        — deep blood-red (sacrifice, pact)
  //   shop         — warm amber (commerce, hearth)
  //   trove        — muted brown-gold (treasure, dust)
  //   chestroom    — violet (gambling tension)
  //   challenge    — burnt orange (heat, trial)
  //   boss         — per-floor (T2.4)
  if (kind === 'combat')         wash = 'rgba(80, 20, 28, 0.08)';
  else if (kind === 'sanctuary') wash = 'rgba(50, 130, 110, 0.14)';
  else if (kind === 'reward')    wash = 'rgba(110, 150, 70, 0.14)';
  else if (kind === 'shop')      wash = 'rgba(180, 120, 50, 0.14)';
  else if (kind === 'trove')     wash = 'rgba(160, 130, 60, 0.12)';
  else if (kind === 'chestroom') wash = 'rgba(140, 90, 180, 0.14)';
  else if (kind === 'boss') {
    // Per-boss arena tint (audit T2.4): previously every boss room got
    // the same generic 'rgba(140, 18, 24, 0.18)' muddy-red wash. The
    // four floor bosses each have a distinct identity that the floor
    // wash can amplify without authoring per-boss tile sheets:
    //   F1 Grudnok (elite_orc) — blood-soaked warchief throne
    //   F2 Iron Revenant (bone_captain) — cold steel-blue iron plate
    //   F3 Broodmother — muddy spore green-brown
    //   F4 Ember Tyrant — cracked ember orange (final boss, hottest)
    // Tint pulled by currentFloorLevel since the boss is determined by
    // floor (floor.js:752). Floor-1 default keeps the legacy red so
    // mini-bosses on F2-3 don't accidentally take F1's tint.
    if (currentFloorLevel === 1)      wash = 'rgba(110, 30, 28, 0.20)';
    else if (currentFloorLevel === 2) wash = 'rgba(40, 70, 110, 0.20)';
    else if (currentFloorLevel === 3) wash = 'rgba(80, 100, 50, 0.18)';
    else if (currentFloorLevel === 4) wash = 'rgba(180, 70, 30, 0.22)';
    else                              wash = 'rgba(140, 18, 24, 0.18)';
  }
  else if (kind === 'altar')     wash = 'rgba(180, 30, 50, 0.18)';
  else if (kind === 'challenge') wash = 'rgba(180, 100, 30, 0.12)';
  if (wash && !introActiveNow) {
    // Soften per-kind wash on biomes where a painted floor sheet is
    // active. The original wash alphas (0.08-0.22) were tuned against
    // a flat procedural cool-grey floor where they read as a subtle
    // tonal cue. On the warm-toned painterly cobblestone the wash
    // stacks with the floor's existing warmth (combat blood-red onto
    // warm-grey stone reads as overall pink, washing out the painted
    // detail). Cutting alpha in half keeps the kind cue legible — you
    // can still tell a combat room from a sanctuary at a glance —
    // without drowning the painted base. Same condition as the bloom
    // dial in W5 above; biomes still on procedural floor keep the
    // original strengths.
    const _washBiome = BIOME_BY_FLOOR[currentFloorLevel];
    const _washHasPainted = !!(_washBiome && imageCache[`floor_${_washBiome}_0`]);
    if (_washHasPainted) {
      // rgba string format: "rgba(R, G, B, A)" — parse the tail alpha
      // and rewrite at half strength. Cheap regex, runs once per frame.
      const m = wash.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/);
      if (m) {
        const a = Math.max(0, parseFloat(m[4]) * 0.5);
        wash = `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${a.toFixed(3)})`;
      }
    }
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Hero-centered atmospheric lighting — soft, not a spotlight.
  const hsx = hero.x - camera.x + canvas.width / 2 + camera.offsetX;
  const hsy = hero.y - camera.y + canvas.height / 2 + camera.offsetY;

  // Skip darkness layer + vignette entirely during intros — the intro has
  // its own letterbox + veil for framing, any further darkening compounds
  // into near-black over the portrait. The hamlet is an outdoor hub and
  // gets a much softer treatment (no hero-centered darkness, only a mild
  // warm vignette) so it reads as welcoming, not dungeon-dim.
  const preBoss = roomNextKind.kind === 'boss' && kind !== 'boss';
  // Hamlet vigBase shifted from 'rgba(30, 16, 10, ' (warm brown — reads
  // "cozy hearth") to 'rgba(8, 10, 22, ' (cold dark blue-purple — reads
  // "moonlit ruin"). Bridges to the dungeon's vignetteBase color family
  // and supports the dark-fantasy unification of hamlet + dungeon.
  const vigBase = preBoss ? 'rgba(30, 4, 6, '
    : kind === 'hamlet' ? 'rgba(8, 10, 22, '
    : (pal.vignetteBase || 'rgba(4, 4, 8, ');
  if (!introActiveNow) {
    if (kind === 'hamlet') {
      // HAMLET — cool purple edge vignette (was warm brown). Stops bumped
      // 0.08/0.28 → 0.18/0.45 after dark-fantasy unification audit
      // flagged the previous strength as "homeopathic" — too weak to
      // actually read as atmosphere. New stops sit between the dungeon
      // boss-room (0.72) and the previous hamlet (0.28), giving the
      // hamlet a real moody frame without flattening it into combat-
      // room dimness.
      const cx = canvas.width / 2, cy = canvas.height / 2;
      const vigInner = Math.min(canvas.width, canvas.height) * 0.32;
      const vigOuter = Math.max(canvas.width, canvas.height) * 0.78;
      const vig = ctx.createRadialGradient(cx, cy, vigInner, cx, cy, vigOuter);
      vig.addColorStop(0,    vigBase + '0)');
      vig.addColorStop(0.55, vigBase + '0.18)');
      vig.addColorStop(1,    vigBase + '0.45)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      // Darkness layer — edges are dim, center is ALMOST full-bright.
      const darkAmount = kind === 'boss' ? 0.70 : 0.45;
      const darkInner  = kind === 'boss' ? 260 : 340;
      const darkOuter  = kind === 'boss' ? 620 : 760;
      const dark = ctx.createRadialGradient(hsx, hsy, darkInner, hsx, hsy, darkOuter);
      dark.addColorStop(0, 'rgba(6, 4, 10, 0)');
      dark.addColorStop(0.7, 'rgba(6, 4, 10, ' + (darkAmount * 0.4).toFixed(2) + ')');
      dark.addColorStop(1, 'rgba(6, 4, 10, ' + darkAmount.toFixed(2) + ')');
      ctx.fillStyle = dark;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // SCREEN-SPACE VIGNETTE — always-on dim corners, biome-tinted.
      const vigStrength = kind === 'boss' ? 0.72 : preBoss ? 0.62 : 0.48;
      const cx = canvas.width / 2, cy = canvas.height / 2;
      const vigInner = Math.min(canvas.width, canvas.height) * 0.28;
      const vigOuter = Math.max(canvas.width, canvas.height) * 0.72;
      const vig = ctx.createRadialGradient(cx, cy, vigInner, cx, cy, vigOuter);
      vig.addColorStop(0,    vigBase + '0)');
      vig.addColorStop(0.55, vigBase + (vigStrength * 0.25).toFixed(3) + ')');
      vig.addColorStop(1,    vigBase + vigStrength.toFixed(3) + ')');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  // Per-floor biome warmth is the right knob for "this floor feels hot/cold,"
  // not a hero-centered orange wash. The previous radius-320 warm tint
  // was painting an orange halo around the hero EVERY floor — F1 crypt
  // (cool blue) ended up reading warm-orange because the hero halo
  // dominated. Audit T1.6: removed. F4 inferno still reads hot via its
  // biome multiply pass + warm vignette base + per-torch halos; F1-3
  // now read in their intended palette without the hero pulling the
  // surrounding floor into orange. Hero readability is preserved by
  // the small 46-radius under-hero halo in drawHero (hero.js:3122).
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // CHESTROOM ambient — subtle violet wash so the gambling-tension room
  // reads atmospherically distinct from regular combat/event rooms even
  // before the player sees the chests. Corner-to-corner falloff, gentle
  // alpha, additive blend.
  if (kind === 'chestroom') {
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const vio = ctx.createRadialGradient(cx, cy, 60, cx, cy, Math.max(canvas.width, canvas.height) * 0.7);
    vio.addColorStop(0, 'rgba(170, 110, 220, 0.06)');
    vio.addColorStop(0.5, 'rgba(140, 90, 200, 0.04)');
    vio.addColorStop(1, 'rgba(110, 70, 180, 0)');
    ctx.fillStyle = vio;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Wall torch halos — soft, warm, ATMOSPHERIC pools of light. NOT
  // spotlights. Holistic redesign 2026-04-27 after the previous version
  // was reading as 'stage spotlights thrown around the room':
  //   - god-ray cones removed entirely (the biggest 'spotlight' offender)
  //   - halo radius cut 220 -> 100 (each torch lights its own neighborhood,
  //     not half the room)
  //   - core alpha cut 0.70 -> 0.28 (no more pure-white blowout under
  //     the additive blend mode)
  //   - flicker depth cut 0.28 -> 0.10 (subtle breathing, not strobing)
  //   - mid-stop pushed wider so the falloff is smoother
  // Net: each torch contributes a small warm pool that fades naturally
  // into the room's general dimness. The torch sprite itself remains
  // the visually-bright element, with a gentle warm halo around it.
  const now = performance.now() / 1000;
  const flameBase = pal.torchFlame || 'rgba(255, 180, 100, ';
  for (const t of roomTorches) {
    // Focal-light torches (brazier/crater virtual emitters) skip this
    // small flame halo — the focal piece draws its own flame visual,
    // so adding the wall-torch halo on top would double-light the spot.
    if (t.focalLight) continue;
    const tsx = t.x - camera.x + canvas.width / 2 + camera.offsetX;
    const tsy = t.y - camera.y + canvas.height / 2 + camera.offsetY;
    const phase = (now * 2.4 + (t.seed & 0xff) * 0.1);
    const flick = 0.90 + 0.10 * (Math.sin(phase * 7.3) * 0.5 + Math.sin(phase * 11.1) * 0.4 + Math.sin(phase * 17.5) * 0.3) / 1.2;
    // Tightened from r=100 + 0.28/0.08 to r=70 + 0.16/0.04. Together with
    // the room-side torch radial reduction (drawTorchLighting in room.js,
    // 230 → 180 px and alphas halved), a single torch now contributes
    // sprite + small flame halo + soft warm pool — three layers, each
    // small. Pre-fix, the same torch contributed sprite + 100 px bright
    // halo + 230 px bright pool, reading as a stage spotlight.
    // Lighting overhaul (2026-05-07): radius 70 → 50, alphas 0.16/0.04
    // → 0.10/0.025. With the new warm-amber torch palette, this halo
    // contributes a tight bright pip RIGHT at the flame source rather
    // than a wider glow, reducing the "bulb" feel and reinforcing
    // "fire is local, dungeon stays dark elsewhere."
    const radius = 50 + flick * 6;
    const g = ctx.createRadialGradient(tsx, tsy, 4, tsx, tsy, radius);
    g.addColorStop(0, flameBase + (0.10 * flick).toFixed(3) + ')');
    g.addColorStop(0.45, flameBase + (0.025 * flick).toFixed(3) + ')');
    g.addColorStop(1, flameBase + '0)');
    ctx.fillStyle = g;
    ctx.fillRect(tsx - radius, tsy - radius, radius * 2, radius * 2);
  }
  ctx.restore();

  // AIM RETICLE — small crosshair at the mouse position in screen space.
  // Grows + colors based on hero state: idle gold, charging pulses gold-white,
  // attack flashes bright, hurt dims. Hidden on menus/dead/pause/boss intro.
  if (running && !paused && hero.state !== 'dead' && bossIntroTime <= 0
      && deathEl.style.display !== 'flex' && winEl.style.display !== 'flex'
      && !deathCeremonyActive) {
    const rx = mouse.x, ry = mouse.y;
    const charging = mouse.down && hero.chargeTime > 0.15;
    const attacking = hero.state === 'attack';
    // Base reticle — thin gold ring
    let reticleR = 14;
    let reticleColor = '#f4d9a0';
    let reticleAlpha = 0.75;
    let reticleWidth = 1.2;
    if (charging) {
      // Pulsing ring grows with charge amount, tints white-hot at peak
      const chargeT = Math.min(1, hero.chargeTime / 0.6);
      reticleR = 14 + chargeT * 14;
      reticleColor = chargeT >= 1 ? '#ffffff' : '#ffe495';
      reticleAlpha = 0.85 + chargeT * 0.15;
      reticleWidth = 1.5 + chargeT * 0.8;
    } else if (attacking) {
      reticleR = 10;
      reticleAlpha = 0.45;
    } else if (hero.state === 'shield' || hero.state === 'dash' || hero.state === 'blink') {
      // Reticle fades during shield/dash/lunge — player focus is
      // elsewhere (defending or committing forward).
      reticleAlpha = 0.25;
    }
    ctx.save();
    ctx.globalAlpha = reticleAlpha;
    ctx.strokeStyle = reticleColor;
    ctx.lineWidth = reticleWidth;
    // Outer ring (broken — 4 arc segments to read as reticle, not a target)
    const arcLen = Math.PI * 0.32;
    for (let i = 0; i < 4; i++) {
      const baseAng = i * Math.PI / 2 - Math.PI / 4;
      ctx.beginPath();
      ctx.arc(rx, ry, reticleR, baseAng - arcLen / 2, baseAng + arcLen / 2);
      ctx.stroke();
    }
    // Central crosshair — tiny plus sign
    ctx.fillStyle = reticleColor;
    ctx.globalAlpha = reticleAlpha * 0.9;
    ctx.fillRect(rx - 0.5, ry - 3, 1, 2);
    ctx.fillRect(rx - 0.5, ry + 2, 1, 2);
    ctx.fillRect(rx - 3, ry - 0.5, 2, 1);
    ctx.fillRect(rx + 2, ry - 0.5, 2, 1);
    // Charge halo — soft radial glow around the reticle at full charge
    if (charging && hero.chargeTime >= 0.6) {
      const haloG = ctx.createRadialGradient(rx, ry, 4, rx, ry, reticleR * 2);
      haloG.addColorStop(0, 'rgba(255, 255, 200, 0.35)');
      haloG.addColorStop(1, 'rgba(255, 255, 200, 0)');
      ctx.fillStyle = haloG;
      ctx.fillRect(rx - reticleR * 2, ry - reticleR * 2, reticleR * 4, reticleR * 4);
    }
    ctx.restore();
  }

  // HUD (below transition veil). introActive flag lets the HUD suppress
  // combat-state overlays (low-HP red pulse, damage arrow) that would
  // otherwise double-dim the boss intro portrait.
  // SUPPRESS during the Keeper wake cinematic: the wake's vignette uses
  // a radial gradient at 92% center opacity (intentional, for the slow
  // candle-glow look), so canvas-rendered HUD elements (hearts, dodge/
  // dash binds) bleed through faintly at top-left. Skip the draw entirely
  // while the cinematic is active.
  if (_wakeCinematicActive || isIntroActive()) {
    // Fall through to the cinematic only. Canvas pipe still ran for the
    // world (so the reveal at 26-28s shows the live dungeon room), but
    // the HUD/UI layer is suppressed. Same gate covers the keeper wake
    // (DOM-based) and the first-run intro (canvas-based) — both want
    // the screen visually clean during their cinematic phase.
  } else {
  // Screen flash fires BEFORE the HUD so it washes the world only, not the
  // HUD layer. Previously drawScreenFlash ran after drawHud + tooltips +
  // banner, which meant a hurt-flash (red rgba ~0.30 alpha) tinted the
  // hearts, dodge pip, and relic strip exactly when the player most needs
  // to read them — "I just got hit, what's my HP?". Banner/dodge/combo
  // overlays still draw after the HUD because they're meant to dominate.
  drawScreenFlash(ctx, canvas.width, canvas.height);
  // Themed room motes — drift theme-color particles across the screen
  // when the active room carries a roomTheme. Drawn after screen-flash
  // (so a hurt-flash washes the world only) but before the HUD (so the
  // motes don't tint hearts / chips). Suppressed during cinematic
  // intros — same gate as the HUD itself uses just below. Layer alpha
  // multiplier follows the combat-aware atmospheric dim: full opacity
  // when peaceful, ~30% during active combat so they don't compete
  // with enemy projectiles + telegraphs for the player's eye.
  if (!(bossIntroTime > 0 || floorCardTime > 0 || phaseIntroTime > 0)) {
    const _motesAlpha = 1 - 0.7 * _atmosphericDim;
    drawThemedRoomMotes(ctx, _motesAlpha);
    // Zone ambient — drawn AFTER themed motes (so themed-pickup motes
    // remain salient over zone ambient when both are active) but BEFORE
    // the HUD. The wash is drawn first as a subtle full-screen tint,
    // then the particles drift over it. Both are suppressed during
    // cinematic intros (same outer guard).
    const _zoneWash = getActiveZoneWash();
    if (_zoneWash) drawZoneWash(ctx, canvas.width, canvas.height, _zoneWash);
    drawZoneAmbient(ctx);
    // XP bar — top-of-screen progress bar + level label. Phase 3 fix:
    // gate on the zone runner being ACTIVE rather than on `hero.level >= 1`,
    // because hero.level stays elevated after a zone run even when the
    // player returns to the legacy DAG flow (which has no XP system).
    // This prevents the XP bar from leaking into legacy runs that follow.
    const _runnerState = getZoneRunnerState();
    if (_runnerState.zoneName) {
      drawXpBar(ctx, canvas.width);
    }
    // Zone HUD — wave dots + boss banner. No-op when not in a zone run.
    drawZoneHud(ctx, canvas.width);
  }
  drawHud(ctx, canvas.width, canvas.height, {
    roomIndex, totalRooms: floor.length,
    roomKind: floor[roomIndex]?.kind,
    roomTheme: floor[roomIndex]?.roomTheme || null,
    relics: equippedRelics,
    floorLevel: currentFloorLevel,
    maxFloors: MAX_FLOORS,
    gold: gold.total,
    floorRooms: floor,              // legacy linear minimap fallback
    // New: full graph + current position so HUD can render a connected
    // 2D dungeon minimap (Hades / Isaac style) instead of a linear strip.
    floorGraph: currentGraph,
    currentNodeId,
    introActive: bossIntroTime > 0 || floorCardTime > 0 || phaseIntroTime > 0,
    inHamlet: room.kind === 'hamlet',
  });
  // Wizard-kit Sprint 3D UX audit — pedestal + wanderer hover tooltips
  // and the pickup banner all suppress during run-end states so they
  // don't stack on top of "YOU HAVE FALLEN" / floor-clear / win modals.
  // drawPickupFlash already gates internally on __centerBannerActive;
  // hover tooltips need explicit gates here.
  if (!window.__centerBannerActive) {
    drawPedestalTooltip(ctx, canvas.width, canvas.height, { gold: gold.total, floorLevel: currentFloorLevel });
    drawWandererTooltip(ctx, canvas.width, canvas.height);
  }
  drawPickupFlash(ctx, canvas.width, canvas.height);
  // Elite affix hover — reveals frost / ember / venom / warded before the
  // fight. Drawn after the HUD so it floats above other UI when the cursor
  // is on an elite.
  drawEliteAffixTooltips(ctx, canvas.width, canvas.height);
  // THE WATCHER — rare, weighty utterance at milestone moments. Defers if
  // any ceremony is onscreen so it never speaks over a floor card / boss
  // intro / pickup banner. Also pause-aware so the fade clock freezes
  // while the player is in the pause menu.
  drawWatcher(ctx, canvas.width, canvas.height, {
    floorCardTime, bossIntroTime, phaseIntroTime,
    pickupFlashActive: isPickupFlashActive(),
    paused,
  });
  drawComboOverlay(ctx, canvas.width, canvas.height);
  drawPerfectDodgeOverlay(ctx, canvas.width, canvas.height);
  // Relic-choice modal — Hades-style overlay for pedestal rooms.
  // Drawn AFTER HUD + watcher so it sits on top of everything in the
  // pedestal-room moment, but BEFORE the death-ceremony overlay
  // (which lives outside this if-branch and owns the screen on death).
  // Reroll cost matches main.js's keydown handler formula: shop=30,
  // combat=20+floor*15.
  {
    const _floorData = floor[roomIndex];
    const _isShop = _floorData?.kind === 'shop';
    const _rerollCost = _isShop ? 30 : (20 + currentFloorLevel * 15);
    drawRelicChoiceModal(ctx, canvas.width, canvas.height, {
      roomKind: _floorData?.kind,
      rerollCost: _rerollCost,
    });
  }
  } // end if !_wakeCinematicActive

  // DEATH CEREMONY overlay — desaturating red veil that ramps in, vignette crush
  if (deathCeremonyActive) {
    const t = Math.min(1, deathCeremonyTime / 1.8);
    // Red-black vignette — tighter and darker than normal
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const vigR = Math.min(canvas.width, canvas.height) * (0.22 + t * 0.25);
    const vigOut = Math.max(canvas.width, canvas.height) * (0.85 - t * 0.15);
    const vig = ctx.createRadialGradient(cx, cy, vigR, cx, cy, vigOut);
    vig.addColorStop(0, `rgba(30, 2, 4, ${(t * 0.2).toFixed(3)})`);
    vig.addColorStop(0.55, `rgba(40, 4, 6, ${(t * 0.5).toFixed(3)})`);
    vig.addColorStop(1, `rgba(20, 2, 4, ${(t * 0.85).toFixed(3)})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Blood red wash + desaturation effect (approximated by layering gray)
    ctx.fillStyle = `rgba(120, 10, 20, ${(t * 0.18).toFixed(3)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // "YOU HAVE FALLEN" text fading in during second half
    if (t > 0.5) {
      const textA = Math.min(1, (t - 0.5) / 0.45);
      ctx.save();
      ctx.globalAlpha = textA;
      ctx.font = 'italic bold 52px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(180, 30, 40, 0.7)';
      ctx.shadowBlur = 24;
      ctx.fillStyle = 'rgba(10, 2, 4, 0.85)';
      ctx.fillText('YOU HAVE FALLEN', canvas.width / 2 + 3, canvas.height / 2 + 3);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#d85a5a';
      ctx.fillText('YOU HAVE FALLEN', canvas.width / 2, canvas.height / 2);
      ctx.restore();
    }
  }
  // First-death fade-to-black — only fires once per profile. Holds
  // for FIRST_DEATH_HOLD seconds after the ceremony hits 1.8 (so
  // "YOU HAVE FALLEN" gets full read-time on the red veil), then
  // progressively covers the entire frame in opaque black across
  // FIRST_DEATH_FADE seconds. By the time enterHamletCanvas fires,
  // the canvas is solid black and the keeper wake's letterbox bars
  // can fade in from black instead of cutting from a red ceremony
  // frame. The text inherently fades with the screen because it's
  // drawn before this overlay.
  if (_firstDeathFadeActive && _firstDeathFadeTime > FIRST_DEATH_HOLD) {
    const fadeT = Math.min(1, (_firstDeathFadeTime - FIRST_DEATH_HOLD) / FIRST_DEATH_FADE);
    ctx.fillStyle = `rgba(0, 0, 0, ${fadeT})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  // FIRST-RUN INTRO overlay — black backdrop + cardiac glow + 3 text
  // beats. Drawn over the world but BEFORE drawTip so the cinematic
  // dominates the screen. Self-dismisses after INTRO_DURATION.
  drawIntro(ctx, canvas.width, canvas.height);
  drawTip(ctx, canvas.width);                    // no-op shim
  // Top-right notification rail — tips, relic pickups (non-first-mythic),
  // fusion forged, codex unlocks. Suppressed during cinematics by the
  // module's own __centerBannerActive guard.
  drawNotifications(ctx, canvas.width, canvas.height);

  // Achievement unlock popups — top-right toasts, positioned BELOW the floor
  // panel so they don't overlap it. Shared visual grammar with tip/codex:
  // tome gradient, inset stroke, corner diamonds, gold-on-dark.
  if (pendingPopups.length > 0) {
    for (let i = 0; i < pendingPopups.length; i++) {
      const p = pendingPopups[i];
      p.t += 1 / 60;
      const life = p.life;
      const r = p.t / life;
      const achDef = ACHIEVEMENTS[p.id];
      const isHidden = achDef && achDef.hidden;
      // Hidden reveal phase: first 1.6s shows "???" + cryptic hint; after
      // that, a white flash crossfades to the real name/desc. Creates a
      // discovery moment distinct from normal achievements.
      const revealAt = 1.6;
      const inMystery = isHidden && p.t < revealAt;
      const justRevealed = isHidden && p.t >= revealAt && p.t < revealAt + 0.35;
      if (!p._stung) {
        p._stung = true;
        if (isHidden) {
          // Hidden achievements get a deeper, hushed sting
          synthGloom(220, 0.9, 1.2);
          playSfx('click', { rate: 0.35, volume: 0.7 });
        } else {
          playSfx('click', { rate: 0.4, volume: 0.9 });
          synthChord(523, 1.0, 0.7);
        }
        // Round-7-audit POLISH — achievement unlock should pull the
        // world's eye for a beat, not just slide a popup into the
        // top-right rail. A short cream-gold screen wash + a 14-spark
        // wash at the hero's position turns the milestone into a
        // moment. Hidden achievements get a slightly cooler tint to
        // match the synthGloom audio's minor-key feel.
        try {
          triggerScreenFlash(
            isHidden ? 'rgba(180, 200, 255, 0.10)' : 'rgba(244, 217, 160, 0.12)',
            isHidden ? 0.45 : 0.4,
          );
          for (let k = 0; k < 14; k++) {
            const ang = (k / 14) * Math.PI * 2;
            const r = 36 + Math.random() * 14;
            sparkle(
              hero.x + Math.cos(ang) * r,
              hero.y - 6 + Math.sin(ang) * r * 0.7,
              isHidden ? '#b8c8ff' : '#ffe5a0',
            );
          }
        } catch (_e) {}
      }
      // Reveal sting — triggers ONCE when the mystery phase ends
      if (isHidden && !p._revealed && p.t >= revealAt) {
        p._revealed = true;
        synthChord(659, 1.0, 0.9);
        synthFanfare(0.55);
      }
      let opacity = 1;
      if (r < 0.1) opacity = r / 0.1;
      else if (r > 0.85) opacity = (1 - r) / 0.15;
      opacity = Math.max(0, Math.min(1, opacity));
      const slideX = r < 0.12 ? (0.12 - r) * 480 : r > 0.85 ? (r - 0.85) * 380 : 0;
      const entryBump = r < 0.18 ? 1 + Math.sin((r / 0.18) * Math.PI) * 0.08 : 1;
      const yOff = i * 74;
      ctx.save();
      ctx.globalAlpha = opacity;
      const bw = 300, bh = 62;
      const bx = canvas.width - bw - 16 + slideX;
      // Stack achievements BELOW the notifications rail (tips, pickups, etc.)
      // so they don't overlap. The rail sits at y=120+; achievements anchor
      // at the rail's bottom edge + small gap. Falls through to y=120
      // when the rail is empty.
      const railBottom = getNotificationStackBottom(ctx);
      const by = railBottom + 6 + yOff;
      const pivotX = bx + bw / 2, pivotY = by + bh / 2;
      ctx.translate(pivotX, pivotY);
      ctx.scale(entryBump, entryBump);
      ctx.translate(-pivotX, -pivotY);
      // Soft gold halo — only during entry flash
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 280);
      const haloA = (r < 0.4 ? (0.4 - r) / 0.4 : 0.18) * pulse;
      if (haloA > 0.02) {
        const halo = ctx.createRadialGradient(pivotX, pivotY, 20, pivotX, pivotY, bw * 0.6);
        halo.addColorStop(0, `rgba(201, 168, 106, ${(haloA * 0.5).toFixed(3)})`);
        halo.addColorStop(1, 'rgba(201, 168, 106, 0)');
        ctx.fillStyle = halo;
        ctx.fillRect(bx - 40, by - 20, bw + 80, bh + 40);
      }
      // Tome gradient backing (matches tip banner)
      const frameGrad = ctx.createLinearGradient(bx, by, bx, by + bh);
      frameGrad.addColorStop(0, 'rgba(30, 22, 16, 0.95)');
      frameGrad.addColorStop(1, 'rgba(14, 10, 8, 0.95)');
      ctx.fillStyle = frameGrad;
      ctx.fillRect(bx, by, bw, bh);
      // Inset stroke — no outer border. Same as meta cards.
      ctx.strokeStyle = '#c9a86a';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
      ctx.strokeStyle = 'rgba(201, 168, 106, 0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 4.5, by + 4.5, bw - 9, bh - 9);
      // Corner diamonds — ornamental grammar
      ctx.fillStyle = '#c9a86a';
      for (const [cx, cy] of [[bx + 5, by + 5], [bx + bw - 5, by + 5], [bx + 5, by + bh - 5], [bx + bw - 5, by + bh - 5]]) {
        ctx.fillRect(cx - 1, cy, 2, 1);
        ctx.fillRect(cx, cy - 1, 1, 2);
      }
      // Trophy icon
      ctx.fillStyle = '#f4d9a0';
      // Trophy icon — question mark during hidden mystery phase, star otherwise.
      // Reveal flash recolors the star for a beat.
      const iconGlyph = inMystery ? '?' : '\u2605';
      const iconColor = inMystery ? '#a0b4e0' : (justRevealed ? '#ffffff' : '#f4d9a0');
      const iconGlow = inMystery ? '#607aa0' : (justRevealed ? '#ffffff' : '#c9a86a');
      ctx.fillStyle = iconColor;
      ctx.font = inMystery ? 'italic bold 26px Georgia, serif' : '22px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = iconGlow;
      ctx.shadowBlur = justRevealed ? 18 : 8;
      ctx.fillText(iconGlyph, bx + 22, by + bh / 2);
      ctx.shadowBlur = 0;
      // Header label — "ACHIEVEMENT UNLOCKED" normally, "A HIDDEN TRUTH" during
      // the mystery phase of a hidden achievement.
      ctx.fillStyle = isHidden ? (inMystery ? '#a0b4e0' : '#ffddaa') : '#c9a86a';
      ctx.font = 'italic bold 9px Georgia, serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const headerText = inMystery
        ? '\u2014 A HIDDEN TRUTH \u2014'
        : (isHidden ? '\u2014 REVEALED \u2014' : '\u2014 ACHIEVEMENT UNLOCKED \u2014');
      ctx.fillText(headerText, bx + 44, by + 10);
      // Name — either "???" (mystery) or real name (revealed). Just-revealed
      // state flashes to white to sell the unveiling.
      const ach = achDef;
      const nameText = inMystery ? '???' : ach.name;
      const nameColor = justRevealed ? '#ffffff' : '#f4d9a0';
      if (justRevealed) { ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 14; }
      ctx.fillStyle = nameColor;
      ctx.font = 'bold 15px Georgia, serif';
      ctx.fillText(nameText, bx + 44, by + 24);
      ctx.shadowBlur = 0;
      // Desc — cryptic hint in mystery phase, real desc when revealed.
      const descText = inMystery ? (ach.hint ? '\u201C' + ach.hint + '\u201D' : '\u2014 unknown \u2014') : ach.desc;
      ctx.fillStyle = inMystery ? 'rgba(180, 195, 220, 0.85)' : 'rgba(200, 190, 170, 0.8)';
      ctx.font = inMystery ? 'italic 11px Georgia, serif' : 'italic 10px Georgia, serif';
      ctx.fillText(descText, bx + 44, by + 45);
      // Orbit sparkles during entry
      if (r < 0.55) {
        ctx.save();
        ctx.globalAlpha = opacity;
        for (let k = 0; k < 5; k++) {
          const ang = performance.now() / 180 + k * 1.26 + i * 0.4;
          const rad = bw * 0.56 + Math.sin(ang * 1.7) * 8;
          const sx = bx + bw / 2 + Math.cos(ang) * rad;
          const sy = by + bh / 2 + Math.sin(ang) * (bh * 1.1);
          const sparkleA = (0.5 + 0.5 * Math.sin(ang * 3));
          ctx.fillStyle = `rgba(255, 240, 170, ${(0.8 * sparkleA).toFixed(3)})`;
          ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3);
        }
        ctx.restore();
      }
      ctx.restore();
    }
    for (let i = pendingPopups.length - 1; i >= 0; i--) {
      if (pendingPopups[i].t >= pendingPopups[i].life) pendingPopups.splice(i, 1);
    }
  }

  // Boss intro — routed to a DOM overlay instead of canvas drawImage.
  // See src/bossIntroDom.js for the rationale; the short version is that
  // canvas dims the JPG on some GPU pipelines regardless of correct
  // backing-store pixel values. <img> tags don't hit that path. The
  // function self-gates on the arguments, so main.js stays render-time
  // declarative ("here's the current state, sync yourself").
  updateBossIntro(bossIntroTime, bossIntroBoss, bossIntroFast);

  // Wizard-kit Sprint 3D UX cleanup — fusion announcement moved to the
  // top-right notification rail (see __onFusionFormed callback). The
  // centered manuscript banner with pulsing icon stacked with the
  // first-mythic pickup banner when both fired on the same pickup;
  // routing to the rail consolidates all transient announcements
  // into one consistent lane.

  // (Codex banner renderer removed — codex announcements now flow
  // through pushNotification({ kind: 'codex' }) into the top-right
  // notification rail. The standalone parchment banner at y=160 was
  // dominating the upper canvas for 3.6s; rail entries are smaller,
  // shorter-lived, and consistent with fusion / pickup / theme
  // announcements that already use the same lane. See the
  // __pendingCodexEntry handler in the tick.)

  // PHASE 2 boss banner — mid-fight cinematic when boss enrages.
  // First-encounter (per boss type): full 1.6s banner with PHASE 2 title
  //   + boss-name AWAKENED subtitle + pulsing aura. The "they got worse"
  //   reveal moment, lands once.
  // Subsequent encounters: 0.8s of just the letterbox + red flash + a
  //   small AWAKENED tag — the player has already learned what enrage
  //   means, so we keep the safety beat (iframes still cover the bar)
  //   but skip the heavy typography that would slow combat down.
  if (phaseIntroTime > 0 && phaseIntroBoss) {
    const total = phaseIntroIsFirstTime ? 1.6 : 0.8;
    const t = 1 - (phaseIntroTime / total);            // 0 → 1
    const w = canvas.width, h = canvas.height;
    // Red-tinted letterbox that's tighter than the boss intro bars
    const barPeak = h * 0.09;
    let barH;
    if (t < 0.22) barH = (t / 0.22) * barPeak;
    else if (t > 0.78) barH = (1 - (t - 0.78) / 0.22) * barPeak;
    else barH = barPeak;
    barH = Math.max(0, barH);
    ctx.fillStyle = 'rgba(30, 2, 4, 0.95)';
    ctx.fillRect(0, 0, w, barH);
    ctx.fillRect(0, h - barH, w, barH);
    ctx.fillStyle = 'rgba(255, 50, 40, 0.65)';
    if (barH > 2) {
      ctx.fillRect(0, barH - 1, w, 1);
      ctx.fillRect(0, h - barH, w, 1);
    }
    // Red flash fade
    const veilA = t < 0.15 ? (t / 0.15) * 0.28 : t > 0.82 ? (1 - (t - 0.82) / 0.18) * 0.28 : 0.28;
    ctx.fillStyle = 'rgba(80, 10, 20, ' + veilA.toFixed(3) + ')';
    ctx.fillRect(0, barH, w, h - barH * 2);
    // Big text — only on the first encounter per boss type. Otherwise
    // we render just a small AWAKENED tag in the bottom letterbox so
    // the player still gets a moment of "wait, something changed".
    const slideIn = Math.min(1, t / 0.22);
    const slideOut = t > 0.78 ? (t - 0.78) / 0.22 : 0;
    const a = Math.max(0, Math.min(1, slideIn - slideOut));
    if (phaseIntroIsFirstTime) {
      ctx.save();
      ctx.globalAlpha = a;
      const cx = w / 2, cy = h / 2;
      // Pulsing red aura behind text
      const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 120);
      const aura = ctx.createRadialGradient(cx, cy, 40, cx, cy, 320);
      aura.addColorStop(0, `rgba(255, 50, 40, ${(0.25 * pulse).toFixed(3)})`);
      aura.addColorStop(1, 'rgba(255, 50, 40, 0)');
      ctx.fillStyle = aura;
      ctx.fillRect(cx - 400, cy - 160, 800, 320);
      // PHASE 2 title
      ctx.font = 'bold 76px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(255, 40, 40, 0.9)';
      ctx.shadowBlur = 28;
      ctx.fillStyle = 'rgba(10, 2, 4, 0.8)';
      ctx.fillText('PHASE 2', cx + 3, cy - 10 + 3);
      ctx.shadowBlur = 0;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(10, 2, 4, 0.85)';
      ctx.strokeText('PHASE 2', cx, cy - 10);
      ctx.fillStyle = '#ff9080';
      ctx.fillText('PHASE 2', cx, cy - 10);
      // Subtitle: boss name + "AWAKENED"
      ctx.font = 'italic bold 18px Georgia, serif';
      ctx.fillStyle = '#ffd0c0';
      const subtitle = (phaseIntroBoss.def.displayName || 'THE BOSS') + ' — AWAKENED';
      ctx.fillText(subtitle, cx, cy + 40);
      ctx.restore();
    } else if (barH > 12) {
      // Compact AWAKENED tag inside the bottom letterbox. Renders only
      // once the bar is wide enough to fit the text without clipping.
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = 'italic bold 12px Georgia, serif';
      ctx.fillStyle = '#ff9080';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tag = '— AWAKENED —';
      ctx.fillText(tag, w / 2, h - barH / 2);
      ctx.restore();
    }
  }

  // Floor intro card — implementation in floorCardRender.js. Self-gates on
  // floorCardTime/Name so we don't need a guard here.
  drawFloorCard(ctx, canvas, { floorCardTime, floorCardTotal, floorCardName, floorCardBackdrop, floorCardRoman, floorCardFlavor });

  // Room-entry label — floats up and fades out over ~1.8s (hidden while floor card shows)
  if (floorCardTime <= 0 && roomLabelTime > 0 && roomLabelText) {
    const r = roomLabelTime / 1.8;
    const alpha = r > 0.8 ? (1 - r) * 5 : r > 0.2 ? 1 : r / 0.2;
    const yOff = (1 - r) * 24;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    const tx = canvas.width / 2;
    const ty = canvas.height * 0.28 + yOff;
    // Italic serif title — unified manuscript grammar. No solid backdrop;
    // bloom + shadow provide readability over the world.
    ctx.font = 'italic 30px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.95)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = roomLabelColor;
    ctx.fillText(roomLabelText, tx, ty);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    // Diamond flanks — ornamental grammar matching overlays.
    const tw = ctx.measureText(roomLabelText).width;
    ctx.fillStyle = roomLabelColor;
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha)) * 0.7;
    for (const dx of [tx - tw / 2 - 18, tx + tw / 2 + 18]) {
      ctx.save();
      ctx.translate(dx, ty);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-3, -3, 6, 6);
      ctx.restore();
    }
    ctx.restore();
  }

  // Transition wipe — directional sweep w/ gold leading-edge "page fold".
  // Leading edge gets a hairline of gold + a diamond flourish at the
  // horizontal midpoint, so the transition reads as a page being turned
  // rather than a black bar sliding in. Matches the manuscript grammar.
  const ta = transitionAlpha();
  if (ta > 0) {
    const W = canvas.width, H = canvas.height;
    const entry = transition.entryFrom;
    ctx.save();
    // Determine which edge the leading line sits on based on phase + direction.
    let edgeY = 0;
    let direction = 1;     // +1 = leading edge moves down, -1 = moves up
    if (transition.phase === 'out') {
      const headingNorth = entry === 'south';
      const sweepH = ta * H;
      ctx.fillStyle = 'rgba(2, 1, 6, 0.96)';
      if (headingNorth) {
        ctx.fillRect(0, 0, W, sweepH);
        edgeY = sweepH;
        direction = 1;
      } else {
        ctx.fillRect(0, H - sweepH, W, sweepH);
        edgeY = H - sweepH;
        direction = -1;
      }
      // Soft gradient on leading edge
      const gradH = 80;
      const gg = direction === 1
        ? ctx.createLinearGradient(0, edgeY, 0, edgeY + gradH)
        : ctx.createLinearGradient(0, edgeY, 0, edgeY - gradH);
      gg.addColorStop(0, 'rgba(2, 1, 6, 0.96)');
      gg.addColorStop(1, 'rgba(2, 1, 6, 0)');
      ctx.fillStyle = gg;
      if (direction === 1) ctx.fillRect(0, edgeY, W, gradH);
      else ctx.fillRect(0, edgeY - gradH, W, gradH);
    } else {
      const arrivedFromSouth = entry === 'south';
      const retreatH = ta * H;
      ctx.fillStyle = 'rgba(2, 1, 6, 0.96)';
      if (arrivedFromSouth) {
        ctx.fillRect(0, 0, W, retreatH);
        edgeY = retreatH;
        direction = 1;
      } else {
        ctx.fillRect(0, H - retreatH, W, retreatH);
        edgeY = H - retreatH;
        direction = -1;
      }
      const gradH = 80;
      const gg = direction === 1
        ? ctx.createLinearGradient(0, edgeY, 0, edgeY + gradH)
        : ctx.createLinearGradient(0, edgeY, 0, edgeY - gradH);
      gg.addColorStop(0, 'rgba(2, 1, 6, 0.96)');
      gg.addColorStop(1, 'rgba(2, 1, 6, 0)');
      ctx.fillStyle = gg;
      if (direction === 1) ctx.fillRect(0, edgeY, W, gradH);
      else ctx.fillRect(0, edgeY - gradH, W, gradH);
    }
    // GOLD LEADING EDGE — thin hairline + central diamond flourish, only
    // visible while the sweep is in motion (edgeY not at an extreme).
    if (edgeY > 2 && edgeY < H - 2) {
      // Fade intensity based on how far from either edge the sweep is
      const edgeFade = Math.min(1, Math.min(edgeY, H - edgeY) / 80);
      ctx.globalAlpha = edgeFade * 0.85;
      // Gold hairline across the full width
      const lineGrad = ctx.createLinearGradient(0, edgeY, W, edgeY);
      lineGrad.addColorStop(0, 'rgba(201,168,106,0)');
      lineGrad.addColorStop(0.5, 'rgba(244,217,160,0.9)');
      lineGrad.addColorStop(1, 'rgba(201,168,106,0)');
      ctx.fillStyle = lineGrad;
      ctx.fillRect(0, edgeY - 0.5, W, 1);
      // Central diamond flourish
      ctx.fillStyle = '#f4d9a0';
      ctx.save();
      ctx.translate(W / 2, edgeY);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
      // Soft glow around diamond
      const glow = ctx.createRadialGradient(W / 2, edgeY, 2, W / 2, edgeY, 60);
      glow.addColorStop(0, 'rgba(244,217,160,0.35)');
      glow.addColorStop(1, 'rgba(244,217,160,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(W / 2 - 60, edgeY - 60, 120, 120);
    }
    ctx.restore();
  }

  // Level-up modal — drawn ABOVE everything else (HUD, ceremony, etc.)
  // because it's a hard pause point. The modal has its own backdrop dim
  // and 3 cards. Gameplay paused via tick gating below.
  if (isLevelUpModalOpen()) {
    updateLevelUpModalMouse(mouse.x, mouse.y, canvas.width, canvas.height);
    drawLevelUpModal(ctx, canvas.width, canvas.height);
  }
}

// Simple animated background for the main menu (dust particles + dark gradient)
// ============================================================================
// MENU AMBIENT LIFE — drifting embers rising from below, flickering edge
// torch halos, and faint ruin silhouettes at the screen edges. The menu is
// the first impression; this transforms it from "void" to "place."
// ============================================================================
const menuEmbers = [];
let _menuFlickerT = 0;

function updateMenuAmbient(dt) {
  _menuFlickerT += dt;
  // Spawn new embers from the lower edge. Rate scales with canvas width so
  // ultrawide screens don't look sparse.
  const spawnRate = 2.2 * (canvas.width / 1280);
  if (Math.random() < dt * spawnRate) {
    menuEmbers.push({
      x: Math.random() * canvas.width,
      y: canvas.height + 8,
      vx: (Math.random() - 0.5) * 10,
      vy: -(22 + Math.random() * 36),
      life: 5 + Math.random() * 3,
      maxLife: 5 + Math.random() * 3,
      size: 1.2 + Math.random() * 1.5,
      // Mostly warm gold, occasional ember red
      color: Math.random() < 0.28 ? '#ff8050' : '#ffd680',
    });
  }
  // Update + cull
  for (let i = menuEmbers.length - 1; i >= 0; i--) {
    const e = menuEmbers[i];
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    // Gentle lateral drift — embers rise in lazy curves, not straight lines
    e.vx += (Math.sin(_menuFlickerT * 0.8 + e.y * 0.01) - e.vx * 0.1) * dt * 4;
    // Slowing as they rise (like real hot air cooling)
    e.vy *= (1 - dt * 0.12);
    e.life -= dt;
    if (e.life <= 0 || e.y < -20) menuEmbers.splice(i, 1);
  }
  // Cap pool size defensively
  if (menuEmbers.length > 60) menuEmbers.splice(0, menuEmbers.length - 60);
}

function drawMenuEmbers(ctx) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const e of menuEmbers) {
    const lifeT = Math.min(1, e.life / e.maxLife);
    const a = lifeT > 0.8 ? (1 - lifeT) * 5 : lifeT * 1.2;    // fade in bottom, fade out top
    ctx.globalAlpha = Math.max(0, Math.min(1, a)) * 0.85;
    ctx.fillStyle = e.color;
    // Ember body
    ctx.fillRect(e.x - e.size/2, e.y - e.size/2, e.size, e.size);
    // Subtle trail — a dim rectangle below the ember for motion
    ctx.globalAlpha *= 0.4;
    ctx.fillRect(e.x - e.size/4, e.y + e.size, e.size/2, e.size * 2);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawMenuEdgeTorches(ctx) {
  // Guard: ONLY render when the main-menu DOM overlay is actually visible.
  // Anything else (hamlet, live run, pause, etc.) gets nothing. This is a
  // belt-and-suspenders check — the caller (renderMenuBg) already only
  // runs from the tick's menu-visible early return, but somewhere the
  // torch cones were still leaking into the hamlet canvas.
  if (!menuEl || menuEl.style.display === 'none') return;
  // Two torch columns flanking the content. Flicker via layered sine waves.
  const now = _menuFlickerT;
  const flickL = 0.78 + 0.22 * (Math.sin(now * 7.3) * 0.5 + Math.sin(now * 11.7) * 0.4 + Math.sin(now * 17.1) * 0.3) / 1.2;
  const flickR = 0.78 + 0.22 * (Math.sin(now * 6.9 + 1.3) * 0.5 + Math.sin(now * 12.2 + 2.1) * 0.4 + Math.sin(now * 16.5 + 0.7) * 0.3) / 1.2;
  const torchY = canvas.height * 0.42;
  const torchRadius = canvas.height * 0.55;
  // Left torch halo
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const gL = ctx.createRadialGradient(-20, torchY, 20, -20, torchY, torchRadius);
  gL.addColorStop(0, `rgba(255, 170, 80, ${(0.28 * flickL).toFixed(3)})`);
  gL.addColorStop(0.4, `rgba(255, 140, 60, ${(0.12 * flickL).toFixed(3)})`);
  gL.addColorStop(1, 'rgba(255, 140, 60, 0)');
  ctx.fillStyle = gL;
  ctx.fillRect(-torchRadius, torchY - torchRadius, torchRadius * 2, torchRadius * 2);
  // Right torch halo
  const gR = ctx.createRadialGradient(canvas.width + 20, torchY, 20, canvas.width + 20, torchY, torchRadius);
  gR.addColorStop(0, `rgba(255, 170, 80, ${(0.28 * flickR).toFixed(3)})`);
  gR.addColorStop(0.4, `rgba(255, 140, 60, ${(0.12 * flickR).toFixed(3)})`);
  gR.addColorStop(1, 'rgba(255, 140, 60, 0)');
  ctx.fillStyle = gR;
  ctx.fillRect(canvas.width - torchRadius, torchY - torchRadius, torchRadius * 2, torchRadius * 2);
  ctx.restore();
  // Faint god-ray cones falling from the torch sources, catching dust
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const rayAlphaL = 0.10 * flickL;
  const rayAlphaR = 0.10 * flickR;
  // Left cone
  const rayGL = ctx.createLinearGradient(-20, torchY, canvas.width * 0.18, canvas.height);
  rayGL.addColorStop(0, `rgba(255, 170, 90, ${rayAlphaL.toFixed(3)})`);
  rayGL.addColorStop(1, 'rgba(255, 170, 90, 0)');
  ctx.fillStyle = rayGL;
  ctx.beginPath();
  ctx.moveTo(-40, torchY - 10);
  ctx.lineTo(0, torchY);
  ctx.lineTo(canvas.width * 0.18, canvas.height);
  ctx.lineTo(-80, canvas.height);
  ctx.closePath();
  ctx.fill();
  // Right cone
  const rayGR = ctx.createLinearGradient(canvas.width + 20, torchY, canvas.width * 0.82, canvas.height);
  rayGR.addColorStop(0, `rgba(255, 170, 90, ${rayAlphaR.toFixed(3)})`);
  rayGR.addColorStop(1, 'rgba(255, 170, 90, 0)');
  ctx.fillStyle = rayGR;
  ctx.beginPath();
  ctx.moveTo(canvas.width + 40, torchY - 10);
  ctx.lineTo(canvas.width, torchY);
  ctx.lineTo(canvas.width * 0.82, canvas.height);
  ctx.lineTo(canvas.width + 80, canvas.height);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawMenuSilhouettes(ctx) {
  // Distant ruin silhouettes at far left and right — broken columns that
  // suggest a real place beyond the menu frame. Very low alpha so they
  // don't compete with the main content.
  ctx.save();
  ctx.fillStyle = 'rgba(12, 8, 16, 0.85)';
  const colY = canvas.height * 0.35;
  const colH = canvas.height * 0.55;
  // Left: two broken columns
  for (const [x, sw, h] of [[40, 28, colH * 0.75], [95, 20, colH * 0.6]]) {
    ctx.beginPath();
    ctx.moveTo(x, colY);
    ctx.lineTo(x + sw, colY);
    ctx.lineTo(x + sw - 2, colY + h - 6);
    ctx.lineTo(x + sw + 4, colY + h);
    ctx.lineTo(x - 4, colY + h);
    ctx.lineTo(x + 2, colY + h - 6);
    ctx.closePath();
    ctx.fill();
  }
  // Right: mirror
  for (const [x, sw, h] of [[canvas.width - 68, 28, colH * 0.75], [canvas.width - 115, 20, colH * 0.6]]) {
    ctx.beginPath();
    ctx.moveTo(x, colY);
    ctx.lineTo(x + sw, colY);
    ctx.lineTo(x + sw - 2, colY + h - 6);
    ctx.lineTo(x + sw + 4, colY + h);
    ctx.lineTo(x - 4, colY + h);
    ctx.lineTo(x + 2, colY + h - 6);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function renderMenuBg() {
  ctx.fillStyle = '#0a0610';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Soft central radial glow
  const g = ctx.createRadialGradient(canvas.width/2, canvas.height*0.55, 80, canvas.width/2, canvas.height*0.55, canvas.height*0.8);
  g.addColorStop(0, 'rgba(120, 60, 140, 0.12)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Ruin silhouettes (drawn before torches so torches light them)
  drawMenuSilhouettes(ctx);
  // Edge torch halos + god-rays
  drawMenuEdgeTorches(ctx);
  // Dust motes and rising embers — layered last so they read on top
  drawDust(ctx);
  drawMenuEmbers(ctx);
  // Apply bloom to make torches, embers, and title feel lit
  applyBloom(ctx, canvas, 0.45);
}

// ============================================================================
// CANONICAL ZONE RUN — module-level entry point.
//
// Phase 4 unification: extracted from the debug-hooks closure so menu/hamlet
// code paths can call it without going through `window.__startZoneRun`.
// loadBakedZone + enterCanonicalRun are the production entry points; the
// debug hooks (`__startZoneRun`, `__loadCryptSample`) are thin wrappers.
// ============================================================================

/** Load a baked TMX zone into the live `room` object. Mutates room state +
 *  hero spawn, applies zone profile (biome/music/ambient/wash). Returns
 *  { ok, meta, zoneName, sp } or { error }. Pure data transformation —
 *  doesn't start the wave runner; caller decides the next step.
 */
function loadBakedZone(which) {
  const baseKey =
    which === 'ruins' ? 'room_ruins_sample' :
    which === 'mountain' ? 'room_mountain_sample' :
    which === 'volcano' ? 'room_volcano_sample' :
    which === 'crypt' ? 'room_crypt_sample' :
    which === 'sample' ? 'room_crypt_sample' :
    which === 'chamber_01' ? 'room_crypt_chamber_01' :
    which === 'main_hall' ? 'room_crypt_main_hall' :
    which === 'cemetery2' ? 'room_cemetery_sample_2' :
    'room_cemetery_sample';

  const zoneName =
    which === 'ruins' ? 'ruins' :
    which === 'mountain' ? 'mountain' :
    which === 'volcano' ? 'volcano' :
    (which === 'crypt' || which === 'sample' || which === 'chamber_01' || which === 'main_hall') ? 'crypt' :
    'cemetery';

  applyZoneProfile(zoneName);
  setOverlayZone(zoneName);

  const img = imageCache[baseKey];
  const animsImg = imageCache[baseKey + '_anims'];
  const meta = imageCache[baseKey + '_meta'];
  if (!img || !animsImg || !meta) {
    return { error: 'baked room not fully loaded',
      hasImg: !!img, hasAnims: !!animsImg, hasMeta: !!meta };
  }

  room.w = meta.width;
  room.h = meta.height;
  room.kind = 'tmx_crypt_sample';
  room.shape = 'rect';
  room.cleared = false;
  room.bakedImage = img;
  room.bakedAnimsImage = animsImg;
  room.bakedTileSize = meta.tileSize;
  room.bakedAnimCellW = meta.animationAtlas.cellWidth;
  room.bakedAnimCellH = meta.animationAtlas.cellHeight;
  room.bakedAnimations = meta.animations;
  room.bakedProps = meta.animatedProps;
  room.bakedCollision = meta.collisionGrid;

  room.tiles = [];
  for (let y = 0; y < meta.height; y++) {
    const tileRow = new Array(meta.width);
    for (let x = 0; x < meta.width; x++) {
      const cell = meta.collisionGrid[y][x];
      tileRow[x] = (cell && cell.rects && cell.rects.length) ? 'wall' : 'floor';
    }
    room.tiles.push(tileRow);
  }
  room.decor = [];
  room.spawns = [];
  roomTorches.length = 0;
  roomSpikes.length = 0;
  roomFirePools.length = 0;
  roomUrns.length = 0;
  roomChests.length = 0;
  roomDecorPillars.length = 0;
  invalidateTileCache();

  const sp = meta.spawn || { x: Math.floor(meta.width / 2), y: Math.floor(meta.height / 2) };
  hero.x = sp.x * TILE + TILE / 2;
  hero.y = sp.y * TILE + TILE / 2;

  return { ok: true, meta, baseKey, zoneName, sp };
}

/** Begin a canonical 5-zone run. Wires XP/perks/level-up callbacks then
 *  enters the first zone. Recursive zone-to-zone transition via the
 *  portal's onEnter callback. Used by:
 *    - menu's primary CTA (first-time + returning paths)
 *    - hamlet descent portal
 *    - debug `window.__startZoneRun`
 */
function enterCanonicalRun(zoneName = 'ruins') {
  const enc = getZoneEncounters(zoneName);
  if (!enc) return { error: `no encounters config for: ${zoneName}` };

  // ── XP / perks plumbing ──────────────────────────────────────
  // Reset perk stacks + XP only on the FIRST zone (so debug calls
  // mid-run with __startZoneRun('volcano') don't lose progress).
  if (zoneName === 'ruins' || !window.__zoneRunInitialized) {
    resetXp();
    resetPerks();
    window.__zoneRunInitialized = true;
  }
  window.__onEnemyKilled = (enemy) => {
    try { dropXpGemFromEnemy(enemy); } catch (_e) {}
  };
  setOnLevelUp((newLevel) => {
    openLevelUpModal(newLevel, () => { /* perk applied; resume play */ });
  });

  // ── Internal zone-to-zone transition (recursive via portal onEnter) ──
  const _enterZone = (zname) => {
    const zEnc = getZoneEncounters(zname);
    if (!zEnc) return { error: `no encounters: ${zname}` };

    clearZonePortal();
    stopZoneRun();
    clearEnemies();

    // Phase 1 fix B2 — null stale legacy DAG state.
    currentGraph = null;
    currentNodeId = null;

    const loadResult = loadBakedZone(zname);
    if (loadResult && loadResult.error) {
      console.warn('[enterCanonicalRun] load failed', loadResult);
      return loadResult;
    }

    camera.zoom = zEnc.cameraZoom || 1.0;

    startZoneRun(zname, {
      onComplete: ({ bossPos }) => {
        const next = getNextZone(zname);
        const px = bossPos ? bossPos.x : (zEnc.bossLocation.x + 0.5) * TILE;
        const py = bossPos ? bossPos.y : (zEnc.bossLocation.y + 0.5) * TILE;
        // Boss XP burst — fan of large gems at boss location.
        const burstByZone = { ruins: 8, cemetery: 9, crypt: 11, mountain: 12, volcano: 14 };
        try { dropBossXpBurst(px, py, burstByZone[zname] || 10); } catch (_e) {}

        // Phase 4 — boss kill relic drop. Spawn a tier-scaled pedestal at
        // the boss's position, reusing the existing pedestal UI. Walking
        // onto it offers a 3-card relic choice. The portal spawns AFTER
        // the player picks (or skips) the relic — so the reward feels
        // earned, not auto-skipped.
        try {
          // Tier scales with zone progression: floor 1-2 = rare, 3-4 = legendary,
          // 5 = mythic. Reuses spawnRelicOffer (existing pedestal flow).
          const tierByZone = { ruins: 'rare', cemetery: 'rare',
                                crypt: 'legendary', mountain: 'legendary',
                                volcano: 'mythic' };
          const minTier = tierByZone[zname] || 'rare';
          // Place the pedestal slightly offset from boss death pos (left)
          // so it sits next to the portal (right) — both visible to the
          // player as a "two-step reward" moment.
          spawnRelicOffer(5, { minTier, placeAt: { wx: px - 60, wy: py } });
        } catch (e) { console.warn('boss relic drop failed', e); }

        spawnZonePortal(px + 36, py, {
          label: next ? next : 'victory',
          onEnter: () => {
            if (next) {
              _enterZone(next);
            } else {
              stopZoneRun();
              clearZonePortal();
              console.log('%c[zone run] all 5 zones cleared!',
                'color:#ffd070;font-weight:bold;font-size:14px');
              // Phase 4 stub — return to hamlet on full clear.
              showHamlet();
            }
          },
        });
      },
    });
    return { ok: true, zone: zname, waves: zEnc.waves.length };
  };

  return _enterZone(zoneName);
}

async function boot() {
  initInput(canvas);
  setMasterVolume(0.5);
  setMusicVolume(0.3);
  initMusic();
  loadMeta();
  loadCurses();
  loadAchievements();
  loadRecords();
  loadSettings();
  // Mobile-mode detection — toggles `body.mobile-controls` based on the
  // device + the user's settings.mobileControls preference. Must run
  // AFTER loadSettings so the setting's value is in effect.
  applyMobileMode();
  // Sync the camera baseline zoom to the resolved mobile-mode state.
  // Mobile renders the canvas at much smaller actual pixel sizes than
  // desktop (e.g. ~350px tall on a 5-inch landscape phone vs 1080+ on
  // a monitor), so a 1.40× baseline zoom keeps the hero / doors / combat
  // readable at hand-held distances. Desktop stays at 1.0.
  setBaselineZoom(document.body.classList.contains('mobile-controls') ? MOBILE_BASELINE_ZOOM : DESKTOP_BASELINE_ZOOM);
  installFirstTouchFallback();
  // Performance mode — resolved here so postfx.js can early-return on
  // mid-range mobile / low-core-count devices. Default 'auto' enables
  // when hardwareConcurrency <= 4 OR primary touch device.
  const _perf = resolvePerfMode();
  setPostfxPerfMode(_perf);
  setAtmosphericPerfMode(_perf);
  // Wire the virtual-control DOM (joystick + action buttons). Listeners
  // are always installed; the overlay's CSS visibility is gated by
  // body.mobile-controls so desktop users never see/feel them.
  initMobileControls();
  loadDaily();
  loadTips();
  loadFirstSeen();
  loadDiscoveredFusions();
  loadRuin();
  loadCodex();
  loadSeenRelics();
  loadSeenTarot();
  loadMemories();          // Memory Weave: unlocked set + last selection
  loadDeathTips();         // Phase 4: per-killer death counts → tips
  loadHamletState();       // Living Hamlet: NPC arc stages + service counts
  // First-time setup — Keeper is always present. Any higher-tier NPCs whose
  // unlock conditions are already met will arrive here too (catches players
  // who had many runs before the hamlet existed).
  refreshNpcPresence(records, stats, { seenRelicIds });
  try {
    await loadAll((n, total) => { loadingEl.textContent = 'Loading ' + n + '/' + total + '…'; });
  } catch (err) {
    loadingEl.textContent = 'Load error: ' + err.message;
    console.error(err);
    return;
  }
  loadingEl.style.display = 'none';
  // Show main menu instead of jumping into a run
  showMainMenu();
  // Kick off the tick loop so the menu renders + music can start
  lastT = performance.now();
  requestAnimationFrame(tick);
}

// Dev-only debug hooks — see src/debug.js. Stripped from production builds
// via `import.meta.env.DEV` so `__jumpToBoss` etc. never ship to Steam.
if (import.meta.env.DEV) {
  const { installDebugHooks } = await import('./debug.js');
  installDebugHooks({
    // Inspect game state
    dbg: () => ({
      hero, enemies, camera, running, roomIndex, floor, room, transition,
      bossIntroTime, floorCardTime, phaseIntroTime, paused,
      currentGraph, currentNodeId,
      roomDoors,           // direct ref to the doorPortals.js array
      prevRoom,            // residue snapshot of the room hero just left
    }),

    // Zero all active intros — useful for A/B'ing boss cinematics cleanly
    clearIntros: () => {
      floorCardTime = 0;
      phaseIntroTime = 0;
      bossIntroTime = 0;
      bossIntroBoss = null;
    },

    // Skip menu + wake cinematic, jump straight into a fresh run
    startRun: () => {
      hideAllOverlays();
      startRun();
    },

    // Reset the first-run gate so the heartbeat intro + Keeper wake fire
    // again on the next AWAKEN. Drops the `ethera:first_seen:v1` key (the
    // profile-prefix patch routes it to the active profile's namespace
    // automatically) and reloads so the in-memory `seen` Set in
    // firstSeen.js re-hydrates from disk. Intended for testing the
    // restructured intro flow — without this, you'd have to delete the
    // active profile to re-trigger the cinematics.
    resetFirstRun: () => {
      try { localStorage.removeItem('ethera:first_seen:v1'); } catch (_e) {}
      window.location.reload();
    },

    // Push a notification onto the unified top-right rail. Useful for
    // visually testing the rail stacking + per-kind styling without
    // having to actually trigger gameplay events.
    //   __testNotification('common pickup', 'pickup', 'common')
    //   __testNotification('hello world', 'tip')
    //   __testNotification('Sworn Reply', 'fusion', null, 'two relics fused')
    testNotification: (title = 'Test entry', kind = 'tip', tier = null, body = '') => {
      pushNotification({ kind, tier, title, body: body || (tier ? 'tier ' + tier : '') });
      return { ok: true, kind, tier };
    },

    // Fire 4 tips at once — verifies the staggering behavior. Tips have
    // concurrency cap 1 + 0.8s gap, so they should play one-at-a-time
    // in order. The tutorial-dump scenario the player flagged.
    testTipBurst: () => {
      pushNotification({ kind: 'tip', body: 'First tip — should appear immediately.' });
      pushNotification({ kind: 'tip', body: 'Second tip — should wait its turn.' });
      pushNotification({ kind: 'tip', body: 'Third tip — still waiting.' });
      pushNotification({ kind: 'tip', body: 'Fourth tip — last in line.' });
      return { ok: true, queued: 4 };
    },

    // Inspect / force mobile mode without a real phone — useful for
    // testing the virtual-control overlay on desktop. Reads the three
    // detection layers + the resolved state. Pass 'on' / 'off' / 'auto'
    // to override settings.mobileControls and re-apply.
    //   __mobileMode()           -> { coarse, noHover, override, resolved }
    //   __mobileMode('on')       -> forces virtual controls visible
    //   __mobileMode('auto')     -> back to auto-detect
    mobileMode: (override) => {
      if (override === 'on' || override === 'off' || override === 'auto') {
        settings.mobileControls = override;
        applyMobileMode();
        setBaselineZoom(document.body.classList.contains('mobile-controls') ? MOBILE_BASELINE_ZOOM : DESKTOP_BASELINE_ZOOM);
      }
      const coarse = window.matchMedia('(pointer: coarse)').matches;
      const noHover = window.matchMedia('(hover: none)').matches;
      return {
        coarse,
        noHover,
        autoDetect: coarse && noHover,
        override: settings.mobileControls,
        resolved: document.body.classList.contains('mobile-controls'),
      };
    },

    // Synchronously advance the transition state machine to a target room.
    // Fast-forwards through fade-out → loadRoom → fade-in.
    forceGoto: (targetIdx) => {
      beginTransition(targetIdx, 'south');
      updateTransition(0.4);
      updateTransition(0.4);
      return {
        roomIndex,
        kind: floor[roomIndex]?.kind,
        enemies: enemies.length,
        heroPos: [hero.x | 0, hero.y | 0],
      };
    },

    // Real boss-room entry via graph + loadRoom (fires data.kind==='boss'
    // intro path, post-FX stack, everything). For testing the cinematic
    // in-context. Contrast with `testBossIntro` which is synthetic.
    jumpToBoss: () => {
      if (!currentGraph) return { error: 'no graph — call __startRun first' };
      const bossNode = currentGraph.nodes.find((n) => n.kind === 'boss');
      if (!bossNode) return { error: 'no boss node in graph' };
      const targetIdx = floor.length;
      floor.push(bossNode.roomData);
      currentNodeId = bossNode.id;
      bossNode.current = true;
      beginTransition(targetIdx, 'south');
      updateTransition(0.4);
      updateTransition(0.4);
      return { ok: true, roomKind: floor[targetIdx]?.kind, roomIndex };
    },

    // Walk to ANY graph node by id (same mechanism as __jumpToBoss but
    // for arbitrary nodes). Used by the playthrough-test harness to
    // walk through every room kind on a floor without manual hero
    // door-crossings. Returns the new room's kind + idx for chaining.
    walkToNode: (nodeId) => {
      if (!currentGraph) return { error: 'no graph — call __startRun first' };
      const node = currentGraph.nodes.find((n) => n.id === nodeId);
      if (!node) return { error: 'no node with id ' + nodeId };
      const targetIdx = floor.length;
      floor.push(node.roomData);
      currentNodeId = nodeId;
      // Mark current on all nodes so the map screen reads consistent
      currentGraph.nodes.forEach((n) => { n.current = (n.id === nodeId); });
      beginTransition(targetIdx, 'south');
      updateTransition(0.4);
      updateTransition(0.4);
      return { ok: true, roomKind: floor[targetIdx]?.kind, actualKind: node.actualKind, roomIndex };
    },

    // Kill all enemies in the current room — bypasses the actual fight
    // for testing room-clear flow without playing through combat.
    killAllEnemies: () => {
      let n = 0;
      for (const e of enemies) {
        if (!e.dead && !e.boss) { e.hp = 0; n++; }
      }
      return { killed: n, alive: enemies.filter(e => !e.dead).length };
    },

    // Synthetic boss-intro trigger — sets the intro timer directly without
    // changing rooms or spawning the enemy. Quickest way to visually
    // inspect the intro render itself.
    testBossIntro: (type = 'orc', durationSec = 2.2) => {
      const def = ENEMY_TYPES[type];
      if (!def) {
        return { error: 'unknown enemy type: ' + type, available: Object.keys(ENEMY_TYPES) };
      }
      bossIntroBoss = { type, def, boss: true, x: 0, y: 0, hp: 100, maxHp: 100 };
      bossIntroTime = durationSec;
      return { triggered: true, type, durationSec, portraitKey: ENEMY_PORTRAIT_PATH[type] };
    },

    // Trigger a relic pickup banner in-place — spawns a pedestal under the
    // hero so the next tick fires the full pickup path (applyRelic + banner).
    // Usage: __testPickup('hourglass_of_respite')
    testPickup: (relicId = 'hourglass_of_respite') => {
      const def = RELIC_DEFS[relicId];
      if (!def) return { error: 'unknown relic: ' + relicId, available: Object.keys(RELIC_DEFS) };
      clearPedestals();
      pedestals.push({
        x: hero.x, y: hero.y,
        relic: def,
        tier: relicTier(def.id),
        picked: false, bob: 0, glow: 0, hpCost: 0,
      });
      return { ok: true, relic: def.name, descLen: def.desc.length };
    },

    // Force the pickup-flash banner without applying the relic. Seeds the
    // banner at peak-alpha; the normal decay (-dt per tick) still runs, so
    // you have ~1.4s of peak window before fade-out. Good for screenshots.
    // Usage: __testPickupFlash('hourglass_of_respite', 'rare')
    testPickupFlash: (relicId = 'hourglass_of_respite', tier) => {
      const def = RELIC_DEFS[relicId];
      if (!def) return { error: 'unknown relic: ' + relicId };
      setPickupFlashForTest(def, tier || relicTier(def.id));
      return { ok: true, relic: def.name, tier: tier || relicTier(def.id) };
    },

    // THE WATCHER — force a test utterance (queued like any real trigger,
    // defers if a ceremony is onscreen). Pass a string to speak it directly;
    // omit to hear the default test line.
    // Usage: __testWatcher() or __testWatcher('You are predictable.')
    testWatcher: (text) => {
      watcherTestSpeak(text);
      return watcherSnapshot();
    },

    // THE WATCHER — clear persisted state so first-time milestones fire
    // again. Useful for testing the full milestone progression.
    watcherReset: () => {
      watcherResetForTesting();
      return { ok: true };
    },

    // Inspect the Watcher's persisted + per-run state.
    watcherState: () => watcherSnapshot(),

    // Spawn a slime_spitter at the hero's position for testing the
    // ranged slime variant. Confirms (a) the def is registered,
    // (b) the cast sheet loads, (c) updateRanged dispatches to the
    // acid projectile path. Usage: __spawnSpitter()
    spawnSpitter: () => {
      const def = ENEMY_TYPES['slime_spitter'];
      if (!def) return { error: 'slime_spitter def not found', defs: Object.keys(ENEMY_TYPES).filter(k => k.startsWith('slime')) };
      const offsetX = 80;
      spawnEnemy('slime_spitter', hero.x + offsetX, hero.y);
      return {
        ok: true,
        type: 'slime_spitter',
        attackSheet: def.attackSheet,
        projectile: def.projectile,
        attackRange: def.attackRange,
        spawnedAt: { x: hero.x + offsetX, y: hero.y },
      };
    },

    // ── _loadBakedZone — internal helper ────────────────────────────
    // Loads a baked TMX room into the live `room` object. Used by both
    // `loadCryptSample` (debug + 4-enemy spawn) and `startZoneRun`
    // (production-shape, with the wave runner driving spawns).
    //
    // Phase 1 fix P3: previously startZoneRun reached through
    // `window.__loadCryptSample` to share this code, creating a circular
    // debug-hook dependency. Extracted here as a private closure so both
    // entry points share the same path without going through window.*.
    //
    // Returns { ok, meta, baseKey, zoneName, sp } or { error }.
    _loadBakedZone: (which) => {
      const baseKey =
        which === 'ruins' ? 'room_ruins_sample' :
        which === 'mountain' ? 'room_mountain_sample' :
        which === 'volcano' ? 'room_volcano_sample' :
        which === 'crypt' ? 'room_crypt_sample' :
        which === 'sample' ? 'room_crypt_sample' :
        which === 'chamber_01' ? 'room_crypt_chamber_01' :
        which === 'main_hall' ? 'room_crypt_main_hall' :
        which === 'cemetery2' ? 'room_cemetery_sample_2' :
        'room_cemetery_sample';

      const zoneName =
        which === 'ruins' ? 'ruins' :
        which === 'mountain' ? 'mountain' :
        which === 'volcano' ? 'volcano' :
        (which === 'crypt' || which === 'sample' || which === 'chamber_01' || which === 'main_hall') ? 'crypt' :
        'cemetery';

      applyZoneProfile(zoneName);
      setOverlayZone(zoneName);

      const img = imageCache[baseKey];
      const animsImg = imageCache[baseKey + '_anims'];
      const meta = imageCache[baseKey + '_meta'];
      if (!img || !animsImg || !meta) {
        return { error: 'baked room not fully loaded',
          hasImg: !!img, hasAnims: !!animsImg, hasMeta: !!meta };
      }

      room.w = meta.width;
      room.h = meta.height;
      room.kind = 'tmx_crypt_sample';
      room.shape = 'rect';
      room.cleared = false;
      room.bakedImage = img;
      room.bakedAnimsImage = animsImg;
      room.bakedTileSize = meta.tileSize;
      room.bakedAnimCellW = meta.animationAtlas.cellWidth;
      room.bakedAnimCellH = meta.animationAtlas.cellHeight;
      room.bakedAnimations = meta.animations;
      room.bakedProps = meta.animatedProps;
      room.bakedCollision = meta.collisionGrid;

      room.tiles = [];
      for (let y = 0; y < meta.height; y++) {
        const tileRow = new Array(meta.width);
        for (let x = 0; x < meta.width; x++) {
          const cell = meta.collisionGrid[y][x];
          tileRow[x] = (cell && cell.rects && cell.rects.length) ? 'wall' : 'floor';
        }
        room.tiles.push(tileRow);
      }
      room.decor = [];
      room.spawns = [];
      roomTorches.length = 0;
      roomSpikes.length = 0;
      roomFirePools.length = 0;
      roomUrns.length = 0;
      roomChests.length = 0;
      roomDecorPillars.length = 0;
      invalidateTileCache();

      const sp = meta.spawn || { x: Math.floor(meta.width / 2), y: Math.floor(meta.height / 2) };
      hero.x = sp.x * TILE + TILE / 2;
      hero.y = sp.y * TILE + TILE / 2;

      return { ok: true, meta, baseKey, zoneName, sp };
    },

    // Path-A demo — load a baked Tiled chamber. Five-zone progression:
    // ruins → cemetery → crypt → mountain → volcano.
    //
    // Available rooms:
    //   ── 5-zone progression (canonical) ──
    //   'ruins'      — Floor 1, Ancient Ruins (40×24, sun-baked stone).
    //   'cemetery'   — Floor 2, Cemetery Sample Map (35×20, ~560 cells).
    //                  DEFAULT for back-compat.
    //   'crypt'      — Floor 3, Crypt Sample Map (35×25, ~628 cells).
    //   'mountain'   — Floor 4, Depths of the Mountain (45×54, ~2274 cells).
    //   'volcano'    — Floor 5, Volcano (90×60, ~5207 cells main component).
    //
    //   ── Legacy / variants ──
    //   'cemetery2'  — User's edited Sample Map - 2.tmx (cleaner objects).
    //   'main_hall'  — Cropped lower-half of the Crypt Sample Map.
    //   'chamber_01' — Sarcophagus chamber from Crypt example map.
    //   'sample'     — Full Crypt Sample Map (alias of 'crypt').
    //
    // Usage:
    //   __loadCryptSample()           → cemetery (default)
    //   __loadCryptSample('ruins')    → floor 1
    //   __loadCryptSample('mountain') → floor 4
    //   __loadCryptSample('volcano')  → floor 5
    loadCryptSample: (which = 'cemetery') => {
      const r = window.__loadBakedZone ? window.__loadBakedZone(which) : null;
      if (!r || r.error) return r || { error: '__loadBakedZone unavailable' };
      const { meta, sp, zoneName } = r;

      // ── End-to-end combat proof — spawn enemies in walkable cells ──
      // Flood-fill from hero's spawn cell to find all cells in the
      // SAME connected component (so enemies can actually reach the
      // hero). Pick N spread cells from that pool for enemy spawns.
      // This is the MVP proof: walk into a Tiled-baked room, see real
      // gameplay happen.
      clearEnemies();
      const visited = new Map();
      const cellKey = (x, y) => `${x},${y}`;
      const queue = [[sp.x, sp.y]];
      visited.set(cellKey(sp.x, sp.y), [sp.x, sp.y]);
      while (queue.length) {
        const [x, y] = queue.shift();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= meta.width || ny >= meta.height) continue;
          if (visited.has(cellKey(nx, ny))) continue;
          const cell = meta.collisionGrid[ny][nx];
          // A cell is "passable for enemies" if it has no rects, OR
          // its rects don't fill the whole cell (sub-cell shapes).
          let passable = !cell || !cell.rects || cell.rects.length === 0;
          if (cell && cell.rects && cell.rects.length === 1) {
            const r = cell.rects[0];
            if (r.w < meta.tileSize || r.h < meta.tileSize) passable = true;
          }
          if (!passable) continue;
          visited.set(cellKey(nx, ny), [nx, ny]);
          queue.push([nx, ny]);
        }
      }
      const reachable = [...visited.values()];
      // Pick 4 enemy spawn cells from the reachable pool, spread out
      // so they're not all clumped on the hero. Sort by distance from
      // hero, take cells from across the distribution (close, mid, far).
      reachable.sort((a, b) => {
        const da = (a[0] - sp.x) ** 2 + (a[1] - sp.y) ** 2;
        const db = (b[0] - sp.x) ** 2 + (b[1] - sp.y) ** 2;
        return da - db;
      });
      // Skip cells too close to the hero (combat starts within reach).
      const pool = reachable.filter((c) => {
        const d2 = (c[0] - sp.x) ** 2 + (c[1] - sp.y) ** 2;
        return d2 > 25;       // > 5 cells away
      });
      const enemyTypes = ['skel', 'crypt_spider', 'slime', 'crypt_spider'];
      const spawnedCount = Math.min(enemyTypes.length, pool.length);
      const stride = Math.max(1, Math.floor(pool.length / spawnedCount));
      for (let i = 0; i < spawnedCount; i++) {
        const cell = pool[Math.min(pool.length - 1, i * stride)];
        const ex = cell[0] * TILE + TILE / 2;
        const ey = cell[1] * TILE + TILE / 2;
        spawnEnemy(enemyTypes[i], ex, ey);
      }

      return {
        ok: true,
        roomSize: `${meta.width}×${meta.height} tiles`,
        worldSize: `${meta.width * TILE}×${meta.height * TILE} px`,
        animations: meta.animations.length,
        animatedProps: meta.animatedProps.length,
        components: meta.componentCount,
        largestComponent: meta.largestComponentSize,
        spawnCell: sp,
        reachableCells: reachable.length,
        enemiesSpawned: spawnedCount,
        heroAt: { x: hero.x, y: hero.y },
        zone: zoneName,
      };
    },

    // ── Walkability overlay (dev tool) ───────────────────────────────
    // Press backtick (`) to toggle the tinted-grid overlay, then click
    // cells to override walkable/blocked. Exports a sidecar JSON the
    // bake script can merge.
    toggleWalkOverlay: () => {
      const visible = toggleWalkOverlay();
      return { visible, overrides: walkOverrideCount() };
    },
    exportWalkOverrides: () => {
      const json = exportWalkOverrides();
      // Convenience: also copy to clipboard if available so the user
      // can paste it directly into a sidecar file.
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(json);
        }
      } catch (_e) { /* clipboard not available — return-string fallback */ }
      return json;
    },

    // ── Stand-and-Hold zone run (Phase 1) ─────────────────────────────
    // Starts a complete 5-zone run. Wave system spawns enemies on a
    // timer, boss arrives at the configured signature location after
    // wave 3 clears, boss death spawns a portal that advances to the
    // next zone. ruins → cemetery → crypt → mountain → volcano → win.
    //
    // Usage:
    //   __startZoneRun()             → begin at ruins
    //   __startZoneRun('volcano')    → jump to a specific zone
    startZoneRun: (zoneName = 'ruins') => {
      // Thin wrapper around enterCanonicalRun (Phase 4 — extracted to
      // module level so the menu/hamlet code paths can call it without
      // going through window.* debug hooks).
      return enterCanonicalRun(zoneName);
    },

    /** Read current zone-runner state (HUD / debug). */
    zoneRunStatus: () => ({
      runner: getZoneRunnerState(),
      portal: { active: isZonePortalActive() },
      xp: getXpDebug(),
      perks: getActivePerksDebug(),
    }),

    /** Force a level-up (for testing the modal + perks). */
    forceLevelUp: () => {
      const s = getXpDebug();
      // Add enough XP to cross the next threshold.
      const need = s.next - s.xp + 1;
      if (typeof hero.xp !== 'number') hero.xp = 0;
      hero.xp += need;
      // The XP system's _grantXp won't fire from a direct hp.xp mutation,
      // so call updateXp to nudge the level-up check via the next tick.
      // Simpler: just open the modal directly with the next level.
      openLevelUpModal((hero.level || 1) + 1, () => {
        hero.xp -= need;
      });
      return { ok: true, modalOpen: isLevelUpModalOpen() };
    },
  });
}

boot();
