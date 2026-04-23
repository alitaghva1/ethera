// RELIC FUSION SYSTEM — when the hero picks up a second relic that completes
// a fusion recipe, a new named "fused" effect is discovered. Fusions stack on
// top of (don't replace) the component relics and grant a unique new ability.
//
// Each fusion has:
//   components : sorted [id1, id2] pair (always alphabetical)
//   name       : display name
//   desc       : short description
//   tint       : color for HUD/VFX
//   apply      : called once when fusion activates — sets a hero flag or stat
//
// Discovery is persisted in localStorage so players build up a codex over
// many runs. The "first time" a fusion activates triggers a dramatic banner.

import { safeLoadJSON, safeSaveJSON } from './storage.js?v=save1';

const KEY = 'ethera:fusions_discovered:v1';

export const discoveredFusions = new Set();

export function loadDiscoveredFusions() {
  const arr = safeLoadJSON(KEY, null, Array.isArray);
  if (arr) for (const id of arr) discoveredFusions.add(id);
}
function saveDiscoveredFusions() {
  safeSaveJSON(KEY, [...discoveredFusions]);
}

// Helper — deterministic pair key regardless of apply order
function pairKey(a, b) { return a < b ? a + '+' + b : b + '+' + a; }

export const FUSIONS = {
  // ========== Chain Lightning + Explosive Kill ==========
  // Tesla Storm — chain arcs detonate on impact, spreading damage
  tesla_storm: {
    id: 'tesla_storm',
    components: ['chain_lightning', 'explosive_kill'],
    name: 'Tesla Storm',
    desc: 'Chain lightning arcs detonate on impact',
    flavor: 'Thunder was never enough. Now it ends the sentence with fire.',
    tint: '#a0e8ff',
    icon: 'fusion_tesla_storm',
    apply: (hero) => { hero.fusionTeslaStorm = true; },
  },
  // ========== Vampiric Aura + Bloodrite ==========
  blood_moon: {
    id: 'blood_moon',
    components: ['vampiric_aura', 'bloodrite'],
    name: 'Blood Moon',
    desc: 'Lifesteal scales up as HP drops (up to 3\u00d7 at 25% HP)',
    flavor: 'The closer to death, the hungrier the moon.',
    tint: '#d8406a',
    icon: 'fusion_blood_moon',
    apply: (hero) => { hero.fusionBloodMoon = true; },
  },
  // ========== Phoenix Cloak + Cataclysm ==========
  rebirth_pyre: {
    id: 'rebirth_pyre',
    components: ['phoenix_cloak', 'cataclysm'],
    name: 'Rebirth Pyre',
    desc: 'Phoenix revive unleashes a 10-pulse cataclysm',
    flavor: 'You do not come back quietly. The world knows you have returned.',
    tint: '#ff8040',
    icon: 'fusion_rebirth_pyre',
    apply: (hero) => { hero.fusionRebirthPyre = true; },
  },
  // ========== Pyromancer + Avatar of Flame ==========
  conflagration: {
    id: 'conflagration',
    components: ['pyromancer', 'avatar_of_flame'],
    name: 'Conflagration',
    desc: 'Fire trail intensifies; every 2nd hit explodes in flame',
    flavor: 'The fire was patient. You gave it permission.',
    tint: '#ff6020',
    icon: 'fusion_conflagration',
    apply: (hero) => { hero.fusionConflagration = true; },
  },
  // ========== Soulreaver + Echoing Strike ==========
  phantom_blade: {
    id: 'phantom_blade',
    components: ['soulreaver', 'echoing_strike'],
    name: 'Phantom Blade',
    desc: 'Echoing strikes also build Soulreaver stacks',
    flavor: 'Every swing is two \u2014 one here, one elsewhere, both remembered.',
    tint: '#b0c8ff',
    icon: 'fusion_phantom_blade',
    apply: (hero) => { hero.fusionPhantomBlade = true; },
  },
  // ========== Thunder Step + Chain Lightning ==========
  storm_dance: {
    id: 'storm_dance',
    components: ['chain_lightning', 'thunder_step'],
    name: 'Storm Dance',
    desc: 'Dodge trail arcs lightning to nearby enemies',
    flavor: 'You do not dodge the storm. You are the storm passing through.',
    tint: '#b0e8ff',
    icon: 'fusion_storm_dance',
    apply: (hero) => { hero.fusionStormDance = true; },
  },
  // ========== Counterstrike + Wanderers Cloak ==========
  riposte: {
    id: 'riposte',
    components: ['counterstrike', 'wanderers_cloak'],
    name: 'Riposte',
    desc: 'Counter hits trigger 1.5s attack-speed surge',
    flavor: 'The dodge was the swing. You have been striking since they began.',
    tint: '#ffeb99',
    icon: 'fusion_riposte',
    apply: (hero) => { hero.fusionRiposte = true; },
  },
  // ========== Vitality + Ironhide ==========
  mountains_heart: {
    id: 'mountains_heart',
    components: ['ironhide', 'vitality'],
    name: "Mountain's Heart",
    desc: 'At full HP: +15% damage resist, +10% damage',
    flavor: 'A thing that does not bleed cannot be hurried.',
    tint: '#a0c0d0',
    icon: 'fusion_mountains_heart',
    apply: (hero) => { hero.fusionMountainsHeart = true; },
  },
  // ========== Keen Edge + Serrated Edge ==========
  obsidian_edge: {
    id: 'obsidian_edge',
    components: ['keen_edge', 'serrated_edge'],
    name: 'Obsidian Edge',
    desc: 'Crit chance doubled; crits cause 3s bleed',
    flavor: 'The wound you leave is a clock. It will find them later.',
    tint: '#8080ff',
    icon: 'fusion_obsidian_edge',
    apply: (hero) => { hero.fusionObsidianEdge = true; hero.critChance *= 2; },
  },
  // ========== Heavy Blow + Warlord ==========
  tempest: {
    id: 'tempest',
    components: ['heavy_blow', 'warlord'],
    name: 'Tempest',
    desc: 'Combo bonus doubles at CARNAGE (40+ combo = +70% damage)',
    flavor: 'What begins as a swing ends as a season.',
    tint: '#ff9066',
    icon: 'fusion_tempest',
    apply: (hero) => { hero.fusionTempest = true; },
  },
  // ========== Eye of Ether + Executioner ==========
  // Final Verdict — crits below 50% HP instantly kill. The finisher fusion.
  final_verdict: {
    id: 'final_verdict',
    components: ['eye_of_ether', 'executioner'],
    name: 'Final Verdict',
    desc: 'Crits on enemies below 50% HP execute instantly',
    flavor: 'Mercy, written in the bones of those who earned it.',
    tint: '#e6c8ff',
    icon: 'fusion_final_verdict',
    apply: (hero) => {
      hero.fusionFinalVerdict = true;
      hero.executeThreshold = Math.max(hero.executeThreshold || 0, 0.5);
      hero.executeMul = Math.max(hero.executeMul || 0, 2.5);
    },
  },
  // ========== Iron Resolve + Aegis Pulse ==========
  // Stalwart — the closer you come to breaking, the harder you are to break.
  stalwart: {
    id: 'stalwart',
    components: ['iron_resolve', 'aegis_pulse'],
    name: 'Stalwart',
    desc: 'Damage resistance doubles while below 50% HP',
    flavor: 'A shield that grows heavier the closer you come to breaking.',
    tint: '#a0d8ff',
    icon: 'fusion_stalwart',
    apply: (hero) => { hero.fusionStalwart = true; },
  },
  // ========== Swift Arm + Gale Step ==========
  // Sparrow's Dance — every 5th attack releases a gust AoE around the hero.
  sparrows_dance: {
    id: 'sparrows_dance',
    components: ['swift_arm', 'gale_step'],
    name: "Sparrow's Dance",
    desc: 'Every 5th attack releases a ring of wind around you',
    flavor: 'She moved so quickly the air forgot how to close.',
    tint: '#b0e8ff',
    icon: 'fusion_sparrows_dance',
    apply: (hero) => { hero.fusionSparrowsDance = true; hero.sparrowCounter = 0; },
  },
  // ========== Bloodstone + Ethereal Binding ==========
  // Witness — each heal from lifesteal grants a breath of invulnerability.
  witness: {
    id: 'witness',
    components: ['bloodstone', 'ethereal_binding'],
    name: 'Witness',
    desc: 'Lifesteal heals grant 0.4s of invulnerability',
    flavor: 'You drink. The world looks away.',
    tint: '#ffcfd8',
    icon: 'fusion_witness',
    apply: (hero) => { hero.fusionWitness = true; },
  },

  // ==========================================================================
  // NEW FUSIONS (systems pass — session 1). Pairs involving the respecced
  // commons + the two new commons so build discovery has more attainable
  // combinations at common-tier pickup rates.
  // ==========================================================================
  kingslayer: {
    id: 'kingslayer',
    components: ['long_reach', 'serrated_edge'],
    name: 'Kingslayer',
    desc: 'Speartip hits past 80% reach also have +15% crit chance',
    flavor: 'The spearman who did not need to step close.',
    tint: '#c9a0ff',
    icon: 'fusion_obsidian_edge',
    apply: (hero) => { hero.fusionKingslayer = true; },
  },
  aegis_wall: {
    id: 'aegis_wall',
    components: ['bulwark', 'iron_resolve'],
    name: 'Aegis Wall',
    desc: 'Frontal damage reduced 75% total (stacks Bulwark + Iron Resolve)',
    flavor: 'A silence that did not know how to break.',
    tint: '#90b8d8',
    icon: 'fusion_stalwart',
    apply: (hero) => { hero.bulwarkReduction = 0.25; },
  },
  weaving_step: {
    id: 'weaving_step',
    components: ['second_wind', 'nimble_step'],
    name: 'Weaving Step',
    desc: 'Cleansing dodges grant 0.3s of i-frames on your next hit',
    flavor: 'The ruin exhales, and she is already past it.',
    tint: '#b0e8c0',
    icon: 'fusion_sparrows_dance',
    apply: (hero) => { hero.fusionWeavingStep = true; },
  },
};

