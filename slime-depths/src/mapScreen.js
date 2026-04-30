// ============================================================================
// FLOOR MAP SCREEN — branching DAG path selection
//
// Redesign pass: the graph is now rendered inside a CENTERED CARD with ornate
// gold framing, rather than floating in the overlay's full-screen void. This
// contains the composition so lone-node layers (SANCTUARY, BOSS) no longer
// feel stranded. Straight-line edges became gentle bezier curves that read
// as "paths between rooms" instead of "chart lines." Node kinds now have
// subtly-distinct visuals (ring style, glow, pulse) so COMBAT vs ELITE vs
// EVENT vs SANCTUARY vs BOSS is legible at a glance without reading labels.
//
// Public API unchanged:
//   openFloorMap(graph, currentNodeId) -> Promise<nodeId>
//   closeFloorMap()
// ============================================================================

// Card is the framed region the graph lives in. Sized to fit within the
// 1280x720 game canvas with healthy breathing room above/below.
const CARD_W = 780;
const CARD_H = 620;
// Graph area inside the card — reserves top for title, bottom for hint.
// Generous bottom pad so START's label clears the hint text cleanly.
const GRAPH_TOP_PAD = 112;   // below "FLOOR MAP" title
const GRAPH_BOT_PAD = 112;   // above "click a glowing node" hint

// Glyphs per node kind. Single unicode char drawn inside a circular badge
// so we don't need sprite art for the map.
const NODE_GLYPHS = {
  start:     '\u25C7', // ◇ diamond outline
  combat:    '\u2694', // ⚔ crossed swords
  elite:     '\u2620', // ☠ skull
  event:     '\u2726', // ✦ star
  sanctuary: '\u271A', // ✚ cross
  boss:      '\u265B', // ♛ queen/crown
};

// Round-7 — resolved sub-kinds for event nodes (altar / trove / chestroom /
// challenge / miniboss). When a node's actualKind is one of these, the map
// reads through these tables instead of the generic 'event' entry above.
// Kept as separate consts because the original NODE_GLYPHS uses \uXXXX
// escapes for cross-platform safety; mixing literals into the existing
// table caused encoding mismatches at file-write time.
const SUBKIND_GLYPHS = {
  altar:     '⛧', // flame-altar (occult symbol)
  trove:     '◈', // gem
  chestroom: '⊞', // chest (squared plus)
  challenge: '⚐', // flag
  miniboss:  '♜', // rook
  shop:      '⚖', // scales — merchant
};
const SUBKIND_LABELS = {
  altar:     'ALTAR',
  trove:     'TROVE',
  chestroom: 'CHEST',
  challenge: 'CHALLENGE',
  miniboss:  'MINI-BOSS',
  shop:      'SHOP',
};
const SUBKIND_COLORS = {
  altar:     '#ff6a85',
  trove:     '#f4d9a0',
  chestroom: '#ffd680',
  challenge: '#ffb265',
  miniboss:  '#e07070',
  shop:      '#86e3a8',
};

// Per-kind accent color — legible against the card's dark gradient.
// COMBAT is deliberately muted cream (not gold) so START stays the one
// gold node on the map — anchors read as special, combats as routine.
const NODE_COLORS = {
  start:     '#f4d9a0',
  combat:    '#c8b894',
  elite:     '#e07070',
  event:     '#c8a0ff',
  sanctuary: '#86e3a8',
  boss:      '#ff9a55',
};

const NODE_LABELS = {
  start:     'START',
  combat:    'COMBAT',
  elite:     'ELITE',
  event:     'EVENT',
  sanctuary: 'SANCTUARY',
  boss:      'BOSS',
};

let _mapEl = null;
let _currentPickResolve = null;

// ============================================================================
// LAYOUT
// ============================================================================

