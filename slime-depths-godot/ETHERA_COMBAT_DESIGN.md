# Ethera — Combat Design Document

**Status**: PROPOSAL — awaiting user approval before any code changes
**Date**: 2026-05-20 (post-Director audit, post-Loop Tightening)
**Path**: Path B — fold parry into perfect-dodge; combat moves from 5 verbs to 4

---

## 1. Combat identity (one sentence)

> *"A robed scholar of forbidden magic — every gesture is COMMITTED, but skilled chaining (dodge-into-strike, perfect-dodge-into-riposte) is the path to mastery."*

This places Ethera between Hades (committed verbs, chains reward skill) and Hollow Knight (deliberate weight). Explicitly NOT between BoI (everything spammable) and Vampire Survivors (no manual verbs). Each gesture has weight; the depth comes from chaining.

---

## 2. Per-verb specifications

### SWORD (LMB) — committed melee with 3-hit combo

| Frame | Current | Proposed |
|-------|---------|----------|
| Hit 1 (jab) startup | 0.06s | **0.10s** |
| Hit 1 active | 0.18s | **0.08s** |
| Hit 1 recovery | 0 | **0.16s** |
| Hit 1 total | 0.18s | **0.34s** |
| Damage | 1 | **1** |
| Hit 2 (jab) | (n/a — no combo) | **same as Hit 1, 0.34s, damage 1** |
| Hit 3 (HEAVY) | (n/a) | **0.20s startup / 0.10s active / 0.32s recovery = 0.62s total, damage 2, +50% knockback** |
| Combo window | n/a | **0.50s after each hit to chain into next** |

**Identity**: jab-jab-heavy rhythm. Solves the "feels too fast / mashy" complaint by adding committal heavy 3rd swing. Players who time the combo correctly get +50% damage over 3 hits in 1.30s (~2.31 dps including animations) vs. cancel-into-dodge after 2 jabs (~5.88 dps before recovery). Skill expression.

**Why these numbers**: Hades attack cycle is ~0.30s; Hollow Knight nail is ~0.40s; our 0.34s sits in the middle. Heavy 0.62s is committed enough to feel risky but reproducible.

**Visual telegraph for combo state**: when Hit 1 is buffered for Hit 2, hero's blade glints faint amber. Hit 2 → blade glows orange. Hit 3 windup → blade engulfed in red, screen-tint warms. Player SEES the combo state.

---

### BLAST (RMB) — ranged commitment

| Frame | Current | Proposed |
|-------|---------|----------|
| Startup | 0s (instant) | **0.10s windup** |
| Active | (projectile fires) | **(projectile fires at end of windup)** |
| Recovery | 0.18s | **0.30s** |
| Total commitment | 0.18s | **0.40s** |
| Cooldown | 0.55s | **0.55s** (unchanged) |

**Identity**: the ranged commit verb. You PAY for the range with commitment. Adding a brief windup makes the cast read as deliberate rather than reflexive — solves the "what's the difference between blast and sword" reading. Bayonetta-style cast feel.

**Cancel rule**: can be cancelled INTO dodge only. NOT into sword. This preserves blast's identity as a committed ranged option distinct from melee.

**Visual telegraph for windup**: hero's off-hand glows violet during the 0.10s windup, projectile spawns from the off-hand at fire.

---

### DODGE (SHIFT) — the load-bearing defensive verb (subsumes parry)

| Frame | Current dash | Proposed |
|-------|-------------|----------|
| Cooldown | 0.9s | **0.6s** |
| Duration | 0.28s | **0.24s** |
| Post-iframes | +0.10s | (rolled into active duration) |
| Travel distance | ~168 px | **~140 px** |
| Damage on pass-through | 1 | **1** (kept — dash-strike heritage) |
| **Perfect-dodge window** | n/a | **last 0.10s of dodge active frames** (~6 frames @ 60fps) |
| **Perfect-dodge reward** | n/a | **0.6s local slow-mo on enemies + violet phase blur + brass chime + next sword strike +50% dmg AND guaranteed crit** |

