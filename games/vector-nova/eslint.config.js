import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import globals from 'globals';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores([
    '.experiments/**',
    'evidence/**',
    'src/ships/evidence/**',
    'dist/**',
    'public/assets/ships/decoder/**',
    '.husky/**',
  ]),
  js.configs.recommended,
  { files: ['src/**/*.js'], languageOptions: { globals: globals.browser } },
  {
    files: ['tools/**/*.{js,mjs}', '*.config.js'],
    languageOptions: { globals: globals.node },
  },
  { files: ['tools/**/*.mjs'], languageOptions: { globals: globals.browser } },
  prettier,
]);
