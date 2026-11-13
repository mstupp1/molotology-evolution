import * as Phaser from 'phaser';
import { BUBBLE, bubbleDamage } from '../combat';
import { chargeAt, HARPOON, type Charge } from '../harpoonPhysics';
import { segmentRect, type Rect } from '../world';
import type { Player } from './Player';
import type { Enemy, EnemySystem } from './Enemies';
import type { HarpoonEvent } from './Harpoon';

/** Final-form ranged weapon. Arcade owns the pooled bodies; sweeps resolve fast impacts. */
export class BubbleShot {
    held = 0; cooldown = 0; shot: Charge = chargeAt(0);
    private released = chargeAt(0);
    readonly projectiles: Phaser.Physics.Arcade.Group;
    readonly graphics: Phaser.GameObjects.Graphics;
    constructor(scene: Phaser.Scene, private player: Player) {
        this.projectiles = scene.physics.add.group({ defaultKey: 'bubble', maxSize: 8, allowGravity: false });
        this.graphics = scene.add.graphics().setDepth(25).setBlendMode(Phaser.BlendModes.ADD);
    }
    get charge(): Charge { return chargeAt(this.held); }
    tickCharge(dt: number, aiming: boolean): void {
        this.cooldown = Math.max(0, this.cooldown - dt);
        if (aiming && this.cooldown === 0) this.held += dt;
        else { if (this.held > 0) this.released = chargeAt(this.held); this.held = 0; }
    }
    fire(ax: number, ay: number): boolean {
        if (this.cooldown > 0 || Math.hypot(ax, ay) < 0.1) return false;
        const p = this.player, v = new Phaser.Math.Vector2(ax, ay).normalize();
        const x = p.centerX + v.x * 38, y = p.centerY + v.y * 38;
        const b = this.projectiles.get(x, y, 'bubble') as Phaser.Physics.Arcade.Image | null;
        if (!b) return false;
        this.shot = this.released; this.released = chargeAt(0); this.cooldown = BUBBLE.cooldown;
        const speed = Phaser.Math.Linear(BUBBLE.minSpeed, BUBBLE.maxSpeed, this.shot.power);
        b.enableBody(true, x, y, true, true).setDepth(25).setDisplaySize(this.shot.perfect ? 32 : 24, this.shot.perfect ? 32 : 24).setTint(this.shot.perfect ? 0xffffff : 0x9ffff1).setAlpha(1).setBlendMode(Phaser.BlendModes.ADD);
        b.setVelocity(v.x * speed, v.y * speed).setData({ age: 0, charge: { ...this.shot }, previous: { x: p.centerX, y: p.centerY } });
        return true;
    }
    update(dt: number, geometry: Rect[], enemies: EnemySystem): HarpoonEvent[] {
        const events: HarpoonEvent[] = [];
        for (const child of this.projectiles.getChildren()) {
            const b = child as Phaser.Physics.Arcade.Image; if (!b.active) continue;
            const from = b.getData('previous') as { x: number; y: number }, charge = b.getData('charge') as Charge;
            const age = Number(b.getData('age')) + dt; b.setData('age', age);
            let earliest = 1.01, victim: Enemy | null = null, weak = false;
            for (const r of geometry) { const t = segmentRect(from.x, from.y, b.x, b.y, r); if (t !== null && t < earliest) { earliest = t; victim = null; } }
            for (const e of enemies.list) {
                if (!e.active || e.health <= 0) continue;
                for (const zone of e.hitZones) {
                    const t = segmentRect(from.x, from.y, b.x, b.y, zone.rect);
                    if (t !== null && t < earliest) { earliest = t; victim = e; weak = zone.weak; }
                }
            }
            if (earliest <= 1 || age >= BUBBLE.life) {
                const x = from.x + (b.x - from.x) * Math.min(1, earliest), y = from.y + (b.y - from.y) * Math.min(1, earliest);
                if (victim) {
                    const result = enemies.hit(victim, bubbleDamage(charge), Math.sign(b.body!.velocity.x) || this.player.facing, undefined, weak);
                    if (result) events.push({ type: 'enemy', x, y, ...result, perfect: charge.perfect });
                }
                enemies.fx.burst(x, y, charge.perfect ? 0xe0ffff : 0x8fffe1, charge.perfect ? 18 : 10, 210);
                b.disableBody(true, true);
            } else b.setData('previous', { x: b.x, y: b.y });
        }
        return events;
    }
    draw(aiming: boolean, ax: number, ay: number): void {
        const g = this.graphics; g.clear(); if (!aiming) return;
        const charge = this.charge, x = this.player.centerX + ax * 38, y = this.player.centerY + ay * 38;
        const fill = Math.min(1, this.held / HARPOON.chargeTime), color = charge.perfect ? 0xffffff : 0x8fffe1;
        g.lineStyle(2, color, 0.4).lineBetween(x, y, x + ax * 100, y + ay * 100);
        g.lineStyle(4, 0x184b50, 0.9).strokeCircle(x, y, 17);
        g.lineStyle(3, color, 1).beginPath().arc(x, y, 17, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, fill)).strokePath();
        if (charge.perfect) g.fillStyle(0xd4ffff, 0.5).fillCircle(x, y, 12).lineStyle(2, color, 0.8).strokeCircle(x, y, 25);
    }
    cancel(): void { this.held = 0; this.released = chargeAt(0); this.graphics.clear(); }
}
