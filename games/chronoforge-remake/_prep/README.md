# Local Aseprite workshop

This sprite preparation area belongs to **chronoforge-remake only**. This game
had no `_prep` folder before this setup. New sprites use layered Aseprite
documents. The user has authorized individual imagegen pose references for the
[current detailed Kaida run study](sources/kaida-run-v3/README.md).
Old `sprite-gen/` prompts and imagegen animation strips remain historical material.

## Set up this machine

From `games/chronoforge-remake`:

```sh
npm run aseprite:setup
npm run aseprite -- open _prep/.work/smoke/animation.aseprite
```

Setup fetches Aseprite and recursive submodules, verifies the source commit,
downloads and SHA-256 checks the matching official Skia archive, builds the
editor, and runs the complete sprite smoke test. Internet is needed on first
use. Reruns reuse the checkout/downloads and Ninja's incremental build. No pip
packages are needed. Limit parallelism with `npm run aseprite:setup -- --jobs 4`.

Downloads, builds and editor preferences live in ignored `_prep/.local/`.
Preferences use Aseprite's `ASEPRITE_USER_FOLDER` setting. Setup does not install
a system-wide application. Use our launcher to open this local build.

### Prerequisites on a fresh device

| Host | Install once before setup |
| --- | --- |
| macOS, Apple Silicon or Intel | Python 3.9+, Git, curl, CMake, Ninja, Apple Command Line Tools/SDK. With Homebrew: `brew install python cmake ninja`; install Apple's tools with `xcode-select --install` if needed. |
| Ubuntu/Debian, x86_64 | `sudo apt-get install python3 git curl cmake ninja-build clang g++ pkg-config libx11-dev libxcursor-dev libxi-dev libxrandr-dev libgl1-mesa-dev libfontconfig1-dev` |
| Windows, x64 | Python 3.9+, Git, curl, CMake, Ninja; Visual Studio 2022 with **Desktop development with C++** and the Windows SDK. Run in **x64 Native Tools Command Prompt for VS 2022**. No MinGW. |

Node/npm are only needed for the npm shortcuts and the existing game. Without
Node, run these directly (use `py -3` instead of `python3` on Windows):

```sh
python3 _prep/tools/aseprite.py setup
python3 _prep/tools/sprites.py smoke
python3 _prep/tools/aseprite.py open _prep/.work/smoke/animation.aseprite
```

macOS arm64 is built and verified here. Intel macOS, Linux x64, and Windows x64
have pinned archives and platform-specific setup paths, but were not compiled
on this machine. Other architectures fail early with the supported-host list.
Linux GUI use needs a desktop session.

### Verified checkpoint — 2026-09-14

