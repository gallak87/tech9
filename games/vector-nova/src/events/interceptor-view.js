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
  return `<section class="result-panel interceptor-results"><div class="front-heading"><span class="kicker">INTERCEPTOR / ${escape(courseName)}</span><h1 tabindex="-1">${won ? 'Goliath disabled' : 'Goliath escaped'}${result?.playerValid === false ? ' · Unranked' : ''}</h1></div><p class="interceptor-outcome">${won ? 'The squad stopped the target before the escape boundary.' : 'The target reached the escape boundary with hull remaining. Stay on its line and land more Lance shots.'}</p><div class="interceptor-result-stats"><span><b>${duration(result?.elapsed ?? result?.time)}</b>pursuit duration</span><span><b>${Math.round(finite(result?.health))} / ${Math.round(total)}</b>target hull remaining</span><span><b>${Math.floor(finite(result?.hits))}</b>confirmed hits</span></div><div class="interceptor-contributions" aria-label="Confirmed damage contributions"><div><span>YOU</span><b>${player}</b><i><em style="width:${Math.min(100, Math.max(0, (player / total) * 100))}%"></em></i></div><div><span>ALLIED RACERS</span><b>${allied}</b><i><em style="width:${Math.min(100, Math.max(0, (allied / total) * 100))}%"></em></i></div></div><p class="results-note">Stock hull · Issued Lance and Reserve Injector. Damage is counted only from real, unblocked hits on Goliath.${result?.playerValid === false ? ' This run is unranked.' : ''}</p><div class="front-actions results-actions"><button class="primary" data-action="retry-race">Retry Interceptor →</button><button data-action="change">Back to setup</button></div></section>`;
}

export function createInterceptorPresentation({ host }) {
  const previousEvent = host.dataset.event;
  host.dataset.event = 'interceptor';
  const root = document.createElement('section');
  root.className = 'interceptor-hud';
  root.hidden = true;
  root.setAttribute('aria-label', 'Interceptor target and squad status');
  root.innerHTML =
    '<span class="ic-identity">INTERCEPTOR / PURSUIT</span><div class="ic-target"><strong>GOLIATH</strong><span class="ic-gap">ACQUIRE TARGET</span></div><div class="ic-health-label"><span>TARGET HULL</span><b>240 <small>/ 240</small></b></div><div class="ic-health" role="progressbar" aria-label="Goliath hull" aria-valuemin="0" aria-valuemax="240" aria-valuenow="240"><i></i></div><div class="ic-escape"><span>ESCAPE BOUNDARY</span><b>—</b></div><div class="ic-route"><i></i></div><p class="ic-squad">ROOK · KITE · MANTA</p><p class="ic-hit">Land Lance shots. The squad will support.</p><div class="ic-controls"><span><b>Q / X</b> FIRE LANCE</span><span><b>E / Y</b> RESERVE INJECTOR</span><span><b class="ic-boost-key">SHIFT / A</b> BOOST TO CLOSE THE GAP</span></div>';
  host.append(root);
  const gap = root.querySelector('.ic-gap'),
    health = root.querySelector('.ic-health'),
    healthFill = health.querySelector('i'),
    healthLabel = root.querySelector('.ic-health-label b'),
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
      if (!data) return;
      const remaining = Math.max(0, finite(data.health)),
        maximum = Math.max(1, finite(data.maxHealth));
      root.dataset.reduced = String(!!frame.settings?.reducedMotion);
      root.dataset.close = String(Math.abs(finite(data.gap)) < 320);
      const separation = finite(data.gap);
      gap.textContent =
        Math.abs(separation) < 12
          ? 'ALONGSIDE'
          : `${Math.round(Math.abs(separation))} m ${separation >= 0 ? 'AHEAD' : 'BEHIND'}`;
      healthLabel.innerHTML = `${Math.ceil(remaining)} <small>/ ${Math.ceil(maximum)}</small>`;
      health.setAttribute('aria-valuemax', String(maximum));
      health.setAttribute('aria-valuenow', String(remaining));
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
        ? `${name(data.lastHit.source)} · ${data.lastHit.equipment === 'lance' ? 'Lance' : 'Arc'} hit · ${data.lastHit.damage} damage`
        : 'Land Lance shots. The squad will support.';
      boost.textContent = `SHIFT / ${controllerLayout(frame.settings ?? {}).boost}`;
    },
    trigger() {},
    reset() {
      root.hidden = true;
      root.dataset.hit = 'none';
    },
    dispose() {
      disposed = true;
      root.remove();
      if (host.dataset.event === 'interceptor') {
        if (previousEvent === undefined) delete host.dataset.event;
        else host.dataset.event = previousEvent;
      }
    },
  };
}
