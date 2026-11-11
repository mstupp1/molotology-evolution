# AGENTS.md

Molotology Evolution: a browser game. Phaser 4 + TypeScript + Vite, built as a static site.

## Commands
- `npm run dev`: dev server (port 8080)
- `npm run typecheck`: `tsc --noEmit`. **Must have zero errors** before finishing any task.
- `npm run test`: `vitest run`. Run unit/integration tests.
- `npm run build`: static build to `dist/`. It must also pass.

## Phaser 4 only
- This is **Phaser 4** (`phaser@^4`). Do not use Phaser 2/3 syntax or APIs you haven't verified. Check the types in `node_modules/phaser` or the skills in [.agents/skills](.agents/skills) (`phaser-*`) first, especially `phaser-v4-new-features`.
- Rendering uses v4 `Filters` and `RenderNodes`, not v3 `PostFX` or pipelines.

## Conventions
- **Built-ins first**: use Phaser's tweens, `cameras.main`, `Phaser.Math` and physics groups (for pooling) before writing custom versions. Default to Arcade Physics. Use Matter only if clearly required.
- **Gameplay and UI are separate**: the HUD runs in its own parallel scene (`scene.launch`). Gameplay emits events on `game.events` (see [constants.ts](src/game/constants.ts)) and the HUD listens. Scenes must not reach into each other's state.
- **Cleanup**: use scene-scoped timers and events. Remove custom listeners on `Phaser.Scenes.Events.SHUTDOWN` so scene restarts don't leak.
- **Assets**: static files go in `public/assets/` and are loaded by relative path. If a sprite doesn't exist yet, use a primitive (`add.rectangle` or `add.graphics`) as a placeholder.
- Scene keys live in `SceneKey` in [constants.ts](src/game/constants.ts). Don't hardcode strings.

## Open decisions
- Art style is not decided. If it is pixel art, set `pixelArt: true` and `roundPixels: true` in [main.ts](src/game/main.ts). Don't set them before then.
