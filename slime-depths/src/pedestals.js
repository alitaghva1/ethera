// Relic pedestals — physical pickup points that spawn after combat clears.
// Walking onto one grants the relic + removes the rest.
import { images } from './loader.js';
import { applyRelic, rollRelicOffer, relicTier, getRelicGlyph } from './relics.js';
import { drawRelicIcon } from './fx.js';
import { playSfx } from './sfx.js';
import { deathBurst, sparkle } from './particles.js';
import { shakeCamera } from './camera.js';
import { hero } from './hero.js';
import { TILE, ROOM_W, ROOM_H, room } from './room.js';
import { synthChord, synthPing } from './synth.js';
import { isCursed } from './curses.js';

export const pedestals = [];
let lastPickedDef = null;      // for flash-text UI feedback
let pickedFlashTime = 0;

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
        if (nx < 2 || nx >= ROOM_W - 2 || ny < 2 || ny >= ROOM_H - 2) continue;
        if (tileIsClear(nx, ny)) return { x: nx, y: ny };
      }
    }
  }
  // Fallback: row 4 scanning left-to-right
  for (let x = 2; x < ROOM_W - 2; x++) {
    if (tileIsClear(x, py)) return { x, y: py };
  }
  // Last resort
  return { x: px, y: py };
}

// Spawn 3 relic pedestals laid out across the north side of the room.
// Pedestals shift to nearby clear tiles if pillars block the preferred cells.
export function spawnRelicOffer(floorLevel = 1) {
  pedestals.length = 0;
  const offers = rollRelicOffer(3, floorLevel);
  if (offers.length === 0) return;
  const cols = [6, 10, 14];
  const row = 4;
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
// Curse: Starving — altar HP cost x2.
export function spawnAltarOffer(hpCost = 3) {
  pedestals.length = 0;
  const offers = rollRelicOffer(2);
  if (offers.length === 0) return;
  const effectiveCost = isCursed('starving') ? hpCost * 2 : hpCost;
  const cols = [7, 12];
  const row = 7;
  for (let i = 0; i < offers.length; i++) {
    const spot = findClearTile(cols[i], row);
    pedestals.push({
      x: spot.x * TILE + TILE/2,
      y: spot.y * TILE + TILE/2,
      relic: offers[i],
      picked: false,
      bob: Math.random() * Math.PI * 2,
      glow: 0,
      hpCost: effectiveCost,
    });
  }
}

export function clearPedestals() {
  pedestals.length = 0;
  lastPickedDef = null;
  pickedFlashTime = 0;
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
      const rate = tier === 'legendary' ? 8 : tier === 'rare' ? 3 : 0.8;
      const threshold = Math.min(0.95, rate * dt);
      if (Math.random() < threshold) {
        const color = p.relic?.tint || (tier === 'legendary' ? '#ffc8ff' : tier === 'rare' ? '#f4d9a0' : '#c0b0d0');
        sparkle(p.x + (Math.random() - 0.5) * 22, p.y - 6 + (Math.random() - 0.5) * 18, color);
      }
    }
  }
  let picked = null;
  for (const p of pedestals) {
    if (p.picked) continue;
    const d = Math.hypot(hero.x - p.x, hero.y - p.y);
    if (d < 26) {
      // Altar pedestals cost HP. Refuse if hero would die from the trade.
      if (p.hpCost > 0) {
        if (hero.hp <= p.hpCost) continue;    // won't commit suicide; must approach with more HP
        hero.hp -= p.hpCost;
      }
      p.picked = true;
      picked = p.relic;
      applyRelic(p.relic.id);
      deathBurst(p.x, p.y - 20, p.relic.tint || '#ffffff');
      shakeCamera(p.hpCost > 0 ? 6 : 3, 0.15);
      playSfx('click', { volume: 0.9, rate: p.hpCost > 0 ? 0.8 : 1.2 });
      lastPickedDef = p.relic;
      pickedFlashTime = 3.0;
      // Tier-appropriate sting
      const t = p.tier || 'common';
      if (t === 'legendary') synthChord(880, 1.0, 1.0);      // high-pitched triumphant
      else if (t === 'rare') synthChord(659, 0.9, 0.75);     // mid
      else synthPing(1100, 0.9, 0.3);                         // quick common ping
      break;
    }
  }
  if (picked) {
    for (const p of pedestals) p.picked = true;
  }
  return picked;
}

