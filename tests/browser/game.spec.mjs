import { test, expect } from '@playwright/test';

async function start(page) {
    await page.goto('/');
    await page.waitForFunction(() => window.__MOLOTOLOGY__?.scene.isActive('MainMenu'));
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__MOLOTOLOGY__.scene.isActive('Game') && window.__MOLOTOLOGY__.scene.isActive('Hud'));
    await page.waitForTimeout(650);
}
async function state(page) {
    return page.evaluate(() => {
        const g = window.__MOLOTOLOGY__, s = g.scene.keys.Game, p = s.player;
        return { room: s.room.id, x: p.x, y: p.y, feet: p.feet, bodyHeight: p.body.height, health: s.survival.health, oxygen: s.survival.oxygen, harpoon: s.progress.harpoon, evolution: s.progress.evolution, key: s.progress.key, state: p.state, paused: g.scene.isPaused('Game'), completed: s.progress.completed, defeated: s.progress.defeated, fps: g.loop.actualFps };
    });
}
async function fixture(page, room, upgrades = {}) {
    const serial = await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.runSerial);
    await page.evaluate(({ room, upgrades }) => {
        const s = window.__MOLOTOLOGY__.scene.keys.Game;
        Object.assign(s.progress, upgrades); s.scene.restart({ progress: s.progress, room });
    }, { room, upgrades });
    await page.waitForFunction(({room,serial}) => window.__MOLOTOLOGY__.scene.keys.Game.room?.id === room && window.__MOLOTOLOGY__.scene.keys.Game.runSerial > serial && window.__MOLOTOLOGY__.scene.isActive('Hud'), {room,serial});
    await page.waitForTimeout(120);
}
async function place(page, x, feet) { await page.evaluate(({ x, feet }) => window.__MOLOTOLOGY__.scene.keys.Game.player.resetAt(x, feet), { x, feet }); await page.waitForTimeout(60); }
async function pickup(page, room, x, feet, upgrades = {}) {
    await fixture(page, room, upgrades); await place(page, x, feet); await page.keyboard.press('e'); await page.waitForTimeout(120);
}
async function travel(page, destination, blocked = false) {
    await page.evaluate(destination => { const s = window.__MOLOTOLOGY__.scene.keys.Game, d = s.room.doors.find(d => d.to === destination); s.player.resetAt(d.x, d.y + 12); }, destination);
    await page.waitForTimeout(80); await page.keyboard.press('e');
    if (blocked) await page.waitForTimeout(220);
    else await expect.poll(async () => (await state(page)).room, {timeout:5000}).toBe(destination);
}

test('keyboard movement, variable jump, map pause and restart cleanup', async ({ page }) => {
    const errors = []; page.on('pageerror', e => { errors.push(e.message); console.log('BROWSER ERROR', e.stack); });
    await start(page); const initial = await state(page);
    await page.keyboard.down('d'); await expect.poll(async () => (await state(page)).x, {timeout:5000}).toBeGreaterThan(initial.x + 70); await page.keyboard.up('d');
    expect((await state(page)).x).toBeGreaterThan(initial.x + 65);
    await page.keyboard.down('Space'); await expect.poll(async () => (await state(page)).y).toBeLessThan(initial.y - 45); await page.keyboard.up('Space');
    expect((await state(page)).y).toBeLessThan(initial.y - 45);
    await page.keyboard.press('m', {delay:70}); await expect.poll(async () => (await state(page)).paused).toBe(true); const paused = await state(page);
    expect(paused.paused).toBe(true); await page.waitForTimeout(400); expect((await state(page)).oxygen).toBe(paused.oxygen);
    await page.screenshot({ path: 'art/qa/map.png' });
    await page.keyboard.press('m', {delay:70}); await expect.poll(async () => (await state(page)).paused).toBe(false); expect((await state(page)).paused).toBe(false);
    for (let i = 0; i < 3; i++) await fixture(page, 'hull');
    expect(await page.evaluate(() => { const e = window.__MOLOTOLOGY__.events; return [e.listenerCount('game:snapshot'), e.listenerCount('ui:command')]; })).toEqual([1, 2]);
    expect(errors).toEqual([]);
});

