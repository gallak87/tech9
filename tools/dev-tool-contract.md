# Dev Tool Contract

Rules for dev tools built during art generation phases. Every tool built under this
contract is automatically stripped at ship time.

---

## What a dev tool is

A lightweight in-game overlay mounted by the dev agent when the art agent enters a new
sprite domain. It gives the user real in-game context for art decisions — not a PNG in
chat. One tool per domain, stays live for the duration of that domain's generation.

Examples:
- **Terrain domain** → floating panel cycling through generated tile sets on the live map
- **Hero domain** → overlay showing the hero sprite in idle/walk/attack states over a background
- **Building domain** → side-by-side panel showing upgrade tiers as they complete
- **Enemy domain** → encounter preview showing the enemy sprite at battle scale

---

## Mount pattern

```js
// Wrap in env check — stripped at build time when DEV_TOOLS=false
if (import.meta.env?.DEV_TOOLS !== 'false') {
  (function mount<DomainName>DevTool() {
    // minimal DOM, no framework
    // reads from the live asset paths the art agent is writing to
    // updates as new sprites land (poll or hot-reload)
  })();
}
```

Rules:
- One IIFE per domain, clearly labelled `// DEV TOOL — <domain>`
- No coupling to game state or save data — read assets only
- Positioned so it doesn't obscure the primary game view
- Removable by deleting the IIFE block — no other code depends on it

---

## Env gate

Add to the game's build/serve config:

```
DEV_TOOLS=true   # default during development
DEV_TOOLS=false  # set before final ship build
```

For static builds with no bundler, use a global:

```js
// index.html, before game.js
window.__DEV_TOOLS__ = true; // removed at ship time
```

And check `window.__DEV_TOOLS__` instead of `import.meta.env`.

---

## Ship gate

Final phase checklist item (dev agent owns this):
- [ ] Set `DEV_TOOLS=false` (or remove `window.__DEV_TOOLS__ = true`)
- [ ] Confirm no dev tool overlays visible in the build
- [ ] Remove IIFE blocks if desired for clean source (optional — env gate is sufficient)
