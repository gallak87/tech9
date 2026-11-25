import { Object3D, Vector3 } from 'three';
import { createReadoutAnchor } from '../pickups/readout-anchor.js';
import { TRICKS } from './controller.js';
import { controllerLayout } from '../input/gamepad.js';
import { freestyleAttitudeCue, freestyleLaunchSpeed } from './feedback.js';
import { createFreestyleArcade, FREESTYLE_GRADES } from './arcade.js';

export function createFreestyleOverlay({
  host,
  track,
  view,
  freestyleActions,
  developer = false,
}) {
  const showDiagnostics = developer === true;
  const root = document.createElement('section');
  root.className = 'freestyle-hud hud-card hud-card--fade';
  root.setAttribute('aria-label', 'Freestyle score and transfer chain');
  root.innerHTML =
    '<div class="fs-score"><span>FREESTYLE</span><strong>0</strong><small>CHAIN <b>—</b></small></div><div class="fs-links" aria-label="Transfer chain">' +
    track.jumps.map((_, i) => `<i>${i + 1}</i>`).join('') +
    '</div><div class="fs-flight"><span class="fs-phase"></span><h3 class="fs-transfer"></h3><small class="fs-last" hidden></small></div>' +
    (showDiagnostics
      ? '<div class="fs-diagnostics"><p class="fs-approach"></p><p class="fs-receiver"></p><small class="fs-speed"></small><small class="fs-alignment"></small><div class="fs-rotation" aria-label="Rotation speed"><i></i></div><p class="fs-catch"></p><div class="fs-controls"><span><b>← / →</b>ROLL</span><span><b>↑ / ↓</b>FLIP</span><span><b>Q / E</b>FLAT SPIN</span><span class="fs-brake"><b>SPACE</b>BRAKE / FINE TRIM</span></div></div>'
      : '');
  host.append(root);
  const air = document.createElement('section');
  air.className = 'freestyle-air-readout fs-air hud-card';
  air.setAttribute('aria-label', 'Unbanked air score');
  air.hidden = true;
  air.innerHTML =
    '<div class="fs-air-score"><span>AIR SCORE</span><strong>0</strong></div><div class="fs-charge" hidden><span></span><i><b></b></i></div><strong class="fs-trick" hidden></strong>';
  host.append(air);
  const viewportElement =
    view?.renderer?.domElement ?? host.querySelector('canvas#world');
  const readoutAnchor = createReadoutAnchor();
  const viewAlignedAnchor = new Object3D();
  const shipCentre = new Vector3();
  const projectedCentre = new Vector3();
  const airPresentation = {
    visible: false,
    x: null,
    y: null,
    shipX: null,
    shipY: null,
    width: null,
    height: null,
  };
  const payoffRoot = document.createElement('div');
  payoffRoot.className = 'freestyle-payoff';
  payoffRoot.hidden = true;
  payoffRoot.innerHTML =
    '<span class="fs-grade"></span><strong class="fs-bank-points"></strong><small class="fs-bank-label"></small>';
  host.append(payoffRoot);
  const arcade = createFreestyleArcade();
  const score = root.querySelector('.fs-score>strong'),
    modeLabel = root.querySelector('.fs-score>span'),
    chain = root.querySelector('.fs-score small b'),
    phase = root.querySelector('.fs-phase'),
    transferName = root.querySelector('.fs-transfer'),
    trick = air.querySelector('.fs-trick'),
    last = root.querySelector('.fs-last'),
    airScore = air.querySelector('.fs-air-score strong'),
    charge = air.querySelector('.fs-charge'),
    chargeLabel = air.querySelector('.fs-charge span'),
    chargeFill = air.querySelector('.fs-charge b'),
    grade = payoffRoot.querySelector('.fs-grade'),
    bankPoints = payoffRoot.querySelector('.fs-bank-points'),
    bankLabel = payoffRoot.querySelector('.fs-bank-label');
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
  function hideAirReadout() {
    air.hidden = true;
    readoutAnchor.reset();
    airPresentation.visible = false;
    airPresentation.x = airPresentation.y = null;
    airPresentation.shipX = airPresentation.shipY = null;
  }
  function positionAirReadout(frame, active) {
    if (
      !active ||
      frame.mode !== 'racing' ||
      !frame.ship?.group ||
      !frame.camera
    ) {
      hideAirReadout();
      return;
    }
    const viewport = viewportElement?.getBoundingClientRect();
    if (!viewport?.width || !viewport.height) {
      hideAirReadout();
      return;
    }
    frame.camera.updateWorldMatrix(true, false);
    frame.ship.group.getWorldPosition(shipCentre);
    projectedCentre.copy(shipCentre).project(frame.camera);
    if (
      projectedCentre.z < -1 ||
      projectedCentre.z > 1 ||
      Math.abs(projectedCentre.x) > 1 ||
      Math.abs(projectedCentre.y) > 1
    ) {
      hideAirReadout();
      return;
    }
    // Reuse the pickup readout's filtered screen anchor. Its lift is aligned
    // with the view, so an inverted hull never swings the score below itself.
    viewAlignedAnchor.position.copy(shipCentre);
    frame.camera.getWorldQuaternion(viewAlignedAnchor.quaternion);
    viewAlignedAnchor.updateWorldMatrix(false, false);
    const anchor = readoutAnchor.update({
      ship: viewAlignedAnchor,
      camera: frame.camera,
      width: viewport.width,
      height: viewport.height,
      dt: frame.dt,
    });
    if (!anchor) {
      hideAirReadout();
      return;
    }
    const margin = Math.min(108, viewport.width / 2);
    const x = Math.max(margin, Math.min(viewport.width - margin, anchor.x));
    const y = Math.max(118, Math.min(viewport.height - 88, anchor.y - 16));
    // Game host owns fixed canvas/UI children and has no layout height. Use
    // the real rendered canvas rectangle and viewport-fixed CSS coordinates.
    air.style.left = `${viewport.left + x}px`;
    air.style.top = `${viewport.top + y}px`;
    air.hidden = false;
    airPresentation.visible = true;
    airPresentation.x = viewport.left + x;
    airPresentation.y = viewport.top + y;
    airPresentation.shipX =
      viewport.left + (projectedCentre.x * 0.5 + 0.5) * viewport.width;
    airPresentation.shipY =
      viewport.top + (-projectedCentre.y * 0.5 + 0.5) * viewport.height;
    airPresentation.viewportLeft = viewport.left;
    airPresentation.viewportTop = viewport.top;
    airPresentation.width = viewport.width;
    airPresentation.height = viewport.height;
  }
  return {
    reset() {
      hideAirReadout();
      payoffRoot.hidden = true;
    },
    getPresentation: () => ({ freestyleAir: { ...airPresentation } }),
    update(frame) {
      if (frame.reset) readoutAnchor.reset();
      updatePractice(frame);
      root.hidden = !['racing', 'countdown'].includes(frame.mode);
      const data = frame.motion?.motion?.freestyle ?? frame.motion?.freestyle;
      if (!data) {
        hideAirReadout();
        payoffRoot.hidden = true;
        return;
      }
      const reducedMotion = !!frame.settings?.reducedMotion;
      const presentation = arcade.update(data, {
        running: frame.mode === 'racing',
        reducedMotion,
        session: frame.freestylePractice?.id ?? 'full-run',
      });
      score.textContent = presentation.score.toLocaleString();
      root.dataset.reducedMotion = String(reducedMotion);
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
      positionAirReadout(
        frame,
        !!settling || (airborne && !data.flight.failed),
      );
      airScore.textContent = presentation.airScore.toLocaleString();
      charge.hidden = !presentation.charge;
      if (presentation.charge) {
        chargeLabel.textContent = TRICKS[presentation.charge.kind].name;
        chargeFill.style.transform = `scaleX(${presentation.charge.progress})`;
      }
      const callout = presentation.callout;
      trick.textContent = callout
        ? `${callout.label}  +${Math.round(callout.points).toLocaleString()}`
        : '';
      trick.hidden = !trick.textContent;
      trick.style.opacity = callout
        ? Math.min(1, (1.45 - callout.age) / 0.3)
        : 0;
      trick.style.transform = `translateY(${callout && !reducedMotion ? -Math.max(0, 1 - callout.age / 0.18) * 5 : 0}px)`;
      const payoff = presentation.payoff;
      payoffRoot.hidden = root.hidden || !payoff;
      if (payoff) {
        const theme = FREESTYLE_GRADES[payoff.grade];
        root.style.setProperty('--fs-grade-color', theme.color);
        root.style.setProperty(
          '--fs-score-glow',
          payoff.sweep * (1 - payoff.sweep) * 4,
        );
        payoffRoot.style.setProperty('--fs-grade-color', theme.color);
        payoffRoot.style.setProperty('--fs-payoff-entrance', payoff.entrance);
        payoffRoot.style.setProperty('--fs-payoff-sweep', payoff.sweep);
        payoffRoot.style.opacity = payoff.opacity;
        payoffRoot.dataset.grade = payoff.grade;
        grade.textContent = theme.label;
        bankPoints.textContent = `+${payoff.points.toLocaleString()}`;
        bankPoints.hidden =
          !payoff.bank || (payoff.points === 0 && payoff.age > 0.22);
        bankLabel.textContent = payoff.bank
          ? `BANKED${payoff.chain > 1 ? ` ×${payoff.chain}` : ''}`
          : '';
        bankLabel.hidden = !payoff.bank;
        if (payoff.age === 0 && !reducedMotion && !root.hidden && payoff.bank) {
          const target = score.getBoundingClientRect();
          const source = bankPoints.getBoundingClientRect();
          payoffRoot.style.setProperty(
            '--fs-bank-dx',
            `${target.left + target.width / 2 - source.left - source.width / 2}px`,
          );
          payoffRoot.style.setProperty(
            '--fs-bank-dy',
            `${target.top + target.height / 2 - source.top - source.height / 2}px`,
          );
        }
      } else root.style.setProperty('--fs-score-glow', 0);
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
      payoffRoot.remove();
      air.remove();
    },
  };
}