test('station refill, local Continue and death preserve discovered abilities', async ({ page }) => {
    await start(page);
    await pickup(page, 'armory', 2600, 620);
    expect((await state(page)).harpoon).toBe(true);
    await fixture(page, 'armory'); await place(page, 500, 850);
    await page.evaluate(() => { const s = window.__MOLOTOLOGY__.scene.keys.Game; s.survival.health = 20; s.survival.oxygen = 5; });
    await page.keyboard.press('e'); await expect.poll(async () => (await state(page)).health).toBe(100);
    expect((await state(page)).health).toBe(100); await expect.poll(async () => (await state(page)).oxygen, { timeout: 4000 }).toBeGreaterThan(80);
    await page.reload(); await page.waitForFunction(() => window.__MOLOTOLOGY__?.scene.isActive('MainMenu'));
    await page.keyboard.press('Enter'); await page.waitForFunction(() => window.__MOLOTOLOGY__.scene.isActive('Game'));
    expect((await state(page)).room).toBe('armory'); expect((await state(page)).harpoon).toBe(true);
    await page.evaluate(() => { window.__MOLOTOLOGY__.scene.keys.Game.survival.health = 0; });
    await expect.poll(async () => (await state(page)).health, {timeout:7000}).toBe(100); expect((await state(page)).harpoon).toBe(true);
});

test('Harpoon pulls to the mandatory high ledge without passing through platforms', async ({ page }) => {
    await start(page); await fixture(page, 'bell', { harpoon: true }); await place(page, 900, 850);
    await page.waitForTimeout(400);
    const anchor = await page.evaluate(() => { const s = window.__MOLOTOLOGY__.scene.keys.Game, a = s.room.anchors[0]; return { x: a.x - s.cameras.main.scrollX, y: a.y - s.cameras.main.scrollY }; });
    await page.mouse.move(anchor.x, anchor.y); await page.mouse.down({ button: 'right' }); await page.waitForTimeout(200); await page.mouse.up({ button: 'right' });
    await expect.poll(async () => (await state(page)).x, { timeout: 6000 }).toBeGreaterThan(1130);
    await expect.poll(async () => (await state(page)).feet, { timeout: 4000 }).toBeCloseTo(500, 0);
    await page.screenshot({ path: 'art/qa/grapple.png' });
    await travel(page, 'rigging'); expect((await state(page)).room).toBe('rigging');
});

test('first molt, pressure gate, second molt, physical Dash duct and chapel key', async ({ page }) => {
    await start(page); await fixture(page, 'infirmary', { harpoon: true });
    await travel(page, 'pressure', true); expect((await state(page)).room).toBe('infirmary');
    await place(page, 2050, 710); await page.keyboard.press('e'); await expect.poll(async () => (await state(page)).evolution).toBe(1);
    await travel(page, 'pressure'); expect((await state(page)).room).toBe('pressure');
    await travel(page, 'molt'); expect((await state(page)).room).toBe('molt');
    await place(page, 2100, 710); await page.keyboard.press('e'); await expect.poll(async () => (await state(page)).evolution).toBe(2);
    await travel(page, 'ballast'); expect((await state(page)).room).toBe('ballast');
    await place(page, 1230, 850); await page.keyboard.down('d'); await page.keyboard.press('Shift'); await expect.poll(async () => (await state(page)).x, {timeout:7000}).toBeGreaterThan(1720); await page.keyboard.up('d'); await page.waitForTimeout(100);
    const escaped = await state(page); expect(escaped.x).toBeGreaterThan(1700); expect(escaped.bodyHeight).toBe(86);
    await travel(page, 'quarters'); expect((await state(page)).room).toBe('quarters');
    await place(page, 2640, 620); await page.keyboard.press('e'); await expect.poll(async () => (await state(page)).key).toBe(true);
    await travel(page, 'chapel'); expect((await state(page)).room).toBe('chapel');
});

test('every enemy room renders, hidden miniboss rewards persist, and Angler victory is explorable', async ({ page }) => {
    const errors = []; page.on('pageerror', e => { errors.push(e.message); console.log('BROWSER ERROR', e.stack); }); await start(page);
    for (const room of ['cargo', 'armory', 'rigging', 'infirmary', 'pressure', 'molt', 'ballast', 'quarters', 'chapel', 'handcrab', 'hermit', 'angler']) {
        await fixture(page, room, { harpoon: true, evolution: 2, key: true });
        await page.waitForTimeout(120); expect((await state(page)).room).toBe(room);
    }
    for (const room of ['handcrab', 'hermit', 'angler']) {
        await fixture(page, room);
        await page.evaluate(() => { const s = window.__MOLOTOLOGY__.scene.keys.Game, e = s.enemies.list.find(e => e.boss); e.health = 1; e.timer = 10; s.player.resetAt(e.x - e.displayWidth * .3 - 45, e.y + 43); });
        await page.keyboard.press('j'); await expect.poll(async () => (await state(page)).defeated.length).toBe(room === 'handcrab' ? 1 : room === 'hermit' ? 2 : 3);
        expect((await state(page)).defeated.length).toBe(room === 'handcrab' ? 1 : room === 'hermit' ? 2 : 3);
    }
    expect((await state(page)).completed).toBe(true);
    await page.waitForFunction(() => window.__MOLOTOLOGY__.scene.isActive('GameOver'));
    await page.waitForTimeout(1500); await page.screenshot({ path: 'art/qa/victory.png' }); await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__MOLOTOLOGY__.scene.isActive('Game')); expect((await state(page)).room).toBe('angler');
    expect(errors).toEqual([]);
});

