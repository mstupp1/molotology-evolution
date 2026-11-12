/**
 * Pure harpoon physics: the charge curve, the underwater ballistic flight of the head,
 * and a Verlet rope. Kept free of Phaser so it can be unit tested and tuned offline.
 *
 * World scale: the diver is ~90px tall, so roughly 50px ≈ 1m.
 */
import { segmentRect, type Rect } from './world';

export const HARPOON = {
    /** Seconds of holding to reach full power. */
    chargeTime: 0.72,
    /** The perfect window opens as the charge tops out and stays open this long. */
    perfectWindow: 0.15,
    /** Power of an instant tap, so a quick shot still feels useful. */
    minPower: 0.3,
    /** Muzzle speed at the lowest and highest power, in px/s. */
    minSpeed: 540, maxSpeed: 1650,
    /** A perfect shot leaves the barrel this much faster. */
    perfectSpeed: 1.1,
    /** Damage multiplier for a perfect shot. */
    perfectDamage: 1.6,
    /** Net sinking acceleration of a steel shaft in water (gravity minus buoyancy), px/s². */
    gravity: 260,
    /** Linear and quadratic water drag on the shaft. */
    linearDrag: 1.1, quadraticDrag: 0.0006,
    /** Below this speed the shot is spent and the line starts to reel. */
    spentSpeed: 300, maxFlight: 1.2,
    /** The longest line on the spool, in px. */
    maxLine: 920,
    /** Reel motor: it spools up to top speed, so the head eases off and then whips home. */
    reelAccel: 3600, reelMaxSpeed: 1650, reelStartSpeed: 180
} as const;

export interface Charge { power: number; perfect: boolean; full: boolean; /** 0..1 progress through the perfect window, or -1 outside it. */ window: number }
/** How strong a shot is after holding the aim for `held` seconds. */
export function chargeAt(held: number): Charge {
    const t = Math.max(0, held) / HARPOON.chargeTime;
    const eased = 1 - (1 - Math.min(1, t)) ** 2;
    const power = HARPOON.minPower + (1 - HARPOON.minPower) * eased;
    const into = held - HARPOON.chargeTime, perfect = into >= 0 && into <= HARPOON.perfectWindow;
    return { power, perfect, full: t >= 1, window: perfect ? into / HARPOON.perfectWindow : -1 };
}
export function launchSpeed(charge: Charge): number {
    return (HARPOON.minSpeed + (HARPOON.maxSpeed - HARPOON.minSpeed) * (charge.power - HARPOON.minPower) / (1 - HARPOON.minPower)) * (charge.perfect ? HARPOON.perfectSpeed : 1);
}
/** Damage scales gently with power so a tap is weaker, and a perfect shot gets the bonus. */
export function shotDamage(base: number, charge: Charge): number {
    return Math.round(base * (0.7 + 0.3 * (charge.power - HARPOON.minPower) / (1 - HARPOON.minPower)) * (charge.perfect ? HARPOON.perfectDamage : 1));
}

export interface Projectile { x: number; y: number; vx: number; vy: number }
/** Advance the shaft one step: sinking plus water drag that grows with speed. */
export function stepProjectile(p: Projectile, dt: number): Projectile {
    const speed = Math.hypot(p.vx, p.vy), drag = HARPOON.linearDrag + HARPOON.quadraticDrag * speed;
    // Exponential form keeps drag stable at large steps and never reverses the shaft.
    const keep = Math.exp(-drag * dt);
    const vx = p.vx * keep, vy = p.vy * keep + HARPOON.gravity * dt;
    return { x: p.x + (p.vx + vx) * 0.5 * dt, y: p.y + (p.vy + vy) * 0.5 * dt, vx, vy };
}
/** The shot is spent once water has eaten its speed, or it has flown its time. */
export const spent = (p: Projectile, age: number): boolean => Math.hypot(p.vx, p.vy) < HARPOON.spentSpeed || age > HARPOON.maxFlight;

/** Predict the flight for the aim preview. It stops at terrain, the spent point or the end of the line. */
export function predictArc(start: Projectile, geometry: Rect[], step = 1 / 60, maxTime = 2): { points: Projectile[]; hit: boolean } {
    const points: Projectile[] = [start];
    let p = start;
    for (let t = 0; t < maxTime; t += step) {
        const next = stepProjectile(p, step);
        let hitT: number | null = null;
        for (const r of geometry) { const h = segmentRect(p.x, p.y, next.x, next.y, r); if (h !== null && (hitT === null || h < hitT)) hitT = h; }
        if (hitT !== null) { points.push({ ...next, x: p.x + (next.x - p.x) * hitT, y: p.y + (next.y - p.y) * hitT }); return { points, hit: true }; }
        p = next; points.push(p);
        if (spent(p, t + step) || Math.hypot(p.x - start.x, p.y - start.y) > HARPOON.maxLine) break;
    }
    return { points, hit: false };
}

