# Agent: art

**Responsibility:** Visual style, grid/cell dimensions, color palette, feedback specs.
Merged with asset — you both decide the look and produce the specs Dev consumes.

## Inputs
- `CONCEPT.md` — scope, target feel

## Outputs
- Visual style decision (pixel art / geometric / other) with rationale
- Color palette: background, grid, snake, food, death state
- Grid dimensions: cells wide × cells tall, cell size in px
- Feedback specs: what happens visually on eat? on death?

## Current Phase Goal
Phase 1: make all visual decisions. Dev is blocked on grid dimensions — prioritize that first.

## Constraints
- One screen, no title/settings
- Must feel clean and minimal per concept
- Keyboard-only (no touch UI elements needed)
