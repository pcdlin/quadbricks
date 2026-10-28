// ACE (AceGame): the 150-line time attack modes of the Xbox 360 game (Normal, Hi-Speed 1 and 2,
// Another, Another 2, Big): 15 levels of 10 lines, each against a time limit, with Arika SRS, hold
// and three next pieces, a 7-bag (tetris.wiki: Tetris_The_Grand_Master_Ace, TGM_randomizer; speeds
// and time limits from NullpoMino's TimeAttackMode). Big plays at Normal's speeds with pieces twice the size (the wiki:
// "similar or possibly identical" to Normal).
// Three rules (the mode ids): SRS (tgmAce), ARS (aceArs: TGM3's ARS shapes and kicks with no floor
// kick limit, standard colours, hard drop locks, soft drop about 0.5G and not locking) and ARS2
// (aceArs2: the same with the drops' locking swapped: up is a sonic drop, soft drop locks on the
// ground). All three: lock resets up to 128 per piece.
// "versus" (AceVersusGame, tetris.wiki): a three-minute time limit and a 20-line quota, attacks as in
// the other TGM games (tgmVersus()), items that can be turned off; first to two rounds, as TAP's (an
// assumption). Each side plays the speed of one of the modes (options.speed).

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
const ACE_ARS_SOFT = 0.5; // ARS rules' soft drop, rows per frame
const ACE_VS_FRAMES = 3 * 60 * 60, ACE_VS_LINES = 20; // versus: 20 lines within 3:00
const ACE_SPEEDS = ["normal", "hispeed1", "hispeed2", "another", "another2"]; // the modes whose speed versus plays
const ACE_RULE_NAMES = { [aceArs]: "ARS ", [aceArs2]: "ARS2 " }; // before the mode in the stats

class AceGame extends RuleGame {
    constructor(mode, variant) {
        super(mode, variant);
        this.nextCount = ACE_NEXT;
        this.iKicks = KICKS_I_ARIKA;
        this.moveLimit = ACE_MOVE_RESETS;
        this.lockOut = true;
        // a blocked entry moves the piece up, as far as rows 21-22, before it is a block out (tetris.wiki)
        this.spawnRise = 2;
        this.bagNoSzoFirst = true; // a 7-bag that never starts with S, Z or O (tetris.wiki: TGM randomizer)
        this.ars2 = mode === aceArs2;
        if (mode !== tgmAce) {
            this.useArs(false, DEFAULT_PALETTE);
            this.arsFloorKicks = { i: Infinity, t: Infinity };
            this.floorKickZeroes = false;
        }
        if (variant === "big") this.setBig();
        this.speed = variant === "big" ? "normal" : variant; // the mode whose speeds it plays (versus: options.speed)
        this.levelClock = true; // each level has a time limit (not in versus)
        // time left on the level's clock; it waits from a level-up to the next piece
        this.aceTimer = this.aceLimit();
        this.acePaused = false;
    }

    getStats() {
        return [this.statsName(), ["LEVEL", `${this.level} / ${ACE_LEVELS}`],
            ["LINES", `${this.lines} / ${ACE_LEVELS * ACE_LINES_PER_LEVEL}`],
            ["LIMIT", this.formatTime(Math.max(0, this.aceTimer))], ["TIME", this.formatTime()]];
    }

    statsName() {
        return ["ACE", (ACE_RULE_NAMES[this.gamemode] || "") + VARIANT_NAMES[this.variant]];
    }

    // Lines, then time
    record() {
        return { key: [this.lines, -this.frames], text: `${this.lines} LINES · ${this.formatTime()}` };
    }

    setTimings() {
        const v = this.speed, i = this.level - 1;
        const delays = v === "another" ? ACE_ANOTHER_DELAYS[Math.min(i, ACE_ANOTHER_DELAYS.length - 1)]
            : v === "another2" ? ACE_ANOTHER2_DELAYS : ACE_DELAYS;
        [this.are, this.lineAre, this.das, this.lockDelayMax, this.lineClearDelay] = delays;
        this.arr = 1;
        const gravity = ACE_GRAVITY[v] || [];
        this.gravity = i < gravity.length ? gravity[i] / 256 : 20;
        this.softGravity = Math.max(this.gravity, this.ars ? ACE_ARS_SOFT : 1);
    }

