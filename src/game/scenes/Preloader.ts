import * as Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKey } from '../constants';

export class Preloader extends Phaser.Scene {
    constructor() {
        super(SceneKey.Preloader);
    }

    init() {
        const cx = GAME_WIDTH / 2;
        const cy = GAME_HEIGHT / 2;
        this.add.rectangle(cx, cy, 468, 32).setStrokeStyle(1, 0xffffff);
        const bar = this.add.rectangle(cx - 230, cy, 4, 28, 0xffffff).setOrigin(0, 0.5);
        this.load.on(Phaser.Loader.Events.PROGRESS, (p: number) => {
            bar.width = 4 + 460 * p;
        });
    }

    preload() {
        this.load.setPath('assets');
        // Load static files from public/assets/ here, e.g. this.load.image('player', 'player.png');
    }

    create() {
        this.scene.start(SceneKey.MainMenu);
    }
}
