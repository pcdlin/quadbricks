// Spec checks for the rule sets (game/rules*.js) against the Guideline, TGM1, TGM3, TAP, NES and GB references.
// Usage: node test/rules.test.js
const fs = require("fs");
const vm = require("vm");
const dir = require("path").join(__dirname, "..", "game");
// the rules: game.js, then the files of game/index.html that define them, in its order
const RULE_FILES = ["game.js", "randomizers.js", "rules.js", "rules-guideline.js", "rules-tgm.js", "rules-ace.js", "rules-1989.js", "rules-sakura.js"];
vm.runInThisContext(RULE_FILES.map(f => fs.readFileSync(dir + "/" + f, "utf8")).join("\n") +
    "\n;Object.assign(globalThis, {RuleGame, createGame, TGM_GRADE_LABELS, COUNTDOWN_STEPS, COUNTDOWN_STEP_FRAMES, TiRandomizer, TapRandomizer, Tgm1Randomizer, GbRandomizer, NesRandomizer, guideline, arika, tgmClassic, tgmTap, gbTetris, tgmOriginal, nesTetris, tgmAce, aceArs, aceArs2, ARS_SHAPES, guidelineGravity, shapes, tetI, tetT, tetO, tetL, tetJ, tetS, tetZ, WIDTH, HEIGHT, LEFT_PUSH, LEFT_RELEASE, RIGHT_PUSH, RIGHT_RELEASE, ROTL_PUSH, ROTR_PUSH, ROTR_RELEASE, SOFT_PUSH, SOFT_RELEASE, HARD_PUSH, HOLD_PUSH, HOLD_RELEASE, ROT180_PUSH, ROT180_RELEASE, GB_GRAVITY, versusAttack, tetGARBAGE, FIELD_TOP, tgm3ExamFor, tgm3ExamAfter, tgm3PromotionGrade, TGM3_EXAM_HISTORY, TGM_VS_FRAMES, TGM1_VS_FRAMES, VS_ITEM_PIECES, VS_ITEMS, VS_CUTIN_FRAMES, TGM_VS_GARBAGE_MAX});");

let failures = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : `\n     expected ${JSON.stringify(expected)}\n     got      ${JSON.stringify(actual)}`));
}

// Start a game and run to the first active piece
function started(mode) {
    const g = createGame(mode);
    for (let f = 0; f < 200 && g.phase !== "active"; f++) g.advanceFrame(0);
    return g;
}
// Put a given piece at a given place (engine rows)
function place(g, type, rot, row, col) {
    g.curPiece_type = type; g.curPiece_rotation = rot; g.curPiece_row = row; g.curPiece_col = col;
    g.lowestRow = row; g.touched = false; g.moveResets = 0; g.rotationResets = 0; g.curPiece_lockDelay = 0;
    g.lastRotation = false; g.lastKick = -1; g.activeTime = 0; g.softFrames = 0; g.sonicMax = 0;
    g.setShadow();
}
function fill(g, rows) { // rows: strings bottom-aligned, '#' = block
    rows.forEach((s, k) => {
        const r = HEIGHT - rows.length + k;
        for (let c = 0; c < WIDTH; c++) g.setCell(r, c, s[c] === "#" ? 1 : 0);
    });
}
const piecesOf = g => g.queue.slice();

// ---------------------------------------------------------------- TGM3 randomizer
{
    const r = new TiRandomizer(0x1106);
    const names = { [tetI]: "i", [tetZ]: "z", [tetS]: "s", [tetJ]: "j", [tetL]: "l", [tetO]: "o", [tetT]: "t" };
    let s = "";
    for (let n = 0; n < 35; n++) s += names[r.next()];
    check("TGM3 randomizer reproduces the arcade attract-mode sequence (seed 0x1106)", s, "jltiojslzijtolzstiojstizojlstzilsto");
}

// ---------------------------------------------------------------- Guideline
{
    const table = { 1: 0.01667, 2: 0.021017, 3: 0.026977, 5: 0.04693, 10: 0.2598, 13: 0.92, 15: 2.36 };
    const got = {}, exp = {};
    // the wiki table is rounded (e.g. level 13 listed as 0.92, formula gives 0.918): compare at 2 significant digits
    for (const [L, G] of Object.entries(table)) { got[L] = +guidelineGravity(+L).toPrecision(2); exp[L] = +G.toPrecision(2); }
    check("Guideline gravity formula matches the Marathon G table", got, exp);
}
{
    const g = createGame(guideline);
    const bagCounts = () => { const q = []; while (q.length < 14) { q.push(g.queue.shift()); g.fillQueue(); } return q; };
    const q = bagCounts();
    check("Guideline 7-bag: each bag of 7 has one of every piece", [q.slice(0, 7).sort(), q.slice(7, 14).sort()], [[1, 2, 3, 4, 5, 6, 7], [1, 2, 3, 4, 5, 6, 7]]);
}
{
    const g = createGame(guideline);
    g.queue[0] = tetT;
    for (let f = 0; f < 200 && g.phase !== "active"; f++) g.advanceFrame(0);
    check("Guideline spawn: T at col 3, appears in rows 21-22 then drops one row (engine row 1)", [g.curPiece_type, g.curPiece_col, g.curPiece_row], [tetT, 3, 1]);
}
{
    // T-spin double: classic TSD slot
    const g = started(guideline);
    // TSD slot: T-shaped hole at row 20 cols 1-3 and row 21 col 2, overhang at row 19 col 1
    fill(g, [
        ".#........",
        "#...######",
        "##.#######",
    ]);
    g.level = 1; g.score = 0;
    // T in state R inside the slot's box, rotated clockwise into state 2 (pointing down)
    place(g, tetT, 1, 19, 1);
    const rotated = g.rotate(1); // R->2
    const pos = [g.curPiece_row, g.curPiece_col, g.curPiece_rotation];
    g.lock();
    check("T-spin double via rotation into an overhung slot", { rotated, pos, score: g.score, actions: g.actions.map(a => a.text) }, { rotated: true, pos: [19, 1, 2], score: 1200, actions: ["T-SPIN DOUBLE"] });
}
{
    // Back-to-back Tetris and combo
    const g = started(guideline);
    for (let r = 2; r < HEIGHT; r++) for (let c = 0; c < WIDTH; c++) g.setCell(r, c, r >= 14 && c !== 9 ? 1 : 0);
    g.level = 2; g.lines = 10; g.score = 0; g.b2b = false; g.combo = -1;
    place(g, tetI, 1, 18, 7); // vertical I in col 9 (rows 18-21)
    g.lock();
    const first = g.score;
    place(g, tetI, 1, 18, 7); // second Tetris: rows 14-17 have collapsed down to 18-21
    g.actionAge = 1; // a frame has passed since the last clear
    g.lock();
    check("Tetris = 800 x level; back-to-back Tetris = 1.5x plus 1-combo 50 x level, then perfect clear", { first, second: g.score - first, actions: g.actions.map(a => a.text) },
        { first: 1600, second: 800 * 2 * 1.5 + 50 * 1 * 2 + 3200 * 2, actions: ["QUAD", "BACK-TO-BACK", "1 COMBO", "PERFECT CLEAR"] });
}
{
    // Hard drop points and lock out
    const g = started(guideline);
    place(g, tetO, 0, 1, 3);
    const before = g.score;
    g.hardDrop();
    check("Hard drop: 2 points per cell (O from row 1 to rows 20-21 = 19 cells)", g.score - before, 38);
    const h = started(guideline);
    for (let r = 2; r < HEIGHT; r++) for (let c = 0; c < WIDTH; c++) h.setCell(r, c, c === 9 ? 0 : 1);
    place(h, tetO, 0, 0, 3);
    h.hardDrop();
    check("Guideline lock out: piece locking completely above the visible field ends the game", [h.isGameOver(), h.endSub], [true, "LOCK OUT — ESC FOR MENU"]);
}
{
    // 15 move resets, then locks on touchdown
    const g = started(guideline);
    place(g, tetT, 0, 20, 3);
    let f = 0, locked = false;
    for (; f < 2000; f++) {
        const inp = f % 2 === 0 ? (f % 4 === 0 ? LEFT_PUSH | RIGHT_RELEASE : RIGHT_PUSH | LEFT_RELEASE) : 0;
        g.advanceFrame(inp);
        if (g.phase !== "active") { locked = true; break; }
    }
    check("Guideline move reset: wiggling on the floor locks after 15 resets", { locked, resetsUsed: g.moveResets }, { locked: true, resetsUsed: 15 });
}
{
    // Lock delay is 30 frames with no input: the piece rests in view for 30 frames, the first of them
    // the one it lands on, and locks on the next (as NullpoMino and Cambridge count it)
    const g = started(guideline);
    place(g, tetO, 0, 20, 3);
    let f = 0;
    while (g.phase === "active" && f < 100) { g.advanceFrame(0); f++; }
    check("Guideline lock delay: 30 frames (0.5 s) on the ground, locking on the 31st", f, 31);
}
{
    // Level: 10 lines per level
    const g = started(guideline);
    g.lines = 9; g.level = 1;
    for (let r = 2; r < HEIGHT; r++) for (let c = 0; c < WIDTH; c++) g.setCell(r, c, r === 21 && c !== 9 ? 1 : 0);
    place(g, tetI, 1, 18, 7);
    g.lock();
    check("Guideline fixed goal: 10 lines -> level 2", [g.lines, g.level], [10, 2]);
}

// ---------------------------------------------------------------- TGM3 Master (World rule)
{
    const g = started(arika);
    check("Master spawn: first piece at level 0, rows 19-20 (engine row 2), never S/Z/O first", [g.level, g.curPiece_row, [tetS, tetZ, tetO].includes(g.curPiece_type)], [0, 2, false]);
    check("Master timings at level 0: ARE 27, line ARE 27, DAS 16, lock 30, clear 40, gravity 4/256", [g.are, g.lineAre, g.das, g.lockDelayMax, g.lineClearDelay, g.gravity * 256], [27, 27, 16, 30, 40, 4]);
    g.hardDrop();
    let f = 0;
    while (g.phase !== "active" && f < 100) { g.advanceFrame(0); f++; }
    check("Master: next piece after 27 frames of ARE, level +1", [f, g.level], [27, 1]);
}
{
    const g = started(arika);
    g.level = 98;
    for (let k = 0; k < 3; k++) { g.hardDrop(); for (let f = 0; f < 200 && g.phase !== "active"; f++) g.advanceFrame(0); for (let r = 2; r < HEIGHT; r++) g.field[r + 18].fill(0); }
    check("Master section stop: pieces alone can't pass level 99", g.level, 99);
    for (let r = 2; r < HEIGHT; r++) for (let c = 0; c < WIDTH; c++) g.setCell(r, c, r >= 18 && c !== 9 ? 1 : 0);
    place(g, tetI, 1, 18, 7);
    g.lock();
    check("Master: Tetris adds 6 levels (99 -> 105); line clear delay 40, then line ARE 27", [g.level, g.phase, g.phaseLength], [105, "lineclear", 40]);
    let f = 0;
    g.pendingRows = [21, 20, 19, 18]; // pretend a block sits above: it must fall 4 rows over the delay
    check("  ...drop animation starts at 0 and reaches the full distance", [g.getDropOffset(10), g.getDropOffset(21)], [0, 0]);
    g.phaseCounter = g.phaseLength;
    check("  ...ends at the full distance", g.getDropOffset(10), 4);
    const at = (c, row) => { g.phaseCounter = c; return [g.getDropOffset(row), g.getDropLandedFor(row)]; };
    check("  ...waits 12 frames (confetti), then falls at a fixed speed (half a row per frame) and lands early, a 1-row drop sooner",
        [at(4, 10), at(12, 10), at(16, 10), at(20, 10), at(24, 10), at(12, 20), at(13, 20), at(14, 20)],
        [[0, -1], [0, -1], [2, -1], [4, 0], [4, 4], [0, -1], [0.5, -1], [1, 0]]);
    g.phaseLength = 15;
    check("  ...a shorter delay shortens the wait so the longest fall still ends with it", [at(7, 10), at(11, 10), at(15, 10), at(8, 20), at(9, 20)],
        [[0, -1], [2, -1], [4, 0], [0.5, -1], [1, 0]]);
    g.phaseLength = 6;
    check("  ...a delay too short for that speed still lands the rows by its end", [at(3, 10), at(6, 10)], [[2, -1], [4, 0]]);
    g.phaseLength = 40;
    g.phaseCounter = 0;
    while (g.phase === "lineclear") { g.advanceFrame(0); f++; }
    check("  ...rows collapse after the line clear delay", [f, g.field[21 + 18].every(v => v === 0), g.phase, g.phaseLength], [40, true, "are", 27]);
}
{
    const g = started(arika);
    g.level = 120; g.updateTimings(); g.setShadow();
    check("Master ghost hidden from level 100", g.shadowRow, -100);
    g.level = 500; g.updateTimings();
    check("Master level 500: 20G, DAS 10, line clear 25", [g.gravity, g.das, g.lineClearDelay], [20, 10, 25]);
    g.level = 900; g.updateTimings();
    check("Master level 900: lock delay 17, DAS 8, ARE 14, line ARE 8", [g.lockDelayMax, g.das, g.are, g.lineAre], [17, 8, 14, 8]);
    g.level = 200; g.updateTimings();
    check("Master level 200: gravity drops back to 4/256", g.gravity * 256, 4);
    const at = (level, bonus) => { g.level = level; g.speedBonus = bonus; g.updateTimings(); return [g.are, g.lineAre, g.das, g.lockDelayMax, g.lineClearDelay]; };
    check("Master speed level 1000+ (COOLs): ARE / line ARE / DAS / lock / clear 8 8 8 17 6, 7 7 8 15 6, 6 6 8 15 6",
        [at(900, 100), at(950, 200), at(999, 900)], [[8, 8, 8, 17, 6], [7, 7, 8, 15, 6], [6, 6, 8, 15, 6]]);
    g.speedBonus = 0;
}
{
    // 20G: a new piece lands in its spawn frame
    const g = started(arika);
    g.level = 500; g.updateTimings();
    g.hardDrop();
    while (g.phase !== "active") g.advanceFrame(0);
    check("Master 20G: new piece is on the floor in the frame it appears", g.canFall(), false);
}
{
    // World rule reset limits: 10 movements, 8 rotations
    const g = started(arika);
    place(g, tetT, 0, 20, 3);
    g.advanceFrame(0); // touch down
    let moves = 0;
    for (let k = 0; k < 14; k++) { g.advanceFrame(k % 2 ? RIGHT_PUSH | LEFT_RELEASE : LEFT_PUSH | RIGHT_RELEASE); moves++; }
    const afterMoves = g.moveResets;
    check("World rule: only 10 movement resets per piece", afterMoves, 10);
    const h = started(arika);
    place(h, tetT, 0, 20, 3);
    h.advanceFrame(0);
    for (let k = 0; k < 12; k++) h.advanceFrame(k % 2 ? ROTL_PUSH : ROTR_PUSH);
    check("World rule: only 8 rotation resets per piece", h.rotationResets, 8);
}
{
    // Scoring: ((Level + Lines)/4 up + Soft + Sonic) x Lines x Combo + (LevelAfter)/2 up + Speed
    const g = started(arika);
    g.level = 10; g.combo = 1; g.score = 0;
    for (let r = 2; r < HEIGHT; r++) for (let c = 0; c < WIDTH; c++) g.setCell(r, c, r >= 20 && c < 8 ? 1 : 0);
    place(g, tetO, 0, 2, 7); // O occupies box columns 1-2 -> field columns 8-9
    g.activeTime = 5; g.softFrames = 3;
    g.hardDrop(); // sonic = 18 rows
    // level 10, 2 lines: ceil(12/4)=3; (3 + soft 3 + 1 for locking by hand + 18) * 2 * combo(1+4-2=3)
    // + ceil(12/2)=6 + speed(30-5=25)
    check("Master score formula (double, soft 3, hard drop lock, sonic 18, combo 3, active 5)", g.score, (3 + 3 + 1 + 18) * 2 * 3 + 6 + 25);
}
for (const manual of [true, false]) {
    // Classic: a soft drop lock on the ground adds 1 to Soft; a lock by the lock delay doesn't
    const g = started(tgmClassic);
    g.level = 0; g.combo = 1; g.score = 0;
    for (let r = 2; r < HEIGHT; r++) for (let c = 0; c < WIDTH; c++) g.setCell(r, c, r >= 20 && c < 8 ? 1 : 0);
    place(g, tetO, 0, 19, 7); // ARS O: box rows 1-2, columns 1-2 -> rows 20-21, columns 8-9
    if (manual) g.advanceFrame(SOFT_PUSH);
    else while (g.phase === "active") g.advanceFrame(0);
    // ceil(2/4)=1; manual: (1 + soft 1, the frame Down is held) * 2 * 3 + ceil(2/2)=1 + speed(30-1=29);
    // else (1) * 2 * 3 + 1 + speed(0). tetris.wiki: the lock frame is the 1 a manual lock adds
    check(`Classic score: ${manual ? "soft drop lock adds 1 to Soft (its frame, counted once)" : "lock delay lock adds nothing"}`,
        g.score, manual ? 2 * 2 * 3 + 1 + 29 : 1 * 2 * 3 + 1 + 0);
}
{
    // Torikan: reaching 500 after 7:00 ends the game
    const g = started(arika);
    g.level = 497; g.frames = 7 * 3600 + 1;
    for (let r = 2; r < HEIGHT; r++) for (let c = 0; c < WIDTH; c++) g.setCell(r, c, r >= 18 && c !== 9 ? 1 : 0);
    place(g, tetI, 1, 18, 7);
    g.lock();
    check("Master: reaching level 500 after 7:00 stops the game at 500", [g.isGameOver(), g.level, g.endTitle], [true, 500, "LEVEL STOP"]);
    const exam = createGame(arika, "standard", 0, 0, {}, { exams: true, qualified: 9, exam: { kind: "promotion", grade: 12 } });
    while (exam.phase !== "active") exam.advanceFrame(0);
    exam.level = 497; exam.frames = 7 * 3600 + 1;
    for (let r = 2; r < HEIGHT; r++) for (let c = 0; c < WIDTH; c++) exam.setCell(r, c, r >= 18 && c !== 9 ? 1 : 0);
    place(exam, tetI, 1, 18, 7);
    exam.lock();
    check("  ...but not in a promotional exam (tetris.wiki)", [exam.isGameOver(), exam.level], [false, 503]);
    const h = started(arika);
    h.level = 996;
    for (let r = 2; r < HEIGHT; r++) for (let c = 0; c < WIDTH; c++) h.setCell(r, c, r >= 18 && c !== 9 ? 1 : 0);
    place(h, tetI, 1, 18, 7);
    h.lock();
    check("Master: reaching level 999 stops the timer and leads to the staff roll", [h.isGameOver(), h.level, h.timerStopped, h.phase], [false, 999, true, "lineclear"]);
}
{
    // Arika I kicks differ from the Guideline ones: 2->R prefers (-2,0)
    const g = started(arika), h = started(guideline);
    for (const x of [g, h]) {
        for (let r = 2; r < HEIGHT; r++) for (let c = 0; c < WIDTH; c++) x.setCell(r, c, 0);
        place(x, tetI, 2, 10, 4); // horizontal I (row 12, cols 4-7)
        x.setCell(10, 6, 1); // block the in-place rotation to R (col 6)
    }
    g.rotate(-1); h.rotate(-1); // 2->R (counter-clockwise)
    check("I-piece 2->R kick: Arika tries (-2,0) first, Guideline (+1,0)", [g.curPiece_col - 4, h.curPiece_col - 4], [-2, 1]);
}
{
    // Countdown 3, 2, 1 (60 frames each); input is taken on the frame right after it
    const g = createGame(guideline);
    const shown = [g.countdown()], sounds = [];
    let first = 0;
    for (let f = 1; f <= 200 && !first; f++) {
        g.advanceFrame(0);
        shown.push(g.countdown());
        sounds.push(...g.takeSounds().filter(s => s === "count" || s === "go").map(s => s + "@" + f));
        if (g.phase === "active") first = f;
    }
    const runs = [];
    shown.forEach(d => runs.length && runs[runs.length - 1][0] === d ? runs[runs.length - 1][1]++ : runs.push([d, 1]));
    check("Countdown: 3 (also before the first frame), 2, 1 for 60 frames each, then the game", runs, [[3, 61], [2, 60], [1, 60], [0, 1]]);
    check("  ...the first active frame is frame 181, when 1 goes", [first, COUNTDOWN_STEPS * COUNTDOWN_STEP_FRAMES + 1], [181, 181]);
    check("  ...a count sound with each digit, go with the first active frame", sounds, ["count@1", "count@61", "count@121", "go@181"]);
    const h = createGame(guideline);
    for (let f = 0; f < 180; f++) h.advanceFrame(0);
    h.queue[0] = tetJ;
    const col = h.queue[0] && (h.advanceFrame(LEFT_PUSH), h.curPiece_col);
    const ref = createGame(guideline);
    for (let f = 0; f < 181; f++) ref.advanceFrame(0);
    check("  ...a press on that frame moves the new piece at once", [h.phase, col], ["active", ref.curPiece_col - 1]);
}
{
    // IRS: held rotation at spawn, falls back to spawn orientation when blocked
    const g = createGame(guideline);
    g.queue[0] = tetJ;
    g.advanceFrame(ROTR_PUSH);
    while (g.phase !== "active") g.advanceFrame(0);
    check("IRS: rotate held during READY spawns the piece rotated", g.curPiece_rotation, 1);
    // IHS
    const h = createGame(arika);
    const first = h.queue[0], second = h.queue[1];
    h.advanceFrame(HOLD_PUSH);
    while (h.phase !== "active") h.advanceFrame(0);
    check("IHS: hold held at spawn puts the first piece in hold", [h.heldpiece, h.curPiece_type], [first, second]);
}

// ---------------------------------------------------------------- Frame timing
function clearField(g) { for (let r = -18; r < HEIGHT; r++) for (let c = 0; c < WIDTH; c++) g.setCell(r, c, 0); }
function framesToNextPiece(g) { let f = 0; while (g.phase !== "active" && f < 200) { g.advanceFrame(0); f++; } return f; }

for (const [rs, name, expected] of [[guideline, "SRS (DAS 10, ARR 2)", [0, 10, 12, 14, 16, 18, 20]], [arika, "Arika (DAS 16 counted inclusively, ARR 1)", [0, 15, 16, 17, 18, 19]],
    [tgmTap, "TAP (DAS 16 counted inclusively, ARR 1)", [0, 15, 16, 17, 18, 19]], [tgmOriginal, "TGM1 (DAS 16 counted inclusively, ARR 1)", [0, 15, 16, 17, 18, 19]]]) {
    const g = createGame(rs, "test"); // no gravity: only shifting moves the piece
    for (let f = 0; f < 200 && g.phase !== "active"; f++) g.advanceFrame(0);
    clearField(g);
    place(g, tetO, 0, 10, 7); // O in columns 8-9: room for 8 shifts to the left
    const shifts = [];
    for (let f = 0; f <= 20; f++) {
        const before = g.curPiece_col;
        g.advanceFrame(f === 0 ? LEFT_PUSH : 0);
        if (g.curPiece_col !== before) shifts.push(f);
        else if (g.curPiece_col === -1) break; // reached the wall
    }
    check(`${name} auto-shift frames after holding left`, shifts.slice(0, expected.length), expected.slice(0, shifts.length));
}

// TGM: DAS shortens with the level; a key held across the change keeps its charge and the new
// threshold applies at once (the first auto-shift comes DAS - 1 frames after the press, then every frame)
for (const [rs, name, level, das, expected] of [[arika, "TGM3", 499, [16, 10], [0, 9, 10, 11]], [tgmTap, "TAP", 499, [16, 10], [0, 9, 10, 11]],
    [arika, "TGM3", 899, [10, 8], [0, 7, 8, 9]], [tgmTap, "TAP", 899, [10, 8], [0, 7, 8, 9]], [tgmOriginal, "TGM1 (no DAS speed-up)", 499, [16, 16], [0]]]) {
    const g = createGame(rs, "test");
    for (let f = 0; f < 200 && g.phase !== "active"; f++) g.advanceFrame(0);
    clearField(g);
    place(g, tetO, 0, 10, 7);
    g.level = level; g.updateTimings();
    const before = g.das, shifts = [];
    for (let f = 0; f < 14; f++) {
        if (f === 5) { g.level = level + 1; g.updateTimings(); }
        const col = g.curPiece_col;
        g.advanceFrame(f === 0 ? LEFT_PUSH : 0);
        if (g.curPiece_col !== col) shifts.push(f);
    }
    check(`${name} DAS ${das[0]} -> ${das[1]} when the level passes ${level + 1} with left held`, [before, g.das, shifts.slice(0, expected.length)], [das[0], das[1], expected]);
}

// TGM: a piece's first frame takes only IRS and gravity (NullpoMino's Classic rules, Cambridge)
{
    // TAP Death (20G) with DAS charged: the piece falls in its spawn column, then shifts
    const g = createGame(tgmTap, "death");
    while (g.phase !== "active") g.advanceFrame(0);
    g.advanceFrame(RIGHT_PUSH);
    for (let f = 0; f < 20; f++) g.advanceFrame(0); // fully charged, the piece against the wall
    while (g.phase === "active") g.advanceFrame(0);
    clearField(g); // nothing in the way of the next piece
    while (g.phase !== "active") g.advanceFrame(0); // the next piece enters, right still held
    const first = [g.curPiece_col, g.dasCounter];
    g.advanceFrame(0);
    check("TGM first frame: a charged DAS doesn't move a 20G piece until its second frame", [first[0], g.curPiece_col], [3, 4]);
}
{
    // A tap and up pressed on the first frame act on the next one
    const g = createGame(arika); // World rule: up is a hard drop
    while (g.phase !== "active") g.advanceFrame(0);
    g.hardDrop();
    while (g.phase === "are" && g.phaseCounter + 1 < g.phaseLength) g.advanceFrame(0);
    g.advanceFrame(LEFT_PUSH); // the frame the next piece enters
    const entered = [g.phase, g.curPiece_col];
    g.advanceFrame(0);
    const shifted = g.curPiece_col;
    g.advanceFrame(LEFT_RELEASE);
    g.hardDrop();
    while (g.phase === "are" && g.phaseCounter + 1 < g.phaseLength) g.advanceFrame(0);
    g.advanceFrame(LEFT_PUSH);
    g.advanceFrame(LEFT_RELEASE); // let go at once: like the arcade, the tap is lost
    const lost = g.curPiece_col;
    g.hardDrop();
    while (g.phase === "are" && g.phaseCounter + 1 < g.phaseLength) g.advanceFrame(0);
    g.advanceFrame(HARD_PUSH);
    const upFirst = g.phase;
    g.advanceFrame(0);
    check("  ...a shift pressed on the first frame moves on the next (unless let go), up hard drops on the next",
        [entered, shifted, lost, upFirst, g.phase], [["active", 3], 2, 3, "active", "are"]);
}
{
    // DAS doesn't charge on the frame a piece enters (tetris.wiki: TGM1, TAP)
    const g = createGame(tgmTap);
    while (g.phase !== "active") g.advanceFrame(0);
    g.hardDrop();
    while (g.phase === "are" && g.phaseCounter + 1 < g.phaseLength - 3) g.advanceFrame(0);
    g.advanceFrame(RIGHT_PUSH); // pressed during ARE: it charges there
    while (g.phase === "are" && g.phaseCounter + 1 < g.phaseLength) g.advanceFrame(0);
    const before = g.dasCounter;
    g.advanceFrame(0);
    check("  ...nor does DAS charge on it", [g.phase, g.dasCounter], ["active", before]);
    const guide = createGame(guideline);
    while (guide.phase !== "active") guide.advanceFrame(0);
    guide.hardDrop();
    while (guide.phase === "are" && guide.phaseCounter + 1 < guide.phaseLength) guide.advanceFrame(0);
    guide.advanceFrame(LEFT_PUSH);
    check("  ...the Guideline's pieces still move on their first frame", guide.curPiece_col, 2);
}

{
    // DAS doesn't charge during the line clear delay, the first frames of an ARE without a clear
    // (TGM1 4, TAP 1), the last frame of ARE and the frame a piece enters (tetris.wiki)
    const areCharging = mode => {
        const g = createGame(mode);
        while (g.phase !== "active") g.advanceFrame(0);
        clearField(g);
        g.advanceFrame(RIGHT_PUSH);
        g.hardDrop(); // nothing cleared: ARE
        g.das = 99; // never fully charged, so every charging frame shows
        const steps = [];
        while (g.phase === "are") { const before = g.dasCounter; g.advanceFrame(0); steps.push(g.dasCounter - before); }
        return steps.join("");
    };
    const tap = areCharging(tgmTap), tgm1 = areCharging(tgmOriginal);
    check("TGM DAS in ARE: TAP skips its first, last and entering frames; TGM1 its first four too",
        [tap, tgm1], ["0" + "1".repeat(24) + "00", "0000" + "1".repeat(24) + "00"]);
    const g = createGame(tgmTap);
    while (g.phase !== "active") g.advanceFrame(0);
    clearField(g);
    fill(g, ["######    "]);
    place(g, tetI, 0, 20, 6); // the ARS I lies in its box's row 1: columns 6-9 of the bottom row
    g.advanceFrame(RIGHT_PUSH);
    g.hardDrop();
    const clearing = g.phase, before = g.dasCounter;
    while (g.phase === "lineclear") g.advanceFrame(0);
    check("  ...nor during the line clear delay", [clearing, g.dasCounter], ["lineclear", before]);
}

