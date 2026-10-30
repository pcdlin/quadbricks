// Backgrounds (Options → Customization → Background): the look around the blocks: the backdrop, the well's
// frame, the side panels, the menu cards and the wordmark. The block styles (tiles.js) and effects are
// chosen separately and work with every background; a theme (THEMES, below) picks one of each.
// Each background has a name and picture(g, x0, y0, x1, y1), the static backdrop picture drawn with
// canvas 2D in logical units (x0..x1, y0..y1 is the visible area, past the view when letterboxed).
// The rest is optional; without it the engine draws Gallery's look:
// - ink: [r, g, b] (0..1) that text drawn in INK's colour takes instead (any alpha)
// - splitColors: the medals' and section times' colours in place of the engine's SPLIT_COLORS (made for dark backgrounds)
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
// extra strength on a line clear's pulse, and the foil's facets (the centre they fade out from, a facet's
// width, the distance they start fading at)
const HOLOGRAM_BAND_REST = 260;
const HOLOGRAM_BAND_PER_DEG = [40, 54];
const HOLOGRAM_HUE_SHARE = 0.6;
const HOLOGRAM_DRIFT = 3;
const HOLOGRAM_SWELL = 1.2;
const HOLOGRAM_FACETS = [400, 370, 22, 330];
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

// Eclipse: a near-black view with light rays in fog fanning out from a lamp behind the well (the
// backdrop's BEAMS_FS, the hook beams()), from behind the wordmark in menus
const ECLIPSE_RGB = [0.62, 0.6, 0.9]; // the light's colour
const ECLIPSE_STRENGTH = 0.26; // the rays at Normal effects
const ECLIPSE_SWELL = 1.4; // extra on a line clear's pulse
const ECLIPSE_MARK = [400, 150, 215, 28, 24]; // the wordmark's occluder: centre, half width and height, corners
const ECLIPSE_WELL_ALPHA = 0.9; // the well's fill (0.96 with effects off)
const ECLIPSE_POOL = 0.14; // the lamp seen through the well
const ECLIPSE_EDGE = "rgba(160,150,235,0.16)";
const ECLIPSE_LABEL = "rgba(190,184,240,0.85)";

// Glacier: a glacier lake by day, painted soft like a watercolour (after the user's reference picture). The picture has a
// pale sky, hazy snowy mountains to the left, a tall glacier of blue ice to the right and the calm lake before them
// mirroring them, with snow-capped floes; the backdrop's GLACIER_FS (the hook glacier()) adds clouds drifting across the
// sky and light glinting on the water. Its text is dark (ink), its well and panels the deep blue of the lake,
// its cards frosted white
const GLACIER_LAKE = 560; // the shore, where the lake begins
// the left massif's skyline ([x, y], logical, a little uneven between them: glacierMassif()); the glacier's wall to the right
// (where it rises from the water, and its top), and its pinnacles before it ([x, y] of the tip, how far its foot reaches to
// the left and the right of it, logical), back to front
const GLACIER_MASSIF = [[-260, 160], [0, 130], [60, 105], [115, 70], [165, 98], [215, 128], [265, 138], [315, 175], [365, 230],
    [415, 300], [465, 370], [515, 440], [560, 500], [610, 545], [660, 562]];
const GLACIER_WALL = [745, 30];
const GLACIER_PEAKS = [[790, 20, 70, 90], [700, 95, 75, 85], [622, 245, 65, 70], [562, 370, 52, 55], [518, 462, 34, 38]];
const GLACIER_STRENGTH = 1; // the clouds and glints at Normal effects
const GLACIER_SWELL = 0.8; // the glints' extra on a line clear's pulse
const GLACIER_WELL_ALPHA = 0.9; // the well's fill (0.96 with effects off)
const GLACIER_INK = [20 / 255, 52 / 255, 82 / 255]; // its text, dark on the pale scene
const GLACIER_LABEL = "rgba(36,92,136,0.9)";
const GLACIER_RULE = "rgba(36,92,136,0.22)";
const GLACIER_EDGE = "rgba(255,255,255,0.55)"; // a panel's rim
const GLACIER_CARD_EDGE = "rgba(60,130,180,0.35)";
const GLACIER_LIT = "rgba(40,140,210,0.85)"; // a selected card's rim and bar
// The medals' and section times' colours (the engine's SPLIT_COLORS are for dark backgrounds): dark enough to read on the
// pale scene, silver a neutral graphite so it stands apart from the faint ink of no tier
const GLACIER_SPLITS = {
    tiers: ["rgba(20,52,82,0.42)", "#9c5426", "#5c636e", "#9a6c00"],
    ahead: "#1b8049", behind: "#bd3a2a",
    cool: "#1d78b8", regret: "#c8382a",
    faint: "rgba(20,52,82,0.2)",
    chip: [20 / 255, 52 / 255, 82 / 255, 0.06],
};

// Pulse: its accent hue swings PULSE_HUE ± PULSE_HUE_SWING (cyan to violet) as the backdrop's hue turns with clears
const PULSE_HUE = 222, PULSE_HUE_SWING = 40;
const PULSE_LATTICE = 22; // logical units between the backdrop's dots
const PULSE_DOT_REST = 0.12; // their light at rest; a ripple adds up to about PULSE_RIPPLE_ALPHA
const PULSE_RIPPLE_REACH = 900, PULSE_RIPPLE_BAND = 30, PULSE_RIPPLE_ALPHA = 1.4; // a clear's ripple: how far, how wide
const PULSE_RIBBON = 0.07, PULSE_RIBBON_SWELL = 0.6; // the ribbon's lines, and their extra on a clear's pulse
const PULSE_WELL_ALPHA = 0.86; // the well's fill (0.96 with effects off)
const PULSE_FLOOR_GLOW = [180, 32], PULSE_FLOOR_ALPHA = [0.08, 0.3]; // the floor's pool of light: half its width and height; at rest, a lock's extra
const PULSE_RAIL_TOP = 18, PULSE_RAIL_SPEED = 0.08, PULSE_RAIL_LEN = 90; // the rails past the well's top; their pulse
const PULSE_SWEEP_PERIOD = 12; // seconds between the wordmark's light sweeps
const PULSE_RUNNER_SPEED = 0.12, PULSE_RUNNER_DOTS = 20; // the light round a selected card: turns a second, its length
const PULSE_POINT = "rgba(190,205,255,0.09)"; // a point at each cell corner
const PULSE_LABEL = "rgba(150,165,210,0.9)";
const PULSE_RULE = "rgba(160,180,255,0.14)";
const PULSE_EDGE = "rgba(160,180,255,0.12)";
const PULSE_MARK = "rgba(190,200,235,0.85)";
const pulseFrac = (x) => x - Math.floor(x);

