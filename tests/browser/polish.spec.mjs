import { test, expect } from '@playwright/test';
import { start, fixture, place, advance } from './update-helpers.mjs';
test.setTimeout(90000);
const errors = new WeakMap();
test.beforeEach(({ page }) => { const list = []; errors.set(page, list); page.on('pageerror', e => list.push(e.message)); page.on('response', r => { if (r.status() >= 400) list.push(`${r.status()} ${r.url()}`); }); });
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

test('signature attacks warn, hit only during their active phase, lock aim, and clear on death', async ({ page }) => {
    await start(page);
    for (const [room, attack] of [['handcrab', 'chomp'], ['hermit', 'snip'], ['rigging', 'cable'], ['rigging', 'hooks'], ['molt', 'spew']]) {
        for (const facing of [-1, 1]) {
            await page.evaluate(() => { window.__MOLOTOLOGY__.scene.keys.Game.progress.defeated = []; });
            await fixture(page, room, 1);
            const hits = await page.evaluate(({ attack, facing }) => {
                const s = window.__MOLOTOLOGY__.scene.keys.Game, e = s.enemies.list.find(e => e.boss), p = s.player;
                e.setPosition(1700, 650).setFlipX(facing > 0); e.body.updateFromGameObject(); e.body.moves = false; e.stun = 0; e.attack = attack; e.attackFacing = facing; e.target.set(1700 + facing * 400, 650);
                const x = attack === 'hooks' ? e.target.x - 190 : 1700 + facing * 180;
                p.resetAt(x, attack === 'spew' ? 595 : 710); p.body.allowGravity = false;
                const calls = []; s.enemies.damagePlayer = damage => calls.push(damage);
                e.mode = 'windup'; e.duration = 1; e.timer = 0.5; s.enemies.update(0, p); const windup = calls.length;
                e.mode = 'strike'; e.duration = 1; e.timer = 0.5; e.pulseHit = false; s.enemies.update(0, p); s.enemies.update(0, p); const strike = calls.length;
                e.mode = 'recover'; e.timer = 1; s.enemies.update(0, p); const recover = calls.length;
                const locked = { x: e.target.x, y: e.target.y }; p.resetAt(1300, 450); e.mode = 'windup'; e.timer = 0.5; s.enemies.update(0, p);
                const stable = e.target.x === locked.x && e.target.y === locked.y;
                s.enemies.hit(e, 9999, 1); return { windup, strike, recover, stable, parts: s.enemies.fx.limbs.has(e) };
            }, { attack, facing });
            expect(hits, `${attack} facing ${facing}`).toEqual({ windup: 0, strike: 1, recover: 1, stable: true, parts: false });
        }
    }
});

test('crab resists molten spew and final molt can be taken while Cinder is alive', async ({ page }) => {
    await start(page);
    for (const form of [0, 1, 2]) {
        await fixture(page, 'molt', form);
        const damage = await page.evaluate(() => {
            const s = window.__MOLOTOLOGY__.scene.keys.Game, e = s.enemies.list.find(e => e.boss);
            e.setPosition(1700, 500); e.body.updateFromGameObject(); e.stun = 0; e.attack = 'spew'; e.attackFacing = -1; e.mode = 'strike'; e.duration = 1.3; e.timer = 0.65; e.target.set(e.x - 500, e.y - 60); e.pulseHit = false;
            s.player.resetAt(e.x - 170, e.y - 82 + (s.player.evolution === 2 ? 22 : 43)); s.player.body.allowGravity = false;
            const calls = []; s.enemies.damagePlayer = damage => calls.push(damage); s.enemies.update(0, s.player); return calls;
        });
        expect(damage).toEqual(form === 2 ? [] : [22]);
    }
    await fixture(page, 'molt', 1);
    await page.evaluate(() => {
        const s = window.__MOLOTOLOGY__.scene.keys.Game, e = s.enemies.list.find(e => e.boss);
        e.stun = 0; e.timer = 0; e.cycles = 0; s.player.resetAt(1850, 710); s.player.body.allowGravity = false;
    });
    await advance(page, 35);
    expect(await page.evaluate(() => { const e = window.__MOLOTOLOGY__.scene.keys.Game.enemies.list.find(e => e.boss); return [e.attack, e.mode]; })).toEqual(['spew', 'windup']);
    await advance(page, 35);
    expect(await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.enemies.list.find(e => e.boss).mode)).toBe('strike');
    await advance(page, 85); await place(page, 2100, 710);
    await page.keyboard.press('e'); await advance(page, 2);
    expect(await page.evaluate(() => { const s = window.__MOLOTOLOGY__.scene.keys.Game; return { form: s.progress.evolution, alive: s.enemies.list.find(e => e.boss).health > 0, defeated: s.progress.defeated.includes('caldera:hermit:2580') }; })).toEqual({ form: 2, alive: true, defeated: false });
});

