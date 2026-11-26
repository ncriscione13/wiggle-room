// The ONLY file allowed to contain color literals (CLAUDE.md rule 9, enforced
// by eslint.guardrails.js). Everything on screen gets its color from here.
//
// Palette intent (DESIGN.md "Design principles for ages 3-10"): muted pastels
// on soft mid-tone surfaces. No pure white, no saturated red, enforced by
// src/ui/theme.test.ts.
//
// index.html duplicates surfaceNight as its bootstrap background (documented
// exception; see docs/DECISIONS.md task 0.1). Keep the two in sync.

export const colors = {
  /** Main stage background: soft night blue (also in index.html bootstrap). */
  surfaceNight: '#2b3045',
  /** Deepest backdrop tone: gradient floors under surfaceNight. */
  surfaceDeep: '#1f2336',
  /** Raised cards and panels on the night surface. */
  surfaceRaised: '#3a4160',
  /** Light snowy surface for daytime scenes. */
  surfaceSnow: '#dce6f5',
  /** Main text: warm off-white (never pure white). */
  textSoft: '#e8e3d8',
  /** Secondary text on dark surfaces. */
  textDim: '#b8bdd4',
  /** Player 1 color ("Blue"). */
  playerBlue: '#9db8e8',
  /** Player 2 color ("Pink"). */
  playerPink: '#f2b8c6',
  /** Accents. */
  mint: '#a8d8b9',
  lavender: '#c5b8e8',
  peach: '#f5cdaa',
  butter: '#f2e3b3',
  ice: '#bfe3f2',
  meadow: '#b5d6a7',
} as const;

export type ColorToken = keyof typeof colors;

/** Slot 0 and slot 1 player colors, as theme token names (see PlayerInfo.color). */
export const playerColors: readonly [ColorToken, ColorToken] = ['playerBlue', 'playerPink'];

/** Type sizes are tuned for a 1080p TV seen from across a room. */
export const typography = {
  family: "'Segoe UI Rounded', ui-rounded, 'Segoe UI', system-ui, sans-serif",
  titlePx: 96,
  subtitlePx: 36,
  bodyPx: 24,
  captionPx: 28,
} as const;

export const theme = { colors, playerColors, typography } as const;
export type Theme = typeof theme;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

/** CSS computed-style form of a token, for tests and DOM comparisons. */
export function cssRgb(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${String(r)}, ${String(g)}, ${String(b)})`;
}

/** Token + alpha -> CSS rgba(), for canvas fills that need transparency. */
export function cssRgba(hex: string, alpha01: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String(alpha01)})`;
}

/** Phaser numeric color (0xRRGGBB) + alpha -> CSS rgba(). Lets a plain 2D
 * canvas accept the same numeric colors Phaser Graphics takes. */
export function cssRgbaFromNumber(color: number, alpha01: number): string {
  const r = Math.floor(color / 65536) % 256;
  const g = Math.floor(color / 256) % 256;
  const b = color % 256;
  return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String(alpha01)})`;
}

/** Number -> CSS px string (keeps numbers out of template literals elsewhere). */
export function px(n: number): string {
  return `${String(n)}px`;
}

/** Hex token -> Phaser numeric color (0xRRGGBB). */
export function phaserColor(hex: string): number {
  return parseInt(hex.slice(1), 16);
}
