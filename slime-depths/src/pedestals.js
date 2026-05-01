// Relic pedestals — physical pickup points that spawn after combat clears.
// Walking onto one grants the relic + removes the rest.
import { images } from './loader.js';
import { applyRelic, rollRelicOffer, relicTier, RELIC_DEFS, equipped as equippedRelics } from './relics.js';
import { THEMES, RELIC_THEMES, getThemeCounts, getThemeTier } from './themes.js';
import { SLOTS, getSlotCounts, getSlotTier } from './slots.js';
import { pushNotification } from './notifications.js';
import { wrapText } from './textLayout.js';
import { activeFusions, FUSIONS } from './fusions.js';
// NOTE: relicTier imported above is what makes altar pedestals respect rarity
// tiers — without tier on the pedestal, mythic drops at altars render as common.
import { drawRelicIcon } from './fx.js';
import { playSfx } from './sfx.js';
import { deathBurst, sparkle } from './particles.js';
import { shakeCamera, worldToScreen } from './camera.js';
import { hero } from './hero.js';
import { TILE, room } from './room.js';
import { gold } from './gold.js';
import { synthChord, synthPing, synthThud, synthFanfare } from './synth.js';
import { isCursed } from './curses.js';
import { hasCard } from './tarot.js';
import { getFusionCompletingRelicIds } from './fusions.js';
import { isFirstTime } from './firstSeen.js';

// THE MAGICIAN tarot — if the offer doesn't already contain a fusion-completing
// relic, swap one slot with a completer (50% chance). This roughly doubles the
// odds of an offer including a fusion-completer vs a standard rollRelicOffer.
//
// Round-7 Phase-2 — `force=true` skips the 50% gate AND the tarot-card check,
// guaranteeing a fusion-completer in the offer when set. Used by combat rooms
// flagged with roomReward='fusion' so the door's "FUSION" promise actually
// pays out. Falls back to a no-op if the player has no fusion-completing
// relics in candidate territory.
function applyMagicianBias(offers, opts = {}) {
  const force = !!opts.force;
  if (!force && !hasCard('the_magician')) return offers;
  const offerIds = new Set(offers.map(o => o.id));
  const completers = getFusionCompletingRelicIds(equippedRelics.map(r => r.id));
  // Strip ids the hero already owns or that are already in the offer
  const ownedIds = new Set(equippedRelics.map(r => r.id));
  const candidates = [...completers].filter(id => !offerIds.has(id) && !ownedIds.has(id) && RELIC_DEFS[id]);
  if (candidates.length === 0) return offers;
  const anyInOffer = offers.some(o => completers.has(o.id));
  if (anyInOffer) return offers;                         // already has one, nothing to do
  if (!force && Math.random() > 0.5) return offers;       // 50% bias — doubles vs baseline (skipped on force)
  const pickId = candidates[(Math.random() * candidates.length) | 0];
  const swapIdx = (Math.random() * offers.length) | 0;
  offers[swapIdx] = RELIC_DEFS[pickId];
  return offers;
}

export const pedestals = [];
let lastPickedDef = null;      // for flash-text UI feedback
let pickedFlashTime = 0;
// Tracks whether the most recent pickup was the player's first-ever mythic.
// Captured at pickup time (not at draw time) so the full-screen vignette
// theatre gates correctly across the entire 5.5s banner lifetime — a
// per-frame isFirstTime check would fire markSeen on the first frame and
// then read false for every subsequent frame, killing the vignette mid-banner.
let lastPickedFirstMythic = false;
// Most-meaningful structural event from the most recent pickup. Captured
// by computeRelicEvent() at pickup time and rendered as a chip above the
// relic name in drawPickupFlash. Reads as the "WHY this pickup matters"
// signal — fusion forged, theme advanced to Resonance/Ascendance.
//
// Shape: { label: 'STORM ASCENDANCE', tint: '#80c8ff' } | null
//
// Priority order (only ONE event per pickup, picks highest):
//   1. FUSION FORGED (mechanical breakthrough — biggest effect)
//   2. THEME ASCENDANCE (3→5 stack on a theme — big mid/late game)
//   3. THEME RESONANCE (0→3 stack — meaningful early game)
//   4. (none — relic just adds stats; no event chip)
let lastPickedEvent = null;

// Word-wrap helper — splits `text` into lines that fit within `maxWidth` when
// wrapText moved to src/textLayout.js — see import at top.

// Is a tile passable (floor) AND has at least one passable neighbor for approach?
function tileIsClear(tx, ty) {
  if (!room.tiles || !room.tiles[ty]) return false;
  const t = room.tiles[ty][tx];
  return t === 'floor';
}

// Find nearest clear tile to a preferred (px, py), spiralling out.
function findClearTile(px, py, maxR = 4) {
  if (tileIsClear(px, py)) return { x: px, y: py };
  for (let r = 1; r <= maxR; r++) {
    // Check cells in a diamond pattern at distance r
    for (let dx = -r; dx <= r; dx++) {
      const dy = r - Math.abs(dx);
      for (const sign of [1, -1]) {
        const ny = py + dy * sign;
        const nx = px + dx;
        if (nx < 2 || nx >= room.w - 2 || ny < 2 || ny >= room.h - 2) continue;
        if (tileIsClear(nx, ny)) return { x: nx, y: ny };
      }
    }
  }
  // Fallback: row 4 scanning left-to-right
  for (let x = 2; x < room.w - 2; x++) {
    if (tileIsClear(x, py)) return { x, y: py };
  }
  // Last resort
  return { x: px, y: py };
}

// Spawn 3 relic pedestals laid out across the north side of the room.
// Pedestals shift to nearby clear tiles if pillars block the preferred cells.
// opts.minTier promotes the offer pool to rare+ / legendary+ etc. — used by
// elite (perilous-path) rooms to guarantee meaningful rewards for extra risk.
export function spawnRelicOffer(floorLevel = 1, opts = {}) {
  pedestals.length = 0;
  // Forced fusion bias for room-reward 'fusion' rooms (Round-7) is
  // routed through the same applyMagicianBias helper with a force flag
  // so the bias pipeline stays single-source-of-truth.
  const offers = applyMagicianBias(rollRelicOffer(3, floorLevel, opts), { force: !!opts.fusionBias });
  if (offers.length === 0) return;
  const cols = [6, 10, 14];
  // Pedestal row pushed from 4 to 5 — one tile south of the dense
  // enemy-spawn band (`spawnCells` in floor.js scatters enemies across
  // y=3..h-4, with the largest density around y=3-5). Keeping pedestals
  // at row 4 caused them to share floor with corpses + sparkle + tier-
  // ring particles; row 5 puts the reward pickup in cleaner space while
  // still being the player's first visual on entering the cleared room.
  const row = 5;
  const placed = [];
  for (let i = 0; i < offers.length; i++) {
    const spot = findClearTile(cols[i], row);
    // Avoid stacking onto an existing pedestal cell
    if (placed.some(p => p.x === spot.x && p.y === spot.y)) {
      // Try one more shift outward
      const alt = findClearTile(cols[i] + (i === 0 ? -1 : 1), row);
      spot.x = alt.x; spot.y = alt.y;
    }
    placed.push(spot);
    pedestals.push({
      x: spot.x * TILE + TILE/2,
      y: spot.y * TILE + TILE/2,
      relic: offers[i],
      tier: relicTier(offers[i].id),
      picked: false,
      bob: Math.random() * Math.PI * 2,
      glow: 0,
      hpCost: 0,
    });
  }
}

// Spawn 2 altar pedestals flanking the obelisk — each costs HP instead of free.
// HP cost SCALES WITH TIER so altars become real choices: a common altar
// is a small bite, a legendary altar is a real gamble. Previously a flat 3
// regardless of what was on offer, which made high-tier altars feel like
// theft and common altars feel like nothing.
//   common    → 2 HP
//   rare      → 4 HP
//   legendary → 7 HP
//   mythic    → 9 HP (rare; mythic at altars is a near-miracle moment)
// Curse: Starving — altar HP cost ×2 across the board.
//
// Round-6 economy retune — clamp the post-curse cost to floor(maxHp × 0.65)
// so legendary altars on F2-3 stay actionable. Without this clamp, a F2
// hero at maxHp=4 facing a 7-HP legendary altar trips the "won't suicide"
// guard in main.js and silently skips the offer; with Starving the cost
// doubles to 14 HP and even a maxHp=8 hero can't engage. The clamp keeps
// at least 2 HP of cost so commons don't go free, and bottoms out at 65%
// of maxHp so the player still feels the bite without bricking the run.
const ALTAR_TIER_COST = { common: 2, rare: 4, legendary: 7, mythic: 9 };
function altarCostFor(tier) {
  const base = ALTAR_TIER_COST[tier] || ALTAR_TIER_COST.common;
  const cursed = isCursed('starving') ? base * 2 : base;
  // Clamp by current maxHp so legendary altars stay reachable for thin
  // builds. The cap floors at 2 (common-equivalent) so a 3-HP hero on
  // floor 1 still feels the cost. 65% chosen empirically: 2-HP floor
  // for maxHp=3, 3-HP floor for maxHp=5, 5-HP floor for maxHp=8 — keeps
  // the relative bite consistent across HP tiers.
  const maxByHp = Math.max(2, Math.floor((hero?.maxHp || 3) * 0.65));
  return Math.min(cursed, maxByHp);
}
export function spawnAltarOffer(_legacyHpCost, floorLevel = 1, opts = {}) {
  pedestals.length = 0;
  // Pass floorLevel through to the tier-weighted roll. Without this, the
  // default floorLevel=1 in rollRelicOffer means altars on every floor
  // offered 100% commons — a 2-HP altar offered the same pool as a
  // floor-1 reward room, making higher floors' altars feel like theft
  // (HP cost scales by tier, but the offered tier never moved past
  // common). Floor passes through from main.js.
  //
  // Round-7 — opts.minTier forces a tier floor on the offer roll. Used
  // by altar nodes flagged with roomReward='legendary' so the door's
  // "LEGENDARY" promise matches the offered relics.
  const rollOpts = opts.minTier ? { minTier: opts.minTier } : {};
  const offers = rollRelicOffer(2, floorLevel, rollOpts);
  if (offers.length === 0) return;
  const cols = [7, 12];
  const row = 7;
  for (let i = 0; i < offers.length; i++) {
    const spot = findClearTile(cols[i], row);
    const tier = relicTier(offers[i].id);
    pedestals.push({
      x: spot.x * TILE + TILE/2,
      y: spot.y * TILE + TILE/2,
      relic: offers[i],
      tier,
      picked: false,
      bob: Math.random() * Math.PI * 2,
      glow: 0,
      hpCost: altarCostFor(tier),
    });
  }
}

