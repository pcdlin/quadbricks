# Handoff: a bot that plays Quadbricks, at several levels of proficiency

Status: **implemented** as `game/bot.js` (see `AGENTS.md`), the opponent of Multiplayer → Versus Bot; the plan below is the original design, since changed: levels 0–10 instead of five names, T-spins, back-to-backs and combos in the Guideline, IRS, a bench tool (`tools/bot-bench.js`), and the Ctrl+Shift+B hotkey removed (left out still: IHS, DAS pre-charged in ARE). Read `AGENTS.md` first; this document assumes it.
Everything below was checked against the code at `1377544` (Version 0.7).

## Goal

A computer player that can play every rule set and mode the menu offers (Guideline, TGM1, TAP,
TGM3, ACE, NES, GB, Big modes included), at five levels of proficiency from "clearly a beginner"
to "plays 20G well". It drives the game **only through the same input bitmap a human produces**
and **only sees what a human sees** (the field, the current piece, the visible next pieces, the
hold). It must not touch the rule sets' behaviour.

## Decisions to confirm with the user

The next agent should ask these before step 5 (engine integration); steps 1–4 don't depend on
them. Recommended defaults in bold.

1. **Where it's started from.** **A "Player" choice on a new Options → Bot screen (Human / Bot)
   plus a Level card, applying to the next game started; and a fixed key (Ctrl+Shift+B) that hands a
   running game to the bot or back.** Alternatives: a "Watch" item on the main menu; an arcade-style
   attract demo after idle on the main menu (nice later, not first).
2. **Records and exams.** **A game the bot played any part of is not recorded and doesn't count for
   TGM3 exams** (the banner says "BOT GAME — NOT RECORDED"). Alternative: separate bot records.
3. **Invisible roll fairness.** **The bot keeps playing from its own memory of the field** (a strong
   human remembers too), i.e. it reads `game.field` even when `getCellAlpha()` is 0. Alternative: it
   plays blind from its own placements only (same thing in practice, since it placed them).
4. **Level names.** **Novice, Casual, Skilled, Expert, Master.**

## Architecture

One new file, `game/bot.js`, with no DOM or engine dependencies (so Node tests can load it after the
rule files). Load it in `game/index.html` after `rules-1989.js` and before `sound.js`; `build.js`
picks it up automatically. Add it to the `AGENTS.md` load order and layout table.

```
            ┌──────────── Bot.input(game) — called once per game frame ─────────────┐
 game ──►   │ Observer ─► Planner (search + evaluator, brain) ─► Controller (hands) │ ──► input bitmap
 (read only)│   new piece?    placements of current/held piece    path → key presses │
            └────────────────────────────────────────────────────────────────────────┘
```

### 1. Observer

Reads, never writes: `game.phase`, `getCurPiece_type/row/col/rotation()`, `curCells` (the current
offsets: big pieces are already doubled), `field` via `getCell()`, `getHeldPiece()`, `canHold`,
`hasHold`, `rnd_get_queue(i)` **for `i < game.nextCount` only** (the queue holds one more than is
shown; reading it would be cheating), `gravity`, `softGravity`, `das`, `arr`, `are`, `lockDelayMax`,
`big`, `pieceTop`, `wellTop`, `isGameOver()`. A new piece is detected when `phase === "active"` and
the type/spawn changes (or `activeTime` restarts); also note `game.entering` semantics (below).

### 2. Move generator: reachable placements

**Use the game's own movement code, not a re-implementation.** Kicks differ per rule set (SRS with
Guideline or Arika I kicks, 180° kicks, ARS with the centre-column rule, TGM3's I wall/floor kicks
and T floor kicks, plain ARS, NRS with no kicks, big pieces kicking two cells). Re-implementing
them would drift from `rules*.js`. Instead build a **probe**: a throwaway object whose prototype is
the live game, so reads fall through to the game and writes land on the probe:

```js
function makeProbe(game) {
    const p = Object.create(game);
    // rotate()/shift() push onto these arrays: shadow them so the game's queues stay untouched
    p.sounds = []; p.bumps = []; p.hardDropCells = []; p.clearedCells = []; p.actions = [];
    return p;
}
// then: p.curPiece_row = r; p.curPiece_col = c; p.curPiece_rotation = rot; p.rotate(1); p.shift(-1); p.canFall()
```

