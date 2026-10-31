import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createStudioEnvironment } from '../ships/studio-environment.js';
import { createShip } from '../ships/index.js';
import { configureShipTextures } from '../ships/texture-loader.js';
import { getShip } from '../ships/catalog.js';

// A small, on-demand studio owns only the selected chassis. It never loads a
// circuit or runs a second game loop, and releases its context on leaving setup.
export function createShipPreview({ autoRotate = false } = {}) {
  const element = document.createElement('div');
  element.className = 'ship-preview';
  element.innerHTML =
    '<div class="ship-preview-status" role="status"></div><span class="ship-preview-hint">DRAG TO ROTATE <i>/</i> ARROW KEYS · HOME TO RESET</span>';
  const status = element.querySelector('.ship-preview-status');
  const life = new AbortController();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  configureShipTextures(renderer);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    'Ship preview. Drag or use arrow keys to rotate; Home resets the view.',
  );
  element.prepend(canvas);
  const scene = new THREE.Scene();
  const environment = createStudioEnvironment(renderer);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.9;
  scene.add(new THREE.HemisphereLight('#e4eaf0', '#222830', 0.16));
  const key = new THREE.DirectionalLight('#fff5e6', 1.5);
  key.position.set(-3.8, 7, 5);
  const rim = new THREE.DirectionalLight('#e0edff', 0.8);
  rim.position.set(6, 4, -5);
  scene.add(key, rim);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = Math.PI - 0.15;
  controls.rotateSpeed = 0.65;
  controls.autoRotate = autoRotate;
  // Match the inspector's gentle 0.12 rad/s turntable.
  controls.autoRotateSpeed = (0.12 * 60) / (2 * Math.PI);
  let current = null,
    requested = null,
    selected = null;
  let generation = 0,
    disposed = false,
    frame = 0,
    lastTime = 0,
    width = 0,
    height = 0;
  let loading = false,
    error = '';
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  const view = new THREE.Vector3(1.1, 0.75, 1.45).normalize();

  function fit(reset = false) {
    if (!current) return;
    if (reset) camera.position.copy(center).add(view);
    const direction = camera.position.clone().sub(controls.target).normalize();
    controls.target.copy(center);
    // Project hull corners into this view, fitting both wide and narrow canvases.
    camera.position.copy(center).add(direction);
    camera.lookAt(center);
    const rotation = camera.quaternion.clone().invert();
    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    let distance = 0;
    for (const x of [-1, 1])
      for (const y of [-1, 1])
        for (const z of [-1, 1]) {
          const corner = new THREE.Vector3(
            (x * size.x) / 2,
            (y * size.y) / 2,
            (z * size.z) / 2,
          ).applyQuaternion(rotation);
          distance = Math.max(
            distance,
            corner.z +
              Math.max(
                Math.abs(corner.x) / (tangent * camera.aspect),
                Math.abs(corner.y) / tangent,
              ),
          );
        }
    camera.position.copy(center).addScaledVector(direction, distance * 1.08);
    controls.update();
  }
  function draw(time) {
    frame = 0;
    if (disposed || !element.isConnected || !current?.group.visible) return;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nextWidth = Math.round(rect.width),
      nextHeight = Math.round(rect.height);
    if (width !== nextWidth || height !== nextHeight) {
      width = nextWidth;
      height = nextHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      fit();
    }
    controls.update(Math.min((time - lastTime) / 1000, 0.05));
    lastTime = time;
    renderer.render(scene, camera);
    if (controls.autoRotate) invalidate();
  }
  function invalidate() {
    if (!disposed && !frame) frame = requestAnimationFrame(draw);
  }
  controls.addEventListener('change', invalidate);
  const observer = new ResizeObserver(invalidate);
  observer.observe(element);
  canvas.addEventListener(
    'keydown',
    (event) => {
      if (!current || loading) return;
      if (
        ['Home', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(
          event.code,
        )
      )
        controls.autoRotate = false;
      if (event.code === 'Home') fit(true);
      else if (
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.code)
      ) {
        const offset = camera.position.clone().sub(controls.target);
        const spherical = new THREE.Spherical().setFromVector3(offset);
        spherical.theta +=
          event.code === 'ArrowLeft'
            ? -0.15
            : event.code === 'ArrowRight'
              ? 0.15
              : 0;
        spherical.phi = THREE.MathUtils.clamp(
          spherical.phi +
            (event.code === 'ArrowUp'
              ? -0.15
              : event.code === 'ArrowDown'
                ? 0.15
                : 0),
          controls.minPolarAngle,
          controls.maxPolarAngle,
        );
        camera.position
          .copy(controls.target)
          .add(offset.setFromSpherical(spherical));
        controls.update();
      } else return;
      event.preventDefault();
      event.stopPropagation();
      invalidate();
    },
    { signal: life.signal },
  );

  async function setShip(id) {
    if (
      disposed ||
      (requested === id && (loading || selected === id) && !error)
    )
      return;
    requested = id;
    const token = ++generation;
    loading = true;
    error = '';
    controls.enabled = false;
    element.dataset.state = 'loading';
    if (current) current.group.visible = false;
    canvas.style.visibility = 'hidden';
    status.textContent = `Loading ${getShip(id).name}…`;
    try {
      const loaded = await createShip({ id });
      if (disposed || token !== generation) {
        loaded.dispose();
        return;
      }
      current?.dispose();
      current = loaded;
      selected = id;
      scene.add(current.group);
      current.update({ reducedMotion: true });
      const bounds = current.group.userData.bounds;
      new THREE.Box3(
        new THREE.Vector3().fromArray(bounds.min),
        new THREE.Vector3().fromArray(bounds.max),
      ).getCenter(center);
      const dimensions = current.group.userData.dimensionsMetres;
      size.set(dimensions.width, dimensions.height, dimensions.length);
      controls.target.copy(center);
      fit(true);
      controls.autoRotate = autoRotate;
      element.dataset.state = 'ready';
      element.dataset.ship = id;
      canvas.setAttribute(
        'aria-label',
        `${getShip(id).name} 3D preview. Drag or use arrow keys to rotate; Home resets the view.`,
      );
      canvas.style.visibility = '';
      controls.enabled = true;
      status.textContent = '';
      invalidate();
    } catch {
      if (disposed || token !== generation) return;
      error = `${getShip(id).name} preview could not load.`;
      element.dataset.state = 'error';
      status.textContent = error;
      const retry = document.createElement('button');
      retry.textContent = 'Retry preview';
      retry.addEventListener('click', () => void setShip(requested), {
        once: true,
      });
      status.append(retry);
    } finally {
      if (token === generation) loading = false;
    }
  }
  return {
    element,
    setShip,
    getState: () => ({ requested, selected, loading, error }),
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      life.abort();
      current?.dispose();
      environment.dispose();
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      element.remove();
    },
  };
}
