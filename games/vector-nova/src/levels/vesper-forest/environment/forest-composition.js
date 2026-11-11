/** A tapered ancient torso closes above the road into three substantial forks. */
export const VESPER_BODY_PROFILE = [
  { v: 0, outer: 1.2, inner: 0.67 },
  { v: 0.2, outer: 1.08, inner: 0.76 },
  { v: 0.45, outer: 0.94, inner: 0.74 },
  { v: 0.72, outer: 0.85, inner: 0.71 },
  { v: 0.86, outer: 0.78, inner: 0.35 },
  { v: 0.96, outer: 0.71, inner: 0.1 },
  { v: 1, outer: 0.68, inner: 0.09 },
];
export const VESPER_CROWN_BEARINGS = [
  { angle: 0.35, v: 0.9, scale: 1, pitch: 0.1, splay: -0.12 },
  { angle: 2.6, v: 0.91, scale: 0.89, pitch: 0.24, splay: 0.13 },
  { angle: 4.55, v: 0.89, scale: 1.08, pitch: 0.35, splay: -0.08 },
];
export const VESPER_FORK_TRANSITION = {
  rise: 110,
  crotchDrop: 18,
  start: 0.72,
  halfWidth: 1.1,
};
