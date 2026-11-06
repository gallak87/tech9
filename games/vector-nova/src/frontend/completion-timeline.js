// Story coordinates are metres along/across the production circuit. The course
// mapper supplies the real road frame; this sampler only directs the racers.
export const COMPLETION_DURATION = 24;
export const COMPLETION_FINISH = 1245;
export const COMPLETION_JUMP_START = 7.8;
export const COMPLETION_JUMP_END = 11.1;
export const COMPLETION_JUMP_HEIGHT = 10;
export const COMPLETION_SLIDE_START = 16.6;
export const COMPLETION_SLIDE_END = 21;
export const COMPLETION_STOP_DISTANCE = 110;
export const COMPLETION_LANES = Object.freeze({
  hero: 2.2,
  rook: -2.8,
  manta: -8.5,
  parked: 7.3,
});
export const COMPLETION_SHOTS = Object.freeze([
  { id: 'pursuit', start: 0, end: 3.6 },
  { id: 'lance', start: 3.6, end: 7.5 },
  { id: 'overtake', start: 7.5, end: 11.7 },
  { id: 'finish', start: 11.7, end: 16.75 },
  { id: 'hero', start: 16.75, end: COMPLETION_DURATION },
]);
export const COMPLETION_FIRES = Object.freeze([4.05, 4.53, 5.2, 6.25]);
export const COMPLETION_CUES = Object.freeze(
  [
    ...COMPLETION_FIRES.flatMap((time) => [
      { time, id: 'lance-fire', gain: 0.65 },
      { time: time + 0.16, id: 'lance-hit', gain: 0.48 },
    ]),
    { time: COMPLETION_JUMP_START, id: 'jump-activate', gain: 0.8 },
    { time: COMPLETION_JUMP_END, id: 'jump-land', gain: 0.75 },
    { time: COMPLETION_SLIDE_START, id: 'race-winner', gain: 0.7 },
    { time: 22.3, id: 'cup-champion', gain: 0.65 },
  ].sort((a, b) => a.time - b.time),
);

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const ramp = (time, start, end) => clamp((time - start) / (end - start));
const smooth = (value) => value * value * (3 - 2 * value);
const smoother = (value) => value ** 3 * (10 - 15 * value + 6 * value * value);
const mix = (a, b, amount) => a + (b - a) * amount;
const impactAt = (time, fires) =>
  fires.reduce((sum, fire) => {
    const age = time - fire - 0.16;
    return (
      sum +
      (age > 0 && age < 0.65
        ? Math.sin(age * 23) *
          Math.exp(-age * 6) *
          (1 - smooth(ramp(age, 0.45, 0.65)))
        : 0)
    );
  }, 0);

