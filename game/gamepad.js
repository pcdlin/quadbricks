// Gamepads (the Gamepad API's "standard" layout: Xbox, PlayStation, Switch Pro and most others).
// Polled once a game frame (poll()), each connected pad on its own (by its index in getGamepads()).
// In games the buttons and left stick directions act as bound for that pad (Options.padTable(), by
// padKey(); Options → Gamepad sets up each connected pad; defaults DEFAULT_PAD: D-pad or stick to
// move, D-pad up hard drop, A rotate right, B and X left, Y 180°, LB/RB hold, Back sound): each pad's actions go to the engine tagged with the pad
// (Engine.padAction), so in a two-player game every pad drives its own player and in a one-player
// game any pad drives it. Start opens the menu (Escape). Menus take fixed buttons on any pad
// (PAD_MENU: D-pad or stick, A OK, B and Start back), fed as the keyboard's key events
// (Engine.onKey). On the multiplayer join screen a pad's rotate buttons pick it for the next player
// (Engine.joinDevice), Start goes back. A control held when the mode changes (game, menu, join) does
// nothing until let go, so the A that starts a game doesn't also turn its first piece. On the
// Gamepad screen the engine's padCapturing names the action waiting for a control: the next one
// pressed on the pad being set up (Engine.configPad()) is bound to it (Start cancels).

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
        this.mode = null;          // "game", "menu" or "join"
        // "pad:control" (a pad's index, a button index or PAD_STICK direction) -> what it sends:
        // { code } a key event, { action } a game action of that pad, { join } a join press
        this.held = new Map();
        this.ignored = new Set();  // "pad:control" held over a mode switch or a binding, ignored until let go
        this.sticks = new Map();   // pad index -> directions its stick holds (with hysteresis)
        this.repeatAt = 0;         // when the held menu direction repeats next
        this.active = false;       // the last input came from a pad (the hints then name its buttons)
        this.connected = false;    // a pad has been seen (browsers show one only after a button press)
        this.pads = [];            // indices of the connected pads
        this.keys = new Map();     // pad index -> its key for the bindings (padKey())
        this.names = new Map();    // pad index -> { id, name }: the browser's id and the name shown (padName())
        this.pressed = new Set();  // "pad:control" pressed in the last poll
        this.last = null;          // the pad pressed last (Options → Gamepad opened from it sets it up)
    }

    // A pad's key for its bindings: the browser's id (its model) with how many pads of the same id come
    // before it ("#1" for the first), so two pads of a model each keep their own
    padKey(pad) {
        return this.keys.get(pad) ?? "";
    }

    // A pad's name for the menu: its id without the browser's vendor and layout notes
    padName(pad) {
        const named = this.names.get(pad);
        return named ? named.name : "GAMEPAD";
    }

    // Some control of the pad is pressed (the Gamepad screen shows which pad is which)
    pressing(pad) {
        for (const key of this.pressed) if (key.startsWith(pad + ":")) return true;
        return false;
    }

    // Controls pressed, as "pad:control" strings, on every connected pad
    read() {
        const pressed = new Set();
        let pads;
        try { pads = navigator.getGamepads(); } catch (e) { return pressed; }
        const sticks = new Map(), models = new Map();
        this.pads = [];
        this.keys.clear();
        for (const pad of pads) {
            if (!pad || !pad.connected) continue;
            const n = pad.index;
            this.pads.push(n);
            const id = String(pad.id || ""), count = (models.get(id) || 0) + 1;
            models.set(id, count);
            this.keys.set(n, id + "#" + count);
            if (!this.names.has(n) || this.names.get(n).id !== id) this.names.set(n, { id, name: shortPadName(id) });
            pad.buttons.forEach((b, i) => { if (b.pressed || b.value > 0.5) pressed.add(n + ":" + i); });
            const x = pad.axes[0] || 0, y = pad.axes[1] || 0;
            // one direction at a time, the stronger axis; a held one lets go only below PAD_STICK_OFF
            const along = Math.abs(x) >= Math.abs(y) ? (x < 0 ? "left" : "right") : (y < 0 ? "up" : "down");
            const amount = Math.max(Math.abs(x), Math.abs(y));
            const was = this.sticks.get(n);
            if (amount >= PAD_STICK_ON || (amount >= PAD_STICK_OFF && was && was.has(along))) {
                sticks.set(n, new Set([along]));
                pressed.add(n + ":" + PAD_STICK[along]);
            }
        }
        this.sticks = sticks;
        this.connected = this.pads.length > 0;
        this.pressed = pressed;
        return pressed;
    }

    poll(ticks) {
        if (!this.available) return;
        const engine = this.engine;
        const mode = engine.GAMESTATE === STATE_GAME ? "game" : engine.menuStep === MENU_JOIN ? "join" : "menu";
        const pressed = this.read();
        if (engine.padCapturing) engine.configPad(); // cancels the binding if its pad went away
        if (mode !== this.mode) {
            for (const key of [...this.held.keys()]) this.release(key);
            this.ignored = new Set(pressed);
            this.mode = mode;
        }
        for (const key of [...this.ignored]) if (!pressed.has(key)) this.ignored.delete(key);
        for (const key of [...this.held.keys()]) if (!pressed.has(key)) this.release(key);
        for (const key of pressed) {
            if (this.held.has(key) || this.ignored.has(key)) continue;
            this.active = true;
            const [pad, id] = key.split(":").map(Number);
            this.last = pad;
            // the Gamepad screen waits for a control of the pad it sets up: this one is the binding
            // (the other pads do nothing meanwhile)
            if (engine.padCapturing) {
                if (pad !== engine.configPad()) { this.ignored.add(key); continue; }
                if (id !== PAD_START) engine.options.bindPad(this.padKey(pad), engine.padCapturing, id);
                engine.padCapturing = null;
                this.ignored.add(key);
                continue;
            }
            const sends = this.sendsFor(pad, id);
            if (!sends) continue;
            // the Keybinds screen waits for a key: only back (cancel) passes
            if (engine.capturing && sends.code !== "Escape") continue;
            const already = this.holding(sends, pad); // two controls on one action
            this.held.set(key, sends);
            if (!already) this.send(sends, pad, true);
            if (MENU_REPEAT_KEYS.includes(sends.code)) this.repeatAt = ticks + PAD_REPEAT_DELAY;
        }
        // held menu arrows repeat, the latest one pressed
        if (mode === "menu" && ticks >= this.repeatAt) {
            const dir = [...this.held.values()].reverse().find(s => MENU_REPEAT_KEYS.includes(s.code));
            if (dir) {
                engine.onKey(this.keyEvent(dir.code, true), true);
                this.repeatAt = ticks + PAD_REPEAT_RATE;
            }
        }
    }

    // What control id on a pad sends in the current mode (bindings can change between presses), or
    // null. The sound button works everywhere
    sendsFor(pad, id) {
        if (this.mode === "menu" && PAD_MENU[id]) return { code: PAD_MENU[id] };
        if (id === PAD_START) return { code: "Escape" };
        const action = this.engine.options.padActionFor(id, this.padKey(pad));
        if (action === "sound") return { code: this.engine.options.keys.sound[0] };
        if (this.mode === "join") return JOIN_ACTIONS.includes(action) ? { join: true } : null;
        return this.mode === "game" && action ? { action } : null;
    }

    // Something held already sends this (key events from any pad; actions and joins per pad)
    holding(sends, pad) {
        for (const [key, s] of this.held) {
            if (sends.code ? s.code === sends.code : (s.action === sends.action && s.join === sends.join && key.startsWith(pad + ":"))) return true;
        }
        return false;
    }

    send(sends, pad, down) {
        if (sends.code) this.engine.onKey(this.keyEvent(sends.code), down);
        else if (sends.action) this.engine.padAction(pad, sends.action, down);
        else if (sends.join && down) this.engine.joinDevice("pad:" + pad);
    }

    keyEvent(code, repeat = false) {
        return { code, repeat, ctrlKey: false, shiftKey: false, preventDefault() {} };
    }

    // Two controls may send the same (B and X both rotate left): it is let go with the last
    release(key) {
        const sends = this.held.get(key), pad = Number(key.split(":")[0]);
        this.held.delete(key);
        if (!this.holding(sends, pad)) this.send(sends, pad, false);
    }

    // The game actions a pad holds now (a resumed game releases the others)
    heldActions(pad) {
        const out = new Set();
        for (const [key, s] of this.held) if (s.action && key.startsWith(pad + ":")) out.add(s.action);
        return out;
    }
}

// A gamepad's id shortened for the menu: Chrome's "(STANDARD GAMEPAD Vendor: 054c Product: 09cc)" and
// Firefox's "054c-09cc-" left out
function shortPadName(id) {
    const name = id.replace(/\([^)]*\)/g, "").replace(/^[0-9a-f]{1,4}-[0-9a-f]{1,4}-/i, "").replace(/\s+/g, " ").trim();
    return (name || "Gamepad").toUpperCase();
}
