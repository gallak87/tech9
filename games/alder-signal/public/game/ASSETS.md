# Alder Signal — original game assets

The new field equipment, route markers, interface graphics and radio/footstep/wind sounds are original procedural work authored for this owned game fork. They introduce no third-party downloaded assets.

- `src/game/FieldEquipment.js` is the editable source for the three survey relays, trailhead radio, amber route markers, generated instrument face textures and restored indicator lamps. Three.js primitives use metre-scale dimensions; canvas-generated labels use the browser's system sans-serif font. All geometry/textures are created locally at runtime and disposed with their layer.
- `src/game/GameUI.js` and `src/style.css` are the editable source for the interface and SVG route map. The locally bundled Barlow font retains `public/fonts/Barlow-OFL.txt`.
- `src/game/FieldAudio.js` is the editable source for the locally synthesized wind bed, radio cues and footsteps. Web Audio starts only after the player begins/resumes the mission. No recordings or remote audio are used.

The forest models, materials and their editable Blender sources remain the copied starter assets. Their existing source and license records remain in `public/assets/ASSETS.md`, `public/assets/textures/SOURCES.md`, and the `art/` tree. This note does not replace or relicense them.
