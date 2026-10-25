// The rule sets' common base. Each family lives in its own file and subclasses RuleGame:
//
//  - rules-guideline.js  Guideline (GuidelineGame): Marathon (150 lines, variable goal, endless),
//                        Sprint, Ultra, Dig, Master
//  - rules-tgm.js        the TGM series (TgmGame): TGM1 (Tgm1Game), TAP (TapGame: Master, Death,
//                        TGM+) and TGM3 (TiGame: Master; TiEasyGame, TiShiraseGame), World or Classic rule
//  - rules-ace.js        ACE (AceGame): the 150-line time attack modes
//  - rules-1989.js       NES and GB (Game1989: NesGame, GbGame), A-Type and B-Type
//
// Each family file registers its modes (registerRules); createGame() builds the right subclass and
// starts it. The engine drives a game one frame at a time (advanceFrame with an input bitmap) and
// reads it through getCell, getCurPiece_*, takeClearedCells, getStats, ...
//
// RuleGame does what every rule set shares: the field, input and DAS, the frame and its phases
// (ready, active, are, lineclear), collision, SRS rotation with kicks, gravity and the lock delay,
// line clears and the engine's event queues. Subclasses set their configuration in the constructor
// (shapes, next pieces, hold, spawn, randomizer, ...) and override hooks: setTimings, spawnPosition,
// beforeSpawn / onNewPiece / afterSpawn / onBlockOut, onClock, onActiveFrame, dasCharges, canShift,
// onShiftBlocked, rotate, onMoveReset, advanceDrop / upKey / onGround / onHardDrop, beforeLock,
// scoreClear, onCollapse, afterClear, ghostVisible, getStats, record, setupField, setHandling, testSetup.
//
// Variants shared by several rule sets (the menu offers each family's own, see VARIANT_NAMES):
//  - standard: the rule set as specified
//  - test:     no gravity (soft and hard drop still work)
//  - death:    constant 20G, no ghost piece (TAP: its own Death mode)
// Row coordinates: visible rows are 2..21; rows above are the buffer zone.

const guideline = 3, arika = 4, tgmClassic = 5, tgmTap = 6, gbTetris = 7, tgmOriginal = 8, nesTetris = 9, tgmAce = 10,
    aceArs = 11, aceArs2 = 12; // ACE with its SRS rule (tgmAce), ARS or ARS2
// Shown under the rule set name; standard is named after the rule set instead (see getStats)
const VARIANT_NAMES = { test: "TEST", death: "DEATH", marathon: "MARATHON", sprint: "SPRINT", ultra: "ULTRA", btype: "B-TYPE", "20g": "20G",
    variable: "VARIABLE", dig: "DIG", master: "MASTER", shirase: "SHIRASE", easy: "EASY", plus: "TGM+",
    normal: "NORMAL", hispeed1: "HI-SPEED 1", hispeed2: "HI-SPEED 2", another: "ANOTHER", another2: "ANOTHER 2", big: "BIG",
    sprint20: "SPRINT", sprint100: "SPRINT", ultra1: "ULTRA", ultra3: "ULTRA", ultra5: "ULTRA" };

const FIELD_TOP = -18;  // the highest row kept: 20 visible rows + 20-row buffer

// Start countdown 3, 2, 1, half a second each; the frame after it is the first to take input
const COUNTDOWN_STEPS = 3, COUNTDOWN_STEP_FRAMES = 30;

// Rows per frame the stack falls into cleared rows during a line clear delay (presentation)
const LINE_DROP_SPEED = 0.5;
// Frames the stack waits before it falls, so the clear's confetti and flash show first; shortened
// when the delay is too short to fit the whole fall after it (the delay itself never changes)
const LINE_DROP_PAUSE = 12;

// Clear messages by number of lines
const CLEAR_NAMES = ["", "SINGLE", "DOUBLE", "TRIPLE", "QUAD"];

// Handling without the player's options (only the Guideline has them): no DAS cut, ghost shown
// where the rule set has one, no hard drop guard
const NO_HANDLING = { dcd: 0, ghost: true, dropGuard: false };

// ----------------------------------------------------------
// SRS kick data: tests 2-5 per transition, (x right, y up)

const STATE_KEYS = ["0", "R", "2", "L"];

const KICKS_JLSTZ = {
    "0->R": [[-1, 0], [-1, +1], [0, -2], [-1, -2]], "R->0": [[+1, 0], [+1, -1], [0, +2], [+1, +2]],
    "R->2": [[+1, 0], [+1, -1], [0, +2], [+1, +2]], "2->R": [[-1, 0], [-1, +1], [0, -2], [-1, -2]],
    "2->L": [[+1, 0], [+1, +1], [0, -2], [+1, -2]], "L->2": [[-1, 0], [-1, -1], [0, +2], [-1, +2]],
    "L->0": [[-1, 0], [-1, -1], [0, +2], [-1, +2]], "0->L": [[+1, 0], [+1, +1], [0, -2], [+1, -2]],
};

const KICKS_I_GUIDELINE = {
    "0->R": [[-2, 0], [+1, 0], [-2, -1], [+1, +2]], "R->0": [[+2, 0], [-1, 0], [+2, +1], [-1, -2]],
    "R->2": [[-1, 0], [+2, 0], [-1, +2], [+2, -1]], "2->R": [[+1, 0], [-2, 0], [+1, -2], [-2, +1]],
    "2->L": [[+2, 0], [-1, 0], [+2, +1], [-1, -2]], "L->2": [[-2, 0], [+1, 0], [-2, -1], [+1, +2]],
    "L->0": [[+1, 0], [-2, 0], [+1, -2], [-2, +1]], "0->L": [[-1, 0], [+2, 0], [-1, +2], [+2, -1]],
};

