// The TGM series (TgmGame): TGM1 (Tgm1Game), TAP (TapGame) and TGM3 (TiGame; TiEasyGame,
// TiShiraseGame), with Arika's rotation systems, levels to 999, ARE and line clear delays, grades
// and staff rolls.
//  - TGM1: Tetris The Grand Master, Master and 20G (its hidden 20G mode): plain ARS like TAP but
//    without the sonic drop, constant delays, grades from the score, GM for meeting score and time
//    checkpoints, then a staff roll that can't be lost (tetris.wiki: Tetris_The_Grand_Master,
//    TGM_randomizer; GM checks and roll length from NullpoMino's GradeManiaMode)
//  - TAP: Tetris The Absolute The Grand Master 2 PLUS, Master (grades 9 to GM, fading roll or
//    M-roll), Death (20G, M at level 500, GM at 999) and TGM+ ("plus": rising garbage from a fixed
//    pattern): plain ARS without TGM3's kicks, sonic drop, no hold, one next piece, TGM2 randomizer
//    (tetris.wiki: Tetris_The_Absolute_The_Grand_Master_2_PLUS, Grade_Recognition_System,
//     TGM_randomizer; roll length from NullpoMino's GradeMania2Mode, TGM+'s pattern and roll from
//     its GarbageManiaMode)
//  - TGM3: Tetris The Grand Master 3 Terror-Instinct with the World rule (Arika SRS) or the Classic
//    rule (ARS with TGM3's I and T kicks; tetris.wiki: Arika_Rotation_System, kick order as in
//    NullpoMino's ClassicPlusWallkick). Master: COOLs, REGRETs, the staff roll (fading, or invisible
//    with all COOLs) that can earn Grand Master, 20G after 15 minutes (timings from NullpoMino's
//    GradeMania3Mode). "easy": to level 200, scored in fireworks (the community analysis "TGM3 Easy
//    mode hanabi" that tetris.wiki links to). "shirase": 20G to level 1300, rising garbage,
//    monochrome blocks, a staff roll with big pieces (roll length from NullpoMino's SpeedMania2Mode).
//  - "versus" in all three (tgmVersus(): Tgm1VersusGame, TapVersusGame, TiVersusGame): one side of
//    a VS match (tetris.wiki: TGM_Versus_Mode_Guide): a race to level 200 in 2:40 (TGM1: to the end,
//    a draw after 5:00), first to two rounds, garbage copied from the rows a clear removes, items
//    with the Items card (TAP, TGM3).
//    (tetris.wiki: Tetris_The_Grand_Master_3_Terror-Instinct, Heboris_Unofficial_Expansion)

const TGM_BUFFER_TOP = 1; // one buffer row: blocks locking above it are deleted
// A staff roll whose blocks stay visible (TGM1, TGM+, Easy, Shirase; TAP Death's is in TAP_ROLL_HIDE)
const VISIBLE_ROLL_HIDE = { visible: Infinity };

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
// TGM3 versus (tetris.wiki, TGM Versus Mode Guide: the arcade's default settings)
const TGM_VS_LEVEL_GOAL = 200; // the first to reach it wins the round
const TGM_VS_FRAMES = (2 * 60 + 40) * 60; // a round's time limit, 2:40: then the higher level wins
const TGM_VS_WINS = 2; // rounds to win the match ("first to 2", up to 3 rounds)
const TGM_VS_GARBAGE_MAX = 8; // rows of garbage that may wait ("capped at the first 8 lines")
// The goal can be set in steps of 100 levels, the time limit 1:20 longer or shorter for each (tetris.wiki, TAP)
const TGM_VS_GOAL_STEP = 100, TGM_VS_GOAL_MAX = 900, TGM_VS_STEP_FRAMES = 80 * 60;
const TGM1_VS_FRAMES = 5 * 60 * 60; // TGM1: a round not decided in 5:00 is a draw (tetris.wiki)
// TGM1's items that TAP has too (tetris.wiki's TGM1 page; TAP added Mirror Block, Color Block and Dark Block, and
// dropped TGM1's Spin Field and Press Field)
const TGM1_VS_ITEMS = ["DEATH BLOCK", "NEGA FIELD", "180° FIELD", "SHOTGUN!", "HARD BLOCK", "LASER", "ROLL ROLL", "TRANSFORM",
    "X-RAY", "↑ DEL FIELD", "↓ DEL FIELD", "→ MOV FIELD", "← MOV FIELD", "DEL EVEN", "FREE FALL", "EXCHG FIELD"];
// TGM3's versus styles: the pieces between items, and the name the stats show
const TGM3_VS_STYLES = { attack: { items: 40, name: "ATTACK" }, defence: { items: 20, name: "DEFENCE" }, item: { items: 10, name: "ITEM" } };
const TGM_TORIKAN_LEVEL = 500, TGM_TORIKAN_FRAMES = 7 * 60 * 60; // ends at 500 if slower than 7:00
const TGM_GHOST_UNTIL = 100; // ghost piece shown below level 100
const TGM_ROTATION_RESETS = 8, TGM_MOVE_RESETS = 10; // World rule move reset limits
const TGM_SPAWN_ROW = 2; // spawn in the top visible rows
const TGM_NEXT = 3; // TGM3 shows three next pieces
// After 15 minutes Master and Easy speed up to keep players from playing too long: 20G with Shirase's
// 600-1099 delays (tetris.wiki), [ARE, line ARE, DAS, lock delay, line clear delay]
const TGM_KILL_FRAMES = 15 * 60 * 60, TGM_KILL_DELAYS = [6, 5, 6, 12, 3];

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
// Big Master gets no section COOLs, so always the fading roll, with these points (tetris.wiki)
const TGM_BIG_ROLL_POINTS = [0, 8, 26, 34, 42];
const TGM_ROLL_CLEAR = { fading: 50, invisible: 160 };

// Hidden test setups (testSetup): how close to the end of the roll and to 15:00 they jump
const TEST_ROLL_LEAD = 5 * 60, TEST_KILL_LEAD = 10 * 60, TEST_FIREWORKS = 5;
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
    "Grand Master", // only by surviving the invisible roll (with exams: once qualified, or in its exam)
];
const TGM_MAX_GRADE = 31; // MasterM: the highest grade before the end of the roll
const TGM_GRADE_POINTS = 100; // points for the next internal grade
// Per 100-level section (seconds): reaching *70 faster than COOL_TIME earns a COOL;
// taking longer than REGRET_TIME for the whole section is a REGRET
const TGM_COOL_TIME = [52, 52, 49, 45, 45, 42, 42, 38, 38];
const TGM_REGRET_TIME = [90, 75, 75, 68, 60, 60, 50, 50, 50, 50];
const TGM_COOL_SLACK = 2; // after a COOL section, the next may reach *70 at most this much slower
const TGM_COOL_SPEEDUP = 100; // a COOL moves the speed level 100 ahead once its section is finished
// A COOL is judged at *70 but its message waits until *82 (NullpoMino; tetris.wiki: "around *80")
const TGM_COOL_SHOWN = 82;

