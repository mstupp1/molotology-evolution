import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const chrome = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? (existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined);
export default defineConfig({
    testDir: './tests/browser', timeout: 30000, workers: 1, reporter: 'list',
    use: { baseURL: 'http://127.0.0.1:8080', viewport: { width: 1280, height: 720 },
        launchOptions: { executablePath: chrome, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] }, screenshot: 'only-on-failure' },
    webServer: { command: 'npm run dev -- --host 127.0.0.1', url: 'http://127.0.0.1:8080', reuseExistingServer: true, timeout: 30000 }
});
