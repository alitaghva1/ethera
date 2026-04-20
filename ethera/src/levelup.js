// ============================================================
//  LEVEL-UP SCREEN
// ============================================================
function getLevelUpChoice(mx, my) {
    const choices = xpState.levelUpChoices;
    const cx = canvasW / 2;
    const cy = canvasH / 2;
    const cardW = 170, cardH = 220, cardGap = 20;
    const totalW = choices.length * cardW + (choices.length - 1) * cardGap;
    const startX = cx - totalW / 2;
    const t = performance.now() / 1000;

    for (let i = 0; i < choices.length; i++) {
        const tier = (choices[i].tier || 'normal');
        const isLegendary = tier === 'legendary';
        const floatAmp = isLegendary ? 5 : 3;
        const floatY = Math.sin(t * 2 + i * 1.5) * floatAmp;
        const cardX = startX + i * (cardW + cardGap);
        let cardY2 = cy - cardH / 2 + 20 + floatY;
        // Match hover elevation from draw
        const hovered = (mx >= cardX && mx <= cardX + cardW && my >= cardY2 && my <= cardY2 + cardH);
        if (hovered) return i;
    }
    return -1;
}

function drawUpgradeIcon(cx, cy, iconType, color, size) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const s = size;

    switch(iconType) {
        case 'split':
            // Forking lines
            ctx.beginPath();
            ctx.moveTo(cx, cy + s); ctx.lineTo(cx, cy);
            ctx.lineTo(cx - s * 0.7, cy - s); ctx.moveTo(cx, cy);
            ctx.lineTo(cx + s * 0.7, cy - s);
            ctx.stroke();
            break;
        case 'pierce':
            // Arrow through circles
            ctx.beginPath();
            ctx.moveTo(cx - s, cy); ctx.lineTo(cx + s, cy);
            ctx.moveTo(cx + s * 0.5, cy - s * 0.4); ctx.lineTo(cx + s, cy); ctx.lineTo(cx + s * 0.5, cy + s * 0.4);
            ctx.stroke();
            ctx.globalAlpha = 0.4;
            ctx.beginPath(); ctx.arc(cx - s * 0.3, cy, 4, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(cx + s * 0.3, cy, 4, 0, Math.PI * 2); ctx.stroke();
            break;
        case 'explode':
            // Starburst
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                const r = i % 2 === 0 ? s : s * 0.5;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
                ctx.stroke();
            }
            break;
        case 'speed':
            // Lightning bolt
            ctx.beginPath();
            ctx.moveTo(cx - s * 0.3, cy - s); ctx.lineTo(cx + s * 0.1, cy - s * 0.1);
            ctx.lineTo(cx - s * 0.1, cy + s * 0.1); ctx.lineTo(cx + s * 0.3, cy + s);
            ctx.stroke();
            break;
        case 'big':
            // Large circle with radiating lines
            ctx.beginPath(); ctx.arc(cx, cy, s * 0.5, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 0.4;
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(a) * s * 0.6, cy + Math.sin(a) * s * 0.6);
                ctx.lineTo(cx + Math.cos(a) * s, cy + Math.sin(a) * s);
                ctx.stroke();
            }
            break;
        case 'bounce':
            // Zigzag line
            ctx.beginPath();
            ctx.moveTo(cx - s, cy + s * 0.5);
            ctx.lineTo(cx - s * 0.3, cy - s * 0.5);
            ctx.lineTo(cx + s * 0.3, cy + s * 0.5);
            ctx.lineTo(cx + s, cy - s * 0.5);
            ctx.stroke();
            break;
        case 'orbit':
            // Circle with orbiting dot
            ctx.globalAlpha = 0.4;
            ctx.beginPath(); ctx.arc(cx, cy, s * 0.7, 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha = 1;
            const oa = performance.now() / 500;
            ctx.beginPath(); ctx.arc(cx + Math.cos(oa) * s * 0.7, cy + Math.sin(oa) * s * 0.7, 3, 0, Math.PI * 2); ctx.fill();
            break;
        case 'thorns':
            // Spikes outward
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(a) * s * 0.25, cy + Math.sin(a) * s * 0.25);
                ctx.lineTo(cx + Math.cos(a) * s, cy + Math.sin(a) * s);
                ctx.stroke();
            }
            break;
        case 'regen':
            // Plus/cross (health)
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(cx, cy - s * 0.7); ctx.lineTo(cx, cy + s * 0.7);
            ctx.moveTo(cx - s * 0.7, cy); ctx.lineTo(cx + s * 0.7, cy);
            ctx.stroke();
            break;
        case 'mana':
            // Diamond (mana crystal)
            ctx.beginPath();
            ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s * 0.6, cy);
            ctx.lineTo(cx, cy + s); ctx.lineTo(cx - s * 0.6, cy); ctx.closePath();
            ctx.fill();
            break;
        case 'phase':
            // Dashed circle (phase/teleport)
            ctx.setLineDash([4, 4]);
            ctx.beginPath(); ctx.arc(cx, cy, s * 0.7, 0, Math.PI * 2); ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill();
            break;
        case 'tower':
            // Small obelisk
            ctx.beginPath();
            ctx.moveTo(cx - s * 0.2, cy + s); ctx.lineTo(cx - s * 0.35, cy - s * 0.3);
            ctx.lineTo(cx, cy - s); ctx.lineTo(cx + s * 0.35, cy - s * 0.3);
            ctx.lineTo(cx + s * 0.2, cy + s); ctx.closePath();
            ctx.fill();
            break;
        case 'chain':
            // Chain links
            ctx.beginPath(); ctx.ellipse(cx - s * 0.3, cy, s * 0.35, s * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.ellipse(cx + s * 0.3, cy, s * 0.35, s * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
            break;
        case 'slow':
            // Snowflake-ish
            for (let i = 0; i < 3; i++) {
                const a = (i / 3) * Math.PI;
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(a) * s, cy + Math.sin(a) * s);
                ctx.lineTo(cx - Math.cos(a) * s, cy - Math.sin(a) * s);
                ctx.stroke();
            }
            break;
        default:
            // Fallback icon for unknown upgrade type — simple filled circle
            ctx.globalAlpha = 0.8;
            ctx.beginPath();
            ctx.arc(cx, cy, s * 0.4, 0, Math.PI * 2);
            ctx.fill();
            break;
    }
    ctx.restore();
}

