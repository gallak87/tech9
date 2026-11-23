import assert from 'node:assert/strict';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import {
  collectPageErrors,
  launchVerificationBrowser,
} from './verification-browser.mjs';
import { seedVerificationCareer } from './verification-career.mjs';
import { replaceOnce, routeRuntimeProbe } from './runtime-probe.mjs';

// Explicit visible acceptance on this host; no full laps, captures or simulation shortcuts.
assert.deepEqual(
  process.argv.slice(2),
  ['--headed'],
  'Use --headed explicitly.',
);
const base = process.env.VN_URL;
assert.ok(base, 'Set VN_URL to an existing development Vite server.');
const supported = ['worldspire', 'nightweir', 'umbra'];
const levels = process.env.VN_LEVEL?.split(',') ?? supported;
assert.ok(
  levels.length && levels.every((level) => supported.includes(level)),
  `VN_LEVEL must select ${supported.join(', ')}.`,
);
const quality = process.env.VN_QUALITY ?? 'high';
assert.ok(['high', 'low'].includes(quality), 'VN_QUALITY must be high or low.');
const cpuProfileRequested = process.env.VN_CPU_PROFILE === '1';
const gpuTimingRequested = process.env.VN_GPU_TIMING === '1';
const viewport = { width: 1280, height: 720 };
const warmupMs = 5000;
const sampleMs = 20000;
const hardware = {
  cpu: cpus()[0]?.model,
  logicalCores: cpus().length,
  memoryGiB: totalmem() / 2 ** 30,
  platform: platform(),
  arch: arch(),
  release: release(),
};
const quantiles = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const q = (percent) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * percent))] ??
    null;
  return {
    samples: sorted.length,
    p50: q(0.5),
    p95: q(0.95),
    max: sorted.at(-1),
  };
};
function summarizeCpuProfile(profile) {
  const samples = profile.samples ?? [];
  assert.ok(samples.length, 'CPU profiler must return samples');
  assert.equal(
    samples.length,
    profile.timeDeltas?.length,
    'CPU sample timing count',
  );
  const nodes = new Map(profile.nodes.map((node) => [node.id, node.callFrame]));
  const totals = new Map();
  let sampledUs = 0;
  samples.forEach((id, index) => {
    const frame = nodes.get(id);
    const entry = {
      functionName: frame?.functionName || '(anonymous)',
      url: frame?.url || null,
      line: frame?.lineNumber >= 0 ? frame.lineNumber + 1 : null,
    };
    const key = JSON.stringify(entry);
    const total = totals.get(key) ?? { ...entry, selfUs: 0, samples: 0 };
    const elapsedUs = profile.timeDeltas[index];
    sampledUs += elapsedUs;
    total.selfUs += elapsedUs;
    total.samples++;
    totals.set(key, total);
  });
  return {
    note: 'Diagnostic V8 sampling profiler enabled; frame timings include profiler overhead',
    durationMs: (profile.endTime - profile.startTime) / 1000,
    sampledMs: sampledUs / 1000,
    samples: samples.length,
    topSelfTime: [...totals.values()]
      .sort((a, b) => b.selfUs - a.selfUs)
      .slice(0, 20)
      .map(({ selfUs, ...entry }) => ({
        ...entry,
        selfMs: selfUs / 1000,
        sharePercent: (selfUs / sampledUs) * 100,
      })),
  };
}
const browser = await launchVerificationBrowser({ headless: false });
const failures = [];
try {
  for (const level of levels) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
    });
    let page, cpuSession;
    let profiling = false;
    try {
      await seedVerificationCareer(context);
      await context.routeWebSocket('**/*', () => {});
      await context.addInitScript((quality) => {
        localStorage.setItem(
          'vector-nova.settings',
          JSON.stringify({
            quality,
            difficulty: 'hard',
            masterVolume: 0,
            volume: 0,
          }),
        );
        localStorage.setItem('startUpMusicOn', 'false');
        window.__foregroundContextLosses = 0;
        window.addEventListener(
          'webglcontextlost',
          () => window.__foregroundContextLosses++,
          true,
        );
      }, quality);
      await routeRuntimeProbe(
        context,
        `foregroundPilotStart() {
          if (!racerModule || !racers || !competition) throw Error('Pilot requires an ordinary full field');
          __foregroundPilot = {
            ticks: 0, forwardMetres: 0, impactEvents: 0, recoveries: 0,
            impactSeconds: 0, wallGrindingSeconds: 0, maxWallGrindingSeconds: 0,
            lastWallContact: -Infinity, resetCount: state.resetCount,
            throttleTicks: 0, brakeTicks: 0, boostTicks: 0,
            steerMin: Infinity, steerMax: -Infinity, lastControl: null, trace: [],
          };
        },
        foregroundPilotStop() {
          const pilot = __foregroundPilot;
          __foregroundPilot = null;
          if (!pilot) return null;
          const { lastWallContact, ...summary } = pilot;
          return { ...summary, resetCount: state.resetCount - pilot.resetCount };
        },
        foregroundMeasureStart(gpuTiming = false) {
          if (this.__foregroundMeasure) throw Error('Measurement already running');
          if (!__foregroundPilot) throw Error('Start native AI pilot before measuring');
          this.foregroundPilotStart();
          const gl = gpuTiming ? renderer.getContext() : null;
          const ext = gl?.getExtension('EXT_disjoint_timer_query_webgl2') ?? null;
          const measure = {
            render: view.render, frames: 0, hiddenFrames: 0, unfocusedFrames: 0,
            focusEvents: [], gpuMs: [], pending: [], disjoint: 0, unavailable: 0,
            frameMs: [], started: performance.now(), ext, gl, gpuTiming,
          };
          measure.lastFrame = null;
          measure.focus = () => measure.focusEvents.push({
            at: performance.now() - measure.started,
            visible: document.visibilityState === 'visible', focused: document.hasFocus(),
          });
          window.addEventListener('blur', measure.focus);
          document.addEventListener('visibilitychange', measure.focus);
          view.resetMetrics();
          view.render = (now) => {
            const renderedAt = performance.now();
            if (measure.lastFrame !== null) measure.frameMs.push(renderedAt - measure.lastFrame);
            measure.lastFrame = renderedAt;
            measure.frames++;
            if (document.visibilityState !== 'visible') measure.hiddenFrames++;
            if (!document.hasFocus()) measure.unfocusedFrames++;
            // Optional diagnostic writes only: never poll GPU results in the timed window.
            const query = ext && measure.frames % 30 === 0 ? gl.createQuery() : null;
            if (query) gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
            try { return measure.render.call(view, now); }
            finally {
              if (query) { gl.endQuery(ext.TIME_ELAPSED_EXT); measure.pending.push(query); }
            }
          };
          this.__foregroundMeasure = measure;
          return this.getSnapshot();
        },
        async foregroundMeasureStop() {
          const endedAt = performance.now();
          const measure = this.__foregroundMeasure;
          if (!measure) return null;
          const elapsedMs = endedAt - measure.started;
          delete this.__foregroundMeasure;
          view.render = measure.render;
          window.removeEventListener('blur', measure.focus);
          document.removeEventListener('visibilitychange', measure.focus);
          const snapshot = this.getSnapshot(), metrics = view.getMetrics();
          const pilot = this.foregroundPilotStop();
          if (measure.ext && measure.pending.length) {
            // Synchronize and read once after the acceptance clock has stopped.
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            measure.gl.finish();
            const disjoint = measure.gl.getParameter(measure.ext.GPU_DISJOINT_EXT);
            for (const query of measure.pending) {
              if (disjoint) measure.disjoint++;
              else if (measure.gl.getQueryParameter(query, measure.gl.QUERY_RESULT_AVAILABLE))
                measure.gpuMs.push(measure.gl.getQueryParameter(query, measure.gl.QUERY_RESULT) / 1e6);
              else measure.unavailable++;
              measure.gl.deleteQuery(query);
            }
          }
          return {
            snapshot, metrics, pilot, elapsedMs, frames: measure.frames,
            configuredHighShadowSize: definition.renderer?.sunShadowSize ?? 3072,
            hiddenFrames: measure.hiddenFrames, unfocusedFrames: measure.unfocusedFrames,
            focusEvents: measure.focusEvents, gpuMs: measure.gpuMs,
            frameMs: measure.frameMs,
            gpuTiming: !measure.gpuTiming ? 'Disabled: zero GPU timer queries in foreground acceptance' :
              measure.ext ? 'Diagnostic: every thirtieth render; GPU results read after the timed window' :
              'Unavailable: EXT_disjoint_timer_query_webgl2',
            disjoint: measure.disjoint, unavailable: measure.unavailable,
          };
        },`,
        {
          transform(source) {
            source = replaceOnce(
              source,
              'const errors = [];',
              'const errors = []; let __foregroundPilot = null;',
            );
            source = replaceOnce(
              source,
              'events.push(event);',
              `if (__foregroundPilot) {
                if (e.type === 'impact') __foregroundPilot.impactEvents++;
                if (e.type === 'road-recovery') __foregroundPilot.recoveries++;
              }
              events.push(event);`,
            );
            return replaceOnce(
              source,
              'function advanceTick(control) {',
              `function advanceTick(control) {
                const pilot = __foregroundPilot;
                if (!pilot) return foregroundNativeTick(control);
                control = racerModule.getRacerControl(state, track, {
                  lane: 0, pace: 1, difficulty: 'hard', runtime,
                  devices: simulationActors.prepareRacing().devices,
                  nearby: racers.opponents.map(opponent => opponent.state),
                });
                const before = { distance: state.distance, time: state.time, tick };
                const result = foregroundNativeTick(control);
                if (tick === before.tick) return result;
                const dt = state.time - before.time;
                const delta = state.distance - before.distance;
                pilot.ticks++;
                pilot.lastControl = { ...control };
                if (control.throttle > 0) pilot.throttleTicks++;
                if (control.brake > 0) pilot.brakeTicks++;
                if (control.boost) pilot.boostTicks++;
                pilot.steerMin = Math.min(pilot.steerMin, control.steer);
                pilot.steerMax = Math.max(pilot.steerMax, control.steer);
                // Bound each increment so a recovery teleport cannot count as driving.
                pilot.forwardMetres += Math.max(0, Math.min(delta, Math.max(5, Math.abs(state.speed) * dt * 3)));
                if (state.impact > 0.08) pilot.impactSeconds += dt;
                const surface = track.sampleSurface?.(state.distance, state.lateral);
                const nearRail = !(surface?.period > 0) && Math.abs(state.lateral) >= track.width / 2 - 3.5;
                if (nearRail && state.impact > 0.08) pilot.lastWallContact = state.time;
                const grinding = nearRail && state.time - pilot.lastWallContact < 0.5;
                pilot.wallGrindingSeconds = grinding ? pilot.wallGrindingSeconds + dt : 0;
                pilot.maxWallGrindingSeconds = Math.max(pilot.maxWallGrindingSeconds, pilot.wallGrindingSeconds);
                if (pilot.ticks === 1 || pilot.ticks % 120 === 0)
                  pilot.trace.push({ tick, time: state.time, distance: state.distance, speed: state.speed, ...control });
                return result;
              }
              function foregroundNativeTick(control) {`,
            );
          },
        },
      );
      page = await context.newPage();
      const errors = collectPageErrors(page);
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      const url = new URL(base);
      url.search = new URLSearchParams({ level, intro: '0', music: '0' });
      const started = performance.now();
      await page.goto(url.href);
      await page.locator('[data-action="quick-race"]').click();
      await page.locator('[data-action="launch"]').click();
      await page.waitForFunction(
        () =>
          window.__VN?.ready &&
          window.__VN_FRONTEND?.getState().screen === 'race',
        null,
        { timeout: 120000 },
      );
      const startupMs = performance.now() - started;
      await page.waitForFunction(
        () => window.__VN.getSnapshot().mode === 'racing',
        null,
        { timeout: 30000 },
      );
      await page.bringToFront();
      await page.waitForFunction(
        () => document.visibilityState === 'visible' && document.hasFocus(),
      );
      await page.evaluate(() => window.__VN.foregroundPilotStart());
      await page.waitForTimeout(warmupMs);
      if (cpuProfileRequested) {
        cpuSession = await context.newCDPSession(page);
        await cpuSession.send('Profiler.enable');
        await cpuSession.send('Profiler.start');
        profiling = true;
      }
      const before = await page.evaluate(
        (gpuTiming) => window.__VN.foregroundMeasureStart(gpuTiming),
        gpuTimingRequested,
      );
      await page.waitForTimeout(sampleMs);
      const result = await page.evaluate(() =>
        window.__VN.foregroundMeasureStop(),
      );
      let cpuProfile;
      if (profiling) {
        const { profile } = await cpuSession.send('Profiler.stop');
        profiling = false;
        cpuProfile = summarizeCpuProfile(profile);
        await cpuSession.send('Profiler.disable');
        await cpuSession.detach();
        cpuSession = null;
      }
      const contextLosses = await page.evaluate(
        () => window.__foregroundContextLosses,
      );
      const loadedId = await page.evaluate(
        () => window.__VN_FRONTEND.getState().loadedId,
      );
      const { snapshot, metrics } = result;
      const frameMs = quantiles(result.frameMs);
      console.log(
        JSON.stringify({
          level,
          loadedId,
          requestedQuality: quality,
          quality: snapshot.settings.quality,
          difficulty: snapshot.settings.difficulty,
          ship: snapshot.ship.id,
          pipeline: metrics.pipeline,
          configuredHighShadowSize: result.configuredHighShadowSize,
          hardware,
          browser: browser.version(),
          viewport: metrics.viewport,
          startupMs,
          warmupMs,
          sampleMs: result.elapsedMs,
          renderedFrames: result.frames,
          frameMs,
          longFrames: result.frameMs.filter((interval) => interval > 33.3)
            .length,
          frameTiming:
            'Unfiltered consecutive actual render-start intervals; no partial sample edges or stop bookkeeping',
          gpuMs: quantiles(result.gpuMs),
          gpuTiming: result.gpuTiming,
          measurementOverhead: {
            diagnostic: cpuProfileRequested || gpuTimingRequested,
            cpuProfiler: cpuProfileRequested,
            gpuTimerQueries: gpuTimingRequested,
          },
          ...(cpuProfile ? { cpuProfile } : {}),
          disjoint: result.disjoint,
          gpuUnavailable: result.unavailable,
          calls: metrics.calls,
          triangles: metrics.triangles,
          maxima: metrics.maxima,
          estimatedGpuMiB: metrics.estimatedGpuMiB,
          gpuEstimateScope: metrics.gpuEstimateScope,
          textures: metrics.textures,
          textureMiB: metrics.textureMiB,
          gpu: metrics.gpu,
          racers: snapshot.competition?.standings.length,
          driving: {
            before: {
              tick: before.tick,
              distance: before.vehicle.distance,
              time: before.vehicle.time,
              speed: before.vehicle.speed,
            },
            after: {
              tick: snapshot.tick,
              distance: snapshot.vehicle.distance,
              time: snapshot.vehicle.time,
              speed: snapshot.vehicle.speed,
            },
            pilot: result.pilot,
          },
          hiddenFrames: result.hiddenFrames,
          unfocusedFrames: result.unfocusedFrames,
          focusEvents: result.focusEvents,
          contextLosses,
          errors: [...errors, ...snapshot.errors],
          scope:
            'Bounded local foreground segment; not all-device or whole-course certification',
        }),
      );
      assert.equal(loadedId, level, 'the requested catalogue course is loaded');
      assert.equal(snapshot.settings.quality, quality);
      assert.equal(
        metrics.pipeline.textureLimit,
        quality === 'low' ? 512 : null,
      );
      assert.equal(
        metrics.pipeline.shadowSize,
        quality === 'low' ? 1024 : result.configuredHighShadowSize,
      );
      assert.deepEqual(metrics.viewport, { ...viewport, dpr: 1 });
      assert.ok(
        typeof metrics.gpu === 'string' &&
          metrics.gpu.length > 0 &&
          !/swiftshader|llvmpipe|software|softpipe/i.test(metrics.gpu),
        'native GPU required',
      );
      assert.equal(before.mode, 'racing');
      assert.equal(snapshot.mode, 'racing');
      assert.ok(
        result.pilot.ticks > 0 && result.pilot.throttleTicks > 0,
        'native AI controls advance the player',
      );
      assert.ok(
        result.pilot.forwardMetres >= 500,
        'sample requires at least 500 metres of native forward driving',
      );
      assert.ok(
        result.pilot.maxWallGrindingSeconds < 2,
        'sample must not contain sustained wall grinding',
      );
      assert.equal(
        result.pilot.recoveries,
        0,
        'sample must not depend on automatic recovery',
      );
      assert.equal(result.pilot.resetCount, 0);
      assert.equal(before.competition?.standings.length, 10);
      assert.equal(snapshot.competition?.standings.length, 10);
      assert.ok(
        snapshot.tick > before.tick &&
          snapshot.vehicle.time > before.vehicle.time,
      );
      assert.ok(
        result.frames >= 300,
        'sample must include at least 300 displayed frames',
      );
      assert.equal(result.hiddenFrames, 0, 'document remained visible');
      assert.equal(result.unfocusedFrames, 0, 'document remained focused');
      assert.deepEqual(
        result.focusEvents,
        [],
        'no blur or visibility transitions',
      );
      assert.equal(contextLosses, 0);
      assert.deepEqual([...errors, ...snapshot.errors], []);
      assert.ok(
        frameMs.p50 <= 18.5,
        `median ${frameMs.p50} ms exceeds 18.5 ms`,
      );
      assert.ok(frameMs.p95 <= 25, `p95 ${frameMs.p95} ms exceeds 25 ms`);
      console.log(`PASS local foreground ${level} ${quality}`);
    } catch (error) {
      failures.push({ level, quality, error: error.message });
      console.error(
        `FAIL local foreground ${level} ${quality}: ${error.message}`,
      );
    } finally {
      if (cpuSession) {
        if (profiling) await cpuSession.send('Profiler.stop').catch(() => {});
        await cpuSession.detach().catch(() => {});
      }
      if (page) {
        await page
          .evaluate(() => window.__VN?.foregroundMeasureStop?.())
          .catch(() => {});
        await page
          .evaluate(() => window.__VN?.foregroundPilotStop?.())
          .catch(() => {});
      }
      await context.close();
    }
  }
  assert.deepEqual(failures, [], 'foreground acceptance failures');
} finally {
  await browser.close();
}
