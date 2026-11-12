import * as Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../constants';

/**
 * The interface is drawn as HTML over the canvas instead of as Phaser text.
 * The browser lays out and rasterises the type at the screen's real resolution,
 * so menus and the HUD stay sharp at any window size, while the game itself
 * keeps its 1280x720 pixel-art canvas. The layer uses the same 1280x720
 * coordinate space and is scaled to sit exactly on top of the canvas.
 */
let root: HTMLDivElement | undefined;
let observer: ResizeObserver | undefined;

function sync(game: Phaser.Game): void {
    if (!root) return;
    const canvas = game.canvas, parent = root.parentElement;
    if (!canvas || !parent) return;
    const c = canvas.getBoundingClientRect(), p = parent.getBoundingClientRect();
    root.style.left = `${c.left - p.left}px`; root.style.top = `${c.top - p.top}px`;
    root.style.transform = `scale(${c.width / GAME_WIDTH})`;
}

export function uiRoot(game: Phaser.Game): HTMLDivElement {
    if (root?.isConnected) return root;
    root = document.createElement('div');
    root.className = 'ui-root';
    root.style.width = `${GAME_WIDTH}px`; root.style.height = `${GAME_HEIGHT}px`;
    const parent = game.canvas?.parentElement ?? document.body;
    parent.style.position = 'relative';
    parent.appendChild(root);
    const update = () => sync(game);
    observer?.disconnect();
    observer = new ResizeObserver(update); observer.observe(game.canvas); observer.observe(parent);
    game.scale.on(Phaser.Scale.Events.RESIZE, update);
    window.addEventListener('resize', update);
    update(); requestAnimationFrame(update);
    return root;
}

/** Creates a screen-sized layer owned by a scene. It is removed when the scene shuts down. */
export function mountLayer(scene: Phaser.Scene, className: string): HTMLDivElement {
    const layer = el('div', `ui-layer ${className}`);
    uiRoot(scene.game).appendChild(layer);
    const remove = () => layer.remove();
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, remove);
    scene.events.once(Phaser.Scenes.Events.DESTROY, remove);
    return layer;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    parent?.appendChild(node);
    return node;
}

/** Sets text only when it changes, so per-frame HUD updates don't touch the DOM. */
export function setText(node: HTMLElement, text: string): void { if (node.textContent !== text) node.textContent = text; }
export function toggle(node: HTMLElement, className: string, on: boolean): void { if (node.classList.contains(className) !== on) node.classList.toggle(className, on); }

/** A key cap followed by its action, for prompts and control hints. */
export function keyHint(keys: string[], action: string, parent?: HTMLElement): HTMLSpanElement {
    const hint = el('span', 'hint', undefined, parent);
    keys.forEach((k, i) => { if (i) el('span', 'hint-or', '/', hint); el('kbd', 'key', k, hint); });
    el('span', 'hint-action', action, hint);
    return hint;
}
