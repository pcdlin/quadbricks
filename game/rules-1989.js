// NES and GB rule sets (Game1989: NesGame, GbGame), A-Type and B-Type
//  - NES (1989): the right-handed NRS (rotation system) without kicks, entry delay by lock height,
//    the NES randomizer (tetris.wiki: Tetris_(NES,_Nintendo), Scoring; meatfighter.com's NES Tetris
//    disassembly notes)
//  - GB (1989): the left-handed NRS without kicks, an 18-row well, its randomizer with the OR bug
//    (tetris.wiki: Tetris_(Game_Boy), Nintendo_Rotation_System; randomizer from TASVideos
//    submission 4536 and the disassembly)
// Neither has a hard drop, hold or lock delay; one next piece; btype: 25 lines over garbage.
// NES "versus": one side of a match as Classic Tetris World Championship plays it (the NES itself
// has no two-player mode): A-Type from one start level, both sides dealt the same pieces, no
// garbage; the higher score once a side tops out wins; best of five (CTWC since 2022).
// GB "versus": one side of a two-player match over the link cable (tetris.wiki, StrategyWiki, and the
// disassembly, vinheim3/tetris-gb-disasm: multiplayer.s, inGameFlow.s): both sides dealt the same
// pieces over the same garbage (each its own height of one pattern), at level 1's speed without level-ups (+10 levels in heart
// mode); a double sends 1 line, a triple 2, a Tetris 4, grey rows with their hole in one column both
// sides share for the round, which the game takes from a piece (L or Z: column 6, J or T 4, I 8, O 2,
// S 10: always an even one counted from 1); it rises when the receiving side's next piece comes,
// whatever its lock cleared, and nothing cancels it. Clearing 30 lines or the other side topping out
// wins a round (both at once: a draw), four rounds the match. Rows pushed out of the top are lost (an
// assumption: the sources don't say).

// ----------------------------------------------------------
// NES (1989)

// Right-handed NRS: every piece turns about one cell (box cell 2, 2) and
// spawns with it in the top visible row; T, L and J spawn flat side up, S and Z have two states
// with the vertical one right of the centre, the I lies in the centre's row. No kicks.
const NES_SHAPES = parseShapes([
    [["....", "....", "IIII", "...."], ["..I.", "..I.", "..I.", "..I."], ["....", "....", "IIII", "...."], ["..I.", "..I.", "..I.", "..I."]],
    [["....", "....", ".TTT", "..T."], ["....", "..T.", ".TT.", "..T."], ["....", "..T.", ".TTT", "...."], ["....", "..T.", "..TT", "..T."]],
    [["....", "....", ".LLL", ".L.."], ["....", ".LL.", "..L.", "..L."], ["....", "...L", ".LLL", "...."], ["....", "..L.", "..L.", "..LL"]],
    [["....", "....", ".JJJ", "...J"], ["....", "..J.", "..J.", ".JJ."], ["....", ".J..", ".JJJ", "...."], ["....", "..JJ", "..J.", "..J."]],
    [["....", "....", "..SS", ".SS."], ["....", "..S.", "..SS", "...S"], ["....", "....", "..SS", ".SS."], ["....", "..S.", "..SS", "...S"]],
    [["....", "....", ".ZZ.", "..ZZ"], ["....", "...Z", "..ZZ", "..Z."], ["....", "....", ".ZZ.", "..ZZ"], ["....", "...Z", "..ZZ", "..Z."]],
    [["....", "....", ".OO.", ".OO."], ["....", "....", ".OO.", ".OO."], ["....", "....", ".OO.", ".OO."], ["....", "....", ".OO.", ".OO."]],
]);

const NES_SPAWN_ROW = VISIBLE_TOP - 2; // the centre in the top visible row
const NES_PIECE_TOP = 0; // pieces may turn up to two rows above the well, no further
// Frames per row by level; 1 from level 29 on
const NES_GRAVITY = [48, 43, 38, 33, 28, 23, 18, 13, 8, 6, 5, 5, 5, 4, 4, 4, 3, 3, 3,
    2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1];
