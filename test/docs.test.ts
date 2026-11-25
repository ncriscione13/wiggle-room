import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Task 0.9: README with the privacy note, Apache-2.0 LICENSE, ASSETS.md.

const read = (rel: string): string => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

describe('project docs (task 0.9)', () => {
  it('README carries the privacy promise', () => {
    const readme = read('README.md');
    expect(readme).toContain('# Wiggle Room');
    expect(readme.toLowerCase()).toContain('privacy');
    expect(readme).toContain('no accounts');
    expect(readme).toContain('never leaves');
  });

  it('LICENSE is Apache-2.0', () => {
    const license = read('LICENSE');
    expect(license).toContain('Apache License');
    expect(license).toContain('Version 2.0, January 2004');
  });

  it('ASSETS.md lists the shipped third-party assets', () => {
    const assets = read('ASSETS.md');
    expect(assets).toContain('pose_landmarker_lite');
    expect(assets.toLowerCase()).toContain('apache-2.0');
  });
});
