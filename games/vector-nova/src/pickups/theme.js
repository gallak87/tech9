// One identity for road hardware, ship effects and the floating race readout.
export const DEVICE_COLORS = Object.freeze({
  vector: 0xffbf54,
  aegis: 0x55f2b4,
  repulsor: 0xff658e,
  arc: 0x58b7ff,
  ion: 0xb999ff,
});
export const deviceCSSColor = (kind) =>
  '#' + DEVICE_COLORS[kind].toString(16).padStart(6, '0');
