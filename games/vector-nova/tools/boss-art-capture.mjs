import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Actual browser factories in the production inspection stage. Images are
// temporary comparison evidence; metrics go to stdout rather than reports.
const options = {
  out: '.experiments/boss-art/baseline',
  ships: 'goliath,wraith,bulwark,kestrel',
  views: 'front,aft',
  quality: 'high',
  size: '1100x800',
  asset: '',
};
for (let index = 2; index < process.argv.length; index++) {
  const argument = process.argv[index];
  if (argument === '--help') {
    console.log(
      'node tools/boss-art-capture.mjs [--out PATH] [--ships goliath,wraith,bulwark,kestrel] [--views front,aft,detail,intake,bow] [--quality high|low|both] [--size 1100x800]',
    );
    process.exit(0);
  }
  const [flag, inline] = argument.replace(/^--/, '').split('=');
  if (!Object.hasOwn(options, flag))
    throw new Error('Unknown capture option: ' + argument);
  options[flag] = inline ?? process.argv[++index];
}
const subjects = options.ships.split(',');
const views = options.views.split(',');
const qualities =
  options.quality === 'both' ? ['high', 'low'] : [options.quality];
const [width, height] = options.size.split('x').map(Number);
if (
  !subjects.every((id) =>
    ['goliath', 'wraith', 'bulwark', 'kestrel'].includes(id),
  ) ||
  !views.every((view) =>
    ['front', 'aft', 'detail', 'intake', 'bow'].includes(view),
  ) ||
  !qualities.every((quality) => ['high', 'low'].includes(quality)) ||
  !Number.isInteger(width) ||
  !Number.isInteger(height) ||
  width < 320 ||
  height < 240
)
  throw new Error('Invalid subject, view, quality or image size. See --help.');