// Compute node screen positions INSIDE the card (not canvas-space).
// Layer 0 (start) at bottom, layer maxLayer (boss) at top. Nodes in a layer
// are centered horizontally with a bounded spread.
function computeLayout(graph) {
  const layers = {};
  for (const n of graph.nodes) {
    if (!layers[n.layer]) layers[n.layer] = [];
    layers[n.layer].push(n);
  }
  const maxLayer = graph.maxLayer;
  const graphH = CARD_H - GRAPH_TOP_PAD - GRAPH_BOT_PAD;
  const layerGap = graphH / Math.max(1, maxLayer);
  const pos = new Map();
  for (const layerStr in layers) {
    const layer = parseInt(layerStr, 10);
    const layerNodes = layers[layer];
    const y = GRAPH_TOP_PAD + (maxLayer - layer) * layerGap;
    // Spread: 3-node layer stretches wider than 2-node, but capped so even
    // the widest layer doesn't pierce the card's inner padding.
    const maxSpread = CARD_W - 180;        // leaves 90px padding per side
    const naturalSpread = (layerNodes.length - 1) * 160;
    const spread = Math.min(maxSpread, naturalSpread);
    const step = layerNodes.length > 1 ? spread / (layerNodes.length - 1) : 0;
    const startX = CARD_W / 2 - (step * (layerNodes.length - 1)) / 2;
    layerNodes.forEach((n, i) => {
      pos.set(n.id, { x: startX + step * i, y });
    });
  }
  return pos;
}

// ============================================================================
// EDGES — bezier curves between connected nodes
// ============================================================================

function renderSVG(graph, pos, currentNode) {
  const parts = [];
  // Defs: gradient for the subtle spine line, glow filter for active edges.
  parts.push(`
    <defs>
      <linearGradient id="mapSpine" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"  stop-color="#c9a86a" stop-opacity="0.00"/>
        <stop offset="25%" stop-color="#c9a86a" stop-opacity="0.14"/>
        <stop offset="75%" stop-color="#c9a86a" stop-opacity="0.14"/>
        <stop offset="100%" stop-color="#c9a86a" stop-opacity="0.00"/>
      </linearGradient>
      <filter id="mapEdgeGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="1.6" />
      </filter>
    </defs>
  `);

  // Spine — subtle gold axis from START through BOSS. Behind every edge.
  const startNode = graph.nodes.find(n => n.kind === 'start');
  const bossNode  = graph.nodes.find(n => n.kind === 'boss');
  if (startNode && bossNode) {
    const sp = pos.get(startNode.id);
    const bp = pos.get(bossNode.id);
    if (sp && bp) {
      parts.push(`<line x1="${sp.x}" y1="${sp.y}" x2="${bp.x}" y2="${bp.y}"
                        stroke="url(#mapSpine)" stroke-width="1.2"/>`);
    }
  }

  // Edges as bezier curves. Each edge leaves its source vertically and
  // enters its target vertically, giving a gentle S when x differs — reads
  // as "a path between rooms" rather than a chart line.
  for (const n of graph.nodes) {
    const from = pos.get(n.id);
    if (!from) continue;
    for (const eid of n.edges) {
      const to = pos.get(eid);
      if (!to) continue;
      const active = currentNode && n.id === currentNode.id;
      const stroke = active ? '#f4d9a0' : '#5a4a30';
      const width = active ? 2.2 : 1.3;
      const op = n.visited ? 0.35 : active ? 0.95 : 0.85;
      const midY = (from.y + to.y) / 2;
      const d = `M ${from.x} ${from.y} C ${from.x} ${midY} ${to.x} ${midY} ${to.x} ${to.y}`;
      // Active edges get a soft glow underlay for emphasis.
      if (active) {
        parts.push(`<path d="${d}" stroke="${stroke}" stroke-width="${width + 2}"
                    fill="none" opacity="0.35" filter="url(#mapEdgeGlow)"/>`);
      }
      parts.push(`<path d="${d}" stroke="${stroke}" stroke-width="${width}"
                  fill="none" opacity="${op}" stroke-linecap="round"/>`);
    }
  }
  return `<svg width="${CARD_W}" height="${CARD_H}"
               style="position:absolute;inset:0;pointer-events:none;">
            ${parts.join('')}
          </svg>`;
}

// ============================================================================
// NODES — per-kind visual variation (ring, glow, animation)
// ============================================================================

