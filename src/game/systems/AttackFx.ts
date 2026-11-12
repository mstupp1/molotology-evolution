import * as Phaser from 'phaser';
import { bolt, easeOutBack, project, randomDirection, rotate, sphereDirections, type Projected, type Pt, type Vec3 } from '../fx';
import type { Enemy } from './Enemies';

/**
 * 2.5D attack effects. Each effect lives in a shallow 3D space around its source:
 * whatever is behind the creature is drawn under its sprite and dimmed, whatever is
 * in front is drawn over it, and the hottest cores sit above the room's darkness so
 * electricity lights the wreck instead of being swallowed by it.
 *
 * Everything is vector strokes on four shared Graphics layers plus a few pooled
 * glow images, redrawn each frame: no filters, no per-frame textures.
 */

const DEPTH = { back: 17.9, backSolid: 17.95, front: 21.5, frontSolid: 21.6, glow: 29, core: 31 } as const;
const VIOLET = 0xb79afa, ELECTRIC = 0x9fe8ff, URCHIN = 0xe99c7d;

interface Spark { ox: number; oy: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; color: number; size: number; drag: number; rise: number; streak: boolean }
interface Arc { points: Pt[]; front: boolean; width: number; color: number }
interface Flash { x: number; y: number; r: number; life: number; max: number; color: number }
export interface FxLight { x: number; y: number; r: number }

const SPINES = sphereDirections(30);

export class AttackFx {
    private back: Phaser.GameObjects.Graphics;
    private backSolid: Phaser.GameObjects.Graphics;
    private front: Phaser.GameObjects.Graphics;
    private frontSolid: Phaser.GameObjects.Graphics;
    private glow: Phaser.GameObjects.Graphics;
    private core: Phaser.GameObjects.Graphics;
    private sparks: Spark[] = [];
    private flashes: Flash[] = [];
    private halos: Phaser.GameObjects.Image[] = [];
    private haloIndex = 0;
    private arcs = new Map<Enemy, { timer: number; arcs: Arc[] }>();
    private phase = new Map<Enemy, string>();
    private ghostTimer = new Map<Enemy, number>();
    private trails = new Map<Phaser.GameObjects.GameObject, Pt[]>();
    private lightList: FxLight[] = [];
    private time = 0;

    constructor(private scene: Phaser.Scene) {
        const layer = (depth: number, add: boolean) => { const g = scene.add.graphics().setDepth(depth); if (add) g.setBlendMode(Phaser.BlendModes.ADD); return g; };
        this.back = layer(DEPTH.back, true); this.backSolid = layer(DEPTH.backSolid, false);
        this.front = layer(DEPTH.front, true); this.frontSolid = layer(DEPTH.frontSolid, false);
        this.glow = layer(DEPTH.glow, true); this.core = layer(DEPTH.core, true);
    }

    /** Clears last frame's strokes. Call before any enemy draws. */
    begin(dt: number): void {
        this.time += dt; this.lightList = [];
        for (const g of [this.back, this.backSolid, this.front, this.frontSolid, this.glow, this.core]) g.clear();
        for (const h of this.halos) h.setVisible(false);
        this.haloIndex = 0;
    }

    /** Lights that this frame's effects throw into the darkness. */
    lights(): FxLight[] { return this.lightList; }

    /** Advances and draws free sparks and flashes. Call after enemies draw. */
    end(dt: number): void {
        const drag = (k: number) => Math.pow(k, dt);
        this.sparks = this.sparks.filter(s => (s.life -= dt) > 0);
        for (const s of this.sparks) {
            const px = s.x, py = s.y, pz = s.z, d = drag(s.drag);
            s.vx *= d; s.vy = s.vy * d - s.rise * dt; s.vz *= d;
            s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
            const k = s.life / s.max, a = project(s.ox, s.oy, s);
            const front = s.z >= 0, alpha = k * (front ? 1 : 0.55);
            const g = front ? this.core : this.back, size = Math.max(0.8, s.size * a.scale * (0.4 + 0.6 * k));
            if (s.streak) {
                const b = project(s.ox, s.oy, { x: px, y: py, z: pz });
                // A short motion streak sized by screen speed, independent of frame rate.
                const mx = a.x - b.x, my = a.y - b.y, moved = Math.hypot(mx, my);
                const len = moved > 0.01 ? Phaser.Math.Clamp(moved / Math.max(dt, 1e-3) * 0.03, 1.5, 16) / moved : 0;
                const tx = a.x - mx * len, ty = a.y - my * len;
                g.lineStyle(size * 2.2, s.color, alpha * 0.35).lineBetween(tx, ty, a.x, a.y);
                g.lineStyle(size, 0xffffff, alpha).lineBetween(tx, ty, a.x, a.y);
            } else {
                g.fillStyle(s.color, alpha * 0.35).fillCircle(a.x, a.y, size * 2);
                g.fillStyle(s.color, alpha).fillCircle(a.x, a.y, size);
            }
        }
        this.flashes = this.flashes.filter(f => (f.life -= dt) > 0);
        for (const f of this.flashes) {
            const k = f.life / f.max;
            this.halo(f.x, f.y, f.r * (1.25 - 0.25 * k), f.color, 0.75 * k * k);
            this.lightList.push({ x: f.x, y: f.y, r: f.r * 0.9 * k });
        }
    }

