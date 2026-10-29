// Backdrop pass of the WebGL renderer (renderer.js), drawn first each frame: the backdrop
// picture, its colour wash, field lines, holographic foil or water, the line-clear shafts, contours or glitter and drifting
// lights, the board glow and the line-clear shockwaves. These are large, soft effects computed per pixel in shaders. The engine
// builds a scene description each frame (see Engine.backdropScene).
// Coordinates are device pixels, y down, unless noted.

const BACKDROP_MAX_RINGS = 6;
const BACKDROP_MAX_BUMPS = 4; // field lines' bumps

const FULLSCREEN_VS = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

// Static backdrop picture plus the three colour blobs (radial gradients, added). As nebulae
// (uNebula > 0), the blobs fade out smoothly and their light is shaped by a slowly flowing,
// domain-warped fractal noise: bright wisps and filaments with dark lanes between them.
const WASH_FS = `
precision highp float;
uniform vec2 uSize;
uniform sampler2D uBackground;
uniform vec3 uBgView;          // scale, offset x, offset y of the backdrop's logical view
uniform vec3 uBlob[3];         // centre x, y, radius (logical)
uniform vec4 uBlobColor[3];    // rgb, alpha at the centre
uniform float uNebula;         // 0: plain blobs; else how much the noise shapes them
uniform float uTime;           // seconds, for the nebulae's flow
uniform vec3 uShade[2];        // circles in front of the blobs, hiding their light: x, y, radius (logical; 0: none)

float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int k = 0; k < 5; k++) {
        s += a * noise(p);
        p = p * 2.03 + vec2(17.1, 9.2);
        a *= 0.5;
    }
    return s;
}

void main() {
    vec2 p = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
    vec3 c = texture2D(uBackground, p / uSize).rgb;
    vec2 q = (p - uBgView.yz) / uBgView.x;
    float shape = 1.0;
    if (uNebula > 0.0) {
        vec2 n = q * 0.0055 + vec2(uTime * 0.012, uTime * 0.007);
        vec2 warp = vec2(fbm(n + vec2(0.0, uTime * 0.01)), fbm(n + vec2(5.2, 1.3)));
        float d = fbm(n + 1.7 * warp);
        float wisps = smoothstep(0.32, 0.78, d);
        shape = mix(1.0, 0.15 + 1.5 * wisps + 1.6 * pow(wisps, 4.0), uNebula);
    }
    for (int i = 0; i < 2; i++) {
        if (uShade[i].z > 0.0) shape *= clamp((length(q - uShade[i].xy) - uShade[i].z) * uBgView.x + 0.5, 0.0, 1.0);
    }
    for (int i = 0; i < 3; i++) {
        float f = max(0.0, 1.0 - length(q - uBlob[i].xy) / uBlob[i].z);
        if (uNebula > 0.0) f = f * f * (3.0 - 2.0 * f);
        c += uBlobColor[i].rgb * uBlobColor[i].a * f * shape;
    }
    gl_FragColor = vec4(c, 1.0);
}`;

// Field lines (the Field Lines background), added over the picture: the level sets y - d = n × spacing of a
// height field d made of Gaussian bumps, so the lines run across and bend round each bump, taking its
// colour where it lifts them most. Antialiased by their distance in pixels (the line's offset over
// the field's gradient), about one logical unit wide and never thinner than a pixel (fainter instead).
const LINES_FS = `
precision highp float;
uniform vec2 uSize;
uniform vec3 uBgView;                          // scale, offset x, offset y of the backdrop's logical view
uniform vec4 uBump[${BACKDROP_MAX_BUMPS}];        // centre x, y, radius, height (logical; height 0: unused)
uniform vec3 uBumpColor[${BACKDROP_MAX_BUMPS}];
uniform vec4 uInk;                             // rgb, alpha of plain lines
uniform float uSpacing;
void main() {
    vec2 p = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
    vec2 q = (p - uBgView.yz) / uBgView.x;
    float d = 0.0, k = 0.0;
    vec2 grad = vec2(0.0);
    vec3 tint = vec3(0.0);
    for (int i = 0; i < ${BACKDROP_MAX_BUMPS}; i++) {
        vec2 o = q - uBump[i].xy;
        float rr = max(uBump[i].z * uBump[i].z, 1.0);
        float e = uBump[i].w * exp(-2.0 * dot(o, o) / rr);
        d += e;
        grad -= e * 4.0 * o / rr;
        float w = clamp(abs(e) / 30.0, 0.0, 1.0);
        tint += uBumpColor[i] * w;
        k += w;
    }
    float f = (q.y - d) / uSpacing;
    float slope = length(vec2(grad.x, 1.0 - grad.y)) / uSpacing; // lines per logical unit across them
    float dist = abs(fract(f + 0.5) - 0.5) / slope * uBgView.x;  // to the nearest line, in pixels
    float line = clamp(0.5 * max(uBgView.x, 1.0) + 0.5 - dist, 0.0, 1.0) * min(uBgView.x, 1.0);
    float c = clamp(k, 0.0, 1.0);
    vec3 col = uInk.rgb * uInk.a * (1.0 - c) + tint / max(k, 0.0001) * 0.8 * c;
    gl_FragColor = vec4(col * line, 0.0);
}`;

