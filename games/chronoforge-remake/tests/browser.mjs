import {createRequire} from 'node:module';
const local=createRequire(import.meta.url);
let playwright;
try {playwright=local('playwright');}
catch {const bundled=process.env.PLAYWRIGHT_PACKAGE||'/Users/g/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json';playwright=createRequire(bundled)('playwright');}
export const {chromium}=playwright;
