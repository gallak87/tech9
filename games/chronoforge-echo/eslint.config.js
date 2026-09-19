import js from '@eslint/js';
import globals from 'globals';
import {defineConfig, globalIgnores} from 'eslint/config';

export default defineConfig([
  globalIgnores(['.experiments/**', 'dist/**']),
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {globals: globals.browser},
  },
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.{js,mjs}', '*.config.js'],
    languageOptions: {globals: globals.node},
  },
  {
    // Browser harness callbacks run inside the page via Playwright.
    files: ['tests/**/*.mjs'],
    languageOptions: {globals: globals.browser},
  },
]);
