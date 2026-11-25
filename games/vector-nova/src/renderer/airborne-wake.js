import {
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  MathUtils,
  Mesh,
  ShaderMaterial,
  Uint16BufferAttribute,
  UniformsLib,
  UniformsUtils,
  Vector3,
} from 'three';
import { glideWakeAnchor } from './glide-trail.js';
import {
  playerWakeReach,
  wakeProfileGLSL,
  wakeRipplePhase,
} from './wake-profile.js';

const landingFade = 0.2;
const verticesPerRow = 4;
const indicesPerSegment = 12;

function wakeSample() {
  return {
    point: new Vector3(),
    edge: new Vector3(),
    depth: new Vector3(),
    time: -Infinity,
    fade: 0,
  };
}

// The air wake carries copies of the rendered hull pose in scene space. The
// road wake can therefore remain on the deck when this ribbon lifts away.
export function createAirborneWake({
  strengthScale = 1,
  reach = playerWakeReach,
  duration = 0.72,
} = {}) {
  const geometry = new BufferGeometry();
  const capacity = Math.ceil(duration * 240) + 2;
  const vertexCapacity = capacity * verticesPerRow;
  const positions = new Float32BufferAttribute(vertexCapacity * 3, 3);
  const fades = new Float32BufferAttribute(vertexCapacity, 1);
  const distances = new Float32BufferAttribute(vertexCapacity, 1);
  const across = new Float32Array(vertexCapacity);
  const indices = new Uint16Array((capacity - 1) * indicesPerSegment);
  for (let i = 0; i < capacity; i++) {
    const a = i * verticesPerRow;
    across.set([-1, 1, -1, 1], a);
    if (i === capacity - 1) break;
    const b = a + verticesPerRow;
    const index = i * indicesPerSegment;
    indices.set([a, a + 1, b, a + 1, b + 1, b], index);
    indices.set([a + 2, a + 3, b + 2, a + 3, b + 3, b + 2], index + 6);
  }
  for (const [name, attribute] of [
    ['position', positions],
    ['fade', fades],
    ['along', distances],
  ]) {
    geometry.setAttribute(name, attribute.setUsage(DynamicDrawUsage));
  }
  geometry.setAttribute('across', new Float32BufferAttribute(across, 1));
  geometry.setIndex(new Uint16BufferAttribute(indices, 1));
  geometry.setDrawRange(0, 0);

  const accentColor = new Color(0x9ed9ec);
  const length = { value: 0 };
  const opacity = { value: 0 };
  const ripplePhase = { value: 0 };
  const material = new ShaderMaterial({
    uniforms: {
      ...UniformsUtils.clone(UniformsLib.fog),
      accent: { value: accentColor },
      wakeLength: length,
      opacity,
      ripplePhase,
    },
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    forceSinglePass: true,
    toneMapped: false,
    fog: true,
    vertexShader: `
      attribute float fade, across, along;
      varying vec3 wake;
      #include <fog_pars_vertex>
      void main() {
        wake = vec3(across, along, fade);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform vec3 accent;
      uniform float wakeLength, opacity, ripplePhase;
      varying vec3 wake;
      #include <fog_pars_fragment>
      ${wakeProfileGLSL}
      void main() {
        vec4 profile = wakeProfile(accent, wake.x, wake.y, ripplePhase);
        float front = smoothstep(0.0, 0.45, wake.y);
        float tail = 1.0 - smoothstep(0.41, 1.0, wake.y / max(wakeLength, 0.001));
        float alpha = opacity * wake.z * front * tail * profile.a;
        gl_FragColor = vec4(profile.rgb, clamp(alpha, 0.0, 1.0));
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'Racing / airborne glide wake';
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.userData.aoExclude = mesh.userData.reflectionExclude = true;

  const samples = Array.from({ length: capacity }, wakeSample);
  const ground = wakeSample();
  const point = new Vector3();
  const edge = new Vector3();
  const depth = new Vector3();
  const origin = new Vector3();
  const side = new Vector3();
  let head = -1;
  let count = 0;
  let lastTime = -Infinity;
  let lastReset;
  let lastAccent;
  let lastAirborne = false;
  let landedAt = -Infinity;
  let disposed = false;

  function clearPath() {
    head = -1;
    count = 0;
    geometry.setDrawRange(0, 0);
    mesh.visible = false;
    opacity.value = 0;
    ripplePhase.value = 0;
  }

  function reset() {
    clearPath();
    ground.time = -Infinity;
    lastTime = -Infinity;
    lastAirborne = false;
    landedAt = -Infinity;
  }

  function store(sample, point, edge, depth, time, fade) {
    sample.point.copy(point);
    sample.edge.copy(edge);
    sample.depth.copy(depth);
    sample.time = time;
    sample.fade = fade;
  }

  function append(point, edge, depth, time, fade, distance = 0) {
    // New travel offsets the shader's head-relative distance, so each scallop
    // stays on the part of the path that emitted it.
    ripplePhase.value = wakeRipplePhase(distance, ripplePhase.value);
    head = (head + 1) % capacity;
    count = Math.min(capacity, count + 1);
    store(samples[head], point, edge, depth, time, fade);
  }

  function draw(time) {
    let vertices = 0;
    let metres = 0;
    function writePair(fade, distance) {
      for (let sign = -1; sign <= 1; sign += 2) {
        positions.setXYZ(
          vertices,
          point.x + sign * side.x,
          point.y + sign * side.y,
          point.z + sign * side.z,
        );
        distances.setX(vertices, distance);
        fades.setX(vertices++, fade);
      }
    }
    function row(near, far, mix, distance) {
      point.copy(near.point).lerp(far.point, mix);
      const age = time - MathUtils.lerp(near.time, far.time, mix);
      const fade =
        MathUtils.lerp(near.fade, far.fade, mix) *
        (1 - MathUtils.smoothstep(age, duration * 0.35, duration));
      side.copy(near.edge).lerp(far.edge, mix);
      writePair(fade, distance);
      // The shallow second ribbon keeps the wake visible when the wide ribbon
      // turns edge-on, using the same historical hull frame.
      side.copy(near.depth).lerp(far.depth, mix);
      writePair(fade * 0.55, distance);
    }

    for (let i = 0; i < count - 1; i++) {
      const near = samples[(head + capacity - i) % capacity];
      const far = samples[(head + capacity - i - 1) % capacity];
      const segment = near.point.distanceTo(far.point);
      const fraction = Math.min(
        1,
        (reach - metres) / segment,
        (duration - (time - near.time)) / (near.time - far.time),
      );
      if (fraction <= 0) break;
      if (i === 0) row(near, near, 0, 0);
      metres += segment * fraction;
      row(near, far, fraction, metres);
      if (fraction < 1) break;
    }
    length.value = metres;
    const rows = vertices / verticesPerRow;
    const visible = rows >= 2;
    geometry.setDrawRange(0, visible ? (rows - 1) * indicesPerSegment : 0);
    mesh.visible = visible;
    if (!visible) return;
    for (const attribute of [positions, fades, distances]) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, vertices * attribute.itemSize);
      attribute.needsUpdate = true;
    }
  }

  return {
    mesh,
    reset,
    update({
      active,
      paused = false,
      airborne,
      time,
      resetCount,
      position,
      quaternion,
      bounds,
      accent = 0x9ed9ec,
      speed,
      visibility = 1,
      reducedMotion = false,
    }) {
      if (disposed) return;
      if (!active || reducedMotion || !Number.isFinite(time)) {
        if (Number.isFinite(lastTime)) reset();
        return;
      }
      if (time < lastTime || lastReset !== resetCount || lastAccent !== accent)
        reset();
      lastReset = resetCount;
      lastAccent = accent;
      if (paused || time <= lastTime) return;

      const [left, bottom, tail] = bounds.min;
      origin
        .set(0, bottom - 0.12, glideWakeAnchor(tail))
        .applyQuaternion(quaternion)
        .add(position);
      const halfWidth = (bounds.max[0] - left) * 0.25;
      edge.set(halfWidth * 1.16, 0, 0).applyQuaternion(quaternion);
      depth.set(0, halfWidth * 0.24, 0).applyQuaternion(quaternion);
      const fade = 0.34 * strengthScale * MathUtils.smoothstep(speed, 15, 36);
      if (airborne) {
        const previous = lastAirborne ? samples[head] : ground;
        const elapsed = time - previous.time;
        const distance = origin.distanceTo(previous.point);
        const adjacent = elapsed <= 0.12 && distance <= 3 + 2 * speed * elapsed;
        if (!lastAirborne || !adjacent) clearPath();
        if (!lastAirborne && adjacent && distance > 0.015)
          append(
            ground.point,
            ground.edge,
            ground.depth,
            ground.time,
            ground.fade,
          );
        if (!count || distance > 0.015)
          append(origin, edge, depth, time, fade, count ? distance : 0);
        accentColor.set(accent);
        opacity.value = visibility;
        draw(time);
      } else {
        if (lastAirborne) landedAt = time;
        if (mesh.visible) {
          opacity.value =
            visibility *
            (1 - MathUtils.smoothstep(time - landedAt, 0, landingFade));
          if (opacity.value === 0) clearPath();
        }
        store(ground, origin, edge, depth, time, fade);
      }
      lastAirborne = airborne;
      lastTime = time;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      reset();
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
