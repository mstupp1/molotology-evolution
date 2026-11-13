import { test, expect } from '@playwright/test';
import { advance, start, fixture, place, crawlExit } from './update-helpers.mjs';
test.setTimeout(90000);
const browserErrors = new WeakMap();
test.beforeEach(({ page }) => {
    const errors = []; browserErrors.set(page, errors);
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
});
test.afterEach(({ page }) => { expect(browserErrors.get(page)).toEqual([]); });
const read = page => page.evaluate(() => {
    const s = window.__MOLOTOLOGY__.scene.keys.Game, p = s.player;
    return { x: p.centerX, y: p.centerY, feet: p.feet, state: p.state, surface: p.surface, health: s.survival.health, room: s.room.id };
});

test('W jumps, S dashes horizontally, and afterimages match each form', async ({ page }) => {
    await start(page);
    for (const form of [0, 1, 2]) {
        await fixture(page, 'hull', form); await place(page, 450, 850);
        await page.keyboard.down('w'); await advance(page, 10);
        expect((await read(page)).y).toBeLessThan(790);
        await page.keyboard.up('w'); await advance(page, 100);
        await place(page, 450, 850);
        await page.keyboard.press('s'); await advance(page, 4);
        expect((await read(page)).x).toBeGreaterThan(470);
        const ghosts = await page.evaluate(() => {
            const s = window.__MOLOTOLOGY__.scene.keys.Game, v = s.player.visual;
            return s.children.list.filter(o => o.getData?.('dash-ghost')).map(g => ({ origin: g.originY, target: v.originY, rotation: g.rotation, y: g.y, playerY: v.y }));
        });
        expect(ghosts.length).toBeGreaterThan(0);
        for (const g of ghosts) { expect(g.origin).toBe(g.target); expect(Math.abs(g.y - g.playerY)).toBeLessThan(4); expect(g.rotation).toBe(0); }
        await page.screenshot({ animations: 'disabled', path: `art/qa/update-dash-${form}.png` });
    }
});

test('final molt immediately unequips an active harpoon and Continue equips bubbles', async ({ page }) => {
    await start(page); await fixture(page, 'molt', 1); await place(page, 2100, 710);
    await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.harpoon.throw(1, 0));
    await page.keyboard.press('e'); await advance(page, 1);
    expect(await page.evaluate(() => { const s = window.__MOLOTOLOGY__.scene.keys.Game; return [s.progress.evolution, s.harpoon.mode, s.harpoon.weapon.visible, s.harpoon.head.visible, s.progress.harpoon]; })).toEqual([2, 'ready', false, false, true]);
    await page.reload(); await page.waitForFunction(() => window.__MOLOTOLOGY__?.scene.isActive('MainMenu'));
    await page.keyboard.press('Enter'); await page.waitForFunction(() => window.__MOLOTOLOGY__.scene.isActive('Hud')); await advance(page, 100);
    expect(await page.locator('.form-kit').textContent()).toContain('Bubble Shot');
    expect(await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.harpoon.weapon.visible)).toBe(false);
});

