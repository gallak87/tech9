import * as T from 'three';
import { assetURL } from '../assets/url.js';
import { editorBiome } from './biomes.js';

// Fixed registered sources only. No saved document supplies an asset URL.
const SKIES = Object.freeze({
  halcyon: ['halcyon/halcyon-clouds-v1.png', 0.34],
  nacre: ['nacre/nacre-storm-sky-v1.png', 0.15],
  glasswake: ['glasswake/aurora-sky-v1.png', 0.15],
  cindercoil: ['cindercoil/cindercoil-sky-v2.png', 0.34],
  saffron: ['saffron/saffron-sky-v2.png', 0.34],
  zephyr: ['zephyr/zephyr-sky-v2.png', 0.34],
  helion: ['helion/helion-sky-v2.png', 0.34],
  umbra: ['umbra/umbra-sky-v2.png', 0.15],
  shatterline: ['shatterline/shatterline-sky-v1.png', 0.15],
  worldspire: ['worldspire/sky-v1.png', 0.15],
  colossus: ['colossus/colossus-sky-v1.png', 0.34],
  nomad: ['nomad/nomad-sky-v1.png', 0.34],
});
const LIGHTS = {
  halcyon: [
    [-0.62, 0.145, 0.77],
    '#ffe0b4',
    2.35,
    '#c0d0e4',
    '#647384',
    1.05,
    0.45,
    0.8,
  ],
  nacre: [
    [-0.55, 0.72, 0.42],
    '#e8ece4',
    2.45,
    '#bdcfd6',
    '#425c64',
    0.66,
    0.22,
    0.5,
  ],
  glasswake: [
    [-0.58, 0.38, 0.72],
    '#e7f2ff',
    2.8,
    '#b4cedf',
    '#345168',
    0.8,
    0.48,
    0.5,
  ],
  cindercoil: [
    [-0.4, 0.63, -0.48],
    '#e4e0d5',
    1.85,
    '#a9c5df',
    '#66748b',
    1.05,
    0.62,
    0.38,
  ],
  saffron: [
    [-0.6, 0.35, -0.55],
    '#fff0d0',
    3.15,
    '#d5c4e4',
    '#b48b58',
    0.3,
    0.12,
    0.44,
  ],
  zephyr: [
    [-0.65, 0.32, -0.35],
    '#ffe1bc',
    3.1,
    '#9eafd1',
    '#3a3547',
    0.42,
    0.22,
    0.48,
  ],
  helion: [
    [-0.69, 0.54, -0.49],
    '#ffdbac',
    3,
    '#bac5d6',
    '#40201c',
    0.78,
    0.48,
    0.64,
  ],
  umbra: [
    [-0.66, 0.31, -0.68],
    '#ffd9b4',
    2.7,
    '#a2c2e4',
    '#526579',
    0.9,
    0.76,
    0.65,
  ],
  shatterline: [
    [-0.62, 0.33, 0.71],
    '#ffe2ac',
    3.1,
    '#b4c8de',
    '#81745f',
    0.54,
    0.24,
    0.52,
  ],
  worldspire: [
    [-0.65, 0.5, 0.6],
    '#ffdaad',
    2.7,
    '#c5dbe7',
    '#6e7580',
    0.92,
    0.4,
    0.8,
  ],
  colossus: [
    [-0.65, 0.45, 0.6],
    '#ffe3bc',
    3.1,
    '#a9c2d4',
    '#67716c',
    0.85,
    0.78,
    0.65,
  ],
  nomad: [
    [-0.6, 0.5, 0.55],
    '#ffddb2',
    2.5,
    '#bfd4ed',
    '#8f9697',
    0.45,
    0.25,
    0.75,
  ],
};
function lighting(id) {
  const [
    sun,
    sunColor,
    sunIntensity,
    ambientSky,
    ambientGround,
    ambientIntensity,
    fillIntensity,
    environmentIntensity,
  ] = LIGHTS[id];
  return {
    sunDirection: new T.Vector3(...sun).normalize(),
    sunColor,
    sunIntensity,
    ambientSky,
    ambientGround,
    ambientIntensity,
    fillColor: ambientSky,
    fillIntensity,
    environmentIntensity,
    far: 200000,
  };
}
function abort(signal) {
  if (signal?.aborted)
    throw signal.reason ?? new DOMException('Backdrop canceled', 'AbortError');
}
async function panorama(id, loadTexture, signal) {
  const [source, yaw] = SKIES[id];
  const texture = await loadTexture(assetURL(`assets/levels/${source}`));
  if (signal?.aborted) {
    texture.dispose();
    abort(signal);
  }
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = T.RepeatWrapping;
  texture.wrapT = T.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  const material = new T.ShaderMaterial({
    name: `Editor ${id} / registered sky radiance`,
    side: T.BackSide,
    depthWrite: false,
    uniforms: { panorama: { value: texture }, yaw: { value: yaw } },
    vertexShader:
      'varying vec3 ray;void main(){ray=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}',
    fragmentShader: `varying vec3 ray;uniform sampler2D panorama;uniform float yaw;
      void main(){vec3 d=normalize(ray);float u=fract(atan(d.z,d.x)/6.2831853+yaw);float v=asin(clamp(d.y,-1.,1.))/3.14159265+.5;
      vec3 dx=dFdx(d),dy=dFdy(d);float a=.96/(6.2831853*max(dot(d.xz,d.xz),.000001));float b=1./(3.14159265*sqrt(max(1.-d.y*d.y,.000001)));
      vec2 ux=vec2((d.x*dx.z-d.z*dx.x)*a,dx.y*b),uy=vec2((d.x*dy.z-d.z*dy.x)*a,dy.y*b);
      float pu=u*.96;vec3 color=textureGrad(panorama,vec2(pu,v),ux,uy).rgb;
      if(pu<.04)color=mix(textureGrad(panorama,vec2(pu+.96,v),ux,uy).rgb,color,smoothstep(0.,.04,pu));
      float pv=d.y>0.?.99:.01;vec3 pole=(textureLod(panorama,vec2(.125,pv),3.).rgb+textureLod(panorama,vec2(.375,pv),3.).rgb+textureLod(panorama,vec2(.625,pv),3.).rgb+textureLod(panorama,vec2(.875,pv),3.).rgb)*.25;
      color=mix(color,pole,smoothstep(.96,.998,abs(d.y)));gl_FragColor=vec4(color,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });
  const geometry = new T.SphereGeometry(20000, 32, 20),
    group = new T.Group();
  const sky = new T.Mesh(geometry, material);
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  group.add(sky);
  return {
    group,
    ownedTextures: [texture],
    ...lighting(id),
    update({ camera } = {}) {
      if (camera) group.position.copy(camera.position);
    },
    dispose() {
      texture.dispose();
      geometry.dispose();
      material.dispose();
      group.clear();
    },
  };
}
async function procedural(id, signal) {
  if (id === 'vesper-forest') {
    const { createVesperBackdrop } =
      await import('../levels/vesper-forest/backdrop/index.js');
    abort(signal);
    return createVesperBackdrop();
  }
  if (id === 'ravel') {
    const { createRavelBackdrop } = await import('../levels/ravel/backdrop.js');
    abort(signal);
    return createRavelBackdrop();
  }
  if (id === 'oriel') {
    const { createOrielBackdrop } =
      await import('../levels/oriel/backdrop/index.js');
    abort(signal);
    return createOrielBackdrop();
  }
  throw new Error('Missing registered backdrop for ' + id);
}

function celestial(source, id, preview) {
  const localCamera = { position: new T.Vector3() };
  if (id === 'helion') {
    // Keep the photosphere, additive corona and stars in their authored depth
    // order behind nearby ships and roads, even for a large editor overview.
    source.group.scale.setScalar(5);
    source.group.traverse((node) => {
      if (node.isPoints) node.material.size *= 5;
    });
  }
  const update = source.update;
  source.update = (frame = {}) => {
    if (frame.camera) source.group.position.copy(frame.camera.position);
    update({
      ...frame,
      camera: localCamera,
      settings: {
        ...frame.settings,
        ...(preview ? { reducedMotion: true } : {}),
      },
    });
  };
  source.far = 200000;
  source.group.userData.editorCelestial = true;
  return source;
}
/** Whole-course sky only: no campaign terrain, fixed landmarks or active hazards. */
export async function createEditorBackdrop(
  document,
  {
    signal,
    track = null,
    preview = false,
    settings = {},
    loadTexture = (url) => new T.TextureLoader().loadAsync(url),
  } = {},
) {
  const id = editorBiome(document.biome).id;
  abort(signal);
  let source;
  if (id === 'nightweir') {
    const { createNightweirBackdrop } =
      await import('../levels/nightweir/backdrop/index.js');
    abort(signal);
    source = await createNightweirBackdrop({ loadTexture });
  } else if (id === 'nacre' && document.environment?.layoutVersion >= 4) {
    const { createNacreBackdrop } =
      await import('../levels/nacre/backdrop/index.js');
    abort(signal);
    const skyTexture = await loadTexture(
      assetURL('assets/levels/nacre/nacre-storm-sky-v1.png'),
    );
    const storm = createNacreBackdrop({ settings, skyTexture });
    const localCamera = new T.Vector3();
    const direction = new T.Vector3();
    // The campaign storm sky is defined relative to sea level. The seeded sea
    // can move when road reservations change without requiring a new panorama.
    source = {
      ...storm,
      assets: { skyTexture },
      update(frame) {
        const datum =
          frame.oceanWaterY ??
          track?.editorRegionPlan?.oceanWaterY ??
          document.settings?.waterLevel ??
          0;
        storm.group.position.y = datum;
        localCamera.copy(frame.camera.position).y -= datum;
        frame.camera.getWorldDirection?.(direction);
        storm.update(localCamera, frame.time, frame.settings, {
          direction,
          enabled:
            !preview && (frame.mode === 'racing' || frame.mode === 'paused'),
          reset: frame.reset,
        });
      },
    };
  } else if (id === 'orbital') {
    const { createOrbitalBackdrop } =
      await import('../levels/orbital/backdrop/index.js');
    abort(signal);
    const orbit = await createOrbitalBackdrop({
      loadTexture,
      cameraRelative: true,
    });
    source = {
      ...orbit,
      update: ({ camera }) => orbit.update(camera.position),
    };
    source.group.userData.editorCelestial = true;
  } else if (id === 'helion' || id === 'umbra') {
    const module =
      id === 'helion'
        ? await import('../levels/helion/backdrop/index.js')
        : await import('../levels/umbra/backdrop/index.js');
    abort(signal);
    source = celestial(
      id === 'helion'
        ? await module.createHelionBackdrop({ settings, loadTexture })
        : await module.createUmbraBackdrop({
            settings,
            loadTexture,
            distant: true,
          }),
      id,
      preview,
    );
  } else {
    source = SKIES[id]
      ? await panorama(id, loadTexture, signal)
      : await procedural(id, signal);
  }
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal?.removeEventListener('abort', dispose);
    source.dispose();
  };
  if (signal?.aborted) {
    dispose();
    abort(signal);
  }
  signal?.addEventListener('abort', dispose, { once: true });
  source.group.name = `${editorBiome(id).label} / editor sky`;
  source.group.userData.aoExclude = true;
  source.group.userData.editorBiome = id;
  source.group.userData.editorSkyOnly = true;
  return {
    ...source,
    ready: Promise.resolve(source.ready),
    update(frame = {}) {
      if (!disposed)
        source.update?.({
          ...frame,
          camera: frame.camera ?? { position: source.group.position },
        });
    },
    dispose,
  };
}
