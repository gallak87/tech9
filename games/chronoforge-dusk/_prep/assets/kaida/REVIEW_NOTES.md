# Kaida source review

## Owner direction — 2026-09-07

The current Meshy r2 model is **too skinny**. The owner may regenerate her with fuller proportions later, but explicitly wants to keep working with this model for now. Treat its body proportions as provisional, not visually accepted. Do not thicken or regenerate the current mesh without a new direction; continue preparation and the rigging/export proof with the supplied geometry.

A replacement body should be a new immutable source/candidate revision. Expect another rig/weight pass and verification of clip compatibility, contacts, collision dimensions and the separate sword grip. The source-retention workflow, named animation roles and game integration can carry forward. Retargeting is assessed against the actual replacement rig/rest pose; existing animations are not assumed to transfer unchanged. Settle body proportions before extensive deformation and animation polish in 03.

## Inspection observations

- Meshy added small brown wristbands, despite the r2 reference's exposed forearms/wrists. Record this mismatch for the next visual pass. The supplied source and current working geometry preserve them.
- Front/back/side hand close-ups show separate fingers. Finger webs and the thumb profile have uneven contours; inspect finger curl and sword grip after rigging before investing in local cleanup. The six retained renders are source inspection, not deformation approval.
- The current mesh has no rig or animation. A closed surface and clean import do not establish hand/joint deformation quality.
- The separate sword remains a 2D reference. It is not included in the humanoid upload.
