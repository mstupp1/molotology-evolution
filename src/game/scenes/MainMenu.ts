import * as Phaser from 'phaser';
import { SceneKey } from '../constants';
import { browserSaveStore, newProgress } from '../model';
import { serifStyle, textStyle, makeTextures } from '../rendering';

export class MainMenu extends Phaser.Scene {
    private selected = 0;
    private actions: (() => void)[] = [];
    private labels: Phaser.GameObjects.Text[] = [];
    private previous = new Set<number>();
    constructor() { super(SceneKey.MainMenu); }
    create(): void {
        this.selected = 0; this.actions = []; this.labels = []; this.previous.clear(); this.leaving = false; makeTextures(this);
        const backdrop = this.add.image(640, 360, 'wreck').setDisplaySize(1320, 742).setTint(0x90b5c1);
        this.tweens.add({ targets: backdrop, x: 620, y: 350, duration: 14000, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        for (const [x, w, a] of [[860, 220, -10], [1010, 160, -4], [1160, 260, 6]]) {
            const ray = this.add.image(x, -30, 'ray').setOrigin(0.5, 0).setDisplaySize(w, 820).setAngle(a).setTint(0xa8e8e4).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.12);
            this.tweens.add({ targets: ray, alpha: 0.26, angle: a + 3, duration: 3000 + x * 2, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        }
        this.add.particles(0, 0, 'bubble', { x: { min: 700, max: 1280 }, y: { min: 600, max: 760 }, lifespan: 7000, speedY: { min: -60, max: -25 }, speedX: { min: -8, max: 8 }, scale: { min: 0.3, max: 0.9 }, alpha: { start: 0.7, end: 0 }, frequency: 180 });
        this.add.rectangle(365, 360, 730, 720, 0x030c15, 0.82);
        this.add.rectangle(640, 360, 1280, 720, 0x040e19, 0.13);
        this.add.text(74, 80, 'A   C R U S T A C E A N   G O T H I C', textStyle(11, '#a2c6c1'));
        this.add.text(69, 135, 'MOLOTOLOGY', serifStyle(65, '#e8dbc0'));
        this.add.text(76, 215, 'E V O L U T I O N', textStyle(23, '#a9c7bf'));
        this.add.rectangle(253, 274, 352, 1, 0xb1a17b, 0.65);
        this.add.text(76, 305, 'The suit was made to keep the deep out.\nIt cannot keep you human.', serifStyle(21, '#bdc4b3')).setLineSpacing(10);
        const halo = this.add.image(1000, 470, 'glow').setDisplaySize(520, 520).setTint(0xd8bb79).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.17);
        this.tweens.add({ targets: halo, alpha: 0.3, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        const diver = this.add.image(974, 556, 'diver', 0).setDisplaySize(320, 320);
        this.tweens.add({ targets: diver, y: 550, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        this.add.particles(1000, 420, 'bubble', { lifespan: 3000, speedY: { min: -70, max: -40 }, speedX: { min: -10, max: 10 }, scale: { min: 0.3, max: 0.6 }, alpha: { start: 0.9, end: 0 }, frequency: 650, quantity: 2 });
        this.add.tileSprite(960, 702, 640, 38, 'prop-0').setTileScale(0.6);
        this.add.text(970, 652, 'THE WRECK  /  2,840 M', textStyle(11, '#8cb9b6')).setOrigin(0.5);
        const store = browserSaveStore(), save = store.load();
        if (save) this.button('Continue descent', () => this.begin(store.load() ?? newProgress()));
        this.button(save ? 'Begin a new descent' : 'Begin descent', () => {
            if (save && this.labels[this.selected].getData('confirm') !== true) {
                this.labels[this.selected].setText('Replace saved descent? Click again.').setData('confirm', true); return;
            }
            const progress = newProgress(); store.save(progress); this.begin(progress);
        });
        this.button(`Sound: ${this.sound.mute ? 'off' : 'on'}`, () => { this.sound.mute = !this.sound.mute; this.labels[this.selected].setText(`Sound: ${this.sound.mute ? 'off' : 'on'}`); });
        this.add.text(76, 625, 'A D / ARROWS MOVE     SPACE JUMP     J / CLICK SLASH\nSHIFT DODGE     E INTERACT     M MAP     ESC PAUSE', textStyle(10, '#759698')).setLineSpacing(9);
        this.add.text(76, 690, 'CHAPTER I · THE SHIP THAT WOULD NOT DIE', textStyle(10, '#9c9b87'));
        this.add.text(1205, 690, 'DEMO  v2', textStyle(10, '#8fb3b6')).setOrigin(1, 0).setLetterSpacing(3);
        this.cameras.main.fadeIn(900, 3, 10, 17);
        this.select(0);
        this.input.keyboard!.on('keydown-UP', () => this.select(this.selected - 1));
        this.input.keyboard!.on('keydown-DOWN', () => this.select(this.selected + 1));
        this.input.keyboard!.on('keydown-ENTER', () => this.actions[this.selected]?.());
        this.input.keyboard!.on('keydown-SPACE', () => this.actions[this.selected]?.());
    }
    private leaving = false;
    private begin(progress: ReturnType<typeof newProgress>): void {
        if (this.leaving) return; this.leaving = true;
        this.cameras.main.fadeOut(600, 3, 10, 17);
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(SceneKey.Game, { progress }));
    }
    private button(label: string, action: () => void): void {
        const i = this.labels.length;
        const text = this.add.text(92, 424 + i * 53, label, serifStyle(24, '#bdc7bb')).setInteractive({ useHandCursor: true });
        text.on('pointerover', () => this.select(i)).on('pointerdown', () => { this.selected = i; action(); });
        this.labels.push(text); this.actions.push(action);
    }
    private select(i: number): void {
        this.selected = (i + this.labels.length) % this.labels.length;
        this.labels.forEach((label, n) => { label.setColor(n === this.selected ? '#f0d49f' : '#9eafa9'); label.setX(n === this.selected ? 103 : 92); });
    }
    update(): void {
        const pad = Array.from(navigator.getGamepads?.() ?? []).find(p => p?.connected); if (!pad) return;
        const edge = (n: number) => pad.buttons[n]?.pressed && !this.previous.has(n);
        if (edge(12)) this.select(this.selected - 1); if (edge(13)) this.select(this.selected + 1); if (edge(0)) this.actions[this.selected]?.();
        this.previous.clear(); pad.buttons.forEach((b, i) => { if (b.pressed) this.previous.add(i); });
    }
}
