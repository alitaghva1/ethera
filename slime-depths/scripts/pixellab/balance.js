// Smoke-test: prints the remaining USD balance on the PixelLab account.
// Use this to confirm the API key in .env is valid before spending any
// credit on actual generations. No cost to call.
//
//   node scripts/pixellab/balance.js
import { getClient } from './client.js';

const client = getClient();
const bal = await client.getBalance();
console.log('PixelLab balance:', bal);
