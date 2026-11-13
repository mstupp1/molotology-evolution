import { test, expect } from '@playwright/test';
test.setTimeout(90000);

async function start(page) {
    await page.goto('/');
    await page.waitForFunction(() => window.__MOLOTOLOGY__?.scene.isActive('MainMenu'));
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__MOLOTOLOGY__.scene.isActive('Game') && window.__MOLOTOLOGY__.scene.isActive('Hud'));
}
async function fixture(page, room, evolution = 0) {
    const serial = await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.runSerial);
    await page.evaluate(({room, evolution}) => {
        const s = window.__MOLOTOLOGY__.scene.keys.Game;
        Object.assign(s.progress, { harpoon: true, evolution, key: evolution === 2 });
        s.scene.restart({ progress: s.progress, room });
    }, {room, evolution});
    await page.waitForFunction(({room, serial}) => { const s = window.__MOLOTOLOGY__.scene.keys.Game; return s.room.id === room && s.runSerial > serial && window.__MOLOTOLOGY__.scene.isActive('Hud'); }, {room, serial});
    await page.evaluate(() => { window.__MOLOTOLOGY__.scene.keys.Game.survival.invulnerable = 100; });
}
const read = page => page.evaluate(() => {
    const s = window.__MOLOTOLOGY__.scene.keys.Game, p = s.player;
    return { x: p.centerX, y: p.centerY, feet: p.feet, state: p.state, surface: p.surface, frame: p.visual.frame.name, texture: p.visual.texture.key, animation: p.visual.anims.currentAnim?.key, angle: p.visual.angle, health: s.survival.health, mode: s.harpoon.mode, barriers: s.view.breakables.length };
});
async function swing(page) {
    await page.keyboard.press('j');
    await page.waitForFunction(() => window.__MOLOTOLOGY__.scene.keys.Game.combo.active);
    await page.waitForFunction(() => !window.__MOLOTOLOGY__.scene.keys.Game.combo.active);
}

test('six-frame walking and attack, dedicated catch/hang/mantle and wielded harpoon', async ({page}) => {
    await start(page); await fixture(page, 'hull');
    await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.player.resetAt(700, 850));
    await page.keyboard.down('d');
    const walk = new Set();
    for (let i = 0; i < 24; i++) { await page.waitForTimeout(90); walk.add((await read(page)).frame); }
    await page.keyboard.up('d'); expect(walk.size).toBeGreaterThanOrEqual(5);
    await page.keyboard.press('j'); const attacks = new Set();
    for (let i = 0; i < 18; i++) { await page.waitForTimeout(80); const p = await read(page); if (p.state === 'MeleeAttack') attacks.add(p.frame); }
    expect(attacks.size).toBeGreaterThanOrEqual(4);
    await page.waitForFunction(() => !window.__MOLOTOLOGY__.scene.keys.Game.combo.active);
    expect(await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.harpoon.weapon.texture.key)).toBe('harpoon-weapon');
    expect(await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.harpoon.head.texture.key)).toBe('harpoon-head');
    await page.evaluate(() => { const p = window.__MOLOTOLOGY__.scene.keys.Game.player; p.resetAt(546, 758); p.reattachDelay = 0; p.facing = 1; p.setVelocityY(90); });
    await expect.poll(async () => (await read(page)).state).toBe('LedgeGrab');
    await expect.poll(async () => (await read(page)).animation).toBe('player-0-hang');
    await page.screenshot({path:'art/qa/ledge-grab.png'});
    await page.keyboard.press('Space'); await expect.poll(async () => (await read(page)).state).toBe('Mantle');
    await expect.poll(async () => (await read(page)).feet).toBeCloseTo(690, 0);
    expect((await read(page)).x).toBeGreaterThan(580);
});

test('first molt claw breaks persistent barriers; knife cannot; first molt also dashes', async ({page}) => {
    await start(page); await fixture(page, 'pressure', 0);
    await page.evaluate(() => { const p = window.__MOLOTOLOGY__.scene.keys.Game.player; p.resetAt(2750, 850); p.facing = 1; });
    await swing(page); expect((await read(page)).barriers).toBe(1);
    await page.evaluate(() => { const s = window.__MOLOTOLOGY__.scene.keys.Game; s.progress.evolution = 1; s.player.evolution = 1; });
    for (let i = 0; i < 2; i++) await swing(page);
    await expect.poll(async () => (await read(page)).barriers).toBe(0);
    expect(await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.progress.opened)).toContain('break:pressure:coral');
    await fixture(page, 'pressure', 1); expect((await read(page)).barriers).toBe(0);
    await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.player.resetAt(450, 850));
    await page.keyboard.down('d'); await page.keyboard.press('Shift');
    await expect.poll(async () => (await read(page)).state).toBe('Dash'); await page.keyboard.up('d');
    expect((await read(page)).texture).toBe('breach-motion');
    await page.screenshot({path:'art/qa/claw-form.png'});
});

