// Gamepads (the Gamepad API's "standard" layout: Xbox, PlayStation, Switch Pro and most others).
// Polled once a game frame (poll()); every connected pad counts, merged. Like the touch controls they
// feed the same key events as the keyboard (Engine.onKey), using each action's first key, so DAS/ARR,
// IRS and the menus work unchanged. In games the buttons and left stick directions act as bound in
// Options.pad (Options → Gamepad; defaults DEFAULT_PAD: D-pad or stick to move, D-pad up hard drop,
// A rotate right, B and X left, Y 180°, LB/RB hold, Back sound), and Start opens the menu. Menus take
// fixed buttons (PAD_MENU): D-pad or stick, A OK, B and Start back. A control held when the game
// switches between menu and game does nothing until let go, so the A that starts a game doesn't also
// turn its first piece. On the Gamepad screen the engine's padCapturing names the action waiting for a
// control: the next one pressed is bound to it (Start cancels).

const PAD_REPEAT_DELAY = 400; // ms before a held menu direction repeats
const PAD_REPEAT_RATE = 80;
const PAD_STICK_ON = 0.5;     // left stick deflection that presses a direction
const PAD_STICK_OFF = 0.35;   // ...and below which it lets go again
const PAD_MENU = {
    12: "ArrowUp", 13: "ArrowDown", 14: "ArrowLeft", 15: "ArrowRight",
    [PAD_STICK.up]: "ArrowUp", [PAD_STICK.down]: "ArrowDown", [PAD_STICK.left]: "ArrowLeft", [PAD_STICK.right]: "ArrowRight",
    0: "Enter", 1: "Escape", [PAD_START]: "Escape",
};

class GamepadControls {
    constructor(engine) {
        this.engine = engine;
        this.available = typeof navigator !== "undefined" && typeof navigator.getGamepads === "function";
        this.mode = null;          // "game" or "menu"
        this.held = new Map();     // control (button index or PAD_STICK direction) -> key code sent for it
        this.ignored = new Set();  // controls held over a mode switch or a binding, ignored until let go
        this.stick = new Set();    // directions the stick holds (with hysteresis)
        this.repeatAt = 0;         // when the held menu direction repeats next
        this.active = false;       // the last input came from a pad (the hints then name its buttons)
        this.connected = false;    // a pad has been seen (browsers show one only after a button press)
    }

    // Controls pressed on any connected pad
    read() {
        const pressed = new Set();
        let pads;
        try { pads = navigator.getGamepads(); } catch (e) { return pressed; }
        const stick = new Set();
        this.connected = false;
        for (const pad of pads) {
            if (!pad || !pad.connected) continue;
            this.connected = true;
            pad.buttons.forEach((b, i) => { if (b.pressed || b.value > 0.5) pressed.add(i); });
            const x = pad.axes[0] || 0, y = pad.axes[1] || 0;
            // one direction at a time, the stronger axis; a held one lets go only below PAD_STICK_OFF
            const along = Math.abs(x) >= Math.abs(y) ? (x < 0 ? "left" : "right") : (y < 0 ? "up" : "down");
            const amount = Math.max(Math.abs(x), Math.abs(y));
            if (amount >= PAD_STICK_ON || (amount >= PAD_STICK_OFF && this.stick.has(along))) stick.add(along);
        }
        this.stick = stick;
        for (const d of stick) pressed.add(PAD_STICK[d]);
        return pressed;
    }

    poll(ticks) {
        if (!this.available) return;
        const engine = this.engine;
        const mode = engine.GAMESTATE === STATE_GAME ? "game" : "menu";
        const pressed = this.read();
        if (mode !== this.mode) {
            for (const id of [...this.held.keys()]) this.release(id);
            this.ignored = new Set(pressed);
            this.mode = mode;
        }
        for (const id of [...this.ignored]) if (!pressed.has(id)) this.ignored.delete(id);
        for (const id of [...this.held.keys()]) if (!pressed.has(id)) this.release(id);
        for (const id of pressed) {
            if (this.held.has(id) || this.ignored.has(id)) continue;
            this.active = true;
            // the Gamepad screen waits for a control: this one is the binding
            if (engine.padCapturing) {
                if (id !== PAD_START) engine.options.bindPad(engine.padCapturing, id);
                engine.padCapturing = null;
                this.ignored.add(id);
                continue;
            }
            const code = this.codeFor(id);
            if (!code) continue;
            // the Keybinds screen waits for a key: only back (cancel) passes
            if (engine.capturing && code !== "Escape") continue;
            const already = [...this.held.values()].includes(code); // two controls on one action
            this.held.set(id, code);
            if (!already) this.send(code, true);
            if (MENU_REPEAT_KEYS.includes(code)) this.repeatAt = ticks + PAD_REPEAT_DELAY;
        }
        // held menu arrows repeat, the latest one pressed
        if (mode === "menu" && ticks >= this.repeatAt) {
            const dir = [...this.held.values()].reverse().find(c => MENU_REPEAT_KEYS.includes(c));
            if (dir) {
                this.send(dir, true, true);
                this.repeatAt = ticks + PAD_REPEAT_RATE;
            }
        }
    }

    // Key code of a control in the current mode (bindings can change between presses). The sound
    // button works in menus too
    codeFor(id) {
        if (this.mode === "menu" && PAD_MENU[id]) return PAD_MENU[id];
        if (id === PAD_START) return "Escape";
        const action = this.engine.options.padActionFor(id);
        if (!action || (this.mode === "menu" && action !== "sound")) return null;
        return this.engine.options.keys[action][0];
    }

    send(code, down, repeat = false) {
        this.engine.onKey({ code, repeat, ctrlKey: false, shiftKey: false, preventDefault() {} }, down);
    }

    // Two controls may send the same key (B and X both rotate left): it is let go with the last
    release(id) {
        const code = this.held.get(id);
        this.held.delete(id);
        if (![...this.held.values()].includes(code)) this.send(code, false);
    }
}
