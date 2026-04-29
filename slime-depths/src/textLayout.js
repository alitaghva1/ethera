// ============================================================================
// TEXT LAYOUT — single canvas word-wrap helper.
//
// Replaces four near-identical implementations that used to live in:
//   - src/hud.js              (wrapText)
//   - src/pedestals.js        (wrapPedestalText)
//   - src/notifications.js    (_wrapText)
//   - src/watcher.js          (wrapText)
// All four had the same algorithm with cosmetic differences. Architecture
// audit P0 → consolidated here. Pure function, no module state, ~10 LOC.
//
// Usage:
//   ctx.font = '12px Georgia, serif';     // caller sets the font first
//   const lines = wrapText(ctx, longString, maxPxWidth);
//   for (const line of lines) ctx.fillText(line, x, y), y += lineHeight;
// ============================================================================

/**
 * Word-wrap `text` to fit within `maxWidth` pixels using the canvas's
 * CURRENT font setting. Splits on spaces — does not handle CJK or
 * grapheme clusters. Returns an array of line strings; for empty
 * input, returns [''] so callers can iterate uniformly without
 * special-casing.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 * @returns {string[]}
 */
export function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(' ');
  const lines = [];
  let cur = '';
  for (const word of words) {
    const test = cur ? cur + ' ' + word : word;
    if (cur && ctx.measureText(test).width > maxWidth) {
      lines.push(cur);
      cur = word;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}
