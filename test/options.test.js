// Checks for the player's options (game/options.js): the key bindings of the two players.
// Usage: node test/options.test.js
const fs = require("fs");
const vm = require("vm");
const dir = require("path").join(__dirname, "..", "game");
// options.js reads the themes', block styles' and rule sets' tables; none of these touch the DOM at load
const OPTION_FILES = ["game.js", "randomizers.js", "rules.js", "rules-guideline.js", "rules-tgm.js", "renderer.js", "tiles.js", "themes.js", "options.js"];
vm.runInThisContext(OPTION_FILES.map(f => fs.readFileSync(dir + "/" + f, "utf8")).join("\n") +
    "\n;Object.assign(globalThis, {Options, DEFAULT_KEYS, DEFAULT_KEYS2});");

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
console.log(failures ? `\n${failures} FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
