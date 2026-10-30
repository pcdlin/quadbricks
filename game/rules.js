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
// scoreClear, riseAfterLock, onCollapse, afterClear, ghostVisible, getStats, record, setupField, setHandling,
// testSetup, versusOutcome.
//
// Versus (the variant "versus": Guideline, TGM1, TAP, TGM3, ACE, NES, GB): each side of a match is
// its own game, which the engine pairs (rival) and passes the attacks between (takeAttacks ->
// receiveGarbage). What garbage a clear sends, when it rises and who wins (versusOutcome) are the
// rule set's own; the waiting garbage, its rising, the event queues and the items of the TGM games
// (TAP, TGM3 and ACE with the Items card) are shared here.
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
    sprint20: "SPRINT", sprint100: "SPRINT", ultra1: "ULTRA", ultra3: "ULTRA", ultra5: "ULTRA", versus: "VERSUS" };

const FIELD_TOP = -18;  // the highest row kept: 20 visible rows + 20-row buffer

// Start countdown 3, 2, 1, a second each; the frame after it is the first to take input
const COUNTDOWN_STEPS = 3, COUNTDOWN_STEP_FRAMES = 60;

// Rows per frame the stack falls into cleared rows during a line clear delay, on average: it speeds up as it goes
// (presentation)
const LINE_DROP_SPEED = 1.25;
// Frames the stack waits before it falls, so the clear's confetti and flash show first; shortened
// when the delay is too short to fit the whole fall after it (the delay itself never changes)
const LINE_DROP_PAUSE = 12;

// Clear messages by number of lines
const CLEAR_NAMES = ["", "SINGLE", "DOUBLE", "TRIPLE", "QUAD"];

// Versus items (TGM1, TAP, TGM3 and ACE with the Items card; TAP Normal's two use the same code), as
// tetris.wiki's TGM Versus Mode Guide gives TAP's and Heboris (a TGM clone) plays them: every piece
// fills the item gauge, and after VS_ITEM_PIECES the next carries an item (all its blocks). A line
// clear that takes an item block sets off the highest such item (the rightmost of a row), turns the
// field's other item blocks into normal ones and sends no garbage. Items come from a bag per round
// with one of each, drawn by TAP's weights without replacement (VS_ITEMS, refilled when empty).
// Attack items act on the other side at once, knocking its piece in play out (a "snipe") and holding
// it still for a cut-in (VS_CUTIN_FRAMES), or after its line clear; the others on the side setting
// them off, after the clear. While an attack is active on the other side (its cut-in, and the pieces
// or frames the item lasts: attackActive()), the attacker's gauge doesn't fill and its own items wait
// for the attack to end (the guide).
const VS_ITEM_PIECES = 20;
// TAP's items, in the guide's table's order: weight (the whole bag's add up to 1970), whether it attacks
// the other side, and for an attack that lasts: the pieces (locks) or frames it lasts there (itemEffects,
// itemTimers), brief when the attacker's gauge fills again after its cut-in all the same (the guide)
const VS_ITEMS = {
    "COLOR BLOCK": { weight: 250, attack: true, pieces: 3 }, // pieces: Heboris's
    "LASER": { weight: 250, attack: true },
    "TRANSFORM": { weight: 250, attack: true, pieces: 3 },
    "↑ DEL FIELD": { weight: 250 },
    "DEL EVEN": { weight: 150 },
    "ROLL ROLL": { weight: 150, attack: true, pieces: 3 },
    "MIRROR BLOCK": { weight: 150, attack: true },
    "X-RAY": { weight: 150, attack: true, pieces: 4 }, // pieces: Heboris's
    "180° FIELD": { weight: 100, attack: true },
    "↓ DEL FIELD": { weight: 100 },
    "DEATH BLOCK": { weight: 50, attack: true, pieces: 1, brief: true },
    "→ MOV FIELD": { weight: 50 },
    "HARD BLOCK": { weight: 50, attack: true, pieces: 1, brief: true },
    "SHOTGUN!": { weight: 5, attack: true },
    "DARK BLOCK": { weight: 5, attack: true, frames: 480 }, // frames: Heboris's
    "FREE FALL": { weight: 3 },
    "← MOV FIELD": { weight: 3 },
    "EXCHG FIELD": { weight: 3, neutral: true }, // neutral: waits for every attack on either side to end
    "NEGA FIELD": { weight: 1, attack: true },
};
// Frames an attack item holds the other side still (its cut-in; the arcade's length isn't known:
// Heboris's wait after a snipe)
const VS_CUTIN_FRAMES = 60;
const VS_MIRROR_PIECES = 3; // Mirror Block turns the field after each of the next 3 pieces (Heboris)
// Frames each turn of the field takes: the field goes dark, its columns come back one at a time, mirrored,
// then it rests (Heboris: about 50 frames); the side waits for it before its next piece
const VS_MIRROR_FRAMES = 40, VS_MIRROR_DARK = 10, VS_MIRROR_COLUMN = 2;

// Handling without the player's options (only the Guideline has them): no DAS cut, ghost shown
// where the rule set has one, no hard drop guard
const NO_HANDLING = { dcd: 0, ghost: true, dropGuard: false };

// The debug menu's setups (debugSetups): "near the end" leaves this many frames of a time limit,
// the preset fields (rows from the bottom, X a block) and the piece each needs next
const DEBUG_LEAD = 10 * 60;
const DEBUG_FIELD_IDS = ["empty", "tetris", "tsd", "pc", "top"];
const DEBUG_FIELD_LABELS = ["Empty", "Tetris ready", "T-spin double", "Perfect clear", "Near the top"];
const DEBUG_FIELDS = {
    empty: [],
    tetris: Array(4).fill("XXXXXXXXX."),
    tsd: ["XXX..XXXXX", "XXX...XXXX", "XXXX.XXXXX"], // a T turned clockwise into the slot from the left (SRS kick 3)
    pc: ["XXX....XXX"],
};
const DEBUG_FIELD_PIECES = { tetris: tetI, tsd: tetT, pc: tetI };
const DEBUG_PIECES = [tetI, tetT, tetL, tetJ, tetS, tetZ, tetO], DEBUG_PIECE_LABELS = ["I", "T", "L", "J", "S", "Z", "O"];
const DEBUG_GARBAGE = [1, 2, 4, 8]; // rows of garbage the debug menu sends

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

