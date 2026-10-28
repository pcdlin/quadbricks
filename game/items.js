// Versus items' graphics (VS_ITEMS; TAP Normal's two too), drawn with canvas paths and rendered once
// into textures by the engine: an icon per item on its blocks and in the NEXT box (a white glyph on
// a frame in the colour of the item's kind, as Heboris, a TGM clone, has them after the arcade's),
// and an emblem per item for the cut-in on the side an attack item hits (the glyph in the item's
// own colour on a dark medallion).

// The icon frame's colour by kind (a PIECE_COLORS index): an attack on the other side red, the side's
// own items blue, Exchg Field (neutral, it waits for every attack to end) green
const ITEM_KIND_COLORS = { attack: tetZ, own: tetJ, neutral: tetS };

function itemKind(item) {
    const spec = VS_ITEMS[item];
    return spec.attack ? "attack" : spec.neutral ? "neutral" : "own";
}

// Glyph helpers, in a 100 × 100 box: shapes filled with the current fill; cut() takes a shape out
// (each glyph is drawn on a canvas of its own, so that leaves the frame under it alone)
const itemShapes = {
    rect(g, x, y, w, h, radius = 0) {
        g.beginPath();
        g.roundRect(x, y, w, h, radius);
        g.fill();
    },
    disc(g, x, y, radius) {
        g.beginPath();
        g.arc(x, y, radius, 0, Math.PI * 2);
        g.fill();
    },
    poly(g, points) {
        g.beginPath();
        for (const [x, y] of points) g.lineTo(x, y);
        g.closePath();
        g.fill();
    },
    cut(g, draw) {
        g.save();
        g.globalCompositeOperation = "destination-out";
        draw();
        g.restore();
    },
    // A bold arrow centred on (cx, cy), turned by angle (0: pointing up)
    arrow(g, cx, cy, angle, len = 76, shaft = 22, head = 54) {
        const t = -len / 2, hh = head * 0.6, sw = shaft / 2, hw = head / 2;
        g.save();
        g.translate(cx, cy);
        g.rotate(angle);
        itemShapes.poly(g, [[0, t], [hw, t + hh], [sw, t + hh], [sw, len / 2], [-sw, len / 2], [-sw, t + hh], [-hw, t + hh]]);
        g.restore();
    },
};