test('ceiling doors hang from beams and octopus aims in all four directions', async ({ page }) => {
    await start(page);
    for (const room of ['ballast', 'chapel', 'caldera']) {
        await fixture(page, room);
        const door = await page.evaluate(() => {
            const s = window.__MOLOTOLOGY__.scene.keys.Game, d = s.view.doors.find(d => d.data.crawl);
            return { angle: d.image.angle, base: d.image.y, label: d.label.y, beam: s.room.platforms.find(p => d.data.x >= p.x && d.data.x <= p.x + p.w && p.y === 100).y + 100 };
        });
        expect(Math.abs(door.angle)).toBe(180); expect(door.base).toBe(door.beam); expect(door.label).toBeGreaterThan(door.base);
    }
    await fixture(page, 'armory', 1);
    for (const [dx, dy] of [[200, 0], [-200, 0], [0, -200], [0, 200]]) {
        const result = await page.evaluate(({ dx, dy }) => {
            const s = window.__MOLOTOLOGY__.scene.keys.Game, e = s.enemies.list.find(e => e.kind === 'octopus');
            e.stun = 0; e.mode = 'strike'; e.timer = 0.175; e.target.set(e.x + dx, e.y + dy); s.enemies.update(0, s.player);
            const v = s.enemies.tentacles.get(e), angle = v.rotation - Math.PI;
            return { x: Math.cos(angle), y: Math.sin(angle), reach: v.displayWidth };
        }, { dx, dy });
        expect(result.x).toBeCloseTo(dx / 200); expect(result.y).toBeCloseTo(dy / 200); expect(result.reach).toBeCloseTo(380);
    }
});

test('secret maps reveal unresolved encounters without revealing hidden destinations', async ({ page }) => {
    await start(page); await fixture(page, 'cargo', 1);
    await page.evaluate(() => { const s = window.__MOLOTOLOGY__.scene.keys.Game; s.progress.explored = ['hull', 'cargo']; s.progress.defeated = []; }); await advance(page, 10);
    await expect(page.locator('.survey-map [data-secret-room="cargo"]')).toHaveCount(1);
    await page.keyboard.press('Tab'); await advance(page, 2);
    await expect(page.locator('.map-legend span').filter({ hasText: 'Unfinished secret' })).toBeVisible();
    expect(await page.locator('.map-label').allTextContents()).not.toContain('Unlisted Diver');
    await page.keyboard.press('Tab'); await advance(page, 2);
    await page.evaluate(() => { const s = window.__MOLOTOLOGY__.scene.keys.Game; s.progress.explored.push('handcrab'); s.progress.opened.push('cargo:handcrab'); }); await advance(page, 10);
    await expect(page.locator('.survey-map [data-secret-room]')).toHaveCount(2);
    await page.evaluate(() => { const s = window.__MOLOTOLOGY__.scene.keys.Game; s.progress.defeated.push('handcrab:handcrab:2100'); s.save(); }); await advance(page, 10);
    await expect(page.locator('.survey-map [data-secret-room]')).toHaveCount(0);
    await page.reload(); await page.waitForFunction(() => window.__MOLOTOLOGY__?.scene.isActive('MainMenu')); await page.keyboard.press('Enter'); await advance(page, 100);
    await expect(page.locator('.survey-map [data-secret-room]')).toHaveCount(0);
});

test('hand contacts stay at the lip through catch and hang in both forms and facings', async ({ page }) => {
    await start(page);
    for (const form of [0, 1]) for (const facing of [1, -1]) {
        await fixture(page, 'hull', form);
        await page.evaluate(facing => { const p = window.__MOLOTOLOGY__.scene.keys.Game.player; p.resetAt(facing > 0 ? 546 : 854, 758); p.reattachDelay = 0; p.facing = facing; p.setVelocityY(90); }, facing);
        await advance(page, 4);
        expect(await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.player.state)).toBe('LedgeGrab');
        for (const frames of [2, 8, 12, 16]) {
            await advance(page, frames);
            const contact = await page.evaluate(async () => {
                const { LEDGE_HANDS } = await import('/src/game/animation.ts');
                const p = window.__MOLOTOLOGY__.scene.keys.Game.player, v = p.visual, hand = LEDGE_HANDS[p.evolution][Number(v.frame.name)];
                const at = v.getWorldTransformMatrix().transformPoint((hand[0] - v.displayOriginX) * (v.flipX ? -1 : 1), hand[1] - v.displayOriginY);
                return Math.hypot(at.x - p.ledge.edge, at.y - p.ledge.y);
            });
            expect(contact).toBeLessThan(3);
        }
        await page.keyboard.press('Space'); await advance(page, 30);
        const landed = await page.evaluate(() => { const p = window.__MOLOTOLOGY__.scene.keys.Game.player; return { feet: p.feet, state: p.state, ledge: p.ledge, x: p.centerX }; });
        expect(landed.feet, JSON.stringify({ form, facing, ...landed })).toBeCloseTo(690, 0);
    }
});
