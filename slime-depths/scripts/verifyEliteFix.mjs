// One-shot verification harness for the elite effective-kind fix.
// Generates real floors (level 1-4) via floorGraph, walks every room
// through the actual identity pipeline (pickAuthoredShell ->
// applyAuthoredShell -> applyRoomKindDressing -> assignRoomFocal),
// and tabulates results against the user's verification checklist.
//
// Run: node scripts/verifyEliteFix.mjs
//
// This is intentionally a script (not a test) — verification gate, not
// CI. Delete after the fix is signed off if it bothers anyone.

import { generateFloorGraph } from '../src/floorGraph.js';
import {
  getEffectiveRoomKind,
  roomKindVisualProfile,
  applyRoomKindDressing,
  assignRoomFocal,
} from '../src/roomComposition.js';
import {
  pickAuthoredShell,
  applyAuthoredShell,
  validateShellPathing,
} from '../src/roomShells.js';

function simulateRoomBuild(originalData) {
  const data = JSON.parse(JSON.stringify(originalData));
  const result = {
    sourceKind: data.kind,
    eliteRoom: !!data.eliteRoom,
    sourceW: data.w, sourceH: data.h,
    sourceSpawns: (data.spawns || []).length,
    shellPicked: null,
    shellApplied: false,
    shellId: null,
    pathingValid: null,
    spawnsAfterPrune: null,
    spawnsLost: 0,
    finalW: null, finalH: null,
    effectiveKind: null,
    profile: null,
    focal: null,
  };
  const shellId = pickAuthoredShell(data);
  result.shellPicked = shellId;
  if (shellId) {
    const beforeSpawns = (data.spawns || []).length;
    const ok = applyAuthoredShell(data, shellId);
    result.shellApplied = ok;
    result.shellId = ok ? data.shellId : null;
    result.spawnsAfterPrune = (data.spawns || []).length;
    result.spawnsLost = beforeSpawns - result.spawnsAfterPrune;
    if (ok) result.pathingValid = validateShellPathing(data);
  }
  result.finalW = data.w; result.finalH = data.h;

  const room = {
    kind: data.kind,
    eliteRoom: !!data.eliteRoom,
    w: data.w, h: data.h,
    tiles: null,
    authoredFocal: data.authoredFocal || null,
    _detailSeed: 0,
  };
  const tiles = [];
  for (let y = 0; y < room.h; y++) {
    const r = [];
    for (let x = 0; x < room.w; x++) {
      const isPerim = (x === 0 || x === room.w - 1 || y === 0 || y === room.h - 1);
      r.push(isPerim ? 'wall' : 'floor');
    }
    tiles.push(r);
  }
  if (data.authoredPillars) {
    for (const p of data.authoredPillars) tiles[p.y][p.x] = 'pillar';
  }
  room.tiles = tiles;

  result.effectiveKind = getEffectiveRoomKind(room);
  applyRoomKindDressing(room);
  result.profile = {
    moodLabel: room.kindProfile?.moodLabel,
    propFamily: room.kindProfile?.propFamily,
    vignetteScale: room.kindProfile?.vignetteScale,
    floorTint: room.kindProfile?.floorTint,
    focalKinds: room.kindProfile?.focal?.kinds,
    focalPlacement: room.kindProfile?.focal?.placement,
  };
  result.focal = assignRoomFocal(room);
  return result;
}

console.log('=================================================================');
console.log('REAL-FLOOR VERIFICATION — full identity pipeline on generated rooms');
console.log('=================================================================');

// Run multiple seeds per level to get population stats — Math.random()
// across multiple full-floor generations gives ~50-80 elites per level.
const TRIALS_PER_LEVEL = 50;
const allResults = [];
for (let level = 1; level <= 4; level++) {
  for (let trial = 0; trial < TRIALS_PER_LEVEL; trial++) {
    const g = generateFloorGraph(level);
    for (const n of g.nodes) {
      if (!n.roomData) continue;
      const r = simulateRoomBuild(n.roomData);
      r.level = level;
      r.layer = n.layer;
      r.graphKind = n.kind;
      allResults.push(r);
    }
  }
}
console.log('Trials per level:', TRIALS_PER_LEVEL, '— total rooms simulated:', allResults.length);
console.log();

// Population breakdown by sourceKind + eliteRoom flag.
const byKind = {};
for (const r of allResults) {
  const key = (r.eliteRoom ? 'elite[combat-data]' : r.sourceKind);
  byKind[key] = (byKind[key] || 0) + 1;
}
console.log('Room population:');
for (const k of Object.keys(byKind).sort()) {
  console.log('  ', k.padEnd(22), byKind[k]);
}
console.log();

