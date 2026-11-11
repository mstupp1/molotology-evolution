import * as Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, GameEvent, SceneKey } from '../constants';

/** Gameplay only. UI lives in the parallel Hud scene and is fed via `game.events`. */
export class Game extends Phaser.Scene {
    private score = 0;

    constructor() {
        super(SceneKey.Game);
    }

    create() {
        this.score = 0;
        this.scene.launch(SceneKey.Hud);

        // Placeholder: primitive stand-in until real sprites exist.
        const player = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 48, 48, 0x4ade80);
        this.physics.add.existing(player);

        // Scene-scoped timer (auto-cleaned with the scene). Placeholder score tick.
        this.time.addEvent({ delay: 1000, loop: true, callback: () => this.addScore(1) });

        // Custom listeners on shared emitters must be removed on shutdown to avoid leaks on restart.
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.game.events.off(GameEvent.ScoreChanged);
            this.scene.stop(SceneKey.Hud);
        });

        this.input.keyboard?.once('keydown-ESC', () => this.scene.start(SceneKey.GameOver));
    }

    private addScore(n: number) {
        this.score += n;
        this.game.events.emit(GameEvent.ScoreChanged, this.score);
    }
}
