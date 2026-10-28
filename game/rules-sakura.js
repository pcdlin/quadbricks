// TGM3 Sakura (TGM3 Terror-Instinct's puzzle mode, World or Classic rule): clear the jewels from
// stage after stage against the clock. Sources: tetris.wiki (its TGM3 page and the Sakura stage list),
// NullpoMino's GemManiaMode (its clone) and HeborisCE's TOMOYO mode, which agree on the 27 stage maps
// and the piece sequence; where they differ tetris.wiki is followed (AGENTS.md lists the choices).
//
// - Each stage starts from its field (SAKURA_STAGES) with 7 jewels; clearing the rows they are in
//   clears the stage. Jewels are marked like item blocks (itemCells, "JEWEL"; collectItems counts them).
// - The limit time (3:00) runs through the whole game, a stage time (1:00) through stages 1-20; either
//   clock runs only while a stage is played. +1 s per jewel, +10 s for a stage cleared in under 10 s
//   (+5 s under 20 s), +60 s for clearing stage 20. The limit running out ends the game; the stage time
//   running out fails the stage once the piece in play has locked.
// - Holding the 180° rotation key (TGM3 has no 180° turns; the arcade's Start) for a second skips a
//   stage (1-19, with more than 30 s left), for 30 s.
// - After stage 20 the clear rate decides the EX stages: under 90 % none, under 100 % EX1-EX3, 100 %
//   EX1-EX5, or all seven within 5:00 of total time.
// - The pieces come in a fixed sequence of 255, the same every game, and run on across stages; Hold
//   pressed during READY moves the next piece into the hold box (stepping through the sequence). The
//   hold box empties at each stage.
// - A speed level from 0 at each stage: +1 per piece (stopping at x99) and +1 to +4 per clear,
//   SAKURA_GRAVITY and SAKURA_DELAYS by it; the ghost below 100 as in TGM3. No score.
// - Stage effects (SAKURA_EFFECTS): Mirror (the field turned after every 3rd piece), X-Ray (every
//   odd piece, jewels left in view), Color (the blocks strobe), Roll Roll (every 4th piece turns
//   clockwise every 30 frames), Big (every piece big, moving one cell at a time).

