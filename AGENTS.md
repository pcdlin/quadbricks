# AGENTS.md

Guide for agents working on **Quadbricks**, a falling-block puzzle game.

## Quick start

```bash
# Run the web game (also configured in .claude/launch.json as "web")
python -m http.server 8123 --directory game    # then open http://localhost:8123

# Rule-set spec tests (plain Node, no dependencies)
node test/rules.test.js                    # must end with "All checks passed"

# Minified build for a web server (output in dist/, git-ignored)
node build.js [outDir]
```

`build.js` joins all scripts of `game/index.html` (in page order, plus the inline bootstrap) into one
esbuild-minified `game.<hash>.js`, minifies the inline CSS and copies `favicon.svg` and `gfx/` under content-hashed names (`favicon.<hash>.svg`, `gfx.<hash>/`; the bundle's `gfx/` paths are rewritten). Every built file is therefore cache-busted by name; only `index.html` must be served with `Cache-Control: no-cache`.
esbuild comes from `npx` (pinned in `build.js`, needs network the first time); top-level names are
kept because the scripts share globals. A new script in `index.html` is picked up automatically.

There is no build step, bundler or package.json. Scripts are classic `<script>` tags that
share globals; load order in `game/index.html` matters:
`game.js → randomizers.js → rules.js → rules-guideline.js → rules-tgm.js → rules-ace.js → rules-1989.js →
sound.js → tiles.js → options.js → renderer.js → backdrop.js → touch.js → gamepad.js → engine.js`,
then an inline bootstrap creates `Engine` and calls `init()` / `start()` (or shows a message
when WebGL is unavailable).

## Repository layout

| Path | What it is |
|---|---|
| `game/game.js` | Shared definitions only: field size (`WIDTH` 10, `HEIGHT` 22, first visible row `VISIBLE_TOP` 2), piece ids (`tetI`=1 … `tetO`=7), input bitmap bits, SRS `shapes`; `shapeCells()` (a shape table's blocks as offsets) and `clamp()`. |
| `game/randomizers.js` | The non-bag piece randomizers (TGM3, TAP, TGM1, GB, NES) on the arcade's generator. |
| `game/rules.js` | `RuleGame`, the rule sets' base class (field, input, frame and phases, collision, SRS and ARS rotation, sonic drop, gravity, lock delay, line clears, event queues), mode ids, `registerRules()` and `createGame()`. |
| `game/rules-guideline.js` | `GuidelineGame`: the Guideline and its modes. |
| `game/rules-tgm.js` | `TgmGame` and its games: `Tgm1Game`, `TapGame` (Master, Death, TGM+), `TiGame` (TGM3 Master, World or Classic) with `TiEasyGame` and `TiShiraseGame`. |
| `game/rules-ace.js` | `AceGame`: ACE's five modes. |
| `game/rules-1989.js` | `Game1989` with `NesGame` and `GbGame`: A-Type and B-Type. |
| `game/engine.js` | `Engine`: 60 fps loop, input, menus, rendering, effects. |
| `game/renderer.js` | `GLRenderer`: WebGL renderer with a small canvas-like API (textured quads, rounded rects); colour helpers. |
| `game/backdrop.js` | `GLBackdrop`: the renderer's backdrop pass (backdrop, wash, lights, glow, rings), the clear ripples' refraction pass and the clear flares' pass. |
| `game/tiles.js` | Block styles (`TILESETS`, in menu order; the first is the default, `TILESET_IDS[0]`): Flat (default), Holo (grey metal; styles with `sheen: true` get `Engine.drawSheen()`, an additive colour gloss per block whose strength and hue follow the field's tilt (`updateSheen()`, `HOLO_*`): grey face-on, shimmering when tilted, so grey for good at tilt Off), Radiant (glassy glow), Glossy, Neon, Stained glass (`stained`; backlit glass in lead cames, lit only by the lamp, `lamp: "always"`), Faceted, Pixel, Mono, 1989 (`retro1989`; monochrome green, each piece its own pattern), Original. Loads the Original PNGs. |
| `game/options.js` | `Options`: key and gamepad bindings, block style and effects level in localStorage; `keyLabel()` for keycaps. |
| `game/touch.js` | `TouchControls`: handheld-style on-screen controls on touch devices (or `?touch=1`): a D-pad (up = hard drop, down = soft drop; one touch area, so the finger can roll between arms, the lower diagonals add soft drop to a move, and up needs a fresh touch in games), rotate and HOLD buttons and a MENU pill; in menus the D-pad gives the arrows and the round buttons OK/BACK. They feed `Engine.onKey()` with the same key codes. `place()` puts them in a bar below the view (portrait) or beside it (landscape) and returns the room they take, which `Engine.resize()` leaves free. |
| `game/gamepad.js` | `GamepadControls`: gamepads (Gamepad API, standard layout, every pad merged), polled each game frame (`poll()`, from `Engine.frame()`). Like the touch controls they feed `Engine.onKey()` with each action's first key. In games the buttons and left stick directions act as bound in `options.pad` (Options → Gamepad; Start always opens the menu); menus take fixed ones (`PAD_MENU`: D-pad or stick arrows, A = Enter, B and Start = Esc; the sound button works there too), held directions repeat. A control held over a switch between menu and game, or over a binding, is ignored until let go. While a pad was used last (`active`, cleared by any keydown) hints name its buttons (`padWords()`). |
| `game/sound.js` | `Sound`: Web Audio synthesised effects (no audio files). |
| `game/gfx/` | Copies of the legacy tile PNGs, used only by the "Original" block style. |
| `test/rules.test.js` | Spec checks for the rule sets (~425 checks). |

## History in one paragraph

The browser version began as a 1:1 port of the original C++ game. It was then
redesigned visually (night-gallery look inspired by *Tetris Forever*), verified against the
official rules, and the C++-faithful logic was replaced by spec-following rule sets. The old
port's `Game` class has been removed; `git log` has the full story (one feature per commit).

## Architecture

### Frame loop and input (`engine.js`)
- Fixed timestep from the original: frames of 17, 17, 16 ms (≈60 fps), run from
  `requestAnimationFrame`, catching up at most 4 frames, resetting after a >250 ms stall.
  `frame()` is game logic and input only; every display refresh (60 Hz or more) then calls
  `animate(dt)` and `draw()`. `animate()` moves the presentation on by `dt` game frames
  (fractional above 60 Hz, `FRAME_MS`): `clock` (replaces a frame counter for tilt, wash and
  pulsing text), ambient easing, confetti and effect lives (`life -= dt`), menu scroll; decays
  and eases use `Math.pow(factor, dt)`. The shake spring still steps once per game frame (as
  tuned) and is shown between its last two steps (`shake.px/py/t`). Game state changes only
  per frame; `tickPhase` (0..1, how far the display is into the next frame) smooths what reads
  frame counters: `getDropOffset(row, sub)`/`getDropLandedFor(row, sub)`, the clear messages'
  `actionAge` and the countdown. New animations should take `dt` (or `tickPhase`), never count
  calls.
- Keys are collected as events and turned into one **input bitmap per frame**
  (`LEFT_PUSH`, `LEFT_RELEASE`, … from `game.js`), like the SDL original. Key repeat is
  ignored in games (`e.repeat`); DAS/ARR are implemented by the rules, not the OS (the first
  auto-shift comes DAS frames after the press; the TGM series' tables count the press frame too,
  `dasInclusive`, so theirs comes DAS − 1 frames after it, as in NullpoMino and Cambridge). Menus take
  the OS repeat for the arrows (`MENU_REPEAT_KEYS`, events marked `repeat`) to scroll while held;
  repeats stop at the ends of lists and values instead of wrapping (`stepIndex()` in
  `options.js`) and don't flip on/off settings.
  The rules apply a frame's releases before its presses, so a release of an action pressed in
  the same frame waits for the next frame. Keys let go while the game wasn't listening (menu
  open, window unfocused) are released when it resumes (`keysDown`, `syncKeys`).
- Hidden TGM1, TGM3 and TAP test keys (`TEST_KEYS`, nowhere in the UI), during a game: Ctrl+Shift+1 straight
  to the staff roll the player has earned, 2 to the invisible roll, 3 to an invisible roll that
  ends in Grand Master if survived (TAP Master: 2 and 3 both go to the M-roll), 4 to the last 5 s
  of the roll, 5 to 10 s before the 15-minute speed-up (TGM3 Master and Easy), 6 sends up five fireworks (TGM3 Easy
  only), 7 fills the well with the full secret grade pattern and ends the game (the modes with a secret
  grade: the banner shows SECRET GRADE GM). They call
  `RuleGame.testSetup()`, which refuses during READY, after game over, in the Guideline, and for
  setups a mode doesn't have (TAP Death: only 1 and 4; TGM1: 1 and 3 go to the GM roll, and 4; TGM+,
  TAP Normal and Shirase: 1 and 4; Easy: 1, 4, 5 and 6; 5 is TGM3 Master's and Easy's only).
- Game keys come from `options.keys` (rebindable): each action has a list of one or two key codes
  (`MAX_KEYS_PER_ACTION`). On the Keybinds screen, Enter then a new key adds it (a third replaces
  the action's oldest); a key the action already has is removed, unless it is its only one
  (`Options.bind()`). A key taken from another action leaves that one its other key, or if it had
  none, the replaced key (or, with nothing replaced, the two swap). An action is released only when
  none of its keys is held. Key hints and the touch controls use each action's first key.
- Gamepad bindings (`options.pad`, Options → Gamepad, `drawBindings()` like the Keybinds screen): per action one or two
  controls, a standard-layout button index or a left stick direction (`PAD_STICK`, ids 100–103), labelled with Xbox names
  (`padLabel()`). Defaults `DEFAULT_PAD`: D-pad and stick move and soft drop, D-pad up hard drop (the stick's up is unbound,
  so a hard drop never slips out of a push), A rotate right, B and X left, Y 180°, LB/RB hold, Back sound. Enter on a row sets
  `padCapturing`; the next control pressed on a pad is bound by `GamepadControls.poll()` (`Options.bindPad()`, the same rules
  as keys, `bindIn()`), Start or Esc cancels. Start (`PAD_START`) can't be bound. Menus always use arrows / Enter / Esc
  (`MENU_KEYS`); `Escape` can't be bound.
- Menu screens: `MENU_MAIN` (`MAIN_ITEMS`: Quick Play, Custom Game, Options; `mainItems()` adds Continue and Restart first while a game exists, Continue resuming it and Restart starting it over with the same settings, and Esc from a game opens the menu on it). Quick Play → `MENU_QUICK` (`QUICK_PLAY`: Marathon, Sprint, Ultra, TGM1 Master,
  TAP Master, TGM3 Master, NES A-Type, each a `RULESETS` mode named by rule set and mode, started at once with its setup
  cards' first or `initial` choices (`quickArgs()` → `modeArgs()`), so its records are Custom Game's for those choices; the
  list keeps its place like the rule sets'). Custom Game → `MENU_RULES` (rule sets) →
  `MENU_MODES` (each rule set's `modes`: Marathon/Sprint/Ultra/Dig/Master for the Guideline, Master/20G
  for TGM1, Normal/Master/Death/TGM+ for TAP, Master/Easy/Shirase for TGM3, Normal/Hi-Speed 1/Hi-Speed 2/
  Another/Another 2/Big for ACE, A-Type/B-Type for NES and GB) → game; modes
  with `setup` go through `MENU_SETUP` first: setting cards (`setupItems()`), each choosing one of its
  `labels` for a `createGame` argument (`arg`): `"mode"`, `"variant"` or a hidden mode's option
  (`OPTION_ARGS`: `"big"`, `"rev"`, `"mono"`, `"tls"`, `"exams"`, `"heart"`, gathered into `options`) (the label's entry in
  `values`: TGM3's Rule, World / Classic; ACE's Rule, SRS / ARS / ARS2; Big, Off / On, on the TGM modes
  but TGM+; TGM1's Reverse, Mono and Ghost (To level 100 / All game) besides Big; TGM3 Master's Exams,
  On / Off; GB's Heart, Off / On; Marathon's Goal, 150 lines / Variable / Endless; Sprint's Lines, 20 / 40 / 100; Ultra's
  Time, 1:00 / 2:00 / 3:00 / 5:00), or `"startLevel"` / `"height"` (the label's index: Level 0–19 for
  NES, 0–9 for GB, M1–M30 for Master, 1–15 for Marathon; Height 0–5 for B-Type; Rows 5/10/18 for Dig).
  `initial`: the label chosen at first (Sprint 40, Ultra 2:00), else the first.
  Choices are remembered per mode for the session (`setupChoices`, keyed by rule set, mode and card;
  `menuAction()` turns them into arguments). The mode lists use the Visuals screen's
  tighter cards (`VISUALS_ROWS`), the rule set list (seven) tighter still, a little higher, with its
  hint under it. Options → `MENU_OPTIONS` (`OPTIONS_ITEMS`) → `MENU_CONTROLS` (key bindings, card "Keybinds"),
  `MENU_GAMEPAD` (gamepad bindings), `MENU_VISUALS` or `MENU_HANDLING` (card "Guideline"). Esc goes back one screen and, on the main screen, resumes a
  paused game. Leaving a game with Esc opens `MENU_MAIN`.
- Visuals and Guideline handling are setting screens (`SETTING_ITEMS`: `VISUAL_ITEMS`, `HANDLING_ITEMS`),
  changed with ← → (Enter steps forward). Add a setting to one of those lists, its default in the
  `Options` constructor and its values in `OPTION_CHOICES` or its id in `OPTION_TOGGLES`
  (`options.js`: loading, saving and `Options.step()` follow from those), and, unless it is on/off, a
  case in `optionValue()` (the card's value text). `changeOption()` needs a case only for side effects.
- Guideline handling (`HANDLING_ITEMS`, applies to the Guideline modes only): DAS 1–20 F, ARR 0–5 F
  (0 shown as Instant), SDF 5×/10×/20×/40×/Instant (`SDF_STEPS`), DCD 0–20 F (0 = Off), ghost piece,
  hard drop guard, next pieces 0–6 (`previews`; 0 hides the NEXT box), hold (`holdPiece`), IRS, IHS and
  180° rotation (`rot180`, off by default: the "Rotate 180°" key, `ROT180_PUSH`, does nothing without it;
  Techmino's SRS+ 180 kicks, `KICKS_180`), then a "Reset to defaults" card (`action: true`: Enter resets via
  `options.resetHandling()`, ← → do nothing, the card shows its own `desc`). Frame values are shown with milliseconds (`frameValue()`). Each item has `help`:
  the abbreviation spelled out and one line on what it does, drawn under the compact card list for
  the selected item. `options.handling` goes to `RuleGame` in `initGame()`; changes made while a
  game is paused apply at once (`applyHandling()` → `RuleGame.setHandling()`).
- The Visuals screen lists Block style, Scale, Effects, Confetti, Clear burst, Row flash, Backdrop, 3D tilt, Drop shake, Drop trail and Stack border (`VISUAL_ITEMS`). The Block
  style card (`preview: true`) is a little taller (`menuRowHeight()`) and shows the style's preview at
  its right, beside the name (`drawTilesetPreview()`: one active, one locked and one ghost block in
  different colours, `PREVIEW_BLOCKS`, at their size in the well). The list is
  `VISUALS_LIST_H` high and scrolls in logical units (eased in `updateMenuScroll()`, clipped with
  `GLRenderer.clip()`) to keep the selection in view, with a scrollbar beside it.

### Rules engine (`rules.js` and the family files)
`createGame(mode, variant)` with `mode` ∈ `guideline` (3), `arika` (4, TGM3 World),
`tgmClassic` (5, TGM3 Classic), `tgmTap` (6, TAP), `gbTetris` (7, GB), `tgmOriginal` (8, TGM1),
`nesTetris` (9, NES), `tgmAce` (10, ACE with SRS), `aceArs` (11) and `aceArs2` (12) and `variant` ∈ `"standard"`, `"test"`, `"death"` (plus the
Guideline's `"marathon"`, `"variable"`, `"sprint"`, `"ultra"`, `"dig"` and `"master"`, NES's and GB's
`"btype"`, TGM1's `"20g"`, TAP's `"plus"` (TGM+), TGM3's `"easy"` and `"shirase"` (with either rule), and
ACE's `"normal"`, `"hispeed1"`, `"hispeed2"`, `"another"`, `"another2"`, `"big"`; and the Guideline's
`"sprint20"`, `"sprint100"`, `"ultra1"`, `"ultra3"`, `"ultra5"` for its other goals and times).
TAP's `"standard"` is its Master mode, `"death"` its Death mode; NES's and GB's `"standard"` is A-Type.
A third argument, `startLevel` (NES and GB only, clamped to 0–19, `NES_START_LEVELS`, or 0–9,
`GB_START_LEVELS`; Guideline master: 0–29 for M1–M30), sets the starting level;
a fourth, `height` (their B-Type only, clamped to 0–5, `GB_B_HEIGHTS`; Guideline dig: 0–2 for
`GUIDELINE_DIG_ROWS`), the garbage height; a fifth,
`handling` (Guideline only, overrides of `GUIDELINE_HANDLING`: `das`, `arr`, `sdf`, `dcd`, `ghost`,
`dropGuard`; ignored by the others, whose timing is part of their spec); a sixth, `options`, the
hidden modes (`setOptions()`, before the first piece; they combine): `big` (`setBig()`; offered for
TGM1, TAP but TGM+, and TGM3; ACE's is its `"big"` variant), and TGM1's `rev`, `mono` (`MONO_PALETTE`)
and `tls` (the ghost all game).

Structure: each family file defines a subclass of `RuleGame` and registers its modes with
`registerRules(modes, variant => Class)`; `createGame()` picks the class, constructs it (base
constructor first: common state and defaults; then the subclass sets its configuration) and calls
`begin()` (first pieces, `updateTimings()`, `setupField()`). Always create games with `createGame()`.
The base never asks which rule set it is playing: the differences live in the subclasses, through
configuration fields set in their constructors and hooks they override:
- Configuration: `setShapes(shapes, palette)`, `nextCount`, `hasHold`, `irs`, `iKicks` (SRS I kicks:
  Guideline's, or Arika's for TGM3 World and ACE), `moveLimit` (lock resets per piece), `lockOut`,
  `dropsOnSpawn` (Guideline), `bufferTop` (TGM: blocks locking above it are deleted),
  `softDropPoints`, `randomizer` (else a 7-bag; `bagNoSzoFirst`: never S, Z or O first), `wellTop` / `firstDrawnRow` / `pieceTop`, `level`,
  `combo`, `handling` (`NO_HANDLING` unless the Guideline's); ARS: `useArs(plain, palette)` (`ars`,
  `plainArs`: basic kicks only), `arsFloorKicks` (per piece, `{ i, t }`), `floorKickZeroes`,
  `sonicTrail`; `rotate()` then uses `rotateArs()`, and `sonicDrop()` is there for an up key that
  doesn't lock.
- Hooks: `setTimings()` (are, lineAre, das, arr, lockDelayMax, lineClearDelay, gravity,
  softGravity; `updateTimings()` then applies the test/death/20g variants), `spawnPosition()`,
  `beforeSpawn()` / `onNewPiece()` / `afterSpawn()` / `onBlockOut()`, `onClock()` (every frame after
  the countdown; false ends the frame), `onActiveFrame()`, `dasCharges()`, `canShift()`,
  `onShiftBlocked()`, `rotate()` (SRS by default), `onMoveReset()`, `advanceDrop()` / `upKey()` (a hard
  drop by default) / `onGround()` / `onHardDrop()`, `beforeLock()` / `onBlockLocked()`,
  `scoreClear(n, rows)`, `onCollapse()`, `afterClear()`, `ghostVisible()`, `getStats()`,
  `setupField()`, `setHandling()`, `testSetup()`.
- Inside a family, its own flags stay local: `TgmGame` has `internalGrading` (grade points and decay: TGM3 and TAP Master), `hasKill` (TGM3 Master's and Easy's 15-minute
  speed-up), `maxLevel` (999; Shirase 1300, Easy 200) and its own hooks (`delayRow()`, `gravityAt()`,
  `scoreLines()`, `scoreRollClear()`, `onMiss()`, `rollKind()`, `onRollBegin()`, `prepareTestRoll()`,
  `finishRoll()`, `statsName()`, `tgmStats()`, `gradeComboMultiplier()`); TGM3's Easy and Shirase
  override Master's (`scoreTiClear()`, `checkLevelStop()`, `updateSection()`). `TapGame` has
  `tapPlus` / `death`; `Game1989` has `nes` / `gb` and `levelForLines()`.
- `this.tgm` is true for the TGM series only (`TgmGame`). `this.big` (`setBig()`: the Big mode, and
  Shirase's roll): every block 2 × 2, moves and kicks doubled, pieces enter in columns 2-9 with their
  top in the top visible row (`bigSpawnPosition()`), two cleared rows count as one line (NullpoMino's
  rule; pieces still fall one row at a time, as there); `this.bigMode` when it was on from the start
  (the stats add BIG to the mode). `this.curCells` holds the current piece's offsets (`pieceCells`, or
  the doubled ones), which collision and the engine's piece drawing use. TAP and TGM1 games with
  `sectionStops` false (TAP Normal) pass x99 with new pieces.

The engine drives it with `advanceFrame(inputBitmap)` and reads:
- `getCell(row, col)`, `getCellAlpha(row, col)` (staff roll), `getCellItem(row, col)`, `pieceItem`, `nextItem` (TAP Normal's item pieces), `getCurPiece_*()`, `getShadowRow()` (−100 = no ghost),
  `getHeldPiece()`, `rnd_get_queue(i)`, `isGameOver()`, `inStartDelay()`, `inRollStart()`,
  `countdown()` (3, 2, 1 during READY, else 0), `startdelayCounter/startdelayMax`, `curPiece_lockDelay/lockDelayMax` (lock fade),
  `endTitle/endSub`, `getStats()` (side panel rows; first row is `[RULESET, VARIANT]`),
  `getDropDistance(row)`/`getDropOffset(row)`/`getDropLandedFor(row)` (during a line clear delay the
  stack waits `LINE_DROP_PAUSE` frames so the confetti shows first (less if the delay can't fit the
  longest fall after it), then falls into the cleared rows at `LINE_DROP_SPEED` rows per frame, faster if the delay is shorter,
  with a trail, `drawLineDropTrails()`; the field itself collapses when the delay ends).
- `shapes`, `pieceCells` (`shapeCells(shapes)`: `[type][rotation]` → `[row, col]` offsets, what the
  rules and the engine iterate) and `palette` (piece type → colour index) per rule set; `nextCount` (TGM1, TAP, NES and GB: 1, so the
  engine draws no list under the first next piece); `hasHold` (no HOLD box when false);
  `firstDrawnRow` (0: the two rows above the well are drawn; GB: 4); `wellTop` (first row of the
  well: `VISIBLE_TOP`, GB 4 for its 18 rows), which sizes the board (`Engine.layoutBoard()`).
- Personal records: `record()` gives a finished game's result, `{ key, text }` (key: numbers compared
  in order, higher is better, times negated; null when it doesn't count: Sprint and Dig unfinished).
  By family: the score (default; Marathon, Ultra, NES, GB, TAP Normal), Sprint/Dig time, Guideline
  Master lines then time, TGM grade (`gradeRank()`: M and GM above every grade) then level then time,
  TGM+ level then time, Easy fireworks, ACE lines then time. The engine submits it once when the game
  ends (`submitRecord()`, key `recordKey()` from the game's arguments and the options that are on),
  shows FIRST RECORD / NEW BEST / BEST … in the game over banner, the best for the current choices
  under the mode list and setup cards (`drawBest()`), and in a game the best for its setup
  (`recordSetup`) at the foot of the NEXT column, its parts stacked when the line doesn't fit
  (`drawGameBest()`). `Records` (`options.js`) keeps them.
- Event queues the engine drains every frame: `takeClearedCells()` (confetti),
  `takeHardDropCells()` (landing flash and trail; cells a clear removed come with `cleared: true`, in the row they landed in; TAP Master's sonic drop adds them too, so it gets the trail, without the drop sound or shake), `takeBumps()` (directions the piece was pushed against the left/right border, once per press; nudges the field via `bumpShake()`, same Drop shake option), `takeHolds()` (a count of holds, IHS included; the engine flashes the held piece in the HOLD box with a soft glow of its light colour around it, `holdFlash`, `HOLD_FLASH_LIFE`, `pieceGlow()` (`HOLD_GLOW_*`, a blurred silhouette cached per piece, colour and size), and the piece coming into play from it glows the same way in the well until it locks (`enterGlow`, `drawPieceGlow()`), none with effects Off, fainter at Subtle), `takeSounds()` (`"move"`, `"rotate"`, `"lock"`,
  `"harddrop"`, `"sonic"`, `"count"` (each countdown digit), `"go"` (first active frame), `"clear<n>"` or `"clear<n>c<chain>"`), plus `actions`
  (`{text, kind, value}`, kinds `clear`/`tspin`/`b2b`/`combo`/`pc`) with `actionAge`.
- `chain`: consecutive clearing pieces, −1 after a miss, then 0, 1, 2…; identical in every
  rule set and used only for presentation (TGM's `combo` is a score multiplier).

**Row coordinates:** visible rows are 2..21 (bottom = 21). Rows above are buffer: down to
−18 for the Guideline (20-row buffer); TGM1, TGM3 and TAP delete blocks locking above row 1. GB's well is
rows 4..21 (`GB_WELL_TOP`, 18 rows); its pieces can't occupy rows above it (`pieceTop`). NES pieces
can turn up into rows 0..1, no higher.
Pieces are 4×4 boxes; `curPiece_row/col` is the box's top-left.

**Phases:** `ready` (countdown 3, 2, 1, `COUNTDOWN_STEP_FRAMES` = 60 each, one second; frame 181 is the first to take input) → `active` → `are` / `lineclear` → `active` … (TGM3 and TAP at
999, TAP Death at a late 500: `lineclear` → `rollstart` → `active` in the roll, whose first piece gets its entry frame (IRS, gravity) like any other; it starts once
`timerStopped` is set)
A lock delay of N frames counts the landing frame as the first and locks on the frame after the
Nth (the piece rests in view for N frames, as in NullpoMino and Cambridge).
DAS charges in every phase. TGM (`TgmGame.dasCharges()`, tetris.wiki): not during the line clear delay,
the first frames of an ARE after a piece that cleared nothing (`dasFreezeAre`: TGM1 4, else 1), the
last frame of ARE, nor on the frame a piece enters. In the TGM series a piece's first
frame takes only IRS and gravity (`moveOnSpawn` false, as NullpoMino's Classic rules and Cambridge):
shifts and up pressed on it act on the next frame if still held (`deferredPush`), and soft drop waits
too (`softHeld()`). IRS (held rotate) and IHS (held hold) apply at spawn (`irs`, `ihs`; the Guideline's can be turned off).

### Rendering (`engine.js`, `renderer.js`, `backdrop.js`, `tiles.js`)
- Everything on screen is drawn with WebGL (1) into one canvas, `#screen`; there is no 2D
  fallback. Canvas 2D is used only offscreen, to rasterise things once into textures at
  device resolution: text strings, block sprites, the confetti glow, clear messages and
  the static backdrop picture.
- `GLRenderer` mimics the bits of canvas 2D the engine needs: `setTransform(s, x, y)`
  (uniform scale), `translate`, `scale`, `save`/`restore`, `globalAlpha`, `blendMode`
  (`"normal"` or `"add"`, canvas "lighter"). `image(tex, …)` draws a texture or part of it
  (snapped to whole pixels when drawn 1:1); `shape(x, y, w, h, {radius, fill, fillY, stroke,
  lineWidth})` draws an anti-aliased rounded rect (per-corner radii, vertical gradient
  fill, centred stroke) in a signed-distance shader; `rect()` is a plain fill. Draws are
  batched until the program, texture or blend mode changes (~30 draw calls a frame).
  Colours are CSS strings (`parseColor`) or `[r, g, b, a]` arrays (`hsla()` builds them).
  Textures are premultiplied; `texture(canvas)` returns a handle uploaded on first use
  (the canvas must not change afterwards), `releaseTexture` deletes after the frame.
  `clip(x, y, w, h)` (scissor, undone by `restore()`) limits drawing to a rectangle.
  `renderTarget()` + `setTarget(t, w, h)` draw into a texture (cleared to transparent;
  `setTarget(null)` returns to the screen); `setScreen(t)` makes a canvas-sized target stand in for
  the screen until `setScreen(null)` (or the next `begin()`), so `setTarget(null)` comes back to it; `imageQuad(tex, corners)` draws a texture onto
  a quad in perspective (corners `[x, y, q]`, q = perspective scale; homogeneous texture
  coordinates keep it undistorted).
- Each frame: `begin()`, the backdrop pass, then the UI and game, then `end()` (flush).
  On WebGL context loss nothing is drawn; on restore programs are rebuilt and every
  texture handle uploads again from its canvas.
- Text: `Engine.text()` renders each string once per font, colour and scale into a cached
  texture (LRU, `TEXT_CACHE_MAX`); the colour's alpha is applied at draw time so pulsing
  text doesn't make new textures (pass a changing alpha as an array, e.g. `inkAlpha()`, not a
  new CSS string). Values that change every frame (stat numbers like TIME) go through
  `textRun()`, which draws cached glyphs placed as the whole string would be (kerning kept).
  The cache is cleared on resize and when a web font finishes loading. `measureText()` uses
  a separate 2D context.
- Logical view 800×720, scaled to the window and drawn at device pixel ratio; the
  backdrop fills letterbox areas. Board at x=250, y=70, 30 px cells (`BOARD_*` constants). The
  engine draws with `boardY`/`boardH`/`wellTop` set per game by `layoutBoard()`: a shorter well (GB's
  18 rows) is centred on the 20-row one, and HOLD/NEXT, banners, glow and the wordmark follow it; the
  stats keep the standard position so five rows still clear the wordmark. Rev (`game.rev`, TGM1's hidden
  mode) draws the well upside down: `cellY()` maps the bottom row to the top and the spawn rows below
  the well, blocks stay upright; trails take their ends from `trailYs()` and the stack border swaps
  its top and bottom edges. Anything placed by row goes through `cellY()`.
- Layouts (`this.layout`, chosen in `resize()`): `LAYOUT_FULL` fits the whole 800×720 view;
  `LAYOUT_COMPACT` (touch devices always, other windows when it shows the well `COMPACT_GAIN` times
  bigger, i.e. narrow ones) fits only the well and a `COMPACT_SIDE_W` column each side:
  `drawCompactPanels()` puts HOLD over smaller stats on the left, NEXT on the right, clear messages
  centred over the well; the menu's wordmark shrinks. Board coordinates
  are the same in both; only the view rect (`layout.view`) and the side columns change. With touch,
  menu hints and the game-over line are reworded for the buttons (`touchWords()`).
- Playing field motion (`boardMotion()`): the field drifts in 3D, two sine waves per axis
  with random speeds and phases, up to `TILT_MAX` degrees (x, y) × `options.tiltAngle`
  (Options → Visuals → 3D tilt: Off, Subtle, Normal, Strong). A hard drop knocks it down on a damped
  spring (`kickShake()` / `updateShake()`, `SHAKE_*`; Options → Visuals → Drop shake: Off, Subtle, Normal,
  Strong, `SHAKE_LEVELS`, whose `scale` (`options.shakeScale`) multiplies every kick), which also
  tips it back slightly. Line clears jolt it too (`clearShake()`), in a random mostly-down
  direction, harder per extra line and per combo step (capped at `RING_CHAIN_MAX`). The drop kick is
  triggered by the "harddrop" sound event with `hardDropDistance`. The
  same option covers both. While it moves, `drawBoardInMotion()` draws the field (frame,
  grid, blocks, flashes, spawn rows) into a render target and projects it about the
  board's centre from `TILT_DISTANCE`; at rest it is drawn straight to the screen.
  Confetti, side panels and banners stay flat; the board glow follows the shake only.
- Blocks are pre-rendered sprites in one atlas texture per `tileset:size` (a row per style,
  the seven colours side by side); styles are `active` (falling piece), `locked` (stack),
  `ghost`. The falling piece cross-fades from active to locked as the lock delay runs out.
- Lamp light (`drawLamp()`, `LAMP_*`): every style but 1989 (`lamp: false`) catches a soft light, as
  from a lamp behind the well, whose pool moves over the well and whose spot moves inside each block
  with the field's tilt (`updateSheen()` places it). Stained glass has it always; the others only with
  3D tilt on (`LAMP_TILT_ALPHA` × tilt × `effectScale`, none at tilt or effects Off, so they look as
  before); with effects Off Stained glass's lamp stays at rest. The atlas holds
  `LAMP_STEPS`² spot positions per colour in the block's light colour, masked by the style's
  `lampMask()` (else its face), scaled by `lampStrength` (Holo 0.45); a block blends the nearest four, additively. Ghosts get none. The stack
  draws its blocks first and their lights (`drawLights()`: Holo's sheen, the lamp) in a second pass.
- `PIECE_COLORS` (index 1..7 = cyan, purple, orange, blue, green, red, yellow) were sampled
  from the legacy tile PNGs. Effects receive colour indices (types mapped through
  `game.palette`), so TGM3 Classic's Sega colours work everywhere.
- Confetti (Options → Visuals → Confetti, `options.confetti`, `CONFETTI_STYLES` in `options.js`): Off (no confetti; the row flash and clear burst stay), Glow (soft additive light motes), Paper (tumbling slips that flutter down), Sparks (default, streaks along their flight), Stars (twinkling four-point stars), Bubbles (rings floating up) and Pixels (squares snapped to a 3-unit grid, fading in steps). `CONFETTI_SPECS` (`engine.js`) gives each its count, size, motion, life, alpha and blending; `confettiSprites()` draws an atlas with a row per sprite style and a column per colour (`CONFETTI_COLORS`), turned sprites go through `confettiQuad()`. Light styles are added, Paper and Pixels drawn normally after them. TGM3 Easy's fireworks are always Glow.
- Effects: confetti per cleared cell, cleared-row flash, hard-drop flash, held-piece flash, clear messages
  in the right column below the next pieces (bigger/warmer for longer combos).
  Options → Visuals → Effects (`options.effects`, level 0–3: Off, Subtle, Normal, Intense; `effectScale` multiplies strengths) at Off turns off confetti, the cleared-row flash, the
  hard-drop trail and flash, the held-piece flash, the clear bursts, the animated backdrop, the 3D tilt (`tiltAngle` 0) and the drop shake (`shakeScale` 0); clear messages stay. The Visuals cards of those settings (`fx: true` in `VISUAL_ITEMS`) are greyed out then (`dimmed`, `MENU_DIMMED_ALPHA`), still changeable. Row flash (`options.flash`, on by default) toggles the cleared-row flash on its own. Options → Visuals → Backdrop (`options.backdrop`) toggles the animated colour wash and drifting lights (none with effects Off either), and Clear burst (`options.rings`: `"off"`, `"rings"`, `"ripple"`, `"flare"` (default), `RING_MODES`; `Engine.ringMode()` is the one in effect) the bursts that spread from cleared rows past the well, whose strength follows only the effects level (`RING_ALPHA` at Normal). Rings are glowing ellipses in the backdrop pass; Ripple (`rippleShapes()`, `RIPPLE_*`) is a wave packet that travels through the whole view and refracts it: while one runs, `draw()` sends the frame into `sceneLayer` (`GLRenderer.setScreen()`) and `GLBackdrop.refract()` draws it onto the screen through the waves (displacement only, with red bent less and blue more than green, `RIPPLE_SPREAD`, so its front splits into a rainbow fringe: no light or rings of its own). Flare (`flareShapes()`, `FLARE_*`) is a short anamorphic lens flare through the cleared rows (a horizontal streak as tall as they are, from the top of the highest to the bottom of the lowest (`top`/`bottom` on the ring), with a white-hot core dimmer the taller it is, a bloom and three ghosts, widening as it fades), added over everything by `GLBackdrop.flares()` after the game is drawn, as light on the lens.
- The version (`VERSION` in `engine.js`, "0.5") shows faintly in the top left, the FPS in the top right.
- The READY countdown (`drawCountdown()`) shows each digit sliding in and fading out in its own
  colour (`COUNTDOWN_COLORS`); band and digit are gone on the first frame that takes input.
  It is drawn as part of the field (end of `drawBoard()`), so it tilts and flies in with it.
  Meanwhile the field flies in from afar (`flyIn()`, `FLY_*`): it starts `FLY_DEPTH` behind its place,
  turned (`FLY_TURN`, either way, `flySide`) and faded out, and eases into place by `FLY_FRAMES`. It is
  part of `boardMotion()` (`dz`, `alpha`; drawn through `drawBoardInMotion()`), the board glow scales
  and fades with it (`flyScale()`); none with effects Off.
- Font: Archivo from Google Fonts with a system fallback (only network dependency).
- The backdrop pass (`backdrop.js`) draws the large soft effects per pixel in shaders:
  the static backdrop picture (rendered by `renderBackground()` and uploaded on resize),
  colour wash, drifting lights, board glow (exact Gaussian of the frame, like `shadowBlur`)
  and clear rings. `Engine.backdropScene()` describes them each frame from
  `ambientShapes()` / `ringShapes()` / `boardGlowAlpha()`. The glow and rings run under a
  scissor box 4 sigma around them (`boardPassBounds()`). Confetti is added on top of
  everything ("add" blending).
- Hot drawing paths (`quad()`, `shape()`, the backdrop's uniforms) write into preallocated
  arrays; keep them free of per-call temporary arrays and closures.
- Clear messages are rendered once per set of actions into a texture (text shadows),
  then faded and scaled.

## Rule sets: what is specified, and where from

Primary sources: tetris.wiki pages *Tetris Guideline*, *Super Rotation System*, *Marathon*,
*Tetris Effect* (Master mode's delays),
*Scoring*, *T-Spin*, *Tetris The Grand Master 3 Terror-Instinct*, *Arika Rotation System*,
*Heboris Unofficial Expansion* (rule comparison table), *List of TGM series bugs*;
*Tetris The Absolute The Grand Master 2 PLUS*, *Grade Recognition System*, *TGM randomizer*;
github.com/raincomplex/randomizers `randos/ti.py` (TGM3 randomizer) and `randos/tgm.py`
(`tgm`, TGM1's, and `tgm_tap`, TAP's, with a reference sequence);
github.com/nullpomino/nullpomino `ClassicPlusWallkick.java` (TGM3-style ARS kick order),
`GradeMania3Mode.java` (staff roll and 15-minute timings), `GradeMania2Mode.java` (TAP roll
length, M-roll section rules as code), `GradeManiaMode.java` (TGM1's GM checks and roll) and
`DigRaceMode.java` (the Guideline's dig).

### Guideline (Marathon, Sprint, Ultra, Dig, Master)
- SRS with Guideline kick tables (JLSTZ and I); 7-bag; 6 next pieces (Guideline maximum).
- Spawn in rows 21–22 (engine row 0), drop one row immediately; block out and lock out end the game.
- Gravity: seconds/row = (0.8 − (L−1)·0.007)^(L−1); 10 lines per level, level capped at 15.
- Lock delay 30 frames; 15 move resets, counter restarts on reaching a new lowest row;
  out of moves → locks on touchdown.
- DAS 10 / ARR 2 (first auto-shift at frame 10, then 12, 14…); ARE 6; no line clear delay;
  soft drop 20× gravity (max 20G). These are the defaults of the player's handling options:
  ARR 0 shifts straight to the wall (one move sound); SDF Instant is 20G; DCD pauses a charged
  auto-shift for that many frames after a rotation or a spawn (hold included), then ARR resumes;
  the drop guard ignores hard drops in a piece's first 8 active frames (`GUIDELINE_DROP_GUARD`).
- Scoring: 100/300/500/800 × level; T-spin 400/800/1200/1600, mini 100/200/400;
  back-to-back ×1.5 for Tetris and line-clearing T-spins; combo 50 × combo × level;
  soft drop 1/cell, hard drop 2/cell; perfect clear 800/1200/1800/2000 (3200 for B2B Tetris) × level.
- T-spin: last move a rotation, 3-corner rule; mini if only one front corner is filled,
  upgraded to full if the last rotation used kick test 5 (the 1×2 kick).
- Variable goal (`"variable"`, Marathon's Goal card): a level needs 5 × level goal points
  (`GUIDELINE_VARIABLE_GOAL`); a clear or T-spin earns its base score / 100 rounded down
  (1/3/5/8, T-spin 4/8/12/16, mini 1/2/4), ×1.5 for back-to-back; points past the goal are lost
  (`addGoalPoints()`). Meeting level 15's goal ends it with COMPLETE. Stats: LEVEL, GOAL, LINES.
- Master (`"master"`): 20G from M1 to M30 (`GUIDELINE_MASTER_DELAYS`: lock 29.5 frames for M1–M10, then
  down to 5.5 at M30; line clear 30 down to 3 for M1–M10, then 0.6; rounded to whole frames), a level
  every 10 lines from the chosen start, no ghost, COMPLETE at 300 lines. Stats: LEVEL (M1…), LINES, TIME.
- Dig (`"dig"`): 5, 10 or 18 rows of garbage (`GUIDELINE_DIG_ROWS`, `fillDigGarbage()`), one hole per
  row, never in the same column as the row below; `isGarbage` marks their rows and falls with the
  field (`collapse()`). Level 1 throughout; COMPLETE when every garbage row is cleared. Stats: TIME,
  GARBAGE (cleared / total), LINES.

### TGM3 World (Master mode, World rule)
- SRS with **Arika's I-piece kicks**; Ti randomizer (35-piece pool, 4-piece history,
  6 rolls, arcade bug included; first piece never S/Z/O); 3 next pieces.
- Level +1 per new piece except at x99 and 998; clears add 1/2/4/6; reaching 500 after 7:00
  ends the game ("LEVEL STOP"), except in a promotional exam.
- Level 999 stops the timer and starts the staff roll: phase `rollstart` empties the field a row
  every 6 frames from the bottom (confetti, no shake), then 3238 frames of play (`roll`,
  `rollFrames`; the TIME row becomes a ROLL countdown). Blocks locked in the roll hide
  (`getCellAlpha()`, per-cell `lockTime`): the fading roll 5 s after locking, the invisible roll
  (all 9 COOLs and internal grade ≥ 27) at once; they show again when the game ends. Roll clears
  earn only roll grade (`TGM_ROLL_POINTS`, hundredths: 0.04/0.08/0.12/0.26 fading,
  0.1/0.2/0.3/1.0 invisible, +0.5/+1.6 for surviving), added to the displayed grade. Surviving
  ends with "COMPLETE", or "GRAND MASTER" at grade 32 after the invisible roll.
- After 15:00 (`TGM_KILL_FRAMES`) Master and Easy run at 20G with Shirase's 600-1099 delays (ARE 6,
  line ARE 5, DAS 6, lock 12, line clear 3; tetris.wiki), to stop overlong games.
- Master gravity table (1/65536 G, 20G from level 500) and delay table
  (ARE, line ARE, DAS, lock, line clear by level); ARR 1.
- Lock reset limits: 8 rotations, 10 moves; soft drop non-locking at 1G; hard drop locks.
- Ghost only below level 100. Score: ⌈(level+lines)/4⌉ + soft + sonic, × lines × combo,
  + ⌈level after/2⌉ + speed; soft is the frames Down was held (a Classic soft drop lock on the
  ground counts its frame), +1 for a hard drop lock (World; NullpoMino). No Bravo bonus (removed in TGM3).
- Grade (GRADE row in `getStats()`): internal grade 0–31 with grade points per clear
  (`TGM_GRADES`, combo multipliers `TGM_GRADE_COMBO` by `gradeCombo`: clears of 2+ lines in a
  row, singles keep it, a piece clearing nothing resets it; level multiplier ×1–4 per 250 levels),
  100 points advance and drop the remainder. Points decay by one per decay period while the
  player controls a piece, has points and no grade combo is running; the decay timer restarts
  only with a new internal grade. Displayed = boosts + COOLs, labelled 9…1, S1…S9, m1…m9, Master…MasterM.
- COOL: reaching *70 within the section time (52 s … 38 s, `TGM_COOL_TIME`), and if the previous
  section earned a COOL, at most 2 s slower than its *70; once the section is finished, +1 grade and speed level +100
  (the delay table runs past 999 for this); none in 900–999. The COOL!! message waits until *82
  (`TGM_COOL_SHOWN`, NullpoMino; tetris.wiki: shown "around *80"). REGRET: a section slower than
  `TGM_REGRET_TIME` (the last one judged at 999) drops one boost and zeroes the points (with no
  boosts it does nothing).
  Both messages use action kind `grade`, as do STAFF ROLL / INVISIBLE ROLL. Times are read as seconds.
  Displayed grade = boosts + COOLs + roll grade, capped at MasterM until the roll is survived.
- Exams (the Exams card, On by default; Master without Big, each rule its own; tetris.wiki, demotion
  points from NullpoMino's `GradeMania3Mode`): the qualified grade starts at 9. Each game has a 1 in 3
  chance (`TGM3_EXAM_CHANCE`, `tgm3ExamFor()`) of a promotional exam at the average of the 2nd–4th best
  of the last 7 grades, rounded down, if that is above the qualified grade (`tgm3PromotionGrade()`; GM
  only once qualified MasterM), else of a demotional exam at the qualified grade once the demotion
  points reach 30. A game 8+ grades below the qualified one adds the excess over 7 to those points
  (`tgm3ExamAfter()`). Passing a promotion qualifies at its grade; failing a demotion costs one grade.
  A promotional exam is announced as the first piece comes ("EXAM S5", kind `grade`), shown in place of
  SCORE and draws the well's frame gold; the banner reports the result. With exams, Grand Master shows
  only for a qualified GM or in the GM exam (else MasterM: `gradeIndex()` vs `earnedGradeIndex()`, the
  latter going to the history). The engine passes `qualified` and `exam` in the options
  (`initGame()`), saves the result when the game ends (`submitRecord()`) and shows QUALIFIED beside
  BEST under the cards.
- Secret grade (TGM1, TAP Master and Death, TGM3 Master and Shirase; tetris.wiki, the check as in
  NullpoMino's `Field.getSecretGrade`): when the game ends (`endGame()`), the rows of the ">" pattern from
  the bottom (`secretGradeRows()`: one hole per row, in column 9 − |10 − k| in row k, under a block, every
  other cell filled; the 19th row's hole covered) give 9…S9, GM (`SECRET_GRADE_LABELS`; Shirase's S1…S9,
  m1…m9, GM). Shown from 5 rows (`SECRET_GRADE_MIN_ROWS`, NullpoMino's) in the game over banner
  (`endNotes()`, lines under its sub-title), not in the records.

### TGM3 Classic (Master mode, Classic rule)
- Same timing, levels, randomizer and scoring as TGM3 World, but:
- ARS shapes (`ARS_SHAPES`): bottom-aligned, L/J/T spawn flat side up, I/S/Z two states,
  spawn rows 19–20 (engine row 1). Sega colours (`ARS_PALETTE`: I red, T cyan, S purple, Z green).
- Kicks: basic, then 1 right, then 1 left. Centre-column rule for L/J/T rotating from
  3-wide orientations. TGM3 extras: I wall kicks (1 left, 1 right, 2 right; only for an I touching a wall or the
  stack beside it, tetris.wiki and Cambridge), I floor kick
  (up 1 or 2, only when resting, once), T floor kick into pointing-up (twice); rotating
  after a floor kick zeroes the lock delay.
- Up = sonic drop (no lock); soft drop locks on the ground; step reset only.

### TAP (TGM2 The Absolute Plus): Master and Death
- Plain ARS: TGM3 Classic's shapes, spawn, colours, sonic drop, locking soft drop and step reset,
  but only the basic kicks (1 right, then 1 left, centre-column rule): the I never kicks, no floor
  kicks. No hold (and no IHS), one next piece, IRS. One buffer row as in TGM3.
- Randomizer (`TapRandomizer`): 4-piece history starting Z S S behind the first piece (never S, Z
  or O), up to 6 rolls (the sixth taken as it comes), TGM3's generator.
- Levels: +1 per new piece except at x99 and 998 and in the roll, +1 per cleared line.
- Master: TGM3's gravity table and delay table below 1000 (ARR 1); ghost below level 100; no
  COOL/REGRET, no 15-minute speed-up, no level stop at 500.
- Score: (⌈(level+lines)/4⌉ + soft + 2×sonic) × lines × combo × bravo + ⌈level after/2⌉ + 7×speed;
  bravo 4 for a perfect clear (action "BRAVO", kind `pc`). Combo, soft, sonic, speed as in TGM3.
- Master grades: `TGM_GRADES` (TAP's table), points ⌈base × combo⌉ × (1 + ⌊level/250⌋), but the
  combo multipliers (`TAP_GRADE_COMBO`) apply to singles, doubles and triples, never to Tetrises;
  displayed 9…S9 from points. At 999: the M-roll (invisible) with S9, at most 8:45 and every section
  qualified (`TAP_MROLL_*`: sections 0–4 ≤ 65 s with ≥ 2 Tetrises, section 5 ≤ ⌊average of 0–4⌋ + 2 s,
  later ones ≤ previous + 2 s, ≥ 1 Tetris in 5–8; judged as each section ends), else the fading
  roll (blocks gone 4 s after locking). The roll lasts 3694 frames and earns no score or grade;
  roll lines are counted. M-roll: topping out gives M, surviving GM (green line, orange with
  32+ roll lines); surviving the fading roll keeps the grade (orange line).
- Death: 20G, no ghost, `TAP_DEATH_DELAYS` by level. Grade "—" until M for reaching 500 by 3:25.00;
  reaching 500 later stops the timer and level at 500 and starts the credit roll (EXCELLENT, no grade);
  999 gives GM regardless. Death's roll keeps blocks visible and changes nothing; topping out
  in it keeps the grade.

### TAP Normal
- Sources: tetris.wiki (TAP page).
- Levels to 300 without section stops (but 299), its own gravity table (`TAP_NORMAL_GRAVITY`, 1/256 G:
  4 at 0 and again at 100, 16 at 200, 20G at 300), delays as TGM+ (`TAP_NORMAL_DELAYS`), ghost below
  100, no grades. Score: TAP's formula ×6, and at 300 a time bonus of 1253 × the seconds under 5:00.
- Items (`TAP_NORMAL_ITEMS`): reaching 100 brings Free Fall (every block drops down its column, no
  holes left), 200 Del Even (every other row from the bottom deleted: the second, fourth, ...). The
  item comes in a piece, the next to enter (`nextItem`, then `pieceItem`; `onNewPiece()`); its blocks
  keep it in the field (`itemCells`, `getCellItem()`, falling with the stack in `onCollapse()`) and
  it goes off after the first line clear that takes any of them (tetris.wiki: item pieces "behave
  normally when placed"; `scoreClear()` collects it in `firingItems`, `afterClear()` calls
  `useItem()`), the piece's other blocks losing it. The engine marks item blocks, the item piece and
  the NEXT piece that carries one with a pulsing gold rim (`drawItemMark()`). Rows Free Fall fills
  clear at once, without score or lines, and blocks an item removes take their item with them (only
  the player's clears set items off): assumptions, the sources don't say.
- Level 300: a 20G staff roll (TAP's length) with blocks visible; COMPLETE whether survived or not.

### Big modes
- TGM1, TAP (but TGM+) and TGM3 take a Big card; ACE has its own Big mode (Normal's speeds; the wiki
  calls it "similar or possibly identical" to Normal). Shirase's rising garbage copies the bottom two
  rows when big. TGM3 Big Master gets no section COOLs (so always the fading roll), and its roll clears
  earn 0.08/0.26/0.34/0.42 (`TGM_BIG_ROLL_POINTS`; tetris.wiki).

### TAP TGM+
- Sources: tetris.wiki (TAP page); NullpoMino `GarbageManiaMode.java` (pattern, roll length).
- TAP Master's rules, gravity and scoring, but Normal mode's delays at every level
  (`TAP_PLUS_DELAYS`: ARE 27, line ARE 27, DAS 16, lock 30, line clear 40), no grades.
- Garbage (`tapPlusGarbage()`): a count of pieces locked without a clear (clears don't reset it)
  raises the next row of a fixed 24-row pattern (`TAP_PLUS_PATTERN`, looping) at 13 − ⌊level/100⌋.
- Level 999: a 2024-frame staff roll with blocks visible; EXCELLENT whether survived or topped out.

### TGM3 Easy and Shirase (World or Classic rule)
- Easy: levels to 200 (stops at x99, 199), `EASY_GRAVITY` (1/256 G, 20G at 200), fixed delays
  (`EASY_DELAYS`: ARE 48, line ARE 25, DAS 14, lock 30, line clear 40), ghost below 100. No score or
  grade: fireworks (`easyHanabi()`, `easyFrame()`), from the community analysis (THIRD-PARTY-NOTICES):
  per clear truncate(base 1/2.9/3.8/4.7 × combo × bonuses) into a stream firing every 10 frames;
  combo (doubles+ add one, to 9; singles keep it without the bonus); ×1.3 if a stream firework fired
  in the last 100 frames; split ×1.4; lucky levels 25/50/75/125/150/175/199 ×1.3; 30 levels in a 30 s
  period ×1.4 on the next clear; ×(level − frames since the last clear)/100 over 100 and
  ×(level − active frames)/120 over 120; spins ×2 (T ×3, T triple ×4, O never); a perfect clear +6 in
  its own stream. Level 200: a 3265-frame 20G staff roll (blocks visible) with a free firework every
  ⌊3265 / fireworks fired⌋ frames, the combo frozen and mapped (9 to the lowest, the game's bug);
  surviving it: EXCELLENT and +24. Fireworks still waiting count at the end. Stats: HANABI, LEVEL, TIME. Each firework fired
  (`fire()`) is reported through `takeFireworks()` (a count); the engine draws a burst for each
  (`launchFirework()`, `FIREWORK_*`, up to 6 a frame; not with effects off).
- Shirase: 20G, levels to 1300 (stops at x99), `SHIRASE_DELAYS` by level, no ghost, TGM3 score. Grade
  S1…S13 = sections finished − REGRETs (a section over 60 s in the first two, 50 s after). Level stops
  (`SHIRASE_TORIKAN`): 500 after 3:03 (World) / 2:28 (Classic), 1000 after 6:06 / 4:56 end the game.
  Garbage in 500–999 (`shiraseGarbage()`): +1 per new piece, −1 per line cleared; at the section's
  quota (20/18/10/9/8) a copy of the bottom row rises before the next piece. Blocks monochrome (neutral grey-white, palette index 8) from
  1000 (`MONO_PALETTE`). Level 1300: a 3238-frame staff roll with big pieces, blocks visible;
  surviving it completes the mode (orange line), topping out ends it with the grade.

### ACE: Normal, Hi-Speed 1, Hi-Speed 2, Another, Another 2, Big (SRS, ARS or ARS2)
- Sources: tetris.wiki *Tetris The Grand Master Ace*; NullpoMino `TimeAttackMode.java` (tables).
- Hold with IHS, three next pieces, a 7-bag that never deals S, Z or O first (`bagNoSzoFirst`; tetris.wiki
  *TGM randomizer*), ghost (hidden at 20G), lock resets up to 128
  per piece (`ACE_MOVE_RESETS`, move reset with every rule), no score. A piece whose entry is blocked
  enters up to two rows higher, to rows 21-22, before it is a block out (`spawnRise`). Rules (the mode id, the Rule card):
  - SRS (`tgmAce`): Arika SRS (TGM3 World's kicks), hard drop, soft drop 1G.
  - ARS (`aceArs`): TGM3's ARS shapes and kicks (`useArs(false, DEFAULT_PALETTE)`: standard colours)
    with no floor kick limit, no zeroed lock delay after floor kicks, spawn in rows 19-20; up is a hard
    drop that locks, soft drop about 0.5G (`ACE_ARS_SOFT`) and doesn't lock.
  - ARS2 (`aceArs2`): as ARS with the drops' locking swapped: up is a sonic drop, soft drop locks on
    the ground. The stats put ARS or ARS2 before the mode.
- Big: Normal's speeds with big pieces.
- 15 levels of 10 lines; 150 lines complete it. Each level has a time limit (`ACE_TIME_LIMITS`: 2:00,
  2:00, then 1:30; Another 1:00), its clock starting over when the next piece comes; running out ends
  the game (TIME OVER). Stats: LEVEL, LINES, LIMIT (the level's clock), TIME.
- Gravity (`ACE_GRAVITY`, 1/256 G by level): Normal 4 … 1280 then 20G from 13, Hi-Speed 1 84 … 1280
  then 20G from 8, the others 20G. Delays: Normal and Hi-Speed ARE 25, line ARE 25, DAS 15, lock 30,
  line clear 41; Another by level (`ACE_ANOTHER_DELAYS`, ARE 18 → 6, lock 28 → 13); Another 2 at
  Another's fastest (`ACE_ANOTHER2_DELAYS`, line clear 4).

### TGM1 (Tetris The Grand Master): Master and 20G
- Sources: tetris.wiki *Tetris The Grand Master*, *TGM randomizer*; NullpoMino `GradeManiaMode.java`.
- Plain ARS as in TAP (basic kicks only, IRS, no hold, one next piece, one buffer row), but no
  sonic or hard drop: Up does nothing. Soft drop is 1G and locks on the ground; step reset.
- Randomizer (`Tgm1Randomizer`): TAP's with 4 rolls and a history starting Z Z Z Z (first piece never
  S, Z or O).
- Gravity: TGM3's table (`TGM_GRAVITY`, 20G from 500); delays the same at every level
  (`TGM1_DELAYS`): ARE 30, line ARE 30, DAS 16, lock 30, line clear 41; ARR 1. Ghost below level 100;
  no speed-up at 15:00. Levels as in TAP (+1 per piece except at x99 and 998, +1 per line).
- Score: (⌈(level+lines)/4⌉ + soft) × lines × combo × bravo (4 for a perfect clear, "BRAVO");
  combo and soft as in TAP. Grade from the score (`TGM1_GRADE_SCORES`: 9 at 0 … S9 at 120,000).
- GM (`TGM1_GM_CHECKS`): at level 300 at least 12,000 points by 4:15, at 500 40,000 by 7:30, at 999
  126,000 by 13:30. Level 999 without them ends the game (COMPLETE with the grade); with them, the
  grade becomes GM and a 2968-frame staff roll follows with blocks visible; it ends in GRAND MASTER
  whether survived or topped out.
- 20G (`"20g"`): the hidden 20G mode, Master at 20G from level 0 (no ghost).
- The other codes, as setup cards that combine (tetris.wiki: "Codes may be combined"): Big; Reverse
  (pieces enter at the bottom and "fall" upwards: the well is drawn upside down, the rules unchanged);
  Mono (every piece one colour); Ghost all game (TLS).

### NES (1989): A-Type and B-Type
- Sources: tetris.wiki *Tetris (NES, Nintendo)*, *Scoring*; meatfighter.com's NES Tetris AI article
  (orientation table, soft drop, randomizer, level bug).
- Right-handed NRS (`NES_SHAPES`): every piece turns about one cell (box cell
  2, 2), which spawns in the top visible row, column 5 (`NES_SPAWN_ROW`); T/L/J flat side up, S/Z two
  states with the vertical one right of the centre, I flat in the centre's row. No kicks, no IRS.
  20-row well; pieces may turn into the two rows above it (`NES_PIECE_TOP`).
- No hold, no hard drop, no ghost, one next piece. Shares GB's code (`Game1989`):
  `applyGravityGb()`, no lock delay, `scoreGb()`.
- Gravity in frames per row (`NES_GRAVITY`: 48 at level 0 … 6 at 9, 5/4/3 for 10–18, 2 for 19–28,
  1 from 29). Every row restarts the gravity timer, and gravity keeps going during a soft drop.
  Soft drop: needs a fresh press per piece, first row on the third frame, then every second; holding
  left or right ends it, and holding down blocks shifting.
- DAS 16 / ARR 6; DAS doesn't charge outside the active phase, where left or right only redirect
  the charge, and letting go never resets it (`keepsDas()`); a blocked shift leaves it fully
  charged (it retries every frame). ARE by the height of the piece's centre (`setNesDelays()`): 10 in
  the bottom two rows, +2 per 4 rows, at most 18; a line clear adds 17–20 frames (to the next multiple
  of 4 frames, `NES_LINE_CLEAR`).
- Randomizer (`NesRandomizer`): a roll of 0–7, rerolled once (0–6, taken as it comes) if it is 7 or
  the previous piece.
- Score: 40/100/300/1200 × (level + 1) at the level after the clear, plus rows soft-dropped when the
  soft drop locks the piece; capped at 999,999. A-Type: start level 0–19, the first level-up after
  min(start × 10 + 10, max(100, start × 10 − 50)) lines (the NES's bug), then every 10, no cap.
  B-Type: as GB's, with `NES_B_ROWS` (0, 3, 5, 8, 10, 12) rows of garbage by height.

### GB (1989): A-Type and B-Type
- Sources: tetris.wiki *Tetris (Game Boy)*, *Nintendo Rotation System* (and its GB piece chart);
  TASVideos submission 4536 and the disassembly (randomizer).
- Left-handed NRS (`GB_SHAPES`): T/L/J spawn flat side up and turn about the
  centre of their 3×3 box (pointing up sits in the box's top two rows); S/Z two states, vertical on
  the left; I horizontal in the box's third row, vertical in its second column. No kicks, no IRS.
  18-row well like the GB's (`GB_WELL_TOP`; the board is drawn 18 rows high). Spawn with the
  box in the well's top row (`GB_SPAWN_ROW`), highest block in the second row; no turning above it.
- No hold, no hard or sonic drop (the hard drop key does nothing), no ghost, one next piece.
- Gravity table in frames per row (`GB_GRAVITY`, levels 0–20: 53 … 3), counted per frame
  (`gbFrames`, `applyGravityGb()`). Soft drop: a row every 3 frames, the first with the press; it
  needs a fresh press for each piece. No lock delay: a piece that can't move down when gravity or
  soft drop is due locks at once (the lock fade shows the gravity timer while it rests).
- DAS 23 / ARR 9 (the disassembly's counter: $17 on the press, 9 after each auto-shift; tetris.wiki's
  24 counts the press frame too); ARE 2; line clear 91 (93 with ARE).
- Randomizer (`GbRandomizer`): up to 3 rolls to avoid three of a kind, tested with the original's
  bitwise OR of the roll, the preview and the piece entering play (L J I O Z S T = 0…6 here, ×4 in the
  ROM) against the piece entering play (the ROM keeps a hidden piece behind the preview, as the queue
  does), so L comes up 10.7%, J/I/Z 13.7% and O/S/T 16.1%.
- Score: 40/100/300/1200 × (level + 1), plus rows soft-dropped when the soft drop locks the piece;
  capped at 999,999. A-Type: starts at the chosen level 0–9, first level-up after
  (start + 1) × 10 lines, then every 10, max 20, endless. B-Type: stays at the chosen level,
  starts over height × 2 rows of garbage (height 0–5, `GB_ROWS_PER_HEIGHT`; each cell filled with
  probability 0.5, every row with a hole; the stats show a HEIGHT row), ends with COMPLETE at 25 lines.
- Heart mode (the Heart card; tetris.wiki, `SetNumFramesUntilPiecesMoveDown` in the disassembly): gravity
  as at the level + 10 (`GB_HEART_LEVELS`, `speedLevel()`), at most level 20's; levels and score as
  without it; the LEVEL row shows a ♥. Both types.

### Variants (all rule sets)
- `standard`: as specified (Guideline's "Endless", Marathon's Goal card). `marathon`: Guideline only, ends with
  COMPLETE after 150 lines (`GUIDELINE_LINE_GOALS`). `variable`, `dig`, `master`: Guideline only (above). `sprint`: Guideline only, COMPLETE after 40
  lines with a TIME row (`sprint20`, `sprint100`: 20 or 100). `ultra`: Guideline only, TIME UP after
  2 minutes (`GUIDELINE_ULTRA_FRAMES`; `ultra1`, `ultra3`, `ultra5`: 1, 3 or 5) with a countdown TIME
  row. The marathons (standard, marathon, variable) start at level 1 + startLevel (to 15); the fixed
  goal counts the lines from level 1, as tetris.wiki's Marathon (from level 6, level 7 at 60 lines). Sprint, ultra and dig stay at level 1 (`GUIDELINE_FIXED_LEVEL`; an
  assumption, the sources only give the goals). `death`: constant 20G, no ghost (for TAP it is
  TAP's own Death mode, above). `btype`: NES and GB only (above). `20g`: TGM1 only (above).
  `test`: no gravity (still implemented and tested, but hidden from the menu).

### Documented assumptions (sources are silent or ambiguous)
- TGM3 World pieces spawn in the top two visible rows; a normal hold doesn't count as a new piece for levelling.
- Reset limits count only after the piece first touches down, and restart at a new lowest row.
- Guideline has no line clear delay (except Master); hard drop counts as TGM's "sonic" distance for scoring.
- Guideline variable goal: T-spins without lines earn goal points too (their base score / 100); the
  sources speak of line clears. Master: 10 lines per level and the end at 300 lines are taken from
  "at least 300 lines" over 30 levels; no grades (Tetris Effect grades by lines); ARE and DAS stay the
  Guideline's. Dig: garbage cells take random piece colours (no grey block here); the timer is the
  score, as in NullpoMino.
- Centre-column rule scans only the rotated piece's cells; the I's wall kicks are tried in
  NullpoMino's order; the T floor kick is tried after failed wall kicks (NullpoMino behaviour).
- Staff roll timings (3238-frame roll, row-by-row field clear, fade over the last 10 of 300
  frames, invisible after 2) follow NullpoMino's `GradeMania3Mode`.
  With the Exams card Off, surviving the invisible roll at displayed grade 32 gives Grand Master
  directly (NullpoMino with exams off); the fading roll caps at MasterM. Exams (TGM3 Master, below):
  the qualified grade lives in the browser (`Exams`) instead of a player card; an exam needs seven
  games in the history; the demotion points follow NullpoMino (the wiki only says "routinely"); games
  with a hidden test setup (`tested`) don't count.
- Grading: the level multiplier uses the level before the clear; the first clear of 2+ lines
  in a combo counts as combo 1 (NullpoMino); the 2 s COOL rule applies only right after a
  COOL section (NullpoMino); "controls a piece" for decay means the active phase (not ARE or line clears).
- TAP: the roll length (3694 frames) and its row-by-row field clear follow NullpoMino; the fading
  roll's 4 s follows tetris.wiki (NullpoMino uses 5 s). The M-roll's 5th-section average is taken
  in frames, rounded down. The displayed grade stays S9 during the M-roll (NullpoMino). TAP Death's
  credit roll uses the Master roll length. NullpoMino speeds TAP up after 15:00, but the wiki doesn't
  mention it, so that isn't done.
- TAP Normal: the wiki states how item pieces go off only for Versus; Normal's are taken to work the
  same, the whole piece carrying the item (the wiki speaks of "an item block"); the line ARE is the
  ARE (27); the roll uses Master's length (the wiki gives none), and holding Start to skip it isn't
  there. Big: no Big TGM+ (NullpoMino has a separate big garbage pattern); nothing beyond the rows
  counting half changes with Big (grades, sections and goals count the halved lines).
- TGM+: delays and roll length per tetris.wiki and NullpoMino; the garbage cells take random
  colours (no grey block here).
- TGM3 Easy: the suggested placements before level 100 aren't drawn (the ghost stands in); the
  gravity table is harddrop.com's (tetris.wiki's differs from level 132 on and goes down at 144: 132: 128,
  144: 112, 156: 144, 167: 176, 177: 192; no emulator has the mode to settle it); fireworks are counted, not drawn, and the streams
  fire on the frames a clock from the game's start divides; the completion bonus comes at the end of
  the roll. Shirase: the roll length and big roll pieces follow NullpoMino; the grey-white monochrome is
  used with both rules; level 1300 is reached by clears only.
- ACE: NullpoMino's tables are used as they are (its DAS and ARE may be counted differently from the
  arcade's); SRS's soft drop is 1G and doesn't lock. ARS and ARS2 per the wiki's description; ARS's
  "zangi-moves impossible" (and ARS2's re-enabled ones) aren't modelled: both play the same in that
  respect. The Guideline's extra goals and times are this game's choice; the sources name 40 lines and
  2 minutes.
- TGM1: the GM checkpoints' limits are inclusive (NullpoMino; the wiki says "<"); the staff roll
  (length from NullpoMino) only follows GM and empties the field row by row like TGM3's. TGM3's DAS
  freezes are taken as TAP's (the wiki doesn't know them).
  Hidden modes: Rev is drawn as the well turned upside down with upright blocks (the wiki only says
  pieces spawn at the bottom and rise); Mono's colour is a neutral grey-white (palette index 8);
  Uki (a voice for line clears) isn't there; codes don't keep scores off a table (there is none).
- NES: the entry delay uses the piece's rotation centre as its lock height (the wiki doesn't say which
  cell); the line clear lengthens to the next multiple of 4 frames since the game started; soft drop
  points count all rows of the last press (the NES's BCD bug is left out). No 96-frame opening delay
  (the countdown stands in), no level 29 colour glitches, kill screen or score above 999,999. Start
  levels 10–19 are on the level card rather than A + Start. Colours stay the Guideline ones.
- GB: the level and height
  choices use setting cards, not the original's number grids (heart mode is the Heart card rather than
  Down + Start). There is no B-Type end bonus to add: the disassemblies show the GB's end screen only
  tallies the clears and the NES's B-Type ends without one. No line-clear duplication bug, block out at spawn ends the game. The randomizer's
  OR test follows the disassembly (vinheim3/tetris-gb-disasm) and reproduces the published
  piece frequencies; it is seeded from the shared generator, not a DIV timer. Soft drop needing a
  re-press per piece follows NES behaviour; soft drop points require the drop to lock the piece.

If you change rules, keep `test/rules.test.js` passing and add checks for new behaviour.
The tests load `game.js` and the rule files (`RULE_FILES`, in `index.html`'s order) via `vm` and
export names explicitly at the top; add new globals there, and new rule files to `RULE_FILES`.

## Presentation choices the user made

- Look: dark night-gallery theme, warm off-white ink (`INK`), Archivo type.
- Piece colours stay the sampled originals (Classic uses Sega colours by design).
- Line clears: no artificial delay outside TGM3; confetti (moderately prominent) plus a row flash.
- Lock-delay fade on the falling piece; hard-drop flash in the piece's own colour, not white.
- Options → Visuals → Drop trail (`options.trail`, on by default; shown only with effects on): a
  streak per column behind a hard-dropped piece, and behind the stack falling during a line clear
  delay (`drawTrails()`). Drawn under the field, each runs into the
  column's blocks, down to the piece's lowest one, inset to the blocks' width and under their rounded
  tops (the style's `face`, `trailFit()`); neighbouring columns join across the gap between blocks
  above them, so a piece's trail is one area. Trails and the hard-drop flash take the piece's light
  colour, or the block style's `trail(index)` for styles that don't colour blocks by piece (Mono,
  Holo, 1989; `Engine.tileLight()`).
- Options → Visuals → Stack border (`options.border`, off by default): a TGM-style light line
  (`STACK_BORDER_*`, `drawStackBorder()`) along every side of the settled stack that faces an empty
  cell, drawn on the block's own edge (never outside the stack, continuous round inner corners);
  none along the walls and floor. Falling rows during
  a line clear are outlined on their own; staff roll blocks fade or vanish with their border.
- Settled blocks have a thin light rim (Glossy style).
- Sounds: subtle, synthesised; line-clear chime is a dark A-minor-7 arpeggio that rises
  with the combo chain; M (rebindable) mutes.
- Clear messages appear below the next pieces (over the well in the compact layout), scaled by importance and combo length.
- Menu: main screen with Quick Play, Custom Game and Options (Continue and Restart on top during a game); Quick Play lists
  common modes with no setup step (the user's request); Custom Game (named New Game until Quick Play came; the user's rename) has two steps (rule set, then mode); rule sets are "Guideline", "TGM1", "TGM2 TAP", "TGM3 TI", "ACE", "NES" and "GB" (in that order;
  the rule set and mode lists use tighter cards). Guideline's
  modes are "Marathon" (Goal: 150 lines, Variable or Endless; Level 1–15), "Sprint" (Lines), "Ultra" (Time), "Dig" and "Master";
  Endless moved under Marathon to keep the list tidy. TGM1's "Master" and "20G" (each with Big, Reverse,
  Mono and Ghost cards), TGM3's are
  "Master", "Easy" and "Shirase" (each with a Rule card, World or Classic), TAP's "Normal", "Master", "Death" and
  "TGM+", ACE's "Normal", "Hi-Speed 1", "Hi-Speed 2", "Another", "Another 2" and "Big" (Big is otherwise
  a setup card, Off / On), NES's and GB's
  "A-Type" and "B-Type". The GB
  rule set was named "1989" until the NES one came (the user's rename). GB keeps every visual style (Guideline colours,
  the usual board and effects); only its well is shorter, 18 rows as on the GB (the user's request).
  The stats panel shows the rule set and the mode (`getStats()[0]`), never "STANDARD". The generic
  death variant is hidden from the menu for Guideline and TGM3 (still in the rules); TAP's Death is offered. The title tagline reads "WELCOME" (the user's own edit; keep it) and shows only on the main screen; the Visuals screen puts its heading in its place.
- Tunables are constants near the top of `engine.js` (`CONFETTI_*`, `FLASH_LIFE`,
  `DROP_FLASH_LIFE`, `MESSAGE_*`, `COMBO_COLORS`) and `sound.js` (`SOUND_VOLUME`, `CLEAR_NOTES`).

## Storage

- `localStorage["quadbricks.options"]`: `{ keys: {left, right, soft, hard, rotl, rotr, rot180, hold, sound} (lists of key codes; an action missing from saved keys keeps its default), pad (the same actions, lists of pad controls), tileset, confetti, effects, backdrop, rings, flash, tilt, shake (an index into `SHAKE_LEVELS`; a saved true/false from before becomes Normal/Off), trail, border, scale, das, arr, dcd, sdf, ghost, dropGuard, previews, holdPiece, irs, ihs, rot180 }` (`sdf` null = Instant, JSON has no Infinity).
- `localStorage["quadbricks.muted"]`: `"1"` / `"0"`.
- `localStorage["quadbricks.exams"]`: `{ world, classic: { qualified, demotion, history } }`, TGM3 Master's
  qualified grade per rule (grade indices into `TGM_GRADE_LABELS`, history latest first, at most 7).
- `localStorage["quadbricks.records"]`: `{ [recordKey]: { key: [numbers], text } }`, the best result per
  game setup (invalid entries are dropped on load).
- Every access is wrapped in try/catch; the game must work with storage unavailable.

## Working on this repo

- **Commits:** one logical change per commit, imperative summary line plus a body
  explaining what and why. When the user asks for changes to be easy to revert, split them
  and put shared prerequisites in their own commit first.
- **Verify in a browser**, not just in Node. Practical techniques:
  - The Python server lets the browser cache scripts. After editing, refresh them with
    `await Promise.all(['engine.js', …].map(f => fetch(f, {cache: 'reload'})))` and then
    `location.reload()`, or you will test stale code.
  - Wait for `engine.init()` (fonts and tile images) before sending keys; earlier key
    presses are lost. Click the page first so it has focus; audio only starts after a key
    press or click.
  - A hidden preview pane throttles or pauses `requestAnimationFrame`. For deterministic
    checks, take over the loop: `requestAnimationFrame = cb => { window.__cb = cb; }`, then
    `engine.start()`, and call `__cb(t)` with your own timestamps (e.g. steps of 1000/144 ms
    to check a 144 Hz display), screenshot, and reload the page afterwards. Freezing only
    `engine.frame` stops the game but not the animations.
  - The canvas has no `preserveDrawingBuffer`: to read pixels, call `engine.draw()` and read
    them in the same task. Test context loss with
    `engine.r.gl.getExtension("WEBGL_lose_context")` (`loseContext()`, `restoreContext()`).
  - Keys sent in the same instant as Enter on the Keybinds screen arrive before the capture
    opens; that's a test artefact, not a bug.
  - You can't hear audio: verify sounds by checking `engine.sound.ctx.state === "running"`,
    that `play()` doesn't throw, and which notes get scheduled; tell the user to listen.
  - Reset any options you change while testing (`engine.options.resetKeys()`,
    `tileset = "flat"`, `save()`); the browser pane's storage is the user's.
- Windows checkout: git warns about LF→CRLF on every commit; that's expected.