// Small helper: per-kind static style flourishes that survive across states.
function kindStyling(kind, clickable, isCurrent) {
  const base = {
    badgeSize: 44,
    glyphSize: 22,
    wrapperSize: 56,
    ringWidth: 1.5,
    ringStyle: 'solid',
    extraShadow: '',
    extraAnimation: '',
    halo: '',
  };
  const color = NODE_COLORS[kind] || '#c9a86a';

  if (kind === 'start' || kind === 'boss') {
    base.badgeSize = 56;
    base.glyphSize = 26;
    base.wrapperSize = 68;
    base.ringWidth = 1.8;
  }
  if (kind === 'boss') {
    // Subtle ambient glow even before reachable — legible as "the goal."
    base.extraAnimation = 'animation:bossPulse 3.6s ease-in-out infinite;';
  }
  if (kind === 'sanctuary') {
    base.badgeSize = 48;
    base.glyphSize = 24;
    base.wrapperSize = 60;
    base.extraAnimation = 'animation:sanctuaryBreath 3.2s ease-in-out infinite;';
    // Faint outer halo ring to reinforce the heal-room read.
    base.halo = `
      <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
                  width:${base.badgeSize + 14}px;height:${base.badgeSize + 14}px;
                  border-radius:50%;border:1px solid ${color};opacity:0.35;
                  pointer-events:none;"></div>`;
  }
  if (kind === 'elite') {
    base.ringWidth = 2.2;
    base.extraShadow = `box-shadow:0 0 10px ${color}55, inset 0 0 8px ${color}33;`;
  }
  if (kind === 'event') {
    base.ringStyle = 'dashed';
    base.extraAnimation = 'animation:eventShimmer 2.8s ease-in-out infinite;';
  }
  return base;
}

function renderNode(n, p, currentNode) {
  const reachable = currentNode && currentNode.edges.includes(n.id);
  const isCurrent = currentNode && currentNode.id === n.id;
  const clickable = reachable && !n.visited;

  // ASCENSION VII — hidden map node: render as "?" until the player commits
  // to it. Kind-specific flourishes are suppressed for hidden nodes so the
  // player can't plan around them.
  const hidden = n._hidden && !n.visited && !isCurrent;
  // Round-7 — read through actualKind first (the resolved sub-kind for
  // event nodes), falling back to the graph kind. SUBKIND_* tables hold
  // the per-altar/trove/chest/challenge/miniboss visuals.
  const displayKind = n.actualKind || n.kind;
  const color = hidden ? '#8a7a5a'
    : (SUBKIND_COLORS[displayKind] || NODE_COLORS[displayKind] || '#c9a86a');
  const glyph = hidden ? '?'
    : (SUBKIND_GLYPHS[displayKind] || NODE_GLYPHS[displayKind] || '?');
  const s = hidden
    ? { badgeSize: 44, glyphSize: 22, wrapperSize: 56, ringWidth: 1.5,
        ringStyle: 'solid', extraShadow: '', extraAnimation: '', halo: '' }
    : kindStyling(n.kind, clickable, isCurrent);

  const ring = isCurrent ? '#f4d9a0' : clickable ? color : '#3a3020';
  const bgOpacity = isCurrent ? 1.0 : clickable ? 0.95 : n.visited ? 0.32 : 0.62;
  const cursorStyle = clickable ? 'pointer' : 'default';
  // Clickable-pulse wins over kind-specific animation so the player's eye
  // is drawn to actionable nodes first.
  const animation = clickable
    ? 'animation:mapNodePulse 2.2s ease-in-out infinite;'
    : s.extraAnimation;
  const currentGlow = isCurrent ? `box-shadow:0 0 20px ${color}aa, inset 0 0 10px ${color}44;` : '';

  const wrapOffset = s.wrapperSize / 2;

  return `
  <div data-node-id="${n.id}" class="floor-map-node" style="
    position:absolute;left:${p.x - wrapOffset}px;top:${p.y - wrapOffset}px;
    width:${s.wrapperSize}px;height:${s.wrapperSize}px;
    display:flex;align-items:center;justify-content:center;flex-direction:column;gap:3px;
    cursor:${cursorStyle};opacity:${bgOpacity};
    transition:transform 0.18s ease, opacity 0.25s ease;
    ${animation}
  ">
    ${s.halo}
    <div style="
      position:relative;
      width:${s.badgeSize}px;height:${s.badgeSize}px;border-radius:50%;
      background:radial-gradient(circle,rgba(30,22,16,0.92),rgba(12,8,6,0.97));
      border:${s.ringWidth}px ${s.ringStyle} ${ring};
      display:flex;align-items:center;justify-content:center;
      color:${color};font-size:${s.glyphSize}px;line-height:1;
      text-shadow:0 0 10px ${color}aa;
      ${currentGlow || s.extraShadow}
    ">${glyph}</div>
    <div style="
      color:${clickable || isCurrent ? color : '#8a7c5e'};
      font-size:9.5px;letter-spacing:2.2px;font-weight:bold;
      opacity:${clickable || isCurrent ? 0.95 : 0.65};
      font-family:Georgia,serif;text-shadow:0 1px 2px rgba(0,0,0,0.6);
    ">${SUBKIND_LABELS[displayKind] || NODE_LABELS[displayKind] || ''}</div>
    ${hidden ? '' : pathSublabelHtml(n, clickable, isCurrent, color)}
  </div>`;
}

