import type { Charge } from './harpoonPhysics';
import { HARPOON } from './harpoonPhysics';
import type { Rect } from './world';

export const COMBAT = { tentacleReach: 380, diverFlight: 2.1, sharkRecovery: 0.45, sharkPatrol: 0.35, pulseRadius: 360, pulseCharge: 1.1, weakMultiplier: 1.5 } as const;
export const BUBBLE = { cooldown: 0.45, life: 1.2, minSpeed: 650, maxSpeed: 1050 } as const;
export function bubbleDamage(charge: Charge): number {
    const fraction = (charge.power - HARPOON.minPower) / (1 - HARPOON.minPower);
    return Math.round((32 + 22 * fraction) * (charge.perfect ? 1.6 : 1));
}
export const hitDamage = (base: number, weak: boolean): number => Math.round(base * (weak ? COMBAT.weakMultiplier : 1));
export const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export function tentacleTip(x: number, y: number, tx: number, ty: number, progress: number): { x: number; y: number } {
    const dx = tx - x, dy = ty - y, d = Math.hypot(dx, dy) || 1;
    const reach = COMBAT.tentacleReach * Math.sin(Math.PI * Math.max(0, Math.min(1, progress)));
    return { x: x + (dx || (dy ? 0 : -1)) / d * reach, y: y + dy / d * reach };
}
/** Sprite-sheet lantern centers in local 256px cells, including the moving strike poses. */
export const LANTERN_FRAMES: readonly (readonly [number, number])[] = [[35,103],[41,96],[42,89],[39,98],[33,114],[35,111],[35,115],[73,60],[33,82],[59,86],[37,101],[33,128]];
export function lanternRect(x: number, y: number, scaleX: number, scaleY: number, frame: number, flip: boolean): Rect {
    const [lx, ly] = LANTERN_FRAMES[frame] ?? LANTERN_FRAMES[0];
    const cx = x + (lx - 128) * scaleX * (flip ? -1 : 1), cy = y + (ly - 128) * scaleY;
    return { x: cx - 14 * scaleX, y: cy - 14 * scaleY, w: 28 * scaleX, h: 28 * scaleY };
}
