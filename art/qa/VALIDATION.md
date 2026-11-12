# Demo v3 verification

Verified November 11, 2026.

- TypeScript: zero errors (`tsc --noEmit`).
- Unit/integration: 33 tests passed in four files (Vitest), including ability ordering, main-route species coverage, volcanic rooms, full-body cable clearance, tether tension, survival, saves, combos and room connectivity.
- Static build: Vite production build passed, with relative asset URLs.
- Complete browser suite: 12 scenarios passed in Chrome using software WebGL. This includes six-frame walking and melee, catch/hang/mantle, persistent claw barriers, enhanced Dash at the first molt, full-crab heat immunity, wall-to-ceiling-to-rooftop traversal, upside-down walking and dropping, all seven species' attack phases, swimmers crossing platforms, keyboard and simulated gamepad input, checkpoint/Continue/death, mandatory grappling, the Dash duct, key gates, room restarts, boss defeat and continued exploration.
- Production smoke: every art/audio request succeeded under `/prototype/`, no page errors, and no development fixture handle in the build.
- Asset inspection: all 174 packed player/enemy frames are nonempty; every six-frame locomotion and attack row contains at least five distinct images. The assembly validates padding and shared player foot baselines.
- Final object polish: the harpoon has separate launcher and barbed spear sprites; the launcher remains wielded during reeling. Focused animation, crab traversal, grapple and production smoke checks were rerun after this asset change.

The environment's npm executable was unavailable, so the equivalent TypeScript, Vitest, Vite and Playwright entry points were run with the bundled Node runtime. `PLAYWRIGHT_BASE_URL=http://localhost:8081` selects the local preview port.

Screenshots include `volcanic-crab.png`, `ceiling-scuttle.png`, `claw-form.png`, `ledge-grab.png`, `grapple.png`, `boss.png`, `title.png`, `gameplay.png`, `map.png` and `victory.png`. Animated six-frame walk previews and contact sheets are in `art/`.

Browser checks use encounter-position fixtures to isolate mechanics. A timed 20–30 minute balance playthrough and a physical-controller session were not performed. `performance.json` is a headless software-WebGL diagnostic, not a hardware GPU benchmark.
