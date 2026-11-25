import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

// Base lint setup (task 0.2). The project guardrail rules (layering, colors,
// no speechSynthesis, no network, no any) are added in task 0.3.
export default tseslint.config(
  {
    ignores: [
      'dist',
      'dev-dist',
      'node_modules',
      'coverage',
      'playwright-report',
      'test-results',
      'blob-report',
      'public',
    ],
  },
  {
    files: ['**/*.ts'],
    extends: [eslint.configs.recommended, ...tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [eslint.configs.recommended],
  },
);
