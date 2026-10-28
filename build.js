// Builds a minified copy of the game for a web server: node build.js [outDir]  (default: dist)
//
// - Joins every <script> of game/index.html (the files in order, then the inline bootstrap)
//   into one minified, content-hashed game.<hash>.js and points index.html at it.
// - Minifies the page's inline CSS and whitespace, and copies favicon.svg and gfx/ under content-hashed
//   names (favicon.<hash>.svg, gfx.<hash>/), which the page and the bundle are pointed at.
// - Minification uses esbuild, fetched on demand by npx (pinned below); package.json only holds the serve script.
//   Top-level names are kept: the scripts share globals, and the bundle is a classic script.
// Serve the output folder as it is (any static host); the files are safe to cache for a long time
// except index.html, which names them: serve it with "Cache-Control: no-cache" (revalidate every time),
// and every release then reaches the clients with exactly the scripts and images it was built with.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ESBUILD = "esbuild@0.25.10";
const ROOT = __dirname;
const SRC = path.join(ROOT, "game");
const OUT = path.resolve(ROOT, process.argv[2] || "dist");

if (OUT === ROOT || OUT === SRC || SRC.startsWith(OUT + path.sep) || ROOT.startsWith(OUT + path.sep)) {
    console.error("Refusing to use " + OUT + " as the output folder.");
    process.exit(1);
}

function minify(code, loader) {
    const args = ["--yes", ESBUILD, "--minify", "--legal-comments=none", "--loader=" + loader];
    // npx is a .cmd file on Windows, which only a shell can start; a single command string avoids
    // passing an argument list through the shell.
    const r = process.platform === "win32"
        ? spawnSync("npx " + args.join(" "), { input: code, encoding: "utf8", maxBuffer: 64 << 20, shell: true })
        : spawnSync("npx", args, { input: code, encoding: "utf8", maxBuffer: 64 << 20 });
    if (r.status !== 0) {
        console.error(r.stderr || String(r.error));
        process.exit(1);
    }
    return r.stdout;
}

const scriptTag = /<script\b([^>]*)>([\s\S]*?)<\/script>\s*/g;
let html = fs.readFileSync(path.join(SRC, "index.html"), "utf8");

// Collect the scripts in page order.
const parts = [];
for (const m of html.matchAll(scriptTag)) {
    const src = /\bsrc="([^"]+)"/.exec(m[1]);
    if (src) parts.push({ name: src[1], code: fs.readFileSync(path.join(SRC, src[1]), "utf8") });
    else parts.push({ name: "inline script", code: m[2] });
}
if (!parts.length) {
    console.error("No scripts found in game/index.html.");
    process.exit(1);
}

// Hash the images' content and the icon, and point the code (tiles.js loads "gfx/...") at the hashed names.
function filesIn(dir) {
    return fs.readdirSync(dir, { withFileTypes: true })
        .sort((a, b) => (a.name < b.name ? -1 : 1))
        .flatMap(e => e.isDirectory() ? filesIn(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}
function hashOf(files) {
    const h = crypto.createHash("sha256");
    for (const f of files) h.update(path.relative(SRC, f)).update(fs.readFileSync(f));
    return h.digest("hex").slice(0, 10);
}
const gfxDir = "gfx." + hashOf(filesIn(path.join(SRC, "gfx")));
const faviconName = "favicon." + hashOf([path.join(SRC, "favicon.svg")]) + ".svg";
for (const p of parts) p.code = p.code.replace(/\bgfx\//g, gfxDir + "/");
html = html.replace('href="favicon.svg"', 'href="' + faviconName + '"');

// A newline and semicolon between files so one file can't run into the next.
const bundle = minify(parts.map(p => p.code).join("\n;\n"), "js");
const hash = crypto.createHash("sha256").update(bundle).digest("hex").slice(0, 10);
const bundleName = "game." + hash + ".js";

// Replace the first script tag with the bundle, drop the others.
let first = true;
html = html.replace(scriptTag, () => {
    if (!first) return "";
    first = false;
    return '<script src="' + bundleName + '"></script>\n';
});
// Minify the inline <style> and collapse the whitespace between tags.
html = html.replace(/<style>([\s\S]*?)<\/style>/, (_, css) => "<style>" + minify(css, "css").trim() + "</style>");
html = html.replace(/>\s+</g, "><").replace(/\n\s*/g, "\n").trim() + "\n";

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "index.html"), html);
fs.writeFileSync(path.join(OUT, bundleName), bundle);
fs.copyFileSync(path.join(SRC, "favicon.svg"), path.join(OUT, faviconName));
fs.cpSync(path.join(SRC, "gfx"), path.join(OUT, gfxDir), { recursive: true });

const before = parts.reduce((n, p) => n + Buffer.byteLength(p.code), 0);
console.log("Built " + path.relative(ROOT, OUT) + "/: " + bundleName + " " + Buffer.byteLength(bundle) + " bytes (from " + before + ")");
