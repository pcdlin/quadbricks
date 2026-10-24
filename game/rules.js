// Modern rule sets for the web port, selectable next to the original modes:
//
//  - Guideline: Tetris Guideline with SRS: endless, 150-line marathon, 40-line sprint, 2-minute ultra
//    (tetris.wiki: Tetris_Guideline, Super_Rotation_System, Marathon, Scoring, T-Spin)
//  - Arika: Tetris The Grand Master 3 Terror-Instinct, Master mode, World rule
//    (tetris.wiki: Tetris_The_Grand_Master_3_Terror-Instinct, Heboris_Unofficial_Expansion,
//     randomizer from the wiki TGM_randomizer page, checked against the arcade sequence)
//  - Classic: the same TGM3 Master mode with the Classic rule: Arika Rotation System
//    with TGM3's I and T kicks, sonic drop, locking soft drop, step reset, Sega colours
//    (tetris.wiki: Arika_Rotation_System; kick order as in NullpoMino's ClassicPlusWallkick)
//  - both TGM3 rules end with the staff roll (fading, or invisible with all COOLs), which can
//    earn Grand Master, and speed up to 20G after 15 minutes (timings from NullpoMino's
//    GradeMania3Mode)
//  - TAP: Tetris The Absolute The Grand Master 2 PLUS, Master mode (grades 9 to GM, fading roll
//    or M-roll) and Death mode (20G, M at level 500, GM at 999): plain ARS without TGM3's kicks,
//    sonic drop, no hold, one next piece, TGM2 randomizer
//    (tetris.wiki: Tetris_The_Absolute_The_Grand_Master_2_PLUS, Grade_Recognition_System,
//     TGM_randomizer; randomizer as TGM3's; roll length from
//     NullpoMino's GradeMania2Mode)
//  - GB: Tetris for the Game Boy (1989), A-Type (endless, levels 0-20) and B-Type (25 lines over
//    garbage): left-handed Nintendo Rotation System without kicks, no hard drop, no hold, no lock
//    delay, one next piece, the Game Boy's randomizer with its OR bug
//    (tetris.wiki: Tetris_(Game_Boy), Nintendo_Rotation_System; randomizer from TASVideos
//     submission 4536 and the game's disassembly)
//
// Each rule set has these variants, taken over from the original modes:
//  - standard: the rule set as specified
//  - test:     no gravity (soft and hard drop still work)
//  - death:    constant 20G, no ghost piece (TAP: its own Death mode, see below)
//  - marathon: Guideline only: the game ends after 150 lines (standard is endless)
//  - sprint:   Guideline only: 40 lines as fast as possible, fixed level 1
//  - ultra:    Guideline only: highest score in 2 minutes, fixed level 1
//  - btype:    GB only: B-Type, 25 lines starting over rows of garbage
//
// RuleGame is driven by the engine one frame at a time (advanceFrame with an input
// bitmap) and read through getCell, getCurPiece_*, takeClearedCells, getStats, ...
// Row coordinates: visible rows are 2..21; rows above are the buffer zone.

const guideline = 3, arika = 4, tgmClassic = 5, tgmTap = 6, gameBoy = 7;
// Shown under the rule set name; standard is named after the rule set instead (see getStats)
const VARIANT_NAMES = { test: "TEST", death: "DEATH", marathon: "MARATHON", sprint: "SPRINT", ultra: "ULTRA", btype: "B-TYPE" };

const FIELD_TOP = -18;  // Guideline: 20 visible rows + 20-row buffer
const TGM_BUFFER_TOP = 1; // TGM3 and TAP: one buffer row, blocks locking above it are deleted

// Start countdown 3, 2, 1, half a second each; the frame after it is the first to take input
const COUNTDOWN_STEPS = 3, COUNTDOWN_STEP_FRAMES = 30;

// Rows per frame the stack falls into cleared rows during a line clear delay (presentation)
const LINE_DROP_SPEED = 0.5;
// Frames the stack waits before it falls, so the clear's confetti and flash show first; shortened
// when the delay is too short to fit the whole fall after it (the delay itself never changes)
const LINE_DROP_PAUSE = 12;

// Clear messages by number of lines
const CLEAR_NAMES = ["", "SINGLE", "DOUBLE", "TRIPLE", "QUAD"];

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

// Arika SRS (TGM3 World rule / TGM Ace): modified I kicks, same JLSTZ data
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

// ----------------------------------------------------------
// Arika Rotation System (Classic rule)

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
const ARS_I_FLOOR_KICKS = 1, ARS_T_FLOOR_KICKS = 2; // TGM3 limits per piece

// Colour of each piece type, as an index into the engine's palette (cyan, purple, orange,
// blue, green, red, yellow). Classic uses the Sega/Arika colours.
const DEFAULT_PALETTE = [0, 1, 2, 3, 4, 5, 6, 7];
const ARS_PALETTE = [0, 6, 1, 3, 4, 2, 5, 7]; // I red, T cyan, L orange, J blue, S purple, Z green, O yellow

// ----------------------------------------------------------
// Guideline timing

// Seconds per row: (0.8 - (level-1) * 0.007) ^ (level-1); returned as rows per frame
function guidelineGravity(level) {
    const seconds = Math.pow(0.8 - (level - 1) * 0.007, level - 1);
    return 1 / (seconds * 60);
}

const GUIDELINE_MAX_LEVEL = 15;  // level cap; endless play continues at level 15 speed
const GUIDELINE_LINES_PER_LEVEL = 10; // fixed goal
const GUIDELINE_LINE_GOALS = { marathon: 150, sprint: 40 }; // variants that end on a number of lines
const GUIDELINE_ULTRA_FRAMES = 2 * 60 * 60; // the ultra variant ends after two minutes
const GUIDELINE_FIXED_LEVEL = ["sprint", "ultra"]; // variants that stay at level 1
const GUIDELINE_LOCK_DELAY = 30; // 0.5 s
const GUIDELINE_MOVE_LIMIT = 15; // move reset limit
const GUIDELINE_DAS = 10, GUIDELINE_ARR = 2, GUIDELINE_ARE = 6; // recommended handling
const GUIDELINE_NEXT = 6; // the Guideline allows up to six previews
const GUIDELINE_SOFT_FACTOR = 20; // soft drop = 20x gravity
// Player handling for the Guideline (Options → Guideline), the recommended values by default.
// das, arr: frames (arr 0 shifts straight to the wall); sdf: soft drop factor (Infinity: 20G);
// dcd: frames a charged auto-shift pauses after a rotation or a new piece; ghost: ghost piece shown;
// dropGuard: hard drops in a piece's first GUIDELINE_DROP_GUARD frames are ignored
const GUIDELINE_HANDLING = { das: GUIDELINE_DAS, arr: GUIDELINE_ARR, sdf: GUIDELINE_SOFT_FACTOR, dcd: 0, ghost: true, dropGuard: false };
const GUIDELINE_DROP_GUARD = 8;

// ----------------------------------------------------------
// TGM3 Master timing

// Gravity in 1/65536 G: [from level, value]
const TGM_GRAVITY = [
    [0, 1024], [30, 1536], [35, 2048], [40, 2560], [50, 3072], [60, 4096], [70, 8192],
    [80, 12288], [90, 16384], [100, 20480], [120, 24576], [140, 28672], [160, 32768],
    [170, 36864], [200, 1024], [220, 8192], [230, 16384], [233, 24576], [236, 32768],
    [239, 40960], [243, 49152], [247, 57344], [251, 65536], [300, 131072], [330, 196608],
    [360, 262144], [400, 327680], [420, 262144], [450, 196608], [500, 1310720],
];

// [from speed level, ARE, line ARE, DAS, lock delay, line clear delay] in frames.
// COOLs put the speed level up to 900 above the level, hence the rows past 999.
const TGM_DELAYS = [
    [0, 27, 27, 16, 30, 40],
    [500, 27, 27, 10, 30, 25],
    [600, 27, 18, 10, 30, 16],
    [700, 18, 14, 10, 30, 12],
    [800, 14, 8, 10, 30, 6],
    [900, 14, 8, 8, 17, 6],
    [1000, 8, 8, 8, 17, 6],
    [1100, 7, 7, 8, 15, 6],
    [1200, 6, 6, 8, 15, 6],
];

