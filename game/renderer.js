// WebGL renderer for everything on screen. A small canvas-like API (transform stack,
// global alpha, normal or additive blending) batches textured quads and anti-aliased
// rounded rectangles into as few draw calls as possible. Canvas 2D is only used offscreen,
// to rasterise things once into textures: text, block sprites and the backdrop picture.
// Coordinates are device pixels, y down, after the current transform (uniform scale s,
// then offset x, y). Colours are CSS strings or [r, g, b, a] arrays in 0..1.

// Texture coordinates are homogeneous (u·q, v·q, q) so quads in perspective map correctly;
// q is 1 for flat drawing
const QUAD_VS = `
attribute vec2 aPos;
attribute vec3 aUv;
attribute vec4 aTint;
uniform vec2 uSize;
varying vec3 vUv;
varying vec4 vTint;
void main() {
    vUv = aUv;
    vTint = aTint;
    gl_Position = vec4(aPos.x / uSize.x * 2.0 - 1.0, 1.0 - aPos.y / uSize.y * 2.0, 0.0, 1.0);
}`;
// Textures are premultiplied; the tint is the global alpha (premultiplied white)
const IMAGE_FS = `
precision mediump float;
uniform sampler2D uTex;
varying vec3 vUv;
varying vec4 vTint;
void main() { gl_FragColor = texture2D(uTex, vUv.xy / vUv.z) * vTint; }`;

// Rounded rectangle with fill and centred stroke, as canvas fill() then stroke() draw it.
// Distances in device pixels from the rectangle's centre; radii per corner (tl, tr, br, bl).
// Colours arrive premultiplied; the fill is interpolated per vertex for vertical gradients.
const SHAPE_VS = `
attribute vec2 aPos;
attribute vec2 aLocal;
attribute vec2 aHalf;
attribute vec4 aRadii;
attribute float aLine;
attribute vec4 aFill;
attribute vec4 aStroke;
uniform vec2 uSize;
varying vec2 vLocal;
varying vec2 vHalf;
varying vec4 vRadii;
varying float vLine;
varying vec4 vFill;
varying vec4 vStroke;
void main() {
    vLocal = aLocal; vHalf = aHalf; vRadii = aRadii; vLine = aLine; vFill = aFill; vStroke = aStroke;
    gl_Position = vec4(aPos.x / uSize.x * 2.0 - 1.0, 1.0 - aPos.y / uSize.y * 2.0, 0.0, 1.0);
}`;
const SHAPE_FS = `
precision highp float;
varying vec2 vLocal;
varying vec2 vHalf;
varying vec4 vRadii;
varying float vLine;
varying vec4 vFill;
varying vec4 vStroke;
void main() {
    vec2 p = vLocal;
    float r = p.x > 0.0 ? (p.y > 0.0 ? vRadii.z : vRadii.y) : (p.y > 0.0 ? vRadii.w : vRadii.x);
    vec2 q = abs(p) - vHalf + r;
    float d = min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
    float fa = clamp(0.5 - d, 0.0, 1.0);
    // lines thinner than a pixel get partial coverage instead of disappearing
    float sa = vLine > 0.0 ? clamp(min(vLine * 0.5 + 0.5 - abs(d), vLine), 0.0, 1.0) : 0.0;
    gl_FragColor = vStroke * sa + max(vFill, 0.0) * fa * (1.0 - sa);
}`;

