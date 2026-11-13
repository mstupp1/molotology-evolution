import { describe, expect, it } from 'vitest';
import { chooseAttack, hookLanes, segmentHits, specialActive, specialSegments, spewMouth, type SpecialAttack } from './specialAttacks';
import { ROOMS } from './world';
import { unfinishedSecret } from './secrets';
import { decodeSave, newProgress } from './model';

describe('distinct lost-diver attacks', () => {
    it('dispatches by visual identity and alternates specials with leaps', () => {
        const specs = ['handcrab', 'hermit', 'rigging', 'molt'].map(id => Object.values(ROOMS).find(r => r.id === id)!.enemies.find(e => e.kind === 'handcrab' || e.kind === 'hermit')!);
        expect(specs.map(spec => Array.from({ length: 4 }, (_, i) => chooseAttack(spec, i)))).toEqual([
            ['chomp', 'leap', 'chomp', 'leap'], ['snip', 'leap', 'snip', 'leap'],
            ['leap', 'cable', 'leap', 'hooks'], ['spew', 'leap', 'spew', 'leap']
        ]);
    });
    it('mirrors jaw and claw closures and limits their active window', () => {
        for (const attack of ['chomp', 'snip'] as const) {
            const origin = { x: 1000, y: 500 };
            const right = specialSegments(attack, origin, { x: 1400, y: 500 }, 1, 0.5);
            const left = specialSegments(attack, origin, { x: 600, y: 500 }, -1, 0.5);
            right.forEach((s, i) => { expect(s.b.x + left[i].b.x).toBe(2000); expect(s.b.y).toBe(left[i].b.y); });
            expect(specialActive(attack, 0.15)).toBe(false); expect(specialActive(attack, 0.5)).toBe(true); expect(specialActive(attack, 0.9)).toBe(false);
            expect(right.some(s => segmentHits(s, { x: 1200, y: 500, w: 36, h: 86 }))).toBe(true);
            expect(right.some(s => segmentHits(s, { x: 700, y: 500, w: 36, h: 86 }))).toBe(false);
        }
    });
    it('locks cable aim and leaves safe gaps between staggered hooks', () => {
        const origin = { x: 1400, y: 650 }, target = { x: 1000, y: 500 };
        const cable = specialSegments('cable', origin, target, -1, 0.5).at(-1)!;
        expect(cable.b.x).toBeLessThan(target.x); expect(cable.b.y).toBeLessThan(target.y);
        const hooks = specialSegments('hooks', origin, target, -1, 0.5);
        expect(hooks[0].b.y).toBeGreaterThan(hooks[1].b.y); expect(hooks[1].b.y).toBeGreaterThan(hooks[2].b.y);
        expect(hookLanes(1000)).toEqual([810, 1000, 1190]);
        expect(hooks.some(s => segmentHits(s, { x: 890, y: 600, w: 36, h: 86 }))).toBe(false);
        for (const attack of ['cable', 'hooks', 'spew'] as SpecialAttack[]) { expect(specialActive(attack, -0.1)).toBe(false); expect(specialActive(attack, 1.1)).toBe(false); }
    });
    it('attaches the spew to each moving chimney and mirrors it with the body', () => {
        for (let frame = 0; frame < 12; frame++) {
            const origin = { x: 1000, y: 500, scaleX: 1.3, scaleY: 1.2, frame: { name: frame } };
            const left = spewMouth(origin, -1), right = spewMouth(origin, 1);
            expect(left.x + right.x).toBe(2000); expect(left.y).toBe(right.y); expect(left.y).toBeLessThan(440);
        }
        expect(spewMouth({ x: 0, y: 0, frame: { name: 7 } }, -1)).not.toEqual(spewMouth({ x: 0, y: 0, frame: { name: 9 } }, -1));
    });
    it('clips every molten stream at the first solid surface', () => {
        const wall = { x: 120, y: -500, w: 10, h: 1000 };
        const segments = specialSegments('spew', { x: 0, y: 0 }, { x: 500, y: 0 }, 1, 0.5, [wall]);
        expect(segments.filter(segment => segment.end)).toHaveLength(3);
        expect(segments.every(segment => segment.b.x <= 120)).toBe(true);
        expect(segments.some(segment => segmentHits(segment, { x: 180, y: 0, w: 36, h: 86 }))).toBe(false);
    });
    it('moves Cinder beside the final molt while preserving defeated save IDs', () => {
        const cinder = ROOMS.molt.enemies.find(e => e.visual === 'cinder-diver')!;
        expect(cinder.id).toBe('caldera:hermit:2580'); expect(ROOMS.caldera.enemies.some(e => e.visual === 'cinder-diver')).toBe(false);
        expect(Math.abs(cinder.x - ROOMS.molt.pickups[0].x)).toBeLessThan(250);
        const p = newProgress(); p.harpoon = true; p.evolution = 2; p.defeated.push(cinder.id);
        expect(decodeSave(JSON.stringify(p))!.defeated).toContain(cinder.id);
        expect(ROOMS.molt.pickups[0].requires).toBeUndefined();
    });
});
describe('unfinished secrets', () => {
    it('keeps both entrance and secret room marked until its encounter is defeated', () => {
        for (const [parent, room] of [['cargo', 'handcrab'], ['pressure', 'hermit']] as const) {
            expect(unfinishedSecret(parent, [])).toBe(true); expect(unfinishedSecret(room, [])).toBe(true);
            const defeated = [ROOMS[room].enemies[0].id];
            expect(unfinishedSecret(parent, defeated)).toBe(false); expect(unfinishedSecret(room, defeated)).toBe(false);
        }
        expect(unfinishedSecret('rigging', [])).toBe(false);
    });
});
