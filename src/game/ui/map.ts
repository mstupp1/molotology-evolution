import type { GameSnapshot } from '../constants';
import { ROOMS, ROOM_IDS, meetsRequirement, type RoomId } from '../world';

const NS = 'http://www.w3.org/2000/svg';
const HIDDEN = new Set<RoomId>(['handcrab', 'hermit']);
const GOLD = '#c9a668', GOLD_HI = '#f0d9a6', TEAL = '#72bcae', BLOOD = '#c4554a';

export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, parent?: Element): SVGElementTagNameMap[K] {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    parent?.appendChild(node);
    return node;
}

/**
 * Draws the surveyed wreck into an <svg>. Explored chambers are solid, chambers
 * seen through an open door are outlined, and sealed passages carry a red mark.
 */
export function drawMap(root: SVGSVGElement, data: GameSnapshot, sx: number, sy: number, full: boolean): void {
    root.replaceChildren();
    const explored = new Set(data.explored), visible = new Set<RoomId>(data.explored);
    for (const id of data.explored) for (const door of ROOMS[id].doors) if (!HIDDEN.has(door.to)) visible.add(door.to);
    const w = sx * 0.78, h = sy * (full ? 0.6 : 0.62), pad = full ? 0 : 10;
    const pos = (id: RoomId) => ({ x: pad + ROOMS[id].map[0] * sx, y: pad + ROOMS[id].map[1] * sy });
    const links = svg('g', {}, root), rooms = svg('g', {}, root);
    for (const id of ROOM_IDS) {
        if (!explored.has(id)) continue;
        const a = pos(id);
        for (const d of ROOMS[id].doors) {
            if (!visible.has(d.to)) continue;
            const b = pos(d.to), open = meetsRequirement(d.requires, data);
            svg('line', { x1: a.x + w / 2, y1: a.y + h / 2, x2: b.x + w / 2, y2: b.y + h / 2, stroke: open ? '#5d6f6c' : '#8a4a45', 'stroke-width': full ? 2 : 1.5 }, links);
            if (!open) {
                const cx = (a.x + b.x + w) / 2, cy = (a.y + b.y + h) / 2, r = full ? 5 : 3;
                svg('rect', { x: cx - r, y: cy - r, width: r * 2, height: r * 2, fill: BLOOD, transform: `rotate(45 ${cx} ${cy})` }, links);
            }
        }
    }
    for (const id of ROOM_IDS) {
        if (!visible.has(id)) continue;
        const r = ROOMS[id], p = pos(id), known = explored.has(id), current = id === data.room;
        svg('rect', { x: p.x, y: p.y, width: w, height: h, fill: current ? '#3a3326' : known ? '#1d2224' : '#0b0d0f', stroke: current ? GOLD : known ? '#6d7470' : '#3a3d3b', 'stroke-width': current ? 2 : 1, 'stroke-dasharray': known ? '' : '3 3' }, rooms);
        if (known && r.station) {
            const cx = p.x + (full ? 13 : 6), cy = p.y + (full ? 13 : 6), rad = full ? 5 : 2.6;
            svg('circle', { cx, cy, r: rad, fill: data.checkpoint === id ? TEAL : 'none', stroke: TEAL, 'stroke-width': full ? 1.5 : 1.2 }, rooms);
        }
        if (current) {
            const cx = p.x + Math.max(5, Math.min(w - 5, data.position.x * w)), cy = p.y + Math.max(5, Math.min(h - 5, data.position.y * h));
            svg('circle', { cx, cy, r: full ? 9 : 5, fill: GOLD_HI, opacity: 0.25 }, rooms);
            svg('circle', { cx, cy, r: full ? 4 : 2.6, fill: GOLD_HI }, rooms);
        }
        if (full) {
            const label = svg('text', { x: p.x + w / 2, y: p.y + h + 20, 'text-anchor': 'middle', class: `map-label${known ? '' : ' unknown'}${current ? ' current' : ''}` }, rooms);
            label.textContent = known ? r.name.replace(/^The /, '') : 'Unsurveyed';
        }
    }
}

export function legendIcon(kind: 'you' | 'station' | 'sealed' | 'room'): SVGSVGElement {
    const root = svg('svg', { width: 18, height: 18, viewBox: '0 0 18 18' });
    if (kind === 'you') { svg('circle', { cx: 9, cy: 9, r: 8, fill: GOLD_HI, opacity: 0.25 }, root); svg('circle', { cx: 9, cy: 9, r: 4, fill: GOLD_HI }, root); }
    if (kind === 'station') svg('circle', { cx: 9, cy: 9, r: 5, fill: 'none', stroke: TEAL, 'stroke-width': 1.5 }, root);
    if (kind === 'sealed') svg('rect', { x: 5, y: 5, width: 8, height: 8, fill: BLOOD, transform: 'rotate(45 9 9)' }, root);
    if (kind === 'room') svg('rect', { x: 1, y: 3, width: 16, height: 12, fill: 'rgba(10,12,14,0.6)', stroke: '#3a3d3b', 'stroke-dasharray': '3 3' }, root);
    return root;
}
