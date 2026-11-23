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

const reach = 12;
const life = 0.36;
const landingFade = 0.2;
const capacity = Math.ceil(life * 240) + 2;

function wakeSample() {
  return {
    point: new Vector3(),
    edge: new Vector3(),
    time: -Infinity,
    fade: 0,
  };
}

// The air wake carries copies of the rendered hull pose in scene space. The
// road wake can therefore remain on the deck when this ribbon lifts away.
export function createAirborneWake() {
  const geometry = new BufferGeometry();
  const positions = new Float32BufferAttribute(capacity * 6, 3);
  const fades = new Float32BufferAttribute(capacity * 2, 1);
  const distances = new Float32BufferAttribute(capacity * 2, 1);
  const across = new Float32Array(capacity * 2);
  const indices = new Uint16Array((capacity - 1) * 6);
  for (let i = 0; i < capacity; i++) {
    const a = i * 2;
    across.set([-1, 1], a);
    if (i < capacity - 1)
      indices.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6);
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
  const material = new ShaderMaterial({
    uniforms: {
      ...UniformsUtils.clone(UniformsLib.fog),
      accent: { value: accentColor },
      wakeLength: length,
      opacity,
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
      uniform float wakeLength, opacity;
      varying vec3 wake;
      #include <fog_pars_fragment>
      void main() {
        float edge = 1.0 - smoothstep(0.08, 1.0, abs(wake.x));
        float front = smoothstep(0.0, 0.45, wake.y);
        float tail = 1.0 - smoothstep(0.18, 1.0, wake.y / max(wakeLength, 0.001));
        vec3 glow = accent * (1.18 + 0.28 * edge);
        gl_FragColor = vec4(glow, opacity * wake.z * sqrt(edge) * front * tail);
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
  }

  function reset() {
    clearPath();
    ground.time = -Infinity;
    lastTime = -Infinity;
    lastAirborne = false;
    landedAt = -Infinity;
  }

  function store(sample, point, edge, time, fade) {
    sample.point.copy(point);
    sample.edge.copy(edge);
    sample.time = time;
    sample.fade = fade;
  }

  function append(point, edge, time, fade) {
    head = (head + 1) % capacity;
    count = Math.min(capacity, count + 1);
    store(samples[head], point, edge, time, fade);
  }

  function draw(time) {
    let rows = 0;
    let metres = 0;
    function row(near, far, mix, metres) {
      point.copy(near.point).lerp(far.point, mix);
      side.copy(near.edge).lerp(far.edge, mix);
      const age = time - MathUtils.lerp(near.time, far.time, mix);
      const fade =
        MathUtils.lerp(near.fade, far.fade, mix) *
        (1 - MathUtils.smoothstep(age, life * 0.35, life));
      for (const sign of [-1, 1]) {
        positions.setXYZ(
          rows,
          point.x + sign * side.x,
          point.y + sign * side.y,
          point.z + sign * side.z,
        );
        distances.setX(rows, metres);
        fades.setX(rows++, fade);
      }
    }

    for (let i = 0; i < count - 1; i++) {
      const near = samples[(head + capacity - i) % capacity];
      const far = samples[(head + capacity - i - 1) % capacity];
      const segment = near.point.distanceTo(far.point);
      const fraction = Math.min(
        1,
        (reach - metres) / segment,
        (life - (time - near.time)) / (near.time - far.time),
      );
      if (fraction <= 0) break;
      if (i === 0) row(near, near, 0, 0);
      metres += segment * fraction;
      row(near, far, fraction, metres);
      if (fraction < 1) break;
    }
    length.value = metres;
    const visible = rows >= 4;
    geometry.setDrawRange(0, visible ? (rows / 2 - 1) * 6 : 0);
    mesh.visible = visible;
    if (!visible) return;
    for (const attribute of [positions, fades, distances]) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, rows * attribute.itemSize);
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
      edge.set((bounds.max[0] - left) * 0.25, 0, 0).applyQuaternion(quaternion);
      const fade = 0.22 * MathUtils.smoothstep(speed, 15, 36);
      if (airborne) {
        const previous = lastAirborne ? samples[head] : ground;
        const elapsed = time - previous.time;
        const distance = origin.distanceTo(previous.point);
        const adjacent = elapsed <= 0.12 && distance <= 3 + 2 * speed * elapsed;
        if (!lastAirborne || !adjacent) clearPath();
        if (!lastAirborne && adjacent && distance > 0.015)
          append(ground.point, ground.edge, ground.time, ground.fade);
        if (!count || distance > 0.015) append(origin, edge, time, fade);
        accentColor.set(accent);
        opacity.value = 1;
        draw(time);
      } else {
        if (lastAirborne) landedAt = time;
        if (mesh.visible) {
          opacity.value =
            1 - MathUtils.smoothstep(time - landedAt, 0, landingFade);
          if (opacity.value === 0) clearPath();
        }
        store(ground, origin, edge, time, fade);
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
