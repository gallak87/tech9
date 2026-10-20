// Round once in milliseconds so a minute boundary never displays 0:60.000.
export function formatTime(seconds, minuteDigits = 1) {
  if (!Number.isFinite(seconds)) return '—';
  const ms = Math.max(0, Math.round(seconds * 1000));
  return `${String(Math.floor(ms / 60000)).padStart(minuteDigits, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}
export function formatDelta(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const ms = Math.round(Math.abs(seconds) * 1000);
  return `${ms === 0 ? '' : seconds < 0 ? '−' : '+'}${(ms / 1000).toFixed(3)} s`;
}
