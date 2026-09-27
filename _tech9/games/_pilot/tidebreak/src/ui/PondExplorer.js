/** Neutral exploration UI. No mission, fishing state, equipment or progress rules. */
export class PondExplorer {
  id = 'pond-explorer';
  constructor(app) {
    this.app = app;
    this.state = 'menu';
  }
  init({ ui }) {
    this.root = document.createElement('div');
    this.root.className = 'explorer';
    this.root.innerHTML = `<header><div><strong>STILLWATER POND</strong><small>SCENE STUDY / 01</small></div><div class="header-actions"><button data-action="lock">Capture mouse</button><button data-action="pause">Pause</button></div></header><div class="reticle" aria-hidden="true"></div><footer>WASD walk · Shift jog · Right-drag or IJKL look · P / Esc pause</footer><div class="shade"><section class="panel"><span class="eyebrow">POND EXPLORATION</span><h1>Walk the shore.</h1><p data-role="description">A quiet place to test grounded movement, shore boundaries and reflective water. Follow the dry bank around the pond.</p><p class="note">Desktop keyboard + mouse. Trees and authored bank rocks are solid; small ground cover and scattered pebbles are decorative.</p><div class="actions"><button class="primary" data-action="start">Begin exploring</button><button data-action="resume" hidden>Resume walk</button><button data-action="reset" hidden>Restart at south bank</button></div><div class="settings"><h2>Scene settings</h2><label>Render quality<select data-setting="quality"><option value="balanced">Balanced</option><option value="high">High</option><option value="ultra">Ultra</option></select></label>${['sunlight', 'atmosphere', 'richness', 'exposure'].map((name) => `<label>${{ sunlight: 'Sunlight', atmosphere: 'Atmosphere', richness: 'Ground cover', exposure: 'Exposure' }[name]}<input type="range" data-setting="${name}" aria-label="${name}" min="0.4" max="1.6" step="0.05" value="1"/></label>`).join('')}</div><small class="limits">Fixed 160 × 160 m landscape · Approximate collision proxies · Planar water reflections</small></section></div>`;
    ui.append(this.root);
    this.abort = new AbortController();
    this.root.addEventListener(
      'click',
      (event) => {
        const action = event.target.closest('[data-action]')?.dataset.action;
        if (action === 'start' || action === 'resume') this.resume();
        else if (action === 'pause') this.pause();
        else if (action === 'reset') this.reset();
        else if (action === 'lock') this.app.controls.lock();
      },
      { signal: this.abort.signal },
    );
    this.root.addEventListener(
      'input',
      (event) => {
        const key = event.target.dataset.setting;
        if (key)
          this.app.setSettings({
            [key]:
              key === 'quality'
                ? event.target.value
                : Number(event.target.value),
          });
      },
      { signal: this.abort.signal },
    );
    this.render();
  }
  resume() {
    this.state = 'exploring';
    this.app.controls.setEnabled(true);
    this.app.canvas.focus();
    this.render();
  }
  pause() {
    if (this.state !== 'exploring') return;
    this.state = 'paused';
    this.app.controls.setEnabled(false);
    this.render();
  }
  reset() {
    this.app.setView('trail');
    this.resume();
  }
  render() {
    if (!this.root) return;
    this.root.dataset.state = this.state;
    this.root.querySelector('h1').textContent =
      this.state === 'paused' ? 'A moment on the bank.' : 'Walk the shore.';
    this.root.querySelector('[data-action=start]').hidden =
      this.state !== 'menu';
    for (const name of ['resume', 'reset'])
      this.root.querySelector(`[data-action=${name}]`).hidden =
        this.state !== 'paused';
  }
  configure(settings) {
    for (const control of this.root?.querySelectorAll('[data-setting]') ?? [])
      control.value = settings[control.dataset.setting];
  }
  snapshot() {
    return { state: this.state, controller: this.app.controls.snapshot() };
  }
  dispose() {
    this.abort?.abort();
    this.root?.remove();
  }
}