// ----------------------------------------------------------
// The secret grade (TGM1, TAP Master and Death, TGM3 Master and Shirase): the ">" pattern built from
// the bottom, a row with a single hole each, the hole under a block, the holes going from the left
// wall to the right one at the tenth row and back to the left at the nineteenth, whose hole must
// be covered too (tetris.wiki: Secret_Grade_Techniques; the check as in NullpoMino's
// Field.getSecretGrade). Judged when the game ends, by rows of the pattern counted from the bottom.
const SECRET_GRADE_LABELS = ["9", "8", "7", "6", "5", "4", "3", "2", "1",
    "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "GM"]; // by rows, 1-19
// Shirase's start at S grades and go through the m grades (tetris.wiki)
const SHIRASE_SECRET_LABELS = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9",
    "m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "GM"];
const SECRET_GRADE_MIN_ROWS = 5; // shown from this many rows (NullpoMino: fewer happen by chance)

// ----------------------------------------------------------
// TGM3 Master's qualified grade and exams (tetris.wiki; demotion points as in NullpoMino's
// GradeMania3Mode). The player's qualified grade starts at 9. Each Master game (not Big) has a chance
// of an exam. A promotional exam tests the average of the 2nd, 3rd and 4th best of the last seven
// grades (rounded down) when it is above the qualified grade, which becomes the exam grade if it is
// reached. A game ending 8 or more grades below the qualified one adds the excess over 7 to demotion
// points; from 30 the next exam is a demotional one at the qualified grade, and falling short of it
// costs a grade. Grand Master can only be tested once qualified as MasterM, and is shown in normal
// play only once qualified as Grand Master (else MasterM).
const TGM3_EXAM_CHANCE = 1 / 3;
const TGM3_EXAM_HISTORY = 7;
const TGM3_DEMOTION_GAP = 7, TGM3_DEMOTION_POINTS = 30;
const TGM3_EXAM_START = { qualified: 0, demotion: 0 }; // and an empty history: grade indices, latest first

// The exam for a new Master game, from the player's state, or null: { kind: "promotion" or
// "demotion", grade }. roll: a random number in [0, 1)
function tgm3ExamFor(state, roll = Math.random()) {
    if (roll >= TGM3_EXAM_CHANCE) return null;
    const grade = tgm3PromotionGrade(state);
    if (grade > state.qualified) return { kind: "promotion", grade };
    if (state.demotion >= TGM3_DEMOTION_POINTS) return { kind: "demotion", grade: state.qualified };
    return null;
}

// What a promotional exam would test: the average of the 2nd, 3rd and 4th best of the last seven
// grades, rounded down (-1 before seven games); Grand Master only for a qualified MasterM
function tgm3PromotionGrade({ history, qualified }) {
    if (history.length < TGM3_EXAM_HISTORY) return -1;
    const best = [...history].sort((a, b) => b - a);
    const grade = Math.floor((best[1] + best[2] + best[3]) / 3);
    return qualified < TGM_MAX_GRADE ? Math.min(grade, TGM_MAX_GRADE) : grade;
}

// The player's state after a Master game that ended with grade (the grade earned, before the cap
// on Grand Master) and had exam (or null)
function tgm3ExamAfter(state, exam, grade) {
    let { qualified, demotion } = state;
    if (exam && exam.kind === "demotion") demotion = 0; // spent on this exam
    if (grade < qualified - TGM3_DEMOTION_GAP) demotion += qualified - grade - TGM3_DEMOTION_GAP;
    if (exam && exam.kind === "promotion" && grade >= exam.grade) {
        qualified = exam.grade;
        demotion = 0;
    }
    if (exam && exam.kind === "demotion" && grade < exam.grade) qualified = Math.max(0, exam.grade - 1);
    return { qualified, demotion, history: [grade, ...state.history].slice(0, TGM3_EXAM_HISTORY) };
}

// ----------------------------------------------------------
// TGM3 Shirase: 20G throughout, levels to 1300

// [from level, ARE, line ARE, DAS, lock delay, line clear delay] in frames
const SHIRASE_DELAYS = [
    [0, 12, 8, 10, 18, 6], [100, 12, 7, 8, 18, 5], [200, 12, 6, 8, 17, 4], [300, 6, 6, 8, 15, 4],
    [500, 6, 5, 6, 13, 3], [600, 6, 5, 6, 12, 3], [1100, 6, 5, 6, 10, 3], [1200, 6, 5, 6, 8, 3],
    [1300, 6, 6, 6, 15, 6],
];
const SHIRASE_MAX_LEVEL = 1300;
// Level stops: reaching the level later than this (frames) ends the game; by rule
const SHIRASE_TORIKAN = { world: [[500, 183 * 60], [1000, 366 * 60]], classic: [[500, 148 * 60], [1000, 296 * 60]] };
// Rising garbage in sections 5-9: the counter goes +1 per new piece and -1 per line cleared (not
// below 0); at the section's quota a copy of the bottom row rises before the next piece
const SHIRASE_GARBAGE = [0, 0, 0, 0, 0, 20, 18, 10, 9, 8];
// A section slower than this many seconds is a REGRET: 60 for the first two, then 50
const SHIRASE_REGRET_TIME = (section) => section < 2 ? 60 : 50;
const SHIRASE_MONO_LEVEL = 1000; // every block monochrome from here
const SHIRASE_ROLL_FRAMES = 3238; // the staff roll after 1300, with big pieces
// Grade: sections finished less REGRETs
const SHIRASE_GRADE_LABELS = ["1", "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11", "S12", "S13"];

// ----------------------------------------------------------
// TGM3 Easy: to level 200 with fixed delays; scored in fireworks (hanabi)

// Gravity in 1/256 G: [from level, value] (harddrop.com; tetris.wiki's table goes down at 144 and
// differs from 132 on)
const EASY_GRAVITY = [
    [0, 4], [8, 5], [19, 6], [35, 8], [40, 10], [50, 12], [60, 16], [70, 32], [80, 48], [90, 64],
    [101, 16], [112, 48], [121, 80], [132, 112], [144, 144], [156, 175], [167, 192], [177, 208], [200, 5120],
];
const EASY_DELAYS = [48, 25, 14, 30, 40]; // ARE, line ARE, DAS, lock delay, line clear delay
const EASY_MAX_LEVEL = 200;
const EASY_ROLL_FRAMES = 3265;
// Fireworks for a clear: truncate(base x combo x every bonus that applies), added to a stream that
// fires one every EASY_STREAM_FRAMES (frames the clock divides). Bonuses:
const EASY_BASE = [0, 1.0, 2.9, 3.8, 4.7]; // by lines
// combo: doubles and more add one (to 9) before scoring, singles keep it without the bonus, a piece
// that clears nothing resets it; multiplier by combo (0: none)
const EASY_COMBO = [1, 1.0, 1.5, 1.9, 2.2, 2.9, 3.5, 3.9, 4.2, 4.5];
const EASY_COMBO_MAX = 9;
// in the roll the combo is frozen and mapped (the game's bug: 9 maps to the lowest) for every clear
const EASY_ROLL_COMBO_MAP = [1, 1, 2, 3, 4, 4, 4, 4, 4, 0], EASY_ROLL_COMBO = [1.0, 1.5, 1.9, 2.2, 2.9];
const EASY_FIXED_SPEED = 1.3, EASY_FIXED_SPEED_FRAMES = 100; // a combo-stream firework fired lately
const EASY_SPLIT = 1.4; // rows cleared apart
const EASY_LUCKY = 1.3, EASY_LUCKY_LEVELS = [25, 50, 75, 125, 150, 175, 199]; // level before the clear
const EASY_30S = 1.4, EASY_30S_FRAMES = 1800, EASY_30S_LEVELS = 30; // 30 levels in a 30 s period: next clear
const EASY_VAR_SPEED = 100, EASY_VAR_FINESSE = 120; // x (level - frames) / n when over n
const EASY_SPIN = 2, EASY_TSPIN = 3, EASY_TSPIN_TRIPLE = 4; // last move a rotation (never the O)
const EASY_BRAVO = 6; // a perfect clear before the roll, in its own stream
const EASY_COMPLETE = 24; // surviving the roll
const EASY_STREAM_FRAMES = 10;

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
// TGM+: Master's gravity with Normal mode's delays, and a row of garbage from a fixed 24-row pattern
// ('.' a hole) each time 13 - level / 100 pieces in a row lock without clearing; the roll can't be lost
const TAP_PLUS_DELAYS = [27, 27, 16, 30, 40]; // ARE, line ARE, DAS, lock delay, line clear delay
const TAP_PLUS_RISE = 13;
const TAP_PLUS_PATTERN = [
    ".#########", ".#########", ".#########", ".#########", "#########.", "#########.", "#########.", "#########.",
    "..########", ".#########", ".#########", "########..", "#########.", "#########.", "##.#######", "#..#######",
    "#.########", "#######.##", "#######..#", "########.#", "####..####", "####..####", "####.#####", "###...####",
];
const TAP_PLUS_ROLL_FRAMES = 2024;
// Normal: to level 300 with no section stops but the last, its own gravity and fixed delays, an item
// piece after reaching 100 (Free Fall: every block drops down its column, filling the holes) and 200
// (Del Even: every other row from the bottom is deleted), whose item goes off once a line clear takes
// any of its blocks (tetris.wiki), x6 points for clears and a time bonus at 300, then a
// 20G credit roll that needn't be survived. No grades.
const TAP_NORMAL_MAX_LEVEL = 300;
// Gravity in 1/256 G: [from level, value]
const TAP_NORMAL_GRAVITY = [
    [0, 4], [8, 5], [19, 6], [35, 8], [40, 10], [50, 12], [60, 16], [70, 32], [80, 48], [90, 64],
    [100, 4], [108, 5], [119, 6], [125, 8], [131, 12], [139, 32], [149, 48], [156, 80], [164, 112], [174, 128],
    [180, 144], [200, 16], [212, 48], [221, 80], [232, 112], [244, 144], [256, 176], [267, 192], [277, 208], [287, 224],
    [295, 240], [300, 5120],
];
const TAP_NORMAL_DELAYS = [27, 27, 16, 30, 40]; // ARE, line ARE, DAS, lock delay, line clear delay
const TAP_NORMAL_SCORE = 6; // clears score six times as much
const TAP_NORMAL_TIME_BONUS = 1253, TAP_NORMAL_BONUS_SECONDS = 300; // x seconds under 5:00 at level 300
const TAP_NORMAL_ITEMS = { 100: "FREE FALL", 200: "DEL EVEN" }; // by the level that brings them

// ----------------------------------------------------------
// TGM1 (Tetris The Grand Master): plain ARS as in TAP, no sonic drop, and TGM3's gravity table
// (TAP and TGM3 kept TGM1's). The delays never change.

const TGM1_DELAYS = [30, 30, 16, 30, 41]; // ARE, line ARE, DAS, lock delay, line clear delay
// Score for each grade 9 ... S9 (labels as TGM_GRADE_LABELS)
const TGM1_GRADE_SCORES = [0, 400, 800, 1400, 2000, 3500, 5500, 8000, 12000,
    16000, 22000, 30000, 40000, 52000, 66000, 82000, 100000, 120000];
// GM: [level, score, frames] reached with at least that score within that time: 12,000 by 4:15
// at 300, 40,000 by 7:30 at 500, 126,000 by 13:30 at 999 (limits inclusive, as in NullpoMino)
const TGM1_GM_CHECKS = [[300, 12000, 255 * 60], [500, 40000, 450 * 60], [999, 126000, 810 * 60]];
// GM's staff roll: blocks stay visible, and topping out in it still ends in GM
const TGM1_ROLL_FRAMES = 2968;

// ----------------------------------------------------------
// The TGM series: levels to 999 (or the mode's end), ARE and line clear delays, grades, staff roll

class TgmGame extends RuleGame {
    constructor(mode, variant) {
        super(mode, variant);
        this.tgm = true;
        this.dasInclusive = true; // the delay tables are tetris.wiki's, with DAS counted inclusively
        this.moveOnSpawn = false; // a piece's first frame takes only IRS and gravity (NullpoMino, Cambridge)
        this.dasFreezeAre = 1; // frames at the start of an ARE without a clear that don't charge DAS
        this.level = 0;
        this.combo = 1; // TGM's combo: a score multiplier
        this.bufferTop = TGM_BUFFER_TOP;
        this.iKicks = KICKS_I_ARIKA;
        this.nextCount = TGM_NEXT;
        this.randomizer = new TiRandomizer(Date.now());
        this.maxLevel = TGM_MAX_LEVEL;
        this.sectionStops = true; // a new piece doesn't pass x99 (TAP Normal: only the last stop)
        this.internalGrading = false; // grade points and their decay (TGM3 and TAP Master)
        this.hasKill = false; // the 15-minute speed-up (TGM3 Master and Easy)
        this.invisibleRollName = "INVISIBLE ROLL";

        // Grading (TGM3 and TAP Master)
        this.internalGrade = 0;
        this.gradePoints = 0;
        this.gradeDecay = 0; // decay timer: frames since the last decay tick or internal grade
        this.gradeCombo = 0; // combo for grade points: clears of 2+ lines in a row (singles keep it)
        this.cools = 0; // COOLs from finished sections
        this.coolPending = false; // COOL earned in the current section
        this.coolChecked = false; // this section's *70 mark has been judged
        this.coolShown = false; // this section's COOL!! has been shown (at *82)
        this.prevCool = false; // the previous section earned a COOL
        this.prevCoolTime = 0; // seconds the previous section took to reach *70
        this.speedBonus = 0; // speed levels added by COOLs
        this.section = 0;
        this.sectionStart = 0; // frame the current section began
        this.finalGrade = null; // "M" or "GM", beyond what grade points give

        // Staff roll
        this.roll = null; // "fading", "invisible" or "visible"
        this.rollFrames = 0;
        this.rollPoints = 0; // roll grade points, hundredths of a grade
        this.rollCleared = false; // survived the whole roll
        this.rollLines = 0; // lines cleared in the roll
        this.rollLength = TGM_ROLL_FRAMES;
        this.rollHide = TGM_ROLL_HIDE; // frames until locked blocks hide, by roll
        this.lockTime = null; // per cell, rollFrames when it locked (during the roll)
        this.secretGrade = null; // judged when the game ends (secretGradeLabels), if high enough to show
        this.tested = false; // a hidden test setup was used (testSetup)
    }

    // ----------------------------------------------------------
    // Secret grade

    secretGradeLabels() { return null; } // by rows of the pattern; null: the mode has none

    // Rows of the ">" pattern from the bottom: one hole each, in column 0 in the bottom row, 9 in the
    // tenth and 0 again in the nineteenth, with a block above it and every other cell filled
    secretGradeRows() {
        let rows = 0;
        for (let r = HEIGHT - 1; r > VISIBLE_TOP; r--) {
            const hole = WIDTH - 1 - Math.abs(r - VISIBLE_TOP - WIDTH);
            if (this.getCell(r, hole) || !this.getCell(r - 1, hole)) break;
            if (!this.field[r - FIELD_TOP].every((v, c) => c === hole || v)) break;
            rows++;
        }
        return rows;
    }

    endGame(title, sub) {
        super.endGame(title, sub);
        const labels = this.secretGradeLabels(), rows = labels ? this.secretGradeRows() : 0;
        this.secretGrade = rows >= SECRET_GRADE_MIN_ROWS ? labels[rows - 1] : null;
    }

    endNotes() {
        return this.secretGrade ? [`SECRET GRADE ${this.secretGrade}`] : [];
    }

    // Opacity of a settled block: during the staff roll they fade or vanish after locking,
    // and come back when the game ends
    blockAlpha(row, col) {
        if (!this.roll || this.gameover || row < FIELD_TOP || row >= HEIGHT) return 1;
        const age = this.rollFrames - this.lockTime[row - FIELD_TOP][col];
        const hide = this.rollHide[this.roll];
        if (this.roll === "invisible") return age < hide ? 1 : 0;
        return clamp((hide - age) / TGM_ROLL_FADE_FRAMES, 0, 1);
    }

    getStats() {
        const stop = Math.min(this.maxLevel, (Math.floor(this.level / 100) + 1) * 100);
        const level = ["LEVEL", `${this.level} / ${stop}`];
        // during the staff roll the timer is stopped and the time row counts the roll down
        const time = this.roll ? ["ROLL", this.formatTime(Math.max(0, this.rollLength - this.rollFrames))] : ["TIME", this.formatTime()];
        const [ruleSet, mode] = this.statsName();
        return this.tgmStats([ruleSet, this.bigMode ? `${mode} BIG` : mode], level, time);
    }

    statsName() { return ["", ""]; } // [rule set, mode]

    // Grade, then level, then time
    record() {
        return { key: [this.gradeRank(), this.level, -this.frames], text: `${this.gradeLabel()} · LV ${this.level} · ${this.formatTime()}` };
    }

    // The grade as a number to compare: its place in TGM_GRADE_LABELS, M and GM above them all
    gradeRank() {
        if (this.finalGrade === "GM") return TGM_GRADE_LABELS.length + 1;
        if (this.finalGrade === "M") return TGM_GRADE_LABELS.length;
        return TGM_GRADE_LABELS.indexOf(this.gradeLabel()); // -1: none yet (TAP Death's "—")
    }

    tgmStats(mode, level, time) {
        return [mode, ["GRADE", this.gradeLabel()], level, time, ["SCORE", this.scoreText()]];
    }

    gradeLabel() { return ""; }

    setTimings() {
        const speedLevel = this.level + this.speedBonus;
        [, this.are, this.lineAre, this.das, this.lockDelayMax, this.lineClearDelay] = this.delayRow(speedLevel);
        this.arr = 1;
        this.gravity = this.gravityAt(speedLevel);
        this.softGravity = Math.max(this.gravity, 1); // World rule soft drop: fixed 1G, non-locking
    }

    // [level, ARE, line ARE, DAS, lock delay, line clear delay] at a speed level
    delayRow(speedLevel) {
        return tableLookup(TGM_DELAYS, speedLevel);
    }

    gravityAt(speedLevel) {
        return tableLookup(TGM_GRAVITY, speedLevel)[1] / 65536;
    }

    ghostVisible() {
        return super.ghostVisible() && (this.tls || this.level < TGM_GHOST_UNTIL); // TLS: all game
    }

    onClock() {
        if (this.roll && ++this.rollFrames >= this.rollLength) {
            this.endRoll();
            return false;
        }
        return true;
    }

    onActiveFrame() {
        if (this.internalGrading && !this.roll) this.decayGrade();
    }

    // DAS doesn't charge (tetris.wiki: TGM1, TAP; TGM3 taken as TAP) during the line clear delay (and
    // the staff roll's start), the first frames of an ARE after a piece that cleared nothing
    // (dasFreezeAre: the lock flash), the last frame of ARE and the frame a piece enters
    dasCharges() {
        if (this.phase === "lineclear" || this.phase === "rollstart") return false;
        if (this.phase === "are") {
            const frame = this.phaseCounter + 1; // this frame's place in the ARE
            if (frame >= this.phaseLength - 1) return false;
            if (this.chain < 0 && frame <= this.dasFreezeAre) return false;
        }
        return !this.entersThisFrame();
    }

    // A piece will enter in this frame (asked before the frame advances the phase)
    entersThisFrame() {
        if (this.phase === "ready") return this.startdelayCounter + 1 > this.startdelayMax;
        if (this.phase === "are" || this.phase === "rollstart") return this.phaseCounter + 1 >= this.phaseLength;
        return false;
    }

    spawnPosition() {
        return [this.ars ? ARS_SPAWN_ROW : TGM_SPAWN_ROW, 3];
    }

    // Level +1 per new piece, except at section stops (x99 and the one before the end) and in the
    // staff roll (TAP Death's can start at 500)
    afterSpawn(newPiece) {
        if (!this.firstPiece && newPiece && !this.roll && !(this.sectionStops && this.level % 100 === 99)
            && this.level !== this.maxLevel - 1) {
            this.level++;
            this.updateSection();
            this.updateTimings();
        }
    }

    onBlockOut() {
        this.endGame("GAME OVER", this.roll ? `GRADE ${this.gradeLabel()} — ESC FOR MENU` : "BLOCK OUT — ESC FOR MENU");
    }

    // Up: Classic's sonic drop (no lock), World's hard drop
    upKey() {
        if (!this.ars) return super.upKey();
        this.sonicDrop();
        return false;
    }

    // Classic: soft drop locks on the ground, and so does a piece whose lock delay was zeroed by
    // rotating after a floor kick
    onGround() {
        if (this.ars && (this.softHeld() || this.lockDelayZeroed)) {
            this.manualLock = this.softHeld();
            this.lock();
            return;
        }
        super.onGround();
    }

    // Classic: step reset only. World: move reset, with separate limits for rotations and moves
    onMoveReset(isRotation) {
        if (this.ars || !this.touched) return;
        if (isRotation) {
            if (this.rotationResets >= TGM_ROTATION_RESETS) return;
            this.rotationResets++;
        } else {
            if (this.moveResets >= TGM_MOVE_RESETS) return;
            this.moveResets++;
        }
        this.curPiece_lockDelay = 0;
    }

    onHardDrop(distance) {
        this.sonicMax = Math.max(this.sonicMax, distance); // scored as TGM's sonic distance
    }

    onBlockLocked(cell) {
        if (this.roll) this.lockTime[cell.row - FIELD_TOP][cell.col] = this.rollFrames;
    }

    onCollapse(rows) {
        if (this.lockTime) this.lockTime = this.dropRows(this.lockTime, rows, () => new Array(WIDTH).fill(0));
    }

    // After a line clear: the next piece, or the staff roll once the timer has stopped
    // (the end level, or TAP Death's level 500 reached too late)
    afterClear() {
        this.fireItems();
        if (this.timerStopped && !this.roll) this.startRollStart();
        else super.afterClear();
    }

    scoreClear(n, rows) {
        this.scoreTgm(n, rows);
    }

    // A piece locked, clearing n lines. In the staff roll clears count lines and whatever the mode
    // gives for them (scoreRollClear); otherwise the combos are kept here and the game scores the
    // clear (scoreLines)
    scoreTgm(n, rows) {
        if (this.roll) {
            if (n === 0) return;
            this.lines += n;
            this.scoreRollClear(n, rows);
            this.addClearActions(n);
            return;
        }
        if (n === 0) {
            this.combo = 1;
            this.gradeCombo = 0;
            this.onMiss();
            return;
        }
        this.combo = this.combo + 2 * n - 2;
        if (n >= 2) this.gradeCombo++;
        this.scoreLines(n, rows);
    }

    scoreRollClear(n, rows) {} // a clear in the staff roll
    onMiss() {} // a piece locked without clearing (outside the roll)
    scoreLines(n, rows) {} // a clear of n lines (outside the roll)
    updateSection() {} // section bookkeeping after a level change

    // Per-piece score terms: frames of soft drop and the speed bonus, the lock delay left unused. A
    // soft drop lock on the ground adds 1 by its own frame (tetris.wiki); a hard drop lock (World)
    // adds 1 too (NullpoMino's manual lock).
    tgmPieceBonus() {
        return {
            soft: this.softFrames + (this.hardDropped ? 1 : 0),
            speed: Math.max(0, this.lockDelayMax - Math.max(1, this.activeTime)),
        };
    }

    // ----------------------------------------------------------
    // Grading (TGM3 and TAP Master)

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
        const mult = this.gradeComboMultiplier(n, Math.min(10, combo) - 1);
        const levelMult = 1 + Math.floor(levelBefore / 250);
        // in tenths, so the ceiling sees exact integers (50 x 2.2 is 110.00000000000001)
        const tenths = TGM_GRADES[this.internalGrade][1 + n] * Math.round(mult * 10);
        return Math.ceil(tenths / 10) * levelMult;
    }

    // TGM3: singles x1, combo multipliers for 2-4 lines (c: combo - 1)
    gradeComboMultiplier(n, c) {
        return n === 1 ? 1 : TGM_GRADE_COMBO[c][n - 2];
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

    // ----------------------------------------------------------
    // Staff roll

    // The end level: the field is emptied row by row from the bottom, then the roll begins
    startRollStart() {
        // as in NullpoMino: a line clear delay, a row every few frames, two frames more
        this.setPhase("rollstart", this.lineClearDelay + HEIGHT * TGM_ROLL_ROW_FRAMES + 2);
        this.nextRoll = this.rollKind();
    }

    rollKind() { return "visible"; } // the roll the player has earned

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
        this.onRollBegin();
        this.addAction(this.roll === "invisible" ? this.invisibleRollName : "STAFF ROLL", "grade");
        this.spawn(this.nextFromQueue(), false);
    }

    onRollBegin() {} // the roll starts (before its first piece)

    // Hidden test setups (the engine's Ctrl+Shift+digit keys):
    //  "roll"      straight to the staff roll the player has earned (TGM3: fading unless qualified)
    //  "invisible" TGM3: to the invisible roll: all COOLs, internal grade 27 (TAP Master: the M-roll)
    //  "gm"        TGM3: to an invisible roll that ends in Grand Master if survived (TAP Master: the
    //              M-roll; TGM1: the GM roll)
    //  "rollend"   in the roll: to its last 5 seconds
    //  "kill"      10 seconds before the 15-minute speed-up (TGM3 Master only)
    //  "fireworks" TGM3 Easy: a volley of fireworks
    //  "secret"    the modes with a secret grade: the full ">" pattern, and the game over that shows it
    // Returns whether the setup applied.
    testSetup(name) {
        if (this.gameover || this.phase === "ready") return false;
        if (name === "kill") {
            if (!this.hasKill) return false;
            const skip = TGM_KILL_FRAMES - TEST_KILL_LEAD - this.frames;
            if (this.timerStopped || skip <= 0) return false;
            this.frames += skip;
            this.sectionStart += skip; // the section isn't slower for it (no REGRET)
            this.tested = true;
            return true;
        }
        if (name === "fireworks") return this.testFireworks();
        if (name === "secret") return this.testSecretGrade();
        if (name === "rollend") {
            if (!this.roll) return false;
            this.rollFrames = Math.max(this.rollFrames, this.rollLength - TEST_ROLL_LEAD);
            this.tested = true;
            return true;
        }
        if (this.roll || this.phase === "rollstart" || !["roll", "invisible", "gm"].includes(name)) return false;
        if (!this.prepareTestRoll(name)) return false;
        this.tested = true;
        if (this.phase === "lineclear") this.collapse(this.pendingRows);
        this.pendingRows = [];
        this.curPiece_type = 0;
        this.shadowRow = -100;
        this.level = this.maxLevel;
        this.timerStopped = true;
        this.updateTimings();
        this.startRollStart();
        return true;
    }

    testFireworks() { return false; } // only Easy has fireworks

    // Fills the well with the secret grade's pattern (the highest grade) and ends the game
    testSecretGrade() {
        if (!this.secretGradeLabels()) return false;
        if (this.phase === "lineclear") this.collapse(this.pendingRows);
        this.pendingRows = [];
        for (const row of this.field) row.fill(0);
        for (let r = HEIGHT - 1; r > VISIBLE_TOP; r--) {
            const hole = WIDTH - 1 - Math.abs(r - VISIBLE_TOP - WIDTH);
            this.field[r - FIELD_TOP].fill(1);
            this.field[r - FIELD_TOP][hole] = 0;
        }
        this.field[VISIBLE_TOP - FIELD_TOP][0] = 1; // covers the top row's hole
        this.tested = true;
        this.curPiece_type = 0;
        this.shadowRow = -100;
        this.endGame("TEST", this.formatTime());
        return true;
    }

    // The game's state for a test roll ("roll", "invisible" or "gm"); false if the mode has none such
    prepareTestRoll(name) {
        return name === "roll";
    }

    // Survived the roll
    endRoll() {
        this.rollCleared = true;
        this.finishRoll();
    }

    finishRoll() {
        this.endGame("COMPLETE", this.formatTime());
    }
}

