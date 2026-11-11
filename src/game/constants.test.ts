import { describe, expect, it } from 'vitest';
import { GameEvent, GAME_HEIGHT, GAME_WIDTH, SceneKey } from './constants';

describe('Game Constants', () => {
    it('defines standard 720p dimensions', () => {
        expect(GAME_WIDTH).toBe(1280);
        expect(GAME_HEIGHT).toBe(720);
    });

    it('has unique scene keys', () => {
        const keys = Object.values(SceneKey);
        const uniqueKeys = new Set(keys);
        expect(uniqueKeys.size).toBe(keys.length);
    });

    it('defines distinct game events', () => {
        const events = Object.values(GameEvent);
        const uniqueEvents = new Set(events);
        expect(uniqueEvents.size).toBe(events.length);
    });
});
