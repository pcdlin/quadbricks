// Guideline rule set (GuidelineGame): Tetris Guideline with SRS, a 7-bag, T-spins and
// back-to-backs, and the player's handling options.
//  - standard: endless; marathon: 150 lines; variable: marathon with the variable goal, levels 1-15
//    (all three can start at a later level: startLevel)
//  - sprint: 40 lines as fast as possible (sprint20, sprint100: 20 or 100); ultra: highest score in
//    2 minutes (ultra1, ultra3, ultra5: 1, 3 or 5); both at level 1
//  - dig: clear 5, 10 or 18 rows of garbage as fast as possible, level 1
//  - master: 20G, shorter lock and line clear delays by level M1-M30, 300 lines
//  - versus: one side of a match (against the bot): clears send garbage to the other side, which
//    rises when it locks a piece without clearing; both sides deal the same pieces (options.seed)
// (tetris.wiki: Tetris_Guideline, Super_Rotation_System, Marathon, Scoring, T-Spin; Master's delays
//  from the Tetris_Effect page; Dig as NullpoMino's DigRaceMode; versus from Garbage and Combo)

// Seconds per row: (0.8 - (level-1) * 0.007) ^ (level-1); returned as rows per frame
function guidelineGravity(level) {
    const seconds = Math.pow(0.8 - (level - 1) * 0.007, level - 1);
    return 1 / (seconds * 60);
}

const GUIDELINE_MAX_LEVEL = 15;  // level cap; endless play continues at level 15 speed
const GUIDELINE_LINES_PER_LEVEL = 10; // fixed goal
// Variants that end on a number of lines
const GUIDELINE_LINE_GOALS = { marathon: 150, sprint: 40, sprint20: 20, sprint100: 100, master: 300 };
// Ultra variants: the frames they last
const GUIDELINE_ULTRA_FRAMES = { ultra: 2 * 60 * 60, ultra1: 1 * 60 * 60, ultra3: 3 * 60 * 60, ultra5: 5 * 60 * 60 };
const GUIDELINE_SPRINTS = ["sprint", "sprint20", "sprint100"];
const GUIDELINE_MARATHONS = ["standard", "marathon", "variable"]; // the ones that take a start level
const GUIDELINE_FIXED_LEVEL = [...GUIDELINE_SPRINTS, ...Object.keys(GUIDELINE_ULTRA_FRAMES), "dig"]; // variants that stay at level 1
// Variable goal: each level needs 5 x level goal points; a clear (or T-spin) earns its base score / 100,
// rounded down (back-to-back included), and points beyond the goal are lost. Levels 1-15.
const GUIDELINE_VARIABLE_GOAL = 5;
// Dig: rows of garbage by choice (the height argument), each with one hole, never in the same
// column as the row below
const GUIDELINE_DIG_ROWS = [5, 10, 18];
// Master: 20G at every level; [lock delay, line clear delay] in frames for levels M1-M30, as
// tetris.wiki gives them (rounded to whole frames in use). 10 lines per level, done at 300 lines.
const GUIDELINE_MASTER_DELAYS = [
    [29.5, 30], [29.5, 27], [29.5, 24], [29.5, 21], [29.5, 18], [29.5, 15], [29.5, 12], [29.5, 9], [29.5, 6], [29.5, 3],
    [27.6, 0.6], [25.2, 0.6], [22.8, 0.6], [20.4, 0.6], [17.5, 0.6], [16.8, 0.6], [15.6, 0.6], [15, 0.6], [13.2, 0.6], [11.5, 0.6],
    [11.4, 0.6], [10.8, 0.6], [10.2, 0.6], [9.6, 0.6], [8.5, 0.6], [8.4, 0.6], [7.8, 0.6], [7.2, 0.6], [6.6, 0.6], [5.5, 0.6],
];
const GUIDELINE_LOCK_DELAY = 30; // 0.5 s
const GUIDELINE_MOVE_LIMIT = 15; // move reset limit
const GUIDELINE_DAS = 10, GUIDELINE_ARR = 2, GUIDELINE_ARE = 6; // recommended handling
const GUIDELINE_NEXT = 6; // the Guideline allows up to six previews
const GUIDELINE_SOFT_FACTOR = 20; // soft drop = 20x gravity
// Player handling for the Guideline (Options → Guideline), the recommended values by default.
// das, arr: frames (arr 0 shifts straight to the wall); sdf: soft drop factor (Infinity: 20G);
// dcd: frames a charged auto-shift pauses after a rotation or a new piece; ghost: ghost piece shown;
// dropGuard: hard drops in a piece's first GUIDELINE_DROP_GUARD frames are ignored; previews: next
// pieces shown (0-6); holdPiece: the hold; irs, ihs: rotation and hold held as a piece enters apply
// to it; rot180: the 180° rotation key works (KICKS_180; the Guideline itself has none)
const GUIDELINE_HANDLING = { das: GUIDELINE_DAS, arr: GUIDELINE_ARR, sdf: GUIDELINE_SOFT_FACTOR, dcd: 0, ghost: true, dropGuard: false,
    previews: GUIDELINE_NEXT, holdPiece: true, irs: true, ihs: true, rot180: false };
