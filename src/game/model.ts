import type { Evolution } from './constants';
import { ROOM_IDS, ROOMS, type RoomId, type PickupKind } from './world';

export const SAVE_KEY = 'molotology.shipwreck.v1';
export interface Progress {
    version: 1; checkpoint: RoomId; evolution: Evolution; harpoon: boolean; key: boolean;
    explored: RoomId[]; opened: string[]; defeated: string[]; collected: string[]; completed: boolean;
}
export function newProgress(): Progress { return { version: 1, checkpoint: 'hull', evolution: 0, harpoon: false, key: false, explored: ['hull'], opened: [], defeated: [], collected: [], completed: false }; }
export function objective(p: Progress): string {
    if (p.completed) return 'The wreck is quiet. Find those who were left behind.';
    if (!p.harpoon) return 'Find the salvage harpoon in the Armory.';
    if (p.evolution === 0) return 'Return to the Air Bell. Grapple to the Rigging Shaft.';
    if (p.evolution === 1) return 'Break the calcified bulkhead with your claw. Find the final molt.';
    if (!p.key) return 'Climb and ceiling-scuttle through the Ballast Duct. Find the chapel key.';
    return 'Cross the volcanic vents. Scuttle over the Caldera Vault to the last light.';
}
/** Each Vital Pearl found in the wreck permanently raises maximum health. */
export const PEARL_HEALTH = 20;
export function maxHealth(p: Pick<Progress, 'collected'>): number { return 100 + PEARL_HEALTH * p.collected.filter(id => id.startsWith('pearl:')).length; }
export function collect(p: Progress, id: string, kind: PickupKind): boolean {
    if (p.collected.includes(id)) return false;
    p.collected.push(id);
    if (kind === 'harpoon') p.harpoon = true;
    if (kind === 'breach') p.evolution = Math.max(1, p.evolution) as Evolution;
    if (kind === 'infestation') p.evolution = 2;
    if (kind === 'key') p.key = true;
    return true;
}
export function decodeSave(raw: string | null): Progress | null {
    if (!raw) return null;
    try {
        const p = JSON.parse(raw) as Progress;
        if (p.version !== 1 || !ROOM_IDS.includes(p.checkpoint) || ![0, 1, 2].includes(p.evolution)) return null;
        if (!ROOMS[p.checkpoint].station) return null;
        if (typeof p.harpoon !== 'boolean' || typeof p.key !== 'boolean' || typeof p.completed !== 'boolean') return null;
        if (![p.explored, p.opened, p.defeated, p.collected].every(a => Array.isArray(a) && a.every(x => typeof x === 'string'))) return null;
        p.explored = p.explored.filter(id => ROOM_IDS.includes(id));
        if (p.evolution > 0 && !p.harpoon || p.key && p.evolution < 2) return null;
        return p;
    } catch { return null; }
}
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
let sessionSave: string | null = null;
export class SaveStore {
    persistent = true;
    constructor(private storage?: StorageLike) {}
    load(): Progress | null { try { return decodeSave(this.storage?.getItem(SAVE_KEY) ?? sessionSave); } catch { this.persistent = false; return decodeSave(sessionSave); } }
    save(p: Progress): boolean {
        sessionSave = JSON.stringify(p);
        try { if (!this.storage) { this.persistent = false; return false; } this.storage.setItem(SAVE_KEY, sessionSave); return true; }
        catch { this.persistent = false; return false; }
    }
}
export function browserSaveStore(): SaveStore { try { return new SaveStore(window.localStorage); } catch { return new SaveStore(); } }
export class Survival {
    health = 100; oxygen = 120; invulnerable = 0;
    constructor(public maxHealth = 100) { this.health = maxHealth; }
    update(dt: number, air: boolean, refill: boolean): void {
        this.invulnerable = Math.max(0, this.invulnerable - dt);
        const suffocatingTime = air || refill ? 0 : Math.max(0, dt - this.oxygen);
        this.oxygen = Math.max(0, Math.min(120, this.oxygen + (air || refill ? 40 : -1) * dt));
        this.health = Math.max(0, this.health - 8 * suffocatingTime);
    }
    hit(damage: number, invulnerability = 0.85): boolean {
        if (this.invulnerable > 0 || this.health <= 0) return false;
        this.health = Math.max(0, this.health - damage); this.invulnerable = invulnerability; return true;
    }
}
export class Combo {
    index = -1; elapsed = 0; queued = false; targets = new Set<string>();
    readonly durations = [0.34, 0.37, 0.48];
    get active(): boolean { return this.index >= 0; }
    get damaging(): boolean { return this.active && this.elapsed >= 0.07 && this.elapsed <= (this.index === 2 ? 0.28 : 0.2); }
    press(): boolean {
        if (!this.active) { this.index = 0; this.elapsed = 0; this.targets.clear(); return true; }
        if (this.elapsed >= 0.08) this.queued = true;
        return false;
    }
    update(dt: number): boolean {
        if (!this.active) return false;
        this.elapsed += dt;
        if (this.elapsed < this.durations[this.index]) return false;
        if (this.queued && this.index < 2) { this.index++; this.elapsed = 0; this.queued = false; this.targets.clear(); return true; }
        this.reset(); return false;
    }
    hit(id: string): boolean { if (!this.damaging || this.targets.has(id)) return false; this.targets.add(id); return true; }
    reset(): void { this.index = -1; this.elapsed = 0; this.queued = false; this.targets.clear(); }
}
