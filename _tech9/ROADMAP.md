# Roadmap

- Improve baseline frame pacing, overdraw, LOD/culling and shadow cost. See the [baseline roadmap](./baseline/ROADMAP.md).
- Extend modules in response to game requirements and reusable implementations.
- **World composition:** build a real level containing connected forest and canyon regions after the standalone canyon and weather integration. Keep reusable landscape assets, materials, placement and terrain construction separate from authored level layouts. Compose regions under one renderer, controller and weather state, with continuous terrain/material transitions and consistent collision, surface and shelter queries. Use that level to establish the smallest useful landscape-module interfaces and bounded detail/loading behavior. Completion means ordinary traversal across both regions with coherent visuals, contacts and weather. This is future capability work, independent of root graduation.
- Graduate the framework to the repository root using the [relocation checklist](./docs/MIGRATION.md).
