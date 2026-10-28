// Themes (Options → Visuals → Theme): the look around the blocks: the backdrop, the well's frame,
// the side panels, the menu cards and the wordmark. The block styles (tiles.js) and effects are
// chosen separately and work with every theme.
// Each theme has a name and background(g, x0, y0, x1, y1), the static backdrop picture drawn with
// canvas 2D in logical units (x0..x1, y0..y1 is the visible area, past the view when letterboxed).
// The rest is optional; without it the engine draws Gallery's look:
// - ink: [r, g, b] (0..1) that text drawn in INK's colour takes instead (any alpha)
// - ambient(e): { blobs, orbs, nebula, shade } for the backdrop pass in place of Engine.ambientShapes()
//   (see GLBackdrop.render(): nebula shapes the blobs with noise, shade hides them behind circles), and
//   update(e, dt) to move them on (runs in the menus too)
// - lines(e): the field lines the backdrop pass draws over the picture (GLBackdrop.render())
// - hueStep: how far a line clear moves the backdrop's hue, as a share of HUE_STEP
// - glowRgb(e): the board glow's colour, or null for none
// - frame(e, rect, exam): the well's frame and grid (rect: [x, y, w, h]; exam: a TGM3 promotional exam)
// - panel(e, x, y, w, h), label(e, s, x, y, w, size, spacing), card(e, x, y, w, h, radius, selected,
//   accent, barW), stripe(e, x, y, w, h) (the seven-colour stripe) and wordmark(e, cx) (the menu's)
// They draw with the engine (e) and its renderer (e.r) in logical units, like its own methods.

// Corner brackets just outside a rectangle: arms len long and lw wide
function drawBrackets(r, x, y, w, h, len, lw, color) {
    r.rect(x - lw, y - lw, len, lw, color); r.rect(x - lw, y, lw, len - lw, color);
    r.rect(x + w - len + lw, y - lw, len, lw, color); r.rect(x + w, y, lw, len - lw, color);
    r.rect(x - lw, y + h, len, lw, color); r.rect(x - lw, y + h - len + lw, lw, len - lw, color);
    r.rect(x + w - len + lw, y + h, len, lw, color); r.rect(x + w, y + h - len + lw, lw, len - lw, color);
}

// Deep Space: part of the planet's atmosphere drawn by paint(a) (a context with g's transform) onto
// its own layer, faded toward the planet's night side (lower left), then laid onto g
function spaceAtmosphere(g, paint) {
    const layer = document.createElement("canvas");
    layer.width = g.canvas.width;
    layer.height = g.canvas.height;
    const a = layer.getContext("2d");
    a.setTransform(g.getTransform());
    paint(a);
    const { x: px, y: py, r: pr } = SPACE_PLANET;
    const light = a.createLinearGradient(px - pr * 0.7, py + pr * 0.2, px + pr * 0.5, py - pr * 0.9);
    light.addColorStop(0, "rgba(0,0,0,0.2)");
    light.addColorStop(1, "rgba(0,0,0,1)");
    a.globalCompositeOperation = "destination-in";
    a.fillStyle = light;
    a.fillRect(px - pr - SPACE_HAZE, py - pr - SPACE_HAZE, (pr + SPACE_HAZE) * 2, (pr + SPACE_HAZE) * 2);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(layer, 0, 0);
    g.restore();
}

// Deep Space: how much of a point in the sky shows (0..1), as it goes behind the planet or the moon
function spaceInView(x, y) {
    const { x: px, y: py, r: pr } = SPACE_PLANET, { x: mx, y: my, r: mr } = SPACE_MOON;
    return clamp((Math.hypot(x - px, y - py) - pr - 6) / 24, 0, 1) * clamp((Math.hypot(x - mx, y - my) - mr - 2) / 4, 0, 1);
}

