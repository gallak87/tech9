import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlasswakeTrack } from '../src/levels/glasswake/track/model.js';
import { createGlasswakeScreen } from '../src/levels/glasswake/weather/screen.js';

test('HUD snow caches small sprites, bounds repaint work and releases backing stores', () => {
  const priorDocument = globalThis.document;
  const canvases = [];
  const clears = [];
  const host = {
    clientWidth: 1440,
    clientHeight: 900,
    append() {},
    querySelector: () => null,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    querySelectorAll: () => [
      {
        closest: () => false,
        getBoundingClientRect: () => ({
          left: 1100,
          top: 120,
          width: 300,
          height: 200,
        }),
      },
    ],
  };
  globalThis.document = {
    createElement() {
      const canvas = {
        width: 0,
        height: 0,
        style: {},
        dataset: {},
        setAttribute() {},
        remove() {
          this.removed = true;
        },
      };
      const ctx = {
        translate() {},
        rotate() {},
        beginPath() {},
        arc() {},
        ellipse() {},
        moveTo() {},
        lineTo() {},
        fill() {},
        stroke() {},
        drawImage() {},
        createRadialGradient: () => ({ addColorStop() {} }),
        clearRect: (...r) => {
          if (canvases[0] === canvas) clears.push(r);
        },
        clip() {
          throw new Error('HUD must not allocate fullscreen clip surfaces');
        },
        set filter(value) {
          throw new Error(
            `HUD must not filter its fullscreen backing store: ${value}`,
          );
        },
      };
      canvas.getContext = () => ctx;
      canvases.push(canvas);
      return canvas;
    },
  };
  let screen;
  try {
    const track = createGlasswakeTrack();
    screen = createGlasswakeScreen({ host, track });
    const state = {
      distance: track.sections.find((s) => s.id === 'rim').showcase,
      time: 0,
    };
    for (let tick = 0; tick < 120; tick++)
      screen.update({
        state: { ...state, time: tick / 120 },
        mode: 'racing',
        settings: { quality: 'high' },
      });
    assert.ok(screen.snapshot().screenFlakes > 0, 'visible adhesion retained');
    assert.ok(
      screen.snapshot().screenPaints <= 35,
      'repaint work independent of 120 Hz caller',
    );
    assert.ok(
      canvases.length > 1 && canvases.length <= 15,
      'bounded cache, no canvas per frame',
    );
    assert.ok(
      canvases.slice(1).every((c) => c.width <= 64 && c.height <= 64),
      'small sprite stores',
    );
    assert.ok(
      clears.some(
        (r) => r[0] === 1091 && r[1] === 111 && r[2] === 318 && r[3] === 218,
      ),
      'reserved HUD rectangle cleared',
    );
    screen.update({ state, mode: 'paused' });
    assert.equal(screen.snapshot().screenVisible, false);
    assert.equal(screen.snapshot().screenFlakes, 0);
    screen.reset();
    screen.update({ state, mode: 'racing' });
    assert.equal(
      screen.snapshot().screenPaints,
      1,
      'reset repaints the absolute phase',
    );
    host.clientWidth = 390;
    host.clientHeight = 844;
    screen.update({ state, mode: 'racing' });
    assert.equal(canvases[0].width, 390, 'resize invalidates the cache');
    assert.equal(canvases[0].height, 844);
    screen.dispose();
    screen.dispose();
    assert.equal(canvases[0].removed, true);
    assert.ok(
      canvases.slice(1).every((c) => c.width === 0 && c.height === 0),
      'cached GPU backing stores released',
    );
  } finally {
    screen?.dispose();
    if (priorDocument === undefined) delete globalThis.document;
    else globalThis.document = priorDocument;
  }
});
