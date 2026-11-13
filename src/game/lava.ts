import * as Phaser from 'phaser';
import type { Rect } from './world';

/** World-space molten seams, with dark banks and independently advected surface ribbons. */
export class LavaField {
    private bed: Phaser.GameObjects.Graphics;
    private light: Phaser.GameObjects.Graphics;
    private time = 0;
    constructor(scene: Phaser.Scene, readonly areas: readonly Rect[]) {
        this.bed = scene.add.graphics().setDepth(9.1);
        this.light = scene.add.graphics().setDepth(9.2).setBlendMode(Phaser.BlendModes.ADD);
    }
    update(dt: number, left: number, right: number): void {
        this.time += dt; this.bed.clear(); this.light.clear();
        for (const h of this.areas) {
            if (h.x > right + 60 || h.x + h.w < left - 60) continue;
            const t = this.time + h.x * 0.017, floor = h.y + h.h;
            const surface = (x: number) => floor - 31 + Math.sin(x * 0.038 + t * 1.3) * 4 + Math.sin(x * 0.079 - t * 0.8) * 2;
            // Ragged, low-contrast banks feather the seam into the surrounding iron.
            for (let bank = 3; bank >= 0; bank--) {
                const points = Array.from({ length: 41 }, (_, i) => {
                    const u = i / 40, x = h.x - bank * 7 + u * (h.w + bank * 14), edge = Math.sin(Math.PI * u);
                    return { x, y: surface(x) + 16 * (1 - edge) - bank * 5 + Math.sin(x * 0.13) * bank };
                });
                points.push({ x: h.x + h.w + bank * 7, y: floor + 4 }, { x: h.x - bank * 7, y: floor + 4 });
                this.bed.fillStyle(bank ? 0x261e20 : 0x79312a, bank ? 0.15 + (3 - bank) * 0.12 : 0.9).fillPoints(points as Phaser.Math.Vector2[], true);
            }
            for (let ribbon = 0; ribbon < 5; ribbon++) {
                const points = Array.from({ length: 45 }, (_, i) => {
                    const u = i / 44, x = h.x + 5 + u * (h.w - 10), edge = Math.pow(Math.sin(Math.PI * u), 0.5);
                    return { x, y: surface(x) + 5 + ribbon * 5 + Math.sin(x * 0.048 - t * 1.8 + ribbon * 1.2) * 3 * edge };
                });
                for (let i = 1; i < points.length; i++) {
                    const edge = Math.pow(Math.sin(Math.PI * (i - 0.5) / (points.length - 1)), 0.65);
                    this.light.lineStyle((9 - ribbon) * edge, ribbon % 2 ? 0xd65428 : 0xffa44d, (0.3 + Math.sin(t + ribbon) * 0.06) * edge)
                        .lineBetween(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
                }
            }
            // Small dark crusts drift separately over the hot currents, breaking uniform bands.
            const count = Math.ceil(h.w / 32);
            for (let i = 0; i < count; i++) {
                const u = ((i * 37 + t * (4 + i % 3)) % (h.w - 20) + 10) / h.w;
                const x = h.x + u * h.w, y = surface(x) + 8 + i % 3 * 7, size = 5 + i % 4 * 2;
                this.bed.fillStyle(0x272125, 0.6).fillTriangle(x - size, y, x, y - 3, x + size * 0.8, y + 3);
                this.light.lineStyle(1, 0xffc474, 0.35).lineBetween(x - size, y + 1, x, y + 4);
            }
        }
    }
    destroy(): void { this.bed.destroy(); this.light.destroy(); }
}