// ---------------------------------------------------------------- Guideline handling options
function handlingGame(handling, variant = "test") {
    const g = createGame(guideline, variant, 0, 0, handling);
    for (let f = 0; f < 200 && g.phase !== "active"; f++) g.advanceFrame(0);
    clearField(g);
    return g;
}
// Frames (from the press, held after) on which the piece moved; input(f) adds keys on frame f
function shiftFrames(g, frames, input = () => 0) {
    const out = [];
    for (let f = 0; f <= frames; f++) {
        const before = g.curPiece_col;
        g.advanceFrame((f === 0 ? LEFT_PUSH : 0) | input(f));
        if (g.curPiece_col !== before) out.push(f);
    }
    return out;
}
{
    const g = handlingGame({ das: 6, arr: 1 });
    place(g, tetO, 0, 10, 7);
    check("Guideline handling DAS 6, ARR 1: auto-shift frames after holding left", shiftFrames(g, 10), [0, 6, 7, 8, 9, 10]);
}
{
    const g = handlingGame({ arr: 0 });
    place(g, tetO, 0, 10, 7);
    const moves = shiftFrames(g, 12);
    check("Guideline handling ARR 0: the first auto-shift goes straight to the wall", [moves, g.curPiece_col], [[0, 10], -1]);
}
{
    const g = handlingGame({ dcd: 4 });
    place(g, tetT, 0, 10, 6);
    const moves = shiftFrames(g, 22, f => f === 15 ? ROTR_PUSH : 0);
    check("Guideline handling DCD 4: a rotation pauses the charged auto-shift 4 frames, then ARR resumes", moves, [0, 10, 12, 14, 21]);
    const h = handlingGame({});
    place(h, tetT, 0, 10, 6);
    check("  ...without DCD the rotation doesn't interrupt it", shiftFrames(h, 22, f => f === 15 ? ROTR_PUSH : 0), [0, 10, 12, 14, 16, 18, 20]); // at the wall after 20
}
{
    const g = handlingGame({ sdf: 5 }, "standard");
    const h = handlingGame({ sdf: Infinity }, "standard");
    check("Guideline handling SDF: 5x gravity, Infinity drops at 20G", [g.softGravity / g.gravity, h.softGravity], [5, 20]);
}
{
    const g = handlingGame({ ghost: false });
    check("Guideline handling ghost off: no ghost row", g.getShadowRow(), -100);
}
{
    const g = handlingGame({ dropGuard: true });
    const row = g.curPiece_row;
    g.advanceFrame(HARD_PUSH);
    const early = [g.phase, g.curPiece_row];
    while (g.activeTime < 8) g.advanceFrame(0);
    g.advanceFrame(HARD_PUSH);
    check("Guideline hard drop guard: ignored in a piece's first 8 frames, works after", [early, g.phase], [["active", row], "are"]);
}
check("Handling options don't change TGM3, TAP or GB timing",
    [createGame(arika, "standard", 0, 0, { das: 3, arr: 0 }), createGame(tgmTap, "standard", 0, 0, { das: 3 }), createGame(gbTetris, "standard", 0, 0, { das: 3, ghost: false })].map(g => [g.das, g.arr]),
    [[16, 1], [16, 1], [23, 9]]);

{
    const g = createGame(guideline, "test");
    for (let f = 0; f < 200 && g.phase !== "active"; f++) g.advanceFrame(0);
    clearField(g);
    place(g, tetO, 0, 10, -1); // O against the left wall
    g.advanceFrame(LEFT_PUSH);
    check("Pushing against the left wall bumps once", g.takeBumps(), [-1]);
    for (let f = 0; f < 40; f++) g.advanceFrame(0);
    check("Holding against the wall doesn't repeat the bump", g.takeBumps(), []);
    g.advanceFrame(LEFT_RELEASE);
    g.advanceFrame(RIGHT_PUSH);
    check("Moving away from the wall doesn't bump", g.takeBumps(), []);
}
{
    const g = createGame(guideline, "test");
    for (let f = 0; f < 200 && g.phase !== "active"; f++) g.advanceFrame(0);
    g.takeHolds();
    g.advanceFrame(HOLD_PUSH);
    check("A hold is reported once", [g.takeHolds(), g.takeHolds()], [1, 0]);
    const h = createGame(guideline, "test");
    h.advanceFrame(HOLD_PUSH); // held through READY: IHS
    for (let f = 0; f < 200 && h.phase !== "active"; f++) h.advanceFrame(0);
    check("IHS is reported as a hold", [h.getHeldPiece() !== 0, h.takeHolds()], [true, 1]);
}

for (const [rs, level, name, expected] of [
    [guideline, 1, "SRS: ARE 6, no line clear delay", [6, 6]],
    [arika, 0, "Arika level 0: ARE 27 / clear 40 + line ARE 27", [27, 67]],
    [arika, 700, "Arika level 700: ARE 18 / clear 12 + line ARE 14", [18, 26]],
    [arika, 900, "Arika level 900: ARE 14 / clear 6 + line ARE 8", [14, 14]],
]) {
    const g = started(rs);
    clearField(g);
    g.level = level; g.updateTimings();
    place(g, tetO, 0, 10, 3);
    g.hardDrop();
    const plain = framesToNextPiece(g);
    clearField(g);
    for (let c = 0; c < 8; c++) { g.setCell(20, c, 1); g.setCell(21, c, 1); }
    place(g, tetO, 0, 10, 7);
    g.hardDrop(); // double
    const withClear = framesToNextPiece(g);
    check(`Frames from lock to next piece, ${name}`, [plain, withClear], expected);
}

for (const [rs, level, expected] of [[guideline, 1, 30], [guideline, 15, 30], [arika, 0, 30], [arika, 950, 17]]) {
    const g = started(rs);
    clearField(g);
    g.level = level; g.updateTimings();
    place(g, tetO, 0, 20, 3);
    let f = 0;
    while (g.phase === "active" && f < 200) { g.advanceFrame(0); f++; }
    check(`Lock delay, ${rs === arika ? "TGM3 World" : "Guideline"} level ${level}: ${expected} frames resting, locking on the next`, f, expected + 1);
}
{
    // At 20G a piece lands on the frame it enters: TAP Death's 30 frames then run from that frame
    const g = createGame(tgmTap, "death");
    while (g.phase !== "active") g.advanceFrame(0);
    const enteredResting = !g.canFall();
    let f = 0;
    while (g.phase === "active" && f < 100) { g.advanceFrame(0); f++; }
    check("Lock delay at 20G: a piece landing as it enters locks 30 frames after that frame", [enteredResting, f], [true, 30]);
}

// ---------------------------------------------------------------- T-spin classification
// T pointing up on the floor at the left wall, last move a rotation with the given kick test
function tspinLock(lastKick, frontCornerFilled) {
    const g = started(guideline);
    clearField(g);
    g.level = 1; g.lines = 0; g.score = 0; g.b2b = false; g.combo = -1;
    for (let c = 3; c < WIDTH; c++) g.setCell(21, c, 1); // the T completes row 21
    if (frontCornerFilled) g.setCell(20, 0, 1);
    place(g, tetT, 0, 20, 0);
    g.lastRotation = true;
    g.lastKick = lastKick;
    g.actionAge = 1;
    g.lock();
    return [g.actions.map(a => a.text), g.score];
}
check("T-spin mini single: back corners on the floor, one front corner (200 x level)", tspinLock(0, true), [["T-SPIN MINI SINGLE"], 200]);
check("T-spin mini upgraded to full by the 1x2 kick (5th test): T-spin single (800 x level)", tspinLock(4, true), [["T-SPIN SINGLE"], 800]);
check("Only 2 corners occupied: no T-spin, plain single (100 x level)", tspinLock(0, false), [["SINGLE"], 100]);

// ---------------------------------------------------------------- Classic rule (ARS)
{
    // Shapes: bottom-aligned in their 3x3 box (I excepted), L/J/T flat side up at spawn,
    // I/S/Z toggle between two states, and each L/J/T state is the clockwise turn of the last
    const cellsOf = m => { const c = []; m.forEach((row, i) => row.forEach((v, j) => v && c.push([i, j]))); return c; };
    // same shape regardless of position in the box
    const normalise = cells => { const r0 = Math.min(...cells.map(c => c[0])), c0 = Math.min(...cells.map(c => c[1])); return cells.map(([r, c]) => [r - r0, c - c0]).sort().join(";"); };
    const issues = [];
    for (const t of [tetT, tetL, tetJ, tetS, tetZ]) {
        for (let r = 0; r < 4; r++) if (Math.max(...cellsOf(ARS_SHAPES[t][r]).map(c => c[0])) !== 2) issues.push(`${t}:${r} not bottom-aligned`);
    }
    for (const t of [tetT, tetL, tetJ]) {
        if (ARS_SHAPES[t][0][1].slice(0, 3).join("") !== "111") issues.push(`${t} spawn not flat side up`);
        for (let r = 0; r < 4; r++) {
            const turned = cellsOf(ARS_SHAPES[t][r]).map(([i, j]) => [j, 2 - i]); // clockwise in the 3x3 box
            if (normalise(turned) !== normalise(cellsOf(ARS_SHAPES[t][(r + 1) % 4]))) issues.push(`${t}:${r}->${(r + 1) % 4} not a clockwise turn`);
        }
        for (const r of [1, 3]) { // vertical states stand in the centre column
            if (cellsOf(ARS_SHAPES[t][r]).filter(c => c[1] === 1).length !== 3) issues.push(`${t}:${r} not in the centre column`);
        }
    }
    for (const t of [tetI, tetS, tetZ]) {
        if (JSON.stringify(ARS_SHAPES[t][0]) !== JSON.stringify(ARS_SHAPES[t][2]) || JSON.stringify(ARS_SHAPES[t][1]) !== JSON.stringify(ARS_SHAPES[t][3])) issues.push(`${t} has more than two states`);
    }
    check("ARS shapes: bottom-aligned, L/J/T flat side up, I/S/Z two states, clockwise turns", issues, []);
}
{
    const g = createGame(tgmClassic);
    g.queue[0] = tetT;
    for (let f = 0; f < 200 && g.phase !== "active"; f++) g.advanceFrame(0);
    const rows = [...new Set(cellsAt(g).map(c => c.row))];
    check("Classic spawn: T appears in rows 19-20 (engine rows 2-3), colours are Sega/Arika (I red, T cyan, S purple, Z green)",
        [rows, g.palette[tetI], g.palette[tetT], g.palette[tetS], g.palette[tetZ]], [[2, 3], 6, 1, 2, 5]);
}
function cellsAt(g) {
    const cells = [];
    g.shapes[g.curPiece_type][g.curPiece_rotation].forEach((row, i) => row.forEach((v, j) => v && cells.push({ row: g.curPiece_row + i, col: g.curPiece_col + j })));
    return cells;
}
function classicAt(type, rot, row, col, blocks) {
    const g = started(tgmClassic);
    clearField(g);
    for (const [r, c] of blocks) g.setCell(r, c, 1);
    place(g, type, rot, row, col);
    return g;
}
{
    // Z (no centre column rule): basic rotation blocked, both kicks free -> kicks right
    const g = classicAt(tetZ, 0, 10, 4, [[10, 6]]); // blocks box cell (0,2) of the vertical Z
    check("Classic kicks: right is tried before left", [g.rotate(1), g.curPiece_col - 4], [true, 1]);
}
{
    // T from spawn: first colliding cell in the centre column -> no kick
    const g = classicAt(tetT, 0, 10, 4, [[10, 5]]); // box cell (0,1)
    const centre = [g.rotate(1), g.curPiece_rotation];
    // first colliding cell off-centre (box (1,0)) -> kicks, even with a centre cell also blocked
    const h = classicAt(tetT, 0, 10, 4, [[11, 4], [12, 5]]); // box (1,0) and (2,1)
    const offCentre = [h.rotate(1), h.curPiece_col - 4];
    // from a vertical state the rule doesn't apply: T state R -> 0 with the top-centre blocked kicks
    const v = classicAt(tetT, 1, 10, 4, [[11, 6]]); // state 0 needs box (1,2); R occupies (0,1),(1,0),(1,1),(2,1)
    const fromVertical = [v.rotate(-1), v.curPiece_col - 4];
    check("Centre column rule: centre hit fails / off-centre first kicks / not applied from vertical",
        [centre, offCentre, fromVertical], [[false, 0], [true, 1], [true, -1]]);
}
{
    // I wall kick into horizontal: vertical I against the left wall kicks 2 right
    const g = classicAt(tetI, 1, 10, -2, []);
    const wall = [g.rotate(1), g.curPiece_col + 2];
    // I floor kick: horizontal I on the floor rotating to vertical kicks up 2, only once
    const f = classicAt(tetI, 0, 20, 3, []);
    const first = [f.rotate(1), f.curPiece_row];
    f.curPiece_rotation = 0; f.curPiece_row = 20; // back on the floor, horizontal
    const second = f.rotate(1);
    // no floor kick in mid-air
    const m = classicAt(tetI, 0, 10, 3, [[13, 5]]); // blocks the vertical I below
    check("Classic I: wall kick 2 right / floor kick up 2 when grounded, only once / none mid-air",
        [wall, first, second, m.rotate(1)], [[true, 2], [true, 18], false, false]);
}
{
    // tetris.wiki's I wall kick examples: the I needs to touch a wall or the stack beside it
    // vertical I in column 2 (box column 0), a block in column 0 in the row it turns into
    const open = classicAt(tetI, 1, 10, 0, [[11, 0]]);
    const air = [open.rotate(1), open.curPiece_rotation];
    // the same with a block beside the I's bottom (column 1): kicks 1 right
    const touching = classicAt(tetI, 1, 10, 0, [[11, 0], [13, 1]]);
    const kicked = [touching.rotate(1), touching.curPiece_rotation, touching.curPiece_col];
    // against the right wall (column 9): kicks 1 left
    const right = classicAt(tetI, 1, 10, 7, []);
    const left = [right.rotate(1), right.curPiece_col];
    check("Classic I wall kicks only when touching: none in the open / 1 right beside the stack / 1 left off the right wall",
        [air, kicked, left], [[false, 1], [true, 2, 1], [true, 6]]);
}
{
    // T in a notch on the floor (state R), rotating to pointing up: wall kicks blocked, floor kick up 1
    const g = classicAt(tetT, 1, 19, 4, [[21, 4], [21, 6]]);
    const k1 = [g.rotate(1), g.curPiece_row, g.lockDelayZeroed];
    g.curPiece_rotation = 1; g.curPiece_row = 19; // back into the notch
    const k2 = [g.rotate(1), g.lockDelayZeroed]; // second floor kick; rotating after a floor kick zeroes lock delay
    g.curPiece_rotation = 1; g.curPiece_row = 19;
    const k3 = g.rotate(1);
    check("Classic T: floor kick up 1, twice per piece; rotating after a floor kick zeroes lock delay",
        [k1, k2, k3], [[true, 18, false], [true, true], false]);
}
{
    // Sonic drop: lands without locking, then the 30-frame lock delay runs
    const g = classicAt(tetO, 0, 5, 3, []);
    g.advanceFrame(HARD_PUSH);
    const landed = [g.phase, g.curPiece_row];
    let f = 1;
    while (g.phase === "active" && f < 100) { g.advanceFrame(0); f++; }
    // Soft drop on the ground locks immediately
    const s = classicAt(tetO, 0, 20, 3, []);
    s.advanceFrame(SOFT_PUSH);
    // Step reset only: moving along the floor doesn't reset the lock delay
    const w = classicAt(tetT, 0, 20, 4, []);
    let wf = 0;
    while (w.phase === "active" && wf < 200) { w.advanceFrame(wf % 2 ? LEFT_PUSH | RIGHT_RELEASE : RIGHT_PUSH | LEFT_RELEASE); wf++; }
    check("Classic: sonic drop doesn't lock (locks 30 frames after landing) / soft drop locks on the ground / moving doesn't reset lock delay",
        [landed, f, s.phase, wf], [["active", 19], 31, "are", 31]); // ARS O sits in box rows 1-2
}

// ---------------------------------------------------------------- Next preview
for (const [rs, name, expected] of [[guideline, "Guideline", 6], [arika, "TGM3 World", 3], [tgmClassic, "TGM3 Classic", 3]]) {
    const g = started(rs);
    let short = 0;
    for (let k = 0; k < 30; k++) {
        if (g.queue.length < g.nextCount || g.queue.slice(0, g.nextCount).some(t => !t)) short++;
        g.hardDrop();
        clearField(g);
        while (g.phase !== "active" && !g.isGameOver()) g.advanceFrame(0);
    }
    check(`${name}: ${expected} next pieces, queue never runs short`, [g.nextCount, short], [expected, 0]);
}

// ---------------------------------------------------------------- Combo chain
for (const [rs, name] of [[guideline, "Guideline"], [arika, "TGM3 World"], [tgmClassic, "TGM3 Classic"]]) {
    const g = started(rs);
    const chains = [g.chain];
    const lockOne = (clears) => {
        clearField(g);
        if (clears) for (let c = 0; c < 8; c++) g.setCell(21, c, 1);
        place(g, tetO, 0, rs === tgmClassic ? 19 : 20, 7);
        g.lock();
        g.phase = "active"; g.pendingRows = []; // skip line clear delay / ARE for this check
        chains.push(g.chain);
    };
    lockOne(true); lockOne(true); lockOne(true); lockOne(false); lockOne(true);
    check(`${name} combo chain: -1, then 0, 1, 2 on consecutive clears, -1 after a miss`, chains, [-1, 0, 1, 2, -1, 0]);
}

{
    // Line clear sounds carry the chain length while in a combo
    const g = started(guideline);
    const clearSounds = [];
    for (const lines of [1, 1, 2]) {
        clearField(g);
        for (let r = 22 - lines; r < 22; r++) for (let c = 0; c < 8; c++) g.setCell(r, c, 1);
        place(g, tetO, 0, 20, 7);
        g.takeSounds();
        g.lock();
        g.phase = "active";
        clearSounds.push(...g.takeSounds().filter(s => s.startsWith("clear")));
    }
    check("Line clear sounds name the combo step: clear1, clear1c1, clear2c2", clearSounds, ["clear1", "clear1c1", "clear2c2"]);
}

// ---------------------------------------------------------------- Sound events
{
    const g = started(guideline);
    for (let r = 2; r < HEIGHT; r++) for (let c = 0; c < WIDTH; c++) g.setCell(r, c, r === 21 && c < 8 ? 1 : 0);
    place(g, tetO, 0, 5, 3);
    g.takeSounds();
    for (let k = 0; k < 5; k++) g.shift(1); // O in columns 4-5: four moves, the fifth hits the wall
    g.rotate(1); // O doesn't rotate: no sound
    place(g, tetT, 0, 5, 3); g.rotate(1);
    place(g, tetO, 0, 5, 7); g.hardDrop();
    check("Sound events: move per successful shift, rotate, hard drop, line clear", g.takeSounds(), ["move", "move", "move", "move", "rotate", "harddrop", "clear1"]);
}

// ---------------------------------------------------------------- Hard drop cells (landing flash and trail)
{
    const g = started(guideline);
    for (let r = 2; r < HEIGHT; r++) for (let c = 0; c < WIDTH; c++) g.setCell(r, c, r >= 18 && c !== 9 ? 1 : 0);
    place(g, tetI, 1, 2, 7); g.hardDrop(); // vertical I into column 9: a Tetris
    check("Hard drop cells: a piece cleared entirely is still reported, in the rows it landed in, marked cleared",
        g.takeHardDropCells().map(c => [c.row, c.col, c.cleared]).sort((a, b) => a[0] - b[0]),
        [[18, 9, true], [19, 9, true], [20, 9, true], [21, 9, true]]);
    const h = started(guideline);
    for (let r = 2; r < HEIGHT; r++) for (let c = 0; c < WIDTH; c++) h.setCell(r, c, r === 21 && c < 8 ? 1 : 0);
    place(h, tetO, 0, 5, 7); h.hardDrop(); // O in columns 8-9, rows 20-21: a single
    check("Hard drop cells: surviving cells move down with the collapse, cleared ones don't",
        h.takeHardDropCells().map(c => [c.row, c.col, c.cleared]).sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]),
        [[21, 8, false], [21, 8, true], [21, 9, false], [21, 9, true]]);
}

// ---------------------------------------------------------------- Variants
for (const [rs, name, label] of [[guideline, "Guideline", ["GUIDELINE", "ENDLESS"]], [arika, "TGM3 World", ["TGM3 TI", "WORLD"]], [tgmClassic, "TGM3 Classic", ["TGM3 TI", "CLASSIC"]]]) {
    const variantLabel = variant => [label[0], rs === guideline ? variant : `${label[1]} ${variant}`];
    // Test: no gravity, soft drop still moves the piece
    const t = createGame(rs, "test");
    for (let f = 0; f < 200 && t.phase !== "active"; f++) t.advanceFrame(0);
    const row0 = t.curPiece_row;
    for (let f = 0; f < 600; f++) t.advanceFrame(0);
    const still = t.curPiece_row === row0 && t.phase === "active";
    t.advanceFrame(SOFT_PUSH);
    for (let f = 0; f < 10; f++) t.advanceFrame(0);
    check(`${name} test: piece stays put for 10 s, soft drop still moves it`, [still, t.curPiece_row > row0, t.getStats()[0]], [true, true, variantLabel("TEST")]);

    // Death: 20G from the start, no ghost
    const d = createGame(rs, "death");
    for (let f = 0; f < 200 && d.phase !== "active"; f++) d.advanceFrame(0);
    check(`${name} death: 20G (piece on the floor in its first frame), no ghost`, [d.gravity, d.canFall(), d.shadowRow], [20, false, -100]);

    // Holding at 20G: the swapped-in piece must already be on the floor after the hold frame
    d.advanceFrame(HOLD_PUSH);
    check(`${name} death: held piece lands on the floor in the frame it is swapped in`, d.canFall(), false);

    // Standard keeps the rule set's own gravity
    const s = started(rs);
    check(`${name} standard: rule set gravity and ghost`, [s.gravity === (rs === guideline ? guidelineGravity(1) : 4 / 256), s.shadowRow > 0, s.getStats()[0]], [true, true, label]);
}

// ---------------------------------------------------------------- Guideline marathon, sprint, ultra
for (const [variant, goal] of [["marathon", 150], ["sprint", 40], ["standard", 0]]) {
    // One line short of the goal: an O clears the bottom row
    const g = createGame(guideline, variant);
    for (let f = 0; f < 200 && g.phase !== "active"; f++) g.advanceFrame(0);
    g.lines = (goal || 150) - 1;
    for (let r = 2; r < HEIGHT; r++) for (let c = 0; c < WIDTH; c++) g.setCell(r, c, r === 21 && c < 8 ? 1 : 0);
    place(g, tetO, 0, 5, 7); g.hardDrop();
    const lines = g.getStats().find(row => row[0] === "LINES");
    if (goal) {
        check(`${variant}: the ${goal}th line ends the game with COMPLETE`, [g.isGameOver(), g.endTitle, lines], [true, "COMPLETE", ["LINES", `${goal} / ${goal}`]]);
    } else {
        check("Endless: the 150th line doesn't end the game", [g.isGameOver(), lines], [false, ["LINES", "150"]]);
    }
    // Sprint and ultra stay at level 1 whatever the lines
    if (variant === "sprint") check("Sprint: stays at level 1, shows TIME instead of LEVEL", [g.level, g.getStats().map(row => row[0])], [1, ["GUIDELINE", "TIME", "LINES", "SCORE"]]);
}
{
    const u = createGame(guideline, "ultra");
    for (let f = 0; f < 200 && u.phase !== "active"; f++) u.advanceFrame(0);
    u.frames = 0; // the setup loop ran the clock for a frame or two
    u.lines = 99; // would be level 10 in the other modes
    check("Ultra: starts at 2:00.00, stats are the mode, TIME, LINES, SCORE", [u.getStats()[0], u.getStats()[1]], [["GUIDELINE", "ULTRA"], ["TIME", "2:00.00"]]);
    u.frames = 7198;
    u.advanceFrame(0);
    check("Ultra: a frame before 2:00 the game is still running, 0:00.01 left", [u.isGameOver(), u.getStats()[1]], [false, ["TIME", "0:00.01"]]);
    u.advanceFrame(0);
    check("Ultra: the game ends with TIME UP after 7200 frames (2 minutes)", [u.isGameOver(), u.endTitle, u.getStats()[1]], [true, "TIME UP", ["TIME", "0:00.00"]]);
}

// ---------------------------------------------------------------- Guideline variable goal, master, dig
function startedGuideline(variant, startLevel = 0, height = 0) {
    const g = createGame(guideline, variant, startLevel, height);
    for (let f = 0; f < 200 && g.phase !== "active"; f++) g.advanceFrame(0);
    return g;
}
{
    const award = (n, tspin = null, b2b = false) => {
        const g = startedGuideline("variable");
        g.level = 10; g.b2b = b2b;
        g.scoreGuideline(n, tspin, []);
        return g.goalPoints;
    };
    check("Variable goal: base score / 100 per clear (1, 3, 5, 8), back-to-back x1.5 (12)",
        [award(1), award(2), award(3), award(4), award(4, null, true)], [1, 3, 5, 8, 12]);
    check("  ...T-spins: 4 with no lines, 8 / 12 / 16 with lines, 18 for a back-to-back double; minis 1 and 2",
        [award(0, "full"), award(1, "full"), award(2, "full"), award(3, "full"), award(2, "full", true), award(0, "mini"), award(1, "mini")],
        [4, 8, 12, 16, 18, 1, 2]);
    const g = startedGuideline("variable");
    check("  ...stats: mode, level, goal, lines, score",
        g.getStats().slice(0, 3), [["GUIDELINE", "VARIABLE"], ["LEVEL", "1"], ["GOAL", "0 / 5"]]);
    g.lines = 30;
    g.scoreGuideline(4, null, []);
    check("  ...a level needs 5 x level points; the rest is lost and lines don't level up",
        [g.level, g.goalPoints, g.getStats()[2]], [2, 0, ["GOAL", "0 / 10"]]);
    g.level = 15; g.goalPoints = 74;
    g.scoreGuideline(1, null, []);
    check("  ...meeting level 15's goal completes the marathon", [g.isGameOver(), g.endTitle, g.level], [true, "COMPLETE", 15]);
}
{
    const timing = start => { const g = startedGuideline("master", start); return [g.level, g.gravity, g.lockDelayMax, g.lineClearDelay]; };
    check("Master: 20G, lock and line clear delays by level (M1, M10, M11, M15, M30, rounded)",
        [timing(0), timing(9), timing(10), timing(14), timing(29), timing(40)],
        [[1, 20, 30, 30], [10, 20, 30, 3], [11, 20, 28, 1], [15, 20, 18, 1], [30, 20, 6, 1], [30, 20, 6, 1]]);
    const g = startedGuideline("master");
    check("  ...no ghost, stats show the M-level, lines to 300 and the time",
        [g.getShadowRow(), g.getStats().map(s => s[0]), g.getStats()[1], g.getStats()[2]],
        [-100, ["GUIDELINE", "LEVEL", "LINES", "TIME", "SCORE"], ["LEVEL", "M1"], ["LINES", "0 / 300"]]);
    clearField(g);
    g.lines = 9;
    for (let c = 0; c < 8; c++) g.setCell(21, c, 1);
    place(g, tetO, 0, 5, 7); g.hardDrop();
    check("  ...a level every 10 lines, from the chosen start", [g.level, g.lockDelayMax, startedGuideline("master", 5).level], [2, 30, 6]);
    check("  ...a line clear waits the level's line clear delay, then ARE", framesToNextPiece(g), 27 + 6);
    clearField(g);
    g.lines = 299;
    for (let c = 0; c < 8; c++) g.setCell(21, c, 1);
    place(g, tetO, 0, 5, 7); g.hardDrop();
    check("  ...300 lines complete it", [g.isGameOver(), g.endTitle], [true, "COMPLETE"]);
    const other = createGame(guideline, "sprint", 7);
    check("  ...other Guideline modes ignore the start level", other.level, 1);
}
{
    const garbage = g => {
        const holes = [];
        let rows = 0;
        for (let r = 2; r < HEIGHT; r++) {
            const empty = [];
            for (let c = 0; c < WIDTH; c++) if (!g.getCell(r, c)) empty.push(c);
            if (empty.length < WIDTH) { rows++; holes.push(empty); }
        }
        return { rows, oneHole: holes.every(h => h.length === 1), apart: holes.every((h, i) => i === 0 || h[0] !== holes[i - 1][0]) };
    };
    const sizes = [0, 1, 2].map(h => garbage(startedGuideline("dig", 0, h)));
    check("Dig: 5, 10 or 18 rows of garbage, one hole each, never in the same column as the row below",
        sizes, [5, 10, 18].map(rows => ({ rows, oneHole: true, apart: true })));
    const g = startedGuideline("dig");
    check("  ...stats: mode, time, garbage cleared, lines, score; level 1 throughout",
        [g.getStats()[0], g.getStats().map(s => s[0]), g.getStats()[2], g.level, createGame(guideline, "dig", 0, 7).digRows],
        [["GUIDELINE", "DIG"], ["GUIDELINE", "TIME", "GARBAGE", "LINES", "SCORE"], ["GARBAGE", "0 / 5"], 1, 18]);
    const fillHole = r => { for (let c = 0; c < WIDTH; c++) g.setCell(r, c, g.getCell(r, c) || 1); };
    fillHole(21);
    place(g, tetO, 0, 5, 3); g.lock();
    const afterOne = [g.getStats()[2], g.isGarbage.filter(x => x).length, g.isGarbage.slice(-4)];
    for (let c = 0; c < WIDTH; c++) g.setCell(10, c, 1); // a full row that isn't garbage
    place(g, tetO, 0, 5, 6); g.lock();
    check("  ...only garbage rows count; the garbage marks fall with the field",
        [afterOne, g.getStats()[2], g.isGameOver()], [[["GARBAGE", "1 / 5"], 4, [true, true, true, true]], ["GARBAGE", "1 / 5"], false]);
    for (let r = 18; r < HEIGHT; r++) fillHole(r);
    place(g, tetO, 0, 5, 0); g.lock();
    check("  ...clearing the last garbage row completes it", [g.getStats()[2], g.isGameOver(), g.endTitle], [["GARBAGE", "5 / 5"], true, "COMPLETE"]);
}