test('charged bubbles hit the lantern in both facings once, and melee shares the weak-spot bonus', async ({ page }) => {
    await start(page);
    for (const flip of [false, true]) {
        await fixture(page, 'angler');
        const aim = await page.evaluate(flip => {
            const s = window.__MOLOTOLOGY__.scene.keys.Game, e = s.enemies.list[0], p = s.player;
            e.setPosition(1700, 550).setFlipX(flip).setFrame(0); e.body.updateFromGameObject(); e.body.moves = false; e.anims.stop();
            const r = e.weakSpot, x = r.x + r.w / 2, y = r.y + r.h / 2;
            p.resetAt(x + (flip ? 300 : -300), y + 22); p.body.allowGravity = false;
            window.__hits = []; const hit = s.enemies.hit.bind(s.enemies);
            s.enemies.hit = (...args) => { const result = hit(...args); if (result) window.__hits.push(result); return result; };
            return { x, y };
        }, flip);
        await advance(page, 1);
        const screen = await page.evaluate(aim => { const c = window.__MOLOTOLOGY__.scene.keys.Game.cameras.main; return { x: aim.x - c.scrollX, y: aim.y - c.scrollY }; }, aim);
        await page.mouse.move(screen.x, screen.y); await page.mouse.down({ button: 'right' }); await advance(page, 45); await page.mouse.up({ button: 'right' }); await advance(page, 45);
        expect(await page.evaluate(() => window.__hits)).toEqual([{ damage: 129, weak: true }]);
        expect(await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.bubbleShot.projectiles.countActive())).toBe(0);
        await page.screenshot({ animations: 'disabled', path: `art/qa/update-lantern-${flip}.png` });
    }
    await fixture(page, 'angler');
    await page.evaluate(() => { const s = window.__MOLOTOLOGY__.scene.keys.Game, e = s.enemies.list[0]; e.setPosition(1700, 550).setFlipX(false).setFrame(0); e.body.updateFromGameObject(); e.body.moves = false; e.anims.stop(); const r = e.weakSpot; s.player.resetAt(r.x - 60, r.y + r.h / 2 + 22); s.player.body.allowGravity = false; s.player.facing = 1; });
    await page.keyboard.press('j'); await advance(page, 40);
    expect(await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.enemies.list[0].health)).toBe(820 - 54);
});

test('bubble sweeps stop at terrain and ordinary body hits do normal damage', async ({ page }) => {
    await start(page); await fixture(page, 'angler');
    await page.evaluate(() => { const s = window.__MOLOTOLOGY__.scene.keys.Game, e = s.enemies.list[0]; e.setPosition(1650, 690); e.body.updateFromGameObject(); e.body.moves = false; s.player.resetAt(1300, 742); s.player.body.allowGravity = false; s.bubbleShot.fire(1, 0); });
    await advance(page, 60);
    expect(await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.enemies.list[0].health)).toBe(820 - 32);
    await fixture(page, 'ballast'); await place(page, 550, 700);
    await page.evaluate(() => { const s = window.__MOLOTOLOGY__.scene.keys.Game; s.player.body.allowGravity = false; s.bubbleShot.fire(1, 0); });
    await advance(page, 45);
    expect(await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.bubbleShot.projectiles.countActive())).toBe(0);
});

test('each late passage needs climbing and ceiling crawling; S climbs without detaching', async ({ page }) => {
    await start(page);
    for (const room of ['ballast', 'chapel', 'caldera']) {
        await fixture(page, room);
        // A direct jump/dash to the exit cannot operate the crawling vent.
        await page.evaluate(() => { const s = window.__MOLOTOLOGY__.scene.keys.Game, d = s.room.doors.find(d => d.crawl); s.player.resetAt(d.x, d.y); });
        await page.keyboard.press('e'); await advance(page, 20); expect((await read(page)).room).toBe(room);
        await crawlExit(page, room);
        expect((await read(page)).room).toBe({ ballast: 'quarters', chapel: 'furnace', caldera: 'angler' }[room]);
    }
    await fixture(page, 'ballast'); await place(page, 616, 780);
    await page.keyboard.down('d'); await advance(page, 22); await page.keyboard.up('d');
    await page.keyboard.down('w'); await advance(page, 30); await page.keyboard.up('w'); const up = await read(page);
    await page.keyboard.down('s'); await advance(page, 20); await page.keyboard.up('s');
    expect((await read(page)).surface).toBe('right'); expect((await read(page)).y).toBeGreaterThan(up.y + 30);
    await page.keyboard.press('Space'); await advance(page, 4);
    expect((await read(page)).state).not.toBe('Dash');
});

