# Haventide upgrade rehearsal

This first pass tests the presentation of a Town Center upgrade. It is available
only in the local development art tool, independently of real construction.
The tool works only on localhost / 127.0.0.1 / [::1]. Backtick opens it without
a flag; `?dev=1` also opens it automatically when exploration is ready after
starting/loading. It waits through title screens, dialogues, and transitions.

1. While in Haventide or its town hall, press **Backquote** (the backtick key).
2. Under **Upgrade from inside Haventide**, select **1 → 2**, **2 → 3**, or **3 → 4**.
3. The preview starts inside, with a staged copy of your crew at the settlement
   desk. Press **Upgrade Town Center** to begin.
4. A roughly five-second tour holds briefly at the stationary desk, fades
   outside in 180 ms, and gives the old exterior a short suspenseful 2% push
   in. The exterior scale then stays fixed as it changes in 850 ms, with
   a quick upward burst of sparkles. Another 180 ms fade returns directly to
   the original desk-and-crew framing.
5. Choose **Replay upgrade** or **Return to play** when it finishes.

**Space / Skip reveal** jumps to the indoor finish. **Esc / Back to art preview**
cancels to the panel; a second Esc closes that panel. **Backquote** closes both
at any point. Existing regional exterior selectors remain available and retain
their selection after the rehearsal. The tour itself is Haventide only.

## Current scope

- The exterior uses the actual approved level artwork. The slight camera push
  finishes before the transformation; both levels use the same framing and
  scale during the dissolve so physical growth remains visible.
- The interior uses current production art. Its four visual upgrade stages are
  still to be authored; this pass establishes the indoor start, reveal timing,
  and return. The indoor camera and crew positions match before and after;
  there is no separate hall overview or empty-space reveal. The return caption
  explicitly identifies the interior artwork as unchanged in this pass.
- Town Center level and civilization tier remain separate. Only copied Town
  Center levels change for the before/after pictures; civilization, vendor
  requirements, and every other game value remain as they were.
- Each tour picture is rendered from detached state. The party positions in
  the shot are staged display actors, not the expedition's positions.
- No travel, fog/discovery, resource spending, real upgrade, or save operation
  occurs. The game remains paused under the preview and resumes from its
  original position and camera on **Return to play**.
- Restrained motion keeps the fades/dissolve and omits both zoom and sparkles.
  Sparkles launch once and rise without wrapping back down. Sound uses the
  existing build/level cues, synchronized to the reveal, and the player's audio
  settings.
- Closing, session reset, or hot replacement cancels animation, restores focus
  and underlying controls, zeros captured picture buffers, clears the rehearsal
  canvas, and releases temporary state/references. Browser storage is untouched.
- Real construction does not play this sequence yet. Approval of the timing
  and the future interior artwork can precede that integration.

## Verification

Node tests cover indoor-first sequencing, every skip/replay segment, detached
state, real checkpoint/export isolation using in-memory storage, and exterior
and party camera bounds. Production and in-memory development builds compile
the code; deployment verification checks that the rehearsal UI and CSS are
absent from production. No game or development server was launched. Visual
acceptance is left to the user's in-game spot check.
