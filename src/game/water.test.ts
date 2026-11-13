import { describe, expect, it } from 'vitest';
import { ROOMS } from './world';
import { breathable, isFlooded, stepWaterline, stranded, targetWaterline, toggleFlood, WATERLINE } from './water';

// Player physics (Player.ts): water jump 455 px/s under 430 gravity, air jump 545 under 1300.
const jumpHeight = (v: number, g: number) => v * v / (2 * g);
const WATER_JUMP = jumpHeight(455, 430), AIR_JUMP = jumpHeight(545, 1300);

describe('flood and drain', () => {
    it('stores a toggle per room and leaves valveless rooms submerged', () => {
        const opened: string[] = [];
        expect(isFlooded(ROOMS.bilge, opened)).toBe(true);
        expect(toggleFlood(ROOMS.bilge, opened)).toBe(false);
        expect(targetWaterline(ROOMS.bilge, opened)).toBe(WATERLINE.drained);
        expect(toggleFlood(ROOMS.bilge, opened)).toBe(true);
        expect(opened).toEqual([]);
        expect(targetWaterline(ROOMS.hull, opened)).toBe(-Infinity);
        expect(breathable(ROOMS.hull, 1000, 800, -Infinity)).toBe(false);
    });
    it('moves the surface at a steady rate and stops exactly on target', () => {
        expect(stepWaterline(70, 828, 1)).toBe(330);
        expect(stepWaterline(820, 828, 1)).toBe(828);
        expect(stepWaterline(-Infinity, 70, 0.016)).toBe(70);
    });
    it('lets the diver breathe above the line and in air pockets', () => {
        expect(breathable(ROOMS.bilge, 1000, 807, WATERLINE.drained)).toBe(true);
        expect(breathable(ROOMS.bilge, 1000, 807, WATERLINE.flooded)).toBe(false);
        expect(breathable(ROOMS.bell, 1000, 807, -Infinity)).toBe(true);
    });
    it('strands swimmers above the surface without flickering at the line', () => {
        expect(stranded(500, WATERLINE.drained)).toBe(true);
        expect(stranded(500, WATERLINE.flooded)).toBe(false);
        expect(stranded(WATERLINE.drained + 2, WATERLINE.drained, true)).toBe(true);
        expect(stranded(WATERLINE.drained + 2, WATERLINE.drained, false)).toBe(false);
    });
    it('makes the Bilge stair climbable only when flooded', () => {
        const steps = ROOMS.bilge.platforms.filter(p => p.h < 100 && p.x < 2000).sort((a, b) => b.y - a.y);
        let floor = 850;
        for (const step of steps) {
            const rise = floor - step.y;
            expect(rise, `${step.x}`).toBeLessThan(WATER_JUMP);
            expect(rise, `${step.x}`).toBeGreaterThan(AIR_JUMP + 60);
            floor = step.y;
        }
        const pearl = ROOMS.bilge.pickups[0];
        expect(Math.abs(pearl.y - steps[steps.length - 1].y)).toBeLessThan(90);
    });
});
