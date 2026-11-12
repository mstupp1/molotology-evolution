# Prototype verification

Verified November 11, 2026:

- `npm run typecheck`: zero errors.
- `npm test`: 24 tests passed across survival, combat windows, progression, save restoration, room connectivity and swept collision.
- `npm run build`: successful static build.
- `npm run test:browser`: all seven scenarios passed. Includes keyboard movement, map pausing, restart listener cleanup, refill/Continue/death, mandatory grapple, both molts, the physical Dash duct, key gate, enemy rooms, miniboss/boss defeat, explorable victory and simulated standard gamepad controls.
- Final production smoke check passed after the last filter type guard. All assets and audio loaded from `/prototype/`, with no missing requests or page errors; the development fixture handle was absent.
- Final rendered screenshots: `title.png`, `gameplay.png`, `map.png`, `grapple.png`, `victory.png`.

The browser checks use encounter-position fixtures to isolate mechanics. Physical-controller testing, a timed 20–30 minute balance playthrough, and a hardware GPU benchmark remain manual follow-up checks. `performance.json` records a short headless software-WebGL sample, not desktop GPU performance.