const NES_START_LEVELS = 20; // 0-19 (10-19 with A held on the NES)
const NES_SOFT_FRAMES = 2, NES_SOFT_FIRST = 3; // soft drop: the first row on the third frame, then every second
const NES_DAS = 16, NES_ARR = 6;
// Entry delay: 10 frames after locking in the bottom two rows, 2 more for each 4 rows above, at most 18
const NES_ARE = 10, NES_ARE_STEP = 2, NES_ARE_MAX = 18;
const NES_LINE_CLEAR = 17; // plus 0-3 frames: the animation steps on frames that are multiples of 4
const NES_B_ROWS = [0, 3, 5, 8, 10, 12]; // B-Type: rows of garbage by height 0-5
const NES_LINES_PER_LEVEL = 10;
const NES_VERSUS_LEVEL = 18; // versus: the start level at first (CTWC's)

// ----------------------------------------------------------
// GB (1989)

// Left-handed NRS, as drawn on tetris.wiki: T, L and J spawn flat side up and
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

const GB_WELL_TOP = HEIGHT - 18; // the GB's well is 18 rows high: rows 4-21, nothing above
const GB_SPAWN_ROW = GB_WELL_TOP; // the box at the top: the highest block in the second row
const GB_NEXT = 1; // one next piece, and no hold
// Frames per row by level 0-20 (true values; the ROM stores one less)
const GB_GRAVITY = [53, 49, 45, 41, 37, 33, 28, 22, 17, 11, 10, 9, 8, 7, 6, 6, 5, 5, 4, 4, 3];
const GB_MAX_LEVEL = 20, GB_LINES_PER_LEVEL = 10;
const GB_START_LEVELS = 10; // the player starts at level 0-9
const GB_SOFT_FRAMES = 3; // soft drop: a row every 3 frames
const GB_DAS = 23, GB_ARR = 9; // the disassembly's counter: $17 on the press, 9 after each auto-shift
const GB_ARE = 2, GB_LINE_CLEAR = 91; // ARE 2; ARE and line clear together 93
const GB_LINE_SCORES = [0, 40, 100, 300, 1200]; // x (level + 1); NES too
const GB_MAX_SCORE = 999999; // NES too
const DEBUG_NEAR_MAX_SCORE = 990000; // the debug menu's score near the cap
const GB_B_LINES = 25; // B-Type: 25 lines; NES too
const GB_B_HEIGHTS = 6, GB_ROWS_PER_HEIGHT = 2; // B-Type height 0-5: 0 to 10 rows of garbage
const GB_GARBAGE_FILL = 0.5; // chance of a block in each garbage cell
// Heart mode (Down + Start on the title screen): gravity as at the level + 10, at most level 20's;
// scoring unchanged (tetris.wiki; SetNumFramesUntilPiecesMoveDown in the disassembly)
const GB_HEART_LEVELS = 10;
// Versus: lines sent by lines cleared, the lines that win a round, rounds that win the match
const GB_VS_LINES = [0, 0, 1, 2, 4], GB_VS_GOAL = 30, GB_VS_WINS = 4;
const GB_VS_LEVEL = 1; // the two-player game's speed: level 1's
const GB_VS_HOLES = [0, 7, 3, 5, 3, 9, 5, 1]; // by piece type (I T L J S Z O): the garbage hole's column
const NES_VS_WINS = 3; // CTWC: best of five

// ----------------------------------------------------------
// What NES and GB share: no hard drop, no hold, no kicks, no IRS, no lock delay (a piece that
// can't move down when gravity or soft drop is due locks at once), the same line scores, A-Type
// and B-Type

class Game1989 extends RuleGame {
    constructor(mode, variant) {
        super(mode, variant);
        this.nes = false;
        this.gb = false;
        this.hasHold = false;
        this.nextCount = GB_NEXT;
        this.irs = false;
        this.btype = variant === "btype";
        this.maxScore = GB_MAX_SCORE;
    }