const TGM_LEVEL_FOR_LINES = [0, 1, 2, 4, 6]; // Master: triple +4, tetris +6
const TGM_MAX_LEVEL = 999;
const TGM_TORIKAN_LEVEL = 500, TGM_TORIKAN_FRAMES = 7 * 60 * 60; // ends at 500 if slower than 7:00
const TGM_GHOST_UNTIL = 100; // ghost piece shown below level 100
const TGM_ROTATION_RESETS = 8, TGM_MOVE_RESETS = 10; // World rule move reset limits
const TGM_SPAWN_ROW = 2; // spawn in the top visible rows
const TGM_NEXT = 3; // TGM3 shows three next pieces
// After 15 minutes the game speeds up to keep players from playing too long:
// 20G, [ARE, line ARE, DAS, lock delay, line clear delay] as in NullpoMino's TGM3 mode
const TGM_KILL_FRAMES = 15 * 60 * 60, TGM_KILL_DELAYS = [2, 1, 5, 13, 3];

// Staff roll after level 999: the field clears one row every ROLL_ROW_FRAMES from the bottom,
// then play goes on for ROLL_FRAMES with blocks hiding after they lock. Fading roll: they fade
// out over FADE_FRAMES and are gone 5 s after locking; invisible roll: gone at once.
const TGM_ROLL_FRAMES = 3238;
const TGM_ROLL_ROW_FRAMES = 6;
const TGM_ROLL_HIDE = { fading: 300, invisible: 2 }; // frames after locking
const TGM_ROLL_FADE_FRAMES = 10;
const TGM_INVISIBLE_COOLS = 9, TGM_INVISIBLE_GRADE = 27; // all COOLs and internal grade 27 for the invisible roll
// Roll grade points in hundredths of a grade, per 1-4 lines, and for surviving the roll
const TGM_ROLL_POINTS = { fading: [0, 4, 8, 12, 26], invisible: [0, 10, 20, 30, 100] };
const TGM_ROLL_CLEAR = { fading: 50, invisible: 160 };

// Hidden test setups (testSetup): how close to the end of the roll and to 15:00 they jump
const TEST_ROLL_LEAD = 5 * 60, TEST_KILL_LEAD = 10 * 60;
const TEST_GM_ROLL_POINTS = 440; // 17 boosts + 9 COOLs + 4.4, surviving the roll's 1.6 makes 32

// ----------------------------------------------------------
// TGM3 grading (Master mode)

// Per internal grade: [displayed-grade boosts, decay frames, points for 1, 2, 3, 4 lines]
const TGM_GRADES = [
    [0, 125, 10, 20, 40, 50], [1, 80, 10, 20, 30, 40], [2, 80, 10, 20, 30, 40],
    [3, 50, 10, 15, 30, 40], [4, 45, 10, 15, 20, 40], [5, 45, 5, 15, 20, 30],
    [5, 45, 5, 10, 20, 30], [6, 40, 5, 10, 15, 30], [6, 40, 5, 10, 15, 30],
    [7, 40, 5, 10, 15, 30], [7, 40, 2, 12, 13, 30], [7, 40, 2, 12, 13, 30],
    [8, 30, 2, 12, 13, 30], [8, 30, 2, 12, 13, 30], [8, 30, 2, 12, 13, 30],
    [9, 20, 2, 12, 13, 30], [9, 20, 2, 12, 13, 30], [9, 20, 2, 12, 13, 30],
    [10, 20, 2, 12, 13, 30], [11, 20, 2, 12, 13, 30], [12, 15, 2, 12, 13, 30],
    [12, 15, 2, 12, 13, 30], [12, 15, 2, 12, 13, 30], [13, 15, 2, 12, 13, 30],
    [13, 15, 2, 12, 13, 30], [14, 15, 2, 12, 13, 30], [14, 15, 2, 12, 13, 30],
    [15, 15, 2, 12, 13, 30], [15, 15, 2, 12, 13, 30], [16, 15, 2, 12, 13, 30],
    [16, 10, 2, 12, 13, 30], [17, 10, 2, 12, 13, 30],
];
// Combo multipliers by combo (1..10) for 2, 3 and 4 lines; singles are always x1
const TGM_GRADE_COMBO = [
    [1, 1, 1], [1.2, 1.4, 1.5], [1.2, 1.5, 1.8], [1.4, 1.6, 2.0], [1.4, 1.7, 2.2],
    [1.4, 1.8, 2.3], [1.4, 1.9, 2.4], [1.5, 2.0, 2.5], [1.5, 2.1, 2.6], [2.0, 2.5, 3.0],
];
const TGM_GRADE_LABELS = [
    "9", "8", "7", "6", "5", "4", "3", "2", "1",
    "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9",
    "m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9",
    "Master", "MasterK", "MasterV", "MasterO", "MasterM",
    "Grand Master", // only by surviving the invisible roll (there's no promotion exam here)
];
const TGM_MAX_GRADE = 31; // MasterM: the highest grade before the end of the roll
const TGM_GRADE_POINTS = 100; // points for the next internal grade
// Per 100-level section (seconds): reaching *70 faster than COOL_TIME earns a COOL;
// taking longer than REGRET_TIME for the whole section is a REGRET
const TGM_COOL_TIME = [52, 52, 49, 45, 45, 42, 42, 38, 38];
const TGM_REGRET_TIME = [90, 75, 75, 68, 60, 60, 50, 50, 50, 50];
const TGM_COOL_SLACK = 2; // after a COOL section, the next may reach *70 at most this much slower
const TGM_COOL_SPEEDUP = 100; // a COOL moves the speed level 100 ahead once its section is finished

// ----------------------------------------------------------
// TAP (TGM2 The Absolute Plus): Master and Death modes. Master uses TGM3's gravity and delay
// tables below level 1000 (TGM3 took them from TAP) and the same internal grades (TGM_GRADES).

const TAP_NEXT = 1; // one next piece, and no hold
// [from level, ARE, line ARE, DAS, lock delay, line clear delay] in frames; always 20G
const TAP_DEATH_DELAYS = [
    [0, 18, 14, 12, 30, 12],
    [100, 14, 8, 12, 26, 6],
    [200, 14, 8, 11, 22, 6],
    [300, 8, 8, 10, 18, 6],
    [400, 7, 7, 8, 15, 5],
    [500, 6, 6, 8, 15, 4],
];
// Grade point combo multipliers by combo (1..10) for 1, 2 and 3 lines; Tetrises are always x1
// (TGM3's multipliers, which it applies to 2, 3 and 4 lines)
const TAP_GRADE_COMBO = TGM_GRADE_COMBO;
const TAP_MAX_GRADE = 17; // S9: the highest grade from grade points
// Staff roll: fading in Master (blocks gone 4 s after locking), the invisible M-roll for players
// who qualified, blocks staying visible in Death
const TAP_ROLL_FRAMES = 3694;
const TAP_ROLL_HIDE = { fading: 240, invisible: 2, visible: Infinity };
// M-roll: S9 and at most 8:45 at level 999, plus per section (judged when it ends): the first
// five within 65 s, the sixth at most 2 s slower than their average, each later one at most 2 s
// slower than the one before; and at least this many Tetrises in each section
const TAP_MROLL_FRAMES = 525 * 60;
const TAP_MROLL_SECTION_FRAMES = 65 * 60, TAP_MROLL_SLACK = 2 * 60;
const TAP_MROLL_TETRISES = [2, 2, 2, 2, 2, 1, 1, 1, 1, 0];
const TAP_ORANGE_LINES = 32; // lines cleared in the M-roll for an orange-line GM
// Death: M for reaching level 500 by 3:25.00; later than that the game stops there and the
// credits roll without a grade. GM for reaching 999.
const TAP_DEATH_M_LEVEL = 500, TAP_DEATH_M_FRAMES = 205 * 60;

// ----------------------------------------------------------
// GB (Tetris for the Game Boy, 1989)

// Left-handed Nintendo Rotation System, as drawn on tetris.wiki: T, L and J spawn flat side up and
// turn about the centre of their 3x3 box; S and Z have two states with the vertical one on the left;
// the I lies in the third row and stands in the second column. No kicks.
const GB_SHAPES = parseShapes([
    [["....", "....", "IIII", "...."], [".I..", ".I..", ".I..", ".I.."], ["....", "....", "IIII", "...."], [".I..", ".I..", ".I..", ".I.."]],
    [["....", "TTT.", ".T..", "...."], [".T..", "TT..", ".T..", "...."], [".T..", "TTT.", "....", "...."], [".T..", ".TT.", ".T..", "...."]],
    [["....", "LLL.", "L...", "...."], ["LL..", ".L..", ".L..", "...."], ["..L.", "LLL.", "....", "...."], [".L..", ".L..", ".LL.", "...."]],
    [["....", "JJJ.", "..J.", "...."], [".J..", ".J..", "JJ..", "...."], ["J...", "JJJ.", "....", "...."], [".JJ.", ".J..", ".J..", "...."]],
    [["....", ".SS.", "SS..", "...."], ["S...", "SS..", ".S..", "...."], ["....", ".SS.", "SS..", "...."], ["S...", "SS..", ".S..", "...."]],
    [["....", "ZZ..", ".ZZ.", "...."], [".Z..", "ZZ..", "Z...", "...."], ["....", "ZZ..", ".ZZ.", "...."], [".Z..", "ZZ..", "Z...", "...."]],
    [["....", ".OO.", ".OO.", "...."], ["....", ".OO.", ".OO.", "...."], ["....", ".OO.", ".OO.", "...."], ["....", ".OO.", ".OO.", "...."]],
]);

