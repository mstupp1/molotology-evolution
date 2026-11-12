import * as Phaser from 'phaser';
import type { Player } from './Player';
import type { EnemySystem } from './Enemies';
import { sweepBody, tetherPoints } from '../mechanics';
import { segmentRect, type Room, type Rect } from '../world';

export class Harpoon {
    mode: 'ready' | 'out' | 'return' | 'pull' = 'ready';
    x = 0; y = 0;
    private previousX = 0; private previousY = 0;
    private traveled = 0; private elapsed = 0; private pullTime = 0;
    private anchor: { x: number; y: number } | null = null;
    readonly head: Phaser.Physics.Arcade.Image;
    readonly weapon: Phaser.GameObjects.Image;
    readonly graphics: Phaser.GameObjects.Graphics;
    constructor(scene: Phaser.Scene, private player: Player) {
        this.graphics = scene.add.graphics().setDepth(23);
        this.head = scene.physics.add.image(0, 0, 'harpoon-head').setDisplaySize(42, 13).setDepth(25).setVisible(false);
        this.head.body!.enable = false;
        this.weapon = scene.add.image(0, 0, 'harpoon-weapon').setDisplaySize(67, 20).setOrigin(0.25, 0.5).setDepth(22).setVisible(false);
    }
    private hand(): { x: number; y: number } { return { x: this.player.centerX + this.player.facing * 16, y: this.player.centerY - (this.player.evolution === 2 ? 0 : 12) }; }
    throw(ax: number, ay: number): boolean {
        if (this.mode !== 'ready' || Math.hypot(ax, ay) < 0.1) return false;
        const hand = this.hand(), dir = new Phaser.Math.Vector2(ax, ay).normalize();
        this.mode = 'out'; this.traveled = 0; this.pullTime = 0;
        this.x = this.previousX = hand.x; this.y = this.previousY = hand.y;
        this.head.enableBody(true, hand.x, hand.y, true, true).setRotation(dir.angle()).setAlpha(1);
        const body = this.head.body as Phaser.Physics.Arcade.Body;
        body.allowGravity = true; body.setGravityY(85).setDragX(22);
        body.setVelocity(dir.x * 1060 + this.player.body.velocity.x * 0.25, dir.y * 1060 + this.player.body.velocity.y * 0.15);
        return true;
    }
    release(): void {
        if (this.mode === 'pull') {
            this.player.body.allowGravity = true; this.player.state = 'Fall';
            this.player.setAcceleration(0, 0); this.anchor = null;
        }
        if (this.mode !== 'ready') { this.mode = 'return'; this.head.body!.enable = false; }
    }
    update(dt: number, room: Room, enemies: EnemySystem, geometry: Rect[] = room.platforms): void {
        const p = this.player; this.elapsed += dt;
        if (this.mode === 'out') {
            const nx = this.head.x, ny = this.head.y;
            let hitT = 1.01;
            let hit: { type: 'wall' | 'anchor' | 'enemy'; index: number } | null = null;
            const check = (r: Rect, type: 'wall' | 'anchor' | 'enemy', index: number) => {
                const t = segmentRect(this.previousX, this.previousY, nx, ny, r);
                if (t !== null && t < hitT) { hitT = t; hit = { type, index }; }
            };
            geometry.forEach((r, i) => check(r, 'wall', i));
            room.anchors.forEach((a, i) => check({ x: a.x - 25, y: a.y - 25, w: 50, h: 50 }, 'anchor', i));
            enemies.list.forEach((e, i) => { if (e.active) check({ x: e.body.x, y: e.body.y, w: e.body.width, h: e.body.height }, 'enemy', i); });
            const result = hit as { type: 'wall' | 'anchor' | 'enemy'; index: number } | null;
            this.x = this.previousX + (nx - this.previousX) * Math.min(hitT, 1); this.y = this.previousY + (ny - this.previousY) * Math.min(hitT, 1);
            this.traveled += Math.hypot(this.x - this.previousX, this.y - this.previousY);
            this.previousX = this.x; this.previousY = this.y;
            this.head.setPosition(this.x, this.y);
            const body = this.head.body as Phaser.Physics.Arcade.Body;
            this.head.setRotation(body.velocity.angle());
            if (result?.type === 'anchor') {
                this.anchor = room.anchors[result.index]; this.x = this.anchor.x; this.y = this.anchor.y;
                this.head.body!.enable = false; this.mode = 'pull'; p.detach(); p.state = 'HarpoonPull'; p.body.allowGravity = false; p.setAcceleration(0, 0);
            } else if (result) {
                if (result.type === 'enemy') { const e = enemies.list[result.index]; enemies.hit(e, 38 + p.evolution * 8, p.facing, e.boss || e.kind === 'octopus' || e.kind === 'urchin' ? undefined : p.centerX); }
                this.release();
            } else if (this.traveled > 850 || Math.hypot(this.x - p.centerX, this.y - p.centerY) > 880) this.release();
        } else if (this.mode === 'return') {
            const hand = this.hand(), v = new Phaser.Math.Vector2(hand.x - this.x, hand.y - this.y), distance = v.length();
            if (distance < 25) { this.mode = 'ready'; this.head.setVisible(false); }
            else { v.normalize().scale(Math.min(distance, 1450 * dt)); this.x += v.x; this.y += v.y; this.head.setPosition(this.x, this.y).setRotation(v.angle()); }
        } else if (this.mode === 'pull' && this.anchor) {
            this.pullTime += dt;
            const a = this.anchor, v = new Phaser.Math.Vector2(a.x - p.centerX, a.y - p.centerY), distance = v.length();
            if (distance < 38) {
                const landing = room.platforms.filter(r => r.y > a.y + 20 && r.y < a.y + 160 && a.x >= r.x - 140 && a.x <= r.x + r.w + 140).sort((r, q) => r.y - q.y)[0];
                this.release();
                if (landing) {
                    const x = Phaser.Math.Clamp(a.x, landing.x + p.body.width / 2 + 5, landing.x + landing.w - p.body.width / 2 - 5);
                    const y = landing.y - p.body.height / 2;
                    if (sweepBody(p.centerX, p.centerY, x, y, p.body.width, p.body.height, geometry) === null) p.mantleTo(x, landing.y);
                }
            } else {
                const speed = Math.min(760, 180 + distance * 2.3), desired = v.normalize().scale(speed);
                const blend = Math.min(1, dt * 10), vx = Phaser.Math.Linear(p.body.velocity.x, desired.x, blend), vy = Phaser.Math.Linear(p.body.velocity.y, desired.y, blend);
                const blocked = sweepBody(p.centerX, p.centerY, p.centerX + vx * dt, p.centerY + vy * dt, p.body.width, p.body.height, geometry) !== null;
                const cableBlocked = geometry.some(r => segmentRect(p.centerX, p.centerY, a.x, a.y, r) !== null);
                if (blocked || cableBlocked || this.pullTime > 3) { this.release(); p.setVelocity(0, 0); }
                else p.setVelocity(vx, vy);
            }
        }
    }
    draw(aim: boolean, ax: number, ay: number, room: Room, equipped = true): void {
        this.graphics.clear(); const p = this.player, hand = this.hand();
        // Aim/throw frames already contain the weapon; the independent sprite is wielded at rest.
        this.weapon.setVisible(equipped && p.state !== 'MeleeAttack' && !p.surface && !['HarpoonAim', 'HarpoonThrow', 'LedgeGrab', 'Mantle', 'Death'].includes(p.state));
        this.weapon.setPosition(hand.x, hand.y + (aim ? 0 : 6)).setRotation(aim ? Math.atan2(ay, ax) : p.facing > 0 ? 0.35 : Math.PI - 0.35).setFlipY(aim ? ax < 0 : p.facing < 0).setAlpha(p.alpha);
        if (this.mode !== 'ready') {
            const points = tetherPoints(hand, { x: this.x, y: this.y }, this.mode === 'pull' ? 0.06 : this.mode === 'return' ? 0.9 : 0.45, this.elapsed);
            this.graphics.lineStyle(3, 0x142a31, 0.9).beginPath().moveTo(hand.x, hand.y);
            points.slice(1).forEach(q => this.graphics.lineTo(q.x, q.y)); this.graphics.strokePath();
            this.graphics.lineStyle(1.2, this.mode === 'pull' ? 0x8ef0df : 0xd6bd87, 0.95).beginPath().moveTo(hand.x, hand.y);
            points.slice(1).forEach(q => this.graphics.lineTo(q.x, q.y)); this.graphics.strokePath();
            this.head.setPosition(this.x, this.y).setVisible(true);
        }
        if (aim && this.mode === 'ready') {
            const x = hand.x + ax * 200, y = hand.y + ay * 200;
            for (let d = 50; d < 200; d += 18) this.graphics.fillStyle(0xe6d9ad, 0.5).fillCircle(hand.x + ax * d, hand.y + ay * d, 1.5);
            this.graphics.lineStyle(1, 0xeee0b1, 0.9).strokeCircle(x, y, 9);
            this.graphics.lineBetween(x - 15, y, x - 5, y).lineBetween(x + 5, y, x + 15, y).lineBetween(x, y - 15, x, y - 5).lineBetween(x, y + 5, x, y + 15);
            for (const a of room.anchors) {
                const v = new Phaser.Math.Vector2(a.x - hand.x, a.y - hand.y);
                if (v.length() < 850 && v.normalize().dot(new Phaser.Math.Vector2(ax, ay)) > 0.975) this.graphics.lineStyle(2, 0x9ef8db).strokeCircle(a.x, a.y, 32);
            }
        }
    }
    destroy(): void { this.graphics.destroy(); this.head.destroy(); this.weapon.destroy(); }
}