    // The chosen start level (0 to levels - 1) and B-Type height
    setStart(startLevel, levels, height) {
        this.startLevel = clamp(startLevel, 0, levels - 1);
        this.level = this.startLevel;
        this.height = this.btype || (this.gb && this.versus) ? clamp(height, 0, GB_B_HEIGHTS - 1) : 0;
    }

    setupField() {
        if (this.height) this.fillGarbage(this.garbageRows());
    }

    garbageRows() { return 0; } // B-Type: rows of garbage for the height

    // B-Type: random blocks in the bottom rows, each row with at least one block and one hole
    fillGarbage(rows) {
        for (let r = HEIGHT - rows; r < HEIGHT; r++) this.garbageRow().forEach((v, c) => this.setCell(r, c, v));
    }

    garbageRow() {
        let cells;
        do cells = Array.from({ length: WIDTH }, () => this.random() < GB_GARBAGE_FILL ? 1 + Math.floor(this.random() * 7) : 0);
        while (cells.every(v => v) || cells.every(v => !v));
        return cells;
    }

    getStats() {
        const mode = [this.nes ? "NES" : "GB", VARIANT_NAMES[this.variant] || "A-TYPE"];
        const score = ["SCORE", this.scoreText()];
        const level = ["LEVEL", String(this.level)];
        if (this.btype) return [mode, level, ["HEIGHT", String(this.height)], ["LINES", `${this.lines} / ${GB_B_LINES}`], score];
        return [mode, level, ["LINES", String(this.lines)], score];
    }

    setTimings() {
        const nes = this.nes;
        this.are = nes ? NES_ARE : GB_ARE; // NES: set by the lock height (setNesDelays)
        this.lineAre = this.are;
        this.das = nes ? NES_DAS : GB_DAS;
        this.arr = nes ? NES_ARR : GB_ARR;
        this.lineClearDelay = nes ? NES_LINE_CLEAR : GB_LINE_CLEAR;
        // the gravity timer (applyGravityGb)
        this.gbFrames = nes ? NES_GRAVITY[Math.min(this.level, NES_GRAVITY.length - 1)] : GB_GRAVITY[Math.min(this.speedLevel(), GB_MAX_LEVEL)];
        this.lockDelayMax = this.gbFrames; // no lock delay: shown as the time left to the next gravity row
        this.gravity = 1 / this.gbFrames;
        this.softGravity = 1 / (nes ? NES_SOFT_FRAMES : GB_SOFT_FRAMES);
    }

    ghostVisible() { return false; }

    speedLevel() { return this.level; } // the level gravity is taken from (GB's heart mode adds to it)

    onNewPiece() {
        this.softArmed = false; // soft drop needs a fresh press for each piece
        this.softCounter = 0;
        this.softRun = 0; // rows soft-dropped since the last press
    }

    onMoveReset() {} // no lock delay

    // No kicks: turns in place or not at all
    rotate(dir) {
        const type = this.curPiece_type;
        if (type === tetO) return false;
        const to = (this.curPiece_rotation + dir + 4) % 4;
        if (!this.movePossible(this.curPiece_row, this.curPiece_col, to)) return false;
        this.curPiece_rotation = to;
        this.sounds.push("rotate");
        return true;
    }

    // No hard drop; locks when gravity or soft drop can't move it down
    advanceDrop(C) {
        this.applyGravityGb(C(SOFT_PUSH));
    }

