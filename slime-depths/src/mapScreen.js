// ============================================================================
// FLOOR MAP SCREEN — renders the branching DAG for path selection
//
// Session 2b of the branching-map pass. Pure UI — accepts a graph from
// floorGraph.js, a currentNodeId, and a pick callback. Not yet wired to
// the run flow (2c handles that).
//
// Visual layout: layers stacked vertically (start at bottom, boss at top),
// nodes spread horizontally within each layer. SVG-drawn edges between
// nodes for the lineage lines. Clickable nodes are the ones current can
// reach (current.edges). Others are dimmed.
//
// Visual grammar matches the rest of the game — gold hairlines, dark
// radial gradient backdrop, ornate corner flourishes.
// ============================================================================

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

// Per-kind accent color. Matches existing in-game palettes where applicable.
const NODE_COLORS = {
  start:     '#c9a86a',
  combat:    '#e8d4b4',
  elite:     '#d85a5a',
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

let _mapEl = null;       // DOM singleton
let _currentPickResolve = null;

// Corner ornament shared with the other overlays.
function cornerOrnament(position) {
  const isTop = position[0] === 't';
  const isLeft = position[1] === 'l';
  const vSide = isTop ? 'top' : 'bottom';
  const hSide = isLeft ? 'left' : 'right';
  const hGrad = isLeft ? '90deg' : '270deg';
  const vGrad = isTop ? '180deg' : '0deg';
  return `
  <div style="position:absolute;${vSide}:22px;${hSide}:22px;width:48px;height:48px;pointer-events:none;">
    <div style="position:absolute;${vSide}:0;${hSide}:0;width:48px;height:1px;background:linear-gradient(${hGrad},#c9a86a,transparent);"></div>
    <div style="position:absolute;${vSide}:0;${hSide}:0;width:1px;height:48px;background:linear-gradient(${vGrad},#c9a86a,transparent);"></div>
    <div style="position:absolute;${vSide}:-2px;${hSide}:-2px;width:4px;height:4px;background:#c9a86a;transform:rotate(45deg);"></div>
  </div>`;
}

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

// Compute node screen positions. Returns Map<nodeId, {x,y}>.
// Layer 0 at bottom of the canvas area, highest layer at top. Nodes in a
// layer are spread around center with a fixed gap.
function computeLayout(graph, canvasW, canvasH) {
  const layers = {};
  for (const n of graph.nodes) {
    if (!layers[n.layer]) layers[n.layer] = [];
    layers[n.layer].push(n);
  }
  const maxLayer = graph.maxLayer;
  const usableH = canvasH - 160;   // reserve top for title, bottom for hint
  const layerGap = usableH / (maxLayer + 1);
  const pos = new Map();
  for (const layerStr in layers) {
    const layer = parseInt(layerStr, 10);
    const layerNodes = layers[layer];
    // y: layer 0 at bottom (large y), boss layer at top (small y)
    const y = 100 + (maxLayer - layer) * layerGap;
    const spread = Math.min(520, canvasW * 0.55);  // total horizontal span
    const step = layerNodes.length > 1 ? spread / (layerNodes.length - 1) : 0;
    const startX = canvasW / 2 - (step * (layerNodes.length - 1)) / 2;
    layerNodes.forEach((n, i) => {
      pos.set(n.id, { x: startX + step * i, y });
    });
  }
  return pos;
}

function renderSVGEdges(graph, pos, currentNode) {
  const reachable = new Set(currentNode ? currentNode.edges : []);
  const lines = [];
  for (const n of graph.nodes) {
    const from = pos.get(n.id);
    if (!from) continue;
    for (const eid of n.edges) {
      const to = pos.get(eid);
      if (!to) continue;
      // An edge is "active" if it originates from the current node.
      const active = (currentNode && n.id === currentNode.id);
      const stroke = active ? '#f4d9a0' : '#3a3020';
      const width = active ? 2 : 1;
      const op = n.visited ? 0.45 : 0.8;
      lines.push(
        `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"
               stroke="${stroke}" stroke-width="${width}" opacity="${op}"/>`
      );
    }
  }
  return `<svg width="100%" height="100%" style="position:absolute;inset:0;pointer-events:none;">${lines.join('')}</svg>`;
}

function renderNode(n, p, currentNode) {
  const reachable = currentNode && currentNode.edges.includes(n.id);
  const isCurrent = currentNode && currentNode.id === n.id;
  const clickable = reachable && !n.visited;

  // ASCENSION VII — hidden map node: if this node is flagged hidden and
  // hasn't been visited, render as "?" with a neutral color so the player
  // cannot plan around it. The kind is revealed once they commit.
  const hidden = n._hidden && !n.visited && !isCurrent;
  const color = hidden ? '#8a7a5a' : (NODE_COLORS[n.kind] || '#c9a86a');
  const glyph = hidden ? '?' : (NODE_GLYPHS[n.kind] || '?');
  const ring = isCurrent ? '#f4d9a0' : clickable ? color : '#3a3020';
  const bgOpacity = isCurrent ? 1.0 : clickable ? 0.9 : n.visited ? 0.3 : 0.6;
  const cursor = clickable ? 'pointer' : 'default';
  const animation = clickable ? 'animation:mapNodePulse 2.2s ease-in-out infinite;' : '';

  return `
  <div data-node-id="${n.id}" class="floor-map-node" style="
    position:absolute;left:${p.x - 28}px;top:${p.y - 28}px;width:56px;height:56px;
    display:flex;align-items:center;justify-content:center;flex-direction:column;gap:2px;
    cursor:${cursor};opacity:${bgOpacity};transition:transform 0.18s ease, opacity 0.25s ease;
    ${animation}
  ">
    <div style="
      width:44px;height:44px;border-radius:50%;
      background:radial-gradient(circle,rgba(30,22,16,0.9),rgba(14,10,8,0.95));
      border:1.5px solid ${ring};
      display:flex;align-items:center;justify-content:center;
      color:${color};font-size:22px;line-height:1;text-shadow:0 0 8px ${color}aa;
      ${isCurrent ? 'box-shadow:0 0 18px ' + color + '88;' : ''}
    ">${glyph}</div>
    <div style="
      color:${clickable || isCurrent ? color : '#6a5c48'};
      font-size:8px;letter-spacing:2px;font-weight:bold;
      opacity:${clickable || isCurrent ? 0.9 : 0.4};
    ">${NODE_LABELS[n.kind] || ''}</div>
  </div>`;
}

/**
 * Show the floor map. Returns a Promise that resolves with the picked node
 * id when the player clicks a reachable node. Fades in/out.
 *
 * @param {object} graph - from floorGraph.generateFloorGraph
 * @param {number} currentNodeId - where the player is right now
 */
export function openFloorMap(graph, currentNodeId) {
  const el = ensureMapEl();
  const canvas = document.getElementById('game');
  // Use the HUD/stage dimensions for layout
  const rect = canvas?.parentElement?.getBoundingClientRect() || { width: 1280, height: 720 };
  const canvasW = rect.width;
  const canvasH = rect.height;
  const pos = computeLayout(graph, canvasW, canvasH);
  const currentNode = graph.nodes.find(n => n.id === currentNodeId);

  el.innerHTML = `
    <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center, transparent 28%, rgba(4,2,6,0.55) 78%, rgba(0,0,0,0.85) 100%);pointer-events:none;"></div>
    ${cornerOrnament('tl')}${cornerOrnament('tr')}${cornerOrnament('bl')}${cornerOrnament('br')}
    <div style="position:relative;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;">
      <div style="margin-top:22px;display:flex;align-items:center;gap:22px;opacity:0.75;">
        <div style="width:80px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
        <div style="color:#c9a86a;font-size:11px;letter-spacing:6px;font-style:italic;">choose your descent</div>
        <div style="width:80px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
      </div>
      <h1 style="font-size:30px;margin:6px 0 4px;letter-spacing:8px;color:#f4d9a0;text-shadow:0 0 18px rgba(244,217,160,0.4);font-weight:400;font-family:Georgia,serif;">FLOOR MAP</h1>
      <div style="position:relative;flex:1;width:100%;">
        ${renderSVGEdges(graph, pos, currentNode)}
        ${graph.nodes.map(n => renderNode(n, pos.get(n.id), currentNode)).join('')}
      </div>
      <div style="margin-bottom:24px;color:#a89b82;font-size:11px;letter-spacing:3px;font-style:italic;">click a glowing node to commit your path</div>
    </div>`;

  // ASCENSION VII — hide one random per-layer non-current/non-visited node.
  // Applied AFTER rendering so labels cover the first render; graph state
  // gets marked so subsequent opens reveal any previously-unhidden nodes.
  const am = typeof window !== 'undefined' && window.__ascensionModifiers ? window.__ascensionModifiers() : {};
  if (am && am.hiddenMapNode) {
    const byLayer = new Map();
    for (const n of graph.nodes) {
      if (n.visited || n.current || n.kind === 'start' || n.kind === 'boss') continue;
      if (!byLayer.has(n.layer)) byLayer.set(n.layer, []);
      byLayer.get(n.layer).push(n);
    }
    for (const [_l, arr] of byLayer) {
      if (arr.length < 2) continue;   // only hide when there's a choice
      // Deterministic per-layer seed so the same node stays hidden between opens
      const pickIndex = (arr[0].id * 31 + arr.length * 17) % arr.length;
      arr[pickIndex]._hidden = true;
    }
  }
  // Force one more render with the _hidden flags now set
  const renderedNodes = graph.nodes.map(n => renderNode(n, pos.get(n.id), currentNode)).join('');
  el.innerHTML = `
    <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center, transparent 28%, rgba(4,2,6,0.55) 78%, rgba(0,0,0,0.85) 100%);pointer-events:none;"></div>
    ${cornerOrnament('tl')}${cornerOrnament('tr')}${cornerOrnament('bl')}${cornerOrnament('br')}
    <div style="position:relative;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;">
      <div style="margin-top:22px;display:flex;align-items:center;gap:22px;opacity:0.75;">
        <div style="width:80px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
        <div style="color:#c9a86a;font-size:11px;letter-spacing:6px;font-style:italic;">choose your descent</div>
        <div style="width:80px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
      </div>
      <h1 style="font-size:30px;margin:6px 0 4px;letter-spacing:8px;color:#f4d9a0;text-shadow:0 0 18px rgba(244,217,160,0.4);font-weight:400;font-family:Georgia,serif;">FLOOR MAP</h1>
      <div style="position:relative;flex:1;width:100%;">
        ${renderSVGEdges(graph, pos, currentNode)}
        ${renderedNodes}
      </div>
      <div style="margin-bottom:24px;color:#a89b82;font-size:11px;letter-spacing:3px;font-style:italic;">click a glowing node to commit your path</div>
    </div>
  `;

  // Attach click handlers to reachable nodes.
  for (const el2 of el.querySelectorAll('.floor-map-node')) {
    const nodeId = parseInt(el2.getAttribute('data-node-id'), 10);
    const node = graph.nodes.find(n => n.id === nodeId);
    if (!currentNode || !currentNode.edges.includes(nodeId) || node?.visited) continue;
    el2.onclick = () => {
      // Fade out + resolve
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
