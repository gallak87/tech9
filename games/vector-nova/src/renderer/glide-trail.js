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

const onset = 75 / 3.6;
const life = 0.9;
const reach = 30;
const headFeather = 0.9;
const historySize = Math.ceil(life * 120) + 4;
const rowSpacing = 0.58;
const rowLimit = historySize + Math.ceil(reach / rowSpacing);
const columns = 9;
const strips = columns - 1;
const projectionOptions = { geometryOnly: true };

function wrappedDelta(delta, period) {
  return MathUtils.euclideanModulo(delta + period / 2, period) - period / 2;
}

function widthAt(hullWidth, pressure) {
  return hullWidth * (0.3 + 0.025 * pressure);
}

function strengthAt(speed, pressure) {
  const power =
    0.48 * MathUtils.smoothstep(speed, onset, 87 / 3.6) +
    0.52 * MathUtils.smoothstep(speed, 83 / 3.6, 140 / 3.6);
  return (0.28 + pressure * 0.1) * power;
}

function latticeStrengthAt(speed) {
  return MathUtils.smoothstep(speed, 170 / 3.6, 320 / 3.6);
}

function decayAt(fraction) {
  return 1 - MathUtils.smoothstep(fraction, 0.3, 1);
}

function headOpacity(metres) {
  return MathUtils.smoothstep(metres, 0, headFeather);
}

