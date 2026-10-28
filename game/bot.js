// A computer player. It plays any rule set through the same input bitmap a human produces and sees
// only what a human sees: the field, the current piece, the visible next pieces and the hold.
// Nothing here touches the rules; it has no DOM or engine dependencies (the engine only calls
// Bot.input() once per game frame, test/bot.test.js drives it headless).
//
//  - Probe + explorer: finds every place the piece can reach with the keys the bot presses, using
//    the game's own rotate() and shift() on a throwaway object that inherits from the game (so
//    SRS, Arika SRS, ARS and NRS kicks are never re-implemented), with a gravity model: after each
//    action the piece falls as far as gravity takes it in the frames the action costs, so at 20G it
//    only slides along the stack surface, and at low gravity it hovers.
//  - Brain: Thiery and Scherrer's evaluator (landing height, eroded cells, transitions, holes, wells,
//    ...) over bit-row boards, with a beam search over the visible next pieces and the hold; in
//    versus it also reckons with the garbage waiting to rise. Where Tetrises pay it keeps
//    a well open; in the Guideline the upper levels play as players do there: T-spins (the explorer
//    finds the turns into a slot, the evaluator credits slots it builds), back-to-backs, combos.
//  - Hands: turns the chosen route into one input bitmap per frame, closed loop (the route is found
//    again from where the piece actually is after every action), with a level's reaction time, key
//    interval, DAS use, mistakes and noise; the upper levels also choose during the entry delay how
//    the next piece should enter and hold that rotation key through it (IRS), and hold Hold when the
//    piece it brings in plays better (IHS), and a direction when that piece goes to a wall (DAS charged
//    in ARE).
//
// Left out: building for T-spin triples and minis (tried, see AGENTS.md: no gain), finesse.

const BOT_ROWS = HEIGHT - FIELD_TOP;
// Bit-row boards are as wide as the game's well (botSetWidth(), at each input: TAP Doubles' is 14)
let BOT_W = WIDTH;
let BOT_FULL = (1 << WIDTH) - 1;

// One level of proficiency: reaction (frames after a piece appears before the first input),
// interval (frames per action), das (long moves by DAS), hard (share of pieces it hard or sonic
// drops; the rest are soft dropped), depth and beam (lookahead over the visible next pieces), hold
// (what using the hold costs in evaluation points; Infinity: never), noise (σ of each evaluation
// weight, per game), temp (softmax temperature over the best placements), misdrop (chance of
// aiming one column or rotation off), irs (turns a piece as it enters by holding the key through
// ARE), tucks (waits and soft-drops to slide under overhangs), spins (plays the Guideline for
// T-spins, back-to-backs and combos: the "attack" weights). Levels 0-10, the index.
const BOT_LEVELS = [
    { irs: false, reaction: 30, interval: 8, das: false, hard: 0.3, depth: 0, beam: 1, hold: Infinity, noise: 0.35, temp: 1, misdrop: 0.06, tucks: false, spins: false },
    { irs: false, reaction: 25, interval: 7, das: false, hard: 0.45, depth: 0, beam: 1, hold: Infinity, noise: 0.3, temp: 0.8, misdrop: 0.05, tucks: false, spins: false },
    { irs: false, reaction: 20, interval: 6, das: false, hard: 0.55, depth: 0, beam: 1, hold: 24, noise: 0.25, temp: 0.65, misdrop: 0.04, tucks: false, spins: false },
    { irs: false, reaction: 15, interval: 5, das: false, hard: 0.7, depth: 0, beam: 1, hold: 12, noise: 0.2, temp: 0.5, misdrop: 0.03, tucks: false, spins: false },
    { irs: false, reaction: 12, interval: 4, das: true, hard: 0.85, depth: 0, beam: 1, hold: 6, noise: 0.16, temp: 0.35, misdrop: 0.02, tucks: true, spins: false },
    { irs: false, reaction: 10, interval: 4, das: true, hard: 1, depth: 1, beam: 2, hold: 3, noise: 0.13, temp: 0.27, misdrop: 0.015, tucks: true, spins: true },
    { irs: false, reaction: 8, interval: 3, das: true, hard: 1, depth: 1, beam: 4, hold: 0, noise: 0.1, temp: 0.2, misdrop: 0.01, tucks: true, spins: true },
    { irs: true, reaction: 5, interval: 2, das: true, hard: 1, depth: 1, beam: 6, hold: 0, noise: 0.06, temp: 0.1, misdrop: 0.005, tucks: true, spins: true },
    { irs: true, reaction: 3, interval: 2, das: true, hard: 1, depth: 2, beam: 8, hold: 0, noise: 0.03, temp: 0.03, misdrop: 0.002, tucks: true, spins: true },
    { irs: true, reaction: 1, interval: 1, das: true, hard: 1, depth: 2, beam: 12, hold: 0, noise: 0.015, temp: 0.01, misdrop: 0.001, tucks: true, spins: true },
    { irs: true, reaction: 0, interval: 1, das: true, hard: 1, depth: 3, beam: 16, hold: 0, noise: 0, temp: 0, misdrop: 0, tucks: true, spins: true },
];

// Evaluation weights (Thiery and Scherrer's BCTS set); clear: bonus per lines cleared at a low stack.
// "survival" takes every clear. "tetris" keeps the right column open (edgeWell) and pays for
// Tetrises, and for rows ready for one (`ready`, by rows full but for the well, up to 4).
// "attack" and "versus" (the Guideline's scoring modes and versus, levels with `spins`) value a clear
// as the mode does (botClearValue: its score, or the lines it sends) times `attack`, add `spin` for
// a T-spin by its lines and `b2bBreak` for a clear that ends a back-to-back chain, don't charge
// `clear` for difficult clears and combos (`waive`), credit a T-spin double slot by the lines a T
// would clear in it (`tslot`, botTslot()) and look for T-spins (`spin`). Measured with Marathon's
// score and with versus matches against "tetris": "attack" stacks higher for more Tetrises and
// T-spin doubles; that loses in versus, where garbage has to be dug out with singles.
const BOT_BCTS = { landing: -12.63, eroded: 6.6, rowTrans: -9.22, colTrans: -19.77, holes: -13.08, wells: -10.49, holeDepth: -1.61, holeRows: -24.04 };
const BOT_WEIGHTS = {
    survival: { ...BOT_BCTS, clear: [0, 0, 0, 0, 0], edgeWell: false },
    tetris: { ...BOT_BCTS, clear: [0, -25, -20, -12, 45], edgeWell: true, ready: [0, 12, 30, 55, 90] },
    attack: { ...BOT_BCTS, landing: -4, eroded: 2, clear: [0, -50, -30, -15, 0], edgeWell: true, ready: [0, 20, 45, 80, 130],
        attack: 12, spin: [0, 20, 80, 100], b2bBreak: -60, tslot: [0, 40, 110], waive: true },
    // versus: garbage has to be dug out with singles, and a tall stack loses
    versus: { ...BOT_BCTS, clear: [0, -25, -20, -12, 0], edgeWell: true, ready: [0, 12, 30, 55, 90],
        attack: 12, spin: [0, 20, 80, 100], b2bBreak: 0, tslot: [0, 25, 70], waive: true },
};
const BOT_TETRIS_MAX_STACK = 12; // rows: above this every clear is welcome
const BOT_DANGER = -1e6;         // the next piece could not enter

const BOT_TMAX = 240;            // frames the explorer looks ahead
const BOT_MAXN = 9000;           // explorer nodes
const BOT_COLS = 32, BOT_COL_OFF = 8; // explorer columns, -8 to 23
const BOT_DAS_MIN = 4;           // moves in a row that are worth a held key
const BOT_ITEM_LEVEL = 3;        // levels from which the bot values versus items
const BOT_SNIPE_LEVEL = 7, BOT_SNIPE_WAIT = 90; // and times its attack items (frames it waits at most)