// CRITERION 1
const elites = allResults.filter(r => r.eliteRoom);
const elitesEffective = elites.filter(r => r.effectiveKind === 'elite');
console.log('CRITERION 1 — elite rooms resolve to effectiveKind=elite');
console.log('  ', elitesEffective.length, '/', elites.length);
console.log('  ', elites.length === elitesEffective.length ? 'PASS' : 'FAIL');
console.log();

// CRITERION 2
const elitesProfiled = elites.filter(r =>
  r.profile.moodLabel === 'ritual-arena' &&
  r.profile.propFamily === 'sparse-bones' &&
  r.profile.vignetteScale === 1.35
);
console.log('CRITERION 2 — elite rooms get elite profile');
console.log('  ', elitesProfiled.length, '/', elites.length, 'have moodLabel=ritual-arena + propFamily=sparse-bones + vignette=1.35');
console.log('  ', elites.length === elitesProfiled.length ? 'PASS' : 'FAIL');
console.log();

// CRITERION 3
const elitesShellPicked = elites.filter(r => r.shellPicked === 'crucible');
const elitesShellApplied = elites.filter(r => r.shellApplied && r.shellId === 'crucible');
const pickRate = (elitesShellPicked.length / elites.length * 100).toFixed(1);
const applyRate = (elitesShellApplied.length / elites.length * 100).toFixed(1);
console.log('CRITERION 3 — crucible shell rate on elites (target ~60% picked, applied may be lower if some rooms reject due to size/door rules)');
console.log('  ', elitesShellPicked.length, '/', elites.length, '=', pickRate + '% picked crucible');
console.log('  ', elitesShellApplied.length, '/', elites.length, '=', applyRate + '% picked + applied + path-valid');
const pickPass = parseFloat(pickRate) >= 40 && parseFloat(pickRate) <= 80;
console.log('  ', pickPass ? 'PASS (within 40-80% tolerance)' : 'FAIL');
console.log();

// CRITERION 4
const elitesFocalCorrect = elites.filter(r => r.focal && (r.focal.kind === 'crater' || r.focal.kind === 'brazier'));
const elitesFocalForward = elites.filter(r => r.profile.focalPlacement === 'forward');
console.log('CRITERION 4 — elite focal is crater or brazier, placement forward');
console.log('  ', elitesFocalCorrect.length, '/', elites.length, 'have focal.kind in {crater, brazier}');
console.log('  ', elitesFocalForward.length, '/', elites.length, 'have profile.focalPlacement=forward');
console.log('  ', (elites.length === elitesFocalCorrect.length && elites.length === elitesFocalForward.length) ? 'PASS' : 'FAIL');
console.log();

// CRITERION 5
const combats = allResults.filter(r => r.sourceKind === 'combat' && !r.eliteRoom);
const combatsEffective = combats.filter(r => r.effectiveKind === 'combat');
const combatsProfiled = combats.filter(r => r.profile.moodLabel === 'dangerous-but-functional' && r.profile.propFamily === 'combat');
const combatsNoShell = combats.filter(r => r.shellPicked === null);
console.log('CRITERION 5 — regular combat rooms unaffected');
console.log('  ', combats.length, 'regular combat rooms');
console.log('  ', combatsEffective.length, '/', combats.length, 'have effectiveKind=combat');
console.log('  ', combatsProfiled.length, '/', combats.length, 'have baseline combat profile');
console.log('  ', combatsNoShell.length, '/', combats.length, 'no shell (combat shell is disabled at chance 0)');
const c5pass = combats.length === combatsEffective.length && combats.length === combatsProfiled.length && combats.length === combatsNoShell.length;
console.log('  ', c5pass ? 'PASS' : 'FAIL');
console.log();