    /** A burst of sparks that fly in 3D: some at the lens, some away into the murk. */
    burst(x: number, y: number, color: number, count = 9, speed = 260): void {
        for (let i = 0; i < count; i++) {
            const d = randomDirection(), v = speed * (0.45 + Math.random() * 0.75);
            this.spark(x, y, 0, 0, Phaser.Math.FloatBetween(-6, 6), d.x * v, d.y * v - 40, d.z * v * 1.4, Phaser.Math.FloatBetween(0.35, 0.6), color, Phaser.Math.FloatBetween(1.4, 2.6), 0.04, -60, true);
        }
    }

    // ---------------------------------------------------------------- jellyfish

    /** Charging: a rotating cage of current wraps the bell, sparks are drawn in. */
    jellyWindup(e: Enemy, radius: number, progress: number): void {
        this.mark(e, 'windup');
        const k = Phaser.Math.Clamp(progress, 0, 1);
        this.cage(e.x, e.y, radius, 0.12 + 0.4 * k, 2 + 4 * k, 1 + 2 * k);
        this.silhouette(e.x, e.y, radius, 0.12 + 0.35 * k, 3 * k);
        // Small arcs crawl over the bell, faster as the charge builds.
        const cache = this.arcCache(e, 0.07 - 0.04 * k, () => Array.from({ length: 2 + Math.round(3 * k) }, () => {
            const a = randomDirection(), b = randomDirection(), r = 18 + 22 * k;
            const pa = project(e.x, e.y - 20, scale(a, r)), pb = project(e.x, e.y - 20, scale(b, r));
            return { points: bolt(pa.x, pa.y, pb.x, pb.y, 0.4, 3), front: a.z + b.z > 0, width: 1.4 + k, color: ELECTRIC };
        }));
        this.drawArcs(cache, 0.55 + 0.45 * k);
        if (Math.random() < 0.6 + k) {
            const d = randomDirection(), from = scale(d, radius * Phaser.Math.FloatBetween(0.85, 1.1)), t = 0.28;
            this.spark(e.x, e.y, from.x, from.y, from.z, -from.x / t, -from.y / t, -from.z / t, t, Math.random() < 0.5 ? VIOLET : ELECTRIC, 1.5, 1, 0, true);
        }
        this.halo(e.x, e.y - 15, 80 + 120 * k, VIOLET, 0.12 + 0.25 * k * (0.7 + 0.3 * Math.sin(this.time * 40)));
        this.lightList.push({ x: e.x, y: e.y - 20, r: 70 + 90 * k * (0.75 + 0.25 * Math.random()) });
    }