// Arika SRS (TGM3 World rule / ACE): modified I kicks, same JLSTZ data
const KICKS_I_ARIKA = {
    "0->R": [[-2, 0], [+1, 0], [+1, +2], [-2, -1]], "R->0": [[+2, 0], [-1, 0], [+2, +1], [-1, -2]],
    "R->2": [[-1, 0], [+2, 0], [-1, +2], [+2, -1]], "2->R": [[-2, 0], [+1, 0], [-2, +1], [+1, -1]],
    "2->L": [[+2, 0], [-1, 0], [+2, +1], [-1, -1]], "L->2": [[+1, 0], [-2, 0], [+1, +2], [-2, -1]],
    "L->0": [[-2, 0], [+1, 0], [-2, +1], [+1, -2]], "0->L": [[+2, 0], [-1, 0], [-1, +2], [+2, -1]],
};

// Shape tables written as strings ("." empty), per piece type I..O and rotation state; type 0
// is the empty dummy of game.js
function parseShapes(pieces) {
    return [shapes[0], ...pieces.map(states => states.map(rows => rows.map(r => [...r].map(ch => ch === "." ? 0 : 1))))];
}

// Colour of each piece type, as an index into the engine's palette (cyan, purple, orange,
// blue, green, red, yellow)
const DEFAULT_PALETTE = [0, 1, 2, 3, 4, 5, 6, 7];
const MONO_PALETTE = [0, 5, 5, 5, 5, 5, 5, 5]; // every piece one colour (green; there's no white or grey)

// ----------------------------------------------------------
// Arika Rotation System (TGM's Classic rule, TGM1, TAP, ACE's ARS rules)

// Piece shapes per rotation state (spawn, CW, 180, CCW). All but I sit at the bottom of
// their 3x3 box; L, J and T spawn with the flat side up; I, S and Z toggle between two states.
const ARS_SHAPES = parseShapes([
    [["....", "IIII", "....", "...."], ["..I.", "..I.", "..I.", "..I."], ["....", "IIII", "....", "...."], ["..I.", "..I.", "..I.", "..I."]],
    [["....", "TTT.", ".T..", "...."], [".T..", "TT..", ".T..", "...."], ["....", ".T..", "TTT.", "...."], [".T..", ".TT.", ".T..", "...."]],
    [["....", "LLL.", "L...", "...."], ["LL..", ".L..", ".L..", "...."], ["....", "..L.", "LLL.", "...."], [".L..", ".L..", ".LL.", "...."]],
    [["....", "JJJ.", "..J.", "...."], [".J..", ".J..", "JJ..", "...."], ["....", "J...", "JJJ.", "...."], [".JJ.", ".J..", ".J..", "...."]],
    [["....", ".SS.", "SS..", "...."], ["S...", "SS..", ".S..", "...."], ["....", ".SS.", "SS..", "...."], ["S...", "SS..", ".S..", "...."]],
    [["....", "ZZ..", ".ZZ.", "...."], ["..Z.", ".ZZ.", ".Z..", "...."], ["....", "ZZ..", ".ZZ.", "...."], ["..Z.", ".ZZ.", ".Z..", "...."]],
    [["....", ".OO.", ".OO.", "...."], ["....", ".OO.", ".OO.", "...."], ["....", ".OO.", ".OO.", "...."], ["....", ".OO.", ".OO.", "...."]],
]);

const ARS_SPAWN_ROW = 1; // pieces appear in rows 19-20
// Floor kicks per piece: TGM3's limits (arsFloorKicks; ACE has none)
const ARS_FLOOR_KICKS = { i: 1, t: 2 };

// The Sega/Arika colours (TGM; see DEFAULT_PALETTE)
const ARS_PALETTE = [0, 6, 1, 3, 4, 2, 5, 7]; // I red, T cyan, L orange, J blue, S purple, Z green, O yellow

// The row of a [from level, ...] table that applies at a level
function tableLookup(table, level) {
    let row = table[0];
    for (const r of table) if (level >= r[0]) row = r;
    return row;
}

// ----------------------------------------------------------
// Rule set registry

const RULE_CLASSES = {}; // mode -> variant -> RuleGame subclass

// A family file registers its modes: pick(variant) returns the class that plays it
function registerRules(modes, pick) {
    for (const mode of modes) RULE_CLASSES[mode] = pick;
}

// A new game of a mode and variant. startLevel: NES and GB (start level), Guideline Master (M1 +
// startLevel), the Guideline marathons; height: NES and GB B-Type (garbage height), Guideline Dig
// (rows); handling: Guideline only, overrides of GUIDELINE_HANDLING (the other rule sets keep their
// specified timing); options: the TGM games' hidden modes (setOptions)
function createGame(mode, variant = "standard", startLevel = 0, height = 0, handling = {}, options = {}) {
    const Game = RULE_CLASSES[mode](variant);
    const game = new Game(mode, variant, startLevel, height, handling);
    game.setOptions(options);
    game.begin();
    return game;
}

// ----------------------------------------------------------

