import type { RoomTheme } from './rendering';

/** Pure lighting rules shared by the room renderer and its tests (no Phaser here). */

/** The helmet beam, in screen pixels. */
export interface Beam { x: number; y: number; angle: number; reach: number; spread: number; halo: number; power: number }

const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * How strongly a screen point sits inside the beam, from 0 (outside) to 1 (at the lens).
 * The cone and the halo around the diver both count.
 */
export function beamIntensity(beam: Beam, x: number, y: number): number {
    const dx = x - beam.x, dy = y - beam.y, dist = Math.hypot(dx, dy);
    let lit = 0;
    if (dist < beam.halo) lit = (1 - dist / beam.halo) * 0.6;
    if (dist < beam.reach && dist > 1) {
        const off = Math.abs(wrapAngle(Math.atan2(dy, dx) - beam.angle));
        if (off < beam.spread) lit = Math.max(lit, (1 - dist / beam.reach) ** 0.6 * (1 - (off / beam.spread) ** 2));
    }
    return lit * beam.power;
}

/** Caustic strength per room: chambers with more surface light ripple more; lightless holds get none. */
export function causticStrength(theme: RoomTheme): number {
    return theme.rays <= 0 ? 0 : Math.min(0.22, 0.08 + theme.rays * 0.025);
}

/** Film grain strength: the darker the chamber, the grainier the footage. */
export function grainStrength(theme: RoomTheme): number {
    return Math.min(0.09, 0.035 + theme.darkness * 0.07);
}

/** Ambient darkness after the horror pass: dark rooms get darker, so fixed lights and the helmet lamp carry them. */
export function roomDarkness(theme: RoomTheme): number { return Math.min(0.72, theme.darkness * 1.14); }

/**
 * A failing light: steady most of the time, then a short burst of stutters.
 * `level` is 1 when lit and drops toward 0 while it gutters.
 */
export class Flicker {
    level = 1;
    private wait: number;
    private burst = 0;
    private hold = 0;
    constructor(private random: () => number = Math.random, private calm: [number, number] = [4, 12], private dim = 0.12) {
        this.wait = calm[0] + random() * (calm[1] - calm[0]);
    }
    /** `urgency` (0 to 1) shortens the calm between bursts. */
    update(dt: number, urgency = 0): number {
        if (this.burst > 0) {
            this.burst -= dt; this.hold -= dt;
            if (this.hold <= 0) { this.level = this.level < 1 ? 1 : this.dim + this.random() * 0.25; this.hold = 0.03 + this.random() * 0.12; }
            if (this.burst <= 0) this.level = 1;
            return this.level;
        }
        this.wait -= dt * (1 + urgency * 6);
        if (this.wait <= 0) {
            this.burst = 0.25 + this.random() * 0.7; this.hold = 0;
            this.wait = this.calm[0] + this.random() * (this.calm[1] - this.calm[0]);
        }
        return this.level;
    }
}
