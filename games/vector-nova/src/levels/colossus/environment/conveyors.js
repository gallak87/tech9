import * as T from 'three';
import { createColossusPaint } from '../track/presentation.js';
import {
  CROSSFEED_RULES,
  crossfeedBounds,
  crossfeedTravel,
} from '../mechanics.js';

function treadMaterial(shape) {
  const material = new T.MeshStandardMaterial({
    name: 'Colossus / articulated steel conveyor plates',
    color: shape ? '#64767b' : '#53636a',
    roughness: 0.47,
    metalness: 0.7,
  });
  const travel = { value: 0 },
    side = { value: 1 };
  material.userData.travel = travel;
  material.userData.side = side;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.crossfeedTravel = travel;
    shader.uniforms.crossfeedSide = side;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec2 roadCoord; varying vec2 conveyorCoord;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nconveyorCoord=roadCoord;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float crossfeedTravel, crossfeedSide;
        varying vec2 conveyorCoord;
        float plateEdge, plateBevel, plateJoint, hinge;
        `,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        // Steel links travel laterally; the amber machine framing never moves.
        vec2 p=vec2(conveyorCoord.x,conveyorCoord.y*crossfeedSide-crossfeedTravel);
        vec2 cell=mod(p,vec2(18.,${CROSSFEED_RULES.treadPitch.toFixed(1)}));
        vec2 edge=min(cell,vec2(18.,${CROSSFEED_RULES.treadPitch.toFixed(1)})-cell);
        vec2 aa=max(fwidth(p),vec2(.018));
        plateJoint=1.-smoothstep(.09,.16+aa.y,edge.y);
        plateBevel=smoothstep(.11,.21+aa.y,edge.y)*(1.-smoothstep(.28,.46+aa.y,edge.y));
        plateEdge=1.-smoothstep(.13,.25+aa.x,edge.x);
        float hingeAlong=abs(mod(p.x+1.5,3.)-1.5);
        hinge=(1.-smoothstep(.26,.4+aa.x,hingeAlong))*(1.-smoothstep(.19,.34+aa.y,edge.y));
        float pin=1.-smoothstep(.085,.14+max(aa.x,aa.y),length(vec2(hingeAlong,edge.y-.23)));
        diffuseColor.rgb*=.91+.09*sin(floor(p.y/${CROSSFEED_RULES.treadPitch.toFixed(1)})*2.3+floor(p.x/18.)*.7);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.025,.032,.035),max(plateJoint,plateEdge)*.88);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.36,.41,.43),plateBevel*.65+hinge*.6);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.55,.58,.57),pin*.7);
        // Sparse fixed chevrons show feed direction even while the clock is paused.
        float lane=abs(mod(conveyorCoord.x+9.,36.)-18.);
        float across=mod(conveyorCoord.y*crossfeedSide+14.,20.)-10.;
        float arrow=1.-smoothstep(.35,.55+max(aa.x,aa.y),abs(across+lane*.65-1.5));
        arrow*=1.-smoothstep(2.5,3.2,lane);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.62,.39,.07),arrow*.8);
        `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+plateJoint*.25-plateBevel*.15,.25,.8);',
      );
  };
  material.customProgramCacheKey = () => 'colossus-linked-crossfeed-v1';
  return material;
}

/** Flush running links follow the exact steel triangles. Drive hardware is
 * outside the existing rim, so the working sheet remains the physical skin. */
