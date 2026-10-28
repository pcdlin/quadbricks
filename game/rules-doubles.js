// TAP Doubles (TGM2 The Absolute Plus): two players in one well 14 columns wide, each with their own
// piece, level and speed (tetris.wiki's TAP page and harddrop.com, which say little more; no clone has
// the mode). Each player is a TapDoublesGame; player 1's creates player 2's (partner) and both work on
// one field (shared, so its rows are changed in place), each seeing the other's piece in play as solid.
//
// - The well is 14 wide; each player's pieces enter over their half (DOUBLES_SPAWN_COLS). A piece
//   whose entry the partner's piece blocks waits a frame; the stack blocking it ends the game for both.
// - Levels by player, as in Normal: +1 per piece and per line the player clears, no section stops but
//   299, which needs a line clear; TAP_DOUBLES_GRAVITY by the player's level (20G at 300, where the
//   one who gets there first plays on until the other does); Normal's delays.
// - A clear is the clearing player's (its lines and score); the other's clear waiting to collapse
//   follows the rows that fall (shiftPending()).
// - Both at 300 complete the game. The 20G credit roll that follows on the arcade is left out (it
//   changes nothing: "surviving it does not matter", and holding Start skips it).
// - TAP's score per player (Master's formula); no grades, no items.

const DOUBLES_WIDTH = 14;
const DOUBLES_SPAWN_COLS = [2, 9]; // each player's piece box: the 3-wide pieces in columns 3-5 and 10-12
const DOUBLES_MAX_LEVEL = 300;
const TAP_DOUBLES_GRAVITY = [[0, 4], [8, 5], [19, 6], [35, 8], [40, 10], [50, 12], [60, 16], [70, 32], [80, 48], [90, 64],
    [100, 4], [108, 5], [119, 6], [135, 8], [140, 10], [150, 12], [160, 16], [170, 32], [180, 48], [190, 64], [200, 80],
    [220, 96], [240, 112], [260, 128], [300, 5120]];

class TapDoublesGame extends TapGame {
    constructor(mode, variant, player = 0) {
        super(mode, variant);
        this.player = player; // 0 or 1
        this.partner = null;
        this.width = DOUBLES_WIDTH;
        this.field = this.field.map(() => new Array(DOUBLES_WIDTH).fill(0));
        this.maxLevel = DOUBLES_MAX_LEVEL;
        this.sectionStops = false;
        this.internalGrading = false;
        this.randomizer = new TapRandomizer(Date.now() + 7919 * player);
    }

    // Player 1's game makes player 2's: the same field and effect queues
    begin() {
        super.begin();
        if (this.player !== 0) return;
        const p = new TapDoublesGame(this.gamemode, this.variant, 1);
        p.partner = this;
        this.partner = p;
        p.field = this.field;
        for (const queue of ["clearedCells", "hardDropCells", "sounds", "bumps"]) p[queue] = this[queue];
        p.setOptions({ big: this.bigMode });
        p.begin();
    }

    // Shared queues are emptied in place
    drain(queue) {
        return this[queue].splice(0);
    }

    // Clear messages show on the one board: player 1's
    addAction(text, kind, value = 0) {
        RuleGame.prototype.addAction.call(this.player ? this.partner : this, text, kind, value);
    }

    statsName() { return ["TGM2 TAP", "DOUBLES"]; }

    getStats() {
        const [p1, p2] = this.player ? [this.partner, this] : [this, this.partner];
        return [this.statsName(), ["P1 LEVEL", `${p1.level} / ${this.maxLevel}`], ["P2 LEVEL", `${p2.level} / ${this.maxLevel}`],
            ["TIME", this.formatTime()], ["SCORE", (p1.score + p2.score).toLocaleString("en-US")]];
    }

    // The lower level, then the time
    record() {
        const low = Math.min(this.level, this.partner.level);
        return { key: [low, -this.frames], text: `LV ${this.level} · ${this.partner.level} · ${this.formatTime()}` };
    }

    secretGradeLabels() { return null; }
    tgmStats(mode, level, time) { return [mode, level, time]; }
    testSetup() { return false; }

    delayRow() { return [0, ...TAP_NORMAL_DELAYS]; }
    gravityAt() { return tableLookup(TAP_DOUBLES_GRAVITY, this.level)[1] / 256; }

    spawnPosition() { return [ARS_SPAWN_ROW, DOUBLES_SPAWN_COLS[this.player]]; }

    // The partner's piece in play is solid
    blocked(r, c) {
        return super.blocked(r, c) || this.partnerAt(r, c);
    }

    partnerAt(r, c) {
        const p = this.partner;
        if (!p || p.phase !== "active" || !p.curPiece_type) return false;
        return p.curCells[p.curPiece_type][p.curPiece_rotation].some(([i, j]) => p.curPiece_row + i === r && p.curPiece_col + j === c);
    }

    // A piece whose entry the partner's piece blocks (and only it) waits a frame
    spawn(type, fromHold) {
        const [row, col] = this.big ? this.bigSpawnPosition(type) : this.spawnPosition(type);
        const cells = this.curCells[type][0];
        if (cells.some(([i, j]) => this.partnerAt(row + i, col + j))
            && cells.every(([i, j]) => !RuleGame.prototype.blocked.call(this, row + i, col + j))) {
            this.queue.unshift(type);
            this.setPhase("are", 1);
            return;
        }
        super.spawn(type, fromHold);
    }

    // No levels past 300 (the player waits there for the partner)
    afterSpawn(newPiece) {
        if (this.level < this.maxLevel) super.afterSpawn(newPiece);
    }

    // The field changes in place (the partner's is the same), and the partner's clear waiting to
    // collapse follows the rows that fall; a partner's piece the stack fell into moves up out of it
    collapse(rows) {
        if (rows.length === 0) return;
        const kept = this.field.filter((_, i) => !rows.includes(i + FIELD_TOP));
        while (kept.length < this.field.length) kept.unshift(new Array(this.width).fill(0));
        this.field.splice(0, this.field.length, ...kept);
        this.onCollapse(rows);
        const p = this.partner;
        p.pendingRows = p.pendingRows.map(r => r + rows.filter(x => x > r).length);
        if (p.phase === "active" && p.curPiece_type) {
            for (let k = 0; k < 4 && !p.movePossible(p.curPiece_row, p.curPiece_col, p.curPiece_rotation); k++) p.curPiece_row--;
            p.setShadow();
        }
    }

    // No staff roll: the game goes on until both are at 300, which completes it
    afterClear() {
        this.timerStopped = false;
        if (this.level >= this.maxLevel && this.partner.level >= this.maxLevel) {
            const time = this.formatTime();
            for (const g of [this, this.partner]) g.endGame("COMPLETE", `BOTH AT LEVEL 300 — ${time}`);
            return;
        }
        super.afterClear();
    }

    // Topping out ends it for both
    onBlockOut() {
        for (const g of [this, this.partner]) if (!g.gameover) g.endGame("GAME OVER", `P${this.player + 1} TOPPED OUT — ESC FOR MENU`);
    }
}

VARIANT_NAMES.doubles = "DOUBLES";
{
    const pickTap = RULE_CLASSES[tgmTap];
    registerRules([tgmTap], variant => variant === "doubles" ? TapDoublesGame : pickTap(variant));
}