class RuleGame {
    // Common state and defaults; subclasses set their configuration after this, and createGame()
    // calls begin() once they have
    constructor(mode, variant = "standard") {
        this.gamemode = mode;
        this.variant = variant;
        this.tgm = false; // the TGM series (TgmGame)
        this.handling = { ...NO_HANDLING };
        this.setShapes(shapes, DEFAULT_PALETTE);
        this.big = false; // pieces twice the size, moving two columns at a time (setBig)
        this.bigMode = false; // big from the start: the Big mode
        this.rev = false; // Rev: the well drawn upside down, pieces "falling" upwards (the engine)
        this.tls = false; // TLS: the ghost piece all game
        // First row of the well (the engine sizes the board to it), the first row the engine draws
        // (the two rows above the well too) and the highest row a piece may occupy
        this.wellTop = VISIBLE_TOP;
        this.firstDrawnRow = 0;
        this.pieceTop = FIELD_TOP;
        this.hasHold = true;
        this.nextCount = 1; // pieces shown in the preview
        this.iKicks = KICKS_I_GUIDELINE; // SRS I kicks (rotate())
        this.ars = false; // the Arika Rotation System (useArs), else SRS
        this.plainArs = false; // ARS with only the basic kicks (TGM1, TAP)
        this.arsFloorKicks = ARS_FLOOR_KICKS; // ARS floor kicks per piece, for the I and the T
        this.floorKickZeroes = true; // rotating again after a floor kick zeroes the lock delay (TGM3)
        this.sonicTrail = false; // the sonic drop leaves a drop trail (TAP Master)
        this.irs = true; // a rotation held as the piece enters turns it
        this.dropsOnSpawn = false; // a new piece drops one row at once (Guideline)
        this.moveLimit = Infinity; // lock resets per piece (onMoveReset)
        this.lockOut = false; // a piece locked entirely above the visible field ends the game
        this.bufferTop = null; // blocks locking above this row are deleted (TGM)
        this.softDropPoints = 0; // score per soft-dropped row (Guideline)
        this.randomizer = null; // else a 7-bag
        this.bag = [];

        this.field = [];
        for (let r = FIELD_TOP; r < HEIGHT; r++) this.field.push(new Array(WIDTH).fill(0));

        this.startLevel = 0;
        this.height = 0;
        this.level = 1;
        this.lines = 0;
        this.score = 0;
        this.frames = 0;
        this.timerStopped = false; // the clock stops (TGM: at the end level, for the staff roll)
        this.gameover = false;
        this.endTitle = null;
        this.endSub = null;

        this.startdelayMax = COUNTDOWN_STEPS * COUNTDOWN_STEP_FRAMES; // 3, 2, 1
        this.startdelayCounter = 0; // countdown frames run so far
        this.phase = "ready";
        this.phaseCounter = 0;
        this.phaseLength = 0;
        this.pendingRows = [];

        // Input state
        this.held = { left: false, right: false, soft: false, rotl: false, rotr: false, hold: false };
        this.shiftDir = 0;
        this.dasCounter = 0;
        this.arrCounter = 0;
        this.dcdWait = 0; // frames the charged auto-shift still pauses (DAS cut delay)

        // Current piece
        this.curPiece_type = 0;
        this.curPiece_rotation = 0;
        this.curPiece_row = 0;
        this.curPiece_col = 3;
        this.shadowRow = -100;
        this.curPiece_lockDelay = 0;
        this.heldpiece = 0;
        this.canHold = true;
        this.firstPiece = true;
        this.gravityAcc = 0;

        // Scoring state
        this.combo = -1;
        // Consecutive clearing pieces for presentation, the same in every rule set:
        // -1 after a piece that cleared nothing, 0 on the first clear, 1, 2, ... after
        this.chain = -1;
        this.b2b = false;
        this.actions = [];
        this.actionAge = 999;

        this.clearedCells = [];
        this.hardDropCells = [];
        this.bumps = [];
        this.wallBumped = false;
        this.sounds = []; // "move", "rotate", "lock", "harddrop", "sonic", "clear1".."clear4" (+ "c<chain>" in a combo)
        this.queue = [];
    }

    // After the subclass's configuration: the first pieces, the timings, garbage to start over
    begin() {
        this.fillQueue();
        this.updateTimings();
        this.setupField();
    }

    // The piece shapes ([type][rotation] rows of 0/1) and their offsets, and the colours
    setShapes(shapeTable, palette = this.palette) {
        this.shapes = shapeTable;
        this.pieceCells = shapeCells(shapeTable); // [type][rotation] -> [row, col] offsets
        this.curCells = this.pieceCells; // the current piece's offsets: pieceCells, or doubled when big
        this.palette = palette;
    }

    // The Arika Rotation System's shapes and colours (the Sega ones by default); plain: only the basic kicks
    useArs(plain, palette = ARS_PALETTE) {
        this.ars = true;
        this.plainArs = plain;
        this.setShapes(ARS_SHAPES, palette);
    }

    // The hidden modes of the TGM games, before the first piece (they combine): big (pieces twice
    // the size), rev (pieces enter at the bottom and rise: only the engine's drawing changes), mono
    // (every piece one colour), tls (the ghost piece all game)
    setOptions({ big = false, rev = false, mono = false, tls = false } = {}) {
        if (big) this.setBig();
        this.rev = rev;
        if (mono) this.palette = MONO_PALETTE;
        this.tls = tls;
    }

    setupField() {} // garbage to start over (Dig, B-Type)

    // ----------------------------------------------------------
    // Engine interface

    inStartDelay() { return this.phase === "ready"; }
    // Countdown digit to show (3, 2, 1) until the frame that first takes input, else 0
    countdown() {
        if (this.phase !== "ready") return 0;
        return Math.min(COUNTDOWN_STEPS, Math.floor((this.startdelayMax - this.startdelayCounter) / COUNTDOWN_STEP_FRAMES) + 1);
    }
    inRollStart() { return this.phase === "rollstart"; }
    getCurPiece_col() { return this.curPiece_col; }
    getShadowRow() { return this.shadowRow; }
    getCurPiece_row() { return this.curPiece_row; }
    getCurPiece_rotation() { return this.curPiece_rotation; }
    getCurPiece_type() { return this.curPiece_type; }
    getHeldPiece() { return this.heldpiece; }
    isGameOver() { return this.gameover; }
    rnd_get_queue(i) { return this.queue[i]; }

