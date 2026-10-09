# Gameplay music

Finish one Halcyon track, then use the process for the remaining circuits. **Codex composes, renders and revises; the user listens and gives musical feedback.** Keep one current source and preview per track. Overwrite the preview and update the brief in place; no numbered renders, comparison copies or iteration logs.

- [Halcyon brief](halcyon.md)
- [Circuit directions and reusable brief](circuit-briefs.md)
- [Roadmap](../../ROADMAP.md), [art direction](../ART_BIBLE.md)

## In-game audition

Open `?music=1` (or `?level=halcyon&music=1`) for Music Lab. It offers play/pause, seeking, restart, volume, looping, **Reload sketch** and **Open audio** for a local file. No upload is involved. Music starts when you press Play, continues through game pause/restarts, and pauses when the tab is hidden. Its independent volume bypasses the effects/underwater mix for composition auditions. Its controls do not drive the ship. Circuit selection preserves `music=1`; ordinary URLs do not load the player or request its WAV.

Run `node assets/levels/halcyon/audio/render.mjs` from the game directory after editing the score or instruments, then click **Reload sketch**. The renderer overwrites `public/assets/levels/halcyon/audio/blue-hour-preview.wav`. Automatic race playback comes after the composition works.

## Process

1. **Brief.** Set the intended feeling, groove, instrument roles and space needed for gameplay sounds.
2. **Sketch.** Render about 30 seconds with the core groove and motif. The user listens; translate their feedback into concrete musical changes and overwrite the preview. Reactions such as “too frantic,” “cheesy keys” or “I like 0:12” are enough.
3. **Arrange.** Once the direction works, develop it into a roughly two-minute loop with an early identity, variation and a natural return. Musical sections need not align with corners or a fixed lap time.
4. **Mix in gameplay.** Refine timbre and balance against propulsion, boost, devices and race cues. Add stems only when they help solve a mixing problem.
5. **Finish.** Resolve listening feedback, verify the delivered loop and playback lifecycle, then start the next circuit using the same brief format.

The user judges groove, timbre, world fit and fatigue. Codex checks clipping, silence, timing and loop boundaries; these checks do not establish whether the music sounds good. Keep feedback in chat and current decisions in the brief.

## Authoring approach

The [Halcyon source](../../assets/levels/halcyon/audio/README.md) separates editable notes from original synthesized instruments. A Node.js renderer writes stereo PCM directly to WAV, wrapping note/effect tails into a circular buffer. It needs no additional packages. Investigate other tools only if sound quality or editing becomes a bottleneck.

- Editable score, instruments, render instructions and provenance: `assets/levels/<slug>/audio/`.
- Current playable export: `public/assets/levels/<slug>/audio/`.
- Keep tempo, sample rate, loop boundaries and any sample origins/licences with the source. Choose delivery compression when integrating the finished track.

## Completion

The user accepts the complete track after repeated listening and a gameplay audition. The delivered asset has no clipping, unexplained silence or audible seam, and essential game cues remain clear. Integrated music needs independent volume, gesture unlock, defined pause/restart behavior and cleanup on level exit; asset failure must leave racing usable. Relevant lifecycle checks and a production build accompany integration. This audio pass is desktop-only; defer mobile/portrait verification unless requested.