const output = resolve(options.out);
await mkdir(output, { recursive: true });
const base = process.env.VN_URL ?? 'http://127.0.0.1:5213';
const browser = await chromium.launch({
  channel: process.env.VN_BROWSER_CHANNEL ?? 'chrome',
  headless: true,
  args: ['--mute-audio'],
});
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.route('**/__boss-art-capture', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><head><title>Boss art capture</title><style>html,body{margin:0;overflow:hidden;background:#131b23}canvas{display:block}</style></head><body></body></html>',
    }),
  );
  await page.goto(new URL('/__boss-art-capture', base).href);
  await page.evaluate(
    async ({ width, height }) => {
      // Use Vite's exact Three.js module URL so every imported factory shares one
      // renderer/type instance, including the optimized dependency version query.
      const stageSource = await (
        await fetch('/src/ships/inspection-stage.js')
      ).text();
      const moduleURL = stageSource.match(
        /import\s+\*\s+as\s+THREE\s+from\s+['"]([^'"]+)['"]/i,
      )?.[1];
      if (!moduleURL)
        throw new Error('Cannot locate the production studio Three.js module');
      const T = await import(moduleURL);
      const [
        { createInspectionStage },
        { createInspectionPipeline },
        { createShip },
        { createBossTarget },
        { configureShipTextures },
      ] = await Promise.all([
        import('/src/ships/inspection-stage.js'),
        import('/src/ships/inspection-pipeline.js'),
        import('/src/ships/index.js'),
        import('/src/ships/boss-targets.js'),
        import('/src/ships/texture-loader.js'),
      ]);
      // Immutable metre-space framing: changing a model never quietly reframes
      // its comparison. Kestrel is the approved exported reference (revision12).
      const bounds = {
        goliath: { min: [-8, -0.2, -20], max: [8, 5.8, 20] },
        wraith: { min: [-4, -0.15, -9], max: [4, 2.85, 9] },
        bulwark: { min: [-6, -0.2, -10], max: [6, 3.8, 10] },
        kestrel: {
          min: [-1.6864900588989258, -0.03999999910593033, -3.2200000286102295],
          max: [1.6864900588989258, 1.3417441844940186, 3.696706533432007],
        },
      };
      const details = {
        goliath: { center: [-5.4, 2.5, -19.3], span: 5.1 },
        wraith: { center: [-2.4, 0.8, -8.7], span: 2.5 },
        bulwark: { center: [-4.2, 1.1, -9.7], span: 3.1 },
        kestrel: { center: [-0.955, 0.448, -3.1], span: 1.5 },
      };
      const renderer = new T.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      });
      configureShipTextures(renderer);
      renderer.setPixelRatio(1);
      renderer.setSize(width, height);
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.type = T.PCFShadowMap;
      renderer.info.autoReset = false;
      document.body.append(renderer.domElement);
      let subject,
        stage,
        pipeline,
        camera,
        currentId,
        currentScale,
        assetResources = new Set(),
        currentAsset;
      const referenceLength = bounds.kestrel.max[2] - bounds.kestrel.min[2];
      const boxFor = (id) =>
        new T.Box3(
          new T.Vector3().fromArray(bounds[id].min),
          new T.Vector3().fromArray(bounds[id].max),
        );
      const release = () => {
        subject?.dispose();
        assetResources.forEach((resource) => resource.dispose());
        assetResources.clear();
        pipeline?.dispose();
        stage?.dispose();
        subject = pipeline = stage = null;
      };
      window.__bossArtStudio = {
        async load(id, quality, asset) {
          currentAsset = asset;
          release();
          currentId = id;
          const box = boxFor(id),
            center = box.getCenter(new T.Vector3());
          currentScale =
            (bounds[id].max[2] - bounds[id].min[2]) / referenceLength;
          stage = createInspectionStage(renderer);
          // Only the stage dimensions/light positions change with subject size.
          // Models retain real metres and material coordinates; the same PMREM,
          // colors, intensities and ACES exposure are used for every subject.
          for (const object of stage.scene.children) {
            object.position.multiplyScalar(currentScale);
            if (object.isMesh) object.scale.multiplyScalar(currentScale);
            if (object.shadow?.camera) {
              for (const property of [
                'left',
                'right',
                'top',
                'bottom',
                'near',
                'far',
              ])
                object.shadow.camera[property] *= currentScale;
              object.shadow.normalBias *= currentScale;
              object.shadow.camera.updateProjectionMatrix();
            }
          }
          subject = await (id === 'kestrel'
            ? createShip({ id })
            : createBossTarget(id, { quality, reducedMotion: true }));
          if (asset) {
            const { loadFleetGLTF } =
              await import('/src/ships/texture-loader.js');
            const result = await loadFleetGLTF(asset);
            result.scene.traverse((object) => {
              if (object.isMesh)
                object.castShadow = object.receiveShadow = true;
              if (object.geometry) assetResources.add(object.geometry);
              for (const material of Array.isArray(object.material)
                ? object.material
                : [object.material])
                if (material) {
                  assetResources.add(material);
                  for (const value of Object.values(material))
                    if (value?.isTexture) assetResources.add(value);
                }
            });
            const original = subject.group.children.find((child) =>
              /chassis/.test(child.name),
            );
            if (!original)
              throw new Error('No authored chassis for asset comparison');
            original.removeFromParent();
            subject.group.add(result.scene);
          }
          subject.group.position.set(
            -center.x,
            0.11 * currentScale - bounds[id].min[1],
            -center.z,
          );
          stage.scene.add(subject.group);
          camera = new T.PerspectiveCamera(
            39,
            width / height,
            0.03 * currentScale,
            300 * currentScale,
          );
          pipeline = createInspectionPipeline(renderer, stage.scene, camera);
        },
        async capture(view, quality) {
          subject.update({
            speed: 0,
            boost: false,
            steer: 0,
            time: 0,
            energy: 1,
            quality,
            reducedMotion: true,
          });
          const frontDetails = {
            goliath: { center: [2.4, 3.8, 9.5], span: 7.5 },
            wraith: { center: [1.3, 1.2, -1.6], span: 6 },
            bulwark: { center: [0, 2.6, 5.5], span: 8 },
            kestrel: details.kestrel,
          };
          const detail =
            view === 'bow'
              ? frontDetails[currentId]
              : view === 'intake' && currentId === 'goliath'
                ? { center: [4.7, 2.9, 10.5], span: 7.1 }
                : details[currentId];
          const box =
            view === 'detail' || view === 'intake' || view === 'bow'
              ? new T.Box3().setFromCenterAndSize(
                  new T.Vector3().fromArray(detail.center),
                  new T.Vector3(1, 0.8, 1).multiplyScalar(detail.span),
                )
              : boxFor(currentId);
          box.translate(subject.group.position);
          const center = box.getCenter(new T.Vector3());
          const direction =
            view === 'intake'
              ? new T.Vector3(1.6, 0.5, 0.8).normalize()
              : new T.Vector3(
                  view === 'front' || view === 'bow' ? 1.1 : -1.1,
                  0.75,
                  view === 'front' || view === 'bow' ? 1.45 : -1.45,
                ).normalize();
          camera.position.copy(center).add(direction);
          camera.lookAt(center);
          const rotation = camera.quaternion.clone().invert(),
            tangent = Math.tan(T.MathUtils.degToRad(camera.fov / 2));
          let distance = 0;
          for (const x of [box.min.x, box.max.x])
            for (const y of [box.min.y, box.max.y])
              for (const z of [box.min.z, box.max.z]) {
                const corner = new T.Vector3(x, y, z)
                  .sub(center)
                  .applyQuaternion(rotation);
                distance = Math.max(
                  distance,
                  corner.z +
                    Math.max(
                      Math.abs(corner.x) / (tangent * camera.aspect),
                      Math.abs(corner.y) / tangent,
                    ),
                );
              }
          camera.position
            .copy(center)
            .addScaledVector(direction, distance * 1.1);
          camera.updateProjectionMatrix();
          stage.scene.updateMatrixWorld(true);
          await renderer.compileAsync(stage.scene, camera);
          const draw = () =>
            stage.render(() => pipeline.render({ heat: false, quality }));
          draw();
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
          renderer.info.reset();
          draw();
          const geometries = new Set(),
            materials = new Set(),
            textures = new Set();
          let meshes = 0,
            subjectTriangles = 0;
          subject.group.traverse((object) => {
            if (!object.isMesh || !object.visible) return;
            meshes++;
            if (object.geometry) {
              geometries.add(object.geometry);
              subjectTriangles +=
                (object.geometry.index?.count ??
                  object.geometry.attributes.position?.count ??
                  0) / 3;
            }
            for (const material of Array.isArray(object.material)
              ? object.material
              : [object.material]) {
              materials.add(material);
              for (const value of Object.values(material ?? {}))
                if (value?.isTexture) textures.add(value);
            }
          });
          return {
            subject: currentId,
            view,
            quality,
            asset: currentAsset || null,
            pipeline: 'production inspection stage + inspection pipeline',
            exposure: 1.12,
            framingBounds: bounds[currentId],
            studioScale: currentScale,
            modelScale: subject.group.scale.toArray(),
            camera: {
              position: camera.position.toArray(),
              target: center.toArray(),
              fov: camera.fov,
            },
            meshes,
            materials: materials.size,
            geometries: geometries.size,
            subjectTriangles,
            subjectTextures: textures.size,
            draws: renderer.info.render.calls,
            triangles: renderer.info.render.triangles,
            textures: renderer.info.memory.textures,
            gpuGeometries: renderer.info.memory.geometries,
          };
        },
        dispose() {
          release();
          renderer.dispose();
          renderer.forceContextLoss();
          renderer.domElement.remove();
        },
      };
    },
    { width, height },
  );
  for (const id of subjects)
    for (const quality of qualities) {
      await page.evaluate(
        ({ id, quality, asset }) =>
          window.__bossArtStudio.load(id, quality, asset),
        { id, quality, asset: options.asset },
      );
      for (const view of views) {
        const metrics = await page.evaluate(
          ({ view, quality }) => window.__bossArtStudio.capture(view, quality),
          { view, quality },
        );
        const path = resolve(
          output,
          id + '-' + view + (quality === 'low' ? '-low' : '') + '.png',
        );
        await page.locator('canvas').screenshot({ path });
        console.log(
          JSON.stringify({
            path,
            width,
            height,
            ...metrics,
            errors: [...errors],
          }),
        );
        if (errors.length)
          throw new Error('Browser capture errors: ' + errors.join('; '));
      }
    }
  await page.evaluate(() => window.__bossArtStudio.dispose());
} finally {
  await browser.close();
}
