# VECTOR//NOVA ownership and phase rules

Standalone app: do not import the repository frameworks or change reference games. Read ARCHITECTURE.md, docs/ART_BIBLE.md, ROADMAP.md and docs/STATUS.json before edits. Gate 1 is approved; Gate 2 is limited to the first complete level and core handling/presentation. Levels 2/3, other ships, menu expansion, powerups, enemies and additional racing systems/effects are deferred. Automatic bend alignment remains unchanged pending the user's Gate 2 decision.

Use narrow multi-agent builders with exclusive folders and one integrator. Builders request core/config/schema edits; never edit another builder's folder. Independent critics write no implementation and must inspect real browser motion. Run bounded critic rounds with honest separate scores; stop at first verified pass or ten rounds per gauntlet, never reset counters. Every roadmap phase ends with a human playtest gate. The user ended Gate 2 critic iterations after four completed rounds; do not resume the gauntlet or expand scope before their next instruction. Gate 2 awaits their playtest.

ESLint/Prettier/Husky follow Echo's workflow. Keep code formatted; run targeted lint/tests for changed modules and full npm run lint before handoff. Husky fixes/formats/re-stages app staged files. The package prepare script installs Husky during npm install; the short pre-commit hook invokes lint-staged. Do not add custom installation or routing wrappers. No commits without user request.

Transient captures/raw critic outputs belong in .experiments/ (git-ignored). Do not add screenshots/videos to src or tracked docs. Keep short findings and durable status/roadmap updates only. Do not claim 9/10, visual checks or performance checks without actual observations. No screenshots need to be included in the human delivery once critic inspection is complete; prioritize a playable URL and concise outcome.

User preference for Gate 2 reviews: do not open external reference videos or unsolicited visible browser windows. Review the local game through hidden/headless browser sessions. Qualify performance accordingly; foreground certification is unverified.

After automatic approval review rejected local propulsion video capture, use sequential screenshots and input/state snapshots for motion verification. Do not create or play new video recordings.
