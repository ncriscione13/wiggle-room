import { fileURLToPath } from 'node:url';
import { ESLint, type Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import shippedConfig from '../eslint.config.js';
import { guardrailConfigs } from '../eslint.guardrails.js';

// Task 0.3 acceptance: prove the guardrail lint rules catch forbidden code and
// leave allowed code alone. Runs the exact rule configs the real eslint.config.js
// ships (imported from eslint.guardrails.js), applied to virtual file paths, so
// the path scoping is tested too.

// fileURLToPath (not URL.pathname) so clone paths with spaces or non-ASCII
// characters decode correctly on every OS (review fix).
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const eslint = new ESLint({
  cwd: repoRoot,
  overrideConfigFile: true,
  // typescript-eslint's flat-config types and eslint core's Linter.Config are
  // runtime-compatible but not mutually assignable (known ecosystem gap), so
  // the parser entry is bridged with an explicit cast -- no `any` involved.
  overrideConfig: [
    {
      files: ['**/*.ts'],
      languageOptions: { parser: tseslint.parser as unknown as Linter.Parser },
      plugins: { '@typescript-eslint': tseslint.plugin as unknown as ESLint.Plugin },
    },
    ...guardrailConfigs,
  ],
});

async function ruleIdsFor(code: string, filePath: string): Promise<string[]> {
  const results = await eslint.lintText(code, { filePath });
  return (results[0]?.messages ?? []).map((m) => m.ruleId ?? `fatal: ${m.message}`);
}

describe('the shipped eslint.config.js actually contains the guardrails', () => {
  // Review fix: proving the rules work is not enough -- if eslint.config.js
  // ever drops the `...guardrailConfigs` spread, `npm run lint` silently stops
  // enforcing everything while the rule tests stay green. This pins the wiring.
  it('ships every guardrail entry by name', () => {
    const shippedNames = shippedConfig.map((entry) => entry.name).filter(Boolean);
    for (const guardrail of guardrailConfigs) {
      expect(shippedNames, `eslint.config.js lost ${guardrail.name ?? '?'}`).toContain(
        guardrail.name,
      );
    }
  });
});

describe('guardrail: games never import from src/tracking (CLAUDE.md rule 1)', () => {
  it('catches a relative tracking import inside a game', async () => {
    const ids = await ruleIdsFor(
      "import { camera } from '../../tracking/camera';\ncamera;\n",
      'src/games/freeze-dance/scene.ts',
    );
    expect(ids).toContain('no-restricted-imports');
  });

  it('catches a bare ../tracking import inside a game', async () => {
    const ids = await ruleIdsFor(
      "import * as tracking from '../../tracking';\ntracking;\n",
      'src/games/bubble-pop/scene.ts',
    );
    expect(ids).toContain('no-restricted-imports');
  });

  it('allows the same import inside src/motion', async () => {
    const ids = await ruleIdsFor(
      "import { camera } from '../tracking/camera';\ncamera;\n",
      'src/motion/pipeline.ts',
    );
    expect(ids).toEqual([]);
  });

  it('allows games to import the game contract types', async () => {
    const ids = await ruleIdsFor(
      "import type { GameManifest } from '../types';\nexport type M = GameManifest;\n",
      'src/games/freeze-dance/scene.ts',
    );
    expect(ids).toEqual([]);
  });
});

describe('guardrail: MediaPipe stays inside src/tracking', () => {
  it('catches @mediapipe/tasks-vision imported from a game', async () => {
    const ids = await ruleIdsFor(
      "import { PoseLandmarker } from '@mediapipe/tasks-vision';\nPoseLandmarker;\n",
      'src/games/critter-dash/scene.ts',
    );
    expect(ids).toContain('no-restricted-imports');
  });

  it('catches @mediapipe/tasks-vision imported from src/motion', async () => {
    const ids = await ruleIdsFor(
      "import { PoseLandmarker } from '@mediapipe/tasks-vision';\nPoseLandmarker;\n",
      'src/motion/detectors.ts',
    );
    expect(ids).toContain('no-restricted-imports');
  });

  it('allows @mediapipe/tasks-vision inside src/tracking', async () => {
    const ids = await ruleIdsFor(
      "import { PoseLandmarker } from '@mediapipe/tasks-vision';\nPoseLandmarker;\n",
      'src/tracking/live-pose-source.ts',
    );
    expect(ids).toEqual([]);
  });
});

describe('guardrail: color literals only in src/ui/theme.ts (CLAUDE.md rule 9)', () => {
  it('catches a hex string outside theme.ts', async () => {
    const ids = await ruleIdsFor("const bad = '#ff0000';\nbad;\n", 'src/games/freeze-dance/ui.ts');
    expect(ids).toContain('no-restricted-syntax');
  });

  it('catches rgb()/hsl() strings outside theme.ts', async () => {
    const ids = await ruleIdsFor(
      "const bad = 'rgba(255, 0, 0, 0.5)';\nbad;\n",
      'src/shell/launcher.ts',
    );
    expect(ids).toContain('no-restricted-syntax');
  });

  it('catches a hex color inside a template string', async () => {
    const ids = await ruleIdsFor(
      'const css = `background: #a8d8b9;`;\ncss;\n',
      'src/debug/overlay.ts',
    );
    expect(ids).toContain('no-restricted-syntax');
  });

  it('catches a 6-digit 0x numeric color (Phaser style) outside theme.ts', async () => {
    const ids = await ruleIdsFor('const tint = 0x2b3045;\ntint;\n', 'src/games/bubble-pop/fx.ts');
    expect(ids).toContain('no-restricted-syntax');
  });

  it('allows color literals inside src/ui/theme.ts', async () => {
    const ids = await ruleIdsFor(
      "export const surfaceNight = '#2b3045';\nexport const tint = 0x2b3045;\n",
      'src/ui/theme.ts',
    );
    expect(ids).toEqual([]);
  });

  it('does not flag ordinary strings or numbers', async () => {
    const ids = await ruleIdsFor(
      "const sel = '#app';\nconst n = 0xff;\nsel;\nn;\n",
      'src/shell/dom.ts',
    );
    expect(ids).toEqual([]);
  });
});

describe('guardrail: no speechSynthesis outside dev tools (CLAUDE.md rule 10)', () => {
  it('catches bare speechSynthesis in src', async () => {
    const ids = await ruleIdsFor(
      "speechSynthesis.speak(new SpeechSynthesisUtterance('hi'));\n",
      'src/voice/narrator.ts',
    );
    expect(ids).toContain('no-restricted-globals');
  });

  it('catches window.speechSynthesis in src', async () => {
    const ids = await ruleIdsFor('window.speechSynthesis.cancel();\n', 'src/shell/settings.ts');
    expect(ids).toContain('no-restricted-properties');
  });

  it('allows speechSynthesis in tools/', async () => {
    const ids = await ruleIdsFor('speechSynthesis;\n', 'tools/voice-gen/preview.ts');
    expect(ids).toEqual([]);
  });
});

describe('guardrail: no network in src (CLAUDE.md rule 8)', () => {
  it('catches fetch in src', async () => {
    const ids = await ruleIdsFor("void fetch('/anything');\n", 'src/tracking/pose.ts');
    expect(ids).toContain('no-restricted-globals');
  });

  it('catches XMLHttpRequest and WebSocket in src', async () => {
    const xhr = await ruleIdsFor('new XMLHttpRequest();\n', 'src/games/freeze-dance/scene.ts');
    const ws = await ruleIdsFor("new WebSocket('ws://x');\n", 'src/motion/events.ts');
    expect(xhr).toContain('no-restricted-globals');
    expect(ws).toContain('no-restricted-globals');
  });

  it('allows fetch only in the local asset loader', async () => {
    const ids = await ruleIdsFor("void fetch('/models/pose.task');\n", 'src/assets/loader.ts');
    expect(ids).toEqual([]);
  });

  it('allows fetch in tools/ (fetch-models downloads the model at dev time)', async () => {
    const ids = await ruleIdsFor("void fetch('https://example.com');\n", 'tools/fetch-models.ts');
    expect(ids).toEqual([]);
  });
});

describe('guardrail: motion never runtime-imports games (layering)', () => {
  it('catches a runtime import from games inside the motion kit', async () => {
    const ids = await ruleIdsFor(
      "import { thing } from '../games/types';\nthing;\n",
      'src/motion/events.ts',
    );
    expect(ids).toContain('@typescript-eslint/no-restricted-imports');
  });

  it('allows type-only imports (the documented AgeMode edge)', async () => {
    const ids = await ruleIdsFor(
      "import type { AgeMode } from '../games/types';\nexport type X = AgeMode;\n",
      'src/motion/config.ts',
    );
    expect(ids).toEqual([]);
  });
});

describe('guardrail: no any (CLAUDE.md checklist)', () => {
  it('catches an explicit any annotation', async () => {
    const ids = await ruleIdsFor('export const x: any = 1;\n', 'src/motion/config.ts');
    expect(ids).toContain('@typescript-eslint/no-explicit-any');
  });

  it('catches "as any" casts, even in tools', async () => {
    const ids = await ruleIdsFor('export const x = 1 as any;\n', 'tools/clip-synth/gen.ts');
    expect(ids).toContain('@typescript-eslint/no-explicit-any');
  });
});
