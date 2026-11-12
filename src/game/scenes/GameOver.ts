import * as Phaser from 'phaser';
import { SceneKey, EVOLUTION_NAMES } from '../constants';
import type { Progress } from '../model';
import { makeTextures, serifStyle, textStyle } from '../rendering';
import { ROOM_IDS } from '../world';

export class GameOver extends Phaser.Scene {
    private progress: Progress;
    private ready = false;
    constructor() { super(SceneKey.GameOver); }
    init(data: { progress: Progress }): void { this.progress = data.progress; this.ready = false; }
    create(): void {
        makeTextures(this);
        this.add.image(640, 360, 'wreck').setDisplaySize(1280, 720).setTint(0x698495).setAlpha(0.45);
        this.add.rectangle(640, 360, 1280, 720, 0x050f19, 0.6);
        this.add.text(640, 126, 'C H A P T E R   I   /   C O M P L E T E', textStyle(12, '#a3c4bf')).setOrigin(0.5);
        this.add.text(640, 198, 'The last light goes out.', serifStyle(52)).setOrigin(0.5);
        this.add.text(640, 285, 'You came here in a diving suit.\nSomething else will leave.', serifStyle(24, '#a7beb5')).setOrigin(0.5).setAlign('center').setLineSpacing(12);
        const divers = this.progress.defeated.filter(id => id.startsWith('handcrab:') || id.startsWith('hermit:')).length;
        const pearls = this.progress.collected.filter(id => id.startsWith('pearl:')).length;
        this.add.text(640, 385, `${EVOLUTION_NAMES[this.progress.evolution]}   ·   ${this.progress.explored.length} / ${ROOM_IDS.length} CHAMBERS   ·   ${divers} / 2 LOST DIVERS FOUND   ·   ${pearls} / 4 VITAL PEARLS`, textStyle(12, '#baac94')).setOrigin(0.5);
        this.add.particles(0, 0, 'bubble', { x: { min: 0, max: 1280 }, y: { min: 700, max: 760 }, lifespan: 8000, speedY: { min: -50, max: -20 }, scale: { min: 0.3, max: 0.8 }, alpha: { start: 0.5, end: 0 }, frequency: 220 });
        const explore = this.add.text(640, 485, 'Continue exploring', serifStyle(27, '#e7c88e')).setOrigin(0.5).setInteractive({ useHandCursor: true });
        const resume = () => this.scene.start(SceneKey.Game, { progress: this.progress, room: 'angler', from: 'caldera' });
        explore.on('pointerdown', resume); this.input.keyboard!.once('keydown-ENTER', resume);
        this.add.text(640, 550, 'Return to title', textStyle(15, '#8eadaa')).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.scene.start(SceneKey.MainMenu));
        this.add.text(640, 665, 'THE DEEP HAS ONLY BEGUN TO CHANGE YOU.', textStyle(10, '#758f92')).setOrigin(0.5);
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
        const pad = Array.from(navigator.getGamepads?.() ?? []).find(p => p?.connected);
        if (this.ready && pad?.buttons[0]?.pressed) this.scene.start(SceneKey.Game, { progress: this.progress, room: 'angler', from: 'caldera' });
    }
}
