import { TRICKS } from './controller.js';
import { controllerLayout } from '../input/gamepad.js';
import { freestyleAttitudeCue, freestyleLaunchSpeed } from './feedback.js';

export function createFreestyleOverlay({ host, track, freestyleActions }) {
  const root = document.createElement('section');
  root.className = 'freestyle-hud';
  root.setAttribute('aria-label', 'Freestyle score and receiving approach');
  root.innerHTML =
    '<div class="fs-score"><span>FREESTYLE / PILOT</span><strong>0</strong><small>CHAIN <b>—</b></small></div><div class="fs-links" aria-label="Transfer chain">' +
    track.jumps.map((_, i) => `<i>${i + 1}</i>`).join('') +
    '</div><div class="fs-flight"><span class="fs-phase">BUILD YOUR APPROACH</span><h3 class="fs-transfer"></h3><p class="fs-approach"></p><p class="fs-receiver"></p><small class="fs-speed"></small><small class="fs-alignment"></small><strong class="fs-trick">Set your launch line.</strong><div class="fs-rotation" aria-label="Rotation speed"><i></i></div><p class="fs-catch">Match the receiving bank.</p><small class="fs-last"></small></div><div class="fs-controls"><span><b>Q / E</b>ROLL</span><span><b>Z / X</b>FLIP</span><span><b>C / V</b>FLAT SPIN</span><span class="fs-brake"><b>SPACE</b>BRAKE / FINE TRIM</span></div>';
  host.append(root);
  const score = root.querySelector('.fs-score>strong'),
    modeLabel = root.querySelector('.fs-score>span'),
    chain = root.querySelector('.fs-score small b'),
    phase = root.querySelector('.fs-phase'),
    transferName = root.querySelector('.fs-transfer'),
    approach = root.querySelector('.fs-approach'),
    receiver = root.querySelector('.fs-receiver'),
    speed = root.querySelector('.fs-speed'),
    alignment = root.querySelector('.fs-alignment'),
    trick = root.querySelector('.fs-trick'),
    rotation = root.querySelector('.fs-rotation i'),
    catchText = root.querySelector('.fs-catch'),
    last = root.querySelector('.fs-last');
  const controls = [...root.querySelectorAll('.fs-controls span')];
  const practice = document.createElement('section');
  practice.className = 'pause-quick-settings fs-practice';
  practice.setAttribute('aria-label', 'Freestyle transfer practice');
  const label = document.createElement('label');
  label.textContent = 'Transfer practice';
  const select = document.createElement('select');
  select.id = 'freestyle-practice-transfer';
  select.setAttribute('aria-label', 'Practice transfer');
  for (const jump of track.jumps) {
    const option = document.createElement('option');
    option.value = jump.id;
    option.textContent = jump.label;
    select.append(option);
  }
  label.append(select);
  const status = document.createElement('p');
  status.className = 'fs-practice-status';
  status.setAttribute('role', 'status');
  const buttons = document.createElement('div');
  buttons.className = 'fs-practice-actions';
  const repeat = document.createElement('button');
  repeat.type = 'button';
  repeat.id = 'freestyle-practice-start';
  repeat.textContent = 'Practice transfer';
  const full = document.createElement('button');
  full.type = 'button';
  full.id = 'freestyle-full-run';
  full.textContent = 'Start full chain';
  buttons.append(repeat, full);
  practice.append(label, status, buttons);
  const controller = new AbortController();
  repeat.addEventListener(
    'click',
    () => freestyleActions?.practiceTransfer(select.value),
    { signal: controller.signal },
  );
  full.addEventListener('click', () => freestyleActions?.startFullRun(), {
    signal: controller.signal,
  });
  let previousPractice = null;
  function updatePractice(frame) {
    const panel = host.querySelector('#pause-panel');
    if (!panel || !freestyleActions) return;
    if (practice.parentElement !== panel)
      panel.insertBefore(practice, panel.querySelector('.pause-restart'));
    const session = frame.freestylePractice;
    if (session?.id !== previousPractice) {
      previousPractice = session?.id ?? null;
      if (session) select.value = session.id;
    }
    const practiceJump = track.jumps.find((jump) => jump.id === session?.id);
    const launch = freestyleLaunchSpeed(
      practiceJump?.speedRange,
      session?.launchSpeed,
    );
    const launchSummary = launch
      ? ` Launch ${Math.round(session.launchSpeed * 3.6)} km/h; band ${launch.label}.`
      : '';
    status.textContent = session
      ? session.outcome
        ? `${session.label}: ${session.outcome.reason}.${launchSummary} Practice stays unranked.`
        : `${session.label} · Unranked practice. R retries this transfer.`
      : 'Learn one landing. Full-chain runs keep separate ranked scores.';
    repeat.textContent =
      session?.id === select.value ? 'Retry transfer' : 'Practice transfer';
    const restart = panel.querySelector('#restart');
    if (restart)
      restart.textContent = session ? 'Retry transfer' : 'Restart full chain';
  }
  return {
    update(frame) {
      updatePractice(frame);
      root.hidden = !['racing', 'countdown'].includes(frame.mode);
      const data = frame.motion?.motion?.freestyle ?? frame.motion?.freestyle;
      if (!data) return;
      const names = frame.gamepad
        ? [
            'X / Y',
            'RIGHT STICK ↑↓',
            'RIGHT STICK ←→',
            controllerLayout(frame.settings).airbrake,
          ]
        : ['Q / E', 'Z / X', 'C / V', 'SPACE'];
      controls.forEach((node, i) => {
        node.querySelector('b').textContent = names[i];
      });
      score.textContent = data.score.toLocaleString();
      modeLabel.textContent = frame.freestylePractice
        ? 'TRANSFER PRACTICE / UNRANKED'
        : 'FREESTYLE / PILOT';
      chain.textContent = data.chain ? `×${data.chain}` : '—';
      const currentId = frame.freestylePractice?.id ?? data.flight?.id;
      const index = currentId
        ? track.jumps.findIndex((jump) => jump.id === currentId)
        : Math.min(data.legs.length, track.jumps.length - 1);
      const jump = track.jumps[Math.max(0, index)];
      root.querySelectorAll('.fs-links i').forEach((node, i) => {
        const leg = data.legs.find((entry) => entry.id === track.jumps[i].id);
        node.dataset.state = leg
          ? leg.clean
            ? 'clean'
            : 'broken'
          : i === index
            ? 'current'
            : 'waiting';
      });
      const airborne = !!data.flight,
        omega = Math.max(
          Math.hypot(...data.angular),
          data.actualAngularSpeed ?? 0,
        ),
        seconds = data.touchdown;
      phase.textContent = airborne
        ? data.flight.failed
          ? 'TRANSFER MISSED'
          : seconds == null
            ? 'AIRBORNE'
            : `TOUCHDOWN ~${Math.max(0, seconds).toFixed(1)}s`
        : data.legs.length === track.jumps.length
          ? 'FINAL RUNOUT'
          : `TRANSFER ${index + 1} / ${track.jumps.length} · APPROACH`;
      const finishedTransfers =
        !airborne && data.legs.length === track.jumps.length;
      transferName.textContent = finishedTransfers
        ? 'The finish basin'
        : jump.label;
      approach.textContent = finishedTransfers
        ? 'Bring the chain home.'
        : (jump.approachHint ?? 'Set your speed and release line.');
      receiver.textContent = jump.receiverHint ?? 'Match the receiving bank.';
      receiver.hidden = finishedTransfers;
      speed.hidden = finishedTransfers;
      const launchSpeed = freestyleLaunchSpeed(
        jump.speedRange,
        frame.state.speed,
      );
      const approaching =
        !airborne && jump.takeoff - frame.state.distance <= 400;
      speed.textContent = launchSpeed
        ? `Launch ${launchSpeed.label}${approaching ? ` · ${launchSpeed.advice}` : ''}`
        : (jump.speedHint ?? '');
      speed.dataset.state = launchSpeed && approaching ? launchSpeed.state : '';
      const reference = data.receiverReference;
      alignment.textContent = reference
        ? `Receiver reference · tilt ${Math.round((reference.tilt * 180) / Math.PI)}° · nose ${Math.round((reference.nose * 180) / Math.PI)}°`
        : '';
      alignment.hidden = !reference;
      trick.textContent = airborne
        ? data.flight.failed
          ? 'The next link is still yours.'
          : (data.active ??
            (data.flight.tricks.length
              ? data.flight.tricks.map((kind) => TRICKS[kind].name).join(' + ')
              : 'Aim first. Style when you can.'))
        : 'Make the landing. Build the chain.';
      rotation.style.transform = `scaleX(${Math.min(1, omega / 3.2)})`;
      root.dataset.late = String(
        airborne && seconds != null && seconds < 0.8 && omega > 0.65,
      );
      catchText.textContent = airborne
        ? data.flight.failed
          ? 'Use Pause → transfer practice to learn this receiver.'
          : reference
            ? freestyleAttitudeCue(reference, {
                gamepad: frame.gamepad,
                brake: names[3],
                angularSpeed: omega,
              })
            : seconds != null && seconds < 0.8
              ? 'Hold your bank into contact. A timed brake adds precision.'
              : 'Face the receiver. Leave time to settle.'
        : 'Each release asks for a different line. Keep the next receiver in sight.';
      const leg = data.legs.at(-1);
      last.textContent = leg
        ? `${leg.reason} · ${leg.bank ? `+${leg.bank.toLocaleString()}` : 'chain broken'}`
        : 'Pause → transfer practice · R retries';
    },
    dispose() {
      controller.abort();
      practice.remove();
      root.remove();
    },
  };
}
