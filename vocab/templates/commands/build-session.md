---
name: build-session
description: How to drive a build session on {{game_name}} — the /goal wording, the fanout rule, and the instruments to build before content.
---

# Driving a build session on {{game_name}}

This is not a slash command you run — it is the wording and the rules that make a long
autonomous session on this game actually converge. Paste the `/goal` text verbatim. The phrasing
matters more than it looks.

## The `/goal` wording

```
Build {{game_name}} to a level of polish indistinguishable from a shipped AAA title.
It should be utterly perfect, visually beautiful, with every single thing done at AAA
quality — from textures to physics to anything you could think of. On each item, have a
separate sub-agent check it visually to ensure it looks triple A. That sub-agent should
be a really harsh critic, and if it doesn't look triple A, it should keep going.
```

Why this works, having watched it work:

- **"Utterly perfect" / "AAA" sets a bar the model cannot quietly negotiate down.** Without it,
  "good enough for a procedural browser game" becomes the standard by default, and every frame
  gets graded on a curve against the effort that produced it.
- **The `/goal` hook blocks stopping until the condition holds**, which converts a one-shot
  request into a loop that keeps finding the next-worst thing. Most of the real wins on the last
  game landed after the point where a normal session would have handed back.
- **The separate harsh critic is the load-bearing clause.** A builder grades its own work
  generously — not dishonestly, but it knows what each frame *cost*, and cost leaks into
  judgement. A critic that has never seen the code only sees the frame.

**Clearing it:** `/goal clear`. The hook will keep refusing to stop otherwise, including when you
want to pause mid-session — that is working as intended, not a bug, but it surprises you the
first time.

## The `/loop` wording

For unattended grinding on a defect with a measurable pass condition:

```
/loop Take the worst remaining visual defect in {{game_name}}, fix it, and prove it with
a screenshot you have actually opened. Re-measure fps and draw calls. If nothing is
clearly wrong, say so and stop rather than inventing work.
```

The last clause matters. Without an explicit exit, a loop invents plausible work indefinitely.

## Fanout — one background agent plus yourself

Five parallel lanes hit the usage ceiling in ~15 minutes and three of them landed code nothing
imported. Two lanes is already one too many, and **not because of merge conflicts** — disjoint
files never conflicted once.

The real reason: every lane drives the *same running game*, so a before/after capture renders
whatever the other lane's files happen to be at that instant and any A/B measures both changes at
once. With godot-mcp this is worse than on the web, because the bridge is **one game per port**.

Rules:
- One background agent, plus yourself inline, on disjoint files.
- Hand the agent its API contract **in the prompt**. Making it re-derive interfaces from source
  is the single biggest budget burn.
- If a look must be measured while another lane is live, isolate it — a git worktree *and* an
  explicit `--mcp-port` so the two games cannot touch.
- Spend the agent slot on the harsh critic pass as a **scheduled milestone**, not as whatever is
  left at the end. On the last game it never ran, because a genuine bug hunt kept deserving the
  slot more.

## Build the instruments before the content

A screenshot is one frame with no keys held. Three whole classes of defect are invisible to it,
and on the last game each of these found a bug that captures had already missed:

1. **Input harness** — `game_key_press` / `game_key_hold` plus a `game_eval` assert on the
   resulting state. "Does the fire button fire" is unanswerable by any capture, because the
   capture path never presses a key.
2. **Time-domain sampler** — step the sim and sample state ~10×/second. Dead air in an encounter,
   an enemy drifting out of range, how long a target stays shootable.
3. **Event counters at the source** — incremented in the collision/damage handler, read via
   `game_eval`. An entity is freed on the frame its event fires, so an external poll structurally
   cannot see it.

See `capabilities/godot-mcp.md` for the diagnostic techniques these feed, especially
*derive against the model, raycast against the render*.

## Non-negotiables for the session

- **Never claim a look without a screenshot you have actually opened.** Not "the command exited
  0", not the filename — the image.
- **Any console/script error is an automatic fail**, not a footnote.
- **Record fps and draw calls on every rendering change.** It catches regressions a screenshot
  never will.
- **Nothing exists until it is in the scene tree and running.** A script file is not a feature.
- **A measurement that does not move when you change the parameter it measures** is almost never
  a real invariance — suspect the instrument before the code.

---
<!-- tech9 template — see meta/LESSONS.md for the derivations behind each rule -->
