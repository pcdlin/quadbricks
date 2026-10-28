// Checks for the bot (game/bot.js): the probe leaves the game alone, the places it finds are
// real, and every level plays every rule set without getting stuck.
// Usage: node test/bot.test.js
const fs = require("fs");
const vm = require("vm");
const dir = require("path").join(__dirname, "..", "game");
const BOT_FILES = ["game.js", "randomizers.js", "rules.js", "rules-guideline.js", "rules-tgm.js", "rules-ace.js", "rules-1989.js", "bot.js"];
vm.runInThisContext(BOT_FILES.map(f => fs.readFileSync(dir + "/" + f, "utf8")).join("\n") +
    "\n;Object.assign(globalThis, {createGame, Bot, BOT_LEVELS, BOT_ROWS, WIDTH, BotExplorer, botShapes, botDrops, botLock, botDead, guideline, arika, tgmClassic, tgmTap, gbTetris, tgmOriginal, nesTetris, tgmAce, aceArs, aceArs2, HEIGHT, WIDTH, FIELD_TOP, tetI, tetT, tetO, tetS, tetZ, tetL, tetJ});");

let failures = 0;
function check(name, ok, detail = "") {
    if (!ok) failures++;
    console.log((ok ? "PASS " : "FAIL ") + name + (ok || !detail ? "" : `\n     ${detail}`));
}

// The bag and the garbage use Math.random: seed it so the games repeat
function seeded(seed) {
    let a = seed >>> 0;
    Math.random = () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), a | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function started(mode, variant, ...rest) {
    const g = createGame(mode, variant, ...rest);
    for (let f = 0; f < 200 && g.phase !== "active"; f++) g.advanceFrame(0);
    return g;
}

// Plays frames until `pieces` pieces have locked or the game ends. Returns what happened.
function play(g, bot, pieces, maxFrames = 60 * 60 * 20) {
    let locked = 0, planned = 0, hit = 0, stuck = 0, frames = 0, worst = 0, ms = 0, maxMs = 0;
    let plan = null, lastKey = "";
    while (!g.isGameOver() && locked < pieces && frames < maxFrames) {
        const t0 = process.hrtime.bigint();
        const input = bot.input(g);
        const dt = Number(process.hrtime.bigint() - t0) / 1e6;
        ms += dt;
        maxMs = Math.max(maxMs, dt);
        const before = g.curPiece_type;
        if (bot.plan && bot.plan.goal && bot.plan.goal !== (plan && plan.goal)) plan = { goal: bot.plan.goal, type: g.curPiece_type };
        g.advanceFrame(input);
        frames++;
        if (before && (!g.curPiece_type || g.phase !== "active")) { // it locked (or the game ended)
            locked++;
            if (plan) {
                planned++;
                if (lastKey === goalKey(g, plan)) hit++; // where the piece was headed when it locked
            }
            plan = null;
        }
        if (g.curPiece_type) lastKey = poseKey(g);
        if (g.curPiece_type && g.activeTime > worst) worst = g.activeTime;
        if (g.curPiece_type && g.activeTime > 600) { stuck++; break; }
    }
    return { locked, planned, hit, stuck, frames, over: g.isGameOver(), worst, ms, maxMs };
}
// the cells a plan aimed for
function goalKey(g, plan) {
    const cells = g.curCells[plan.type][plan.goal.rot].map(([i, j]) => (plan.goal.land + i) + "," + (plan.goal.col + j));
    return cells.sort().join(" ");
}
// the piece's cells as they would be dropped straight down (where a drop locks it)
function poseKey(g) {
    let row = g.curPiece_row;
    while (g.movePossible(row + 1, g.curPiece_col, g.curPiece_rotation)) row++;
    return g.curCells[g.curPiece_type][g.curPiece_rotation].map(([i, j]) => (row + i) + "," + (g.curPiece_col + j)).sort().join(" ");
}

