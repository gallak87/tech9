# Sprite handoff

For fresh generation, use only each hero's reference image and manifest in `sprite-gen/`. They contain the design, layout and short animation prompts. No prior experiments or game code are needed.

## When integrating approved sprites

- `src/art.js` is the shared world/battle renderer. Movement and actions use `assets/{kaida,vex,rune}.png`; side-facing idles use the sheets registered in `src/hero-idle.js`.
- Distance-based motion phase is prepared in `src/hero-motion.js`, passed through `game.js` and `render.js`, but **not consumed by `art.js` yet**. Current frames still advance with elapsed time.
- Existing comparison: `/art-lab/kaida-guided-idle/`. Battle browser: `/?dev=1&preview=battles`.
- The user handles visual playtesting.
