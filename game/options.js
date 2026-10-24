// Player options, kept in localStorage: key bindings, block style, effects and motion, and
// the Guideline handling.
// Storage can be unavailable (private windows, blocked site data); the game then
// runs on the defaults and simply doesn't remember changes.

const OPTIONS_STORAGE_KEY = "quadbricks.options";

// Rebindable actions, in the order the controls screen lists them
const KEY_ACTIONS = [
    { id: "left", name: "Move left" },
    { id: "right", name: "Move right" },
    { id: "soft", name: "Soft drop" },
    { id: "hard", name: "Hard drop" },
    { id: "rotl", name: "Rotate left" },
    { id: "rotr", name: "Rotate right" },
    { id: "hold", name: "Hold" },
    { id: "sound", name: "Sound on/off" },
];

const DEFAULT_KEYS = {
    left: "ArrowLeft", right: "ArrowRight", soft: "ArrowDown", hard: "ArrowUp",
    rotl: "KeyZ", rotr: "KeyX", hold: "Space", sound: "KeyM",
};

// Board size as a share of the largest size that fits the window (fullscreen can be huge)
const SCALE_STEPS = [1, 0.9, 0.8, 0.7, 0.6, 0.5];

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
// Frame ranges [min, max] for DAS, ARR and DCD; soft drop factors (Infinity: instant)
const HANDLING_RANGES = { das: [1, 20], arr: [0, 5], dcd: [0, 20] };
const SDF_STEPS = [5, 10, 20, 40, Infinity];

// Index i stepped by dir through n values: wraps around, or stops at the ends (held keys)
function stepIndex(i, dir, n, wrap = true) {
    return wrap ? (i + dir + n) % n : Math.max(0, Math.min(n - 1, i + dir));
}

class Options {
    constructor() {
        this.keys = { ...DEFAULT_KEYS };
        this.tileset = TILESET_IDS[0];
        this.effects = DEFAULT_EFFECTS; // level: 0 off, then index into EFFECT_LEVELS
        this.backdrop = true; // animated backdrop: colour wash and drifting lights
        this.rings = "ripple"; // line clear shockwaves, an id from RING_MODES (strength follows the effects level)
        this.tilt = DEFAULT_TILT; // playing field tilt: index into TILT_LEVELS
        this.shake = true; // playing field shakes on hard drops
        this.scale = SCALE_STEPS[0];
        // Guideline handling: frames for das, arr and dcd, sdf from SDF_STEPS (see GUIDELINE_HANDLING)
        this.das = GUIDELINE_HANDLING.das;
        this.arr = GUIDELINE_HANDLING.arr;
        this.dcd = GUIDELINE_HANDLING.dcd;
        this.sdf = GUIDELINE_HANDLING.sdf;
        this.ghost = GUIDELINE_HANDLING.ghost;
        this.dropGuard = GUIDELINE_HANDLING.dropGuard;
        try {
            const saved = JSON.parse(localStorage.getItem(OPTIONS_STORAGE_KEY) || "{}");
            if (saved.keys) {
                for (const { id } of KEY_ACTIONS) {
                    if (typeof saved.keys[id] === "string") this.keys[id] = saved.keys[id];
                }
            }
            if (TILESET_IDS.includes(saved.tileset)) this.tileset = saved.tileset;
            if (typeof saved.effects === "boolean") this.effects = saved.effects ? DEFAULT_EFFECTS : 0;
            else if (Number.isInteger(saved.effects) && saved.effects >= 0 && saved.effects < EFFECT_LEVELS.length) this.effects = saved.effects;
            if (typeof saved.backdrop === "boolean") this.backdrop = saved.backdrop;
            if (RING_MODE_IDS.includes(saved.rings)) this.rings = saved.rings;
            else if (typeof saved.rings === "boolean" || Number.isInteger(saved.rings)) // older versions: on/off or a level
                this.rings = saved.rings ? "rings" : "off";
            if (Number.isInteger(saved.tilt) && saved.tilt >= 0 && saved.tilt < TILT_LEVELS.length) this.tilt = saved.tilt;
            if (typeof saved.shake === "boolean") this.shake = saved.shake;
            if (SCALE_STEPS.includes(saved.scale)) this.scale = saved.scale;
            for (const [id, [min, max]] of Object.entries(HANDLING_RANGES)) {
                if (Number.isInteger(saved[id]) && saved[id] >= min && saved[id] <= max) this[id] = saved[id];
            }
            const sdf = saved.sdf === null ? Infinity : saved.sdf; // JSON has no Infinity
            if (SDF_STEPS.includes(sdf)) this.sdf = sdf;
            if (typeof saved.ghost === "boolean") this.ghost = saved.ghost;
            if (typeof saved.dropGuard === "boolean") this.dropGuard = saved.dropGuard;
        } catch (e) { /* storage unavailable or corrupt: defaults */ }
    }

