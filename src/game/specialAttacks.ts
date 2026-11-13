import { CINDER_CHIMNEYS } from './animation';
import type { EnemySpawn, Rect } from './world';
import { segmentRect } from './world';

export type SpecialAttack = 'chomp' | 'snip' | 'cable' | 'hooks' | 'spew';
export type EnemyAttack = 'lunge' | 'frenzy' | 'pulse' | 'leap' | SpecialAttack;
export interface Point { x: number; y: number }
export interface AttackOrigin extends Point { scaleX?: number; scaleY?: number; frame?: { name: string | number } }
export interface AttackSegment { a: Point; b: Point; width: number; end?: boolean }
export const SPECIAL = {
    chomp: { charge: 0.95, strike: 0.6, recover: 1.45, damage: 28 },
    snip: { charge: 1.05, strike: 0.65, recover: 1.5, damage: 30 },
    cable: { charge: 1.1, strike: 0.7, recover: 1.4, damage: 24 },
    hooks: { charge: 1.25, strike: 1.4, recover: 1.5, damage: 24 },
    spew: { charge: 1.05, strike: 1.3, recover: 1.55, damage: 22 }
} as const;
export const isSpecial = (attack: EnemyAttack): attack is SpecialAttack => attack in SPECIAL;
export function chooseAttack(spec: Pick<EnemySpawn, 'kind' | 'visual'>, cycles: number): EnemyAttack {
    if (spec.kind === 'angler') return (['lunge', 'frenzy', 'pulse'] as const)[cycles % 3];
    if (spec.visual === 'rigging-diver') return (['leap', 'cable', 'leap', 'hooks'] as const)[cycles % 4];
    if (spec.kind !== 'handcrab' && spec.kind !== 'hermit') return 'lunge';
    if (cycles % 2 === 1) return 'leap';
    return spec.visual === 'cinder-diver' ? 'spew' : spec.kind === 'handcrab' ? 'chomp' : 'snip';
}
export function spewMouth(origin: AttackOrigin, facing: number): Point {
    const [x, y] = CINDER_CHIMNEYS[Number(origin.frame?.name ?? 0)] ?? CINDER_CHIMNEYS[0];
    return { x: origin.x + (x - 128) * (origin.scaleX ?? 1) * (facing > 0 ? -1 : 1), y: origin.y + (y - 128) * (origin.scaleY ?? 1) };
}
export const specialActive = (attack: SpecialAttack, p: number): boolean => {
    if (p < 0 || p > 1) return false;
    return attack === 'chomp' || attack === 'snip' ? p >= 0.28 && p <= 0.62 : attack === 'cable' ? p >= 0.3 && p <= 0.65 : p >= 0.08 && p <= 0.92;
};
/** The same moving limbs/streams are drawn by AttackFx and swept against the player. */
export function specialSegments(attack: SpecialAttack, origin: AttackOrigin, target: Point, facing: number, p: number, geometry: readonly Rect[] = []): AttackSegment[] {
    const dir = facing < 0 ? -1 : 1, at = (x: number, y: number): Point => ({ x: origin.x + dir * x, y: origin.y + y });
    const line = (a: Point, b: Point, width: number): AttackSegment => ({ a, b, width });
    const close = Math.max(0, Math.min(1, (p - 0.18) / 0.38));
    if (attack === 'chomp' || attack === 'snip') {
        const reach = attack === 'chomp' ? 245 : 290, gap = (attack === 'chomp' ? 90 : 140) * (1 - close);
        return [-1, 1].map(side => line(at(45, 18 + side * 25), at(reach, 18 + side * gap), attack === 'chomp' ? 30 : 36));
    }
    if (attack === 'cable') {
        const dx = target.x - origin.x, dy = target.y - origin.y, d = Math.hypot(dx, dy) || 1;
        const reach = 610, slack = Math.sin(Math.PI * Math.min(1, p / 0.5)) * 60;
        const mid = { x: origin.x + dx / d * reach * 0.5, y: origin.y + dy / d * reach * 0.5 + slack };
        return [line(origin, mid, 20), line(mid, { x: origin.x + dx / d * reach, y: origin.y + dy / d * reach }, 20)];
    }
    if (attack === 'hooks') return hookLanes(target.x).map((x, i) => {
        const fall = Math.max(0, Math.min(1, (p - i * 0.17) / 0.48));
        return line({ x, y: 0 }, { x, y: 40 + fall * 810 }, 32);
    });
    const mouth = spewMouth(origin, facing);
    const aim = Math.atan2(target.y - mouth.y, Math.abs(target.x - mouth.x));
    return [-0.25, 0, 0.25].flatMap((spread, stream) => {
        const points = Array.from({ length: 13 }, (_, i) => {
            const d = i / 12 * 520, a = Math.max(-0.8, Math.min(0.5, aim)) + spread;
            return { x: mouth.x + dir * Math.cos(a) * d, y: mouth.y + Math.sin(a) * d + d * d * 0.00035 + Math.sin(p * 22 + i * 0.7 + stream) * i * 0.6 };
        });
        const result: AttackSegment[] = [];
        for (let i = 1; i < points.length; i++) {
            const a = points[i - 1], b = points[i];
            const hits = geometry.map(rect => segmentRect(a.x, a.y, b.x, b.y, rect)).filter((t): t is number => t !== null);
            const t = hits.length ? Math.min(...hits) : 1;
            result.push({ a, b: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, width: 24 + i, end: t < 1 || i === points.length - 1 });
            if (t < 1) break;
        }
        return result;
    });
}
export const hookLanes = (x: number): number[] => [-190, 0, 190].map(offset => Math.max(225, Math.min(2915, x)) + offset).filter(lane => lane >= 35 && lane <= 3105);
export function segmentHits(segment: AttackSegment, rect: Rect): boolean {
    const r = segment.width / 2;
    return segmentRect(segment.a.x, segment.a.y, segment.b.x, segment.b.y, { x: rect.x - r, y: rect.y - r, w: rect.w + r * 2, h: rect.h + r * 2 }) !== null;
}
