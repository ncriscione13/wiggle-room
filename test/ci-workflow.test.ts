import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Task 0.8: guard the CI contract -- every push runs npm ci + npm run check;
// main additionally deploys to GitHub Pages with the repo-name base path.
// String-level checks on purpose: no YAML parser dependency.

const yml = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

describe('GitHub Actions workflow (task 0.8)', () => {
  it('runs on every push', () => {
    expect(yml).toMatch(/on:\s*\n\s+push:/);
  });

  it('installs with npm ci and runs the full check gate as real steps', () => {
    // `- run:` prefixes so a comment mentioning the command can't satisfy the
    // assertion (review fix).
    expect(yml).toContain('- run: npm ci');
    expect(yml).toContain('- run: npm run check');
  });

  it('fetches the pose model and installs the Playwright browser', () => {
    expect(yml).toContain('npm run fetch-models');
    expect(yml).toContain('playwright install');
  });

  it('deploys to Pages only from main, after the check job', () => {
    expect(yml).toContain("if: github.ref == 'refs/heads/main'");
    expect(yml).toMatch(/needs:\s*check/);
    expect(yml).toContain('actions/deploy-pages');
  });

  it('builds with the repo-name base path for Pages', () => {
    expect(yml).toContain('BASE_PATH: /${{ github.event.repository.name }}/');
  });
});