On macOS arm64, Apple clang 21, CMake 4.4.3 and Ninja 1.13.2: source compilation
completed and a rerun reported no build work. The executable reports
`Aseprite 1.3.18.5-dev` (the upstream source build's version string). The desktop
editor opened `animation.aseprite`. All 14 script regression tests passed; the
eight-layer/eight-frame smoke test verified parenting, planted feet, recovery,
timing, tags, fixed origin, save/reopen and byte-identical repeat exports.
The existing game build and system tests also passed. No game sprite has been
replaced by this setup.

## Daily commands

The current work is the [detailed Kaida run pose study](sources/kaida-run-v3/README.md).
It contains reference images and a reproducible crop script; an editable rig
and run cycle have not been authored yet. The user approved the first full-stride
reference and requested the opposing stride with the sword raised.

The [originally drawn Kaida run v2](sources/kaida-run-v2/README.md) was rejected
for its appearance. Its eight-frame, nine-layer recipe remains a tooling example.
To re-export that historical source headlessly:

```sh
npm run sprites:kaida -- --review-only
```

Do not present v2 as the current candidate. To deliberately replace
the timeline from its drawing recipe, use `npm run sprites:kaida -- --rebuild`.
The source README records the complete process, correction decisions, validation,
and what needs changing for a new character or nonhumanoid. The user has not
approved runtime integration or expansion beyond this run.

The [former full movement draft](sources/kaida-full-set/README.md) is rejected
art: the user found offset thighs/legs, weak hip rotation, arm overlap, debris,
and standing-pose feet. Its metadata checks did not establish animation quality.
It remains historical material; do not use its clips as approved replacements.

The first character experiment is the
[Kaida cutout idle proof of concept](sources/kaida-idle-poc/README.md): a layered
adaptation of the approved reference with one short animation and scripted
previews. Re-export it with
`python3 _prep/sources/kaida-idle-poc/build.py --review-only`.

```sh
npm run aseprite -- doctor       # prerequisites and local executable
npm run aseprite -- path         # absolute executable path for other tools
npm run aseprite -- open         # editor
npm run aseprite -- run -- --version
npm run sprites -- smoke         # diagnostic fixture; safe to rerun
npm run test:prep                # script/contract regression tests
```

### Start a character

For the current study and planned layer review, follow the
[Kaida run v3 notes](sources/kaida-run-v3/README.md). The
[v2 recipe](sources/kaida-run-v2/README.md) is a tooling example, not approved art.
Reuse the tools but design anatomy and motion for each character.
The following older scaffold is useful for blocking
simple rigid parts, but a cutout bake alone is not finished character art.

```sh
npm run sprites -- new kaida
npm run aseprite -- open _prep/sources/kaida/master.aseprite
```

`new` creates an **empty** 64×80 RGB bind-pose document, eight named layers, a
fixed feet pivot and a copy of the example rig. It refuses existing asset
folders. The smoke puppet is deliberately crude calibration art, not a proposed
character design.

1. Draw the bind pose in `master.aseprite`, one body part per layer, one frame.
   Use real transparency, an agreed palette, and complete silhouettes.
2. Adjust `rig.json` for the character's canvas, origin, part pivots and clips.
   Match the full-canvas `origin` slice to the rig's feet anchor. Keep the same
   canvas and registration across directions and actions.
3. Bake and open the editable timeline:

   ```sh
   npm run sprites -- bake kaida
   npm run aseprite -- open _prep/sources/kaida/animation.aseprite
   ```

4. Refine baked cels in Aseprite: fix joints, redraw arcs/silhouettes, add
   anticipation/contact/recovery, and inspect playback with onion skin. Save
   the edited `animation.aseprite`.
5. Export and inspect the saved draft:

   ```sh
   npm run sprites -- export kaida
   npm run sprites -- inspect _prep/sources/kaida/animation.aseprite
   ```

Exports go to `_prep/exports/kaida/{sheet.png,sheet.json,receipt.json}`. Frames
retain their full canvas, order, durations, tags and slice metadata; layer names
are included. No trimming, duplicate merging, atlas rotation, background cleanup
or per-frame scaling. Empty frames, missing origins, overlapping/incomplete
tags, and broken export registration fail validation.

**Rebaking can replace manual timeline edits.** `bake` refuses an existing
animation unless passed `--force`. Save/commit before deliberately rebaking.
Failed bakes preserve the previous file. The one-frame master is never
overwritten by a bake. Save editor changes before exporting.

### Rig contract

Aseprite natively edits layers and cels. Our Lua script supplies a small
parented cutout rig and bakes ordinary editable cels. Use it to block motion,
then finish the frames as pixel art.

- `parts`: layer names, bind pivots in **canvas coordinates**, optional parent.
  List parents before children. Use flat named layers; order controls overlap.
- `origin`: fixed feet anchor matching a full-canvas slice named `origin`.
- `clips`: tags such as `idle.right`, `walk.down`, `attack.right`. Every frame
  belongs to exactly one tag. The template has idle and attack examples.
- Frames specify `duration_ms` and part transforms: integer pixel `x`/`y`
  offsets and `angle` in clockwise degrees. Child offsets follow the parent;
  the weapon can follow the hand. Feet can stay independent roots.
- Each frame is an explicit pose relative to the bind pose. Omitted transforms
  mean zero, not the previous key. There is no interpolation, inverse kinematics,
  mesh deformation or automatic walk-cycle creation.
- Rotation uses nearest-neighbor sampling. Clean up rotated pixels in Aseprite.
  Parts leaving the canvas fail the bake. Unrigged layers stay static.
- Baked `pivot.*` slices record **bind** pivots, not animated attachment tracks.

Draw separate directional views when mirroring would swap asymmetric equipment.
Agree on final size/style before replacing game art; 64×80 is a workshop default.

## Runtime promotion and git

This setup does not replace game sprites. `src/art.js` currently uses
six-column/eight-row hero atlases and separate idle sheets. The generic export
is not a drop-in replacement. When a character is ready, map its tags, timing
and fixed origin into the renderer (or export its required layout). Commit the
source, final PNG/metadata and mapping together. Review world/battle playback;
run applicable renderer tests and `npm run build`.

| Commit | Keep local / ignored |
| --- | --- |
| Setup scripts, lock, Lua, rig JSON, docs, tests | `.local/`: Aseprite checkout/submodules, Skia, binaries, build files, profile |
| Authored `sources/<id>/*.aseprite` and `rig.json` | `.work/`: smoke fixtures and inspection reports |
| Reviewed runtime exports in `assets/` | `exports/`: disposable draft exports |

Pull on another device, install its prerequisites, rerun setup. Never copy or
commit `.local/`. The lock contains no local paths. This initial setup commits
only our scripts/templates/docs/tests; diagnostic sprites are regenerated.

## Maintenance and recovery

- Aseprite pin: `v1.3.18.5`, commit `375989a61c3425cd4e8cdedfcfcca4bdfef7e1d9`.
  Matching Skia: `m124-08a5439a6b`. Four SHA-256 hashes were measured from official
  archives. Recursive submodule commits come from the pinned source.
  Setup never follows `main` or `latest`.
- Update deliberately: edit the source pin and matching `laf/misc/skia-tag.txt`
  dependency/checksums in `aseprite.lock.json`, rebuild, rerun checks.
- Receipt: `.local/build-receipt.json`. To keep a log after the first setup:
  `npm run aseprite:setup > _prep/.local/setup.log 2>&1`.
- Interrupted downloads retry and are verified before extraction. Submodule
  initialization resumes on rerun. Edited/mismatched source is rejected instead
  of reset; preserve edits and move the checkout aside to fetch it again.
- Failed builds resume. For a clean build, remove only the ignored
  `.local/build-<version>-<host>/` folder and rerun. Do this after moving the game
  to another filesystem path too: CMake stores absolute paths. Keep your sources.
- Setup holds `.local/setup.lock`. After a killed process, confirm setup has
  exited before removing a stale lock and rerunning.
- CMake 4 uses a minimum compatibility policy for bundled dependencies. macOS
  setup probes `<sstream>` and falls back to the active SDK's libc++ headers
  only if compiler header search is incomplete. No system tools or downloaded
  source files are patched.
- Restricted shells may block GitHub or desktop launch even when the executable
  exists. Use a normal terminal for the documented commands. Our launcher keeps
  editor preferences under `.local/profile/`.

## Upstream references

- [Pinned build instructions](https://github.com/aseprite/aseprite/blob/v1.3.18.5/INSTALL.md)
- [Official Skia release](https://github.com/aseprite/skia/releases/tag/m124-08a5439a6b)
- [CLI](https://www.aseprite.org/docs/cli/) and [scripting API](https://www.aseprite.org/api/)
- [Aseprite source license](https://github.com/aseprite/aseprite/blob/v1.3.18.5/EULA.txt)

The source and compiled editor remain local; distribute our setup scripts.
