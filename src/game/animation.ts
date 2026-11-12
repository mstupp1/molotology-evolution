/** Six columns; named animation rows are shared across all three forms. */
export const PLAYER_TEXTURES = ['diver-motion', 'breach-motion', 'crab-motion'] as const;
export const ENEMY_KINDS = ['urchin', 'jellyfish', 'octopus', 'shark', 'handcrab', 'hermit', 'angler'] as const;
export const PLAYER_FRAMES = {
    walk: [0, 1, 2, 3, 4, 5], melee: [6, 7, 8, 9, 10, 11],
    catch: [12, 13, 14], hang: [14, 15, 14, 13], mantle: [15, 16, 17],
    jump: [18, 19, 20, 21], fall: [21, 22], land: [23, 24],
    idle: [24, 25], aim: [26], throw: [26, 27, 26], dash: [28], hurt: [29]
} as const;
export type PlayerAnimation = keyof typeof PLAYER_FRAMES;
export const playerAnimation = (stage: number, animation: PlayerAnimation): string => `player-${stage}-${animation}`;
