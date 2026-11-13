import { describe, expect, it } from 'vitest';
import { collect, Combo, decodeSave, maxHealth, newProgress, PEARL_HEALTH, SaveStore, Survival, SAVE_KEY } from './model';

describe('survival', () => {
    it('has two minutes of air, then drains health only for the time without oxygen', () => {
        const s = new Survival(); s.update(119, false, false);
        expect(s.oxygen).toBe(1); expect(s.health).toBe(100);
        s.update(3, false, false); expect(s.oxygen).toBe(0); expect(s.health).toBe(84);
    });
    it('air and stations refill oxygen without restoring health, with caps', () => {
        const s = new Survival(); s.oxygen = 0; s.health = 40;
        s.update(1, true, false); expect(s.oxygen).toBe(40); expect(s.health).toBe(40);
        s.update(4, false, true); expect(s.oxygen).toBe(120); expect(s.health).toBe(40);
    });
    it('rejects repeated contact hits during invulnerability, but drowning remains active', () => {
        const s = new Survival(); expect(s.hit(20)).toBe(true); expect(s.hit(20)).toBe(false);
        s.oxygen = 0; s.update(1, false, false); expect(s.health).toBe(72); expect(s.hit(12)).toBe(true);
    });
});
describe('vital pearls', () => {
    it('raise maximum health once per pearl and survive a save round trip', () => {
        const p = newProgress(); expect(maxHealth(p)).toBe(100);
        collect(p, 'pearl:cargo', 'health'); collect(p, 'pearl:cargo', 'health'); collect(p, 'pearl:chapel', 'health');
        expect(maxHealth(p)).toBe(100 + 2 * PEARL_HEALTH);
        expect(maxHealth(decodeSave(JSON.stringify(p))!)).toBe(100 + 2 * PEARL_HEALTH);
    });
    it('starts with raised maximum health; stations preserve current health', () => {
        const s = new Survival(140); expect(s.health).toBe(140);
        s.health = 10; s.update(10, false, true); expect(s.health).toBe(10);
    });
});
describe('combo damage windows', () => {
    it('hits each target once per swing, not once per frame', () => {
        const combo = new Combo(); combo.press(); expect(combo.hit('a')).toBe(false);
        combo.update(0.1); expect(combo.hit('a')).toBe(true); expect(combo.hit('a')).toBe(false); expect(combo.hit('b')).toBe(true);
        combo.press(); combo.update(0.25); expect(combo.index).toBe(1);
        combo.update(0.1); expect(combo.hit('a')).toBe(true);
    });
    it('finishes an unqueued attack and limits a queued chain to three hits', () => {
        const c = new Combo(); c.press(); c.update(0.5); expect(c.active).toBe(false);
        c.press();
        for (let i = 0; i < 3; i++) { c.update(0.1); c.press(); c.update(0.5); }
        expect(c.active).toBe(false);
    });
});
describe('progression and persistence', () => {
    it('collects an unlock once and never reverses a molt', () => {
        const p = newProgress(); collect(p, 'harpoon', 'harpoon'); collect(p, 'infestation', 'infestation'); collect(p, 'breach', 'breach');
        expect(p.evolution).toBe(2); expect(collect(p, 'harpoon', 'harpoon')).toBe(false);
    });
    it('round-trips every persistent discovery without recording temporary enemy state', () => {
        const p = newProgress(); Object.assign(p, { harpoon: true, evolution: 2, key: true, checkpoint: 'chapel', completed: true, explored: ['hull', 'bell', 'chapel'], defeated: ['angler:angler:2260'], opened: ['bell:chapel'] });
        const values = new Map<string, string>(); const store = new SaveStore({ getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } });
        expect(store.save(p)).toBe(true); expect(values.has(SAVE_KEY)).toBe(true); expect(store.load()).toEqual(p);
    });
    it.each(['garbage', '{}', '{"version":99}', JSON.stringify({ ...newProgress(), checkpoint: 'missing' }), JSON.stringify({ ...newProgress(), evolution: 2 }), JSON.stringify({ ...newProgress(), explored: null })])('rejects corrupt or incompatible saves: %s', raw => {
        expect(decodeSave(raw)).toBeNull();
    });
    it('keeps a session save when storage access throws', () => {
        const store = new SaveStore({ getItem: () => { throw Error('denied'); }, setItem: () => { throw Error('quota'); } });
        const p = newProgress(); p.harpoon = true; expect(store.save(p)).toBe(false); expect(store.load()).toEqual(p); expect(store.persistent).toBe(false);
    });
});
