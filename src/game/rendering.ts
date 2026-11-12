import * as Phaser from 'phaser';
import { COLORS, GAME_WIDTH, GAME_HEIGHT } from './constants';
import { meetsRequirement, type Room, type Door, type Pickup } from './world';
import type { Progress } from './model';
import type { Player } from './systems/Player';

export const textStyle = (size = 16, color = '#b9ccca'): Phaser.Types.GameObjects.Text.TextStyle => ({ fontFamily: 'Arial, sans-serif', fontSize: `${size}px`, color, resolution: 2 });
export const serifStyle = (size = 32, color = '#e5dac0'): Phaser.Types.GameObjects.Text.TextStyle => ({ fontFamily: 'Georgia, serif', fontSize: `${size}px`, color, resolution: 2 });

export function makeTextures(scene: Phaser.Scene): void {
    if (!scene.textures.exists('spark')) {
        const g = scene.make.graphics({ x: 0, y: 0 });
        g.fillStyle(0xc7e9ed).fillCircle(8, 8, 5).fillStyle(0xffffff).fillCircle(7, 6, 2).generateTexture('spark', 16, 16); g.destroy();
    }
    if (!scene.textures.exists('glow')) {
        const canvas = scene.textures.createCanvas('glow', 128, 128)!;
        const ctx = canvas.context; const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        gradient.addColorStop(0, 'rgba(165,243,235,0.55)'); gradient.addColorStop(0.3, 'rgba(90,187,190,0.2)'); gradient.addColorStop(1, 'rgba(38,118,141,0)');
        ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128); canvas.refresh();
    }
}
export interface RenderedPickup { data: Pickup; sprite: Phaser.GameObjects.Image; halo: Phaser.GameObjects.Image }
export class RoomView {
    doors: { data: Door; image: Phaser.GameObjects.Image; label?: Phaser.GameObjects.Text }[] = [];
    pickups: RenderedPickup[] = [];
    platforms: Phaser.Physics.Arcade.StaticGroup;
    private snow: { x: number; y: number; speed: number; size: number }[] = [];
    private snowGraphics: Phaser.GameObjects.Graphics;
    private darkness: Phaser.Textures.CanvasTexture;
    private overlay: Phaser.GameObjects.Image;
    private tick = 0;
    constructor(private scene: Phaser.Scene, readonly room: Room, progress: Progress) {
        makeTextures(scene);
        scene.cameras.main.setBackgroundColor('#07131d');
        const background = scene.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'wreck').setDisplaySize(1510, 850).setScrollFactor(0.055).setDepth(-20);
        background.setTint(room.color === 0x14343d ? 0xc3dfdc : room.color === 0x322747 ? 0xb3a3d3 : 0xc5bacf);
        scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, room.color, 0.1).setScrollFactor(0).setDepth(-19);
        const decor = scene.add.graphics().setDepth(-5);
        for (let x = 190; x < room.width; x += 650) {
            if (scene.textures.exists('prop-1')) scene.add.image(x, 330, 'prop-1').setDisplaySize(100, 800).setAlpha(0.5).setDepth(-8);
            decor.lineStyle(5, 0x1a333b, 0.7).lineBetween(x + 100, 0, x + 100, 220);
            decor.lineStyle(1, 0x71837b, 0.45).lineBetween(x + 103, 0, x + 103, 220);
            scene.add.image(x + 100, 220, 'prop-4').setDisplaySize(52, 88).setAlpha(0.8).setDepth(-3);
            scene.add.image(x + 100, 220, 'glow').setDisplaySize(220, 220).setTint(0xe4bf77).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.2).setDepth(-2);
        }
        this.platforms = scene.physics.add.staticGroup();
        for (const p of room.platforms) {
            const collision = scene.add.rectangle(p.x + p.w / 2, p.y + p.h / 2, p.w, p.h, 0x0c1b26).setDepth(3);
            scene.physics.add.existing(collision, true); this.platforms.add(collision);
            if (scene.textures.exists('prop-0')) scene.add.tileSprite(p.x + p.w / 2, p.y + 16, p.w, 45, 'prop-0').setDepth(5).setTileScale(0.45);
            decor.fillStyle(0x142831).fillRect(p.x, p.y + 26, p.w, Math.min(p.h, 90));
            decor.lineStyle(2, 0x849082, 0.7).lineBetween(p.x, p.y, p.x + p.w, p.y);
            if (p.h < 100) for (let x = p.x + 30; x < p.x + p.w; x += 160) {
                decor.lineStyle(4, 0x1a3038).lineBetween(x, p.y + 20, x, p.y + 105);
                decor.lineStyle(2, 0x344a4a).lineBetween(x, p.y + 20, x + 45, p.y + 65);
            }
            for (let x = p.x + 105; x < p.x + p.w; x += 370) {
                scene.add.image(x, p.y - 17, 'prop-3').setDisplaySize(105, 74).setOrigin(0.5, 1).setAlpha(0.9).setDepth(7);
                scene.add.image(x, p.y - 20, 'glow').setDisplaySize(150, 120).setTint(0xb98be8).setAlpha(0.27).setBlendMode(Phaser.BlendModes.ADD).setDepth(8);
            }
        }
        // A few foreground pieces establish scale without obscuring traversable edges.
        for (let x = 780; x < room.width; x += 1050) scene.add.image(x, 849, 'prop-2').setDisplaySize(130, 112).setOrigin(0.5, 1).setDepth(8);
        for (const a of room.anchors) {
            decor.lineStyle(2, 0x778f85, 0.65).lineBetween(a.x, 0, a.x, a.y - 14);
            scene.add.circle(a.x, a.y, 14, 0x102731).setStrokeStyle(3, COLORS.gold).setDepth(12);
            scene.add.circle(a.x, a.y, 5, COLORS.teal).setDepth(13);
            scene.add.image(a.x, a.y, 'glow').setDisplaySize(120, 120).setAlpha(0.4).setDepth(11);
        }
        for (const air of room.air) {
            scene.add.rectangle(air.x + air.w / 2, 440, air.w, 800, 0x93b2a4, 0.045).setDepth(-4);
            scene.add.text(air.x + air.w / 2, 755, 'A I R   P O C K E T', textStyle(13, '#9dbbab')).setOrigin(0.5).setDepth(9);
        }
        for (const d of room.doors) {
            const unlocked = meetsRequirement(d.requires, progress);
            const image = scene.add.image(d.x, d.y + 12, d.hidden ? 'prop-6' : 'prop-5').setOrigin(0.5, 1).setDisplaySize(d.hidden ? 65 : 96, d.hidden ? 44 : 146).setDepth(9).setAlpha(d.hidden ? 0.45 : 0.9);
            if (!unlocked) image.setTint(0xae8585);
            const label = d.hidden ? undefined : scene.add.text(d.x, d.y - 151, `${d.shortcut ? '↗ ' : ''}${d.label}${unlocked ? '' : '  ◈'}`, textStyle(11, unlocked ? '#c5c4ac' : '#c18e8e')).setOrigin(0.5).setDepth(10);
            this.doors.push({ data: d, image, label });
        }
        if (room.station) {
            const s = room.station;
            scene.add.image(s.x, s.y, 'creature-7').setOrigin(0.5, 1).setDisplaySize(105, 132).setDepth(10);
            scene.add.image(s.x, s.y - 65, 'glow').setDisplaySize(240, 240).setAlpha(0.55).setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
            scene.add.text(s.x, s.y - 160, 'O₂ / REFILL & SAVE', textStyle(11, '#a4d2c6')).setOrigin(0.5).setDepth(10);
        }
        for (const p of room.pickups) {
            if (progress.collected.includes(p.id)) continue;
            const halo = scene.add.image(p.x, p.y, 'glow').setDisplaySize(220, 220).setTint(p.kind === 'harpoon' || p.kind === 'key' ? 0xefcc85 : 0xe8a5cb).setAlpha(0.8).setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
            const sprite = scene.add.image(p.x, p.y, p.kind === 'key' ? 'key' : p.kind === 'harpoon' ? 'harpoon-icon' : 'molt-icon').setDepth(12);
            scene.tweens.add({ targets: [sprite, halo], y: p.y - 12, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
            scene.add.text(p.x, p.y + 43, p.kind === 'harpoon' ? 'SALVAGE HARPOON' : p.kind === 'key' ? 'CHAPEL KEY' : 'THE MOLT', textStyle(11, '#ddc3ad')).setOrigin(0.5).setDepth(12);
            this.pickups.push({ data: p, sprite, halo });
        }
        scene.add.image(1600, 833, 'prop-6').setDisplaySize(40, 32).setDepth(11);
        scene.add.text(1600, 785, 'FIELD RECORD', textStyle(10, '#9ba8a6')).setOrigin(0.5).setDepth(10);
        this.snowGraphics = scene.add.graphics().setScrollFactor(0).setDepth(32);
        for (let i = 0; i < 90; i++) this.snow.push({ x: Phaser.Math.Between(0, GAME_WIDTH), y: Phaser.Math.Between(0, GAME_HEIGHT), speed: Phaser.Math.Between(6, 22), size: i % 7 === 0 ? 2 : 1 });
        const key = 'darkness'; if (scene.textures.exists(key)) scene.textures.remove(key);
        this.darkness = scene.textures.createCanvas(key, 640, 360)!;
        this.overlay = scene.add.image(0, 0, key).setOrigin(0).setDisplaySize(GAME_WIDTH, GAME_HEIGHT).setScrollFactor(0).setDepth(30);
        // Darkness already provides the edge falloff; avoid filtering the entire world framebuffer.
    }
    update(dt: number, p: Player, aimX: number, aimY: number, aiming: boolean, lights: { x: number; y: number }[] = []): void {
        this.tick++; const camera = this.scene.cameras.main;
        this.snowGraphics.clear();
        for (const s of this.snow) {
            s.y += dt * s.speed; s.x += Math.sin((this.tick + s.y) * 0.006) * dt * 5;
            if (s.y > GAME_HEIGHT) s.y = -2;
            this.snowGraphics.fillStyle(0xa3d8d7, s.size === 2 ? 0.25 : 0.13).fillRect(s.x, s.y, s.size, s.size);
        }
        if (this.tick % 2) return;
        const ctx = this.darkness.context;
        ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(0, 0, 640, 360);
        ctx.fillStyle = this.room.id === 'angler' ? 'rgba(0,5,14,0.68)' : 'rgba(0,6,15,0.46)'; ctx.fillRect(0, 0, 640, 360);
        const x = (p.centerX - camera.scrollX) / 2, y = (p.centerY - 28 - camera.scrollY) / 2;
        ctx.globalCompositeOperation = 'destination-out';
        const halo = ctx.createRadialGradient(x, y, 10, x, y, 115);
        halo.addColorStop(0, 'rgba(255,255,255,0.92)'); halo.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = halo; ctx.fillRect(x - 115, y - 115, 230, 230);
        const angle = aiming ? Math.atan2(aimY, aimX) : p.facing > 0 ? -0.15 : Math.PI + 0.15;
        const cone = ctx.createRadialGradient(x, y, 0, x, y, 260);
        cone.addColorStop(0, 'rgba(255,255,255,0.9)'); cone.addColorStop(0.7, 'rgba(255,255,255,0.6)'); cone.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = cone; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 260, angle - 0.37, angle + 0.37); ctx.closePath(); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        const warmth = ctx.createRadialGradient(x, y, 0, x, y, 260);
        warmth.addColorStop(0, 'rgba(239,204,131,0.09)'); warmth.addColorStop(1, 'rgba(239,204,131,0)');
        ctx.fillStyle = warmth; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 260, angle - 0.37, angle + 0.37); ctx.closePath(); ctx.fill();
        ctx.globalCompositeOperation = 'destination-out';
        // Bioluminescent creatures and stations retain a small pool of light.
        for (const point of [...this.room.anchors, ...lights, ...(this.room.station ? [{ x: this.room.station.x, y: this.room.station.y - 65 }] : [])]) {
            const lx = (point.x - camera.scrollX) / 2, ly = (point.y - camera.scrollY) / 2;
            const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, 65); glow.addColorStop(0, 'rgba(255,255,255,0.65)'); glow.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = glow; ctx.fillRect(lx - 65, ly - 65, 130, 130);
        }
        this.darkness.refresh();
    }
    destroy(): void { this.overlay.destroy(); this.platforms.clear(true, true); this.platforms.destroy(); }
}