    /** Discharge: forked bolts fill the sphere in 3D, and one finds the player if they are inside. */
    jellyStrike(e: Enemy, radius: number, progress: number, target: Pt | null): void {
        if (this.mark(e, 'strike')) {
            this.flashes.push({ x: e.x, y: e.y - 10, r: radius * 2.4, life: 0.22, max: 0.22, color: 0xd8ccff });
            for (let i = 0; i < 26; i++) {
                const d = randomDirection(), v = Phaser.Math.FloatBetween(220, 460);
                this.spark(e.x, e.y, 0, 0, 0, d.x * v, d.y * v, d.z * v, Phaser.Math.FloatBetween(0.3, 0.6), i % 3 ? ELECTRIC : 0xffffff, Phaser.Math.FloatBetween(1.2, 2.2), 0.02, 0, true);
            }
        }
        const k = Phaser.Math.Clamp(progress, 0, 1), fade = 1 - Math.pow(k, 3);
        // Shockwave: a tilted equator ring racing out to the edge of the field.
        const wave = Math.min(1, k / 0.35);
        if (wave < 1) this.ring(e.x, e.y, radius * (0.2 + 0.85 * Phaser.Math.Easing.Cubic.Out(wave)), 0.42, 0, 1 - wave, 0xffffff, 3);
        this.cage(e.x, e.y, radius, 0.35 * fade, 3, 2);
        this.silhouette(e.x, e.y, radius, 0.7 * fade, 4);
        const cache = this.arcCache(e, 0.055, () => {
            const arcs: Arc[] = [];
            for (let i = 0; i < 7; i++) {
                const d = randomDirection(), end = project(e.x, e.y, scale(d, radius * Phaser.Math.FloatBetween(0.7, 1.02)));
                const points = bolt(e.x, e.y - 10, end.x, end.y, 0.28, 4);
                arcs.push({ points, front: d.z >= 0, width: 1.6 + end.scale, color: i % 2 ? ELECTRIC : VIOLET });
                // A fork splits from part-way along each bolt.
                const at = points[Phaser.Math.Between(4, 10)], f = randomDirection(), fork = project(at.x, at.y, scale(f, radius * 0.35));
                arcs.push({ points: bolt(at.x, at.y, fork.x, fork.y, 0.4, 3), front: d.z >= 0, width: 1, color: ELECTRIC });
            }
            if (target) arcs.push({ points: bolt(e.x, e.y - 10, target.x, target.y, 0.22, 5), front: true, width: 3.4, color: 0xffffff });
            return arcs;
        });
        this.drawArcs(cache, fade);
        if (target && Math.random() < 0.5) this.burst(target.x, target.y, ELECTRIC, 2, 200);
        this.halo(e.x, e.y - 10, radius * 1.6, VIOLET, 0.32 * fade * (0.6 + 0.4 * Math.random()));
        this.lightList.push({ x: e.x, y: e.y, r: (150 + 90 * Math.random()) * fade + 40 });
    }

    // ---------------------------------------------------------------- urchin

    /** Spines bristle and quiver before the burst. */
    urchinWindup(e: Enemy, radius: number, progress: number): void {
        this.mark(e, 'windup');
        const k = Phaser.Math.Clamp(progress, 0, 1);
        this.silhouette(e.x, e.y, radius, 0.35 + 0.5 * k, 0, URCHIN, true);
        this.spines(e, 26 + 10 * k + Math.sin(this.time * 70) * 3 * k, 0.6 + 0.4 * k);
    }

    /** Spines shoot out in every direction, including straight at the camera. */
    urchinStrike(e: Enemy, radius: number, progress: number): void {
        if (this.mark(e, 'strike')) {
            for (let i = 0; i < 16; i++) {
                const d = randomDirection(), v = Phaser.Math.FloatBetween(90, 200);
                this.spark(e.x, e.y, 0, 0, 0, d.x * v, d.y * v, d.z * v, Phaser.Math.FloatBetween(0.6, 1.1), 0xcfe8ee, Phaser.Math.FloatBetween(1.2, 2.4), 0.12, 30, false);
            }
        }
        const k = Phaser.Math.Clamp(progress, 0, 1);
        const out = k < 0.82 ? easeOutBack(k / 0.16) : 1 - Phaser.Math.Easing.Quadratic.In((k - 0.82) / 0.18);
        this.silhouette(e.x, e.y, radius, 0.6 * (1 - k * 0.6), 0, URCHIN, true);
        this.spines(e, 24 + (radius - 24) * out, 1);
    }

    // ---------------------------------------------------------------- lunges

