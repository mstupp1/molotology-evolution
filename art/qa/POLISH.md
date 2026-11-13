# Combat, atmosphere, and traversal polish

Validation performed November 13, 2026 with bundled Node and Chrome/SwiftShader.

- TypeScript: zero errors.
- Unit/integration: 74 tests pass.
- Complete browser suite: 30 tests pass. The signature-attack, traversal/map, and production checks were repeated after final chimney-anchor alignment.
- Production build: passes; assets load correctly beneath a subdirectory without the development handle.

Browser coverage exercises all five specials in both facings, harmless anticipation/recovery, single-hit strike windows, committed targets, enemy-death cleanup, molten-stream terrain clipping, crab immunity, acquiring the final molt with a live Cinder, all three inverted ceiling exits, tentacle aiming in four directions, unfinished-secret discovery/completion/load behavior, and measured hand contact through catch/hang/mantle in both forms and facings. Existing coverage also checks the full progression, flood/drain behavior, combat, gamepad input, pause, repeated room restarts, and boss victory.

The Cinder uses its previous defeat identifier even after moving to the Molting Chamber. No save version changes. Its pickup remains interactable during the encounter; the chimney sends molten flow over the approach ledge, and leaps pressure elevated approaches. These tests verify the route and damage rules, not a timed human balance playthrough.

## Motion evidence

All clips use actual rendered game frames. Room/boss announcements are hidden only in the capture page so attacks remain visible. The fixed-step capture clock also advances Phaser's normally wall-clock-based tweens, keeping mantles synchronized with physics.

| Feature | Clip |
| --- | --- |
| Unlisted Diver's chomp | [Chomp](polish/chomp.gif) |
| Borrowed Shell's snip | [Snip](polish/snip.gif) |
| Rigging cable whip | [Cable](polish/cable.gif) |
| Staggered falling hooks | [Hooks](polish/hooks.gif) |
| Cinder's lava spew | [Spew](polish/spew.gif) |
| Lantern charge and pulse | [Pulse](polish/pulse.gif) |
| Flowing lava and softened banks | [Lava](polish/lava.gif) |
| Diver ledge contact and mantle | [Diver](polish/ledge-0.gif) |
| Breach ledge contact and mantle | [Breach](polish/ledge-1.gif) |

Stills: [inverted ceiling passage](polish/ceiling-door.png), [unfinished-secret map and legend](polish/secrets.png), [molten flow](polish/lava.png), [chomp](polish/chomp-strike.png), [snip](polish/snip-strike.png), [spew](polish/spew-strike.png), and [pulse](polish/pulse-strike.png).

Reproduce with `node scripts/capture-polish.mjs` (dev server on 8081), then `python scripts/assemble_polish_qa.py` (Pillow). Art-generation prompts and transparent sources are documented in [POLISH_PROMPTS.md](../POLISH_PROMPTS.md).
