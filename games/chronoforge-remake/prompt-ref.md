# Goal
Build a complete 2D remake of Chronoforge in `games/chronoforge-remake/`, using only `games/chronoforge/src/` as the original-game reference. Preserve its recognizable characters, pixel-art identity, HUD shape, menu structure and navigation, and ATB battle scene. Fully remake and improve the story, character art and animation, progression, equipment, drops, environments, and exploration. Generate all visual assets from scratch. Deliver a cohesive, polished, playable game with a complete story arc.

# How to work
1. **Inspect and plan.** Read the original source to understand its gameplay, characters, systems, HUD, menus, and ATB scene. Identify missing or incomplete features. Write a concise `ARCHITECTURE.md` covering the remake’s systems, shared state, progression, world connections, saves, and new asset workflow. Make the creative and implementation decisions needed to finish the game.

2. **Complete the story.** Fill in the entire narrative: who Kaida, Vex, and Rune are, how they met, their relationships, what they are doing, why it matters, and how their journey develops and ends. Resolve missing motivations, connections, and story gaps through playable events, dialogue, exploration, and consequences.

3. **Generate new pixel art and animation.** Remake Kaida, Vex, Rune, their weapons, enemies, equipment, drops, environments, and interface artwork. Keep the recognizable pixel-art fashion with slightly higher fidelity and cohesive proportions, palettes, and detail. Give characters real frame-based animation for idle, walk, run, attack, and other necessary states. Make weapons and actions readable in motion. Do not substitute sliding or rotating static images for character animation.

4. **Fully implement progression and loot.** Expand and complete character levels, experience, stat growth, skills, and advancement. Do the same for weapons, armor, and other equipment, including item levels and upgrades. Connect drops, rewards, vendors, currency, and equipment to a balanced progression loop. Make upgrades understandable and consequential in actual gameplay.

5. **Preserve the ATB scene and improve its attacks.** Keep the existing ATB scene’s structure, layout, and core battle flow. Remake individual attack animations with clear timing, effects, and impact. Add coordinated double and triple attacks involving two or three party members, inspired by Chrono Trigger. Fully implement their availability, selection, costs, targeting, execution, and progression.

6. **Build a connected, explorable world.** Remake the environments into clean, cohesive, distinct biomes. Connect neighboring areas through wider walkable edges so players can move between them without an intervening black screen. Fully implement walkable rooms, functional doors, city centers, vendors, currency, and interactions. Make these spaces useful parts of the adventure.

7. **Improve the HUD and menus.** Preserve the HUD’s overall shape and the menus’ shape, structure, and navigation. Improve their artwork, typography, hierarchy, readability, feedback, and personality. Avoid the bland, boxy, border-outlined blue-green interface style. Choose a visual treatment that belongs to this game.

8. **Build, play, and refine.** Verify systems through actual gameplay as they are integrated. Inspect the generated art and animations in context. Test the complete journey from a fresh start through the ending, including progression, equipment, purchases, interiors, biome connections, individual and coordinated attacks, saving, loading, defeat, and retry. Fix broken, incomplete, or inconsistent features before delivery. Keep a concise `STATUS.md` recording verified progress and remaining issues.

# Rules
- Use only `games/chronoforge/src/` as the original-game reference. Do not draw from other Chronoforge versions or remake projects.
- Do not reuse, recolor, trace, or adapt existing sprites or other visual assets. Do not reuse the original sprite-generation mechanisms. Generate everything anew.
- Preserve Kaida, Vex, and Rune’s recognizable identities and the game’s pixel-art character.
- Keep the existing ATB scene, HUD shape, and menu structure and navigation while making the requested improvements.
- Fully implement the remake. Design notes, mockups, disconnected demonstrations, and placeholder systems do not count as completed features and are ripe for a creative redesign if they fit your new story/game.
- Make creative decisions independently and fill in the gaps. Do not stop for routine questions.
- Report what was actually built and tested using playwright to play the game. Do not invent validation or claim unfinished features work.