// ----------------------------------------------------------
// TGM1: Master and 20G. Plain ARS like TAP but no sonic drop, constant delays, grades from the
// score, GM for meeting score and time checkpoints, then a staff roll that can't be lost.

class Tgm1Game extends TgmGame {
    constructor(mode, variant) {
        super(mode, variant);
        this.useArs(true);
        this.hasHold = false;
        this.nextCount = TAP_NEXT;
        this.dasFreezeAre = 4; // tetris.wiki: the first 4 frames of ARE
        this.randomizer = new Tgm1Randomizer(Date.now());
        this.rollLength = TGM1_ROLL_FRAMES;
        this.rollHide = VISIBLE_ROLL_HIDE;
        this.gmQualified = true; // every GM checkpoint reached so far was met
    }

    statsName() {
        return ["TGM1", VARIANT_NAMES[this.variant] || "MASTER"];
    }

    secretGradeLabels() { return SECRET_GRADE_LABELS; }

    // From the score; GM for meeting the checkpoints
    gradeLabel() {
        if (this.finalGrade) return this.finalGrade;
        let i = 0;
        while (i + 1 < TGM1_GRADE_SCORES.length && this.score >= TGM1_GRADE_SCORES[i + 1]) i++;
        return TGM_GRADE_LABELS[i];
    }