// Each deposit keeps its road coordinates, width and strength. The visible
// remainder conforms to the current deck, including curved or moving surfaces.
export function createGlideTrail({ track, surfaceStep = 0, coverageAt } = {}) {
  const geometry = new BufferGeometry();
  const positions = new Float32BufferAttribute(rowLimit * columns * 3, 3);
  const fades = new Float32BufferAttribute(rowLimit * columns, 1);
  const surfaceCoordinates = new Float32BufferAttribute(
    rowLimit * columns * 4,
    4,
  );
  const indices = new Uint16BufferAttribute(rowLimit * strips * 6, 1);
  positions.setUsage(DynamicDrawUsage);
  fades.setUsage(DynamicDrawUsage);
  surfaceCoordinates.setUsage(DynamicDrawUsage);
  indices.setUsage(DynamicDrawUsage);
  const across = new Float32Array(rowLimit * columns);
  for (let i = 0; i < across.length; i++)
    across[i] = 2 * ((i % columns) / strips) - 1;
  geometry.setAttribute('position', positions);
  geometry.setAttribute('fade', fades);
  geometry.setAttribute('trailSurface', surfaceCoordinates);
  geometry.setAttribute('across', new Float32BufferAttribute(across, 1));
  geometry.setIndex(indices);
  geometry.setDrawRange(0, 0);

  const accentColor = new Color(0x9ed9ec);
  const material = new ShaderMaterial({
    uniforms: {
      ...UniformsUtils.clone(UniformsLib.fog),
      accent: { value: accentColor },
    },
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    forceSinglePass: true,
    side: DoubleSide,
    toneMapped: false,
    fog: true,
    vertexShader: `
      attribute float fade, across;
      attribute vec4 trailSurface;
      varying vec2 trail;
      varying vec4 surfaceCoord;
      #include <fog_pars_vertex>
      void main() {
        trail = vec2(across, fade);
        surfaceCoord = trailSurface;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform vec3 accent;
      varying vec2 trail;
      varying vec4 surfaceCoord;
      #include <fog_pars_fragment>
      void main() {
        // The two diagonals share metre-based coordinates stamped on the road.
        vec2 cell = surfaceCoord.xy / vec2(1.55, 20.0);
        vec2 diagonals = cell.y + vec2(cell.x, -cell.x);
        vec2 footprint = fwidth(diagonals);
        vec2 aa = max(vec2(0.001), footprint * 0.65);
        vec2 distanceToWire = abs(fract(diagonals + 0.5) - 0.5);

        // Individual links shorten and disappear at different points in the
        // fade. IDs are stable, so stationary old deposits never shimmer.
        float remaining = 1.0 - surfaceCoord.z;
        vec2 link = fract(
          floor(diagonals + 0.5) * 0.75487766 +
          floor(diagonals.yx) * 0.56984029
        );
        vec2 cutoff = 0.16 + 0.42 * link;
        vec2 retained = smoothstep(cutoff - 0.08, cutoff + 0.08, vec2(remaining));
        vec2 fromLinkCentre = abs(fract(diagonals.yx) - 0.5);
        retained *= 1.0 - smoothstep(
          vec2(0.32 + 0.25 * remaining),
          vec2(0.43 + 0.18 * remaining),
          fromLinkCentre
        );

        vec2 wire = retained * (1.0 - smoothstep(
          vec2(0.006), vec2(0.013) + aa, distanceToWire
        ));
        vec2 spill = retained * (1.0 - smoothstep(
          vec2(0.013), vec2(0.04) + aa, distanceToWire
        ));
        float detail = surfaceCoord.w * (1.0 - smoothstep(0.22, 0.48, max(footprint.x, footprint.y)));
        float glow = max(spill.x, spill.y) * detail;
        float core = max(wire.x, wire.y) * detail;
        float edge = 1.0 - smoothstep(0.48, 1.0, abs(trail.x));
        vec3 tint = mix(accent, vec3(1.0), core * 0.30);
        float opacity = trail.y * edge * (0.74 + 0.14 * glow + 0.52 * core);
        gl_FragColor = vec4(tint, opacity);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'Racing / ground glide trail';
  mesh.userData.aoExclude = mesh.userData.reflectionExclude = true;
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.visible = false;

  const stations = new Float64Array(historySize);
  const laterals = new Float64Array(historySize);
  const times = new Float64Array(historySize);
  const travelled = new Float64Array(historySize);
  const widths = new Float32Array(historySize);
  const strengths = new Float32Array(historySize);
  const latticeStrengths = new Float32Array(historySize);
  const linked = new Uint8Array(historySize);
  const coverage = new Float32Array(rowLimit * columns);
  const centre = new Vector3();
  const side = new Vector3();
  const bow = new Vector3();
  const leftPoint = new Vector3();
  const rightPoint = new Vector3();
  const point = new Vector3();
  const bankStartPosition = new Vector3();
  const bankStartRight = new Vector3();
  const bankStartUp = new Vector3();
  const bankEndPosition = new Vector3();
  const bankEndRight = new Vector3();
  const bankStep =
    track && surfaceStep
      ? track.length / Math.ceil(track.length / surfaceStep)
      : 0;
  let head = -1,
    count = 0,
    joining = false,
    lastTime = -Infinity;
  let lastReset,
    lastAccent,
    rows = 0,
    indexCount = 0,
    cachedBankStart,
    disposed = false;

  function clear() {
    head = -1;
    count = 0;
    joining = false;
    lastTime = -Infinity;
    geometry.setDrawRange(0, 0);
    mesh.visible = false;
  }

  function routeStation(station) {
    return track.closed === false
      ? station
      : MathUtils.euclideanModulo(station, track.length);
  }

  function cacheBank(start) {
    if (cachedBankStart === start) return;
    cachedBankStart = start;
    const a = track.sample(start);
    bankStartPosition.copy(a.position);
    bankStartRight.copy(a.right);
    bankStartUp.copy(a.up);
    const b = track.sample(start + bankStep);
    bankEndPosition.copy(b.position);
    bankEndRight.copy(b.right);
  }

  function appendRow(
    station,
    lateral,
    width,
    fade,
    distance,
    fraction,
    lattice,
    preview = false,
  ) {
    const at = preview ? station : routeStation(station);
    if (!preview && (at < 0 || at >= track.length)) return -1;
    const surface = preview
      ? null
      : track.sampleSurface?.(at, lateral, projectionOptions);
    const halfRoad = preview ? Infinity : track.width / 2;
    const min = surface?.period
      ? -Infinity
      : (surface?.bounds?.min ?? -halfRoad);
    const max = surface?.period ? Infinity : (surface?.bounds?.max ?? halfRoad);
    const deck = !preview && !surface && bankStep > 0;
    let bankMix = 0;
    bow.set(0, 0, 0);
    if (preview) {
      centre.set(0, 0, station);
      side.set(width, 0, 0);
    } else if (surface) {
      centre.copy(surface.position).addScaledVector(surface.up, 0.052);
      side.copy(surface.right).multiplyScalar(width);
      if (surface.transverseCurvature || surface.period > 0) {
        // Resolve the arc across the footprint with three surface probes per
        // row, including the tighter curvature of latched tube walls.
        const left = track.sampleSurface(
          at,
          lateral - width,
          projectionOptions,
        );
        if (left) leftPoint.copy(left.position).addScaledVector(left.up, 0.052);
        const right = track.sampleSurface(
          at,
          lateral + width,
          projectionOptions,
        );
        if (left && right) {
          rightPoint.copy(right.position).addScaledVector(right.up, 0.052);
          side.copy(rightPoint).sub(leftPoint).multiplyScalar(0.5);
          bow.copy(rightPoint).add(leftPoint).multiplyScalar(0.5).sub(centre);
        }
      }
    } else if (deck) {
      const start = Math.floor(at / bankStep) * bankStep;
      cacheBank(start);
      bankMix = (at - start) / bankStep;
      centre
        .copy(bankStartPosition)
        .lerp(bankEndPosition, bankMix)
        .addScaledVector(bankStartUp, 0.064);
    } else {
      const frame = track.sample(at);
      centre
        .copy(frame.position)
        .addScaledVector(frame.right, lateral)
        .addScaledVector(frame.up, 0.037);
      side.copy(frame.right).multiplyScalar(width);
    }

    const base = rows++ * columns;
    for (let column = 0; column < columns; column++) {
      const i = base + column;
      const x = across[i];
      const lane = lateral + x * width;
      coverage[i] = preview
        ? 1
        : lane < min || lane > max
          ? 0
          : (coverageAt?.(at, lane) ?? 1);
      point.copy(centre);
      if (deck) {
        // Follow the same two triangles as the rendered swept deck.
        if (bankMix + lane / track.width + 0.5 <= 1) {
          point
            .addScaledVector(bankStartRight, lane + bankMix * halfRoad)
            .addScaledVector(bankEndRight, -bankMix * halfRoad);
        } else {
          point
            .addScaledVector(bankStartRight, (1 - bankMix) * halfRoad)
            .addScaledVector(bankEndRight, lane - (1 - bankMix) * halfRoad);
        }
      } else point.addScaledVector(side, x).addScaledVector(bow, x * x);
      positions.setXYZ(i, point.x, point.y, point.z);
      fades.setX(i, fade * coverage[i]);
      surfaceCoordinates.setXYZW(i, x * width, distance, fraction, lattice);
    }
    return base;
  }

  function connect(first, second, at, lateral, width, preview = false) {
    const output = indices.array;
    for (let strip = 0; strip < strips; strip++) {
      const a = first + strip;
      const b = second + strip;
      if (
        Math.min(coverage[a], coverage[a + 1], coverage[b], coverage[b + 1]) <=
        0.05
      )
        continue;
      // Resolve narrow openings separately across the footprint. One missing
      // strip should never erase the impression on the neighbouring road.
      const middle = lateral + width * ((across[a] + across[a + 1]) / 2);
      if (!preview && coverageAt && (coverageAt(at, middle) ?? 1) <= 0.05)
        continue;
      output[indexCount++] = a;
      output[indexCount++] = a + 1;
      output[indexCount++] = b;
      output[indexCount++] = a + 1;
      output[indexCount++] = b + 1;
      output[indexCount++] = b;
    }
  }

  function begin() {
    rows = 0;
    indexCount = 0;
    cachedBankStart = NaN;
  }

  function finish(accent) {
    geometry.setDrawRange(0, indexCount);
    mesh.visible = indexCount > 0;
    if (!mesh.visible) return;
    accentColor.set(accent);
    for (const [attribute, length] of [
      [positions, rows * columns * 3],
      [fades, rows * columns],
      [surfaceCoordinates, rows * columns * 4],
      [indices, indexCount],
    ]) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, length);
      attribute.needsUpdate = true;
    }
  }

  function draw(time, accent) {
    begin();
    let previousRow = -1;
    let previousStation = 0,
      previousLateral = 0,
      previousWidth = 0;

    function deposit(
      station,
      lateral,
      age,
      distance,
      width,
      strength,
      lattice,
    ) {
      const metres = travelled[head] - distance;
      const fraction = MathUtils.clamp(
        Math.max(age / life, metres / reach),
        0,
        1,
      );
      const row = appendRow(
        station,
        lateral,
        width,
        strength * decayAt(fraction) * headOpacity(metres),
        distance,
        fraction,
        lattice,
      );
      if (row >= 0 && previousRow >= 0) {
        connect(
          previousRow,
          row,
          routeStation((station + previousStation) / 2),
          (lateral + previousLateral) / 2,
          (width + previousWidth) / 2,
        );
      }
      previousRow = row;
      previousStation = station;
      previousLateral = lateral;
      previousWidth = width;
    }

    for (let rank = 0; rank < count - 1 && rows < rowLimit; rank++) {
      const recent = (head + historySize - rank) % historySize;
      const older = (recent + historySize - 1) % historySize;
      const age = time - times[recent];
      const metres = travelled[head] - travelled[recent];
      if (age >= life || metres >= reach) break;
      if (!linked[recent]) {
        previousRow = -1;
        continue;
      }
      if (previousRow < 0)
        deposit(
          stations[recent],
          laterals[recent],
          age,
          travelled[recent],
          widths[recent],
          strengths[recent],
          latticeStrengths[recent],
        );
      const elapsed = times[recent] - times[older];
      const segment = travelled[recent] - travelled[older];
      const end = Math.min(
        1,
        (life - age) / elapsed,
        (reach - metres) / Math.max(segment, 1e-6),
      );
      const cuts = Math.max(1, Math.ceil((segment * end) / rowSpacing));
      for (let cut = 1; cut <= cuts && rows < rowLimit; cut++) {
        const t = (end * cut) / cuts;
        deposit(
          MathUtils.lerp(stations[recent], stations[older], t),
          MathUtils.lerp(laterals[recent], laterals[older], t),
          age + elapsed * t,
          MathUtils.lerp(travelled[recent], travelled[older], t),
          MathUtils.lerp(widths[recent], widths[older], t),
          MathUtils.lerp(strengths[recent], strengths[older], t),
          MathUtils.lerp(latticeStrengths[recent], latticeStrengths[older], t),
        );
      }
      if (end < 1) break;
    }
    finish(accent);
  }

  return {
    mesh,
    update({
      active,
      grounded,
      state,
      speed = state?.speed,
      time = state?.time,
      boost = 0,
      accent = 0x9ed9ec,
      tail = 0,
      hullWidth = 4,
      reducedMotion = false,
    }) {
      if (disposed) return;
      if (
        !active ||
        reducedMotion ||
        !track ||
        !state ||
        !Number.isFinite(time)
      ) {
        clear();
        return;
      }
      if (
        time < lastTime ||
        state.resetCount !== lastReset ||
        accent !== lastAccent
      )
        clear();
      lastReset = state.resetCount;
      lastAccent = accent;
      if (time === lastTime) return;

      if (grounded && speed > onset) {
        const heading = state.heading ?? 0;
        const origin = tail * 0.38;
        let station = state.distance + Math.cos(heading) * origin;
        let lateral = state.lateral + Math.sin(heading) * origin;
        let segment = 0;
        if (count) {
          const ds = station - stations[head];
          const delta =
            track.closed === false ? ds : wrappedDelta(ds, track.length);
          const period = track.sampleSurface?.(
            routeStation(station),
            lateral,
            projectionOptions,
          )?.period;
          const dx = lateral - laterals[head];
          const sideways = period > 0 ? wrappedDelta(dx, period) : dx;
          segment = Math.hypot(delta, sideways);
          station = stations[head] + delta;
          lateral = laterals[head] + sideways;
          if (
            joining &&
            segment > 4 + Math.min(speed, 220) * (time - lastTime) * 2
          ) {
            clear();
            segment = 0;
          }
        }
        if (!joining || segment > 0.015) {
          const next = (head + 1) % historySize;
          const pressure = MathUtils.clamp(boost, 0, 1);
          stations[next] = station;
          laterals[next] = lateral;
          times[next] = time;
          travelled[next] = count
            ? travelled[head] + (joining ? segment : 0)
            : 0;
          widths[next] = widthAt(hullWidth, pressure);
          strengths[next] = strengthAt(speed, pressure);
          latticeStrengths[next] = latticeStrengthAt(speed);
          linked[next] = joining ? 1 : 0;
          head = next;
          count = Math.min(historySize, count + 1);
        }
        joining = true;
      } else joining = false;

      lastTime = time;
      draw(time, accent);
    },
    preview({
      active,
      speed,
      boost = 0,
      accent = 0x9ed9ec,
      tail = 0,
      hullWidth = 4,
      fadeScale = 1,
      reducedMotion = false,
    }) {
      if (disposed) return;
      begin();
      const origin = tail * 0.38;
      if (
        active &&
        !reducedMotion &&
        speed > onset &&
        origin > -6.3 &&
        fadeScale > 0
      ) {
        const pressure = MathUtils.clamp(boost, 0, 1);
        const width = widthAt(hullWidth, pressure);
        const strength =
          strengthAt(speed, pressure) * MathUtils.clamp(fadeScale, 0, 1);
        const lattice = latticeStrengthAt(speed);
        const length = origin + 6.3;
        let previous = -1;
        for (let row = 0; row <= 12; row++) {
          const fraction = row / 12;
          const z = origin - length * fraction;
          const base = appendRow(
            z,
            0,
            width,
            strength * decayAt(fraction) * headOpacity(length * fraction),
            -z * 2.25,
            fraction,
            lattice,
            true,
          );
          if (previous >= 0) connect(previous, base, z, 0, width, true);
          previous = base;
        }
      }
      finish(accent);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clear();
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