// ---------------------------------------------------------------- TGM3 grading
{
    const g = started(arika);
    check("Grade: starts at 9", g.getStats()[1], ["GRADE", "9"]);
    g.gradeCombo = 0; g.scoreGrade(1, 0);
    check("Grade: single at internal grade 0 = 10 points", g.gradePoints, 10);
    g.gradePoints = 0; g.gradeCombo = 2; // second clear of 2+ lines in a row: Tetris x1.5
    g.scoreGrade(4, 0);
    check("Grade: combo 2 Tetris = ceil(50 x 1.5) = 75", g.gradePoints, 75);
    g.scoreGrade(1, 300); // 10 x2 for level 250+
    check("Grade: level 250+ doubles points", g.gradePoints, 95);
    g.scoreGrade(2, 0);   // combo 2 double: ceil(20 x 1.2) = 24
    check("Grade: 100 points advance the internal grade and drop the remainder", [g.internalGrade, g.gradePoints, g.getStats()[1][1]], [1, 0, "8"]);
    g.gradePoints = 5; g.gradeDecay = 0; g.gradeCombo = 0;
    for (let i = 0; i < 80; i++) g.decayGrade();
    check("Grade: internal grade 1 loses a point every 80 frames", g.gradePoints, 4);
    g.gradeCombo = 1;
    for (let i = 0; i < 200; i++) g.decayGrade();
    check("Grade: no decay while a grade combo runs", g.gradePoints, 4);
    g.gradeCombo = 0; g.gradeDecay = 30; g.scoreGrade(1, 0);
    check("Grade: a clear without a new internal grade keeps the decay timer", [g.gradePoints, g.gradeDecay], [14, 30]);
    g.gradePoints = 95; g.scoreGrade(1, 0);
    check("Grade: a new internal grade restarts it", [g.internalGrade, g.gradeDecay], [2, 0]);
    g.gradePoints = 0;
    for (let i = 0; i < 200; i++) g.decayGrade();
    check("Grade: the timer doesn't run at 0 points", g.gradeDecay, 0);
}
{
    // Soft drop doesn't stop the decay: internal grade 30 loses a point every 10 frames
    const g = started(arika);
    g.internalGrade = 30; g.gradePoints = 50; g.gradeDecay = 0;
    g.advanceFrame(SOFT_PUSH);
    for (let f = 1; f < 20; f++) g.advanceFrame(0);
    check("Grade: points decay while soft dropping (2 in 20 frames)", [g.phase, g.held.soft, g.gradePoints], ["active", true, 48]);
}
{
    // Grade combo (Grade Recognition System, NullpoMino): doubles and more raise it, singles
    // keep it, a piece clearing nothing resets it; the first double of a combo is combo 1
    const g = started(arika);
    const clear = (n) => { g.chain = n ? g.chain + 1 : -1; g.scoreTgm(n); return g.gradeCombo; };
    const combos = [0, 1, 1, 2, 2, 1, 2, 0, 2].map(clear);
    check("Grade combo over miss, single, single, double, double, single, double, miss, double",
        combos, [0, 0, 0, 1, 2, 2, 3, 0, 1]);
    // points: 10 + 10 + 20 (x1) + 24 (x1.2) + 10 + 24 (x1.2) = 98, then +20 crosses 100
    const h = started(arika);
    const clearH = (n) => { h.chain = n ? h.chain + 1 : -1; h.scoreTgm(n); };
    [1, 1, 2, 2, 1, 2].forEach(clearH);
    check("Grade: singles in a combo don't raise the multiplier (98 points, not 110)", [h.internalGrade, h.gradePoints], [0, 98]);
}
{
    // Rounding up must not catch floating-point noise: 50 x 2.2 is 110.00000000000001 in doubles
    const g = started(arika);
    check("Grade: combo 5 Tetris at internal grade 0 = ceil(50 x 2.2) = 110, not 111", g.gradeAward(4, 5, 0), 110);
    check("Grade: combo 2 triple = ceil(40 x 1.4) = 56; combo 3 double = ceil(20 x 1.2) = 24",
        [g.gradeAward(3, 2, 0), g.gradeAward(2, 3, 0)], [56, 24]);
    g.internalGrade = 10;
    check("Grade: combo 5 triple at internal grade 10 = ceil(13 x 1.7) = 23, x3 at level 500", g.gradeAward(3, 5, 500), 69);
}
{
    const g = started(arika);
    g.internalGrade = 5; g.frames = 50 * 60;
    g.level = 70; g.updateSection(); g.updateTimings();
    check("COOL: *70 within 52 s earns a COOL, speed unchanged until the section ends", [g.coolPending, g.speedBonus, g.gravity], [true, 0, 8192 / 65536]);
    check("COOL: not in the grade until the section is finished", g.getStats()[1][1], "4");
    g.level = 100; g.frames = 60 * 60; g.updateSection(); g.updateTimings();
    check("COOL: counted when the section ends, speed level 100 ahead from then (level 100 plays like 200)",
        [g.cools, g.getStats()[1][1], g.speedBonus, g.gravity], [1, "3", 100, 1024 / 65536]);
    g.frames = (60 + 61) * 60; g.level = 170; g.updateSection();
    check("COOL: 61 s for 100-170 (limit 52 s) earns none", g.coolPending, false);
}
{
    // Judged at *70, shown at *82 (NullpoMino; tetris.wiki: displayed "around *80")
    const g = started(arika);
    const cools = () => g.actions.filter(a => a.text === "COOL!!").length;
    g.frames = 50 * 60;
    g.level = 70; g.updateSection();
    const at70 = [g.coolPending, cools()];
    g.level = 81; g.updateSection();
    const at81 = cools();
    g.level = 85; g.updateSection();
    const at85 = cools();
    g.level = 86; g.updateSection();
    check("COOL: earned at *70 but not shown until *82, then shown once", [at70, at81, at85, cools()], [[true, 0], 0, 1, 1]);
    g.actions = []; g.level = 100; g.frames = 60 * 60; g.updateSection();
    g.frames += 60 * 60; g.level = 182; g.updateSection();
    check("COOL: no message in a section without one", [g.coolPending, cools()], [false, 0]);
}
{
    // The 2 s rule compares with the previous section only if that one earned a COOL (NullpoMino)
    const g = started(arika);
    const at = (level, seconds) => { g.level = level; g.frames = g.sectionStart + seconds * 60; g.updateSection(); };
    at(70, 40); at(100, 70); // COOL with 0-70 in 40 s
    at(170, 43);
    check("COOL: 43 s after a 40 s COOL section is more than 2 s slower: none", g.coolPending, false);
    at(200, 70);
    at(270, 45);
    check("COOL: after a section without one, no 2 s comparison (45 s, limit 49 s)", g.coolPending, true);
    at(300, 70);
    at(370, 44);
    check("COOL: within 2 s of the previous COOL section (45 s -> 44 s)", g.coolPending, true);
}
{
    const g = started(arika);
    g.internalGrade = 5; g.gradePoints = 40; g.level = 100; g.frames = 91 * 60;
    g.updateSection();
    check("REGRET: section over 1:30 loses one grade boost and the points", [g.internalGrade, g.gradePoints], [4, 0]);
    const h = started(arika);
    h.gradePoints = 40; h.level = 100; h.frames = 91 * 60; h.updateSection();
    check("REGRET: no effect at no boosts, not even on the points", [h.internalGrade, h.gradePoints], [0, 40]);
}
for (const [secs, label, regret] of [[51, "4", true], [49, "3", false]]) {
    // The last section ends at 999, where the staff roll starts: it is judged too (limit 50 s)
    const g = started(arika);
    g.level = 996; g.section = 9; g.frames = 10 * 3600; g.sectionStart = g.frames - secs * 60;
    g.internalGrade = 6; g.gradePoints = 0; // the Tetris below adds 120 points: internal grade 7, 6 boosts, grade "3"
    for (let r = 2; r < HEIGHT; r++) for (let c = 0; c < WIDTH; c++) g.setCell(r, c, r >= 18 && c !== 9 ? 1 : 0);
    place(g, tetI, 1, 18, 7);
    g.lock();
    check(`REGRET: 900-999 in ${secs} s ${regret ? "loses" : "keeps"} a grade boost at the end`,
        [g.level, g.getStats()[1][1], g.actions.some(a => a.text === "REGRET!!")], [999, label, regret]);
}

// ---------------------------------------------------------------- TGM3 staff roll
// Reach 999 with a Tetris; rows 14-17 hold blocks that drop to the bottom
function to999(mode, setup = () => {}) {
    const g = started(mode);
    g.level = 996; g.section = 9; g.frames = 8 * 3600; g.sectionStart = g.frames - 30 * 60; // no REGRET
    setup(g);
    for (let r = 2; r < HEIGHT; r++) for (let c = 0; c < WIDTH; c++) g.setCell(r, c, r >= 14 && c !== 9 ? 1 : 0);
    place(g, tetI, 1, 18, 7);
    g.lock();
    g.takeClearedCells();
    while (g.phase === "lineclear") g.advanceFrame(0);
    return g;
}
function toRoll(mode, setup) {
    const g = to999(mode, setup);
    let f = 0;
    while (g.phase === "rollstart") { g.advanceFrame(0); f++; }
    return [g, f];
}
for (const mode of [arika, tgmClassic]) {
    const name = mode === arika ? "World" : "Classic";
    const g = to999(mode);
    const frames = g.frames, delay = g.lineClearDelay;
    check(`${name} roll start: after the 999 clear the field empties, not the game`, [g.phase, g.isGameOver(), g.getCell(21, 0), g.getCell(18, 0)], ["rollstart", false, 1, 1]);
    for (let f = 0; f <= delay; f++) g.advanceFrame(0);
    check(`${name} roll start: after a line clear delay the bottom row goes first, with confetti`,
        [g.getCell(21, 0), g.getCell(20, 0), g.takeClearedCells().length], [0, 1, 9]);
    for (let f = 0; f < 6; f++) g.advanceFrame(0);
    check(`${name} roll start: then a row every 6 frames`, [g.getCell(20, 0), g.getCell(19, 0)], [0, 1]);
    const [h, f] = toRoll(mode);
    check(`${name} roll start: lasts line clear delay + 22 rows x 6 + 2 frames, then the roll's first piece`,
        [f, h.roll, h.phase, h.curPiece_type !== 0, h.fieldEmpty(), h.frames], [delay + 22 * 6 + 2, "fading", "active", true, true, frames]);
    check(`${name} roll: the time row counts the roll down (3238 frames, 53.96 s)`, h.getStats()[3], ["ROLL", "0:53.96"]);
    check(`${name} roll: the first piece goes through its entry frame (active 1 frame, 20G already on the floor)`,
        [h.activeTime, h.canFall()], [1, false]);
}
{
    const [g] = toRoll(arika, g => { g.cools = 9; g.internalGrade = 27; });
    check("Roll: all 9 COOLs and internal grade 27 give the invisible roll", [g.roll, g.actions.map(a => a.text)], ["invisible", ["INVISIBLE ROLL"]]);
    const [h] = toRoll(arika, g => { g.cools = 8; g.internalGrade = 31; });
    const [k] = toRoll(arika, g => { g.cools = 9; g.internalGrade = 25; }); // the 999 Tetris makes it 26
    check("Roll: 8 COOLs or internal grade 26 give the fading roll", [h.roll, k.roll, h.actions.map(a => a.text)], ["fading", "fading", ["STAFF ROLL"]]);
}
for (const [roll, setup, ages] of [
    ["fading", () => {}, [[0, 1], [290, 1], [295, 0.5], [300, 0]]],
    ["invisible", g => { g.cools = 9; g.internalGrade = 27; }, [[0, 1], [1, 1], [2, 0]]],
]) {
    const [g] = toRoll(arika, setup);
    place(g, tetO, 0, 18, 3);
    g.lock();
    const lockedAt = g.rollFrames;
    const alphas = ages.map(([age]) => { g.rollFrames = lockedAt + age; return [age, g.getCellAlpha(20, 4)]; });
    check(`Roll (${roll}): settled blocks hide after locking`, alphas, ages);
    g.endGame("GAME OVER", "");
    check(`Roll (${roll}): and show again when the game ends`, g.getCellAlpha(20, 4), 1);
}
{
    const [g] = toRoll(arika);
    for (let c = 0; c < WIDTH; c++) for (let r = 18; r < HEIGHT; r++) if (c !== 9) g.setCell(r, c, 1);
    g.lockTime = g.field.map(() => new Array(WIDTH).fill(g.rollFrames));
    const before = g.score;
    place(g, tetI, 1, 18, 7);
    g.lock();
    check("Fading roll: a Tetris earns 0.26 roll grade, no score or level", [g.rollPoints, g.score - before, g.level], [26, 0, 999]);
    const [h] = toRoll(arika, g => { g.cools = 9; g.internalGrade = 27; });
    const label = h.gradeLabel();
    for (let c = 0; c < WIDTH; c++) for (let r = 18; r < HEIGHT; r++) if (c !== 9) h.setCell(r, c, 1);
    place(h, tetI, 1, 18, 7);
    h.lock();
    check("Invisible roll: a Tetris earns a whole grade", [h.rollPoints, label, h.gradeLabel()], [100, "m7", "m8"]);
}
{
    // Internal grade 27: 15 boosts + 9 COOLs = 24 (m7); one invisible Tetris makes 25 (m8)
    const [g] = toRoll(arika, g => { g.cools = 9; g.internalGrade = 27; });
    check("Roll: the displayed grade starts at boosts + COOLs", g.gradeLabel(), "m7");
    g.rollPoints = 100;
    check("Roll: each whole roll grade adds a grade", g.gradeLabel(), "m8");
    const frames = g.frames;
    g.rollFrames = 3236;
    g.advanceFrame(0);
    check("Roll: the timer stays stopped during the roll", [g.isGameOver(), g.frames], [false, frames]);
    g.advanceFrame(0);
    check("Roll: surviving 3238 frames ends with COMPLETE and the 1.6 clear bonus (m9)",
        [g.isGameOver(), g.endTitle, g.rollPoints, g.gradeLabel()], [true, "COMPLETE", 260, "m9"]);
}
for (const [roll, setup, title, label] of [
    ["invisible", g => { g.cools = 9; g.internalGrade = 31; }, "GRAND MASTER", "Grand Master"],
    ["fading", g => { g.cools = 8; g.internalGrade = 31; }, "COMPLETE", "MasterM"],
]) {
    // 17 boosts + COOLs, plus roll grades up to grade 32
    const [g] = toRoll(arika, setup);
    g.rollPoints = 1000;
    const during = g.gradeLabel();
    g.rollFrames = 3237;
    g.advanceFrame(0);
    check(`Grand Master: ${roll} roll survived at grade 32 gives ${label}, capped at MasterM before the end`,
        [during, g.endTitle, g.gradeLabel()], ["MasterM", title, label]);
}
{
    const [g] = toRoll(arika);
    for (let r = 2; r < HEIGHT; r++) for (let c = 1; c < WIDTH; c++) g.setCell(r, c, 1);
    g.startAre(0); // the next piece is blocked
    // the 999 Tetris took internal grade 0 to 1: one boost
    check("Roll: topping out ends the game with the grade reached", [g.endTitle, g.endSub], ["GAME OVER", "GRADE 8 — ESC FOR MENU"]);
}
{
    const [g] = toRoll(arika);
    g.gradePoints = 50; g.gradeCombo = 0;
    for (let f = 0; f < 300; f++) g.advanceFrame(0);
    check("Roll: grade points don't decay", g.gradePoints, 50);
}

// ---------------------------------------------------------------- Hidden test setups
{
    const g = createGame(arika);
    check("Test setup: not during READY", g.testSetup("roll"), false);
    const ready = started(arika);
    check("Test setup: not in Guideline", started(guideline).testSetup("roll"), false);
    const timeBefore = ready.frames;
    check("Test setup roll: starts the roll start at once, timer stopped", [ready.testSetup("roll"), ready.phase, ready.level, ready.timerStopped, ready.frames], [true, "rollstart", 999, true, timeBefore]);
    check("  ...only once", ready.testSetup("roll"), false);
    while (ready.phase === "rollstart") ready.advanceFrame(0);
    check("  ...and gives the fading roll at 20G", [ready.roll, ready.gravity], ["fading", 20]);
    check("Test setup rollend: in the roll, to its last 5 seconds", [ready.testSetup("rollend"), ready.rollFrames], [true, 3238 - 300]);
    for (let f = 0; f < 300; f++) ready.advanceFrame(0);
    check("  ...which then ends", [ready.isGameOver(), ready.endTitle], [true, "COMPLETE"]);
    check("Test setup rollend: nothing outside the roll", started(arika).testSetup("rollend"), false);
}
{
    const g = started(arika);
    g.testSetup("invisible");
    while (g.phase === "rollstart") g.advanceFrame(0);
    check("Test setup invisible: the invisible roll at m7", [g.roll, g.gradeLabel()], ["invisible", "m7"]);
    const h = started(tgmClassic);
    h.testSetup("gm");
    while (h.phase === "rollstart") h.advanceFrame(0);
    const during = h.gradeLabel();
    h.testSetup("rollend");
    for (let f = 0; f < 300; f++) h.advanceFrame(0);
    check("Test setup gm: surviving the invisible roll gives Grand Master", [h.roll, during, h.endTitle, h.gradeLabel()], ["invisible", "MasterO", "GRAND MASTER", "Grand Master"]);
}
{
    const g = started(arika);
    const section = g.frames - g.sectionStart;
    check("Test setup kill: 10 s before 15:00, the section time unchanged", [g.testSetup("kill"), g.frames, g.frames - g.sectionStart], [true, 15 * 3600 - 600, section]);
    for (let f = 0; f < 600; f++) g.advanceFrame(0);
    check("  ...then the speed-up", [g.isGameOver() || g.gravity], [20]);
    check("  ...not again once past", g.testSetup("kill"), false);
}

// ---------------------------------------------------------------- TGM3 15-minute speed-up
for (const mode of [arika, tgmClassic]) {
    const g = started(mode);
    g.frames = 15 * 3600 - 2;
    g.advanceFrame(0);
    const before = [g.gravity, g.are, g.lineAre, g.das, g.lockDelayMax, g.lineClearDelay];
    g.advanceFrame(0);
    check(`${mode === arika ? "World" : "Classic"}: at 15:00 the game speeds up to Shirase 600-1099: 20G, ARE 6, line ARE 5, DAS 6, lock 12, line clear 3`,
        [before, [g.gravity, g.are, g.lineAre, g.das, g.lockDelayMax, g.lineClearDelay]],
        [[1024 / 65536, 27, 27, 16, 30, 40], [20, 6, 5, 6, 12, 3]]);
    g.level = 50;
    g.updateTimings();
    check("  ...and stays so after level changes", [g.gravity, g.lockDelayMax], [20, 12]);
}
{
    const g = createGame(arika, "easy");
    while (g.phase !== "active") g.advanceFrame(0);
    g.frames = 15 * 3600 - 1;
    g.advanceFrame(0);
    check("  ...Easy speeds up too (tetris.wiki)", [g.gravity, g.are, g.lineAre, g.das, g.lockDelayMax, g.lineClearDelay], [20, 6, 5, 6, 12, 3]);
}

// ---------------------------------------------------------------- TAP (TGM2 The Absolute Plus)
function startedTap(variant = "standard") {
    const g = createGame(tgmTap, variant);
    for (let f = 0; f < 200 && g.phase !== "active"; f++) g.advanceFrame(0);
    return g;
}
{
    // raincomplex/randomizers randos/tgm.py, tgm_tap testPRNG: seed unrand(0xeb48c724)
    const seed = Math.imul((0xeb48c724 - 12345) | 0, 0xeeb9eb65 | 0) >>> 0;
    const r = new TapRandomizer(seed);
    const names = { [tetI]: "i", [tetZ]: "z", [tetS]: "s", [tetJ]: "j", [tetL]: "l", [tetO]: "o", [tetT]: "t" };
    let s = "";
    for (let n = 0; n < 40; n++) s += names[r.next()];
    check("TAP randomizer reproduces the reference sequence", s, "tijostzijslzijsltozjsltojzltsoizljsizlto");
    const firsts = new Set();
    for (let k = 0; k < 200; k++) firsts.add(new TapRandomizer(k * 7919).next());
    check("TAP randomizer: the first piece is never S, Z or O", [firsts.has(tetS), firsts.has(tetZ), firsts.has(tetO)], [false, false, false]);
}
{
    const g = createGame(tgmTap);
    g.queue[0] = tetT;
    for (let f = 0; f < 200 && g.phase !== "active"; f++) g.advanceFrame(0);
    const rows = [...new Set(cellsAt(g).map(c => c.row))];
    check("TAP: one next piece, no hold, ARS shapes and Sega colours, spawn in rows 19-20",
        [g.nextCount, g.hasHold, g.shapes === ARS_SHAPES, g.palette[tetI], rows], [1, false, true, 6, [2, 3]]);
    const type = g.curPiece_type, next = g.rnd_get_queue(0);
    g.advanceFrame(HOLD_PUSH);
    check("TAP: the hold button does nothing", [g.curPiece_type, g.getHeldPiece(), g.rnd_get_queue(0)], [type, 0, next]);
    const h = createGame(tgmTap);
    const first = h.rnd_get_queue(0);
    h.advanceFrame(HOLD_PUSH); // held through READY: no IHS
    for (let f = 0; f < 200 && h.phase !== "active"; f++) h.advanceFrame(0);
    check("TAP: no IHS either", [h.curPiece_type, h.getHeldPiece()], [first, 0]);
    const death = startedTap("death").getStats();
    check("TAP stats: rule set and mode, then grade, level, time, score; Death has no grade yet",
        [g.getStats()[0], g.getStats().slice(1).map(s => s[0]), death[0], death[1]],
        [["TGM2 TAP", "MASTER"], ["GRADE", "LEVEL", "TIME", "SCORE"], ["TGM2 TAP", "DEATH"], ["GRADE", "—"]]);
}
{
    const g = startedTap();
    const at = level => { g.level = level; g.updateTimings(); return [g.gravity * 256, g.are, g.lineAre, g.das, g.lockDelayMax, g.lineClearDelay]; };
    check("TAP Master timing: gravity (1/256 G) and ARE / line ARE / DAS / lock / line clear by level",
        [at(0), at(30), at(251), at(499), at(500), at(600), at(700), at(800), at(900)],
        [[4, 27, 27, 16, 30, 40], [6, 27, 27, 16, 30, 40], [256, 27, 27, 16, 30, 40], [768, 27, 27, 16, 30, 40], [5120, 27, 27, 10, 30, 25],
         [5120, 27, 18, 10, 30, 16], [5120, 18, 14, 10, 30, 12], [5120, 14, 8, 10, 30, 6], [5120, 14, 8, 8, 17, 6]]);
    g.level = 100; g.updateTimings(); g.frames = 15 * 3600 - 1;
    g.advanceFrame(0); g.advanceFrame(0);
    check("TAP Master: no speed-up at 15:00, ARR 1", [g.gravity * 256, g.lockDelayMax, g.arr], [80, 30, 1]);
    g.level = 99; g.setShadow();
    const ghost99 = g.getShadowRow() !== -100;
    g.level = 100; g.setShadow();
    check("TAP Master: ghost piece below level 100 only", [ghost99, g.getShadowRow()], [true, -100]);
}
{
    const g = startedTap("death");
    const at = level => { g.level = level; g.updateTimings(); return [g.gravity, g.are, g.lineAre, g.das, g.lockDelayMax, g.lineClearDelay]; };
    check("TAP Death timing: 20G, ARE / line ARE / DAS / lock / line clear by level",
        [at(0), at(100), at(200), at(300), at(400), at(500), at(999)],
        [[20, 18, 14, 12, 30, 12], [20, 14, 8, 12, 26, 6], [20, 14, 8, 11, 22, 6], [20, 8, 8, 10, 18, 6], [20, 7, 7, 8, 15, 5], [20, 6, 6, 8, 15, 4], [20, 6, 6, 8, 15, 4]]);
    check("TAP Death: no ghost piece", g.getShadowRow(), -100);
}
function tapAt(type, rot, row, col, blocks) {
    const g = startedTap();
    clearField(g);
    for (const [r, c] of blocks) g.setCell(r, c, 1);
    place(g, type, rot, row, col);
    return g;
}
{
    const z = tapAt(tetZ, 0, 10, 4, [[10, 6]]);
    const t = tapAt(tetT, 0, 10, 4, [[10, 5]]);
    const wall = tapAt(tetI, 1, 10, -2, []); // vertical I against the left wall
    const floor = tapAt(tetI, 0, 20, 3, []); // horizontal I on the floor
    const notch = tapAt(tetT, 1, 19, 4, [[21, 4], [21, 6]]); // T in a notch, rotating to pointing up
    check("TAP rotation: basic kicks (right first) and centre column rule, but no I kicks and no floor kicks",
        [[z.rotate(1), z.curPiece_col - 4], t.rotate(1), wall.rotate(1), floor.rotate(1), notch.rotate(1)], [[true, 1], false, false, false, false]);
    const s = tapAt(tetO, 0, 5, 3, []);
    s.advanceFrame(HARD_PUSH);
    const sonic = [s.phase, s.curPiece_row];
    const d = tapAt(tetO, 0, 20, 3, []);
    d.advanceFrame(SOFT_PUSH);
    check("TAP drops: Up is a sonic drop (no lock), soft drop locks on the ground", [sonic, d.phase], [["active", 19], "are"]);
}
// Lock a vertical I into column 9 of `rows` full rows (rows above 22 - rows stay as they are)
function tapClear(g, rows, setup = () => {}) {
    for (let r = HEIGHT - rows; r < HEIGHT; r++) for (let c = 0; c < 9; c++) g.setCell(r, c, 1);
    place(g, tetI, 1, HEIGHT - 4, 7);
    setup(g);
    g.lock();
    g.takeClearedCells();
}
{
    const g = startedTap();
    clearField(g);
    g.level = 10;
    tapClear(g, 3);
    const triple = g.level;
    g.level = 10; clearField(g);
    tapClear(g, 4);
    check("TAP levels: one per line (a triple +3, a Tetris +4)", [triple, g.level], [13, 14]);
}
{
    // double at level 10 after a miss (combo 1 -> 3): soft 5 frames, sonic 3, active 20 frames of a 30-frame lock
    const g = startedTap();
    clearField(g);
    g.setCell(10, 0, 1); // keeps the field from being empty
    g.level = 10; g.score = 0; g.combo = 1;
    tapClear(g, 2, g => { g.softFrames = 5; g.sonicMax = 3; g.activeTime = 20; g.manualLock = false; });
    const double = g.score;
    // a perfect clear: bravo x4; locked by Down on the ground: soft 1, that frame
    const h = startedTap();
    clearField(h);
    h.level = 10; h.score = 0; h.combo = 1;
    tapClear(h, 4, g => { g.activeTime = 40; g.softFrames = 1; g.manualLock = true; });
    check("TAP score: (ceil((lv+n)/4) + soft + 2 sonic) x n x combo x bravo + ceil(lv after/2) + 7 x speed",
        [double, h.score, h.actions.map(a => a.text)],
        [(3 + 5 + 6) * 2 * 3 + 6 + 10 * 7, (4 + 1) * 4 * 7 * 4 + 7, ["QUAD", "BRAVO"]]);
}
{
    const g = startedTap();
    g.internalGrade = 0;
    const awards = [g.gradeAward(1, 1, 0), g.gradeAward(1, 3, 0), g.gradeAward(2, 2, 0), g.gradeAward(3, 5, 0), g.gradeAward(4, 10, 0), g.gradeAward(4, 1, 250)];
    check("TAP grade points: ceil(base x combo) x level multiplier; singles take the combo, Tetrises don't",
        awards, [10, 12, 28, 88, 50, 100]);
    g.internalGrade = 31;
    const s9 = g.gradeLabel();
    g.internalGrade = 14;
    check("TAP grades: internal grade 14 is 1, 31 is S9 (no Master grades from points)", [g.gradeLabel(), s9], ["1", "S9"]);
}
{
    const g = startedTap();
    const judge = (section, seconds, tetrises, times = []) => {
        g.mrollQualified = true; g.sectionTimes = times.slice(); g.section = section;
        g.frames = 100000; g.sectionStart = g.frames - seconds * 60; g.sectionTetrises = tetrises;
        g.level = section * 100 + 100; g.updateTapSection();
        return g.mrollQualified;
    };
    const five = [60, 62, 64, 58, 61].map(s => s * 60); // average 61 s
    check("TAP M-roll sections: first five within 65 s with 2 Tetrises; 500s within their average + 2 s; later ones within the last + 2 s",
        [judge(0, 65, 2), judge(0, 65.02, 2), judge(4, 60, 1), judge(5, 63, 1, five), judge(5, 63.02, 1, five), judge(5, 60, 0, five),
         judge(6, 63, 1, [...five, 61 * 60]), judge(6, 63.02, 1, [...five, 61 * 60])],
        [true, false, false, true, false, false, true, false]);
    check("  ...the times are kept", [g.sectionTimes.length, g.section, g.sectionStart], [7, 7, g.frames]);
}
// Reach 999 in TAP Master with a Tetris, every section so far meeting the M-roll conditions
function tapTo999(setup = () => {}) {
    const g = startedTap();
    g.level = 996; g.section = 9; g.frames = 8 * 3600; g.sectionStart = g.frames - 30 * 60;
    g.sectionTimes = new Array(9).fill(55 * 60);
    g.internalGrade = 31;
    setup(g);
    clearField(g);
    tapClear(g, 4);
    while (g.phase === "lineclear") g.advanceFrame(0);
    while (g.phase === "rollstart") g.advanceFrame(0);
    return g;
}
{
    const g = tapTo999();
    check("TAP M-roll: S9, 8:45 and every section qualified give the M-roll", [g.roll, g.actions.map(a => a.text), g.frames], ["invisible", ["M-ROLL"], 8 * 3600]);
    const late = tapTo999(g => { g.frames = 525 * 60 + 1; g.sectionStart = g.frames - 30 * 60; });
    const s8 = tapTo999(g => { g.internalGrade = 29; });
    const slow = tapTo999(g => { g.mrollQualified = false; });
    check("TAP fading roll: over 8:45, below S9 or a failed section", [late.roll, s8.roll, slow.roll, slow.actions.map(a => a.text)], ["fading", "fading", "fading", ["STAFF ROLL"]]);
    check("TAP roll: the time row counts down 3694 frames (61.56 s)", slow.getStats()[3], ["ROLL", "1:01.56"]);
    place(slow, tetO, 0, 18, 3);
    slow.lock();
    const lockedAt = slow.rollFrames;
    const alphas = [0, 230, 235, 240].map(age => { slow.rollFrames = lockedAt + age; return slow.getCellAlpha(20, 4); });
    check("TAP fading roll: blocks are gone 4 s after locking", alphas, [1, 1, 0.5, 0]);
}
{
    const g = tapTo999();
    for (let c = 0; c < 9; c++) for (let r = 18; r < HEIGHT; r++) g.setCell(r, c, 1);
    g.lockTime = g.field.map(() => new Array(WIDTH).fill(g.rollFrames));
    const score = g.score, grade = g.internalGrade, points = g.gradePoints;
    place(g, tetI, 1, 18, 7);
    g.lock();
    check("TAP roll: clears count lines, but no score or grade points", [g.rollLines, g.score - score, g.internalGrade, g.gradePoints, g.level], [4, 0, grade, points, 999]);
    g.rollFrames = g.rollLength - 1;
    while (!g.isGameOver()) g.advanceFrame(0);
    const green = [g.endTitle, g.endSub.split(" — ")[0], g.gradeLabel()];
    const h = tapTo999();
    h.rollLines = 32; h.rollFrames = h.rollLength - 1;
    while (!h.isGameOver()) h.advanceFrame(0);
    check("TAP M-roll survived: GM, green line under 32 lines, orange line from 32", [green, h.endSub.split(" — ")[0]], [["GRAND MASTER", "GREEN LINE", "GM"], "ORANGE LINE"]);
    const k = tapTo999();
    for (let r = 2; r < HEIGHT; r++) for (let c = 0; c < WIDTH; c++) k.setCell(r, c, c === 4 ? 0 : 1);
    k.curPiece_type = 0;
    k.spawn(tetO, false);
    check("TAP M-roll topped out: M", [k.isGameOver(), k.gradeLabel()], [true, "M"]);
    const f = tapTo999(g => { g.internalGrade = 25; });
    f.rollFrames = f.rollLength - 1;
    while (!f.isGameOver()) f.advanceFrame(0);
    check("TAP fading roll survived: grade kept, orange line", [f.endTitle, f.gradeLabel(), f.endSub.includes("ORANGE LINE")], ["COMPLETE", "S6", true]);
}
// TAP Death: a Tetris from level 496 at the given time
function deathTo500(frames) {
    const g = startedTap("death");
    g.level = 496; g.frames = frames;
    clearField(g);
    tapClear(g, 4);
    return g;
}
{
    const g = deathTo500(205 * 60);
    check("TAP Death: level 500 by 3:25.00 gives M, the game goes on", [g.level, g.gradeLabel(), g.timerStopped, g.actions.map(a => a.text)], [500, "M", false, ["QUAD", "BRAVO", "GRADE M"]]);
    const h = deathTo500(205 * 60 + 1);
    const time = h.formatTime();
    while (h.phase === "lineclear" || h.phase === "rollstart") h.advanceFrame(0);
    const inRoll = [h.level, h.gradeLabel(), h.roll, h.formatTime() === time];
    h.advanceFrame(0);
    for (let f = 0; f < 60; f++) h.advanceFrame(0);
    check("TAP Death: later than that the timer stops at 500 and the credits roll, blocks visible, no grade",
        [inRoll, h.level, h.getCellAlpha(21, 0)], [[500, "—", "visible", true], 500, 1]);
    h.rollFrames = h.rollLength - 1;
    while (!h.isGameOver()) h.advanceFrame(0);
    check("  ...and end with EXCELLENT", [h.endTitle, h.gradeLabel()], ["EXCELLENT", "—"]);
}
{
    const g = startedTap("death");
    g.level = 996; g.frames = 20 * 3600; g.finalGrade = "M";
    clearField(g);
    tapClear(g, 4);
    const at999 = [g.level, g.gradeLabel(), g.timerStopped];
    while (g.phase === "lineclear" || g.phase === "rollstart") g.advanceFrame(0);
    check("TAP Death: 999 gives GM whatever the time, then a visible credit roll", [at999, g.roll], [[999, "GM", true], "visible"]);
    for (let r = 2; r < HEIGHT; r++) for (let c = 0; c < WIDTH; c++) g.setCell(r, c, c === 4 ? 0 : 1);
    g.curPiece_type = 0;
    g.spawn(tetO, false);
    check("  ...topping out in the roll keeps it", [g.isGameOver(), g.gradeLabel()], [true, "GM"]);
}
{
    const g = startedTap();
    const d = startedTap("death");
    check("TAP test setups: no 15-minute speed-up to skip to, no M-roll in Death", [g.testSetup("kill"), d.testSetup("invisible"), d.testSetup("gm")], [false, false, false]);
    check("  ...Death's roll setup goes to the 999 roll with GM", [d.testSetup("roll"), d.level, d.gradeLabel()], [true, 999, "GM"]);
    g.frames = 10 * 3600;
    g.testSetup("gm");
    while (g.phase === "rollstart") g.advanceFrame(0);
    check("  ...Master's gm setup goes to the M-roll", [g.roll, g.frames <= 525 * 60], ["invisible", true]);
}

