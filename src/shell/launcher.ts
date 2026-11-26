// Game discovery (CLAUDE.md "Game contract"): the launcher finds games via
// import.meta.glob over manifests; scenes load lazily by id.

import type { GameContext, GameManifest } from '../games/types';

type SceneModule = {
  createScene(ctx: GameContext, search: URLSearchParams): Phaser.Scene;
};

const manifests = import.meta.glob<{ default: GameManifest }>('../games/*/manifest.json', {
  eager: true,
});
const scenes = import.meta.glob<SceneModule>('../games/*/scene.ts');

export function listGames(): GameManifest[] {
  return Object.values(manifests).map((m) => m.default);
}

export async function loadGameScene(
  id: string,
  ctx: GameContext,
  search: URLSearchParams,
): Promise<Phaser.Scene | null> {
  const path = `../games/${id}/scene.ts`;
  const loader = scenes[path];
  if (loader === undefined) return null;
  const module = await loader();
  return module.createScene(ctx, search);
}
