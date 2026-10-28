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
        this.buffer = gl.createBuffer();
        this.n = 0;
        this.ok = true;
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

    // Back to a stand-in for the screen set before (t, as `screen` was), or the screen (null),
    // without clearing it: for a setScreen() layer drawn inside another
    resumeScreen(t) {
        this.screen = t;
        this.setTarget(null);
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
}
