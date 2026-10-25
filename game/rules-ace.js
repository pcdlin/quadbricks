// ACE (AceGame): the 150-line time attack modes of the Xbox 360 game (Normal, Hi-Speed 1 and 2,
// Another, Another 2, Big): 15 levels of 10 lines, each against a time limit, with Arika SRS, hold
// and three next pieces (tetris.wiki: Tetris_The_Grand_Master_Ace; speeds and time limits from
// NullpoMino's TimeAttackMode). Big plays at Normal's speeds with pieces twice the size (the wiki:
// "similar or possibly identical" to Normal).

const ACE_LEVELS = 15, ACE_LINES_PER_LEVEL = 10;
// Gravity in 1/256 G by level from 1; past the end of a mode's list, 20G
const ACE_GRAVITY = {
    normal: [4, 12, 48, 72, 96, 128, 256, 384, 512, 768, 1024, 1280],
    hispeed1: [84, 128, 256, 512, 768, 1024, 1280],
};
// [ARE, line ARE, DAS, lock delay, line clear delay]: Normal and Hi-Speed, Another by level from 1
// (the last row on), Another 2
const ACE_DELAYS = [25, 25, 15, 30, 41];
const ACE_ANOTHER_DELAYS = [
    [18, 18, 10, 28, 14], [14, 14, 10, 24, 8], [14, 14, 9, 22, 8], [14, 14, 9, 20, 5], [12, 12, 9, 18, 5],
    [12, 12, 8, 14, 5], [10, 10, 8, 14, 5], [8, 8, 7, 13, 5], [7, 7, 7, 13, 5], [6, 6, 7, 13, 5],
];
const ACE_ANOTHER2_DELAYS = [6, 6, 7, 13, 4];
// Time limit per level in frames, by level from 1 (the last one on)
const ACE_TIME_LIMITS = { another: [60 * 60], other: [120 * 60, 120 * 60, 90 * 60] };
const ACE_MOVE_RESETS = 128; // lock resets per piece
const ACE_NEXT = 3;
const ACE_SPAWN_ROW = 2; // spawn in the top visible rows, as in TGM3

class AceGame extends RuleGame {
    constructor(mode, variant) {
        super(mode, variant);
        this.nextCount = ACE_NEXT;
        this.iKicks = KICKS_I_ARIKA;
        this.moveLimit = ACE_MOVE_RESETS;
        this.lockOut = true;
        this.randomizer = new TiRandomizer(Date.now());
        if (variant === "big") this.setBig();
        // time left on the level's clock; it waits from a level-up to the next piece
        this.aceTimer = this.aceLimit();
        this.acePaused = false;
    }

    getStats() {
        return [["ACE", VARIANT_NAMES[this.variant]], ["LEVEL", `${this.level} / ${ACE_LEVELS}`],
            ["LINES", `${this.lines} / ${ACE_LEVELS * ACE_LINES_PER_LEVEL}`],
            ["LIMIT", this.formatTime(Math.max(0, this.aceTimer))], ["TIME", this.formatTime()]];
    }

    setTimings() {
        const v = this.variant === "big" ? "normal" : this.variant, i = this.level - 1;
        const delays = v === "another" ? ACE_ANOTHER_DELAYS[Math.min(i, ACE_ANOTHER_DELAYS.length - 1)]
            : v === "another2" ? ACE_ANOTHER2_DELAYS : ACE_DELAYS;
        [this.are, this.lineAre, this.das, this.lockDelayMax, this.lineClearDelay] = delays;
        this.arr = 1;
        const gravity = ACE_GRAVITY[v] || [];
        this.gravity = i < gravity.length ? gravity[i] / 256 : 20;
        this.softGravity = Math.max(this.gravity, 1);
    }

    ghostVisible() {
        return super.ghostVisible() && this.gravity < 20; // at 20G it would sit under the piece
    }

    spawnPosition() {
        return [ACE_SPAWN_ROW, 3];
    }

    beforeSpawn() {
        this.acePaused = false;
    }

    // The level's clock; running out ends the game
    onClock() {
        if (!this.acePaused && --this.aceTimer < 0) {
            this.aceTimer = 0;
            this.endGame("TIME OVER", `LEVEL ${this.level} — ${this.lines} LINES`);
            return false;
        }
        return true;
    }

    // The time limit of the current level
    aceLimit() {
        const limits = ACE_TIME_LIMITS[this.variant === "another" ? "another" : "other"];
        return limits[Math.min(this.level - 1, limits.length - 1)];
    }

    scoreClear(n) {
        this.scoreAce(n);
    }

    // No score; a level every 10 lines (its clock starts over with the next piece), done at 150
    scoreAce(n) {
        if (n === 0) return;
        this.lines += n;
        this.addClearActions(n);
        const goal = ACE_LEVELS * ACE_LINES_PER_LEVEL;
        if (this.lines >= goal) {
            this.lines = goal;
            this.endGame("COMPLETE", `${goal} LINES — ${this.formatTime()}`);
            return;
        }
        const level = 1 + Math.floor(this.lines / ACE_LINES_PER_LEVEL);
        if (level === this.level) return;
        this.level = level;
        this.aceTimer = this.aceLimit();
        this.acePaused = true;
        this.updateTimings();
        this.setShadow();
    }
}

registerRules([tgmAce], () => AceGame);
