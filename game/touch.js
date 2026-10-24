// On-screen controls for touch devices, laid out like a handheld: a D-pad on the left (up = hard
// drop, down = soft drop), rotate buttons and HOLD on the right, and a MENU button. They feed the
// same key events as the keyboard (Engine.onKey), so DAS/ARR, IRS and the menus work unchanged; in
// menus the D-pad gives the arrows and the round buttons OK and BACK. In portrait they sit in a bar
// below the view, in landscape beside it (place()). Shown on devices whose main pointer is coarse;
// add ?touch=1 to the URL to force them.

const TOUCH_REPEAT_DELAY = 400; // ms before a held menu arrow repeats
const TOUCH_REPEAT_RATE = 80;
const TOUCH_UNIT = [44, 62]; // CSS px range of a D-pad cell; the round buttons are sized from it
const TOUCH_EDGE = 16;       // margin beside the clusters
const TOUCH_TOP = 34;        // the portrait bar's row for the MENU button, above the clusters
const TOUCH_DEAD_ZONE = 0.12; // of the D-pad's width: a touch this near its centre presses nothing new
// D-pad sectors as [upper bound, arms], by angle in degrees clockwise from right. In games the lower
// diagonals add a soft drop to a move and up gets a narrower sector; menus take four quarters
const DPAD_GAME = [[25, ["right"]], [65, ["down", "right"]], [115, ["down"]], [155, ["down", "left"]], [240, ["left"]], [300, ["up"]], [360, ["right"]]];
const DPAD_MENU = [[45, ["right"]], [135, ["down"]], [225, ["left"]], [315, ["up"]], [360, ["right"]]];

const touchIcon = (paths) => `<svg class="icon" viewBox="0 0 24 24">${paths}</svg>`;
const TOUCH_ICONS = {
    up: touchIcon('<path d="M5 15l7-7 7 7"/>'),
    down: touchIcon('<path d="M5 9l7 7 7-7"/>'),
    left: touchIcon('<path d="M15 5l-7 7 7 7"/>'),
    right: touchIcon('<path d="M9 5l7 7-7 7"/>'),
    drop: touchIcon('<path d="M12 3v12M6.5 10l5.5 5.5 5.5-5.5M5 20.5h14"/>'),
    cw: touchIcon('<path d="M20.5 12a8.5 8.5 0 1 1-2.5-6l2.5 2.5"/><path d="M20.5 3.5v5h-5"/>'),
    ccw: touchIcon('<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5"/><path d="M3.5 3.5v5h5"/>'),
};

