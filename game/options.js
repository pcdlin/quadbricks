// Player options, kept in localStorage: key and gamepad bindings, theme, block style, effects and motion, and
// the Guideline handling.
// Storage can be unavailable (private windows, blocked site data); the game then
// runs on the defaults and simply doesn't remember changes.

const OPTIONS_STORAGE_KEY = "quadbricks.options";
const RECORDS_STORAGE_KEY = "quadbricks.records";
const EXAMS_STORAGE_KEY = "quadbricks.exams";

// Rebindable actions, in the order the controls screen lists them
const KEY_ACTIONS = [
    { id: "left", name: "Move left" },
    { id: "right", name: "Move right" },
    { id: "soft", name: "Soft drop" },
    { id: "hard", name: "Hard drop" },
    { id: "rotl", name: "Rotate left" },
    { id: "rotr", name: "Rotate right" },
    { id: "rot180", name: "Rotate 180°" }, // only with the Guideline's 180° rotation option on
    { id: "hold", name: "Hold" },
    { id: "sound", name: "Sound on/off" },
];

// Player 2's keys (local multiplayer on one keyboard): the same actions but the sound key, which
// stays player 1's and works for both
const PLAYER2_ACTIONS = KEY_ACTIONS.filter(a => a.id !== "sound");
// the actions that pick a player's input device on the multiplayer join screen
const JOIN_ACTIONS = ["rotl", "rotr", "rot180"];

// Each action takes up to MAX_KEYS_PER_ACTION keys (lists of KeyboardEvent.code), at least one
const DEFAULT_KEYS = {
    left: ["ArrowLeft"], right: ["ArrowRight"], soft: ["ArrowDown"], hard: ["ArrowUp"],
    rotl: ["KeyZ"], rotr: ["KeyX"], rot180: ["KeyA"], hold: ["Space"], sound: ["KeyM"],
};
// player 2's, clear of player 1's: ESDF to move and drop, W and R to turn, Q 180°, left Shift hold
const DEFAULT_KEYS2 = {
    left: ["KeyS"], right: ["KeyF"], soft: ["KeyD"], hard: ["KeyE"],
    rotl: ["KeyW"], rotr: ["KeyR"], rot180: ["KeyQ"], hold: ["ShiftLeft"],
};
const MAX_KEYS_PER_ACTION = 2;
const copyTable = table => Object.fromEntries(Object.entries(table).map(([id, codes]) => [id, [...codes]]));
const defaultKeys = () => copyTable(DEFAULT_KEYS);
const defaultKeys2 = () => copyTable(DEFAULT_KEYS2);

// Gamepad bindings: per action, up to MAX_KEYS_PER_ACTION controls of the standard layout, a button
// index or a left stick direction (PAD_STICK). Start (PAD_START) can't be bound: it opens the menu
const PAD_STICK = { left: 100, right: 101, up: 102, down: 103 };
const PAD_START = 9;
const DEFAULT_PAD = {
    left: [14, PAD_STICK.left], right: [15, PAD_STICK.right], soft: [13, PAD_STICK.down], hard: [12],
    rotl: [1, 2], rotr: [0], rot180: [3], hold: [4, 5], sound: [8],
};
const defaultPad = () => copyTable(DEFAULT_PAD);
const PAD_LABELS = {
    0: "A", 1: "B", 2: "X", 3: "Y", 4: "LB", 5: "RB", 6: "LT", 7: "RT", 8: "BACK", 9: "START", 10: "LS", 11: "RS",
    12: "D ↑", 13: "D ↓", 14: "D ←", 15: "D →", 16: "HOME",
    [PAD_STICK.left]: "LS ←", [PAD_STICK.right]: "LS →", [PAD_STICK.up]: "LS ↑", [PAD_STICK.down]: "LS ↓",
};

// Short label for a gamepad control (Xbox names), for keycaps
function padLabel(id) {
    return PAD_LABELS[id] || "BTN " + id;
}

// Board size as a share of the largest size that fits the window (fullscreen can be huge)
const SCALE_STEPS = [0.5, 0.6, 0.7, 0.8, 0.9, 1]; // smallest first, so → makes it bigger

// Keys that keep their menu meaning and can't be bound
const RESERVED_KEYS = ["Escape"];

const KEY_LABELS = {
    ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓",
    Space: "SPACE", Enter: "ENTER", Escape: "ESC", Tab: "TAB", Backspace: "BKSP", CapsLock: "CAPS",
    ShiftLeft: "L-SHIFT", ShiftRight: "R-SHIFT", ControlLeft: "L-CTRL", ControlRight: "R-CTRL",
    AltLeft: "L-ALT", AltRight: "R-ALT", MetaLeft: "L-META", MetaRight: "R-META",
    Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\",
    Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/",
    Insert: "INS", Delete: "DEL", Home: "HOME", End: "END", PageUp: "PG UP", PageDown: "PG DN",
};

