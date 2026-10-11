# Shatterline — road finish

Use the [road workflow](README.md). Target `shatterline`; cover both opaque decks and the transparent running tubes.

## Starting point

The [road builder](../../../src/levels/shatterline/track/road.js) generates 1024×512 color, bump and roughness maps for graphite induction cassettes. The broad deck derives its visible rows from the same geometry used by physical support. [Tube rendering](../../../src/levels/shatterline/track/tube.js) supplies a separate physical clear-polymer finish; [tube surface definitions](../../../src/levels/shatterline/track/tube-surface.js) encode the actual running surface and transitions.

## Investigate

Check whether the opaque deck's repeated panel map has the right physical scale and material response across the 50 m raceway. Aim for convincing graphite cassettes, ceramic containment and machined structure under warm sky and cool practical lights. Separately assess the tubes' apparent thickness, reflection and transparency. Do not apply an opaque deck treatment to them or obscure the receiving road to gain stronger reflections.

## Keep and check

Compare a daylight connector, a lit inversion, a tube entry/exit and the long-flight receiving installation. Include both Overturn tubes and an ordinary descending bend. Preserve the exact supported rows/triangulation, tube openings, red exit edges, sparse inlays, camera corridor and gap geometry. Inspect aliasing and transparency in motion at High/Low. Run affected lighting/tube geometry checks; filter out deferred mobile cases. This finish assignment does not alter the descent, physical transitions or race rules.
