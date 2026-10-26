// Shared definitions for the rule sets (rules.js) and the engine, taken from
// the original C++ game: field size, piece ids, input bitmap and
// the SRS piece shapes; plus a few small helpers both use.

// ----------------------------------------------------------
// GLOBALS

// Field dimensions (2 hidden rows above 20 visible ones)
const WIDTH = 10;
const HEIGHT = 22;
const VISIBLE_TOP = 2; // first visible row; the ones above are hidden

// Pieces
const tetEMPTY = 0, tetI = 1, tetT = 2, tetL = 3, tetJ = 4, tetS = 5, tetZ = 6, tetO = 7;
const tetGARBAGE = 8; // versus garbage blocks (a cell value, never a piece)

// Input Bitmap
const LEFT_PUSH = 0x0001;
const RIGHT_PUSH = 0x0002;
const HARD_PUSH = 0x0004;
const SOFT_PUSH = 0x0008;
const ROTL_PUSH = 0x0010;
const ROTR_PUSH = 0x0020;
const HOLD_PUSH = 0x0040;
const ROT180_PUSH = 0x0080; // 180° rotation (Guideline handling option)
const LEFT_RELEASE = 0x0100;
const RIGHT_RELEASE = 0x0200;
const SOFT_RELEASE = 0x0400;
const ROTL_RELEASE = 0x1000;
const ROTR_RELEASE = 0x2000;
const HOLD_RELEASE = 0x4000;
const ROT180_RELEASE = 0x8000;

// ----------------------------------------------------------
// PIECE INFO

// Piece, rotation state, 4 rows of 4 columns
const shapes = [
    [ // dummy
        [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]],
        [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]],
        [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]],
        [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]
    ],
    [ // I
        [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
        [[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]],
        [[0,0,0,0],[0,0,0,0],[1,1,1,1],[0,0,0,0]],
        [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]]
    ],
    [ // T
        [[0,1,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
        [[0,1,0,0],[0,1,1,0],[0,1,0,0],[0,0,0,0]],
        [[0,0,0,0],[1,1,1,0],[0,1,0,0],[0,0,0,0]],
        [[0,1,0,0],[1,1,0,0],[0,1,0,0],[0,0,0,0]]
    ],
    [ // L
        [[0,0,1,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
        [[0,1,0,0],[0,1,0,0],[0,1,1,0],[0,0,0,0]],
        [[0,0,0,0],[1,1,1,0],[1,0,0,0],[0,0,0,0]],
        [[1,1,0,0],[0,1,0,0],[0,1,0,0],[0,0,0,0]]
    ],
    [ // J
        [[1,0,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
        [[0,1,1,0],[0,1,0,0],[0,1,0,0],[0,0,0,0]],
        [[0,0,0,0],[1,1,1,0],[0,0,1,0],[0,0,0,0]],
        [[0,1,0,0],[0,1,0,0],[1,1,0,0],[0,0,0,0]]
    ],
    [ // S
        [[0,1,1,0],[1,1,0,0],[0,0,0,0],[0,0,0,0]],
        [[0,1,0,0],[0,1,1,0],[0,0,1,0],[0,0,0,0]],
        [[0,0,0,0],[0,1,1,0],[1,1,0,0],[0,0,0,0]],
        [[1,0,0,0],[1,1,0,0],[0,1,0,0],[0,0,0,0]]
    ],
    [ // Z
        [[1,1,0,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
        [[0,0,1,0],[0,1,1,0],[0,1,0,0],[0,0,0,0]],
        [[0,0,0,0],[1,1,0,0],[0,1,1,0],[0,0,0,0]],
        [[0,1,0,0],[1,1,0,0],[1,0,0,0],[0,0,0,0]]
    ],
    [ // O
        [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
        [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
        [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
        [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]]
    ]
];

// A shape table's filled cells as [row, col] offsets in its 4x4 box, in reading order, by piece
// type and rotation (shapes[type][rotation] -> cells[type][rotation])
function shapeCells(table) {
    return table.map(states => states.map(rows => {
        const cells = [];
        rows.forEach((row, i) => row.forEach((v, j) => { if (v) cells.push([i, j]); }));
        return cells;
    }));
}

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}
