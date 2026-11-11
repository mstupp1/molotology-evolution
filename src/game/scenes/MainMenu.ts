import * as Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKey } from '../constants';

export class MainMenu extends Phaser.Scene {
    constructor() {
        super(SceneKey.MainMenu);
    }

    create() {
        this.add
            .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, 'Molotology Evolution', {
                fontFamily: 'sans-serif',
                fontSize: '64px',
                color: '#ffffff'
            })
            .setOrigin(0.5);
        this.add
            .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40, 'Click to start', {
                fontFamily: 'sans-serif',
                fontSize: '28px',
                color: '#9aa4b2'
            })
            .setOrigin(0.5);

        this.input.once(Phaser.Input.Events.POINTER_DOWN, () => this.scene.start(SceneKey.Game));
    }
}