// Deep Space: the moon, lit from SPACE_LIGHT: a cool grey disc with darker maria and craters (a
// shadowed wall away from the light, a lit one toward it), its night side in shadow past a soft
// terminator (a gibbous phase) and a bright rim along its lit edge
function spaceMoon(g) {
    const { x, y, r } = SPACE_MOON, [lx, ly] = SPACE_LIGHT;
    g.save();
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.clip();
    const face = g.createRadialGradient(x + lx * r * 0.45, y + ly * r * 0.45, r * 0.1, x, y, r * 1.1);
    face.addColorStop(0, "#e3e9f4");
    face.addColorStop(0.6, "#a9b4c8");
    face.addColorStop(1, "#6d778c");
    g.fillStyle = face;
    g.fillRect(x - r, y - r, r * 2, r * 2);
    const rnd = themeRandom(7);
    for (let i = 0; i < 4; i++) { // maria: broad, soft, darker plains
        const mx = x + (rnd() - 0.5) * r * 1.2, my = y + (rnd() - 0.5) * r * 1.2, mr = r * (0.25 + rnd() * 0.25);
        const sea = g.createRadialGradient(mx, my, 0, mx, my, mr);
        sea.addColorStop(0, "rgba(60,70,95,0.4)");
        sea.addColorStop(1, "rgba(60,70,95,0)");
        g.fillStyle = sea;
        g.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
    }
    for (let i = 0; i < 16; i++) { // craters, smaller ones more common
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r * 0.9;
        const cx = x + Math.cos(a) * d, cy = y + Math.sin(a) * d, cr = 1 + Math.pow(rnd(), 2) * r * 0.22;
        g.fillStyle = "rgba(55,64,85,0.35)";
        g.beginPath();
        g.arc(cx, cy, cr, 0, Math.PI * 2);
        g.fill();
        g.lineWidth = Math.max(0.6, cr * 0.18);
        const toward = Math.atan2(ly, lx); // the wall facing the light is lit, the other shadowed
        g.strokeStyle = "rgba(245,248,255,0.55)";
        g.beginPath();
        g.arc(cx, cy, cr, toward + Math.PI * 0.6, toward + Math.PI * 1.4);
        g.stroke();
        g.strokeStyle = "rgba(25,30,45,0.5)";
        g.beginPath();
        g.arc(cx, cy, cr, toward - Math.PI * 0.4, toward + Math.PI * 0.4);
        g.stroke();
    }
    // the night side
    const night = g.createLinearGradient(x + lx * r, y + ly * r, x - lx * r, y - ly * r);
    night.addColorStop(0, "rgba(3,5,14,0)");
    night.addColorStop(0.55, "rgba(3,5,14,0)");
    night.addColorStop(0.75, "rgba(3,5,14,0.7)");
    night.addColorStop(1, "rgba(3,5,14,0.93)");
    g.fillStyle = night;
    g.fillRect(x - r, y - r, r * 2, r * 2);
    g.restore();
    // the lit rim, and a faint edge all round so the night side still has an outline
    const toward = Math.atan2(ly, lx);
    g.lineWidth = 1;
    g.strokeStyle = "rgba(150,175,215,0.25)";
    g.beginPath();
    g.arc(x, y, r - 0.5, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 1.4;
    g.strokeStyle = "rgba(240,246,255,0.75)";
    g.beginPath();
    g.arc(x, y, r - 0.7, toward - 1.1, toward + 1.1);
    g.stroke();
}

// Repeatable pseudo-random numbers in 0..1 (the same picture after every resize); not tiles.js's
// seededRandom(), which the block styles use: the scripts share globals, so the names must differ
function themeRandom(seed) {
    return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

// Deep Space: the planet low on the left (logical units), its atmosphere and ring
const SPACE_PLANET = { x: -60, y: 980, r: 520 };
const SPACE_NEBULA_ALPHA = 0.22; // the nebulae's strength at rest (Normal effects)
const SPACE_HAZE = 60; // how far its atmosphere reaches past its edge
const SPACE_MOON = { x: 712, y: 610, r: 32 };
const SPACE_LIGHT = [0.62, -0.78]; // where the sun is, from the planet and moon (unit vector, y down)
const SPACE_STARS = 64; // drifting stars over the picture's fixed ones
const SPACE_DRIFT = [0.03, 0.22]; // their speed leftward, farthest to nearest (logical units per frame)
const SPACE_WARP = 7; // how much faster they go on a line clear's pulse
const SPACE_METEOR_EVERY = [480, 1100]; // frames between shooting stars
const SPACE_METEOR_LIFE = 50, SPACE_METEOR_SPEED = 9, SPACE_METEOR_TAIL = 14;
// A bright nearby star that now and then drifts across: frames between passes (the first comes after
// SPACE_SUN_FIRST), its speed leftward (logical units per frame) and its light: halo layers (radius,
// alpha) and diffraction spikes (length across and up; drawn as lights SPACE_SUN_SPIKE_STEP apart,
// close enough to run together)
const SPACE_SUN_EVERY = [3600, 7200], SPACE_SUN_FIRST = [600, 1500];
const SPACE_SUN_SPEED = 0.55;
const SPACE_SUN_HALO = [[160, 0.09], [64, 0.24], [24, 0.6], [8, 1]];
const SPACE_SUN_SPIKES = [120, 64], SPACE_SUN_SPIKE_STEP = 2.5;
// The orbital rings under the menu's wordmark, concentric and in one plane seen nearly edge-on (their
// height SPACE_ORBIT_FLAT times their width): half width, the dots' speed (radians per frame; inner rings
// faster) and the piece colours going round each
const SPACE_ORBITS = [
    { rx: 128, speed: 0.0075, colors: [tetI, tetO] },
    { rx: 168, speed: 0.005, colors: [tetT, tetS, tetZ] },
    { rx: 208, speed: 0.0035, colors: [tetL, tetJ] },
];
const SPACE_ORBIT_FLAT = 0.06;
const SPACE_ORBIT_Y = 198; // their centre, clear of the Visuals screen's heading under them
const SPACE_LINE ="rgba(110,215,255,0.28)"; // HUD hairlines
const SPACE_BRACKET = "rgba(150,232,255,0.9)";
const SPACE_LABEL = "rgba(127,220,255,0.9)";

// Field lines: the lines' spacing (logical units), ink and the bumps they bend round: centre, radius,
// height (negative bends them up) and colour
const LINES_SPACING = 9;
const LINES_INK = "rgba(242,242,242,0.13)";
const LINES_BUMPS = [[130, 230, 150, 40, tetL], [690, 180, 120, -34, tetI], [660, 560, 170, 46, tetT], [120, 600, 110, -28, tetS]];
const LINES_DRIFT = [42, 30]; // how far the bumps wander (logical units)
const LINES_SWELL = 0.8; // extra height on a line clear's pulse
const LINES_HUE_STEP = 1.5; // how far a clear turns the bumps' colours, as a share of HUE_STEP (Gallery's 1)
const LINES_RULE = "rgba(242,242,242,0.85)";
const LINES_FILL = "rgba(6,6,7,0.84)";
const LINES_WELL_ALPHA = 0.7; // the well's fill (0.94 with effects off, as Gallery's goes more solid)

const THEMES = {
    // Night gallery: deep gradient, soft spotlight, receding floor grid
    gallery: {
        name: "Night Gallery", // id "gallery", as saved
        background(g, x0, y0, x1, y1) {
            const sky = g.createLinearGradient(0, y0, 0, y1);
            sky.addColorStop(0, "#0d1230");
            sky.addColorStop(0.6, "#080a1d");
            sky.addColorStop(1, "#04050e");
            g.fillStyle = sky;
            g.fillRect(x0, y0, x1 - x0, y1 - y0);

            const spot = g.createRadialGradient(VIEW_W / 2, VIEW_H * 0.42, 20, VIEW_W / 2, VIEW_H * 0.42, VIEW_W * 0.6);
            spot.addColorStop(0, "rgba(90,80,200,0.22)");
            spot.addColorStop(0.5, "rgba(40,50,140,0.08)");
            spot.addColorStop(1, "rgba(0,0,0,0)");
            g.fillStyle = spot;
            g.fillRect(x0, y0, x1 - x0, y1 - y0);

            // perspective floor
            const horizon = VIEW_H * 0.7;
            const depth = y1 - horizon;
            // The lines fade in below the horizon (a gradient stroke: painting a fade over them
            // would also cover the sky and spotlight and leave a hard edge)
            const lines = g.createLinearGradient(0, horizon - 40, 0, horizon + 30);
            lines.addColorStop(0, "rgba(150,160,255,0)");
            lines.addColorStop(1, "rgba(150,160,255,0.07)");
            g.strokeStyle = lines;
            g.lineWidth = 1;
            const spread = Math.ceil((x1 - x0) / 240) + 12;
            for (let i = -spread; i <= spread; i++) {
                g.beginPath();
                g.moveTo(VIEW_W / 2 + i * 14, horizon);
                g.lineTo(VIEW_W / 2 + i * 120 * (depth / (VIEW_H - horizon)), y1);
                g.stroke();
            }
            for (let k = 1; k <= 10; k++) {
                const y = horizon + depth * Math.pow(k / 10, 2);
                g.beginPath();
                g.moveTo(x0, y);
                g.lineTo(x1, y);
                g.stroke();
            }
            vignette(g, x0, y0, x1, y1, 0.55);
        },
    },

    // Deep Space: a starfield with nebulae and a ringed planet; HUD-like frame, panels and cards
    space: {
        name: "Deep Space",
        hueStep: 0.4, // the nebulae change colour gently with clears
        ink: [230 / 255, 242 / 255, 255 / 255],
        background(g, x0, y0, x1, y1) {
            const sky = g.createLinearGradient(0, y0, 0, y1);
            sky.addColorStop(0, "#04061a");
            sky.addColorStop(1, "#010208");
            g.fillStyle = sky;
            g.fillRect(x0, y0, x1 - x0, y1 - y0);
            // faint nebulae under the drifting colour clouds (ambient())
            for (const [x, y, r, c] of [[560, 170, 330, "rgba(150,60,255,0.13)"], [700, 330, 260, "rgba(40,200,230,0.09)"],
                [160, 110, 240, "rgba(255,80,170,0.07)"], [430, 260, 320, "rgba(90,80,255,0.08)"]]) {
                const o = g.createRadialGradient(x, y, 0, x, y, r);
                o.addColorStop(0, c);
                o.addColorStop(1, "rgba(0,0,0,0)");
                g.fillStyle = o;
                g.fillRect(x0, y0, x1 - x0, y1 - y0);
            }
            // fixed stars, a few with glints
            const rnd = themeRandom(11);
            const count = Math.round((x1 - x0) * (y1 - y0) / 1300);
            for (let i = 0; i < count; i++) {
                const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0), m = rnd();
                const r = m > 0.985 ? 1.5 : m > 0.9 ? 0.9 : 0.5;
                g.fillStyle = `rgba(${215 + rnd() * 40 | 0},${225 + rnd() * 30 | 0},255,${0.25 + rnd() * 0.55})`;
                g.beginPath();
                g.arc(x, y, r, 0, Math.PI * 2);
                g.fill();
                if (m > 0.993) {
                    g.strokeStyle = "rgba(200,235,255,0.4)";
                    g.lineWidth = 0.7;
                    g.beginPath();
                    g.moveTo(x - 6, y); g.lineTo(x + 6, y);
                    g.moveTo(x, y - 6); g.lineTo(x, y + 6);
                    g.stroke();
                }
            }
            // the planet, lit from the upper right, with a glowing atmosphere and a ring
            const { x: px, y: py, r: pr } = SPACE_PLANET;
            spaceAtmosphere(g, (a) => { // the haze outside, under the planet
                const halo = a.createRadialGradient(px, py, pr - 2, px, py, pr + SPACE_HAZE);
                halo.addColorStop(0, "rgba(120,225,255,0.6)");
                halo.addColorStop(0.1, "rgba(90,200,255,0.32)");
                halo.addColorStop(0.35, "rgba(60,150,255,0.12)");
                halo.addColorStop(0.7, "rgba(50,110,255,0.03)");
                halo.addColorStop(1, "rgba(50,110,255,0)");
                a.fillStyle = halo;
                a.beginPath();
                a.arc(px, py, pr + SPACE_HAZE, 0, Math.PI * 2);
                a.fill();
            });
            const body = g.createRadialGradient(px + 200, py - 320, 40, px, py, pr);
            body.addColorStop(0, "#2a3a7a");
            body.addColorStop(0.6, "#0c1230");
            body.addColorStop(1, "#03040c");
            g.fillStyle = body;
            g.beginPath();
            g.arc(px, py, pr, 0, Math.PI * 2);
            g.fill();
            spaceAtmosphere(g, (a) => { // and its glow inside the rim
                const rim = a.createRadialGradient(px, py, pr - 36, px, py, pr);
                rim.addColorStop(0, "rgba(80,190,255,0)");
                rim.addColorStop(0.6, "rgba(80,190,255,0.08)");
                rim.addColorStop(0.9, "rgba(110,215,255,0.3)");
                rim.addColorStop(1, "rgba(160,235,255,0.55)");
                a.fillStyle = rim;
                a.beginPath();
                a.arc(px, py, pr, 0, Math.PI * 2);
                a.fill();
            });
            g.strokeStyle = "rgba(140,200,255,0.16)";
            g.lineWidth = 1;
            g.beginPath();
            g.ellipse(px, py, pr * 1.45, pr * 0.28, -0.32, Math.PI * 1.05, Math.PI * 1.95);
            g.stroke();
            vignette(g, x0, y0, x1, y1, 0.5);
            spaceMoon(g); // over the vignette: it would dull the moon in its corner
        },
        // drifting stars (nearer ones faster and brighter), now and then a shooting star, and
        // more rarely a bright star passing
        update(e, dt) {
            if (!this.stars) {
                this.stars = Array.from({ length: SPACE_STARS }, () => ({
                    x: Math.random() * VIEW_W, y: Math.random() * VIEW_H, depth: Math.random(),
                    phase: Math.random() * 6.28, twinkle: 0.5 + Math.random() * 2,
                }));
                this.meteor = null;
                this.meteorIn = SPACE_METEOR_EVERY[0] * Math.random();
                this.sun = null;
                this.sunIn = SPACE_SUN_FIRST[0] + Math.random() * (SPACE_SUN_FIRST[1] - SPACE_SUN_FIRST[0]);
            }
            for (const s of this.stars) {
                s.x -= (SPACE_DRIFT[0] + (SPACE_DRIFT[1] - SPACE_DRIFT[0]) * s.depth) * (1 + SPACE_WARP * e.pulse) * dt;
                if (s.x < -10) { s.x = VIEW_W + 10; s.y = Math.random() * VIEW_H; }
            }
            if (this.meteor) {
                this.meteor.life -= dt;
                if (this.meteor.life <= 0) this.meteor = null;
            } else if ((this.meteorIn -= dt) <= 0) {
                const a = 2.6 + Math.random() * 0.4; // down and to the left
                this.meteor = { x: 200 + Math.random() * 600, y: Math.random() * 200, dx: Math.cos(a), dy: Math.sin(a), life: SPACE_METEOR_LIFE };
                this.meteorIn = SPACE_METEOR_EVERY[0] + Math.random() * (SPACE_METEOR_EVERY[1] - SPACE_METEOR_EVERY[0]);
            }
            const reach = SPACE_SUN_HALO[0][0];
            if (this.sun) {
                this.sun.x -= SPACE_SUN_SPEED * (1 + SPACE_WARP * 0.3 * e.pulse) * dt;
                this.sun.y += this.sun.vy * dt;
                if (this.sun.x < -reach) this.sun = null;
            } else if ((this.sunIn -= dt) <= 0) {
                this.sun = { x: VIEW_W + reach, y: VIEW_H * (0.08 + Math.random() * 0.45), vy: (Math.random() - 0.5) * 0.08, phase: Math.random() * 6.28 };
                this.sunIn = SPACE_SUN_EVERY[0] + Math.random() * (SPACE_SUN_EVERY[1] - SPACE_SUN_EVERY[0]);
            }
        },
        ambient(e) {
            const t = e.clock / 60, h = e.hue;
            const swell = (SPACE_NEBULA_ALPHA + 0.2 * e.pulse) * e.softEffectScale();
            // nebulae: violet, teal and rose round the backdrop's hue (so they change colour with
            // line clears), shaped into wisps by the backdrop's noise
            const blobs = [
                [VIEW_W * (0.7 + 0.06 * Math.sin(t * 0.13)), VIEW_H * (0.24 + 0.05 * Math.cos(t * 0.11)), 70, 440],
                [VIEW_W * (0.9 + 0.05 * Math.cos(t * 0.17)), VIEW_H * (0.5 + 0.06 * Math.sin(t * 0.15)), -35, 360],
                [VIEW_W * (0.2 + 0.05 * Math.sin(t * 0.09)), VIEW_H * (0.14 + 0.04 * Math.cos(t * 0.12)), 110, 340],
            ].map(([x, y, off, r]) => ({ x, y, r, h: h + off, s: 85, l: 50, a: swell }));
            const orbs = [];
            // the planet and moon stand in front of the nebulae
            const shade = [[SPACE_PLANET.x, SPACE_PLANET.y, SPACE_PLANET.r], [SPACE_MOON.x, SPACE_MOON.y, SPACE_MOON.r]];
            if (!this.stars) return { blobs, orbs, nebula: 1, shade };
            for (const s of this.stars) {
                const behind = spaceInView(s.x, s.y);
                if (!behind) continue;
                orbs.push({
                    x: s.x, y: s.y, r: 1.6 + 2 * s.depth, h: 210, s: 70, l: 92,
                    a: (0.35 + 0.6 * s.depth) * (0.6 + 0.4 * Math.sin(t * s.twinkle + s.phase)) * (1 + e.pulse) * behind,
                });
            }
            const m = this.meteor;
            if (m) {
                const age = SPACE_METEOR_LIFE - m.life, fade = Math.min(1, m.life / 15, age / 4);
                const hx = m.x + m.dx * SPACE_METEOR_SPEED * age, hy = m.y + m.dy * SPACE_METEOR_SPEED * age;
                for (let k = 0; k < SPACE_METEOR_TAIL; k++) {
                    const f = 1 - k / SPACE_METEOR_TAIL;
                    orbs.push({ x: hx - m.dx * k * 6, y: hy - m.dy * k * 6, r: 1.5 + 3 * f, h: 195, s: 80, l: 90, a: 0.9 * f * f * fade });
                }
            }
            const sun = this.sun, seen = sun && spaceInView(sun.x, sun.y);
            if (seen) {
                // a warm white glow, shimmering a little, with four spikes, the level ones longer
                const shimmer = (0.9 + 0.1 * Math.sin(t * 2.3 + sun.phase)) * seen * (1 + 0.5 * e.pulse);
                for (const [r, a] of SPACE_SUN_HALO) orbs.push({ x: sun.x, y: sun.y, r, h: 42, s: r > 10 ? 90 : 60, l: r > 10 ? 72 : 97, a: a * shimmer });
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const len = dx ? SPACE_SUN_SPIKES[0] : SPACE_SUN_SPIKES[1];
                    for (let d = SPACE_SUN_SPIKE_STEP; d < len; d += SPACE_SUN_SPIKE_STEP) {
                        const f = 1 - d / len; // thinner and fainter toward the tip
                        orbs.push({ x: sun.x + dx * d, y: sun.y + dy * d, r: 1 + 2.4 * f, h: 45, s: 70, l: 92, a: 0.22 * f * f * shimmer });
                    }
                }
            }
            return { blobs, orbs, nebula: 1, shade };
        },
        glowRgb() { return hslToRgb(195, 90, 60); },
        frame(e, [x, y, w, h], exam) {
            const r = e.r;
            r.shape(x, y, w, h, {
                radius: 2, fill: [2 / 255, 6 / 255, 18 / 255, e.options.effects ? 0.62 : 0.92],
                stroke: exam ? goldAlpha(0.6 + 0.35 * e.pulse) : [110 / 255, 215 / 255, 1, 0.3 + 0.4 * e.pulse], lineWidth: 1,
            });
            drawBrackets(r, x, y, w, h, 18, 2, exam ? goldAlpha(0.9) : SPACE_BRACKET);
            // a dot at each inner grid corner, a tick every five rows down the left
            const rows = e.boardH / CELL;
            for (let c = 1; c < BOARD_W / CELL; c++) {
                for (let row = 1; row < rows; row++) r.rect(BOARD_X + c * CELL - 1, e.boardY + row * CELL - 1, 2, 2, "rgba(120,210,255,0.1)");
            }
            for (let row = 0; row <= rows; row += 5) r.rect(x - 9, e.boardY + row * CELL, 5, 1, "rgba(140,220,255,0.5)");
        },
        panel(e, x, y, w, h) {
            e.r.shape(x, y, w, h, { radius: 2, fill: "rgba(4,10,26,0.66)", stroke: "rgba(110,215,255,0.22)", lineWidth: 1 });
            drawBrackets(e.r, x, y, w, h, 10, 1.5, SPACE_BRACKET);
        },
        label(e, s, x, y, w, size, spacing) {
            e.text(s, x, y, { size, weight: 700, color: SPACE_LABEL, spacing });
            const tw = e.measureText(s, size, 700, spacing);
            if (w - tw - 8 > 4) e.r.rect(x + tw + 8, y, w - tw - 8, 1, SPACE_LINE);
        },
        card(e, x, y, w, h, radius, selected, accent) {
            e.r.shape(x, y, w, h, {
                radius: 2, lineWidth: 1,
                fill: selected ? "rgba(20,60,100,0.55)" : "rgba(4,10,26,0.6)",
                stroke: selected ? "rgba(140,230,255,0.6)" : "rgba(110,215,255,0.16)",
            });
            if (selected) {
                drawBrackets(e.r, x - 3, y - 3, w + 6, h + 6, 12, 1.5, SPACE_BRACKET);
                e.r.rect(x + 1, y + 6, 3, h - 12, accent); // down the left edge, clear of the text on tight cards
            }
        },
        // the seven colours as small round lights along a hairline
        stripe(e, x, y, w, h) {
            e.r.rect(x, y + h / 2 - 0.5, w, 1, SPACE_LINE);
            const d = h + 2, gap = (w - d) / 6;
            for (let t = 1; t <= 7; t++) e.r.shape(x + (t - 1) * gap, y + h / 2 - d / 2, d, d, { radius: d / 2, fill: PIECE_COLORS[t].base });
        },
        // a light wordmark over concentric orbital rings seen nearly edge-on, the seven colours going round
        // them: those behind the rings are drawn before them, dimmer and smaller
        wordmark(e, cx) {
            const size = Math.min(72, Math.floor(72 * (e.layout.view[2] - 48) / e.measureText("QUADBRICKS", 72, 500, 20)));
            e.text("QUADBRICKS", cx, 150, { size, weight: 500, align: "center", spacing: Math.round(size * 20 / 72) });
            const r = e.r, tex = this.orbitTexture(r), oy = SPACE_ORBIT_Y;
            const dots = [];
            SPACE_ORBITS.forEach(({ rx, speed, colors }) => {
                colors.forEach((color, n) => {
                    const a = e.clock * speed + n * Math.PI * 2 / colors.length + rx;
                    dots.push({ x: cx + rx * Math.cos(a), y: oy + rx * SPACE_ORBIT_FLAT * Math.sin(a), near: 0.5 + 0.5 * Math.sin(a), color });
                });
            });
            const dot = ({ x, y, near, color }) => {
                const d = 3.5 + 3.5 * near;
                r.save();
                r.globalAlpha *= 0.35 + 0.65 * near;
                r.shape(x - d / 2, y - d / 2, d, d, { radius: d / 2, fill: PIECE_COLORS[color].light });
                r.restore();
            };
            for (const d of dots) if (d.near < 0.5) dot(d);
            r.image(tex.tex, cx - tex.w / 2, oy - tex.h / 2, tex.w, tex.h);
            for (const d of dots) if (d.near >= 0.5) dot(d);
        },
        // The rings, rendered once per resolution: fainter at the back (top) than in front
        orbitTexture(r) {
            const res = r.s;
            if (this.orbits && this.orbits.res === res) return this.orbits;
            if (this.orbits) r.releaseTexture(this.orbits.tex);
            const w = 2 * Math.max(...SPACE_ORBITS.map(o => o.rx)) + 8, h = 48;
            const c = document.createElement("canvas");
            c.width = Math.ceil(w * res);
            c.height = Math.ceil(h * res);
            const g = c.getContext("2d");
            g.scale(res, res);
            g.translate(w / 2, h / 2);
            for (const { rx } of SPACE_ORBITS) {
                const ry = rx * SPACE_ORBIT_FLAT;
                const shade = g.createLinearGradient(0, -ry, 0, ry);
                shade.addColorStop(0, "rgba(140,220,255,0.12)");
                shade.addColorStop(1, "rgba(160,230,255,0.6)");
                g.strokeStyle = shade;
                g.lineWidth = 1;
                g.beginPath();
                g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
                g.stroke();
            }
            this.orbits = { tex: r.texture(c), res, w, h };
            return this.orbits;
        },
    },

    // Field lines: fine lines bending round slowly drifting bumps, taking a piece colour where they
    // bend most; flat black panels with a rule along the top
    lines: {
        name: "Field lines",
        ink: [242 / 255, 242 / 255, 242 / 255],
        hueStep: LINES_HUE_STEP,
        background(g, x0, y0, x1, y1) {
            g.fillStyle = "#060607";
            g.fillRect(x0, y0, x1 - x0, y1 - y0);
            vignette(g, x0, y0, x1, y1, 0.4);
        },
        ambient() { return { blobs: [], orbs: [] }; },
        // still with the animated backdrop or effects off. The bumps' colours turn with the
        // backdrop's hue from where it starts (so with line clears, and its slow drift)
        lines(e) {
            const moving = e.options.effects && e.options.backdrop;
            const t = moving ? e.clock / 60 : 0;
            const turn = moving ? e.hue - HUE_DEFAULT : 0;
            if (!this.bumpHsl) this.bumpHsl = LINES_BUMPS.map(([, , , , color]) => rgbToHsl(parseColor(PIECE_COLORS[color].base)));
            const swell = 1 + LINES_SWELL * e.pulse;
            return {
                spacing: LINES_SPACING,
                ink: parseColor(LINES_INK),
                bumps: LINES_BUMPS.map(([x, y, r, amp], i) => ({
                    x: x + LINES_DRIFT[0] * Math.sin(t * 0.07 + i * 1.7),
                    y: y + LINES_DRIFT[1] * Math.cos(t * 0.05 + i * 2.3),
                    r, amp: amp * swell * (0.85 + 0.15 * Math.sin(t * 0.3 + i)),
                    rgb: hslToRgb(this.bumpHsl[i][0] + turn, this.bumpHsl[i][1], this.bumpHsl[i][2]),
                })),
            };
        },
        glowRgb() { return null; },
        frame(e, [x, y, w, h], exam) {
            const r = e.r;
            r.rect(x, y, w, h, [6 / 255, 6 / 255, 7 / 255, e.options.effects ? LINES_WELL_ALPHA : 0.94]); // the lines show faintly through
            r.shape(x, y, w, h, { radius: 0, stroke: exam ? goldAlpha(0.6 + 0.35 * e.pulse) : LINES_RULE, lineWidth: 1 });
            const rows = e.boardH / CELL;
            for (let c = 1; c < BOARD_W / CELL; c++) {
                for (let row = 1; row < rows; row++) r.rect(BOARD_X + c * CELL - 0.5, e.boardY + row * CELL - 0.5, 1, 1, "rgba(242,242,242,0.16)");
            }
        },
        panel(e, x, y, w, h) {
            e.r.rect(x, y, w, h, LINES_FILL);
            e.r.rect(x, y, w, 1, LINES_RULE);
        },
        label(e, s, x, y, w, size, spacing) {
            e.text(s, x, y, { size, weight: 800, color: INK, spacing });
        },
        card(e, x, y, w, h, radius, selected, accent) {
            e.r.rect(x, y, w, h, selected ? "rgba(22,22,24,0.94)" : LINES_FILL);
            // the selected card's rule along the top takes its accent colour, clear of the text on tight cards
            if (selected) e.r.rect(x, y, w, 3, accent);
            else e.r.rect(x, y, w, 1, "rgba(242,242,242,0.22)");
        },
        // seven short dashes
        stripe(e, x, y, w, h) {
            const step = w / 7;
            for (let t = 1; t <= 7; t++) e.r.rect(x + (t - 1) * step, y + h / 2 - 1, step * 0.66, 2, PIECE_COLORS[t].base);
        },
        wordmark(e, cx) {
            const size = Math.min(74, Math.floor(74 * (e.layout.view[2] - 48) / e.measureText("QUADBRICKS", 74, 200, 16)));
            e.text("QUADBRICKS", cx, 150, { size, weight: 200, align: "center", spacing: Math.round(size * 16 / 74) });
            THEMES.lines.stripe(e, cx - 150, 199, 300 + 300 / 7 * 0.34, 4);
        },
    },
};
const THEME_IDS = ["space", "gallery", "lines"]; // menu order; the first is the default

// [r, g, b] (0..1) to [h, s, l] (degrees, percent), as hslToRgb() takes them
function rgbToHsl([r, g, b]) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    if (!d) return [0, 0, l * 100];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s * 100, l * 100];
}

// Darker toward the corners
function vignette(g, x0, y0, x1, y1, alpha) {
    const r = Math.max(x1 - x0, y1 - y0);
    const vig = g.createRadialGradient(VIEW_W / 2, VIEW_H / 2, r * 0.3, VIEW_W / 2, VIEW_H / 2, r * 0.8);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, `rgba(0,0,0,${alpha})`);
    g.fillStyle = vig;
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
}
