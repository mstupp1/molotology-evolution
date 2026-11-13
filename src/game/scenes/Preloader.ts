import * as Phaser from 'phaser';
import { SceneKey } from '../constants';
import { el, mountLayer } from '../ui/layer';
import { ENEMY_VISUALS, PLAYER_FRAMES, PLAYER_TEXTURES, playerAnimation, type PlayerAnimation } from '../animation';

export class Preloader extends Phaser.Scene {
    private failures: string[] = [];
    private layer: HTMLDivElement;
    constructor() { super(SceneKey.Preloader); }
    init(): void {
        this.failures = [];
        this.layer = mountLayer(this, 'screen-loading');
        el('div', 'loading-title', 'Descending', this.layer);
        const fill = el('div', 'loading-fill', undefined, el('div', 'loading-track', undefined, this.layer));
        this.load.on(Phaser.Loader.Events.PROGRESS, (p: number) => { fill.style.width = `${Math.round(p * 100)}%`; });
        this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => this.failures.push(file.key));
    }
    preload(): void {
        this.load.setPath('assets');
        this.load.image('wreck', 'wreck.png');
        this.load.json('motion-manifest', 'motion-manifest.json');
        this.load.spritesheet('diver', 'diver.png', { frameWidth: 160, frameHeight: 160 });
        for (const key of PLAYER_TEXTURES) this.load.spritesheet(key, `${key}.png`, { frameWidth: 160, frameHeight: 160 });
        for (const kind of ENEMY_VISUALS) this.load.spritesheet(`enemy-${kind}`, `enemy-${kind}.png`, { frameWidth: 256, frameHeight: 256 });
        for (const key of ['harpoon-weapon', 'harpoon-head', 'anchor-ring', 'field-record', 'coral-barrier', 'volcanic-vent', 'lava', 'tentacle', 'claw-sweep', 'abyss-far', 'wreck-ribs']) this.load.image(key, `${key}.png`);
        for (let i = 0; i < 8; i++) { this.load.image(`creature-${i}`, `creature-${i}.png`); this.load.image(`prop-${i}`, `prop-${i}.png`); }
        for (const key of ['key', 'harpoon-icon', 'molt-icon']) this.load.image(key, `${key}.png`);
        this.load.audio('menu-music', ['main-menu.ogg', 'main-menu.m4a']);
        for (const key of ['ambience', 'slash', 'hit', 'harpoon', 'refill', 'molt', 'death', 'jump', 'land', 'dash', 'pickup', 'door', 'kill', 'hurt', 'roar']) this.load.audio(key, `${key}.wav`);
    }
    create(): void {
        if (this.failures.length) {
            el('div', 'loading-error', `Could not load: ${this.failures.join(', ')}\nReload the page to retry.`, this.layer);
            return;
        }
        PLAYER_TEXTURES.forEach((texture, stage) => {
            for (const name of Object.keys(PLAYER_FRAMES) as PlayerAnimation[]) {
                const key = playerAnimation(stage, name);
                if (this.anims.exists(key)) continue;
                const loop = ['walk', 'idle', 'hang', 'aim', 'fall'].includes(name);
                this.anims.create({ key, frames: this.anims.generateFrameNumbers(texture, { frames: [...PLAYER_FRAMES[name]] }), frameRate: name === 'idle' ? 3 : name === 'hang' ? 6 : name === 'melee' ? 18 : 12, repeat: loop ? -1 : 0 });
            }
        });
        for (const kind of ENEMY_VISUALS) {
            for (const [name, frames, rate, repeat] of [
                ['move', [0, 1, 2, 3, 4, 5], 9, -1], ['windup', [6, 7], 4, 0],
                ['strike', [8, 9], 8, -1], ['recover', [10, 11], 5, 0]
            ] as const) {
                const key = `enemy-${kind}-${name}`;
                if (!this.anims.exists(key)) this.anims.create({ key, frames: this.anims.generateFrameNumbers(`enemy-${kind}`, { frames: [...frames] }), frameRate: rate, repeat });
            }
        }
        // In-world labels are drawn to canvas once, so the faces must be ready before the first room.
        const fonts = ['400 16px Cinzel', '600 16px Cinzel', '400 16px "EB Garamond"', 'italic 400 16px "EB Garamond"'];
        const ready = Promise.all(fonts.map(f => document.fonts?.load(f))).catch(() => undefined);
        const timeout = new Promise(resolve => setTimeout(resolve, 2500));
        Promise.race([ready, timeout]).then(() => { if (this.scene.isActive()) this.scene.start(SceneKey.MainMenu); });
    }
}