    /** A charging predator: water is sucked toward it and a flowing path marks the lunge. */
    lungeWindup(e: Enemy, target: Pt, progress: number, color: number): void {
        this.mark(e, 'windup');
        const k = Phaser.Math.Clamp(progress, 0, 1), dx = target.x - e.x, dy = target.y - e.y, len = Math.hypot(dx, dy) || 1;
        const steps = Math.min(14, Math.floor(len / 46));
        for (let i = 1; i <= steps; i++) {
            const t = (i - ((this.time * 3) % 1)) / steps;
            if (t <= 0) continue;
            const x = e.x + dx * t, y = e.y + dy * t, nx = dx / len, ny = dy / len, s = 8 + 5 * k;
            const a = (0.3 + 0.6 * k) * Math.sin(Math.PI * t);
            for (const [g, w, c, f] of [[this.glow, 7, color, 0.3], [this.core, 2.5, color, 0.9], [this.core, 1, 0xffffff, 0.8]] as const)
                g.lineStyle(w, c, a * f).beginPath().moveTo(x - nx * s - ny * s, y - ny * s + nx * s).lineTo(x, y).lineTo(x - nx * s + ny * s, y - ny * s - nx * s).strokePath();
        }
        const r = Math.max(e.displayWidth, e.displayHeight) * 0.7;
        if (Math.random() < 0.5 + k) {
            const d = randomDirection(), from = scale(d, r * Phaser.Math.FloatBetween(0.9, 1.3)), t = 0.35;
            this.spark(e.x, e.y, from.x, from.y, from.z, -from.x / t, -from.y / t, -from.z / t, t, 0xcfeaf0, 1.1, 1, 0, true);
        }
    }

    /** The lunge itself: afterimages, a wake of bubbles and speed lines through the water. */
    lungeStrike(e: Enemy, color: number): void {
        this.mark(e, 'strike');
        const v = e.body.velocity, speed = Math.hypot(v.x, v.y);
        if (speed < 60) return;
        const timer = (this.ghostTimer.get(e) ?? 0) - this.scene.game.loop.delta / 1000;
        if (timer <= 0) { this.ghost(e, color); this.ghostTimer.set(e, 0.07); } else this.ghostTimer.set(e, timer);
        const nx = v.x / speed, ny = v.y / speed;
        for (let i = 0; i < 2; i++) {
            const along = Phaser.Math.FloatBetween(-0.5, 0.5) * e.displayWidth, side = Phaser.Math.FloatBetween(-0.6, 0.6) * e.displayHeight;
            this.spark(e.x, e.y, nx * along - ny * side, ny * along + nx * side, Phaser.Math.FloatBetween(-120, 140), -v.x * 0.35, -v.y * 0.35, 0, 0.22, 0xd8f4f8, 1, 0.05, 0, true);
        }
        if (Math.random() < 0.7) this.spark(e.x, e.y, -nx * e.displayWidth * 0.4, -ny * e.displayHeight * 0.3 + Phaser.Math.FloatBetween(-20, 20), Phaser.Math.FloatBetween(-60, 60), -v.x * 0.1, -v.y * 0.1, 0, Phaser.Math.FloatBetween(0.6, 1), 0xbfeff0, Phaser.Math.FloatBetween(1.5, 3), 0.3, 70, false);
    }

    /** An afterimage left in the lunge's wake. Ghosts swell slightly as they fade, as if left behind nearer the lens. */
    private ghost(e: Enemy, color: number): void {
        const ghost = this.scene.add.sprite(e.x, e.y, e.texture.key, e.frame.name).setScale(e.scaleX, e.scaleY).setFlipX(e.flipX).setDepth(17.8)
            .setTint(color).setAlpha(0.3).setBlendMode(Phaser.BlendModes.ADD);
        this.scene.tweens.add({ targets: ghost, alpha: 0, scaleX: e.scaleX * 1.08, scaleY: e.scaleY * 1.08, duration: 240, onComplete: () => ghost.destroy() });
    }

    /** Resets per-enemy state once it is back to patrolling. */
    idle(e: Enemy): void { this.phase.delete(e); this.arcs.delete(e); this.ghostTimer.delete(e); }

    // ---------------------------------------------------------------- projectiles