class TouchControls {
    constructor(engine) {
        this.engine = engine;
        this.enabled = /[?&]touch=1\b/.test(location.search) ||
            (window.matchMedia && matchMedia("(pointer: coarse)").matches);
        this.mode = null;      // "game" or "menu"
        this.held = new Map(); // pointerId -> { codes, lit, dir, timer }
        if (!this.enabled) return;

        const style = document.createElement("style");
        style.textContent = `
            #touch { position: fixed; left: 0; right: 0; bottom: 0; display: flex; align-items: center;
                justify-content: space-between; box-sizing: border-box; --u: 54px;
                padding: ${TOUCH_TOP}px max(${TOUCH_EDGE}px, env(safe-area-inset-right))
                    env(safe-area-inset-bottom) max(${TOUCH_EDGE}px, env(safe-area-inset-left));
                background: linear-gradient(rgba(4,5,14,0), rgba(4,5,14,.7) 24px, rgba(4,5,14,.9));
                color: #f4ecdc; font-family: "Archivo", system-ui, sans-serif;
                touch-action: none; user-select: none; -webkit-user-select: none;
                -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
            #touch.landscape { top: 0; padding: 10vh max(${TOUCH_EDGE}px, env(safe-area-inset-right)) 0
                max(${TOUCH_EDGE}px, env(safe-area-inset-left)); background: none; pointer-events: none; }
            #touch.landscape > * { pointer-events: auto; }
            #touch .dpad, #touch .face { position: relative; flex: none; width: calc(var(--u) * 3); height: calc(var(--u) * 3); touch-action: none; }
            #touch .dpad * { pointer-events: none; }
            #touch .cross { position: absolute; inset: 0; width: 100%; height: 100%; filter: drop-shadow(0 6px 12px rgba(0,0,0,.55)); }
            #touch .arm { position: absolute; width: var(--u); height: var(--u); display: flex; align-items: center;
                justify-content: center; color: rgba(244,236,220,.7); transition: color .08s; }
            #touch .arm::before { content: ""; position: absolute; inset: 3px; border-radius: 28%; opacity: 0; transition: opacity .08s;
                background: radial-gradient(circle, rgba(244,236,220,.32), rgba(244,236,220,.08) 60%, rgba(244,236,220,0) 75%); }
            #touch .arm.on { color: #fff; }
            #touch .arm.on::before { opacity: 1; }
            #touch .arm.up { left: var(--u); top: 0; }
            #touch .arm.left { left: 0; top: var(--u); }
            #touch .arm.right { left: calc(var(--u) * 2); top: var(--u); }
            #touch .arm.down { left: var(--u); top: calc(var(--u) * 2); }
            #touch .icon { position: relative; width: calc(var(--u) * .42); height: calc(var(--u) * .42); fill: none;
                stroke: currentColor; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
            #touch .btn { position: absolute; display: flex; align-items: center; justify-content: center; box-sizing: border-box;
                border-radius: 50%; border: 1.5px solid rgba(var(--accent), .5); --accent: 244,236,220;
                background: radial-gradient(circle at 50% 28%, #262d55, #12152c 72%);
                box-shadow: 0 6px 14px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.1);
                font-weight: 800; font-size: calc(var(--u) * .22); letter-spacing: .14em; text-indent: .14em;
                touch-action: none; transition: transform .07s, background .07s, box-shadow .07s; }
            #touch .btn * { pointer-events: none; }
            #touch .btn .icon { width: calc(var(--u) * .48); height: calc(var(--u) * .48); }
            #touch .btn.on { transform: scale(.93);
                background: radial-gradient(circle at 50% 32%, rgba(var(--accent), .5), rgba(var(--accent), .14) 78%);
                box-shadow: 0 0 0 1px rgba(var(--accent), .7), 0 0 22px rgba(var(--accent), .4); }
            #touch .a, #touch .b { width: calc(var(--u) * 1.35); height: calc(var(--u) * 1.35); }
            #touch .a { --accent: 0,211,229; left: calc(var(--u) * 1.6); top: calc(var(--u) * .3); }
            #touch .b { --accent: 218,131,217; left: calc(var(--u) * .05); top: calc(var(--u) * 1.6); }
            #touch .hold { --accent: 228,207,0; width: calc(var(--u) * .95); height: calc(var(--u) * .95);
                left: calc(var(--u) * .15); top: calc(var(--u) * .15); font-size: calc(var(--u) * .19); }
            #touch .pause { width: auto; height: 26px; padding: 0 14px; border-radius: 13px; top: 6px; left: 50%;
                transform: translateX(-50%); font-size: 10px; letter-spacing: 3px; text-indent: 3px;
                border-color: rgba(244,236,220,.22); color: rgba(244,236,220,.8); }
            #touch .pause::after { content: ""; position: absolute; inset: -10px -6px; }
            #touch .pause.on { transform: translateX(-50%) scale(.95); }
            #touch.landscape .pause { position: fixed; top: max(14px, env(safe-area-inset-top)); left: auto;
                right: max(${TOUCH_EDGE}px, env(safe-area-inset-right)); transform: none; }
            #touch.landscape .pause.on { transform: scale(.95); }
            #touch.in-menu .g, #touch:not(.in-menu) .m { display: none; }
            #touch.in-menu .hold, #touch.in-menu .pause { visibility: hidden; }
            #touch-safe { position: fixed; bottom: 0; height: env(safe-area-inset-bottom); width: 0; visibility: hidden; }`;
        document.head.appendChild(style);

        this.el = document.createElement("div");
        this.el.id = "touch";
        // A plus with rounded ends, drawn once; the arms light up over it
        this.el.innerHTML = `
            <div class="dpad">
                <svg class="cross" viewBox="0 0 30 30">
                    <defs><linearGradient id="touch-pad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stop-color="#262d55"/><stop offset="1" stop-color="#12152c"/></linearGradient></defs>
                    <path d="M13 0h4q3 0 3 3v7h7q3 0 3 3v4q0 3-3 3h-7v7q0 3-3 3h-4q-3 0-3-3v-7H3q-3 0-3-3v-4q0-3 3-3h7V3q0-3 3-3z"
                        fill="url(#touch-pad)" stroke="rgba(244,236,220,.2)" stroke-width="1" vector-effect="non-scaling-stroke"/>
                    <circle cx="15" cy="15" r="2.6" fill="#0b0d1f" stroke="rgba(244,236,220,.08)" stroke-width="1" vector-effect="non-scaling-stroke"/>
                </svg>
                <span class="arm up"><span class="g">${TOUCH_ICONS.drop}</span><span class="m">${TOUCH_ICONS.up}</span></span>
                <span class="arm left">${TOUCH_ICONS.left}</span>
                <span class="arm right">${TOUCH_ICONS.right}</span>
                <span class="arm down">${TOUCH_ICONS.down}</span>
            </div>
            <div class="face">
                <span class="btn hold" data-key="hold">HOLD</span>
                <span class="btn b" data-key="b"><span class="g">${TOUCH_ICONS.ccw}</span><span class="m">BACK</span></span>
                <span class="btn a" data-key="a"><span class="g">${TOUCH_ICONS.cw}</span><span class="m">OK</span></span>
            </div>
            <span class="btn pause" data-key="pause">MENU</span>
            <div id="touch-safe"></div>`;
        document.body.appendChild(this.el);
        this.el.addEventListener("contextmenu", (e) => e.preventDefault());

        this.pad = this.el.querySelector(".dpad");
        this.arms = {};
        for (const arm of this.el.querySelectorAll(".arm")) this.arms[arm.classList[1]] = arm;
        this.buttons = [...this.el.querySelectorAll(".btn")];
        this.safe = this.el.querySelector("#touch-safe");

        // The D-pad is one touch area: the direction follows the finger, so it can roll from arm to
        // arm without lifting; up (the hard drop) only takes a fresh touch in games
        this.pad.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            this.pad.setPointerCapture(e.pointerId);
            this.steer(e, true);
        });
        this.pad.addEventListener("pointermove", (e) => { if (this.held.has(e.pointerId)) this.steer(e, false); });
        for (const b of this.buttons) {
            b.addEventListener("pointerdown", (e) => {
                e.preventDefault();
                b.setPointerCapture(e.pointerId);
                this.hold(e.pointerId, [this.codeFor(b.dataset.key)], [b]);
            });
        }
        for (const target of [this.pad, ...this.buttons]) {
            const up = (e) => this.release(e.pointerId);
            target.addEventListener("pointerup", up);
            target.addEventListener("pointercancel", up);
            target.addEventListener("lostpointercapture", up);
        }
    }

    // Lays the controls out for a window of winW × winH and returns the room they take beside and
    // below the view ({left, right, bottom}, CSS px); view is its [x, y, w, h] in logical units.
    // Portrait: a bar below the view, taller when the view leaves room. Landscape: a cluster each side
    place(winW, winH, view) {
        if (!this.enabled) return { left: 0, right: 0, bottom: 0 };
        const landscape = winW > winH;
        this.el.classList.toggle("landscape", landscape);
        const u = Math.round(Math.min(TOUCH_UNIT[1], Math.max(TOUCH_UNIT[0], landscape ? winH / 6.5 : (winW - 2 * TOUCH_EDGE) / 6.6)));
        this.el.style.setProperty("--u", u + "px");
        if (landscape) {
            this.el.style.height = "";
            const side = 3 * u + 2 * TOUCH_EDGE;
            return { left: side, right: side, bottom: 0 };
        }
        const safe = this.safe.offsetHeight;
        const need = TOUCH_TOP + 3 * u + TOUCH_EDGE;
        const spare = winH - safe - view[3] * winW / view[2]; // below the view at the window's width
        const bar = Math.round(Math.max(need, Math.min(spare, need * 1.3)));
        this.el.style.height = bar + safe + "px";
        return { left: 0, right: 0, bottom: bar + safe };
    }

    update() {
        if (!this.enabled) return;
        const mode = this.engine.GAMESTATE === STATE_GAME ? "game" : "menu";
        if (mode === this.mode) return;
        this.releaseAll();
        this.mode = mode;
        this.el.classList.toggle("in-menu", mode === "menu");
    }

    // Key code of a D-pad arm or button in the current mode (bindings can change between presses)
    codeFor(name) {
        const k = this.engine.options.keys;
        const menu = this.mode === "menu";
        switch (name) {
            case "up": return menu ? "ArrowUp" : k.hard;
            case "down": return menu ? "ArrowDown" : k.soft;
            case "left": return menu ? "ArrowLeft" : k.left;
            case "right": return menu ? "ArrowRight" : k.right;
            case "a": return menu ? "Enter" : k.rotr;
            case "b": return menu ? "Escape" : k.rotl;
            case "hold": return k.hold;
            case "pause": return "Escape";
        }
    }

    // The D-pad arms under a pointer: by angle from the pad's centre; near the centre it keeps what
    // it holds
    steer(e, fresh) {
        const box = this.pad.getBoundingClientRect();
        const dx = e.clientX - (box.left + box.width / 2), dy = e.clientY - (box.top + box.height / 2);
        if (Math.hypot(dx, dy) < TOUCH_DEAD_ZONE * box.width) {
            if (fresh) this.hold(e.pointerId, []);
            return;
        }
        const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
        const arms = (this.mode === "menu" ? DPAD_MENU : DPAD_GAME).find(([bound]) => angle < bound)[1];
        const entry = this.held.get(e.pointerId);
        if (!fresh && this.mode === "game" && arms[0] === "up" && !(entry && entry.lit.includes(this.arms.up))) return;
        this.hold(e.pointerId, arms.map(a => this.codeFor(a)), arms.map(a => this.arms[a]));
    }

    send(code, down, repeat = false) {
        this.engine.onKey({ code, repeat, ctrlKey: false, shiftKey: false, preventDefault() {} }, down);
    }

    // Sets what a pointer holds: releases the codes it no longer holds, presses the new ones and
    // lights their arms or buttons. Held menu arrows repeat
    hold(id, codes, lit = []) {
        let entry = this.held.get(id);
        if (!entry) this.held.set(id, entry = { codes: [], lit: [], timer: 0 });
        const same = codes.length === entry.codes.length && codes.every(c => entry.codes.includes(c));
        for (const c of entry.codes) if (!codes.includes(c)) this.send(c, false);
        for (const c of codes) if (!entry.codes.includes(c)) this.send(c, true);
        entry.codes = codes;
        entry.lit = lit;
        this.showLit();
        if (same) return;
        clearTimeout(entry.timer);
        clearInterval(entry.timer);
        const repeats = this.mode === "menu" ? codes.filter(c => MENU_REPEAT_KEYS.includes(c)) : [];
        if (repeats.length) {
            entry.timer = setTimeout(() => {
                entry.timer = setInterval(() => { for (const c of repeats) this.send(c, true, true); }, TOUCH_REPEAT_RATE);
            }, TOUCH_REPEAT_DELAY);
        }
    }

    showLit() {
        const lit = new Set([...this.held.values()].flatMap(entry => entry.lit));
        for (const el of [...Object.values(this.arms), ...this.buttons]) el.classList.toggle("on", lit.has(el));
    }

    release(id) {
        if (!this.held.has(id)) return;
        this.hold(id, []);
        this.held.delete(id);
        this.showLit();
    }

    releaseAll() {
        for (const id of [...this.held.keys()]) this.release(id);
    }
}