// Stage fields, rows bottom-aligned (top row first): uppercase a block of that piece's colour,
// lowercase a jewel; stages 1-20, then EX1-EX7
const SAKURA_STAGES = [
    ["..lz..tT..", ".sIIIIIIo.", ".iOOOOOOj."],
    ["....sJJt..", "....IIII..", ".....zol..", ".jIIIIIII.", ".JJJJJJJi."],
    ["...zTLt...", "....Ll....", "....so....", ".TLTLTLTL.", ".jTLTLTLi."],
    ["..lSSSS...", "...ztJJ...", "s.oSSSSS..", "JiJJJJJJj."],
    [".jIOIsIOi.", "..........", "..........", "..........", "..........", "..........", "..IOIOIO..", ".lOIOIOIo.", ".zIOIOIOt."],
    ["....lo....", "..z.JO.t..", "....OJ....", ".sOJiOJOj."],
    [".is.ZSZS..", "....ztSZ..", "Z...ZSlo..", "SZSZSZSZ..", "ZSZSZSZSj."],
    ["...jTTTTTi", ".........T", ".........T", ".oOOOOOOOs", "..........", "..........", "JJJJJJl...", "J.........", "t.........", "LLLLLLLLz."],
    ["...oTTTT..", "...IIIIs..", "TTTltz....", "IIIIIIII..", "TTTTTTTT..", "IIIIIIIIi.", "TTTTTTTTj."],
    ["...iSSj...", "..sSSSSo..", ".tSSSSSSl.", "....I.....", "....I.....", "....I.L...", "....zLL..."],
    ["....LL....", "....z.....", "....Zl....", ".....t....", "....LL....", "....so....", "iSS.LL.SSj"],
    [".......SSo", "..ZsZ...lS", ".ZiZjZ...t", "ZZZzZZZ..."],
    ["I........j", "II......iI", "III....sII", "JJJJ..oJJJ", ".tJJJlJJz."],
    ["...OZO....", "z..oOZs...", "...OZOZOZj", ".......lOZ", "......tOZi"],
    ["..J....J..", "..JOJJOJ..", "...OJJO...", "....lo....", "..........", "....tz....", "...sOOi...", "..jOOOOO.."],
    ["..l....j..", "..I..s.I..", "..I.iz.I..", "..I....I..", "..oIIIIt..", "..........", ".........."],
    ["l..S..T..o", "...S..T...", "...S..z...", "...S..T...", "...t..T...", "...S..T...", "...S..s...", "...S..T...", "...S..T...", ".TTTjiSSS."],
    ["...OjOO...", "..O....O..", ".L..iz..l.", ".t..os..L.", ".ZL....LZ.", ".ZZLLLLZZ."],
    ["......l...", ".....L....", "....LZL...", ".L..LZZL..", ".LL..zZZ..", "..tZ.ZZZZ.", "..ZZZZOsLL", ".ZLOoOOOOL", ".LLOOIIIIi", "..LOJJjJJJ"],
    ["..jJJJJJ..", "I..iIII..I", "SS..sS..SS", "OOl....oOO", "ZZZz..tZZZ"],
    ["..SSSSS...", ".SSSSSSjS.", "SSSSSSSSi.", "S..SLLS..S", ".z.SLL.t.s", "....LL....", "....LL....", "....LL....", "....ol...."],
    ["..J....J..", ".JlJ..JoJ.", "..J....J..", "..........", "..........", "....zt....", "..........", "..........", "...IisI...", "...JJjJ..."],
    ["........IT", "........OS", "sj........", "Zl........", "..........", "..........", "..........", "..........", "..........", "..........", "....it....", "....zo...."],
    ["SSSSs.....", ".....lOOOo", "..........", "iJJJj.....", ".....tZZZz"],
    [".....j....", "...s...i..", ".....o....", "...t...l..", ".....z....", "..........", ".........."],
    ["....ZZ....", "....LL....", "....LL....", "....LL....", "...lLLo...", "..LIIIIL..", "..LIIIIL..", "..L..s.L..", "..L.tz.L..", "..LJJJjL..", "..LiJJJL..", "..LLLLLL.."],
    [".iLSSSSSj.", "S.OLSSSS.O", "SS.OLSS.OL", "SSS.OL.OLS", "SSSL.sOLSS", "SSLOo.LSSS", "SLO.Ll.SSS", "LO.SSLO.SS", "O.SSSSLO.S", ".tSSSSSLz."],
];
const SAKURA_NORMAL_STAGES = 20; // then the EX stages
const SAKURA_EFFECTS = { 3: "MIRROR", 7: "X-RAY", 11: "COLOR", 12: "MIRROR", 15: "ROLL ROLL", 22: "BIG" };
const SAKURA_PIECES = { I: tetI, T: tetT, L: tetL, J: tetJ, S: tetS, Z: tetZ, O: tetO };
// The piece sequence, the same every game, from its start again after the 255th
const SAKURA_SEQUENCE =
    "LIJOTSZILJOTISJZLOIJSZTIOJZTLSOZTISOLTJSIZTOJLIZSTOIZLTJOSILTZSOITJLZSTJJISOLJITSLZOI" +
    "ZSJOITSZLJTSZLISTJLZOTIOZSJILTZSOITZJSOLTJSZIOJLZIOJTZIZLOSIZTJOILZSOJIOSZTJILOSSILZO" +
    "TJIZTSOLZTSOIJTZSILTZOSIJZTOLJISOLJTZSOLTZJSOTILZJTOLZIJSOZTJLOZSTLOZITSOLZTJIOSLZJTO";
// Gravity (1/256 G) and delays (ARE, line ARE, DAS, lock delay, line clear delay) by speed level
const SAKURA_GRAVITY = [[0, 4], [20, 32], [30, 64], [33, 96], [36, 128], [39, 160], [43, 192], [47, 224], [51, 256], [100, 512],
    [130, 768], [160, 1024], [250, 768], [300, 5120]];
