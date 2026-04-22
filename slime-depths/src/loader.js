// Asset loader — images + audio buffers
export const images = {};
export const audio = {};
const failed = [];

// Loading progress callback (set by loadAll)
let onProgress = null;
let loadedCount = 0;
let totalCount = 0;
function bump(src) {
  loadedCount++;
  if (onProgress) onProgress(loadedCount, totalCount, src);
}

function loadImage(key, src) {
  return new Promise((resolve) => {
    const img = new Image();
    const done = (ok) => { if (ok) images[key] = img; else { failed.push(src); console.warn('image failed:', src); } bump(src); resolve(); };
    img.onload = () => done(true);
    img.onerror = () => done(false);
    img.src = src;
  });
}

// Audio loading is tricky: `canplaythrough` may never fire in some browsers
// before user interaction (autoplay policy) or for streaming .ogg. We resolve
// on the FIRST of: canplay, loadedmetadata, or a 2.5s timeout. We only need
// the URL stored — actual playback uses <Audio> pool on demand in sfx.js.
function loadAudio(key, src) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      if (ok) audio[key] = src;
      else { failed.push(src); console.warn('audio failed:', src); }
      bump(src);
      resolve();
    };
    const a = new Audio();
    a.addEventListener('canplay',        () => finish(true),  { once: true });
    a.addEventListener('loadedmetadata', () => finish(true),  { once: true });
    a.addEventListener('error',          () => finish(false), { once: true });
    // Fallback — trust that HEAD will eventually work even if events don't fire.
    setTimeout(() => { if (!done) { audio[key] = src; bump(src); done = true; resolve(); } }, 2500);
    a.preload = 'metadata';
    a.src = src;
  });
}