const GB_WELL_TOP = HEIGHT - 18; // the Game Boy's well is 18 rows high: rows 4-21, nothing above
const GB_SPAWN_ROW = GB_WELL_TOP; // the box at the top: the highest block in the second row
const GB_NEXT = 1; // one next piece, and no hold
// Frames per row by level 0-20 (true values; the ROM stores one less)
const GB_GRAVITY = [53, 49, 45, 41, 37, 33, 28, 22, 17, 11, 10, 9, 8, 7, 6, 6, 5, 5, 4, 4, 3];
const GB_MAX_LEVEL = 20, GB_LINES_PER_LEVEL = 10;
const GB_START_LEVELS = 10; // the player starts at level 0-9
const GB_SOFT_FRAMES = 3; // soft drop: a row every 3 frames
const GB_DAS = 24, GB_ARR = 9;
const GB_ARE = 2, GB_LINE_CLEAR = 91; // ARE 2; ARE and line clear together 93
const GB_LINE_SCORES = [0, 40, 100, 300, 1200]; // x (level + 1)
const GB_MAX_SCORE = 999999;
const GB_B_LINES = 25; // B-Type: 25 lines
const GB_B_HEIGHTS = 6, GB_ROWS_PER_HEIGHT = 2; // B-Type height 0-5: 0 to 10 rows of garbage
const GB_GARBAGE_FILL = 0.5; // chance of a block in each garbage cell

function tableLookup(table, level) {
    let row = table[0];
    for (const r of table) if (level >= r[0]) row = r;
    return row;
}

// ----------------------------------------------------------
// TGM family randomizers, written from the behaviour tetris.wiki describes ("TGM randomizer"):
// a short history of recent pieces, and a piece that is in it is rolled again, a limited number
// of times. Both draw from the arcade's linear congruential generator.

// The arcade generator (the ANSI C rand() recurrence): 15 bits per call. Subclasses deal indices
// into their pieces table (nextIndex()); next() turns them into piece types.
class LcgRandomizer {
    constructor(seed, pieces) {
        this.seed = seed >>> 0;
        this.pieces = pieces;
    }

    rand(n) {
        this.seed = (Math.imul(this.seed, 1103515245) + 12345) >>> 0;
        return ((this.seed >>> 10) & 0x7fff) % n;
    }

    next() {
        return this.pieces[this.nextIndex()];
    }
}

const TI_PIECES = [tetI, tetZ, tetS, tetJ, tetL, tetO, tetT]; // arcade order: I Z S J L O T
const TGM_Z = 1, TGM_S = 2, TGM_O = 5; // indices into TI_PIECES

class TgmRandomizer extends LcgRandomizer {
    constructor(seed) {
        super(seed, TI_PIECES);
    }

    // The first piece of a game is never S, Z or O (it would force an overhang)
    rollFirst() {
        let piece;
        do piece = this.rand(7); while (piece === TGM_S || piece === TGM_Z || piece === TGM_O);
        return piece;
    }
}

// ----------------------------------------------------------
// TGM3 Terror-Instinct randomizer: draws come from a pool of 35 (five of each piece) and are
// checked against the last four pieces dealt. Every slot that is drawn is refilled with the piece
// that has gone longest without being dealt, so droughts stay bounded. The arcade's flaw is kept:
// the "longest drought" search keeps its running maximum across all the refills of one deal, so
// after a rejected draw later refills in that deal reuse the first choice unless a piece is more
// overdue than it.

const TI_POOL = 35, TI_ROLLS = 6;

class TiRandomizer extends TgmRandomizer {
    constructor(seed) {
        super(seed);
        this.pool = [];
        for (let piece = 0; piece < 7; piece++) for (let k = 0; k < 5; k++) this.pool.push(piece);
        this.sinceDealt = new Array(7).fill(4); // deals since each piece was last dealt
        this.recent = [TGM_Z, TGM_Z, TGM_S, TGM_S]; // newest first
        this.started = false;
        this.bestGap = 0;
        this.refillPiece = 0;
    }

    refill(slot) {
        for (let piece = 0; piece < 7; piece++) {
            if (this.sinceDealt[piece] > this.bestGap) {
                this.bestGap = this.sinceDealt[piece];
                this.refillPiece = piece;
            }
        }
        this.pool[slot] = this.refillPiece;
    }

    nextIndex() {
        if (!this.started) {
            this.started = true;
            const first = this.rollFirst();
            this.recent[0] = first;
            return first;
        }

        this.bestGap = 0;
        this.refillPiece = 0;
        let slot;
        for (let roll = 0; roll < TI_ROLLS; roll++) {
            slot = this.rand(TI_POOL);
            if (!this.recent.includes(this.pool[slot])) break;
            this.refill(slot);
            slot = this.rand(TI_POOL); // a rejected roll draws again, and the next roll draws afresh
        }

        const piece = this.pool[slot];
        for (let p = 0; p < 7; p++) this.sinceDealt[p]++;
        this.sinceDealt[piece] = 0;
        this.refill(slot);
        this.recent.pop();
        this.recent.unshift(piece);
        return piece;
    }
}

// ----------------------------------------------------------
// TAP (TGM2) randomizer: a piece is rolled up to six times to miss the last four dealt, the sixth
// roll taken as it comes. The history starts Z, Z, S, S and the first piece (never S, Z or O)
// replaces the first Z. The piece to deal is always rolled one deal ahead.

const TAP_ROLLS = 6;

class TapRandomizer extends TgmRandomizer {
    constructor(seed) {
        super(seed);
        this.recent = [this.rollFirst(), TGM_Z, TGM_S, TGM_S]; // newest first; the newest is the next to deal
    }

    nextIndex() {
        const dealt = this.recent[0];
        let piece;
        for (let roll = 0; roll < TAP_ROLLS - 1; roll++) {
            piece = this.rand(7);
            if (!this.recent.includes(piece)) break;
            piece = this.rand(7); // a rejected roll draws again, and the next roll draws afresh
        }
        this.recent.pop();
        this.recent.unshift(piece);
        return dealt;
    }
}

// ----------------------------------------------------------
// GB randomizer: a piece is rolled up to three times while it would make three of a kind with the
// two before it, the last roll taken as it comes. The game tests this by ORing the three pieces'
// data values (L J I O Z S T = 0, 4, ..., 24) and comparing with the previous piece, so a roll is
// also refused whenever its bits and the one before it fit inside the previous piece's: L comes up
// least often (about 10.5%). Reconstructed from TASVideos submission 4536 and the disassembly; the
// game seeds from its DIV timer, here from the shared generator.

const GB_PIECES = [tetL, tetJ, tetI, tetO, tetZ, tetS, tetT];
const GB_ROLLS = 3;

class GbRandomizer extends LcgRandomizer {
    constructor(seed) {
        super(seed, GB_PIECES);
        this.history = []; // the previous piece, then the one before it (indices into GB_PIECES)
    }

    nextIndex() {
        const [prev, before] = this.history;
        let piece;
        for (let roll = 0; roll < GB_ROLLS; roll++) {
            piece = this.rand(7);
            if (this.history.length < 2 || (piece | prev | before) !== prev) break;
        }
        this.history = [piece, prev];
        return piece;
    }
}

// ----------------------------------------------------------

