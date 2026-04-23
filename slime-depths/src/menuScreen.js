// ============================================================================
// MAIN MENU — static HTML only
//
// Extracted from main.js (tech-debt pass). Same pattern as deathScreen.js /
// winScreen.js / creditsScreen.js / controlsScreen.js: this module owns the
// markup, main.js owns DOM creation, event wiring (begin descent, mode chips,
// journal slot, hamlet/chronicles/controls/credits links), and the ember
// particle animation.
//
// IDs preserved verbatim so main.js's getElementById() calls keep working
// unchanged: menuSigil, menuEmbers, menuSettingsBtn, menuVolumeBtn,
// menuVolumeLabel, menuCursesBtn, menuMemoryBtn, menuResumeBtn,
// menuResumeLine, menuCtaHalo, menuNewRunBtn, menuModeRow, menuModeChip (x3),
// menuAscensionRow, menuAscensionBtn, menuAscensionHint, menuModeHint,
// menuHamletLink, menuChroniclesLink, menuControlsLink, menuCreditsLink,
// menuActiveModifiers, menuRecords, menuMetaBtn, menuSanctuaryValue,
// menuAchBtn, menuChroniclesValue, menuRecordsCorner, menuDailyInfo,
// menuCurseIndicator, menuEssence.
// ============================================================================