// The point d along a rectangle's edge, clockwise from its top left (d wraps round)
function perimeterPoint(x, y, w, h, d) {
    d = ((d % (2 * (w + h))) + 2 * (w + h)) % (2 * (w + h));
    if (d < w) return [x + d, y];
    if ((d -= w) < h) return [x + w, y + d];
    if ((d -= h) < w) return [x + w - d, y + h];
    return [x, y + h - (d - w)];
}

function glacierMassif(x) {
    const p = GLACIER_MASSIF, i = p.findIndex(([px]) => px > x);
    const y = i < 0 ? p[p.length - 1][1] : i === 0 ? p[0][1]
        : p[i - 1][1] + (p[i][1] - p[i - 1][1]) * (x - p[i - 1][0]) / (p[i][0] - p[i - 1][0]);
    return y + 4 * Math.sin(x * 0.045) + 1.5 * Math.sin(x * 0.13 + 1);
}

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
            return { hue: st.hue, band: st.band, time: st.time, strength: e.softEffectScale() * (1 + HOLOGRAM_SWELL * e.pulse), facets: HOLOGRAM_FACETS };
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

    // Eclipse: near black, lit only by a lamp behind the well whose rays fan out past its edges through
    // drifting fog (the backdrop's BEAMS_FS); it moves with the field's tilt, as the Backlit blocks' rims
    // do. Black panels and cards with a faint rim, as if the light caught their edges.
    eclipse: {
        name: "Eclipse",
        ink: [222 / 255, 220 / 255, 240 / 255],
        picture(g, x0, y0, x1, y1) {
            g.fillStyle = "#030305";
            g.fillRect(x0, y0, x1 - x0, y1 - y0);
            vignette(g, x0, y0, x1, y1, 0.5);
        },
        ambient() { return { blobs: [], orbs: [] }; },
        // still with the animated backdrop or effects off
        beams(e) {
            const moving = e.options.effects && e.options.backdrop;
            const strength = ECLIPSE_STRENGTH * e.softEffectScale() * (1 + ECLIPSE_SWELL * e.pulse);
            let lights;
            if (e.GAMESTATE === STATE_GAME) {
                lights = e.boards().filter(view => !e.layout.mini || view === e.ownBoard).map(view => {
                    const m = view === e.ownBoard ? e.motion : e.boardMotion(view);
                    const [u, v] = this.lampAt(e, m), fs = e.flyScale(m);
                    const ox = view.gx + m.dx, oy = m.dy, cx = BOARD_X + BOARD_W / 2, cy = e.boardY + e.boardH / 2;
                    return {
                        x: ox + cx + (u - 0.5) * BOARD_W * fs, y: oy + cy + (v - 0.5) * e.boardH * fs,
                        strength: strength * m.fly.alpha, radius: 6 * fs,
                        occluder: [ox + cx, oy + cy, (BOARD_W / 2 + 8) * fs, (e.boardH / 2 + 8) * fs],
                    };
                });
            } else {
                const [x, y, hw, hh, radius] = ECLIPSE_MARK;
                lights = [{ x, y: y - 6, strength: strength * 0.8, radius, occluder: [x, y, hw, hh] }];
            }
            return { lights, rgb: ECLIPSE_RGB, time: moving ? e.clock / 60 : 0 };
        },
        // where the lamp shines through the well for the motion m, as Engine.updateSheen() places it (the
        // fly-in's turn included)
        lampAt(e, m) {
            const moves = e.options.effectScale > 0 ? 180 / Math.PI : 0, tilt = e.sheenTilt(m);
            return [LAMP_REST[0] - tilt.ry * moves * LAMP_PER_DEG[1], LAMP_REST[1] + tilt.rx * moves * LAMP_PER_DEG[0]];
        },
        glowRgb() { return null; },
        // a black well with a faint rim; the lamp a soft pool through it
        frame(e, [x, y, w, h], exam) {
            const r = e.r;
            r.shape(x, y, w, h, { radius: 4, fill: [2 / 255, 2 / 255, 4 / 255, e.options.effects ? ECLIPSE_WELL_ALPHA : 0.96] });
            if (e.lamp) {
                const px = BOARD_X + e.lamp.u * BOARD_W, py = e.boardY + e.lamp.v * e.boardH, rad = BOARD_W * 1.1;
                r.save();
                r.clip(x, y, w, h);
                r.blendMode = "add";
                r.globalAlpha *= ECLIPSE_POOL * e.softEffectScale() * (1 + 0.5 * e.pulse);
                r.image(this.poolTexture(r), px - rad, py - rad, rad * 2, rad * 2);
                r.restore();
            }
            r.shape(x, y, w, h, { radius: 4, stroke: exam ? goldAlpha(0.6 + 0.35 * e.pulse) : [170 / 255, 160 / 255, 240 / 255, 0.28 + 0.3 * e.pulse], lineWidth: 1 });
        },
        panel(e, x, y, w, h) {
            e.r.shape(x, y, w, h, { radius: 6, fill: "rgba(3,3,6,0.88)", stroke: ECLIPSE_EDGE, lineWidth: 1 });
        },
        label(e, s, x, y, w, size, spacing) {
            e.text(s, x, y, { size, weight: 700, color: ECLIPSE_LABEL, spacing });
        },
        card(e, x, y, w, h, radius, selected, accent) {
            const r = e.r;
            if (selected) r.shape(x - 2, y - 2, w + 4, h + 4, { radius: radius + 2, stroke: "rgba(170,160,240,0.12)", lineWidth: 3 });
            r.shape(x, y, w, h, {
                radius, lineWidth: 1,
                fill: selected ? "rgba(14,13,24,0.92)" : "rgba(3,3,6,0.84)",
                stroke: selected ? "rgba(190,180,250,0.55)" : ECLIPSE_EDGE,
            });
            if (selected) r.shape(x + 2, y + 8, 2, h - 16, { radius: 1, fill: accent }); // clear of the text on tight cards
        },
        // the seven colours as small backlit blocks: dark, with a coloured rim
        stripe(e, x, y, w, h) {
            const d = h + 6, gap = (w - d) / 6;
            for (let t = 1; t <= 7; t++) {
                e.r.shape(x + (t - 1) * gap, y + h / 2 - d / 2, d, d, { radius: 1.5, fill: "#060609", stroke: PIECE_COLORS[t].light, lineWidth: 1 });
            }
        },
        // a thin wordmark, the rays fanning out from behind it
        wordmark(e, cx) {
            const size = Math.min(72, Math.floor(72 * (e.layout.view[2] - 48) / e.measureText("QUADBRICKS", 72, 300, 18)));
            e.text("QUADBRICKS", cx, 150, { size, weight: 300, align: "center", spacing: Math.round(size * 18 / 72) });
            this.stripe(e, cx - 120, 205, 240, 4);
        },
        // A soft round pool of the light's colour, rendered once
        poolTexture(r) {
            if (this.pool) return this.pool;
            const c = document.createElement("canvas");
            c.width = c.height = 128;
            const g = c.getContext("2d");
            const [cr, cg, cb] = ECLIPSE_RGB.map(v => Math.round(v * 255));
            const pool = g.createRadialGradient(64, 64, 0, 64, 64, 64);
            pool.addColorStop(0, `rgba(${cr},${cg},${cb},1)`);
            pool.addColorStop(0.25, `rgba(${cr},${cg},${cb},0.35)`);
            pool.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
            g.fillStyle = pool;
            g.fillRect(0, 0, 128, 128);
            this.pool = r.texture(c);
            return this.pool;
        },
    },

    // Glacier: a glacier lake by day, soft as a watercolour. A pale sky with clouds drifting across it (the backdrop's
    // GLACIER_FS), hazy snowy mountains to the left, a glacier of tall blue ice spires to the right, the calm lake
    // mirroring them with snow-capped floes and light glinting on it. Dark text; the well and panels the lake's deep blue,
    // the cards frosted white, with rime growing in from their corners
    glacier: {
        name: "Glacier",
        ink: GLACIER_INK,
        splitColors: GLACIER_SPLITS,
        picture(g, x0, y0, x1, y1) {
            const s = g.getTransform().a; // device pixels per unit, for the soft layers' blur
            const sky = g.createLinearGradient(0, y0, 0, GLACIER_LAKE);
            sky.addColorStop(0, "#d4e9f3");
            sky.addColorStop(0.55, "#eaf5f9");
            sky.addColorStop(1, "#f8fbfb");
            g.fillStyle = sky;
            g.fillRect(x0, y0, x1 - x0, GLACIER_LAKE - y0 + 1);
            // what the lake mirrors is painted on its own layer
            const layer = document.createElement("canvas");
            layer.width = g.canvas.width;
            layer.height = g.canvas.height;
            const a = layer.getContext("2d");
            a.setTransform(g.getTransform());
            const rnd = themeRandom(11);
            const range = (fill, from, to, step, y) => {
                a.fillStyle = fill;
                a.beginPath();
                a.moveTo(from, GLACIER_LAKE + 2);
                for (let x = from; x <= to; x += step) a.lineTo(x, y(x));
                a.lineTo(to, GLACIER_LAKE + 2);
                a.fill();
            };
            // far peaks along the horizon, faint in the haze
            a.filter = `blur(${2 * s}px)`;
            range("#d0e4ee", x0 - 10, x1 + 10, 4, x => 505 - 34 * Math.pow(1 - Math.abs(Math.sin(x * 0.009 + 1)), 1.5) - 16 * Math.pow(1 - Math.abs(Math.sin(x * 0.023)), 1.5));
            // the massif: pale snow, the faces turned from the light (to the right) in blue-grey washes down from the crest,
            // gullies running down them and lit snow on the faces turned to the light
            a.filter = `blur(${0.7 * s}px)`;
            range("#dde9f0", x0 - 10, 700, 3, glacierMassif);
            // its shade by the way the slope faces, smoothed over 30 units so the washes are broad, painted soft
            a.filter = `blur(${2.5 * s}px)`;
            const shadeAt = x => {
                let sum = 0;
                for (let k = -15; k <= 15; k += 3) sum += (glacierMassif(x + k + 3) - glacierMassif(x + k - 3)) / 6;
                return clamp(0.45 + sum / 11 * 1.2, 0.08, 1);
            };
            for (let x = x0; x <= 680; x += 1.5) {
                const y = glacierMassif(x), shade = shadeAt(x), d = 90 + 190 * shade * (0.75 + 0.25 * Math.sin(x * 0.021));
                const wash = a.createLinearGradient(0, y, 0, y + d);
                wash.addColorStop(0, `rgba(122,160,188,${0.75 * shade})`);
                wash.addColorStop(0.5, `rgba(140,176,200,${0.4 * shade})`);
                wash.addColorStop(1, "rgba(140,176,200,0)");
                a.fillStyle = wash;
                a.fillRect(x, y, 1.6, d);
                if (shade < 0.4) { // a face turned to the light: snow lit white down from the crest
                    const lit = a.createLinearGradient(0, y, 0, y + 60);
                    lit.addColorStop(0, `rgba(255,255,255,${0.9 - shade})`);
                    lit.addColorStop(1, "rgba(255,255,255,0)");
                    a.fillStyle = lit;
                    a.fillRect(x, y, 1.6, 60);
                }
            }
            // haze over the mountains' feet
            a.filter = "none";
            const haze = a.createLinearGradient(0, 420, 0, GLACIER_LAKE);
            haze.addColorStop(0, "rgba(248,251,252,0)");
            haze.addColorStop(1, "rgba(248,251,252,0.6)");
            a.fillStyle = haze;
            a.fillRect(x0, 380, 720 - x0, GLACIER_LAKE - 380);
            // the foothills, a darker blue-grey band low on the left
            a.filter = `blur(${0.8 * s}px)`;
            const hill = a.createLinearGradient(0, 512, 0, GLACIER_LAKE);
            hill.addColorStop(0, "#8ba8bb");
            hill.addColorStop(1, "#7393a8");
            range(hill, x0 - 10, 480, 4, x => 524 + 8 * Math.sin(x * 0.012 + 0.5) + 4 * Math.sin(x * 0.041) + clamp((x - 240) / 240, 0, 1) * 40);
            // the glacier: a wall of blue ice to the right, its face in soft flutes, and pinnacles before it whose flanks
            // curve out to wide feet and in to rounded tips, light blue on the side turned to the light (left), deep blue on
            // the other, streaked softly down from the tip, with a faint darker rim against the sky; the nearer, lower ones
            // drawn over the ones behind
            const base = GLACIER_LAKE + 4, [wx, wy] = GLACIER_WALL, wr = Math.max(x1 + 10, 900);
            const ice = (from, to) => {
                const grad = a.createLinearGradient(from, 0, to, 0);
                grad.addColorStop(0, "#cbe9f8");
                grad.addColorStop(0.35, "#9fd4f1");
                grad.addColorStop(0.62, "#6fb2e1");
                grad.addColorStop(1, "#3f87c3");
                return grad;
            };
            const streaks = (count, from, to, top, clip) => {
                a.save();
                clip();
                a.clip();
                a.filter = `blur(${2 * s}px)`;
                for (let k = 0; k < count; k++) {
                    const x = from + (to - from) * rnd(), bend = (rnd() - 0.5) * 30;
                    a.strokeStyle = rnd() < 0.5 ? `rgba(255,255,255,${0.14 + rnd() * 0.16})` : `rgba(40,105,160,${0.1 + rnd() * 0.14})`;
                    a.lineWidth = 2 + rnd() * 5;
                    a.beginPath();
                    a.moveTo(x + bend * 0.3, top);
                    a.quadraticCurveTo(x + bend, top + (base - top) * 0.5, x + bend * 0.4, base);
                    a.stroke();
                }
                a.restore();
            };
            a.filter = `blur(${0.6 * s}px)`;
            const wall = () => {
                a.beginPath();
                a.moveTo(wx, base);
                a.bezierCurveTo(wx + 10, base - (base - wy) * 0.5, wx + 4, wy + 60, wx + 40, wy + 6);
                a.quadraticCurveTo(wx + 90, wy - 24, wr, wy - 30);
                a.lineTo(wr, base);
                a.closePath();
            };
            wall();
            a.fillStyle = ice(wx - 40, wx + 260);
            a.fill();
            streaks(14, wx, wr, wy, wall);
            for (const [px, py, left, right] of GLACIER_PEAKS) {
                const lx = px - left, rx = px + right, w = rx - lx, h = base - py;
                const peak = () => {
                    a.beginPath();
                    a.moveTo(lx, base);
                    a.bezierCurveTo(lx + w * 0.12, base - h * 0.4, px - w * 0.2, py + h * 0.22, px - w * 0.05, py + h * 0.02);
                    a.quadraticCurveTo(px, py - 3, px + w * 0.05, py + h * 0.03);
                    a.bezierCurveTo(px + w * 0.22, py + h * 0.28, rx - w * 0.1, base - h * 0.38, rx, base);
                    a.closePath();
                };
                a.filter = `blur(${0.6 * s}px)`;
                peak();
                a.fillStyle = ice(lx, rx);
                a.fill();
                a.strokeStyle = "rgba(60,120,175,0.35)";
                a.lineWidth = 1;
                a.stroke();
                streaks(5, lx + w * 0.15, rx - w * 0.1, py + h * 0.08, peak);
                // light along the lit flank
                a.save();
                peak();
                a.clip();
                a.filter = `blur(${1.5 * s}px)`;
                a.strokeStyle = "rgba(255,255,255,0.6)";
                a.lineWidth = 3;
                a.beginPath();
                a.moveTo(lx + w * 0.06, base);
                a.bezierCurveTo(lx + w * 0.16, base - h * 0.4, px - w * 0.16, py + h * 0.22, px - w * 0.03, py + h * 0.04);
                a.stroke();
                a.restore();
            }
            // deeper blue towards the water
            a.filter = "none";
            const low = a.createLinearGradient(0, base - 140, 0, base);
            low.addColorStop(0, "rgba(40,110,170,0)");
            low.addColorStop(1, "rgba(40,110,170,0.28)");
            a.save();
            a.beginPath();
            a.rect(GLACIER_WALL[0], 0, wr - GLACIER_WALL[0], base);
            for (const [px, py, left, right] of GLACIER_PEAKS) {
                a.moveTo(px, py);
                a.lineTo(px - left, base);
                a.lineTo(px + right, base);
                a.closePath();
            }
            a.clip();
            a.fillStyle = low;
            a.fillRect(x0, base - 140, x1 - x0 + 10, 140);
            a.restore();
            // snow banks along the left shore and slabs of ice at the glacier's foot
            a.filter = `blur(${0.5 * s}px)`;
            for (const [bx, bw, bh, tint] of [[-60, 300, 34, "#c9e2ee"], [140, 220, 20, "#c9e2ee"], [330, 170, 12, "#c9e2ee"], [610, 130, 10, "#a9d6ee"], [730, 170, 12, "#a9d6ee"]]) {
                const bank = a.createLinearGradient(0, GLACIER_LAKE - bh, 0, GLACIER_LAKE + 3);
                bank.addColorStop(0, "#f8fcfe");
                bank.addColorStop(1, tint);
                a.fillStyle = bank;
                a.beginPath();
                a.moveTo(bx - bw / 2, GLACIER_LAKE + 3);
                a.bezierCurveTo(bx - bw * 0.35, GLACIER_LAKE - bh, bx + bw * 0.2, GLACIER_LAKE - bh * 1.1, bx + bw / 2, GLACIER_LAKE + 3);
                a.fill();
            }
            a.filter = "none";
            g.save();
            g.setTransform(1, 0, 0, 1, 0, 0);
            g.drawImage(layer, 0, 0);
            g.restore();
            // the lake: pale where it mirrors the sky, deeper blue nearer; the mountains and glacier mirrored, softened, in it
            const lake = g.createLinearGradient(0, GLACIER_LAKE, 0, GLACIER_LAKE + 220);
            lake.addColorStop(0, "#d4ecf4");
            lake.addColorStop(0.3, "#a0d0e5");
            lake.addColorStop(1, "#5fa8d0");
            g.fillStyle = lake;
            g.fillRect(x0, GLACIER_LAKE, x1 - x0, y1 - GLACIER_LAKE);
            const T = g.getTransform(), shore = T.f + GLACIER_LAKE * T.d;
            g.save();
            g.setTransform(1, 0, 0, 1, 0, 0);
            g.beginPath();
            g.rect(0, shore, g.canvas.width, g.canvas.height - shore);
            g.clip();
            g.setTransform(1, 0, 0, -1, 0, 2 * shore);
            g.globalAlpha = 0.5;
            g.filter = `blur(${2.2 * s}px)`;
            g.drawImage(layer, 0, 0);
            g.restore();
            g.save();
            g.globalAlpha = 0.3;
            g.fillStyle = lake;
            g.fillRect(x0, GLACIER_LAKE, x1 - x0, y1 - GLACIER_LAKE);
            g.restore();
            // ripples across it
            for (let i = 0; i < 120; i++) {
                const y = GLACIER_LAKE + 2 + Math.pow(rnd(), 1.3) * (y1 - GLACIER_LAKE), x = x0 + rnd() * (x1 - x0);
                g.fillStyle = rnd() < 0.7 ? `rgba(255,255,255,${0.15 + rnd() * 0.2})` : `rgba(40,110,160,${0.06 + rnd() * 0.06})`;
                g.fillRect(x, y, 10 + rnd() * 110, 0.6 + rnd() * 0.6);
            }
            // floes with snow on them, smaller further off, each over its blue underside and reflection
            for (let i = 0; i < 30; i++) {
                const k = Math.pow(rnd(), 1.4), y = GLACIER_LAKE + 8 + k * (Math.max(y1, VIEW_H) - GLACIER_LAKE);
                const rx = (5 + k * 34) * (0.5 + rnd()), ry = rx * (0.14 + rnd() * 0.1), x = x0 + rnd() * (x1 - x0);
                g.fillStyle = "rgba(70,140,185,0.25)";
                g.beginPath();
                g.ellipse(x, y + ry * 1.3, rx * 0.95, ry * 0.9, 0, 0, Math.PI * 2);
                g.fill();
                g.fillStyle = "#8cc3df";
                g.beginPath();
                g.ellipse(x, y + ry * 0.35, rx, ry * 0.6, 0, 0, Math.PI * 2);
                g.fill();
                const cap = g.createLinearGradient(x - rx, 0, x + rx, 0);
                cap.addColorStop(0, "#ffffff");
                cap.addColorStop(0.6, "#f2f9fc");
                cap.addColorStop(1, "#bcdcec");
                g.fillStyle = cap;
                g.beginPath();
                g.moveTo(x - rx, y);
                g.bezierCurveTo(x - rx * 0.7, y - ry * 2.2, x + rx * 0.6, y - ry * 2.4, x + rx, y);
                g.closePath();
                g.fill();
            }
            // the paper's grain
            for (let i = 0; i < 3000; i++) {
                g.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,0.06)" : "rgba(20,60,90,0.025)";
                g.fillRect(x0 + rnd() * (x1 - x0), y0 + rnd() * (y1 - y0), 1.2, 1.2);
            }
        },
        ambient() { return { blobs: [], orbs: [] }; },
        // still with the animated backdrop or effects off
        glacier(e) {
            const moving = e.options.effects && e.options.backdrop;
            return {
                strength: GLACIER_STRENGTH * e.softEffectScale(), time: moving ? e.clock / 60 : 0,
                shore: GLACIER_LAKE, pulse: GLACIER_SWELL * e.pulse,
            };
        },
        glowRgb() { return null; },
        // the lake's deep blue: a faint grid, a white rim, rime in two corners
        frame(e, [x, y, w, h], exam) {
            const r = e.r, fill = e.options.effects ? this.wellFill[0] : this.wellFill[1];
            r.shape(x - 3, y - 3, w + 6, h + 6, { radius: 9, stroke: [1, 1, 1, 0.3 + 0.2 * e.pulse], lineWidth: 3 });
            r.shape(x, y, w, h, { radius: 6, fill, fillY: [y, y + h] });
            for (let c = 1; c < WIDTH; c++) r.rect(BOARD_X + c * CELL - 0.5, e.boardY, 1, e.boardH, "rgba(255,255,255,0.05)");
            for (let row = 1; row * CELL < e.boardH; row++) r.rect(BOARD_X, e.boardY + row * CELL - 0.5, BOARD_W, 1, "rgba(255,255,255,0.05)");
            if (!exam) {
                r.image(this.frostTexture(r, 0), x + 1, y + 1, 60, 60);
                r.image(this.frostTexture(r, 1), x + w - 47, y + h - 47, 46, 46);
            }
            r.shape(x, y, w, h, { radius: 6, stroke: exam ? goldAlpha(0.6 + 0.35 * e.pulse) : [1, 1, 1, 0.6 + 0.3 * e.pulse], lineWidth: 1.2 });
        },
        wellFill: [GLACIER_WELL_ALPHA, 0.96].map(a => [`rgba(32,92,134,${a})`, `rgba(18,62,98,${a})`]),
        // the HOLD and NEXT boxes: the lake's blue behind glass, so the pale ice pieces show in them
        panel(e, x, y, w, h) {
            const r = e.r;
            r.shape(x, y, w, h, { radius: 10, lineWidth: 1, fillY: [y, y + h], fill: ["rgba(48,116,158,0.86)", "rgba(24,76,116,0.88)"], stroke: GLACIER_EDGE });
            r.rect(x + 10, y + 1, w - 20, 1, "rgba(255,255,255,0.45)");
            const s = Math.min(40, h * 0.55);
            r.image(this.frostTexture(r, 0), x + 1, y + 1, s, s);
            r.image(this.frostTexture(r, 1), x + w - 1 - s * 0.75, y + h - 1 - s * 0.75, s * 0.75, s * 0.75);
        },
        label(e, s, x, y, w, size, spacing) {
            e.text(s, x, y, { size, weight: 700, color: GLACIER_LABEL, spacing });
            const tw = e.measureText(s, size, 700, spacing);
            if (w - tw - 8 > 4) e.r.rect(x + tw + 8, y, w - tw - 8, 1, GLACIER_RULE);
        },
        // frosted white, blue rime in two corners; selected, a blue rim, glow and bar
        card(e, x, y, w, h, radius, selected) {
            const r = e.r;
            if (selected) r.shape(x - 3, y - 3, w + 6, h + 6, { radius: radius + 3, stroke: "rgba(80,170,230,0.22)", lineWidth: 4 });
            r.shape(x, y, w, h, {
                radius, lineWidth: 1, fillY: [y, y + h],
                fill: selected ? ["rgba(255,255,255,0.94)", "rgba(226,243,251,0.92)"] : ["rgba(255,255,255,0.74)", "rgba(230,244,250,0.7)"],
                stroke: selected ? GLACIER_LIT : GLACIER_CARD_EDGE,
            });
            const s = Math.min(40, h * 0.55);
            r.image(this.frostTexture(r, 2), x + 1, y + 1, s, s);
            r.image(this.frostTexture(r, 3), x + w - 1 - s * 0.75, y + h - 1 - s * 0.75, s * 0.75, s * 0.75);
            if (selected) r.shape(x + 2, y + 8, 3, h - 16, { radius: 1.5, fill: GLACIER_LIT }); // clear of the text on tight cards
        },
        // seven small snowflakes in shades of blue, pale to deep
        stripe(e, x, y, w, h) {
            const d = Math.min(h + 9, w / 7 * 1.05);
            for (let t = 1; t <= 7; t++) e.r.image(this.flakeTexture(e.r, t), x + (t - 0.5) / 7 * w - d / 2, y + h / 2 - d / 2, d, d);
        },
        // letters of blue ice dusted with frost, a white glow round them against the sky
        wordmark(e, cx) {
            const size = Math.min(76, Math.floor(76 * (e.layout.view[2] - 48) / e.measureText("QUADBRICKS", 76, 900, 14)));
            const mark = this.markTexture(e, size);
            e.r.image(mark.tex, cx - mark.w / 2, 150 - mark.h / 2, mark.w, mark.h);
            this.stripe(e, cx - 70, 205, 140, 4);
        },
        // The wordmark at a size, rendered once per resolution (and again once the font has loaded)
        markTexture(e, size) {
            const r = e.r, res = r.s, ready = !document.fonts || document.fonts.check(`900 ${size}px Archivo`);
            const key = `${res}:${size}:${ready}`;
            if (this.mark && this.mark.key === key) return this.mark;
            if (this.mark) r.releaseTexture(this.mark.tex);
            const spacing = Math.round(size * 14 / 76), glow = 22;
            const w = Math.ceil(e.measureText("QUADBRICKS", size, 900, spacing)) + glow * 2, h = Math.ceil(size * 1.4) + glow * 2;
            const letters = document.createElement("canvas");
            letters.width = Math.ceil(w * res);
            letters.height = Math.ceil(h * res);
            const g = letters.getContext("2d");
            g.scale(res, res);
            const top = h / 2 - size / 2, ice = g.createLinearGradient(0, top, 0, top + size);
            ice.addColorStop(0, "#9ad8f3");
            ice.addColorStop(0.45, "#3f97d2");
            ice.addColorStop(0.55, "#226ea9");
            ice.addColorStop(1, "#5bb2e0");
            fillText2D(g, "QUADBRICKS", w / 2, h / 2, { size, weight: 900, color: ice, align: "center", spacing });
            // frost settled on the letters' tops, and fine cracks
            g.globalCompositeOperation = "source-atop";
            const rnd = themeRandom(23);
            for (let i = 0; i < 1600; i++) {
                g.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.7})`;
                g.fillRect(rnd() * w, top + Math.pow(rnd(), 2.5) * size, 0.6 + rnd() * 0.8, 0.6 + rnd() * 0.8);
            }
            g.strokeStyle = "rgba(255,255,255,0.45)";
            g.lineWidth = 0.6;
            for (let i = 0; i < 40; i++) {
                const x = rnd() * w, y = top + rnd() * size;
                g.beginPath();
                g.moveTo(x, y);
                g.lineTo(x + (rnd() - 0.5) * size * 0.13, y + rnd() * size * 0.16);
                g.stroke();
            }
            const c = document.createElement("canvas");
            c.width = letters.width;
            c.height = letters.height;
            const out = c.getContext("2d");
            out.shadowColor = "rgba(255,255,255,0.95)";
            out.shadowBlur = glow * 0.7 * res;
            out.drawImage(letters, 0, 0);
            this.mark = { key, tex: r.texture(c), w, h };
            return this.mark;
        },
        // Rime growing in from a corner (0: top left, 1: bottom right; 2 and 3 the same in blue, for the white cards),
        // branching at 60 degrees, rendered once per resolution
        frostTexture(r, kind) {
            const res = r.s;
            if (this.frost && this.frost.res === res) return this.frost.tex[kind];
            if (this.frost) this.frost.tex.forEach(t => r.releaseTexture(t));
            const n = 48;
            const tex = [0, 1, 2, 3].map(k => {
                const c = document.createElement("canvas");
                c.width = c.height = Math.ceil(n * res);
                const g = c.getContext("2d");
                g.scale(res, res);
                if (k % 2) {
                    g.translate(n, n);
                    g.rotate(Math.PI);
                }
                const rnd = themeRandom(31 + (k % 2) * 7), ink = k < 2 ? "220,245,255" : "60,130,185";
                g.lineCap = "round";
                g.lineWidth = 0.7;
                const branch = (x, y, a, len, depth) => {
                    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
                    g.strokeStyle = `rgba(${ink},${0.12 + depth * 0.08})`;
                    g.beginPath();
                    g.moveTo(x, y);
                    g.lineTo(x2, y2);
                    g.stroke();
                    if (!depth) return;
                    const steps = 2 + Math.floor(rnd() * 2);
                    for (let i = 1; i <= steps; i++) {
                        const t = i / (steps + 1), bx = x + (x2 - x) * t, by = y + (y2 - y) * t, l = len * (0.45 - t * 0.2) * (0.7 + rnd() * 0.5);
                        branch(bx, by, a - Math.PI / 3, l, depth - 1);
                        branch(bx, by, a + Math.PI / 3, l, depth - 1);
                    }
                };
                branch(3.5, 3.5, 0, 26 * (0.8 + rnd() * 0.4), 2);
                branch(3.5, 3.5, Math.PI / 2, 26 * (0.6 + rnd() * 0.4), 2);
                branch(3.5, 3.5, Math.PI / 4, 14, 2);
                return r.texture(c);
            });
            this.frost = { res, tex };
            return tex[kind];
        },
        // The stripe's t-th snowflake (1..7, pale to deep blue), rendered once per resolution
        flakeTexture(r, t) {
            const res = r.s;
            if (!this.flakes || this.flakes.res !== res) {
                if (this.flakes) this.flakes.tex.forEach(x => x && r.releaseTexture(x));
                this.flakes = { res, tex: [] };
            }
            if (this.flakes.tex[t]) return this.flakes.tex[t];
            const n = 16, c = document.createElement("canvas");
            c.width = c.height = Math.ceil(n * res);
            const g = c.getContext("2d");
            g.scale(res, res);
            paintSnowflake(g, n / 2, n / 2, n * 0.46, `hsl(${198 + t * 2},${55 + t * 3}%,${66 - t * 4}%)`, 1.2);
            return (this.flakes.tex[t] = r.texture(c));
        },
    },

    // Pulse: futuristic and minimal. Near black with a lattice of faint dots that light up as a clear's ripple runs through
    // them and one ribbon of fine lines drifting across (GLBackdrop's PULSE_FS); no boxes: the well a dark pane between two
    // rails with a pulse of light climbing each and a floor that glows as pieces lock, hairline labels; light, wide type;
    // the next pieces slide up a place as the queue moves (slideNext)
    pulse: {
        name: "Pulse",
        ink: [234 / 255, 240 / 255, 255 / 255],
        slideNext: true,
        bandOut: 0, // no frame: the countdown's and banners' bands stop at the well's sides, inside the rails
        picture(g, x0, y0, x1, y1) {
            g.fillStyle = "#020308";
            g.fillRect(x0, y0, x1 - x0, y1 - y0);
            const deep = g.createRadialGradient(VIEW_W / 2, VIEW_H * 0.55, 0, VIEW_W / 2, VIEW_H * 0.55, Math.max(x1 - x0, y1 - y0) * 0.7);
            deep.addColorStop(0, "rgba(30,50,120,0.16)");
            deep.addColorStop(1, "rgba(0,0,0,0)");
            g.fillStyle = deep;
            g.fillRect(x0, y0, x1 - x0, y1 - y0);
            vignette(g, x0, y0, x1, y1, 0.45);
        },
        // light type: thin at display sizes, never heavier than medium below them; capitals and numbers wide, text with
        // small letters in it (descriptions, help) at its usual width, as in the draft, so it still fits where it did
        font(size, weight, s) {
            const wide = !/\p{Ll}/u.test(s);
            return size >= 22 ? { weight: Math.min(weight, 300), stretch: wide ? "expanded" : "normal" }
                : { weight: Math.min(weight, 500), stretch: wide ? "semi-expanded" : "normal" };
        },
        hue(e) { return this.beamHue(e.hue); },
        // the accent for a backdrop hue (the clear beams' too)
        beamHue(hue) { return PULSE_HUE + PULSE_HUE_SWING * Math.sin((hue - HUE_DEFAULT) * Math.PI / 180); },
        ambient() { return { blobs: [], orbs: [] }; },
        // the lattice is still with the animated backdrop or effects off, the ribbon too; the ripples come with clears
        pulse(e) {
            const moving = e.options.effects && e.options.backdrop, hue = this.hue(e);
            const ripples = e.GAMESTATE !== STATE_GAME ? [] : e.rings.map(ring => {
                const k = 1 - ring.life / ring.span; // 0 -> 1
                return {
                    x: ring.gx + BOARD_X + BOARD_W / 2, y: ring.y,
                    r: 20 + (1 - Math.pow(1 - k, 1.6)) * PULSE_RIPPLE_REACH,
                    a: Math.pow(1 - k, 1.5) * (0.6 + 0.2 * ring.power) * ring.k * PULSE_RIPPLE_ALPHA,
                };
            });
            return {
                strength: e.softEffectScale(), time: moving ? e.clock / 60 : 0,
                ribbon: PULSE_RIBBON * (1 + (moving ? PULSE_RIBBON_SWELL * e.pulse : 0)), rest: PULSE_DOT_REST,
                spacing: PULSE_LATTICE, band: PULSE_RIPPLE_BAND,
                rgb: [hslToRgb(hue, 70, 72), hslToRgb(hue - 20, 100, 62), hslToRgb(hue + 60, 100, 66)],
                ripples,
            };
        },
        glowRgb(e) { return hslToRgb(this.hue(e), 90, 45); },
        // a dark pane, a point at each cell corner, a rail each side (a pulse of light climbing it, lit by locks) and
        // a floor that glows as pieces lock
        frame(e, [x, y, w, h], exam) {
            const r = e.r, hue = this.hue(e), lit = clamp(e.board.lockGlow / LOCK_GLOW_LIFE, 0, 1);
            const wx = x + 8, wy = y + 8, ww = w - 16, wh = h - 16; // the well
            r.rect(wx, wy, ww, wh, [2 / 255, 3 / 255, 9 / 255, e.options.effects ? PULSE_WELL_ALPHA : 0.96]);
            r.shape(wx, wy, ww, wh, { fill: [hsla(hue, 90, 40, 0), hsla(hue, 90, 40, 0.06 + 0.06 * e.pulse)], fillY: [wy, wy + wh] });
            const rows = e.boardH / CELL;
            for (let c = 1; c < WIDTH; c++) {
                for (let row = 1; row < rows; row++) r.rect(BOARD_X + c * CELL - 0.5, e.boardY + row * CELL - 0.5, 1, 1, PULSE_POINT);
            }
            const top = wy - PULSE_RAIL_TOP, rail = exam ? goldAlpha(0.6 + 0.35 * e.pulse) : hsla(hue, 100, 66, 0.4 + 0.3 * lit);
            const moving = e.options.effects && e.options.backdrop;
            [wx - 1, wx + ww].forEach((rx, side) => {
                r.shape(rx, top, 1, wh + PULSE_RAIL_TOP, { fill: [[rail[0], rail[1], rail[2], 0], rail], fillY: [top, wy + wh] });
                if (!moving) return;
                const p = pulseFrac(e.clock / 60 * PULSE_RAIL_SPEED + side * 0.5), py = wy + wh - p * (wh + PULSE_RAIL_TOP);
                const head = PULSE_RAIL_LEN * 0.15, bright = hsla(hue + 40, 100, 80, 0.7 * (1 - p)), dark = hsla(hue, 100, 60, 0);
                r.shape(rx - 0.25, py, 1.5, head, { fill: [hsla(hue + 40, 100, 75, 0), bright], fillY: [py, py + head] });
                r.shape(rx - 0.25, py + head, 1.5, PULSE_RAIL_LEN - head, { fill: [bright, dark], fillY: [py + head, py + PULSE_RAIL_LEN] });
            });
            r.save();
            r.blendMode = "add";
            const a = r.globalAlpha, [gw, gh] = PULSE_FLOOR_GLOW; // a soft pool of light on the floor, flaring as pieces lock
            r.globalAlpha = a * (PULSE_FLOOR_ALPHA[0] + PULSE_FLOOR_ALPHA[1] * lit);
            r.image(this.floorTexture(r, hue + 30), wx + ww / 2 - gw, wy + wh - gh, gw * 2, gh * 2);
            r.globalAlpha = a * (0.55 + 0.45 * lit);
            r.image(this.lineTexture(r), wx - 18, wy + wh - 16, ww + 36, 32);
            r.restore();
        },
        // The floor's pool of light in a hue, rendered once per 15° of it: a round glow, from the hue lightened at its
        // centre to nothing at its edge (drawn squashed into an ellipse)
        floorTexture(r, hue) {
            const step = Math.round(((hue % 360) + 360) % 360 / 15) % 24;
            this.floor = this.floor || [];
            if (this.floor[step]) return this.floor[step];
            const n = 128, c = document.createElement("canvas");
            c.width = c.height = n;
            const g = c.getContext("2d"), glow = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
            glow.addColorStop(0, `hsla(${step * 15},100%,70%,1)`);
            glow.addColorStop(1, `hsla(${step * 15 - 30},100%,50%,0)`);
            g.fillStyle = glow;
            g.fillRect(0, 0, n, n);
            return (this.floor[step] = r.texture(c));
        },
        panel() {}, // no boxes: the pieces stand on the dark
        label(e, s, x, y, w, size, spacing) {
            e.text(s, x, y, { size, weight: 600, color: PULSE_LABEL, spacing });
            const tw = e.measureText(s, size, 600, spacing);
            if (w - tw - 8 > 4) e.r.rect(x + tw + 8, y, w - tw - 8, 1, PULSE_RULE);
        },
        // hairline cards; the selected one lit, with a light running round it
        card(e, x, y, w, h, radius, selected, accent) {
            const r = e.r, hue = this.hue(e);
            r.shape(x, y, w, h, {
                radius: 6, lineWidth: 1,
                fill: selected ? hsla(hue, 80, 50, 0.09) : "rgba(10,12,24,0.5)",
                stroke: selected ? hsla(hue, 100, 72, 0.4) : PULSE_EDGE,
            });
            if (!selected) return;
            r.shape(x + 1, y + 8, 2, h - 16, { radius: 1, fill: accent }); // clear of the text on tight cards
            if (!e.options.effects) return;
            const head = pulseFrac(e.clock / 60 * PULSE_RUNNER_SPEED) * 2 * (w + h), color = hsla(hue + 30, 100, 80, 1);
            r.save();
            r.blendMode = "add";
            const a = r.globalAlpha;
            for (let i = 0; i < PULSE_RUNNER_DOTS; i++) {
                const [px, py] = perimeterPoint(x, y, w, h, head - i * 3);
                r.globalAlpha = a * (1 - i / PULSE_RUNNER_DOTS) * 0.9;
                r.rect(px - 1, py - 1, 2, 2, color);
            }
            r.restore();
        },
        // the seven colours as small lights
        stripe(e, x, y, w, h) {
            const d = h + 1, gap = (w - d) / 6;
            for (let t = 1; t <= 7; t++) e.r.shape(x + (t - 1) * gap, y + h / 2 - d / 2, d, d, { radius: d / 2, fill: PIECE_COLORS[t].light });
        },
        // a thin, wide wordmark, a light sweeping across it now and then, over a line of light and the seven lights
        wordmark(e, cx) {
            const r = e.r, size = Math.min(64, Math.floor(64 * (e.layout.view[2] - 48) / e.measureText("QUADBRICKS", 64, 200, 14)));
            const style = { size, weight: 200, color: PULSE_MARK, align: "center", spacing: Math.round(size * 14 / 64) };
            const w = e.text("QUADBRICKS", cx, 150, style);
            if (e.options.effects) {
                const sx = cx - w / 2 + (pulseFrac(e.clock / 60 / PULSE_SWEEP_PERIOD) * 2.4 - 0.3) * w;
                for (let i = -3; i <= 3; i++) {
                    r.save();
                    r.clip(sx + i * 8 - 4, 100, 8, 100);
                    r.globalAlpha *= Math.exp(-i * i / 4);
                    e.text("QUADBRICKS", cx, 150, { ...style, color: "#ffffff" });
                    r.restore();
                }
            }
            r.save();
            r.blendMode = "add";
            r.globalAlpha *= 0.7;
            r.image(this.lineTexture(r), cx - 260, 186 - 16, 520, 32);
            r.restore();
            this.stripe(e, cx - 36, 205, 72, 3);
        },
        // A line of light fading out towards its ends, with a soft glow round it, rendered once per resolution: 200 × 32
        // logical units, the line along the middle
        lineTexture(r) {
            const res = r.s;
            if (this.line && this.line.res === res) return this.line.tex;
            if (this.line) r.releaseTexture(this.line.tex);
            const w = 200, h = 32, c = document.createElement("canvas");
            c.width = Math.ceil(w * res);
            c.height = Math.ceil(h * res);
            const g = c.getContext("2d");
            g.scale(res, res);
            const glow = g.createLinearGradient(0, 0, 0, h);
            glow.addColorStop(0, "rgba(120,180,255,0)");
            glow.addColorStop(0.5, "rgba(120,180,255,0.18)");
            glow.addColorStop(1, "rgba(120,180,255,0)");
            g.fillStyle = glow;
            g.fillRect(0, h * 0.3, w, h * 0.4);
            g.fillStyle = "rgba(225,240,255,0.95)";
            g.fillRect(0, h / 2 - 0.5, w, 1);
            g.globalCompositeOperation = "destination-in";
            const ends = g.createLinearGradient(0, 0, w, 0);
            ends.addColorStop(0, "rgba(0,0,0,0)");
            ends.addColorStop(0.5, "rgba(0,0,0,1)");
            ends.addColorStop(1, "rgba(0,0,0,0)");
            g.fillStyle = ends;
            g.fillRect(0, 0, w, h);
            this.line = { tex: r.texture(c), res };
            return this.line.tex;
        },
    },
};
const BACKGROUND_IDS = ["space", "gallery", "lines", "hologram", "undersea", "eclipse", "glacier", "pulse"]; // menu order

// Themes (Options → Customization → Theme): a background with the block style, confetti, clear burst and drop
// trail that go with it, which those settings take while they are on Follow theme (Options.look())
const THEMES = {
    space: { name: "Deep Space", background: "space", tileset: "flat", confetti: "sparks", rings: "flare", trail: "streak" },
    gallery: { name: "Night Gallery", background: "gallery", tileset: "wire", confetti: "neon", rings: "rings", trail: "neon" },
    lines: { name: "Field Lines", background: "lines", tileset: "chalk", confetti: "paper", rings: "contours", trail: "chalk" },
    hologram: { name: "Hologram", background: "hologram", tileset: "holo", confetti: "foil", rings: "glitter", trail: "prism" },
    undersea: { name: "Undersea", background: "undersea", tileset: "jelly", confetti: "bubbles", rings: "ripple", trail: "water" },
    eclipse: { name: "Eclipse", background: "eclipse", tileset: "backlit", confetti: "dust", rings: "shafts", trail: "rays" },
    glacier: { name: "Glacier", background: "glacier", tileset: "frost", confetti: "snow", rings: "shards", trail: "rime" },
    pulse: { name: "Pulse", background: "pulse", tileset: "wire", confetti: "streaks", rings: "beam", trail: "pour" },
};
const THEME_IDS = ["space", "gallery", "lines", "hologram", "undersea", "eclipse", "glacier", "pulse"]; // menu order; the first is the default

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

// A six-armed snowflake of radius rad in a CSS colour, each arm with two pairs of branches; lw scales its lines
// (Glacier's stripe and the Snow confetti)
function paintSnowflake(g, x, y, rad, color, lw) {
    const k = rad / 8.5;
    g.save();
    g.translate(x, y);
    g.strokeStyle = color;
    g.lineCap = "round";
    for (let a = 0; a < 6; a++) {
        g.save();
        g.rotate(a * Math.PI / 3);
        g.lineWidth = 1.3 * k * lw;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(0, -8.5 * k);
        g.stroke();
        g.lineWidth = 0.9 * k * lw;
        for (const [d, l] of [[3.6, 2.6], [6, 1.9]]) {
            g.beginPath();
            g.moveTo(-l * k, -(d + l) * k);
            g.lineTo(0, -d * k);
            g.lineTo(l * k, -(d + l) * k);
            g.stroke();
        }
        g.restore();
    }
    g.restore();
}

// A "#rrggbb" colour taken k of the way to white, as "rgb(...)"
function whiten(hex, k) {
    return `rgb(${[1, 3, 5].map(i => Math.round(parseInt(hex.substr(i, 2), 16) * (1 - k) + 255 * k)).join(",")})`;
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
