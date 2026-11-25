// Playwright global setup (task 0.7): make sure the synthetic clips exist
// before the replay-mode tests run. One process, so no generation races.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export default function globalSetup(): void {
  const marker = join('test', 'clips', 'synthetic', 'still-30s.json');
  if (!existsSync(marker)) {
    console.log('global-setup: generating synthetic clips...');
    execFileSync('node', [join('tools', 'clip-synth', 'run.ts')], { stdio: 'inherit' });
  }
}
