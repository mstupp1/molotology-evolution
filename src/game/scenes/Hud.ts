import * as Phaser from 'phaser';
import { EVOLUTION_NAMES, GameEvent, SceneKey, type GameSnapshot, type Notice, type UiCommand } from '../constants';
import { ROOMS, ROOM_IDS } from '../world';
import { makeTextures } from '../rendering';
import { el, keyHint, mountLayer, setText, toggle } from '../ui/layer';
import { Menu } from '../ui/menu';
import { drawMap, legendIcon, svg } from '../ui/map';

type Bar = { root: HTMLDivElement; trail: HTMLDivElement; fill: HTMLDivElement; ticks: HTMLDivElement; last: string };
type ControlRow = [keys: string[], action: string];
type ControlGroup = [title: string, rows: ControlRow[]];

const KEYBOARD_CONTROLS: ControlGroup[][] = [
    [['Movement', [[['A', 'D'], 'Move'], [['Space', 'W'], 'Jump, hold for height'], [['Shift', 'S'], 'Dodge · Dash']]],
     ['World', [[['E'], 'Interact'], [['M', 'Tab'], 'Map'], [['Esc'], 'Pause']]]],
    [['Combat', [[['J', 'Click'], 'Slash'], [['Right Mouse'], 'Charge ranged weapon'], [['K'], 'Aim with arrows']]],
     ['Crab form', [[['W', 'S'], 'Climb walls'], [['A', 'D'], 'Scuttle ceilings'], [['Space'], 'Drop or let go']]]]
];
const GAMEPAD_CONTROLS: ControlGroup[][] = [
    [['Movement', [[['L Stick'], 'Move'], [['A'], 'Jump, hold for height'], [['B'], 'Dodge · Dash']]],
     ['World', [[['Y'], 'Interact'], [['View'], 'Map'], [['Menu'], 'Pause']]]],
    [['Combat', [[['X'], 'Slash'], [['R Stick'], 'Aim'], [['RT'], 'Hold, release to throw']]],
     ['Crab form', [[['L Stick'], 'Climb and scuttle'], [['A'], 'Drop or let go']]]]
];

const ENVIRONMENT: Record<GameSnapshot['environment'], (evolution: number) => string> = {
    water: () => 'Submerged · 2,840 m',
    air: () => 'Air pocket · oxygen returning',
    dry: () => 'Drained chamber · breathing freely',
    pressure: () => 'High pressure · shell holds',
    heat: evolution => evolution === 2 ? 'Extreme heat · carapace endures' : 'Extreme heat · shell required'
};

