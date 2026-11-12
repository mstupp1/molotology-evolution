import * as Phaser from 'phaser';
import { GameEvent, SceneKey, type GameSnapshot, type UiCommand } from '../constants';
import { browserSaveStore, collect, Combo, newProgress, objective, Survival, type Progress } from '../model';
import { inside, meetsRequirement, REQUIREMENT_LABEL, ROOMS, type Door, type Room, type RoomId } from '../world';
import { RoomView } from '../rendering';
import { Controls } from '../systems/Controls';
import { Player } from '../systems/Player';
import { Enemy, EnemySystem, ENEMY_INFO } from '../systems/Enemies';
import { Harpoon } from '../systems/Harpoon';

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
    private onCommand = (command: UiCommand) => this.command(command);
    private onBlur = () => { if (!this.dead && !this.transitioning) this.game.events.emit(GameEvent.Command, { type: 'pause', mode: 'pause' } satisfies UiCommand); };

    constructor() { super(SceneKey.Game); }
    init(data: StartData = {}): void {
        this.runSerial++;
        this.progress = data.progress ?? newProgress();
        this.roomId = data.room ?? this.progress.checkpoint; this.from = data.from;
        this.survival = data.survival ?? new Survival(); this.combo = new Combo();
        this.paused = false; this.transitioning = false; this.dead = false; this.refill = false;
        this.snapshotTimer = 0; this.prompt = ''; this.lowOxygenWarned = false;
    }
    create(): void {
        this.room = ROOMS[this.roomId];
        if (!this.progress.explored.includes(this.roomId)) this.progress.explored.push(this.roomId);
        this.view = new RoomView(this, this.room, this.progress);
        this.physics.world.setBounds(0, 0, this.room.width, this.room.height);
        const entry = this.from ? this.room.doors.find(d => d.to === this.from) : undefined;
        const spawnX = entry ? Phaser.Math.Clamp(entry.x + (entry.x > 1600 ? -120 : 120), 80, this.room.width - 80) : this.room.station?.x ?? 250;
        const spawnY = entry ? entry.y + 12 : 850;
        this.player = new Player(this, spawnX, spawnY - 70); this.player.evolution = this.progress.evolution;
        this.physics.add.collider(this.player, this.view.platforms);
        this.controls = new Controls(this); this.harpoon = new Harpoon(this, this.player);
        this.enemies = new EnemySystem(this, this.view.platforms, this.room.enemies, this.progress.defeated, this.room.platforms, (n, x) => this.hurt(n, x), e => this.killed(e));
        this.effects = this.physics.add.group({ defaultKey: 'spark', maxSize: 64, allowGravity: false });
        this.combatGraphics = this.add.graphics().setDepth(24);
        this.cameras.main.setBounds(0, 0, this.room.width, this.room.height).startFollow(this.player, true, 0.1, 0.1, -100, 60);
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
        this.sound.play('ambience', { loop: true, volume: 0.32 });
        this.time.delayedCall(450, () => {
            this.notice(this.room.name.toUpperCase(), this.room.id === 'hull' ? 'A / D move · Space jump · J / click slash · Shift dodge · E interact\nFind the Armory. The wreck will not let you stay human.' : this.room.log);
        });
        this.save();
    }
    private notice(title: string, body: string, duration = 6500): void { this.game.events.emit(GameEvent.Notice, { title, body, duration }); }
    private soundEffect(key: string, volume = 0.4): void { this.sound.play(key, { volume }); }
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
        if (this.harpoon.mode === 'pull') this.harpoon.mode = 'return';
        this.player.body.allowGravity = true;
        this.player.setAcceleration(0, 0).setVelocity(Math.sign(this.player.centerX - fromX || 1) * 230, -110);
        this.cameras.main.shake(100, 0.003); this.burst(this.player.centerX, this.player.centerY, 0xdd8b83);
        this.soundEffect('hit', 0.45);
    }
    private killed(enemy: Enemy): void {
        this.burst(enemy.x, enemy.y, enemy.kind === 'jellyfish' ? 0xbab2ff : 0xe1a390, enemy.boss ? 25 : 12);
        this.soundEffect('hit', 0.6); this.survival.health = Math.min(100, this.survival.health + (enemy.boss ? 35 : 4));
        if (!enemy.boss) return;
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
        this.save(); this.cameras.main.fadeOut(180, 3, 10, 17);
        this.time.delayedCall(190, () => this.scene.restart({ progress: this.progress, room: door.to, from: this.roomId, survival: this.survival } satisfies StartData));
    }
    private interact(pressed: boolean): void {
        const p = this.player; this.prompt = '';
        const pickup = this.view.pickups.find(q => q.sprite.active && Phaser.Math.Distance.Between(p.centerX, p.centerY, q.data.x, q.data.y) < 105);
        if (pickup) {
            this.prompt = `[E / Y] ${pickup.data.kind === 'harpoon' ? 'Recover the Harpoon' : pickup.data.kind === 'key' ? 'Take the Chapel Key' : 'Accept the Molt'}`;
            if (pressed && collect(this.progress, pickup.data.id, pickup.data.kind)) {
                pickup.sprite.destroy(); pickup.halo.destroy(); this.player.evolution = this.progress.evolution;
                this.survival.health = 100; this.survival.oxygen = 120; this.burst(p.centerX, p.centerY, 0xddb6b4, 28);
                if (pickup.data.kind === 'harpoon') this.notice('SALVAGE HARPOON ACQUIRED', 'Hold right mouse / RT to aim. Release to throw. Golden rings are grapple anchors.\nReturn to the Air Bell and aim up at the ring beside the high ledge.', 11000);
                else if (pickup.data.kind === 'key') this.notice('CHAPEL KEY ACQUIRED', 'A key, warm against your changing skin. The chapel waits beyond the eastern bulkhead.');
                else { this.soundEffect('molt', 0.7); this.cameras.main.flash(500, 100, 55, 75); this.notice(pickup.data.kind === 'breach' ? 'THE FIRST MOLT · THE BREACH' : 'THE SECOND MOLT · THE INFESTATION', pickup.data.kind === 'breach' ? 'Your lungs stiffen beneath a new shell. High pressure can no longer crush you.\nThe Pressure Works are open. Your oxygen reserve is still finite.' : 'The suit tears. The body answers. Shift / B now Dashes in your movement direction.\nDash through the low Ballast Duct. Find the officer’s key.', 11000); }
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
            this.prompt = meetsRequirement(door.requires, this.progress) ? `[E / Y] ${door.hidden ? 'Investigate ' : 'Enter '}${door.label.toLowerCase()}` : `[SEALED] ${REQUIREMENT_LABEL[door.requires!]}`;
            if (pressed) this.travel(door);
            return;
        }
        if (Math.abs(p.centerX - 1600) < 85 && Math.abs(p.feet - 850) < 70) {
            this.prompt = '[E / Y] Read the field record'; if (pressed) this.notice('FIELD RECORD · ' + this.room.name.toUpperCase(), this.room.log, 10000);
        }
    }
    update(_time: number, delta: number): void {
        if (this.paused || this.dead || this.transitioning) return;
        const dt = Math.min(delta / 1000, 0.05), p = this.player;
        const input = this.controls.poll(p.centerX, p.centerY);
        if (this.controls.gamepad && (input.map || input.pause)) { this.game.events.emit(GameEvent.Command, { type: 'pause', mode: input.map ? 'map' : 'pause' } satisfies UiCommand); return; }
        const air = this.room.air.some(r => inside(p.centerX, p.centerY, r));
        const busy = this.combo.active || this.harpoon.mode !== 'ready' || input.aim;
        p.updateController(dt, input, air, this.room.platforms, busy);
        if (p.dashTime > 0) this.combo.reset();
        if (input.attack && p.dashTime === 0 && p.hurtTime === 0 && this.harpoon.mode !== 'pull') {
            if (this.combo.press()) this.soundEffect('slash', 0.4);
        }
        if (this.combo.update(dt)) this.soundEffect('slash', 0.45);
        if (this.progress.harpoon && input.release && !this.combo.active && p.dashTime === 0 && p.hurtTime === 0) {
            if (this.harpoon.throw(input.aimX, input.aimY)) this.soundEffect('harpoon');
        }
        this.harpoon.update(dt, this.room, this.enemies);
        if (this.combo.active) p.state = 'MeleeAttack';
        else if (input.aim && this.progress.harpoon && this.harpoon.mode === 'ready') { p.state = 'HarpoonAim'; p.facing = input.aimX >= 0 ? 1 : -1; }
        else if (this.harpoon.mode === 'out' || this.harpoon.mode === 'return') p.state = 'HarpoonThrow';
        this.combatGraphics.clear();
        if (this.combo.damaging) {
            const reach = this.combo.index === 2 ? 145 : 115;
            const hitbox = new Phaser.Geom.Rectangle(p.centerX + (p.facing > 0 ? 0 : -reach), p.centerY - 55, reach, 110);
            this.combatGraphics.lineStyle(this.combo.index === 2 ? 6 : 4, 0xb3e8db, 0.85).beginPath().arc(p.centerX, p.centerY, reach - 15, p.facing > 0 ? -1 : 2.15, p.facing > 0 ? 1 : 4.15).strokePath();
            for (const e of this.enemies.list) {
                if (!e.active || !Phaser.Geom.Intersects.RectangleToRectangle(hitbox, new Phaser.Geom.Rectangle(e.body.x, e.body.y, e.body.width, e.body.height)) || this.enemies.blocked(p.centerX, p.centerY, e.body.center.x, e.body.center.y)) continue;
                if (this.combo.hit(e.spec.id)) { this.enemies.hit(e, 24 + this.progress.evolution * 6 + this.combo.index * 7, p.facing); this.burst(e.x, e.y, 0xf4c2a0, 5); this.soundEffect('hit', 0.3); }
            }
        }
        this.enemies.update(dt, p);
        this.interact(input.interact);
        if (Math.abs(input.x) > 0.1 || input.attack || input.dash) this.refill = false;
        this.survival.update(dt, air, this.refill);
        if (this.survival.oxygen < 30 && !this.lowOxygenWarned) { this.lowOxygenWarned = true; this.notice('OXYGEN RESERVE LOW', 'Find an air pocket or a refill station. At zero oxygen, your health will drain.', 5000); }
        if (this.survival.oxygen > 35) this.lowOxygenWarned = false;
        if (this.survival.oxygen === 0 && this.lastSound <= 0) { this.soundEffect('hit', 0.15); this.lastSound = 2; }
        this.lastSound -= dt;
        if (this.survival.invulnerable > 0 && p.dashTime === 0) p.setAlpha(Math.sin(this.time.now / 40) > 0 ? 0.4 : 1); else p.setAlpha(1);
        p.animate(this.survival.oxygen < 30, air && this.survival.oxygen < 120 || this.refill);
        const lights = this.enemies.list.filter(e => e.active && (e.kind === 'jellyfish' || e.kind === 'angler')).map(e => ({ x: e.x + (e.kind === 'angler' ? (e.flipX ? 90 : -90) : 0), y: e.y - (e.kind === 'angler' ? 100 : 25) }));
        this.view.update(dt, p, input.aimX, input.aimY, input.aim, lights);
        this.harpoon.draw(input.aim && this.progress.harpoon, input.aimX, input.aimY, this.room);
        this.effects.getChildren().forEach(child => { const s = child as Phaser.Physics.Arcade.Image; if (s.active) { const life = Number(s.getData('life')) - dt; s.setData('life', life).setAlpha(Math.max(0, life / 0.55)); if (life <= 0) s.disableBody(true, true); } });
        if (this.survival.health <= 0 || p.y > this.room.height + 50) this.die();
        this.snapshotTimer -= dt; if (this.snapshotTimer <= 0) { this.snapshotTimer = 0.08; this.emitSnapshot(); }
    }
    private die(): void {
        this.dead = true; this.player.state = 'Death'; this.player.setVelocity(0, 0).setAcceleration(0, 0); this.player.body.moves = false;
        this.player.animate(false, false); this.soundEffect('death'); this.notice('THE DEEP REMEMBERS', 'Returning to your last oxygen station. Your discoveries remain.', 2000);
        this.save(); this.emitSnapshot(); this.cameras.main.fadeOut(1300, 5, 8, 17);
        this.time.delayedCall(1500, () => this.scene.restart({ progress: this.progress } satisfies StartData));
    }
    private emitSnapshot(): void {
        const boss = this.enemies.list.find(e => e.boss && e.active && Math.abs(e.x - this.player.x) < 1100);
        const snapshot: GameSnapshot = {
            health: this.survival.health, oxygen: this.survival.oxygen, evolution: this.progress.evolution, harpoon: this.progress.harpoon, key: this.progress.key,
            room: this.roomId, roomName: this.room.name, explored: [...this.progress.explored], opened: [...this.progress.opened], defeated: [...this.progress.defeated],
            position: { x: this.player.centerX / this.room.width, y: this.player.centerY / this.room.height },
            environment: this.room.air.some(r => inside(this.player.centerX, this.player.centerY, r)) ? 'air' : this.room.pressure ? 'pressure' : 'water',
            state: this.player.state, prompt: this.prompt, objective: objective(this.progress), paused: this.paused, completed: this.progress.completed,
            boss: boss ? { name: ENEMY_INFO[boss.kind].name, health: boss.health, maxHealth: boss.maxHealth } : null,
            checkpoint: this.progress.checkpoint, saving: this.refill, gamepad: this.controls.gamepad
        };
        this.game.events.emit(GameEvent.Snapshot, snapshot);
    }
}
