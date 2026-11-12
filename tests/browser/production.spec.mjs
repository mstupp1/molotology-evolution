import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

let server;
const root = resolve('dist');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.wav': 'audio/wav', '.json': 'application/json' };
test.beforeAll(async () => {
    server = createServer(async (request, response) => {
        try {
            const relative = new URL(request.url, 'http://localhost').pathname.replace(/^\/prototype\//, '') || 'index.html';
            const path = resolve(root, relative);
            if (!path.startsWith(root + sep)) { response.writeHead(404).end(); return; }
            response.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream' }); response.end(await readFile(path));
        } catch { response.writeHead(404).end(); }
    });
    await new Promise(resolve => server.listen(8082, '127.0.0.1', resolve));
});
test.afterAll(async () => { if (server) await new Promise(resolve => server.close(resolve)); });

test('production build loads all art/audio from a subdirectory and starts without a development handle', async ({ page }) => {
    const errors = [], failed = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) failed.push(response.url()); });
    await page.goto('http://127.0.0.1:8082/prototype/');
    await page.waitForLoadState('networkidle'); await page.waitForTimeout(700);
    expect(await page.evaluate(() => '__MOLOTOLOGY__' in window)).toBe(false);
    await page.screenshot({ path: 'art/qa/title.png' });
    await page.keyboard.press('Enter'); await page.waitForTimeout(1500);
    await page.screenshot({ path: 'art/qa/gameplay.png' });
    const fps = await page.evaluate(() => new Promise(resolve => {
        let frames = 0; const start = performance.now();
        function frame() { frames++; if (performance.now() - start < 2000) requestAnimationFrame(frame); else resolve(Math.round(frames * 1000 / (performance.now() - start))); }
        requestAnimationFrame(frame);
    }));
    await writeFile('art/qa/performance.json', JSON.stringify({ renderer: 'Chrome headless with SwiftShader software WebGL', requestAnimationFramesPerSecond: fps, note: 'Diagnostic sample, not a hardware GPU benchmark or a timed balance playthrough.' }, null, 2));
    expect(await page.locator('canvas').count()).toBe(1); expect(failed).toEqual([]); expect(errors).toEqual([]);
});
