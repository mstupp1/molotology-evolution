# Molotology Evolution

**Play it in the browser: https://mstupp1.github.io/molotology-evolution/**

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

Every push to `main` runs the tests, builds, and deploys `dist/` to GitHub Pages through `.github/workflows/deploy-pages.yml`. You can also rerun it by hand from the Actions tab.

## Controls

| Action | Keyboard / mouse | Standard gamepad |
|---|---|---|
| Move / Dash direction | A / D; arrows for vertical direction | Left stick or D-pad |
| Jump / mantle | Space or W; hold for a higher jump | A |
| Drop from ledge | Down | Left stick down |
| Crab: cling / climb | Press toward wall, then W / S | Press toward wall, then left stick up / down |
| Crab: ceiling scuttle / drop | A / D; Space or Down to drop | Left stick; A or D-pad down to drop |
| Melee combo | J or left click; tap again to chain | X |
| Dodge; enhanced directional Dash after first molt | Shift or S | B |
| Charge / fire ranged weapon | Hold right mouse; release to fire | Right stick + hold RT; release RT to fire |
| Keyboard-only ranged aim | Hold K + arrows, then release K | — |
| Interact / refill / enter door | E | Y |
| Map | M or Tab | View |
| Pause / resume | Escape | Menu |
| Menu selection | Mouse; arrows + Enter | D-pad + A; B closes pause |

While attached to a wall or ceiling, W / S climb without jumping or dashing; Space and Shift retain their actions. Down drops from ceilings. The final molt replaces the harpoon with Bubble Shot: hold to charge, release during the flash for 1.6× damage. It fires straight, bursts on impact, and has no tether or grapple.

The HUD changes its hints when a controller connects. Gameplay and oxygen pause while the map or pause menu is open and when the browser loses focus.

## Chapter I: The ship that would not die

There are **fourteen main chambers**, two hidden former-diver miniboss chambers, and all seven enemy species. Handcrabs and Hermits also appear on the main route. Main progression:

1. Broken Hull → Air Bell → Cargo Hold → Flooded Armory: recover the Harpoon.
2. Return to the Air Bell. Aim upward at the golden ring beside the high platform, release the Harpoon, then enter the Rigging Shaft.
3. Reach the Infirmary and accept the first molt. The Breach replaces the knife with a wider claw sweep, grants enhanced directional Dash, and withstands high pressure.
4. Break the calcified eastern bulkhead in the Pressure Works with two claw swings. In the Molting Chamber, accept the final molt: the Carapace is fully crab, immune to volcanic heat and able to scuttle along walls and ceilings; Bubble Shot replaces the harpoon.
5. Climb the tall rib in the Ballast Duct, jump up to its overhead beam, and scuttle east along the underside to the ceiling vent. Recover the chapel key in the Officer's Quarters.
6. Climb and scuttle through the Chapel ceiling vent to the Black Smoker. Cross the volcanic vents, then climb the Caldera's western rib and scuttle east beneath the high beam to the Angler vent. The Chapel key remains required, including when using the Cargo–Furnace shortcut.

Five **Vital Pearls** permanently raise maximum vitality by 20 each: four on high ledges in Cargo, Rigging, Quarters and Chapel, and one in Cargo's heat-sealed alcove. The final form reaches the Chapel pearl by wall/ceiling crawling and directional jumps. Small early heat pockets in Cargo and Armory can be jumped over; the Cargo thermal reward and Furnace shortcut require the final shell.

Look for discarded equipment and scratched machinery on elevated Cargo Hold and Pressure Works platforms to find the Handcrab and the Hermit. Rigging/Air Bell and Ballast/Cargo connections form return routes. The victory screen lets you continue exploring.

The Angler rotates a telegraphed lunge, four rapid swimming passes around the player, and a charged lantern pulse with a large marked radius. Punish its recovery windows. The moving lantern takes 1.5× damage from melee and projectiles, stacking with perfect-release damage; below half health it also fires spreads of lures. Lost divers alternate lunges with large leaps and pass through internal platforms. All four encounters have distinct sprite sheets. Sharks recover faster; octopus tentacles always extend their full reach.

