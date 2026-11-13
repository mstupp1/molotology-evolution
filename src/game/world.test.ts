import { describe, expect, it } from 'vitest';
import { collect, newProgress } from './model';
import { meetsRequirement, ROOMS, ROOM_IDS, segmentRect, type RoomId } from './world';

describe('shipwreck progression', () => {
    it('contains fourteen main rooms, two secrets, unique map positions, unique enemy IDs and reciprocal connections', () => {
        expect(ROOM_IDS).toHaveLength(16);
        expect(new Set(ROOM_IDS.map(id => ROOMS[id].map.join(','))).size).toBe(16);
        for (const r of Object.values(ROOMS)) {
            for (const d of r.doors) { expect(ROOMS[d.to].doors.some(back => back.to === r.id), `${r.id} -> ${d.to}`).toBe(true); }
            expect(new Set(r.enemies.map(e => e.id)).size).toBe(r.enemies.length);
            for (const p of r.pickups) expect(r.platforms.some(platform => p.x >= platform.x && p.x <= platform.x + platform.w && Math.abs(p.y - platform.y) < 90), p.id).toBe(true);
        }
    });
    it('can acquire every required ability before its gate and reach the Angler', () => {
        const progress = newProgress(), visited = new Set<RoomId>(['hull']);
        for (let iteration = 0; iteration < 20; iteration++) {
            for (const id of [...visited]) {
                for (const p of ROOMS[id].pickups) if (meetsRequirement(p.requires, progress)) collect(progress, p.id, p.kind);
                for (const d of ROOMS[id].doors) if (meetsRequirement(d.requires, progress)) visited.add(d.to);
            }
        }
        expect(progress.harpoon).toBe(true); expect(progress.evolution).toBe(2); expect(progress.key).toBe(true);
        expect(visited.size).toBe(16); expect(visited.has('angler')).toBe(true);
    });
    it('does not allow shortcuts to bypass the intended ability order', () => {
        const p = newProgress();
        expect(meetsRequirement('harpoon', p)).toBe(false); expect(meetsRequirement('pressure', p)).toBe(false);
        collect(p, 'harpoon', 'harpoon'); expect(meetsRequirement('harpoon', p)).toBe(true); expect(meetsRequirement('pressure', p)).toBe(false);
        collect(p, 'breach', 'breach'); expect(meetsRequirement('pressure', p)).toBe(true); expect(meetsRequirement('dash', p)).toBe(true); expect(meetsRequirement('heat', p)).toBe(false);
        collect(p, 'infestation', 'infestation'); expect(meetsRequirement('heat', p)).toBe(true); expect(meetsRequirement('key', p)).toBe(false);
    });
    it('places the mandatory grapple anchor on a clear approach beside its landing platform', () => {
        const room = ROOMS.bell, anchor = room.anchors[0];
        expect(room.platforms.every(p => segmentRect(900, 805, anchor.x, anchor.y, p) === null)).toBe(true);
        expect(room.platforms.some(p => p.y > anchor.y && p.y - anchor.y < 160 && p.x - anchor.x < 140)).toBe(true);
    });
});
describe('vital pearls and platform clearance', () => {
    it('hides four main-route pearls and one heat-gated Cargo pearl', () => {
        const pearls = ROOM_IDS.flatMap(id => ROOMS[id].pickups.filter(p => p.kind === 'health').map(p => p.id));
        expect(pearls.sort()).toEqual(['pearl:cargo', 'pearl:cargo-thermal', 'pearl:chapel', 'pearl:quarters', 'pearl:rigging']);
    });
    it('leaves room for the 86 px player body between every pair of stacked platforms', () => {
        for (const id of ROOM_IDS) {
            const ps = ROOMS[id].platforms;
            for (const a of ps) for (const b of ps) {
                if (a === b || b.y <= a.y || a.x >= b.x + b.w || b.x >= a.x + a.w) continue;
                const gap = b.y - (a.y + a.h);
                // Zero-gap iron ribs intentionally join the climbable Caldera vault.
                if (gap > 0 && a.h < 100) expect(gap, `${id}: ${a.x},${a.y} over ${b.x},${b.y}`).toBeGreaterThan(90);
            }
        }
    });
    it('lands a chapel grapple on the pearl ledge', () => {
        const room = ROOMS.chapel, a = room.anchors[0];
        const landing = room.platforms.filter(r => r.y > a.y + 20 && r.y < a.y + 160 && a.x >= r.x - 140 && a.x <= r.x + r.w + 140).sort((r, q) => r.y - q.y)[0];
        const pearl = room.pickups.find(p => p.kind === 'health')!;
        expect(landing).toBeDefined(); expect(pearl.x).toBeGreaterThanOrEqual(landing.x); expect(pearl.x).toBeLessThanOrEqual(landing.x + landing.w);
    });
});
describe('swept collision for tethers and line of sight', () => {
    const wall = { x: 50, y: 0, w: 10, h: 100 };
    it('detects thin walls even when a projectile crosses them in one frame', () => expect(segmentRect(0, 50, 200, 50, wall)).toBe(0.25));
    it('accepts clear parallel paths and rejects blocked ones', () => { expect(segmentRect(20, 0, 20, 100, wall)).toBeNull(); expect(segmentRect(55, -50, 55, 150, wall)).toBe(0.25); });
    it('reports a projectile starting within geometry immediately', () => expect(segmentRect(55, 50, 100, 50, wall)).toBe(0));
});