// 3D blocks (block styles with mesh: true): one cell's block as a cushion standing out of the
// field towards the camera, its rim rounded with the bevel radius and its sides straight below it.
// A side merged with a neighbour of the same colour runs flat to the cell's edge, so neighbours
// join into one moulded piece; an inner corner whose diagonal cell is free gets a rounded notch.
// Cell units: the cell is 0..1 across, x right, y down, z (height) towards the camera.
const BLOCK_COMMON = `
uniform vec4 uBox;   // the block's outline in its cell: left, top, right, bottom
uniform vec4 uOpen;  // 1 for a free side, 0 for one merged with its neighbour: left, right, top, bottom
uniform vec4 uNotch; // inner corners (top left, top right, bottom right, bottom left): 1 for a notch
uniform vec3 uShape; // bevel radius, height, gap between free neighbours
uniform vec4 uTurn;  // field tilt: cos and sin about the x axis, then the y axis
// How far p is inside the block's outline (negative outside)
float blockDist(vec2 p) {
    const float BIG = 10.0;
    float R = uShape.x, G = uShape.z;
    float ex = min(mix(BIG, p.x - uBox.x, uOpen.x), mix(BIG, uBox.z - p.x, uOpen.y));
    float ey = min(mix(BIG, p.y - uBox.y, uOpen.z), mix(BIG, uBox.w - p.y, uOpen.w));
    vec2 q = R - vec2(ex, ey);
    float d = R - length(max(q, 0.0)) - min(max(q.x, q.y), 0.0);
    d = min(d, mix(BIG, length(max(p - G, 0.0)), uNotch.x));
    d = min(d, mix(BIG, length(max(vec2(1.0 - G - p.x, p.y - G), 0.0)), uNotch.y));
    d = min(d, mix(BIG, length(max(1.0 - G - p, 0.0)), uNotch.z));
    d = min(d, mix(BIG, length(max(vec2(p.x - G, 1.0 - G - p.y), 0.0)), uNotch.w));
    return d;
}
vec2 blockGrad(vec2 p) {
    const float E = 0.002;
    return vec2(blockDist(p + vec2(E, 0.0)) - blockDist(p - vec2(E, 0.0)),
                blockDist(p + vec2(0.0, E)) - blockDist(p - vec2(0.0, E))) / (2.0 * E);
}
// Height of the top at inset d: a quarter circle from the top of the sides up to the flat top
float blockHeight(float d) {
    float R = uShape.x, k = R - clamp(d, 0.0, R);
    return uShape.y - R + sqrt(max(R * R - k * k, 0.0));
}
// A board-space vector turned with the field (about y, then x)
vec3 turn(vec3 v) {
    float x = v.x * uTurn.z + v.z * uTurn.w, z = -v.x * uTurn.w + v.z * uTurn.z;
    return vec3(x, v.y * uTurn.x - z * uTurn.y, v.y * uTurn.y + z * uTurn.x);
}`;
const BLOCK_VS = `
attribute vec3 aGrid; // u, v across the block (0..1); z 1 for the foot of the sides
uniform vec4 uCell;   // x, y and size of the cell (logical units)
uniform vec2 uSquash; // scale across (about the cell's centre, free sides only) and of the height
uniform vec4 uCam;    // field centre x, y (logical), camera distance, depth offset
uniform vec2 uShift;  // the field's shake (logical units)
uniform vec3 uView;   // logical units to pixels: scale, x and y offset
uniform vec2 uSize;
varying vec2 vP;
varying vec3 vWorld;
varying float vZ;
varying float vBoardY;
${BLOCK_COMMON}
void main() {
    vec2 p = vec2(mix(uBox.x, uBox.z, aGrid.x), mix(uBox.y, uBox.w, aGrid.y));
    float d = blockDist(p);
    vec2 g = blockGrad(p);
    if (d < 0.0 && dot(g, g) > 0.0) p -= normalize(g) * d; // outside a rounded corner: onto the outline
    float z = aGrid.z > 0.5 && d < 0.001 ? 0.0 : blockHeight(d);
    vP = p;
    vZ = z;
    // squashed across, only on free sides: merged ones stay on the cell's edge, so no seams open
    vec2 free = vec2(p.x < 0.5 ? uOpen.x : uOpen.y, p.y < 0.5 ? uOpen.z : uOpen.w);
    vec2 b = uCell.xy + (p + (p - 0.5) * (uSquash.x - 1.0) * free) * uCell.z;
    vBoardY = b.y;
    vec3 w = turn(vec3(b - uCam.xy, z * uSquash.y * uCell.z));
    w.z += uCam.w;
    vWorld = w;
    float q = (uCam.z - w.z) / uCam.z; // 1 / perspective scale
    vec2 a = vec2(2.0 * uView.x / uSize.x, -2.0 * uView.x / uSize.y);
    vec2 o = vec2(2.0 * uView.y / uSize.x - 1.0, 1.0 - 2.0 * uView.z / uSize.y);
    gl_Position = vec4(((uCam.xy + uShift) * a + o) * q + w.xy * a, 0.0, q);
}`;
// Moulded plastic: diffuse light wrapping round the rims, a sharp highlight and a broad sheen,
// a rim of the colour's light at grazing angles, darker towards the foot of the sides
const BLOCK_FS = `
precision highp float;
uniform vec2 uSquash;
uniform vec4 uCam;
uniform vec3 uLight;  // towards the light (world)
uniform vec2 uClipY;  // drawn only between these field rows (logical y)
uniform vec3 uBase;   // colours (sRGB)
uniform vec3 uGlow;
uniform vec4 uState;  // falling piece highlight, flash, alpha
varying vec2 vP;
varying vec3 vWorld;
varying float vZ;
varying float vBoardY;
${BLOCK_COMMON}
void main() {
    if (vBoardY < uClipY.x || vBoardY > uClipY.y) discard;
    float R = uShape.x, k = R - clamp(blockDist(vP), 0.0, R);
    vec3 n = vec3(-blockGrad(vP) * k, sqrt(max(R * R - k * k, 0.0)));
    n = normalize(turn(normalize(vec3(n.xy / uSquash.x, n.z / uSquash.y))));
    vec3 v = normalize(vec3(0.0, 0.0, uCam.z) - vWorld);
    vec3 h = normalize(uLight + v);
    vec3 base = pow(uBase, vec3(2.2)), glow = pow(uGlow, vec3(2.2));
    float nl = dot(n, uLight), nh = max(dot(n, h), 0.0);
    float wrap = max((nl + 0.4) / 1.4, 0.0);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    float lit = mix(0.8, 1.0, uState.x);
    vec3 c = base * (0.2 + 0.95 * wrap) * lit;
    c *= mix(0.45, 1.0, smoothstep(0.0, uShape.y - R + 0.05, vZ)); // contact shade at the foot
    c += glow * fres * 0.45;
    c += vec3(pow(nh, 90.0) * 0.85 + pow(nh, 14.0) * 0.1) * mix(0.75, 1.0, uState.x);
    c += glow * (0.08 * uState.x + 0.55 * uState.y);
    gl_FragColor = vec4(pow(c, vec3(1.0 / 2.2)) * uState.z, uState.z);
}`;
// The block mesh's grid lines across the block, closer together on the rounded rim
const BLOCK_GRID = (() => {
    const rim = [0, 1, 2, 3, 4, 5, 6].map(k => 0.33 * (1 - Math.cos(k * Math.PI / 12)));
    return [...rim, 0.5, ...rim.slice().reverse().map(u => 1 - u)];
})();

