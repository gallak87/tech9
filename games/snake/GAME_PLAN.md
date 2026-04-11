# Snake — Game Plan

## Team

| Agent | Active | Notes |
|-------|--------|-------|
| `gamedesign` | No | Concept doc covers it — no separate agent needed |
| `art` | Yes | Merged with asset — decides visual style and produces all specs |
| `asset` | Merged into `art` | |
| `level` | No | No levels |
| `audio` | Yes | Minimal scope: eat SFX + death SFX only |
| `dev` | Yes | Core implementation |
| `qa` | Yes | Playtest pass after dev |
| `devops` | Yes | Build + deploy |
| `release` | No | Out of scope |
| `postlaunch` | No | Out of scope |

Active agents: **art, audio, dev, qa, devops**

## Phase Plan

### Phase 1 — Visual + Foundation (parallel)
- `art`: decide visual style, grid/cell dimensions, color palette, death/eat feedback
- `devops`: scaffold project, set up build pipeline and deploy target
- No dependency between these — run in parallel

### Phase 2 — Build
- `dev`: implement grid, snake movement tick, input handling, eat logic, collision detection, score, game over + restart
- `dev` consumes `art` output for visual decisions

### Phase 3 — Polish
- `audio`: pick/generate eat SFX and death SFX, specify how they integrate
- `dev`: integrate audio, apply any visual polish from art pass

### Phase 4 — Ship
- `qa`: full playtest — movement feel, death detection accuracy, edge cases (spawn on snake, 180° turn)
- `devops`: production build + deploy
- `dev`: fix QA bugs

## Key Decisions Deferred to Agents
- Tech stack and engine (Dev)
- Grid size, cell size, canvas dimensions (Art + Dev together)
- Visual style direction (Art)
- Audio tooling and file format (Audio)
- Deploy target (DevOps)
