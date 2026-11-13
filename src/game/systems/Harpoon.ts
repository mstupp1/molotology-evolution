import * as Phaser from 'phaser';
import type { Player } from './Player';
import type { EnemySystem } from './Enemies';
import { sweepBody } from '../mechanics';
import { chargeAt, HARPOON, launchSpeed, predictArc, reelSpeed, Rope, shotDamage, spent, stepProjectile, type Charge, type Projectile } from '../harpoonPhysics';
import { segmentRect, type Room, type Rect } from '../world';

export type HarpoonEvent =
    | { type: 'enemy'; x: number; y: number; damage: number; perfect: boolean; weak?: boolean }
    | { type: 'wall'; x: number; y: number; perfect: boolean }
    | { type: 'latch'; x: number; y: number }
    | { type: 'snap'; x: number; y: number }
    | { type: 'home'; x: number; y: number };

const ROPE_NODES = 30, SUBSTEP = 1 / 120, ANCHOR_RADIUS = 34, TRAIL = 12;

export class Harpoon {
    mode: 'ready' | 'out' | 'stuck' | 'return' | 'pull' = 'ready';
    x = 0; y = 0;
    /** Seconds the aim has been held while ready: drives the charge. */
    held = 0;
    /** The charge of the shot in flight (or the last one). */
    shot: Charge = chargeAt(0);
    readonly rope: Rope;
    private released: Charge = chargeAt(0);
    private projectile: Projectile = { x: 0, y: 0, vx: 0, vy: 0 };
    private age = 0; private elapsed = 0; private pullTime = 0; private stuckTime = 0; private reel = 0; private angle = 0; private quiver = 0; private drifting = false;
    private anchor: { x: number; y: number } | null = null;
    private trail: { x: number; y: number }[] = [];
    readonly head: Phaser.GameObjects.Image;
    readonly weapon: Phaser.GameObjects.Image;
    readonly graphics: Phaser.GameObjects.Graphics;
    private readonly glow: Phaser.GameObjects.Graphics;
    constructor(scene: Phaser.Scene, private player: Player) {
        this.graphics = scene.add.graphics().setDepth(23);
        this.glow = scene.add.graphics().setDepth(24).setBlendMode(Phaser.BlendModes.ADD);
        this.head = scene.add.image(0, 0, 'harpoon-head').setDisplaySize(42, 13).setDepth(25).setVisible(false);
        this.weapon = scene.add.image(0, 0, 'harpoon-weapon').setDisplaySize(67, 20).setOrigin(0.25, 0.5).setDepth(22).setVisible(false);
        this.rope = new Rope(ROPE_NODES, 0, 0);
    }
    private hand(): { x: number; y: number } { return { x: this.player.centerX + this.player.facing * 16, y: this.player.centerY - (this.player.evolution === 2 ? 0 : 12) }; }
    /** The line leaves the spool at the muzzle, ahead of the hand. */
    private muzzle(): { x: number; y: number } {
        const h = this.hand(), dx = this.x - h.x, dy = this.y - h.y, d = Math.hypot(dx, dy);
        if (this.mode === 'ready' || d < 1) return { x: h.x + this.player.facing * 30, y: h.y };
        const reach = Math.min(30, d * 0.5);
        return { x: h.x + dx / d * reach, y: h.y + dy / d * reach };
    }
    /** Current charge while aiming, for the indicator and the preview. */
    get charge(): Charge { return chargeAt(this.held); }
    /** Call every frame before `throw`: holding the aim builds charge, letting go locks it in. */
    tickCharge(dt: number, aiming: boolean): void {
        if (aiming && this.mode === 'ready') this.held += dt;
        else { if (this.held > 0) this.released = chargeAt(this.held); this.held = 0; }
    }
    private launch(ax: number, ay: number, charge: Charge): Projectile {
        const hand = this.hand(), dir = new Phaser.Math.Vector2(ax, ay).normalize(), speed = launchSpeed(charge), v = this.player.body.velocity;
        return { x: hand.x + dir.x * 30, y: hand.y + dir.y * 30, vx: dir.x * speed + v.x * 0.3, vy: dir.y * speed + v.y * 0.2 };
    }
    throw(ax: number, ay: number): boolean {
        if (this.mode !== 'ready' || Math.hypot(ax, ay) < 0.1) return false;
        this.shot = this.released; this.released = chargeAt(0);
        this.projectile = this.launch(ax, ay, this.shot);
        this.mode = 'out'; this.age = 0; this.pullTime = 0; this.reel = 0; this.trail = [];
        this.x = this.projectile.x; this.y = this.projectile.y; this.angle = Math.atan2(this.projectile.vy, this.projectile.vx);
        this.rope.reset(this.x, this.y);
        this.head.setPosition(this.x, this.y).setRotation(this.angle).setAlpha(1).setVisible(true);
        // Recoil: a light diver is nudged back by the shot.
        const kick = 40 + 70 * this.shot.power, body = this.player.body;
        body.velocity.x -= Math.sign(ax) * kick * Math.min(1, Math.abs(ax) + 0.2);
        if (!body.blocked.down) body.velocity.y -= ay * kick * 0.6;
        return true;
    }
    release(): void {
        if (this.mode === 'pull') {
            this.player.body.allowGravity = true; this.player.state = 'Fall';
            this.player.setAcceleration(0, 0); this.anchor = null;
        }
        if (this.mode !== 'ready' && this.mode !== 'return') { this.mode = 'return'; this.reel = 0; this.pullTime = 0; this.drifting = false; }
    }
    cancel(): void {
        if (this.mode === 'pull') this.release();
        this.mode = 'ready'; this.held = 0; this.released = chargeAt(0); this.anchor = null; this.trail = [];
        this.head.setVisible(false); this.weapon.setVisible(false); this.graphics.clear(); this.glow.clear();
    }
    update(dt: number, room: Room, enemies: EnemySystem, geometry: Rect[] = room.platforms): HarpoonEvent[] {
        const p = this.player, events: HarpoonEvent[] = [], hand = this.muzzle(); this.elapsed += dt;
        if (this.mode === 'out') {
            for (let left = dt; left > 1e-6 && this.mode === 'out'; left -= SUBSTEP) {
                const step = Math.min(SUBSTEP, left), from = this.projectile, next = stepProjectile(from, step);
                this.age += step;
                let hitT = 1.01, hit: { type: 'wall' | 'anchor' | 'enemy'; index: number; weak: boolean } | null = null;
                const check = (r: Rect, type: 'wall' | 'anchor' | 'enemy', index: number, weak = false) => {
                    const t = segmentRect(from.x, from.y, next.x, next.y, r);
                    if (t !== null && t < hitT) { hitT = t; hit = { type, index, weak }; }
                };
                geometry.forEach((r, i) => check(r, 'wall', i));
                room.anchors.forEach((a, i) => check({ x: a.x - ANCHOR_RADIUS, y: a.y - ANCHOR_RADIUS, w: ANCHOR_RADIUS * 2, h: ANCHOR_RADIUS * 2 }, 'anchor', i));
                enemies.list.forEach((e, i) => { if (e.active && e.health > 0) e.hitZones.forEach(z => check(z.rect, 'enemy', i, z.weak)); });
                const t = Math.min(hitT, 1);
                this.x = from.x + (next.x - from.x) * t; this.y = from.y + (next.y - from.y) * t;
                this.projectile = { ...next, x: this.x, y: this.y };
                this.angle = Math.atan2(next.vy, next.vx);
                const result = hit as { type: 'wall' | 'anchor' | 'enemy'; index: number; weak: boolean } | null;
                if (result?.type === 'anchor') {
                    this.anchor = room.anchors[result.index]; this.x = this.anchor.x; this.y = this.anchor.y;
                    this.mode = 'pull'; p.detach(); p.state = 'HarpoonPull'; p.body.allowGravity = false; p.setAcceleration(0, 0);
                    events.push({ type: 'latch', x: this.x, y: this.y });
                } else if (result?.type === 'enemy') {
                    const e = enemies.list[result.index], damage = shotDamage(38 + p.evolution * 8, this.shot);
                    const resolved = enemies.hit(e, damage, Math.sign(this.projectile.vx) || p.facing, e.boss || e.kind === 'octopus' || e.kind === 'urchin' ? undefined : p.centerX, result.weak);
                    if (resolved) events.push({ type: 'enemy', x: this.x, y: this.y, ...resolved, perfect: this.shot.perfect });
                    this.stick(0.1);
                } else if (result) {
                    events.push({ type: 'wall', x: this.x, y: this.y, perfect: this.shot.perfect });
                    this.stick(this.shot.perfect ? 0.32 : 0.24);
                } else if (Math.hypot(this.x - hand.x, this.y - hand.y) > HARPOON.maxLine) {
                    // The spool runs out: the line snaps taut and yanks the shaft to a stop.
                    events.push({ type: 'snap', x: this.x, y: this.y }); this.release();
                } else if (spent(this.projectile, this.age)) { this.stick(0.2); this.drifting = true; }
            }
            // The spool pays out freely, so the line trails longer than the straight span and bellies in the water.
            this.rope.length = Math.min(HARPOON.maxLine * 1.15, Math.max(this.rope.length, Math.hypot(this.x - hand.x, this.y - hand.y) * 1.08));
            if (this.shot.perfect) { this.trail.push({ x: this.x, y: this.y }); if (this.trail.length > TRAIL) this.trail.shift(); }
        } else if (this.mode === 'stuck') {
            this.stuckTime -= dt; this.quiver *= Math.exp(-dt * 9);
            if (this.drifting) {
                // A spent shaft coasts to a stop and starts to sink while the line goes slack.
                const next = stepProjectile(this.projectile, dt), damp = Math.exp(-dt * 6);
                next.vx *= damp; next.vy *= damp;
                if (!geometry.some(r => segmentRect(this.x, this.y, next.x, next.y, r) !== null)) { this.projectile = next; this.x = next.x; this.y = next.y; }
                this.angle = Phaser.Math.Angle.RotateTo(this.angle, Math.atan2(next.vy, next.vx), dt * 2.5);
            }
            if (this.stuckTime <= 0) this.release();
        } else if (this.mode === 'return') {
            this.pullTime += dt;
            this.reel = reelSpeed(this.reel, dt);
            // The winch takes in line; slack goes first, then the shaft is dragged home along the rope.
            this.rope.length = Math.max(0, Math.min(this.rope.length, this.rope.span() + 40) - this.reel * dt);
            const tail = this.rope.nodes[this.rope.count - 1], before = this.rope.nodes[this.rope.count - 3];
            this.x = tail.x; this.y = tail.y;
            if (Math.hypot(tail.x - before.x, tail.y - before.y) > 2) this.angle = Math.atan2(tail.y - before.y, tail.x - before.x);
            if (this.rope.length < 22 || Math.hypot(this.x - hand.x, this.y - hand.y) < 22 || this.pullTime > 2.5) {
                this.mode = 'ready'; this.head.setVisible(false); this.trail = [];
                events.push({ type: 'home', x: hand.x, y: hand.y });
            }
        } else if (this.mode === 'pull' && this.anchor) {
            this.pullTime += dt;
            const a = this.anchor, v = new Phaser.Math.Vector2(a.x - p.centerX, a.y - p.centerY), distance = v.length();
            // Tension: the winch takes the slack out fast, so the line snaps straight.
            this.rope.length = Math.max(this.rope.span() * 0.98, this.rope.length - 2600 * dt);
            if (distance < 38) {
                const landing = room.platforms.filter(r => r.y > a.y + 20 && r.y < a.y + 160 && a.x >= r.x - 140 && a.x <= r.x + r.w + 140).sort((r, q) => r.y - q.y)[0];
                this.release();
                if (landing) {
                    const x = Phaser.Math.Clamp(a.x, landing.x + p.body.width / 2 + 5, landing.x + landing.w - p.body.width / 2 - 5);
                    const y = landing.y - p.body.height / 2;
                    if (sweepBody(p.centerX, p.centerY, x, y, p.body.width, p.body.height, geometry) === null) p.mantleTo(x, landing.y);
                }
            } else {
                // The pull eases in as the line takes the load, then hauls hard.
                const ramp = Math.min(1, this.pullTime / 0.18), speed = Math.min(780, 180 + distance * 2.3) * (0.35 + 0.65 * ramp), desired = v.normalize().scale(speed);
                const blend = Math.min(1, dt * 10), vx = Phaser.Math.Linear(p.body.velocity.x, desired.x, blend), vy = Phaser.Math.Linear(p.body.velocity.y, desired.y, blend);
                const blocked = sweepBody(p.centerX, p.centerY, p.centerX + vx * dt, p.centerY + vy * dt, p.body.width, p.body.height, geometry) !== null;
                const cableBlocked = geometry.some(r => segmentRect(p.centerX, p.centerY, a.x, a.y, r) !== null);
                if (blocked || cableBlocked || this.pullTime > 3) { this.release(); p.setVelocity(0, 0); }
                else p.setVelocity(vx, vy);
            }
        }
        if (this.mode !== 'ready') {
            const pinned = this.mode === 'return' ? null : { x: this.x, y: this.y };
            // Substep the rope so fast flight and hard reels stay stable.
            const steps = Math.max(1, Math.ceil(dt / (1 / 90)));
            for (let i = 0; i < steps; i++) this.rope.step(dt / steps, hand, pinned, geometry);
            if (this.mode === 'return') { const tail = this.rope.nodes[this.rope.count - 1]; this.x = tail.x; this.y = tail.y; }
        }
        return events;
    }
    private stick(seconds: number): void {
        this.mode = 'stuck'; this.stuckTime = seconds; this.quiver = 1; this.drifting = false;
        this.projectile = { ...this.projectile, vx: 0, vy: 0 };
    }
    draw(aim: boolean, ax: number, ay: number, room: Room, equipped = true, geometry: Rect[] = room.platforms): void {
        this.graphics.clear(); this.glow.clear();
        const p = this.player, hand = this.hand(), muzzle = this.muzzle();
        // Aim/throw frames already contain the weapon; the independent sprite is wielded at rest.
        this.weapon.setVisible(equipped && p.state !== 'MeleeAttack' && !p.surface && !['HarpoonAim', 'HarpoonThrow', 'LedgeGrab', 'Mantle', 'Death'].includes(p.state));
        this.weapon.setPosition(hand.x, hand.y + (aim ? 0 : 6)).setRotation(aim ? Math.atan2(ay, ax) : p.facing > 0 ? 0.35 : Math.PI - 0.35).setFlipY(aim ? ax < 0 : p.facing < 0).setAlpha(p.alpha);
        if (this.mode !== 'ready') {
            const nodes = smooth([muzzle, ...this.rope.nodes.slice(1)]), taut = this.mode === 'pull' || this.rope.span() > this.rope.length * 0.96;
            const line = (width: number, color: number, alpha: number) => {
                this.graphics.lineStyle(width, color, alpha).beginPath().moveTo(nodes[0].x, nodes[0].y);
                for (let i = 1; i < nodes.length; i++) this.graphics.lineTo(nodes[i].x, nodes[i].y);
                this.graphics.strokePath();
            };
            line(3.8, 0x142a31, 0.85);
            line(1.8, taut ? (this.mode === 'pull' ? 0x8ef0df : 0xf0dcae) : 0xbfa577, 0.95);
            // Fibre twist: a faint offset highlight that only shows on a slack line.
            if (!taut) {
                this.graphics.lineStyle(0.8, 0x6b5a3e, 0.6).beginPath();
                nodes.forEach((n, i) => { const o = i % 2 ? 1 : -1; if (i === 0) this.graphics.moveTo(n.x, n.y + o); else this.graphics.lineTo(n.x, n.y + o); });
                this.graphics.strokePath();
            }
            const quiver = this.mode === 'stuck' ? Math.sin(this.elapsed * 70) * 0.16 * this.quiver : 0;
            this.head.setPosition(this.x, this.y).setRotation(this.angle + quiver).setVisible(true).setTint(this.shot.perfect && this.mode === 'out' ? 0xfff4d0 : 0xffffff);
            if (this.trail.length > 1) {
                for (let i = 1; i < this.trail.length; i++) {
                    const k = i / this.trail.length, a = this.trail[i - 1], b = this.trail[i];
                    this.glow.lineStyle(2 + 9 * k, 0x9ff6ff, 0.05 + 0.35 * k).lineBetween(a.x, a.y, b.x, b.y);
                }
                this.glow.fillStyle(0xffffff, 0.55).fillCircle(this.x, this.y, 7);
            }
        }
        if (aim && this.mode === 'ready') this.drawAim(ax, ay, room, hand, geometry);
    }
    private drawAim(ax: number, ay: number, room: Room, hand: { x: number; y: number }, geometry: Rect[]): void {
        const charge = this.charge, g = this.graphics;
        const { points, hit } = predictArc(this.launch(ax, ay, charge), geometry);
        // Which anchor (if any) the arc passes through.
        const anchor = room.anchors.find(a => points.some(q => Math.abs(q.x - a.x) < ANCHOR_RADIUS && Math.abs(q.y - a.y) < ANCHOR_RADIUS));
        const tint = charge.perfect ? 0xffffff : anchor ? 0x9ef8db : 0xe6d9ad;
        const marks = points.length;
        for (let i = 4; i < marks; i += 3) {
            const q = points[i], fade = 1 - 0.6 * i / marks;
            g.fillStyle(0x061018, 0.5 * fade).fillCircle(q.x, q.y + 1, 2.8 + fade);
            g.fillStyle(tint, (charge.perfect ? 1 : 0.85) * fade).fillCircle(q.x, q.y, 1.6 + fade);
        }
        const end = points[points.length - 1];
        if (anchor) g.lineStyle(2, 0x9ef8db).strokeCircle(anchor.x, anchor.y, 32 + Math.sin(this.elapsed * 8) * 2);
        else if (hit) g.lineStyle(1.5, tint, 0.8).lineBetween(end.x - 6, end.y - 6, end.x + 6, end.y + 6).lineBetween(end.x - 6, end.y + 6, end.x + 6, end.y - 6);
        else g.lineStyle(1, tint, 0.6).strokeCircle(end.x, end.y, 6);
        // Charge ring at the muzzle: it fills with power, an approach ring closes on it,
        // and it flashes white while the perfect window is open.
        const cx = hand.x + ax * 38, cy = hand.y + ay * 38, r = 15;
        const fill = (charge.power - HARPOON.minPower) / (1 - HARPOON.minPower), start = -Math.PI / 2;
        g.lineStyle(4, 0x0a1a22, 0.75).strokeCircle(cx, cy, r);
        g.lineStyle(3, charge.full ? 0xf2c46b : 0xd9b884, 0.95).beginPath().arc(cx, cy, r, start, start + Math.PI * 2 * Math.max(0.02, fill)).strokePath();
        if (!charge.full) {
            const approach = r + 26 * (1 - this.held / HARPOON.chargeTime);
            g.lineStyle(1.2, 0xffffff, 0.25 + 0.5 * (this.held / HARPOON.chargeTime)).strokeCircle(cx, cy, approach);
        }
        if (charge.perfect) {
            const pulse = 1 - charge.window;
            this.glow.lineStyle(3, 0xbff9ff, 0.9 * pulse).strokeCircle(cx, cy, r + 2 + 6 * charge.window);
            this.glow.fillStyle(0xffffff, 0.35 * pulse).fillCircle(cx, cy, r - 3);
        }
    }
    destroy(): void { this.graphics.destroy(); this.glow.destroy(); this.head.destroy(); this.weapon.destroy(); }
}

/** Catmull-Rom through the rope nodes so the line curves instead of kinking at each node. */
function smooth(points: { x: number; y: number }[], subdivisions = 3): { x: number; y: number }[] {
    const out = [points[0]];
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
        for (let k = 1; k <= subdivisions; k++) {
            const t = k / subdivisions, t2 = t * t, t3 = t2 * t;
            out.push({
                x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
                y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
            });
        }
    }
    return out;
}
