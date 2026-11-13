import { inside, type Room, type RoomId } from './world';

/**
 * Flood and drain. A chamber with sluice valves holds a single waterline that
 * the player raises or lowers. Below the line is water: buoyant high jumps,
 * oxygen drains and swimmers hunt. Above it is air: breathing is free, jumps
 * are short, and anything that swims is left stranded on the iron.
 */
export const WATERLINE = { flooded: 70, drained: 828 } as const;
/** Pixels per second the surface moves while a sluice is open. */
export const WATER_SPEED = 260;
/** Rooms without valves are fully submerged: no surface at all. */
export const NO_SURFACE = -Infinity;

export const valveKey = (id: RoomId): string => `valve:${id}`;
export function isFlooded(room: Pick<Room, 'id' | 'flood'>, opened: readonly string[]): boolean {
    if (!room.flood) return true;
    return room.flood.startFlooded !== opened.includes(valveKey(room.id));
}
/** Throwing a valve flips the room's stored water state. Returns the new flooded state. */
export function toggleFlood(room: Pick<Room, 'id' | 'flood'>, opened: string[]): boolean {
    const key = valveKey(room.id), i = opened.indexOf(key);
    if (i >= 0) opened.splice(i, 1); else opened.push(key);
    return isFlooded(room, opened);
}
export function targetWaterline(room: Pick<Room, 'id' | 'flood'>, opened: readonly string[]): number {
    if (!room.flood) return NO_SURFACE;
    return isFlooded(room, opened) ? WATERLINE.flooded : WATERLINE.drained;
}
export function stepWaterline(current: number, target: number, dt: number, speed = WATER_SPEED): number {
    if (!Number.isFinite(current) || !Number.isFinite(target)) return target;
    const step = speed * dt;
    return Math.abs(target - current) <= step ? target : current + Math.sign(target - current) * step;
}
/** True where the diver can breathe: inside an air pocket, or above the waterline. */
export function breathable(room: Pick<Room, 'air'>, x: number, y: number, waterline: number): boolean {
    return y < waterline || room.air.some(r => inside(x, y, r));
}
/**
 * A swimmer whose head has been left above the surface can no longer swim. Once
 * stranded, it needs the water back over its head to swim again (hysteresis keeps
 * a body lying at the surface from flickering between states).
 */
export const stranded = (top: number, waterline: number, wasStranded = false): boolean => top < waterline + (wasStranded ? 10 : -10);
