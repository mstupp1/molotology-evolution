import { describe, expect, it } from 'vitest';
import { beamIntensity, causticStrength, Flicker, grainStrength, roomDarkness, type Beam } from './lighting';
import type { RoomTheme } from './rendering';

const theme = (patch: Partial<RoomTheme>): RoomTheme => ({ tint: 0, fog: 0, accent: 0, darkness: 0.4, rays: 3, rayColor: 0, flip: false, coral: [], chains: 0, ...patch });
const beam: Beam = { x: 100, y: 100, angle: 0, reach: 500, spread: 0.37, halo: 200, power: 1 };

describe('helmet beam', () => {
    it('lights motes inside the cone and fades them with distance', () => {
        const near = beamIntensity(beam, 150, 100), far = beamIntensity(beam, 480, 100);
        expect(near).toBeGreaterThan(far);
        expect(far).toBeGreaterThan(0);
        expect(beamIntensity(beam, 700, 100)).toBe(0);
    });
    it('leaves the dark behind the diver, apart from the small halo', () => {
        expect(beamIntensity(beam, -250, 100)).toBe(0);
        expect(beamIntensity(beam, 0, 100)).toBeGreaterThan(0);
        expect(beamIntensity(beam, 0, 100)).toBeLessThan(beamIntensity(beam, 200, 100));
    });
    it('wraps the beam angle so aiming left works', () => {
        expect(beamIntensity({ ...beam, angle: Math.PI - 0.01 }, 0, 101)).toBeGreaterThan(0.5);
    });
    it('dims everything when the lamp fails', () => {
        expect(beamIntensity({ ...beam, power: 0.2 }, 150, 100)).toBeCloseTo(beamIntensity(beam, 150, 100) * 0.2);
    });
});

describe('room atmosphere', () => {
    it('gives lightless rooms no caustics and keeps caustics faint elsewhere', () => {
        expect(causticStrength(theme({ rays: 0 }))).toBe(0);
        expect(causticStrength(theme({ rays: 6 }))).toBeLessThanOrEqual(0.22);
        expect(causticStrength(theme({ rays: 5 }))).toBeGreaterThan(causticStrength(theme({ rays: 1 })));
    });
    it('makes darker rooms grainier and darker, within readable limits', () => {
        expect(grainStrength(theme({ darkness: 0.6 }))).toBeGreaterThan(grainStrength(theme({ darkness: 0.3 })));
        expect(grainStrength(theme({ darkness: 1 }))).toBeLessThanOrEqual(0.09);
        expect(roomDarkness(theme({ darkness: 0.4 }))).toBeGreaterThan(0.4);
        expect(roomDarkness(theme({ darkness: 0.9 }))).toBeLessThanOrEqual(0.72);
    });
});

describe('flickering lights', () => {
    const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    it('stays lit through its calm, then gutters and recovers', () => {
        const f = new Flicker(seeded(7), [2, 2]);
        for (let t = 0; t < 1.9; t += 0.05) expect(f.update(0.05)).toBe(1);
        const levels: number[] = [];
        for (let t = 0; t < 1.5; t += 0.02) levels.push(f.update(0.02));
        expect(Math.min(...levels)).toBeLessThan(0.5);
        expect(levels.at(-1)).toBe(1);
    });
    it('gutters sooner as urgency rises', () => {
        const calm = new Flicker(seeded(3), [6, 6]), urgent = new Flicker(seeded(3), [6, 6]);
        let calmFirst = -1, urgentFirst = -1;
        for (let i = 0; i < 400; i++) {
            if (calmFirst < 0 && calm.update(0.02) < 1) calmFirst = i;
            if (urgentFirst < 0 && urgent.update(0.02, 1) < 1) urgentFirst = i;
        }
        expect(urgentFirst).toBeGreaterThan(-1);
        expect(calmFirst < 0 || urgentFirst < calmFirst).toBe(true);
    });
});
