import { describe, expect, it } from 'vitest';
import { colors, cssRgb, hexToRgb, playerColors, typography } from './theme';

// Task 0.4: the palette itself must obey the DESIGN.md comfort rules
// ("muted pastel palette on soft mid-tone backgrounds; no pure white screens
// or saturated reds"). These tests make the comfort rules executable.

const entries = Object.entries(colors) as [string, string][];

describe('theme palette comfort rules (DESIGN.md "Design principles")', () => {
  it('every token is a #rrggbb hex string', () => {
    for (const [name, value] of entries) {
      expect(value, name).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('contains no pure or near-pure white', () => {
    for (const [name, value] of entries) {
      const { r, g, b } = hexToRgb(value);
      expect(r >= 250 && g >= 250 && b >= 250, `${name} is near-white`).toBe(false);
    }
  });

  it('contains no saturated red', () => {
    for (const [name, value] of entries) {
      const { r, g, b } = hexToRgb(value);
      expect(r >= 200 && g <= 90 && b <= 90, `${name} is a saturated red`).toBe(false);
    }
  });

  it('defines exactly two player colors, visibly distinct from each other', () => {
    expect(playerColors).toHaveLength(2);
    const [a, b] = playerColors;
    const ca = hexToRgb(colors[a]);
    const cb = hexToRgb(colors[b]);
    const distance = Math.hypot(ca.r - cb.r, ca.g - cb.g, ca.b - cb.b);
    expect(distance, 'player colors too similar').toBeGreaterThan(60);
  });

  it('player colors sit on the mid/light range so they pop on the night surface', () => {
    for (const token of playerColors) {
      const { r, g, b } = hexToRgb(colors[token]);
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      expect(luma, `${token} too dark for the night background`).toBeGreaterThan(120);
    }
  });
});

describe('theme helpers', () => {
  it('hexToRgb and cssRgb round-trip a token', () => {
    for (const [, value] of entries) {
      const { r, g, b } = hexToRgb(value);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(255);
      expect(cssRgb(value)).toBe(`rgb(${String(r)}, ${String(g)}, ${String(b)})`);
    }
  });

  it('typography uses a rounded system stack and TV-size type', () => {
    expect(typography.family).toContain('system-ui');
    expect(typography.titlePx).toBeGreaterThanOrEqual(64);
    expect(typography.bodyPx).toBeGreaterThanOrEqual(20);
  });
});
