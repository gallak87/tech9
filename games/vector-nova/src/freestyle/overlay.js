import { TRICKS } from './controller.js';
import { controllerLayout } from '../input/gamepad.js';
import './style.css';

export function createFreestyleOverlay({ host }) {
  const root = document.createElement('section');
  root.className = 'freestyle-hud';
  root.setAttribute('aria-label', 'Freestyle score and landing instruments');
  root.innerHTML =
    '<div class="fs-score"><span>FREESTYLE / STOCK BUILD</span><strong>0</strong><small>CHAIN <b>—</b></small></div><div class="fs-links" aria-label="Five transfers">' +
    Array.from({ length: 5 }, (_, i) => `<i>${i + 1}</i>`).join('') +
    '</div><div class="fs-flight"><span class="fs-phase">BUILD LAUNCH SPEED</span><strong class="fs-trick">Five transfers. One chain.</strong><div class="fs-rotation"><i></i></div><p class="fs-catch">Aim for the mint receiving lane.</p><small class="fs-last"></small></div><div class="fs-controls"><span><b>CTRL + ↑↓ / WASD</b> FLIP / SPIN</span><span><b>SHIFT + ←→ / AD</b> ROLL</span><span><b>SPACE</b> CATCH / ROTATION BRAKE</span></div>';
  host.append(root);
  const score = root.querySelector('.fs-score>strong'),
    chain = root.querySelector('.fs-score small b'),
    phase = root.querySelector('.fs-phase'),
    trick = root.querySelector('.fs-trick'),
    rotation = root.querySelector('.fs-rotation i'),
    catchText = root.querySelector('.fs-catch'),
    last = root.querySelector('.fs-last');
  const controls = [...root.querySelectorAll('.fs-controls span b')];
  return {
    update(frame) {
      root.hidden = !['racing', 'countdown'].includes(frame.mode);
      const data = frame.motion?.motion?.freestyle ?? frame.motion?.freestyle;
      if (!data) return;
      const names = frame.gamepad
        ? [
            'X + LEFT STICK',
            'Y + ← / →',
            controllerLayout(frame.settings).airbrake,
          ]
        : ['CTRL + DIRECTION', 'SHIFT + ←→ / AD', 'SPACE'];
      controls.forEach((node, i) => {
        node.textContent = names[i];
      });
      score.textContent = data.score.toLocaleString();
      chain.textContent = data.chain ? `×${data.chain}` : '—';
      root.querySelectorAll('.fs-links i').forEach((node, i) => {
        const leg = data.legs[i];
        node.dataset.state = leg
          ? leg.clean
            ? 'clean'
            : 'broken'
          : i === data.legs.length
            ? 'current'
            : 'waiting';
      });
      const airborne = !!data.flight,
        omega = Math.hypot(...data.angular);
      const seconds = data.touchdown;
      const armed = data.clock - data.braceAt <= 0.65;
      phase.textContent = airborne
        ? `TRANSFER ${data.legs.length + 1} / 5 · ${data.flight.failed ? 'RECOVERY' : seconds == null ? 'AIRBORNE' : `TOUCHDOWN ~${seconds.toFixed(1)}s`}`
        : data.legs.length === 5
          ? 'FINAL RUNOUT'
          : 'BUILD LAUNCH SPEED';
      trick.textContent = airborne
        ? data.flight.failed
          ? 'Unbanked tricks lost.'
          : (data.active ??
            (data.flight.tricks.length
              ? data.flight.tricks.map((k) => TRICKS[k].name).join(' + ')
              : 'Choose your rotation.'))
        : 'Protect the next link.';
      rotation.style.transform = `scaleX(${Math.min(1, omega / 3.2)})`;
      root.dataset.armed = String(armed && airborne);
      root.dataset.late = String(
        airborne && seconds != null && seconds < 0.8 && omega > 0.65,
      );
      catchText.textContent = airborne
        ? data.flight.failed
          ? 'Chain broken. Rejoining the next launch.'
          : armed
            ? 'CATCH WINDOW OPEN'
            : omega > 0.65
              ? 'Release or countersteer. Leave recovery time.'
              : seconds != null && seconds < 0.7
                ? `Tap ${names[2]} to catch.`
                : 'Settle the hull. Aim for the mint lane.'
        : 'Boost on approach. Carry speed into the next launch.';
      const leg = data.legs.at(-1);
      last.textContent = leg
        ? `${leg.reason} · ${leg.bank ? `+${leg.bank.toLocaleString()}` : 'chain broken'}`
        : '';
    },
    dispose() {
      root.remove();
    },
  };
}