    getCell(row, col) {
        if (row > HEIGHT - 1 || col < 0 || col > WIDTH - 1) return 10;
        if (row < FIELD_TOP) return 0;
        return this.field[row - FIELD_TOP][col];
    }

    // Opacity of a settled block (TGM's staff rolls fade or hide them)
    getCellAlpha(row, col) {
        return 1;
    }

    setCell(row, col, val) {
        if (row > HEIGHT - 1 || col < 0 || col > WIDTH - 1 || row < FIELD_TOP) return;
        this.field[row - FIELD_TOP][col] = val;
    }

    // Rows the stack at `row` falls while a line clear delay runs (cleared rows below it)
    getDropDistance(row) {
        if (this.phase !== "lineclear" || !this.pendingRows.length) return 0;
        return this.pendingRows.filter(r => r > row).length;
    }

    // Frame of the line clear delay at which the whole stack starts to fall: after
    // LINE_DROP_PAUSE, or sooner so the longest fall still fits in the delay
    dropStartFrame() {
        const longest = Math.ceil(this.pendingRows.length / LINE_DROP_SPEED);
        return clamp(this.phaseLength - longest, 0, LINE_DROP_PAUSE);
    }

    // Frame of the line clear delay at which the stack at `row` lands: it falls at
    // LINE_DROP_SPEED, or faster when that wouldn't land it before the delay ends
    dropLandFrame(row) {
        const dist = this.getDropDistance(row);
        return Math.min(this.dropStartFrame() + Math.ceil(dist / LINE_DROP_SPEED), this.phaseLength);
    }

    // How far the stack at `row` has fallen so far (presentation only: the field
    // collapses when the delay ends); sub: share of the next frame already shown (0..1),
    // for displays faster than the game
    getDropOffset(row, sub = 0) {
        const dist = this.getDropDistance(row);
        if (!dist) return 0;
        const start = this.dropStartFrame(), land = this.dropLandFrame(row);
        const now = this.phaseCounter + sub;
        if (now >= land) return dist;
        return Math.max(0, dist * (now - start) / (land - start));
    }

    // Frames since the stack at `row` landed in this line clear delay (sub as above), −1
    // while it still falls or doesn't move
    getDropLandedFor(row, sub = 0) {
        if (!this.getDropDistance(row)) return -1;
        const since = this.phaseCounter + sub - this.dropLandFrame(row);
        return since >= 0 ? since : -1;
    }

    // Event queues the engine drains every frame
    takeClearedCells() { return this.drain("clearedCells"); }
    takeHardDropCells() { return this.drain("hardDropCells"); }
    takeBumps() { return this.drain("bumps"); } // directions (-1 left, 1 right) pushed against the border
    takeSounds() { return this.drain("sounds"); }

    drain(queue) {
        const events = this[queue];
        this[queue] = [];
        return events;
    }

    scoreText() {
        return this.score.toLocaleString("en-US");
    }

    // Side panel rows: the first is [rule set, mode]
    getStats() {
        return [["", ""]];
    }

    // The finished game's result for the personal records: key, numbers compared in order (higher is
    // better; times go in negated), and text to show; null when the game doesn't count (a time
    // attack not finished). The score by default.
    record() {
        return { key: [this.score], text: this.scoreText() };
    }

    formatTime(frames = this.frames) {
        const cs = Math.floor((frames % 60) * 100 / 60);
        const s = Math.floor(frames / 60) % 60;
        const m = Math.floor(frames / 3600);
        return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
    }

    // ----------------------------------------------------------
    // Rules

    // The rule set's delays and gravity (setTimings), then the variants that override gravity only
    // (soft drop keeps the rule set's speed)
    updateTimings() {
        this.setTimings();
        if (this.variant === "test") {
            this.gravity = 0;
        } else if (this.variant === "death" || this.variant === "20g") {
            this.gravity = 20;
            this.softGravity = 20;
        }
    }

    // Sets are, lineAre, das, arr, lockDelayMax, lineClearDelay, gravity and softGravity (rows per frame)
    setTimings() {}

    // Handling changed in the menu during a game (the Guideline's options; ignored elsewhere)
    setHandling(handling) {}

    ghostVisible() {
        return this.variant !== "death" && this.variant !== "20g" && this.handling.ghost;
    }

    fillQueue() {
        while (this.queue.length < this.nextCount + 1) {
            if (this.randomizer) {
                this.queue.push(this.randomizer.next());
            } else {
                if (this.bag.length === 0) { // 7-bag
                    this.bag = [1, 2, 3, 4, 5, 6, 7];
                    for (let i = 6; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
                    }
                }
                this.queue.push(this.bag.pop());
            }
        }
    }

    // A block can't go to (r, c): outside the well, above the highest row for pieces, or taken
    blocked(r, c) {
        return c < 0 || c >= WIDTH || r >= HEIGHT || r < this.pieceTop || this.field[r - FIELD_TOP][c] !== 0;
    }

    movePossible(row, col, rotation, type = this.curPiece_type) {
        for (const [i, j] of this.curCells[type][rotation]) if (this.blocked(row + i, col + j)) return false;
        return true;
    }

