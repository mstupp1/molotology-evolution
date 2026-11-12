import * as Phaser from 'phaser';
import { COLORS, GAME_WIDTH, GAME_HEIGHT } from './constants';
import { meetsRequirement, type Room, type Door, type Pickup, type RoomId, type Obstacle, type Rect } from './world';
import type { Progress } from './model';
import type { Player } from './systems/Player';
import { Atmosphere, softTexture } from './atmosphere';
import { Flicker, roomDarkness } from './lighting';

/** In-world labels (door names, stations, pickups) use the same inscriptional capitals as the interface. */
export const textStyle = (size = 16, color = '#b9ccca'): Phaser.Types.GameObjects.Text.TextStyle => ({ fontFamily: 'Cinzel, Georgia, serif', fontStyle: '600', fontSize: `${Math.max(13, size + 2)}px`, color, resolution: 3 });
export const serifStyle = (size = 32, color = '#e5dac0'): Phaser.Types.GameObjects.Text.TextStyle => ({ fontFamily: '"EB Garamond", Georgia, serif', fontSize: `${size}px`, color, resolution: 3 });

export type PlaqueTone = 'bone' | 'sealed' | 'air' | 'heat' | 'relic';
const PLAQUE: Record<PlaqueTone, { text: string; rim: number }> = {
    bone: { text: '#ece2c8', rim: 0xc9a668 }, sealed: { text: '#f0b3a8', rim: 0xb4483d }, air: { text: '#c9efe3', rim: 0x72bcae },
    heat: { text: '#ffd2a3', rim: 0xf0a868 }, relic: { text: '#f6e2b4', rim: 0xe1bb7a }
};

/**
 * A small riveted nameplate fixed into the wreck. It reads like salvage stencilled
 * onto the ship rather than an interface overlay, but gives every label a dark
 * ground, a hard outline and a size that holds up at a glance.
 */
export function plaque(scene: Phaser.Scene, x: number, y: number, label: string, tone: PlaqueTone = 'bone', depth = 10): Phaser.GameObjects.Container {
    const style = PLAQUE[tone];
    const text = scene.add.text(0, 0, label, { fontFamily: 'Cinzel, Georgia, serif', fontStyle: '600', fontSize: '17px', color: style.text, resolution: 3, stroke: '#050608', strokeThickness: 4 })
        .setOrigin(0.5).setLetterSpacing(1.5).setShadow(0, 2, '#000000', 4, true, true);
    text.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    const w = Math.ceil(text.width) + 40, h = 30, g = scene.add.graphics();
    g.fillStyle(0x000000, 0.35).fillRect(-w / 2 + 2, -h / 2 + 3, w, h);
    g.fillStyle(0x0a0c0e, 0.86).fillRect(-w / 2, -h / 2, w, h);
    g.fillStyle(0xffffff, 0.05).fillRect(-w / 2, -h / 2, w, h / 2);
    g.lineStyle(1, style.rim, 0.75).strokeRect(-w / 2 + 0.5, -h / 2 + 0.5, w - 1, h - 1);
    g.lineStyle(1, style.rim, 0.25).strokeRect(-w / 2 + 3.5, -h / 2 + 3.5, w - 7, h - 7);
    for (const rx of [-w / 2 + 10, w / 2 - 10]) g.fillStyle(0x020303, 1).fillCircle(rx + 0.5, 1, 2.6).fillStyle(style.rim, 0.85).fillCircle(rx, 0, 2);
    return scene.add.container(Math.round(x), Math.round(y), [g, text]).setDepth(depth);
}

/**
 * The game renders with `pixelArt`, which samples every texture with NEAREST
 * filtering. That keeps sprites crisp but shreds text glyphs, so text objects
 * are switched to smooth filtering as they are added to a scene.
 */
export function smoothText(scene: Phaser.Scene): void {
    const onAdded = (object: Phaser.GameObjects.GameObject) => { if (object instanceof Phaser.GameObjects.Text) object.texture.setFilter(Phaser.Textures.FilterMode.LINEAR); };
    scene.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, onAdded);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, onAdded));
}