export async function loadAll(progressCb) {
  onProgress = progressCb || null;
  loadedCount = 0;
  const promises = [
    loadImage('knight_idle',  'assets/characters/knight_idle.png'),
    loadImage('knight_walk',  'assets/characters/knight_walk.png'),
    loadImage('knight_attack','assets/characters/knight_attack.png'),
    loadImage('knight_hurt',  'assets/characters/knight_hurt.png'),
    loadImage('knight_death', 'assets/characters/knight_death.png'),
    loadImage('slime_idle',   'assets/enemies/slime_idle.png'),
    loadImage('slime_walk',   'assets/enemies/slime_walk.png'),
    loadImage('slime_attack', 'assets/enemies/slime_attack.png'),
    loadImage('slime_death',  'assets/enemies/slime_death.png'),
    loadImage('skel_idle',    'assets/enemies/skel_idle.png'),
    loadImage('skel_walk',    'assets/enemies/skel_walk.png'),
    loadImage('skel_attack',  'assets/enemies/skel_attack.png'),
    loadImage('skel_death',   'assets/enemies/skel_death.png'),
    loadImage('orc_idle',     'assets/enemies/orc_idle.png'),
    loadImage('orc_walk',     'assets/enemies/orc_walk.png'),
    loadImage('orc_attack',   'assets/enemies/orc_attack.png'),
    loadImage('orc_death',    'assets/enemies/orc_death.png'),
    loadImage('archer_idle',  'assets/enemies/archer_idle.png'),
    loadImage('archer_walk',  'assets/enemies/archer_walk.png'),
    loadImage('archer_attack','assets/enemies/archer_attack.png'),
    loadImage('archer_death', 'assets/enemies/archer_death.png'),
    loadImage('bonecap_idle',  'assets/enemies/bonecap_idle.png'),
    loadImage('bonecap_walk',  'assets/enemies/bonecap_walk.png'),
    loadImage('bonecap_attack','assets/enemies/bonecap_attack.png'),
    loadImage('bonecap_death', 'assets/enemies/bonecap_death.png'),
    loadImage('brood_idle',    'assets/enemies/brood_idle.png'),
    loadImage('brood_walk',    'assets/enemies/brood_walk.png'),
    loadImage('brood_attack',  'assets/enemies/brood_attack.png'),
    loadImage('brood_death',   'assets/enemies/brood_death.png'),
    loadImage('lancer_idle',   'assets/enemies/lancer_idle.png'),
    loadImage('lancer_walk',   'assets/enemies/lancer_walk.png'),
    loadImage('lancer_attack', 'assets/enemies/lancer_attack.png'),
    loadImage('lancer_death',  'assets/enemies/lancer_death.png'),
    loadImage('priest_idle',   'assets/enemies/priest_idle.png'),
    loadImage('priest_walk',   'assets/enemies/priest_walk.png'),
    loadImage('priest_attack', 'assets/enemies/priest_attack.png'),
    loadImage('priest_death',  'assets/enemies/priest_death.png'),
    loadImage('wiz_idle',      'assets/enemies/wiz_idle.png'),
    loadImage('wiz_walk',      'assets/enemies/wiz_walk.png'),
    loadImage('wiz_attack',    'assets/enemies/wiz_attack.png'),
    loadImage('wiz_death',     'assets/enemies/wiz_death.png'),
    loadImage('ember_idle',    'assets/enemies/ember_idle.png'),
    loadImage('ember_walk',    'assets/enemies/ember_walk.png'),
    loadImage('ember_attack',  'assets/enemies/ember_attack.png'),
    loadImage('ember_death',   'assets/enemies/ember_death.png'),
    loadImage('dungeon_tiles','assets/tiles/dungeon.png'),

    // Legacy shared-icon PNGs — kept as fallbacks if a dedicated per-relic
    // image ever fails to load. Not referenced by any relic now that all 34
    // have their own dedicated art (see below).
    loadImage('relic_damage',       'assets/icons/relic_damage.png'),
    loadImage('relic_attack_speed', 'assets/icons/relic_attack_speed.png'),
    loadImage('relic_reach',        'assets/icons/relic_reach.png'),
    loadImage('relic_dodge',        'assets/icons/relic_dodge.png'),
    loadImage('relic_speed',        'assets/icons/relic_speed.png'),
    loadImage('relic_max_hp',       'assets/icons/relic_max_hp.png'),
    loadImage('relic_lifesteal',    'assets/icons/relic_lifesteal.png'),
    loadImage('relic_phoenix',      'assets/icons/relic_phoenix.png'),

    // DEDICATED RELIC ICONS — one hand-drawn PNG per relic (Nano Banana, Apr 2026).
    // Replaces the old hue-rotate+glyph overlay system (kept as fallback).
    loadImage('relic_serrated_edge',    'assets/icons/relic_serrated_edge.png'),
    loadImage('relic_swift_arm',        'assets/icons/relic_swift_arm.png'),
    loadImage('relic_long_reach',       'assets/icons/relic_long_reach.png'),
    loadImage('relic_nimble_step',      'assets/icons/relic_nimble_step.png'),
    loadImage('relic_iron_greaves',     'assets/icons/relic_iron_greaves.png'),
    loadImage('relic_ironhide',         'assets/icons/relic_ironhide.png'),
    loadImage('relic_bloodstone',       'assets/icons/relic_bloodstone.png'),
    loadImage('relic_phoenix_tear',     'assets/icons/relic_phoenix_tear.png'),
    loadImage('relic_iron_resolve',     'assets/icons/relic_iron_resolve.png'),
    loadImage('relic_keen_edge',        'assets/icons/relic_keen_edge.png'),
    loadImage('relic_vitality',         'assets/icons/relic_vitality.png'),
    loadImage('relic_heavy_blow',       'assets/icons/relic_heavy_blow.png'),
    loadImage('relic_dash_master',      'assets/icons/relic_dash_master.png'),
    loadImage('relic_executioner',      'assets/icons/relic_executioner.png'),
    loadImage('relic_warlord',          'assets/icons/relic_warlord.png'),
    loadImage('relic_reaver',           'assets/icons/relic_reaver.png'),
    loadImage('relic_chain_lightning',  'assets/icons/relic_chain_lightning.png'),
    loadImage('relic_explosive_kill',   'assets/icons/relic_explosive_kill.png'),
    loadImage('relic_soul_burst',       'assets/icons/relic_soul_burst.png'),
    loadImage('relic_thunder_step',     'assets/icons/relic_thunder_step.png'),
    loadImage('relic_vampiric_aura',    'assets/icons/relic_vampiric_aura.png'),
    loadImage('relic_echoing_strike',   'assets/icons/relic_echoing_strike.png'),
    loadImage('relic_eye_of_ether',     'assets/icons/relic_eye_of_ether.png'),
    loadImage('relic_cataclysm',        'assets/icons/relic_cataclysm.png'),
    loadImage('relic_wanderers_cloak',  'assets/icons/relic_wanderers_cloak.png'),
    loadImage('relic_ethereal_binding', 'assets/icons/relic_ethereal_binding.png'),
    loadImage('relic_phoenix_cloak',    'assets/icons/relic_phoenix_cloak.png'),
    loadImage('relic_avatar_of_flame',  'assets/icons/relic_avatar_of_flame.png'),
    loadImage('relic_pyromancer',       'assets/icons/relic_pyromancer.png'),
    loadImage('relic_soulreaver',       'assets/icons/relic_soulreaver.png'),
    loadImage('relic_counterstrike',    'assets/icons/relic_counterstrike.png'),
    loadImage('relic_aegis_pulse',      'assets/icons/relic_aegis_pulse.png'),
    loadImage('relic_bloodrite',        'assets/icons/relic_bloodrite.png'),
    loadImage('relic_gale_step',        'assets/icons/relic_gale_step.png'),

    // FUSION ICONS — dedicated art per fusion recipe (Nano Banana, Apr 2026)
    loadImage('fusion_tesla_storm',     'assets/icons/fusion_tesla_storm.png'),
    loadImage('fusion_blood_moon',      'assets/icons/fusion_blood_moon.png'),
    loadImage('fusion_rebirth_pyre',    'assets/icons/fusion_rebirth_pyre.png'),
    loadImage('fusion_conflagration',   'assets/icons/fusion_conflagration.png'),
    loadImage('fusion_phantom_blade',   'assets/icons/fusion_phantom_blade.png'),
    loadImage('fusion_storm_dance',     'assets/icons/fusion_storm_dance.png'),
    loadImage('fusion_riposte',         'assets/icons/fusion_riposte.png'),
    loadImage('fusion_mountains_heart', 'assets/icons/fusion_mountains_heart.png'),
    loadImage('fusion_obsidian_edge',   'assets/icons/fusion_obsidian_edge.png'),
    loadImage('fusion_tempest',         'assets/icons/fusion_tempest.png'),
    loadImage('fusion_final_verdict',   'assets/icons/fusion_final_verdict.png'),
    loadImage('fusion_stalwart',        'assets/icons/fusion_stalwart.png'),
    loadImage('fusion_sparrows_dance',  'assets/icons/fusion_sparrows_dance.png'),
    loadImage('fusion_witness',         'assets/icons/fusion_witness.png'),

    // BOSS PORTRAITS — shown in Chronicles > Bestiary when boss is defeated
    loadImage('portrait_grudnok',       'assets/enemies/portrait_grudnok.png'),
    loadImage('portrait_iron_revenant', 'assets/enemies/portrait_iron_revenant.png'),
    loadImage('portrait_broodmother',   'assets/enemies/portrait_broodmother.png'),
    loadImage('portrait_ember_tyrant',  'assets/enemies/portrait_ember_tyrant.png'),
    loadImage('portrait_echo_of_self',  'assets/enemies/portrait_echo_of_self.png'),
    loadImage('portrait_hermit',        'assets/enemies/portrait_hermit.png'),

    // HAMLET NPC PORTRAITS — painted in the same register as boss portraits
    // (Nano Banana). When files are missing, hamlet falls back to a silhouette
    // so the feature degrades gracefully.
    loadImage('npc_keeper',             'assets/hamlet/npc_keeper.png'),
    loadImage('npc_smith',              'assets/hamlet/npc_smith.png'),
    loadImage('npc_archivist',          'assets/hamlet/npc_archivist.png'),
    loadImage('npc_gravekeeper',        'assets/hamlet/npc_gravekeeper.png'),
    loadImage('npc_oracle',             'assets/hamlet/npc_oracle.png'),
    loadImage('npc_wanderer_hamlet',    'assets/hamlet/npc_wanderer_hamlet.png'),

    loadAudio('sword_swing',  'assets/sfx/sword_swing.ogg'),
    loadAudio('slime_hit',    'assets/sfx/slime_hit.ogg'),
    loadAudio('slime_death',  'assets/sfx/slime_death.ogg'),
    loadAudio('hero_hurt',    'assets/sfx/hero_hurt.ogg'),
    loadAudio('footstep_0',   'assets/sfx/footstep_0.ogg'),
    loadAudio('footstep_1',   'assets/sfx/footstep_1.ogg'),
    loadAudio('click',        'assets/sfx/click.ogg'),
  ];
  totalCount = promises.length;
  await Promise.all(promises);
  if (failed.length) console.warn(failed.length + ' asset(s) failed to load:', failed);
  else console.log('[slime-depths] all ' + totalCount + ' assets loaded');
}