// ---------------------------------------------------------------- GB (1989)
function startedGb(variant = "standard", level = 0, height = 0) {
    const g = createGame(gbTetris, variant, level, height);
    for (let f = 0; f < 200 && g.phase !== "active"; f++) g.advanceFrame(0);
    return g;
}
function placeGb(g, type, rot, row, col) { place(g, type, rot, row, col); g.gravityAcc = 0; }
const cellsOf = g => {
    const out = [];
    g.shapes[g.curPiece_type][g.curPiece_rotation].forEach((line, i) => line.forEach((v, j) => {
        if (v) out.push([g.curPiece_row + i, g.curPiece_col + j]);
    }));
    return out;
};
{
    const r = new GbRandomizer(12345);
    const counts = [0, 0, 0, 0, 0, 0, 0], N = 700000;
    for (let i = 0; i < N; i++) counts[r.nextIndex()]++;
    const pct = counts.map(c => Math.round(1000 * c / N) / 10); // L J I O Z S T
    // tetris.wiki / harddrop.com: L 10.7%, J I Z 13.7%, O S T 16.1%
    check("GB randomizer: the OR bug deals L ~10.7%, J, I, Z ~13.7%, O, S, T ~16.1%",
        pct.map((p, i) => Math.abs(p - [10.7, 13.7, 13.7, 16.1, 13.7, 16.1, 16.1][i]) < 0.3), [true, true, true, true, true, true, true]);
    const u = new GbRandomizer(1);
    u.history = [2, 6]; // I in the preview, T entering play
    u.rand = (() => { const rolls = [4, 1]; return () => rolls.shift(); })();
    check("  ...compares with the piece entering play: a Z after T, I is refused ((4 | 2 | 6) = 6), a J taken", u.nextIndex(), 1);
    const g = startedGb(), h = g.randomizer.history.map(i => g.randomizer.pieces[i]);
    check("  ...a hidden piece behind the preview: the next roll's history is that piece and the preview, which enters play then",
        h, [g.queue[1], g.queue[0]]);
    const s = new GbRandomizer(1);
    s.history = [1, 1]; // J, J: a third J needs three rolls in a row
    s.rand = (() => { const rolls = [1, 1, 3]; return () => rolls.shift(); })();
    check("  ...rerolls a third of a kind, and an L after two Js ((0 | 1 | 1) = 1)", s.nextIndex(), 3);
    const t = new GbRandomizer(1);
    t.history = [1, 1];
    t.rand = () => 1;
    check("  ...takes the third roll as it comes", t.nextIndex(), 1);
}
{
    const g = startedGb();
    check("GB: no hold, one next piece, no ghost, starts at level 0", [g.hasHold, g.nextCount, g.getShadowRow(), g.level], [false, 1, -100, 0]);
    check("  ...stats name the rule set and mode", [g.getStats()[0], startedGb("btype").getStats()[0]], [["GB", "A-TYPE"], ["GB", "B-TYPE"]]);
    clearField(g);
    g.curPiece_type = 0;
    g.spawn(tetT, false);
    check("  ...an 18-row well (rows 4-21), drawn from its top row", [g.wellTop, HEIGHT - g.wellTop, g.firstDrawnRow], [4, 18, 4]);
    check("  ...T spawns flat side up with its highest blocks in the well's second row", cellsOf(g), [[5, 3], [5, 4], [5, 5], [6, 4]]);
    g.curPiece_type = 0;
    g.spawn(tetI, false);
    check("  ...I spawns in the third row of its box", cellsOf(g), [[6, 3], [6, 4], [6, 5], [6, 6]]);
    clearField(g);
    placeGb(g, tetT, 0, 3, 3); // T in the well's top two rows: turning needs the row above
    check("  ...pieces can't turn or reach above the well", [g.rotate(1), g.movePossible(1, 3, 0, tetT), g.movePossible(3, 3, 0, tetT)], [false, false, true]);
    check("  ...other rule sets keep 20 rows and draw the two above", [createGame(guideline).wellTop, createGame(guideline).firstDrawnRow], [2, 0]);
}
{
    const g = startedGb();
    clearField(g);
    placeGb(g, tetT, 0, 10, 3);
    g.rotate(1); g.rotate(1);
    check("GB: T turns about the centre of its box (pointing up sits in the top two rows)", cellsOf(g), [[10, 4], [11, 3], [11, 4], [11, 5]]);
    placeGb(g, tetZ, 0, 10, 3);
    g.rotate(1);
    check("  ...Z stands left-handed", cellsOf(g), [[10, 4], [11, 3], [11, 4], [12, 3]]);
    placeGb(g, tetI, 1, 10, -1); // vertical I in column 0
    check("  ...no wall kicks: the I against the wall can't turn", [g.rotate(1), g.curPiece_rotation, g.curPiece_col], [false, 1, -1]);
    placeGb(g, tetT, 1, 10, 3);
    g.held.rotr = true;
    g.curPiece_type = 0;
    g.spawn(tetT, false);
    g.held.rotr = false;
    check("  ...no IRS", g.curPiece_rotation, 0);
}
{
    const g = startedGb();
    clearField(g);
    placeGb(g, tetO, 0, 10, 3);
    g.advanceFrame(HARD_PUSH);
    check("GB: no hard or sonic drop", [g.curPiece_row, g.phase], [10, "active"]);
    const rows = [];
    placeGb(g, tetO, 0, 5, 3);
    for (let f = 1; f <= 106; f++) { const r = g.curPiece_row; g.advanceFrame(0); if (g.curPiece_row !== r) rows.push(f); }
    check("  ...level 0 gravity: a row every 53 frames", rows, [53, 106]);
    g.level = 9; g.updateTimings();
    const lvl = [g.gbFrames];
    g.level = 20; g.updateTimings(); lvl.push(g.gbFrames);
    check("  ...level 9: 11 frames, level 20: 3 frames", lvl, [11, 3]);
}
{
    const g = startedGb();
    clearField(g);
    placeGb(g, tetO, 0, 19, 3); // resting on the floor
    g.gravityAcc = 40;
    let f = 0;
    while (g.phase === "active" && f < 100) { g.advanceFrame(f % 2 ? LEFT_RELEASE : LEFT_PUSH); f++; }
    check("GB: no lock delay: locks on the next gravity row, moving doesn't reset it", f, 13);
}
{
    const g = startedGb();
    clearField(g);
    placeGb(g, tetO, 0, 5, 3);
    const rows = [];
    for (let f = 0; f < 10; f++) { const r = g.curPiece_row; g.advanceFrame(f === 0 ? SOFT_PUSH : 0); if (g.curPiece_row !== r) rows.push(f); }
    check("GB: soft drop: a row with the press, then every 3 frames", rows, [0, 3, 6, 9]);
    while (g.phase === "active") g.advanceFrame(0);
    check("  ...locking by soft drop scores the rows dropped", g.score, 19 - 5);
    while (g.phase !== "active") g.advanceFrame(0);
    const r = g.curPiece_row;
    for (let f = 0; f < 10; f++) g.advanceFrame(0);
    check("  ...still holding it doesn't drop the next piece", g.curPiece_row, r);
    g.advanceFrame(SOFT_RELEASE);
    for (let f = 0; f < 10; f++) g.advanceFrame(f === 0 ? SOFT_PUSH : 0);
    check("  ...pressing it again does", g.curPiece_row > r, true);
}
{
    const g = startedGb();
    clearField(g);
    placeGb(g, tetO, 0, 10, 7);
    const shifts = [];
    for (let f = 0; f <= 45; f++) {
        const before = g.curPiece_col;
        g.advanceFrame(f === 0 ? LEFT_PUSH : 0);
        if (g.curPiece_col !== before) shifts.push(f);
    }
    // the ROM sets its counter to $17 on the press and to 9 after each auto-shift
    check("GB auto-shift frames after holding left (DAS 23, ARR 9)", shifts, [0, 23, 32, 41]);
}
{
    const g = startedGb();
    clearField(g);
    for (let c = 0; c < 8; c++) { g.setCell(20, c, 1); g.setCell(21, c, 1); }
    placeGb(g, tetO, 0, 19, 7);
    g.lock();
    check("GB: double at level 0 scores 100", g.score, 100);
    check("  ...line clear and ARE take 93 frames", framesToNextPiece(g), 93);
    clearField(g);
    placeGb(g, tetO, 0, 19, 3);
    g.lock();
    check("  ...ARE 2 frames", framesToNextPiece(g), 2);
    g.level = 5; g.lines = 36; g.score = 0;
    tapClear(g, 4, h => { h.curPiece_col = 8; });
    check("  ...four lines at level 5 score 1200 x 6, 40 lines reach level 4", [g.score, g.level, g.gbFrames], [7200, 4, 37]);
    g.lines = 205; g.score = 999000;
    clearField(g);
    tapClear(g, 4, h => { h.curPiece_col = 8; });
    check("  ...level stops at 20, score at 999,999", [g.level, g.score], [20, 999999]);
}
// Visible rows from the top: true for a garbage row (some blocks, at least one hole)
const garbageRows = g => {
    const rows = [];
    for (let r = 2; r < HEIGHT; r++) {
        let n = 0;
        for (let c = 0; c < WIDTH; c++) if (g.getCell(r, c)) n++;
        rows.push(n > 0 && n < WIDTH);
    }
    return rows;
};
{
    const g = startedGb("btype", 0, 3);
    const rows = garbageRows(g);
    check("GB B-Type height 3: six rows of garbage, each with a hole", rows.lastIndexOf(false), HEIGHT - 2 - 6 - 1);
    check("  ...rows above are empty", rows.slice(0, HEIGHT - 2 - 6).every(x => !x), true);
    check("  ...the stats show the height", g.getStats().map(s => s[0]), ["GB", "LEVEL", "HEIGHT", "LINES", "SCORE"]);
    check("GB B-Type height 0: no garbage; height 5: ten rows",
        [garbageRows(startedGb("btype")).some(x => x), garbageRows(startedGb("btype", 0, 5)).filter(x => x).length], [false, 10]);
    check("  ...height stays within 0-5, and A-Type ignores it",
        [createGame(gbTetris, "btype", 0, 9).height, createGame(gbTetris, "btype", 0, -1).height, garbageRows(startedGb("standard", 0, 5)).some(x => x)], [5, 0, false]);
    clearField(g);
    g.lines = 24;
    tapClear(g, 1, h => { h.curPiece_col = 8; });
    check("  ...ends at 25 lines with the level unchanged", [g.isGameOver(), g.endTitle, g.level], [true, "COMPLETE", 0]);
}
{
    const g = createGame(gbTetris, "standard", 5);
    check("GB start level 5: level 5 speed from the start", [g.level, g.gbFrames, g.getStats()[1]], [5, 33, ["LEVEL", "5"]]);
    for (; g.phase !== "active";) g.advanceFrame(0);
    clearField(g);
    g.lines = 55;
    tapClear(g, 4, h => { h.curPiece_col = 8; });
    const at59 = g.level;
    while (g.phase !== "active") g.advanceFrame(0);
    clearField(g);
    tapClear(g, 1, h => { h.curPiece_col = 8; });
    check("  ...first level-up after 60 lines (start x 10 + 10), not before", [at59, g.lines, g.level], [5, 60, 6]);
    check("GB start level stays within 0-9, and other rule sets ignore it",
        [createGame(gbTetris, "standard", 12).level, createGame(gbTetris, "standard", -3).level, createGame(guideline, "sprint", 5).level, createGame(arika, "standard", 5).level],
        [9, 0, 1, 0]);
    const b = createGame(gbTetris, "btype", 7);
    for (; b.phase !== "active";) b.advanceFrame(0);
    clearField(b);
    b.lines = 20;
    tapClear(b, 4, h => { h.curPiece_col = 8; });
    check("GB B-Type at level 7: scores x 8 and keeps its level", [b.score, b.level], [1200 * 8, 7]);
}

// ---------------------------------------------------------------- TGM1 (Tetris The Grand Master)
function startedTgm1(variant = "standard") {
    const g = createGame(tgmOriginal, variant);
    for (let f = 0; f < 200 && g.phase !== "active"; f++) g.advanceFrame(0);
    return g;
}
{
    // raincomplex/randomizers randos/tgm.py, class tgm (4 rolls), seed 0x1234abcd
    const r = new Tgm1Randomizer(0x1234abcd);
    const names = { [tetI]: "i", [tetZ]: "z", [tetS]: "s", [tetJ]: "j", [tetL]: "l", [tetO]: "o", [tetT]: "t" };
    let s = "";
    for (let n = 0; n < 40; n++) s += names[r.next()];
    check("TGM1 randomizer reproduces the reference sequence (4 rolls, history Z Z Z Z)", s, "jistloitzslotjzloijstlzostlzjiotzsljiszt");
    const firsts = new Set();
    for (let k = 0; k < 200; k++) firsts.add(new Tgm1Randomizer(k * 7919).next());
    check("  ...the first piece is never S, Z or O", [firsts.has(tetS), firsts.has(tetZ), firsts.has(tetO)], [false, false, false]);
}
{
    const g = startedTgm1();
    check("TGM1: one next piece, no hold, ARS shapes and Sega colours",
        [g.nextCount, g.hasHold, g.shapes === ARS_SHAPES, g.palette[tetI]], [1, false, true, 6]);
    check("  ...stats: rule set and mode, then grade, level, time, score",
        [g.getStats()[0], g.getStats().slice(1).map(s => s[0]), startedTgm1("20g").getStats()[0]],
        [["TGM1", "MASTER"], ["GRADE", "LEVEL", "TIME", "SCORE"], ["TGM1", "20G"]]);
    const at = level => { g.level = level; g.updateTimings(); return [g.gravity * 256, g.are, g.lineAre, g.das, g.lockDelayMax, g.lineClearDelay]; };
    check("  ...gravity (1/256 G) as TAP's, delays the same at every level (ARE 30, DAS 16, lock 30, line clear 41)",
        [at(0), at(100), at(251), at(500), at(900)],
        [[4, 30, 30, 16, 30, 41], [80, 30, 30, 16, 30, 41], [256, 30, 30, 16, 30, 41], [5120, 30, 30, 16, 30, 41], [5120, 30, 30, 16, 30, 41]]);
    g.level = 100; g.updateTimings(); g.frames = 15 * 3600 - 1;
    g.advanceFrame(0); g.advanceFrame(0);
    check("  ...no speed-up at 15:00", [g.gravity * 256, g.lockDelayMax], [80, 30]);
    const twenty = startedTgm1("20g");
    check("TGM1 20G: 20G from level 0, no ghost", [twenty.gravity, twenty.getShadowRow()], [20, -100]);
}
function tgm1At(type, rot, row, col, blocks = []) {
    const g = startedTgm1();
    clearField(g);
    for (const [r, c] of blocks) g.setCell(r, c, 1);
    place(g, type, rot, row, col);
    return g;
}
{
    const z = tgm1At(tetZ, 0, 10, 4, [[10, 6]]);
    const wall = tgm1At(tetI, 1, 10, -2);
    const notch = tgm1At(tetT, 1, 19, 4, [[21, 4], [21, 6]]);
    check("TGM1 rotation: basic kicks, but no I kicks and no floor kicks",
        [[z.rotate(1), z.curPiece_col - 4], wall.rotate(1), notch.rotate(1)], [[true, 1], false, false]);
    const s = tgm1At(tetO, 0, 5, 3);
    s.advanceFrame(HARD_PUSH);
    const up = [s.phase, s.curPiece_row];
    const d = tgm1At(tetO, 0, 20, 3);
    d.advanceFrame(SOFT_PUSH);
    check("TGM1 drops: Up does nothing (no sonic or hard drop), soft drop locks on the ground", [up, d.phase], [["active", 5], "are"]);
    const h = tgm1At(tetT, 0, 10, 3);
    const type = h.curPiece_type;
    h.advanceFrame(HOLD_PUSH);
    check("TGM1: the hold button does nothing", [h.curPiece_type, h.getHeldPiece()], [type, 0]);
}
{
    const g = startedTgm1();
    clearField(g);
    g.setCell(10, 0, 1); // keeps the field from being empty
    g.level = 10; g.score = 0; g.combo = 1;
    tapClear(g, 2, h => { h.softFrames = 5; h.sonicMax = 3; h.activeTime = 20; h.manualLock = false; });
    check("TGM1 score: (ceil((level + lines) / 4) + soft) x lines x combo, no sonic, speed or level terms",
        [g.score, g.level], [(3 + 5) * 2 * 3, 12]);
    clearField(g);
    g.level = 0; g.score = 0; g.combo = 1;
    tapClear(g, 4);
    check("  ...bravo x4 for clearing the field", [g.score, g.actions.some(a => a.text === "BRAVO")], [1 * 4 * 7 * 4, true]);
    const grade = score => { g.score = score; return g.gradeLabel(); };
    check("TGM1 grades from the score: 9 at 0, 1 at 12,000, S1 at 16,000, S9 at 120,000",
        [grade(0), grade(399), grade(400), grade(11999), grade(12000), grade(16000), grade(119999), grade(120000), grade(500000)],
        ["9", "9", "8", "2", "1", "S1", "S8", "S9", "S9"]);
}
{
    const g = startedTgm1();
    clearField(g);
    g.level = 99; g.curPiece_type = 0;
    g.spawn(tetT, false);
    check("TGM1 levels: a new piece doesn't pass a section stop (x99)", g.level, 99);
    const checkpoint = (level, score, frames) => {
        const h = startedTgm1();
        clearField(h);
        h.level = level; h.score = score; h.frames = frames;
        tapClear(h, 1);
        return h.gmQualified;
    };
    check("TGM1 GM checkpoints: 12,000 by 4:15 at 300, 40,000 by 7:30 at 500",
        [checkpoint(299, 12000, 255 * 60), checkpoint(299, 11000, 100), checkpoint(299, 20000, 255 * 60 + 1),
         checkpoint(499, 40000, 450 * 60), checkpoint(499, 39000, 100), checkpoint(450, 0, 0)],
        [true, false, false, true, false, true]);
}
function tgm1To999(score, frames = 600 * 60) {
    const g = startedTgm1();
    clearField(g);
    g.level = 998; g.score = score; g.frames = frames;
    tapClear(g, 1);
    return g;
}
{
    const g = tgm1To999(100000);
    check("TGM1 level 999 without GM: the game ends with the grade", [g.isGameOver(), g.endTitle, g.endSub.startsWith("GRADE S8"), g.level], [true, "COMPLETE", true, 999]);
    const late = tgm1To999(130000, 810 * 60 + 1);
    check("  ...126,000 points but after 13:30: no GM", [late.endTitle, late.gradeLabel()], ["COMPLETE", "S9"]);
    const gm = tgm1To999(130000);
    check("TGM1 GM: 126,000 by 13:30 at 999 with both checkpoints met", [gm.isGameOver(), gm.gradeLabel(), gm.timerStopped], [false, "GM", true]);
    for (let f = 0; f < 300 && gm.phase !== "active"; f++) gm.advanceFrame(0);
    check("  ...then the staff roll with blocks staying visible", [gm.roll, gm.rollLength, gm.rollHide.visible], ["visible", 2968, Infinity]);
    place(gm, tetO, 0, 19, 3);
    gm.lock();
    for (let f = 0; f < 200; f++) gm.advanceFrame(0);
    check("  ...locked blocks keep showing", gm.getCellAlpha(21, 4), 1);
    gm.curPiece_type = 0;
    for (let c = 0; c < WIDTH; c++) for (let r = 2; r < 5; r++) gm.setCell(r, c, 1);
    gm.spawn(tetT, false);
    check("  ...topping out in it still ends in GM", [gm.isGameOver(), gm.endTitle, gm.gradeLabel()], [true, "GRAND MASTER", "GM"]);
    const surv = tgm1To999(130000);
    for (let f = 0; f < 300 && surv.phase !== "active"; f++) surv.advanceFrame(0);
    surv.rollFrames = surv.rollLength - 1;
    surv.advanceFrame(0);
    check("  ...surviving it too", [surv.isGameOver(), surv.endTitle], [true, "GRAND MASTER"]);
}
{
    const g = startedTgm1();
    check("TGM1 test setups: only the GM roll and its end", [g.testSetup("invisible"), g.testSetup("kill"), g.testSetup("roll"), g.nextRoll, g.gradeLabel()],
        [false, false, true, "visible", "GM"]);
}