const SAKURA_DELAYS = [[0, 25, 25, 14, 30, 40], [300, 25, 25, 8, 30, 25]];
const SAKURA_LEVEL_FOR_LINES = [0, 1, 2, 3, 4]; // tetris.wiki: the bonus levels are Master's and Shirase's
const SAKURA_MAX_LEVEL = 999;
const SAKURA_LIMIT_FRAMES = 180 * 60, SAKURA_STAGE_FRAMES = 60 * 60;
const SAKURA_JEWEL_BONUS = 60; // frames of limit time per jewel cleared
const SAKURA_FAST_BONUS = [[10 * 60, 10 * 60], [20 * 60, 5 * 60]]; // a stage cleared under its time: the bonus
const SAKURA_STAGE20_BONUS = 60 * 60;
const SAKURA_SKIP_FRAMES = 60, SAKURA_SKIP_COST = 30 * 60; // held that long, it costs that much (and needs more left)
const SAKURA_EX_RATE = 90, SAKURA_EX7_FRAMES = 5 * 60 * 60; // the EX stages' gates
const SAKURA_RESULT_FRAMES = 120; // the stage's result shows this long before the next (the clones: 300, or a key)

// The fixed sequence as a randomizer
class SakuraSequence {
    constructor() { this.k = 0; }
    next() {
        const type = SAKURA_PIECES[SAKURA_SEQUENCE[this.k]];
        this.k = (this.k + 1) % SAKURA_SEQUENCE.length;
        return type;
    }
}

class TiSakuraGame extends TiGame {
    constructor(mode, variant) {
        super(mode, variant);
        this.internalGrading = false;
        this.hasKill = false;
        this.maxLevel = SAKURA_MAX_LEVEL;
        this.randomizer = new SakuraSequence();
        this.stage = 0; // index into SAKURA_STAGES
        this.lastStage = SAKURA_NORMAL_STAGES - 1; // the last to play (the EX stages are decided after stage 20)
        this.tried = 0;
        this.cleared = 0;
        this.limit = SAKURA_LIMIT_FRAMES;
        this.stageFrames = 0; // frames this stage has been played
        this.stageTimeUp = false;
        this.jewels = 0; // jewels left in the stage
        this.skipHeld = 0;
        this.allClear = 0; // the end reached: 1, the last EX stage cleared: 2
    }

    setupField() { this.loadStage(0); }

    // A stage's field, its jewels, a fresh speed level and hold box; its READY comes next
    loadStage(stage) {
        this.stage = stage;
        this.itemCells = this.field.map(() => new Array(WIDTH).fill(null));
        for (const row of this.field) row.fill(0);
        const rows = SAKURA_STAGES[stage];
        rows.forEach((line, k) => {
            const r = HEIGHT - rows.length + k - FIELD_TOP;
            [...line].forEach((ch, c) => {
                if (ch === ".") return;
                this.field[r][c] = SAKURA_PIECES[ch.toUpperCase()];
                if (ch !== ch.toUpperCase()) this.itemCells[r][c] = "JEWEL";
            });
        });
        this.jewels = this.itemCells.flat().filter(Boolean).length;
        this.heldpiece = 0;
        this.canHold = true;
        this.level = 0;
        this.firstPiece = true;
        this.stageFrames = 0;
        this.stageTimeUp = false;
        this.pieces = 0; // pieces entered this stage, for the effects
        this.locks = 0;
        this.skipHeld = 0;
        this.mirroredAt = -Infinity;
        if (this.effect() === "BIG") {
            this.setBig();
            this.bigMove = 1; // big, but moving one cell at a time (tetris.wiki)
        } else if (this.big) {
            this.big = false;
            this.curCells = this.pieceCells;
        }
        this.curPiece_type = 0;
        this.shadowRow = -100;
        this.setPhase("ready", 0);
        this.startdelayCounter = 0;
        this.timerStopped = false;
        this.updateTimings();
        this.addAction("STAGE " + this.stageName(), "grade");
        if (this.effect()) this.addAction(this.effect(), "grade");
    }

