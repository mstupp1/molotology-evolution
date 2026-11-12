import * as Phaser from 'phaser';
import { GameEvent, SceneKey, type GameSnapshot, type Notice, type UiCommand } from '../constants';
import { browserSaveStore, collect, Combo, maxHealth, newProgress, objective, Survival, type Progress } from '../model';
import { inside, meetsRequirement, REQUIREMENT_LABEL, ROOMS, type Door, type Room, type RoomId } from '../world';
import { RoomView, smoothText, textStyle } from '../rendering';
import { Controls } from '../systems/Controls';
import { Player } from '../systems/Player';
import { Enemy, EnemySystem, ENEMY_INFO } from '../systems/Enemies';
import { Harpoon, type HarpoonEvent } from '../systems/Harpoon';
import { abilities, meleeReach } from '../mechanics';

interface StartData { progress?: Progress; room?: RoomId; from?: RoomId; survival?: Survival }
export class Game extends Phaser.Scene {
    runSerial = 0;
    progress: Progress;
    player: Player;
    survival: Survival;
    room: Room;
    private view: RoomView;
    private controls: Controls;
    private enemies: EnemySystem;
    private harpoon: Harpoon;
    private combo: Combo;
    private store = browserSaveStore();
    private effects: Phaser.Physics.Arcade.Group;
    private combatGraphics: Phaser.GameObjects.Graphics;
    private clawSweep: Phaser.GameObjects.Image;
    private paused = false;
    private transitioning = false;
    private dead = false;
    private refill = false;
    private prompt = '';
    private snapshotTimer = 0;
    private lowOxygenWarned = false;
    private roomId: RoomId;
    private from?: RoomId;
    private lastSound = 0;
    private hitstop = 0;
    private trailTimer = 0;
    private bubbleTimer = 0;
    private lookahead = 0;
    private firstVisit = false;
    private bossIntroduced = false;
    private onCommand = (command: UiCommand) => this.command(command);
    private onBlur = () => { if (!this.dead && !this.transitioning) this.game.events.emit(GameEvent.Command, { type: 'pause', mode: 'pause' } satisfies UiCommand); };

