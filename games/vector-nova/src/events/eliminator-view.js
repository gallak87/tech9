import {
  classificationColors,
  classificationRowAttributes,
} from '../ui/race-classification.js';
import './eliminator.css';

const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character],
  );
const ordinal = (value) => {
  const place = Math.max(1, Math.floor(Number(value) || 1));
  const ending = place % 100;
  return `${place}${ending >= 11 && ending <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[place % 10] ?? 'th')}`;
};
function duration(value) {
  const tenths = Math.floor(
    Math.max(0, Number.isFinite(value) ? value : 0) * 10 + 1e-6,
  );
  return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, '0')}.${tenths % 10}`;
}

// Pure menu markup: world loading remains owned by the selected game session.
export function eliminatorResultsView(
  result,
  { courseName = 'Eliminator', shipId = result?.shipId } = {},
) {
  const rows = Array.isArray(result?.standings) ? result.standings : [];
  const won = result?.won === true;
  const atFinish = result?.reason === 'finish-line';
  const heading = atFinish
    ? won
      ? 'First to the lead deck'
      : `Convoy finished · ${ordinal(result?.playerPosition)}`
    : won
      ? 'Last racer standing'
      : `Eliminated · ${ordinal(result?.playerPosition)}`;
  const survivors = rows.filter((row) => !row.eliminated).length;
  const colors = classificationColors(shipId);
  return `<section class="result-panel eliminator-results"><div class="front-heading"><span class="kicker">ELIMINATOR / ${escape(courseName)}</span><h1 tabindex="-1">${heading}${result?.playerValid === false ? ' · Unranked' : ''}</h1></div><div class="eliminator-summary"><span><b>${ordinal(result?.playerPosition)}</b>place</span><span><b>${duration(result?.elapsed ?? result?.time)}</b>${atFinish ? 'race time' : 'survived'}</span><span><b>${survivors}</b>${atFinish ? 'racers remaining' : won ? 'racer remaining' : 'racers still active'}</span></div><ol aria-label="Eliminator classification">${rows.map((row) => `<li ${classificationRowAttributes(row.id, colors, 'is-player')} data-status="${escape(row.status)}"><b>${escape(row.position)}</b><span>${escape(row.name ?? row.id)}</span><small>${row.eliminated ? `Eliminated · ${duration(row.eliminatedAt)}` : row.status === 'winner' ? (atFinish ? 'Reached the lead deck' : 'Last racer standing') : atFinish ? 'Still in the convoy' : 'Surviving at your cut'}</small></li>`).join('')}</ol><p class="results-note">${atFinish ? 'The lead carrier’s finish ended the race.' : won ? 'Every other racer was cut. You survived every cut.' : 'The last active racer is removed at each cut. The remaining field is shown at the moment of your elimination.'}${result?.playerValid === false ? ' This run is unranked.' : ''}</p><div class="front-actions results-actions"><button class="primary" data-action="change">Race setup →</button><button data-action="retry-race">Retry Eliminator</button></div></section>`;
}

function createExtractionMarks(T, scene) {
  const group = new T.Group();
  group.name = 'Eliminator / extraction marks';
  const geometry = new T.BoxGeometry(1, 1, 1);
  const slots = Array.from({ length: 3 }, () => {
    const root = new T.Group();
    root.visible = false;
    group.add(root);
    const material = new T.MeshBasicMaterial({
      color: '#ffc59a',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    });
    for (const side of [-1, 1]) {
      const column = new T.Mesh(geometry, material);
      column.position.set(side * 3.7, 11, 0);
      column.scale.set(0.12, 22, 0.12);
      root.add(column);
      const rear = new T.Mesh(geometry, material);
      rear.position.set(side * 3.7, 11, 5);
      rear.scale.set(0.08, 22, 0.08);
      root.add(rear);
    }
    for (const height of [2, 10, 18]) {
      const slat = new T.Mesh(geometry, material);
      slat.position.set(0, height, 0);
      slat.scale.set(7.5, 0.06, 0.06);
      root.add(slat);
    }
    return { root, material, at: -Infinity };
  });
  scene.add(group);
  return {
    trigger(position, at) {
      const slot = slots.reduce((oldest, item) =>
        item.at < oldest.at ? item : oldest,
      );
      slot.root.position.fromArray(position);
      slot.root.visible = true;
      slot.at = at;
    },
    update(elapsed, reducedMotion, visible) {
      for (const slot of slots) {
        const phase = Number.isFinite(slot.at)
          ? Math.max(0, Math.min(1, (elapsed - slot.at) / 0.7))
          : 1;
        slot.root.visible = visible && phase < 1;
        slot.material.opacity = 0.6 * Math.max(0, 1 - phase);
        // Extraction is a short upward scan, not a combat blast or death ring.
        slot.root.children.forEach((mesh, index) => {
          if (index >= 4)
            mesh.position.y =
              [2, 10, 18][index - 4] + (reducedMotion ? 0 : phase * 10);
        });
      }
    },
    reset() {
      for (const slot of slots) {
        slot.at = -Infinity;
        slot.root.visible = false;
      }
    },
    dispose() {
      group.removeFromParent();
      geometry.dispose();
      for (const slot of slots) slot.material.dispose();
      group.clear();
    },
  };
}

export function createEliminatorPresentation({
  host,
  scene,
  finishAtCourseEnd = false,
}) {
  const previousEvent = host.dataset.event;
  host.dataset.event = 'eliminator';
  const root = document.createElement('section');
  root.className = 'eliminator-hud hud-card hud-card--fade';
  root.hidden = true;
  root.setAttribute('aria-label', 'Eliminator timing and position');
  root.innerHTML = `<span class="elim-identity">ELIMINATOR${finishAtCourseEnd ? ' / MOVING CONVOY' : ''}</span>
    <div class="elim-countdown"><span>NEXT CUT</span><strong><b>22.0</b><small>s</small></strong></div>
    <div class="elim-cut-rail" aria-hidden="true"><i></i></div>
    <div class="elim-risk"><span>AT RISK</span><b>—</b></div>
    <div class="elim-foot"><strong class="elim-order">1 / 10</strong><span class="elim-last" hidden></span></div>`;
  host.append(root);
  const position = root.querySelector('.elim-order'),
    countdown = root.querySelector('.elim-countdown b'),
    cutRail = root.querySelector('.elim-cut-rail i'),
    risk = root.querySelector('.elim-risk b'),
    last = root.querySelector('.elim-last');
  let disposed = false,
    visuals = null,
    elapsed = 0;
  // Results import this module too. Resolve the already-used Three chunk only
  // when a real session creates its owner, with a late-disposal guard.
  if (scene)
    import('three')
      .then((T) => {
        if (!disposed) visuals = createExtractionMarks(T, scene);
      })
      .catch(() => {});
  return {
    update(frame) {
      if (disposed) return;
      const data = frame.eliminator;
      root.hidden = !data || !['racing', 'countdown'].includes(frame.mode);
      if (!data) {
        visuals?.update(elapsed, true, false);
        return;
      }
      elapsed = data.elapsed;
      position.textContent = `${data.playerPosition} / ${data.remaining}`;
      const remaining = Math.max(0, (data.nextCut ?? elapsed) - elapsed);
      const removed = data.eliminated?.at(-1);
      const cutWindow = Math.max(
        1,
        (data.nextCut ?? elapsed) - (removed?.at ?? 0),
      );
      countdown.textContent = remaining.toFixed(1);
      cutRail.style.transform = `scaleX(${Math.min(1, remaining / cutWindow)})`;
      const danger = data.standings?.find((row) => row.id === data.atRiskId);
      risk.textContent =
        danger?.id === 'player' ? 'YOU' : (danger?.name ?? '—');
      root.dataset.risk = String(data.atRiskId === 'player');
      root.dataset.imminent = String(remaining <= 3);
      last.textContent = removed
        ? `${removed.id === 'player' ? 'YOU' : removed.name} CUT`
        : finishAtCourseEnd
          ? 'Survive the cuts or finish first.'
          : '';
      last.hidden = !last.textContent;
      visuals?.update(elapsed, !!frame.settings?.reducedMotion, !root.hidden);
    },
    trigger(event) {
      if (disposed || event?.type !== 'eliminator-cut' || !event.payload)
        return;
      const point = event.payload.position;
      if (
        Array.isArray(point) &&
        point.length === 3 &&
        point.every(Number.isFinite)
      )
        visuals?.trigger(point, event.payload.elapsed ?? elapsed);
    },
    reset() {
      elapsed = 0;
      root.hidden = true;
      visuals?.reset();
    },
    dispose() {
      disposed = true;
      visuals?.dispose();
      root.remove();
      if (host.dataset.event === 'eliminator') {
        if (previousEvent === undefined) delete host.dataset.event;
        else host.dataset.event = previousEvent;
      }
    },
  };
}