    stageName(stage = this.stage) {
        return stage < SAKURA_NORMAL_STAGES ? String(stage + 1) : "EX" + (stage - SAKURA_NORMAL_STAGES + 1);
    }

    effect() { return SAKURA_EFFECTS[this.stage] || null; }

    clearRate() { return this.tried ? Math.floor(this.cleared * 100 / this.tried) : 0; }

    statsName() { return ["TGM3 TI", (this.ars ? "CLASSIC" : "WORLD") + " SAKURA"]; }

    getStats() {
        const stageTime = this.stage < SAKURA_NORMAL_STAGES ? this.formatTime(Math.max(0, SAKURA_STAGE_FRAMES - this.stageFrames)) : "—";
        return [this.statsName(), ["STAGE", this.stageName() + (this.effect() ? "  ·  " + this.effect() : "")], ["REST", String(this.jewels)],
            ["LIMIT", this.formatTime(Math.max(0, this.limit))], ["STAGE TIME", stageTime]];
    }

    // The end reached, then the stage, the clear rate and the time
    record() {
        return { key: [this.allClear, this.stage, this.clearRate(), -this.frames],
            text: `STAGE ${this.stageName()} · ${this.clearRate()}% · ${this.formatTime()}` };
    }

    endNotes() { return [`CLEAR ${this.clearRate()}%  ·  TOTAL ${this.formatTime()}`]; }
    secretGradeLabels() { return null; }
    testSetup() { return false; }

    delayRow(speedLevel) { return tableLookup(SAKURA_DELAYS, speedLevel); }
    gravityAt(speedLevel) { return tableLookup(SAKURA_GRAVITY, speedLevel)[1] / 256; }

    // Hold pressed during READY: the next piece goes into the hold box, again with each press, the piece held before
    // lost: a way to move the fixed sequence on to a better piece (tetris.wiki: "to clobber the previous piece being held")
    advanceFrame(input) {
        if (this.phase === "ready" && !this.gameover && (input & HOLD_PUSH) === HOLD_PUSH) {
            this.heldpiece = this.queue.shift();
            this.fillQueue();
            this.holds++;
        }
        super.advanceFrame(input);
    }

    // The clocks, a skip held, and the result between stages
    onClock() {
        if (this.phase === "stageend") {
            if (++this.phaseCounter >= this.phaseLength) this.loadStage(this.stage + 1);
            return false;
        }
        this.limit--;
        this.stageFrames++;
        if (this.limit <= 0) {
            this.endGame("TIME OVER", `STAGE ${this.stageName()} — ESC FOR MENU`);
            return false;
        }
        if (this.stage < SAKURA_NORMAL_STAGES && this.stageFrames >= SAKURA_STAGE_FRAMES) this.stageTimeUp = true;
        this.skipHeld = this.held.rot180 ? this.skipHeld + 1 : 0;
        if (this.skipHeld >= SAKURA_SKIP_FRAMES && this.stage < SAKURA_NORMAL_STAGES - 1 && this.limit > SAKURA_SKIP_COST) {
            this.limit -= SAKURA_SKIP_COST;
            this.endStage("SKIPPED");
            return false;
        }
        return super.onClock();
    }

    afterSpawn(newPiece) {
        super.afterSpawn(newPiece);
        if (newPiece) this.pieces++;
    }

    // Roll Roll's pieces (every 4th) turn clockwise right after they enter, then every 30 frames
    onActiveFrame() {
        super.onActiveFrame();
        if (this.rolling() && !this.spawnedThisFrame && (this.activeTime - 2) % 30 === 0) this.rotate(1);
    }

    rolling() { return this.effect() === "ROLL ROLL" && this.pieces % 4 === 0; }

    getPieceColor() { return this.rolling() ? 8 : super.getPieceColor(); }

