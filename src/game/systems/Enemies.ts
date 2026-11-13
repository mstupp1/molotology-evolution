import * as Phaser from 'phaser';
import type { EnemyKind, EnemySpawn, Rect } from '../world';
import { segmentRect } from '../world';
import type { Player } from './Player';
import { isLostDiver, isSwimmer } from '../mechanics';
import { COMBAT, hitDamage, lanternRect, tentacleTip } from '../combat';
import { AttackFx, type FxLight } from './AttackFx';
import { stranded as aboveWater } from '../water';
import { chooseAttack, isSpecial, SPECIAL, specialActive, specialSegments, segmentHits, type EnemyAttack } from '../specialAttacks';

export const ENEMY_INFO: Record<EnemyKind, { frame: number; width: number; height: number; hp: number; damage: number; name: string }> = {
    urchin: { frame: 0, width: 74, height: 74, hp: 48, damage: 12, name: 'Spine Urchin' },
    jellyfish: { frame: 1, width: 100, height: 130, hp: 58, damage: 14, name: 'Electric Jellyfish' },
    octopus: { frame: 2, width: 148, height: 130, hp: 110, damage: 18, name: 'Hull Octopus' },
    shark: { frame: 3, width: 210, height: 110, hp: 135, damage: 22, name: 'Abyssal Shark' },
    handcrab: { frame: 4, width: 235, height: 210, hp: 420, damage: 20, name: 'THE UNLISTED DIVER' },
    hermit: { frame: 5, width: 260, height: 240, hp: 540, damage: 24, name: 'THE BORROWED SHELL' },
    angler: { frame: 6, width: 390, height: 330, hp: 820, damage: 28, name: 'THE LAST LIGHT' }
};
/** Reach of the jellyfish discharge and the urchin's spine burst. */
export const JELLY_RADIUS = 135, URCHIN_RADIUS = 90;
export class Enemy extends Phaser.Physics.Arcade.Sprite {
    declare body: Phaser.Physics.Arcade.Body;
    health: number; maxHealth: number;
    mode: 'patrol' | 'windup' | 'strike' | 'recover' = 'patrol'; timer = 1.8; elapsed = 0;
    target = new Phaser.Math.Vector2(); home = new Phaser.Math.Vector2(); cycles = 0; stun = 0; flash = 0;
    attack: EnemyAttack = 'lunge'; attackFacing = -1;
    duration = 0.85; passes = 0; pulseHit = false;
    /** A swimmer left above the waterline: it falls, flops and can only hurt on contact. */
    stranded = false; flop = 0.6; readonly baseScale: { x: number; y: number };
    constructor(scene: Phaser.Scene, readonly spec: EnemySpawn, swimming: boolean) {
        super(scene, spec.x, spec.y, `enemy-${spec.visual ?? spec.kind}`, 0);
        scene.add.existing(this); scene.physics.add.existing(this);
        const info = ENEMY_INFO[spec.kind]; this.health = this.maxHealth = info.hp;
        const bounds = scene.cache.json.get('motion-manifest').enemies[spec.visual ?? spec.kind].referenceBounds as number[];
        const w = bounds[2] - bounds[0], h = bounds[3] - bounds[1];
        this.setScale(info.width / w, info.height / h).setDepth(18).setCollideWorldBounds(true);
        this.baseScale = { x: this.scaleX, y: this.scaleY };
        this.body.setSize(w * 0.67, h * 0.66).setOffset(128 - w * 0.335, 128 - h * 0.33);
        this.play(`enemy-${spec.visual ?? spec.kind}-move`);
        this.body.allowGravity = !swimming; this.body.gravity.y = swimming ? 0 : 430;
        if (!swimming) this.y = 850 - info.height * 0.36;
        this.home.set(this.x, this.y); this.timer += (spec.x % 7) * 0.15;
    }
    get kind(): EnemyKind { return this.spec.kind; }
    get displayName(): string { return this.spec.visual === 'rigging-diver' ? 'THE RIGGING CASTAWAY' : this.spec.visual === 'cinder-diver' ? 'THE CINDER DIVER' : ENEMY_INFO[this.kind].name; }
    get boss(): boolean { return this.kind === 'handcrab' || this.kind === 'hermit' || this.kind === 'angler'; }
    get weakSpot(): Rect | null { return this.kind === 'angler' ? lanternRect(this.x, this.y, this.scaleX, this.scaleY, Number(this.frame.name), this.flipX) : null; }
    get hitZones(): { rect: Rect; weak: boolean }[] {
        const b = this.body, weak = this.weakSpot;
        return [...(weak ? [{ rect: weak, weak: true }] : []), { rect: { x: b.x, y: b.y, w: b.width, h: b.height }, weak: false }];
    }
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
    readonly fx: AttackFx;
    private collider: Phaser.Physics.Arcade.Collider;
    private strandedCollider: Phaser.Physics.Arcade.Collider;
    private tentacles = new Map<Enemy, Phaser.GameObjects.Image>();
    constructor(scene: Phaser.Scene, platforms: Phaser.Physics.Arcade.StaticGroup, specs: EnemySpawn[], defeated: string[], private geometry: Rect[], private damagePlayer: (damage: number, fromX: number) => void, private onKill: (enemy: Enemy) => void) {
        this.projectiles = scene.physics.add.group({ defaultKey: 'spark', maxSize: 18, allowGravity: false });
        this.graphics = scene.add.graphics().setDepth(21);
        this.fx = new AttackFx(scene);
        for (const spec of specs) {
            if (defeated.includes(spec.id)) continue;
            const enemy = isSwimmer(spec.kind) ? new SwimmingEnemy(scene, spec) : new GroundedEnemy(scene, spec);
            this.list.push(enemy);
            if (enemy.kind === 'octopus') this.tentacles.set(enemy, scene.add.image(enemy.x, enemy.y, 'tentacle').setOrigin(1, 0.5).setDepth(21).setVisible(false));
        }
        // Swimmers inhabit the water column and deliberately pass through wreck platforms.
        this.collider = scene.physics.add.collider(this.list.filter(e => !isSwimmer(e.kind)), platforms, undefined, (actor, terrain) => {
            const enemy = actor as Enemy, floor = terrain as Phaser.Physics.Arcade.Image;
            return !isLostDiver(enemy.kind) || (floor.body?.y ?? 0) >= 850;
        });
        // Out of water, swimmers fall onto the iron like everything else.
        this.strandedCollider = scene.physics.add.collider(this.list.filter(e => isSwimmer(e.kind) && !e.boss), platforms, undefined, actor => (actor as Enemy).stranded);
    }
    blocked(ax: number, ay: number, bx: number, by: number): boolean { return this.geometry.some(r => segmentRect(ax, ay, bx, by, r) !== null); }
    shoot(e: Enemy, player: Player, spread = 0): void {
        const lantern = e.weakSpot;
        const ox = lantern ? lantern.x + lantern.w / 2 - e.x : 0, oy = lantern ? lantern.y + lantern.h / 2 - e.y : 0;
        for (let i = -spread; i <= spread; i++) {
            const shot = this.projectiles.get(e.x + ox, e.y + oy, 'spark') as Phaser.Physics.Arcade.Image | null;
            if (!shot) return;
            shot.enableBody(true, e.x + ox, e.y + oy, true, true).setDepth(22).setCircle(6).setScale(1.4).setTint(e.kind === 'angler' ? 0xc8b4ff : 0x8ce9fa).setBlendMode(Phaser.BlendModes.ADD);
            shot.setData('life', 7).setData('electric', e.kind !== 'angler'); const v = new Phaser.Math.Vector2(player.centerX - e.x - ox, player.centerY - e.y - oy).normalize().rotate(i * 0.28).scale(e.kind === 'angler' ? 175 : 150);
            shot.setVelocity(v.x, v.y);
        }
    }
    /** Bioluminescent creatures and live attack effects keep pools of light in the dark. */
    lights(): FxLight[] {
        const glow = this.list.filter(e => e.active && (e.kind === 'jellyfish' || e.kind === 'angler')).map(e => { const spot = e.weakSpot; return { x: spot ? spot.x + spot.w / 2 : e.x, y: spot ? spot.y + spot.h / 2 : e.y - 25, r: spot ? 150 : 70 }; });
        return [...glow, ...this.fx.lights()];
    }
    /** Swimmers above the surface lose the water: gravity takes them and they flop. Returns true while stranded. */
    private strand(e: Enemy, dt: number, player: Player, waterline: number): boolean {
        if (!isSwimmer(e.kind) || e.boss) return false;
        const out = aboveWater(e.body.top, waterline, e.stranded);
        if (out !== e.stranded) {
            e.stranded = out; e.mode = 'patrol'; e.timer = 1.2; e.clearTint();
            e.body.allowGravity = out; e.body.gravity.y = out ? 900 : 0;
            if (!out) { e.setVelocity(e.body.velocity.x * 0.3, Math.min(0, e.body.velocity.y) * 0.3).setAngle(0).setScale(e.baseScale.x, e.baseScale.y); e.anims.timeScale = 1; }
            else { e.anims.timeScale = 0.35; this.fx.burst(e.x, e.y, 0x9fe8ff, 6, 140); }
        }
        if (!out) return false;
        e.elapsed += dt;
        const dx = player.centerX - e.x, onFloor = e.body.blocked.down;
        if (e.stun > 0) { e.stun -= dt; return true; }
        if (e.flash > 0) { e.flash -= dt; if (e.flash <= 0) e.clearTint(); }
        const shark = e.kind === 'shark';
        if (onFloor) {
            e.setVelocityX(e.body.velocity.x * Math.pow(0.02, dt));
            e.flop -= dt;
            // Sharks thrash toward whatever they can sense; jellyfish only twitch.
            if (e.flop <= 0) {
                const toward = Math.abs(dx) < 650 ? Math.sign(dx) : Phaser.Math.RND.sign();
                if (shark) e.setVelocity(toward * Phaser.Math.Between(70, 190), -Phaser.Math.Between(240, 380));
                else e.setVelocity(Phaser.Math.Between(-40, 40), -Phaser.Math.Between(90, 150));
                e.flop = shark ? Phaser.Math.FloatBetween(0.6, 1.5) : Phaser.Math.FloatBetween(1.6, 3.2);
            }
            // Lying on its side, gasping.
            const gasp = Math.sin(e.elapsed * (shark ? 9 : 4));
            e.setAngle(shark ? 14 * (e.flipX ? -1 : 1) + gasp * 6 : gasp * 4);
            e.setScale(e.baseScale.x * (shark ? 1 : 1.18 + gasp * 0.04), e.baseScale.y * (shark ? 1 + gasp * 0.05 : 0.62));
        } else {
            e.setAngle(Math.sin(e.elapsed * (shark ? 17 : 8)) * (shark ? 38 : 12));
            e.setScale(e.baseScale.x, e.baseScale.y);
        }
        if (Math.abs(dx) > 4) e.setFlipX(dx > 0);
        return true;
    }
    update(dt: number, player: Player, waterline = -Infinity): void {
        this.graphics.clear(); this.fx.begin(dt);
        for (const e of this.list) {
            this.tentacles.get(e)?.setVisible(false);
            if (!e.active || e.health <= 0) continue;
            if (e.kind === 'angler') {
                const b = e.scene.physics.world.bounds;
                const x = Phaser.Math.Clamp(e.x, e.displayWidth / 2, b.width - e.displayWidth / 2), y = Phaser.Math.Clamp(e.y, e.displayHeight / 2, b.height - e.displayHeight / 2);
                if (x !== e.x || y !== e.y) { e.setPosition(x, y); e.body.updateFromGameObject(); }
            }
            if (this.strand(e, dt, player, waterline)) {
                const animation = `enemy-${e.spec.visual ?? e.kind}-move`;
                if (e.anims.currentAnim?.key !== animation) e.play(animation);
                if (overlaps(player.body, e.body)) this.damagePlayer(Math.round(ENEMY_INFO[e.kind].damage * 0.75), e.x);
                this.healthBar(e);
                continue;
            }
            e.elapsed += dt; e.timer -= dt;
            const dx = player.centerX - e.x, dy = player.centerY - e.y, distance = Math.hypot(dx, dy);
            if (e.mode === 'patrol' || !isSpecial(e.attack) && e.kind !== 'octopus') e.setFlipX(dx > 0);
            if (e.flash > 0) { e.flash -= dt; if (e.flash <= 0) e.setTintMode(Phaser.TintModes.MULTIPLY).setTint(0xff9d8b); }
            if (e.stun > 0) { e.stun -= dt; continue; } else if (e.mode !== 'windup') e.clearTint();
            if (e.kind === 'angler' && e.health < e.maxHealth / 2 && e.mode !== 'windup') e.setTint(0xd8c4ff);
            const enraged = e.kind === 'angler' && e.health < e.maxHealth / 2;
            if (e.mode === 'patrol') {
                this.fx.idle(e);
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
                if (e.timer <= 0 && distance < reach && (isLostDiver(e.kind) || !this.blocked(e.x, e.y, player.centerX, player.centerY))) {
                    e.attack = chooseAttack(e.spec, e.cycles); e.attackFacing = dx >= 0 ? 1 : -1;
                    e.duration = isSpecial(e.attack) ? SPECIAL[e.attack].charge : e.attack === 'pulse' ? COMBAT.pulseCharge : e.kind === 'urchin' ? 0.65 : enraged ? 0.55 : 0.85;
                    e.mode = 'windup'; e.timer = e.duration;
                    e.target.set(player.centerX, player.centerY); e.setVelocity(0, 0);
                }
            } else if (e.mode === 'windup') {
                e.setVelocityX(0); e.setTint(Math.sin(e.elapsed * 30) > 0 ? (e.kind === 'jellyfish' ? 0xc4d8ff : 0xff9d8b) : 0xffffff);
                const charge = 1 - e.timer / e.duration;
                // Track the player while drawing the aiming cue, then commit before extension.
                if (e.kind === 'octopus' && charge < 0.6) { e.target.set(player.centerX, player.centerY); e.setFlipX(dx > 0); }
                if (!isSpecial(e.attack)) {
                    if (e.attack === 'pulse') this.fx.lanternPulse(e, COMBAT.pulseRadius, charge, false);
                    else if (e.kind === 'jellyfish') this.fx.jellyWindup(e, JELLY_RADIUS, charge);
                    else if (e.kind === 'urchin') this.fx.urchinWindup(e, URCHIN_RADIUS, charge);
                    else this.fx.lungeWindup(e, e.target, charge, e.kind === 'angler' ? 0xc8b4ff : e.kind === 'octopus' ? 0xd88aa0 : 0xe99c7d);
                }
                if (e.timer <= 0) {
                    e.mode = 'strike'; e.timer = isSpecial(e.attack) ? SPECIAL[e.attack].strike : e.kind === 'octopus' ? 0.35 : e.kind === 'urchin' ? 1.3 : e.attack === 'pulse' ? 0.35 : e.attack === 'leap' ? COMBAT.diverFlight + 0.1 : 0.6; e.cycles++;
                    e.duration = e.timer; e.pulseHit = false;
                    if (e.attack === 'frenzy') { e.passes = 0; this.frenzyPass(e, player); }
                    else if (e.attack === 'leap') {
                        const flight = COMBAT.diverFlight;
                        e.setVelocity(Phaser.Math.Clamp((e.target.x - e.x) / flight, -650, 650), (e.target.y - e.y - 0.5 * 430 * flight * flight) / flight);
                    } else if (e.attack === 'chomp') e.setVelocityX(e.attackFacing * 150);
                    else if (!isSpecial(e.attack) && e.attack !== 'pulse' && ['shark', 'angler', 'handcrab', 'hermit'].includes(e.kind)) {
                        const v = new Phaser.Math.Vector2(e.target.x - e.x, ['shark', 'angler'].includes(e.kind) ? e.target.y - e.y : 0).normalize();
                        e.setVelocity(v.x * (enraged ? 570 : e.boss ? 420 : 540), v.y * 340);
                    }
                    if (e.kind === 'jellyfish' && e.cycles % 3 === 0) this.shoot(e, player);
                    if (e.kind === 'angler' && (enraged || e.cycles % 2 === 0)) this.shoot(e, player, enraged ? 1 : 0);
                }
            } else if (e.mode === 'strike') {
                if (isSpecial(e.attack)) {
                    const progress = 1 - e.timer / e.duration;
                    if (e.attack !== 'chomp' || progress > 0.3) e.setVelocityX(0);
                    const area = { x: player.body.x, y: player.body.y, w: player.body.width, h: player.body.height };
                    if (!e.pulseHit && specialActive(e.attack, progress) && !(e.attack === 'spew' && player.evolution === 2) && specialSegments(e.attack, e, e.target, e.attackFacing, progress, this.geometry).some(segment => segmentHits(segment, area))) {
                        e.pulseHit = true; this.damagePlayer(SPECIAL[e.attack].damage, e.x);
                    }
                }
                if (e.attack === 'frenzy' && e.timer <= 0 && e.passes < 4) this.frenzyPass(e, player);
                if (e.attack === 'pulse') {
                    e.setVelocity(0, 0); this.fx.lanternPulse(e, COMBAT.pulseRadius, 1 - e.timer / e.duration, true);
                    const spot = e.weakSpot!;
                    if (!e.pulseHit && Phaser.Math.Distance.Between(player.centerX, player.centerY, spot.x + spot.w / 2, spot.y + spot.h / 2) <= COMBAT.pulseRadius) {
                        e.pulseHit = true; this.damagePlayer(28, e.x);
                    }
                }
                if (e.kind === 'jellyfish' || e.kind === 'urchin') {
                    const r = e.kind === 'jellyfish' ? JELLY_RADIUS : URCHIN_RADIUS, inside = distance < r + 16;
                    if (e.kind === 'jellyfish') this.fx.jellyStrike(e, r, 1 - e.timer / 0.6, inside ? { x: player.centerX, y: player.centerY - 10 } : null);
                    else this.fx.urchinStrike(e, r, 1 - e.timer / 1.3);
                    if (inside) this.damagePlayer(ENEMY_INFO[e.kind].damage, e.x);
                } else if (e.kind !== 'octopus' && e.attack !== 'pulse' && !isSpecial(e.attack)) this.fx.lungeStrike(e, e.kind === 'angler' ? 0xb5a4eb : e.boss ? 0xff9a7a : 0x9fd8e8);
                if (e.kind === 'octopus') {
                    const { x: tx, y: ty } = tentacleTip(e.x, e.y, e.target.x, e.target.y, (0.35 - e.timer) / 0.35);
                    this.tentacles.get(e)?.setVisible(true).setPosition(e.x, e.y).setDisplaySize(Math.max(15, Math.hypot(tx - e.x, ty - e.y)), 35).setRotation(Math.atan2(e.target.y - e.y, e.target.x - e.x) + Math.PI);
                    const hit = Phaser.Geom.Intersects.LineToRectangle(new Phaser.Geom.Line(e.x, e.y, tx, ty), new Phaser.Geom.Rectangle(player.body.x, player.body.y, player.body.width, player.body.height));
                    if (hit) this.damagePlayer(18, e.x);
                }
                if (e.timer <= 0 || !isLostDiver(e.kind) && e.kind !== 'angler' && (e.body.blocked.left || e.body.blocked.right)) { e.mode = 'recover'; e.timer = e.kind === 'angler' ? (e.attack === 'pulse' ? 1.5 : enraged ? 1.3 : 1.7) : e.kind === 'shark' ? COMBAT.sharkRecovery : isSpecial(e.attack) ? SPECIAL[e.attack].recover : e.boss ? 1.25 : 1; e.setVelocity(0, 0); }
            } else {
                // After a lunge the Angler hangs open-jawed and drifts back up: a readable punish window.
                if (e.kind === 'angler') { e.setVelocity(0, (e.home.y - e.y) * 0.9); if (Math.sin(e.elapsed * 12) > 0) e.setTint(0xffe0a0); }
                if (e.timer <= 0) { e.mode = 'patrol'; e.timer = e.kind === 'shark' ? COMBAT.sharkPatrol : enraged ? 0.45 : 1.1; }
            }
            const animation = `enemy-${e.spec.visual ?? e.kind}-${e.mode === 'patrol' ? 'move' : e.mode}`;
            if (e.anims.currentAnim?.key !== animation) e.play(animation);
            if (isSpecial(e.attack) && e.mode !== 'patrol') this.fx.special(e, e.attack, e.mode !== 'recover' ? 1 - e.timer / e.duration : 1 - e.timer / SPECIAL[e.attack].recover, this.geometry);
            const harmless = isSpecial(e.attack) && e.mode !== 'patrol' || e.kind === 'urchin' || e.kind === 'angler' && e.mode === 'recover';
            if (!harmless && Phaser.Geom.Intersects.RectangleToRectangle(new Phaser.Geom.Rectangle(player.body.x, player.body.y, player.body.width, player.body.height), new Phaser.Geom.Rectangle(e.body.x, e.body.y, e.body.width, e.body.height))) this.damagePlayer(ENEMY_INFO[e.kind].damage, e.x);
            this.healthBar(e);
        }
        this.projectiles.getChildren().forEach(child => {
            const p = child as Phaser.Physics.Arcade.Image;
            if (!p.active) return;
            const life = Number(p.getData('life')) - dt; p.setData('life', life);
            const body = p.body as Phaser.Physics.Arcade.Body;
            if (life <= 0 || this.blocked(p.x - body.velocity.x * dt, p.y - body.velocity.y * dt, p.x, p.y)) { this.fizzle(p); return; }
            if (Phaser.Geom.Intersects.RectangleToRectangle(new Phaser.Geom.Rectangle(player.body.x, player.body.y, player.body.width, player.body.height), new Phaser.Geom.Rectangle(body.x, body.y, body.width, body.height))) { this.damagePlayer(15, p.x); this.fizzle(p); return; }
            this.fx.projectile(p, p.getData('electric') === true);
        });
        this.fx.end(dt);
    }
    private healthBar(e: Enemy): void {
        if (e.health >= e.maxHealth || e.boss) return;
        this.graphics.fillStyle(0x0a101c).fillRect(e.x - 26, e.y - e.displayHeight / 2 - 14, 52, 4);
        this.graphics.fillStyle(0xe5877c).fillRect(e.x - 26, e.y - e.displayHeight / 2 - 14, 52 * e.health / e.maxHealth, 4);
    }
    private fizzle(p: Phaser.Physics.Arcade.Image): void {
        this.fx.burst(p.x, p.y, p.getData('electric') ? 0x9fe8ff : 0xc8b4ff, 6, 180); this.fx.dropTrail(p); p.disableBody(true, true);
    }
    private frenzyPass(e: Enemy, player: Player): void {
        e.passes++;
        const bounds = e.scene.physics.world.bounds, marginX = e.displayWidth / 2 + 12, marginY = e.displayHeight / 2 + 12;
        e.target.set(Phaser.Math.Clamp(player.centerX + (e.passes % 2 ? -1 : 1) * Phaser.Math.Between(180, 340), marginX, bounds.width - marginX), Phaser.Math.Clamp(player.centerY + Phaser.Math.Between(-210, 180), marginY, bounds.height - marginY));
        const v = e.target.clone().subtract(new Phaser.Math.Vector2(e.x, e.y));
        e.timer = Math.max(0.15, v.length() / 800); e.duration = e.timer; v.scale(1 / e.timer); e.setVelocity(v.x, v.y);
    }
    hit(e: Enemy, amount: number, direction: number, pullX?: number, weak = false): { damage: number; weak: boolean } | null {
        weak = weak && e.kind === 'angler';
        const damage = hitDamage(amount, weak);
        if (!e.takeDamage(damage, direction, pullX)) return null;
        if (weak) { const r = e.weakSpot; if (r) this.fx.burst(r.x + r.w / 2, r.y + r.h / 2, 0xc4ffff, 18, 240); }
        if (e.health === 0) {
            this.tentacles.get(e)?.setVisible(false); this.fx.removeEnemy(e);
            if (e.kind === 'angler') this.projectiles.getChildren().forEach(child => {
                const shot = child as Phaser.Physics.Arcade.Image;
                this.fx.dropTrail(shot); shot.disableBody(true, true);
            });
            // The body stops colliding at once; the sprite lingers for a short death animation.
            e.disableBody(true, false); e.setTint(0xffd8c8).setTintMode(Phaser.TintModes.FILL);
            e.scene.tweens.add({ targets: e, alpha: 0, scaleX: e.scaleX * 1.25, scaleY: e.scaleY * 0.6, angle: direction * (e.boss ? 8 : 25), y: e.y + (e.boss ? 40 : 20), duration: e.boss ? 1400 : 520, ease: 'Quad.In', onComplete: () => e.setVisible(false) });
            this.onKill(e);
        }
        return { damage, weak };
    }
    destroy(): void { this.collider.destroy(); this.strandedCollider.destroy(); this.tentacles.forEach(s => s.destroy()); this.tentacles.clear(); this.list.forEach(e => e.destroy()); this.list = []; this.projectiles.clear(true, true); this.projectiles.destroy(); this.graphics.destroy(); this.fx.destroy(); }
}
function overlaps(a: Phaser.Physics.Arcade.Body, b: Phaser.Physics.Arcade.Body): boolean {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