export function drawPedestals(ctx) {
  const now = performance.now() / 1000;
  for (const p of pedestals) {
    if (p.picked) continue;
    const y = p.y + Math.sin(p.bob) * 3;
    const isAltar = p.hpCost > 0;
    const tier = p.tier || 'common';

    // RARITY VISUAL: rare = bright gold pulse; legendary = shimmering prismatic ring
    if (tier === 'rare' || tier === 'legendary') {
      const pulseAmp = tier === 'legendary' ? 0.55 : 0.35;
      const pulse = 0.7 + pulseAmp * Math.sin(now * 3 + p.bob);
      const ringR = (tier === 'legendary' ? 44 : 34) + (pulse * 6);
      // Outer shimmer ring
      const ringColor = tier === 'legendary' ? '#ffc8ff' : '#f4d9a0';
      ctx.strokeStyle = ringColor;
      ctx.globalAlpha = pulse;
      ctx.lineWidth = tier === 'legendary' ? 3 : 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y + 4, ringR, 0, Math.PI * 2);
      ctx.stroke();
      // Legendary gets a secondary counter-rotating ring
      if (tier === 'legendary') {
        ctx.strokeStyle = '#a0e8ff';
        ctx.globalAlpha = pulse * 0.6;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y + 4, ringR + 6, 0, Math.PI * 2);
        ctx.stroke();
        // 4 rotating rune points around the pedestal
        ctx.fillStyle = '#ffffff';
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + now * 1.3;
          const rx = p.x + Math.cos(a) * (ringR + 10);
          const ry = (p.y + 4) + Math.sin(a) * (ringR + 10);
          ctx.globalAlpha = pulse * 0.9;
          ctx.fillRect(rx - 1.5, ry - 1.5, 3, 3);
        }
      }
      ctx.globalAlpha = 1;
    }

    // Glow ring on floor — red if HP-cost altar pedestal, relic-tinted otherwise
    const glowR = 26 + p.glow * 12 + (tier === 'legendary' ? 12 : tier === 'rare' ? 6 : 0);
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
    const beamHeight = tier === 'legendary' ? 120 : tier === 'rare' ? 90 : 60;
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
    const beamTopW = 10 + (tier === 'legendary' ? 6 : tier === 'rare' ? 3 : 0);
    const beamBotW = 24 + (tier === 'legendary' ? 10 : tier === 'rare' ? 5 : 0);
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

    // Tier label above icon (rare/legendary only) — tracks the floating icon
    if (tier === 'rare' || tier === 'legendary') {
      const label = tier === 'legendary' ? 'LEGENDARY' : 'RARE';
      const labelColor = tier === 'legendary' ? '#ffc8ff' : '#f4d9a0';
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(p.x - 40, floatY - 24, 80, 12);
      ctx.fillStyle = labelColor;
      ctx.font = 'bold 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, p.x, floatY - 18);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }

    // HP cost label above icon for altar pedestals — tracks floating icon
    if (isAltar) {
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(p.x - 18, floatY - 30, 36, 14);
      ctx.fillStyle = '#ff7a8e';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('-' + p.hpCost + ' HP', p.x, floatY - 23);
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
  const life = 3.0;
  const r = 1 - (pickedFlashTime / life);        // 0 → 1
  let a;
  if (r < 0.1) a = r / 0.1;
  else if (r > 0.75) a = (1 - r) / 0.25;
  else a = 1;
  a = Math.max(0, Math.min(1, a));
  const scaleBump = r < 0.2 ? 1 + Math.sin((r / 0.2) * Math.PI) * 0.1 : 1;
  const tier = lastPickedDef.tier || 'common';
  // Tier palette — common stays muted bronze (was cool grey), rare gold,
  // legendary magenta. Banner's visual weight scales with tier.
  const tierColor = tier === 'legendary' ? '#ffc8ff' : tier === 'rare' ? '#f4d9a0' : '#c9a86a';
  const tierRgb   = tier === 'legendary' ? '255, 200, 255' : tier === 'rare' ? '244, 217, 160' : '201, 168, 106';
  const tierGlyph = tier === 'legendary' ? '\u2605' : tier === 'rare' ? '\u25C6' : '\u2666';
  const tierLabel = tier === 'legendary' ? `${tierGlyph} LEGENDARY ${tierGlyph}` : tier === 'rare' ? `${tierGlyph} RARE ${tierGlyph}` : `${tierGlyph} COMMON ${tierGlyph}`;

  ctx.save();
  ctx.globalAlpha = a;

  const boxW = 480, boxH = 170;
  const bx = (w - boxW) / 2;
  const by = (h - boxH) / 2 - 30;
  const pivotX = bx + boxW / 2, pivotY = by + boxH / 2;
  ctx.translate(pivotX, pivotY);
  ctx.scale(scaleBump, scaleBump);
  ctx.translate(-pivotX, -pivotY);

  // Tier-colored radial halo behind the frame — pulsing on all tiers, stronger
  // on rare/legendary. Creates the "lit from behind" gift feeling.
  const pulseT = performance.now() / (tier === 'legendary' ? 320 : 420);
  const pulse = 0.6 + 0.4 * Math.sin(pulseT);
  const glowA = (r < 0.5 ? 1 : (1 - r) * 2) * pulse;
  if (glowA > 0.05) {
    const glow = ctx.createRadialGradient(pivotX, pivotY, 40, pivotX, pivotY, boxW * 0.85);
    const glowStrength = tier === 'legendary' ? 0.55 : tier === 'rare' ? 0.45 : 0.3;
    glow.addColorStop(0, `rgba(${tierRgb}, ${(glowA * glowStrength).toFixed(3)})`);
    glow.addColorStop(1, `rgba(${tierRgb}, 0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(bx - 120, by - 80, boxW + 240, boxH + 160);
  }

  // Frame — tome-style vertical gradient
  const frameG = ctx.createLinearGradient(bx, by, bx, by + boxH);
  frameG.addColorStop(0, 'rgba(30, 22, 28, 0.96)');
  frameG.addColorStop(1, 'rgba(12, 8, 14, 0.96)');
  ctx.fillStyle = frameG;
  ctx.fillRect(bx, by, boxW, boxH);

  // Tier-colored border — thickness scales, legendary pulses slightly
  const borderWidth = tier === 'legendary' ? 2 + pulse * 0.6 : tier === 'rare' ? 1.8 : 1.5;
  ctx.strokeStyle = tierColor;
  ctx.lineWidth = borderWidth;
  ctx.strokeRect(bx + 0.5, by + 0.5, boxW - 1, boxH - 1);

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

  // "— RELIC ACQUIRED —" header — italic Georgia (unified grammar)
  ctx.fillStyle = '#c9a86a';
  ctx.font = 'italic bold 10px Georgia, serif';
  ctx.fillText('\u2014 RELIC ACQUIRED \u2014', pivotX, by + 42);

  // Big relic name — shadowed glow in tier color
  ctx.shadowColor = tierColor;
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#fff2e0';
  ctx.font = 'bold 30px Georgia, serif';
  ctx.fillText(lastPickedDef.name, pivotX, by + 58);
  ctx.shadowBlur = 0;

  // Flavor line in quotes
  if (lastPickedDef.flavor) {
    ctx.fillStyle = 'rgba(210, 200, 220, 0.82)';
    ctx.font = 'italic 12px Georgia, serif';
    ctx.fillText('\u201C' + lastPickedDef.flavor + '\u201D', pivotX, by + 100);
  }

  // Central-diamond divider — hairline with a small diamond at midpoint
  ctx.globalAlpha = a * 0.65;
  const divY = by + 122;
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

  // Mechanic description — tier-tinted bold
  ctx.fillStyle = tierColor;
  ctx.font = 'bold 15px Georgia, serif';
  ctx.fillText(lastPickedDef.desc, pivotX, by + 132);

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

// Hover tooltip — shown when hero is near a pedestal (before picking it)
export function drawPedestalTooltip(ctx, w, h, opts = {}) {
  let nearest = null;
  let nearestD = Infinity;
  for (const p of pedestals) {
    if (p.picked) continue;
    const d = Math.hypot(hero.x - p.x, hero.y - p.y);
    if (d < 90 && d < nearestD) { nearest = p; nearestD = d; }
  }
  if (!nearest) return;
  const r = nearest.relic;
  const isAltar = nearest.hpCost > 0;
  // Is this the multi-offer pedestal (rerollable)?
  const rerollable = !isAltar && pedestals.filter(p => !p.picked && p.hpCost === 0).length >= 2;
  const rerollCost = 15 + (opts.floorLevel || 1) * 5;
  const canReroll = rerollable && (opts.gold || 0) >= rerollCost;
  ctx.save();
  const extraH = rerollable ? 20 : 0;
  const boxW = 340, boxH = (isAltar ? 82 : 64) + extraH;
  const bx = (w - boxW) / 2;
  const by = h - (isAltar ? 190 : 170) - extraH;
  const frameColor = isAltar ? '#ff6080' : (r.tint || '#ffffff');
  // Outer tint-colored glow — subtle drop-shadow read that something is interactable
  const glow = ctx.createRadialGradient(bx + boxW / 2, by + boxH / 2, boxW * 0.15,
                                         bx + boxW / 2, by + boxH / 2, boxW * 0.7);
  glow.addColorStop(0, frameColor + '22');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(bx - 30, by - 24, boxW + 60, boxH + 48);
  // Vertical tome-style gradient for the body
  const bg = ctx.createLinearGradient(0, by, 0, by + boxH);
  bg.addColorStop(0, 'rgba(18, 10, 22, 0.92)');
  bg.addColorStop(1, 'rgba(8, 4, 12, 0.92)');
  ctx.fillStyle = bg;
  ctx.fillRect(bx, by, boxW, boxH);
  ctx.strokeStyle = frameColor;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bx + 0.5, by + 0.5, boxW - 1, boxH - 1);
  // Gold inner accent stripe
  ctx.strokeStyle = 'rgba(201, 168, 106, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 4.5, by + 4.5, boxW - 9, boxH - 9);
  // Tiny corner accents — small bracket marks on each corner
  ctx.fillStyle = frameColor;
  const cornerAccents = [
    [bx + 2, by + 2, 1],          // top-left (dx=+1, dy=+1)
    [bx + boxW - 2, by + 2, -1],  // top-right (dx=-1, dy=+1)
    [bx + 2, by + boxH - 2, 1],          // bottom-left
    [bx + boxW - 2, by + boxH - 2, -1],  // bottom-right
  ];
  for (const [cx, cy, dx] of cornerAccents) {
    ctx.fillRect(cx + (dx === 1 ? 0 : -3), cy, 4, 1);
    ctx.fillRect(cx, cy + (cy === by + 2 ? 0 : -3), 1, 4);
  }
  // Name
  ctx.fillStyle = r.tint || '#ffffff';
  ctx.font = 'bold 17px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(r.name, bx + boxW / 2, by + 22);
  // Flavor (italic, grey) — lore first, mechanic second
  if (r.flavor) {
    ctx.fillStyle = 'rgba(200, 190, 210, 0.7)';
    ctx.font = 'italic 11px Georgia, serif';
    ctx.fillText(r.flavor, bx + boxW / 2, by + 38);
  }
  // Desc (mechanic) — brighter, bolder so player can quickly see what it does
  ctx.fillStyle = r.tint || '#f4d9a0';
  ctx.font = 'bold 12px Georgia, serif';
  ctx.fillText(r.desc, bx + boxW / 2, by + (r.flavor ? 54 : 42));
  if (isAltar) {
    ctx.fillStyle = '#ff7a8e';
    ctx.font = 'bold 12px Georgia, serif';
    ctx.fillText('\u2014 ' + nearest.hpCost + ' HP \u2014', bx + boxW / 2, by + (r.flavor ? 72 : 64));
  }
  // Reroll hint
  if (rerollable) {
    ctx.fillStyle = canReroll ? '#ffd68a' : 'rgba(180, 140, 100, 0.5)';
    ctx.font = 'bold 11px system-ui, sans-serif';
    const hintY = by + boxH - 14;
    ctx.fillText(`\u27F3 Press R to reroll \u00b7 ${rerollCost}g`, bx + boxW / 2, hintY);
  }
  ctx.textAlign = 'left';
  ctx.restore();
}
