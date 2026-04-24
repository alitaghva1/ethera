// Shared PixelLab client factory. Reads the API key from .env so no
// script duplicates the dotenv + error-handling boilerplate. Never
// prints the key. Usage:
//
//   import { getClient } from './client.js';
//   const client = getClient();
//   const bal = await client.getBalance();
//
// Node 18+ required. Run as: node scripts/pixellab/<script>.js
import 'dotenv/config';
import { PixelLabClient } from '@pixellab-code/pixellab';

let _client = null;

export function getClient() {
  if (_client) return _client;
  if (!process.env.PIXELLAB_API_KEY) {
    console.error('PIXELLAB_API_KEY missing. Copy .env.example → .env and set the key.');
    process.exit(1);
  }
  // SDK's fromEnv() picks up PIXELLAB_API_KEY (or PIXELLAB_SECRET) from
  // process.env automatically — positional-arg constructor otherwise.
  _client = PixelLabClient.fromEnv();
  return _client;
}

// Small helper: save a Base64Image (PixelLab's return type) to disk as
// a PNG. The API returns "data:image/png;base64,..." strings.
export async function saveBase64Png(b64Image, outPath) {
  const { writeFile, mkdir } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  const raw = typeof b64Image === 'string' ? b64Image : b64Image.base64;
  const data = raw.startsWith('data:')
    ? Buffer.from(raw.split(',', 2)[1], 'base64')
    : Buffer.from(raw, 'base64');
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, data);
  return outPath;
}