    // The gravity timer moves the piece a row every gbFrames frames, and a held soft drop
    // (pressed for this piece) every few frames; a piece that can't move when a row is due locks at
    // once. GB: a soft drop replaces gravity and doesn't reset its timer, its first row comes with the
    // press. NES: gravity goes on during a soft drop, every row restarts its timer, the soft drop's
    // first row comes on the third frame and holding left or right with down ends it.
    applyGravityGb(softPushed) {
        const nes = this.nes, softFrames = nes ? NES_SOFT_FRAMES : GB_SOFT_FRAMES;
        if (softPushed) {
            this.softArmed = true;
            this.softCounter = softFrames - (nes ? NES_SOFT_FIRST : 1); // counts up to softFrames
        }
        if (!this.held.soft || (nes && (this.held.left || this.held.right))) {
            this.softArmed = false;
            this.softRun = 0;
        }
        const soft = this.softArmed;
        let gravityDue = false, softDue = false;
        if (++this.gravityAcc >= this.gbFrames) {
            this.gravityAcc = 0;
            gravityDue = nes || !soft;
        }
        if (soft && ++this.softCounter >= softFrames) {
            this.softCounter = 0;
            softDue = true;
        }
        if (gravityDue || softDue) {
            if (!this.canFall()) {
                this.manualLock = softDue;
                this.lock();
                return;
            }
            this.curPiece_row++;
            if (softDue) this.softRun++;
            if (nes) this.gravityAcc = 0;
            this.onFall();
            if (softDue && !this.canFall()) this.softLandings.push(this.softRun); // landed (the engine's knock)
        }
        this.curPiece_lockDelay = this.canFall() ? 0 : this.gravityAcc; // lock fade
    }

    scoreClear(n) {
        this.scoreGb(n);
    }

    // 40/100/300/1200 x (level + 1), at the level before the clear (GB) or after it (NES), plus
    // the rows soft-dropped if the soft drop locked the piece; capped at 999,999. B-Type stays at
    // its start level and ends at 25 lines; A-Type levels up (updateLevel).
    scoreGb(n) {
        if (this.manualLock) this.score += this.softRun;
        if (n > 0) {
            const levelBefore = this.level;
            this.lines += n;
            if (!this.btype) this.updateLevel();
            this.score += GB_LINE_SCORES[n] * ((this.nes ? this.level : levelBefore) + 1);
            this.addAction(CLEAR_NAMES[n], "clear", n);
        }
        this.score = Math.min(this.score, this.maxScore);
        if (n > 0 && this.btype && this.lines >= GB_B_LINES) {
            this.endGame("COMPLETE", `${GB_B_LINES} LINES — SCORE ${this.scoreText()}`);
        }
    }

    // A-Type level after a clear
    updateLevel() {
        const level = this.levelForLines();
        if (level !== this.level) {
            this.level = level;
            this.updateTimings();
        }
    }

    levelForLines() { return this.level; }

    // Debug menu: B-Type a line short of 25, the score near its cap (not in versus: none there), any level
    modeSetups() {
        const setups = [];
        if (this.btype) setups.push({ id: "nearend" });
        if (!this.versus) setups.push({ id: "maxscore" });
        return setups;
    }

    debugLevels() {
        return Array.from({ length: this.nes ? NES_GRAVITY.length : GB_MAX_LEVEL + 1 }, (_, i) => i);
    }

    // The level-ups count on from it, as from a start level
    debugLevel(level) {
        this.startLevel = this.level = level;
        this.updateTimings();
        return true;
    }

    // Gravity off: its timer never runs out (only the soft drop moves and locks the piece)
    updateTimings() {
        super.updateTimings();
        if (!this.debugGravity) this.gbFrames = this.lockDelayMax = Infinity;
    }

    applyDebug(id, value) {
        if (id === "nearend") {
            this.lines = Math.max(this.lines, GB_B_LINES - 1);
            return true;
        }
        if (id === "maxscore") {
            this.score = Math.max(this.score, DEBUG_NEAR_MAX_SCORE);
            return true;
        }
        return super.applyDebug(id, value);
    }
}

// ----------------------------------------------------------
// NES (1989), A-Type (endless, levels 0-29 and on) and B-Type: the right-handed NRS, entry delay
// by lock height, the NES randomizer

class NesGame extends Game1989 {
    constructor(mode, variant, startLevel, height) {
        super(mode, variant);
        this.nes = true;
        this.setShapes(NES_SHAPES);
        this.pieceTop = NES_PIECE_TOP;
        this.randomizer = new NesRandomizer(Date.now());
        this.setStart(startLevel, NES_START_LEVELS, height);
        // versus: scores past 999,999 count (CTWC's cartridges show them since 2016)
        if (this.versus) {
            this.maxScore = Infinity;
            this.versusWins = NES_VS_WINS;
        }
    }

