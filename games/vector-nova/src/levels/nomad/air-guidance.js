import * as T from 'three';
import { beamTransform } from '../../track/geometry.js';
import { vehicleHandling } from '../../ships/catalog.js';
import { forecastNomadPoweredArc, NOMAD_PILOT_RULES } from './pilot.js';

export const NOMAD_AIR_GUIDANCE_RULES = Object.freeze({
  approachDistance: 1200,
  airSpacing: 34,
  runwaySpacing: 52,
  referenceSpeed: 170,
  railLift: 3,
});

const UP = new T.Vector3(0, 1, 0);
const PALETTE = {
  rail: new T.Color('#35dfcb').multiplyScalar(1.55),
  white: new T.Color('#e8fff3').multiplyScalar(1.7),
  threshold: new T.Color('#79ffab').multiplyScalar(1.65),
};

function movingFrame(track, distance, time) {
  return track.frameAtTime?.(distance, time) ?? track.sample(distance);
}

/** Pick a point on this jump's own supported receiver, close to the authored
 * launch ray. It is a navigation corridor, never an interception force or a
 * prediction of the player's current (possibly incorrect) flight direction.
 */
function landingStation(track, jump) {
  const from = movingFrame(track, jump.takeoff, 0);
  const forward = from.tangent.clone().setY(0).normalize();
  const low =
    jump.landingStart +
    Math.min(75, (jump.landingEnd - jump.landingStart) * 0.2);
  const high = Math.max(low, jump.landingEnd - 65);
  const preferred = T.MathUtils.clamp(jump.landingStart + 350, low, high);
  let best = preferred,
    score = Infinity;
  for (let station = low; station <= high + 1e-6; station += 30) {
    const frame = movingFrame(track, station, 0);
    const delta = frame.position.clone().sub(from.position);
    const along = delta.x * forward.x + delta.z * forward.z;
    if (along <= 0 || Math.abs(frame.bank ?? 0) > 0.24) continue;
    const lateral = Math.abs(delta.x * forward.z - delta.z * forward.x);
    const candidate = lateral + Math.abs(station - preferred) * 0.025;
    if (candidate < score) {
      score = candidate;
      best = station;
    }
  }
  return best;
}

/** The suspended lights follow the ordinary powered-flight forecast between the
 * real lip and current moving receiver. The gap remains empty: no deck, collider
 * or ship state is constructed here. Explicit receiver ownership prevents the
 * nearby parallel carrier from becoming a visually plausible wrong target.
 */
export function sampleNomadAirCorridor(
  track,
  jump,
  time = 0,
  station = landingStation(track, jump),
) {
  const receiver = track.carriers.find(
    (carrier) => carrier.id === jump.receivingCarrierId,
  );
  const departure = track.carriers.find(
    (carrier) => carrier.id === jump.departureCarrierId,
  );
  if (!receiver || !departure || track.carrierAt(station)?.id !== receiver.id)
    throw new Error(`Nomad air corridor has no supported receiver: ${jump.id}`);
  const from = movingFrame(track, jump.takeoff, time);
  const to = movingFrame(track, station, time);
  const delta = to.position.clone().sub(from.position);
  const speed = NOMAD_AIR_GUIDANCE_RULES.referenceSpeed;
  const vertical = speed * from.tangent.y;
  const arc = forecastNomadPoweredArc(
    Math.sqrt(Math.max(1, speed * speed - vertical * vertical)),
    vertical + (track.motionAt?.(jump.takeoff, time).velocity.y ?? 0),
    100,
    vehicleHandling({ shipId: 'kestrel' }),
    Infinity,
    false,
  );
  const duration = arc.timeAtHeight(delta.y) ?? NOMAD_PILOT_RULES.forecastTime;
  const end = arc.at(duration);
  const right = new T.Vector3(delta.z, 0, -delta.x).normalize();
  const startWidth = Math.max(31, track.halfWidthAt(jump.takeoff) + 6);
  const endWidth = Math.max(
    startWidth,
    Math.min(70, track.halfWidthAt(station) + 8),
  );
  const positionAt = (u) => {
    const point = arc.at(duration * u);
    const position = from.position
      .clone()
      .lerp(to.position, point.range / end.range);
    // Forecast height uses real thrust/gravity; only the sub-step root residual
    // is removed so its final light stays seated on today's receiver threshold.
    position.y =
      from.position.y +
      point.height +
      (delta.y - end.height) * u +
      NOMAD_AIR_GUIDANCE_RULES.railLift;
    return position;
  };
  const at = (u) => {
    u = T.MathUtils.clamp(u, 0, 1);
    const position = positionAt(u);
    const tangent = positionAt(Math.min(1, u + 0.001))
      .sub(positionAt(Math.max(0, u - 0.001)))
      .normalize();
    return {
      position,
      tangent,
      right: right.clone(),
      halfWidth: T.MathUtils.lerp(startWidth, endWidth, u),
    };
  };
  return {
    jumpId: jump.id,
    receiverId: receiver.id,
    station,
    duration,
    from,
    to,
    at,
  };
}

