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

    for (let i = 0; i < choices.length; i++) {
        const cardX = startX + i * (cardW + cardGap);
        const cardY = cy - cardH / 2 + 20;
        if (mx >= cardX && mx <= cardX + cardW && my >= cardY && my <= cardY + cardH) {
            return i;
        }
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

    ctx.save();

    // Dim overlay
    ctx.globalAlpha = fade * 0.6;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Golden vignette
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = fade * 0.1;
    const vig = ctx.createRadialGradient(cx, cy, 0, cx, cy, canvasH * 0.5);
    vig.addColorStop(0, 'rgba(200, 160, 40, 0.3)');
    vig.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.globalCompositeOperation = 'source-over';

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

    // Level number
    ctx.font = '14px monospace';
    ctx.fillStyle = '#a89060';
    ctx.globalAlpha = fade * 0.6;
    ctx.fillText(`Level ${xpState.level}  —  Choose an upgrade`, cx, cy - 108);

    // Draw upgrade cards
    const cardW = 170, cardH = 220, cardGap = 20;
    const totalW = choices.length * cardW + (choices.length - 1) * cardGap;
    const startX = cx - totalW / 2;

    // Update hover
    xpState.levelUpHover = getLevelUpChoice(mouse.x, mouse.y);

    for (let i = 0; i < choices.length; i++) {
        const u = choices[i];
        const cardX = startX + i * (cardW + cardGap);
        const cardY = cy - cardH / 2 + 20;
        const hovered = xpState.levelUpHover === i;
        const stacks = upgrades[u.id] || 0;

        // Card float animation
        const floatY = Math.sin(t * 2 + i * 1.5) * 3;
        let cy2 = cardY + floatY;

        // Hover elevation: draw 2px higher when hovered
        if (hovered) {
            cy2 -= 2;
        }

        ctx.globalAlpha = fade;

        // Subtle glow behind hovered card
        if (hovered) {
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = fade * 0.06;
            const bgGlow = ctx.createRadialGradient(cardX + cardW/2, cy2 + cardH/2, 20, cardX + cardW/2, cy2 + cardH/2, cardW * 0.9);
            bgGlow.addColorStop(0, 'rgba(212, 160, 64, 0.4)');
            bgGlow.addColorStop(1, 'rgba(212, 160, 64, 0)');
            ctx.fillStyle = bgGlow;
            ctx.fillRect(cardX - 30, cy2 - 30, cardW + 60, cardH + 60);
            ctx.restore();
        }

        // Card background
        ctx.fillStyle = hovered ? '#14100a' : '#0c0906';
        ctx.globalAlpha = fade * (hovered ? 0.95 : 0.88);
        ctx.beginPath();
        ctx.roundRect(cardX, cy2, cardW, cardH, 6);
        ctx.fill();

        // Card border: bright gold when hovered, normal when not
        const catColor = u.category === 'wand' ? '#dd8833' : (u.category === 'passive' ? '#44bb88' : '#8866cc');
        ctx.strokeStyle = hovered ? '#d4a040' : 'rgba(140, 120, 80, 0.3)';
        ctx.lineWidth = hovered ? 2 : 1;
        ctx.globalAlpha = fade * (hovered ? 0.8 : 0.4);
        ctx.beginPath();
        ctx.roundRect(cardX, cy2, cardW, cardH, 6);
        ctx.stroke();

        // Hover glow (category-specific)
        if (hovered) {
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = fade * 0.08;
            const hg = ctx.createRadialGradient(cardX + cardW/2, cy2 + cardH/2, 0, cardX + cardW/2, cy2 + cardH/2, cardW * 0.7);
            hg.addColorStop(0, catColor);
            hg.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = hg;
            ctx.fillRect(cardX - 20, cy2 - 20, cardW + 40, cardH + 40);
            ctx.globalCompositeOperation = 'source-over';
        }

        // Category tag
        ctx.globalAlpha = fade * 0.5;
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = catColor;
        ctx.fillText(u.category.toUpperCase(), cardX + cardW / 2, cy2 + 18);

        // Icon
        ctx.globalAlpha = fade;
        drawUpgradeIcon(cardX + cardW / 2, cy2 + 65, u.icon, catColor, 16);

        // Name
        ctx.font = '14px Georgia';
        ctx.fillStyle = hovered ? '#e8d8b0' : '#c4a878';
        ctx.globalAlpha = fade;
        ctx.fillText(u.name, cardX + cardW / 2, cy2 + 110);

        // Description (word-wrap)
        ctx.font = '10px Georgia';
        ctx.fillStyle = '#9a8a6a';
        ctx.globalAlpha = fade * 0.8;
        const words = u.desc.split(' ');
        let line = '';
        let lineY = cy2 + 132;
        for (const w of words) {
            const test = line + (line ? ' ' : '') + w;
            if (ctx.measureText(test).width > cardW - 24) {
                ctx.fillText(line, cardX + cardW / 2, lineY);
                line = w;
                lineY += 14;
            } else {
                line = test;
            }
        }
        if (line) ctx.fillText(line, cardX + cardW / 2, lineY);

        // Stack count
        if (stacks > 0) {
            ctx.globalAlpha = fade * 0.6;
            ctx.font = '9px monospace';
            ctx.fillStyle = catColor;
            ctx.fillText(`${stacks}/${u.maxStack}`, cardX + cardW / 2, cy2 + cardH - 16);
        } else {
            ctx.globalAlpha = fade * 0.3;
            ctx.font = '9px monospace';
            ctx.fillStyle = '#666';
            ctx.fillText('NEW', cardX + cardW / 2, cy2 + cardH - 16);
        }
    }

    ctx.restore();
}

//  UI PANEL RENDERING
