// Quick diagnostic — render collision overlay onto each zone's
// composite PNG so we can see if visible objects line up with
// blocked cells.
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';

for (const ZONE of ['ruins', 'cemetery', 'crypt', 'mountain', 'volcano']) {
  const PNG = `public/assets/rooms/${ZONE}_sample.png`;
  const META = `public/assets/rooms/${ZONE}_sample.json`;
  const OUT = `scripts/${ZONE}_overlay.png`;
  const meta = JSON.parse(await readFile(META, 'utf-8'));
  const TS = meta.tileSize;

  const rects = [];
  let walls = 0, walk = 0;
  for (let y = 0; y < meta.height; y++) {
    for (let x = 0; x < meta.width; x++) {
      const cell = meta.collisionGrid?.[y]?.[x];
      const blocked = cell && cell.rects && cell.rects.length > 0;
      if (blocked) {
        rects.push(`<rect x="${x*TS}" y="${y*TS}" width="${TS}" height="${TS}" fill="rgba(255,40,40,0.45)"/>`);
        walls++;
      } else walk++;
    }
  }
  console.log(`${ZONE.padEnd(10)} ${meta.width}x${meta.height}  walls=${walls}  walk=${walk}  (${(walls / (meta.width * meta.height) * 100).toFixed(1)}% blocked)`);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${meta.imageWidth}" height="${meta.imageHeight}">${rects.join('')}</svg>`;
  await sharp(PNG)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png().toFile(OUT);
}
console.log('✓ overlays in scripts/<zone>_overlay.png');
