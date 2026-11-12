import * as Phaser from 'phaser';
import type { Evolution, PlayerState } from '../constants';
import type { Rect } from '../world';
import type { InputFrame } from './Controls';

export class Player extends Phaser.Physics.Arcade.Sprite {
    declare body: Phaser.Physics.Arcade.Body;
    state: PlayerState = 'Idle'; facing = 1; evolution: Evolution = 0;
    dashTime = 0; dashCooldown = 0; hurtTime = 0;
    private coyote = 0; private jumpBuffer = 0; private elapsed = 0;
    private ledge: { x: number; y: number } | null = null;
    private mantleTime = 0;
    private compact = false;
    private visual: Phaser.GameObjects.Sprite;
    constructor(scene: Phaser.Scene, x: number, y: number) {
        super(scene, x, y, 'diver', 0);
        scene.add.existing(this); scene.physics.add.existing(this);
        this.setDepth(20).setCollideWorldBounds(true);
        this.setVisible(false);
        this.visual = scene.add.sprite(x, y, 'diver', 0).setDepth(20);
        this.body.setSize(36, 86).setOffset(62, 64);
        this.setMaxVelocity(900, 900);
    }
    get centerX(): number { return this.body.center.x; }
    get centerY(): number { return this.body.center.y; }
    get feet(): number { return this.body.bottom; }
    resetAt(x: number, feet: number): void {
        this.body.reset(x, feet - 70); this.setVelocity(0, 0); this.ledge = null; this.mantleTime = 0;
        this.body.allowGravity = true; this.body.moves = true; this.body.setSize(36, 86).setOffset(62, 64);
        this.compact = false; this.dashTime = 0; this.hurtTime = 0; this.state = 'Idle';
    }
    private standingClear(platforms: Rect[]): boolean {
        const r = { x: this.body.center.x - 18, y: this.body.bottom - 86, w: 36, h: 85 };
        return !platforms.some(p => r.x < p.x + p.w && r.x + r.w > p.x && r.y < p.y + p.h && r.y + r.h > p.y);
    }
    updateController(dt: number, input: InputFrame, air: boolean, platforms: Rect[], busy: boolean): void {
        this.elapsed += dt; this.dashCooldown = Math.max(0, this.dashCooldown - dt); this.hurtTime = Math.max(0, this.hurtTime - dt);
        if (this.state === 'Death') { this.setVelocity(0, 0); return; }
        if (this.state === 'HarpoonPull') return;
        if (this.mantleTime > 0) { this.mantleTime -= dt; this.state = 'Mantle'; return; }
        if (this.ledge) {
            this.state = 'LedgeGrab'; this.body.allowGravity = false; this.setVelocity(0, 0);
            if (input.jump || input.y < -0.3) {
                const ledge = this.ledge; this.ledge = null; this.state = 'Mantle'; this.mantleTime = 0.25;
                this.scene.tweens.add({ targets: this, x: ledge.x, y: ledge.y - 70, duration: 220, ease: 'Sine.Out', onComplete: () => { this.body.reset(ledge.x, ledge.y - 70); this.body.allowGravity = true; this.body.moves = true; } });
            } else if (input.y > 0.3) { this.ledge = null; this.body.allowGravity = true; this.setVelocityY(90); }
            return;
        }
        this.setGravityY(air ? 1300 : 430).setDragX(air ? 2200 : 720);
        this.coyote = this.body.blocked.down ? 0.12 : Math.max(0, this.coyote - dt);
        this.jumpBuffer = input.jump ? 0.14 : Math.max(0, this.jumpBuffer - dt);
        if (input.dash && this.dashCooldown === 0 && !busy && this.hurtTime === 0) {
            const direction = new Phaser.Math.Vector2(input.x || (!input.y ? this.facing : 0), this.evolution === 2 ? input.y : 0).normalize();
            this.dashTime = this.evolution === 2 ? 0.27 : 0.19; this.dashCooldown = 0.72;
            this.setAcceleration(0, 0);
            this.setVelocity(direction.x * (this.evolution === 2 ? 820 : 570), direction.y * 820);
            this.body.allowGravity = false;
            if (this.evolution === 2) { this.body.setSize(36, 30).setOffset(62, 120); this.compact = true; }
        }
        if (this.dashTime > 0) {
            this.dashTime = Math.max(0, this.dashTime - dt); this.state = this.evolution === 2 ? 'Dash' : 'Dodge';
            if (this.dashTime === 0) { this.body.allowGravity = true; this.setVelocityX(this.body.velocity.x * 0.35); }
            return;
        }
        if (this.compact) {
            if (this.standingClear(platforms)) { this.body.setSize(36, 86).setOffset(62, 64); this.compact = false; }
            // Remain compact beneath a duct ceiling so an expired Dash cannot embed the body.
            else if (Math.abs(input.x) > 0.1) { this.setVelocityX(input.x * 280); this.state = 'Dash'; return; }
        }
        if (this.hurtTime > 0) { this.state = 'Hurt'; return; }
        if (Math.abs(input.x) > 0.05) {
            this.facing = input.x > 0 ? 1 : -1;
            this.setAccelerationX(input.x * (air ? 2400 : 1400));
            this.body.velocity.x = Phaser.Math.Clamp(this.body.velocity.x, -235, 235);
        } else this.setAccelerationX(0);
        if (this.jumpBuffer > 0 && this.coyote > 0 && !this.compact) {
            this.setVelocityY(air ? -545 : -455); this.coyote = 0; this.jumpBuffer = 0;
        }
        if (!input.jumpHeld && this.body.velocity.y < -160) this.setVelocityY(this.body.velocity.y * 0.68);
        this.state = this.body.blocked.down ? (Math.abs(this.body.velocity.x) > 22 ? 'Walk' : 'Idle') : this.body.velocity.y < 0 ? 'Jump' : 'Fall';
        if (!busy && this.body.velocity.y > 30 && input.y <= 0.1 && !this.compact) {
            for (const p of platforms) {
                if (p.h > 100 || Math.abs(this.body.top + 18 - p.y) > 20) continue;
                const edge = this.facing > 0 ? p.x : p.x + p.w;
                if (Math.abs(this.centerX + this.facing * 25 - edge) > 19) continue;
                const targetX = edge + this.facing * 28;
                if (platforms.some(q => q !== p && targetX + 18 > q.x && targetX - 18 < q.x + q.w && p.y > q.y && p.y - 86 < q.y + q.h)) continue;
                this.ledge = { x: targetX, y: p.y }; this.setAccelerationX(0); this.setVelocity(0, 0); break;
            }
        }
    }
    animate(oxygenLow: boolean, replenishing: boolean): void {
        const state = this.state;
        const pose = state === 'Walk' ? (Math.floor(this.elapsed * 9) % 2) + 1 : ['Jump', 'Fall', 'Dash', 'Dodge', 'LedgeGrab', 'Mantle'].includes(state) ? 3 : state === 'MeleeAttack' ? 4 : state.startsWith('Harpoon') ? 5 : 0;
        if (state === 'Walk') this.visual.play(`walk-${this.evolution}`, true);
        else { this.visual.anims.stop(); this.visual.setFrame(this.evolution * 6 + pose); }
        this.visual.setFlipX(this.facing < 0).setAlpha(this.alpha);
        const scaleY = state === 'Dash' ? 0.42 : state === 'Idle' ? 1 + Math.sin(this.elapsed * (oxygenLow ? 8 : 2)) * 0.008 : 1;
        // Art can breathe and compress in a duct without scaling the collision body.
        this.visual.setPosition(this.x, this.y + 70 * (1 - scaleY)).setScale(1, scaleY);
        this.visual.setAngle(state === 'Death' ? -80 * this.facing : state === 'Hurt' ? -8 * this.facing : 0);
        if (replenishing) this.visual.setTint(0xa2ffe4); else if (oxygenLow && Math.sin(this.elapsed * 7) > 0.4) this.visual.setTint(0xe49b9a); else this.visual.clearTint();
    }
}
