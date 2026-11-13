import type { Evolution, RangedWeapon } from './constants';
import { segmentRect, type Rect } from './world';

export const abilities = (evolution: Evolution) => ({ claw: evolution >= 1, dash: evolution >= 1, pressure: evolution >= 1, heat: evolution === 2, scuttle: evolution === 2 });
export function meleeReach(evolution: Evolution, finisher: boolean): number { return evolution === 0 ? (finisher ? 128 : 102) : (finisher ? 210 : 175); }
export const isSwimmer = (kind: string): boolean => ['jellyfish', 'shark', 'angler'].includes(kind);
export const isLostDiver = (kind: string): boolean => kind === 'handcrab' || kind === 'hermit';
export const rangedWeapon = (p: { evolution: Evolution; harpoon: boolean }): RangedWeapon => p.evolution === 2 ? 'bubble' : p.harpoon ? 'harpoon' : 'none';

/** Sweep the whole player body, not only its center, through terrain. */
export function sweepBody(ax: number, ay: number, bx: number, by: number, width: number, height: number, geometry: Rect[]): number | null {
    let earliest: number | null = null;
    for (const r of geometry) {
        const t = segmentRect(ax, ay, bx, by, { x: r.x - width / 2 + 0.5, y: r.y - height / 2 + 0.5, w: r.w + width - 1, h: r.h + height - 1 });
        if (t !== null && (earliest === null || t < earliest)) earliest = t;
    }
    return earliest;
}
export interface RopePoint { x: number; y: number }
/** Slack sags and oscillates; tension straightens the cable during a pull. */
export function tetherPoints(a: RopePoint, b: RopePoint, slack: number, time: number): RopePoint[] {
    const distance = Math.hypot(b.x - a.x, b.y - a.y), sag = Math.min(75, distance * 0.13) * slack;
    return Array.from({ length: 17 }, (_, i) => {
        const t = i / 16, wave = Math.sin(Math.PI * t);
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t + wave * sag + Math.sin(t * Math.PI * 4 + time * 5) * wave * 2 * slack };
    });
}