    delayRow() {
        return [0, ...TGM1_DELAYS];
    }

    upKey() { return false; } // neither hard nor sonic drop

    onBlockOut() {
        if (this.roll) this.endRoll(); // the GM roll can't be lost
        else super.onBlockOut();
    }

    // A clear of n lines (after scoreTgm). Score = (ceil((level + lines) / 4) + soft) x lines
    // x combo x bravo; the grade follows the score. Level 999 ends the game, or with every GM
    // checkpoint met gives GM and the staff roll.
    scoreLines(n) {
        this.scoreTgm1(n);
    }

    scoreTgm1(n) {
        const levelBefore = this.level;
        const bravo = this.fieldEmpty() ? 4 : 1;
        this.score += (Math.ceil((levelBefore + n) / 4) + this.tgmPieceBonus().soft) * n * this.combo * bravo;
        this.lines += n;
        this.addClearActions(n);
        if (bravo > 1) this.addAction("BRAVO", "pc");

        this.level = Math.min(TGM_MAX_LEVEL, levelBefore + n); // one level per line
        for (const [level, score, frames] of TGM1_GM_CHECKS) {
            if (levelBefore < level && this.level >= level && (this.score < score || this.frames > frames)) this.gmQualified = false;
        }
        this.updateTimings();
        this.setShadow();
        if (this.level < TGM_MAX_LEVEL) return;
        this.timerStopped = true;
        if (this.gmQualified) { // the staff roll starts after the clear (afterClear)
            this.finalGrade = "GM";
            this.addAction("GRADE GM", "grade");
        } else {
            this.endGame("COMPLETE", `GRADE ${this.gradeLabel()} — ${this.formatTime()}`);
        }
    }

    // the only roll is GM's
    prepareTestRoll(name) {
        if (name === "invisible") return false;
        this.gmQualified = true;
        this.finalGrade = "GM";
        return true;
    }

    finishRoll() {
        this.endGame("GRAND MASTER", `GRADE GM — ${this.formatTime()}`);
    }
}

// ----------------------------------------------------------
// TAP (TGM2 The Absolute Plus): Master (grades 9 to GM, fading roll or M-roll), Death (20G, M at
// level 500, GM at 999), TGM+ (rising garbage) and Normal (to level 300 with two items). Plain ARS
// without TGM3's kicks, sonic drop, no hold, one next piece, the TGM2 randomizer.

