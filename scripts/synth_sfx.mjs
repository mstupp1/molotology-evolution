// Synthesizes the v2 sound cues as small mono WAV files (no external tools required).
// Usage: node scripts/synth_sfx.mjs [outDir]
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RATE = 22050;
const out = process.argv[2] ?? 'public/assets';
let seed = 1337;
const noise = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x3fffffff - 1; };
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));
function lowpass(samples, k) { let y = 0; return samples.map(x => (y += k * (x - y))); }
function render(seconds, fn) { const n = Math.floor(seconds * RATE); const s = new Float32Array(n); for (let i = 0; i < n; i++) s[i] = fn(i / RATE, i); return s; }
function wav(name, samples, gain = 0.8) {
    let peak = 0; for (const v of samples) peak = Math.max(peak, Math.abs(v));
    const n = samples.length, buffer = Buffer.alloc(44 + n * 2);
    buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + n * 2, 4); buffer.write('WAVE', 8); buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(RATE, 24);
    buffer.writeUInt32LE(RATE * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write('data', 36); buffer.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) {
        const fade = Math.min(1, (n - i) / (RATE * 0.01));
        buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i] / (peak || 1) * gain * fade)) * 32767), 44 + i * 2);
    }
    writeFileSync(join(out, `${name}.wav`), buffer);
}
// Soft bubbly push off the deck.
wav('jump', render(0.22, t => Math.sin(2 * Math.PI * (260 + 900 * t) * t) * env(t, 0.005, 0.06) * 0.6 + noise() * env(t, 0.002, 0.03) * 0.3), 0.55);
// Muffled boot thud on iron.
wav('land', lowpass(render(0.2, t => Math.sin(2 * Math.PI * (90 - 120 * t) * t) * env(t, 0.002, 0.05) + noise() * env(t, 0.001, 0.02) * 0.6), 0.25), 0.7);
// Water-rush whoosh.
wav('dash', lowpass(render(0.32, t => noise() * Math.sin(Math.PI * t / 0.32) ** 2), 0.18).map((v, i) => v * (0.6 + 0.4 * Math.sin(i / RATE * 2 * Math.PI * 30))), 0.7);
// Shimmering three-note chime.
wav('pickup', render(1.1, t => [523.25, 659.25, 987.77].reduce((a, f, k) => a + (t > k * 0.09 ? Math.sin(2 * Math.PI * f * (t - k * 0.09)) * env(t - k * 0.09, 0.005, 0.35) * (1 + 0.3 * Math.sin(2 * Math.PI * 6 * t)) : 0), 0)), 0.6);
// Heavy bulkhead: low clank and grind.
wav('door', lowpass(render(0.6, t => Math.sin(2 * Math.PI * 70 * t) * env(t, 0.003, 0.12) + Math.sin(2 * Math.PI * 213 * t) * env(t, 0.002, 0.05) * 0.5 + noise() * env(t, 0.05, 0.2) * 0.35), 0.3), 0.65);
// Wet squelch and pop for creature deaths.
wav('kill', lowpass(render(0.45, t => Math.sin(2 * Math.PI * (320 - 520 * t) * t) * env(t, 0.004, 0.09) + noise() * env(t, 0.002, 0.07) * 0.7), 0.35), 0.75);
// Player hurt: dull hit with a choked exhale.
wav('hurt', lowpass(render(0.35, t => Math.sin(2 * Math.PI * (150 - 160 * t) * t) * env(t, 0.002, 0.07) + noise() * env(t, 0.01, 0.08) * 0.5), 0.3), 0.7);
// Boss roar: detuned low saws with a slow swell.
wav('roar', lowpass(render(1.8, t => { const f = 48 + 10 * Math.sin(2 * Math.PI * 3 * t); let v = 0; for (const d of [1, 1.013, 0.987, 2.01]) v += ((f * d * t) % 1) * 2 - 1; return (v / 4 + noise() * 0.25) * env(t, 0.35, 0.6); }), 0.12), 0.85);
console.log('wrote sfx to', out);