    save() {
        try {
            localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify({ keys: this.keys, tileset: this.tileset, effects: this.effects, backdrop: this.backdrop, rings: this.rings, tilt: this.tilt, shake: this.shake, scale: this.scale,
                das: this.das, arr: this.arr, dcd: this.dcd, sdf: Number.isFinite(this.sdf) ? this.sdf : null, ghost: this.ghost, dropGuard: this.dropGuard }));
        } catch (e) { /* storage unavailable */ }
    }

    // Bind a key to an action; an action already using that key takes over the old one
    bind(action, code) {
        if (RESERVED_KEYS.includes(code)) return false;
        const old = this.keys[action];
        for (const { id } of KEY_ACTIONS) {
            if (id !== action && this.keys[id] === code) this.keys[id] = old;
        }
        this.keys[action] = code;
        this.save();
        return true;
    }

    resetKeys() {
        this.keys = { ...DEFAULT_KEYS };
        this.save();
    }

    cycleTileset(dir, wrap = true) {
        this.tileset = TILESET_IDS[stepIndex(TILESET_IDS.indexOf(this.tileset), dir, TILESET_IDS.length, wrap)];
        this.save();
    }

    cycleEffects(dir, wrap = true) {
        this.effects = stepIndex(this.effects, dir, EFFECT_LEVELS.length, wrap);
        this.save();
    }

    cycleRings(dir, wrap = true) {
        this.rings = RING_MODE_IDS[stepIndex(RING_MODE_IDS.indexOf(this.rings), dir, RING_MODE_IDS.length, wrap)];
        this.save();
    }

    toggleBackdrop() {
        this.backdrop = !this.backdrop;
        this.save();
    }

    cycleTilt(dir, wrap = true) {
        this.tilt = stepIndex(this.tilt, dir, TILT_LEVELS.length, wrap);
        this.save();
    }

    // Multiplier of the playing field's tilt angles (0 when off)
    get tiltAngle() { return TILT_LEVELS[this.tilt].angle; }

    toggleShake() {
        this.shake = !this.shake;
        this.save();
    }

    // Strength multiplier of the visual effects (0 when off)
    get effectScale() { return EFFECT_LEVELS[this.effects].scale; }

    cycleScale(dir, wrap = true) {
        this.scale = SCALE_STEPS[stepIndex(SCALE_STEPS.indexOf(this.scale), dir, SCALE_STEPS.length, wrap)];
        this.save();
    }

    // DAS, ARR or DCD: a frame up or down within HANDLING_RANGES
    stepFrames(id, dir, wrap = true) {
        const [min, max] = HANDLING_RANGES[id];
        this[id] = min + stepIndex(this[id] - min, dir, max - min + 1, wrap);
        this.save();
    }

    cycleSdf(dir, wrap = true) {
        this.sdf = SDF_STEPS[stepIndex(SDF_STEPS.indexOf(this.sdf), dir, SDF_STEPS.length, wrap)];
        this.save();
    }

    toggleGhost() {
        this.ghost = !this.ghost;
        this.save();
    }

    toggleDropGuard() {
        this.dropGuard = !this.dropGuard;
        this.save();
    }

    resetHandling() {
        Object.assign(this, GUIDELINE_HANDLING);
        this.save();
    }

    // The Guideline handling for RuleGame
    get handling() {
        return { das: this.das, arr: this.arr, dcd: this.dcd, sdf: this.sdf, ghost: this.ghost, dropGuard: this.dropGuard };
    }

    // Action bound to a key code, or null
    actionFor(code) {
        for (const { id } of KEY_ACTIONS) if (this.keys[id] === code) return id;
        return null;
    }
}