// ---------------------------------------------------------------- the probe changes nothing
{
    seeded(7);
    const g = started(guideline, "standard");
    for (let c = 0; c < 9; c++) g.setCell(21, c, 1);
    const snapshot = () => JSON.stringify({ ...g, queue: g.queue, field: g.field });
    const before = snapshot();
    const bot = new Bot(10, 1);
    bot.attach(g);
    bot.decide(g);
    check("a full search leaves the game as it was", snapshot() === before);
}
{
    seeded(7);
    const g = started(tgmClassic, "standard");
    const before = JSON.stringify(g);
    const bot = new Bot(10, 1);
    bot.attach(g);
    bot.decide(g);
    check("a full search leaves an ARS game as it was", JSON.stringify(g) === before);
}

// ---------------------------------------------------------------- known positions
{
    // an empty well: a flat piece goes in many places, every one on the floor
    seeded(3);
    const g = started(guideline, "standard");
    const bot = new Bot(10, 1);
    bot.attach(g);
    const out = [];
    bot.gather(g, g.curPiece_type, g.curPiece_row, g.curPiece_col, g.curPiece_rotation, false, out);
    check("empty well: placements found for the first piece", out.length >= 17, `got ${out.length}`);
}
{
    // at 20G the piece sits on the floor and can only slide: a column behind a two-row step is out
    // of reach when the piece can't be lifted by a kick
    seeded(3);
    const g = started(tgmClassic, "death");
    for (let r = 20; r < 22; r++) for (let c = 6; c < 10; c++) g.setCell(r, c, 1);
    const bot = new Bot(10, 1);
    bot.attach(g);
    check("20G game has 20 rows per frame gravity", g.gravity >= 20);
    let row = 0;
    while (g.movePossible(row + 1, 3, 0, tetO)) row++;
    bot.explorer.run(bot.explorerOpts(g, tetO, row, 3, 0, null));
    const cols = new Set();
    for (const lk of bot.explorer.cands) cols.add((lk >> 2) % 28 - 8);
    check("20G: the O stays on its side of a step it can't climb", [...cols].every(c => c <= 3), JSON.stringify([...cols]));
}
{
    // big pieces move two columns at a time: the lookahead only drops them where they can get
    const g = createGame(tgmOriginal, "standard", 0, 0, {}, { big: true });
    const shapes = botShapes(g), rows = new Int32Array(BOT_ROWS), wrong = [];
    for (let type = 1; type <= 7; type++) {
        botDrops(g, rows, type, shapes, (shape, col) => { if ((col - shapes.spawn[type][1]) % 2) wrong.push([type, col]); });
    }
    check("Big: lookahead drops keep the spawn column's parity", wrong.length === 0, JSON.stringify(wrong));
}
{
    // a piece locked wholly above the visible rows is a lock out in the Guideline
    const g = createGame(guideline, "standard");
    const rows = new Int32Array(BOT_ROWS), out = new Int32Array(BOT_ROWS);
    botLock(rows, out, g.curCells[tetO][0], 0, 4); // the O's blocks in rows 0 and 1
    check("lock out counts as dead where the rule set has it", botDead(g, out, tetT));
    botLock(rows, out, g.curCells[tetO][0], 19, 4);
    check("a piece on the floor is not a lock out", !botDead(g, out, tetT));
}
{
    // a T-spin double slot (stem in column 4, an overhang over the left arm) and a T in play: the
    // upper levels turn it in for the T-spin double rather than drop it anywhere
    for (const level of [6, 10]) {
        seeded(3);
        const g = started(guideline, "marathon");
        for (let c = 0; c < WIDTH; c++) {
            if (c !== 4) g.setCell(21, c, 1);
            if (c < 3 || c > 5) g.setCell(20, c, 1);
            if (c <= 3) g.setCell(19, c, 1);
        }
        g.curPiece_type = tetT;
        g.curPiece_rotation = 0;
        g.curPiece_row = 1;
        g.curPiece_col = 3;
        const done = [];
        const r = play(g, new Bot(level, 1), 1);
        while (g.actions.length) done.push(g.actions.shift().text);
        check(`level ${level} turns a T into a T-spin double slot`, r.locked === 1 && g.lines === 2 && done.includes("T-SPIN DOUBLE"), JSON.stringify({ lines: g.lines, done }));
    }
}
{
    // a restart doesn't replay the same noise and mistakes
    const bot = new Bot(0, 9);
    bot.attach(createGame(guideline, "standard"));
    const first = JSON.stringify(bot.weights);
    bot.attach(createGame(guideline, "standard"));
    check("each game draws new weight noise", JSON.stringify(bot.weights) !== first);
}