export function createColossusConveyors({
  track,
  paint = null,
  shape = false,
}) {
  const group = new T.Group();
  group.name = 'Colossus / mechanical crossfeed conveyors';
  const projector = paint ?? createColossusPaint(track);
  const geometries = new Set(),
    materials = new Set(),
    treads = [],
    drums = [],
    hardware = [],
    batches = [];
  const material = (name, color, roughness, metalness) => {
    const value = new T.MeshStandardMaterial({
      name,
      color,
      roughness,
      metalness,
    });
    materials.add(value);
    return value;
  };
  const steel = material(
      'Conveyor / machined drive steel',
      '#8b9b9d',
      0.32,
      0.78,
    ),
    dark = material(
      'Conveyor / cast bearing and gear case',
      '#263239',
      0.67,
      0.45,
    ),
    amber = material('Conveyor / fixed safety enamel', '#d5a345', 0.52, 0.25);
  const box = new T.BoxGeometry(1, 1, 1),
    drumGeometry = new T.CylinderGeometry(3.2, 3.2, 9, 20),
    hubGeometry = new T.CylinderGeometry(1.5, 1.5, 1.2, 12);
  drumGeometry.rotateX(Math.PI / 2);
  hubGeometry.rotateX(Math.PI / 2);
  for (const geometry of [box, drumGeometry, hubGeometry])
    geometries.add(geometry);
  function mesh(geometry, surface, name, parent = group) {
    geometries.add(geometry);
    const object = new T.Mesh(geometry, surface);
    object.name = name;
    object.castShadow = object.receiveShadow = true;
    parent.add(object);
    if (parent !== group)
      hardware.push({
        object,
        moving: parent.name === 'Conveyor / live crossfeed drive drum',
      });
    return object;
  }
  function block(surface, size, position, name, parent) {
    const object = mesh(box, surface, name, parent);
    object.scale.set(...size);
    object.position.set(...position);
    return object;
  }
  function overlay(belt, start, end, min, max, surface, name, lift) {
    const object = mesh(
      projector.rectangle(start, end, { min, max, lift }),
      surface,
      belt.id + ' / ' + name,
    );
    object.castShadow = false;
    object.userData.conveyorSurface = true;
    object.userData.surfaceLift = lift;
    return object;
  }
  for (const belt of track.belts) {
    const { min, max } = crossfeedBounds(belt);
    const tread = treadMaterial(shape);
    tread.userData.side.value = belt.side;
    materials.add(tread);
    treads.push(tread);
    overlay(
      belt,
      belt.start,
      belt.end,
      min,
      max,
      tread,
      'moving linked tread',
      0.035,
    );
    for (const x of [min, max - 0.42])
      overlay(
        belt,
        belt.start,
        belt.end,
        x,
        x + 0.42,
        amber,
        'fixed safety edge',
        0.055,
      );
    for (const d of [belt.start, belt.end - 1.3])
      overlay(belt, d, d + 1.3, min, max, steel, 'flush transfer sill', 0.06);
    // The approach identifies exactly the moving half, leaving the quiet strip clear.
    overlay(
      belt,
      belt.start - 12,
      belt.start - 10.8,
      min,
      max,
      amber,
      'approach edge',
      0.045,
    );
    for (let d = belt.start + 13; d < belt.end - 6; d += 27) {
      const frame = track.sample(d),
        station = new T.Group();
      station.name = belt.id + ' / outboard drive cassette';
      station.position.copy(frame.position);
      station.quaternion.copy(frame.quaternion);
      station.userData.conveyorStation = d;
      group.add(station);
      const x = belt.side * 41;
      block(
        dark,
        [6.3, 5.5, 13],
        [belt.side * 44.8, 1.7, 0],
        'Conveyor / cast gearbox',
        station,
      );
      block(
        amber,
        [1.2, 5.8, 12],
        [belt.side * 48.2, 2.3, 0],
        'Conveyor / fixed drive guard',
        station,
      );
      const drum = new T.Group();
      drum.name = 'Conveyor / live crossfeed drive drum';
      // The raised geared drive remains visible above the 1.25 m rim;
      // its entire rotating envelope stays outside the 36 m running sheet.
      drum.position.set(x, 4.6, 0);
      station.add(drum);
      mesh(drumGeometry, dark, 'Conveyor / drive barrel', drum);
      // Four actual steel cleats turn with the tread clock above the edge.
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2;
        const cleat = block(
          steel,
          [0.8, 0.45, 8.7],
          [Math.sin(angle) * 3.12, Math.cos(angle) * 3.12, 0],
          'Conveyor / rotating drive cleat',
          drum,
        );
        cleat.rotation.z = -angle;
      }
      for (const z of [-5.3, 5.3]) {
        block(
          steel,
          [5.1, 12.6, 1.8],
          [x, -0.1, z],
          'Conveyor / bearing pedestal',
          station,
        );
        const hub = mesh(
          hubGeometry,
          steel,
          'Conveyor / rotating keyed hub',
          drum,
        );
        hub.position.z = z + Math.sign(z) * 1.1;
        block(
          dark,
          [0.65, 2.4, 0.2],
          [0, 0, z + Math.sign(z) * 1.8],
          'Conveyor / visible hub key',
          drum,
        );
      }
      drums.push({ object: drum, side: belt.side });
    }
  }
  // Keep repeated casings and drive parts in a few draws. Hidden source
  // transforms retain each drum's true mechanical rotation for live instances.
  group.updateMatrixWorld(true);
  const grouped = new Map();
  for (const item of hardware) {
    const { object, moving } = item;
    const key = [object.geometry.uuid, object.material.uuid, moving].join('/');
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }
  for (const items of grouped.values()) {
    const source = items[0].object;
    const instances = new T.InstancedMesh(
      source.geometry,
      source.material,
      items.length,
    );
    instances.name =
      'Conveyor / ' +
      (items[0].moving ? 'moving drive parts' : 'fixed drive hardware');
    instances.castShadow = instances.receiveShadow = true;
    instances.userData.conveyorHardware = true;
    items.forEach(({ object }, index) => {
      instances.setMatrixAt(index, object.matrixWorld);
      object.visible = false;
    });
    instances.computeBoundingSphere();
    // Rotation changes the axis-aligned source bounds, so use a conservative
    // per-batch sphere that contains every cleat throughout its turn.
    instances.boundingSphere.radius += 7;
    group.add(instances);
    batches.push({ instances, items });
    if (!items[0].moving)
      items.forEach(({ object }) => object.removeFromParent());
  }
  if (!paint) projector.dispose();
  let disposed = false;
  return {
    group,
    update({ time = 0 } = {}) {
      if (disposed) return;
      // Factual force direction continues under reduced motion, like the presses.
      const travel = crossfeedTravel(time);
      for (const tread of treads) tread.userData.travel.value = travel;
      for (const { object, side } of drums) {
        object.rotation.z = (-side * travel) / 3.2;
        object.updateWorldMatrix(true, true);
      }
      const inverse = new T.Matrix4().copy(group.matrixWorld).invert();
      const matrix = new T.Matrix4();
      for (const { instances, items } of batches) {
        if (!items[0].moving) continue;
        items.forEach(({ object }, index) =>
          instances.setMatrixAt(
            index,
            matrix.multiplyMatrices(inverse, object.matrixWorld),
          ),
        );
        instances.instanceMatrix.needsUpdate = true;
      }
    },
    setReflection(texture) {
      for (const surface of materials) {
        surface.envMap = texture;
        surface.envMapIntensity = 0.65;
        surface.needsUpdate = true;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.clear();
      batches.forEach(({ instances }) => instances.dispose());
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((surface) => surface.dispose());
    },
  };
}