// Sub-label under the node name — telegraphs the path cost/reward so forks
// feel strategic ("I'm picking RISK for RARE+") instead of aesthetic
// ("combat vs combat"). Only shown on elite (perilous) + sanctuary (safe)
// since standard combat/event are the implicit baseline.
function pathSublabelHtml(n, clickable, isCurrent, color) {
  // Round-7 \u2014 sealed nodes render their BLOOD GATE chip first, in
  // crimson, so the HP cost is visible from the M-key map BEFORE
  // committing to that path. Players can plan "do I have enough HP
  // to break this seal AND survive the room?" multiple steps ahead.
  if (n.sealed) {
    const cost = n.sealCost || 1;
    const alive = clickable || isCurrent;
    const alpha = alive ? 0.95 : 0.55;
    return `
      <div style="
        color:${alive ? '#ff8088' : '#7a5050'};
        font-size:7.5px;letter-spacing:1.6px;font-weight:bold;
        opacity:${alpha};margin-top:-1px;
        font-family:Georgia,serif;text-shadow:0 1px 2px rgba(0,0,0,0.6);
      ">SEAL \u00b7 ${cost} HP \u00b7 LEGENDARY</div>`;
  }
  // Non-sealed \u2014 read from the per-node roomReward tag (Phase 1 of the
  // rooms-redesign plan). Was previously hardcoded "RISK \u00b7 RARE+" for
  // every elite, which became stale once roomReward varied per-node;
  // now reads the actual tag. Sanctuaries fall back to "REST" since
  // their roomReward is null by design (kind label "REST" already
  // implies the heal).
  let text = null;
  let chipColor = color;
  if (n.kind === 'sanctuary') text = 'REST';
  else if (n.roomReward) {
    text = REWARD_LABELS[n.roomReward] || n.roomReward.toUpperCase();
    chipColor = REWARD_COLORS[n.roomReward] || color;
  }
  // Phase 3 audit fix #1 — append an affix sub-label for elite nodes
  // with a pre-rolled affix. Sits below the reward chip so the order
  // reads "ELITE / RARE+ / FROST" — kind, then reward, then threat.
  // Players reading the map can plan "I need fire resist for that
  // ember room two layers up" before committing to a fork.
  let affixHtml = '';
  if (n.eliteAffixId) {
    const af = AFFIX_LABELS[n.eliteAffixId];
    if (af) {
      const alive = clickable || isCurrent;
      const alpha = alive ? 0.85 : 0.5;
      affixHtml = `
    <div style="
      color:${alive ? af.color : '#7a6d5e'};
      font-size:7.5px;letter-spacing:1.6px;font-weight:bold;
      opacity:${alpha};margin-top:-1px;
      font-family:Georgia,serif;text-shadow:0 1px 2px rgba(0,0,0,0.6);
    ">${af.label}</div>`;
    }
  }
  if (!text) return affixHtml;
  const alive = clickable || isCurrent;
  const alpha = alive ? 0.85 : 0.5;
  return `
    <div style="
      color:${alive ? chipColor : '#8a7c5e'};
      font-size:7.5px;letter-spacing:1.6px;font-weight:bold;
      opacity:${alpha};margin-top:-1px;
      font-family:Georgia,serif;text-shadow:0 1px 2px rgba(0,0,0,0.6);
    ">${text}</div>${affixHtml}`;
}
// Phase 3 audit fix #1 — affix display table mirrored from doorPortals.js
// AFFIX_LABELS so the door card and the map node show the same label +
// color for the same affix. Could share via a tiny module but mirroring
// is cheap and the data is stable (4 affixes total, not changing).
const AFFIX_LABELS = {
  frost:  { label: 'FROST',  color: '#72c6ff' },
  ember:  { label: 'EMBER',  color: '#ff7a2a' },
  venom:  { label: 'VENOM',  color: '#6ae08a' },
  warded: { label: 'WARDED', color: '#ffd855' },
};
// Reward palettes for the map sub-labels \u2014 kept parallel to doorPortals.js
// REWARD_COLORS so the chip on the door + the chip on the map look the
// same color to the player. (Could share via a tiny module but the maps
// are tiny and divergence has been low historically.)
const REWARD_LABELS = {
  gold:      'GOLD',
  'rare+':   'RARE+',
  legendary: 'LEGENDARY',
  fusion:    'FUSION',
};
const REWARD_COLORS = {
  gold:      '#f4d9a0',
  'rare+':   '#ffd680',
  legendary: '#ffc8ff',
  fusion:    '#ffb265',
};

