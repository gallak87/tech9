import {
  halcyonGraphicsControls,
  vesperGraphicsControls,
} from './graphics-settings.js';
export function createDevTools(root, actions, settings, metadata) {
  const $ = (id) => root.querySelector('#' + id);
  const flyControls = document.createElement('section');
  flyControls.id = 'fly-controls';
  flyControls.className = 'hidden';
  flyControls.setAttribute('aria-label', 'Free camera controls');
  flyControls.innerHTML = `<div class="fly-heading"><b>FREE CAMERA <small>SESSION PAUSED</small></b><button id="fly-return">RETURN · F / ESC</button></div><p>Drag to look · WASD / arrows move · Q / E down / up</p><div class="fly-touch"><button data-fly="KeyA" aria-label="Fly left">←</button><button data-fly="KeyW" aria-label="Fly forward">FORWARD</button><button data-fly="KeyD" aria-label="Fly right">→</button><button data-fly="KeyQ" aria-label="Fly down">DOWN</button><button data-fly="KeyS" aria-label="Fly backward">BACK</button><button data-fly="KeyE" aria-label="Fly up">UP</button></div>`;
  root.append(flyControls);
  $('fly-return').onclick = actions.leaveFly;
  const flySettingsButton = document.createElement('button');
  flySettingsButton.id = 'fly-settings-toggle';
  flySettingsButton.textContent = 'DEV TOOLS · P';
  flySettingsButton.setAttribute('aria-expanded', 'false');
  flySettingsButton.setAttribute('aria-controls', 'fly-settings');
  flyControls
    .querySelector('.fly-heading')
    .insertBefore(flySettingsButton, $('fly-return'));
  const flySettings = document.createElement('section');
  flySettings.id = 'fly-settings';
  flySettings.className = 'hidden';
  flySettings.dataset.flySettings = '';
  flySettings.setAttribute('aria-label', 'Free camera dev tools');
  flySettings.innerHTML = `<div class="fly-heading"><b>DEV TOOLS</b><button id="fly-settings-close" aria-label="Close dev tools">CLOSE · ESC</button></div><dl class="dev-metrics"><div><dt>FPS</dt><dd id="dev-fps">—</dd></div><div><dt>Frame avg</dt><dd id="dev-frame-ms">—</dd></div><div><dt>Draw calls</dt><dd id="dev-calls">—</dd></div><div><dt>Triangles</dt><dd id="dev-triangles">—</dd></div></dl><label><span>Graphics</span><select data-setting="quality"><option value="high">High</option><option value="low">Low</option></select></label><label><span>Reduced motion</span><input type="checkbox" data-setting="reducedMotion"></label>${['vesper', 'vesper-forest'].includes(metadata.id) ? vesperGraphicsControls(settings) : metadata.id === 'halcyon' ? halcyonGraphicsControls(settings) : ''}<p>Changes apply live and are saved on this device. Frame averages refresh every half second; draw counts include render passes.</p>`;
  root.append(flySettings);
  const viewLink = document.createElement('div');
  viewLink.className = 'dev-view-link';
  viewLink.innerHTML =
    '<button id="copy-art-view">COPY VIEW LINK</button><p id="art-view-status" role="status">Reopen this camera position in a silent art pass.</p><input id="art-view-url" type="text" readonly aria-label="Art pass view URL" hidden>';
  flySettings.querySelector('.dev-metrics').after(viewLink);
  $('copy-art-view').onclick = async () => {
    const url = actions.artPassURL();
    $('art-view-url').value = url;
    try {
      await navigator.clipboard.writeText(url);
      $('art-view-status').textContent = 'View link copied.';
      $('art-view-url').hidden = true;
    } catch {
      $('art-view-url').hidden = false;
      $('art-view-url').select();
      $('art-view-status').textContent = 'Copy the selected view link.';
    }
  };
  let perfLast = null,
    perfElapsed = 0,
    perfFrames = 0;
  function closeFlySettings(restoreFocus = true) {
    const open = !flySettings.classList.contains('hidden');
    flySettings.classList.add('hidden');
    flySettingsButton.setAttribute('aria-expanded', 'false');
    if (open && restoreFocus) flySettingsButton.focus();
    return open;
  }
  function openFlySettings() {
    if (!flySettings.classList.contains('hidden')) return;
    flySettings.classList.remove('hidden');
    perfLast = null;
    perfElapsed = perfFrames = 0;
    $('dev-fps').textContent = $('dev-frame-ms').textContent = '—';
    flySettingsButton.setAttribute('aria-expanded', 'true');
    $('fly-settings-close').focus();
  }
  function toggleFlySettings() {
    if (!closeFlySettings()) openFlySettings();
  }
  flySettingsButton.onclick = toggleFlySettings;
  $('fly-settings-close').onclick = () => closeFlySettings();
  return {
    openFlySettings,
    toggleFlySettings,
    closeFlySettings,
    updateDevTools(now, info) {
      if (flySettings.classList.contains('hidden') || document.hidden) {
        perfLast = null;
        perfElapsed = perfFrames = 0;
        return;
      }
      if (perfLast !== null) {
        perfElapsed += now - perfLast;
        perfFrames++;
      }
      perfLast = now;
      if (perfElapsed < 500) return;
      $('dev-fps').textContent = ((1000 * perfFrames) / perfElapsed).toFixed(1);
      $('dev-frame-ms').textContent =
        `${(perfElapsed / perfFrames).toFixed(1)} ms`;
      $('dev-calls').textContent = info.calls.toLocaleString();
      $('dev-triangles').textContent = info.triangles.toLocaleString();
      perfElapsed = perfFrames = 0;
    },
  };
}