test('simulated gamepad covers movement, jump, dodge, aim-release and pause/resume', async ({ page }) => {
    await page.addInitScript(() => {
        window.__pad = { id: 'Virtual standard controller', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0,0,0,0], buttons: Array.from({length:17}, () => ({pressed:false,touched:false,value:0})) };
        Object.defineProperty(navigator, 'getGamepads', { value: () => [window.__pad] });
    });
    await start(page); const initial = await state(page);
    const button = async (n, down) => { await page.evaluate(({n,down}) => { window.__pad.buttons[n] = {pressed:down,touched:down,value:down?1:0}; }, {n,down}); await page.waitForTimeout(80); };
    await page.evaluate(() => { window.__pad.axes[0] = 1; });
    await expect.poll(async () => (await state(page)).x, { timeout: 5000 }).toBeGreaterThan(initial.x + 50);
    await page.evaluate(() => { window.__pad.axes[0] = 0; });
    await page.waitForTimeout(300); const grounded = await state(page);
    await button(0, true); await expect.poll(async () => (await state(page)).y, { timeout: 3000 }).toBeLessThan(grounded.y - 30); await button(0, false);
    await expect.poll(async () => (await state(page)).state, { timeout: 4000 }).toMatch(/Idle|Walk/);
    await button(1, true); await expect.poll(async () => (await state(page)).state, { timeout: 2000 }).toBe('Dodge'); await button(1, false);
    await button(9, true); await expect.poll(async () => (await state(page)).paused).toBe(true); await button(9, false); await button(9, true); await button(9, false); await expect.poll(async () => (await state(page)).paused).toBe(false);
    await fixture(page, 'bell', { harpoon:true });
    await page.evaluate(() => { window.__pad.axes[2] = .4; window.__pad.axes[3] = -.9; });
    await button(7, true); expect((await state(page)).state).toBe('HarpoonAim'); await button(7, false);
    expect(await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.harpoon.mode)).not.toBe('ready');
});

test('v2: vital pearls raise maximum health, enemies die with an animation, and the boss is introduced', async ({ page }) => {
    const errors = []; page.on('pageerror', e => { errors.push(e.message); console.log('BROWSER ERROR', e.stack); });
    await start(page);
    expect(await page.evaluate(() => ['jump', 'land', 'dash', 'pickup', 'door', 'kill', 'hurt', 'roar'].filter(k => !window.__MOLOTOLOGY__.cache.audio.exists(k)))).toEqual([]);
    await pickup(page, 'cargo', 2640, 620);
    await expect.poll(() => page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.survival.maxHealth)).toBe(120);
    expect(await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.survival.health)).toBe(120);
    await fixture(page, 'cargo');
    expect(await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.view.pickups.length)).toBe(0);
    expect(await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.survival.maxHealth)).toBe(120);
    // A killing blow disables collision at once, plays a fade, and the simulation resumes after hitstop.
    await page.evaluate(() => { const s = window.__MOLOTOLOGY__.scene.keys.Game, e = s.enemies.list.find(e => e.kind === 'urchin'); e.health = 1; e.timer = 10; s.player.resetAt(e.x - 80, 850); s.player.facing = 1; });
    await page.keyboard.press('j');
    await expect.poll(() => page.evaluate(() => { const e = window.__MOLOTOLOGY__.scene.keys.Game.enemies.list.find(e => e.kind === 'urchin'); return [e.active, e.body.enable]; })).toEqual([false, false]);
    await expect.poll(() => page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.enemies.list.find(e => e.kind === 'urchin').visible), { timeout: 4000 }).toBe(false);
    expect(await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.physics.world.isPaused)).toBe(false);
    await fixture(page, 'angler'); await place(page, 1500, 850);
    await expect.poll(() => page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.bossIntroduced), { timeout: 4000 }).toBe(true);
    await page.screenshot({ path: 'art/qa/boss.png' });
    expect(errors).toEqual([]);
});
