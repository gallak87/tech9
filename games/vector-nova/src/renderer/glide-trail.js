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
  Vector2,
  Vector3,
} from 'three';

const onset = 75 / 3.6;
const life = 0.9;
const reach = 30;
const headFeather = 0.9;
const boostDiamondLength = 5.5;
const boostDiamondLife = 0.26;
const previewPhaseScale = 2.25;
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

function decayAt(fraction) {
  return 1 - MathUtils.smoothstep(fraction, 0.3, 1);
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
  const leadingFade = new Vector2(0, headFeather);
  const boostPulses = [new Vector3(0, 1, 0), new Vector3(0, 1, 0)];
  const pulseTimes = [-Infinity, -Infinity];
  const material = new ShaderMaterial({
    uniforms: {
      ...UniformsUtils.clone(UniformsLib.fog),
      accent: { value: accentColor },
      leadingFade: { value: leadingFade },
      boostPulses: { value: boostPulses },
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
      uniform vec2 leadingFade;
      uniform vec3 boostPulses[2];
      varying vec2 trail;
      varying vec4 surfaceCoord;
      #include <fog_pars_fragment>
      vec2 diamondGlow(vec3 pulse) {
        // Phase is distance along the deposited road, not distance from the hull.
        float along = (surfaceCoord.y - pulse.x) * pulse.y;
        float halfWidth = max(0.001, surfaceCoord.w * 0.70);
        float diamond = abs(surfaceCoord.x) / halfWidth + abs(2.0 * along - 1.0);
        float aa = max(0.001, fwidth(diamond) * 0.60);
        float outline = abs(diamond - 1.0);
        vec2 glow = 1.0 - smoothstep(
          vec2(0.013, 0.026), vec2(0.035, 0.12) + aa, vec2(outline)
        );
        float ends = smoothstep(0.0, 0.024, along) *
          (1.0 - smoothstep(0.976, 1.0, along));
        float detail = 1.0 - smoothstep(0.15, 0.40, aa);
        float deposited = 1.0 - smoothstep(0.72, 1.0, surfaceCoord.z);
        return glow * (pulse.z * ends * detail * deposited);
      }
      void main() {
        vec2 glow = vec2(0.0);
        if (boostPulses[0].z > 0.0) glow = diamondGlow(boostPulses[0]);
        if (boostPulses[1].z > 0.0) glow = max(glow, diamondGlow(boostPulses[1]));
        float lateral = abs(trail.x);
        float edge = 1.0 - smoothstep(0.48, 1.0, lateral);
        float band = 1.0 - smoothstep(0.25, 0.9, lateral);
        float halo = sqrt(edge);
        vec3 livery = accent * (1.12 + 0.29 * band);
        vec3 tint = mix(livery, vec3(1.2), glow.x * 0.56);
        float lead = smoothstep(0., leadingFade.y, abs(surfaceCoord.y - leadingFade.x));
        float opacity = min(0.8, trail.y * lead *
          (edge * (0.63 + 0.42 * glow.y + 1.0 * glow.x) + 0.18 * halo));
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
    headTickTime = -Infinity,
    lastTickTime = -Infinity,
    lastTime = -Infinity;
  let lastReset,
    lastAccent,
    boostHeld = false,
    pendingBoostAt = -Infinity,
    lastPreviewTime = -Infinity,
    rows = 0,
    indexCount = 0,
    cachedBankStart,
    disposed = false;

  function boostStarted(boosting) {
    const rising = boosting && !boostHeld;
    boostHeld = boosting;
    return rising;
  }

  function clearBoostPulses() {
    pendingBoostAt = -Infinity;
    for (let i = 0; i < boostPulses.length; i++) {
      pulseTimes[i] = -Infinity;
      boostPulses[i].z = 0;
    }
  }

  function queueBoostPulse(boosting, rising, time) {
    if (!boosting || time - pendingBoostAt >= boostDiamondLife)
      pendingBoostAt = -Infinity;
    if (boosting && rising) pendingBoostAt = time;
  }

  function stampBoostPulse(time, distance) {
    if (!Number.isFinite(pendingBoostAt)) return;
    pendingBoostAt = -Infinity;
    // Preserve the last stamp's fade during a rapid release and re-engage.
    const slot = pulseTimes[0] <= pulseTimes[1] ? 0 : 1;
    pulseTimes[slot] = time;
    boostPulses[slot].set(distance, 1 / boostDiamondLength, 0);
  }

  function fadeBoostPulses(time) {
    for (let i = 0; i < boostPulses.length; i++) {
      const age = time - pulseTimes[i];
      boostPulses[i].z =
        MathUtils.smoothstep(age, 0, 0.035) *
        (1 - MathUtils.smoothstep(age, 0.11, boostDiamondLife));
    }
  }

  function clear() {
    head = -1;
    count = 0;
    joining = false;
    headTickTime = -Infinity;
    lastTime = -Infinity;
    clearBoostPulses();
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
      surfaceCoordinates.setXYZW(i, x * width, distance, fraction, width);
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
    // Evaluate the feather between vertices so its length remains constant as
    // adjacent frames need different numbers of deck samples.
    leadingFade.set(travelled[head] ?? 0, headFeather);
    let previousRow = -1;
    let previousStation = 0,
      previousLateral = 0,
      previousWidth = 0;

    function deposit(station, lateral, age, distance, width, strength) {
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
        strength * decayAt(fraction),
        distance,
        fraction,
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
      paused = false,
      grounded,
      state,
      speed = state?.speed,
      time = state?.time,
      boost = 0,
      boosting = false,
      accent = 0x9ed9ec,
      tail = 0,
      hullWidth = 4,
      reducedMotion = false,
    }) {
      if (disposed) return;
      const rising = boostStarted(boosting);
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
      const tickTime = state.time ?? time;
      const reset =
        tickTime < lastTickTime ||
        state.resetCount !== lastReset ||
        accent !== lastAccent;
      const queueOnset = rising && (!reset || !Number.isFinite(lastTime));
      if (reset) clear();
      lastReset = state.resetCount;
      lastAccent = accent;
      lastTickTime = tickTime;
      if (paused || time <= lastTime) return;

      queueBoostPulse(grounded && boosting, queueOnset, time);
      if (grounded && speed > onset) {
        // Follow every interpolated display pose while retaining at most one
        // sample for each physics tick in the trail history.
        if (headTickTime === tickTime && joining) {
          joining = linked[head] === 1;
          head = (head + historySize - 1) % historySize;
          count--;
          headTickTime = -Infinity;
        }
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
            segment > 4 + Math.min(speed, 220) * (time - times[head]) * 2
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
          linked[next] = joining ? 1 : 0;
          head = next;
          headTickTime = tickTime;
          count = Math.min(historySize, count + 1);
          stampBoostPulse(time, travelled[next]);
        }
        joining = true;
      } else joining = false;

      lastTime = time;
      fadeBoostPulses(time);
      draw(time, accent);
    },
    preview({
      active,
      speed,
      boost = 0,
      boosting = false,
      time = 0,
      accent = 0x9ed9ec,
      tail = 0,
      hullWidth = 4,
      fadeScale = 1,
      reducedMotion = false,
    }) {
      if (disposed) return;
      const rising = boostStarted(boosting);
      if (time < lastPreviewTime) clearBoostPulses();
      lastPreviewTime = time;
      begin();
      const origin = tail * 0.38;
      if (
        !active ||
        reducedMotion ||
        !Number.isFinite(time) ||
        origin <= -6.3 ||
        fadeScale <= 0
      ) {
        clearBoostPulses();
        finish(accent);
        return;
      }
      queueBoostPulse(boosting, rising, time);
      if (speed > onset) {
        const pressure = MathUtils.clamp(boost, 0, 1);
        const width = widthAt(hullWidth, pressure);
        const strength =
          strengthAt(speed, pressure) * MathUtils.clamp(fadeScale, 0, 1);
        const length = origin + 6.3;
        leadingFade.set(
          -origin * previewPhaseScale,
          headFeather * previewPhaseScale,
        );
        stampBoostPulse(time, leadingFade.x + 0.55 * previewPhaseScale);
        let previous = -1;
        for (let row = 0; row <= 12; row++) {
          const fraction = row / 12;
          const z = origin - length * fraction;
          const base = appendRow(
            z,
            0,
            width,
            strength * decayAt(fraction),
            -z * previewPhaseScale,
            fraction,
            true,
          );
          if (previous >= 0) connect(previous, base, z, 0, width, true);
          previous = base;
        }
      }
      fadeBoostPulses(time);
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