Start with 100 health and 120 seconds of oxygen. Water drains oxygen at one second per second; empty reserves drain 8 health per second. Air pockets restore oxygen. Interacting with oxygen stations restores oxygen and sets a checkpoint; it does not heal. Pearls, molts and enemy kills retain their healing. Death preserves discoveries, upgrades, opened doors, and defeated bosses, returning you to that station with full resources. Ordinary enemies respawn when re-entering a chamber. Normal enemy kills restore a little health.

Saves are local to this browser under `molotology.shipwreck.v1`. Checkpoints, room discoveries, and major unlocks save automatically. Blocked storage falls back to a session save and displays a message. New Game requires a second selection before replacing an existing descent.

## Browser regression checks

```sh
# If Chrome is not installed locally, install Playwright's Chromium once:
npx playwright install chromium
npm run test:browser
```

On macOS the configuration uses an installed Google Chrome when available. Elsewhere it uses Playwright's Chromium. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to override the executable. These tests start a local Vite server unless one is already running.

The browser suite checks real keyboard actions, six-frame movement and attacks, ledge catch/hang/mantle, persistent claw barriers, first-molt Dash, heat immunity, wall-to-ceiling-to-rooftop traversal, ceiling drops, swimming through platforms, each species' attack sequence, checkpoint/Continue/death, the mandatory grapple, both molts, three mandatory wall/ceiling passages, contextual W/S controls, charged bubbles, lantern weak-spot damage, Angler frenzy/pulse, four unique diver leaps, miniboss/boss defeat, and **simulated standard gamepad** inputs. Fixtures position the player to isolate encounters; these checks do not substitute for a timed human balance playthrough or a physical-controller test. The development-only `window.__MOLOTOLOGY__` handle is absent from the production build. Screenshots are saved under `art/qa/`. Set `PLAYWRIGHT_BASE_URL` to test an existing server on another port.

## Code and art

- Room geometry, connections, gates and spawns: `src/game/world.ts`.
- Testable survival, combo, progression and versioned saves: `src/game/model.ts`.
- Player, input, enemy and tether systems: `src/game/systems/`.
- Gameplay and the parallel HUD communicate through typed `game.events` contracts in `src/game/constants.ts`.
- Effects use Phaser 4 Filters; Arcade owns collision, gravity, reusable effect/projectile groups, and scene cleanup.
- Per-room art direction (tint, fog, light shafts, lantern color, darkness) lives in `THEMES` in `src/game/rendering.ts`; decoration is placed with a per-room seed so chambers no longer look cloned.
- Combat feedback (hitstop, damage numbers, death fades, dash afterimages, squash and stretch, camera lookahead) is in `src/game/scenes/Game.ts` and `src/game/systems/`.
- v2 sound cues (jump, land, dash, pickup, door, kill, hurt, roar) are synthesized by `node scripts/synth_sfx.mjs`.
- Original reference-guided pixel art and generated audio are shipped under `public/assets/`; source art, prompts, extraction details and limitations are documented in [art/README.md](art/README.md).

The demo uses three forms: Diver, Breach, and full-crab Carapace. Each form has 30 frames, including six-frame walking and melee sequences plus ledge, mantle, jump, aim, throw and dash poses. Every enemy has six locomotion and six attack-phase frames. Swimmers and lost divers pass through internal platforms; lost divers still land on the floor, and other grounded creatures collide with terrain. The harpoon uses an Arcade projectile with inherited momentum, mild gravity, swept hit detection, full-body pull clearance, cancellable reeling, and an animated cable. New abyss and iron-rib images add independent parallax layers. Generation prompts, sources, frame manifests and rebuild instructions are in [art/README.md](art/README.md). The 20–30 minute playtime remains a design target, not a measured completion time.
