/**
 * Pure helpers for the 2.5D attack effects: lightning paths and a light perspective
 * projection. Effects live in a shallow 3D space around their source (x right, y down,
 * z toward the camera), so arcs can wrap behind a creature and sparks can fly at the lens.
 */

export interface Pt { x: number; y: number }
export interface Vec3 { x: number; y: number; z: number }
export interface Projected extends Pt { scale: number; front: boolean }

/** Focal length in pixels. Smaller is a stronger, more dramatic perspective. */
export const FOCAL = 520;

/** Apparent size of something `z` pixels toward (+) or away from (-) the camera. */
export function perspective(z: number): number {
    return FOCAL / (FOCAL - Math.min(z, FOCAL * 0.75));
}

/** Projects an offset `v` from an origin onto the screen, scaling it with depth. */
export function project(ox: number, oy: number, v: Vec3): Projected {
    const scale = perspective(v.z);
    return { x: ox + v.x * scale, y: oy + v.y * scale, scale, front: v.z >= 0 };
}

/** Spins `v` around the vertical axis by `yaw`, then tips it toward the viewer by `tilt`. */
export function rotate(v: Vec3, yaw: number, tilt: number): Vec3 {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
    const x = v.x * cy + v.z * sy, z = -v.x * sy + v.z * cy;
    return { x, y: v.y * ct - z * st, z: v.y * st + z * ct };
}

/** A random direction, uniform over the sphere. */
export function randomDirection(rand: () => number = Math.random): Vec3 {
    const z = rand() * 2 - 1, a = rand() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    return { x: Math.cos(a) * r, y: Math.sin(a) * r, z };
}

/** `count` directions spread evenly over the sphere (a Fibonacci lattice). */
export function sphereDirections(count: number): Vec3[] {
    const golden = Math.PI * (3 - Math.sqrt(5));
    return Array.from({ length: count }, (_, i) => {
        const y = 1 - (i + 0.5) / count * 2, r = Math.sqrt(1 - y * y), a = golden * i;
        return { x: Math.cos(a) * r, y, z: Math.sin(a) * r };
    });
}

/**
 * A jagged lightning path from a to b by midpoint displacement. Each pass halves
 * the segments and the jitter, so the bolt is wild at large scale and fine up close.
 */
export function bolt(ax: number, ay: number, bx: number, by: number, roughness = 0.32, passes = 4, rand: () => number = Math.random): Pt[] {
    let points: Pt[] = [{ x: ax, y: ay }, { x: bx, y: by }];
    let offset = Math.hypot(bx - ax, by - ay) * roughness;
    for (let pass = 0; pass < passes; pass++) {
        const next: Pt[] = [points[0]];
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i], b = points[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
            const shift = (rand() * 2 - 1) * offset;
            next.push({ x: (a.x + b.x) / 2 - (b.y - a.y) / len * shift, y: (a.y + b.y) / 2 + (b.x - a.x) / len * shift }, b);
        }
        points = next; offset *= 0.5;
    }
    return points;
}

/** Back-out easing: overshoots then settles, for spines that snap out. */
export function easeOutBack(t: number): number {
    const c = 1.9, u = Math.min(1, Math.max(0, t)) - 1;
    return 1 + (c + 1) * u * u * u + c * u * u;
}
