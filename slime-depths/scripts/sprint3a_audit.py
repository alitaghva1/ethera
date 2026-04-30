"""
Sprint 3A — bulk add `affects: [...]` to all relics + fusions.
The `affects` field tags which ability slot the relic primarily scales.
Slots: 'sword' (melee), 'blast' (ranged bolts), 'shield' (defensive cast),
'mobility' (dash/blink), 'any' (universal — HP/regen/economy/passive aura).
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# ============================================================================
# RELIC AFFECTS MAP (62 entries)
# ============================================================================
RELIC_AFFECTS = {
    # Universal damage/crit/atk-cd — apply to BOTH sword swings AND blast bolts
    'serrated_edge':       ['sword', 'blast'],
    'swift_arm':           ['sword', 'blast'],
    'long_reach':          ['sword', 'blast'],
    'keen_edge':           ['sword', 'blast'],
    'executioner':         ['sword', 'blast'],
    'warlord':             ['sword', 'blast'],
    'reaver':              ['sword', 'blast'],
    'chain_lightning':     ['sword', 'blast'],
    'explosive_kill':      ['sword', 'blast'],
    'echoing_strike':      ['sword', 'blast'],
    'eye_of_ether':        ['sword', 'blast'],
    'cataclysm':           ['sword', 'blast'],
    'pyromancer':          ['sword', 'blast'],
    'soulreaver':          ['sword', 'blast'],
    'bloodrite':           ['sword', 'blast'],
    'spore_bloom':         ['sword', 'blast'],
    'marrow_pact':         ['sword', 'blast'],
    'soul_burst':          ['sword', 'blast'],
    'iron_greaves':        ['sword', 'blast'],

    # Sword-specific (melee-flavored kill triggers, weapon variants)
    'bloodstone':          ['sword'],
    'heavy_blow':          ['sword'],
    'arcane_quiver':       ['sword'],
    'vampiric_aura':       ['sword'],
    'avatar_of_flame':     ['sword'],
    'honest_edge':         ['sword'],     # weaponOnly: sword — kept
    'ringing_steel':       ['sword'],     # weaponOnly: sword — kept
    'vow_eternal':         ['sword'],     # weaponOnly: sword — kept
    'twin_pulse':          ['sword'],     # weaponOnly: dagger — kept
    'razor_pace':          ['sword'],     # weaponOnly: dagger — kept
    'mountain_strike':     ['sword'],     # weaponOnly: hammer — kept
    'earthen_hold':        ['sword'],     # weaponOnly: hammer — kept
    'world_ender':         ['sword'],     # weaponOnly: hammer — kept

    # Blast-specific — formerly wand-only, now blast-slot universally
    'splintered_light':    ['blast'],     # REMOVE weaponOnly: wand
    'storm_conduit':       ['blast'],     # REMOVE weaponOnly: wand
    'patient_lens':        ['blast'],     # REMOVE weaponOnly: wand

    # Shield slot (formerly dodge-flavored — Sprint 1 rebound to shield)
    'nimble_step':         ['shield'],
    'iron_resolve':        ['shield'],
    'dash_master':         ['shield'],
    'thunder_step':        ['shield'],
    'counterstrike':       ['shield'],
    'aegis_pulse':         ['shield'],
    'bulwark':             ['shield'],
    'mirror_shard':        ['shield'],
    'second_wind':         ['shield'],
    'gale_step':           ['shield'],
    'oathshield':          ['shield'],
    'temporal_eye':        ['shield'],
    'whisper_veil':        ['shield'],
    'flicker_step':        ['shield'],
    'wanderers_cloak':     ['shield'],
    'stride_of_ash':       ['shield'],

    # Universal (HP / regen / revive / passive aura / economy)
    'ironhide':            ['any'],
    'phoenix_tear':        ['any'],
    'vitality':            ['any'],
    'ethereal_binding':    ['any'],
    'phoenix_cloak':       ['any'],
    'gilded_hoard':        ['any'],
    'hymn_of_embers':      ['any'],
    'stormcaller':         ['any'],
    'hourglass_of_respite': ['any'],
    'heart_of_wound':      ['any'],
    'coin_of_tyrant':      ['any'],
}

# ============================================================================
# FUSION AFFECTS MAP (28 entries)
# ============================================================================
FUSION_AFFECTS = {
    'tesla_storm':         ['sword', 'blast'],
    'blood_moon':          ['sword'],
    'rebirth_pyre':        ['any'],
    'conflagration':       ['sword'],
    'phantom_blade':       ['sword', 'blast'],
    'storm_dance':         ['shield'],
    'riposte':             ['shield'],
    'mountains_heart':     ['any'],
    'obsidian_edge':       ['sword', 'blast'],
    'tempest':             ['sword'],
    'final_verdict':       ['sword', 'blast'],
    'stalwart':            ['shield'],
    'sparrows_dance':      ['shield'],
    'witness':             ['sword'],
    'kingslayer':          ['sword', 'blast'],
    'aegis_wall':          ['shield'],
    'weaving_step':        ['shield'],
    'shatterpoint':        ['shield'],
    'wildfire_choir':      ['sword', 'blast'],
    'martyr_bloom':        ['sword'],
    'stormveil':           ['shield'],
    'ringbearer':          ['sword'],
    'starweave':           ['sword', 'blast'],
    'sworn_reply':         ['sword', 'shield'],
    'mortal_cadence':      ['sword'],
    'avalanche':           ['sword'],
    'crescendo':           ['sword'],
    'forked_sky':          ['blast'],
}


def inject_affects(filepath, affects_map, label):
    with open(filepath, 'rb') as f:
        src = f.read().decode('utf-8')

    n_added = 0
    n_skipped = 0
    n_existing = 0

    def replace(match):
        nonlocal n_added, n_skipped, n_existing
        indent = match.group(1)
        id_val = match.group(2)
        full = match.group(0)
        if id_val not in affects_map:
            n_skipped += 1
            return full
        affects = affects_map[id_val]
        affects_str = "[" + ", ".join("'" + a + "'" for a in affects) + "]"
        n_added += 1
        return full + indent + "affects: " + affects_str + ",\r\n"

    new_src = re.sub(
        r"(?m)^(    )id: '([^']+)',\r?\n",
        replace,
        src,
    )

    with open(filepath, 'wb') as f:
        f.write(new_src.encode('utf-8'))
    print(f"{filepath.name}: added {n_added} {label} tags, skipped {n_skipped} unrecognized")


def main():
    inject_affects(ROOT / 'src' / 'relics.js', RELIC_AFFECTS, 'relic')
    inject_affects(ROOT / 'src' / 'fusions.js', FUSION_AFFECTS, 'fusion')


if __name__ == '__main__':
    main()