`rotate()`, `rotateArs()`, `shift()`, `movePossible()`, `canFall()`, `setShadow()`, `onFall()`,
`onMoveReset()`, `cutDas()` only write scalar fields (own props on the probe) plus those arrays.
Re-check this before relying on it (`grep -n "\.push(\|this\.held\." game/rules*.js`) and **add a
guard test**: snapshot `JSON.stringify` of a game's fields before and after a full search and require
equality. Floor-kick counters (`iFloorKicks`, `tFloorKicks`, `floorKicked`, `lockDelayZeroed`) and
`moveResets` live on the probe too; copy them into each search node (or include the floor-kick counts
in the node key for non-plain ARS) so TGM3 Classic's limits are respected.

Search: BFS from the piece's current state over actions {left, right, CW, CCW, 180 if `game.rot180`,
down 1}. Node key `(row, col, rot)`. A **placement** is a node where `!canFall()`; dedupe placements
by their final set of cells (S/Z/I have duplicate rotations). Keep the action path to each.

**Gravity model.** Reachability depends on how fast the piece falls relative to how fast the bot
presses keys. Each action costs `f` frames (from the hands profile, below); after it, add
`gravity * f` to a fall accumulator and drop that many whole rows (stopping on the floor). This one
rule covers all regimes:
- low gravity: the piece hovers, almost every slot is reachable, tucks and spins included;
- 20G (`gravity >= 20`, TGM Death/20G/Shirase, ACE Hi-Speed 2+, Guideline Master, Guideline level 15
  at 2.36 G is close): the piece drops to the floor after every action, so it only **slides along the
  stack surface**; climbing a step needs a rotation kick, and many columns are unreachable. This is
  the main difficulty of high-gravity play and must be modelled, not approximated.
BFS in action order visits each node first at its earliest (highest) time, which dominates later
visits, so the first visit is the one to keep. Model DAS as a macro action ("hold left until the
wall/target") costing `das` + `arr`·n frames once the bot level uses DAS (with ARR 0 it goes straight
to the wall, so only use it for wall targets or when `arr > 0`).

Respect the move-reset limit: drop nodes that need more grounded moves than `game.moveLimit -
game.moveResets` (Guideline 15, TGM3 World 10/8, ACE 128; step reset elsewhere means grounded moves
are free until the lock delay runs out, so bound grounded actions by `lockDelayMax / f`).

### 3. Evaluator (brain)

`evaluate(board, ctx)` scores the field after a placement and its line clears. Represent the board
as one integer per row (10 bits; `big` still uses the real 10-wide field) so features are cheap and
allocation-free (hot path: called thousands of times per piece; keep it free of temporary arrays
and closures, as `AGENTS.md` asks for the renderer).

Features (Dellacherie / El-Tetris family, all well-known): landing height, eroded piece cells,
row transitions, column transitions, holes, cumulative wells, aggregate height, bumpiness, max
height, and a danger term near the top (spawn rows blocked = game over: hugely negative; use
`spawnPosition()` through the probe to know where the next piece enters, including GB's well top and
ACE's `spawnRise`). Plus objective terms, chosen per mode by a **mode profile** (below): Tetris
bonus / "keep one well open" (column 9 or 0), T-spin slot and T-spin clear value (Guideline; detect
with the probe's `lastRotation`/`lastKick` and the 3-corner rule, or simply by calling the game's
own T-spin check on a probe if it is factored into a pure function), combo/b2b continuation, and a
penalty for burning (non-Tetris clears) where Tetrises pay most.

Start from published El-Tetris weights for survival; tune the objective weights with the benchmark
(step 4). Weight sets are data, one per mode profile, at the top of `bot.js` like the engine's tunables.

### 4. Search

For the current piece (and, if `hasHold && canHold`, the held piece or the first next piece when
the hold is empty) enumerate placements, apply them to a copied board (clear lines), evaluate. With
lookahead depth d, continue with the visible next pieces (beam search, width w; unknown pieces
beyond the preview are averaged over the seven types or ignored). Pick the best root move.

Run the search when a new piece becomes known, ideally during ARE/line clear (the next piece is
already visible, so plan it before it spawns: this matters a lot for TGM's short AREs and is what
makes IRS possible). Budget ~3 ms per game frame; if the beam isn't done, continue next frame and
fall back to the best found so far when the piece needs input. A Web Worker is a later option, not
needed first: depth 1 with hold is roughly 2 × 34 × 34 ≈ 2,300 evaluations.

### 5. Controller (hands)

Turns the chosen path into one input bitmap per frame, **closed loop**: every frame it compares the
piece's actual `(row, col, rot)` with where the path expects it and, if they differ (gravity moved
it further than modelled, a kick went elsewhere), re-runs the move generator from the actual state
towards the same placement (or replans if it is no longer reachable).

