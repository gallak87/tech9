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
const distance = (value) => {
  const metres = Math.max(0, finite(value));
  return metres < 1000
    ? `${Math.round(metres)} m`
    : `${(metres / 1000).toFixed(2)} km`;
};
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
    <div class="front-actions results-actions"><button class="primary" data-action="change">Race setup →</button><button data-action="retry-race">Retry Interceptor</button></div>
  </section>`;
}

export function createInterceptorPresentation({ host }) {
  const previousEvent = host.dataset.event;
  host.dataset.event = 'interceptor';
  const layout = document.createElement('div');
  layout.className = 'interceptor-layout';
  const root = document.createElement('section');
  root.className = 'interceptor-hud hud-card hud-card--fade';
  root.hidden = true;
  root.setAttribute('aria-label', 'Interceptor target and squad status');
  root.innerHTML = `<div class="ic-identity">INTERCEPTOR <small></small></div>
    <div class="ic-target"><span>TARGET</span> <strong>GOLIATH</strong></div>
    <div class="ic-distances">
      <div><span>GAP</span> <b class="ic-gap">—</b> <small class="ic-gap-direction"></small></div>
      <div class="ic-escape"><span>ESCAPE</span> <b>—</b></div>
    </div>
    <div class="ic-route" aria-hidden="true"><i></i></div>
    <div class="ic-squad"><span>ALLIES</span><span class="ic-allies" role="group" aria-label="Allied pilots"></span></div>
    <p class="ic-hit">Land Lance shots. The squad will support.</p>
    <div class="ic-controls"><span><b>Q / X</b> FIRE LANCE</span><span><b>E / Y</b> RESERVE INJECTOR</span><span><b class="ic-boost-key">SHIFT / A</b> BOOST TO CLOSE THE GAP</span></div>`;
  const boss = document.createElement('section');
  boss.className = 'interceptor-boss';
  boss.hidden = true;
  boss.setAttribute('aria-label', 'Goliath');
  boss.innerHTML = `<div class="ic-boss-strip hud-card">
      <strong>GOLIATH</strong>
      <div class="ic-boss-meter" role="progressbar" aria-label="Goliath remaining health" aria-valuemin="0" aria-valuemax="1" aria-valuenow="0"><i></i></div>
      <span class="ic-hull-value">—</span>
    </div>`;
  const counterattack = document.createElement('p');
  counterattack.className = 'ic-counterattack';
  counterattack.setAttribute('role', 'status');
  counterattack.hidden = true;
  boss.append(counterattack);
  layout.append(root, boss);
  host.append(layout);
  const targetLabel = root.querySelector('.ic-target strong'),
    difficulty = root.querySelector('.ic-identity small'),
    gap = root.querySelector('.ic-gap'),
    gapDirection = root.querySelector('.ic-gap-direction'),
    bossLabel = boss.querySelector('.ic-boss-strip strong'),
    health = boss.querySelector('.ic-boss-meter'),
    healthFill = health.querySelector('i'),
    healthLabel = boss.querySelector('.ic-hull-value'),
    escapeLabel = root.querySelector('.ic-escape b'),
    route = root.querySelector('.ic-route i'),
    squad = root.querySelector('.ic-allies'),
    hit = root.querySelector('.ic-hit'),
    boost = root.querySelector('.ic-boost-key');
  let disposed = false;
  let squadKey = null;
  return {
    update(frame) {
      if (disposed) return;
      const data = frame.interceptor;
      root.hidden = !data || !['racing', 'countdown'].includes(frame.mode);
      boss.hidden = root.hidden;
      if (!data) return;
      const targetName = data.targetName ?? 'Goliath';
      root.dataset.boss = data.bossId ?? data.targetId;
      boss.dataset.boss = root.dataset.boss;
      targetLabel.textContent = targetName.toUpperCase();
      bossLabel.textContent = targetLabel.textContent;
      boss.setAttribute('aria-label', targetName);
      health.setAttribute('aria-label', `${targetName} remaining health`);
      difficulty.textContent = (data.difficulty ?? 'medium').toUpperCase();
      const phase = data.counterattack?.phase ?? 'idle';
      root.dataset.counterattack = phase;
      boss.dataset.counterattack = phase;
      counterattack.hidden = phase === 'idle';
      const recenter =
        data.counterattack?.aimLanes &&
        data.counterattack.warning &&
        data.counterattack.shots >= data.counterattack.blasts &&
        !data.counterattack.pressureHits;
      const resonance = data.counterattack?.resonance;
      const breakwater = data.counterattack?.breakwater;
      const ionCounter = data.counterattack;
      counterattack.textContent = breakwater
        ? breakwater.active
          ? 'LIT EMITTER · SHOOT FROM THE FLANK'
          : breakwater.disabled && phase === 'telegraph'
            ? 'WAKE CUT · WATCH THE SHIELD'
            : phase === 'telegraph'
              ? 'WAKE EMITTER CHARGING'
              : 'BREAKER SLABS · MOVE OFF YOUR LINE'
        : resonance
          ? ionCounter.exposed
            ? 'CAPACITORS EXPOSED · FIRE'
            : ionCounter.countered
              ? 'LOCK BROKEN · KEEP YOUR LINE'
              : ionCounter.canCounter
                ? ionCounter.counterProgress > 0 && ionCounter.boostHeld
                  ? 'HOLD BOOST · BREAKING LOCK'
                  : ionCounter.boostHeld
                    ? 'RELEASE · RE-IGNITE BOOST'
                    : 'IGNITE BOOST · BREAK THE LOCK'
                : phase === 'telegraph'
                  ? ionCounter.boostHeld
                    ? 'RELEASE BOOST · RESONANCE CHARGING'
                    : 'RESONANCE CHARGING · WAIT FOR LOCK'
                  : phase === 'recovered'
                    ? 'LOCK HELD · CAPACITORS SEALED'
                    : 'ION SCISSORS · MOVE OFF YOUR LINE'
          : recenter
            ? 'RECENTER · CORE OPENING'
            : phase === 'recovered'
              ? 'PRESSURE RECOVERED · VENT SEALED'
              : phase === 'breach'
                ? 'CORE OPEN · HIT THE REAR VENT'
                : phase === 'telegraph'
                  ? data.counterattack?.aimLanes
                    ? 'DODGE · FORCE THE CORE OPEN'
                    : 'TARGET CHARGING · MOVE OFF ITS LINE'
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
      const alongside = Math.abs(separation) < 12;
      gap.textContent = alongside
        ? 'ALONGSIDE'
        : distance(Math.abs(separation));
      gapDirection.textContent = alongside
        ? ''
        : separation >= 0
          ? 'AHEAD'
          : 'BEHIND';
      healthLabel.textContent = `${Math.ceil(remaining)} / ${Math.ceil(maximum)}`;
      health.setAttribute('aria-valuemax', String(maximum));
      health.setAttribute('aria-valuenow', String(remaining));
      health.setAttribute(
        'aria-valuetext',
        `${Math.ceil(remaining)} health remaining out of ${Math.ceil(maximum)}`,
      );
      healthFill.style.transform = `scaleX(${Math.min(1, remaining / maximum)})`;
      escapeLabel.textContent = distance(
        finite(data.escapeDistance) - finite(data.targetDistance),
      );
      const escapeProgress = Math.max(
        0,
        Math.min(1, finite(data.escapeProgress)),
      );
      route.style.transform = `translateX(${100 * (escapeProgress - 1)}%)`;
      const allies = data.allies ?? ['rook', 'kite', 'manta'];
      const nextSquadKey = allies.join();
      if (nextSquadKey !== squadKey) {
        squadKey = nextSquadKey;
        squad.replaceChildren(
          ...allies.map((id) => {
            const pilot = document.createElement('span');
            pilot.setAttribute('role', 'img');
            pilot.setAttribute('aria-label', name(id));
            pilot.title = name(id);
            return pilot;
          }),
        );
      }
      const recent = data.lastHit && data.elapsed - data.lastHit.elapsed < 2;
      root.dataset.hit = recent
        ? data.lastHit.source === 'player'
          ? 'player'
          : 'ally'
        : 'none';
      hit.textContent = recent
        ? `${name(data.lastHit.source)} · ${data.lastHit.weakPoint ? (breakwater ? 'EMITTER RUPTURE' : resonance ? 'CAPACITOR HIT' : 'CORE BREACH') : data.lastHit.armored ? 'ARMOR HIT' : weaponName(data.lastHit.equipment) + ' hit'} · ${data.lastHit.damage} damage`
        : 'Hold Lance to fire. Cross weapon gates for extra attacks.';
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
      layout.remove();
      if (host.dataset.event === 'interceptor') {
        if (previousEvent === undefined) delete host.dataset.event;
        else host.dataset.event = previousEvent;
      }
    },
  };
}
