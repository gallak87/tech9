import * as T from 'three';
import { saffronSandExposure } from './track/sand.js';

// Route-aware shelter uses the actual interior interval, including banked deck.
// Absolute simulation time/seeded positions follow the weather reference's
// world-space layering; no static X/Z field or extra animation loop is used.
export function sampleSaffronAtmosphere(track, state = {}) {
  const d =
    (((state.distance ?? 0) % track.length) + track.length) % track.length;
  const time = state.time ?? 0;
  const interior =
    T.MathUtils.smoothstep(
      d,
      track.landmarks.skullStart + 8,
      track.landmarks.skullStart + 40,
    ) *
    (1 -
      T.MathUtils.smoothstep(
        d,
        track.landmarks.skullEnd - 40,
        track.landmarks.skullEnd - 8,
      ));
  const sand = saffronSandExposure(track, d, state.lateral ?? 0, time);
  const falls = [
    track.landmarks.sandfall - 40,
    track.landmarks.sandfall + 80,
    track.landmarks.skullStart + 60,
    track.landmarks.skullEnd - 80,
  ];
  const sandfall =
    Math.max(...falls.map((s) => Math.exp(-(((d - s) / 36) ** 2)))) * 0.45;
  return {
    shelter: interior,
    sand,
    sandfall,
    exposure:
      (1 - interior * 0.96) * Math.min(1, 0.12 + sand * 0.65 + sandfall),
  };
}

export function createSaffronDust(track, resources) {
  const geometry = resources.geometry(new T.BufferGeometry());
  const seed = new Float32Array(480 * 3);
  for (let i = 0; i < seed.length; i++)
    seed[i] = (((Math.sin(i * 78.233 + 19.37) * 43758.54) % 1) + 1) % 1;
  geometry.setAttribute('position', new T.BufferAttribute(seed, 3));
  const material = resources.material(
    new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { clock: { value: 0 }, strength: { value: 0 } },
      vertexShader: `uniform float clock; uniform float strength; varying float alpha;
      void main(){vec3 p=(position-.5)*vec3(150.,38.,190.);
        p.x=mod(p.x+clock*7.+75.,150.)-75.;p.y+=sin(position.z*30.+clock*.6)*1.5;
        vec4 v=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*v;
        gl_PointSize=clamp(700./max(1.,-v.z),1.,2.6);
        alpha=strength*.25*smoothstep(1.,10.,-v.z);}`,
      fragmentShader: `varying float alpha;void main(){float r=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(.85,.68,.42,alpha*(1.-smoothstep(.1,1.,r)));}`,
    }),
  );
  const group = new T.Points(geometry, material);
  group.name = 'Saffron / sheltered world-space blowing grains';
  group.frustumCulled = false;
  let presentation = {};
  return {
    group,
    update({ state, camera, settings = {}, mode, time = 0 }) {
      presentation = sampleSaffronAtmosphere(track, state);
      group.visible = !settings.reducedMotion && mode === 'racing';
      if (camera) group.position.copy(camera.position);
      geometry.setDrawRange(0, settings.quality === 'low' ? 160 : 480);
      material.uniforms.clock.value = time;
      material.uniforms.strength.value = presentation.exposure;
    },
    getPresentation: () => ({ ...presentation }),
  };
}

export function createSaffronScreenDust(track, host) {
  const canvas = document.createElement('canvas');
  canvas.dataset.saffronDust = '';
  Object.assign(canvas.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: '4',
  });
  host.append(canvas);
  const ctx = canvas.getContext('2d');
  let last = -Infinity;
  return {
    update({ state, settings = {}, mode }) {
      const w = host.clientWidth,
        h = host.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        last = -Infinity;
      }
      const time = state?.time ?? 0;
      if (mode === 'racing' && time >= last && time - last < 1 / 24) return;
      last = time;
      ctx.clearRect(0, 0, w, h);
      if (mode !== 'racing' || settings.reducedMotion) return;
      const a = sampleSaffronAtmosphere(track, state);
      const strength =
        Math.min(1, a.sand * 0.75 + a.sandfall) * (1 - a.shelter);
      if (strength < 0.01) return;
      ctx.strokeStyle = `rgba(225,190,126,${strength * 0.28})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < 32; i++) {
        const side = i % 2;
        const x = side
          ? w * (0.92 + 0.08 * ((i * 0.37 + time * 0.15) % 1))
          : w * (0.08 * ((i * 0.37 + time * 0.15) % 1));
        const y = h * ((i * 0.618 + time * 0.09) % 1);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (side ? 7 : -7), y + 3);
        ctx.stroke();
      }
      for (const node of host.querySelectorAll(
        '.top-telemetry,.telemetry,#minimap,.race-devices,#race-roster,#touch,#shape-controls',
      )) {
        if (!node.checkVisibility()) continue;
        const r = node.getBoundingClientRect();
        ctx.clearRect(r.x - 4, r.y - 4, r.width + 8, r.height + 8);
      }
    },
    reset() {
      last = -Infinity;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
    dispose() {
      canvas.remove();
    },
  };
}