export class Hud extends Phaser.Scene {
    private snapshot?: GameSnapshot;
    private layer: HTMLDivElement;
    private vitality: Bar;
    private oxygenBar: Bar;
    private hpReadout: HTMLDivElement;
    private o2Readout: HTMLDivElement;
    private formName: HTMLDivElement;
    private formKit: HTMLDivElement;
    private objective: HTMLDivElement;
    private surveyRoom: HTMLDivElement;
    private surveyMap: SVGSVGElement;
    private surveyEnv: HTMLDivElement;
    private corner: HTMLDivElement;
    private prompt: HTMLDivElement;
    private notice: HTMLDivElement;
    private noticeTitle: HTMLDivElement;
    private noticeBody: HTMLDivElement;
    private boss: HTMLDivElement;
    private bossName: HTMLDivElement;
    private bossBar: Bar;
    private controlsStrip: HTMLDivElement;
    private card: HTMLDivElement;
    private cardName: HTMLDivElement;
    private cardSub: HTMLDivElement;
    private dirge: HTMLDivElement;
    private dirgeName: HTMLDivElement;
    private dirgeSub: HTMLDivElement;
    private vignette: Phaser.GameObjects.Image;
    private noticeTimer?: Phaser.Time.TimerEvent;
    private cardTimers: Phaser.Time.TimerEvent[] = [];
    private dirgeTimer?: Phaser.Time.TimerEvent;
    private shownRoom?: string;
    private lastHealth = -1;
    private trailHealth = 0;
    private trailBoss = 0;
    private hurtFlash = 0;
    private renderKey = '';
    private overlay?: HTMLDivElement;
    private overlayMode?: 'map' | 'pause';
    private menu?: Menu;
    private previousPad = new Set<number>();
    private onSnapshot = (data: GameSnapshot) => this.renderSnapshot(data);
    private onNotice = (notice: Notice) => this.showNotice(notice);
    private onCommand = (command: UiCommand) => {
        if (command.type === 'pause' && this.snapshot?.paused) this.openOverlay(command.mode);
        else if (command.type === 'resume' || command.type === 'menu') this.closeOverlay();
    };
    constructor() { super(SceneKey.Hud); }
    create(): void {
        this.snapshot = undefined; this.overlay = undefined; this.overlayMode = undefined; this.menu = undefined; this.shownRoom = undefined;
        this.lastHealth = -1; this.trailHealth = 0; this.trailBoss = 0; this.hurtFlash = 0; this.renderKey = ''; this.cardTimers = [];
        this.previousPad.clear();
        makeTextures(this);
        if (!this.textures.exists('hud-vignette')) {
            const canvas = this.textures.createCanvas('hud-vignette', 320, 180)!; const ctx = canvas.context;
            const g = ctx.createRadialGradient(160, 90, 60, 160, 90, 190); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.6, 'rgba(255,255,255,0.25)'); g.addColorStop(1, 'rgba(255,255,255,1)');
            ctx.fillStyle = g; ctx.fillRect(0, 0, 320, 180); canvas.refresh();
        }
        this.vignette = this.add.image(640, 360, 'hud-vignette').setDisplaySize(1280, 720).setTint(0xc0302a).setAlpha(0);
        // A soft shade along the top edge keeps the vitals readable over bright rooms.
        this.add.image(640, 0, 'fog').setOrigin(0.5, 0).setDisplaySize(1280, 190).setFlipY(true).setTint(0x020406).setAlpha(0.8);
        this.buildLayer();

