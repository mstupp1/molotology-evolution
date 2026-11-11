import * as Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKey } from '../constants';

export class GameOver extends Phaser.Scene {
    constructor() {
        super(SceneKey.GameOver);
    }

    create() {
        this.add
            .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Game Over\nClick to return to menu', {
                fontFamily: 'sans-serif',
                fontSize: '48px',
                color: '#ffffff',
                align: 'center'
            })
            .setOrigin(0.5);

        this.input.once(Phaser.Input.Events.POINTER_DOWN, () => this.scene.start(SceneKey.MainMenu));
    }
}