// ---------------------------------------------------------------- NES (Tetris for the NES)
function startedNes(variant = "standard", level = 0, height = 0) {
    const g = createGame(nesTetris, variant, level, height);
    for (let f = 0; f < 200 && g.phase !== "active"; f++) g.advanceFrame(0);
    return g;
}
{
    const r = new NesRandomizer(12345);
    const counts = [0, 0, 0, 0, 0, 0, 0], N = 700000;
    let prev = -1, repeats = 0;
    for (let i = 0; i < N; i++) { const p = r.nextIndex(); counts[p]++; if (p === prev) repeats++; prev = p; }
    const pct = counts.map(c => 100 * c / N);
    check("NES randomizer: about 1/7 each, and a repeat only from the reroll (1/4 x 1/7 = 3.6%)",
        [pct.every(p => p > 13 && p < 15.5), Math.round(1000 * repeats / N) / 10], [true, 3.6]);
    const s = new NesRandomizer(1);
    s.prev = 3;
    s.rand = (() => { const rolls = [3, 3]; return () => rolls.shift(); })();
    const t = new NesRandomizer(1);
    t.rand = (() => { const rolls = [7, 2]; return () => rolls.shift(); })();
    check("  ...rerolls the previous piece and 7 once, taking the reroll as it comes", [s.nextIndex(), t.nextIndex()], [3, 2]);
}
{
    const g = startedNes();
    check("NES: no hold, one next piece, no ghost, a 20-row well, starts at level 0",
        [g.hasHold, g.nextCount, g.getShadowRow(), g.wellTop, g.level], [false, 1, -100, 2, 0]);
    check("  ...stats name the rule set and mode", [g.getStats()[0], startedNes("btype").getStats()[0]], [["NES", "A-TYPE"], ["NES", "B-TYPE"]]);
    clearField(g);
    const spawned = type => { g.curPiece_type = 0; g.spawn(type, false); return cellsOf(g); };
    check("  ...T spawns flat side up in the top two visible rows, its centre in column 5",
        spawned(tetT), [[2, 4], [2, 5], [2, 6], [3, 5]]);
    check("  ...I spawns flat in the top row, O in columns 4-5", [spawned(tetI), spawned(tetO)],
        [[[2, 3], [2, 4], [2, 5], [2, 6]], [[2, 4], [2, 5], [3, 4], [3, 5]]]);
}
{
    const g = startedNes();
    clearField(g);
    placeGb(g, tetT, 0, 10, 3);
    g.rotate(1);
    const cw = cellsOf(g);
    g.rotate(1);
    check("NES: T turns clockwise about its centre (12, 5): pointing left, then up", [cw, cellsOf(g)],
        [[[11, 5], [12, 4], [12, 5], [13, 5]], [[11, 5], [12, 4], [12, 5], [12, 6]]]);
    placeGb(g, tetZ, 0, 10, 3);
    g.rotate(1);
    check("  ...Z and S stand right-handed (right of the centre)", cellsOf(g), [[11, 6], [12, 5], [12, 6], [13, 5]]);
    placeGb(g, tetS, 0, 10, 3);
    g.rotate(-1);
    check("  ...S", cellsOf(g), [[11, 5], [12, 5], [12, 6], [13, 6]]);
    placeGb(g, tetI, 1, 10, -2); // vertical I in column 0
    check("  ...no wall kicks: the I against the wall can't turn", [g.rotate(1), g.curPiece_rotation], [false, 1]);
    placeGb(g, tetI, 0, 0, 3); // flat I at spawn: may turn up into the two rows above the well
    check("  ...pieces turn into the two rows above the well, no higher", [g.rotate(1), g.movePossible(-1, 3, 1, tetI)], [true, false]);
    g.held.rotr = true;
    g.curPiece_type = 0;
    g.spawn(tetT, false);
    g.held.rotr = false;
    check("  ...no IRS", g.curPiece_rotation, 0);
}
{
    const g = startedNes();
    clearField(g);
    placeGb(g, tetO, 0, 10, 3);
    g.advanceFrame(HARD_PUSH);
    check("NES: no hard drop", [g.curPiece_row, g.phase], [10, "active"]);
    const frames = level => { g.level = level; g.updateTimings(); return g.gbFrames; };
    check("  ...gravity in frames per row: 48 at 0, 6 at 9, 3 at 18, 2 at 19-28, 1 from 29",
        [0, 1, 8, 9, 10, 13, 16, 18, 19, 28, 29, 40].map(frames), [48, 43, 8, 6, 5, 4, 3, 3, 2, 2, 1, 1]);
    g.level = 0; g.updateTimings();
    const rows = [];
    placeGb(g, tetO, 0, 5, 3);
    for (let f = 1; f <= 96; f++) { const r = g.curPiece_row; g.advanceFrame(0); if (g.curPiece_row !== r) rows.push(f); }
    check("  ...level 0: a row every 48 frames", rows, [48, 96]);
}
{
    const g = startedNes();
    clearField(g);
    placeGb(g, tetO, 0, 5, 3);
    const rows = [];
    for (let f = 0; f < 9; f++) { const r = g.curPiece_row; g.advanceFrame(f === 0 ? SOFT_PUSH : 0); if (g.curPiece_row !== r) rows.push(f); }
    check("NES soft drop: the first row on the third frame, then every second", rows, [2, 4, 6, 8]);
    while (g.phase === "active") g.advanceFrame(0);
    check("  ...locking by soft drop scores the rows dropped", g.score, 18 - 5);
    while (g.phase !== "active") g.advanceFrame(0);
    const r = g.curPiece_row;
    for (let f = 0; f < 10; f++) g.advanceFrame(0);
    check("  ...still holding it doesn't drop the next piece", g.curPiece_row, r);
    g.advanceFrame(SOFT_RELEASE);
    clearField(g);
    placeGb(g, tetO, 0, 5, 3);
    g.advanceFrame(LEFT_PUSH);
    const col = g.curPiece_col;
    for (let f = 0; f < 10; f++) g.advanceFrame(f === 0 ? SOFT_PUSH : 0);
    check("  ...not while left or right is held", g.curPiece_row, 5);
    g.advanceFrame(LEFT_RELEASE);
    for (let f = 0; f < 30; f++) g.advanceFrame(f === 0 ? RIGHT_PUSH : 0);
    check("  ...and while down is held the piece can't shift", g.curPiece_col, col);
}
{
    const g = startedNes();
    clearField(g);
    placeGb(g, tetO, 0, 10, 7);
    const shifts = [];
    for (let f = 0; f <= 30; f++) {
        const before = g.curPiece_col;
        g.advanceFrame(f === 0 ? LEFT_PUSH : 0);
        if (g.curPiece_col !== before) shifts.push(f);
    }
    check("NES auto-shift frames after holding left (DAS 16, ARR 6)", shifts, [0, 16, 22, 28]);
    g.advanceFrame(LEFT_RELEASE);
    clearField(g);
    placeGb(g, tetO, 0, 10, 1); // O in columns 2-3, a block left of it
    g.setCell(12, 1, 1);
    const charged = [];
    for (let f = 0; f <= 8; f++) {
        if (f === 4) g.setCell(12, 1, 0);
        const before = g.curPiece_col;
        g.advanceFrame(f === 0 ? LEFT_PUSH : 0);
        if (g.curPiece_col !== before) charged.push(f);
    }
    check("  ...a blocked shift leaves DAS charged: it moves on the first frame there's room", charged, [4]);
    g.advanceFrame(LEFT_RELEASE);
    const released = g.dasCounter; // letting go doesn't reset the charge (tetris.wiki)
    clearField(g);
    placeGb(g, tetO, 0, 18, 3);
    g.lock();
    g.advanceFrame(RIGHT_PUSH); // pressed during the entry delay: the leftover charge turns right
    while (g.phase !== "active") g.advanceFrame(0);
    const carried = [released, g.dasCounter, g.curPiece_col];
    let wait = 0;
    while (g.curPiece_col === carried[2] && wait < 20) { g.advanceFrame(0); wait++; }
    check("  ...letting go keeps the charge, and a press during the entry delay redirects it (auto-shifts within ARR 6)",
        [carried, g.curPiece_col - carried[2], wait <= 6], [[16, 16, 3], 1, true]);
    g.advanceFrame(RIGHT_RELEASE);
    clearField(g);
    placeGb(g, tetO, 0, 18, 3);
    g.lock();
    g.dasCounter = 0; // nothing left over
    g.advanceFrame(RIGHT_PUSH); // pressed and held through the entry delay
    while (g.phase !== "active") g.advanceFrame(0);
    const spawnCol = g.curPiece_col;
    for (let f = 0; f < 15; f++) g.advanceFrame(0);
    const before16 = g.curPiece_col;
    g.advanceFrame(0);
    check("  ...DAS doesn't charge during the entry delay", [before16 - spawnCol, g.curPiece_col - spawnCol], [0, 1]);
}
{
    const g = startedNes();
    const areAfter = row => { clearField(g); g.frames = 0; placeGb(g, tetO, 0, row, 7); g.lock(); return framesToNextPiece(g); };
    // the O's centre is its top row (box row 2): 18 + 2 = 20, one row above the bottom
    check("NES entry delay by the height of the centre: 10 in the bottom two rows, +2 per 4 rows, at most 18",
        [areAfter(18), areAfter(17), areAfter(14), areAfter(13), areAfter(4), areAfter(0)], [10, 12, 12, 14, 18, 18]);
    const clear = frames => {
        clearField(g);
        for (let c = 0; c < 8; c++) { g.setCell(20, c, 1); g.setCell(21, c, 1); }
        placeGb(g, tetO, 0, 18, 7);
        g.frames = frames;
        g.lock();
        return framesToNextPiece(g);
    };
    check("  ...a line clear adds 17-20 frames, to the next multiple of 4", [clear(100), clear(101), clear(102), clear(103)], [27, 30, 29, 28]);
}
{
    const nesLevel = (start, lines) => { const g = createGame(nesTetris, "standard", start); g.lines = lines; g.updateLevel(); return g.level; };
    check("NES levels: first level-up after start x 10 + 10 lines, or max(100, start x 10 - 50) if sooner, then every 10",
        [[0, 9], [0, 10], [5, 59], [5, 60], [5, 70], [12, 99], [12, 100], [12, 110], [16, 109], [16, 110], [19, 139], [19, 140], [0, 290]].map(([s, l]) => nesLevel(s, l)),
        [0, 1, 5, 6, 7, 12, 13, 14, 16, 17, 19, 20, 29]);
    check("NES start levels 0-19", [createGame(nesTetris, "standard", 25).level, createGame(nesTetris, "standard", -1).level, createGame(nesTetris, "standard", 19).gbFrames], [19, 0, 2]);
    const g = startedNes();
    clearField(g);
    g.lines = 8;
    for (let c = 0; c < 8; c++) { g.setCell(20, c, 1); g.setCell(21, c, 1); }
    placeGb(g, tetO, 0, 18, 7);
    g.lock();
    check("NES score at the level after the clear: a double reaching level 1 scores 100 x 2", [g.level, g.score], [1, 200]);
    g.lines = 205; g.score = 999000;
    clearField(g);
    tapClear(g, 4, h => { h.curPiece_col = 7; });
    check("  ...no level cap, score capped at 999,999", [g.level, g.score], [20, 999999]);
}
{
    const g = startedNes("btype", 0, 5);
    check("NES B-Type: height 5 is 12 rows of garbage, height 1 is 3", [garbageRows(g).filter(x => x).length, garbageRows(startedNes("btype", 0, 1)).filter(x => x).length], [12, 3]);
    const b = startedNes("btype", 7);
    clearField(b);
    b.lines = 24;
    tapClear(b, 1, h => { h.curPiece_col = 7; });
    check("  ...ends at 25 lines with the level unchanged", [b.isGameOver(), b.endTitle, b.level], [true, "COMPLETE", 7]);
}

// ---------------------------------------------------------------- TGM3 Shirase
function startedMode(mode, variant) {
    const g = createGame(mode, variant);
    for (let f = 0; f < 200 && g.phase !== "active"; f++) g.advanceFrame(0);
    return g;
}
{
    const g = startedMode(arika, "shirase");
    const at = level => { g.level = level; g.updateTimings(); return [g.gravity, g.are, g.lineAre, g.das, g.lockDelayMax, g.lineClearDelay]; };
    check("Shirase: 20G, ARE / line ARE / DAS / lock / line clear by level",
        [at(0), at(100), at(200), at(300), at(500), at(600), at(1100), at(1200), at(1300)],
        [[20, 12, 8, 10, 18, 6], [20, 12, 7, 8, 18, 5], [20, 12, 6, 8, 17, 4], [20, 6, 6, 8, 15, 4], [20, 6, 5, 6, 13, 3],
         [20, 6, 5, 6, 12, 3], [20, 6, 5, 6, 10, 3], [20, 6, 5, 6, 8, 3], [20, 6, 6, 6, 15, 6]]);
    const s = startedMode(arika, "shirase");
    check("  ...stats: rule and mode, grade, level, time, score; no ghost",
        [s.getStats()[0], s.getStats().map(r => r[0]), s.getStats()[1], s.getShadowRow()],
        [["TGM3 TI", "WORLD SHIRASE"], ["TGM3 TI", "GRADE", "LEVEL", "TIME", "SCORE"], ["GRADE", "1"], -100]);
    s.level = 1299; s.curPiece_type = 0; clearField(s);
    s.spawn(tetT, false);
    check("  ...levels go to 1300, with a stop at 1299", [s.level, s.getStats()[2]], [1299, ["LEVEL", "1299 / 1300"]]);
}
{
    const g = startedMode(arika, "shirase");
    clearField(g);
    g.section = 0; g.sectionStart = 0; g.frames = 61 * 60; g.level = 99;
    tapClear(g, 1);
    const slow = [g.level, g.sectionsDone, g.regrets, g.gradeLabel()];
    g.sectionStart = g.frames; g.frames += 59 * 60; g.level = 199; clearField(g);
    tapClear(g, 1);
    check("Shirase grade: sections finished less REGRETs (over 60 s in the first two sections)",
        [slow, [g.sectionsDone, g.regrets, g.gradeLabel()]], [[100, 1, 1, "1"], [2, 1, "S1"]]);
    g.sectionStart = g.frames; g.frames += 51 * 60; g.level = 299; clearField(g);
    tapClear(g, 1);
    check("  ...and over 50 s from the third", [g.regrets, g.gradeLabel()], [2, "S1"]);
}
{
    const stop = (mode, level, frames) => {
        const g = startedMode(mode, "shirase");
        clearField(g);
        g.level = level; g.section = Math.floor(level / 100); g.sectionsDone = g.section; g.frames = frames; g.sectionStart = frames;
        tapClear(g, 1);
        return [g.isGameOver(), g.endTitle, g.level, g.gradeLabel()];
    };
    check("Shirase level stops: World 500 after 3:03 and 1000 after 6:06, Classic after 2:28 and 4:56",
        [stop(arika, 499, 183 * 60), stop(arika, 499, 183 * 60 + 1), stop(arika, 999, 366 * 60 + 1),
         stop(tgmClassic, 499, 148 * 60 + 1), stop(tgmClassic, 499, 148 * 60)],
        [[false, null, 500, "S5"], [true, "LEVEL STOP", 500, "S5"], [true, "LEVEL STOP", 1000, "S10"],
         [true, "LEVEL STOP", 500, "S5"], [false, null, 500, "S5"]]);
}
{
    const g = startedMode(arika, "shirase");
    clearField(g);
    g.level = 500;
    fill(g, ["#########."]);
    g.garbageCount = 20; g.curPiece_type = 0;
    g.spawn(tetT, false);
    const bottom = r => [...Array(WIDTH)].map((_, c) => g.getCell(r, c) ? "#" : ".").join("");
    check("Shirase garbage: at the section's quota (20 at 500) a copy of the bottom row rises as a piece comes",
        [bottom(20), bottom(21), g.garbageCount], ["#########.", "#########.", 1]);
    g.garbageCount = 5;
    clearField(g);
    tapClear(g, 2);
    check("  ...cleared lines count it down", g.garbageCount, 3);
    const h = startedMode(arika, "shirase");
    h.level = 400; h.garbageCount = 30; h.curPiece_type = 0; clearField(h);
    h.spawn(tetT, false);
    check("  ...none before 500", [h.garbageCount, h.getCell(21, 0)], [30, 0]);
    h.level = 999; h.updateTimings();
    const colours = h.palette.slice();
    h.level = 1000; h.updateTimings();
    check("  ...monochrome blocks from level 1000", [colours.every(c => c === 8), h.palette.slice(1).every(c => c === 8)], [false, true]);
}
{
    const g = startedMode(arika, "easy"), m = startedMode(arika, "master");
    check("Test setup fireworks: Easy only, five fireworks", [m.testSetup("fireworks"), g.testSetup("fireworks"), g.fireworks, g.takeFireworks()], [false, true, 5, 5]);
    const s = startedMode(arika, "shirase");
    check("Test setup secret: the full pattern ends the game with the top secret grade",
        [g.testSetup("secret"), m.testSetup("secret"), m.isGameOver(), m.secretGrade, s.testSetup("secret"), s.secretGrade], [false, true, true, "GM", true, "GM"]);
}
{
    const g = startedMode(arika, "shirase");
    check("Shirase test setup: only the roll", [g.testSetup("invisible"), g.testSetup("kill"), g.testSetup("roll")], [false, false, true]);
    for (let f = 0; f < 400 && g.phase !== "active"; f++) g.advanceFrame(0);
    check("  ...the staff roll after 1300: S13, big pieces, blocks stay visible",
        [g.roll, g.rollLength, g.big, g.gradeLabel(), g.curCells[tetO][0].length, g.curPiece_col], ["visible", 3238, true, "S13", 16, 2]);
    clearField(g);
    place(g, tetO, 0, 10, 2);
    g.shift(1);
    check("  ...big pieces move two columns", g.curPiece_col, 4);
    g.rollFrames = g.rollLength - 1;
    g.advanceFrame(0);
    check("  ...surviving it completes the mode", [g.isGameOver(), g.endTitle], [true, "COMPLETE"]);
}

// ---------------------------------------------------------------- TGM3 Sakura
{
    const sakura = (mode = arika) => { const g = createGame(mode, "sakura"); for (let f = 0; f < 200 && g.phase !== "active"; f++) g.advanceFrame(0); return g; };
    const g = createGame(arika, "sakura"), h = createGame(tgmClassic, "sakura");
    const letters = gm => [...gm.queue, ...Array.from({ length: 16 - gm.queue.length }, () => gm.randomizer.next())].map(t => "ITLJSZO"[t - 1]).join("");
    check("TGM3 Sakura: stage 1's field with its 7 jewels, the fixed sequence (LIJOTSZILJOTISJZ, the same with either rule)",
        [[19, 20, 21].map(r => Array.from({ length: WIDTH }, (_, c) => !g.getCell(r, c) ? "." : g.getCellItem(r, c) ? "j" : "#").join("")), g.jewels, letters(createGame(arika, "sakura")), letters(h)],
        [["..jj..j#..", ".j######j.", ".j######j."], 7, "LIJOTSZILJOTISJZ", "LIJOTSZILJOTISJZ"]);
    const r = createGame(arika, "sakura");
    r.advanceFrame(HOLD_PUSH);
    r.advanceFrame(HOLD_RELEASE);
    r.advanceFrame(HOLD_PUSH);
    check("  ...Hold pressed during READY puts the next piece in the hold box, stepping through the sequence", [r.heldpiece, r.queue[0]], [tetI, tetJ]);
}
{
    // clearing the last jewel clears the stage: +1 s per jewel, +10 s under 10 s; the next stage after the result, its
    // level back to 0 and the hold box empty
    const g = (() => { const x = createGame(arika, "sakura"); for (let f = 0; f < 200 && x.phase !== "active"; f++) x.advanceFrame(0); return x; })();
    clearField(g);
    g.itemCells.forEach(row => row.fill(null));
    fill(g, ["#########."]);
    g.itemCells[HEIGHT - 1 - FIELD_TOP][0] = "JEWEL";
    g.jewels = 1;
    g.heldpiece = tetZ;
    const limit = g.limit;
    place(g, tetI, 1, 18, 7);
    g.advanceFrame(HARD_PUSH);
    for (let f = 0; f < 60 && g.phase === "lineclear"; f++) g.advanceFrame(0);
    const ended = [g.phase, g.tried, g.cleared, g.limit - limit > 600]; // the line clear's frames run off the limit too
    for (let f = 0; f < 400 && g.phase !== "active"; f++) g.advanceFrame(0);
    check("TGM3 Sakura: the last jewel's clear ends the stage (+1 s a jewel, +10 s under 10 s), then stage 2 at level 0 with an empty hold box",
        [ended, g.stageName(), g.jewels, g.level, g.heldpiece], [["stageend", 1, 1, true], "2", 7, 0, 0]);
}
{
    // the stage time runs out: the stage fails once the piece in play locks; skipping (the 180° key held a second) costs 30 s
    const g = createGame(arika, "sakura");
    for (let f = 0; f < 200 && g.phase !== "active"; f++) g.advanceFrame(0);
    g.stageFrames = 60 * 60 - 1;
    g.advanceFrame(0);
    const up = [g.stageTimeUp, g.phase];
    g.advanceFrame(HARD_PUSH);
    const failed = [g.phase, g.tried, g.cleared];
    const s = createGame(arika, "sakura");
    for (let f = 0; f < 200 && s.phase !== "active"; f++) s.advanceFrame(0);
    const limit = s.limit;
    s.advanceFrame(ROT180_PUSH);
    for (let f = 0; f < 70 && s.phase === "active"; f++) s.advanceFrame(0);
    check("  ...the stage time running out fails the stage at the next lock; a skip costs 30 s",
        [up, failed, s.phase, s.tried, limit - s.limit > 30 * 60], [[true, "active"], ["stageend", 1, 0], "stageend", 1, true]);
}
{
    // after stage 20 the clear rate opens the EX stages: under 90 % none, under 100 % three, 100 % five, or seven within 5:00
    const after20 = (cleared, frames) => {
        const g = createGame(arika, "sakura");
        g.stage = 19; g.tried = 19; g.cleared = cleared; g.frames = frames;
        g.endStage("CLEAR");
        return [g.lastStage - 19, g.gameover ? g.endTitle : g.phase];
    };
    check("TGM3 Sakura: after stage 20 the EX stages by the clear rate (90 %, 100 %) and the time (5:00)",
        [after20(15, 9000), after20(17, 9000), after20(19, 20000), after20(19, 17000)], [[0, "COMPLETE"], [3, "stageend"], [5, "stageend"], [7, "stageend"]]);
    const ex3 = createGame(arika, "sakura");
    ex3.loadStage(22);
    for (let f = 0; f < 200 && ex3.phase !== "active"; f++) ex3.advanceFrame(0);
    ex3.gravity = 0;
    const col = ex3.curPiece_col;
    ex3.advanceFrame(RIGHT_PUSH);
    ex3.advanceFrame(0);
    check("  ...EX3's pieces are big but move one cell at a time; the limit time running out ends the game",
        [ex3.big, ex3.curPiece_col - col, (() => { const t = createGame(arika, "sakura"); for (let f = 0; f < 200 && t.phase !== "active"; f++) t.advanceFrame(0); t.limit = 1; t.advanceFrame(0); return t.endTitle; })()],
        [true, 1, "TIME OVER"]);
}

// ---------------------------------------------------------------- TGM3 Easy
{
    const g = startedMode(arika, "easy");
    const at = level => { g.level = level; g.updateTimings(); return [g.gravity * 256, g.are, g.lineAre, g.das, g.lockDelayMax, g.lineClearDelay]; };
    check("Easy: gravity (1/256 G) by level, delays the same throughout (ARE 48, line ARE 25, DAS 14, lock 30, line clear 40)",
        [at(0), at(8), at(90), at(101), at(177), at(200)],
        [[4, 48, 25, 14, 30, 40], [5, 48, 25, 14, 30, 40], [64, 48, 25, 14, 30, 40], [16, 48, 25, 14, 30, 40],
         [208, 48, 25, 14, 30, 40], [5120, 48, 25, 14, 30, 40]]);
    // harddrop.com: rising from 121 on (tetris.wiki lists 132: 128, 144: 112, 156: 144, 167: 176, 177: 192)
    check("  ...from level 121: 80, 112, 144, 175, 192, 208",
        [120, 121, 132, 143, 144, 156, 167, 177, 199].map(l => at(l)[0]), [48, 80, 112, 112, 144, 175, 192, 208, 208]);
    const e = startedMode(tgmClassic, "easy");
    check("  ...stats: rule and mode, fireworks, level, time; levels to 200",
        [e.getStats(), e.maxLevel], [[["TGM3 TI", "CLASSIC EASY"], ["HANABI", "0"], ["LEVEL", "0 / 100"], ["TIME", e.formatTime()]], 200]);
}
{
    const fireworks = (n, setup = () => {}, rows = null) => {
        const g = startedMode(arika, "easy");
        g.level = 10; g.lockedType = tetI; g.lastRotation = false; g.activeTime = 30; g.sinceClear = 30;
        setup(g);
        g.easyHanabi(n, rows || [...Array(n)].map((_, i) => 21 - n + 1 + i), g.level, g.level + [0, 1, 2, 4, 6][n]);
        return g.hanabiPending;
    };
    check("Easy fireworks: base 1 / 2.9 / 3.8 / 4.7 truncated", [1, 2, 3, 4].map(n => fireworks(n)), [1, 2, 3, 4]);
    check("  ...combo: doubles count up (x1, x1.5, x1.9), singles keep it without the bonus, a miss resets it",
        [fireworks(2, g => { g.easyCombo = 1; }), fireworks(2, g => { g.easyCombo = 2; }), fireworks(1, g => { g.easyCombo = 5; })],
        [4, 5, 1]);
    check("  ...spins: x2 (not O), T x3, T triple x4",
        [fireworks(2, g => { g.lastRotation = true; g.lockedType = tetL; }), fireworks(2, g => { g.lastRotation = true; g.lockedType = tetO; }),
         fireworks(2, g => { g.lastRotation = true; g.lockedType = tetT; }), fireworks(3, g => { g.lastRotation = true; g.lockedType = tetT; })],
        [5, 2, 8, 15]);
    check("  ...split x1.4, lucky level x1.3, a firework fired lately x1.3, the 30 s bonus x1.4 (once)",
        [fireworks(2, () => {}, [19, 21]), fireworks(3, g => { g.level = 25; }), fireworks(2, g => { g.fireTimer = 50; }),
         fireworks(2, g => { g.bonus30 = true; })],
        [4, 4, 3, 4]);
    check("  ...speed: x (level after - frames since the last clear) / 100 over 100, x (level after - active frames) / 120 over 120",
        fireworks(2, g => { g.level = 140; g.sinceClear = 10; g.activeTime = 10; }), Math.floor(2.9 * 1.32 * 1.1));
    const g = startedMode(arika, "easy");
    clearField(g);
    g.level = 10;
    tapClear(g, 4);
    check("  ...a perfect clear adds 6 in its own stream", [g.hanabiPending, g.bravoPending], [4, 6]);
    for (let f = 0; f < 70; f++) g.advanceFrame(0);
    check("  ...the streams fire one each every 10 frames", [g.hanabi, g.hanabiPending, g.bravoPending], [10, 0, 0]);
}
{
    const g = startedMode(arika, "easy");
    g.frames = 1799; g.level = 40; g.levelMark30 = 5;
    g.advanceFrame(0);
    check("Easy 30 s bonus: 30 levels in a 30 s period earn it", [g.bonus30, g.levelMark30], [true, 40]);
    g.level = 199; g.curPiece_type = 0; clearField(g);
    g.spawn(tetT, false);
    check("  ...a stop at 199", g.level, 199);
}
{
    const g = startedMode(arika, "easy");
    g.hanabi = 100;
    g.testSetup("roll");
    for (let f = 0; f < 400 && g.phase !== "active"; f++) g.advanceFrame(0);
    check("Easy staff roll: 20G, blocks visible, a free firework every 3265 / fireworks frames",
        [g.roll, g.gravity, g.rollLength, g.rollInterval], ["visible", 20, 3265, 32]);
    const roll = (combo, n) => {
        g.easyCombo = combo; g.hanabiPending = 0; g.lockedType = tetI; g.lastRotation = false; g.activeTime = 100; g.sinceClear = 150; g.fireTimer = 0;
        g.easyHanabi(n, [...Array(n)].map((_, i) => 21 - n + 1 + i), 200, 200);
        return g.hanabiPending;
    };
    check("  ...the combo is frozen and mapped (singles too), 9 mapping to the lowest; singles and Tetrises are lucky",
        [roll(4, 1), roll(9, 1), roll(0, 2)], [Math.floor(2.9 * 1.3), 1, Math.floor(2.9 * 1.5)]);
    const before = g.hanabi;
    g.hanabiPending = 5;
    g.rollFrames = g.rollLength - 1;
    g.advanceFrame(0);
    check("  ...surviving it: EXCELLENT, 24 more and the ones still waiting", [g.endTitle, g.hanabi - before], ["EXCELLENT", 29]);
}

// ---------------------------------------------------------------- TAP TGM+
{
    const g = startedMode(tgmTap, "plus");
    const at = level => { g.level = level; g.updateTimings(); return [g.gravity * 256, g.are, g.lineAre, g.das, g.lockDelayMax, g.lineClearDelay]; };
    check("TGM+: Master's gravity, Normal's delays at every level",
        [at(0), at(500), at(900)], [[4, 27, 27, 16, 30, 40], [5120, 27, 27, 16, 30, 40], [5120, 27, 27, 16, 30, 40]]);
    const s = startedMode(tgmTap, "plus");
    check("  ...stats: rule set and mode, level, time, score (no grade)",
        [s.getStats()[0], s.getStats().map(r => r[0])], [["TGM2 TAP", "TGM+"], ["TGM2 TAP", "LEVEL", "TIME", "SCORE"]]);
}
{
    const row = (g, r) => [...Array(WIDTH)].map((_, c) => g.getCell(r, c) ? "#" : ".").join("");
    const g = startedMode(tgmTap, "plus");
    clearField(g);
    const miss = () => { g.curPiece_type = tetO; place(g, tetO, 0, 5, 3); g.lock(); g.setCell(6, 4, 0); g.setCell(6, 5, 0); g.setCell(7, 4, 0); g.setCell(7, 5, 0); };
    for (let k = 0; k < 12; k++) miss();
    const before = row(g, 21);
    miss();
    check("TGM+ garbage: the 13th piece in a row without a clear raises the pattern's first row",
        [before, row(g, 21), g.garbageCount], ["..........", ".#########", 0]);
    for (let k = 0; k < 13; k++) miss();
    check("  ...then the next", [row(g, 20), row(g, 21)], [".#########", ".#########"]);
    g.level = 900;
    for (let k = 0; k < 3; k++) miss();
    const at900 = row(g, 21);
    miss();
    check("  ...every 13 - level / 100 pieces (4 at 900)", [at900, row(g, 21)], [".#########", ".#########"]);
    check("  ...the pattern has 24 rows", g.garbagePos, 3);
}
{
    const g = startedMode(tgmTap, "plus");
    clearField(g);
    g.level = 998;
    tapClear(g, 1);
    for (let f = 0; f < 400 && g.phase !== "active"; f++) g.advanceFrame(0);
    check("TGM+ staff roll at 999: blocks visible, 2024 frames", [g.roll, g.rollLength], ["visible", 2024]);
    g.curPiece_type = 0;
    for (let c = 0; c < WIDTH; c++) for (let r = 1; r < 5; r++) g.setCell(r, c, 1);
    g.spawn(tetT, false);
    check("  ...topping out in it is still EXCELLENT", [g.isGameOver(), g.endTitle], [true, "EXCELLENT"]);
}

