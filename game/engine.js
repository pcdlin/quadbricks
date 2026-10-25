// Port of the original C++ game's engine: 60 fps fixed timestep (17/17/16 ms pattern)
// and SDL-style input bitmap; animation and drawing follow the display's refresh rate. Rendering is a modern redesign (night-gallery
// look inspired by Tetris Forever) drawn with WebGL (renderer.js, backdrop.js) in
// resolution-independent logical units; piece colours are sampled from the original
// tile graphics.

const STATE_MENU = 0, STATE_GAME = 1;

const VERSION = "0.3"; // shown in the top left corner

// Game keys are bound in options.js; menus always use these (KeyboardEvent.code)
const MENU_KEYS = ["Escape", "Enter", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
// Menu keys the OS key repeat applies to while held (fast scrolling); games ignore it
const MENU_REPEAT_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
// Hidden TGM1, TGM3 and TAP test setups on Ctrl+Shift+digit, not shown anywhere in the game
const TEST_KEYS = { Digit1: "roll", Digit2: "invisible", Digit3: "gm", Digit4: "rollend", Digit5: "kill" };

// Input bitmap bits per bound action
const PUSH_BITS = { left: LEFT_PUSH, right: RIGHT_PUSH, hard: HARD_PUSH, soft: SOFT_PUSH, rotl: ROTL_PUSH, rotr: ROTR_PUSH, hold: HOLD_PUSH };
const RELEASE_BITS = { left: LEFT_RELEASE, right: RIGHT_RELEASE, soft: SOFT_RELEASE, rotl: ROTL_RELEASE, rotr: ROTR_RELEASE, hold: HOLD_RELEASE };

// Menu screens
const MENU_MAIN = 0, MENU_RULES = 1, MENU_MODES = 2, MENU_OPTIONS = 3, MENU_CONTROLS = 4, MENU_VISUALS = 5, MENU_HANDLING = 6, MENU_SETUP = 7;
const MENU_DEPTH = [0, 1, 2, 1, 2, 2, 2, 3];   // by screen; deeper = slide in from the right
const MENU_SLIDE_MS = 220, MENU_SLIDE_DIST = 120;

const RESTART_ITEM = { name: "Restart", desc: "Start the current game over", accent: tetL, restart: true };
const MAIN_ITEMS = [
    { name: "New Game", desc: "Choose a rule set and mode", accent: tetT, screen: MENU_RULES },
    { name: "Options", desc: "Controls, visuals and Guideline handling", accent: tetS, screen: MENU_OPTIONS },
];

// Start step 3 (MENU_SETUP), for modes with `setup`: setting cards changed with ← →, each choosing
// one of its labels for a RuleGame argument: arg "variant" (the label's entry in values), or
// "startLevel" and "height" (the label's index). Remembered per mode for the session (setupChoices)
const indexLabels = count => Array.from({ length: count }, (_, i) => String(i));
const levelSetup = count => ({ name: "Level", accent: tetT, arg: "startLevel", labels: indexLabels(count) });
const HEIGHT_SETUP = { name: "Height", accent: tetZ, arg: "height", labels: indexLabels(GB_B_HEIGHTS) };
const GOAL_SETUP = { name: "Goal", accent: tetO, arg: "variant", labels: ["150 lines", "Endless"], values: ["marathon", "standard"] };

// Start step 1: rule sets; step 2: their sub-modes; step 3 for modes with setup cards (above). See rules.js
// The "death" and "test" variants still exist in rules.js but aren't offered (TAP's Death mode is)
const RULESETS = [
    { name: "Guideline", accent: tetT, desc: "SRS, 7-bag, T-spins and back-to-backs",
      modes: [
          { name: "Marathon", mode: guideline, variant: "marathon", setup: [GOAL_SETUP], accent: tetO, desc: "Clear 150 lines, or keep going" },
          { name: "Sprint", mode: guideline, variant: "sprint", accent: tetL, desc: "Clear 40 lines as fast as you can" },
          { name: "Ultra", mode: guideline, variant: "ultra", accent: tetZ, desc: "Score as much as you can in two minutes" },
      ] },
    { name: "TGM1", accent: tetZ, desc: "ARS, no hard or sonic drop, no hold",
      modes: [
          { name: "Master", mode: tgmOriginal, variant: "standard", accent: tetT, desc: "Up to level 999, grades 9 to S9, GM by checkpoints" },
          { name: "20G", mode: tgmOriginal, variant: "20g", accent: tetZ, desc: "Master mode at 20G from the start" },
      ] },
    { name: "TGM2 TAP", accent: tetI, desc: "ARS, sonic drop, no hold",
      modes: [
          { name: "Master", mode: tgmTap, variant: "standard", accent: tetT, desc: "Up to level 999, grades 9 to GM" },
          { name: "Death", mode: tgmTap, variant: "death", accent: tetZ, desc: "20G from the start, M at 500, GM at 999" },
      ] },
    { name: "TGM3 TI", accent: tetL, desc: "Master mode — up to level 999",
      modes: [
          { name: "World", mode: arika, variant: "standard", accent: tetL, desc: "Arika SRS, hard drop, limited lock resets" },
          { name: "Classic", mode: tgmClassic, variant: "standard", accent: tetJ, desc: "Arika Rotation System, sonic drop" },
      ] },
    { name: "NES", accent: tetJ, desc: "NES (1989) — no hard drop, no hold, no kicks",
      modes: [
          { name: "A-Type", mode: nesTetris, variant: "standard", setup: [levelSetup(NES_START_LEVELS)], accent: tetL, desc: "Endless, faster every 10 lines, top speed at level 29" },
          { name: "B-Type", mode: nesTetris, variant: "btype", setup: [levelSetup(NES_START_LEVELS), HEIGHT_SETUP], accent: tetS, desc: "Clear 25 lines, starting over garbage" },
      ] },
    { name: "GB", accent: tetO, desc: "GB (1989) — no hard drop, no hold, no kicks",
      modes: [
          { name: "A-Type", mode: gameBoy, variant: "standard", setup: [levelSetup(GB_START_LEVELS)], accent: tetL, desc: "Endless, faster every 10 lines up to level 20" },
          { name: "B-Type", mode: gameBoy, variant: "btype", setup: [levelSetup(GB_START_LEVELS), HEIGHT_SETUP], accent: tetS, desc: "Clear 25 lines, starting over garbage" },
      ] },
];
const OPTIONS_ITEMS = [
    { name: "Controls", desc: "Change key bindings", accent: tetS, screen: MENU_CONTROLS },
    { name: "Visuals", desc: "Block style, scale, effects, backdrop and motion", accent: tetT, screen: MENU_VISUALS },
    { name: "Guideline", desc: "Handling for the Guideline modes: DAS, ARR, soft drop…", accent: tetL, screen: MENU_HANDLING },
];
// Settings changed with ← →, by screen; descriptions show the current setting (optionValue())
// (preview: the card is a little taller and shows the block style preview at its right)
const VISUAL_ITEMS = [
    { id: "tileset", name: "Block style", accent: tetO, preview: true },
    { id: "scale", name: "Scale", accent: tetL },
    { id: "effects", name: "Effects", accent: tetT },
    { id: "backdrop", name: "Backdrop", accent: tetJ },
    { id: "rings", name: "Clear rings", accent: tetZ },
    { id: "tilt", name: "3D tilt", accent: tetI },
    { id: "shake", name: "Drop shake", accent: tetS },
    { id: "trail", name: "Drop trail", accent: tetT },
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
    // action: Enter does it, ← → do nothing; the card shows desc instead of a value
    { id: "resetHandling", name: "Reset to defaults", accent: tetL, action: true, desc: "Press Enter to restore every setting above",
      help: ["Reset to defaults", "DAS 10 F, ARR 2 F, SDF 20×, DCD off, ghost on, drop guard off"] },
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

const SETTING_ITEMS = { [MENU_VISUALS]: VISUAL_ITEMS, [MENU_HANDLING]: HANDLING_ITEMS };
const VISUALS_ROWS = { rowH: 48, gap: 4 }; // the Visuals, rule set and mode cards, tighter than the other menus
const VISUALS_LIST_H = 364; // height of the Visuals list; it scrolls to keep the selection in view
// Block style preview at the right of its card: a block per style, in colour indices (red, green, cyan)
const PREVIEW_BLOCKS = [["active", 6], ["locked", 5], ["ghost", 1]];
const PREVIEW_GAP = 6;
const PREVIEW_RIGHT = 38; // from the preview's right end to the card's, leaving room for the ▶
const PREVIEW_PAD = 6; // what the preview adds to its card's height
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
];

// Block offsets of the SRS shapes, for pieces drawn outside a game (menu accents)
const SRS_CELLS = shapeCells(shapes);

// Countdown digits by value: green, yellow, red as on a start light
const COUNTDOWN_COLORS = [null, PIECE_COLORS[tetS].light, PIECE_COLORS[tetO].light, PIECE_COLORS[tetZ].light];

// Confetti for cleared lines: piece colour plus a few party colours
const CONFETTI_EXTRA = ["#ffffff", "#ff5fd2", "#fff27a"];
const CONFETTI_PER_CELL = 2;
const CONFETTI_GRAVITY = 0.06;
const CONFETTI_LIFE = 50; // frames
const CONFETTI_ALPHA = 0.45;
const GLOW_SPRITE = 64; // texels per confetti glow sprite
const ORB_COUNT = 46; // drifting lights in the backdrop
const HUE_STEP = 28; // backdrop hue shift per line clear
const RING_LIFE = 46; // frames a clear shockwave expands
const RING_ALPHA = 0.8; // ring opacity at the Normal effects level
const RING_CHAIN_MAX = 8; // combo length after which rings stop getting brighter
const RIPPLE_LIFE = 60; // frames a clear ripple travels (Clear rings: Ripple)
const RIPPLE_REACH = 600; // logical units the ripple's front travels, past the view's corners
const RIPPLE_AMP = 1.55; // refraction strength at the Normal effects level
const FLASH_LIFE = 16; // frames a cleared row glows
const STACK_BORDER_W = 3; // TGM-style stack border: width of the line, drawn on the blocks' edges
const STACK_BORDER_COLOR = "rgba(222,222,232,0.9)";
const DROP_TRAIL_GROW = 4; // frames the hard-drop trail takes to reach down to the piece
const DROP_TRAIL_FADE = 8; // frames a drop trail then takes to fade out, all at once
const DROP_TRAIL_ALPHA = 0.38; // peak opacity of the trail
const DROP_FLASH_LIFE = 8; // frames a hard-dropped piece flashes
const TILT_MAX = [2.8, 4.8]; // playing field tilt in degrees about the x and y axes, at Normal
const TILT_SPEED = 0.75; // pace of the tilt drift (1 = waves of 0.15-0.7 rad/s)
const TILT_DISTANCE = 1100; // camera distance for the tilt's perspective (logical units)
const SHAKE_KICK = 1.8; // downward speed a long hard drop gives the field (logical units per frame)
const SHAKE_CLEAR_KICK = 1.4; // speed a single-line clear gives the field, in a random direction
const SHAKE_CLEAR_LINE = 0.4, SHAKE_CLEAR_CHAIN = 0.08; // extra per further line, per combo step
const SHAKE_BUMP = 0.6; // sideways speed a piece pushed against the border gives the field
const SHAKE_SPRING =0.22, SHAKE_DAMPING = 0.28; // how fast the field settles back
const SHAKE_TIP = 0.25; // degrees the field tips back per unit it is knocked down
const HOLO_FULL_TILT = 3.5; // degrees of field tilt at which the Holo sheen is at full strength
const HOLO_HUE_PER_DEG = [95, 70]; // hue shift per degree of tilt about the x and y axes
const HOLO_HUE_ACROSS = 140; // hue spread across the well, as a viewing angle changes over it
const HOLO_HUE_STEPS = 48; // hues are quantised so their colours can be cached
const HOLO_ALPHA = 0.55; // sheen opacity at full strength
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
const COMBO_COLORS = [INK, INK, "#fff1a8", MESSAGE_GOLD, "#ffb35c", "#ff8a4c", "#ff5f4a"]; // by chain length

// Stat values drawn glyph by glyph (they change every frame); other values are words, drawn whole
const NUMERIC_TEXT = /^[\d:.,/ ]+$/;

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
        this.optionspos = 0;  // Controls, Visuals or Guideline handling
        this.visualspos = 0;
        this.handlingpos = 0;
        this.setuppos = 0;    // setup card
        this.layoutBoard(VISIBLE_TOP);
        this.layout = LAYOUT_FULL; // full or compact, by window (resize())
        this.setupChoices = {}; // setup card choices ("rule set.mode.card": label index), kept for the session
        this.visualsScroll = 0;       // Visuals list scrolled out above (logical units), eased
        this.visualsScrollTarget = 0;
        this.controlspos = 0; // key action, or "reset" after the last one
        this.capturing = null; // action waiting for a new key
        this.options = new Options();
        this.game = null;
        this.player_input = 0x0000;
        this.events = [];
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
        this.hue = 232;       // backdrop colour, eased toward hueTarget
        this.hueTarget = 232;
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
        this.glowAtlas = null;
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
        this.resize();
        window.addEventListener("resize", () => this.resize());
        window.addEventListener("keydown", (e) => this.onKey(e, true));
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
        const winW = window.innerWidth, winH = window.innerHeight;
        const fitIn = ([, , w, h], availW, availH) => Math.min(availW / w, availH / h);
        // touch devices always take the compact layout; elsewhere a narrow window does
        this.layout = this.touch.enabled || fitIn(LAYOUT_COMPACT.view, winW, winH) >= COMPACT_GAIN * fitIn(LAYOUT_FULL.view, winW, winH)
            ? LAYOUT_COMPACT : LAYOUT_FULL;
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
        this.clearTextCache();
        if (this.messageCache) this.r.releaseTexture(this.messageCache.tex);
        this.messageCache = null;
        this.backdrop.setBackground(this.renderBackground());
    }

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
        // Controls screen waiting for a new key: the next press is the binding
        if (this.capturing) {
            e.preventDefault();
            if (down && !e.repeat) {
                if (e.code !== "Escape") this.options.bind(this.capturing, e.code);
                this.capturing = null;
            }
            return;
        }
        // Hidden TGM3 test keys: Ctrl+Shift+1..5 (see RuleGame.testSetup)
        if (e.ctrlKey && e.shiftKey && TEST_KEYS[e.code]) {
            e.preventDefault();
            if (down && !e.repeat && this.GAMESTATE === STATE_GAME && this.game) this.game.testSetup(TEST_KEYS[e.code]);
            return;
        }
        if (e.code === this.options.keys.sound) {
            e.preventDefault();
            if (down && !e.repeat) this.sound.toggleMute();
            return;
        }
        if (!MENU_KEYS.includes(e.code) && !this.options.actionFor(e.code)) return;
        e.preventDefault();
        // SDL key repeat was not enabled; menus take it for the arrows, to scroll while held
        if (e.repeat) {
            if (down && this.GAMESTATE === STATE_MENU && MENU_REPEAT_KEYS.includes(e.code)) this.events.push({ code: e.code, down, repeat: true });
            return;
        }
        this.events.push({ code: e.code, down });
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

        switch (this.GAMESTATE) {
            case STATE_GAME:
                // reset inputs
                this.player_input = 0x0000;

                this.handleGameInput();

                // Advance the game by one frame (input may have switched to the menu)
                if (this.GAMESTATE === STATE_GAME) {
                    this.game.advanceFrame(this.player_input);
                    // effects work with palette colours: map piece types through the rule set's palette
                    const toColor = (cell) => ({ ...cell, type: this.game.palette[cell.type] });
                    const cleared = this.game.takeClearedCells().map(toColor);
                    this.explodeCells(cleared, this.game.chain);
                    // no jolt for each row the field loses before the staff roll
                    if (cleared.length && this.options.shake && !this.game.inRollStart()) this.clearShake(cleared, this.game.chain);
                    const dropped = this.game.takeHardDropCells().map(toColor);
                    if (dropped.length && this.options.effects) this.dropFlashes.push({ cells: dropped, life: DROP_TRAIL_GROW + DROP_TRAIL_FADE + 1 });
                    for (const s of this.game.takeSounds()) {
                        this.sound.play(s);
                        // from the event, not the dropped cells: those a clear removed aren't listed
                        if (s === "harddrop" && this.options.shake) this.kickShake(this.game.hardDropDistance);
                    }
                    for (const dir of this.game.takeBumps()) if (this.options.shake) this.bumpShake(dir);
                }
                break;

            case STATE_MENU:
                this.handleMenuInput();
                break;
        }
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
        const ripples = this.ringMode() === "ripple" && this.rings.length ? this.rippleShapes() : null;
        if (ripples) {
            this.sceneLayer = this.sceneLayer || r.renderTarget();
            r.setScreen(this.sceneLayer);
        }
        this.backdrop.render(this.backdropScene());
        r.setTransform(this.pixelScale, this.offX, this.offY);

        if (this.GAMESTATE === STATE_GAME) this.drawGame();
        else this.drawMenu();
        if (ripples) {
            r.setScreen(null);
            this.backdrop.refract(this.sceneLayer, [this.pixelScale, this.offX, this.offY], ripples);
        }

        // Version and FPS in the view's top corners, kept unobtrusive. Drawn at the fit size (the
        // backdrop's transform) so they stay put whatever the Options scale is.
        r.setTransform(this.bgScale, this.bgOffX, this.bgOffY);
        const [vx, vy, vw] = this.layout.view;
        this.text("v" + VERSION, vx + 16, vy + 14, { size: 10, weight: 500, color: INK_FAINT, spacing: 1 });
        this.text(this.lastFPS + " FPS", vx + vw - 16, vy + 14, { size: 10, weight: 500, color: INK_FAINT, align: "right", spacing: 1 });
        if (this.sound.muted) this.text("SOUND OFF · " + keyLabel(this.options.keys.sound), vx + vw - 16, vy + 30, { size: 10, weight: 600, color: INK_DIM, align: "right", spacing: 1 });
        r.end();
    }

    // What the backdrop pass draws: colour wash, drifting lights, rings and board glow
    backdropScene() {
        const inGame = this.GAMESTATE === STATE_GAME;
        const ambient = this.options.backdrop ? this.ambientShapes() : { blobs: [], orbs: [] };
        const color = (s) => ({ ...s, rgb: hslToRgb(s.h, s.s, s.l) });
        const ps = this.pixelScale;
        const gx = this.offX + this.motion.dx * ps, gy = this.offY + this.motion.dy * ps; // follows the shake
        const glow = inGame ? {
            rect: [gx + (BOARD_X - 8) * ps, gy + (this.boardY - 8) * ps,
                gx + (BOARD_X + BOARD_W + 8) * ps, gy + (this.boardY + this.boardH + 8) * ps],
            // blur given like canvas shadowBlur: twice the Gaussian's sigma
            sigma: (BOARD_GLOW_BLUR[0] + (BOARD_GLOW_BLUR[1] - BOARD_GLOW_BLUR[0]) * Math.min(1, this.pulse)) / 2,
            rgb: hslToRgb(this.hue, 90, 62),
            a: this.boardGlowAlpha(),
        } : null;
        const rings = this.ringMode() === "rings" ? this.ringShapes().map(r => ({
            ...r, rgb: hslToRgb(r.hue, 90, 75), glowRgb: hslToRgb(r.hue, 95, 65),
        })) : [];
        return {
            bgView: [this.bgScale, this.bgOffX, this.bgOffY],
            view: [ps, this.offX, this.offY],
            blobs: ambient.blobs.map(color),
            orbs: ambient.orbs.map(color),
            rings,
            ringSigma: 6, // like a shadowBlur of 12
            glow,
        };
    }

    // The well's rows (wellTop to the bottom) set the board's height; a shorter well than the
    // standard 20 rows is centred where those would be, and the side panels follow it
    layoutBoard(wellTop) {
        this.wellTop = wellTop;
        this.boardH = CELL * (HEIGHT - wellTop);
        this.boardY = BOARD_Y + (BOARD_H - this.boardH) / 2;
    }

    // The main menu's items: Restart comes first while there is a game to restart
    mainItems() {
        return this.game !== null ? [RESTART_ITEM, ...MAIN_ITEMS] : MAIN_ITEMS;
    }

    initGame(mode, variant, startLevel = 0, height = 0) {
        this.lastGameArgs = [mode, variant, startLevel, height];
        this.game = new RuleGame(mode, variant, startLevel, height, this.options.handling);
        this.layoutBoard(this.game.wellTop);
        this.clearEffects();
        this.newTiltWaves();
    }

    // Confetti, flashes, rings and the field's shake: none left over from another game
    clearEffects() {
        this.particles = [];
        this.flashes = [];
        this.dropFlashes = [];
        this.rings = [];
        this.shake = { x: 0, vx: 0, y: 0, vy: 0, px: 0, py: 0, t: 0 }; // px, py: before the last step
    }

    // Top-left corner of a field cell in logical units (the well's rows start at wellTop)
    cellX(col) {
        return BOARD_X + CELL * col;
    }

    cellY(row) {
        return this.boardY + CELL * (row - this.wellTop);
    }

    // -----------------------------------
    // PLAYING FIELD MOTION

    // A hard drop knocks the field down, harder for longer drops, with a little sideways jolt
    kickShake(dist) {
        const kick = SHAKE_KICK * (0.5 + 0.5 * Math.min(1, dist / 16));
        this.shake.vy += kick;
        this.shake.vx += (Math.random() - 0.5) * kick * 0.5;
    }

    // A piece pushed against the left or right border nudges the field that way
    bumpShake(dir) {
        this.shake.vx += dir * SHAKE_BUMP;
    }

    // A line clear jolts the field in a random direction (mostly down), harder for more
    // lines and longer combos (chain 0 = no combo)
    clearShake(cells, chain) {
        const lines = new Set(cells.map(c => c.row)).size;
        const kick = SHAKE_CLEAR_KICK * (1 + SHAKE_CLEAR_LINE * (lines - 1))
            * (1 + SHAKE_CLEAR_CHAIN * Math.min(Math.max(0, chain), RING_CHAIN_MAX));
        const angle = Math.PI / 2 + (Math.random() - 0.5) * 2.2; // within ~63° of straight down
        this.shake.vx += Math.cos(angle) * kick;
        this.shake.vy += Math.sin(angle) * kick;
    }

    // Damped spring back to rest, stepped once per game frame (as tuned) and shown between
    // its last two steps (t: share of a frame since the last step)
    updateShake(dt) {
        const s = this.shake;
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

    // The field's tilt now (radians about the x and y axes) and shake offset (logical units)
    boardMotion() {
        const t = (this.clock - this.tiltStart) / 60 * TILT_SPEED;
        const k = this.options.tiltAngle;
        const [ax, ay] = this.tiltWaves.map(([a, b], i) =>
            TILT_MAX[i] * k * (0.65 * Math.sin(t * a.f + a.p) + 0.35 * Math.sin(t * b.f + b.p)));
        const rad = Math.PI / 180;
        const s = this.shake;
        const dx = s.px + (s.x - s.px) * s.t, dy = s.py + (s.y - s.py) * s.t;
        return { rx: (ax + dy * SHAKE_TIP) * rad, ry: ay * rad, dx, dy };
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
            const yr = Y * cosX - z * sinX, zr = Y * sinX + z * cosX;
            const f = TILT_DISTANCE / (TILT_DISTANCE - zr);
            return [cx + X * cosY * f + m.dx, cy + yr * f + m.dy, f];
        };
        const x1 = x0 + w / ps, y1 = y0 + h / ps;
        r.imageQuad(this.boardLayer, [project(x0, y0), project(x1, y0), project(x0, y1), project(x1, y1)]);
    }

    // -----------------------------------
    // INPUT

    handleGameInput() {
        // Keys let go while the game wasn't listening (menu, another window) are released now
        if (this.syncKeys) {
            this.syncKeys = false;
            for (const { id } of KEY_ACTIONS) {
                if (RELEASE_BITS[id] && !this.keysDown.has(this.options.keys[id])) this.player_input |= RELEASE_BITS[id];
            }
        }
        while (this.events.length) {
            if (this.events[0].repeat) { this.events.shift(); continue; } // left from the menu
            const { code, down } = this.events[0];
            // A release of an action pressed this frame waits for the next one: the bitmap
            // doesn't say which came first, and the rules apply releases before presses
            const action = this.options.actionFor(code);
            if (!down && RELEASE_BITS[action] && (this.player_input & PUSH_BITS[action])) return;
            this.events.shift();
            if (down) {
                if (code === "Escape") {
                    this.GAMESTATE = STATE_MENU;
                    this.menuStep = MENU_MAIN; // so Esc in the menu resumes straight away
                    this.mainpos = 0;           // on Restart, the first item
                    this.menuShown = null;      // no slide when the menu opens
                    return;
                }
                if (PUSH_BITS[action]) this.player_input |= PUSH_BITS[action];
            } else if (RELEASE_BITS[action]) {
                this.player_input |= RELEASE_BITS[action];
            }
        }
    }

    // Start -> rule set -> sub-mode -> game; or Options -> Controls, Visuals or Guideline handling.
    // Esc goes back a screen, and on the first one resumes a paused game.
    handleMenuInput() {
        // count() is only called for the screen on show: a rule set's modes depend on rulesetpos
        const screens = {
            [MENU_MAIN]: { pos: "mainpos", count: () => this.mainItems().length, back: null },
            [MENU_RULES]: { pos: "rulesetpos", count: () => RULESETS.length, back: MENU_MAIN },
            [MENU_MODES]: { pos: "menupos", count: () => RULESETS[this.rulesetpos].modes.length, back: MENU_RULES },
            [MENU_OPTIONS]: { pos: "optionspos", count: () => OPTIONS_ITEMS.length, back: MENU_MAIN },
            [MENU_CONTROLS]: { pos: "controlspos", count: () => KEY_ACTIONS.length + 1, back: MENU_OPTIONS },
            [MENU_VISUALS]: { pos: "visualspos", count: () => VISUAL_ITEMS.length, back: MENU_OPTIONS },
            [MENU_HANDLING]: { pos: "handlingpos", count: () => HANDLING_ITEMS.length, back: MENU_OPTIONS },
            [MENU_SETUP]: { pos: "setuppos", count: () => this.setupItems().length, back: MENU_MODES },
        };
        const settings = this.menuStep === MENU_SETUP ? this.setupItems() : SETTING_ITEMS[this.menuStep];
        while (this.events.length) {
            // repeat: the key is held. Lists and values then stop at their ends instead of wrapping
            const { code, down, repeat } = this.events.shift();
            if (!down) continue;
            const screen = screens[this.menuStep];
            const pos = this[screen.pos];
            const count = screen.count();
            if (code === "Escape") {
                if (screen.back !== null) this.menuStep = screen.back;
                else if (this.game !== null) { this.GAMESTATE = STATE_GAME; this.syncKeys = true; return; }
            } else if (code === "ArrowUp") {
                this[screen.pos] = repeat ? Math.max(0, pos - 1) : (pos + count - 1) % count;
            } else if (code === "ArrowDown") {
                this[screen.pos] = repeat ? Math.min(count - 1, pos + 1) : (pos + 1) % count;
            } else if ((code === "ArrowLeft" || code === "ArrowRight") && settings && !settings[pos].action) {
                this.changeOption(settings[pos].id, code === "ArrowLeft" ? -1 : 1, !repeat);
            } else if (code === "Enter") {
                if (this.menuStep === MENU_MAIN && this.mainItems()[pos].restart) {
                    this.initGame(...this.lastGameArgs);
                    this.GAMESTATE = STATE_GAME;
                    return;
                } else if (this.menuStep === MENU_MAIN || this.menuStep === MENU_OPTIONS) {
                    const next = (this.menuStep === MENU_MAIN ? this.mainItems() : OPTIONS_ITEMS)[pos].screen;
                    this.menuStep = next;
                    if (next !== MENU_RULES) this[screens[next].pos] = 0; // the rule set list remembers its place
                    if (next === MENU_VISUALS) this.visualsScroll = this.visualsScrollTarget = 0;
                } else if (this.menuStep === MENU_RULES) {
                    this.menuStep = MENU_MODES;
                    this.menupos = 0;
                } else if (this.menuStep === MENU_MODES && this.chosenMode().setup) {
                    this.menuStep = MENU_SETUP;
                    this.setuppos = 0;
                } else if (this.menuStep === MENU_MODES || this.menuStep === MENU_SETUP) {
                    this.menuAction();
                    return;
                } else if (settings) {
                    this.changeOption(settings[pos].id, 1);
                } else if (this.menuStep === MENU_CONTROLS) {
                    if (pos === KEY_ACTIONS.length) this.options.resetKeys();
                    else this.capturing = KEY_ACTIONS[pos].id; // next key press becomes the binding
                }
            }
        }
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
        if (HANDLING_ITEMS.some(item => item.id === id)) this.applyHandling();
    }

    // Handling changed during a (paused) Guideline game applies at once
    applyHandling() {
        if (this.game) this.game.setHandling(this.options.handling);
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
            case "scale": return Math.round(o.scale * 100) + "%";
            case "tileset": return TILESETS[o.tileset].name;
            case "das": return frameValue(o.das);
            case "arr": return o.arr ? frameValue(o.arr) : "Instant";
            case "dcd": return o.dcd ? frameValue(o.dcd) : "Off";
            case "sdf": return Number.isFinite(o.sdf) ? o.sdf + "×" : "Instant";
        }
    }

    // Setting cards with their current values (action cards keep their own description)
    settingCards(items) {
        return items.map(item => item.action ? item : { ...item, desc: `◀  ${this.optionValue(item.id)}  ▶` });
    }

    // The mode selected on the modes screen
    chosenMode() {
        return RULESETS[this.rulesetpos].modes[this.menupos];
    }

    // The setup screen's cards for the chosen mode (ids "setup0", "setup1", ...)
    setupItems() {
        return (this.chosenMode().setup || []).map(({ name, accent }, n) => ({ id: "setup" + n, name, accent }));
    }

    // A setup card's descriptor, its number and its key in setupChoices; null for other ids
    setupCard(id) {
        if (!id.startsWith("setup")) return null;
        const n = Number(id.slice(5));
        return { n, item: this.chosenMode().setup[n], key: `${this.rulesetpos}.${this.menupos}.${n}` };
    }

    // The chosen mode's remembered label index for setup card n (0 at first)
    setupIndex(n) {
        return this.setupChoices[`${this.rulesetpos}.${this.menupos}.${n}`] || 0;
    }

    // Activation of menu item: the mode, with its setup cards' choices
    menuAction() {
        const { mode, variant, setup = [] } = this.chosenMode();
        const args = { variant, startLevel: 0, height: 0 };
        setup.forEach((item, n) => {
            const i = this.setupIndex(n);
            args[item.arg] = item.values ? item.values[i] : i;
        });
        this.initGame(mode, args.variant, args.startLevel, args.height);
        this.GAMESTATE = STATE_GAME;
    }

    // -----------------------------------
    // LINE CLEAR CONFETTI
    // Uses Math.random, independent of the piece randomizers

    explodeCells(cells, chain = 0) {
        if (!this.options.effects) return;
        const rows = new Set();
        for (const cell of cells) {
            if (cell.row < this.wellTop) continue; // hidden rows
            rows.add(cell.row);
            this.explodeCell(cell);
        }
        for (const row of rows) this.flashes.push({ row, life: FLASH_LIFE });
        if (rows.size) {
            const mid = [...rows].reduce((a, b) => a + b, 0) / rows.size;
            const span = this.options.rings === "ripple" ? RIPPLE_LIFE : RING_LIFE;
            this.rings.push({
                y: this.cellY(mid) + CELL / 2, life: span, span, power: rows.size,
                chain: Math.max(0, chain), hue: this.hue, k: this.options.effectScale,
            });
            this.hueTarget += HUE_STEP * rows.size / 2;
            this.pulse = Math.min(1, this.pulse + (0.15 + 0.1 * rows.size) * this.options.effectScale);
        }
    }

    explodeCell(cell) {
        const cx = this.cellX(cell.col) + CELL / 2;
        const cy = this.cellY(cell.row) + CELL / 2;
        const count = Math.max(1, Math.round(CONFETTI_PER_CELL * this.options.effectScale));
        for (let n = 0; n < count; n++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 4.5;
            this.particles.push({
                x: cx + (Math.random() - 0.5) * CELL * 0.8,
                y: cy + (Math.random() - 0.5) * CELL * 0.8,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 3, // bias upwards for a burst
                size: 3 + Math.random() * 5,
                twinkle: Math.random() * Math.PI * 2,
                color: Math.random() < 0.85 ? PIECE_COLORS[cell.type].light
                    : CONFETTI_EXTRA[Math.floor(Math.random() * CONFETTI_EXTRA.length)],
                life: CONFETTI_LIFE - Math.floor(Math.random() * 20),
            });
        }
    }

    // Lives and speeds are in game frames; dt is the time passed in them
    updateParticles(dt) {
        const drag = Math.pow(0.97, dt); // air drag
        for (const p of this.particles) {
            p.vy += CONFETTI_GRAVITY * dt;
            p.vx *= drag;
            p.vy *= drag;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.twinkle += 0.3 * dt;
            p.life -= dt;
        }
        this.particles = this.particles.filter(p => p.life > 0 && p.y < VIEW_H + 20);
        const age = (effects) => effects.filter(e => (e.life -= dt) > 0);
        this.rings = age(this.rings);
        this.flashes = age(this.flashes);
        this.dropFlashes = age(this.dropFlashes);
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

    // A drop trail streak in a column, from y0 down to y1 (the blocks), fading in towards them;
    // drawn only down to yEnd while it grows, at `alpha` while it fades
    drawTrail(col, y0, y1, index, yEnd = y1, alpha = 1) {
        const r = this.r;
        const color = parseColor(this.tileLight(index));
        r.globalAlpha = DROP_TRAIL_ALPHA * this.softEffectScale() * alpha;
        r.shape(this.cellX(col), y0, CELL, yEnd - y0, { fill: [[color[0], color[1], color[2], 0], color], fillY: [y0, y1] });
        r.globalAlpha = 1;
    }

    // Hard drop feedback: the landed piece lights up with the active highlight
    // plus a soft tint of its own colour, both fading out quickly
    drawDropFlashes() {
        const r = this.r;
        for (const f of this.dropFlashes) {
            if (this.options.trail) this.drawDropTrail(f);
            const t = Math.max(0, f.life / DROP_FLASH_LIFE);
            for (const cell of f.cells) {
                if (cell.row < this.wellTop || cell.cleared) continue; // hidden rows; cleared: nothing left to light up
                const x = this.cellX(cell.col), y = this.cellY(cell.row);
                r.globalAlpha = t;
                this.drawBlock(cell.type, x, y, CELL, "active");
                r.globalAlpha = 0.4 * t * t;
                r.shape(x + 1, y + 1, CELL - 2, CELL - 2, { radius: CELL * 0.14, fill: this.tileLight(cell.type) });
                r.globalAlpha = 1;
            }
        }
    }

    // Faint streak per column from where the piece started to where it landed,
    // brightest at the piece and fading upwards; it grows down to the piece, then fades out
    drawDropTrail(f) {
        const n = DROP_TRAIL_GROW + DROP_TRAIL_FADE + 1 - f.life; // frames shown, from 1
        const grown = Math.min(1, n / DROP_TRAIL_GROW); // share of the trail drawn so far
        const alpha = 1 - Math.max(0, n - DROP_TRAIL_GROW) / (DROP_TRAIL_FADE + 1);
        const cols = new Map(); // col -> topmost landed cell
        for (const cell of f.cells) {
            const c = cols.get(cell.col);
            if (!c || cell.row < c.row) cols.set(cell.col, cell);
        }
        for (const cell of cols.values()) {
            const top = Math.max(cell.row - cell.dist, this.wellTop);
            if (cell.dist <= 0 || cell.row <= top) continue;
            const y1 = this.cellY(cell.row), y0 = this.cellY(top);
            this.drawTrail(cell.col, y0, y1, cell.type, y0 + (y1 - y0) * grown, alpha);
        }
    }

    // Line clear delay: a streak above each column of the falling stack, from where it
    // started to where it is, fading out all at once after it has landed. One per run of
    // blocks falling together; drawn under the field, so only the gap above them shows.
    drawLineDropTrails(firstRow) {
        const game = this.game;
        const top = Math.max(firstRow, this.wellTop);
        for (let i = firstRow; i < HEIGHT; i++) {
            const dist = game.getDropDistance(i);
            if (!dist) continue;
            const landed = game.getDropLandedFor(i, this.tickPhase);
            if (landed >= DROP_TRAIL_FADE) continue;
            const alpha = landed < 0 ? 1 : 1 - (landed + 1) / (DROP_TRAIL_FADE + 1);
            const y1 = this.cellY(i + game.getDropOffset(i, this.tickPhase));
            const y0 = this.cellY(Math.max(i, top));
            if (y0 >= y1) continue;
            for (let j = 0; j < WIDTH; j++) {
                const cell = game.getCell(i, j);
                if (!cell || game.getCellAlpha(i, j) <= 0) continue;
                if (i > firstRow && game.getCell(i - 1, j) && game.getDropDistance(i - 1) === dist) continue; // not the run's top
                this.drawTrail(j, y0, y1, game.palette[cell], y1, alpha);
            }
        }
    }

    // Soft light motes, added together so overlapping bursts bloom
    drawParticles() {
        const r = this.r;
        const atlas = this.glowSprites();
        r.save();
        r.blendMode = "add";
        for (const p of this.particles) {
            const k = Math.min(1, p.life / 24);
            const size = p.size * (0.6 + 0.4 * k) * (0.8 + 0.2 * Math.sin(p.twinkle));
            r.globalAlpha = Math.min(1, CONFETTI_ALPHA * this.options.effectScale) * k;
            const sx = atlas.index.get(p.color) * GLOW_SPRITE;
            r.image(atlas.tex, p.x - size * 2, p.y - size * 2, size * 4, size * 4, sx, 0, GLOW_SPRITE, GLOW_SPRITE);
        }
        r.restore();
    }

    // White-hot centre fading to the colour: one sprite per confetti colour, side by side
    glowSprites() {
        if (this.glowAtlas) return this.glowAtlas;
        const colors = [...PIECE_COLORS.slice(1).map(c => c.light), ...CONFETTI_EXTRA];
        const c = document.createElement("canvas");
        c.width = GLOW_SPRITE * colors.length;
        c.height = GLOW_SPRITE;
        const g = c.getContext("2d");
        const half = GLOW_SPRITE / 2;
        const index = new Map();
        colors.forEach((color, i) => {
            const cx = i * GLOW_SPRITE + half;
            const grad = g.createRadialGradient(cx, half, 0, cx, half, half);
            grad.addColorStop(0, "#ffffff");
            grad.addColorStop(0.18, "#ffffff");
            grad.addColorStop(0.35, color + "cc");
            grad.addColorStop(1, color + "00");
            g.fillStyle = grad;
            g.fillRect(i * GLOW_SPRITE, 0, GLOW_SPRITE, GLOW_SPRITE);
            index.set(color, i);
        });
        this.glowAtlas = { tex: this.r.texture(c), index };
        return this.glowAtlas;
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
    }

    // Aurora wash (big colour blobs) and rising lights, in backdrop coordinates. Each has a
    // centre, radius, hue, saturation, lightness and alpha at the centre (fading to 0 at r).
    ambientShapes() {
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
                x: BOARD_X + BOARD_W / 2, y: ring.y, hue: ring.hue + 20,
                r: 30 + ease * (260 + 120 * ring.power),
                width: 3 + 5 * (1 - k) * ring.power,
                // brighter with more lines (1-4) and with a longer combo (chain 0 = no combo)
                a: (1 - k) * (1 - k) * (0.05 + 0.07 * ring.power) * (1 + 0.25 * Math.min(ring.chain, RING_CHAIN_MAX)) * ring.k * RING_ALPHA,
            };
        });
    }

    // The Clear rings mode in effect: "off", "rings" or "ripple" (only in a game, with effects on)
    ringMode() {
        return this.GAMESTATE === STATE_GAME && this.options.effects ? this.options.rings : "off";
    }

    // Clear ripples: a wave packet spreading from the cleared rows through the whole view,
    // bending the light of what is under it (no glow or tint of its own). Centre, radius and packet width in logical
    // units; amp is the largest displacement, in logical units.
    rippleShapes() {
        return this.rings.map(ring => {
            const k = 1 - ring.life / ring.span; // 0 -> 1
            const fade = Math.pow(1 - k, 2.5); // strong at first, gone well before the end
            return {
                x: BOARD_X + BOARD_W / 2, y: ring.y,
                r: 20 + (1 - Math.pow(1 - k, 1.6)) * RIPPLE_REACH,
                width: (14 + 4 * ring.power) * (1 + 1.5 * k), // spreads as it goes
                amp: fade * (4 + 2.5 * ring.power) * (1 + 0.15 * Math.min(ring.chain, RING_CHAIN_MAX)) * ring.k * RIPPLE_AMP,
            };
        });
    }

    drawFlashes() {
        for (const f of this.flashes) {
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
        const [cr, cg, cb, ca] = parseColor(color);
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
        this.text(s, x, y, { size, weight: 700, color: INK_DIM, spacing });
        const tw = this.measureText(s, size, 700, spacing);
        if (w - tw - 8 > 4) this.r.rect(x + tw + 8, y, w - tw - 8, 1, INK_FAINT);
    }

    panel(x, y, w, h) {
        this.r.shape(x, y, w, h, { radius: 10, fill: PANEL, stroke: "rgba(244,236,220,0.10)", lineWidth: 1 });
    }

    // Block sprites in a block style (tiles.js), pre-rendered at device resolution: one
    // atlas per block style and size, a row per sprite style with the seven colours
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
        const c = document.createElement("canvas");
        c.width = 7 * (Math.max(...rows.map(row => row.px)) + gap);
        c.height = rows.reduce((h, row) => h + row.px + gap, 0);
        const g = c.getContext("2d");
        const sprites = {};
        let y = 0;
        for (const { style, pad, px } of rows) {
            sprites[style] = [];
            for (let type = 1; type <= 7; type++) {
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
        atlas = { tex: this.r.texture(c), sprites };
        this.blockCache.set(key, atlas);
        return atlas;
    }

    drawBlock(type, x, y, size, style = "locked", tileset = this.options.tileset) {
        if (!type) return;
        const atlas = this.blockAtlas(size, tileset);
        const sp = atlas.sprites[style][type];
        const w = size + sp.pad * 2;
        this.r.image(atlas.tex, x - sp.pad, y - sp.pad, w, w, sp.sx, sp.sy, sp.px, sp.px);
        if (TILESETS[tileset].sheen && style !== "ghost") this.drawSheen(x, y, size);
    }

    // Holo blocks: how strong the colour sheen is and which hue it starts at, from the
    // field's tilt now. Face-on (no tilt) the strength is 0 and the blocks stay grey.
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

    // Draw a piece (rotation 0) centred on cx/cy, with a game's shapes and colours if given
    drawPieceCentered(type, cx, cy, size, style = "locked", game = null) {
        if (!type) return;
        const cells = (game ? game.pieceCells : SRS_CELLS)[type][0];
        const color = game ? game.palette[type] : type;
        const rows = cells.map(([i]) => i), cols = cells.map(([, j]) => j);
        const minR = Math.min(...rows), minC = Math.min(...cols);
        const ox = cx - ((Math.max(...cols) - minC + 1) * size) / 2;
        const oy = cy - ((Math.max(...rows) - minR + 1) * size) / 2;
        for (const [i, j] of cells) this.drawBlock(color, ox + (j - minC) * size, oy + (i - minR) * size, size, style);
    }

    // Night gallery backdrop: deep gradient, soft spotlight, receding floor grid
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

        const sky = g.createLinearGradient(0, y0, 0, y1);
        sky.addColorStop(0, "#0d1230");
        sky.addColorStop(0.6, "#080a1d");
        sky.addColorStop(1, "#04050e");
        g.fillStyle = sky;
        g.fillRect(x0, y0, x1 - x0, y1 - y0);

        const spot = g.createRadialGradient(VIEW_W / 2, VIEW_H * 0.42, 20, VIEW_W / 2, VIEW_H * 0.42, VIEW_W * 0.6);
        spot.addColorStop(0, "rgba(90,80,200,0.22)");
        spot.addColorStop(0.5, "rgba(40,50,140,0.08)");
        spot.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = spot;
        g.fillRect(x0, y0, x1 - x0, y1 - y0);

        // perspective floor
        const horizon = VIEW_H * 0.7;
        const depth = y1 - horizon;
        // The lines fade in below the horizon (a gradient stroke: painting a fade over them
        // would also cover the sky and spotlight and leave a hard edge)
        const lines = g.createLinearGradient(0, horizon - 40, 0, horizon + 30);
        lines.addColorStop(0, "rgba(150,160,255,0)");
        lines.addColorStop(1, "rgba(150,160,255,0.07)");
        g.strokeStyle = lines;
        g.lineWidth = 1;
        const spread = Math.ceil((x1 - x0) / 240) + 12;
        for (let i = -spread; i <= spread; i++) {
            g.beginPath();
            g.moveTo(VIEW_W / 2 + i * 14, horizon);
            g.lineTo(VIEW_W / 2 + i * 120 * (depth / (VIEW_H - horizon)), y1);
            g.stroke();
        }
        for (let k = 1; k <= 10; k++) {
            const y = horizon + depth * Math.pow(k / 10, 2);
            g.beginPath();
            g.moveTo(x0, y);
            g.lineTo(x1, y);
            g.stroke();
        }

        // vignette
        const r = Math.max(x1 - x0, y1 - y0);
        const vig = g.createRadialGradient(VIEW_W / 2, VIEW_H / 2, r * 0.3, VIEW_W / 2, VIEW_H / 2, r * 0.8);
        vig.addColorStop(0, "rgba(0,0,0,0)");
        vig.addColorStop(1, "rgba(0,0,0,0.55)");
        g.fillStyle = vig;
        g.fillRect(x0, y0, x1 - x0, y1 - y0);
        return c;
    }

    // Seven-colour stripe, a nod to the piece set
    colorStripe(x, y, w, h) {
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
        const markSize = Math.min(76, Math.floor(76 * (this.layout.view[2] - 48) / this.measureText("QUADBRICKS", 76, 900, 14)));
        this.text("QUADBRICKS", cx, 150, { size: markSize, weight: 900, color: INK, align: "center", spacing: Math.round(markSize * 14 / 76) });
        this.colorStripe(cx - 150, 200, 300, 4);

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
        // the same on every screen, so it stays put; too wide for the compact view, and no use with touch
        if (!this.layout.compact) this.drawControls(cx, 660);
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
        let hint, hintY = 620;
        switch (step) {
            case MENU_MAIN:
                this.drawMenuList(this.mainItems(), this.mainpos, listTop);
                hint = "ENTER  SELECT" + (this.game ? "      ESC  RESUME" : "");
                break;
            case MENU_RULES:
                heading("START  ·  CHOOSE A RULE SET");
                this.drawMenuList(RULESETS, this.rulesetpos, listTop, VISUALS_ROWS.rowH, VISUALS_ROWS.gap); // so they all fit
                hint = "ENTER  SELECT      ESC  BACK";
                break;
            case MENU_MODES: {
                // Breadcrumb: the chosen rule set, then its modes
                const ruleset = RULESETS[this.rulesetpos];
                heading(ruleset.name.toUpperCase() + "  ·  CHOOSE A MODE");
                this.drawMenuList(ruleset.modes, this.menupos, listTop, VISUALS_ROWS.rowH, VISUALS_ROWS.gap);
                hint = (this.chosenMode().setup ? "ENTER  SELECT" : "ENTER  START") + "      ESC  BACK";
                break;
            }
            case MENU_SETUP: {
                // Breadcrumb: rule set and mode, then what the cards choose (e.g. level and height)
                const ruleset = RULESETS[this.rulesetpos];
                const items = this.setupItems();
                const choice = "CHOOSE " + items.map(item => item.name).join(" AND ");
                heading(`${ruleset.name}  ·  ${this.chosenMode().name}  ·  ${choice}`.toUpperCase());
                this.drawMenuList(this.settingCards(items), this.setuppos, listTop);
                hint = "← →  CHANGE      ENTER  START      ESC  BACK";
                break;
            }
            case MENU_OPTIONS:
                heading("OPTIONS");
                this.drawMenuList(OPTIONS_ITEMS, this.optionspos, listTop);
                hint = "ENTER  SELECT      ESC  BACK";
                break;
            case MENU_VISUALS: {
                const top = 236; // heading in the tagline's place: leaves room for the hint
                heading("OPTIONS  ·  VISUALS", INK_DIM, 220);
                const items = this.settingCards(VISUAL_ITEMS);
                // Tighter cards leave room for the hint above the shared controls row; the list
                // shows VISUALS_LIST_H of them, scrolled to keep the selection in view
                const { rowH, gap } = VISUALS_ROWS, listH = VISUALS_LIST_H;
                const r = this.r;
                r.save();
                r.clip(-VIEW_W, top - 1, VIEW_W * 3, listH + 2);
                this.drawMenuList(items, this.visualspos, top, rowH, gap, this.visualsScroll);
                r.restore();
                this.drawScrollbar(VIEW_W / 2 + 210 + 10, top, listH, this.visualsScroll, menuListHeight(items, rowH, gap));
                hintY = top + listH + 22;
                hint = "← →  CHANGE      ESC  BACK";
                break;
            }
            case MENU_HANDLING: {
                // Compact cards like Visuals, heading in the tagline's place; below them what the selected
                // setting does, with its abbreviation spelled out (cards a little tighter, to fit the reset card)
                const top = 236, rowH = 44, gap = 4;
                heading("OPTIONS  ·  GUIDELINE HANDLING", INK_DIM, 220);
                this.drawMenuList(this.settingCards(HANDLING_ITEMS), this.handlingpos, top, rowH, gap);
                const [title, help] = HANDLING_ITEMS[this.handlingpos].help;
                const y = top + HANDLING_ITEMS.length * (rowH + gap) + 10;
                this.text(title.toUpperCase(), cx, y, { size: 11, weight: 700, color: INK, align: "center", spacing: 3 });
                this.text(help, cx, y + 19, { size: 13, weight: 500, color: INK_DIM, align: "center" });
                hintY = y + 44;
                hint = HANDLING_ITEMS[this.handlingpos].action ? "ENTER  RESET      ESC  BACK" : "← →  CHANGE      ESC  BACK";
                break;
            }
            case MENU_CONTROLS:
                heading("OPTIONS  ·  CONTROLS");
                this.drawKeyBindings(listTop - 8);
                hint = this.capturing ? "PRESS A KEY      ESC  CANCEL" : "ENTER  CHANGE      ESC  BACK";
                break;
        }

        // Footer
        if (this.touch.enabled) hint = touchWords(hint);
        this.text(hint, cx, hintY, { size: 12, weight: 700, color: INK_DIM, align: "center", spacing: 3 });
    }

    // One block each as a falling piece, settled stack and ghost in the chosen block style, at
    // their size in the well and each in its own colour (PREVIEW_BLOCKS), in a row ending at right
    drawTilesetPreview(right, top) {
        const x = right - PREVIEW_BLOCKS.length * (CELL + PREVIEW_GAP) + PREVIEW_GAP;
        PREVIEW_BLOCKS.forEach(([style, color], n) => this.drawBlock(color, x + n * (CELL + PREVIEW_GAP), top, CELL, style));
    }

    // A menu card; the selected one is lighter, with an accent bar on its left edge
    card(x, y, w, h, radius, selected, accent, barW) {
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

    // Rows of action name and key; Enter on a row waits for the new key
    drawKeyBindings(top) {
        const listW = 420, rowH = 31, x = VIEW_W / 2 - listW / 2;
        const rows = [...KEY_ACTIONS.map(a => ({ name: a.name, key: this.options.keys[a.id], id: a.id })), { name: "Reset to defaults" }];
        rows.forEach((row, n) => {
            const y = top + n * (rowH + 2);
            const selected = n === this.controlspos;
            this.card(x, y, listW, rowH, 8, selected, PIECE_COLORS[tetS].base, 4);

            const cy = y + rowH / 2;
            if (!row.id) { // reset row
                this.text(row.name.toUpperCase(), VIEW_W / 2, cy + 1, { size: 12, weight: 800, color: selected ? INK : INK_DIM, align: "center", spacing: 3 });
                return;
            }
            this.text(row.name.toUpperCase(), x + 20, cy + 1, { size: 13, weight: 800, color: selected ? INK : INK_DIM, spacing: 2 });
            if (this.capturing === row.id) {
                this.text("PRESS A KEY", x + listW - 18, cy + 1, { size: 11, weight: 800, color: this.pulseInk(6), align: "right", spacing: 3 });
            } else {
                const label = keyLabel(row.key);
                this.keycap(label, x + listW - 18 - this.keycapWidth(label), cy);
            }
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

    // Eases the Visuals list's scroll toward keeping the selected card in view
    updateMenuScroll(dt) {
        const { rowH, gap } = VISUALS_ROWS;
        const pos = this.visualspos;
        const y = pos ? menuListHeight(VISUAL_ITEMS.slice(0, pos), rowH, gap) + gap : 0; // selected card's top
        const h = menuRowHeight(VISUAL_ITEMS[pos], rowH);
        let target = this.visualsScrollTarget;
        if (y < target) target = y;
        else if (y + h > target + VISUALS_LIST_H) target = y + h - VISUALS_LIST_H;
        const max = Math.max(0, menuListHeight(VISUAL_ITEMS, rowH, gap) - VISUALS_LIST_H);
        this.visualsScrollTarget = Math.max(0, Math.min(target, max));
        this.visualsScroll += (this.visualsScrollTarget - this.visualsScroll) * (1 - Math.pow(0.7, dt));
        if (Math.abs(this.visualsScrollTarget - this.visualsScroll) < 0.05) this.visualsScroll = this.visualsScrollTarget;
    }

    // Cards with an accent piece, name and description; the selected one is highlighted. Cards
    // with preview are a little taller and show the block style preview at the right.
    // scroll: logical units scrolled out above the top (fractional while easing)
    drawMenuList(items, selectedIndex, top, rowH = 64, gap = 10, scroll = 0) {
        const listW = 420, x = VIEW_W / 2 - listW / 2;
        let y = top - scroll;
        items.forEach((item, n) => {
            const selected = n === selectedIndex;
            const h = menuRowHeight(item, rowH);
            this.card(x, y, listW, h, 10, selected, PIECE_COLORS[item.accent].base, 5);
            if (item.preview) this.drawTilesetPreview(x + listW - PREVIEW_RIGHT, y + (h - CELL) / 2); // right of the name

            this.drawPieceCentered(item.accent, x + 50, y + h / 2, 13, selected ? "active" : "locked");
            this.text(item.name.toUpperCase(), x + 92, y + h / 2 - 7, { size: 20, weight: 800, color: selected ? INK : INK_DIM, spacing: 3 });
            this.text(item.desc, x + 92, y + h / 2 + 14, { size: 12, weight: 500, color: selected ? INK_DIM : "rgba(244,236,220,0.35)" });
            if (selected) this.text("▶", x + listW - 26, y + h / 2, { size: 14, color: this.pulseInk(10), align: "center" });
            y += h + gap;
        });
    }

    // Key hints for the current bindings
    drawControls(cx, y) {
        const k = this.options.keys;
        const items = [[[k.left, k.right], "MOVE"], [[k.soft], "SOFT"], [[k.hard], "HARD"], [[k.rotl, k.rotr], "ROTATE"],
            [[k.hold], "HOLD"], [[k.sound], "SOUND"], [["Escape"], "MENU"]].map(([keys, label]) => [keys.map(keyLabel), label]);
        // measure total width first so the row is centred
        const widths = items.map(([keys, label]) =>
            keys.reduce((a, k) => a + this.keycapWidth(k) + 4, 0) + 4 + this.measureText(label, 10, 600, 2));
        const gap = 22;
        let x = cx - (widths.reduce((a, b) => a + b, 0) + gap * (items.length - 1)) / 2;
        items.forEach(([keys, label], n) => {
            let kx = x;
            for (const k of keys) kx += this.keycap(k, kx, y) + 4;
            this.text(label, kx + 4, y + 1, { size: 10, weight: 600, color: INK_DIM, spacing: 2 });
            x += widths[n] + gap;
        });
    }

    drawGame() {
        const game = this.game;

        const m = this.motion;
        if (m.rx || m.ry || m.dx || m.dy) this.drawBoardInMotion(m);
        else this.drawBoard(); // straight onto the screen, pixel-sharp
        this.drawParticles();  // confetti flies off the field: never tilted
        if (this.layout.compact) this.drawCompactPanels();
        else this.drawSidePanels();

        // Overlays
        if (game.inStartDelay()) this.drawCountdown(game);
        if (game.isGameOver()) {
            const title = game.endTitle || "GAME OVER";
            const accent = title === "GRAND MASTER" ? PIECE_COLORS[tetO].base
                : title === "COMPLETE" ? PIECE_COLORS[tetI].base : PIECE_COLORS[tetZ].base;
            const sub = game.endSub || "ESC — BACK TO MENU";
            this.boardBanner(title, this.touch.enabled ? touchWords(sub) : sub, 1, accent);
        }
    }

    // Strength of the board glow: the shadow's alpha times the frame's fill alpha
    boardGlowAlpha() {
        return (0.4 + 0.35 * this.pulse) * (this.options.effects ? 0.55 : 0.92);
    }

    drawBoard() {
        const r = this.r;
        const game = this.game;

        // Frame (the backdrop pass has drawn its glow and the rings)
        const fx = this.options.effects;
        const frame = [BOARD_X - 8, this.boardY - 8, BOARD_W + 16, this.boardH + 16];
        r.shape(...frame, { radius: 12, fill: [6 / 255, 8 / 255, 22 / 255, fx ? 0.55 : 0.92] });
        // glass sheen: lighter toward the top, tinted by the backdrop colour
        r.shape(...frame, {
            radius: 12,
            fill: [hsla(this.hue, 80, 70, 0.10), hsla(this.hue, 80, 50, 0.02)],
            fillY: [this.boardY, this.boardY + this.boardH],
            stroke: fx ? hsla(this.hue, 90, 82, 0.45 + 0.4 * this.pulse) : "rgba(244,236,220,0.22)",
            lineWidth: 1.5,
        });

        // Well grid
        const grid = "rgba(160,170,255,0.06)";
        for (let c = 1; c < WIDTH; c++) r.rect(BOARD_X + c * CELL, this.boardY, 1, this.boardH, grid);
        for (let row = 1; row < HEIGHT - this.wellTop; row++) r.rect(BOARD_X, this.boardY + row * CELL, BOARD_W, 1, grid);

        const cells = game.pieceCells[game.getCurPiece_type()][game.getCurPiece_rotation()];
        const pal = game.palette; // piece type -> colour
        const color = pal[game.getCurPiece_type()];
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
        if (this.options.effects && this.options.trail) this.drawLineDropTrails(firstRow);
        for (let i = firstRow; i < HEIGHT; i++) {
            const y = this.cellY(i + game.getDropOffset(i, this.tickPhase)); // rows fall into place during a line clear
            for (let j = 0; j < WIDTH; j++) {
                const alpha = game.getCellAlpha(i, j); // TGM3 and TAP staff roll: blocks fade or vanish
                if (alpha <= 0) continue;
                r.globalAlpha = alpha;
                this.drawBlock(pal[game.getCell(i, j)], this.cellX(j), y, CELL, "locked");
            }
            r.globalAlpha = 1;
        }

        if (this.options.border) this.drawStackBorder(firstRow);

        // Draw current Piece: the highlight fades from "active" to "locked" as the
        // lock delay runs out, and comes back whenever a move resets the delay
        const lockLeft = 1 - Math.min(1, game.curPiece_lockDelay / game.lockDelayMax);
        for (const [i, j] of cells) {
            const row = game.getCurPiece_row() + i;
            if (row < firstRow) continue;
            const x = this.cellX(col + j), y = this.cellY(row);
            if (lockLeft < 1) this.drawBlock(color, x, y, CELL, "locked");
            r.globalAlpha = lockLeft;
            this.drawBlock(color, x, y, CELL, "active");
            r.globalAlpha = 1;
        }
        r.restore();

        this.drawDropFlashes();
        this.drawFlashes();
    }

    // TGM-style border: a light line along every side of the settled stack that faces an empty
    // cell, drawn on the block's own edge so it never reaches outside the stack; none along the
    // walls and floor. Rows falling during a line clear are outlined on their own, and blocks
    // fading in the staff roll take their border with them
    drawStackBorder(firstRow) {
        const r = this.r, game = this.game, w = STACK_BORDER_W, c = STACK_BORDER_COLOR;
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
                const top = open(i - 1, j, off), bottom = open(i + 1, j, off);
                if (top) r.rect(x, y, CELL, w, c);
                if (bottom) r.rect(x, y + CELL - w, CELL, w, c);
                // side lines stop short of the top and bottom lines, so corners aren't drawn twice
                const y0 = top ? y + w : y, y1 = bottom ? y + CELL - w : y + CELL;
                if (open(i, j - 1, off)) r.rect(x, y0, w, y1 - y0, c);
                if (open(i, j + 1, off)) r.rect(x + CELL - w, y0, w, y1 - y0, c);
                // inner corners: both neighbours filled, the cell between them empty
                for (let di = -1; di <= 1; di += 2) {
                    if (open(i + di, j, off)) continue;
                    const cy = di < 0 ? y : y + CELL - w;
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
    drawClearMessage(top) {
        const game = this.game;
        const age = game.actionAge + this.tickPhase; // frames, and how far into the next one
        if (!game.actions.length || age >= MESSAGE_LIFE) return;
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
    }

    // The message lines with their shadows, rendered into a texture once per set of
    // actions. Sharp up to the biggest pop scale.
    messageTexture(actions) {
        const cached = this.messageCache;
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
        this.messageCache = { actions, count: actions.length, tex: this.r.texture(canvas), pad, res, anchor };
        return this.messageCache;
    }

    drawSidePanels() {
        const game = this.game;

        // HOLD (TAP has none)
        if (game.hasHold) {
            this.label("HOLD", LEFT_X, this.boardY + 4, SIDE_W);
            this.panel(LEFT_X, this.boardY + 18, SIDE_W, 110);
            this.drawPieceCentered(game.getHeldPiece(), LEFT_X + SIDE_W / 2, this.boardY + 18 + 55, 24, "locked", game);
        }

        // STATS
        // First entry is the rule set (name) and its mode (value), shown under a RULESET label
        // placed as for the standard well: a shorter one (GB) would leave five rows no room above the wordmark
        let y = BOARD_Y + 170;
        const stats = game.getStats();
        const step = stats.length > 4 ? 70 : 80; // five rows must still clear the wordmark
        stats.forEach(([name, value], n) => {
            if (n === 0) {
                this.label("RULESET", LEFT_X, y, SIDE_W);
                this.text(name, LEFT_X, y + 32, { size: 20, weight: 800, color: INK, spacing: 3 });
                this.text(value, LEFT_X, y + 54, { size: 14, weight: 800, color: INK_DIM, spacing: 3 });
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

        // Wordmark
        this.colorStripe(LEFT_X, this.boardY + this.boardH - 26, 70, 3);
        this.text("QUADBRICKS", LEFT_X,this.boardY + this.boardH - 6, { size: 18, weight: 900, color: INK_DIM, spacing: 5 });

        // NEXT
        this.label("NEXT", RIGHT_X, this.boardY + 4, SIDE_W);
        this.panel(RIGHT_X, this.boardY + 18, SIDE_W, 110);
        this.drawPieceCentered(game.rnd_get_queue(0), RIGHT_X + SIDE_W / 2, this.boardY + 18 + 55, 24, "locked", game);
        // the rest of the rule set's preview, tighter when there are more than two
        // (none for TAP's single next piece)
        const rest = game.nextCount - 1;
        if (rest > 0) {
            const spacing = rest > 2 ? 50 : 80, size = rest > 2 ? 16 : 18;
            const listH = rest * spacing + 10;
            this.panel(RIGHT_X, this.boardY + 140, SIDE_W, listH);
            for (let n = 1; n <= rest; n++) {
                const y = this.boardY + 140 + 5 + spacing / 2 + (n - 1) * spacing;
                this.drawPieceCentered(game.rnd_get_queue(n), RIGHT_X + SIDE_W / 2, y, size, "locked", game);
            }
            this.drawClearMessage(this.boardY + 140 + listH + 30);
        } else {
            this.drawClearMessage(this.boardY + 140 + 20);
        }
    }

    // The compact layout's columns: HOLD over the stats on the left, NEXT and the rest of the
    // preview on the right; clear messages show over the well
    drawCompactPanels() {
        const game = this.game;
        const { leftX, rightX, sideW } = this.layout;
        const box = 64, size = 14; // HOLD and first NEXT panels, and their pieces
        const top = this.boardY + 4;
        // type size for a value, shrunk to the column (measured with zeros, so numbers don't change size as they count)
        const fitted = (s, max) => Math.min(max, Math.floor(max * sideW / this.measureText(s.replace(/\d/g, "0"), max, 800, 1)));

        let y = top;
        if (game.hasHold) {
            this.label("HOLD", leftX, y, sideW, 10, 3);
            this.panel(leftX, y + 12, sideW, box);
            this.drawPieceCentered(game.getHeldPiece(), leftX + sideW / 2, y + 12 + box / 2, size, "locked", game);
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

        this.label("NEXT", rightX, top, sideW, 10, 3);
        this.panel(rightX, top + 12, sideW, box);
        this.drawPieceCentered(game.rnd_get_queue(0), rightX + sideW / 2, top + 12 + box / 2, size, "locked", game);
        const rest = game.nextCount - 1;
        if (rest > 0) {
            const spacing = rest > 2 ? 42 : 50, listTop = top + 12 + box + 10;
            this.panel(rightX, listTop, sideW, rest * spacing + 8);
            for (let n = 1; n <= rest; n++) {
                this.drawPieceCentered(game.rnd_get_queue(n), rightX + sideW / 2, listTop + 4 + spacing * (n - 0.5), rest > 2 ? 11 : 12, "locked", game);
            }
        }
        this.drawClearMessage(this.boardY + this.boardH * 0.3);
    }

    // Start countdown 3, 2, 1: each digit slides in and fades out within its half second, the
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
    boardBanner(title, sub, alpha, accent = INK) {
        const r = this.r;
        const cy = this.bandY();
        r.save();
        r.globalAlpha = alpha;
        this.drawBand(cy, sub ? 96 : 70, accent);
        // long titles ("GRAND MASTER") shrink to the board width
        const size = Math.min(34, Math.floor(34 * (BOARD_W - 16) / this.measureText(title, 34, 900, 8)));
        this.text(title, BOARD_X + BOARD_W / 2, cy - (sub ? 12 : 0), { size, weight: 900, color: accent === INK ? INK : accent, align: "center", spacing: 8 });
        if (sub) this.text(sub, BOARD_X + BOARD_W / 2, cy + 26, { size: 11, weight: 700, color: INK_DIM, align: "center", spacing: 3 });
        r.restore();
    }
}
