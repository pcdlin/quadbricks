# Third-party notices

Quadbricks is an independent implementation. The rules are written from published
specifications; the sources are listed in `README.md`. This file records where other
people's work went into the repository beyond facts and specifications.

## NullpoMino (BSD 3-Clause)

<https://github.com/nullpomino/nullpomino>

No NullpoMino code is copied. Numeric values and behaviours were taken from its mode
files and re-implemented in `game/rules.js`: the TGM3 kick order (`ClassicPlusWallkick.java`),
staff roll and 15-minute timings and delay rows (`GradeMania3Mode.java`), and TAP roll length
and M-roll section rules (`GradeMania2Mode.java`). As a courtesy, and because its tables
informed ours, its licence is reproduced:

```
BSD 3-Clause License

Copyright (c) 2019, TSTman
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## raincomplex/randomizers

<https://github.com/raincomplex/randomizers>

Only the piece sequences from its tests are used, as test vectors in `test/rules.test.js`
(TAP reference sequence, TGM3 attract-mode sequence). No code is included.

## Fonts

Archivo (Omnibus-Type, SIL Open Font License 1.1) is loaded at runtime from Google Fonts. It is not
bundled in this repository.

## Trademarks

Tetris is a trademark of The Tetris Company. Game Boy and Nintendo are trademarks of Nintendo.
"Tetris The Grand Master" and "TAP" are the work of Arika. Quadbricks is not affiliated with or
endorsed by any of them; the names appear only to identify the rule sets being reproduced.
