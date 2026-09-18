# September 16 review fixes

The bounded critic pass used 12 staged views: all eight regions, two interiors, and two battle states. It found two additional issues—flat cave mouths and incorrect level-up notices—which were corrected. This was a targeted sweep, not a new full campaign playthrough.

Completed user queue:

- Kaida keeps her scale when walking/running and stopping in every direction. Standing renders at77native pixels and gait phases at76–78. Calibration uses one fixed scale per direction; original sprite pixels and gait are unchanged.
- Defend now uses Attack's timing track and a fresh press. Critical guard reduces incoming damage by85%; normal guard still reduces it by65%. Both last until the hero's next action.
- Compact parchment menu rows and two-row quests with real reward icons beside type/act/status; neutral field UI and locally anchored interaction prompts.
- Purchases show exact quantity and spend before a separate Space/Enter confirmation. Escape preserves shop selection; prices, stock and funds are rechecked.
- Font paths use the public root and remain valid in the built relative-base deployment.
- Vex's observatory prerequisite is explicit. Earned Vex/Rune recruitment includes a short walk into formation and a once-only portrait notice; pause, skip, reduced motion and save/load work.
- New faceless purple/cyan Vex and obsidian humanoid Gravbot are active throughout their production render paths. Long Vex robes show subtle boot movement and cloth sway.
- Signs have generated sprites and text-only reading; Escape dismisses conversations safely. Oro now stands visibly beside his forge with his complete body and boots.

Final gate:58unit tests pass; production build passes with the existing bundle-size advisory. Focused UI, vendor, recruitment, presentation and battle-accordion browser checks pass without runtime errors. Art and critic browsers are closed. The shared development server remains on4321; user-profile saves were untouched.

See [VERIFICATION.md](VERIFICATION.md) for executable checks and scoped evidence, [Vex art](vex-assets.md), [Gravbot art](gravbot-assets.md), and [Kaida/Defend evidence](../evidence/presentation-polish/results.json).
