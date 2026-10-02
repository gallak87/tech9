import { sampleCindercoilEvent, sampleSurge, surgeAt } from './mechanics.js';
import { sampleCindercoilAtmosphere } from './atmosphere.js';

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
    width: 'max-content',
    maxWidth: 'calc(100% - 32px)',
    boxSizing: 'border-box',
  });
  host.append(notice);
  host.classList.add('cindercoil-overlay-host');
  const style = document.createElement('style');
  style.textContent = `.cindercoil-overlay-host #interface.whole-route-view #title-panel{overflow-y:auto}@media(min-width:1100px){.cindercoil-overlay-host #interface.driving #shape-controls:has(#review-toggle[aria-expanded="false"]){width:180px;padding:8px;background:rgba(14,29,39,.55)}}`;
  host.append(style);
  const peripheral = document.createElement('canvas');
  peripheral.className = 'cindercoil-exposure';
  peripheral.setAttribute('aria-hidden', 'true');
  Object.assign(peripheral.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: '2',
  });
  host.append(peripheral);
  const ink = peripheral.getContext('2d');
  let presentation = {};
  return {
    update({ state, time, mode, reviewing, settings = {} }) {
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
        text =
          event.vent > 0.05
            ? 'AIRBORNE · VENT ACTIVE · HOLD THE RECEIVING LINE'
            : 'AIRBORNE · HOLD LINE FOR THE RECEIVING SHELF';
      else if (flight?.mode === 'recovery')
        text = `MISSED LANDING · RECOVERY ${flight.flight.remaining.toFixed(1)}s`;
      else if (local?.contact) text = 'LAVA CONTACT · SPEED + RESERVE LOSS';
      else if (zone?.kind === 'spill')
        text = 'DIAGONAL LAVA FLOW · CROSS BRIEFLY';
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
      const atmosphere = sampleCindercoilAtmosphere(track, state);
      const show =
        !reviewing && !reviewOpen && ['racing', 'paused'].includes(mode);
      if (peripheral.width !== width || peripheral.height !== height) {
        peripheral.width = width;
        peripheral.height = height;
      }
      ink.clearRect(0, 0, width, height);
      if (show && !settings.reducedMotion) {
        for (let i = 0; i < (settings.quality === 'low' ? 10 : 24); i++) {
          const phase = (i * 0.61803398875 + time * 0.018) % 1;
          const x =
            (i % 2
              ? 0.91 + 0.08 * Math.sin(i * 7)
              : 0.09 + 0.08 * Math.sin(i * 7)) * width;
          const y = phase * height;
          ink.strokeStyle = `rgba(183,194,206,${atmosphere.ash * 0.13})`;
          ink.beginPath();
          ink.moveTo(x, y);
          ink.lineTo(x + 2 + atmosphere.hot * Math.sin(time + i) * 3, y + 3);
          ink.stroke();
        }
      }
      if (show && atmosphere.contact) {
        const heat = ink.createLinearGradient(0, 0, width, 0);
        heat.addColorStop(0, 'rgba(236,109,44,.07)');
        heat.addColorStop(0.15, 'transparent');
        heat.addColorStop(0.85, 'transparent');
        heat.addColorStop(1, 'rgba(236,109,44,.07)');
        ink.fillStyle = heat;
        ink.fillRect(0, 0, width, height);
      }
      notice.textContent = text;
      notice.style.display =
        text &&
        !host.querySelector('#notice')?.textContent.trim() &&
        !reviewing &&
        !reviewOpen &&
        ['racing', 'paused'].includes(mode)
          ? 'block'
          : 'none';
      presentation = {
        text,
        visible: notice.style.display !== 'none',
        event,
        surge: cue,
        contact: local?.contact ?? false,
        atmosphere,
      };
    },
    getPresentation: () => ({ cindercoil: presentation }),
    dispose() {
      style.remove();
      host.classList.remove('cindercoil-overlay-host');
      notice.remove();
      peripheral.remove();
    },
  };
}