// 180° rotation (not in the Guideline; offered as a handling option): Techmino's "SRS+" basic 180
// kicks, tests 2-5 (x right, y up), the I's mostly the same
const KICKS_180 = {
    "0->2": [[-1, 0], [+1, 0], [0, -1], [0, +1]], "2->0": [[+1, 0], [-1, 0], [0, -1], [0, +1]],
    "R->L": [[0, -1], [-1, 0], [+1, 0], [0, +1]], "L->R": [[0, -1], [-1, 0], [+1, 0], [0, +1]],
};
const KICKS_180_I = {
    ...KICKS_180,
    "2->0": [[+1, 0], [-1, 0], [0, +1], [0, -1]], "L->R": [[0, -1], [+1, 0], [-1, 0], [0, +1]],
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
// blue, green, red, yellow), and of the versus garbage cells (tetGARBAGE): GARBAGE_COLOR, a dark grey
const GARBAGE_COLOR = 9;
// Hard Block (a versus item): its blocks carry HARD_BIT in their cell until a line clear breaks the
// shell, drawn in HARD_COLOR
const HARD_BIT = 16, HARD_COLOR = 10;
// Every palette maps tetGARBAGE too: Nega Field (useItem) and Guideline and GB garbage put it in the field
const DEFAULT_PALETTE = [0, 1, 2, 3, 4, 5, 6, 7, GARBAGE_COLOR];
const MONO_PALETTE = [0, 8, 8, 8, 8, 8, 8, 8, GARBAGE_COLOR]; // every piece one colour (index 8, the neutral white-grey)

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
const ARS_PALETTE = [0, 6, 1, 3, 4, 2, 5, 7, GARBAGE_COLOR]; // I red, T cyan, L orange, J blue, S purple, Z green, O yellow

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
    if (game.versus && options.rounds) game.versusWins = options.rounds; // the Rounds card
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
        this.bigMove = 2; // cells a big piece moves and kicks by (TGM3 Sakura's big stage: 1)
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
        this.sonicTrail = false; // the sonic drop leaves a drop trail and knocks the field like a hard drop (TAP)
        this.irs = true; // a rotation held as the piece enters turns it
        this.ihs = true; // hold held as the piece enters swaps it (where there is a hold)
        this.rot180 = false; // the 180° rotation key turns the piece (Guideline handling option)
        this.dropsOnSpawn = false; // a new piece drops one row at once (Guideline)
        // a piece may shift, drop and soft drop on the frame it enters; false (TGM): that frame takes
        // only IRS and gravity, and shifts and up pressed on it act on the next frame (deferredPush)
        this.moveOnSpawn = true;
        this.spawnRise = 0; // rows a piece whose entry is blocked may enter higher instead (ACE: 2)
        this.entering = false; // this frame is such a first frame
        this.deferredPush = 0;
        this.moveLimit = Infinity; // lock resets per piece (onMoveReset)
        this.lockOut = false; // a piece locked entirely above the visible field ends the game
        this.bufferTop = null; // blocks locking above this row are deleted (TGM)
        this.softDropPoints = 0; // score per soft-dropped row (Guideline)
        this.randomizer = null; // else a 7-bag
        this.bag = [];
        this.bagNoSzoFirst = false; // the 7-bag never deals S, Z or O first (ACE)

        this.field = [];
        for (let r = FIELD_TOP; r < HEIGHT; r++) this.field.push(new Array(WIDTH).fill(0));

        this.startLevel = 0;
        this.height = 0;
        this.level = 1;
        this.lines = 0;
        this.score = 0;
        this.frames = 0;
        this.timerStopped = false; // the clock stops (TGM: at the end level, for the staff roll)
        this.tested = false; // a hidden test setup or the debug menu changed the game: it sets no record
        this.debugGravity = true; // false: the debug menu turned gravity off
        this.gameover = false;
        this.endTitle = null;
        this.endSub = null;
        this.clearedRows = []; // the last lock's full rows as they were (versus: TGM3's garbage)
        this.shellRows = []; // and those that only broke Hard Block's shells (kept)

        // Versus: one side of a match (the engine sets rival, the other side's game)
        this.versus = variant === "versus";
        this.rival = null;
        this.sendsGarbage = false; // clears send garbage (Guideline, TGM3; not NES)
        this.versusWins = 1; // rounds a side must win to take the match (TGM3: 2)
        this.incoming = []; // attacks received and not yet risen, oldest first: { lines, hole } or { lines, rows }
        this.garbageCap = Infinity; // rows of it that may rise on one lock (the Guideline's Garbage cap card)
        this.attacks = []; // attacks since the last takeAttacks(): { lines } or { lines, rows }
        this.risen = []; // garbage rows that rose, per lock, since the last takeRisenGarbage()
        this.linesSent = 0; // lines that went to the other side

        this.startdelayMax = COUNTDOWN_STEPS * COUNTDOWN_STEP_FRAMES; // 3, 2, 1
        this.startdelayCounter = 0; // countdown frames run so far
        this.phase = "ready";
        this.phaseCounter = 0;
        this.phaseLength = 0;
        this.pendingRows = [];
        this.dropPause = null; // presentation: frames the stack waits before falling into a clear (the engine's), else LINE_DROP_PAUSE

        // Input state
        this.held = { left: false, right: false, soft: false, rotl: false, rotr: false, rot180: false, hold: false };
        this.shiftDir = 0;
        this.dasCounter = 0;
        this.arrCounter = 0;
        this.dcdWait = 0; // frames the charged auto-shift still pauses (DAS cut delay)
        // das counts the press frame as the first (the TGM tables, as tetris.wiki gives them): the
        // first auto-shift comes das - 1 frames after the press instead of das
        this.dasInclusive = false;

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
        this.softLandings = []; // rows a soft drop brought the piece down before it landed, per landing
        this.softRows = 0; // rows soft-dropped since soft drop was held or the piece last landed
        this.wallBumped = false;
        this.sounds = []; // "move", "rotate", "lock", "harddrop", "sonic", "zap" (an item used), "clear1".."clear4" (+ "c<chain>" in a combo)
        this.fireworks = 0; // fireworks fired since the engine last looked (TGM3 Easy)
        this.holds = 0; // holds (IHS included) since the engine last looked
        // Item pieces (TAP Normal): the item the next piece to enter carries (queue[0]), and the
        // current piece's; their settled blocks answer getCellItem
        this.nextItem = null;
        this.pieceItem = null;
        this.itemCells = null; // per cell, the item its block carries (where there are items)
        this.firingItems = []; // items a clear set off, used after it (afterClear)
        this.itemBursts = []; // item blocks a clear took ({ row, col, item }), since the engine last looked
        this.itemsOn = false; // versus: items are dealt (the Items card, useItems())
        this.itemGauge = 0; // pieces towards the next item
        this.itemInterval = VS_ITEM_PIECES; // pieces that fill the gauge (TGM3's styles change it)
        this.itemSet = Object.keys(VS_ITEMS); // the items the game has (TGM1: no Mirror Block)
        this.itemsAtClear = false; // attack items go off with the clear, not after its delay (TGM3, ACE)
        this.itemBag = []; // the items left in this round's bag
        this.mirrorPieces = 0; // Mirror Block: locks left that turn the field
        this.cutIn = 0; // frames this side stands still for the other side's attack item (its cut-in)
        this.cutInItem = null; // and that item, for the engine
        this.itemEffects = {}; // attack items lasting on this side: pieces left, by item
        this.itemTimers = {}; // and frames left
        this.waitingItems = []; // own items set off while this side's attack is active, waiting for its end
        this.mirrorGarbage = []; // garbage received during Mirror Block, waiting for its end
        this.mirroredAt = -Infinity; // the frame Mirror Block last turned the field (its animation)
        this.flipWait = 0; // frames the next ARE waits for that turn
        this.garbageEveryLock = false; // versus garbage rises after every lock (TGM, GB), else the rule set's riseAfterLock()
        this.garbageTopsOut = false; // blocks garbage pushes out of the top top this side out (Guideline), else they are lost
        this.incomingItems = []; // the other side's items, taking effect after this side's next lock
        this.rng = null; // garbage and items draw from it when set (versus: from the match's seed), else Math.random
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

    // Opacity of a settled block: the rule set's (blockAlpha: TGM's staff rolls fade or hide them),
    // and what the other side's versus items leave in view (itemAlpha)
    getCellAlpha(row, col) {
        return this.blockAlpha(row, col) * this.itemAlpha(row, col) * this.mirrorAlpha(col);
    }
    blockAlpha(row, col) { return 1; }
    itemAlpha(row, col) {
        let alpha = 1;
        // Dark Block: the stack blinks for a second, then is gone like in TAP's M-roll (the guide; Heboris)
        const dark = this.itemTimers["DARK BLOCK"];
        if (dark > 0) alpha = dark > 420 && dark % 2 === 0 ? 1 : 0;
        return alpha;
    }

    // The colour index a settled block is drawn in (its piece's, through the palette)
    getCellColor(row, col) {
        const type = this.getCell(row, col);
        return type & HARD_BIT ? HARD_COLOR : this.palette[type];
    }

    // The colour index the piece in play is drawn in
    getPieceColor() {
        return this.hitting("HARD BLOCK") ? HARD_COLOR : this.palette[this.curPiece_type];
    }

    // The item a settled block carries (item pieces), or null
    getCellItem(row, col) {
        if (!this.itemCells || row < FIELD_TOP || row >= HEIGHT || !this.getCell(row, col)) return null;
        return this.itemCells[row - FIELD_TOP][col];
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
    // LINE_DROP_PAUSE (or the engine's dropPause), or sooner so the longest fall still fits in the delay
    dropStartFrame() {
        const longest = Math.ceil(this.pendingRows.length / LINE_DROP_SPEED);
        return clamp(this.phaseLength - longest, 0, this.dropPause ?? LINE_DROP_PAUSE);
    }

    // Frame of the line clear delay at which the stack at `row` lands: it falls at
    // LINE_DROP_SPEED, or faster when that wouldn't land it before the delay ends
    dropLandFrame(row) {
        const dist = this.getDropDistance(row);
        return Math.min(this.dropStartFrame() + Math.ceil(dist / LINE_DROP_SPEED), this.phaseLength);
    }

    // How far the stack at `row` has fallen so far (presentation only: the field
    // collapses when the delay ends), speeding up like a fall so it lands with a snap; sub: share
    // of the next frame already shown (0..1), for displays faster than the game
    getDropOffset(row, sub = 0) {
        const dist = this.getDropDistance(row);
        if (!dist) return 0;
        const start = this.dropStartFrame(), land = this.dropLandFrame(row);
        const now = this.phaseCounter + sub;
        if (now >= land) return dist;
        const k = Math.max(0, (now - start) / (land - start));
        return dist * k * k;
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
    takeSoftLandings() { return this.drain("softLandings"); } // rows soft-dropped, per landing
    takeSounds() { return this.drain("sounds"); }
    // Fireworks fired since the last call (TGM3 Easy's are drawn as bursts)
    takeFireworks() {
        const n = this.fireworks;
        this.fireworks = 0;
        return n;
    }

    // Item blocks a clear took since the last call (the engine bursts them)
    takeItemBursts() {
        return this.drain("itemBursts");
    }

    // Holds since the last call (the engine flashes the held piece)
    takeHolds() {
        const n = this.holds;
        this.holds = 0;
        return n;
    }

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
        if (!this.debugGravity) this.gravity = 0;
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
                if (this.bag.length === 0) { // 7-bag, dealt from its end
                    const first = this.queue.length === 0 && this.firstPiece;
                    do {
                        this.bag = [1, 2, 3, 4, 5, 6, 7];
                        for (let i = 6; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
                        }
                    } while (first && this.bagNoSzoFirst && [tetS, tetZ, tetO].includes(this.bag[6]));
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
        if (this.itemCells) {
            this.itemCells.shift();
            this.itemCells.push(new Array(WIDTH).fill(null));
        }
    }

    endGame(title, sub) {
        this.gameover = true;
        this.endTitle = title;
        this.endSub = sub;
    }

    // More lines for the game over banner, under endSub (TGM: the secret grade, TGM3's exam)
    endNotes() {
        return [];
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
        // shifts and up pressed on a piece's first frame (moveOnSpawn false), unless let go since
        let deferred = this.deferredPush;
        this.deferredPush = 0;
        if (input & LEFT_RELEASE) deferred &= ~LEFT_PUSH;
        if (input & RIGHT_RELEASE) deferred &= ~RIGHT_PUSH;
        input |= deferred;
        const C = (a) => (input & a) === a;
        this.spawnedThisFrame = false;
        this.entering = false;
        this.actionAge++;

        // Key state (pushes and releases come as one bitmap per frame)
        if (C(SOFT_RELEASE)) this.held.soft = false;
        if (C(ROTL_RELEASE)) this.held.rotl = false;
        if (C(ROTR_RELEASE)) this.held.rotr = false;
        if (C(ROT180_RELEASE)) this.held.rot180 = false;
        if (C(HOLD_RELEASE)) this.held.hold = false;
        if (C(LEFT_RELEASE)) { this.held.left = false; if (this.shiftDir === -1) this.changeShift(this.held.right ? 1 : 0, false); }
        if (C(RIGHT_RELEASE)) { this.held.right = false; if (this.shiftDir === 1) this.changeShift(this.held.left ? -1 : 0, false); }
        if (C(SOFT_PUSH)) this.held.soft = true;
        if (C(ROTL_PUSH)) this.held.rotl = true;
        if (C(ROTR_PUSH)) this.held.rotr = true;
        if (C(ROT180_PUSH)) this.held.rot180 = true;
        if (C(HOLD_PUSH)) this.held.hold = true;
        let shiftPushed = false;
        if (C(LEFT_PUSH)) { this.held.left = true; this.changeShift(-1, true); shiftPushed = true; }
        if (C(RIGHT_PUSH)) { this.held.right = true; this.changeShift(1, true); shiftPushed = true; }

        // DAS charges in every phase, including ARE and line clears (unless dasCharges() says
        // otherwise). The first auto-shift comes DAS frames after the press (one less with
        // dasInclusive), then one every ARR frames.
        let autoShift = false;
        if (this.shiftDir !== 0 && !shiftPushed && this.dasCharges()) {
            const das = this.dasInclusive ? Math.max(1, this.das - 1) : this.das;
            if (this.dasCounter < das) {
                if (++this.dasCounter >= das) {
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
        if (this.cutIn > 0) { // the other side's attack item: this side waits for its cut-in
            if (--this.cutIn === 0) this.cutInItem = null;
            return;
        }
        for (const item in this.itemTimers) if (this.itemTimers[item] > 0) this.itemTimers[item]--;

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
            // the roll's first piece goes through its entry frame like any other (IRS, gravity)
            if (this.phase !== "active" || this.gameover) return;
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
            if (C(ROTL_PUSH)) this.turn(-1);
            if (C(ROTR_PUSH)) this.turn(1);
            if (C(ROT180_PUSH) && this.rot180) this.turn(2);
        }
        // Roll Roll: the piece turns counter-clockwise by itself right after it enters, then every 30 frames (the guide)
        if (this.hitting("ROLL ROLL") && !this.spawnedThisFrame && (this.activeTime - 2) % 30 === 0) this.rotate(-1);

        this.entering = this.spawnedThisFrame && !this.moveOnSpawn;
        if (this.entering) {
            this.deferredPush = input & (LEFT_PUSH | RIGHT_PUSH | HARD_PUSH);
        } else if ((shiftPushed || (autoShift && !this.dcdWait)) && this.canShift()) {
            // ARR 0: the auto-shift goes straight to the wall
            let steps = autoShift && this.arr === 0 ? WIDTH : 1, moved = false;
            while (steps-- > 0 && this.shift(this.shiftDir, !moved)) moved = true; // one move sound
            if (!moved) this.onShiftBlocked();
        }

        this.advanceDrop(C);
    }

    dasCharges() { return true; } // whether DAS charges this frame
    keepsDas(pressed) { return false; } // a shift key pressed (or let go) leaves the DAS charge as it is
    canShift() { return true; } // whether the piece may shift this frame
    onShiftBlocked() {} // a shift (press or auto-shift) found no room

    // Every frame after the countdown, once the clock has run: the rule set's own clocks (time
    // limits, staff roll, ...). Returns false when the frame should go no further (the game ended).
    onClock() { return true; }

    onActiveFrame() {} // every frame a piece is in play, before input moves it

    // Drops and locking for the active piece after rotation and shifting: up (a hard drop), then
    // gravity and the lock delay once it rests
    advanceDrop(C) {
        if (C(HARD_PUSH) && !this.entering && this.upKey()) return;
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

    // The piece rests on something: the lock delay runs; out of lock resets it locks at once. The
    // landing frame counts as the first, so a lock delay of N locks N frames after it (as in
    // NullpoMino and Cambridge: the piece rests in view for N frames)
    onGround() {
        if (this.moveResets >= this.moveLimit) {
            this.lock();
            return;
        }
        if (++this.curPiece_lockDelay > this.lockDelayMax) this.lock();
    }

    // The shift direction changed with a key pressed or let go: DAS starts over, unless the rule set
    // keeps the charge (keepsDas)
    changeShift(dir, pressed) {
        if (!this.keepsDas(pressed)) {
            this.restartShift(dir);
            return;
        }
        this.shiftDir = dir;
        this.wallBumped = false;
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
        length += this.flipWait; // Mirror Block's turn of the field runs first
        this.flipWait = 0;
        this.setPhase("are", length);
        if (length <= 0) this.spawn(this.nextFromQueue(), false);
    }

    spawn(type, fromHold) {
        const newPiece = !fromHold; // entered after ARE (IHS still counts as a new piece)
        this.beforeSpawn(newPiece);
        this.deathBlock(this.hitting("DEATH BLOCK"));

        // IHS: hold button held while the piece enters
        const ihs = !fromHold && this.hasHold && this.ihs && this.held.hold;
        if (ihs) {
            if (this.heldpiece === 0) {
                this.heldpiece = type;
                type = this.nextFromQueue();
            } else {
                [this.heldpiece, type] = [type, this.heldpiece];
            }
            fromHold = true;
            this.holds++;
        }

        this.curPiece_type = type;
        [this.curPiece_row, this.curPiece_col] = this.big ? this.bigSpawnPosition(type) : this.spawnPosition(type);
        this.curPiece_rotation = 0;

        // IRS: rotation button held while the piece enters; falls back if blocked
        const irs = !this.irs ? 0 : this.held.rotr ? 1 : this.held.rotl ? 3 : this.rot180 && this.held.rot180 ? 2 : 0;
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
        this.softRows = 0;
        this.manualLock = false; // locked by the player: hard drop, or a soft drop that locks
        this.hardDropped = false; // locked by a hard drop
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
        if (newPiece) { // the item waiting comes with the piece entering; a full gauge brings the next
            // IHS put the item piece in the hold box: it loses its item, as with a hold in play (hold())
            this.pieceItem = ihs ? null : this.nextItem;
            this.nextItem = null;
            // an IHS piece doesn't count (TGM3), nor any while this side's attack item is active (the guide)
            if (this.itemsOn && !ihs && !this.attacking() && ++this.itemGauge >= this.itemInterval) {
                this.itemGauge = 0;
                this.nextItem = this.drawItem();
            }
        }
        this.onNewPiece();

        const step = this.big ? 2 : 1;
        for (let up = 0; up < this.spawnRise && !this.movePossible(this.curPiece_row, this.curPiece_col, this.curPiece_rotation); up++) {
            this.curPiece_row -= step;
        }
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

    // Death Block: the piece entering (the next after the snipe, held or not) is a big one, as in the Big
    // mode (the guide), unless every piece is
    deathBlock(on) {
        if (on && !this.big) {
            this.setBig();
            this.deathBig = true;
        } else if (!on && this.deathBig) {
            this.big = false;
            this.curCells = this.pieceCells;
            this.deathBig = false;
        }
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
        this.holds++;
        this.spawn(next, true);
        this.pieceItem = null; // a held item piece loses its item (tetris.wiki, TGM3)
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

    // A rotation key pressed with a piece in play (not IRS)
    turn(dir) {
        if (this.hitting("TRANSFORM")) {
            // while transforming, the O keeps four rotation states of its own, as the S, Z and I do (the guide)
            if (this.curPiece_type === tetO || this.canRotate(dir)) this.transform();
            if (this.curPiece_type === tetO) {
                this.curPiece_rotation = (this.curPiece_rotation + dir + 4) % 4;
                return;
            }
        }
        this.rotate(dir);
    }

    // Whether the piece could rotate, tried on a probe (the game itself unchanged)
    canRotate(dir) {
        const probe = Object.create(this);
        probe.sounds = [];
        return probe.rotate(dir);
    }

    // Transform: before a rotation the piece turns into one of the seven picked at random (its own
    // too), in the same place and rotation state, kicked one column right or left if it doesn't fit
    // there; it stays as it is if neither does. Only when the piece could rotate as it was. (The guide.)
    transform() {
        const type = 1 + Math.floor(this.random() * 7);
        const step = this.big ? 2 : 1, rot = this.curPiece_rotation, row = this.curPiece_row;
        for (const col of [this.curPiece_col, this.curPiece_col + step, this.curPiece_col - step]) {
            if (this.movePossible(row, col, rot, type)) {
                this.curPiece_type = type;
                this.curPiece_col = col;
                this.setShadow();
                return;
            }
        }
    }

    // SRS rotation: the kick tests in order (iKicks for the I), twice as far for big pieces; dir 2:
    // a 180° turn (KICKS_180); ARS rules rotate with rotateArs
    rotate(dir) {
        if (this.ars) return this.rotateArs(dir);
        const type = this.curPiece_type;
        if (type === tetO) return false;
        const from = this.curPiece_rotation;
        const to = (from + dir + 4) % 4;
        const key = STATE_KEYS[from] + "->" + STATE_KEYS[to];
        const table = dir === 2 ? (type === tetI ? KICKS_180_I : KICKS_180) : type === tetI ? this.iKicks : KICKS_JLSTZ;
        const tests = [[0, 0], ...table[key]];
        const size = this.big ? this.bigMove : 1;
        for (let k = 0; k < tests.length; k++) {
            const [x, y] = tests[k];
            const row = this.curPiece_row - size * y, col = this.curPiece_col + size * x;
            if (this.movePossible(row, col, to)) {
                this.curPiece_row = row;
                this.curPiece_col = col;
                this.curPiece_rotation = to;
                this.lastKick = dir === 2 ? -1 : k; // the T-spin upgrade is for SRS's 1-by-2 kick only
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
        const k = this.big ? this.bigMove : 1; // big pieces kick two cells
        const at = (dr, dc) => this.movePossible(this.curPiece_row + k * dr, this.curPiece_col + k * dc, to) ? [k * dr, k * dc] : null;

        let kick = at(0, 0);
        let floorKick = false;
        if (!kick) {
            if (type === tetI) {
                if (this.plainArs) {
                    // no kicks
                } else if (to === 0 || to === 2) {
                    // wall kicks into horizontal, only for an I touching a wall or the stack beside it
                    // (tetris.wiki, Cambridge)
                    const row = this.curPiece_row, col = this.curPiece_col;
                    if (!this.movePossible(row, col - k, from) || !this.movePossible(row, col + k, from)) {
                        kick = at(0, -1) || at(0, 1) || at(0, 2);
                    }
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
        this.onMoveReset(true); // move reset rules (ACE's ARS); TGM's step reset ignores it
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
        const step = this.big ? this.bigMove * dir : dir;
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

    // Soft drop held, and the piece may soft drop this frame
    softHeld() {
        return this.held.soft && !this.entering;
    }

    // A soft drop faster than gravity that brings the piece down onto the stack is a landing
    // (softLandings, the engine's knock)
    applyGravity() {
        const soft = this.softHeld();
        if (soft) this.softFrames++;
        else this.softRows = 0;
        this.gravityAcc += soft ? this.softGravity : this.gravity;
        while (this.gravityAcc >= 1) {
            if (!this.canFall()) { this.gravityAcc = 0; break; }
            this.curPiece_row++;
            this.gravityAcc -= 1;
            if (soft) {
                this.score += this.softDropPoints;
                if (this.softGravity > this.gravity) this.softRows++;
            }
            this.onFall();
        }
        if (this.softRows && !this.canFall()) {
            this.softLandings.push(this.softRows);
            this.softRows = 0;
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
        this.sonicDistance = distance; // for the engine's knock (sonicTrail)
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
        this.hardDropped = true;
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
            this.setCell(cell.row, cell.col, this.hitting("HARD BLOCK") ? type | HARD_BIT : type);
            if (this.itemCells) this.itemCells[cell.row - FIELD_TOP][cell.col] = this.pieceItem;
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

        // Find and empty full rows. Hard Block: a full row with shell blocks only loses its other blocks,
        // the shells break (blocks again) and the row stays (shellRows; Heboris)
        const rows = [];
        this.clearedRows = [];
        this.shellRows = [];
        for (let r = FIELD_TOP; r < HEIGHT; r++) {
            const line = this.field[r - FIELD_TOP];
            if (line.every(v => v !== 0)) {
                const shell = line.some(v => v & HARD_BIT);
                if (shell) this.shellRows.push(r);
                else {
                    rows.push(r);
                    this.clearedRows.push(line.slice());
                }
                for (let c = 0; c < WIDTH; c++) {
                    if (line[c] & HARD_BIT) {
                        line[c] &= ~HARD_BIT;
                        continue;
                    }
                    this.clearedCells.push({ row: r, col: c, type: line[c] });
                    line[c] = 0;
                }
            }
        }
        const full = rows.length + this.shellRows.length;
        const n = this.big ? full >> 1 : full; // big: two rows make a line (NullpoMino)
        this.chain = n > 0 ? this.chain + 1 : -1;
        if (n > 0) this.sounds.push("clear" + n + (this.chain > 0 ? "c" + this.chain : "")); // e.g. "clear2c3"

        // the items the clear took (a shell row's too), then the marks of the blocks a shell row lost
        this.collectItems([...rows, ...this.shellRows]);
        if (this.itemCells) {
            for (const r of this.shellRows) {
                const marks = this.itemCells[r - FIELD_TOP], line = this.field[r - FIELD_TOP];
                for (let c = 0; c < WIDTH; c++) if (!line[c]) marks[c] = null;
            }
        }
        this.scoreClear(n, rows);
        if (this.gameover) return;
        if (this.itemsAtClear) this.fireItems(true);
        // The other side's items and versus garbage come now after a lock that fills no rows, else once
        // the clear is done (afterClear): a big piece filling one row clears nothing (n 0) but its row
        // still collapses, so rising garbage before that would move the rows under the collapse
        if (full === 0) this.takeItems();
        if (this.gameover) return;
        const risen = full === 0 ? this.riseAfterLock(n) : 0; // versus garbage pushes the stack up
        if (this.gameover) return;

        const collapseNow = full > 0 && this.lineClearDelay === 0;
        if (fromHardDrop) {
            for (const cell of cells) {
                // cleared cells keep the row they landed in, for the drop trail (there's no block to flash)
                const cleared = rows.includes(cell.row) || (this.shellRows.includes(cell.row) && !this.getCell(cell.row, cell.col));
                const below = collapseNow && !cleared ? rows.filter(r => r > cell.row).length : 0;
                this.hardDropCells.push({ row: cell.row + below - risen, col: cell.col, type, dist: this.hardDropDistance, cleared });
            }
        }

        if (full === 0) {
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
    // After scoreClear: rows of versus garbage that rose (after a clear: afterClear)
    riseAfterLock(n) { return this.garbageEveryLock && n === 0 ? this.riseGarbage() : 0; }

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
        if (this.itemCells) this.itemCells = this.dropRows(this.itemCells, rows, () => new Array(WIDTH).fill(null));
        this.onCollapse(rows);
    }

    // A per-row list without the cleared rows, refilled at the top with fill()
    dropRows(list, rows, fill) {
        const kept = list.filter((_, i) => !rows.includes(i + FIELD_TOP));
        while (kept.length < list.length) kept.unshift(fill());
        return kept;
    }

    onCollapse(rows) {} // per-row data the rule set keeps falls with the field

    // After a line clear: the items it set off and those the other side sent, versus garbage (where
    // it rises after every lock), then the next piece
    afterClear() {
        this.fireItems();
        this.takeItems();
        if (this.garbageEveryLock) this.riseGarbage();
        if (this.gameover) return;
        this.startAre(this.lineAre);
    }

    // ----------------------------------------------------------
    // Versus

    // How the match stands for this side: "win", "lose", "draw", or null while it goes on. By
    // default the first side to top out loses (both on one frame: a draw)
    versusOutcome() {
        const other = this.rival;
        if (this.gameover && other.gameover) return "draw";
        if (this.gameover) return "lose";
        if (other.gameover) return "win";
        return null;
    }

    // The other side's attack: lines of garbage, either all with their hole in column `hole`
    // (Guideline) or the rows given, top first (TGM3). It waits for the rule set's moment to rise
    // (riseAfterLock), at most maxIncoming() rows of it. Or an item (receiveItem)
    receiveGarbage(attack) {
        if (attack.item) {
            if (this.itemsOn && !this.gameover) this.receiveItem(attack.item);
            return;
        }
        if (!this.sendsGarbage || this.gameover || attack.lines <= 0) return;
        const room = this.maxIncoming() - this.pendingGarbage();
        if (room <= 0) return;
        if (attack.lines > room) {
            attack = attack.rows ? { lines: room, rows: attack.rows.slice(0, room) } : { ...attack, lines: room };
        }
        (this.mirrorPieces > 0 ? this.mirrorGarbage : this.incoming).push(attack);
    }

    maxIncoming() { return Infinity; } // rows of garbage that may wait

    pendingGarbage() {
        return [...this.incoming, ...this.mirrorGarbage].reduce((sum, g) => sum + g.lines, 0);
    }

    garbageReady(g) { return true; } // an attack waiting may rise (the Guideline's Garbage delay card)

    // Rows of the garbage waiting that may rise now: the ready attacks from the oldest
    readyGarbage() {
        let rows = 0;
        for (const g of this.incoming) {
            if (!this.garbageReady(g)) break;
            rows += g.lines;
        }
        return rows;
    }

    // Lines sent since the last call, one entry per clear
    takeAttacks() {
        return this.drain("attacks");
    }

    // Garbage rows that rose since the last call, one entry per lock
    takeRisenGarbage() {
        return this.drain("risen");
    }

    // An attack for the other side
    sendAttack(attack) {
        this.attacks.push(attack);
        this.linesSent += attack.lines;
    }

    // All the garbage waiting rises from the bottom, oldest highest, pushing the stack up; blocks
    // pushed above the highest row the field keeps blocks in (TGM: the buffer row; GB: the well's
    // top) top this side out (garbageTopsOut: the Guideline), else they are lost (tetris.wiki on TAP:
    // what "would otherwise have occupied rows 22+ is forgotten"; Heboris). entries: the attacks that rise (by
    // default all of them, taken from incoming). Returns the number of rows.
    riseGarbage(entries = this.incoming.splice(0)) {
        const top = Math.max(this.pieceTop, this.bufferTop ?? FIELD_TOP);
        let rows = 0, toppedOut = false;
        for (const g of entries) {
            for (let k = 0; k < g.lines; k++) {
                if (this.field[top - FIELD_TOP].some(v => v !== 0)) toppedOut = true;
                let row;
                if (g.rows) row = g.rows[k].slice();
                else {
                    row = new Array(WIDTH).fill(tetGARBAGE);
                    row[g.hole] = 0;
                }
                this.raiseRow(row);
                rows++;
            }
        }
        if (!rows) return 0;
        this.risen.push(rows);
        this.sounds.push("garbage");
        if (toppedOut && this.garbageTopsOut) this.endGame("GAME OVER", "TOP OUT — ESC FOR MENU");
        else if (toppedOut) for (let r = 0; r < top - FIELD_TOP; r++) this.field[r].fill(0);
        return rows;
    }

    // ----------------------------------------------------------
    // Items

    // The next item from the round's bag, by weight without replacement (refilled when empty)
    drawItem() {
        if (!this.itemBag.length) this.itemBag = [...this.itemSet];
        let x = this.random() * this.itemBag.reduce((sum, item) => sum + VS_ITEMS[item].weight, 0), k = 0;
        while (k < this.itemBag.length - 1 && (x -= VS_ITEMS[this.itemBag[k]].weight) >= 0) k++;
        return this.itemBag.splice(k, 1)[0];
    }

    // A line clear that takes item blocks sets off the highest (the rightmost in its row) after the
    // clear (fireItems); every other item block in the field becomes a normal one. The item blocks the
    // clear took burst (itemBursts, for the engine)
    collectItems(rows) {
        if (!this.itemCells) return;
        let item = null;
        for (const r of rows) {
            for (let c = WIDTH - 1; c >= 0 && !item; c--) item = this.itemCells[r - FIELD_TOP][c];
            if (item) break;
        }
        if (!item) return;
        for (const r of rows) {
            this.itemCells[r - FIELD_TOP].forEach((block, col) => {
                if (block) this.itemBursts.push({ row: r, col, item: block });
            });
        }
        this.firingItems.push(item);
        for (const marks of this.itemCells) marks.fill(null);
        if (this.itemsOn) this.nextItem = null; // the one in the preview too (the guide)
    }

    // The items a clear set off take effect; attacksOnly: only those for the other side (TGM3's go at
    // once, the rest after the clear). The side's own items wait while its attack is active.
    fireItems(attacksOnly = false) {
        const fire = this.firingItems.filter(item => !attacksOnly || VS_ITEMS[item].attack);
        this.firingItems = this.firingItems.filter(item => !fire.includes(item));
        for (const item of fire) {
            if (this.itemWaits(item)) this.waitingItems.push(item);
            else this.useItem(item);
        }
    }

    // An attack item from the other side: at once, knocking the piece in play out (a snipe), or
    // after the line clear running (takeItems); the side stands still for its cut-in. A new attack
    // ends the last one's effects (Heboris).
    receiveItem(item) {
        if (this.phase === "lineclear" || this.phase === "rollstart") {
            this.incomingItems.push(item);
            return;
        }
        this.knockOut();
        this.useItem(item, true);
    }

    // The piece in play leaves without locking, the next to come after an ARE (a snipe, the debug menu)
    knockOut() {
        if (this.phase !== "active" || !this.curPiece_type) return;
        this.curPiece_type = 0;
        this.shadowRow = -100;
        this.pieceItem = null;
        this.setPhase("are", this.are);
    }

    // An attack item hits this side: its cut-in, the end of the effects of the last one
    hitBy(item) {
        this.itemEffects = {};
        this.itemTimers = {};
        this.mirrorPieces = 0;
        this.incoming.push(...this.mirrorGarbage.splice(0));
        this.cutIn = VS_CUTIN_FRAMES;
        this.cutInItem = item;
        const { pieces, frames } = VS_ITEMS[item];
        if (pieces) this.itemEffects[item] = pieces;
        if (frames) this.itemTimers[item] = frames;
    }

    // An own item set off now waits: while this side's attack is active, and Exchg Field also while the
    // other side's is (the guide: "it will not go through until all currently active items are resolved")
    itemWaits(item) {
        if (VS_ITEMS[item].attack) return false;
        return this.attacking() || (!!VS_ITEMS[item].neutral && this.attackActive());
    }

    // An attack item lasts on this side (pieces or frames left)
    hitting(item) {
        return this.itemEffects[item] > 0 || this.itemTimers[item] > 0;
    }

    // An attack item is active on this side: its cut-in, Mirror Block's flips, or the pieces or
    // frames it lasts (not those of a brief one)
    attackActive() {
        if (this.cutIn > 0 || this.mirrorPieces > 0 || this.frames - this.mirroredAt < VS_MIRROR_FRAMES) return true;
        return Object.keys(VS_ITEMS).some(item => !VS_ITEMS[item].brief && this.hitting(item));
    }

    // This side's attack item is active on the other side
    attacking() {
        return !!this.rival && this.rival.attackActive();
    }

    // After a lock (a clear's: once it has collapsed): Mirror Block turning the field and the lasting
    // items counting the piece, then the items the other side sent during the clear (they start
    // whole: the lock just made doesn't count against them), and the side's own items once its attack
    // is over
    takeItems() {
        if (this.mirrorPieces > 0) {
            this.mirrorPieces--;
            if (this.fieldEmpty()) this.mirrorPieces = 0; // a perfect clear ends it (the guide)
            else this.mirrorField();
        }
        // garbage sent during Mirror Block comes once it ends (the guide)
        if (!this.mirrorPieces && this.mirrorGarbage.length) this.incoming.push(...this.mirrorGarbage.splice(0));
        for (const item in this.itemEffects) if (this.itemEffects[item] > 0) this.itemEffects[item]--;
        for (const item of this.incomingItems.splice(0)) this.useItem(item, true);
        const ready = this.waitingItems.filter(item => !this.itemWaits(item));
        this.waitingItems = this.waitingItems.filter(item => !ready.includes(item));
        for (const item of ready) this.useItem(item);
    }

    // Items in a match (the Items card): dealt every VS_ITEM_LINES lines, their blocks marked
    useItems() {
        this.itemsOn = true;
        if (!this.itemCells) this.itemCells = this.field.map(() => new Array(WIDTH).fill(null));
    }

    random() {
        return this.rng ? this.rng() : Math.random();
    }

    // Garbage and items from the match's seed, the same on both sides
    seedVersus(seed) {
        const lcg = new LcgRandomizer((seed ^ 0x9e3779b9) >>> 0, null);
        this.rng = () => lcg.rand(0x8000) / 0x8000;
    }

    // An item takes effect. Set off here, one for the other side goes to it (sent with the attacks);
    // received: from the other side. Free Fall drops every block down its column (the rows it fills
    // clear, and in versus 2 or more of them go to the other side as garbage with one hole, tetris.wiki
    // and Heboris), Del Even deletes every other row from the bottom (the second, fourth, ...), the Del
    // Fields the upper or lower half of the stack, the Mov Fields push every row's blocks to a wall;
    // Mirror Block turns the other side's field left to right now and after each of its next pieces,
    // Shotgun! shoots at a random cell in each of its rows, Laser deletes a column, Nega Field turns the
    // stack's blocks to holes and its holes to blocks, 180° Field turns the stack upside down (rows only).
    // The Del Fields take half the stack's rows, rounded up (the guide). Blocks of
    // another item piece keep their item as they move; those an item removes take it with them. Rows
    // an item fills clear at once, without score or lines (only the player's clears set items off).
    useItem(item, received = false) {
        this.sounds.push("zap");
        if (!received || !VS_ITEMS[item].attack) this.addAction(item, "grade"); // a hit one has its cut-in
        if (!received && VS_ITEMS[item].attack) {
            this.sendAttack({ lines: 0, item });
            return;
        }
        if (VS_ITEMS[item].attack) this.hitBy(item);
        const top = this.stackTop() - FIELD_TOP; // the stack's rows: top to the end of the field
        const empty = [0, null];
        switch (item) {
            case "FREE FALL": {
                this.remapField(grid => {
                    for (let c = 0; c < WIDTH; c++) {
                        const blocks = grid.map(row => row[c]).filter(([type]) => type);
                        for (let r = grid.length - 1; r >= 0; r--) grid[r][c] = blocks.length ? blocks.pop() : empty;
                    }
                    return grid;
                });
                const n = this.clearFullRows();
                if (this.versus && this.sendsGarbage && n >= 2 && !received) { // garbage in random colours, one hole
                    const hole = Math.floor(this.random() * WIDTH);
                    const row = () => Array.from({ length: WIDTH }, (_, c) => c === hole ? 0 : 1 + Math.floor(this.random() * 7));
                    this.sendAttack({ lines: n, rows: Array.from({ length: n }, row) });
                }
                break;
            }
            case "← MOV FIELD": case "→ MOV FIELD": {
                const left = item === "← MOV FIELD";
                this.remapField(grid => grid.map(row => {
                    const blocks = row.filter(([type]) => type), gap = Array.from({ length: WIDTH - blocks.length }, () => empty);
                    return left ? [...blocks, ...gap] : [...gap, ...blocks];
                }));
                break;
            }
            case "DEL EVEN": {
                const rows = [];
                for (let r = HEIGHT - 2; r >= FIELD_TOP; r -= 2) rows.push(r);
                this.deleteRows(rows.reverse());
                break;
            }
            case "↑ DEL FIELD": case "↓ DEL FIELD": {
                const h = this.field.length - top, rows = [];
                const [from, to] = item === "↑ DEL FIELD" ? [top, top + Math.ceil(h / 2)] : [this.field.length - Math.ceil(h / 2), this.field.length];
                for (let r = from; r < to; r++) rows.push(r + FIELD_TOP);
                this.deleteRows(rows);
                break;
            }
            case "MIRROR BLOCK":
                this.mirrorField();
                this.flipWait = 0; // the cut-in covers the first turn
                this.mirrorPieces = VS_MIRROR_PIECES - 1;
                break;
            case "SHOTGUN!": // a column picked at random in every row of the stack: an empty cell is a miss
                this.remapField(grid => grid.map((row, r) => {
                    const c = Math.floor(this.random() * WIDTH);
                    if (r >= top) row[c] = empty;
                    return row;
                }));
                break;
            case "LASER": {
                const col = Math.floor(this.random() * WIDTH);
                this.remapField(grid => grid.map(row => { row[col] = empty; return row; }));
                break;
            }
            case "NEGA FIELD":
                this.remapField(grid => grid.map((row, r) => r < top ? row : row.map(([type]) => type ? empty : [tetGARBAGE, null])));
                this.clearFullRows();
                break;
            case "180° FIELD":
                this.remapField(grid => [...grid.slice(0, top), ...grid.slice(top).reverse()]); // the top row swaps with the bottom one
                break;
            case "EXCHG FIELD":
                if (!received) this.sendAttack({ lines: 0, item }); // the swap is made on the other side
                else if (this.rival.phase === "lineclear" || this.rival.phase === "rollstart") this.incomingItems.push(item); // after its clear
                else this.exchangeFields();
                break;
        }
        this.setShadow();
    }

    // Exchg Field, on the side it hits: the two fields swap. This side keeps its item blocks where they
    // were, over the field it gets, and they reach the other side as normal blocks (the guide); a piece in
    // play on the other side that no longer fits is knocked out like a snipe. This side stands still for
    // the cut-in.
    exchangeFields() {
        const other = this.rival, kept = [];
        if (this.itemCells) this.itemCells.forEach((row, r) => row.forEach((item, c) => {
            if (item && this.field[r][c]) kept.push([r, c, this.field[r][c], item]);
        }));
        [this.field, other.field] = [other.field, this.field];
        for (const game of [this, other]) if (game.itemCells) game.itemCells = game.field.map(() => new Array(WIDTH).fill(null));
        for (const [r, c, type, item] of kept) {
            this.field[r][c] = type;
            this.itemCells[r][c] = item;
        }
        if (other.curPiece_type && !other.movePossible(other.curPiece_row, other.curPiece_col, other.curPiece_rotation)) other.knockOut();
        other.setShadow();
        this.hitBy("EXCHG FIELD");
    }

    // The highest row with a block (the end of the field when empty)
    stackTop() {
        let r = 0;
        while (r < this.field.length && this.field[r].every(v => !v)) r++;
        return r + FIELD_TOP;
    }

    // Mirror Block turns the field left to right, animated (mirrorAlpha) while the next ARE waits for it
    mirrorField() {
        this.remapField(grid => grid.map(row => row.reverse()));
        this.mirroredAt = this.frames;
        this.flipWait = VS_MIRROR_FRAMES;
    }

    // The field just turned by Mirror Block: dark, then its columns back one at a time from the right
    // (the left one's blocks first, mirrored; Heboris)
    mirrorAlpha(col) {
        const age = this.frames - this.mirroredAt;
        if (age >= VS_MIRROR_FRAMES) return 1;
        return age >= VS_MIRROR_DARK + (WIDTH - 1 - col) * VS_MIRROR_COLUMN ? 1 : 0;
    }

    // The field as [type, item] cells (rows from the top of the buffer), rewritten by fn and put back
    remapField(fn) {
        const grid = this.field.map((row, r) => row.map((type, c) => [type, this.itemCells ? this.itemCells[r][c] : null]));
        fn(grid).forEach((row, r) => row.forEach(([type, item], c) => {
            this.field[r][c] = type;
            if (this.itemCells) this.itemCells[r][c] = type ? item : null;
        }));
    }

    // Rows an item deletes: their blocks burst, the stack above falls
    deleteRows(rows) {
        for (const r of rows) {
            for (let c = 0; c < WIDTH; c++) {
                const type = this.getCell(r, c) & ~HARD_BIT;
                if (type) this.clearedCells.push({ row: r, col: c, type });
            }
        }
        this.collapse(rows);
    }

    // Rows an item filled clear at once; returns how many
    clearFullRows() {
        const full = [];
        for (let r = FIELD_TOP; r < HEIGHT; r++) if (this.field[r - FIELD_TOP].every(v => v !== 0)) full.push(r);
        this.deleteRows(full);
        return full.length;
    }

    // Hidden test setups (the engine's Ctrl+Shift+digit keys); TGM only. Returns whether one applied.
    testSetup(name) {
        return false;
    }

    // ----------------------------------------------------------
    // Debug menu (the engine's, with ?debug=1): states otherwise hard to reach or left to chance

    // The setups the game has now, its mode's first: { id, values, labels, current } (values: what
    // debugSetup() takes, labels: how the menu shows them, current: the one chosen at first)
    debugSetups() {
        if (this.gameover) return [];
        const setups = this.modeSetups();
        const levels = this.debugLevels();
        if (levels) {
            let current = 0;
            while (current + 1 < levels.length && levels[current + 1] <= this.level) current++;
            setups.push({ id: "level", values: levels, labels: this.debugLevelLabels(levels), current });
        }
        setups.push({ id: "next", values: DEBUG_PIECES, labels: DEBUG_PIECE_LABELS },
            { id: "field", values: DEBUG_FIELD_IDS, labels: DEBUG_FIELD_LABELS },
            { id: "gravity", values: [true, false], labels: ["Normal", "Off"], current: this.debugGravity ? 0 : 1 });
        if (this.versus && this.sendsGarbage) {
            setups.push({ id: "garbage", values: DEBUG_GARBAGE }, { id: "garbagerival", values: DEBUG_GARBAGE });
        }
        if (!this.versus) setups.push({ id: "end", values: ["over", "complete"], labels: ["Game over", "Complete"] });
        return setups;
    }

    modeSetups() { return []; } // the rule set's and mode's own setups (debugSetups)
    debugLevels() { return null; } // the levels the debug menu can jump to (none: no such entry)
    debugLevelLabels(levels) { return levels.map(String); }
    debugLevel(level) { return false; } // jump to a level, at its speed
    onDebugField() {} // the debug menu set the field (debugField)

    // Applies a setup (one of debugSetups()) with one of its values; returns whether it could. The game
    // then sets no record (tested)
    debugSetup(id, value) {
        if (this.gameover || !this.applyDebug(id, value)) return false;
        this.tested = true;
        return true;
    }

    applyDebug(id, value) {
        switch (id) {
            case "level": return this.debugLevel(value);
            case "next": this.queue[0] = value; return true;
            case "field": return this.debugField(value);
            case "gravity":
                this.debugGravity = value;
                this.updateTimings();
                return true;
            case "garbage": case "garbagerival": {
                const side = id === "garbage" ? this : this.rival;
                if (!side || side.gameover) return false;
                // not from the match's generator: both sides' items would no longer come alike
                side.receiveGarbage({ lines: value, hole: Math.floor(Math.random() * WIDTH) });
                return true;
            }
            case "end":
                this.curPiece_type = 0;
                this.shadowRow = -100;
                if (value === "complete") this.endGame("COMPLETE", this.formatTime());
                else this.endGame("GAME OVER", "DEBUG — ESC FOR MENU");
                return true;
        }
        return this.testSetup(id);
    }

    // A preset field (DEBUG_FIELDS; "top": every row of the well but the top three, with a hole each),
    // blocks in random colours; the piece in play goes and the one the field needs comes next
    debugField(kind) {
        if (this.phase === "rollstart" || this.phase === "stageend") return false;
        const rows = kind !== "top" ? DEBUG_FIELDS[kind] : Array.from({ length: HEIGHT - this.wellTop - 3 }, () => {
            const hole = Math.floor(Math.random() * WIDTH);
            return Array.from({ length: WIDTH }, (_, c) => c === hole ? "." : "X").join("");
        });
        for (const row of this.field) row.fill(0);
        if (this.itemCells) for (const marks of this.itemCells) marks.fill(null);
        rows.forEach((line, k) => [...line].forEach((ch, c) => {
            if (ch === "X") this.setCell(HEIGHT - rows.length + k, c, 1 + Math.floor(Math.random() * 7));
        }));
        this.pendingRows = []; // a line clear running clears nothing more
        this.knockOut();
        if (DEBUG_FIELD_PIECES[kind]) this.queue.unshift(DEBUG_FIELD_PIECES[kind]);
        this.onDebugField();
        this.setShadow();
        return true;
    }
}
