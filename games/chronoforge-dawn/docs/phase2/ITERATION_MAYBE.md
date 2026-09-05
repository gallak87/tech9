# ITERATION_MAYBE — Phase 2, redesigned

Not a plan. A description of what Phase 2 should look like given everything
learned building it, so the decision can be made once, with the detail already
gathered, rather than rediscovered.

Two decisions are deliberately left open at the bottom. Nothing here needs
deciding to be useful.

Supersedes the earlier version of this file, which proposed a Blender rebind
script. That was a workaround for the design issue described in §4. In git.

---

# What Phase 2 was actually for

**Not "get a mesh."** Build one automated lane that turns a character reference
into a playable character. Prove it on Kaida. Freeze it. Then push the rest of
the cast through it unattended while other phases carry on.

Judge everything below against that, not against whether any single character
looks good.

## It largely worked

Phase 2's job was to remove unknowns, and it did:

| Was unknown | Now known |
|---|---|
| Can we generate a 3D character at all? | Yes, two ways. One local, one hosted. |
| Can we rig one? | Two candidates found. Neither run on a generated mesh yet. |
| Can the game load a rig it didn't design? | **Yes. Proven.** |
| Is the pipeline shape right? | Yes — `forge.mjs` works and is not the bottleneck. |

What remains is a short list of specific things to try, not open-ended research.

---

# 1. The lane, end to end

```
character concept
   │
   ├─ 1  reference images .......... ref-gen.mjs, local          BUILT
   ├─ 2  reference → 3D mesh ....... DECISION 1                  empty
   ├─ 3  mesh → rigged mesh ........ DECISION 2                  empty
   ├─ 4  normalise + install ....... forge.mjs `install`         BUILT
   └─ 5  appears in the game ....... Vite watch, hot swap        BUILT
```

Five stages. **Three are built and working. Two are empty.**

One command drives the whole thing, already:

```
node docs/phase2/forge.mjs docs/phase2/forge-manifest.json --only kaida
```

It runs the stages in order, skips any whose inputs have not changed, and can be
pointed at one character or all of them. The skipping matters because stage 2 is
slow — without it, a failure in stage 3 would re-run stage 2 from scratch every
time.

**The pipeline is not the missing piece.** Two stage modules are empty and
currently print instructions instead of running.

---

# 2. What fills each stage

| # | Stage | Option | Runs unattended? | State |
|---|---|---|---|---|
| 1 | reference images | `ref-gen.mjs` + local Ollama | yes | working, free |
| 2 | mesh | **local** Hunyuan3D | yes | 1 success, 1 failure, ~20 min/run |
| 2 | mesh | **hosted** Meshy 6 Lite | via paid API only | 1 success, minutes, better result |
| 3 | rig | **local** UniRig | yes | never installed |
| 3 | rig | **manual** Mixamo | **no — browser form** | works, but a person must click |
| 3 | rig | **hosted** Meshy rigger | via paid API only | never tried |
| 4 | install | `forge.mjs` | yes | working |
| 5 | game | Vite watch | yes | working |

**"Runs unattended" is the column that decides the phase.** A stage that needs a
person in a browser cannot be frozen and cannot run the rest of the cast in the
background — which is the entire point.

That does not make Mixamo useless. It makes it a **probe**: use it once to
answer a question, then throw it away. It cannot be the final answer.

---

# 3. Proven vs. unknown

## Proven — do not re-litigate

| | Evidence |
|---|---|
| The game loads a foreign rig | A Mixamo character animates in-game today |
| Bone naming is handled | 19 of 19 bones matched automatically, no hand edits |
| Size differences are handled | A 2.19 m source rig normalised to the game's 1.72 m |
| Feet stay on the ground | Foot placement measures the character rather than assuming it |
| Hot swap works | Drop a file, it appears in the running game |
| Reference generation works | Local, free, manifest-driven |
| A mesh can be generated | Both routes produced one |

That is most of the engine-side risk, retired.

## Unknown — the actual remaining list

| | Why it matters | Cost to answer |
|---|---|---|
| **Can any rigger handle a generated mesh?** | Make-or-break for the whole approach | one rigging attempt |
| Does UniRig exist in usable form? | It is the only unattended local option | ~30 min |
| Is local mesh generation reliable? | One success, one failure, untested cause | two runs, ~35 min |
| Meshy licence for a shipped game | Free tier may not permit it | reading their terms |

**Four items. None open-ended.**

## The one that can end the approach

A generated mesh is a surface with no clean structure at the joints. Rigging
tools bend a character by assuming there is. If the shoulder collapses when the
arm moves, the ceiling is the mesh, and no rigger fixes it.

`README.md` already records the useful property: if it deforms badly in one
rigger it will deform badly in all of them. **So one rigging attempt answers this
for every option at once**, and the cheapest attempt is worth making early, even
with a tool you will not ship.

---

# 4. The one architectural change worth making

**The game's skeleton rests with the arms hanging at the sides. Every rigging
tool in existence produces arms held out.** So every incoming character has to be
converted to fit, forever.

That single mismatch has already produced four separate pieces of compensating
machinery, one of which is still unbuilt and on the plan.

## The change