// ============================================================================
// CARD SHELL — parchment frame around the graph
// ============================================================================

function cardCorner(position) {
  const isTop = position[0] === 't';
  const isLeft = position[1] === 'l';
  const vSide = isTop ? 'top' : 'bottom';
  const hSide = isLeft ? 'left' : 'right';
  const hGrad = isLeft ? '90deg' : '270deg';
  const vGrad = isTop ? '180deg' : '0deg';
  return `
  <div style="position:absolute;${vSide}:14px;${hSide}:14px;width:36px;height:36px;pointer-events:none;">
    <div style="position:absolute;${vSide}:0;${hSide}:0;width:36px;height:1px;background:linear-gradient(${hGrad},#c9a86a,transparent);"></div>
    <div style="position:absolute;${vSide}:0;${hSide}:0;width:1px;height:36px;background:linear-gradient(${vGrad},#c9a86a,transparent);"></div>
    <div style="position:absolute;${vSide}:-2px;${hSide}:-2px;width:4px;height:4px;background:#c9a86a;transform:rotate(45deg);"></div>
  </div>`;
}

// ============================================================================
// SETUP + LIFECYCLE
// ============================================================================

function ensureMapEl() {
  if (_mapEl) return _mapEl;
  _mapEl = document.createElement('div');
  _mapEl.id = '__etheraFloorMap';
  _mapEl.style.cssText = [
    'position:absolute', 'inset:0',
    'display:none', 'align-items:center', 'justify-content:center',
    'background:radial-gradient(ellipse at center,#140a18 0%,#0a0610 65%,#050308 100%)',
    'color:#ddd', 'pointer-events:auto',
    'font-family:Georgia,"Cormorant Garamond",serif',
    'padding:24px', 'box-sizing:border-box', 'z-index:28',
  ].join(';');
  document.getElementById('hud')?.appendChild(_mapEl);
  return _mapEl;
}

// Apply ascension VII hidden flags before rendering so we only paint once.
function applyHiddenFlags(graph) {
  const am = typeof window !== 'undefined' && window.__ascensionModifiers
    ? window.__ascensionModifiers() : {};
  if (!am || !am.hiddenMapNode) return;
  const byLayer = new Map();
  for (const n of graph.nodes) {
    if (n.visited || n.current || n.kind === 'start' || n.kind === 'boss') continue;
    if (!byLayer.has(n.layer)) byLayer.set(n.layer, []);
    byLayer.get(n.layer).push(n);
  }
  for (const [_l, arr] of byLayer) {
    if (arr.length < 2) continue;
    // Deterministic per-layer seed so the same node stays hidden across opens.
    const pickIndex = (arr[0].id * 31 + arr.length * 17) % arr.length;
    arr[pickIndex]._hidden = true;
  }
}

