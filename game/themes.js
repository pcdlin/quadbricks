// Backgrounds (Options → Customization → Background): the look around the blocks: the backdrop, the well's
// frame, the side panels, the menu cards and the wordmark. The block styles (tiles.js) and effects are
// chosen separately and work with every background; a theme (THEMES, below) picks one of each.
// Each background has a name and picture(g, x0, y0, x1, y1), the static backdrop picture drawn with
// canvas 2D in logical units (x0..x1, y0..y1 is the visible area, past the view when letterboxed).
// The rest is optional; without it the engine draws Gallery's look:
// - ink: [r, g, b] (0..1) that text drawn in INK's colour takes instead (any alpha)
// - ambient(e): { blobs, orbs, nebula, shade } for the backdrop pass in place of Engine.ambientShapes()
//   (see GLBackdrop.render(): nebula shapes the blobs with noise, shade hides them behind circles), and
//   update(e, dt) to move them on (runs in the menus too)
// - lines(e): the field lines the backdrop pass draws over the picture (GLBackdrop.render()), or
//   foil(e): its holographic foil
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
    // craters, smaller ones more common, placed largest first, each inside the disc and clear of the others
    const sizes = Array.from({ length: 9 }, () => 1 + Math.pow(rnd(), 2) * r * 0.22).sort((p, q) => q - p);
    const craters = [];
    for (const cr of sizes) {
        for (let tries = 0; tries < 40; tries++) {
            const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * (r - cr - 1);
            const cx = x + Math.cos(a) * d, cy = y + Math.sin(a) * d;
            if (craters.every(c => Math.hypot(cx - c.cx, cy - c.cy) > cr + c.cr + 2)) {
                craters.push({ cx, cy, cr });
                break;
            }
        }
    }
    for (const { cx, cy, cr } of craters) {
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

// Hologram: the foil's light bands (their offset at rest, and how far a degree of the field's tilt about
// the x and y axes moves them, logical units), the share of the Holo blocks' sheen hue its hue takes (so
// they turn together), how fast it turns by itself (degrees per second, with the animated backdrop), its
// extra strength on a line clear's pulse, and the rosette behind the well (centre, radius, amplitude)
const HOLOGRAM_BAND_REST = 260;
const HOLOGRAM_BAND_PER_DEG = [40, 54];
const HOLOGRAM_HUE_SHARE = 0.6;
const HOLOGRAM_DRIFT = 3;
const HOLOGRAM_SWELL = 1.2;
const HOLOGRAM_ROSETTE = [400, 370, 290, 26];
const HOLOGRAM_SPAN = 0.8; // degrees of hue per logical unit along a spectrum edge
const HOLOGRAM_FILL = "rgba(10,12,17,0.72)";
const HOLOGRAM_EDGE = "rgba(200,210,230,0.10)";
const HOLOGRAM_CHROME = "rgba(220,228,242,0.7)";
const HOLOGRAM_LABEL = "rgba(200,208,224,0.9)";
const HOLOGRAM_WELL_ALPHA = 0.74; // the well's fill (0.94 with effects off)

// Undersea: the water's hue, swinging between teal and blue with line clears (the backdrop's hue turning a
// sine), its light's extra strength on a line clear's pulse, the bubbles (how often a vent lets one go, per
// frame, and how much faster they rise on a clear's pulse), the sinking specks, and the jellyfish (frames
// between them, the first sooner, its speed up). Bubbles and the jellyfish keep to the lanes beside the
// side columns (lanes()), so none passes behind their text: a vent needs UNDERSEA_VENT_W of lane, a
// jellyfish UNDERSEA_JELLY_W; where the window leaves less, there are none
const UNDERSEA_HUE = 192, UNDERSEA_HUE_SWING = 14;
const UNDERSEA_SWELL = 1.2;
const UNDERSEA_BUBBLE_RATE = 0.04;
const UNDERSEA_RUSH = 3;
const UNDERSEA_SNOW = 60;
const UNDERSEA_JELLY_EVERY = [3600, 7200], UNDERSEA_JELLY_FIRST = [600, 1500];
const UNDERSEA_JELLY_SPEED = 0.35;
const UNDERSEA_VENT_W = 22, UNDERSEA_JELLY_W = 84;
const UNDERSEA_LANE_GAP = 8; // kept clear beside the columns
// the bubbles' colour and strength
const UNDERSEA_BUBBLE_COLOR = "rgb(190,240,255)", UNDERSEA_BUBBLE_ALPHA = 0.85;
const UNDERSEA_LABEL = "rgba(127,224,240,0.9)";
const UNDERSEA_EDGE = "rgba(120,215,235,0.2)";
const UNDERSEA_WELL_ALPHA = 0.74; // the well's fill (0.94 with effects off)

const BACKGROUNDS = {
    // Night gallery: deep gradient, soft spotlight, receding floor grid
    gallery: {
        name: "Night Gallery", // id "gallery", as saved
        picture(g, x0, y0, x1, y1) {
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
        picture(g, x0, y0, x1, y1) {
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
        // the debug menu's: the bright star, or a shooting star, from the next update
        showSun() {
            this.sun = null;
            this.sunIn = 0;
        },
        showMeteor() {
            this.meteor = null;
            this.meteorIn = 0;
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
            for (let c = 1; c < WIDTH; c++) {
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
        name: "Field Lines",
        ink: [242 / 255, 242 / 255, 242 / 255],
        hueStep: LINES_HUE_STEP,
        picture(g, x0, y0, x1, y1) {
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
            for (let c = 1; c < WIDTH; c++) {
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
            BACKGROUNDS.lines.stripe(e, cx - 150, 199, 300 + 300 / 7 * 0.34, 4);
        },
    },

    // Hologram: graphite under a holographic foil (GLBackdrop's FOIL_FS) whose rainbow sheen and light
    // bands follow the field's tilt as the Holo blocks' sheen does; a chrome frame with a rainbow glint,
    // smoked glass panels and cards with a spectrum along their top
    hologram: {
        name: "Hologram",
        ink: [228 / 255, 233 / 255, 242 / 255],
        picture(g, x0, y0, x1, y1) {
            const sky = g.createLinearGradient(0, y0, 0, y1);
            sky.addColorStop(0, "#0f1015");
            sky.addColorStop(1, "#090a0f");
            g.fillStyle = sky;
            g.fillRect(x0, y0, x1 - x0, y1 - y0);
            vignette(g, x0, y0, x1, y1, 0.55);
        },
        ambient() { return { blobs: [], orbs: [] }; },
        // The foil's hue and its light bands' place now: they follow the tilt the Holo sheen does
        // (Engine.updateSheen()); with the animated backdrop line clears turn the hue with the backdrop's,
        // and the hue drifts and the bands sway by themselves
        state(e) {
            const moving = e.options.effects && e.options.backdrop;
            const t = moving ? e.clock / 60 : 0, sh = e.sheen || { hue: 0, rx: 0, ry: 0 };
            const st = this.st || (this.st = {});
            st.time = t;
            st.hue = sh.hue * HOLOGRAM_HUE_SHARE + (moving ? e.hue - HUE_DEFAULT : 0) + HOLOGRAM_DRIFT * t;
            st.band = HOLOGRAM_BAND_REST + sh.rx * HOLOGRAM_BAND_PER_DEG[0] + sh.ry * HOLOGRAM_BAND_PER_DEG[1] + 60 * Math.sin(t * 0.15);
            return st;
        },
        foil(e) {
            const st = this.state(e);
            return { hue: st.hue, band: st.band, time: st.time, strength: e.softEffectScale() * (1 + HOLOGRAM_SWELL * e.pulse), rosette: HOLOGRAM_ROSETTE };
        },
        glowRgb() { return hslToRgb(220, 40, 78); },
        frame(e, [x, y, w, h], exam) {
            const r = e.r;
            r.rect(x, y, w, h, [6 / 255, 7 / 255, 10 / 255, e.options.effects ? HOLOGRAM_WELL_ALPHA : 0.94]); // the foil shows through
            for (let c = 1; c < WIDTH; c++) r.rect(BOARD_X + c * CELL - 0.5, e.boardY, 1, e.boardH, "rgba(210,220,240,0.05)");
            r.shape(x, y, w, h, { radius: 0, stroke: exam ? goldAlpha(0.6 + 0.35 * e.pulse) : HOLOGRAM_CHROME, lineWidth: 1.2 });
            if (exam) return;
            // a rainbow glint on the top and bottom edges, sliding with the light bands
            const k = clamp((this.state(e).band - HOLOGRAM_BAND_REST) / 520 + 0.5, 0, 1), gw = 110;
            this.glint(e, x + k * (w - gw), y - 1, gw, 2);
            this.glint(e, x + (1 - k) * (w - gw), y + h - 1, gw, 2);
        },
        panel(e, x, y, w, h) {
            e.r.rect(x, y, w, h, HOLOGRAM_FILL);
            e.r.shape(x, y, w, h, { radius: 0, stroke: HOLOGRAM_EDGE, lineWidth: 1 });
            this.spectrum(e, x, y, w, 1.5, this.state(e).hue + x * 0.3, 0.85); // panels side by side differ
        },
        label(e, s, x, y, w, size, spacing) {
            e.text(s, x, y, { size, weight: 700, color: HOLOGRAM_LABEL, spacing });
        },
        card(e, x, y, w, h, radius, selected, accent) {
            e.r.shape(x, y, w, h, {
                radius: 2, lineWidth: 1,
                fill: selected ? "rgba(28,32,42,0.82)" : "rgba(10,12,17,0.66)",
                stroke: selected ? "rgba(220,228,245,0.4)" : HOLOGRAM_EDGE,
            });
            if (selected) {
                this.spectrum(e, x, y, w, 2, this.state(e).hue, 0.9);
                e.r.rect(x + 1, y + 6, 3, h - 12, accent); // down the left edge, clear of the text on tight cards
            }
        },
        // a spectrum in place of the seven colours
        stripe(e, x, y, w, h) {
            this.spectrum(e, x, y, w, h, this.state(e).hue, 0.9);
        },
        // thin chrome lettering over a spectrum line with a glint sliding along it
        wordmark(e, cx) {
            const size = Math.min(74, Math.floor(74 * (e.layout.view[2] - 48) / e.measureText("QUADBRICKS", 74, 300, 18)));
            e.text("QUADBRICKS", cx, 150, { size, weight: 300, align: "center", spacing: Math.round(size * 18 / 74) });
            const st = this.state(e), k = clamp((st.band - HOLOGRAM_BAND_REST) / 520 + 0.5, 0, 1);
            this.spectrum(e, cx - 150, 199, 300, 2, st.hue, 0.9);
            this.glint(e, cx - 150 + k * 220, 198, 80, 4);
        },
        // A spectrum from hue along a strip, HOLOGRAM_SPAN degrees per logical unit (at most a turn)
        spectrum(e, x, y, w, h, hue, alpha) {
            const r = e.r;
            r.save();
            r.globalAlpha *= alpha;
            r.image(this.spectra(r)[0], x, y, w, h, (hue % 360 + 360) % 360, 0, Math.min(360, w * HOLOGRAM_SPAN), 1);
            r.restore();
        },
        // A short rainbow glint, fading out at both ends
        glint(e, x, y, w, h) {
            e.r.image(this.spectra(e.r)[1], x, y, w, h);
        },
        // Their textures, rendered once: two turns of hue (so any turn can be cut from them), and the glint
        spectra(r) {
            if (this.tex) return this.tex;
            const strip = (w, color) => {
                const c = document.createElement("canvas");
                c.width = w;
                c.height = 1;
                const g = c.getContext("2d");
                for (let i = 0; i < w; i++) {
                    g.fillStyle = color(i);
                    g.fillRect(i, 0, 1, 1);
                }
                return r.texture(c);
            };
            this.tex = [
                strip(720, i => `hsl(${i % 360},85%,68%)`),
                strip(128, i => `hsla(${i / 128 * 300},90%,78%,${Math.sin(Math.PI * (i + 0.5) / 128)})`),
            ];
            return this.tex;
        },
    },

    // Undersea: water from a lit teal under the surface to the dark floor, light shafts and caustics
    // (GLBackdrop's WATER_FS), bubbles rising from vents, specks sinking and now and then a jellyfish;
    // an aquarium-glass well, sea glass panels and cards
    undersea: {
        name: "Undersea",
        ink: [225 / 255, 242 / 255, 250 / 255],
        picture(g, x0, y0, x1, y1) {
            const sea = g.createLinearGradient(0, 0, 0, VIEW_H);
            sea.addColorStop(0, "#0b5872");
            sea.addColorStop(0.18, "#073b58");
            sea.addColorStop(0.55, "#04203a");
            sea.addColorStop(1, "#020a16");
            g.fillStyle = sea;
            g.fillRect(x0, y0, x1 - x0, y1 - y0);
            const sun = g.createRadialGradient(430, -60, 10, 430, -60, 420);
            sun.addColorStop(0, "rgba(170,240,255,0.45)");
            sun.addColorStop(0.4, "rgba(90,200,230,0.12)");
            sun.addColorStop(1, "rgba(0,0,0,0)");
            g.fillStyle = sun;
            g.fillRect(x0, y0, x1 - x0, y1 - y0);
            const sand = g.createLinearGradient(0, VIEW_H - 120, 0, VIEW_H);
            sand.addColorStop(0, "rgba(60,110,120,0)");
            sand.addColorStop(1, "rgba(70,120,125,0.18)");
            g.fillStyle = sand;
            g.fillRect(x0, VIEW_H - 120, x1 - x0, y1 - VIEW_H + 120);
            // rocks, the far ones lighter, down to the bottom of what is in view
            const rocks = (pts, fill) => {
                g.fillStyle = fill;
                g.beginPath();
                g.moveTo(pts[0][0], y1);
                for (const [x, y] of pts) g.lineTo(x, y);
                g.lineTo(pts[pts.length - 1][0], y1);
                g.fill();
            };
            rocks([[x0 - 10, 610], [30, 590], [70, 600], [120, 570], [170, 600], [215, 640], [240, 700], [250, VIEW_H]], "#06192a");
            rocks([[550, VIEW_H], [560, 700], [590, 650], [640, 610], [690, 620], [730, 585], [780, 600], [x1 + 10, 580]], "#06192a");
            rocks([[x0 - 10, 660], [50, 640], [100, 655], [150, 680], [190, VIEW_H]], "#030d18");
            rocks([[600, VIEW_H], [650, 680], [710, 660], [770, 670], [x1 + 10, 650]], "#030d18");
            // kelp, and a coral fan each side
            g.strokeStyle = g.fillStyle = "#04192a";
            g.lineCap = "round";
            for (const [x, h, lean, w] of [[28, 300, 0.08, 4], [52, 230, -0.05, 3], [205, 170, 0.1, 3], [742, 330, -0.1, 4], [768, 250, 0.04, 3], [612, 190, -0.06, 3]]) {
                const at = (k) => [x + Math.sin(k / 12 * 5 + x) * 9 * k / 12 + lean * k / 12 * h, VIEW_H - k / 12 * h];
                g.lineWidth = w;
                g.beginPath();
                g.moveTo(x, y1);
                for (let k = 0; k <= 12; k++) g.lineTo(...at(k));
                g.stroke();
                for (let k = 2; k < 12; k += 2) {
                    const [px, py] = at(k), side = k % 4 ? 1 : -1;
                    g.beginPath();
                    g.ellipse(px + 7 * side, py, 9, 3.5, -0.5 * side, 0, Math.PI * 2);
                    g.fill();
                }
            }
            g.strokeStyle = "rgba(20,48,66,0.9)";
            g.lineWidth = 1.4;
            const rnd = themeRandom(5);
            for (const [x, y, r, a0, a1] of [[130, 650, 70, -2.6, -1.2], [680, 640, 80, -2.0, -0.5]]) {
                for (let k = 0; k < 14; k++) {
                    const a = a0 + (a1 - a0) * k / 13, len = r * (0.7 + 0.3 * rnd());
                    g.beginPath();
                    g.moveTo(x, y);
                    g.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + 6, y + Math.sin(a) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
                    g.stroke();
                }
            }
            vignette(g, x0, y0, x1, y1, 0.5);
        },
        // The water's hue now: still with effects or the animated backdrop off
        hue(e) {
            const moving = e.options.effects && e.options.backdrop;
            return UNDERSEA_HUE + (moving ? UNDERSEA_HUE_SWING * Math.sin((e.hue - HUE_DEFAULT) * Math.PI / 180) : 0);
        },
        // bubbles rising from the vents (faster on a clear's pulse) and off the wordmark's wave, specks sinking,
        // and more rarely a jellyfish swimming up
        update(e, dt) {
            if (!this.snow) {
                this.bubbles = [];
                this.rising = [];
                this.snow = Array.from({ length: UNDERSEA_SNOW }, () => ({
                    x: Math.random() * VIEW_W, y: Math.random() * VIEW_H, r: 1.2 + Math.random() * 1.4, v: 0.05 + Math.random() * 0.12, phase: Math.random() * 6.28,
                }));
                this.jelly = null;
                this.jellyIn = UNDERSEA_JELLY_FIRST[0] + Math.random() * (UNDERSEA_JELLY_FIRST[1] - UNDERSEA_JELLY_FIRST[0]);
            }
            const rush = 1 + UNDERSEA_RUSH * e.pulse, lanes = this.lanes(e), floor = Math.min(VIEW_H, lanes.bottom) - 8;
            for (const [l0, l1] of lanes) {
                const vents = l1 - l0 >= 3 * UNDERSEA_VENT_W ? 2 : l1 - l0 >= UNDERSEA_VENT_W ? 1 : 0; // two in a wide lane
                for (let n = 0; n < vents; n++) {
                    if (Math.random() >= UNDERSEA_BUBBLE_RATE * rush * dt) continue;
                    const x = l0 + (l1 - l0) * (n + 0.5) / vents;
                    this.bubbles.push({ x: x + (Math.random() - 0.5) * 6, y: floor + 10 * n, r: 1.5 + Math.random() * 3.5, v: 0.6 + Math.random() * 0.5, phase: Math.random() * 6.28 });
                }
            }
            for (const b of this.bubbles) {
                b.y -= b.v * (0.8 + b.r / 6) * rush * dt;
                b.x += Math.sin(e.clock / 14 + b.phase) * 0.25 * dt;
            }
            this.bubbles = this.bubbles.filter(b => b.y - b.r > lanes.top); // they burst at the surface
            if (Math.random() < 0.08 * dt) this.rising.push({ color: 1 + Math.floor(Math.random() * 7), dx: 0, dy: -6, life: 40 });
            for (const b of this.rising) { // gone before they reach the letters
                b.dy -= 0.2 * dt;
                b.life -= dt;
                b.dx = Math.sin(b.life / 8) * 1.5;
            }
            this.rising = this.rising.filter(b => b.life > 0);
            for (const s of this.snow) {
                s.y += s.v * dt;
                s.x += Math.sin(e.clock / 90 + s.phase) * 0.05 * dt;
                if (s.y > VIEW_H + 4) { s.y = -4; s.x = Math.random() * VIEW_W; }
            }
            const j = this.jelly;
            if (j) {
                const beat = Math.sin(e.clock / 22 + j.phase);
                j.y -= UNDERSEA_JELLY_SPEED * (0.4 + 0.6 * (0.5 + 0.5 * beat) * 2) * dt; // a push with each beat
                if (this.jellyFade(lanes) <= 0) this.jelly = null;
            } else if ((this.jellyIn -= dt) <= 0) {
                const wide = lanes.filter(([l0, l1]) => l1 - l0 >= UNDERSEA_JELLY_W);
                this.jellyIn = UNDERSEA_JELLY_EVERY[0] + Math.random() * (UNDERSEA_JELLY_EVERY[1] - UNDERSEA_JELLY_EVERY[0]);
                if (wide.length) { // else none this time
                    const [l0, l1] = wide[Math.floor(Math.random() * wide.length)];
                    this.jelly = { x: (l0 + l1) / 2, y: lanes.bottom + 100, phase: Math.random() * 6.28 };
                }
            }
        },
        // the debug menu's: a jellyfish from the next update (false when the window leaves no lane wide enough)
        showJelly(e) {
            if (!this.lanes(e).some(([l0, l1]) => l1 - l0 >= UNDERSEA_JELLY_W)) return false;
            this.jelly = null;
            this.jellyIn = 0;
            return true;
        },
        // The free room beside the side columns, in the backdrop's coordinates: [[x0, x1]], left and right (empty
        // ones left out), with the surface (under the version and FPS in the view's top corners) and the bottom
        // of what is in view. The columns are the layout's (both players' groups in a match), wherever the
        // Options scale draws them; in the menus the wordmark, as wide as the view but 24 each side, too
        lanes(e) {
            const L = e.layout, gx = L.duo ? L.duo.gx : [0, 0], [vx, vy, vw] = L.view;
            const toBg = (v) => (e.offX + v * e.pixelScale - e.bgOffX) / e.bgScale;
            let left = toBg(L.leftX + gx[0]), right = toBg(L.rightX + L.sideW + gx[1]);
            if (e.GAMESTATE !== STATE_GAME) {
                left = Math.min(left, vx + 24);
                right = Math.max(right, vx + vw - 24);
            }
            const x0 = -e.bgOffX / e.bgScale, x1 = (e.canvas.width - e.bgOffX) / e.bgScale;
            const lanes = [[x0, left - UNDERSEA_LANE_GAP], [right + UNDERSEA_LANE_GAP, x1]].filter(([a, b]) => b > a);
            lanes.top = vy + 26;
            lanes.bottom = (e.canvas.height - e.bgOffY) / e.bgScale;
            return lanes;
        },
        // The jellyfish fades out as it nears the surface (so it never passes the version or FPS)
        jellyFade(lanes) {
            return clamp((this.jelly.y - lanes.top - 30) / 60, 0, 1);
        },
        // Whether something half wide at x is inside a lane (after a resize, what is no longer in one isn't drawn)
        inLane(lanes, x, half) {
            return lanes.some(([l0, l1]) => x - half >= l0 && x + half <= l1);
        },
        // the specks and the jellyfish's glow, as lights
        ambient(e) {
            const orbs = [], t = e.clock / 60, h = this.hue(e);
            if (!this.snow) return { blobs: [], orbs };
            for (const s of this.snow) orbs.push({ x: s.x, y: s.y, r: s.r, h, s: 40, l: 88, a: 0.28 + 0.12 * Math.sin(t + s.phase) });
            const j = this.jelly;
            const lanes = this.lanes(e);
            if (j && this.inLane(lanes, j.x, UNDERSEA_JELLY_W / 2)) {
                const glow = (1 + 0.25 * Math.sin(e.clock / 22 + j.phase)) * this.jellyFade(lanes);
                orbs.push({ x: this.jellyX(e), y: j.y, r: UNDERSEA_JELLY_W * 0.7, h: 318, s: 90, l: 70, a: 0.14 * glow }, { x: this.jellyX(e), y: j.y - 4, r: 30, h: 318, s: 80, l: 80, a: 0.14 * glow });
            }
            return { blobs: [], orbs };
        },
        jellyX(e) { return this.jelly.x + 6 * Math.sin(e.clock / 140 + this.jelly.phase); },
        water(e) {
            const moving = e.options.effects && e.options.backdrop;
            return {
                rgb: hslToRgb(this.hue(e) - 5, 75, 72),
                strength: e.softEffectScale() * (1 + UNDERSEA_SWELL * e.pulse),
                time: moving ? e.clock / 60 : 0,
            };
        },
        // Drawn over the backdrop pass in its coordinates: the bubbles, and the jellyfish's bell and tentacles
        scenery(e) {
            const r = e.r;
            if (!this.snow) return;
            const lanes = this.lanes(e);
            r.save();
            r.blendMode = "add";
            for (const b of this.bubbles) {
                if (this.inLane(lanes, b.x, b.r * BUBBLE_REACH)) drawBubble(r, b.x, b.y, b.r, UNDERSEA_BUBBLE_COLOR, UNDERSEA_BUBBLE_ALPHA);
            }
            const j = this.jelly;
            if (j && this.inLane(lanes, j.x, UNDERSEA_JELLY_W / 2)) {
                const beat = Math.sin(e.clock / 22 + j.phase), x = this.jellyX(e);
                const bw = 26 + 4 * beat, bh = 20 - 3 * beat;
                r.globalAlpha *= this.jellyFade(lanes);
                r.image(this.bellTexture(r), x - bw, j.y - bh, bw * 2, bh + 4);
                for (let k = 0; k < 7; k++) {
                    const tx = x - bw * 0.8 + k * bw * 1.6 / 6, a = 0.34 - (k % 2) * 0.12;
                    for (let n = 1; n <= 14; n++) {
                        const dx = Math.sin(e.clock / 18 + n * 0.5 + k) * 3 * n / 6, dy = n * 6 + beat * n * 0.3;
                        r.shape(tx + dx - 1, j.y + dy - 1, 2, 2, { radius: 1, fill: [1, 170 / 255, 235 / 255, a * (1 - n / 16)] });
                    }
                }
            }
            r.restore();
        },
        // The jellyfish's bell, rendered once per resolution: a glowing dome with a rim and frills inside
        bellTexture(r) {
            const res = r.s;
            if (this.bell && this.bell.res === res) return this.bell.tex;
            if (this.bell) r.releaseTexture(this.bell.tex);
            const w = 60, h = 26;
            const c = document.createElement("canvas");
            c.width = Math.ceil(w * res);
            c.height = Math.ceil(h * res);
            const g = c.getContext("2d");
            g.scale(res, res);
            const cx = w / 2, cy = h - 4, rx = w / 2 - 2, ry = h - 6;
            const body = g.createRadialGradient(cx, cy - ry * 0.5, 0, cx, cy - ry * 0.5, rx);
            body.addColorStop(0, "rgba(255,200,245,0.5)");
            body.addColorStop(1, "rgba(255,120,220,0.18)");
            g.fillStyle = body;
            g.beginPath();
            g.ellipse(cx, cy, rx, ry, 0, Math.PI, 0);
            g.fill();
            g.strokeStyle = "rgba(255,190,240,0.6)";
            g.lineWidth = 1.2;
            g.stroke();
            g.strokeStyle = "rgba(255,170,235,0.35)";
            g.lineWidth = 1;
            for (let k = -2; k <= 2; k++) {
                g.beginPath();
                g.moveTo(cx + k * rx * 0.3, cy);
                g.quadraticCurveTo(cx + k * rx * 0.2, cy - ry * 0.5, cx + k * rx * 0.08, cy - ry * 0.85);
                g.stroke();
            }
            this.bell = { tex: r.texture(c), res };
            return this.bell.tex;
        },
        glowRgb(e) { return hslToRgb(this.hue(e), 80, 60); },
        // aquarium glass: a deep translucent fill the water's light shows through, an aqua edge with a light
        // glint wandering along the top
        frame(e, [x, y, w, h], exam) {
            const r = e.r;
            r.shape(x, y, w, h, { radius: 8, fill: [2 / 255, 16 / 255, 30 / 255, e.options.effects ? UNDERSEA_WELL_ALPHA : 0.94] });
            for (let c = 1; c < WIDTH; c++) r.rect(BOARD_X + c * CELL - 0.5, e.boardY, 1, e.boardH, "rgba(140,220,240,0.05)");
            r.shape(x, y, w, h, { radius: 8, stroke: exam ? goldAlpha(0.6 + 0.35 * e.pulse) : [130 / 255, 225 / 255, 240 / 255, 0.5 + 0.35 * e.pulse], lineWidth: 1.2 });
            if (exam) return;
            const gw = 90, k = 0.5 + 0.5 * Math.sin(e.clock / 200);
            r.image(this.glintTexture(r), x + 12 + k * (w - 24 - gw), y - 1, gw, 2);
        },
        // sea glass: translucent teal, lighter at the top, with a light rim along it
        panel(e, x, y, w, h) {
            this.glass(e, x, y, w, h, 10, false);
        },
        glass(e, x, y, w, h, radius, selected) {
            const r = e.r;
            if (selected) { // a soft aqua glow round it
                r.shape(x - 3, y - 3, w + 6, h + 6, { radius: radius + 3, stroke: "rgba(110,230,245,0.1)", lineWidth: 4 });
                r.shape(x - 1.5, y - 1.5, w + 3, h + 3, { radius: radius + 1.5, stroke: "rgba(110,230,245,0.18)", lineWidth: 2 });
            }
            r.shape(x, y, w, h, {
                radius, lineWidth: 1, fillY: [y, y + h],
                fill: selected ? ["rgba(26,96,118,0.8)", "rgba(14,64,84,0.8)"] : ["rgba(10,48,68,0.64)", "rgba(4,26,42,0.62)"],
                stroke: selected ? "rgba(150,240,250,0.7)" : UNDERSEA_EDGE,
            });
            const rim = Math.min(14, h / 2);
            r.shape(x + 1, y + 1, w - 2, rim, {
                radius: [radius - 1, radius - 1, 0, 0], fillY: [y + 1, y + 1 + rim],
                fill: [selected ? "rgba(190,250,255,0.2)" : "rgba(170,235,250,0.1)", "rgba(170,235,250,0)"],
            });
        },
        label(e, s, x, y, w, size, spacing) {
            e.text(s, x, y, { size, weight: 700, color: UNDERSEA_LABEL, spacing });
        },
        card(e, x, y, w, h, radius, selected, accent) {
            this.glass(e, x, y, w, h, radius, selected);
            if (selected) e.r.shape(x + 2, y + 8, 3, h - 16, { radius: 1.5, fill: accent }); // clear of the text on tight cards
        },
        // the seven colours as bubbles on a wave
        stripe(e, x, y, w, h) {
            const r = e.r, wave = (k) => y + h / 2 + Math.sin(k * 12 + e.clock / 30) * Math.max(1.5, h * 0.75);
            for (let i = 0; i <= w; i += 1.5) r.rect(x + i - 0.6, wave(i / w) - 0.6, 1.2, 1.2, "rgba(140,225,240,0.45)");
            const d = h + 5;
            for (let t = 1; t <= 7; t++) {
                const k = (t - 0.5) / 7, px = x + k * w, py = wave(k);
                r.shape(px - d / 2, py - d / 2, d, d, { radius: d / 2, fill: PIECE_COLORS[t].base });
                r.shape(px - d * 0.32 - d * 0.12, py - d * 0.32 - d * 0.12, d * 0.24, d * 0.24, { radius: d * 0.12, fill: "rgba(255,255,255,0.6)" });
            }
        },
        // rounded lettering over the wave, small bubbles in the piece colours rising off it
        wordmark(e, cx) {
            const size = Math.min(70, Math.floor(70 * (e.layout.view[2] - 48) / e.measureText("QUADBRICKS", 70, 600, 16)));
            e.text("QUADBRICKS", cx, 150, { size, weight: 600, align: "center", spacing: Math.round(size * 16 / 70) });
            const x = cx - 150, y = 196, w = 300;
            this.stripe(e, x, y, w, 4);
            if (!this.rising || !e.options.effects || !e.options.backdrop) return;
            const r = e.r;
            r.save();
            r.blendMode = "add";
            for (const b of this.rising) {
                const k = (b.color - 0.5) / 7;
                drawBubble(r, x + k * w + b.dx, y + b.dy, 2.2, PIECE_COLORS[b.color].light, UNDERSEA_BUBBLE_ALPHA * Math.min(1, b.life / 25));
            }
            r.restore();
        },
        // A short glint, fading out at both ends, rendered once
        glintTexture(r) {
            if (this.glint) return this.glint;
            const c = document.createElement("canvas");
            c.width = 128;
            c.height = 1;
            const g = c.getContext("2d");
            for (let i = 0; i < 128; i++) {
                g.fillStyle = `rgba(220,255,255,${0.9 * Math.sin(Math.PI * (i + 0.5) / 128)})`;
                g.fillRect(i, 0, 1, 1);
            }
            this.glint = r.texture(c);
            return this.glint;
        },
    },
};
const BACKGROUND_IDS = ["space", "gallery", "lines", "hologram", "undersea"]; // menu order

// Themes (Options → Customization → Theme): a background with the block style, confetti, clear burst and drop
// trail that go with it, which those settings take while they are on Follow theme (Options.look())
const THEMES = {
    space: { name: "Deep Space", background: "space", tileset: "flat", confetti: "sparks", rings: "flare", trail: "streak" },
    gallery: { name: "Night Gallery", background: "gallery", tileset: "neon", confetti: "sparks", rings: "rings", trail: "neon" },
    lines: { name: "Field Lines", background: "lines", tileset: "chalk", confetti: "paper", rings: "flare", trail: "chalk" },
    hologram: { name: "Hologram", background: "hologram", tileset: "holo", confetti: "stars", rings: "ripple", trail: "prism" },
    undersea: { name: "Undersea", background: "undersea", tileset: "jelly", confetti: "bubbles", rings: "ripple", trail: "water" },
};
const THEME_IDS = ["space", "gallery", "lines", "hologram", "undersea"]; // menu order; the first is the default

// [r, g, b] (0..1) to [h, s, l] (degrees, percent), as hslToRgb() takes them
function rgbToHsl([r, g, b]) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    if (!d) return [0, 0, l * 100];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s * 100, l * 100];
}

// A soft bubble (Undersea's, and the Water drop trail's) of radius rad in a colour (CSS), its sprite reaching
// BUBBLE_REACH times the radius
const BUBBLE_REACH = 2.2;
function drawBubble(r, x, y, rad, color, alpha) {
    const s = rad * BUBBLE_REACH;
    r.save();
    r.globalAlpha *= alpha;
    r.image(bubbleSprite(r, color), x - s, y - s, s * 2, s * 2);
    r.restore();
}

// Its sprite, rendered once per colour: a blurred rim fading out on both sides, a faint inside and a soft
// highlight at its top left. The rim sits at 1 / BUBBLE_REACH of the sprite's radius
const BUBBLE_SPRITES = new Map();
function bubbleSprite(r, color) {
    let tex = BUBBLE_SPRITES.get(color);
    if (tex) return tex;
    const n = 48, c = n / 2, [cr, cg, cb] = parseColor(color).map(v => Math.round(v * 255));
    const rgba = (a) => `rgba(${cr},${cg},${cb},${a})`;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = n;
    const g = canvas.getContext("2d");
    const rim = 1 / BUBBLE_REACH;
    const body = g.createRadialGradient(c, c, 0, c, c, c);
    body.addColorStop(0, rgba(0.08));
    body.addColorStop(rim * 0.45, rgba(0.12));
    body.addColorStop(rim, rgba(0.45));
    body.addColorStop(Math.min(1, rim * 1.5), rgba(0.12));
    body.addColorStop(1, rgba(0));
    g.fillStyle = body;
    g.fillRect(0, 0, n, n);
    const hx = c - c * rim * 0.38, hy = c - c * rim * 0.38, hr = c * rim * 0.7;
    const hi = g.createRadialGradient(hx, hy, 0, hx, hy, hr);
    hi.addColorStop(0, "rgba(255,255,255,0.35)");
    hi.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = hi;
    g.fillRect(0, 0, n, n);
    tex = r.texture(canvas);
    BUBBLE_SPRITES.set(color, tex);
    return tex;
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