// Holographic foil (the Hologram background), added over the picture: a rainbow sheen whose hue runs
// along a diagonal, lit by two soft bands of light across it (their place moves with uFoil.y); fine
// grooves along the same diagonal that catch the light in the bands; and facets, a honeycomb of small
// hexagonal mirrors each turned its own way, so as the bands move some flash while the rest stay dark (glitter
// foil), fading out away from uFacets's centre. The grooves fade out where they would be under 3 pixels apart.
// Antialiased like the field lines.
const FOIL_FS = `
precision highp float;
uniform vec2 uSize;
uniform vec3 uBgView;    // scale, offset x, offset y of the backdrop's logical view
uniform vec4 uFoil;      // hue (degrees), band offset (logical), strength, time (seconds)
uniform vec4 uFacets;    // centre x, y, a facet's width, the distance they start fading at (logical)
const float GROOVES = 4.0;   // logical units between grooves
const float FLASH = 0.09;    // a facet's light at its brightest
const float EDGE = 0.012;    // the facets' edges, and their extra in the light bands
const float EDGE_LIT = 0.03;
vec3 spectrum(float h) {     // HSL at 85 % saturation, 56 % lightness
    vec3 rgb = clamp(abs(mod(h / 60.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return 0.56 + 0.748 * (rgb - 0.5);
}
float hairline(float distPx, float width) {
    return clamp(0.5 * max(width, 1.0) + 0.5 - distPx, 0.0, 1.0) * min(width, 1.0);
}
float hash(vec2 v) {
    return fract(sin(dot(v, vec2(127.1, 311.7))) * 43758.5453);
}
void main() {
    vec2 p = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
    vec2 q = (p - uBgView.yz) / uBgView.x;
    float s = uBgView.x;
    float along = dot(q, vec2(0.8, 0.6)), across = dot(q, vec2(0.6, -0.8));
    float b1 = exp(-pow((across + 120.0 - uFoil.y) / 150.0, 2.0));
    float b2 = exp(-pow((across - 260.0 - 0.6 * uFoil.y) / 90.0, 2.0));
    float lit = b1 + 0.6 * b2;
    vec3 sheen = spectrum(uFoil.x + along * 0.32 + 25.0 * sin(q.y * 0.008 + uFoil.w * 0.2));
    vec3 c = sheen * (0.05 + 0.24 * b1 + 0.14 * b2);
    float groove = hairline(abs(fract(along / GROOVES + 0.5) - 0.5) * GROOVES * s, s * 0.8);
    groove *= smoothstep(3.0, 5.0, GROOVES * s);
    c += mix(vec3(1.0), sheen, 0.5) * groove * (0.02 + 0.08 * lit);
    // the facet this pixel is on (the nearer centre of two offset rectangular lattices) and where in it
    float size = uFacets.z;
    vec2 hs = vec2(1.0, 1.7320508), hp = q / size;
    vec2 ha = mod(hp, hs) - 0.5 * hs, hb = mod(hp - 0.5 * hs, hs) - 0.5 * hs;
    vec2 hl = dot(ha, ha) < dot(hb, hb) ? ha : hb, id = hp - hl;
    float turn = hash(id), shine = hash(id + 17.0);
    float hex = max(abs(hl.x), dot(abs(hl), vec2(0.5, 0.8660254)));
    float edge = hairline((0.5 - hex) * size * s, s * 0.6);
    float facing = pow(0.5 + 0.5 * cos(turn * 6.2832 + uFoil.y * 0.025 + dot(id * size, vec2(0.8, 0.6)) * 0.004), 8.0);
    float flash = facing * (0.25 + lit) * (0.6 + 0.4 * shine);
    float keep = 1.0 - smoothstep(uFacets.w, uFacets.w * 1.9, length(q - uFacets.xy));
    c += spectrum(uFoil.x + along * 0.32 + turn * 140.0) * (flash * FLASH + edge * (EDGE + EDGE_LIT * lit)) * keep;
    gl_FragColor = vec4(c * uFoil.z, 0.0);
}`;

// Water (the Undersea background), added over the picture: light shafts slanting down from the surface,
// swaying and fading with depth, and caustics, the net of light the waves focus (Dave Hoskins's tileable
// water caustic), strong near the surface and again on the sea floor, faint in between.
const WATER_FS = `
precision highp float;
uniform vec2 uSize;
uniform vec3 uBgView;    // scale, offset x, offset y of the backdrop's logical view
uniform vec3 uWaterRgb;  // the light's colour
uniform vec2 uWater;     // strength, time (seconds)
const float TAU = 6.2831853;
const float TILE = 360.0;    // logical units per caustic tile
void main() {
    vec2 p = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
    vec2 q = (p - uBgView.yz) / uBgView.x;
    float t = uWater.y, depth = clamp(q.y / 720.0, 0.0, 1.0);
    float s = q.x + q.y * 0.35; // along the surface, the shafts slanting down to the left
    float rays = pow(0.5 + 0.5 * sin(s * 0.021 + 0.6 * sin(t * 0.23)), 8.0)
        + 0.7 * pow(0.5 + 0.5 * sin(s * 0.013 + 1.7 + 0.5 * sin(t * 0.17 + 1.0)), 10.0)
        + 0.5 * pow(0.5 + 0.5 * sin(s * 0.034 + 4.0 + 0.8 * sin(t * 0.31 + 2.0)), 12.0);
    rays *= (1.0 - smoothstep(0.0, 0.85, depth)) * (0.7 + 0.3 * sin(t * 0.5 + s * 0.004));
    vec2 c0 = mod(q / TILE * TAU, TAU) - 250.0, i = c0;
    float c = 1.0, ct = t * 0.55 + 23.0;
    for (int n = 0; n < 4; n++) {
        float tn = ct * (1.0 - 3.5 / float(n + 1));
        i = c0 + vec2(cos(tn - i.x) + sin(tn + i.y), sin(tn - i.y) + cos(tn + i.x));
        c += 1.0 / length(vec2(c0.x / (sin(i.x + tn) / 0.005), c0.y / (cos(i.y + tn) / 0.005)));
    }
    c = 1.17 - pow(c / 4.0, 1.4);
    float caustic = min(1.0, pow(abs(c), 8.0));
    float reach = max(pow(1.0 - depth, 2.2), 0.55 * pow(clamp((depth - 0.72) / 0.28, 0.0, 1.0), 1.5)) + 0.06;
    gl_FragColor = vec4(uWaterRgb * (0.1 * rays + 0.3 * caustic * reach) * uWater.x, 0.0);
}`;

// Light rays in fog (the Eclipse background), added: from a light behind each occluder (a well, or the
// menu's wordmark: a rounded box), rays fan out past its edges, brightest there and fading with the
// distance; drifting fog, a slowly flowing noise, is what makes them visible, so they break up where it thins.
const BEAMS_FS = `
precision highp float;
uniform vec2 uSize;
uniform vec3 uView;              // scale, offset x, offset y of the logical view
uniform vec4 uBeam[2];           // the light: x, y (logical); strength (0: unused); the occluder's corner radius
uniform vec4 uOccluder[2];       // the occluder: centre x, y, half width, half height (logical)
uniform vec3 uBeamRgb;
uniform float uTime;             // seconds
float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
    vec2 p = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
    vec2 q = (p - uView.yz) / uView.x;
    float t = uTime;
    vec2 fq = q * 0.0045 + vec2(t * 0.018, -t * 0.011);
    float fog = 0.5 * noise(fq) + 0.3 * noise(fq * 2.3 + vec2(-t * 0.03, 7.0)) + 0.2 * noise(fq * 5.1 + 3.0);
    fog = 0.25 + 0.75 * smoothstep(0.2, 0.8, fog);
    vec3 c = vec3(0.0);
    for (int i = 0; i < 2; i++) {
        if (uBeam[i].z <= 0.0) continue;
        vec2 d = q - uBeam[i].xy;
        float len = max(length(d), 1.0);
        vec2 dir = d / len; // the rays' noise runs round the light (no seam)
        float rays = pow(noise(dir * 5.0 + vec2(t * 0.04, 0.0)), 3.0)
            + 0.7 * pow(noise(dir * 11.0 + vec2(5.0, -t * 0.06)), 4.0)
            + 0.4 * pow(noise(dir * 23.0 + vec2(-t * 0.05, 9.0)), 5.0);
        vec2 b = abs(q - uOccluder[i].xy) - uOccluder[i].zw + uBeam[i].w;
        float dist = length(max(b, 0.0)) + min(max(b.x, b.y), 0.0) - uBeam[i].w; // outside the occluder
        float edge = smoothstep(-6.0, 14.0, dist);
        float fall = 1.0 / (1.0 + dist * 0.012) / (1.0 + dist * 0.004);
        float halo = exp(-max(dist, 0.0) / 40.0);
        c += uBeamRgb * uBeam[i].z * edge * (fall * (0.15 + 1.6 * rays) * fog + 0.5 * halo);
    }
    gl_FragColor = vec4(c, 0.0);
}`;

