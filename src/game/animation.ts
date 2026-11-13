/** Six columns; named animation rows are shared across all three forms. */
export const PLAYER_TEXTURES = ['diver-motion', 'breach-motion', 'crab-motion'] as const;
export const ENEMY_KINDS = ['urchin', 'jellyfish', 'octopus', 'shark', 'handcrab', 'hermit', 'angler'] as const;
export const ENEMY_VISUALS = [...ENEMY_KINDS, 'rigging-diver', 'cinder-diver'] as const;
export const PLAYER_FRAMES = {
    walk: [0, 1, 2, 3, 4, 5], melee: [6, 7, 8, 9, 10, 11],
    catch: [12, 13, 14], hang: [14, 15, 14, 13], mantle: [15, 16, 17],
    jump: [18, 19, 20, 21], fall: [21, 22], land: [23, 24],
    idle: [24, 25], aim: [26], throw: [26, 27, 26], dash: [28], hurt: [29]
} as const;
export type PlayerAnimation = keyof typeof PLAYER_FRAMES;
export const playerAnimation = (stage: number, animation: PlayerAnimation): string => `player-${stage}-${animation}`;

/** Gripping contact in 160px cells, measured at the raised hand/claw rather than the helmet. */
export const LEDGE_HANDS: readonly Record<number, readonly [number, number]>[] = [
    { 12: [109, 70], 13: [107, 64], 14: [91, 59], 15: [90, 60] },
    { 12: [113, 67], 13: [110, 62], 14: [96, 59], 15: [94, 60] }
];

/** Local chimney lips follow the Cinder's swaying furnace shell in each 256px pose. */
export const CINDER_CHIMNEYS: readonly (readonly [number, number])[] = [
    [185, 46], [181, 47], [180, 54], [183, 48], [181, 47], [185, 46],
    [184, 54], [164, 45], [173, 66], [181, 69], [165, 54], [178, 57]
];
