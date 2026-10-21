# Stillwater — The quiet hours

A first-person catch-and-release escape at a sheltered forest pond. Walk to the bank, cast a float, set the hook when it dives, and ease off the reel when the trout pulls. Built as an owned `forest-exploration` fork; pond, walking, tackle, trout and fishing rules are local to this game.

## Run

For this installed worktree, run `./play.sh` from this directory. It uses a supported system Node or the bundled Codex Node runtime and serves http://127.0.0.1:4440.

For a fresh installation, use Node **^22.13 or 24+**:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:4440. The production preview is `npm run build && npm run preview` on port 4441. All assets/fonts are local. Initial dependency installation needs network access. Installation does not change repository hooks.

## Play

- **W A S D / arrows** walk; **Shift** walks faster. The bank blocks entry to water.
- **Right mouse drag** looks. **I J K L** also aim. “Capture mouse” enables free mouse look; Escape releases and pauses.
- Hold **Space** (or left mouse) to build cast power, then release. The ring marks the landing point; aim over water.
- Watch the float. When “Set the hook” appears, press **Space** within 2.2 seconds.
- Hold **Space** to reel. Let go when the trout pulls or tension gets high. The two bars show line tension and distance to land.
- A catch shows the trout and a catch card. **Space** or “Release & cast again” returns it.
- **Escape / P** pauses. The pause menu has resume, five graphics settings and restart. Focus loss pauses too.
- Failed casts, missed bites and snapped lines give a reason; **Space** readies another attempt.

The first bite arrives 4.5–7.3 seconds after the float settles. A careful fight takes roughly 45 seconds; allow a couple of minutes to learn the controls. Desktop keyboard/mouse only. All feedback is visual; no audio is included.

## Verification

```sh
npm test
npm run lint
npm run verify:game
```

Browser checks use port 4442 and an installed Playwright Chromium. `CHROMIUM_PATH` can select a local browser. Reports and temporary images go to ignored `.artifacts/verification`. Tests send real input through a complete catch, release and recast plus recovery states. Read-only snapshots exist only at `?test=1`; no hook can award a catch.

See [architecture](ARCHITECTURE.md) for ownership and current limits. Review reports and temporary consumer notes stay local and ignored. The receipt `tech9.json` and copied `GAME_PLAN.json` preserve the starter provenance.

## Scope and limitations

One pond, one procedural brook trout, one rod and one attempt at a time. The fish/rod are geometric prototypes; the player has no animated hands. Static forest shadows, approximate trunk/rock collisions, and a bounded low-resolution planar reflection prioritize frame time. There are no boats, swimming, inventory, economy or mobile controls.

New visual assets are authored in code; see [asset sources](public/assets/STILLWATER_SOURCES.md). The original forest assets, Blender sources and license records remain included.

Native mouse capture and operating-system focus loss were unavailable to the automated browser on this host. Right-drag and keyboard look are verified; pause handlers have persistent unit tests. These two native interactions remain a manual playtest limitation.
