// ============================================================
//  GRIMOIRE — unified dark fantasy character menu
// ============================================================
let menuOpen = false;
let menuTab = 'status'; // 'status', 'equipment', 'keyitems', 'quests'
let menuTabTransition = 0; // 0 = no transition, >0 = transitioning
let menuTabTransDir = 1;   // 1 = slide left, -1 = slide right
let menuTabPrev = 'status';
let menuFadeInTimer = 0;

function isGrimoireReady() {
    return menuOpen && menuFadeInTimer >= 0.95;
}

// --- Grimoire color palette ---
const GM = {
    // Background layers
    bgDark:    '#0c0a08',
    bgMid:     '#141010',
    bgLight:   '#1e1814',
    bgPanel:   '#1a1510',
    // Accent golds
    gold:      '#c9a84c',
    goldBright:'#e4c45c',
    goldDim:   '#8a7040',
    goldFaint: '#5a4a2a',
    // Text
    textLight: '#d8c8a0',
    textMid:   '#a89878',
    textDim:   '#6a5a44',
    textFaint: '#483c28',
    // Stat colors
    hpRed:     '#8b2020',
    hpRedLit:  '#c43030',
    manaBlue:  '#203870',
    manaBluLit:'#3858a8',
    xpAmber:   '#8a6820',
    xpAmberLit:'#c49030',
    // Category colors
    catWand:   '#c49040',
    catPass:   '#508858',
    catTower:  '#506888',
};

// ---- 9-SLICE PANEL RENDERER ----
// Draws a 48x48 panel sprite scaled to any size using 9-slice method
// border = pixels of source to keep unscaled on each edge (default 6)
function draw9Slice(img, x, y, w, h, border, tintColor, tintAlpha) {
    if (!img) return;
    const b = border || 6;
    const sw = img.width;
    const sh = img.height;
    const sb = b; // source border

    ctx.save();
    // If tinting, we draw to get the white panel then tint with multiply
    ctx.drawImage(img, 0, 0, sb, sb, x, y, b, b); // TL
    ctx.drawImage(img, sw - sb, 0, sb, sb, x + w - b, y, b, b); // TR
    ctx.drawImage(img, 0, sh - sb, sb, sb, x, y + h - b, b, b); // BL
    ctx.drawImage(img, sw - sb, sh - sb, sb, sb, x + w - b, y + h - b, b, b); // BR
    ctx.drawImage(img, sb, 0, sw - sb * 2, sb, x + b, y, w - b * 2, b); // T
    ctx.drawImage(img, sb, sh - sb, sw - sb * 2, sb, x + b, y + h - b, w - b * 2, b); // B
    ctx.drawImage(img, 0, sb, sb, sh - sb * 2, x, y + b, b, h - b * 2); // L
    ctx.drawImage(img, sw - sb, sb, sb, sh - sb * 2, x + w - b, y + b, b, h - b * 2); // R
    ctx.drawImage(img, sb, sb, sw - sb * 2, sh - sb * 2, x + b, y + b, w - b * 2, h - b * 2); // Center

    // Apply dark tint over the white panel
    if (tintColor) {
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = tintAlpha || 1.0;
        ctx.fillStyle = tintColor;
        ctx.fillRect(x, y, w, h);
        ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
}

// Draw a pixel-art divider sprite, stretched horizontally
function drawSpriteDivider(img, cx, y, width) {
    if (!img) return;
    const h = img.height;
    const drawH = h * 2; // scale up 2x for visibility
    const drawW = width;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, cx - drawW / 2, y - drawH / 2, drawW, drawH);
    ctx.imageSmoothingEnabled = true;
    ctx.restore();
}

function drawGameMenu() {
    if (!menuOpen) return;

    menuFadeInTimer = Math.min(1, menuFadeInTimer + (typeof _frameDt !== 'undefined' ? _frameDt * 3 : 0.05));
    const fa = menuFadeInTimer;
    // Book-open animation: horizontal scale from 0 → 1
    const bookOpenProgress = Math.min(1, menuFadeInTimer * 2.5); // opens in ~0.4s
    const bookScaleX = 0.3 + 0.7 * (1 - Math.pow(1 - bookOpenProgress, 3)); // ease-out cubic
    const bookScaleY = 0.8 + 0.2 * bookOpenProgress;

    ctx.save();
    const cx = canvasW / 2;
    const cy = canvasH / 2;

    // --- Full-screen dark vignette overlay ---
    ctx.globalAlpha = fa * 0.82;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvasW, canvasH);
    // Radial vignette — lighter in center
    const vig = ctx.createRadialGradient(cx, cy, 100, cx, cy, Math.max(canvasW, canvasH) * 0.7);
    vig.addColorStop(0, 'rgba(20,16,12,0.0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.globalAlpha = fa;
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, canvasW, canvasH);

    // --- Panel dimensions ---
    const pw = 540, ph = 540;
    const px = cx - pw / 2, py = cy - ph / 2;

    // --- Apply book-open transform ---
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(bookScaleX, bookScaleY);
    ctx.translate(-cx, -cy);

    // --- Procedural panel background ---
    // Outer glow
    ctx.globalAlpha = fa * 0.15;
    ctx.shadowColor = '#c49040';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#0a0806';
    ctx.fillRect(px - 6, py - 6, pw + 12, ph + 12);
    ctx.shadowBlur = 0;

    // Main dark fill with subtle gradient
    ctx.globalAlpha = fa * 0.95;
    const panelBg = ctx.createLinearGradient(px, py, px, py + ph);
    panelBg.addColorStop(0, '#1a1510');
    panelBg.addColorStop(0.3, '#100c08');
    panelBg.addColorStop(0.7, '#0e0a06');
    panelBg.addColorStop(1, '#141008');
    ctx.fillStyle = panelBg;
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, 4);
    ctx.fill();

    // Subtle horizontal line texture
    ctx.globalAlpha = fa * 0.03;
    ctx.strokeStyle = '#886830';
    ctx.lineWidth = 0.5;
    for (let ly = py + 8; ly < py + ph - 8; ly += 6) {
        ctx.beginPath();
        ctx.moveTo(px + 8, ly);
        ctx.lineTo(px + pw - 8, ly);
        ctx.stroke();
    }

    // Double border frame — outer dark, inner gold
    ctx.globalAlpha = fa * 0.6;
    ctx.strokeStyle = '#0a0806';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(px - 2, py - 2, pw + 4, ph + 4, 5);
    ctx.stroke();
    ctx.globalAlpha = fa * 0.5;
    ctx.strokeStyle = '#8a7030';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, 4);
    ctx.stroke();
    ctx.globalAlpha = fa * 0.25;
    ctx.strokeStyle = '#c49040';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.roundRect(px + 3, py + 3, pw - 6, ph - 6, 3);
    ctx.stroke();

    // Corner filigree (small L-shapes at each corner)
    ctx.globalAlpha = fa * 0.35;
    ctx.strokeStyle = '#c49040';
    ctx.lineWidth = 1;
    const fl = 14; // filigree arm length
    const fo = 6;  // offset from panel edge
    // Top-left
    ctx.beginPath(); ctx.moveTo(px + fo, py + fo + fl); ctx.lineTo(px + fo, py + fo); ctx.lineTo(px + fo + fl, py + fo); ctx.stroke();
    // Top-right
    ctx.beginPath(); ctx.moveTo(px + pw - fo - fl, py + fo); ctx.lineTo(px + pw - fo, py + fo); ctx.lineTo(px + pw - fo, py + fo + fl); ctx.stroke();
    // Bottom-left
    ctx.beginPath(); ctx.moveTo(px + fo, py + ph - fo - fl); ctx.lineTo(px + fo, py + ph - fo); ctx.lineTo(px + fo + fl, py + ph - fo); ctx.stroke();
    // Bottom-right
    ctx.beginPath(); ctx.moveTo(px + pw - fo - fl, py + ph - fo); ctx.lineTo(px + pw - fo, py + ph - fo); ctx.lineTo(px + pw - fo, py + ph - fo - fl); ctx.stroke();

    // Warm inner glow
    ctx.globalAlpha = fa * 0.04;
    const innerGlow = ctx.createRadialGradient(cx, cy, 20, cx, cy, pw * 0.6);
    innerGlow.addColorStop(0, '#c49040');
    innerGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = innerGlow;
    ctx.fillRect(px, py, pw, ph);

    // --- Title with embossed look ---
    ctx.globalAlpha = fa;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Shadow text (emboss bottom)
    ctx.font = 'small-caps bold 22px Georgia';
    ctx.fillStyle = '#000';
    ctx.globalAlpha = fa * 0.5;
    ctx.fillText('Grimoire', cx, py + 30 + 1);
    // Main text
    ctx.globalAlpha = fa * 0.85;
    ctx.fillStyle = GM.gold;
    ctx.fillText('Grimoire', cx, py + 30);

    // --- Divider under title ---
    _drawDivider(cx, py + 46, pw * 0.35, fa);

    // --- Tab bar (equipment only for wizard/lich) ---
    const _form = FormSystem.currentForm;
    const _formCfg = FORM_CONFIGS[_form] || {};
    const _hasEquip = (_formCfg.hasEquipment ?? false);
    const _hasAugments = (!_hasEquip && (_form === 'slime' || _form === 'skeleton'));
    const _augLabel = _form === 'slime' ? 'MUTATIONS' : 'BONE RUNES';
    const _hasKeyItems = (_formCfg.hasKeyItems ?? true); // default true for safety
    const tabs = [
        { id: 'status',    label: 'STATUS',    icon: 'status' },
        ...(_hasEquip     ? [{ id: 'equipment', label: 'EQUIPMENT', icon: 'equip' }] : []),
        ...(_hasAugments  ? [{ id: 'augments',  label: _augLabel,   icon: 'equip' }] : []),
        { id: 'bestiary',  label: 'BESTIARY', icon: 'quest' },
        ...(_hasKeyItems ? [{ id: 'keyitems',  label: 'KEY ITEMS', icon: 'key' }] : []),
        ...(_hasKeyItems ? [{ id: 'quests',    label: 'QUESTS',    icon: 'quest' }] : []),
        ...(_hasKeyItems ? [{ id: 'map',       label: 'MAP',       icon: 'map' }] : []),
    ];
    const tabY = py + 60;
    const tabH = 30;
    const tabGap = 4;
    const totalTabW = pw - 48;
    const tabW = (totalTabW - tabGap * (tabs.length - 1)) / tabs.length;

    for (let i = 0; i < tabs.length; i++) {
        const t = tabs[i];
        const tx = px + 24 + i * (tabW + tabGap);
        const isActive = menuTab === t.id;

        // Tab background
        ctx.globalAlpha = fa * (isActive ? 0.6 : 0.12);
        const tabGrad = ctx.createLinearGradient(tx, tabY, tx, tabY + tabH);
        if (isActive) {
            tabGrad.addColorStop(0, '#2a2218');
            tabGrad.addColorStop(1, '#1a1610');
        } else {
            tabGrad.addColorStop(0, '#141210');
            tabGrad.addColorStop(1, '#0e0c0a');
        }
        ctx.fillStyle = tabGrad;
        ctx.beginPath();
        ctx.roundRect(tx, tabY, tabW, tabH, 3);
        ctx.fill();

        // Active tab: bottom highlight line
        if (isActive) {
            ctx.globalAlpha = fa * 0.6;
            ctx.strokeStyle = GM.gold;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(tx + 6, tabY + tabH);
            ctx.lineTo(tx + tabW - 6, tabY + tabH);
            ctx.stroke();
        }

        // Tab border
        ctx.globalAlpha = fa * (isActive ? 0.3 : 0.08);
        ctx.strokeStyle = GM.goldDim;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.roundRect(tx, tabY, tabW, tabH, 3);
        ctx.stroke();

        // Tab icon (small symbolic shape)
        const iconCx = tx + 14;
        const iconCy = tabY + tabH / 2;
        ctx.globalAlpha = fa * (isActive ? 0.7 : 0.3);
        ctx.fillStyle = isActive ? GM.gold : GM.goldDim;
        ctx.strokeStyle = isActive ? GM.gold : GM.goldDim;
        ctx.lineWidth = 1.2;
        _drawTabIcon(t.icon, iconCx, iconCy, 5);

        // Tab label
        ctx.globalAlpha = fa * (isActive ? 0.9 : 0.35);
        ctx.font = isActive ? 'small-caps bold 10px Georgia' : 'small-caps 9px Georgia';
        ctx.fillStyle = isActive ? GM.textLight : GM.textDim;
        ctx.textAlign = 'center';
        ctx.fillText(t.label, tx + tabW / 2 + 6, tabY + tabH / 2 + 1);
    }

    // --- Content area ---
    const contentY = tabY + tabH + 14;
    const contentX = px + 24;
    const contentW = pw - 48;
    const contentH = py + ph - contentY - 32;

    // Subtle inset for content area
    ctx.globalAlpha = fa * 0.06;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.roundRect(contentX - 6, contentY - 4, contentW + 12, contentH + 8, 4);
    ctx.fill();
    ctx.globalAlpha = fa * 0.08;
    ctx.strokeStyle = GM.goldFaint;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.roundRect(contentX - 6, contentY - 4, contentW + 12, contentH + 8, 4);
    ctx.stroke();

    // --- Draw tab content (with transition fade) ---
    if (menuTabTransition > 0) menuTabTransition -= (typeof _frameDt !== 'undefined' ? _frameDt : 1/60);
    const tabFade = menuTabTransition > 0 ? Math.max(0.3, 1 - (menuTabTransition / 0.2)) : 1;
    ctx.globalAlpha = fa * tabFade;
    if (menuTab === 'status')         drawMenuStatus(contentX, contentY, contentW, contentH, fa * tabFade);
    else if (menuTab === 'equipment') drawMenuEquipment(contentX, contentY, contentW, contentH, fa);
    else if (menuTab === 'augments')  drawMenuAugments(contentX, contentY, contentW, contentH, fa);
    else if (menuTab === 'bestiary') drawMenuBestiary(contentX, contentY, contentW, contentH, fa);
    else if (menuTab === 'keyitems')  drawMenuKeyItems(contentX, contentY, contentW, contentH, fa);
    else if (menuTab === 'quests')    drawMenuQuests(contentX, contentY, contentW, contentH, fa);
    else if (menuTab === 'map')       drawMenuMap(contentX, contentY, contentW, contentH, fa);

    // --- Bottom close hint ---
    ctx.globalAlpha = fa * 0.2;
    ctx.font = '8px monospace';
    ctx.fillStyle = GM.textDim;
    ctx.textAlign = 'center';
    ctx.fillText((menuTab === 'equipment' && (_hasEquip)) ? 'I  or  TAB  to close' : 'TAB  to close', cx, py + ph - 12);

    ctx.restore(); // book-open transform
    ctx.restore();
}

