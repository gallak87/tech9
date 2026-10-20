import * as T from 'three';
import { createLifetime } from '../core/lifecycle.js';
import { createShipControls, inspectionPanel } from '../ui/ship-controls.js';
import { createFleetShip } from './fleet.js';
import { getShip, saveShipSelection } from './catalog.js';
import { createRivalPreview, RIVAL_SHIPS } from './rivals.js';
import { configureShipTextures } from './texture-loader.js';
import { createInspectionStage } from './inspection-stage.js';
import { createInspectionPipeline } from './inspection-pipeline.js';

const START_ROTATION = -Math.PI * 0.6;
const START_ELEVATION = 0.38;

// A standalone studio: ships, lighting and preview controls only. Never import
// the game factory, a level implementation, physics, or race audio here.
// Dev pickup auditions are lazy-loaded and own their presentation/audio.
export async function createInspector({
  host,
  shipId,
  settings,
  signal,
  onProgress,
  onBack,
}) {
  const lifetime = createLifetime();
  const listeners = new AbortController();
  let disposed = false,
    frame = 0,
    fleet,
    rival,
    pickupTools,
    ui,
    api;
  let tab = 'fleet',
    rivalId = RIVAL_SHIPS[0].id,
    request = 0;
  let loading = false,
    rivalLoading = false,
    rotation = START_ROTATION,
    time = 0,
    drag = null;
  const preview = {
    autoRotate: false,
    boost: false,
    driving: false,
    elevation: START_ELEVATION,
  };
  const extent = { radial: 1, vertical: 1 };
  const framingCenter = new T.Vector3();
  const focusOffset = new T.Vector3();
  let layout = null;
  let pairedPreview = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (api) api.ready = false;
    request++;
    cancelAnimationFrame(frame);
    listeners.abort();
    pickupTools?.dispose();
    rival?.dispose();
    fleet?.dispose();
    if (window.__VN_INSPECTOR === api) delete window.__VN_INSPECTOR;
    lifetime.dispose();
  };
  const check = () => {
    signal.throwIfAborted();
    if (disposed) throw new DOMException('Cancelled', 'AbortError');
  };
  const progress = async (label) => {
    check();
    onProgress(label);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    check();
  };
  signal.addEventListener('abort', dispose, { once: true });
  lifetime.defer(() => signal.removeEventListener('abort', dispose));
  try {
    await progress('Preparing studio');
    const renderer = lifetime.own(new T.WebGLRenderer({ antialias: true }));
    lifetime.defer(() => renderer.forceContextLoss());
    lifetime.defer(() => renderer.domElement.remove());
    configureShipTextures(renderer);
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.type = T.PCFShadowMap;
    const canvas = renderer.domElement;
    canvas.id = 'world';
    canvas.tabIndex = 0;
    canvas.setAttribute(
      'aria-label',
      'Ship inspector. Drag or use arrow keys to rotate; Home resets the view.',
    );
    host.append(canvas);
    const stage = lifetime.own(createInspectionStage(renderer));
    const camera = new T.PerspectiveCamera(39, 1, 0.1, 200);
    const pipeline = lifetime.own(
      createInspectionPipeline(renderer, stage.scene, camera),
    );
    const root = document.createElement('main');
    root.id = 'interface';
    root.className = 'inspecting';
    root.innerHTML = `<header class="masthead"><a class="wordmark" href="#" aria-label="Back to race setup">VECTOR<span>//</span>NOVA</a></header>${inspectionPanel}`;
    root.querySelector('#inspection-panel').classList.remove('hidden');
    host.append(root);
    lifetime.defer(() => root.remove());
    root.querySelector('.wordmark').onclick = (event) => {
      event.preventDefault();
      onBack();
    };
    root.querySelector('#inspect-back').onclick = onBack;
    ui = createShipControls(
      root,
      {
        selectShip,
        inspectRival,
        selectInspectionTab,
        toggleInspectionPreview(key) {
          if (tab === 'rivals' && key !== 'autoRotate') return;
          preview[key] = !preview[key];
          ui.setInspectionPreview(preview);
          pickupTools?.previewChanged();
        },
      },
      getShip(shipId),
    );
    ui.setInspectionMenu(true);
    ui.setInspectionPreview(preview);

    function fit(group) {
      const devBounds = pickupTools?.framing(group.userData.bounds);
      pairedPreview = !!devBounds;
      const bounds = devBounds ?? group.userData.bounds;
      framingCenter.set(
        devBounds ? (bounds.min[0] + bounds.max[0]) / 2 : 0,
        0,
        devBounds ? (bounds.min[2] + bounds.max[2]) / 2 : 0,
      );
      extent.radial = Math.hypot(
        Math.max(
          Math.abs(bounds.min[0] - framingCenter.x),
          Math.abs(bounds.max[0] - framingCenter.x),
        ),
        Math.max(
          Math.abs(bounds.min[2] - framingCenter.z),
          Math.abs(bounds.max[2] - framingCenter.z),
        ),
      );
      extent.vertical = Math.max(
        Math.abs(bounds.min[1] - 0.55),
        Math.abs(bounds.max[1] - 0.55),
      );
      rotation = START_ROTATION;
      layout = null;
    }
    async function selectShip(id) {
      if (disposed || loading || tab !== 'fleet') return false;
      loading = true;
      pickupTools?.setShip(null);
      ui.shipError('');
      ui.setShipLoading(true);
      try {
        if (!(await fleet.select(id)) || disposed) return false;
        fit(fleet.group);
        ui.setShip(fleet.selected);
        saveShipSelection(fleet.selected.id);
        await renderer.compileAsync(stage.scene, camera);
        return !disposed;
      } catch (error) {
        if (!disposed) ui.shipError(`Could not load ship. ${error.message}`);
        return false;
      } finally {
        loading = false;
        if (!disposed) {
          ui.setShipLoading(false);
          pickupTools?.setShip(fleet.group);
        }
      }
    }
    async function inspectRival(id) {
      const craft = RIVAL_SHIPS.find((entry) => entry.id === id);
      if (disposed || tab !== 'rivals' || !craft) return false;
      const token = ++request;
      rivalLoading = true;
      pickupTools?.setShip(null);
      ui.shipError('');
      ui.setRivalLoading(true);
      let loaded;
      try {
        loaded = await createRivalPreview(id);
        if (disposed || token !== request) {
          loaded.dispose();
          return false;
        }
        await renderer.compileAsync(loaded.group, camera, stage.scene);
        if (disposed || token !== request) {
          loaded.dispose();
          return false;
        }
        rival?.dispose();
        rival = loaded;
        rivalId = id;
        stage.scene.add(loaded.group);
        fit(loaded.group);
        ui.setInspectedRival(craft);
        return true;
      } catch {
        loaded?.dispose();
        if (!disposed && token === request)
          ui.shipError(
            `Could not load ${craft.name}. Choose a racer to retry.`,
          );
        return false;
      } finally {
        if (!disposed && token === request) {
          rivalLoading = false;
          ui.setRivalLoading(false);
          pickupTools?.setShip(rival?.group);
        }
      }
    }
    function selectInspectionTab(next) {
      if (
        disposed ||
        loading ||
        tab === next ||
        !['fleet', 'rivals'].includes(next)
      )
        return;
      tab = next;
      request++;
      rivalLoading = false;
      ui.setRivalLoading(false);
      pickupTools?.setShip(null);
      rival?.dispose();
      rival = null;
      fleet.group.visible = tab === 'fleet';
      pickupTools?.setShip(tab === 'fleet' ? fleet.group : null);
      ui.setInspectionTab(tab);
      layout = null;
      if (tab === 'fleet') fit(fleet.group);
      else void inspectRival(rivalId);
    }
    function draw(dt) {
      time += dt;
      if (preview.autoRotate && !settings.reducedMotion) rotation += dt * 0.12;
      const subject = tab === 'fleet' ? fleet?.group : rival?.group;
      subject?.position.set(0, 0.15, 0);
      subject?.rotation.set(0, rotation, 0);
      if (tab === 'fleet')
        fleet?.update({
          speed: preview.driving ? 400 / 3.6 : 0,
          boost: preview.boost,
          steer: 0,
          time,
          energy: 1,
          reducedMotion: settings.reducedMotion,
        });
      pickupTools?.update(dt);
      const size = `${innerWidth}x${innerHeight}@${settings.quality}`;
      if (layout?.size !== size) {
        renderer.setPixelRatio(
          Math.min(devicePixelRatio, settings.quality === 'low' ? 1 : 1.5),
        );
        renderer.setSize(innerWidth, innerHeight);
        let viewport = ui.inspectionViewport();
        if (!viewport && pairedPreview) {
          const panel = root
            .querySelector('#inspection-panel')
            .getBoundingClientRect();
          const tools = root
            .querySelector('#inspection-tools')
            .getBoundingClientRect();
          const left = Math.max(panel.right + 16, innerWidth * 0.5);
          const top = innerHeight * 0.2;
          viewport = {
            left,
            top,
            width: Math.max(120, innerWidth - left - innerWidth * 0.04),
            height: Math.max(120, tools.top - top - 20),
          };
        }
        layout = { size, viewport };
      }
      const viewport = layout.viewport;
      camera.position.setFromSphericalCoords(
        17.4,
        Math.PI / 2 - preview.elevation,
        Math.atan2(10.4, 12.5),
      );
      camera.aspect = innerWidth / innerHeight;
      focusOffset.copy(framingCenter);
      if (subject) focusOffset.applyQuaternion(subject.quaternion);
      const target = new T.Vector3(0, viewport ? 0.7 : 0.3, 0).add(focusOffset);
      if (viewport) {
        camera.position.normalize();
        const sinPitch = camera.position.y;
        const cosPitch = Math.hypot(camera.position.x, camera.position.z);
        const depth = extent.radial * cosPitch + extent.vertical * sinPitch;
        const height = extent.radial * sinPitch + extent.vertical * cosPitch;
        const projection =
          innerHeight / Math.tan(T.MathUtils.degToRad(camera.fov / 2));
        const distance =
          depth +
          1.08 *
            projection *
            Math.max(extent.radial / viewport.width, height / viewport.height);
        camera.position
          .multiplyScalar(distance * (pairedPreview ? 0.8 : 1))
          .add(target);
      } else camera.position.add(focusOffset);
      camera.setViewOffset(
        innerWidth,
        innerHeight,
        viewport
          ? innerWidth / 2 - (viewport.left + viewport.width / 2)
          : -innerWidth * 0.15,
        viewport ? innerHeight / 2 - (viewport.top + viewport.height / 2) : 0,
        innerWidth,
        innerHeight,
      );
      camera.lookAt(target);
      camera.updateProjectionMatrix();
      stage.render(() =>
        pipeline.render({
          heat: !settings.reducedMotion,
          quality: settings.quality,
        }),
      );
    }
    await progress('Preparing ships');
    const loaded = await createFleetShip({ id: shipId });
    if (disposed || signal.aborted) {
      loaded.dispose();
      check();
    }
    fleet = loaded;
    stage.scene.add(fleet.group);
    fit(fleet.group);
    if (new URLSearchParams(location.search).get('dev') === '1') {
      const { createPickupInspector } = await import('./pickup-inspector.js');
      check();
      const tools = await createPickupInspector({
        host: root.querySelector('#inspection-tools'),
        ship: fleet.group,
        getSettings: () => settings,
        getDriving: () => ({
          ...preview,
          time,
          available: tab === 'fleet' && !loading && !disposed,
        }),
      });
      if (disposed || signal.aborted) {
        tools.dispose();
        check();
      }
      pickupTools = tools;
      fit(fleet.group);
    }
    await progress('Warming studio');
    draw(0);
    await renderer.compileAsync(stage.scene, camera);
    check();

    host.addEventListener(
      'pointerdown',
      (event) => {
        if (
          event.button !== 0 ||
          event.target.closest('button,input,select,a,label')
        )
          return;
        const viewport = ui.inspectionViewport();
        const panel = root
          .querySelector('#inspection-panel')
          .getBoundingClientRect();
        if (
          viewport
            ? event.clientY < viewport.top ||
              event.clientY > viewport.top + viewport.height
            : event.clientX < panel.right
        )
          return;
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
        preview.autoRotate = false;
        ui.setInspectionPreview(preview);
        host.setPointerCapture(event.pointerId);
        event.preventDefault();
      },
      { signal: listeners.signal },
    );
    host.addEventListener(
      'pointermove',
      (event) => {
        if (!drag || drag.id !== event.pointerId) return;
        rotation += (event.clientX - drag.x) * 0.0078;
        preview.elevation = T.MathUtils.clamp(
          preview.elevation + (event.clientY - drag.y) * 0.005,
          0.12,
          1.2,
        );
        drag.x = event.clientX;
        drag.y = event.clientY;
      },
      { signal: listeners.signal },
    );
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
      host.addEventListener(
        type,
        () => {
          drag = null;
        },
        { signal: listeners.signal },
      );
    window.addEventListener(
      'keydown',
      (event) => {
        if (
          event.defaultPrevented ||
          event.target.closest('[data-music-player]')
        )
          return;
        if (event.code === 'Escape') {
          event.preventDefault();
          onBack();
        }
      },
      { signal: listeners.signal },
    );
    canvas.addEventListener(
      'keydown',
      (event) => {
        if (
          !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(
            event.code,
          )
        )
          return;
        event.preventDefault();
        preview.autoRotate = false;
        if (event.code === 'Home') {
          rotation = START_ROTATION;
          preview.elevation = START_ELEVATION;
        } else if (event.code === 'ArrowLeft') rotation -= 0.15;
        else if (event.code === 'ArrowRight') rotation += 0.15;
        else
          preview.elevation = T.MathUtils.clamp(
            preview.elevation + (event.code === 'ArrowUp' ? 0.1 : -0.1),
            0.12,
            1.2,
          );
        ui.setInspectionPreview(preview);
      },
      { signal: listeners.signal },
    );
    api = {
      ready: true,
      configure(next) {
        settings = { ...next };
        pickupTools?.configure();
      },
      getSnapshot: () => ({
        mode: 'inspection',
        ship: { id: fleet.selected.id, loading },
        inspection: { tab, rivalId, rivalLoading, preview: { ...preview } },
      }),
      dispose,
    };
    window.__VN_INSPECTOR = api;
    let last = performance.now();
    const animate = (now) => {
      if (disposed) return;
      draw(Math.min((now - last) / 1000, 0.05));
      last = now;
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    root.querySelector('#inspect-back').focus({ preventScroll: true });
    onProgress('Ready');
    return api;
  } catch (error) {
    dispose();
    throw error;
  }
}
