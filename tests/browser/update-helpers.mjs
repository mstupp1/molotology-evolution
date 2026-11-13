import { expect } from '@playwright/test';

// Run the actual scene/input/Arcade update loop at 60Hz between rendered captures.
// This keeps combat assertions independent of software WebGL frame rates.
export async function advance(page, frames = 1) {
    await page.evaluate(frames => {
        const g = window.__MOLOTOLOGY__;
        g.loop.sleep();
        window.__testTime ??= g.loop.now;
        for (let i = 0; i < frames; i++) { window.__testTime += 1000 / 60; g.headlessStep(window.__testTime, 1000 / 60); }
        g.step(window.__testTime, 0);
    }, frames);
}
export async function start(page) {
    await page.goto('/');
    await page.waitForFunction(() => window.__MOLOTOLOGY__?.scene.isActive('MainMenu'));
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__MOLOTOLOGY__.scene.isActive('Game') && window.__MOLOTOLOGY__.scene.isActive('Hud'));
    await advance(page, 90);
}
export async function fixture(page, room, evolution = 2) {
    await page.evaluate(({ room, evolution }) => {
        const s = window.__MOLOTOLOGY__.scene.keys.Game;
        Object.assign(s.progress, { harpoon: true, evolution, key: evolution === 2 });
        s.scene.restart({ progress: s.progress, room });
    }, { room, evolution });
    await advance(page, 2);
    await expect.poll(() => page.evaluate(() => window.__MOLOTOLOGY__.scene.isActive('Hud'))).toBe(true);
    await page.evaluate(() => {
        const s = window.__MOLOTOLOGY__.scene.keys.Game;
        s.survival.invulnerable = 1000;
        for (const e of s.enemies.list) { e.timer = 1000; e.stun = 1000; e.setVelocity(0, 0); }
    });
    await advance(page, 180);
}
export async function place(page, x, feet) {
    await page.evaluate(({ x, feet }) => window.__MOLOTOLOGY__.scene.keys.Game.player.resetAt(x, feet), { x, feet });
    await advance(page, 2);
}
export async function crawlExit(page, room) {
    const wall = room === 'chapel' ? 1700 : 650;
    await place(page, wall - 34, 850);
    await page.keyboard.down('d'); await advance(page, 22);
    await expect.poll(() => page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.player.surface)).toBe('right');
    await page.keyboard.down('w'); await advance(page, 210);
    await page.keyboard.up('w'); await page.keyboard.up('d');
    const feet = await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.player.feet);
    expect(feet).toBeLessThan(400);
    // Jump from the rib to the overhead beam; W remains held until contact.
    await page.keyboard.down('w'); await advance(page, 32);
    await page.keyboard.up('w');
    await expect.poll(() => page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.player.surface)).toBe('ceiling');
    await page.keyboard.down('d');
    const target = await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.room.doors.find(d => d.crawl).x);
    for (let n = 0; n < 45; n++) {
        const x = await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.player.centerX);
        if (x >= target - 35) break;
        await advance(page, Math.min(30, Math.max(1, Math.floor((target - 25 - x) / 2.75))));
    }
    await page.keyboard.up('d');
    expect(await page.evaluate(() => window.__MOLOTOLOGY__.scene.keys.Game.player.surface)).toBe('ceiling');
    await page.screenshot({ animations: 'disabled', path: `art/qa/update-${room}-crawl.png` });
    await page.keyboard.press('e'); await advance(page, 20);
}