/** Per-chamber art direction: every room shares the wreck, but not its mood. */
export interface RoomTheme {
    tint: number; fog: number; accent: number; darkness: number; rays: number; rayColor: number; flip: boolean;
    coral: number[]; chains: number; warning?: boolean;
}
const THEMES: Record<RoomId, RoomTheme> = {
    hull: { tint: 0xa9d6d8, fog: 0x0f3a44, accent: 0x7fd8cf, darkness: 0.4, rays: 4, rayColor: 0x9fe6e0, flip: false, coral: [0xffffff], chains: 2 },
    bell: { tint: 0xd9d4b4, fog: 0x3a3a26, accent: 0xf0cf8a, darkness: 0.28, rays: 5, rayColor: 0xf6e3b0, flip: true, coral: [0xffe0c0, 0xffffff], chains: 1 },
    cargo: { tint: 0xa7c0c6, fog: 0x14313a, accent: 0xe3bf7d, darkness: 0.46, rays: 2, rayColor: 0x9fd7da, flip: false, coral: [0xffffff, 0xc9f0ff], chains: 3 },
    armory: { tint: 0x9db3d9, fog: 0x101e3c, accent: 0x8fb6ff, darkness: 0.5, rays: 2, rayColor: 0xa8c4ff, flip: true, coral: [0xb8d0ff], chains: 2 },
    rigging: { tint: 0x9fcbbc, fog: 0x0f3a30, accent: 0x9ee8c0, darkness: 0.4, rays: 5, rayColor: 0xb2f2d2, flip: false, coral: [0xd6ffe6], chains: 6 },
    infirmary: { tint: 0xc6dacd, fog: 0x203a30, accent: 0xd4f0c0, darkness: 0.38, rays: 3, rayColor: 0xe0f6d8, flip: true, coral: [0xe8ffd8, 0xffffff], chains: 1 },
    pressure: { tint: 0xb3a0d6, fog: 0x2a1840, accent: 0xff7a6a, darkness: 0.52, rays: 1, rayColor: 0xc8a8ff, flip: false, coral: [0xffb0c0], chains: 3, warning: true },
    molt: { tint: 0xd2a6bf, fog: 0x3a1830, accent: 0xff9fc8, darkness: 0.5, rays: 2, rayColor: 0xffc0dc, flip: true, coral: [0xffb8d8, 0xffd0b0], chains: 2 },
    ballast: { tint: 0x8eaeb6, fog: 0x0c2630, accent: 0x9fd0d8, darkness: 0.56, rays: 1, rayColor: 0x9fd0d8, flip: false, coral: [0xc0e0ff], chains: 4 },
    quarters: { tint: 0xdac5a2, fog: 0x3a2a14, accent: 0xffd08a, darkness: 0.38, rays: 3, rayColor: 0xffe2b0, flip: true, coral: [0xffe0b8], chains: 1 },
    chapel: { tint: 0xb2a2e2, fog: 0x241a46, accent: 0xc8b0ff, darkness: 0.54, rays: 6, rayColor: 0xd6c4ff, flip: false, coral: [0xd8c8ff, 0xffffff], chains: 2 },
    furnace: { tint: 0xe3a483, fog: 0x3c171b, accent: 0xff914b, darkness: 0.38, rays: 2, rayColor: 0xffbc80, flip: false, coral: [0xff9b76], chains: 3, warning: true },
    caldera: { tint: 0xd6a68d, fog: 0x351c26, accent: 0xffaa55, darkness: 0.4, rays: 3, rayColor: 0xff9b60, flip: true, coral: [0xffc090], chains: 2, warning: true },
    angler: { tint: 0x7a92bc, fog: 0x060c22, accent: 0xb5a4eb, darkness: 0.6, rays: 0, rayColor: 0x8090c0, flip: true, coral: [0x9aa8ff], chains: 3 },
    handcrab: { tint: 0xc4929c, fog: 0x2e1018, accent: 0xff8f7a, darkness: 0.58, rays: 1, rayColor: 0xffb0a0, flip: false, coral: [0xffa0a0], chains: 3 },
    hermit: { tint: 0xb99aa6, fog: 0x2a1424, accent: 0xffa88a, darkness: 0.58, rays: 1, rayColor: 0xffc0a8, flip: true, coral: [0xffb8a0], chains: 3 }
};
export function themeFor(id: RoomId): RoomTheme { return THEMES[id]; }