    // The current piece's blocks on the field
    curPieceCells() {
        const { curPiece_type: type, curPiece_row: row, curPiece_col: col } = this;
        return this.curCells[type][this.curPiece_rotation].map(([i, j]) => ({ row: row + i, col: col + j, type }));
    }

    // Big pieces: every block becomes 2 x 2 (its offsets doubled), pieces move and kick two cells at
    // a time, enter in columns 2-9 on the 2 x 2 grid, and two cleared rows count as one line. Before
    // the first piece (createGame) it is the Big mode; TGM3 Shirase's staff roll turns it on too.
    setBig() {
        if (this.phase === "ready") this.bigMode = true;
        this.big = true;
        this.curCells = this.pieceCells.map(states => states.map(cells =>
            cells.flatMap(([i, j]) => [[2 * i, 2 * j], [2 * i, 2 * j + 1], [2 * i + 1, 2 * j], [2 * i + 1, 2 * j + 1]])));
    }

    canFall() {
        return this.movePossible(this.curPiece_row + 1, this.curPiece_col, this.curPiece_rotation);
    }

    setShadow() {
        if (!this.curPiece_type || !this.ghostVisible()) { this.shadowRow = -100; return; }
        let r = this.curPiece_row;
        while (this.movePossible(r + 1, this.curPiece_col, this.curPiece_rotation)) r++;
        this.shadowRow = r;
    }

    // A row rises from the floor: everything moves up one, the top row is lost
    raiseRow(cells) {
        this.field.shift();
        this.field.push(cells);
    }

    endGame(title, sub) {
        this.gameover = true;
        this.endTitle = title;
        this.endSub = sub;
    }

    // Clear messages for the engine: kind is "clear", "tspin", "b2b", "combo", "pc" or "grade";
    // value is the number of lines for clears and T-spins, the chain length for combos
    addAction(text, kind, value = 0) {
        if (this.actionAge > 0) this.actions = [];
        this.actions.push({ text, kind, value });
        this.actionAge = 0;
    }

    // The clear's name, then the chain length if it continues one
    addClearActions(n) {
        this.addAction(CLEAR_NAMES[n], "clear", n);
        if (this.chain > 0) this.addAction(this.chain + " COMBO", "combo", this.chain);
    }

    fieldEmpty() {
        return this.field.every(row => row.every(v => v === 0));
    }

    // ----------------------------------------------------------
    // Frame

    advanceFrame(input) {
        const C = (a) => (input & a) === a;
        this.spawnedThisFrame = false;
        this.actionAge++;

        // Key state (pushes and releases come as one bitmap per frame)
        if (C(SOFT_RELEASE)) this.held.soft = false;
        if (C(ROTL_RELEASE)) this.held.rotl = false;
        if (C(ROTR_RELEASE)) this.held.rotr = false;
        if (C(HOLD_RELEASE)) this.held.hold = false;
        if (C(LEFT_RELEASE)) { this.held.left = false; if (this.shiftDir === -1) this.restartShift(this.held.right ? 1 : 0); }
        if (C(RIGHT_RELEASE)) { this.held.right = false; if (this.shiftDir === 1) this.restartShift(this.held.left ? -1 : 0); }
        if (C(SOFT_PUSH)) this.held.soft = true;
        if (C(ROTL_PUSH)) this.held.rotl = true;
        if (C(ROTR_PUSH)) this.held.rotr = true;
        if (C(HOLD_PUSH)) this.held.hold = true;
        let shiftPushed = false;
        if (C(LEFT_PUSH)) { this.held.left = true; this.restartShift(-1); shiftPushed = true; }
        if (C(RIGHT_PUSH)) { this.held.right = true; this.restartShift(1); shiftPushed = true; }

        // DAS charges in every phase, including ARE and line clears (unless dasCharges() says
        // otherwise). The first auto-shift comes DAS frames after the press, then one every ARR frames.
        let autoShift = false;
        if (this.shiftDir !== 0 && !shiftPushed && this.dasCharges()) {
            if (this.dasCounter < this.das) {
                if (++this.dasCounter >= this.das) {
                    autoShift = true;
                    this.arrCounter = 0;
                }
            } else if (this.dcdWait > 0) {
                this.dcdWait--;
            } else if (++this.arrCounter >= this.arr) {
                autoShift = true;
                this.arrCounter = 0;
            }
        }

        if (this.gameover) return;

        if (this.phase === "ready") {
            // the frame after the last countdown frame is the first that takes input
            if (this.startdelayCounter % COUNTDOWN_STEP_FRAMES === 0 && this.startdelayCounter < this.startdelayMax)
                this.sounds.push("count");
            if (++this.startdelayCounter > this.startdelayMax) {
                this.startdelayCounter = 0;
                this.sounds.push("go");
                this.spawn(this.nextFromQueue(), false);
                if (this.gameover) return;
            } else return;
        }

        if (!this.timerStopped) this.frames++;
        if (!this.onClock()) return;

        if (this.phase === "lineclear") {
            if (++this.phaseCounter >= this.phaseLength) {
                this.collapse(this.pendingRows);
                this.pendingRows = [];
                this.afterClear();
            }
            return;
        }

        if (this.phase === "rollstart") { // TGM: the field empties before the staff roll
            this.advanceRollStart();
            return;
        }

        if (this.phase === "are") {
            if (++this.phaseCounter >= this.phaseLength) {
                this.spawn(this.nextFromQueue(), false);
                if (this.gameover) return;
            } else return;
        }

        // Active piece
        this.activeTime++;
        this.onActiveFrame();

        if (C(HOLD_PUSH) && !this.spawnedThisFrame && this.canHold) {
            // The swapped-in piece goes through the rest of this frame like a freshly
            // spawned one, so at 20G it falls at once instead of showing at the top
            this.hold();
            if (this.gameover) return;
        }

        if (!this.spawnedThisFrame) { // IRS already handled rotations held at spawn
            if (C(ROTL_PUSH)) this.rotate(-1);
            if (C(ROTR_PUSH)) this.rotate(1);
        }

        if ((shiftPushed || (autoShift && !this.dcdWait)) && this.canShift()) {
            // ARR 0: the auto-shift goes straight to the wall
            let steps = autoShift && this.arr === 0 ? WIDTH : 1, moved = false;
            while (steps-- > 0 && this.shift(this.shiftDir, !moved)) moved = true; // one move sound
            if (!moved) this.onShiftBlocked();
        }

        this.advanceDrop(C);
    }