It keeps its own virtual key state and emits only transitions a keyboard could produce: a `*_PUSH`
for a key it doesn't hold, a `*_RELEASE` for one it does (`HARD_PUSH` has no release bit; it is
momentary). Remember the rules apply a frame's releases before its presses, so `RELEASE|PUSH` in one
frame is a re-press: allowed only at Master level (frame-perfect taps). Lower levels hold a key at
least one frame and wait `inputInterval` frames between presses. On hand-over to the human (or game
end) release everything the bot holds.

Rule-set specifics the controller must handle (all readable from the game object, never from
`gamemode` checks where a field exists):

| Situation | Where in the code | What the bot does |
|---|---|---|
| Drop key is a hard drop that locks | `RuleGame.upKey()` (Guideline, TGM3 World, ACE SRS and ARS) | `HARD_PUSH` to finish |
| Up is a sonic drop (no lock) | `TgmGame.upKey()` with `ars` (TGM3 Classic, TAP), `AceGame` with `ars2` | `HARD_PUSH` to drop, then hold soft drop to lock (soft drop locks on the ground there: `onGround()`) or let the lock delay run |
| Up does nothing | `Tgm1Game.upKey()` | hold soft drop (1G, locks on ground) |
| No hard drop, soft drop needs a fresh press per piece | `Game1989` (`softArmed`) | release soft drop between pieces; NES: holding down **blocks shifting** (`NesGame.canShift()`), and holding left/right ends a soft drop, so shift first, then drop |
| Guideline hard drop guard | `GuidelineGame.upKey()`, `GUIDELINE_DROP_GUARD` | don't hard drop in a piece's first 8 active frames when `handling.dropGuard` |
| Piece's first frame takes only IRS and gravity | `moveOnSpawn` false (TGM): shifts/up are deferred (`deferredPush`) | plan for it; send shifts from the 2nd frame or let the deferral carry them |
| IRS / IHS | `spawn()`: `held.rotr/rotl/rot180/hold` at entry | at 20G, hold the rotation (or hold) **during ARE** so the piece enters rotated; often the only way to place it |
| DAS counted inclusively | `dasInclusive` (TGM) | first auto-shift at `das - 1` frames |
| DAS charges during ARE | `advanceFrame()` | at high levels pre-charge DAS in ARE toward a wall target (TGM technique) |
| DCD (Guideline option) | `cutDas()` | expect a pause after rotations when `handling.dcd` |
| Rotations held don't repeat | `C(ROTR_PUSH)` acts each frame it is set | re-press for each turn |
| Big pieces | `big`, `curCells` doubled, moves of 2 | nothing special: the probe handles it |
| Item pieces, garbage, staff rolls, Rev | TAP Normal, TGM+, Shirase, TGM1 Rev | nothing special: the bot reads the field; Rev is drawing only |
| Time limits / timed modes | ACE `LIMIT`, Ultra, Sprint, TGM COOLs | speed comes from the level; mode profile changes the objective |

### Mode profiles

`botProfileFor(game)` picks evaluation weights and the objective from fields the game exposes
(`variant`, `tgm`, `nes`/`gb`, `gamemode`):
- **Survival** (default; TGM 20G modes, TAP Death, Shirase, ACE, GB/NES high levels): flat, low,
  no holes; take any clear.
