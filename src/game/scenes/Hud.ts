import * as Phaser from 'phaser';
import { COLORS, EVOLUTION_NAMES, GameEvent, SceneKey, type GameSnapshot, type Notice, type UiCommand } from '../constants';
import { ROOMS, ROOM_IDS, meetsRequirement, type RoomId } from '../world';
import { makeTextures, serifStyle, textStyle } from '../rendering';

export class Hud extends Phaser.Scene {
    private snapshot?: GameSnapshot;
    private bars: Phaser.GameObjects.Graphics;
    private minimap: Phaser.GameObjects.Graphics;
    private hp: Phaser.GameObjects.Text;
    private oxygen: Phaser.GameObjects.Text;
    private stage: Phaser.GameObjects.Text;
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
    private notice: Phaser.GameObjects.Container;
    private noticeTimer?: Phaser.Time.TimerEvent;
    private titleCard: Phaser.GameObjects.Container;
    private titleName: Phaser.GameObjects.Text;
    private titleSub: Phaser.GameObjects.Text;
    private bossCard: Phaser.GameObjects.Text;
    private vignette: Phaser.GameObjects.Image;
    private shownRoom?: string;
    private lastHealth = -1;
    private trailHealth = 0;
    private trailBoss = 0;
    private hurtFlash = 0;
    private overlay?: Phaser.GameObjects.Container;
    private overlayMode?: 'map' | 'pause';
    private previousPad = new Set<number>();
    private menuButtons: Phaser.GameObjects.Text[] = [];
    private menuActions: (() => void)[] = [];
    private selected = 0;
    private onSnapshot = (data: GameSnapshot) => this.renderSnapshot(data);
    private onNotice = (notice: Notice) => this.showNotice(notice);
    private onCommand = (command: UiCommand) => {
        if (command.type === 'pause' && this.snapshot?.paused) this.openOverlay(command.mode);
        else if (command.type === 'resume' || command.type === 'menu') this.closeOverlay();
    };
    constructor() { super(SceneKey.Hud); }
    create(): void {
        this.snapshot = undefined; this.overlay = undefined; this.overlayMode = undefined; this.shownRoom = undefined;
        this.lastHealth = -1; this.trailHealth = 0; this.trailBoss = 0; this.hurtFlash = 0;
        this.previousPad.clear();
        makeTextures(this);
        if (!this.textures.exists('hud-vignette')) {
            const canvas = this.textures.createCanvas('hud-vignette', 320, 180)!; const ctx = canvas.context;
            const g = ctx.createRadialGradient(160, 90, 60, 160, 90, 190); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.6, 'rgba(255,255,255,0.25)'); g.addColorStop(1, 'rgba(255,255,255,1)');
            ctx.fillStyle = g; ctx.fillRect(0, 0, 320, 180); canvas.refresh();
        }
        this.vignette = this.add.image(640, 360, 'hud-vignette').setDisplaySize(1280, 720).setTint(0xc0302a).setAlpha(0);
        // A soft gradient replaces the old solid header band so the wreck stays visible.
        this.add.image(640, 0, 'fog').setOrigin(0.5, 0).setDisplaySize(1280, 150).setFlipY(true).setTint(0x02070c).setAlpha(0.85);
        const frame = this.add.graphics();
        frame.fillStyle(0x061019, 0.92).fillCircle(60, 60, 40).lineStyle(2, COLORS.gold, 0.7).strokeCircle(60, 60, 40).lineStyle(1, COLORS.teal, 0.35).strokeCircle(60, 60, 45);
        this.portrait = this.add.image(60, 62, 'diver', 0).setDisplaySize(74, 74);
        if (this.game.renderer.type === Phaser.WEBGL) {
            this.portrait.enableFilters();
            this.portrait.filters?.internal.addGlow(0x83c9bd, 0.5, 0, 1, false, 0.1, 5);
        }
        this.hp = this.add.text(114, 24, 'VITALITY', textStyle(10, '#e7b2a8')).setShadow(0, 1, '#000', 3);
        this.oxygen = this.add.text(114, 56, 'OXYGEN', textStyle(10, '#a5dcd5')).setShadow(0, 1, '#000', 3);
        this.stage = this.add.text(114, 88, EVOLUTION_NAMES[0], serifStyle(15, '#e8dcc0')).setShadow(0, 1, '#000', 3);
        this.equipment = this.add.text(114, 109, 'DODGE  ·  CUTLASS', textStyle(9, '#8eaaa9'));
        this.objectiveLabel = this.add.text(22, 138, '', textStyle(12, '#c9d6cf')).setWordWrapWidth(360).setShadow(0, 1, '#000', 4).setLineSpacing(3);
        const mapPanel = this.add.graphics();
        mapPanel.fillStyle(0x061019, 0.8).fillRoundedRect(1012, 14, 250, 108, 6).lineStyle(1, 0x41616a, 0.8).strokeRoundedRect(1012, 14, 250, 108, 6);
        this.add.text(1024, 20, 'SURVEY', textStyle(9, '#8caaa9'));
        this.footerMap = this.add.text(1250, 20, '[M] MAP   [ESC] PAUSE', textStyle(9, '#d6c79c')).setOrigin(1, 0).setInteractive({ useHandCursor: true });
        this.footerMap.on('pointerdown', () => this.emit({ type: 'pause', mode: 'map' }));
        this.environment = this.add.text(1024, 104, 'SUBMERGED', textStyle(9, '#94bab8'));
        this.bars = this.add.graphics(); this.minimap = this.add.graphics();
        // Boss health sits at the bottom of the screen, framed like an epitaph.
        this.bossLabel = this.add.text(640, 124, '', serifStyle(19, '#f0c6bd')).setOrigin(0.5).setVisible(false).setShadow(0, 2, '#000', 6).setLetterSpacing(3);
        this.prompt = this.add.text(640, 548, '', textStyle(15, '#f6e6c0')).setOrigin(0.5).setBackgroundColor('#071621e6').setPadding(16, 9).setShadow(0, 1, '#000', 2);
        this.noticeBackground = this.add.rectangle(0, 0, 700, 80, 0x061019, 0.9).setStrokeStyle(1, 0x5d7d80, 0.6);
        this.noticeTitle = this.add.text(0, -26, '', textStyle(11, '#e6c58a')).setOrigin(0.5, 0).setLetterSpacing(2);
        this.noticeBody = this.add.text(0, -6, '', textStyle(13, '#c7d5d0')).setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(760).setLineSpacing(4);
        this.notice = this.add.container(640, 640, [this.noticeBackground, this.noticeTitle, this.noticeBody]).setAlpha(0);
        this.titleName = this.add.text(0, 0, '', serifStyle(44, '#efe2c4')).setOrigin(0.5).setShadow(0, 3, '#000', 10);
        this.titleSub = this.add.text(0, 44, '', textStyle(11, '#a6c4bf')).setOrigin(0.5).setLetterSpacing(4).setShadow(0, 1, '#000', 4);
        const rule = this.add.rectangle(0, 26, 360, 1, COLORS.gold, 0.6);
        this.titleCard = this.add.container(640, 236, [rule, this.titleName, this.titleSub]).setAlpha(0);
        this.bossCard = this.add.text(640, 330, '', serifStyle(54, '#f3c1b6')).setOrigin(0.5).setAlpha(0).setShadow(0, 4, '#000', 12).setLetterSpacing(6);
        this.footer = this.add.text(640, 700, '', textStyle(10, '#9db6b6')).setOrigin(0.5).setBackgroundColor('#061019cc').setPadding(14, 6);
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
    private showTitleCard(data: GameSnapshot): void {
        this.titleName.setText(data.roomName); this.titleSub.setText(ROOMS[data.room].subtitle);
        this.tweens.killTweensOf(this.titleCard);
        this.titleCard.setAlpha(0).setY(250);
        this.tweens.chain({ targets: this.titleCard, tweens: [
            { alpha: 1, y: 236, duration: 700, ease: 'Cubic.Out', delay: 250 },
            { alpha: 0, y: 228, duration: 900, ease: 'Sine.In', delay: 1900 }
        ] });
    }
    private renderSnapshot(data: GameSnapshot): void {
        this.snapshot = data;
        if (this.shownRoom !== data.room) { this.shownRoom = data.room; this.showTitleCard(data); }
        if (this.lastHealth >= 0 && data.health < this.lastHealth - 0.5) this.hurtFlash = 0.55;
        if (this.lastHealth < 0) this.trailHealth = data.health;
        this.lastHealth = data.health;
        const lowHealth = data.health / data.maxHealth < 0.3, lowOxygen = data.oxygen < 30;
        this.hp.setText(`VITALITY   ${Math.ceil(data.health)} / ${data.maxHealth}`);
        this.oxygen.setText(`OXYGEN   ${Math.ceil(data.oxygen)}s${data.environment === 'air' ? '   ▲ REPLENISHING' : ''}`).setColor(lowOxygen ? '#ff9f92' : '#a5dcd5');
        const tutorial = data.room === 'hull' && !data.harpoon;
        this.footer.setVisible(tutorial && !data.paused).setText(data.gamepad ? 'L STICK  MOVE    A  JUMP    X  SLASH    B  DODGE / DASH    Y  INTERACT    RT  AIM / RELEASE' : 'A D  MOVE    SPACE  JUMP    J / CLICK  SLASH    SHIFT  DODGE / DASH    E  INTERACT    M  MAP');
        this.footerMap.setText(data.gamepad ? '[VIEW] MAP   [MENU] PAUSE' : '[M] MAP   [ESC] PAUSE');
        this.stage.setText(EVOLUTION_NAMES[data.evolution]); this.portrait.setFrame(data.evolution * 6);
        this.equipment.setText(`${data.evolution === 2 ? 'DIRECTIONAL DASH' : 'DODGE'}  ·  ${data.harpoon ? 'CUTLASS + HARPOON' : 'CUTLASS'}${data.key ? '  ·  CHAPEL KEY' : ''}`);
        this.environment.setText(data.environment === 'air' ? 'AIR POCKET · O₂ REPLENISHING' : data.environment === 'pressure' ? 'HIGH PRESSURE · SHELL ADAPTED' : 'SUBMERGED · 2,840 M').setColor(data.environment === 'air' ? '#bfe9cf' : data.environment === 'pressure' ? '#c8a8ff' : '#94bab8');
        this.objectiveLabel.setText(`◆  ${data.objective}`);
        this.prompt.setText(data.prompt).setVisible(!!data.prompt && !data.paused);
        this.drawBars();
        this.drawMap(this.minimap, 1030, 38, 30, 16, false);
        this.bossLabel.setVisible(!!data.boss);
        if (data.boss) this.bossLabel.setText(data.boss.name);
        this.vignette.setTint(lowOxygen && !lowHealth ? 0x1a6a8a : 0xc0302a);
    }
    private drawBars(): void {
        const data = this.snapshot; if (!data) return;
        const g = this.bars; g.clear();
        const hpW = Math.min(360, 240 * data.maxHealth / 100), o2W = 260;
        const bar = (x: number, y: number, w: number, h: number, fill: number, ratio: number, trail: number, ticks: number) => {
            g.fillStyle(0x02080d, 0.9).fillRect(x - 2, y - 2, w + 4, h + 4);
            g.fillStyle(0x1b2c33).fillRect(x, y, w, h);
            g.fillStyle(0xf6efe0, 0.7).fillRect(x, y, w * Phaser.Math.Clamp(trail, 0, 1), h);
            g.fillStyle(fill).fillRect(x, y, w * Phaser.Math.Clamp(ratio, 0, 1), h);
            g.fillStyle(0xffffff, 0.22).fillRect(x, y, w * Phaser.Math.Clamp(ratio, 0, 1), 2);
            g.fillStyle(0x02080d, 0.8); for (let i = 1; i < ticks; i++) g.fillRect(x + w * i / ticks - 1, y, 2, h);
        };
        const pulse = 0.65 + Math.sin(this.time.now / 120) * 0.35;
        const lowHealth = data.health / data.maxHealth < 0.3;
        bar(114, 40, hpW, 9, lowHealth ? Phaser.Display.Color.GetColor(233, 90 + 40 * pulse, 90) : COLORS.coral, data.health / data.maxHealth, this.trailHealth / data.maxHealth, data.maxHealth / 20);
        bar(114, 72, o2W, 7, data.oxygen < 30 ? (pulse > 0.6 ? COLORS.coral : 0x9a4a4a) : COLORS.teal, data.oxygen / 120, data.oxygen / 120, 4);
        if (data.boss) {
            const w = 440, x = 640 - w / 2, y = 142;
            g.fillStyle(0x02080d, 0.85).fillRect(x - 4, y - 4, w + 8, 18);
            g.lineStyle(1, 0x9a6a64, 0.8).strokeRect(x - 4, y - 4, w + 8, 18);
            g.fillStyle(0x2a1a20).fillRect(x, y, w, 10);
            g.fillStyle(0xfff0e0, 0.75).fillRect(x, y, w * this.trailBoss / data.boss.maxHealth, 10);
            g.fillStyle(data.boss.health < data.boss.maxHealth / 2 ? 0xc87ae0 : 0xd6726a).fillRect(x, y, w * data.boss.health / data.boss.maxHealth, 10);
            g.fillStyle(0xffffff, 0.25).fillRect(x, y, w * data.boss.health / data.boss.maxHealth, 2);
            g.fillStyle(COLORS.gold).fillTriangle(x - 12, y + 5, x - 4, y, x - 4, y + 10).fillTriangle(x + w + 12, y + 5, x + w + 4, y, x + w + 4, y + 10);
        }
    }
    private showNotice(notice: Notice): void {
        if (notice.boss) {
            this.tweens.killTweensOf(this.bossCard); this.tweens.killTweensOf(this.titleCard);
            this.tweens.add({ targets: this.titleCard, alpha: 0, duration: 200 });
            this.bossCard.setText(notice.title).setAlpha(0).setScale(1.25);
            this.tweens.chain({ targets: this.bossCard, tweens: [
                { alpha: 1, scale: 1, duration: 500, ease: 'Back.Out' },
                { alpha: 0, duration: 800, delay: notice.duration - 1300 }
            ] });
            return;
        }
        this.noticeTimer?.remove(); this.noticeTitle.setText(notice.title); this.noticeBody.setText(notice.body);
        const w = Math.max(this.noticeTitle.width, this.noticeBody.width) + 70, h = this.noticeBody.height + 46;
        this.noticeBackground.setSize(w, h).setDisplaySize(w, h); this.noticeBackground.geom.setSize(w, h); this.noticeBackground.setPosition(0, h / 2 - 34);
        this.noticeBackground.setOrigin(0.5);
        this.tweens.killTweensOf(this.notice);
        this.notice.setY(650).setAlpha(0);
        this.tweens.add({ targets: this.notice, alpha: 1, y: this.notice.y - 10, duration: 280, ease: 'Cubic.Out' });
        this.noticeTimer = this.time.delayedCall(notice.duration, () => this.tweens.add({ targets: this.notice, alpha: 0, duration: 450 }));
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
    private openOverlay(mode: 'map' | 'pause'): void {
        if (this.overlayMode === mode) return;
        this.closeOverlay(); this.overlayMode = mode; this.menuButtons = []; this.menuActions = []; this.selected = 0;
        this.overlay = this.add.container(0, 0).setDepth(100);
        const add = <T extends Phaser.GameObjects.GameObject>(object: T): T => { this.overlay!.add(object); return object; };
        add(this.add.rectangle(640, 360, 1280, 720, COLORS.ink, 1));
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
    update(_time: number, delta: number): void {
        const dt = delta / 1000, data = this.snapshot;
        if (data) {
            this.trailHealth = data.health > this.trailHealth ? data.health : Phaser.Math.Linear(this.trailHealth, data.health, Math.min(1, dt * 2.5));
            this.trailBoss = data.boss ? (data.boss.health > this.trailBoss ? data.boss.health : Phaser.Math.Linear(this.trailBoss, data.boss.health, Math.min(1, dt * 2))) : 0;
            this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.6);
            const danger = !data.paused && (data.health / data.maxHealth < 0.3 || data.oxygen < 30) ? 0.25 + Math.sin(this.time.now / 180) * 0.12 : 0;
            this.vignette.setAlpha(Math.max(this.hurtFlash, danger));
            this.drawBars();
        }
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