    dasCharges() { return true; } // whether DAS charges this frame
    canShift() { return true; } // whether the piece may shift this frame
    onShiftBlocked() {} // a shift (press or auto-shift) found no room

    // Every frame after the countdown, once the clock has run: the rule set's own clocks (time
    // limits, staff roll, ...). Returns false when the frame should go no further (the game ended).
    onClock() { return true; }

    onActiveFrame() {} // every frame a piece is in play, before input moves it

    // Drops and locking for the active piece after rotation and shifting: up (a hard drop), then
    // gravity and the lock delay once it rests
    advanceDrop(C) {
        if (C(HARD_PUSH) && this.upKey()) return;
        this.applyGravity();
        if (this.phase !== "active") return;
        if (!this.canFall()) {
            this.touched = true;
            this.onGround();
        }
    }

    // Up pressed; returns whether the piece locked
    upKey() {
        this.hardDrop();
        return true;
    }

    // The piece rests on something: the lock delay runs; out of lock resets it locks at once
    onGround() {
        if (this.moveResets >= this.moveLimit) {
            this.lock();
            return;
        }
        if (++this.curPiece_lockDelay >= this.lockDelayMax) this.lock();
    }

    restartShift(dir) {
        this.shiftDir = dir;
        this.wallBumped = false;
        this.dasCounter = 0;
        this.arrCounter = 0;
        this.dcdWait = 0;
    }

    // DAS cut delay: a charged auto-shift pauses after a rotation or a new piece
    cutDas() {
        if (this.handling.dcd && this.shiftDir !== 0 && this.dasCounter >= this.das) {
            this.dcdWait = this.handling.dcd;
            this.arrCounter = 0;
        }
    }

    nextFromQueue() {
        const type = this.queue.shift();
        this.fillQueue();
        return type;
    }

    startAre(length) {
        this.setPhase("are", length);
        if (length <= 0) this.spawn(this.nextFromQueue(), false);
    }

    spawn(type, fromHold) {
        const newPiece = !fromHold; // entered after ARE (IHS still counts as a new piece)
        this.beforeSpawn(newPiece);

        // IHS: hold button held while the piece enters
        if (!fromHold && this.hasHold && this.held.hold) {
            if (this.heldpiece === 0) {
                this.heldpiece = type;
                type = this.nextFromQueue();
            } else {
                [this.heldpiece, type] = [type, this.heldpiece];
            }
            fromHold = true;
        }

        this.curPiece_type = type;
        [this.curPiece_row, this.curPiece_col] = this.big ? this.bigSpawnPosition(type) : this.spawnPosition(type);
        this.curPiece_rotation = 0;

        // IRS: rotation button held while the piece enters; falls back if blocked
        const irs = !this.irs ? 0 : this.held.rotr ? 1 : this.held.rotl ? 3 : 0;
        if (irs && type !== tetO && this.movePossible(this.curPiece_row, this.curPiece_col, irs)) {
            this.curPiece_rotation = irs;
        }

        this.phase = "active";
        this.spawnedThisFrame = true;
        this.cutDas();
        this.canHold = this.hasHold && !fromHold;
        this.curPiece_lockDelay = 0;
        this.gravityAcc = 0;
        this.activeTime = 0;
        this.softFrames = 0;
        this.manualLock = false; // locked by the player: hard drop, or a soft drop that locks
        this.lastRotation = false;
        this.lastKick = -1;
        this.touched = false;
        this.moveResets = 0;
        this.rotationResets = 0;
        this.sonicMax = 0; // rows of the longest sonic or hard drop
        this.iFloorKicks = 0; // ARS floor kicks so far
        this.tFloorKicks = 0;
        this.floorKicked = false;
        this.lockDelayZeroed = false;
        this.onNewPiece();

        if (!this.movePossible(this.curPiece_row, this.curPiece_col, this.curPiece_rotation)) {
            this.onBlockOut();
            return;
        }
        if (this.dropsOnSpawn && this.canFall()) this.curPiece_row++;
        this.lowestRow = this.curPiece_row;
        this.afterSpawn(newPiece);
        this.firstPiece = false;
        this.setShadow();
    }

    beforeSpawn(newPiece) {} // a piece is about to enter (newPiece: after ARE, not from hold)
    onNewPiece() {} // the rule set's per-piece state starts over
    // [row, col] of the piece's 4x4 box as it enters
    spawnPosition(type) {
        return [0, 3];
    }
    // Big pieces: in columns 2-9, on the 2 x 2 grid, the top in the top visible row
    bigSpawnPosition(type) {
        return [VISIBLE_TOP - Math.min(...this.curCells[type][0].map(([i]) => i)), 2];
    }
    afterSpawn(newPiece) {} // the piece is in play
    // Block out: the piece has no room to enter
    onBlockOut() {
        this.endGame("GAME OVER", "BLOCK OUT — ESC FOR MENU");
    }

