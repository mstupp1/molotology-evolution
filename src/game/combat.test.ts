import { describe, expect, it } from 'vitest';
import { BUBBLE, bubbleDamage, COMBAT, hitDamage, LANTERN_FRAMES, lanternRect, tentacleTip } from './combat';
import { chargeAt } from './harpoonPhysics';
import { rangedWeapon } from './mechanics';
import { collect, decodeSave, newProgress } from './model';
import { meetsRequirement, ROOMS } from './world';

describe('charged bubbles and equipment', () => {
    it('scales tap/full damage and stacks perfect release with the lantern multiplier', () => {
        expect(bubbleDamage(chargeAt(0))).toBe(32);
        expect(bubbleDamage(chargeAt(1))).toBe(54);
        expect(bubbleDamage(chargeAt(0.75))).toBe(86);
        expect(hitDamage(bubbleDamage(chargeAt(0.75)), true)).toBe(129);
        expect(hitDamage(54, false)).toBe(54);
        expect(BUBBLE.cooldown).toBe(0.45); expect(BUBBLE.life).toBe(1.2);
    });
    it('preserves acquisition flags and equips bubbles when loading existing final-form saves', () => {
        const p = newProgress(); expect(rangedWeapon(p)).toBe('none');
        collect(p, 'harpoon', 'harpoon'); expect(rangedWeapon(p)).toBe('harpoon');
        collect(p, 'breach', 'breach'); expect(rangedWeapon(p)).toBe('harpoon');
        collect(p, 'infestation', 'infestation');
        const loaded = decodeSave(JSON.stringify(p))!;
        expect(loaded.harpoon).toBe(true); expect(rangedWeapon(loaded)).toBe('bubble');
    });
});
describe('enemy attack geometry', () => {
    it('fully extends tentacles past nearby targets, including vertical targets', () => {
        for (const [x, y] of [[20, 0], [200, 100], [0, -20]]) {
            const tip = tentacleTip(0, 0, x, y, 0.5);
            expect(Math.hypot(tip.x, tip.y)).toBeCloseTo(380);
        }
        expect(tentacleTip(0, 0, 10, 0, 0).x).toBe(0);
        expect(COMBAT.sharkRecovery + COMBAT.sharkPatrol).toBeCloseTo(0.8);
    });
    it('moves the lantern through every pose and mirrors its center with the sprite', () => {
        LANTERN_FRAMES.forEach((_, frame) => {
            const a = lanternRect(500, 500, 2, 2, frame, false), b = lanternRect(500, 500, 2, 2, frame, true);
            expect(a.x + a.w / 2 + b.x + b.w / 2).toBe(1000);
            expect(a.y).toBe(b.y);
        });
        expect(lanternRect(0, 0, 1, 1, 0, false).y).not.toBe(lanternRect(0, 0, 1, 1, 8, false).y);
    });
});
describe('expanded progression', () => {
    it('keeps early heat rewards and shortcuts locked until the second molt', () => {
        const pickup = ROOMS.cargo.pickups.find(p => p.id === 'pearl:cargo-thermal')!;
        const shortcut = ROOMS.cargo.doors.find(d => d.to === 'furnace')!;
        const p = newProgress();
        for (const evolution of [0, 1, 2] as const) {
            p.evolution = evolution;
            expect(meetsRequirement(pickup.requires, p)).toBe(evolution === 2);
            expect(meetsRequirement(shortcut.requires, p)).toBe(evolution === 2);
        }
        expect(ROOMS.armory.heat!.length).toBeGreaterThan(0);
        expect(ROOMS.furnace.doors.some(d => d.to === 'cargo')).toBe(true);
        p.evolution = 2; expect(meetsRequirement(ROOMS.caldera.doors.find(d => d.to === 'angler')!.requires, p)).toBe(false);
    });
    it('has four distinct lost-diver visuals and three mandatory crawl exits', () => {
        const divers = Object.values(ROOMS).flatMap(r => r.enemies).filter(e => e.kind === 'handcrab' || e.kind === 'hermit');
        expect(divers).toHaveLength(4); expect(new Set(divers.map(e => e.visual ?? e.kind)).size).toBe(4);
        expect(['ballast', 'chapel', 'caldera'].every(id => Object.values(ROOMS).find(r => r.id === id)!.doors.some(d => d.crawl))).toBe(true);
    });
});