Redefine the game's skeleton to rest arms-out, matching what the tools produce.
Nothing converts, because nothing differs.

| | |
|---|---|
| **Cost** | Re-tune the arm portion of the animations: **30 of 93 pose values, across 7 animations.** Legs, spine, head and hips are unaffected — they are identical in both rests. |
| **Free** | The hand-built character follows automatically; its geometry is generated from the skeleton file. |
| **Deletes** | Four compensations, including the unbuilt retarget work on `PLAN-forge.md`, and the per-asset mode flag. Loading a character becomes "load it." |
| **Risk** | Hand-tuning is judgement work, checked by eye against existing screenshots. Bounded, not open-ended. |

## Needs your ruling first

`README.md` lists *"Animation is parked. The existing clips are good and stay"*
under rules that must not drift. Re-tuning 30 arm values arguably drifts it.

Reading it as *"do not import an animation library"* rather than *"never touch a
clip"* is the intended sense, but that is a human call.

Also: the visual checks in `tools/rig.mjs` are calibrated against the current
character's proportions and would need recalibrating. `PLAN-forge.md` warns not
to loosen a check to make it pass.

## If you decline

Convert each incoming character at import instead, as a Blender step. It works.
It costs a little on every character forever instead of once now, and keeps the
mode flag and the unbuilt retarget work alive.

---

# 5. What has to be proven before the lane can be frozen

Ordered. Each answers something the next depends on.

| | Question | Cost | If it fails |
|---|---|---|---|
| 1 | Does UniRig install and run? | ~30 min | Decision 2 has no unattended local answer; hosted API or manual-for-heroes |
| 2 | Does a rigger survive a generated mesh? | one attempt | The approach ends. Keep the hand-built character. |
| 3 | Is local mesh generation reliable? | ~35 min | Decision 1 goes hosted, or accepts a retry loop |
| 4 | Does one character go start to finish on one command? | one full run | Whatever breaks is the remaining work |

**Question 2 is the real gate.** Questions 1 and 3 only decide *which tools*
fill the stages. Question 2 decides whether the stages can exist.

Question 1 first only because it decides which tool question 2 should use.

---

# 6. What freezing the lane unlocks

| | |
|---|---|
| The rest of the cast | Enemies, NPCs and the other heroes run through the same command, unattended, in the background |
| Parallel work | Other `GAME_PLAN.md` phases proceed while characters generate |
| No agent time spent on characters | The lane runs without an agent supervising it |
| A repeatable loop | Re-run a character after a reference tweak; unchanged work is skipped |

This is the payoff the phase was scoped for, and the reason "runs unattended"
outranks "produces the nicest mesh."

**Note:** `ROADMAP.md`'s Phase 2 gate is narrower than this — it checks the
character looks consistent across poses. The automated lane is the goal; the
roadmap gate is one check inside it. Do not conflate them.

---

# Decision 1 — local or hosted mesh generation

**Not needed yet.** Both routes have produced a mesh.

| | Local (Hunyuan3D) | Hosted (Meshy 6 Lite) |
|---|---|---|
| Result quality | Untested — the one output was not kept | Good. Clean single mesh, full texture set, correct proportions. |
| Speed | ~20 min per attempt | minutes |
| Reliability | 1 success, 1 failure, cause unattributed | 1 for 1 |
| Cost | free | free to download; unattended use needs their paid API |
| Dependency | none — runs on your machine | account, network, their pricing, their terms |
| Licence | yours | **unverified for a shipped game** |
| Iteration cost | high — every experiment is a 20-minute wait | low |

**Stated preference:** get the local pipeline working end to end. Reasons given:
no confidence the hosted tools will work out, and a preference for owning the
whole chain.

That preference is compatible with using the hosted mesh as a **test input**
while the local generator is debugged — it is a rigged-character-shaped file, and
stage 3 does not care where it came from. Using it to answer question 2 does not
commit to it.

**What would decide this:** whether local generation is reliable (question 3),
and whether the licence permits shipping hosted output.

---

# Decision 2 — how rigging gets automated

**Not needed until question 1 is answered.**

| | Unattended? | State |
|---|---|---|
| UniRig, local | yes | Never installed. Its own docs warn the skinning half may not be released. |
| Meshy rigger, hosted | only via paid API | Never tried. Unknown skeleton, unknown cost. |
| Mixamo, browser | **no** | Works. Cannot be automated — no public API. |
| No auto-rig | n/a | Keep the hand-built character. Closes the track. |

**Mixamo's real role:** the cheapest way to answer question 2. One round trip
tells you whether generated meshes can be rigged at all — for every option at
once. Then discard it.

Using it that way is not a commitment and does not need Decision 2 made.

**What would decide this:** whether UniRig is usable (question 1). If it is, it
is the only option that satisfies the phase's actual requirement.

---

# For the next agent

- The pipeline architecture is built. Do not redesign it. Two stage modules are
  empty; that is the work.
- The engine side is largely proven. Do not re-litigate bone mapping, scaling,
  ground contact or hot swap.
- `ITERATION.md` holds the measured detail behind every claim here, plus two
  read-only scripts that reproduce the numbers rather than asserting them.
- The human runs every long job. Do not start a 20-minute generation or a dev
  server. Ask, and say exactly which command and why.
