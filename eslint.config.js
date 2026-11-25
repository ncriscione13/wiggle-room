import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import { guardrailConfigs } from './eslint.guardrails.js';

// Base lint setup (task 0.2) + project guardrails (task 0.3, see
// eslint.guardrails.js; proven by test/lint-guardrails.test.ts).
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
  ...guardrailConfigs,
);