        const keyboard = this.input.keyboard!;
        const toggleMap = (event: KeyboardEvent) => { if (event.repeat) return; this.emit(this.overlayMode ? { type: 'resume' } : { type: 'pause', mode: 'map' }); };
        const togglePause = (event: KeyboardEvent) => { if (event.repeat) return; this.emit(this.overlayMode ? { type: 'resume' } : { type: 'pause', mode: 'pause' }); };
        const up = () => { if (this.overlayMode === 'pause') this.menu?.move(-1); };
        const down = () => { if (this.overlayMode === 'pause') this.menu?.move(1); };
        const choose = () => { if (this.overlayMode === 'pause') this.menu?.confirm(); };
        const bindings: [string, (event: KeyboardEvent) => void][] = [
            ['keydown-UP', up], ['keydown-W', up], ['keydown-DOWN', down], ['keydown-S', down], ['keydown-ENTER', choose], ['keydown-SPACE', choose],
            ['keydown-M', toggleMap], ['keydown-TAB', toggleMap], ['keydown-ESC', togglePause]
        ];
        for (const [event, handler] of bindings) keyboard.on(event, handler);
        this.game.events.on(GameEvent.Snapshot, this.onSnapshot);
        this.game.events.on(GameEvent.Notice, this.onNotice);
        this.game.events.on(GameEvent.Command, this.onCommand);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.game.events.off(GameEvent.Snapshot, this.onSnapshot); this.game.events.off(GameEvent.Notice, this.onNotice); this.game.events.off(GameEvent.Command, this.onCommand);
            for (const [event, handler] of bindings) keyboard.off(event, handler);
            this.noticeTimer?.remove(); this.dirgeTimer?.remove(); this.cardTimers.forEach(t => t.remove()); this.closeOverlay();
        });
    }
    private buildLayer(): void {
        const layer = this.layer = mountLayer(this, 'hud');
        const play = el('div', 'hud-play', undefined, layer);

        const vitals = el('div', 'vitals', undefined, play);
        this.vitality = this.bar(vitals, 'vitality'); this.hpReadout = el('div', 'readout', undefined, vitals);
        this.oxygenBar = this.bar(vitals, 'oxygen thin'); this.o2Readout = el('div', 'readout', undefined, vitals);
        const form = el('div', 'form', undefined, play);
        this.formName = el('div', 'form-name', undefined, form); this.formKit = el('div', 'form-kit', undefined, form);
        const objective = el('div', 'objective', undefined, play);
        el('div', 'objective-label', 'Objective', objective); this.objective = el('div', 'objective-text', undefined, objective);

        const survey = el('div', 'survey', undefined, play);
        this.surveyRoom = el('div', 'survey-room', undefined, survey);
        this.surveyMap = svg('svg', { class: 'survey-map', width: 236, height: 100, viewBox: '0 0 236 100' }, survey);
        this.surveyEnv = el('div', 'survey-env', undefined, survey);
        this.corner = el('div', 'corner-hints', undefined, play);
        this.corner.addEventListener('pointerdown', event => { event.stopPropagation(); this.emit({ type: 'pause', mode: 'map' }); });

        const stack = el('div', 'bottom-stack', undefined, play);
        this.prompt = el('div', 'prompt', undefined, stack);
        this.notice = el('div', 'notice', undefined, stack);
        this.noticeTitle = el('div', 'notice-title', undefined, this.notice); this.noticeBody = el('div', 'notice-body', undefined, this.notice);
        this.boss = el('div', 'boss', undefined, stack);
        this.bossName = el('div', 'boss-name', undefined, this.boss); this.bossBar = this.bar(this.boss, 'boss-bar');
        this.controlsStrip = el('div', 'controls-strip', undefined, stack);

        this.card = el('div', 'card', undefined, play);
        this.cardName = el('div', 'card-name', undefined, this.card); el('div', 'rule', undefined, this.card); this.cardSub = el('div', 'card-sub', undefined, this.card);
        this.dirge = el('div', 'card dirge', undefined, layer);
        this.dirgeName = el('div', 'card-name', undefined, this.dirge); el('div', 'rule', undefined, this.dirge).style.width = '640px'; this.dirgeSub = el('div', 'card-sub', undefined, this.dirge);
    }
    private bar(parent: HTMLElement, kind: string): Bar {
        const root = el('div', `bar ${kind}`, undefined, parent);
        return { root, trail: el('div', 'trail', undefined, root), fill: el('div', 'fill', undefined, root), ticks: el('div', 'ticks', undefined, root), last: '' };
    }
    private setBar(bar: Bar, ratio: number, trail: number): void {
        const key = `${(Phaser.Math.Clamp(ratio, 0, 1) * 100).toFixed(1)}|${(Phaser.Math.Clamp(trail, 0, 1) * 100).toFixed(1)}`;
        if (key === bar.last) return; bar.last = key;
        const [f, t] = key.split('|'); bar.fill.style.width = `${f}%`; bar.trail.style.width = `${t}%`;
    }
    private emit(command: UiCommand): void { this.game.events.emit(GameEvent.Command, command); }
    private showTitleCard(data: GameSnapshot): void {
        setText(this.cardName, data.roomName); setText(this.cardSub, ROOMS[data.room].subtitle);
        this.cardTimers.forEach(t => t.remove());
        this.card.classList.remove('show');
        this.cardTimers = [this.time.delayedCall(250, () => this.card.classList.add('show')), this.time.delayedCall(2850, () => this.card.classList.remove('show'))];
    }
    private renderSnapshot(data: GameSnapshot): void {
        this.snapshot = data;
        if (this.shownRoom !== data.room) { this.shownRoom = data.room; this.showTitleCard(data); }
        if (this.lastHealth >= 0 && data.health < this.lastHealth - 0.5) this.hurtFlash = 0.55;
        if (this.lastHealth < 0) this.trailHealth = data.health;
        this.lastHealth = data.health;
        const lowHealth = data.health / data.maxHealth < 0.3, lowOxygen = data.oxygen < 30;

        const hpWidth = Math.min(380, 260 * data.maxHealth / 100);
        if (this.vitality.root.style.width !== `${hpWidth}px`) {
            this.vitality.root.style.width = `${hpWidth}px`; this.oxygenBar.root.style.width = '260px';
            const segment = hpWidth / (data.maxHealth / 20);
            this.vitality.ticks.style.backgroundImage = `repeating-linear-gradient(90deg, transparent 0 ${segment - 2}px, rgba(0,0,0,0.75) ${segment - 2}px ${segment}px)`;
            this.oxygenBar.ticks.style.backgroundImage = 'repeating-linear-gradient(90deg, transparent 0 63px, rgba(0,0,0,0.75) 63px 65px)';
        }
        const hp = `${Math.ceil(data.health)}<span class="of"> / ${data.maxHealth}</span>`;
        const o2 = `${Math.ceil(data.oxygen)}<span class="of">s</span>${data.environment === 'air' || data.environment === 'dry' ? '<span class="tag">▲ Breathing</span>' : ''}`;
        if (this.hpReadout.dataset.html !== hp) { this.hpReadout.dataset.html = hp; this.hpReadout.innerHTML = hp; }
        if (this.o2Readout.dataset.html !== o2) { this.o2Readout.dataset.html = o2; this.o2Readout.innerHTML = o2; }
        toggle(this.hpReadout, 'critical', lowHealth); toggle(this.vitality.root, 'critical', lowHealth);
        toggle(this.o2Readout, 'critical', lowOxygen); toggle(this.oxygenBar.root, 'critical', lowOxygen);

        setText(this.formName, EVOLUTION_NAMES[data.evolution]);
        const kit = [data.evolution >= 1 ? 'Claw' : 'Knife', data.evolution >= 1 ? 'Dash' : 'Dodge'];
        if (data.evolution === 2) kit.push('Scuttle'); if (data.rangedWeapon !== 'none') kit.push(data.rangedWeapon === 'bubble' ? 'Bubble Shot' : 'Harpoon'); if (data.key) kit.push('Chapel Key');
        setText(this.formKit, kit.join('  ·  '));
        setText(this.objective, data.objective);

        setText(this.surveyRoom, data.roomName);
        this.surveyEnv.className = `survey-env env-${data.environment}`;
        if (!this.surveyEnv.firstChild || this.surveyEnv.dataset.text !== ENVIRONMENT[data.environment](data.evolution)) {
            const text = this.surveyEnv.dataset.text = ENVIRONMENT[data.environment](data.evolution);
            this.surveyEnv.replaceChildren(el('span', 'dot')); this.surveyEnv.append(text);
        }
        const mapKey = `${data.room}|${data.explored.join()}|${data.checkpoint}|${data.harpoon}|${data.evolution}|${data.key}|${Math.round(data.position.x * 20)}|${Math.round(data.position.y * 10)}`;
        if (mapKey !== this.renderKey) { this.renderKey = mapKey; drawMap(this.surveyMap, data, 36, 22, false); }

        const inputKey = data.gamepad ? 'pad' : 'keys';
        if (this.corner.dataset.input !== inputKey) {
            this.corner.dataset.input = inputKey; this.corner.replaceChildren();
            keyHint([data.gamepad ? 'View' : 'M'], 'Map', this.corner); keyHint([data.gamepad ? 'Menu' : 'Esc'], 'Pause', this.corner);
            this.controlsStrip.replaceChildren();
            const strip: ControlRow[] = data.gamepad
                ? [[['L Stick'], 'Move'], [['A'], 'Jump'], [['X'], 'Slash'], [['B'], 'Dodge'], [['Y'], 'Interact']]
                : [[['A', 'D'], 'Move'], [['Space', 'W'], 'Jump'], [['J'], 'Slash'], [['Shift', 'S'], 'Dodge'], [['E'], 'Interact']];
            for (const [keys, action] of strip) keyHint(keys, action, this.controlsStrip);
        }
        toggle(this.controlsStrip, 'show', data.room === 'hull' && !data.harpoon && !data.paused && !data.boss);

        this.renderPrompt(data);
        toggle(this.boss, 'show', !!data.boss);
        if (data.boss) { setText(this.bossName, data.boss.name); toggle(this.boss, 'enraged', data.boss.health < data.boss.maxHealth / 2); }
        this.vignette.setTint(lowOxygen && !lowHealth ? 0x1a6a8a : 0xc0302a);
    }
    private renderPrompt(data: GameSnapshot): void {
        const text = data.paused ? '' : data.prompt;
        if (this.prompt.dataset.text === `${text}|${data.gamepad}`) return;
        this.prompt.dataset.text = `${text}|${data.gamepad}`;
        this.prompt.replaceChildren(); toggle(this.prompt, 'show', !!text);
        if (!text) return;
        const match = /^\[([^\]]+)\]\s*(.*)$/.exec(text);
        if (match && match[1] === 'SEALED') {
            const lock = el('span', '', '◆ Sealed', this.prompt); lock.style.cssText = 'font-family: var(--display); font-size: 14px; letter-spacing: 0.2em; color: var(--blood-hi);';
            el('span', 'hint-action', match[2], this.prompt);
        } else if (match) {
            const keys = match[1].split('/').map(k => k.trim());
            keyHint([data.gamepad ? keys[keys.length - 1] : keys[0]], match[2], this.prompt);
        } else {
            const plain = el('span', '', text.charAt(0) + text.slice(1).toLowerCase(), this.prompt); plain.style.color = 'var(--verdigris-hi)';
        }
    }
    private showNotice(notice: Notice): void {
        if (notice.boss || notice.death) {
            this.dirgeTimer?.remove();
            this.cardTimers.forEach(t => t.remove()); this.card.classList.remove('show');
            this.dirge.classList.toggle('death', !!notice.death);
            setText(this.dirgeName, notice.title); setText(this.dirgeSub, notice.body);
            this.dirge.classList.remove('show'); void this.dirge.offsetWidth; this.dirge.classList.add('show');
            this.dirgeTimer = this.time.delayedCall(Math.max(900, notice.duration - 900), () => this.dirge.classList.remove('show'));
            return;
        }
        this.noticeTimer?.remove();
        setText(this.noticeTitle, notice.title); setText(this.noticeBody, notice.body);
        this.notice.classList.remove('show'); void this.notice.offsetWidth; this.notice.classList.add('show');
        this.noticeTimer = this.time.delayedCall(notice.duration, () => this.notice.classList.remove('show'));
    }
    private openOverlay(mode: 'map' | 'pause'): void {
        if (this.overlayMode === mode) return;
        this.closeOverlay(); this.overlayMode = mode;
        const data = this.snapshot;
        const overlay = this.overlay = el('div', `overlay overlay-${mode}`, undefined, this.layer);
        this.layer.classList.add('hidden-for-overlay');
        const head = el('div', 'overlay-head', undefined, overlay);
        el('div', 'eyebrow', mode === 'map' ? 'Field Survey' : 'Paused', head);
        el('div', 'overlay-title', mode === 'map' ? 'The Wreck' : 'A moment above the dark', head);
        el('div', 'overlay-sub', mode === 'map' ? `${data?.explored.length ?? 0} of ${ROOM_IDS.length} chambers explored · you are in ${data?.roomName ?? 'the wreck'}` : 'Your oxygen is held while you rest here.', head);
        el('div', 'rule left', undefined, head);
        const close = el('div', 'overlay-close', undefined, overlay);
        keyHint([data?.gamepad ? 'B' : 'Esc'], 'Close', close);
        close.addEventListener('pointerdown', event => { event.stopPropagation(); this.emit({ type: 'resume' }); });
        const foot = el('div', 'overlay-foot', undefined, overlay);

        if (mode === 'map') {
            const wrap = el('div', 'map-wrap', undefined, overlay);
            const map = svg('svg', { width: 900, height: 360, viewBox: '0 0 900 360' }, wrap);
            if (data) drawMap(map, data, 152, 90, true);
            const legend = el('div', 'map-legend', undefined, foot);
            for (const [kind, label] of [['you', 'You'], ['station', 'Oxygen station · save'], ['sealed', 'Sealed passage'], ['room', 'Unsurveyed']] as const) {
                const item = el('span', '', undefined, legend); item.appendChild(legendIcon(kind)); item.append(label);
            }
            const objective = el('div', 'map-objective', undefined, foot);
            el('span', 'eyebrow', 'Objective', objective); el('span', '', data?.objective ?? '', objective);
            objective.style.maxWidth = '560px';
        } else {
            const holder = el('div', 'pause-menu', undefined, overlay);
            this.menu = new Menu(holder, [
                { label: 'Resume', action: () => this.emit({ type: 'resume' }) },
                { label: 'Survey the Wreck', action: () => this.openOverlay('map') },
                { label: this.soundLabel(), action: () => { this.emit({ type: 'mute' }); this.menu?.setLabel(2, this.soundLabel()); } },
                { label: 'Return to Title', note: 'Your progress is saved', action: () => this.emit({ type: 'menu' }) }
            ], 'left');
            const controls = el('div', 'pause-controls', undefined, overlay);
            el('div', 'eyebrow', data?.gamepad ? 'Controls · Gamepad' : 'Controls · Keyboard and Mouse', controls);
            const columns = el('div', '', undefined, controls); columns.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; column-gap: 36px;';
            for (const column of data?.gamepad ? GAMEPAD_CONTROLS : KEYBOARD_CONTROLS) {
                const grid = el('div', 'control-grid', undefined, columns); grid.style.gridTemplateColumns = '132px 1fr';
                for (const [title, rows] of column) {
                    el('div', 'control-group', title, grid);
                    for (const [keys, action] of rows) {
                        const cell = el('div', 'control-keys', undefined, grid);
                        keys.forEach((k, i) => { if (i) el('span', 'hint-or', '/', cell); el('kbd', 'key', k, cell); });
                        el('div', 'control-action', action, grid);
                    }
                }
            }
            el('div', '', data?.rangedWeapon === 'bubble' ? 'Release as the bubble flashes for a perfect shot. The Angler’s lantern is vulnerable.' : 'The harpoon only bites on golden anchor rings.', foot).style.fontStyle = 'italic';
            const nav = el('div', '', undefined, foot);
            keyHint(data?.gamepad ? ['D-Pad'] : ['↑', '↓'], 'Select', nav); keyHint([data?.gamepad ? 'A' : 'Enter'], 'Confirm', nav);
        }
    }
    private soundLabel(): string { return `Sound: ${this.sound.mute ? 'Off' : 'On'}`; }
    private closeOverlay(): void {
        this.overlay?.remove(); this.overlay = undefined; this.overlayMode = undefined; this.menu = undefined;
        this.layer?.classList.remove('hidden-for-overlay');
    }
    update(_time: number, delta: number): void {
        const dt = delta / 1000, data = this.snapshot;
        if (data) {
            this.trailHealth = data.health > this.trailHealth ? data.health : Phaser.Math.Linear(this.trailHealth, data.health, Math.min(1, dt * 2.5));
            this.trailBoss = data.boss ? (data.boss.health > this.trailBoss ? data.boss.health : Phaser.Math.Linear(this.trailBoss, data.boss.health, Math.min(1, dt * 2))) : 0;
            this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.6);
            const danger = !data.paused && (data.health / data.maxHealth < 0.3 || data.oxygen < 30) ? 0.25 + Math.sin(this.time.now / 180) * 0.12 : 0;
            this.vignette.setAlpha(Math.max(this.hurtFlash, danger));
            this.setBar(this.vitality, data.health / data.maxHealth, this.trailHealth / data.maxHealth);
            this.setBar(this.oxygenBar, data.oxygen / 120, data.oxygen / 120);
            if (data.boss) this.setBar(this.bossBar, data.boss.health / data.boss.maxHealth, this.trailBoss / data.boss.maxHealth);
        }
        const pad = Array.from(navigator.getGamepads?.() ?? []).find(p => p?.connected);
        if (!pad) { this.previousPad.clear(); return; }
        const edge = (n: number) => !!pad.buttons[n]?.pressed && !this.previousPad.has(n);
        if (this.overlayMode) {
            if (edge(8) || edge(9) || edge(1)) this.emit({ type: 'resume' });
            else if (this.overlayMode === 'map' && edge(0)) this.emit({ type: 'resume' });
            else if (this.overlayMode === 'pause') {
                if (edge(12)) this.menu?.move(-1);
                if (edge(13)) this.menu?.move(1);
                if (edge(0)) this.menu?.confirm();
            }
        }
        this.previousPad.clear(); pad.buttons.forEach((b, i) => { if (b.pressed) this.previousPad.add(i); });
    }
}
