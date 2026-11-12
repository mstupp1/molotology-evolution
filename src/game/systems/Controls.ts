import * as Phaser from 'phaser';

export interface InputFrame {
    x: number; y: number; jump: boolean; jumpHeld: boolean; drop: boolean; attack: boolean; dash: boolean;
    interact: boolean; aim: boolean; release: boolean; aimX: number; aimY: number; map: boolean; pause: boolean;
}
export class Controls {
    private keys: Record<string, Phaser.Input.Keyboard.Key>;
    private previous = new Set<number>();
    private wasAiming = false;
    private presses = new Set<string>();
    gamepad = false;
    private lastAim = new Phaser.Math.Vector2(1, 0);
    clearKeyboard(): void { this.presses.clear(); this.scene.input.keyboard?.resetKeys(); }
    constructor(private scene: Phaser.Scene) {
        this.keys = scene.input.keyboard!.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT,SPACE,SHIFT,J,K,E,M,TAB,ESC') as Record<string, Phaser.Input.Keyboard.Key>;
        // Keep a tap until the next simulation update, even if keyup arrives in the same frame.
        const handlers = Object.entries(this.keys).map(([name, key]) => {
            const handler = () => this.presses.add(name);
            key.on(Phaser.Input.Keyboard.Events.DOWN, handler);
            return { key, handler };
        });
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            for (const { key, handler } of handlers) key.off(Phaser.Input.Keyboard.Events.DOWN, handler);
        });
        scene.input.keyboard!.addCapture(['SPACE', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'TAB']);
        scene.input.mouse?.disableContextMenu();
    }
    poll(px: number, py: number): InputFrame {
        const down = (key: string) => this.keys[key].isDown;
        const pressed = (key: string) => { const found = this.presses.has(key); this.presses.delete(key); return found; };
        const pad = Array.from(navigator.getGamepads?.() ?? []).find(p => p?.connected) ?? null;
        this.gamepad = !!pad;
        const held = (n: number) => !!pad?.buttons[n]?.pressed;
        const edge = (n: number) => held(n) && !this.previous.has(n);
        let x = Number(down('D') || down('RIGHT')) - Number(down('A') || down('LEFT'));
        let y = Number(down('S') || down('DOWN')) - Number(down('W') || down('UP'));
        if (pad) {
            const sx = pad.axes[0] ?? 0, sy = pad.axes[1] ?? 0;
            if (Math.abs(sx) > 0.2) x = sx;
            if (Math.abs(sy) > 0.2) y = sy;
            x += Number(held(15)) - Number(held(14)); y += Number(held(13)) - Number(held(12));
        }
        const pointer = this.scene.input.activePointer;
        pointer.updateWorldPoint(this.scene.cameras.main);
        const aim = pointer.rightButtonDown() || held(7) || down('K');
        if (held(7) && pad) {
            const ax = pad.axes[2] ?? 0, ay = pad.axes[3] ?? 0;
            if (Math.hypot(ax, ay) > 0.25) this.lastAim.set(ax, ay).normalize();
        } else if (down('K')) {
            if (x || y) this.lastAim.set(x, y).normalize();
        } else if (pointer.rightButtonDown()) this.lastAim.set(pointer.worldX - px, pointer.worldY - py).normalize();
        const frame: InputFrame = {
            x: Phaser.Math.Clamp(x, -1, 1), y: Phaser.Math.Clamp(y, -1, 1),
            jump: pressed('SPACE') || edge(0), jumpHeld: down('SPACE') || held(0),
            drop: pressed('S') || pressed('DOWN') || edge(13),
            attack: pressed('J') || pointer.leftButtonDown() && !this.previous.has(99) || edge(2),
            dash: pressed('SHIFT') || edge(1), interact: pressed('E') || edge(3),
            aim, release: !aim && this.wasAiming, aimX: this.lastAim.x, aimY: this.lastAim.y,
            map: pressed('M') || pressed('TAB') || edge(8), pause: pressed('ESC') || edge(9)
        };
        this.previous.clear();
        pad?.buttons.forEach((b, i) => { if (b.pressed) this.previous.add(i); });
        if (pointer.leftButtonDown()) this.previous.add(99);
        this.wasAiming = aim;
        return frame;
    }
}