class TapGame extends TgmGame {
    constructor(mode, variant) {
        super(mode, variant);
        this.useArs(true);
        this.hasHold = false;
        this.nextCount = TAP_NEXT;
        this.randomizer = new TapRandomizer(Date.now());
        this.tapPlus = variant === "plus";
        this.death = variant === "death";
        this.normal = variant === "normal";
        this.internalGrading = !this.tapPlus && !this.normal; // Death's points are unused
        if (this.normal) {
            this.maxLevel = TAP_NORMAL_MAX_LEVEL;
            this.sectionStops = false;
        }
        // Normal: its two items (RuleGame's item pieces)
        if (this.normal) this.itemCells = this.field.map(() => new Array(WIDTH).fill(null));
        this.sonicTrail = !this.death; // TAP shows the drop trail for the sonic drop too (not Death)
        this.invisibleRollName = "M-ROLL";
        this.rollLength = this.tapPlus ? TAP_PLUS_ROLL_FRAMES : TAP_ROLL_FRAMES;
        this.rollHide = TAP_ROLL_HIDE;
        this.sectionTimes = []; // frames each finished section took
        this.sectionTetrises = 0; // Tetrises in the current section
        this.mrollQualified = true; // every finished section met the M-roll conditions
        this.torikan = false; // Death: reached 500 too late, the roll starts there
        this.garbageCount = 0; // TGM+: pieces locked without a clear
        this.garbagePos = 0; // TGM+: next row of the pattern
    }

    statsName() {
        return ["TGM2 TAP", VARIANT_NAMES[this.variant] || "MASTER"];
    }

    // Master and Death (the modes with grades)
    secretGradeLabels() { return this.tapPlus || this.normal ? null : SECRET_GRADE_LABELS; }

    tgmStats(mode, level, time) {
        if (this.tapPlus || this.normal) return [mode, level, time, ["SCORE", this.scoreText()]]; // no grades
        return super.tgmStats(mode, level, time);
    }

    // TGM+: level, then time; Normal: the score
    record() {
        if (this.tapPlus) return { key: [this.level, -this.frames], text: `LV ${this.level} · ${this.formatTime()}` };
        if (this.normal) return { key: [this.score], text: this.scoreText() };
        return super.record();
    }

    // Death has no grade until M at level 500
    gradeLabel() {
        if (this.finalGrade || this.death) return this.finalGrade || "—";
        return TGM_GRADE_LABELS[Math.min(TAP_MAX_GRADE, TGM_GRADES[this.internalGrade][0])];
    }

    delayRow(speedLevel) {
        if (this.death) return tableLookup(TAP_DEATH_DELAYS, speedLevel);
        if (this.tapPlus) return [0, ...TAP_PLUS_DELAYS];
        if (this.normal) return [0, ...TAP_NORMAL_DELAYS];
        return super.delayRow(speedLevel);
    }

    gravityAt(speedLevel) {
        if (this.normal) return tableLookup(TAP_NORMAL_GRAVITY, this.level)[1] / 256;
        return super.gravityAt(speedLevel);
    }

    // Normal: a level reached brings its item piece, the next to enter
    afterSpawn(newPiece) {
        const before = this.level;
        super.afterSpawn(newPiece);
        this.checkItem(before);
    }

    checkItem(levelBefore) {
        if (!this.normal) return;
        for (const [key, item] of Object.entries(TAP_NORMAL_ITEMS)) {
            const level = Number(key);
            if (levelBefore < level && this.level >= level) this.nextItem = item;
        }
    }

    // The roll starts on an empty field, without items
    onRollBegin() {
        if (this.itemCells) for (const marks of this.itemCells) marks.fill(null);
        this.nextItem = this.pieceItem = null;
    }

    // Combo multipliers apply to singles, doubles and triples, never to Tetrises
    gradeComboMultiplier(n, c) {
        return n === 4 ? 1 : TAP_GRADE_COMBO[c][n - 1];
    }

    onBlockOut() {
        if ((this.tapPlus || this.normal) && this.roll) return this.endRoll(); // TGM+'s and Normal's rolls can't be lost
        if (this.roll === "invisible") this.finalGrade = "M"; // M-roll not survived
        super.onBlockOut();
    }

    scoreRollClear(n) {
        this.rollLines += n;
    }

    // TGM+: a piece locked without clearing; enough of them in a row raise the pattern's next row
    onMiss() {
        if (this.tapPlus) this.tapPlusGarbage();
    }

    tapPlusGarbage() {
        if (++this.garbageCount < TAP_PLUS_RISE - Math.floor(this.level / 100)) return;
        const row = TAP_PLUS_PATTERN[this.garbagePos];
        this.raiseRow([...row].map(ch => ch === "." ? 0 : 1 + Math.floor(this.random() * 7)));
        this.garbagePos = (this.garbagePos + 1) % TAP_PLUS_PATTERN.length;
        this.garbageCount = 0;
    }

    scoreLines(n) {
        this.scoreTap(n);
    }

    // A clear of n lines (after scoreTgm). Score = (ceil((level + lines) / 4) + soft + 2 x sonic)
    // x lines x combo x bravo + ceil(level after / 2) + speed x 7; Normal: x6, and the time bonus at 300
    scoreTap(n) {
        const death = this.death;
        const levelBefore = this.level;
        const levelAfter = Math.min(this.maxLevel, levelBefore + n); // one level per line
        const { soft, speed } = this.tgmPieceBonus();
        const bravo = this.fieldEmpty() ? 4 : 1;
        const points = (Math.ceil((levelBefore + n) / 4) + soft + 2 * this.sonicMax) * n * this.combo * bravo
            + Math.ceil(levelAfter / 2) + speed * 7;
        this.score += this.normal ? TAP_NORMAL_SCORE * points : points;
        this.lines += n;
        this.addClearActions(n);
        if (bravo > 1) this.addAction("BRAVO", "pc");

        if (n === 4) this.sectionTetrises++;
        if (this.internalGrading && !death) this.scoreGrade(n, levelBefore);
        this.level = levelAfter;
        this.updateTapSection();

        if (death && !this.versus && levelBefore < TAP_DEATH_M_LEVEL && this.level >= TAP_DEATH_M_LEVEL) {
            if (this.frames <= TAP_DEATH_M_FRAMES) {
                this.finalGrade = "M";
                this.addAction("GRADE M", "grade");
            } else { // too late: the timer stops at 500 and the credits roll (afterClear)
                this.level = TAP_DEATH_M_LEVEL;
                this.torikan = true;
                this.timerStopped = true;
            }
        }
        if (this.level >= this.maxLevel) {
            this.timerStopped = true; // the staff roll starts after the clear (afterClear)
            if (death) {
                this.finalGrade = "GM";
                this.addAction("GRADE GM", "grade");
            }
            if (this.normal) this.score += TAP_NORMAL_TIME_BONUS * Math.max(0, Math.ceil(TAP_NORMAL_BONUS_SECONDS - this.frames / 60));
        }
        this.checkItem(levelBefore);
        this.updateTimings();
        this.setShadow();
    }

    updateSection() {
        this.updateTapSection();
    }

    // Master: judge a section against the M-roll conditions once it is finished (the last at 999)
    updateTapSection() {
        const section = Math.floor(this.level / 100);
        if (section === this.section && this.level < this.maxLevel) return;
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

    // Master: the M-roll needs S9 and 8:45 at level 999 and every section's conditions met
    mrollEarned() {
        return this.mrollQualified && this.frames <= TAP_MROLL_FRAMES
            && TGM_GRADES[this.internalGrade][0] >= TAP_MAX_GRADE;
    }

    rollKind() {
        if (this.death || this.tapPlus || this.normal) return "visible";
        return this.mrollEarned() ? "invisible" : "fading";
    }

    prepareTestRoll(name) {
        if (this.tapPlus || this.normal) return name === "roll";
        if (this.death) {
            if (name !== "roll") return false;
            this.finalGrade = "GM";
        } else if (name !== "roll") { // M-roll: every condition met, the timer within 8:45
            this.mrollQualified = true;
            this.internalGrade = TGM_GRADES.length - 1;
            this.frames = Math.min(this.frames, TAP_MROLL_FRAMES);
        }
        return true;
    }

    finishRoll() {
        const time = this.formatTime();
        if (this.tapPlus) {
            this.endGame("EXCELLENT", time);
        } else if (this.normal) {
            this.endGame("COMPLETE", `SCORE ${this.scoreText()} — ${time}`);
        } else if (this.death) { // the credits change nothing
            this.endGame(this.torikan ? "EXCELLENT" : "COMPLETE", `GRADE ${this.gradeLabel()} — ${time}`);
        } else if (this.roll === "invisible") {
            this.finalGrade = "GM";
            this.endGame("GRAND MASTER", `${this.rollLines >= TAP_ORANGE_LINES ? "ORANGE" : "GREEN"} LINE — ${time}`);
        } else {
            this.endGame("COMPLETE", `GRADE ${this.gradeLabel()} — ORANGE LINE — ${time}`);
        }
    }
}

// ----------------------------------------------------------
// TGM3 Terror-Instinct, Master mode, with the World rule (Arika SRS, hard drop, limited lock
// resets) or the Classic rule (ARS with TGM3's I and T kicks, sonic drop, locking soft drop, step
// reset, Sega colours). Grades with COOLs and REGRETs, the staff roll (fading, or invisible with all
// COOLs) which can earn Grand Master, and the speed-up to 20G after 15 minutes.

class TiGame extends TgmGame {
    constructor(mode, variant) {
        super(mode, variant);
        if (mode === tgmClassic) this.useArs(false);
        this.internalGrading = true;
        this.hasKill = true;
        this.exams = false; // the qualified grade and its exams (Master, not Big)
        this.qualified = 0;
        this.exam = null;
    }

    // Exams (the Exams card): exams on, the player's qualified grade and this game's exam
    // (tgm3ExamFor), for Master without Big
    setOptions(options = {}) {
        super.setOptions(options);
        const { exams = false, qualified = 0, exam = null } = options;
        this.exams = exams && this.variant === "standard" && !this.big;
        this.qualified = this.exams ? qualified : 0;
        this.exam = this.exams ? exam : null;
    }

    statsName() {
        // the standard mode is named after its rule (World or Classic)
        const rule = this.ars ? "CLASSIC" : "WORLD";
        const variantName = VARIANT_NAMES[this.variant];
        return ["TGM3 TI", variantName ? `${rule} ${variantName}` : rule];
    }

    secretGradeLabels() { return SECRET_GRADE_LABELS; }