// --- Corner filigree decoration ---
function _drawCornerFiligree(px, py, pw, ph, fa) {
    const L = 22, S = 8;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';

    const corners = [
        { x: px, y: py, dx: 1, dy: 1 },
        { x: px + pw, y: py, dx: -1, dy: 1 },
        { x: px, y: py + ph, dx: 1, dy: -1 },
        { x: px + pw, y: py + ph, dx: -1, dy: -1 },
    ];
    for (const c of corners) {
        // L-shape
        ctx.globalAlpha = fa * 0.3;
        ctx.strokeStyle = GM.goldDim;
        ctx.beginPath();
        ctx.moveTo(c.x + c.dx * L, c.y);
        ctx.lineTo(c.x, c.y);
        ctx.lineTo(c.x, c.y + c.dy * L);
        ctx.stroke();

        // Small diamond at corner
        ctx.globalAlpha = fa * 0.25;
        ctx.fillStyle = GM.gold;
        const d = 3;
        ctx.beginPath();
        ctx.moveTo(c.x + c.dx * S, c.y + c.dy * S - d);
        ctx.lineTo(c.x + c.dx * S + d, c.y + c.dy * S);
        ctx.lineTo(c.x + c.dx * S, c.y + c.dy * S + d);
        ctx.lineTo(c.x + c.dx * S - d, c.y + c.dy * S);
        ctx.fill();
    }
}

// --- Divider line with center diamond and fade ---
function _drawDivider(cx, cy, halfW, fa) {
    // Fading lines
    const lineGrad = ctx.createLinearGradient(cx - halfW, cy, cx, cy);
    lineGrad.addColorStop(0, 'rgba(138,112,64,0)');
    lineGrad.addColorStop(1, 'rgba(138,112,64,0.5)');
    ctx.globalAlpha = fa * 0.4;
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(cx - halfW, cy); ctx.lineTo(cx - 6, cy); ctx.stroke();

    const lineGrad2 = ctx.createLinearGradient(cx, cy, cx + halfW, cy);
    lineGrad2.addColorStop(0, 'rgba(138,112,64,0.5)');
    lineGrad2.addColorStop(1, 'rgba(138,112,64,0)');
    ctx.strokeStyle = lineGrad2;
    ctx.beginPath(); ctx.moveTo(cx + 6, cy); ctx.lineTo(cx + halfW, cy); ctx.stroke();

    // Center diamond
    ctx.globalAlpha = fa * 0.4;
    ctx.fillStyle = GM.gold;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 3); ctx.lineTo(cx + 3, cy);
    ctx.lineTo(cx, cy + 3); ctx.lineTo(cx - 3, cy);
    ctx.fill();
}

// --- Tab icons (small symbolic shapes) ---
function _drawTabIcon(type, cx, cy, s) {
    ctx.beginPath();
    if (type === 'status') {
        // Shield shape
        ctx.moveTo(cx, cy - s);
        ctx.lineTo(cx + s, cy - s * 0.3);
        ctx.lineTo(cx + s * 0.8, cy + s * 0.6);
        ctx.lineTo(cx, cy + s);
        ctx.lineTo(cx - s * 0.8, cy + s * 0.6);
        ctx.lineTo(cx - s, cy - s * 0.3);
        ctx.closePath();
        ctx.stroke();
    } else if (type === 'equip') {
        // Sword shape
        ctx.moveTo(cx, cy - s);
        ctx.lineTo(cx, cy + s * 0.4);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.5, cy);
        ctx.lineTo(cx + s * 0.5, cy);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.25, cy + s * 0.7);
        ctx.lineTo(cx + s * 0.25, cy + s * 0.7);
        ctx.lineTo(cx + s * 0.15, cy + s);
        ctx.lineTo(cx - s * 0.15, cy + s);
        ctx.closePath();
        ctx.fill();
    } else if (type === 'key') {
        // Key shape
        ctx.arc(cx, cy - s * 0.3, s * 0.4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, cy + s * 0.1);
        ctx.lineTo(cx, cy + s);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, cy + s * 0.6);
        ctx.lineTo(cx + s * 0.3, cy + s * 0.6);
        ctx.stroke();
    } else if (type === 'quest') {
        // Scroll shape
        ctx.moveTo(cx - s * 0.5, cy - s);
        ctx.lineTo(cx - s * 0.5, cy + s * 0.7);
        ctx.quadraticCurveTo(cx - s * 0.5, cy + s, cx - s * 0.2, cy + s);
        ctx.lineTo(cx + s * 0.5, cy + s);
        ctx.stroke();
        // horizontal lines (text)
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(cx - s * 0.2, cy - s * 0.5 + i * s * 0.45);
            ctx.lineTo(cx + s * 0.4, cy - s * 0.5 + i * s * 0.45);
            ctx.stroke();
        }
    }
}

// --- Stat bar helper ---
function _drawStatBar(x, y, w, h, ratio, col1, col2, fa) {
    // Clamp ratio to [0, 1] so bar never overflows its track
    ratio = Math.max(0, Math.min(1, ratio));
    // Dark track background
    ctx.globalAlpha = fa * 0.6;
    ctx.fillStyle = '#0a0806';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 2);
    ctx.fill();

    // Gradient fill
    if (ratio > 0) {
        ctx.globalAlpha = fa * 0.8;
        const g = ctx.createLinearGradient(x, y, x, y + h);
        g.addColorStop(0, col2);
        g.addColorStop(0.5, col1);
        g.addColorStop(1, col2);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect(x, y, Math.max(2, w * ratio), h, 2);
        ctx.fill();

        // Highlight stripe on top
        ctx.globalAlpha = fa * 0.15;
        ctx.fillStyle = '#fff';
        ctx.fillRect(x + 1, y + 1, Math.max(1, w * ratio - 2), 1);
    }

    // Track border
    ctx.globalAlpha = fa * 0.3;
    ctx.strokeStyle = '#8a7040';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 2);
    ctx.stroke();
}

