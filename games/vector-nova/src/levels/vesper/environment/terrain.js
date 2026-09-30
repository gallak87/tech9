/** Same world-space surface used by the existing floor and the tree pilot. */
export function vesperGroundHeight(x, z, ground = -100) {
  const localX = x - 300;
  return (
    ground -
    8 +
    Math.sin(localX * 0.011) * Math.cos(z * 0.009) * 12 +
    Math.sin((localX + z) * 0.021) * 4
  );
}