class RuleGame {
    // startLevel: GB only, 0 to GB_START_LEVELS - 1; height: GB B-Type only, 0 to GB_B_HEIGHTS - 1
    // (both chosen in the menu, as on the Game Boy); handling: Guideline only, overrides of
    // GUIDELINE_HANDLING (the other rule sets keep their specified timing)
    constructor(mode, variant = "standard", startLevel = 0, height = 0, handling = {}) {
        this.gamemode = mode;
        this.variant = variant;
        this.tap = mode === tgmTap;
        this.ars = mode === tgmClassic || this.tap;
        // TGM3 and TAP: levels to 999, ARE and line clear delays, grades, staff roll
        this.tgm = mode === arika || this.ars;
        this.gb = mode === gameBoy;
        this.hasHold = !this.tap && !this.gb;
        this.handling = { ...GUIDELINE_HANDLING, ...(this.tgm || this.gb ? {} : handling) };
        this.shapes = this.ars ? ARS_SHAPES : this.gb ? GB_SHAPES : shapes;
        this.pieceCells = shapeCells(this.shapes); // [type][rotation] -> [row, col] offsets
        this.palette = this.ars ? ARS_PALETTE : DEFAULT_PALETTE;
        // First row of the well (the engine sizes the board to it), and the first row the engine
        // draws: the two rows above the well too, except for GB, whose pieces never leave the well
        this.wellTop = this.gb ? GB_WELL_TOP : VISIBLE_TOP;
        this.firstDrawnRow = this.gb ? GB_WELL_TOP : 0;
        this.pieceTop = this.gb ? GB_WELL_TOP : FIELD_TOP; // highest row a piece may occupy

        this.field = [];
        for (let r = FIELD_TOP; r < HEIGHT; r++) this.field.push(new Array(WIDTH).fill(0));

        this.startLevel = this.gb ? clamp(startLevel, 0, GB_START_LEVELS - 1) : 0;
        this.level = this.gb ? this.startLevel : this.tgm ? 0 : 1;
        this.height = this.gb && variant === "btype" ? clamp(height, 0, GB_B_HEIGHTS - 1) : 0;
        this.lines = 0;
        this.score = 0;
        this.frames = 0;

        // TGM3 grading
        this.internalGrade = 0;
        this.gradePoints = 0;
        this.gradeDecay = 0; // decay timer: frames since the last decay tick or internal grade
        this.gradeCombo = 0; // combo for grade points: clears of 2+ lines in a row (singles keep it)
        this.cools = 0; // COOLs from finished sections
        this.coolPending = false; // COOL earned in the current section
        this.coolChecked = false; // this section's *70 mark has been judged
        this.prevCool = false; // the previous section earned a COOL
        this.prevCoolTime = 0; // seconds the previous section took to reach *70
        this.speedBonus = 0; // speed levels added by COOLs
        this.section = 0;
        this.sectionStart = 0; // frame the current section began
        this.timerStopped = false; // TGM3: the timer stops at level 999
        this.roll = null; // staff roll: "fading" or "invisible"
        this.rollFrames = 0;
        this.rollPoints = 0; // roll grade points, hundredths of a grade
        this.rollCleared = false; // survived the whole roll
        this.rollLength = this.tap ? TAP_ROLL_FRAMES : TGM_ROLL_FRAMES;
        this.rollHide = this.tap ? TAP_ROLL_HIDE : TGM_ROLL_HIDE; // frames until locked blocks hide, by roll
        this.lockTime = null; // per cell, rollFrames when it locked (during the roll)
        // TAP
        this.sectionTimes = []; // frames each finished section took
        this.sectionTetrises = 0; // Tetrises in the current section
        this.mrollQualified = true; // every finished section met the M-roll conditions
        this.rollLines = 0; // lines cleared in the roll
        this.finalGrade = null; // "M" or "GM", beyond what grade points give
        this.torikan = false; // Death: reached 500 too late, the roll starts there
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
        this.combo = this.tgm ? 1 : -1;
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
        this.nextCount = this.tap ? TAP_NEXT : this.gb ? GB_NEXT : this.tgm ? TGM_NEXT : GUIDELINE_NEXT; // pieces shown in the preview
        if (this.tap) this.randomizer = new TapRandomizer(Date.now());
        else if (this.gb) this.randomizer = new GbRandomizer(Date.now());
        else if (this.tgm) this.randomizer = new TiRandomizer(Date.now());
        else this.bag = [];
        this.fillQueue();
        this.updateTimings();
        if (this.height) this.fillGarbage(this.height * GB_ROWS_PER_HEIGHT);
    }

    // GB B-Type: random blocks in the bottom rows, each row with at least one block and one hole
    fillGarbage(rows) {
        for (let r = HEIGHT - rows; r < HEIGHT; r++) {
            let cells;
            do cells = Array.from({ length: WIDTH }, () => Math.random() < GB_GARBAGE_FILL ? 1 + Math.floor(Math.random() * 7) : 0);
            while (cells.every(v => v) || cells.every(v => !v));
            cells.forEach((v, c) => this.setCell(r, c, v));
        }
    }

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

