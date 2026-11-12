import * as Phaser from 'phaser';
import { COLORS, EVOLUTION_NAMES, GameEvent, SceneKey, type GameSnapshot, type UiCommand } from '../constants';
import { ROOMS, ROOM_IDS, meetsRequirement, type RoomId } from '../world';
import { serifStyle, textStyle } from '../rendering';

export class Hud extends Phaser.Scene {
    private snapshot?: GameSnapshot;
    private bars: Phaser.GameObjects.Graphics;
    private minimap: Phaser.GameObjects.Graphics;
    private hp: Phaser.GameObjects.Text;
    private oxygen: Phaser.GameObjects.Text;
    private stage: Phaser.GameObjects.Text;
    private roomLabel: Phaser.GameObjects.Text;
    private objectiveLabel: Phaser.GameObjects.Text;
    private prompt: Phaser.GameObjects.Text;
    private equipment: Phaser.GameObjects.Text;
    private footer: Phaser.GameObjects.Text;
    private footerMap: Phaser.GameObjects.Text;
    private environment: Phaser.GameObjects.Text;
    private portrait: Phaser.GameObjects.Image;
    private bossLabel: Phaser.GameObjects.Text;
    private noticeTitle: Phaser.GameObjects.Text;
    private noticeBody: Phaser.GameObjects.Text;
    private noticeBackground: Phaser.GameObjects.Rectangle;
    private noticeTimer?: Phaser.Time.TimerEvent;
    private overlay?: Phaser.GameObjects.Container;
    private overlayMode?: 'map' | 'pause';
    private previousPad = new Set<number>();
    private menuButtons: Phaser.GameObjects.Text[] = [];
    private menuActions: (() => void)[] = [];
    private selected = 0;
    private onSnapshot = (data: GameSnapshot) => this.renderSnapshot(data);
    private onNotice = (notice: { title: string; body: string; duration: number }) => this.showNotice(notice);
    private onCommand = (command: UiCommand) => {
        if (command.type === 'pause' && this.snapshot?.paused) this.openOverlay(command.mode);
        else if (command.type === 'resume' || command.type === 'menu') this.closeOverlay();
    };
    constructor() { super(SceneKey.Hud); }
    create(): void {
        this.snapshot = undefined; this.overlay = undefined; this.overlayMode = undefined;
        this.previousPad.clear();
        this.add.rectangle(640, 53, 1280, 106, COLORS.ink, 0.95);
        this.add.rectangle(640, 106, 1280, 1, COLORS.gold, 0.25);
        this.add.text(32, 17, 'M O L O T O L O G Y  /  E V O L U T I O N', textStyle(10, '#859c9b'));
        this.portrait = this.add.image(62, 74, 'diver', 0).setDisplaySize(80, 80);
        if (this.game.renderer.type === Phaser.WEBGL) {
            this.portrait.enableFilters();
            this.portrait.filters?.internal.addGlow(0x83c9bd, 0.5, 0, 1, false, 0.1, 5);
        }
        this.hp = this.add.text(115, 40, 'VITALITY', textStyle(10, '#deaaa1'));
        this.oxygen = this.add.text(115, 69, 'OXYGEN', textStyle(10, '#9cceca'));
        this.stage = this.add.text(457, 45, EVOLUTION_NAMES[0], serifStyle(20));
        this.equipment = this.add.text(458, 75, 'DODGE  /  CUTLASS', textStyle(10, '#849d9f'));
        this.environment = this.add.text(810, 48, 'SUBMERGED', textStyle(10, '#94bab8'));
        this.add.text(1030, 13, 'SURVEY / [M] MAP', textStyle(9, '#8caaa9'));
        this.bars = this.add.graphics(); this.minimap = this.add.graphics();
        this.roomLabel = this.add.text(32, 128, '', serifStyle(25));
        this.objectiveLabel = this.add.text(33, 165, '', textStyle(12, '#99b9b9')).setWordWrapWidth(550);
        this.bossLabel = this.add.text(640, 137, '', serifStyle(17, '#e4b6af')).setOrigin(0.5).setVisible(false);
        this.prompt = this.add.text(640, 555, '', textStyle(15, '#f0dfb8')).setOrigin(0.5).setBackgroundColor('#091822dd').setPadding(14, 8);
        this.noticeBackground = this.add.rectangle(640, 621, 820, 90, 0x08151e, 0.91).setStrokeStyle(1, 0x41616a, 0.7).setVisible(false);
        this.noticeTitle = this.add.text(640, 591, '', textStyle(11, '#debe87')).setOrigin(0.5, 0);
        this.noticeBody = this.add.text(640, 613, '', textStyle(13, '#bacac6')).setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(780);
        this.add.rectangle(640, 703, 1280, 34, COLORS.ink, 0.9);
        this.footer = this.add.text(32, 697, 'A D  MOVE    SPACE  JUMP    J / CLICK  SLASH    SHIFT  DODGE / DASH    E  INTERACT', textStyle(10, '#8aa5a8'));
        const mapButton = this.footerMap = this.add.text(1080, 697, '[M] MAP   [ESC] PAUSE', textStyle(10, '#bfc4ad')).setInteractive({ useHandCursor: true });
        mapButton.on('pointerdown', () => this.emit({ type: 'pause', mode: 'map' }));
        const keyboard = this.input.keyboard!;
        const toggleMap = (event: KeyboardEvent) => { if (event.repeat) return; this.emit(this.overlayMode ? { type: 'resume' } : { type: 'pause', mode: 'map' }); };
        const togglePause = (event: KeyboardEvent) => { if (event.repeat) return; this.emit(this.overlayMode ? { type: 'resume' } : { type: 'pause', mode: 'pause' }); };
        const up = () => { if (this.overlayMode === 'pause') this.selectMenu(this.selected - 1); };
        const down = () => { if (this.overlayMode === 'pause') this.selectMenu(this.selected + 1); };
        const choose = () => { if (this.overlayMode === 'pause') this.menuActions[this.selected]?.(); };
        keyboard.on('keydown-UP', up); keyboard.on('keydown-DOWN', down); keyboard.on('keydown-ENTER', choose);
        keyboard.on('keydown-M', toggleMap); keyboard.on('keydown-TAB', toggleMap); keyboard.on('keydown-ESC', togglePause);
        this.game.events.on(GameEvent.Snapshot, this.onSnapshot);
        this.game.events.on(GameEvent.Notice, this.onNotice);
        this.game.events.on(GameEvent.Command, this.onCommand);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.game.events.off(GameEvent.Snapshot, this.onSnapshot); this.game.events.off(GameEvent.Notice, this.onNotice); this.game.events.off(GameEvent.Command, this.onCommand);
            keyboard.off('keydown-UP', up); keyboard.off('keydown-DOWN', down); keyboard.off('keydown-ENTER', choose);
            keyboard.off('keydown-M', toggleMap); keyboard.off('keydown-TAB', toggleMap); keyboard.off('keydown-ESC', togglePause);
            this.noticeTimer?.remove(); this.closeOverlay();
        });
    }
    private emit(command: UiCommand): void { this.game.events.emit(GameEvent.Command, command); }
    private renderSnapshot(data: GameSnapshot): void {
        this.snapshot = data;
        this.hp.setText(`VITALITY                                      ${Math.ceil(data.health)} / 100`);
        this.oxygen.setText(`OXYGEN                                         ${Math.ceil(data.oxygen)}s`);
        this.footer.setText(data.gamepad ? 'L STICK  MOVE    A  JUMP    X  SLASH    B  DODGE / DASH    Y  INTERACT    RT  AIM / RELEASE' : 'A D  MOVE    SPACE  JUMP    J / CLICK  SLASH    SHIFT  DODGE / DASH    E  INTERACT');
        this.footerMap.setText(data.gamepad ? '[VIEW] MAP   [MENU] PAUSE' : '[M] MAP   [ESC] PAUSE');
        this.stage.setText(EVOLUTION_NAMES[data.evolution]); this.portrait.setFrame(data.evolution * 6);
        this.equipment.setText(`${data.evolution === 2 ? 'DIRECTIONAL DASH' : 'DODGE'}  /  ${data.harpoon ? 'HARPOON' : 'CUTLASS'}${data.key ? '  /  CHAPEL KEY' : ''}`);
        this.environment.setText(data.environment === 'air' ? 'AIR POCKET\nO₂ REPLENISHING' : data.environment === 'pressure' ? 'HIGH PRESSURE\nSHELL ADAPTED' : 'SUBMERGED\n2,840 M');
        this.roomLabel.setText(data.roomName); this.objectiveLabel.setText(data.objective); this.prompt.setText(data.prompt).setVisible(!!data.prompt && !data.paused);
        this.bars.clear();
        for (const y of [58, 87]) this.bars.fillStyle(0x21353e).fillRect(115, y, 285, 5);
        this.bars.fillStyle(COLORS.coral).fillRect(115, 58, 285 * data.health / 100, 5);
        this.bars.fillStyle(data.oxygen < 30 ? COLORS.coral : COLORS.teal).fillRect(115, 87, 285 * data.oxygen / 120, 5);
        this.drawMap(this.minimap, 1030, 36, 27, 14, false);
        this.bossLabel.setVisible(!!data.boss);
        if (data.boss) {
            this.bossLabel.setText(data.boss.name);
            this.bars.fillStyle(0x211e29, 0.95).fillRect(410, 156, 460, 7);
            this.bars.fillStyle(0xd68e87).fillRect(410, 156, 460 * data.boss.health / data.boss.maxHealth, 7);
        }
    }
    private drawMap(g: Phaser.GameObjects.Graphics, ox: number, oy: number, sx: number, sy: number, full: boolean, container?: Phaser.GameObjects.Container): void {
        g.clear(); const data = this.snapshot; if (!data) return;
        const explored = new Set(data.explored), hidden = new Set<RoomId>(['handcrab', 'hermit']);
        const visible = new Set<RoomId>(data.explored);
        for (const id of data.explored) for (const door of ROOMS[id].doors) if (!hidden.has(door.to)) visible.add(door.to);
        const w = sx * 0.77, h = sy * 0.64;
        const pos = (id: RoomId) => ({ x: ox + ROOMS[id].map[0] * sx, y: oy + ROOMS[id].map[1] * sy });
        for (const id of ROOM_IDS) {
            if (!explored.has(id)) continue;
            const a = pos(id);
            for (const d of ROOMS[id].doors) {
                if (!visible.has(d.to) || hidden.has(d.to) && !explored.has(d.to)) continue;
                const b = pos(d.to); const open = meetsRequirement(d.requires, data);
                g.lineStyle(full ? 2 : 1, open ? 0x42636b : 0x9f6569, 0.85).lineBetween(a.x + w / 2, a.y + h / 2, b.x + w / 2, b.y + h / 2);
                if (!open) g.fillStyle(COLORS.coral).fillRect((a.x + b.x + w) / 2 - 3, (a.y + b.y + h) / 2 - 3, 6, 6);
            }
        }
        for (const id of ROOM_IDS) {
            if (!visible.has(id)) continue;
            const r = ROOMS[id], p = pos(id), known = explored.has(id), current = id === data.room;
            g.fillStyle(current ? 0x285555 : known ? 0x19333f : 0x0a1824).fillRect(p.x, p.y, w, h);
            g.lineStyle(1, current ? COLORS.gold : known ? 0x658c8d : 0x2a414e).strokeRect(p.x, p.y, w, h);
            if (known && r.station) g.lineStyle(1.5, COLORS.teal).strokeCircle(p.x + (full ? 11 : 4), p.y + (full ? 11 : 4), full ? 4 : 2);
            if (known && r.station && data.checkpoint === id) g.fillStyle(COLORS.teal).fillCircle(p.x + (full ? 11 : 4), p.y + (full ? 11 : 4), full ? 2 : 1);
            if (current) g.fillStyle(COLORS.gold).fillCircle(p.x + Math.max(3, Math.min(w - 3, data.position.x * w)), p.y + Math.max(3, Math.min(h - 3, data.position.y * h)), full ? 3 : 2);
            if (full && container) {
                const label = this.add.text(p.x + w / 2, p.y + h + 9, known ? r.name.replace('The ', '') : 'Unsurveyed', textStyle(10, known ? '#b6c9c3' : '#4d6a75')).setOrigin(0.5, 0);
                container.add(label);
            }
        }
    }
    private showNotice(notice: { title: string; body: string; duration: number }): void {
        this.noticeTimer?.remove(); this.noticeTitle.setText(notice.title); this.noticeBody.setText(notice.body); this.noticeBackground.setVisible(true);
        this.noticeTimer = this.time.delayedCall(notice.duration, () => { this.noticeTitle.setText(''); this.noticeBody.setText(''); this.noticeBackground.setVisible(false); });
    }
    private openOverlay(mode: 'map' | 'pause'): void {
        if (this.overlayMode === mode) return;
        this.closeOverlay(); this.overlayMode = mode; this.menuButtons = []; this.menuActions = []; this.selected = 0;
        this.overlay = this.add.container(0, 0).setDepth(100);
        const add = <T extends Phaser.GameObjects.GameObject>(object: T): T => { this.overlay!.add(object); return object; };
        add(this.add.rectangle(640, 360, 1280, 720, COLORS.ink, 0.97));
        add(this.add.text(50, 36, 'M O L O T O L O G Y  /  F I E L D  S U R V E Y', textStyle(10, '#91aca9')));
        add(this.add.text(50, 77, mode === 'map' ? 'The Wreck' : 'A moment above the dark.', serifStyle(46)));
        add(this.add.text(52, 142, mode === 'map' ? `${this.snapshot?.explored.length ?? 0} / 14 CHAMBERS EXPLORED     ·     ${this.snapshot?.roomName ?? ''}` : 'PAUSED · YOUR OXYGEN RESERVE IS SAFE', textStyle(12, '#93b8b5')));
        const close = add(this.add.text(1180, 45, '[ESC] CLOSE', textStyle(11, '#d5bd8b')).setOrigin(1, 0).setInteractive({ useHandCursor: true })); close.on('pointerdown', () => this.emit({ type: 'resume' }));
        if (mode === 'map') {
            const map = add(this.add.graphics()); this.drawMap(map, 215, 220, 145, 85, true, this.overlay);
            add(this.add.text(52, 623, '● YOU     ○ OXYGEN STATION     ■ SEALED PASSAGE     ─ CONNECTION', textStyle(11, '#92b4b0')));
            add(this.add.text(52, 658, this.snapshot?.objective ?? '', serifStyle(18, '#d6c5a3')));
        } else {
            add(this.add.image(960, 395, 'diver', (this.snapshot?.evolution ?? 0) * 6).setDisplaySize(350, 350).setAlpha(0.35));
            const buttons: [string, () => void][] = [
                ['Resume descent', () => this.emit({ type: 'resume' })],
                ['Survey the wreck', () => this.openOverlay('map')],
                [`Sound: ${this.sound.mute ? 'off' : 'on'}`, () => { this.emit({ type: 'mute' }); this.closeOverlay(); this.openOverlay('pause'); }],
                ['Save & return to title', () => this.emit({ type: 'menu' })]
            ];
            buttons.forEach(([label, action], i) => {
                const button = add(this.add.text(68, 218 + i * 58, label, serifStyle(25, '#c9d0bf')).setInteractive({ useHandCursor: true }));
                this.menuButtons.push(button); this.menuActions.push(action);
                button.on('pointerover', () => this.selectMenu(i)).on('pointerdown', action);
            });
            this.selectMenu(0);
            add(this.add.text(68, 500, 'KEYBOARD & MOUSE\nA / D or arrows move · Space jump / mantle · Shift dodge / Dash\nJ or left click slash · Right mouse hold aim / release Harpoon\nE interact · M / Tab map · Escape pause · K + direction keyboard aim', textStyle(13, '#839f9f')).setLineSpacing(9));
            add(this.add.text(68, 630, 'GAMEPAD   Left stick move · A jump · X slash · B dodge / Dash\nRight stick aim + RT hold / release Harpoon · Y interact · View map · Menu resume', textStyle(12, '#839f9f')).setLineSpacing(8));
        }
    }
    private closeOverlay(): void { this.overlay?.destroy(true); this.overlay = undefined; this.overlayMode = undefined; }
    private selectMenu(index: number): void {
        if (!this.menuButtons.length) return;
        this.selected = (index + this.menuButtons.length) % this.menuButtons.length;
        this.menuButtons.forEach((b, i) => b.setColor(i === this.selected ? '#f0d3a0' : '#91aaa7'));
    }
    update(): void {
        const pad = Array.from(navigator.getGamepads?.() ?? []).find(p => p?.connected);
        if (!pad) { this.previousPad.clear(); return; }
        const edge = (n: number) => !!pad.buttons[n]?.pressed && !this.previousPad.has(n);
        if (this.overlayMode) {
            if (edge(8) || edge(9) || edge(1)) this.emit({ type: 'resume' });
            else if (this.overlayMode === 'map' && edge(0)) this.emit({ type: 'resume' });
            else if (this.overlayMode === 'pause') {
                if (edge(12)) this.selectMenu(this.selected - 1);
                if (edge(13)) this.selectMenu(this.selected + 1);
                if (edge(0)) this.menuActions[this.selected]?.();
            }
        }
        this.previousPad.clear(); pad.buttons.forEach((b, i) => { if (b.pressed) this.previousPad.add(i); });
    }
}
