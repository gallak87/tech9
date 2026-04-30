# Orb Vacuum — Concept

## Game Summary
Orb Vacuum is a survival arcade game set inside a dark, bounded 3D arena. The player controls a glowing orb using WASD, floating freely in the space. Smaller orbs drift around the arena — flying into them absorbs them, making the player grow. Larger orbs will shrink the player on contact. The arena continuously spawns new orbs, gradually tightening the size differential so smaller windows of safety open up over time. There is no fail state and no win condition — the game runs forever, and the only goal is to maximize the running count of orbs absorbed.

## Core Loop
WASD moves the player orb in the horizontal plane; mouse drag or Q/E rotates the camera. Each frame, the player's radius is compared against nearby orbs — contact with a smaller orb absorbs it (player grows, score +1, brief scale-up pulse), contact with a larger orb shrinks the player (no score loss, just a size penalty and a screen flash). Orbs spawn at the arena boundary at random sizes and drift inward with slight random velocity. Spawn rate and the ratio of large-to-small orbs both increase every 30 seconds, making survival progressively harder. The score is the total count of orbs absorbed, displayed as a large number on-screen at all times. There is no death, no reset, no timer — just the endless grind for a higher score.

## Target Feel
Smooth, floaty, and hypnotic — like swimming through a lava lamp. Absorbing a smaller orb should feel satisfying and slightly greedy; getting hit by a larger one should feel like a gut-punch but not punishing. Visual references: Osmos, flOw. Neon glowing spheres on a near-black background, bloom on every orb. The player orb should feel weighty when large and nimble when small. Audio is out of scope but the visuals must carry the sensory feedback.

## Scope Constraints
- IN: WASD movement in the horizontal plane, camera orbits with mouse drag or Q/E keys.
- IN: Size-based absorption — player absorbs any orb smaller than themselves on contact.
- IN: Size penalty on contact with a larger orb — player shrinks, never dies.
- IN: Running score counter (orbs absorbed) displayed on-screen at all times.
- IN: Procedural orb spawning at arena boundary, increasing in rate and difficulty over time.
- IN: Bloom-style glowing appearance for all orbs — neon colors on dark background.
- IN: Brief visual feedback on absorb (scale pulse) and on hit (screen flash).
- OUT: No audio — sound effects and music are out of scope for v1.
- OUT: No high score persistence — score resets on page reload.
- OUT: No mobile or touch controls in v1.
- OUT: No powerups, special orbs, or abilities beyond grow/shrink.
- OUT: No vertical movement — the player moves only in the horizontal plane.

## Known Unknowns
| Decision | Deferred To |
|----------|-------------|
| Exact movement speed, drag, and orb drift velocity — needs playtesting to feel right. | dev |
| Bloom implementation approach — post-processing pass vs additive material trick. | dev |
| Arena size and boundary behavior — hard wall vs soft repulsion field. | dev |