    // A promotional exam takes the score's place
    tgmStats(mode, level, time) {
        const stats = super.tgmStats(mode, level, time);
        if (this.exam && this.exam.kind === "promotion") stats[stats.length - 1] = ["EXAM", TGM_GRADE_LABELS[this.exam.grade]];
        return stats;
    }

    // Displayed grade: the one earned, but with exams Grand Master only for a player qualified as
    // one or passing the exam for it (MasterM otherwise)
    gradeIndex() {
        const i = this.earnedGradeIndex();
        const gm = this.qualified > TGM_MAX_GRADE || (this.exam && this.exam.kind === "promotion" && this.exam.grade > TGM_MAX_GRADE);
        return this.exams && !gm ? Math.min(i, TGM_MAX_GRADE) : i;
    }

    // Boosts + COOLs + roll grade; Grand Master only for surviving the invisible roll
    earnedGradeIndex() {
        const i = TGM_GRADES[this.internalGrade][0] + this.cools + Math.floor(this.rollPoints / 100);
        const max = this.rollCleared && this.roll === "invisible" ? TGM_GRADE_LABELS.length - 1 : TGM_MAX_GRADE;
        return Math.min(i, max);
    }

    // The exam is announced with the first piece
    afterSpawn(newPiece) {
        if (this.firstPiece && this.exam && this.exam.kind === "promotion") this.addAction(`EXAM ${TGM_GRADE_LABELS[this.exam.grade]}`, "grade");
        super.afterSpawn(newPiece);
    }

    endNotes() {
        const notes = super.endNotes(), exam = this.exam;
        if (!exam) return notes;
        const label = TGM_GRADE_LABELS[exam.grade], passed = this.earnedGradeIndex() >= exam.grade;
        if (exam.kind === "promotion") notes.unshift(passed ? `EXAM PASSED — QUALIFIED ${label}` : `EXAM FAILED — ${label} NOT REACHED`);
        else notes.unshift(passed ? `QUALIFIED ${label} KEPT` : `DEMOTED TO ${TGM_GRADE_LABELS[Math.max(0, exam.grade - 1)]}`);
        return notes;
    }

    gradeLabel() {
        return TGM_GRADE_LABELS[this.gradeIndex()];
    }

    gradeRank() {
        return this.gradeIndex();
    }

    // After 15 minutes: 20G and the kill delays
    setTimings() {
        super.setTimings();
        if (this.hasKill && this.frames >= TGM_KILL_FRAMES) {
            [this.are, this.lineAre, this.das, this.lockDelayMax, this.lineClearDelay] = TGM_KILL_DELAYS;
            this.gravity = this.softGravity = 20;
        }
    }

    onClock() {
        if (this.hasKill && !this.timerStopped && this.frames === TGM_KILL_FRAMES) this.updateTimings();
        return super.onClock();
    }

    scoreLines(n, rows) {
        this.scoreTi(n, rows);
    }

    // A clear of n lines (after scoreTgm): levels +1/+2/+4/+6, the mode's points (scoreTiClear),
    // sections, then the end level or a level stop (checkLevelStop)
    scoreTi(n, rows) {
        const levelBefore = this.level;
        const levelAfter = Math.min(this.maxLevel, levelBefore + TGM_LEVEL_FOR_LINES[n]);
        this.scoreTiClear(n, rows, levelBefore, levelAfter);
        this.lines += n;
        this.addClearActions(n);

        this.level = levelAfter;
        this.updateSection();
        this.updateTimings();
        this.setShadow();

        if (this.level >= this.maxLevel) {
            this.timerStopped = true; // the staff roll starts after the clear (afterClear)
        } else {
            this.checkLevelStop(levelBefore);
        }
    }

    // Master: the score and grade points
    scoreTiClear(n, rows, levelBefore, levelAfter) {
        this.scoreTiPoints(n, levelBefore, levelAfter);
        this.scoreGrade(n, levelBefore);
    }

    // Score = (ceil((level + lines) / 4) + soft + sonic) x lines x combo + ceil(level after / 2) + speed
    scoreTiPoints(n, levelBefore, levelAfter) {
        const { soft, speed } = this.tgmPieceBonus();
        this.score += (Math.ceil((levelBefore + n) / 4) + soft + this.sonicMax) * n * this.combo
            + Math.ceil(levelAfter / 2) + speed;
    }

    // Master: reaching 500 after 7:00 ends the game, but not in a promotional exam (tetris.wiki)
    checkLevelStop(levelBefore) {
        if (this.exam && this.exam.kind === "promotion") return;
        if (levelBefore < TGM_TORIKAN_LEVEL && this.level >= TGM_TORIKAN_LEVEL && this.frames > TGM_TORIKAN_FRAMES) {
            this.level = TGM_TORIKAN_LEVEL;
            this.endGame("LEVEL STOP", "OVER 7:00 AT LEVEL 500");
        }
    }

    // Section bookkeeping after a level change: judge the COOL at *70, and when a
    // section ends (the last one at 999) award its COOL or give a REGRET for taking too long
    updateSection() {
        const section = Math.floor(this.level / 100);
        const seconds = (this.frames - this.sectionStart) / 60;
        const finished = section > this.section || this.level >= TGM_MAX_LEVEL;
        // Big: no section COOLs (tetris.wiki)
        if (!this.coolChecked && !this.bigMode && this.level % 100 >= 70 && this.section < TGM_COOL_TIME.length) {
            this.coolChecked = true;
            if (seconds <= TGM_COOL_TIME[this.section]
                && (!this.prevCool || seconds <= this.prevCoolTime + TGM_COOL_SLACK)) {
                this.coolPending = true;
            }
            this.prevCoolTime = seconds;
        }
        if (this.coolPending && !this.coolShown && this.level % 100 >= TGM_COOL_SHOWN) {
            this.coolShown = true;
            this.addAction("COOL!!", "grade");
        }
        if (finished) {
            if (this.coolPending) {
                this.cools++;
                this.speedBonus += TGM_COOL_SPEEDUP;
            }
            if (seconds > TGM_REGRET_TIME[this.section]) {
                // fall back to the highest internal grade with one boost less, the points gone; with
                // no boosts it changes nothing, not even the points (tetris.wiki)
                const boosts = TGM_GRADES[this.internalGrade][0];
                if (boosts > 0) {
                    while (TGM_GRADES[this.internalGrade][0] >= boosts) this.internalGrade--;
                    this.gradePoints = 0;
                }
                this.addAction("REGRET!!", "grade");
            }
            this.prevCool = this.coolPending;
            this.section = section;
            this.sectionStart = this.frames;
            this.coolPending = false;
            this.coolChecked = false;
            this.coolShown = false;
        }
    }

    // Roll clears earn roll grade
    scoreRollClear(n) {
        this.rollPoints += (this.bigMode ? TGM_BIG_ROLL_POINTS : TGM_ROLL_POINTS[this.roll])[n];
    }

    rollKind() {
        const invisible = this.cools >= TGM_INVISIBLE_COOLS && this.internalGrade >= TGM_INVISIBLE_GRADE;
        return invisible ? "invisible" : "fading";
    }

    prepareTestRoll(name) {
        if (name === "invisible") {
            this.cools = TGM_INVISIBLE_COOLS;
            this.internalGrade = Math.max(this.internalGrade, TGM_INVISIBLE_GRADE);
        } else if (name === "gm") {
            this.cools = TGM_INVISIBLE_COOLS;
            this.internalGrade = TGM_GRADES.length - 1;
            this.rollPoints = TEST_GM_ROLL_POINTS;
        }
        return true;
    }

    // Survived the roll: its bonus, then the final grade
    finishRoll() {
        this.rollPoints += TGM_ROLL_CLEAR[this.roll];
        const gm = this.gradeIndex() === TGM_GRADE_LABELS.length - 1;
        this.endGame(gm ? "GRAND MASTER" : "COMPLETE", `GRADE ${this.gradeLabel()} — ${this.formatTime()}`);
    }
}

// ----------------------------------------------------------
// TGM3 Easy: to level 200 with fixed delays, scored in fireworks (the community analysis "TGM3
// Easy mode hanabi" that tetris.wiki links to), then a 20G staff roll with free fireworks

class TiEasyGame extends TiGame {
    constructor(mode, variant) {
        super(mode, variant);
        this.internalGrading = false;
        this.maxLevel = EASY_MAX_LEVEL;
        this.rollLength = EASY_ROLL_FRAMES;
        this.rollHide = VISIBLE_ROLL_HIDE;
        // fireworks fired, waiting in the streams, and the bonuses' state
        this.hanabi = 0;
        this.hanabiPending = 0;
        this.bravoPending = 0;
        this.easyClock = 0; // frames since the start, for the streams
        this.easyCombo = 0;
        this.fireTimer = 0; // frames left of the fixed speed combo bonus
        this.sinceClear = 0; // frames since the last clear (variable speed bonus)
        this.clearAre = false; // in the ARE after a clear
        this.bonus30 = false;
        this.levelMark30 = 0; // level at the start of the current 30 s period
        this.rollInterval = 0; // frames between the roll's free fireworks
    }

    tgmStats(mode, level, time) {
        return [mode, ["HANABI", String(this.hanabi)], level, time];
    }

    secretGradeLabels() { return null; } // no grades

    // The fireworks (those still waiting are counted when the game ends)
    record() {
        return { key: [this.hanabi], text: `${this.hanabi} HANABI` };
    }

    delayRow() {
        return [0, ...EASY_DELAYS];
    }

    gravityAt() {
        return tableLookup(EASY_GRAVITY, this.level)[1] / 256;
    }

    onClock() {
        this.easyFrame();
        return super.onClock();
    }

    beforeSpawn() {
        this.clearAre = false;
    }

    onBlockOut() {
        this.flushHanabi();
        this.endGame("GAME OVER", `HANABI ${this.hanabi} — ESC FOR MENU`);
    }

