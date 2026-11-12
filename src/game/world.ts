import type { Evolution } from './constants';
export type RoomId = 'hull' | 'bell' | 'cargo' | 'armory' | 'rigging' | 'infirmary' | 'pressure' | 'molt' | 'ballast' | 'quarters' | 'chapel' | 'furnace' | 'caldera' | 'angler' | 'handcrab' | 'hermit';
export type EnemyKind = 'urchin' | 'jellyfish' | 'octopus' | 'shark' | 'handcrab' | 'hermit' | 'angler';
export type Requirement = 'harpoon' | 'pressure' | 'dash' | 'heat' | 'key';
export type PickupKind = 'harpoon' | 'breach' | 'infestation' | 'key' | 'health';
export interface Rect { x: number; y: number; w: number; h: number }
export interface Obstacle extends Rect { id: string }
export interface Door { id: string; x: number; y: number; to: RoomId; label: string; requires?: Requirement; hidden?: boolean; shortcut?: boolean }
export interface Pickup { id: string; kind: PickupKind; x: number; y: number }
export interface EnemySpawn { id: string; kind: EnemyKind; x: number; y: number; range?: number }
export interface Room {
    id: RoomId; name: string; subtitle: string; map: [number, number]; width: number; height: number;
    color: number; platforms: Rect[]; doors: Door[]; anchors: { x: number; y: number }[];
    air: Rect[]; station?: { x: number; y: number }; pickups: Pickup[]; enemies: EnemySpawn[]; pressure?: boolean; volcanic?: boolean; heat?: Rect[]; obstacles?: Obstacle[]; log: string;
}
const WIDTH = 3200;
const platform = (x: number, y: number, w: number, h = 28): Rect => ({ x, y, w, h });
const door = (from: RoomId, to: RoomId, x: number, label: string, extra: Partial<Door> = {}): Door => ({ id: `${from}:${to}`, x, y: 838, to, label, ...extra });
const mob = (r: RoomId, kind: EnemyKind, x: number, y = 815, _n = 0): EnemySpawn => ({ id: `${r}:${kind}:${x}`, kind, x, y });
function room(id: RoomId, name: string, map: [number, number], patch: Partial<Room>): Room {
    return { id, name, subtitle: 'THE WRECK · DEPTH 2,840 M', map, width: WIDTH, height: 1024, color: 0x14343d,
        platforms: [platform(0, 850, WIDTH, 174), platform(580, 690, 240), platform(1200, 590, 300), platform(1900, 710, 280), platform(2500, 620, 280)],
        doors: [], anchors: [], air: [], pickups: [], enemies: [], log: '', ...patch };
}
export const ROOMS: Record<RoomId, Room> = {
    hull: room('hull', 'The Broken Hull', [0, 2], {
        subtitle: '01 / COLLAPSED ENTRY · 2,840 M', station: { x: 300, y: 850 }, doors: [door('hull', 'bell', 3040, 'AIR BELL')],
        enemies: [mob('hull', 'urchin', 1550), mob('hull', 'jellyfish', 2350, 630)],
        log: 'The surface went quiet six hours ago. Something inside the wreck is still breathing.'
    }),
    bell: room('bell', 'The Air Bell', [1, 2], {
        subtitle: '02 / A BORROWED BREATH', air: [{ x: 700, y: 0, w: 1100, h: 1024 }], station: { x: 900, y: 850 },
        platforms: [platform(0, 850, WIDTH, 174), platform(2200, 640, 260), platform(1130, 500, 500)], anchors: [{ x: 1070, y: 435 }],
        doors: [door('bell', 'hull', 100, 'BROKEN HULL'), door('bell', 'cargo', 3040, 'CARGO HOLD'), door('bell', 'rigging', 1420, 'RIGGING SHAFT', { y: 488, requires: 'harpoon' }), door('bell', 'chapel', 2350, 'DROWNED CHAPEL', { requires: 'key' })],
        log: 'SURVEY NOTE 04 — The bells hold air. The bells also hold voices. Do not answer them.'
    }),
    cargo: room('cargo', 'The Cargo Hold', [2, 2], {
        subtitle: '03 / SOMETHING IN THE CRATES',
        obstacles: [{ id: 'cargo:coral', x: 1210, y: 500, w: 60, h: 90 }],
        doors: [door('cargo', 'bell', 100, 'AIR BELL'), door('cargo', 'armory', 3040, 'ARMORY'), door('cargo', 'handcrab', 1320, 'SCRATCHED BULKHEAD', { hidden: true, y: 578 }), door('cargo', 'ballast', 2450, 'BALLAST SHORTCUT', { requires: 'dash', shortcut: true })],
        pickups: [{ id: 'pearl:cargo', kind: 'health', x: 2640, y: 575 }],
        enemies: [mob('cargo', 'urchin', 780), mob('cargo', 'jellyfish', 1650, 660), mob('cargo', 'urchin', 2100), mob('cargo', 'jellyfish', 2700, 540)],
        log: 'The manifest lists fourteen divers. There are fifteen sets of scratches on the inside of this door.'
    }),
    armory: room('armory', 'The Flooded Armory', [3, 2], {
        subtitle: '04 / A LINE INTO THE DARK', station: { x: 500, y: 850 }, doors: [door('armory', 'cargo', 100, 'CARGO HOLD')],
        pickups: [{ id: 'harpoon', kind: 'harpoon', x: 2600, y: 580 }], enemies: [mob('armory', 'octopus', 1450), mob('armory', 'jellyfish', 2250, 570)],
        log: 'SALVAGE ISSUE 09 — Tethered harpoon. Certified for lifting equipment. Not certified for what is moving below.'
    }),
    rigging: room('rigging', 'The Rigging Shaft', [1, 1], {
        subtitle: '05 / THE BONES OF THE SHIP', anchors: [{ x: 450, y: 450 }, { x: 1170, y: 340 }, { x: 2080, y: 460 }],
        platforms: [platform(0, 850, WIDTH, 174), platform(510, 520, 370), platform(1230, 410, 400), platform(2140, 530, 400)],
        doors: [door('rigging', 'bell', 100, 'AIR BELL', { shortcut: true }), door('rigging', 'infirmary', 3040, 'INFIRMARY')],
        pickups: [{ id: 'pearl:rigging', kind: 'health', x: 1560, y: 365 }],
        enemies: [mob('rigging', 'jellyfish', 1150, 600), mob('rigging', 'shark', 2300, 710), mob('rigging', 'handcrab', 2820)],
        log: 'The cables sway against the current. They are being pulled from the other end.'
    }),
    infirmary: room('infirmary', 'The Infirmary', [2, 1], {
        subtitle: '06 / FIRST SYMPTOMS', station: { x: 450, y: 850 }, air: [{ x: 100, y: 0, w: 650, h: 1024 }],
        doors: [door('infirmary', 'rigging', 100, 'RIGGING SHAFT'), door('infirmary', 'pressure', 3040, 'PRESSURE WORKS', { requires: 'pressure' })],
        pickups: [{ id: 'breach', kind: 'breach', x: 2050, y: 675 }], enemies: [mob('infirmary', 'octopus', 1200), mob('infirmary', 'urchin', 2600)],
        log: 'MEDICAL LOG — The pressure should have crushed his lungs. Instead, something grew around them.'
    }),
    pressure: room('pressure', 'The Pressure Works', [3, 1], {
        subtitle: '07 / BELOW HUMAN TOLERANCE', pressure: true, color: 0x322747,
        obstacles: [{ id: 'pressure:coral', x: 2820, y: 120, w: 74, h: 730 }],
        doors: [door('pressure', 'infirmary', 100, 'INFIRMARY'), door('pressure', 'molt', 3040, 'MOLTING CHAMBER'), door('pressure', 'hermit', 1350, 'HOLLOW MACHINERY', { y: 578, hidden: true })], anchors: [{ x: 1320, y: 500 }],
        enemies: [mob('pressure', 'shark', 1000, 690), mob('pressure', 'octopus', 2050), mob('pressure', 'jellyfish', 2700, 600)],
        log: 'The calcified bulkhead seals the eastern passage. Your knife would never cut it. Your new claw will.'
    }),
    molt: room('molt', 'The Molting Chamber', [4, 1], {
        subtitle: '08 / LEAVE SOMETHING OF YOURSELF', color: 0x3c273e, station: { x: 450, y: 850 },
        doors: [door('molt', 'pressure', 100, 'PRESSURE WORKS'), door('molt', 'ballast', 3040, 'BALLAST DUCT', { requires: 'dash' })],
        pickups: [{ id: 'infestation', kind: 'infestation', x: 2100, y: 675 }], enemies: [mob('molt', 'octopus', 1200), mob('molt', 'urchin', 2600)],
        log: 'The suit falls away. Six legs find the iron. Heat no longer hurts; walls are only another floor.'
    }),
    ballast: room('ballast', 'The Ballast Duct', [4, 2], {
        subtitle: '09 / THROUGH THE RIBS', color: 0x253640,
        platforms: [platform(0, 850, WIDTH, 174), platform(1300, 120, 360, 688), platform(600, 680, 260), platform(2350, 650, 400)],
        doors: [door('ballast', 'molt', 100, 'MOLTING CHAMBER'), door('ballast', 'quarters', 3040, 'OFFICER’S QUARTERS'), door('ballast', 'cargo', 1100, 'CARGO SHORTCUT', { shortcut: true })],
        enemies: [mob('ballast', 'urchin', 800), mob('ballast', 'jellyfish', 2450, 660)],
        log: 'You squeeze through iron that would have trapped you an hour ago. You try not to think about why.'
    }),
    quarters: room('quarters', 'The Officer’s Quarters', [5, 2], {
        subtitle: '10 / ORDERS FROM BELOW', station: { x: 450, y: 850 }, air: [{ x: 0, y: 0, w: 900, h: 1024 }],
        doors: [door('quarters', 'ballast', 100, 'BALLAST DUCT'), door('quarters', 'chapel', 3040, 'DROWNED CHAPEL', { requires: 'key' })],
        pickups: [{ id: 'key', kind: 'key', x: 2640, y: 580 }, { id: 'pearl:quarters', kind: 'health', x: 1420, y: 545 }], enemies: [mob('quarters', 'octopus', 1350), mob('quarters', 'shark', 2200, 690)],
        log: 'CAPTAIN’S ORDER — Seal the chapel. The light at the altar is not ours.'
    }),
    chapel: room('chapel', 'The Drowned Chapel', [2, 3], {
        subtitle: '11 / A LIGHT THAT HUNGERS', color: 0x2d2843, station: { x: 2620, y: 850 },
        platforms: [platform(0, 850, WIDTH, 174), platform(580, 690, 240), platform(1080, 470, 280), platform(1200, 610, 300), platform(1900, 710, 280), platform(2500, 620, 280)],
        pickups: [{ id: 'pearl:chapel', kind: 'health', x: 1310, y: 425 }],
        doors: [door('chapel', 'bell', 100, 'AIR BELL', { shortcut: true }), door('chapel', 'quarters', 1500, 'OFFICER’S QUARTERS'), door('chapel', 'furnace', 3040, 'BLACK SMOKER', { requires: 'heat' })], anchors: [{ x: 1200, y: 410 }],
        enemies: [mob('chapel', 'jellyfish', 750, 660), mob('chapel', 'octopus', 1900)], log: 'The congregation is gone. The lights still move between the pews.'
    }),
    furnace: room('furnace', 'The Black Smoker', [3, 3], {
        subtitle: '12 / WHERE THE SEABED BURNS', volcanic: true, color: 0x4a211d, station: { x: 330, y: 850 },
        doors: [door('furnace', 'chapel', 100, 'DROWNED CHAPEL'), door('furnace', 'caldera', 3040, 'CALDERA VAULT', { requires: 'heat' })],
        heat: [{ x: 700, y: 730, w: 580, h: 120 }, { x: 1740, y: 715, w: 780, h: 135 }],
        enemies: [mob('furnace', 'octopus', 1550), mob('furnace', 'shark', 2250, 650)],
        log: 'The iron glows cherry red. The new shell takes the heat without pain. Keep scuttling.'
    }),
    caldera: room('caldera', 'The Caldera Vault', [4, 3], {
        subtitle: '13 / A FLOOR ABOVE YOUR HEAD', volcanic: true, color: 0x44251e,
        platforms: [platform(0, 850, WIDTH, 174), platform(1150, 500, 100, 350), platform(850, 470, 1450, 30), platform(1950, 500, 100, 350), platform(2450, 620, 350)],
        doors: [door('caldera', 'furnace', 100, 'BLACK SMOKER'), door('caldera', 'angler', 3040, 'ANGLER HOLD')],
        heat: [{ x: 1250, y: 730, w: 700, h: 120 }, { x: 2180, y: 755, w: 680, h: 95 }],
        enemies: [mob('caldera', 'hermit', 2580), mob('caldera', 'jellyfish', 1680, 600)],
        log: 'Press toward a wall to cling. W / S climb; A / D scuttle beneath iron ceilings. Space or Down drops from a ceiling. Climb over the sealed vault to reach the last light.'
    }),
    angler: room('angler', 'The Angler Hold', [5, 3], {
        subtitle: '14 / THE LAST LIGHT', color: 0x172137, doors: [door('angler', 'caldera', 100, 'CALDERA VAULT')],
        enemies: [mob('angler', 'angler', 2260, 640)], anchors: [{ x: 800, y: 400 }, { x: 2400, y: 400 }],
        log: 'A lantern hangs in the darkness. Then the darkness opens its mouth.'
    }),
    handcrab: room('handcrab', 'The Unlisted Diver', [2, 0], {
        subtitle: 'HIDDEN CHAMBER / SALVAGE TEAM 03', color: 0x3b293a, doors: [door('handcrab', 'cargo', 100, 'CARGO HOLD')], enemies: [mob('handcrab', 'handcrab', 2100)],
        log: 'His name is still sewn into the glove. The hand inside has become something else.'
    }),
    hermit: room('hermit', 'A Borrowed Shell', [3, 0], {
        subtitle: 'HIDDEN CHAMBER / SALVAGE TEAM 07', color: 0x342d39, doors: [door('hermit', 'pressure', 100, 'PRESSURE WORKS')], enemies: [mob('hermit', 'hermit', 2100)],
        log: 'A human voice echoes from the shell. It only knows one word: stay.'
    })
};
export const ROOM_IDS = Object.keys(ROOMS) as RoomId[];
export function meetsRequirement(r: Requirement | undefined, s: { harpoon: boolean; evolution: Evolution; key: boolean }): boolean {
    return !r || (r === 'harpoon' ? s.harpoon : r === 'pressure' || r === 'dash' ? s.evolution >= 1 : r === 'heat' ? s.evolution === 2 : s.key);
}
export const REQUIREMENT_LABEL: Record<Requirement, string> = { harpoon: 'Harpoon required', pressure: 'First molt required · lethal pressure', dash: 'First molt required · enhanced Dash', heat: 'Full crab shell required · extreme heat', key: 'Chapel key required' };
export function inside(x: number, y: number, r: Rect): boolean { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
export function segmentRect(ax: number, ay: number, bx: number, by: number, r: Rect): number | null {
    let lo = 0, hi = 1;
    const dx = bx - ax, dy = by - ay;
    for (const [p, q] of [[-dx, ax - r.x], [dx, r.x + r.w - ax], [-dy, ay - r.y], [dy, r.y + r.h - ay]]) {
        if (Math.abs(p) < 0.000001) { if (q < 0) return null; }
        else { const t = q / p; if (p < 0) lo = Math.max(lo, t); else hi = Math.min(hi, t); if (lo > hi) return null; }
    }
    return lo;
}
