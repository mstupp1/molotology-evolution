export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

/** Single source of truth for scene keys. */
export const SceneKey = {
    Boot: 'Boot',
    Preloader: 'Preloader',
    MainMenu: 'MainMenu',
    Game: 'Game',
    Hud: 'Hud',
    GameOver: 'GameOver'
} as const;

/** Events the gameplay scene emits on `game.events` for the HUD (decoupled from UI). */
export const GameEvent = {
    ScoreChanged: 'score-changed'
} as const;