const IMAGE_STRIDE = 9;  // pos 2, uvq 3, tint 4
const SHAPE_STRIDE = 19; // pos 2, local 2, half 2, radii 4, line 1, fill 4, stroke 4
const SHAPE_CORNERS = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]; // two triangles, x and y signs
// Colours of the shape being written (shape() runs hundreds of times a frame: no garbage)
const SHAPE_TOP = new Float32Array(4), SHAPE_BOTTOM = new Float32Array(4);
const SHAPE_STROKE = new Float32Array(4), SHAPE_SCRATCH = new Float32Array(4);

// CSS hsl() to [r, g, b] in 0..1; h in degrees, s and l in percent
function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s /= 100; l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
        const k = (n + h / 30) % 12;
        return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return [f(0), f(8), f(4)];
}

function hsla(h, s, l, a = 1) {
    return [...hslToRgb(h, s, l), a];
}

// CSS colour (#rgb, #rrggbb, #rrggbbaa, rgb(a)(), hsl(a)()) to [r, g, b, a] in 0..1
const COLOR_CACHE = new Map();
function parseColor(css) {
    if (Array.isArray(css)) return css;
    let c = COLOR_CACHE.get(css);
    if (c) return c;
    if (css[0] === "#") {
        let hex = css.slice(1);
        if (hex.length <= 4) hex = [...hex].map(ch => ch + ch).join("");
        const v = (i) => parseInt(hex.slice(i, i + 2), 16) / 255;
        c = [v(0), v(2), v(4), hex.length >= 8 ? v(6) : 1];
    } else {
        const m = css.match(/^(rgba?|hsla?)\(([^)]*)\)$/);
        const n = m ? m[2].split(",").map(parseFloat) : [0, 0, 0];
        const a = n.length > 3 ? n[3] : 1;
        c = m && m[1].startsWith("hsl") ? hsla(n[0], n[1], n[2], a) : [n[0] / 255, n[1] / 255, n[2] / 255, a];
    }
    if (COLOR_CACHE.size > 512) COLOR_CACHE.clear(); // computed colours would grow it forever
    COLOR_CACHE.set(css, c);
    return c;
}

