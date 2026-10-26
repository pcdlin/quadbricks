// Bench for the bot: plays each mode headless and prints the mode's own result (record()).
// Usage: node tools/bot-bench.js [level 0-4] [games] [mode filter] [profile override]
const fs = require("fs"), vm = require("vm");
const dir = require("path").join(__dirname, "..", "game");
const FILES = ["game.js", "randomizers.js", "rules.js", "rules-guideline.js", "rules-tgm.js", "rules-ace.js", "rules-1989.js", "bot.js"];
vm.runInThisContext(FILES.map(f => fs.readFileSync(dir + "/" + f, "utf8")).join("\n") +
    ";Object.assign(globalThis,{createGame,Bot,BOT_LEVELS,BOT_WEIGHTS,guideline,arika,tgmClassic,tgmTap,gbTetris,tgmOriginal,nesTetris,tgmAce,aceArs,aceArs2});");
const [level = 4, games = 3, filter = "", force = ""] = process.argv.slice(2);
// the bag and garbage use Math.random, the NES and GB randomizers Date.now(): both seeded so games repeat
function seeded(seed) { Date.now = () => seed; let a = seed >>> 0; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// [name, mode, variant, startLevel, height, options, max frames]
const H = 60 * 60;
const MODES = [
    ["gl-marathon", guideline, "marathon", 0, 0, {}, 15 * H], ["gl-endless", guideline, "standard", 0, 0, {}, 8 * H],
    ["gl-sprint", guideline, "sprint", 0, 0, {}, 10 * H], ["gl-ultra", guideline, "ultra", 0, 0, {}, 10 * H],
    ["gl-dig", guideline, "dig", 0, 2, {}, 10 * H], ["gl-master", guideline, "master", 0, 0, {}, 15 * H],
    ["tgm1", tgmOriginal, "standard", 0, 0, {}, 20 * H], ["tgm1-20g", tgmOriginal, "20g", 0, 0, {}, 20 * H],
    ["tap-normal", tgmTap, "normal", 0, 0, {}, 20 * H], ["tap-master", tgmTap, "standard", 0, 0, {}, 20 * H],
    ["tap-death", tgmTap, "death", 0, 0, {}, 20 * H], ["tap-plus", tgmTap, "plus", 0, 0, {}, 20 * H],
    ["tgm3-world", arika, "standard", 0, 0, {}, 20 * H], ["tgm3-classic", tgmClassic, "standard", 0, 0, {}, 20 * H],
    ["tgm3-easy", arika, "easy", 0, 0, {}, 20 * H], ["tgm3-shirase", arika, "shirase", 0, 0, {}, 20 * H],
    ["ace-normal", tgmAce, "normal", 0, 0, {}, 20 * H], ["ace-hispeed1", tgmAce, "hispeed1", 0, 0, {}, 20 * H],
    ["ace-hispeed2", tgmAce, "hispeed2", 0, 0, {}, 20 * H], ["ace-another", aceArs, "another", 0, 0, {}, 20 * H],
    ["nes-a", nesTetris, "standard", 0, 0, {}, 15 * H], ["nes-a18", nesTetris, "standard", 18, 0, {}, 15 * H], ["nes-b", nesTetris, "btype", 0, 5, {}, 15 * H],
    ["gb-a", gbTetris, "standard", 0, 0, {}, 15 * H], ["gb-b", gbTetris, "btype", 0, 5, {}, 15 * H],
];
for (const [name, mode, variant, start, height, options, max] of MODES) {
    if (filter && !name.includes(filter)) continue;
    const rows = [];
    for (let s = 1; s <= games; s++) {
        seeded(1000 + s);
        const g = createGame(mode, variant, start, height, {}, options);
        for (let f = 0; f < 200 && g.phase !== "active"; f++) g.advanceFrame(0);
        const bot = new Bot(+level, s);
        if (force) bot.forceProfile = force;
        let frames = 0, ms = 0, mx = 0;
        while (!g.isGameOver() && frames < max) {
            const t = process.hrtime.bigint(); const i = bot.input(g); const d = Number(process.hrtime.bigint() - t) / 1e6; ms += d; mx = Math.max(mx, d);
            g.advanceFrame(i); frames++;
        }
        const rec = g.record();
        rows.push(`${rec ? rec.text : "-"} [${g.isGameOver() ? g.endTitle : "cap"} ${(g.frames / 3600).toFixed(1)}m ${mx.toFixed(0)}ms]`);
    }
    console.log(name.padEnd(14), rows.join(" | "));
}