    scoreTiClear(n, rows, levelBefore, levelAfter) {
        this.easyHanabi(n, rows, levelBefore, levelAfter);
    }

    checkLevelStop() {}
    updateSection() {}

    scoreRollClear(n, rows) {
        this.easyHanabi(n, rows, this.level, this.level);
    }

    onMiss() {
        this.easyCombo = 0;
    }

    rollKind() { return "visible"; }

    onRollBegin() {
        if (this.hanabi > 0) this.rollInterval = Math.floor(EASY_ROLL_FRAMES / this.hanabi); // fired ones only
    }

    prepareTestRoll(name) {
        return name === "roll";
    }

    finishRoll() {
        this.fire(EASY_COMPLETE);
        this.flushHanabi();
        this.endGame("EXCELLENT", `HANABI ${this.hanabi} — ${this.formatTime()}`);
    }

    // Every frame after the countdown: the streams fire, the bonus timers run, and every 30 s of play
    // that gained 30 levels earns the next clear a bonus
    easyFrame() {
        this.easyClock++;
        if (this.easyClock % EASY_STREAM_FRAMES === 0) {
            if (this.hanabiPending > 0) {
                this.hanabiPending--;
                this.fire();
                this.fireTimer = EASY_FIXED_SPEED_FRAMES;
            }
            if (this.bravoPending > 0) {
                this.bravoPending--;
                this.fire();
            }
        }
        if (this.fireTimer > 0) this.fireTimer--; // the frame it is set too
        if (this.roll && this.rollInterval && this.easyClock % this.rollInterval === 0) this.fire();
        if (!this.timerStopped && this.frames % EASY_30S_FRAMES === 0) {
            if (this.level - this.levelMark30 >= EASY_30S_LEVELS) this.bonus30 = true;
            this.levelMark30 = this.level;
        }
        if (this.phase !== "lineclear" && !(this.phase === "are" && this.clearAre)) this.sinceClear++;
    }

    // A clear of n lines (rows) from levelBefore to levelAfter: its fireworks join the stream
    easyHanabi(n, rows, levelBefore, levelAfter) {
        let combo;
        if (this.roll) { // frozen combo, singles included
            combo = EASY_ROLL_COMBO[EASY_ROLL_COMBO_MAP[this.easyCombo]];
        } else {
            if (n >= 2) this.easyCombo = Math.min(EASY_COMBO_MAX, this.easyCombo + 1);
            combo = n >= 2 ? EASY_COMBO[this.easyCombo] : 1;
        }
        let m = EASY_BASE[Math.min(n, 4)] * combo;
        if (this.fireTimer > 0) m *= EASY_FIXED_SPEED;
        if (rows.some((r, i) => i > 0 && r !== rows[i - 1] + 1)) m *= EASY_SPLIT;
        // the roll checks the level after the clear less the lines: 200 (203 after a Tetris) - n
        const lucky = this.roll ? (n === 4 ? 203 : 200) - n : levelBefore;
        if (EASY_LUCKY_LEVELS.includes(lucky)) m *= EASY_LUCKY;
        if (this.bonus30) {
            m *= EASY_30S;
            this.bonus30 = false;
        }
        const L = this.roll ? EASY_MAX_LEVEL : levelAfter;
        const since = Math.max(2, this.sinceClear), active = Math.max(1, this.activeTime);
        if (L - since > EASY_VAR_SPEED) m *= (L - since) / EASY_VAR_SPEED;
        if (L - active > EASY_VAR_FINESSE) m *= (L - active) / EASY_VAR_FINESSE;
        if (this.lastRotation && this.lockedType !== tetO) {
            m *= this.lockedType === tetT ? (n === 3 ? EASY_TSPIN_TRIPLE : EASY_TSPIN) : EASY_SPIN;
        }
        this.hanabiPending += Math.floor(m + 1e-9); // the multipliers' float error must not round down
        if (!this.roll && this.fieldEmpty()) this.bravoPending += EASY_BRAVO;
        this.sinceClear = 0;
        this.clearAre = true;
    }

    testFireworks() {
        if (this.gameover || this.phase === "ready") return false;
        this.fire(TEST_FIREWORKS);
        this.tested = true;
        return true;
    }

    // A firework goes up: counted, and drawn by the engine (takeFireworks)
    fire(n = 1) {
        this.hanabi += n;
        this.fireworks += n;
    }

    // The fireworks still waiting in the streams count at the end
    flushHanabi() {
        this.fire(this.hanabiPending + this.bravoPending);
        this.hanabiPending = this.bravoPending = 0;
    }
}

// ----------------------------------------------------------
// TGM3 Shirase: 20G to level 1300, rising garbage, monochrome blocks, then a staff roll with big
// pieces (roll length from NullpoMino's SpeedMania2Mode)

class TiShiraseGame extends TiGame {
    constructor(mode, variant) {
        super(mode, variant);
        this.internalGrading = false;
        this.hasKill = false;
        this.maxLevel = SHIRASE_MAX_LEVEL;
        this.rollLength = SHIRASE_ROLL_FRAMES;
        this.rollHide = VISIBLE_ROLL_HIDE;
        this.garbageCount = 0; // rising garbage
        this.sectionsDone = 0; // sections finished, and REGRETs
        this.regrets = 0;
    }

    // Grade: sections finished less REGRETs
    gradeLabel() {
        return SHIRASE_GRADE_LABELS[Math.max(0, this.sectionsDone - this.regrets)];
    }

    gradeRank() {
        return Math.max(0, this.sectionsDone - this.regrets);
    }

    secretGradeLabels() { return SHIRASE_SECRET_LABELS; }

    delayRow(speedLevel) {
        return tableLookup(SHIRASE_DELAYS, speedLevel);
    }

    gravityAt() { return 20; }

    setTimings() {
        super.setTimings();
        if (this.level >= SHIRASE_MONO_LEVEL) this.palette = MONO_PALETTE;
    }

    ghostVisible() { return false; } // 20G: it would sit under the piece

    beforeSpawn(newPiece) {
        if (newPiece && !this.roll) this.shiraseGarbage();
    }

    // As a new piece comes: a copy of the bottom row rises once the counter has reached the
    // section's quota, then the piece counts. Big: the bottom two rows, a row of big blocks.
    shiraseGarbage() {
        const quota = SHIRASE_GARBAGE[Math.floor(this.level / 100)];
        if (!quota) return;
        if (this.garbageCount >= quota) {
            const copies = this.field.slice(this.big ? -2 : -1).map(row => [...row]);
            for (const row of copies) this.raiseRow(row);
            this.garbageCount = 0;
        }
        this.garbageCount++;
    }

    scoreTiClear(n, rows, levelBefore, levelAfter) {
        this.scoreTiPoints(n, levelBefore, levelAfter);
        this.garbageCount = Math.max(0, this.garbageCount - n);
    }

    // Level stops at 500 and 1000, by rule
    checkLevelStop(levelBefore) {
        for (const [stop, frames] of SHIRASE_TORIKAN[this.ars ? "classic" : "world"]) {
            if (levelBefore < stop && this.level >= stop && this.frames > frames) {
                this.level = stop;
                this.endGame("LEVEL STOP", `GRADE ${this.gradeLabel()} — LATE AT LEVEL ${stop}`);
            }
        }
    }

    // A section is finished when the level passes its end (the last at 1300); one slower than the
    // REGRET time takes a grade off
    updateSection() {
        this.updateShiraseSection();
    }

    updateShiraseSection() {
        const section = Math.floor(this.level / 100);
        if (section === this.section) return;
        const seconds = (this.frames - this.sectionStart) / 60;
        this.sectionsDone++;
        if (seconds > SHIRASE_REGRET_TIME(this.section)) {
            this.regrets++;
            this.addAction("REGRET!!", "grade");
        }
        this.section = section;
        this.sectionStart = this.frames;
    }

    scoreRollClear() {}

    rollKind() { return "visible"; }

    onRollBegin() {
        this.setBig();
    }

    prepareTestRoll(name) {
        if (name !== "roll") return false;
        this.sectionsDone = SHIRASE_GRADE_LABELS.length - 1;
        return true;
    }

