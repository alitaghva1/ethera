// Slime Depths — prototype entry
// Profile/save-slot system MUST be imported first: its side-effect
// monkey-patches localStorage so every subsequent load/save in any
// module is auto-scoped to the active Volume (I/II/III). Any module
// that reads localStorage at module-body time (currently none do —
// all load funcs are lazy) would need to run after this.
import { installProfilePrefix, getActiveProfileId, listProfiles, setActiveProfile, deleteProfile, profileLabel, PROFILE_IDS } from './profile.js';
import { loadAll } from './loader.js';
import { initInput, mouse, endFrameInput } from './input.js';
import { camera, followCamera, updateCamera, screenToWorld, setCameraSize, shakeCamera, pulseZoom } from './camera.js?v=2';
import {
  buildRoomFromData, drawRoom, drawSpikes, drawFirePools, spikeDamageAt, firePoolDamageAt,
  spawnExtraFirePool, room, TILE, roomTorches,
  onDoorWorld, onPedestalWorld, consumePedestal, heroSpawnInRoom, ROOM_W, ROOM_H,
  setBiome, currentBiomePal, roomSecrets, roomNextKind, drawUrns,
} from './room.js';
import { generateFloor, MAX_FLOORS, FLOOR_ENEMY_MULS } from './floor.js?v=graph1';
// SYSTEMS PASS 2c — branching floor map. Runs now traverse a DAG instead
// of a flat 7-room array. `floor` becomes a dynamic array built up as the
// player commits to path nodes, which keeps all existing floor[roomIndex]
// call sites working unchanged.
import { generateFloorGraph, getNode as getFloorNode } from './floorGraph.js?v=graph2';
import { openFloorMap } from './mapScreen.js';
let currentGraph = null;
let currentNodeId = null;
// Re-entrancy guard: the door-transition check runs every frame while the
// hero stands at the door, so we must not queue multiple openFloorMap()
// calls — they'd stack overlays and resolve in the wrong order.
let _mapPickInFlight = false;
import { spawnEnemy, updateEnemies, drawEnemy, drawEnemyTelegraphs, enemies, clearEnemies, updateFlames, drawFlames, clearFlames, drawCorpses, loadCodex, TYPES as ENEMY_TYPES, seenEnemyTypes } from './enemies.js';
import { updateProjectiles, drawProjectiles, clearProjectiles } from './projectiles.js';
import { hero, updateHero, drawHero, resetHero, damageHero } from './hero.js';
import { updateParticles, drawParticles, updateDust, drawDust, deathBurst, sparkle, updateWeather, drawWeather, setWeatherBiome, updateAmbientCreatures, drawAmbientCreatures, clearAmbientCreatures } from './particles.js?v=8';
import { drawHud, updateHudAnims } from './hud.js?v=feedback1';
import { setMasterVolume, playSfx } from './sfx.js';
import { resetRelics, equipped as equippedRelics, rollRelicOffer, applyRelic, RELIC_DEFS, ALL_RELIC_IDS, seenRelicIds, loadSeenRelics } from './relics.js';
import { stats, resetStats, calculateEssence, runDurationSeconds } from './stats.js';
import { meta, loadMeta, saveMeta, addEssence, purchaseUnlock, hasUnlock, UNLOCKS, bankHeirloom, consumeHeirloom } from './meta.js';
import { WEAPONS, ALL_WEAPON_IDS, WEAPON_UNLOCKS } from './weapons.js';
import { CURSES, ALL_CURSE_IDS, activeCurses, loadCurses, toggleCurse, isCursed, curseCount, curseEssenceMul } from './curses.js';
import { ACHIEVEMENTS, ACH_IDS, unlockedAchievements, pendingPopups, loadAchievements, evaluateAchievements, totalUnlocked, isUnlocked, unlockAch } from './achievements.js';
import { records, loadRecords, updateRecords, incrementRunsStarted } from './records.js';
import { loadDiscoveredFusions, activeFusions, FUSIONS, discoveredFusions, totalFusions, discoveredCount } from './fusions.js';
import { ruin, loadRuin, recordDeath, recordBossKill, recordRunComplete, getRoomStain, getBossRoomStain, agingLevel } from './ruin.js';
import { TAROT, drawnCards, drawTarotHand, hasCard, isTarotRun, clearTarot, loadSeenTarot, seenCount, totalCards, seenTarot } from './tarot.js';
import { settings, loadSettings, setSfxVolume, setMusicVolumeSetting, setShakeScaleSetting } from './settings.js';
import { daily, loadDaily, getTodayChallenge, markDailyCompleted, hasCompletedToday } from './daily.js';
import { loadTips, showTip, updateTips, drawTip } from './tips.js';
import { synthChord, synthFanfare, synthPing, synthGloom, synthThud, synthClick, startAmbientPad, stopAmbientPad } from './synth.js';
import {
  spawnRelicOffer, spawnAltarOffer, updatePedestals, drawPedestals, clearPedestals,
  pedestals, hasActivePedestals, drawPickupFlash, drawPedestalTooltip,
} from './pedestals.js';
import { initMusic, playTrack, updateMusic, setMusicVolume, setIntensity as setMusicIntensity } from './music.js';
import { gold, resetGold, updateGold, drawGold } from './gold.js';
import { consumeHitStop, updateFx, drawDamageNumbers, drawSlashes, clearFx, getTimeScale, updatePerfectDodge, drawPerfectDodgeOverlay, isPerfectDodge, drawScreenFlash, updateScreenFlash, drawCounterIndicator, triggerScreenFlash, updateHitMarkers, drawHitMarkers, hueRotateForTint, composeRelicThumbDataURL, composeEnemyThumbDataURL } from './fx.js?v=a11y1';
import { images as imageCache } from './loader.js';
import { updateSynergies, drawSynergies, drawComboOverlay, drawHeroShield, drawWandererTrail, clearSynergies } from './synergies.js';
import { maybeSpawnWanderer, updateWanderer, drawWanderer, drawWandererTooltip, clearWanderer } from './wanderer.js';
import { MEMORIES, ALL_MEMORY_IDS, unlockedMemories, selectedMemoryId, loadMemories, setSelectedMemory, checkMemoryUnlocks, applySelectedMemory, getSelectedMemory, totalMemories, unlockedCount as memoriesUnlockedCount } from './memories.js';
import { NPCS, ALL_NPC_IDS, hamletState, loadHamletState, saveHamletState, refreshNpcPresence, tryAdvanceArc, recordServiceUse, markDialogueSeen, hasUnreadDialogue, hamletGrowthStage, presentNpcs, totalNpcs, presentNpcCount } from './hamlet.js';

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
let _resizeT = 0;
window.addEventListener('resize', () => {
  clearTimeout(_resizeT);
  _resizeT = setTimeout(() => setCameraSize(canvas.width, canvas.height), 100);
});
// Orientation change fires slightly ahead of resize on mobile — belt-and-braces.
window.addEventListener('orientationchange', () => {
  clearTimeout(_resizeT);
  _resizeT = setTimeout(() => setCameraSize(canvas.width, canvas.height), 300);
});

// Post-FX pipeline (bloom + chromatic aberration) moved to ./postfx.js
// as part of review #4 (main.js split). main.js still owns the render-loop
// order and keeps the window assignment below so hero.js can trigger the
// RGB split on damage without importing main.js.
import { triggerChromAberr, updateChromAberr, applyChromAberr, applyBloom } from './postfx.js';
window.__triggerChromAberr = triggerChromAberr;

// Death/victory screen markup moved to ./deathScreen.js (review #4 split pass 2).
// Data-filling (stats, relics, essence) and event wiring stay in main.js.
import { DEATH_SCREEN_HTML } from './deathScreen.js';
// Between-floor + victory screen markup moved to ./winScreen.js (split pass 3).
import { WIN_SCREEN_HTML } from './winScreen.js';
// Credits screen — third-party asset attribution (release-prep legal step).
import { CREDITS_SCREEN_HTML } from './creditsScreen.js';
// Controls / how-to-play primer — single-reference cheat sheet, a less
// contextual companion to the onboarding tips system.
import { CONTROLS_SCREEN_HTML } from './controlsScreen.js';
// Ascension — systems-roguelite long-tail tiers. Each cleared floor-4 run
// unlocks the next tier's modifier + essence scaling.
import {
  loadAscension, ASCENSION_TIERS, activeAscension,
  ascensionEssenceMul, ascensionModifiers,
  getAscensionTier, getUnlockedTier, setAscensionTier,
  onRunCompletedAtTier, MAX_ASCENSION,
} from './ascension.js';
loadAscension();
// Expose modifiers to enemies.js / floor.js via a window hook rather than
// a new import path. They call back during runtime to pick up the current
// tier's scalars.
window.__ascensionModifiers = ascensionModifiers;
// Storage health probe — surfaces a warning chip if localStorage is blocked.
import { showStorageWarningIfBlocked } from './storage.js?v=save1';
showStorageWarningIfBlocked();

// Global error boundary — catches uncaught exceptions and unhandled promise
// rejections and renders a friendly "something went wrong" overlay instead
// of leaving the player staring at a frozen black canvas.
import { installErrorBoundary } from './errorBoundary.js';
installErrorBoundary();

// Accessibility: apply prefers-reduced-motion preference once at boot.
// Camera shake + zoom pulse are scaled through camera.shakeScale (already a
// thing the settings panel controls); hit-stop durations are scaled through
// fx.js's setHitStopScale. CSS-side animation suppression is handled by a
// @media block in index.html.
import { prefersReducedMotion } from './a11y.js';
import { setShakeScale } from './camera.js?v=2';
import { setHitStopScale } from './fx.js?v=a11y1';
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
deathEl.innerHTML = DEATH_SCREEN_HTML;
document.getElementById('restartBtn').addEventListener('click', () => startRun());

// Between-floor + victory screen — includes a shop row between floors.
// Ornamented dramatic screen matching the main-menu aesthetic.
const winEl = document.createElement('div');
winEl.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:radial-gradient(ellipse at center,#140a18 0%,#0a0610 65%,#050308 100%);color:#ddd;pointer-events:auto;font-family:Georgia,"Cormorant Garamond",serif;padding:24px;box-sizing:border-box;';
winEl.innerHTML = WIN_SCREEN_HTML;
document.getElementById('hud').appendChild(winEl);
document.getElementById('winRestartBtn').addEventListener('click', () => {
  if (currentFloorLevel >= MAX_FLOORS) {
    startRun();
  } else {
    beginNextFloor();
  }
});

// Populate shop with 3 relic offers + 1 heal. Prices scale by floor level.
// Cards reveal with staggered animation.
function setupShop() {
  const shopRow = document.getElementById('shopRow');
  const shopGold = document.getElementById('shopGold');
  const shopHeader = document.getElementById('shopHeader');
  shopRow.innerHTML = '';
  shopRow.style.display = 'flex';
  shopGold.style.display = 'block';
  if (shopHeader) shopHeader.style.display = 'block';

  const priceFloor = 40 + currentFloorLevel * 10;
  const offers = rollRelicOffer(3, currentFloorLevel);
  let idx = 0;
  for (const offer of offers) {
    const price = priceFloor + Math.floor(Math.random() * 30);
    const tier = offer.tier || 'common';
    shopRow.appendChild(makeShopCard({
      tint: offer.tint, iconKey: offer.icon, name: offer.name, desc: offer.desc, flavor: offer.flavor, price, tier,
      staggerIndex: idx++,
      onBuy: () => { applyRelic(offer.id); },
    }));
  }
  // Heal card — distinct green accent
  shopRow.appendChild(makeShopCard({
    tint: '#86e3a8', iconKey: 'relic_max_hp', name: 'Healing Spring',
    desc: 'Restore full HP',
    flavor: 'Water remembers the wounded. Drink, and be forgiven.',
    price: 30 + currentFloorLevel * 10,
    tier: 'service',
    staggerIndex: idx++,
    onBuy: () => { hero.hp = hero.maxHp; },
  }));

  refreshShopGoldState();
}

function makeShopCard({ tint, iconKey, name, desc, flavor, price, tier, staggerIndex, onBuy }) {
  const card = document.createElement('div');
  // Tier-colored frame with gradient depth, drop shadow, and staggered slide-in
  const isLegendary = tier === 'legendary';
  const isRare = tier === 'rare';
  const isService = tier === 'service';
  const frameGlow = isLegendary ? '0 0 28px rgba(255,200,255,0.55)'
                  : isRare ? '0 0 22px rgba(244,217,160,0.45)'
                  : isService ? '0 0 18px rgba(134,227,168,0.4)'
                  : `0 0 14px ${tint}55`;
  const tierLabel = isLegendary ? '\u2605 LEGENDARY' : isRare ? '\u25C6 RARE' : isService ? '\u2020 SERVICE' : '\u00b7 COMMON';
  const staggerDelay = 0.5 + (staggerIndex || 0) * 0.12;
  card.style.cssText = `
    position:relative;
    width:210px;
    background:linear-gradient(180deg,rgba(40,28,48,0.95),rgba(18,10,22,0.95));
    border:2px solid ${tint};
    padding:16px 14px;
    display:flex;flex-direction:column;align-items:center;gap:7px;
    box-shadow:${frameGlow},0 4px 16px rgba(0,0,0,0.4);
    font-family:Georgia,serif;
    transition:transform 0.2s ease, box-shadow 0.2s ease;
    animation:winCardSlide 0.5s ease-out ${staggerDelay}s both;
  `;
  card.innerHTML = `
    <div style="font-size:9px;letter-spacing:3px;color:${tint};opacity:0.8;font-weight:bold;">${tierLabel}</div>
    <div style="padding:6px;background:radial-gradient(circle,${tint}33,transparent 70%);">
      <img src="assets/icons/${iconKey}.png" style="width:44px;height:44px;image-rendering:pixelated;filter:hue-rotate(${hueRotateForTint(tint)}deg) saturate(1.15) drop-shadow(0 0 6px ${tint}88);" />
    </div>
    <div style="font-weight:bold;font-size:15px;color:${tint};letter-spacing:1px;text-align:center;text-shadow:0 0 6px ${tint}44;">${name}</div>
    ${flavor ? `<div style="font-size:10px;color:rgba(200,190,210,0.75);text-align:center;line-height:1.35;font-style:italic;min-height:26px;padding:0 2px;">${flavor}</div>` : ''}
    <div style="height:1px;width:70%;background:linear-gradient(90deg,transparent,${tint}aa,transparent);margin:2px 0;"></div>
    <div style="font-size:11px;color:${tint};text-align:center;min-height:26px;line-height:1.35;font-weight:bold;">${desc}</div>
    <div style="height:1px;width:100%;background:linear-gradient(90deg,transparent,${tint}88,transparent);margin:2px 0;"></div>
    <div style="font-size:18px;color:#ffd68a;text-shadow:0 0 8px rgba(255,214,138,0.4);">🪙 ${price}</div>
    <button class="buyBtn" style="background:linear-gradient(180deg,${tint},${darkenHex(tint, 0.65)});color:#1a1220;border:0;padding:8px 22px;cursor:pointer;font-weight:bold;letter-spacing:2px;font-size:12px;font-family:Georgia,serif;transition:transform 0.15s ease, box-shadow 0.15s ease;">CLAIM</button>
  `;
  const btn = card.querySelector('.buyBtn');
  btn.dataset.price = price;
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    if (gold.total < price) return;
    gold.total -= price;
    onBuy();
    btn.textContent = '✓ CLAIMED';
    btn.disabled = true;
    btn.style.opacity = '0.55';
    btn.style.cursor = 'default';
    card.style.opacity = '0.7';
    // Purchase sparkle feedback
    try {
      const rect = card.getBoundingClientRect();
      card.style.boxShadow = `0 0 32px ${tint}, 0 0 64px ${tint}88`;
      setTimeout(() => { card.style.boxShadow = '0 4px 16px rgba(0,0,0,0.4)'; }, 500);
      synthPing(1100, 0.9, 0.3);
      synthChord(523, 0.7, 0.6);
    } catch (e) {}
    refreshShopGoldState();
  });
  return card;
}

