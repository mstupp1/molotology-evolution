# Molotology Evolution

A playable desktop browser Metroidvania set inside an abyssal shipwreck. Built with Phaser **4.2**, TypeScript and Vite; no backend or runtime image-generation service is required.

## Run

Use Node.js 22.12+ (or a compatible newer version) with npm:

```sh
npm ci
npm run dev
```

Open **http://localhost:8080**. Choose **Begin descent**, or **Continue descent** when a browser save exists. The game fits a 16:9 canvas to the window. A desktop keyboard/mouse or a standard gamepad is recommended.

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

`dist/` is a self-contained static build. Vite's relative base supports hosting beneath a subdirectory.

## Controls

| Action | Keyboard / mouse | Standard gamepad |
|---|---|---|
| Move / Dash direction | WASD or arrows | Left stick or D-pad |
| Jump / mantle | Space; hold for a higher jump | A |
| Drop from ledge | Down | Left stick down |
| Melee combo | J or left click; tap again to chain | X |
| Dodge; directional Dash after second molt | Shift | B |
| Aim / throw Harpoon | Hold right mouse; release to throw | Right stick + hold RT; release RT to throw |
| Keyboard-only Harpoon | Hold K + direction, then release K | — |
| Interact / refill / enter door | E | Y |
| Map | M or Tab | View |
| Pause / resume | Escape | Menu |
| Menu selection | Mouse; arrows + Enter | D-pad + A; B closes pause |

The HUD changes its hints when a controller connects. Gameplay and oxygen pause while the map or pause menu is open and when the browser loses focus.

## Chapter I: The ship that would not die

There are **twelve main chambers**, two hidden former-diver miniboss chambers, four ordinary enemy species, and the Angler boss. Main progression:

1. Broken Hull → Air Bell → Cargo Hold → Flooded Armory: recover the Harpoon.
2. Return to the Air Bell. Aim upward at the golden ring beside the high platform, release the Harpoon, then enter the Rigging Shaft.
3. Reach the Infirmary and accept the first molt. The Breach grants pressure tolerance.
4. Descend through the Pressure Works to the Molting Chamber. The second molt grants directional Dash.
5. Dash through the low Ballast Duct. Recover the chapel key in the Officer's Quarters.
6. Enter the Drowned Chapel, use the final oxygen station, and confront the Angler in the eastern hold.

Look for discarded equipment and scratched machinery on elevated Cargo Hold and Pressure Works platforms to find the Handcrab and the Hermit. Rigging/Air Bell and Ballast/Cargo connections form return routes. The victory screen lets you continue exploring.

Start with 100 health and 120 seconds of oxygen. Water drains oxygen at one second per second; empty reserves drain 8 health per second. Air pockets restore oxygen. Interacting with oxygen stations restores both resources and sets a checkpoint. Death preserves discoveries, upgrades, opened doors, and defeated bosses, returning you to that station with full resources. Ordinary enemies respawn when re-entering a chamber. Normal enemy kills restore a little health.

Saves are local to this browser under `molotology.shipwreck.v1`. Checkpoints, room discoveries, and major unlocks save automatically. Blocked storage falls back to a session save and displays a message. New Game requires a second selection before replacing an existing descent.

## Browser regression checks

```sh
# If Chrome is not installed locally, install Playwright's Chromium once:
npx playwright install chromium
npm run test:browser
```

On macOS the configuration uses an installed Google Chrome when available. Elsewhere it uses Playwright's Chromium. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to override the executable. These tests start a local Vite server unless one is already running.

The browser suite checks real keyboard actions, camera rendering, map pausing, checkpoint/Continue/death, the mandatory grapple, both molts, the physical Dash passage, enemy rooms, miniboss/boss defeat, victory exploration, and **simulated standard gamepad** inputs. Fixtures position the player to isolate encounters; these checks do not substitute for a timed human balance playthrough or a physical-controller test. The development-only `window.__MOLOTOLOGY__` handle supports fixtures and is absent from the production build. Screenshots are saved under `art/qa/`.

## Code and art

- Room geometry, connections, gates and spawns: `src/game/world.ts`.
- Testable survival, combo, progression and versioned saves: `src/game/model.ts`.
- Player, input, enemy and tether systems: `src/game/systems/`.
- Gameplay and the parallel HUD communicate through typed `game.events` contracts in `src/game/constants.ts`.
- Effects use Phaser 4 Filters; Arcade owns collision, gravity, reusable effect/projectile groups, and scene cleanup.
- Original reference-guided pixel art and generated audio are shipped under `public/assets/`; source art, prompts, extraction details and limitations are documented in [art/README.md](art/README.md).

The shipped prototype uses three forms (Diver, Breach, Infestation) and compact pose-based animation: two walking frames plus dedicated idle, jump, attack and aim poses, with additional motion for dodge, Dash, hurt, death and survival overlays. Later evolution forms and reference biomes are outside this chapter. The 20–30 minute playtime is a design target, not a measured completion time.
