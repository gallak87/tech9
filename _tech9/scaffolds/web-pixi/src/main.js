import { Application, Graphics } from 'pixi.js';
import './style.css';
import { createInput } from './input.js';
const app = new Application(),
  stage = document.querySelector('#stage');
await app.init({
  background: '#162630',
  antialias: true,
  autoStart: false,
  resolution: Math.min(2, devicePixelRatio),
  autoDensity: true,
  preference: 'webgl',
});
const canvas = app.canvas;
stage.append(canvas);
const dot = new Graphics().circle(0, 0, 18).fill(0xe9bc73);
app.stage.addChild(dot);
const resize = () => {
  const r = stage.getBoundingClientRect();
  app.renderer.resize(r.width, r.height);
};
const draw = (state) => {
  dot.position.set(
    ((state.x + 1) * app.screen.width) / 2,
    ((state.y + 1) * app.screen.height) / 2,
  );
  app.render();
};
const destroy = () => app.destroy(true, { children: true });
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
