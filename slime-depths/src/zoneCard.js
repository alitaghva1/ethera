// ============================================================================
// ZONE CARD — full-screen cinematic intro shown when entering each zone.
//
// Phase 6 polish layer. Renders a brief (1.6s) freeze with:
//   • Roman numeral + zone name (e.g. "I — ANCIENT RUINS")
//   • Flavor line (e.g. "weathered stone remembers the gods")
//   • Letterbox bars top + bottom
// Per-zone color tinting matches the zone's canonical wash from zones.js.
//
// Distinct from `floorCardRender.js` which is keyed on currentFloorLevel
// (legacy DAG flow). This card is keyed on zoneName.
//
// Caller invokes openZoneCard(zoneName) at zone-enter; gameplay tick
// gates on isZoneCardActive() to freeze the world during the cinematic.
// ============================================================================

const ZONE_CARDS = Object.freeze({
  ruins: {
    roman: 'I',
    name: 'ANCIENT RUINS',
    flavor: 'weathered stone remembers the gods',
    color: '#ddc890',     // warm pale yellow (matches zones.js wash)
  },
  cemetery: {
    roman: 'II',
    name: 'THE CEMETERY',
    flavor: 'the dead refuse to stay buried',
    color: '#a85a3a',     // dusky orange-red
  },
  crypt: {
    roman: 'III',
    name: 'THE CRYPT',
    flavor: 'old kings and the bones that obey them',
    color: '#e8a060',     // torch-orange
  },
  mountain: {
    roman: 'IV',
    name: 'DEPTHS OF THE MOUNTAIN',
    flavor: 'something laid claim to the throne',
    color: '#7ab0d8',     // cool blue
  },
  volcano: {
    roman: 'V',
    name: 'THE VOLCANO',
    flavor: 'flame at the heart of the world',
    color: '#ff7030',     // hot orange
  },
});

const CARD_DURATION = 1.8;       // seconds — total visible time
const FADE_IN  = 0.32;
const FADE_OUT = 0.55;

let _active = false;
let _t = 0;                       // elapsed seconds since open
let _zone = null;

export function openZoneCard(zoneName) {
  if (!ZONE_CARDS[zoneName]) return false;
  _active = true;
  _t = 0;
  _zone = zoneName;
  return true;
}

export function isZoneCardActive() { return _active; }

export function updateZoneCard(dt) {
  if (!_active) return;
  _t += dt;
  if (_t >= CARD_DURATION) {
    _active = false;
    _zone = null;
  }
}

export function drawZoneCard(ctx, viewW, viewH) {
  if (!_active || !_zone) return;
  const card = ZONE_CARDS[_zone];
  if (!card) return;

  // Alpha envelope: fade-in 0..FADE_IN, full middle, fade-out at end.
  let alpha;
  if (_t < FADE_IN) alpha = _t / FADE_IN;
  else if (_t > CARD_DURATION - FADE_OUT) alpha = (CARD_DURATION - _t) / FADE_OUT;
  else alpha = 1;
  alpha = Math.max(0, Math.min(1, alpha));

  ctx.save();

  // Backdrop dim
  ctx.fillStyle = `rgba(8, 6, 14, ${0.78 * alpha})`;
  ctx.fillRect(0, 0, viewW, viewH);

  // Letterbox bars (top + bottom)
  const barH = Math.min(80, viewH * 0.12);
  ctx.fillStyle = `rgba(2, 1, 4, ${0.95 * alpha})`;
  ctx.fillRect(0, 0, viewW, barH);
  ctx.fillRect(0, viewH - barH, viewW, barH);

  // Center thin gold rule above + below the title for elegance
  const cx = viewW / 2;
  const cy = viewH / 2;
  const ruleY1 = cy - 56;
  const ruleY2 = cy + 56;
  const ruleW = 240;
  ctx.fillStyle = `rgba(245, 220, 170, ${0.45 * alpha})`;
  ctx.fillRect(cx - ruleW / 2, ruleY1, ruleW, 1);
  ctx.fillRect(cx - ruleW / 2, ruleY2, ruleW, 1);

  // Small Roman numeral above
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = `rgba(245, 220, 170, ${0.85 * alpha})`;
  ctx.font = 'italic 18px Georgia,serif';
  ctx.fillText(card.roman, cx, cy - 36);

  // Big zone name
  ctx.fillStyle = `rgba(255, 240, 200, ${alpha})`;
  ctx.font = 'bold 38px Georgia,serif';
  // Tinted shadow for "this zone is X" feel
  ctx.shadowColor = card.color + 'cc';
  ctx.shadowBlur = 18;
  ctx.fillText(card.name, cx, cy);
  ctx.shadowBlur = 0;

  // Flavor line below
  ctx.fillStyle = `rgba(220, 200, 160, ${0.8 * alpha})`;
  ctx.font = 'italic 14px Georgia,serif';
  ctx.fillText(card.flavor, cx, cy + 36);

  ctx.restore();
}

/** Force-clear (death / hamlet return). */
export function clearZoneCard() {
  _active = false;
  _t = 0;
  _zone = null;
}
