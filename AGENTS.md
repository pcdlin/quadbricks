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
esbuild-minified `game.<hash>.js`, minifies the inline CSS and copies `favicon.svg` and `gfx/`.
esbuild comes from `npx` (pinned in `build.js`, needs network the first time); top-level names are
kept because the scripts share globals. A new script in `index.html` is picked up automatically.

There is no build step, bundler or package.json. Scripts are classic `<script>` tags that
share globals; load order in `game/index.html` matters:
`game.js → rules.js → sound.js → tiles.js → options.js → renderer.js → backdrop.js → touch.js → engine.js`,
then an inline bootstrap creates `Engine` and calls `init()` / `start()` (or shows a message
when WebGL is unavailable).

## Repository layout

| Path | What it is |
|---|---|
| `game/game.js` | Shared definitions only: field size (`WIDTH` 10, `HEIGHT` 22, first visible row `VISIBLE_TOP` 2), piece ids (`tetI`=1 … `tetO`=7), input bitmap bits, SRS `shapes`; `shapeCells()` (a shape table's blocks as offsets) and `clamp()`. |
| `game/rules.js` | `RuleGame`: the rule sets (Guideline, TGM3 World/Classic, TAP, GB) and their variants. All game logic lives here. |
| `game/engine.js` | `Engine`: 60 fps loop, input, menus, rendering, effects. |
| `game/renderer.js` | `GLRenderer`: WebGL renderer with a small canvas-like API (textured quads, rounded rects); colour helpers. |
| `game/backdrop.js` | `GLBackdrop`: the renderer's backdrop pass (backdrop, wash, lights, glow, rings) and the clear ripples' refraction pass. |
| `game/tiles.js` | Block styles (`TILESETS`): Radiant (default, glassy glow), Glossy, Flat, Neon, Faceted, Pixel, Mono, Holo (grey metal; styles with `sheen: true` get `Engine.drawSheen()`, an additive colour gloss per block whose strength and hue follow the field's tilt (`updateSheen()`, `HOLO_*`): grey face-on, shimmering when tilted, so grey for good at tilt Off) and Game Boy (monochrome; Game Boy gives each piece its own pattern), Original. Loads the Original PNGs. |
| `game/options.js` | `Options`: key bindings, block style and effects level in localStorage; `keyLabel()` for keycaps. |
| `game/touch.js` | `TouchControls`: handheld-style on-screen controls on touch devices (or `?touch=1`): a D-pad (up = hard drop, down = soft drop; one touch area, so the finger can roll between arms, the lower diagonals add soft drop to a move, and up needs a fresh touch in games), rotate and HOLD buttons and a MENU pill; in menus the D-pad gives the arrows and the round buttons OK/BACK. They feed `Engine.onKey()` with the same key codes. `place()` puts them in a bar below the view (portrait) or beside it (landscape) and returns the room they take, which `Engine.resize()` leaves free. |
| `game/sound.js` | `Sound`: Web Audio synthesised effects (no audio files). |
| `game/gfx/` | Copies of the legacy tile PNGs, used only by the "Original" block style. |
| `test/rules.test.js` | Spec checks for `rules.js` (~220 checks). |

## History in one paragraph

The browser version began as a 1:1 port of the original C++ game. It was then
redesigned visually (night-gallery look inspired by *Tetris Forever*), verified against the
official rules, and the C++-faithful logic was replaced by spec-following rule sets. The old
port's `Game` class has been removed; `git log` has the full story (one feature per commit).

## Architecture

### Frame loop and input (`engine.js`)
- Fixed timestep from the original: frames of 17, 17, 16 ms (≈60 fps), run from
  `requestAnimationFrame`, catching up at most 4 frames, resetting after a >250 ms stall.
- Keys are collected as events and turned into one **input bitmap per frame**
  (`LEFT_PUSH`, `LEFT_RELEASE`, … from `game.js`), like the SDL original. Key repeat is
  ignored in games (`e.repeat`); DAS/ARR are implemented by the rules, not the OS. Menus take
  the OS repeat for the arrows (`MENU_REPEAT_KEYS`, events marked `repeat`) to scroll while held;
  repeats stop at the ends of lists and values instead of wrapping (`stepIndex()` in
  `options.js`) and don't flip on/off settings.
  The rules apply a frame's releases before its presses, so a release of an action pressed in
  the same frame waits for the next frame. Keys let go while the game wasn't listening (menu
  open, window unfocused) are released when it resumes (`keysDown`, `syncKeys`).
- Hidden TGM3 and TAP test keys (`TEST_KEYS`, nowhere in the UI), during a game: Ctrl+Shift+1 straight
  to the staff roll the player has earned, 2 to the invisible roll, 3 to an invisible roll that
  ends in Grand Master if survived (TAP Master: 2 and 3 both go to the M-roll), 4 to the last 5 s
  of the roll, 5 to 10 s before the 15-minute speed-up (TGM3 only). They call
  `RuleGame.testSetup()`, which refuses during READY, after game over, in the Guideline, and for
  setups a mode doesn't have (TAP Death: only 1 and 4).
- Game keys come from `options.keys` (rebindable). Menus always use arrows / Enter / Esc
  (`MENU_KEYS`); `Escape` can't be bound.
- Menu screens: `MENU_MAIN` (`MAIN_ITEMS`: New Game, Options; `mainItems()` adds Restart first while a game exists, restarting it with the same settings, and Esc from a game opens the menu on it). New Game → `MENU_RULES` (rule sets) →
  `MENU_MODES` (each rule set's `modes`: Endless…Ultra, World/Classic for TGM3, Master/Death for
  TAP, A-Type/B-Type for GB) → game; modes with `startLevels` (GB's) go through `MENU_LEVEL` first,
  setting cards (`levelItems()`: Level 0–9, plus Height 0–5 for modes with `startHeights`, B-Type),
  remembered per mode for the session (`startLevels`/`startHeights` maps, keyed by rule set and mode
  index). Options → `MENU_OPTIONS` (`OPTIONS_ITEMS`) → `MENU_CONTROLS` (key bindings),
  `MENU_VISUALS` or `MENU_HANDLING` (card "Guideline"). Esc goes back one screen and, on the main screen, resumes a
  paused game. Leaving a game with Esc opens `MENU_MAIN`.
- Visuals and Guideline handling are setting screens (`SETTING_ITEMS`: `VISUAL_ITEMS`, `HANDLING_ITEMS`),
  changed with ← → (Enter steps forward). Add a setting to one of those lists, its default in the
  `Options` constructor and its values in `OPTION_CHOICES` or its id in `OPTION_TOGGLES`
  (`options.js`: loading, saving and `Options.step()` follow from those), and, unless it is on/off, a
  case in `optionValue()` (the card's value text). `changeOption()` needs a case only for side effects.
- Guideline handling (`HANDLING_ITEMS`, applies to the Guideline modes only): DAS 1–20 F, ARR 0–5 F
  (0 shown as Instant), SDF 5×/10×/20×/40×/Instant (`SDF_STEPS`), DCD 0–20 F (0 = Off), ghost piece,
  hard drop guard, then a "Reset to defaults" card (`action: true`: Enter resets via
  `options.resetHandling()`, ← → do nothing, the card shows its own `desc`). Frame values are shown with milliseconds (`frameValue()`). Each item has `help`:
  the abbreviation spelled out and one line on what it does, drawn under the compact card list for
  the selected item. `options.handling` goes to `RuleGame` in `initGame()`; changes made while a
  game is paused apply at once (`applyHandling()` → `RuleGame.setHandling()`).
- The Visuals screen lists Block style first, then Scale, then the rest (`VISUAL_ITEMS`). The Block
  style card (`preview: true`) is taller (`menuRowHeight()`) and shows the style's preview in it
  (`drawTilesetPreview()`: the seven colours as active, locked and ghost blocks in one row). The list is
  `VISUALS_LIST_H` high and scrolls in logical units (eased in `updateMenuScroll()`, clipped with
  `GLRenderer.clip()`) to keep the selection in view, with a scrollbar beside it.

### Rules engine (`rules.js`)
`new RuleGame(mode, variant)` with `mode` ∈ `guideline` (3), `arika` (4, TGM3 World),
`tgmClassic` (5, TGM3 Classic), `tgmTap` (6, TAP), `gameBoy` (7, GB) and `variant` ∈ `"standard"`,
`"test"`, `"death"` (plus the Guideline's `"marathon"`, `"sprint"`, `"ultra"` and GB's `"btype"`).
TAP's `"standard"` is its Master mode, `"death"` its Death mode; GB's `"standard"` is A-Type.
A third argument, `startLevel` (GB only, clamped to 0–9, `GB_START_LEVELS`), sets the starting level;
a fourth, `height` (GB B-Type only, clamped to 0–5, `GB_B_HEIGHTS`), the garbage height; a fifth,
`handling` (Guideline only, overrides of `GUIDELINE_HANDLING`: `das`, `arr`, `sdf`, `dcd`, `ghost`,
`dropGuard`; ignored by TGM3, TAP and GB, whose timing is part of their spec).
Flags: `this.tgm` (TGM3 World or Classic, or TAP: levels to 999, delays, grades, staff roll),
`this.ars` (Classic or TAP), `this.tap`, `this.gb`, `this.hasHold` (false for TAP and GB). GB is
neither `tgm` nor the Guideline: code paths written as `!this.tgm` for the Guideline also check `!this.gb`.

The engine drives it with `advanceFrame(inputBitmap)` and reads:
- `getCell(row, col)`, `getCellAlpha(row, col)` (staff roll), `getCurPiece_*()`, `getShadowRow()` (−100 = no ghost),
  `getHeldPiece()`, `rnd_get_queue(i)`, `isGameOver()`, `inStartDelay()`, `inRollStart()`,
  `countdown()` (3, 2, 1 during READY, else 0), `startdelayCounter/startdelayMax`, `curPiece_lockDelay/lockDelayMax` (lock fade),
  `endTitle/endSub`, `getStats()` (side panel rows; first row is `[RULESET, VARIANT]`),
  `getDropDistance(row)`/`getDropOffset(row)`/`getDropLandedFor(row)` (during a line clear delay the
  stack falls into the cleared rows at `LINE_DROP_SPEED` rows per frame, faster if the delay is shorter,
  with a trail, `drawLineDropTrails()`; the field itself collapses when the delay ends).
- `shapes`, `pieceCells` (`shapeCells(shapes)`: `[type][rotation]` → `[row, col]` offsets, what the
  rules and the engine iterate) and `palette` (piece type → colour index) per rule set; `nextCount` (TAP and GB: 1, so the
  engine draws no list under the first next piece); `hasHold` (no HOLD box when false);
  `firstDrawnRow` (0: the two rows above the well are drawn; GB: 4); `wellTop` (first row of the
  well: `VISIBLE_TOP`, GB 4 for its 18 rows), which sizes the board (`Engine.layoutBoard()`).
- Event queues the engine drains every frame: `takeClearedCells()` (confetti),
  `takeHardDropCells()` (landing flash and trail; cells a clear removed come with `cleared: true`, in the row they landed in; TAP Master's sonic drop adds them too, so it gets the trail, without the drop sound or shake), `takeBumps()` (directions the piece was pushed against the left/right once per press; nudges the field via `bumpShake()`, same Drop shake option), `takeSounds()` (`"move"`, `"rotate"`, `"lock"`,
  `"harddrop"`, `"sonic"`, `"count"` (each countdown digit), `"go"` (first active frame), `"clear<n>"` or `"clear<n>c<chain>"`), plus `actions`
  (`{text, kind, value}`, kinds `clear`/`tspin`/`b2b`/`combo`/`pc`) with `actionAge`.
- `chain`: consecutive clearing pieces, −1 after a miss, then 0, 1, 2…; identical in every
  rule set and used only for presentation (TGM's `combo` is a score multiplier).

**Row coordinates:** visible rows are 2..21 (bottom = 21). Rows above are buffer: down to
−18 for the Guideline (20-row buffer); TGM3 and TAP delete blocks locking above row 1. GB's well is
rows 4..21 (`GB_WELL_TOP`, 18 rows); its pieces can't occupy rows above it (`pieceTop`).
Pieces are 4×4 boxes; `curPiece_row/col` is the box's top-left.

**Phases:** `ready` (countdown 3, 2, 1, `COUNTDOWN_STEP_FRAMES` = 30 each; frame 91 is the first to take input) → `active` → `are` / `lineclear` → `active` … (TGM3 and TAP at
999, TAP Death at a late 500: `lineclear` → `rollstart` → `active` in the roll; it starts once
`timerStopped` is set)
DAS charges in every phase. IRS (held rotate) and IHS (held hold) apply at spawn.

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
  stats keep the standard position so five rows still clear the wordmark.
- Layouts (`this.layout`, chosen in `resize()`): `LAYOUT_FULL` fits the whole 800×720 view;
  `LAYOUT_COMPACT` (touch devices always, other windows when it shows the well `COMPACT_GAIN` times
  bigger, i.e. narrow ones) fits only the well and a `COMPACT_SIDE_W` column each side:
  `drawCompactPanels()` puts HOLD over smaller stats on the left, NEXT on the right, clear messages
  centred over the well; the menu's wordmark shrinks and the keycap row is hidden. Board coordinates
  are the same in both; only the view rect (`layout.view`) and the side columns change. With touch,
  menu hints and the game-over line are reworded for the buttons (`touchWords()`).
- Playing field motion (`boardMotion()`): the field drifts in 3D, two sine waves per axis
  with random speeds and phases, up to `TILT_MAX` degrees (x, y) × `options.tiltAngle`
  (Options → Visuals → 3D tilt: Off, Subtle, Normal, Strong). A hard drop knocks it down on a damped
  spring (`kickShake()` / `updateShake()`, `SHAKE_*`; Options → Visuals → Drop shake), which also
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
- `PIECE_COLORS` (index 1..7 = cyan, purple, orange, blue, green, red, yellow) were sampled
  from the legacy tile PNGs. Effects receive colour indices (types mapped through
  `game.palette`), so TGM3 Classic's Sega colours work everywhere.
- Effects: confetti per cleared cell, cleared-row flash, hard-drop flash, clear messages
  in the right column below the next pieces (bigger/warmer for longer combos).
  Options → Visuals → Effects (`options.effects`, level 0–3: Off, Subtle, Normal, Intense; `effectScale` multiplies strengths) at Off turns off confetti, the cleared-row flash and the
  hard-drop trail and flash and the clear rings; clear messages stay. Options → Visuals → Backdrop (`options.backdrop`) separately toggles the animated colour wash and drifting lights, and Clear rings (`options.rings`: `"off"`, `"rings"`, `"ripple"` (default), `RING_MODES`; `Engine.ringMode()` is the one in effect) the line-clear shockwaves, whose strength follows only the effects level (`RING_ALPHA` at Normal). Rings are glowing ellipses in the backdrop pass; Ripple (`rippleShapes()`, `RIPPLE_*`) is a wave packet that travels through the whole view and refracts it: while one runs, `draw()` sends the frame into `sceneLayer` (`GLRenderer.setScreen()`) and `GLBackdrop.refract()` draws it onto the screen through the waves (displacement only: no colour, light or rings of its own).
- The version (`VERSION` in `engine.js`, "0.2") shows faintly in the top left, the FPS in the top right.
- The READY countdown (`drawCountdown()`) shows each digit sliding in and fading out in its own
  colour (`COUNTDOWN_COLORS`); band and digit are gone on the first frame that takes input.
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
*Scoring*, *T-Spin*, *Tetris The Grand Master 3 Terror-Instinct*, *Arika Rotation System*,
*Heboris Unofficial Expansion* (rule comparison table), *List of TGM series bugs*;
*Tetris The Absolute The Grand Master 2 PLUS*, *Grade Recognition System*, *TGM randomizer*;
github.com/raincomplex/randomizers `randos/ti.py` (TGM3 randomizer) and `randos/tgm.py`
(`tgm_tap`, TAP randomizer with a reference sequence);
github.com/nullpomino/nullpomino `ClassicPlusWallkick.java` (TGM3-style ARS kick order),
`GradeMania3Mode.java` (staff roll and 15-minute timings) and `GradeMania2Mode.java` (TAP roll
length, M-roll section rules as code).

### Guideline (Endless and Marathon)
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

### TGM3 World (Master mode, World rule)
- SRS with **Arika's I-piece kicks**; Ti randomizer (35-piece pool, 4-piece history,
  6 rolls, arcade bug included; first piece never S/Z/O); 3 next pieces.
- Level +1 per new piece except at x99 and 998; clears add 1/2/4/6; reaching 500 after 7:00
  ends the game ("LEVEL STOP").
- Level 999 stops the timer and starts the staff roll: phase `rollstart` empties the field a row
  every 6 frames from the bottom (confetti, no shake), then 3238 frames of play (`roll`,
  `rollFrames`; the TIME row becomes a ROLL countdown). Blocks locked in the roll hide
  (`getCellAlpha()`, per-cell `lockTime`): the fading roll 5 s after locking, the invisible roll
  (all 9 COOLs and internal grade ≥ 27) at once; they show again when the game ends. Roll clears
  earn only roll grade (`TGM_ROLL_POINTS`, hundredths: 0.04/0.08/0.12/0.26 fading,
  0.1/0.2/0.3/1.0 invisible, +0.5/+1.6 for surviving), added to the displayed grade. Surviving
  ends with "COMPLETE", or "GRAND MASTER" at grade 32 after the invisible roll.
- After 15:00 (`TGM_KILL_FRAMES`) the game runs at 20G with ARE 2, line ARE 1, DAS 5, lock 13,
  line clear 3, to stop overlong games.
- Master gravity table (1/65536 G, 20G from level 500) and delay table
  (ARE, line ARE, DAS, lock, line clear by level); ARR 1.
- Lock reset limits: 8 rotations, 10 moves; soft drop non-locking at 1G; hard drop locks.
- Ghost only below level 100. Score: ⌈(level+lines)/4⌉ + soft + sonic, × lines × combo,
  + ⌈level after/2⌉ + speed; soft gets +1 when the player locks the piece (hard drop,
  Classic soft drop on the ground). No Bravo bonus (removed in TGM3).
- Grade (GRADE row in `getStats()`): internal grade 0–31 with grade points per clear
  (`TGM_GRADES`, combo multipliers `TGM_GRADE_COMBO` by `gradeCombo`: clears of 2+ lines in a
  row, singles keep it, a piece clearing nothing resets it; level multiplier ×1–4 per 250 levels),
  100 points advance and drop the remainder. Points decay by one per decay period while the
  player controls a piece, has points and no grade combo is running; the decay timer restarts
  only with a new internal grade. Displayed = boosts + COOLs, labelled 9…1, S1…S9, m1…m9, Master…MasterM.
- COOL: reaching *70 within the section time (52 s … 38 s, `TGM_COOL_TIME`), and if the previous
  section earned a COOL, at most 2 s slower than its *70; once the section is finished, +1 grade and speed level +100
  (the delay table runs past 999 for this); none in 900–999. REGRET: a section slower than
  `TGM_REGRET_TIME` (the last one judged at 999) drops one boost and zeroes the points.
  Both messages use action kind `grade`, as do STAFF ROLL / INVISIBLE ROLL. Times are read as seconds.
  Displayed grade = boosts + COOLs + roll grade, capped at MasterM until the roll is survived.

### TGM3 Classic (Master mode, Classic rule)
- Same timing, levels, randomizer and scoring as TGM3 World, but:
- ARS shapes (`ARS_SHAPES`): bottom-aligned, L/J/T spawn flat side up, I/S/Z two states,
  spawn rows 19–20 (engine row 1). Sega colours (`ARS_PALETTE`: I red, T cyan, S purple, Z green).
- Kicks: basic, then 1 right, then 1 left. Centre-column rule for L/J/T rotating from
  3-wide orientations. TGM3 extras: I wall kicks (1 left, 1 right, 2 right), I floor kick
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

### GB (Tetris for the Game Boy, 1989): A-Type and B-Type
- Sources: tetris.wiki *Tetris (Game Boy)*, *Nintendo Rotation System* (and its GB piece chart);
  TASVideos submission 4536 and the disassembly (randomizer).
- Left-handed Nintendo Rotation System (`GB_SHAPES`): T/L/J spawn flat side up and turn about the
  centre of their 3×3 box (pointing up sits in the box's top two rows); S/Z two states, vertical on
  the left; I horizontal in the box's third row, vertical in its second column. No kicks, no IRS.
  18-row well like the Game Boy's (`GB_WELL_TOP`; the board is drawn 18 rows high). Spawn with the
  box in the well's top row (`GB_SPAWN_ROW`), highest block in the second row; no turning above it.
- No hold, no hard or sonic drop (the hard drop key does nothing), no ghost, one next piece.
- Gravity table in frames per row (`GB_GRAVITY`, levels 0–20: 53 … 3), counted per frame
  (`gbFrames`, `applyGravityGb()`). Soft drop: a row every 3 frames, the first with the press; it
  needs a fresh press for each piece. No lock delay: a piece that can't move down when gravity or
  soft drop is due locks at once (the lock fade shows the gravity timer while it rests).
- DAS 24 / ARR 9; ARE 2; line clear 91 (93 with ARE).
- Randomizer (`GbRandomizer`): up to 3 rolls to avoid three of a kind, tested with the original's
  bitwise OR of the piece values (L J I O Z S T = 0…6 here, ×4 in the ROM) against the previous piece,
  so L comes up ~10.5% and O/S/T ~16%.
- Score: 40/100/300/1200 × (level + 1), plus rows soft-dropped when the soft drop locks the piece;
  capped at 999,999. A-Type: starts at the chosen level 0–9, first level-up after
  (start + 1) × 10 lines, then every 10, max 20, endless. B-Type: stays at the chosen level,
  starts over height × 2 rows of garbage (height 0–5, `GB_ROWS_PER_HEIGHT`; each cell filled with
  probability 0.5, every row with a hole; the stats show a HEIGHT row), ends with COMPLETE at 25 lines.

### Variants (all rule sets)
- `standard`: as specified (Guideline's "Endless"). `marathon`: Guideline only, ends with
  COMPLETE after 150 lines (`GUIDELINE_LINE_GOALS`). `sprint`: Guideline only, COMPLETE after 40
  lines with a TIME row. `ultra`: Guideline only, TIME UP after 2 minutes (`GUIDELINE_ULTRA_FRAMES`)
  with a countdown TIME row. Sprint and ultra stay at level 1 (`GUIDELINE_FIXED_LEVEL`; an
  assumption, the sources only give the goals). `death`: constant 20G, no ghost (for TAP it is
  TAP's own Death mode, above). `btype`: GB only (above).
  `test`: no gravity (still implemented and tested, but hidden from the menu).

### Documented assumptions (sources are silent or ambiguous)
- TGM3 World pieces spawn in the top two visible rows; a normal hold doesn't count as a new piece for levelling.
- Reset limits count only after the piece first touches down, and restart at a new lowest row.
- Guideline has no line clear delay; hard drop counts as TGM's "sonic" distance for scoring.
- Centre-column rule scans only the rotated piece's cells; the I right-1 kick has no
  "touching the stack" condition; the T floor kick is tried after failed wall kicks
  (NullpoMino behaviour).
- Staff roll timings (3238-frame roll, row-by-row field clear, fade over the last 10 of 300
  frames, invisible after 2) and the 15-minute speeds follow NullpoMino's `GradeMania3Mode`.
  There are no player accounts, so no promotion exam: surviving the invisible roll at displayed
  grade 32 gives Grand Master directly (NullpoMino with exams off); the fading roll caps at MasterM.
- Grading: the level multiplier uses the level before the clear; the first clear of 2+ lines
  in a combo counts as combo 1 (NullpoMino); the 2 s COOL rule applies only right after a
  COOL section (NullpoMino); "controls a piece" for decay means the active phase (not ARE or line clears).
- TAP: the roll length (3694 frames) and its row-by-row field clear follow NullpoMino; the fading
  roll's 4 s follows tetris.wiki (NullpoMino uses 5 s). The M-roll's 5th-section average is taken
  in frames, rounded down. The displayed grade stays S9 during the M-roll (NullpoMino). TAP Death's
  credit roll uses the Master roll length. NullpoMino speeds TAP up after 15:00, but the wiki doesn't
  mention it, so that isn't done.
- GB: the level and height
  choices use setting cards, not the original's number grids. No B-Type end bonus,
  no heart mode, no line-clear duplication bug, block out at spawn ends the game. The randomizer's
  OR test is a reconstruction (compared with the previous piece) that reproduces the published
  piece frequencies; it is seeded from the shared generator, not a DIV timer. Soft drop needing a
  re-press per piece follows NES behaviour; soft drop points require the drop to lock the piece.

If you change rules, keep `test/rules.test.js` passing and add checks for new behaviour.
The tests load `game.js` + `rules.js` via `vm` and export names explicitly at the top;
add new globals there.

## Presentation choices the user made

- Look: dark night-gallery theme, warm off-white ink (`INK`), Archivo type.
- Piece colours stay the sampled originals (Classic uses Sega colours by design).
- Line clears: no artificial delay outside TGM3; confetti (moderately prominent) plus a row flash.
- Lock-delay fade on the falling piece; hard-drop flash in the piece's own colour, not white.
- Settled blocks have a thin light rim (Glossy style).
- Sounds: subtle, synthesised; line-clear chime is a dark A-minor-7 arpeggio that rises
  with the combo chain; M (rebindable) mutes.
- Clear messages appear below the next pieces (over the well in the compact layout), scaled by importance and combo length.
- Menu: main screen with New Game and Options (Restart on top during a game); New Game has two steps (rule set, then mode); rule sets are "Guideline", "TAP", "TGM3" and "GB" (in that order). Guideline's
  modes are "Endless", "Marathon", "Sprint" and "Ultra", TGM3's are "World" and "Classic", TAP's
  "Master" and "Death", GB's "A-Type" and "B-Type". GB keeps every visual style (Guideline colours,
  the usual board and effects); only its well is shorter, 18 rows as on the Game Boy (the user's request).
  The stats panel shows the rule set and the mode (`getStats()[0]`), never "STANDARD". The generic
  death variant is hidden from the menu for Guideline and TGM3 (still in `rules.js`); TAP's Death is offered. The title tagline reads "WELCOME" (the user's own edit; keep it) and shows only on the main screen; the Visuals screen puts its heading in its place.
- Tunables are constants near the top of `engine.js` (`CONFETTI_*`, `FLASH_LIFE`,
  `DROP_FLASH_LIFE`, `MESSAGE_*`, `COMBO_COLORS`) and `sound.js` (`SOUND_VOLUME`, `CLEAR_NOTES`).

## Storage

- `localStorage["quadbricks.options"]`: `{ keys: {left, right, soft, hard, rotl, rotr, hold, sound}, tileset, effects, backdrop, rings, tilt, shake, scale, das, arr, dcd, sdf, ghost, dropGuard }` (`sdf` null = Instant, JSON has no Infinity).
- `localStorage["quadbricks.muted"]`: `"1"` / `"0"`.
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
  - A hidden preview pane throttles `requestAnimationFrame` (single-digit FPS). For
    deterministic checks, freeze the loop (`const f = engine.frame; engine.frame = () => {}`),
    step frames manually with `f.call(engine, performance.now())`, call `engine.draw()`,
    screenshot, then restore `engine.frame = f`.
  - The canvas has no `preserveDrawingBuffer`: to read pixels, call `engine.draw()` and read
    them in the same task. Test context loss with
    `engine.r.gl.getExtension("WEBGL_lose_context")` (`loseContext()`, `restoreContext()`).
  - Keys sent in the same instant as Enter on the Controls screen arrive before the capture
    opens; that's a test artefact, not a bug.
  - You can't hear audio: verify sounds by checking `engine.sound.ctx.state === "running"`,
    that `play()` doesn't throw, and which notes get scheduled; tell the user to listen.
  - Reset any options you change while testing (`engine.options.resetKeys()`,
    `tileset = "glossy"`, `save()`); the browser pane's storage is the user's.
- Windows checkout: git warns about LF→CRLF on every commit; that's expected.