// Small helper — darken a hex color for gradient button shadow
function darkenHex(hex, factor = 0.6) {
  if (!hex || !hex.startsWith('#')) return '#1a1220';
  const h = hex.length === 4
    ? hex.slice(1).split('').map(c => c + c).join('')
    : hex.slice(1);
  const n = parseInt(h, 16);
  const r = Math.floor(((n >> 16) & 255) * factor);
  const g = Math.floor(((n >> 8) & 255) * factor);
  const b = Math.floor((n & 255) * factor);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

function refreshShopGoldState() {
  document.getElementById('shopGoldAmount').textContent = gold.total;
  for (const btn of document.querySelectorAll('#shopRow .buyBtn')) {
    if (btn.disabled) continue;
    const p = +btn.dataset.price;
    if (gold.total < p) {
      btn.style.opacity = '0.35';
      btn.style.cursor = 'not-allowed';
      btn.style.filter = 'grayscale(0.7)';
    } else {
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
      btn.style.filter = 'none';
    }
  }
}

function hideShop() {
  document.getElementById('shopRow').style.display = 'none';
  document.getElementById('shopGold').style.display = 'none';
}

// Floor state
let floor = [];
let roomIndex = 0;
let currentFloorLevel = 1;       // 1..MAX_FLOORS
let transition = { active: false, phase: 'out', t: 0, toIndex: 0 };
let running = false;
let bossWinTriggered = false;
let gameTime = 0;
let heroSpikeCD = 0;
let roomLabelTime = 0;
let roomLabelText = '';
let roomLabelColor = '#ffd68a';
let paused = false;
// Full-screen floor intro card — shown when entering a new floor
let floorCardTime = 0;
let floorCardRoman = '';
let floorCardName = '';
let floorCardFlavor = '';

const FLOOR_CARD_DATA = {
  1: { roman: 'I',   name: 'THE UNDERCROFT', flavor: 'cold stone remembers the dead' },
  2: { roman: 'II',  name: 'THE FORGOTTEN VAULT', flavor: 'where kings once feasted, rats now feast' },
  3: { roman: 'III', name: 'THE ABYSS', flavor: 'the world has ended. something else begins.' },
  4: { roman: 'IV',  name: 'THE INFERNO', flavor: 'the wound at the world\u2019s heart' },
};

const DEATH_MESSAGES = [
  'your journey into Ethera ends',
  'the depths consume another',
  'dust returns to dust',
  'the world continues without you',
  'another soul for the ruin',
  'even the brave fall here',
  'the dark will remember you, for a while',
  'ash to ash. ruin to ruin.',
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
let bossIntroBoss = null;             // reference to the boss for name display
// Death ceremony — cinematic beat before summary UI appears
let deathCeremonyActive = false;
let deathCeremonyTime = 0;
let deathSummaryShown = false;
// Tab-title update throttle
let _lastTitleUpdateSec = -1;
// Pedestal/altar proximity hum timer + low-HP heartbeat timer
let _proximityHumT = 0;
let _heartbeatT = 0;
// Fusion-formed banner — dramatic announcement when a new fusion activates
let fusionBannerTime = 0;
let fusionBannerFusion = null;
// Enemy codex banner — small "bestiary entry" card for first-time encounters.
// Queued by enemies.js via window.__pendingCodexEntry; we dequeue here and
// animate a top-center reveal. Multiple can be queued if a combat spawns
// several new types at once (rare, but handled).
let codexBannerTime = 0;
let codexBannerEntry = null;
const codexQueue = [];
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
  pedestals.push({
    x: echo.x, y: echo.y,
    relic: relicDef,
    tier: relicDef.tier || 'common',
    picked: false, bob: 0, glow: 0, hpCost: 0,
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
  fusionBannerTime = 3.0;
  fusionBannerFusion = fusion;
  // Audio sting — chord on discovery, layered ping for newly-discovered-ever
  synthChord(fusion._firstDiscovery ? 880 : 659, 1.0, fusion._firstDiscovery ? 1.2 : 0.8);
  if (fusion._firstDiscovery) {
    setTimeout(() => synthFanfare(1.0), 200);
  }
  pulseZoom(0.1, 0.6);
  triggerScreenFlash('rgba(180, 230, 255, 0.2)', 0.4);
};
// Boss phase-transition cinematic (fires when a boss enrages at 50% HP)
let phaseIntroTime = 0;        // ticks down from ~1.6s while banner shows
let phaseIntroBoss = null;
window.triggerBossPhaseIntro = (boss) => {
  if (!boss) return;
  phaseIntroTime = 1.6;
  phaseIntroBoss = boss;
};

// Main menu — shown on page load
const menuEl = document.createElement('div');
// Painted backdrop (Nano Banana, Apr 2026) — cinematic ruined archway with
// torches and descending stair. UI overlays sit above dark areas at top
// (title crown) and bottom (cards + chrome). Fallback radial-gradient
// preserved in case the image fails to load.
menuEl.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:#050308 url(assets/menu/menu_backdrop.jpg) center/cover no-repeat;color:#ddd;pointer-events:auto;font-family:Georgia,"Cormorant Garamond",serif;padding:24px;box-sizing:border-box;overflow:hidden;';
menuEl.innerHTML = `
  <!-- BACKDROP DARKENING — quiets the busy stone texture behind the UI
       without flattening the painting. A horizontal gradient keeps the
       center column slightly darker so gold/cream text reads over it,
       while the sides (torches, ivy, vignette edges) stay vivid. -->
  <div style="position:absolute;inset:0;background:linear-gradient(90deg, transparent 0%, rgba(4,2,8,0.28) 28%, rgba(4,2,8,0.42) 50%, rgba(4,2,8,0.28) 72%, transparent 100%);pointer-events:none;"></div>
  <!-- Soft center vignette — pulls a breath of darkness in right under the
       title + CTA so they have air above the stonework. -->
  <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(820px,80vw);height:min(620px,70vh);background:radial-gradient(ellipse at center, rgba(4,2,8,0.55) 0%, rgba(4,2,8,0.25) 45%, transparent 75%);pointer-events:none;"></div>

  <!-- AMBIENT SIGIL — kept as a faint overlay (0.025) so it reads as a
       mystical diagram etched into the air above the archway. Dimmer
       now that the painted backdrop carries most of the atmosphere. -->
  <svg id="menuSigil" viewBox="0 0 200 200" style="position:absolute;width:440px;height:440px;left:50%;top:42%;transform:translate(-50%,-50%);opacity:0.025;pointer-events:none;filter:drop-shadow(0 0 50px rgba(201,168,106,0.25));">
    <defs>
      <radialGradient id="sigilGrad" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0%" stop-color="#f4d9a0" stop-opacity="0.8"/>
        <stop offset="80%" stop-color="#c9a86a" stop-opacity="0.2"/>
        <stop offset="100%" stop-color="#c9a86a" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <circle cx="100" cy="100" r="92" fill="none" stroke="#c9a86a" stroke-width="0.5" opacity="0.7"/>
    <circle cx="100" cy="100" r="80" fill="none" stroke="#c9a86a" stroke-width="0.3" opacity="0.5"/>
    <circle cx="100" cy="100" r="78" fill="url(#sigilGrad)"/>
    <g stroke="#c9a86a" stroke-width="0.6" fill="none" opacity="0.8">
      <line x1="100" y1="8" x2="100" y2="192"/>
      <line x1="8" y1="100" x2="192" y2="100"/>
      <line x1="35" y1="35" x2="165" y2="165"/>
      <line x1="165" y1="35" x2="35" y2="165"/>
    </g>
    <g fill="#c9a86a" opacity="0.9">
      <polygon points="100,6 104,14 100,22 96,14"/>
      <polygon points="100,178 104,186 100,194 96,186"/>
      <polygon points="6,100 14,96 22,100 14,104"/>
      <polygon points="178,100 186,96 194,100 186,104"/>
    </g>
  </svg>

  <!-- Screen-edge vignette — thin darkening on the outer rim so the painted
       backdrop never quite touches the screen edges. Lighter than before
       since the backdrop already has its own atmospheric vignette. -->
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.45) 95%, rgba(0,0,0,0.7) 100%);pointer-events:none;"></div>

  <!-- EMBER PARTICLES — warm gold specks drifting up from the stair, as if
       rising from the unseen torches and the glow below. Adds motion so
       the scene feels alive rather than a static painting. -->
  <canvas id="menuEmbers" width="1280" height="720" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;mix-blend-mode:screen;opacity:0.9;"></canvas>

  <!-- PAGE-FRAME CORNER FLOURISHES — four gold L-shapes mark this screen as a
       manuscript page. Now 88px (was 58) and with brighter hairlines +
       larger corner diamonds so they read clearly against the painted
       backdrop instead of vanishing into the dark edges. -->
  <div class="menuCorner" style="position:absolute;top:28px;left:28px;width:88px;height:88px;pointer-events:none;">
    <div style="position:absolute;top:0;left:0;width:88px;height:1px;background:linear-gradient(90deg,#f4d9a0,transparent);box-shadow:0 0 6px rgba(244,217,160,0.4);"></div>
    <div style="position:absolute;top:0;left:0;width:1px;height:88px;background:linear-gradient(180deg,#f4d9a0,transparent);box-shadow:0 0 6px rgba(244,217,160,0.4);"></div>
    <div style="position:absolute;top:-3px;left:-3px;width:7px;height:7px;background:#f4d9a0;transform:rotate(45deg);box-shadow:0 0 8px rgba(244,217,160,0.6);"></div>
  </div>
  <div class="menuCorner" style="position:absolute;top:28px;right:28px;width:88px;height:88px;pointer-events:none;">
    <div style="position:absolute;top:0;right:0;width:88px;height:1px;background:linear-gradient(270deg,#f4d9a0,transparent);box-shadow:0 0 6px rgba(244,217,160,0.4);"></div>
    <div style="position:absolute;top:0;right:0;width:1px;height:88px;background:linear-gradient(180deg,#f4d9a0,transparent);box-shadow:0 0 6px rgba(244,217,160,0.4);"></div>
    <div style="position:absolute;top:-3px;right:-3px;width:7px;height:7px;background:#f4d9a0;transform:rotate(45deg);box-shadow:0 0 8px rgba(244,217,160,0.6);"></div>
  </div>
  <div class="menuCorner" style="position:absolute;bottom:28px;left:28px;width:88px;height:88px;pointer-events:none;">
    <div style="position:absolute;bottom:0;left:0;width:88px;height:1px;background:linear-gradient(90deg,#f4d9a0,transparent);box-shadow:0 0 6px rgba(244,217,160,0.4);"></div>
    <div style="position:absolute;bottom:0;left:0;width:1px;height:88px;background:linear-gradient(0deg,#f4d9a0,transparent);box-shadow:0 0 6px rgba(244,217,160,0.4);"></div>
    <div style="position:absolute;bottom:-3px;left:-3px;width:7px;height:7px;background:#f4d9a0;transform:rotate(45deg);box-shadow:0 0 8px rgba(244,217,160,0.6);"></div>
  </div>
  <div class="menuCorner" style="position:absolute;bottom:28px;right:28px;width:88px;height:88px;pointer-events:none;">
    <div style="position:absolute;bottom:0;right:0;width:88px;height:1px;background:linear-gradient(270deg,#f4d9a0,transparent);box-shadow:0 0 6px rgba(244,217,160,0.4);"></div>
    <div style="position:absolute;bottom:0;right:0;width:1px;height:88px;background:linear-gradient(0deg,#f4d9a0,transparent);box-shadow:0 0 6px rgba(244,217,160,0.4);"></div>
    <div style="position:absolute;bottom:-3px;right:-3px;width:7px;height:7px;background:#f4d9a0;transform:rotate(45deg);box-shadow:0 0 8px rgba(244,217,160,0.6);"></div>
  </div>

  <!-- CORNER CHROME — now borderless silhouettes, not boxed UI widgets. -->
  <button id="menuSettingsBtn" title="Settings" style="position:absolute;top:34px;right:96px;background:transparent;color:#7a6a5a;border:0;width:32px;height:32px;font-size:18px;cursor:pointer;font-family:Georgia,serif;transition:all 0.22s ease;display:flex;align-items:center;justify-content:center;opacity:0.7;">\u2699</button>
  <!-- JOURNAL indicator — shows which save slot (journal) is active.
       Clicking opens the Journals modal where the player can switch or
       delete slots. "Journal" reads unambiguously as a save file — the
       previous "Volume" term confused for audio volume. -->
  <button id="menuVolumeBtn" title="Journals — your save slots" style="position:absolute;top:34px;left:96px;background:transparent;color:#a89a7a;border:0;padding:6px 12px;font-size:10px;cursor:pointer;letter-spacing:4px;font-family:Georgia,serif;font-weight:bold;transition:all 0.22s ease;display:flex;align-items:center;gap:10px;opacity:0.8;">
    <span style="font-size:11px;color:#c9a86a;">\u2042</span>
    <span>JOURNAL <span id="menuVolumeLabel">I</span></span>
  </button>
  <!-- Curses have moved to the Gravekeeper NPC inside the hamlet — that's
       their narrative home now. Memory lives inside the Archivist. The main
       menu no longer carries any modifier chips; those accesses happen
       through NPC dialogue for better world integration. The two legacy
       buttons below are kept as hidden hooks so existing click handlers
       (for curse-active state reads, etc.) don't break. -->
  <button id="menuCursesBtn" style="display:none;"><span id="menuCursesBtnLabel"></span></button>
  <button id="menuMemoryBtn" style="display:none;"><span id="menuMemoryBtnLabel"></span></button>

  <!-- CONTENT COLUMN — sits above ambient layers, anchored by corner frame.
       Radically simplified: TITLE → CTA → MODES → two secondary text links.
       Meta cards, records, memory/chronicles chips all relocated to the
       Hamlet hub or the Chronicles book, accessed via text links below. -->
  <div style="position:relative;display:flex;flex-direction:column;align-items:center;z-index:1;">
    <h1 class="ethera-title" style="font-size:96px;margin:0;letter-spacing:14px;color:#f4d9a0;font-weight:400;line-height:1;">ETHERA</h1>
    <!-- Subtitle with integrated ornaments — small gold diamonds flanking the
         text, so it reads as one unit with the title. -->
    <div style="display:flex;align-items:center;gap:14px;margin:10px 0 44px;opacity:0.55;">
      <span style="width:4px;height:4px;background:#c9a86a;transform:rotate(45deg);"></span>
      <span style="color:#d8cfae;font-size:12px;letter-spacing:7px;font-style:italic;">beneath the ruin</span>
      <span style="width:4px;height:4px;background:#c9a86a;transform:rotate(45deg);"></span>
    </div>

    <!-- RESUME CARD — revealed by showMainMenu if a saved run snapshot exists.
         Sits above the primary CTA so it's the first thing the returning
         player sees. Hidden by default. -->
    <button id="menuResumeBtn" style="display:none;background:linear-gradient(180deg,rgba(30,42,32,0.92),rgba(14,22,16,0.95));border:0;padding:13px 24px;cursor:pointer;font-family:Georgia,serif;margin-bottom:18px;min-width:360px;text-align:left;box-shadow:inset 0 0 0 1px #86b79a, 0 0 20px rgba(134,183,154,0.28), inset 0 0 12px rgba(0,0,0,0.4);transition:all 0.22s ease;">
      <div style="display:flex;align-items:center;gap:14px;">
        <span style="width:6px;height:6px;background:#86e3a8;transform:rotate(45deg);flex-shrink:0;"></span>
        <div style="flex:1;">
          <div style="color:#86e3a8;font-size:10px;letter-spacing:5px;font-weight:bold;margin-bottom:3px;">\u2666 DESCENT IN PROGRESS</div>
          <div id="menuResumeLine" style="color:#f4d9a0;font-size:14px;font-weight:bold;letter-spacing:2px;">Floor I \u00b7 8/8 HP \u00b7 0 relics</div>
        </div>
        <span style="color:#86e3a8;font-size:14px;letter-spacing:4px;font-weight:bold;">RESUME \u2192</span>
      </div>
    </button>

    <!-- PRIMARY ACTION — the single anchor. Soft pulse halo behind it. -->
    <div style="position:relative;">
      <div id="menuCtaHalo" style="position:absolute;inset:-14px;background:radial-gradient(ellipse at center, rgba(201,168,106,0.18), transparent 70%);pointer-events:none;"></div>
      <button id="menuNewRunBtn" style="position:relative;background:linear-gradient(180deg,#3a2a20,#1a0f08);color:#f4d9a0;border:0;padding:19px 96px;font-size:18px;cursor:pointer;letter-spacing:7px;font-weight:bold;font-family:Georgia,serif;box-shadow:inset 0 0 0 1px #c9a86a, 0 0 28px rgba(201,168,106,0.25), inset 0 0 14px rgba(244,217,160,0.08);transition:all 0.22s ease;">BEGIN DESCENT</button>
    </div>

    <!-- MODE CHIPS — borderless. Selected chip is FILLED + glows; unselected
         chips are dim text only. Differentiation by weight, not by outline. -->
    <div id="menuModeRow" style="display:flex;gap:4px;margin-top:20px;margin-bottom:2px;align-items:center;">
      <button class="menuModeChip" data-mode="standard" style="background:transparent;border:0;padding:7px 16px;cursor:pointer;color:#6a5c48;font-family:Georgia,serif;font-size:11px;letter-spacing:4px;font-weight:bold;transition:all 0.22s ease;text-transform:uppercase;">STANDARD</button>
      <span style="opacity:0.35;color:#c9a86a;font-size:10px;">\u2666</span>
      <button class="menuModeChip" data-mode="daily" style="background:transparent;border:0;padding:7px 16px;cursor:pointer;color:#6a5c48;font-family:Georgia,serif;font-size:11px;letter-spacing:4px;font-weight:bold;transition:all 0.22s ease;text-transform:uppercase;">DAILY</button>
      <span style="opacity:0.35;color:#c9a86a;font-size:10px;">\u2666</span>
      <!-- META CONSOLIDATION PASS (review #3): TAROT mode chip hidden.
           Tarot's 8 cards overlapped Memory's identity-modifier role; the
           main menu had one too many entry points for new players. The
           chip is hidden (not deleted) so the tarot module stays dormant
           and can be re-enabled by removing this display:none. The two
           most mechanically-distinct tarot cards (Hermit, Hanged Man)
           have been migrated to the Memory pool as history-gated unlocks. -->
      <button class="menuModeChip" data-mode="tarot" style="display:none;background:transparent;border:0;padding:7px 16px;cursor:pointer;color:#6a5c48;font-family:Georgia,serif;font-size:11px;letter-spacing:4px;font-weight:bold;transition:all 0.22s ease;text-transform:uppercase;">TAROT</button>
    </div>

    <!-- ASCENSION selector — systems-roguelite long-tail grind. Hidden on
         tier 0 until the player has unlocked anything (don't clutter a new
         player's menu with something they can't use). Click to cycle
         through unlocked tiers. Each tier stacks on the previous. -->
    <div id="menuAscensionRow" style="display:none;align-items:center;gap:10px;margin-top:10px;margin-bottom:2px;font-family:Georgia,serif;">
      <span style="color:#8a7a5a;font-size:9px;letter-spacing:4px;font-style:italic;">\u25C7</span>
      <button id="menuAscensionBtn" title="Click to cycle ascension tier" style="background:transparent;border:0;cursor:pointer;color:#c9a86a;font-family:Georgia,serif;font-size:11px;letter-spacing:4px;font-weight:bold;transition:all 0.22s ease;text-transform:uppercase;padding:4px 10px;">ASCENSION 0</button>
      <span style="color:#8a7a5a;font-size:9px;letter-spacing:4px;font-style:italic;">\u25C7</span>
    </div>
    <div id="menuAscensionHint" style="font-size:10px;opacity:0.65;letter-spacing:2px;font-family:Georgia,serif;font-style:italic;color:#c9a86a;margin-bottom:0;text-align:center;max-width:440px;min-height:14px;"></div>

    <!-- Hint line — gold at lower opacity, no purple. -->
    <div id="menuModeHint" style="font-size:11px;opacity:0;letter-spacing:2px;font-family:Georgia,serif;font-style:italic;margin-top:10px;margin-bottom:0;color:#c9a86a;min-height:18px;text-align:center;max-width:480px;transition:opacity 0.28s ease;"></div>

    <!-- SECONDARY ACTIONS — two subtle text links below the CTA. Hamlet
         holds meta-progression (essence, NPCs, services); Chronicles is
         the codex (achievements, bestiary, relicpedia, fusions). Both are
         gold-italic text with a diamond flanking separator and a hairline
         underline on hover. Nothing else lives here. -->
    <div style="display:flex;align-items:center;gap:20px;margin-top:34px;font-family:Georgia,serif;">
      <div style="width:40px;height:1px;background:linear-gradient(90deg,transparent,rgba(201,168,106,0.6));"></div>
      <button id="menuHamletLink" style="background:transparent;border:0;padding:6px 4px;cursor:pointer;color:#c9a86a;font-family:Georgia,serif;font-size:12px;letter-spacing:3px;font-style:italic;transition:all 0.22s ease;opacity:0.8;display:flex;align-items:center;gap:8px;">
        <span>visit the hamlet</span>
        <span style="font-size:10px;opacity:0.7;">\u2192</span>
      </button>
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);opacity:0.5;"></span>
      <button id="menuChroniclesLink" style="background:transparent;border:0;padding:6px 4px;cursor:pointer;color:#c9a86a;font-family:Georgia,serif;font-size:12px;letter-spacing:3px;font-style:italic;transition:all 0.22s ease;opacity:0.8;display:flex;align-items:center;gap:8px;">
        <span>read the chronicles</span>
        <span style="font-size:10px;opacity:0.7;">\u2192</span>
      </button>
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);opacity:0.5;"></span>
      <!-- How-to-play primer — addresses the onboarding gap noted in the studio review. -->
      <button id="menuControlsLink" style="background:transparent;border:0;padding:6px 4px;cursor:pointer;color:#c9a86a;font-family:Georgia,serif;font-size:12px;letter-spacing:3px;font-style:italic;transition:all 0.22s ease;opacity:0.8;display:flex;align-items:center;gap:8px;">
        <span>how to play</span>
        <span style="font-size:10px;opacity:0.7;">\u2192</span>
      </button>
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);opacity:0.5;"></span>
      <!-- Credits link — release-prep attribution screen for third-party assets. -->
      <button id="menuCreditsLink" style="background:transparent;border:0;padding:6px 4px;cursor:pointer;color:#c9a86a;font-family:Georgia,serif;font-size:12px;letter-spacing:3px;font-style:italic;transition:all 0.22s ease;opacity:0.6;display:flex;align-items:center;gap:8px;">
        <span>credits</span>
        <span style="font-size:10px;opacity:0.7;">\u2192</span>
      </button>
      <div style="width:40px;height:1px;background:linear-gradient(270deg,transparent,rgba(201,168,106,0.6));"></div>
    </div>

    <!-- ACTIVE MODIFIERS indicator — only shown when a memory is selected
         or curses are active, so the player knows their next descent isn't
         "vanilla." Stays invisible when nothing is set. -->
    <div id="menuActiveModifiers" style="margin-top:22px;font-family:Georgia,serif;font-style:italic;font-size:11px;letter-spacing:3px;color:#c9a86a;opacity:0;transition:opacity 0.3s ease;min-height:16px;text-align:center;"></div>

    <!-- LEGACY hidden elements — kept for code-path compatibility. Their
         values are still updated in showMainMenu but no visible UI renders. -->
    <div id="menuRecords" style="display:none;"></div>
    <button id="menuMetaBtn" style="display:none;"><span id="menuSanctuaryValue">0</span></button>
    <button id="menuAchBtn" style="display:none;"><span id="menuChroniclesValue">0/0</span></button>
  </div>

  <!-- Records moved: now shown inside the VOLUMES modal per-slot, so each
       save's story lives with the save. No main-menu records block. -->
  <div id="menuRecordsCorner" style="display:none;"></div>

  <!-- Hidden legacy elements (kept for compat) -->
  <div id="menuDailyInfo" style="display:none;"></div>
  <div id="menuCurseIndicator" style="display:none;"></div>
  <div id="menuEssence" style="display:none;"></div>

  <!-- Bottom controls strip — manuscript colophon. Slightly brighter now
       that the painted dark floor of the backdrop gives us contrast, and
       framed with short hairline dashes so it reads as a legend rather
       than orphaned text. -->
  <div style="position:absolute;bottom:48px;left:0;right:0;display:flex;align-items:center;justify-content:center;gap:18px;font-family:Georgia,serif;font-style:italic;color:#c9a86a;opacity:0.55;pointer-events:none;">
    <div style="width:60px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a);"></div>
    <div style="font-size:10.5px;letter-spacing:4px;">WASD \u00b7 LMB attack \u00b7 SPACE dodge \u00b7 Q dash strike \u00b7 ESC pause</div>
    <div style="width:60px;height:1px;background:linear-gradient(270deg,transparent,#c9a86a);"></div>
  </div>
`;
document.getElementById('hud').appendChild(menuEl);

// =========================================================================
// MENU EMBER PARTICLES — warm gold specks that drift up from the bottom of
// the screen, as if rising from the torches and the glow below the stair.
// The animation only ticks while the menu is visible (display !== 'none');
// otherwise it short-circuits to save CPU during play. Particles wrap
// horizontally for gentle sway; fade in at birth, burn out at the top.
// =========================================================================
const _menuEmbers = [];
function _seedMenuEmber() {
  _menuEmbers.push({
    x: Math.random(),                       // 0..1 (fraction of width)
    y: 0.82 + Math.random() * 0.18,         // start near bottom
    vy: 0.0006 + Math.random() * 0.0009,    // upward drift speed (frac/frame)
    vx: (Math.random() - 0.5) * 0.0004,     // slight lateral sway
    phase: Math.random() * Math.PI * 2,     // for sway oscillation
    phaseSpeed: 0.015 + Math.random() * 0.025,
    size: 0.7 + Math.random() * 1.6,        // px radius
    life: 0,
    maxLife: 380 + Math.random() * 280,     // frames
    hue: 28 + Math.random() * 18,           // amber-orange range
    sat: 75 + Math.random() * 20,
    lum: 58 + Math.random() * 18,
  });
}
// Seed with a few so the first frame isn't empty
for (let i = 0; i < 28; i++) { _seedMenuEmber(); _menuEmbers[_menuEmbers.length - 1].y = Math.random(); _menuEmbers[_menuEmbers.length - 1].life = Math.random() * 280; }

function _tickMenuEmbers() {
  // Route to whichever ember canvas is currently visible: main menu or
  // hamlet. Skip entirely if both are hidden (saves CPU during play).
  let cvs = null;
  if (menuEl.style.display !== 'none') {
    cvs = document.getElementById('menuEmbers');
  } else if (typeof hamletEl !== 'undefined' && hamletEl.style.display !== 'none') {
    cvs = document.getElementById('hamletEmbers');
  }
  if (!cvs) {
    requestAnimationFrame(_tickMenuEmbers);
    return;
  }
  // Match canvas resolution to its display size for crisp dots
  const w = cvs.clientWidth, h = cvs.clientHeight;
  if (cvs.width !== w || cvs.height !== h) { cvs.width = w; cvs.height = h; }
  const ctx = cvs.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  // Spawn — keep population around 70
  while (_menuEmbers.length < 70) _seedMenuEmber();
  for (let i = _menuEmbers.length - 1; i >= 0; i--) {
    const e = _menuEmbers[i];
    e.life++;
    e.phase += e.phaseSpeed;
    e.y -= e.vy;
    e.x += e.vx + Math.sin(e.phase) * 0.0005;
    if (e.y < -0.05 || e.life > e.maxLife || e.x < -0.05 || e.x > 1.05) {
      _menuEmbers.splice(i, 1);
      continue;
    }
    // Fade in over first 60f, fade out over last 120f
    const fadeIn = Math.min(1, e.life / 60);
    const fadeOut = Math.min(1, (e.maxLife - e.life) / 120);
    const alpha = Math.min(fadeIn, fadeOut) * (0.55 + 0.45 * Math.sin(e.phase * 1.3));
    const px = e.x * w, py = e.y * h;
    // Glow — tiny radial
    const r = e.size;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const grad = ctx.createRadialGradient(px, py, 0, px, py, r * 6);
    grad.addColorStop(0, `hsla(${e.hue},${e.sat}%,${e.lum}%,${alpha})`);
    grad.addColorStop(0.4, `hsla(${e.hue - 4},${e.sat}%,${e.lum - 12}%,${alpha * 0.4})`);
    grad.addColorStop(1, `hsla(${e.hue - 8},${e.sat}%,${e.lum - 24}%,0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, r * 6, 0, Math.PI * 2);
    ctx.fill();
    // Core pixel
    ctx.fillStyle = `hsla(${e.hue + 6},${e.sat}%,${Math.min(94, e.lum + 22)}%,${alpha})`;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  requestAnimationFrame(_tickMenuEmbers);
}
requestAnimationFrame(_tickMenuEmbers);

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

document.getElementById('menuNewRunBtn').addEventListener('click', () => {
  // Route through the currently-selected mode. Tarot detours through a reveal;
  // daily sets a flag; standard just starts.
  if (menuMode === 'tarot') {
    drawTarotHand(3);
    showTarotReveal();
    return;
  }
  if (menuMode === 'daily') {
    daily.activeForRun = true;
    showTip('first_daily');
  }
  if (availableWeapons().length > 1) showWeaponPicker();
  else { hideAllOverlays(); startRun(); }
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
function showCredits() {
  if (!creditsEl) {
    creditsEl = document.createElement('div');
    creditsEl.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,#140a18 0%,#0a0610 65%,#050308 100%);color:#ddd;pointer-events:auto;font-family:Georgia,"Cormorant Garamond",serif;padding:24px;box-sizing:border-box;z-index:30;';
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
let controlsEl = null;
function showControls() {
  if (!controlsEl) {
    controlsEl = document.createElement('div');
    controlsEl.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,#140a18 0%,#0a0610 65%,#050308 100%);color:#ddd;pointer-events:auto;font-family:Georgia,"Cormorant Garamond",serif;padding:24px;box-sizing:border-box;z-index:30;';
    controlsEl.innerHTML = CONTROLS_SCREEN_HTML;
    document.getElementById('hud').appendChild(controlsEl);
    controlsEl.querySelector('#controlsCloseBtn')?.addEventListener('click', () => {
      controlsEl.style.display = 'none';
    });
  }
  controlsEl.style.display = 'flex';
}
document.getElementById('menuControlsLink')?.addEventListener('click', showControls);

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
    setTimeout(() => showControls(), 900);
  } catch (_) {
    // Storage-blocked path (Safari private mode etc.) — just skip the nudge.
  }
})();

// Initial state — sets chip highlight + CTA tint
refreshMenuModeChips();

// TAROT REVEAL — dramatic 3-card draw modal before the run begins
const tarotRevealEl = document.createElement('div');
tarotRevealEl.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:radial-gradient(ellipse at center,#140a18 0%,#0a0610 65%,#050308 100%);color:#ddd;pointer-events:auto;font-family:Georgia,"Cormorant Garamond",serif;padding:24px;box-sizing:border-box;z-index:30;overflow:hidden;';
tarotRevealEl.innerHTML = `
  <!-- Deep vignette + page-frame corners. -->
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center, transparent 28%, rgba(4,2,6,0.55) 78%, rgba(0,0,0,0.85) 100%);pointer-events:none;"></div>
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

  <div style="position:relative;display:flex;flex-direction:column;align-items:center;z-index:1;">
    <div style="display:flex;align-items:center;gap:22px;margin-bottom:10px;opacity:0.75;">
      <div style="width:100px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
      <div style="color:#c9a86a;font-size:11px;letter-spacing:6px;font-style:italic;">the cards are drawn</div>
      <div style="width:100px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
    </div>
    <h1 style="font-size:48px;margin:0;letter-spacing:10px;color:#f4d9a0;text-shadow:0 0 18px rgba(244,217,160,0.5);font-weight:400;line-height:1;">TAROT DESCENT</h1>
    <div style="display:flex;align-items:center;gap:12px;margin:10px 0 34px;opacity:0.65;">
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);"></span>
      <p id="tarotSubtitle" style="margin:0;letter-spacing:5px;font-size:12px;font-style:italic;color:#d8cfae;">three cards drawn \u00b7 three fates set</p>
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);"></span>
    </div>
    <div id="tarotCardsRow" style="display:flex;gap:24px;margin-bottom:32px;"></div>
    <button id="tarotBeginBtn" style="background:linear-gradient(180deg,#3a2a20,#1a0f08);color:#f4d9a0;border:0;padding:15px 64px;font-size:15px;cursor:pointer;letter-spacing:7px;font-weight:bold;font-family:Georgia,serif;box-shadow:inset 0 0 0 1px #c9a86a, 0 0 26px rgba(201,168,106,0.3), inset 0 0 14px rgba(244,217,160,0.08);transition:all 0.22s ease;">BEGIN DESCENT</button>
    <button id="tarotBackBtn" style="background:transparent;color:#8a4848;border:0;padding:8px 20px;font-size:11px;cursor:pointer;letter-spacing:5px;margin-top:14px;font-family:Georgia,serif;font-style:italic;font-weight:bold;transition:all 0.22s ease;opacity:0.75;">\u2190 BACK</button>
  </div>
`;
document.getElementById('hud').appendChild(tarotRevealEl);
document.getElementById('tarotBeginBtn').addEventListener('click', () => {
  tarotRevealEl.style.display = 'none';
  startRun();
});
document.getElementById('tarotBackBtn').addEventListener('click', () => {
  clearTarot();
  tarotRevealEl.style.display = 'none';
  menuEl.style.display = 'flex';
});

function showTarotReveal() {
  hideAllOverlays();
  tarotRevealEl.style.display = 'flex';
  const row = document.getElementById('tarotCardsRow');
  row.innerHTML = '';
  for (let i = 0; i < drawnCards.length; i++) {
    const c = drawnCards[i];
    const firstDraw = !seenTarot.has(c.id) || (seenTarot.size <= 3);
    const card = document.createElement('div');
    // Card styling — vintage tarot feel
    card.style.cssText = `width:180px;background:linear-gradient(180deg,#2a1418,#140a0d);border:2px solid ${c.tint};padding:18px 14px;text-align:center;display:flex;flex-direction:column;gap:6px;box-shadow:0 0 20px ${c.tint}44;transform:translateY(20px) rotate(-3deg);opacity:0;animation:cardReveal 0.6s ease-out ${i * 0.25}s forwards;`;
    card.innerHTML = `
      <div style="font-size:10px;letter-spacing:3px;color:${c.tint};opacity:0.8;">${c.roman}</div>
      <div style="font-size:18px;font-weight:bold;letter-spacing:3px;color:${c.tint};text-shadow:0 0 8px ${c.tint};">${c.name}</div>
      <div style="font-size:10px;font-style:italic;color:#aaa;padding:6px 0;letter-spacing:1px;">${c.flavor}</div>
      <div style="border-top:1px solid ${c.tint}55;margin:2px 0;padding-top:6px;font-size:11px;color:#d8d4ea;line-height:1.4;min-height:42px;">${c.desc}</div>
      <div style="font-size:9px;letter-spacing:2px;color:${c.positive ? '#86e3a8' : '#d85a5a'};opacity:0.7;margin-top:2px;">${c.positive ? '◆ BOON' : '◆ BURDEN'}</div>
    `;
    row.appendChild(card);
  }
  // Subtitle updates with how many cards seen
  document.getElementById('tarotSubtitle').innerHTML = `three cards drawn. three fates set.<br/><span style="font-size:10px;opacity:0.55;letter-spacing:2px;margin-top:4px;display:inline-block;">${seenCount()} / ${totalCards()} cards glimpsed in the deck</span>`;
  // Audio sting
  synthChord(440, 1.0, 1.4);
  setTimeout(() => synthChord(659, 0.8, 1.2), 250);
  setTimeout(() => synthChord(880, 0.6, 1.0), 500);
}

// Settings modal — accessible from main menu (same panel as pause menu)
const settingsEl = document.createElement('div');
settingsEl.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:radial-gradient(ellipse at center,#140a18 0%,#0a0610 65%,#050308 100%);color:#ddd;pointer-events:auto;font-family:Georgia,"Cormorant Garamond",serif;padding:24px;box-sizing:border-box;';
settingsEl.innerHTML = `
  <!-- Page frame + vignette -->
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center, transparent 28%, rgba(4,2,6,0.55) 78%, rgba(0,0,0,0.85) 100%);pointer-events:none;"></div>
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

  <div style="position:relative;display:flex;flex-direction:column;align-items:center;z-index:1;">
    <div style="display:flex;align-items:center;gap:22px;margin-bottom:10px;opacity:0.75;">
      <div style="width:100px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
      <div style="color:#c9a86a;font-size:11px;letter-spacing:6px;font-style:italic;">tune the descent</div>
      <div style="width:100px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
    </div>
    <h1 style="font-size:44px;margin:0;letter-spacing:10px;color:#f4d9a0;text-shadow:0 0 14px rgba(244,217,160,0.4);font-weight:400;line-height:1;">SETTINGS</h1>
    <div style="display:flex;align-items:center;gap:12px;margin:10px 0 32px;opacity:0.6;">
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);"></span>
      <p style="margin:0;letter-spacing:5px;font-size:11px;font-style:italic;color:#d8cfae;">adjust to taste</p>
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);"></span>
    </div>
    <div style="display:grid;grid-template-columns:auto 220px auto;gap:16px 20px;background:linear-gradient(180deg,rgba(30,22,16,0.85),rgba(14,10,8,0.9));box-shadow:inset 0 0 0 1px rgba(201,168,106,0.28), inset 0 0 14px rgba(0,0,0,0.5);padding:22px 30px;font-size:13px;color:#d8cfae;align-items:center;font-family:Georgia,serif;">
      <div style="opacity:0.7;letter-spacing:2px;">SFX Volume</div><input id="menuSetSfx" type="range" min="0" max="100" step="1" style="accent-color:#c9a86a;" /><div id="menuSetSfxVal" style="opacity:0.6;font-size:11px;width:36px;text-align:right;color:#c9a86a;"></div>
      <div style="opacity:0.7;letter-spacing:2px;">Music Volume</div><input id="menuSetMusic" type="range" min="0" max="100" step="1" style="accent-color:#c9a86a;" /><div id="menuSetMusicVal" style="opacity:0.6;font-size:11px;width:36px;text-align:right;color:#c9a86a;"></div>
      <div style="opacity:0.7;letter-spacing:2px;">Screen Shake</div><input id="menuSetShake" type="range" min="0" max="150" step="1" style="accent-color:#c9a86a;" /><div id="menuSetShakeVal" style="opacity:0.6;font-size:11px;width:36px;text-align:right;color:#c9a86a;"></div>
    </div>
    <div style="font-size:10px;opacity:0.5;margin-top:18px;max-width:440px;text-align:center;font-style:italic;letter-spacing:2px;line-height:1.5;color:#c9a86a;">shake also scales the camera zoom-pulse \u00b7 set to 0 to disable all screen motion</div>
    <button id="menuSettingsBackBtn" style="background:transparent;color:#8a4848;border:0;padding:8px 20px;font-size:11px;cursor:pointer;letter-spacing:5px;margin-top:32px;font-family:Georgia,serif;font-style:italic;font-weight:bold;transition:all 0.22s ease;opacity:0.75;">\u2190 BACK</button>
  </div>
`;
document.getElementById('hud').appendChild(settingsEl);
document.getElementById('menuSettingsBackBtn').addEventListener('click', () => {
  settingsEl.style.display = 'none';
  menuEl.style.display = 'flex';
});
// Wire sliders to the same settings system as pause menu
document.getElementById('menuSetSfx').addEventListener('input', (e) => {
  setSfxVolume(parseInt(e.target.value, 10) / 100);
  document.getElementById('menuSetSfxVal').textContent = e.target.value + '%';
});
document.getElementById('menuSetMusic').addEventListener('input', (e) => {
  setMusicVolumeSetting(parseInt(e.target.value, 10) / 100);
  document.getElementById('menuSetMusicVal').textContent = e.target.value + '%';
});
document.getElementById('menuSetShake').addEventListener('input', (e) => {
  setShakeScaleSetting(parseInt(e.target.value, 10) / 100);
  document.getElementById('menuSetShakeVal').textContent = e.target.value + '%';
});

function showSettingsModal() {
  hideAllOverlays();
  settingsEl.style.display = 'flex';
  // Sync slider positions with current settings
  document.getElementById('menuSetSfx').value = Math.round(settings.sfxVolume * 100);
  document.getElementById('menuSetMusic').value = Math.round(settings.musicVolume * 100);
  document.getElementById('menuSetShake').value = Math.round(settings.shakeScale * 100);
  document.getElementById('menuSetSfxVal').textContent = Math.round(settings.sfxVolume * 100) + '%';
  document.getElementById('menuSetMusicVal').textContent = Math.round(settings.musicVolume * 100) + '%';
  document.getElementById('menuSetShakeVal').textContent = Math.round(settings.shakeScale * 100) + '%';
}

// Curses modal — toggle run-difficulty modifiers
const cursesEl = document.createElement('div');
cursesEl.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:radial-gradient(ellipse at center,#1a0a10 0%,#0a0610 65%,#050308 100%);color:#ddd;pointer-events:auto;font-family:Georgia,serif;padding:24px;box-sizing:border-box;';
cursesEl.innerHTML = `
  <!-- Ornamental frame -->
  <div style="display:flex;align-items:center;gap:18px;margin-bottom:8px;opacity:0.75;animation:winFadeIn 0.6s ease-out;">
    <div style="width:110px;height:1px;background:linear-gradient(90deg,transparent,#a04040,transparent);"></div>
    <div style="color:#a04040;font-size:12px;letter-spacing:5px;font-style:italic;">— accept suffering, be rewarded —</div>
    <div style="width:110px;height:1px;background:linear-gradient(90deg,transparent,#a04040,transparent);"></div>
  </div>
  <h1 style="font-size:48px;margin:0 0 4px;letter-spacing:8px;color:#d85a5a;font-family:Georgia,serif;font-weight:400;text-shadow:0 0 18px rgba(216,90,90,0.45);animation:winFadeIn 0.7s ease-out 0.1s both;">CURSES</h1>
  <p style="margin:0 0 22px;opacity:0.55;letter-spacing:4px;font-size:13px;font-style:italic;animation:winFadeIn 0.6s ease-out 0.2s both;">the ruin remembers every bargain</p>
  <div id="curseEssMul" style="font-size:14px;color:#a0e8ff;letter-spacing:3px;margin-bottom:22px;animation:winFadeIn 0.6s ease-out 0.3s both;min-height:18px;"></div>
  <div id="cursesRow" style="display:grid;grid-template-columns:repeat(3, 240px);gap:14px;margin-bottom:22px;animation:winCardSlide 0.55s ease-out 0.4s both;"></div>
  <button id="cursesCloseBtn" style="background:transparent;color:#a97070;border:1px solid #5a3030;padding:10px 32px;font-size:12px;cursor:pointer;letter-spacing:4px;font-family:Georgia,serif;font-style:italic;transition:all 0.18s ease;animation:winFadeIn 0.5s ease-out 0.6s both;">← RETURN</button>
`;
document.getElementById('hud').appendChild(cursesEl);
document.getElementById('cursesCloseBtn').addEventListener('click', () => {
  cursesEl.style.display = 'none';
  showMainMenu();
});

function showCursesModal() {
  hideAllOverlays();
  cursesEl.style.display = 'flex';
  renderCursesGrid();
}

// ============================================================================
// MEMORY WEAVE — modal for selecting the Memory that will shape the next run.
// Unlocked memories show as full cards; locked ones are silhouetted with a
// cryptic hint. Picking one persists the choice; picking "(none)" clears it.
// ============================================================================
const memoryEl = document.createElement('div');
memoryEl.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:radial-gradient(ellipse at center,#140a18 0%,#0a0610 65%,#050308 100%);color:#ddd;pointer-events:auto;font-family:Georgia,"Cormorant Garamond",serif;padding:40px 24px;box-sizing:border-box;overflow-y:auto;';
memoryEl.innerHTML = `
  <!-- Page-frame corners + deep vignette — shared manuscript grammar -->
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center, transparent 28%, rgba(4,2,6,0.55) 78%, rgba(0,0,0,0.85) 100%);pointer-events:none;"></div>
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

  <div style="position:relative;display:flex;flex-direction:column;align-items:center;z-index:1;width:100%;max-width:960px;">
    <div style="display:flex;align-items:center;gap:22px;margin-bottom:10px;opacity:0.75;">
      <div style="width:100px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
      <div style="color:#c9a86a;font-size:11px;letter-spacing:6px;font-style:italic;">what you have forgotten to forget</div>
      <div style="width:100px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
    </div>
    <h1 style="font-size:48px;margin:0;letter-spacing:10px;color:#f4d9a0;text-shadow:0 0 18px rgba(244,217,160,0.45);font-weight:400;line-height:1;">MEMORY</h1>
    <div style="display:flex;align-items:center;gap:12px;margin:10px 0 18px;opacity:0.65;">
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);"></span>
      <p id="memoryProgress" style="margin:0;letter-spacing:5px;font-size:12px;font-style:italic;color:#d8cfae;"></p>
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);"></span>
    </div>
    <p style="margin:0 0 22px;opacity:0.6;letter-spacing:2px;font-size:12px;font-style:italic;max-width:620px;text-align:center;line-height:1.55;">A memory is a shape you carry into the dark. A pact with a version of yourself that can no longer speak but can still bargain. Choose one, and descend as that.</p>
    <div id="memoryGrid" style="display:grid;grid-template-columns:repeat(3, 280px);gap:14px;margin-bottom:22px;max-height:500px;overflow-y:auto;padding:4px;"></div>
    <button id="memoryClearBtn" style="background:transparent;color:#8a7a6a;border:1px solid #4a3a2a;padding:8px 24px;font-size:11px;cursor:pointer;letter-spacing:4px;font-family:Georgia,serif;font-style:italic;margin-bottom:14px;transition:all 0.2s ease;">— forget them all —</button>
    <button id="memoryCloseBtn" style="background:transparent;color:#8a4848;border:0;padding:8px 20px;font-size:11px;cursor:pointer;letter-spacing:5px;font-family:Georgia,serif;font-style:italic;font-weight:bold;transition:all 0.22s ease;opacity:0.75;">\u2190 RETURN</button>
  </div>
`;
document.getElementById('hud').appendChild(memoryEl);
document.getElementById('memoryCloseBtn').addEventListener('click', () => {
  memoryEl.style.display = 'none';
  showMainMenu();
});
document.getElementById('memoryClearBtn').addEventListener('click', () => {
  setSelectedMemory(null);
  renderMemoryGrid();
  updateMenuMemoryLabel();
});

function showMemoryModal() {
  hideAllOverlays();
  memoryEl.style.display = 'flex';
  renderMemoryGrid();
}

function renderMemoryGrid() {
  const grid = document.getElementById('memoryGrid');
  const progress = document.getElementById('memoryProgress');
  grid.innerHTML = '';
  // ASCENSION V — when Memory is neutralized for this run, communicate
  // loudly BEFORE the player wastes a pick choosing one. The progress line
  // doubles as the alert channel; regular text when clean, crimson when the
  // memory slot is silenced.
  const am = (typeof window !== 'undefined' && window.__ascensionModifiers) ? window.__ascensionModifiers() : {};
  if (am && am.memoryDisabled) {
    progress.innerHTML = `<span style="color:#d8556a;text-shadow:0 0 10px rgba(216,85,106,0.45);">\u26A0 MEMORY SLOT NEUTRALIZED — Ascension V</span>
      <span style="display:block;font-size:9px;color:#a89b82;font-style:italic;margin-top:2px;opacity:0.8;">the selection you make will have no effect this descent</span>`;
  } else {
    progress.textContent = `${memoriesUnlockedCount()} of ${totalMemories()} remembered`;
  }
  for (const id of ALL_MEMORY_IDS) {
    const def = MEMORIES[id];
    const unlocked = unlockedMemories.has(id);
    const selected = selectedMemoryId === id;
    const card = document.createElement('button');
    const accent = def.tint || '#c9a86a';
    card.style.cssText = `
      background: linear-gradient(180deg, rgba(24,18,14,0.92), rgba(12,8,6,0.95));
      border: 0;
      padding: 16px 18px;
      cursor: ${unlocked ? 'pointer' : 'default'};
      font-family: Georgia, serif;
      text-align: left;
      opacity: ${unlocked ? 1 : 0.45};
      box-shadow: ${selected
        ? `inset 0 0 0 2px ${accent}, 0 0 22px ${accent}66, inset 0 0 14px rgba(0,0,0,0.5)`
        : `inset 0 0 0 1px ${unlocked ? accent+'55' : 'rgba(201,168,106,0.15)'}, inset 0 0 14px rgba(0,0,0,0.5)`};
      transition: all 0.2s ease;
      color: #d8cfae;
    `;
    if (unlocked) {
      card.onmouseenter = () => { card.style.transform = 'translateY(-2px)'; card.style.boxShadow = `inset 0 0 0 1px ${accent}, 0 0 20px ${accent}55, inset 0 0 14px rgba(0,0,0,0.5)`; };
      card.onmouseleave = () => { card.style.transform = ''; renderMemoryGrid(); };
    }
    const name = unlocked ? def.name : '— forgotten —';
    const flavor = unlocked ? def.flavor : def.unlockHint;
    const gift = unlocked ? `<div style="color:${accent};font-size:10px;letter-spacing:3px;font-weight:bold;margin-top:10px;">GIFT</div><div style="font-size:11px;line-height:1.45;margin-top:3px;">${def.gift}</div>` : '';
    const constraint = unlocked ? `<div style="color:#a06060;font-size:10px;letter-spacing:3px;font-weight:bold;margin-top:8px;">BOND</div><div style="font-size:11px;line-height:1.45;margin-top:3px;opacity:0.85;">${def.constraint}</div>` : '';
    const sel = selected ? `<div style="color:${accent};font-size:10px;letter-spacing:4px;font-weight:bold;margin-top:12px;text-shadow:0 0 8px ${accent}88;">\u2766 CHOSEN</div>` : '';
    card.innerHTML = `
      <div style="color:${unlocked ? accent : '#6a5c48'};font-size:13px;letter-spacing:2.5px;font-weight:bold;margin-bottom:6px;${unlocked ? `text-shadow:0 0 8px ${accent}55;` : ''}">${name}</div>
      <div style="font-size:11px;font-style:italic;opacity:0.7;line-height:1.5;min-height:36px;">${flavor}</div>
      ${gift}
      ${constraint}
      ${sel}
    `;
    if (unlocked) {
      card.onclick = () => {
        setSelectedMemory(selected ? null : id);
        renderMemoryGrid();
        updateMenuMemoryLabel();
      };
    }
    grid.appendChild(card);
  }
}

// ============================================================================
// LIVING HAMLET — hub screen between main menu and descent. Painted backdrop
// with clickable NPC hotspots. Replaces the flat essence shop (the Keeper
// NPC now holds the essence shop as HIS service). As more NPCs arrive
// (triggered by player records), the hamlet visibly grows.
//
// Phase 1 ships Keeper + Smith + Archivist + placeholder painted backdrop.
// Phase 2 will add Oracle, Gravekeeper, Wanderer, and multi-state backdrops.
// ============================================================================
const hamletEl = document.createElement('div');
// Painted hamlet backdrop (Nano Banana, Apr 2026) — dusk-lit ruined village
// with a forge on the left, a central firepit, and a domed scriptorium on
// the right. Characters layer on top. The painting carries the scene; we
// only overlay: a breathing firepit flicker for the center flame, two
// conditional NPC-activated light pools, and ember particles for motion.
hamletEl.style.cssText = `
  position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;
  background:#050308 url(assets/hamlet/hamlet_backdrop.jpg) center/cover no-repeat;
  color:#ddd;pointer-events:auto;font-family:Georgia,"Cormorant Garamond",serif;padding:24px;box-sizing:border-box;overflow:hidden;
`;
hamletEl.innerHTML = `
  <!-- CENTRAL FIREPIT FLICKER — overlays the painted firepit so the flame
       breathes instead of sitting static. Small footprint, tucked right
       over the painted flame location. -->
  <div id="hamletFirePit" style="position:absolute;left:50%;bottom:26%;transform:translate(-50%,0);width:240px;height:180px;background:
    radial-gradient(ellipse at 50% 100%, rgba(255,150,60,0.45) 0%, rgba(255,100,40,0.18) 30%, rgba(200,70,30,0.05) 60%, transparent 85%);
    pointer-events:none;filter:blur(2px);animation:hamletFireBreathe 2.6s ease-in-out infinite;mix-blend-mode:screen;"></div>

  <!-- Secondary light pools — brighten the painted forge doorway / painted
       scriptorium windows when the relevant NPC is present. Adds a small
       "the hamlet is a little warmer now that X arrived" feedback loop. -->
  <div id="hamletForgeGlow" style="position:absolute;left:13%;bottom:30%;width:200px;height:180px;background:radial-gradient(ellipse at 50% 60%, rgba(255,120,60,0.35), transparent 70%);pointer-events:none;opacity:0;transition:opacity 1.2s ease;filter:blur(3px);mix-blend-mode:screen;"></div>
  <div id="hamletArchiveGlow" style="position:absolute;right:13%;bottom:30%;width:200px;height:180px;background:radial-gradient(ellipse at 50% 60%, rgba(150,190,240,0.28), transparent 70%);pointer-events:none;opacity:0;transition:opacity 1.2s ease;filter:blur(3px);mix-blend-mode:screen;"></div>

  <!-- EMBER PARTICLES (same style as menu) -->
  <canvas id="hamletEmbers" width="1280" height="720" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;mix-blend-mode:screen;opacity:0.85;"></canvas>

  <!-- Page-frame corners -->
  <div style="position:absolute;top:28px;left:28px;width:70px;height:70px;pointer-events:none;">
    <div style="position:absolute;top:0;left:0;width:70px;height:1px;background:linear-gradient(90deg,#f4d9a0,transparent);box-shadow:0 0 6px rgba(244,217,160,0.4);"></div>
    <div style="position:absolute;top:0;left:0;width:1px;height:70px;background:linear-gradient(180deg,#f4d9a0,transparent);box-shadow:0 0 6px rgba(244,217,160,0.4);"></div>
    <div style="position:absolute;top:-2px;left:-2px;width:5px;height:5px;background:#f4d9a0;transform:rotate(45deg);"></div>
  </div>
  <div style="position:absolute;top:28px;right:28px;width:70px;height:70px;pointer-events:none;">
    <div style="position:absolute;top:0;right:0;width:70px;height:1px;background:linear-gradient(270deg,#f4d9a0,transparent);box-shadow:0 0 6px rgba(244,217,160,0.4);"></div>
    <div style="position:absolute;top:0;right:0;width:1px;height:70px;background:linear-gradient(180deg,#f4d9a0,transparent);box-shadow:0 0 6px rgba(244,217,160,0.4);"></div>
    <div style="position:absolute;top:-2px;right:-2px;width:5px;height:5px;background:#f4d9a0;transform:rotate(45deg);"></div>
  </div>
  <div style="position:absolute;bottom:28px;left:28px;width:70px;height:70px;pointer-events:none;">
    <div style="position:absolute;bottom:0;left:0;width:70px;height:1px;background:linear-gradient(90deg,#f4d9a0,transparent);box-shadow:0 0 6px rgba(244,217,160,0.4);"></div>
    <div style="position:absolute;bottom:0;left:0;width:1px;height:70px;background:linear-gradient(0deg,#f4d9a0,transparent);box-shadow:0 0 6px rgba(244,217,160,0.4);"></div>
    <div style="position:absolute;bottom:-2px;left:-2px;width:5px;height:5px;background:#f4d9a0;transform:rotate(45deg);"></div>
  </div>
  <div style="position:absolute;bottom:28px;right:28px;width:70px;height:70px;pointer-events:none;">
    <div style="position:absolute;bottom:0;right:0;width:70px;height:1px;background:linear-gradient(270deg,#f4d9a0,transparent);box-shadow:0 0 6px rgba(244,217,160,0.4);"></div>
    <div style="position:absolute;bottom:0;right:0;width:1px;height:70px;background:linear-gradient(0deg,#f4d9a0,transparent);box-shadow:0 0 6px rgba(244,217,160,0.4);"></div>
    <div style="position:absolute;bottom:-2px;right:-2px;width:5px;height:5px;background:#f4d9a0;transform:rotate(45deg);"></div>
  </div>

  <!-- Header (top, floats above backdrop) -->
  <div style="position:absolute;top:40px;left:0;right:0;text-align:center;z-index:2;pointer-events:none;">
    <div style="display:flex;align-items:center;justify-content:center;gap:22px;margin-bottom:8px;opacity:0.75;">
      <div style="width:110px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
      <div style="color:#c9a86a;font-size:11px;letter-spacing:6px;font-style:italic;">what was undone, being undone less</div>
      <div style="width:110px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
    </div>
    <h1 style="font-size:54px;margin:0;letter-spacing:12px;color:#f4d9a0;text-shadow:0 0 18px rgba(244,217,160,0.45);font-weight:400;line-height:1;">HAMLET</h1>
    <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-top:8px;opacity:0.65;">
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);"></span>
      <p id="hamletProgress" style="margin:0;letter-spacing:4px;font-size:11px;font-style:italic;color:#d8cfae;"></p>
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);"></span>
    </div>
  </div>

  <!-- FUSION SHRINES — for each discovered fusion, a small glowing pedestal
       appears in the hamlet, commemorating the pair of relics that forged
       it. Visible world-state feedback: the hamlet literally grows prettier
       as you discover more of the ruin's secret combinations. -->
  <div id="hamletFusionShrines" style="position:absolute;left:0;right:0;bottom:12%;height:8%;z-index:2;pointer-events:none;"></div>

  <!-- NPC LAYER — each NPC is positioned absolutely per their data.x/y% -->
  <div id="hamletNpcLayer" style="position:absolute;inset:0;z-index:2;"></div>

  <!-- Hamlet essence + chronicles counters, bottom-left/right -->
  <div style="position:absolute;bottom:58px;left:120px;display:flex;gap:12px;align-items:center;font-family:Georgia,serif;z-index:2;">
    <span style="width:4px;height:4px;background:#a0e8ff;transform:rotate(45deg);opacity:0.7;"></span>
    <div>
      <div style="color:#c9a86a;font-size:9px;letter-spacing:4px;font-weight:bold;opacity:0.7;">ESSENCE BANKED</div>
      <div style="color:#a0e8ff;font-size:16px;font-weight:bold;letter-spacing:2px;text-shadow:0 0 8px rgba(160,232,255,0.35);"><span id="hamletEssenceValue">0</span></div>
    </div>
  </div>
  <div style="position:absolute;bottom:58px;right:120px;display:flex;gap:12px;align-items:center;font-family:Georgia,serif;z-index:2;text-align:right;">
    <div>
      <div style="color:#c9a86a;font-size:9px;letter-spacing:4px;font-weight:bold;opacity:0.7;">NPCS ARRIVED</div>
      <div style="color:#f4d9a0;font-size:16px;font-weight:bold;letter-spacing:2px;"><span id="hamletNpcCount">0</span><span style="opacity:0.4;font-size:12px;"> / <span id="hamletNpcTotal">0</span></span></div>
    </div>
    <span style="width:4px;height:4px;background:#c9a86a;transform:rotate(45deg);opacity:0.7;"></span>
  </div>

  <!-- Return link, bottom center -->
  <button id="hamletBackBtn" style="position:absolute;bottom:40px;left:50%;transform:translateX(-50%);background:transparent;color:#8a7a6a;border:0;padding:8px 20px;font-size:11px;cursor:pointer;letter-spacing:5px;font-family:Georgia,serif;font-style:italic;font-weight:bold;transition:all 0.22s ease;opacity:0.75;z-index:2;">\u2190 LEAVE THE HAMLET</button>
`;
document.getElementById('hud').appendChild(hamletEl);
document.getElementById('hamletBackBtn').addEventListener('click', () => {
  hamletEl.style.display = 'none';
  showMainMenu();
});

// Hover style on the hamlet back button
document.getElementById('hamletBackBtn').addEventListener('mouseenter', (e) => {
  e.target.style.color = '#f4d9a0';
  e.target.style.opacity = '1';
  e.target.style.textShadow = '0 0 10px rgba(244,217,160,0.45)';
});
document.getElementById('hamletBackBtn').addEventListener('mouseleave', (e) => {
  e.target.style.color = '#8a7a6a';
  e.target.style.opacity = '0.75';
  e.target.style.textShadow = 'none';
});

function showHamlet() {
  hideAllOverlays();
  // Ambient audio — warmer hamlet pad with soft fire crackles. Crossfades
  // from the menu pad.
  startAmbientPad('hamlet');
  // Re-check NPC presence in case records advanced since last visit
  refreshNpcPresence(records, stats, { seenRelicIds });
  hamletEl.style.display = 'flex';
  renderHamlet();
  // Onboarding tip — fires once to explain the hamlet as a persistent hub.
  setTimeout(() => showTip('first_hamlet'), 500);
}

function renderHamlet() {
  // Header progress line
  const prog = document.getElementById('hamletProgress');
  const npcN = presentNpcCount();
  const npcT = totalNpcs();
  if (prog) {
    prog.textContent = npcN >= npcT
      ? 'every lantern kindled'
      : `${npcN} of ${npcT} souls returned`;
  }
  document.getElementById('hamletEssenceValue').textContent = (meta.essence | 0);
  document.getElementById('hamletNpcCount').textContent = npcN;
  document.getElementById('hamletNpcTotal').textContent = npcT;

  // Dim/brighten ambient light pools based on which NPCs are present
  const forgeGlow = document.getElementById('hamletForgeGlow');
  const archGlow = document.getElementById('hamletArchiveGlow');
  if (forgeGlow) forgeGlow.style.opacity = hamletState.npcArcStage.smith !== undefined ? '1' : '0';
  if (archGlow) archGlow.style.opacity = hamletState.npcArcStage.archivist !== undefined ? '1' : '0';

  // FUSION SHRINES — one small glowing pedestal per discovered fusion,
  // scattered across the foreground of the hamlet. Each shrine uses its
  // fusion's tint so they read as a constellation of your discoveries.
  // Hamlet literally grows prettier with every new fusion you find.
  const shrines = document.getElementById('hamletFusionShrines');
  if (shrines) {
    shrines.innerHTML = '';
    const fusionIds = [...discoveredFusions];
    // Deterministic left-to-right placement across 15%..85% so shrines don't
    // jump around as new ones are discovered (they only ever append).
    const n = fusionIds.length;
    if (n > 0) {
      const slotWidth = Math.min(70 / n, 9);        // % width per shrine slot
      for (let i = 0; i < n; i++) {
        const id = fusionIds[i];
        const fusion = FUSIONS[id];
        if (!fusion) continue;
        const xPct = 15 + slotWidth * (i + 0.5);
        const shrine = document.createElement('div');
        const tint = fusion.tint || '#c9a86a';
        shrine.style.cssText = `
          position:absolute;
          left:${xPct}%;
          bottom:0;
          transform:translateX(-50%);
          width:24px;height:40px;
          pointer-events:none;
          display:flex;flex-direction:column;align-items:center;justify-content:flex-end;
        `;
        shrine.title = fusion.name;      // native tooltip
        shrine.innerHTML = `
          <!-- Orb glow -->
          <div style="position:absolute;bottom:14px;width:40px;height:40px;background:radial-gradient(circle, ${tint}aa 0%, ${tint}44 40%, transparent 75%);filter:blur(1px);animation:ctaHaloBreathe 3.2s ease-in-out infinite;"></div>
          <!-- Orb core -->
          <div style="position:absolute;bottom:22px;width:10px;height:10px;background:${tint};border-radius:50%;box-shadow:0 0 8px ${tint};"></div>
          <!-- Pedestal -->
          <div style="width:12px;height:14px;background:linear-gradient(180deg, rgba(80,70,60,0.9), rgba(40,30,25,0.9));box-shadow:inset 0 0 0 1px rgba(180,150,110,0.4);"></div>
        `;
        shrines.appendChild(shrine);
      }
    }
  }

  // NPC hotspots — render a larger framed portrait for each present NPC,
  // grounded in the village scene with a warm light pool + parchment plaque.
  const layer = document.getElementById('hamletNpcLayer');
  layer.innerHTML = '';
  for (const id of ALL_NPC_IDS) {
    const def = NPCS[id];
    const present = hamletState.npcArcStage[id] !== undefined;
    if (!present) continue;

    const hotspot = document.createElement('button');
    const unread = hasUnreadDialogue(id);
    // Six NPCs fit across the painted hamlet at 2000px viewport: 170px per
    // hotspot × 6 + ~200px gaps. Portrait is 128px (was 160); readable and
    // stylized, pixel art reads even at small sizes thanks to the tinted frame.
    hotspot.style.cssText = `
      position:absolute;
      left:${def.x}%;
      top:${def.y}%;
      transform:translate(-50%,-50%);
      width:170px;height:220px;
      background:transparent;
      border:0;
      cursor:pointer;
      padding:0;
      display:flex;flex-direction:column;align-items:center;justify-content:flex-end;
      transition:all 0.3s ease;
      z-index:3;
    `;
    hotspot.onmouseenter = () => {
      hotspot.style.transform = 'translate(-50%,-50%) scale(1.05)';
      hotspot.style.filter = `brightness(1.18) drop-shadow(0 0 24px ${def.tint}88)`;
    };
    hotspot.onmouseleave = () => {
      hotspot.style.transform = 'translate(-50%,-50%)';
      hotspot.style.filter = '';
    };
    // Portrait — 128px square with tint-colored frame. Silhouette fallback
    // if the image hasn't loaded (e.g. before Nano Banana portraits arrive).
    const portraitImg = imageCache[def.portrait];
    const portraitHtml = portraitImg
      ? `<img class="hamletNpcPortrait" src="${portraitImg.src}" style="width:128px;height:128px;object-fit:cover;background:radial-gradient(ellipse at 50% 55%, ${def.tint}22 0%, rgba(8,4,12,0.85) 70%);box-shadow:inset 0 0 0 2px ${def.tint}, 0 0 22px ${def.tint}55, 0 6px 18px rgba(0,0,0,0.55);"/>`
      : `<div style="width:128px;height:128px;background:radial-gradient(ellipse at 40% 35%, ${def.tint}55, rgba(14,8,18,0.9) 70%);box-shadow:inset 0 0 0 2px ${def.tint}, 0 0 22px ${def.tint}55, 0 6px 18px rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;color:${def.tint};font-size:40px;font-weight:bold;font-family:Georgia,serif;">${def.name.charAt(4) || def.name.charAt(0)}</div>`;
    // Warm ground glow pooled UNDER the NPC — makes them feel grounded on
    // the stone square rather than floating in space.
    const groundGlow = `<div style="position:absolute;bottom:28px;left:50%;transform:translateX(-50%);width:180px;height:24px;background:radial-gradient(ellipse at 50% 50%, ${def.tint}55 0%, ${def.tint}22 40%, transparent 80%);pointer-events:none;filter:blur(3px);"></div>`;
    // Unread-dialogue pulsing gold dot
    const unreadDot = unread ? `<div style="position:absolute;top:-4px;right:12px;width:12px;height:12px;background:#f4d9a0;border-radius:50%;box-shadow:0 0 12px rgba(244,217,160,0.9);animation:ctaHaloBreathe 1.8s ease-in-out infinite;"></div>` : '';
    // Illuminated-manuscript plaque below the portrait — parchment-toned
    // backing with gold serif name and subtle gold hairline.
    const plaqueHtml = `
      <div style="position:relative;margin-top:10px;padding:6px 18px;background:linear-gradient(180deg, rgba(40,28,18,0.92) 0%, rgba(22,14,8,0.95) 100%);box-shadow:inset 0 0 0 1px ${def.tint}aa, 0 0 14px ${def.tint}44;">
        <div style="color:${def.tint};font-size:12px;letter-spacing:4px;font-weight:bold;font-family:Georgia,serif;text-shadow:0 0 6px ${def.tint}77;">${def.name.replace(/^The /,'').toUpperCase()}</div>
      </div>
    `;
    hotspot.innerHTML = `
      ${groundGlow}
      <div style="position:relative;">
        ${portraitHtml}
        ${unreadDot}
      </div>
      ${plaqueHtml}
    `;
    hotspot.onclick = () => openDialogue(id);
    layer.appendChild(hotspot);
  }
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
    max-width:640px;width:92vw;
    background:linear-gradient(180deg, rgba(24,18,14,0.97), rgba(12,8,10,0.98));
    box-shadow:0 0 30px rgba(0,0,0,0.9), inset 0 0 0 1px rgba(201,168,106,0.4), inset 0 0 18px rgba(0,0,0,0.5);
    padding:28px 32px;
    position:relative;
    animation:modalFadeIn 0.3s ease-out;
  ">
    <!-- Top row: portrait + name -->
    <div style="display:flex;align-items:center;gap:18px;margin-bottom:18px;">
      <div id="dialoguePortrait" style="width:72px;height:72px;flex-shrink:0;"></div>
      <div style="flex:1;">
        <div id="dialogueName" style="font-size:22px;letter-spacing:5px;color:#f4d9a0;font-weight:400;margin-bottom:2px;"></div>
        <div id="dialogueTitle" style="font-size:11px;letter-spacing:3px;font-style:italic;opacity:0.6;"></div>
      </div>
    </div>
    <!-- Gold hairline divider -->
    <div style="width:100%;height:1px;background:linear-gradient(90deg, transparent, rgba(201,168,106,0.45), transparent);margin-bottom:18px;"></div>
    <!-- Body: stage text -->
    <div id="dialogueText" style="font-size:14px;line-height:1.75;color:#d8cfae;margin-bottom:22px;min-height:120px;font-style:italic;"></div>
    <!-- Service + close buttons -->
    <div style="display:flex;gap:14px;justify-content:flex-end;align-items:center;">
      <button id="dialogueServiceBtn" style="background:linear-gradient(180deg,#3a2a20,#1a0f08);color:#f4d9a0;border:0;padding:12px 28px;cursor:pointer;letter-spacing:4px;font-family:Georgia,serif;font-size:12px;font-weight:bold;box-shadow:inset 0 0 0 1px #c9a86a, 0 0 14px rgba(201,168,106,0.25);transition:all 0.2s ease;">SERVICE</button>
      <button id="dialogueCloseBtn" style="background:transparent;color:#8a7a6a;border:0;padding:8px 16px;font-size:11px;cursor:pointer;letter-spacing:4px;font-family:Georgia,serif;font-style:italic;transition:all 0.2s ease;">\u2190 FAREWELL</button>
    </div>
  </div>
`;
document.getElementById('hud').appendChild(dialogueEl);
document.getElementById('dialogueCloseBtn').addEventListener('click', () => {
  dialogueEl.style.display = 'none';
});
document.getElementById('dialogueCloseBtn').addEventListener('mouseenter', (e) => {
  e.target.style.color = '#ff9a9a';
  e.target.style.textShadow = '0 0 10px rgba(216,128,128,0.5)';
});
document.getElementById('dialogueCloseBtn').addEventListener('mouseleave', (e) => {
  e.target.style.color = '#8a7a6a';
  e.target.style.textShadow = 'none';
});

let activeDialogueNpcId = null;

function openDialogue(npcId) {
  const def = NPCS[npcId];
  if (!def) return;
  const stage = hamletState.npcArcStage[npcId];
  if (stage === undefined) return;
  activeDialogueNpcId = npcId;
  const stageDef = def.arcStages[stage] || def.arcStages[def.arcStages.length - 1];
  // Name + title
  document.getElementById('dialogueName').textContent = def.name;
  document.getElementById('dialogueName').style.color = def.tint || '#f4d9a0';
  document.getElementById('dialogueName').style.textShadow = `0 0 10px ${def.tint || '#c9a86a'}66`;
  document.getElementById('dialogueTitle').textContent = def.title || '';
  // Portrait
  const portraitEl = document.getElementById('dialoguePortrait');
  const portraitImg = imageCache[def.portrait];
  portraitEl.innerHTML = portraitImg
    ? `<img src="${portraitImg.src}" style="width:72px;height:72px;border-radius:50%;object-fit:cover;box-shadow:0 0 16px ${def.tint}99, inset 0 0 0 2px ${def.tint};"/>`
    : `<div style="width:72px;height:72px;border-radius:50%;background:radial-gradient(ellipse at 40% 35%, ${def.tint}55, rgba(14,8,18,0.9) 70%);box-shadow:0 0 16px ${def.tint}99, inset 0 0 0 2px ${def.tint};display:flex;align-items:center;justify-content:center;color:${def.tint};font-size:26px;font-weight:bold;font-family:Georgia,serif;">${def.name.charAt(4) || def.name.charAt(0)}</div>`;
  // Body text
  const textEl = document.getElementById('dialogueText');
  const paras = Array.isArray(stageDef.text) ? stageDef.text : [stageDef.text];
  textEl.innerHTML = paras.map(p => `<p style="margin:0 0 12px;">${p}</p>`).join('');
  // Mark this stage as read — removes the unread dot on return
  markDialogueSeen(npcId);
  // Wire the service button based on NPC service type
  const svcBtn = document.getElementById('dialogueServiceBtn');
  svcBtn.textContent = def.service.label || 'SERVICE';
  svcBtn.style.color = def.tint || '#f4d9a0';
  svcBtn.style.boxShadow = `inset 0 0 0 1px ${def.tint || '#c9a86a'}, 0 0 14px ${def.tint || '#c9a86a'}44`;
  svcBtn.onclick = () => {
    dialogueEl.style.display = 'none';
    runNpcService(npcId);
  };

  dialogueEl.style.display = 'flex';
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
  showCursesModal();
  const btn = document.getElementById('cursesCloseBtn');
  if (btn) {
    const prev = btn.onclick;
    btn.onclick = () => { btn.onclick = prev; cursesEl.style.display = 'none'; showHamlet(); };
  }
}

// ============================================================================
// ORACLE FORECAST — shows a static lore-accurate map of the ruin's four
// floors: biome name, the enemy families that haunt it, the boss at its
// heart. The forecast is always the same (the ruin doesn't reshape itself)
// but it's meaningful to a new player. Free to consult — this is her arc
// service, not an essence sink.
// ============================================================================
const oracleEl = document.createElement('div');
oracleEl.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:radial-gradient(ellipse at center,#181022 0%,#0a0814 65%,#050308 100%);color:#ddd;pointer-events:auto;font-family:Georgia,"Cormorant Garamond",serif;padding:40px 24px;box-sizing:border-box;';
oracleEl.innerHTML = `
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center, transparent 28%, rgba(4,2,6,0.55) 78%, rgba(0,0,0,0.85) 100%);pointer-events:none;"></div>
  <div style="position:absolute;top:22px;left:22px;width:48px;height:48px;pointer-events:none;">
    <div style="position:absolute;top:0;left:0;width:48px;height:1px;background:linear-gradient(90deg,#b49aff,transparent);"></div>
    <div style="position:absolute;top:0;left:0;width:1px;height:48px;background:linear-gradient(180deg,#b49aff,transparent);"></div>
    <div style="position:absolute;top:-2px;left:-2px;width:4px;height:4px;background:#b49aff;transform:rotate(45deg);"></div>
  </div>
  <div style="position:absolute;top:22px;right:22px;width:48px;height:48px;pointer-events:none;">
    <div style="position:absolute;top:0;right:0;width:48px;height:1px;background:linear-gradient(270deg,#b49aff,transparent);"></div>
    <div style="position:absolute;top:0;right:0;width:1px;height:48px;background:linear-gradient(180deg,#b49aff,transparent);"></div>
    <div style="position:absolute;top:-2px;right:-2px;width:4px;height:4px;background:#b49aff;transform:rotate(45deg);"></div>
  </div>
  <div style="position:absolute;bottom:22px;left:22px;width:48px;height:48px;pointer-events:none;">
    <div style="position:absolute;bottom:0;left:0;width:48px;height:1px;background:linear-gradient(90deg,#b49aff,transparent);"></div>
    <div style="position:absolute;bottom:0;left:0;width:1px;height:48px;background:linear-gradient(0deg,#b49aff,transparent);"></div>
    <div style="position:absolute;bottom:-2px;left:-2px;width:4px;height:4px;background:#b49aff;transform:rotate(45deg);"></div>
  </div>
  <div style="position:absolute;bottom:22px;right:22px;width:48px;height:48px;pointer-events:none;">
    <div style="position:absolute;bottom:0;right:0;width:48px;height:1px;background:linear-gradient(270deg,#b49aff,transparent);"></div>
    <div style="position:absolute;bottom:0;right:0;width:1px;height:48px;background:linear-gradient(0deg,#b49aff,transparent);"></div>
    <div style="position:absolute;bottom:-2px;right:-2px;width:4px;height:4px;background:#b49aff;transform:rotate(45deg);"></div>
  </div>

  <div style="position:relative;display:flex;flex-direction:column;align-items:center;z-index:1;max-width:820px;width:100%;">
    <div style="display:flex;align-items:center;gap:22px;margin-bottom:10px;opacity:0.75;">
      <div style="width:110px;height:1px;background:linear-gradient(90deg,transparent,#b49aff,transparent);"></div>
      <div style="color:#b49aff;font-size:11px;letter-spacing:6px;font-style:italic;">the forward-dark, remembered</div>
      <div style="width:110px;height:1px;background:linear-gradient(90deg,transparent,#b49aff,transparent);"></div>
    </div>
    <h1 style="font-size:44px;margin:0;letter-spacing:10px;color:#d8c4ff;text-shadow:0 0 18px rgba(180,154,255,0.45);font-weight:400;line-height:1;">THE PATH</h1>
    <p style="margin:14px 0 26px;opacity:0.6;letter-spacing:1.5px;font-size:11px;font-style:italic;max-width:560px;text-align:center;line-height:1.55;">Four floors. Four shapes of hunger. I cannot tell you how they end — only what they are.</p>
    <div id="oracleFloors" style="display:flex;flex-direction:column;gap:14px;width:100%;"></div>
    <button id="oracleCloseBtn" style="margin-top:22px;background:transparent;color:#8a4848;border:0;padding:8px 20px;font-size:11px;cursor:pointer;letter-spacing:5px;font-family:Georgia,serif;font-style:italic;font-weight:bold;transition:all 0.22s ease;opacity:0.75;">\u2190 LOOK AWAY</button>
  </div>
`;
document.getElementById('hud').appendChild(oracleEl);
document.getElementById('oracleCloseBtn').addEventListener('click', () => {
  oracleEl.style.display = 'none';
  showHamlet();
});

// The forecast is static lore-accurate data. Could be made dynamic later
// (e.g., different omens per day, tarot-aware), but the "remember forward"
// framing makes the unchanging nature feel intentional.
const ORACLE_FORECAST = [
  { name: 'The Undercroft',      roman: 'I',   enemies: 'slimes, skeletons',
    bossLine: 'A captain in rusted armor, long unburied, waits in its heart.',
    tint: '#86e3a8' },
  { name: 'The Forgotten Vault', roman: 'II',  enemies: 'orcs, archers, bone captains',
    bossLine: 'The iron king who refused to stop. Blue fire, broken crown.',
    tint: '#a0d8ff' },
  { name: 'The Abyss',           roman: 'III', enemies: 'bonecaps, brood, lancers',
    bossLine: 'She waits in her webs. She has waited a very long time.',
    tint: '#d85a5a' },
  { name: 'The Inferno',         roman: 'IV',  enemies: 'embers, priests, wizards',
    bossLine: 'A volcano that learned the shape of a man.',
    tint: '#ff8040' },
];

function showOracleForecast() {
  hideAllOverlays();
  const listEl = document.getElementById('oracleFloors');
  listEl.innerHTML = '';
  for (const f of ORACLE_FORECAST) {
    const row = document.createElement('div');
    row.style.cssText = `
      background: linear-gradient(180deg, rgba(24,18,28,0.88), rgba(12,8,14,0.92));
      padding: 14px 20px;
      box-shadow: inset 0 0 0 1px ${f.tint}55, inset 0 0 14px rgba(0,0,0,0.4);
      font-family: Georgia, serif;
      display: grid;
      grid-template-columns: 50px 1fr;
      gap: 20px;
      align-items: center;
    `;
    row.innerHTML = `
      <div style="color:${f.tint};font-size:26px;font-weight:400;letter-spacing:4px;text-align:center;text-shadow:0 0 8px ${f.tint}66;">${f.roman}</div>
      <div>
        <div style="color:${f.tint};font-size:15px;letter-spacing:4px;font-weight:bold;margin-bottom:4px;text-shadow:0 0 6px ${f.tint}44;">${f.name.toUpperCase()}</div>
        <div style="color:#d8cfae;font-size:11px;letter-spacing:1.5px;opacity:0.8;margin-bottom:3px;">you will meet: <span style="color:${f.tint};font-style:italic;">${f.enemies}</span></div>
        <div style="color:#d8cfae;font-size:11px;letter-spacing:1px;opacity:0.7;font-style:italic;line-height:1.5;">${f.bossLine}</div>
      </div>
    `;
    listEl.appendChild(row);
  }
  oracleEl.style.display = 'flex';
  // Record service use and advance the Oracle's arc (free service — her
  // value is narrative, not essence-sunk)
  recordServiceUse('oracle');
}

// ============================================================================
// WANDERER GIFT — pay essence for a random COMMON relic banked as heirloom
// for the next run. Cheaper than Smith's specific pick (30 vs 40+) but
// you don't get to choose which one. Pulls only from discovered relics.
// ============================================================================
const WANDERER_GIFT_COST = 30;

function showWandererGift() {
  // Pull common relics the player has actually seen
  const pool = ALL_RELIC_IDS.filter(id => {
    const def = RELIC_DEFS[id];
    return seenRelicIds.has(id) && (def.tier || 'common') === 'common';
  });
  if (!pool.length) {
    alert('The Wanderer rummages in his pack, frowns, and shakes his head. "Nothing to give you yet. Come back when you have seen more.');
    return;
  }
  if (meta.essence < WANDERER_GIFT_COST) {
    alert(`The Wanderer waits patiently. You cannot spare the ${WANDERER_GIFT_COST} essence this requires. Return when you have more.`);
    return;
  }
  // Confirm if overwriting existing heirloom
  if (meta.heirloom) {
    const hDef = RELIC_DEFS[meta.heirloom];
    const hName = hDef ? hDef.name : meta.heirloom;
    const ok = confirm(`You already carry ${hName} as an heirloom. Accept a random gift from the Wanderer instead, replacing it? (Your essence is not refunded.)`);
    if (!ok) return;
  }
  const rollId = pool[(Math.random() * pool.length) | 0];
  const rollDef = RELIC_DEFS[rollId];
  if (bankHeirloom(rollId, WANDERER_GIFT_COST)) {
    recordServiceUse('wanderer');
    try { synthChord(523, 0.7, 0.8); } catch (e) {}
    alert(`The Wanderer hands you ${rollDef.name}. "Carry it for me. It belongs on the road more than on a shelf."`);
  }
}

function showSanctuaryFromHamlet() {
  showSanctuary();
  // Re-bind the restart button to return to hamlet on click
  const btn = document.getElementById('restartBtn');
  btn.onclick = () => { btn.onclick = null; showHamlet(); };
}

function showMemoryFromHamlet() {
  showMemoryModal();
  // Re-bind the memory close button to return to hamlet on click
  const btn = document.getElementById('memoryCloseBtn');
  const prev = btn.onclick;
  btn.onclick = () => { btn.onclick = prev; memoryEl.style.display = 'none'; showHamlet(); };
}

// ============================================================================
// VOLUMES MODAL — save-slot manager. Three slots (Volumes I / II / III),
// each with its own independent progress. Switching reloads the page.
// ============================================================================
const volumesEl = document.createElement('div');
volumesEl.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:radial-gradient(ellipse at center,#140a18 0%,#0a0610 65%,#050308 100%);color:#ddd;pointer-events:auto;font-family:Georgia,"Cormorant Garamond",serif;padding:40px 24px;box-sizing:border-box;';
volumesEl.innerHTML = `
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center, transparent 28%, rgba(4,2,6,0.55) 78%, rgba(0,0,0,0.85) 100%);pointer-events:none;"></div>
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

  <div style="position:relative;display:flex;flex-direction:column;align-items:center;z-index:1;max-width:840px;width:100%;">
    <div style="display:flex;align-items:center;gap:22px;margin-bottom:10px;opacity:0.75;">
      <div style="width:100px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
      <div style="color:#c9a86a;font-size:11px;letter-spacing:6px;font-style:italic;">three journals of the ruin</div>
      <div style="width:100px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
    </div>
    <h1 style="font-size:48px;margin:0;letter-spacing:10px;color:#f4d9a0;text-shadow:0 0 18px rgba(244,217,160,0.45);font-weight:400;line-height:1;">JOURNALS</h1>
    <p style="margin:14px 0 26px;opacity:0.6;letter-spacing:2px;font-size:12px;font-style:italic;max-width:560px;text-align:center;line-height:1.55;">Each journal keeps its own record of the ruin. Switching closes one and opens another. Deleting erases that journal forever.</p>
    <div id="volumesGrid" style="display:grid;grid-template-columns:repeat(3, 240px);gap:18px;margin-bottom:28px;"></div>
    <button id="volumesCloseBtn" style="background:transparent;color:#8a4848;border:0;padding:8px 20px;font-size:11px;cursor:pointer;letter-spacing:5px;font-family:Georgia,serif;font-style:italic;font-weight:bold;transition:all 0.22s ease;opacity:0.75;">\u2190 RETURN</button>
  </div>
`;
document.getElementById('hud').appendChild(volumesEl);
document.getElementById('volumesCloseBtn').addEventListener('click', () => {
  volumesEl.style.display = 'none';
  showMainMenu();
});

function showVolumesModal() {
  hideAllOverlays();
  volumesEl.style.display = 'flex';
  renderVolumesGrid();
}

function renderVolumesGrid() {
  const grid = document.getElementById('volumesGrid');
  grid.innerHTML = '';
  const all = listProfiles();
  for (const p of all) {
    const card = document.createElement('div');
    const label = profileLabel(p.id);
    const accent = p.isActive ? '#f4d9a0' : (p.exists ? '#c9a86a' : '#5a4c38');
    const shadowActive = p.isActive
      ? `inset 0 0 0 2px ${accent}, 0 0 22px ${accent}66, inset 0 0 14px rgba(0,0,0,0.5)`
      : `inset 0 0 0 1px ${accent}88, inset 0 0 14px rgba(0,0,0,0.5)`;
    card.style.cssText = `
      background: linear-gradient(180deg, rgba(24,18,14,0.92), rgba(12,8,6,0.95));
      padding: 20px 18px 14px;
      font-family: Georgia, serif;
      text-align: center;
      box-shadow: ${shadowActive};
      transition: all 0.2s ease;
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 10px;
    `;
    const bodyHtml = p.exists
      ? `<div style="color:#d8cfae;font-size:11px;letter-spacing:2px;line-height:1.75;margin:4px 0 10px;">
           <div><span style="opacity:0.55;">runs:</span> <span style="color:#f4d9a0;">${p.runsStarted}</span></div>
           <div><span style="opacity:0.55;">deepest:</span> <span style="color:#f4d9a0;">floor ${p.maxFloor} / 4</span></div>
           <div><span style="opacity:0.55;">essence:</span> <span style="color:#a0e8ff;">${p.essence}</span></div>
         </div>`
      : `<div style="color:#6a5c48;font-size:11px;letter-spacing:3px;font-style:italic;margin:14px 0;min-height:60px;display:flex;align-items:center;justify-content:center;">— an empty page —</div>`;

    const actionBtn = p.isActive
      ? `<button data-action="active" style="background:rgba(244,217,160,0.12);color:#f4d9a0;border:0;padding:9px 14px;font-size:10px;cursor:default;letter-spacing:4px;font-family:Georgia,serif;font-weight:bold;box-shadow:inset 0 0 0 1px ${accent};">\u2766 CURRENT</button>`
      : p.exists
        ? `<button data-action="open" data-pid="${p.id}" style="background:linear-gradient(180deg,#3a2a20,#1a0f08);color:#f4d9a0;border:0;padding:9px 14px;font-size:10px;cursor:pointer;letter-spacing:4px;font-family:Georgia,serif;font-weight:bold;box-shadow:inset 0 0 0 1px #c9a86a;transition:all 0.2s ease;">OPEN JOURNAL</button>`
        : `<button data-action="begin" data-pid="${p.id}" style="background:linear-gradient(180deg,#2a2218,#120a06);color:#c9a86a;border:0;padding:9px 14px;font-size:10px;cursor:pointer;letter-spacing:4px;font-family:Georgia,serif;font-weight:bold;box-shadow:inset 0 0 0 1px #5a4c38;transition:all 0.2s ease;">BEGIN ANEW</button>`;

    const deleteBtn = p.exists && !p.isActive
      ? `<button data-action="delete" data-pid="${p.id}" style="background:transparent;color:#8a4848;border:0;padding:5px;font-size:9px;cursor:pointer;letter-spacing:3px;font-family:Georgia,serif;font-style:italic;opacity:0.6;transition:all 0.2s ease;">erase this journal</button>`
      : p.exists && p.isActive
        ? `<button data-action="delete" data-pid="${p.id}" style="background:transparent;color:#8a4848;border:0;padding:5px;font-size:9px;cursor:pointer;letter-spacing:3px;font-family:Georgia,serif;font-style:italic;opacity:0.5;transition:all 0.2s ease;">erase this journal</button>`
        : '';

    card.innerHTML = `
      <div style="color:${accent};font-size:14px;letter-spacing:5px;font-weight:bold;${p.isActive ? `text-shadow:0 0 10px ${accent}88;` : ''}">JOURNAL ${label}</div>
      ${bodyHtml}
      ${actionBtn}
      ${deleteBtn}
    `;

    // Hover effect on openable cards
    if (!p.isActive && p.exists) {
      card.onmouseenter = () => { card.style.transform = 'translateY(-2px)'; card.style.boxShadow = `inset 0 0 0 1px ${accent}, 0 0 18px ${accent}55, inset 0 0 14px rgba(0,0,0,0.5)`; };
      card.onmouseleave = () => { card.style.transform = ''; card.style.boxShadow = shadowActive; };
    } else if (!p.exists) {
      card.onmouseenter = () => { card.style.transform = 'translateY(-2px)'; card.style.boxShadow = `inset 0 0 0 1px #c9a86a, 0 0 14px rgba(201,168,106,0.35), inset 0 0 14px rgba(0,0,0,0.5)`; };
      card.onmouseleave = () => { card.style.transform = ''; card.style.boxShadow = shadowActive; };
    }

    // Delegated click handler per card
    card.addEventListener('click', (e) => {
      const target = e.target.closest('button');
      if (!target) return;
      const action = target.dataset.action;
      const pid = target.dataset.pid;
      if (action === 'open' || action === 'begin') {
        setActiveProfile(pid);   // triggers location.reload()
      } else if (action === 'delete') {
        // Double-confirm — this is destructive.
        const label2 = profileLabel(pid);
        const ok = confirm(`Erase Journal ${label2} forever?\n\nAll progress (essence, records, unlocks, hamlet NPCs, discovered relics) will be permanently deleted.`);
        if (ok) deleteProfile(pid);   // triggers reload if active
        renderVolumesGrid();
      }
    });
    grid.appendChild(card);
  }
}

// ============================================================================
// SMITH'S FORGE — reforge modal. The Smith accepts essence in exchange for
// "forging" a specific relic into your next descent. Pick any previously-
// discovered relic; pay by tier. A single banked heirloom persists on
// meta.heirloom until consumed at run start.
// ============================================================================

// Reforge cost by relic tier — scales with impact. Common relics are a
// cheap warm-up; legendaries are a serious essence investment.
const REFORGE_COST = { common: 40, rare: 80, legendary: 140 };

const smithEl = document.createElement('div');
smithEl.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:radial-gradient(ellipse at center,#1a1008 0%,#0a0608 65%,#050308 100%);color:#ddd;pointer-events:auto;font-family:Georgia,"Cormorant Garamond",serif;padding:40px 24px;box-sizing:border-box;overflow-y:auto;';
smithEl.innerHTML = `
  <!-- Corners + vignette — shared manuscript grammar -->
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center, transparent 28%, rgba(4,2,6,0.55) 78%, rgba(0,0,0,0.85) 100%);pointer-events:none;"></div>
  <div style="position:absolute;top:22px;left:22px;width:48px;height:48px;pointer-events:none;">
    <div style="position:absolute;top:0;left:0;width:48px;height:1px;background:linear-gradient(90deg,#ff8a60,transparent);"></div>
    <div style="position:absolute;top:0;left:0;width:1px;height:48px;background:linear-gradient(180deg,#ff8a60,transparent);"></div>
    <div style="position:absolute;top:-2px;left:-2px;width:4px;height:4px;background:#ff8a60;transform:rotate(45deg);"></div>
  </div>
  <div style="position:absolute;top:22px;right:22px;width:48px;height:48px;pointer-events:none;">
    <div style="position:absolute;top:0;right:0;width:48px;height:1px;background:linear-gradient(270deg,#ff8a60,transparent);"></div>
    <div style="position:absolute;top:0;right:0;width:1px;height:48px;background:linear-gradient(180deg,#ff8a60,transparent);"></div>
    <div style="position:absolute;top:-2px;right:-2px;width:4px;height:4px;background:#ff8a60;transform:rotate(45deg);"></div>
  </div>
  <div style="position:absolute;bottom:22px;left:22px;width:48px;height:48px;pointer-events:none;">
    <div style="position:absolute;bottom:0;left:0;width:48px;height:1px;background:linear-gradient(90deg,#ff8a60,transparent);"></div>
    <div style="position:absolute;bottom:0;left:0;width:1px;height:48px;background:linear-gradient(0deg,#ff8a60,transparent);"></div>
    <div style="position:absolute;bottom:-2px;left:-2px;width:4px;height:4px;background:#ff8a60;transform:rotate(45deg);"></div>
  </div>
  <div style="position:absolute;bottom:22px;right:22px;width:48px;height:48px;pointer-events:none;">
    <div style="position:absolute;bottom:0;right:0;width:48px;height:1px;background:linear-gradient(270deg,#ff8a60,transparent);"></div>
    <div style="position:absolute;bottom:0;right:0;width:1px;height:48px;background:linear-gradient(0deg,#ff8a60,transparent);"></div>
    <div style="position:absolute;bottom:-2px;right:-2px;width:4px;height:4px;background:#ff8a60;transform:rotate(45deg);"></div>
  </div>

  <div style="position:relative;display:flex;flex-direction:column;align-items:center;z-index:1;max-width:980px;width:100%;">
    <div style="display:flex;align-items:center;gap:22px;margin-bottom:10px;opacity:0.75;">
      <div style="width:110px;height:1px;background:linear-gradient(90deg,transparent,#ff8a60,transparent);"></div>
      <div style="color:#ff8a60;font-size:11px;letter-spacing:6px;font-style:italic;">fold your weight into steel</div>
      <div style="width:110px;height:1px;background:linear-gradient(90deg,transparent,#ff8a60,transparent);"></div>
    </div>
    <h1 style="font-size:44px;margin:0;letter-spacing:10px;color:#ffbb8a;text-shadow:0 0 18px rgba(255,140,80,0.45);font-weight:400;line-height:1;">THE FORGE</h1>

    <!-- Status bar: current essence + any banked heirloom -->
    <div style="display:flex;align-items:center;gap:24px;margin-top:16px;margin-bottom:14px;font-family:Georgia,serif;font-size:12px;letter-spacing:2px;">
      <div><span style="opacity:0.6;">ESSENCE:</span> <span id="smithEssenceVal" style="color:#a0e8ff;font-weight:bold;">0</span></div>
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);opacity:0.5;"></span>
      <div id="smithHeirloomStatus" style="color:#ffbb8a;font-style:italic;"></div>
    </div>

    <p style="margin:0 0 22px;opacity:0.6;letter-spacing:1.5px;font-size:11px;font-style:italic;max-width:620px;text-align:center;line-height:1.55;">Bring me weight you have carried. I will fold it into something that travels with you into the next descent.</p>

    <div id="smithGrid" style="display:grid;grid-template-columns:repeat(5, 168px);gap:12px;margin-bottom:22px;max-height:520px;overflow-y:auto;padding:6px;"></div>
    <button id="smithCloseBtn" style="background:transparent;color:#a97070;border:0;padding:8px 20px;font-size:11px;cursor:pointer;letter-spacing:5px;font-family:Georgia,serif;font-style:italic;font-weight:bold;transition:all 0.22s ease;opacity:0.75;">\u2190 STEP AWAY FROM THE FORGE</button>
  </div>
`;
document.getElementById('hud').appendChild(smithEl);
document.getElementById('smithCloseBtn').addEventListener('click', () => {
  smithEl.style.display = 'none';
  // Return to hamlet so the player sees the Smith again (service call came from there)
  showHamlet();
});

function showSmithModal() {
  hideAllOverlays();
  smithEl.style.display = 'flex';
  renderSmithGrid();
}

function renderSmithGrid() {
  const grid = document.getElementById('smithGrid');
  const essEl = document.getElementById('smithEssenceVal');
  const statusEl = document.getElementById('smithHeirloomStatus');
  grid.innerHTML = '';
  if (essEl) essEl.textContent = meta.essence | 0;
  if (statusEl) {
    if (meta.heirloom) {
      const def = RELIC_DEFS[meta.heirloom];
      const name = def ? def.name : meta.heirloom;
      statusEl.innerHTML = `\u2766 HEIRLOOM BANKED: <span style="color:#f4d9a0;font-weight:bold;">${name}</span>`;
    } else {
      statusEl.innerHTML = '<span style="opacity:0.5;">no heirloom banked</span>';
    }
  }

  // Render all discovered relics as clickable cards; undiscovered show
  // silhouette-style locked placeholders.
  for (const id of ALL_RELIC_IDS) {
    const def = RELIC_DEFS[id];
    const seen = seenRelicIds.has(id);
    const tier = def.tier || 'common';
    const cost = REFORGE_COST[tier];
    const accent = def.tint || '#c9a86a';
    const tierColor = tier === 'legendary' ? '#e6c8ff' : tier === 'rare' ? '#ffd68a' : '#d8cfae';
    const canAfford = meta.essence >= cost;
    const isBanked = meta.heirloom === id;

    const card = document.createElement('button');
    const boxShadow = isBanked
      ? `inset 0 0 0 2px #f4d9a0, 0 0 18px rgba(244,217,160,0.55), inset 0 0 14px rgba(0,0,0,0.4)`
      : seen
        ? (canAfford
            ? `inset 0 0 0 1px ${accent}88, inset 0 0 12px rgba(0,0,0,0.4)`
            : `inset 0 0 0 1px rgba(80,60,44,0.6), inset 0 0 12px rgba(0,0,0,0.45)`)
        : `inset 0 0 0 1px rgba(60,44,32,0.4), inset 0 0 12px rgba(0,0,0,0.5)`;
    card.style.cssText = `
      background: linear-gradient(180deg, rgba(24,18,14,0.9), rgba(12,8,6,0.95));
      border: 0;
      padding: 12px 10px;
      cursor: ${(seen && (canAfford || isBanked)) ? 'pointer' : 'default'};
      font-family: Georgia, serif;
      text-align: center;
      opacity: ${seen ? (canAfford || isBanked ? 1 : 0.55) : 0.35};
      box-shadow: ${boxShadow};
      transition: all 0.2s ease;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    `;
    if (seen && (canAfford || isBanked)) {
      card.onmouseenter = () => { card.style.transform = 'translateY(-2px)'; card.style.boxShadow = `inset 0 0 0 1px ${accent}, 0 0 16px ${accent}55, inset 0 0 12px rgba(0,0,0,0.4)`; };
      card.onmouseleave = () => { card.style.transform = ''; renderSmithGrid(); };
    }

    // Icon (use the loaded relic PNG)
    const img = imageCache[def.icon];
    const iconHtml = seen && img
      ? `<img src="${img.src}" style="width:56px;height:56px;image-rendering:pixelated;image-rendering:crisp-edges;filter:drop-shadow(0 0 8px ${accent}55);"/>`
      : `<div style="width:56px;height:56px;display:flex;align-items:center;justify-content:center;color:rgba(80,60,44,0.7);font-size:28px;font-weight:bold;">?</div>`;
    const name = seen ? def.name : '???';
    const tierLabel = seen ? tier.toUpperCase() : 'LOCKED';
    const costLabel = isBanked
      ? 'CURRENT'
      : seen
        ? `${cost} \u2728`
        : 'find in a run';

    card.innerHTML = `
      ${iconHtml}
      <div style="color:${seen ? accent : '#4a3c28'};font-size:11px;letter-spacing:1.5px;font-weight:bold;${seen ? `text-shadow:0 0 6px ${accent}44;` : ''}">${name}</div>
      <div style="color:${seen ? tierColor : '#4a3c28'};font-size:8px;letter-spacing:3px;opacity:0.75;">${tierLabel}</div>
      <div style="color:${isBanked ? '#f4d9a0' : canAfford ? '#a0e8ff' : '#6a5c48'};font-size:10px;letter-spacing:2px;font-weight:bold;margin-top:2px;">${costLabel}</div>
    `;
    if (seen && canAfford && !isBanked) {
      card.onclick = () => {
        // Confirm for legendary purchases (high cost)
        if (tier === 'legendary') {
          const ok = confirm(`Forge ${def.name} as your heirloom?\n\nCost: ${cost} essence.`);
          if (!ok) return;
        }
        if (bankHeirloom(id, cost)) {
          // Advance the Smith's arc on a successful reforge
          recordServiceUse('smith');
          renderSmithGrid();
          try { synthChord(440, 0.6, 0.7); } catch (e) {}
        }
      };
    } else if (seen && isBanked) {
      card.onclick = () => {
        // Already banked — click to cancel and refund
        const ok = confirm(`Cancel this heirloom and refund ${cost} essence?`);
        if (!ok) return;
        meta.essence += cost;
        meta.heirloom = null;
        saveMeta();
        renderSmithGrid();
      };
    }
    grid.appendChild(card);
  }
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

// Chronicles modal — named to match the main-menu card ("CHRONICLES"). Shares
// the manuscript grammar: page-frame corners, deep vignette, inset strokes,
// Georgia typography.
const achEl = document.createElement('div');
achEl.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:radial-gradient(ellipse at center,#140a18 0%,#0a0610 65%,#050308 100%);color:#ddd;pointer-events:auto;font-family:Georgia,"Cormorant Garamond",serif;padding:40px 24px;box-sizing:border-box;overflow-y:auto;';
achEl.innerHTML = `
  <!-- Deep vignette + page-frame corners (shared discipline). -->
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center, transparent 28%, rgba(4,2,6,0.55) 78%, rgba(0,0,0,0.85) 100%);pointer-events:none;"></div>
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

  <div style="position:relative;display:flex;flex-direction:column;align-items:center;z-index:1;width:100%;">
    <div style="display:flex;align-items:center;gap:22px;margin-bottom:10px;opacity:0.75;">
      <div style="width:100px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
      <div style="color:#c9a86a;font-size:11px;letter-spacing:6px;font-style:italic;">deeds remembered</div>
      <div style="width:100px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
    </div>
    <h1 style="font-size:48px;margin:0;letter-spacing:10px;color:#f4d9a0;text-shadow:0 0 18px rgba(244,217,160,0.45);font-weight:400;line-height:1;">CHRONICLES</h1>
    <div style="display:flex;align-items:center;gap:12px;margin:10px 0 18px;opacity:0.65;">
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);"></span>
      <p id="achProgress" style="margin:0;letter-spacing:5px;font-size:12px;font-style:italic;color:#d8cfae;"></p>
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);"></span>
    </div>
    <!-- Tab row — four codex sections. Active tab is gold filled, others muted. -->
    <div style="display:flex;gap:6px;margin-bottom:14px;">
      <button class="chronTab" data-tab="achievements" style="background:transparent;border:0;padding:7px 18px;cursor:pointer;color:#c9a86a;font-family:Georgia,serif;font-size:11px;letter-spacing:3px;font-weight:bold;transition:all 0.2s ease;text-transform:uppercase;">Deeds</button>
      <span style="opacity:0.3;color:#c9a86a;font-size:10px;align-self:center;">\u2666</span>
      <button class="chronTab" data-tab="bestiary" style="background:transparent;border:0;padding:7px 18px;cursor:pointer;color:#6a5c48;font-family:Georgia,serif;font-size:11px;letter-spacing:3px;font-weight:bold;transition:all 0.2s ease;text-transform:uppercase;">Bestiary</button>
      <span style="opacity:0.3;color:#c9a86a;font-size:10px;align-self:center;">\u2666</span>
      <button class="chronTab" data-tab="relics" style="background:transparent;border:0;padding:7px 18px;cursor:pointer;color:#6a5c48;font-family:Georgia,serif;font-size:11px;letter-spacing:3px;font-weight:bold;transition:all 0.2s ease;text-transform:uppercase;">Relicpedia</button>
      <span style="opacity:0.3;color:#c9a86a;font-size:10px;align-self:center;">\u2666</span>
      <button class="chronTab" data-tab="fusions" style="background:transparent;border:0;padding:7px 18px;cursor:pointer;color:#6a5c48;font-family:Georgia,serif;font-size:11px;letter-spacing:3px;font-weight:bold;transition:all 0.2s ease;text-transform:uppercase;">Fusions</button>
    </div>
    <!-- Shared content grid — repopulated per tab. -->
    <div id="achRow" style="display:grid;grid-template-columns:repeat(3, 280px);gap:12px;margin-bottom:22px;max-height:520px;overflow-y:auto;padding:4px;"></div>
    <button id="achCloseBtn" style="background:transparent;color:#8a4848;border:0;padding:8px 20px;font-size:11px;cursor:pointer;letter-spacing:5px;font-family:Georgia,serif;font-style:italic;font-weight:bold;transition:all 0.22s ease;opacity:0.75;">\u2190 RETURN</button>
  </div>
`;
document.getElementById('hud').appendChild(achEl);
document.getElementById('achCloseBtn').addEventListener('click', () => {
  achEl.style.display = 'none';
  showMainMenu();
});

// Chronicles modal — current tab state. Persists within a session so the
// player can close and re-open without losing their spot.
let chronTab = 'achievements';

// Boss portrait paths — used by the Bestiary tab to show hand-drawn portraits
// instead of pixel-sprite thumbnails for defeated bosses. If a key is present
// here, that enemy is treated as a boss for bestiary purposes (its "seen"
// state comes from ruin.bossKills, not seenEnemyTypes).
const ENEMY_PORTRAIT_PATH = {
  orc:          'assets/enemies/portrait_grudnok.png',
  bone_captain: 'assets/enemies/portrait_iron_revenant.png',
  broodmother:  'assets/enemies/portrait_broodmother.png',
  ember_tyrant: 'assets/enemies/portrait_ember_tyrant.png',
  echo:         'assets/enemies/portrait_echo_of_self.png',
};

function showAchievementsModal() {
  hideAllOverlays();
  achEl.style.display = 'flex';
  renderChroniclesTab();
}

// Wire tab clicks on modal creation — once the modal element is in the DOM.
document.querySelectorAll('#achEl .chronTab, .chronTab').forEach(btn => {
  btn.addEventListener('click', () => {
    chronTab = btn.dataset.tab;
    renderChroniclesTab();
  });
});

// Card builder — unified grammar for every tab. `locked` dims + italicizes;
// `seen` gold-glows + shows full text. Optional `thumb` (data URL) shows the
// composed icon/sprite at top-left with a tint-colored halo. `silhouette:true`
// darkens the thumbnail for "undiscovered" visual cue.
function chronCard({ title, body, locked, accentColor, icon, thumb, silhouette }) {
  const card = document.createElement('div');
  const border = locked ? 'rgba(80,60,40,0.3)' : (accentColor ? accentColor + '88' : 'rgba(201,168,106,0.55)');
  const glow = locked ? '' : `, 0 0 14px ${accentColor ? accentColor + '33' : 'rgba(201,168,106,0.12)'}`;
  card.style.cssText = `
    background:linear-gradient(180deg,rgba(30,22,16,0.85),rgba(14,10,8,0.88));
    padding:12px 14px;
    display:flex;${thumb ? 'flex-direction:row;align-items:flex-start;gap:12px;' : 'flex-direction:column;gap:5px;'}
    font-family:Georgia,serif;
    box-shadow:inset 0 0 0 1px ${border}, inset 0 0 12px rgba(0,0,0,0.5)${glow};
    ${locked ? 'opacity:0.55;' : ''}
  `;
  const titleColor = locked ? '#7a7060' : (accentColor || '#f4d9a0');
  const titleShadow = locked ? 'none' : `0 0 6px ${accentColor ? accentColor + '55' : 'rgba(244,217,160,0.3)'}`;
  const bodyColor = locked ? 'rgba(140,130,110,0.7)' : 'rgba(200,190,170,0.85)';
  // Optional thumbnail column
  const thumbBg = locked
    ? 'radial-gradient(circle,rgba(80,60,40,0.25),transparent 70%)'
    : `radial-gradient(circle,${accentColor || '#c9a86a'}33,transparent 70%)`;
  const thumbFilter = silhouette ? 'brightness(0) contrast(0.4)' : 'none';
  const thumbHtml = thumb ? `
    <div style="flex-shrink:0;width:52px;height:52px;display:flex;align-items:center;justify-content:center;background:${thumbBg};">
      <img src="${thumb}" style="width:48px;height:48px;image-rendering:pixelated;filter:${thumbFilter};" alt="" />
    </div>
  ` : '';
  const textBlock = `
    <div style="flex:1;display:flex;flex-direction:column;gap:4px;min-width:0;">
      <div style="font-size:14px;font-weight:bold;color:${titleColor};letter-spacing:1px;text-shadow:${titleShadow};">${icon || ''}${title}</div>
      ${body ? `<div style="font-size:11px;color:${bodyColor};line-height:1.35;font-style:italic;">${body}</div>` : ''}
    </div>
  `;
  card.innerHTML = thumbHtml + textBlock;
  return card;
}

function renderChroniclesTab() {
  // Sync tab highlight — active is filled gold, others are muted
  const tabs = document.querySelectorAll('.chronTab');
  tabs.forEach(t => {
    const active = t.dataset.tab === chronTab;
    t.style.background = active ? 'linear-gradient(180deg,rgba(58,42,32,0.9),rgba(30,20,12,0.9))' : 'transparent';
    t.style.color = active ? '#f4d9a0' : '#6a5c48';
    t.style.boxShadow = active ? 'inset 0 0 0 1px #c9a86a, 0 0 10px rgba(201,168,106,0.3)' : 'none';
    t.style.textShadow = active ? '0 0 6px rgba(244,217,160,0.4)' : 'none';
  });
  const row = document.getElementById('achRow');
  const progress = document.getElementById('achProgress');
  row.innerHTML = '';

  if (chronTab === 'achievements') {
    for (const id of ACH_IDS) {
      const a = ACHIEVEMENTS[id];
      const unlocked = isUnlocked(id);
      row.appendChild(chronCard({
        title: a.name,
        body: a.desc,
        locked: !unlocked,
        icon: (unlocked ? '\u2605 ' : '\u2606 '),
      }));
    }
    progress.textContent = `${totalUnlocked()} of ${ACH_IDS.length} deeds earned`;

  } else if (chronTab === 'bestiary') {
    // Enemies — show ALL types with thumbnails. Regular enemies use idle
    // sprite frame 0 (composed with tint filter). BOSSES use the hand-
    // drawn portrait PNG if the player has defeated them.
    // Bosses aren't in seenEnemyTypes (they're excluded from auto-register
    // in enemies.js) — we use ruin.bossKills instead to decide "seen".
    const typeIds = Object.keys(ENEMY_TYPES);
    const bossKilled = new Set((ruin.bossKills || []).map(k => k.bossType));
    let seenN = 0;
    for (const id of typeIds) {
      const def = ENEMY_TYPES[id];
      const portraitUrl = ENEMY_PORTRAIT_PATH[id];
      const isBoss = !!portraitUrl;
      const seen = isBoss ? bossKilled.has(id) : seenEnemyTypes.has(id);
      if (seen) seenN++;
      const name = seen ? (def.displayName || id.toUpperCase()) : '???';
      const body = seen ? (def.flavor || '') : 'undiscovered \u2014 meet this adversary in the ruin to learn its nature';
      let thumb = null;
      if (isBoss && portraitUrl) {
        // Boss: use the hand-drawn portrait directly (already a PNG)
        thumb = portraitUrl;
      } else {
        // Regular enemy: compose from idle sprite frame 0
        const spriteKey = (def.prefix || '') + 'idle';
        const spriteImg = imageCache[spriteKey];
        if (spriteImg) thumb = composeEnemyThumbDataURL(def, spriteImg, 48);
      }
      row.appendChild(chronCard({
        title: name,
        body: body,
        locked: !seen,
        accentColor: seen ? (def.color || '#c9a86a') : null,
        icon: '',
        thumb,
        silhouette: !seen,
      }));
    }
    progress.textContent = `${seenN} of ${typeIds.length} adversaries catalogued`;

  } else if (chronTab === 'relics') {
    // Relics — show all with composed thumbnails (tint + glyph). Locked ones
    // show a silhouette so the shape hints at type without revealing details.
    let seenN = 0;
    for (const id of ALL_RELIC_IDS) {
      const def = RELIC_DEFS[id];
      const seen = seenRelicIds.has(id);
      if (seen) seenN++;
      const name = seen ? def.name : '???';
      const body = seen
        ? (def.flavor ? `<div style="font-style:italic;margin-bottom:3px;">${def.flavor}</div><div style="color:${def.tint || '#c9a86a'};font-weight:bold;font-style:normal;">${def.desc}</div>` : def.desc)
        : 'undiscovered \u2014 a relic you have yet to claim';
      // Dedicated per-relic art — bypass glyph/hue overlay (pass null,null).
      const baseImg = imageCache[def.icon];
      const thumb = baseImg ? composeRelicThumbDataURL(baseImg, null, null, id, 48) : null;
      row.appendChild(chronCard({
        title: name,
        body: body,
        locked: !seen,
        accentColor: seen ? (def.tint || '#c9a86a') : null,
        icon: '',
        thumb,
        silhouette: !seen,
      }));
    }
    progress.textContent = `${seenN} of ${ALL_RELIC_IDS.length} relics recovered`;

  } else if (chronTab === 'fusions') {
    // Fusions — show all with the COMPONENTS' icons as a small paired thumb.
    const ids = Object.keys(FUSIONS);
    let seenN = 0;
    for (const id of ids) {
      const f = FUSIONS[id];
      const seen = discoveredFusions.has(id);
      if (seen) seenN++;
      const compNames = f.components.map(cid => {
        const d = RELIC_DEFS[cid];
        return d ? d.name : cid;
      }).join(' + ');
      const name = seen ? f.name : '???';
      const body = seen
        ? `<div style="font-style:italic;margin-bottom:3px;color:rgba(200,190,170,0.75);">${f.flavor || ''}</div><div style="font-style:normal;color:${f.tint || '#c9a86a'};font-weight:bold;margin-bottom:3px;">${f.desc}</div><div style="font-style:normal;color:rgba(160,148,130,0.7);font-size:10px;letter-spacing:1px;">${compNames}</div>`
        : `undiscovered \u2014 combine ${compNames} to form this fusion`;
      // Fusion thumb — the fusion now has its own dedicated icon (Nano Banana
      // hand-drawn). Fall back to component-composed icon only if the PNG
      // didn't load for some reason.
      const fusionImg = imageCache[f.icon];
      let thumb = null;
      if (fusionImg) {
        thumb = fusionImg.src;   // direct path to the PNG
      } else {
        const firstComp = RELIC_DEFS[f.components[0]];
        const baseImg = firstComp ? imageCache[firstComp.icon] : null;
        if (baseImg) thumb = composeRelicThumbDataURL(baseImg, 'star', f.tint, 'fusion_' + id, 48);
      }
      row.appendChild(chronCard({
        title: name,
        body: body,
        locked: !seen,
        accentColor: seen ? (f.tint || '#c9a86a') : null,
        icon: '',
        thumb,
        silhouette: !seen,
      }));
    }
    progress.textContent = `${seenN} of ${ids.length} fusions discovered`;
  }
}

function renderCursesGrid() {
  const row = document.getElementById('cursesRow');
  row.innerHTML = '';
  for (const id of ALL_CURSE_IDS) {
    const c = CURSES[id];
    const on = isCursed(id);
    const card = document.createElement('div');
    card.style.cssText = `
      background:linear-gradient(180deg,rgba(36,16,20,0.92),rgba(18,8,12,0.92));
      border:2px solid ${on ? c.tint : 'rgba(90, 60, 60, 0.55)'};
      padding:14px 12px;
      display:flex;flex-direction:column;align-items:center;gap:7px;
      cursor:pointer;
      transition:transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
      font-family:Georgia,serif;
      ${on ? `box-shadow: 0 0 18px ${c.tint}55, inset 0 0 12px ${c.tint}22;` : 'box-shadow: inset 0 0 10px rgba(0,0,0,0.4);'}
    `;
    card.innerHTML = `
      <div style="font-size:16px;font-weight:bold;color:${c.tint};letter-spacing:2px;text-align:center;text-shadow:0 0 6px ${c.tint}44;">${c.name}</div>
      ${c.flavor ? `<div style="font-size:10px;color:rgba(200,190,210,0.75);text-align:center;line-height:1.4;font-style:italic;min-height:38px;padding:0 2px;">${c.flavor}</div>` : ''}
      <div style="height:1px;width:70%;background:linear-gradient(90deg,transparent,${c.tint}aa,transparent);margin:1px 0;"></div>
      <div style="font-size:11px;color:${on ? c.tint : '#bbb'};text-align:center;line-height:1.4;min-height:30px;font-weight:bold;">${c.desc}</div>
      <div style="font-size:13px;color:${on ? '#a0e8ff' : 'rgba(160,232,255,0.4)'};letter-spacing:2px;font-weight:bold;">+${Math.round((c.essenceMul - 1) * 100)}% \u2728 ESSENCE</div>
      <div style="font-size:10px;letter-spacing:4px;color:${on ? c.tint : 'rgba(140,140,140,0.45)'};font-style:italic;font-weight:bold;">${on ? '\u2620 ACTIVE \u2620' : 'dormant'}</div>
    `;
    card.addEventListener('click', () => {
      toggleCurse(id);
      renderCursesGrid();
      updateCurseEssMul();
    });
    card.addEventListener('mouseenter', () => {
      card.style.transform = 'translateY(-3px)';
      card.style.boxShadow = on
        ? `0 0 24px ${c.tint}80, inset 0 0 14px ${c.tint}33`
        : `0 0 14px ${c.tint}33, inset 0 0 10px rgba(0,0,0,0.4)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'none';
      card.style.boxShadow = on
        ? `0 0 18px ${c.tint}55, inset 0 0 12px ${c.tint}22`
        : 'inset 0 0 10px rgba(0,0,0,0.4)';
    });
    row.appendChild(card);
  }
  updateCurseEssMul();
}

function updateCurseEssMul() {
  const mul = curseEssenceMul();
  const count = curseCount();
  const essEl = document.getElementById('curseEssMul');
  if (count === 0) {
    essEl.textContent = 'no curses active';
    essEl.style.color = 'rgba(160,232,255,0.4)';
  } else {
    essEl.textContent = count + ' curse' + (count > 1 ? 's' : '') + ' active · ✨ ' + mul.toFixed(2) + 'x essence reward';
    essEl.style.color = '#a0e8ff';
  }
}

// Weapon picker — shown between main menu and run start
const weaponPickerEl = document.createElement('div');
weaponPickerEl.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:radial-gradient(ellipse at center,#140a18 0%,#0a0610 65%,#050308 100%);color:#ddd;pointer-events:auto;font-family:Georgia,serif;padding:24px;box-sizing:border-box;';
weaponPickerEl.innerHTML = `
  <!-- Deep vignette + page-frame corners (shared discipline). -->
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center, transparent 28%, rgba(4,2,6,0.55) 78%, rgba(0,0,0,0.85) 100%);pointer-events:none;"></div>
  <div style="position:absolute;top:22px;left:22px;width:48px;height:48px;pointer-events:none;animation:winFadeIn 0.7s ease-out both;">
    <div style="position:absolute;top:0;left:0;width:48px;height:1px;background:linear-gradient(90deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;top:0;left:0;width:1px;height:48px;background:linear-gradient(180deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;top:-2px;left:-2px;width:4px;height:4px;background:#c9a86a;transform:rotate(45deg);"></div>
  </div>
  <div style="position:absolute;top:22px;right:22px;width:48px;height:48px;pointer-events:none;animation:winFadeIn 0.7s ease-out both;">
    <div style="position:absolute;top:0;right:0;width:48px;height:1px;background:linear-gradient(270deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;top:0;right:0;width:1px;height:48px;background:linear-gradient(180deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;top:-2px;right:-2px;width:4px;height:4px;background:#c9a86a;transform:rotate(45deg);"></div>
  </div>
  <div style="position:absolute;bottom:22px;left:22px;width:48px;height:48px;pointer-events:none;animation:winFadeIn 0.7s ease-out both;">
    <div style="position:absolute;bottom:0;left:0;width:48px;height:1px;background:linear-gradient(90deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;bottom:0;left:0;width:1px;height:48px;background:linear-gradient(0deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;bottom:-2px;left:-2px;width:4px;height:4px;background:#c9a86a;transform:rotate(45deg);"></div>
  </div>
  <div style="position:absolute;bottom:22px;right:22px;width:48px;height:48px;pointer-events:none;animation:winFadeIn 0.7s ease-out both;">
    <div style="position:absolute;bottom:0;right:0;width:48px;height:1px;background:linear-gradient(270deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;bottom:0;right:0;width:1px;height:48px;background:linear-gradient(0deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;bottom:-2px;right:-2px;width:4px;height:4px;background:#c9a86a;transform:rotate(45deg);"></div>
  </div>

  <div style="position:relative;display:flex;flex-direction:column;align-items:center;z-index:1;">
    <div style="display:flex;align-items:center;gap:22px;margin-bottom:10px;opacity:0.75;animation:winFadeIn 0.6s ease-out;">
      <div style="width:100px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
      <div style="color:#c9a86a;font-size:11px;letter-spacing:6px;font-style:italic;">the forge waits</div>
      <div style="width:100px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
    </div>
    <h1 style="font-size:48px;margin:0;letter-spacing:10px;color:#f4d9a0;font-weight:400;line-height:1;text-shadow:0 0 20px rgba(244,217,160,0.5);animation:winFadeIn 0.7s ease-out 0.1s both;">CHOOSE YOUR ARMS</h1>
    <div style="display:flex;align-items:center;gap:12px;margin:10px 0 36px;opacity:0.6;animation:winFadeIn 0.6s ease-out 0.22s both;">
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);"></span>
      <p style="margin:0;letter-spacing:5px;font-size:12px;font-style:italic;color:#d8cfae;">each shapes the descent differently</p>
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);"></span>
    </div>
    <div id="weaponPickerRow" style="display:flex;gap:18px;"></div>
    <button id="weaponBackBtn" style="background:transparent;color:#8a4848;border:0;padding:8px 20px;font-size:11px;cursor:pointer;letter-spacing:5px;margin-top:32px;font-family:Georgia,serif;font-style:italic;font-weight:bold;transition:all 0.22s ease;opacity:0.75;animation:winFadeIn 0.55s ease-out 1.1s both;">\u2190 BACK</button>
  </div>
`;
document.getElementById('hud').appendChild(weaponPickerEl);
document.getElementById('weaponBackBtn').addEventListener('click', () => {
  weaponPickerEl.style.display = 'none';
  menuEl.style.display = 'flex';
});

function availableWeapons() {
  return ALL_WEAPON_IDS.filter(id => {
    if (id === 'sword') return true;
    const u = WEAPON_UNLOCKS[id];
    return u && hasUnlock(u.metaId);
  });
}

function showWeaponPicker() {
  menuEl.style.display = 'none';
  weaponPickerEl.style.display = 'flex';
  const row = document.getElementById('weaponPickerRow');
  row.innerHTML = '';
  let staggerIdx = 0;
  for (const id of availableWeapons()) {
    const w = WEAPONS[id];
    const card = document.createElement('div');
    const delay = 0.35 + staggerIdx * 0.1;
    staggerIdx++;
    card.style.cssText = `
      width:220px;
      background:linear-gradient(180deg,rgba(40,28,48,0.95),rgba(18,10,22,0.95));
      border:2px solid ${w.tint};
      padding:18px;
      display:flex;flex-direction:column;align-items:center;gap:9px;
      box-shadow:0 0 20px ${w.tint}55, 0 4px 16px rgba(0,0,0,0.5), inset 0 0 14px rgba(0,0,0,0.35);
      cursor:pointer;
      font-family:Georgia,serif;
      transition:transform 0.18s ease, box-shadow 0.18s ease;
      animation:winCardSlide 0.55s ease-out ${delay}s both;
    `;
    card.addEventListener('mouseenter', () => {
      card.style.transform = 'translateY(-6px) scale(1.02)';
      card.style.boxShadow = `0 0 32px ${w.tint}, 0 4px 22px rgba(0,0,0,0.55), inset 0 0 16px rgba(0,0,0,0.3)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'none';
      card.style.boxShadow = `0 0 20px ${w.tint}55, 0 4px 16px rgba(0,0,0,0.5), inset 0 0 14px rgba(0,0,0,0.35)`;
    });
    card.innerHTML = `
      <div style="padding:6px;background:radial-gradient(circle,${w.tint}33,transparent 70%);">
        <img src="assets/icons/${w.icon}.png" style="width:52px;height:52px;image-rendering:pixelated;filter:drop-shadow(0 0 8px ${w.tint}aa);" />
      </div>
      <div style="font-size:19px;font-weight:bold;color:${w.tint};letter-spacing:3px;text-shadow:0 0 6px ${w.tint}66;">${w.name.toUpperCase()}</div>
      ${w.flavor ? `<div style="font-size:11px;color:rgba(200,190,210,0.75);text-align:center;line-height:1.4;min-height:32px;font-style:italic;padding:0 4px;">${w.flavor}</div>` : ''}
      <div style="height:1px;width:70%;background:linear-gradient(90deg,transparent,${w.tint}aa,transparent);margin:2px 0;"></div>
      <div style="font-size:11px;color:#ccc;text-align:center;line-height:1.4;min-height:28px;">${w.desc}</div>
      <div style="height:1px;width:100%;background:linear-gradient(90deg,transparent,${w.tint}66,transparent);margin:2px 0;"></div>
      <div style="display:grid;grid-template-columns:auto auto;gap:3px 18px;font-size:11px;color:#aaa;margin-top:2px;">
        <span style="opacity:0.6;letter-spacing:1px;">DAMAGE</span><span style="text-align:right;color:${w.tint};font-weight:bold;">${w.damage}</span>
        <span style="opacity:0.6;letter-spacing:1px;">REACH</span><span style="text-align:right;color:${w.tint};font-weight:bold;">${w.reach}px</span>
        <span style="opacity:0.6;letter-spacing:1px;">ARC</span><span style="text-align:right;color:${w.tint};font-weight:bold;">${Math.round(w.arc * 180 / Math.PI)}\u00B0</span>
        <span style="opacity:0.6;letter-spacing:1px;">COOLDOWN</span><span style="text-align:right;color:${w.tint};font-weight:bold;">${w.cooldown.toFixed(2)}s</span>
      </div>
    `;
    card.addEventListener('click', () => {
      hero.weapon = id;
      try { synthPing(520, 0.9, 0.5); synthChord(392, 0.7, 0.7); } catch (e) {}
      hideAllOverlays();
      startRun();
    });
    row.appendChild(card);
  }
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
  // Legacy hidden indicator — kept for anything still referencing it
  const indEl = document.getElementById('menuCurseIndicator');
  if (indEl) indEl.textContent = '';
  /* legacy block guarded behind false — corner button replaces this.
  if (false && count > 0) {
    indEl.textContent = '☠ ' + count + ' curse' + (count > 1 ? 's' : '') + ' active · ✨ ' + curseEssenceMul().toFixed(2) + 'x reward ☠';
  } else {
    indEl.textContent = '';
  }
  */
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

function showSanctuary() {
  // Stats zero (no run stats to show); render as a pure sanctuary/meta-only screen
  resetStats();        // Safe — we haven't started a run
  hideAllOverlays();
  // Reuse the death screen panel but fill it with meta-only context
  const title = document.getElementById('endTitle');
  const sub = document.getElementById('endSubtitle');
  title.textContent = 'SANCTUARY';
  title.style.color = '#a0e8ff';
  title.style.textShadow = '0 0 18px rgba(160,232,255,0.5)';
  sub.textContent = 'spend essence on permanent upgrades';
  document.getElementById('endStats').innerHTML = '';
  document.getElementById('endRelics').innerHTML = '';
  document.getElementById('endEssence').textContent = '✨ ' + meta.essence + ' essence banked';
  renderMetaShop(true);
  document.getElementById('restartBtn').textContent = '← MAIN MENU';
  // Re-bind restart to route to main menu instead of a new run
  const btn = document.getElementById('restartBtn');
  btn.onclick = () => { btn.onclick = null; showMainMenu(); };
  deathEl.style.display = 'flex';
}

function hideAllOverlays() {
  menuEl.style.display = 'none';
  weaponPickerEl.style.display = 'none';
  cursesEl.style.display = 'none';
  if (achEl) achEl.style.display = 'none';
  if (settingsEl) settingsEl.style.display = 'none';
  if (tarotRevealEl) tarotRevealEl.style.display = 'none';
  if (memoryEl) memoryEl.style.display = 'none';
  if (hamletEl) hamletEl.style.display = 'none';
  if (dialogueEl) dialogueEl.style.display = 'none';
  if (volumesEl) volumesEl.style.display = 'none';
  if (smithEl) smithEl.style.display = 'none';
  if (typeof oracleEl !== 'undefined' && oracleEl) oracleEl.style.display = 'none';
  deathEl.style.display = 'none';
  winEl.style.display = 'none';
}

// Pause menu overlay — ESC to toggle
const pauseEl = document.createElement('div');
pauseEl.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:radial-gradient(ellipse at center,#140a18 0%,#0a0610 65%,#050308 100%);color:#ddd;pointer-events:auto;font-family:Georgia,"Cormorant Garamond",serif;padding:24px;box-sizing:border-box;';
pauseEl.innerHTML = `
  <!-- Deep vignette frame — same discipline as main menu. -->
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center, transparent 28%, rgba(4,2,6,0.55) 78%, rgba(0,0,0,0.85) 100%);pointer-events:none;"></div>

  <!-- Page-frame corner flourishes (4 L-shapes) — mark this as a page. -->
  <div style="position:absolute;top:22px;left:22px;width:48px;height:48px;pointer-events:none;animation:winFadeIn 0.7s ease-out both;">
    <div style="position:absolute;top:0;left:0;width:48px;height:1px;background:linear-gradient(90deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;top:0;left:0;width:1px;height:48px;background:linear-gradient(180deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;top:-2px;left:-2px;width:4px;height:4px;background:#c9a86a;transform:rotate(45deg);"></div>
  </div>
  <div style="position:absolute;top:22px;right:22px;width:48px;height:48px;pointer-events:none;animation:winFadeIn 0.7s ease-out both;">
    <div style="position:absolute;top:0;right:0;width:48px;height:1px;background:linear-gradient(270deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;top:0;right:0;width:1px;height:48px;background:linear-gradient(180deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;top:-2px;right:-2px;width:4px;height:4px;background:#c9a86a;transform:rotate(45deg);"></div>
  </div>
  <div style="position:absolute;bottom:22px;left:22px;width:48px;height:48px;pointer-events:none;animation:winFadeIn 0.7s ease-out both;">
    <div style="position:absolute;bottom:0;left:0;width:48px;height:1px;background:linear-gradient(90deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;bottom:0;left:0;width:1px;height:48px;background:linear-gradient(0deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;bottom:-2px;left:-2px;width:4px;height:4px;background:#c9a86a;transform:rotate(45deg);"></div>
  </div>
  <div style="position:absolute;bottom:22px;right:22px;width:48px;height:48px;pointer-events:none;animation:winFadeIn 0.7s ease-out both;">
    <div style="position:absolute;bottom:0;right:0;width:48px;height:1px;background:linear-gradient(270deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;bottom:0;right:0;width:1px;height:48px;background:linear-gradient(0deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;bottom:-2px;right:-2px;width:4px;height:4px;background:#c9a86a;transform:rotate(45deg);"></div>
  </div>

  <!-- Content column, z above ambient. -->
  <div style="position:relative;display:flex;flex-direction:column;align-items:center;z-index:1;">
    <!-- Ornamental frame above the title — gold, not purple. -->
    <div style="display:flex;align-items:center;gap:22px;margin-bottom:10px;opacity:0.7;animation:winFadeIn 0.6s ease-out;">
      <div style="width:90px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
      <div style="color:#c9a86a;font-size:11px;letter-spacing:6px;font-style:italic;">the descent halts</div>
      <div style="width:90px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
    </div>
    <h1 style="font-size:56px;margin:0;letter-spacing:10px;color:#f4d9a0;text-shadow:0 0 18px rgba(244,217,160,0.45);font-weight:400;line-height:1;animation:winFadeIn 0.7s ease-out 0.1s both;">PAUSED</h1>
    <!-- Subtitle with diamond flanks — same grammar as main menu. -->
    <div style="display:flex;align-items:center;gap:12px;margin:10px 0 26px;opacity:0.55;animation:winFadeIn 0.6s ease-out 0.2s both;">
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);"></span>
      <span style="color:#d8cfae;font-size:11px;letter-spacing:6px;font-style:italic;">press ESC to resume</span>
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);"></span>
    </div>

    <!-- Relic strip (decor, shown during run) -->
    <div id="pauseRelics" style="display:flex;gap:8px;align-items:center;margin-bottom:20px;flex-wrap:wrap;justify-content:center;max-width:640px;animation:winFadeIn 0.6s ease-out 0.3s both;"></div>

    <!-- Two plaques: CONTROLS + SETTINGS — borderless, inset-stroke plate treatment. -->
    <div style="display:flex;gap:20px;align-items:flex-start;margin-bottom:26px;animation:winCardSlide 0.55s ease-out 0.4s both;">
      <div style="display:grid;grid-template-columns:auto auto;gap:7px 24px;background:linear-gradient(180deg,rgba(30,22,16,0.8),rgba(14,10,8,0.85));padding:16px 26px;font-size:13px;color:#d8cfae;font-family:Georgia,serif;box-shadow:inset 0 0 0 1px rgba(201,168,106,0.28), inset 0 0 14px rgba(0,0,0,0.45);">
        <div style="grid-column:1/-1;color:#c9a86a;letter-spacing:5px;font-size:9px;margin-bottom:8px;font-weight:bold;text-align:center;opacity:0.85;">\u2666 CONTROLS \u2666</div>
        <div style="opacity:0.55;">Move</div><div>WASD</div>
        <div style="opacity:0.55;">Attack</div><div>LMB (hold: charge)</div>
        <div style="opacity:0.55;">Aim</div><div>Mouse</div>
        <div style="opacity:0.55;">Dodge</div><div>Space</div>
        <div style="opacity:0.55;">Dash Strike</div><div>Q</div>
        <div style="opacity:0.55;">Pause</div><div>Esc</div>
      </div>
      <div style="display:grid;grid-template-columns:auto 140px auto;gap:11px 14px;background:linear-gradient(180deg,rgba(30,22,16,0.8),rgba(14,10,8,0.85));padding:16px 26px;font-size:13px;color:#d8cfae;align-items:center;font-family:Georgia,serif;box-shadow:inset 0 0 0 1px rgba(201,168,106,0.28), inset 0 0 14px rgba(0,0,0,0.45);">
        <div style="grid-column:1/-1;color:#c9a86a;letter-spacing:5px;font-size:9px;margin-bottom:8px;font-weight:bold;text-align:center;opacity:0.85;">\u2666 SETTINGS \u2666</div>
        <div style="opacity:0.65;">SFX</div><input id="setSfx" type="range" min="0" max="100" step="1" style="accent-color:#c9a86a;" /><div id="setSfxVal" style="opacity:0.55;font-size:11px;width:32px;text-align:right;"></div>
        <div style="opacity:0.65;">Music</div><input id="setMusic" type="range" min="0" max="100" step="1" style="accent-color:#c9a86a;" /><div id="setMusicVal" style="opacity:0.55;font-size:11px;width:32px;text-align:right;"></div>
        <div style="opacity:0.65;">Shake</div><input id="setShake" type="range" min="0" max="150" step="1" style="accent-color:#c9a86a;" /><div id="setShakeVal" style="opacity:0.55;font-size:11px;width:32px;text-align:right;"></div>
      </div>
    </div>

    <!-- Resume button — same gold CTA treatment as main menu's BEGIN DESCENT. -->
    <button id="pauseResumeBtn" style="background:linear-gradient(180deg,#3a2a20,#1a0f08);color:#f4d9a0;border:0;padding:14px 56px;font-size:15px;cursor:pointer;letter-spacing:6px;margin-bottom:14px;font-family:Georgia,serif;font-weight:bold;transition:all 0.22s ease;box-shadow:inset 0 0 0 1px #c9a86a, 0 0 20px rgba(201,168,106,0.22), inset 0 0 12px rgba(244,217,160,0.06);animation:winFadeIn 0.55s ease-out 0.6s both;">RESUME</button>
    <!-- Secondary text links — no boxes, just gold/crimson text. -->
    <button id="pauseJournalBtn" style="background:transparent;color:#c9a86a;border:0;padding:6px 16px;font-size:11px;cursor:pointer;letter-spacing:4px;margin-bottom:6px;font-family:Georgia,serif;font-style:italic;transition:all 0.22s ease;opacity:0.75;animation:winFadeIn 0.55s ease-out 0.7s both;">JOURNAL OF THE RUIN</button>
    <button id="pauseQuitBtn" style="background:transparent;color:#8a4848;border:0;padding:6px 16px;font-size:11px;cursor:pointer;letter-spacing:4px;font-family:Georgia,serif;font-style:italic;transition:all 0.22s ease;opacity:0.75;animation:winFadeIn 0.55s ease-out 0.8s both;">\u2620 END RUN</button>
  </div>
`;
document.getElementById('hud').appendChild(pauseEl);
document.getElementById('pauseResumeBtn').addEventListener('click', () => setPaused(false));
document.getElementById('pauseQuitBtn').addEventListener('click', () => {
  paused = false;
  pauseEl.style.display = 'none';
  hero.hp = 0;
  hero.state = 'dead';
  hero.stateTime = 1;          // force immediate end-of-run
});
document.getElementById('pauseJournalBtn').addEventListener('click', () => {
  showJournalModal();
});

// JOURNAL OF THE RUIN — scrollable auto-generated history modal
const journalEl = document.createElement('div');
journalEl.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:radial-gradient(ellipse at center,#140a18 0%,#0a0610 65%,#050308 100%);color:#ddd;pointer-events:auto;font-family:Georgia,"Cormorant Garamond",serif;padding:40px 24px;box-sizing:border-box;z-index:20;';
journalEl.innerHTML = `
  <!-- Page frame + vignette -->
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center, transparent 28%, rgba(4,2,6,0.55) 78%, rgba(0,0,0,0.85) 100%);pointer-events:none;"></div>
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

  <div style="position:relative;display:flex;flex-direction:column;align-items:center;z-index:1;width:100%;">
    <div style="display:flex;align-items:center;gap:22px;margin-bottom:10px;opacity:0.75;">
      <div style="width:100px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
      <div style="color:#c9a86a;font-size:11px;letter-spacing:6px;font-style:italic;">the ruin remembers</div>
      <div style="width:100px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
    </div>
    <h1 style="font-size:42px;margin:0;letter-spacing:8px;color:#c9a86a;text-shadow:0 0 14px rgba(201,168,106,0.45);font-weight:400;line-height:1;">JOURNAL OF THE RUIN</h1>
    <div style="display:flex;align-items:center;gap:12px;margin:10px 0 22px;opacity:0.65;max-width:90vw;text-align:center;">
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);flex-shrink:0;"></span>
      <p id="journalSubtitle" style="margin:0;letter-spacing:3px;font-size:11px;font-style:italic;color:#d8cfae;"></p>
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);flex-shrink:0;"></span>
    </div>
    <div id="journalEntries" style="width:720px;max-width:90vw;max-height:60vh;overflow-y:auto;padding:22px 24px;background:linear-gradient(180deg,rgba(30,22,16,0.75),rgba(14,10,8,0.8));box-shadow:inset 0 0 0 1px rgba(201,168,106,0.28), inset 0 0 18px rgba(0,0,0,0.5);font-size:13px;color:#d8cfae;font-family:Georgia,serif;line-height:1.6;"></div>
    <button id="journalBackBtn" style="background:transparent;color:#8a4848;border:0;padding:8px 20px;font-size:11px;cursor:pointer;letter-spacing:5px;margin-top:22px;font-family:Georgia,serif;font-style:italic;font-weight:bold;transition:all 0.22s ease;opacity:0.75;">\u2190 CLOSE</button>
  </div>
`;
document.getElementById('hud').appendChild(journalEl);
document.getElementById('journalBackBtn').addEventListener('click', () => {
  journalEl.style.display = 'none';
  pauseEl.style.display = 'flex';
});

function showJournalModal() {
  pauseEl.style.display = 'none';
  journalEl.style.display = 'flex';
  const subtitle = document.getElementById('journalSubtitle');
  const entries = document.getElementById('journalEntries');
  const age = ruin.age | 0;
  const cleared = ruin.runsCompleted | 0;
  const bossKills = (ruin.bossKills || []).length;
  subtitle.textContent = `the dungeon has aged ${age} death${age === 1 ? '' : 's'} \u00b7 ${bossKills} boss${bossKills === 1 ? '' : 'es'} felled \u00b7 ${cleared} full descent${cleared === 1 ? '' : 's'}`;
  entries.innerHTML = '';
  if (!ruin.journal || ruin.journal.length === 0) {
    entries.innerHTML = '<div style="opacity:0.55;font-style:italic;text-align:center;padding:30px 0;">The journal is empty. Die, or defeat a boss, and the ruin will begin to remember.</div>';
    return;
  }
  for (const entry of ruin.journal) {
    const tint = entry.kind === 'death' ? '#d85a5a'
               : entry.kind === 'boss' ? '#f4d9a0'
               : entry.kind === 'milestone' ? '#a0e8ff' : '#d8d4ea';
    const icon = entry.kind === 'death' ? '✓'
               : entry.kind === 'boss' ? '†'
               : entry.kind === 'milestone' ? '✦' : '·';
    const div = document.createElement('div');
    div.style.cssText = `display:flex;gap:10px;padding:8px 0;border-bottom:1px solid rgba(100,90,90,0.15);`;
    div.innerHTML = `
      <div style="color:${tint};font-size:20px;width:22px;text-align:center;">${icon}</div>
      <div style="flex:1;font-size:13px;color:#d8cfc4;font-style:italic;line-height:1.5;">${entry.text}</div>
    `;
    entries.appendChild(div);
  }
}
// Settings sliders — live-update + persist
document.getElementById('setSfx').addEventListener('input', (e) => {
  setSfxVolume(parseInt(e.target.value, 10) / 100);
  document.getElementById('setSfxVal').textContent = e.target.value + '%';
});
document.getElementById('setMusic').addEventListener('input', (e) => {
  setMusicVolumeSetting(parseInt(e.target.value, 10) / 100);
  document.getElementById('setMusicVal').textContent = e.target.value + '%';
});
document.getElementById('setShake').addEventListener('input', (e) => {
  setShakeScaleSetting(parseInt(e.target.value, 10) / 100);
  document.getElementById('setShakeVal').textContent = e.target.value + '%';
});

function setPaused(p) {
  paused = p;
  pauseEl.style.display = p ? 'flex' : 'none';
  if (p) { populatePauseRelics(); syncSettingsSliders(); }
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

function syncSettingsSliders() {
  const sfx = document.getElementById('setSfx');
  const music = document.getElementById('setMusic');
  const shake = document.getElementById('setShake');
  if (!sfx) return;
  sfx.value = Math.round(settings.sfxVolume * 100);
  music.value = Math.round(settings.musicVolume * 100);
  shake.value = Math.round(settings.shakeScale * 100);
  document.getElementById('setSfxVal').textContent = sfx.value + '%';
  document.getElementById('setMusicVal').textContent = music.value + '%';
  document.getElementById('setShakeVal').textContent = shake.value + '%';
}

function populatePauseRelics() {
  const row = document.getElementById('pauseRelics');
  row.innerHTML = '';
  if (equippedRelics.length === 0) {
    row.innerHTML = '<div style="opacity:0.5;font-size:13px;letter-spacing:2px;padding:20px 0;">NO RELICS YET — defeat enemies and claim pedestals</div>';
    return;
  }
  // FUSIONS — shown first as standout section when any are active
  if (activeFusions.length > 0) {
    const fHeader = document.createElement('div');
    fHeader.style.cssText = 'width:100%;font-size:10px;letter-spacing:3px;color:#a0e8ff;text-align:center;margin-bottom:6px;';
    fHeader.textContent = `⚡ ACTIVE FUSIONS · ${activeFusions.length} / ${totalFusions()} DISCOVERED`;
    row.appendChild(fHeader);
    const fGroup = document.createElement('div');
    fGroup.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;justify-content:center;width:100%;margin-bottom:14px;';
    for (const f of activeFusions) {
      const tile = document.createElement('div');
      tile.title = f.desc;
      const comps = f.components.map(id => RELIC_DEFS[id]?.name || id).join(' + ');
      tile.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:4px;background:linear-gradient(180deg,rgba(20,30,40,0.9),rgba(10,14,22,0.9));border:2px solid ${f.tint};padding:8px 10px;font-size:11px;color:${f.tint};width:190px;box-shadow:0 0 10px ${f.tint}44;`;
      tile.innerHTML = `
        <div style="font-size:9px;letter-spacing:2px;opacity:0.7;">⚡ FUSION</div>
        <div style="font-weight:bold;font-size:14px;color:#fff8e8;letter-spacing:1px;text-shadow:0 0 8px ${f.tint};">${f.name}</div>
        <div style="font-size:9px;color:#a0b4c8;font-style:italic;">${comps}</div>
        <div style="font-size:10px;color:#d0d8e4;text-align:center;margin-top:2px;line-height:1.3;">${f.desc}</div>
      `;
      fGroup.appendChild(tile);
    }
    row.appendChild(fGroup);
  }
  // Group by tier for a cleaner build overview
  const tiers = { legendary: [], rare: [], common: [] };
  for (const r of equippedRelics) {
    const t = r.tier || 'common';
    (tiers[t] || tiers.common).push(r);
  }
  const label = { legendary: '★ LEGENDARY', rare: '◆ RARE', common: '· COMMON' };
  const tierColor = { legendary: '#ffc8ff', rare: '#f4d9a0', common: '#b4c8d8' };
  // Title bar
  const header = document.createElement('div');
  header.style.cssText = 'width:100%;font-size:10px;letter-spacing:3px;opacity:0.5;text-align:center;margin-bottom:4px;';
  header.textContent = `CURRENT BUILD · ${equippedRelics.length} RELIC${equippedRelics.length === 1 ? '' : 'S'}`;
  row.appendChild(header);
  for (const tKey of ['legendary', 'rare', 'common']) {
    const tierRelics = tiers[tKey];
    if (!tierRelics || tierRelics.length === 0) continue;
    // Group container
    const group = document.createElement('div');
    group.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;justify-content:center;width:100%;margin-bottom:4px;';
    // Tier label
    const labelEl = document.createElement('div');
    labelEl.style.cssText = `width:100%;font-size:9px;letter-spacing:3px;color:${tierColor[tKey]};opacity:0.8;text-align:center;`;
    labelEl.textContent = label[tKey];
    group.appendChild(labelEl);
    for (const r of tierRelics) {
      const tile = document.createElement('div');
      tile.title = r.desc;
      tile.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:4px;background:rgba(20,14,25,0.85);border:1px solid ${r.tint};padding:6px 8px 6px;font-size:11px;color:${r.tint};width:160px;max-width:160px;`;
      tile.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;width:100%;">
          <img src="assets/icons/${r.icon}.png" style="width:22px;height:22px;image-rendering:pixelated;filter:hue-rotate(${hueRotateForTint(r.tint)}deg) saturate(1.15);" />
          <span style="font-weight:bold;font-size:11px;">${r.name}</span>
        </div>
        <div style="font-size:9px;color:#bbb;line-height:1.3;text-align:center;opacity:0.85;">${r.desc}</div>
      `;
      group.appendChild(tile);
    }
    row.appendChild(group);
  }
}

// Hook ESC key to toggle pause (only when game is actively running)
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape') return;
  // Don't pause when death/win overlays are open
  if (!running) return;
  if (deathEl.style.display !== 'none') return;
  if (winEl.style.display !== 'none') return;
  setPaused(!paused);
  e.preventDefault();
});

// R — reroll pedestal offers for gold. Cost scales with floor (15g base).
window.addEventListener('keydown', (e) => {
  if (e.code !== 'KeyR') return;
  if (!running || paused) return;
  if (deathEl.style.display !== 'none' || winEl.style.display !== 'none') return;
  if (!hasActivePedestals()) return;
  // Altars + secret wall pedestals skip reroll; only the standard 3-offer pedestals.
  // Detect via hpCost === 0 on ALL active pedestals.
  const activeStd = pedestals.filter(p => !p.picked && p.hpCost === 0);
  if (activeStd.length < 2) return;       // need multi-choice context
  // Cost scales with floor depth
  const cost = 15 + currentFloorLevel * 5;
  if (gold.total < cost) {
    // Feedback: brief label + denied chirp
    roomLabelText = `REROLL NEEDS ${cost}g (you have ${gold.total})`;
    roomLabelColor = '#d85a5a';
    roomLabelTime = 1.6;
    synthClick(0.5, 1.0);
    return;
  }
  gold.total -= cost;
  // Spawn fresh offers
  clearPedestals();
  spawnRelicOffer(currentFloorLevel);
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

function loadRoom(idx, entryFrom) {
  const data = floor[idx];
  data.entryFrom = entryFrom;
  // Set next-room hint so door preview can render the right icon (unless Blind curse)
  roomNextKind.kind = isCursed('blind') ? null : (floor[idx + 1]?.kind || null);
  // Onboarding — trigger tips based on room kind transitions. Delay the
  // first_combat tip so it doesn't collide with the codex banner + enemy
  // spawn rush. By ~2s the player has seen the slime card and is ready for
  // gameplay reminders.
  if (data.kind === 'combat' && currentFloorLevel === 1) {
    setTimeout(() => showTip('first_combat'), 2200);
  }
  if (data.kind === 'reward') showTip('first_pedestal');
  // Room-kind onboarding tips (review onboarding pass) — fire once per player,
  // a short delay so the room settles before the banner appears.
  if (data.kind === 'altar')  setTimeout(() => showTip('first_altar'),  1200);
  if (data.kind === 'trove')  setTimeout(() => showTip('first_trove'),  1200);
  if (data.kind === 'boss')   setTimeout(() => showTip('first_boss'),   1800);
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
  buildRoomFromData(data);
  clearEnemies();
  clearProjectiles();
  clearPedestals();
  clearFx();
  clearFlames();
  clearSynergies();
  clearWanderer();
  clearAmbientCreatures();   // fresh bat/raven cycle per room
  // Meta consolidation (review #3): Memory of the Hermit flag piggybacks
  // on the existing Tarot Hermit path so the Wanderer spawn logic stays
  // in one place.
  maybeSpawnWanderer(data.kind, (isTarotRun() && hasCard('the_hermit')) || !!hero.memoryHermit, currentFloorLevel);
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
  // Altar rooms spawn their 2 HP-cost pedestals immediately on entry
  if (data.kind === 'altar') {
    spawnAltarOffer(3);    // -3 HP per relic
  }

  // Boss room — dramatic intro: hold gameplay for ~2s while showing boss name
  if (data.kind === 'boss') {
    bossIntroTime = 2.2;
    bossIntroBoss = enemies.find(e => e.boss);
    shakeCamera(14, 0.5);
    pulseZoom(0.14, 1.0);                       // cinematic punch-in on boss entry
    // Audio stinger — deep metal impact to punctuate the intro
    playSfx('hero_hurt', { rate: 0.35, volume: 1.0 });
    setTimeout(() => playSfx('slime_death', { rate: 0.5, volume: 0.85 }), 180);
    setTimeout(() => playSfx('hero_hurt', { rate: 0.28, volume: 0.9 }), 520);
  } else {
    bossIntroTime = 0;
    bossIntroBoss = null;
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
  // Snap camera instantly so the new room fills the frame on transition
  camera.x = hero.x; camera.y = hero.y;
  camera.targetX = hero.x; camera.targetY = hero.y;
  roomIndex = idx;
}

const BIOME_BY_FLOOR = { 1: 'crypt', 2: 'vault', 3: 'abyss', 4: 'inferno' };

function triggerFloorCard(level) {
  const d = FLOOR_CARD_DATA[level] || { roman: '?', name: '???', flavor: '' };
  floorCardRoman = d.roman;
  floorCardName = d.name;
  floorCardFlavor = d.flavor;
  floorCardTime = 3.2;
}

// PROLOGUE — shown once, ever, before the first run. Sets the tone of the
// world in 5 staged beats. Persisted via localStorage so veterans don't
// see it again. Click or press any key to advance.
const PROLOGUE_KEY = 'ethera:seen_prologue:v1';
function hasSeenPrologue() {
  try { return !!localStorage.getItem(PROLOGUE_KEY); } catch (e) { return false; }
}
function markPrologueSeen() {
  try { localStorage.setItem(PROLOGUE_KEY, '1'); } catch (e) {}
}

const PROLOGUE_BEATS = [
  'The old world has ended.',
  'What remains is called Ethera \u2014',
  'a ruin that remembers every soul that descends,',
  'and sharpens itself against you.',
  'You are not the first. You will not be the last.',
];

const prologueEl = document.createElement('div');
prologueEl.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:radial-gradient(ellipse at center,#140a18 0%,#0a0610 60%,#020104 100%);color:#f4d9a0;pointer-events:auto;font-family:Georgia,"Cormorant Garamond",serif;padding:40px;box-sizing:border-box;cursor:pointer;z-index:40;';
prologueEl.innerHTML = `
  <!-- Corner flourishes matching every other page. -->
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

  <!-- Central narrative column -->
  <div id="prologueLines" style="display:flex;flex-direction:column;align-items:center;gap:28px;text-align:center;max-width:720px;"></div>
  <div id="prologueSkip" style="position:absolute;bottom:42px;left:0;right:0;text-align:center;font-size:10px;letter-spacing:6px;color:#c9a86a;opacity:0;font-style:italic;transition:opacity 0.6s ease;">click or press any key to continue</div>
`;
document.getElementById('hud').appendChild(prologueEl);

// Reveal prologue beats one by one, then enable dismissal.
function playPrologue(onDone) {
  const lines = document.getElementById('prologueLines');
  const skip = document.getElementById('prologueSkip');
  lines.innerHTML = '';
  prologueEl.style.display = 'flex';
  let idx = 0;
  let dismissed = false;
  const done = () => {
    if (dismissed) return;
    dismissed = true;
    markPrologueSeen();
    prologueEl.style.display = 'none';
    document.removeEventListener('keydown', keyHandler);
    prologueEl.removeEventListener('click', clickHandler);
    if (onDone) onDone();
  };
  const keyHandler = () => done();
  const clickHandler = () => done();
  const revealNext = () => {
    if (idx >= PROLOGUE_BEATS.length) {
      // All beats revealed — show skip hint + arm dismissal.
      skip.style.opacity = '0.75';
      document.addEventListener('keydown', keyHandler);
      prologueEl.addEventListener('click', clickHandler);
      // Auto-dismiss after 6s if the player doesn't act.
      setTimeout(done, 6000);
      return;
    }
    const line = document.createElement('div');
    const isLast = idx === PROLOGUE_BEATS.length - 1;
    line.textContent = PROLOGUE_BEATS[idx];
    line.style.cssText = `
      font-size:${isLast ? 22 : 20}px;
      letter-spacing:${isLast ? 4 : 2}px;
      color:${isLast ? '#f4d9a0' : '#d8cfae'};
      font-style:${isLast ? 'normal' : 'italic'};
      opacity:0;
      transform:translateY(12px);
      transition:opacity 1.2s ease, transform 1.2s ease;
      text-shadow:${isLast ? '0 0 14px rgba(244,217,160,0.45)' : '0 0 8px rgba(0,0,0,0.6)'};
      line-height:1.5;
    `;
    lines.appendChild(line);
    // Trigger reveal next frame
    requestAnimationFrame(() => {
      line.style.opacity = '1';
      line.style.transform = 'translateY(0)';
    });
    idx++;
    setTimeout(revealNext, isLast ? 1500 : 1600);
  };
  // Start a low, ominous chord as the prologue opens.
  try { synthChord(220, 1.2, 1.4); } catch (e) {}
  setTimeout(revealNext, 600);
}

// EPILOGUE — shown once, ever, on the first full clear. Counterpart to the
// prologue: the prologue frames entering the ruin; the epilogue frames
// reaching the bottom. After dismissal, flow continues to showEndOfRun.
const EPILOGUE_KEY = 'ethera:seen_epilogue:v1';
function hasSeenEpilogue() {
  try { return !!localStorage.getItem(EPILOGUE_KEY); } catch (e) { return false; }
}
function markEpilogueSeen() {
  try { localStorage.setItem(EPILOGUE_KEY, '1'); } catch (e) {}
}
const EPILOGUE_BEATS = [
  'You walked to the bottom.',
  'For a moment, the ruin forgot its hunger.',
  'But Ethera is older than any victory.',
  'The wound you closed will open again \u2014',
  'and the dark, when it wakes, will remember your name.',
];
const epilogueEl = document.createElement('div');
epilogueEl.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:radial-gradient(ellipse at center,#1a0a0e 0%,#0a0610 60%,#020104 100%);color:#f4d9a0;pointer-events:auto;font-family:Georgia,"Cormorant Garamond",serif;padding:40px;box-sizing:border-box;cursor:pointer;z-index:40;';
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
    markEpilogueSeen();
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

function saveRunSnapshot() {
  try {
    const snap = {
      floorLevel: currentFloorLevel,
      maxHp: hero.maxHp,
      hp: hero.hp,
      gold: gold.total,
      weapon: hero.weapon || 'sword',
      relicIds: equippedRelics.map(r => r.id),
      curseIds: [...activeCurses],
      tarotIds: drawnCards.map(c => c.id),
      dailyActive: !!daily.activeForRun,
      timestamp: Date.now(),
    };
    localStorage.setItem(RUN_SNAPSHOT_KEY, JSON.stringify(snap));
  } catch (e) {}
}
function loadRunSnapshot() {
  try {
    const raw = localStorage.getItem(RUN_SNAPSHOT_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !s.floorLevel || s.floorLevel < 1 || s.floorLevel > MAX_FLOORS) return null;
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
  // Tarot (re-apply run effects via existing reveal path would be ideal, but
  // for a resume we just restore the flags via tarot.js state re-population)
  // — applied later by the existing tarot active checks in game logic
  // Relics (apply each one; fusion hooks fire as expected)
  for (const rid of (snap.relicIds || [])) {
    if (RELIC_DEFS[rid]) applyRelic(rid);
  }
  // Restore HP / gold / maxHp AFTER relics (relics can change maxHp)
  hero.maxHp = snap.maxHp || hero.maxHp;
  hero.hp = Math.min(hero.maxHp, Math.max(1, snap.hp || hero.maxHp));
  gold.total = snap.gold | 0;
  daily.activeForRun = !!snap.dailyActive;
  // Enter floor N
  currentFloorLevel = Math.max(1, Math.min(MAX_FLOORS, snap.floorLevel));
  setBiome(BIOME_BY_FLOOR[currentFloorLevel]);
  window.__currentBiome = BIOME_BY_FLOOR[currentFloorLevel];
  window.__currentFloorLevel = currentFloorLevel;
  // SYSTEMS PASS 2c — initialize branching graph. `floor` grows as the
  // player commits to path nodes; starts with just the start room so
  // loadRoom(0) works on the existing linear-array code.
  currentGraph = generateFloorGraph(currentFloorLevel);
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
  phaseIntroTime = 0;
  phaseIntroBoss = null;
  fusionBannerTime = 0;
  triggerFloorCard(currentFloorLevel);
  loadRoom(0, 'south');
  running = true;
  // Snapshot at run start so a player who quits floor 1 can resume floor 1.
  saveRunSnapshot();
}

function startRun() {
  // Gate: play the prologue once, ever, before the first run begins.
  if (!hasSeenPrologue()) {
    hideAllOverlays();
    playPrologue(() => startRun());    // re-enter after dismiss (flag now set)
    return;
  }
  // Ambient pad fades out as the run begins — the real combat music system
  // (music.js, when OGG tracks land) will take over from here.
  stopAmbientPad();
  currentFloorLevel = 1;
  setBiome(BIOME_BY_FLOOR[currentFloorLevel]);
  window.__currentBiome = BIOME_BY_FLOOR[currentFloorLevel];
  window.__currentFloorLevel = currentFloorLevel;
  // SYSTEMS PASS 2c — initialize branching graph. `floor` grows as the
  // player commits to path nodes; starts with just the start room so
  // loadRoom(0) works on the existing linear-array code.
  currentGraph = generateFloorGraph(currentFloorLevel);
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
  incrementRunsStarted();
  triggerFloorCard(currentFloorLevel);
  clearPedestals();
  // Apply meta-progression unlocks to fresh run (UNLESS Forsaken curse active)
  if (!isCursed('forsaken')) {
    if (hasUnlock('vitality_charm')) { hero.maxHp += 3; hero.hp = hero.maxHp; }
    if (hasUnlock('steeled_resolve')) { hero.damageTakenMul *= 0.85; }
    if (hasUnlock('sharpened_edge')) { hero.damageMul *= 1.10; }
    if (hasUnlock('swift_boots')) { hero.dodgeCooldownMul *= 0.80; }
    if (hasUnlock('purse_of_depths')) { gold.total += 50; }
    if (hasUnlock('blessed_greaves')) { applyRelic('iron_greaves'); }
    if (hasUnlock('ancient_pact')) {
      const pool = ALL_RELIC_IDS.filter(id => !equippedRelics.find(r => r.id === id));
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
      const rares = ALL_RELIC_IDS.filter(id => (RELIC_DEFS[id].tier === 'rare') && !equippedRelics.find(r => r.id === id));
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
  fusionBannerTime = 0;
  fusionBannerFusion = null;
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
  loadRoom(0, 'south');
  running = true;
}

// Clear drawn tarot on return to menu — so the next run only has cards if tarot run
function clearTarotOnRunEnd() { clearTarot(); }

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
  currentGraph = generateFloorGraph(currentFloorLevel);
  currentNodeId = currentGraph.startId;
  floor = [getFloorNode(currentGraph, currentNodeId).roomData];
  // ASCENSION VIII — track when this floor started so enemies.js can
  // apply the timeout multiplier when the floor runs long.
  window.__floorStartTime = performance.now();
  winEl.style.display = 'none';
  transition = { active: false, phase: 'out', t: 0, toIndex: 0 };
  bossWinTriggered = false;
  triggerFloorCard(currentFloorLevel);
  loadRoom(0, 'south');
  running = true;
  // Snapshot at floor boundary — this is the resume point if the player
  // closes the browser now.
  saveRunSnapshot();
}

// Format a duration like 2:43
function fmtTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

// Populate the end-of-run summary panel (death OR final victory)
function showEndOfRun(isVictory) {
  // Run ended — clear any resume snapshot. Fresh start from now on.
  clearRunSnapshot();
  const title = document.getElementById('endTitle');
  const subtitle = document.getElementById('endSubtitle');
  const ornamentText = document.getElementById('endOrnamentText');
  const ornamentParent = document.getElementById('endOrnament');
  const restartBtn = document.getElementById('restartBtn');
  const lineL = document.getElementById('endOrnamentLineL');
  const lineR = document.getElementById('endOrnamentLineR');
  const dotL = document.getElementById('endSubtitleDotL');
  const dotR = document.getElementById('endSubtitleDotR');
  if (isVictory) {
    // VICTORY — pure gold palette, triumphant
    title.textContent = 'THE DEPTHS YIELD';
    title.style.color = '#f4d9a0';
    title.style.textShadow = '0 0 22px rgba(244,217,160,0.7)';
    subtitle.textContent = VICTORY_MESSAGES[(Math.random() * VICTORY_MESSAGES.length) | 0];
    subtitle.style.color = '#d8cfae';
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
    const line = DEATH_MESSAGES[(Math.random() * DEATH_MESSAGES.length) | 0];
    subtitle.textContent = line;
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
      restartBtn.textContent = 'NEW RUN';
      restartBtn.style.color = '#f4d9a0';
    }
  }

  // Stats grid
  const grid = document.getElementById('endStats');
  const duration = fmtTime(runDurationSeconds());
  // Determine combo tier label for display flavor
  const mc = stats._maxCombo | 0;
  const comboTier = mc >= 40 ? 'CARNAGE' : mc >= 20 ? 'RAMPAGE' : mc >= 10 ? 'FLURRY' : mc >= 5 ? 'CHAIN' : '';
  const comboTierColor = mc >= 40 ? '#ff4444' : mc >= 20 ? '#ff9966' : mc >= 10 ? '#ffcc66' : mc >= 5 ? '#88ddff' : '#888';
  const comboTag = comboTier ? ` <span style="color:${comboTierColor};font-size:11px;letter-spacing:1px;">· ${comboTier}</span>` : '';
  // Evaluate NEW BEST records for this run (saves records to localStorage)
  const beatenRecords = updateRecords(stats, isVictory, runDurationSeconds());
  // MEMORY WEAVE — check if the run earned any new Memory unlocks. Newly-
  // unlocked memories are announced by a small banner above the death panel
  // so the player knows a new option is available for next descent.
  const newlyRememberedMemories = checkMemoryUnlocks(records, stats, { seenRelicIds });
  // LIVING HAMLET — check if any new NPCs should arrive based on the
  // refreshed records. They appear when the player next opens the hamlet.
  refreshNpcPresence(records, stats, { seenRelicIds });
  const recordLabels = {
    maxFloor: 'Deepest Descent', maxCombo: 'Highest Combo', biggestHit: 'Biggest Hit',
    mostRelics: 'Most Relics', mostGold: 'Richest Run', mostEnemies: 'Most Kills',
    mostBosses: 'Most Bosses', fastestClear: 'Fastest Clear',
  };
  const newBestMark = (key) => beatenRecords.includes(key)
    ? ' <span style="color:#ffe070;font-size:10px;letter-spacing:1px;text-shadow:0 0 8px rgba(255,224,112,0.8);">★ BEST</span>' : '';
  grid.innerHTML = `
    <div><span style="opacity:0.6;">Floor Reached</span></div><div style="text-align:right;color:#ffd68a;">${stats.floorReached} / ${MAX_FLOORS}${newBestMark('maxFloor')}</div>
    <div><span style="opacity:0.6;">Run Time</span></div><div style="text-align:right;">${duration}${isVictory ? newBestMark('fastestClear') : ''}</div>
    <div><span style="opacity:0.6;">Rooms Cleared</span></div><div style="text-align:right;">${stats.roomsCleared}</div>
    <div><span style="opacity:0.6;">Enemies Slain</span></div><div style="text-align:right;">${stats.enemiesDefeated}${stats.elitesDefeated ? ' (' + stats.elitesDefeated + ' elite)' : ''}${newBestMark('mostEnemies')}</div>
    <div><span style="opacity:0.6;">Bosses Felled</span></div><div style="text-align:right;color:#ff9085;">${stats.bossesKilled}${newBestMark('mostBosses')}</div>
    <div><span style="opacity:0.6;">Damage Dealt</span></div><div style="text-align:right;">${stats.damageDealt | 0}</div>
    <div><span style="opacity:0.6;">Damage Taken</span></div><div style="text-align:right;">${stats.damageTaken | 0}</div>
    <div><span style="opacity:0.6;">Biggest Hit</span></div><div style="text-align:right;color:#ff9066;">${stats.biggestHit | 0}${newBestMark('biggestHit')}</div>
    <div><span style="opacity:0.6;">Gold Collected</span></div><div style="text-align:right;color:#ffd68a;">🪙 ${stats.goldCollected}${newBestMark('mostGold')}</div>
    <div><span style="opacity:0.6;">Relics Acquired</span></div><div style="text-align:right;">${stats.relicsObtained}${newBestMark('mostRelics')}</div>
    <div><span style="opacity:0.6;">Perfect Dodges</span></div><div style="text-align:right;color:#a0e8ff;">${stats.perfectDodges}</div>
    <div><span style="opacity:0.6;">Max Combo</span></div><div style="text-align:right;">${mc}${comboTag}${newBestMark('maxCombo')}</div>
    ${stats.wandererTrades ? `<div><span style="opacity:0.6;">Wanderer Trades</span></div><div style="text-align:right;color:#c9a86a;">${stats.wandererTrades}</div>` : ''}
  `;

  // Relics collected — trophy strip: each relic is a tier-glowing card with
  // name + icon, staggered in. This is the "look at what you built" moment.
  const relicsRow = document.getElementById('endRelics');
  relicsRow.innerHTML = '';
  relicsRow.style.flexDirection = 'column';
  relicsRow.style.alignItems = 'center';
  relicsRow.style.gap = '10px';
  if (equippedRelics.length) {
    // Ornamental header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:12px;opacity:0.6;';
    header.innerHTML = `
      <div style="width:40px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a);"></div>
      <div style="color:#c9a86a;font-size:10px;letter-spacing:4px;font-style:italic;font-family:Georgia,serif;">RELICS OF THE DESCENT</div>
      <div style="width:40px;height:1px;background:linear-gradient(90deg,#c9a86a,transparent);"></div>
    `;
    relicsRow.appendChild(header);
    // The trophy row itself
    const trophyRow = document.createElement('div');
    trophyRow.style.cssText = 'display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap;justify-content:center;max-width:720px;';
    for (let i = 0; i < equippedRelics.length; i++) {
      const r = equippedRelics[i];
      const tier = r.tier || 'common';
      const tierMeta = tier === 'legendary' ? { label: '\u2605 LEGENDARY', color: '#ffc8ff', glow: 'rgba(255,200,255,0.55)', pulse: true }
                     : tier === 'rare'      ? { label: '\u25C6 RARE',      color: '#f4d9a0', glow: 'rgba(244,217,160,0.45)', pulse: false }
                     :                         { label: '\u00B7 COMMON',   color: '#b0c0d0', glow: 'rgba(176,192,208,0.3)',  pulse: false };
      const card = document.createElement('div');
      const stagger = 0.8 + i * 0.08;
      card.style.cssText = `
        display:flex;flex-direction:column;align-items:center;gap:4px;
        width:72px;padding:8px 6px;
        background:linear-gradient(180deg,rgba(30,22,28,0.9),rgba(14,10,16,0.9));
        border:1px solid ${r.tint || tierMeta.color};
        box-shadow:0 0 12px ${tierMeta.glow}, inset 0 0 8px rgba(0,0,0,0.5);
        font-family:Georgia,serif;
        animation:winCardSlide 0.5s ease-out ${stagger}s both${tier === 'legendary' ? ', legendPulse 2.4s ease-in-out infinite' : ''};
      `;
      card.title = r.name + (r.flavor ? '\n\u201C' + r.flavor + '\u201D\n' : '\n') + r.desc;
      card.innerHTML = `
        <div style="font-size:7px;letter-spacing:2px;color:${tierMeta.color};opacity:0.85;font-weight:bold;white-space:nowrap;">${tierMeta.label}</div>
        <div style="padding:3px;background:radial-gradient(circle,${(r.tint||tierMeta.color)}33,transparent 70%);">
          <img src="assets/icons/${r.icon}.png" style="width:40px;height:40px;image-rendering:pixelated;filter:hue-rotate(${hueRotateForTint(r.tint)}deg) saturate(1.15) drop-shadow(0 0 6px ${(r.tint||tierMeta.color)}aa);display:block;" />
        </div>
        <div style="font-size:9px;color:${r.tint || tierMeta.color};text-align:center;letter-spacing:0.5px;line-height:1.15;min-height:22px;font-weight:bold;">${r.name}</div>
      `;
      trophyRow.appendChild(card);
    }
    relicsRow.appendChild(trophyRow);
  }

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
    }
  }
  const essEl = document.getElementById('endEssence');
  const curseTag = curseCount() > 0 ? ` <span style="color:#d85a5a;font-size:13px;">☠ ${cMul.toFixed(2)}x curse bonus</span>` : '';
  // Build a "next unlock" progress bar — shows how much more essence until the
  // cheapest unlocked upgrade. Motivates retry by making progress visible.
  const unlockedIds = Object.keys(meta.unlocked || {});
  const remaining = Object.keys(UNLOCKS).filter(id => !unlockedIds.includes(id));
  // Sort remaining by cost ascending; pick the cheapest next
  remaining.sort((a, b) => UNLOCKS[a].cost - UNLOCKS[b].cost);
  const nextUnlock = remaining[0] ? UNLOCKS[remaining[0]] : null;
  let progressHtml = '';
  if (nextUnlock) {
    const pct = Math.max(0, Math.min(1, meta.essence / nextUnlock.cost));
    const canAfford = meta.essence >= nextUnlock.cost;
    progressHtml = `
      <div style="margin-top:10px;display:flex;flex-direction:column;align-items:center;gap:4px;">
        <div style="font-size:11px;letter-spacing:2px;opacity:0.65;color:${nextUnlock.tint};">
          NEXT UNLOCK · <span style="font-weight:bold;">${nextUnlock.name}</span>
          ${canAfford ? ' · <span style="color:#86e3a8;">READY</span>' : ` · <span style="opacity:0.7;">${meta.essence}/${nextUnlock.cost}</span>`}
        </div>
        <div style="width:280px;height:8px;background:rgba(20,14,25,0.9);border:1px solid ${nextUnlock.tint};position:relative;">
          <div style="position:absolute;left:0;top:0;bottom:0;width:${(pct * 100).toFixed(1)}%;background:linear-gradient(90deg,${nextUnlock.tint},rgba(255,255,255,0.85));"></div>
        </div>
        <div style="font-size:9px;opacity:0.55;max-width:300px;text-align:center;font-style:italic;">${nextUnlock.desc}</div>
      </div>
    `;
  } else if (unlockedIds.length > 0) {
    // All unlocked — show congrats
    progressHtml = `
      <div style="margin-top:10px;font-size:12px;letter-spacing:2px;color:#ffd68a;font-style:italic;">
        ✦ ALL UNLOCKS ACQUIRED · YOU ARE READY ✦
      </div>
    `;
  }
  // Newly-remembered Memories — surface them with a small italic line under
  // the essence counter so the player knows a new build option is available.
  let memoryHtml = '';
  if (newlyRememberedMemories && newlyRememberedMemories.length) {
    const lines = newlyRememberedMemories.map(m =>
      `<div style="color:${m.tint};letter-spacing:3px;font-size:12px;font-style:italic;text-shadow:0 0 8px ${m.tint}88;">\u2766 remembered: ${m.name}</div>`
    ).join('');
    memoryHtml = `<div style="margin-top:12px;display:flex;flex-direction:column;gap:3px;">${lines}</div>`;
  }
  essEl.innerHTML = `+${earned} essence earned${curseTag}   <span style="opacity:0.6;font-size:14px;">(Total: ${meta.essence})</span>${progressHtml}${memoryHtml}`;

  // Meta shop row — animate on initial reveal only; re-renders after an
  // unlock purchase re-use renderMetaShop(false) so cards don't re-slide.
  renderMetaShop(true);

  // Button text is handled in the isVictory branch above ('BEGIN ANEW' / 'NEW RUN')
  deathEl.style.display = 'flex';
}

function renderMetaShop(animate = false) {
  const row = document.getElementById('metaShopRow');
  row.innerHTML = '';
  let staggerIdx = 0;
  for (const id in UNLOCKS) {
    const u = UNLOCKS[id];
    const owned = hasUnlock(id);
    const canAfford = meta.essence >= u.cost;
    const card = document.createElement('div');
    // Tier-colored frame with gradient depth + staggered slide matching shop cards
    const staggerDelay = 1.2 + staggerIdx * 0.1;
    staggerIdx++;
    card.style.cssText = `
      width:170px;
      background:linear-gradient(180deg,rgba(30,20,38,0.95),rgba(16,8,20,0.95));
      border:2px solid ${u.tint};
      padding:12px 10px;
      display:flex;flex-direction:column;align-items:center;gap:5px;
      box-shadow:0 0 16px ${u.tint}55, 0 4px 14px rgba(0,0,0,0.4), inset 0 0 12px rgba(0,0,0,0.3);
      font-family:Georgia,serif;
      ${animate ? `animation:winCardSlide 0.5s ease-out ${staggerDelay}s both;` : ''}
      ${owned ? 'opacity:0.55;' : ''}
    `;
    card.innerHTML = `
      <div style="padding:4px;background:radial-gradient(circle,${u.tint}33,transparent 70%);">
        <img src="assets/icons/${u.icon}.png" style="width:32px;height:32px;image-rendering:pixelated;filter:hue-rotate(${hueRotateForTint(u.tint)}deg) saturate(1.15) drop-shadow(0 0 5px ${u.tint}88);" />
      </div>
      <div style="font-size:12px;font-weight:bold;color:${u.tint};letter-spacing:1px;text-align:center;text-shadow:0 0 4px ${u.tint}44;">${u.name}</div>
      ${u.flavor ? `<div style="font-size:9px;color:rgba(200,190,210,0.7);text-align:center;min-height:24px;line-height:1.3;font-style:italic;padding:0 2px;">${u.flavor}</div>` : ''}
      <div style="height:1px;width:70%;background:linear-gradient(90deg,transparent,${u.tint}aa,transparent);margin:2px 0;"></div>
      <div style="font-size:10px;color:${u.tint};text-align:center;min-height:24px;line-height:1.3;font-weight:bold;">${u.desc}</div>
      <div style="font-size:13px;color:${owned ? '#8ad4a2' : '#a0e8ff'};text-shadow:0 0 6px ${owned ? 'rgba(138,212,162,0.4)' : 'rgba(160,232,255,0.4)'};">${owned ? '\u2713 OWNED' : '\u2728 ' + u.cost}</div>
      ${owned ? '' : `<button class="metaBuyBtn" ${canAfford ? '' : 'disabled'} style="background:linear-gradient(180deg,${u.tint},${darkenHex(u.tint, 0.6)});color:#1a1220;border:0;padding:5px 14px;cursor:${canAfford ? 'pointer' : 'not-allowed'};font-weight:bold;letter-spacing:1.5px;font-size:11px;font-family:Georgia,serif;opacity:${canAfford ? 1 : 0.4};transition:transform 0.15s ease, box-shadow 0.15s ease;">UNLOCK</button>`}
    `;
    const btn = card.querySelector('.metaBuyBtn');
    if (btn) {
      btn.addEventListener('click', () => {
        if (purchaseUnlock(id)) renderMetaShop();
      });
    }
    row.appendChild(card);
  }
}

function beginTransition(toIndex, entryFrom) {
  transition.active = true;
  transition.phase = 'out';
  transition.t = 0;
  transition.toIndex = toIndex;
  transition.entryFrom = entryFrom;
  playSfx('click', { volume: 0.7, rate: 0.85 });
}

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
function tick(now) {
  const realDt = Math.min(0.033, (now - lastT) / 1000);
  lastT = now;

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
  updateTips(realDt);
  // Death ceremony slow-mo ramp (0.25x for first 1.2s, then ramps back)
  let deathSlowmo = 1;
  if (deathCeremonyActive) {
    if (deathCeremonyTime < 1.2) deathSlowmo = 0.25;
    else deathSlowmo = 0.25 + (Math.min(1, (deathCeremonyTime - 1.2) / 0.3)) * 0.75;
  }
  const dt = realDt * getTimeScale() * deathSlowmo;

  const mw = screenToWorld(mouse.x, mouse.y);
  const leadX = (mw.x - hero.x) * 0.08;
  const leadY = (mw.y - hero.y) * 0.08;
  followCamera(hero.x + leadX, hero.y + leadY);
  updateCamera(realDt);                    // camera uses real time (no slo-mo jitter)

  const frozen = consumeHitStop(realDt);

  // Boss intro — freeze gameplay but animate everything (so camera/shake continue)
  if (bossIntroTime > 0 && !paused) {
    bossIntroTime -= realDt;
    updateParticles(realDt);
    updateDust(realDt, camera.x, camera.y);
    updateMusic(realDt);
    updateFx(realDt);
    render();
    endFrameInput();
    requestAnimationFrame(tick);
    return;
  }
  // Phase-2 boss intro — similar freeze, shorter
  if (phaseIntroTime > 0 && !paused) {
    phaseIntroTime -= realDt;
    updateParticles(realDt);
    updateDust(realDt, camera.x, camera.y);
    updateMusic(realDt);
    updateFx(realDt);
    render();
    endFrameInput();
    requestAnimationFrame(tick);
    return;
  }

  if (running && !transition.active && !frozen && !paused) {
    updateHero(dt, enemies, mw);
    updateEnemies(dt, hero);
    updateFlames(dt);
    updateProjectiles(dt);
    updateSynergies(dt);
    updateWanderer(dt);
    updateGold(dt);
    updateHudAnims(realDt);
    updateParticles(dt);
    updateDust(realDt, camera.x, camera.y);
    updateWeather(realDt, camera.x, camera.y);
    updateAmbientCreatures(realDt, camera.x, camera.y);
    updateFx(dt);
    updateHitMarkers(dt);
    updatePedestals(dt);
    updateMusic(realDt);

    gameTime += realDt;
    heroSpikeCD -= dt;
    if (roomLabelTime > 0) roomLabelTime -= realDt;
    if (floorCardTime > 0) floorCardTime -= realDt;
    if (fusionBannerTime > 0) fusionBannerTime -= realDt;
    updateChromAberr(realDt);
    // Pick up queued codex entries emitted by enemies.spawnEnemy.
    if (window.__pendingCodexEntry) {
      codexQueue.push(window.__pendingCodexEntry);
      window.__pendingCodexEntry = null;
    }
    // Codex banner lifecycle — dequeue next entry when current one finishes.
    if (codexBannerTime > 0) codexBannerTime -= realDt;
    if (codexBannerTime <= 0 && codexQueue.length) {
      codexBannerEntry = codexQueue.shift();
      codexBannerTime = 3.6;
    } else if (codexBannerTime <= 0) {
      codexBannerEntry = null;
    }
    // Claim the center banner slot while codex is visible. Tips defer to this.
    window.__centerBannerActive = (codexBannerTime > 0);
    // Dynamic tab title — reflects run state. Throttled to ~2Hz via gameTime.
    if ((gameTime | 0) !== _lastTitleUpdateSec) {
      _lastTitleUpdateSec = gameTime | 0;
      const hpStr = `${hero.hp}/${hero.maxHp}`;
      const floorStr = `F${currentFloorLevel}/${MAX_FLOORS}`;
      const warn = hero.hp / hero.maxHp <= 0.30 ? '❤ ' : '';
      document.title = `${warn}Ethera · ${floorStr} · ${hpStr} HP`;
    }

    // MUSIC INTENSITY — swell during active combat/boss, drop when cleared
    const _roomKind = floor[roomIndex]?.kind;
    const aliveCount = enemies.filter(e => !e.dead).length;
    const isCombatRoom = _roomKind === 'combat' || _roomKind === 'boss' || _roomKind === 'challenge';
    setMusicIntensity(isCombatRoom && aliveCount > 0 ? Math.min(1, aliveCount / 5) : 0);

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
        _proximityHumT -= realDt;
        if (_proximityHumT <= 0) {
          const closeness = 1 - nearestPedestalD / 140;
          synthPing(600 + closeness * 400, 0.25 + closeness * 0.3, 0.2);
          _proximityHumT = 0.75 - closeness * 0.3;
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

    // BIOME WEATHER — always-on ambient emitter, not just during combat.
    // Each biome has a distinct air texture: drips in crypt, dust swirls in
    // abyss, rising embers in inferno, candle motes in vault.
    {
      const biomeId = currentBiomePal()._biomeId || 'vault';
      const viewLeft = camera.x - canvas.width / 2 - 40;
      const viewTop = camera.y - canvas.height / 2 - 40;
      const viewW = canvas.width + 80;
      const viewH = canvas.height + 80;
      if (biomeId === 'crypt') {
        // Water drips from ceiling — 1 drop per 0.4s
        if (Math.random() < realDt * 2.5) {
          const dx = viewLeft + Math.random() * viewW;
          const dy = viewTop + Math.random() * 40;
          sparkle(dx, dy, '#a0c8e8');
        }
      } else if (biomeId === 'vault') {
        // Candle motes — gold flecks drifting lazily
        if (Math.random() < realDt * 3.5) {
          const dx = viewLeft + Math.random() * viewW;
          const dy = viewTop + Math.random() * viewH;
          sparkle(dx, dy, '#ffd68a');
        }
      } else if (biomeId === 'abyss') {
        // Purple dust swirls — denser, more frequent
        if (Math.random() < realDt * 6) {
          const dx = viewLeft + Math.random() * viewW;
          const dy = viewTop + Math.random() * viewH;
          sparkle(dx, dy, '#c870b0');
        }
      } else if (biomeId === 'inferno') {
        // Rising embers + falling ash
        if (Math.random() < realDt * 10) {
          const dx = viewLeft + Math.random() * viewW;
          const dy = viewTop + viewH - Math.random() * 60;    // from bottom, rising
          sparkle(dx, dy, '#ff8040');
        }
        if (Math.random() < realDt * 4) {
          const dx = viewLeft + Math.random() * viewW;
          const dy = viewTop + Math.random() * 60;             // from top, falling
          sparkle(dx, dy, '#6a4a40');                           // ash grey
        }
      }
    }
    // Ambient combat wisps — drift biome-tinted smoke wisps from random floor
    // positions during active combat. Increases atmospheric tension.
    const kindNow = floor[roomIndex]?.kind;
    if ((kindNow === 'combat' || kindNow === 'boss' || kindNow === 'challenge') && !room.cleared && enemies.some(e => !e.dead)) {
      const biomeId = currentBiomePal()._biomeId || 'vault';
      const wispColor = biomeId === 'crypt' ? '#a0c8e8'
                      : biomeId === 'vault' ? '#d8b890'
                      : biomeId === 'abyss' ? '#c870b0'
                      : biomeId === 'inferno' ? '#ff9860'
                      : '#c0b0a0';
      // ~4 wisps per second
      if (Math.random() < realDt * 4) {
        const wx = hero.x + (Math.random() - 0.5) * 480;
        const wy = hero.y + (Math.random() - 0.5) * 280;
        sparkle(wx, wy, wispColor);
      }
    }
    // PRE-BOSS ATMOSPHERE — when next room is boss, drift red embers from the
    // north door. Makes the approach feel heavy.
    if (roomNextKind.kind === 'boss' && room.doors.north) {
      // North door is at center-top of the room; drift embers downward from it.
      const doorX = Math.floor(ROOM_W / 2) * TILE + TILE / 2;
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
      pedestals.push({
        x: wx, y: wy,
        relic: rollRelicOffer(1, currentFloorLevel)[0] || null,
        picked: false, bob: 0, glow: 0, hpCost: 0,
      });
      if (pedestals[pedestals.length - 1].relic == null) pedestals.pop();
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
      if (dmg > 0 && hero.state !== 'dodge') {
        heroSpikeCD = 0.5;
        damageHero(dmg, hero.x, hero.y + 20);
      }
    }
    // Fire pool damage (Broodmother arena)
    if (heroSpikeCD <= 0) {
      const fdmg = firePoolDamageAt(hero.x, hero.y, gameTime);
      if (fdmg > 0 && hero.state !== 'dodge') {
        heroSpikeCD = 0.5;
        damageHero(fdmg, hero.x, hero.y + 20);
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

    // Combat room progression: enemies dead → (optional wave2) → relic offer → cleared
    if (data.kind === 'combat' && !room.cleared && enemies.length === 0) {
      // WAVE PATTERN — spawn second wave after a brief pause with warning VFX
      if (data.wave2 && !data._wave2Spawned) {
        data._wave2Spawned = true;
        // Announcement
        roomLabelText = '⚠ WAVE 2 INCOMING ⚠';
        roomLabelColor = '#ff9066';
        roomLabelTime = 2.2;
        shakeCamera(10, 0.3);
        triggerScreenFlash('rgba(255, 90, 60, 0.25)', 0.3);
        playSfx('slime_death', { rate: 0.4, volume: 0.85 });
        // Spawn after small delay with spawn burst on each
        setTimeout(() => {
          for (const s of data.wave2) {
            const sx = s.x * TILE + TILE / 2;
            const sy = s.y * TILE + TILE / 2;
            // Pre-spawn smoke + pop
            for (let k = 0; k < 10; k++) deathBurst(sx, sy, '#ff6040');
            spawnEnemy(s.type, sx, sy, { elite: s.elite, hpMul: s.hpMul, damageMul: s.damageMul });
          }
          playSfx('hero_hurt', { rate: 0.38, volume: 0.7 });
        }, 650);
      } else if (pedestals.length === 0) {
        spawnRelicOffer(currentFloorLevel);
        applyTarotPedestalMods();
        playSfx('click', { volume: 0.7, rate: 1.05 });
      } else if (!hasActivePedestals()) {
        room.cleared = true;
        data.cleared = true;
        stats.roomsCleared++;
        // Small HP regen on clear — +1 HP (not starving cursed) to soften the
        // harder difficulty. Still easy to die if you take too many hits.
        if (!isCursed('starving') && hero.hp < hero.maxHp) {
          hero.hp = Math.min(hero.maxHp, hero.hp + 1);
        }
        // Celebratory clear fanfare — label + sound + sparkle burst radiating from hero
        roomLabelText = '✦ ROOM CLEARED ✦';
        roomLabelColor = '#86e3a8';
        roomLabelTime = 1.6;
        for (let k = 0; k < 18; k++) {
          const ang = (k / 18) * Math.PI * 2;
          const r = 80 + (k % 4) * 15;
          sparkle(hero.x + Math.cos(ang) * r, hero.y + Math.sin(ang) * r * 0.7, '#86e3a8');
        }
        playSfx('click', { volume: 0.8, rate: 1.5 });
        synthFanfare(0.85);            // rising C-major triad
      }
    }

    // Challenge room — like combat but with EXTRA gold drop on clear + a relic pedestal row
    if (data.kind === 'challenge' && !room.cleared && enemies.length === 0) {
      if (pedestals.length === 0) {
        import('./gold.js').then(g => g.dropGold(hero.x, hero.y - 20, 20));
        spawnRelicOffer(currentFloorLevel);
        playSfx('click', { volume: 0.9, rate: 1.1 });
      } else if (!hasActivePedestals()) {
        room.cleared = true;
        data.cleared = true;
        stats.roomsCleared++;
      }
    }

    // Boss room: instant clear on all enemies down.
    // Floor 3+ bosses drop a guaranteed legendary pedestal as reward.
    if (data.kind === 'boss' && !room.cleared && enemies.length === 0) {
      room.cleared = true;
      data.cleared = true;
      stats.roomsCleared++;
      playSfx('click', { volume: 0.6, rate: 1.15 });
      // Spawn legendary reward pedestal for mid-run bosses (not final — final gets end-screen)
      if (currentFloorLevel >= 3 && currentFloorLevel < MAX_FLOORS) {
        // Pick a legendary the player doesn't already have, else any legendary
        const owned = new Set(equippedRelics.map(r => r.id));
        const legendaryPool = ALL_RELIC_IDS.filter(id => {
          const def = RELIC_DEFS[id];
          return def && def.tier === 'legendary' && !owned.has(id);
        });
        const legendaryId = legendaryPool.length ? legendaryPool[(Math.random() * legendaryPool.length) | 0]
                          : ALL_RELIC_IDS.find(id => RELIC_DEFS[id].tier === 'legendary');
        if (legendaryId) {
          const center = { x: Math.floor(ROOM_W / 2) * TILE + TILE / 2, y: Math.floor(ROOM_H / 2) * TILE + TILE / 2 };
          pedestals.push({
            x: center.x, y: center.y,
            relic: RELIC_DEFS[legendaryId],
            picked: false, bob: 0, glow: 0, hpCost: 0,
            tier: 'legendary',
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
    if (data.kind === 'reward' && onPedestalWorld(hero.x, hero.y) && hero.hp < hero.maxHp) {
      if (!isCursed('starving') && consumePedestal()) {
        // Partial heal: restore 3 HP for free (was: full heal).
        // Wanderer NPC still offers paid full-heal trade.
        // ASCENSION III — "The Half Rest": sanctuary healing halved.
        let baseHeal = 3;
        const am = window.__ascensionModifiers && window.__ascensionModifiers();
        if (am && am.sanctuaryHealMul) baseHeal = Math.max(1, Math.floor(baseHeal * am.sanctuaryHealMul));
        const healed = Math.min(baseHeal, hero.maxHp - hero.hp);
        hero.hp = Math.min(hero.maxHp, hero.hp + healed);
        playSfx('click', { volume: 0.8, rate: 1.4 });
      }
    }

    // Door transition check
    // SYSTEMS PASS 2c — branching. If the next room is already committed
    // (second trip through a pre-picked path, or legacy linear fallback),
    // advance normally. Otherwise open the floor map for path selection.
    const door = onDoorWorld(hero.x, hero.y);
    if (door && door.dir === 'north') {
      if (roomIndex < floor.length - 1) {
        beginTransition(roomIndex + 1, 'south');
      } else if (currentGraph && currentNodeId !== null) {
        const curNode = getFloorNode(currentGraph, currentNodeId);
        if (curNode && curNode.edges.length > 0 && !_mapPickInFlight) {
          _mapPickInFlight = true;
          openFloorMap(currentGraph, currentNodeId).then(pickedId => {
            _mapPickInFlight = false;
            if (pickedId == null) return;
            const picked = getFloorNode(currentGraph, pickedId);
            if (!picked) return;
            // ASCENSION VII — hidden-path reveal moment. If the player just
            // committed to a node that was hidden on the map, fire a banner
            // naming what they walked into. Uses the codex-entry queue so it
            // plays through the same drama pipeline as bestiary reveals.
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
              picked._hidden = false;  // reveal is one-time
            }
            // Mark state transition on the graph
            curNode.visited = true;
            curNode.current = false;
            picked.current = true;
            currentNodeId = pickedId;
            floor.push(picked.roomData);
            beginTransition(floor.length - 1, 'south');
          });
        }
      }
    }

    // Evaluate achievements periodically (on room transitions mostly, but cheap to re-evaluate)
    stats._legendaryEquipped = equippedRelics.some(r => r.tier === 'legendary');
    stats._maxCombo = Math.max(stats._maxCombo || 0, window.__maxCombo || 0);
    evaluateAchievements(stats, meta);

    // Boss room cleared → show either "Shop + Descend" (next floor) or "Run Complete"
    if (data.kind === 'boss' && room.cleared && !bossWinTriggered) {
      bossWinTriggered = true;
      running = false;
      // THE RUIN REMEMBERS — record this victory. Adds a scorch stain to the
      // boss arena that persists across runs, plus a journal entry.
      try {
        const bossDef = data.spawns?.find(s => s.boss);
        if (bossDef) recordBossKill({ bossType: bossDef.type, floor: currentFloorLevel });
      } catch (e) {}
      const isFinal = currentFloorLevel >= MAX_FLOORS;
      const title = document.getElementById('winTitle');
      const subtitle = document.getElementById('winSubtitle');
      const btn = document.getElementById('winRestartBtn');
      if (isFinal) {
        // Final victory → end-of-run summary (stats + essence + meta shop).
        // On first-ever clear, play the epilogue first; then the summary.
        stats._runComplete = true;
        if (daily.activeForRun) markDailyCompleted();        // bank today's streak
        daily.activeForRun = false;
        try { recordRunComplete(); } catch (e) {}           // bank a triumphant journal entry
        evaluateAchievements(stats, meta);
        hideShop();
        if (!hasSeenEpilogue()) {
          // Ceremonial first-clear moment before stats.
          setTimeout(() => playEpilogue(() => showEndOfRun(true)), 800);
        } else {
          setTimeout(() => showEndOfRun(true), 600);
        }
        return;
      }
      // Between-floor — also track curses clear
      if (curseCount() > 0) stats._cursedFloorClear = Math.max(stats._cursedFloorClear || 0, curseCount());
      evaluateAchievements(stats, meta);
      // Between floors — the shop screen
      title.textContent = 'FLOOR ' + currentFloorLevel + ' CLEARED';
      title.style.color = '#86e3a8';
      title.style.textShadow = '0 0 18px rgba(134,227,168,0.7)';
      subtitle.textContent = 'the depths merchant offers wares';
      btn.textContent = 'DESCEND';
      setupShop();
      setTimeout(() => { winEl.style.display = 'flex'; }, 600);
    }

    // Death handling — cinematic ceremony before the summary reveal.
    // Phase 1 (0.9s → 2.5s): slow-mo + desaturate + zoom-in. Phase 2: show summary.
    if (hero.state === 'dead' && hero.stateTime > 0.9 && !deathCeremonyActive && !deathSummaryShown) {
      deathCeremonyActive = true;
      deathCeremonyTime = 0;
      // THE RUIN REMEMBERS — record death event into persistent history.
      // Next runs will show a blood stain in this room + journal entry.
      try {
        recordDeath({
          floor: currentFloorLevel,
          roomIdx: roomIndex,
          build: equippedRelics.map(r => r.id),
          combo: window.__maxCombo || stats._maxCombo || 0,
          maxHp: hero.maxHp,
          damageDealt: stats.damageDealt | 0,
        });
      } catch (e) {}
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
        showEndOfRun(false);
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

  render();
  endFrameInput();
  requestAnimationFrame(tick);
}

function render() {
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

  // Spikes + fire pools draw on top of floor, below sprites
  drawSpikes(ctx, gameTime);
  drawUrns(ctx, 1 / 60);                // fixed small dt — break anim is visual only
  drawFirePools(ctx, gameTime);
  // Wanderer halo draws beneath hero so hero sprite still reads
  drawWandererTrail(ctx);

  // Enemy attack telegraphs + ember flame hazards render on the FLOOR, below sprites but above tiles
  drawEnemyTelegraphs(ctx);
  drawFlames(ctx);

  // Corpse stains sit on the floor beneath everything — drawn after telegraphs
  // (which render on the floor plane too) but before pedestals/wanderer/actors.
  drawCorpses(ctx);

  drawPedestals(ctx);
  drawWanderer(ctx);

  const drawList = [];
  drawList.push({ y: hero.y, draw: (c) => drawHero(c) });
  for (const e of enemies) drawList.push({ y: e.y, draw: (c) => drawEnemy(c, e) });
  drawList.sort((a, b) => a.y - b.y);
  for (const item of drawList) item.draw(ctx);

  drawProjectiles(ctx);
  drawSynergies(ctx);
  drawHeroShield(ctx);
  drawGold(ctx);
  drawSlashes(ctx);
  drawParticles(ctx);
  drawDust(ctx);
  // Biome weather — ice motes, ash, embers. Drawn on top of gameplay so the
  // atmosphere reads through, but still inside camera transform so parallax
  // tracks the world, not the screen.
  drawWeather(ctx);
  // Ambient creatures — bats, ravens, moths passing through. Silhouettes.
  drawAmbientCreatures(ctx);
  drawCounterIndicator(ctx, hero.x, hero.y);
  drawHitMarkers(ctx);
  drawDamageNumbers(ctx);
  ctx.restore();

  // BLOOM PASS — after world renders, before atmospheric dims. This is the
  // single biggest visual lift. Bright pixels (torches, hearts, enemy glow,
  // fire, sparks, gold coins, relic glows) bleed softly. Boss rooms get a
  // touch more intensity to feel hotter and more apocalyptic.
  const bloomKind = floor[roomIndex]?.kind;
  const bloomIntensity = bloomKind === 'boss' ? 0.68 : bloomKind === 'altar' ? 0.60 : 0.52;
  applyBloom(ctx, canvas, bloomIntensity);

  // BIOME COLOR GRADE — two-pass tint giving each floor a distinct mood.
  // Multiply pass tints shadows + midtones toward the biome's signature hue.
  // Screen pass pushes highlights further into that color. Boss rooms dial
  // the grade down so tension stays neutral — the boss is the color story.
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

  // Per-room color wash — subtle tonal cue for room kind, on top of biome wash
  const kind = floor[roomIndex]?.kind;
  const pal = currentBiomePal();
  // Biome ambient wash (always applied so each floor reads differently)
  if (pal.washColor) {
    ctx.fillStyle = pal.washColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  let wash = null;
  if (kind === 'combat')         wash = 'rgba(80, 20, 28, 0.08)';
  else if (kind === 'reward')    wash = 'rgba(40, 120, 90, 0.10)';
  else if (kind === 'boss')      wash = 'rgba(140, 18, 24, 0.18)';
  else if (kind === 'altar')     wash = 'rgba(150, 20, 40, 0.12)';
  else if (kind === 'challenge') wash = 'rgba(150, 90, 20, 0.08)';
  if (wash) {
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Hero-centered atmospheric lighting — soft, not a spotlight.
  const hsx = hero.x - camera.x + canvas.width / 2 + camera.offsetX;
  const hsy = hero.y - camera.y + canvas.height / 2 + camera.offsetY;

  // Darkness layer — edges are dim, center is ALMOST full-bright. Gradient is
  // wide and gentle so hero doesn't look spotlit.
  const darkAmount = kind === 'boss' ? 0.70 : 0.45;
  const darkInner = kind === 'boss' ? 260 : 340;
  const darkOuter = kind === 'boss' ? 620 : 760;
  const dark = ctx.createRadialGradient(hsx, hsy, darkInner, hsx, hsy, darkOuter);
  dark.addColorStop(0, 'rgba(6, 4, 10, 0)');
  dark.addColorStop(0.7, 'rgba(6, 4, 10, ' + (darkAmount * 0.4).toFixed(2) + ')');
  dark.addColorStop(1, 'rgba(6, 4, 10, ' + darkAmount.toFixed(2) + ')');
  ctx.fillStyle = dark;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // SCREEN-SPACE VIGNETTE — always-on dim corners, biome-tinted.
  // This stays tied to the screen frame (not hero position) so rooms feel
  // enclosed even when hero walks near an edge. Biome-specific color deepens
  // the tonal identity of each floor.
  // Pre-boss rooms swap to a red-dark vignette for ominous approach.
  const preBoss = roomNextKind.kind === 'boss' && kind !== 'boss';
  const vigBase = preBoss ? 'rgba(30, 4, 6, ' : (pal.vignetteBase || 'rgba(4, 4, 8, ');
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

  // Very subtle warm tint — just warms the center a touch, no halo-looking light
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const warm = ctx.createRadialGradient(hsx, hsy, 40, hsx, hsy, 320);
  warm.addColorStop(0, 'rgba(255, 170, 100, 0.11)');
  warm.addColorStop(0.5, 'rgba(255, 150, 80, 0.04)');
  warm.addColorStop(1, 'rgba(255, 140, 80, 0)');
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Wall torch halos — flickering light at each sconce, biome-tinted.
  const now = performance.now() / 1000;
  const flameBase = pal.torchFlame || 'rgba(255, 180, 100, ';
  for (const t of roomTorches) {
    const tsx = t.x - camera.x + canvas.width / 2 + camera.offsetX;
    const tsy = t.y - camera.y + canvas.height / 2 + camera.offsetY;
    const phase = (now * 3 + (t.seed & 0xff) * 0.1);
    const flick = 0.82 + 0.18 * (Math.sin(phase * 7.3) * 0.5 + Math.sin(phase * 11.1) * 0.4 + Math.sin(phase * 17.5) * 0.3) / 1.2;
    const radius = 180 + flick * 20;
    const g = ctx.createRadialGradient(tsx, tsy, 4, tsx, tsy, radius);
    g.addColorStop(0, flameBase + (0.55 * flick).toFixed(3) + ')');
    g.addColorStop(0.3, flameBase + (0.22 * flick).toFixed(3) + ')');
    g.addColorStop(1, flameBase + '0)');
    ctx.fillStyle = g;
    ctx.fillRect(tsx - radius, tsy - radius, radius * 2, radius * 2);

    // GOD RAY — volumetric light cone streaming down from the torch.
    // Approximated by a vertical trapezoid with a top-biased gradient and
    // flicker-modulated alpha. Makes the dust-filled air feel luminous.
    const rayLen = 260 + flick * 30;
    const rayTopW = 22;
    const rayBotW = 140;
    const rayAlpha = 0.18 + flick * 0.08;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const rayGrad = ctx.createLinearGradient(tsx, tsy, tsx, tsy + rayLen);
    rayGrad.addColorStop(0, flameBase + rayAlpha.toFixed(3) + ')');
    rayGrad.addColorStop(0.5, flameBase + (rayAlpha * 0.35).toFixed(3) + ')');
    rayGrad.addColorStop(1, flameBase + '0)');
    ctx.fillStyle = rayGrad;
    ctx.beginPath();
    ctx.moveTo(tsx - rayTopW / 2, tsy);
    ctx.lineTo(tsx + rayTopW / 2, tsy);
    ctx.lineTo(tsx + rayBotW / 2, tsy + rayLen);
    ctx.lineTo(tsx - rayBotW / 2, tsy + rayLen);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
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
    } else if (hero.state === 'dodge') {
      // Reticle fades during dodge — player focus is elsewhere
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

  // HUD (below transition veil)
  drawHud(ctx, canvas.width, canvas.height, {
    roomIndex, totalRooms: floor.length,
    roomKind: floor[roomIndex]?.kind,
    relics: equippedRelics,
    floorLevel: currentFloorLevel,
    maxFloors: MAX_FLOORS,
    gold: gold.total,
    floorRooms: floor,              // pass full floor so HUD can render a minimap
  });
  drawPedestalTooltip(ctx, canvas.width, canvas.height, { gold: gold.total, floorLevel: currentFloorLevel });
  drawWandererTooltip(ctx, canvas.width, canvas.height);
  drawPickupFlash(ctx, canvas.width, canvas.height);
  drawComboOverlay(ctx, canvas.width, canvas.height);
  drawScreenFlash(ctx, canvas.width, canvas.height);
  drawPerfectDodgeOverlay(ctx, canvas.width, canvas.height);
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
  drawTip(ctx, canvas.width);

  // Achievement unlock popups — top-right toasts, positioned BELOW the floor
  // panel so they don't overlap it. Shared visual grammar with tip/codex:
  // tome gradient, inset stroke, corner diamonds, gold-on-dark.
  if (pendingPopups.length > 0) {
    for (let i = 0; i < pendingPopups.length; i++) {
      const p = pendingPopups[i];
      p.t += 1 / 60;
      const life = p.life;
      const r = p.t / life;
      if (!p._stung) { p._stung = true; playSfx('click', { rate: 0.4, volume: 0.9 }); synthChord(523, 1.0, 0.7); }
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
      // Floor panel occupies y=14..104 (90 high); anchor toasts at y=120
      // with a small vertical gap. Multiple stack downward.
      const by = 120 + yOff;
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
      ctx.font = '22px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#c9a86a';
      ctx.shadowBlur = 8;
      ctx.fillText('\u2605', bx + 22, by + bh / 2);
      ctx.shadowBlur = 0;
      // "ACHIEVEMENT UNLOCKED" label — italic serif, unified typography
      ctx.fillStyle = '#c9a86a';
      ctx.font = 'italic bold 9px Georgia, serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('\u2014 ACHIEVEMENT UNLOCKED \u2014', bx + 44, by + 10);
      // Name + desc — Georgia serif, gold hierarchy
      const ach = ACHIEVEMENTS[p.id];
      ctx.fillStyle = '#f4d9a0';
      ctx.font = 'bold 15px Georgia, serif';
      ctx.fillText(ach.name, bx + 44, by + 24);
      ctx.fillStyle = 'rgba(200, 190, 170, 0.8)';
      ctx.font = 'italic 10px Georgia, serif';
      ctx.fillText(ach.desc, bx + 44, by + 45);
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

  // Boss intro overlay — cinematic letterbox + slow-mo + name flourish
  if (bossIntroTime > 0 && bossIntroBoss) {
    const total = 2.2;
    const t = 1 - (bossIntroTime / total);           // 0 → 1
    const w = canvas.width, h = canvas.height;
    // LETTERBOX bars — slide in from top + bottom, stay until intro near-end, slide back out
    // They peak at ~11% screen height each to keep central action visible.
    const barPeak = h * 0.12;
    let barH;
    if (t < 0.22) barH = (t / 0.22) * barPeak;       // slide-in
    else if (t > 0.82) barH = (1 - (t - 0.82) / 0.18) * barPeak; // slide-out
    else barH = barPeak;
    barH = Math.max(0, barH);
    ctx.fillStyle = 'rgba(2, 0, 4, 0.98)';
    ctx.fillRect(0, 0, w, barH);
    ctx.fillRect(0, h - barH, w, barH);
    // Accent strips on the bar edges
    ctx.fillStyle = 'rgba(180, 30, 50, 0.55)';
    if (barH > 2) {
      ctx.fillRect(0, barH - 1, w, 1);
      ctx.fillRect(0, h - barH, w, 1);
    }
    // Dark veil — lighter than original since letterbox handles framing
    const veilA = t < 0.20 ? (t / 0.20) * 0.35 : t > 0.82 ? (1 - (t - 0.82) / 0.18) * 0.35 : 0.35;
    ctx.fillStyle = 'rgba(6, 4, 10, ' + veilA.toFixed(3) + ')';
    ctx.fillRect(0, barH, w, h - barH * 2);

    // Name slide-in from the right with red tag bars
    const slideIn = Math.min(1, t / 0.25);
    const slideOut = t > 0.75 ? (t - 0.75) / 0.25 : 0;
    const xOff = (1 - slideIn) * w * 0.35 - slideOut * w * 0.35;
    const name = bossIntroBoss.def.displayName || 'BOSS';
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, slideIn - slideOut));
    // Dramatic large text with gradient
    const nx = w / 2 + xOff;
    const ny = h / 2;
    ctx.font = 'bold 68px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(name).width;
    // Red accent bars above + below name
    ctx.fillStyle = 'rgba(220, 50, 60, 0.75)';
    ctx.fillRect(nx - tw / 2 - 50, ny - 14, tw + 100, 3);
    ctx.fillRect(nx - tw / 2 - 50, ny + 28, tw + 100, 3);
    // Ornate end caps on the bars
    ctx.fillStyle = 'rgba(255, 100, 90, 0.9)';
    ctx.fillRect(nx - tw / 2 - 54, ny - 16, 5, 7);
    ctx.fillRect(nx + tw / 2 + 49, ny - 16, 5, 7);
    ctx.fillRect(nx - tw / 2 - 54, ny + 30, 5, 7);
    ctx.fillRect(nx + tw / 2 + 49, ny + 30, 5, 7);
    // Name text — deep shadow + glow
    ctx.shadowColor = 'rgba(220, 40, 50, 0.7)';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#ffe0d0';
    ctx.fillText(name, nx, ny + 8);
    ctx.shadowBlur = 0;
    // Subtitle with threat descriptor
    const sub = bossIntroBoss._enraged
      ? '— AWAKENED —'
      : (bossIntroBoss.def.flavor ? '— ' + bossIntroBoss.def.flavor + ' —' : '— THE BOSS —');
    ctx.font = 'italic bold 14px Georgia, serif';
    ctx.fillStyle = '#ff8a75';
    ctx.letterSpacing = '4px';
    ctx.fillText(sub, nx, ny + 52);
    ctx.restore();
  }

  // FUSION FORMED banner — dramatic center-screen reveal when two relics combine
  if (fusionBannerTime > 0 && fusionBannerFusion) {
    const total = 3.0;
    const r = 1 - (fusionBannerTime / total);   // 0 → 1
    let a;
    if (r < 0.1) a = r / 0.1;
    else if (r > 0.8) a = (1 - r) / 0.2;
    else a = 1;
    a = Math.max(0, Math.min(1, a));
    const scaleBump = r < 0.2 ? 1 + Math.sin((r / 0.2) * Math.PI) * 0.12 : 1;
    const F = fusionBannerFusion;
    const isFirst = F._firstDiscovery;
    const w = canvas.width, h = canvas.height;
    // First-time discovery gets a taller banner to fit the flavor line;
    // repeat activations are briefer. Extra height to accommodate the
    // floating fusion icon at the top.
    const boxW = 560, boxH = isFirst && F.flavor ? 210 : 170;
    const bx = (w - boxW) / 2;
    const by = (h - boxH) / 2 - 40;
    const pivotX = bx + boxW / 2, pivotY = by + boxH / 2;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(pivotX, pivotY);
    ctx.scale(scaleBump, scaleBump);
    ctx.translate(-pivotX, -pivotY);
    // Radial halo
    const pulseT = performance.now() / 240;
    const pulse = 0.6 + 0.4 * Math.sin(pulseT);
    const halo = ctx.createRadialGradient(pivotX, pivotY, 40, pivotX, pivotY, boxW * 0.85);
    const tint = F.tint || '#a0e8ff';
    const hex = tint.replace('#', '');
    const nH = parseInt(hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex, 16);
    const tr = (nH >> 16) & 255, tg = (nH >> 8) & 255, tb = nH & 255;
    halo.addColorStop(0, `rgba(${tr},${tg},${tb},${(0.5 * pulse * a).toFixed(3)})`);
    halo.addColorStop(1, `rgba(${tr},${tg},${tb},0)`);
    ctx.fillStyle = halo;
    ctx.fillRect(bx - 120, by - 80, boxW + 240, boxH + 160);
    // Frame
    const frameG = ctx.createLinearGradient(bx, by, bx, by + boxH);
    frameG.addColorStop(0, 'rgba(20, 30, 40, 0.96)');
    frameG.addColorStop(1, 'rgba(8, 12, 18, 0.96)');
    ctx.fillStyle = frameG;
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.strokeStyle = tint;
    ctx.lineWidth = 3;
    ctx.strokeRect(bx + 0.5, by + 0.5, boxW - 1, boxH - 1);
    ctx.strokeStyle = 'rgba(201, 168, 106, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 5.5, by + 5.5, boxW - 11, boxH - 11);
    // FLOATING FUSION ICON — hand-drawn fusion art as a seal on the top
    // of the banner. Pulses with tint halo. Huge visual upgrade from text-only.
    const fusionImg = imageCache[F.icon];
    if (fusionImg) {
      const iconSize = 72;
      const iconX = pivotX - iconSize / 2;
      const iconY = by - iconSize / 2 + 4;
      // Pulsing halo behind icon
      const hr = parseInt(tint.slice(1, 3), 16);
      const hg = parseInt(tint.slice(3, 5), 16);
      const hb = parseInt(tint.slice(5, 7), 16);
      const seal = ctx.createRadialGradient(pivotX, iconY + iconSize / 2, 8, pivotX, iconY + iconSize / 2, iconSize * 1.4);
      seal.addColorStop(0, `rgba(${hr}, ${hg}, ${hb}, ${(0.6 * pulse).toFixed(3)})`);
      seal.addColorStop(1, `rgba(${hr}, ${hg}, ${hb}, 0)`);
      ctx.fillStyle = seal;
      ctx.fillRect(iconX - iconSize, iconY - iconSize, iconSize * 3, iconSize * 3);
      // Icon itself
      ctx.drawImage(fusionImg, iconX, iconY, iconSize, iconSize);
      // Tint-colored ring around icon
      ctx.strokeStyle = tint;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pivotX, iconY + iconSize / 2, iconSize / 2 + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Header — NEW FUSION or FUSION
    ctx.fillStyle = tint;
    ctx.font = 'italic bold 10px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(isFirst ? '\u2014 NEW FUSION DISCOVERED \u2014' : '\u2014 FUSION ACTIVATED \u2014', pivotX, by + 52);
    // Big fusion name with shadowed glow
    ctx.shadowColor = tint;
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#fff8e8';
    ctx.font = 'bold 34px Georgia, serif';
    ctx.fillText(F.name, pivotX, by + 72);
    ctx.shadowBlur = 0;
    // Components line
    ctx.fillStyle = 'rgba(180, 200, 220, 0.8)';
    ctx.font = 'italic 12px Georgia, serif';
    const compText = F.components
      .map(id => RELIC_DEFS[id]?.name || id)
      .join(' + ');
    ctx.fillText(compText, pivotX, by + 116);
    // Flavor line (first-discovery only) — lore that elevates the moment
    let descY = by + 150;
    if (isFirst && F.flavor) {
      ctx.fillStyle = 'rgba(220, 210, 230, 0.75)';
      ctx.font = 'italic 13px Georgia, serif';
      ctx.fillText('\u201C' + F.flavor + '\u201D', pivotX, by + 138);
      descY = by + 180;
    }
    // Separator
    ctx.strokeStyle = tint;
    ctx.globalAlpha = a * 0.6;
    ctx.beginPath();
    ctx.moveTo(bx + 70, descY - 18); ctx.lineTo(bx + boxW - 70, descY - 18);
    ctx.stroke();
    ctx.globalAlpha = a;
    // Description (mechanic) — tinted, bolder
    ctx.fillStyle = tint;
    ctx.font = 'bold 13px Georgia, serif';
    ctx.fillText(F.desc, pivotX, descY);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  // ENEMY CODEX banner — small bestiary card at top-center when a new enemy
  // type is first encountered. Slides in from above, holds ~2s, slides out.
  // Placed in the top 20% of the screen so it doesn't block combat.
  if (codexBannerTime > 0 && codexBannerEntry) {
    const total = 3.6;
    const r = 1 - (codexBannerTime / total);   // 0 → 1
    // Alpha: fade in first 0.1, hold, fade out last 0.2
    let a;
    if (r < 0.1) a = r / 0.1;
    else if (r > 0.80) a = (1 - r) / 0.20;
    else a = 1;
    a = Math.max(0, Math.min(1, a));
    // Slide from above in first 0.18, settle
    const slide = r < 0.18 ? (1 - r / 0.18) * -30 : 0;
    const w = canvas.width;
    const boxW = 420, boxH = 64;
    const bx = (w - boxW) / 2;
    const by = 40 + slide;
    const E = codexBannerEntry;
    const tint = E.color || '#c0b090';
    ctx.save();
    ctx.globalAlpha = a;
    // Soft outer glow — parchment feel
    const glow = ctx.createRadialGradient(bx + boxW / 2, by + boxH / 2, boxW * 0.2,
                                           bx + boxW / 2, by + boxH / 2, boxW * 0.75);
    glow.addColorStop(0, 'rgba(201, 168, 106, 0.14)');
    glow.addColorStop(1, 'rgba(201, 168, 106, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(bx - 40, by - 24, boxW + 80, boxH + 48);
    // Tome-style vertical gradient body
    const bg = ctx.createLinearGradient(0, by, 0, by + boxH);
    bg.addColorStop(0, 'rgba(28, 18, 26, 0.93)');
    bg.addColorStop(1, 'rgba(14, 8, 16, 0.93)');
    ctx.fillStyle = bg;
    ctx.fillRect(bx, by, boxW, boxH);
    // Tint-colored border + gold inner stripe
    ctx.strokeStyle = tint;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx + 0.5, by + 0.5, boxW - 1, boxH - 1);
    ctx.strokeStyle = 'rgba(201, 168, 106, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 4.5, by + 4.5, boxW - 9, boxH - 9);
    // Corner accent diamonds
    ctx.fillStyle = tint;
    const accents = [[bx + 5, by + 5], [bx + boxW - 5, by + 5], [bx + 5, by + boxH - 5], [bx + boxW - 5, by + boxH - 5]];
    for (const [cx, cy] of accents) {
      ctx.fillRect(cx - 1, cy, 2, 1);
      ctx.fillRect(cx, cy - 1, 1, 2);
    }
    // Header — A NEW ADVERSARY
    ctx.fillStyle = '#c9a86a';
    ctx.font = 'italic bold 9px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('\u2014 A NEW ADVERSARY \u2014', bx + boxW / 2, by + 8);
    // Enemy name — tint-colored, bold
    ctx.fillStyle = tint;
    ctx.font = 'bold 18px Georgia, serif';
    ctx.shadowColor = tint;
    ctx.shadowBlur = 8;
    ctx.fillText(E.name, bx + boxW / 2, by + 22);
    ctx.shadowBlur = 0;
    // Flavor — italic, faded
    ctx.fillStyle = 'rgba(220, 210, 230, 0.78)';
    ctx.font = 'italic 11px Georgia, serif';
    ctx.fillText('\u201C' + E.flavor + '\u201D', bx + boxW / 2, by + 46);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  // PHASE 2 boss banner — mid-fight cinematic when boss enrages
  if (phaseIntroTime > 0 && phaseIntroBoss) {
    const total = 1.6;
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
    // Big text — PHASE 2 + AWAKENED subtitle
    const slideIn = Math.min(1, t / 0.22);
    const slideOut = t > 0.78 ? (t - 0.78) / 0.22 : 0;
    const a = Math.max(0, Math.min(1, slideIn - slideOut));
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
  }

  // Floor intro card — big splash when a new floor begins. Takes priority
  // over room-entry labels for ~3s.
  if (floorCardTime > 0 && floorCardName) {
    const total = 3.2;
    const t = 1 - (floorCardTime / total);     // 0 → 1
    // Alpha curve: ease in quickly, hold, ease out
    let a;
    if (t < 0.15) a = t / 0.15;
    else if (t > 0.82) a = (1 - t) / 0.18;
    else a = 1;
    a = Math.max(0, Math.min(1, a));
    ctx.save();
    // Full-screen dark veil
    ctx.fillStyle = 'rgba(8, 5, 12, ' + (a * 0.82).toFixed(3) + ')';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Biome-tinted swirl of particles behind the card text — 40 orbiting motes
    const biomeId = currentBiomePal()._biomeId || 'vault';
    const swirlCol = biomeId === 'crypt' ? [170, 220, 255]
                   : biomeId === 'vault' ? [255, 220, 180]
                   : biomeId === 'abyss' ? [200, 120, 240]
                   : biomeId === 'inferno' ? [255, 140, 70]
                   : [220, 200, 180];
    const swirlCx = canvas.width / 2;
    const swirlCy = canvas.height / 2;
    const swirlT = performance.now() / 1000;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 40; i++) {
      // Each particle orbits with a unique angular velocity and radius
      const seed = i * 0.7;
      const baseAng = seed + swirlT * (0.45 + (i % 3) * 0.15);
      const r = 140 + (i % 5) * 40 + Math.sin(swirlT * 1.3 + seed) * 20;
      const px = swirlCx + Math.cos(baseAng) * r;
      const py = swirlCy + Math.sin(baseAng) * r * 0.55;   // ellipse for depth
      const pulse = 0.5 + 0.5 * Math.sin(swirlT * 2.4 + seed * 2.1);
      const pa = a * pulse * 0.45;
      ctx.fillStyle = `rgba(${swirlCol[0]},${swirlCol[1]},${swirlCol[2]},${pa.toFixed(3)})`;
      const sz = 2 + (i % 3);
      ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
    }
    // A faint halo ring behind the text as a second layer
    const haloR = 200 + Math.sin(swirlT * 0.8) * 20;
    const halo = ctx.createRadialGradient(swirlCx, swirlCy, 30, swirlCx, swirlCy, haloR);
    halo.addColorStop(0, `rgba(${swirlCol[0]},${swirlCol[1]},${swirlCol[2]},${(a * 0.08).toFixed(3)})`);
    halo.addColorStop(1, `rgba(${swirlCol[0]},${swirlCol[1]},${swirlCol[2]},0)`);
    ctx.fillStyle = halo;
    ctx.fillRect(swirlCx - haloR, swirlCy - haloR, haloR * 2, haloR * 2);
    ctx.restore();
    ctx.globalAlpha = a;
    // Top ornament
    ctx.strokeStyle = 'rgba(201, 168, 106, 0.85)';
    ctx.lineWidth = 1.2;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    ctx.beginPath();
    ctx.moveTo(cx - 220, cy - 96); ctx.lineTo(cx - 40, cy - 96);
    ctx.moveTo(cx + 40, cy - 96);  ctx.lineTo(cx + 220, cy - 96);
    ctx.stroke();
    // Roman numeral
    ctx.fillStyle = '#c9a86a';
    ctx.font = 'italic 22px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FLOOR ' + floorCardRoman, cx, cy - 96);
    // Big name with soft glow
    ctx.shadowColor = 'rgba(245, 210, 140, 0.55)';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#f4d9a0';
    ctx.font = '52px Georgia, serif';
    ctx.fillText(floorCardName, cx, cy - 24);
    ctx.shadowBlur = 0;
    // Bottom flavor
    ctx.fillStyle = 'rgba(218, 184, 110, 0.75)';
    ctx.font = 'italic 16px Georgia, serif';
    ctx.fillText('— ' + floorCardFlavor + ' —', cx, cy + 36);
    // Bottom ornament
    ctx.strokeStyle = 'rgba(201, 168, 106, 0.85)';
    ctx.beginPath();
    ctx.moveTo(cx - 220, cy + 76); ctx.lineTo(cx - 40, cy + 76);
    ctx.moveTo(cx + 40, cy + 76);  ctx.lineTo(cx + 220, cy + 76);
    ctx.stroke();
    ctx.restore();
  }

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
  loadDaily();
  loadTips();
  loadDiscoveredFusions();
  loadRuin();
  loadCodex();
  loadSeenRelics();
  loadSeenTarot();
  loadMemories();          // Memory Weave: unlocked set + last selection
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

// Debug hook — inspect game state from the console
window.__dbg = () => ({ hero, enemies, camera, running, roomIndex, floor, room, transition });
// Debug: start a fresh run bypassing the menu (useful for dev + headless tests)
window.__startRun = () => { hideAllOverlays(); startRun(); };

// Debug: directly step the transition state machine (useful when rAF is paused).
// Calling this will synchronously advance the transition through fade-out,
// loadRoom, fade-in, and return the new state.
window.__forceGoto = (targetIdx) => {
  beginTransition(targetIdx, 'south');
  // Fast-forward through both fade phases
  updateTransition(0.4);  // finish fade-out, loads room
  updateTransition(0.4);  // finish fade-in
  return { roomIndex, kind: floor[roomIndex]?.kind, enemies: enemies.length, heroPos: [hero.x|0, hero.y|0] };
};

boot();