- **Score** (Guideline Marathon/Endless/Ultra): Tetrises, T-spins and back-to-back, combos in Ultra.
- **Sprint/Dig**: fewest pieces and inputs per line; flat stacking, singles/doubles are fine; Dig
  weights holes on garbage rows (`isGarbage`) by how deep they are.
- **TGM grading** (TGM1/TAP/TGM3 Master): Tetrises and combos for grade points; never top out;
  speed matters for TGM1's GM checkpoints and TGM3's COOLs (hands of the level decide).
- **NES/GB**: Tetris-only stacking with a right-side well, avoid burns, switch to survival when
  the stack is high or gravity is above ~level 19.

## Proficiency levels

A level is a **brain** (how well it chooses) plus **hands** (how fast and cleanly it moves) plus
**mistakes**. Keep these as one table of data in `bot.js`; first-guess values:

| | Novice | Casual | Skilled | Expert | Master |
|---|---|---|---|---|---|
| reaction (frames after a piece appears before the first input) | 30 | 15 | 8 | 3 | 0 |
| inputInterval (frames between presses) | 8 | 5 | 3 | 2 | 1 (re-press same frame) |
| uses DAS for long moves | no | no | yes | yes | yes, pre-charged in ARE |
| hard/sonic drop | 30% of pieces, else soft drop | 70% | always | always | always |
| lookahead depth / beam width | 0 / – | 0 / – | 1 / 4 | 2 / 8 | 3 / 16 |
| uses hold | never | rarely (only to escape a bad piece) | yes | yes | yes |
| T-spins, tucks, 20G kicks | no | no | tucks | T-spin doubles | all, plus IRS |
| weight noise (σ, per game) | 0.35 | 0.2 | 0.1 | 0.03 | 0 |
| choice temperature (softmax over top placements) | high | medium | low | ~0 | 0 |
| misdrop chance (off by one column or rotation) | 6% | 3% | 1% | 0.2% | 0 |
| target speed (pieces/s, low gravity) | ~0.5 | ~1 | ~1.8 | ~3 | as fast as the rules allow |

Notes: the inputInterval and reaction are also what makes the **gravity model** (above) pick
different reachable sets per level, which is correct: a Novice genuinely can't get a piece across at
20G. Mistakes and noise use the bot's own seeded PRNG, never `Math.random` (that drives the bag).

Calibration targets for the benchmark (Guideline Marathon from level 1, 150 lines; then TGM3 Master
World rule): Novice tops out around level 3–6; Casual reaches 60–120 lines; Skilled completes 150
lines most games; Expert completes it with a high Tetris rate and reaches TGM3 level 500+; Master
completes TGM3 Master regularly and survives TAP Death to 500 often. Adjust the table until the
levels are clearly ordered and each feels like its name.

## Engine integration (after the user's decisions)

- `Engine.frame()`, case `STATE_GAME`: after `handleGameInput()` (still needed for Esc and the
  hand-over key), if `this.bot` is set and the game is still on, `this.player_input =
  this.bot.input(this.game)`; human game keys are ignored meanwhile. When the human takes over, set
  `syncKeys = true` so keys held or let go during the bot's turn are released properly, and send the
  bot's own releases first.
- `initGame()` creates the bot when the Player setting is Bot (`new Bot(level, seed)`); `Restart` keeps it.
- Records/exams: skip `submitRecord()`'s writes for a bot game (set a `botPlayed` flag on first bot
  input), and show the banner line instead.
- HUD: a small "BOT · EXPERT" label (e.g. under the stats, or in place of the best line from
  `drawGameBest()`), using `Engine.text()`; compact layout too.
- Options: follow the "add a setting" recipe in `AGENTS.md` (`OPTION_CHOICES`, `Options` constructor
  default, `optionValue()`), either on a new `MENU_BOT` settings screen added to `OPTIONS_ITEMS`
  or on Visuals; save `bot` and `botLevel` in `quadbricks.options` and document them under Storage.
- Touch and gamepad: the hand-over key needs a gamepad/touch route too, or skip it there; ask.

