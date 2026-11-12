import { describe, it, expect } from 'vitest';
import { abilities, isSwimmer, meleeReach, sweepBody, tetherPoints } from './mechanics';
import { ROOMS, ROOM_IDS } from './world';

describe('evolution abilities and the complete demo route', () => {
    it('grants claw, directional dash and pressure on molt one; heat and scuttle on the final molt', () => {
        expect(abilities(0)).toEqual({ claw: false, dash: false, pressure: false, heat: false, scuttle: false });
        expect(abilities(1)).toEqual({ claw: true, dash: true, pressure: true, heat: false, scuttle: false });
        expect(abilities(2)).toEqual({ claw: true, dash: true, pressure: true, heat: true, scuttle: true });
        expect(meleeReach(1, false)).toBeGreaterThan(meleeReach(0, true));
    });
    it('exposes all seven species on the main route, plus breakable progression and volcanic heat', () => {
        const kinds = new Set(ROOM_IDS.filter(id => !['handcrab', 'hermit'].includes(id)).flatMap(id => ROOMS[id].enemies.map(e => e.kind)));
        expect([...kinds].sort()).toEqual(['angler', 'handcrab', 'hermit', 'jellyfish', 'octopus', 'shark', 'urchin']);
        expect(ROOMS.pressure.obstacles?.length).toBeGreaterThan(0);
        expect(ROOMS.furnace.heat?.length).toBeGreaterThan(0);
        expect(ROOMS.caldera.platforms.some(p => p.h < 50 && p.w > 1000)).toBe(true);
        expect(isSwimmer('shark')).toBe(true); expect(isSwimmer('jellyfish')).toBe(true); expect(isSwimmer('angler')).toBe(true); expect(isSwimmer('hermit')).toBe(false);
    });
});
describe('harpoon body clearance and tether', () => {
    it('blocks a player shoulder clipping a thin ceiling even with a clear center line', () => {
        expect(sweepBody(0, 50, 200, 50, 36, 86, [{ x: 90, y: 0, w: 10, h: 20 }])).not.toBeNull();
        expect(sweepBody(0, 80, 200, 80, 36, 86, [{ x: 90, y: 0, w: 10, h: 20 }])).toBeNull();
    });
    it('keeps cable endpoints attached and reduces sag under tension', () => {
        const a = { x: 10, y: 20 }, b = { x: 510, y: 20 }, slack = tetherPoints(a, b, 1, 0), taut = tetherPoints(a, b, 0.05, 0);
        expect(slack[0]).toEqual(a); expect(slack.at(-1)?.x).toBe(b.x); expect(slack.at(-1)?.y).toBeCloseTo(b.y);
        expect(slack[8].y).toBeGreaterThan(taut[8].y + 40);
    });
});
