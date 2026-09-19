# Chronforge Echo working instructions

These instructions apply to this game and all work delegated within it.

- Do not run the game unless the user explicitly asks. This includes starting dev or preview servers, opening the game in a browser, headless playtests, and browser verification scripts such as `npm run verify` or `npm run verify:pages`. The user handles visual playtesting. Documented commands are reference material, not authorization to execute them.
- Do not run linting or formatting during development, including standalone ESLint, Prettier, lint, lint-fix, format, or format-check commands, unless explicitly requested. The pre-commit hook automatically fixes, lints, formats, and re-stages staged Echo files. Let it run on authorized commits; resolve any blocking errors without bypassing the hook.
- Use targeted static checks or pure Node tests when useful and allowed by the current request. They must not launch the game or a browser. Do not claim playtesting that was not performed.
- Keep changes within the requested scope. Inventory/menu work must not alter ATB behavior or shared consumable rules unless the user explicitly requests that change.
- Read the relevant [architecture](ARCHITECTURE.md) and [art direction](ART_DIRECTION.md) before changing those systems. Keep outstanding design decisions in [ROADMAP.md](ROADMAP.md).
- Keep disposable scripts, candidate art, captures, and reports inside the Git-ignored `.experiments/` directory. Commit only selected live assets and required source/tooling; runtime code and required tests must not depend on `.experiments/`.