    /** A live bolt of current: crackling arcs and a fading trail. Angler lures leave a soft violet streak instead. */
    projectile(p: Phaser.GameObjects.Image, electric: boolean): void {
        const trail = this.trails.get(p) ?? [];
        trail.unshift({ x: p.x, y: p.y }); if (trail.length > 9) trail.pop();
        this.trails.set(p, trail);
        const color = electric ? ELECTRIC : 0xc8b4ff;
        for (let i = 1; i < trail.length; i++) {
            const k = 1 - i / trail.length;
            this.front.lineStyle(10 * k, color, 0.12 * k).lineBetween(trail[i - 1].x, trail[i - 1].y, trail[i].x, trail[i].y);
            this.core.lineStyle(3 * k, color, 0.6 * k).lineBetween(trail[i - 1].x, trail[i - 1].y, trail[i].x, trail[i].y);
        }
        if (electric) {
            for (let i = 0; i < 3; i++) {
                const d = randomDirection(), end = project(p.x, p.y, scale(d, Phaser.Math.FloatBetween(12, 26)));
                this.strokeArc({ points: bolt(p.x, p.y, end.x, end.y, 0.5, 2), front: d.z >= 0, width: 1, color: ELECTRIC }, 0.9);
            }
        }
        this.halo(p.x, p.y, electric ? 46 : 60, color, 0.35 + 0.15 * Math.sin(this.time * 30));
        this.lightList.push({ x: p.x, y: p.y, r: 45 });
    }
    dropTrail(p: Phaser.GameObjects.GameObject): void { this.trails.delete(p); }

    destroy(): void {
        for (const g of [this.back, this.backSolid, this.front, this.frontSolid, this.glow, this.core]) g.destroy();
        for (const h of this.halos) h.destroy();
        this.halos = []; this.sparks = []; this.arcs.clear(); this.trails.clear(); this.phase.clear(); this.ghostTimer.clear();
    }

    // ---------------------------------------------------------------- internals

    /** Records an enemy's phase; true on the first frame of a new phase. */
    private mark(e: Enemy, phase: string): boolean {
        if (this.phase.get(e) === phase) return false;
        this.phase.set(e, phase); this.arcs.delete(e);
        return true;
    }

    private arcCache(e: Enemy, every: number, make: () => Arc[]): Arc[] {
        let entry = this.arcs.get(e);
        if (!entry) { entry = { timer: 0, arcs: [] }; this.arcs.set(e, entry); }
        entry.timer -= this.scene.game.loop.delta / 1000;
        if (entry.timer <= 0) { entry.timer = every; entry.arcs = make(); }
        return entry.arcs;
    }

    private drawArcs(arcs: Arc[], alpha: number): void { for (const arc of arcs) this.strokeArc(arc, alpha); }

    /** Glow, colour and a white-hot core. Arcs behind the source are dimmer and sit under its sprite. */
    private strokeArc(arc: Arc, alpha: number): void {
        const w = arc.width;
        if (arc.front) {
            this.glow.lineStyle(w * 5, arc.color, 0.12 * alpha).strokePoints(arc.points as Phaser.Math.Vector2[]);
            this.core.lineStyle(w * 2, arc.color, 0.7 * alpha).strokePoints(arc.points as Phaser.Math.Vector2[]);
            this.core.lineStyle(Math.max(1, w * 0.7), 0xffffff, alpha).strokePoints(arc.points as Phaser.Math.Vector2[]);
        } else {
            this.back.lineStyle(w * 3, arc.color, 0.18 * alpha).strokePoints(arc.points as Phaser.Math.Vector2[]);
            this.back.lineStyle(Math.max(1, w * 0.7), 0xe8e0ff, 0.5 * alpha).strokePoints(arc.points as Phaser.Math.Vector2[]);
        }
    }

    /** A wireframe sphere of current: three spinning meridians and a tilted equator, its far half behind the creature. */
    private cage(x: number, y: number, r: number, alpha: number, jitter: number, width: number): void {
        if (alpha <= 0.01) return;
        const yaw = this.time * 1.4;
        for (let m = 0; m < 3; m++) this.ring(x, y, r, Math.PI / 2, yaw + m * Math.PI / 3, alpha, ELECTRIC, width, jitter);
        this.ring(x, y, r, 0.42, yaw, alpha, VIOLET, width, jitter);
    }

