import * as Phaser from 'phaser';
import type { EnemyKind, EnemySpawn, Rect } from '../world';
import { segmentRect } from '../world';
import type { Player } from './Player';

export const ENEMY_INFO: Record<EnemyKind, { frame: number; width: number; height: number; hp: number; damage: number; name: string }> = {
    urchin: { frame: 0, width: 74, height: 74, hp: 48, damage: 12, name: 'Spine Urchin' },
    jellyfish: { frame: 1, width: 100, height: 130, hp: 58, damage: 14, name: 'Electric Jellyfish' },
    octopus: { frame: 2, width: 148, height: 130, hp: 110, damage: 18, name: 'Hull Octopus' },
    shark: { frame: 3, width: 210, height: 110, hp: 135, damage: 22, name: 'Abyssal Shark' },
    handcrab: { frame: 4, width: 235, height: 210, hp: 420, damage: 20, name: 'THE UNLISTED DIVER' },
    hermit: { frame: 5, width: 260, height: 240, hp: 540, damage: 24, name: 'THE BORROWED SHELL' },
    angler: { frame: 6, width: 390, height: 330, hp: 820, damage: 28, name: 'THE LAST LIGHT' }
};
export class Enemy extends Phaser.Physics.Arcade.Sprite {
    declare body: Phaser.Physics.Arcade.Body;
    health: number; maxHealth: number;
    mode: 'patrol' | 'windup' | 'strike' | 'recover' = 'patrol'; timer = 1.8; elapsed = 0;
    target = new Phaser.Math.Vector2(); home = new Phaser.Math.Vector2(); cycles = 0; stun = 0; flash = 0;
    constructor(scene: Phaser.Scene, readonly spec: EnemySpawn, swimming: boolean) {
        super(scene, spec.x, spec.y, `creature-${ENEMY_INFO[spec.kind].frame}`);
        scene.add.existing(this); scene.physics.add.existing(this);
        const info = ENEMY_INFO[spec.kind]; this.health = this.maxHealth = info.hp;
        this.setDisplaySize(info.width, info.height).setDepth(18).setCollideWorldBounds(true);
        this.body.setSize(this.width * 0.67, this.height * 0.66).setOffset(this.width * 0.16, this.height * 0.2);
        this.body.allowGravity = !swimming; this.body.gravity.y = swimming ? 0 : 430;
        if (!swimming) this.y = 850 - info.height * 0.36;
        this.home.set(this.x, this.y); this.timer += (spec.x % 7) * 0.15;
    }
    get kind(): EnemyKind { return this.spec.kind; }
    get boss(): boolean { return this.kind === 'handcrab' || this.kind === 'hermit' || this.kind === 'angler'; }
    takeDamage(amount: number, direction: number, pullX?: number): boolean {
        if (this.health <= 0) return false;
        this.health = Math.max(0, this.health - amount); this.stun = this.boss ? 0.12 : 0.32;
        this.setVelocityX(pullX === undefined ? direction * 150 : Math.sign(pullX - this.x) * 380);
        this.flash = 0.07; this.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
        return true;
    }
}
export class GroundedEnemy extends Enemy { constructor(scene: Phaser.Scene, spec: EnemySpawn) { super(scene, spec, false); } }
export class SwimmingEnemy extends Enemy { constructor(scene: Phaser.Scene, spec: EnemySpawn) { super(scene, spec, true); } }
export class EnemySystem {
    list: Enemy[] = [];
    projectiles: Phaser.Physics.Arcade.Group;
    graphics: Phaser.GameObjects.Graphics;
    private collider: Phaser.Physics.Arcade.Collider;
    constructor(scene: Phaser.Scene, platforms: Phaser.Physics.Arcade.StaticGroup, specs: EnemySpawn[], defeated: string[], private geometry: Rect[], private damagePlayer: (damage: number, fromX: number) => void, private onKill: (enemy: Enemy) => void) {
        this.projectiles = scene.physics.add.group({ defaultKey: 'spark', maxSize: 18, allowGravity: false });
        this.graphics = scene.add.graphics().setDepth(21);
        for (const spec of specs) {
            if (defeated.includes(spec.id)) continue;
            this.list.push(['jellyfish', 'shark', 'angler'].includes(spec.kind) ? new SwimmingEnemy(scene, spec) : new GroundedEnemy(scene, spec));
        }
        this.collider = scene.physics.add.collider(this.list, platforms);
    }
    blocked(ax: number, ay: number, bx: number, by: number): boolean { return this.geometry.some(r => segmentRect(ax, ay, bx, by, r) !== null); }
    shoot(e: Enemy, player: Player, spread = 0): void {
        const ox = e.kind === 'angler' ? (e.flipX ? 120 : -120) : 0, oy = e.kind === 'angler' ? -90 : 0;
        for (let i = -spread; i <= spread; i++) {
            const shot = this.projectiles.get(e.x + ox, e.y + oy, 'spark') as Phaser.Physics.Arcade.Image | null;
            if (!shot) return;
            shot.enableBody(true, e.x + ox, e.y + oy, true, true).setDepth(22).setCircle(6).setScale(1.4).setTint(e.kind === 'angler' ? 0xc8b4ff : 0x8ce9fa).setBlendMode(Phaser.BlendModes.ADD);
            shot.setData('life', 7); const v = new Phaser.Math.Vector2(player.centerX - e.x - ox, player.centerY - e.y - oy).normalize().rotate(i * 0.28).scale(e.kind === 'angler' ? 175 : 150);
            shot.setVelocity(v.x, v.y);
        }
    }
    update(dt: number, player: Player): void {
        this.graphics.clear();
        for (const e of this.list) {
            if (!e.active || e.health <= 0) continue;
            e.elapsed += dt; e.timer -= dt;
            const dx = player.centerX - e.x, dy = player.centerY - e.y, distance = Math.hypot(dx, dy);
            e.setFlipX(dx > 0);
            if (e.flash > 0) { e.flash -= dt; if (e.flash <= 0) e.setTintMode(Phaser.TintModes.MULTIPLY).setTint(0xff9d8b); }
            if (e.stun > 0) { e.stun -= dt; continue; } else if (e.mode !== 'windup') e.clearTint();
            if (e.kind === 'angler' && e.health < e.maxHealth / 2 && e.mode !== 'windup') e.setTint(0xd8c4ff);
            const enraged = e.kind === 'angler' && e.health < e.maxHealth / 2;
            if (e.mode === 'patrol') {
                if (e.kind === 'jellyfish') { e.setVelocity(Math.cos(e.elapsed * 0.6) * 45, Math.sin(e.elapsed * 0.9) * 35); }
                else if (e.kind === 'shark' || e.kind === 'angler') {
                    e.setVelocity(Math.cos(e.elapsed * 0.45) * (e.kind === 'shark' ? 95 : 65), (e.home.y - e.y) * 0.65);
                } else if (e.kind === 'octopus') {
                    // Cling and crawl up a wall or along an underside when contact permits it.
                    const clinging = e.body.blocked.left || e.body.blocked.right || e.body.blocked.up;
                    e.body.allowGravity = !clinging;
                    if (e.body.blocked.left || e.body.blocked.right) e.setVelocityY(-23);
                    else e.setVelocityX(Math.sin(e.elapsed * 0.4) * 18);
                } else if (e.boss) e.setVelocityX(Math.sign(dx) * 43);
                else e.setVelocityX(0);
                const reach = e.kind === 'urchin' ? 260 : e.kind === 'octopus' ? 380 : e.kind === 'jellyfish' ? 380 : e.boss ? 850 : 650;
                if (e.timer <= 0 && distance < reach && !this.blocked(e.x, e.y, player.centerX, player.centerY)) {
                    e.mode = 'windup'; e.timer = e.kind === 'urchin' ? 0.65 : enraged ? 0.55 : 0.85;
                    e.target.set(player.centerX, player.centerY); e.setVelocity(0, 0);
                }
            } else if (e.mode === 'windup') {
                e.setVelocityX(0); e.setTint(Math.sin(e.elapsed * 30) > 0 ? 0xff9d8b : 0xffffff);
                this.graphics.lineStyle(2, e.kind === 'jellyfish' ? 0xbb9bff : 0xe99c7d, 0.5);
                if (e.kind === 'jellyfish' || e.kind === 'urchin') this.graphics.strokeCircle(e.x, e.y, e.kind === 'jellyfish' ? 135 : 90);
                else this.graphics.lineBetween(e.x, e.y, e.target.x, e.target.y);
                if (e.timer <= 0) {
                    e.mode = 'strike'; e.timer = e.kind === 'octopus' ? 0.35 : e.kind === 'urchin' ? 1.3 : 0.6; e.cycles++;
                    if (['shark', 'angler', 'handcrab', 'hermit'].includes(e.kind)) {
                        const v = new Phaser.Math.Vector2(e.target.x - e.x, ['shark', 'angler'].includes(e.kind) ? e.target.y - e.y : 0).normalize();
                        e.setVelocity(v.x * (enraged ? 570 : e.boss ? 420 : 540), v.y * 340);
                    }
                    if (e.kind === 'jellyfish' && e.cycles % 3 === 0) this.shoot(e, player);
                    if (e.kind === 'angler' && (enraged || e.cycles % 2 === 0)) this.shoot(e, player, enraged ? 1 : 0);
                }
            } else if (e.mode === 'strike') {
                if (e.kind === 'jellyfish' || e.kind === 'urchin') {
                    const r = e.kind === 'jellyfish' ? 135 : 90;
                    this.graphics.fillStyle(e.kind === 'jellyfish' ? 0xb79afa : 0xe99c7d, 0.12).fillCircle(e.x, e.y, r);
                    this.graphics.lineStyle(2, 0xc6b4ff, 0.85).strokeCircle(e.x, e.y, r);
                    if (distance < r + 16) this.damagePlayer(ENEMY_INFO[e.kind].damage, e.x);
                }
                if (e.kind === 'octopus') {
                    this.graphics.lineStyle(12, 0x67334c).lineBetween(e.x, e.y, e.target.x, e.target.y);
                    this.graphics.lineStyle(3, 0xe297a0).lineBetween(e.x, e.y - 3, e.target.x, e.target.y - 3);
                    const hit = Phaser.Geom.Intersects.LineToRectangle(new Phaser.Geom.Line(e.x, e.y, e.target.x, e.target.y), new Phaser.Geom.Rectangle(player.body.x, player.body.y, player.body.width, player.body.height));
                    if (hit) this.damagePlayer(18, e.x);
                }
                if (e.timer <= 0 || e.body.blocked.left || e.body.blocked.right) { e.mode = 'recover'; e.timer = e.kind === 'angler' ? (enraged ? 1.3 : 1.7) : e.boss ? 1.25 : 1; e.setVelocity(0, 0); }
            } else {
                // After a lunge the Angler hangs open-jawed and drifts back up: a readable punish window.
                if (e.kind === 'angler') { e.setVelocity(0, (e.home.y - e.y) * 0.9); if (Math.sin(e.elapsed * 12) > 0) e.setTint(0xffe0a0); }
                if (e.timer <= 0) { e.mode = 'patrol'; e.timer = enraged ? 0.45 : 1.1; }
            }
            const harmless = e.kind === 'urchin' || e.kind === 'angler' && e.mode === 'recover';
            if (!harmless && Phaser.Geom.Intersects.RectangleToRectangle(new Phaser.Geom.Rectangle(player.body.x, player.body.y, player.body.width, player.body.height), new Phaser.Geom.Rectangle(e.body.x, e.body.y, e.body.width, e.body.height))) this.damagePlayer(ENEMY_INFO[e.kind].damage, e.x);
            if (e.health < e.maxHealth && !e.boss) {
                this.graphics.fillStyle(0x0a101c).fillRect(e.x - 26, e.y - e.displayHeight / 2 - 14, 52, 4);
                this.graphics.fillStyle(0xe5877c).fillRect(e.x - 26, e.y - e.displayHeight / 2 - 14, 52 * e.health / e.maxHealth, 4);
            }
        }
        this.projectiles.getChildren().forEach(child => {
            const p = child as Phaser.Physics.Arcade.Image;
            if (!p.active) return;
            const life = Number(p.getData('life')) - dt; p.setData('life', life);
            const body = p.body as Phaser.Physics.Arcade.Body;
            if (life <= 0 || this.blocked(p.x - body.velocity.x * dt, p.y - body.velocity.y * dt, p.x, p.y)) { p.disableBody(true, true); return; }
            if (Phaser.Geom.Intersects.RectangleToRectangle(new Phaser.Geom.Rectangle(player.body.x, player.body.y, player.body.width, player.body.height), new Phaser.Geom.Rectangle(body.x, body.y, body.width, body.height))) { this.damagePlayer(15, p.x); p.disableBody(true, true); }
        });
    }
    hit(e: Enemy, amount: number, direction: number, pullX?: number): boolean {
        if (!e.takeDamage(amount, direction, pullX)) return false;
        if (e.health === 0) {
            // The body stops colliding at once; the sprite lingers for a short death animation.
            e.disableBody(true, false); e.setTint(0xffd8c8).setTintMode(Phaser.TintModes.FILL);
            e.scene.tweens.add({ targets: e, alpha: 0, scaleX: e.scaleX * 1.25, scaleY: e.scaleY * 0.6, angle: direction * (e.boss ? 8 : 25), y: e.y + (e.boss ? 40 : 20), duration: e.boss ? 1400 : 520, ease: 'Quad.In', onComplete: () => e.setVisible(false) });
            this.onKill(e);
        }
        return true;
    }
    destroy(): void { this.collider.destroy(); this.list.forEach(e => e.destroy()); this.list = []; this.projectiles.clear(true, true); this.projectiles.destroy(); this.graphics.destroy(); }
}