/**
 * Show the floor map. Returns a Promise that resolves with the picked node id
 * when the player clicks a reachable node.
 *
 * @param {object} graph - from floorGraph.generateFloorGraph
 * @param {number} currentNodeId - where the player is right now
 */
export function openFloorMap(graph, currentNodeId) {
  const el = ensureMapEl();
  applyHiddenFlags(graph);
  const currentNode = graph.nodes.find(n => n.id === currentNodeId);
  const pos = computeLayout(graph);

  const nodeMarkup = graph.nodes.map(n => renderNode(n, pos.get(n.id), currentNode)).join('');

  // Card — contained composition with inset gold frame, inner corner
  // flourishes, and radial atmosphere. Title + hint live inside the card
  // so the whole thing reads as one artifact.
  const card = `
    <div class="floor-map-card" style="
      position:relative;
      width:${CARD_W}px;height:${CARD_H}px;
      background:
        radial-gradient(ellipse at center, rgba(30,20,36,0.55) 0%, rgba(14,10,18,0.82) 60%, rgba(8,6,12,0.92) 100%),
        linear-gradient(180deg, #120a18, #0a0610);
      box-shadow:
        inset 0 0 0 1px rgba(201,168,106,0.55),
        inset 0 0 0 3px rgba(201,168,106,0.12),
        inset 0 0 42px rgba(0,0,0,0.55),
        0 0 60px rgba(201,168,106,0.12),
        0 0 120px rgba(40,20,55,0.4);
      animation:mapCardIn 0.42s ease-out both;
      overflow:hidden;
    ">
      ${cardCorner('tl')}${cardCorner('tr')}${cardCorner('bl')}${cardCorner('br')}

      <!-- TITLE BLOCK — inside the card so the whole composition is one unit. -->
      <div style="position:absolute;top:24px;left:0;right:0;display:flex;flex-direction:column;align-items:center;pointer-events:none;">
        <div style="display:flex;align-items:center;gap:18px;opacity:0.75;margin-bottom:4px;">
          <div style="width:58px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
          <div style="color:#c9a86a;font-size:10px;letter-spacing:5px;font-style:italic;">choose your descent</div>
          <div style="width:58px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
        </div>
        <h1 style="font-size:26px;margin:0;letter-spacing:8px;color:#f4d9a0;text-shadow:0 0 16px rgba(244,217,160,0.35);font-weight:400;font-family:Georgia,serif;">FLOOR MAP</h1>
      </div>

      <!-- GRAPH LAYER — SVG spine + bezier edges, then absolutely-positioned nodes. -->
      ${renderSVG(graph, pos, currentNode)}
      ${nodeMarkup}

      <!-- HINT — sits at bottom of the card. -->
      <div style="position:absolute;bottom:22px;left:0;right:0;text-align:center;color:#a89b82;font-size:10.5px;letter-spacing:3px;font-style:italic;pointer-events:none;">click a glowing node to commit your path</div>
    </div>
  `;

  el.innerHTML = card;

  // Attach click handlers to reachable nodes.
  for (const el2 of el.querySelectorAll('.floor-map-node')) {
    const nodeId = parseInt(el2.getAttribute('data-node-id'), 10);
    const node = graph.nodes.find(n => n.id === nodeId);
    if (!currentNode || !currentNode.edges.includes(nodeId) || node?.visited) continue;
    el2.onclick = () => {
      if (_currentPickResolve) {
        const res = _currentPickResolve;
        _currentPickResolve = null;
        el.style.display = 'none';
        res(nodeId);
      }
    };
  }

  el.style.display = 'flex';

  return new Promise(resolve => { _currentPickResolve = resolve; });
}

/**
 * Hide the map programmatically (e.g., cancelled by run abort).
 */
export function closeFloorMap() {
  if (_mapEl) _mapEl.style.display = 'none';
  if (_currentPickResolve) {
    const res = _currentPickResolve;
    _currentPickResolve = null;
    res(null);
  }
}
