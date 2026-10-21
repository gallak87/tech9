import './style.css';
import { createInput } from './input.js';
const canvas = document.createElement('canvas');
const context = canvas.getContext('2d');
const stage = document.querySelector('#stage');
stage.append(canvas);
const resize = () => {
  const r = stage.getBoundingClientRect(),
    dpr = Math.min(2, devicePixelRatio);
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
};
const draw = (state) => {
  const w = canvas.width,
    h = canvas.height;
  context.fillStyle = '#162630';
  context.fillRect(0, 0, w, h);
  context.fillStyle = '#e9bc73';
  context.beginPath();
  context.arc(
    ((state.x + 1) * w) / 2,
    ((state.y + 1) * h) / 2,
    Math.min(w, h) * 0.035,
    0,
    Math.PI * 2,
  );
  context.fill();
};
const destroy = () => canvas.remove();
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
