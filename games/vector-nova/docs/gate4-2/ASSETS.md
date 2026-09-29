# Halcyon device provenance

All new art is editable source geometry in `src/pickups/halcyon/geometry.js`. No downloaded or generated bitmap assets, external fonts, music, or videos were added. Existing Halcyon materials, road and city remain intact.

Vector strips use dark manufactured cassettes, titanium edge seams, amber-white directional inserts and advance marks. Aegis uses a segmented teal arch with a shield glyph and distinct road seal. Road surfaces are clipped against the actual rendered road triangles; skirts and arch feet finish the contact edge. Active feedback is attached to the existing ship as owned removable children: two bounded shader volumes provide tapered free propulsion and a translucent segmented hull field with localized hit/release response.

The layout has 32 device meshes plus 2 ship feedback meshes, 2,154 source triangles and 133,968 geometry bytes, with no added textures or lights. These source counts differ from camera-dependent rendered calls and multipass totals.

Audio is synthesized by owned WebAudio oscillators/envelopes in `audio.js`; gesture unlock, settings, mute/pause and disposal are covered by focused tests. Listening remains unverified.

Raised arch materials are separated from the road modules so only obstructing arch geometry fades along the chase camera/ship corridor. Camera visibility remains presentation-only and never alters pickup eligibility or collision.