**Identity**: the SINGLE defensive verb. Same input, two outcomes — regular evade if you dodge early, **PERFECT DODGE** if you dodge late (i.e. during an enemy's swing-connect frame).

**Window timing**: 0.10s ≈ 6 frames at 60fps. Sits between Sekiro deflect (12 frames, ~200ms) and DMC5 Royal Guard (6 frames, ~100ms). Reachable for normal players; mastery for skilled.

**Failure mode**: miss the perfect timing → you still get a normal dodge with full i-frames. **No punishment for trying** (Bayonetta pattern).

**Spam anti**: if you press SHIFT before an enemy attack is mid-swing, you dodge early and get the regular dodge (no perfect window). The window only opens when an enemy attack actually connects with your i-frame hitbox. Spamming SHIFT randomly doesn't trigger perfect-dodge — you have to time the attack.

**Mid-dodge attack penalty** (Hades pattern): if you press LMB during dodge active frames, the dodge ENDS IMMEDIATELY — remaining i-frames die, swing starts. Skilled play (sword strike right after a perfect-dodge gets the +50% / guaranteed crit). Panic play (mashing LMB mid-dodge) loses the i-frame protection.

**FLAME tier fire trail**: KEEP (existing iter-64 system — dodge through enemies leaves fire pools).

**Cancellable INTO**: Sword (kills remaining i-frames; rewards skilled timing), Blast (kite shot), Active relic.

---

### ACTIVE RELIC (R) — situational tool, unchanged

Existing iter-213 dispatch stays as-is. 4 actives (SOUL SURGE / VEILSTEP / ASHEN SEAL / BLOOD TITHE), each with their own cooldown (14-30s). Fires from any state — outside the cancel chain.

---

### PARRY (Q) — REMOVED ❌

Folded into perfect-dodge. Specific migrations:

| Existing parry system | New home |
|----------------------|----------|
| iter-25 SHIELD_WINDOW catch | DELETED |
| iter-197 parry chime audio | Repurposed as **perfect-dodge chime** |
| iter-215 BACKDRAFT combo (burn + parry) | **BACKDRAFT combo (burn + perfect-dodge)** |
| iter-63 VOW ascendance reflect-fan + heal | Triggered on perfect-dodge instead |
| `hero_shielded` Events signal | Renamed to `hero_perfect_dodged` |
| `_shield_time`, `_shield_cd`, `_shield_aim`, `_shield_ref` state | DELETED |
| `parry_shield.tscn` scene | DELETED (or kept for future) |
| Q input binding in input_setup.gd | DELETED |

---

## 3. Cancel/interrupt matrix

```
FROM \ TO       Sword1  Sword2  Sword3  Blast  Dodge  Active
─────────────────────────────────────────────────────────────
Idle             ✓       —       —       ✓      ✓      ✓
Sword 1 (recov)  —       ✓       —       ✓      ✓      ✓
Sword 2 (recov)  —       —       ✓       ✓      ✓      ✓
Sword 3 (recov)  —       —       —       —      ✓      ✓      ← committed
Blast (recov)    —       —       —       —      ✓      ✓      ← commit verb
Dodge (active)   ✓✓      —       —       ✓      —      ✓      ← ✓✓ ends iframes
Active relic     (per-relic; default: not cancellable)
```

Notes:
- **Sword combo chain** (1→2→3) is the primary combat rhythm
- **Sword → Dodge** is the universal "I can always dodge" escape
- **Dodge → Sword** kills remaining i-frames (Hades pattern) — the skill chain
- **Blast → only Dodge** preserves blast's commit identity
- **Sword 3 → nothing but Dodge** — committed to the heavy
- **Active relic** fires from any state — the panic button

---

## 4. Committal trade — what each verb COSTS you

| Verb | What it locks you out of | What it offers in return |
|------|--------------------------|--------------------------|
| Sword 1/2 | 0.34s where you can't move freely (planted feet, ATTACK_MOVE_SPEED_MUL=0.35) | 1 damage, fast cycle, can chain |
| Sword 3 (heavy) | 0.62s with no dodge cancel until recovery ends | 2 damage + heavy knockback + ends combo cleanly |
| Blast | 0.40s commitment (windup + recovery), cannot move-aim during | Range, multi-shot via relics, no melee risk |
| Dodge | 0.24s active where you can't aim or attack (unless you cancel and lose i-frames) | i-frame escape + perfect-dodge skill payoff |
| Active relic | 14-30s cooldown | Big effect, situational tool |

The TRADE is what makes the combat tight. Today most verbs lock you out of NOTHING — that's why it feels mashy/floaty.

---

## 5. Perfect-Dodge mechanic — full spec

### Trigger
Hero presses SHIFT. During the dodge's active frames (0.24s window), if an enemy attack connects with the hero's hitbox AT ANY POINT in the LAST 0.10s of that window, fire PERFECT DODGE.

### Detection
- In `hero.gd::take_damage`, check `_dodge_active_time` and whether it falls within `[0.0, 0.10]` of the dodge end. If yes: don't apply damage (the normal i-frames already do this), but ALSO set `_perfect_dodge_buffer = 1.5s`.
- The `_perfect_dodge_buffer` is the "perfect attack on next swing" window. While it's > 0, the next LMB swing gets +50% damage AND is guaranteed-crit. Consumed on connect.

### Visual feedback (the moment must feel like a moment)
- **Local slow-mo**: Engine.time_scale → 0.40 for 0.30s, easing back over 0.30s = 0.60s total. NOTE: Engine.time_scale slows EVERYTHING including hero — but since this is brief (0.6s) and lets the player SEE that they nailed it, it's net-positive. Bayonetta uses full slow-mo; we're doing a shortened version.
- **Violet phase blur**: 0.25s sprite trail in violet `Color(0.55, 0.30, 0.95, 0.6)` — reuses iter-213 VEILSTEP rim
- **Screen edge wash**: violet vignette pulses at 0.45 alpha for 0.4s — reuses existing iter-194 vignette pipeline retinted
- **Center floater**: "PERFECT!" in violet, 0.6s lifetime

### Audio feedback
- **Brass chime**: reuse iter-197 parry chime (perfect-dodge takes over its semantic role). Layered on top: a low brass note at 220Hz for the "weight" of nailing it.

### Reward
- Next sword strike: +50% damage, guaranteed crit, +20% knockback
- Buffer time: 1.5s (long enough to land 1-2 hits depending on combo state)

### Failure mode
- Miss the timing → regular dodge, normal i-frames, no penalty, no buff. **Always pressable.**

### Spam anti
- No window opens unless an enemy attack is mid-swing during the active frames
- Trying to "spam" the dodge → just normal dodges with cooldowns. The 0.6s cooldown is the natural rate-limit.

### Backwards compat / migration
- iter-215 BACKDRAFT combo (burn + parry → flame burst) becomes burn + perfect-dodge → flame burst. Code path renames.
- iter-63 VOW ascendance heal+reflect on parry catch becomes heal+reflect on perfect-dodge. Code path renames.
- iter-197 parry chime audio asset still plays — repurposed.

---

## 6. Specific deltas — what changes from current to proposed

### Files touched (predicted)
- `scripts/hero.gd` — combo state machine, dodge retune, perfect-dodge detection, removal of shield handlers
- `scripts/input_setup.gd` — remove "shield" action
- `scripts/main.gd` — repoint `hero_shielded` → `hero_perfect_dodged`; update BACKDRAFT trigger
- `scripts/audio.gd` — repurpose parry chime config (rename or keep + alias)
- `tests/` — likely remove iter-25/iter-197 parry tests; add perfect-dodge test
- Relic descriptions in `scripts/game_state.gd` mentioning "parry" — rewrite to mention "perfect dodge" (text-only)

### What is NOT changing
- Active relic dispatch (iter-213)
- Status combos other than BACKDRAFT
- Relic mechanics (only descriptions change)
- Enemy AI
- Room layouts
- HUD layout (Phases 1-4 work stays)
- Save schema
- All other audit tests

### Sub-commit plan (Stage D)

1. **iter-247 — Remove parry input layer.** Delete Q binding + `_shield_time` / `_shield_cd` / `_shield_ref` state. Repoint `hero_shielded` signal to `hero_perfect_dodged`. Stub the new signal so it can be subscribed. Repoint BACKDRAFT to listen on the new signal (firing path stays the same; just renamed). Test for input removal.

2. **iter-248 — Sword combo state machine.** Add `_combo_index` (0-2) + `_combo_window_timer`. Hit 1 → 2 → 3 chain with the proposed frame data. Heavy hit 3 with double damage + knockback boost. Visual telegraph (blade glow color shift per combo state). Test for combo advancement.

3. **iter-249 — Blast windup.** Add 0.10s `_blast_windup_time` before projectile spawn. Off-hand glow during windup. Restrict cancel rule (only DODGE cancels blast). Test for windup timing.

4. **iter-250 — Dodge retune + Perfect Dodge mechanic.** Cooldown 0.9→0.6, duration 0.28→0.24. Add `_dodge_active_time` tracking. Detect perfect-dodge in `take_damage`. Spawn slow-mo + violet flash + chime + buffer the +50% next-sword. Add mid-dodge attack penalty. Test for perfect-dodge detection + buffer consumption.

5. **iter-251 — Migrate dependent systems + cleanup.** BACKDRAFT combo update, VOW ascendance trigger update, relic description text updates. Run full audit suite. Final test for migration integrity.

Total: 5 sub-commits, each independently testable. Estimated 1-2 days of focused work.

---

## 7. Acceptance criteria — how we know it worked

After Stage D ships:

**For sword feel**:
- A new player should feel they're MASHING vs. CHAINING and notice the difference within 30 seconds
- Hit 3 should feel HEAVY — slow startup, visible recovery, satisfying knockback
- Mashing LMB without timing should average ~2.3 dps; perfect 3-hit combo should average ~3.5 dps

**For dodge feel**:
- Perfect-dodge should fire ~10-20% of the time for a new player; ~50-70% for a player who learns it
- The slow-mo moment should be physically satisfying — "I nailed that"
- Missing the timing should not feel bad — you still got out

**For overall**:
- Q button does nothing (clean removal)
- No parry-shield FX appear anywhere
- Combat feels weightier without feeling sluggish
- 10-second gameplay clip target (from director audit) actually reads as described

---

## 8. Open design questions for user

1. **Sword combo TIMING WINDOW**: 0.50s feels right per references but could be 0.40 (faster, harder to chain) or 0.65 (slower, easier). Which?
2. **Heavy hit 3 damage scaling**: ×2 base. Should it scale with sword_damage_bonus? (Yes likely, but confirm.)
3. **Perfect-dodge slow-mo SCOPE**: full Engine.time_scale 0.4 (slows hero too) vs. only-slow-enemies (custom). Full is simpler; only-enemies is more "player power fantasy." Recommend FULL for v1, retune later.
4. **Mid-dodge attack penalty**: brutal Hades version (i-frames die instantly) vs. soft version (i-frames reduce by 50%). Recommend brutal — clear rule.
5. **Should heavy hit 3 require the combo, or be a separate input?** I'm proposing CHAIN ONLY (no separate button) — Hades shows that the combo IS the depth. Alternative would be "hold LMB" for heavy. Confirm chain-only?

---

## 9. Stage gate

Read this, mark up anything you want changed, and reply **"approved, execute Stage D"** when you're ready. I won't write a line of combat code until then.

If you want to push back on any specific frame number, that's the kind of conversation we should have NOW, not after refactoring.