    // Versus: both sides deal the same pieces (options.seed)
    setOptions(options = {}) {
        super.setOptions(options);
        if (this.versus) this.randomizer = new NesRandomizer(options.seed ?? Date.now());
    }

    // Versus: the score against the other side's
    getStats() {
        const stats = super.getStats();
        if (this.versus && this.rival) {
            const diff = this.score - this.rival.score;
            stats.push(diff ? [diff < 0 ? "BEHIND" : "AHEAD", Math.abs(diff).toLocaleString("en-US")] : ["LEAD", "EVEN"]);
        }
        return stats;
    }

    record() { return this.versus ? null : super.record(); }

    // A side that tops out has its score to beat; the other wins by passing it, or loses by topping
    // out below it (the same score: a draw)
    versusOutcome() {
        const other = this.rival;
        const compare = () => this.score === other.score ? "draw" : this.score > other.score ? "win" : "lose";
        if (this.gameover && other.gameover) return compare();
        if (other.gameover && this.score > other.score) return "win";
        if (this.gameover && other.score > this.score) return "lose";
        return null;
    }

    // Versus: topped out, the score is there for the other side to beat
    onBlockOut() {
        if (this.versus) this.endGame("TOPPED OUT", `SCORE ${this.scoreText()} TO BEAT`);
        else super.onBlockOut();
    }

    // Debug menu, versus: the other side tops out, leaving its score to beat
    modeSetups() {
        const setups = super.modeSetups();
        if (this.versus) setups.push({ id: "rivaltop" });
        return setups;
    }

    applyDebug(id, value) {
        if (id !== "rivaltop") return super.applyDebug(id, value);
        const other = this.rival;
        if (!other || other.gameover) return false;
        other.curPiece_type = 0;
        other.onBlockOut();
        return true;
    }

    garbageRows() { return NES_B_ROWS[this.height]; }

    spawnPosition() {
        return [NES_SPAWN_ROW, 3];
    }

    dasCharges() { return this.phase === "active"; } // not during the entry delay or a line clear
    // Left or right during the entry delay or a line clear only redirect the charge, and letting go
    // never resets it: only a press while a piece is in play does (tetris.wiki)
    keepsDas(pressed) { return this.phase !== "active" || !pressed; }
    canShift() { return !this.held.soft; } // no shifting while down is held

    // Blocked: DAS is (or stays) fully charged and tries again every frame
    onShiftBlocked() {
        this.dasCounter = this.das;
        this.arrCounter = this.arr - 1;
    }

    scoreClear(n) {
        super.scoreClear(n);
        if (!this.gameover) this.setNesDelays();
    }

    // After a lock: the entry delay grows with the height of the piece's centre (box cell 2, 2),
    // and a line clear lasts until the fifth animation step, which comes on a multiple of 4 frames
    setNesDelays() {
        const height = HEIGHT - 1 - (this.curPiece_row + 2); // 0 in the bottom row
        this.are = Math.min(NES_ARE_MAX, NES_ARE + NES_ARE_STEP * Math.floor((height + 2) / 4));
        this.lineAre = this.are;
        this.lineClearDelay = NES_LINE_CLEAR + (-this.frames & 3);
    }

    // The first level-up after start x 10 + 10 lines, or after max(100, start x 10 - 50) if that's
    // sooner, then every 10, with no end
    levelForLines() {
        const start = this.startLevel;
        const first = Math.min(start * 10 + 10, Math.max(100, start * 10 - 50));
        return this.lines < first ? start : start + 1 + Math.floor((this.lines - first) / NES_LINES_PER_LEVEL);
    }
}

// ----------------------------------------------------------
// GB (1989), A-Type (endless, levels 0-20) and B-Type (25 lines over garbage): the left-handed
// NRS, an 18-row well, the GB randomizer with its OR bug