/** Next reel speed: the winch spools up toward its top speed. */
export function reelSpeed(current: number, dt: number): number {
    return Math.min(HARPOON.reelMaxSpeed, Math.max(HARPOON.reelStartSpeed, current) + HARPOON.reelAccel * dt);
}

export interface RopeNode { x: number; y: number; px: number; py: number }
/**
 * A Verlet rope. Node 0 is held by the gun; the last node is tied to the shaft.
 * `length` is how much line is paid out: slack sags under water, tension pulls it straight.
 */
export class Rope {
    nodes: RopeNode[];
    length = 0;
    constructor(readonly count: number, x: number, y: number) {
        this.nodes = Array.from({ length: count }, () => ({ x, y, px: x, py: y }));
    }
    reset(x: number, y: number): void { for (const n of this.nodes) { n.x = n.px = x; n.y = n.py = y; } this.length = 0; }
    /**
     * Simulate one step.
     * @param tail whether the shaft end is pinned (in flight, stuck or anchored) or free and dragged by the rope (reeling).
     */
    step(dt: number, gun: { x: number; y: number }, tail: { x: number; y: number } | null, geometry: Rect[] = [], iterations = 30): void {
        const nodes = this.nodes, last = nodes.length - 1;
        // Water: a near-neutral line sinks slowly and loses motion quickly.
        const damping = Math.exp(-dt * 3.2), sink = 240 * dt * dt;
        for (let i = 1; i <= last; i++) {
            const n = nodes[i];
            if (i === last && tail) continue;
            const vx = (n.x - n.px) * damping, vy = (n.y - n.py) * damping;
            n.px = n.x; n.py = n.y; n.x += vx; n.y += vy + sink * (i === last ? 3 : 1);
        }
        const rest = this.length / last;
        for (let k = 0; k < iterations; k++) {
            nodes[0].x = gun.x; nodes[0].y = gun.y;
            if (tail) { nodes[last].x = tail.x; nodes[last].y = tail.y; }
            for (let i = 0; i < last; i++) {
                const a = nodes[i], b = nodes[i + 1];
                const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-6;
                // A rope resists stretching but not compression; slack segments just hang.
                if (d <= rest) continue;
                const diff = (d - rest) / d;
                // The gun end never moves; a free shaft is heavier than the line, so it gives less.
                const wa = i === 0 ? 0 : 0.5, wb = i + 1 === last ? (tail ? 0 : 0.25) : 0.5, sum = wa + wb || 1;
                a.x += dx * diff * wa / sum; a.y += dy * diff * wa / sum;
                b.x -= dx * diff * wb / sum; b.y -= dy * diff * wb / sum;
            }
        }
        if (geometry.length) for (let i = 1; i < last; i++) pushOut(nodes[i], geometry);
        nodes[0].x = nodes[0].px = gun.x; nodes[0].y = nodes[0].py = gun.y;
        if (tail) { nodes[last].x = nodes[last].px = tail.x; nodes[last].y = nodes[last].py = tail.y; }
    }
    /** Straight-line distance spanned by the rope; above `length` means the line is taut. */
    span(): number { const a = this.nodes[0], b = this.nodes[this.nodes.length - 1]; return Math.hypot(b.x - a.x, b.y - a.y); }
    /** How far the middle hangs below the straight chord, for tests and tension cues. */
    sag(): number {
        const a = this.nodes[0], b = this.nodes[this.nodes.length - 1], m = this.nodes[this.nodes.length >> 1];
        return m.y - (a.y + b.y) / 2;
    }
}
/** Rope drapes over ledges instead of passing through them. */
function pushOut(n: RopeNode, geometry: Rect[]): void {
    for (const r of geometry) {
        if (n.x <= r.x || n.x >= r.x + r.w || n.y <= r.y || n.y >= r.y + r.h) continue;
        const left = n.x - r.x, right = r.x + r.w - n.x, top = n.y - r.y, bottom = r.y + r.h - n.y, min = Math.min(left, right, top, bottom);
        if (min === top) n.y = r.y - 0.5; else if (min === bottom) n.y = r.y + r.h + 0.5; else if (min === left) n.x = r.x - 0.5; else n.x = r.x + r.w + 0.5;
        // Friction against the surface.
        n.px = n.x - (n.x - n.px) * 0.4; n.py = n.y - (n.y - n.py) * 0.4;
    }
}