// Per item: its glyph (in the 100 box, white unless paint: it then colours itself when detail) and the
// colour of its cut-in emblem (a PIECE_COLORS index)
const ITEM_ART = {
    "COLOR BLOCK": { color: tetT, paint: true, glyph(g, detail) { // four blocks, each its own colour in the cut-in
        [[14, 14, tetI], [54, 14, tetZ], [14, 54, tetO], [54, 54, tetS]].forEach(([x, y, c]) => {
            if (detail) g.fillStyle = PIECE_COLORS[c].light;
            itemShapes.rect(g, x, y, 32, 32, 6);
        });
    } },
    "LASER": { color: tetZ, glyph(g) { // a target over the column and its beam
        g.lineWidth = 9;
        g.beginPath();
        g.arc(50, 28, 19, 0, Math.PI * 2);
        g.stroke();
        itemShapes.disc(g, 50, 28, 6);
        itemShapes.rect(g, 43, 50, 14, 46, 4);
    } },
    "TRANSFORM": { color: tetT, glyph(g) { // a die: the piece turns into one at random
        itemShapes.rect(g, 12, 12, 76, 76, 16);
        itemShapes.cut(g, () => [[31, 31], [50, 50], [69, 69]].forEach(([x, y]) => itemShapes.disc(g, x, y, 9)));
    } },
    "↑ DEL FIELD": { color: tetI, glyph(g) { // the upper half goes
        itemShapes.arrow(g, 50, 38, 0, 62);
        itemShapes.rect(g, 12, 78, 76, 13, 4);
    } },
    "DEL EVEN": { color: tetI, glyph(g) { // every other row
        for (const y of [12, 44, 76]) itemShapes.rect(g, 10, y, 80, 13, 4);
        for (const y of [30, 62]) for (let x = 12; x < 88; x += 16) itemShapes.rect(g, x, y, 8, 4, 2);
    } },
    "ROLL ROLL": { color: tetL, glyph(g) { // a turning arrow, counter-clockwise
        const cx = 50, cy = 52, rad = 30, end = 0.3 * Math.PI;
        g.lineWidth = 15;
        g.beginPath();
        g.arc(cx, cy, rad, -0.25 * Math.PI, end, true);
        g.stroke();
        const px = cx + rad * Math.cos(end), py = cy + rad * Math.sin(end);
        const tx = Math.sin(end), ty = -Math.cos(end), nx = Math.cos(end), ny = Math.sin(end); // travel, outwards
        itemShapes.poly(g, [[px + tx * 22, py + ty * 22], [px + nx * 20 - tx * 4, py + ny * 20 - ty * 4], [px - nx * 20 - tx * 4, py - ny * 20 - ty * 4]]);
    } },
    "MIRROR BLOCK": { color: tetI, glyph(g) { // the field turned left to right
        itemShapes.poly(g, [[8, 50], [40, 20], [40, 80]]);
        itemShapes.poly(g, [[92, 50], [60, 20], [60, 80]]);
        for (let y = 10; y < 90; y += 18) itemShapes.rect(g, 47, y, 6, 10, 2);
    } },
    "X-RAY": { color: tetS, glyph(g) {
        for (const a of [Math.PI / 4, -Math.PI / 4]) {
            g.save();
            g.translate(50, 50);
            g.rotate(a);
            itemShapes.rect(g, -10, -46, 20, 92, 5);
            g.restore();
        }
    } },
    "180° FIELD": { color: tetO, glyph(g) { // a U-turn: the field upside down
        g.lineWidth = 16;
        g.beginPath();
        g.arc(50, 42, 24, Math.PI, 2 * Math.PI);
        g.stroke();
        itemShapes.rect(g, 18, 41, 16, 47, 3);
        itemShapes.rect(g, 66, 41, 16, 22, 0);
        itemShapes.poly(g, [[74, 94], [55, 62], [93, 62]]);
    } },
    "DEATH BLOCK": { color: tetZ, glyph(g) { // a skull
        itemShapes.disc(g, 50, 42, 33);
        itemShapes.rect(g, 31, 58, 38, 30, 7);
        itemShapes.cut(g, () => {
            itemShapes.disc(g, 37, 45, 10);
            itemShapes.disc(g, 63, 45, 10);
            itemShapes.poly(g, [[50, 57], [44, 68], [56, 68]]);
            for (const x of [40, 48, 56]) itemShapes.rect(g, x, 76, 4, 13, 0);
        });
    } },
    "→ MOV FIELD": { color: tetJ, glyph(g) { // pushed to the right wall
        itemShapes.arrow(g, 42, 50, Math.PI / 2, 72, 22, 54);
        itemShapes.rect(g, 82, 10, 12, 80, 4);
    } },
    "HARD BLOCK": { color: HARD_COLOR, glyph(g) { // a riveted steel shell
        itemShapes.rect(g, 8, 8, 84, 84, 14);
        itemShapes.cut(g, () => {
            itemShapes.rect(g, 25, 25, 50, 50, 6);
            for (const [x, y] of [[17, 17], [83, 17], [17, 83], [83, 83]]) itemShapes.disc(g, x, y, 4.5);
        });
        itemShapes.rect(g, 34, 34, 32, 32, 4);
    } },
    "SHOTGUN!": { color: tetL, glyph(g) { // a blast
        const points = [];
        for (let k = 0; k < 24; k++) {
            const a = k / 24 * Math.PI * 2 - Math.PI / 2, d = k % 2 ? 22 : k % 4 ? 38 : 47;
            points.push([50 + Math.cos(a) * d, 50 + Math.sin(a) * d]);
        }
        itemShapes.poly(g, points);
        itemShapes.cut(g, () => itemShapes.disc(g, 50, 50, 10));
    } },
    "DARK BLOCK": { color: tetT, glyph(g) { // an eclipse
        itemShapes.disc(g, 50, 50, 40);
        itemShapes.cut(g, () => itemShapes.disc(g, 65, 40, 33));
    } },
    "↓ DEL FIELD": { color: tetI, glyph(g) { // the lower half goes
        itemShapes.arrow(g, 50, 62, Math.PI, 62);
        itemShapes.rect(g, 12, 9, 76, 13, 4);
    } },
    "FREE FALL": { color: tetS, glyph(g) { // every block drops down its column
        itemShapes.arrow(g, 30, 42, Math.PI, 66, 14, 36);
        itemShapes.arrow(g, 70, 42, Math.PI, 66, 14, 36);
        itemShapes.rect(g, 8, 82, 84, 12, 4);
    } },
    "← MOV FIELD": { color: tetJ, glyph(g) { // pushed to the left wall
        itemShapes.arrow(g, 58, 50, -Math.PI / 2, 72, 22, 54);
        itemShapes.rect(g, 6, 10, 12, 80, 4);
    } },
    "EXCHG FIELD": { color: tetS, glyph(g) { // the two fields swap
        itemShapes.arrow(g, 54, 30, Math.PI / 2, 80, 14, 38);
        itemShapes.arrow(g, 46, 70, -Math.PI / 2, 80, 14, 38);
    } },
    "NEGA FIELD": { color: 8, glyph(g) { // blocks and holes swapped
        g.lineWidth = 9;
        g.beginPath();
        g.arc(50, 50, 39, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        g.arc(50, 50, 29, -Math.PI / 2, Math.PI / 2);
        g.closePath();
        g.fill();
    } },
};

// The item's glyph in white (or its own colours: paint and detail) on a new canvas px × px
function itemGlyphCanvas(item, px, detail) {
    const c = document.createElement("canvas");
    c.width = c.height = Math.max(1, Math.ceil(px));
    const g = c.getContext("2d");
    g.scale(c.width / 100, c.height / 100);
    g.fillStyle = g.strokeStyle = "#fff";
    g.lineCap = "round";
    ITEM_ART[item].glyph(g, detail);
    return c;
}

// An item block's icon at (0, 0), size × size in g's units (s device pixels each): a frame in the
// kind's colour, a dark plate and the glyph on it
function drawItemIcon(g, item, size, s) {
    const color = PIECE_COLORS[ITEM_KIND_COLORS[itemKind(item)]];
    const frame = g.createLinearGradient(0, 0, 0, size);
    frame.addColorStop(0, color.light);
    frame.addColorStop(0.55, color.base);
    frame.addColorStop(1, color.dark);
    g.fillStyle = frame;
    g.beginPath();
    g.roundRect(size * 0.04, size * 0.04, size * 0.92, size * 0.92, size * 0.14);
    g.fill();
    const inset = size * 0.15;
    g.fillStyle = "rgba(8,10,24,0.9)";
    g.beginPath();
    g.roundRect(inset, inset, size - inset * 2, size - inset * 2, size * 0.07);
    g.fill();
    const gs = size * 0.56;
    g.drawImage(itemGlyphCanvas(item, gs * s, false), (size - gs) / 2, (size - gs) / 2, gs, gs);
}

// An item's cut-in emblem, size × size in g's units (s device pixels each): a dark medallion ringed
// in the item's colour, its glyph in that colour (light at the top) glowing on it
function drawItemEmblem(g, item, size, s) {
    const color = PIECE_COLORS[ITEM_ART[item].color];
    const c = size / 2, rad = size * 0.4;
    g.save();
    g.shadowColor = color.base;
    g.shadowBlur = size * 0.12 * s;
    const plate = g.createRadialGradient(c, c * 0.8, 0, c, c, rad);
    plate.addColorStop(0, "#1c2140");
    plate.addColorStop(1, "#070914");
    g.fillStyle = plate;
    g.beginPath();
    g.arc(c, c, rad, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.strokeStyle = color.light;
    g.lineWidth = size * 0.035;
    g.beginPath();
    g.arc(c, c, rad, 0, Math.PI * 2);
    g.stroke();

    const gs = size * 0.5, px = gs * s;
    const art = itemGlyphCanvas(item, px, true);
    if (!ITEM_ART[item].paint) { // tint: light at the top to the base colour at the bottom
        const t = art.getContext("2d");
        t.setTransform(1, 0, 0, 1, 0, 0);
        t.globalCompositeOperation = "source-in";
        const fill = t.createLinearGradient(0, 0, 0, art.height);
        fill.addColorStop(0, "#fff");
        fill.addColorStop(0.35, color.light);
        fill.addColorStop(1, color.base);
        t.fillStyle = fill;
        t.fillRect(0, 0, art.width, art.height);
    }
    g.save();
    g.shadowColor = color.light;
    g.shadowBlur = size * 0.08 * s;
    g.drawImage(art, c - gs / 2, c - gs / 2, gs, gs);
    g.restore();
}
