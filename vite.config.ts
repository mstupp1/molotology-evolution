/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
    base: './', // relative paths so the static build works from any host/subpath
    server: { port: 8080 },
    build: { chunkSizeWarningLimit: 2000 }, // Phaser alone is ~1.5MB minified
    test: {
        environment: 'node',
    }
});