// Short label for a KeyboardEvent.code, for keycaps
function keyLabel(code) {
    if (KEY_LABELS[code]) return KEY_LABELS[code];
    let m;
    if ((m = /^Key([A-Z])$/.exec(code))) return m[1];
    if ((m = /^Digit(\d)$/.exec(code))) return m[1];
    if ((m = /^Numpad(.+)$/.exec(code))) return "NUM " + m[1].replace("Enter", "↵").toUpperCase();
    return code.toUpperCase();
}

// Effects intensity: name and strength multiplier (index 0 is off)
const EFFECT_LEVELS = [
    { name: "Off", scale: 0 },
    { name: "Subtle", scale: 0.5 },
    { name: "Normal", scale: 1 },
    { name: "Intense", scale: 1.7 },
];
const DEFAULT_EFFECTS = 2;

// 3D tilt of the playing field: name and angle multiplier (index 0 keeps it flat)
const TILT_LEVELS = [
    { name: "Off", angle: 0 },
    { name: "Subtle", angle: 0.5 },
    { name: "Normal", angle: 1 },
    { name: "Strong", angle: 1.8 },
];
const DEFAULT_TILT = 2;

// How hard hard drops, clears and border bumps shake the playing field (kick multiplier)
const SHAKE_LEVELS = [
    { name: "Off", scale: 0 },
    { name: "Subtle", scale: 0.5 },
    { name: "Normal", scale: 1 },
    { name: "Strong", scale: 1.7 },
];
const DEFAULT_SHAKE = 2;

// Line clear shockwaves: off, glowing rings, a ripple refracting the whole screen (splitting the
// colours at its front), or a lens flare along the cleared rows
const RING_MODES = [
    { id: "off", name: "Off" },
    { id: "rings", name: "Rings" },
    { id: "ripple", name: "Ripple" },
    { id: "flare", name: "Flare" },
];
const RING_MODE_IDS = RING_MODES.map(m => m.id);

// Line clear confetti: how the bits look and move (Engine.explodeCell(), drawParticles())
const CONFETTI_STYLES = [
    { id: "off", name: "Off" },
    { id: "glow", name: "Glow" },
    { id: "paper", name: "Paper" },
    { id: "sparks", name: "Sparks" },
    { id: "stars", name: "Stars" },
    { id: "bubbles", name: "Bubbles" },
    { id: "pixels", name: "Pixels" },
];
const CONFETTI_STYLE_IDS = CONFETTI_STYLES.map(s => s.id);

// Guideline handling (Options → Guideline), passed to RuleGame; defaults in GUIDELINE_HANDLING.
// Frames for DAS, ARR and DCD; soft drop factors (Infinity: instant)
const frameRange = (min, max) => Array.from({ length: max - min + 1 }, (_, i) => min + i);
const SDF_STEPS = [5, 10, 20, 40, Infinity];
const HANDLING_IDS = ["das", "arr", "sdf", "dcd", "ghost", "dropGuard", "previews", "holdPiece", "irs", "ihs", "rot180"];

// Settings stepped through a list of values (Options → Visuals and Guideline), and on/off settings
const OPTION_CHOICES = {
    theme: THEME_IDS,
    tileset: TILESET_IDS,
    confetti: CONFETTI_STYLE_IDS,
    effects: EFFECT_LEVELS.map((_, i) => i), // 0 off, then an index into EFFECT_LEVELS
    rings: RING_MODE_IDS,
    tilt: TILT_LEVELS.map((_, i) => i),
    shake: SHAKE_LEVELS.map((_, i) => i),
    scale: SCALE_STEPS,
    das: frameRange(1, 20),
    arr: frameRange(0, 5),
    dcd: frameRange(0, 20),
    sdf: SDF_STEPS,
    previews: frameRange(0, GUIDELINE_NEXT),
};
const OPTION_TOGGLES = ["flash", "backdrop", "trail", "border", "ghost", "dropGuard", "holdPiece", "irs", "ihs", "rot180"];

// Index i stepped by dir through n values: wraps around, or stops at the ends (held keys)
function stepIndex(i, dir, n, wrap = true) {
    return wrap ? (i + dir + n) % n : clamp(i + dir, 0, n - 1);
}