// ---------------------------------------------------------------- ACE
{
    const g = startedMode(tgmAce, "normal");
    check("ACE: hold, three next pieces, spawn in the top visible rows, 128 lock resets",
        [g.hasHold, g.nextCount, g.curPiece_row, g.moveLimit, g.tgm], [true, 3, 2, 128, false]);
    check("  ...stats: mode, level, lines, the level's time limit, time",
        [g.getStats()[0], g.getStats()[1], g.getStats()[2], g.getStats()[3][0]], [["ACE", "NORMAL"], ["LEVEL", "1 / 15"], ["LINES", "0 / 150"], "LIMIT"]);
    const grav = (variant, level) => { const h = createGame(tgmAce, variant); h.level = level; h.updateTimings(); return h.gravity * 256; };
    check("  ...gravity: Normal 4/256 at level 1 to 20G at 13, Hi-Speed 1 84/256 to 20G at 8, the rest 20G",
        [grav("normal", 1), grav("normal", 12), grav("normal", 13), grav("hispeed1", 1), grav("hispeed1", 8), grav("hispeed2", 1), grav("another", 1)],
        [4, 1280, 5120, 84, 5120, 5120, 5120]);
    const delays = (variant, level) => { const h = createGame(tgmAce, variant); h.level = level; h.updateTimings(); return [h.are, h.lineAre, h.das, h.lockDelayMax, h.lineClearDelay]; };
    check("  ...delays: Normal fixed, Another by level, Another 2 fixed",
        [delays("normal", 9), delays("another", 1), delays("another", 15), delays("another2", 1)],
        [[25, 25, 15, 30, 41], [18, 18, 10, 28, 14], [6, 6, 7, 13, 5], [6, 6, 7, 13, 4]]);
}
{
    const g = startedMode(tgmAce, "normal");
    clearField(g);
    g.lines = 9;
    tapClear(g, 1);
    const up = [g.level, g.aceTimer, g.acePaused];
    g.lines = 19; clearField(g);
    tapClear(g, 1);
    check("ACE levels: every 10 lines; the clock starts over (2:00, 2:00, then 1:30) and waits for the next piece",
        [up, [g.level, g.aceTimer]], [[2, 7200, true], [3, 5400]]);
    for (let f = 0; f < 200 && g.phase !== "active"; f++) g.advanceFrame(0);
    g.advanceFrame(0);
    check("  ...it runs again once the piece is in play", [g.acePaused, g.aceTimer < 5400], [false, true]);
    g.aceTimer = 1;
    g.advanceFrame(0); g.advanceFrame(0);
    check("  ...running out ends the game", [g.isGameOver(), g.endTitle], [true, "TIME OVER"]);
    const another = createGame(tgmAce, "another");
    check("  ...Another: a minute per level", another.aceTimer, 3600);
    const h = startedMode(tgmAce, "hispeed2");
    clearField(h);
    h.lines = 149;
    tapClear(h, 1);
    check("  ...150 lines complete it", [h.isGameOver(), h.endTitle, h.lines], [true, "COMPLETE", 150]);
}

// ---------------------------------------------------------------- Big modes
function startedBig(mode, variant = "standard") {
    const g = createGame(mode, variant, 0, 0, {}, { big: true });
    for (let f = 0; f < 200 && g.phase !== "active"; f++) g.advanceFrame(0);
    return g;
}
{
    const g = startedBig(tgmOriginal);
    const spawnCols = [...new Set(g.curPieceCells().map(c => c.col))].sort((a, b) => a - b);
    check("Big: pieces twice the size, entering in columns 2-9 at the top of the well, the mode named BIG",
        [g.big, g.bigMode, g.curCells[tetO][0].length, spawnCols[0] >= 2, Math.min(...g.curPieceCells().map(c => c.row)), g.getStats()[0]],
        [true, true, 16, true, 2, ["TGM1", "MASTER BIG"]]);
    clearField(g);
    place(g, tetO, 0, 10, 2);
    const leftCol = () => Math.min(...g.curPieceCells().map(c => c.col));
    const cols = [leftCol()];
    for (let k = 0; k < 3; k++) { g.shift(-1); cols.push(leftCol()); }
    check("  ...they move two columns at a time, up to the wall", cols, [4, 2, 0, 0]);
    clearField(g);
    for (let r = 20; r < HEIGHT; r++) for (let c = 0; c < 6; c++) g.setCell(r, c, 1);
    g.setCell(10, 0, 1); // the field isn't emptied
    place(g, tetO, 0, 16, 4); // a big O in columns 6-9, rows 18-21
    g.level = 10; g.lines = 0;
    g.lock();
    check("  ...two cleared rows count as one line", [g.lines, g.level], [1, 11]);
    check("Big for every TGM game but TGM+, and ACE's Big mode at Normal's speeds",
        [startedBig(tgmTap, "death").getStats()[0], startedBig(arika, "easy").getStats()[0], startedBig(tgmClassic, "shirase").getStats()[0]],
        [["TGM2 TAP", "DEATH BIG"], ["TGM3 TI", "WORLD EASY BIG"], ["TGM3 TI", "CLASSIC SHIRASE BIG"]]);
    const ace = startedMode(tgmAce, "big");
    check("  ...ACE Big", [ace.getStats()[0], ace.big, ace.gravity * 256, ace.lockDelayMax, ace.aceLimit()], [["ACE", "BIG"], true, 4, 30, 7200]);
    const plain = startedMode(arika, "standard");
    check("  ...and not without it", [plain.big, plain.bigMode, plain.getStats()[0]], [false, false, ["TGM3 TI", "WORLD"]]);
}
{
    const g = startedBig(arika, "shirase");
    clearField(g);
    g.level = 500;
    fill(g, ["##########", "#########."]);
    g.setCell(20, 9, 0); g.setCell(20, 8, 0);
    g.garbageCount = 20; g.curPiece_type = 0;
    g.spawn(tetT, false);
    const row = r => [...Array(WIDTH)].map((_, c) => g.getCell(r, c) ? "#" : ".").join("");
    check("Big Shirase: garbage rises two rows at a time (the bottom two copied)",
        [row(18), row(19), row(20), row(21)], ["########..", "#########.", "########..", "#########."]);
}

{
    // TGM3 Big Master: no section COOLs, and its own roll grade points (tetris.wiki, Codes)
    const g = createGame(arika, "standard", 0, 0, {}, { big: true });
    while (g.phase !== "active") g.advanceFrame(0);
    g.level = 69; g.frames = 30 * 60;
    g.level = 70; g.updateSection();
    const cool = g.coolPending;
    g.testSetup("roll");
    while (g.phase === "rollstart") g.advanceFrame(0);
    const points = [1, 2, 3, 4].map(n => { const before = g.rollPoints; g.scoreRollClear(n); return g.rollPoints - before; });
    check("TGM3 Big Master: no COOL at *70 in time, roll clears give 0.08/0.26/0.34/0.42", [cool, g.roll, points], [false, "fading", [8, 26, 34, 42]]);
}

// ---------------------------------------------------------------- TAP Normal
{
    const g = startedMode(tgmTap, "normal");
    const at = level => { g.level = level; g.updateTimings(); return [g.gravity * 256, g.are, g.lineAre, g.das, g.lockDelayMax, g.lineClearDelay]; };
    check("TAP Normal: its own gravity (1/256 G), the same delays throughout",
        [at(0), at(99), at(100), at(139), at(200), at(299), at(300)],
        [[4, 27, 27, 16, 30, 40], [64, 27, 27, 16, 30, 40], [4, 27, 27, 16, 30, 40], [32, 27, 27, 16, 30, 40],
         [16, 27, 27, 16, 30, 40], [240, 27, 27, 16, 30, 40], [5120, 27, 27, 16, 30, 40]]);
    const s = startedMode(tgmTap, "normal");
    check("  ...stats: mode, level to 300, time, score (no grade)",
        [s.getStats()[0], s.getStats().map(r => r[0]), s.maxLevel], [["TGM2 TAP", "NORMAL"], ["TGM2 TAP", "LEVEL", "TIME", "SCORE"], 300]);
    clearField(s);
    s.level = 98; s.curPiece_type = 0; s.spawn(tetT, false);
    s.curPiece_type = 0; s.spawn(tetT, false);
    const past99 = s.level;
    s.level = 299; s.curPiece_type = 0; s.spawn(tetT, false);
    check("  ...no section stops, but the last before 300", [past99, s.level], [100, 299]);
}
{
    const g = startedMode(tgmTap, "normal");
    clearField(g);
    g.level = 99; g.curPiece_type = 0;
    g.spawn(tetT, false);
    const reached = [g.nextItem, g.pieceItem];
    g.curPiece_type = 0;
    g.spawn(tetO, false);
    const entered = [g.pieceItem, g.nextItem];
    g.setCell(10, 0, 1); // a block hanging in column 0
    place(g, tetO, 0, 18, 4); // the item piece: rows 19-20, columns 5-6
    g.lock();
    framesToNextPiece(g);
    const settled = [g.getCellItem(19, 5), g.getCellItem(20, 6), g.getCellItem(21, 5), g.getCell(10, 0)];
    check("TAP Normal items: level 100 makes the next piece an item piece (Free Fall), whose blocks keep it as they settle",
        [reached, entered, settled], [["FREE FALL", null], ["FREE FALL", null], ["FREE FALL", "FREE FALL", null, 1]]);
    for (let c = 0; c < 9; c++) g.setCell(21, c, 1);
    place(g, tetI, 1, HEIGHT - 4, 7); // column 9: clears row 21 only, none of the item's blocks
    g.lock();
    framesToNextPiece(g);
    check("  ...a clear that takes none of its blocks leaves it waiting (its blocks fall with the stack)",
        [g.getCellItem(20, 5), g.getCellItem(21, 6), g.getCell(11, 0), g.actions.some(a => a.text === "FREE FALL")],
        ["FREE FALL", "FREE FALL", 1, false]);
    for (const c of [0, 1, 2, 3, 4, 7]) g.setCell(21, c, 1);
    place(g, tetI, 1, HEIGHT - 4, 6); // column 8: row 21 clears with two of the item's blocks
    g.lock();
    framesToNextPiece(g);
    check("  ...a clear that takes any of its blocks sets it off after the clear: blocks drop down their columns",
        [g.getCell(11, 0), g.getCell(21, 0), g.getCellItem(21, 5), g.actions.some(a => a.text === "FREE FALL")],
        [0, 1, null, true]);
}
{
    const g = startedMode(tgmTap, "normal");
    clearField(g);
    g.level = 98; g.combo = 1;
    tapClear(g, 2); // 98 + 2 lines: 100, by a clear
    const waiting = [g.nextItem, g.actions.some(a => a.text === "FREE FALL")];
    framesToNextPiece(g);
    check("  ...reached by a clear: the next piece carries it, nothing goes off yet",
        [waiting, g.pieceItem, g.nextItem], [["FREE FALL", false], "FREE FALL", null]);
}
{
    const g = startedMode(tgmTap, "normal");
    clearField(g);
    for (let r = 16; r < HEIGHT; r++) g.setCell(r, 0, 1);
    g.useItem("DEL EVEN");
    const col0 = [...Array(6)].map((_, k) => g.getCell(16 + k, 0));
    check("  ...level 200's Del Even deletes every other row from the bottom (the second, fourth, ...)",
        col0, [0, 0, 0, 1, 1, 1]);
}
{
    const clear = (variant, frames = 0, level = 10) => {
        const g = startedMode(tgmTap, variant);
        clearField(g);
        g.setCell(10, 0, 1);
        g.level = level; g.score = 0; g.combo = 1; g.frames = frames;
        tapClear(g, 1, h => { h.softFrames = 0; h.sonicMax = 0; h.activeTime = 10; h.manualLock = false; });
        return g;
    };
    check("TAP Normal score: six times Master's for the same clear", clear("normal").score, 6 * clear("standard").score);
    const fast = clear("normal", 200 * 60, 299), slow = clear("normal", 301 * 60, 299);
    check("  ...level 300: 1253 x the seconds under 5:00, then the credit roll",
        [fast.score - slow.score, fast.timerStopped, fast.level], [1253 * 100, true, 300]);
    for (let f = 0; f < 400 && fast.phase !== "active"; f++) fast.advanceFrame(0);
    check("  ...a 20G roll with blocks visible", [fast.roll, fast.gravity], ["visible", 20]);
    fast.curPiece_type = 0;
    for (let c = 0; c < WIDTH; c++) for (let r = 1; r < 5; r++) fast.setCell(r, c, 1);
    fast.spawn(tetT, false);
    check("  ...that needn't be survived", [fast.isGameOver(), fast.endTitle], [true, "COMPLETE"]);
}

// ---------------------------------------------------------------- ACE ARS and ARS2
function aceAt(mode, type, rot, row, col, blocks = []) {
    const g = startedMode(mode, "normal");
    clearField(g);
    for (const [r, c] of blocks) g.setCell(r, c, 1);
    place(g, type, rot, row, col);
    return g;
}
{
    const g = startedMode(aceArs, "normal");
    const rows = [...new Set(g.curPieceCells().map(c => c.row))];
    check("ACE ARS: ARS shapes in the standard colours, spawn in rows 19-20, soft drop 0.5G, 128 lock resets",
        [g.ars, g.shapes === ARS_SHAPES, g.palette[tetI], Math.min(...rows), g.softGravity, g.moveLimit, g.getStats()[0]],
        [true, true, 1, 2, 0.5, 128, ["ACE", "ARS NORMAL"]]);
    const hard = aceAt(aceArs, tetO, 0, 5, 3);
    hard.advanceFrame(HARD_PUSH);
    const soft = aceAt(aceArs, tetO, 0, 19, 3);
    soft.advanceFrame(SOFT_PUSH);
    check("  ...up is a hard drop that locks, soft drop doesn't lock on the ground", [hard.phase, soft.phase], ["are", "active"]);
    const sonic = aceAt(aceArs2, tetO, 0, 5, 3);
    sonic.advanceFrame(HARD_PUSH);
    const lock = aceAt(aceArs2, tetO, 0, 19, 3);
    lock.advanceFrame(SOFT_PUSH);
    check("ACE ARS2: the drops swap: up is a sonic drop (no lock), soft drop locks on the ground",
        [sonic.phase, sonic.curPiece_row, lock.phase, startedMode(aceArs2, "another").getStats()[0]], ["active", 19, "are", ["ACE", "ARS2 ANOTHER"]]);
    const notch = (mode) => {
        const t = mode === tgmClassic ? startedMode(tgmClassic, "standard") : startedMode(mode, "normal");
        clearField(t);
        for (const [r, c] of [[21, 4], [21, 6]]) t.setCell(r, c, 1);
        place(t, tetT, 1, 19, 4);
        t.tFloorKicks = 5;
        return t.rotate(1);
    };
    check("  ...no floor kick limit (TGM3 Classic stops at two)", [notch(aceArs), notch(aceArs2), notch(tgmClassic)], [true, true, false]);
    const zero = aceAt(aceArs, tetT, 1, 19, 4, [[21, 4], [21, 6]]);
    zero.rotate(1); zero.rotate(-1);
    check("  ...and turning again after a floor kick doesn't zero the lock delay", zero.lockDelayZeroed, false);
    const srs = startedMode(tgmAce, "normal");
    check("ACE SRS is unchanged", [srs.ars, srs.softGravity, srs.getStats()[0]], [false, 1, ["ACE", "NORMAL"]]);
}

{
    // ACE's lock delay is reset by rotations as well as moves, with every rule (tetris.wiki)
    const resting = mode => {
        const g = createGame(mode, "normal");
        while (g.phase !== "active") g.advanceFrame(0);
        clearField(g);
        place(g, tetT, 0, mode === tgmAce ? 20 : 19, 3); // flat on the floor
        for (let f = 0; f < 10; f++) g.advanceFrame(0);
        const before = g.curPiece_lockDelay;
        g.advanceFrame(ROTR_PUSH);
        return [before, g.curPiece_lockDelay, g.moveResets];
    };
    check("ACE: a rotation on the ground resets the lock delay (SRS, ARS, ARS2)",
        [resting(tgmAce), resting(aceArs), resting(aceArs2)], [[10, 1, 1], [10, 1, 1], [10, 1, 1]]);
}

{
    // ACE deals from a 7-bag that never starts with S, Z or O (tetris.wiki: TGM randomizer)
    const firsts = new Set();
    let bags = true;
    for (let k = 0; k < 300; k++) {
        const g = createGame(k % 3 ? aceArs : tgmAce, "normal");
        firsts.add(g.queue[0]);
        const dealt = [];
        while (dealt.length < 14) { dealt.push(g.queue.shift()); g.fillQueue(); }
        bags = bags && [dealt.slice(0, 7), dealt.slice(7)].every(b => [...b].sort().join() === "1,2,3,4,5,6,7");
    }
    check("ACE: a 7-bag, the first piece never S, Z or O", [bags, firsts.has(tetS), firsts.has(tetZ), firsts.has(tetO), firsts.size], [true, false, false, false, 4]);
}

{
    // ACE: a piece whose entry rows are taken enters up to two rows higher instead of topping out
    const entering = (mode, filledRows) => {
        const g = createGame(mode, "normal");
        while (g.phase !== "active") g.advanceFrame(0);
        g.hardDrop();
        clearField(g);
        for (const r of filledRows) for (let c = 0; c < WIDTH; c++) if (c !== 9) g.setCell(r, c, 1);
        while (g.phase === "are") g.advanceFrame(0);
        return [g.isGameOver(), g.isGameOver() || g.curPieceCells().every(c => c.row < 2)];
    };
    check("ACE: a blocked entry moves the piece up (to rows 21-22 at most), then it is a block out",
        [entering(aceArs, [2, 3]), entering(aceArs, [0, 1, 2, 3]), entering(tgmAce, [2, 3])], [[false, true], [true, true], [false, true]]);
}

// ---------------------------------------------------------------- Guideline Sprint, Ultra and Marathon options
{
    const stats = (variant, start = 0) => createGame(guideline, variant, start).getStats();
    check("Sprint lines: 20, 40 or 100",
        [stats("sprint20")[0], stats("sprint20")[2], stats("sprint")[2], stats("sprint100")[2]],
        [["GUIDELINE", "SPRINT"], ["LINES", "0 / 20"], ["LINES", "0 / 40"], ["LINES", "0 / 100"]]);
    const g = startedGuideline("sprint20");
    g.lines = 19;
    for (let r = 2; r < HEIGHT; r++) for (let c = 0; c < WIDTH; c++) g.setCell(r, c, r === 21 && c < 8 ? 1 : 0);
    place(g, tetO, 0, 5, 7); g.hardDrop();
    check("  ...the 20th line completes Sprint 20", [g.isGameOver(), g.endTitle], [true, "COMPLETE"]);
    check("Ultra time: 1, 2, 3 or 5 minutes",
        [stats("ultra1")[1], stats("ultra")[1], stats("ultra3")[1], stats("ultra5")[1], stats("ultra5")[0]],
        [["TIME", "1:00.00"], ["TIME", "2:00.00"], ["TIME", "3:00.00"], ["TIME", "5:00.00"], ["GUIDELINE", "ULTRA"]]);
    const u = startedGuideline("ultra1");
    u.frames = 3599;
    u.advanceFrame(0);
    check("  ...Ultra 1:00 ends after a minute", [u.isGameOver(), u.endTitle], [true, "TIME UP"]);
    const m = startedGuideline("marathon", 5);
    const gravity6 = m.gravity;
    clearField(m);
    m.lines = 9;
    tapClear(m, 1);
    const at10 = m.level;
    m.lines = 59;
    tapClear(m, 1);
    check("Marathon start level: from level 1 + startLevel, the lines a level needs counted from level 1 (tetris.wiki)",
        [createGame(guideline, "marathon", 5).level, gravity6 === createGame(guideline, "standard", 5).gravity, at10, m.level, createGame(guideline, "marathon", 40).level],
        [6, true, 6, 7, 15]);
    check("  ...Variable goal from a later level too", stats("variable", 2).slice(1, 3), [["LEVEL", "3"], ["GOAL", "0 / 15"]]);
}

// ---------------------------------------------------------------- TGM1's hidden modes
function startedTgm1With(options, variant = "standard") {
    const g = createGame(tgmOriginal, variant, 0, 0, {}, options);
    for (let f = 0; f < 200 && g.phase !== "active"; f++) g.advanceFrame(0);
    return g;
}
{
    const mono = startedTgm1With({ mono: true });
    check("TGM1 Mono: every piece one colour", [new Set(mono.palette.slice(1)).size, startedTgm1With({}).palette.slice(1).length], [1, 7]);
    const tls = startedTgm1With({ tls: true }), plain = startedTgm1With({});
    for (const g of [tls, plain]) { clearField(g); g.level = 300; g.updateTimings(); place(g, tetO, 0, 5, 3); }
    check("TGM1 TLS: the ghost piece all game, not only below level 100",
        [tls.getShadowRow() !== -100, plain.getShadowRow()], [true, -100]);
    const rev = startedTgm1With({ rev: true });
    check("TGM1 Rev: the rules only mark the game (the engine draws the well upside down)",
        [rev.rev, plain.rev, rev.getStats()[0]], [true, false, ["TGM1", "MASTER"]]);
    const all = startedTgm1With({ big: true, rev: true, mono: true, tls: true }, "20g");
    check("  ...the codes combine", [all.big, all.rev, new Set(all.palette.slice(1)).size, all.tls, all.gravity, all.getStats()[0]],
        [true, true, 1, true, 20, ["TGM1", "20G BIG"]]);
}

// ---------------------------------------------------------------- TAP Normal: Free Fall's full rows
{
    const g = startedMode(tgmTap, "normal");
    clearField(g);
    fill(g, ["#########.", "#########.", "#########."]);
    for (let r = 10; r < 13; r++) g.setCell(r, 9, 2); // three blocks hanging over the gaps
    g.setCell(9, 0, 3);
    const lines = g.lines, score = g.score;
    place(g, tetO, 0, 5, 3);
    g.lock();
    g.useItem("FREE FALL");
    const row = r => [...Array(WIDTH)].map((_, c) => g.getCell(r, c) ? "#" : ".").join("");
    check("TAP Normal Free Fall: rows it fills clear at once, without score or lines",
        [row(21), row(20), g.lines - lines, g.score - score], ["#...##....", "....##....", 0, 0]); // the O locked on top fell too
}

// ---------------------------------------------------------------- Personal records
{
    const sprint = startedGuideline("sprint");
    check("Records: Sprint counts only when finished, by time",
        [sprint.record(), (() => { sprint.frames = 3000; sprint.endTitle = "COMPLETE"; return sprint.record(); })()],
        [null, { key: [-3000], text: "0:50.00" }]);
    const marathon = startedGuideline("marathon"); marathon.score = 1234;
    const master = startedGuideline("master"); master.lines = 42; master.frames = 600;
    check("  ...Marathon by score, Master by lines then time",
        [marathon.record(), master.record()], [{ key: [1234], text: "1,234" }, { key: [42, -600], text: "42 LINES · 0:10.00" }]);
    const tgm3 = startedMode(arika, "standard"); tgm3.level = 300; tgm3.frames = 6000; tgm3.cools = 2;
    const tap = startedMode(tgmTap, "death"); tap.finalGrade = "M"; tap.level = 500; tap.frames = 9000;
    const tap2 = startedMode(tgmTap, "death"); tap2.level = 600; tap2.frames = 1;
    check("  ...TGM by grade, then level, then time; M and GM above every grade, Death's — below",
        [tgm3.record().text, tgm3.record().key, tap.record().key[0] > TGM_GRADE_LABELS.length - 1, tap2.record().key[0]],
        ["7 · LV 300 · 1:40.00", [2, 300, -6000], true, -1]);
    const shirase = startedMode(arika, "shirase"); shirase.sectionsDone = 5; shirase.regrets = 1;
    const easy = startedMode(arika, "easy"); easy.hanabi = 77;
    const ace = startedMode(tgmAce, "normal"); ace.lines = 35; ace.frames = 120;
    const nes = startedNes(); nes.score = 5000;
    check("  ...Shirase's grade, Easy's fireworks, ACE's lines then time, NES by score",
        [shirase.record().key[0], easy.record(), ace.record(), nes.record()],
        [4, { key: [77], text: "77 HANABI" }, { key: [35, -120], text: "35 LINES · 0:02.00" }, { key: [5000], text: "5,000" }]);
}

// ---------------------------------------------------------------- Easy's fireworks
{
    const g = startedMode(arika, "easy");
    g.hanabiPending = 3;
    for (let f = 0; f < 40; f++) g.advanceFrame(0);
    const fired = g.takeFireworks();
    g.hanabiPending = 5;
    g.flushHanabi();
    check("Easy fireworks are reported as they fire (the engine draws them), the end's all at once",
        [fired, g.takeFireworks(), g.takeFireworks(), g.hanabi], [3, 5, 0, 8]);
}

// ---------------------------------------------------------------- Secret grade
function startedWith(mode, variant, options) {
    const g = createGame(mode, variant, 0, 0, {}, options);
    for (let f = 0; f < 200 && g.phase !== "active"; f++) g.advanceFrame(0);
    return g;
}
// The ">" pattern, rows high from the bottom: row k's hole in column 9 - |10 - k|; cover: a block
// above the top row's hole
function buildSecret(g, rows, cover = true) {
    for (let r = 0; r < HEIGHT; r++) for (let c = 0; c < WIDTH; c++) g.setCell(r, c, 0);
    const hole = k => 9 - Math.abs(10 - k);
    for (let k = 1; k <= rows; k++) for (let c = 0; c < WIDTH; c++) g.setCell(HEIGHT - k, c, c === hole(k) ? 0 : 1);
    if (cover) g.setCell(HEIGHT - rows - 1, hole(rows), 1);
}
function secretAt(g, rows, cover = true) {
    buildSecret(g, rows, cover);
    g.endGame("GAME OVER", "");
    return g.secretGrade;
}
{
    check("Secret grade: rows of the > pattern from the bottom, 9 ... S9, GM for all 19 (TGM1)",
        [secretAt(startedMode(tgmOriginal, "standard"), 5), secretAt(startedMode(tgmOriginal, "standard"), 18),
            secretAt(startedMode(tgmOriginal, "standard"), 19)], ["5", "S9", "GM"]);
    check("  ...the top hole must be covered (19 rows, uncovered: S9), fewer than 5 rows aren't shown",
        [secretAt(startedMode(tgmTap, "standard"), 19, false), secretAt(startedMode(tgmTap, "standard"), 4)], ["S9", null]);
    const broken = startedMode(arika, "standard");
    buildSecret(broken, 12);
    broken.setCell(HEIGHT - 3, 0, 0); // a second hole in the third row
    broken.endGame("GAME OVER", "");
    check("  ...a row with another hole ends the count (TGM3: two rows, not shown)", broken.secretGrade, null);
    const tgm3 = startedMode(arika, "standard");
    secretAt(tgm3, 19);
    check("  ...TGM3 Master and TAP Death have it, in the game over banner's notes", [tgm3.endNotes(), secretAt(startedMode(tgmTap, "death"), 9)],
        [["SECRET GRADE GM"], "1"]);
    check("  ...Shirase's run S1 ... S9, m1 ... m9, GM", [secretAt(startedMode(arika, "shirase"), 9), secretAt(startedMode(arika, "shirase"), 10),
        secretAt(startedMode(arika, "shirase"), 19)], ["S9", "m1", "GM"]);
    check("  ...none in TGM+, TAP Normal and Easy (no grades)", [secretAt(startedMode(tgmTap, "plus"), 19),
        secretAt(startedMode(tgmTap, "normal"), 19), secretAt(startedMode(arika, "easy"), 19)], [null, null, null]);
}

// ---------------------------------------------------------------- TGM3 qualified grade and exams
{
    const state = (qualified, history, demotion = 0) => ({ qualified, history, demotion });
    const h = [10, 12, 11, 9, 8, 13, 5];
    check("TGM3 exams: the promotional grade is the 2nd-4th best of the last 7 averaged, rounded down; none before 7 games",
        [tgm3PromotionGrade(state(0, h)), tgm3PromotionGrade(state(0, h.slice(0, 6))), TGM3_EXAM_HISTORY], [11, -1, 7]);
    check("  ...Grand Master is tested only once qualified as MasterM",
        [tgm3PromotionGrade(state(30, Array(7).fill(32))), tgm3PromotionGrade(state(31, Array(7).fill(32)))], [31, 32]);
    check("  ...a 1 in 3 chance per game: a promotion above the qualified grade, else a demotion from 30 points",
        [tgm3ExamFor(state(5, h), 0.5), tgm3ExamFor(state(5, h), 0.1), tgm3ExamFor(state(11, h, 30), 0.1), tgm3ExamFor(state(11, h, 29), 0.1)],
        [null, { kind: "promotion", grade: 11 }, { kind: "demotion", grade: 11 }, null]);
    const promo = { kind: "promotion", grade: 11 };
    check("  ...passing qualifies at the exam grade (demotion points cleared), failing changes nothing; the grade joins the history",
        [tgm3ExamAfter(state(5, h, 4), promo, 12), tgm3ExamAfter(state(5, h, 4), promo, 10)],
        [{ qualified: 11, demotion: 0, history: [12, 10, 12, 11, 9, 8, 13] }, { qualified: 5, demotion: 4, history: [10, 10, 12, 11, 9, 8, 13] }]);
    check("  ...a game 8 or more grades below the qualified one adds the excess over 7 to the demotion points",
        [tgm3ExamAfter(state(20, []), null, 13).demotion, tgm3ExamAfter(state(20, []), null, 12).demotion, tgm3ExamAfter(state(20, [], 5), null, 10).demotion],
        [0, 1, 8]);
    const demo = { kind: "demotion", grade: 20 };
    check("  ...a demotional exam spends the points; short of the grade the player loses one",
        [tgm3ExamAfter(state(20, [], 30), demo, 15), tgm3ExamAfter(state(20, [], 30), demo, 20).qualified],
        [{ qualified: 19, demotion: 0, history: [15] }, 20]);

    // Grand Master in play: with exams only for a qualified one, or passing the exam for it
    const gmGame = (options) => {
        const g = startedWith(arika, "standard", options);
        g.internalGrade = TGM_GRADE_LABELS.length - 2; g.cools = 9; g.rollPoints = 600; g.roll = "invisible"; g.rollCleared = true;
        return g;
    };
    check("  ...an earned GM shows as MasterM unless qualified GM or passing the GM exam; exams off: GM as before",
        [gmGame({ exams: true }).gradeLabel(), gmGame({ exams: true }).earnedGradeIndex(), gmGame({ exams: true, qualified: 32 }).gradeLabel(),
            gmGame({ exams: true, qualified: 31, exam: { kind: "promotion", grade: 32 } }).gradeLabel(), gmGame({}).gradeLabel()],
        ["MasterM", 32, "Grand Master", "Grand Master", "Grand Master"]);
    check("  ...exams only in Master without Big", [startedWith(arika, "standard", { exams: true, big: true }).exams,
        startedWith(arika, "easy", { exams: true }).exams, startedWith(tgmClassic, "standard", { exams: true }).exams], [false, false, true]);

    const g = startedWith(tgmClassic, "standard", { exams: true, qualified: 3, exam: { kind: "promotion", grade: 9 } });
    const stats = g.getStats();
    check("  ...a promotional exam is announced and shown in place of the score",
        [g.actions.map(a => a.text), stats[stats.length - 1]], [["EXAM S1"], ["EXAM", "S1"]]);
    g.endGame("GAME OVER", "");
    const passed = startedWith(arika, "standard", { exams: true, qualified: 3, exam: { kind: "promotion", grade: 0 } });
    passed.endGame("GAME OVER", "");
    const demoted = startedWith(arika, "standard", { exams: true, qualified: 12, exam: { kind: "demotion", grade: 12 } });
    demoted.endGame("GAME OVER", "");
    check("  ...the banner reports the exam", [g.endNotes(), passed.endNotes(), demoted.endNotes()],
        [["EXAM FAILED — S1 NOT REACHED"], ["EXAM PASSED — QUALIFIED 9"], ["DEMOTED TO S3"]]);
}

