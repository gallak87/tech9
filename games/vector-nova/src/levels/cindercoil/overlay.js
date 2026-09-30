import { sampleCindercoilEvent, sampleSurge, surgeAt } from './mechanics.js';

export function createCindercoilOverlay({ host, track, readRuntime }) {
  const notice = document.createElement('div');
  notice.className = 'cindercoil-notice';
  notice.setAttribute('role', 'status');
  Object.assign(notice.style, {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '9',
    padding: '7px 12px',
    border: '1px solid #ad835c',
    borderRadius: '3px',
    background: 'rgba(15,23,31,.9)',
    color: '#ffe0a3',
    font: '600 11px/1.4 monospace',
    letterSpacing: '.06em',
    textAlign: 'center',
    pointerEvents: 'none',
    maxWidth: 'calc(100% - 32px)',
  });
  host.append(notice);
  let presentation = {};
  return {
    update({ state, time, mode, reviewing }) {
      const width = host.clientWidth || globalThis.innerWidth;
      const height = host.clientHeight || globalThis.innerHeight;
      const compact = height < 560;
      notice.style.top =
        width < 600 && !compact ? '286px' : compact ? '50px' : '108px';
      notice.style.padding = compact ? '4px 8px' : '7px 12px';
      notice.style.fontSize = compact ? '10px' : '11px';
      notice.style.lineHeight = compact ? '1.1' : '1.4';
      const distance =
        ((state.distance % track.length) + track.length) % track.length;
      const local = surgeAt(track, state);
      const upcoming = (track.surgeZones ?? []).find(
        (zone) => zone.start > distance && zone.start - distance < 110,
      );
      const zone = local?.zone ?? upcoming;
      const cue = zone ? sampleSurge(time, zone) : null;
      const event = sampleCindercoilEvent(time);
      const jump = track.jumps[0];
      const flight = readRuntime?.()?.flight;
      const reviewOpen =
        host.querySelector('#review-toggle')?.getAttribute('aria-expanded') ===
        'true';
      let text = '';
      if (flight?.mode === 'flight')
        text = 'AIRBORNE · HOLD LINE FOR THE RECEIVING SHELF';
      else if (flight?.mode === 'recovery')
        text = `MISSED LANDING · RECOVERY ${flight.flight.remaining.toFixed(1)}s`;
      else if (local?.contact) text = 'LAVA CONTACT · SPEED + RESERVE LOSS';
      else if (zone) {
        const safe = zone.side > 0 ? 'RIGHT' : 'LEFT';
        text = cue.warning
          ? `SURGE IN ${cue.nextChange.toFixed(1)}s · ${safe} LANE SAFE`
          : cue.active
            ? `LAVA SURGE · KEEP ${safe}`
            : `SURGE ZONE · PALE ${safe} LANE SAFE`;
      } else if (distance > jump.takeoff - 200 && distance <= jump.takeoff) {
        text =
          event.vent > 0.05
            ? 'VENT ERUPTING · EXTRA LIFT · HOLD LINE'
            : event.ventWarning
              ? 'VENT BUILDING · ALIGN FOR TAKEOFF'
              : `VENT GAP ${Math.ceil(jump.takeoff - distance)}m · ALIGN + BUILD SPEED`;
      }
      notice.textContent = text;
      notice.style.display =
        text && !reviewing && !reviewOpen && ['racing', 'paused'].includes(mode)
          ? 'block'
          : 'none';
      presentation = {
        text,
        visible: notice.style.display !== 'none',
        event,
        surge: cue,
        contact: local?.contact ?? false,
      };
    },
    getPresentation: () => ({ cindercoil: presentation }),
    dispose: () => notice.remove(),
  };
}