## Testing and benchmarking

- `test/bot.test.js` (plain Node, like `rules.test.js`; load `RULE_FILES` plus `bot.js` through `vm`,
  export names explicitly), checks to include:
  - the probe leaves the game unchanged (JSON snapshot before/after a full search);
  - **every placement the generator returns is real**: replay its path through `advanceFrame()` on a
    fresh copy of the same position (set up with `place()`/`fill()` helpers as in `rules.test.js`)
    and land in exactly the predicted cells — run this for SRS, Arika SRS, ARS (TGM3), plain ARS,
    NRS NES and GB, big pieces, and at 20G;
  - known positions: a TSD slot is found and chosen by the Guideline profile; at 20G a step two
    rows high can't be climbed without a kick; NES never holds down while shifting;
  - each level plays N pieces in each rule set without an exception or a stuck controller
    (e.g. no input for 600 frames while a piece is active = failure);
  - levels are ordered on a short seeded benchmark (Master ≥ Expert ≥ … in lines survived).
- `tools/bot-bench.js` (not in the test run): headless games for each level × chosen modes, seeded
  (replace `Math.random` in the vm context with a seeded PRNG for reproducibility), printing lines,
  score/grade, pieces per second, survival time, ms per search. Used to tune weights and the level
  table. Keep it out of `build.js`'s input (it only bundles `index.html`'s scripts).
- Browser: follow `AGENTS.md` "Verify in a browser" (refresh cached scripts, take over
  `requestAnimationFrame` for deterministic checks). Watch each level play Marathon, TGM3 Master and
  NES; check frame time stays under budget (the FPS counter, and `performance.now()` around
  `bot.input`). Reset any options changed in the browser pane afterwards.

## Suggested commits (one logical change each, `AGENTS.md` style)

1. `bot.js` skeleton: board copy, probe, move generator with the gravity model; `test/bot.test.js`
   with the probe guard and placement-replay checks for every rotation system.
2. Evaluator, greedy single-piece search, controller for the Guideline (hard drop); headless runner.
3. Controller for every other drop/soft-drop rule (sonic, TGM1, NES/GB fresh press, IRS/IHS, TGM
   first frame, DAS); tests per family.
4. Lookahead, hold, mode profiles; `tools/bot-bench.js`.
5. Proficiency levels (hands, brain, mistakes) and their calibration.
6. Engine integration: setting(s), hand-over, HUD label, records/exams skip. Verify in the browser.
7. `AGENTS.md`: layout table row, load order, a "Bot" architecture section, storage keys, tests line.

Later, optional: attract-mode demo on the main menu; Web Worker search; finesse (minimal-input
paths) as a level trait; 2-wide combo and perfect-clear strategies for Ultra.

## Pitfalls already spotted

- The queue holds `nextCount + 1` pieces; the Guideline's `previews` option can be 0. Only read
  `rnd_get_queue(i)` for `i < game.nextCount`.
- Writing `curPiece_*` on the probe is fine, but anything that mutates a shared object (`held`,
  `field`, arrays) would corrupt the real game; never call `lock()`, `hardDrop()`, `sonicDrop()` or
  `advanceFrame()` on a probe. Simulate locking on the bot's own board copy.
- `getCell()` returns 10 outside the well and 0 above `FIELD_TOP`; `blocked()` also refuses rows
  above `pieceTop` (GB row 4, NES row 0) — use `movePossible()` via the probe rather than the field.
- TGM deletes blocks locking above `bufferTop`; ACE pieces may enter up to two rows higher
  (`spawnRise`) before a block out. The danger term should use the probe's spawn check, not a fixed row.
- `C(ROTR_PUSH)` rotates on every frame the bit is set; the engine only sets it on a keydown, so
  the controller must not set it on consecutive frames without a release unless it means to.
- Guideline level 15 gravity (2.36 G) is effectively high gravity for slow hands; don't switch
  models on a fixed `gravity >= 20` threshold, use the accumulator.
- Performance: no per-call allocations in the evaluator or BFS (preallocate node arrays, use row
  bitmasks); the game loop runs up to 4 catch-up frames per refresh.
