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
