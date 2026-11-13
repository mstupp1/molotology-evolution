import * as Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from './constants';
import type { Room } from './world';
import type { RoomTheme } from './rendering';
import { beamIntensity, causticStrength, grainStrength, type Beam } from './lighting';

/**
 * 2.5D atmosphere: layered marine snow lit by the helmet beam, pixel caustics,
 * film grain, and heat haze behind volcanic vents. Everything here sits on
 * background planes or as a faint veil, so the playable layer stays crisp.
 */

interface Mote { x: number; y: number; speed: number; size: number; phase: number }
interface SnowLayer { graphics: Phaser.GameObjects.Graphics; motes: Mote[]; parallax: number; color: number; alpha: number; lit: number; round: boolean }

const WRAP_PAD = 40;
const wrap = (v: number, size: number): number => ((v % size) + size) % size;

/** A seamless tile of Voronoi seams, the bright web that light makes through rippling water. */
function makeCausticTexture(scene: Phaser.Scene, key: string): void {
    if (scene.textures.exists(key)) return;
    const size = 128, rnd = new Phaser.Math.RandomDataGenerator([key]);
    // Each cell gets its own brightness so the web breaks up instead of reading as a net.
    const points = Array.from({ length: 22 }, () => [rnd.between(0, size - 1), rnd.between(0, size - 1), rnd.realInRange(0.15, 1)]);
    const canvas = scene.textures.createCanvas(key, size, size)!;
    const image = canvas.context.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        let f1 = 1e9, f2 = 1e9, glow = 0;
        for (const [px, py, b] of points) {
            const dx = Math.min(Math.abs(x - px), size - Math.abs(x - px)), dy = Math.min(Math.abs(y - py), size - Math.abs(y - py));
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < f1) { f2 = f1; f1 = d; glow = b; } else if (d < f2) f2 = d;
        }
        const seam = Math.max(0, 1 - (f2 - f1) / 3) * glow;
        const i = (y * size + x) * 4;
        image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
        image.data[i + 3] = Math.round(seam * seam * 255);
    }
    canvas.context.putImageData(image, 0, 0); canvas.refresh();
}

/** A few frames of chunky monochrome grain. */
function makeGrainTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists('grain')) return;
    const size = 256, canvas = scene.textures.createCanvas('grain', size, size)!;
    const ctx = canvas.context, rnd = new Phaser.Math.RandomDataGenerator(['grain']);
    for (let y = 0; y < size; y += 2) for (let x = 0; x < size; x += 2) {
        const v = rnd.frac();
        if (v < 0.42) continue;
        const light = rnd.frac() > 0.45;
        ctx.fillStyle = light ? `rgba(220,235,230,${(v - 0.42) * 1.2})` : `rgba(0,0,0,${(v - 0.42) * 1.6})`;
        ctx.fillRect(x, y, 2, 2);
    }
    canvas.refresh();
}

export class Atmosphere {
    private layers: SnowLayer[] = [];
    private caustics: Phaser.GameObjects.TileSprite[] = [];
    private grain: Phaser.GameObjects.TileSprite;
    private heat?: Phaser.GameObjects.NoiseSimplex3D;
    private time = 0;
    private frame = 0;
    private readonly heatKey: string;
    readonly webgl: boolean;

