import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
export default [
  {
    ignores: [
      '**/legacy/**',
      '**/scenes/**',
      '**/node_modules/**',
      '**/dist/**',
      '**/.artifacts/**',
    ],
  },
  {
    files: ['**/*.mjs'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
  },
  {
    files: ['modules/**/*.js', 'scaffolds/**/*.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
  },
  prettier,
];
