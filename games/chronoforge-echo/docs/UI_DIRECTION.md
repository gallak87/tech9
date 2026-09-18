# Accepted UI direction

This records the user's approved direction after reviewing the interactive menu and battle concepts. It supersedes the original brief's teal/gold UI palette and the earlier deferred-menu roadmap. It does not change world or character art palettes.

## Expedition menu

- Preserve the exact seven tabs: Map, Party, Inventory, Skills, Quests, Save, Settings.
- Use a broad, geometric shell and character-centered equipment composition. The influence is layout, not another game's branding or content.
- Keep parchment on interior menu pages only. Render actual game data and map discovery, not prototype sample records.
- Use Barlow for controls, names, and numeric readouts; EB Garamond for parchment prose and editorial headings. Bundle fonts locally.
- Remove the diamond/emblem beside the title. Set ECHO in a deep lava-orange accent.
- Preserve equipment, consumables, technique learning, travel, save/load, settings, scrolling, keyboard shortcuts, and layered Escape behavior.
- Favor compact desktop slot rows. Quests have type/act/status plus real reward icons in their first row, and title beside objective in their second row; narrative benefits must not masquerade as numeric rewards.

## Battle

- Fold through character, command, target, and timing. Completed choices stay compact and recoverable; Left backs out. Escape retains global pause/menu behavior.
- Use actual combat state, costs, targets, readiness, and timing opportunities. Do not adopt the standalone preview's simplified combat simulation.
- After the action finishes, return automatically to character selection. Show a faint neutral selection while no hero is charged. Automatically select the first newly ready hero; a later arrival must not steal an active selection.
- Use neutral near-black/gray surfaces. Reserve lava orange for active choices, calls to action, and critical cues. No teal or blue panel tint.
- On entry into the real critical-input window, blink the orange bar and timing panel outline on/off/on with hard steps, never a fade. Revert to neutral outside the window. Reduced motion uses a steady cue.
- Defend shares Attack’s marker, duration, input window and fresh-press protection. A successful timing input gives critical guard: 75% damage reduction until the next action; missing retains normal 65% guard.
- A capped notch remains at the accepted input position while the white marker continues to contact. It persists through recovery on Attack, Defend, and incoming guard; successful notches use lava orange and missed inputs stay neutral. Timed hero critical hits deal 1.44× base damage; random critical hits outside the timing window retain 1.6×. Timing chance and window widths are unchanged.
- Remove the duplicate currency/item reward text in combat. Keep the existing postbattle reward notification path.

## Overworld, dialogue, and rewards

- No parchment in HUD, conversations, rest/sleep choices, returns, shops, or pickups. Use compact near-black surfaces without a color cast, restrained padding, and lava-orange outlines.
- Signs use detailed generated world sprites and a compact text-only reader. A sign title or unidentified narrator must not invent a character portrait.
- Escape and Backspace dismiss the visible reading/conversation layer without firing continuation callbacks or choosing a story branch. If the atlas covers a conversation, first close the atlas, then the conversation. A dismissed ending retains its exact place and has an explicit world-only resume action.
- Replace golden interface outlines throughout the UI. The shared outline/glow accent is `#df702e`; text variants may be adjusted for legibility.
- Put the location name/subtitle in a slim strip beneath the minimap. Move the field objective to the top near the currency counters. Preserve a useful location display with the minimap disabled.
- Place interaction prompts above or below the actual object in camera coordinates, clamped to the visible play area. A prompt for a nearby pickup must stay near that pickup.
- Purchase activation opens a compact exact-cost confirmation. A separate fresh Space/Enter buys; Escape returns to the selected shop row. Recheck cost, availability and funds at confirmation.
- Earned recruitment includes a brief saved walk into formation, then a portrait notice naming the new companion. Escape pauses, Enter/Space skips, and reduced motion settles immediately.
- Keep the existing faint loot-glow intensity and rhythm; change its hue to lava orange.
- Reward notices use compact neutral surfaces and lava-orange outlines, with readable item icons and quantities. Use a quick arrival, a short readable hold, and a quick departure; respect reduced motion and queue simultaneous gains.
- Refresh resource, consumable, and eligible item icons as detailed generated sprites that remain recognizable at HUD size. Preserve weapon, armor, world-drop, and character sprites.

## Review

Integration must be judged in actual game screens, with functioning keyboard/mouse interactions and preserved saves. A working prototype alone does not establish completion. The user will perform the next full sweep after the production changes are verified.