export const MENU_SCREEN_HTML = `
  <!-- BACKDROP DARKENING — quiets the busy stone texture behind the UI
       without flattening the painting. A horizontal gradient keeps the
       center column slightly darker so gold/cream text reads over it,
       while the sides (torches, ivy, vignette edges) stay vivid. -->
  <div style="position:absolute;inset:0;background:linear-gradient(90deg, transparent 0%, rgba(4,2,8,0.28) 28%, rgba(4,2,8,0.42) 50%, rgba(4,2,8,0.28) 72%, transparent 100%);pointer-events:none;"></div>
  <!-- Soft center vignette — pulls a breath of darkness in right under the
       title + CTA so they have air above the stonework. -->
  <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(820px,80vw);height:min(620px,70vh);background:radial-gradient(ellipse at center, rgba(4,2,8,0.55) 0%, rgba(4,2,8,0.25) 45%, transparent 75%);pointer-events:none;"></div>

  <!-- AMBIENT SIGIL — kept as a faint overlay (0.025) so it reads as a
       mystical diagram etched into the air above the archway. Dimmer
       now that the painted backdrop carries most of the atmosphere. -->
  <svg id="menuSigil" viewBox="0 0 200 200" style="position:absolute;width:440px;height:440px;left:50%;top:42%;transform:translate(-50%,-50%);opacity:0.025;pointer-events:none;filter:drop-shadow(0 0 50px rgba(201,168,106,0.25));">
    <defs>
      <radialGradient id="sigilGrad" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0%" stop-color="#f4d9a0" stop-opacity="0.8"/>
        <stop offset="80%" stop-color="#c9a86a" stop-opacity="0.2"/>
        <stop offset="100%" stop-color="#c9a86a" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <circle cx="100" cy="100" r="92" fill="none" stroke="#c9a86a" stroke-width="0.5" opacity="0.7"/>
    <circle cx="100" cy="100" r="80" fill="none" stroke="#c9a86a" stroke-width="0.3" opacity="0.5"/>
    <circle cx="100" cy="100" r="78" fill="url(#sigilGrad)"/>
    <g stroke="#c9a86a" stroke-width="0.6" fill="none" opacity="0.8">
      <line x1="100" y1="8" x2="100" y2="192"/>
      <line x1="8" y1="100" x2="192" y2="100"/>
      <line x1="35" y1="35" x2="165" y2="165"/>
      <line x1="165" y1="35" x2="35" y2="165"/>
    </g>
    <g fill="#c9a86a" opacity="0.9">
      <polygon points="100,6 104,14 100,22 96,14"/>
      <polygon points="100,178 104,186 100,194 96,186"/>
      <polygon points="6,100 14,96 22,100 14,104"/>
      <polygon points="178,100 186,96 194,100 186,104"/>
    </g>
  </svg>

  <!-- Screen-edge vignette — thin darkening on the outer rim so the painted
       backdrop never quite touches the screen edges. Lighter than before
       since the backdrop already has its own atmospheric vignette. -->
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.45) 95%, rgba(0,0,0,0.7) 100%);pointer-events:none;"></div>

  <!-- EMBER PARTICLES — warm gold specks drifting up from the stair, as if
       rising from the unseen torches and the glow below. Adds motion so
       the scene feels alive rather than a static painting. -->
  <canvas id="menuEmbers" width="1280" height="720" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;mix-blend-mode:screen;opacity:0.9;"></canvas>

  <!-- PAGE-FRAME CORNER FLOURISHES — four gold L-shapes mark this screen as a
       manuscript page. Now 88px (was 58) and with brighter hairlines +
       larger corner diamonds so they read clearly against the painted
       backdrop instead of vanishing into the dark edges. -->
  <div class="menuCorner" style="position:absolute;top:28px;left:28px;width:88px;height:88px;pointer-events:none;">
    <div style="position:absolute;top:0;left:0;width:88px;height:1px;background:linear-gradient(90deg,#f4d9a0,transparent);box-shadow:0 0 6px rgba(244,217,160,0.4);"></div>
    <div style="position:absolute;top:0;left:0;width:1px;height:88px;background:linear-gradient(180deg,#f4d9a0,transparent);box-shadow:0 0 6px rgba(244,217,160,0.4);"></div>
    <div style="position:absolute;top:-3px;left:-3px;width:7px;height:7px;background:#f4d9a0;transform:rotate(45deg);box-shadow:0 0 8px rgba(244,217,160,0.6);"></div>
  </div>
  <div class="menuCorner" style="position:absolute;top:28px;right:28px;width:88px;height:88px;pointer-events:none;">
    <div style="position:absolute;top:0;right:0;width:88px;height:1px;background:linear-gradient(270deg,#f4d9a0,transparent);box-shadow:0 0 6px rgba(244,217,160,0.4);"></div>
    <div style="position:absolute;top:0;right:0;width:1px;height:88px;background:linear-gradient(180deg,#f4d9a0,transparent);box-shadow:0 0 6px rgba(244,217,160,0.4);"></div>
    <div style="position:absolute;top:-3px;right:-3px;width:7px;height:7px;background:#f4d9a0;transform:rotate(45deg);box-shadow:0 0 8px rgba(244,217,160,0.6);"></div>
  </div>
  <div class="menuCorner" style="position:absolute;bottom:28px;left:28px;width:88px;height:88px;pointer-events:none;">
    <div style="position:absolute;bottom:0;left:0;width:88px;height:1px;background:linear-gradient(90deg,#f4d9a0,transparent);box-shadow:0 0 6px rgba(244,217,160,0.4);"></div>
    <div style="position:absolute;bottom:0;left:0;width:1px;height:88px;background:linear-gradient(0deg,#f4d9a0,transparent);box-shadow:0 0 6px rgba(244,217,160,0.4);"></div>
    <div style="position:absolute;bottom:-3px;left:-3px;width:7px;height:7px;background:#f4d9a0;transform:rotate(45deg);box-shadow:0 0 8px rgba(244,217,160,0.6);"></div>
  </div>
  <div class="menuCorner" style="position:absolute;bottom:28px;right:28px;width:88px;height:88px;pointer-events:none;">
    <div style="position:absolute;bottom:0;right:0;width:88px;height:1px;background:linear-gradient(270deg,#f4d9a0,transparent);box-shadow:0 0 6px rgba(244,217,160,0.4);"></div>
    <div style="position:absolute;bottom:0;right:0;width:1px;height:88px;background:linear-gradient(0deg,#f4d9a0,transparent);box-shadow:0 0 6px rgba(244,217,160,0.4);"></div>
    <div style="position:absolute;bottom:-3px;right:-3px;width:7px;height:7px;background:#f4d9a0;transform:rotate(45deg);box-shadow:0 0 8px rgba(244,217,160,0.6);"></div>
  </div>

  <!-- CORNER CHROME — now borderless silhouettes, not boxed UI widgets. -->
  <button id="menuSettingsBtn" title="Settings" style="position:absolute;top:34px;right:96px;background:transparent;color:#7a6a5a;border:0;width:32px;height:32px;font-size:18px;cursor:pointer;font-family:Georgia,serif;transition:all 0.22s ease;display:flex;align-items:center;justify-content:center;opacity:0.7;">\u2699</button>
  <!-- JOURNAL indicator — shows which save slot (journal) is active.
       Clicking opens the Journals modal where the player can switch or
       delete slots. "Journal" reads unambiguously as a save file — the
       previous "Volume" term confused for audio volume. -->
  <!-- Save-slot indicator — minimal signage in the top-left corner. Very
       faint at rest; brightens slightly on hover so the player remembers
       it's interactive without letting it shout. -->
  <button id="menuVolumeBtn" title="Journals — your save slots" style="position:absolute;top:34px;left:44px;background:transparent;color:#8a7a5a;border:0;padding:4px 8px;font-size:9px;cursor:pointer;letter-spacing:3.5px;font-family:Georgia,serif;font-weight:bold;transition:opacity 0.25s ease;display:flex;align-items:center;gap:7px;opacity:0.42;">
    <span style="font-size:10px;color:#c9a86a;">\u2042</span>
    <span>JOURNAL <span id="menuVolumeLabel">I</span></span>
  </button>
  <!-- Curses have moved to the Gravekeeper NPC inside the hamlet — that's
       their narrative home now. Memory lives inside the Archivist. The main
       menu no longer carries any modifier chips; those accesses happen
       through NPC dialogue for better world integration. The two legacy
       buttons below are kept as hidden hooks so existing click handlers
       (for curse-active state reads, etc.) don't break. -->
  <button id="menuCursesBtn" style="display:none;"><span id="menuCursesBtnLabel"></span></button>
  <button id="menuMemoryBtn" style="display:none;"><span id="menuMemoryBtnLabel"></span></button>

  <!-- CONTENT COLUMN — sits above ambient layers, anchored by corner frame.
       Radically simplified: TITLE → CTA → MODES → two secondary text links.
       Meta cards, records, memory/chronicles chips all relocated to the
       Hamlet hub or the Chronicles book, accessed via text links below.
       Class "menuContent" lets responsive CSS scale the whole column down
       on narrow viewports without per-element pixel tweaks. -->
  <div class="menuContent" style="position:relative;display:flex;flex-direction:column;align-items:center;z-index:1;">
    <h1 class="ethera-title" style="font-size:96px;margin:0;letter-spacing:14px;color:#f4d9a0;font-weight:400;line-height:1;">ETHERA</h1>
    <!-- Subtitle with integrated ornaments — small gold diamonds flanking the
         text, so it reads as one unit with the title. -->
    <div style="display:flex;align-items:center;gap:14px;margin:10px 0 44px;opacity:0.55;">
      <span style="width:4px;height:4px;background:#c9a86a;transform:rotate(45deg);"></span>
      <span style="color:#d8cfae;font-size:12px;letter-spacing:7px;font-style:italic;">beneath the ruin</span>
      <span style="width:4px;height:4px;background:#c9a86a;transform:rotate(45deg);"></span>
    </div>

    <!-- RESUME CARD — revealed by showMainMenu if a saved run snapshot exists.
         Sits above the primary CTA so it's the first thing the returning
         player sees. Hidden by default. -->
    <button id="menuResumeBtn" style="display:none;background:linear-gradient(180deg,rgba(30,42,32,0.92),rgba(14,22,16,0.95));border:0;padding:13px 24px;cursor:pointer;font-family:Georgia,serif;margin-bottom:18px;min-width:360px;text-align:left;box-shadow:inset 0 0 0 1px #86b79a, 0 0 20px rgba(134,183,154,0.28), inset 0 0 12px rgba(0,0,0,0.4);transition:all 0.22s ease;">
      <div style="display:flex;align-items:center;gap:14px;">
        <span style="width:6px;height:6px;background:#86e3a8;transform:rotate(45deg);flex-shrink:0;"></span>
        <div style="flex:1;">
          <div style="color:#86e3a8;font-size:10px;letter-spacing:5px;font-weight:bold;margin-bottom:3px;">\u2666 DESCENT IN PROGRESS</div>
          <div id="menuResumeLine" style="color:#f4d9a0;font-size:14px;font-weight:bold;letter-spacing:2px;">Floor I \u00b7 8/8 HP \u00b7 0 relics</div>
        </div>
        <span style="color:#86e3a8;font-size:14px;letter-spacing:4px;font-weight:bold;">RESUME \u2192</span>
      </div>
    </button>

    <!-- PRIMARY ACTION — the single anchor. Soft pulse halo behind it. -->
    <div style="position:relative;">
      <div id="menuCtaHalo" style="position:absolute;inset:-14px;background:radial-gradient(ellipse at center, rgba(201,168,106,0.18), transparent 70%);pointer-events:none;"></div>
      <button id="menuNewRunBtn" style="position:relative;background:linear-gradient(180deg,#3a2a20,#1a0f08);color:#f4d9a0;border:0;padding:19px 96px;font-size:18px;cursor:pointer;letter-spacing:7px;font-weight:bold;font-family:Georgia,serif;box-shadow:inset 0 0 0 1px #c9a86a, 0 0 28px rgba(201,168,106,0.25), inset 0 0 14px rgba(244,217,160,0.08);transition:all 0.22s ease;">BEGIN DESCENT</button>
    </div>

    <!-- MODE CHIPS — borderless. Smaller + tighter to the CTA now so they
         clearly read as options FOR the button above, not as a second
         navigation row. Selected chip is filled + glows; unselected is
         dim text. Differentiation by weight, not by outline. -->
    <div id="menuModeRow" style="display:flex;gap:3px;margin-top:12px;margin-bottom:0;align-items:center;">
      <button class="menuModeChip" data-mode="standard" style="background:transparent;border:0;padding:5px 12px;cursor:pointer;color:#6a5c48;font-family:Georgia,serif;font-size:9.5px;letter-spacing:3.5px;font-weight:bold;transition:all 0.22s ease;text-transform:uppercase;">STANDARD</button>
      <span style="opacity:0.3;color:#c9a86a;font-size:9px;">\u2666</span>
      <button class="menuModeChip" data-mode="daily" style="background:transparent;border:0;padding:5px 12px;cursor:pointer;color:#6a5c48;font-family:Georgia,serif;font-size:9.5px;letter-spacing:3.5px;font-weight:bold;transition:all 0.22s ease;text-transform:uppercase;">DAILY</button>
      <span style="opacity:0.3;color:#c9a86a;font-size:9px;">\u2666</span>
      <!-- META CONSOLIDATION PASS (review #3): TAROT mode chip hidden.
           Tarot's 8 cards overlapped Memory's identity-modifier role; the
           main menu had one too many entry points for new players. The
           chip is hidden (not deleted) so the tarot module stays dormant
           and can be re-enabled by removing this display:none. The two
           most mechanically-distinct tarot cards (Hermit, Hanged Man)
           have been migrated to the Memory pool as history-gated unlocks. -->
      <button class="menuModeChip" data-mode="tarot" style="display:none;background:transparent;border:0;padding:7px 16px;cursor:pointer;color:#6a5c48;font-family:Georgia,serif;font-size:11px;letter-spacing:4px;font-weight:bold;transition:all 0.22s ease;text-transform:uppercase;">TAROT</button>
    </div>

    <!-- ASCENSION selector — systems-roguelite long-tail grind. Hidden on
         tier 0 until the player has unlocked anything (don't clutter a new
         player's menu with something they can't use). Click to cycle
         through unlocked tiers. Each tier stacks on the previous. -->
    <div id="menuAscensionRow" style="display:none;align-items:center;gap:10px;margin-top:10px;margin-bottom:2px;font-family:Georgia,serif;">
      <span style="color:#8a7a5a;font-size:9px;letter-spacing:4px;font-style:italic;">\u25C7</span>
      <button id="menuAscensionBtn" title="Click to cycle ascension tier" style="background:transparent;border:0;cursor:pointer;color:#c9a86a;font-family:Georgia,serif;font-size:11px;letter-spacing:4px;font-weight:bold;transition:all 0.22s ease;text-transform:uppercase;padding:4px 10px;">ASCENSION 0</button>
      <span style="color:#8a7a5a;font-size:9px;letter-spacing:4px;font-style:italic;">\u25C7</span>
    </div>
    <div id="menuAscensionHint" style="font-size:10px;opacity:0.65;letter-spacing:2px;font-family:Georgia,serif;font-style:italic;color:#c9a86a;margin-bottom:0;text-align:center;max-width:440px;min-height:14px;"></div>

    <!-- Hint line — gold at lower opacity, no purple. -->
    <div id="menuModeHint" style="font-size:11px;opacity:0;letter-spacing:2px;font-family:Georgia,serif;font-style:italic;margin-top:10px;margin-bottom:0;color:#c9a86a;min-height:18px;text-align:center;max-width:480px;transition:opacity 0.28s ease;"></div>

    <!-- SECONDARY ACTIONS — two destinations that pull their weight. Hamlet
         holds meta-progression (essence, NPCs, services); Chronicles is the
         codex (achievements, bestiary, relicpedia, fusions). Everything else
         (how-to-play, credits) demoted to footer-level so this row stays
         focused on "where else can I actually go?" -->
    <div style="display:flex;align-items:center;gap:24px;margin-top:34px;font-family:Georgia,serif;">
      <div style="width:54px;height:1px;background:linear-gradient(90deg,transparent,rgba(201,168,106,0.6));"></div>
      <button id="menuHamletLink" style="background:transparent;border:0;padding:6px 4px;cursor:pointer;color:#c9a86a;font-family:Georgia,serif;font-size:12px;letter-spacing:3px;font-style:italic;transition:all 0.22s ease;opacity:0.8;display:flex;align-items:center;gap:8px;">
        <span>visit the hamlet</span>
        <span style="font-size:10px;opacity:0.7;">\u2192</span>
      </button>
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);opacity:0.5;"></span>
      <button id="menuChroniclesLink" style="background:transparent;border:0;padding:6px 4px;cursor:pointer;color:#c9a86a;font-family:Georgia,serif;font-size:12px;letter-spacing:3px;font-style:italic;transition:all 0.22s ease;opacity:0.8;display:flex;align-items:center;gap:8px;">
        <span>read the chronicles</span>
        <span style="font-size:10px;opacity:0.7;">\u2192</span>
      </button>
      <div style="width:54px;height:1px;background:linear-gradient(270deg,transparent,rgba(201,168,106,0.6));"></div>
    </div>

    <!-- ACTIVE MODIFIERS indicator — only shown when a memory is selected
         or curses are active, so the player knows their next descent isn't
         "vanilla." Stays invisible when nothing is set. -->
    <div id="menuActiveModifiers" style="margin-top:22px;font-family:Georgia,serif;font-style:italic;font-size:11px;letter-spacing:3px;color:#c9a86a;opacity:0;transition:opacity 0.3s ease;min-height:16px;text-align:center;"></div>

    <!-- LEGACY hidden elements — kept for code-path compatibility. Their
         values are still updated in showMainMenu but no visible UI renders. -->
    <div id="menuRecords" style="display:none;"></div>
    <button id="menuMetaBtn" style="display:none;"><span id="menuSanctuaryValue">0</span></button>
    <button id="menuAchBtn" style="display:none;"><span id="menuChroniclesValue">0/0</span></button>
  </div>

  <!-- Records moved: now shown inside the VOLUMES modal per-slot, so each
       save's story lives with the save. No main-menu records block. -->
  <div id="menuRecordsCorner" style="display:none;"></div>

  <!-- Hidden legacy elements (kept for compat) -->
  <div id="menuDailyInfo" style="display:none;"></div>
  <div id="menuCurseIndicator" style="display:none;"></div>
  <div id="menuEssence" style="display:none;"></div>

  <!-- Footer row — onboarding + legal. Tiny and quiet; these aren't
       gameplay destinations so they don't earn a spot in the main links
       row. The controls cheatsheet that used to live here was redundant
       with both the how-to-play page and the first-boot prologue. -->
  <div style="position:absolute;bottom:32px;left:0;right:0;display:flex;align-items:center;justify-content:center;gap:18px;font-family:Georgia,serif;font-style:italic;color:#8a7a5a;pointer-events:auto;">
    <button id="menuControlsLink" style="background:transparent;border:0;padding:4px 6px;cursor:pointer;color:inherit;font-family:inherit;font-size:10px;letter-spacing:2.5px;font-style:italic;transition:opacity 0.22s ease;opacity:0.5;">how to play</button>
    <span style="width:3px;height:3px;background:#8a7a5a;transform:rotate(45deg);opacity:0.4;"></span>
    <button id="menuCreditsLink" style="background:transparent;border:0;padding:4px 6px;cursor:pointer;color:inherit;font-family:inherit;font-size:10px;letter-spacing:2.5px;font-style:italic;transition:opacity 0.22s ease;opacity:0.5;">credits</button>
  </div>
`;