const GUIDELINE_DROP_GUARD = 8;

// Versus: garbage lines a clear sends: tetris.wiki's general Guideline table (Garbage) and its
// "Guideline Standard" combos (Combo), but the back-to-back bonus +1 for every clear, as Tetris 99,
// Puyo Puyo Tetris, Jstris and TETR.IO give it, where the wiki's table gives +1 to +3
const VS_LINES = [0, 0, 1, 2, 4];         // by lines cleared: single 0 ... Tetris 4
const VS_TSPIN_LINES = [0, 2, 4, 6];      // T-spin single 2, double 4, triple 6
const VS_MINI_LINES = [0, 0, 1];          // T-spin mini single 0, mini double 1
const VS_B2B_BONUS = 1;                   // a difficult clear right after another
const VS_COMBO_LINES = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5, 5, 5]; // by combo (0 = the first clear), 13+ as 13
const VS_PERFECT_CLEAR = 10;              // added to the clear's own lines

// Lines a clear sends ({ n, tspin, b2b, combo, pc } from scoreGuideline); nothing without lines
function versusAttack({ n, tspin, b2b, combo, pc }) {
    if (n === 0) return 0;
    const table = tspin === "full" ? VS_TSPIN_LINES : tspin === "mini" ? VS_MINI_LINES : VS_LINES;
    let lines = table[n] ?? VS_LINES[n];
    if (b2b) lines += VS_B2B_BONUS;
    lines += VS_COMBO_LINES[Math.min(combo, VS_COMBO_LINES.length - 1)];
    if (pc) lines += VS_PERFECT_CLEAR;
    return lines;
}

class GuidelineGame extends RuleGame {
    constructor(mode, variant, startLevel, height, handling) {
        super(mode, variant);
        this.handling = { ...GUIDELINE_HANDLING, ...handling };
        this.master = variant === "master";
        this.dig = variant === "dig";
        this.sprint = GUIDELINE_SPRINTS.includes(variant);
        this.ultraFrames = GUIDELINE_ULTRA_FRAMES[variant] || 0; // ultra: its length
        this.versus = variant === "versus";
        this.pieces = 0; // pieces locked (versus: pieces per second)
        // Versus garbage
        this.incoming = []; // attacks received and not yet risen, oldest first: { lines, hole }
        this.attacks = []; // lines sent since the last takeAttacks(), after cancelling
        this.risen = []; // garbage rows that rose, per lock, since the last takeRisenGarbage()
        this.attackTotal = 0; // lines of attack made, cancelled ones included (APM)
        this.linesSent = 0; // lines that went to the other side
        // level 1 + startLevel: Master M1-M30, the marathons 1-15
        this.startLevel = this.master ? clamp(startLevel, 0, GUIDELINE_MASTER_DELAYS.length - 1)
            : GUIDELINE_MARATHONS.includes(variant) ? clamp(startLevel, 0, GUIDELINE_MAX_LEVEL - 1) : 0;
        this.level = 1 + this.startLevel;
        this.height = this.dig ? clamp(height, 0, GUIDELINE_DIG_ROWS.length - 1) : 0;
        this.goalPoints = 0; // variable goal: points towards the current level's goal
        this.applyPieceHandling();
        this.moveLimit = GUIDELINE_MOVE_LIMIT;
        this.lockOut = true;
        this.dropsOnSpawn = true; // spawn in rows 21-22, then one row down at once
        this.softDropPoints = 1;
    }

