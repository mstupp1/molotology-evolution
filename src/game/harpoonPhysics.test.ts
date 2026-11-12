import { describe, it, expect } from 'vitest';
import { chargeAt, HARPOON, launchSpeed, predictArc, reelSpeed, Rope, shotDamage, stepProjectile } from './harpoonPhysics';

const range = (held: number, angle = 0) => {
    const v = launchSpeed(chargeAt(held));
    const { points } = predictArc({ x: 0, y: 0, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v }, []);
    return points[points.length - 1];
};

describe('harpoon charge', () => {
    it('a tap still fires, and holding longer builds to full power', () => {
        expect(chargeAt(0).power).toBeCloseTo(HARPOON.minPower);
        expect(chargeAt(0.3).power).toBeGreaterThan(chargeAt(0.1).power);
        expect(chargeAt(HARPOON.chargeTime).power).toBe(1);
        expect(chargeAt(5).power).toBe(1);
    });
    it('opens the perfect window exactly as the charge tops out, and closes it after', () => {
        expect(chargeAt(HARPOON.chargeTime - 0.02).perfect).toBe(false);
        expect(chargeAt(HARPOON.chargeTime + 0.01).perfect).toBe(true);
        expect(chargeAt(HARPOON.chargeTime + HARPOON.perfectWindow - 0.01).perfect).toBe(true);
        expect(chargeAt(HARPOON.chargeTime + HARPOON.perfectWindow + 0.02)).toMatchObject({ perfect: false, full: true });
    });
    it('rewards a perfect release with more damage and speed than overholding', () => {
        const perfect = chargeAt(HARPOON.chargeTime + 0.05), over = chargeAt(2);
        expect(shotDamage(40, perfect)).toBe(Math.round(40 * HARPOON.perfectDamage));
        expect(shotDamage(40, over)).toBe(40);
        expect(shotDamage(40, chargeAt(0))).toBeLessThan(shotDamage(40, over));
        expect(launchSpeed(perfect)).toBeGreaterThan(launchSpeed(over));
    });
});

describe('underwater flight', () => {
    it('range grows with charge: a tap is short, a full charge crosses most of a screen', () => {
        const tap = range(0), half = range(0.25), full = range(2);
        expect(tap.x).toBeGreaterThan(120); expect(tap.x).toBeLessThan(260);
        expect(half.x).toBeGreaterThan(tap.x + 150);
        expect(full.x).toBeGreaterThan(780); expect(full.x).toBeLessThan(HARPOON.maxLine);
    });
    it('drag bleeds speed and the shaft sinks, so a level shot droops into an arc', () => {
        const full = range(2);
        expect(full.y).toBeGreaterThan(60); expect(full.y).toBeLessThan(180);
        let p = { x: 0, y: 0, vx: 1500, vy: 0 };
        const speeds: number[] = [];
        for (let i = 0; i < 30; i++) { p = stepProjectile(p, 1 / 60); speeds.push(Math.hypot(p.vx, p.vy)); }
        // Fast shafts lose speed faster than slow ones (quadratic drag).
        expect(speeds[0] - speeds[1]).toBeGreaterThan(speeds[28] - speeds[29]);
        expect(p.vy).toBeGreaterThan(0);
    });
    it('stops the preview at terrain', () => {
        const { points, hit } = predictArc({ x: 0, y: 0, vx: 1200, vy: 0 }, [{ x: 300, y: -100, w: 40, h: 300 }]);
        expect(hit).toBe(true); expect(points[points.length - 1].x).toBeCloseTo(300, 0);
    });
});

describe('verlet rope', () => {
    const settle = (rope: Rope, gun: { x: number; y: number }, tail: { x: number; y: number } | null, frames = 240) => { for (let i = 0; i < frames; i++) rope.step(1 / 60, gun, tail); };
    it('keeps both ends attached, sags when slack and straightens under tension', () => {
        const slack = new Rope(22, 0, 0), taut = new Rope(22, 0, 0), gun = { x: 0, y: 0 }, tail = { x: 500, y: 0 };
        slack.length = 600; taut.length = 500 * 0.98;
        settle(slack, gun, tail); settle(taut, gun, tail);
        expect(slack.nodes[0]).toMatchObject(gun); expect(slack.nodes[21]).toMatchObject(tail);
        expect(slack.sag()).toBeGreaterThan(60);
        expect(Math.abs(taut.sag())).toBeLessThan(8);
    });
    it('never stretches far past its length', () => {
        const rope = new Rope(22, 0, 0); rope.length = 400;
        settle(rope, { x: 0, y: 0 }, null, 30);
        let max = 0;
        for (let i = 0; i < 60; i++) { rope.nodes[21].x += 30; rope.step(1 / 60, { x: 0, y: 0 }, null); max = Math.max(max, rope.span()); }
        expect(max).toBeLessThan(400 * 1.25);
    });
    it('drapes over a ledge instead of passing through it', () => {
        const rope = new Rope(22, 0, 0); rope.length = 700;
        const ledge = { x: 200, y: 40, w: 100, h: 400 };
        for (let i = 0; i < 240; i++) rope.step(1 / 60, { x: 0, y: 0 }, { x: 500, y: 0 }, [ledge]);
        for (const n of rope.nodes) expect(n.x > ledge.x + 1 && n.x < ledge.x + ledge.w - 1 && n.y > ledge.y + 1).toBe(false);
    });
    it('reels a free shaft home as line is taken in', () => {
        const rope = new Rope(22, 0, 0), gun = { x: 0, y: 0 }; rope.length = 600;
        settle(rope, gun, { x: 550, y: 100 }, 60);
        let speed = 0, frames = 0;
        while (rope.length > 22 && frames < 300) { speed = reelSpeed(speed, 1 / 60); rope.length = Math.max(0, Math.min(rope.length, rope.span() + 40) - speed / 60); rope.step(1 / 60, gun, null); frames++; }
        expect(frames).toBeLessThan(90);
        expect(rope.span()).toBeLessThan(60);
    });
    it('the winch spools up to a top speed', () => {
        let v = 0; const seen = [];
        for (let i = 0; i < 60; i++) { v = reelSpeed(v, 1 / 60); seen.push(v); }
        expect(seen[0]).toBeLessThan(seen[10]); expect(v).toBe(HARPOON.reelMaxSpeed);
    });
});
