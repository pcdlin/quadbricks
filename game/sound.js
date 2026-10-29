// Subtle synthesised sound effects (Web Audio API, no audio files).
// Browsers only allow audio after a user gesture, so the engine calls
// unlock() on key presses; until then play() is silent.

const SOUND_VOLUME = 0.5;
const SOUND_MOVE_GAP = 0.035; // s between move ticks, so auto-repeat doesn't buzz
const SOUND_ZAP_GAP = 0.05; // s between zaps: an attack item zaps on both sides of a two-player match
const SOUND_MUTE_KEY = "quadbricks.muted";
// A minor 7th chord tones over three octaves; a clear plays lines+1 of them, starting
// one chord tone higher for every step of a combo
const CLEAR_NOTES = [220.00, 261.63, 329.63, 392.00, 440.00, 523.25, 659.25, 783.99, 880.00, 1046.50, 1318.51];
const CLEAR_MAX_COMBO_STEP = 6; // combos beyond this keep the same pitch
const MEDAL_NOTES = [1046.50, 1318.51, 1567.98, 2093.00]; // C major up to the octave

class Sound {
    constructor() {
        this.ctx = null;
        this.lastMove = 0;
        this.lastZap = 0;
        this.muted = false;
        try { this.muted = localStorage.getItem(SOUND_MUTE_KEY) === "1"; } catch (e) { /* storage unavailable */ }
    }

    unlock() {
        if (!this.ctx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;
            this.ctx = new AudioContextClass();
            // master volume through a gentle low-pass keeps everything soft
            this.master = this.ctx.createGain();
            this.master.gain.value = SOUND_VOLUME;
            const soften = this.ctx.createBiquadFilter();
            soften.type = "lowpass";
            soften.frequency.value = 6000;
            this.master.connect(soften);
            soften.connect(this.ctx.destination);
            // one second of white noise, reused for thumps and swishes
            this.noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
            const data = this.noiseBuffer.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        }
        if (this.ctx.state === "suspended") this.ctx.resume();
    }

    toggleMute() {
        this.muted = !this.muted;
        try { localStorage.setItem(SOUND_MUTE_KEY, this.muted ? "1" : "0"); } catch (e) { /* storage unavailable */ }
    }

    play(name) {
        if (this.muted || !this.ctx || this.ctx.state !== "running") return;
        const t = this.ctx.currentTime;
        switch (name) {
            case "move":
                if (t - this.lastMove < SOUND_MOVE_GAP) return;
                this.lastMove = t;
                this.tone(t, 620, 540, 0.035, 0.045, "triangle");
                break;
            case "rotate":
                this.tone(t, 880, 1040, 0.045, 0.035, "triangle");
                break;
            case "lock":
                this.tone(t, 180, 120, 0.08, 0.10, "sine");
                break;
            case "harddrop":
            case "sonic":
                this.tone(t, 160, 60, 0.14, 0.20, "sine");
                this.noise(t, 0.05, "lowpass", 900, 0.06);
                break;
            case "count": // countdown 3, 2, 1
                this.tone(t, 660, 660, 0.09, 0.06, "sine");
                break;
            case "go": // first frame that takes input
                this.tone(t, 1320, 1320, 0.16, 0.06, "sine");
                break;
            case "garbage": // versus garbage rising: a low grinding rumble
                this.tone(t, 70, 110, 0.22, 0.16, "sawtooth");
                this.noise(t, 0.2, "lowpass", 500, 0.07);
                break;
            case "attack": // versus: lines sent to the other side, a quick rising whoosh
                this.noise(t, 0.16, "bandpass", 2400, 0.035);
                this.tone(t, 500, 1100, 0.12, 0.03, "triangle");
                break;
            case "zap": // an item used: an electric zap, a fast falling buzz with a crackle
                if (t - this.lastZap < SOUND_ZAP_GAP) return;
                this.lastZap = t;
                this.tone(t, 2200, 140, 0.18, 0.03, "sawtooth");
                this.tone(t, 2330, 150, 0.18, 0.02, "square"); // detuned against it: the buzz
                this.noise(t, 0.1, "highpass", 2500, 0.035);
                break;
            case "ko": // versus: the other side topped out
                this.tone(t, 990, 990, 0.12, 0.06, "sine");
                this.tone(t + 0.1, 1320, 1320, 0.25, 0.06, "sine");
                break;
            default: {
                const clear = /^clear(\d)(?:c(\d+))?$/.exec(name); // "clear2" or "clear2c3"
                if (clear) this.lineClear(t, Number(clear[1]), Number(clear[2] || 0));
                const medal = /^medal(\d)$/.exec(name); // a medal earned or raised to tier 1-3
                if (medal) this.medal(t, Number(medal[1]));
            }
        }
    }

    // Short pitched blip with a quick fade
    tone(t, from, to, duration, gain, type) {
        const osc = this.ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(from, t);
        osc.frequency.exponentialRampToValueAtTime(to, t + duration);
        const env = this.envelope(t, 0.004, duration, gain);
        osc.connect(env);
        osc.start(t);
        osc.stop(t + duration + 0.02);
    }

    // Filtered noise burst
    noise(t, duration, filterType, frequency, gain) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = filterType;
        filter.frequency.value = frequency;
        const env = this.envelope(t, 0.005, duration, gain);
        src.connect(filter);
        filter.connect(env);
        src.start(t);
        src.stop(t + duration + 0.02);
    }

    // Muted bell: filtered triangle plus a soft sub-octave, slow decay
    bell(t, frequency, gain) {
        const muffle = this.ctx.createBiquadFilter();
        muffle.type = "lowpass";
        muffle.frequency.value = 1400;
        muffle.connect(this.master);
        for (const [mult, level, type] of [[1, 1, "triangle"], [0.5, 0.35, "sine"]]) {
            const osc = this.ctx.createOscillator();
            osc.type = type;
            osc.frequency.value = frequency * mult;
            const env = this.envelope(t, 0.012, 0.75, gain * level, muffle);
            osc.connect(env);
            osc.start(t);
            osc.stop(t + 0.8);
        }
    }

    // Rising minor arpeggio: two notes for a single, five for a tetris. In a combo it starts
    // higher, plays a little faster and louder with every step
    lineClear(t, lines, combo = 0) {
        const step = Math.min(combo, CLEAR_MAX_COMBO_STEP);
        const gain = (lines === 4 ? 0.075 : 0.06) * (1 + 0.05 * step);
        const gap = 0.07 - 0.004 * step;
        for (let i = 0; i <= lines; i++) this.bell(t + i * gap, CLEAR_NOTES[step + i], gain);
        this.noise(t, 0.3, "bandpass", 1200, 0.02); // low swish under the confetti
        // Low thud with a soft click of body, fuller for more lines
        this.tone(t, 100, 40, 0.28, 0.22 + 0.03 * lines, "sine");
        this.noise(t, 0.08, "lowpass", 300, 0.08 + 0.01 * lines);
    }

    // A medal: a bright rising chime, a note more for each tier (bronze two, gold four)
    medal(t, tier) {
        for (let i = 0; i <= tier; i++) {
            const f = MEDAL_NOTES[i];
            this.tone(t + i * 0.075, f, f, 0.32, 0.045, "sine");
            this.tone(t + i * 0.075, f * 2, f * 2, 0.18, 0.012, "triangle"); // a little shine above it
        }
    }

    envelope(t, attack, duration, gain, destination = this.master) {
        const env = this.ctx.createGain();
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(gain, t + attack);
        env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
        env.connect(destination);
        return env;
    }
}
