// ============================================================
//  WAVE TITLE CARD — legible wave identity in under 1 second
// ============================================================
//
//  Reference: Hades chamber reveals, Dead Cells biome banners,
//  Gungeon floor intros. The single piece of UI that does the
//  most work toward "every wave feels intentional" — player reads
//  what kind of wave this is in the first beat.
//
//  Layout: center-screen, 3 lines —
//    Line 1: "WAVE N / TOTAL"   (small, gold)
//    Line 2: "THE TITLE"        (big, serif, zone accent color)
//    Line 3: modifier tags      (icon + name, side by side)
//
//  Timing: 0.3s fade-in, 1.2s hold, 0.5s fade-out.
//  Audio sting on show.
//
//  Hooks:
//    - showWaveTitleCard(waveNum, total, title, modifiers)
//    - updateWaveTitleCard(dt)
//    - drawWaveTitleCard()
//    - hideWaveTitleCard()  (instant cancel, e.g. on menu)
//
// ============================================================

const waveTitleCard = {
    active: false,
    waveNum: 0,
    total: 0,
    title: '',
    modifiers: [],
    isBoss: false,
    timer: 0,          // counts UP from 0
    lifetime: 2.0,     // total seconds visible
    fadeIn: 0.3,
    fadeOut: 0.5,
};

function showWaveTitleCard(waveNum, total, title, modifiers, opts) {
    opts = opts || {};
    waveTitleCard.active = true;
    waveTitleCard.waveNum = waveNum;
    waveTitleCard.total = total;
    waveTitleCard.title = title || '';
    waveTitleCard.modifiers = Array.isArray(modifiers) ? modifiers : [];
    waveTitleCard.isBoss = !!opts.isBoss;
    waveTitleCard.timer = 0;
    waveTitleCard.lifetime = opts.lifetime || 2.0;
    // Audio sting
    if (waveTitleCard.isBoss) {
        if (typeof sfxBossRoar === 'function') sfxBossRoar();
        else if (typeof playSting === 'function') playSting('waveCleared');
    } else if (waveTitleCard.modifiers.length > 0) {
        if (typeof sfxModifierSting === 'function') sfxModifierSting();
        else if (typeof playSting === 'function') playSting('waveCleared');
    } else {
        if (typeof playSting === 'function') playSting('waveCleared');
    }
}

function hideWaveTitleCard() {
    waveTitleCard.active = false;
    waveTitleCard.timer = 0;
}

function updateWaveTitleCard(dt) {
    if (!waveTitleCard.active) return;
    waveTitleCard.timer += dt;
    if (waveTitleCard.timer >= waveTitleCard.lifetime) {
        hideWaveTitleCard();
    }
}

function drawWaveTitleCard() {
    if (!waveTitleCard.active) return;
    if (typeof ctx === 'undefined' || typeof canvasW === 'undefined') return;

    // Compute alpha from fade-in / hold / fade-out curve
    const t = waveTitleCard.timer;
    const life = waveTitleCard.lifetime;
    const fIn = waveTitleCard.fadeIn;
    const fOut = waveTitleCard.fadeOut;
    let alpha = 1;
    if (t < fIn) alpha = t / fIn;
    else if (t > life - fOut) alpha = Math.max(0, (life - t) / fOut);
    alpha = Math.max(0, Math.min(1, alpha));

    const cx = canvasW / 2;
    const cy = canvasH * 0.38;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Dramatic entrance: slight slide-down during fade-in
    const slideY = (t < fIn) ? (fIn - t) / fIn * -20 : 0;

    // Line 1 — small wave number label
    ctx.globalAlpha = alpha * 0.85;
    ctx.font = '12px Georgia';
    ctx.fillStyle = '#c4a878';
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.lineWidth = 3;
    const label = 'WAVE ' + waveTitleCard.waveNum + ' / ' + waveTitleCard.total;
    ctx.strokeText(label, cx, cy - 36 + slideY);
    ctx.fillText(label, cx, cy - 36 + slideY);

    // Line 2 — title (big, zone accent color if boss)
    const titleCol = waveTitleCard.isBoss ? '#e84040' : '#e8c840';
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 38px Georgia';
    ctx.fillStyle = titleCol;
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.lineWidth = 4;
    // Shadow glow
    ctx.shadowColor = titleCol;
    ctx.shadowBlur = 18;
    ctx.strokeText(waveTitleCard.title, cx, cy + slideY);
    ctx.fillText(waveTitleCard.title, cx, cy + slideY);
    ctx.shadowBlur = 0;

    // Line 3 — modifier tags (icon + name)
    if (waveTitleCard.modifiers.length > 0 && typeof WAVE_MOD_DEFS !== 'undefined') {
        ctx.globalAlpha = alpha * 0.95;
        ctx.font = 'bold 14px Georgia';
        const parts = [];
        let totalW = 0;
        for (const id of waveTitleCard.modifiers) {
            const def = WAVE_MOD_DEFS[id];
            if (!def) continue;
            const text = def.icon + ' ' + def.name.toUpperCase();
            const w = ctx.measureText(text).width;
            parts.push({ text, color: def.color, w });
            totalW += w + 20; // padding between tags
        }
        let px = cx - totalW / 2;
        for (const p of parts) {
            ctx.strokeStyle = 'rgba(0,0,0,0.9)';
            ctx.lineWidth = 3;
            ctx.strokeText(p.text, px + p.w / 2, cy + 34 + slideY);
            ctx.fillStyle = p.color;
            ctx.fillText(p.text, px + p.w / 2, cy + 34 + slideY);
            px += p.w + 20;
        }
    } else if (waveTitleCard.isBoss) {
        // Boss subtitle
        ctx.globalAlpha = alpha * 0.8;
        ctx.font = 'italic 14px Georgia';
        ctx.fillStyle = '#c48040';
        ctx.fillText('A powerful enemy approaches...', cx, cy + 34 + slideY);
    }

    ctx.restore();
}