// CRITERION 6 — calm rooms unaffected
console.log('CRITERION 6 — calm rooms (sanctuary/reward/chestroom/altar/shop/trove) unaffected');
const calmKinds = ['sanctuary', 'reward', 'chestroom', 'altar', 'shop', 'trove'];
const breakdown = {};
for (const r of allResults) {
  if (!calmKinds.includes(r.sourceKind)) continue;
  breakdown[r.sourceKind] = breakdown[r.sourceKind] || { count: 0, profileMatches: 0, shells: {} };
  const expected = roomKindVisualProfile(r.sourceKind);
  if (r.profile.moodLabel === expected.moodLabel) breakdown[r.sourceKind].profileMatches++;
  breakdown[r.sourceKind].count++;
  const sk = r.shellPicked || 'none';
  breakdown[r.sourceKind].shells[sk] = (breakdown[r.sourceKind].shells[sk] || 0) + 1;
}
let c6pass = true;
for (const k of Object.keys(breakdown).sort()) {
  const b = breakdown[k];
  console.log('  ', k.padEnd(10), 'n=' + b.count, 'profileMatch=' + b.profileMatches + '/' + b.count, 'shells=' + JSON.stringify(b.shells));
  if (b.profileMatches !== b.count) c6pass = false;
}
console.log('  ', c6pass ? 'PASS (all calm rooms keep their expected profile)' : 'FAIL');
console.log();

// CRITERION 7 — pathing + spawn integrity on shelled elites
const eliteShelled = elites.filter(r => r.shellApplied);
const pathingFails = eliteShelled.filter(r => r.pathingValid === false);
const spawnsLostTotal = eliteShelled.reduce((acc, r) => acc + (r.spawnsLost || 0), 0);
const spawnsBeforeTotal = eliteShelled.reduce((acc, r) => acc + r.sourceSpawns, 0);
const spawnsAfterTotal = eliteShelled.reduce((acc, r) => acc + (r.spawnsAfterPrune || 0), 0);
const spawnLossRate = (spawnsLostTotal / spawnsBeforeTotal * 100).toFixed(1);
console.log('CRITERION 7 — pathing + spawn integrity on shelled elites');
console.log('  ', eliteShelled.length, 'elites had crucible shell applied');
console.log('  ', pathingFails.length, '/', eliteShelled.length, 'pathing failures (BFS to north door + focal)');
console.log('   spawn pruning: before=' + spawnsBeforeTotal + ' after=' + spawnsAfterTotal + ' lost=' + spawnsLostTotal + ' (' + spawnLossRate + '%)');
console.log('   (some loss is expected — spawns landing on the new pillar tiles get pruned)');
console.log('  ', (pathingFails.length === 0 && parseFloat(spawnLossRate) < 25) ? 'PASS' : 'FAIL');
console.log();

