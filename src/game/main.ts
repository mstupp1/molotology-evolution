import * as Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './constants';
import { Boot } from './scenes/Boot';
import { Preloader } from './scenes/Preloader';
import { MainMenu } from './scenes/MainMenu';
import { Game } from './scenes/Game';
import { Hud } from './scenes/Hud';
import { GameOver } from './scenes/GameOver';

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#10131a',
    // Art style undecided: if pixel art, also set `pixelArt: true` and `roundPixels: true`.
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    physics: {
        default: 'arcade',
        arcade: { debug: import.meta.env.DEV }
    },
    scene: [Boot, Preloader, MainMenu, Game, Hud, GameOver]
};

export function createGame(parent: string): Phaser.Game {
    return new Phaser.Game({ ...config, parent });
}
