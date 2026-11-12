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
