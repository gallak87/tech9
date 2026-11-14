# Track Workshop

Open the top-level **Editor** tab in the full game or browser build. A new draft starts with an empty Nightweir basin. **Generate a drivable track** creates a complete 3 km starter with jumps and pickups in one click. Choose **Draw road** to place your own points on the 100 m grid, or open **Generate** for size and variation options. Choose Circuit for a closed loop or Downhill for a descent with a supported 600 m braking runout after the finish. Browser development also accepts `?editor=1` after career selection.

## Click, shape, drive

The 3D view is the editing surface. The **Tools** panel stays inside the preview and highlights the active tool: **Draw road**, **Select / move**, **Height**, **Orbit** or **Pan**. Draw adds points; Select / move drags them along the ground; Height drags them vertically. Orbit and Pan let the primary mouse button move the camera. D/V/H/O/P choose tools without affecting text fields; native buttons provide keyboard/controller access.

A ghost point and road continuation preview show where the next Draw click will go, including over existing road. Moving a point or using its height arrow while drawing keeps Draw active, so you can continue placing points afterward. Circuit closes automatically; after four or more points, choose **Finish drawing** or click the starting point. The editor frames your road and enters Select / move. Click a road point and drag it to bend the route; Shift-drag or its height arrow changes elevation. Native Raise/Lower, previous/next and section controls provide keyboard/controller alternatives. Double-click between handles in Select / move to insert a point. One Undo restores a complete drag.

Track checks identify the point behind a tight corner or other local problem. Click the **Point N · Tight corner** warning to select and zoom to the actual road point. A red halo and numbered label mark it in 3D; Map marks it red too. **Auto fix corner** smooths an eligible bend and nearby road, keeping elevations and distant points intact. It commits only a result that passes the driving checks and remains undoable. Protected jump/rotation areas or layouts needing larger changes require a manual edit. On a plain road without jumps or twists, **Spread road out** preserves the layout's relative shape and elevations while giving all bends more physical room. It makes the road longer and remains undoable; checks are never bypassed.

Select a section to highlight the part you are changing. **Bank / twist** gradually rotates the road surface by 90°, 180° or 270°; it does not turn the route's heading. Following points retain the exit angle so chunks connect, and the selected point shows its current road angle. Circuits automatically make a smooth return to the starting angle near the finish. Leave enough clear tail road for that return, or connect chunks into a complete turn. Straight aligns a span between its endpoints. Expand the selection when it needs more room. Precise coordinates, bank trim, width and section endpoints remain available in the optional details.

**Jumps (N)** opens existing jump inspection directly. **Add jump…** opens an uncommitted placement flow: **Use next suitable section** searches clear ordinary road, then an explicit Add creates the prepared gap. Packed courses may need more road or manual placement. Optional manual controls retain launch/landing indices, ramp assistance and large jump authoring. Assistance creates visible ramps and receivers relative to the road's altitude; it adds no hidden impulse. Cruise/boost forecasts use the selected stock ship and shared ballistic engine. Boost advice assumes full reserve at launch. Unreachable forecasts remain advisory. Forecasts omit scenery collision and steering, so Test drive remains the final check.

Jump lips stay anchored to road points while other sections change. Removing a gap restores the road but retains its ramp/landing point edits. Undo restores the complete previous edit. Generating replaces the route and its jumps; changing course type clears incompatible features. Both operations remain undoable.

Generate offers **3, 5, 10, 15 and 20 km** presets, with jumps and pickup fill enabled by default. Circuits start with one jump through 3 km and two on longer seeds; downhill seeds contain three below 10 km and four from 10 km upward. Disable either option for a plainer starting point. Size and Generate are immediately visible; seed and variation controls are optional. Requested downhill length includes its braking runout. The same seed and options produce the same geometry; saved geometry remains authoritative when loaded.

## A complete world

World offers three curated Nightweir presets: **Waterfront**, **Industrial basin** and **Reclaimed waterfront**. Each fills clear parcels with coordinated buildings, working infrastructure or greenery using the track seed. The editor places and supports the scenery automatically. The current authoring flow does not require placing individual buildings or plants. Road edges, gutters, lanterns, piers, foundations and waterfront terraces are automatic too.

