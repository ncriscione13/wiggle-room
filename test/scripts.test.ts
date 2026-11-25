import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Task 0.2 acceptance: every script PLAN.md names exists, and `check` is the
// fail-fast gate in the required order. This guards the gate itself: if someone
// reorders or drops a stage, the build goes red.

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  scripts?: Record<string, string>;
};
const scripts = pkg.scripts ?? {};

describe('npm scripts (task 0.2)', () => {
  it.each([
    'dev',
    'dev:lan',
    'build',
    'preview',
    'test',
    'lint',
    'typecheck',
    'e2e',
    'bench',
    'voice',
    'check',
  ])('defines "%s"', (name) => {
    expect(scripts[name], `missing npm script "${name}"`).toBeTruthy();
  });

  it('check = typecheck → lint → test → build → e2e, fail-fast (&&)', () => {
    expect(scripts['check']).toBe(
      'npm run typecheck && npm run lint && npm run test && npm run build && npm run e2e',
    );
  });

  it('dev:lan serves HTTPS to the LAN (lan mode turns on basic-ssl and host)', () => {
    expect(scripts['dev:lan']).toContain('--mode lan');
  });
});
