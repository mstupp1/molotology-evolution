import { createGame } from './game/main';

const game = createGame('game-container');
// Development-only handle for browser regression tests. Removed from production by Vite.
if (import.meta.env.DEV) Object.assign(window, { __MOLOTOLOGY__: game });