// REPRESENTATIVE SAMPLES
console.log('=================================================================');
console.log('REPRESENTATIVE SAMPLES');
console.log('=================================================================');
const repElite = elites.find(r => r.shellApplied);
console.log();
console.log('--- representative SHELLED ELITE room (crucible applied) ---');
if (repElite) {
  console.log('   level=' + repElite.level + ' layer=' + repElite.layer + ' graphKind=' + repElite.graphKind);
  console.log('   sourceKind=' + repElite.sourceKind + ' eliteRoom=' + repElite.eliteRoom);
  console.log('   effectiveKind=' + repElite.effectiveKind);
  console.log('   shell: picked=' + repElite.shellPicked + ' applied=' + repElite.shellApplied + ' id=' + repElite.shellId + ' pathingValid=' + repElite.pathingValid);
  console.log('   dims: source ' + repElite.sourceW + 'x' + repElite.sourceH + ' -> final ' + repElite.finalW + 'x' + repElite.finalH);
  console.log('   spawns: source=' + repElite.sourceSpawns + ' afterPrune=' + repElite.spawnsAfterPrune + ' lost=' + repElite.spawnsLost);
  console.log('   profile.moodLabel=' + repElite.profile.moodLabel);
  console.log('   profile.propFamily=' + repElite.profile.propFamily);
  console.log('   profile.vignetteScale=' + repElite.profile.vignetteScale);
  console.log('   profile.floorTint=' + JSON.stringify(repElite.profile.floorTint));
  console.log('   profile.focalKinds=' + JSON.stringify(repElite.profile.focalKinds));
  console.log('   focal: kind=' + repElite.focal.kind + ' x=' + repElite.focal.x + ' y=' + repElite.focal.y);
}
const repEliteUnshelled = elites.find(r => !r.shellApplied);
console.log();
console.log('--- representative UNSHELLED ELITE room (~40% case — still gets identity, just procedural geometry) ---');
if (repEliteUnshelled) {
  console.log('   level=' + repEliteUnshelled.level + ' layer=' + repEliteUnshelled.layer);
  console.log('   sourceKind=' + repEliteUnshelled.sourceKind + ' eliteRoom=' + repEliteUnshelled.eliteRoom);
  console.log('   effectiveKind=' + repEliteUnshelled.effectiveKind);
  console.log('   shell: picked=' + (repEliteUnshelled.shellPicked || '(none)') + ' (~40% reject the 0.60 dice roll)');
  console.log('   dims: ' + repEliteUnshelled.sourceW + 'x' + repEliteUnshelled.sourceH + ' (procedural — unchanged)');
  console.log('   profile.moodLabel=' + repEliteUnshelled.profile.moodLabel);
  console.log('   profile.propFamily=' + repEliteUnshelled.profile.propFamily);
  console.log('   profile.vignetteScale=' + repEliteUnshelled.profile.vignetteScale);
  console.log('   profile.focalKinds=' + JSON.stringify(repEliteUnshelled.profile.focalKinds));
  console.log('   focal: kind=' + repEliteUnshelled.focal.kind + ' x=' + repEliteUnshelled.focal.x + ' y=' + repEliteUnshelled.focal.y);
}
const repCombat = combats.find(r => r.sourceSpawns > 0);
console.log();
console.log('--- representative regular COMBAT room ---');
if (repCombat) {
  console.log('   level=' + repCombat.level + ' layer=' + repCombat.layer + ' graphKind=' + repCombat.graphKind);
  console.log('   sourceKind=' + repCombat.sourceKind + ' eliteRoom=' + repCombat.eliteRoom);
  console.log('   effectiveKind=' + repCombat.effectiveKind);
  console.log('   shell: picked=' + (repCombat.shellPicked || '(none — combat shell disabled at 0%)'));
  console.log('   dims: ' + repCombat.sourceW + 'x' + repCombat.sourceH);
  console.log('   spawns: source=' + repCombat.sourceSpawns);
  console.log('   profile.moodLabel=' + repCombat.profile.moodLabel);
  console.log('   profile.propFamily=' + repCombat.profile.propFamily);
  console.log('   profile.vignetteScale=' + repCombat.profile.vignetteScale);
  console.log('   profile.floorTint=' + JSON.stringify(repCombat.profile.floorTint));
  console.log('   profile.focalKinds=' + JSON.stringify(repCombat.profile.focalKinds));
  console.log('   focal: kind=' + repCombat.focal?.kind + ' x=' + repCombat.focal?.x + ' y=' + repCombat.focal?.y);
}
const repSanctuary = allResults.find(r => r.sourceKind === 'reward' && r.shellApplied);
console.log();
console.log('--- representative SANCTUARY/REWARD room (control: chamber shell still works) ---');
if (repSanctuary) {
  console.log('   level=' + repSanctuary.level + ' layer=' + repSanctuary.layer + ' graphKind=' + repSanctuary.graphKind);
  console.log('   sourceKind=' + repSanctuary.sourceKind);
  console.log('   effectiveKind=' + repSanctuary.effectiveKind);
  console.log('   shell: picked=' + repSanctuary.shellPicked + ' id=' + repSanctuary.shellId);
  console.log('   dims: source ' + repSanctuary.sourceW + 'x' + repSanctuary.sourceH + ' -> final ' + repSanctuary.finalW + 'x' + repSanctuary.finalH);
  console.log('   profile.moodLabel=' + repSanctuary.profile.moodLabel);
  console.log('   profile.propFamily=' + repSanctuary.profile.propFamily);
  console.log('   profile.vignetteScale=' + repSanctuary.profile.vignetteScale);
  console.log('   profile.floorTint=' + JSON.stringify(repSanctuary.profile.floorTint));
}
console.log();
console.log('=================================================================');
console.log('VERIFICATION SUMMARY');
console.log('=================================================================');
const all = [
  ['1. elite -> effectiveKind=elite',     elites.length === elitesEffective.length],
  ['2. elite -> elite profile',           elites.length === elitesProfiled.length],
  ['3. elite -> crucible at ~60% rate',   pickPass],
  ['4. elite focal -> crater/brazier',    elites.length === elitesFocalCorrect.length],
  ['5. combat unaffected',                c5pass],
  ['6. calm rooms unaffected',            c6pass],
  ['7. pathing/spawns intact',            pathingFails.length === 0 && parseFloat(spawnLossRate) < 25],
];
for (const [n, p] of all) console.log('  ', (p ? '[PASS]' : '[FAIL]'), n);
const allPass = all.every(([_, p]) => p);
console.log();
console.log('  OVERALL:', allPass ? 'PASS' : 'FAIL');