// Clear shafts (Clear burst: Shafts, Eclipse's), added: light breaking through where rows cleared, a fan of rays from
// behind the cleared rows (their centre) spreading out sideways, the fan the wider the taller the rows, its front
// travelling out and the rays fading behind it, broken up by drifting fog like the Eclipse background's rays.
const SHAFTS_FS = `
precision highp float;
uniform vec2 uSize;
uniform vec3 uView;                                // scale, offset x, offset y of the logical view
uniform vec4 uShaft[${BACKDROP_MAX_RINGS}];         // centre x, y, the front's radius, the fan's spread (of the direction's y)
uniform vec4 uShaftColor[${BACKDROP_MAX_RINGS}];    // rgb, alpha (0: unused)
uniform float uTime;
float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
    vec2 p = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
    vec2 q = (p - uView.yz) / uView.x;
    float t = uTime;
    vec2 fq = q * 0.005 + vec2(t * 0.02, -t * 0.012);
    float fog = 0.35 + 0.65 * smoothstep(0.2, 0.8, 0.6 * noise(fq) + 0.4 * noise(fq * 2.7 + 5.0));
    vec3 c = vec3(0.0);
    for (int i = 0; i < ${BACKDROP_MAX_RINGS}; i++) {
        if (uShaftColor[i].w <= 0.0) continue;
        vec2 d = q - uShaft[i].xy;
        float len = max(length(d), 1.0);
        vec2 dir = d / len;
        float seed = float(i) * 17.0;
        float rays = pow(noise(dir * 9.0 + seed), 3.0) + 0.6 * pow(noise(dir * 21.0 + seed + 4.0), 4.0);
        float fan = exp(-dir.y * dir.y / (uShaft[i].w * uShaft[i].w));
        float front = smoothstep(uShaft[i].z, uShaft[i].z * 0.55, len); // lit behind the front
        float fall = 1.0 / (1.0 + len * 0.004);
        c += uShaftColor[i].rgb * uShaftColor[i].w * fan * front * fall * (0.2 + 1.8 * rays) * fog;
    }
    gl_FragColor = vec4(c, 0.0);
}`;

// Clear contours (Clear burst: Contours, Field Lines'), added: a packet of fine lines spreading from the
// cleared rows, the level sets of the distance from the centre (stretched 1.6x horizontally) a line spacing
// apart, wandering with a slow noise like the field lines round their bumps, each line its own hue a step
// round the wheel, strongest at the packet's middle. Antialiased by their distance in pixels, as the field lines.
const CONTOUR_FS = `
precision highp float;
uniform vec2 uSize;
uniform vec3 uView;                                // scale, offset x, offset y of the logical view
uniform vec4 uContour[${BACKDROP_MAX_RINGS}];       // centre x, y, radius, packet width (logical)
uniform vec4 uContourColor[${BACKDROP_MAX_RINGS}];  // hue (degrees), alpha (0: unused), noise seed, line spacing (logical)
const float WANDER = 46.0;   // how far the noise moves a line (logical units)
const float HUE_STEP = 38.0; // degrees from one line to the next
vec3 spectrum(float h) {     // HSL at 80 % saturation, 72 % lightness
    vec3 rgb = clamp(abs(mod(h / 60.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return 0.72 + 0.448 * (rgb - 0.5);
}
float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
    vec2 p = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
    vec2 q = (p - uView.yz) / uView.x;
    float s = uView.x;
    vec3 c = vec3(0.0);
    for (int i = 0; i < ${BACKDROP_MAX_RINGS}; i++) {
        if (uContourColor[i].y <= 0.0) continue;
        float seed = uContourColor[i].z, spacing = uContourColor[i].w;
        vec2 o = q - uContour[i].xy;
        vec2 nq = q * 0.006 + seed;
        o += (vec2(noise(nq), noise(nq + 37.0)) - 0.5) * 2.0 * WANDER;
        vec2 e = o / vec2(1.6, 1.0);
        float len = max(length(e), 0.001);
        float u = (len - uContour[i].z) / uContour[i].w;
        if (abs(u) > 3.0) continue;
        float env = exp(-u * u) * smoothstep(0.0, 40.0, len);
        float slope = length(e / vec2(1.6, 1.0)) / len; // the distance's gradient (the noise's left out)
        float f = (len - uContour[i].z) / spacing;
        float dist = abs(fract(f + 0.5) - 0.5) * spacing / slope * s; // to the nearest line, in pixels
        float w = 1.2 * s;
        float line = clamp(0.5 * max(w, 1.0) + 0.5 - dist, 0.0, 1.0) * min(w, 1.0);
        float glow = 0.3 * exp(-dist * dist / (16.0 * s * s));
        c += spectrum(uContourColor[i].x + floor(f + 0.5) * HUE_STEP) * uContourColor[i].y * env * (line + glow);
    }
    gl_FragColor = vec4(c, 0.0);
}`;

