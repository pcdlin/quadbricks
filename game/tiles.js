// Block styles. Each draws one block into a sprite canvas that is already scaled and
// offset by pad(style): draw(g, col, size, style, index), where col is the colour entry
// ({base, light, dark}), index the palette index (1..9; 8 is the neutral grey-white, 9 versus garbage, GARBAGE_COLOR) and style "active" (falling
// piece), "locked" (settled stack) or "ghost" (landing preview). Styles that don't colour
// blocks by col give trail(index), the CSS colour of their drop trail and hard-drop flash
// (else col.light). The engine lays a lamp light over every block but the ghost, moving with the
// field's tilt (Engine.drawLamp()): only while 3D tilt is on, always with lamp: "always", never with
// lamp: false; lampMask(g, size, index) fills the part of the block it lights (else the face), and
// lampStrength scales it (else 1). face: [inset, corner radius / size] of the block's outline, for
// styles whose blocks don't fill their cell (else [0, 0]); drop trails are shaped to it.

// Original tile images from the C++ game (gfx/), by palette index
const TILE_IMAGE_NAMES = [null, "cyan", "purple", "orange", "blue", "green", "red", "yellow"];
const TILE_IMAGES = { active: [], locked: [], ghost: [] };

function loadTileImages() {
    const load = (src) => new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null); // the Original style falls back to Flat
        img.src = src;
    });
    const jobs = [];
    TILE_IMAGE_NAMES.forEach((name, i) => {
        if (!name) return;
        jobs.push(load(`gfx/tiles/${name}.png`).then(img => TILE_IMAGES.active[i] = img));
        jobs.push(load(`gfx/dark/d${name}.png`).then(img => TILE_IMAGES.locked[i] = img));
        jobs.push(load(`gfx/outline/o${name}.png`).then(img => TILE_IMAGES.ghost[i] = img));
    });
    return Promise.all(jobs);
}

// The 1989 handheld's screen shades, darkest to lightest
const GB_SHADES = ["#0f380f", "#306230", "#8bac0f", "#c8dc9a"]; // lightest lifted for contrast
const MONO_INK = "244,236,220"; // Mono's warm gallery white
const MONO_GARBAGE_INK = "150,146,138"; // and its versus garbage, a darker grey
// the neutral colour (8) sits mid-range, versus garbage well below the pieces
const holoLum = (index) => index === GARBAGE_COLOR ? 44 : index > 7 ? 70 : 58 + index * 3;

// Stained glass: the pane inside the lead cames, and the lead seam across it (its direction
// alternates by colour)
const STAINED_LEAD = "#17141c";
function stainedPane(size) {
    const inset = 0, w = size, came = size * 0.08; // edge to edge: neighbours share their lead
    return { inset, w, came, gx: inset + came, gw: w - came * 2 };
}
function stainedSeam(g, size, index, color, lineWidth) {
    const { came, gx, gw } = stainedPane(size);
    g.beginPath();
    if (index % 2) { g.moveTo(gx, gx + gw * 0.62); g.lineTo(gx + gw * 0.58, gx); }
    else { g.moveTo(gx + gw * 0.4, gx + gw); g.lineTo(gx + gw, gx + gw * 0.35); }
    g.strokeStyle = color;
    g.lineWidth = lineWidth || came;
    g.lineCap = "round";
    g.stroke();
}

// Backlit: light coming through a block's edges, fading inward over depth (a share of the size) from
// alpha at the edge, in "r,g,b"
const BACKLIT_LAMP_DEPTH = 0.2; // how far in the lamp lights the rims
function backlitRim(g, size, inset, alpha, rgb, depth) {
    const d = size * depth, a = inset, b = size - inset;
    for (const [x0, y0, x1, y1, x, y, w, h] of [
        [a, 0, a + d, 0, a, a, d, b - a], [b, 0, b - d, 0, b - d, a, d, b - a],
        [0, a, 0, a + d, a, a, b - a, d], [0, b, 0, b - d, a, b - d, b - a, d],
    ]) {
        const grad = g.createLinearGradient(x0, y0, x1, y1);
        grad.addColorStop(0, `rgba(${rgb},${alpha})`);
        grad.addColorStop(0.25, `rgba(${rgb},${alpha * 0.3})`);
        grad.addColorStop(1, `rgba(${rgb},0)`);
        g.fillStyle = grad;
        g.fillRect(x, y, w, h);
    }
}

// A repeatable pseudo-random sequence in [0, 1), so a style's texture is the same every time
function seededRandom(seed) {
    let s = seed;
    return () => (s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff) / 0x80000000;
}

