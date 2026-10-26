// Piece randomizers of the rule sets that don't use a 7-bag. Each deals piece types (game.js) with
// next(); they draw from the arcade's linear congruential generator so sequences can be checked
// against published ones (test/rules.test.js).

// ----------------------------------------------------------
// TGM family randomizers, written from the behaviour tetris.wiki describes ("TGM randomizer"):
// a short history of recent pieces, and a piece that is in it is rolled again, a limited number
// of times. They draw from the arcade's linear congruential generator.

// The arcade generator (the ANSI C rand() recurrence): 15 bits per call. Subclasses deal indices
// into their pieces table (nextIndex()); next() turns them into piece types.
class LcgRandomizer {
    constructor(seed, pieces) {
        this.seed = seed >>> 0;
        this.pieces = pieces;
    }

    rand(n) {
        this.seed = (Math.imul(this.seed, 1103515245) + 12345) >>> 0;
        return ((this.seed >>> 10) & 0x7fff) % n;
    }

    next() {
        return this.pieces[this.nextIndex()];
    }
}

const TI_PIECES = [tetI, tetZ, tetS, tetJ, tetL, tetO, tetT]; // arcade order: I Z S J L O T
const TGM_Z = 1, TGM_S = 2, TGM_O = 5; // indices into TI_PIECES

class TgmRandomizer extends LcgRandomizer {
    constructor(seed) {
        super(seed, TI_PIECES);
    }

    // The first piece of a game is never S, Z or O (it would force an overhang)
    rollFirst() {
        let piece;
        do piece = this.rand(7); while (piece === TGM_S || piece === TGM_Z || piece === TGM_O);
        return piece;
    }
}

// ----------------------------------------------------------
// TGM3 Terror-Instinct randomizer: draws come from a pool of 35 (five of each piece) and are
// checked against the last four pieces dealt. Every slot that is drawn is refilled with the piece
// that has gone longest without being dealt, so droughts stay bounded. The arcade's flaw is kept:
// the "longest drought" search keeps its running maximum across all the refills of one deal, so
// after a rejected draw later refills in that deal reuse the first choice unless a piece is more
// overdue than it.

const TI_POOL = 35, TI_ROLLS = 6;

class TiRandomizer extends TgmRandomizer {
    constructor(seed) {
        super(seed);
        this.pool = [];
        for (let piece = 0; piece < 7; piece++) for (let k = 0; k < 5; k++) this.pool.push(piece);
        this.sinceDealt = new Array(7).fill(4); // deals since each piece was last dealt
        this.recent = [TGM_Z, TGM_Z, TGM_S, TGM_S]; // newest first
        this.started = false;
        this.bestGap = 0;
        this.refillPiece = 0;
    }

    refill(slot) {
        for (let piece = 0; piece < 7; piece++) {
            if (this.sinceDealt[piece] > this.bestGap) {
                this.bestGap = this.sinceDealt[piece];
                this.refillPiece = piece;
            }
        }
        this.pool[slot] = this.refillPiece;
    }

    nextIndex() {
        if (!this.started) {
            this.started = true;
            const first = this.rollFirst();
            this.recent[0] = first;
            return first;
        }

        this.bestGap = 0;
        this.refillPiece = 0;
        let slot;
        for (let roll = 0; roll < TI_ROLLS; roll++) {
            slot = this.rand(TI_POOL);
            if (!this.recent.includes(this.pool[slot])) break;
            this.refill(slot);
            slot = this.rand(TI_POOL); // a rejected roll draws again, and the next roll draws afresh
        }

        const piece = this.pool[slot];
        for (let p = 0; p < 7; p++) this.sinceDealt[p]++;
        this.sinceDealt[piece] = 0;
        this.refill(slot);
        this.recent.pop();
        this.recent.unshift(piece);
        return piece;
    }
}

// ----------------------------------------------------------
// TAP (TGM2) randomizer: a piece is rolled up to six times to miss the last four dealt, the sixth
// roll taken as it comes. The history starts Z, Z, S, S and the first piece (never S, Z or O)
// replaces the first Z. The piece to deal is always rolled one deal ahead.
// TGM1's is the same with four rolls and a history of Z, Z, Z, Z (Tgm1Randomizer).

const TAP_ROLLS = 6;
const TGM1_ROLLS = 4; // TGM1: four rolls against a history that starts Z Z Z Z

class TapRandomizer extends TgmRandomizer {
    constructor(seed, rolls = TAP_ROLLS, history = [TGM_Z, TGM_S, TGM_S]) {
        super(seed);
        this.rolls = rolls;
        this.recent = [this.rollFirst(), ...history]; // newest first; the newest is the next to deal
    }

    nextIndex() {
        const dealt = this.recent[0];
        let piece;
        for (let roll = 0; roll < this.rolls - 1; roll++) {
            piece = this.rand(7);
            if (!this.recent.includes(piece)) break;
            piece = this.rand(7); // a rejected roll draws again, and the next roll draws afresh
        }
        this.recent.pop();
        this.recent.unshift(piece);
        return dealt;
    }
}

class Tgm1Randomizer extends TapRandomizer {
    constructor(seed) {
        super(seed, TGM1_ROLLS, [TGM_Z, TGM_Z, TGM_Z]);
    }
}

// ----------------------------------------------------------
// GB randomizer: a piece is rolled up to three times while it would make three of a kind with the
// two before it, the last roll taken as it comes. The game tests this by ORing the three pieces'
// data values (L J I O Z S T = 0, 4, ..., 24) and comparing with the oldest of them, the piece
// entering play as the roll is made (the game keeps a hidden piece behind the preview, as the queue
// does here), so a roll is also refused whenever its bits and the preview's fit inside that piece's:
// L comes up least often. From the disassembly (vinheim3/tetris-gb-disasm, $2041-$2060) and TASVideos
// submission 4536; the game seeds from its DIV timer, here from the shared generator.

const GB_PIECES = [tetL, tetJ, tetI, tetO, tetZ, tetS, tetT];
const GB_ROLLS = 3;

class GbRandomizer extends LcgRandomizer {
    constructor(seed) {
        super(seed, GB_PIECES);
        this.history = []; // the previous piece, then the one before it (indices into GB_PIECES)
    }

    nextIndex() {
        const [prev, before] = this.history;
        let piece;
        for (let roll = 0; roll < GB_ROLLS; roll++) {
            piece = this.rand(7);
            if (this.history.length < 2 || (piece | prev | before) !== before) break;
        }
        this.history = [piece, prev];
        return piece;
    }
}

// ----------------------------------------------------------
// NES randomizer: a roll of 0-7 is taken unless it is 7 (no piece) or the previous piece; then a
// second roll of 0-6 is taken as it comes. The NES reads its rolls from a 16-bit LFSR that runs
// every frame; here they come from the shared generator.

const NES_PIECES = [tetT, tetJ, tetZ, tetO, tetS, tetL, tetI]; // the game's order

class NesRandomizer extends LcgRandomizer {
    constructor(seed) {
        super(seed, NES_PIECES);
        this.prev = -1;
    }

    nextIndex() {
        let piece = this.rand(8);
        if (piece === 7 || piece === this.prev) piece = this.rand(7);
        this.prev = piece;
        return piece;
    }
}
