import * as Phaser from 'phaser';
import { SceneKey } from '../constants';
import { browserSaveStore, newProgress } from '../model';
import { makeTextures } from '../rendering';
import { el, keyHint, mountLayer } from '../ui/layer';
import { Menu } from '../ui/menu';

/** A dark wash that keeps the wreck visible at the edges and quiet behind the type. */
export function titleShade(scene: Phaser.Scene): void {
    if (scene.textures.exists('title-shade')) return;
    const canvas = scene.textures.createCanvas('title-shade', 640, 360)!, ctx = canvas.context;
    const radial = ctx.createRadialGradient(320, 150, 40, 320, 170, 420);
    radial.addColorStop(0, 'rgba(3,5,8,0.78)'); radial.addColorStop(0.45, 'rgba(3,5,8,0.62)'); radial.addColorStop(1, 'rgba(3,5,8,0.25)');
    ctx.fillStyle = radial; ctx.fillRect(0, 0, 640, 360);
    const edge = ctx.createLinearGradient(0, 0, 0, 360);
    edge.addColorStop(0, 'rgba(2,3,5,0.6)'); edge.addColorStop(0.25, 'rgba(2,3,5,0)'); edge.addColorStop(0.8, 'rgba(2,3,5,0)'); edge.addColorStop(1, 'rgba(2,3,5,0.75)');
    ctx.fillStyle = edge; ctx.fillRect(0, 0, 640, 360);
    canvas.refresh();
}

export class MainMenu extends Phaser.Scene {
    private menu: Menu;
    private previous = new Set<number>();
    private leaving = false;
    private confirmReplace = false;
    constructor() { super(SceneKey.MainMenu); }
    create(): void {
        this.startMusic();
        this.previous.clear(); this.leaving = false; this.confirmReplace = false; makeTextures(this); titleShade(this);
        const backdrop = this.add.image(640, 360, 'wreck').setDisplaySize(1320, 742).setTint(0x7f9fab);
        this.tweens.add({ targets: backdrop, x: 620, y: 350, duration: 14000, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        for (const [x, w, a] of [[860, 220, -10], [1010, 160, -4], [1160, 260, 6]]) {
            const ray = this.add.image(x, -30, 'ray').setOrigin(0.5, 0).setDisplaySize(w, 820).setAngle(a).setTint(0xa8e8e4).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.1);
            this.tweens.add({ targets: ray, alpha: 0.22, angle: a + 3, duration: 3000 + x * 2, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        }
        this.add.particles(0, 0, 'bubble', { x: { min: 0, max: 1280 }, y: { min: 640, max: 760 }, lifespan: 8000, speedY: { min: -55, max: -22 }, speedX: { min: -8, max: 8 }, scale: { min: 0.25, max: 0.7 }, alpha: { start: 0.55, end: 0 }, frequency: 240 });
        this.add.image(640, 360, 'title-shade').setDisplaySize(1280, 720);
        const halo = this.add.image(1040, 520, 'glow').setDisplaySize(440, 440).setTint(0xd8bb79).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.14);
        this.tweens.add({ targets: halo, alpha: 0.26, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        const diver = this.add.sprite(1040, 580, 'diver-motion', 24).setDisplaySize(250, 250).play('player-0-idle');
        this.tweens.add({ targets: diver, y: 574, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        this.add.particles(1062, 488, 'bubble', { lifespan: 3000, speedY: { min: -70, max: -40 }, speedX: { min: -10, max: 10 }, scale: { min: 0.3, max: 0.55 }, alpha: { start: 0.8, end: 0 }, frequency: 700, quantity: 2 });
        this.add.tileSprite(1040, 702, 560, 38, 'prop-0').setTileScale(0.6).setAlpha(0.8);

        const layer = mountLayer(this, 'screen-title');
        const block = el('div', 'title-block', undefined, layer);
        el('div', 'eyebrow', 'A Crustacean Gothic', block);
        el('div', 'title-name', 'Molotology', block);
        el('div', 'title-sub', 'Evolution', block);
        el('div', 'ornament', undefined, block).appendChild(el('span', 'gem'));
        el('div', 'title-tagline', 'The suit was made to keep the deep out. It cannot keep you human.', block);

        const store = browserSaveStore(), save = store.load();
        this.menu = new Menu(layer, [], 'center');
        if (save) this.menu.add({ label: 'Continue', note: 'Resume your last descent', action: () => this.begin(store.load() ?? newProgress()) });
        const fresh = this.menu.length;
        this.menu.add({ label: save ? 'New Descent' : 'Begin Descent', action: () => {
            if (save && !this.confirmReplace) { this.confirmReplace = true; this.menu.setLabel(fresh, 'New Descent', 'Your saved descent will be lost. Confirm again.'); return; }
            const progress = newProgress(); store.save(progress); this.begin(progress);
        } });
        const sound = this.menu.length;
        this.menu.add({ label: this.soundLabel(), action: () => { this.sound.mute = !this.sound.mute; this.menu.setLabel(sound, this.soundLabel()); } });
        this.menu.select(0, true);

        const footer = el('div', 'title-footer', undefined, layer);
        el('div', 'chapter', 'Chapter I · The Ship That Would Not Die', footer);
        const hints = el('div', '', undefined, footer);
        keyHint(['↑', '↓'], 'Select', hints); keyHint(['Enter'], 'Confirm', hints);
        el('div', 'version', 'Demo v3', footer);

        this.cameras.main.fadeIn(900, 3, 6, 10);
        const keyboard = this.input.keyboard!;
        keyboard.on('keydown-UP', () => this.menu.move(-1)); keyboard.on('keydown-W', () => this.menu.move(-1));
        keyboard.on('keydown-DOWN', () => this.menu.move(1)); keyboard.on('keydown-S', () => this.menu.move(1));
        keyboard.on('keydown-ENTER', () => this.menu.confirm()); keyboard.on('keydown-SPACE', () => this.menu.confirm());
    }
    private soundLabel(): string { return `Sound: ${this.sound.mute ? 'Off' : 'On'}`; }
    private startMusic(): void {
        if (!this.cache.audio.exists('menu-music')) return;
        const playing = this.sound.getAllPlaying().find(s => s.key === 'menu-music');
        if (playing) { (playing as Phaser.Sound.WebAudioSound).setVolume(0.55); return; }
        // The track is pre-crossfaded (see scripts/make-menu-loop.sh) so native looping is seamless.
        this.sound.play('menu-music', { loop: true, volume: 0.55 });
    }
    private begin(progress: ReturnType<typeof newProgress>): void {
        if (this.leaving) return; this.leaving = true;
        const music = this.sound.getAllPlaying().find(s => s.key === 'menu-music');
        if (music) this.tweens.add({ targets: music, volume: 0.45, duration: 600 });
        this.cameras.main.fadeOut(600, 3, 6, 10);
        const layer = this.menu.element.parentElement; if (layer) { layer.style.transition = 'opacity 600ms ease'; layer.style.opacity = '0'; }
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => { this.scene.start(SceneKey.Game, { progress }); });
    }
    update(): void {
        const pad = Array.from(navigator.getGamepads?.() ?? []).find(p => p?.connected); if (!pad) return;
        const edge = (n: number) => pad.buttons[n]?.pressed && !this.previous.has(n);
        if (edge(12)) this.menu.move(-1); if (edge(13)) this.menu.move(1); if (edge(0)) this.menu.confirm();
        this.previous.clear(); pad.buttons.forEach((b, i) => { if (b.pressed) this.previous.add(i); });
    }
}