// ---------------------------------------------------------------- it plays every rule set
const MODES = [
    ["Guideline Marathon", guideline, "marathon"],
    ["Guideline Sprint", guideline, "sprint"],
    ["Guideline Master (20G)", guideline, "master"],
    ["TGM3 World", arika, "standard"],
    ["TGM3 Classic", tgmClassic, "standard"],
    ["TGM3 Shirase", arika, "shirase"],
    ["TAP Master", tgmTap, "standard"],
    ["TAP Death", tgmTap, "death"],
    ["TGM1", tgmOriginal, "standard"],
    ["ACE SRS Normal", tgmAce, "normal"],
    ["ACE ARS Normal", aceArs, "normal"],
    ["ACE ARS2 Hi-Speed 1", aceArs2, "hispeed1"],
    ["NES A-Type", nesTetris, "standard"],
    ["GB A-Type", gbTetris, "standard"],
];
for (const [name, mode, variant] of MODES) {
    seeded(11);
    const g = started(mode, variant);
    const bot = new Bot(10, 5);
    const r = play(g, bot, 120);
    check(`${name}: level 10 places pieces without getting stuck (${r.locked} placed, ${g.lines || 0} lines, ${Math.round(r.hit / Math.max(1, r.planned) * 100)}% as planned, slowest piece ${r.worst} frames, ${(r.ms / Math.max(1, r.frames)).toFixed(2)} ms/frame, at most ${r.maxMs.toFixed(0)} ms)`,
        r.stuck === 0 && (r.locked >= 100 || r.over && r.locked >= 20), JSON.stringify(r));
}
{
    seeded(5);
    const g = started(nesTetris, "standard");
    const r = play(g, new Bot(10, 5), 100);
    check("NES: places pieces at level 0 as planned", r.hit / r.planned > 0.9, `${r.hit}/${r.planned}`);
}
{
    seeded(5);
    const g = started(guideline, "standard");
    const r = play(g, new Bot(10, 5), 100);
    check("Guideline: level 10's pieces land where planned", r.hit / r.planned > 0.9, `${r.hit}/${r.planned}`);
}

