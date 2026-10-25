// Player options, kept in localStorage: key bindings, block style, effects and motion, and
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

// Each action takes up to MAX_KEYS_PER_ACTION keys (lists of KeyboardEvent.code), at least one
const DEFAULT_KEYS = {
    left: ["ArrowLeft"], right: ["ArrowRight"], soft: ["ArrowDown"], hard: ["ArrowUp"],
    rotl: ["KeyZ"], rotr: ["KeyX"], rot180: ["KeyA"], hold: ["Space"], sound: ["KeyM"],
};
// Keys for an action saved settings don't have yet (one added since) when its default is taken
const SPARE_KEYS = ["KeyA", "KeyS", "KeyC", "KeyQ", "KeyW", "KeyD"];
const MAX_KEYS_PER_ACTION = 2;
const defaultKeys = () => Object.fromEntries(Object.entries(DEFAULT_KEYS).map(([id, codes]) => [id, [...codes]]));

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

// Line clear shockwaves: off, glowing rings, or a ripple refracting the whole screen
const RING_MODES = [
    { id: "off", name: "Off" },
    { id: "rings", name: "Rings" },
    { id: "ripple", name: "Ripple" },
];
const RING_MODE_IDS = RING_MODES.map(m => m.id);

// Guideline handling (Options → Guideline), passed to RuleGame; defaults in GUIDELINE_HANDLING.
// Frames for DAS, ARR and DCD; soft drop factors (Infinity: instant)
const frameRange = (min, max) => Array.from({ length: max - min + 1 }, (_, i) => min + i);
const SDF_STEPS = [5, 10, 20, 40, Infinity];
const HANDLING_IDS = ["das", "arr", "sdf", "dcd", "ghost", "dropGuard", "previews", "holdPiece", "irs", "ihs", "rot180"];

// Settings stepped through a list of values (Options → Visuals and Guideline), and on/off settings
const OPTION_CHOICES = {
    tileset: TILESET_IDS,
    effects: EFFECT_LEVELS.map((_, i) => i), // 0 off, then an index into EFFECT_LEVELS
    rings: RING_MODE_IDS,
    tilt: TILT_LEVELS.map((_, i) => i),
    scale: SCALE_STEPS,
    das: frameRange(1, 20),
    arr: frameRange(0, 5),
    dcd: frameRange(0, 20),
    sdf: SDF_STEPS,
    previews: frameRange(0, GUIDELINE_NEXT),
};
const OPTION_TOGGLES = ["backdrop", "shake", "trail", "border", "ghost", "dropGuard", "holdPiece", "irs", "ihs", "rot180"];

// Index i stepped by dir through n values: wraps around, or stops at the ends (held keys)
function stepIndex(i, dir, n, wrap = true) {
    return wrap ? (i + dir + n) % n : clamp(i + dir, 0, n - 1);
}

class Options {
    constructor() {
        this.keys = defaultKeys();
        this.tileset = TILESET_IDS[0];
        this.effects = DEFAULT_EFFECTS;
        this.backdrop = true; // animated backdrop: colour wash and drifting lights
        this.rings = "ripple"; // line clear shockwaves, an id from RING_MODES (strength follows the effects level)
        this.tilt = DEFAULT_TILT; // playing field tilt: index into TILT_LEVELS
        this.shake = true; // playing field shakes on hard drops
        this.trail = true; // streaks behind hard drops and rows falling into clears (only with effects on)
        this.border = false; // TGM-style light outline around the settled stack
        this.scale = 1; // the largest that fits
        Object.assign(this, GUIDELINE_HANDLING);
        try {
            const saved = JSON.parse(localStorage.getItem(OPTIONS_STORAGE_KEY) || "{}");
            if (saved.keys) {
                const missing = [];
                for (const { id } of KEY_ACTIONS) {
                    let codes = saved.keys[id];
                    if (typeof codes === "string") codes = [codes]; // older versions: one key per action
                    if (!Array.isArray(codes)) { missing.push(id); continue; }
                    codes = [...new Set(codes.filter(c => typeof c === "string" && !RESERVED_KEYS.includes(c)))];
                    if (codes.length) this.keys[id] = codes.slice(0, MAX_KEYS_PER_ACTION);
                }
                // an action added since: its default key, or a spare one, that no other action uses
                for (const id of missing) {
                    const taken = KEY_ACTIONS.filter(a => a.id !== id).flatMap(a => this.keys[a.id]);
                    const free = [...DEFAULT_KEYS[id], ...SPARE_KEYS].find(c => !taken.includes(c));
                    if (free) this.keys[id] = [free];
                }
            }
            if (saved.sdf === null) saved.sdf = Infinity; // JSON has no Infinity
            if (saved.tileset === "gameboy") saved.tileset = "retro1989"; // the 1989 style's old id
            for (const [id, values] of Object.entries(OPTION_CHOICES)) {
                if (values.includes(saved[id])) this[id] = saved[id];
            }
            for (const id of OPTION_TOGGLES) {
                if (typeof saved[id] === "boolean") this[id] = saved[id];
            }
            // older versions: effects and rings on/off, rings also as a level
            if (typeof saved.effects === "boolean") this.effects = saved.effects ? DEFAULT_EFFECTS : 0;
            if (typeof saved.rings === "boolean" || Number.isInteger(saved.rings)) this.rings = saved.rings ? "rings" : "off";
        } catch (e) { /* storage unavailable or corrupt: defaults */ }
    }

    save() {
        const saved = { keys: this.keys };
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
    bind(action, code) {
        if (RESERVED_KEYS.includes(code)) return false;
        const keys = this.keys[action];
        if (keys.includes(code)) {
            if (keys.length > 1) keys.splice(keys.indexOf(code), 1);
        } else {
            keys.push(code);
            const replaced = keys.length > MAX_KEYS_PER_ACTION ? keys.shift() : null;
            for (const { id } of KEY_ACTIONS) {
                const other = this.keys[id];
                if (id === action || !other.includes(code)) continue;
                other.splice(other.indexOf(code), 1);
                if (!other.length) other.push(replaced ?? keys.shift());
            }
        }
        this.save();
        return true;
    }

    resetKeys() {
        this.keys = defaultKeys();
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

    // Multiplier of the playing field's tilt angles (0 when off)
    get tiltAngle() { return TILT_LEVELS[this.tilt].angle; }

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

    // Action bound to a key code, or null
    actionFor(code) {
        for (const { id } of KEY_ACTIONS) if (this.keys[id].includes(code)) return id;
        return null;
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
