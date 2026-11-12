import { describe, expect, it } from 'vitest';
import { bolt, easeOutBack, perspective, project, randomDirection, rotate, sphereDirections } from './fx';

const seeded = (seed = 7) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

describe('2.5D effect helpers', () => {
    it('lightning keeps both ends fixed and gains detail each pass', () => {
        const path = bolt(10, 20, 210, 40, 0.3, 4, seeded());
        expect(path).toHaveLength(17);
        expect(path[0]).toEqual({ x: 10, y: 20 });
        expect(path.at(-1)).toEqual({ x: 210, y: 40 });
        // It wanders off the straight line but stays near it.
        const off = path.map(p => Math.abs((p.y - 20) - (p.x - 10) * 0.1));
        expect(Math.max(...off)).toBeGreaterThan(1);
        expect(Math.max(...off)).toBeLessThan(120);
    });
    it('things nearer the camera look larger and push outward', () => {
        expect(perspective(0)).toBe(1);
        expect(perspective(100)).toBeGreaterThan(1);
        expect(perspective(-100)).toBeLessThan(1);
        expect(Number.isFinite(perspective(10000))).toBe(true);
        const near = project(100, 100, { x: 50, y: 0, z: 80 }), far = project(100, 100, { x: 50, y: 0, z: -80 });
        expect(near.x).toBeGreaterThan(150); expect(far.x).toBeLessThan(150);
        expect(near.front).toBe(true); expect(far.front).toBe(false);
    });
    it('rotation preserves length and sphere directions are unit vectors', () => {
        const v = rotate({ x: 3, y: 4, z: 12 }, 1.1, 0.4);
        expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(13, 6);
        for (const d of [...sphereDirections(20), randomDirection(seeded())]) expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 6);
        const dirs = sphereDirections(40);
        expect(dirs.filter(d => d.z > 0).length).toBeGreaterThan(12);
        expect(dirs.filter(d => d.z < 0).length).toBeGreaterThan(12);
    });
    it('spines overshoot then settle', () => {
        expect(easeOutBack(0)).toBeCloseTo(0, 6);
        expect(easeOutBack(1)).toBeCloseTo(1, 6);
        expect(Math.max(...[0.5, 0.6, 0.7, 0.8].map(easeOutBack))).toBeGreaterThan(1);
    });
});
