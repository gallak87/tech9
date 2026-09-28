import './style.css';
export function createUI(host, actions, settings, track) {
  const root = document.createElement('main');
  root.id = 'interface';
  host.append(root);
  root.innerHTML = `<header class="masthead"><a class="wordmark" href="#" aria-label="Vector Nova home">VECTOR<span>//</span>NOVA</a><div class="edition"><i></i> PROVING GROUND <span>GATE 02 / FIRST LEVEL</span></div><button class="quiet" id="pause-button" aria-label="Pause">Ⅱ</button></header>
 <section id="title-panel" class="panel"><div class="eyebrow">HALCYON INFRASTRUCTURE AUTHORITY · TEST 001</div><h1>FIND YOUR<br><em>LIMIT.</em></h1><p class="intro">Above the city. On the edge.<br>Take the Kestrel through Halcyon’s elevated proving loop.</p><div class="track-facts"><div><b>${(track.length / 1000).toFixed(2)}</b><span>KM CIRCUIT</span></div><div><b>01</b><span>PROTOTYPE</span></div><div><b>∞</b><span>PRACTICE LAPS</span></div></div><div class="actions"><button id="start" class="primary">ENTER PROVING LOOP <span>↗</span></button><button id="inspect">INSPECT KESTREL <span>↗</span></button></div><p class="small">Halcyon Viaduct · First-level development review.<br>Core handling and city environment under review.</p></section>
 <section id="inspection-panel" class="panel hidden"><div class="eyebrow">AERODYNAMICS DIVISION / 07</div><h1 class="inspect-title">KESTREL<span class="dot">.</span></h1><p class="intro">Twin-core magnetic interceptor.<br>Ceramic armour. Exposed titanium propulsion.<br>Built to stay close to the limit.</p><dl><div><dt>DESIGN</dt><dd>Split prow / compact chassis</dd></div><div><dt>PROPULSION</dt><dd>Dual induction turbines</dd></div><div><dt>CONTROL</dt><dd>Four articulated levitation shoes</dd></div></dl><div class="actions"><button id="inspect-start" class="primary">DRIVE PROTOTYPE <span>↗</span></button><button id="inspect-back">BACK TO PROVING GROUND</button></div><p class="small">Actual in-game asset · Neutral inspection lighting</p></section>
 <section id="pause-panel" class="modal hidden"><div class="eyebrow">PROVING SESSION</div><h2>TAKE A BREATH.</h2><button id="resume" class="primary">RESUME SESSION ↗</button><button id="restart">RESTART LAP</button><button id="home">RETURN TO PADDOCK</button><label>MASTER VOLUME <input id="volume" type="range" min="0" max="1" step=".05" value="${settings.volume}"></label><label>GRAPHICS <select id="quality"><option value="high">High</option><option value="low">Low</option></select></label><label>REDUCED MOTION <input id="motion" type="checkbox" ${settings.reducedMotion ? 'checked' : ''}></label><p class="small">Prototype settings are saved locally when available.</p></section>
 <section id="hud" class="hidden"><div class="top-telemetry"><div class="lap"><span>PRACTICE LAP</span><b id="lap">01</b></div><div class="timing"><span>SESSION TIME</span><b id="time">00:00.000</b><small id="best">SET YOUR FIRST CLEAN LAP</small></div><div class="section-name"><span>HALCYON VIADUCT</span><b id="section">PROVING STRAIGHT</b></div></div><div class="telemetry"><div class="energy"><span>CORE RESERVE <b id="energy-label">100%</b></span><div class="energy-track"><i id="energy-fill"></i></div><small id="energy-state">BOOST DRAWS FROM IMPACT RESERVE</small></div><div class="speed"><strong id="speed">000</strong><span>KM/H</span><i id="boost-status">MAGNETIC DRIVE</i></div></div><canvas id="minimap" width="200" height="150" aria-label="Track map"></canvas><div id="notice" role="status"></div></section>
 <footer id="legend"><div><kbd>W</kbd><kbd>↑</kbd><span>THROTTLE</span></div><div><kbd>A</kbd><kbd>D</kbd><span>STEER</span></div><div><kbd>S</kbd><span>BRAKE</span></div><div><kbd>SPACE</kbd><span>AIRBRAKE</span></div><div><kbd>SHIFT</kbd><span>BOOST</span></div><div><kbd>R</kbd><span>RESET</span></div><div><kbd>ESC</kbd><span>PAUSE</span></div></footer>
 <div id="touch" class="hidden"><div><button data-drive="left" aria-label="Steer left">◀</button><button data-drive="right" aria-label="Steer right">▶</button><button data-drive="brake">BRAKE</button></div><div><button data-drive="airbrake">SLIP</button><button data-drive="boost">BOOST</button><button data-drive="throttle">GO</button></div></div><div class="review-tag">FIRST LEVEL <span>02 / HALCYON</span></div>`;
  const $ = (id) => root.querySelector('#' + id);
  const bind = (id, fn) => ($(id).onclick = fn);
  bind('start', actions.start);
  bind('inspect-start', actions.start);
  bind('inspect', () => actions.camera('inspection'));
  bind('inspect-back', actions.home);
  bind('resume', actions.resume);
  bind('restart', actions.restart);
  bind('home', actions.home);
  bind('pause-button', actions.pause);
  root.querySelector('.wordmark').onclick = (e) => {
    e.preventDefault();
    actions.home();
  };
  $('quality').value = settings.quality;
  for (const id of ['volume', 'quality', 'motion'])
    $(id).onchange = () => {
      settings.volume = +$('volume').value;
      settings.quality = $('quality').value;
      settings.reducedMotion = $('motion').checked;
      actions.settings();
    };
  const ctx = $('minimap').getContext('2d');
  const points = [];
  for (let s = 0; s < track.length; s += track.length / 180)
    points.push(track.sample(s).position);
  const xs = points.map((p) => p.x),
    zs = points.map((p) => p.z),
    minX = Math.min(...xs),
    minZ = Math.min(...zs),
    scale = Math.min(
      170 / (Math.max(...xs) - minX),
      120 / (Math.max(...zs) - minZ),
    );
  const coord = (p) => [15 + (p.x - minX) * scale, 15 + (p.z - minZ) * scale];
  let oldMode = '',
    noticeUntil = 0;
  const fmt = (t) =>
    `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(3).padStart(6, '0')}`;
  return {
    root,
    setMode(mode) {
      if (mode === oldMode) return;
      oldMode = mode;
      for (const [id, show] of [
        ['title-panel', mode === 'title'],
        ['inspection-panel', mode === 'inspection'],
        ['pause-panel', mode === 'paused'],
        ['hud', mode === 'racing' || mode === 'paused'],
        ['touch', mode === 'racing'],
      ])
        $(id).classList.toggle('hidden', !show);
      root.classList.toggle('driving', mode === 'racing' || mode === 'paused');
      $('pause-button').classList.toggle('hidden', mode !== 'racing');
      const f =
        mode === 'title'
          ? 'start'
          : mode === 'inspection'
            ? 'inspect-start'
            : mode === 'paused'
              ? 'resume'
              : null;
      if (f) $(f).focus({ preventScroll: true });
      else document.activeElement?.blur();
    },
    update(s, r) {
      $('speed').textContent = String(Math.round(s.speed * 3.6)).padStart(
        3,
        '0',
      );
      $('time').textContent = fmt(r.elapsed);
      $('lap').textContent = String(r.lap).padStart(2, '0');
      $('energy-label').textContent = `${Math.round(s.energy)}%`;
      $('energy-fill').style.width = `${s.energy}%`;
      $('energy-fill').style.background = s.energy < 25 ? '#ef764e' : '#a9d0c9';
      $('boost-status').textContent = s.boosting
        ? 'BOOST ENGAGED'
        : 'MAGNETIC DRIVE';
      $('boost-status').classList.toggle('active', s.boosting);
      $('energy-state').textContent =
        s.energy < 25
          ? 'LOW RESERVE · RELEASE BOOST TO RECOVER'
          : 'BOOST DRAWS FROM IMPACT RESERVE';
      $('best').textContent = !r.valid
        ? 'LAP INVALIDATED · RESET'
        : r.best
          ? `BEST ${fmt(r.best)}`
          : 'SET YOUR FIRST CLEAN LAP';
      const pos = ((s.distance % track.length) + track.length) % track.length;
      const section = track.sections?.find(
        (a) => pos >= a.start && pos < a.end,
      );
      $('section').textContent = section?.name || 'PROVING LOOP';
      ctx.clearRect(0, 0, 200, 150);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#dbe8e1cc';
      ctx.beginPath();
      points.forEach((p, i) => {
        const [x, y] = coord(p);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
      const [x, y] = coord(track.sample(s.distance).position);
      ctx.fillStyle = '#fb7959';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      if (performance.now() > noticeUntil) $('notice').textContent = '';
    },
    notice(text) {
      $('notice').textContent = text;
      noticeUntil = performance.now() + 2200;
    },
    dispose() {
      root.remove();
    },
  };
}