class Options {
    constructor() {
        this.keys = defaultKeys();
        this.keys2 = defaultKeys2(); // player 2's (PLAYER2_ACTIONS)
        this.pad = defaultPad();
        this.theme = THEME_IDS[0]; // the look around the blocks (themes.js)
        this.tileset = TILESET_IDS[0];
        this.confetti = "sparks"; // line clear confetti, an id from CONFETTI_STYLES
        this.effects = DEFAULT_EFFECTS;
        this.backdrop = true; // animated backdrop: colour wash and drifting lights
        this.rings = "flare"; // line clear shockwaves, an id from RING_MODES (strength follows the effects level)
        this.tilt = DEFAULT_TILT; // playing field tilt: index into TILT_LEVELS
        this.shake = DEFAULT_SHAKE; // playing field shake on hard drops, clears and bumps: index into SHAKE_LEVELS
        this.flash = true; // cleared rows light up as they go (only with effects on)
        this.trail = true; // streaks behind hard drops and rows falling into clears (only with effects on)
        this.border = false; // TGM-style light outline around the settled stack
        this.scale = 1; // the largest that fits
        Object.assign(this, GUIDELINE_HANDLING);
        try {
            const saved = JSON.parse(localStorage.getItem(OPTIONS_STORAGE_KEY) || "{}");
            for (const [field, actions] of [["keys", KEY_ACTIONS], ["keys2", PLAYER2_ACTIONS]]) {
                if (!saved[field]) continue;
                for (const { id } of actions) {
                    const codes = saved[field][id];
                    if (!Array.isArray(codes)) continue;
                    const valid = [...new Set(codes.filter(c => typeof c === "string" && !RESERVED_KEYS.includes(c)))];
                    if (valid.length) this[field][id] = valid.slice(0, MAX_KEYS_PER_ACTION);
                }
            }
            if (saved.pad) {
                for (const { id } of KEY_ACTIONS) {
                    const ids = saved.pad[id];
                    if (!Array.isArray(ids)) continue;
                    const valid = [...new Set(ids.filter(b => Number.isInteger(b) && b >= 0 && b !== PAD_START))];
                    if (valid.length) this.pad[id] = valid.slice(0, MAX_KEYS_PER_ACTION);
                }
            }
            if (saved.sdf === null) saved.sdf = Infinity; // JSON has no Infinity
            if (typeof saved.shake === "boolean") saved.shake = saved.shake ? DEFAULT_SHAKE : 0; // once on/off
            for (const [id, values] of Object.entries(OPTION_CHOICES)) {
                if (values.includes(saved[id])) this[id] = saved[id];
            }
            for (const id of OPTION_TOGGLES) {
                if (typeof saved[id] === "boolean") this[id] = saved[id];
            }
        } catch (e) { /* storage unavailable or corrupt: defaults */ }
    }

    save() {
        const saved = { keys: this.keys, keys2: this.keys2, pad: this.pad };
        for (const id of [...Object.keys(OPTION_CHOICES), ...OPTION_TOGGLES]) saved[id] = this[id];
        if (!Number.isFinite(saved.sdf)) saved.sdf = null;
        try {
            localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(saved));
        } catch (e) { /* storage unavailable */ }
    }

    // Add a key to an action. A key the action already has is removed instead (unless it is its
    // only one); a key past MAX_KEYS_PER_ACTION replaces the action's oldest. Another action using
    // the key loses it, and if that was its only key it takes the replaced one (or, with none
    // replaced, swaps: it gets this action's old key, which this action gives up)
    // player: 1 or 2, whose keys. The other player's keys give the key up where that leaves the
    // action another one (else both have it); player 2 can't take player 1's sound key
    bind(action, code, player = 1) {
        if (RESERVED_KEYS.includes(code) || (player === 2 && this.keys.sound.includes(code))) return false;
        const [mine, theirs] = player === 2 ? [this.keys2, this.keys] : [this.keys, this.keys2];
        bindIn(mine, action, code);
        for (const codes of Object.values(theirs)) {
            if (codes.includes(code) && codes.length > 1) codes.splice(codes.indexOf(code), 1);
        }
        this.save();
        return true;
    }

    // The same for a gamepad control (a button index or PAD_STICK direction)
    bindPad(action, button) {
        if (button === PAD_START) return false;
        bindIn(this.pad, action, button);
        this.save();
        return true;
    }

    resetKeys(player = 1) {
        if (player === 2) this.keys2 = defaultKeys2();
        else this.keys = defaultKeys();
        this.save();
    }

    // A player's key table (1 or 2)
    keysOf(player) {
        return player === 2 ? this.keys2 : this.keys;
    }

    resetPad() {
        this.pad = defaultPad();
        this.save();
    }

    // A setting from OPTION_CHOICES stepped by dir (-1 or 1); wrap false (key held) stops at the
    // first or last value. On/off settings flip, but not for a held key
    step(id, dir, wrap = true) {
        if (OPTION_TOGGLES.includes(id)) {
            if (!wrap) return;
            this[id] = !this[id];
        } else {
            const values = OPTION_CHOICES[id];
            this[id] = values[stepIndex(values.indexOf(this[id]), dir, values.length, wrap)];
        }
        this.save();
    }

    // Multiplier of the playing field's tilt angles (0 when off, or with effects off)
    get tiltAngle() { return this.effects ? TILT_LEVELS[this.tilt].angle : 0; }

    // Multiplier of the field's shake on hard drops, clears and bumps (0 when off, or with effects off)
    get shakeScale() { return this.effects ? SHAKE_LEVELS[this.shake].scale : 0; }

    // Strength multiplier of the visual effects (0 when off)
    get effectScale() { return EFFECT_LEVELS[this.effects].scale; }

    resetHandling() {
        Object.assign(this, GUIDELINE_HANDLING);
        this.save();
    }

    // The Guideline handling for RuleGame
    get handling() {
        return Object.fromEntries(HANDLING_IDS.map(id => [id, this[id]]));
    }

    // Action bound to a key code in a player's keys (1 or 2), or null
    actionFor(code, player = 1) {
        const table = this.keysOf(player);
        for (const id in table) if (table[id].includes(code)) return id;
        return null;
    }

    // Action bound to a gamepad control, or null
    padActionFor(button) {
        for (const { id } of KEY_ACTIONS) if (this.pad[id].includes(button)) return id;
        return null;
    }
}

