import * as Phaser from 'phaser';
import { SceneKey, EVOLUTION_NAMES } from '../constants';
import type { Progress } from '../model';
import { makeTextures } from '../rendering';
import { ROOM_IDS } from '../world';
import { el, keyHint, mountLayer } from '../ui/layer';
import { Menu } from '../ui/menu';
import { titleShade } from './MainMenu';

export class GameOver extends Phaser.Scene {
    private progress: Progress;
    private ready = false;
    private menu: Menu;
    private previous = new Set<number>();
    constructor() { super(SceneKey.GameOver); }
    init(data: { progress: Progress }): void { this.progress = data.progress; this.ready = false; this.previous.clear(); }
    create(): void {
        makeTextures(this); titleShade(this);
        this.add.image(640, 360, 'wreck').setDisplaySize(1280, 720).setTint(0x5d7482).setAlpha(0.5);
        this.add.image(640, 360, 'title-shade').setDisplaySize(1280, 720);
        this.add.particles(0, 0, 'bubble', { x: { min: 0, max: 1280 }, y: { min: 700, max: 760 }, lifespan: 8000, speedY: { min: -50, max: -20 }, scale: { min: 0.3, max: 0.8 }, alpha: { start: 0.45, end: 0 }, frequency: 220 });

        const layer = mountLayer(this, 'screen-ending');
        el('div', 'eyebrow', 'Chapter I · Complete', layer);
        el('div', 'ending-title', 'The last light goes out.', layer);
        el('div', 'ending-prose', 'You came here in a diving suit. Something else will leave.', layer);
        el('div', 'ornament', undefined, layer).appendChild(el('span', 'gem'));
        const divers = this.progress.defeated.filter(id => id.startsWith('handcrab:') || id.startsWith('hermit:')).length;
        const pearls = this.progress.collected.filter(id => id.startsWith('pearl:')).length;
        const stats = el('div', 'stats', undefined, layer);
        const stat = (value: string, label: string) => { const s = el('div', 'stat', undefined, stats); el('div', 'stat-value', value, s); el('div', 'stat-label', label, s); };
        stat(EVOLUTION_NAMES[this.progress.evolution].split('·')[1]?.trim().replace(/^THE /, '') ?? '', 'Final form');
        stat(`${this.progress.explored.length} / ${ROOM_IDS.length}`, 'Chambers');
        stat(`${divers} / 2`, 'Lost divers');
        stat(`${pearls} / 4`, 'Vital pearls');

        const resume = () => { if (this.ready) this.scene.start(SceneKey.Game, { progress: this.progress, room: 'angler', from: 'caldera' }); };
        this.menu = new Menu(layer, [
            { label: 'Continue Exploring', action: resume },
            { label: 'Return to Title', action: () => { if (this.ready) this.scene.start(SceneKey.MainMenu); } }
        ]);
        const close = el('div', 'ending-close', undefined, layer);
        keyHint(['↑', '↓'], 'Select', close); keyHint(['Enter'], 'Confirm', close);
        close.style.fontFamily = 'var(--text)'; close.style.letterSpacing = '0'; close.style.fontSize = '16px';

        const keyboard = this.input.keyboard!;
        keyboard.on('keydown-UP', () => this.menu.move(-1)); keyboard.on('keydown-DOWN', () => this.menu.move(1));
        keyboard.on('keydown-ENTER', () => this.menu.confirm()); keyboard.on('keydown-SPACE', () => this.menu.confirm());
        this.cameras.main.fadeIn(1200); this.time.delayedCall(400, () => { this.ready = true; });
        this.ensureMusic();
    }
    private ensureMusic(): void {
        if (!this.cache.audio.exists('menu-music')) return;
        const playing = this.sound.getAllPlaying().find(s => s.key === 'menu-music');
        if (playing) return;
        this.sound.play('menu-music', { loop: true, volume: 0.45 });
    }
    update(): void {
        const pad = Array.from(navigator.getGamepads?.() ?? []).find(p => p?.connected); if (!pad) return;
        const edge = (n: number) => pad.buttons[n]?.pressed && !this.previous.has(n);
        if (edge(12)) this.menu.move(-1); if (edge(13)) this.menu.move(1); if (edge(0)) this.menu.confirm();
        this.previous.clear(); pad.buttons.forEach((b, i) => { if (b.pressed) this.previous.add(i); });
    }
}
