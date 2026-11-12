import type { RoomId } from './world';
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
    Snapshot: 'game:snapshot', Command: 'ui:command', Notice: 'game:notice', Sound: 'game:sound'
} as const;
export type Evolution = 0 | 1 | 2;
export type PlayerState = 'Idle' | 'Walk' | 'Jump' | 'Fall' | 'LedgeGrab' | 'Mantle' | 'Dodge' | 'Dash' | 'MeleeAttack' | 'HarpoonAim' | 'HarpoonThrow' | 'HarpoonPull' | 'Hurt' | 'Death';
export type UiCommand = { type: 'pause'; mode: 'map' | 'pause' } | { type: 'resume' } | { type: 'menu' } | { type: 'mute' };
export interface GameSnapshot {
    health: number; maxHealth: number; oxygen: number; evolution: Evolution; harpoon: boolean; key: boolean;
    room: RoomId; roomName: string; explored: RoomId[]; opened: string[]; defeated: string[];
    position: { x: number; y: number }; environment: 'water' | 'air' | 'pressure';
    state: PlayerState; prompt: string; objective: string; paused: boolean; completed: boolean;
    boss: { name: string; health: number; maxHealth: number } | null;
    checkpoint: RoomId; saving: boolean; gamepad: boolean;
}
export interface Notice { title: string; body: string; duration: number; boss?: boolean }
export const EVOLUTION_NAMES = ['I · THE DIVER', 'II · THE BREACH', 'III · THE INFESTATION'] as const;
export const COLORS = { ink: 0x060f19, panel: 0x091b26, teal: 0x77d4cc, gold: 0xe1bb7a, coral: 0xe97c76, muted: 0x789599, purple: 0xa495d0 };
