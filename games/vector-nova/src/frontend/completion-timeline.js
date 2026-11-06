// Directed in metres and seconds. Sampling is independent of RAF cadence so
// pausing, low frame rates and reduced motion cannot reorder the story beats.
export const COMPLETION_DURATION = 22.4;
export const COMPLETION_FINISH = 1245;
export const COMPLETION_SHOTS = Object.freeze([
  { id: 'pursuit', start: 0, end: 3.6 },
  { id: 'lance', start: 3.6, end: 7.5 },
  { id: 'overtake', start: 7.5, end: 13.2 },
  { id: 'finish', start: 13.2, end: 16.9 },
  { id: 'hero', start: 16.9, end: COMPLETION_DURATION },
]);
export const COMPLETION_FIRES = Object.freeze([4.05, 4.53, 5.2, 6.25]);
export const COMPLETION_CUES = Object.freeze(
  [
    ...COMPLETION_FIRES.flatMap((time) => [
      { time, id: 'lance-fire', gain: 0.65 },
      { time: time + 0.16, id: 'lance-hit', gain: 0.48 },
    ]),
    { time: 7.8, id: 'jump-activate', gain: 0.8 },
    { time: 12.8, id: 'jump-land', gain: 0.7 },
    { time: 16.6, id: 'race-winner', gain: 0.7 },
    { time: 20.2, id: 'cup-champion', gain: 0.65 },
  ].sort((a, b) => a.time - b.time),
);

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const ramp = (time, start, end) => clamp((time - start) / (end - start));
const smooth = (value) => value * value * (3 - 2 * value);
const mix = (a, b, amount) => a + (b - a) * amount;
const arc = (time, start, end, height) => {
  const u = ramp(time, start, end);
  return {
    height: Math.sin(u * Math.PI) * height,
    pitch:
      time > start && time < end
        ? -Math.atan(
            (Math.cos(u * Math.PI) * height * Math.PI) / ((end - start) * 75),
          )
        : 0,
  };
};

export function sampleCompletionTimeline(value) {
  const time = clamp(
    Number.isFinite(value) ? value : 0,
    0,
    COMPLETION_DURATION,
  );
  const jump = arc(time, 7.8, 12.8, 16);
  const slide = ramp(time, 16.6, 20.8);
  const coast = slide * (2 - slide);
  const takeoff = ramp(time, 7.8, 12.8);
  const hero = {
    x: -1.6 + Math.sin(takeoff * Math.PI) * 1.5 + coast * 9,
    y: 0.65 + jump.height,
    z: time < 16.6 ? time * 75 : COMPLETION_FINISH + coast * 140,
    pitch: jump.pitch,
    yaw: -0.78 * smooth(slide),
    roll:
      Math.sin(takeoff * Math.PI * 2) * 0.08 - Math.sin(slide * Math.PI) * 0.1,
    speed: time < 16.6 ? 75 : (140 * 2 * (1 - slide)) / 4.2,
    boost: time >= 7.6 && time < 13.5,
  };
  const rookJump = arc(time, 8, 11.8, 6);
  const mantaJump = arc(time, 8.3, 12.4, 5.5);
  const rook = {
    x: 2.4,
    y: 0.6 + rookJump.height,
    z: time * 75 + mix(26, -36, smooth(ramp(time, 8.2, 11.2))),
    pitch: rookJump.pitch,
    yaw: 0,
    roll: Math.sin(ramp(time, 8, 11.8) * Math.PI) * -0.07,
    speed: 75,
    boost: false,
  };
  const impact = COMPLETION_FIRES.slice(0, 3).reduce((sum, fire) => {
    const age = time - fire - 0.16;
    return (
      sum + (age > 0 && age < 0.7 ? Math.sin(age * 23) * Math.exp(-age * 5) : 0)
    );
  }, 0);
  const manta = {
    x: -5.8 + impact * 0.4,
    y: 0.7 + mantaJump.height,
    z: time * 75 + mix(38, -82, smooth(ramp(time, 5.2, 11))),
    pitch: mantaJump.pitch,
    yaw: impact * 0.06,
    roll: impact * 0.16,
    speed: 68,
    boost: false,
  };
  const shot =
    COMPLETION_SHOTS.find(({ end }) => time < end) ?? COMPLETION_SHOTS.at(-1);
  const u = ramp(time, shot.start, shot.end);
  let offset, target, fov;
  if (shot.id === 'pursuit') {
    offset = [mix(-12, -9, smooth(u)), 4.8, -14];
    target = [0, 0.8, 9];
    fov = 52;
  } else if (shot.id === 'lance') {
    offset = [10.5, 3.6, -10.5];
    target = [-1, 1.1, 9];
    fov = 60;
  } else if (shot.id === 'overtake') {
    offset = [mix(-18, -15, smooth(u)), 3.8, mix(-8, 9, smooth(u))];
    target = [1.5, -hero.y * 0.38 + 1.1, 1];
    fov = 58;
  } else if (shot.id === 'finish') {
    offset = [12.5, 5.2, -11.5];
    target = [-0.5, 0.9, 6];
    fov = 51;
  } else {
    offset = [
      mix(11, 7.5, smooth(u)),
      mix(3.3, 4.8, smooth(u)),
      mix(15, 12, smooth(u)),
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
    title: smooth(ramp(time, 19.5, 20.5)),
    finished: time >= COMPLETION_DURATION,
  };
}
