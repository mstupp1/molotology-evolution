import * as Phaser from 'phaser';
import type { Evolution, PlayerState } from '../constants';
import { LEDGE_HANDS, playerAnimation, PLAYER_TEXTURES, type PlayerAnimation } from '../animation';
import { abilities } from '../mechanics';
import type { Rect } from '../world';
import type { InputFrame } from './Controls';

type Surface = 'left' | 'right' | 'ceiling';
export class Player extends Phaser.Physics.Arcade.Sprite {
    declare body: Phaser.Physics.Arcade.Body;
    state: PlayerState = 'Idle'; facing = 1;
    private form: Evolution = 0;
    get evolution(): Evolution { return this.form; }
    set evolution(value: Evolution) { if (this.form !== value) { this.form = value; this.detach(); this.standingBody(); } }
    dashTime = 0; dashCooldown = 0; hurtTime = 0;
    private coyote = 0; private jumpBuffer = 0; private elapsed = 0;
    private ledge: { x: number; y: number; edge: number } | null = null;
    private mantleOffset = { x: 0, y: 0 };
    private ledgeTime = 0; private mantleTime = 0; private compact = false;
    surface: Surface | null = null;
    private attachment: Rect | null = null;
    private reattachDelay = 0;
    private grounded = true; private airTime = 0; private squash = 0;
    private landedTime = 0;
    private previousState: PlayerState = 'Idle';
    readonly visual: Phaser.GameObjects.Sprite;
    landed = 0; jumped = false;
    constructor(scene: Phaser.Scene, x: number, y: number) {
        super(scene, x, y, 'diver', 0);
        scene.add.existing(this); scene.physics.add.existing(this);
        this.setDepth(20).setCollideWorldBounds(true).setVisible(false);
        this.visual = scene.add.sprite(x, y, PLAYER_TEXTURES[0], 24).setOrigin(0.5, 150 / 160).setDepth(20);
        this.body.setSize(36, 86).setOffset(62, 64); this.setMaxVelocity(950, 950);
    }
    get centerX(): number { return this.body.center.x; }
    get centerY(): number { return this.body.center.y; }
    get feet(): number { return this.body.bottom; }
    get visualCenter(): { x: number; y: number } {
        const bounds = this.scene.cache.json.get('motion-manifest').players[this.visual.texture.key].bounds[Number(this.visual.frame.name)] as number[];
        return this.visual.getWorldTransformMatrix().transformPoint((bounds[0] + bounds[2]) / 2 - this.visual.displayOriginX, (bounds[1] + bounds[3]) / 2 - this.visual.displayOriginY, new Phaser.Math.Vector2());
    }
    private placeBody(x: number, feet: number): void {
        this.body.reset(x, feet - 70);
        // reset() uses the texture's top-left. Apply the custom collision offset now,
        // before contacts, cable sweeps and the visual sprite read the new body.
        this.body.updateFromGameObject();
        this.body.prev.copy(this.body.position); this.body.prevFrame.copy(this.body.position);
    }
    private resizeBody(w: number, h: number): void {
        if (this.body.width === w && this.body.height === h) return;
        const x = this.centerX, y = this.centerY;
        this.body.setSize(w, h).setOffset(80 - w / 2, 150 - h);
        this.placeBody(x, y + h / 2);
    }
    private standingBody(): void { this.resizeBody(this.form === 2 ? 64 : 36, this.form === 2 ? 44 : 86); }
    resetAt(x: number, feet: number): void {
        this.detach(); this.standingBody(); this.placeBody(x, feet);
        this.setVelocity(0, 0).setAcceleration(0, 0); this.ledge = null; this.mantleTime = 0;
        this.body.allowGravity = true; this.body.moves = true; this.compact = false;
        this.dashTime = 0; this.hurtTime = 0; this.state = 'Idle';
    }
    detach(): void {
        this.surface = null; this.attachment = null; this.reattachDelay = 0.25;
        this.body.allowGravity = true;
    }
    mantleTo(x: number, feet: number): void {
        this.detach(); this.ledge = null; this.mantleTime = 0.36; this.state = 'Mantle';
        this.body.allowGravity = false; this.body.moves = false; this.setAcceleration(0, 0).setVelocity(0, 0);
        this.scene.tweens.add({ targets: this, x, y: feet - 70, duration: 330, ease: 'Sine.InOut', onComplete: () => this.resetAt(x, feet) });
    }
    private standingClear(platforms: Rect[]): boolean {
        const w = this.form === 2 ? 64 : 36, h = this.form === 2 ? 44 : 86;
        const r = { x: this.centerX - w / 2, y: this.feet - h, w, h: h - 1 };
        return !platforms.some(p => r.x < p.x + p.w && r.x + r.w > p.x && r.y < p.y + p.h && r.y + r.h > p.y);
    }
    private attach(surface: Surface, r: Rect): void {
        const oldFeet = this.feet;
        this.surface = surface; this.attachment = r; this.state = 'Scuttle'; this.ledge = null;
        this.body.allowGravity = false; this.setAcceleration(0, 0).setDrag(0, 0);
        this.resizeBody(surface === 'ceiling' ? 64 : 44, surface === 'ceiling' ? 44 : 64);
        const x = surface === 'right' ? r.x - this.body.width / 2 : surface === 'left' ? r.x + r.w + this.body.width / 2 : this.centerX;
        const feet = surface === 'ceiling' ? r.y + r.h + this.body.height : oldFeet;
        this.placeBody(x, feet);
    }
    private scuttle(input: InputFrame, platforms: Rect[]): boolean {
        if (!abilities(this.form).scuttle || this.reattachDelay > 0 || this.dashTime > 0 || this.hurtTime > 0) return false;
        const b = this.body;
        if (this.surface && (input.jump || this.surface === 'ceiling' && input.drop)) {
            const side = this.surface; this.detach(); this.standingBody();
            this.setVelocity(side === 'right' ? -220 : side === 'left' ? 220 : input.x * 180, side === 'ceiling' ? 100 : -300);
            this.state = side === 'ceiling' ? 'Fall' : 'Jump'; this.jumped = side !== 'ceiling'; return true;
        }
        // Walk around an overhang's outside corner, then climb onto its top.
        if (this.surface === 'ceiling' && this.attachment) {
            const r = this.attachment;
            if (input.x < -0.2 && this.centerX <= r.x + 2) this.attach('right', r);
            else if (input.x > 0.2 && this.centerX >= r.x + r.w - 2) this.attach('left', r);
        }
        const ceiling = platforms.find(r => Math.abs(b.top - (r.y + r.h)) < 12 && b.right > r.x + 3 && b.left < r.x + r.w - 3);
        const right = platforms.find(r => Math.abs(b.right - r.x) < 12 && b.bottom > r.y + 3 && b.top < r.y + r.h - 3);
        const left = platforms.find(r => Math.abs(b.left - (r.x + r.w)) < 12 && b.bottom > r.y + 3 && b.top < r.y + r.h - 3);
        if (ceiling && (this.surface !== null || input.y < -0.3 || input.jumpHeld)) this.attach('ceiling', ceiling);
        else if (right && (this.surface === 'right' || input.x > 0.3)) this.attach('right', right);
        else if (left && (this.surface === 'left' || input.x < -0.3)) this.attach('left', left);
        else if (this.surface && this.attachment) {
            const r = this.attachment;
            // Wrap a convex upper corner onto its walkable top, preserving body clearance.
            if (this.surface !== 'ceiling' && b.bottom <= r.y + 14 && input.y < -0.1) {
                const x = this.surface === 'right' ? r.x + 34 : r.x + r.w - 34;
                const clear = !platforms.some(q => q !== r && x + 32 > q.x && x - 32 < q.x + q.w && r.y > q.y && r.y - 44 < q.y + q.h);
                if (clear) { this.resetAt(x, r.y); return true; }
            }
            this.detach(); this.standingBody(); return false;
        }
        if (!this.surface) return false;
        this.state = 'Scuttle'; this.body.allowGravity = false;
        if (this.surface === 'ceiling') {
            this.setVelocity(input.x * 165, -35); if (input.x) this.facing = Math.sign(input.x);
        } else {
            this.setVelocity(this.surface === 'right' ? 35 : -35, input.y * 165);
            if (input.y) this.facing = input.y < 0 ? 1 : -1;
        }
        return true;
    }
    updateController(dt: number, input: InputFrame, air: boolean, platforms: Rect[], busy: boolean): void {
        this.landed = 0; this.jumped = false; this.elapsed += dt;
        this.reattachDelay = Math.max(0, this.reattachDelay - dt); this.landedTime = Math.max(0, this.landedTime - dt);
        this.dashCooldown = Math.max(0, this.dashCooldown - dt); this.hurtTime = Math.max(0, this.hurtTime - dt);
        const grounded = this.body.blocked.down;
        if (grounded && !this.grounded && this.airTime > 0.18) { this.landed = Math.min(1, this.airTime / 0.9); this.squash = 0.1 + 0.12 * this.landed; this.landedTime = 0.16; }
        this.airTime = grounded ? 0 : this.airTime + dt; this.grounded = grounded; this.squash *= Math.pow(0.0005, dt);
        if (this.state === 'Death') { this.setVelocity(0, 0); return; }
        if (this.state === 'HarpoonPull') return;
        if (this.mantleTime > 0) { this.mantleTime -= dt; this.state = 'Mantle'; return; }
        if (this.ledge) {
            this.ledgeTime += dt; this.state = 'LedgeGrab'; this.body.allowGravity = false; this.setAcceleration(0, 0).setVelocity(0, 0);
            if (this.ledgeTime > 0.2 && (input.jump || input.y < -0.3)) {
                const ledge = this.ledge; this.mantleOffset = { x: this.visual.x - this.centerX, y: this.visual.y - this.feet }; this.ledge = null; this.state = 'Mantle'; this.mantleTime = 0.38; this.body.moves = false;
                this.scene.tweens.add({ targets: this, x: ledge.x, y: ledge.y - 70, duration: 350, ease: 'Sine.InOut', onComplete: () => this.resetAt(ledge.x, ledge.y) });
            } else if (input.y > 0.3) { this.ledge = null; this.reattachDelay = 0.3; this.body.allowGravity = true; this.setVelocityY(90); }
            return;
        }
        if (input.dash && this.surface && this.dashCooldown === 0 && !busy) { this.detach(); this.standingBody(); }
        if (this.scuttle(input, platforms)) return;
        if (!this.compact && !this.surface) this.standingBody();
        this.setGravityY(air ? 1300 : 430).setDrag(air ? 2200 : 720, 0);
        this.coyote = grounded ? 0.12 : Math.max(0, this.coyote - dt); this.jumpBuffer = input.jump ? 0.14 : Math.max(0, this.jumpBuffer - dt);
        if (input.dash && this.dashCooldown === 0 && !busy && this.hurtTime === 0) {
            const enhanced = abilities(this.form).dash;
            const direction = new Phaser.Math.Vector2(input.x || (!input.y ? this.facing : 0), enhanced ? input.y : 0).normalize();
            this.dashTime = enhanced ? 0.27 : 0.19; this.dashCooldown = 0.72; this.setAcceleration(0, 0);
            this.body.allowGravity = false;
            if (enhanced) { const feet = this.feet; this.resizeBody(this.form === 2 ? 64 : 36, 30); this.placeBody(this.centerX, feet); this.compact = true; }
            this.setVelocity(direction.x * (enhanced ? 820 : 570), direction.y * 820);
        }
        if (this.dashTime > 0) {
            this.dashTime = Math.max(0, this.dashTime - dt); this.state = abilities(this.form).dash ? 'Dash' : 'Dodge';
            if (this.dashTime === 0) { this.body.allowGravity = true; this.setVelocityX(this.body.velocity.x * 0.35); }
            return;
        }
        if (this.compact) {
            if (this.standingClear(platforms)) { const feet = this.feet; this.standingBody(); this.placeBody(this.centerX, feet); this.compact = false; }
            else if (Math.abs(input.x) > 0.1) { this.setVelocityX(input.x * 280); this.state = 'Dash'; return; }
        }
        if (this.hurtTime > 0) { this.state = 'Hurt'; return; }
        if (Math.abs(input.x) > 0.05) { this.facing = Math.sign(input.x); this.setAccelerationX(input.x * (air ? 2400 : 1400)); this.body.velocity.x = Phaser.Math.Clamp(this.body.velocity.x, -235, 235); }
        else this.setAccelerationX(0);
        if (this.jumpBuffer > 0 && this.coyote > 0 && !this.compact) { this.setVelocityY(air ? -545 : -455); this.coyote = 0; this.jumpBuffer = 0; this.jumped = true; this.squash = -0.12; }
        if (!input.jumpHeld && this.body.velocity.y < -160) this.setVelocityY(this.body.velocity.y * 0.68);
        this.state = grounded ? (Math.abs(this.body.velocity.x) > 22 ? 'Walk' : 'Idle') : this.body.velocity.y < 0 ? 'Jump' : 'Fall';
        if (!busy && this.form < 2 && this.reattachDelay === 0 && this.body.velocity.y > 30 && input.y <= 0.1 && !this.compact) {
            for (const r of platforms) {
                if (r.h > 100 || Math.abs(this.body.top + 18 - r.y) > 20) continue;
                const edge = this.facing > 0 ? r.x : r.x + r.w;
                if (Math.abs(this.centerX + this.facing * 25 - edge) > 19) continue;
                const x = edge + this.facing * 28;
                if (platforms.some(q => q !== r && x + 18 > q.x && x - 18 < q.x + q.w && r.y > q.y && r.y - 86 < q.y + q.h)) continue;
                this.ledge = { x, y: r.y, edge }; this.ledgeTime = 0; this.setAcceleration(0, 0).setVelocity(0, 0); break;
            }
        }
    }
    animate(oxygenLow: boolean, replenishing: boolean, attackProgress?: number): void {
        const state = this.state;
        let name: PlayerAnimation = state === 'Walk' || state === 'Scuttle' && this.body.velocity.length() > 40 ? 'walk' : 'idle';
        if (state === 'LedgeGrab') name = this.ledgeTime < 0.24 ? 'catch' : 'hang';
        else if (state === 'Mantle') name = 'mantle';
        else if (state === 'Jump') name = 'jump';
        else if (state === 'Fall' || state === 'HarpoonPull') name = 'fall';
        else if (state === 'Dash' || state === 'Dodge') name = 'dash';
        else if (state === 'MeleeAttack') name = 'melee';
        else if (state === 'HarpoonAim') name = 'aim';
        else if (state === 'HarpoonThrow') name = 'throw';
        else if (state === 'Hurt' || state === 'Death') name = 'hurt';
        else if (this.landedTime > 0 && state === 'Idle') name = 'land';
        const key = playerAnimation(this.form, name);
        if (this.visual.anims.currentAnim?.key !== key || !this.visual.anims.isPlaying && ['walk', 'idle', 'hang', 'aim', 'fall'].includes(name)) this.visual.play(key, true);
        if (state === 'MeleeAttack' && attackProgress !== undefined) this.visual.anims.setProgress(Phaser.Math.Clamp(attackProgress, 0, 0.999));
        if (state !== this.previousState && ['Jump', 'Mantle', 'HarpoonThrow', 'Hurt'].includes(state)) this.visual.anims.restart();
        this.previousState = state;
        const breathe = state === 'Idle' ? 1 + Math.sin(this.elapsed * (oxygenLow ? 8 : 2)) * 0.008 : 1;
        this.visual.setFlipX(this.facing < 0).setAlpha(this.alpha).setScale(1 + this.squash * 0.8, breathe * (1 - this.squash));
        if (this.surface === 'right') this.visual.setPosition(this.body.right, this.centerY).setAngle(-90);
        else if (this.surface === 'left') this.visual.setPosition(this.body.left, this.centerY).setAngle(90);
        else if (this.surface === 'ceiling') this.visual.setPosition(this.centerX, this.body.top).setAngle(180).setFlipX(this.facing > 0);
        else this.visual.setPosition(this.centerX, this.feet).setAngle(state === 'Death' ? -80 * this.facing : state === 'Hurt' ? -8 * this.facing : 0);
        if (state === 'LedgeGrab' && this.ledge) {
            const [hx, hy] = LEDGE_HANDS[this.form]?.[Number(this.visual.frame.name)] ?? [96, 60];
            this.visual.x = this.ledge.edge - (hx - this.visual.displayOriginX) * this.visual.scaleX * (this.visual.flipX ? -1 : 1);
            this.visual.y = this.ledge.y - (hy - this.visual.displayOriginY) * this.visual.scaleY;
        } else if (state === 'Mantle') {
            const k = Phaser.Math.Clamp(this.mantleTime / 0.38, 0, 1);
            this.visual.x += this.mantleOffset.x * k * k;
            this.visual.y += this.mantleOffset.y * k * k;
        } else this.mantleOffset = { x: 0, y: 0 };
        if (replenishing) this.visual.setTint(0xa2ffe4); else if (oxygenLow && Math.sin(this.elapsed * 7) > 0.4) this.visual.setTint(0xe49b9a); else this.visual.clearTint();
    }
}