// Round-7 Phase 4-lite — CHARON-style in-floor SHOP. Spawn 3 pedestals
// each priced in GOLD (not HP, not free). Reuses the same pedestal data
// shape as spawnRelicOffer but flips two key behaviors:
//
//   1. p.shop = true   — consumePendingPickup skips the "claim one
//                        removes the others" rule. Player can buy
//                        multiple items if they have the gold.
//   2. p.goldCost = N  — purchase gates on hero's gold balance instead
//                        of HP (altar) or free (combat reward).
//
// Pricing imports SHOP_PRICES from floor.js so the merchant + the
// floor-generator agree on what the player pays.
import { SHOP_PRICES } from './floor.js';
export function spawnShopOffer(floorLevel = 1) {
  pedestals.length = 0;
  const offers = rollRelicOffer(3, floorLevel);
  if (offers.length === 0) return;
  // 3-column shop layout — slightly wider than the standard offer row
  // so the price tags don't overlap with adjacent pedestal sparkles.
  const cols = [5, 10, 15];
  const row = 5;
  const placed = [];
  for (let i = 0; i < offers.length; i++) {
    const spot = findClearTile(cols[i], row);
    if (placed.some(p => p.x === spot.x && p.y === spot.y)) {
      const alt = findClearTile(cols[i] + (i === 0 ? -1 : 1), row);
      spot.x = alt.x; spot.y = alt.y;
    }
    placed.push(spot);
    const tier = relicTier(offers[i].id);
    pedestals.push({
      x: spot.x * TILE + TILE/2,
      y: spot.y * TILE + TILE/2,
      relic: offers[i],
      tier,
      picked: false,
      bob: Math.random() * Math.PI * 2,
      glow: 0,
      hpCost: 0,
      shop: true,
      goldCost: SHOP_PRICES[tier] || SHOP_PRICES.common,
    });
  }
}

// Round-7-audit factory — single source of truth for non-spawnRelicOffer
// pedestal pushes. Five hand-rolled `pedestals.push({...})` sites in
// main.js had drifted from `spawnRelicOffer`'s shape: three forgot the
// `tier` field (mythic chest pickups silently downgraded to common-tier
// sparkle + audio + missing the "Windforce" cinematic), two had
// `bob: 0` (sync-bobbing visual glitch), one omitted findClearTile
// (boss-center pedestal could spawn embedded in a pillar).
//
// `bonus: true` tags the pedestal as a free drop (Coin of the Tyrant
// kill-chain, secret-wall reward, echo-defeat, mimic treasure). Bonus
// pedestals OPT OUT of the "claim one removes the others" sibling-pick
// rule in consumePendingPickup, so a bonus drop landing in the same
// room as standard offer pedestals doesn't wipe the offer when picked.
//
// snapToClearTile=true runs the position through findClearTile so the
// pedestal nudges to a walkable tile if the spawn point lands on a
// pillar or wall (used by the boss-center legendary drop).
export function pushPedestal(opts = {}) {
  const relic = opts.relic;
  if (!relic) return null;
  let px = opts.x;
  let py = opts.y;
  if (opts.snapToClearTile) {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    const spot = findClearTile(tx, ty);
    px = spot.x * TILE + TILE / 2;
    py = spot.y * TILE + TILE / 2;
  }
  const p = {
    x: px, y: py,
    relic,
    tier: opts.tier || relicTier(relic.id) || 'common',
    picked: false,
    bob: Math.random() * Math.PI * 2,
    glow: 0,
    hpCost: opts.hpCost || 0,
    goldCost: opts.goldCost || 0,
    shop: !!opts.shop,
    bonus: !!opts.bonus,
  };
  pedestals.push(p);
  return p;
}

