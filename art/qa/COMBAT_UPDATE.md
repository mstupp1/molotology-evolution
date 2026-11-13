# Combat, movement and progression validation

Verified on November 13, 2026 with the bundled Node runtime and Google Chrome using SwiftShader WebGL.

| Check | Result |
| --- | --- |
| TypeScript (`tsc --noEmit`) | Zero errors |
| Unit/integration (`vitest run`) | 62 passed |
| Full browser suite (`playwright test`) | 25 passed |
| Production build (`vite build`) | Passed |
| Production subdirectory asset loading | No missing assets or browser errors |
| New sprite packing | Two unique 12-frame sheets; transparent, unclipped 256px cells |

The full browser suite passed together. After the final objective/control copy updates and leap-height tuning, diver encounters and production loading were checked again. The added combat browser cases check page errors and failed asset responses.

Coverage includes contextual W/S, all-form dash anchors, ledge catch/hang/mantle, oxygen-only stations, pickup persistence, Continue/death, immediate harpoon replacement and legacy final-form saves, charged/perfect bubble damage, terrain sweeps, normal body hits, every lantern frame in both facings, harpoon/melee weak hits, fixed tentacle reach, shark intervals, Angler rotation/four frenzy passes/pulse damage, all four diver leaps through platforms, grounded-target leap height, early heat avoidance and immunity, both thermal gates, the Chapel key, and all three climb/ceiling exits using keyboard controls. Pause, repeated scene restarts and boss defeat clear or suspend effects correctly.

Combat fixtures advance the actual Phaser input/scene/Arcade loop at 60Hz between rendered frames to avoid tying assertions to software GPU speed. These are isolated regression checks and visual inspections, not a timed human balance playthrough or physical-controller certification.

## Visual evidence

Short clips use real game frames, resized to 480×270 for repository size:

- [Lantern charge and pulse](update-pulse.gif)
- [Swimming frenzy](update-frenzy.gif)
- [Ledge catch, hang and mantle](update-ledge.gif)

Still captures:

- [Four unique lost divers](update-diver-lineup.png)
- [Dash alignment: Diver](update-dash-0.png), [Breach](update-dash-1.png), [Carapace](update-dash-2.png)
- [Ballast crawl exit](update-ballast-crawl.png), [Chapel crawl exit](update-chapel-crawl.png), [Caldera crawl exit](update-caldera-crawl.png)
- [Lantern charge](update-lantern-charge.png), [energy pulse](update-lantern-pulse.png), [frenzy](update-frenzy.png)
- [Lowered ledge pose](update-ledge.png), [replacement molt relic](update-molt-relic.png)

Source assets, built-in image generation prompts and packing instructions are recorded in [the art notes](../README.md) and [update prompts](../UPDATE_PROMPTS.md).
