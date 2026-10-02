# VECTOR//NOVA roadmap

## Current position

Approved and merged: Halcyon Speedway, Asterion Orbital, Nacre Tempest, Vesper Canopy, Cindercoil, and the four-ship fleet (Kestrel, Shrike, Bastion and Needle). Halcyon's normal launch includes automatic boost/shield devices, three actual-physics rivals from a 2×2 grid, Easy/Medium/Hard difficulty, two-lap timing/placements and continued driving with a retained paddock roster. Human launches use start lights and an audible countdown; Practice Lap stays solo. Completed review history is in Git.

## Proposed gameplay phases — remaining

Each phase ends with human review after its scoped independent critic loop. Agree the actual phase before implementation.

### Level polish

- [ ] Extend Halcyon's restrained racing blur to other circuits after their gameplay integration.
- [ ] Emit sparks from the actual side/contact point when scraping rails or other surfaces, and when ship-to-ship bumps become available. Explore short-lived scrape streaks on the contacted road panels/walls, with bounded effects and cleanup.
- [ ] Halcyon: investigate and fix remaining flicker on the ground, especially white areas and street-lane markings.
- [ ] Asterion: locate and fix the reported flickering road section; its exact location is not yet known.
- [ ] Nacre: make the entire sound mix feel submerged when entering the water, including propulsion, boost, lightning/thunder and other effects, with smooth transitions back to the above-water mix.
- [ ] Nacre: add bubbles around takeoff, mid-jump travel and landing for the underwater portions, driven by actual submersion and water crossings.

### Candidate next round: shared pickups and boost support

Consider game-wide boost/refill, protection and recovery aids. The user will choose the systems and iterate through human playtests.

### Gate 5: broader race flow

The current Halcyon flow records two laps, keeps all ships driving, and returns to the paddock on Escape after the player completes them. Keep this simple behavior until the user requests a broader flow. Future briefing, sector splits and persistent personal records need separate scope; podiums and finish locks are not part of the current implementation.

### Gate 6: opponents and competitive Quick Race

Halcyon has three independent rivals with lane, braking and boost decisions using shared physics/devices, and Easy/Medium/Hard pace settings. Next, adapt opponents and devices to other approved circuits, including their flight and local hazards, before increasing to player plus 11 rivals. Add restrained body contact with cooldowns, no sustained rail pinning or repeated damage from one contact. Verify independent finishes and actual performance for each larger field.

### Gate 7: energy choices and Time Trial

Initially try two recharge stretches and two immediate 25-point energy cells on Halcyon, capped at 100 reserve. Put recharge on slower/wider lines so it is a real time/energy choice; retain passive regeneration while tuning. Eligibility resets per racer/lap with forward crossings and anti-farming. Expand placements to another circuit only after review.

Time Trial is a deterministic three-lap solo run with a local non-colliding ghost, sector deltas and instant retry. Fixed initial state; manual boost/regeneration remain, road devices are disabled. Separate circuit/ship/rules records and reject incompatible ghosts. Automatic failed-jump recovery remains valid with elapsed time loss.

### Gate 8: ships, cups and front end

The initial four-ship fleet and paddock/inspection selection are complete. Carry the shared selection into the future race modes.

- [ ] Restructure the menu into **Ship selector → Map selector → Launch**. Show ship stats at selection, preserve choices when going back, and keep Inspect Ships accessible. Each step should fit without scrolling.

Add a Founders Cup over Halcyon/Asterion/Nacre. Proposed 12-place points: 25/20/16/13/11/9/7/5/4/3/2/1, ties by wins then total time. Save between races with restart/abandon controls. Track/ship select, Quick Race, Cup and Time Trial should lead to working actions. Rewards unlock cosmetics, not stronger stats; retain all completed content in Practice/Quick Race.

## Deferred

Stored/manual-use items, offensive pickups, side attacks, destructive damage/elimination, online systems, upgrade economies, procedural tracks and the industrial energy complex require a separate scope decision. Quality and a complete racing loop take priority over map count.