// Spawn a SINGLE guaranteed-relic pedestal from a boss's thematic pool.
// Rolls the first unowned id from the pool; falls back to any unowned in
// the pool if shuffled pick is already held. Optional mythicPool + chance
// supports the Ember Tyrant's 20% "Windforce moment" drop.
// The pedestal spawns at the given world coordinates (the boss corpse).
export function spawnBossDrop(bossType, worldX, worldY, opts = {}) {
  const pool = (opts.pool || []).slice();
  const mythicPool = opts.mythicPool || null;
  const mythicChance = opts.mythicChance || 0;
  if (pool.length === 0 && !mythicPool) return null;

  const ownedIds = new Set(equippedRelics.map(r => r.id));
  // Filter: relic exists + not owned + compatible with hero's weapon.
  // Sword players shouldn't get a wand-only mythic from Ember Tyrant
  // (Eye of Ether / Cataclysm don't currently have weaponOnly so they
  // pass through; this gate is forward-compat for any future
  // weapon-only mythic / boss drops).
  const heroWeapon = hero.weapon || 'sword';
  const compatible = (id) => {
    const def = RELIC_DEFS[id];
    if (!def) return false;
    if (def.weaponOnly && def.weaponOnly !== heroWeapon) return false;
    return true;
  };

  // Mythic roll first (if configured)
  let chosenId = null;
  if (mythicPool && Math.random() < mythicChance) {
    const available = mythicPool.filter(id => !ownedIds.has(id) && compatible(id));
    if (available.length > 0) {
      chosenId = available[(Math.random() * available.length) | 0];
    }
  }

  // Fall back to themed pool — shuffle then pick first unowned + compatible
  if (!chosenId) {
    for (let i = pool.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    chosenId = pool.find(id => !ownedIds.has(id) && compatible(id)) || null;
    // All pool relics owned → fall back to any compatible pool relic
    // (duplicate OK). Final fallback: any pool relic at all (degenerate
    // case, never expected past intended progression curve).
    if (!chosenId) chosenId = pool.find(id => compatible(id));
    if (!chosenId) chosenId = pool.find(id => RELIC_DEFS[id]);
  }
  if (!chosenId) return null;

  const def = RELIC_DEFS[chosenId];
  pedestals.length = 0;     // clear any existing pedestals
  pedestals.push({
    x: worldX,
    y: worldY,
    relic: def,
    tier: relicTier(chosenId),
    picked: false,
    bob: Math.random() * Math.PI * 2,
    glow: 0,
    hpCost: 0,
    isBossDrop: true,
  });

  // Dramatic spawn flourish — deathBurst + screen flash + tier-scaled sting
  deathBurst(worldX, worldY - 20, def.tint || '#fff2e0');
  deathBurst(worldX + 10, worldY - 15, '#f4d9a0');
  deathBurst(worldX - 10, worldY - 15, def.tint || '#ffffff');
  const tier = relicTier(chosenId);
  if (tier === 'mythic') {
    synthChord(1100, 1.3, 1.6);
    synthThud(70, 1.1, 0.9);
    setTimeout(() => synthChord(1397, 1.0, 1.2), 220);
    shakeCamera(12, 0.42);
  } else if (tier === 'legendary') {
    synthChord(880, 1.0, 1.0);
    synthThud(100, 0.7, 0.45);
    shakeCamera(7, 0.3);
  } else {
    synthChord(659, 0.9, 0.75);
    shakeCamera(5, 0.25);
  }
  return def;
}

export function clearPedestals() {
  pedestals.length = 0;
  // pickedFlashTime / lastPickedDef are INTENTIONALLY preserved here. This
  // function is called by loadRoom on every room transition. If a player
  // picks up a relic near the exit and walks through the door within the
  // banner's 3s (or 5.5s for mythic) lifetime, the celebratory banner
  // should finish its display in the next room rather than getting cut
  // mid-animation. The banner decays naturally via updatePedestals.
  // Use suppressPickupFlash() for full-reset paths (fusion takeover, etc.).
}

// Explicitly zero the pickup-flash banner — for cases where a DIFFERENT
// banner (e.g. a fusion banner) should take precedence and the pickup
// flash would stack visually on top of it.
export function suppressPickupFlash() {
  lastPickedDef = null;
  pickedFlashTime = 0;
  lastPickedFirstMythic = false;
  lastPickedEvent = null;
}

// Dev-only: force the pickup-flash banner state for screenshot-based testing.
// Bypasses applyRelic — just sets the banner's render state directly. Use via
// the `__testPickupFlash` debug hook (tree-shaken from production).
// pickedFlashTime is set to 2.2s so the banner is inside the peak-alpha
// window (0.3s..2.25s) for non-mythic; overridable if you want a specific
// fade-in / fade-out frame.
export function setPickupFlashForTest(def, tier, flashTime = 2.2) {
  lastPickedDef = { ...def, tier };
  pickedFlashTime = flashTime;
}

// True while the FIRST-MYTHIC center-stage banner is active (5.5s) — NOT
// while ordinary pickup notifications are on the top-right rail. This is
// intentional: the Watcher and other defer-on-banner consumers should
// only hold back when something is claiming the CENTER of the screen
// (cinematics, first-mythic). The notification rail is non-blocking and
// can co-exist with Watcher utterances.
//
// Round-7 audit flagged this name as misleading (the function reads like
// "any pickup flash"); kept the name to avoid a cross-module rename, but
// the behavior is correct as-is.
export function isPickupFlashActive() {
  return pickedFlashTime > 0;
}

export function hasActivePedestals() {
  return pedestals.length > 0 && pedestals.some(p => !p.picked);
}

// Call each tick. Returns the relic def if one was picked up this frame.
export function updatePedestals(dt) {
  if (pickedFlashTime > 0) pickedFlashTime -= dt;
  for (const p of pedestals) {
    p.bob += dt * 2;
    const d = Math.hypot(hero.x - p.x, hero.y - p.y);
    p.glow = Math.max(0, 1 - d / 200);
    // Sparkle emission — scales with rarity, reduced when hero is close (visual clutter)
    if (!p.picked) {
      const tier = p.tier || 'common';
      // Mythic has a near-constant aurora of sparkles. Legendary is dense, rare
      // moderate, common a trickle.
      const rate = tier === 'mythic' ? 18 : tier === 'legendary' ? 8 : tier === 'rare' ? 3 : 0.8;
      const threshold = Math.min(0.95, rate * dt);
      if (Math.random() < threshold) {
        const color = p.relic?.tint || (tier === 'mythic' ? '#fff2e0' : tier === 'legendary' ? '#ffc8ff' : tier === 'rare' ? '#f4d9a0' : '#c0b0d0');
        // Mythic spreads sparkles wider — pedestal reads as a beacon
        const spreadX = tier === 'mythic' ? 34 : 22;
        const spreadY = tier === 'mythic' ? 28 : 18;
        sparkle(p.x + (Math.random() - 0.5) * spreadX, p.y - 6 + (Math.random() - 0.5) * spreadY, color);
      }
    }
  }
  // Hover detection — find the nearest unclaimed pedestal in interact
  // range. Round-6 player-feedback: walking onto a pedestal used to be
  // an instant pickup, which made fast-traversal players accidentally
  // claim relics they didn't want. Now we mark a "hovered" pedestal
  // and the player commits via E (consumePendingPickup, called from
  // main.js's E-key handler). Pickup logic stays identical post-commit;
  // only the trigger changed.
  //
  // PEDESTAL_HOVER_R 36 (vs old 26 auto-pickup) = a slight tolerance
  // bump now that picking up requires a key press — players can stand
  // a bit further away and still see the prompt, mirroring NPC
  // interact ranges in the hamlet (50px there for similar reasons).
  _hoveredIndex = -1;
  let bestD = Infinity;
  for (let i = 0; i < pedestals.length; i++) {
    const p = pedestals[i];
    if (p.picked) continue;
    const d = Math.hypot(hero.x - p.x, hero.y - p.y);
    if (d < PEDESTAL_HOVER_R && d < bestD) {
      bestD = d;
      _hoveredIndex = i;
    }
  }
  return null;
}

// Hover state — set by updatePedestals each tick, read by:
//   - drawPedestalPrompt (renders "E · TAKE" label above the pedestal)
//   - consumePendingPickup (called from main.js E-handler on key press)
let _hoveredIndex = -1;
const PEDESTAL_HOVER_R = 36;

export function getHoveredPedestalIndex() { return _hoveredIndex; }

// Pick a pedestal by explicit index — used by the relic-choice modal
// (Hades-style overlay) which presents all offers at once and commits
// the choice via mouse click or keyboard. Internally it temporarily
// promotes that pedestal to the "hovered" slot, runs the existing
// pickup logic (which has all the fusion / theme / SFX / banner
// side-effects baked in), and restores the previous hover. Returns
// the same shape as consumePendingPickup: relic def on success,
// 'denied_hp' / 'denied_gold' on insufficient resources, null if the
// index is out of range or the pedestal is already picked.
export function pickPedestalByIndex(idx) {
  if (idx < 0 || idx >= pedestals.length) return null;
  const p = pedestals[idx];
  if (!p || p.picked) return null;
  const prev = _hoveredIndex;
  _hoveredIndex = idx;
  const result = consumePendingPickup();
  _hoveredIndex = prev;
  return result;
}

// E-key handler — call from main.js when the player presses E in a
// combat/altar/reward/boss/shop room. Returns the picked relic def, or
// null if nothing was hovered, 'denied_hp' if the hovered pedestal is
// an altar the player can't afford, or 'denied_gold' if the hovered
// pedestal is a shop item the player can't afford. Caller decides what
// to do with the denial reason (room-label feedback).
export function consumePendingPickup() {
  if (_hoveredIndex < 0) return null;
  const p = pedestals[_hoveredIndex];
  if (!p || p.picked) return null;
  // Altar pedestals cost HP. Refuse if hero would die from the trade.
  if (p.hpCost > 0) {
    if (hero.hp <= p.hpCost) return 'denied_hp';
    hero.hp -= p.hpCost;
  }
  // Round-7 — Shop pedestals cost gold. Refuse if hero can't afford.
  // Charged AT confirm time so a player who walks past a shop pedestal
  // doesn't accidentally lose gold (the same protection the pedestal
  // E-confirm flow gives for relic claims).
  if (p.shop && p.goldCost > 0) {
    if (gold.total < p.goldCost) return 'denied_gold';
    gold.total -= p.goldCost;
  }
  // Apply FIRST, mark consumed AFTER. If applyRelic throws (corrupt
  // state, missing fusion def), the pedestal remains un-picked so the
  // player can try again on next tick instead of losing the relic.
  const beforeFusionIds = new Set(activeFusions.map(f => f.id));
  const beforeThemeTiers = computeThemeTiers();
  const beforeSlotTiers = computeSlotTiers();
  applyRelic(p.relic.id);
  lastPickedEvent = computeRelicEvent(beforeFusionIds, beforeThemeTiers, beforeSlotTiers, p.relic.id);
  p.picked = true;
  const picked = p.relic;
  const t = p.tier || 'common';
  // MYTHIC — bigger burst, stronger shake, layered sting, extended banner
  if (t === 'mythic') {
    deathBurst(p.x, p.y - 20, p.relic.tint || '#ffffff');
    deathBurst(p.x + 12, p.y - 18, '#fff2e0');
    deathBurst(p.x - 12, p.y - 18, p.relic.tint || '#ffffff');
    shakeCamera(12, 0.42);
    // Layered bell: big chord + sub-bass thud + delayed second bell note.
    // This is the Diablo "Windforce dropped" signature sound.
    synthChord(1100, 1.3, 1.6);
    synthThud(70, 1.1, 0.9);
    setTimeout(() => synthChord(1397, 1.0, 1.2), 220);
    setTimeout(() => synthFanfare(0.6), 560);
  } else {
    deathBurst(p.x, p.y - 20, p.relic.tint || '#ffffff');
    // Round-7-audit POLISH — common pickups skip camera shake.
    // Common-tier pickups fire on every standard offer claim AND on
    // every Coin-of-the-Tyrant kill-chain drop AND on every chest
    // treasure roll AND on every shop purchase under 90g — that's a
    // lot of shakes per run. Save the shake budget for tiers that
    // are actually rare moments. Altar HP-cost pickups still shake
    // (a deliberate trade deserves the punch).
    if (p.hpCost > 0) shakeCamera(6, 0.15);
    else if (t !== 'common') shakeCamera(3, 0.15);
    if (t === 'legendary') synthChord(880, 1.0, 1.0);
    else if (t === 'rare') synthChord(659, 0.9, 0.75);
    else synthPing(1100, 0.9, 0.3);
  }
  playSfx('click', { volume: 0.9, rate: p.hpCost > 0 ? 0.8 : 1.2 });
  lastPickedDef = p.relic;
  // Wizard-kit Sprint 3D UX cleanup — ALL pickups route to the top-right
  // notification rail, including first-ever mythic. Was: first-ever mythic
  // played a centered "Windforce moment" cinematic for 5.5s. Problem:
  // when Eye of Ether is the first mythic AND it completes a fusion (e.g.
  // + Executioner = Final Verdict), the fusion banner ALSO centered, and
  // the two banners stacked into unreadable visual chaos. The rail still
  // gives the moment dignity — mythic tier already gets a 5.5s life,
  // ✦ glyph, white-gold tint that's visibly distinct from common/rare.
  lastPickedFirstMythic = (t === 'mythic') && isFirstTime('mythic', 'any');
  pickedFlashTime = 0;
  // Phase 2 audit fix #3 — fusion-partner teaser. Players picking a relic
  // that's part of an unformed fusion had no signal that the relic was
  // ALSO a fusion ingredient. The pedestal teaser-particle system hints
  // at it pre-pickup; the pickup banner itself was silent. Now we look
  // up which fusions the relic participates in, find any whose partners
  // are NOT yet owned (fusions JUST formed by this pickup are handled
  // separately by the FUSION FORGED chip on lastPickedEvent), and append
  // a "Pairs with: X → Fusion" suffix to the rail body. Capped at 2
  // partners to keep the rail entry compact.
  const ownedSet = new Set(equippedRelics.map(r => r.id));
  const partners = [];
  for (const f of Object.values(FUSIONS)) {
    if (!f.components || f.components.length !== 2) continue;
    const idx = f.components.indexOf(p.relic.id);
    if (idx === -1) continue;
    const partnerId = f.components[1 - idx];
    if (ownedSet.has(partnerId)) continue;       // already owned → fusion just forged or already formed
    const partnerDef = RELIC_DEFS[partnerId];
    if (!partnerDef) continue;
    partners.push({ name: partnerDef.name || partnerId, fusionName: f.name || f.id });
    if (partners.length >= 2) break;             // cap so the rail entry stays tight
  }
  let bodyText = p.relic.desc || '';
  if (partners.length === 1) {
    bodyText += `  ·  Pairs with ${partners[0].name} → ${partners[0].fusionName}`;
  } else if (partners.length >= 2) {
    bodyText += `  ·  Pairs: ${partners[0].name} → ${partners[0].fusionName} · ${partners[1].name} → ${partners[1].fusionName}`;
  }
  pushNotification({
    kind: 'pickup',
    tier: t,
    title: p.relic.name || 'RELIC',
    body: bodyText,
  });
  // Mark sibling pedestals as picked too — the offer-set is committed
  // on the first claim, mirroring the original "claiming one removes
  // the others" pedestal-group rule.
  //
  // Round-7 — Shop pedestals OPT OUT of this rule. Player can buy
  // multiple items if they have the gold, just like Charon's shop in
  // Hades. Only the just-purchased pedestal flips to picked.
  //
  // Round-7-audit — BONUS pedestals (Coin of Tyrant kill-chain drops,
  // secret-wall rewards, echo-defeat drops, chest treasure) ALSO opt
  // out. Without this, picking up a free bonus relic that landed in
  // the same room as a standard offer would wipe the offer to picked,
  // making the bonus a stealth penalty.
  if (!p.shop && !p.bonus) {
    for (const other of pedestals) other.picked = true;
  }
  _hoveredIndex = -1;
  return picked;
}

// Floating "E · TAKE [name]" prompt above the hovered pedestal. Mirrors
// the hamlet's drawHamletInteractPrompt — pill-shaped label with a
// subtle bob, tier-tinted name, gentle outline. Drawn in WORLD space so
// it scales with the camera.
//
// Round-7 user feedback added the pickup-confirm flow; this is the
// player-facing telegraph that teaches the new mechanic. Without it the
// player would walk onto a pedestal and wonder why nothing happened.
//
// Special-case altar prompts to read "E · PAY N HP" so the cost is
// communicated without needing the existing tooltip — a quick-glance
// player who skips the tooltip reading still knows what they're agreeing
// to before pressing E.
export function drawPedestalPrompt(ctx) {
  if (_hoveredIndex < 0) return;
  const p = pedestals[_hoveredIndex];
  if (!p || p.picked) return;
  const isAltar = p.hpCost > 0;
  const isShop = !!p.shop;
  const tierTint = p.relic?.tint || (p.tier === 'mythic' ? '#fff2e0'
                                    : p.tier === 'legendary' ? '#ffc8ff'
                                    : p.tier === 'rare' ? '#f4d9a0'
                                    : '#c9a86a');
  const name = (p.relic?.name || 'RELIC').toUpperCase();
  // Round-7 — shop pedestals show "E · BUY · N gold · NAME" so the
  // cost is visible before commit. Color the entire pill green when
  // affordable, red when not (mirrors the gold-deny pattern).
  let label;
  if (isShop) {
    label = `E  ·  BUY ${p.goldCost}g · ${name}`;
  } else if (isAltar) {
    label = `E  ·  PAY ${p.hpCost} HP · ${name}`;
  } else {
    label = `E  ·  TAKE ${name}`;
  }
  const now = performance.now() / 1000;
  const floatOff = Math.sin(now * 2.2) * 3;
  const promptY = p.y - 56 + floatOff;
  ctx.save();
  ctx.font = 'bold 11px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const m = ctx.measureText(label);
  const padX = 12;
  const w = m.width + padX * 2;
  const h = 22;
  const x = p.x - w / 2;
  const y = promptY - h / 2;
  // Background pill
  ctx.fillStyle = 'rgba(14, 10, 16, 0.88)';
  ctx.fillRect(x, y, w, h);
  // Border tint — altar=tier, shop=affordable-state, default=tier.
  let borderColor = tierTint;
  let textColor = tierTint;
  if (isShop) {
    const canAfford = gold.total >= p.goldCost;
    borderColor = canAfford ? '#86e3a8' : '#d85a5a';
    textColor = canAfford ? '#a8f0c4' : '#ff8088';
  } else if (isAltar) {
    textColor = '#ff8088';
  }
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = textColor;
  ctx.fillText(label, p.x, promptY);
  ctx.restore();
}

export function drawPedestals(ctx) {
  const now = performance.now() / 1000;
  // Compute fusion-completing relic ids once per frame so we can tag any
  // pedestal whose pickup would form a fusion. Cheap — small pool + Sets.
  const fusionCompleters = getFusionCompletingRelicIds(equippedRelics.map(r => r.id));
  for (const p of pedestals) {
    if (p.picked) continue;
    const y = p.y + Math.sin(p.bob) * 3;
    const isAltar = p.hpCost > 0;
    const tier = p.tier || 'common';

    // RARITY VISUAL: rare = gold pulse; legendary = prismatic ring;
    // mythic = triple ring + 6 rune points + prismatic aurora (the "oh shit" moment)
    if (tier === 'rare' || tier === 'legendary' || tier === 'mythic') {
      const pulseAmp = tier === 'mythic' ? 0.75 : tier === 'legendary' ? 0.55 : 0.35;
      const pulse = 0.7 + pulseAmp * Math.sin(now * 3 + p.bob);
      const ringR = (tier === 'mythic' ? 58 : tier === 'legendary' ? 44 : 34) + (pulse * 8);
      const ringColor = tier === 'mythic' ? '#fff2e0' : tier === 'legendary' ? '#ffc8ff' : '#f4d9a0';
      ctx.strokeStyle = ringColor;
      ctx.globalAlpha = pulse;
      ctx.lineWidth = tier === 'mythic' ? 4 : tier === 'legendary' ? 3 : 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y + 4, ringR, 0, Math.PI * 2);
      ctx.stroke();
      if (tier === 'legendary' || tier === 'mythic') {
        ctx.strokeStyle = tier === 'mythic' ? (p.relic.tint || '#ffb4c8') : '#a0e8ff';
        ctx.globalAlpha = pulse * 0.6;
        ctx.lineWidth = tier === 'mythic' ? 2 : 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y + 4, ringR + 6, 0, Math.PI * 2);
        ctx.stroke();
        // Rune points — mythic gets 6 (vs legendary's 4), brighter pulse
        const runeCount = tier === 'mythic' ? 6 : 4;
        ctx.fillStyle = '#ffffff';
        for (let k = 0; k < runeCount; k++) {
          const a = (k / runeCount) * Math.PI * 2 + now * 1.3;
          const rx = p.x + Math.cos(a) * (ringR + 10);
          const ry = (p.y + 4) + Math.sin(a) * (ringR + 10);
          ctx.globalAlpha = pulse * (tier === 'mythic' ? 1.0 : 0.9);
          const runeSize = tier === 'mythic' ? 4 : 3;
          ctx.fillRect(rx - runeSize / 2, ry - runeSize / 2, runeSize, runeSize);
        }
        // Mythic: third outer ring, dashed, counter-rotating
        if (tier === 'mythic') {
          ctx.strokeStyle = '#ffffff';
          ctx.globalAlpha = pulse * 0.3;
          ctx.lineWidth = 1;
          ctx.setLineDash([6, 6]);
          ctx.lineDashOffset = -now * 30;
          ctx.beginPath();
          ctx.arc(p.x, p.y + 4, ringR + 16, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      ctx.globalAlpha = 1;
    }

    // Glow ring on floor — red if HP-cost altar pedestal, relic-tinted otherwise
    const glowR = 26 + p.glow * 12 + (tier === 'mythic' ? 20 : tier === 'legendary' ? 12 : tier === 'rare' ? 6 : 0);
    const grad = ctx.createRadialGradient(p.x, p.y + 4, 2, p.x, p.y + 4, glowR);
    const baseColor = isAltar ? 'rgba(255, 60, 80, ' : (p.relic.tint || '#ffffff');
    if (isAltar) {
      grad.addColorStop(0, baseColor + '0.8)');
      grad.addColorStop(0.45, baseColor + '0.3)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
    } else {
      grad.addColorStop(0, baseColor + 'cc');
      grad.addColorStop(0.45, baseColor + '44');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(p.x - glowR, p.y - glowR + 4, glowR * 2, glowR * 2);

    // Pedestal base — darker/redder for altar pedestals
    ctx.fillStyle = isAltar ? '#1a0a10' : '#24202c';
    ctx.fillRect(p.x - 14, p.y + 2, 28, 10);
    ctx.fillStyle = isAltar ? '#44181f' : '#3a3440';
    ctx.fillRect(p.x - 12, p.y, 24, 4);

    // LIGHT BEAM rising from the pedestal — tier-colored vertical cone that
    // turns the pedestal into a visible beacon.
    const beamColor = isAltar ? '#ff5080' : (p.relic.tint || '#c0b0d0');
    const beamHeight = tier === 'mythic' ? 180 : tier === 'legendary' ? 120 : tier === 'rare' ? 90 : 60;
    const beamPulse = 0.6 + 0.4 * Math.sin(now * 2.5 + p.bob);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Convert hex to rgba for gradient
    const hex = beamColor.replace('#', '');
    const nH = parseInt(hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex, 16);
    const br = (nH >> 16) & 255, bg = (nH >> 8) & 255, bb = nH & 255;
    const beamGrad = ctx.createLinearGradient(p.x, p.y - 2, p.x, p.y - beamHeight);
    beamGrad.addColorStop(0, `rgba(${br},${bg},${bb},${(0.45 * beamPulse).toFixed(3)})`);
    beamGrad.addColorStop(0.5, `rgba(${br},${bg},${bb},${(0.2 * beamPulse).toFixed(3)})`);
    beamGrad.addColorStop(1, `rgba(${br},${bg},${bb},0)`);
    ctx.fillStyle = beamGrad;
    const beamTopW = 10 + (tier === 'mythic' ? 12 : tier === 'legendary' ? 6 : tier === 'rare' ? 3 : 0);
    const beamBotW = 24 + (tier === 'mythic' ? 18 : tier === 'legendary' ? 10 : tier === 'rare' ? 5 : 0);
    ctx.beginPath();
    ctx.moveTo(p.x - beamBotW / 2, p.y - 2);
    ctx.lineTo(p.x + beamBotW / 2, p.y - 2);
    ctx.lineTo(p.x + beamTopW / 2, p.y - beamHeight);
    ctx.lineTo(p.x - beamTopW / 2, p.y - beamHeight);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Floating icon — bobs higher now with the beam, more dramatic levitation.
    const floatY = y - 32 + Math.sin(now * 1.8 + p.bob) * 4;
    const icon = images[p.relic.icon];
    if (icon) {
      const iconSize = 30;
      // Icon glow halo — additive pulse behind the icon
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const iconGlow = ctx.createRadialGradient(p.x, floatY, 4, p.x, floatY, 30);
      iconGlow.addColorStop(0, `rgba(${br},${bg},${bb},${(0.4 * beamPulse).toFixed(3)})`);
      iconGlow.addColorStop(1, `rgba(${br},${bg},${bb},0)`);
      ctx.fillStyle = iconGlow;
      ctx.fillRect(p.x - 30, floatY - 30, 60, 60);
      ctx.restore();
      // Dedicated per-relic art — bypass glyph/hue overlay (pass null,null).
      drawRelicIcon(ctx, icon, null, null, p.relic.id,
                    p.x - iconSize/2, floatY - iconSize/2, iconSize);
    } else {
      ctx.fillStyle = p.relic.tint || '#ffffff';
      ctx.fillRect(p.x - 10, floatY - 10, 20, 20);
    }

    // Tier label above icon (rare/legendary/mythic) — tracks the floating icon
    if (tier === 'rare' || tier === 'legendary' || tier === 'mythic') {
      const label = tier === 'mythic' ? '\u2605 MYTHIC \u2605' : tier === 'legendary' ? 'LEGENDARY' : 'RARE';
      const labelColor = tier === 'mythic' ? '#fff2e0' : tier === 'legendary' ? '#ffc8ff' : '#f4d9a0';
      const lblW = tier === 'mythic' ? 100 : 80;
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.fillRect(p.x - lblW / 2, floatY - 24, lblW, 12);
      if (tier === 'mythic') {
        ctx.strokeStyle = labelColor;
        ctx.globalAlpha = 0.7 + 0.3 * Math.sin(now * 4);
        ctx.lineWidth = 1;
        ctx.strokeRect(p.x - lblW / 2 + 0.5, floatY - 24 + 0.5, lblW - 1, 11);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = labelColor;
      ctx.font = tier === 'mythic' ? 'italic bold 9px Georgia, serif' : 'bold 10px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, p.x, floatY - 18);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }

    // HP cost label above icon for altar pedestals — tracks floating icon.
    // Scales with cost: legendary (7+ HP) gets bigger text + a pulsing red
    // halo so the player FEELS the weight of the trade before walking onto it.
    if (isAltar) {
      const isHigh = p.hpCost >= 7;
      const isMid  = p.hpCost >= 4;
      const labelW = isHigh ? 50 : isMid ? 42 : 36;
      const labelH = isHigh ? 18 : 14;
      const labelY = floatY - 30 - (isHigh ? 4 : 0);
      // Warning halo for high-cost altars — pulses to draw the eye
      if (isHigh) {
        const pulse = 0.55 + 0.35 * Math.sin(now * 3.0 + p.bob);
        const halo = ctx.createRadialGradient(p.x, labelY + labelH / 2, 4, p.x, labelY + labelH / 2, 38);
        halo.addColorStop(0, `rgba(255, 80, 90, ${(0.45 * pulse).toFixed(3)})`);
        halo.addColorStop(1, 'rgba(255, 80, 90, 0)');
        ctx.fillStyle = halo;
        ctx.fillRect(p.x - 38, labelY - 10, 76, labelH + 20);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.78)';
      ctx.fillRect(p.x - labelW / 2, labelY, labelW, labelH);
      ctx.strokeStyle = isHigh ? 'rgba(255, 100, 110, 0.85)' : 'rgba(255, 130, 140, 0.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(p.x - labelW / 2 + 0.5, labelY + 0.5, labelW - 1, labelH - 1);
      ctx.fillStyle = isHigh ? '#ff8a96' : '#ff7a8e';
      ctx.font = `bold ${isHigh ? 14 : 12}px Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('-' + p.hpCost + ' HP', p.x, labelY + labelH / 2 + 0.5);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }

    // Round-7 — Shop pedestals show a permanent gold price tag above
    // the floating icon, tinted by affordability. Always-visible so the
    // player can scan the room and prioritise BEFORE walking up — the
    // hover prompt confirms intent, this label is the price list.
    if (p.shop) {
      const canAfford = gold.total >= p.goldCost;
      const labelW = 56;
      const labelH = 14;
      const labelY = floatY - 30;
      ctx.fillStyle = 'rgba(0,0,0,0.78)';
      ctx.fillRect(p.x - labelW / 2, labelY, labelW, labelH);
      ctx.strokeStyle = canAfford ? '#86e3a8' : '#d85a5a';
      ctx.lineWidth = 1;
      ctx.strokeRect(p.x - labelW / 2 + 0.5, labelY + 0.5, labelW - 1, labelH - 1);
      ctx.fillStyle = canAfford ? '#a8f0c4' : '#ff8088';
      ctx.font = 'bold 11px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.goldCost + 'g', p.x, labelY + labelH / 2 + 0.5);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }

    // FUSION HINT — if picking this relic would complete a fusion with one
    // of the hero's equipped relics, show a cyan "⚡ FUSION" chip above the
    // tier label. Massive discovery dopamine — surfaces the pairing logic
    // that was previously invisible until activation.
    if (fusionCompleters && fusionCompleters.has(p.relic.id)) {
      const chipY = floatY - 40;
      const chipW = 74;
      const pulse = 0.75 + 0.25 * Math.sin(now * 3.2 + p.bob);
      ctx.fillStyle = 'rgba(10, 18, 28, 0.95)';
      ctx.fillRect(p.x - chipW / 2, chipY, chipW, 14);
      ctx.strokeStyle = '#a0e8ff';
      ctx.globalAlpha = pulse;
      ctx.lineWidth = 1;
      ctx.strokeRect(p.x - chipW / 2 + 0.5, chipY + 0.5, chipW - 1, 13);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#a0e8ff';
      ctx.font = 'italic bold 9px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('\u26A1 FUSION \u26A1', p.x, chipY + 7);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
  }
}

// HUD overlay — dramatic center-screen reveal when a pedestal is picked.
// Full manuscript grammar: floating icon "seal" above the frame, corner L
// ornaments, ◆ diamond tier label, central-diamond divider, tier-aware
// frame color + halo. Legendary gets a pulsing border; rare steady gold;
// common a muted bronze.
export function drawPickupFlash(ctx, w, h) {
  if (pickedFlashTime <= 0 || !lastPickedDef) return;
  // Defer when another system owns the center banner slot (boss intro,
  // floor card, keeper wake, tip, etc.). Without this gate, a pedestal
  // grabbed near a door could send the 3-5.5s pickup banner stacking on
  // top of a boss portrait or floor-card reveal. Tip system already
  // does this same defer; pickup banner now matches.
  if (typeof window !== 'undefined' && window.__centerBannerActive) return;
  const tier = lastPickedDef.tier || 'common';
  // Mythic holds the banner 5.5s; everything else 3.0s.
  const life = tier === 'mythic' ? 5.5 : 3.0;
  const r = 1 - (pickedFlashTime / life);        // 0 → 1
  let a;
  if (r < 0.1) a = r / 0.1;
  else if (r > 0.75) a = (1 - r) / 0.25;
  else a = 1;
  a = Math.max(0, Math.min(1, a));
  const scaleBump = r < 0.2 ? 1 + Math.sin((r / 0.2) * Math.PI) * (tier === 'mythic' ? 0.18 : 0.1) : 1;
  // Tier palette — common bronze, rare gold, legendary magenta, mythic white-gold.
  const tierColor = tier === 'mythic' ? '#fff2e0' : tier === 'legendary' ? '#ffc8ff' : tier === 'rare' ? '#f4d9a0' : '#c9a86a';
  const tierRgb   = tier === 'mythic' ? '255, 242, 224' : tier === 'legendary' ? '255, 200, 255' : tier === 'rare' ? '244, 217, 160' : '201, 168, 106';
  const tierGlyph = tier === 'mythic' ? '\u2605' : tier === 'legendary' ? '\u2605' : tier === 'rare' ? '\u25C6' : '\u2666';
  // Slot prefix from the relic's `affects` tag (wizard-kit Sprint 3A).
  // Reads as "this pickup buffs my SWORD / BLAST / SHIELD" so the player
  // gets the build-axis read at first glance, ahead of theme + tier.
  // Multi-slot relics (e.g. ['sword', 'blast']) show "SWORD+BLAST".
  // Universal relics (['any']) skip the prefix \u2014 no axis to highlight.
  const affectsArr = (lastPickedDef.affects && lastPickedDef.affects.length)
    ? lastPickedDef.affects
    : null;
  let slotPrefix = '';
  if (affectsArr) {
    if (affectsArr.length === 1 && affectsArr[0] !== 'any') {
      slotPrefix = affectsArr[0].toUpperCase() + ' \u00b7 ';
    } else if (affectsArr.length === 2) {
      slotPrefix = affectsArr.map(s => s.toUpperCase()).join('+') + ' \u00b7 ';
    }
  }
  const tierLabel = tier === 'mythic' ? `${tierGlyph}\u2605  ${slotPrefix}MYTHIC  \u2605${tierGlyph}` : tier === 'legendary' ? `${tierGlyph} ${slotPrefix}LEGENDARY ${tierGlyph}` : tier === 'rare' ? `${tierGlyph} ${slotPrefix}RARE ${tierGlyph}` : `${tierGlyph} ${slotPrefix}COMMON ${tierGlyph}`;

  ctx.save();
  ctx.globalAlpha = a;

  // Mythic banner is larger — gives the moment more weight on screen.
  // Defensive cap against the canvas width: the canvas is 1280 today so
  // 560/480 always fits, but if a future build shrinks the internal
  // resolution (e.g. 800x450 mode for a low-end target) the banner
  // would clip without this guard.
  const boxW = Math.min(tier === 'mythic' ? 560 : 480, w - 80);
  // Pre-measure flavor + desc so the frame can grow to fit wrapped lines.
  // Long descs (e.g. Hourglass of Respite, 72 chars) used to overflow a
  // fixed-height box into the HUD.
  const innerPad = 40;
  const maxTextW = boxW - innerPad * 2;
  const flavorFont = tier === 'mythic' ? 'italic 14px Georgia, serif' : 'italic 12px Georgia, serif';
  const descFont = tier === 'mythic' ? 'bold 17px Georgia, serif' : 'bold 15px Georgia, serif';
  const flavorLh = tier === 'mythic' ? 18 : 15;
  const descLh = tier === 'mythic' ? 22 : 19;
  let flavorLines = [];
  if (lastPickedDef.flavor) {
    ctx.font = flavorFont;
    flavorLines = wrapText(ctx, '\u201C' + lastPickedDef.flavor + '\u201D', maxTextW);
  }
  ctx.font = descFont;
  const descLines = wrapText(ctx, lastPickedDef.desc || '', maxTextW);
  const extraFlavorH = Math.max(0, flavorLines.length - 1) * flavorLh;
  const extraDescH = Math.max(0, descLines.length - 1) * descLh;
  const boxH = (tier === 'mythic' ? 200 : 170) + extraFlavorH + extraDescH;
  const bx = (w - boxW) / 2;
  // Anchor the banner in the upper third of the screen instead of
  // dead-center. Previously `(h - boxH) / 2 - 30` placed the banner
  // straddling y≈245 on a 720h canvas — the box covered ~33% of the
  // play area while it was visible (3s common, 5.5s mythic), hiding
  // the floor + remaining pedestals during the most "I want to see
  // what's around me" moment of the run. h*0.20 puts the top edge
  // around y=144 on the standard canvas, leaving the bottom ~55%
  // of vertical fully clear for the room read.
  const by = Math.round(h * 0.20);
  const pivotX = bx + boxW / 2, pivotY = by + boxH / 2;
  ctx.translate(pivotX, pivotY);
  ctx.scale(scaleBump, scaleBump);
  ctx.translate(-pivotX, -pivotY);

  // Tier-colored radial halo behind the frame — pulsing on all tiers, stronger
  // on rare/legendary/mythic. Mythic halos wash the entire screen.
  const pulseT = performance.now() / (tier === 'mythic' ? 260 : tier === 'legendary' ? 320 : 420);
  const pulse = 0.6 + 0.4 * Math.sin(pulseT);
  const glowA = (r < 0.5 ? 1 : (1 - r) * 2) * pulse;
  if (glowA > 0.05) {
    const glow = ctx.createRadialGradient(pivotX, pivotY, 40, pivotX, pivotY, boxW * (tier === 'mythic' ? 1.3 : 0.85));
    const glowStrength = tier === 'mythic' ? 0.75 : tier === 'legendary' ? 0.55 : tier === 'rare' ? 0.45 : 0.3;
    glow.addColorStop(0, `rgba(${tierRgb}, ${(glowA * glowStrength).toFixed(3)})`);
    glow.addColorStop(1, `rgba(${tierRgb}, 0)`);
    ctx.fillStyle = glow;
    // Mythic: enlarged glow halo around the banner (no longer the full
    // 1280×720 wash). Earlier passes painted the entire screen on first
    // mythic for the "Windforce moment", but during the 5.5s banner
    // window the player still needs to see remaining enemies + door
    // positions. Cap the wash to a generous box-relative region so the
    // banner is unambiguously the loudest thing on screen WITHOUT
    // hiding the rest of the world. First-mythic still gets the
    // larger glow vs subsequent mythics.
    if (tier === 'mythic' && lastPickedFirstMythic) {
      ctx.fillRect(bx - 220, by - 140, boxW + 440, boxH + 280);
      const edgeVg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
      edgeVg.addColorStop(0, 'rgba(0, 0, 0, 0)');
      edgeVg.addColorStop(1, `rgba(0, 0, 0, ${(glowA * 0.25).toFixed(3)})`);
      ctx.fillStyle = edgeVg;
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.fillRect(bx - 120, by - 80, boxW + 240, boxH + 160);
    }
  }

  // Frame — tome-style vertical gradient
  const frameG = ctx.createLinearGradient(bx, by, bx, by + boxH);
  frameG.addColorStop(0, 'rgba(30, 22, 28, 0.96)');
  frameG.addColorStop(1, 'rgba(12, 8, 14, 0.96)');
  ctx.fillStyle = frameG;
  ctx.fillRect(bx, by, boxW, boxH);

  // Tier-colored border — thickness scales, mythic pulses more dramatically
  const borderWidth = tier === 'mythic' ? 2.8 + pulse * 1.0 : tier === 'legendary' ? 2 + pulse * 0.6 : tier === 'rare' ? 1.8 : 1.5;
  ctx.strokeStyle = tierColor;
  ctx.lineWidth = borderWidth;
  ctx.strokeRect(bx + 0.5, by + 0.5, boxW - 1, boxH - 1);
  // Mythic gets a second outer border of the relic's own tint — double-frame signature
  if (tier === 'mythic' && lastPickedDef.tint) {
    ctx.strokeStyle = lastPickedDef.tint;
    ctx.globalAlpha = a * (0.5 + pulse * 0.4);
    ctx.lineWidth = 1.2;
    ctx.strokeRect(bx - 3.5, by - 3.5, boxW + 7, boxH + 7);
    ctx.globalAlpha = a;
  }

  // CORNER ORNAMENTS — gold L-shape + diamond at each corner. Shared grammar
  // with every overlay in the game.
  const cornerSize = 18;
  const cornerStyle = 'rgba(201, 168, 106, 0.85)';
  ctx.strokeStyle = cornerStyle;
  ctx.lineWidth = 1;
  // top-left
  ctx.beginPath(); ctx.moveTo(bx + 3, by + 3 + cornerSize); ctx.lineTo(bx + 3, by + 3); ctx.lineTo(bx + 3 + cornerSize, by + 3); ctx.stroke();
  // top-right
  ctx.beginPath(); ctx.moveTo(bx + boxW - 3 - cornerSize, by + 3); ctx.lineTo(bx + boxW - 3, by + 3); ctx.lineTo(bx + boxW - 3, by + 3 + cornerSize); ctx.stroke();
  // bottom-left
  ctx.beginPath(); ctx.moveTo(bx + 3, by + boxH - 3 - cornerSize); ctx.lineTo(bx + 3, by + boxH - 3); ctx.lineTo(bx + 3 + cornerSize, by + boxH - 3); ctx.stroke();
  // bottom-right
  ctx.beginPath(); ctx.moveTo(bx + boxW - 3 - cornerSize, by + boxH - 3); ctx.lineTo(bx + boxW - 3, by + boxH - 3); ctx.lineTo(bx + boxW - 3, by + boxH - 3 - cornerSize); ctx.stroke();
  // Corner diamonds
  ctx.fillStyle = cornerStyle;
  for (const [cx, cy] of [[bx + 3, by + 3], [bx + boxW - 3, by + 3], [bx + 3, by + boxH - 3], [bx + boxW - 3, by + boxH - 3]]) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-2.5, -2.5, 5, 5);
    ctx.restore();
  }

  // FLOATING ICON "SEAL" — sits on top of the box border, centered horizontally.
  // Tier-colored halo ring behind it so common icons still feel lit.
  const iconSize = 48;
  const iconX = pivotX - iconSize / 2;
  const iconY = by - iconSize / 2 + 8;     // overlap the top border
  // Halo behind the seal
  const seal = ctx.createRadialGradient(pivotX, iconY + iconSize / 2, 6, pivotX, iconY + iconSize / 2, iconSize);
  seal.addColorStop(0, `rgba(${tierRgb}, 0.6)`);
  seal.addColorStop(1, `rgba(${tierRgb}, 0)`);
  ctx.fillStyle = seal;
  ctx.fillRect(iconX - iconSize / 2, iconY - iconSize / 2, iconSize * 2, iconSize * 2);
  // Dedicated per-relic art — bypass glyph/hue overlay (pass null,null).
  const iconImg = images[lastPickedDef.icon];
  if (iconImg) {
    drawRelicIcon(ctx, iconImg, null, null,
                  lastPickedDef.id, iconX, iconY, iconSize);
  }
  // Small tier-colored ring around the seal
  ctx.strokeStyle = tierColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(pivotX, iconY + iconSize / 2, iconSize / 2 + 4, 0, Math.PI * 2);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // Header — "RELIC ACQUIRED" usually. Mythic gets "A LEGEND AWAKES" to sell
  // that this is a named, storied artifact, not loot.
  // EVENT CHIP \u2014 if this pickup formed a fusion or advanced a theme
  // tier (Resonance/Ascendance), render the structural-event label
  // here INSTEAD of the generic header. The event chip is the most
  // important info on the banner \u2014 it tells the player WHY this
  // pickup matters mechanically. Color uses the event's tint
  // (fusion or theme color) so it reads as "this build moved".
  const headerY = by + (tier === 'mythic' ? 50 : 42);
  if (lastPickedEvent) {
    const evPulse = 0.85 + 0.15 * Math.sin(performance.now() / 120);
    ctx.shadowColor = lastPickedEvent.tint;
    ctx.shadowBlur = 12;
    ctx.fillStyle = lastPickedEvent.tint;
    ctx.font = tier === 'mythic' ? 'italic bold 13px Georgia, serif' : 'italic bold 12px Georgia, serif';
    ctx.globalAlpha = a * evPulse;
    ctx.fillText(lastPickedEvent.label, pivotX, headerY);
    ctx.globalAlpha = a;
    ctx.shadowBlur = 0;
  } else {
    ctx.fillStyle = tier === 'mythic' ? tierColor : '#c9a86a';
    ctx.font = tier === 'mythic' ? 'italic bold 11px Georgia, serif' : 'italic bold 10px Georgia, serif';
    const header = tier === 'mythic' ? '\u2014 A LEGEND AWAKES \u2014' : '\u2014 RELIC ACQUIRED \u2014';
    ctx.fillText(header, pivotX, headerY);
  }

  // Big relic name — shadowed glow in tier color. Mythic is larger + stronger glow.
  ctx.shadowColor = tierColor;
  ctx.shadowBlur = tier === 'mythic' ? 22 : 14;
  ctx.fillStyle = '#fff2e0';
  ctx.font = tier === 'mythic' ? 'bold 38px Georgia, serif' : 'bold 30px Georgia, serif';
  ctx.fillText(lastPickedDef.name, pivotX, by + (tier === 'mythic' ? 68 : 58));
  ctx.shadowBlur = 0;

  // Flavor line in quotes — wraps to multiple lines on long quotations
  if (flavorLines.length) {
    ctx.fillStyle = tier === 'mythic' ? 'rgba(240, 230, 220, 0.95)' : 'rgba(210, 200, 220, 0.82)';
    ctx.font = flavorFont;
    const flavorY = by + (tier === 'mythic' ? 118 : 100);
    for (let i = 0; i < flavorLines.length; i++) {
      ctx.fillText(flavorLines[i], pivotX, flavorY + i * flavorLh);
    }
  }

  // Central-diamond divider — hairline with a small diamond at midpoint
  ctx.globalAlpha = a * 0.65;
  const divY = by + (tier === 'mythic' ? 145 : 122) + extraFlavorH;
  const divHalfW = 120;
  // left segment
  const lg = ctx.createLinearGradient(pivotX - divHalfW, divY, pivotX - 8, divY);
  lg.addColorStop(0, 'rgba(201,168,106,0)');
  lg.addColorStop(1, tierColor);
  ctx.fillStyle = lg;
  ctx.fillRect(pivotX - divHalfW, divY - 0.5, divHalfW - 8, 1);
  // right segment
  const rg = ctx.createLinearGradient(pivotX + 8, divY, pivotX + divHalfW, divY);
  rg.addColorStop(0, tierColor);
  rg.addColorStop(1, 'rgba(201,168,106,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(pivotX + 8, divY - 0.5, divHalfW - 8, 1);
  // central diamond
  ctx.fillStyle = tierColor;
  ctx.save();
  ctx.translate(pivotX, divY);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-3, -3, 6, 6);
  ctx.restore();
  ctx.globalAlpha = a;

  // Mechanic description — tier-tinted bold; wraps so long descs don't
  // spill into the HUD.
  ctx.fillStyle = tierColor;
  ctx.font = descFont;
  const descY = by + (tier === 'mythic' ? 158 : 132) + extraFlavorH;
  for (let i = 0; i < descLines.length; i++) {
    ctx.fillText(descLines[i], pivotX, descY + i * descLh);
  }

  // Tier label at the bottom — diamonds flanking. Replaces the old "· COMMON ·".
  ctx.fillStyle = tierColor;
  ctx.font = 'bold 10px Georgia, serif';
  ctx.globalAlpha = a * 0.85;
  ctx.fillText(tierLabel, pivotX, by + boxH - 20);
  ctx.globalAlpha = a;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

// Hover tooltip — shown when hero is near a pedestal (before picking it).
// Redesigned: left-aligned card layout with the relic icon shown inside the
// tooltip (not just on the pedestal), a tier badge above the name, and a
// fade-in animation when the hover target changes so the tooltip reads as
// a discrete UI element rather than appearing mid-render.
let _tooltipCurrent = null;
let _tooltipSince = 0;

// ── RELIC EVENT DETECTION (relicEvent chip) ──────────────────────────
// Snapshots theme-tier state to compare before/after applyRelic. Fusion
// detection uses the activeFusions module-level array directly.
function computeThemeTiers() {
  const counts = getThemeCounts(equippedRelics);
  return {
    storm:  getThemeTier('storm',  counts.storm),
    flame:  getThemeTier('flame',  counts.flame),
    blood:  getThemeTier('blood',  counts.blood),
    vow:    getThemeTier('vow',    counts.vow),
    shadow: getThemeTier('shadow', counts.shadow),
  };
}

// Snapshot helper for SLOT (sword/blast/shield) tier state. Mirrors
// computeThemeTiers — used by computeRelicEvent so slot resonance/
// ascendance moments get their own pickup-banner chip alongside theme
// + fusion events. Phase 2 audit fix: was theme-only; slots are the
// PRIMARY build axis (wizard-kit slots — sword/blast/shield) but their
// tier-ups were silent at pickup-event time.
function computeSlotTiers() {
  const counts = getSlotCounts(equippedRelics);
  return {
    sword:  getSlotTier(counts.sword | 0),
    blast:  getSlotTier(counts.blast | 0),
    shield: getSlotTier(counts.shield | 0),
  };
}

// Compares the post-applyRelic state with the pre-snapshot to determine
// the most-meaningful structural event from this pickup. Returns the
// event object (rendered as a chip above the relic name) or null if
// the relic was a pure stat pickup with no structural change.
//
// Priority (only ONE event picked, highest wins):
//   1. FUSION FORGED              — the most significant; entire new mechanic
//   2. ASCENDANCE (slot or theme) — tier-2 (5-stack) hit on slot/theme
//   3. RESONANCE  (slot or theme) — tier-1 (3-stack) hit on slot/theme
//   4. (null — relic was a pure stat boost)
//
// At equal tier, SLOT events outrank THEME events because slots are the
// primary wizard-kit build axis (sword/blast/shield correspond to the
// hero's three abilities) — their resonance bonuses (hitstop, pierce,
// perfect-block window) compose the kit feel, while theme bonuses are
// flavor stat-boosts on top.
function computeRelicEvent(beforeFusionIds, beforeThemeTiers, beforeSlotTiers, _pickedId) {
  // Fusion forging — first new fusion id in activeFusions wins.
  for (const f of activeFusions) {
    if (!beforeFusionIds.has(f.id)) {
      return {
        label: 'FUSION FORGED — ' + (f.name || f.id).toUpperCase(),
        tint: f.tint || '#ffd27a',
      };
    }
  }
  // Slot + theme advancement — find the highest-tier change. Slots
  // tie-break above themes at equal tier (see priority comment above).
  let best = null;
  // Slots first — same scan pattern as themes; SLOTS axis evaluated
  // first so a slot ascendance ties win over a theme ascendance.
  const afterSlots = computeSlotTiers();
  for (const slotId of Object.keys(SLOTS)) {
    const beforeT = beforeSlotTiers[slotId] | 0;
    const afterT = afterSlots[slotId] | 0;
    if (afterT > beforeT) {
      const label = afterT === 2 ? 'ASCENDANCE' : 'RESONANCE';
      const candidate = {
        label: slotId.toUpperCase() + ' SLOT ' + label,
        tint: (SLOTS[slotId] && SLOTS[slotId].color) || '#c9a86a',
        priority: afterT * 2 + 1,    // slot ties beat theme ties (+1 nudge)
      };
      if (!best || candidate.priority > best.priority) best = candidate;
    }
  }
  // Themes — same scan, lower tie-break priority.
  const afterThemes = computeThemeTiers();
  for (const themeId of Object.keys(THEMES)) {
    const beforeT = beforeThemeTiers[themeId] | 0;
    const afterT = afterThemes[themeId] | 0;
    if (afterT > beforeT) {
      const label = afterT === 2 ? 'ASCENDANCE' : 'RESONANCE';
      const candidate = {
        label: themeId.toUpperCase() + ' ' + label,
        tint: (THEMES[themeId] && THEMES[themeId].tint) || '#c9a86a',
        priority: afterT * 2,        // theme ties (no nudge)
      };
      if (!best || candidate.priority > best.priority) best = candidate;
    }
  }
  if (best) {
    const { label, tint } = best;
    return { label, tint };
  }
  return null;
}

// Lightweight check: does the hero stand within tooltip range of any
// active pedestal? Used by hud.js to suppress its theme-chip tooltip
// when a pedestal tooltip would also be on screen — keeps two tooltips
// from stacking when the player hovers a theme chip while standing on
// a pedestal. Mirrors the proximity check at the top of
// drawPedestalTooltip so the gates can never drift.
export function isPedestalTooltipActive() {
  for (const p of pedestals) {
    if (p.picked) continue;
    const d = Math.hypot(hero.x - p.x, hero.y - p.y);
    if (d < 90) return true;
  }
  return false;
}

export function drawPedestalTooltip(ctx, w, h, opts = {}) {
  let nearest = null;
  let nearestD = Infinity;
  for (const p of pedestals) {
    if (p.picked) continue;
    const d = Math.hypot(hero.x - p.x, hero.y - p.y);
    if (d < 90 && d < nearestD) { nearest = p; nearestD = d; }
  }
  if (!nearest) { _tooltipCurrent = null; return; }
  const r = nearest.relic;
  const isAltar = nearest.hpCost > 0;
  const rerollable = !isAltar && pedestals.filter(p => !p.picked && p.hpCost === 0).length >= 2;
  // Match main.js's reroll cost formula (30 + floor*15) — see the
  // pacing rationale at the keydown handler in main.js.
  const rerollCost = 30 + (opts.floorLevel || 1) * 15;
  const canReroll = rerollable && (opts.gold || 0) >= rerollCost;

  // Fade-in — restart when the hovered pedestal changes.
  const now = (typeof performance !== 'undefined') ? performance.now() : 0;
  if (_tooltipCurrent !== nearest) {
    _tooltipCurrent = nearest;
    _tooltipSince = now;
  }
  const fadeIn = Math.min(1, (now - _tooltipSince) / 180);   // 180 ms
  // Subtle rise: start 4px below target, settle at target.
  const riseOffset = (1 - fadeIn) * 4;

  ctx.save();
  ctx.globalAlpha = fadeIn;

  const tier = (r.tier || 'common').toUpperCase();   // 'COMMON' | 'RARE' | 'LEGENDARY' | 'MYTHIC'
  // Tier shape glyphs (a11y review P0). Hue alone (gold/cream/pink-white)
  // collapses for protanopia/deuteranopia/tritanopia players. Always-on
  // glyph prefix differentiates tiers by SHAPE: ◇ common, ◆ rare, ★
  // legendary, ✦ mythic. Cheap; works for everyone, including players
  // with no color-blindness who get an extra at-a-glance signal.
  const tierGlyph = tier === 'MYTHIC' ? '✦ '
                  : tier === 'LEGENDARY' ? '★ '
                  : tier === 'RARE' ? '◆ '
                  : '◇ ';
  const tierText = isAltar ? '☠ ALTAR' : (tierGlyph + tier + ' RELIC');
  const tierColor = isAltar ? '#ff8a9a'
                  : tier === 'MYTHIC'    ? '#fff2e0'
                  : tier === 'LEGENDARY' ? '#c8a0ff'
                  : tier === 'RARE'      ? '#f4d9a0'
                  : '#b8c8d8';             // common: cool neutral

  // Floating card spec (Option C — Pattern 2 from the genre survey).
  // Was a 520-px center-bottom banner that ate ~30% of the canvas
  // during the hover decision. Now a 320-px card that floats next to
  // the hovered pedestal, like Dead Cells / Diablo / Path of Exile.
  // The card width is fixed; height grows with content.
  const ICON_SIZE = 64;
  const PAD_X = 12;
  const PAD_Y = 10;
  const ICON_GUTTER = 12;
  const boxW = Math.min(320, w - 32);
  // Text column: box minus icon column (12 padding + 64 icon + 12 gutter)
  // and right padding (12). Total fixed margin = 100. For boxW=320 that
  // leaves 220 px of text width.
  const textColW = boxW - PAD_X - ICON_SIZE - ICON_GUTTER - PAD_X;
  ctx.font = 'italic 11px Georgia, serif';
  const flavorLines = r.flavor ? wrapText(ctx, r.flavor, textColW) : [];
  ctx.font = 'bold 12px Georgia, serif';
  const descLines = wrapText(ctx, r.desc || '', textColW);
  const flavorH = flavorLines.length * 14;
  const descH = descLines.length * 14;
  const extraH = rerollable ? 20 : 0;
  // Trap-pick warnings — match the Hollow+BLOOD pattern for any memory
  // that voids a relic's mechanic. Currently two memories silently kill
  // entire relic clusters:
  //   memoryHollow → BLOOD theme (lifesteal voided, all 13 relics affected)
  //   memoryStillness → dodge-keyed relics (Space disabled, dodge-window
  //     and dodge-trigger relics are dead picks)
  const isBloodTrap = !!hero.memoryHollow && RELIC_THEMES[r.id] === 'blood';
  // Dodge-keyed set — relics whose effect requires the dodge button. Stone
  // disables dodge entirely, so these become inert. Listed explicitly
  // rather than read from a flag so the warning fires only on real
  // dodge-window relics, not "i happen to gain a thing on dodge."
  const DODGE_KEYED = new Set([
    'whisper_veil', 'flicker_step', 'temporal_eye', 'wanderers_cloak',
    'dash_master', 'thunder_step', 'second_wind', 'gale_step',
    'nimble_step', 'oathshield',
  ]);
  const isStillnessTrap = !!hero.memoryStillness && DODGE_KEYED.has(r.id);
  const warningH = (isBloodTrap || isStillnessTrap) ? 18 : 0;
  // Box height: tier (18) + name (22) + flavor lines + 6 gap + desc
  // lines + 12 bottom padding + reroll-hint extra + altar extra + warning.
  let boxH = 18 + 22 + flavorH + (flavorH ? 6 : 0) + descH + 12 + extraH + (isAltar ? 18 : 0) + warningH;
  if (boxH < 76) boxH = 76;      // floor for layout stability

  // ── ANCHOR: float next to the hovered pedestal in screen space ──────
  // Convert pedestal world position to screen, then place the card to
  // the RIGHT by default. Edge-clamp by flipping LEFT if right would
  // clip; fall back to ABOVE if both sides clip (pedestal near corner).
  // GAP is the horizontal distance from pedestal-center to card-edge.
  // The pedestal sprite is bottom-anchored ~16-20 px above its center,
  // so we anchor against (px, py - 20) so the card sits at "head" level.
  const GAP = 36;
  const EDGE_PAD = 12;
  const ped = worldToScreen(nearest.x, nearest.y - 20);
  let bx, by;
  let cardSide = 'right';     // for the connector line below
  if (ped.x + GAP + boxW <= w - EDGE_PAD) {
    // Right side fits — preferred placement.
    bx = ped.x + GAP;
    by = ped.y - boxH / 2;
  } else if (ped.x - GAP - boxW >= EDGE_PAD) {
    // Right would clip; flip to left.
    bx = ped.x - GAP - boxW;
    by = ped.y - boxH / 2;
    cardSide = 'left';
  } else {
    // Both sides clip — place ABOVE the pedestal, horizontally
    // clamped within the canvas.
    bx = Math.max(EDGE_PAD, Math.min(w - boxW - EDGE_PAD, ped.x - boxW / 2));
    by = ped.y - boxH - 50;
    cardSide = 'above';
  }
  // Vertical clamp — card must stay on canvas.
  by = Math.max(EDGE_PAD, Math.min(h - boxH - EDGE_PAD, by));
  // Apply the entry rise offset (slide up 4 px during fade-in).
  by += riseOffset;
  const frameColor = isAltar ? '#ff6080' : (r.tint || '#ffffff');

  // Connector line — thin tinted rule from card edge to pedestal.
  // Reads as "this card describes THAT thing" (Diablo / Slay the Spire
  // pattern). Skipped on the 'above' fallback because the card is
  // already sitting close to the pedestal vertically.
  if (cardSide !== 'above') {
    const cardEdgeX = cardSide === 'right' ? bx : bx + boxW;
    const pedEdgeX = ped.x;
    const lineY = Math.max(by + 16, Math.min(by + boxH - 16, ped.y));
    ctx.save();
    ctx.strokeStyle = frameColor;
    ctx.globalAlpha = 0.5 * fadeIn;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cardEdgeX, lineY);
    ctx.lineTo(pedEdgeX, lineY);
    ctx.stroke();
    ctx.restore();
  }

  // Outer tint-colored glow
  const glow = ctx.createRadialGradient(bx + boxW / 2, by + boxH / 2, boxW * 0.15,
                                         bx + boxW / 2, by + boxH / 2, boxW * 0.7);
  glow.addColorStop(0, frameColor + '22');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(bx - 30, by - 24, boxW + 60, boxH + 48);

  // Body — vertical gradient. Smaller card drops the chrome that the
  // 520-px banner version had (inner gold border + corner brackets) —
  // those decorative ornaments clutter a 320-px card. Single tint
  // border carries the frame.
  const bg = ctx.createLinearGradient(0, by, 0, by + boxH);
  bg.addColorStop(0, 'rgba(18, 10, 22, 0.94)');
  bg.addColorStop(1, 'rgba(8, 4, 12, 0.94)');
  ctx.fillStyle = bg;
  ctx.fillRect(bx, by, boxW, boxH);
  ctx.strokeStyle = frameColor;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bx + 0.5, by + 0.5, boxW - 1, boxH - 1);

  // ICON INSET — the relic's painted art on the left side of the box.
  // Audit / user feedback: previously iconSize = boxH - 20, so the
  // icon GREW with text height. Long-desc relics ended up with huge
  // 90+ px icons; short-desc relics got tiny 56 px ones — same banner
  // family, no visual consistency. Cap the icon at a fixed 64 px and
  // center it vertically when boxH is taller than icon+padding.
  // Also: relic icons are circular (shields, vials, gems), but the
  // frame was a square — visible dead space around the circular icon.
  // Frame is now a circle that traces the icon outline.
  const iconSize = Math.min(ICON_SIZE, boxH - 20);
  const iconX = bx + PAD_X;
  const iconY = by + Math.round((boxH - iconSize) / 2);
  const iconImg = images[r.icon];
  const iconCx = iconX + iconSize / 2;
  const iconCy = iconY + iconSize / 2;
  const iconR = iconSize / 2;
  // Slot backdrop — circular dark fill
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.beginPath();
  ctx.arc(iconCx, iconCy, iconR, 0, Math.PI * 2);
  ctx.fill();
  // Tinted frame — circular border tracing the icon outline
  ctx.strokeStyle = frameColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(iconCx, iconCy, iconR - 0.5, 0, Math.PI * 2);
  ctx.stroke();
  if (iconImg) {
    drawRelicIcon(ctx, iconImg, null, null, r.id,
                  iconX + 3, iconY + 3, iconSize - 6);
  }

  // TEXT COLUMN — left-aligned, starts right of the icon. The narrow
  // 320-px card doesn't have room for centered text in a 220-px column
  // (everything would feel cramped against the borders). Left-align
  // for clean reading flow.
  const textX = iconX + iconSize + ICON_GUTTER;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  // Tier badge — small italic caps
  ctx.fillStyle = tierColor;
  ctx.font = 'italic bold 9.5px Georgia, serif';
  ctx.fillText(tierText, textX, by + PAD_Y);

  // Name
  ctx.fillStyle = r.tint || '#ffffff';
  ctx.font = 'bold 15px Georgia, serif';
  ctx.fillText(r.name, textX, by + PAD_Y + 12);

  // Flavor (italic) — wrapped lines
  let cursorY = by + PAD_Y + 32;
  if (flavorLines.length) {
    ctx.fillStyle = 'rgba(200, 190, 210, 0.75)';
    ctx.font = 'italic 11px Georgia, serif';
    for (let k = 0; k < flavorLines.length; k++) {
      ctx.fillText(flavorLines[k], textX, cursorY + k * 14);
    }
    cursorY += flavorLines.length * 14 + 4;
  }
  // Desc (mechanic)
  ctx.fillStyle = r.tint || '#f4d9a0';
  ctx.font = 'bold 12px Georgia, serif';
  for (let k = 0; k < descLines.length; k++) {
    ctx.fillText(descLines[k], textX, cursorY + k * 14);
  }
  cursorY += descLines.length * 14 + 2;

  if (isAltar) {
    ctx.fillStyle = '#ff7a8e';
    ctx.font = 'bold 12px Georgia, serif';
    ctx.fillText('\u2014 ' + nearest.hpCost + ' HP \u2014', textX, cursorY + 4);
  }
  if (isBloodTrap) {
    // Render BEFORE reroll hint, AFTER desc. Crimson italic so it reads
    // as a warning without competing with the gold accent palette.
    ctx.fillStyle = '#ff7a7a';
    ctx.font = 'italic bold 11px Georgia, serif';
    ctx.fillText('\u26a0  Hollow voids the lifesteal', textX, cursorY + 4);
    cursorY += 16;
  }
  if (isStillnessTrap) {
    ctx.fillStyle = '#ff7a7a';
    ctx.font = 'italic bold 11px Georgia, serif';
    ctx.fillText('\u26a0  Stillness disables this dodge effect', textX, cursorY + 4);
    cursorY += 16;
  }
  if (rerollable) {
    // Reroll hint — bumped from 11px sans @ 50%-alpha-when-affordable
    // to 13px italic-bold serif @ 0.95 alpha. The most agency-laden
    // line on the hover card (it's a real choice the player can make)
    // was previously the hardest to read; the new weight matches the
    // relic name + desc above so the option doesn't get tuned out.
    ctx.fillStyle = canReroll ? '#ffd68a' : 'rgba(180, 140, 100, 0.55)';
    ctx.font = 'italic bold 13px Georgia, serif';
    ctx.globalAlpha = canReroll ? 0.95 : 0.6;
    // globalAlpha mutation is scoped by drawPedestalTooltip's outer
    // ctx.save() / ctx.restore() pair, so callers downstream are not
    // affected.
    const hintY = by + boxH - 14;
    ctx.fillText(`\u27F3 Press R to reroll \u00b7 ${rerollCost}g`, textX, hintY);
  }

  ctx.textAlign = 'left';
  ctx.restore();
}