test('octopus extends fully past close targets and sharks use shorter recovery intervals', async ({ page }) => {
    await start(page); await fixture(page, 'armory', 1);
    const reach = await page.evaluate(() => {
        const s = window.__MOLOTOLOGY__.scene.keys.Game, e = s.enemies.list.find(e => e.kind === 'octopus');
        e.stun = 0; e.mode = 'strike'; e.timer = 0.175; e.target.set(e.x + 25, e.y); s.enemies.update(0, s.player);
        return s.enemies.tentacles.get(e).displayWidth;
    });
    expect(reach).toBeCloseTo(380, 0);
    await fixture(page, 'rigging');
    const timings = await page.evaluate(() => {
        const s = window.__MOLOTOLOGY__.scene.keys.Game, e = s.enemies.list.find(e => e.kind === 'shark');
        e.stun = 0; e.mode = 'strike'; e.timer = 0; s.enemies.update(0, s.player); const recovery = e.timer;
        e.timer = 0; s.enemies.update(0, s.player); return { recovery, patrol: e.timer };
    });
    expect(timings).toEqual({ recovery: 0.45, patrol: 0.35 });
});

test('Angler rotates attacks, makes four bounded frenzy passes and releases one damaging pulse', async ({ page }) => {
    await start(page); await fixture(page, 'angler');
    await page.evaluate(() => {
        const s = window.__MOLOTOLOGY__.scene.keys.Game, e = s.enemies.list[0];
        e.setPosition(1700, 600); e.body.updateFromGameObject(); e.stun = 0; e.timer = 0; e.cycles = 0;
        s.player.resetAt(1400, 740); s.player.body.allowGravity = false;
        window.__attacks = []; window.__passes = []; window.__bounds = [];
        s.events.on('postupdate', () => {
            if (e.mode === 'strike') {
                if (window.__attacks.at(-1) !== e.attack) window.__attacks.push(e.attack);
                if (e.attack === 'frenzy') { if (window.__passes.at(-1) !== e.passes) window.__passes.push(e.passes); window.__bounds.push([e.x - e.displayWidth / 2, e.x + e.displayWidth / 2, e.y - e.displayHeight / 2, e.y + e.displayHeight / 2]); }
            }
        });
    });
    await advance(page, 1450);
    expect((await page.evaluate(() => window.__attacks)).slice(0, 3)).toEqual(['lunge', 'frenzy', 'pulse']);
    expect((await page.evaluate(() => window.__passes)).slice(0, 4)).toEqual([1, 2, 3, 4]);
    const bounds = await page.evaluate(() => window.__bounds);
    expect(bounds.length).toBeGreaterThan(20);
    for (const [left, right, top, bottom] of bounds) { expect(left).toBeGreaterThanOrEqual(-1); expect(right).toBeLessThanOrEqual(3201); expect(top).toBeGreaterThanOrEqual(-1); expect(bottom).toBeLessThanOrEqual(1025); }
    await fixture(page, 'angler');
    await page.evaluate(() => {
        const s = window.__MOLOTOLOGY__.scene.keys.Game, e = s.enemies.list[0];
        e.setPosition(1700, 650); e.body.updateFromGameObject(); e.stun = 0; e.timer = 0; e.cycles = 2;
        s.player.resetAt(1400, 672); s.player.body.allowGravity = false; s.survival.invulnerable = 0;
    });
    await advance(page, 40); expect(await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.enemies.list[0].mode)).toBe('windup');
    await page.screenshot({ animations: 'disabled', path: 'art/qa/update-lantern-charge.png' });
    await advance(page, 30); expect((await read(page)).health).toBe(72);
    await page.screenshot({ animations: 'disabled', path: 'art/qa/update-lantern-pulse.png' });
    await advance(page, 18); expect((await read(page)).health).toBe(72);
});

