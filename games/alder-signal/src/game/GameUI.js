import { Vector3 } from 'three';
import { BASE, RELAYS } from './mission.js';
import { pathCenter } from '../world/terrain.js';

const clock = (seconds) =>
  `${Math.floor(Math.ceil(seconds) / 60)}:${String(Math.ceil(seconds) % 60).padStart(2, '0')}`;
const mapPoint = ([x, , z]) => [24 + (x + 8) * 5, 18 + (z + 39) * 2.4];

export class GameUI {
  constructor(mount, actions) {
    this.actions = actions;
    this.root = document.createElement('div');
    this.root.className = 'game-ui';
    this.root.dataset.state = 'menu';
    const path = Array.from({ length: 15 }, (_, i) => {
      const z = -38 + i * 5;
      return mapPoint([pathCenter(z), 0, z]).join(',');
    }).join(' ');
    const stations = [...RELAYS, BASE]
      .map((s, i) => {
        const [x, y] = mapPoint(s.position);
        return `<g data-map-station="${s.id}"><circle cx="${x}" cy="${y}" r="5"/><text x="${x + 10}" y="${y + 4}">${i === 3 ? 'HQ' : `0${i + 1}`}</text></g>`;
      })
      .join('');
    this.root.innerHTML = `
      <header class="mission-header"><div class="wordmark"><span class="emblem">A<span>↟</span></span><div>ALDER SIGNAL<small>FIELD OPERATIONS / 01</small></div></div><div class="mission-readout"><span data-role="phase">RESTORE THE LINE</span><strong data-role="count">00 / 03</strong></div><div class="clock"><span>RADIO WINDOW</span><strong data-role="clock">2:30</strong></div><button class="icon-button" data-action="pause" aria-label="Pause mission">Ⅱ</button></header>
      <div class="crosshair" aria-hidden="true"></div>
      <aside class="route-map" aria-label="Survey route map"><div class="map-title"><span>ALDER VALE</span><span>N ↑</span></div><svg viewBox="0 0 175 205" role="img" aria-label="Route and your position"><path class="map-contour" d="M15 188 Q110 164 112 87 T156 10 M2 159 Q89 150 91 83 T146 0 M4 119 Q47 132 67 71 T125 7 M160 203 Q137 114 167 59"/><polyline class="map-trail" points="${path}"/>${stations}<g data-role="map-player"><circle r="7"/><path d="M0 -6 L4 4 L0 2 L-4 4 Z"/></g></svg><div class="map-legend"><i></i> YOU <span>—— SURVEY TRAIL</span></div></aside>
      <section class="navigation" aria-label="Current objective"><div class="nav-eyebrow"><span data-role="stage">STATION 01</span><span data-role="bearing">NORTH</span></div><div class="nav-main"><span class="bearing-arrow" data-role="arrow">↑</span><div><strong data-role="target">Creek relay</strong><p data-role="distance">Follow the amber markers</p></div></div></section>
      <section class="interaction" aria-live="polite"><div class="interaction-line"><kbd>E</kbd><span data-role="prompt">Hold to restore uplink</span><strong data-role="progress-label"></strong></div><div class="progress-track"><div data-role="progress"></div></div></section>
      <div class="field-notice" data-role="notice" aria-live="polite"></div>
      <footer class="controls"><span><kbd>WASD</kbd> WALK</span><span><kbd>SHIFT</kbd> JOG</span><span data-role="look">MOUSE LOOK / DRAG</span><span><kbd>P / ESC</kbd> PAUSE</span></footer>
      <div class="overlay"><section class="mission-card" role="dialog" aria-labelledby="card-title"><p class="eyebrow" data-role="card-eyebrow">ALDER SURVEY / MORNING SHIFT</p><h1 id="card-title">Bring the<br><em>forest online.</em></h1><p class="card-copy" data-role="card-copy">Three survey relays have gone quiet. Restore the line, then carry the signal home before the radio window closes.</p><div class="brief-stats" data-role="brief-stats"><span><b>03</b> FIELD RELAYS</span><span><b>150<span>s</span></b> RADIO WINDOW</span><span><b>01</b> RETURN TRIP</span></div><ol class="brief-steps" data-role="brief-steps"><li><span>01</span> Follow the trail and amber markers.</li><li><span>02</span> Hold <kbd>E</kbd> near each relay to restore it.</li><li><span>03</span> Return to the trailhead radio and upload.</li></ol><p class="pause-reason" data-role="pause-reason"></p><div class="card-actions"><button class="primary" data-role="primary" data-action="start">Begin field mission <span>↗</span></button><button class="text-button" data-action="mute">Sound on</button><button class="text-button" data-role="restart" hidden>Restart mission</button></div><p class="desktop-guidance" data-role="desktop-guidance">DESKTOP / KEYBOARD + MOUSE<br><span>WASD walk · Shift jog · Mouse or drag to look · P / Esc pause</span></p><div class="graphics" data-role="graphics"><div class="graphics-title">FIELD SETTINGS <span>Changes apply immediately</span></div><label>Render quality<select data-setting="quality"><option value="balanced">Balanced</option><option value="high">High</option><option value="ultra">Ultra</option></select></label>${['sunlight', 'atmosphere', 'richness', 'exposure'].map((name) => `<label>${{ sunlight: 'Sunlight', atmosphere: 'Atmosphere', richness: 'Ground cover', exposure: 'Exposure' }[name]}<input data-setting="${name}" aria-label="${name}" type="range" min="0.4" max="1.6" step="0.05" value="1"/></label>`).join('')}</div></section><aside class="scene-caption"><span>46° 52′ N / 121° 45′ W</span><strong>Alder Vale</strong><p>Early light. One last connection.</p></aside></div>`;
    mount.append(this.root);
    this.nodes = Object.fromEntries(
      [...this.root.querySelectorAll('[data-role]')].map((node) => [
        node.dataset.role,
        node,
      ]),
    );
    this.forward = new Vector3();
    this.abort = new AbortController();
    this.root.addEventListener(
      'click',
      (event) => {
        const button = event.target.closest('[data-action]');
        if (button) this.actions[button.dataset.action]?.();
      },
      { signal: this.abort.signal },
    );
    this.root.addEventListener(
      'input',
      (event) => {
        const key = event.target.dataset.setting;
        if (key)
          actions.settings({
            [key]:
              key === 'quality'
                ? event.target.value
                : Number(event.target.value),
          });
      },
      { signal: this.abort.signal },
    );
  }
  configure(settings) {
    for (const element of this.root.querySelectorAll('[data-setting]'))
      element.value = settings[element.dataset.setting];
  }
  text(name, value) {
    if (this.nodes[name].textContent !== value)
      this.nodes[name].textContent = value;
  }
  update(snapshot, camera, audio, controls, notice) {
    const { state, restored, target, remainingSeconds, interactionProgress } =
      snapshot;
    if (this.root.dataset.state !== state || this.lastState === undefined) {
      this.root.dataset.state = state;
      this.lastState = state;
      this.updateCard(snapshot);
    }
    this.text('clock', clock(remainingSeconds));
    this.root.classList.toggle('urgent', remainingSeconds <= 30);
    this.text('count', `${String(restored.length).padStart(2, '0')} / 03`);
    this.text(
      'phase',
      restored.length === 3 ? 'RETURN TO TRAILHEAD' : 'RESTORE THE LINE',
    );
    this.root.querySelector('[data-action="mute"]').textContent = audio.muted
      ? 'Sound off'
      : 'Sound on';
    this.root
      .querySelector('[data-action="mute"]')
      .setAttribute('aria-pressed', String(audio.muted));
    this.text('notice', notice);
    this.text('look', controls.locked ? 'MOUSE LOOK' : 'DRAG TO LOOK');
    const pos = camera.position.toArray();
    const [x, y] = mapPoint(pos);
    camera.getWorldDirection(this.forward);
    const heading = Math.atan2(this.forward.x, -this.forward.z);
    this.nodes['map-player'].setAttribute(
      'transform',
      `translate(${x} ${y}) rotate(${(heading * 180) / Math.PI})`,
    );
    for (const point of this.root.querySelectorAll('[data-map-station]')) {
      point.classList.toggle(
        'current',
        point.dataset.mapStation === target?.id,
      );
      point.classList.toggle(
        'complete',
        restored.includes(point.dataset.mapStation),
      );
    }
    if (target) {
      const bearing = Math.atan2(
        target.position[0] - pos[0],
        -(target.position[2] - pos[2]),
      );
      this.text(
        'stage',
        target.id === 'base'
          ? 'FINAL UPLINK'
          : `STATION 0${restored.length + 1}`,
      );
      this.text('target', target.label);
      this.text(
        'distance',
        `${Math.round(target.distance)} m · ${target.id === 'base' ? 'Return along the survey trail' : 'Follow the amber markers'}`,
      );
      this.text(
        'bearing',
        ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][
          Math.round((((bearing * 180) / Math.PI + 360) % 360) / 45) % 8
        ],
      );
      this.nodes.arrow.style.transform = `rotate(${((bearing - heading) * 180) / Math.PI}deg)`;
      this.root.classList.toggle('can-interact', snapshot.nearTarget);
      this.text(
        'prompt',
        target.id === 'base'
          ? 'Hold to upload the field report'
          : 'Hold to restore uplink',
      );
      this.nodes.progress.style.width = `${interactionProgress * 100}%`;
      this.text(
        'progress-label',
        interactionProgress > 0
          ? `${Math.round(interactionProgress * 100)}%`
          : '',
      );
    }
  }
  updateCard(snapshot) {
    const { state } = snapshot;
    const primary = this.nodes.primary;
    const menu = state === 'menu',
      paused = state === 'paused';
    this.nodes['brief-stats'].hidden = !menu;
    this.nodes['brief-steps'].hidden = !menu;
    this.nodes.graphics.hidden = !paused;
    this.nodes['pause-reason'].hidden = !paused;
    this.nodes.restart.hidden = !paused;
    if (paused) this.nodes.restart.dataset.action = 'restart';
    else delete this.nodes.restart.dataset.action;
    this.text('pause-reason', snapshot.pauseReason);
    if (menu) {
      this.text('card-eyebrow', 'ALDER SURVEY / MORNING SHIFT');
      primary.dataset.action = 'start';
      primary.innerHTML = 'Begin field mission <span>↗</span>';
    } else if (paused) {
      this.text('card-eyebrow', 'FIELD OPERATIONS / ON HOLD');
      this.root.querySelector('h1').innerHTML = 'Take a<br><em>breath.</em>';
      this.text(
        'card-copy',
        'Your radio window is on hold. Resume when you’re ready to head back into the grove.',
      );
      primary.dataset.action = 'resume';
      primary.innerHTML = 'Resume mission <span>↗</span>';
    } else if (state === 'won') {
      this.text('card-eyebrow', 'FIELD REPORT / TRANSMISSION RECEIVED');
      this.root.querySelector('h1').innerHTML = 'Signal<br><em>restored.</em>';
      this.text(
        'card-copy',
        `All three relays are online. Field report received with ${clock(snapshot.remainingSeconds)} left in the radio window. The valley is listening again.`,
      );
      primary.dataset.action = 'restart';
      primary.innerHTML = 'Run another shift <span>↗</span>';
    } else if (state === 'lost') {
      this.text('card-eyebrow', 'FIELD REPORT / WINDOW CLOSED');
      this.root.querySelector('h1').innerHTML =
        'The line<br><em>went quiet.</em>';
      this.text(
        'card-copy',
        `${snapshot.restored.length} of 3 relays restored. The radio window has closed. Start a fresh shift and follow the amber markers home.`,
      );
      primary.dataset.action = 'restart';
      primary.innerHTML = 'Try another shift <span>↗</span>';
    }
  }
  dispose() {
    this.abort.abort();
    this.root.remove();
  }
}