// Clear glitter (Clear burst: Glitter, Hologram's), added: a wave spreading from the cleared rows (stretched
// 1.3x horizontally) that sets a honeycomb of small hexagonal facets flashing in rainbow colours as it
// passes their centres, each a little late by its own amount, then glinting again as it turns, the brightest
// with a white glint. The honeycomb is the Hologram foil's (FOIL_FS), on the backdrop's view, so on its
// background the foil's own facets light up.
const GLITTER_FS = `
precision highp float;
uniform vec2 uSize;
uniform vec3 uView;                                // scale, offset x, offset y of the logical view
uniform vec3 uBgView;                              // the same of the backdrop's (the honeycomb's)
uniform float uFacet;                              // a facet's width (backdrop logical)
uniform vec4 uGlitter[${BACKDROP_MAX_RINGS}];       // centre x, y, radius, front width (logical)
uniform vec2 uGlitterColor[${BACKDROP_MAX_RINGS}];  // hue (degrees), alpha (0: unused)
vec3 spectrum(float h) {     // HSL at 85 % saturation, 62 % lightness
    vec3 rgb = clamp(abs(mod(h / 60.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return 0.62 + 0.646 * (rgb - 0.5);
}
float hairline(float distPx, float width) {
    return clamp(0.5 * max(width, 1.0) + 0.5 - distPx, 0.0, 1.0) * min(width, 1.0);
}
float hash(vec2 v) {
    return fract(sin(dot(v, vec2(127.1, 311.7))) * 43758.5453);
}
void main() {
    vec2 p = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
    vec2 qb = (p - uBgView.yz) / uBgView.x;
    float sb = uBgView.x;
    // the facet this pixel is on, as FOIL_FS finds it, and its centre in the logical view
    float size = uFacet;
    vec2 hs = vec2(1.0, 1.7320508), hp = qb / size;
    vec2 ha = mod(hp, hs) - 0.5 * hs, hb = mod(hp - 0.5 * hs, hs) - 0.5 * hs;
    vec2 hl = dot(ha, ha) < dot(hb, hb) ? ha : hb;
    vec2 id = floor((hp - hl) / (0.5 * hs) + 0.5) * 0.5 * hs; // snapped, so the hashes hold across the facet
    vec2 qc = (uBgView.yz + id * size * sb - uView.yz) / uView.x;
    float turn = hash(id), shine = hash(id + 17.0), late = hash(id + 31.0);
    float hex = max(abs(hl.x), dot(abs(hl), vec2(0.5, 0.8660254)));
    float face = clamp((0.44 - hex) * size * sb + 0.5, 0.0, 1.0); // a hairline gap between facets
    float edge = hairline(abs(0.44 - hex) * size * sb, sb * 0.7);
    float bright = shine * shine * shine; // most facets faint, a few bright
    float along = dot(qb, vec2(0.8, 0.6));
    vec3 c = vec3(0.0);
    for (int i = 0; i < ${BACKDROP_MAX_RINGS}; i++) {
        if (uGlitterColor[i].y <= 0.0) continue;
        float d = length((qc - uGlitter[i].xy) / vec2(1.3, 1.0));
        float u = (uGlitter[i].z - d) / uGlitter[i].w - 1.2 * late; // > 0: the front has passed the facet
        if (u < -0.6 || u > 5.0) continue;
        float flash = u < 0.0 ? exp(-u * u * 12.0) : exp(-1.2 * u);
        float facing = pow(0.5 + 0.5 * cos(turn * 6.2832 + u * 2.2), 6.0); // turning as it goes on glinting
        float lit = flash * bright * (0.15 + 0.85 * facing);
        vec3 col = spectrum(uGlitterColor[i].x + along * 0.32 + turn * 140.0);
        float glint = pow(facing, 10.0) * step(0.7, shine) * flash;
        c += uGlitterColor[i].y * ((col * face + 0.6 * edge * mix(col, vec3(1.0), 0.5)) * lit + vec3(1.0) * face * glint * 0.8);
    }
    gl_FragColor = vec4(c, 0.0);
}`;

// Drifting lights: one quad each, added
const ORB_VS = `
attribute vec2 aPos;
attribute vec3 aOrb;           // centre x, y, radius
attribute vec4 aColor;         // rgb, alpha at the centre
uniform vec2 uSize;
varying vec2 vOff;
varying float vR;
varying vec4 vColor;
void main() {
    vOff = aPos - aOrb.xy;
    vR = aOrb.z;
    vColor = aColor;
    gl_Position = vec4(aPos.x / uSize.x * 2.0 - 1.0, 1.0 - aPos.y / uSize.y * 2.0, 0.0, 1.0);
}`;
const ORB_FS = `
precision highp float;
varying vec2 vOff;
varying float vR;
varying vec4 vColor;
void main() {
    float a = vColor.a * max(0.0, 1.0 - length(vOff) / vR);
    gl_FragColor = vec4(vColor.rgb * a, 0.0);
}`;

// Shockwave rings (added) under the board glow (painted over). The glow is a Gaussian
// blur of the frame, as canvas shadowBlur draws it (sigma = blur / 2), computed exactly
// for a rectangle; the frame's small corner radius is ignored. Output is premultiplied
// for blending with ONE, ONE_MINUS_SRC_ALPHA.
const BOARD_FS = `
precision highp float;
uniform vec2 uSize;
uniform vec3 uView;                       // scale, offset x, offset y of the logical view
uniform vec4 uGlowRect[2];                // x0, y0, x1, y1 (a glow per board: two players have two)
uniform float uGlowSigma[2];
uniform vec4 uGlowColor[2];               // rgb, alpha (0: no glow)
uniform vec4 uRing[${BACKDROP_MAX_RINGS}];       // centre x, y, radius, line width (logical)
uniform vec4 uRingColor[${BACKDROP_MAX_RINGS}];  // core rgb, alpha (0: unused)
uniform vec3 uRingGlow[${BACKDROP_MAX_RINGS}];   // glow rgb
uniform float uRingSigma;

float erf(float x) { // Winitzki's approximation, error < 2e-4
    float x2 = x * x;
    float ax2 = 0.147 * x2;
    return sign(x) * sqrt(1.0 - exp(-x2 * (1.2732395 + ax2) / (1.0 + ax2)));
}

void main() {
    vec2 p = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
    vec2 q = (p - uView.yz) / uView.x;
    vec3 ring = vec3(0.0);
    float k = 1.0 / (uRingSigma * 1.4142136);
    for (int i = 0; i < ${BACKDROP_MAX_RINGS}; i++) {
        if (uRingColor[i].a <= 0.0) continue;
        // the ring is a circle stretched 1.6x horizontally
        float d = abs(length((q - uRing[i].xy) / vec2(1.6, 1.0)) - uRing[i].z) * uView.x;
        float hw = uRing[i].w * 0.5 * uView.x;
        float core = clamp(hw - d + 0.5, 0.0, 1.0);
        float glow = 0.5 * (erf((hw - d) * k) + erf((hw + d) * k));
        ring += uRingColor[i].a * (uRingGlow[i] * glow + uRingColor[i].rgb * core);
    }
    vec3 rgb = ring;
    float alpha = 0.0;
    for (int i = 0; i < 2; i++) { // each glow painted over what is under it
        if (uGlowColor[i].a <= 0.0) continue;
        float s = 1.0 / (uGlowSigma[i] * 1.4142136);
        float gx = 0.5 * (erf((p.x - uGlowRect[i].x) * s) - erf((p.x - uGlowRect[i].z) * s));
        float gy = 0.5 * (erf((p.y - uGlowRect[i].y) * s) - erf((p.y - uGlowRect[i].w) * s));
        float ga = uGlowColor[i].a * gx * gy;
        rgb = uGlowColor[i].rgb * ga + rgb * (1.0 - ga);
        alpha = ga + alpha * (1.0 - ga);
    }
    gl_FragColor = vec4(rgb, alpha);
}`;