test('all four unique lost divers leap through internal platforms and return to the floor', async ({ page }) => {
    await start(page); const textures = [];
    for (const room of ['handcrab', 'hermit', 'rigging', 'molt']) {
        await fixture(page, room);
        textures.push(await page.evaluate(() => {
            const s = window.__MOLOTOLOGY__.scene.keys.Game, e = s.enemies.list.find(e => e.boss);
            e.setPosition(2100, 770); e.body.updateFromGameObject(); e.stun = 0; e.timer = 0; e.cycles = e.spec.visual === 'rigging-diver' ? 0 : 1;
            s.player.resetAt(1430, 500); s.player.body.allowGravity = false;
            window.__leap = []; s.events.on('postupdate', () => { if (e.attack === 'leap' && e.mode === 'strike') window.__leap.push({ y: e.y, x: e.x, blocked: e.body.blocked.up }); });
            return e.texture.key;
        }));
        await advance(page, 100);
        const leap = await page.evaluate(() => window.__leap);
        expect(leap.length).toBeGreaterThan(30); expect(Math.min(...leap.map(p => p.y))).toBeLessThan(560); expect(leap.every(p => !p.blocked)).toBe(true);
        await page.screenshot({ animations: 'disabled', path: `art/qa/update-diver-${room}.png` });
        await advance(page, 200);
        const feet = await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.enemies.list.find(e => e.boss).body.bottom);
        expect(feet).toBeLessThanOrEqual(851);
    }
    expect(new Set(textures).size).toBe(4);
    // The leap remains large when the target is standing on the same floor.
    await fixture(page, 'handcrab');
    await page.evaluate(() => {
        const s = window.__MOLOTOLOGY__.scene.keys.Game, e = s.enemies.list[0];
        e.stun = 0; e.timer = 0; e.cycles = 1; s.player.resetAt(1450, 850);
        window.__groundLeapPeak = 1000;
        s.events.on('postupdate', () => { if (e.attack === 'leap' && e.mode === 'strike') window.__groundLeapPeak = Math.min(window.__groundLeapPeak, e.y); });
    });
    await advance(page, 150);
    expect(await page.evaluate(() => window.__groundLeapPeak)).toBeLessThan(600);
});

test('early heat is avoidable, rewards and shortcut require final form, and key still gates the boss', async ({ page }) => {
    await start(page);
    for (const form of [0, 1, 2]) {
        await fixture(page, 'cargo', form);
        await place(page, 2290, 620); await page.keyboard.press('e'); await advance(page, 2);
        expect(await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.progress.collected.includes('pearl:cargo-thermal'))).toBe(form === 2);
        await place(page, 2330, 620); await page.keyboard.press('e'); await advance(page, 20);
        expect((await read(page)).room).toBe(form === 2 ? 'furnace' : 'cargo');
    }
    await fixture(page, 'caldera'); await page.evaluate(() => { const s = window.__MOLOTOLOGY__.scene.keys.Game; s.progress.key = false; s.player.resetAt(2910, 244); });
    await page.keyboard.press('e'); await advance(page, 20); expect((await read(page)).room).toBe('caldera');
});