// ---------------------------------------------------------------- Guideline: 180° rotation, previews, hold, IRS, IHS
{
    const off = handlingGame({});
    place(off, tetT, 0, 5, 3);
    off.advanceFrame(ROT180_PUSH);
    const on = handlingGame({ rot180: true });
    place(on, tetT, 0, 5, 3);
    on.advanceFrame(ROT180_PUSH);
    check("180° rotation: off by default; on, the key turns the piece half round", [off.curPiece_rotation, on.curPiece_rotation], [0, 2]);
    const kick = handlingGame({ rot180: true });
    place(kick, tetT, 0, 5, 3);
    kick.setCell(7, 4, 1); // where the turned T's point would go
    kick.advanceFrame(ROT180_PUSH);
    check("  ...blocked in place it kicks (SRS+ 0->2: one left first); no SRS T-spin upgrade from it",
        [kick.curPiece_rotation, kick.curPiece_col, kick.lastKick], [2, 2, -1]);
    const irs = handlingGame({ rot180: true }), noIrs = handlingGame({ rot180: true, irs: false });
    for (const g of [irs, noIrs]) { g.held.rot180 = true; g.spawn(tetT, false); }
    check("  ...held as a piece enters it turns it (IRS), unless IRS is off", [irs.curPiece_rotation, noIrs.curPiece_rotation], [2, 0]);
    const tgm = started(arika);
    tgm.held.rot180 = true; tgm.spawn(tetT, false);
    const r0 = tgm.curPiece_rotation;
    tgm.advanceFrame(ROT180_PUSH);
    check("  ...the other rule sets ignore the key", [r0, tgm.curPiece_rotation], [0, 0]);
}
{
    const none = handlingGame({ previews: 0 }), three = handlingGame({ previews: 3 });
    check("Guideline previews: 0-6 next pieces (6 by default), a piece always queued",
        [handlingGame({}).nextCount, three.nextCount, none.nextCount, none.queue.length >= 1], [6, 3, 0, true]);
    const g = handlingGame({ holdPiece: false });
    const type = g.curPiece_type;
    g.advanceFrame(HOLD_PUSH);
    check("  ...hold off: no hold, the key does nothing", [g.hasHold, g.curPiece_type, g.getHeldPiece()], [false, type, 0]);
    const ihs = handlingGame({}), noIhs = handlingGame({ ihs: false });
    for (const h of [ihs, noIhs]) { h.held.hold = true; h.spawn(tetT, false); }
    check("  ...IHS: hold held as a piece enters swaps it, unless IHS is off", [ihs.getHeldPiece(), noIhs.getHeldPiece(), noIhs.curPiece_type], [tetT, 0, tetT]);
    const paused = handlingGame({});
    paused.setHandling({ holdPiece: false, previews: 1 });
    check("  ...changed during a game they apply at once", [paused.hasHold, paused.canHold, paused.nextCount], [false, false, 1]);
}

// ---------------------------------------------------------------- GB heart mode
{
    const plain = createGame(gbTetris, "standard", 5), heart = createGame(gbTetris, "standard", 5, 0, {}, { heart: true });
    const b = createGame(gbTetris, "btype", 9, 0, {}, { heart: true });
    check("GB heart mode: gravity as 10 levels higher (at most level 20's), the level and score unchanged",
        [plain.gbFrames, heart.gbFrames, b.gbFrames, heart.level], [GB_GRAVITY[5], GB_GRAVITY[15], GB_GRAVITY[19], 5]);
    heart.level = 15; heart.updateTimings();
    check("  ...capped at level 20's speed; the stats show the level with a heart", [heart.gbFrames, heart.getStats()[1]], [GB_GRAVITY[20], ["LEVEL", "15 ♥"]]);
    const g = startedWith(gbTetris, "standard", { heart: true });
    fill(g, ["######### "]);
    place(g, tetI, 1, 16, 8); // standing in column 9
    g.gravityAcc = 0;
    for (let f = 0; f < 200 && g.lines === 0; f++) g.advanceFrame(0);
    check("  ...a single at level 0 scores 40 as without it", [g.lines, g.score], [1, 40]);
}

// ---------------------------------------------------------------- Guideline versus
{
    const deal = (seed, n) => {
        const g = createGame(guideline, "versus", 0, 0, {}, { seed }), q = [];
        while (q.length < n) { q.push(g.queue.shift()); g.fillQueue(); }
        return q;
    };
    const a = deal(5, 14), b = deal(5, 14), c = deal(6, 14);
    check("Versus: the same seed deals the same pieces, another seed others, each bag of 7 one of every piece",
        [a.join("") === b.join(""), a.join("") === c.join(""), a.slice(0, 7).sort(), a.slice(7).sort()],
        [true, false, [1, 2, 3, 4, 5, 6, 7], [1, 2, 3, 4, 5, 6, 7]]);
}
{
    const lines = (n, more = {}) => versusAttack({ n, tspin: null, b2b: false, combo: 0, pc: false, ...more });
    check("Versus attacks: single 0, double 1, triple 2, Tetris 4; T-spin single 2, double 4, triple 6; mini single 0, double 1",
        [lines(1), lines(2), lines(3), lines(4), lines(1, { tspin: "full" }), lines(2, { tspin: "full" }), lines(3, { tspin: "full" }),
            lines(1, { tspin: "mini" }), lines(2, { tspin: "mini" })],
        [0, 1, 2, 4, 2, 4, 6, 0, 1]);
    check("  ...back-to-back +1, combos by the Guideline table (combo 2: +1, 13 and on: +5), perfect clear +10, nothing without lines",
        [lines(4, { b2b: true }), lines(1, { combo: 2 }), lines(2, { combo: 20 }), lines(4, { pc: true }), lines(0, { tspin: "full" })],
        [5, 1, 6, 14, 0]);
}
{
    const g = startedGuideline("versus");
    check("  ...stats: level, sent, attack per minute, pieces per second, lines", g.getStats().map(s => s[0]), ["GUIDELINE", "LEVEL", "SENT", "APM", "PPS", "LINES"]);
    g.receiveGarbage({ lines: 3, hole: 4 });
    g.attack({ n: 4, tspin: null, b2b: false, combo: 0, pc: false });
    check("  ...an attack cancels the garbage waiting first and sends the rest", [g.pendingGarbage(), g.takeAttacks(), g.linesSent, g.attackTotal], [0, [{ lines: 1 }], 1, 4]);

    clearField(g);
    fill(g, ["#.........", "###....###"]); // the block left over: not a perfect clear
    place(g, tetI, 0, 20, 3); // fills the gap: a single, which sends nothing
    g.receiveGarbage({ lines: 2, hole: 7 });
    g.advanceFrame(HARD_PUSH);
    check("  ...garbage waits while pieces clear lines", [g.lines, g.pendingGarbage(), g.takeRisenGarbage()], [1, 2, []]);

    for (let f = 0; f < 30 && g.phase !== "active"; f++) g.advanceFrame(0);
    place(g, tetO, 0, 19, 0); // clears nothing
    g.takeHardDropCells();
    g.advanceFrame(HARD_PUSH);
    const row = r => Array.from({ length: WIDTH }, (_, c) => g.getCell(r, c));
    const garbageRow = Array.from({ length: WIDTH }, (_, c) => c === 7 ? 0 : tetGARBAGE);
    check("  ...then all of it rises under the stack: grey rows with the attack's hole, the piece pushed up",
        [g.pendingGarbage(), g.takeRisenGarbage(), row(21), row(20), [g.getCell(19, 1), g.getCell(18, 1)]],
        [0, [2], garbageRow, garbageRow, [tetO, tetO]]);
    check("  ...the hard drop's flash and trail follow the piece up", g.takeHardDropCells().every(c => g.getCell(c.row, c.col) === tetO), true);

    for (let f = 0; f < 30 && g.phase !== "active"; f++) g.advanceFrame(0);
    g.setCell(FIELD_TOP + 1, 0, 1); // a block one row below the top of the buffer (vanish) zone
    g.receiveGarbage({ lines: 1, hole: 0 });
    place(g, tetO, 0, 15, 4);
    g.advanceFrame(HARD_PUSH);
    check("  ...garbage pushing a block up to the buffer zone's top row is no top out (tetris.wiki: above it)",
        [g.isGameOver(), g.getCell(FIELD_TOP, 0)], [false, 1]);

    for (let f = 0; f < 30 && g.phase !== "active"; f++) g.advanceFrame(0);
    g.receiveGarbage({ lines: 1, hole: 0 });
    place(g, tetO, 0, 15, 4);
    g.advanceFrame(HARD_PUSH);
    check("  ...garbage pushing blocks out of the top tops the player out", [g.isGameOver(), g.endTitle, g.endSub], [true, "GAME OVER", "TOP OUT — ESC FOR MENU"]);
    check("  ...versus games keep no record", startedGuideline("versus").record(), null);
}
{
    // the speed comes from the match's time, not the lines: level 1 for a minute, then one every 30 s, to 15 at 7:30
    const levelAt = seconds => { const g = startedGuideline("versus"); g.frames = seconds * 60 - 1; g.advanceFrame(0); return g.level; };
    check("Versus speed: level 1 to 0:59, 2 at 1:00, 3 at 1:30, 14 at 7:00, 15 at 7:30 and after",
        [levelAt(59), levelAt(60), levelAt(90), levelAt(420), levelAt(450), levelAt(900)], [1, 2, 3, 14, 15, 15]);
    const g = startedGuideline("versus");
    g.frames = 90 * 60 - 1;
    g.advanceFrame(0);
    const gravity = g.gravity;
    g.lines = 39;
    g.scoreGuideline(1, null, []);
    check("  ...the gravity is the Guideline's at that level, and 40 lines don't raise it",
        [g.level, gravity === guidelineGravity(3), g.gravity === gravity], [3, true, true]);
}
{
    // the setup cards: the speed, and the garbage's cap, delay and holes
    const started = options => {
        const g = createGame(guideline, "versus", 0, 0, {}, options);
        for (let f = 0; f < 200 && g.phase !== "active"; f++) g.advanceFrame(0);
        return g;
    };
    const fixed = started({ speed: 7 });
    fixed.frames = 600 * 60;
    fixed.advanceFrame(0);
    const g20 = started({ speed: "20g" });
    check("Versus Speed card: one level all match, or 20G (LEVEL shows 20G)",
        [fixed.level, fixed.gravity === guidelineGravity(7), g20.gravity, g20.softGravity, g20.getStats()[1]],
        [7, true, 20, 20, ["LEVEL", "20G"]]);

    // a lock that clears nothing: an O on the floor's left
    const lockO = g => {
        for (let f = 0; f < 30 && g.phase !== "active"; f++) g.advanceFrame(0);
        clearField(g);
        place(g, tetO, 0, 19, 0);
        g.advanceFrame(HARD_PUSH);
        return g.takeRisenGarbage();
    };
    const capped = started({ garbageCap: 4 });
    capped.receiveGarbage({ lines: 3, hole: 2 });
    capped.receiveGarbage({ lines: 3, hole: 5 });
    const first = lockO(capped);
    const left = [capped.pendingGarbage(), capped.incoming.map(g => [g.lines, g.hole])];
    check("Versus Garbage cap: at most 4 rows rise on a lock, the rest of an attack the cap cuts waits for the next",
        [first, left, lockO(capped), capped.pendingGarbage()], [[4], [2, [[2, 5]]], [2], 0]);

    const delayed = started({ garbageDelay: 30 });
    delayed.receiveGarbage({ lines: 2, hole: 0 });
    const early = [delayed.readyGarbage(), lockO(delayed), delayed.pendingGarbage()];
    delayed.frames += 30;
    check("Versus Garbage delay: an attack may rise only once it has waited 30 frames, and is cancelled meanwhile as before",
        [early, delayed.readyGarbage(), lockO(delayed)], [[0, [], 2], 2, [2]]);
    const cancel = started({ garbageDelay: 30 });
    cancel.receiveGarbage({ lines: 3, hole: 0 });
    cancel.attack({ n: 2, tspin: null, b2b: false, combo: 0, pc: false });
    check("  ...an attack still waiting is cancelled by a clear", cancel.pendingGarbage(), 2);

    const messy = started({ messiness: 1 });
    messy.receiveGarbage({ lines: 6, hole: 3 });
    lockO(messy);
    const holes = [16, 17, 18, 19, 20, 21].map(r => Array.from({ length: WIDTH }, (_, c) => messy.getCell(r, c)).indexOf(0));
    check("Versus Holes, every row its own: each garbage row has one hole, never in the column of the row next to it",
        [holes.every(h => h >= 0), holes.every((h, k) => k === 0 || h !== holes[k - 1]), holes[0]],
        [true, true, 3]);
    const clean = started({});
    clean.receiveGarbage({ lines: 3, hole: 6 });
    lockO(clean);
    check("  ...by default one column per attack",
        [19, 20, 21].map(r => Array.from({ length: WIDTH }, (_, c) => clean.getCell(r, c)).indexOf(0)), [6, 6, 6]);
}

// ---------------------------------------------------------------- TGM3 and NES versus
// A match's two sides (rival), dealt from one seed, run to their first piece
function versusPair(mode, seed = 5, startLevel = 0, options = {}, height = 0) {
    const games = [0, 1].map(() => createGame(mode, "versus", startLevel, height, {}, { seed, ...options }));
    [games[0].rival, games[1].rival] = [games[1], games[0]];
    for (const g of games) for (let f = 0; f < 200 && g.phase !== "active"; f++) g.advanceFrame(0);
    return games;
}
const rowOf = (g, r) => Array.from({ length: WIDTH }, (_, c) => g.getCell(r, c));
{
    // Exchg Field: the fields swap; the side it hits keeps its item blocks where they were; it waits for every attack on
    // either side to end (the guide)
    const [a, d] = versusPair(tgmTap, 5, 0, { items: true });
    clearField(a);
    clearField(d);
    fill(a, ["#########."]);
    fill(d, ["###.......", "##........"]);
    d.itemCells[20 - FIELD_TOP][0] = "LASER"; // an item block of the side hit, in row 20
    a.receiveGarbage({ item: "180° FIELD" }); // an attack on the side setting it off (its one row stays put): it waits
    a.firingItems = ["EXCHG FIELD"];
    a.fireItems();
    const waited = [a.waitingItems.slice(), a.takeAttacks()];
    a.cutIn = 0;
    a.itemEffects = {};
    a.takeItems();
    for (const attack of a.takeAttacks()) d.receiveGarbage(attack);
    check("Exchg Field: it waits for the attacks on either side to end, then the fields swap; the side hit keeps its item blocks",
        [waited, [20, 21].map(r => rowOf(a, r).map(v => v ? "#" : ".").join("")), [20, 21].map(r => rowOf(d, r).map(v => v ? "#" : ".").join("")), d.getCellItem(20, 0), a.getCellItem(20, 0), d.curPiece_type, d.cutIn],
        [[["EXCHG FIELD"], []], ["###.......", "##........"], ["#.........", "#########."], "LASER", null, 0, VS_CUTIN_FRAMES]);
}
{
    // the Item style, whose garbage is the plain one (Attack and Defence below)
    const [a, b] = versusPair(arika, 7, 0, { style: "item" }), [c] = versusPair(arika, 8, 0, { style: "item" });
    const deal = g => [g.curPiece_type, ...piecesOf(g)].join("");
    check("TGM3 versus: both sides deal the same pieces, another seed others; no grade, no record, stats LEVEL / 200, TIME, SENT",
        [deal(a) === deal(b), deal(a) === deal(c), a.record(), a.getStats().map(s => s[0])],
        [true, false, null, ["TGM3 TI", "LEVEL", "TIME", "SENT", "SCORE"]]);
    check("  ...the time counts down from 2:40", a.getStats()[2][1], a.formatTime(TGM_VS_FRAMES - a.frames));

    clearField(a);
    fill(a, ["##.......#", "#########.", "#########."]);
    a.setCell(21, 0, tetZ); a.setCell(20, 0, tetS); // tell the two rows apart
    place(a, tetI, 1, 18, 7); // vertical in column 9: rows 18-21, clears 20 and 21
    a.advanceFrame(HARD_PUSH);
    const attacks = a.takeAttacks();
    const sent21 = [tetZ, 1, 1, 1, 1, 1, 1, 1, 1, 0], sent20 = [tetS, 1, 1, 1, 1, 1, 1, 1, 1, 0];
    check("  ...a double sends its two rows without the clearing piece's blocks, upside down (the bottom row on top)",
        [attacks.length, attacks[0].lines, attacks[0].rows, a.linesSent], [1, 2, [sent21, sent20], 2]);

    b.receiveGarbage({ ...attacks[0], hole: 3 });
    clearField(b);
    fill(b, ["########.."]);
    b.setCell(10, 0, 1);
    place(b, tetO, 0, 19, 7); // fills columns 8-9: a single, which sends nothing
    b.advanceFrame(HARD_PUSH);
    const waiting = [b.takeAttacks(), b.pendingGarbage(), b.phase];
    for (let f = 0; f < 100 && b.phase !== "active"; f++) b.advanceFrame(0);
    check("  ...a single sends nothing; garbage waits for the receiver's clear to finish (Heboris: after every lock)",
        [waiting, b.pendingGarbage(), b.takeRisenGarbage()], [[[], 2, "lineclear"], 0, [2]]);
    check("  ...then rises under the stack as sent: the attacker's bottom row on top, the piece's row pushed up",
        [rowOf(b, 20), rowOf(b, 21), b.getCell(19, 8)], [sent21, sent20, tetO]);
    const [s1] = versusPair(arika, 7);
    clearField(s1);
    s1.receiveGarbage({ lines: 1, rows: [sent20] });
    place(s1, tetO, 0, 19, 0); // clears nothing: rises at once
    s1.advanceFrame(HARD_PUSH);
    check("  ...after a lock that clears nothing it rises at once", [s1.takeRisenGarbage(), rowOf(s1, 21)], [[1], sent20]);

    const [d] = versusPair(arika);
    for (let k = 0; k < 4; k++) d.receiveGarbage({ lines: 3, rows: [sent21, sent20, sent21] });
    const [t] = versusPair(arika, 7);
    clearField(t);
    t.setCell(1, 4, tetT); // a block in the buffer row
    t.receiveGarbage({ lines: 1, rows: [sent20] });
    place(t, tetO, 0, 19, 0);
    t.advanceFrame(HARD_PUSH);
    check("  ...blocks it pushes out of the top are lost, no top out (the guide: \"forgotten\")", [t.isGameOver(), t.getCell(0, 4), t.getCell(1, 4)], [false, 0, 0]);
    check("  ...at most 8 rows wait (the guide's cap)", [TGM_VS_GARBAGE_MAX, d.pendingGarbage(), d.incoming.map(g => g.lines)], [8, 8, [3, 3, 2]]);
}
{
    // the Handicap card: one side starts some levels on, at their speed
    const handicapped = (mode, options) => [0, 1].map(side => createGame(mode, "versus", 0, 0, {}, { seed: 5, side, ...options }));
    const [p1, p2] = handicapped(tgmTap, { handicap: { side: 1, levels: 100 } }), [d1, d2] = handicapped(tgmTap, { handicap: { side: 0, levels: 50 }, speed: "death" });
    check("Versus Handicap: the side it names starts at its level, with that level's speed (TAP Master, Death)",
        [p1.level, p2.level, p2.gravity > p1.gravity, d1.level, d2.level], [0, 100, true, 50, 0]);
    const [g1] = handicapped(tgmTap, { handicap: { side: 0, levels: 100 }, goal: 100 });
    for (let f = 0; f < 200 && g1.phase !== "active"; f++) g1.advanceFrame(0);
    g1.lock();
    check("  ...at most half the way to the goal (Goal 100: a start at 100 starts at 50, no round won on the first lock)",
        [g1.level >= 50 && g1.level < 100, g1.isGameOver()], [true, false]);
}
{
    const [a, b] = versusPair(tgmClassic);
    a.level = 199;
    clearField(a);
    fill(a, ["#########.", "#########."]);
    place(a, tetI, 1, 18, 7); // vertical in column 9; Classic: a soft drop locks it on the ground
    a.advanceFrame(SOFT_PUSH);
    for (let f = 0; f < 5 && !a.isGameOver(); f++) a.advanceFrame(SOFT_PUSH);
    check("TGM3 versus: level 200 ends the round, the side reaching it wins (the field collapsed)",
        [a.level, a.isGameOver(), a.endTitle, a.goalReached, a.versusOutcome(), b.versusOutcome(), a.getCell(21, 9)],
        [200, true, "LEVEL 200", true, "win", "lose", tetI]);
}
{
    // TGM3's Clear Rule: a race to the goal level, no garbage, no items
    const [c] = versusPair(arika, 5, 0, { clearRule: true, items: true });
    check("TGM3 Clear Rule: a race to the goal level, without garbage or items", [c.sendsGarbage, c.itemsOn, c.maxLevel, c.getStats()[0][1]],
        [false, false, 200, "WORLD CLEAR RULE"]);
}
{
    const [a, b] = versusPair(arika);
    a.frames = b.frames = TGM_VS_FRAMES - 1;
    a.level = 120; b.level = 80;
    check("  ...before time runs out nothing is decided", a.versusOutcome(), null);
    a.advanceFrame(0); b.advanceFrame(0);
    check("  ...at 2:40 time is up: the higher level wins", [a.endTitle, b.endTitle, a.versusOutcome(), b.versusOutcome()], ["TIME UP", "TIME UP", "win", "lose"]);
    b.level = 120;
    check("  ...the same level is a draw", a.versusOutcome(), "draw");
    const [c, d] = versusPair(arika);
    d.endGame("GAME OVER", "");
    check("  ...topping out loses; a match is won with two rounds", [c.versusOutcome(), d.versusOutcome(), c.versusWins], ["win", "lose", 2]);
}
{
    // Mirror Block's turns are animated: the field goes dark and comes back a column at a time from the right, and the
    // side waits for it (VS_MIRROR_FRAMES) before its next piece; the cut-in covers the first turn
    const { VS_MIRROR_FRAMES, VS_MIRROR_DARK } = vm.runInThisContext("({ VS_MIRROR_FRAMES, VS_MIRROR_DARK })");
    const [, m] = versusPair(tgmTap, 5, 0, { items: true });
    clearField(m);
    fill(m, ["#........."]);
    m.receiveGarbage({ item: "MIRROR BLOCK" });
    const seen = () => Array.from({ length: WIDTH }, (_, c) => m.getCellAlpha(21, c)).join("");
    const first = [seen(), m.flipWait];
    for (let f = 0; f < 200 && m.phase !== "active"; f++) m.advanceFrame(0);
    place(m, tetO, 0, 18, 3);
    m.advanceFrame(SOFT_PUSH);
    const turned = [m.phase, m.phaseLength, seen()];
    for (let f = 0; f < VS_MIRROR_DARK + 3; f++) m.advanceFrame(0);
    check("Mirror Block: each turn of the field blanks it and brings its columns back from the right; the next piece waits for it",
        [first, turned, seen()], [["0000000000", 0], ["are", m.are + VS_MIRROR_FRAMES, "0000000000"], "0000000011"]);
}
{
    const [a, b] = versusPair(nesTetris, 9, 18);
    const [c] = versusPair(nesTetris, 10, 18);
    const deal = g => [g.curPiece_type, ...piecesOf(g)].join("");
    check("NES versus: best of five, as CTWC since 2022", a.versusWins, 3);
    check("NES versus: A-Type from the chosen level, both sides deal the same pieces, no garbage, no record",
        [a.level, deal(a) === deal(b), deal(a) === deal(c), a.sendsGarbage, a.record(), a.getStats().map(s => s[0])],
        [18, true, false, false, null, ["NES", "LEVEL", "LINES", "SCORE", "LEAD"]]);
    a.score = 999000;
    a.scoreGb(4);
    check("  ...scores go past 999,999 (CTWC); the stats show the lead", [a.score, a.getStats()[4], b.getStats()[4]],
        [999000 + 1200 * 19, ["AHEAD", (999000 + 1200 * 19).toLocaleString("en-US")], ["BEHIND", (999000 + 1200 * 19).toLocaleString("en-US")]]);
    a.score = 5000; b.score = 3000;
    a.onBlockOut();
    check("  ...a side that tops out sets the score to beat: undecided while the other is behind",
        [a.endTitle, a.endSub, a.versusOutcome(), b.versusOutcome()], ["TOPPED OUT", "SCORE 5,000 TO BEAT", null, null]);
    b.score = 5100;
    check("  ...passing it wins at once", [a.versusOutcome(), b.versusOutcome()], ["lose", "win"]);
    b.score = 4000;
    b.onBlockOut();
    check("  ...topping out behind it loses; the same score is a draw", [a.versusOutcome(), b.versusOutcome(), (b.score = 5000, b.versusOutcome())], ["win", "lose", "draw"]);
}