// ===== STATUS TAB =====
// --- Evolution progress renderer ---
function drawEvolutionProgress(x, y, w, h, fa) {
    const forms = ['slime', 'skeleton', 'wizard', 'lich'];
    const formNames = { slime: 'Slime', skeleton: 'Skeleton', wizard: 'Wizard', lich: 'Lich' };
    const currentIdx = forms.indexOf(FormSystem.currentForm);

    // Section header
    ctx.globalAlpha = fa * 0.6;
    ctx.font = 'bold 11px Georgia';
    ctx.fillStyle = GM.gold;
    ctx.textAlign = 'left';
    ctx.fillText('EVOLUTION PROGRESS', x, y);
    y += 14;

    // Current form → next form
    const nextIdx = Math.min(currentIdx + 1, forms.length - 1);
    const currentForm = formNames[FormSystem.currentForm];
    const nextForm = nextIdx === currentIdx ? 'Final Form' : formNames[forms[nextIdx]];

    ctx.globalAlpha = fa * 0.8;
    ctx.font = '10px Georgia';
    ctx.fillStyle = GM.textLight;
    ctx.fillText(`${currentForm} → ${nextForm}`, x, y);

    // Milestone summary pips (right-aligned on same line)
    if (typeof getEvolutionProgress === 'function') {
        const prog = getEvolutionProgress();
        if (prog) {
            ctx.textAlign = 'right';
            ctx.globalAlpha = fa * 0.5;
            ctx.font = '9px Georgia';
            ctx.fillStyle = GM.textMid;
            ctx.fillText(`${prog.met}/${prog.total}`, x + w, y);
            ctx.textAlign = 'left';
            // Draw pips
            const pipR = 3;
            const pipGap = 10;
            const pipTotalW = prog.total * pipGap;
            const pipStartX = x + w - pipTotalW - 28;
            for (let p = 0; p < prog.total; p++) {
                const px = pipStartX + p * pipGap;
                const py = y - 3;
                ctx.beginPath();
                ctx.arc(px, py, pipR, 0, Math.PI * 2);
                if (p < prog.met) {
                    // Filled pip — golden glow
                    ctx.globalAlpha = fa * 0.9;
                    ctx.fillStyle = GM.goldBright;
                    ctx.fill();
                    ctx.globalAlpha = fa * 0.3;
                    ctx.strokeStyle = GM.gold;
                    ctx.lineWidth = 1;
                    ctx.stroke();
                } else {
                    // Empty pip — dim outline
                    ctx.globalAlpha = fa * 0.2;
                    ctx.fillStyle = GM.bgLight;
                    ctx.fill();
                    ctx.globalAlpha = fa * 0.3;
                    ctx.strokeStyle = GM.textDim;
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }
    }
    y += 14;

    // If already at final form, show completion message
    if (nextIdx === currentIdx) {
        ctx.globalAlpha = fa * 0.7;
        ctx.font = 'italic 9px Georgia';
        ctx.fillStyle = GM.gold;
        ctx.fillText('Final Form Achieved!', x, y);
        return;
    }

    // Get evolution requirements for next form
    const nextFormKey = forms[nextIdx];
    let reqKey = null;
    if (currentIdx === 0) reqKey = 'slime_to_skeleton';
    else if (currentIdx === 1) reqKey = 'skeleton_to_wizard';
    else if (currentIdx === 2) reqKey = 'wizard_to_lich';

    if (!reqKey) return;

    const requirements = EVOLUTION_REQUIREMENTS[reqKey];
    if (!requirements) return;
    const currentFormData = FormSystem.formData[FormSystem.currentForm];

    // Build requirement display list with readable names
    const reqDisplay = [];
    if ('kills' in requirements) {
        const val = currentFormData.totalKills || 0;
        reqDisplay.push({
            label: 'Kills',
            current: val,
            required: requirements.kills,
            color: GM.hpRedLit
        });
    }
    if ('absorbed' in requirements) {
        const val = currentFormData.absorbed || 0;
        reqDisplay.push({
            label: 'Absorbed',
            current: val,
            required: requirements.absorbed,
            color: GM.manaBlue
        });
    }
    if ('maxSizeReached' in requirements) {
        const val = currentFormData.maxSizeReached || 0;
        reqDisplay.push({
            label: 'Max Size',
            current: val,
            required: requirements.maxSizeReached,
            color: '#8a8a60'
        });
    }
    if ('shieldDamageBlocked' in requirements) {
        const val = currentFormData.shieldDamageBlocked || 0;
        reqDisplay.push({
            label: 'Shield Damage',
            current: val,
            required: requirements.shieldDamageBlocked,
            color: '#6a8a6a'
        });
    }
    if ('comboReached' in requirements) {
        const val = currentFormData.maxComboReached || 0;
        reqDisplay.push({
            label: 'Combo Reached',
            current: val,
            required: requirements.comboReached,
            color: '#a06a8a'
        });
    }
    if ('towersPlaced' in requirements) {
        const val = currentFormData.towersPlaced || 0;
        reqDisplay.push({
            label: 'Towers Placed',
            current: val,
            required: requirements.towersPlaced,
            color: GM.catTower
        });
    }
    if ('lowManaKills' in requirements) {
        const val = currentFormData.lowManaKills || 0;
        reqDisplay.push({
            label: 'Low Mana Kills',
            current: val,
            required: requirements.lowManaKills,
            color: GM.manaBluLit
        });
    }
    if ('talismanFound' in requirements) {
        const found = FormSystem.talisman.found ? 'YES' : 'NO';
        const color = FormSystem.talisman.found ? GM.gold : GM.textDim;
        ctx.globalAlpha = fa * 0.5;
        ctx.font = '9px Georgia';
        ctx.fillStyle = GM.textMid;
        ctx.fillText('Talisman Found', x, y);
        ctx.globalAlpha = fa * 0.8;
        ctx.fillStyle = color;
        ctx.textAlign = 'right';
        ctx.fillText(found, x + w, y);
        ctx.textAlign = 'left';
        y += 12;
    }
    if ('bossDefeated' in requirements) {
        const defeated = currentFormData.bossDefeated ? 'YES' : 'NO';
        const color = currentFormData.bossDefeated ? GM.gold : GM.textDim;
        ctx.globalAlpha = fa * 0.5;
        ctx.font = '9px Georgia';
        ctx.fillStyle = GM.textMid;
        ctx.fillText('Boss Defeated', x, y);
        ctx.globalAlpha = fa * 0.8;
        ctx.fillStyle = color;
        ctx.textAlign = 'right';
        ctx.fillText(defeated, x + w, y);
        ctx.textAlign = 'left';
        y += 12;
    }
    if ('talismanLevel' in requirements) {
        const lvl = FormSystem.talisman.level || 1;
        const req = requirements.talismanLevel;
        const done = lvl >= req;
        ctx.globalAlpha = fa * 0.5;
        ctx.font = '9px Georgia';
        ctx.fillStyle = GM.textMid;
        ctx.fillText('Talisman Level', x, y);
        ctx.globalAlpha = fa * 0.8;
        ctx.fillStyle = done ? GM.gold : GM.textDim;
        ctx.textAlign = 'right';
        ctx.fillText(`${lvl} / ${req}`, x + w, y);
        ctx.textAlign = 'left';
        y += 12;
    }

    // Draw requirement progress bars
    for (const req of reqDisplay) {
        const ratio = Math.min(1, req.current / req.required);
        const done = ratio >= 1;

        // Label
        ctx.globalAlpha = fa * 0.5;
        ctx.font = '9px Georgia';
        ctx.fillStyle = GM.textMid;
        ctx.fillText(req.label, x, y);

        // Progress value
        ctx.globalAlpha = fa * 0.8;
        ctx.fillStyle = done ? GM.gold : GM.textDim;
        ctx.textAlign = 'right';
        ctx.fillText(`${req.current} / ${req.required}`, x + w, y);
        ctx.textAlign = 'left';
        y += 12;

        // Progress bar
        _drawStatBar(x, y, w, 7, ratio, req.color, req.color, fa * 0.6);
        y += 11;
    }

    // --- "EVOLUTION READY" banner when all conditions are met ---
    if (typeof getEvolutionProgress === 'function') {
        const prog = getEvolutionProgress();
        if (prog && prog.met >= prog.total) {
            y += 6;
            const t = performance.now() / 1000;
            const pulse = 0.7 + Math.sin(t * 3) * 0.3;

            // Pulsing golden border box
            ctx.globalAlpha = fa * pulse * 0.4;
            ctx.strokeStyle = GM.goldBright || '#ffd700';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(x - 4, y - 2, w + 8, 36, 4);
            ctx.stroke();

            // Background fill
            ctx.globalAlpha = fa * 0.15;
            ctx.fillStyle = '#ffd700';
            ctx.beginPath();
            ctx.roundRect(x - 4, y - 2, w + 8, 36, 4);
            ctx.fill();

            // "EVOLUTION READY" text
            ctx.globalAlpha = fa * pulse;
            ctx.font = 'bold 12px Georgia';
            ctx.fillStyle = '#ffd700';
            ctx.textAlign = 'center';
            ctx.shadowColor = 'rgba(255, 215, 0, 0.5)';
            ctx.shadowBlur = 8;
            ctx.fillText('EVOLUTION READY', x + w / 2, y + 12);
            ctx.shadowBlur = 0;

            // Subtitle
            ctx.globalAlpha = fa * 0.6;
            ctx.font = 'italic 9px Georgia';
            ctx.fillStyle = '#c4a878';
            ctx.fillText('Close the Grimoire to evolve', x + w / 2, y + 26);
            ctx.textAlign = 'left';
        }
    }
}

function drawMenuStatus(x, y, w, h, fa) {
    ctx.save();
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    let ly = y + 6;
    const barW = w * 0.55;
    const barH = 10;
    const labelCol = GM.textMid;
    const valCol = GM.textLight;

    // --- Character header ---
    ctx.globalAlpha = fa * 0.5;
    ctx.font = 'italic 11px Georgia';
    ctx.fillStyle = GM.textDim;
    ctx.fillText(playerName, x, ly);
    // Level on right
    ctx.textAlign = 'right';
    ctx.globalAlpha = fa * 0.85;
    ctx.font = 'small-caps bold 13px Georgia';
    ctx.fillStyle = GM.gold;
    ctx.fillText('Level ' + xpState.level, x + w, ly);
    ctx.textAlign = 'left';
    ly += 22;

    // --- XP bar ---
    const xpRatio = xpState.xpToNext > 0 ? xpState.xp / xpState.xpToNext : 0;
    ctx.globalAlpha = fa * 0.4;
    ctx.font = '9px Georgia';
    ctx.fillStyle = labelCol;
    ctx.fillText('Experience', x, ly);
    ctx.textAlign = 'right';
    ctx.fillStyle = GM.textDim;
    ctx.fillText(`${xpState.xp} / ${xpState.xpToNext}`, x + w, ly);
    ctx.textAlign = 'left';
    ly += 14;
    _drawStatBar(x, ly, w, barH, xpRatio, GM.xpAmber, GM.xpAmberLit, fa);
    ly += barH + 18;

    // --- Form-aware stats ---
    const eb = getEquipBonuses();
    const formCfg = FormSystem.getFormConfig() || FORM_CONFIGS.wizard;
    const form = FormSystem.currentForm || 'wizard';

    // --- HP (effective max = base + equipment + talisman + quest bonuses) ---
    const _qHpBonus = (typeof questState !== 'undefined') ? (questState.permBonuses.maxHpBonus || 0) : 0;
    const effMaxHP = formCfg.maxHp + (eb.maxHpBonus || 0) + getTalismanBonus().hpBonus + _qHpBonus;
    ctx.globalAlpha = fa * 0.7;
    ctx.font = '10px Georgia';
    ctx.fillStyle = labelCol;
    ctx.fillText('Health', x, ly);
    ctx.textAlign = 'right';
    ctx.fillStyle = valCol;
    ctx.globalAlpha = fa * 0.6;
    ctx.fillText(`${Math.round(player.hp)} / ${Math.round(effMaxHP)}`, x + w, ly);
    ctx.textAlign = 'left';
    ly += 15;
    _drawStatBar(x, ly, w, barH, player.hp / effMaxHP, GM.hpRed, GM.hpRedLit, fa);
    ly += barH + 18;

    // --- Resource bar (Mana for wizard, Size for slime, Stamina for skeleton, Soul Energy for lich) ---
    if (formCfg.maxMana > 0) {
        // Wizard: mana bar
        const effMaxMana = formCfg.maxMana + (eb.maxManaBonus || 0);
        ctx.globalAlpha = fa * 0.7;
        ctx.font = '10px Georgia';
        ctx.fillStyle = labelCol;
        ctx.fillText(formCfg.resourceName || 'Mana', x, ly);
        ctx.textAlign = 'right';
        ctx.fillStyle = valCol;
        ctx.globalAlpha = fa * 0.6;
        ctx.fillText(`${Math.round(player.mana)} / ${Math.round(effMaxMana)}`, x + w, ly);
        ctx.textAlign = 'left';
        ly += 15;
        _drawStatBar(x, ly, w, barH, player.mana / effMaxMana, GM.manaBlue, GM.manaBluLit, fa);
        ly += barH + 24;
    } else if (form === 'slime' && typeof slimeState !== 'undefined') {
        // Slime: size bar
        ctx.globalAlpha = fa * 0.7;
        ctx.font = '10px Georgia';
        ctx.fillStyle = labelCol;
        ctx.fillText('Size', x, ly);
        ctx.textAlign = 'right';
        ctx.fillStyle = valCol;
        ctx.globalAlpha = fa * 0.6;
        const curSize = slimeState.size || 1;
        ctx.fillText(`${curSize.toFixed(1)} / 6.0`, x + w, ly);
        ctx.textAlign = 'left';
        ly += 15;
        _drawStatBar(x, ly, w, barH, curSize / 6.0, '#44dd66', '#66ff88', fa);
        ly += barH + 24;
    } else if (form === 'skeleton' && typeof skeletonState !== 'undefined') {
        // Skeleton: stamina bar
        ctx.globalAlpha = fa * 0.7;
        ctx.font = '10px Georgia';
        ctx.fillStyle = labelCol;
        ctx.fillText('Stamina', x, ly);
        ctx.textAlign = 'right';
        ctx.fillStyle = valCol;
        ctx.globalAlpha = fa * 0.6;
        const curStam = skeletonState.stamina || 0;
        const maxStam = skeletonState.maxStamina || 100;
        ctx.fillText(`${Math.round(curStam)} / ${Math.round(maxStam)}`, x + w, ly);
        ctx.textAlign = 'left';
        ly += 15;
        _drawStatBar(x, ly, w, barH, curStam / maxStam, '#e8c050', '#ffe070', fa);
        ly += barH + 24;
    } else if (form === 'lich' && typeof lichState !== 'undefined') {
        // Lich: soul energy bar
        ctx.globalAlpha = fa * 0.7;
        ctx.font = '10px Georgia';
        ctx.fillStyle = labelCol;
        ctx.fillText('Soul Energy', x, ly);
        ctx.textAlign = 'right';
        ctx.fillStyle = valCol;
        ctx.globalAlpha = fa * 0.6;
        const curSoul = lichState.soulEnergy || 0;
        const maxSoul = lichState.maxSoulEnergy || 100;
        ctx.fillText(`${Math.round(curSoul)} / ${Math.round(maxSoul)}`, x + w, ly);
        ctx.textAlign = 'left';
        ly += 15;
        _drawStatBar(x, ly, w, barH, curSoul / maxSoul, '#8844aa', '#aa66cc', fa);
        ly += barH + 24;
    } else {
        ly += barH + 24;
    }

    // --- Divider ---
    _drawDivider(x + w / 2, ly, w * 0.3, fa);
    ly += 14;

    // --- Stat rows — form-aware damage label ---
    const dmgLabel = form === 'slime' ? 'Acid Damage' : form === 'skeleton' ? 'Bone Damage' : form === 'lich' ? 'Soul Damage' : 'Wand Damage';
    const baseDmg = formCfg.primaryDmg || 20;
    const _qDmgBonus = (typeof questState !== 'undefined') ? (questState.permBonuses.dmgBonus || 0) : 0;
    const statRows = [
        { label: dmgLabel, value: baseDmg + (eb.dmgBonus || 0) + _qDmgBonus },
        { label: 'Creatures Slain', value: wave.totalKilled },
        { label: 'Zone', value: currentZone >= 100 ? 'Depth ' + (currentZone - 99) : currentZone },
    ];
    ctx.font = '10px Georgia';
    for (const s of statRows) {
        ctx.globalAlpha = fa * 0.45;
        ctx.fillStyle = labelCol;
        ctx.textAlign = 'left';
        ctx.fillText(s.label, x, ly);
        ctx.globalAlpha = fa * 0.7;
        ctx.fillStyle = valCol;
        ctx.textAlign = 'right';
        ctx.fillText('' + s.value, x + w, ly);
        ly += 20;
    }

    // --- Divider before talisman section ---
    ly += 4;
    _drawDivider(x + w / 2, ly, w * 0.3, fa);
    ly += 14;

    // --- Talisman Perks ---
    if (FormSystem.talisman.found) {
        const tLvl = FormSystem.talisman.level;

        // Talisman icon (if sprite loaded)
        const talisIcon = images.icon_talisman;
        const iconSize = 32;
        if (talisIcon) {
            ctx.globalAlpha = fa * 0.85;
            ctx.drawImage(talisIcon, x, ly - 2, iconSize, iconSize);
        }
        const textOffsetX = talisIcon ? iconSize + 6 : 0;

        ctx.globalAlpha = fa * 0.6;
        ctx.font = 'bold 11px Georgia';
        ctx.fillStyle = GM.gold;
        ctx.textAlign = 'left';
        ctx.fillText('TALISMAN LV.' + tLvl, x + textOffsetX, ly + (talisIcon ? 8 : 0));
        ctx.globalAlpha = fa * 0.35;
        ctx.font = '9px Georgia';
        ctx.fillStyle = GM.textDim;
        ctx.fillText('Ancient Talisman', x + textOffsetX, ly + (talisIcon ? 20 : 12));
        ly += talisIcon ? iconSize + 4 : 16;

        for (const perk of FormSystem.talisman.perks) {
            ctx.globalAlpha = fa * 0.8;
            ctx.font = '10px Georgia';
            ctx.fillStyle = '#ffd700';
            ctx.fillText(perk.name, x, ly);
            ctx.globalAlpha = fa * 0.45;
            ctx.font = '9px Georgia';
            ctx.fillStyle = GM.textDim;
            ctx.textAlign = 'right';
            ctx.fillText(perk.desc, x + w, ly);
            ctx.textAlign = 'left';
            ly += 14;
        }

        if (typeof TALISMAN_PERKS !== 'undefined') {
            const nextPerk = TALISMAN_PERKS.find(p => p.level === tLvl + 1);
            if (nextPerk) {
                ctx.globalAlpha = fa * 0.25;
                ctx.font = 'italic 9px Georgia';
                ctx.fillStyle = GM.textDim;
                ctx.fillText('Next: ' + nextPerk.name, x, ly);
                ctx.textAlign = 'right';
                ctx.fillText(nextPerk.desc, x + w, ly);
                ctx.textAlign = 'left';
                ly += 14;
            }
        }
        ly += 4;
    }

    // --- Divider before evolution section ---
    _drawDivider(x + w / 2, ly, w * 0.3, fa);
    ly += 14;

    // --- Evolution Progress ---
    drawEvolutionProgress(x, ly, w, h - ly - 20, fa);

    ctx.restore();
}

// ===== EQUIPMENT TAB (unified inventory) =====
// Layout helpers for equipment tab — used by both drawing and click handling
const GRIM_EQUIP_SIZE = 52;
const GRIM_BP_SIZE = 46;
const GRIM_BP_GAP = 5;
const GRIM_BP_COLS = 4;

function getGrimEquipRect(slotIdx, x, y, w) {
    const totalW = EQUIP_SLOTS.length * GRIM_EQUIP_SIZE + (EQUIP_SLOTS.length - 1) * 10;
    const sx = x + (w - totalW) / 2;
    const sy = y + 4;
    return { x: sx + slotIdx * (GRIM_EQUIP_SIZE + 10), y: sy, w: GRIM_EQUIP_SIZE, h: GRIM_EQUIP_SIZE };
}

function getGrimBpRect(idx, x, y, w) {
    const totalW = GRIM_BP_COLS * GRIM_BP_SIZE + (GRIM_BP_COLS - 1) * GRIM_BP_GAP;
    const sx = x + (w - totalW) / 2;
    const sy = y + GRIM_EQUIP_SIZE + 52;
    const col = idx % GRIM_BP_COLS;
    const row = Math.floor(idx / GRIM_BP_COLS);
    return { x: sx + col * (GRIM_BP_SIZE + GRIM_BP_GAP), y: sy + row * (GRIM_BP_SIZE + GRIM_BP_GAP), w: GRIM_BP_SIZE, h: GRIM_BP_SIZE };
}

function getGrimDropRect(x, y, w, h) {
    const bw = 110, bh = 26;
    return { x: x + w / 2 - bw / 2, y: y + h - 30, w: bw, h: bh };
}

// Track hovered item in equipment tab for tooltip
let grimEquipTooltipItem = null;

function drawMenuEquipment(x, y, w, h, fa) {
    ctx.save();
    grimEquipTooltipItem = null;

    if (menuFadeInTimer < 0.95) { ctx.restore(); return; } // skip hover during open animation

    // === EQUIPPED GEAR SLOTS ===
    for (let i = 0; i < EQUIP_SLOTS.length; i++) {
        const slot = EQUIP_SLOTS[i];
        const rect = getGrimEquipRect(i, x, y, w);
        const item = inventory.equipped[slot];
        const hovered = mouse.x >= rect.x && mouse.x <= rect.x + rect.w &&
                        mouse.y >= rect.y && mouse.y <= rect.y + rect.h;

        if (hovered && item) grimEquipTooltipItem = item;

        drawItemSlot(rect.x, rect.y, rect.w, rect.h, item, hovered, true, slot);

        // Slot label below
        ctx.globalAlpha = fa * (item ? 0.5 : 0.25);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = '8px monospace';
        ctx.fillStyle = item ? RARITY[item.rarity].color : '#8a7a5a';
        // Colorblind: prepend rarity symbol
        const _slotLabel = SLOT_LABELS[slot].toUpperCase();
        const _cbSym = (item && gameSettings.colorblindMode === 'symbols' && typeof RARITY_SYMBOLS !== 'undefined')
            ? RARITY_SYMBOLS[item.rarity].symbol + ' ' : '';
        ctx.fillText(_cbSym + _slotLabel, rect.x + rect.w / 2, rect.y + rect.h + 3);
    }

    // === SET BONUSES (if any active) ===
    if (typeof EQUIP_SETS !== 'undefined' && typeof getActiveSetBonuses === 'function') {
        const equipped = [];
        for (const slot of EQUIP_SLOTS) {
            const item = inventory.equipped[slot];
            if (item) equipped.push(item.name);
        }
        let setBonusY = y + GRIM_EQUIP_SIZE + 20;
        let hasSetBonus = false;
        for (const [setId, set] of Object.entries(EQUIP_SETS)) {
            const count = set.items.filter(name => equipped.includes(name)).length;
            if (count < 2) continue;
            hasSetBonus = true;
            const setNames = { infernal: 'Infernal', arcane: 'Arcane', warden: 'Warden' };
            const label = setNames[setId] || setId;
            const tier = count >= 4 ? '4' : '2';
            const desc = count >= 4 && set.bonus4 ? set.bonus4.desc : set.bonus2.desc;
            ctx.globalAlpha = fa * 0.6;
            ctx.textAlign = 'center';
            ctx.font = '8px monospace';
            ctx.fillStyle = '#ffd700';
            ctx.fillText(label + ' Set (' + count + '/4): ' + desc, x + w / 2, setBonusY);
            setBonusY += 11;
        }
    }

    // === BACKPACK SEPARATOR ===
    const sepY = y + GRIM_EQUIP_SIZE + 30;
    ctx.globalAlpha = fa * 0.12;
    ctx.strokeStyle = GM.goldFaint;
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(x + 40, sepY); ctx.lineTo(x + w - 40, sepY); ctx.stroke();

    ctx.globalAlpha = fa * 0.35;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '9px monospace';
    ctx.fillStyle = '#a89060';
    ctx.fillText('BACKPACK', x + w / 2, sepY + 10);

    // === BACKPACK GRID ===
    for (let i = 0; i < inventory.maxBackpack; i++) {
        const rect = getGrimBpRect(i, x, y, w);
        const item = inventory.backpack[i] || null;
        const hovered = mouse.x >= rect.x && mouse.x <= rect.x + rect.w &&
                        mouse.y >= rect.y && mouse.y <= rect.y + rect.h;

        if (hovered && item) grimEquipTooltipItem = item;

        drawItemSlot(rect.x, rect.y, rect.w, rect.h, item, hovered, false, null);
    }

    // === DROP BUTTON ===
    const dropRect = getGrimDropRect(x, y, w, h);
    const dropHovered = mouse.x >= dropRect.x && mouse.x <= dropRect.x + dropRect.w &&
                        mouse.y >= dropRect.y && mouse.y <= dropRect.y + dropRect.h;

    ctx.globalAlpha = fa * (dropHovered ? 0.55 : 0.25);
    ctx.fillStyle = '#140808';
    ctx.beginPath(); ctx.roundRect(dropRect.x, dropRect.y, dropRect.w, dropRect.h, 3); ctx.fill();
    ctx.globalAlpha = fa * (dropHovered ? 0.6 : 0.2);
    ctx.strokeStyle = dropHovered ? '#aa4444' : '#443333';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(dropRect.x, dropRect.y, dropRect.w, dropRect.h, 3); ctx.stroke();

    ctx.globalAlpha = fa * (dropHovered ? 0.75 : 0.35);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '9px monospace';
    ctx.fillStyle = dropHovered ? '#cc6666' : '#886666';
    ctx.fillText('DROP ITEM', dropRect.x + dropRect.w / 2, dropRect.y + dropRect.h / 2);

    // === TOOLTIP (drawn last, on top) ===
    if (grimEquipTooltipItem) {
        drawItemTooltip(grimEquipTooltipItem, mouse.x, mouse.y);
    }

    ctx.restore();
}

// ===== KEY ITEMS TAB =====
// Clickable key item regions (rebuilt each frame by drawMenuKeyItems)
const _keyItemClickRects = [];

function drawMenuKeyItems(x, y, w, h, fa) {
    ctx.save();
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    _keyItemClickRects.length = 0;

    let ly = y + 6;

    if (keyItems.length === 0) {
        ctx.globalAlpha = fa * 0.3;
        ctx.font = 'italic 11px Georgia';
        ctx.fillStyle = GM.textDim;
        ctx.fillText('Nothing of note discovered.', x, ly);
        ly += 28;
        ctx.globalAlpha = fa * 0.15;
        ctx.font = 'italic 9px Georgia';
        ctx.fillText('Explore the dungeon to find items of power.', x, ly);
        ctx.restore();
        return;
    }

    for (const item of keyItems) {
        const itemStartY = ly;
        const def = KEY_ITEM_DEFS[item.id];
        const hasPages = def && def.pages && def.pages.length > 0;

        // Item icon — small diamond in item color
        ctx.globalAlpha = fa * 0.6;
        ctx.fillStyle = item.color;
        const dx = x + 6, dy = ly + 6;
        ctx.beginPath();
        ctx.moveTo(dx, dy - 4); ctx.lineTo(dx + 4, dy);
        ctx.lineTo(dx, dy + 4); ctx.lineTo(dx - 4, dy);
        ctx.fill();

        // Item name
        ctx.globalAlpha = fa * 0.85;
        ctx.font = 'bold 11px Georgia';
        ctx.fillStyle = item.color;
        ctx.fillText(item.name, x + 16, ly);

        // "Read" hint for items with pages
        if (hasPages) {
            ctx.globalAlpha = fa * 0.35;
            ctx.font = '8px monospace';
            ctx.fillStyle = '#c4a878';
            ctx.textAlign = 'right';
            ctx.fillText('[ read ]', x + w, ly + 2);
            ctx.textAlign = 'left';
        }
        ly += 16;

        // Description word-wrapped
        ctx.globalAlpha = fa * 0.35;
        ctx.font = 'italic 9px Georgia';
        ctx.fillStyle = GM.textMid;
        const words = item.desc.split(' ');
        let line = '';
        for (const word of words) {
            const test = line + (line ? ' ' : '') + word;
            if (ctx.measureText(test).width > w - 24) {
                ctx.fillText(line, x + 16, ly);
                ly += 12;
                line = word;
            } else {
                line = test;
            }
        }
        if (line) { ctx.fillText(line, x + 16, ly); ly += 12; }
        ly += 14;

        // Store clickable rect for items with pages
        if (hasPages) {
            _keyItemClickRects.push({ x: x, y: itemStartY, w: w, h: ly - itemStartY, itemId: item.id });
        }
    }

    ctx.restore();
}

// ===== QUESTS TAB =====
function drawMenuQuests(x, y, w, h, fa) {
    ctx.save();
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    let ly = y + 6;

    // Current objective display at top
    if (typeof currentObjective !== 'undefined' && currentObjective) {
        ctx.globalAlpha = fa * 0.6;
        ctx.font = '9px monospace';
        ctx.fillStyle = '#887766';
        ctx.fillText('CURRENT OBJECTIVE', x, ly);
        ly += 14;
        ctx.globalAlpha = fa * 0.85;
        ctx.font = 'italic 11px Georgia';
        ctx.fillStyle = '#e8c840';
        ctx.fillText(currentObjective, x + 4, ly);
        ly += 20;
        // Divider
        ctx.globalAlpha = fa * 0.15;
        ctx.strokeStyle = '#8a7a5a'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, ly); ctx.lineTo(x + w - 20, ly); ctx.stroke();
        ly += 10;
    }

    // Build dynamic quest entries based on game state
    const quests = [];
    if (currentZone === 1) {
        quests.push({
            text: 'Survive the dungeon waves',
            done: wave.phase === 'zoneClear' || (wave.phase === 'cleared' && wave.current >= ZONE_1_FINAL_WAVE),
        });
        quests.push({
            text: 'Find the Rusted Key',
            done: hasKeyItem('chest_key'),
        });
        quests.push({
            text: 'Open the locked chest',
            done: hasKeyItem('journal'),
        });
        quests.push({
            text: 'Ascend to the next floor',
            done: currentZone > 1,
        });
    }
    if (currentZone >= 2) {
        quests.push({
            text: 'Explore the Ruined Tower',
            done: (wave.phase === 'zoneClear' && currentZone === 2) || currentZone > 2,
        });
        quests.push({
            text: 'Find Elara\'s letter',
            done: hasKeyItem('elara_letter'),
        });
        quests.push({
            text: 'Ascend to the Spire',
            done: currentZone > 2,
        });
    }
    if (currentZone >= 3) {
        quests.push({
            text: 'Defeat the guardian of the Spire',
            done: currentZone > 3,
        });
    }
    if (currentZone >= 4) {
        quests.push({
            text: 'Descend through the Inferno',
            done: currentZone > 4,
        });
        quests.push({
            text: 'Find the charred fragment',
            done: hasKeyItem('charred_fragment'),
        });
        quests.push({
            text: 'Speak with the Fading Pilgrim',
            done: typeof _npcDialogueProgress !== 'undefined' && (_npcDialogueProgress['ghost_pilgrim'] || 0) > 0,
        });
    }
    if (currentZone >= 5) {
        quests.push({
            text: 'Cross the Frozen Abyss',
            done: currentZone > 5,
        });
        quests.push({
            text: 'Follow Elara\'s frozen echoes',
            done: currentZone > 5,  // completed when player has moved past zone 5
        });
    }
    if (currentZone >= 6) {
        quests.push({
            text: 'Reach the Throne of Ruin',
            done: (wave.phase === 'zoneClear' && currentZone === 6),
        });
        quests.push({
            text: 'Speak to Elara',
            done: typeof endingChoice !== 'undefined' && endingChoice !== null,
        });
    }

    // --- NPC Quest Chains (from QUEST_REGISTRY) ---
    if (typeof QUEST_REGISTRY !== 'undefined' && typeof questState !== 'undefined') {
        for (const quest of QUEST_REGISTRY) {
            // Only show quests that have been started or completed
            const started = questState.flags[quest.steps[0].condition] || isQuestComplete(quest.id);
            if (!started) continue;

            const completed = isQuestComplete(quest.id);

            // Section header for this quest chain
            quests.push({ text: '', done: false, isSpacer: true });
            quests.push({
                text: quest.name + (completed ? '  [COMPLETE]' : ''),
                done: completed,
                isHeader: true,
            });

            // Individual steps
            for (const step of quest.steps) {
                const stepDone = !!questState.flags[step.condition];
                quests.push({ text: step.text, done: stepDone });
            }

            // Captain bounty: show kill progress
            if (quest.id === 'captain_bounty' && !completed && questState.flags.captain_quest_started) {
                const kills = questState.flags.elite_bounty_kills || 0;
                quests.push({ text: '  Progress: ' + kills + '/5 elites slain', done: false, isProgress: true });
            }

            // Reward line — show for completed, preview for active
            if (completed) {
                const rewardDesc = quest.reward.type === 'choice'
                    ? (quest.reward.choices[questState.flags[quest.id + '_choice'] || 'a'] || {}).desc || quest.reward.choices.a.desc
                    : quest.reward.type === 'stat_tiered'
                        ? (quest.reward.tiers[questState.flags.ore_quality || 1] || {}).desc || quest.reward.desc
                        : quest.reward.desc;
                quests.push({ text: 'Reward: ' + rewardDesc, done: true, isReward: true });
            } else {
                // Preview potential reward for active quests
                let previewDesc = '';
                if (quest.reward.type === 'stat') previewDesc = quest.reward.desc;
                else if (quest.reward.type === 'stat_tiered') previewDesc = quest.reward.tiers[3].desc + ' (best)';
                else if (quest.reward.type === 'gold_and_stat') previewDesc = quest.reward.desc;
                else if (quest.reward.type === 'choice') previewDesc = 'Choice reward';
                else if (quest.reward.type === 'upgrade_reroll') previewDesc = quest.reward.desc;
                if (previewDesc) quests.push({ text: 'Reward: ' + previewDesc, done: false, isRewardPreview: true });
            }
        }
    }

    if (quests.length === 0) {
        ctx.globalAlpha = fa * 0.3;
        ctx.font = 'italic 11px Georgia';
        ctx.fillStyle = GM.textDim;
        ctx.fillText('Your purpose here is unclear...', x, ly);
        ly += 28;
        ctx.globalAlpha = fa * 0.15;
        ctx.font = 'italic 9px Georgia';
        ctx.fillText('Perhaps the dungeon itself will reveal the way.', x, ly);
        ctx.restore();
        return;
    }

    for (const q of quests) {
        // Spacer
        if (q.isSpacer) {
            ly += 10;
            continue;
        }

        // Quest chain header
        if (q.isHeader) {
            ctx.globalAlpha = fa * (q.done ? 0.4 : 0.7);
            ctx.font = q.done ? 'italic bold 11px Georgia' : 'bold 11px Georgia';
            ctx.fillStyle = q.done ? '#88cc88' : GM.gold;
            ctx.fillText(q.text, x, ly);
            ly += 18;
            continue;
        }

        // Reward line (completed quest)
        if (q.isReward) {
            ctx.globalAlpha = fa * 0.4;
            ctx.font = 'italic 9px Georgia';
            ctx.fillStyle = '#88cc88';
            ctx.fillText(q.text, x + 20, ly + 1);
            ly += 20;
            continue;
        }

        // Reward preview (active quest)
        if (q.isRewardPreview) {
            ctx.globalAlpha = fa * 0.25;
            ctx.font = 'italic 9px Georgia';
            ctx.fillStyle = '#ccaa66';
            ctx.fillText(q.text, x + 20, ly + 1);
            ly += 18;
            continue;
        }

        // Kill progress line (Captain bounty)
        if (q.isProgress) {
            ctx.globalAlpha = fa * 0.5;
            ctx.font = '9px monospace';
            ctx.fillStyle = '#e8c840';
            ctx.fillText(q.text, x + 20, ly + 1);
            ly += 16;
            continue;
        }

        // Checkbox
        ctx.globalAlpha = fa * (q.done ? 0.4 : 0.2);
        ctx.strokeStyle = q.done ? GM.gold : GM.goldFaint;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, ly, 12, 12, 2);
        ctx.stroke();
        if (q.done) {
            ctx.globalAlpha = fa * 0.5;
            ctx.fillStyle = GM.gold;
            ctx.beginPath();
            ctx.moveTo(x + 2.5, ly + 6);
            ctx.lineTo(x + 5, ly + 9.5);
            ctx.lineTo(x + 10, ly + 2.5);
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }

        // Quest text
        ctx.globalAlpha = fa * (q.done ? 0.3 : 0.6);
        ctx.font = q.done ? 'italic 10px Georgia' : '10px Georgia';
        ctx.fillStyle = q.done ? GM.textDim : GM.textLight;
        ctx.fillText(q.text, x + 20, ly + 1);
        ly += 24;
    }

    ctx.restore();
}

