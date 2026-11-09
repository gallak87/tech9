import { TRICKS } from './controller.js';
import { controllerLayout } from '../input/gamepad.js';
import { freestyleAttitudeCue, freestyleLaunchSpeed } from './feedback.js';

export function createFreestyleOverlay({
  host,
  track,
  freestyleActions,
  developer = false,
}) {
  const showDiagnostics = developer === true;
  const root = document.createElement('section');
  root.className = 'freestyle-hud';
  root.setAttribute('aria-label', 'Freestyle score and transfer chain');
  root.innerHTML =
    '<div class="fs-score"><span>FREESTYLE</span><strong>0</strong><small>CHAIN <b>—</b></small></div><div class="fs-links" aria-label="Transfer chain">' +
    track.jumps.map((_, i) => `<i>${i + 1}</i>`).join('') +
    '</div><div class="fs-flight"><span class="fs-phase"></span><h3 class="fs-transfer"></h3><strong class="fs-trick" hidden></strong><small class="fs-last" hidden></small></div>' +
    (showDiagnostics
      ? '<div class="fs-diagnostics"><p class="fs-approach"></p><p class="fs-receiver"></p><small class="fs-speed"></small><small class="fs-alignment"></small><div class="fs-rotation" aria-label="Rotation speed"><i></i></div><p class="fs-catch"></p><div class="fs-controls"><span><b>← / →</b>ROLL</span><span><b>↑ / ↓</b>FLIP</span><span><b>Q / E</b>FLAT SPIN</span><span class="fs-brake"><b>SPACE</b>BRAKE / FINE TRIM</span></div></div>'
      : '');
  host.append(root);
  const score = root.querySelector('.fs-score>strong'),
    modeLabel = root.querySelector('.fs-score>span'),
    chain = root.querySelector('.fs-score small b'),
    phase = root.querySelector('.fs-phase'),
    transferName = root.querySelector('.fs-transfer'),
    trick = root.querySelector('.fs-trick'),
    last = root.querySelector('.fs-last');
  const links = [...root.querySelectorAll('.fs-links i')];
  const diagnostics = showDiagnostics
    ? {
        approach: root.querySelector('.fs-approach'),
        receiver: root.querySelector('.fs-receiver'),
        speed: root.querySelector('.fs-speed'),
        alignment: root.querySelector('.fs-alignment'),
        rotation: root.querySelector('.fs-rotation i'),
        catchText: root.querySelector('.fs-catch'),
        controls: [...root.querySelectorAll('.fs-controls span')],
      }
    : null;
  const controller = new AbortController();
  let practice = null,
    updatePractice = () => {};
  if (showDiagnostics && freestyleActions) {
    practice = document.createElement('section');
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
    repeat.addEventListener(
      'click',
      () => freestyleActions.practiceTransfer(select.value),
      {
        signal: controller.signal,
      },
    );
    full.addEventListener('click', () => freestyleActions.startFullRun(), {
      signal: controller.signal,
    });
    let previousPractice = null;
    updatePractice = (frame) => {
      const panel = host.querySelector('#pause-panel');
      if (!panel) return;
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
          ? `${session.label}: ${session.outcome.reason}.${launchSummary}`
          : `${session.label} · Unranked practice · R retry`
        : 'Unranked transfer practice';
      repeat.textContent =
        session?.id === select.value ? 'Retry transfer' : 'Practice transfer';
      const restart = panel.querySelector('#restart');
      if (restart)
        restart.textContent = session ? 'Retry transfer' : 'Restart full chain';
    };
  }
  function updateDiagnostics(
    frame,
    data,
    jump,
    airborne,
    settling,
    finishedTransfers,
  ) {
    if (!diagnostics) return;
    const names = frame.gamepad
      ? [
          'RIGHT STICK ←→',
          'RIGHT STICK ↑↓',
          'X / Y',
          controllerLayout(frame.settings).airbrake,
        ]
      : ['← / →', '↑ / ↓', 'Q / E', 'SPACE'];
    diagnostics.controls.forEach((node, i) => {
      node.querySelector('b').textContent = names[i];
    });
    diagnostics.approach.textContent = finishedTransfers
      ? ''
      : (jump.approachHint ?? '');
    diagnostics.receiver.textContent = finishedTransfers
      ? ''
      : (jump.receiverHint ?? '');
    const launchSpeed = freestyleLaunchSpeed(
      jump.speedRange,
      frame.state.speed,
    );
    const approaching =
      !settling && !airborne && jump.takeoff - frame.state.distance <= 400;
    diagnostics.speed.hidden = finishedTransfers || !!settling;
    diagnostics.speed.textContent = launchSpeed
      ? `Launch ${launchSpeed.label}${approaching ? ` · ${launchSpeed.advice}` : ''}`
      : (jump.speedHint ?? '');
    diagnostics.speed.dataset.state =
      launchSpeed && approaching ? launchSpeed.state : '';
    const reference = data.receiverReference;
    diagnostics.alignment.textContent = reference
      ? `Receiver reference · tilt ${Math.round((reference.tilt * 180) / Math.PI)}° · nose ${Math.round((reference.nose * 180) / Math.PI)}°`
      : '';
    diagnostics.alignment.hidden = !reference || !!settling;
    const omega = Math.max(
      Math.hypot(...data.angular),
      data.actualAngularSpeed ?? 0,
    );
    diagnostics.rotation.style.transform = `scaleX(${Math.min(1, omega / 3.2)})`;
    root.dataset.late = String(
      airborne &&
        data.touchdown != null &&
        data.touchdown < 0.8 &&
        omega > 0.65,
    );
    diagnostics.catchText.textContent =
      reference && airborne && !data.flight.failed
        ? freestyleAttitudeCue(reference, {
            gamepad: frame.gamepad,
            brake: names[3],
            angularSpeed: omega,
          })
        : '';
  }
  return {
    update(frame) {
      updatePractice(frame);
      root.hidden = !['racing', 'countdown'].includes(frame.mode);
      const data = frame.motion?.motion?.freestyle ?? frame.motion?.freestyle;
      if (!data) return;
      score.textContent = data.score.toLocaleString();
      modeLabel.textContent = frame.freestylePractice
        ? 'PRACTICE / UNRANKED'
        : 'FREESTYLE';
      chain.textContent = data.chain ? `×${data.chain}` : '—';
      const settling = data.pendingLanding;
      const currentId =
        frame.freestylePractice?.id ?? settling?.id ?? data.flight?.id;
      const index = currentId
        ? track.jumps.findIndex((jump) => jump.id === currentId)
        : Math.min(data.legs.length, track.jumps.length - 1);
      const jump = track.jumps[Math.max(0, index)];
      links.forEach((node, i) => {
        const leg = data.legs.find((entry) => entry.id === track.jumps[i].id);
        node.dataset.state = leg
          ? leg.clean
            ? 'clean'
            : leg.landed
              ? 'landed'
              : 'broken'
          : settling?.id === track.jumps[i].id
            ? 'settling'
            : i === index
              ? 'current'
              : 'waiting';
        node.setAttribute(
          'aria-label',
          `Transfer ${i + 1}${leg ? ` · ${leg.reason} · ${leg.bank.toLocaleString()} points` : ''}`,
        );
      });
      const airborne = !!data.flight && !settling;
      const finishedTransfers =
        !settling && !airborne && data.legs.length === track.jumps.length;
      phase.textContent = settling
        ? 'LANDING'
        : airborne
          ? data.flight.failed
            ? 'MISSED'
            : 'AIRBORNE'
          : finishedTransfers
            ? 'FINISH'
            : `TRANSFER ${index + 1} / ${track.jumps.length}`;
      transferName.textContent = finishedTransfers ? 'Finish' : jump.label;
      trick.textContent =
        airborne && !data.flight.failed
          ? (data.active ??
            data.flight.tricks.map((kind) => TRICKS[kind].name).join(' + '))
          : '';
      trick.hidden = !trick.textContent;
      const leg = data.legs.at(-1);
      last.textContent = settling
        ? 'Touchdown'
        : leg
          ? `${leg.reason} · ${leg.bank ? `+${leg.bank.toLocaleString()}` : 'Chain broken'}`
          : '';
      last.hidden = !last.textContent;
      updateDiagnostics(
        frame,
        data,
        jump,
        airborne,
        settling,
        finishedTransfers,
      );
    },
    dispose() {
      controller.abort();
      practice?.remove();
      root.remove();
    },
  };
}
