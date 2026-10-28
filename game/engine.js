// Port of the original C++ game's engine: 60 fps fixed timestep (17/17/16 ms pattern)
// and SDL-style input bitmap; animation and drawing follow the display's refresh rate. Rendering is a modern redesign (night-gallery
// look inspired by Tetris Forever) drawn with WebGL (renderer.js, backdrop.js) in
// resolution-independent logical units; piece colours are sampled from the original
// tile graphics.

const STATE_MENU = 0, STATE_GAME = 1;

const VERSION = "0.7"; // shown in the top left corner

// Game keys are bound in options.js; menus always use these (KeyboardEvent.code)
const MENU_KEYS = ["Escape", "Enter", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
// Menu keys the OS key repeat applies to while held (fast scrolling); games ignore it
const MENU_REPEAT_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
// Hidden TGM1, TGM3 and TAP test setups on Ctrl+Shift+digit, not shown anywhere in the game
const TEST_KEYS = { Digit1: "roll", Digit2: "invisible", Digit3: "gm", Digit4: "rollend", Digit5: "kill", Digit6: "fireworks", Digit7: "secret" };

// Input bitmap bits per bound action
const PUSH_BITS = { left: LEFT_PUSH, right: RIGHT_PUSH, hard: HARD_PUSH, soft: SOFT_PUSH, rotl: ROTL_PUSH, rotr: ROTR_PUSH, rot180: ROT180_PUSH, hold: HOLD_PUSH };
const RELEASE_BITS = { left: LEFT_RELEASE, right: RIGHT_RELEASE, soft: SOFT_RELEASE, rotl: ROTL_RELEASE, rotr: ROTR_RELEASE, rot180: ROT180_RELEASE, hold: HOLD_RELEASE };

// Menu screens
const MENU_MAIN = 0, MENU_RULES = 1, MENU_MODES = 2, MENU_OPTIONS = 3, MENU_CONTROLS = 4, MENU_VISUALS = 5, MENU_HANDLING = 6, MENU_SETUP = 7, MENU_GAMEPAD = 8, MENU_QUICK = 9,
    MENU_SINGLE = 10, MENU_MULTI = 11, MENU_JOIN = 12;
const MENU_DEPTH = [0, 2, 3, 1, 2, 2, 2, 4, 2, 2, 1, 1, 2];   // by screen; deeper = slide in from the right
const MENU_SLIDE_MS = 220, MENU_SLIDE_DIST = 120;

const CONTINUE_ITEM = { name: "Continue", desc: "Back to the game in progress", accent: tetI, resume: true };
const RESTART_ITEM = { name: "Restart", desc: "Start the current game over", accent: tetL, restart: true };
const MAIN_ITEMS = [
    { name: "Single Player", desc: "Quick play or a custom game on your own", accent: tetT, screen: MENU_SINGLE },
    { name: "Multiplayer", desc: "Versus the bot, or two players side by side", accent: tetI, screen: MENU_MULTI },
    { name: "Options", desc: "Keybinds, gamepad, visuals and Guideline handling", accent: tetS, screen: MENU_OPTIONS },
];
const SINGLE_ITEMS = [
    { name: "Quick Play", desc: "Common modes, straight into the game", accent: tetO, screen: MENU_QUICK },
    { name: "Custom Game", desc: "Choose a rule set and mode", accent: tetT, screen: MENU_RULES },
];

// Start step 3 (MENU_SETUP), for modes with `setup`: setting cards changed with ← →, each choosing
// one of its labels for a createGame argument: arg "mode" or "variant" (the label's entry in values),
// "startLevel" and "height" (the label's index), or one of the hidden modes' options (OPTION_ARGS); initial: the label chosen at first (else
// the first). Remembered per mode for the session (setupChoices)
const indexLabels = count => Array.from({ length: count }, (_, i) => String(i));
const levelSetup = count => ({ name: "Level", accent: tetT, arg: "startLevel", labels: indexLabels(count) });
const HEIGHT_SETUP = { name: "Height", accent: tetZ, arg: "height", labels: indexLabels(GB_B_HEIGHTS) };
const GOAL_SETUP = { name: "Goal", accent: tetO, arg: "variant", labels: ["150 lines", "Variable", "Endless"],
    values: ["marathon", "variable", "standard"] };
const DIG_SETUP = { name: "Rows", accent: tetS, arg: "height", labels: GUIDELINE_DIG_ROWS.map(String) };
const MASTER_SETUP = { name: "Level", accent: tetT, arg: "startLevel", labels: GUIDELINE_MASTER_DELAYS.map((_, i) => `M${i + 1}`) };
const MARATHON_LEVEL_SETUP = { name: "Level", accent: tetT, arg: "startLevel", labels: indexLabels(GUIDELINE_MAX_LEVEL).map(i => String(+i + 1)) };
const SPRINT_SETUP = { name: "Lines", accent: tetL, arg: "variant", labels: ["20", "40", "100"],
    values: ["sprint20", "sprint", "sprint100"], initial: 1 };
const ULTRA_SETUP = { name: "Time", accent: tetZ, arg: "variant", labels: ["1:00", "2:00", "3:00", "5:00"],
    values: ["ultra1", "ultra", "ultra3", "ultra5"], initial: 1 };
const ACE_RULE_SETUP = { name: "Rule", accent: tetL, arg: "mode", labels: ["SRS", "ARS", "ARS2"], values: [tgmAce, aceArs, aceArs2] };
const RULE_SETUP = { name: "Rule", accent: tetL, arg: "mode", labels: ["World", "Classic"], values: [arika, tgmClassic] };
// createGame options (RuleGame.setOptions): the TGM games' hidden modes, TGM3 Master's exams, GB's heart mode,
// versus's speed (the mode a TGM1, TAP or ACE side plays), style (TGM3's), items and the other side's GB height (and the
// versus match's bot level, the label's index)
const OPTION_ARGS = ["big", "rev", "mono", "tls", "exams", "heart", "speed", "style", "items", "goal", "height2", "bot"];
const BIG_SETUP = { name: "Big", accent: tetO, arg: "big", labels: ["Off", "On"], values: [false, true] }; // pieces twice the size
const REV_SETUP = { name: "Reverse", accent: tetZ, arg: "rev", labels: ["Off", "On"], values: [false, true] }; // the well upside down
const MONO_SETUP = { name: "Mono", accent: tetS, arg: "mono", labels: ["Off", "On"], values: [false, true] }; // one colour
const TLS_SETUP = { name: "Ghost", accent: tetI, arg: "tls", labels: ["To level 100", "All game"], values: [false, true] };
const TGM1_SETUP = [BIG_SETUP, REV_SETUP, MONO_SETUP, TLS_SETUP]; // TGM1's codes, which combine
// TGM3 Master: the qualified grade and its exams (Exams, tgm3ExamFor); none with Big
const EXAMS_SETUP = { name: "Exams", accent: tetJ, arg: "exams", labels: ["On", "Off"], values: [true, false] };
const HEART_SETUP = { name: "Heart", accent: tetZ, arg: "heart", labels: ["Off", "On"], values: [false, true] }; // GB: gravity 10 levels on
// TGM3 versus: its VS Rule, or its Clear Rule, "a simple race between the two players" (tetris.wiki)
const CLEAR_RULE_SETUP = { name: "Match", accent: tetS, arg: "clearRule", labels: ["VS Rule", "Clear Rule"], values: [false, true], modes: [arika, tgmClassic] };
OPTION_ARGS.push("clearRule");
// Versus: the bot's level (bot.js, 0-10), 3 at first
const BOT_VERSUS_LEVEL = 3;
const BOT_SETUP = { name: "Bot", accent: tetI, arg: "bot", labels: BOT_LEVELS.map((l, i) => "Level " + i), initial: BOT_VERSUS_LEVEL };
// Versus: the rounds a side must win to take the match (TAP: "the rounds per match ... can be changed in the game setup",
// tetris.wiki), at first the rule set's own (the Guideline 1, the TGM games 2, NES 3, GB 4)
const VERSUS_ROUND_COUNTS = [1, 2, 3, 4, 5, 6, 7];
const roundsSetup = (wins, modes) => ({ name: "Rounds", accent: tetS, arg: "rounds", labels: VERSUS_ROUND_COUNTS.map(k => "First to " + k),
    values: VERSUS_ROUND_COUNTS, initial: wins - 1, modes });
const VERSUS_ROUNDS_SETUP = [roundsSetup(1, [guideline]), roundsSetup(TGM_VS_WINS, [tgmOriginal, tgmTap, arika, tgmClassic, tgmAce, aceArs, aceArs2]),
    roundsSetup(NES_VS_WINS, [nesTetris]), roundsSetup(GB_VS_WINS, [gbTetris])];
OPTION_ARGS.push("rounds");
// Versus: the rule set each side plays ("versus" in each: rules-guideline.js, rules-tgm.js, rules-ace.js,
// rules-1989.js), then its own settings, both sides the same: TGM1's, TAP's and ACE's speed (the mode
// they play), TGM3's and ACE's rule (which set the mode again), TGM3's style, items (TGM1, TAP, TGM3,
// ACE), NES's start level, GB's garbage height and heart mode. A card with `modes` is shown and used only when the cards before
// it that set the mode chose one of them. TAP's speeds are its modes' (tetris.wiki: all four can be played in
// versus; harddrop.com: with "their respective speed curves"), GB's heights each side's own
const VERSUS_RULES_SETUP = { name: "Rules", accent: tetT, arg: "mode", labels: ["Guideline", "TGM1", "TAP", "TGM3", "ACE", "NES", "GB"],
    values: [guideline, tgmOriginal, tgmTap, arika, tgmAce, nesTetris, gbTetris] };
const VERSUS_ACE_MODES = [tgmAce, aceArs, aceArs2];
// TGM1, TAP and TGM3: a head start for one side (sides: the two sides' names), levels it starts on. This game's own: TAP's
// versus has no handicap that tetris.wiki or harddrop.com know of; Heboris gives each side its own speed, this the level and
// with it the speed. options.handicap: { side (0: player 1), levels }
const handicapSetup = sides => ({ name: "Handicap", accent: tetT, arg: "handicap", modes: [tgmOriginal, tgmTap, arika, tgmClassic],
    labels: ["Off", ...sides.flatMap(side => [`${side} start at 50`, `${side} start at 100`])],
    values: [null, { side: 0, levels: 50 }, { side: 0, levels: 100 }, { side: 1, levels: 50 }, { side: 1, levels: 100 }] });
OPTION_ARGS.push("handicap");
// TAP and TGM3: the level that wins a round, and its time limit (tetris.wiki: 100-level steps, 1:20 per step; 200 and
// 2:40 by default)
const VERSUS_GOAL_SETUP = { name: "Goal", accent: tetL, arg: "goal", modes: [tgmTap, arika, tgmClassic], initial: 1,
    labels: [1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => `Level ${k * 100}  ·  ${Math.floor(k * 80 / 60)}:${String(k * 80 % 60).padStart(2, "0")}`),
    values: [100, 200, 300, 400, 500, 600, 700, 800, 900] };
// The TGM games: garbage on, or off (TAP's Cement Mode, tetris.wiki: both players hold A+B as versus begins)
const VERSUS_GARBAGE_SETUP = { name: "Garbage", accent: tetZ, arg: "garbage", labels: ["On", "Off (Cement)"], values: [true, false],
    modes: [tgmOriginal, tgmTap, arika, tgmClassic, ...VERSUS_ACE_MODES] };
OPTION_ARGS.push("garbage");
// The TGM games: items off or on. On at first in TAP, whose players turn them off by holding Start as versus
// begins (harddrop.com); Off at first in the others, whose sources don't say
const VERSUS_ITEMS_SETUP = { name: "Items", accent: tetS, arg: "items", labels: ["Off", "On"], values: [false, true] };
// The Guideline: the speed (rising with the match's time, one level, or 20G) and the garbage: the rows that may rise on one
// lock, how long an attack waits before it may, and how its holes line up (GUIDELINE_VS_SPEEDS; TETR.IO's room settings)
const GUIDELINE_VS_SETUP = [
    { name: "Speed", accent: tetZ, arg: "speed", values: GUIDELINE_VS_SPEEDS, modes: [guideline],
      labels: GUIDELINE_VS_SPEEDS.map(s => s === "rising" ? "Rising with time" : s === "20g" ? "20G" : `Level ${s}`) },
    { name: "Garbage cap", accent: tetJ, arg: "garbageCap", labels: ["Off", "4 rows a piece", "8 rows a piece", "12 rows a piece"],
      values: [0, 4, 8, 12], modes: [guideline] },
    { name: "Garbage delay", accent: tetL, arg: "garbageDelay", labels: ["Off", "0.33 s", "0.5 s", "1 s", "2 s"],
      values: [0, 20, 30, 60, 120], modes: [guideline] },
    { name: "Holes", accent: tetS, arg: "messiness", labels: ["One column per attack", "Sometimes moved", "Every row its own"],
      values: [0, 0.3, 1], modes: [guideline] },
];
OPTION_ARGS.push("garbageCap", "garbageDelay", "messiness");
// GB: each side its own height (heights: the two cards' names)
const versusSubSetup = (heights, sides) => [
    ...GUIDELINE_VS_SETUP,
    { name: "Speed", accent: tetZ, arg: "speed", labels: ["Master", "20G"], values: ["master", "20g"], modes: [tgmOriginal] },
    { name: "Speed", accent: tetZ, arg: "speed", labels: ["Normal", "Master", "Death", "TGM+"], values: ["normal", "master", "death", "plus"],
      initial: 1, modes: [tgmTap] },
    { ...RULE_SETUP, modes: [arika, tgmClassic] },
    CLEAR_RULE_SETUP,
    { name: "Style", accent: tetJ, arg: "style", labels: ["Attack", "Defence", "Item"], values: ["attack", "defence", "item"], modes: [arika, tgmClassic] },
    VERSUS_GOAL_SETUP,
    handicapSetup(sides),
    { ...ACE_RULE_SETUP, modes: VERSUS_ACE_MODES },
    { name: "Speed", accent: tetO, arg: "speed", labels: ["Normal", "Hi-Speed 1", "Hi-Speed 2", "Another", "Another 2"],
      values: ["normal", "hispeed1", "hispeed2", "another", "another2"], modes: VERSUS_ACE_MODES },
    { ...VERSUS_ITEMS_SETUP, modes: [tgmOriginal, arika, tgmClassic, ...VERSUS_ACE_MODES] },
    { ...VERSUS_ITEMS_SETUP, initial: 1, modes: [tgmTap] },
    VERSUS_GARBAGE_SETUP,
    { ...levelSetup(NES_START_LEVELS), initial: NES_VERSUS_LEVEL, modes: [nesTetris] },
    { ...HEIGHT_SETUP, name: heights[0], modes: [gbTetris] },
    { ...HEIGHT_SETUP, name: heights[1], arg: "height2", modes: [gbTetris] },
    { ...HEART_SETUP, modes: [gbTetris] },
    ...VERSUS_ROUNDS_SETUP,
];
// The versus rule set's name for a mode (the join screen's heading)
const VERSUS_RULE_NAMES = { [guideline]: "Guideline", [tgmOriginal]: "TGM1", [tgmTap]: "TAP", [arika]: "TGM3 World", [tgmClassic]: "TGM3 Classic",
    [tgmAce]: "ACE", [aceArs]: "ACE ARS", [aceArs2]: "ACE ARS2", [nesTetris]: "NES", [gbTetris]: "GB" };
// Multiplayer: versus against the bot, or two players on one screen, each on the input device they
// pick on the join screen (MENU_JOIN, after the setup cards: `join`); the setup cards as a Custom
// Game mode's
const MULTI_ITEMS = [
    { name: "Versus Bot", desc: "Against the bot, in the rules of any of the games", accent: tetI,
      modeItem: { name: "Versus Bot", mode: guideline, variant: "versus", setup: [VERSUS_RULES_SETUP, BOT_SETUP, ...versusSubSetup(["Your height", "Bot height"], ["You", "Bot"])] } },
    { name: "Versus Player", desc: "Two players side by side, on their own keys or gamepads", accent: tetT,
      modeItem: { name: "Versus Player", mode: guideline, variant: "versus", setup: [VERSUS_RULES_SETUP, ...versusSubSetup(["P1 height", "P2 height"], ["P1", "P2"])], join: true } },
];
// Input devices of a two-player game: "keys1" (player 1's keys, and the touch controls), "keys2"
// (player 2's keys) or "pad:N" (the gamepad at index N)
function deviceName(device) {
    if (device === "keys1") return "KEYBOARD  ·  KEYS 1";
    if (device === "keys2") return "KEYBOARD  ·  KEYS 2";
    return "GAMEPAD " + (Number(device.slice(4)) + 1);
}

// Start step 1: rule sets; step 2: their sub-modes; step 3 for modes with setup cards (above). See rules.js
// The "death" and "test" variants still exist in rules.js but aren't offered (TAP's Death mode is)
const RULESETS = [
    { name: "Guideline", accent: tetT, desc: "SRS, 7-bag, T-spins and back-to-backs",
      modes: [
          { name: "Marathon", mode: guideline, variant: "marathon", setup: [GOAL_SETUP, MARATHON_LEVEL_SETUP], accent: tetO, desc: "150 lines, a variable goal, or endless" },
          { name: "Sprint", mode: guideline, variant: "sprint", setup: [SPRINT_SETUP], accent: tetL, desc: "Clear 20, 40 or 100 lines as fast as you can" },
          { name: "Ultra", mode: guideline, variant: "ultra", setup: [ULTRA_SETUP], accent: tetZ, desc: "Score as much as you can in 1 to 5 minutes" },
          { name: "Dig", mode: guideline, variant: "dig", setup: [DIG_SETUP], accent: tetS, desc: "Clear rows of garbage as fast as you can" },
          { name: "Master", mode: guideline, variant: "master", setup: [MASTER_SETUP], accent: tetJ, desc: "20G from the start, less time to lock as you go" },
      ] },
    { name: "TGM1", accent: tetZ, desc: "ARS, no hard or sonic drop, no hold",
      modes: [
          { name: "Master", mode: tgmOriginal, variant: "standard", setup: TGM1_SETUP, accent: tetT, desc: "Up to level 999, grades 9 to S9, GM by checkpoints" },
          { name: "20G", mode: tgmOriginal, variant: "20g", setup: TGM1_SETUP, accent: tetZ, desc: "Master mode at 20G from the start" },
      ] },
    { name: "TGM2 TAP", accent: tetI, desc: "ARS, sonic drop, no hold",
      modes: [
          { name: "Normal", mode: tgmTap, variant: "normal", setup: [BIG_SETUP], accent: tetO, desc: "Up to level 300, two items on the way" },
          { name: "Master", mode: tgmTap, variant: "standard", setup: [BIG_SETUP], accent: tetT, desc: "Up to level 999, grades 9 to GM" },
          { name: "Death", mode: tgmTap, variant: "death", setup: [BIG_SETUP], accent: tetZ, desc: "20G from the start, M at 500, GM at 999" },
          { name: "TGM+", mode: tgmTap, variant: "plus", accent: tetS, desc: "Rising garbage from a fixed pattern, to level 999" },
      ] },
    { name: "TGM3 TI", accent: tetL, desc: "World rule (Arika SRS) or Classic (ARS), with hold",
      modes: [
          { name: "Master", mode: arika, variant: "standard", setup: [RULE_SETUP, EXAMS_SETUP, BIG_SETUP], accent: tetL, desc: "Up to level 999, COOLs and REGRETs, grades to GM" },
          { name: "Easy", mode: arika, variant: "easy", setup: [RULE_SETUP, BIG_SETUP], accent: tetO, desc: "Up to level 200, scored in fireworks" },
          { name: "Shirase", mode: arika, variant: "shirase", setup: [RULE_SETUP, BIG_SETUP], accent: tetZ, desc: "20G to level 1300, rising garbage, a big staff roll" },
          { name: "Sakura", mode: arika, variant: "sakura", setup: [RULE_SETUP], accent: tetS, desc: "Clear each stage's jewels, against the clock" },
      ] },
    { name: "ACE", accent: tetS, desc: "150 lines against the clock — SRS, ARS or ARS2, hold",
      modes: [
          { name: "Normal", mode: tgmAce, variant: "normal", setup: [ACE_RULE_SETUP], accent: tetI, desc: "Gentle start, 20G by level 13" },
          { name: "Hi-Speed 1", mode: tgmAce, variant: "hispeed1", setup: [ACE_RULE_SETUP], accent: tetL, desc: "Faster start, 20G by level 8" },
          { name: "Hi-Speed 2", mode: tgmAce, variant: "hispeed2", setup: [ACE_RULE_SETUP], accent: tetO, desc: "20G from the start" },
          { name: "Another", mode: tgmAce, variant: "another", setup: [ACE_RULE_SETUP], accent: tetZ, desc: "20G, shorter delays every level, a minute each" },
          { name: "Another 2", mode: tgmAce, variant: "another2", setup: [ACE_RULE_SETUP], accent: tetJ, desc: "20G at Another's fastest delays" },
          { name: "Big", mode: tgmAce, variant: "big", setup: [ACE_RULE_SETUP], accent: tetS, desc: "Normal's speeds with pieces twice the size" },
      ] },
    { name: "NES", accent: tetJ, desc: "NES (1989) — no hard drop, no hold, no kicks",
      modes: [
          { name: "A-Type", mode: nesTetris, variant: "standard", setup: [levelSetup(NES_START_LEVELS)], accent: tetL, desc: "Endless, faster every 10 lines, top speed at level 29" },
          { name: "B-Type", mode: nesTetris, variant: "btype", setup: [levelSetup(NES_START_LEVELS), HEIGHT_SETUP], accent: tetS, desc: "Clear 25 lines, starting over garbage" },
      ] },
    { name: "GB", accent: tetO, desc: "GB (1989) — no hard drop, no hold, no kicks",
      modes: [
          { name: "A-Type", mode: gbTetris, variant: "standard", setup: [levelSetup(GB_START_LEVELS), HEART_SETUP], accent: tetL, desc: "Endless, faster every 10 lines up to level 20" },
          { name: "B-Type", mode: gbTetris, variant: "btype", setup: [levelSetup(GB_START_LEVELS), HEIGHT_SETUP, HEART_SETUP], accent: tetS, desc: "Clear 25 lines, starting over garbage" },
      ] },
];
// Quick Play: common modes started at once, each with its setup cards' first (or initial) choices,
// so their records are Custom Game's for those choices. ruleset and mode: names in RULESETS
const QUICK_PLAY = [
    { name: "Marathon", ruleset: "Guideline", mode: "Marathon", accent: tetO, desc: "Guideline · 150 lines from level 1" },
    { name: "Sprint", ruleset: "Guideline", mode: "Sprint", accent: tetL, desc: "Guideline · 40 lines as fast as you can" },
    { name: "Ultra", ruleset: "Guideline", mode: "Ultra", accent: tetZ, desc: "Guideline · score as much as you can in 2 minutes" },
    { name: "TGM1 Master", ruleset: "TGM1", mode: "Master", accent: tetI, desc: "Up to level 999, grades 9 to S9, GM by checkpoints" },
    { name: "TAP Master", ruleset: "TGM2 TAP", mode: "Master", accent: tetT, desc: "Up to level 999, sonic drop, grades 9 to GM" },
    { name: "TGM3 Master", ruleset: "TGM3 TI", mode: "Master", accent: tetS, desc: "World rule with hold, COOLs, REGRETs and exams" },
    { name: "NES A-Type", ruleset: "NES", mode: "A-Type", accent: tetJ, desc: "From level 0, faster every 10 lines" },
].map(item => ({ ...item, modeItem: RULESETS.find(r => r.name === item.ruleset).modes.find(m => m.name === item.mode) }));
const OPTIONS_ITEMS = [
    { name: "Keybinds", desc: "Change key bindings", accent: tetS, screen: MENU_CONTROLS, bindings: true },
    { name: "Gamepad", desc: "Change each gamepad's buttons", accent: tetI, screen: MENU_GAMEPAD, bindings: true },
    { name: "Visuals", desc: "Block style, scale, effects, backdrop and motion", accent: tetT, screen: MENU_VISUALS },
    { name: "Guideline", desc: "Handling for the Guideline modes: DAS, ARR, soft drop…", accent: tetL, screen: MENU_HANDLING },
];
// Settings changed with ← →, by screen; descriptions show the current setting (optionValue())
// (preview: the card is a little taller and shows the block style preview at its right; fx: the
// setting does nothing with effects off, and its card is greyed out then)
const VISUAL_ITEMS = [
    { id: "theme", name: "Theme", accent: tetJ },
    { id: "tileset", name: "Block style", accent: tetO, preview: true },
    { id: "scale", name: "Scale", accent: tetL },
    { id: "effects", name: "Effects", accent: tetT },
    { id: "confetti", name: "Confetti", accent: tetS, fx: true },
    { id: "rings", name: "Clear burst", accent: tetZ, fx: true },
    { id: "flash", name: "Row flash", accent: tetI, fx: true },
    { id: "backdrop", name: "Backdrop", accent: tetJ, fx: true },
    { id: "tilt", name: "3D tilt", accent: tetI, fx: true },
    { id: "shake", name: "Drop shake", accent: tetS, fx: true },
    { id: "trail", name: "Drop trail", accent: tetT, fx: true },
    { id: "border", name: "Stack border", accent: tetZ },
];
// Guideline handling; help: the name spelled out and what it does, shown under the list for the selection
const HANDLING_ITEMS = [
    { id: "das", name: "DAS", accent: tetI, help: ["Delayed Auto Shift", "How long ← or → is held before the piece starts sliding"] },
    { id: "arr", name: "ARR", accent: tetT, help: ["Auto Repeat Rate", "Time between steps while sliding; instant jumps to the wall"] },
    { id: "sdf", name: "SDF", accent: tetS, help: ["Soft Drop Factor", "How many times faster than gravity a soft drop falls"] },
    { id: "dcd", name: "DCD", accent: tetZ, help: ["DAS Cut Delay", "Pauses sliding briefly after a rotation or a new piece"] },
    { id: "ghost", name: "Ghost piece", accent: tetJ, help: ["Ghost piece", "Shows where the falling piece will land"] },
    { id: "dropGuard", name: "Drop guard", accent: tetO, help: ["Hard drop guard", "Ignores hard drops in a new piece's first 8 frames"] },
    { id: "previews", name: "Next pieces", accent: tetI, help: ["Next pieces", "How many of the coming pieces are shown, up to six"] },
    { id: "holdPiece", name: "Hold", accent: tetT, help: ["Hold", "Lets you keep a piece aside and swap it in later"] },
    { id: "irs", name: "IRS", accent: tetS, help: ["Initial Rotation System", "A rotation held as a piece enters turns it at once"] },
    { id: "ihs", name: "IHS", accent: tetZ, help: ["Initial Hold System", "Hold held as a piece enters swaps it at once"] },
    { id: "rot180", name: "180° rotation", accent: tetJ, help: ["180° rotation", "Turns the piece half round with its own key (see Keybinds)"] },
    // action: Enter does it, ← → do nothing; the card shows desc instead of a value
    { id: "resetHandling", name: "Reset to defaults", accent: tetL, action: true, desc: "Press Enter to restore every setting above",
      help: ["Reset to defaults", "DAS 10 F, ARR 2 F, SDF 20×, DCD off, ghost on, guard off, 6 next, hold, IRS, IHS, no 180°"] },
];
// A handling time as shown on its card: frames and milliseconds
function frameValue(frames) {
    return `${frames} F  ·  ${Math.round(frames * 1000 / 60)} ms`;
}

// Key hints reworded for the on-screen buttons: OK and BACK in menus, MENU in games
function touchWords(s) {
    return s.replace("ESC — BACK TO MENU", "TAP MENU TO GO BACK").replace("ESC FOR MENU", "TAP MENU")
        .replace(/ESC  BACK/g, "BACK").replace(/ENTER/g, "OK").replace(/ESC/g, "BACK");
}

// Key hints reworded for a gamepad, while it is the one in use: A and B in menus, START in games
function padWords(s) {
    return s.replace("ESC — BACK TO MENU", "START — BACK TO MENU").replace("ESC FOR MENU", "START FOR MENU")
        .replace(/ENTER/g, "A").replace(/ESC/g, "B");
}

const SETTING_ITEMS = { [MENU_VISUALS]: VISUAL_ITEMS, [MENU_HANDLING]: HANDLING_ITEMS };
const VISUALS_ROWS = { rowH: 48, gap: 4 }; // the Visuals and mode cards, tighter than the other menus
const VISUALS_LIST_H = 364; // height of the Visuals list; it scrolls to keep the selection in view
const HANDLING_ROWS = { rowH: 44, gap: 4 }; // the Guideline handling cards, a little tighter still
const HANDLING_LIST_H = 7 * 48 - 4; // seven cards show; the help for the selected one goes under them
// Setting lists that scroll to keep the selection in view: by screen, the items, the position
// field, the cards' size and the height shown (menuScroll keeps how far each is scrolled)
const SCROLLED_LISTS = {
    [MENU_VISUALS]: { items: VISUAL_ITEMS, pos: "visualspos", ...VISUALS_ROWS, listH: VISUALS_LIST_H },
    [MENU_HANDLING]: { items: HANDLING_ITEMS, pos: "handlingpos", ...HANDLING_ROWS, listH: HANDLING_LIST_H },
    // a mode's setup cards (items: null, they depend on the mode and the cards' choices), when there are more than
    // SETUP_FIT of them, and always for versus's
    [MENU_SETUP]: { items: null, pos: "setuppos", ...VISUALS_ROWS, listH: VISUALS_LIST_H },
};
const SETUP_FIT = 6;
// Top of the lists too long for the usual place (Visuals, Guideline handling, Gamepad, scrolled setup cards), their
// heading in the tagline's place over them: as low as leaves room for the hint, clear of the wordmark
const TALL_TOP = 250;
// Block style preview at the right of its card: a block per style, in colour indices (red, green, cyan)
const PREVIEW_BLOCKS = [["active", 6], ["locked", 5], ["ghost", 1]];
const PREVIEW_GAP = 6;
const PREVIEW_RIGHT = 38; // from the preview's right end to the card's, leaving room for the ▶
const PREVIEW_PAD = 6; // what the preview adds to its card's height
const MENU_DIMMED_ALPHA = 0.35; // a greyed-out card's contents (a setting effects Off turns off)
// A menu card's height (cards with preview are taller), and a list's from its first card's top to its last's bottom
function menuRowHeight(item, rowH) {
    return item.preview ? rowH + PREVIEW_PAD : rowH;
}
function menuListHeight(items, rowH, gap) {
    return items.reduce((h, item) => h + menuRowHeight(item, rowH) + gap, 0) - (items.length ? gap : 0);
}

// ----------------------------------------------------------
// LAYOUT (logical units, scaled to the window)

const VIEW_W = 800;
const VIEW_H = 720;
const CELL = 30;
const BOARD_X = 250;
const BOARD_Y = 70; // the standard 20-row well; a shorter one (GB) is centred on it (boardY, boardH)
const BOARD_W = CELL * WIDTH;
const BOARD_H = CELL * (HEIGHT - VISIBLE_TOP);
const SIDE_W = 170;
const LEFT_X = BOARD_X - 30 - SIDE_W;
const RIGHT_X = BOARD_X + BOARD_W + 30;
// The compact layout (touch devices, narrow windows) crops the view to the well with a narrow column
// each side: HOLD over the stats on the left, NEXT on the right; clear messages show over the well
const COMPACT_SIDE_W = 72;
const COMPACT_GAP = 10; // between the well's frame and a column
const COMPACT_GAIN = 1.2; // without touch: used when it shows the well at least this much bigger
// view: the part of the logical view [x, y, w, h] fitted to the window
const LAYOUT_FULL = { compact: false, view: [0, 0, VIEW_W, VIEW_H], leftX: LEFT_X, rightX: RIGHT_X, sideW: SIDE_W };
const LAYOUT_COMPACT = (() => {
    const leftX = BOARD_X - 8 - COMPACT_GAP - COMPACT_SIDE_W, x0 = leftX - 12;
    return { compact: true, view: [x0, 24, VIEW_W - 2 * x0, BOARD_Y + BOARD_H + 16 - 24],
        leftX, rightX: BOARD_X + BOARD_W + 8 + COMPACT_GAP, sideW: COMPACT_SIDE_W };
})();
const METER_W = 6, METER_GAP = 2; // garbage meter beside a well's frame (clear of the compact layout's column)
// Versus (two players, or a player and the bot): both board groups (well, panels, meter) whole and the same size, side by side about
// the view's centre; duo.gx: where each player's group is drawn (translated in x). Each field is the
// size one player's would be in the window (the single-player layout single: its scale and height),
// with the full panels when both groups fit on screen at the size drawn (the Options scale, which
// shrinks games, leaves more room), else the compact ones; the width left goes between the groups,
// up to DUO_MAX_GAP, and the rest to the margins. Only when even the compact ones don't fit does the
// view widen, so the fields shrink.
// room: the window's width in logical units at the single-player fit; scale: the Options scale
const DUO_MIN_GAP = 24, DUO_MAX_GAP = 120, DUO_MARGIN = 16; // between the groups, and from the window's edges, at the least
function duoFitted(single, room, scale) {
    const [, y, , h] = single.view;
    const shown = room / scale; // the window's width in logical units at the size drawn
    for (const base of [LAYOUT_FULL, LAYOUT_COMPACT]) {
        const groupW = base.rightX + base.sideW - base.leftX; // centred on VIEW_W / 2
        const need = 2 * groupW + DUO_MIN_GAP + 2 * DUO_MARGIN;
        if (base === LAYOUT_COMPACT || need <= shown) {
            const gap = clamp(shown - 2 * groupW - 2 * DUO_MARGIN, DUO_MIN_GAP, DUO_MAX_GAP);
            const shift = (groupW + gap) / 2;
            const w = Math.max(room, need * scale);
            return { ...base, view: [VIEW_W / 2 - w / 2, y, w, h], duo: { gx: [-shift, shift] } };
        }
    }
}

// ----------------------------------------------------------
// LOOK

const FONT = '"Archivo", "Segoe UI", system-ui, sans-serif';
const INK = "#f4ecdc";            // warm gallery white
const INK_DIM = "rgba(244,236,220,0.55)";
const INK_FAINT = "rgba(244,236,220,0.14)";
// INK at an alpha that changes every frame (pulsing text): an array rather than a new CSS string
// each frame, which would fill the colour cache
const INK_RGB = parseColor(INK);
const inkAlpha = (a) => [INK_RGB[0], INK_RGB[1], INK_RGB[2], a];
const PANEL = "rgba(10,13,32,0.72)";

// Piece colours sampled from the original tiles (gfx/tiles): base, light, dark
const PIECE_COLORS = [
    null,
    { base: "#00d3e5", light: "#00fbff", dark: "#009ab0" }, // I cyan
    { base: "#b23eb0", light: "#da83d9", dark: "#871e83" }, // T purple
    { base: "#e1800b", light: "#ffb255", dark: "#904f00" }, // L orange
    { base: "#5155bc", light: "#9699e5", dark: "#21259f" }, // J blue
    { base: "#14a73d", light: "#75d895", dark: "#00671b" }, // S green
    { base: "#ee2929", light: "#f26666", dark: "#bf1615" }, // Z red
    { base: "#e4cf00", light: "#fff082", dark: "#aca000" }, // O yellow
    { base: "#b9bcc6", light: "#eceef4", dark: "#80838f" }, // neutral grey-white (Mono, Shirase from 1000)
    { base: "#575b6c", light: "#83889b", dark: "#333644" }, // versus garbage grey (GARBAGE_COLOR)
    { base: "#8e9bb3", light: "#e3e9f4", dark: "#4b5468" }, // Hard Block's steel (HARD_COLOR)
];

const PIECE_GREY = 8; // the colour index every block of a spent held piece takes (desaturated)

// Block offsets of the SRS shapes, for pieces drawn outside a game (menu accents)
const SRS_CELLS = shapeCells(shapes);

// Countdown digits by value: green, yellow, red as on a start light
const COUNTDOWN_COLORS = [null, PIECE_COLORS[tetS].light, PIECE_COLORS[tetO].light, PIECE_COLORS[tetZ].light];

// Confetti for cleared lines: piece colour (the neutral grey too) plus a few party colours
const CONFETTI_EXTRA = ["#ffffff", "#ff5fd2", "#fff27a"];
const CONFETTI_COLORS = [...PIECE_COLORS.slice(1).map(c => c.light), ...CONFETTI_EXTRA];
const FIREWORK_COLORS = CONFETTI_COLORS.filter(c => !PIECE_COLORS.slice(8).some(p => p.light === c)); // no grey bursts
// By confetti style (options.confetti, none when off; fireworks are always glow): bits per cell, size (least,
// random extra), burst speed factor and upward lift, gravity and air drag per frame, life in
// frames, alpha, additive blending; spin (radians per frame, at most), sideways flutter, fastest
// fall, grid (positions and sizes snapped to it)
const CONFETTI_SPECS = {
    glow: { count: 2, size: [3, 5], speed: 1, lift: 3, gravity: 0.06, drag: 0.97, life: 50, alpha: 0.45, add: true },
    paper: { count: 2, size: [5, 4], speed: 0.8, lift: 3.4, gravity: 0.03, drag: 0.95, life: 100, alpha: 0.9, spin: 0.15, sway: 0.6, maxFall: 1.2 },
    sparks: { count: 3, size: [3, 3], speed: 1.6, lift: 4.8, gravity: 0.1, drag: 0.97, life: 32, alpha: 0.9, add: true },
    stars: { count: 2, size: [3, 4], speed: 1, lift: 3, gravity: 0.05, drag: 0.96, life: 56, alpha: 0.7, add: true, spin: 0.05 },
    bubbles: { count: 2, size: [2, 5], speed: 0.4, lift: 2, gravity: -0.012, drag: 0.97, life: 70, alpha: 0.6, add: true, sway: 0.3 },
    pixels: { count: 2, size: [3, 3], speed: 1, lift: 3, gravity: 0.08, drag: 0.97, life: 50, alpha: 0.9, grid: 3 },
};
const CONFETTI_SPRITE_ROWS = { glow: 0, paper: 1, sparks: 2, stars: 3, bubbles: 4 }; // rows of the confetti atlas (pixels are plain rects)
// TGM3 Easy's fireworks: bursts of confetti around the well, at most FIREWORK_MAX_BURSTS a frame
// (a stream fires one every 10 frames; the end can fire dozens at once)
const FIREWORK_SPARKS = 26, FIREWORK_SPEED = 3.2, FIREWORK_LIFE = 70, FIREWORK_MAX_BURSTS = 6;
const GLOW_SPRITE = 64; // texels per confetti sprite (each way)
const ORB_COUNT = 46; // drifting lights in the backdrop
const HUE_STEP = 28; // backdrop hue shift per line clear
const HUE_DEFAULT = 232; // the backdrop's blue at start, and again at each new game
const RING_LIFE = 46; // frames a clear shockwave expands
const RING_ALPHA = 0.8; // ring opacity at the Normal effects level
const RING_CHAIN_MAX = 8; // combo length after which rings stop getting brighter
const RIPPLE_LIFE = 60; // frames a clear ripple travels (Clear burst: Ripple)
const RIPPLE_REACH = 600; // logical units the ripple's front travels, past the view's corners
const RIPPLE_AMP = 1.94; // refraction strength at the Normal effects level
const RIPPLE_SPREAD = 0.5; // red bends this much less than green, blue this much more
const FLARE_LIFE = 26; // frames a clear flare lasts (Clear burst: Flare)
const FLARE_ALPHA = 1; // flare brightness at the Normal effects level
const FLASH_LIFE = 16; // frames a cleared row glows
const STACK_BORDER_W = 3; // TGM-style stack border: width of the line, drawn on the blocks' edges
const STACK_BORDER_COLOR = "rgba(222,222,232,0.9)";
const DROP_TRAIL_GROW = 4; // frames the hard-drop trail takes to reach down to the piece
const DROP_TRAIL_FADE = 8; // frames a drop trail then takes to fade out, all at once
const DROP_TRAIL_ALPHA = 0.38; // peak opacity of the trail
const DROP_FLASH_LIFE = 8; // frames a hard-dropped piece flashes
const HOLD_FLASH_LIFE = 12; // frames the newly held piece flashes in the HOLD box
const HOLD_GLOW_BLUR = 0.7; // the held piece's flash glow: blur radius in block sizes
const HOLD_GLOW_ALPHA = 0.7; // and its strength at the flash's start (also round the piece entering from hold)
const TILT_MAX = [2.8, 4.8]; // playing field tilt in degrees about the x and y axes, at Normal
const TILT_SPEED = 0.75; // pace of the tilt drift (1 = waves of 0.15-0.7 rad/s)
const TILT_DISTANCE = 1100; // camera distance for the tilt's perspective (logical units)
const FLY_FRAMES = 12; // frames the field takes to fly in from afar during the countdown
const FLY_DEPTH = 10000; // how far behind its place it starts (logical units; about 1/10 its size)
const FLY_TURN = [-16, 28]; // degrees it starts turned about the x and y axes, unwinding as it comes
const FLY_FADE = 0.2; // part of the flight over which it fades in
const SHAKE_KICK = 1.8; // downward speed a long hard drop gives the field (logical units per frame)
const SHAKE_CLEAR_KICK = 1.4; // speed a single-line clear gives the field, in a random direction
const SHAKE_CLEAR_LINE = 0.4, SHAKE_CLEAR_CHAIN = 0.08; // extra per further line, per combo step
const SHAKE_BUMP = 0.6; // sideways speed a piece pushed against the border gives the field
const SHAKE_RISE = 1.2; // upward speed versus garbage rising gives the field
const SHAKE_SPRING =0.22, SHAKE_DAMPING = 0.28; // how fast the field settles back
const SHAKE_TIP = 0.25; // degrees the field tips back per unit it is knocked down
const HOLO_FULL_TILT = 3.5; // degrees of field tilt at which the Holo sheen is at full strength
const HOLO_HUE_PER_DEG = [95, 70]; // hue shift per degree of tilt about the x and y axes
const HOLO_HUE_ACROSS = 140; // hue spread across the well, as a viewing angle changes over it
const HOLO_HUE_STEPS = 48; // hues are quantised so their colours can be cached
const HOLO_ALPHA = 0.55; // sheen opacity at full strength
// Lamp light (tiles.js lamp): a soft light on the blocks, as from a lamp behind the well, whose
// pool moves over the well and whose spot moves inside each block as the field tilts
const LAMP_REST = [0.5, 0.3]; // where the lamp shines face-on, as fractions of the well's width and height
const LAMP_PER_DEG = [0.07, 0.08]; // how far it moves per degree of tilt about the x and y axes (Normal: about ±0.2 and ±0.4)
const LAMP_SPREAD = 6; // how quickly the pool fades away from the lamp
const LAMP_FLOOR = 0.35, LAMP_PEAK = 1.05; // light on every block, and the extra at the lamp
const LAMP_SPOT_SHIFT = 1.4; // spot offset in a block per unit of distance to the lamp
const LAMP_SPOT_MIN = 0.15, LAMP_SPOT_MAX = 0.85; // the spot's range inside the block
const LAMP_STEPS = 5; // spot positions per axis in the atlas, drawn blended between the nearest four
const LAMP_LOCKED = 0.7; // the stack's light relative to the falling piece's
const LAMP_TILT_ALPHA = 0.6; // the other styles' lamp at Normal tilt and above (none at Off)
const BOARD_LAYER_MARGIN = 18; // room around the frame in the tilted layer for block glows
const BOARD_GLOW_BLUR = [44, 74]; // board glow blur (device px) at rest and at full pulse

// Timing: a game frame may run this many ms early, so a display refresh landing just
// before the 17/17/16 ms schedule doesn't skip a frame and then run two
const FRAME_SLACK = 4;
const FRAME_MS = 1000 / 60; // a game frame's length on average; animations count time in these

// Clear messages, in the right column below the next pieces
const MESSAGE_LIFE = 100; // frames
const TEXT_CACHE_MAX = 256; // rendered text strings kept as textures
const MESSAGE_POP_MAX = 1.3; // a new message starts this much bigger
const MESSAGE_GOLD = "#ffd76a";
const GOLD_RGB = parseColor(MESSAGE_GOLD);
const goldAlpha = (a) => [GOLD_RGB[0], GOLD_RGB[1], GOLD_RGB[2], a]; // pulsing gold, as inkAlpha
const COMBO_COLORS = [INK, INK, "#fff1a8", MESSAGE_GOLD, "#ffb35c", "#ff8a4c", "#ff5f4a"]; // by chain length
const GARBAGE_METER = "#ff4f5e"; // versus: the garbage waiting beside a well
const GARBAGE_METER_WAIT = "rgba(244,236,220,0.6)"; // and the garbage that may not rise yet
const ATTACK_LIFE = 50; // frames a "+lines" sent pop-up shows
const ROUND_ROTATE_DELAY = 45; // frames after a round is decided before a rotate press starts the next
// Versus items (items.js): an item block a clear takes bursts in rings of its kind's colour for
// ITEM_BURST_LIFE frames, out to ITEM_BURST_RADIUS, with ITEM_BURST_SPARKS motes (Heboris's 30-frame
// burst); the item gauge beside the well fills in gold and flashes ITEM_GAUGE_FLASH frames as an item comes
const ITEM_BURST_LIFE = 30, ITEM_BURST_RADIUS = 58, ITEM_BURST_SPARKS = 14;
const ITEM_GAUGE_FLASH = 40;
// The cut-in: its band's height, the emblem's size and where it sits above the band's centre
const CUTIN_BAND_H = 150, CUTIN_EMBLEM = 92, CUTIN_EMBLEM_Y = 20;

// Stat values drawn glyph by glyph (they change every frame); other values are words, drawn whole
const NUMERIC_TEXT = /^[\d:.,/ ]+$/;
const BANNER_LINE_H = 18; // the game over banner's lines under its sub-title (secret grade, exam)

// letterSpacing adds trailing space; this shift keeps centred and right-aligned text in place
function spacingShift(align, spacing) {
    return align === "center" ? spacing / 2 : align === "right" ? spacing : 0;
}

// Text on a canvas 2D context (for rendering into textures)
function fillText2D(g, s, x, y, { size = 16, weight = 700, color = INK, align = "left", spacing = 0, baseline = "middle" } = {}) {
    g.font = `${weight} ${size}px ${FONT}`;
    g.textAlign = align;
    g.textBaseline = baseline;
    g.letterSpacing = spacing + "px";
    g.fillStyle = color;
    g.fillText(s, x + spacingShift(align, spacing), y);
    g.letterSpacing = "0px";
}

// A playing field on screen: its game and the effects drawn with it (confetti, flashes, the held
// piece's glow, the clear message). The player's own is the only one, but in a versus match, which
// adds the bot's, drawn smaller beside it.
class BoardView {
    constructor(game) {
        this.game = game;
        this.particles = [];
        this.flashes = [];
        this.dropFlashes = [];
        this.holdFlash = 0; // frames left of the held piece's flash
        this.enterGlow = 0; // and of the glow round the piece entering from hold (gone when it locks)
        this.messageCache = null; // clear message texture (messageTexture())
        this.popupTop = 0; // where versus's "+lines" go in the side column: under the clear message (drawSidePanels())
        // the field's shake spring (px, py: before the last step), knocked by its own drops and clears
        this.shake = { x: 0, vx: 0, y: 0, vy: 0, px: 0, py: 0, t: 0 };
        this.gx = 0; // where its board group is drawn, translated in x (Engine.resize())
        this.itemBursts = []; // versus: item blocks bursting ({ x, y, color, life })
        this.gaugeShown = 0; // the item gauge as drawn (0..1), eased toward the game's
        this.gaugeFlash = 0; // frames left of its flash as an item comes
        this.lastNextItem = null; // the item in the NEXT box at the last frame (a new one flashes the gauge)
    }
}

class Engine {
    // canvas: the screen, drawn with WebGL. Throws when WebGL is unavailable
    constructor(canvas) {
        this.canvas = canvas;
        this.r = GLRenderer.create(canvas);
        if (!this.r) throw new Error("WebGL is not available");
        this.backdrop = new GLBackdrop(this.r);
        this.measureCtx = document.createElement("canvas").getContext("2d"); // text metrics only
        this.textCache = new Map(); // key -> rendered text, least recently used first
        this.GAMESTATE = STATE_MENU;
        this.menuStep = MENU_MAIN;
        this.mainpos = 0;     // Start or Options
        this.menupos = 0;     // sub-mode
        this.rulesetpos = 0;  // rule set
        this.quickpos = 0;    // Quick Play
        this.optionspos = 0;  // Keybinds, Gamepad, Visuals or Guideline handling
        this.visualspos = 0;
        this.handlingpos = 0;
        this.setuppos = 0;    // setup card
        this.layoutBoard(VISIBLE_TOP);
        this.layout = LAYOUT_FULL; // full or compact, by window (resize())
        this.setupChoices = {}; // setup card choices ("rule set.mode.card": label index), kept for the session
        // per scrolled list (SCROLLED_LISTS): logical units scrolled out above, eased toward target
        this.menuScroll = Object.fromEntries(Object.keys(SCROLLED_LISTS).map(step => [step, { at: 0, target: 0 }]));
        this.singlepos = 0;   // Quick Play or Custom Game
        this.multipos = 0;    // Versus Bot or Versus Player
        this.setupFrom = MENU_MODES; // the screen the setup cards were opened from (a Custom Game mode, or Multiplayer)
        this.joined = [];     // join screen: the input devices picked so far, player 1's first (deviceName())
        this.duoDevices = []; // the two-player game's devices
        this.controlspos = 0; // key action, or "reset" after the last one
        this.controlscol = 0; // the player whose keys it is: 0 or 1
        this.capturing = null; // action waiting for a new key (for capturingPlayer's keys, 1 or 2)
        this.capturingPlayer = 1;
        this.padpos = 0;      // the gamepad chosen, then its actions (from 1), then "reset" after the last one
        this.padConfig = null; // the gamepad the Gamepad screen sets up, a pad index (configPad())
        this.padCapturing = null; // action waiting for a button of that gamepad (GamepadControls.poll() binds it)
        this.options = new Options();
        this.records = new Records();
        this.exams = new Exams(); // TGM3 Master's qualified grades
        this.recordNote = null; // the game over banner's record line
        this.recordNew = false;
        this.game = null;
        this.inputs = [0, 0]; // this frame's input bitmaps by player (the second player's in a two-player game)
        this.events = [];     // key events { code, down, repeat }, and gamepad actions { pad, action, down }
        this.keysDown = new Set(); // key codes held right now
        this.syncKeys = false;     // the game missed key events: release what isn't held
        this.lastFPS = 0;
        this.lastFPSTicks = 0;
        this.lastDrawTicks = 0;
        this.tickPhase = 0; // 0..1: how far the display is from the last game frame to the next
        this.fpscounter = 0;
        this.nextframe = 0;
        this.extraWait = 0;
        this.clearEffects();
        this.hue = HUE_DEFAULT; // backdrop colour, eased toward hueTarget
        this.hueTarget = HUE_DEFAULT;
        this.pulse = 0;       // 0..1 kick on line clears, decays
        this.orbs = Array.from({ length: ORB_COUNT }, () => ({
            x: Math.random() * VIEW_W, y: Math.random() * VIEW_H,
            r: 6 + Math.random() * 26, vy: 0.08 + Math.random() * 0.35,
            sway: Math.random() * 6.28, hueOff: (Math.random() - 0.5) * 70,
            a: 0.1 + Math.random() * 0.22,
        }));
        // Playing field motion: a slow drift made of two waves per axis, and a spring knocked
        // by hard drops
        this.clock = 0; // animation time in game frames, fractional above 60 Hz
        this.newTiltWaves();
        this.boardLayer = null; // render target the field is drawn into when it moves
        this.blockCache = new Map(); // tileset:size -> sprite atlas
        this.confettiAtlas = null;
        this.glowCache = new Map(); // piece glows (pieceGlow): cells|colour|size -> texture
        this.itemIcons = new Map(); // versus item icons (itemIconAtlas()): size -> atlas
        this.itemEmblems = new Map(); // and cut-in emblems (itemEmblem()): item -> texture
        this.sound = new Sound();
    }

    async init() {
        // Wait (briefly) for the web font so the first frames don't use the fallback
        try {
            await Promise.race([
                Promise.all(["900 40px Archivo", "700 20px Archivo", "500 14px Archivo"].map(f => document.fonts.load(f))),
                new Promise(r => setTimeout(r, 1500)),
            ]);
        } catch (e) { /* fall back to system fonts */ }
        await loadTileImages();
        // a font that arrives late replaces text rendered with the fallback
        if (document.fonts) document.fonts.addEventListener("loadingdone", () => this.clearTextCache());

        this.touch = new TouchControls(this);
        this.gamepad = new GamepadControls(this);
        this.resize();
        window.addEventListener("resize", () => this.resize());
        window.addEventListener("keydown", (e) => { this.gamepad.active = false; this.onKey(e, true); });
        window.addEventListener("keyup", (e) => this.onKey(e, false));
        // keys let go in another window never send keyup here
        window.addEventListener("blur", () => {
            this.events.length = 0;
            this.keysDown.clear();
            this.syncKeys = true;
        });
        window.addEventListener("pointerdown", () => this.sound.unlock());
    }

    // Fill the window, fit the layout's view centred inside it (beside or above the touch controls)
    // and render at device resolution. The Options scale shrinks the view in games only (menus stay
    // at full size); the backdrop always covers the window at the fit size.
    resize() {
        // a window with no size yet (a hidden or not yet laid out page) counts as 1 x 1: zero would
        // make the backdrop's gradients non-finite and stop init(); the next resize sets it right
        const winW = Math.max(1, window.innerWidth), winH = Math.max(1, window.innerHeight);
        const fitIn = ([, , w, h], availW, availH) => Math.min(availW / w, availH / h);
        // touch devices always take the compact layout; elsewhere a narrow window does
        // (a versus match: duoFitted())
        const pick = (full, compact) => this.touch.enabled || fitIn(compact.view, winW, winH) >= COMPACT_GAIN * fitIn(full.view, winW, winH)
            ? compact : full;
        const single = pick(LAYOUT_FULL, LAYOUT_COMPACT);
        // against the bot with the touch controls: the player's layout alone, the bot's field small in a corner (drawMiniBoard())
        this.layout = !this.match ? single : this.touch.enabled && !this.match.duo ? { ...LAYOUT_COMPACT, mini: true }
            : duoFitted(single, winW / fitIn(single.view, winW, winH), this._state === STATE_GAME ? this.options.scale : 1);
        this.placeBoards();
        const [vx, vy, vw, vh] = this.layout.view;
        const inset = this.touch.place(winW, winH, this.layout.view);
        const availW = winW - inset.left - inset.right, availH = winH - inset.bottom;
        const fit = fitIn(this.layout.view, availW, availH);
        const dpr = window.devicePixelRatio || 1;
        const cx = (inset.left + availW / 2) * dpr, cy = availH / 2 * dpr; // where the view's centre goes
        this.canvas.style.width = winW + "px";
        this.canvas.style.height = winH + "px";
        this.canvas.width = Math.round(winW * dpr);
        this.canvas.height = Math.round(winH * dpr);
        this.pixelScale = fit * (this._state === STATE_GAME ? this.options.scale : 1) * dpr;
        this.offX = cx - (vx + vw / 2) * this.pixelScale;
        this.offY = cy - (vy + vh / 2) * this.pixelScale;
        this.bgScale = fit * dpr;
        this.bgOffX = cx - (vx + vw / 2) * this.bgScale;
        this.bgOffY = cy - (vy + vh / 2) * this.bgScale;
        // sprites and text are rendered at device resolution: redo them at the new scale
        for (const atlas of this.blockCache.values()) this.r.releaseTexture(atlas.tex);
        this.blockCache.clear();
        for (const glow of this.glowCache.values()) this.r.releaseTexture(glow.tex);
        this.glowCache.clear();
        for (const cache of [this.itemIcons, this.itemEmblems]) {
            for (const sprite of cache.values()) this.r.releaseTexture(sprite.tex);
            cache.clear();
        }
        this.clearTextCache();
        for (const view of this.boards()) {
            if (view.messageCache) this.r.releaseTexture(view.messageCache.tex);
            view.messageCache = null;
        }
        this.backdrop.setBackground(this.renderBackground());
    }

    // Where the player's board group is drawn in the layout (groupX), and the other side's
    placeBoards() {
        this.groupX = this.layout.duo ? this.layout.duo.gx[0] : 0;
        if (this.ownBoard) this.ownBoard.gx = this.groupX;
        if (this.match && this.layout.duo) this.match.view.gx = this.layout.duo.gx[1];
    }

    // The theme chosen in Options → Visuals (themes.js)
    get theme() { return THEMES[this.options.theme]; }

    // The Options scale applies to the game only: entering or leaving it redoes the view size
    get GAMESTATE() { return this._state; }
    set GAMESTATE(s) {
        const changed = s !== this._state;
        this._state = s;
        if (changed && this.pixelScale !== undefined && this.options.scale !== 1) this.resize();
    }

    clearTextCache() {
        for (const t of this.textCache.values()) this.r.releaseTexture(t.tex);
        this.textCache.clear();
    }

    onKey(e, down) {
        if (down) this.sound.unlock(); // audio may only start from a user gesture
        if (down) this.keysDown.add(e.code);
        else this.keysDown.delete(e.code);
        // Keybinds screen waiting for a new key: the next press is the binding
        if (this.capturing) {
            e.preventDefault();
            if (down && !e.repeat) {
                if (e.code !== "Escape") this.options.bind(this.capturing, e.code, this.capturingPlayer);
                this.capturing = null;
            }
            return;
        }
        // Gamepad screen waiting for a button: Esc cancels, other keys do nothing
        if (this.padCapturing) {
            e.preventDefault();
            if (down && !e.repeat && e.code === "Escape") this.padCapturing = null;
            return;
        }
        // Hidden TGM3 test keys: Ctrl+Shift+1..5 (see RuleGame.testSetup)
        if (e.ctrlKey && e.shiftKey && TEST_KEYS[e.code]) {
            e.preventDefault();
            if (down && !e.repeat && this.GAMESTATE === STATE_GAME && this.game) this.game.testSetup(TEST_KEYS[e.code]);
            return;
        }
        if (this.options.keys.sound.includes(e.code)) {
            e.preventDefault();
            if (down && !e.repeat) this.sound.toggleMute();
            return;
        }
        if (!MENU_KEYS.includes(e.code) && !this.options.actionFor(e.code) && !this.options.actionFor(e.code, 2)) return;
        e.preventDefault();
        // SDL key repeat was not enabled; menus take it for the arrows, to scroll while held
        if (e.repeat) {
            if (down && this.GAMESTATE === STATE_MENU && MENU_REPEAT_KEYS.includes(e.code)) this.events.push({ code: e.code, down, repeat: true });
            return;
        }
        this.events.push({ code: e.code, down });
    }

    // A game action pressed or let go on the gamepad at index pad (GamepadControls, in games)
    padAction(pad, action, down) {
        if (down) this.sound.unlock();
        this.events.push({ pad, action, down });
    }

    // Multiplayer join screen: a rotate press on an input device (deviceName()) picks it for the next
    // player. Once both have one, a rotate press on either player's device confirms and starts the
    // game (a device not picked does nothing then; Enter confirms too, Esc takes the last pick back)
    joinDevice(device) {
        if (this.GAMESTATE !== STATE_MENU || this.menuStep !== MENU_JOIN) return;
        this.sound.unlock();
        if (this.joined.length === 2) {
            if (this.joined.includes(device)) this.startDuo();
            return;
        }
        if (this.joined.includes(device)) return;
        this.joined.push(device);
        this.sound.play("rotate");
    }

    // The two players' game, on the devices picked on the join screen, with Versus Player's setup
    startDuo() {
        this.duoDevices = this.joined;
        this.joined = [];
        const [mode, variant, startLevel, height, options] = this.chosenArgs();
        this.initGame(mode, variant, startLevel, height, { ...options, duo: true });
        this.GAMESTATE = STATE_GAME;
    }

    start() {
        const loop = (ticks) => { // the refresh's timestamp: steadier than performance.now()
            // Catch up on missed frames, but never spiral after the tab was hidden
            if (ticks - this.nextframe > 250) this.nextframe = ticks;
            let frames = 0;
            while (ticks >= this.nextframe - FRAME_SLACK && frames < 4) {
                this.frame(ticks);
                frames++;
            }
            // Animations and drawing run on every display refresh, whatever its rate; the game
            // state steps once a frame, so the drawing is told how far it is into the next one
            const dt = this.lastDrawTicks ? Math.min(ticks - this.lastDrawTicks, 4 * FRAME_MS) / FRAME_MS : 1;
            this.lastDrawTicks = ticks;
            this.tickPhase = clamp(1 - (this.nextframe - ticks) / FRAME_MS, 0, 1);
            this.animate(dt);
            this.draw();
            this.countFPS(ticks);
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    // Drawn frames per second, over the time the count actually took (a window that ends on
    // a refresh runs a little past 1000 ms, so a plain count would read 61 at 60 Hz)
    countFPS(ticks) {
        const elapsed = ticks - this.lastFPSTicks;
        if (elapsed > 2000) { // first draw, or after a stall: start a fresh window
            this.lastFPSTicks = ticks;
            this.fpscounter = 0;
            return;
        }
        this.fpscounter++;
        if (elapsed >= 1000) {
            this.lastFPS = Math.round(this.fpscounter * 1000 / elapsed);
            this.lastFPSTicks = ticks;
            this.fpscounter = 0;
        }
    }

    frame(ticks) {
        this.nextframe += (this.extraWait === 2 ? 16 : 17); // Every 3 Frames, wait 16ms instead of 17 to maintain 60 fps
        this.extraWait = (this.extraWait + 1) % 3;
        this.touch.update();
        this.gamepad.poll(ticks);

        switch (this.GAMESTATE) {
            case STATE_GAME:
                // reset inputs
                this.inputs[0] = this.inputs[1] = 0;

                this.handleGameInput();

                // Advance the game by one frame (input may have switched to the menu); a versus
                // match that is decided stands still until a rematch
                if (this.GAMESTATE === STATE_GAME) {
                    if (!(this.match && this.match.result)) this.game.advanceFrame(this.inputs[0]);
                    this.takeGameEvents(this.ownBoard, true);
                    if (this.match) this.matchFrame();
                    if (this.game.isGameOver() && !this.recordDone) this.submitRecord();
                }
                break;

            case STATE_MENU:
                this.handleMenuInput();
                break;
        }
    }

    // A game's events since the last frame become effects on its board; own: the player's board,
    // whose events also play sounds, move the field and send the clear bursts
    takeGameEvents(view, own) {
        const game = view.game;
        this.board = view;
        // effects work with palette colours: map piece types through the rule set's palette
        const toColor = (cell) => ({ ...cell, type: game.palette[cell.type] });
        const cleared = game.takeClearedCells().map(toColor);
        this.explodeCells(cleared, game.chain, own);
        // no jolt for each row the field loses before the staff roll
        if (own && cleared.length && this.options.shakeScale && !game.inRollStart()) this.clearShake(cleared, game.chain);
        const dropped = game.takeHardDropCells().map(toColor);
        if (dropped.length && this.options.effects) view.dropFlashes.push({ cells: dropped, life: DROP_TRAIL_GROW + DROP_TRAIL_FADE + 1 });
        for (const s of game.takeSounds()) {
            if (own) this.sound.play(s);
            // from the event, not the dropped cells: those a clear removed aren't listed
            if (own && s === "harddrop" && this.options.shakeScale) this.kickShake(game.hardDropDistance);
            if (s === "lock" || s === "harddrop") view.enterGlow = 0; // the piece from hold is gone
        }
        if (!game.getCurPiece_type()) view.enterGlow = 0; // or knocked out by an item (a snipe), unlocked
        // after the sounds: with no ARE, a piece can lock and the next come from hold (IHS) in one frame
        if (game.takeHolds() && this.options.effects) view.holdFlash = view.enterGlow = HOLD_FLASH_LIFE;
        for (const dir of game.takeBumps()) if (own && this.options.shakeScale) this.bumpShake(dir);
        const fireworks = game.takeFireworks();
        if (own && this.options.effects) for (let n = 0; n < Math.min(fireworks, FIREWORK_MAX_BURSTS); n++) this.launchFirework();
        for (const burst of game.takeItemBursts()) if (this.options.effects && ITEM_ART[burst.item]) this.burstItem(burst);
        if (game.nextItem && game.nextItem !== view.lastNextItem && this.options.effects) view.gaugeFlash = ITEM_GAUGE_FLASH;
        view.lastNextItem = game.nextItem;
        this.board = this.ownBoard;
    }

    // Every board on screen, the player's own first
    boards() {
        return [this.ownBoard, this.match && this.match.view].filter(Boolean);
    }

    // -----------------------------------
    // VERSUS: a match against the bot, or between two players, in any rule set

    // A match against the bot at BOT_LEVELS[level]: its game has the player's settings (startLevel,
    // options: the speed, items and seed; GB: its own height, options.height2), so both sides get the same pieces, but not the
    // player's handling. view: the other side's board (here the bot's)
    newMatch(mode, startLevel, height, options, level) {
        const game = createGame(mode, "versus", startLevel, options.height2 ?? height, {}, { ...options, side: 1 });
        return {
            bot: new Bot(level, options.seed), level, view: new BoardView(game),
            popups: [[], []], // lines each side sent: "+4" beside or over its well
            result: null,     // "win", "lose" or "draw" (for player 1) once the round is decided (versusOutcome)
            decided: 0,       // frames since then (a rotate press starts the next round after ROUND_ROTATE_DELAY)
            wins: [0, 0],    // rounds each side has won (the TGM games: the first to two takes the match; GB: four)
            round: 1,
        };
    }

    // A match between two players (duo), each on their own input device (duoDevices): player 2's
    // game, with the player's handling and settings, is dealt from the same seed; view is player 2's board
    newDuo(mode, startLevel, height, options) {
        const game = createGame(mode, "versus", startLevel, options.height2 ?? height, this.options.handling, { ...options, side: 1 });
        return { duo: true, devices: this.duoDevices, view: new BoardView(game), popups: [[], []], result: null, decided: 0, wins: [0, 0],
            round: 1 };
    }

    // The match is over once a side has won the rounds the rule set asks for (game.versusWins)
    matchOver() {
        return this.match.wins.some(w => w >= this.game.versusWins);
    }

    // Enter (or a rotate press, from the touch controls or a gamepad too) after a decided round: the
    // next round, the rounds won kept, or once the match is over a new match
    nextRound() {
        const m = this.match, carry = this.matchOver() ? null : { wins: m.wins, round: m.round + 1 };
        this.initGame(...this.lastGameArgs);
        if (carry) Object.assign(this.match, carry);
    }

    // One frame of the match, after player 1's: the other side plays its frame (the bot's input,
    // or player 2's), each side's attacks go to the other (Guideline: all the lines of one attack
    // with their hole in one random column; TGM3's come as rows), and once the rule set decides the
    // round (versusOutcome) both stand still: the games still going end there too
    matchFrame() {
        const m = this.match, games = [this.game, m.view.game];
        const hole = () => Math.floor(Math.random() * WIDTH);
        if (m.result) m.decided++;
        else {
            if (!games[1].isGameOver()) games[1].advanceFrame(m.duo ? this.inputs[1] : m.bot.input(games[1]));
            games.forEach((game, side) => {
                for (const attack of game.takeAttacks()) {
                    games[1 - side].receiveGarbage({ ...attack, hole: hole() });
                    // an item sent has no "+lines": its clear message names it (and the other side's cut-in)
                    if (!attack.item) m.popups[side].push({ lines: attack.lines, life: ATTACK_LIFE });
                    if (side === 0 || m.duo) this.sound.play("attack");
                }
            });
            const result = games[0].versusOutcome();
            if (result) {
                m.result = result;
                if (result !== "draw") m.wins[result === "win" ? 0 : 1]++;
                games.forEach((game, side) => {
                    const won = (result === "win") === (side === 0) && result !== "draw";
                    if (!game.isGameOver()) game.endGame(result === "draw" ? "DRAW" : won ? "VICTORY" : "DEFEAT", null);
                });
                if (m.duo || result === "win") this.sound.play("ko");
            }
        }
        // garbage rising pushes a player's field up
        [this.ownBoard, m.view].forEach((view, side) => {
            for (const rows of view.game.takeRisenGarbage()) if (side === 0 || m.duo) this.riseShake(view, rows);
        });
        this.takeGameEvents(m.view, !!m.duo);
        for (const popups of m.popups) for (const p of popups) p.life--;
        m.popups = m.popups.map(popups => popups.filter(p => p.life > 0));
    }

    // Garbage rising pushes a field up a little
    riseShake(view, rows) {
        view.shake.vy -= SHAKE_RISE * this.options.shakeScale * Math.min(1, 0.4 + rows / 6);
    }

    // Moves the animations on by dt game frames (fractional above 60 Hz), once per refresh
    animate(dt) {
        this.clock += dt;
        this.updateAmbient(dt);
        if (this.GAMESTATE === STATE_GAME) {
            this.updateParticles(dt);
            this.updateShake(dt);
        } else this.updateMenuScroll(dt);
    }

    draw() {
        const r = this.r;
        if (!r.begin()) return; // WebGL context lost: nothing to draw on until it's restored
        this.motion = this.boardMotion();
        this.updateSheen(this.motion);
        // Clear ripples: the frame is drawn into a layer, then onto the screen through them
        const mode = this.ringMode();
        const ripples = mode === "ripple" && this.rings.length ? this.rippleShapes() : null;
        if (ripples) {
            this.sceneLayer = this.sceneLayer || r.renderTarget();
            r.setScreen(this.sceneLayer);
        }
        this.backdrop.render(this.backdropScene());
        r.setTransform(this.pixelScale, this.offX, this.offY);

        if (this.GAMESTATE === STATE_GAME) this.drawGame();
        else this.drawMenu();
        // Clear flares: light on the lens, over everything
        if (mode === "flare" && this.rings.length) {
            this.backdrop.flares([this.pixelScale, this.offX, this.offY], this.flareShapes().map(f => ({
                ...f, rgb: hslToRgb(f.hue, 60, 92), glowRgb: hslToRgb(f.hue, 95, 65),
            })));
        }
        if (ripples) {
            r.setScreen(null);
            this.backdrop.refract(this.sceneLayer, [this.pixelScale, this.offX, this.offY], ripples, RIPPLE_SPREAD);
        }

        // Version and FPS in the view's top corners, kept unobtrusive. Drawn at the fit size (the
        // backdrop's transform) so they stay put whatever the Options scale is.
        r.setTransform(this.bgScale, this.bgOffX, this.bgOffY);
        const [vx, vy, vw] = this.layout.view;
        this.text("v" + VERSION, vx + 16, vy + 14, { size: 10, weight: 500, color: INK_FAINT, spacing: 1 });
        this.text(this.lastFPS + " FPS", vx + vw - 16, vy + 14, { size: 10, weight: 500, color: INK_FAINT, align: "right", spacing: 1 });
        if (this.sound.muted) this.text("SOUND OFF · " + keyLabel(this.options.keys.sound[0]), vx + vw - 16, vy + 30, { size: 10, weight: 600, color: INK_DIM, align: "right", spacing: 1 });
        r.end();
    }

    // What the backdrop pass draws: colour wash, drifting lights, field lines, rings and board glow
    backdropScene() {
        const inGame = this.GAMESTATE === STATE_GAME;
        const ambient = this.options.effects && this.options.backdrop ? this.ambientShapes() : { blobs: [], orbs: [] };
        const color = (s) => ({ ...s, rgb: hslToRgb(s.h, s.s, s.l) });
        const ps = this.pixelScale;
        const glowRgb = this.theme.glowRgb ? this.theme.glowRgb(this) : hslToRgb(this.hue, 90, 62);
        // a glow round each side's board (not the bot's mini-board)
        const glows = !inGame || !glowRgb ? [] : this.boards().filter(view => !this.layout.mini || view === this.ownBoard).map(view => {
            const m = view === this.ownBoard ? this.motion : this.boardMotion(view);
            const gx = this.offX + (view.gx + m.dx) * ps, gy = this.offY + m.dy * ps; // follows the shake
            // and the fly-in: scaled about the board's centre
            const fs = this.flyScale(m), hw = (BOARD_W / 2 + 8) * fs, hh = (this.boardH / 2 + 8) * fs;
            const bcx = BOARD_X + BOARD_W / 2, bcy = this.boardY + this.boardH / 2;
            return {
                rect: [gx + (bcx - hw) * ps, gy + (bcy - hh) * ps, gx + (bcx + hw) * ps, gy + (bcy + hh) * ps],
                // blur given like canvas shadowBlur: twice the Gaussian's sigma
                sigma: (BOARD_GLOW_BLUR[0] + (BOARD_GLOW_BLUR[1] - BOARD_GLOW_BLUR[0]) * Math.min(1, this.pulse)) / 2 * fs,
                rgb: glowRgb,
                a: this.boardGlowAlpha() * m.alpha * m.alpha,
            };
        });
        const rings = this.ringMode() === "rings" ? this.ringShapes().map(r => ({
            ...r, rgb: hslToRgb(r.hue, 90, 75), glowRgb: hslToRgb(r.hue, 95, 65),
        })) : [];
        return {
            bgView: [this.bgScale, this.bgOffX, this.bgOffY],
            view: [ps, this.offX, this.offY],
            blobs: ambient.blobs.map(color),
            orbs: ambient.orbs.map(color),
            nebula: ambient.nebula || 0,
            shade: ambient.shade || [],
            time: this.clock / 60,
            lines: this.theme.lines ? this.theme.lines(this) : null,
            rings,
            ringSigma: 6, // like a shadowBlur of 12
            glows,
        };
    }

    // The well's rows (wellTop to the bottom) set the board's height; a shorter well than the
    // standard 20 rows is centred where those would be, and the side panels follow it
    layoutBoard(wellTop) {
        this.wellTop = wellTop;
        this.boardH = CELL * (HEIGHT - wellTop);
        this.boardY = BOARD_Y + (BOARD_H - this.boardH) / 2;
    }

    // The main menu's items: Continue and Restart come first while there is a game
    // (no Continue once it is over)
    mainItems() {
        if (this.game === null) return MAIN_ITEMS;
        return this.gameGoesOn() ? [CONTINUE_ITEM, RESTART_ITEM, ...MAIN_ITEMS] : [RESTART_ITEM, ...MAIN_ITEMS];
    }

    // The Multiplayer items: no Versus Player with the touch controls
    multiItems() {
        return this.touch.enabled ? MULTI_ITEMS.filter(item => !item.modeItem.join) : MULTI_ITEMS;
    }

    // The Options items: no Keybinds or Gamepad with the touch controls
    optionsItems() {
        return this.touch.enabled ? OPTIONS_ITEMS.filter(item => !item.bindings) : OPTIONS_ITEMS;
    }

    // The game can be resumed: it isn't over, or it is a match not yet decided (NES: the other side
    // plays on after one tops out)
    gameGoesOn() {
        return !this.game.isGameOver() || (!!this.match && !this.match.result);
    }

    // options: the hidden modes' (createGame)
    initGame(mode, variant, startLevel = 0, height = 0, options = {}) {
        this.lastGameArgs = [mode, variant, startLevel, height, options];
        this.recordSetup = this.recordKey(this.lastGameArgs);
        this.recordDone = false;
        this.recordNote = null;
        this.recordNew = false;
        // TGM3 Master with exams: the player's qualified grade, and maybe an exam this game
        this.examRule = options.exams && variant === "standard" && !options.big ? this.examRuleFor(mode) : null;
        const gameOptions = { ...options };
        if (this.examRule) {
            const state = this.exams.get(this.examRule);
            Object.assign(gameOptions, { qualified: state.qualified, exam: tgm3ExamFor(state) });
        }
        // Versus: a match against the bot (options.bot: its level) or between two players (options.duo,
        // on duoDevices), both sides of the mode's rule set and dealt from one seed
        const versus = variant === "versus";
        if (versus) gameOptions.seed = Math.floor(Math.random() * 0x100000000);
        this.game = createGame(mode, variant, startLevel, height, this.options.handling, gameOptions);
        const hadMatch = !!this.match;
        // the other board's clear message goes with it (clearEffects() releases the player's)
        if (hadMatch && this.match.view.messageCache) this.r.releaseTexture(this.match.view.messageCache.tex);
        this.match = !versus ? null : options.duo ? this.newDuo(mode, startLevel, height, gameOptions)
            : this.newMatch(mode, startLevel, height, gameOptions, options.bot ?? BOT_VERSUS_LEVEL);
        if (this.match) [this.game.rival, this.match.view.game.rival] = [this.match.view.game, this.game];
        this.rev = this.game.rev; // the well drawn upside down (cellY)
        this.layoutBoard(this.game.wellTop);
        this.clearEffects();
        // the view widens for the other board, or back; the boards take their places
        if (hadMatch !== !!this.match) this.resize();
        else this.placeBoards();
        this.newTiltWaves();
        this.flySide = Math.random() < 0.5 ? -1 : 1; // which way the field comes in turned
        this.hue = this.hueTarget = HUE_DEFAULT; // every game starts on the default blue
    }

    // Confetti, flashes, rings and the field's shake: none left over from another game (a fresh
    // board view for the player's game)
    clearEffects() {
        if (this.ownBoard && this.ownBoard.messageCache) this.r.releaseTexture(this.ownBoard.messageCache.tex);
        this.ownBoard = this.board = new BoardView(this.game);
        this.ownBoard.gx = this.groupX || 0;
        this.rings = [];
    }

    // Top-left corner of a field cell in logical units (the well's rows start at wellTop)
    cellX(col) {
        return BOARD_X + CELL * col;
    }

    // Rev (TGM1's hidden mode): the well upside down, the bottom row at the top and the spawn rows
    // below; blocks themselves stay upright
    cellY(row) {
        return this.boardY + CELL * (this.rev ? HEIGHT - 1 - row : row - this.wellTop);
    }

    // A trail's ends for a fall from row `from` to row `to`: [far end, the end at the block], at the
    // blocks' upper edges, or their lower ones when the well is upside down
    trailYs(from, to) {
        const edge = this.rev ? CELL : 0;
        return [this.cellY(from) + edge, this.cellY(to) + edge];
    }

    // -----------------------------------
    // PLAYING FIELD MOTION

    // A hard drop knocks the field (the current board's) down, harder for longer drops, with a
    // little sideways jolt
    kickShake(dist) {
        const kick = SHAKE_KICK * this.options.shakeScale * (0.5 + 0.5 * Math.min(1, dist / 16));
        this.board.shake.vy += kick;
        this.board.shake.vx += (Math.random() - 0.5) * kick * 0.5;
    }

    // A piece pushed against the left or right border nudges the field that way
    bumpShake(dir) {
        this.board.shake.vx += dir * SHAKE_BUMP * this.options.shakeScale;
    }

    // A line clear jolts the field in a random direction (mostly down), harder for more
    // lines and longer combos (chain 0 = no combo)
    clearShake(cells, chain) {
        const lines = new Set(cells.map(c => c.row)).size;
        const kick = SHAKE_CLEAR_KICK * this.options.shakeScale * (1 + SHAKE_CLEAR_LINE * (lines - 1))
            * (1 + SHAKE_CLEAR_CHAIN * Math.min(Math.max(0, chain), RING_CHAIN_MAX));
        const angle = Math.PI / 2 + (Math.random() - 0.5) * 2.2; // within ~63° of straight down
        this.board.shake.vx += Math.cos(angle) * kick;
        this.board.shake.vy += Math.sin(angle) * kick;
    }

    // Every board's damped spring back to rest, stepped once per game frame (as tuned) and shown
    // between its last two steps (t: share of a frame since the last step)
    updateShake(dt) {
        for (const view of this.boards()) this.stepShake(view.shake, dt);
    }

    stepShake(s, dt) {
        for (s.t += dt; s.t >= 1; s.t--) {
            s.px = s.x;
            s.py = s.y;
            s.vx += -SHAKE_SPRING * s.x - SHAKE_DAMPING * s.vx;
            s.vy += -SHAKE_SPRING * s.y - SHAKE_DAMPING * s.vy;
            s.x += s.vx;
            s.y += s.vy;
            if (Math.abs(s.x) + Math.abs(s.y) + Math.abs(s.vx) + Math.abs(s.vy) < 0.005) s.x = s.y = s.vx = s.vy = 0;
        }
    }

    // A fresh drift starting now, level: waves with random speeds that all start at zero
    // (phase 0 or π, so the field leans either way first)
    newTiltWaves() {
        this.tiltStart = this.clock;
        this.tiltWaves = [0, 1].map(() => [
            { f: 0.15 + Math.random() * 0.2, p: Math.random() < 0.5 ? 0 : Math.PI },
            { f: 0.4 + Math.random() * 0.3, p: Math.random() < 0.5 ? 0 : Math.PI },
        ]);
    }

    // A board's field: its tilt now (radians about the x and y axes; the drift is shared, the
    // second player's mirrored) and its shake offset (logical units)
    boardMotion(view = this.ownBoard) {
        const t = (this.clock - this.tiltStart) / 60 * TILT_SPEED;
        const k = this.options.tiltAngle * (view === this.ownBoard ? 1 : -1);
        const [ax, ay] = this.tiltWaves.map(([a, b], i) =>
            TILT_MAX[i] * k * (0.65 * Math.sin(t * a.f + a.p) + 0.35 * Math.sin(t * b.f + b.p)));
        const rad = Math.PI / 180;
        const s = view.shake;
        const dx = s.px + (s.x - s.px) * s.t, dy = s.py + (s.y - s.py) * s.t;
        const fly = this.flyIn();
        return {
            rx: (ax + dy * SHAKE_TIP + fly.rx) * rad, ry: (ay + fly.ry) * rad, dx, dy,
            dz: fly.dz, alpha: fly.alpha,
        };
    }

    // The countdown's fly-in: the field starts FLY_DEPTH away, turned and faded out, and comes
    // at the camera, slowing as it settles into place by FLY_FRAMES (none with effects off)
    flyIn() {
        const game = this.GAMESTATE === STATE_GAME && this.game;
        if (!game || !game.inStartDelay() || !this.options.effects) return { rx: 0, ry: 0, dz: 0, alpha: 1 };
        const p = Math.min(1, (game.startdelayCounter + this.tickPhase) / FLY_FRAMES);
        const rest = Math.pow(1 - p, 4); // ease out: what is left of the way
        return {
            rx: FLY_TURN[0] * rest, ry: FLY_TURN[1] * this.flySide * rest,
            dz: -FLY_DEPTH * rest, alpha: Math.min(1, p / FLY_FADE),
        };
    }

    // How big the field's centre is drawn at its depth in the motion m (1 in its place)
    flyScale(m) {
        return TILT_DISTANCE / (TILT_DISTANCE - m.dz);
    }

    // The field drawn into a layer, then onto the screen in perspective: rotated about its
    // centre (y first, then x) and seen from TILT_DISTANCE, plus the shake offset
    drawBoardInMotion(m) {
        const r = this.r, ps = this.pixelScale;
        const x0 = BOARD_X - 8 - BOARD_LAYER_MARGIN, y0 = this.boardY - 2 * CELL - BOARD_LAYER_MARGIN; // spawn rows too
        const w = Math.ceil((BOARD_W + 16 + BOARD_LAYER_MARGIN * 2) * ps);
        const h = Math.ceil((this.boardY + this.boardH + 8 + BOARD_LAYER_MARGIN - y0) * ps);
        this.boardLayer = this.boardLayer || r.renderTarget();
        r.save();
        r.setTarget(this.boardLayer, w, h);
        r.setTransform(ps, -x0 * ps, -y0 * ps);
        this.drawBoard();
        r.setTarget(null);
        r.restore();

        const cx = BOARD_X + BOARD_W / 2, cy = this.boardY + this.boardH / 2;
        const cosX = Math.cos(m.rx), sinX = Math.sin(m.rx), cosY = Math.cos(m.ry), sinY = Math.sin(m.ry);
        const project = (x, y) => {
            const X = x - cx, Y = y - cy;
            const z = -X * sinY;
            const yr = Y * cosX - z * sinX, zr = Y * sinX + z * cosX + m.dz;
            const f = TILT_DISTANCE / (TILT_DISTANCE - zr);
            return [cx + X * cosY * f + m.dx, cy + yr * f + m.dy, f];
        };
        const x1 = x0 + w / ps, y1 = y0 + h / ps;
        r.save();
        r.globalAlpha = m.alpha;
        r.imageQuad(this.boardLayer, [project(x0, y0), project(x1, y0), project(x0, y1), project(x1, y1)]);
        r.restore();
    }

    // -----------------------------------
    // INPUT

    // This frame's input bitmaps (inputs[]) from the events: player 1's alone takes player 1's keys,
    // the touch controls and every gamepad; in a two-player game each player takes only their own
    // device's (duoDevices). Esc (or Start on any pad) opens the menu for both
    handleGameInput() {
        const players = this.match && this.match.duo ? 2 : 1;
        // Keys let go while the game wasn't listening (menu, another window) are released now
        if (this.syncKeys) {
            this.syncKeys = false;
            for (let p = 0; p < players; p++) {
                for (const id in RELEASE_BITS) if (!this.actionHeld(p, id)) this.inputs[p] |= RELEASE_BITS[id];
            }
        }
        while (this.events.length) {
            if (this.events[0].repeat) { this.events.shift(); continue; } // left from the menu
            const ev = this.events[0], { code, down } = ev;
            const [p, action] = this.eventTarget(ev);
            // A release of an action pressed this frame waits for the next one: the bitmap
            // doesn't say which came first, and the rules apply releases before presses
            if (!down && p >= 0 && RELEASE_BITS[action] && (this.inputs[p] & PUSH_BITS[action])) return;
            this.events.shift();
            if (down) {
                if (code === "Escape") {
                    this.GAMESTATE = STATE_MENU;
                    this.menuStep = MENU_MAIN; // so Esc in the menu resumes straight away
                    this.mainpos = 0;           // on Continue (or Restart), the first item
                    this.menuShown = null;      // no slide when the menu opens
                    return;
                }
                // a decided round: the next, or a rematch; Enter, or a rotate press once the banner has
                // shown a moment (the touch controls and gamepads have no Enter in a game; a rotate key
                // still being hammered as the round ends doesn't skip the banner)
                const m = this.match;
                if (m && m.result && (code === "Enter" || (p >= 0 && JOIN_ACTIONS.includes(action) && m.decided >= ROUND_ROTATE_DELAY))) {
                    this.nextRound();
                    this.syncKeys = true;
                    return;
                }
                if (p >= 0 && PUSH_BITS[action]) this.inputs[p] |= PUSH_BITS[action];
            } else if (p >= 0 && RELEASE_BITS[action] && !this.actionHeld(p, action)) {
                this.inputs[p] |= RELEASE_BITS[action]; // not while the action's other key is held
            }
        }
    }

    // The player (0 or 1, -1 for none) and game action of an input event: a key in the keys of a
    // player's device, or an action on a pad
    eventTarget(ev) {
        if (!(this.match && this.match.duo)) {
            if (ev.pad === undefined) return [0, this.options.actionFor(ev.code)];
            // one player's pads act as one: a press another pad already holds does nothing
            const elsewhere = ev.down && this.gamepad.pads.some(pad => pad !== ev.pad && this.gamepad.heldActions(pad).has(ev.action));
            return elsewhere ? [-1, null] : [0, ev.action];
        }
        const devices = this.match.devices;
        if (ev.pad !== undefined) return [devices.indexOf("pad:" + ev.pad), ev.action];
        for (let p = 0; p < 2; p++) {
            const keys = devices[p] === "keys1" ? 1 : devices[p] === "keys2" ? 2 : 0;
            const action = keys && this.options.actionFor(ev.code, keys);
            if (action) return [p, action];
        }
        return [-1, null];
    }

    // A player still holds an action on their device (another key, or another pad, bound to it)
    actionHeld(p, action) {
        const keyHeld = keys => (this.options.keysOf(keys)[action] || []).some(c => this.keysDown.has(c));
        if (!(this.match && this.match.duo)) {
            return keyHeld(1) || this.gamepad.pads.some(pad => this.gamepad.heldActions(pad).has(action));
        }
        const device = this.match.devices[p];
        if (device.startsWith("pad:")) return this.gamepad.heldActions(Number(device.slice(4))).has(action);
        return keyHeld(device === "keys2" ? 2 : 1);
    }

    // Single Player -> Quick Play -> game, or Custom Game -> rule set -> sub-mode -> game; Multiplayer
    // -> Versus Bot -> its setup -> game, or Versus Player -> its setup -> join screen -> game; or Options ->
    // Keybinds (each player's), Gamepad, Visuals or Guideline handling.
    // Esc goes back a screen, and on the first one resumes a paused game.
    handleMenuInput() {
        // count() is only called for the screen on show: a rule set's modes depend on rulesetpos
        const screens = {
            [MENU_MAIN]: { pos: "mainpos", count: () => this.mainItems().length, back: null },
            [MENU_SINGLE]: { pos: "singlepos", count: () => SINGLE_ITEMS.length, back: MENU_MAIN },
            [MENU_MULTI]: { pos: "multipos", count: () => this.multiItems().length, back: MENU_MAIN },
            [MENU_JOIN]: { pos: "multipos", count: () => 1, back: MENU_SETUP },
            [MENU_QUICK]: { pos: "quickpos", count: () => QUICK_PLAY.length, back: MENU_SINGLE },
            [MENU_RULES]: { pos: "rulesetpos", count: () => RULESETS.length, back: MENU_SINGLE },
            [MENU_MODES]: { pos: "menupos", count: () => RULESETS[this.rulesetpos].modes.length, back: MENU_RULES },
            [MENU_OPTIONS]: { pos: "optionspos", count: () => this.optionsItems().length, back: MENU_MAIN },
            [MENU_CONTROLS]: { pos: "controlspos", count: () => KEY_ACTIONS.length + 1, back: MENU_OPTIONS },
            [MENU_GAMEPAD]: { pos: "padpos", count: () => this.gamepad.connected ? KEY_ACTIONS.length + 2 : 1, back: MENU_OPTIONS },
            [MENU_VISUALS]: { pos: "visualspos", count: () => VISUAL_ITEMS.length, back: MENU_OPTIONS },
            [MENU_HANDLING]: { pos: "handlingpos", count: () => HANDLING_ITEMS.length, back: MENU_OPTIONS },
            [MENU_SETUP]: { pos: "setuppos", count: () => this.setupItems().length, back: this.setupFrom },
        };
        while (this.events.length) {
            // repeat: the key is held. Lists and values then stop at their ends instead of wrapping
            const { code, down, repeat } = this.events.shift();
            if (!down) continue;
            // the join screen: a rotate key picks player 1's or 2's keys for the next player (or, with both
            // picked, confirms), Enter confirms; Esc takes the last pick back, or with none goes back
            if (this.menuStep === MENU_JOIN && !(code === "Escape" && !this.joined.length)) {
                if (repeat) continue;
                if (code === "Escape") this.joined.pop();
                else if (code === "Enter" && this.joined.length === 2) this.startDuo();
                else for (const keys of [1, 2]) {
                    if (JOIN_ACTIONS.includes(this.options.actionFor(code, keys))) { this.joinDevice("keys" + keys); break; }
                }
                if (this.GAMESTATE === STATE_GAME) return;
                continue;
            }
            // per event: an earlier key this frame may have changed the screen
            const settings = this.menuStep === MENU_SETUP ? this.setupItems() : SETTING_ITEMS[this.menuStep];
            const screen = screens[this.menuStep];
            const pos = this[screen.pos];
            const count = screen.count();
            if (code === "Escape") {
                if (screen.back !== null) this.menuStep = screen.back;
                else if (this.game !== null && this.gameGoesOn()) { this.GAMESTATE = STATE_GAME; this.syncKeys = true; return; }
            } else if (code === "ArrowUp") {
                this[screen.pos] = repeat ? Math.max(0, pos - 1) : (pos + count - 1) % count;
            } else if (code === "ArrowDown") {
                this[screen.pos] = repeat ? Math.min(count - 1, pos + 1) : (pos + 1) % count;
            } else if (this.menuStep === MENU_GAMEPAD && !this.gamepad.connected) {
                continue; // nothing to set up
            } else if ((code === "ArrowLeft" || code === "ArrowRight") && this.menuStep === MENU_GAMEPAD && pos === 0) {
                this.stepConfigPad(code === "ArrowLeft" ? -1 : 1, !repeat);
            } else if ((code === "ArrowLeft" || code === "ArrowRight") && this.menuStep === MENU_CONTROLS) {
                this.controlscol = code === "ArrowLeft" ? 0 : 1; // player 1's column or player 2's
            } else if ((code === "ArrowLeft" || code === "ArrowRight") && settings && !settings[pos].action) {
                this.changeOption(settings[pos].id, code === "ArrowLeft" ? -1 : 1, !repeat);
            } else if (code === "Enter") {
                if (this.menuStep === MENU_MAIN && this.mainItems()[pos].resume) {
                    this.GAMESTATE = STATE_GAME;
                    this.syncKeys = true;
                    return;
                } else if (this.menuStep === MENU_MAIN && this.mainItems()[pos].restart) {
                    this.initGame(...this.lastGameArgs);
                    this.GAMESTATE = STATE_GAME;
                    return;
                } else if (this.menuStep === MENU_MULTI && this.multiItems()[pos].modeItem) { // its setup cards
                    this.setupFrom = MENU_MULTI;
                    this.menuStep = MENU_SETUP;
                    this.setuppos = 0;
                    this.menuScroll[MENU_SETUP] = { at: 0, target: 0 };
                } else if (this.menuStep === MENU_MAIN || this.menuStep === MENU_OPTIONS || this.menuStep === MENU_SINGLE) {
                    const items = this.menuStep === MENU_MAIN ? this.mainItems() : this.menuStep === MENU_SINGLE ? SINGLE_ITEMS : this.optionsItems();
                    const next = items[pos].screen;
                    this.menuStep = next;
                    // the start lists remember their place
                    if (![MENU_RULES, MENU_QUICK, MENU_SINGLE, MENU_MULTI].includes(next)) this[screens[next].pos] = 0;
                    if (next === MENU_CONTROLS) this.controlscol = 0;
                    if (this.menuScroll[next]) this.menuScroll[next] = { at: 0, target: 0 };
                    // opened from a gamepad: that one is set up first
                    if (next === MENU_GAMEPAD && this.gamepad.active && this.gamepad.pads.includes(this.gamepad.last)) this.padConfig = this.gamepad.last;
                } else if (this.menuStep === MENU_QUICK) {
                    this.initGame(...this.quickArgs());
                    this.GAMESTATE = STATE_GAME;
                    return;
                } else if (this.menuStep === MENU_RULES) {
                    this.menuStep = MENU_MODES;
                    this.menupos = 0;
                    this.setupFrom = MENU_MODES;
                } else if (this.menuStep === MENU_MODES && this.chosenMode().setup) {
                    this.menuStep = MENU_SETUP;
                    this.setuppos = 0;
                    this.menuScroll[MENU_SETUP] = { at: 0, target: 0 };
                } else if (this.menuStep === MENU_SETUP && this.chosenMode().join) { // the join screen: devices picked afresh
                    this.joined = [];
                    this.menuStep = MENU_JOIN;
                } else if (this.menuStep === MENU_MODES || this.menuStep === MENU_SETUP) {
                    this.menuAction();
                    return;
                } else if (settings) {
                    this.changeOption(settings[pos].id, 1);
                } else if (this.menuStep === MENU_CONTROLS) {
                    const player = this.controlscol + 1, action = KEY_ACTIONS[pos];
                    if (pos === KEY_ACTIONS.length) this.options.resetKeys(player);
                    else if (player === 1 || PLAYER2_ACTIONS.includes(action)) { // next key press becomes the binding
                        this.capturing = action.id;
                        this.capturingPlayer = player;
                    } // player 2 has no sound key: player 1's works for both
                } else if (this.menuStep === MENU_GAMEPAD) {
                    const key = this.gamepad.padKey(this.configPad());
                    if (pos === 0) this.stepConfigPad(1);
                    else if (pos === KEY_ACTIONS.length + 1) this.options.resetPad(key);
                    else this.padCapturing = KEY_ACTIONS[pos - 1].id; // the pad's next button becomes the binding
                }
            }
        }
    }

    // The gamepad the Gamepad screen sets up: the one chosen while it stays connected, else the first
    // connected (a binding waiting for the one gone is cancelled), or null with none
    configPad() {
        const pads = this.gamepad.pads;
        if (!pads.includes(this.padConfig)) {
            this.padConfig = pads.length ? pads[0] : null;
            this.padCapturing = null;
        }
        return this.padConfig;
    }

    // The Gamepad screen's next or previous gamepad (dir 1 or -1); wrap false (key held) stops at the ends
    stepConfigPad(dir, wrap = true) {
        const pads = this.gamepad.pads;
        if (pads.length) this.padConfig = pads[stepIndex(pads.indexOf(this.configPad()), dir, pads.length, wrap)];
    }

    // Visuals, Guideline handling and setup screens: step a setting (dir -1 or 1; toggles ignore it).
    // wrap false (key held): stop at the first or last value; toggles don't flip
    changeOption(id, dir, wrap = true) {
        const setup = this.setupCard(id);
        if (setup) {
            this.setupChoices[setup.key] = stepIndex(this.setupIndex(setup.n), dir, setup.item.labels.length, wrap);
            return;
        }
        if (id === "resetHandling") this.options.resetHandling();
        else this.options.step(id, dir, wrap);
        if (id === "scale") this.resize(); // the view's size; the backdrop stays as it is
        if (id === "theme") this.backdrop.setBackground(this.renderBackground());
        if (HANDLING_ITEMS.some(item => item.id === id)) this.applyHandling();
    }

    // Handling changed during a (paused) Guideline game applies at once (both players' games)
    applyHandling() {
        if (this.game) this.game.setHandling(this.options.handling);
        if (this.match && this.match.duo) this.match.view.game.setHandling(this.options.handling);
    }

    // A setting's current value as shown on its card
    optionValue(id) {
        const o = this.options;
        const setup = this.setupCard(id);
        if (setup) return setup.item.labels[this.setupIndex(setup.n)];
        if (OPTION_TOGGLES.includes(id)) return o[id] ? "On" : "Off";
        switch (id) {
            case "effects": return EFFECT_LEVELS[o.effects].name;
            case "rings": return RING_MODES[RING_MODE_IDS.indexOf(o.rings)].name;
            case "tilt": return TILT_LEVELS[o.tilt].name;
            case "shake": return SHAKE_LEVELS[o.shake].name;
            case "scale": return Math.round(o.scale * 100) + "%";
            case "theme": return THEMES[o.theme].name;
            case "tileset": return TILESETS[o.tileset].name;
            case "confetti": return CONFETTI_STYLES[CONFETTI_STYLE_IDS.indexOf(o.confetti)].name;
            case "das": return frameValue(o.das);
            case "arr": return o.arr ? frameValue(o.arr) : "Instant";
            case "dcd": return o.dcd ? frameValue(o.dcd) : "Off";
            case "sdf": return Number.isFinite(o.sdf) ? o.sdf + "×" : "Instant";
            case "previews": return o.previews ? String(o.previews) : "None";
        }
    }

    // Setting cards with their current values, drawn larger than a description (action cards keep
    // their own description). enter: Enter does more than step the value (setup cards start the
    // game), so the selected card keeps its ▶. Cards of settings effects Off turns off are dimmed.
    settingCards(items, enter = false) {
        return items.map(item => item.action ? item : {
            ...item, value: `◀  ${this.optionValue(item.id)}  ▶`, noArrow: !enter, dimmed: !!item.fx && !this.options.effects,
        });
    }

    // The mode selected on the modes screen, or on Multiplayer when the setup cards come from there
    chosenMode() {
        return this.setupFrom === MENU_MULTI ? this.multiItems()[this.multipos].modeItem : RULESETS[this.rulesetpos].modes[this.menupos];
    }

    // The chosen mode's key in setupChoices
    chosenKey() {
        return this.setupFrom === MENU_MULTI ? `multi.${this.multipos}` : `${this.rulesetpos}.${this.menupos}`;
    }

    // The setup screen's cards for the chosen mode (ids "setup0", "setup1", ...), but those for
    // other modes than the one chosen (`modes`; TGM3's Rule card shows for World and Classic both)
    setupItems() {
        const [mode] = this.chosenArgs();
        return (this.chosenMode().setup || []).map(({ name, accent, modes }, n) => ({ id: "setup" + n, name, accent, modes }))
            .filter(item => !item.modes || item.modes.includes(mode)).map(({ modes, ...item }) => item);
    }

    // A setup card's descriptor, its number and its key in setupChoices; null for other ids
    setupCard(id) {
        if (!id.startsWith("setup")) return null;
        const n = Number(id.slice(5));
        return { n, item: this.chosenMode().setup[n], key: `${this.chosenKey()}.${n}` };
    }

    // The chosen mode's remembered label index for setup card n (0 at first)
    setupIndex(n) {
        return this.setupChoices[`${this.chosenKey()}.${n}`] ?? (this.chosenMode().setup[n].initial || 0);
    }

    // The chosen mode with its setup cards' choices: initGame's arguments
    chosenArgs() {
        return this.modeArgs(this.chosenMode(), n => this.setupIndex(n));
    }

    // The selected Quick Play mode with its setup cards' first (or initial) choices
    quickArgs() {
        return this.modeArgs(QUICK_PLAY[this.quickpos].modeItem);
    }

    // A mode's initGame arguments, with label index indexOf(n) on its setup card n
    modeArgs({ mode, variant, setup = [] }, indexOf = n => setup[n].initial || 0) {
        const args = { mode, variant, startLevel: 0, height: 0 }, options = {};
        setup.forEach((item, n) => {
            if (item.modes && !item.modes.includes(args.mode)) return; // a card for other modes
            const i = indexOf(n);
            const value = item.values ? item.values[i] : i;
            if (OPTION_ARGS.includes(item.arg)) options[item.arg] = value;
            else args[item.arg] = value;
        });
        return [args.mode, args.variant, args.startLevel, args.height, options];
    }

    // Activation of menu item: the mode, with its setup cards' choices
    menuAction() {
        this.initGame(...this.chosenArgs());
        this.GAMESTATE = STATE_GAME;
    }

    // -----------------------------------
    // PERSONAL RECORDS

    // A game setup's key in the records: initGame's arguments, the options that are on in order
    recordKey([mode, variant, startLevel, height, options = {}]) {
        return JSON.stringify([mode, variant, startLevel, height, OPTION_ARGS.filter(id => options[id])]);
    }

    // TGM3's rule for a mode, which keeps its own qualified grade (Exams); null for other modes
    examRuleFor(mode) {
        return mode === arika ? "world" : mode === tgmClassic ? "classic" : null;
    }

    // The game just ended: its result goes to the records; the banner says whether it beat them.
    // TGM3 Master with exams: the grade goes into the player's history and settles the exam (not
    // after a hidden test setup)
    submitRecord() {
        this.recordDone = true;
        const game = this.game;
        if (this.examRule && !game.tested) {
            this.exams.set(this.examRule, tgm3ExamAfter(this.exams.get(this.examRule), game.exam, game.earnedGradeIndex()));
        }
        const result = game.record();
        if (!result) return;
        const old = this.records.get(this.recordSetup);
        this.recordNew = this.records.submit(this.recordSetup, result);
        this.recordNote = this.recordNew ? (old ? "NEW BEST" : "FIRST RECORD") : `BEST  ${old.text}`;
    }

    // Under a mode list or setup cards: the best result with the current choices (args), if any
    // (TGM3 Master with exams: the qualified grade with it)
    drawBest(y, args = this.chosenArgs()) {
        const [mode, variant, , , options] = args;
        const best = this.records.get(this.recordKey(args));
        const parts = best ? [`BEST  ${best.text}`] : [];
        const rule = options.exams && variant === "standard" && !options.big ? this.examRuleFor(mode) : null;
        if (rule) parts.push(`QUALIFIED  ${TGM_GRADE_LABELS[this.exams.get(rule).qualified]}`);
        if (parts.length) this.text(parts.join("   ·   "), VIEW_W / 2, y, { size: 12, weight: 700, color: MESSAGE_GOLD, align: "center", spacing: 3 });
    }

    // In a game, at the foot of the NEXT column: the best result for this setup, if any
    // (after the game ends, the one it may just have set); its parts (grade · level · time) stacked
    // when the whole doesn't fit in w
    drawGameBest(x, w, bottom, compact) {
        const best = this.records.get(this.recordSetup);
        if (!best) return;
        const max = compact ? 11 : 16, lineH = compact ? 14 : 20;
        const lines = this.measureText(best.text, max, 800, 1) > w ? best.text.split(" · ") : [best.text];
        lines.forEach((s, n) => {
            const size = Math.min(max, Math.floor(max * w / this.measureText(s, max, 800, 1)));
            this.text(s, x, bottom - (lines.length - 1 - n) * lineH, { size, weight: 800, color: MESSAGE_GOLD, spacing: 1 });
        });
        const top = bottom - (lines.length - 1) * lineH;
        if (compact) this.label("BEST", x, top - 24, w, 9, 2);
        else this.label("BEST", x, top - 38, w);
    }

    // -----------------------------------
    // LINE CLEAR CONFETTI
    // Uses Math.random, independent of the piece randomizers

    // On the current board; own: the player's, whose clears also send the clear burst and turn the backdrop's hue
    explodeCells(cells, chain = 0, own = true) {
        if (!this.options.effects) return;
        const rows = new Set();
        for (const cell of cells) {
            if (cell.row < this.wellTop) continue; // hidden rows
            rows.add(cell.row);
            this.explodeCell(cell);
        }
        if (this.options.flash) for (const row of rows) this.board.flashes.push({ row, life: FLASH_LIFE });
        if (rows.size && own) {
            const mid = [...rows].reduce((a, b) => a + b, 0) / rows.size;
            // the cleared rows' extent on screen, top to bottom (Rev draws the well upside down)
            const ya = this.cellY(Math.min(...rows)), yb = this.cellY(Math.max(...rows));
            const mode = this.options.rings;
            const span = mode === "ripple" ? RIPPLE_LIFE : mode === "flare" ? FLARE_LIFE : RING_LIFE;
            this.rings.push({
                gx: this.board.gx, // the board's group: the burst spreads from its well
                y: this.cellY(mid) + CELL / 2, top: Math.min(ya, yb), bottom: Math.max(ya, yb) + CELL,
                life: span, span, power: rows.size,
                chain: Math.max(0, chain), hue: this.hue, k: this.options.effectScale,
            });
            this.hueTarget += HUE_STEP * rows.size / 2 * (this.theme.hueStep ?? 1);
            this.pulse = Math.min(1, this.pulse + (0.15 + 0.1 * rows.size) * this.options.effectScale);
        }
    }

    explodeCell(cell) {
        const cx = this.cellX(cell.col) + CELL / 2;
        const cy = this.cellY(cell.row) + CELL / 2;
        const style = this.options.confetti, spec = CONFETTI_SPECS[style];
        if (!spec) return; // off
        const count = Math.max(1, Math.round(spec.count * this.options.effectScale));
        for (let n = 0; n < count; n++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = (1 + Math.random() * 4.5) * spec.speed;
            const size = spec.grid ? spec.grid * (1 + Math.floor(Math.random() * 2))
                : spec.size[0] + Math.random() * spec.size[1];
            const color = Math.random() < 0.85 ? PIECE_COLORS[cell.type].light
                : CONFETTI_EXTRA[Math.floor(Math.random() * CONFETTI_EXTRA.length)];
            this.board.particles.push(this.confettiBit(style,
                cx + (Math.random() - 0.5) * CELL * 0.8, cy + (Math.random() - 0.5) * CELL * 0.8,
                Math.cos(angle) * speed, Math.sin(angle) * speed - spec.lift, // bias upwards for a burst
                size, color, spec.life * (1 - 0.4 * Math.random())));
        }
    }

    // One bit of confetti in a style of CONFETTI_SPECS, in a colour of CONFETTI_COLORS
    confettiBit(style, x, y, vx, vy, size, color, life) {
        const spin = CONFETTI_SPECS[style].spin || 0;
        return {
            style, x, y, vx, vy, size, color, life,
            twinkle: Math.random() * Math.PI * 2,
            phase: Math.random() * Math.PI * 2, // flutter
            rot: Math.random() * Math.PI * 2, spin: (Math.random() * 2 - 1) * spin,
        };
    }

    // Lives and speeds are in game frames; dt is the time passed in them
    updateParticles(dt) {
        for (const view of this.boards()) this.updateBoardEffects(view, dt);
        this.rings = this.rings.filter(e => (e.life -= dt) > 0);
    }

    // A board's confetti, flashes and glows
    updateBoardEffects(view, dt) {
        for (const p of view.particles) {
            const spec = CONFETTI_SPECS[p.style];
            const drag = Math.pow(spec.drag, dt); // air drag
            p.vy += spec.gravity * dt;
            p.vx *= drag;
            p.vy *= drag;
            if (spec.maxFall) p.vy = Math.min(p.vy, spec.maxFall);
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            if (spec.sway) {
                p.phase += 0.12 * dt;
                p.x += Math.sin(p.phase) * spec.sway * dt;
            }
            p.rot += p.spin * dt;
            p.twinkle += 0.3 * dt;
            p.life -= dt;
        }
        view.particles = view.particles.filter(p => p.life > 0 && p.y < VIEW_H + 20);
        const age = (effects) => effects.filter(e => (e.life -= dt) > 0);
        view.flashes = age(view.flashes);
        view.dropFlashes = age(view.dropFlashes);
        view.holdFlash = Math.max(0, view.holdFlash - dt);
        view.enterGlow = Math.max(0, view.enterGlow - dt);
        view.itemBursts = age(view.itemBursts);
        view.gaugeFlash = Math.max(0, view.gaugeFlash - dt);
        const game = view.game, gauge = game.nextItem ? 1 : game.itemGauge / game.itemInterval;
        view.gaugeShown += (gauge - view.gaugeShown) * (1 - Math.pow(0.8, dt));
    }

    // Effects strength for the soft, large ones (backdrop wash, trails): never quite off, and
    // less than proportional at Intense
    softEffectScale() {
        return Math.min(1.3, 0.4 + 0.6 * this.options.effectScale);
    }

    // Light colour of colour index `index` in the block style, for drop trails and flashes
    tileLight(index) {
        const set = TILESETS[this.options.tileset];
        return set.trail ? set.trail(index) : PIECE_COLORS[index].light;
    }

    // A drop trail's fit to the block style's blocks: [inset from the cell's sides, how far it
    // reaches past the cell's edge into the block, under its rounded corners] (that way on screen:
    // down, or up when the well is upside down). Drawn under the field, it runs into the blocks.
    trailFit() {
        const [inset, round] = TILESETS[this.options.tileset].face || [0, 0];
        return [inset, (this.rev ? -1 : 1) * (inset + round * CELL)];
    }

    // Drop trail streaks, one per column ({ col, y0, y1, index, yEnd, alpha }): each from y0 down
    // to y1 (the blocks' cell edge), fading in towards them, and on to yEnd inside the blocks; drawn
    // only down to yEnd while it grows, at `alpha` while it fades. Neighbouring streaks are joined
    // across the gap between their blocks where both are above the blocks, so a piece's trail is
    // one area, inset only at its outer sides.
    drawTrails(streaks) {
        const r = this.r, [inset] = this.trailFit(), scale = DROP_TRAIL_ALPHA * this.softEffectScale();
        const streak = (s, x, w, ya, yb) => {
            const color = parseColor(this.tileLight(s.index));
            r.globalAlpha = scale * s.alpha;
            r.shape(x, ya, w, yb - ya, { fill: [[color[0], color[1], color[2], 0], color], fillY: [s.y0, s.y1] });
        };
        // whichever way up (Rev): the span drawn, and the part of it above the blocks
        const span = (s, yEnd) => [Math.min(s.y0, yEnd), Math.max(s.y0, yEnd)];
        const above = s => span(s, (s.yEnd - s.y1) * (s.y1 - s.y0) > 0 ? s.y1 : s.yEnd);
        for (const s of streaks) {
            const [ya, yb] = span(s, s.yEnd);
            streak(s, this.cellX(s.col) + inset, CELL - 2 * inset, ya, yb);
            const n = inset && streaks.find(t => t.col === s.col + 1);
            if (!n) continue;
            const [a0, a1] = above(s), [b0, b1] = above(n);
            const ya2 = Math.max(a0, b0), yb2 = Math.min(a1, b1);
            // the join takes the fainter streak's fade (the one starting further down)
            const f = (n.y0 - s.y0) * (s.y1 - s.y0) > 0 ? n : s;
            if (yb2 > ya2) streak(f, this.cellX(n.col) - inset, 2 * inset, ya2, yb2);
        }
        r.globalAlpha = 1;
    }

    // Hard drop feedback: the landed piece lights up with the active highlight
    // plus a soft tint of its own colour, both fading out quickly
    drawDropFlashes() {
        const r = this.r;
        for (const f of this.board.dropFlashes) {
            const t = Math.max(0, f.life / DROP_FLASH_LIFE);
            for (const cell of f.cells) {
                if (cell.row < this.wellTop || cell.cleared) continue; // hidden rows; cleared: nothing left to light up
                this.drawBlockFlash(cell.type, this.cellX(cell.col), this.cellY(cell.row), CELL, t);
            }
        }
    }

    // A block lit up at strength t (0..1): the active highlight plus a soft tint of its own colour
    drawBlockFlash(index, x, y, size, t) {
        const r = this.r, a = r.globalAlpha; // keeps an outer fade (a greyed-out held piece)
        r.globalAlpha = t * a;
        this.drawBlock(index, x, y, size, "active");
        r.globalAlpha = 0.4 * t * t * a;
        r.shape(x + size / 30, y + size / 30, size * 28 / 30, size * 28 / 30, { radius: size * 0.14, fill: this.tileLight(index) });
        r.globalAlpha = a;
    }

    // A soft glow around a piece's blocks in `color` (the piece drawn at `size`, its top-left
    // block corner at the texture's pad), rendered once at device resolution
    pieceGlow(cells, minR, minC, color, size) {
        const key = cells.join(";") + "|" + color + "|" + size;
        let glow = this.glowCache.get(key);
        if (glow) return glow;
        const blur = HOLD_GLOW_BLUR * size, pad = blur * 2;
        const w = (Math.max(...cells.map(([, j]) => j)) - minC + 1) * size + 2 * pad;
        const h = (Math.max(...cells.map(([i]) => i)) - minR + 1) * size + 2 * pad;
        const s = this.pixelScale, c = document.createElement("canvas");
        c.width = Math.ceil(w * s);
        c.height = Math.ceil(h * s);
        const g = c.getContext("2d");
        g.setTransform(s, 0, 0, s, 0, 0);
        g.shadowColor = color;
        g.shadowBlur = blur * s; // shadowBlur is in device pixels, unscaled by the transform
        g.fillStyle = color;
        for (const [i, j] of cells) g.fillRect(pad + (j - minC) * size, pad + (i - minR) * size, size, size);
        glow = { tex: this.r.texture(c), pad, w, h };
        this.glowCache.set(key, glow);
        return glow;
    }

    // pieceGlow() added at strength t (0..1) round a piece whose top-left block corner is at x, y
    drawPieceGlow(cells, color, size, x, y, t) {
        const minR = Math.min(...cells.map(([i]) => i)), minC = Math.min(...cells.map(([, j]) => j));
        const glow = this.pieceGlow(cells, minR, minC, this.tileLight(color), size);
        const r = this.r;
        r.save();
        r.blendMode = "add";
        r.globalAlpha = HOLD_GLOW_ALPHA * t;
        r.image(glow.tex, x - glow.pad, y - glow.pad, glow.w, glow.h);
        r.restore();
    }

    // Strength (0..1) of a hold's flash or glow with `frames` of it left, fading out from the hold
    holdFlashAlpha(frames = this.board.holdFlash) {
        return Math.min(1, frames / HOLD_FLASH_LIFE * this.options.effectScale);
    }

    // Faint streak per column from where the piece started to where it landed, brightest at
    // the piece and fading upwards, reaching down to the column's lowest block of the piece;
    // it grows down to the piece, then fades out
    drawDropTrail(f) {
        const n = DROP_TRAIL_GROW + DROP_TRAIL_FADE + 1 - f.life; // frames shown, from 1
        const grown = Math.min(1, n / DROP_TRAIL_GROW); // share of the trail drawn so far
        const alpha = 1 - Math.max(0, n - DROP_TRAIL_GROW) / (DROP_TRAIL_FADE + 1);
        const cols = new Map(); // col -> [topmost landed cell, lowest landed row]
        for (const cell of f.cells) {
            const c = cols.get(cell.col);
            if (!c) cols.set(cell.col, [cell, cell.row]);
            else {
                if (cell.row < c[0].row) c[0] = cell;
                c[1] = Math.max(c[1], cell.row);
            }
        }
        const depth = this.trailFit()[1], streaks = [];
        for (const [cell, bottom] of cols.values()) {
            const top = Math.max(cell.row - cell.dist, this.wellTop);
            if (cell.dist <= 0 || cell.row <= top) continue;
            const [y0, y1] = this.trailYs(top, cell.row);
            const yFar = this.trailYs(bottom, bottom)[1] + depth; // inside the lowest block
            streaks.push({ col: cell.col, y0, y1, index: cell.type, yEnd: y0 + (yFar - y0) * grown, alpha });
        }
        this.drawTrails(streaks);
    }

    // Line clear delay: a streak above each column of the falling stack, from where it
    // started to where it is, fading out all at once after it has landed. One per run of
    // blocks falling together; drawn under the field, so only the gap above them shows.
    drawLineDropTrails(firstRow) {
        const game = this.board.game;
        const top = Math.max(firstRow, this.wellTop), depth = this.trailFit()[1];
        for (let i = firstRow; i < HEIGHT; i++) {
            const dist = game.getDropDistance(i);
            if (!dist) continue;
            const landed = game.getDropLandedFor(i, this.tickPhase);
            if (landed >= DROP_TRAIL_FADE) continue;
            const alpha = landed < 0 ? 1 : 1 - (landed + 1) / (DROP_TRAIL_FADE + 1);
            const [y0, y1] = this.trailYs(Math.max(i, top), i + game.getDropOffset(i, this.tickPhase));
            if (this.rev ? y0 <= y1 : y0 >= y1) continue;
            const yEnd = y1 + depth, streaks = [];
            for (let j = 0; j < WIDTH; j++) {
                const cell = game.getCell(i, j);
                if (!cell || game.getCellAlpha(i, j) <= 0) continue;
                if (i > firstRow && game.getCell(i - 1, j) && game.getDropDistance(i - 1) === dist) continue; // not the run's top
                streaks.push({ col: j, y0, y1, index: game.getCellColor(i, j), yEnd, alpha });
            }
            this.drawTrails(streaks);
        }
    }

    // A firework: a ring of sparks in one colour bursting somewhere over the view, falling as it fades
    launchFirework() {
        const [vx, vy, vw, vh] = this.layout.view;
        const x = vx + vw * (0.1 + Math.random() * 0.8), y = vy + vh * (0.12 + Math.random() * 0.4);
        const color = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
        const count = Math.max(8, Math.round(FIREWORK_SPARKS * this.options.effectScale));
        const turn = Math.random() * Math.PI * 2;
        for (let n = 0; n < count; n++) {
            const angle = turn + n / count * Math.PI * 2;
            const speed = FIREWORK_SPEED * (0.85 + Math.random() * 0.3);
            this.board.particles.push(this.confettiBit("glow", x, y, Math.cos(angle) * speed, Math.sin(angle) * speed,
                3 + Math.random() * 3, color, FIREWORK_LIFE - Math.floor(Math.random() * 15)));
        }
    }

    // An item block a clear took ({ row, col, item }) bursts on this.board: rings (drawItemBursts())
    // and a ring of motes, in its kind's colour
    burstItem({ row, col, item }) {
        const x = this.cellX(col) + CELL / 2, y = this.cellY(row) + CELL / 2;
        const color = PIECE_COLORS[ITEM_KIND_COLORS[itemKind(item)]].light;
        this.board.itemBursts.push({ x, y, color, life: ITEM_BURST_LIFE });
        const count = Math.max(6, Math.round(ITEM_BURST_SPARKS * this.options.effectScale));
        for (let n = 0; n < count; n++) {
            const angle = (n + Math.random() * 0.5) / count * Math.PI * 2, speed = 2.2 + Math.random() * 1.6;
            this.board.particles.push(this.confettiBit("glow", x, y, Math.cos(angle) * speed, Math.sin(angle) * speed,
                2.5 + Math.random() * 2.5, color, 26 + Math.random() * 12));
        }
    }

    // Item blocks bursting: three rings one after another, spreading and thinning as they fade
    drawItemBursts() {
        const r = this.r, scale = this.options.effectScale;
        r.save();
        r.blendMode = "add";
        for (const b of this.board.itemBursts) {
            const k = 1 - b.life / ITEM_BURST_LIFE; // 0..1 through the burst
            for (let n = 0; n < 3; n++) {
                const t = (k - n * 0.16) / (1 - n * 0.16);
                if (t <= 0) continue;
                const rad = ITEM_BURST_RADIUS * (1 - Math.pow(1 - t, 2.2)) * (1 - n * 0.2) + 4;
                r.globalAlpha = Math.min(1, scale) * (1 - t) * (n ? 0.55 : 0.9);
                r.shape(b.x - rad, b.y - rad, rad * 2, rad * 2, { radius: rad, stroke: b.color, lineWidth: Math.max(1, 6 * (1 - t)) });
            }
            if (k < 0.3) { // a flash where the block was
                r.globalAlpha = Math.min(1, scale) * (1 - k / 0.3) * 0.8;
                r.shape(b.x - CELL / 2, b.y - CELL / 2, CELL, CELL, { radius: CELL * 0.16, fill: b.color });
            }
        }
        r.restore();
    }

    // Item icons (items.js) at one size, pre-rendered at device resolution side by side
    itemIconAtlas(size) {
        let atlas = this.itemIcons.get(size);
        if (atlas) return atlas;
        const s = this.pixelScale, px = Math.ceil(size * s), gap = 2;
        const items = Object.keys(ITEM_ART), c = document.createElement("canvas");
        c.width = items.length * (px + gap);
        c.height = px;
        const g = c.getContext("2d"), index = new Map();
        items.forEach((item, n) => {
            g.save();
            g.translate(n * (px + gap), 0);
            g.scale(s, s);
            drawItemIcon(g, item, size, s);
            g.restore();
            index.set(item, n * (px + gap));
        });
        atlas = { tex: this.r.texture(c), index, px };
        this.itemIcons.set(size, atlas);
        return atlas;
    }

    // An item's cut-in emblem (items.js), CUTIN_EMBLEM square, rendered once at device resolution
    itemEmblem(item) {
        let emblem = this.itemEmblems.get(item);
        if (emblem) return emblem;
        const s = this.pixelScale, size = CUTIN_EMBLEM * 1.4, c = document.createElement("canvas"); // room for its glow
        c.width = c.height = Math.ceil(size * s);
        const g = c.getContext("2d");
        g.scale(s, s);
        g.translate((size - CUTIN_EMBLEM) / 2, (size - CUTIN_EMBLEM) / 2);
        drawItemEmblem(g, item, CUTIN_EMBLEM, s);
        emblem = { tex: this.r.texture(c), size };
        this.itemEmblems.set(item, emblem);
        return emblem;
    }

    // Confetti: the light styles added together so overlapping bursts bloom, then the solid ones
    drawParticles() {
        const r = this.r;
        const atlas = this.confettiSprites();
        const scale = this.options.effectScale;
        r.save();
        for (let pass = 0; pass < 2; pass++) {
            const add = pass === 0;
            r.blendMode = add ? "add" : "normal";
            for (const p of this.board.particles) {
                const spec = CONFETTI_SPECS[p.style];
                if (!spec.add !== !add) continue;
                const k = Math.min(1, p.life / 24);
                r.globalAlpha = Math.min(1, spec.alpha * scale) * k;
                const col = atlas.index.get(p.color);
                const sx = col * GLOW_SPRITE, sy = CONFETTI_SPRITE_ROWS[p.style] * GLOW_SPRITE;
                switch (p.style) {
                    case "glow": {
                        const size = p.size * (0.6 + 0.4 * k) * (0.8 + 0.2 * Math.sin(p.twinkle));
                        r.image(atlas.tex, p.x - size * 2, p.y - size * 2, size * 4, size * 4, sx, sy, GLOW_SPRITE, GLOW_SPRITE);
                        break;
                    }
                    case "paper": { // a slip tumbling end over end: its back a little darker
                        const flip = Math.cos(p.phase * 1.7), hw = p.size * 0.8;
                        if (flip < 0) r.globalAlpha *= 0.65;
                        this.confettiQuad(atlas.tex, sx, sy, p.x, p.y, hw, hw * Math.abs(flip), p.rot);
                        break;
                    }
                    case "sparks": { // a streak behind the spark, as long as it is fast
                        const v = Math.hypot(p.vx, p.vy);
                        const len = p.size * 0.6 + v * 2.5;
                        const ux = v > 0.01 ? p.vx / v : 1, uy = v > 0.01 ? p.vy / v : 0;
                        this.confettiQuad(atlas.tex, sx, sy, p.x - ux * len * 0.45, p.y - uy * len * 0.45,
                            len / 2, p.size * 1.2, Math.atan2(uy, ux));
                        break;
                    }
                    case "stars": {
                        const hw = p.size * (0.55 + 0.55 * Math.abs(Math.sin(p.twinkle))) * 1.1;
                        this.confettiQuad(atlas.tex, sx, sy, p.x, p.y, hw, hw, p.rot);
                        break;
                    }
                    case "bubbles": {
                        const half = p.size * 1.23;
                        r.image(atlas.tex, p.x - half, p.y - half, half * 2, half * 2, sx, sy, GLOW_SPRITE, GLOW_SPRITE);
                        break;
                    }
                    case "pixels": { // snapped to a coarse grid, fading in steps
                        const g = spec.grid;
                        r.globalAlpha = Math.min(1, spec.alpha * scale) * Math.ceil(k * 4) / 4;
                        r.rect(Math.round(p.x / g) * g - p.size / 2, Math.round(p.y / g) * g - p.size / 2, p.size, p.size, p.color);
                        break;
                    }
                }
            }
        }
        r.restore();
    }

    // The atlas sprite at (sx, sy), centred on (x, y) with half extents hw × hh, turned by angle
    confettiQuad(tex, sx, sy, x, y, hw, hh, angle) {
        const r = this.r, s = r.s;
        const c = Math.cos(angle), n = Math.sin(angle);
        const px = r.x + x * s, py = r.y + y * s;
        const ax = c * hw * s, ay = n * hw * s; // half the width
        const bx = -n * hh * s, by = c * hh * s; // half the height
        r.quad(tex, px - ax - bx, py - ay - by, 1, px + ax - bx, py + ay - by, 1,
            px - ax + bx, py - ay + by, 1, px + ax + bx, py + ay + by, 1, sx, sy, GLOW_SPRITE, GLOW_SPRITE);
    }

    // One sprite per confetti colour, side by side, a row per style (CONFETTI_SPRITE_ROWS)
    confettiSprites() {
        if (this.confettiAtlas) return this.confettiAtlas;
        const n = GLOW_SPRITE, half = n / 2;
        const c = document.createElement("canvas");
        c.width = n * CONFETTI_COLORS.length;
        c.height = n * Object.keys(CONFETTI_SPRITE_ROWS).length;
        const g = c.getContext("2d");
        const star = (cx, cy, outer, inner) => {
            g.beginPath();
            for (let j = 0; j < 8; j++) {
                const a = j * Math.PI / 4 - Math.PI / 2, d = j % 2 ? inner : outer;
                g.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
            }
            g.closePath();
            g.fill();
        };
        const index = new Map();
        CONFETTI_COLORS.forEach((color, i) => {
            const x0 = i * n, cx = x0 + half;
            const row = (id) => CONFETTI_SPRITE_ROWS[id] * n;
            // Glow: white-hot centre fading to the colour
            let cy = row("glow") + half;
            let grad = g.createRadialGradient(cx, cy, 0, cx, cy, half);
            grad.addColorStop(0, "#ffffff");
            grad.addColorStop(0.18, "#ffffff");
            grad.addColorStop(0.35, color + "cc");
            grad.addColorStop(1, color + "00");
            g.fillStyle = grad;
            g.fillRect(x0, row("glow"), n, n);
            // Paper: a slip in the middle of the sprite, its top edge catching the light
            cy = row("paper") + half;
            g.fillStyle = color;
            g.fillRect(x0 + 12, cy - 12, 40, 24);
            g.fillStyle = "rgba(255, 255, 255, 0.3)";
            g.fillRect(x0 + 12, cy - 12, 40, 6);
            // Sparks: a tapering streak, the tail at the left, the white-hot head at the right
            cy = row("sparks") + half;
            grad = g.createLinearGradient(x0 + 2, 0, x0 + n - 2, 0);
            grad.addColorStop(0, color + "00");
            grad.addColorStop(0.5, color);
            grad.addColorStop(0.9, "#ffffff");
            g.fillStyle = grad;
            g.beginPath();
            g.moveTo(x0 + 2, cy);
            g.lineTo(x0 + 52, cy - 7);
            g.arc(x0 + 52, cy, 7, -Math.PI / 2, Math.PI / 2);
            g.closePath();
            g.fill();
            // Stars: a soft halo behind a four-point star with a white core
            cy = row("stars") + half;
            grad = g.createRadialGradient(cx, cy, 0, cx, cy, half);
            grad.addColorStop(0, color + "66");
            grad.addColorStop(1, color + "00");
            g.fillStyle = grad;
            g.fillRect(x0, row("stars"), n, n);
            g.fillStyle = color;
            star(cx, cy, 30, 6);
            g.fillStyle = "#ffffff";
            star(cx, cy, 14, 3);
            // Bubbles: a thin ring, faintly filled, with a highlight at its top left
            cy = row("bubbles") + half;
            g.fillStyle = color + "22";
            g.strokeStyle = color;
            g.lineWidth = 3;
            g.beginPath();
            g.arc(cx, cy, 26, 0, Math.PI * 2);
            g.fill();
            g.stroke();
            g.fillStyle = "#ffffff";
            g.beginPath();
            g.arc(cx - 10, cy - 10, 4, 0, Math.PI * 2);
            g.fill();
            index.set(color, i);
        });
        this.confettiAtlas = { tex: this.r.texture(c), index };
        return this.confettiAtlas;
    }

    // Slow backdrop drift and colour easing; runs in the menus too
    updateAmbient(dt) {
        this.hueTarget += 0.02 * dt; // endless slow colour drift
        this.hue += (this.hueTarget - this.hue) * (1 - Math.pow(0.97, dt));
        this.pulse *= Math.pow(0.95, dt);
        if (this.hueTarget > 720) { this.hueTarget -= 360; this.hue -= 360; }
        for (const o of this.orbs) {
            o.y -= o.vy * (1 + this.pulse * 2) * dt;
            o.sway += 0.01 * dt;
            if (o.y < -o.r * 3) { o.y = VIEW_H + o.r * 3; o.x = Math.random() * VIEW_W; }
        }
        if (this.theme.update) this.theme.update(this, dt);
    }

    // Aurora wash (big colour blobs) and rising lights, in backdrop coordinates. Each has a
    // centre, radius, hue, saturation, lightness and alpha at the centre (fading to 0 at r).
    ambientShapes() {
        if (this.theme.ambient) return this.theme.ambient(this);
        const t = this.clock / 60;
        const h = this.hue;
        const swell = (0.16 + 0.22 * this.pulse) * this.softEffectScale();
        const blobs = [
            [VIEW_W * (0.25 + 0.1 * Math.sin(t * 0.21)), VIEW_H * (0.35 + 0.08 * Math.cos(t * 0.17)), 0, 520],
            [VIEW_W * (0.78 + 0.08 * Math.cos(t * 0.19)), VIEW_H * (0.65 + 0.1 * Math.sin(t * 0.23)), 70, 560],
            [VIEW_W * 0.5, VIEW_H * (0.95 + 0.04 * Math.sin(t * 0.3)), -40, 600],
        ].map(([x, y, off, r]) => ({ x, y, r, h: h + off, s: 85, l: 58, a: swell }));
        const orbs = this.orbs.map(o => ({
            x: o.x + Math.sin(o.sway) * 20, y: o.y, r: o.r, h: h + o.hueOff, s: 90, l: 75,
            a: o.a * (0.6 + 0.4 * Math.sin(t * 1.3 + o.sway * 3)) * (1 + this.pulse),
        }));
        return { blobs, orbs };
    }

    // Clear shockwaves: a bright ring spreading from the cleared rows across the view,
    // stretched 1.6x horizontally. Centre, radius and line width in logical units.
    ringShapes() {
        return this.rings.map(ring => {
            const k = 1 - ring.life / ring.span; // 0 -> 1
            const ease = 1 - Math.pow(1 - k, 3);
            return {
                x: ring.gx + BOARD_X + BOARD_W / 2, y: ring.y, hue: ring.hue + 20,
                r: 30 + ease * (260 + 120 * ring.power),
                width: 3 + 5 * (1 - k) * ring.power,
                // brighter with more lines (1-4) and with a longer combo (chain 0 = no combo)
                a: (1 - k) * (1 - k) * (0.05 + 0.07 * ring.power) * (1 + 0.25 * Math.min(ring.chain, RING_CHAIN_MAX)) * ring.k * RING_ALPHA,
            };
        });
    }

    // Clear flares: a short anamorphic lens flare through the cleared rows, a horizontal streak
    // as tall as they are with a white-hot core, a soft bloom and three small ghosts, widening as
    // it fades. Centre, streak length (its exponential falloff's scale), half the band's height
    // (from the top of the highest cleared row to the bottom of the lowest) and the softness of
    // its edges in logical units.
    flareShapes() {
        return this.rings.map(ring => {
            const k = 1 - ring.life / ring.span; // 0 -> 1
            const ease = 1 - Math.pow(1 - k, 3);
            return {
                x: ring.gx + BOARD_X + BOARD_W / 2, y: (ring.top + ring.bottom) / 2, hue: ring.hue + 20,
                r: 200 + 700 * ease,
                half: (ring.bottom - ring.top) / 2,
                width: 4 * (1 - k) + 2,
                a: (1 - k) * (1 - k) * (0.5 + 0.12 * ring.power) * (1 + 0.15 * Math.min(ring.chain, RING_CHAIN_MAX)) * ring.k * FLARE_ALPHA,
            };
        });
    }

    // The Clear burst in effect: an id from RING_MODES, "off" outside a game or with effects off
    ringMode() {
        return this.GAMESTATE === STATE_GAME && this.options.effects ? this.options.rings : "off";
    }

    // Clear ripples: a wave packet spreading from the cleared rows through the whole view,
    // bending the light of what is under it, red less and blue more, so its front splits into a
    // rainbow fringe (no glow or tint of its own). Centre, radius and packet width in logical
    // units; amp is the largest displacement (green's), in logical units.
    rippleShapes() {
        return this.rings.map(ring => {
            const k = 1 - ring.life / ring.span; // 0 -> 1
            const fade = Math.pow(1 - k, 2.5); // strong at first, gone well before the end
            return {
                x: ring.gx + BOARD_X + BOARD_W / 2, y: ring.y,
                r: 20 + (1 - Math.pow(1 - k, 1.6)) * RIPPLE_REACH,
                width: (14 + 4 * ring.power) * (1 + 1.5 * k), // spreads as it goes
                amp: fade * (4 + 2.5 * ring.power) * (1 + 0.15 * Math.min(ring.chain, RING_CHAIN_MAX)) * ring.k * RIPPLE_AMP,
            };
        });
    }

    drawFlashes() {
        for (const f of this.board.flashes) {
            const t = f.life / FLASH_LIFE;
            const y = this.cellY(f.row);
            this.r.rect(BOARD_X, y + CELL / 2 - (CELL / 2) * t, BOARD_W, CELL * t,
                [1, 250 / 255, 235 / 255, Math.min(1, 0.3 * this.options.effectScale) * t * t]);
        }
    }

    // -----------------------------------
    // DRAWING PRIMITIVES

    // A line of text, drawn from a texture of the string rendered at device resolution
    // in an opaque colour; the colour's alpha is applied when drawing. Returns its width.
    text(s, x, y, { size = 16, weight = 700, color = INK, align = "left", spacing = 0, baseline = "middle" } = {}) {
        const r = this.r;
        let [cr, cg, cb, ca] = parseColor(color);
        const ink = this.theme.ink; // the theme's text colour in place of INK's
        if (ink && cr === INK_RGB[0] && cg === INK_RGB[1] && cb === INK_RGB[2]) [cr, cg, cb] = ink;
        const rgb = `rgb(${Math.round(cr * 255)},${Math.round(cg * 255)},${Math.round(cb * 255)})`;
        const res = r.s;
        const key = [s, size, weight, spacing, baseline, rgb, res.toFixed(3)].join("|");
        let t = this.textCache.get(key);
        if (t) this.textCache.delete(key); // set again below, as the most recently used
        else t = this.renderText(s, { size, weight, color: rgb, spacing, baseline }, res);
        this.textCache.set(key, t);
        if (this.textCache.size > TEXT_CACHE_MAX) {
            const oldest = this.textCache.keys().next().value;
            r.releaseTexture(this.textCache.get(oldest).tex);
            this.textCache.delete(oldest);
        }
        const left = x + spacingShift(align, spacing) - t.width * (align === "center" ? 0.5 : align === "right" ? 1 : 0);
        r.save();
        r.globalAlpha *= ca;
        r.image(t.tex, left - t.pad, y - t.half, t.tex.w / res, t.tex.h / res);
        r.restore();
        return t.width;
    }

    // Left-aligned text drawn a character at a time, for numbers that change every frame
    // (a running time): their glyphs stay cached instead of a new texture per value. Each
    // sits where the whole string would put it (the text up to it, kerning included, less itself).
    textRun(s, x, y, opts) {
        const { size = 16, weight = 700, spacing = 0 } = opts;
        let upTo = "";
        for (const ch of s) {
            upTo += ch;
            const at = this.measureText(upTo, size, weight, spacing) - this.measureText(ch, size, weight, spacing);
            this.text(ch, x + at, y, opts);
        }
    }

    // Texture of a string, left-aligned at (pad, half) in logical units, res texels per unit
    renderText(s, opts, res) {
        const pad = Math.ceil(opts.size * 0.4), half = Math.ceil(opts.size * 1.2);
        const width = this.measureText(s, opts.size, opts.weight, opts.spacing);
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.ceil((width + pad * 2) * res));
        c.height = Math.ceil(half * 2 * res);
        const g = c.getContext("2d");
        g.scale(res, res);
        fillText2D(g, s, pad, half, { ...opts, align: "left" });
        return { tex: this.r.texture(c), width, pad, half };
    }

    measureText(s, size, weight, spacing = 0) {
        const g = this.measureCtx;
        g.font = `${weight} ${size}px ${FONT}`;
        g.letterSpacing = spacing + "px";
        return g.measureText(s).width;
    }

    // Small caps heading with a hairline rule, used above each side panel
    label(s, x, y, w, size = 12, spacing = 4) {
        if (this.theme.label) return this.theme.label(this, s, x, y, w, size, spacing);
        this.text(s, x, y, { size, weight: 700, color: INK_DIM, spacing });
        const tw = this.measureText(s, size, 700, spacing);
        if (w - tw - 8 > 4) this.r.rect(x + tw + 8, y, w - tw - 8, 1, INK_FAINT);
    }

    panel(x, y, w, h) {
        if (this.theme.panel) return this.theme.panel(this, x, y, w, h);
        this.r.shape(x, y, w, h, { radius: 10, fill: PANEL, stroke: "rgba(244,236,220,0.10)", lineWidth: 1 });
    }

    // Block sprites in a block style (tiles.js), pre-rendered at device resolution: one
    // atlas per block style and size, a row per sprite style with the seven colours, then (but
    // with lamp: false) a row per lamp spot position (drawLamp())
    blockAtlas(size, tileset) {
        const key = tileset + ":" + size;
        let atlas = this.blockCache.get(key);
        if (atlas) return atlas;

        const set = TILESETS[tileset];
        const s = this.pixelScale;
        const gap = 2; // keeps neighbours out of the filtered edges
        const rows = ["active", "locked", "ghost"].map(style => {
            const pad = set.pad(style);
            return { style, pad, px: Math.ceil((size + pad * 2) * s) };
        });
        const lampPx = Math.ceil(size * s), lampSpots = set.lamp === false ? 0 : LAMP_STEPS * LAMP_STEPS;
        const c = document.createElement("canvas");
        c.width = (PIECE_COLORS.length - 1) * (Math.max(...rows.map(row => row.px)) + gap);
        c.height = rows.reduce((h, row) => h + row.px + gap, 0) + lampSpots * (lampPx + gap);
        const g = c.getContext("2d");
        const sprites = {};
        let y = 0;
        for (const { style, pad, px } of rows) {
            sprites[style] = [];
            for (let type = 1; type < PIECE_COLORS.length; type++) {
                const x = (type - 1) * (px + gap);
                g.save();
                g.beginPath();
                g.rect(x, y, px, px); // styles composite over their own sprite only
                g.clip();
                g.translate(x, y);
                g.scale(s, s);
                g.translate(pad, pad);
                set.draw(g, PIECE_COLORS[type], size, style, type);
                g.restore();
                sprites[style][type] = { sx: x, sy: y, px, pad };
            }
            y += px + gap;
        }
        const lamp = PIECE_COLORS.map(() => []);
        const span = (LAMP_SPOT_MAX - LAMP_SPOT_MIN) / (LAMP_STEPS - 1);
        for (let spot = 0; spot < lampSpots; spot++) {
            const cx = size * (LAMP_SPOT_MIN + spot % LAMP_STEPS * span);
            const cy = size * (LAMP_SPOT_MIN + Math.floor(spot / LAMP_STEPS) * span);
            for (let type = 1; type < PIECE_COLORS.length; type++) {
                const x = (type - 1) * (lampPx + gap);
                g.save();
                g.beginPath();
                g.rect(x, y, lampPx, lampPx);
                g.clip();
                g.translate(x, y);
                g.scale(s, s);
                this.drawLampSprite(g, set, size, type, cx, cy);
                g.restore();
                lamp[type][spot] = { sx: x, sy: y, px: lampPx };
            }
            y += lampPx + gap;
        }
        atlas = { tex: this.r.texture(c), sprites, lamp };
        this.blockCache.set(key, atlas);
        return atlas;
    }

    // One lamp sprite: a soft pool of the block's light colour round (cx, cy) with a white core,
    // only where the style's lampMask (else the block's face) lets light through
    drawLampSprite(g, set, size, type, cx, cy) {
        g.fillStyle = "#fff";
        if (set.lampMask) set.lampMask(g, size, type);
        else {
            g.beginPath();
            g.roundRect(size * 0.1, size * 0.1, size * 0.8, size * 0.8, size * 0.12);
            g.fill();
        }
        g.globalCompositeOperation = "source-in";
        const pool = g.createRadialGradient(cx, cy, 0, cx, cy, size * 0.6);
        pool.addColorStop(0, "rgba(255,255,255,1)");
        pool.addColorStop(0.35, "rgba(255,255,255,0.4)");
        pool.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = pool;
        g.fillRect(0, 0, size, size);
        g.globalCompositeOperation = "source-atop";
        g.fillStyle = set.trail ? set.trail(type) : PIECE_COLORS[type].light;
        g.fillRect(0, 0, size, size);
        const core = g.createRadialGradient(cx, cy, 0, cx, cy, size * 0.18);
        core.addColorStop(0, "rgba(255,255,255,0.6)");
        core.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = core;
        g.fillRect(0, 0, size, size);
    }

    // lights false: leave out the light drawn over the block (Holo's sheen, the lamp), for
    // drawing it in a pass of its own after many blocks (drawLights())
    drawBlock(type, x, y, size, style = "locked", tileset = this.options.tileset, lights = true) {
        if (!type) return;
        const atlas = this.blockAtlas(size, tileset);
        const sp = atlas.sprites[style][type];
        const w = size + sp.pad * 2;
        this.r.image(atlas.tex, x - sp.pad, y - sp.pad, w, w, sp.sx, sp.sy, sp.px, sp.px);
        if (lights) this.drawLights(type, x, y, size, style, tileset);
    }

    drawLights(type, x, y, size, style = "locked", tileset = this.options.tileset) {
        if (!type || style === "ghost") return;
        if (TILESETS[tileset].sheen) this.drawSheen(x, y, size);
        this.drawLamp(type, x, y, size, style, tileset);
    }

    // The lamp's light on a block: brighter the nearer the block is to where the lamp shines
    // through the well, its spot shifted towards it (blended between the atlas's nearest four)
    drawLamp(type, x, y, size, style, tileset) {
        const set = TILESETS[tileset], L = this.lamp;
        const strength = (set.lamp === "always" ? 1 : set.lamp === false ? 0 : L.tiltAlpha) * (set.lampStrength ?? 1);
        if (strength <= 0.004) return;
        const r = this.r;
        const atlas = this.blockAtlas(size, tileset);
        const du = L.u - (x + size / 2 - BOARD_X) / BOARD_W, dv = L.v - (y + size / 2 - this.boardY) / this.boardH;
        const pool = LAMP_FLOOR + LAMP_PEAK * Math.exp(-(du * du * 0.81 + dv * dv * 0.36) * LAMP_SPREAD);
        const span = LAMP_SPOT_MAX - LAMP_SPOT_MIN, last = LAMP_STEPS - 1;
        const gx = (clamp(0.5 + du * LAMP_SPOT_SHIFT, LAMP_SPOT_MIN, LAMP_SPOT_MAX) - LAMP_SPOT_MIN) / span * last;
        const gy = (clamp(0.5 + dv * LAMP_SPOT_SHIFT, LAMP_SPOT_MIN, LAMP_SPOT_MAX) - LAMP_SPOT_MIN) / span * last;
        const ix = Math.min(Math.floor(gx), last - 1), iy = Math.min(Math.floor(gy), last - 1);
        const fx = gx - ix, fy = gy - iy;
        const a = r.globalAlpha * Math.min(1, pool * strength * (style === "active" ? 1 : LAMP_LOCKED));
        const sprites = atlas.lamp[type];
        r.save();
        r.blendMode = "add";
        for (let k = 0; k < 4; k++) {
            const wx = k & 1 ? fx : 1 - fx, wy = k & 2 ? fy : 1 - fy;
            if (wx * wy < 0.01) continue;
            const sp = sprites[(iy + (k >> 1)) * LAMP_STEPS + ix + (k & 1)];
            r.globalAlpha = a * wx * wy;
            r.image(atlas.tex, x, y, size, size, sp.sx, sp.sy, sp.px, sp.px);
        }
        r.restore();
    }

    // Holo blocks: how strong the colour sheen is and which hue it starts at, from the
    // field's tilt now. Face-on (no tilt) the strength is 0 and the blocks stay grey.
    // Also where the lamp shines through the well (drawLamp()).
    updateSheen(m) {
        const deg = 180 / Math.PI;
        const tilt = Math.hypot(m.rx, m.ry) * deg / HOLO_FULL_TILT;
        const k = Math.min(1, tilt);
        this.sheen = {
            strength: k * k * (3 - 2 * k) * HOLO_ALPHA,
            hue: m.ry * deg * HOLO_HUE_PER_DEG[1] + m.rx * deg * HOLO_HUE_PER_DEG[0],
        };
        this.sheenColors = this.sheenColors || [];
        this.sheenY = this.sheenY || [0, 0];
        // the lamp: where it shines through the well, and the other styles' strength at this tilt
        // and effects level. With effects off they get none, and Stained glass's stays at rest.
        const fx = this.options.effectScale, moves = fx > 0 ? deg : 0;
        this.lamp = this.lamp || {};
        this.lamp.u = LAMP_REST[0] - m.ry * moves * LAMP_PER_DEG[1];
        this.lamp.v = LAMP_REST[1] + m.rx * moves * LAMP_PER_DEG[0];
        this.lamp.tiltAlpha = LAMP_TILT_ALPHA * Math.min(1, this.options.tiltAngle) * fx;
    }

    // Additive coloured gloss over a block: the hue follows the tilt and also changes across
    // the well, so a tilted field shimmers in bands
    drawSheen(x, y, size) {
        const s = this.sheen;
        if (!s || s.strength <= 0.004) return;
        const r = this.r;
        const hue = s.hue + (x - BOARD_X) / BOARD_W * HOLO_HUE_ACROSS + (y - this.boardY) / this.boardH * HOLO_HUE_ACROSS * 0.5;
        const step = (Math.round(hue / 360 * HOLO_HUE_STEPS) % HOLO_HUE_STEPS + HOLO_HUE_STEPS) % HOLO_HUE_STEPS;
        let pair = this.sheenColors[step];
        if (!pair) {
            const h = step / HOLO_HUE_STEPS * 360;
            pair = this.sheenColors[step] = [hsla(h, 95, 62), hsla(h + 70, 95, 50)];
        }
        const inset = 3, a = r.globalAlpha;
        const sy = this.sheenY;
        sy[0] = y; sy[1] = y + size;
        r.save();
        r.globalAlpha = a * s.strength;
        r.blendMode = "add";
        r.shape(x + inset, y + inset, size - inset * 2, size - inset * 2, { radius: size * 0.1, fill: pair, fillY: sy });
        r.restore();
    }

    // A block that carries an item: a versus item's icon (items.js) with a light pulsing over it in
    // its kind's colour; anything else (Sakura's jewels) a pulsing gold rim
    drawItemMark(x, y, size, item) {
        const r = this.r, pulse = 0.5 + 0.5 * Math.sin(this.clock / 8);
        if (!ITEM_ART[item]) {
            r.shape(x + 1.5, y + 1.5, size - 3, size - 3, {
                radius: size * 0.16, fill: goldAlpha(0.1 + 0.15 * pulse), stroke: goldAlpha(0.55 + 0.45 * pulse), lineWidth: Math.max(1.5, size / 12),
            });
            return;
        }
        const atlas = this.itemIconAtlas(size);
        r.image(atlas.tex, x, y, size, size, atlas.index.get(item), 0, atlas.px, atlas.px);
        r.save();
        r.blendMode = "add";
        r.globalAlpha *= 0.15 + 0.3 * pulse;
        r.shape(x + size * 0.04, y + size * 0.04, size * 0.92, size * 0.92, {
            radius: size * 0.14, stroke: PIECE_COLORS[ITEM_KIND_COLORS[itemKind(item)]].light, lineWidth: Math.max(1.5, size / 10),
        });
        r.restore();
    }

    // Draw a piece (rotation 0) centred on cx/cy, with a game's shapes and colours if given; item:
    // the item it carries (drawItemMark); flash (0..1): lit up as a hard-dropped piece is
    drawPieceCentered(type, cx, cy, size, style = "locked", game = null, item = null, flash = 0, grey = false) {
        if (!type) return;
        const cells = (game ? game.pieceCells : SRS_CELLS)[type][0];
        const color = grey ? PIECE_GREY : game ? game.palette[type] : type;
        const rows = cells.map(([i]) => i), cols = cells.map(([, j]) => j);
        const minR = Math.min(...rows), minC = Math.min(...cols);
        const ox = cx - ((Math.max(...cols) - minC + 1) * size) / 2;
        const oy = cy - ((Math.max(...rows) - minR + 1) * size) / 2;
        if (flash > 0) this.drawPieceGlow(cells, color, size, ox, oy, flash);
        for (const [i, j] of cells) {
            const x = ox + (j - minC) * size, y = oy + (i - minR) * size;
            this.drawBlock(color, x, y, size, style);
            if (flash > 0) this.drawBlockFlash(color, x, y, size, flash);
            if (item) this.drawItemMark(x, y, size, item);
        }
    }

    // The theme's static backdrop picture, the size of the screen
    renderBackground() {
        const c = document.createElement("canvas");
        c.width = this.canvas.width;
        c.height = this.canvas.height;
        const g = c.getContext("2d");
        const s = this.bgScale;
        g.setTransform(s, 0, 0, s, this.bgOffX, this.bgOffY);
        // Visible area in logical units (extends past the view when letterboxed)
        const x0 = -this.bgOffX / s, y0 = -this.bgOffY / s;
        const x1 = (c.width - this.bgOffX) / s, y1 = (c.height - this.bgOffY) / s;
        this.theme.background(g, x0, y0, x1, y1);
        return c;
    }

    // Seven-colour stripe, a nod to the piece set
    colorStripe(x, y, w, h) {
        if (this.theme.stripe) return this.theme.stripe(this, x, y, w, h);
        const seg = w / 7;
        for (let t = 1; t <= 7; t++) this.r.rect(x + (t - 1) * seg, y, seg + 0.5, h, PIECE_COLORS[t].base);
    }

    keycapWidth(s) {
        return Math.max(22, this.measureText(s, 11, 700) + 14);
    }

    keycap(s, x, y) {
        const w = this.keycapWidth(s);
        this.r.shape(x, y - 11, w, 22, { radius: 5, fill: "rgba(244,236,220,0.08)", stroke: "rgba(244,236,220,0.25)", lineWidth: 1 });
        this.text(s, x + w / 2, y, { size: 11, weight: 700, color: INK, align: "center" });
        return w;
    }

    // -----------------------------------
    // SCREENS

    drawMenu() {
        const cx = VIEW_W / 2;

        // Wordmark, shrunk to the compact view's width
        if (this.theme.wordmark) this.theme.wordmark(this, cx);
        else {
            const markSize = Math.min(76, Math.floor(76 * (this.layout.view[2] - 48) / this.measureText("QUADBRICKS", 76, 900, 14)));
            this.text("QUADBRICKS", cx, 150, { size: markSize, weight: 900, color: INK, align: "center", spacing: Math.round(markSize * 14 / 76) });
            this.colorStripe(cx - 150, 200, 300, 4);
        }

        // Slide between screens: forward (deeper) moves left, back moves right
        const now = performance.now();
        if (this.menuShown !== this.menuStep) {
            if (this.menuShown !== null && this.menuShown !== undefined) {
                this.menuSlide = {
                    from: this.menuShown,
                    dir: MENU_DEPTH[this.menuStep] >= MENU_DEPTH[this.menuShown] ? 1 : -1,
                    start: now,
                };
            }
            this.menuShown = this.menuStep;
        }
        const slide = this.menuSlide;
        const t = slide ? Math.min(1, (now - slide.start) / MENU_SLIDE_MS) : 1;
        if (t >= 1) this.menuSlide = null;
        if (!slide || t >= 1) { this.drawMenuScreen(this.menuStep); return; }
        const ease = 1 - Math.pow(1 - t, 3);
        const r = this.r;
        r.save();
        r.globalAlpha = 1 - ease;
        r.translate(-slide.dir * MENU_SLIDE_DIST * ease, 0);
        this.drawMenuScreen(slide.from);
        r.restore();
        r.save();
        r.globalAlpha = ease;
        r.translate(slide.dir * MENU_SLIDE_DIST * (1 - ease), 0);
        this.drawMenuScreen(this.menuStep);
        r.restore();
    }

    drawMenuScreen(step) {
        const cx = VIEW_W / 2;
        const listTop = 290;
        const heading = (s, color = INK_DIM, y = listTop - 26) => this.text(s, cx, y, { size: 11, weight: 700, color, align: "center", spacing: 4 });
        // The tagline under the wordmark, on the main screen only: it slides with the screen, and
        // its place holds the Visuals heading
        if (step === MENU_MAIN) this.text("WELCOME", cx, 228, { size: 12, weight: 600, color: INK_DIM, align: "center", spacing: 6 });
        let hint, hintY = 660; // the bottom of the view, lower under a long list
        switch (step) {
            case MENU_MAIN: {
                // five cards during a game: from a little higher up, the hint under them
                const items = this.mainItems(), top = items.length > 4 ? listTop - 20 : listTop;
                this.drawMenuList(items, this.mainpos, top);
                hintY = Math.max(hintY, top + menuListHeight(items, 64, 10) + 22);
                hint = "ENTER  SELECT" + (this.game ? "      ESC  RESUME" : "");
                break;
            }
            case MENU_SINGLE:
                heading("SINGLE PLAYER");
                this.drawMenuList(SINGLE_ITEMS, this.singlepos, listTop);
                hint = "ENTER  SELECT      ESC  BACK";
                break;
            case MENU_MULTI:
                heading("MULTIPLAYER");
                this.drawMenuList(this.multiItems(), this.multipos, listTop);
                hint = "ENTER  SELECT      ESC  BACK";
                break;
            case MENU_JOIN:
                hint = this.drawJoin(listTop, heading);
                break;
            case MENU_QUICK: {
                // tighter cards like the rule sets', the best for the selected mode and the hint under them
                const top = listTop - 20, rowH = 44, gap = 4;
                heading("SINGLE PLAYER  ·  QUICK PLAY", INK_DIM, top - 26);
                this.drawMenuList(QUICK_PLAY, this.quickpos, top, rowH, gap);
                const bottom = top + menuListHeight(QUICK_PLAY, rowH, gap);
                this.drawBest(bottom + 22, this.quickArgs());
                hintY = Math.max(hintY, bottom + 46);
                hint = "ENTER  START      ESC  BACK";
                break;
            }
            case MENU_RULES: {
                // the longest list: tighter cards, from a little higher up, the hint under them
                const top = listTop - 20, rowH = 44, gap = 4;
                heading("SINGLE PLAYER  ·  CHOOSE A RULE SET", INK_DIM, top - 26);
                this.drawMenuList(RULESETS, this.rulesetpos, top, rowH, gap);
                hintY = Math.max(hintY, top + menuListHeight(RULESETS, rowH, gap) + 22);
                hint = "ENTER  SELECT      ESC  BACK";
                break;
            }
            case MENU_MODES: {
                // Breadcrumb: the chosen rule set, then its modes
                const ruleset = RULESETS[this.rulesetpos];
                heading(ruleset.name.toUpperCase() + "  ·  CHOOSE A MODE");
                this.drawMenuList(ruleset.modes, this.menupos, listTop, VISUALS_ROWS.rowH, VISUALS_ROWS.gap);
                const bottom = listTop + menuListHeight(ruleset.modes, VISUALS_ROWS.rowH, VISUALS_ROWS.gap);
                this.drawBest(bottom + 22); // with the mode's current setup choices
                hintY = Math.max(hintY, bottom + 46);
                hint = (this.chosenMode().setup ? "ENTER  SELECT" : "ENTER  START") + "      ESC  BACK";
                break;
            }
            case MENU_SETUP: {
                // Breadcrumb: rule set (or Multiplayer) and mode, then a generic prompt
                const versus = this.setupFrom === MENU_MULTI;
                const items = this.settingCards(this.setupItems(), true);
                // more than five cards: the tighter cards of Visuals; more than SETUP_FIT, or versus's cards (their
                // number changes with the Rules card, the list keeps its place and size), the Visuals screen's
                // place for them, scrolled to keep the selected one in view
                const scrolled = versus || items.length > SETUP_FIT;
                heading(`${versus ? "Multiplayer" : RULESETS[this.rulesetpos].name}  ·  ${this.chosenMode().name}  ·  CHOOSE SETTINGS`.toUpperCase(),
                    INK_DIM, scrolled ? TALL_TOP - 16 : listTop - 26);
                const { rowH, gap } = scrolled || items.length > 5 ? VISUALS_ROWS : { rowH: 64, gap: 10 };
                let bottom;
                if (scrolled) {
                    this.drawScrolledList(MENU_SETUP, items, TALL_TOP);
                    bottom = TALL_TOP + VISUALS_LIST_H;
                } else {
                    this.drawMenuList(items, this.setuppos, listTop, rowH, gap);
                    bottom = listTop + menuListHeight(items, rowH, gap);
                }
                this.drawBest(bottom + 22);
                hintY = Math.max(hintY, bottom + 46);
                hint = `← →  CHANGE      ENTER  ${this.chosenMode().join ? "SELECT" : "START"}      ESC  BACK`;
                break;
            }
            case MENU_OPTIONS:
                heading("OPTIONS");
                this.drawMenuList(this.optionsItems(), this.optionspos, listTop);
                hint = "ENTER  SELECT      ESC  BACK";
                break;
            case MENU_VISUALS: {
                const top = TALL_TOP; // heading in the tagline's place: leaves room for the hint
                heading("OPTIONS  ·  VISUALS", INK_DIM, top - 16);
                const items = this.settingCards(VISUAL_ITEMS);
                // Tighter cards leave room for the hint; the list shows VISUALS_LIST_H of them,
                // scrolled to keep the selection in view
                this.drawScrolledList(MENU_VISUALS, items, top);
                hintY = Math.max(hintY, top + VISUALS_LIST_H + 22);
                hint = "← →  CHANGE      ESC  BACK";
                break;
            }
            case MENU_HANDLING: {
                // Compact cards like Visuals, scrolling the same way, heading in the tagline's place; below
                // them what the selected setting does, with its abbreviation spelled out
                const top = TALL_TOP;
                heading("OPTIONS  ·  GUIDELINE HANDLING", INK_DIM, top - 16);
                this.drawScrolledList(MENU_HANDLING, this.settingCards(HANDLING_ITEMS), top);
                const [title, help] = HANDLING_ITEMS[this.handlingpos].help;
                const y = top + HANDLING_LIST_H + 14;
                this.text(title.toUpperCase(), cx, y, { size: 11, weight: 700, color: INK, align: "center", spacing: 3 });
                this.text(help, cx, y + 19, { size: 13, weight: 500, color: INK_DIM, align: "center" });
                hintY = Math.max(hintY, y + 44);
                hint = HANDLING_ITEMS[this.handlingpos].action ? "ENTER  RESET      ESC  BACK" : "← →  CHANGE      ESC  BACK";
                break;
            }
            case MENU_CONTROLS: {
                // a column per player, ← → choosing one; player 2 shares player 1's sound key
                heading("OPTIONS  ·  KEYBINDS", INK_DIM, listTop - 34);
                const columns = [1, 2].map(p => ({
                    title: "PLAYER " + p, table: this.options.keysOf(p), accent: p === 2 ? tetZ : tetS,
                    capturing: this.capturingPlayer === p ? this.capturing : null,
                }));
                this.drawBindings(listTop - 8, KEY_ACTIONS, columns, keyLabel, this.controlspos, "PRESS A KEY", this.controlscol);
                const shared = this.controlscol === 1 && KEY_ACTIONS[this.controlspos] && !PLAYER2_ACTIONS.includes(KEY_ACTIONS[this.controlspos]);
                hint = this.capturing ? "NEW KEY ADDS · BOUND KEY REMOVES      ESC  CANCEL"
                    : shared ? "PLAYER 1'S SOUND KEY WORKS FOR BOTH      ESC  BACK"
                    : `← →  PLAYER      ENTER  ${this.controlspos === KEY_ACTIONS.length ? "RESET" : "CHANGE"}      ESC  BACK`;
                break;
            }
            case MENU_GAMEPAD:
                hint = this.drawGamepadScreen(heading);
                break;
        }

        // Footer
        if (this.gamepad.active) hint = padWords(hint);
        else if (this.touch.enabled) hint = touchWords(hint);
        this.text(hint, cx, hintY, { size: 12, weight: 700, color: INK_DIM, align: "center", spacing: 3 });
    }

    // Options → Gamepad: a card choosing the connected gamepad to set up (with more than one, a dot per
    // pad, lit while it is pressed, tells them apart), then its bindings; with none connected, a card
    // saying so. Returns the hint
    drawGamepadScreen(heading) {
        const gp = this.gamepad, pad = this.configPad(), top = TALL_TOP;
        heading("OPTIONS  ·  GAMEPAD", INK_DIM, top - 16);
        if (pad === null) {
            this.drawMenuList([{ name: "No gamepad", desc: "Connect a gamepad and press a button on it", accent: tetI, noArrow: true }], 0, top);
            this.text("BROWSERS SHOW A GAMEPAD ONLY ONCE ONE OF ITS BUTTONS IS PRESSED", VIEW_W / 2, top + 64 + 28,
                { size: 11, weight: 700, color: INK_FAINT, align: "center", spacing: 2 });
            return "ESC  BACK";
        }
        const pads = gp.pads, n = pads.indexOf(pad), many = pads.length > 1;
        const listW = 420, x = VIEW_W / 2 - listW / 2, rowH = 48, dots = many ? pads.length * 14 + 14 : 0;
        // the pad's name, cut short to leave room for the dots and the selection arrow
        let name = gp.padName(pad);
        const room = listW - 92 - 40 - dots - (many ? this.measureText(`${n + 1} OF ${pads.length}  ·  `, 16, 700) : 0);
        while (name.length > 1 && this.measureText(name, 16, 700) > room) name = name.slice(0, -2).trimEnd() + "…";
        this.drawMenuList([{ name: "Gamepad", value: (many ? `${n + 1} OF ${pads.length}  ·  ` : "") + name, accent: tetI }],
            this.padpos === 0 ? 0 : -1, top, rowH);
        if (many) pads.forEach((p, i) => {
            const dx = x + listW - 40 - (pads.length - i) * 14 + 7, cy = top + rowH / 2;
            const lit = gp.pressing(p);
            this.r.shape(dx - 4, cy - 4, 8, 8, {
                radius: 4, lineWidth: 1, stroke: p === pad ? INK : "rgba(244,236,220,0.35)",
                fill: lit ? PIECE_COLORS[tetI].base : p === pad ? INK : "rgba(244,236,220,0)",
            });
        });
        const table = this.options.padTable(gp.padKey(pad));
        this.drawBindings(top + rowH + 8, KEY_ACTIONS, [{ table, accent: tetI, capturing: this.padCapturing }], padLabel, this.padpos - 1, "PRESS A BUTTON");
        // the cancel hint names Start, the pad's only way out (Esc works too)
        if (this.padCapturing) return `NEW BUTTON ON GAMEPAD ${n + 1} ADDS · BOUND BUTTON REMOVES      START  CANCEL`;
        if (this.padpos === 0) return (many ? "← →  CHOOSE GAMEPAD" : "ONE GAMEPAD CONNECTED") + "      ESC  BACK";
        return "ENTER  CHANGE      ESC  BACK";
    }

    // Multiplayer's join screen: a card per player with the device they picked, or the prompt for
    // the one whose turn it is; under them which keys and buttons pick a device, or once both have
    // one, how to start. Returns the hint (Start, not B, goes back on a pad: B rotates)
    drawJoin(top, heading) {
        const cx = VIEW_W / 2, o = this.options, ready = this.joined.length === 2;
        heading(`MULTIPLAYER  ·  VERSUS PLAYER  ·  ${VERSUS_RULE_NAMES[this.chosenArgs()[0]]}`.toUpperCase());
        const cards = [0, 1].map(p => ({
            name: "Player " + (p + 1), accent: p ? tetZ : tetT, noArrow: true,
            value: this.joined[p] ? deviceName(this.joined[p]) : p === this.joined.length ? "PRESS ROTATE" : "WAITING",
        }));
        this.drawMenuList(cards, ready ? -1 : this.joined.length, top);
        const y = top + menuListHeight(cards, 64, 10) + 30;
        const back = this.gamepad.active ? "START" : this.touch.enabled ? "BACK" : "ESC";
        if (ready) {
            this.text("READY?  PRESS ROTATE TO START", cx, y, { size: 16, weight: 900, color: this.pulseInk(10), align: "center", spacing: 4 });
            this.text("EITHER PLAYER, ON THEIR OWN KEYS OR GAMEPAD" + (this.gamepad.active ? "" : "  ·  OR ENTER"), cx, y + 28,
                { size: 12, weight: 700, color: INK_DIM, align: "center", spacing: 2 });
            return (this.gamepad.active ? "" : "ENTER  START      ") + `${back}  CHANGE PLAYER 2`;
        }
        const pair = (a, b) => `${a} / ${b}`, pad = o.padTable(this.gamepad.padKey(this.gamepad.pads[0])); // the first pad's
        this.text(`PLAYER ${this.joined.length + 1}: PRESS ROTATE ON YOUR KEYS OR GAMEPAD`, cx, y,
            { size: 12, weight: 800, color: this.pulseInk(10), align: "center", spacing: 3 });
        const ways = [
            "KEYS 1  " + pair(keyLabel(o.keys.rotl[0]), keyLabel(o.keys.rotr[0])),
            "KEYS 2  " + pair(keyLabel(o.keys2.rotl[0]), keyLabel(o.keys2.rotr[0])),
            "GAMEPAD  " + pair(padLabel(pad.rotl[0]), padLabel(pad.rotr[0])),
        ];
        this.text(ways.join("      ·      "), cx, y + 28, { size: 12, weight: 700, color: INK_DIM, align: "center", spacing: 2 });
        const pads = this.gamepad.pads.length;
        this.text(pads ? `${pads} GAMEPAD${pads > 1 ? "S" : ""} CONNECTED` : "NO GAMEPAD FOUND: PRESS A BUTTON ON IT TO WAKE IT", cx, y + 52,
            { size: 11, weight: 700, color: INK_FAINT, align: "center", spacing: 2 });
        return `${back}  ${this.joined.length ? "CHANGE PLAYER 1" : "BACK"}`;
    }

    // One block each as a falling piece, settled stack and ghost in the chosen block style, at
    // their size in the well and each in its own colour (PREVIEW_BLOCKS), in a row ending at right
    drawTilesetPreview(right, top) {
        const x = right - PREVIEW_BLOCKS.length * (CELL + PREVIEW_GAP) + PREVIEW_GAP;
        PREVIEW_BLOCKS.forEach(([style, color], n) => this.drawBlock(color, x + n * (CELL + PREVIEW_GAP), top, CELL, style));
    }

    // A menu card; the selected one is lighter, with an accent bar on its left edge
    card(x, y, w, h, radius, selected, accent, barW) {
        if (this.theme.card) return this.theme.card(this, x, y, w, h, radius, selected, accent, barW);
        const r = this.r;
        r.shape(x, y, w, h, {
            radius, lineWidth: 1,
            fill: selected ? "rgba(244,236,220,0.10)" : "rgba(10,13,32,0.55)",
            stroke: selected ? "rgba(244,236,220,0.35)" : "rgba(244,236,220,0.08)",
        });
        if (selected) r.shape(x, y, barW, h, { radius: [radius, 0, 0, radius], fill: accent });
    }

    // INK pulsing between 40% and full opacity (a waiting prompt, the selection marker)
    pulseInk(period) {
        return inkAlpha(0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.clock / period)));
    }

    // Rows of action name and keys (or gamepad buttons, labelled by label) for the actions listed, a
    // column of them per table in columns ({ table, accent, title, capturing }): one right-aligned, or
    // several side by side under their titles, col the one selected; an action missing from a table is
    // shared (player 1's sound key). Enter on a row waits for a key to add (or remove, if it has it):
    // a column's capturing is the action waiting, prompt is shown in its place
    drawBindings(top, actions, columns, label, pos, prompt, col = 0) {
        const many = columns.length > 1, listW = many ? 460 : 420, rowH = 31, x = VIEW_W / 2 - listW / 2;
        const nameW = many ? 164 : 0, cellW = many ? (listW - nameW - 8) / columns.length : 0;
        const cellX = c => x + nameW + c * cellW; // a column's left edge (several columns)
        const keys = (codes, right, cy) => { // right-aligned, first key leftmost
            let kx = right;
            for (const code of [...codes].reverse()) {
                const text = label(code);
                kx -= this.keycapWidth(text);
                this.keycap(text, kx, cy);
                kx -= 6;
            }
        };
        if (many) {
            columns.forEach((c, i) => this.text(c.title, cellX(i) + cellW / 2, top + 6,
                { size: 11, weight: 800, color: i === col ? INK : INK_DIM, align: "center", spacing: 3 }));
            top += 20;
        }
        const rows = [...actions, { name: "Reset to defaults" }];
        rows.forEach((row, n) => {
            const y = top + n * (rowH + 2), cy = y + rowH / 2;
            const selected = n === pos;
            this.card(x, y, listW, rowH, 8, selected, PIECE_COLORS[columns[col].accent].base, 4);
            const ink = selected ? INK : INK_DIM;
            if (!many) {
                const c = columns[0];
                if (!row.id) this.text(row.name.toUpperCase(), VIEW_W / 2, cy + 1, { size: 12, weight: 800, color: ink, align: "center", spacing: 3 });
                else {
                    this.text(row.name.toUpperCase(), x + 20, cy + 1, { size: 13, weight: 800, color: ink, spacing: 2 });
                    if (c.capturing === row.id) this.text(prompt, x + listW - 18, cy + 1, { size: 11, weight: 800, color: this.pulseInk(6), align: "right", spacing: 3 });
                    else keys(c.table[row.id], x + listW - 18, cy);
                }
                return;
            }
            this.text(row.id ? row.name.toUpperCase() : "DEFAULTS", x + 20, cy + 1, { size: 13, weight: 800, color: ink, spacing: 2 }); // each cell: RESET
            columns.forEach((c, i) => {
                const cx = cellX(i) + cellW / 2;
                if (selected && i === col) this.r.shape(cellX(i) + 3, y + 3, cellW - 6, rowH - 6,
                    { radius: 6, fill: "rgba(244,236,220,0.07)", stroke: "rgba(244,236,220,0.3)", lineWidth: 1 });
                const words = { size: 11, weight: 800, align: "center", spacing: 3 };
                if (!row.id) this.text("RESET", cx, cy + 1, { ...words, color: selected && i === col ? INK : INK_DIM });
                else if (c.capturing === row.id) this.text(prompt, cx, cy + 1, { ...words, color: this.pulseInk(6) });
                else if (!c.table[row.id]) this.text("SHARED", cx, cy + 1, { ...words, color: INK_FAINT });
                else { // centred in the cell
                    const w = c.table[row.id].reduce((w, code) => w + this.keycapWidth(label(code)) + 6, -6);
                    keys(c.table[row.id], cx + w / 2, cy);
                }
            });
        });
    }

    // Thin track beside a scrolling list of height h, with a thumb for the part in view (if any is
    // hidden); scroll and total in the same units
    drawScrollbar(x, top, h, scroll, total) {
        if (total <= h) return;
        const r = this.r;
        r.shape(x, top, 3, h, { radius: 1.5, fill: "rgba(244,236,220,0.08)" });
        r.shape(x, top + h * scroll / total, 3, h * h / total, { radius: 1.5, fill: "rgba(244,236,220,0.4)" });
    }

    // A scrolled list (SCROLLED_LISTS) of the menu screen step: its cards from top, clipped to the
    // height shown, with a scrollbar beside them
    drawScrolledList(step, items, top) {
        const { pos, rowH, gap, listH } = SCROLLED_LISTS[step], scroll = this.menuScroll[step].at;
        const r = this.r;
        r.save();
        r.clip(-VIEW_W, top - 1, VIEW_W * 3, listH + 2);
        this.drawMenuList(items, this[pos], top, rowH, gap, scroll);
        r.restore();
        this.drawScrollbar(VIEW_W / 2 + 210 + 10, top, listH, scroll, menuListHeight(items, rowH, gap));
    }

    // Eases the scrolled lists toward keeping their selected card in view
    updateMenuScroll(dt) {
        for (const [step, { items: listed, pos: posField, rowH, gap, listH }] of Object.entries(SCROLLED_LISTS)) {
            if (!listed && Number(step) !== this.menuStep) continue; // setup cards: only while they are shown
            const items = listed || this.setupItems();
            const s = this.menuScroll[step], pos = this[posField];
            const y = pos ? menuListHeight(items.slice(0, pos), rowH, gap) + gap : 0; // selected card's top
            const h = menuRowHeight(items[pos], rowH);
            let target = s.target;
            if (y < target) target = y;
            else if (y + h > target + listH) target = y + h - listH;
            const max = Math.max(0, menuListHeight(items, rowH, gap) - listH);
            s.target = Math.max(0, Math.min(target, max));
            s.at += (s.target - s.at) * (1 - Math.pow(0.7, dt));
            if (Math.abs(s.target - s.at) < 0.05) s.at = s.target;
        }
    }

    // Cards with an accent piece, name and description; the selected one is highlighted. Cards
    // with preview are a little taller and show the block style preview at the right; dimmed
    // ones draw their contents faintly (MENU_DIMMED_ALPHA), the card itself as usual.
    // scroll: logical units scrolled out above the top (fractional while easing)
    drawMenuList(items, selectedIndex, top, rowH = 64, gap = 10, scroll = 0) {
        const listW = 420, x = VIEW_W / 2 - listW / 2;
        let y = top - scroll;
        items.forEach((item, n) => {
            const selected = n === selectedIndex;
            const h = menuRowHeight(item, rowH);
            this.card(x, y, listW, h, 10, selected, PIECE_COLORS[item.accent].base, 5);
            if (item.dimmed) { this.r.save(); this.r.globalAlpha *= MENU_DIMMED_ALPHA; }
            if (item.preview) this.drawTilesetPreview(x + listW - PREVIEW_RIGHT, y + (h - CELL) / 2); // right of the name

            this.drawPieceCentered(item.accent, x + 50, y + h / 2, 13, selected ? "active" : "locked");
            if (item.value) { // a setting: a smaller name over its value
                this.text(item.name.toUpperCase(), x + 92, y + h / 2 - 9, { size: 14, weight: 800, color: selected ? INK : INK_DIM, spacing: 3 });
                this.text(item.value, x + 92, y + h / 2 + 10, { size: 16, weight: 700, color: selected ? INK : "rgba(244,236,220,0.75)" });
            } else {
                this.text(item.name.toUpperCase(), x + 92, y + h / 2 - 7, { size: 20, weight: 800, color: selected ? INK : INK_DIM, spacing: 3 });
                this.text(item.desc, x + 92, y + h / 2 + 14, { size: 12, weight: 500, color: selected ? INK_DIM : "rgba(244,236,220,0.35)" });
            }
            if (selected && !item.noArrow) this.text("▶", x + listW - 26, y + h / 2, { size: 14, color: this.pulseInk(10), align: "center" });
            if (item.dimmed) this.r.restore();
            y += h + gap;
        });
    }

    drawGame() {
        this.drawSide(this.ownBoard, this.motion, 0);
        if (this.layout.mini) this.drawMiniBoard(this.match.view.game);
        else if (this.match) this.drawSide(this.match.view, this.boardMotion(this.match.view), 1);
    }

    // The bot's field in the mini layout (touch controls): small at the foot of the right column,
    // under the NEXT pieces, flat and still, its blocks plain squares in their colours (the piece
    // in play lighter), with no panels, text or effects
    drawMiniBoard(game) {
        const r = this.r, { rightX: x0, sideW } = this.layout;
        const cell = sideW / WIDTH, y0 = this.boardY + this.boardH - (HEIGHT - this.wellTop) * cell;
        const fx = this.options.effects;
        r.shape(x0 - 3, y0 - 3, sideW + 6, this.boardY + this.boardH - y0 + 6, {
            radius: 5, fill: [6 / 255, 8 / 255, 22 / 255, fx ? 0.7 : 0.92],
            stroke: fx ? hsla(this.hue, 90, 82, 0.35) : "rgba(244,236,220,0.22)", lineWidth: 1,
        });
        const block = (row, col, color, alpha) => {
            if (row < this.wellTop || alpha <= 0) return;
            r.globalAlpha = alpha;
            r.rect(x0 + col * cell + 0.4, y0 + (row - this.wellTop) * cell + 0.4, cell - 0.8, cell - 0.8, color);
        };
        for (let i = this.wellTop; i < HEIGHT; i++) {
            const row = i + game.getDropOffset(i, this.tickPhase); // rows fall into place during a line clear
            for (let j = 0; j < WIDTH; j++) {
                if (!game.getCell(i, j)) continue;
                const item = game.getCellItem(i, j);
                block(row, j, item ? MESSAGE_GOLD : PIECE_COLORS[game.getCellColor(i, j)].base, game.getCellAlpha(i, j));
            }
        }
        const type = game.getCurPiece_type();
        if (type) {
            const color = PIECE_COLORS[game.getPieceColor()].light;
            for (const [i, j] of game.curCells[type][game.getCurPiece_rotation()]) {
                block(game.getCurPiece_row() + i, game.getCurPiece_col() + j, color, 1);
            }
        }
        r.globalAlpha = 1;
    }

    // A player's board group where its view is placed (view.gx): the field in its motion m, the
    // panels, in a match the garbage meter, the lines sent and (two players) whose it is, and the
    // banners. side: 0 for player 1, 1 for player 2
    drawSide(view, m, side) {
        const r = this.r, game = view.game, match = this.match;
        this.board = view;
        r.save();
        r.translate(view.gx, 0); // left of the other board in a versus match

        if (m.rx || m.ry || m.dx || m.dy || m.dz) this.drawBoardInMotion(m);
        else this.drawBoard(); // straight onto the screen, pixel-sharp
        this.drawParticles();  // confetti flies off the field: never tilted
        if (view.itemBursts.length) this.drawItemBursts();
        if (this.layout.compact) this.drawCompactPanels();
        else this.drawSidePanels();
        if (match) {
            if (game.sendsGarbage) this.drawGarbageMeter(game);
            if (game.itemsOn) this.drawItemGauge(view);
            this.drawAttackPopups(match.popups[side]);
            if (match.duo) this.drawPlayerTag("PLAYER " + (side + 1), deviceName(match.devices[side]));
            else if (!this.layout.mini) this.drawPlayerTag(side ? "BOT" : "PLAYER", side ? "LV " + match.level : "");
        }

        // Overlays
        if (match && match.result) {
            const draw = match.result === "draw", won = !draw && (match.result === "win") === (side === 0);
            const next = this.matchOver() ? "REMATCH" : "NEXT ROUND";
            const sub = this.gamepad.active ? `ROTATE  ${next}  ·  START  MENU` : this.touch.enabled ? `ROTATE  ${next}  ·  MENU  MENU`
                : `ENTER  ${next}  ·  ESC  MENU`;
            this.boardBanner(draw ? "DRAW" : won ? "VICTORY" : "DEFEAT", sub, 1, draw ? INK : PIECE_COLORS[won ? tetO : tetZ].base,
                null, false, this.matchNotes(game, side));
        } else if (game.isGameOver()) {
            const title = game.endTitle || "GAME OVER";
            const accent = title === "GRAND MASTER" ? PIECE_COLORS[tetO].base
                : title === "COMPLETE" ? PIECE_COLORS[tetI].base : PIECE_COLORS[tetZ].base;
            const sub = game.endSub || "ESC — BACK TO MENU";
            this.boardBanner(title, this.gamepad.active ? padWords(sub) : this.touch.enabled ? touchWords(sub) : sub, 1, accent, this.recordNote, this.recordNew, game.endNotes());
        }
        r.restore();
        this.board = this.ownBoard;
    }

    // Under a decided round's banner: how this side's game ended (TIME UP, LEVEL 200, ...), and in a
    // match of rounds the rounds won, this side's first
    matchNotes(game, side) {
        const m = this.match, notes = [];
        if (game.endTitle && !["VICTORY", "DEFEAT", "DRAW"].includes(game.endTitle)) notes.push(game.endTitle);
        if (game.versusWins > 1) {
            const score = `${m.wins[side]} – ${m.wins[1 - side]}`;
            notes.push(this.matchOver() ? `MATCH  ${score}` : `ROUND ${m.round}  ·  ${score}`);
        }
        return notes;
    }

    // Above the well, whose board it is (PLAYER n, or the bot) and a note: the device they play
    // with, or the bot's level
    drawPlayerTag(name, note) {
        this.text(name, BOARD_X, this.boardY - 26, { size: 18, weight: 800, color: INK, spacing: 3 });
        if (note) this.text(note, BOARD_X + BOARD_W, this.boardY - 25, { size: 11, weight: 700, color: INK_DIM, align: "right", spacing: 2 });
    }

    // Garbage waiting for a board, beside its well: a bar per attack, rising from the bottom, grey
    // while it may not rise yet (the Guideline's Garbage delay card)
    drawGarbageMeter(game) {
        const r = this.r, x = BOARD_X - 8 - METER_GAP - METER_W;
        r.shape(x, this.boardY, METER_W, this.boardH, { radius: 3, fill: "rgba(244,236,220,0.06)" });
        let y = this.boardY + this.boardH;
        for (const g of [...game.incoming, ...game.mirrorGarbage]) {
            const h = Math.min(g.lines * CELL, y - this.boardY);
            if (h <= 2) break;
            r.shape(x, y - h + 1, METER_W, h - 2, { radius: 3, fill: game.garbageReady(g) ? GARBAGE_METER : GARBAGE_METER_WAIT });
            y -= h;
        }
    }

    // The item gauge, right of a board's well (the garbage meter's twin): it fills in gold from the
    // bottom with the pieces towards the next item, full and pulsing while an item waits in the NEXT
    // box, faint while the side's attack is active on the other side (it doesn't fill then), and
    // flashes as an item comes (gaugeFlash)
    drawItemGauge(view) {
        const r = this.r, game = view.game, x = BOARD_X + BOARD_W + 8 + METER_GAP;
        r.shape(x, this.boardY, METER_W, this.boardH, { radius: 3, fill: "rgba(244,236,220,0.06)" });
        const h = this.boardH * clamp(view.gaugeShown, 0, 1);
        const pulse = game.nextItem ? 0.5 + 0.5 * Math.sin(this.clock / 6) : 0;
        const alpha = game.attacking() ? 0.35 : 0.75 + 0.25 * pulse;
        if (h > 2) r.shape(x, this.boardY + this.boardH - h, METER_W, h, { radius: 3, fill: goldAlpha(alpha) });
        for (let k = 1; k < 4; k++) r.rect(x, this.boardY + this.boardH * k / 4, METER_W, 1, "rgba(4,5,14,0.6)"); // quarters
        if (view.gaugeFlash > 0) {
            r.save();
            r.blendMode = "add";
            r.globalAlpha = view.gaugeFlash / ITEM_GAUGE_FLASH * Math.min(1, this.options.effectScale) * (0.6 + 0.4 * Math.sin(view.gaugeFlash * 0.8));
            r.shape(x - 3, this.boardY - 3, METER_W + 6, this.boardH + 6, { radius: 5, fill: MESSAGE_GOLD });
            r.restore();
        }
    }

    // Lines a player sent (popups): "+4" fading, in the right column under the clear message that
    // sent it (popupTop, from drawSidePanels()), settling up into place; in the compact layout, whose
    // column has no room, rising from the upper part of the well
    drawAttackPopups(popups) {
        const r = this.r, compact = this.layout.compact;
        for (const p of popups) {
            const text = "+" + p.lines;
            const k = 1 - p.life / ATTACK_LIFE, size = 34 + 4 * Math.min(p.lines, 6);
            const style = { size, weight: 900, color: MESSAGE_GOLD, align: compact ? "center" : "left", spacing: 2 };
            r.save();
            r.globalAlpha = Math.min(1, p.life / 15);
            if (compact) this.text(text, BOARD_X + BOARD_W / 2, this.boardY + this.boardH * 0.3 - 50 * k, style);
            else {
                const y = Math.min(this.board.popupTop + 8 + size / 2, this.boardY + this.boardH - size / 2);
                this.text(text, RIGHT_X, y + 16 * Math.pow(1 - Math.min(1, k * 4), 2), style);
            }
            r.restore();
        }
    }

    // Strength of the board glow: the shadow's alpha times the frame's fill alpha
    boardGlowAlpha() {
        return (0.4 + 0.35 * this.pulse) * (this.options.effects ? 0.55 : 0.92);
    }

    drawBoard() {
        const r = this.r;
        const game = this.board.game;

        // Frame (the backdrop pass has drawn its glow and the rings)
        const frame = [BOARD_X - 8, this.boardY - 8, BOARD_W + 16, this.boardH + 16];
        const exam = game.exam && game.exam.kind === "promotion"; // a gold frame, as in the arcade
        if (this.theme.frame) this.theme.frame(this, frame, exam);
        else {
            const fx = this.options.effects;
            r.shape(...frame, { radius: 12, fill: [6 / 255, 8 / 255, 22 / 255, fx ? 0.55 : 0.92] });
            // glass sheen: lighter toward the top, tinted by the backdrop colour
            r.shape(...frame, {
                radius: 12,
                fill: [hsla(this.hue, 80, 70, 0.10), hsla(this.hue, 80, 50, 0.02)],
                fillY: [this.boardY, this.boardY + this.boardH],
                stroke: exam ? goldAlpha(0.6 + 0.35 * this.pulse) : fx ? hsla(this.hue, 90, 82, 0.45 + 0.4 * this.pulse) : "rgba(244,236,220,0.22)",
                lineWidth: 1.5,
            });

            // Well grid
            const grid = "rgba(160,170,255,0.06)";
            for (let c = 1; c < WIDTH; c++) r.rect(BOARD_X + c * CELL, this.boardY, 1, this.boardH, grid);
            for (let row = 1; row < HEIGHT - this.wellTop; row++) r.rect(BOARD_X, this.boardY + row * CELL, BOARD_W, 1, grid);
        }

        const cells = game.curCells[game.getCurPiece_type()][game.getCurPiece_rotation()]; // big in Shirase's roll
        const color = game.getPieceColor(); // the piece in play's colour index
        // Also show the two rows above the well, where pieces spawn (not for GB: they spawn inside)
        const firstRow = game.firstDrawnRow;
        const col = game.getCurPiece_col();

        // Pieces and stack are cut off by the well's frame, so the spawn rows show in the margin
        // above the grid up to the border
        r.save();
        r.clip(...frame);

        // Draw Shadow
        for (const [i, j] of cells) {
            const row = game.getShadowRow() + i;
            if (row >= firstRow) this.drawBlock(color, this.cellX(col + j), this.cellY(row), CELL, "ghost");
        }

        // Draw Field
        if (this.options.effects && this.options.trail) {
            this.drawLineDropTrails(firstRow);
            for (const f of this.board.dropFlashes) this.drawDropTrail(f);
        }
        for (let i = firstRow; i < HEIGHT; i++) {
            const y = this.cellY(i + game.getDropOffset(i, this.tickPhase)); // rows fall into place during a line clear
            for (let j = 0; j < WIDTH; j++) {
                const alpha = game.getCellAlpha(i, j); // TGM3 and TAP staff roll: blocks fade or vanish
                if (alpha <= 0) continue;
                r.globalAlpha = alpha;
                this.drawBlock(game.getCellColor(i, j), this.cellX(j), y, CELL, "locked", this.options.tileset, false);
            }
            r.globalAlpha = 1;
        }
        // their lights after them, in one go (one blend mode and texture for the whole stack)
        for (let i = firstRow; i < HEIGHT; i++) {
            const y = this.cellY(i + game.getDropOffset(i, this.tickPhase));
            for (let j = 0; j < WIDTH; j++) {
                const alpha = game.getCellAlpha(i, j);
                if (alpha <= 0) continue;
                r.globalAlpha = alpha;
                this.drawLights(game.getCellColor(i, j), this.cellX(j), y, CELL);
                const item = game.getCellItem(i, j); // versus items, TAP Normal's, Sakura's jewels
                if (item) this.drawItemMark(this.cellX(j), y, CELL, item);
            }
            r.globalAlpha = 1;
        }

        if (this.options.border) this.drawStackBorder(firstRow);

        // Draw current Piece: the highlight fades from "active" to "locked" as the
        // lock delay runs out, and comes back whenever a move resets the delay
        const lockLeft = 1 - Math.min(1, game.curPiece_lockDelay / game.lockDelayMax);
        if (this.board.enterGlow > 0) { // it came from hold: glows as the held one flashes
            const shown = cells.map(([i, j]) => [this.rev ? -i : i, j]); // as on screen (Rev: upside down)
            const x = this.cellX(col + Math.min(...cells.map(([, j]) => j)));
            const y = Math.min(...cells.map(([i]) => this.cellY(game.getCurPiece_row() + i)));
            this.drawPieceGlow(shown, color, CELL, x, y, this.holdFlashAlpha(this.board.enterGlow));
        }
        for (const [i, j] of cells) {
            const row = game.getCurPiece_row() + i;
            if (row < firstRow) continue;
            const x = this.cellX(col + j), y = this.cellY(row);
            if (lockLeft < 1) {
                this.drawBlock(color, x, y, CELL, "locked", this.options.tileset, false);
                r.globalAlpha = 1 - lockLeft; // the lights cross-fade too, rather than add up
                this.drawLights(color, x, y, CELL, "locked");
            }
            r.globalAlpha = lockLeft;
            this.drawBlock(color, x, y, CELL, "active");
            r.globalAlpha = 1;
            if (game.pieceItem) this.drawItemMark(x, y, CELL, game.pieceItem);
        }
        r.restore();

        this.drawDropFlashes();
        this.drawFlashes();
        if (game.inStartDelay()) this.drawCountdown(game); // part of the field: flies in with it
        if (game.cutIn > 0) this.drawCutIn(game);
    }

    // TGM-style border: a light line along every side of the settled stack that faces an empty
    // cell, drawn on the block's own edge so it never reaches outside the stack; none along the
    // walls and floor. Rows falling during a line clear are outlined on their own, and blocks
    // fading in the staff roll take their border with them
    drawStackBorder(firstRow) {
        const r = this.r, game = this.board.game, w = STACK_BORDER_W, c = STACK_BORDER_COLOR;
        // empty beside a block of a row drawn at offset off: inside the well with nothing visible
        // there (or a block of a row falling apart from it); above the drawn rows counts as empty
        const open = (i, j, off) => j >= 0 && j < WIDTH && i < HEIGHT &&
            (i < firstRow || !game.getCell(i, j) || game.getCellAlpha(i, j) <= 0 || game.getDropOffset(i, this.tickPhase) !== off);
        for (let i = firstRow; i < HEIGHT; i++) {
            const off = game.getDropOffset(i, this.tickPhase), y = this.cellY(i + off);
            for (let j = 0; j < WIDTH; j++) {
                if (open(i, j, off)) continue;
                const x = this.cellX(j);
                r.globalAlpha = game.getCellAlpha(i, j);
                const up = this.rev ? 1 : -1; // the row drawn above (Rev: upside down)
                const top = open(i + up, j, off), bottom = open(i - up, j, off);
                if (top) r.rect(x, y, CELL, w, c);
                if (bottom) r.rect(x, y + CELL - w, CELL, w, c);
                // side lines stop short of the top and bottom lines, so corners aren't drawn twice
                const y0 = top ? y + w : y, y1 = bottom ? y + CELL - w : y + CELL;
                if (open(i, j - 1, off)) r.rect(x, y0, w, y1 - y0, c);
                if (open(i, j + 1, off)) r.rect(x + CELL - w, y0, w, y1 - y0, c);
                // inner corners: both neighbours filled, the cell between them empty
                for (let di = -1; di <= 1; di += 2) {
                    if (open(i + di, j, off)) continue;
                    const cy = di === up ? y : y + CELL - w;
                    if (!open(i, j - 1, off) && open(i + di, j - 1, off)) r.rect(x, cy, w, w, c);
                    if (!open(i, j + 1, off) && open(i + di, j + 1, off)) r.rect(x + CELL - w, cy, w, w, c);
                }
            }
        }
        r.globalAlpha = 1;
    }

    // Style of one clear message line: bigger clears and longer combos get bigger, warmer type
    messageStyle(action) {
        switch (action.kind) {
            case "clear":
                return action.value === 4
                    ? { size: 36, color: PIECE_COLORS[tetI].light, glow: PIECE_COLORS[tetI].base }
                    : { size: 20 + 2 * action.value, color: INK };
            case "tspin":
                return { size: 28 + 2 * action.value, color: PIECE_COLORS[tetT].light, glow: PIECE_COLORS[tetT].base };
            case "b2b":
                return { size: 13, color: MESSAGE_GOLD, spacing: 5 };
            case "pc":
            case "grade":
                return { size: 30, color: MESSAGE_GOLD, glow: MESSAGE_GOLD };
            case "combo": {
                const c = Math.min(action.value, COMBO_COLORS.length - 1);
                return { size: 18 + 4 * Math.min(action.value, 7), color: COMBO_COLORS[c], glow: action.value >= 3 ? COMBO_COLORS[c] : null };
            }
        }
        return { size: 20, color: INK };
    }

    // Clear names in the right column, starting at top (below the next pieces), or centred over the
    // well in the compact layout: pop in, then fade out. Back-to-back sits above the clear name;
    // combo and perfect clear below it.
    // Returns the y below it (its lines at their resting size), or top with none showing
    drawClearMessage(top) {
        const game = this.board.game;
        const age = game.actionAge + this.tickPhase; // frames, and how far into the next one
        if (!game.actions.length || age >= MESSAGE_LIFE) return top;
        const r = this.r;
        const c = this.messageTexture(game.actions);
        const alpha = Math.min(1, (MESSAGE_LIFE - age) / 25);
        const pop = 1 + (MESSAGE_POP_MAX - 1) * Math.max(0, 1 - age / 8);
        r.save();
        r.globalAlpha = alpha;
        r.translate(this.layout.compact ? BOARD_X + BOARD_W / 2 : RIGHT_X, top);
        r.scale(pop);
        r.image(c.tex, -c.pad - c.anchor, -c.pad, c.tex.w / c.res, c.tex.h / c.res);
        r.restore();
        return top + c.height;
    }

    // The message lines with their shadows, rendered into a texture once per set of
    // actions. Sharp up to the biggest pop scale.
    messageTexture(actions) {
        const cached = this.board.messageCache;
        if (cached && cached.actions === actions && cached.count === actions.length) return cached;
        const pad = 40; // room for the shadows
        const res = this.pixelScale * MESSAGE_POP_MAX;
        const order = { b2b: 0, clear: 1, tspin: 1, combo: 2, pc: 3, grade: 4 };
        const lines = [...actions].sort((a, b) => order[a.kind] - order[b.kind]).map(a => ({ a, s: this.messageStyle(a) }));
        const canvas = document.createElement("canvas");
        const g = canvas.getContext("2d");
        // the column's width, or the well's (compact: centred over it)
        const compact = this.layout.compact;
        const w = compact ? BOARD_W - 24 : SIDE_W, anchor = compact ? w / 2 : 0, align = compact ? "center" : "left";
        // shrink lines that would be wider than that
        let height = 0;
        for (const { a, s } of lines) {
            g.font = `900 ${s.size}px ${FONT}`;
            g.letterSpacing = (s.spacing ?? 2) + "px";
            const width = g.measureText(a.text).width;
            if (width > w) s.size = Math.floor(s.size * w / width);
            height += s.size * 1.15;
        }
        canvas.width = Math.ceil((w + pad * 2) * res);
        canvas.height = Math.ceil((height + pad * 2) * res);

        g.scale(res, res);
        g.translate(pad, pad);
        let y = 0;
        for (const { a, s } of lines) {
            y += s.size * 0.575;
            // dark halo for legibility over the stack, then the coloured glow
            // (shadow blur is in canvas pixels: scale it like the main canvas would)
            const shadows = [["rgba(0,0,0,0.85)", 10]];
            if (s.glow) shadows.push([s.glow, 8 + s.size / 3]);
            for (const [color, blur] of shadows) {
                g.shadowColor = color;
                g.shadowBlur = blur * MESSAGE_POP_MAX;
                fillText2D(g, a.text, anchor, y, { size: s.size, weight: 900, color: s.color, spacing: s.spacing ?? 2, align });
            }
            y += s.size * 0.575;
        }
        if (cached) this.r.releaseTexture(cached.tex);
        this.board.messageCache = { actions, count: actions.length, tex: this.r.texture(canvas), pad, res, anchor, height };
        return this.board.messageCache;
    }

    // The held piece in the HOLD box. Once a piece has been held (the hold is spent until the
    // next piece enters, game.canHold), it is desaturated to the neutral grey and faded
    drawHeldPiece(cx, cy, size) {
        const game = this.board.game, spent = !game.canHold;
        if (spent) { this.r.save(); this.r.globalAlpha *= MENU_DIMMED_ALPHA; }
        this.drawPieceCentered(game.getHeldPiece(), cx, cy, size, "locked", game, false, this.holdFlashAlpha(), spent);
        if (spent) this.r.restore();
    }

    drawSidePanels() {
        const game = this.board.game;

        // HOLD (TAP has none)
        if (game.hasHold) {
            this.label("HOLD", LEFT_X, this.boardY + 4, SIDE_W);
            this.panel(LEFT_X, this.boardY + 18, SIDE_W, 110);
            this.drawHeldPiece(LEFT_X + SIDE_W / 2, this.boardY + 18 + 55, 24);
        }

        // STATS
        // First entry is the rule set (name) and its mode (value), shown under a RULESET label
        // placed as for the standard well: a shorter one (GB) would leave five rows no room above the wordmark
        let y = BOARD_Y + 170;
        const stats = game.getStats();
        const step = stats.length > 4 ? 70 : 80; // five rows must still clear the wordmark
        stats.forEach(([name, value], n) => {
            if (n === 0) {
                // both shrunk to the panel width if needed ("WORLD VS DEFENCE"); the letter spacing doesn't shrink
                const fit = (s, max) => {
                    const glyphs = this.measureText(s, max, 800);
                    return Math.min(max, Math.floor(max * (SIDE_W - (this.measureText(s, max, 800, 3) - glyphs)) / glyphs));
                };
                this.label("RULESET", LEFT_X, y, SIDE_W);
                this.text(name, LEFT_X, y + 32, { size: fit(name, 20), weight: 800, color: INK, spacing: 3 });
                this.text(value, LEFT_X, y + 54, { size: fit(value, 14), weight: 800, color: INK_DIM, spacing: 3 });
                y += step + 14; // the mode line takes the extra room
                return;
            }
            this.label(name, LEFT_X, y, SIDE_W);
            // numbers (time, score, level, lines) glyph by glyph, words like grades whole
            if (NUMERIC_TEXT.test(value)) {
                this.textRun(value, LEFT_X, y + 32, { size: 28, weight: 800, color: INK, spacing: 1 });
            } else { // shrunk to the panel width if needed ("Grand Master")
                const size = Math.min(28, Math.floor(28 * SIDE_W / this.measureText(value, 28, 800, 1)));
                this.text(value, LEFT_X, y + 32, { size, weight: 800, color: INK, spacing: 1 });
            }
            y += step;
        });

        // Wordmark (not in a match: versus stats take its room)
        if (!this.match) {
            this.colorStripe(LEFT_X, this.boardY + this.boardH - 26, 70, 3);
            this.text("QUADBRICKS", LEFT_X, this.boardY + this.boardH - 6, { size: 18, weight: 900, color: INK_DIM, spacing: 5 });
        }

        // NEXT (none with the Guideline's previews off)
        if (game.nextCount > 0) {
            this.label("NEXT", RIGHT_X, this.boardY + 4, SIDE_W);
            this.panel(RIGHT_X, this.boardY + 18, SIDE_W, 110);
            this.drawPieceCentered(game.rnd_get_queue(0), RIGHT_X + SIDE_W / 2, this.boardY + 18 + 55, 24, "locked", game, game.nextItem);
        }
        // the rest of the rule set's preview, tighter when there are more than two
        // (none for TAP's single next piece)
        const rest = game.nextCount - 1;
        // versus: the lines a clear sent show under its message (popupTop, drawAttackPopups)
        if (game.nextCount === 0) {
            this.board.popupTop = this.drawClearMessage(this.boardY + 20);
        } else if (rest > 0) {
            const spacing = rest > 2 ? 50 : 80, size = rest > 2 ? 16 : 18;
            const listH = rest * spacing + 10;
            this.panel(RIGHT_X, this.boardY + 140, SIDE_W, listH);
            for (let n = 1; n <= rest; n++) {
                const y = this.boardY + 140 + 5 + spacing / 2 + (n - 1) * spacing;
                this.drawPieceCentered(game.rnd_get_queue(n), RIGHT_X + SIDE_W / 2, y, size, "locked", game);
            }
            this.board.popupTop = this.drawClearMessage(this.boardY + 140 + listH + 30);
        } else {
            this.board.popupTop = this.drawClearMessage(this.boardY + 140 + 20);
        }
        this.drawGameBest(RIGHT_X, SIDE_W, this.boardY + this.boardH - 6, false); // level with the wordmark
    }

    // The compact layout's columns: HOLD over the stats on the left, NEXT and the rest of the
    // preview on the right; clear messages show over the well
    drawCompactPanels() {
        const game = this.board.game;
        const { leftX, rightX, sideW } = this.layout;
        const box = 64, size = 14; // HOLD and first NEXT panels, and their pieces
        const top = this.boardY + 4;
        // type size for a value, shrunk to the column (measured with zeros, so numbers don't change size as they count)
        const fitted = (s, max) => Math.min(max, Math.floor(max * sideW / this.measureText(s.replace(/\d/g, "0"), max, 800, 1)));

        let y = top;
        if (game.hasHold) {
            this.label("HOLD", leftX, y, sideW, 10, 3);
            this.panel(leftX, y + 12, sideW, box);
            this.drawHeldPiece(leftX + sideW / 2, y + 12 + box / 2, size);
            y += 12 + box + 28;
        }
        game.getStats().forEach(([name, value], n) => {
            if (n === 0) { // rule set and mode
                this.label("RULESET", leftX, y, sideW, 9, 2);
                this.text(name, leftX, y + 18, { size: fitted(name, 14), weight: 800, color: INK, spacing: 1 });
                this.text(value, leftX, y + 34, { size: fitted(value, 10), weight: 800, color: INK_DIM, spacing: 1 });
                y += 58;
                return;
            }
            this.label(name, leftX, y, sideW, 9, 2);
            const opts = { size: fitted(value, 18), weight: 800, color: INK, spacing: 1 };
            if (NUMERIC_TEXT.test(value)) this.textRun(value, leftX, y + 20, opts);
            else this.text(value, leftX, y + 20, opts);
            y += 46;
        });

        if (game.nextCount > 0) {
            this.label("NEXT", rightX, top, sideW, 10, 3);
            this.panel(rightX, top + 12, sideW, box);
            this.drawPieceCentered(game.rnd_get_queue(0), rightX + sideW / 2, top + 12 + box / 2, size, "locked", game, game.nextItem);
        }
        const rest = game.nextCount - 1;
        if (rest > 0) {
            const spacing = rest > 2 ? 42 : 50, listTop = top + 12 + box + 10;
            this.panel(rightX, listTop, sideW, rest * spacing + 8);
            for (let n = 1; n <= rest; n++) {
                this.drawPieceCentered(game.rnd_get_queue(n), rightX + sideW / 2, listTop + 4 + spacing * (n - 0.5), rest > 2 ? 11 : 12, "locked", game);
            }
        }
        this.drawGameBest(rightX, sideW, this.boardY + this.boardH - 6, true);
        this.drawClearMessage(this.boardY + this.boardH * 0.3);
    }

    // Start countdown 3, 2, 1: each digit slides in and fades out within its second, the
    // band fades with the last one, so both are gone on the first frame that takes input
    drawCountdown(game) {
        const digit = game.countdown();
        if (!digit) return;
        const left = game.startdelayMax - game.startdelayCounter; // frames until the game takes input
        // 0..1 within the digit (the "3" also shows before the first frame, as its first frame)
        // (plus how far the display is into the next frame)
        const t = Math.min(1, 1 - (Math.min(left, game.startdelayMax - 1) % COUNTDOWN_STEP_FRAMES - this.tickPhase) / (COUNTDOWN_STEP_FRAMES - 1));
        const fadeIn = Math.min(1, t / 0.15), fadeOut = Math.min(1, (1 - t) / 0.25);
        const band = digit > 1 ? 1 : Math.min(1, (left + 1 - this.tickPhase) / 12);
        const r = this.r;
        const cy = this.bandY();
        const accent = COUNTDOWN_COLORS[digit];
        r.save();
        r.globalAlpha = band;
        this.drawBand(cy, 92, accent);
        r.globalAlpha = fadeIn * fadeOut;
        const slide = (1 - fadeIn) * (1 - fadeIn) * -14;
        this.text(String(digit), BOARD_X + BOARD_W / 2, cy + slide, { size: 64, weight: 900, color: accent, align: "center" });
        r.restore();
    }

    // A versus attack item's cut-in on the side it hit, while that side stands still: a band opening
    // across the well in the item's colour, its emblem (items.js) popping in with a ring spreading
    // behind it, its name sliding in under it, then all fading
    drawCutIn(game) {
        const r = this.r, cy = this.bandY(), item = game.cutInItem;
        const t = clamp(1 - (game.cutIn - this.tickPhase) / VS_CUTIN_FRAMES, 0, 1);
        const fadeIn = Math.min(1, t / 0.2), fadeOut = Math.min(1, (1 - t) / 0.2);
        const art = ITEM_ART[item], color = PIECE_COLORS[art ? art.color : tetO].light;
        const open = 1 - Math.pow(1 - Math.min(1, t / 0.15), 3);
        const cx = BOARD_X + BOARD_W / 2, ey = cy - CUTIN_EMBLEM_Y;
        r.save();
        r.globalAlpha = fadeOut;
        this.drawBand(cy, Math.max(4, CUTIN_BAND_H * open), color);
        if (art) {
            const fx = this.options.effectScale, ring = clamp((t - 0.08) / 0.45, 0, 1);
            if (fx && ring > 0 && ring < 1) { // spreading behind the emblem
                const rad = CUTIN_EMBLEM * (0.45 + 0.75 * (1 - Math.pow(1 - ring, 2)));
                r.save();
                r.blendMode = "add";
                r.globalAlpha = fadeOut * (1 - ring) * 0.8 * Math.min(1, fx);
                r.shape(cx - rad, ey - rad, rad * 2, rad * 2, { radius: rad, stroke: color, lineWidth: 2 + 6 * (1 - ring) });
                r.restore();
            }
            const pop = clamp((t - 0.04) / 0.2, 0, 1);
            if (pop > 0) { // in with an overshoot, flashing white as it lands
                const back = 1 + 2.70158 * Math.pow(pop - 1, 3) + 1.70158 * Math.pow(pop - 1, 2);
                const emblem = this.itemEmblem(item), size = emblem.size * back;
                r.globalAlpha = fadeOut * pop;
                r.image(emblem.tex, cx - size / 2, ey - size / 2, size, size);
                if (pop < 1 && fx) {
                    r.save();
                    r.blendMode = "add";
                    r.globalAlpha = fadeOut * (1 - pop) * 0.7;
                    r.image(emblem.tex, cx - size / 2, ey - size / 2, size, size);
                    r.restore();
                }
            }
        }
        const name = item || "", room = BOARD_W - 24;
        const size = Math.min(26, Math.floor(26 * room / this.measureText(name, 26, 900, 2)));
        const slide = (1 - fadeIn) * (1 - fadeIn) * 90; // from the right
        r.globalAlpha = Math.min(fadeIn, fadeOut);
        this.text(name, cx + slide, art ? cy + CUTIN_BAND_H / 2 - 30 : cy, { size, weight: 900, color, align: "center", spacing: 2 });
        r.restore();
    }

    // Centre line of the bands across the well, a little above its middle
    bandY() {
        return this.boardY + this.boardH * 0.42;
    }

    // Dark band across the well, h high around cy, with a line of the accent colour at each edge
    drawBand(cy, h, accent) {
        const r = this.r;
        r.rect(BOARD_X - 8, cy - h / 2, BOARD_W + 16, h, "rgba(4,5,14,0.82)");
        r.rect(BOARD_X - 8, cy - h / 2, BOARD_W + 16, 2, accent);
        r.rect(BOARD_X - 8, cy + h / 2 - 2, BOARD_W + 16, 2, accent);
    }

    // Horizontal banner across the well (GAME OVER and other endings)
    // note: a line under the sub-title (the game over's record); highlight: a record was set,
    // so the note gets a pulsing gold pill; lines: more lines between them (the game's endNotes)
    boardBanner(title, sub, alpha, accent = INK, note = null, highlight = false, lines = []) {
        const r = this.r;
        const cy = this.bandY();
        const linesH = BANNER_LINE_H * lines.length;
        const noteH = (note ? (highlight ? 30 : 16) : 0) + linesH;
        r.save();
        r.globalAlpha = alpha;
        this.drawBand(cy + noteH / 2, sub ? 96 + noteH : 70, accent);
        // long titles ("GRAND MASTER") shrink to the board width
        const size = Math.min(34, Math.floor(34 * (BOARD_W - 16) / this.measureText(title, 34, 900, 8)));
        this.text(title, BOARD_X + BOARD_W / 2, cy - (sub ? 12 : 0), { size, weight: 900, color: accent === INK ? INK : accent, align: "center", spacing: 8 });
        if (sub) this.text(sub, BOARD_X + BOARD_W / 2, cy + 26, { size: 11, weight: 700, color: INK_DIM, align: "center", spacing: 3 });
        lines.forEach((line, n) => {
            const lineSize = Math.min(11, Math.floor(11 * (BOARD_W - 16) / this.measureText(line, 11, 800, 3)));
            this.text(line, BOARD_X + BOARD_W / 2, cy + 26 + BANNER_LINE_H * (n + 1), { size: lineSize, weight: 800, color: INK, align: "center", spacing: 3 });
        });
        if (note && highlight) {
            const pulse = 0.5 + 0.5 * Math.sin(this.clock / 14);
            const w = this.measureText(note, 15, 900, 5) + 32, h = 26, y = cy + 52 + linesH;
            r.shape(BOARD_X + (BOARD_W - w) / 2, y - h / 2, w, h, {
                radius: h / 2, fill: goldAlpha(0.12 + 0.1 * pulse), stroke: goldAlpha(0.55 + 0.45 * pulse), lineWidth: 1.5,
            });
            this.text(note, BOARD_X + BOARD_W / 2, y, { size: 15, weight: 900, color: MESSAGE_GOLD, align: "center", spacing: 5 });
        } else if (note) this.text(note, BOARD_X + BOARD_W / 2, cy + 46 + linesH, { size: 11, weight: 800, color: MESSAGE_GOLD, align: "center", spacing: 3 });
        r.restore();
    }
}