    setupField() {
        if (this.dig) this.fillDigGarbage(GUIDELINE_DIG_ROWS[this.height]);
    }

    // Versus: both sides' bags are dealt from the match's seed (options.seed)
    setOptions(options = {}) {
        super.setOptions(options);
        if (this.versus) this.randomizer = new BagRandomizer(options.seed ?? Date.now());
    }

    // Dig: full rows with one hole each, the hole never above the one in the row below; isGarbage
    // marks their rows (it falls with the field) so the clears that remove them can be counted
    fillDigGarbage(rows) {
        this.digRows = rows;
        this.digCleared = 0;
        this.isGarbage = this.field.map(() => false);
        let hole = -1;
        for (let r = HEIGHT - 1; r >= HEIGHT - rows; r--) {
            let next;
            do next = Math.floor(Math.random() * WIDTH); while (next === hole);
            hole = next;
            for (let c = 0; c < WIDTH; c++) this.setCell(r, c, c === hole ? 0 : 1 + Math.floor(Math.random() * 7));
            this.isGarbage[r - FIELD_TOP] = true;
        }
    }

    onCollapse(rows) {
        if (this.isGarbage) this.isGarbage = this.dropRows(this.isGarbage, rows, () => false);
    }

    getStats() {
        const score = this.scoreText();
        const mode = ["GUIDELINE", VARIANT_NAMES[this.variant] || "ENDLESS"];
        const goal = GUIDELINE_LINE_GOALS[this.variant];
        const lines = ["LINES", goal ? `${this.lines} / ${goal}` : String(this.lines)];
        if (this.sprint) return [mode, ["TIME", this.formatTime()], lines, ["SCORE", score]];
        if (this.ultraFrames) {
            return [mode, ["TIME", this.formatTime(Math.max(0, this.ultraFrames - this.frames))], lines, ["SCORE", score]];
        }
        if (this.variant === "variable") {
            return [mode, ["LEVEL", String(this.level)], ["GOAL", `${this.goalPoints} / ${GUIDELINE_VARIABLE_GOAL * this.level}`], lines, ["SCORE", score]];
        }
        if (this.dig) return [mode, ["TIME", this.formatTime()], ["GARBAGE", `${this.digCleared} / ${this.digRows}`], lines, ["SCORE", score]];
        if (this.versus) { // attack per minute (cancelled lines too) and pieces per second
            const seconds = this.frames / 60;
            const apm = seconds ? this.attackTotal * 60 / seconds : 0, pps = seconds ? this.pieces / seconds : 0;
            return [mode, ["SENT", String(this.linesSent)], ["APM", apm.toFixed(1)], ["PPS", pps.toFixed(2)], lines];
        }
        if (this.master) return [mode, ["LEVEL", `M${this.level}`], lines, ["TIME", this.formatTime()], ["SCORE", score]];
        return [mode, ["LEVEL", String(this.level)], lines, ["SCORE", score]];
    }

    // Sprint and Dig: the time, if finished; Master: lines, then time; versus: no record; the rest: the score
    record() {
        if (this.versus) return null;
        if (this.sprint || this.dig) {
            return this.endTitle === "COMPLETE" ? { key: [-this.frames], text: this.formatTime() } : null;
        }
        if (this.master) return { key: [this.lines, -this.frames], text: `${this.lines} LINES · ${this.formatTime()}` };
        return super.record();
    }

