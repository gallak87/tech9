# First-level verification

From the application directory, `npm test` runs physics, camera, track, lap-order
and audio lifecycle checks. `npm run verify` starts/reuses port 5179, waits for
runtime readiness and exercises real keyboard controls. Screenshot sequences,
snapshots, input logs, environment details and pass/fail results go to ignored
`.experiments/`. No video recording or playback is used.

For the production application, start `npm run preview`, then run:

```sh
VN_URL=http://127.0.0.1:5180 npm run verify
VN_URL=http://127.0.0.1:5180 node tools/lap-run.mjs
```

The second command drives one complete circuit with actual keyboard events and a
feedback controller confined to this verification tool. It allows 110 seconds,
captures section stills, checks a valid lap and compares the recorded fixed-step
replay with its original final state. It does not evaluate human driving feel.
The game does not import this driver.

`VN_EVIDENCE` selects the output directory. The main harness accepts
`VN_BROWSER_PATH` or `VN_BROWSER_CHANNEL`; otherwise it prefers installed macOS
Chrome, falling back to Playwright Chromium. Keep sessions hidden/headless under
the user's review preference. Browser launch may need shell sandbox permission.
The harness keeps any development server it starts running.

Capture timings include overhead. Headless results and responsive viewport
screenshots do not establish foreground performance, physical mobile/gamepad
support or audible sound quality. Independent timing runs omit screenshots.