class GbGame extends Game1989 {
    constructor(mode, variant, startLevel, height) {
        super(mode, variant);
        this.gb = true;
        this.setShapes(GB_SHAPES);
        // the 18-row well, drawn from its top row: pieces never leave it
        this.wellTop = this.firstDrawnRow = this.pieceTop = GB_WELL_TOP;
        this.randomizer = new GbRandomizer(Date.now());
        this.setStart(startLevel, GB_START_LEVELS, height);
        this.heart = false;
    }

    // Heart mode (the Heart card), before the first piece
    setOptions(options = {}) {
        super.setOptions(options);
        this.heart = !!options.heart;
        if (this.versus) this.setVersus(options.seed ?? Date.now());
    }

    // Versus: the same pieces, starting garbage and hole column from the match's seed
    setVersus(seed) {
        this.randomizer = new GbRandomizer(seed);
        this.seedVersus(seed);
        this.sendsGarbage = true;
        this.garbageEveryLock = true;
        this.versusWins = GB_VS_WINS;
        this.goalReached = false;
        this.vsHole = GB_VS_HOLES[1 + Math.floor(this.random() * 7)];
        this.startLevel = this.level = GB_VS_LEVEL;
    }

    record() { return this.versus ? null : super.record(); }

    // Every attack's garbage has its holes in the column both sides share
    receiveGarbage(attack) {
        super.receiveGarbage(attack.item ? attack : { ...attack, hole: this.vsHole });
    }

    // Versus: a clear sends its lines; 30 lines end the round (the rows collapse first, as the round
    // stops here)
    scoreClear(n, rows) {
        super.scoreClear(n, rows);
        if (!this.versus || this.gameover) return;
        if (GB_VS_LINES[n]) this.sendAttack({ lines: GB_VS_LINES[n] });
        if (this.lines >= GB_VS_GOAL) {
            this.goalReached = true;
            this.collapse(rows);
            this.endGame(`${GB_VS_GOAL} LINES`, `SCORE ${this.scoreText()}`);
        }
    }

    // 30 lines first; else topping out loses
    versusOutcome() {
        const other = this.rival;
        if (this.goalReached || other.goalReached) return this.goalReached === other.goalReached ? "draw" : this.goalReached ? "win" : "lose";
        return super.versusOutcome();
    }

    speedLevel() { return this.level + (this.heart ? GB_HEART_LEVELS : 0); }

    // The level with a heart in heart mode, as the GB shows it
    getStats() {
        if (this.versus) {
            return [["GB", "VERSUS"], ["LINES", `${this.lines} / ${GB_VS_GOAL}`], ["LEVEL", String(this.level)],
                ["SENT", String(this.linesSent)], ["SCORE", this.scoreText()]];
        }
        const stats = super.getStats();
        if (this.heart) stats[1] = ["LEVEL", `${this.level} ♥`];
        return stats;
    }

    garbageRows() { return this.height * GB_ROWS_PER_HEIGHT; }

    // Versus: the GB deals one pattern of garbage to both sides (the highest height's rows), and each
    // keeps its own height's rows of it from the bottom (each player sets their own height: tetris.wiki)
    setupField() {
        if (!this.versus) return super.setupField();
        const pattern = Array.from({ length: (GB_B_HEIGHTS - 1) * GB_ROWS_PER_HEIGHT }, () => this.garbageRow());
        for (let k = 0; k < this.garbageRows(); k++) pattern[k].forEach((v, c) => this.setCell(HEIGHT - 1 - k, c, v));
    }

    spawnPosition() {
        return [GB_SPAWN_ROW, 3];
    }

    // A level every 10 lines up to 20, the first after (start level + 1) x 10 lines; none in versus
    levelForLines() {
        if (this.versus) return this.level;
        return Math.min(GB_MAX_LEVEL, Math.max(this.startLevel, Math.floor(this.lines / GB_LINES_PER_LEVEL)));
    }
}

registerRules([nesTetris], () => NesGame);
registerRules([gbTetris], () => GbGame);
