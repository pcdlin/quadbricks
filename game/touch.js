// On-screen buttons for touch devices, in a bar below the playing view. They feed the same key
// events as the keyboard (Engine.onKey), so DAS/ARR, IRS and the menus work unchanged.
// Shown on devices whose main pointer is coarse; add ?touch=1 to the URL to force them.

const TOUCH_REPEAT_DELAY = 400; // ms before a held menu arrow repeats
const TOUCH_REPEAT_RATE = 80;

class TouchControls {
    constructor(engine) {
        this.engine = engine;
        this.enabled = /[?&]touch=1\b/.test(location.search) ||
            (window.matchMedia && matchMedia("(pointer: coarse)").matches);
        this.mode = null;
        this.held = new Map(); // pointerId -> { code, timer }
        if (!this.enabled) return;

        const style = document.createElement("style");
        style.textContent = `
            #touch { position: fixed; left: 0; right: 0; bottom: 0; display: none; box-sizing: border-box;
                padding: 8px 10px calc(8px + env(safe-area-inset-bottom)); gap: 10px;
                grid-template-columns: 1fr 1fr; touch-action: none; user-select: none; -webkit-user-select: none;
                -webkit-touch-callout: none; background: linear-gradient(to top, rgba(4,5,14,.9), rgba(4,5,14,.55)); }
            #touch .pad { display: grid; gap: 8px; grid-auto-rows: 1fr; }
            #touch .pad.three { grid-template-columns: repeat(3, 1fr); }
            #touch .pad.two { grid-template-columns: repeat(2, 1fr); }
            #touch button { all: unset; box-sizing: border-box; display: flex; align-items: center; justify-content: center;
                min-height: 0; border-radius: 14px; background: rgba(244,236,220,.1); border: 1px solid rgba(244,236,220,.28);
                color: #f4ecdc; font: 700 15px "Archivo", system-ui, sans-serif; letter-spacing: .5px;
                touch-action: none; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; }
            #touch button.down { background: rgba(244,236,220,.34); }
            #touch button.wide { grid-column: span 3; }
            #touch button.small { font-size: 12px; opacity: .8; }
            #touch button.empty { visibility: hidden; }`;
        document.head.appendChild(style);

        this.el = document.createElement("div");
        this.el.id = "touch";
        document.body.appendChild(this.el);
        this.el.addEventListener("contextmenu", (e) => e.preventDefault());
    }

    // Bar height in CSS pixels (0 when not shown); the view fits above it
    height() {
        if (!this.enabled) return 0;
        const h = window.innerHeight;
        return Math.round(Math.min(230, Math.max(110, h * 0.3)));
    }

    // Layouts per mode: [label, key code, class]; null leaves a gap
    layouts() {
        const k = this.engine.options.keys;
        return {
            game: [
                [["◀", k.left], ["▼", k.soft], ["▶", k.right], ["MENU", "Escape", "wide small"]],
                [["↺", k.rotl], ["↻", k.rotr], ["HOLD", k.hold, "small"], ["DROP", k.hard, "wide"]],
            ],
            menu: [
                [[null], ["▲", "ArrowUp"], [null], ["◀", "ArrowLeft"], ["▼", "ArrowDown"], ["▶", "ArrowRight"]],
                [["BACK", "Escape", "wide small"], ["OK", "Enter", "wide"]],
            ],
        };
    }

    update() {
        if (!this.enabled) return;
        const mode = this.engine.GAMESTATE === STATE_GAME ? "game" : "menu";
        if (mode === this.mode) return;
        this.mode = mode;
        this.releaseAll();
        this.el.replaceChildren();
        this.el.style.display = "grid";
        for (const cells of this.layouts()[mode]) {
            const pad = document.createElement("div");
            pad.className = "pad three";
            for (const [label, code, cls] of cells) pad.appendChild(this.button(label, code, cls));
            this.el.appendChild(pad);
        }
        this.el.style.height = this.height() + "px";
    }

    button(label, code, cls = "") {
        const b = document.createElement("button");
        if (label === null || label === undefined) { b.className = "empty"; return b; }
        b.textContent = label;
        b.className = cls;
        b.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            b.setPointerCapture(e.pointerId);
            b.classList.add("down");
            this.press(e.pointerId, code);
        });
        const up = (e) => { b.classList.remove("down"); this.release(e.pointerId); };
        b.addEventListener("pointerup", up);
        b.addEventListener("pointercancel", up);
        b.addEventListener("lostpointercapture", up);
        return b;
    }

    send(code, down, repeat = false) {
        this.engine.onKey({ code, repeat, ctrlKey: false, shiftKey: false, preventDefault() {} }, down);
    }

    press(id, code) {
        if (this.held.has(id)) return;
        const entry = { code, timer: 0 };
        this.held.set(id, entry);
        this.send(code, true);
        if (this.mode === "menu" && MENU_REPEAT_KEYS.includes(code)) {
            entry.timer = setTimeout(() => {
                entry.timer = setInterval(() => this.send(code, true, true), TOUCH_REPEAT_RATE);
            }, TOUCH_REPEAT_DELAY);
        }
    }

    release(id) {
        const entry = this.held.get(id);
        if (!entry) return;
        this.held.delete(id);
        clearTimeout(entry.timer);
        clearInterval(entry.timer);
        this.send(entry.code, false);
    }

    releaseAll() {
        for (const id of [...this.held.keys()]) this.release(id);
    }
}
