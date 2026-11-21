export function pointSelectionModifiers(event) {
  return {
    extendRange: Boolean(event.shiftKey),
    shiftKey: Boolean(event.shiftKey),
    metaKey: Boolean(event.metaKey),
    ctrlKey: Boolean(event.ctrlKey),
  };
}

export function dragPointRoll(roll, pixels, fine = false) {
  const delta = (pixels * (fine ? 0.25 : 1.25) * Math.PI) / 180;
  return Math.max(-Math.PI * 8, Math.min(Math.PI * 8, roll + delta));
}

export function signedPointRoll(roll = 0) {
  const degrees = Math.round((roll * 180) / Math.PI);
  return `${degrees < 0 ? '−' : '+'}${Math.abs(degrees)}°`;
}
