import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import globals from 'globals';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['.artifacts/**', 'dist/**', 'public/**']),
  js.configs.recommended,
  { files: ['src/**/*.js'], languageOptions: { globals: globals.browser } },
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.{js,mjs}', '*.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // Playwright callbacks execute in the browser page.
    files: ['tests/**/*.mjs', 'scripts/capture.mjs'],
    languageOptions: { globals: globals.browser },
  },
  prettier,
]);