    // Opacity of a settled block: during the staff roll they fade or vanish after locking,
    // and come back when the game ends
    getCellAlpha(row, col) {
        if (!this.roll || this.gameover || row < FIELD_TOP || row >= HEIGHT) return 1;
        const age = this.rollFrames - this.lockTime[row - FIELD_TOP][col];
        const hide = this.rollHide[this.roll];
        if (this.roll === "invisible") return age < hide ? 1 : 0;
        return clamp((hide - age) / TGM_ROLL_FADE_FRAMES, 0, 1);
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

    getStats() {
        const score = this.scoreText();
        // Rule set and mode; TGM3's standard mode is named after its rule (World or Classic),
        // Guideline's standard mode is endless
        const rule = this.ars ? "CLASSIC" : "WORLD";
        const variantName = VARIANT_NAMES[this.variant];
        const mode = this.gb ? ["1989", variantName || "A-TYPE"]
            : this.tap ? ["TGM2 TAP", variantName || "MASTER"]
            : this.tgm ? ["TGM3 TI", variantName ? `${rule} ${variantName}` : rule]
            : ["GUIDELINE", variantName || "ENDLESS"];
        if (this.tgm) {
            const stop = this.level >= 900 ? TGM_MAX_LEVEL : (Math.floor(this.level / 100) + 1) * 100;
            // during the staff roll the timer is stopped and the time row counts the roll down
            const time = this.roll ? ["ROLL", this.formatTime(Math.max(0, this.rollLength - this.rollFrames))] : ["TIME", this.formatTime()];
            return [mode, ["GRADE", this.gradeLabel()], ["LEVEL", `${this.level} / ${stop}`], time, ["SCORE", score]];
        }
        const goal = this.gb ? (this.variant === "btype" ? GB_B_LINES : 0) : GUIDELINE_LINE_GOALS[this.variant];
        const lines = ["LINES", goal ? `${this.lines} / ${goal}` : String(this.lines)];
        if (this.variant === "sprint") return [mode, ["TIME", this.formatTime()], lines, ["SCORE", score]];
        if (this.variant === "ultra") {
            return [mode, ["TIME", this.formatTime(Math.max(0, GUIDELINE_ULTRA_FRAMES - this.frames))], lines, ["SCORE", score]];
        }
        if (this.variant === "btype") return [mode, ["LEVEL", String(this.level)], ["HEIGHT", String(this.height)], lines, ["SCORE", score]];
        return [mode, ["LEVEL", String(this.level)], lines, ["SCORE", score]];
    }

    // Displayed grade: boosts + COOLs + roll grade; Grand Master only for surviving the invisible roll
    gradeIndex() {
        const i = TGM_GRADES[this.internalGrade][0] + this.cools + Math.floor(this.rollPoints / 100);
        const max = this.rollCleared && this.roll === "invisible" ? TGM_GRADE_LABELS.length - 1 : TGM_MAX_GRADE;
        return Math.min(i, max);
    }

    gradeLabel() {
        if (this.tap) { // Death has no grade until M at level 500
            if (this.finalGrade || this.variant === "death") return this.finalGrade || "—";
            return TGM_GRADE_LABELS[Math.min(TAP_MAX_GRADE, TGM_GRADES[this.internalGrade][0])];
        }
        return TGM_GRADE_LABELS[this.gradeIndex()];
    }

    formatTime(frames = this.frames) {
        const cs = Math.floor((frames % 60) * 100 / 60);
        const s = Math.floor(frames / 60) % 60;
        const m = Math.floor(frames / 3600);
        return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
    }

    // ----------------------------------------------------------
    // Rules

    updateTimings() {
        if (this.tgm) {
            const speedLevel = this.level + this.speedBonus;
            const delays = this.tap && this.variant === "death" ? TAP_DEATH_DELAYS : TGM_DELAYS;
            const [, are, lineAre, das, lock, lineClear] = tableLookup(delays, speedLevel);
            this.are = are;
            this.lineAre = lineAre;
            this.das = das;
            this.arr = 1;
            this.lockDelayMax = lock;
            this.lineClearDelay = lineClear;
            this.gravity = tableLookup(TGM_GRAVITY, speedLevel)[1] / 65536;
            if (!this.tap && this.frames >= TGM_KILL_FRAMES) {
                [this.are, this.lineAre, this.das, this.lockDelayMax, this.lineClearDelay] = TGM_KILL_DELAYS;
                this.gravity = 20;
            }
            this.softGravity = Math.max(this.gravity, 1); // World rule soft drop: fixed 1G, non-locking
        } else if (this.gb) {
            this.are = GB_ARE;
            this.lineAre = GB_ARE;
            this.das = GB_DAS;
            this.arr = GB_ARR;
            this.lineClearDelay = GB_LINE_CLEAR;
            this.gbFrames = GB_GRAVITY[Math.min(this.level, GB_MAX_LEVEL)]; // the gravity timer (applyGravityGb)
            this.lockDelayMax = this.gbFrames; // no lock delay: shown as the time left to the next gravity row
            this.gravity = 1 / this.gbFrames;
            this.softGravity = 1 / GB_SOFT_FRAMES;
        } else {
            this.are = GUIDELINE_ARE;
            this.lineAre = GUIDELINE_ARE;
            this.das = this.handling.das;
            this.arr = this.handling.arr;
            this.lockDelayMax = GUIDELINE_LOCK_DELAY;
            this.lineClearDelay = 0;
            this.gravity = guidelineGravity(Math.min(this.level, GUIDELINE_MAX_LEVEL));
            this.softGravity = Math.min(20, this.gravity * this.handling.sdf);
        }

        // Variants override gravity only; soft drop keeps the rule set's speed
        if (this.variant === "test") {
            this.gravity = 0;
        } else if (this.variant === "death") {
            this.gravity = 20;
            this.softGravity = 20;
        }
    }

    // Guideline: handling changed in the menu during a game
    setHandling(handling) {
        if (this.tgm || this.gb) return;
        this.handling = { ...GUIDELINE_HANDLING, ...handling };
        this.updateTimings();
        this.setShadow();
    }

    ghostVisible() {
        if (this.variant === "death" || this.gb || !this.handling.ghost) return false;
        return !this.tgm || this.level < TGM_GHOST_UNTIL;
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
        for (const [i, j] of this.pieceCells[type][rotation]) if (this.blocked(row + i, col + j)) return false;
        return true;
    }

    // The current piece's blocks on the field
    curPieceCells() {
        const { curPiece_type: type, curPiece_row: row, curPiece_col: col } = this;
        return this.pieceCells[type][this.curPiece_rotation].map(([i, j]) => ({ row: row + i, col: col + j, type }));
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

    endGame(title, sub) {
        this.gameover = true;
        this.endTitle = title;
        this.endSub = sub;
    }

    // Clear messages for the engine: kind is "clear", "tspin", "b2b", "combo" or "pc";
    // value is the number of lines for clears and T-spins, the chain length for combos
    addAction(text, kind, value = 0) {
        if (this.actionAge > 0) this.actions = [];
        this.actions.push({ text, kind, value });
        this.actionAge = 0;
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

        // DAS charges in every phase, including ARE and line clears. The first
        // auto-shift comes DAS frames after the press, then one every ARR frames.
        let autoShift = false;
        if (this.shiftDir !== 0 && !shiftPushed) {
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

        if (!this.timerStopped) {
            this.frames++;
            if (this.tgm && !this.tap && this.frames === TGM_KILL_FRAMES) this.updateTimings();
        }
        if (this.roll && ++this.rollFrames >= this.rollLength) {
            this.endRoll();
            return;
        }
        if (this.variant === "ultra" && this.frames >= GUIDELINE_ULTRA_FRAMES) {
            this.endGame("TIME UP", `SCORE ${this.scoreText()}`);
            return;
        }

        if (this.phase === "lineclear") {
            if (++this.phaseCounter >= this.phaseLength) {
                this.collapse(this.pendingRows);
                this.pendingRows = [];
                this.afterClear();
            }
            return;
        }

        if (this.phase === "rollstart") {
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
        if (this.tgm && !this.roll) this.decayGrade();

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

        if (shiftPushed || (autoShift && !this.dcdWait)) {
            // ARR 0: the auto-shift goes straight to the wall
            let steps = autoShift && this.arr === 0 ? WIDTH : 1, moved = false;
            while (steps-- > 0 && this.shift(this.shiftDir, !moved)) moved = true; // one move sound
        }

        if (this.gb) { // no hard or sonic drop; locks when gravity or soft drop can't move it down
            this.applyGravityGb(C(SOFT_PUSH));
            return;
        }

        if (C(HARD_PUSH) && !(this.handling.dropGuard && this.activeTime <= GUIDELINE_DROP_GUARD)) {
            if (this.ars) {
                this.sonicDrop(); // Classic: drops without locking
            } else {
                this.hardDrop();
                return;
            }
        }

        this.applyGravity();
        if (this.phase !== "active") return;

        // Lock delay
        if (!this.canFall()) {
            this.touched = true;
            // Classic: soft drop locks on the ground, and so does a piece whose lock
            // delay was zeroed by rotating after a floor kick
            if (this.ars && (this.held.soft || this.lockDelayZeroed)) {
                this.manualLock = this.held.soft;
                this.lock();
                return;
            }
            if (!this.tgm && this.moveResets >= GUIDELINE_MOVE_LIMIT) {
                this.lock(); // out of moves: locks as soon as it touches down
                return;
            }
            if (++this.curPiece_lockDelay >= this.lockDelayMax) this.lock();
        }
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
        this.curPiece_col = 3;
        this.curPiece_row = this.ars ? ARS_SPAWN_ROW : this.gb ? GB_SPAWN_ROW : this.tgm ? TGM_SPAWN_ROW : 0; // Guideline: rows 21-22
        this.curPiece_rotation = 0;

        // IRS: rotation button held while the piece enters; falls back if blocked (GB has none)
        const irs = this.gb ? 0 : this.held.rotr ? 1 : this.held.rotl ? 3 : 0;
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
        this.sonicMax = 0;
        this.manualLock = false; // locked by the player: hard drop, or Classic soft drop on the ground
        this.lastRotation = false;
        this.lastKick = -1;
        this.touched = false;
        this.moveResets = 0;
        this.rotationResets = 0;
        this.iFloorKicks = 0;
        this.tFloorKicks = 0;
        this.floorKicked = false;
        this.lockDelayZeroed = false;
        this.softArmed = false; // GB: soft drop needs a fresh press for each piece
        this.softCounter = 0;
        this.softRun = 0; // GB: rows soft-dropped since the last press

        // Block out
        if (!this.movePossible(this.curPiece_row, this.curPiece_col, this.curPiece_rotation)) {
            if (this.tap && this.roll === "invisible") this.finalGrade = "M"; // M-roll not survived
            this.endGame("GAME OVER", this.roll ? `GRADE ${this.gradeLabel()} — ESC FOR MENU` : "BLOCK OUT — ESC FOR MENU");
            return;
        }

        // Guideline: drops one row immediately after appearing
        if (!this.tgm && !this.gb && this.canFall()) this.curPiece_row++;
        this.lowestRow = this.curPiece_row;

        // TGM: level +1 per new piece, except at section stops (x99 and 998) and in the staff roll
        // (TAP Death's can start at 500)
        if (this.tgm && !this.firstPiece && newPiece && !this.roll && this.level % 100 !== 99 && this.level !== 998) {
            this.level++;
            this.updateSection();
            this.updateTimings();
        }
        this.firstPiece = false;
        this.setShadow();
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

    // Successful move or rotation: move reset, within the rule's limits
    onMoveReset(isRotation) {
        if (this.ars || this.gb || !this.touched) return; // Classic: step reset only; GB: no lock delay
        if (this.tgm) {
            if (isRotation) {
                if (this.rotationResets >= TGM_ROTATION_RESETS) return;
                this.rotationResets++;
            } else {
                if (this.moveResets >= TGM_MOVE_RESETS) return;
                this.moveResets++;
            }
        } else {
            if (this.moveResets >= GUIDELINE_MOVE_LIMIT) return;
            this.moveResets++;
        }
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

    // ARS rotation with TGM3's kicks; TAP has only the basic ones (I never kicks, no floor kicks)
    rotateArs(dir) {
        const type = this.curPiece_type;
        if (type === tetO) return false;
        const from = this.curPiece_rotation;
        const to = (from + dir + 4) % 4;
        const at = (dr, dc) => this.movePossible(this.curPiece_row + dr, this.curPiece_col + dc, to) ? [dr, dc] : null;

        let kick = at(0, 0);
        let floorKick = false;
        if (!kick) {
            if (type === tetI) {
                if (this.tap) {
                    // no kicks
                } else if (to === 0 || to === 2) {
                    kick = at(0, -1) || at(0, 1) || at(0, 2); // wall kicks into horizontal
                } else if (this.iFloorKicks < ARS_I_FLOOR_KICKS && !this.canFall()) {
                    kick = at(-1, 0) || at(-2, 0); // floor kick, only when resting on something
                    floorKick = kick !== null;
                }
            } else {
                if (this.arsWallKickAllowed(type, from, to)) kick = at(0, 1) || at(0, -1); // right first
                if (!kick && !this.tap && type === tetT && to === 2 && this.tFloorKicks < ARS_T_FLOOR_KICKS) {
                    kick = at(-1, 0); // T escapes upwards into its pointing-up state
                    floorKick = kick !== null;
                }
            }
        }
        if (!kick) return false;

        // TGM3: rotating a T or I again after a floor kick sets its lock delay to zero
        if (this.floorKicked) this.lockDelayZeroed = true;
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
        if (from !== 0 && from !== 2) return true;
        // L, J and T fit their box's top three rows and columns; the cells come in reading order
        const hit = this.pieceCells[type][to].find(([i, j]) => this.blocked(this.curPiece_row + i, this.curPiece_col + j));
        return !hit || hit[1] !== 1;
    }

    rotate(dir) {
        if (this.ars) return this.rotateArs(dir);
        const type = this.curPiece_type;
        if (type === tetO) return false;
        const from = this.curPiece_rotation;
        const to = (from + dir + 4) % 4;
        if (this.gb) { // no kicks: turns in place or not at all
            if (!this.movePossible(this.curPiece_row, this.curPiece_col, to)) return false;
            this.curPiece_rotation = to;
            this.sounds.push("rotate");
            return true;
        }
        const key = STATE_KEYS[from] + "->" + STATE_KEYS[to];
        const table = type === tetI ? (this.tgm ? KICKS_I_ARIKA : KICKS_I_GUIDELINE) : KICKS_JLSTZ;
        const tests = [[0, 0], ...table[key]];
        for (let k = 0; k < tests.length; k++) {
            const [x, y] = tests[k];
            const row = this.curPiece_row - y, col = this.curPiece_col + x;
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

    // Returns whether the piece moved; sound false: no move sound (later steps of an ARR 0 shift)
    shift(dir, sound = true) {
        if (dir === 0) return false;
        if (this.movePossible(this.curPiece_row, this.curPiece_col + dir, this.curPiece_rotation)) {
            this.curPiece_col += dir;
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
            if (soft && !this.tgm) this.score += 1; // Guideline: 1 point per soft-dropped cell
            this.onFall();
        }
    }

    // GB: the gravity timer moves the piece a row every gbFrames frames, and a held soft drop (pressed
    // for this piece) every GB_SOFT_FRAMES instead; a piece that can't move when a row is due locks
    // at once. Soft drop doesn't reset the gravity timer.
    applyGravityGb(softPushed) {
        if (softPushed) {
            this.softArmed = true;
            this.softCounter = GB_SOFT_FRAMES - 1; // the first row comes with the press
        }
        if (!this.held.soft) {
            this.softArmed = false;
            this.softRun = 0;
        }
        const soft = this.softArmed;
        let due = false;
        if (++this.gravityAcc >= this.gbFrames) {
            this.gravityAcc = 0;
            due = !soft;
        }
        if (soft && ++this.softCounter >= GB_SOFT_FRAMES) {
            this.softCounter = 0;
            due = true;
        }
        if (due) {
            if (!this.canFall()) {
                this.manualLock = soft;
                this.lock();
                return;
            }
            this.curPiece_row++;
            if (soft) this.softRun++;
            this.onFall();
        }
        this.curPiece_lockDelay = this.canFall() ? 0 : this.gravityAcc; // lock fade
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

    // Classic: drop to the floor without locking; the lock delay then runs as usual
    sonicDrop() {
        const distance = this.dropToFloor(true);
        this.sonicMax = Math.max(this.sonicMax, distance);
        if (distance === 0) return;
        this.sounds.push("sonic");
        if (this.tap && this.variant !== "death") { // TAP shows the drop trail for the sonic drop too (not Death)
            for (const cell of this.curPieceCells()) this.hardDropCells.push({ ...cell, dist: distance, cleared: false });
        }
    }

    hardDrop() {
        const distance = this.dropToFloor(false);
        if (distance > 0) this.lastRotation = false;
        this.hardDropDistance = distance;
        if (this.tgm) this.sonicMax = Math.max(this.sonicMax, distance);
        else this.score += 2 * distance; // Guideline: 2 points per hard-dropped cell
        this.manualLock = true;
        this.lock(true);
    }

    // 3-corner T-spin with pointing-side mini rule (Guideline)
    detectTSpin() {
        const r = this.curPiece_row, c = this.curPiece_col; // T centre is box cell (1,1)
        const filled = (rr, cc) => this.getCell(rr, cc) !== 0; // walls and floor count
        const TL = filled(r, c), TR = filled(r, c + 2), BL = filled(r + 2, c), BR = filled(r + 2, c + 2);
        const front = [[TL, TR], [TR, BR], [BL, BR], [TL, BL]][this.curPiece_rotation];
        const total = TL + TR + BL + BR;
        if (total < 3) return null;
        if (front[0] && front[1]) return "full";
        return this.lastKick === 4 ? "full" : "mini"; // the 1-by-2 kick upgrades a mini
    }

    lock(fromHardDrop = false) {
        const type = this.curPiece_type;
        const tspin = !this.tgm && !this.gb && type === tetT && this.lastRotation ? this.detectTSpin() : null;
        this.sounds.push(fromHardDrop ? "harddrop" : "lock");

        const cells = this.curPieceCells();
        let allAbove = true;
        for (const cell of cells) {
            if (cell.row >= VISIBLE_TOP) allAbove = false;
            if (this.tgm && cell.row < TGM_BUFFER_TOP) continue; // TGM3: deleted above the buffer row
            this.setCell(cell.row, cell.col, type);
            if (this.roll) this.lockTime[cell.row - FIELD_TOP][cell.col] = this.rollFrames;
        }

        this.curPiece_type = 0;
        this.curPiece_lockDelay = 0;
        this.shadowRow = -100;

        // Guideline lock out: piece locked entirely above the visible field
        if (!this.tgm && !this.gb && allAbove) {
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
        const n = rows.length;
        this.chain = n > 0 ? this.chain + 1 : -1;
        if (n > 0) this.sounds.push("clear" + n + (this.chain > 0 ? "c" + this.chain : "")); // e.g. "clear2c3"

        if (this.tgm) this.scoreTgm(n);
        else if (this.gb) this.scoreGb(n);
        else this.scoreGuideline(n, tspin);
        if (this.gameover) return;

        const collapseNow = n > 0 && this.lineClearDelay === 0;
        if (fromHardDrop) {
            for (const cell of cells) {
                // cleared cells keep the row they landed in, for the drop trail (there's no block to flash)
                const cleared = rows.includes(cell.row);
                const below = collapseNow && !cleared ? rows.filter(r => r > cell.row).length : 0;
                this.hardDropCells.push({ row: cell.row + below, col: cell.col, type, dist: this.hardDropDistance, cleared });
            }
        }

        if (n === 0) {
            this.startAre(this.are);
        } else if (collapseNow) {
            this.collapse(rows);
            this.afterClear();
        } else {
            this.setPhase("lineclear", this.lineClearDelay);
            this.pendingRows = rows;
        }
    }

    // Timed phases (are, lineclear, rollstart) count phaseCounter up to phaseLength
    setPhase(phase, length) {
        this.phase = phase;
        this.phaseCounter = 0;
        this.phaseLength = length;
    }

    // Remove emptied rows and let everything above fall (naive gravity)
    collapse(rows) {
        if (rows.length === 0) return;
        const drop = (grid) => {
            const kept = grid.filter((_, i) => !rows.includes(i + FIELD_TOP));
            while (kept.length < grid.length) kept.unshift(new Array(WIDTH).fill(0));
            return kept;
        };
        this.field = drop(this.field);
        if (this.lockTime) this.lockTime = drop(this.lockTime);
    }

    // After a line clear: the next piece, or the staff roll once the timer has stopped
    // (level 999, or TAP Death's level 500 reached too late)
    afterClear() {
        if (this.timerStopped && !this.roll) this.startRollStart();
        else this.startAre(this.lineAre);
    }

    // ----------------------------------------------------------
    // TGM3 staff roll

    // Level 999: the field is emptied row by row from the bottom, then the roll begins
    startRollStart() {
        // as in NullpoMino: a line clear delay, a row every few frames, two frames more
        this.setPhase("rollstart", this.lineClearDelay + HEIGHT * TGM_ROLL_ROW_FRAMES + 2);
        if (this.tap) {
            this.nextRoll = this.variant === "death" ? "visible" : this.mrollEarned() ? "invisible" : "fading";
            return;
        }
        const invisible = this.cools >= TGM_INVISIBLE_COOLS && this.internalGrade >= TGM_INVISIBLE_GRADE;
        this.nextRoll = invisible ? "invisible" : "fading";
    }

    advanceRollStart() {
        const t = this.phaseCounter++ - this.lineClearDelay;
        if (t >= 0 && t < HEIGHT * TGM_ROLL_ROW_FRAMES && t % TGM_ROLL_ROW_FRAMES === 0) {
            const r = HEIGHT - 1 - t / TGM_ROLL_ROW_FRAMES;
            for (let c = 0; c < WIDTH; c++) {
                const type = this.getCell(r, c);
                if (type) this.clearedCells.push({ row: r, col: c, type });
                this.setCell(r, c, 0);
            }
        }
        if (this.phaseCounter < this.phaseLength) return;
        for (const row of this.field) row.fill(0); // the buffer rows too
        this.roll = this.nextRoll;
        this.rollFrames = 0;
        this.lockTime = this.field.map(() => new Array(WIDTH).fill(0));
        this.addAction(this.roll === "invisible" ? (this.tap ? "M-ROLL" : "INVISIBLE ROLL") : "STAFF ROLL", "grade");
        this.spawn(this.nextFromQueue(), false);
    }

    // Hidden test setups for TGM3 and TAP (the engine's Ctrl+Shift+digit keys):
    //  "roll"      straight to the staff roll the player has earned (fading unless qualified)
    //  "invisible" to the invisible roll: all COOLs, internal grade 27 (TAP Master: the M-roll)
    //  "gm"        to an invisible roll that ends in Grand Master if survived (TAP Master: the M-roll)
    //  "rollend"   in the roll: to its last 5 seconds
    //  "kill"      10 seconds before the 15-minute speed-up (TGM3 only)
    // Returns whether the setup applied.
    testSetup(name) {
        if (!this.tgm || this.gameover || this.phase === "ready") return false;
        if (name === "kill") {
            if (this.tap) return false;
            const skip = TGM_KILL_FRAMES - TEST_KILL_LEAD - this.frames;
            if (this.timerStopped || skip <= 0) return false;
            this.frames += skip;
            this.sectionStart += skip; // the section isn't slower for it (no REGRET)
            return true;
        }
        if (name === "rollend") {
            if (!this.roll) return false;
            this.rollFrames = Math.max(this.rollFrames, this.rollLength - TEST_ROLL_LEAD);
            return true;
        }
        if (this.roll || this.phase === "rollstart" || !["roll", "invisible", "gm"].includes(name)) return false;
        if (this.tap) {
            if (this.variant === "death") {
                if (name !== "roll") return false;
                this.finalGrade = "GM";
            } else if (name !== "roll") { // M-roll: every condition met, the timer within 8:45
                this.mrollQualified = true;
                this.internalGrade = TGM_GRADES.length - 1;
                this.frames = Math.min(this.frames, TAP_MROLL_FRAMES);
            }
        } else if (name === "invisible") {
            this.cools = TGM_INVISIBLE_COOLS;
            this.internalGrade = Math.max(this.internalGrade, TGM_INVISIBLE_GRADE);
        } else if (name === "gm") {
            this.cools = TGM_INVISIBLE_COOLS;
            this.internalGrade = TGM_GRADES.length - 1;
            this.rollPoints = TEST_GM_ROLL_POINTS;
        }
        if (this.phase === "lineclear") this.collapse(this.pendingRows);
        this.pendingRows = [];
        this.curPiece_type = 0;
        this.shadowRow = -100;
        this.level = TGM_MAX_LEVEL;
        this.timerStopped = true;
        this.updateTimings();
        this.startRollStart();
        return true;
    }

    // Survived the roll: its bonus, then the final grade
    endRoll() {
        this.rollCleared = true;
        if (this.tap) return this.endTapRoll();
        this.rollPoints += TGM_ROLL_CLEAR[this.roll];
        const gm = this.gradeIndex() === TGM_GRADE_LABELS.length - 1;
        this.endGame(gm ? "GRAND MASTER" : "COMPLETE", `GRADE ${this.gradeLabel()} — ${this.formatTime()}`);
    }

    // ----------------------------------------------------------
    // TAP

    // Master: the M-roll needs S9 and 8:45 at level 999 and every section's conditions met
    mrollEarned() {
        return this.mrollQualified && this.frames <= TAP_MROLL_FRAMES
            && TGM_GRADES[this.internalGrade][0] >= TAP_MAX_GRADE;
    }

    // Master: judge a section against the M-roll conditions once it is finished (the last at 999)
    updateTapSection() {
        const section = Math.floor(this.level / 100);
        if (section === this.section && this.level < TGM_MAX_LEVEL) return;
        const time = this.frames - this.sectionStart;
        const s = this.section, times = this.sectionTimes;
        let limit;
        if (s < 5) limit = TAP_MROLL_SECTION_FRAMES;
        else if (s === 5) limit = Math.floor(times.slice(0, 5).reduce((a, b) => a + b, 0) / 5) + TAP_MROLL_SLACK;
        else limit = times[s - 1] + TAP_MROLL_SLACK;
        if (time > limit || this.sectionTetrises < TAP_MROLL_TETRISES[s]) this.mrollQualified = false;
        times.push(time);
        this.section = section;
        this.sectionStart = this.frames;
        this.sectionTetrises = 0;
    }

    endTapRoll() {
        const time = this.formatTime();
        if (this.variant === "death") { // the credits change nothing
            this.endGame(this.torikan ? "EXCELLENT" : "COMPLETE", `GRADE ${this.gradeLabel()} — ${time}`);
        } else if (this.roll === "invisible") {
            this.finalGrade = "GM";
            this.endGame("GRAND MASTER", `${this.rollLines >= TAP_ORANGE_LINES ? "ORANGE" : "GREEN"} LINE — ${time}`);
        } else {
            this.endGame("COMPLETE", `GRADE ${this.gradeLabel()} — ORANGE LINE — ${time}`);
        }
    }

    // A clear of n lines (TAP, after scoreTgm). Score = (ceil((level + lines) / 4) + soft + 2 x sonic)
    // x lines x combo x bravo + ceil(level after / 2) + speed x 7
    scoreTap(n) {
        const death = this.variant === "death";
        const levelBefore = this.level;
        const levelAfter = Math.min(TGM_MAX_LEVEL, levelBefore + n); // one level per line
        const { soft, speed } = this.tgmPieceBonus();
        const bravo = this.fieldEmpty() ? 4 : 1;
        this.score += (Math.ceil((levelBefore + n) / 4) + soft + 2 * this.sonicMax) * n * this.combo * bravo
            + Math.ceil(levelAfter / 2) + speed * 7;
        this.lines += n;
        this.addClearActions(n);
        if (bravo > 1) this.addAction("BRAVO", "pc");

        if (n === 4) this.sectionTetrises++;
        if (!death) this.scoreGrade(n, levelBefore);
        this.level = levelAfter;
        this.updateTapSection();

        if (death && levelBefore < TAP_DEATH_M_LEVEL && this.level >= TAP_DEATH_M_LEVEL) {
            if (this.frames <= TAP_DEATH_M_FRAMES) {
                this.finalGrade = "M";
                this.addAction("GRADE M", "grade");
            } else { // too late: the timer stops at 500 and the credits roll (afterClear)
                this.level = TAP_DEATH_M_LEVEL;
                this.torikan = true;
                this.timerStopped = true;
            }
        }
        if (this.level >= TGM_MAX_LEVEL) {
            this.timerStopped = true; // the staff roll starts after the clear (afterClear)
            if (death) {
                this.finalGrade = "GM";
                this.addAction("GRADE GM", "grade");
            }
        }
        this.updateTimings();
        this.setShadow();
    }

    fieldEmpty() {
        return this.field.every(row => row.every(v => v === 0));
    }

    // GB: 40/100/300/1200 x (level + 1), plus the rows soft-dropped if the soft drop locked the
    // piece; capped at 999,999. A-Type goes up a level every 10 lines to 20, the first time
    // after (start level + 1) x 10 lines; B-Type stays at its start level and ends at 25 lines.
    scoreGb(n) {
        if (this.manualLock) this.score += this.softRun;
        if (n > 0) {
            this.score += GB_LINE_SCORES[n] * (this.level + 1);
            this.lines += n;
            this.addAction(CLEAR_NAMES[n], "clear", n);
        }
        this.score = Math.min(this.score, GB_MAX_SCORE);
        if (n === 0) return;
        if (this.variant === "btype") {
            if (this.lines >= GB_B_LINES) this.endGame("COMPLETE", `${GB_B_LINES} LINES — SCORE ${this.scoreText()}`);
            return;
        }
        const level = Math.min(GB_MAX_LEVEL, Math.max(this.startLevel, Math.floor(this.lines / GB_LINES_PER_LEVEL)));
        if (level !== this.level) {
            this.level = level;
            this.updateTimings();
        }
    }

    scoreGuideline(n, tspin) {
        const L = this.level;
        let base, difficult;
        if (tspin === "full") {
            base = [400, 800, 1200, 1600][n];
            difficult = n > 0;
            this.addAction("T-SPIN" + (n ? " " + CLEAR_NAMES[n] : ""), "tspin", n);
        } else if (tspin === "mini") {
            base = [100, 200, 400][n];
            difficult = n > 0;
            this.addAction("T-SPIN MINI" + (n ? " " + CLEAR_NAMES[n] : ""), "tspin", n);
        } else {
            base = [0, 100, 300, 500, 800][n];
            difficult = n === 4;
            if (n > 0) this.addAction(CLEAR_NAMES[n], "clear", n);
        }

        const b2bBefore = this.b2b;
        let action = base * L;
        if (n > 0) {
            if (difficult && b2bBefore) {
                action = action * 3 / 2;
                this.addAction("BACK-TO-BACK", "b2b");
            }
            this.b2b = difficult; // singles, doubles and triples break the chain
        }
        this.score += Math.floor(action);

        if (n > 0) {
            this.combo++;
            if (this.combo > 0) {
                this.score += 50 * this.combo * L;
                this.addAction(this.combo + " COMBO", "combo", this.chain);
            }
            if (this.fieldEmpty()) {
                const bonus = n === 4 && b2bBefore ? 3200 : [0, 800, 1200, 1800, 2000][n];
                this.score += bonus * L;
                this.addAction("PERFECT CLEAR", "pc");
            }
            this.lines += n;
            const level = GUIDELINE_FIXED_LEVEL.includes(this.variant) ? this.level
                : Math.min(GUIDELINE_MAX_LEVEL, 1 + Math.floor(this.lines / GUIDELINE_LINES_PER_LEVEL));
            if (level !== this.level) {
                this.level = level;
                this.updateTimings();
            }
            const goal = GUIDELINE_LINE_GOALS[this.variant];
            if (goal && this.lines >= goal) this.endGame("COMPLETE", `${goal} LINES — ${this.formatTime()}`);
        } else {
            this.combo = -1;
        }
    }

    // Grade points decay by one every so many frames while the player controls a piece,
    // has points and no grade combo is running
    decayGrade() {
        if (this.gradePoints === 0 || this.gradeCombo > 0) return;
        if (++this.gradeDecay < TGM_GRADES[this.internalGrade][1]) return;
        this.gradeDecay = 0;
        this.gradePoints--;
    }

    // Points for a clear of n lines: ceil(base x combo multiplier) x level multiplier
    gradeAward(n, combo, levelBefore) {
        const c = Math.min(10, combo) - 1;
        const mult = this.tap ? (n === 4 ? 1 : TAP_GRADE_COMBO[c][n - 1]) : n === 1 ? 1 : TGM_GRADE_COMBO[c][n - 2];
        const levelMult = 1 + Math.floor(levelBefore / 250);
        // in tenths, so the ceiling sees exact integers (50 x 2.2 is 110.00000000000001)
        const tenths = TGM_GRADES[this.internalGrade][1 + n] * Math.round(mult * 10);
        return Math.ceil(tenths / 10) * levelMult;
    }

    // 100 points advance the internal grade and discard the remainder. The first clear of a
    // combo counts as combo 1, a single before any double too.
    scoreGrade(n, levelBefore) {
        this.gradePoints += this.gradeAward(n, Math.max(1, this.gradeCombo), levelBefore);
        if (this.gradePoints >= TGM_GRADE_POINTS) {
            this.gradePoints = 0;
            this.gradeDecay = 0; // the decay timer restarts only with a new internal grade
            this.internalGrade = Math.min(TGM_GRADES.length - 1, this.internalGrade + 1);
        }
    }

    // Section bookkeeping after a level change: judge the COOL at *70, and when a
    // section ends (the last one at 999) award its COOL or give a REGRET for taking too long
    updateSection() {
        if (this.tap) return this.updateTapSection();
        const section = Math.floor(this.level / 100);
        const seconds = (this.frames - this.sectionStart) / 60;
        const finished = section > this.section || this.level >= TGM_MAX_LEVEL;
        if (!this.coolChecked && this.level % 100 >= 70 && this.section < TGM_COOL_TIME.length) {
            this.coolChecked = true;
            if (seconds <= TGM_COOL_TIME[this.section]
                && (!this.prevCool || seconds <= this.prevCoolTime + TGM_COOL_SLACK)) {
                this.coolPending = true;
                this.addAction("COOL!!", "grade");
            }
            this.prevCoolTime = seconds;
        }
        if (finished) {
            if (this.coolPending) {
                this.cools++;
                this.speedBonus += TGM_COOL_SPEEDUP;
            }
            if (seconds > TGM_REGRET_TIME[this.section]) {
                const boosts = TGM_GRADES[this.internalGrade][0];
                if (boosts > 0) { // fall back to the highest internal grade with one boost less
                    while (TGM_GRADES[this.internalGrade][0] >= boosts) this.internalGrade--;
                }
                this.gradePoints = 0;
                this.addAction("REGRET!!", "grade");
            }
            this.prevCool = this.coolPending;
            this.section = section;
            this.sectionStart = this.frames;
            this.coolPending = false;
            this.coolChecked = false;
        }
    }

    // TGM3 and TAP: a piece locked, clearing n lines. In the staff roll clears only count lines and
    // earn roll grade (TGM3) or count towards the orange line (TAP); otherwise the combos are kept
    // here and the rule set scores the clear (scoreTi, scoreTap)
    scoreTgm(n) {
        if (this.roll) {
            if (n === 0) return;
            this.lines += n;
            if (this.tap) this.rollLines += n;
            else this.rollPoints += TGM_ROLL_POINTS[this.roll][n];
            this.addClearActions(n);
            return;
        }
        if (n === 0) {
            this.combo = 1;
            this.gradeCombo = 0;
            return;
        }
        this.combo = this.combo + 2 * n - 2;
        if (n >= 2) this.gradeCombo++;
        if (this.tap) this.scoreTap(n);
        else this.scoreTi(n);
    }

    // The clear's name, then the chain length if it continues one (named by chain length: TGM's
    // combo is a score multiplier, already above 1 for doubles)
    addClearActions(n) {
        this.addAction(CLEAR_NAMES[n], "clear", n);
        if (this.chain > 0) this.addAction(this.chain + " COMBO", "combo", this.chain);
    }

    // Per-piece score terms: frames of soft drop (locking by hand adds 1) and the speed bonus,
    // the lock delay left unused
    tgmPieceBonus() {
        return {
            soft: this.softFrames + (this.manualLock ? 1 : 0),
            speed: Math.max(0, this.lockDelayMax - Math.max(1, this.activeTime)),
        };
    }

    // A clear of n lines (TGM3, after scoreTgm). Score = (ceil((level + lines) / 4) + soft + sonic)
    // x lines x combo + ceil(level after / 2) + speed
    scoreTi(n) {
        const levelBefore = this.level;
        const levelAfter = Math.min(TGM_MAX_LEVEL, levelBefore + TGM_LEVEL_FOR_LINES[n]);
        const { soft, speed } = this.tgmPieceBonus();
        this.score += (Math.ceil((levelBefore + n) / 4) + soft + this.sonicMax) * n * this.combo
            + Math.ceil(levelAfter / 2) + speed;
        this.lines += n;
        this.addClearActions(n);

        this.scoreGrade(n, levelBefore);
        this.level = levelAfter;
        this.updateSection();
        this.updateTimings();
        this.setShadow();

        if (this.level >= TGM_MAX_LEVEL) {
            this.timerStopped = true; // the staff roll starts after the clear (afterClear)
        } else if (levelBefore < TGM_TORIKAN_LEVEL && this.level >= TGM_TORIKAN_LEVEL && this.frames > TGM_TORIKAN_FRAMES) {
            this.level = TGM_TORIKAN_LEVEL;
            this.endGame("LEVEL STOP", "OVER 7:00 AT LEVEL 500");
        }
    }
}