    ghostVisible() {
        return super.ghostVisible() && this.gravity < 20; // at 20G it would sit under the piece
    }

    spawnPosition() {
        return [this.ars ? ARS_SPAWN_ROW : ACE_SPAWN_ROW, 3];
    }

    // ARS2: up is a sonic drop (no lock)
    upKey() {
        if (!this.ars2) return super.upKey();
        this.sonicDrop();
        return false;
    }

    // ARS2: soft drop locks on the ground
    onGround() {
        if (this.ars2 && this.softHeld()) {
            this.manualLock = true;
            this.lock();
            return;
        }
        super.onGround();
    }

    beforeSpawn() {
        this.acePaused = false;
    }

    // The level's clock; running out ends the game
    onClock() {
        if (this.levelClock && !this.acePaused && --this.aceTimer < 0) {
            this.aceTimer = 0;
            this.endGame("TIME OVER", `LEVEL ${this.level} — ${this.lines} LINES`);
            return false;
        }
        return true;
    }

    // The time limit of the current level
    aceLimit() {
        const limits = ACE_TIME_LIMITS[this.speed === "another" ? "another" : "other"];
        return limits[Math.min(this.level - 1, limits.length - 1)];
    }

    scoreClear(n) {
        this.scoreAce(n);
    }

    // Debug menu: a line short of 150, the level's clock near up, a level (its lines, its clock anew)
    modeSetups() {
        return this.versus ? [] : [{ id: "nearend" }, { id: "clock" }];
    }

    debugLevels() {
        return this.versus ? null : Array.from({ length: ACE_LEVELS }, (_, i) => i + 1);
    }

    debugLevel(level) {
        this.lines = (level - 1) * ACE_LINES_PER_LEVEL;
        this.level = level;
        this.aceTimer = this.aceLimit();
        this.updateTimings();
        this.setShadow();
        return true;
    }

    applyDebug(id, value) {
        if (id === "nearend") {
            this.debugLevel(ACE_LEVELS);
            this.lines = ACE_LEVELS * ACE_LINES_PER_LEVEL - 1;
            return true;
        }
        if (id === "clock") {
            this.aceTimer = Math.min(this.aceTimer, DEBUG_LEAD);
            return true;
        }
        return super.applyDebug(id, value);
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

// Versus: 20 lines first, or more lines after 3:00 (tgmVersus() does the rest); no level clock
class AceVersusGame extends tgmVersus(AceGame) {
    constructor(mode, variant) {
        super(mode, variant);
        this.versusFrames = ACE_VS_FRAMES;
        this.levelClock = false;
        this.itemsAtClear = true; // items work as TGM3's (tetris.wiki)
    }

    setOptions(options = {}) {
        this.speed = ACE_SPEEDS.includes(options.speed) ? options.speed : "normal";
        this.aceTimer = this.aceLimit();
        super.setOptions(options);
    }

    statsName() {
        return ["ACE", (ACE_RULE_NAMES[this.gamemode] || "") + VARIANT_NAMES[this.speed] + " VS"];
    }

    getStats() {
        return [this.statsName(), ["LINES", `${this.lines} / ${ACE_VS_LINES}`], this.timeLeftRow(),
            ["SENT", String(this.linesSent)], ["LEVEL", String(this.level)]];
    }

    versusGoal() { return this.lines >= ACE_VS_LINES; }
    versusGoalValue() { return ACE_VS_LINES; }
    versusProgress() { return this.lines; }
    goalText(value) { return `${value} LINES`; }
}

registerRules([tgmAce, aceArs, aceArs2], variant => variant === "versus" ? AceVersusGame : AceGame);