    hold() {
        const current = this.curPiece_type;
        let next;
        if (this.heldpiece === 0) {
            next = this.nextFromQueue();
        } else {
            next = this.heldpiece;
        }
        this.heldpiece = current;
        this.spawn(next, true);
    }

    // Successful move or rotation after touching down: move reset, up to moveLimit per piece
    onMoveReset(isRotation) {
        if (!this.touched || this.moveResets >= this.moveLimit) return;
        this.moveResets++;
        this.curPiece_lockDelay = 0;
    }

    // The piece reached a row lower than ever before: lock timer and reset counters start over
    onFall() {
        this.lastRotation = false;
        this.curPiece_lockDelay = 0;
        if (this.curPiece_row > this.lowestRow) {
            this.lowestRow = this.curPiece_row;
            this.touched = false;
            this.moveResets = 0;
            this.rotationResets = 0;
        }
    }

    // SRS rotation: the kick tests in order (iKicks for the I), twice as far for big pieces; ARS
    // rules rotate with rotateArs
    rotate(dir) {
        if (this.ars) return this.rotateArs(dir);
        const type = this.curPiece_type;
        if (type === tetO) return false;
        const from = this.curPiece_rotation;
        const to = (from + dir + 4) % 4;
        const key = STATE_KEYS[from] + "->" + STATE_KEYS[to];
        const table = type === tetI ? this.iKicks : KICKS_JLSTZ;
        const tests = [[0, 0], ...table[key]];
        const size = this.big ? 2 : 1;
        for (let k = 0; k < tests.length; k++) {
            const [x, y] = tests[k];
            const row = this.curPiece_row - size * y, col = this.curPiece_col + size * x;
            if (this.movePossible(row, col, to)) {
                this.curPiece_row = row;
                this.curPiece_col = col;
                this.curPiece_rotation = to;
                this.lastKick = k;
                if (row > this.lowestRow) this.onFall(); // kicked below the lowest row
                this.lastRotation = true; // after onFall, which clears it
                this.onMoveReset(true);
                this.setShadow();
                this.cutDas();
                this.sounds.push("rotate");
                return true;
            }
        }
        return false;
    }

    // ARS rotation with TGM3's kicks; plainArs (TGM1, TAP): only the basic ones (I never kicks, no floor kicks)
    rotateArs(dir) {
        const type = this.curPiece_type;
        if (type === tetO) return false;
        const from = this.curPiece_rotation;
        const to = (from + dir + 4) % 4;
        const k = this.big ? 2 : 1; // big pieces kick two cells
        const at = (dr, dc) => this.movePossible(this.curPiece_row + k * dr, this.curPiece_col + k * dc, to) ? [k * dr, k * dc] : null;

        let kick = at(0, 0);
        let floorKick = false;
        if (!kick) {
            if (type === tetI) {
                if (this.plainArs) {
                    // no kicks
                } else if (to === 0 || to === 2) {
                    kick = at(0, -1) || at(0, 1) || at(0, 2); // wall kicks into horizontal
                } else if (this.iFloorKicks < this.arsFloorKicks.i && !this.canFall()) {
                    kick = at(-1, 0) || at(-2, 0); // floor kick, only when resting on something
                    floorKick = kick !== null;
                }
            } else {
                if (this.arsWallKickAllowed(type, from, to)) kick = at(0, 1) || at(0, -1); // right first
                if (!kick && !this.plainArs && type === tetT && to === 2 && this.tFloorKicks < this.arsFloorKicks.t) {
                    kick = at(-1, 0); // T escapes upwards into its pointing-up state
                    floorKick = kick !== null;
                }
            }
        }
        if (!kick) return false;

        // TGM3: rotating a T or I again after a floor kick sets its lock delay to zero
        if (this.floorKicked && this.floorKickZeroes) this.lockDelayZeroed = true;
        if (floorKick) {
            this.floorKicked = true;
            if (type === tetI) this.iFloorKicks++;
            else this.tFloorKicks++;
        }

        this.curPiece_row += kick[0];
        this.curPiece_col += kick[1];
        this.curPiece_rotation = to;
        if (this.curPiece_row > this.lowestRow) this.onFall();
        this.lastRotation = true;
        this.setShadow();
        this.sounds.push("rotate");
        return true;
    }

    // Centre column rule: L, J and T rotating from a 3-wide orientation may only kick if the
    // first colliding cell of the rotated piece (scanning its 3x3 box in reading order) is
    // not in the centre column
    arsWallKickAllowed(type, from, to) {
        if (type !== tetL && type !== tetJ && type !== tetT) return true;
        if (from !== 0 && from !== 2 || this.big) return true;
        // L, J and T fit their box's top three rows and columns; the cells come in reading order
        const hit = this.pieceCells[type][to].find(([i, j]) => this.blocked(this.curPiece_row + i, this.curPiece_col + j));
        return !hit || hit[1] !== 1;
    }

    // Returns whether the piece moved; sound false: no move sound (later steps of an ARR 0 shift)
    shift(dir, sound = true) {
        if (dir === 0) return false;
        const step = this.big ? 2 * dir : dir;
        if (this.movePossible(this.curPiece_row, this.curPiece_col + step, this.curPiece_rotation)) {
            this.curPiece_col += step;
            this.lastRotation = false;
            this.onMoveReset(false);
            this.setShadow();
            if (sound) this.sounds.push("move");
            return true;
        }
        if (!this.wallBumped && this.hitsWall(dir)) {
            this.wallBumped = true; // once per press, not on every auto-shift
            this.bumps.push(dir);
        }
        return false;
    }

