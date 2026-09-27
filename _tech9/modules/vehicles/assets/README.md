# Editable asset sources

The Jeep, ATV and dirt bike are original procedural assets extracted from Trail Driving's accepted vehicle-art checkpoint `b9124b9a` (handoff `c7f5d72e`). This canonical copy is independently editable. The game keeps its own implementation.

- [VehicleModel.js](../src/VehicleModel.js): vehicle silhouettes, body panels, running gear, wheels, mechanical assemblies, steering controls, instruments, palette, surface finishing and mounted attachments.
- [VehicleGeometry.js](../src/VehicleGeometry.js): panel/loft polygons, shaped tire cross-sections, rounded forms, tubes, deterministic grain maps and original canvas graphics.
- [RiderModel.js](../src/RiderModel.js): riding clothing, helmet, articulated gloves/limbs, planted boot supports and mounted-view visibility.
- [VehiclePresets.js](../src/VehiclePresets.js): the wheelbase, track, radius and travel matched to those assets, plus handling.
- [DrivingFeedback.js](../src/DrivingFeedback.js): synthesized audio and bounded procedural surface dust. No external recordings.

These JavaScript files **are the editable model/texture sources**. There are no additional Blender files, opaque mesh binaries, downloaded textures or external vehicle media to preserve. Keep this directory, all source files and license/notice files when copying the module. Surface maps and instrument artwork are generated at runtime; they belong to each model and are disposed with it. Reflection maps created by `VehicleLighting` are shared and borrowed until their owner disposes them.

The vehicle designs and synthesized audio are original work created for Trail Driving and may be used, edited and redistributed with this project; no additional third-party asset attribution is required. Three.js retains its MIT license, included in [THREE-LICENSE.txt](../THREE-LICENSE.txt). Three.js addon geometry helpers and RoomEnvironment are runtime imports, not copied vendor source. No wider license grant or vehicle-manufacturer affiliation is implied.