test('full crab withstands heat, climbs walls, scuttles upside down and drops on command', async ({page}) => {
    await start(page); await fixture(page, 'furnace', 1);
    await page.evaluate(() => { const s = window.__MOLOTOLOGY__.scene.keys.Game; s.survival.invulnerable = 0; s.player.resetAt(900, 850); });
    await expect.poll(async () => (await read(page)).health).toBeLessThan(100);
    await fixture(page, 'furnace', 2);
    await page.evaluate(() => { const s = window.__MOLOTOLOGY__.scene.keys.Game; s.survival.invulnerable = 0; s.player.resetAt(900, 850); });
    await page.waitForTimeout(800); expect((await read(page)).health).toBe(100); expect((await read(page)).texture).toBe('crab-motion');
    await page.screenshot({path:'art/qa/volcanic-crab.png'});
    await fixture(page, 'caldera', 2);
    await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.player.resetAt(1117, 800));
    await page.keyboard.down('d'); await page.keyboard.down('w');
    await expect.poll(async () => (await read(page)).surface).toBe('right');
    const wallY = (await read(page)).y; await expect.poll(async () => (await read(page)).y, { timeout: 12000 }).toBeLessThan(wallY - 45);
    await expect.poll(async () => (await read(page)).surface, {timeout:12000}).toBe('ceiling');
    await page.keyboard.up('d'); await page.keyboard.down('a');
    await page.waitForFunction(() => window.__MOLOTOLOGY__.scene.keys.Game.player.surface === 'right', undefined, {timeout:12000});
    await page.keyboard.up('a');
    await expect.poll(async () => (await read(page)).feet, {timeout:12000}).toBeCloseTo(470, 0);
    await page.keyboard.up('w');
    expect((await read(page)).x).toBeGreaterThan(850);
    // Isolate the underside contact; real controls attach, translate and detach.
    await page.evaluate(() => { const p = window.__MOLOTOLOGY__.scene.keys.Game.player; p.resetAt(950, 547); p.reattachDelay = 0; p.setVelocityY(-80); });
    await page.keyboard.down('w'); await expect.poll(async () => (await read(page)).surface).toBe('ceiling'); await page.keyboard.up('w');
    expect(await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.player.body.top)).toBeCloseTo(500, 0);
    expect(Math.abs((await read(page)).angle)).toBe(180);
    const ceilingX = (await read(page)).x; await page.keyboard.down('d'); await page.waitForTimeout(450); await page.keyboard.up('d');
    expect((await read(page)).x).toBeGreaterThan(ceilingX + 40);
    await page.evaluate(() => { const s = window.__MOLOTOLOGY__.scene.keys.Game; s.survival.invulnerable = 0; s.player.setAlpha(1); s.player.visual.setAlpha(1); });
    await page.screenshot({path:'art/qa/ceiling-scuttle.png'});
    await page.keyboard.press('ArrowDown'); await expect.poll(async () => (await read(page)).surface).toBeNull();
    await expect.poll(async () => (await read(page)).y).toBeGreaterThan(560);
});

test('swimmers cross platforms and every species has its own attack sequence', async ({page}) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await start(page);
    const species = {urchin:'hull', jellyfish:'hull', octopus:'armory', shark:'rigging', handcrab:'handcrab', hermit:'hermit', angler:'angler'};
    for (const [kind, room] of Object.entries(species)) {
        await fixture(page, room, 2);
        const result = await page.evaluate(kind => {
            const s = window.__MOLOTOLOGY__.scene.keys.Game, e = s.enemies.list.find(e => e.kind === kind);
            e.mode = 'windup'; e.timer = 0.5; e.target.set(s.player.centerX, s.player.centerY);
            return {frames: window.__MOLOTOLOGY__.anims.get(`enemy-${kind}-move`).frames.length, strike: window.__MOLOTOLOGY__.anims.get(`enemy-${kind}-strike`).frames.map(f => f.textureFrame)};
        }, kind);
        expect(result.frames).toBe(6); expect(result.strike).toEqual([8,9]);
        await expect.poll(() => page.evaluate(kind => window.__MOLOTOLOGY__.scene.keys.Game.enemies.list.find(e => e.kind === kind).anims.currentAnim?.key, kind)).toBe(`enemy-${kind}-windup`);
        await expect.poll(() => page.evaluate(kind => window.__MOLOTOLOGY__.scene.keys.Game.enemies.list.find(e => e.kind === kind).anims.currentAnim?.key, kind)).toBe(`enemy-${kind}-strike`);
    }
    await fixture(page, 'hull', 2);
    await page.evaluate(() => { const s = window.__MOLOTOLOGY__.scene.keys.Game, e = s.enemies.list.find(e => e.kind === 'jellyfish'); e.body.reset(630, 600); e.mode = 'strike'; e.timer = 3; e.setVelocity(0, 160); });
    await expect.poll(() => page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.enemies.list.find(e => e.kind === 'jellyfish').y), {timeout:12000}).toBeGreaterThan(750);
    expect(errors).toEqual([]);
});
