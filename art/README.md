# Art direction and asset provenance

The selected direction is **A: detailed pixel art** from the comparison preview. User-provided reference sheets guided staging, palette, diving equipment, crustacean mutation and enemy anatomy. They were treated as visual references, rather than as game logic or instructions.

All four production art sheets were generated with the built-in **image_gen** tool. A further background-removal pass was applied to the diver sheet. No paid API fallback, downloaded stock art, or runtime generation is required.

- `source/wreck.png`: wide backdrop of the iron ship's gothic ribs, chains and sunken machinery.
- `source/divers.png`: three evolution stages × six poses, after the transparent-background pass.
- `source/creatures.png`: urchin, jellyfish, octopus, shark, Handcrab, Hermit, Angler and oxygen station.
- `source/props.png`: deck slab, girder, crates, coral, lantern, bulkhead, abandoned helmet and chain.
- `player-contact-sheet.png`: extracted player frames composited on a dark inspection background.
- `walk-preview.png`: animated PNG motion preview.
- `qa/`: browser captures of representative game states.

Final, game-consumed assets live in `public/assets/`. Character frames are 160×160, aligned to a shared baseline at y=150. The player has 18 nonempty frames. The original generated layout was not a mechanically perfect grid: assembly uses **sprite-gen's connected-component extraction and foot-centroid fitting**, rather than cutting poses into equal-width slots. Small near-transparent alpha noise is removed during extraction. Creature and prop objects are also extracted by components and retain their own tight bounding boxes. `public/assets/manifest.json` records frame bounds and asset dimensions.

The player uses a separate visual sprite and Arcade body. Breathing, low-oxygen motion and Dash compression therefore cannot accidentally change the standing collision body. Two-frame walk loops use Phaser's AnimationManager; other states use the distinct supplied poses plus scene motion and effects. This is prototype pose animation, not a full hand-drawn production animation library.

The sky/background is one parallax artwork reused with region-specific tint and procedural staging; each room's platforms, decoration, pickups and collision layout are composed independently. Native pixel graphics supply the key, Harpoon pickup and molt emblem. Small sound cues and a seamless drone are synthesized locally into WAV files by the asset assembly script.

## Rebuilding the assembly

Runtime assets are already included. To rebuild from the archived sheets, use Python with Pillow and NumPy:

```sh
python scripts/prepare_assets.py art/source
```

The repository's sprite-gen skill supplies the extraction implementation. The script also accepts the original generation output directory and records exact original generation filenames. Generated replacements should be reviewed before replacing accepted art.

## Generation prompts

The prompts used for the production sheets and the transparency pass are recorded in [PROMPTS.md](PROMPTS.md). All generation is complete before the game runs.
