// ============================================================
//  PLAYER (continuous free movement)
// ============================================================
const player = {
    row: 4, col: 3,       // canonical position (floating point)
    vx: 0, vy: 0,         // velocity (row, col)
    facing: 1,             // 1 = right, -1 = left (legacy compat)
    dir8: 'S',             // 8-direction facing for PVGames sprites
    state: 'idle',
    animFrame: 0,
    lastHorizDir: 1,
    // Phase jump state
    dodging: false,
    dodgeTimer: 0,
    dodgeCoolTimer: 0,
    dodgeDirRow: 0,
    dodgeDirCol: 0,
    dodgeFlashTimer: 0,
    // Attack state
    attacking: false,
    attackTimer: 0,
    attackFrame: 0,
    attackCooldown: 0,
    // HP & Mana
    hp: 60, // slime starting HP
    mana: 100,
    manaRegenTimer: 0,    // delay before regen kicks in after casting
    // Status effects
    frozenTimer: 0,       // Frost Wyrm freeze — prevents all movement/actions
    slowTimer: 0,         // slow debuff (reduces speed)
};