Pickups fills the course with real Vector boosts, Aegis shields, Repulsors, Arc bursts and Ion wakes. Balanced/Boost heavy and spacing options offer a few useful variations. Clear and Undo restore the expected layouts. Devices follow the actual banked/inverted road surface and avoid jump corridors. Refill after substantial road changes to update safe placement.

Only the panel you open occupies the side of the canvas. Generate, World, Pickups, Jumps and My tracks hold their relevant controls. Tunes opens below the toolbar and returns focus when closed, keeping Save and Test drive visible.

## Camera, controls and testing

Right-drag or Space-drag orbits; the mouse wheel zooms. Middle-drag or Shift-right-drag pans. Long generated/loaded courses initially frame their first 1.5 km. Overview frames the entire route; Focus selection (or F) brings the selected point or section close enough to edit. Ordinary Undo/Redo keeps your camera in place; restoring a replaced route reframes it. Map fits the full road on entry, including long-course endpoint markers. Fly camera enables WASD and Q/E movement, drag look and Shift for speed. A standard controller uses left stick movement, right stick look and shoulder buttons for elevation. Escape/B leaves free camera and returns focus without activating Back.

Native buttons and detailed controls provide keyboard/controller equivalents for editing gestures. Camera offers pan, orbit and zoom buttons; Escape closes that menu and returns focus. Tab/Shift-Tab navigates; Enter/Space activates. Controller D-pad/stick navigates, A activates, B goes back, and left/right adjusts native selectors/sliders. Ctrl/Cmd+Z undoes, Shift+Ctrl/Cmd+Z redoes, and Ctrl/Cmd+S saves. Physical Steam Input/device checks remain separate release validation.

Track checks explain incomplete routes, tight bends, steep grades, abrupt rotation, road/water clearance and landing-run issues before Test drive. Incomplete or invalid drafts can still be edited and saved. Test drive launches ordinary stock-ship Practice. Pause → Back to editor restores the draft, selection and history; Settings returns to the paused drive. Custom tracks do not earn campaign rewards or official Time Trial records. Any previous campaign session stays suspended.

## Saves and limits

Save track stores the draft in My tracks, including empty drafts. Save a copy creates a new library ID. My tracks also offers Load, Delete saved, Import and Export. Leaving/reopening the editor in the same frontend retains the draft; save before reloading or quitting. Import changes the draft and requires an explicit Save before changing the library. Failed writes and malformed files preserve the current document.

**Reset track** in the header clears the road, jumps and pickups and returns to Draw. It retains the track name, identity and world settings. Undo restores the complete previous draft; Reset does not overwrite a saved track until you Save.

Browser builds use independent localStorage and file import/download. The existing Electron bridge uses atomic files in the full edition's `userData/tracks` directory and native `.vntrack.json` dialogs, separate from careers. Electron/Steam release validation is deferred. Libraries support 256 tracks and a 1 MB file limit. Steam Cloud/Workshop sharing is not configured.

Version-1 files store stable ID/name, Nightweir biome, seed/options, actual route points and unwrapped roll, world preset/settings, anchored gaps and a resolved pickup layout. Older files retain their explicit scenery data for compatibility. Loading never regenerates saved road geometry. Unknown fields are dropped; unsupported versions/biomes/objects are rejected. Files contain no scripts, arbitrary asset URLs or filesystem paths.

One Circuit or Downhill course per file; up to 256 route points and 25 km of authored road. Generated lengths remain 1.8–20 km; the extra authoring room lets users reshape a 20 km starter without immediately invalidating it. Width is 32–64 m, elevation 0–3000 m, and bank trim about ±20°. Rotation chunks allow full inversions independently of trim. Branches, tubes, moving machinery, freeform wave curves and optional Freestyle trick scoring remain future work.

See [the editor roadmap](../track-editor-roadmap.md) for future biome, sky, prop and hazard capabilities.
