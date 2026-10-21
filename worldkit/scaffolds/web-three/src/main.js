import * as THREE from 'three';
import './style.css';
import { createInput } from './input.js';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setClearColor(0x162630);
const canvas = renderer.domElement,
  stage = document.querySelector('#stage');
stage.append(canvas);
const scene = new THREE.Scene(),
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.z = 5;
const geometry = new THREE.BoxGeometry(0.35, 0.35, 0.35),
  material = new THREE.MeshNormalMaterial();
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);
const resize = () => {
  const r = stage.getBoundingClientRect();
  renderer.setSize(r.width, r.height);
  camera.aspect = r.width / r.height;
  camera.updateProjectionMatrix();
};
const draw = (state) => {
  cube.position.set(state.x * 1.8 * camera.aspect, -state.y * 1.8, 0);
  cube.rotation.set(0.4, state.x + 0.5, 0.1);
  renderer.render(scene, camera);
};
const destroy = () => {
  geometry.dispose();
  material.dispose();
  renderer.dispose();
  canvas.remove();
};
const input = createInput(canvas, document.querySelector('#reset'));
const observer = new ResizeObserver(resize);
observer.observe(stage);
resize();
let frame = 0,
  previous = performance.now(),
  disposed = false;
function tick(now) {
  input.update(Math.min(0.05, (now - previous) / 1000));
  previous = now;
  draw(input.state);
  frame = requestAnimationFrame(tick);
}
frame = requestAnimationFrame(tick);
function dispose() {
  if (disposed) return;
  disposed = true;
  window.removeEventListener('pagehide', onPageHide);
  cancelAnimationFrame(frame);
  observer.disconnect();
  input.dispose();
  destroy();
}
function onPageHide(event) {
  if (!event.persisted) dispose();
}
window.addEventListener('pagehide', onPageHide);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    dispose();
  });
if (import.meta.env.DEV && new URLSearchParams(location.search).has('test'))
  window.__STARTER_TEST__ = { snapshot: () => ({ ...input.state, disposed }) };
