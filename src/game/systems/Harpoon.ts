import * as Phaser from 'phaser';
import type { Player } from './Player';
import type { EnemySystem } from './Enemies';
import { segmentRect, type Room, type Rect } from '../world';

export class Harpoon {
    mode: 'ready' | 'out' | 'return' | 'pull' = 'ready';
    x = 0; y = 0; private vx = 0; private vy = 0; private traveled = 0;
    private anchor: { x: number; y: number } | null = null;
    graphics: Phaser.GameObjects.Graphics;
    constructor(scene: Phaser.Scene, private player: Player) { this.graphics = scene.add.graphics().setDepth(25); }
    throw(ax: number, ay: number): boolean {
        if (this.mode !== 'ready') return false;
        this.mode = 'out'; this.x = this.player.centerX; this.y = this.player.centerY - 15;
        const dir = new Phaser.Math.Vector2(ax, ay).normalize(); this.vx = dir.x * 1050; this.vy = dir.y * 1050; this.traveled = 0;
        return true;
    }
    update(dt: number, room: Room, enemies: EnemySystem): void {
        const p = this.player;
        if (this.mode === 'out') {
            const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
            let hitT = 1.01;
            let hit: { type: 'wall' | 'anchor' | 'enemy'; index: number } | null = null;
            const check = (rect: Rect, type: 'wall' | 'anchor' | 'enemy', index: number) => {
                const t = segmentRect(this.x, this.y, nx, ny, rect);
                if (t !== null && t < hitT) { hitT = t; hit = { type, index }; }
            };
            room.platforms.forEach((r, i) => check(r, 'wall', i));
            room.anchors.forEach((a, i) => check({ x: a.x - 27, y: a.y - 27, w: 54, h: 54 }, 'anchor', i));
            enemies.list.forEach((e, i) => { if (e.active) check({ x: e.body.x, y: e.body.y, w: e.body.width, h: e.body.height }, 'enemy', i); });
            const result = hit as { type: 'wall' | 'anchor' | 'enemy'; index: number } | null;
            this.x += (nx - this.x) * Math.min(hitT, 1); this.y += (ny - this.y) * Math.min(hitT, 1);
            this.traveled += Math.hypot(this.vx, this.vy) * dt;
            if (result?.type === 'anchor') {
                this.anchor = room.anchors[result.index]; this.mode = 'pull'; p.state = 'HarpoonPull'; p.body.allowGravity = false; p.setAcceleration(0, 0);
            } else if (result) {
                if (result.type === 'enemy') { const e = enemies.list[result.index]; enemies.hit(e, 38 + p.evolution * 8, p.facing, e.boss || e.kind === 'octopus' || e.kind === 'urchin' ? undefined : p.centerX); }
                this.mode = 'return';
            } else if (this.traveled > 850) this.mode = 'return';
        } else if (this.mode === 'return') {
            const v = new Phaser.Math.Vector2(p.centerX - this.x, p.centerY - this.y);
            if (v.length() < 40) this.mode = 'ready';
            else { v.normalize().scale(1450 * dt); this.x += v.x; this.y += v.y; }
        } else if (this.mode === 'pull' && this.anchor) {
            const a = this.anchor;
            const v = new Phaser.Math.Vector2(a.x - p.centerX, a.y - p.centerY);
            const nextX = p.centerX + v.clone().normalize().x * 720 * dt;
            const nextY = p.centerY + v.clone().normalize().y * 720 * dt;
            const obstructed = room.platforms.some(r => segmentRect(p.centerX, p.centerY, nextX, nextY, { x: r.x - 18, y: r.y - 18, w: r.w + 36, h: r.h + 36 }) !== null);
            if (v.length() < 36) {
                const landing = room.platforms.filter(r => r.y > a.y + 20 && r.y < a.y + 160 && a.x >= r.x - 140 && a.x <= r.x + r.w + 140).sort((r, q) => r.y - q.y)[0];
                if (landing) {
                    const lx = Phaser.Math.Clamp(a.x, landing.x + 30, landing.x + landing.w - 30);
                    const safe = !room.platforms.some(r => r !== landing && segmentRect(p.centerX, p.centerY, lx, landing.y - 45, r) !== null);
                    if (safe) p.resetAt(lx, landing.y);
                }
                p.body.allowGravity = true; p.setVelocity(0, -80); p.state = 'Fall'; this.mode = 'return';
            } else if (obstructed || p.body.blocked.up || p.body.blocked.left || p.body.blocked.right) {
                p.body.allowGravity = true; p.setVelocity(0, 0); p.state = 'Fall'; this.mode = 'return';
            } else { v.normalize().scale(720); p.setVelocity(v.x, v.y); }
        }
    }
    draw(aim: boolean, ax: number, ay: number, room: Room): void {
        this.graphics.clear(); const p = this.player;
        if (this.mode !== 'ready') {
            this.graphics.lineStyle(1.5, 0xd6c9a1, 0.9).lineBetween(p.centerX, p.centerY - 12, this.x, this.y);
            this.graphics.fillStyle(0xa6e4e3).fillCircle(this.x, this.y, 5);
        }
        if (aim && this.mode === 'ready') {
            const x = p.centerX + ax * 200, y = p.centerY + ay * 200;
            this.graphics.lineStyle(1, 0xe6d9ad, 0.45).lineBetween(p.centerX + ax * 45, p.centerY + ay * 45, x, y);
            this.graphics.lineStyle(1, 0xeee0b1, 0.9).strokeCircle(x, y, 9);
            this.graphics.lineBetween(x - 15, y, x - 5, y).lineBetween(x + 5, y, x + 15, y).lineBetween(x, y - 15, x, y - 5).lineBetween(x, y + 5, x, y + 15);
            for (const a of room.anchors) {
                const v = new Phaser.Math.Vector2(a.x - p.centerX, a.y - p.centerY);
                if (v.length() < 850 && v.normalize().dot(new Phaser.Math.Vector2(ax, ay)) > 0.975) this.graphics.lineStyle(2, 0x9ef8db).strokeCircle(a.x, a.y, 32);
            }
        }
    }
    destroy(): void { this.graphics.destroy(); }
}
