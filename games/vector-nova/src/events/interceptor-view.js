import { controllerLayout } from '../input/gamepad.js';
import './interceptor.css';

const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ],
  );
const finite = (value) => (Number.isFinite(value) ? value : 0);
const distance = (value) =>
  `${(Math.max(0, finite(value)) / 1000).toFixed(2)} km`;
function duration(value) {
  const tenths = Math.floor(Math.max(0, finite(value)) * 10 + 1e-6);
  return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, '0')}.${tenths % 10}`;
}
const name = (id) =>
  id === 'player'
    ? 'YOU'
    : String(id ?? '').replace(/^./, (character) => character.toUpperCase());
const weaponName = (id) =>
  ({ lance: 'Lance', arc: 'Arc', repulsor: 'Repulsor' })[id] ?? 'Weapon';

// Mission completion has an outcome and damage contribution, not race places
// or invented lap times. This helper stays asset-free for the main menu.
export function interceptorResultsView(
  result,
  { courseName = 'Crucible Foundry' } = {},
) {
  const won = result?.won === true,
    player = finite(result?.playerDamage),
    allied = finite(result?.alliedDamage);
  const total = Math.max(1, finite(result?.maxHealth));
  const targetName = result?.targetName ?? 'Goliath';
  const remaining = Math.min(total, Math.max(0, finite(result?.health)));
  return `<section class="result-panel interceptor-results">
    <div class="front-heading"><span class="kicker">INTERCEPTOR / ${escape(courseName)}</span><h1 tabindex="-1">${escape(targetName)} ${won ? 'disabled' : 'escaped'}${result?.playerValid === false ? ' · Unranked' : ''}</h1></div>
    <p class="interceptor-outcome">${won ? 'The squad stopped the target before the escape boundary.' : 'The target reached the escape boundary with hull remaining. Stay on its line and land more Lance shots.'}</p>
    <div class="interceptor-result-stats"><span><b>${duration(result?.elapsed ?? result?.time)}</b>pursuit duration</span><span><b>${Math.floor(finite(result?.hits))}</b>confirmed hits</span></div>
    <div class="interceptor-contributions" aria-label="Damage dealt"><div><span>YOUR DAMAGE</span><b>${player}</b></div><div><span>ALLIED DAMAGE</span><b>${allied}</b></div></div>
    <div class="interceptor-target-health"><div><span>${escape(targetName.toUpperCase())} · HEALTH REMAINING</span><b>${Math.round(remaining)} / ${Math.round(total)}</b></div><div class="ic-health" role="progressbar" aria-label="${escape(targetName)} remaining health" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${remaining}" aria-valuetext="${Math.round(remaining)} health remaining out of ${Math.round(total)}"><i style="transform:scaleX(${remaining / total})"></i></div></div>
    ${result?.playerValid === false ? '<p class="results-note">Unranked run.</p>' : ''}
    <div class="front-actions results-actions"><button class="primary" data-action="retry-race">Retry Interceptor →</button><button data-action="change">Back to setup</button></div>
  </section>`;
}

export function createInterceptorPresentation({ host }) {
  const previousEvent = host.dataset.event;
  host.dataset.event = 'interceptor';
  const root = document.createElement('section');
  root.className = 'interceptor-hud';
  root.hidden = true;
  root.setAttribute('aria-label', 'Interceptor target and squad status');
  root.innerHTML =
    '<span class="ic-identity">INTERCEPTOR / PURSUIT</span><div class="ic-target"><strong>TARGET</strong><span class="ic-gap">ACQUIRE TARGET</span></div><div class="ic-escape"><span>ESCAPE BOUNDARY</span><b>—</b></div><div class="ic-route"><i></i></div><p class="ic-squad">ROOK · KITE · MANTA</p><p class="ic-hit">Land Lance shots. The squad will support.</p><div class="ic-controls"><span><b>Q / X</b> FIRE LANCE</span><span><b>E / Y</b> RESERVE INJECTOR</span><span><b class="ic-boost-key">SHIFT / A</b> BOOST TO CLOSE THE GAP</span></div>';
  const boss = document.createElement('section');
  boss.className = 'interceptor-boss';
  boss.hidden = true;
  boss.setAttribute('aria-label', 'Goliath');
  boss.innerHTML =
    '<div class="ic-boss-heading"><strong>GOLIATH</strong><span>—</span></div><div class="ic-boss-meter" role="progressbar" aria-label="Goliath remaining health" aria-valuemin="0" aria-valuemax="1" aria-valuenow="0"><i></i></div>';
  const counterattack = document.createElement('p');
  counterattack.className = 'ic-counterattack';
  counterattack.setAttribute('role', 'status');
  counterattack.hidden = true;
  root.insertBefore(counterattack, root.querySelector('.ic-controls'));
  host.append(root, boss);
  const gap = root.querySelector('.ic-gap'),
    health = boss.querySelector('.ic-boss-meter'),
    healthFill = health.querySelector('i'),
    healthLabel = boss.querySelector('.ic-boss-heading span'),
    escapeLabel = root.querySelector('.ic-escape b'),
    route = root.querySelector('.ic-route i'),
    squad = root.querySelector('.ic-squad'),
    hit = root.querySelector('.ic-hit'),
    boost = root.querySelector('.ic-boost-key');
  let disposed = false;
  return {
    update(frame) {
      if (disposed) return;
      const data = frame.interceptor;
      root.hidden = !data || !['racing', 'countdown'].includes(frame.mode);
      boss.hidden = root.hidden;
      if (!data) return;
      const targetName = data.targetName ?? 'Goliath';
      boss.querySelector('.ic-boss-heading strong').textContent =
        targetName.toUpperCase();
      boss.setAttribute('aria-label', targetName);
      health.setAttribute('aria-label', `${targetName} remaining health`);
      root.querySelector('.ic-identity').textContent =
        `INTERCEPTOR / ${(data.difficulty ?? 'medium').toUpperCase()}`;
      const phase = data.counterattack?.phase ?? 'idle';
      root.dataset.counterattack = phase;
      counterattack.hidden = phase === 'idle';
      counterattack.textContent =
        phase === 'telegraph'
          ? 'TARGET CHARGING · MOVE OFF ITS LINE'
          : phase === 'turning-back'
            ? `${targetName.toUpperCase()} TURNING · GET READY TO DODGE`
            : phase === 'firing'
              ? data.counterattack?.kind === 'ion'
                ? 'ION WAKE · FIND A CLEAR LANE'
                : 'INCOMING VOLLEY · DODGE'
              : 'TARGET TURNING FORWARD';
      const remaining = Math.max(0, finite(data.health)),
        maximum = Math.max(1, finite(data.maxHealth));
      root.dataset.reduced = String(!!frame.settings?.reducedMotion);
      boss.dataset.reduced = root.dataset.reduced;
      root.dataset.close = String(Math.abs(finite(data.gap)) < 320);
      const separation = finite(data.gap);
      gap.textContent =
        Math.abs(separation) < 12
          ? 'ALONGSIDE'
          : `${Math.round(Math.abs(separation))} m ${separation >= 0 ? 'AHEAD' : 'BEHIND'}`;
      healthLabel.textContent = `${Math.ceil(remaining)} / ${Math.ceil(maximum)}`;
      health.setAttribute('aria-valuemax', String(maximum));
      health.setAttribute('aria-valuenow', String(remaining));
      health.setAttribute(
        'aria-valuetext',
        `${Math.ceil(remaining)} health remaining out of ${Math.ceil(maximum)}`,
      );
      healthFill.style.transform = `scaleX(${Math.min(1, remaining / maximum)})`;
      escapeLabel.textContent = `${distance(finite(data.escapeDistance) - finite(data.targetDistance))} left`;
      route.style.transform = `scaleX(${Math.max(0, Math.min(1, finite(data.escapeProgress)))})`;
      squad.textContent = (data.allies ?? ['rook', 'kite', 'manta'])
        .map((id) => name(id).toUpperCase())
        .join(' · ');
      const recent = data.lastHit && data.elapsed - data.lastHit.elapsed < 2;
      root.dataset.hit = recent
        ? data.lastHit.source === 'player'
          ? 'player'
          : 'ally'
        : 'none';
      hit.textContent = recent
        ? `${name(data.lastHit.source)} · ${weaponName(data.lastHit.equipment)} hit · ${data.lastHit.damage} damage`
        : 'Hold fire. Cross weapon gates for extra attacks.';
      boost.textContent = `SHIFT / ${controllerLayout(frame.settings ?? {}).boost}`;
    },
    trigger() {},
    reset() {
      root.hidden = true;
      boss.hidden = true;
      root.dataset.hit = 'none';
    },
    dispose() {
      disposed = true;
      root.remove();
      boss.remove();
      if (host.dataset.event === 'interceptor') {
        if (previousEvent === undefined) delete host.dataset.event;
        else host.dataset.event = previousEvent;
      }
    },
  };
}