export function makeTextures(scene: Phaser.Scene): void {
    if (!scene.textures.exists('spark')) {
        const g = scene.make.graphics({ x: 0, y: 0 });
        g.fillStyle(0xc7e9ed).fillCircle(8, 8, 5).fillStyle(0xffffff).fillCircle(7, 6, 2).generateTexture('spark', 16, 16); g.destroy();
    }
    if (!scene.textures.exists('bubble')) {
        const g = scene.make.graphics({ x: 0, y: 0 });
        g.fillStyle(0xbfeff0, 0.18).fillCircle(8, 8, 6).lineStyle(1.5, 0xd8fbff, 0.85).strokeCircle(8, 8, 6).fillStyle(0xffffff, 0.9).fillCircle(6, 5, 1.6).generateTexture('bubble', 16, 16); g.destroy();
    }
    if (!scene.textures.exists('dot')) {
        const g = scene.make.graphics({ x: 0, y: 0 });
        g.fillStyle(0xffffff).fillCircle(4, 4, 4).generateTexture('dot', 8, 8); g.destroy();
    }
    if (!scene.textures.exists('glow')) {
        const canvas = scene.textures.createCanvas('glow', 128, 128)!;
        const ctx = canvas.context; const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        gradient.addColorStop(0, 'rgba(165,243,235,0.55)'); gradient.addColorStop(0.3, 'rgba(90,187,190,0.2)'); gradient.addColorStop(1, 'rgba(38,118,141,0)');
        ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128); canvas.refresh();
    }
    if (!scene.textures.exists('softlight')) {
        const canvas = scene.textures.createCanvas('softlight', 128, 128)!;
        const ctx = canvas.context; const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        gradient.addColorStop(0, 'rgba(255,255,255,0.9)'); gradient.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128); canvas.refresh();
    }
    if (!scene.textures.exists('ray')) {
        // A soft, tapering shaft of light falling from the surface.
        const canvas = scene.textures.createCanvas('ray', 128, 512)!;
        const ctx = canvas.context;
        const vertical = ctx.createLinearGradient(0, 0, 0, 512);
        vertical.addColorStop(0, 'rgba(255,255,255,0.75)'); vertical.addColorStop(0.55, 'rgba(255,255,255,0.22)'); vertical.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = vertical; ctx.beginPath(); ctx.moveTo(44, 0); ctx.lineTo(84, 0); ctx.lineTo(128, 512); ctx.lineTo(0, 512); ctx.closePath(); ctx.fill();
        ctx.globalCompositeOperation = 'destination-in';
        const horizontal = ctx.createLinearGradient(0, 0, 128, 0);
        horizontal.addColorStop(0, 'rgba(0,0,0,0)'); horizontal.addColorStop(0.5, 'rgba(0,0,0,1)'); horizontal.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = horizontal; ctx.fillRect(0, 0, 128, 512); canvas.refresh();
    }
    if (!scene.textures.exists('fog')) {
        const canvas = scene.textures.createCanvas('fog', 16, 256)!;
        const ctx = canvas.context; const gradient = ctx.createLinearGradient(0, 0, 0, 256);
        gradient.addColorStop(0, 'rgba(255,255,255,0)'); gradient.addColorStop(1, 'rgba(255,255,255,1)');
        ctx.fillStyle = gradient; ctx.fillRect(0, 0, 16, 256); canvas.refresh();
    }
    if (!scene.textures.exists('hullplate')) {
        // Riveted, rust-streaked iron used for floors and solid bulkheads.
        const canvas = scene.textures.createCanvas('hullplate', 128, 128)!;
        const ctx = canvas.context; const rnd = new Phaser.Math.RandomDataGenerator(['hullplate']);
        ctx.fillStyle = '#0d1d26'; ctx.fillRect(0, 0, 128, 128);
        for (let i = 0; i < 260; i++) { ctx.fillStyle = `rgba(${rnd.between(20, 40)},${rnd.between(40, 60)},${rnd.between(55, 70)},${rnd.realInRange(0.2, 0.5)})`; ctx.fillRect(rnd.between(0, 127), rnd.between(0, 127), rnd.between(1, 4), rnd.between(1, 3)); }
        for (let i = 0; i < 7; i++) { const x = rnd.between(4, 124); const g = ctx.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, 'rgba(140,72,40,0.35)'); g.addColorStop(1, 'rgba(140,72,40,0)'); ctx.fillStyle = g; ctx.fillRect(x, rnd.between(0, 60), rnd.between(2, 5), rnd.between(30, 90)); }
        ctx.fillStyle = '#060f15'; ctx.fillRect(0, 63, 128, 2); ctx.fillRect(63, 0, 2, 64); ctx.fillRect(31, 64, 2, 64); ctx.fillRect(95, 64, 2, 64);
        ctx.fillStyle = 'rgba(120,150,150,0.18)'; ctx.fillRect(0, 65, 128, 1); ctx.fillRect(0, 1, 128, 1);
        for (const [x, y] of [[8, 8], [56, 8], [72, 8], [120, 8], [8, 56], [56, 56], [72, 56], [120, 56], [24, 72], [40, 72], [88, 72], [104, 72], [24, 120], [40, 120], [88, 120], [104, 120]]) {
            ctx.fillStyle = '#04090d'; ctx.beginPath(); ctx.arc(x + 1, y + 1, 2.4, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#5d6f6b'; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#9aa69a'; ctx.fillRect(x - 1, y - 1, 1, 1);
        }
        canvas.refresh();
    }
    if (!scene.textures.exists('pearl')) {
        const canvas = scene.textures.createCanvas('pearl', 64, 64)!;
        const ctx = canvas.context;
        ctx.fillStyle = '#5a2730'; ctx.beginPath(); ctx.ellipse(32, 44, 24, 10, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c8686e'; ctx.beginPath(); ctx.ellipse(32, 42, 21, 7, 0, 0, Math.PI); ctx.fill();
        const g = ctx.createRadialGradient(27, 26, 2, 32, 32, 16);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, '#ffd9df'); g.addColorStop(1, '#d0607c');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(32, 32, 13, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(27, 27, 3, 0, Math.PI * 2); ctx.fill();
        canvas.refresh();
    }
}
export interface RenderedPickup { data: Pickup; sprite: Phaser.GameObjects.Image; halo: Phaser.GameObjects.Image; label: Phaser.GameObjects.Container }
export class RoomView {
    doors: { data: Door; image: Phaser.GameObjects.Image; label?: Phaser.GameObjects.Container }[] = [];
    pickups: RenderedPickup[] = [];
    platforms: Phaser.Physics.Arcade.StaticGroup;
    geometry: Rect[];
    breakables: { data: Obstacle; sprite: Phaser.Physics.Arcade.Image; label: Phaser.GameObjects.Container; hits: number }[] = [];
    readonly theme: RoomTheme;
    private atmosphere: Atmosphere;
    private darkness: Phaser.Textures.CanvasTexture;
    private overlay: Phaser.GameObjects.Image;
    private record: Phaser.GameObjects.Image;
    private tick = 0;
    private warnings: Phaser.GameObjects.Image[] = [];
    /** Hanging lanterns are the room's fixed lights; each can gutter on its own. */
    private lanterns: { x: number; y: number; lamp: Phaser.GameObjects.Image; halo: Phaser.GameObjects.Image; flicker: Flicker }[] = [];
    private headlamp = new Flicker(Math.random, [10, 24], 0.2);
    constructor(private scene: Phaser.Scene, readonly room: Room, progress: Progress) {
        makeTextures(scene);
        const theme = this.theme = THEMES[room.id];
        const rnd = new Phaser.Math.RandomDataGenerator([room.id]);
        scene.cameras.main.setBackgroundColor('#07131d');
        // Distinct image layers, from distant seabed to near iron ribs.
        const bgW = GAME_WIDTH + (room.width - GAME_WIDTH) * 0.12 + 40, bgH = bgW * 941 / 1672;
        // Aerial perspective: the farther a plane sits, the softer and foggier it gets. The playable plane is never softened.
        scene.add.image(-20, -20, softTexture(scene, 'abyss-far', 4)).setOrigin(0).setDisplaySize(GAME_WIDTH + room.width * 0.05, GAME_HEIGHT + 160).setScrollFactor(0.04, 0.06).setDepth(-24).setTint(room.volcanic ? 0xd3938e : theme.tint).setAlpha(0.8);
        const wreck = scene.add.image(-20, -20, softTexture(scene, 'wreck', 2)).setOrigin(0).setDisplaySize(bgW, Math.max(bgH, GAME_HEIGHT + 80)).setScrollFactor(0.12).setDepth(-22).setTint(theme.tint).setFlipX(theme.flip).setAlpha(0.38);
        const ribs = scene.add.tileSprite(0, -30, GAME_WIDTH + room.width * 0.3, 1100, 'wreck-ribs').setOrigin(0).setScrollFactor(0.28, 0.22).setDepth(-20).setTint(theme.tint).setAlpha(0.68).setTileScale(0.9);
        // Fog veils between the planes stack up with distance, so each band reads as farther than the last.
        scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, theme.fog, 0.16).setScrollFactor(0).setDepth(-21);
        scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, theme.fog, 0.22).setScrollFactor(0).setDepth(-19);
        // Light shafts from the distant surface drift slowly.
        for (let i = 0; i < theme.rays; i++) {
            const ray = scene.add.image(rnd.between(80, GAME_WIDTH + (room.width - GAME_WIDTH) * 0.35), -40, 'ray').setOrigin(0.5, 0).setScrollFactor(0.35, 0.2)
                .setDisplaySize(rnd.between(140, 260), rnd.between(620, 900)).setAngle(rnd.realInRange(-16, 6)).setTint(theme.rayColor).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(-18);
            scene.tweens.add({ targets: ray, alpha: { from: rnd.realInRange(0.08, 0.14), to: rnd.realInRange(0.2, 0.32) }, angle: ray.angle + rnd.realInRange(2, 5), duration: rnd.between(3200, 6200), yoyo: true, repeat: -1, ease: 'Sine.InOut', delay: rnd.between(0, 1500) });
        }
        const girders: Phaser.GameObjects.Image[] = [];
        // Lantern flicker draws from its own seed so room layouts stay exactly as designed.
        const flickerRnd = new Phaser.Math.RandomDataGenerator([`${room.id}:flicker`]);
        // Mid-ground silhouettes: distant girders and chains at half parallax.
        for (let x = rnd.between(-100, 200); x < GAME_WIDTH + (room.width - GAME_WIDTH) * 0.5; x += rnd.between(380, 620)) {
            girders.push(scene.add.image(x, rnd.between(-40, 80), 'prop-1').setOrigin(0.5, 0).setScrollFactor(0.5, 0.6).setDisplaySize(rnd.between(70, 110), rnd.between(760, 980)).setTint(0x0b1a22).setAlpha(0.78).setDepth(-15));
        }
        const decor = scene.add.graphics().setDepth(-5);
        for (let i = 0, x = rnd.between(150, 300); x < room.width; i++, x += rnd.between(520, 760)) {
            if (scene.textures.exists('prop-1')) scene.add.image(x, 330, 'prop-1').setDisplaySize(100, 800).setAlpha(0.5).setDepth(-8).setTint(theme.tint);
            decor.lineStyle(5, 0x1a333b, 0.7).lineBetween(x + 100, 0, x + 100, 220);
            decor.lineStyle(1, 0x71837b, 0.45).lineBetween(x + 103, 0, x + 103, 220);
            const lantern = scene.add.image(x + 100, 220, 'prop-4').setDisplaySize(52, 88).setAlpha(0.85).setDepth(-3).setOrigin(0.5, 0.1);
            scene.tweens.add({ targets: lantern, angle: { from: -4, to: 4 }, duration: rnd.between(2400, 3600), yoyo: true, repeat: -1, ease: 'Sine.InOut' });
            const halo = scene.add.image(x + 100, 252, 'glow').setDisplaySize(240, 240).setTint(theme.accent).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.22).setDepth(-2);
            scene.tweens.add({ targets: halo, alpha: { from: 0.16, to: 0.3 }, duration: rnd.between(900, 1700), yoyo: true, repeat: -1, ease: 'Sine.InOut' });
            this.lanterns.push({ x: x + 100, y: 252, lamp: lantern, halo, flicker: new Flicker(() => flickerRnd.frac(), [3, 11]) });
        }
        // Hanging chains in the near background.
        for (let i = 0; i < theme.chains; i++) {
            const x = rnd.between(200, room.width - 200);
            const chain = scene.add.image(x, -30, 'prop-7').setOrigin(0.5, 0).setDisplaySize(rnd.between(40, 60), rnd.between(260, 460)).setTint(theme.tint).setAlpha(0.8).setDepth(-6);
            scene.tweens.add({ targets: chain, angle: { from: -1.5, to: 1.5 }, duration: rnd.between(3000, 5000), yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        }
        this.platforms = scene.physics.add.staticGroup();
        this.geometry = [...room.platforms];
        for (const p of room.platforms) {
            const collision = scene.add.rectangle(p.x + p.w / 2, p.y + p.h / 2, p.w, p.h).setVisible(false);
            scene.physics.add.existing(collision, true); this.platforms.add(collision);
            const solid = p.h >= 100;
            // Iron plating fills the body of floors and bulkheads.
            scene.add.tileSprite(p.x + p.w / 2, p.y + p.h / 2 + 8, p.w, Math.max(p.h - 8, 20), 'hullplate').setDepth(4).setTint(theme.tint).setTileScale(1);
            if (solid && p.y > 0 && p.w < room.width) {
                decor.fillStyle(0x02070b, 0.55).fillRect(p.x - 10, p.y, 10, p.h).fillRect(p.x + p.w, p.y, 10, p.h);
                scene.add.tileSprite(p.x + p.w / 2, p.y + p.h - 14, p.w, 30, 'prop-0').setDepth(5).setTileScale(0.45).setFlipY(true).setTint(theme.tint);
            }
            if (scene.textures.exists('prop-0')) scene.add.tileSprite(p.x + p.w / 2, p.y + 16, p.w, 45, 'prop-0').setDepth(5).setTileScale(0.45).setTint(theme.tint);
            decor.lineStyle(2, 0x849082, 0.7).lineBetween(p.x, p.y, p.x + p.w, p.y);
            if (p.h < 100) for (let x = p.x + 30; x < p.x + p.w; x += 160) {
                decor.lineStyle(4, 0x1a3038).lineBetween(x, p.y + 20, x, p.y + 105);
                decor.lineStyle(2, 0x344a4a).lineBetween(x, p.y + 20, x + 45, p.y + 65);
            }
            // Coral, kelp and wreckage scattered with a per-room seed, so rooms stop looking cloned.
            if (!solid || p.w >= room.width) for (let x = p.x + rnd.between(60, 160); x < p.x + p.w - 40; x += rnd.between(240, 520)) {
                if (Math.abs(x - 1600) < 120 && p.y === 850 || room.doors.some(d => Math.abs(d.x - x) < 110 && Math.abs(d.y - p.y) < 60) || room.station && Math.abs(room.station.x - x) < 120 && Math.abs(room.station.y - p.y) < 40) continue;
                const roll = rnd.frac();
                if (roll < 0.62) {
                    const w = rnd.between(80, 125);
                    const coral = scene.add.image(x, p.y + 4, 'prop-3').setDisplaySize(w, w * 0.72).setOrigin(0.5, 1).setDepth(7).setFlipX(rnd.frac() > 0.5).setTint(rnd.pick(theme.coral));
                    scene.tweens.add({ targets: coral, scaleX: coral.scaleX * 1.04, duration: rnd.between(1800, 3000), yoyo: true, repeat: -1, ease: 'Sine.InOut' });
                    scene.add.image(x, p.y - 20, 'glow').setDisplaySize(150, 120).setTint(theme.accent).setAlpha(0.22).setBlendMode(Phaser.BlendModes.ADD).setDepth(8);
                } else if (roll < 0.85 && p.w >= room.width) {
                    scene.add.image(x, p.y + 2, 'prop-2').setDisplaySize(rnd.between(110, 145), rnd.between(95, 120)).setOrigin(0.5, 1).setDepth(8).setFlipX(rnd.frac() > 0.5).setTint(theme.tint);
                } else {
                    scene.add.image(x, p.y + 3, 'prop-6').setDisplaySize(44, 56).setOrigin(0.5, 1).setDepth(7).setAngle(rnd.between(-20, 20)).setTint(theme.tint).setAlpha(0.9);
                }
            }
        }
        for (const data of room.obstacles ?? []) {
            if (progress.opened.includes(`break:${data.id}`)) continue;
            const sprite = scene.physics.add.staticImage(data.x + data.w / 2, data.y + data.h / 2, 'coral-barrier').setDisplaySize(data.w, data.h).setDepth(11).refreshBody();
            this.platforms.add(sprite); this.geometry.push(data);
            const label = plaque(scene, data.x + data.w / 2, data.y - 28, 'Calcified · Claw Required', 'sealed', 12);
            this.breakables.push({ data, sprite, label, hits: 2 });
        }
        for (const h of room.heat ?? []) {
            scene.add.tileSprite(h.x + h.w / 2, h.y + h.h, h.w, 65, 'lava').setOrigin(0.5, 1).setDepth(9).setTileScale(0.5);
            for (let x = h.x + 80; x < h.x + h.w; x += 260) {
                scene.add.image(x, 850, 'volcanic-vent').setOrigin(0.5, 1).setDisplaySize(110, 160).setDepth(8);
                const glow = scene.add.image(x, 765, 'glow').setTint(0xff6b2f).setDisplaySize(360, 300).setAlpha(0.7).setBlendMode(Phaser.BlendModes.ADD).setDepth(10);
                scene.tweens.add({ targets: glow, alpha: 0.35, duration: 700 + x % 300, yoyo: true, repeat: -1 });
                scene.add.particles(x, 700, 'spark', { lifespan: 1600, speedY: { min: -100, max: -45 }, speedX: { min: -25, max: 25 }, scale: { start: 0.3, end: 0 }, alpha: { start: 0.65, end: 0 }, tint: [0xff6a30, 0xffca7e], frequency: 160 }).setDepth(17);
            }
            plaque(scene, h.x + h.w / 2, h.y - 28, 'Extreme Heat · Carapace Only', 'heat', 11);
        }
        for (const a of room.anchors) {
            decor.lineStyle(2, 0x778f85, 0.65).lineBetween(a.x, 0, a.x, a.y - 14);
            scene.add.image(a.x, a.y, 'anchor-ring').setDisplaySize(42, 50).setDepth(12);
            const glow = scene.add.image(a.x, a.y, 'glow').setDisplaySize(120, 120).setAlpha(0.4).setDepth(11);
            scene.tweens.add({ targets: glow, alpha: 0.75, scale: glow.scale * 1.2, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        }
        for (const air of room.air) {
            const pocket = scene.add.rectangle(air.x + air.w / 2, 440, air.w, 800, 0x93b2a4, 0.06).setDepth(-4);
            scene.tweens.add({ targets: pocket, alpha: 0.6, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
            scene.add.image(air.x + air.w / 2, 30, 'fog').setDisplaySize(air.w, 220).setFlipY(true).setTint(0xd8f0e0).setAlpha(0.14).setDepth(-4);
            plaque(scene, air.x + air.w / 2, 755, 'Air Pocket', 'air', 9);
        }
        for (const d of room.doors) {
            const unlocked = meetsRequirement(d.requires, progress);
            const image = scene.add.image(d.x, d.y + 12, d.hidden ? 'prop-6' : 'prop-5').setOrigin(0.5, 1).setDisplaySize(d.hidden ? 65 : 96, d.hidden ? 44 : 146).setDepth(9).setAlpha(d.hidden ? 0.5 : 0.95);
            if (!unlocked) image.setTint(0xae8585);
            else if (!d.hidden) {
                const glow = scene.add.image(d.x, d.y - 60, 'glow').setDisplaySize(170, 210).setTint(d.shortcut ? COLORS.gold : theme.accent).setAlpha(0.18).setBlendMode(Phaser.BlendModes.ADD).setDepth(8);
                scene.tweens.add({ targets: glow, alpha: 0.32, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
            }
            const label = d.hidden ? undefined : plaque(scene, d.x, d.y - 160, `${d.shortcut ? '↗ ' : ''}${d.label.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase())}${unlocked ? '' : '  ◈'}`, unlocked ? 'bone' : 'sealed', 10);
            this.doors.push({ data: d, image, label });
        }
        if (room.station) {
            const s = room.station;
            scene.add.image(s.x, s.y, 'creature-7').setOrigin(0.5, 1).setDisplaySize(105, 132).setDepth(10);
            const glow = scene.add.image(s.x, s.y - 65, 'glow').setDisplaySize(240, 240).setAlpha(0.55).setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
            scene.tweens.add({ targets: glow, alpha: 0.85, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
            scene.add.particles(s.x - 12, s.y - 110, 'bubble', { lifespan: 2400, speedY: { min: -60, max: -30 }, speedX: { min: -8, max: 8 }, scale: { min: 0.3, max: 0.7 }, alpha: { start: 0.8, end: 0 }, frequency: 420 }).setDepth(11);
            plaque(scene, s.x, s.y - 166, 'O₂ Station · Refill & Save', 'air', 10);
        }
        for (const p of room.pickups) {
            if (progress.collected.includes(p.id)) continue;
            const gold = p.kind === 'harpoon' || p.kind === 'key';
            const halo = scene.add.image(p.x, p.y, 'glow').setDisplaySize(220, 220).setTint(gold ? 0xefcc85 : p.kind === 'health' ? 0xff9fb0 : 0xe8a5cb).setAlpha(0.8).setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
            const sprite = scene.add.image(p.x, p.y, p.kind === 'key' ? 'key' : p.kind === 'harpoon' ? 'harpoon-icon' : p.kind === 'health' ? 'pearl' : 'molt-icon').setDepth(12);
            scene.tweens.add({ targets: [sprite, halo], y: p.y - 12, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
            scene.tweens.add({ targets: halo, alpha: 0.45, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
            const label = plaque(scene, p.x, p.y + 50, p.kind === 'harpoon' ? 'Salvage Harpoon' : p.kind === 'key' ? 'Chapel Key' : p.kind === 'health' ? 'Vital Pearl' : 'The Molt', 'relic', 12);
            this.pickups.push({ data: p, sprite, halo, label });
        }
        this.record = scene.add.image(1600, 852, 'field-record').setOrigin(0.5, 1).setDisplaySize(52, 40).setDepth(11);
        const recordGlow = scene.add.image(1600, 826, 'glow').setDisplaySize(110, 110).setTint(COLORS.gold).setAlpha(0.2).setBlendMode(Phaser.BlendModes.ADD).setDepth(10);
        scene.tweens.add({ targets: recordGlow, alpha: 0.42, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        const marker = scene.add.text(1600, 770, '✦', serifStyle(18, '#f0d49f')).setOrigin(0.5).setDepth(11).setShadow(0, 0, '#e1bb7a', 8);
        scene.tweens.add({ targets: marker, y: 760, alpha: 0.55, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        if (theme.warning) for (let x = 400; x < room.width; x += 900) {
            const light = scene.add.image(x, 120, 'softlight').setDisplaySize(160, 160).setTint(0xff4a3a).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.1).setDepth(-2);
            this.warnings.push(light);
            scene.tweens.add({ targets: light, alpha: 0.45, duration: 700, yoyo: true, repeat: -1, ease: 'Quad.InOut', delay: x % 500 });
        }
        // Drifting bubbles and marine snow fill the water column.
        scene.add.particles(0, 0, 'bubble', {
            x: { min: 0, max: room.width }, y: { min: 320, max: 1000 },
            lifespan: 6000, speedY: { min: -55, max: -25 }, speedX: { min: -6, max: 6 }, scale: { min: 0.25, max: 0.75 }, alpha: { start: 0.55, end: 0 }, frequency: 160, quantity: 1
        }).setDepth(19);
        scene.add.image(GAME_WIDTH / 2, GAME_HEIGHT, 'fog').setOrigin(0.5, 1).setDisplaySize(GAME_WIDTH, 240).setScrollFactor(0).setTint(theme.fog).setAlpha(0.55).setDepth(28);
        this.atmosphere = new Atmosphere(scene, room, theme, room.heat?.length ? [wreck, ribs, ...girders] : []);
        const key = 'darkness'; if (scene.textures.exists(key)) scene.textures.remove(key);
        this.darkness = scene.textures.createCanvas(key, 640, 360)!;
        this.overlay = scene.add.image(0, 0, key).setOrigin(0).setDisplaySize(GAME_WIDTH, GAME_HEIGHT).setScrollFactor(0).setDepth(30);
        // Foreground silhouettes pass in front of the action for depth, kept to the room edges and ceiling.
        for (let x = rnd.between(300, 700); x < room.width + 400; x += rnd.between(900, 1400)) {
            // Out of focus, like a lens pulled to the diver's plane.
            scene.add.image(x, -20, softTexture(scene, 'prop-7', 5)).setOrigin(0.5, 0).setScrollFactor(1.25, 1).setDisplaySize(rnd.between(60, 90), rnd.between(200, 330)).setTint(0x03080c).setAlpha(0.92).setDepth(29);
        }
    }
    breakObstacle(id: string): void {
        const i = this.breakables.findIndex(b => b.data.id === id); if (i < 0) return;
        const b = this.breakables[i], g = this.geometry.indexOf(b.data);
        if (g >= 0) this.geometry.splice(g, 1);
        this.platforms.remove(b.sprite, true, true); b.label.destroy(); this.breakables.splice(i, 1);
    }
    /** `dread` (0 to 1) rises as oxygen runs out: the helmet lamp starts to fail. */
    update(dt: number, p: Player, aimX: number, aimY: number, aiming: boolean, lights: { x: number; y: number; r?: number }[] = [], dread = 0): void {
        this.tick++; const camera = this.scene.cameras.main;
        const angle = aiming ? Math.atan2(aimY, aimX) : p.facing > 0 ? -0.15 : Math.PI + 0.15;
        const power = dread > 0 ? this.headlamp.update(dt, dread) : 1;
        for (const l of this.lanterns) {
            const level = l.flicker.update(dt);
            l.halo.setVisible(level > 0.5); l.lamp.setTint(level > 0.5 ? 0xffffff : 0x4a5258);
        }
        this.atmosphere.update(dt, camera, { x: p.centerX - camera.scrollX, y: p.centerY - 28 - camera.scrollY, angle, reach: 540, spread: 0.37, halo: 200, power });
        if (this.tick % 2) return;
        const ctx = this.darkness.context;
        ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(0, 0, 640, 360);
        ctx.fillStyle = `rgba(0,6,15,${roomDarkness(this.theme)})`; ctx.fillRect(0, 0, 640, 360);
        // Vignette deepens the screen edges.
        const vignette = ctx.createRadialGradient(320, 180, 140, 320, 180, 380);
        vignette.addColorStop(0, 'rgba(0,4,10,0)'); vignette.addColorStop(1, 'rgba(0,4,10,0.55)');
        ctx.fillStyle = vignette; ctx.fillRect(0, 0, 640, 360);
        const x = (p.centerX - camera.scrollX) / 2, y = (p.centerY - 28 - camera.scrollY) / 2;
        ctx.globalCompositeOperation = 'destination-out';
        const halo = ctx.createRadialGradient(x, y, 10, x, y, 120);
        halo.addColorStop(0, `rgba(255,255,255,${0.92 * Math.max(power, 0.45)})`); halo.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = halo; ctx.fillRect(x - 120, y - 120, 240, 240);
        const cone = ctx.createRadialGradient(x, y, 0, x, y, 270);
        cone.addColorStop(0, `rgba(255,255,255,${0.9 * power})`); cone.addColorStop(0.7, `rgba(255,255,255,${0.6 * power})`); cone.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = cone; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 270, angle - 0.37, angle + 0.37); ctx.closePath(); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        const warmth = ctx.createRadialGradient(x, y, 0, x, y, 270);
        warmth.addColorStop(0, 'rgba(239,204,131,0.1)'); warmth.addColorStop(1, 'rgba(239,204,131,0)');
        ctx.fillStyle = warmth; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 270, angle - 0.37, angle + 0.37); ctx.closePath(); ctx.fill();
        ctx.globalCompositeOperation = 'destination-out';
        // Bioluminescent creatures, lanterns, doors, pickups and stations retain pools of light.
        const points: { x: number; y: number; r?: number }[] = [...this.room.anchors, ...lights, ...this.pickups.filter(q => q.sprite.active).map(q => ({ x: q.data.x, y: q.data.y, r: 90 })), { x: 1600, y: 820, r: 45 }];
        if (this.room.station) points.push({ x: this.room.station.x, y: this.room.station.y - 65, r: 85 });
        for (const d of this.room.doors) if (!d.hidden) points.push({ x: d.x, y: d.y - 60, r: 70 });
        for (const l of this.lanterns) if (l.flicker.level > 0.5) points.push({ x: l.x, y: l.y, r: 95 });
        for (const point of points) {
            const lx = (point.x - camera.scrollX) / 2, ly = (point.y - camera.scrollY) / 2, r = point.r ?? 65;
            if (lx < -r || lx > 640 + r || ly < -r || ly > 360 + r) continue;
            const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, r); glow.addColorStop(0, 'rgba(255,255,255,0.65)'); glow.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = glow; ctx.fillRect(lx - r, ly - r, r * 2, r * 2);
        }
        this.darkness.refresh();
    }
    destroy(): void { this.atmosphere.destroy(); this.overlay.destroy(); this.record.destroy(); this.platforms.clear(true, true); this.platforms.destroy(); }
}