// ---------------------------------------------------------------- versus
// Two bots in a versus match, attacks going both ways as the engine routes them, until the rule set
// decides it (versusOutcome); returns who won (for the first side) and what happened
function versusMatch(mode, levels, seed, startLevel = 0, options = {}, height = 0) {
    const games = [0, 1].map(i => createGame(mode, "versus", startLevel, i ? options.height2 ?? height : height, {}, { seed, ...options }));
    [games[0].rival, games[1].rival] = [games[1], games[0]];
    const bots = levels.map((level, i) => new Bot(level, i + 1));
    let frames = 0, stuck = false, risen = 0, result = null;
    while (!result && frames < 60 * 60 * 10) {
        games.forEach((g, i) => { if (!g.isGameOver()) g.advanceFrame(bots[i].input(g)); });
        games.forEach((g, i) => {
            for (const a of g.takeAttacks()) games[1 - i].receiveGarbage({ ...a, hole: Math.floor(Math.random() * WIDTH) });
            risen += g.takeRisenGarbage().reduce((a, b) => a + b, 0);
            if (g.curPiece_type && g.activeTime > 600) stuck = true;
        });
        if (stuck) break;
        result = games[0].versusOutcome();
        frames++;
    }
    return { result, frames, stuck, risen, games };
}
{
    // Guideline: the stronger one wins, and neither gets stuck under the garbage
    seeded(21);
    const { result, frames, stuck, risen, games } = versusMatch(guideline, [10, 0], 99);
    check(`versus: level 10 beats level 0 (${(frames / 60).toFixed(0)} s, ${games[0].linesSent} lines sent, ${risen} garbage rows risen in all)`,
        !stuck && result === "win" && games[1].isGameOver() && !games[0].isGameOver() && games[0].linesSent > 0, JSON.stringify({ frames, stuck, result }));
}
for (const [mode, name] of [[arika, "TGM3 World"], [tgmClassic, "TGM3 Classic"]]) {
    // TGM3: garbage copied from the clears goes both ways, and the round ends (level 200, a top out or time)
    seeded(22);
    const { result, frames, stuck, risen, games } = versusMatch(mode, [10, 2], 31);
    check(`${name} versus: level 10 beats level 2 (${(frames / 60).toFixed(0)} s, ${games[0].linesSent} rows sent, ${risen} risen, levels ${games.map(g => g.level).join(" / ")})`,
        !stuck && result === "win" && games[0].linesSent > 0, JSON.stringify({ frames, stuck, result }));
}
{
    // NES: no garbage, the higher score once a side tops out
    seeded(23);
    const { result, frames, stuck, games } = versusMatch(nesTetris, [10, 0], 41, 9);
    check(`NES versus at level 9: level 10 beats level 0 (${(frames / 60).toFixed(0)} s, scores ${games.map(g => g.score).join(" / ")})`,
        !stuck && result === "win" && games[0].score > games[1].score, JSON.stringify({ frames, stuck, result }));
}

for (const [name, mode, options, startLevel, height] of [
    ["TGM1 Master with items", tgmOriginal, { items: true }], ["TGM1 20G", tgmOriginal, { speed: "20g" }],
    ["TGM3 Classic, Defence", tgmClassic, { style: "defence" }],
    ["TAP Master with items", tgmTap, { items: true }], ["TAP Death to level 300", tgmTap, { speed: "death", goal: 300 }], ["TAP TGM+", tgmTap, { speed: "plus" }],
    ["TGM3 World with items", arika, { items: true }],
    ["ACE ARS2 Normal with items", aceArs2, { speed: "normal", items: true }], ["ACE SRS Another", tgmAce, { speed: "another" }],
    ["GB heights 2 and 4", gbTetris, { height2: 4 }, 0, 2], ["GB heart", gbTetris, { heart: true }],
]) {
    // the other rule sets: a round goes to the stronger side, through garbage (and items) both ways
    seeded(24);
    const { result, frames, stuck, risen, games } = versusMatch(mode, [8, 2], 42, startLevel, options, height);
    check(`${name} versus: level 8 beats level 2 (${(frames / 60).toFixed(0)} s, ${games[0].linesSent} / ${games[1].linesSent} sent, ${risen} risen)`,
        !stuck && result === "win", JSON.stringify({ frames, stuck, result, over: games.map(g => g.endTitle) }));
}

// ---------------------------------------------------------------- levels
{
    // each level on Guideline Marathon (lines before topping out or 100 lines), the better ones further
    const lines = [];
    for (let level = 0; level < BOT_LEVELS.length; level++) {
        let total = 0;
        for (let game = 0; game < 3; game++) {
            seeded(100 + game);
            const g = started(guideline, "marathon");
            const r = play(g, new Bot(level, 7 + game), 400);
            check(`level ${level}, game ${game} never gets stuck`, r.stuck === 0, JSON.stringify(r));
            total += g.lines;
        }
        lines.push(total / 3);
    }
    console.log("     average lines (of 400 pieces):", lines.map((n, i) => `${i}: ${n.toFixed(0)}`).join(", "));
    check("level 10 clears at least as many lines as level 0", lines[10] >= lines[0], JSON.stringify(lines));
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