    // Would shifting by dir push a block through the left or right border?
    hitsWall(dir) {
        return this.curPieceCells().some(({ col }) => col + dir < 0 || col + dir >= WIDTH);
    }

    applyGravity() {
        const soft = this.held.soft;
        if (soft) this.softFrames++;
        this.gravityAcc += soft ? this.softGravity : this.gravity;
        while (this.gravityAcc >= 1) {
            if (!this.canFall()) { this.gravityAcc = 0; break; }
            this.curPiece_row++;
            this.gravityAcc -= 1;
            if (soft) this.score += this.softDropPoints;
            this.onFall();
        }
    }

    // Moves the piece down as far as it goes and returns the rows it fell; eachRow: every row
    // counts as a fall (onFall), for a piece that stays in play
    dropToFloor(eachRow) {
        let distance = 0;
        while (this.canFall()) {
            this.curPiece_row++;
            distance++;
            if (eachRow) this.onFall();
        }
        return distance;
    }

    // Sonic drop (ARS rules): to the floor without locking; the lock delay then runs as usual
    sonicDrop() {
        const distance = this.dropToFloor(true);
        this.sonicMax = Math.max(this.sonicMax, distance);
        if (distance === 0) return;
        this.sounds.push("sonic");
        if (this.sonicTrail) {
            for (const cell of this.curPieceCells()) this.hardDropCells.push({ ...cell, dist: distance, cleared: false });
        }
    }

    hardDrop() {
        const distance = this.dropToFloor(false);
        if (distance > 0) this.lastRotation = false;
        this.hardDropDistance = distance;
        this.onHardDrop(distance);
        this.manualLock = true;
        this.lock(true);
    }

    onHardDrop(distance) {} // scoring for the rows dropped

    lock(fromHardDrop = false) {
        const type = this.curPiece_type;
        this.lockedType = type; // for scoring (T-spins, Easy's spin bonus)
        this.beforeLock();
        this.sounds.push(fromHardDrop ? "harddrop" : "lock");

        const cells = this.curPieceCells();
        let allAbove = true;
        for (const cell of cells) {
            if (cell.row >= VISIBLE_TOP) allAbove = false;
            if (this.bufferTop !== null && cell.row < this.bufferTop) continue; // deleted above the buffer
            this.setCell(cell.row, cell.col, type);
            this.onBlockLocked(cell);
        }

        this.curPiece_type = 0;
        this.curPiece_lockDelay = 0;
        this.shadowRow = -100;

        // Lock out: piece locked entirely above the visible field
        if (this.lockOut && allAbove) {
            this.endGame("GAME OVER", "LOCK OUT — ESC FOR MENU");
            return;
        }

        // Find and empty full rows
        const rows = [];
        for (let r = FIELD_TOP; r < HEIGHT; r++) {
            if (this.field[r - FIELD_TOP].every(v => v !== 0)) {
                rows.push(r);
                for (let c = 0; c < WIDTH; c++) {
                    this.clearedCells.push({ row: r, col: c, type: this.field[r - FIELD_TOP][c] });
                    this.field[r - FIELD_TOP][c] = 0;
                }
            }
        }
        const n = this.big ? rows.length >> 1 : rows.length; // big: two rows make a line (NullpoMino)
        this.chain = n > 0 ? this.chain + 1 : -1;
        if (n > 0) this.sounds.push("clear" + n + (this.chain > 0 ? "c" + this.chain : "")); // e.g. "clear2c3"

        this.scoreClear(n, rows);
        if (this.gameover) return;

        const collapseNow = rows.length > 0 && this.lineClearDelay === 0;
        if (fromHardDrop) {
            for (const cell of cells) {
                // cleared cells keep the row they landed in, for the drop trail (there's no block to flash)
                const cleared = rows.includes(cell.row);
                const below = collapseNow && !cleared ? rows.filter(r => r > cell.row).length : 0;
                this.hardDropCells.push({ row: cell.row + below, col: cell.col, type, dist: this.hardDropDistance, cleared });
            }
        }

        if (rows.length === 0) {
            this.startAre(this.are);
        } else if (collapseNow) {
            this.collapse(rows);
            this.afterClear();
        } else {
            this.setPhase("lineclear", this.lineClearDelay);
            this.pendingRows = rows;
        }
    }

    beforeLock() {} // the piece is about to lock (still where it is)
    onBlockLocked(cell) {} // one of its blocks was set in the field
    scoreClear(n, rows) {} // a piece locked, clearing n lines (rows): score, levels, the end

    // Timed phases (are, lineclear, rollstart) count phaseCounter up to phaseLength
    setPhase(phase, length) {
        this.phase = phase;
        this.phaseCounter = 0;
        this.phaseLength = length;
    }

    // Remove emptied rows and let everything above fall (naive gravity)
    collapse(rows) {
        if (rows.length === 0) return;
        this.field = this.dropRows(this.field, rows, () => new Array(WIDTH).fill(0));
        this.onCollapse(rows);
    }

    // A per-row list without the cleared rows, refilled at the top with fill()
    dropRows(list, rows, fill) {
        const kept = list.filter((_, i) => !rows.includes(i + FIELD_TOP));
        while (kept.length < list.length) kept.unshift(fill());
        return kept;
    }

    onCollapse(rows) {} // per-row data the rule set keeps falls with the field

    // After a line clear: the next piece
    afterClear() {
        this.startAre(this.lineAre);
    }

    // Hidden test setups (the engine's Ctrl+Shift+digit keys); TGM only. Returns whether one applied.
    testSetup(name) {
        return false;
    }
}