// ===== MAP TAB =====
function drawMenuMap(x, y, w, h, fa) {
    ctx.save();
    ctx.globalAlpha = fa;

    // --- Zone title ---
    ctx.font = 'small-caps bold 13px Georgia';
    ctx.fillStyle = GM.gold;
    ctx.textAlign = 'center';
    const zoneNames = { 0: 'The Hamlet', 1: 'The Undercroft', 2: 'Ruined Tower', 3: 'The Spire' };
    ctx.fillText(zoneNames[currentZone] || `Zone ${currentZone}`, x + w / 2, y + 14);
    ctx.font = '9px Georgia';
    ctx.globalAlpha = fa * 0.4;
    ctx.fillStyle = GM.textMid;
    ctx.fillText(`Zone ${currentZone}`, x + w / 2, y + 26);

    // --- Compute map layout (fill as much panel as possible) ---
    const ms = floorMap.length;
    const maxMapH = h - 52;  // title + legend
    const maxMapW = w - 16;
    const cellSize = Math.max(3, Math.min(Math.floor(maxMapW / ms), Math.floor(maxMapH / ms)));
    const mapW = ms * cellSize;
    const mapH = ms * cellSize;
    const mapX = x + (w - mapW) / 2;
    const mapY = y + 32;

    // --- Dark parchment background ---
    ctx.globalAlpha = fa * 0.35;
    const parchGrad = ctx.createLinearGradient(mapX, mapY, mapX + mapW, mapY + mapH);
    parchGrad.addColorStop(0, '#1a1510');
    parchGrad.addColorStop(0.5, '#1e1812');
    parchGrad.addColorStop(1, '#141008');
    ctx.fillStyle = parchGrad;
    ctx.beginPath();
    ctx.roundRect(mapX - 6, mapY - 6, mapW + 12, mapH + 12, 4);
    ctx.fill();

    // Subtle border
    ctx.globalAlpha = fa * 0.2;
    ctx.strokeStyle = GM.goldDim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(mapX - 6, mapY - 6, mapW + 12, mapH + 12, 4);
    ctx.stroke();

    // --- Draw tiles ---
    const pRow = Math.round(player.row);
    const pCol = Math.round(player.col);

    for (let r = 0; r < ms; r++) {
        for (let c = 0; c < ms; c++) {
            const cx = mapX + c * cellSize;
            const cy = mapY + r * cellSize;
            const ft = floorMap[r] && floorMap[r][c];

            if (!ft) continue; // void — leave black

            const isBlocked = blocked[r] && blocked[r][c];
            const isWall = blockType[r] && blockType[r][c] === 'wall';
            const hasObj = objectMap[r] && objectMap[r][c];
            const objName = hasObj ? objectMap[r][c] : null;

            if (isWall) {
                // Walls: dark stone color
                ctx.globalAlpha = fa * 0.6;
                ctx.fillStyle = '#2c241c';
                ctx.fillRect(cx, cy, cellSize, cellSize);
            } else if (!isBlocked) {
                // Walkable floor: warm muted tone
                ctx.globalAlpha = fa * 0.4;
                ctx.fillStyle = '#4a3c2e';
                ctx.fillRect(cx, cy, cellSize, cellSize);

                // Subtle grid hint (only on larger cells)
                if (cellSize >= 5) {
                    ctx.globalAlpha = fa * 0.08;
                    ctx.strokeStyle = '#8a7a60';
                    ctx.lineWidth = 0.3;
                    ctx.strokeRect(cx, cy, cellSize, cellSize);
                }
            } else if (hasObj) {
                // Blocked by object: slightly lighter than wall
                ctx.globalAlpha = fa * 0.5;
                ctx.fillStyle = '#3a3028';
                ctx.fillRect(cx, cy, cellSize, cellSize);
            }

            // --- Special markers ---
            if (objName === 'chestClosed' || objName === 'chestOpen') {
                const opened = openedChests.has(`${r},${c}`);
                ctx.globalAlpha = fa * 0.9;
                ctx.fillStyle = opened ? '#5a5040' : '#e4c45c';
                const dotR = Math.max(1.5, cellSize * 0.35);
                ctx.beginPath();
                ctx.rect(cx + cellSize / 2 - dotR, cy + cellSize / 2 - dotR, dotR * 2, dotR * 2);
                ctx.fill();
            }

            if (objName === 'stairsSpiral' || objName === 'stairs' || objName === 'stairsAged') {
                ctx.globalAlpha = fa * 0.85;
                ctx.fillStyle = '#5888cc';
                const dotR = Math.max(1.5, cellSize * 0.35);
                ctx.beginPath();
                ctx.arc(cx + cellSize / 2, cy + cellSize / 2, dotR, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    // --- Enemy dots (red, pulsing) ---
    const enemyPulse = 0.5 + Math.sin(performance.now() / 300) * 0.3;
    ctx.globalAlpha = fa * enemyPulse;
    ctx.fillStyle = '#cc3333';
    for (const e of enemies) {
        if (e.state === 'death') continue;
        const er = Math.round(e.row);
        const ec = Math.round(e.col);
        const ex = mapX + ec * cellSize + cellSize / 2;
        const ey = mapY + er * cellSize + cellSize / 2;
        const dotR = Math.max(1.5, cellSize * 0.3);
        ctx.beginPath();
        ctx.arc(ex, ey, dotR, 0, Math.PI * 2);
        ctx.fill();
    }

    // --- Player dot (form-colored, pulsing glow) ---
    const _mapFormColors = { slime: '#88dd44', skeleton: '#ddddff', wizard: '#5588ff', lich: '#aa44ff' };
    const _mapFormGlow = { slime: '#66bb22', skeleton: '#aaaacc', wizard: '#3366cc', lich: '#7722cc' };
    const _mapFormColor = _mapFormColors[FormSystem.currentForm] || GM.goldBright;
    const _mapFormGlowC = _mapFormGlow[FormSystem.currentForm] || GM.goldBright;
    const playerPulse = 0.7 + Math.sin(performance.now() / 400) * 0.3;
    const plX = mapX + pCol * cellSize + cellSize / 2;
    const plY = mapY + pRow * cellSize + cellSize / 2;
    const plR = Math.max(2.5, cellSize * 0.5);

    // Glow ring
    ctx.globalAlpha = fa * playerPulse * 0.3;
    ctx.fillStyle = _mapFormGlowC;
    ctx.beginPath();
    ctx.arc(plX, plY, plR * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Solid dot
    ctx.globalAlpha = fa * 0.95;
    ctx.fillStyle = _mapFormColor;
    ctx.beginPath();
    ctx.arc(plX, plY, plR, 0, Math.PI * 2);
    ctx.fill();

    // White core
    ctx.globalAlpha = fa * 0.6;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(plX, plY, plR * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // --- Room labels with readable names ---
    const roomDisplayNames = {
        Cell: 'The Cell', GuardHall: 'Guard Hall', GreatHall: 'Great Hall',
        Alcove: 'Alcove', Vestibule: 'Vestibule', RuinedArmory: 'Ruined Armory',
        GuardBarracks: 'Guard Barracks', ThroneAntechamber: 'Throne Antechamber',
        GrandEntrance: 'Grand Entrance', ThroneRoom: 'Throne Room',
    };
    ctx.textAlign = 'center';
    for (const room of ROOM_BOUNDS) {
        if (room.name.startsWith('Corridor')) continue;
        const displayName = roomDisplayNames[room.name] || room.name;
        const labelR = (room.r1 + room.r2) / 2;
        const labelC = (room.c1 + room.c2) / 2;
        const lx = mapX + labelC * cellSize + cellSize / 2;
        const ly = mapY + labelR * cellSize + cellSize / 2;

        // Dark backing for readability
        ctx.globalAlpha = fa * 0.5;
        ctx.fillStyle = '#0c0a08';
        const tw = ctx.measureText(displayName).width;
        ctx.fillRect(lx - tw / 2 - 4, ly - 5, tw + 8, 12);

        // Label text
        ctx.globalAlpha = fa * 0.5;
        ctx.font = 'small-caps 8px Georgia';
        ctx.fillStyle = GM.goldDim;
        ctx.fillText(displayName, lx, ly + 3);
    }

    // --- Legend ---
    const legY = mapY + mapH + 14;
    ctx.textAlign = 'left';
    ctx.font = '9px Georgia';

    // Player
    ctx.globalAlpha = fa * 0.9;
    ctx.fillStyle = GM.goldBright;
    ctx.beginPath(); ctx.arc(x + 16, legY - 2, 3, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = fa * 0.5;
    ctx.fillStyle = GM.textMid;
    ctx.fillText('You', x + 24, legY);

    // Enemies
    ctx.globalAlpha = fa * 0.9;
    ctx.fillStyle = '#cc3333';
    ctx.beginPath(); ctx.arc(x + 62, legY - 2, 3, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = fa * 0.5;
    ctx.fillStyle = GM.textMid;
    ctx.fillText('Enemies', x + 70, legY);

    // Chest
    ctx.globalAlpha = fa * 0.9;
    ctx.fillStyle = '#e4c45c';
    ctx.fillRect(x + 122, legY - 5, 6, 6);
    ctx.globalAlpha = fa * 0.5;
    ctx.fillStyle = GM.textMid;
    ctx.fillText('Chest', x + 132, legY);

    // Stairs
    ctx.globalAlpha = fa * 0.9;
    ctx.fillStyle = '#5888cc';
    ctx.beginPath(); ctx.arc(x + 176, legY - 2, 3, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = fa * 0.5;
    ctx.fillStyle = GM.textMid;
    ctx.fillText('Stairs', x + 184, legY);

    ctx.restore();
}

// ===== BESTIARY TAB — enemy knowledge tracker =====
function drawMenuBestiary(x, y, w, h, fa) {
    if (typeof playerProfile === 'undefined') return;
    ctx.save();
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    let ly = y + 6;

    // Title
    ctx.font = 'bold 12px Georgia';
    ctx.fillStyle = '#c4a878';
    ctx.globalAlpha = fa * 0.7;
    ctx.fillText('Creatures Encountered', x, ly);
    ly += 18;

    // Stats summary
    ctx.font = '9px monospace';
    ctx.fillStyle = '#887766';
    ctx.globalAlpha = fa * 0.5;
    ctx.fillText('Total kills: ' + playerProfile.totalKills + '  |  Deaths: ' + playerProfile.totalDeaths + '  |  Runs: ' + playerProfile.totalRuns, x, ly);
    ly += 16;

    // Divider
    ctx.globalAlpha = fa * 0.15;
    ctx.strokeStyle = '#8a7a5a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, ly); ctx.lineTo(x + w - 20, ly); ctx.stroke();
    ly += 8;

    // Enemy list from bestiary
    const entries = [];
    const _enemyDisplayNames = {
        slime: 'Slime', skeleton: 'Skeleton', skelarch: 'Skeleton Archer',
        armoredskel: 'Armored Skeleton', fire_slime: 'Fire Slime',
        frost_archer: 'Frost Archer', shadow_knight: 'Shadow Knight',
        bone_mage: 'Bone Mage', pit_lurker: 'Pit Lurker', werewolf: 'Werewolf',
        slime_king: 'Slime King', demon_slime_king: 'Demon Slime King',
        bone_colossus: 'Bone Colossus', infernal_knight: 'Infernal Knight',
        frost_wyrm: 'Frost Wyrm', ruined_king: 'Ruined King',
    };
    for (const type in playerProfile.bestiary) {
        if (type === '_eliteKills') continue;
        const entry = playerProfile.bestiary[type];
        entries.push({ type: type, name: _enemyDisplayNames[type] || entry.name || type, killed: entry.killed || 0, killedBy: entry.killedBy || 0 });
    }
    // Sort by kill count descending
    entries.sort(function(a, b) { return b.killed - a.killed; });

    if (entries.length === 0) {
        ctx.globalAlpha = fa * 0.3;
        ctx.font = 'italic 11px Georgia';
        ctx.fillStyle = '#887766';
        ctx.fillText('No creatures encountered yet...', x, ly);
        ctx.restore();
        return;
    }

    // Column headers
    ctx.font = '8px monospace';
    ctx.fillStyle = '#776655';
    ctx.globalAlpha = fa * 0.4;
    ctx.fillText('ENEMY', x, ly);
    ctx.fillText('SLAIN', x + w - 100, ly);
    ctx.fillText('DIED TO', x + w - 50, ly);
    ly += 14;

    for (let i = 0; i < entries.length && ly < y + h - 20; i++) {
        const e = entries[i];
        const isBoss = ['slime_king', 'demon_slime_king', 'bone_colossus', 'infernal_knight', 'frost_wyrm', 'ruined_king'].indexOf(e.type) !== -1;

        // Enemy name
        ctx.font = isBoss ? 'bold 10px Georgia' : '10px Georgia';
        ctx.fillStyle = isBoss ? '#e8c840' : '#b09878';
        ctx.globalAlpha = fa * 0.8;
        ctx.fillText(e.name, x + 4, ly);

        // Kill count
        ctx.font = '10px monospace';
        ctx.fillStyle = '#88aa88';
        ctx.globalAlpha = fa * 0.7;
        ctx.fillText(String(e.killed), x + w - 95, ly);

        // Killed-by count
        ctx.fillStyle = e.killedBy > 0 ? '#cc6644' : '#555';
        ctx.globalAlpha = fa * (e.killedBy > 0 ? 0.7 : 0.3);
        ctx.fillText(String(e.killedBy), x + w - 45, ly);

        ly += 16;
    }

    // Elite kills
    if (playerProfile.bestiary._eliteKills) {
        ly += 6;
        ctx.globalAlpha = fa * 0.4;
        ctx.font = '9px monospace';
        ctx.fillStyle = '#aa8844';
        ctx.fillText('Elite kills: ' + playerProfile.bestiary._eliteKills, x, ly);
    }

    // Milestones section
    if (typeof MILESTONE_DEFS !== 'undefined') {
        ly += 18;
        ctx.font = 'bold 10px Georgia';
        ctx.fillStyle = '#c4a878';
        ctx.globalAlpha = fa * 0.6;
        ctx.fillText('Milestones', x, ly);
        ly += 14;
        for (var mi = 0; mi < MILESTONE_DEFS.length && ly < y + h - 10; mi++) {
            var ms = MILESTONE_DEFS[mi];
            var unlocked = playerProfile.milestones[ms.id];
            ctx.font = '9px Georgia';
            ctx.fillStyle = unlocked ? '#88cc88' : '#665544';
            ctx.globalAlpha = fa * (unlocked ? 0.7 : 0.3);
            var checkmark = unlocked ? '\u2713 ' : '\u25CB ';
            ctx.fillText(checkmark + ms.name + ' — ' + ms.desc, x + 4, ly);
            if (unlocked && ms.bonus) {
                ctx.font = '8px monospace';
                ctx.fillStyle = '#aabb88';
                ctx.globalAlpha = fa * 0.4;
                ctx.fillText('  ' + ms.bonus.desc, x + 14, ly + 11);
                ly += 10;
            }
            ly += 14;
        }
    }

    ctx.restore();
}

// ===== AUGMENT TAB (Mutations for Slime, Bone Runes for Skeleton) =====
let _augHoverSlot = -1;
let _augHoverBp = -1;

function drawMenuAugments(x, y, w, h, fa) {
    if (typeof augmentInventory === 'undefined') return;
    const form = FormSystem.currentForm;
    const labels = (typeof AUGMENT_LABELS !== 'undefined' && AUGMENT_LABELS[form]) ? AUGMENT_LABELS[form] : { tab: 'AUGMENTS', slotPrefix: 'Slot', icon: '' };
    const isSlime = form === 'slime';
    const themeColor = isSlime ? '#44cc66' : '#ccaa66';
    const themeDim = isSlime ? '#2a7a3a' : '#8a7a3a';

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Section title
    ctx.font = 'bold 13px Georgia';
    ctx.fillStyle = themeColor;
    ctx.globalAlpha = fa * 0.8;
    ctx.fillText(labels.tab, x + w / 2, y + 14);

    // --- 3 Equipped Slots ---
    const slotSize = 52;
    const slotGap = 12;
    const totalSW = slotSize * 3 + slotGap * 2;
    const slotStartX = x + (w - totalSW) / 2;
    const slotY = y + 32;
    _augHoverSlot = -1;
    _augHoverBp = -1;

    for (let i = 0; i < 3; i++) {
        const sx = slotStartX + i * (slotSize + slotGap);
        const aug = augmentInventory.equipped[i];
        const hovered = mouse && mouse.x >= sx && mouse.x <= sx + slotSize && mouse.y >= slotY && mouse.y <= slotY + slotSize;
        if (hovered) _augHoverSlot = i;

        ctx.globalAlpha = fa * 0.6;
        ctx.fillStyle = hovered ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.roundRect(sx, slotY, slotSize, slotSize, 5); ctx.fill();
        ctx.strokeStyle = aug ? (RARITY[aug.rarity] || RARITY.common).color : themeDim;
        ctx.lineWidth = aug ? 2 : 1;
        ctx.globalAlpha = fa * (aug ? 0.8 : 0.3);
        ctx.beginPath(); ctx.roundRect(sx, slotY, slotSize, slotSize, 5); ctx.stroke();

        if (aug) {
            const rc = (RARITY[aug.rarity] || RARITY.common).color;
            const orbColor = isSlime ? '#44dd66' : '#ccbb88';
            ctx.globalAlpha = fa * 0.85;
            const g = ctx.createRadialGradient(sx + slotSize / 2 - 1, slotY + slotSize / 2 - 2, 0, sx + slotSize / 2, slotY + slotSize / 2, 14);
            g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, orbColor); g.addColorStop(1, rc);
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(sx + slotSize / 2, slotY + slotSize / 2 - 2, 12, 0, Math.PI * 2); ctx.fill();
            ctx.font = '8px monospace';
            ctx.globalAlpha = fa * 0.6;
            ctx.fillStyle = '#b0a080';
            const shortName = aug.name.length > 12 ? aug.name.slice(0, 11) + '.' : aug.name;
            ctx.fillText(shortName, sx + slotSize / 2, slotY + slotSize - 4);
        } else {
            ctx.font = '9px monospace';
            ctx.globalAlpha = fa * 0.25;
            ctx.fillStyle = themeColor;
            ctx.fillText(labels.slotPrefix + ' ' + (i + 1), sx + slotSize / 2, slotY + slotSize / 2);
        }
    }

    // --- Backpack Grid (4x2) ---
    const bpY = slotY + slotSize + 20;
    const bpSize = 44;
    const bpGap = 5;
    const bpCols = 4;
    ctx.font = '9px monospace';
    ctx.globalAlpha = fa * 0.35;
    ctx.fillStyle = '#887766';
    ctx.fillText('Pack (' + augmentInventory.backpack.length + '/' + augmentInventory.maxBackpack + ')', x + w / 2, bpY - 6);

    for (let i = 0; i < augmentInventory.maxBackpack; i++) {
        const col = i % bpCols;
        const row = Math.floor(i / bpCols);
        const bx = x + (w - bpCols * (bpSize + bpGap) + bpGap) / 2 + col * (bpSize + bpGap);
        const by = bpY + row * (bpSize + bpGap);
        const aug = augmentInventory.backpack[i];
        const hovered = mouse && mouse.x >= bx && mouse.x <= bx + bpSize && mouse.y >= by && mouse.y <= by + bpSize;
        if (hovered && aug) _augHoverBp = i;

        ctx.globalAlpha = fa * 0.5;
        ctx.fillStyle = hovered && aug ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.roundRect(bx, by, bpSize, bpSize, 4); ctx.fill();
        ctx.strokeStyle = aug ? (RARITY[aug.rarity] || RARITY.common).color : 'rgba(255,255,255,0.06)';
        ctx.lineWidth = aug ? 1.5 : 0.5;
        ctx.globalAlpha = fa * (aug ? 0.6 : 0.15);
        ctx.beginPath(); ctx.roundRect(bx, by, bpSize, bpSize, 4); ctx.stroke();
        if (aug) {
            const rc = (RARITY[aug.rarity] || RARITY.common).color;
            ctx.globalAlpha = fa * 0.8;
            ctx.fillStyle = rc;
            ctx.beginPath(); ctx.arc(bx + bpSize / 2, by + bpSize / 2, 8, 0, Math.PI * 2); ctx.fill();
        }
    }

    // --- Drop button ---
    if (augmentInventory.backpack.length > 0) {
        const dropW = 70, dropH = 22;
        const dropX = x + (w - dropW) / 2;
        const dropY = bpY + 2 * (bpSize + bpGap) + 10;
        ctx.globalAlpha = fa * 0.5;
        ctx.fillStyle = 'rgba(180,60,60,0.15)';
        ctx.beginPath(); ctx.roundRect(dropX, dropY, dropW, dropH, 4); ctx.fill();
        ctx.strokeStyle = '#884444'; ctx.lineWidth = 1; ctx.globalAlpha = fa * 0.4;
        ctx.beginPath(); ctx.roundRect(dropX, dropY, dropW, dropH, 4); ctx.stroke();
        ctx.font = '9px monospace'; ctx.fillStyle = '#cc6666'; ctx.globalAlpha = fa * 0.6;
        ctx.fillText('DROP', x + w / 2, dropY + dropH / 2);
    }

    // --- Tooltip for hovered augment ---
    const hoveredAug = _augHoverSlot >= 0 ? augmentInventory.equipped[_augHoverSlot] :
                       _augHoverBp >= 0 ? augmentInventory.backpack[_augHoverBp] : null;
    if (hoveredAug) {
        const rc = RARITY[hoveredAug.rarity] || RARITY.common;
        const tipW = 180, tipH = 90 + (hoveredAug.effectDesc ? 16 : 0);
        let tipX = mouse.x + 15, tipY = mouse.y - tipH / 2;
        if (tipX + tipW > canvasW - 10) tipX = mouse.x - tipW - 15;
        if (tipY < 10) tipY = 10;
        ctx.globalAlpha = fa * 0.92;
        ctx.fillStyle = 'rgba(15,12,10,0.95)';
        ctx.beginPath(); ctx.roundRect(tipX, tipY, tipW, tipH, 6); ctx.fill();
        ctx.strokeStyle = rc.color; ctx.lineWidth = 1.5; ctx.globalAlpha = fa * 0.7;
        ctx.beginPath(); ctx.roundRect(tipX, tipY, tipW, tipH, 6); ctx.stroke();
        let ty = tipY + 16;
        ctx.textAlign = 'left';
        ctx.font = 'bold 11px Georgia'; ctx.fillStyle = rc.color; ctx.globalAlpha = fa * 0.95;
        ctx.fillText(hoveredAug.name, tipX + 10, ty); ty += 14;
        ctx.font = '9px monospace'; ctx.fillStyle = '#887766'; ctx.globalAlpha = fa * 0.5;
        ctx.fillText(rc.label + ' ' + (isSlime ? 'Mutation' : 'Bone Rune'), tipX + 10, ty); ty += 14;
        ctx.font = '10px monospace'; ctx.globalAlpha = fa * 0.8;
        for (const [stat, val] of Object.entries(hoveredAug.stats)) {
            const def = typeof STAT_DEFS !== 'undefined' ? STAT_DEFS[stat] : null;
            if (def && typeof val === 'number') {
                ctx.fillStyle = '#88cc88';
                ctx.fillText(def.fmt(val) + ' ' + def.label, tipX + 10, ty); ty += 12;
            }
        }
        if (hoveredAug.effectDesc) {
            ctx.font = 'italic 9px Georgia'; ctx.fillStyle = '#e8c840'; ctx.globalAlpha = fa * 0.85;
            ctx.fillText(hoveredAug.effectDesc, tipX + 10, ty + 4);
        } else if (hoveredAug.desc) {
            ctx.font = 'italic 9px Georgia'; ctx.fillStyle = '#aaa'; ctx.globalAlpha = fa * 0.5;
            ctx.fillText(hoveredAug.desc, tipX + 10, ty + 4);
        }
        ctx.textAlign = 'center'; ctx.font = '8px monospace'; ctx.fillStyle = '#666'; ctx.globalAlpha = fa * 0.4;
        ctx.fillText(_augHoverSlot >= 0 ? 'click to unequip' : 'click to equip', tipX + tipW / 2, tipY + tipH - 8);
    }

    ctx.restore();
}