// Options.bind() on a binding table (action -> list of keys or pad controls)
function bindIn(table, action, code) {
    const keys = table[action];
    if (keys.includes(code)) {
        if (keys.length > 1) keys.splice(keys.indexOf(code), 1);
        return;
    }
    keys.push(code);
    const replaced = keys.length > MAX_KEYS_PER_ACTION ? keys.shift() : null;
    for (const id in table) {
        const other = table[id];
        if (id === action || !other.includes(code)) continue;
        other.splice(other.indexOf(code), 1);
        if (!other.length) other.push(replaced ?? keys.shift());
    }
}

// TGM3 Master's qualified grade, per rule ("world", "classic"): the promotional and demotional exams'
// state (TGM3_EXAM_START; see tgm3ExamFor and tgm3ExamAfter in rules-tgm.js). Kept in localStorage.
class Exams {
    constructor() {
        this.state = {};
        try {
            const saved = JSON.parse(localStorage.getItem(EXAMS_STORAGE_KEY) || "{}");
            for (const [rule, s] of Object.entries(saved)) {
                if (s && Number.isInteger(s.qualified) && Number.isInteger(s.demotion) && Array.isArray(s.history)
                    && s.history.every(Number.isInteger)) this.state[rule] = s;
            }
        } catch (e) { /* storage unavailable or corrupt: everyone starts at 9 */ }
    }

    get(rule) {
        return this.state[rule] || { ...TGM3_EXAM_START, history: [] };
    }

    set(rule, state) {
        this.state[rule] = state;
        try {
            localStorage.setItem(EXAMS_STORAGE_KEY, JSON.stringify(this.state));
        } catch (e) { /* not remembered */ }
    }
}

// Personal records: the best result of each game setup (Engine.recordKey), as RuleGame.record()
// gives it: { key: numbers compared in order, higher is better; text }. Kept in localStorage.
class Records {
    constructor() {
        this.best = {};
        try {
            const saved = JSON.parse(localStorage.getItem(RECORDS_STORAGE_KEY) || "{}");
            for (const [setup, r] of Object.entries(saved)) {
                if (r && Array.isArray(r.key) && r.key.every(Number.isFinite) && typeof r.text === "string") this.best[setup] = r;
            }
        } catch (e) { /* storage unavailable or corrupt: no records */ }
    }

    get(setup) {
        return this.best[setup] || null;
    }

    // A finished game's result: kept, and true, when it beats the best so far (or is the first)
    submit(setup, result) {
        const old = this.best[setup];
        if (old && !betterRecord(result.key, old.key)) return false;
        this.best[setup] = { key: result.key, text: result.text };
        try {
            localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(this.best));
        } catch (e) { /* not remembered */ }
        return true;
    }
}

// Whether record key a beats b: the first number that differs decides
function betterRecord(a, b) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if ((a[i] ?? -Infinity) !== (b[i] ?? -Infinity)) return (a[i] ?? -Infinity) > (b[i] ?? -Infinity);
    }
    return false;
}