const TILESETS = {
    // Solid colour, square-ish, no gloss
    flat: {
        name: "Flat",
        face: [1.5, 0.06],
        pad: () => 0,
        draw(g, col, size, style) {
            const [inset, round] = this.face;
            const w = size - inset * 2;
            const r = size * round;
            g.beginPath();
            g.roundRect(inset, inset, w, w, r);
            if (style === "ghost") {
                g.fillStyle = col.base + "22";
                g.fill();
                g.strokeStyle = col.base + "aa";
                g.lineWidth = 1.5;
                g.stroke();
                return;
            }
            g.fillStyle = col.base;
            g.fill();
            if (style === "active") {
                g.fillStyle = "rgba(255,255,255,0.18)";
                g.fill();
                g.strokeStyle = "rgba(255,255,255,0.7)";
                g.lineWidth = 1.5;
                g.stroke();
            } else {
                g.fillStyle = "rgba(6,8,22,0.18)";
                g.fill();
                g.strokeStyle = col.light + "66";
                g.lineWidth = 1;
                g.stroke();
            }
        },
    },

    // Brushed grey metal that looks colourless face-on: the engine lays a sheen over each block
    // (Engine.drawSheen()) whose colour follows the field's tilt, like a hologram or oil film.
    // Pieces differ only in lightness, so the stack stays readable when the sheen is faint.
    holo: {
        name: "Holo",
        face: [1.5, 0.1],
        sheen: true,
        lampStrength: 0.45, // faint, so it doesn't wash out the sheen
        pad: (style) => style === "active" ? 10 : 0,
        trail: (index) => `hsl(220,6%,${holoLum(index)}%)`, // the settled block's grey
        draw(g, col, size, style, index) {
            const [inset, round] = this.face, w = size - inset * 2, r = size * round;
            const path = () => { g.beginPath(); g.roundRect(inset, inset, w, w, r); };
            if (style === "ghost") {
                path();
                g.fillStyle = "rgba(200,205,215,0.06)";
                g.fill();
                g.strokeStyle = "rgba(200,205,215,0.45)";
                g.lineWidth = 1.2;
                g.stroke();
                return;
            }
            const active = style === "active";
            const lum = holoLum(index) + (active ? 8 : 0); // 61..79 %
            if (active) {
                g.shadowColor = "rgba(210,215,230,0.7)";
                g.shadowBlur = 14;
            }
            path();
            const body = g.createLinearGradient(inset, inset, inset + w, inset + w);
            body.addColorStop(0, `hsl(220,6%,${lum + 10}%)`);
            body.addColorStop(0.5, `hsl(220,5%,${lum - 8}%)`);
            body.addColorStop(1, `hsl(220,7%,${lum - 24}%)`);
            g.fillStyle = body;
            g.fill();
            g.shadowBlur = 0;
            // fine horizontal brushing
            g.save();
            path();
            g.clip();
            g.fillStyle = "rgba(255,255,255,0.07)";
            for (let y = inset + 2; y < inset + w; y += 3) g.fillRect(inset, y, w, 1);
            g.restore();
            // bevelled face
            g.beginPath();
            g.roundRect(inset + size * 0.16, inset + size * 0.16, w - size * 0.32, w - size * 0.32, r * 0.6);
            g.fillStyle = active ? "rgba(6,8,22,0.06)" : "rgba(6,8,22,0.16)";
            g.fill();
            path();
            g.strokeStyle = active ? "rgba(255,255,255,0.9)" : "rgba(235,238,248,0.55)";
            g.lineWidth = 1;
            g.stroke();
        },
    },

    // Translucent, luminous glass cells that bloom into the backdrop (Tetris Effect look)
    radiant: {
        name: "Radiant",
        face: [1.5, 0.2],
        pad: (style) => style === "active" ? 14 : style === "ghost" ? 4 : 7,
        draw(g, col, size, style) {
            const [inset, round] = this.face;
            const w = size - inset * 2;
            const r = size * round;
            const path = () => { g.beginPath(); g.roundRect(inset, inset, w, w, r); };

            if (style === "ghost") {
                path();
                g.fillStyle = col.base + "18";
                g.fill();
                g.shadowColor = col.light;
                g.shadowBlur = 5;
                g.strokeStyle = col.light + "99";
                g.lineWidth = 1.5;
                g.stroke();
                return;
            }

            const active = style === "active";
            g.shadowColor = col.light;
            g.shadowBlur = active ? 22 : 8;
            path();
            const body = g.createLinearGradient(inset, inset, inset + w, inset + w);
            body.addColorStop(0, col.light);
            body.addColorStop(0.55, col.base);
            body.addColorStop(1, col.dark);
            g.fillStyle = body;
            g.globalAlpha = active ? 0.9 : 0.72;
            g.fill();
            g.globalAlpha = 1;
            g.shadowBlur = 0;

            // glowing core
            const core = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, w * 0.62);
            core.addColorStop(0, "rgba(255,255,255," + (active ? 0.55 : 0.3) + ")");
            core.addColorStop(1, "rgba(255,255,255,0)");
            path();
            g.fillStyle = core;
            g.fill();

            // specular streak across the top-left
            g.beginPath();
            g.roundRect(inset + 3, inset + 3, w * 0.62, w * 0.2, r * 0.6);
            g.fillStyle = "rgba(255,255,255,0.35)";
            g.fill();

            // bright rim with a faint inner rim
            path();
            g.strokeStyle = active ? "rgba(255,255,255,0.95)" : col.light;
            g.globalAlpha = active ? 1 : 0.85;
            g.lineWidth = 1.5;
            g.stroke();
            g.globalAlpha = 1;
            g.beginPath();
            g.roundRect(inset + 3.5, inset + 3.5, w - 7, w - 7, r * 0.5);
            g.strokeStyle = "rgba(255,255,255,0.18)";
            g.lineWidth = 1;
            g.stroke();
        },
    },

    // Bevelled, glossy blocks with a glowing falling piece
    glossy: {
        name: "Glossy",
        face: [1, 0.14],
        pad: (style) => style === "active" ? 10 : 0, // room for the glow
        draw(g, col, size, style) {
            const [inset, round] = this.face;
            const w = size - inset * 2;
            const r = size * round;

            if (style === "ghost") {
                g.beginPath();
                g.roundRect(inset + 1, inset + 1, w - 2, w - 2, r);
                g.fillStyle = col.base + "26";
                g.fill();
                g.lineWidth = 1.5;
                g.strokeStyle = col.light + "b0";
                g.stroke();
                return;
            }

            if (style === "active") {
                g.shadowColor = col.light;
                g.shadowBlur = 16;
            }
            // body
            const body = g.createLinearGradient(0, inset, 0, inset + w);
            body.addColorStop(0, col.light);
            body.addColorStop(0.45, col.base);
            body.addColorStop(1, col.dark);
            g.beginPath();
            g.roundRect(inset, inset, w, w, r);
            g.fillStyle = body;
            g.fill();
            g.shadowBlur = 0;

            // inner bevel
            const bevel = size * 0.16;
            g.beginPath();
            g.roundRect(inset + bevel, inset + bevel, w - bevel * 2, w - bevel * 2, r * 0.6);
            const face = g.createLinearGradient(0, inset + bevel, 0, inset + w - bevel);
            face.addColorStop(0, col.base);
            face.addColorStop(1, col.dark);
            g.fillStyle = face;
            g.globalAlpha = 0.55;
            g.fill();
            g.globalAlpha = 1;

            // gloss
            g.beginPath();
            g.roundRect(inset + 2, inset + 2, w - 4, w * 0.32, [r * 0.8, r * 0.8, 2, 2]);
            g.fillStyle = "rgba(255,255,255,0.28)";
            g.fill();

            // edge
            g.beginPath();
            g.roundRect(inset + 0.5, inset + 0.5, w - 1, w - 1, r);
            g.strokeStyle = "rgba(0,0,0,0.35)";
            g.lineWidth = 1;
            g.stroke();

            if (style === "active") {
                // bright rim and lift: the highlight that fades out during the lock delay
                g.globalCompositeOperation = "source-atop";
                g.fillStyle = "rgba(255,255,255,0.12)";
                g.fillRect(0, 0, size, size);
                g.globalCompositeOperation = "source-over";
                g.beginPath();
                g.roundRect(inset + 1, inset + 1, w - 2, w - 2, r);
                g.strokeStyle = "rgba(255,255,255,0.75)";
                g.lineWidth = 1.5;
                g.stroke();
            } else {
                // settled blocks sit slightly back from the active piece
                g.globalCompositeOperation = "source-atop";
                g.fillStyle = "rgba(6,8,22,0.25)";
                g.fillRect(0, 0, size, size);

                // thin light rim so settled blocks read as distinct cells
                g.globalCompositeOperation = "source-over";
                g.beginPath();
                g.roundRect(inset + 0.75, inset + 0.75, w - 1.5, w - 1.5, r);
                g.strokeStyle = col.light;
                g.globalAlpha = 0.5;
                g.lineWidth = 1.2;
                g.stroke();
                g.globalAlpha = 1;
            }
        },
    },

    // Dark glass cells with glowing coloured outlines
    neon: {
        name: "Neon",
        face: [2.5, 0.12],
        pad: (style) => style === "active" ? 20 : style === "ghost" ? 0 : 12,
        draw(g, col, size, style) {
            const [inset, round] = this.face;
            const w = size - inset * 2;
            const r = size * round;
            g.beginPath();
            g.roundRect(inset, inset, w, w, r);
            if (style === "ghost") {
                g.strokeStyle = col.base + "aa";
                g.lineWidth = 2.5;
                g.stroke();
                return;
            }
            const active = style === "active";
            g.fillStyle = col.dark + (active ? "88" : "55");
            g.fill();
            g.shadowColor = col.light;
            g.shadowBlur = active ? 22 : 12;
            // settled edges use the light colour too, a little thicker, so they read against the well
            g.strokeStyle = col.light;
            g.lineWidth = active ? 2.5 : 2;
            for (let i = 3; i > 0; i--) g.stroke(); // each pass adds to the glow
            g.shadowBlur = 0;
        },
    },

    // Backlit coloured glass in lead cames, a lead seam across each pane. The light is the
    // engine's lamp (lamp: "always"), drawn over the glass and moving with the field's tilt.
    stained: {
        name: "Stained glass",
        lamp: "always",
        lampMask(g, size, index) { // the glass, not the lead
            const { gx, gw } = stainedPane(size);
            g.fillRect(gx, gx, gw, gw);
            g.globalCompositeOperation = "destination-out";
            stainedSeam(g, size, index, "#000");
            g.globalCompositeOperation = "source-over";
        },
        pad: (style) => style === "active" ? 8 : 0,
        draw(g, col, size, style, index) {
            const { inset, w, gx, gw } = stainedPane(size);
            if (style === "ghost") {
                g.fillStyle = col.base + "16";
                g.fillRect(gx, gx, gw, gw);
                g.strokeStyle = col.light + "88";
                g.lineWidth = 1.5;
                g.strokeRect(inset + 1.5, inset + 1.5, w - 3, w - 3);
                g.lineWidth = 1;
                stainedSeam(g, size, index, col.light + "55", 1);
                return;
            }
            const active = style === "active";
            // the lead frame; the falling piece's light spills round it
            if (active) {
                g.shadowColor = col.light;
                g.shadowBlur = 12;
            }
            g.beginPath();
            g.rect(inset, inset, w, w);
            g.fillStyle = STAINED_LEAD;
            g.fill();
            g.shadowBlur = 0;
            // the glass, darker towards the bottom right, mottled
            g.save();
            g.beginPath();
            g.rect(gx, gx, gw, gw);
            g.clip();
            const body = g.createLinearGradient(gx, gx, gx + gw, gx + gw);
            body.addColorStop(0, col.base);
            body.addColorStop(1, col.dark);
            g.fillStyle = body;
            g.globalAlpha = active ? 1 : 0.82;
            g.fillRect(gx, gx, gw, gw);
            g.globalAlpha = 1;
            const rnd = seededRandom(index * 97 + 7);
            for (let i = 0; i < 7; i++) {
                const x = gx + rnd() * gw, y = gx + rnd() * gw, rad = gw * (0.12 + rnd() * 0.22);
                const blot = g.createRadialGradient(x, y, 0, x, y, rad);
                blot.addColorStop(0, rnd() < 0.5 ? "rgba(255,255,255,0.16)" : "rgba(0,0,20,0.18)");
                blot.addColorStop(1, "rgba(0,0,0,0)");
                g.fillStyle = blot;
                g.fillRect(gx, gx, gw, gw);
            }
            g.restore();
            stainedSeam(g, size, index, STAINED_LEAD);
            // a glint along the cames' inner top-left edge
            g.beginPath();
            g.moveTo(gx - 0.5, gx + gw);
            g.lineTo(gx - 0.5, gx - 0.5);
            g.lineTo(gx + gw, gx - 0.5);
            g.strokeStyle = "rgba(255,255,255,0.14)";
            g.lineWidth = 1;
            g.stroke();
            if (!active) {
                g.fillStyle = "rgba(6,8,22,0.16)";
                g.fillRect(inset, inset, w, w);
            }
        },
    },

    // Dark blocks lit only from behind: a near-black body whose edges let the light through in its
    // colour, as through something thin (subsurface scattering). The edges glow faintly by themselves;
    // the engine's lamp (lamp: "always"), behind the well and moving with the field's tilt, lights the
    // rims facing it (lampMask: the edges only)
    backlit: {
        name: "Backlit",
        face: [1, 0.08],
        lamp: "always",
        lampStrength: 1.6, // the rims carry the light, so they read across the well
        rays: true, // the lamp on them flickers with the Eclipse background's rays (Engine.rayFlicker())
        lampMask(g, size) {
            backlitRim(g, size, 0, 1, "255,255,255", BACKLIT_LAMP_DEPTH);
        },
        pad: (style) => style === "active" ? 10 : 0,
        draw(g, col, size, style) {
            const [inset, round] = this.face, w = size - inset * 2, r = size * round;
            const path = () => { g.beginPath(); g.roundRect(inset, inset, w, w, r); };
            const rgb = (hex) => [1, 3, 5].map(i => parseInt(hex.substr(i, 2), 16)).join(",");
            if (style === "ghost") { // only a rim, lit, with a little of its light inside
                g.save();
                path();
                g.clip();
                backlitRim(g, size, inset, 0.2, rgb(col.light), 0.18);
                g.restore();
                path();
                g.strokeStyle = col.light + "78";
                g.lineWidth = 1.5;
                g.stroke();
                return;
            }
            const active = style === "active";
            if (active) { // light spilling round the falling piece
                g.shadowColor = col.base + "88";
                g.shadowBlur = 12;
            }
            path();
            g.fillStyle = "#040406";
            g.fill();
            g.shadowBlur = 0;
            g.save();
            path();
            g.clip();
            // a trace of colour in the body, lighter towards the middle where the light scatters
            const body = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, w * 0.7);
            body.addColorStop(0, col.base + (active ? "24" : "16"));
            body.addColorStop(1, col.base + "03");
            g.fillStyle = body;
            g.fillRect(0, 0, size, size);
            // the edges' own faint glow, and a fine line on the very edge
            backlitRim(g, size, inset, active ? 0.6 : 0.45, rgb(col.light), 0.22);
            g.restore();
            path();
            g.strokeStyle = col.light + (active ? "b0" : "90");
            g.lineWidth = 1;
            g.stroke();
        },
    },

    // Blocks of clear ice, the same for every piece (Glacier's): pale and see-through, lighter towards the top left, a
    // darker inner face for their depth, a crack and a bubble or two inside (their course from the colour index, so the
    // stack isn't uniform), frost along the edges and a chip of light at the top left. A slight blue shimmer plays over
    // them as the field tilts (sheen: the Holo sheen kept to blue hues). The ghost is a frosted outline; versus garbage is
    // darker, clouded ice
    frost: {
        name: "Frost",
        face: [1, 0.13],
        sheen: { hue: 200, swing: 16, sat: 85, light: 68, alpha: 0.45 },
        pad: (style) => style === "active" ? 10 : 0,
        trail: () => "rgb(196,232,252)",
        draw(g, col, size, style, index) {
            const [inset, round] = this.face, w = size - inset * 2, r = size * round, u = size / 30;
            const path = (d = 0, rd = r) => { g.beginPath(); g.roundRect(inset + d, inset + d, w - d * 2, w - d * 2, rd); };
            const rnd = seededRandom(index * 7919 + 17);
            const murky = index === GARBAGE_COLOR, lift = ((index * 5) % 7 - 3) * 1.5; // a little lighter or darker by piece
            // the ice's colour at a lightness, taken this.tint of the way to the piece's hue (Tinted frost; not for greys)
            const [hue, sat] = rgbToHsl(parseColor(col.base)), tint = !murky && sat > 20 ? this.tint || 0 : 0;
            const ice = (l, a) => {
                const L = Math.max(4, l + lift - (murky ? 22 : 0));
                if (!tint) return `hsla(203,${murky ? 22 : 58}%,${L}%,${a})`;
                const base = hslToRgb(203, 58, L), toward = hslToRgb(hue, 62, L);
                return `rgba(${base.map((v, i) => Math.round((v + (toward[i] - v) * tint) * 255)).join(",")},${a})`;
            };
            // frost: specks crowding the edges, thinning inward
            const frost = (count, alpha) => {
                for (let i = 0; i < count; i++) {
                    const side = Math.floor(rnd() * 4), along = inset + rnd() * w, depth = Math.pow(rnd(), 2.2) * w * 0.26;
                    const x = side === 1 ? inset + w - depth : side === 3 ? inset + depth : along;
                    const y = side === 0 ? inset + depth : side === 2 ? inset + w - depth : along;
                    g.fillStyle = `rgba(255,255,255,${alpha * (0.3 + 0.7 * rnd()) * (1 - depth / (w * 0.3))})`;
                    g.beginPath();
                    g.arc(x, y, (0.25 + 0.55 * rnd()) * u, 0, Math.PI * 2);
                    g.fill();
                }
            };
            if (style === "ghost") {
                path(1, r - 1);
                g.fillStyle = "rgba(190,230,255,0.07)";
                g.fill();
                g.strokeStyle = "rgba(200,236,255,0.55)";
                g.lineWidth = 1.2;
                g.stroke();
                g.save();
                path();
                g.clip();
                frost(50, 0.45);
                g.restore();
                return;
            }
            const active = style === "active";
            if (active) { // the cold light the falling piece gives off
                g.shadowColor = "rgba(170,225,255,0.65)";
                g.shadowBlur = 12;
            }
            const body = g.createLinearGradient(inset, inset, inset + w, inset + w);
            body.addColorStop(0, ice(90, 0.9));
            body.addColorStop(0.5, ice(66, 0.66));
            body.addColorStop(1, ice(38, 0.84));
            path();
            g.fillStyle = body;
            g.fill();
            g.shadowBlur = 0;
            g.save();
            path();
            g.clip();
            // the cube's depth: a darker inner face, towards the bottom right
            g.beginPath();
            g.roundRect(inset + 5 * u, inset + 5 * u, w - 8 * u, w - 8 * u, 3 * u);
            g.fillStyle = ice(22, 0.26);
            g.fill();
            // a crack from one edge across, with its shadow, and a short branch off it
            const pts = [];
            let x = inset + (3 + rnd() * (w / u - 6)) * u, y = inset, a = Math.PI / 2 + (rnd() - 0.5) * 1.2;
            if (index % 2) { x = inset; y = inset + (4 + rnd() * (w / u - 8)) * u; a = (rnd() - 0.5) * 1.2; }
            pts.push([x, y]);
            for (let i = 0; i < 8; i++) {
                const len = (3 + rnd() * 3) * u;
                a += (rnd() - 0.5) * 1.1;
                x += Math.cos(a) * len;
                y += Math.sin(a) * len;
                pts.push([x, y]);
            }
            const line = (d, color, lw) => {
                g.beginPath();
                pts.forEach(([px, py], i) => i ? g.lineTo(px + d, py + d) : g.moveTo(px + d, py + d));
                g.strokeStyle = color;
                g.lineWidth = lw * u;
                g.stroke();
            };
            line(0.65 * u, ice(16, 0.35), 0.8);
            line(0, "rgba(255,255,255,0.55)", 0.65);
            const [bx, by] = pts[3];
            g.beginPath();
            g.moveTo(bx, by);
            g.lineTo(bx + (rnd() - 0.5) * 9 * u, by + (rnd() - 0.2) * 7 * u);
            g.strokeStyle = "rgba(255,255,255,0.32)";
            g.lineWidth = 0.5 * u;
            g.stroke();
            // bubbles caught in the ice
            for (let i = 0; i < 1 + index % 2; i++) {
                const cx = inset + (7 + rnd() * (w / u - 12)) * u, cy = inset + (9 + rnd() * (w / u - 14)) * u, cr = (0.7 + rnd() * 1.1) * u;
                g.beginPath();
                g.arc(cx, cy, cr, 0, Math.PI * 2);
                g.strokeStyle = "rgba(255,255,255,0.4)";
                g.lineWidth = 0.5 * u;
                g.stroke();
            }
            frost(murky ? 110 : 70, active ? 0.55 : 0.42);
            if (active) {
                g.globalCompositeOperation = "lighter";
                g.fillStyle = "rgba(190,235,255,0.14)";
                g.fillRect(0, 0, size, size);
                g.globalCompositeOperation = "source-over";
            } else { // settled ice a shade deeper
                g.fillStyle = "rgba(4,16,32,0.12)";
                g.fillRect(0, 0, size, size);
            }
            g.restore();
            // the rim: dark outside, frosted light just inside
            path(0.5, r);
            g.strokeStyle = ice(18, 0.75);
            g.lineWidth = 1;
            g.stroke();
            path(1.6 * u, r - 1.2 * u);
            g.strokeStyle = `rgba(235,250,255,${active ? 0.6 : 0.4})`;
            g.lineWidth = 0.9 * u;
            g.stroke();
            // the chip of light
            g.globalCompositeOperation = "lighter";
            const sx = inset + 6 * u, sy = inset + 5 * u, spot = g.createRadialGradient(sx, sy, 0, sx, sy, 8 * u);
            spot.addColorStop(0, "rgba(255,255,255,0.42)");
            spot.addColorStop(1, "rgba(255,255,255,0)");
            g.fillStyle = spot;
            g.fillRect(inset, inset, 16 * u, 16 * u);
            g.beginPath();
            g.moveTo(inset + 3 * u, inset + 7 * u);
            g.lineTo(inset + 4 * u, inset + 3.2 * u);
            g.lineTo(inset + 9 * u, inset + 2.6 * u);
            g.strokeStyle = "rgba(255,255,255,0.85)";
            g.lineWidth = 1.1 * u;
            g.lineCap = "round";
            g.stroke();
            g.globalCompositeOperation = "source-over";
        },
    },

    // Frost with a hint of the Guideline piece colours: the same ice, taken a little way towards each piece's hue, its
    // trail and flash too
    frostTint: {
        name: "Tinted frost",
        face: [1, 0.13],
        sheen: { hue: 200, swing: 16, sat: 85, light: 68, alpha: 0.45 },
        tint: 0.38,
        pad: (style) => style === "active" ? 10 : 0,
        trail: (index) => {
            const [r, g, b] = parseColor(PIECE_COLORS[index].light);
            return `rgb(${Math.round(196 + (r * 255 - 196) * 0.42)},${Math.round(232 + (g * 255 - 232) * 0.42)},${Math.round(252 + (b * 255 - 252) * 0.42)})`;
        },
        draw(g, col, size, style, index) {
            TILESETS.frost.draw.call(this, g, col, size, style, index);
        },
    },

    // Bevelled pyramid blocks: four lit facets around a flat face, as on 8- and 16-bit consoles
    faceted: {
        name: "Faceted",
        face: [1, 0],
        pad: (style) => style === "active" ? 8 : 0,
        draw(g, col, size, style) {
            const [inset] = this.face, w = size - inset * 2, a = inset, b = inset + w;
            const bevel = size * 0.2, fa = a + bevel, fb = b - bevel;
            if (style === "ghost") {
                g.fillStyle = col.base + "1c";
                g.fillRect(a + 1, a + 1, w - 2, w - 2);
                g.strokeStyle = col.light + "99";
                g.lineWidth = 1.5;
                g.strokeRect(a + 1.5, a + 1.5, w - 3, w - 3);
                g.strokeRect(fa, fa, fb - fa, fb - fa);
                return;
            }
            const facet = (points, fill) => {
                g.beginPath();
                points.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
                g.closePath();
                g.fillStyle = fill;
                g.fill();
            };
            if (style === "active") {
                g.shadowColor = col.light;
                g.shadowBlur = 12;
                g.fillStyle = col.base;
                g.fillRect(a, a, w, w);
                g.shadowBlur = 0;
            }
            facet([[a, a], [b, a], [fb, fa], [fa, fa]], col.light);  // top
            facet([[a, a], [fa, fa], [fa, fb], [a, b]], col.light);  // left
            g.globalAlpha = 0.45;
            facet([[a, a], [fa, fa], [fa, fb], [a, b]], col.base);   // ...a little darker than the top
            g.globalAlpha = 1;
            facet([[b, a], [b, b], [fb, fb], [fb, fa]], col.dark);   // right
            facet([[a, b], [fa, fb], [fb, fb], [b, b]], col.dark);   // bottom
            g.globalAlpha = 0.35;
            facet([[a, b], [fa, fb], [fb, fb], [b, b]], "#000");     // ...darker than the right
            g.globalAlpha = 1;
            const face = g.createLinearGradient(fa, fa, fb, fb);
            face.addColorStop(0, col.base);
            face.addColorStop(1, col.dark);
            g.fillStyle = face;
            g.fillRect(fa, fa, fb - fa, fb - fa);
            g.fillStyle = style === "active" ? "rgba(255,255,255,0.16)" : "rgba(6,8,22,0.22)";
            g.fillRect(a, a, w, w);
        },
    },

    // Chunky 8×8 pixel-art blocks: lit top-left edge, shaded bottom-right, a glint
    pixel: {
        name: "Pixel",
        pad: () => 0,
        draw(g, col, size, style) {
            const p = size / 8;
            const px = (x, y, w, h, fill) => { g.fillStyle = fill; g.fillRect(x * p, y * p, w * p, h * p); };
            if (style === "ghost") {
                for (let i = 0; i < 8; i += 2) { // dotted outline
                    px(i, 0, 1, 1, col.light + "aa"); px(7 - i, 7, 1, 1, col.light + "aa");
                    px(0, 7 - i, 1, 1, col.light + "aa"); px(7, i, 1, 1, col.light + "aa");
                }
                return;
            }
            px(0, 0, 8, 8, col.dark);  // outline
            px(1, 1, 6, 6, col.base);
            px(1, 1, 6, 1, col.light); // lit edges
            px(1, 1, 1, 6, col.light);
            px(6, 2, 1, 5, col.dark);  // shaded edges
            px(2, 6, 5, 1, col.dark);
            px(2, 2, 2, 1, "#ffffff"); // glint
            px(2, 3, 1, 1, "#ffffff");
            if (style === "active") px(0, 0, 8, 8, "rgba(255,255,255,0.14)");
            else px(0, 0, 8, 8, "rgba(6,8,22,0.2)");
        },
    },

    // Translucent gummy cubes: light scatters inside, a soft highlight sits on top
    jelly: {
        name: "Jelly",
        face: [1.5, 0.3],
        pad: (style) => style === "active" ? 12 : 0,
        draw(g, col, size, style) {
            const [inset, round] = this.face, w = size - inset * 2, r = size * round;
            const path = () => { g.beginPath(); g.roundRect(inset, inset, w, w, r); };
            if (style === "ghost") {
                path();
                g.fillStyle = col.base + "1e";
                g.fill();
                g.strokeStyle = col.light + "99";
                g.lineWidth = 1.5;
                g.stroke();
                return;
            }
            const active = style === "active";
            if (active) {
                g.shadowColor = col.light;
                g.shadowBlur = 14;
            }
            path();
            g.fillStyle = col.dark;
            g.fill();
            g.shadowBlur = 0;
            // lighter in the middle and low down, where the light scatters
            const body = g.createRadialGradient(size * 0.5, size * 0.6, 0, size * 0.5, size * 0.6, w * 0.72);
            body.addColorStop(0, col.light);
            body.addColorStop(0.55, col.base);
            body.addColorStop(1, col.dark);
            path();
            g.fillStyle = body;
            g.globalAlpha = active ? 0.95 : 0.78;
            g.fill();
            g.globalAlpha = 1;
            // a darker band just inside the edge: the jelly's thickness
            g.save();
            path();
            g.clip();
            path();
            g.strokeStyle = col.dark;
            g.lineWidth = size * 0.18;
            g.globalAlpha = 0.55;
            g.stroke();
            g.restore();
            // soft highlight, top left
            const hx = inset + w * 0.34, hy = inset + w * 0.27;
            const hi = g.createRadialGradient(hx, hy, 0, hx, hy, w * 0.3);
            hi.addColorStop(0, `rgba(255,255,255,${active ? 0.85 : 0.6})`);
            hi.addColorStop(0.45, `rgba(255,255,255,${active ? 0.35 : 0.22})`);
            hi.addColorStop(1, "rgba(255,255,255,0)");
            g.save();
            g.translate(hx, hy);
            g.scale(1, 0.62);
            g.translate(-hx, -hy);
            g.fillStyle = hi;
            g.fillRect(inset, inset - w, w, w * 2);
            g.restore();
            // a small glint opposite
            g.beginPath();
            g.arc(inset + w * 0.74, inset + w * 0.76, w * 0.055, 0, Math.PI * 2);
            g.fillStyle = "rgba(255,255,255,0.4)";
            g.fill();
            if (!active) {
                g.globalCompositeOperation = "source-atop";
                g.fillStyle = "rgba(6,8,22,0.14)";
                g.fillRect(0, 0, size, size);
                g.globalCompositeOperation = "source-over";
            }
        },
    },

    // Cut gemstones: an octagonal table in a crown of facets lit from the top left
    gem: {
        name: "Gem",
        face: [1, 0],
        pad: (style) => style === "active" ? 10 : 0,
        draw(g, col, size, style) {
            const [inset] = this.face, a = inset, b = size - inset;
            const t = size * 0.25, fa = a + t, fb = b - t, c = (fb - fa) * 0.28;
            const table = [[fa + c, fa], [fb - c, fa], [fb, fa + c], [fb, fb - c], [fb - c, fb], [fa + c, fb], [fa, fb - c], [fa, fa + c]];
            const [t1, t2, t3, t4, t5, t6, t7, t8] = table;
            const tl = [a, a], tr = [b, a], br = [b, b], bl = [a, b];
            const poly = (points) => {
                g.beginPath();
                points.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
                g.closePath();
            };
            if (style === "ghost") { // the facets' light and shade, faint, in the block's outline
                const ghostFacets = [
                    [[tl, t1, t8], col.light, 0.4],
                    [[tl, tr, t2, t1], col.light, 0.3],
                    [[bl, tl, t8, t7], col.light, 0.22],
                    [[tr, t3, t2], col.base, 0.2],
                    [[bl, t7, t6], col.base, 0.2],
                    [[tr, br, t4, t3], col.dark, 0.2],
                    [[br, bl, t6, t5], col.dark, 0.15],
                    [[br, t5, t4], col.dark, 0.12],
                ];
                for (const [points, fill, alpha] of ghostFacets) {
                    poly(points);
                    g.fillStyle = fill;
                    g.globalAlpha = alpha;
                    g.fill();
                }
                g.globalAlpha = 1;
                g.strokeStyle = col.light + "99";
                g.lineWidth = 1.2;
                g.strokeRect(a + 0.6, a + 0.6, b - a - 1.2, b - a - 1.2);
                return;
            }
            const active = style === "active";
            if (active) {
                g.shadowColor = col.light;
                g.shadowBlur = 12;
                g.fillStyle = col.base;
                g.fillRect(a, a, b - a, b - a);
                g.shadowBlur = 0;
            }
            // facets, darkest to the bottom right
            const facets = [
                [[tl, t1, t8], "#ffffff", 0.55, col.light],
                [[tl, tr, t2, t1], null, 0, col.light],
                [[bl, tl, t8, t7], col.base, 0.35, col.light],
                [[tr, t3, t2], null, 0, col.base],
                [[bl, t7, t6], null, 0, col.base],
                [[tr, br, t4, t3], null, 0, col.dark],
                [[br, bl, t6, t5], "#000000", 0.2, col.dark],
                [[br, t5, t4], "#000000", 0.35, col.dark],
            ];
            for (const [points, tint, alpha, fill] of facets) {
                poly(points);
                g.fillStyle = fill;
                g.fill();
                if (tint) {
                    g.globalAlpha = alpha;
                    g.fillStyle = tint;
                    g.fill();
                    g.globalAlpha = 1;
                }
            }
            // the table, darker where it faces away, with a reflection across it
            poly(table);
            const face = g.createLinearGradient(fa, fa, fb, fb);
            face.addColorStop(0, col.base);
            face.addColorStop(1, col.dark);
            g.fillStyle = face;
            g.fill();
            g.save();
            poly(table);
            g.clip();
            g.beginPath();
            g.moveTo(fa, fb - (fb - fa) * 0.2);
            g.lineTo(fa + (fb - fa) * 0.55, fa - 1);
            g.lineTo(fa + (fb - fa) * 0.85, fa - 1);
            g.lineTo(fa + (fb - fa) * 0.1, fb + 1);
            g.closePath();
            g.fillStyle = "rgba(255,255,255,0.28)";
            g.fill();
            g.restore();
            // facet edges
            g.strokeStyle = "rgba(255,255,255,0.22)";
            g.lineWidth = 0.75;
            poly(table);
            g.stroke();
            for (const [p, q] of [[tl, t1], [tl, t8], [tr, t2], [tr, t3], [br, t4], [br, t5], [bl, t6], [bl, t7]]) {
                g.beginPath();
                g.moveTo(...p);
                g.lineTo(...q);
                g.stroke();
            }
            if (active) { // a sparkle on the table's corner
                const [sx, sy] = t1, s = size * 0.16;
                g.fillStyle = "rgba(255,255,255,0.95)";
                g.beginPath();
                g.moveTo(sx, sy - s); g.lineTo(sx + s * 0.18, sy - s * 0.18);
                g.lineTo(sx + s, sy); g.lineTo(sx + s * 0.18, sy + s * 0.18);
                g.lineTo(sx, sy + s); g.lineTo(sx - s * 0.18, sy + s * 0.18);
                g.lineTo(sx - s, sy); g.lineTo(sx - s * 0.18, sy - s * 0.18);
                g.closePath();
                g.fill();
            } else {
                g.fillStyle = "rgba(6,8,22,0.2)";
                g.fillRect(a, a, b - a, b - a);
            }
        },
    },

    // Toy bricks seen from above: a bevelled body and a round stud
    studs: {
        name: "Studs",
        face: [0.5, 0.08],
        pad: (style) => style === "active" ? 10 : 0,
        draw(g, col, size, style) {
            const [inset, round] = this.face, w = size - inset * 2, r = size * round;
            const cx = size / 2, cy = size / 2, sr = size * 0.24;
            const path = () => { g.beginPath(); g.roundRect(inset, inset, w, w, r); };
            const stud = (dx, dy, rad) => { g.beginPath(); g.arc(cx + dx, cy + dy, rad, 0, Math.PI * 2); };
            if (style === "ghost") {
                path();
                g.fillStyle = col.base + "1c";
                g.fill();
                g.strokeStyle = col.light + "99";
                g.lineWidth = 1.2;
                g.stroke();
                stud(0, 0, sr);
                g.stroke();
                return;
            }
            const active = style === "active";
            if (active) {
                g.shadowColor = col.light;
                g.shadowBlur = 12;
            }
            path();
            g.fillStyle = col.base;
            g.fill();
            g.shadowBlur = 0;
            // the body's bevel: lit top and left, shaded bottom and right
            g.save();
            path();
            g.clip();
            const e = size * 0.08;
            g.fillStyle = "rgba(255,255,255,0.28)";
            g.fillRect(inset, inset, w, e);
            g.fillRect(inset, inset, e, w);
            g.fillStyle = "rgba(0,0,0,0.25)";
            g.fillRect(inset, inset + w - e, w, e);
            g.fillRect(inset + w - e, inset + e, e, w - e);
            g.restore();
            // the stud: its shadow, its side, its top
            stud(size * 0.05, size * 0.07, sr);
            g.fillStyle = "rgba(0,0,0,0.3)";
            g.fill();
            stud(0, 0, sr);
            const side = g.createLinearGradient(cx - sr, cy - sr, cx + sr, cy + sr);
            side.addColorStop(0, col.light);
            side.addColorStop(1, col.dark);
            g.fillStyle = side;
            g.fill();
            stud(-size * 0.015, -size * 0.02, sr * 0.82);
            g.fillStyle = col.base;
            g.fill();
            g.beginPath();
            g.arc(cx - size * 0.015, cy - size * 0.02, sr * 0.82, Math.PI * 0.95, Math.PI * 1.55);
            g.strokeStyle = "rgba(255,255,255,0.65)";
            g.lineWidth = 1;
            g.stroke();
            g.globalCompositeOperation = "source-atop";
            g.fillStyle = active ? "rgba(255,255,255,0.14)" : "rgba(6,8,22,0.2)";
            g.fillRect(0, 0, size, size);
            g.globalCompositeOperation = "source-over";
            if (active) {
                path();
                g.strokeStyle = "rgba(255,255,255,0.7)";
                g.lineWidth = 1.2;
                g.stroke();
            }
        },
    },

    // Folded paper: each square creased along a diagonal, one half to the light, matte grain
    origami: {
        name: "Origami",
        face: [1.5, 0.04],
        pad: (style) => style === "active" ? 10 : 0,
        draw(g, col, size, style, index) {
            const [inset, round] = this.face, a = inset, b = size - inset, w = b - a, r = size * round;
            const flip = index % 2 === 0; // the crease's direction alternates by colour
            // the crease from p to q; "lit" is the half towards the top left
            const p = flip ? [a, a] : [b, a], q = flip ? [b, b] : [a, b];
            const lit = flip ? [[a, a], [b, b], [a, b]] : [[b, a], [a, b], [a, a]];
            const shaded = flip ? [[a, a], [b, a], [b, b]] : [[b, a], [b, b], [a, b]];
            const poly = (points) => {
                g.beginPath();
                points.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
                g.closePath();
            };
            const path = () => { g.beginPath(); g.roundRect(a, a, w, w, r); };
            if (style === "ghost") {
                path();
                g.fillStyle = col.base + "1c";
                g.fill();
                g.strokeStyle = col.light + "99";
                g.lineWidth = 1.2;
                g.stroke();
                g.beginPath();
                g.moveTo(...p);
                g.lineTo(...q);
                g.strokeStyle = col.light + "55";
                g.stroke();
                return;
            }
            const active = style === "active";
            if (active) {
                g.shadowColor = col.light;
                g.shadowBlur = 12;
            }
            path();
            g.fillStyle = col.base;
            g.fill();
            g.shadowBlur = 0;
            g.save();
            path();
            g.clip();
            poly(lit);
            g.fillStyle = "rgba(255,255,255,0.16)";
            g.fill();
            poly(shaded);
            g.fillStyle = "rgba(0,0,0,0.12)";
            g.fill();
            // the fold's shadow, fading away from the crease on the shaded side
            const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, nx = 1, ny = flip ? -1 : 1;
            const fold = g.createLinearGradient(mx, my, mx + nx * w * 0.22, my + ny * w * 0.22);
            fold.addColorStop(0, "rgba(0,0,0,0.22)");
            fold.addColorStop(1, "rgba(0,0,0,0)");
            poly(shaded);
            g.fillStyle = fold;
            g.fill();
            // paper grain
            const rnd = seededRandom(index * 71 + 5);
            for (let i = 0; i < 60; i++) {
                g.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
                g.fillRect(a + rnd() * w, a + rnd() * w, 0.8, 0.8);
            }
            g.restore();
            // the crease: a light line beside a dark one
            g.beginPath();
            g.moveTo(...p);
            g.lineTo(...q);
            g.strokeStyle = "rgba(0,0,0,0.25)";
            g.lineWidth = 1;
            g.stroke();
            g.beginPath();
            const oy = flip ? 0.7 : -0.7; // towards the lit half
            g.moveTo(p[0] - 0.7, p[1] + oy);
            g.lineTo(q[0] - 0.7, q[1] + oy);
            g.strokeStyle = "rgba(255,255,255,0.22)";
            g.stroke();
            path();
            g.strokeStyle = active ? "rgba(255,255,255,0.75)" : col.light + "55";
            g.lineWidth = 1;
            g.stroke();
            if (!active) {
                path();
                g.fillStyle = "rgba(6,8,22,0.16)";
                g.fill();
            }
        },
    },

    // Chalk on a blackboard: a rough outline, hatching, grainy strokes
    chalk: {
        name: "Chalk",
        lamp: false, // chalk dust is matte: no light on it
        face: [2, 0.06],
        pad: (style) => style === "active" ? 10 : 2,
        draw(g, col, size, style, index) {
            const [inset] = this.face, a = inset, b = size - inset, w = b - a;
            const rnd = seededRandom(index * 131 + (style === "active" ? 3 : 17));
            const j = (k) => (rnd() - 0.5) * size * k;
            const outline = (alpha, lw) => { // four strokes overshooting the corners a little
                g.strokeStyle = col.light;
                g.globalAlpha = alpha;
                g.lineWidth = lw;
                g.lineCap = "round";
                const sides = [[[a, a], [b, a]], [[b, a], [b, b]], [[b, b], [a, b]], [[a, b], [a, a]]];
                for (const [[x0, y0], [x1, y1]] of sides) {
                    const ox = Math.sign(x1 - x0) * size * 0.04, oy = Math.sign(y1 - y0) * size * 0.04;
                    g.beginPath();
                    g.moveTo(x0 - ox + j(0.03), y0 - oy + j(0.03));
                    g.quadraticCurveTo((x0 + x1) / 2 + j(0.05), (y0 + y1) / 2 + j(0.05), x1 + ox * 0.5 + j(0.03), y1 + oy * 0.5 + j(0.03));
                    g.stroke();
                }
                g.globalAlpha = 1;
            };
            if (style === "ghost") {
                g.setLineDash([2, 3]);
                outline(0.5, 1.2);
                g.setLineDash([]);
                return;
            }
            const active = style === "active";
            if (active) {
                g.shadowColor = col.light;
                g.shadowBlur = 8;
            }
            g.fillStyle = col.base;
            g.globalAlpha = active ? 0.3 : 0.16;
            g.fillRect(a, a, w, w);
            g.globalAlpha = 1;
            g.shadowBlur = 0;
            // hatching at 45 degrees, clipped to the square
            g.save();
            g.beginPath();
            g.rect(a, a, w, w);
            g.clip();
            g.strokeStyle = col.light;
            g.lineCap = "round";
            const step = size * (active ? 0.12 : 0.15);
            for (let d = -w; d < w; d += step) {
                g.globalAlpha = (active ? 0.6 : 0.45) + rnd() * 0.3;
                g.lineWidth = 1 + rnd() * 0.6;
                g.beginPath();
                g.moveTo(a + d + j(0.04), b + j(0.04));
                g.lineTo(a + d + w + j(0.04), a + j(0.04));
                g.stroke();
            }
            g.restore();
            outline(active ? 1 : 0.85, active ? 1.8 : 1.5);
            outline(0.4, 1);
            // chalk grain: dust rubbed out of the strokes
            g.globalCompositeOperation = "destination-out";
            for (let i = 0; i < 90; i++) {
                g.globalAlpha = 0.3 + rnd() * 0.5;
                g.fillRect(rnd() * size, rnd() * size, 0.9, 0.9);
            }
            g.globalAlpha = 1;
            g.globalCompositeOperation = "source-over";
        },
    },

    // Stained wood: grain running across each block, a bevel and a coat of varnish
    wood: {
        name: "Wood",
        face: [1, 0.08],
        pad: (style) => style === "active" ? 10 : 0,
        draw(g, col, size, style, index) {
            const [inset, round] = this.face, w = size - inset * 2, r = size * round;
            const path = () => { g.beginPath(); g.roundRect(inset, inset, w, w, r); };
            if (style === "ghost") {
                path();
                g.fillStyle = col.base + "1c";
                g.fill();
                g.strokeStyle = col.light + "99";
                g.lineWidth = 1.2;
                g.stroke();
                return;
            }
            const active = style === "active";
            if (active) {
                g.shadowColor = col.light;
                g.shadowBlur = 12;
            }
            path();
            g.fillStyle = col.base;
            g.fill();
            g.shadowBlur = 0;
            g.save();
            path();
            g.clip();
            // the stain is darker in the late wood: bands of grain, wavy, one knot in some colours
            const rnd = seededRandom(index * 37 + 23);
            const knot = index % 3 === 0 ? [inset + w * (0.3 + rnd() * 0.4), inset + w * (0.3 + rnd() * 0.4)] : null;
            for (let y = inset - 2; y < inset + w + 2; y += 1.6 + rnd() * 2.4) {
                const amp = size * (0.015 + rnd() * 0.03), phase = rnd() * Math.PI * 2;
                g.beginPath();
                for (let x = inset; x <= inset + w; x += 1) {
                    let yy = y + Math.sin(phase + x / size * 4) * amp;
                    if (knot) { // grain swerves round the knot
                        const dx = x - knot[0], dy = yy - knot[1], d2 = dx * dx + dy * dy;
                        yy += Math.sign(dy || 1) * size * 0.9 * Math.exp(-d2 / (size * size * 0.02)) * 0.12;
                    }
                    x === inset ? g.moveTo(x, yy) : g.lineTo(x, yy);
                }
                const dark = rnd() < 0.6;
                g.strokeStyle = dark ? col.dark : col.light;
                g.globalAlpha = dark ? 0.55 + rnd() * 0.35 : 0.2 + rnd() * 0.15;
                g.lineWidth = 0.5 + rnd() * 1.1;
                g.stroke();
            }
            g.globalAlpha = 1;
            if (knot) {
                for (let k = 3; k > 0; k--) {
                    g.beginPath();
                    g.ellipse(knot[0], knot[1], size * 0.03 * k, size * 0.018 * k, 0, 0, Math.PI * 2);
                    g.strokeStyle = col.dark;
                    g.globalAlpha = 0.5;
                    g.lineWidth = 0.8;
                    g.stroke();
                }
                g.globalAlpha = 1;
            }
            // bevel and varnish
            const e = size * 0.07;
            g.fillStyle = "rgba(255,255,255,0.2)";
            g.fillRect(inset, inset, w, e);
            g.fillRect(inset, inset, e, w);
            g.fillStyle = "rgba(0,0,0,0.28)";
            g.fillRect(inset, inset + w - e, w, e);
            g.fillRect(inset + w - e, inset + e, e, w - e);
            const varnish = g.createLinearGradient(0, inset, 0, inset + w);
            varnish.addColorStop(0, "rgba(255,255,255,0.16)");
            varnish.addColorStop(0.45, "rgba(255,255,255,0)");
            g.fillStyle = varnish;
            g.fillRect(inset, inset, w, w);
            g.fillStyle = active ? "rgba(255,255,255,0.1)" : "rgba(6,8,22,0.2)";
            g.fillRect(inset, inset, w, w);
            g.restore();
            if (active) {
                path();
                g.strokeStyle = "rgba(255,255,255,0.7)";
                g.lineWidth = 1.2;
                g.stroke();
            }
        },
    },

    // Monochrome: every piece in the same warm gallery white, soft rims, no colour at all
    mono: {
        name: "Mono",
        face: [1.5, 0.1],
        pad: (style) => style === "active" ? 10 : 0,
        trail: (index) => `rgb(${index === GARBAGE_COLOR ? MONO_GARBAGE_INK : MONO_INK})`,
        draw(g, col, size, style, index) {
            const ink = index === GARBAGE_COLOR ? MONO_GARBAGE_INK : MONO_INK;
            const [inset, round] = this.face, w = size - inset * 2, r = size * round;
            const path = () => { g.beginPath(); g.roundRect(inset, inset, w, w, r); };
            if (style === "ghost") {
                path();
                g.fillStyle = `rgba(${ink},0.06)`;
                g.fill();
                g.strokeStyle = `rgba(${ink},0.45)`;
                g.lineWidth = 1.2;
                g.stroke();
                return;
            }
            const active = style === "active";
            if (active) {
                g.shadowColor = `rgba(${ink},0.8)`;
                g.shadowBlur = 14;
            }
            path();
            const body = g.createLinearGradient(0, inset, 0, inset + w);
            body.addColorStop(0, `rgba(${ink},${active ? 1 : 0.62})`);
            body.addColorStop(1, `rgba(${ink},${active ? 0.82 : 0.42})`);
            g.fillStyle = body;
            g.fill();
            g.shadowBlur = 0;
            // inset face, a shade darker, so neighbouring cells stay apart
            g.beginPath();
            g.roundRect(inset + size * 0.18, inset + size * 0.18, w - size * 0.36, w - size * 0.36, r * 0.6);
            g.fillStyle = active ? "rgba(6,8,22,0.10)" : "rgba(6,8,22,0.16)";
            g.fill();
            path();
            g.strokeStyle = active ? "rgba(255,255,255,0.95)" : `rgba(${ink},0.75)`;
            g.lineWidth = 1;
            g.stroke();
        },
    },

    // Monochrome four-shade green, like the 1989 handheld's screen: each piece has its own pattern
    retro1989: {
        name: "1989",
        lamp: false, // a handheld screen: no light on it
        pad: () => 0,
        // the block's main shade; dark-bodied blocks take the light one, so the trail shows
        trail: (index) => GB_SHADES[index === 4 || index === 7 ? 3 : 2],
        draw(g, col, size, style, index) {
            const [darkest, dark, light, lightest] = GB_SHADES;
            const p = size / 8;
            const px = (x, y, w, h, fill) => { g.fillStyle = fill; g.fillRect(x * p, y * p, w * p, h * p); };
            if (style === "ghost") {
                g.strokeStyle = light + "88";
                g.lineWidth = 1.5;
                g.setLineDash([p, p]);
                g.strokeRect(p * 0.5, p * 0.5, size - p, size - p);
                g.setLineDash([]);
                return;
            }
            px(0, 0, 8, 8, darkest); // outline, as all of its blocks have
            switch (index) {
                case 1: px(1, 1, 6, 6, light); px(1, 3, 6, 2, lightest); break;               // bar
                case 2: px(1, 1, 6, 6, dark); px(3, 3, 2, 2, lightest); break;                // dark with a light core
                case 3: px(1, 1, 6, 6, light); px(2, 2, 4, 4, dark); px(3, 3, 2, 2, light); break; // rings
                case 4: px(1, 1, 6, 6, lightest); px(3, 3, 2, 2, darkest); break;             // light with a dot
                case 5: px(1, 1, 6, 6, dark); px(2, 2, 4, 4, light); break;                   // framed
                case 6: px(1, 1, 6, 6, light); for (let y = 1; y < 7; y++) for (let x = 1 + y % 2; x < 7; x += 2) px(x, y, 1, 1, dark); break; // checks
                case GARBAGE_COLOR: px(1, 1, 6, 6, dark); px(2, 2, 4, 4, darkest); break;    // versus garbage: dark, sunken
                default: px(1, 1, 6, 6, lightest); px(2, 2, 4, 4, light); px(2, 2, 4, 1, lightest); break; // pillow
            }
            px(1, 1, 1, 1, lightest); // a glint in the corner
            if (style === "active") px(0, 0, 8, 8, "rgba(255,255,230,0.14)");
            else px(0, 0, 8, 8, "rgba(6,8,22,0.16)");
        },
    },

    // The original C++ game's tiles: bright for the falling piece, dark when settled
    original: {
        name: "Original",
        pad: () => 0,
        draw(g, col, size, style, index) {
            const img = TILE_IMAGES[style][index];
            if (!img) return TILESETS.flat.draw(g, col, size, style);
            g.imageSmoothingEnabled = true;
            g.drawImage(img, 0, 0, size, size);
        },
    },
};

const TILESET_IDS = Object.keys(TILESETS);