    constructor(private scene: Phaser.Scene, room: Room, theme: RoomTheme, heatTargets: (Phaser.GameObjects.Image | Phaser.GameObjects.TileSprite)[] = []) {
        this.webgl = scene.sys.renderer.type === Phaser.WEBGL;
        this.heatKey = `heat-${room.id}`;
        // Three planes of marine snow: far specks drift behind the wreck, mid flakes
        // share the diver's plane, and a few big soft flakes slide past the lens.
        this.addSnow(-17, 140, 0.35, [4, 10], 1, 0x8fc4c8, 0.2, 0.2, false);
        this.addSnow(32, 160, 1, [8, 22], 1, 0xa3d8d7, 0.14, 0.9, false);
        this.addSnow(33, 16, 1.5, [16, 30], 3, 0xc8ecec, 0.05, 0.32, true);
        const strength = causticStrength(theme);
        if (strength > 0) {
            // Two drifting sheets of seams cross each other so the pattern never visibly repeats.
            for (const [key, scale, alpha] of [['caustic-a', 3, 1], ['caustic-b', 4, 0.6]] as const) {
                makeCausticTexture(scene, key);
                const sheet = scene.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, key).setOrigin(0).setScrollFactor(0).setDepth(17)
                    .setTileScale(scale).setBlendMode(Phaser.BlendModes.ADD).setTint(theme.rayColor)
                    // Light enters from above: strongest near the ceiling, gone by the deck.
                    .setAlpha(strength * alpha, strength * alpha, 0, 0);
                this.caustics.push(sheet);
            }
        }
        makeGrainTexture(scene);
        this.grain = scene.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'grain').setOrigin(0).setScrollFactor(0).setDepth(34).setAlpha(grainStrength(theme));
        if (this.webgl && room.heat?.length && heatTargets.length) {
            if (scene.textures.exists(this.heatKey)) scene.textures.remove(this.heatKey);
            this.heat = scene.add.noisesimplex3d({ noiseCells: [10, 6, 4], noiseIterations: 2, noiseSeed: [3, 11, 5] }, 0, 0, 256, 144)
                .setScrollFactor(0).setOrigin(0);
            this.heat.setRenderToTexture(this.heatKey);
            for (const target of heatTargets) {
                target.enableFilters();
                target.filters!.internal.addDisplacement(this.heatKey, 0.005, 0.012);
            }
        }
    }

    private addSnow(depth: number, count: number, parallax: number, speed: [number, number], size: number, color: number, alpha: number, lit: number, round: boolean): void {
        const graphics = this.scene.add.graphics().setScrollFactor(0).setDepth(depth);
        const motes: Mote[] = [];
        for (let i = 0; i < count; i++) motes.push({ x: Phaser.Math.Between(0, GAME_WIDTH + WRAP_PAD * 2), y: Phaser.Math.Between(0, GAME_HEIGHT + WRAP_PAD * 2), speed: Phaser.Math.Between(speed[0], speed[1]), size: size === 1 && i % 6 === 0 ? 2 : size + (round ? Phaser.Math.Between(0, 2) : 0), phase: Math.random() * 1000 });
        this.layers.push({ graphics, motes, parallax, color, alpha, lit, round });
    }

    /** Marine snow only drifts through water; air pockets and drained chambers stay clear. */
    dry: (x: number, y: number) => boolean = () => false;
    /** 0 to 1: how much of the view is underwater. Caustics fade with it. */
    wet = 1;
    update(dt: number, camera: Phaser.Cameras.Scene2D.Camera, beam: Beam): void {
        this.time += dt; this.frame++;
        const w = GAME_WIDTH + WRAP_PAD * 2, h = GAME_HEIGHT + WRAP_PAD * 2;
        for (const layer of this.layers) {
            const g = layer.graphics; g.clear();
            for (const m of layer.motes) {
                m.y += dt * m.speed;
                const sway = Math.sin((this.time * 1000 + m.phase + m.y) * 0.004) * 6 * layer.parallax;
                const sx = wrap(m.x - camera.scrollX * layer.parallax + sway, w) - WRAP_PAD;
                const sy = wrap(m.y - camera.scrollY * layer.parallax, h) - WRAP_PAD;
                if (layer.parallax >= 1 && this.dry(sx + camera.scrollX, sy + camera.scrollY)) continue;
                const light = beamIntensity(beam, sx, sy);
                const a = Math.min(0.9, layer.alpha + light * layer.lit);
                if (a < 0.02) continue;
                g.fillStyle(light > 0.2 ? 0xf6e6bd : layer.color, a);
                if (layer.round) g.fillCircle(sx, sy, m.size);
                else g.fillRect(Math.round(sx), Math.round(sy), m.size, m.size);
            }
        }
        // Caustics are anchored to the world with slight parallax and drift against each other.
        this.caustics.forEach((sheet, i) => {
            const dir = i ? -1 : 1;
            sheet.setTilePosition(camera.scrollX * 0.9 / sheet.tileScaleX + this.time * 4 * dir, camera.scrollY * 0.9 / sheet.tileScaleY + this.time * 2.5);
            sheet.setVisible(this.wet > 0.05);
            if (sheet.getData('alpha') === undefined) sheet.setData('alpha', sheet.alphaTopLeft);
            const a = Number(sheet.getData('alpha')) * this.wet; sheet.setAlpha(a, a, 0, 0);
        });
        // Grain jumps every other frame, snapped to its 2px cells.
        if (this.frame % 2 === 0) this.grain.setTilePosition(Phaser.Math.Between(0, 127) * 2, Phaser.Math.Between(0, 127) * 2);
        if (this.heat) this.heat.noiseOffset = [0, this.time * 0.35, this.time * 0.25];
    }

    destroy(): void {
        for (const layer of this.layers) layer.graphics.destroy();
        this.layers = [];
        for (const sheet of this.caustics) sheet.destroy();
        this.caustics = [];
        this.grain.destroy(); this.heat?.destroy();
        if (this.scene.textures.exists(this.heatKey)) this.scene.textures.remove(this.heatKey);
    }
}

/**
 * Bakes a softened copy of a texture once, so distant planes can sit out of focus
 * without paying for a blur filter every frame.
 */
export function softTexture(scene: Phaser.Scene, key: string, radius: number): string {
    const soft = `${key}-soft${radius}`;
    if (scene.textures.exists(soft) || !scene.textures.exists(key)) return scene.textures.exists(soft) ? soft : key;
    const source = scene.textures.get(key).getSourceImage() as CanvasImageSource & { width: number; height: number };
    const canvas = scene.textures.createCanvas(soft, source.width, source.height)!;
    const ctx = canvas.context;
    if (typeof ctx.filter === 'string') {
        ctx.filter = `blur(${radius}px)`;
        ctx.drawImage(source, 0, 0);
        ctx.filter = 'none';
    } else {
        // Older Safari has no canvas filter: shrink and grow back for a similar softness.
        const f = Math.max(2, radius), small = document.createElement('canvas');
        small.width = Math.ceil(source.width / f); small.height = Math.ceil(source.height / f);
        const sctx = small.getContext('2d')!; sctx.imageSmoothingEnabled = true; sctx.drawImage(source, 0, 0, small.width, small.height);
        ctx.imageSmoothingEnabled = true; ctx.drawImage(small, 0, 0, source.width, source.height);
    }
    canvas.refresh();
    return soft;
}

