/**
 * notifications.js - Unified notification and hint system
 * Manages toasts, zone banners, one-time hints, and controls reference
 * Global object: Notify
 */

const Notify = {
    // ========== STATE ==========
    
    // Active toast queue (screen-positioned HUD notifications)
    toasts: [],
    
    // Tracks which hint IDs have been shown (for one-time hints)
    shownHints: new Set(),
    
    // Controls reference state
    controlsVisible: false,
    controlsEverShown: false,
    
    // Zone banner state (special centered treatment)
    zoneBanner: {
        text: '',
        timer: 0,
        duration: 3.0
    },
    
    // Form-specific control text
    FORM_CONTROLS: {
        slime: ['WASD Move', 'LMB Acid Spit', 'RMB Split Clone', 'SPACE Bounce Jump', 'E Absorb / TAB Menu'],
        skeleton: ['WASD Move', 'LMB Bone Throw', 'RMB Shield Bash', 'SPACE Roll Dodge', 'E Reassemble / TAB Menu'],
        wizard: ['WASD Move', 'LMB Fireball', 'RMB Summon Tower', 'SPACE Phase Jump', 'E Interact / TAB Menu'],
        lich: ['WASD Move', 'LMB Soul Bolt', 'RMB Raise Undead', 'SPACE Shadow Step', 'E Soul Harvest / TAB Menu'],
    },
    
    // ========== TOAST SYSTEM ==========
    
    /**
     * Push a screen-positioned notification
     * @param {string} message - The notification text
     * @param {Object} options - Configuration
     *   - id (string): Unique ID for deduplication
     *   - duration (number, default 3): Display time in seconds
     *   - fadeIn (number, default 0.3): Fade-in time
     *   - fadeOut (number, default 0.8): Fade-out time
     *   - color (string, default '#bbaa88'): Text color
     *   - borderColor (string, default '#8a7030'): Border color
     *   - font (string, default '10px Georgia'): Font specification
     *   - position (string, default 'top'): 'top' or 'bottom'
     *   - priority (number, default 0): Higher priority shows above lower
     */
    toast: function(message, options) {
        options = options || {};
        
        // Check for duplicate ID
        if (options.id) {
            if (this.toasts.some(t => t.id === options.id && !t.dead)) {
                return;
            }
        }
        
        const toast = {
            message: message,
            id: options.id || null,
            duration: options.duration !== undefined ? options.duration : 3,
            fadeIn: options.fadeIn !== undefined ? options.fadeIn : 0.3,
            fadeOut: options.fadeOut !== undefined ? options.fadeOut : 0.8,
            color: options.color || '#bbaa88',
            borderColor: options.borderColor || '#8a7030',
            font: options.font || '10px Georgia',
            position: options.position || 'top',
            priority: options.priority !== undefined ? options.priority : 0,
            
            // Runtime state
            timer: 0,
            alpha: 0,
            dead: false
        };
        
        this.toasts.push(toast);
    },
    
    // ========== ONE-TIME HINTS ==========
    
    /**
     * Show a toast, but only once per session
     * @param {string} hintId - Unique hint identifier
     * @param {string} message - The hint text
     * @param {number} duration - Display time in seconds
     * @param {Object} options - Additional toast options
     */
    hint: function(hintId, message, duration, options) {
        if (this.shownHints.has(hintId)) {
            return;
        }
        this.shownHints.add(hintId);
        
        const toastOptions = Object.assign({}, options || {});
        toastOptions.id = hintId;
        toastOptions.duration = duration;
        
        this.toast(message, toastOptions);
    },
    
    // ========== ZONE BANNER ==========
    
    /**
     * Show a large centered zone name banner
     * @param {string} zoneName - Name of the zone
     */
    showZoneBanner: function(zoneName) {
        this.zoneBanner.text = zoneName;
        this.zoneBanner.timer = this.zoneBanner.duration;
    },
    
    // ========== CONTROLS REFERENCE ==========
    
    /**
     * Toggle controls reference on/off
     */
    toggleControls: function() {
        this.controlsVisible = !this.controlsVisible;
    },
    
    /**
     * Show controls on first play, then allow toggle with H
     */
    showControlsOnce: function() {
        if (this.controlsEverShown) {
            return;
        }
        this.controlsEverShown = true;
        this.controlsVisible = true;
        this.toast('Press H to toggle controls', {
            duration: 4,
            color: '#888877',
            font: '9px monospace',
            id: 'h_key_hint'
        });
    },
    
    // ========== UPDATE ==========
    
    /**
     * Update all notifications (called each frame)
     * @param {number} dt - Delta time in seconds
     */
    update: function(dt) {
        if (typeof gamePhase === 'undefined' || gamePhase !== 'playing') {
            return;
        }
        
        // Update zone banner
        if (this.zoneBanner.timer > 0) {
            this.zoneBanner.timer -= dt;
        }
        
        // Update toasts
        for (let i = 0; i < this.toasts.length; i++) {
            const toast = this.toasts[i];
            
            if (toast.dead) {
                continue;
            }
            
            toast.timer += dt;
            
            // Calculate alpha based on fade in/out
            const fullDuration = toast.duration;
            const fadeInEnd = toast.fadeIn;
            const fadeOutStart = fullDuration - toast.fadeOut;
            
            if (toast.timer < fadeInEnd) {
                // Fade in
                toast.alpha = toast.timer / fadeInEnd;
            } else if (toast.timer < fadeOutStart) {
                // Full opacity
                toast.alpha = 1;
            } else if (toast.timer < fullDuration) {
                // Fade out
                const fadeOutElapsed = toast.timer - fadeOutStart;
                toast.alpha = 1 - (fadeOutElapsed / toast.fadeOut);
            } else {
                // Dead
                toast.dead = true;
                toast.alpha = 0;
            }
        }
        
        // Remove dead toasts
        this.toasts = this.toasts.filter(t => !t.dead);
    },
    
    // ========== DRAW ==========
    
    /**
     * Render all notifications (called each frame)
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} canvasW - Canvas width
     * @param {number} canvasH - Canvas height
     */
    draw: function(ctx, canvasW, canvasH) {
        if (typeof ctx === 'undefined') {
            return;
        }
        
        // Draw zone banner
        this._drawZoneBanner(ctx, canvasW, canvasH);
        
        // Draw toasts
        this._drawToasts(ctx, canvasW, canvasH);
        
        // Draw controls reference
        this._drawControls(ctx, canvasW, canvasH);
    },
    
    /**
     * Draw zone banner (centered, large text)
     */
    _drawZoneBanner: function(ctx, canvasW, canvasH) {
        if (this.zoneBanner.timer <= 0 || !this.zoneBanner.text) {
            return;
        }
        
        // Calculate alpha with fade out in last 1.5 seconds
        let alpha = 1;
        if (this.zoneBanner.timer < 1.5) {
            alpha = this.zoneBanner.timer / 1.5;
        }
        
        ctx.save();
        ctx.globalAlpha = alpha;
        
        ctx.font = 'bold 48px Georgia';
        ctx.fillStyle = '#d4c4a0';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Text shadow for depth
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        
        ctx.fillText(this.zoneBanner.text, canvasW / 2, canvasH / 2);
        
        ctx.restore();
    },
    
    /**
     * Draw toast notifications (top-center, stacking)
     */
    _drawToasts: function(ctx, canvasW, canvasH) {
        if (this.toasts.length === 0) {
            return;
        }
        
        ctx.save();
        
        // Sort toasts by priority (higher priority first)
        const sortedToasts = [...this.toasts].sort((a, b) => b.priority - a.priority);
        
        let y = 20;
        const gap = 8;
        const padding = 12;
        const borderRadius = 4;
        
        for (const toast of sortedToasts) {
            ctx.globalAlpha = toast.alpha * 0.8; // Text alpha
            
            ctx.font = toast.font;
            const textMetrics = ctx.measureText(toast.message);
            const textWidth = textMetrics.width;
            const boxHeight = 24;
            const boxWidth = textWidth + padding * 2;
            const boxX = (canvasW - boxWidth) / 2;
            const boxY = y;
            
            // Draw background box with rounded corners
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            this._drawRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, borderRadius);
            ctx.fill();
            
            // Draw border
            ctx.strokeStyle = toast.borderColor;
            ctx.globalAlpha = toast.alpha * 0.4;
            ctx.lineWidth = 1;
            this._drawRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, borderRadius);
            ctx.stroke();
            
            // Draw text
            ctx.globalAlpha = toast.alpha * 0.8;
            ctx.fillStyle = toast.color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(toast.message, canvasW / 2, boxY + boxHeight / 2);
            
            y += boxHeight + gap;
        }
        
        ctx.restore();
    },
    
    /**
     * Draw controls reference (top-right, persistent)
     */
    _drawControls: function(ctx, canvasW, canvasH) {
        if (!this.controlsVisible) {
            return;
        }
        
        ctx.save();
        
        // Get current form (with guard)
        let form = 'wizard';
        if (typeof FormSystem !== 'undefined' && FormSystem.currentForm) {
            form = FormSystem.currentForm;
        }
        
        const controls = this.FORM_CONTROLS[form] || this.FORM_CONTROLS.wizard;
        
        ctx.font = '9px monospace';
        const lineHeight = 14;
        const padding = 10;
        const borderRadius = 4;
        const margin = 15;
        
        // Calculate box dimensions
        let maxWidth = 0;
        for (const line of controls) {
            const metrics = ctx.measureText(line);
            maxWidth = Math.max(maxWidth, metrics.width);
        }
        
        const boxWidth = maxWidth + padding * 2;
        const boxHeight = controls.length * lineHeight + padding * 2 + 15; // +15 for [H] label
        const boxX = canvasW - boxWidth - margin;
        const boxY = margin;
        
        // Draw background box
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this._drawRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, borderRadius);
        ctx.fill();
        
        // Draw border
        ctx.strokeStyle = '#8a7030';
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 1;
        this._drawRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, borderRadius);
        ctx.stroke();
        
        // Draw control lines
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = '#888877';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        
        let textY = boxY + padding;
        for (const line of controls) {
            ctx.fillText(line, boxX + padding, textY);
            textY += lineHeight;
        }
        
        // Draw [H] Hide label at bottom
        ctx.font = '8px monospace';
        ctx.fillStyle = '#666655';
        ctx.textAlign = 'right';
        ctx.fillText('[H] Hide', boxX + boxWidth - padding, boxY + boxHeight - padding - 4);
        
        ctx.restore();
    },
    
    /**
     * Helper: Draw rounded rectangle path
     */
    _drawRoundedRect: function(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    },
    
    // ========== RESET ==========
    
    /**
     * Clear all active notifications (called on game restart)
     * Note: Does NOT reset shownHints (those persist per session)
     */
    reset: function() {
        this.toasts = [];
        this.zoneBanner.text = '';
        this.zoneBanner.timer = 0;
        this.controlsVisible = false;
    }
};
