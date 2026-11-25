// Project guardrail lint rules (task 0.3). This module is the single source of
// truth: eslint.config.js ships these entries, and test/lint-guardrails.test.ts
// runs exactly these entries against virtual files to prove they bite.
//
// Flat-config note: when two entries match the same file and set the same rule,
// the later entry replaces the earlier one's options for that rule. Entries
// below are composed so every file sees the full set it needs (e.g. games get
// the tracking AND mediapipe import bans in one rule config).

const TRACKING_IMPORT = {
  group: ['**/tracking', '**/tracking/**'],
  message:
    'Games never import from src/tracking/ (CLAUDE.md rule 1). Use the typed events and ' +
    'per-player state on GameContext instead.',
};

const MEDIAPIPE_IMPORT = {
  group: ['@mediapipe/**'],
  message:
    'Only src/tracking/ talks to MediaPipe (CLAUDE.md rule 1). Everything else consumes ' +
    'the motion kit events or PoseSource frames.',
};

const SPEECH_MESSAGE =
  'speechSynthesis is banned in production code (CLAUDE.md rule 10): Chrome desktop voices ' +
  'need internet and vary by machine. Use narrator.say(lineId) with pre-rendered clips.';

const NETWORK_MESSAGE =
  'No network at runtime (CLAUDE.md rule 8). Local assets load through src/assets/loader.ts; ' +
  'nothing else in src/ may fetch or open sockets.';

const speechGlobals = [
  { name: 'speechSynthesis', message: SPEECH_MESSAGE },
  { name: 'SpeechSynthesisUtterance', message: SPEECH_MESSAGE },
];

const networkGlobals = [
  { name: 'fetch', message: NETWORK_MESSAGE },
  { name: 'XMLHttpRequest', message: NETWORK_MESSAGE },
  { name: 'WebSocket', message: NETWORK_MESSAGE },
  { name: 'EventSource', message: NETWORK_MESSAGE },
];

const hosts = ['window', 'globalThis', 'self'];
const speechProps = hosts.map((object) => ({
  object,
  property: 'speechSynthesis',
  message: SPEECH_MESSAGE,
}));
const networkProps = [
  ...hosts.flatMap((object) => [
    { object, property: 'fetch', message: NETWORK_MESSAGE },
    { object, property: 'XMLHttpRequest', message: NETWORK_MESSAGE },
    { object, property: 'WebSocket', message: NETWORK_MESSAGE },
    { object, property: 'EventSource', message: NETWORK_MESSAGE },
  ]),
  { object: 'navigator', property: 'sendBeacon', message: NETWORK_MESSAGE },
];

const COLOR_MESSAGE =
  'Color literals live only in src/ui/theme.ts (CLAUDE.md rule 9). Import a theme token.';

// #rgb / #rgba / #rrggbb / #rrggbbaa anywhere inside a string.
const HEX_COLOR = '#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\\b';
// rgb( / rgba( / hsl( / hsla( anywhere inside a string.
const FUNC_COLOR = '\\b(rgba?|hsla?)\\s*\\(';

const colorSelectors = [
  { selector: `Literal[value=/${HEX_COLOR}/]`, message: COLOR_MESSAGE },
  { selector: `TemplateElement[value.raw=/${HEX_COLOR}/]`, message: COLOR_MESSAGE },
  { selector: `Literal[value=/${FUNC_COLOR}/]`, message: COLOR_MESSAGE },
  { selector: `TemplateElement[value.raw=/${FUNC_COLOR}/]`, message: COLOR_MESSAGE },
  {
    // Phaser-style numeric colors: exactly six hex digits (0x2b3045). Shorter
    // hex numbers (masks like 0xff) stay legal.
    selector: 'Literal[raw=/^0[xX][0-9a-fA-F]{6}$/]',
    message: COLOR_MESSAGE,
  },
];

export const guardrailConfigs = [
  {
    name: 'guardrail/colors-only-in-theme',
    // Broad on purpose: future .tsx/.js files don't get a color loophole.
    files: ['**/*.{ts,tsx,js,mjs,cjs}'],
    // theme.ts is where colors live; its own test verifies rgb() formatting;
    // the guardrail test holds forbidden color fixtures as plain strings.
    ignores: ['src/ui/theme.ts', 'src/ui/theme.test.ts', 'test/lint-guardrails.test.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...colorSelectors],
    },
  },
  {
    name: 'guardrail/no-explicit-any',
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    name: 'guardrail/no-speech-synthesis-in-tests',
    files: ['test/**/*.ts', 'e2e/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', ...speechGlobals],
      'no-restricted-properties': ['error', ...speechProps],
    },
  },
  {
    name: 'guardrail/no-network-or-speech-in-src',
    files: ['src/**/*.ts'],
    ignores: ['src/assets/loader.ts'],
    rules: {
      'no-restricted-globals': ['error', ...speechGlobals, ...networkGlobals],
      'no-restricted-properties': ['error', ...speechProps, ...networkProps],
    },
  },
  {
    name: 'guardrail/asset-loader-may-fetch-local-only',
    files: ['src/assets/loader.ts'],
    rules: {
      'no-restricted-globals': ['error', ...speechGlobals],
      'no-restricted-properties': ['error', ...speechProps],
    },
  },
  {
    name: 'guardrail/mediapipe-only-in-tracking',
    files: ['src/**/*.ts'],
    ignores: ['src/tracking/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [MEDIAPIPE_IMPORT] }],
    },
  },
  {
    name: 'guardrail/games-never-import-tracking',
    files: ['src/games/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [MEDIAPIPE_IMPORT, TRACKING_IMPORT] }],
    },
  },
  {
    name: 'guardrail/motion-never-runtime-imports-games',
    files: ['src/motion/**/*.ts'],
    rules: {
      // The motion kit sits below the game API: runtime imports from games
      // would invert the layering. Type-only imports are erased at compile
      // time and allowed (the documented AgeMode edge, DECISIONS 0.4).
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/games', '**/games/**'],
              allowTypeImports: true,
              message:
                'The motion kit never runtime-imports from src/games/ (layering: ' +
                'tracking -> motion -> game API -> games). Type-only imports are fine.',
            },
          ],
        },
      ],
    },
  },
];
