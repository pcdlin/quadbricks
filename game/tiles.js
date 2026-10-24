// Block styles. Each draws one block into a sprite canvas that is already scaled and
// offset by pad(style): draw(g, col, size, style, index), where col is the colour entry
// ({base, light, dark}), index the palette index (1..7) and style "active" (falling
// piece), "locked" (settled stack) or "ghost" (landing preview).

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

// Game Boy screen shades, darkest to lightest
const GB_SHADES = ["#0f380f", "#306230", "#8bac0f", "#c8dc9a"]; // lightest lifted for contrast

const TILESETS = {
    // Translucent, luminous glass cells that bloom into the backdrop (Tetris Effect look)
    radiant: {
        name: "Radiant",
        pad: (style) => style === "active" ? 14 : style === "ghost" ? 4 : 7,
        draw(g, col, size, style) {
            const inset = 1.5;
            const w = size - inset * 2;
            const r = size * 0.2;
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
        pad: (style) => style === "active" ? 10 : 0, // room for the glow
        draw(g, col, size, style) {
            const inset = 1;
            const w = size - inset * 2;
            const r = size * 0.14;

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

    // Solid colour, square-ish, no gloss
    flat: {
        name: "Flat",
        pad: () => 0,
        draw(g, col, size, style) {
            const inset = 1.5;
            const w = size - inset * 2;
            const r = size * 0.06;
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

    // Dark glass cells with glowing coloured outlines
    neon: {
        name: "Neon",
        pad: (style) => style === "ghost" ? 0 : 8,
        draw(g, col, size, style) {
            const inset = 2.5;
            const w = size - inset * 2;
            const r = size * 0.12;
            g.beginPath();
            g.roundRect(inset, inset, w, w, r);
            if (style === "ghost") {
                g.strokeStyle = col.base + "77";
                g.lineWidth = 1;
                g.stroke();
                return;
            }
            const active = style === "active";
            g.fillStyle = col.dark + (active ? "88" : "55");
            g.fill();
            g.shadowColor = col.light;
            g.shadowBlur = active ? 14 : 6;
            g.strokeStyle = active ? col.light : col.base;
            g.lineWidth = active ? 2 : 1.5;
            g.stroke();
            g.shadowBlur = 0;
        },
    },

    // Bevelled pyramid blocks: four lit facets around a flat face, as on 8- and 16-bit consoles
    faceted: {
        name: "Faceted",
        pad: (style) => style === "active" ? 8 : 0,
        draw(g, col, size, style) {
            const inset = 1, w = size - inset * 2, a = inset, b = inset + w;
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

    // Monochrome: every piece in the same warm gallery white, soft rims, no colour at all
    mono: {
        name: "Mono",
        pad: (style) => style === "active" ? 10 : 0,
        draw(g, col, size, style) {
            const ink = "244,236,220";
            const inset = 1.5, w = size - inset * 2, r = size * 0.1;
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

    // Monochrome four-shade green, like the Game Boy's screen: each piece has its own pattern
    gameboy: {
        name: "1989",
        pad: () => 0,
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
            px(0, 0, 8, 8, darkest); // outline, as all Game Boy blocks have
            switch (index) {
                case 1: px(1, 1, 6, 6, light); px(1, 3, 6, 2, lightest); break;               // bar
                case 2: px(1, 1, 6, 6, dark); px(3, 3, 2, 2, lightest); break;                // dark with a light core
                case 3: px(1, 1, 6, 6, light); px(2, 2, 4, 4, dark); px(3, 3, 2, 2, light); break; // rings
                case 4: px(1, 1, 6, 6, lightest); px(3, 3, 2, 2, darkest); break;             // light with a dot
                case 5: px(1, 1, 6, 6, dark); px(2, 2, 4, 4, light); break;                   // framed
                case 6: px(1, 1, 6, 6, light); for (let y = 1; y < 7; y++) for (let x = 1 + y % 2; x < 7; x += 2) px(x, y, 1, 1, dark); break; // checks
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
