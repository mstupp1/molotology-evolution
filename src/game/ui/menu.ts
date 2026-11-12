import { el } from './layer';

export interface MenuItem { label: string; action: () => void; note?: string }

/**
 * A vertical list of choices. The selected entry is lit by a soft band and
 * flanking marks; the rest sit back in ash. Keyboard and gamepad input are
 * wired by the owning scene through move() and confirm().
 */
export class Menu {
    readonly element: HTMLDivElement;
    private rows: HTMLDivElement[] = [];
    private items: MenuItem[] = [];
    selected = 0;
    constructor(parent: HTMLElement, items: MenuItem[], align: 'center' | 'left' = 'center', private onMove?: () => void) {
        this.element = el('div', `menu menu-${align}`, undefined, parent);
        this.element.setAttribute('role', 'menu');
        items.forEach(item => this.add(item));
        this.select(0, true);
    }
    add(item: MenuItem): void {
        const i = this.rows.length;
        const row = el('div', 'menu-item', undefined, this.element);
        row.setAttribute('role', 'menuitem');
        el('span', 'menu-label', item.label, row);
        if (item.note) el('span', 'menu-note', item.note, row);
        row.addEventListener('pointerenter', () => this.select(i));
        row.addEventListener('pointerdown', event => { event.preventDefault(); event.stopPropagation(); this.select(i, true); this.confirm(); });
        this.rows.push(row); this.items.push(item);
    }
    get length(): number { return this.rows.length; }
    select(index: number, silent = false): void {
        if (!this.rows.length) return;
        const next = (index + this.rows.length) % this.rows.length;
        if (next !== this.selected && !silent) this.onMove?.();
        this.selected = next;
        this.rows.forEach((row, n) => row.classList.toggle('selected', n === this.selected));
    }
    move(delta: number): void { this.select(this.selected + delta); }
    confirm(): void { this.items[this.selected]?.action(); }
    setLabel(index: number, label: string, note?: string): void {
        const row = this.rows[index]; if (!row) return;
        row.querySelector('.menu-label')!.textContent = label;
        let n = row.querySelector<HTMLElement>('.menu-note');
        if (note && !n) n = el('span', 'menu-note', '', row);
        if (n) { n.textContent = note ?? ''; n.style.display = note ? '' : 'none'; }
    }
}
