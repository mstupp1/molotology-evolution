# Art direction and asset provenance

Detailed pixel art: tarnished brass, dirty teal canvas, corroded iron, coral-red crustacean mutation and dark underwater silhouettes. All production images were generated with built-in **image_gen**, without a paid API fallback, stock art, or runtime generation. The accepted grittier diver is retained as a reference.

Current source images in `art/source/`:

- `diver-motion.png`, `breach-motion.png`, `crab-motion.png`: 30 player frames per form. The Breach has a replacement claw; the final Carapace is a full six-legged crab.
- `enemy-*.png`: all seven species, with six locomotion and six attack-phase frames each. The shark received a separate alpha cleanup pass.
- `motion-props.png`: harpoon weapon, grapple anchor, field journal, breakable coral barrier, volcanic vent, lava, tentacle and claw-sweep effect.
- `abyss-far.png`, `wreck-ribs.png`: distant abyss and transparent iron-rib parallax layers.
- Original `wreck.png`, `divers.png`, `divers-gritty.png`, `creatures.png`, `props.png`: original backdrop, accepted character reference, enemies, station and environmental props.

Game assets are in `public/assets/`. Player frames are 160×160 with a shared foot baseline at y=150 (90 frames total). Enemy cells are 256×256 (84 frames total). Assembly uses sprite-gen's connected-component extraction, shared scales and foot-centroid fitting. A single scale across all poses of a form prevents extended attacks and raised arms from shrinking the body between rows. Small alpha noise is removed before packing. `motion-manifest.json` records new frame bounds and reference dimensions; `manifest.json` describes retained original art and props.

Phaser's AnimationManager owns locomotion, melee, jumps, ledge catch/hang/mantle and species-specific attack phases. The visual sprite is separate from the Arcade body. Crab contact changes swap body dimensions, synchronize its custom collision offset immediately, and rotate the visual along walls and ceilings. Shared anchors keep six-frame walk cycles aligned. Contact sheets and animated walk previews are in `art/*-motion-*.png`.

Independent abyss, wreck, open ribs, light shafts, distant girders, near chains and foreground sprites move at different scroll factors. Thermal vent sprites, lava and particle plumes distinguish volcanic chambers. Interactive objects use sprite textures; collision rectangles are invisible. Native graphics supply small interface icons, lighting and particles. Sound cues and the ambient loop are synthesized locally.

To reproduce the packed assets, use Python with Pillow and NumPy:

```sh
python scripts/prepare_assets.py art/source
python scripts/prepare_motion_assets.py
```

Original prompts are recorded in [PROMPTS.md](PROMPTS.md); motion, weapon, object and parallax prompts are in [MOTION_PROMPTS.md](MOTION_PROMPTS.md). Browser captures are in `art/qa/`.

## Combat and progression update

Built-in **image_gen** produced two distinct lost-diver variants and a split, glowing carapace molt relic. Transparent originals are `art/source/enemy-rigging-diver.png`, `art/source/enemy-cinder-diver.png`, and `art/source/molt-relic.png`. Packed runtime assets are `public/assets/enemy-rigging-diver.png`, `public/assets/enemy-cinder-diver.png`, and the replaced `public/assets/molt-icon.png`. The original hidden-chamber Handcrab and Hermit remain distinct encounters.

Rebuild the additions with `python scripts/prepare_update_assets.py` (Pillow). Each diver has twelve frames in the existing 256×256 cell format, with one common scale across all poses. The script preserves existing motion-manifest entries and appends bounds for the new visuals. The relic packs to a transparent 128×128 cell and displays at 65×65. Exact generation prompts are in [UPDATE_PROMPTS.md](UPDATE_PROMPTS.md).

Lantern weak-spot centers in `src/game/combat.ts` follow the luminous cyan bulb across all twelve Angler frames and mirror with facing. Software-WebGL regression checks advance the real Phaser input/scene/Arcade loop at 60Hz between rendered captures, avoiding timing assertions based on software rendering speed.
