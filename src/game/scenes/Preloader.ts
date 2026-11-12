import * as Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKey } from '../constants';
import { textStyle, serifStyle } from '../rendering';

export class Preloader extends Phaser.Scene {
    private failures: string[] = [];
    constructor() { super(SceneKey.Preloader); }
    init(): void {
        this.failures = [];
        this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 65, 'Descending into the wreck', serifStyle(30)).setOrigin(0.5);
        const bar = this.add.rectangle(410, GAME_HEIGHT / 2 + 10, 0, 3, 0x8cbfb7).setOrigin(0, 0.5);
        this.add.rectangle(640, GAME_HEIGHT / 2 + 10, 460, 4).setStrokeStyle(1, 0x31515a);
        this.add.text(640, 430, 'GATHERING WHAT THE DEEP LEFT BEHIND', textStyle(10, '#6e9399')).setOrigin(0.5);
        this.load.on(Phaser.Loader.Events.PROGRESS, (p: number) => bar.setDisplaySize(460 * p, 3));
        this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => this.failures.push(file.key));
    }
    preload(): void {
        this.load.setPath('assets');
        this.load.image('wreck', 'wreck.png');
        this.load.spritesheet('diver', 'diver.png', { frameWidth: 160, frameHeight: 160 });
        for (let i = 0; i < 8; i++) { this.load.image(`creature-${i}`, `creature-${i}.png`); this.load.image(`prop-${i}`, `prop-${i}.png`); }
        for (const key of ['key', 'harpoon-icon', 'molt-icon']) this.load.image(key, `${key}.png`);
        for (const key of ['ambience', 'slash', 'hit', 'harpoon', 'refill', 'molt', 'death', 'jump', 'land', 'dash', 'pickup', 'door', 'kill', 'hurt', 'roar']) this.load.audio(key, `${key}.wav`);
    }
    create(): void {
        if (this.failures.length) {
            this.add.text(640, 500, `Could not load: ${this.failures.join(', ')}\nReload the page to retry.`, textStyle(16, '#e1a49b')).setOrigin(0.5);
            return;
        }
        for (let stage = 0; stage < 3; stage++) {
            if (!this.anims.exists(`walk-${stage}`)) this.anims.create({ key: `walk-${stage}`, frames: this.anims.generateFrameNumbers('diver', { frames: [stage * 6 + 1, stage * 6 + 2] }), frameRate: 9, repeat: -1 });
        }
        this.scene.start(SceneKey.MainMenu);
    }
}
