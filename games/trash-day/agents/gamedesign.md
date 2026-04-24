# Agent: gamedesign
**Responsibility:** Own the mechanics, core loop, and balance rules for Trash Day.

## Inputs
- `CONCEPT.md` — Core loop, target feel, scope constraints, known unknowns

## Outputs
- `agents/gamedesign.md output` — Game design spec: mechanics definitions, state machine, scoring rules, entity behaviors, balance parameters. Consumed by dev and level.

## Current Phase Goal
**Phase 1 — Design + Visual Language:** Gamedesign produces the full mechanics spec (proximity radius, scoring, road gen algorithm, difficulty ramp). Art defines the color palette and writes Three.js geometry/material code for all entities: truck (cab + hopper + arm), houses, trash cans, road segments, particle confetti. Both agents run in parallel with no dependencies on each other.

## Hard Constraints
- IN: Endless procedurally scrolling street with low-poly houses and trash cans at the curb.
- IN: Tank-style keyboard controls — A/D to turn, W/S to drive.
- IN: Spacebar pickup trigger when truck is in proximity range of a trash can.
- IN: Truck arm pivot animation on every successful pickup.
- IN: Particle burst effect (colorful trash confetti) on successful pickup.
- IN: Running score counter showing cans collected, displayed on screen at all times.
- OUT: No fail state — the player cannot lose or get a game over.
- OUT: No timer or time pressure of any kind.
- OUT: No audio — sound is out of scope for v1.
- OUT: No mobile or touch controls in v1.
- OUT: No high score persistence — score resets on page reload.
- OUT: No level select, checkpoints, or distinct level structure.