    finishRoll() {
        this.endGame("COMPLETE", `GRADE ${this.gradeLabel()} — ORANGE LINE — ${this.formatTime()}`);
    }
}

// ----------------------------------------------------------
// Versus: one side of a VS match as the arcade sets it by default (tetris.wiki, TGM Versus Mode
// Guide; TAP's, TGM3's and ACE's taken as the same), each side at its mode's speed with the mode's
// levels and score, but no grade, roll, level stop or 15-minute speed-up; both sides deal the same
// pieces (options.seed). A round is won by reaching the goal first (level 200), by the other side
// topping out, or by being further on (the higher level) when the 2:40 run out (TAP and TGM3: the goal
// can be set from 100 to 900, the time 1:20 longer or shorter per 100 levels, as in TAP's setup and
// Heboris; TAP Death's level 500 check is a single-player rule and stays out); ties are draws (the
// guide gives the defending side a goal reached on the same frame, a role this match has no use for).
// A clear of two lines or more sends the rows it removed, the clearing piece's blocks taken out,
// upside down ("take the line clear, erase the clearing piece, and send it vertically flipped"), a
// perfect clear twice; singles and clears that set an item off send nothing. At most 8 rows of it
// wait (the guide's cap), nothing cancels it, and it rises once the receiving side's piece has locked
// (and its clear is done), before the next piece: Heboris does so "like the original", whatever the
// lock cleared; rows pushed out of the top are lost ("forgotten", the guide), they don't top a side
// out. Items with the Items card (RuleGame's). TGM1 (tetris.wiki): TGM1's items (TGM1_VS_ITEMS), no
// goal but the game's end, and a round not decided in 5:00 is a draw. TGM3
// (tetris.wiki): each side plays a style (TiVersusGame).

// The versus side of a TGM game (TiGame, TapGame, Tgm1Game; ACE's AceGame too)
function tgmVersus(Base) {
    return class extends Base {
        constructor(mode, variant, startLevel, height, handling) {
            super(mode, variant, startLevel, height, handling);
            this.sendsGarbage = true;
            this.versusWins = TGM_VS_WINS;
            this.versusFrames = TGM_VS_FRAMES; // a round's time limit
            this.timeDraw = false; // a round that runs out of time is a draw (TGM1), else the one further on wins
            this.goalReached = false;
            this.timeUp = false;
            this.lockCells = []; // the locking piece's cells (beforeLock), taken out of the garbage it sends
            this.garbageEveryLock = true;
        }

        // Both sides deal the same pieces and items from the match's seed; options.items: the Items card
        setOptions(options = {}) {
            super.setOptions(options);
            const seed = options.seed ?? Date.now();
            this.randomizer = this.randomizer ? new this.randomizer.constructor(seed) : new BagRandomizer(seed, this.bagNoSzoFirst);
            this.seedVersus(seed);
            if (options.items) this.useItems();
        }

        getStats() {
            return [this.statsName(), ["LEVEL", `${this.level} / ${this.maxLevel}`], this.timeLeftRow(),
                ["SENT", String(this.linesSent)], ["SCORE", this.scoreText()]];
        }

        timeLeftRow() {
            return ["TIME", this.formatTime(Math.max(0, this.versusFrames - this.frames))];
        }

        record() { return null; }
        secretGradeLabels() { return null; }
        testSetup() { return false; }

        onClock() {
            if (this.frames >= this.versusFrames) {
                this.timeUp = true;
                this.endGame("TIME UP", this.goalText(this.versusProgress()));
                return false;
            }
            return super.onClock();
        }

        beforeLock() {
            super.beforeLock();
            this.lockCells = this.curPieceCells();
        }

        // 2+ lines send their garbage; the goal ends the round (the rows collapse first, as the round
        // stops here)
        scoreClear(n, rows) {
            if (n >= 2 && !this.firingItems.length) {
                const cleared = this.garbageFrom(rows);
                const garbage = this.styleGarbage(this.fieldEmpty() ? [...cleared, ...cleared] : cleared, n);
                if (garbage.length) this.sendAttack({ lines: garbage.length, rows: garbage });
            }
            super.scoreClear(n, rows);
            if (this.versusGoal()) {
                this.goalReached = true;
                this.collapse(rows);
                this.endGame(this.goalText(this.versusGoalValue()), this.formatTime());
            }
        }

        // The goal level (options.goal, TAP and TGM3: 100 to 900 in steps of 100, 200 by default) and
        // the time limit that goes with it
        setGoal(goal = TGM_VS_LEVEL_GOAL) {
            const level = clamp(Math.round(goal / TGM_VS_GOAL_STEP) * TGM_VS_GOAL_STEP, TGM_VS_GOAL_STEP, TGM_VS_GOAL_MAX);
            this.maxLevel = level;
            this.versusFrames = TGM_VS_FRAMES + (level - TGM_VS_LEVEL_GOAL) / TGM_VS_GOAL_STEP * TGM_VS_STEP_FRAMES;
        }

        // The goal (the last level: 200, TGM1's 999) and how far this side is towards it
        versusGoal() { return this.level >= this.maxLevel; }
        versusGoalValue() { return this.maxLevel; }
        versusProgress() { return this.level; }
        goalText(value) { return `LEVEL ${value}`; }

        // The rows a clear removed (rows; clearedRows holds them as they were), without the locking
        // piece's blocks, upside down: top first, as they rise on the other side
        garbageFrom(rows) {
            return this.clearedRows.map((cells, i) => cells.map((v, c) =>
                this.lockCells.some(cell => cell.row === rows[i] && cell.col === c) ? 0 : v)).reverse();
        }

        // The garbage a clear of n lines sends, as the side's style makes it (TGM3's)
        styleGarbage(rows, n) { return rows; }

        maxIncoming() { return TGM_VS_GARBAGE_MAX; }

        // Color Block: the stack shimmers through the piece colours, a band per row moving up (the guide:
        // "shimmer your opponent's stack different colors"; Heboris's rows of colours)
        getCellColor(row, col) {
            if (!this.hitting("COLOR BLOCK") || !this.getCell(row, col)) return super.getCellColor(row, col);
            return 1 + ((row + Math.floor(this.frames / 4)) % 7 + 7) % 7;
        }

        // The goal first; else topping out loses; else, when time is up, a draw (TGM1) or the one
        // further on
        versusOutcome() {
            const other = this.rival;
            if (this.goalReached || other.goalReached) return this.goalReached === other.goalReached ? "draw" : this.goalReached ? "win" : "lose";
            const out = g => g.gameover && !g.timeUp;
            if (out(this) || out(other)) return out(this) === out(other) ? "draw" : out(this) ? "lose" : "win";
            if (!this.timeUp || !other.timeUp) return null;
            const a = this.versusProgress(), b = other.versusProgress();
            return this.timeDraw || a === b ? "draw" : a > b ? "win" : "lose";
        }
    };
}

// TGM3 (World or Classic rule): Master's levels and speed without COOLs or REGRETs, so the speed
// level is the level
// Each side plays a style (options.style; tetris.wiki's TGM3 page): Attack sends extra copies of the
// top garbage row (one for a double or triple, two for a Tetris) and gets an item every 40 pieces;
// Defence sends one row less but deletes as many rows from the bottom of its own stack as it sent
// (one for a double ... three for a Tetris), with an item every 20 pieces; Item gets one every 10.
// Attack items go off with the clear (the others after it); a piece entering with IHS doesn't fill the
// gauge, and a held item piece loses its item (RuleGame's).
class TiVersusGame extends tgmVersus(TiGame) {
    constructor(mode, variant) {
        super(mode, variant);
        this.internalGrading = false;
        this.hasKill = false;
        this.maxLevel = TGM_VS_LEVEL_GOAL;
        this.defenceRows = 0; // Defence: rows to delete from the bottom once the clear is done
        this.itemsAtClear = true; // items "activate immediately upon being cleared" (tetris.wiki)
    }

    setOptions(options = {}) {
        super.setOptions(options);
        this.setGoal(options.goal);
        this.style = TGM3_VS_STYLES[options.style] ? options.style : "attack";
        this.itemInterval = TGM3_VS_STYLES[this.style].items;
    }

    statsName() {
        return ["TGM3 TI", `${this.ars ? "CLASSIC" : "WORLD"} VS ${TGM3_VS_STYLES[this.style].name}`];
    }

    styleGarbage(rows, n) {
        if (this.style === "attack") return [...Array(n === 4 ? 2 : 1).fill(rows[0]), ...rows];
        if (this.style === "defence") {
            this.defenceRows = n - 1;
            return rows.slice(0, -1);
        }
        return rows;
    }

    // Defence: the rows from the bottom go once the clear has collapsed (blocks only, not lines)
    afterClear() {
        if (this.defenceRows && !this.gameover) {
            const rows = [];
            for (let k = 0; k < this.defenceRows; k++) rows.push(HEIGHT - 1 - k);
            this.defenceRows = 0;
            this.deleteRows(rows);
        }
        super.afterClear();
    }

    updateSection() {} // no COOLs or REGRETs
    checkLevelStop() {}
}

// TAP: each of its modes can be played in versus (tetris.wiki): Master's speed, Death's or TGM+'s
// (options.speed: "death", "plus"; Normal's is played as Master's), Master's levels and score, no
// grades; TGM+ keeps its rising garbage
class TapVersusGame extends tgmVersus(TapGame) {
    constructor(mode, variant) {
        super(mode, variant);
        this.internalGrading = false;
        this.maxLevel = TGM_VS_LEVEL_GOAL;
    }

    setOptions(options = {}) {
        this.death = options.speed === "death";
        this.tapPlus = options.speed === "plus";
        this.sonicTrail = !this.death;
        super.setOptions(options);
        this.setGoal(options.goal);
    }

    statsName() {
        return ["TGM2 TAP", this.death ? "DEATH VERSUS" : this.tapPlus ? "TGM+ VERSUS" : "MASTER VERSUS"];
    }

    // Death: 20G (its delays come from TapGame's delayRow) and no ghost
    updateTimings() {
        super.updateTimings();
        if (this.death) this.gravity = this.softGravity = 20;
    }

    ghostVisible() {
        return !this.death && super.ghostVisible();
    }
}

// TGM1: Master's speed or its hidden 20G mode's (options.speed: "20g"); its own items (TGM1_VS_ITEMS);
// the end of the game (level 999) is the only goal, and a round not decided in 5:00 is a draw
class Tgm1VersusGame extends tgmVersus(Tgm1Game) {
    constructor(mode, variant) {
        super(mode, variant);
        this.versusFrames = TGM1_VS_FRAMES;
        this.timeDraw = true;
    }

    setOptions(options = {}) {
        this.speed20g = options.speed === "20g";
        super.setOptions(options);
        this.itemSet = this.itemSet.filter(item => TGM1_VS_ITEMS.includes(item));
    }

    statsName() {
        return ["TGM1", this.speed20g ? "20G VERSUS" : "MASTER VERSUS"];
    }

    getStats() {
        const stats = super.getStats();
        stats[1] = ["LEVEL", String(this.level)];
        return stats;
    }

    updateTimings() {
        super.updateTimings();
        if (this.speed20g) this.gravity = this.softGravity = 20;
    }

    ghostVisible() {
        return !this.speed20g && super.ghostVisible();
    }
}

registerRules([tgmOriginal], variant => variant === "versus" ? Tgm1VersusGame : Tgm1Game);
registerRules([tgmTap], variant => variant === "versus" ? TapVersusGame : TapGame);
registerRules([arika, tgmClassic], variant => variant === "easy" ? TiEasyGame : variant === "shirase" ? TiShiraseGame
    : variant === "versus" ? TiVersusGame : TiGame);
