# Future tech9 direction — discussion note

**Status: intention recorded, discussion deferred.** The owner wants to revisit this after stepping away and continuing the Dusk decisions. This is not authorization to archive files, rebuild tech9, or begin a parallel framework project.

## The owner's intention

Use the working Dusk process as evidence for a new reusable game-development framework. The existing individual agent definitions feel too prescribed. The owner is considering restarting the capability and director/scaffolder approach, potentially moving earlier work into `_archive`.

The eventual aim is to describe a game and have the framework assemble an appropriate development approach, with useful creative judgment and flexible delegation. A future game might be a 2D side-scroller made for fun. It must not inherit rigging, Meshy, Mixamo, 2.5D cameras, or a Godot-native target simply because Dusk uses them.

## What Dusk may teach us

Candidate reusable ideas, to evaluate after they work:

- A game exposes development tools that inspect and exercise its own runtime systems.
- Asset metadata selects suitable processing recipes, with optional manual stages and clear producer/consumer handoffs.
- Character, static, rigidly animated, image, and other assets receive different processing and checks.
- Candidate/accepted versions and reproducible evidence make iteration understandable.
- Parallel work is organized around concrete outputs, dependencies, and an integration owner.
- Small playable milestones reveal uncertainty before a large content-production effort.
- A director helps resolve decisions and adapts work to the game instead of mechanically assigning a fixed roster of roles.

These are hypotheses for future extraction, not a universal architecture already decided.

## Questions for the later discussion

1. What should the director decide dynamically from the game brief, and what should be supplied as stable capabilities?
2. Which capabilities are simple instructions, which are tools or scripts, and which need an engine-specific implementation?
3. What should scaffolding create immediately, and what should appear only when a real feature needs it?
4. How should asset recipes and validation adapt between a sprite-based side-scroller, a rigged 2.5D RPG, and another kind of game?
5. Which existing tech9 components deserve preservation, replacement, or archival? What references and history must remain easy to find?
6. What second, contrasting game would establish that the approach transfers beyond Dusk?

## Keep the current project focused

Build and refine Dusk for its own needs first. Capture concrete lessons, successful handoffs, repetitive operations, and failure cases in project notes. Later, extract the smallest useful capabilities from that evidence.

Do not create engine-neutral runtime layers, provider plugin architectures, generic orchestration protocols, or broad compatibility systems now. Reusability is the later outcome to test, not a reason to widen the first game milestone.

No archival move, rename, deletion, framework replacement, scheduled reminder, or new task has been performed or requested by this note.