/** Steady, depth-tested approach lights. Two small instanced batches provide
 * housings and light bars; no point lights, transparency, shadows or textures.
 * Reduced motion retains the same legible static navigation.
 */
export function createNomadAirGuidance({
  track,
  shape = false,
  jumpIds = null,
}) {
  const jumps = track.jumps.filter(
    (jump) => jump.bigAir && (!jumpIds || jumpIds.includes(jump.id)),
  );
  const records = jumps.map((jump) => ({
    jump,
    station: landingStation(track, jump),
  }));
  const group = new T.Group();
  group.name = 'Nomad / suspended jump approach lights';
  group.userData.aoExclude = true;
  const capacity = Math.max(1, records.length * 420);
  const geometry = new T.BoxGeometry(1, 1, 1);
  const housingMaterial = new T.MeshStandardMaterial({
    name: 'Nomad / approach emitter housings',
    color: '#132b32',
    roughness: 0.6,
    metalness: 0.35,
  });
  const lightMaterial = new T.MeshBasicMaterial({
    name: 'Nomad / turquoise and white approach light',
    color: '#ffffff',
    fog: true,
  });
  const housings = new T.InstancedMesh(geometry, housingMaterial, capacity);
  const lights = new T.InstancedMesh(geometry, lightMaterial, capacity);
  housings.name = 'Nomad / suspended approach emitters';
  lights.name = 'Nomad / approach rails and receiver threshold';
  for (const mesh of [housings, lights]) {
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    mesh.castShadow = mesh.receiveShadow = false;
    mesh.userData.aoExclude = true;
    group.add(mesh);
  }
  let disposed = false,
    previousKey = null;
  const matrix = new T.Matrix4();
  const white = shape ? new T.Color('#eeeeea') : PALETTE.white;
  const rail = shape ? white : PALETTE.rail;
  const mint = shape ? white : PALETTE.threshold;
  const report = { jumps: [], housings: 0, lights: 0, draws: 2, capacity };
  group.userData.nomadAirGuidance = report;

  function put(mesh, position, quaternion, scale, color) {
    const index = mesh.count++;
    if (index >= capacity)
      throw new Error(
        'Nomad air guidance exceeded its bounded instance budget.',
      );
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
    if (color) mesh.setColorAt(index, color);
  }
  function beam(mesh, a, b, width, depth, color) {
    const transform = beamTransform(a, b, width, depth);
    put(mesh, transform.position, transform.quaternion, transform.scale, color);
  }
  function pod(point, tangent, color) {
    const quaternion = new T.Quaternion().setFromUnitVectors(
      new T.Vector3(0, 0, 1),
      tangent,
    );
    put(housings, point, quaternion, new T.Vector3(2.4, 0.65, 4.1));
    put(
      lights,
      point.clone().addScaledVector(UP, 0.5),
      quaternion,
      new T.Vector3(2.2, 0.32, 3.8),
      color,
    );
  }
  function update(frame = {}) {
    if (disposed) return;
    const time = track.presentationTime ?? frame.time ?? 0;
    const distance = frame.state?.distance;
    const inspect =
      ['fly', 'overview'].includes(frame.mode) ||
      frame.reviewing ||
      !Number.isFinite(distance);
    const nextJump = inspect
      ? null
      : track.jumps.find((jump) => distance < jump.landingStart);
    const active = records
      .map((record) => {
        const { jump } = record;
        const aerial =
          inspect ||
          (jump.id === nextJump?.id &&
            distance >=
              jump.takeoff - NOMAD_AIR_GUIDANCE_RULES.approachDistance);
        const runway =
          aerial ||
          (distance >= jump.landingStart && distance <= jump.landingEnd + 120);
        return { ...record, aerial, runway };
      })
      .filter((record) => record.runway);
    const key = `${time}:${active.map(({ jump, aerial }) => `${jump.id}:${aerial}`).join(',')}`;
    if (key === previousKey) return;
    previousKey = key;
    housings.count = lights.count = 0;
    report.jumps = [];
    for (const { jump, station, aerial } of active) {
      const corridor = sampleNomadAirCorridor(track, jump, time, station);
      const length = corridor.from.position.distanceTo(corridor.to.position);
      const count = T.MathUtils.clamp(
        Math.ceil(length / NOMAD_AIR_GUIDANCE_RULES.airSpacing),
        12,
        52,
      );
      for (let i = 0; aerial && i < count; i++) {
        const u0 = i / count,
          u1 = (i + 0.58) / count;
        const a = corridor.at(u0),
          b = corridor.at(u1);
        for (const side of [-1, 1]) {
          const start = a.position
            .clone()
            .addScaledVector(a.right, side * a.halfWidth);
          const end = b.position
            .clone()
            .addScaledVector(b.right, side * b.halfWidth);
          beam(lights, start, end, 1.65, 1.25, i % 4 === 0 ? white : rail);
          pod(start, a.tangent, rail);
        }
      }
      // Open V cues sit below the flight centreline, not across its ship space.
      for (const u of aerial ? [0.12, 0.38, 0.65, 0.88] : []) {
        const point = corridor.at(u);
        point.position.y -= 10;
        const tip = point.position.clone().addScaledVector(point.tangent, 8);
        for (const side of [-1, 1])
          beam(
            lights,
            point.position.clone().addScaledVector(point.right, side * 9),
            tip,
            1.35,
            0.8,
            white,
          );
      }
      // Edge pairs frame the whole supported receiving run, with a conspicuous
      // mint touchdown threshold where the suspended corridor meets that run.
      const receiverTime = time;
      for (
        let s = jump.landingStart + 30;
        s <= jump.landingEnd - 10;
        s += NOMAD_AIR_GUIDANCE_RULES.runwaySpacing
      ) {
        const receiver = movingFrame(track, s, receiverTime);
        const width = Math.max(10, track.halfWidthAt(s) - 4);
        for (const side of [-1, 1]) {
          const point = receiver.position
            .clone()
            .addScaledVector(receiver.right, side * width)
            .addScaledVector(receiver.up, 1.4);
          pod(point, receiver.tangent, s < station ? rail : white);
        }
      }
      const threshold = corridor.to;
      const width = Math.max(8, track.halfWidthAt(station) - 4);
      for (let i = -6; i <= 6; i++)
        put(
          lights,
          threshold.position
            .clone()
            .addScaledVector(threshold.right, (i / 6) * width)
            .addScaledVector(threshold.up, 0.15),
          threshold.quaternion,
          new T.Vector3(width / 10, 0.18, 4.2),
          mint,
        );
      for (const side of [-1, 1]) {
        const base = threshold.position
          .clone()
          .addScaledVector(threshold.right, side * (width + 9));
        beam(
          lights,
          base.clone().addScaledVector(threshold.up, 2),
          base.clone().addScaledVector(threshold.up, 14),
          2.7,
          2.7,
          mint,
        );
        pod(
          base.clone().addScaledVector(threshold.up, 15),
          threshold.tangent,
          mint,
        );
      }
      report.jumps.push({
        id: jump.id,
        receiverId: corridor.receiverId,
        station,
        duration: corridor.duration,
        aerial,
      });
    }
    report.housings = housings.count;
    report.lights = lights.count;
    group.visible = lights.count > 0;
    for (const mesh of [housings, lights]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }
  update();
  return {
    group,
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      housings.dispose();
      lights.dispose();
      geometry.dispose();
      housingMaterial.dispose();
      lightMaterial.dispose();
    },
  };
}