test('lantern hitboxes follow every animation frame, and harpoons use the same weak-spot resolver', async ({ page }) => {
    await start(page); await fixture(page, 'angler');
    await page.evaluate(() => { const s = window.__MOLOTOLOGY__.scene.keys.Game, e = s.enemies.list[0]; e.health = 3000; e.setPosition(1700, 500); e.body.moves = false; e.anims.stop(); window.__poseHits = []; const hit = s.enemies.hit.bind(s.enemies); s.enemies.hit = (...args) => { const r = hit(...args); if (r) window.__poseHits.push(r); return r; }; });
    for (const flip of [false, true]) for (let frame = 0; frame < 12; frame++) {
        await page.evaluate(({ flip, frame }) => {
            const s = window.__MOLOTOLOGY__.scene.keys.Game, e = s.enemies.list[0];
            e.stun = 1000; e.setFlipX(flip).setFrame(frame); e.anims.stop(); e.body.updateFromGameObject();
            const r = e.weakSpot; s.player.resetAt(r.x + r.w / 2 + (flip ? 180 : -180), r.y + r.h / 2 + 22); s.player.body.allowGravity = false;
            s.bubbleShot.cooldown = 0; s.bubbleShot.fire(flip ? -1 : 1, 0);
        }, { flip, frame });
        await advance(page, 24);
    }
    const hits = await page.evaluate(() => window.__poseHits);
    expect(hits).toHaveLength(24); expect(hits.every(h => h.weak && h.damage === 48)).toBe(true);
    await fixture(page, 'angler', 1);
    await page.evaluate(() => {
        const s = window.__MOLOTOLOGY__.scene.keys.Game, e = s.enemies.list[0]; e.setPosition(1700, 500).setFrame(0).setFlipX(false); e.anims.stop(); e.body.moves = false; e.body.updateFromGameObject();
        const r = e.weakSpot; s.player.resetAt(r.x + r.w / 2 - 180, r.y + r.h / 2 + 43); s.player.body.allowGravity = false; s.player.facing = 1;
        s.harpoon.tickCharge(0.75, true); s.harpoon.tickCharge(0, false); s.harpoon.throw(1, 0);
    });
    await advance(page, 24);
    expect(await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.enemies.list[0].health)).toBe(820 - 111);
});

test('early lava can be jumped over, hurts early forms, and is harmless to the final shell', async ({ page }) => {
    await start(page); await fixture(page, 'cargo', 0); await place(page, 1720, 850);
    const lavaBefore = await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.view.lava.time);
    await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.survival.invulnerable = 0);
    await page.keyboard.down('d'); await page.keyboard.down('w'); await advance(page, 100); await page.keyboard.up('d'); await page.keyboard.up('w');
    expect((await read(page)).health).toBe(100); expect((await read(page)).x).toBeGreaterThan(2000);
    expect(await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.view.lava.time)).not.toEqual(lavaBefore);
    for (const form of [0, 1, 2]) {
        await fixture(page, 'armory', form); await place(page, 1850, 850);
        await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.survival.invulnerable = 0); await advance(page, 12);
        expect((await read(page)).health).toBe(form === 2 ? 100 : 82);
    }
});

test('bubble simulation pauses cleanly, room restarts do not leak, and boss death clears attacks', async ({ page }) => {
    await start(page); await fixture(page, 'angler'); await place(page, 800, 760);
    await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.bubbleShot.fire(1, 0)); await advance(page, 3);
    await page.keyboard.press('Escape'); await advance(page, 1);
    const paused = await page.evaluate(() => { const s = window.__MOLOTOLOGY__.scene.keys.Game; return [s.bubbleShot.projectiles.getFirstAlive().x, s.survival.oxygen]; });
    await advance(page, 90);
    expect(await page.evaluate(() => { const s = window.__MOLOTOLOGY__.scene.keys.Game; return [s.bubbleShot.projectiles.getFirstAlive().x, s.survival.oxygen]; })).toEqual(paused);
    await page.keyboard.press('Escape'); await advance(page, 90);
    expect(await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.bubbleShot.projectiles.countActive())).toBe(0);
    for (let i = 0; i < 3; i++) await fixture(page, 'angler');
    expect(await page.evaluate(() => { const e = window.__MOLOTOLOGY__.events; return [e.listenerCount('game:snapshot'), e.listenerCount('ui:command')]; })).toEqual([1, 2]);
    await page.evaluate(() => { const s = window.__MOLOTOLOGY__.scene.keys.Game, e = s.enemies.list[0]; e.attack = 'pulse'; e.mode = 'windup'; e.timer = 0.1; s.enemies.shoot(e, s.player, 1); s.enemies.hit(e, 10000, 1); });
    await advance(page, 30);
    expect(await page.evaluate(() => { const s = window.__MOLOTOLOGY__.scene.keys.Game; return [s.progress.completed, s.enemies.projectiles.countActive(), s.enemies.fx.lights().length]; })).toEqual([true, 0, 0]);
});