function drawLevelUpScreen() {
    const choices = xpState.levelUpChoices;
    if (choices.length === 0) return;

    const fade = xpState.levelUpFadeIn;
    const cx = canvasW / 2;
    const cy = canvasH / 2;
    const t = performance.now() / 1000;

    // Advance reveal timer (used for card entrance stagger)
    xpState.levelUpRevealT += _frameDt || 0.016;
    const revealT = xpState.levelUpRevealT;

    // Detect legendary presence (cached on first frame)
    if (revealT < 0.05) {
        xpState.levelUpHasLegendary = choices.some(c => (c.tier || 'normal') === 'legendary');
    }
    const hasLegendary = xpState.levelUpHasLegendary;

    ctx.save();

    // ── Full-opaque warm-black backdrop ──
    // Was globalAlpha * 0.6 — dungeon showed through at 40% and read as "screen
    // within a screen." Level-up is a commitment moment; the game world doesn't
    // belong behind it. Slight warm tint (#0a0705) rather than pure black so the
    // gold tones below feel like they're emerging from the backdrop, not pasted.
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = '#0a0705';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // ── Outer vignette — gentle edge darkening for focus + depth ──
    ctx.globalAlpha = fade;
    const outerVig = ctx.createRadialGradient(cx, cy, canvasH * 0.15, cx, cy, canvasH * 0.75);
    outerVig.addColorStop(0, 'rgba(0, 0, 0, 0)');
    outerVig.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
    ctx.fillStyle = outerVig;
    ctx.fillRect(0, 0, canvasW, canvasH);

    // ── Golden center vignette — existing atmospheric glow, slightly bumped ──
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = fade * (hasLegendary ? 0.22 : 0.14);
    const vig = ctx.createRadialGradient(cx, cy, 0, cx, cy, canvasH * 0.5);
    vig.addColorStop(0, hasLegendary ? 'rgba(255, 200, 50, 0.45)' : 'rgba(200, 160, 40, 0.35)');
    vig.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.globalCompositeOperation = 'source-over';

    // ── Drifting ember particles — procedural ambiance, no allocations ──
    // Deterministic by seed so they don't jitter across frames; each ember
    // floats upward on its own phase for a gentle "motes in firelight" feel.
    const emberCount = hasLegendary ? 14 : 9;
    const emberNow = performance.now() * 0.001;
    ctx.globalAlpha = fade * 0.55;
    for (let _ei = 0; _ei < emberCount; _ei++) {
        const seed = _ei * 31 + 7;
        const xBase = ((seed * 73) % 1000) / 1000;
        const ySpeed = 0.06 + ((seed * 29) % 40) / 800;   // slow drift
        const yPhase = ((emberNow * ySpeed) + ((seed * 13) % 97) / 97) % 1.0;
        const swayAmp = 10 + ((seed * 17) % 20);
        const swayHz = 0.6 + ((seed * 11) % 40) / 120;
        const px = xBase * canvasW + Math.sin(emberNow * swayHz * Math.PI + seed) * swayAmp;
        const py = (1.0 - yPhase) * canvasH;
        const size = 1.2 + ((seed * 11) % 25) / 24;
        // Peak brightness mid-flight, fade at top/bottom
        const lifeAlpha = Math.sin(yPhase * Math.PI);
        ctx.fillStyle = hasLegendary
            ? 'rgba(255, 210, 90, ' + (lifeAlpha * 0.9).toFixed(2) + ')'
            : 'rgba(220, 180, 60, ' + (lifeAlpha * 0.7).toFixed(2) + ')';
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();
    }

    // "LEVEL UP" title
    ctx.globalAlpha = fade;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '36px Georgia';
    ctx.shadowColor = 'rgba(200, 160, 40, 0.5)';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#e8c840';
    ctx.fillText('LEVEL UP', cx, cy - 140);
    ctx.shadowBlur = 0;

    // Level number + keyboard hint
    ctx.font = '14px monospace';
    ctx.fillStyle = '#a89060';
    ctx.globalAlpha = fade * 0.6;
    ctx.fillText(`Level ${xpState.level}  —  Choose an upgrade`, cx, cy - 108);

    // Draw upgrade cards
    const cardW = 170, cardH = 220, cardGap = 20;
    const totalW = choices.length * cardW + (choices.length - 1) * cardGap;
    const startX = cx - totalW / 2;

    // Update hover — keyboard hover takes priority over mouse hover
    xpState.levelUpHover = getLevelUpChoice(mouse.x, mouse.y);

    for (let i = 0; i < choices.length; i++) {
        const u = choices[i];
        const tier = u.tier || 'normal';
        const isLegendary = tier === 'legendary';
        const isRare = tier === 'rare';
        const cardX = startX + i * (cardW + cardGap);
        const cardY = cy - cardH / 2 + 20;
        const mouseHov = xpState.levelUpHover === i;
        const keyHov = xpState.levelUpKeyHover === i;
        const hovered = mouseHov || keyHov;
        const stacks = upgrades[u.id] || 0;

        // ── Card entrance animation ──
        // Normal cards: appear at stagger 0.08s each
        // Legendary: delayed entrance at 0.5s with dramatic bounce
        let cardRevealFrac;
        if (isLegendary && hasLegendary) {
            // Legendary entrance: delayed start, dramatic scale bounce
            const legDelay = 0.45;
            const legDur = 0.4;
            cardRevealFrac = Math.min(1, Math.max(0, (revealT - legDelay) / legDur));
        } else {
            const normalDelay = i * 0.08;
            cardRevealFrac = Math.min(1, Math.max(0, (revealT - normalDelay) / 0.25));
        }
        // Ease-out bounce for legendary, ease-out cubic for others
        let cardScale;
        if (isLegendary && hasLegendary) {
            // Overshoot bounce: 0 → 1.08 → 1.0
            if (cardRevealFrac < 0.7) {
                cardScale = (cardRevealFrac / 0.7) * 1.08;
            } else {
                cardScale = 1.08 - (cardRevealFrac - 0.7) / 0.3 * 0.08;
            }
            cardScale = Math.max(0, cardScale);
        } else {
            cardScale = 1 - Math.pow(1 - cardRevealFrac, 3); // ease-out cubic
        }

        if (cardRevealFrac <= 0) continue; // not revealed yet

        // Card float animation — legendary cards float more dramatically
        const floatAmp = isLegendary ? 5 : 3;
        const floatY = Math.sin(t * 2 + i * 1.5) * floatAmp;
        let cy2 = cardY + floatY;

        // Hover elevation
        if (hovered) cy2 -= 4;

        // Apply scale transform for entrance
        const cardCx = cardX + cardW / 2;
        const cardCy = cy2 + cardH / 2;
        ctx.save();
        if (cardScale < 0.99) {
            ctx.translate(cardCx, cardCy);
            ctx.scale(cardScale, cardScale);
            ctx.translate(-cardCx, -cardCy);
        }

        ctx.globalAlpha = fade * cardRevealFrac;

        // --- Tier-specific outer glow (behind card) ---
        if (isLegendary) {
            const pulse = 0.5 + 0.5 * Math.sin(t * 3 + i);
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = fade * cardRevealFrac * (0.08 + 0.06 * pulse);
            const legGlow = ctx.createRadialGradient(cardCx, cardCy, 10, cardCx, cardCy, cardW * 1.1);
            legGlow.addColorStop(0, 'rgba(255, 200, 50, 0.5)');
            legGlow.addColorStop(0.5, 'rgba(255, 160, 20, 0.2)');
            legGlow.addColorStop(1, 'rgba(255, 120, 0, 0)');
            ctx.fillStyle = legGlow;
            ctx.fillRect(cardX - 40, cy2 - 40, cardW + 80, cardH + 80);
            ctx.restore();
        } else if (isRare) {
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = fade * cardRevealFrac * 0.06;
            const rareGlow = ctx.createRadialGradient(cardCx, cardCy, 10, cardCx, cardCy, cardW * 0.95);
            rareGlow.addColorStop(0, 'rgba(80, 140, 255, 0.4)');
            rareGlow.addColorStop(1, 'rgba(40, 80, 200, 0)');
            ctx.fillStyle = rareGlow;
            ctx.fillRect(cardX - 30, cy2 - 30, cardW + 60, cardH + 60);
            ctx.restore();
        }

        // Glow behind hovered card (mouse or keyboard)
        if (hovered) {
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = fade * 0.08;
            const hoverColor = isLegendary ? 'rgba(255, 200, 50, 0.4)' : (isRare ? 'rgba(80, 140, 255, 0.4)' : 'rgba(212, 160, 64, 0.4)');
            const bgGlow = ctx.createRadialGradient(cardCx, cardCy, 20, cardCx, cardCy, cardW * 0.9);
            bgGlow.addColorStop(0, hoverColor);
            bgGlow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = bgGlow;
            ctx.fillRect(cardX - 30, cy2 - 30, cardW + 60, cardH + 60);
            ctx.restore();
        }

        // Card background
        ctx.fillStyle = hovered ? '#14100a' : '#0c0906';
        ctx.globalAlpha = fade * cardRevealFrac * (hovered ? 0.95 : 0.88);
        ctx.beginPath();
        ctx.roundRect(cardX, cy2, cardW, cardH, 6);
        ctx.fill();

        // Card border: tier-colored, highlight on keyboard hover
        const catColor = u.category === 'wand' ? '#dd8833' : (u.category === 'passive' ? '#44bb88' : '#8866cc');
        let borderColor, borderHoverColor, borderWidth;
        if (isLegendary) {
            const pulse = 0.5 + 0.5 * Math.sin(t * 3 + i);
            borderColor = `rgba(255, ${180 + Math.floor(40 * pulse)}, ${20 + Math.floor(40 * pulse)}, ${0.5 + 0.3 * pulse})`;
            borderHoverColor = `rgba(255, ${200 + Math.floor(30 * pulse)}, ${40 + Math.floor(40 * pulse)}, ${0.8 + 0.2 * pulse})`;
            borderWidth = hovered ? 3 : 2;
        } else if (isRare) {
            borderColor = 'rgba(80, 140, 255, 0.5)';
            borderHoverColor = 'rgba(100, 170, 255, 0.8)';
            borderWidth = hovered ? 2 : 1.5;
        } else {
            borderColor = 'rgba(140, 120, 80, 0.3)';
            borderHoverColor = '#d4a040';
            borderWidth = hovered ? 2 : 1;
        }
        ctx.strokeStyle = hovered ? borderHoverColor : borderColor;
        ctx.lineWidth = borderWidth;
        ctx.globalAlpha = fade * cardRevealFrac * (hovered ? 0.8 : (isLegendary ? 0.7 : (isRare ? 0.6 : 0.4)));
        ctx.beginPath();
        ctx.roundRect(cardX, cy2, cardW, cardH, 6);
        ctx.stroke();

        // Hover glow (category-specific, tinted by tier)
        if (hovered) {
            const glowColor = isLegendary ? '#ffcc33' : (isRare ? '#5588ff' : catColor);
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = fade * (isLegendary ? 0.12 : (isRare ? 0.10 : 0.08));
            const hg = ctx.createRadialGradient(cardCx, cardCy, 0, cardCx, cardCy, cardW * 0.7);
            hg.addColorStop(0, glowColor);
            hg.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = hg;
            ctx.fillRect(cardX - 20, cy2 - 20, cardW + 40, cardH + 40);
            ctx.globalCompositeOperation = 'source-over';
        }

        // ── Key number badge (top-left of card) ──
        {
            const kx = cardX + 12;
            const ky = cy2 + 10;
            const keyNum = String(i + 1);
            ctx.globalAlpha = fade * cardRevealFrac * (hovered ? 0.9 : 0.4);
            // Badge background
            ctx.fillStyle = hovered ? 'rgba(200, 160, 40, 0.25)' : 'rgba(100, 90, 70, 0.2)';
            ctx.beginPath();
            ctx.roundRect(kx - 7, ky - 7, 14, 14, 3);
            ctx.fill();
            // Badge border
            ctx.strokeStyle = hovered ? 'rgba(200, 160, 40, 0.5)' : 'rgba(100, 90, 70, 0.3)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(kx - 7, ky - 7, 14, 14, 3);
            ctx.stroke();
            // Number text
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = hovered ? '#e8c840' : '#8a7a60';
            ctx.fillText(keyNum, kx, ky);
        }

        // Tier tag (above category tag for rare/legendary)
        ctx.textBaseline = 'middle';
        if (isLegendary || isRare) {
            ctx.globalAlpha = fade * cardRevealFrac * 0.7;
            ctx.font = '9px monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = isLegendary ? '#ffcc33' : '#5588ff';
            ctx.fillText(tier.toUpperCase(), cardX + cardW / 2, cy2 + 11);
        }

        // Category tag
        ctx.globalAlpha = fade * cardRevealFrac * 0.5;
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = catColor;
        ctx.fillText(u.category.toUpperCase(), cardX + cardW / 2, cy2 + (isLegendary || isRare ? 22 : 18));

        // Synergy tag label with set bonus progress (bottom of card area)
        if (u.tag && typeof UPGRADE_TAGS !== 'undefined' && UPGRADE_TAGS[u.tag]) {
            const _tagInfo = UPGRADE_TAGS[u.tag];
            const _tagCounts = (typeof countUpgradeTags === 'function') ? countUpgradeTags() : {};
            const _threshold = (typeof TAG_SET_BONUS_THRESHOLD !== 'undefined') ? TAG_SET_BONUS_THRESHOLD : 3;
            const _tagCount = _tagCounts[u.tag] || 0;
            const _tagActive = _tagCount >= _threshold;

            // Tag name in corner (existing position)
            ctx.globalAlpha = fade * cardRevealFrac * (_tagActive ? 0.9 : 0.45);
            ctx.font = '7px monospace';
            ctx.textAlign = 'right';
            ctx.fillStyle = _tagInfo.color;
            ctx.fillText(_tagInfo.name.toUpperCase(), cardX + cardW - 8, cy2 + (isLegendary || isRare ? 22 : 18));
            ctx.textAlign = 'center';

            // Set bonus progress line below the card
            const _tagLineY = cy2 + cardH + 10;
            if (_tagActive) {
                // Active bonus — gold text with checkmark and bonus description
                var _bonusDesc = '';
                if (typeof TAG_SET_BONUSES !== 'undefined' && TAG_SET_BONUSES[u.tag]) {
                    var _b = TAG_SET_BONUSES[u.tag];
                    if (_b.dmgMult) _bonusDesc = ' +' + Math.round((_b.dmgMult - 1) * 100) + '% DMG';
                    else if (_b.dmgReduc) _bonusDesc = ' -' + Math.round(_b.dmgReduc * 100) + '% DMG taken';
                    else if (_b.speedMult) _bonusDesc = ' +' + Math.round((_b.speedMult - 1) * 100) + '% SPD';
                    else if (_b.minionDmg) _bonusDesc = ' +' + Math.round((_b.minionDmg - 1) * 100) + '% minion DMG';
                }
                ctx.globalAlpha = fade * cardRevealFrac * 0.85;
                ctx.font = 'bold 8px monospace';
                ctx.fillStyle = '#e8c840';
                ctx.fillText(_tagInfo.name + ' \u2713' + _bonusDesc, cardX + cardW / 2, _tagLineY);
            } else {
                // Progress toward threshold
                ctx.globalAlpha = fade * cardRevealFrac * 0.4;
                ctx.font = '8px monospace';
                ctx.fillStyle = _tagInfo.color;
                ctx.fillText(_tagInfo.name + ' ' + _tagCount + '/' + _threshold, cardX + cardW / 2, _tagLineY);
            }
        }

        // Icon
        ctx.globalAlpha = fade * cardRevealFrac;
        drawUpgradeIcon(cardX + cardW / 2, cy2 + 65, u.icon, isLegendary ? '#ffcc33' : (isRare ? '#6699ff' : catColor), 16);

        // Name — tinted by tier
        ctx.font = isLegendary ? 'bold 14px Georgia' : '14px Georgia';
        const nameColor = isLegendary ? '#ffd855' : (isRare ? '#88bbff' : (hovered ? '#e8d8b0' : '#c4a878'));
        ctx.fillStyle = nameColor;
        ctx.globalAlpha = fade * cardRevealFrac;
        if (isLegendary) {
            ctx.shadowColor = 'rgba(255, 200, 40, 0.4)';
            ctx.shadowBlur = 8;
        }
        ctx.fillText(u.name, cardX + cardW / 2, cy2 + 110);
        ctx.shadowBlur = 0;

        // Description (word-wrap)
        ctx.font = '10px Georgia';
        ctx.fillStyle = isLegendary ? '#c8a860' : (isRare ? '#8899aa' : '#9a8a6a');
        ctx.globalAlpha = fade * cardRevealFrac * 0.8;
        const words = u.desc.split(' ');
        let line = '';
        let lineY = cy2 + 132;
        for (const w of words) {
            const test = line + (line ? ' ' : '') + w;
            if (ctx.measureText(test).width > cardW - 24) {
                ctx.fillText(line, cardX + cardW / 2, lineY);
                line = w;
                lineY += 14;
                if (lineY > cy2 + cardH - 45) break; // stop before stack count area
            } else {
                line = test;
            }
        }
        if (line && lineY <= cy2 + cardH - 45) ctx.fillText(line, cardX + cardW / 2, lineY);

        // Stack count
        if (stacks > 0) {
            ctx.globalAlpha = fade * cardRevealFrac * 0.6;
            ctx.font = '9px monospace';
            ctx.fillStyle = catColor;
            ctx.fillText(`${stacks}/${u.maxStack}`, cardX + cardW / 2, cy2 + cardH - 16);
        } else {
            ctx.globalAlpha = fade * cardRevealFrac * 0.3;
            ctx.font = '9px monospace';
            ctx.fillStyle = isLegendary ? '#ffcc33' : (isRare ? '#5588ff' : '#666');
            ctx.fillText('NEW', cardX + cardW / 2, cy2 + cardH - 16);
        }

        // Hover stat hint — show practical impact when hovering
        if (hovered) {
            let statHint = '';
            const nextStack = stacks + 1;
            if (u.id === 'pierce') statHint = 'Passes through ' + nextStack + ' enemies';
            else if (u.id === 'bounce') statHint = 'Bounces off ' + nextStack + ' walls';
            else if (u.id === 'explode') statHint = 'AoE radius: 2.5 tiles';
            else if (u.id === 'multishot') statHint = (nextStack + 1) + ' projectiles per attack';
            else if (u.id === 'bigshot') statHint = '+' + (nextStack * 5) + ' base damage';
            else if (u.id === 'firerate') statHint = '-' + Math.round(nextStack * 15) + '% cooldown';
            else if (u.id === 'maxHp') statHint = '+' + (nextStack * 15) + ' max HP';
            else if (u.id === 'speed') statHint = '+' + (nextStack * 8) + '% move speed';
            else if (u.id === 'regen') statHint = '+' + nextStack + ' HP/sec';
            else if (u.id === 'tower_extra') statHint = (SUMMON_MAX_COUNT + nextStack) + ' max towers';
            else if (u.id === 'tower_damage') statHint = '+' + Math.round(nextStack * 20) + '% tower damage';
            else if (u.id === 'mana_shield') statHint = '-' + (nextStack * 15) + '% dmg at 50%+ mana';
            else if (u.id === 'spell_echo') statHint = (nextStack * 20) + '% chance for extra bolt';
            if (statHint) {
                ctx.globalAlpha = fade * 0.75;
                ctx.font = '10px Georgia';
                ctx.fillStyle = '#ccdd99';
                ctx.fillText(statHint, cardX + cardW / 2, cy2 + cardH - 6);
            }
        }

        ctx.restore(); // pop card scale transform
    }

    // ── Keyboard hint at bottom ──
    ctx.globalAlpha = fade * 0.35;
    ctx.font = '10px Georgia';
    ctx.fillStyle = '#8a7a60';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Press 1-' + choices.length + ' or use arrow keys + Enter', cx, cy + cardH / 2 + 50);

    // ── Reroll button (if player has reroll tokens) ──
    var _rerollTokens = (typeof questState !== 'undefined') ? (questState.rerollTokens || 0) : 0;
    if (_rerollTokens > 0) {
        var rerollY = cy + cardH / 2 + 72;
        var rerollW = 140, rerollH = 24;
        var rerollX = cx - rerollW / 2;
        var rerollHovered = mouse && mouse.x >= rerollX && mouse.x <= rerollX + rerollW &&
                            mouse.y >= rerollY && mouse.y <= rerollY + rerollH;
        // Store rect for click handling
        xpState._rerollRect = { x: rerollX, y: rerollY, w: rerollW, h: rerollH };

        ctx.globalAlpha = fade * (rerollHovered ? 0.8 : 0.5);
        ctx.fillStyle = rerollHovered ? 'rgba(40,50,30,0.9)' : 'rgba(20,20,15,0.8)';
        ctx.beginPath(); ctx.roundRect(rerollX, rerollY, rerollW, rerollH, 4); ctx.fill();
        ctx.strokeStyle = rerollHovered ? '#88cc44' : '#665544';
        ctx.lineWidth = 1; ctx.globalAlpha = fade * 0.6;
        ctx.beginPath(); ctx.roundRect(rerollX, rerollY, rerollW, rerollH, 4); ctx.stroke();
        ctx.font = 'bold 10px Georgia';
        ctx.fillStyle = '#88cc44';
        ctx.globalAlpha = fade * 0.85;
        ctx.fillText('R  Reroll (' + _rerollTokens + ' left)', cx, rerollY + rerollH / 2);
    } else {
        xpState._rerollRect = null;
    }

    ctx.restore();
}

//  UI PANEL RENDERING
