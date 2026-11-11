import * as Phaser from 'phaser';
import { GameEvent, SceneKey } from '../constants';

/** Runs in parallel with Game so UI is unaffected by the gameplay camera. */
export class Hud extends Phaser.Scene {
    constructor() {
        super(SceneKey.Hud);
    }

    create() {
        const label = this.add.text(16, 12, 'Score: 0', {
            fontFamily: 'sans-serif',
            fontSize: '24px',
            color: '#ffffff'
        });
        this.add.text(16, 44, 'Esc: end run', {
            fontFamily: 'sans-serif',
            fontSize: '16px',
            color: '#9aa4b2'
        });

        const onScore = (score: number) => label.setText(`Score: ${score}`);
        this.game.events.on(GameEvent.ScoreChanged, onScore);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.game.events.off(GameEvent.ScoreChanged, onScore);
        });
    }
}