// actions
const BOT_CW = 0, BOT_CCW = 1, BOT_R180 = 2, BOT_LEFT = 3, BOT_RIGHT = 4, BOT_DOWN = 5, BOT_WAIT = 6;

// [key, push bit, release bit]
const BOT_KEYS = [
    ["left", LEFT_PUSH, LEFT_RELEASE], ["right", RIGHT_PUSH, RIGHT_RELEASE], ["soft", SOFT_PUSH, SOFT_RELEASE],
    ["rotl", ROTL_PUSH, ROTL_RELEASE], ["rotr", ROTR_PUSH, ROTR_RELEASE], ["rot180", ROT180_PUSH, ROT180_RELEASE],
    ["hold", HOLD_PUSH, HOLD_RELEASE],
];

function botRng(seed) { // mulberry32; never Math.random, which drives the 7-bag
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), a | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function botPop(x) {
    x = x - ((x >> 1) & 0x55555555);
    x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
    return (((x + (x >> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
}

// How the piece is finished: "hard" (up drops and locks), "sonic" (up drops, soft drop locks on
// the ground) or "soft" (soft drop only: TGM1, NES, GB)
function botLockStyle(game) {
    if (game.nes || game.gb || game.gamemode === tgmOriginal) return "soft";
    if (game.ars2 || (game.tgm && game.ars)) return "sonic";
    return "hard";
}

// Evaluation set for the game's mode (measured with tools/bot-bench.js): stacking for Tetrises pays
// where the score or grade counts lines (Guideline marathons and Ultra, TGM1, TGM3 Master, NES, GB);
// the modes about time or survival (Sprint, Dig, ACE, TAP, Easy, Shirase) take every clear. Levels
// with `spins` play the Guideline's scoring modes and versus for attack, as players do
function botProfile(game, hands) {
    if (game.nes || game.gb || game.gamemode === tgmOriginal) return "tetris";
    if (game.gamemode === guideline) {
        if (/^(sprint|dig)/.test(game.variant)) return "survival";
        if (!hands.spins || game.variant === "master" || game.big) return "tetris";
        return game.versus ? "versus" : "attack";
    }
    // versus too (TGM1, TAP, TGM3, ACE, GB): a Tetris sends the most garbage, and in TGM3 is worth six
    // levels in the race to 200
    if (game.versus || ((game.gamemode === arika || game.gamemode === tgmClassic) && game.variant === "standard")) return "tetris";
    return "survival";
}

// ----------------------------------------------------------
// Boards: one integer per row (bit c set = filled), rows FIELD_TOP..HEIGHT-1 from index 0

function botBoardFrom(game, rows) {
    for (let i = 0; i < BOT_ROWS; i++) {
        const line = game.field[i];
        let m = 0;
        for (let c = 0; c < BOT_W; c++) if (line[c] !== 0) m |= 1 << c;
        rows[i] = m;
    }
}

// Some empty cell has a block above it: only then can a piece slide under something (a tuck)
function botHasOverhang(rows) {
    let covered = 0;
    for (let i = 0; i < BOT_ROWS; i++) {
        if (~rows[i] & covered & BOT_FULL) return true;
        covered |= rows[i];
    }
    return false;
}

// Per type: its distinct rotations (cells as the game uses them, big pieces doubled)
let botShapeCache = { cells: null, table: null };
function botShapes(game) {
    if (botShapeCache.cells === game.curCells) return botShapeCache.table;
    const table = [null];
    for (let type = 1; type <= 7; type++) {
        const rots = [], seen = new Set();
        for (let rot = 0; rot < 4; rot++) {
            const list = game.curCells[type][rot];
            const minI = Math.min(...list.map(a => a[0])), minJ = Math.min(...list.map(a => a[1]));
            const key = list.map(([i, j]) => (i - minI) * 16 + (j - minJ)).sort((a, b) => a - b).join();
            if (seen.has(key)) continue;
            seen.add(key);
            rots.push({ rot, cells: list, minJ, maxJ: Math.max(...list.map(a => a[1])) });
        }
        table.push(rots);
    }
    table.spawn = [null]; // [row, col] each type enters at
    for (let type = 1; type <= 7; type++) table.spawn.push(game.big ? game.bigSpawnPosition(type) : game.spawnPosition(type));
    botShapeCache = { cells: game.curCells, table };
    return table;
}

function botFits(game, rows, cells, row, col) {
    for (let k = 0; k < cells.length; k++) {
        const r = row + cells[k][0], c = col + cells[k][1];
        if (c < 0 || c >= BOT_W || r >= HEIGHT || r < game.pieceTop || (rows[r - FIELD_TOP] >> c & 1)) return false;
    }
    return true;
}

// The piece locks at (row, col) on src; the result, with full rows removed, goes to dst. Returns
// the rows cleared, or -1 when a block would lie above the field. botLocked: what the lock did.
// above: every block above the visible field (a lock out where the rule set has one)
const botLocked = { eroded: 0, landing: 0, above: false };
function botLock(src, dst, cells, row, col) {
    dst.set(src);
    let landing = 0, lowest = FIELD_TOP;
    for (let k = 0; k < cells.length; k++) {
        const r = row + cells[k][0];
        if (r < FIELD_TOP) return -1;
        dst[r - FIELD_TOP] |= 1 << (col + cells[k][1]);
        landing += HEIGHT - r;
        if (r > lowest) lowest = r;
    }
    botLocked.above = lowest < VISIBLE_TOP;
    let inCleared = 0;
    for (let k = 0; k < cells.length; k++) if (dst[row + cells[k][0] - FIELD_TOP] === BOT_FULL) inCleared++;
    let w = BOT_ROWS - 1, cleared = 0;
    for (let r = BOT_ROWS - 1; r >= 0; r--) {
        if (dst[r] === BOT_FULL) cleared++;
        else dst[w--] = dst[r];
    }
    while (w >= 0) dst[w--] = 0;
    botLocked.eroded = cleared * inCleared;
    botLocked.landing = landing / cells.length;
    return cleared;
}

// Versus garbage the bot is told is waiting (the meter beside the well) rises when it locks a
// piece (without clearing, in the Guideline). Where its holes will be isn't shown, so the bot counts the rows as solid
// ones that never clear: a bit beside the well (BOT_GARBAGE_BIT) keeps them from ever being full.
let BOT_GARBAGE_BIT = 1 << WIDTH;

// Rows of garbage rise under the board; returns false when blocks are pushed above the highest row
// a block may be in (lost there, where that doesn't top out)
function botRise(game, rows, n) {
    const top = Math.max(game.pieceTop, game.bufferTop ?? FIELD_TOP) - FIELD_TOP; // as the game's riseGarbage()
    let fits = true;
    for (let i = 0; i < n && top + i < BOT_ROWS; i++) if (rows[top + i]) fits = false;
    rows.copyWithin(0, n);
    rows.fill(BOT_FULL | BOT_GARBAGE_BIT, BOT_ROWS - n);
    if (!fits && !game.garbageTopsOut) rows.fill(0, 0, top);
    return fits;
}

// Guideline versus: a clear's attack cancels the garbage waiting (the others' never does)
function botCancels(game) {
    return game.versus && game.gamemode === guideline;
}

// The garbage waiting rises after this lock: one that clears nothing, or any (TGM, GB); it ends the
// game where blocks pushed out of the top top a side out (the Guideline: botRise), else they are lost
function botRiseDead(game, rows, pending, cleared) {
    if (!pending || (cleared && !game.garbageEveryLock)) return false;
    return !botRise(game, rows, pending) && game.garbageTopsOut;
}

// Garbage still waiting after a lock that cleared `cleared` rows: the lines the clear sends cancel
// it (botClear.attack, from the botStepScore() just made; none outside the Guideline), a lock
// without one lets it all rise
function botPendingAfter(game, pending, cleared) {
    if (!pending || !cleared || game.garbageEveryLock) return 0;
    return Math.max(0, pending - botClear.attack);
}

// Versus items (the TGM games with the Items card): the item a placement sets off, the highest item
// block in the rows it fills (the rightmost of a row; the piece's own blocks carry its item), as the
// game's collectItems(); null when none. Item blocks are marked on screen, so a player sees them too.
function botItemCleared(game, rows, cells, row, col) {
    if (!game.itemCells) return null;
    const full = new Map(); // row -> its mask with the piece in it
    for (const [i, j] of cells) {
        const r = row + i;
        if (r < FIELD_TOP) return null;
        full.set(r, (full.get(r) ?? rows[r - FIELD_TOP]) | 1 << (col + j));
    }
    for (const r of [...full.keys()].sort((a, b) => a - b)) {
        if ((full.get(r) & BOT_FULL) !== BOT_FULL) continue;
        for (let c = BOT_W - 1; c >= 0; c--) {
            const mine = cells.some(([i, j]) => row + i === r && col + j === c);
            const item = mine ? game.pieceItem : game.getCellItem(r, c);
            if (item) return item;
        }
    }
    return null;
}

// What setting an item off is worth: an attack on the other side always (BOT_ITEM_ATTACK); a Del Field,
// Del Even or Free Fall more the higher the stack is; Exchg Field when the other side's stack is lower
const BOT_ITEM_ATTACK = 60;
function botItemValue(game, item, rows) {
    if (!item) return 0;
    if (VS_ITEMS[item].attack) return BOT_ITEM_ATTACK;
    const height = b => { let top = 0; while (top < BOT_ROWS && !b[top]) top++; return BOT_ROWS - top; };
    switch (item) {
        case "↑ DEL FIELD": case "↓ DEL FIELD": case "DEL EVEN": case "FREE FALL": return 4 * height(rows);
        case "EXCHG FIELD": {
            if (!game.rival) return 0;
            const other = new Int32Array(BOT_ROWS);
            botBoardFrom(game.rival, other);
            return 8 * (height(rows) - height(other));
        }
    }
    return 0;
}

// TGM3 Sakura: the jewels a placement clears (in the rows it fills), worth BOT_JEWEL each
const BOT_JEWEL = 40;
function botJewelsCleared(game, rows, cells, row, col) {
    const full = new Map();
    for (const [i, j] of cells) {
        const r = row + i;
        if (r < FIELD_TOP) return 0;
        full.set(r, (full.get(r) ?? rows[r - FIELD_TOP]) | 1 << (col + j));
    }
    let n = 0;
    for (const [r, mask] of full) {
        if ((mask & BOT_FULL) !== BOT_FULL) continue;
        for (let c = 0; c < BOT_W; c++) if (game.getCellItem(r, c) === "JEWEL") n++;
    }
    return n;
}

// The lock just made ends the game: a lock out, or the next piece can't enter
function botDead(game, rows, next) {
    return (game.lockOut && botLocked.above) || botBlocked(game, rows, next);
}

// The next piece can't enter on this board
function botBlocked(game, rows, type) {
    const [r, c] = botShapes(game).spawn[type];
    const cells = game.curCells[type][0];
    for (let k = 0; k < cells.length; k++) {
        const rr = r + cells[k][0];
        if (rr >= FIELD_TOP && rr < HEIGHT && (rows[rr - FIELD_TOP] >> (c + cells[k][1]) & 1)) return true;
    }
    return false;
}

let botHeight = new Int32Array(WIDTH), botCount = new Int32Array(WIDTH);

// The boards' width: the game's
function botSetWidth(width) {
    if (width === BOT_W) return;
    BOT_W = width;
    BOT_FULL = (1 << width) - 1;
    BOT_GARBAGE_BIT = 1 << width;
    botHeight = new Int32Array(width);
    botCount = new Int32Array(width);
}

// How good a board is (not counting the move that led to it); with `tslot` weights, a T-spin double
// slot counts as filled by the T it waits for, plus the slot's credit
const botSlotBoard = new Int32Array(BOT_ROWS);
function botBoardScore(rows, w) {
    const s = botShapeScore(rows, w);
    if (!w.tslot) return s;
    const lines = botTslot(rows, botSlotBoard);
    return lines < 0 ? s : Math.max(s, botShapeScore(botSlotBoard, w) + w.tslot[lines]);
}

// A T-spin double slot, as players build them: a T pointing down fits with its stem in a gap
// between two blocks (the bottom corners), one arm under an overhang (the third corner) and nothing
// above the other arm or the stem, so a T dropped beside the overhang turns into it. The lowest of
// those clearing the most lines: the board with the T in it and full rows gone goes to out; returns
// the lines it clears, or -1 when there is no slot
function botTslot(rows, out) {
    let top = 0;
    while (top < BOT_ROWS && rows[top] === 0) top++;
    let best = -1, bestY = 0, bestC = 0;
    for (let y = Math.max(top + 1, 2); y < BOT_ROWS; y++) {
        const below = rows[y] & BOT_FULL, mid = rows[y - 1] & BOT_FULL, over = rows[y - 2] & BOT_FULL;
        for (let c = 1; c < BOT_W - 1; c++) {
            const L = 1 << (c - 1), C = 1 << c, R = 1 << (c + 1);
            if ((below & (L | C | R)) !== (L | R) || (mid & (L | C | R)) || (over & C)) continue;
            const ol = over & L, or = over & R;
            if (!ol === !or) continue; // the third corner: one overhang
            const open = C | (ol ? R : L); // the stem's column and the open arm's: clear above
            let clear = true;
            for (let r = y - 2; r >= top && clear; r--) if (rows[r] & open) clear = false;
            if (!clear) continue;
            const lines = ((below | C) === BOT_FULL ? 1 : 0) + ((mid | L | C | R) === BOT_FULL ? 1 : 0);
            if (lines >= best) { best = lines; bestY = y; bestC = c; }
        }
    }
    if (best < 0) return -1;
    out.set(rows);
    out[bestY] |= 1 << bestC;
    out[bestY - 1] |= 7 << (bestC - 1);
    let w = BOT_ROWS - 1;
    for (let r = BOT_ROWS - 1; r >= 0; r--) if (out[r] !== BOT_FULL) out[w--] = out[r];
    while (w >= 0) out[w--] = 0;
    return best;
}

// The board's shape: BCTS's features. edgeWell: while the stack is low, the right column left open
// for a Tetris is no row transition (else every row stacked beside it costs, and the bot fills it
// with singles)
function botShapeScore(rows, w) {
    let top = 0;
    while (top < BOT_ROWS && rows[top] === 0) top++;
    if (top === BOT_ROWS) return 0;
    botHeight.fill(0);
    botCount.fill(0);
    const well = w.edgeWell && !w.fast && BOT_ROWS - top <= BOT_TETRIS_MAX_STACK ? 1 << (BOT_W - 1) : 0;
    let rowTrans = 0, colTrans = 0, holes = 0, holeDepth = 0, holeRows = 0, covered = 0, prev = 0;
    for (let r = top; r < BOT_ROWS; r++) {
        const bits = rows[r] & BOT_FULL; // without the garbage marker
        const ext = 0x801 | ((bits | (well & ~covered)) << 1); // the walls count as filled
        rowTrans += botPop((ext ^ (ext >> 1)) & 0x7FF);
        colTrans += botPop(bits ^ prev);
        prev = bits;
        let holeBits = ~bits & covered & BOT_FULL;
        if (holeBits) {
            holes += botPop(holeBits);
            holeRows++;
            for (let c = 0; holeBits; c++, holeBits >>= 1) if (holeBits & 1) holeDepth += botCount[c];
        }
        for (let b = bits; b; b &= b - 1) botCount[31 - Math.clz32(b & -b)]++; // each set bit
        for (let b = bits & ~covered; b; b &= b - 1) botHeight[31 - Math.clz32(b & -b)] = BOT_ROWS - r;
        covered |= bits;
    }
    colTrans += botPop(BOT_FULL ^ prev); // the floor
    let wells = 0;
    for (let c = 0; c < BOT_W; c++) {
        if (w.edgeWell && c === BOT_W - 1) continue;
        const left = c > 0 ? botHeight[c - 1] : 99, right = c < BOT_W - 1 ? botHeight[c + 1] : 99;
        const d = Math.min(left, right) - botHeight[c];
        if (d > 0) wells += d * (d + 1) / 2;
    }
    // Tetris-ready: rows full but for the open well, from its bottom up (the I that clears them is
    // seldom in view yet)
    let ready = 0;
    if (well) {
        let r = top;
        while (r < BOT_ROWS && !(rows[r] & well)) r++;
        for (r--; r >= top && (rows[r] & BOT_FULL) === (BOT_FULL ^ well); r--) ready++;
    }
    return w.rowTrans * rowTrans + w.colTrans * colTrans + w.holes * holes + w.wells * wells
        + w.holeDepth * holeDepth + w.holeRows * holeRows + (w.ready ? w.ready[Math.min(ready, 4)] : 0);
}

// What a clear is worth in the Guideline: the lines it sends in versus, else its score at level 1
// in units of 200 (a Tetris 4, a T-spin double 6). b2b: with the back-to-back bonus; combo: 0 for the
// first clear; pc: it empties the field
const BOT_SCORE_BASE = [0, 100, 300, 500, 800], BOT_SPIN_BASE = [400, 800, 1200, 1600], BOT_MINI_BASE = [100, 200, 400];
const BOT_PC_BASE = [0, 800, 1200, 1800, 2000];
function botClearValue(game, n, tspin, b2b, combo, pc) {
    if (botCancels(game)) return versusAttack({ n, tspin, b2b, combo, pc });
    const base = (tspin === "full" ? BOT_SPIN_BASE : tspin === "mini" ? BOT_MINI_BASE : BOT_SCORE_BASE)[n] || 0;
    const bonus = pc ? (n === 4 && b2b ? 3200 : BOT_PC_BASE[n]) : 0;
    return (base * (b2b ? 1.5 : 1) + 50 * combo + bonus) / 200;
}

// What the move itself earned: landing height, eroded cells, a bonus for the lines it cleared (big
// pieces: two rows make a line). b2b and combo: the Guideline's chains before it (the game's b2b and
// combo); tspin: "full", "mini" or null. botClear gets the chains after it and, in versus, the lines
// it sends.
const botClear = { b2b: false, combo: -1, attack: 0 };
function botStepScore(game, rows, w, cleared, b2b = false, combo = -1, tspin = null) {
    let s = w.landing * botLocked.landing + w.eroded * botLocked.eroded;
    const lines = game.big ? cleared >> 1 : cleared;
    botClear.b2b = b2b;
    botClear.combo = -1;
    botClear.attack = 0;
    if (lines > 0) {
        let top = 0;
        while (top < BOT_ROWS && rows[top] === 0) top++;
        const difficult = lines === 4 || tspin !== null;
        botClear.b2b = difficult;
        botClear.combo = combo + 1;
        if (botCancels(game) || w.attack) {
            const value = botClearValue(game, Math.min(lines, 4), tspin, b2b && difficult, combo + 1, top === BOT_ROWS);
            if (botCancels(game)) botClear.attack = value;
            if (w.attack) {
                s += w.attack * value;
                if (tspin === "full") s += w.spin[Math.min(lines, 3)];
                if (b2b && !difficult) s += w.b2bBreak;
            }
        }
        // a difficult clear or one that keeps a combo going is worth it at any height
        if (BOT_ROWS - top <= BOT_TETRIS_MAX_STACK && !(w.waive && (difficult || combo >= 0))) s += w.clear[Math.min(lines, 4)];
    }
    return s;
}

// Every place a piece comes to rest when dropped straight down from its spawn row in each column,
// without regard to how it gets there (used for the pieces beyond the current one)
function botDrops(game, rows, type, shapes, fn) {
    const spawn = shapes.spawn[type];
    const step = game.big ? game.bigMove : 1; // big pieces move two columns: only the spawn column's parity
    for (const shape of shapes[type]) {
        let first = spawn[1];
        while (first - step >= -shape.minJ) first -= step;
        for (let col = first; col + shape.maxJ < BOT_W; col += step) {
            let row = spawn[0];
            if (!botFits(game, rows, shape.cells, row, col)) continue;
            while (botFits(game, rows, shape.cells, row + 1, col)) row++;
            fn(shape, col, row);
        }
    }
}

// ----------------------------------------------------------
// The explorer: every pose the piece can reach, in order of the frames the keys take

class BotExplorer {
    constructor() {
        const n = BOT_MAXN, poses = BOT_ROWS * BOT_COLS * 4;
        this.row = new Int16Array(n); this.col = new Int16Array(n); this.rot = new Int8Array(n);
        this.acc = new Float32Array(n); this.ga = new Int16Array(n); this.time = new Int16Array(n);
        // ARS floor kicks so far (I, T) and flags (1: floor kicked, 2: lock delay zeroed), per node
        this.ik = new Int8Array(n); this.tk = new Int8Array(n); this.fk = new Int8Array(n);
        // the last move was a rotation (T-spins): 0 no, else the kick it took + 2 (1: a 180° turn)
        this.sp = new Int8Array(n);
        this.parent = new Int32Array(n); this.act = new Int8Array(n); this.key = new Int32Array(n); this.next = new Int32Array(n);
        this.best = new Int16Array(poses * 2); // by pose and whether the last move was a rotation
        this.cand = new Int32Array(poses); // landing pose key -> the first node that lands there
        this.spinCand = new Int32Array(poses); // resting pose key -> the first node that turned into it
        this.head = new Int32Array(BOT_TMAX + 1);
        this.cands = [];
        this.spinCands = [];
        this.n = 0;
    }

    poseKey(row, col, rot) {
        const c = col + BOT_COL_OFF;
        if (row < FIELD_TOP || row >= HEIGHT || c < 0 || c >= BOT_COLS) return -1;
        return ((row - FIELD_TOP) * BOT_COLS + c) * 4 + rot;
    }

    add(row, col, rot, acc, ga, time, parent, act, ik, tk, fk, sp) {
        const pose = this.poseKey(row, col, rot);
        if (pose < 0) return;
        const key = pose * 2 + (sp ? 1 : 0);
        if (time > BOT_TMAX || this.n >= BOT_MAXN || time >= this.best[key]) return;
        const id = this.n++;
        this.best[key] = time;
        this.row[id] = row; this.col[id] = col; this.rot[id] = rot; this.acc[id] = acc; this.ga[id] = ga;
        this.ik[id] = ik; this.tk[id] = tk; this.fk[id] = fk; this.sp[id] = sp;
        this.time[id] = time; this.parent[id] = parent; this.act[id] = act; this.key[id] = key;
        this.next[id] = this.head[time];
        this.head[time] = id;
    }

    // o: game, probe, type, row, col, rot, acc (gravity owed), ga and gaMax (grounded actions made
    // and allowed before the piece locks), interval, softCost, rot180, down, wait, spins (track the
    // last rotation: a T in the Guideline), sp (the start's), goal. Without a goal, fills `cands`
    // (landing pose keys, first-found node in `cand`) and with spins `spinCands` (resting poses the
    // piece turned into, in `spinCand`); with one, returns the node that stands where its drop lands
    // on goal.land (goal.spin: that rests there after a rotation), or -1.
    run(o) {
        const g = o.game, p = o.probe, type = o.type, goal = o.goal;
        p.curPiece_type = type;
        this.best.fill(32767);
        this.head.fill(-1);
        this.cand.fill(-1);
        this.cands.length = 0;
        if (o.spins) { this.spinCand.fill(-1); this.spinCands.length = 0; }
        this.n = 0;
        const gravity = g.gravity;
        this.add(o.row, o.col, o.rot, o.acc, o.ga, 0, -1, -1, g.iFloorKicks | 0, g.tFloorKicks | 0,
            (g.floorKicked ? 1 : 0) | (g.lockDelayZeroed ? 2 : 0), o.spins ? o.sp : 0);
        for (let t = 0; t <= BOT_TMAX; t++) {
            for (let id = this.head[t]; id !== -1; id = this.next[id]) {
                if (this.time[id] !== this.best[this.key[id]]) continue; // reached sooner another way
                const r = this.row[id], c = this.col[id], rt = this.rot[id], sp = this.sp[id];
                let land = r;
                while (g.movePossible(land + 1, c, rt, type)) land++;
                const grounded = land === r;
                const lk = this.poseKey(land, c, rt);
                if (lk >= 0 && this.cand[lk] === -1) { this.cand[lk] = id; this.cands.push(lk); }
                if (sp && grounded && this.spinCand[lk] === -1) { this.spinCand[lk] = id; this.spinCands.push(lk); }
                if (goal && c === goal.col && rt === goal.rot && land === goal.land && (!goal.spin || (sp && grounded))) return id;
                // grounded: each action uses up a lock reset (or lock delay); TGM3: after a floor
                // kick and another turn the lock delay is zero, so it locks where it rests
                if (grounded && (this.ga[id] >= o.gaMax || this.fk[id] & 2)) continue;
                const ga = this.ga[id] + (grounded ? 1 : 0);
                for (let a = 0; a <= BOT_WAIT; a++) {
                    if (a === BOT_R180 && !o.rot180) continue;
                    if (a === BOT_DOWN && !o.down) continue;
                    if (a === BOT_WAIT && !o.wait) continue;
                    p.curPiece_row = r; p.curPiece_col = c; p.curPiece_rotation = rt;
                    p.iFloorKicks = this.ik[id]; p.tFloorKicks = this.tk[id];
                    p.floorKicked = (this.fk[id] & 1) !== 0; p.lockDelayZeroed = (this.fk[id] & 2) !== 0;
                    let cost = o.interval, ok = false, acc = this.acc[id];
                    switch (a) {
                        case BOT_CW: ok = p.rotate(1); break;
                        case BOT_CCW: ok = p.rotate(-1); break;
                        case BOT_R180: ok = p.rotate(2); break;
                        case BOT_LEFT: ok = p.shift(-1, false); break;
                        case BOT_RIGHT: ok = p.shift(1, false); break;
                        case BOT_DOWN:
                            ok = g.movePossible(r + 1, c, rt, type);
                            if (ok) { p.curPiece_row = r + 1; cost = o.softCost; }
                            break;
                        case BOT_WAIT: // until gravity takes the piece one row
                            ok = gravity > 0 && gravity < 1 && g.movePossible(r + 1, c, rt, type);
                            if (ok) { p.curPiece_row = r + 1; cost = Math.max(1, Math.ceil((1 - acc) / gravity)); acc = 0; }
                            break;
                    }
                    if (!ok) continue;
                    let nr = p.curPiece_row;
                    const nc = p.curPiece_col, nrot = p.curPiece_rotation;
                    if (a !== BOT_DOWN && a !== BOT_WAIT) { // the piece falls while the key is pressed
                        acc += gravity * cost;
                        while (acc >= 1 && g.movePossible(nr + 1, nc, nrot, type)) { nr++; acc--; }
                        if (acc >= 1) acc = 0;
                    }
                    // a rotation is the last move until the piece moves or falls
                    const nsp = o.spins && a <= BOT_R180 && nr === p.curPiece_row ? p.lastKick + 2 : 0;
                    // a fall restarts the lock delay and the resets (step reset; move reset at a new lowest row)
                    this.add(nr, nc, nrot, acc, nr > r ? 0 : ga, t + cost, id, a, p.iFloorKicks | 0, p.tFloorKicks | 0,
                        (p.floorKicked ? 1 : 0) | (p.lockDelayZeroed ? 2 : 0), nsp);
                }
            }
        }
        return -1;
    }

    // The actions from the start to node id: [{ act, row, col, rot, cost }]
    path(id) {
        const out = [];
        for (; this.parent[id] !== -1; id = this.parent[id]) {
            out.push({ act: this.act[id], row: this.row[id], col: this.col[id], rot: this.rot[id], cost: this.time[id] - this.time[this.parent[id]] });
        }
        return out.reverse();
    }
}

// ----------------------------------------------------------

class Bot {
    // level: 0-10, an index into BOT_LEVELS; seed: for its noise and mistakes
    constructor(level = 8, seed = 1) {
        this.explorer = new BotExplorer();
        this.board = new Int32Array(BOT_ROWS);
        this.deepBuf = new Int32Array(BOT_ROWS);
        this.rng = botRng(seed); // runs on across games, so a restart doesn't repeat the same mistakes
        this.setLevel(level);
        this.attach(null);
    }

    setLevel(level) {
        this.level = Math.max(0, Math.min(BOT_LEVELS.length - 1, level));
        this.hands = BOT_LEVELS[this.level];
        this.weights = null; // drawn again, with the new level's noise, at the next input
    }

    get name() { return "Level " + this.level; }

    // A new game (or a new level in the same one: keepHeld): weights with its noise
    attach(game, keepHeld = false) {
        this.game = game;
        if (!keepHeld || !this.held) { this.held = {}; for (const [k] of BOT_KEYS) this.held[k] = false; }
        this.want = {};
        for (const [k] of BOT_KEYS) this.want[k] = 0;
        this.hard = false;
        this.weights = null;
        this.profile = null;
        this.style = "hard";
        if (game) {
            this.style = botLockStyle(game);
            this.profile = this.forceProfile || botProfile(game, this.hands);
            const base = BOT_WEIGHTS[this.profile], noise = this.hands.noise;
            const gauss = () => Math.sqrt(-2 * Math.log(1 - this.rng())) * Math.cos(2 * Math.PI * this.rng());
            this.weights = { ...base };
            if (noise) for (const k of ["landing", "eroded", "rowTrans", "colTrans", "holes", "wells", "holeDepth", "holeRows"]) this.weights[k] *= Math.max(0.2, 1 + noise * gauss());
        }
        this.resetPiece();
    }

    resetPiece() {
        this.lastType = 0;
        this.lastActive = -1;
        this.plan = null;
        this.macro = null;
        this.cool = 0;
        this.wait = 0;
        this.replans = 0;
        this.sniping = 0; // frames waited to snipe (snipeWait)
        this.afterHold = false;
        this.useHard = true;
        this.irsDone = false; // the turn for the next piece is chosen (once per entry delay)
        this.irsKey = null;
        this.expect = null; // the pose the last key should leave the piece in
        this.path = null;   // and the route from there
    }

    // The input bitmap for the game's next frame
    input(game) {
        botSetWidth(game.width);
        if (game !== this.game || !this.weights) this.attach(game, game === this.game);
        for (const [k] of BOT_KEYS) this.want[k] = 0;
        this.hard = false;
        if (!game.isGameOver() && game.phase === "active" && game.curPiece_type) this.think(game);
        else {
            if (this.lastActive >= 0) this.resetPiece();
            if (this.hands.irs) this.preSpawn(game);
        }
        return this.emit();
    }

    // want: 0 let go, 1 held, 2 tapped (pressed again if it is held)
    emit() {
        let bits = 0;
        for (const [k, push, release] of BOT_KEYS) {
            const w = this.want[k];
            if (w === 2) {
                if (this.held[k]) bits |= release;
                bits |= push;
                this.held[k] = true;
            } else if (w === 1) {
                if (!this.held[k]) { bits |= push; this.held[k] = true; }
            } else if (this.held[k]) {
                bits |= release;
                this.held[k] = false;
            }
        }
        if (this.hard) bits |= HARD_PUSH;
        return bits;
    }

    think(game) {
        const fresh = this.lastType !== game.curPiece_type || game.activeTime !== this.lastActive + 1 || this.lastActive < 0;
        this.lastType = game.curPiece_type;
        this.lastActive = game.activeTime;
        if (fresh) {
            const afterHold = this.afterHold, charged = this.preDas;
            this.resetPiece();
            this.lastType = game.curPiece_type;
            this.lastActive = game.activeTime;
            this.wait = afterHold ? 0 : this.hands.reaction;
            this.useHard = this.rng() < this.hands.hard;
            this.preDas = null;
            if (charged) { // DAS charged in the entry delay: keep the key held until the piece is at the wall
                this.macro = { kind: "das", dir: charged.dir, stop: charged.col, start: game.curPiece_col, frames: 0,
                    limit: game.das + BOT_W * Math.max(1, game.arr) + 12 };
                this.want[charged.dir] = 1;
                this.wait = 0;
            }
        }
        if (this.wait > 0) { this.wait--; return; }
        if (this.macro && this.runMacro(game)) return;
        if (this.cool > 0) { this.cool--; return; }
        if (!this.plan) {
            this.plan = this.decide(game);
            if (!this.plan) { this.macro = { kind: "finish" }; this.runMacro(game); return; }
        }
        if (this.plan.held) { // the hold didn't take: play this piece after all
            this.plan = this.decide(game, null, false);
            if (!this.plan) { this.macro = { kind: "finish" }; this.runMacro(game); return; }
        }
        if (this.plan.hold) {
            this.want.hold = 2;
            this.afterHold = true;
            this.plan = { hold: false, goal: null, held: true }; // until the held piece shows
            this.cool = 1;
            return;
        }
        // the rest of the last route while the piece is where it was expected, else a new one
        const e = this.expect;
        const onTrack = e && game.curPiece_row === e.row && game.curPiece_col === e.col && game.curPiece_rotation === e.rot;
        const route = onTrack ? this.path : this.route(game, this.plan.goal);
        this.expect = this.path = null;
        if (!route) { // not reachable any more (it fell further than modelled): choose again
            this.plan = null;
            if (++this.replans > 3) { this.macro = { kind: "finish" }; this.runMacro(game); }
            return;
        }
        if (route.length === 0) { this.macro = { kind: "finish" }; this.runMacro(game); return; }
        if (this.act(game, route)) { // a single key: where it should leave the piece, and what follows
            this.expect = route[0];
            this.path = route.slice(1);
        }
    }

    // During the entry delay: holds the turn the next piece should enter with (IRS), and hold when
    // the piece hold would bring in plays better (IHS)
    preSpawn(game) {
        if (!game.irs || game.gameover || game.curPiece_type) return;
        if (game.phase !== "are" && game.phase !== "lineclear" && game.phase !== "ready" && game.phase !== "rollstart") return;
        const turnKey = start => start === 1 ? "rotr" : start === 3 ? "rotl" : start === 2 ? "rot180" : null;
        if (!this.irsDone && game.nextCount > 0 && game.rnd_get_queue(0)) {
            this.irsDone = true;
            this.irsKey = null;
            this.ihsHold = false;
            this.ihsNext = null;
            this.preDas = null;
            const type = game.rnd_get_queue(0), visible = [];
            for (let i = 1; i < game.nextCount; i++) if (game.rnd_get_queue(i)) visible.push(game.rnd_get_queue(i));
            if (!this.weights) return;
            const held = game.getHeldPiece(), other = held || visible[0];
            if (other && this.ihsAllowed(game)) {
                // the same pieces looked ahead on either side, or the scores wouldn't compare; the piece
                // hold would bring in is weighed on the next frame, so no frame does two searches
                const rest = held ? visible : visible.slice(1), n = Math.min(visible.length, rest.length);
                const stay = this.entryChoice(game, type, visible.slice(0, n), true);
                if (stay) {
                    this.irsKey = turnKey(stay.start);
                    this.preDas = this.dasCharge(game, type, stay);
                    this.ihsNext = { other, rest: rest.slice(0, n), stay };
                }
            } else {
                const best = this.entryChoice(game, type, visible, this.chargesInAre(game));
                if (best) {
                    this.irsKey = turnKey(best.start);
                    this.preDas = this.dasCharge(game, type, best);
                }
            }
        } else if (this.ihsNext) {
            const { other, rest, stay } = this.ihsNext;
            this.ihsNext = null;
            const swap = this.entryChoice(game, other, rest, true);
            if (swap && swap.score - this.hands.hold > stay.score) {
                this.ihsHold = true;
                this.irsKey = turnKey(swap.start);
                this.preDas = this.dasCharge(game, other, swap);
            }
        }
        if (this.preDas) this.want[this.preDas.dir] = 1;
        if (this.ihsHold) this.want.hold = 1;
        if (this.irsKey) this.want[this.irsKey] = 1;
    }

    // DAS charged during the entry delay (levels with IRS and DAS, where the rule set charges DAS then:
    // the Guideline and the TGM games, not NES or GB): for a piece whose best place is against a wall,
    // in the turn it enters with, at least BOT_DAS_MIN columns away, the direction is held through the
    // delay so the piece shoots there as it enters ({ dir, col }, carried out by think()'s DAS macro)
    chargesInAre(game) {
        return this.hands.das && this.hands.irs && (game.tgm || game.gamemode === guideline);
    }

    dasCharge(game, type, choice) {
        if (!this.chargesInAre(game) || choice.col === undefined || choice.start !== choice.rot) return null;
        const cells = game.curCells[type][choice.rot], cols = cells.map(([, j]) => j);
        const spawn = (game.big ? game.bigSpawnPosition(type) : game.spawnPosition(type))[1];
        const dir = choice.col + Math.min(...cols) === 0 ? -1 : choice.col + Math.max(...cols) === BOT_W - 1 ? 1 : 0;
        if (!dir || Math.abs(choice.col - spawn) < BOT_DAS_MIN) return null;
        return { dir: dir < 0 ? "left" : "right", col: choice.col };
    }

    // IHS: hold held as a piece enters swaps it, where the game has it, for the levels with IRS that
    // hold at all (not during READY, which TGM3 Sakura gives to Hold of its own)
    ihsAllowed(game) {
        return game.hasHold && game.ihs && game.phase !== "ready" && this.hands.hold < Infinity;
    }

    // The best way for the piece of `type` about to enter to play, as decide() gives it for the
    // turns it can enter with ({ start, score, col, rot }); null when it can't enter. With one turn
    // only there's nothing to choose ({ start: 0 }), unless `scored`.
    entryChoice(game, type, visible, scored = false) {
        const [row0, col] = game.big ? game.bigSpawnPosition(type) : game.spawnPosition(type);
        if (!game.movePossible(row0, col, 0, type)) return null;
        const starts = [];
        for (const rot of game.rot180 ? [0, 1, 3, 2] : [0, 1, 3]) {
            if (rot && (type === tetO || !game.movePossible(row0, col, rot, type))) continue;
            let row = row0;
            if (game.dropsOnSpawn && game.movePossible(row + 1, col, rot, type)) row++;
            for (let n = Math.floor(game.gravity); n > 0 && game.movePossible(row + 1, col, rot, type); n--) row++;
            starts.push({ row, col, rot });
        }
        if (starts.length < 2 && !scored) return { start: 0 };
        return this.decide(game, { type, starts, visible });
    }

    // Presses the first key of the route; returns whether that was one action (not a held key)
    act(game, route) {
        const hands = this.hands, first = route[0], want = this.want;
        this.cool = Math.max(0, hands.interval - 1);
        switch (first.act) {
            case BOT_CW: want.rotr = 2; break;
            case BOT_CCW: want.rotl = 2; break;
            case BOT_R180: want.rot180 = 2; break;
            case BOT_LEFT: case BOT_RIGHT: {
                const dir = first.act === BOT_LEFT ? "left" : "right";
                let n = 1;
                while (n < route.length && route[n].act === first.act) n++;
                const last = route[n - 1];
                const step = (first.act === BOT_LEFT ? -1 : 1) * (game.big ? game.bigMove : 1);
                // ARR 0 shoots to the wall (or the stack): only worth it when that is where it stops
                const stops = game.arr > 0 || !game.movePossible(last.row, last.col + step, last.rot);
                if (hands.das && n >= BOT_DAS_MIN && stops) {
                    this.macro = { kind: "das", dir, stop: last.col, start: game.curPiece_col, frames: 0,
                        limit: game.das + n * Math.max(1, game.arr) + 12 };
                    want[dir] = 1;
                    this.cool = 0;
                    return false;
                }
                want[dir] = 2;
                break;
            }
            case BOT_DOWN:
                this.macro = { kind: "soft", stop: game.curPiece_row + 1, frames: 0 };
                want.soft = 1;
                this.cool = 0;
                return false;
            case BOT_WAIT:
                this.cool = Math.max(0, first.cost - 1);
                break;
        }
        return true;
    }

    // A key held over several frames; returns whether it took this frame
    runMacro(game) {
        const m = this.macro, want = this.want;
        switch (m.kind) {
            case "das":
                if (game.curPiece_col === m.stop || ++m.frames > m.limit) {
                    this.macro = null;
                    this.cool = Math.max(0, this.hands.interval - 1);
                } else want[m.dir] = 1;
                return true;
            case "soft":
                if (game.curPiece_row >= m.stop || ++m.frames > 120) {
                    this.macro = null;
                    this.cool = Math.max(0, this.hands.interval - 1);
                } else want.soft = 1;
                return true;
            case "finish": // the piece is where it should be: drop it
                if (this.snipeWait(game)) return true;
                if (this.useHard && this.style !== "soft") {
                    if (this.style === "hard") {
                        if (!(game.handling.dropGuard && game.activeTime <= GUIDELINE_DROP_GUARD)) this.hard = true;
                        else want.soft = 1;
                    } else if (game.canFall()) this.hard = true;
                    else want.soft = 1;
                } else want.soft = 1;
                return true;
        }
        return false;
    }

    // A placement that sets off an attack item waits (levels BOT_SNIPE_LEVEL up, at most BOT_SNIPE_WAIT
    // frames) for it to hit the other side's piece in play: a snipe (the guide: the attack destroys
    // the piece in play, not one in ARE). The item goes off with the clear (TGM3, ACE) or after its
    // delay: it waits for the other side's piece to be in play then, as it sees on that side's screen.
    snipeWait(game) {
        const item = this.plan && this.plan.goal && this.plan.goal.item, other = game.rival;
        if (!item || !VS_ITEMS[item].attack || this.level < BOT_SNIPE_LEVEL || !other || other.isGameOver()) return false;
        if (++this.sniping > BOT_SNIPE_WAIT) return false;
        const delay = game.itemsAtClear ? 0 : game.lineClearDelay;
        if (other.phase === "active") return delay > 0 && other.activeTime > 6; // it may lock before the item lands
        if (other.phase === "are") return other.phaseLength - other.phaseCounter > delay;
        return true; // a line clear or a cut-in: it has no piece
    }

    // ----------------------------------------------------------
    // Finding the way

    // current: the piece in play (the gravity it owes, its lock delay and resets so far count), else
    // one about to enter
    explorerOpts(game, type, row, col, rot, goal, current = false) {
        const hands = this.hands;
        const softLocks = this.style !== "hard";
        const resets = Number.isFinite(game.moveLimit);
        botBoardFrom(game, this.board);
        const tucks = hands.tucks && botHasOverhang(this.board); // nothing to slide under otherwise
        const spins = type === tetT && !!this.weights.spin;
        return {
            spins, sp: spins && current && game.lastRotation ? game.lastKick + 2 : 0,
            game, probe: Object.assign(Object.create(game), { sounds: [], bumps: [], hardDropCells: [], clearedCells: [], actions: [] }),
            type, row, col, rot, goal,
            // gravity owed in rows (NES and GB count it in frames)
            acc: !current ? 0 : game.nes || game.gb ? game.gravityAcc * game.gravity : Math.min(game.gravityAcc, 0.99),
            interval: hands.interval,
            // grounded actions before the piece locks: lock resets, or the lock delay in actions
            gaMax: resets ? game.moveLimit : Math.floor((game.lockDelayMax || 30) / hands.interval),
            ga: !current ? 0 : resets ? game.moveResets : Math.ceil(game.curPiece_lockDelay / hands.interval),
            rot180: !!game.rot180,
            wait: tucks && game.gravity > 0 && game.gravity < 1,
            down: tucks && !softLocks && game.softGravity > 0, // a soft drop would lock where it lands
            softCost: Math.max(1, Math.ceil(1 / Math.max(game.softGravity, 0.01))),
        };
    }

    // The actions from where the piece is to the goal; [] when it is there, null when it can't be reached
    route(game, goal) {
        const ex = this.explorer;
        const id = ex.run(this.explorerOpts(game, game.curPiece_type, game.curPiece_row, game.curPiece_col, game.curPiece_rotation, goal, true));
        return id < 0 ? null : ex.path(id);
    }

    // Every placement of a piece that can be reached from a pose: pushed to out. With spins, also the
    // T-spins: a T resting where it turned (spin: the game's "full" or "mini")
    gather(game, type, row, col, rot, isHold, out, current = false) {
        const ex = this.explorer, o = this.explorerOpts(game, type, row, col, rot, null, current);
        ex.run(o);
        const place = (lk, spin) => {
            const idx = lk >> 2;
            out.push({ start: rot, type, rot: lk & 3, col: idx % BOT_COLS - BOT_COL_OFF, row: Math.floor(idx / BOT_COLS) + FIELD_TOP, hold: isHold, spin, score: 0, board: null });
        };
        for (const lk of ex.cands) place(lk, null);
        if (!o.spins) return;
        const probe = Object.create(game);
        for (const lk of ex.spinCands) {
            const id = ex.spinCand[lk];
            probe.curPiece_row = ex.row[id]; probe.curPiece_col = ex.col[id]; probe.curPiece_rotation = ex.rot[id];
            probe.lastKick = ex.sp[id] - 2;
            const spin = probe.detectTSpin();
            if (spin) place(lk, spin);
        }
    }

    // ----------------------------------------------------------
    // Choosing

    // The best way to play the current piece: { goal: { col, rot, land }, hold }, or null
    // pre: the piece that is about to enter ({ type, starts: [{ row, col, rot }], visible }): which
    // turn it should enter with, { start }
    decide(game, pre = null, allowHold = true) {
        const hands = this.hands, w = this.weights, shapes = botShapes(game);
        w.fast = game.gravity >= 1; // at a row a frame or more an open well and rows waiting for an I are a risk
        let visible = [];
        for (let i = 0; i < game.nextCount; i++) {
            const t = game.rnd_get_queue(i);
            if (t) visible.push(t);
        }
        const roots = [];
        if (pre) {
            visible = pre.visible;
            for (const st of pre.starts) this.gather(game, pre.type, st.row, st.col, st.rot, false, roots);
        } else this.gather(game, game.curPiece_type, game.curPiece_row, game.curPiece_col, game.curPiece_rotation, false, roots, true);
        let holdSeq = visible, holding = false;
        if (!pre && allowHold && game.hasHold && game.canHold && hands.hold < Infinity) {
            const held = game.getHeldPiece();
            const type = held || visible[0];
            if (type) {
                let [row, col] = game.big ? game.bigSpawnPosition(type) : game.spawnPosition(type);
                if (game.dropsOnSpawn && game.movePossible(row + 1, col, 0, type)) row++;
                if (game.movePossible(row, col, 0, type)) {
                    this.gather(game, type, row, col, 0, true, roots);
                    holdSeq = held ? visible : visible.slice(1);
                    holding = true;
                }
            }
        }
        // one move ahead for all, then the deeper search for the best few
        botBoardFrom(game, this.board);
        const buf = new Int32Array(BOT_ROWS);
        const pending = game.sendsGarbage ? game.pendingGarbage() : 0;
        const b2b = !!game.b2b, combo = game.gamemode === guideline ? game.combo : -1; // the Guideline's chains
        for (const pl of roots) {
            const seq = pl.hold ? holdSeq : visible;
            const cleared = botLock(this.board, buf, game.curCells[pl.type][pl.rot], pl.row, pl.col);
            if (cleared < 0) { pl.score = -Infinity; continue; }
            pl.step = botStepScore(game, buf, w, cleared, b2b, combo, pl.spin);
            pl.b2b = botClear.b2b;
            pl.combo = botClear.combo;
            pl.pending = botPendingAfter(game, pending, cleared);
            const dead = botDead(game, buf, seq[0] || tetT) || botRiseDead(game, buf, pending, cleared);
            pl.board = Int32Array.from(buf);
            pl.score = pl.step + botBoardScore(buf, w) + (dead || botBlocked(game, buf, seq[0] || tetT) ? BOT_DANGER : 0);
            if (game.variant === "sakura") { // the jewels it clears
                const value = BOT_JEWEL * botJewelsCleared(game, this.board, game.curCells[pl.type][pl.rot], pl.row, pl.col);
                pl.step += value;
                pl.score += value;
            }
            if (game.itemsOn && this.level >= BOT_ITEM_LEVEL) { // the item it sets off, if any (see botItemValue)
                pl.item = botItemCleared(game, this.board, game.curCells[pl.type][pl.rot], pl.row, pl.col);
                pl.step += botItemValue(game, pl.item, buf);
                pl.score += botItemValue(game, pl.item, buf);
            }
        }
        roots.sort((a, b) => b.score - a.score);
        if (!roots.length || roots[0].score === -Infinity) return null;
        // every option looks equally far ahead (a hold into an empty hold uses up a next piece), or
        // their scores, sums over the moves, wouldn't compare
        const depth = Math.min(hands.depth, visible.length, holding ? holdSeq.length : Infinity);
        if (depth > 0) {
            const keep = Math.min(roots.length, Math.max(4, hands.beam));
            for (let i = 0; i < keep; i++) {
                const pl = roots[i], seq = pl.hold ? holdSeq : visible;
                if (pl.score > BOT_DANGER / 2) pl.score = this.deepen(game, pl, seq, depth, shapes);
            }
            roots.length = keep;
        }
        for (const pl of roots) if (pl.hold) pl.score -= hands.hold;
        roots.sort((a, b) => b.score - a.score);
        let pick = this.pick(roots);
        if (this.hands.misdrop && this.rng() < this.hands.misdrop) pick = this.misdrop(roots, pick);
        if (pre) return { start: pick.start, score: pick.score, col: pick.col, rot: pick.rot };
        if (pick.hold) return { hold: true, goal: null };
        return { hold: false, goal: { col: pick.col, rot: pick.rot, land: pick.row, spin: !!pick.spin, item: pick.hold ? null : pick.item } };
    }

    // Beam search over the next pieces from a placed root: the best total of the moves' scores and
    // the last board's. Each ply keeps only its best `beam` boards (copied as they make the cut); the
    // last ply only needs the best score. The pieces after the current one are dropped straight
    // (botDrops: no T-spins; the slots they leave count in the board's score).
    deepen(game, root, seq, depth, shapes) {
        const w = this.weights, beam = this.hands.beam, buf = this.deepBuf;
        let states = [{ rows: root.board, acc: root.step, score: root.score, pending: root.pending, b2b: root.b2b, combo: root.combo }];
        for (let ply = 0; ply < depth; ply++) {
            const type = seq[ply], next = seq[ply + 1] || tetT, last = ply === depth - 1;
            const kept = []; // best first
            let best = -Infinity;
            for (const st of states) {
                botDrops(game, st.rows, type, shapes, (shape, col, row) => {
                    const cleared = botLock(st.rows, buf, shape.cells, row, col);
                    if (cleared < 0) return;
                    const acc = st.acc + botStepScore(game, buf, w, cleared, st.b2b, st.combo);
                    const pending = botPendingAfter(game, st.pending, cleared);
                    const b2b = botClear.b2b, combo = botClear.combo;
                    const dead = botDead(game, buf, next) || botRiseDead(game, buf, st.pending, cleared);
                    const score = acc + botBoardScore(buf, w) + (dead || botBlocked(game, buf, next) ? BOT_DANGER : 0);
                    if (last) { if (score > best) best = score; return; }
                    if (kept.length === beam && score <= kept[beam - 1].score) return;
                    const child = kept.length === beam ? kept.pop() : { rows: new Int32Array(BOT_ROWS), acc: 0, score: 0, pending: 0, b2b: false, combo: -1 };
                    child.rows.set(buf);
                    child.acc = acc;
                    child.score = score;
                    child.pending = pending;
                    child.b2b = b2b;
                    child.combo = combo;
                    let i = kept.length;
                    while (i > 0 && kept[i - 1].score < score) i--;
                    kept.splice(i, 0, child);
                });
            }
            if (last) return best === -Infinity ? BOT_DANGER : best;
            if (!kept.length) return BOT_DANGER;
            states = kept;
        }
        return states[0].score;
    }

    // Among the best few, a softmax over their scores (the best when temp is 0)
    pick(sorted) {
        const temp = this.hands.temp * 10;
        if (!temp || sorted.length === 1) return sorted[0];
        const top = sorted.slice(0, 4).filter(p => p.score > sorted[0].score - 50 * temp);
        let total = 0;
        const weights = top.map(p => { const e = Math.exp((p.score - sorted[0].score) / temp); total += e; return e; });
        let x = this.rng() * total;
        for (let i = 0; i < top.length; i++) if ((x -= weights[i]) <= 0) return top[i];
        return top[0];
    }

    // Aims a column (or a turn) off
    misdrop(roots, pick) {
        const near = roots.filter(p => p !== pick && p.hold === pick.hold && p.type === pick.type
            && ((p.rot === pick.rot && Math.abs(p.col - pick.col) <= (this.game.big ? this.game.bigMove : 1)) || (p.col === pick.col && p.row === pick.row)));
        return near.length ? near[Math.floor(this.rng() * near.length)] : pick;
    }
}