    setTimings() {
        this.are = GUIDELINE_ARE;
        this.lineAre = GUIDELINE_ARE;
        this.das = this.handling.das;
        this.arr = this.handling.arr;
        this.lockDelayMax = GUIDELINE_LOCK_DELAY;
        this.lineClearDelay = 0;
        this.gravity = guidelineGravity(Math.min(this.level, GUIDELINE_MAX_LEVEL));
        this.softGravity = Math.min(20, this.gravity * this.handling.sdf);
        if (this.master) {
            const [lock, lineClear] = GUIDELINE_MASTER_DELAYS[Math.min(this.level, GUIDELINE_MASTER_DELAYS.length) - 1];
            this.lockDelayMax = Math.round(lock);
            this.lineClearDelay = Math.round(lineClear);
            this.gravity = this.softGravity = 20;
        }
    }

    // Handling changed in the menu during a game applies at once
    setHandling(handling) {
        this.handling = { ...GUIDELINE_HANDLING, ...handling };
        this.applyPieceHandling();
        this.fillQueue();
        this.updateTimings();
        this.setShadow();
    }

    // The handling options that aren't timing: previews, hold, IRS, IHS, 180° rotation (a hold turned
    // off keeps the piece it holds out of play)
    applyPieceHandling() {
        const h = this.handling;
        this.nextCount = clamp(h.previews, 0, GUIDELINE_NEXT);
        this.hasHold = h.holdPiece;
        if (!this.hasHold) this.canHold = false;
        this.irs = h.irs;
        this.ihs = h.ihs;
        this.rot180 = h.rot180;
    }

    ghostVisible() {
        return super.ghostVisible() && !this.master;
    }

    onClock() {
        if (this.ultraFrames && this.frames >= this.ultraFrames) {
            this.endGame("TIME UP", `SCORE ${this.scoreText()}`);
            return false;
        }
        return true;
    }

    // The hard drop guard ignores hard drops in a piece's first frames
    upKey() {
        if (this.handling.dropGuard && this.activeTime <= GUIDELINE_DROP_GUARD) return false;
        return super.upKey();
    }

    onHardDrop(distance) {
        this.score += 2 * distance; // 2 points per hard-dropped cell
    }

    beforeLock() {
        this.tspin = this.lockedType === tetT && this.lastRotation ? this.detectTSpin() : null;
        this.pieces++;
    }

    // 3-corner T-spin with pointing-side mini rule
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

    scoreClear(n, rows) {
        const clear = this.scoreGuideline(n, this.tspin, rows);
        if (this.versus) this.attack(clear);
    }

    // rows: the rows this lock cleared. Returns what the clear was, for versus attacks:
    // { n, tspin, b2b (with the back-to-back bonus), combo (0: the first clear), pc }
    scoreGuideline(n, tspin, rows) {
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
        const b2bBonus = n > 0 && difficult && b2bBefore;
        if (n > 0) {
            if (b2bBonus) {
                action = action * 3 / 2;
                this.addAction("BACK-TO-BACK", "b2b");
            }
            this.b2b = difficult; // singles, doubles and triples break the chain
        }
        this.score += Math.floor(action);

        const pc = n > 0 && this.fieldEmpty();
        if (n > 0) {
            this.combo++;
            if (this.combo > 0) {
                this.score += 50 * this.combo * L;
                this.addAction(this.combo + " COMBO", "combo", this.chain);
            }
            if (pc) {
                const bonus = n === 4 && b2bBefore ? 3200 : [0, 800, 1200, 1800, 2000][n];
                this.score += bonus * L;
                this.addAction("PERFECT CLEAR", "pc");
            }
            this.lines += n;
            // a level every 10 lines; a marathon started later needs the lines it would have from
            // level 1 (tetris.wiki: from level 5, level 6 at 50 lines), Master counts from its start
            const fromLines = 1 + Math.floor(this.lines / GUIDELINE_LINES_PER_LEVEL);
            const level = GUIDELINE_FIXED_LEVEL.includes(this.variant) || this.variant === "variable" ? this.level
                : this.master ? Math.min(GUIDELINE_MASTER_DELAYS.length, this.startLevel + fromLines)
                : Math.min(GUIDELINE_MAX_LEVEL, Math.max(1 + this.startLevel, fromLines));
            if (level !== this.level) {
                this.level = level;
                this.updateTimings();
            }
            const goal = GUIDELINE_LINE_GOALS[this.variant];
            if (goal && this.lines >= goal) this.endGame("COMPLETE", `${goal} LINES — ${this.formatTime()}`);
            if (this.dig) {
                this.digCleared += rows.filter(r => this.isGarbage[r - FIELD_TOP]).length;
                if (this.digCleared >= this.digRows) this.endGame("COMPLETE", `${this.digRows} ROWS — ${this.formatTime()}`);
            }
        } else {
            this.combo = -1;
        }
        // variable goal: T-spins without lines count too
        if (this.variant === "variable" && base > 0) this.addGoalPoints(Math.floor(base * (b2bBonus ? 1.5 : 1) / 100));
        return { n, tspin, b2b: b2bBonus, combo: this.combo, pc };
    }