    constructor() { super(SceneKey.Game); }
    init(data: StartData = {}): void {
        this.runSerial++;
        this.progress = data.progress ?? newProgress();
        this.roomId = data.room ?? this.progress.checkpoint; this.from = data.from;
        this.survival = data.survival ?? new Survival(maxHealth(this.progress)); this.survival.maxHealth = maxHealth(this.progress); this.combo = new Combo();
        this.paused = false; this.transitioning = false; this.dead = false; this.refill = false;
        this.hitstop = 0; this.trailTimer = 0; this.bubbleTimer = 0; this.lookahead = 0; this.bossIntroduced = false;
        this.snapshotTimer = 0; this.prompt = ''; this.lowOxygenWarned = false;
    }
    create(): void {
        smoothText(this);
        this.room = ROOMS[this.roomId];
        this.physics.resume();
        this.firstVisit = !this.progress.explored.includes(this.roomId);
        if (this.firstVisit) this.progress.explored.push(this.roomId);
        this.view = new RoomView(this, this.room, this.progress);
        this.physics.world.setBounds(0, 0, this.room.width, this.room.height);
        const entry = this.from ? this.room.doors.find(d => d.to === this.from) : undefined;
        const spawnX = entry ? Phaser.Math.Clamp(entry.x + (entry.x > 1600 ? -120 : 120), 80, this.room.width - 80) : this.room.station?.x ?? 250;
        const spawnY = entry ? entry.y + 12 : 850;
        this.player = new Player(this, spawnX, spawnY - 70); this.player.evolution = this.progress.evolution;
        this.player.facing = spawnX > this.room.width / 2 ? -1 : 1; this.lookahead = this.player.facing * 110;
        this.physics.add.collider(this.player, this.view.platforms);
        this.controls = new Controls(this); this.harpoon = new Harpoon(this, this.player);
        this.enemies = new EnemySystem(this, this.view.platforms, this.room.enemies, this.progress.defeated, this.view.geometry, (n, x) => this.hurt(n, x), e => this.killed(e));
        this.effects = this.physics.add.group({ defaultKey: 'spark', maxSize: 64, allowGravity: false });
        this.combatGraphics = this.add.graphics().setDepth(24);
        this.clawSweep = this.add.image(0, 0, 'claw-sweep').setDepth(24).setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
        this.cameras.main.setBounds(0, 0, this.room.width, this.room.height).startFollow(this.player, true, 0.1, 0.1, -this.lookahead, 60);
        this.cameras.main.fadeIn(400, 3, 10, 17);
        this.game.events.on(GameEvent.Command, this.onCommand);
        this.game.events.on(Phaser.Core.Events.BLUR, this.onBlur);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.game.events.off(GameEvent.Command, this.onCommand);
            this.game.events.off(Phaser.Core.Events.BLUR, this.onBlur);
            // Display objects, groups, colliders, timers and tweens are scene-owned.
            // Arcade's shutdown runs first; destroying its colliders again would stop restarts.
            this.scene.stop(SceneKey.Hud);
            this.sound.stopByKey('ambience');
        });
        this.scene.launch(SceneKey.Hud);
        this.ensureMusic();
        this.sound.play('ambience', { loop: true, volume: 0.32 });
        this.time.delayedCall(900, () => {
            if (this.room.id === 'hull' && !this.progress.harpoon) this.notice('THE DESCENT BEGINS', 'A / D move · Space jump (hold for height) · J or click to slash · Shift dodge · E interact\nFollow the corridor east. Find the Armory. The wreck will not let you stay human.', 9000);
            else if (this.firstVisit && this.room.log) this.notice(this.room.name.toUpperCase(), this.room.log);
        });
        this.save();
    }
    private ensureMusic(): void {
        if (!this.cache.audio.exists('menu-music')) return;
        const playing = this.sound.getAllPlaying().find(s => s.key === 'menu-music');
        if (playing) {
            (playing as Phaser.Sound.WebAudioSound).setVolume(0.45);
            return;
        }
        this.sound.play('menu-music', { loop: true, volume: 0.45 });
    }
    private notice(title: string, body: string, duration = 6500): void { this.game.events.emit(GameEvent.Notice, { title, body, duration } satisfies Notice); }
    private soundEffect(key: string, volume = 0.4, detune = 0): void { if (this.cache.audio.exists(key)) this.sound.play(key, { volume, detune: detune + Phaser.Math.Between(-60, 60) }); }
    private floatText(x: number, y: number, text: string, color: string, size = 16): void {
        const label = this.add.text(x, y, text, { ...textStyle(size, color), fontStyle: 'bold' }).setOrigin(0.5).setDepth(27).setShadow(0, 2, '#000000', 3);
        this.tweens.add({ targets: label, y: y - 46, alpha: 0, duration: 750, ease: 'Cubic.Out', onComplete: () => label.destroy() });
    }
    private puff(x: number, y: number, count: number, spread = 40): void {
        for (let i = 0; i < count; i++) {
            const b = this.add.image(x + Phaser.Math.Between(-spread, spread), y - Phaser.Math.Between(0, 10), 'bubble').setDepth(21).setScale(Phaser.Math.FloatBetween(0.35, 0.8)).setAlpha(0.9);
            this.tweens.add({ targets: b, y: b.y - Phaser.Math.Between(30, 90), x: b.x + Phaser.Math.Between(-20, 20), alpha: 0, duration: Phaser.Math.Between(500, 1000), ease: 'Sine.Out', onComplete: () => b.destroy() });
        }
    }
    private afterimage(): void {
        const v = this.player.visual;
        const ghost = this.add.sprite(v.x, v.y, v.texture.key, v.frame.name).setScale(v.scaleX, v.scaleY).setFlipX(v.flipX).setDepth(19).setTint(this.progress.evolution === 2 ? 0xff9a8a : 0x8ee8e0).setTintMode(Phaser.TintModes.FILL).setAlpha(0.45).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: ghost, alpha: 0, duration: 260, onComplete: () => ghost.destroy() });
    }
    private save(): void {
        const okay = this.store.save(this.progress);
        if (!okay && !this.registry.get('storage-warning')) { this.registry.set('storage-warning', true); this.time.delayedCall(1000, () => this.notice('SESSION SAVE', 'Browser storage is unavailable. Progress will remain in this session.')); }
    }
    private command(command: UiCommand): void {
        if (command.type === 'pause' && !this.dead && !this.transitioning) {
            this.controls.clearKeyboard();
            this.paused = true; this.emitSnapshot(); this.scene.pause();
        } else if (command.type === 'resume') {
            this.controls.clearKeyboard();
            this.paused = false; this.scene.resume(); this.emitSnapshot();
        } else if (command.type === 'menu') {
            this.save(); this.scene.start(SceneKey.MainMenu);
        } else if (command.type === 'mute') this.sound.mute = !this.sound.mute;
    }
    private burst(x: number, y: number, color: number, count = 9): void {
        for (let i = 0; i < count; i++) {
            const spark = this.effects.get(x, y, 'spark') as Phaser.Physics.Arcade.Image | null;
            if (!spark) break;
            spark.enableBody(true, x, y, true, true).setDepth(26).setTint(color).setAlpha(1).setScale(Phaser.Math.FloatBetween(0.2, 0.5));
            spark.setVelocity(Phaser.Math.Between(-160, 160), Phaser.Math.Between(-180, 80)); spark.setData('life', 0.55);
        }
    }
    private hurt(damage: number, fromX: number): void {
        if (this.dead || this.player.dashTime > 0 || this.transitioning || !this.survival.hit(damage)) return;
        this.refill = false; this.player.hurtTime = 0.23; this.combo.reset();
        if (this.harpoon.mode === 'pull') this.harpoon.release();
        this.player.detach();
        this.player.body.allowGravity = true;
        this.player.setAcceleration(0, 0).setVelocity(Math.sign(this.player.centerX - fromX || 1) * 230, -110);
        this.cameras.main.shake(140, 0.006); this.cameras.main.flash(90, 90, 10, 10, true); this.burst(this.player.centerX, this.player.centerY, 0xdd8b83);
        this.floatText(this.player.centerX, this.player.centerY - 60, `-${damage}`, '#ff9f92', 15);
        this.soundEffect('hurt', 0.5); this.hitstop = Math.max(this.hitstop, 0.05);
    }
    private killed(enemy: Enemy): void {
        this.burst(enemy.x, enemy.y, enemy.kind === 'jellyfish' ? 0xbab2ff : 0xe1a390, enemy.boss ? 25 : 12);
        this.puff(enemy.x, enemy.y + 20, enemy.boss ? 18 : 7, enemy.displayWidth * 0.3);
        this.soundEffect('kill', enemy.boss ? 0.8 : 0.5, enemy.boss ? -500 : 0);
        const heal = enemy.boss ? 35 : 4; this.survival.health = Math.min(this.survival.maxHealth, this.survival.health + heal);
        this.floatText(this.player.centerX, this.player.centerY - 70, `+${heal}`, '#9fe8c8', 13);
        this.hitstop = Math.max(this.hitstop, enemy.boss ? 0.35 : 0.08);
        if (!enemy.boss) return;
        this.cameras.main.shake(600, 0.012); this.cameras.main.flash(500, 220, 200, 255);
        if (!this.progress.defeated.includes(enemy.spec.id)) this.progress.defeated.push(enemy.spec.id);
        this.notice(enemy.kind === 'angler' ? 'THE LAST LIGHT GOES OUT' : 'A DIVER, ONCE', enemy.kind === 'angler' ? 'For the first time since the descent, the wreck is still.' : 'The body remembers a life the shell cannot hold. You leave their name where you found it.', 8000);
        if (enemy.kind === 'angler') {
            this.progress.completed = true;
            this.time.delayedCall(2200, () => { this.scene.start(SceneKey.GameOver, { progress: this.progress }); });
        }
        this.save();
    }
    private travel(door: Door): void {
        if (this.transitioning) return;
        if (!meetsRequirement(door.requires, this.progress)) { this.notice('SEALED PASSAGE', REQUIREMENT_LABEL[door.requires!], 3500); return; }
        if (ROOMS[door.to].pressure && this.progress.evolution < 1) return;
        if (!this.progress.opened.includes(door.id)) this.progress.opened.push(door.id);
        const reverse = ROOMS[door.to].doors.find(d => d.to === this.roomId);
        if (reverse && !this.progress.opened.includes(reverse.id)) this.progress.opened.push(reverse.id);
        this.transitioning = true; this.player.setVelocity(0, 0).setAcceleration(0, 0); this.player.body.moves = false;
        this.save(); this.soundEffect('door', 0.45); this.cameras.main.fadeOut(180, 3, 10, 17);
        this.time.delayedCall(190, () => this.scene.restart({ progress: this.progress, room: door.to, from: this.roomId, survival: this.survival } satisfies StartData));
    }
    private interact(pressed: boolean): void {
        const p = this.player; this.prompt = '';
        const pickup = this.view.pickups.find(q => q.sprite.active && Phaser.Math.Distance.Between(p.centerX, p.centerY, q.data.x, q.data.y) < 105);
        if (pickup) {
            this.prompt = `[E / Y] ${pickup.data.kind === 'harpoon' ? 'Recover the Harpoon' : pickup.data.kind === 'key' ? 'Take the Chapel Key' : pickup.data.kind === 'health' ? 'Take the Vital Pearl' : 'Accept the Molt'}`;
            if (pressed && collect(this.progress, pickup.data.id, pickup.data.kind)) {
                pickup.sprite.destroy(); pickup.halo.destroy(); pickup.label.destroy(); this.player.evolution = this.progress.evolution;
                this.survival.maxHealth = maxHealth(this.progress);
                this.survival.health = this.survival.maxHealth; this.survival.oxygen = 120; this.burst(p.centerX, p.centerY, 0xddb6b4, 28); this.puff(p.centerX, p.centerY, 14);
                this.soundEffect('pickup', 0.6); this.hitstop = 0.12;
                if (pickup.data.kind === 'health') this.notice('VITAL PEARL', `Something in the shell remembers how to heal. Maximum vitality is now ${this.survival.maxHealth}.`, 5000);
                else if (pickup.data.kind === 'harpoon') this.notice('SALVAGE HARPOON ACQUIRED', 'Hold right mouse / RT to charge, release to fire. Let go as the ring flashes for a PERFECT shot. Golden rings are grapple anchors.\nReturn to the Air Bell and aim up at the ring beside the high ledge.', 11000);
                else if (pickup.data.kind === 'key') this.notice('CHAPEL KEY ACQUIRED', 'A key, warm against your changing skin. The chapel waits beyond the eastern bulkhead.');
                else { this.soundEffect('molt', 0.7); this.cameras.main.flash(500, 100, 55, 75); this.notice(pickup.data.kind === 'breach' ? 'THE FIRST MOLT · THE BREACH' : 'THE FINAL MOLT · THE CARAPACE', pickup.data.kind === 'breach' ? 'Your claw replaces the knife: a wider sweep that breaks calcified barriers.\nShift / B grants enhanced directional Dash. Your shell withstands high pressure.' : 'Fully crab. Extreme heat cannot harm your shell. Press toward walls to cling; W / S climb.\nA / D scuttle upside down beneath ceilings. Space or Down drops. Cross the volcanic vents.', 14000); }
                this.save();
            }
            return;
        }
        const station = this.room.station;
        if (station && Math.abs(station.x - p.centerX) < 115 && Math.abs(station.y - p.feet) < 70) {
            this.prompt = this.refill ? 'REPLENISHING · CHECKPOINT SAVED' : '[E / Y] Refill oxygen · restore health · save';
            if (pressed) { this.refill = true; this.progress.checkpoint = this.roomId; this.save(); this.soundEffect('refill'); this.notice('A BREATH BORROWED', 'Oxygen and health replenishing. This station is now your checkpoint.', 2500); }
            return;
        }
        this.refill = false;
        const door = this.room.doors.find(d => Math.abs(d.x - p.centerX) < 100 && Math.abs(d.y - p.feet) < 95);
        if (door) {
            this.prompt = meetsRequirement(door.requires, this.progress) ? `[E / Y] ${door.hidden ? 'Investigate ' : 'Enter '}${door.label.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase())}` : `[SEALED] ${REQUIREMENT_LABEL[door.requires!]}`;
            if (pressed) this.travel(door);
            return;
        }
        if (Math.abs(p.centerX - 1600) < 85 && Math.abs(p.feet - 850) < 70) {
            this.prompt = '[E / Y] Read the field record'; if (pressed) this.notice('FIELD RECORD · ' + this.room.name.toUpperCase(), this.room.log, 10000);
        }
    }
    update(_time: number, delta: number): void {
        if (this.paused || this.dead || this.transitioning) return;
        // Hitstop: freeze the simulation for a few frames so impacts land with weight.
        if (this.hitstop > 0) {
            this.hitstop -= delta / 1000;
            if (!this.physics.world.isPaused) this.physics.pause();
            if (this.hitstop > 0) return;
            this.physics.resume();
        }
        const dt = Math.min(delta / 1000, 0.05), p = this.player;
        const input = this.controls.poll(p.centerX, p.centerY);
        if (this.controls.gamepad && (input.map || input.pause)) { this.game.events.emit(GameEvent.Command, { type: 'pause', mode: input.map ? 'map' : 'pause' } satisfies UiCommand); return; }
        const air = this.room.air.some(r => inside(p.centerX, p.centerY, r));
        const busy = this.combo.active || this.harpoon.mode !== 'ready' || input.aim;
        const wasDashing = p.dashTime > 0;
        if (input.jump && this.harpoon.mode === 'pull') this.harpoon.release();
        p.updateController(dt, input, air, this.view.geometry, busy);
        if (p.jumped) { this.puff(p.centerX, p.feet, 4, 18); this.soundEffect('jump', 0.25); }
        if (p.landed) { this.puff(p.centerX, p.feet, 3 + Math.round(p.landed * 6), 30); this.soundEffect('land', 0.15 + p.landed * 0.3); if (p.landed > 0.8) this.cameras.main.shake(90, 0.003); }
        if (p.dashTime > 0) {
            this.combo.reset();
            if (!wasDashing) { this.soundEffect('dash', 0.4); this.puff(p.centerX, p.centerY, 5, 20); }
            this.trailTimer -= dt; if (this.trailTimer <= 0) { this.trailTimer = 0.035; this.afterimage(); }
        }
        this.bubbleTimer -= dt;
        if (this.bubbleTimer <= 0 && !air) { this.bubbleTimer = Phaser.Math.FloatBetween(1.1, 2.4); this.puff(p.centerX + p.facing * 14, p.centerY - 40, Phaser.Math.Between(1, 3), 4); }
        // Look ahead in the facing direction so the player sees what is coming.
        this.lookahead = Phaser.Math.Linear(this.lookahead, p.facing * 110, Math.min(1, dt * 1.8));
        this.cameras.main.setFollowOffset(-this.lookahead, 60);
        if (input.attack && p.dashTime === 0 && p.hurtTime === 0 && this.harpoon.mode !== 'pull') {
            if (this.combo.press()) this.soundEffect('slash', 0.4);
        }
        if (this.combo.update(dt)) this.soundEffect('slash', 0.45);
        this.harpoon.tickCharge(dt, input.aim && this.progress.harpoon && !this.combo.active);
        if (this.progress.harpoon && input.release && !this.combo.active && p.dashTime === 0 && p.hurtTime === 0) {
            if (this.harpoon.throw(input.aimX, input.aimY)) this.harpoonLaunched();
        }
        for (const event of this.harpoon.update(dt, this.room, this.enemies, this.view.geometry)) this.harpoonEvent(event);
        if (this.combo.active) p.state = 'MeleeAttack';
        else if (input.aim && this.progress.harpoon && this.harpoon.mode === 'ready') { p.state = 'HarpoonAim'; p.facing = input.aimX >= 0 ? 1 : -1; }
        else if (this.harpoon.mode === 'out' || this.harpoon.mode === 'stuck' || this.harpoon.mode === 'return') p.state = 'HarpoonThrow';
        this.combatGraphics.clear();
        this.clawSweep.setVisible(false);
        if (this.combo.damaging) {
            const reach = meleeReach(this.progress.evolution, this.combo.index === 2);
            const vertical = p.surface === 'left' || p.surface === 'right';
            const fx = vertical ? 0 : p.facing, fy = p.surface === 'right' ? -p.facing : p.surface === 'left' ? p.facing : 0;
            const hitbox = new Phaser.Geom.Rectangle(p.centerX + fx * reach / 2 - (vertical ? 70 : reach / 2), p.centerY + fy * reach / 2 - (vertical ? reach / 2 : 75), vertical ? 140 : reach, vertical ? reach : 150);
            // A layered crescent reads as a fast blade sweep rather than a thin outline.
            const sweep = Math.min(1, (this.combo.elapsed - 0.07) / (this.combo.index === 2 ? 0.21 : 0.13));
            const attackAngle = Math.atan2(fy, fx);
            const base = attackAngle - 1.1, span = 2.2 * sweep;
            const tint = this.progress.evolution === 2 ? 0xffb7a0 : 0xb3e8db;
            for (let layer = 0; layer < 4; layer++) {
                const r = reach - 30 + layer * 6;
                this.combatGraphics.lineStyle((this.combo.index === 2 ? 10 : 7) - layer * 2, layer === 3 ? 0xffffff : tint, 0.25 + layer * 0.2).beginPath()
                    .arc(p.centerX, p.centerY - 5, r, Math.min(base, base + span), Math.max(base, base + span)).strokePath();
            }
            if (abilities(this.progress.evolution).claw) {
                this.clawSweep.setVisible(true).setPosition(p.centerX + fx * reach * 0.57, p.centerY + fy * reach * 0.57).setDisplaySize(reach * (0.7 + sweep * 0.3), 135).setRotation(attackAngle).setAlpha(Math.sin(Math.PI * sweep) * 0.9);
                for (const b of [...this.view.breakables]) {
                    if (!Phaser.Geom.Intersects.RectangleToRectangle(hitbox, new Phaser.Geom.Rectangle(b.data.x, b.data.y, b.data.w, b.data.h)) || !this.combo.hit(`break:${b.data.id}`)) continue;
                    b.hits--; this.burst(b.data.x + b.data.w / 2, p.centerY, 0xeeb49b, 15); this.soundEffect('hit', 0.6); this.hitstop = 0.08;
                    if (b.hits <= 0) { this.view.breakObstacle(b.data.id); this.progress.opened.push(`break:${b.data.id}`); this.save(); this.notice('THE CLAW FINDS A WAY', 'The calcified barrier breaks. This passage will stay open.', 3000); }
                    else { b.sprite.setTint(0xe29080); this.floatText(b.data.x, p.centerY - 50, 'CRACK', '#edc6ad'); }
                }
            }
            for (const e of this.enemies.list) {
                if (!e.active || !Phaser.Geom.Intersects.RectangleToRectangle(hitbox, new Phaser.Geom.Rectangle(e.body.x, e.body.y, e.body.width, e.body.height)) || this.enemies.blocked(p.centerX, p.centerY, e.body.center.x, e.body.center.y)) continue;
                if (this.combo.hit(e.spec.id)) {
                    const damage = 24 + this.progress.evolution * 6 + this.combo.index * 7;
                    this.enemies.hit(e, damage, p.facing); this.burst(e.x, e.y, 0xf4c2a0, 7); this.soundEffect('hit', 0.35);
                    this.floatText(e.x + Phaser.Math.Between(-14, 14), e.y - e.displayHeight * 0.35, `${damage}`, this.combo.index === 2 ? '#ffd890' : '#f4ead8', this.combo.index === 2 ? 20 : 16);
                    this.hitstop = Math.max(this.hitstop, this.combo.index === 2 ? 0.09 : 0.05); this.cameras.main.shake(70, this.combo.index === 2 ? 0.005 : 0.0025);
                }
            }
        }
        this.enemies.update(dt, p);
        if (!this.bossIntroduced) {
            const boss = this.enemies.list.find(e => e.boss && e.active && Math.abs(e.x - p.centerX) < 900);
            if (boss) {
                this.bossIntroduced = true; this.soundEffect('roar', 0.7);
                this.cameras.main.shake(700, 0.006); this.tweens.add({ targets: this.cameras.main, zoom: 1.06, duration: 450, yoyo: true, hold: 500, ease: 'Sine.InOut' });
                this.game.events.emit(GameEvent.Notice, { title: ENEMY_INFO[boss.kind].name, body: boss.kind === 'angler' ? 'Its lantern sways. Everything else in the hold is teeth.' : 'Whatever it was, it still wears a diver’s brass.', duration: 3500, boss: true } satisfies Notice);
            }
        }
        this.interact(input.interact);
        if (Math.abs(input.x) > 0.1 || input.attack || input.dash) this.refill = false;
        this.survival.update(dt, air, this.refill);
        const inHeat = this.room.heat?.some(r => inside(p.centerX, p.centerY, r)) ?? false;
        if (inHeat && !abilities(this.progress.evolution).heat) this.hurt(18, p.centerX - p.facing);
        if (this.survival.oxygen < 30 && !this.lowOxygenWarned) { this.lowOxygenWarned = true; this.notice('OXYGEN RESERVE LOW', 'Find an air pocket or a refill station. At zero oxygen, your health will drain.', 5000); }
        if (this.survival.oxygen > 35) this.lowOxygenWarned = false;
        if (this.survival.oxygen === 0 && this.lastSound <= 0) { this.soundEffect('hit', 0.15); this.lastSound = 2; }
        this.lastSound -= dt;
        if (this.survival.invulnerable > 0 && p.dashTime === 0) p.setAlpha(Math.sin(this.time.now / 40) > 0 ? 0.4 : 1); else p.setAlpha(1);
        p.animate(this.survival.oxygen < 30, air && this.survival.oxygen < 120 || this.refill, this.combo.active ? this.combo.elapsed / this.combo.durations[this.combo.index] : undefined);
        const lights = this.enemies.list.filter(e => e.active && (e.kind === 'jellyfish' || e.kind === 'angler')).map(e => ({ x: e.x + (e.kind === 'angler' ? (e.flipX ? 90 : -90) : 0), y: e.y - (e.kind === 'angler' ? 100 : 25), r: e.kind === 'angler' ? 150 : 70 }));
        this.view.update(dt, p, input.aimX, input.aimY, input.aim, lights, this.survival.oxygen < 30 ? 1 - this.survival.oxygen / 30 : 0);
        this.harpoon.draw(input.aim && this.progress.harpoon, input.aimX, input.aimY, this.room, this.progress.harpoon, this.view.geometry);
        this.effects.getChildren().forEach(child => { const s = child as Phaser.Physics.Arcade.Image; if (s.active) { const life = Number(s.getData('life')) - dt; s.setData('life', life).setAlpha(Math.max(0, life / 0.55)); if (life <= 0) s.disableBody(true, true); } });
        if (this.survival.health <= 0 || p.y > this.room.height + 50) this.die();
        this.snapshotTimer -= dt; if (this.snapshotTimer <= 0) { this.snapshotTimer = 0.08; this.emitSnapshot(); }
    }
    private harpoonLaunched(): void {
        const shot = this.harpoon.shot, p = this.player;
        this.soundEffect('harpoon', 0.3 + shot.power * 0.25, (shot.power - 1) * 500 + (shot.perfect ? 250 : 0));
        this.puff(p.centerX + p.facing * 40, p.centerY - 12, 2 + Math.round(shot.power * 3), 10);
        if (!shot.perfect) return;
        // Perfect release: a bright snap at the muzzle, a chime and a short shake.
        this.soundEffect('pickup', 0.35, 400);
        this.burst(p.centerX + p.facing * 30, p.centerY - 12, 0xbff9ff, 10);
        this.floatText(p.centerX, p.centerY - 84, 'PERFECT', '#bff9ff', 24);
        this.cameras.main.shake(90, 0.004);
    }
    private harpoonEvent(event: HarpoonEvent): void {
        if (event.type === 'enemy') {
            this.burst(event.x, event.y, event.perfect ? 0xbff9ff : 0xf4c2a0, event.perfect ? 16 : 9);
            this.floatText(event.x, event.y - 40, `${event.damage}`, event.perfect ? '#bff9ff' : '#f4ead8', event.perfect ? 24 : 17);
            this.soundEffect('hit', event.perfect ? 0.6 : 0.45, event.perfect ? -200 : 0);
            this.hitstop = Math.max(this.hitstop, event.perfect ? 0.11 : 0.06); this.cameras.main.shake(event.perfect ? 140 : 80, event.perfect ? 0.007 : 0.003);
        } else if (event.type === 'wall') {
            this.burst(event.x, event.y, 0xd9c7a4, 5); this.puff(event.x, event.y, 3, 12); this.soundEffect('hit', 0.18, 500);
        } else if (event.type === 'latch') {
            this.burst(event.x, event.y, 0x9ef8db, 7); this.soundEffect('land', 0.4, 300); this.cameras.main.shake(60, 0.002);
        } else if (event.type === 'snap') this.soundEffect('land', 0.3, 600);
        else this.soundEffect('land', 0.12, 800);
    }
    private die(): void {
        this.dead = true; this.player.state = 'Death'; this.player.setVelocity(0, 0).setAcceleration(0, 0); this.player.body.moves = false;
        this.player.animate(false, false); this.soundEffect('death'); this.game.events.emit(GameEvent.Notice, { title: 'THE DEEP REMEMBERS', body: 'Returning to your last oxygen station. Your discoveries remain.', duration: 2000, death: true } satisfies Notice);
        this.save(); this.emitSnapshot(); this.cameras.main.fadeOut(1300, 5, 8, 17);
        this.time.delayedCall(1500, () => this.scene.restart({ progress: this.progress } satisfies StartData));
    }
    private emitSnapshot(): void {
        const boss = this.enemies.list.find(e => e.boss && e.active && Math.abs(e.x - this.player.x) < 1100);
        const snapshot: GameSnapshot = {
            health: this.survival.health, maxHealth: this.survival.maxHealth, oxygen: this.survival.oxygen, evolution: this.progress.evolution, harpoon: this.progress.harpoon, key: this.progress.key,
            room: this.roomId, roomName: this.room.name, explored: [...this.progress.explored], opened: [...this.progress.opened], defeated: [...this.progress.defeated],
            position: { x: this.player.centerX / this.room.width, y: this.player.centerY / this.room.height },
            environment: this.room.volcanic ? 'heat' : this.room.air.some(r => inside(this.player.centerX, this.player.centerY, r)) ? 'air' : this.room.pressure ? 'pressure' : 'water',
            state: this.player.state, prompt: this.prompt, objective: objective(this.progress), paused: this.paused, completed: this.progress.completed,
            boss: boss ? { name: ENEMY_INFO[boss.kind].name, health: boss.health, maxHealth: boss.maxHealth } : null,
            checkpoint: this.progress.checkpoint, saving: this.refill, gamepad: this.controls.gamepad
        };
        this.game.events.emit(GameEvent.Snapshot, snapshot);
    }
}