// Clear ripples (Clear burst: Ripple): the finished frame, drawn onto the screen through a
// wave packet on a sheet of glass. Each ripple's surface slope across its front bends the
// lookup into the frame; nothing is added, so only the refraction shows. Red bends less and
// blue more than green (uSpread), splitting the colours at the front.
// The packet: slope = e^(-u²)·sin(3u), u = distance past the front / its width.
const REFRACT_FS = `
precision highp float;
uniform sampler2D uScene;
uniform vec2 uSize;
uniform vec3 uView;                              // scale, offset x, offset y of the logical view
uniform vec4 uWave[${BACKDROP_MAX_RINGS}];       // centre x, y, radius, packet width (logical)
uniform float uWaveAmp[${BACKDROP_MAX_RINGS}];   // largest displacement (logical; 0: unused)
uniform float uSpread;                           // how far red and blue bend apart from green

void main() {
    vec2 p = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
    vec2 q = (p - uView.yz) / uView.x;
    vec2 disp = vec2(0.0);
    for (int i = 0; i < ${BACKDROP_MAX_RINGS}; i++) {
        if (uWaveAmp[i] <= 0.0) continue;
        vec2 off = q - uWave[i].xy;
        float d = length(off);
        float u = (d - uWave[i].z) / uWave[i].w;
        if (abs(u) > 3.5) continue; // e^(-u²) is below 1/200000 past this
        float env = exp(-u * u) * smoothstep(0.0, uWave[i].w, d); // calm at the centre
        disp += off / max(d, 0.001) * env * sin(3.0 * u) * uWaveAmp[i];
    }
    vec2 dp = vec2(disp.x, -disp.y) * uView.x / uSize; // render targets are stored bottom up
    vec2 uv = gl_FragCoord.xy / uSize;
    gl_FragColor = vec4(texture2D(uScene, uv + dp * (1.0 - uSpread)).r, texture2D(uScene, uv + dp).g,
        texture2D(uScene, uv + dp * (1.0 + uSpread)).b, 1.0);
}`;

// Clear flares (Clear burst: Flare), added over the finished frame like light on the lens: a
// streak as tall as the cleared rows, falling off exponentially along x and as a Gaussian past
// its top and bottom, its white-hot core, a round bloom and three ghosts along the streak. Premultiplied, for blending with ONE, ONE.
const FLARE_FS = `
precision highp float;
uniform vec2 uSize;
uniform vec3 uView;                               // scale, offset x, offset y of the logical view
uniform vec4 uFlare[${BACKDROP_MAX_RINGS}];       // centre x, y, streak length, edge softness (logical)
uniform float uFlareHalf[${BACKDROP_MAX_RINGS}];  // half the streak's height (logical)
uniform vec4 uFlareColor[${BACKDROP_MAX_RINGS}];  // core rgb, alpha (0: unused)
uniform vec3 uFlareGlow[${BACKDROP_MAX_RINGS}];   // glow rgb

void main() {
    vec2 p = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
    vec2 q = (p - uView.yz) / uView.x;
    vec3 light = vec3(0.0);
    for (int i = 0; i < ${BACKDROP_MAX_RINGS}; i++) {
        if (uFlareColor[i].a <= 0.0) continue;
        vec2 o = q - uFlare[i].xy;
        float len = uFlare[i].z;
        float sx = abs(o.x) / len, sy = max(abs(o.y) - uFlareHalf[i], 0.0) / uFlare[i].w;
        float streak = exp(-3.0 * sx - 0.2 * sy * sy); // a halo reaching about twice as far past the edges as the core
        float core = exp(-5.0 * sx - 2.0 * sy * sy) * 30.0 / (30.0 + uFlareHalf[i]); // dimmer as it gets taller
        float b = 0.25 * len;
        float bloom = 0.5 * exp(-dot(o, o) / (b * b));
        vec2 g1 = o - vec2(-0.15 * len, 0.0), g2 = o - vec2(0.22 * len, 0.0), g3 = o - vec2(0.38 * len, 0.0);
        float ghosts = exp(-dot(g1, g1) / 324.0) + exp(-dot(g2, g2) / 100.0) + exp(-dot(g3, g3) / 676.0);
        light += uFlareColor[i].a * (uFlareGlow[i] * (0.6 * streak + bloom + 0.25 * ghosts) + uFlareColor[i].rgb * core);
    }
    gl_FragColor = vec4(light, 0.0);
}`;

class GLBackdrop {
    constructor(renderer) {
        this.r = renderer;
        this.gl = renderer.gl;
        this.background = null;
        // uniform arrays, filled each frame
        this.blob = new Float32Array(9);
        this.blobColor = new Float32Array(12);
        this.shade = new Float32Array(6);
        this.ring = new Float32Array(BACKDROP_MAX_RINGS * 4);
        this.ringColor = new Float32Array(BACKDROP_MAX_RINGS * 4);
        this.ringGlow = new Float32Array(BACKDROP_MAX_RINGS * 3);
        this.glowRect = new Float32Array(2 * 4);
        this.glowSigma = new Float32Array(2);
        this.glowColor = new Float32Array(2 * 4);
        this.waveAmp = new Float32Array(BACKDROP_MAX_RINGS);
        this.burstColor = new Float32Array(BACKDROP_MAX_RINGS * 4);
        this.bump = new Float32Array(BACKDROP_MAX_BUMPS * 4);
        this.beam = new Float32Array(2 * 4);
        this.occluder = new Float32Array(2 * 4);
        this.bumpColor = new Float32Array(BACKDROP_MAX_BUMPS * 3);
        renderer.restoreHandlers.push(() => this.setup());
        this.setup();
    }