    // ----------------------------------------------------------
    // Versus garbage

    // A clear's attack first cancels the garbage waiting for this side, oldest first; what is left
    // goes to the other side (takeAttacks)
    attack(clear) {
        let lines = versusAttack(clear);
        this.attackTotal += lines;
        while (lines > 0 && this.incoming.length) {
            const g = this.incoming[0];
            const k = Math.min(lines, g.lines);
            g.lines -= k;
            lines -= k;
            if (!g.lines) this.incoming.shift();
        }
        if (lines > 0) {
            this.attacks.push(lines);
            this.linesSent += lines;
        }
    }

    // An attack from the other side: lines of garbage, all with their hole in column `hole`. It
    // waits until this side locks a piece that clears nothing.
    receiveGarbage({ lines, hole }) {
        if (!this.versus || this.gameover || lines <= 0) return;
        this.incoming.push({ lines, hole });
    }

    pendingGarbage() {
        return this.incoming.reduce((sum, g) => sum + g.lines, 0);
    }

    // Lines sent since the last call, one entry per clear
    takeAttacks() {
        return this.drain("attacks");
    }

    // Garbage rows that rose since the last call, one entry per lock
    takeRisenGarbage() {
        return this.drain("risen");
    }

    riseAfterLock(n) {
        return this.versus && n === 0 ? this.riseGarbage() : 0;
    }

    // All the garbage waiting rises from the bottom, pushing the stack up; blocks pushed out of the
    // top of the buffer zone top this side out. Returns the number of rows.
    riseGarbage() {
        let rows = 0, toppedOut = false;
        for (const g of this.incoming) {
            for (let k = 0; k < g.lines; k++) {
                if (this.field[0].some(v => v !== 0)) toppedOut = true;
                const row = new Array(WIDTH).fill(tetGARBAGE);
                row[g.hole] = 0;
                this.raiseRow(row);
                rows++;
            }
        }
        this.incoming = [];
        if (!rows) return 0;
        this.risen.push(rows);
        this.sounds.push("garbage");
        if (toppedOut) this.endGame("GAME OVER", "TOP OUT — ESC FOR MENU");
        return rows;
    }

    // Variable goal: the level goes up once its goal is met (the rest is lost), and meeting
    // level 15's ends the marathon
    addGoalPoints(points) {
        this.goalPoints += points;
        if (this.goalPoints < GUIDELINE_VARIABLE_GOAL * this.level) return;
        this.goalPoints = 0;
        if (this.level >= GUIDELINE_MAX_LEVEL) {
            this.endGame("COMPLETE", `LEVEL ${GUIDELINE_MAX_LEVEL} — ${this.formatTime()}`);
            return;
        }
        this.level++;
        this.updateTimings();
    }
}

registerRules([guideline], () => GuidelineGame);