    // X-Ray (odd pieces): the stack dark but where a beam sweeps across, the jewels left in view
    // (tetris.wiki: "the periodic invisibility of non-jewel blocks"); Color: every block strobes
    itemAlpha(row, col) {
        let alpha = super.itemAlpha(row, col);
        if (this.effect() === "X-RAY" && this.pieces % 2 === 1 && !this.getCellItem(row, col)) {
            const beam = (this.frames % 36) / 2;
            alpha *= col > beam ? 0 : Math.max(0, 1 - (beam - col) / 4);
        }
        if (this.effect() === "COLOR") alpha *= 0.55 + 0.45 * Math.cos((row + col) * 0.7 - this.frames / 5);
        return alpha;
    }

    // Jewels in the rows a clear took: gone, a second of limit time each
    collectItems(rows) {
        let n = 0;
        for (const r of rows) {
            const marks = this.itemCells[r - FIELD_TOP];
            for (let c = 0; c < WIDTH; c++) if (marks[c] === "JEWEL") { marks[c] = null; n++; }
        }
        if (!n) return;
        this.jewels -= n;
        this.limit += n * SAKURA_JEWEL_BONUS;
    }

    // No score: lines and the speed level (+1 to +4)
    scoreLines(n) {
        this.lines += n;
        this.addClearActions(n);
        this.level = Math.min(this.maxLevel - 1, this.level + SAKURA_LEVEL_FOR_LINES[n]);
        this.updateTimings();
        this.setShadow();
    }

    // After a clear: the stage is cleared when its last jewel has gone
    afterClear() {
        if (this.jewels <= 0) this.endStage("CLEAR");
        else super.afterClear();
    }

    // After every lock (a clear's: once it has collapsed): Mirror turns the field after every 3rd
    // piece, and a stage out of time ends here
    startAre(length) {
        this.locks++;
        if (this.stageTimeUp) {
            this.endStage("TIME UP");
            return;
        }
        if (this.effect() === "MIRROR" && this.locks % 3 === 0) this.mirrorField();
        super.startAre(length);
    }

    // A stage ends (CLEAR, TIME UP or SKIPPED): its bonuses, after stage 20 the EX stages it opens,
    // then the next stage after the result, or the end
    endStage(result) {
        this.tried++;
        let bonus = 0;
        if (result === "CLEAR") {
            this.cleared++;
            const fast = SAKURA_FAST_BONUS.find(([under]) => this.stageFrames < under);
            if (fast) bonus += fast[1];
            if (this.stage === SAKURA_NORMAL_STAGES - 1) bonus += SAKURA_STAGE20_BONUS;
        }
        this.limit += bonus;
        this.addAction(result === "CLEAR" ? "STAGE CLEAR" : result, "grade");
        if (bonus) this.addAction(`+${bonus / 60} SEC`, "grade");
        if (this.stage === SAKURA_NORMAL_STAGES - 1) {
            const rate = this.clearRate(), ex = rate < SAKURA_EX_RATE ? 0 : rate < 100 ? 3 : this.frames <= SAKURA_EX7_FRAMES ? 7 : 5;
            this.lastStage = SAKURA_NORMAL_STAGES - 1 + ex;
        }
        this.curPiece_type = 0;
        this.shadowRow = -100;
        if (this.stage >= this.lastStage) {
            this.allClear = result === "CLEAR" && this.stage === SAKURA_STAGES.length - 1 ? 2 : 1;
            this.endGame(this.allClear === 2 ? "ALL CLEAR" : "COMPLETE", `STAGE ${this.stageName()} — ${this.formatTime()}`);
            return;
        }
        this.timerStopped = true;
        this.setPhase("stageend", SAKURA_RESULT_FRAMES);
    }

    onBlockOut() {
        this.endGame("GAME OVER", `STAGE ${this.stageName()} — ESC FOR MENU`);
    }
}

VARIANT_NAMES.sakura = "SAKURA";
{
    const pickTi = RULE_CLASSES[arika];
    registerRules([arika, tgmClassic], variant => variant === "sakura" ? TiSakuraGame : pickTi(variant));
}
