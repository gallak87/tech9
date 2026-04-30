# Agent: art
**Responsibility:** Define the visual language for Snake2.

## Inputs
- `CONCEPT.md` — Target feel, genre, scope constraints
- `agents/gamedesign.md output` — Mechanics and state machine — visual direction should reflect what the game does

## Outputs
- `agents/art.md output` — Visual spec: style decision, color palette, sprite/grid dimensions, feedback specs (death, score, win). Consumed by asset and dev.

## Current Phase Goal
**Phase 1 — Design + Visual Direction:** gamedesign writes the full mechanics spec (pickup tier rules, spawn promotion probability, speed escalation formula, state machine). art writes the CSS visual spec (neon palette, per-tier colors and glow values, flash animation keyframe parameters, grid cell sizing).

## Constraints
- IN: Three pickup tiers — common, rare, legendary — with distinct CSS colors and flash effects.
- IN: Live score display — shown on screen, resets on death, no persistence.
- IN: Speed escalation — snake tick rate shortens by ~5ms every 50 points, capping at a max difficulty floor.
- IN: Screen/grid CSS flash animation on pickup — intensity (duration + brightness) scales with tier.
- OUT: No leaderboard, no localStorage, no initials entry.
- OUT: No audio — no sound effects or music.
- OUT: No power-ups beyond the three pickup tiers — no shields, slow-mo, bombs, etc.
- OUT: No sprite assets — all visuals are pure CSS (backgrounds, borders, box-shadow, keyframe animations).
- OUT: No mobile touch controls — keyboard only for v1.
## Capability Docs
- `capabilities/image-gen.md`