export function sampleCompletionTimeline(value) {
  const time = clamp(
    Number.isFinite(value) ? value : 0,
    0,
    COMPLETION_DURATION,
  );
  const jumping = time > COMPLETION_JUMP_START && time < COMPLETION_JUMP_END;
  const jump = ramp(time, COMPLETION_JUMP_START, COMPLETION_JUMP_END);
  const flightDuration = COMPLETION_JUMP_END - COMPLETION_JUMP_START;
  const jumpHeight = 4 * COMPLETION_JUMP_HEIGHT * jump * (1 - jump);
  const verticalSpeed = jumping
    ? (4 * COMPLETION_JUMP_HEIGHT * (1 - 2 * jump)) / flightDuration
    : 0;
  const jumpSway = Math.sin(jump * Math.PI) ** 2;
  const swaySpeed = jumping
    ? (-5 * Math.PI * Math.sin(jump * Math.PI * 2)) / flightDuration
    : 0;
  const jumpPitchEnvelope =
    smooth(ramp(time, COMPLETION_JUMP_START, COMPLETION_JUMP_START + 0.18)) *
    (1 - smooth(ramp(time, COMPLETION_JUMP_END - 0.18, COMPLETION_JUMP_END)));
  const slide = ramp(time, COMPLETION_SLIDE_START, COMPLETION_SLIDE_END);
  const slideDuration = COMPLETION_SLIDE_END - COMPLETION_SLIDE_START;
  // The speed curve begins with zero braking acceleration, builds a strong
  // airbrake load, then releases into a motionless hold. Its exact integral is
  // 110m, avoiding the old speed discontinuity and endless sideways glide.
  const forwardSpeed =
    time < COMPLETION_SLIDE_START
      ? 75
      : 75 * (1 - slide) ** 4 * (1 + 4 * slide);
  const forwardIntegral =
    slide -
    (10 / 3) * slide ** 3 +
    5 * slide ** 4 -
    3 * slide ** 5 +
    (2 / 3) * slide ** 6;
  // Clear the racing lanes before the field catches the braking hero. The
  // remaining longitudinal coast stays inside that reserved right-hand strip.
  const bay = ramp(time, COMPLETION_SLIDE_START, 19.1);
  const lateralShift = smoother(bay);
  const lateralSpeed =
    ((COMPLETION_LANES.parked - COMPLETION_LANES.hero) *
      30 *
      bay ** 2 *
      (1 - bay) ** 2) /
    (19.1 - COMPLETION_SLIDE_START);
  const slideYaw =
    1.15 * smoother(ramp(time, 16.7, 18.05)) -
    0.38 * smoother(ramp(time, 18.15, 19.55)) +
    0.07 * smoother(ramp(time, 19.55, 20.2)) -
    0.025 * smoother(ramp(time, 20.2, 21));
  const settling =
    time >= COMPLETION_JUMP_END && time < COMPLETION_JUMP_END + 0.55
      ? Math.sin(((time - COMPLETION_JUMP_END) / 0.55) * Math.PI) * -0.035
      : 0;
  const hero = {
    x:
      COMPLETION_LANES.hero -
      jumpSway * 5 +
      (COMPLETION_LANES.parked - COMPLETION_LANES.hero) * lateralShift,
    y: 0.65 + jumpHeight + settling,
    z:
      time < COMPLETION_SLIDE_START
        ? time * 75
        : COMPLETION_FINISH + 75 * slideDuration * forwardIntegral,
    pitch:
      -Math.atan2(verticalSpeed, 75) * jumpPitchEnvelope +
      Math.sin(slide * Math.PI) * 0.025,
    yaw: Math.atan2(swaySpeed, 75) + slideYaw,
    roll: jumping
      ? Math.sin(jump * Math.PI * 2) * -0.12
      : Math.sin(slide * Math.PI) * -0.11,
    speed: Math.hypot(forwardSpeed, swaySpeed + lateralSpeed),
    boost: time >= 7.6 && time < COMPLETION_JUMP_END + 0.25,
  };
  const rookImpact = impactAt(time, COMPLETION_FIRES.slice(3));
  const rookSlow = jump;
  const rook = {
    x: COMPLETION_LANES.rook,
    y: 0.65,
    z: time * 75 + mix(26, -36, smoother(rookSlow)),
    pitch: 0,
    yaw: rookImpact * 0.025,
    roll: rookImpact * 0.05,
    speed:
      75 - (62 * 30 * rookSlow ** 2 * (1 - rookSlow) ** 2) / flightDuration,
    boost: false,
  };
  const mantaImpact = impactAt(time, COMPLETION_FIRES.slice(0, 3));
  const mantaSlow = ramp(time, 5.2, 11);
  const manta = {
    x: COMPLETION_LANES.manta + mantaImpact * 0.18,
    y: 0.65,
    z: time * 75 + mix(38, -82, smoother(mantaSlow)),
    pitch: 0,
    yaw: mantaImpact * 0.03,
    roll: mantaImpact * 0.06,
    speed: 75 - (120 * 30 * mantaSlow ** 2 * (1 - mantaSlow) ** 2) / 5.8,
    boost: false,
  };
  const shot =
    COMPLETION_SHOTS.find(({ end }) => time < end) ?? COMPLETION_SHOTS.at(-1);
  const u = ramp(time, shot.start, shot.end);
  let offset, target, fov;
  if (shot.id === 'pursuit') {
    offset = [mix(-12, -9, smooth(u)), 4.8, -14];
    target = [-2.5, 0.8, 9];
    fov = 52;
  } else if (shot.id === 'lance') {
    offset = [10.5, 3.6, -10.5];
    target = [-4, 1.1, 9];
    fov = 60;
  } else if (shot.id === 'overtake') {
    offset = [mix(-16, -14, smooth(u)), 3.8, mix(-6, 7, smooth(u))];
    target = [0, -hero.y * 0.35 + 0.9, 1];
    fov = 57;
  } else if (shot.id === 'finish') {
    offset = [10.5, 3.8, -10.5];
    target = [-0.5, 0.9, 6];
    fov = 51;
  } else {
    offset = [
      mix(10, 8.5, smooth(u)),
      mix(2.9, 3.4, smooth(u)),
      mix(16, 11.5, smooth(u)),
    ];
    target = [0, 0.65, 0];
    fov = mix(43, 36, smooth(u));
  }
  return {
    time,
    shot: shot.id,
    hero,
    rook,
    manta,
    camera: {
      position: offset.map(
        (component, index) => component + [hero.x, hero.y, hero.z][index],
      ),
      target: target.map(
        (component, index) => component + [hero.x, hero.y, hero.z][index],
      ),
      fov,
    },
    slide,
    slideSteer: Math.sin(slide * Math.PI) * -0.65,
    title: smoother(ramp(time, 21.5, 22.5)),
    finished: time >= COMPLETION_DURATION,
  };
}