    setup() {
        const gl = this.gl;
        this.wash = this.r.program(FULLSCREEN_VS, WASH_FS, [["aPos", 2]]);
        this.lines = this.r.program(FULLSCREEN_VS, LINES_FS, [["aPos", 2]]);
        this.foil = this.r.program(FULLSCREEN_VS, FOIL_FS, [["aPos", 2]]);
        this.water = this.r.program(FULLSCREEN_VS, WATER_FS, [["aPos", 2]]);
        this.beamProgram = this.r.program(FULLSCREEN_VS, BEAMS_FS, [["aPos", 2]]);
        this.contour = this.r.program(FULLSCREEN_VS, CONTOUR_FS, [["aPos", 2]]);
        this.shaftProgram = this.r.program(FULLSCREEN_VS, SHAFTS_FS, [["aPos", 2]]);
        this.glitter = this.r.program(FULLSCREEN_VS, GLITTER_FS, [["aPos", 2]]);
        this.orbProgram = this.r.program(ORB_VS, ORB_FS, [["aPos", 2], ["aOrb", 3], ["aColor", 4]]);
        this.board = this.r.program(FULLSCREEN_VS, BOARD_FS, [["aPos", 2]]);
        this.refraction = this.r.program(FULLSCREEN_VS, REFRACT_FS, [["aPos", 2]]);
        this.flare = this.r.program(FULLSCREEN_VS, FLARE_FS, [["aPos", 2]]);
        // one triangle covering the screen
        this.fullscreen = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.fullscreen);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        this.orbBuffer = gl.createBuffer();
        this.orbData = new Float32Array(0);
    }

    // The static backdrop picture (a new canvas the size of the screen, drawn 1:1)
    setBackground(canvas) {
        this.r.releaseTexture(this.background);
        this.background = this.r.texture(canvas);
    }

    drawFullscreen(p) {
        const gl = this.gl;
        const loc = p.attribs[0].loc; // aPos
        gl.bindBuffer(gl.ARRAY_BUFFER, this.fullscreen);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.disableVertexAttribArray(loc);
    }

    // scene: { bgView: [scale, offX, offY], view: [scale, offX, offY],
    //   blobs: [{x, y, r, rgb, a}] (backdrop logical), orbs: [{x, y, r, rgb, a}] (same),
    //   nebula: 0 or how much noise shapes the blobs into nebulae, time (seconds, their flow),
    //   shade: [[x, y, r]] (backdrop logical, at most 2) circles in front of the blobs,
    //   lines: null or {spacing, ink: [r, g, b, a], bumps: [{x, y, r, amp, rgb}]} (same),
    //   foil: null or {hue, band, strength, time, facets: [x, y, width, fade]} (same),
    //   water: null or {rgb, strength, time},
    //   beams: null or {lights: up to two of {x, y, strength, radius, occluder: [cx, cy, hw, hh]} (view logical), rgb, time},
    //   shafts: [{x, y, r, spread, rgb, a}] (view logical; Engine.shaftShapes),
    //   contours: [{x, y, r, width, hue, a, seed, spacing}] (view logical; Engine.contourShapes),
    //   glitter: [{x, y, r, width, hue, a}] (same; Engine.glitterShapes), facet: the glitter's facet width (backdrop logical),
    //   rings: [{x, y, r, width, a, rgb, glowRgb}] (view logical), ringSigma,
    //   glows: up to two of {rect: [x0, y0, x1, y1], sigma, rgb, a}, a board glow each }
    render(scene) {
        const gl = this.gl;
        this.r.flush(); // anything queued before goes underneath
        const width = this.r.width, height = this.r.height;
        const [bs, bx, by] = scene.bgView;

        // Backdrop picture and colour wash
        let p = this.wash;
        gl.useProgram(p.prog);
        gl.disable(gl.BLEND);
        gl.uniform2f(p.u("uSize"), width, height);
        gl.uniform3fv(p.u("uBgView"), scene.bgView);
        this.r.bindTexture(this.background, 0);
        gl.uniform1i(p.u("uBackground"), 0);
        const blob = this.blob, blobColor = this.blobColor;
        blobColor.fill(0); // unused blobs add nothing
        for (let i = 0; i < scene.blobs.length; i++) {
            const b = scene.blobs[i];
            blob[i * 3] = b.x; blob[i * 3 + 1] = b.y; blob[i * 3 + 2] = b.r;
            blobColor.set(b.rgb, i * 4);
            blobColor[i * 4 + 3] = b.a;
        }
        gl.uniform3fv(p.u("uBlob"), blob);
        gl.uniform4fv(p.u("uBlobColor"), blobColor);
        gl.uniform1f(p.u("uNebula"), scene.nebula || 0);
        gl.uniform1f(p.u("uTime"), scene.time || 0);
        const shade = this.shade;
        shade.fill(0); // radius 0: none
        for (let i = 0; i < Math.min(scene.shade.length, 2); i++) shade.set(scene.shade[i], i * 3);
        gl.uniform3fv(p.u("uShade"), shade);
        this.drawFullscreen(p);

        gl.enable(gl.BLEND);

        // Field lines
        if (scene.lines) {
            const { spacing, ink, bumps } = scene.lines;
            p = this.lines;
            gl.useProgram(p.prog);
            gl.blendFunc(gl.ONE, gl.ONE);
            gl.uniform2f(p.u("uSize"), width, height);
            gl.uniform3fv(p.u("uBgView"), scene.bgView);
            const bump = this.bump, bumpColor = this.bumpColor;
            bump.fill(0); // height 0: unused
            for (let i = 0; i < Math.min(bumps.length, BACKDROP_MAX_BUMPS); i++) {
                const b = bumps[i];
                bump[i * 4] = b.x; bump[i * 4 + 1] = b.y; bump[i * 4 + 2] = b.r; bump[i * 4 + 3] = b.amp;
                bumpColor[i * 3] = b.rgb[0]; bumpColor[i * 3 + 1] = b.rgb[1]; bumpColor[i * 3 + 2] = b.rgb[2];
            }
            gl.uniform4fv(p.u("uBump"), bump);
            gl.uniform3fv(p.u("uBumpColor"), bumpColor);
            gl.uniform4f(p.u("uInk"), ink[0], ink[1], ink[2], ink[3]);
            gl.uniform1f(p.u("uSpacing"), spacing);
            this.drawFullscreen(p);
        }

        // Holographic foil
        if (scene.foil) {
            const { hue, band, strength, time, facets } = scene.foil;
            p = this.foil;
            gl.useProgram(p.prog);
            gl.blendFunc(gl.ONE, gl.ONE);
            gl.uniform2f(p.u("uSize"), width, height);
            gl.uniform3fv(p.u("uBgView"), scene.bgView);
            gl.uniform4f(p.u("uFoil"), hue, band, strength, time);
            gl.uniform4f(p.u("uFacets"), facets[0], facets[1], facets[2], facets[3]);
            this.drawFullscreen(p);
        }

        // Water's light shafts and caustics
        if (scene.water) {
            const { rgb, strength, time } = scene.water;
            p = this.water;
            gl.useProgram(p.prog);
            gl.blendFunc(gl.ONE, gl.ONE);
            gl.uniform2f(p.u("uSize"), width, height);
            gl.uniform3fv(p.u("uBgView"), scene.bgView);
            gl.uniform3f(p.u("uWaterRgb"), rgb[0], rgb[1], rgb[2]);
            gl.uniform2f(p.u("uWater"), strength, time);
            this.drawFullscreen(p);
        }

        // Light rays in fog
        if (scene.beams) {
            const { lights, rgb, time } = scene.beams;
            p = this.beamProgram;
            gl.useProgram(p.prog);
            gl.blendFunc(gl.ONE, gl.ONE);
            gl.uniform2f(p.u("uSize"), width, height);
            gl.uniform3fv(p.u("uView"), scene.view);
            const beam = this.beam, occluder = this.occluder;
            beam.fill(0); // strength 0: unused
            for (let i = 0; i < Math.min(lights.length, 2); i++) {
                const l = lights[i];
                beam[i * 4] = l.x; beam[i * 4 + 1] = l.y; beam[i * 4 + 2] = l.strength; beam[i * 4 + 3] = l.radius;
                occluder.set(l.occluder, i * 4);
            }
            gl.uniform4fv(p.u("uBeam"), beam);
            gl.uniform4fv(p.u("uOccluder"), occluder);
            gl.uniform3f(p.u("uBeamRgb"), rgb[0], rgb[1], rgb[2]);
            gl.uniform1f(p.u("uTime"), time);
            this.drawFullscreen(p);
        }

        // Clear shafts, contours and glitter
        if (scene.shafts.length) {
            p = this.shaftProgram;
            gl.useProgram(p.prog);
            gl.blendFunc(gl.ONE, gl.ONE);
            gl.uniform2f(p.u("uSize"), width, height);
            gl.uniform3fv(p.u("uView"), scene.view);
            gl.uniform1f(p.u("uTime"), scene.time || 0);
            const shape = this.ring, color = this.burstColor;
            color.fill(0); // alpha 0: slot unused
            scene.shafts.slice(-BACKDROP_MAX_RINGS).forEach((f, i) => {
                shape[i * 4] = f.x; shape[i * 4 + 1] = f.y; shape[i * 4 + 2] = f.r; shape[i * 4 + 3] = f.spread;
                color.set(f.rgb, i * 4);
                color[i * 4 + 3] = f.a;
            });
            gl.uniform4fv(p.u("uShaft"), shape);
            gl.uniform4fv(p.u("uShaftColor"), color);
            this.drawFullscreen(p);
        }
        if (scene.contours.length) {
            p = this.contour;
            gl.useProgram(p.prog);
            gl.blendFunc(gl.ONE, gl.ONE);
            gl.uniform2f(p.u("uSize"), width, height);
            gl.uniform3fv(p.u("uView"), scene.view);
            const shape = this.ring, color = this.burstColor;
            color.fill(0); // alpha 0: slot unused
            scene.contours.slice(-BACKDROP_MAX_RINGS).forEach((c, i) => {
                shape[i * 4] = c.x; shape[i * 4 + 1] = c.y; shape[i * 4 + 2] = c.r; shape[i * 4 + 3] = c.width;
                color[i * 4] = c.hue; color[i * 4 + 1] = c.a; color[i * 4 + 2] = c.seed; color[i * 4 + 3] = c.spacing;
            });
            gl.uniform4fv(p.u("uContour"), shape);
            gl.uniform4fv(p.u("uContourColor"), color);
            this.drawFullscreen(p);
        }
        if (scene.glitter.length) {
            p = this.glitter;
            gl.useProgram(p.prog);
            gl.blendFunc(gl.ONE, gl.ONE);
            gl.uniform2f(p.u("uSize"), width, height);
            gl.uniform3fv(p.u("uView"), scene.view);
            gl.uniform3fv(p.u("uBgView"), scene.bgView);
            gl.uniform1f(p.u("uFacet"), scene.facet);
            const shape = this.ring, color = this.burstColor;
            color.fill(0); // alpha 0: slot unused
            scene.glitter.slice(-BACKDROP_MAX_RINGS).forEach((g, i) => {
                shape[i * 4] = g.x; shape[i * 4 + 1] = g.y; shape[i * 4 + 2] = g.r; shape[i * 4 + 3] = g.width;
                color[i * 2] = g.hue; color[i * 2 + 1] = g.a;
            });
            gl.uniform4fv(p.u("uGlitter"), shape);
            gl.uniform2fv(p.u("uGlitterColor"), color.subarray(0, BACKDROP_MAX_RINGS * 2));
            this.drawFullscreen(p);
        }

        // Drifting lights
        if (scene.orbs.length) {
            p = this.orbProgram;
            gl.useProgram(p.prog);
            gl.blendFunc(gl.ONE, gl.ONE);
            gl.uniform2f(p.u("uSize"), width, height);
            const stride = p.stride; // pos 2, orb 3, colour 4
            const need = scene.orbs.length * 6 * stride;
            if (this.orbData.length < need) this.orbData = new Float32Array(need);
            const d = this.orbData;
            let n = 0;
            for (const o of scene.orbs) {
                const cx = bx + o.x * bs, cy = by + o.y * bs, r = o.r * bs;
                for (let k = 0; k < 12; k += 2) {
                    d[n++] = cx + SHAPE_CORNERS[k] * r; d[n++] = cy + SHAPE_CORNERS[k + 1] * r;
                    d[n++] = cx; d[n++] = cy; d[n++] = r;
                    d[n++] = o.rgb[0]; d[n++] = o.rgb[1]; d[n++] = o.rgb[2]; d[n++] = o.a;
                }
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, this.orbBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, d.subarray(0, n), gl.DYNAMIC_DRAW);
            for (const a of p.attribs) {
                gl.enableVertexAttribArray(a.loc);
                gl.vertexAttribPointer(a.loc, a.size, gl.FLOAT, false, stride * 4, a.offset * 4);
            }
            gl.drawArrays(gl.TRIANGLES, 0, n / stride);
            for (const a of p.attribs) gl.disableVertexAttribArray(a.loc);
        }

        // Shockwaves and board glow, only inside the box they can light
        const rings = scene.rings.slice(-BACKDROP_MAX_RINGS);
        const box = this.boardPassBounds(scene, rings);
        if (box) {
            p = this.board;
            gl.useProgram(p.prog);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.uniform2f(p.u("uSize"), width, height);
            gl.uniform3fv(p.u("uView"), scene.view);
            const ring = this.ring, ringColor = this.ringColor, ringGlow = this.ringGlow;
            ringColor.fill(0); // alpha 0: slot unused
            for (let i = 0; i < rings.length; i++) {
                const r = rings[i];
                ring[i * 4] = r.x; ring[i * 4 + 1] = r.y; ring[i * 4 + 2] = r.r; ring[i * 4 + 3] = r.width;
                ringColor.set(r.rgb, i * 4);
                ringColor[i * 4 + 3] = r.a;
                ringGlow.set(r.glowRgb, i * 3);
            }
            gl.uniform4fv(p.u("uRing"), ring);
            gl.uniform4fv(p.u("uRingColor"), ringColor);
            gl.uniform3fv(p.u("uRingGlow"), ringGlow);
            gl.uniform1f(p.u("uRingSigma"), scene.ringSigma);
            const glowRect = this.glowRect, glowSigma = this.glowSigma, glowColor = this.glowColor;
            glowSigma.fill(1);
            glowColor.fill(0); // alpha 0: no glow
            scene.glows.slice(0, 2).forEach((glow, i) => {
                glowRect.set(glow.rect, i * 4);
                glowSigma[i] = glow.sigma;
                glowColor.set(glow.rgb, i * 4);
                glowColor[i * 4 + 3] = glow.a;
            });
            gl.uniform4fv(p.u("uGlowRect"), glowRect);
            gl.uniform1fv(p.u("uGlowSigma"), glowSigma);
            gl.uniform4fv(p.u("uGlowColor"), glowColor);
            gl.enable(gl.SCISSOR_TEST);
            gl.scissor(box[0], height - box[3], box[2] - box[0], box[3] - box[1]); // GL counts from the bottom
            this.drawFullscreen(p);
            gl.disable(gl.SCISSOR_TEST);
        }
    }

    // The frame drawn into layer (a render target the size of the screen) onto the screen,
    // through the clear ripples: [{x, y, r, width, amp}] (view logical, see
    // Engine.rippleShapes). view: [scale, offX, offY] of the logical view. spread: how far red
    // and blue bend apart from green (0: no colour split).
    refract(layer, view, waves, spread) {
        const gl = this.gl;
        this.r.flush();
        waves = waves.slice(-BACKDROP_MAX_RINGS);
        const p = this.refraction;
        gl.useProgram(p.prog);
        gl.disable(gl.BLEND);
        gl.uniform2f(p.u("uSize"), this.r.width, this.r.height);
        gl.uniform3fv(p.u("uView"), view);
        this.r.bindTexture(layer, 0);
        gl.uniform1i(p.u("uScene"), 0);
        const wave = this.ring, amp = this.waveAmp;
        amp.fill(0); // 0: slot unused
        for (let i = 0; i < waves.length; i++) {
            const w = waves[i];
            wave[i * 4] = w.x; wave[i * 4 + 1] = w.y; wave[i * 4 + 2] = w.r; wave[i * 4 + 3] = w.width;
            amp[i] = w.amp;
        }
        gl.uniform4fv(p.u("uWave"), wave);
        gl.uniform1fv(p.u("uWaveAmp"), amp);
        gl.uniform1f(p.u("uSpread"), spread);
        this.drawFullscreen(p);
        gl.enable(gl.BLEND);
    }

    // The clear flares, added over what is drawn: [{x, y, r, half, width, a, rgb, glowRgb}] (view
    // logical; r is the streak's length, half half its height, width its edges' softness, see
    // Engine.flareShapes).
    // view: [scale, offX, offY] of the logical view.
    flares(view, flares) {
        const gl = this.gl;
        this.r.flush();
        flares = flares.slice(-BACKDROP_MAX_RINGS);
        const [s, ox, oy] = view;
        let y0 = Infinity, y1 = -Infinity;
        const p = this.flare;
        gl.useProgram(p.prog);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.uniform2f(p.u("uSize"), this.r.width, this.r.height);
        gl.uniform3fv(p.u("uView"), view);
        const flare = this.ring, half = this.waveAmp, color = this.ringColor, glow = this.ringGlow;
        color.fill(0); // alpha 0: slot unused
        for (let i = 0; i < flares.length; i++) {
            const f = flares[i];
            flare[i * 4] = f.x; flare[i * 4 + 1] = f.y; flare[i * 4 + 2] = f.r; flare[i * 4 + 3] = f.width;
            half[i] = f.half;
            color.set(f.rgb, i * 4);
            color[i * 4 + 3] = f.a;
            glow.set(f.glowRgb, i * 3);
            // the bloom and ghosts end well inside 2.5 bloom radii, the streak's halo 7 softness lengths past its edges
            const reach = Math.max(f.half + 7 * f.width, 2.5 * 0.25 * f.r) * s, cy = oy + f.y * s;
            if (f.a > 0) { y0 = Math.min(y0, cy - reach); y1 = Math.max(y1, cy + reach); }
        }
        y0 = Math.max(0, Math.floor(y0)); y1 = Math.min(this.r.height, Math.ceil(y1));
        if (y1 <= y0) return;
        gl.uniform4fv(p.u("uFlare"), flare);
        gl.uniform1fv(p.u("uFlareHalf"), half);
        gl.uniform4fv(p.u("uFlareColor"), color);
        gl.uniform3fv(p.u("uFlareGlow"), glow);
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(0, this.r.height - y1, this.r.width, y1 - y0); // the streak crosses the screen; GL counts from the bottom
        this.drawFullscreen(p);
        gl.disable(gl.SCISSOR_TEST);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }

    // Device-pixel box [x0, y0, x1, y1] around the board glow and the rings, 4 sigma past
    // their edges (beyond that they add under 1/10000), or null when they draw nothing
    boardPassBounds(scene, rings) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        const add = (ax, ay, bx, by) => {
            x0 = Math.min(x0, ax); y0 = Math.min(y0, ay);
            x1 = Math.max(x1, bx); y1 = Math.max(y1, by);
        };
        for (const glow of scene.glows) {
            if (glow.a <= 0) continue;
            const m = 4 * glow.sigma;
            add(glow.rect[0] - m, glow.rect[1] - m, glow.rect[2] + m, glow.rect[3] + m);
        }
        const [s, ox, oy] = scene.view;
        for (const ring of rings) {
            if (ring.a <= 0) continue;
            // logical units before the ring's 1.6x horizontal stretch; the blur is in device pixels
            const reach = ring.r + ring.width / 2 + 4 * scene.ringSigma / s;
            const cx = ox + ring.x * s, cy = oy + ring.y * s;
            add(cx - reach * 1.6 * s, cy - reach * s, cx + reach * 1.6 * s, cy + reach * s);
        }
        x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
        x1 = Math.min(this.r.width, Math.ceil(x1)); y1 = Math.min(this.r.height, Math.ceil(y1));
        return x1 > x0 && y1 > y0 ? [x0, y0, x1, y1] : null;
    }
}