// Build a map of pair-key → fusionId for quick lookup
const FUSION_BY_PAIR = {};
for (const id in FUSIONS) {
  const f = FUSIONS[id];
  const key = pairKey(f.components[0], f.components[1]);
  FUSION_BY_PAIR[key] = id;
}

// Active fusions on this run
export const activeFusions = [];

export function clearFusions() {
  activeFusions.length = 0;
}

// Check if adding a new relic completes any fusions with existing ones.
// Returns array of newly-activated fusion objects (0 if none).
export function checkFusionsOnPickup(newRelicId, equippedRelicIds, hero) {
  const newlyActivated = [];
  for (const existingId of equippedRelicIds) {
    if (existingId === newRelicId) continue;
    const key = pairKey(newRelicId, existingId);
    const fusionId = FUSION_BY_PAIR[key];
    if (!fusionId) continue;
    // Already active? skip
    if (activeFusions.some(f => f.id === fusionId)) continue;
    const fusion = FUSIONS[fusionId];
    activeFusions.push(fusion);
    try { fusion.apply(hero); } catch (e) {}
    // First-ever discovery — persist
    if (!discoveredFusions.has(fusionId)) {
      discoveredFusions.add(fusionId);
      saveDiscoveredFusions();
      fusion._firstDiscovery = true;       // transient flag for the banner
    }
    newlyActivated.push(fusion);
  }
  return newlyActivated;
}

// Get total count for codex UI
export function totalFusions() { return Object.keys(FUSIONS).length; }
export function discoveredCount() { return discoveredFusions.size; }
