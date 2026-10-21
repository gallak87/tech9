import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
export default [
  {
    ignores: ['dist/**', '.artifacts/**', 'node_modules/**'],
  },
  {
    files: ['**/*.{js,mjs}'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
  },
  prettier,
];