    /** A circle in 3D: `tilt` tips it toward the viewer, `yaw` spins it. Split at the horizon into front and back strokes. */
    private ring(x: number, y: number, r: number, tilt: number, yaw: number, alpha: number, color: number, width: number, jitter = 0): void {
        const n = 32, points: Projected[] = [];
        for (let i = 0; i <= n; i++) {
            const a = i / n * Math.PI * 2, j = jitter ? 1 + (Math.random() * 2 - 1) * jitter / r : 1;
            // Meridians stand upright (tilt pi/2 = a vertical circle); the equator lies nearly flat.
            const v = tilt === Math.PI / 2 ? rotate({ x: Math.cos(a) * r * j, y: Math.sin(a) * r * j, z: 0 }, yaw + Math.PI / 2, 0.25) : rotate({ x: Math.cos(a) * r * j, y: 0, z: Math.sin(a) * r * j }, yaw, tilt);
            points.push(project(x, y, v));
        }
        // Stroke each unbroken run of near-side or far-side points as one path.
        let run: Projected[] = [points[0]];
        const flush = () => {
            if (run.length < 2) return;
            const path = run as unknown as Phaser.Math.Vector2[];
            if (run[0].front) {
                this.front.lineStyle(width * 3, color, alpha * 0.25).strokePoints(path);
                this.core.lineStyle(width, 0xffffff, alpha * 0.8).strokePoints(path);
            } else this.back.lineStyle(width, color, alpha * 0.45).strokePoints(path);
        };
        for (let i = 1; i <= n; i++) {
            if (points[i].front !== run[0].front) { run.push(points[i]); flush(); run = [points[i]]; } else run.push(points[i]);
        }
        flush();
    }

    /** The field's true reach on the playable plane, so the hit area stays readable. */
    private silhouette(x: number, y: number, r: number, alpha: number, jitter: number, color = VIOLET, dashed = false): void {
        const n = 48, g = dashed ? this.frontSolid : this.front;
        g.lineStyle(2, color, alpha);
        if (dashed) {
            for (let i = 0; i < n; i += 2) {
                const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
                g.lineBetween(x + Math.cos(a0) * r, y + Math.sin(a0) * r, x + Math.cos(a1) * r, y + Math.sin(a1) * r);
            }
            return;
        }
        const points = Array.from({ length: n + 1 }, (_, i) => {
            const a = i / n * Math.PI * 2, rr = r + (i % n ? (Math.random() * 2 - 1) * jitter : 0);
            return new Phaser.Math.Vector2(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        });
        g.strokePoints(points);
    }

    /** Urchin spines as 3D needles: foreshortened when they point at you, hidden behind the body when they point away. */
    private spines(e: Enemy, length: number, alpha: number): void {
        const yaw = this.time * 0.6, base = 22;
        for (const dir of SPINES) {
            const d = rotate(dir, yaw, 0.2), quiver = 1 + Math.sin(this.time * 50 + dir.x * 20) * 0.04;
            const root = project(e.x, e.y, scale(d, base)), tip = project(e.x, e.y, scale(d, length * quiver));
            const g = d.z >= 0 ? this.frontSolid : this.backSolid, shade = d.z >= 0 ? 1 : 0.5;
            const w = 2.2 * tip.scale;
            g.lineStyle(w + 2, 0x2a1014, 0.75 * alpha * shade).lineBetween(root.x, root.y, tip.x, tip.y);
            g.lineStyle(w, d.z >= 0 ? 0xf2b49a : 0x8a5048, alpha * shade).lineBetween(root.x, root.y, tip.x, tip.y);
            if (d.z > 0.3) g.fillStyle(0xffe6d8, alpha).fillCircle(tip.x, tip.y, 1.2 * tip.scale);
        }
    }

    /** A spark at offset (x, y, z) from an origin, so its flight is projected around that origin. */
    private spark(ox: number, oy: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, color: number, size: number, drag: number, rise: number, streak: boolean): void {
        if (this.sparks.length > 360) return;
        this.sparks.push({ ox, oy, x, y, z, vx, vy, vz, life, max: life, color, size, drag, rise, streak });
    }

    /** A soft additive glow from a small pool of images, above the darkness so it reads as emitted light. */
    private halo(x: number, y: number, size: number, color: number, alpha: number): void {
        if (alpha <= 0.01) return;
        let h = this.halos[this.haloIndex];
        if (!h) { h = this.scene.add.image(0, 0, 'softlight').setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.glow); this.halos.push(h); }
        this.haloIndex++;
        h.setVisible(true).setPosition(x, y).setDisplaySize(size, size).setTint(color).setAlpha(Math.min(1, alpha));
    }
}

const scale = (v: Vec3, s: number): Vec3 => ({ x: v.x * s, y: v.y * s, z: v.z * s });