// ---------------------------------------------------------------- TGM1, TAP, ACE and GB versus, items
const rowText = (g, r) => Array.from({ length: WIDTH }, (_, c) => g.getCell(r, c) ? "#" : ".").join("");
{
    const deal = g => [g.curPiece_type, ...piecesOf(g)].join("");
    const same = (mode, options = {}) => {
        const [a, b] = versusPair(mode, 7, 0, options), [c] = versusPair(mode, 8, 0, options);
        return deal(a) === deal(b) && deal(a) !== deal(c);
    };
    check("Versus (TGM1, TAP, ACE, GB): the same seed deals the same pieces, another seed others",
        [same(tgmOriginal), same(tgmTap), same(tgmAce), same(aceArs2), same(gbTetris)], [true, true, true, true, true]);
    const firsts = Array.from({ length: 40 }, (_, seed) => createGame(tgmAce, "versus", 0, 0, {}, { seed }).queue[0]);
    check("  ...ACE's seeded bag never starts with S, Z or O", firsts.some(t => [tetS, tetZ, tetO].includes(t)), false);
    const [t1] = versusPair(tgmOriginal), [t2] = versusPair(tgmOriginal, 5, 0, { speed: "20g" });
    const [p1] = versusPair(tgmTap), [p2] = versusPair(tgmTap, 5, 0, { speed: "death" });
    const [e1] = versusPair(tgmAce, 5, 0, { speed: "another" });
    check("  ...speeds: TGM1 Master or 20G, TAP Master or Death (20G, no ghost), ACE by mode (Another's delays)",
        [t1.gravity < 1, t2.gravity, t2.ghostVisible(), p1.gravity < 1, p2.gravity, p2.ghostVisible(), p2.are, e1.gravity, e1.lockDelayMax],
        [true, 20, false, true, 20, false, 18, 20, 28]);
    check("  ...rounds to win: TGM1, TAP, ACE 2, GB 4; stats", [t1.versusWins, p1.versusWins, e1.versusWins, versusPair(gbTetris)[0].versusWins,
        t1.getStats().map(r => r[0]), p2.getStats()[0], e1.getStats().map(r => r[0]), versusPair(gbTetris)[0].getStats().map(r => r[0])],
        [2, 2, 2, 4, ["TGM1", "LEVEL", "TIME", "SENT", "SCORE"], ["TGM2 TAP", "DEATH VERSUS"], ["ACE", "LINES", "TIME", "SENT", "LEVEL"], ["GB", "LINES", "LEVEL", "SENT", "SCORE"]]);
}
{
    // Hard Block: the other side's next piece locks in shells; a full row with shell blocks loses its other blocks but
    // stays, the shells broken, and sends nothing (the guide; Heboris)
    const [a, d] = versusPair(tgmTap, 5, 0, { items: true });
    clearField(d);
    fill(d, ["####.#####", "####.#####", "####.#####", "....#....."]);
    d.receiveGarbage({ item: "HARD BLOCK" });
    for (let f = 0; f < 200 && d.phase !== "active"; f++) d.advanceFrame(0);
    const colour = d.getPieceColor();
    place(d, tetI, 1, 17, 2); // vertical I in column 5, rows 17-20: rows 18-20 full
    d.advanceFrame(SOFT_PUSH);
    const rows = [18, 19, 20, 21].map(r => rowText(d, r)), shell = d.getCellColor(17, 4); // the block above keeps its shell
    for (let f = 0; f < 200 && d.phase !== "active"; f++) d.advanceFrame(0);
    check("Hard Block: the other side's next piece locks in shells; its full rows lose the other blocks but stay, the shells broken, and send nothing",
        [colour, shell, rows, d.takeAttacks(), d.getCell(19, 4), d.getCellColor(19, 4) === d.palette[tetI]],
        [10, 10, ["....#.....", "....#.....", "....#.....", "....#....."], [], tetI, true]);
}
{
    // TAP: the TGM garbage; a perfect clear sends it twice
    const [a, b] = versusPair(tgmTap);
    clearField(a);
    fill(a, ["#######..#", "########.#"]);
    a.setCell(10, 0, 1);
    place(a, tetS, 1, 19, 7); // vertical S: (19,7), (20,7), (20,8), (21,8)
    a.advanceFrame(SOFT_PUSH); // TAP's soft drop locks on the ground
    const sent = a.takeAttacks();
    check("TAP versus: a double sends its rows without the clearing piece, upside down",
        sent.map(at => [at.lines, at.rows.map(r => r.map(v => v ? "#" : ".").join(""))]), [[2, ["########.#", "#######..#"]]]);
    b.receiveGarbage({ ...sent[0], hole: 3 });
    clearField(b);
    place(b, tetO, 0, 19, 0);
    b.advanceFrame(SOFT_PUSH);
    check("  ...it rises when the other side locks a piece that clears nothing: the top cleared row at the bottom",
        [b.takeRisenGarbage(), rowText(b, 21), rowText(b, 20), rowText(b, 19)], [[2], "#######..#", "########.#", ".##......."]);
    const [pc] = versusPair(tgmTap);
    clearField(pc);
    fill(pc, ["#########.", "#########.", "#########.", "#########."]);
    place(pc, tetI, 1, 18, 7);
    pc.advanceFrame(SOFT_PUSH);
    check("  ...a perfect clear sends its rows twice", pc.takeAttacks().map(at => [at.lines, at.rows.length]), [[8, 8]]);
}
{
    // the Garbage card Off: TAP's Cement Mode, no garbage either way (tetris.wiki)
    const [a, b] = versusPair(tgmTap, 5, 0, { garbage: false });
    clearField(a);
    fill(a, ["#######..#", "########.#"]);
    a.setCell(10, 0, 1);
    place(a, tetS, 1, 19, 7);
    a.advanceFrame(SOFT_PUSH);
    b.receiveGarbage({ lines: 2, rows: [rowOf(b, 21), rowOf(b, 21)] });
    check("Cement Mode (the Garbage card Off): a double sends nothing, and no garbage is taken", [a.takeAttacks(), a.linesSent, b.pendingGarbage(), a.sendsGarbage], [[], 0, 0, false]);
}
{
    const [a, b] = versusPair(tgmTap, 5, 0, { speed: "death" });
    a.level = 199;
    clearField(a);
    a.setCell(10, 0, 1);
    fill(a, ["#########."]);
    place(a, tetI, 1, 18, 7);
    a.advanceFrame(SOFT_PUSH);
    check("TAP versus: level 200 ends the round, the side reaching it wins", [a.level, a.endTitle, a.versusOutcome(), b.versusOutcome()],
        [200, "LEVEL 200", "win", "lose"]);
    const goal = (mode, g) => { const [v] = versusPair(mode, 5, 0, { goal: g }); return [v.maxLevel, v.formatTime(v.versusFrames), v.getStats()[1][1]]; };
    check("TAP and TGM3 versus: the goal can be set in steps of 100, the time 1:20 longer or shorter per step (tetris.wiki)",
        [goal(tgmTap, undefined), goal(tgmTap, 300), goal(arika, 100), goal(tgmClassic, 900)],
        [[200, "2:40.00", "0 / 200"], [300, "4:00.00", "0 / 300"], [100, "1:20.00", "0 / 100"], [900, "12:00.00", "0 / 900"]]);
    const [dv] = versusPair(tgmTap, 5, 0, { speed: "death", goal: 600 });
    dv.level = 499;
    dv.frames = 300 * 60; // past 3:25: in single play the level would stop at 500 and the credits roll
    clearField(dv);
    dv.setCell(10, 0, 1);
    fill(dv, ["#########."]);
    place(dv, tetI, 1, 18, 7);
    dv.advanceFrame(SOFT_PUSH);
    for (let f = 0; f < 100 && dv.phase !== "active"; f++) dv.advanceFrame(0);
    check("  ...TAP Death's level 500 check is single play's: a versus round goes on past it", [dv.level > 500, dv.timerStopped, dv.phase], [true, false, "active"]);
    const [plus] = versusPair(tgmTap, 5, 0, { speed: "plus" });
    clearField(plus);
    for (let k = 0; k < 13; k++) { place(plus, tetO, 0, 19, 4); plus.lock(); plus.curPiece_type = 0; clearField(plus); }
    check("TAP versus TGM+: TGM+'s delays and its rising pattern (tetris.wiki: all four modes play in versus)",
        [plus.are, plus.getStats()[0][1], plus.garbagePos], [27, "TGM+ VERSUS", 1]);
    const tapSpeed = (speed, level) => {
        const [v] = versusPair(tgmTap, 5, 0, { speed });
        v.level = level;
        v.updateTimings();
        return [v.gravity, v.are, v.das, v.lineClearDelay];
    };
    const [normal] = versusPair(tgmTap, 5, 0, { speed: "normal" });
    check("TAP versus Normal: Normal's gravity and delays (harddrop.com: \"their respective speed curves\"), not its items",
        [tapSpeed("normal", 100), tapSpeed("normal", 300), tapSpeed("master", 100), normal.getStats()[0][1], normal.maxLevel, normal.itemsOn],
        [[4 / 256, 27, 16, 40], [20, 27, 16, 40], [20480 / 65536, 27, 16, 40], "NORMAL VERSUS", 200, false]);
    const [c, d] = versusPair(tgmOriginal);
    c.level = 300; d.level = 100;
    c.frames = d.frames = TGM1_VS_FRAMES - 1;
    const going = c.versusOutcome();
    c.advanceFrame(0); d.advanceFrame(0);
    check("TGM1 versus: no goal before the end, and a round not decided in 5:00 is a draw whatever the levels",
        [c.maxLevel, going, c.endTitle, c.versusOutcome()], [999, null, "TIME UP", "draw"]);
    const [e, f] = versusPair(tgmAce, 5, 0, { speed: "normal" });
    e.lines = 19;
    clearField(e);
    e.setCell(10, 0, 1);
    fill(e, ["#########."]);
    place(e, tetI, 1, 18, 7);
    e.advanceFrame(HARD_PUSH);
    check("ACE versus: 20 lines end the round, the side clearing them wins", [e.lines, e.endTitle, e.versusOutcome(), f.versusOutcome()],
        [20, "20 LINES", "win", "lose"]);
    const [g, h] = versusPair(tgmAce, 5, 0, { speed: "another" });
    g.lines = 12; h.lines = 9;
    g.aceTimer = h.aceTimer = 0;
    g.frames = h.frames = 3 * 60 * 60 - 1;
    const alive = [g.isGameOver(), (g.advanceFrame(0), g.isGameOver())];
    h.advanceFrame(0);
    check("  ...no level clock; after 3:00 the side with more lines wins", [alive, g.endTitle, g.versusOutcome()], [[false, true], "TIME UP", "win"]);
}
{
    // Transform: for 3 pieces, a rotation in play turns the piece into a random one first (the guide)
    const [, d] = versusPair(tgmTap, 5, 0, { items: true });
    clearField(d);
    d.receiveGarbage({ item: "TRANSFORM" });
    for (let f = 0; f < 200 && d.phase !== "active"; f++) d.advanceFrame(0);
    d.gravity = 0;
    place(d, tetT, 0, 5, 3);
    const types = new Set();
    for (let k = 0; k < 40; k++) { d.advanceFrame(k % 2 ? ROTR_RELEASE : ROTR_PUSH); types.add(d.curPiece_type); }
    // against the left wall, a vertical I can't rotate: no transformation either
    place(d, tetI, 1, 5, -2); // ARS's vertical I is in its box's column 2
    const stuck = [];
    for (let k = 0; k < 10; k++) { d.advanceFrame(k % 2 ? ROTR_RELEASE : ROTR_PUSH); stuck.push(d.curPiece_type); }
    for (let k = 0; k < 3; k++) d.takeItems();
    place(d, tetT, 0, 5, 3);
    d.advanceFrame(ROTR_PUSH);
    check("Transform: a rotation in play turns the other side's piece into a random one, unless it couldn't rotate; for 3 pieces",
        [types.size >= 5, new Set(stuck).size, stuck[0], d.curPiece_type], [true, 1, tetI, tetT]);
}
{
    // the Rounds card: the rounds a side must win, in any rule set (else the rule set's own)
    check("Versus: the Rounds card sets the rounds to win the match",
        [versusPair(guideline, 5, 0, { rounds: 3 })[0].versusWins, versusPair(tgmTap, 5, 0, { rounds: 1 })[0].versusWins,
            versusPair(gbTetris, 5, 0, { rounds: 7 })[0].versusWins, versusPair(nesTetris, 5, 18)[0].versusWins], [3, 1, 7, 3]);
}
{
    // GB: lines by clear, one hole column both sides share, the same starting garbage
    const [a, b] = versusPair(gbTetris, 5, 0, {}, 3);
    const rows = g => Array.from({ length: 6 }, (_, k) => rowText(g, HEIGHT - 1 - k)).join("|");
    check("GB versus: both sides start over the same garbage (Height) and share the hole column",
        [rows(a) === rows(b), rows(a).replace(/[|.]/g, "").length > 0, a.vsHole === b.vsHole, a.height], [true, true, true, 3]);
    const sends = [1, 2, 3, 4].map(n => {
        const [g] = versusPair(gbTetris);
        clearField(g);
        g.setCell(10, 0, 1);
        fill(g, Array.from({ length: n }, () => "#########."));
        placeGb(g, tetI, 1, HEIGHT - 4, 8); // GB's vertical I stands in its box's second column
        g.lock();
        return g.takeAttacks().map(at => at.lines);
    });
    check("  ...a single sends nothing, a double 1, a triple 2, a Tetris 4", sends, [[], [1], [2], [4]]);
    const [r] = versusPair(gbTetris);
    clearField(r);
    r.receiveGarbage({ lines: 2, hole: 0 });
    placeGb(r, tetO, 0, 18, 3);
    r.lock();
    const hole = Array.from({ length: WIDTH }, (_, c) => c === r.vsHole ? "." : "#").join("");
    check("  ...the garbage rises after a lock that clears nothing, its holes in the shared column", [rowText(r, 21), rowText(r, 20)], [hole, hole]);
    const [c, d] = versusPair(gbTetris);
    c.lines = 29;
    clearField(c);
    c.setCell(10, 0, 1);
    fill(c, ["#########."]);
    placeGb(c, tetI, 1, HEIGHT - 4, 8);
    c.lock();
    check("  ...30 lines win the round", [c.endTitle, c.versusOutcome(), d.versusOutcome()], ["30 LINES", "win", "lose"]);
    const [g1] = versusPair(gbTetris, 5, 0, {}, 2), [g2] = versusPair(gbTetris, 5, 0, {}, 5);
    const bottom = g => Array.from({ length: 4 }, (_, k) => rowText(g, HEIGHT - 1 - k)).join("|");
    check("  ...each side its own height of one garbage pattern (tetris.wiki: each player sets theirs)",
        [bottom(g1) === bottom(g2), rowText(g1, HEIGHT - 5), rowText(g2, HEIGHT - 5) !== ".........."], [true, "..........", true]);
    const holes = new Set(Array.from({ length: 60 }, (_, seed) => versusPair(gbTetris, seed)[0].vsHole));
    const [lv] = versusPair(gbTetris, 5, 7), [hv] = versusPair(gbTetris, 5, 0, { heart: true });
    lv.lines = 25; lv.updateLevel();
    check("  ...the hole is always in an even column counted from 1 (the disassembly); level 1's speed, no level-ups, heart +10",
        [[...holes].every(h => h % 2 === 1), lv.level, lv.gbFrames, hv.gbFrames], [true, 1, GB_GRAVITY[1], GB_GRAVITY[11]]);
    const [e] = versusPair(gbTetris);
    clearField(e);
    e.setCell(10, 0, 1);
    e.receiveGarbage({ lines: 1, hole: 0 });
    fill(e, ["#########."]);
    placeGb(e, tetI, 1, HEIGHT - 4, 8);
    e.lock();
    const waits = e.pendingGarbage();
    for (let f = 0; f < 200 && e.phase !== "active"; f++) e.advanceFrame(0);
    check("  ...it rises when the next piece comes, after a clearing lock too", [waits, e.pendingGarbage(), e.takeRisenGarbage()], [1, 0, [1]]);
}
{
    // Death Block: the other side's next piece is a big one; the attacker's gauge fills again after the cut-in (the guide)
    const [a, d] = versusPair(tgmTap, 5, 0, { items: true });
    clearField(d);
    d.receiveGarbage({ item: "DEATH BLOCK" });
    const sniped = d.curPiece_type;
    for (let f = 0; f < 200 && d.phase !== "active"; f++) d.advanceFrame(0);
    const big = [d.big, d.curCells[d.curPiece_type][0].length, a.attacking()];
    d.advanceFrame(SOFT_PUSH); // TAP's soft drop locks on the ground: falls first
    for (let f = 0; f < 200 && d.phase === "active"; f++) d.advanceFrame(SOFT_PUSH);
    for (let f = 0; f < 200 && d.phase !== "active"; f++) d.advanceFrame(SOFT_RELEASE);
    check("Death Block: the other side's next piece is big, the one after it normal; the attacker's gauge fills after the cut-in",
        [sniped, big, d.big, d.curCells[d.curPiece_type][0].length], [0, [true, 16, false], false, 4]);
}
{
    // A big piece filling one row clears no line, but the row still collapses: the garbage waiting rises only after
    // that, and the lasting items count the piece once
    const [d] = versusPair(tgmTap, 3);
    clearField(d);
    d.setBig();
    d.deathBig = true;
    fill(d, ["#########.", "#########."]);
    d.sonicDrop();
    const cells = d.curPieceCells(), at = new Set(cells.map(p => p.row * WIDTH + p.col));
    const low = Math.max(...cells.map(p => p.row));
    for (let c = 0; c < WIDTH; c++) if (!at.has(low * WIDTH + c)) d.setCell(low, c, 2); // fills the piece's lowest row
    for (let c = 0; c < WIDTH - 1; c++) if (!at.has((low - 1) * WIDTH + c)) d.setCell(low - 1, c, 2); // the one above keeps a hole
    const garbage = Array(WIDTH).fill(tetGARBAGE).map((v, c) => c ? v : 0);
    d.receiveGarbage({ lines: 2, rows: [garbage, garbage] });
    d.itemEffects["X-RAY"] = 2;
    d.lock();
    const waited = d.pendingGarbage();
    for (let f = 0; f < 200 && d.phase !== "active"; f++) d.advanceFrame(0);
    const stack = [];
    for (let r = d.stackTop(); r < HEIGHT; r++) stack.push(rowOf(d, r).some(v => v));
    check("Big piece filling one row: the row collapses before the garbage rises (no gap left in the stack)",
        [cells.every(p => p.col < WIDTH - 1), waited, rowOf(d, HEIGHT - 3), rowOf(d, HEIGHT - 1), stack.every(Boolean), d.itemEffects["X-RAY"]],
        [true, 2, [1, 1, 1, 1, 1, 1, 1, 1, 1, 0], garbage, true, 1]);
}
{
    // Items (TAP, TGM3, ACE with the Items card)
    const [g] = versusPair(tgmTap, 5, 0, { items: true });
    const entered = () => { g.curPiece_type = 0; g.spawn(g.nextFromQueue(), false); };
    for (let k = 2; k < VS_ITEM_PIECES; k++) entered(); // pieces 2 to 19 (the first entered with the countdown)
    const before = g.nextItem;
    entered(); // the 20th: the gauge is full, the 21st carries an item
    const item = g.nextItem;
    entered();
    check("Versus items: the item gauge fills with 20 pieces and the 21st carries an item (tetris.wiki, Heboris)",
        [before, !!item, g.pieceItem === item, g.nextItem], [null, true, true, null]);
    check("  ...none without the card; TGM1 has them too, but not Mirror Block (which TAP added)",
        [versusPair(tgmTap)[0].itemsOn, versusPair(tgmOriginal, 5, 0, { items: true })[0].itemsOn, versusPair(tgmOriginal, 5, 0, { items: true })[0].itemSet.includes("MIRROR BLOCK")],
        [false, true, false]);
    const bag = versusPair(tgmTap, 5, 0, { items: true })[0], drawn = bag.itemSet.map(() => bag.drawItem());
    check("  ...from a bag with one of each, drawn without replacement", [new Set(drawn).size === bag.itemSet.length, bag.itemBag.length], [true, 0]);
    const counts = {}, total = bag.itemSet.reduce((sum, it) => sum + VS_ITEMS[it].weight, 0), near = (it, n) => Math.abs(n / 4000 - VS_ITEMS[it].weight / total) < 0.04;
    for (let k = 0; k < 4000; k++) { bag.itemBag = []; const it = bag.drawItem(); counts[it] = (counts[it] || 0) + 1; }
    check("  ...by TAP's weights (Laser and Up Del Field 250 of all the bag's, Nega Field 1)",
        [near("LASER", counts["LASER"]), near("↑ DEL FIELD", counts["↑ DEL FIELD"]), (counts["NEGA FIELD"] || 0) < 15], [true, true, true]);

    const [s] = versusPair(tgmTap, 5, 0, { items: true });
    clearField(s);
    s.setCell(10, 0, 1);
    fill(s, ["#########.", "#########."]);
    s.itemCells[12 - FIELD_TOP][3] = "LASER"; // another item block, not in the clear
    s.setCell(12, 3, 1);
    place(s, tetI, 1, 18, 7);
    s.pieceItem = "MIRROR BLOCK";
    s.advanceFrame(SOFT_PUSH);
    for (let f = 0; f < 100 && s.phase !== "active"; f++) s.advanceFrame(0);
    check("  ...a clear that sets an item off sends it instead of garbage, and the field's other item blocks become normal",
        [s.takeAttacks(), s.itemCells.flat().filter(Boolean)], [[{ lines: 0, item: "MIRROR BLOCK" }], []]);

    const [r] = versusPair(tgmTap, 5, 0, { items: true });
    clearField(r);
    fill(r, ["###......."]);
    r.receiveGarbage({ item: "MIRROR BLOCK", hole: 0 });
    const sniped = [rowText(r, 21), r.curPiece_type, r.phase, r.cutIn];
    for (let f = 0; f < 100 && r.phase !== "active"; f++) r.advanceFrame(0);
    place(r, tetO, 0, 19, 0); // columns 1-2 in ARS
    r.advanceFrame(SOFT_PUSH);
    const second = rowText(r, 21);
    check("  ...an attack item hits at once and knocks the piece in play out (a snipe); Mirror Block turns the field again after the next pieces",
        [sniped, second], [[".......###", 0, "are", VS_CUTIN_FRAMES], "###....##."]);

    const own = (item, rows) => {
        const [o] = versusPair(tgmTap, 5, 0, { items: true });
        clearField(o);
        fill(o, rows);
        o.useItem(item, true);
        return Array.from({ length: rows.length }, (_, k) => rowText(o, HEIGHT - rows.length + k));
    };
    check("  ...Up and Down Del Field delete the stack's upper or lower half",
        [own("↑ DEL FIELD", ["#.........", "##........", "###.......", "####......"]), own("↓ DEL FIELD", ["#.........", "##........", "###.......", "####......"])],
        [["..........", "..........", "###.......", "####......"], ["..........", "..........", "#.........", "##........"]]);
    check("  ...Nega Field turns the stack's blocks to holes; 180° Field swaps its top row with the bottom one, and so on (the guide)",
        [own("NEGA FIELD", ["#.........", "##.######."]), own("180° FIELD", ["#.........", "##.######."])],
        [[".#########", "..#......#"], ["##.######.", "#........."]]);
    check("  ...the Del Fields take half the stack's rows, rounded up", [own("↓ DEL FIELD", ["#.........", "##........", "###......."])],
        [["..........", "..........", "#........."]]);
    const shot = Array.from({ length: 30 }, () => own("SHOTGUN!", ["#.........", "##########"]));
    check("  ...Shotgun! picks any column in each row: on an empty cell it misses (the guide)",
        [shot.some(rows => rows[0] === "#........."), shot.every(rows => rows[1].split("#").length - 1 === 9)], [true, true]);
    check("  ...the Mov Fields push every row's blocks to a wall",
        [own("← MOV FIELD", ["#.#.#.....", ".......##."]), own("→ MOV FIELD", ["#.#.#.....", ".......##."])],
        [["###.......", "##........"], [".......###", "........##"]]);
    const [f] = versusPair(tgmTap, 5, 0, { items: true });
    clearField(f);
    fill(f, ["....######", "######....", "####.#####", "####.#####"]);
    f.useItem("FREE FALL");
    const sent = f.takeAttacks();
    check("  ...Free Fall's rows clear, and 2 or more of them go to the other side as garbage with one hole",
        [sent.map(a => [a.lines, a.rows.length, new Set(a.rows.map(r => r.indexOf(0))).size, a.rows[0].filter(v => !v).length])], [[[2, 2, 1, 1]]]);
}
{
    // Roll Roll: for 3 pieces, grey and turning counter-clockwise right after entering, then every 30 frames (the guide)
    const [a, d] = versusPair(tgmTap, 5, 0, { items: true });
    clearField(d);
    d.receiveGarbage({ item: "ROLL ROLL" });
    for (let f = 0; f < 200 && d.phase !== "active"; f++) d.advanceFrame(0);
    d.gravity = 0; // keep it in the air
    place(d, tetT, 0, 5, 3); // as it enters (activeTime 0): its first frame comes next
    d.activeTime = 1;
    const turns = [d.curPiece_rotation];
    for (let f = 0; f < 31; f++) { d.advanceFrame(0); if (f === 0 || f === 29 || f === 30) turns.push(d.curPiece_rotation); }
    const grey = d.getPieceColor();
    for (let k = 0; k < 3; k++) d.takeItems();
    check("Roll Roll: the other side's pieces turn counter-clockwise right after entering and every 30 frames, in grey, for 3 pieces",
        [turns, grey, a.attacking(), d.getPieceColor() === d.palette[d.curPiece_type]], [[0, 3, 3, 2], 8, false, true]);
}
{
    // an attack item's active time: the other side stands still for its cut-in; the attacker's gauge doesn't fill and its
    // own items wait until the attack is over (the guide); garbage sent during Mirror Block waits for its end, which a
    // perfect clear brings
    const [a, d] = versusPair(tgmTap, 5, 0, { items: true });
    clearField(d);
    fill(d, ["###......."]);
    d.receiveGarbage({ item: "LASER" });
    const counter = d.phaseCounter;
    for (let f = 0; f < VS_CUTIN_FRAMES - 1; f++) d.advanceFrame(0);
    const still = [d.phase, d.phaseCounter === counter, d.cutIn, a.attacking()];
    const gauge = a.itemGauge;
    a.curPiece_type = 0;
    a.spawn(a.nextFromQueue(), false);
    a.firingItems = ["DEL EVEN"];
    a.fireItems();
    const waiting = [a.itemGauge === gauge, a.waitingItems];
    check("Versus items: an attack holds the other side still for its cut-in; meanwhile the attacker's gauge doesn't fill and its own items wait",
        [still, waiting], [["are", true, 1, true], [true, ["DEL EVEN"]]]);
    d.advanceFrame(0);
    a.takeItems();
    check("  ...until the attack is over", [a.attacking(), a.waitingItems, a.actions.map(x => x.text)], [false, [], ["DEL EVEN"]]);
    const [m] = versusPair(tgmTap, 5, 0, { items: true });
    clearField(m);
    fill(m, ["###......."]);
    m.receiveGarbage({ item: "MIRROR BLOCK" });
    m.receiveGarbage({ lines: 2, rows: [rowOf(m, 21), rowOf(m, 21)] });
    const held = [m.incoming.length, m.pendingGarbage()];
    clearField(m);
    m.takeItems();
    check("  ...garbage sent during Mirror Block waits for its end, which a perfect clear brings at once", [held, m.mirrorPieces, m.incoming.length], [[0, 2], 0, 1]);
}
{
    // Color Block: the other side's stack shimmers through the piece colours for 3 pieces (Heboris)
    const [c] = versusPair(tgmTap, 5, 0, { items: true });
    clearField(c);
    fill(c, ["#######..."]);
    const plain = c.getCellColor(21, 0);
    c.receiveGarbage({ item: "COLOR BLOCK" });
    const colours = new Set(Array.from({ length: 28 }, (_, f) => { c.frames = f; return c.getCellColor(21, 0); }));
    for (let k = 0; k < 3; k++) c.takeItems();
    check("Color Block: the other side's stack cycles through the piece colours for its next 3 pieces, then shows its own again",
        [colours.size, c.getCellColor(21, 0) === plain, c.getCellColor(20, 0)], [7, true, 0]);
}
{
    // setting an item off turns the one in the preview normal too; a held item piece loses its item; an IHS piece
    // doesn't fill the gauge; TGM3's attack items go off with the clear
    const [p] = versusPair(tgmTap, 5, 0, { items: true });
    clearField(p);
    p.setCell(10, 0, 1);
    fill(p, ["#########."]);
    place(p, tetI, 1, 18, 7);
    p.pieceItem = "LASER";
    p.nextItem = "DEL EVEN";
    p.advanceFrame(SOFT_PUSH);
    const [h] = versusPair(arika, 5, 0, { items: true });
    h.pieceItem = "LASER";
    h.advanceFrame(HOLD_PUSH);
    const held = h.pieceItem;
    const [i] = versusPair(arika, 5, 0, { items: true });
    const gauge = i.itemGauge;
    i.held.hold = true;
    i.curPiece_type = 0;
    i.spawn(i.nextFromQueue(), false);
    const [t] = versusPair(arika, 5, 0, { items: true, style: "item" });
    clearField(t);
    t.setCell(10, 0, 1);
    fill(t, ["#########."]);
    place(t, tetI, 1, 18, 7);
    t.pieceItem = "LASER";
    t.advanceFrame(HARD_PUSH);
    check("  ...an item set off empties the preview's too; a held item piece loses it; IHS doesn't fill the gauge; TGM3's attack items go with the clear",
        [p.nextItem, held, i.itemGauge === gauge, t.phase, t.takeAttacks()], [null, null, true, "lineclear", [{ lines: 0, item: "LASER" }]]);
}
{
    // X-Ray: the other side's stack shows only where the beam sweeping across lights it, for 4 pieces (Heboris)
    const [x] = versusPair(tgmTap, 5, 0, { items: true });
    clearField(x);
    fill(x, ["#########."]);
    x.receiveGarbage({ item: "X-RAY" });
    const seen = f => { x.frames = f; return Array.from({ length: 9 }, (_, c) => x.getCellAlpha(21, c) > 0 ? "#" : ".").join(""); };
    const sweep = [seen(0), seen(8), seen(18), seen(35)];
    for (let k = 0; k < 4; k++) x.takeItems();
    check("X-Ray: the other side's stack lights up a column at a time from the left, then goes dark; back after 4 pieces",
        [sweep, seen(35)], [["#........", ".####....", "......###", "........."], "#########"]);
}
{
    // TGM3's styles
    const garbage = style => {
        const [a] = versusPair(arika, 7, 0, { style });
        clearField(a);
        a.setCell(10, 0, 1);
        fill(a, ["#####....#", "#########.", "#########.", "#########.", "#########."]);
        place(a, tetI, 1, 18, 7);
        a.advanceFrame(HARD_PUSH);
        const sent = a.takeAttacks().map(at => at.lines);
        for (let f = 0; f < 100 && a.phase !== "active"; f++) a.advanceFrame(0);
        return [sent, rowText(a, 21), a.itemInterval, a.getStats()[0][1]];
    };
    check("TGM3 versus styles: Attack sends 2 more rows for a Tetris, items every 40; Defence one row less and deletes 3 from its bottom, items every 20; Item every 10",
        [garbage("attack"), garbage("defence"), garbage("item")],
        [[[6], "#####....#", 40, "WORLD VS ATTACK"], [[3], "..........", 20, "WORLD VS DEFENCE"], [[4], "#####....#", 10, "WORLD VS ITEM"]]);
}

{
    // Dark Block: the other side's stack blinks, then vanishes for the rest of 8 seconds (Heboris)
    const [d] = versusPair(tgmTap, 5, 0, { items: true });
    clearField(d);
    fill(d, ["#########."]);
    d.receiveGarbage({ item: "DARK BLOCK" });
    const shown = [];
    for (let f = 0; f < VS_CUTIN_FRAMES + 480; f++) {
        d.advanceFrame(0);
        if (f === VS_CUTIN_FRAMES + 1 || f === VS_CUTIN_FRAMES + 2 || f === VS_CUTIN_FRAMES + 100) shown.push(d.getCellAlpha(21, 0));
    }
    check("Dark Block: the other side's stack blinks for a second, then is hidden until 8 seconds are up",
        [shown, d.getCellAlpha(21, 0)], [[1, 0, 0], 1]);
}
console.log(failures ? `\n${failures} FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
