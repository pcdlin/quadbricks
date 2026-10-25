# QUADBRICKS

A vibe coded falling blocks game based on a private C++ project.

## Requirements

To play the game:

- A modern browser with WebGL enabled (current Chrome, Edge, Firefox or Safari).
- An internet connection for the Archivo font from Google Fonts. Falls back to a system font if the font can't be loaded.

To run it locally:

- Python 3 (any version with `http.server`), or any other static file server.
  There is no build step, bundler or `package.json`, so the files in `game/` are
  served as they are.

To run the rule-set tests:

- Node.js (tested with v24). The tests use only Node's standard library.

## Running the game

From the repository root, start a static server for `game/`:

```bash
python -m http.server 8123 --directory game
```

Then open <http://localhost:8123> in your browser.

Any static server works the same way, for example:

```bash
npx serve game
```

Stop the server with Ctrl+C.

## Rule sources

The rule sets in `game/rules*.js` follow published specifications and community
reference implementations. Where the sources disagree or are silent, the choices
are listed as assumptions in `AGENTS.md`.

- **Tetris Guideline and general mechanics** (tetris.wiki): *Tetris Guideline*,
  *Super Rotation System*, *Marathon*, *Scoring*, *T-Spin*, *Heboris Unofficial
  Expansion* (rule comparison table), *List of TGM series bugs*.
- **Guideline modes** (tetris.wiki): *Marathon* (variable goal), *Tetris Effect*
  (Master mode's delays).
- **TGM1** (tetris.wiki): *Tetris The Grand Master*, *TGM randomizer*.
- **TGM3** (tetris.wiki): *Tetris The Grand Master 3 Terror-Instinct* (Master, Easy,
  Shirase), *Arika Rotation System*; Easy's fireworks from the community document
  linked in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
- **TGM2 Plus / TAP** (tetris.wiki): *Tetris The Absolute The Grand Master 2
  PLUS*, *Grade Recognition System*, *TGM randomizer*.
- **ACE** (tetris.wiki): *Tetris The Grand Master Ace*.
- **NES Tetris** (tetris.wiki and meatfighter.com): *Tetris (NES, Nintendo)*,
  *Scoring*, "Applying Artificial Intelligence to Nintendo Tetris".
- **GB Tetris** (tetris.wiki and TASVideos): *Tetris (Game Boy)*, *Nintendo
  Rotation System*, TASVideos submission 4536 and its disassembly (randomizer).
- **Randomizers** (test vectors only): [raincomplex/randomizers](https://github.com/raincomplex/randomizers),
  `randos/ti.py` (TGM3) and `randos/tgm.py` (TGM1 and TAP).
- **NullpoMino**: [nullpomino/nullpomino](https://github.com/nullpomino/nullpomino),
  `ClassicPlusWallkick.java` (TGM3-style ARS kick order), `GradeMania3Mode.java`
  (staff roll and 15-minute timings), `GradeMania2Mode.java` (TAP roll length
  and M-roll rules), `GradeManiaMode.java` (TGM1), `DigRaceMode.java` (dig),
  `SpeedMania2Mode.java` (Shirase), `GarbageManiaMode.java` (TGM+) and
  `TimeAttackMode.java` (ACE).

Licences and attributions for these sources are in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

