// Checks for the player's options (game/options.js): the key bindings of the two players, the themes, and section records.
// Usage: node test/options.test.js
const fs = require("fs");
const vm = require("vm");
const dir = require("path").join(__dirname, "..", "game");
// options.js reads the themes', block styles' and rule sets' tables; none of these touch the DOM at load
const OPTION_FILES = ["game.js", "randomizers.js", "rules.js", "rules-guideline.js", "rules-tgm.js", "renderer.js", "tiles.js", "themes.js", "options.js"];
vm.runInThisContext(OPTION_FILES.map(f => fs.readFileSync(dir + "/" + f, "utf8")).join("\n") +
    "\n;Object.assign(globalThis, {Options, DEFAULT_KEYS, DEFAULT_KEYS2, THEMES, FOLLOW_THEME, THEMED_IDS, OPTION_CHOICES});");

let failures = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : `\n     expected ${JSON.stringify(expected)}\n     got      ${JSON.stringify(actual)}`));
}
// Keys bound for both players: [key, player 1's action, player 2's action]
function shared(o) {
    const out = [];
    for (const [id, codes] of Object.entries(o.keys)) for (const c of codes) {
        for (const [id2, codes2] of Object.entries(o.keys2)) if (codes2.includes(c)) out.push([c, id, id2]);
    }
    return out;
}
// Actions without a key
const keyless = o => [...Object.entries(o.keys), ...Object.entries(o.keys2)].filter(([, codes]) => !codes.length).map(([id]) => id);

{
    const o = new Options();
    check("The default keys give no key to both players and every action one", [shared(o), keyless(o)], [[], []]);
}
{
    // A key replaces the action's oldest, which another of the player's actions takes: the other
    // player's action that lost the key takes one no action of this player has
    const o = new Options();
    o.keys.left = ["KeyG", "KeyH"];
    o.keys.soft = ["KeyJ"];
    o.keys2.hold = ["KeyJ"];
    const bound = o.bind("left", "KeyJ", 1);
    check("A key taken from the other player: their action takes a key none of this player's actions has",
        [bound, o.keys.left, o.keys.soft, o.keys2.hold, shared(o), keyless(o)],
        [true, ["KeyJ"], ["KeyG"], ["KeyH"], [], []]);
}
{
    // The simple case: the replaced key goes to the other player's action
    const o = new Options();
    o.keys.left = ["KeyG", "KeyH"];
    o.keys2.hold = ["KeyJ"];
    o.bind("left", "KeyJ", 1);
    check("A key taken from the other player: their action takes the key this action replaced",
        [o.keys.left, o.keys2.hold, shared(o), keyless(o)], [["KeyH", "KeyJ"], ["KeyG"], [], []]);
}
{
    // With no key to give, the binding is refused and nothing changes
    const o = new Options();
    o.keys.left = ["KeyG"];
    o.keys.soft = ["KeyJ"];
    o.keys2.hold = ["KeyJ"];
    const bound = o.bind("left", "KeyJ", 1);
    check("A binding that would leave an action without a key is refused",
        [bound, o.keys.left, o.keys.soft, o.keys2.hold], [false, ["KeyG"], ["KeyJ"], ["KeyJ"]]);
}
{
    // Player 2 can't take player 1's sound key; the reserved key can't be bound
    const o = new Options();
    check("Player 2 can't take the sound key, and Escape can't be bound",
        [o.bind("hold", o.keys.sound[0], 2), o.bind("hold", "Escape", 1), o.keys2.hold, o.keys.hold], [false, false, DEFAULT_KEYS2.hold, DEFAULT_KEYS.hold]);
}
// Options loaded from these saved settings (a stand-in for localStorage)
function loaded(saved) {
    globalThis.localStorage = { getItem: () => JSON.stringify(saved), setItem() {} };
    try { return new Options(); } finally { delete globalThis.localStorage; }
}
const looks = o => THEMED_IDS.map(id => o.look(id));
{
    const o = new Options();
    check("At first every themed setting follows the first theme",
        [o.theme, THEMED_IDS.map(id => o[id]), looks(o)], ["space", THEMED_IDS.map(() => FOLLOW_THEME), ["space", "flat", "sparks", "flare", "streak"]]);
    o.theme = "gallery";
    check("Another theme brings its background, block style, confetti, clear burst and drop trail", looks(o), ["gallery", "wire", "neon", "rings", "neon"]);
    o.theme = "pulse";
    check("Pulse brings Wire blocks, Streaks, the Beam and the Pour trail", looks(o), ["pulse", "wire", "streaks", "beam", "pour"]);
    o.theme = "gallery";
    o.tileset = "gem";
    check("A setting of its own wins over the theme's", looks(o), ["gallery", "gem", "neon", "rings", "neon"]);
}
for (const [id, theme] of Object.entries(THEMES)) {
    check(`Theme ${id}'s choices are values of their settings`,
        THEMED_IDS.every(k => theme[k] !== FOLLOW_THEME && OPTION_CHOICES[k].includes(theme[k])), true);
}
{
    const o = loaded({ theme: "lines", tileset: "flat", confetti: "glow", rings: "flare" });
    check("Saved before themes: the theme stays, settings left at their old defaults follow it",
        [o.theme, o.background, o.tileset, o.confetti, o.rings, looks(o)],
        ["lines", FOLLOW_THEME, FOLLOW_THEME, "glow", FOLLOW_THEME, ["lines", "chalk", "glow", "contours", "chalk"]]);
    const p = loaded({ theme: "lines", background: "space", tileset: "flat", confetti: FOLLOW_THEME, rings: "flare" });
    check("Saved with themes: every setting as saved", [p.theme, looks(p)], ["lines", ["space", "flat", "paper", "flare", "chalk"]]);
    check("A drop trail saved on or off: following the theme, or off",
        [loaded({ theme: "undersea", trail: true }).look("trail"), loaded({ theme: "undersea", trail: false }).look("trail")], ["water", "off"]);
    check("The Neon block style saved: Wire, which replaced it", loaded({ theme: "space", background: FOLLOW_THEME, tileset: "neon" }).tileset, "wire");
}
{
    const r = new SectionRecords(); // no storage here: kept in memory
    const first = r.submit("tap", [3000, 3200]);
    const second = r.submit("tap", [3100, 3100, , 2900]);
    check("Section records: each section's best kept, a section never finished none; which ones the game set",
        [first, second, r.get("tap"), r.get("other")], [[true, true], [false, true, null, true], [3000, 3100, null, 2900], []]);
}
console.log(failures ?`\n${failures} FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
