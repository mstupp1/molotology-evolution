import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { start, fixture, advance, place } from '../tests/browser/update-helpers.mjs';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ baseURL: 'http://127.0.0.1:8081', viewport: { width: 1280, height: 720 } });
page.on('pageerror', error => { throw error; });
await page.goto('http://127.0.0.1:8081'); await start(page);
await mkdir('art/qa/polish', { recursive: true });
await page.addStyleTag({ content: '.card, .notice { visibility: hidden !important; }' });
for (const [room, attack] of [['handcrab', 'chomp'], ['hermit', 'snip'], ['rigging', 'cable'], ['rigging', 'hooks'], ['molt', 'spew'], ['angler', 'pulse']]) {
    if (process.argv[2] && !process.argv[2].split(',').includes(attack)) continue;
    await fixture(page, room, 1);
    await page.evaluate(attack => {
        const s = window.__MOLOTOLOGY__.scene.keys.Game, e = s.enemies.list.find(e => e.boss);
        e.stun = 0; e.attack = attack; e.attackFacing = -1; e.setPosition(1850, 650).setFlipX(false); e.body.updateFromGameObject(); e.body.moves = false;
        e.mode = 'windup'; e.duration = 1.1; e.timer = 1.1; e.target.set(1400, 650); s.player.resetAt(1380, 820);
        s.player.body.allowGravity = false; s.cameras.main.stopFollow(); s.cameras.main.setScroll(950, 230);
    }, attack);
    for (let frame = 0; frame < 40; frame++) {
        await advance(page, 3);
        await page.screenshot({ path: `/tmp/polish-${attack}-${String(frame).padStart(3, '0')}.png` });
        if (frame === 12 || frame === (attack === 'pulse' ? 23 : 27)) await page.screenshot({ path: `art/qa/polish/${attack}-${frame === 12 ? 'charge' : 'strike'}.png` });
    }
}
await fixture(page, 'furnace'); await place(page, 1500, 850);
await page.evaluate(() => { const s = window.__MOLOTOLOGY__.scene.keys.Game; s.cameras.main.stopFollow(); s.cameras.main.setScroll(700, 240); });
for (let frame = 0; frame < 32; frame++) { await advance(page, 4); await page.screenshot({ path: `/tmp/polish-lava-${String(frame).padStart(3, '0')}.png` }); }
await page.screenshot({ path: 'art/qa/polish/lava.png' });
for (const form of [0, 1]) {
    await fixture(page, 'hull', form); await page.evaluate(() => { const p = window.__MOLOTOLOGY__.scene.keys.Game.player; p.resetAt(546, 758); p.reattachDelay = 0; p.facing = 1; p.setVelocityY(90); });
    for (let frame = 0; frame < 20; frame++) { await advance(page, 2); await page.screenshot({ path: `/tmp/polish-ledge-${form}-${String(frame).padStart(3, '0')}.png` }); }
    await page.screenshot({ path: `art/qa/polish/ledge-${form}.png` });
    await page.keyboard.press('Space');
    for (let frame = 20; frame < 32; frame++) { await advance(page, 2); await page.screenshot({ path: `/tmp/polish-ledge-${form}-${String(frame).padStart(3, '0')}.png` }); }
}
await fixture(page, 'ballast'); await place(page, 2700, 244);
await page.evaluate(() => { const s = window.__MOLOTOLOGY__.scene.keys.Game; s.cameras.main.stopFollow(); s.cameras.main.setScroll(1900, 0); }); await advance(page, 2);
await page.waitForTimeout(300); await page.screenshot({ path: 'art/qa/polish/ceiling-door.png' });
await fixture(page, 'cargo'); await page.keyboard.press('Tab'); await advance(page, 2);
await page.waitForTimeout(400); await page.screenshot({ path: 'art/qa/polish/secrets.png' });
await browser.close();