class GLRenderer {
    // A working renderer, or null when WebGL (or highp in fragment shaders) is unavailable
    static create(canvas) {
        try {
            const r = new GLRenderer(canvas);
            return r.ok ? r : null;
        } catch (e) {
            return null;
        }
    }

    constructor(canvas) {
        this.canvas = canvas;
        this.ok = false;
        this.gen = 0;           // bumped on context restore: textures upload again lazily
        this.restoreHandlers = [];
        this.trash = [];        // textures released this frame, deleted after the flush
        this.screen = null;     // render target standing in for the screen (setScreen)
        this.data = new Float32Array(1 << 16);
        this.n = 0;             // floats in the current batch
        this.batch = { prog: null, tex: null, blend: null };
        this.resetState();
        this.gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false });
        if (!this.gl) return;
        // While the context is lost nothing is drawn; on restore everything is rebuilt
        canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); this.ok = false; });
        canvas.addEventListener("webglcontextrestored", () => {
            try {
                this.setup();
                this.gen++;
                for (const f of this.restoreHandlers) f();
            } catch (e) { this.ok = false; }
        });
        this.setup();
    }

    setup() {
        const gl = this.gl;
        this.imageProgram = this.program(QUAD_VS, IMAGE_FS,
            [["aPos", 2], ["aUv", 3], ["aTint", 4]]);
        this.shapeProgram = this.program(SHAPE_VS, SHAPE_FS,
            [["aPos", 2], ["aLocal", 2], ["aHalf", 2], ["aRadii", 4], ["aLine", 1], ["aFill", 4], ["aStroke", 4]]);
        this.blockProgram = this.program(BLOCK_VS, BLOCK_FS, [["aGrid", 3]]);
        this.buildBlockMesh();
        this.buffer = gl.createBuffer();
        this.n = 0;
        this.ok = true;
    }

    // The 3D block's mesh: a grid over the top (BLOCK_GRID lines each way) and its outer ring
    // again at the foot, for the sides. Triangles are wound to face outwards (back faces culled).
    buildBlockMesh() {
        const gl = this.gl, g = BLOCK_GRID, n = g.length;
        const verts = [];
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) verts.push(g[i], g[j], 0);
        const ring = [];
        for (let i = 0; i < n - 1; i++) ring.push(i);                       // top edge, left to right
        for (let j = 0; j < n - 1; j++) ring.push(j * n + n - 1);           // right edge, downwards
        for (let i = n - 1; i > 0; i--) ring.push((n - 1) * n + i);         // bottom edge, to the left
        for (let j = n - 1; j > 0; j--) ring.push(j * n);                   // left edge, upwards
        const foot = verts.length / 3;
        for (const k of ring) verts.push(verts[k * 3], verts[k * 3 + 1], 1);
        // Nominal positions (top at height 1) to wind each triangle: counter-clockwise on the
        // screen (y up there) when its outward normal faces the camera
        const pos = (k) => [verts[k * 3], -verts[k * 3 + 1], 1 - verts[k * 3 + 2]];
        const index = [];
        const tri = (a, b, c, out) => {
            const [pa, pb, pc] = [a, b, c].map(pos);
            const u = pb.map((v, i) => v - pa[i]), w = pc.map((v, i) => v - pa[i]);
            const cross = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
            if (cross[0] * out[0] + cross[1] * out[1] + cross[2] * out[2] < 0) index.push(a, c, b);
            else index.push(a, b, c);
        };
        for (let j = 0; j < n - 1; j++) {
            for (let i = 0; i < n - 1; i++) {
                const a = j * n + i;
                tri(a, a + 1, a + n, [0, 0, 1]);
                tri(a + 1, a + n + 1, a + n, [0, 0, 1]);
            }
        }
        ring.forEach((k, m) => {
            const k2 = ring[(m + 1) % ring.length], f = foot + m, f2 = foot + (m + 1) % ring.length;
            const out = [(verts[k * 3] + verts[k2 * 3]) / 2 - 0.5, -((verts[k * 3 + 1] + verts[k2 * 3 + 1]) / 2 - 0.5), 0];
            tri(k, k2, f, out);
            tri(k2, f2, f, out);
        });
        this.blockVerts = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.blockVerts);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
        this.blockIndex = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.blockIndex);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(index), gl.STATIC_DRAW);
        this.blockCount = index.length;
    }

    // Compiles a program; layout lists its interleaved float attributes (name, size)
    program(vsSource, fsSource, layout = []) {
        const gl = this.gl;
        const shader = (type, source) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, source);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost())
                throw new Error(gl.getShaderInfoLog(s));
            return s;
        };
        const prog = gl.createProgram();
        gl.attachShader(prog, shader(gl.VERTEX_SHADER, vsSource));
        gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, fsSource));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost())
            throw new Error(gl.getProgramInfoLog(prog));
        const uniforms = new Map();
        let offset = 0;
        const attribs = layout.map(([name, size]) => {
            const a = { loc: gl.getAttribLocation(prog, name), size, offset };
            offset += size;
            return a;
        });
        return {
            prog, attribs, stride: offset,
            u: (name) => {
                if (!uniforms.has(name)) uniforms.set(name, gl.getUniformLocation(prog, name));
                return uniforms.get(name);
            },
        };
    }

    get width() { return this.canvas.width; }
    get height() { return this.canvas.height; }

    // -----------------------------------
    // STATE

    resetState() {
        this.s = 1; this.x = 0; this.y = 0;
        this.globalAlpha = 1;
        this.blendMode = "normal"; // or "add" (canvas "lighter")
        this.clipRect = null;      // device pixels [x, y, w, h], or null
        this.stack = [];
    }

    setTransform(s, x, y) {
        this.s = s; this.x = x; this.y = y;
    }

    translate(dx, dy) {
        this.x += dx * this.s;
        this.y += dy * this.s;
    }

    scale(k) {
        this.s *= k;
    }

    save() {
        this.stack.push([this.s, this.x, this.y, this.globalAlpha, this.blendMode, this.clipRect]);
    }

    restore() {
        const clip = this.clipRect;
        [this.s, this.x, this.y, this.globalAlpha, this.blendMode, this.clipRect] = this.stack.pop();
        if (clip !== this.clipRect) this.applyClip();
    }

    // Only draw inside a rectangle (logical units, current transform) until restore()
    clip(x, y, w, h) {
        const x0 = Math.floor(this.x + x * this.s), y0 = Math.floor(this.y + y * this.s);
        const x1 = Math.ceil(this.x + (x + w) * this.s), y1 = Math.ceil(this.y + (y + h) * this.s);
        this.clipRect = [x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0)];
        this.applyClip();
    }

    applyClip() {
        const gl = this.gl;
        this.flush(); // what is queued was drawn under the previous clip
        if (!this.clipRect) {
            gl.disable(gl.SCISSOR_TEST);
            return;
        }
        const [x, y, w, h] = this.clipRect;
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(x, this.viewH - y - h, w, h); // GL counts from the bottom
    }

    // -----------------------------------
    // FRAME

    // Starts a frame; false while the context is lost (draw nothing then)
    begin() {
        if (!this.ok || this.gl.isContextLost()) return false;
        this.resetState();
        this.screen = null;
        this.setTarget(null);
        this.gl.disable(this.gl.SCISSOR_TEST);
        return true;
    }

    // -----------------------------------
    // RENDER TARGETS

    // A texture to draw into (see setTarget); drawn like any other texture handle
    renderTarget() {
        return { target: true, w: 0, h: 0, tex: null, fbo: null, texGen: -1, gen: -1 };
    }

    // Draw into a render target of w×h pixels, cleared to transparent, or back onto the
    // screen (null). Its contents last until it is set again.
    setTarget(t, w, h) {
        if (!t) {
            this.bindTarget(this.screen, this.width, this.height);
            return;
        }
        this.bindTarget(t, w, h);
        this.gl.clearColor(0, 0, 0, 0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    }

    // Until setScreen(null), draw what goes on the screen into a render target the size of the
    // canvas instead (cleared, then kept: setTarget(null) comes back to it), so the frame can be
    // drawn onto the screen afterwards through a shader. begin() returns to the real screen.
    setScreen(t) {
        this.screen = t;
        this.setTarget(t, this.width, this.height);
    }

    // Binds a render target (allocating it at w×h if needed), or the canvas (null), and its viewport
    bindTarget(t, w, h) {
        const gl = this.gl;
        this.flush();
        if (!t) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            this.viewW = this.width;
            this.viewH = this.height;
            gl.viewport(0, 0, this.viewW, this.viewH);
            return;
        }
        if (t.texGen !== this.gen || t.w !== w || t.h !== h) {
            if (t.texGen === this.gen) { // resized: replace
                gl.deleteFramebuffer(t.fbo);
                gl.deleteTexture(t.tex);
            }
            t.tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, t.tex);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            t.fbo = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
            t.w = w; t.h = h;
            t.texGen = t.gen = this.gen;
        } else {
            gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
        }
        this.viewW = w;
        this.viewH = h;
        gl.viewport(0, 0, w, h);
    }

    end() {
        this.flush();
        for (const t of this.trash) {
            if (!t.tex || t.texGen !== this.gen) continue;
            this.gl.deleteTexture(t.tex);
            if (t.fbo) this.gl.deleteFramebuffer(t.fbo);
        }
        this.trash.length = 0;
    }

    // -----------------------------------
    // TEXTURES

    // A texture handle for a canvas (or image); uploaded when first drawn
    texture(canvas) {
        return { canvas, w: canvas.width, h: canvas.height, tex: null, gen: -1 };
    }

    // Deletes the texture once this frame's drawing is done
    releaseTexture(t) {
        if (t) this.trash.push(t);
    }

    // Binds a handle's texture to a unit, uploading it if needed
    bindTexture(t, unit = 0) {
        const gl = this.gl;
        gl.activeTexture(gl.TEXTURE0 + unit);
        if (t.gen === this.gen && t.tex) {
            gl.bindTexture(gl.TEXTURE_2D, t.tex);
            return;
        }
        if (!t.tex || t.texGen !== this.gen) { // none yet, or one from a lost context
            t.tex = gl.createTexture();
            t.texGen = this.gen;
        }
        gl.bindTexture(gl.TEXTURE_2D, t.tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, t.canvas);
        t.gen = this.gen;
    }

    // -----------------------------------
    // BATCHING

    // Room for n more floats in a batch drawn with this program, texture and blend mode
    reserve(prog, tex, floats) {
        const b = this.batch;
        if (b.prog !== prog || b.tex !== tex || b.blend !== this.blendMode) {
            this.flush();
            b.prog = prog; b.tex = tex; b.blend = this.blendMode;
        }
        if (this.n + floats > this.data.length) this.flush();
    }

    flush() {
        if (!this.n) return;
        const gl = this.gl, b = this.batch, p = b.prog;
        gl.useProgram(p.prog);
        gl.uniform2f(p.u("uSize"), this.viewW, this.viewH);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, b.blend === "add" ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
        if (b.tex) {
            this.bindTexture(b.tex, 0);
            gl.uniform1i(p.u("uTex"), 0);
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.data.subarray(0, this.n), gl.STREAM_DRAW);
        for (const a of p.attribs) {
            gl.enableVertexAttribArray(a.loc);
            gl.vertexAttribPointer(a.loc, a.size, gl.FLOAT, false, p.stride * 4, a.offset * 4);
        }
        gl.drawArrays(gl.TRIANGLES, 0, this.n / p.stride);
        for (const a of p.attribs) gl.disableVertexAttribArray(a.loc);
        this.n = 0;
    }

    // -----------------------------------
    // DRAWING

    // A texture (or its source rectangle sx, sy, sw, sh in texels) into x, y, w, h.
    // Drawn at its own size, it snaps to whole device pixels to stay sharp.
    image(t, x, y, w, h, sx = 0, sy = 0, sw = t.w, sh = t.h) {
        const a = this.globalAlpha;
        if (a <= 0 || !t) return;
        const s = this.s;
        let x0 = this.x + x * s, y0 = this.y + y * s;
        const dw = w * s, dh = h * s;
        if (Math.abs(dw - sw) < 0.01 && Math.abs(dh - sh) < 0.01) {
            x0 = Math.round(x0);
            y0 = Math.round(y0);
        }
        const x1 = x0 + dw, y1 = y0 + dh;
        this.quad(t, x0, y0, 1, x1, y0, 1, x0, y1, 1, x1, y1, 1, sx, sy, sw, sh);
    }

    // A texture (or its source rectangle) onto a quad in perspective: corners top-left,
    // top-right, bottom-left, bottom-right as [x, y, q] in logical units, where q is the
    // corner's perspective scale (1 = flat, bigger = nearer)
    imageQuad(t, corners, sx = 0, sy = 0, sw = t.w, sh = t.h) {
        if (this.globalAlpha <= 0 || !t) return;
        const [[ax, ay, aq], [bx, by, bq], [cx, cy, cq], [dx, dy, dq]] = corners;
        const s = this.s, x = this.x, y = this.y;
        this.quad(t, x + ax * s, y + ay * s, aq, x + bx * s, y + by * s, bq,
            x + cx * s, y + cy * s, cq, x + dx * s, y + dy * s, dq, sx, sy, sw, sh);
    }

    // Corners top-left, top-right, bottom-left, bottom-right in device pixels, each with its
    // perspective scale q. Written straight into the batch: this runs for every sprite.
    quad(t, x0, y0, q0, x1, y1, q1, x2, y2, q2, x3, y3, q3, sx, sy, sw, sh) {
        const a = this.globalAlpha;
        let u0 = sx / t.w, v0 = sy / t.h, u1 = (sx + sw) / t.w, v1 = (sy + sh) / t.h;
        if (t.target) { v0 = 1 - v0; v1 = 1 - v1; } // render targets are stored bottom up
        this.reserve(this.imageProgram, t, 6 * IMAGE_STRIDE);
        let n = this.imageVertex(this.n, x0, y0, q0, u0, v0, a);
        n = this.imageVertex(n, x1, y1, q1, u1, v0, a);
        n = this.imageVertex(n, x2, y2, q2, u0, v1, a);
        n = this.imageVertex(n, x2, y2, q2, u0, v1, a);
        n = this.imageVertex(n, x1, y1, q1, u1, v0, a);
        this.n = this.imageVertex(n, x3, y3, q3, u1, v1, a);
    }

    imageVertex(n, x, y, q, u, v, a) {
        const d = this.data;
        d[n] = x; d[n + 1] = y; d[n + 2] = u * q; d[n + 3] = v * q; d[n + 4] = q;
        d[n + 5] = a; d[n + 6] = a; d[n + 7] = a; d[n + 8] = a;
        return n + IMAGE_STRIDE;
    }

    // A colour premultiplied by its alpha and the global alpha, into out (transparent if none)
    premultiplied(c, out) {
        if (!c) return out.fill(0);
        const p = parseColor(c), k = p[3] * this.globalAlpha;
        out[0] = p[0] * k; out[1] = p[1] * k; out[2] = p[2] * k; out[3] = k;
        return out;
    }

    // Rounded rectangle. opts: radius (number or [tl, tr, br, bl]), fill (colour, or
    // [top, bottom] colours of a vertical gradient running from fillY[0] to fillY[1]),
    // stroke, lineWidth (centred on the edge, like canvas stroke)
    shape(x, y, w, h, { radius = 0, fill = null, fillY = null, stroke = null, lineWidth = 1 } = {}) {
        if (this.globalAlpha <= 0) return;
        const s = this.s;
        const hw = w * s / 2, hh = h * s / 2;
        const cx = this.x + x * s + hw, cy = this.y + y * s + hh;
        const lim = Math.min(hw, hh);
        const corners = Array.isArray(radius);
        const r0 = Math.min((corners ? radius[0] : radius) * s, lim), r1 = Math.min((corners ? radius[1] : radius) * s, lim);
        const r2 = Math.min((corners ? radius[2] : radius) * s, lim), r3 = Math.min((corners ? radius[3] : radius) * s, lim);
        const line = stroke ? lineWidth * s : 0;
        const ext = line / 2 + 1; // room for the stroke and the anti-aliased edge

        const top = SHAPE_TOP, bottom = SHAPE_BOTTOM;
        if (fill && fillY) {
            // linear, extrapolated past the stops (the shader clamps)
            const c0 = this.premultiplied(fill[0], top), c1 = this.premultiplied(fill[1], SHAPE_SCRATCH);
            const t0 = (y - ext / s - fillY[0]) / (fillY[1] - fillY[0]);
            const t1 = (y + h + ext / s - fillY[0]) / (fillY[1] - fillY[0]);
            for (let i = 0; i < 4; i++) {
                bottom[i] = c0[i] + (c1[i] - c0[i]) * t1;
                top[i] = c0[i] + (c1[i] - c0[i]) * t0;
            }
        } else {
            this.premultiplied(fill, top);
            bottom.set(top);
        }
        const sc = this.premultiplied(stroke, SHAPE_STROKE);

        this.reserve(this.shapeProgram, null, 6 * SHAPE_STRIDE);
        const d = this.data;
        let n = this.n;
        const ex = hw + ext, ey = hh + ext;
        for (let k = 0; k < 12; k += 2) {
            const lx = SHAPE_CORNERS[k] * ex, ly = SHAPE_CORNERS[k + 1] * ey;
            const f = ly < 0 ? top : bottom;
            d[n++] = cx + lx; d[n++] = cy + ly;
            d[n++] = lx; d[n++] = ly;
            d[n++] = hw; d[n++] = hh;
            d[n++] = r0; d[n++] = r1; d[n++] = r2; d[n++] = r3;
            d[n++] = line;
            d[n++] = f[0]; d[n++] = f[1]; d[n++] = f[2]; d[n++] = f[3];
            d[n++] = sc[0]; d[n++] = sc[1]; d[n++] = sc[2]; d[n++] = sc[3];
        }
        this.n = n;
    }

    rect(x, y, w, h, color) {
        this.shape(x, y, w, h, { fill: color });
    }

    // -----------------------------------
    // 3D BLOCKS

    // Starts drawing 3D blocks (only block() until endBlocks()), in the current transform.
    // cam: the field they stand on, as Engine.boardMotion() moves it: centre cx, cy, camera
    // distance dist, tilt rx, ry (radians), depth dz and shake dx, dy, rows drawn clipY0..clipY1;
    // shape: bevel, height and gap (cell units); light: unit vector towards the light (world)
    beginBlocks(cam, shape, light) {
        const gl = this.gl, p = this.blockProgram;
        this.flush();
        gl.useProgram(p.prog);
        gl.uniform2f(p.u("uSize"), this.viewW, this.viewH);
        gl.uniform3f(p.u("uView"), this.s, this.x, this.y);
        gl.uniform4f(p.u("uTurn"), Math.cos(cam.rx), Math.sin(cam.rx), Math.cos(cam.ry), Math.sin(cam.ry));
        gl.uniform4f(p.u("uCam"), cam.cx, cam.cy, cam.dist, cam.dz);
        gl.uniform2f(p.u("uShift"), cam.dx, cam.dy);
        gl.uniform2f(p.u("uClipY"), cam.clipY0, cam.clipY1);
        gl.uniform3f(p.u("uShape"), shape.bevel, shape.height, shape.gap);
        gl.uniform3f(p.u("uLight"), light[0], light[1], light[2]);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.enable(gl.CULL_FACE);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.blockVerts);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.blockIndex);
        const a = p.attribs[0];
        gl.enableVertexAttribArray(a.loc);
        gl.vertexAttribPointer(a.loc, 3, gl.FLOAT, false, 12, 0);
        this.blockGap = shape.gap;
    }

    // One block in the cell at x, y (logical units, its top left) of the given size. b: open and
    // notch (Float32Array(4) each, as uOpen and uNotch), base and glow colours (sRGB, 3 each),
    // squash ([across, height]), glow (falling piece highlight 0..1), flash (0..1), alpha
    block(x, y, size, b) {
        const gl = this.gl, p = this.blockProgram, o = b.open, g = this.blockGap;
        gl.uniform4f(p.u("uCell"), x, y, size, 0);
        gl.uniform4f(p.u("uBox"), o[0] * g, o[2] * g, 1 - o[1] * g, 1 - o[3] * g);
        gl.uniform4fv(p.u("uOpen"), o);
        gl.uniform4fv(p.u("uNotch"), b.notch);
        gl.uniform2fv(p.u("uSquash"), b.squash);
        gl.uniform3fv(p.u("uBase"), b.base);
        gl.uniform3fv(p.u("uGlow"), b.light);
        gl.uniform4f(p.u("uState"), b.glow, b.flash, b.alpha, 0);
        gl.drawElements(gl.TRIANGLES, this.blockCount, gl.UNSIGNED_SHORT, 0);
    }

    endBlocks() {
        const gl = this.gl;
        gl.disableVertexAttribArray(this.blockProgram.attribs[0].loc);
        gl.disable(gl.CULL_FACE);
    }
}
