import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchVerificationBrowser } from './verification-browser.mjs';

export async function captureShipArt({ base, width, height, views, captures }) {
  const browser = await launchVerificationBrowser();
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
    await page.route('**/__ship-art-capture', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html><head><title>Ship art capture</title><style>html,body{margin:0;overflow:hidden;background:#131b23}canvas{display:block}</style></head><body></body></html>',
      }),
    );
    await page.goto(new URL('/__ship-art-capture', base).href);
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
          throw new Error(
            'Cannot locate the production studio Three.js module',
          );
        const T = await import(moduleURL);
        const [
          { createInspectionStage },
          { createInspectionPipeline },
          { createShip, resourcesFor },
          { createBossTarget },
          { configureShipTextures, loadFleetGLTF, disposeShipTextures },
        ] = await Promise.all([
          import('/src/ships/inspection-stage.js'),
          import('/src/ships/inspection-pipeline.js'),
          import('/src/ships/index.js'),
          import('/src/ships/boss-targets.js'),
          import('/src/ships/texture-loader.js'),
        ]);
        // Keep the approved silhouettes as fixed metre-space framing references.
        // Deriving these bounds from a candidate would conceal changes in scale.
        const bounds = {
          goliath: { min: [-8, -0.2, -20], max: [8, 5.8, 20] },
          wraith: { min: [-4, -0.15, -9], max: [4, 2.85, 9] },
          bulwark: { min: [-6, -0.2, -10], max: [6, 3.8, 10] },
          kestrel: {
            min: [
              -1.6864900588989258, -0.03999999910593033, -3.2200000286102295,
            ],
            max: [1.6864900588989258, 1.3417441844940186, 3.696706533432007],
          },
          shrike: { min: [-2.14, 0.01, -2.94], max: [2.14, 1.517, 3.2] },
          bastion: { min: [-1.811, 0.01, -3.28], max: [1.811, 0.922, 3.328] },
          needle: { min: [-2.042, 0.01, -3.49], max: [2.042, 1.487, 3.5] },
        };
        const playerIds = new Set(['kestrel', 'shrike', 'bastion', 'needle']);
        const details = {
          goliath: { center: [-5.4, 2.5, -19.3], span: 5.1 },
          wraith: { center: [-2.4, 0.8, -8.7], span: 2.5 },
          bulwark: { center: [-4.2, 1.1, -9.7], span: 3.1 },
          kestrel: { center: [-0.955, 0.448, -3.1], span: 1.5 },
          shrike: { center: [-1.15, 0.56, -2.9], span: 1.5 },
          bastion: { center: [-1.28, 0.51, -3.2], span: 1.5 },
          needle: { center: [0, 0.64, -3.4], span: 1.5 },
        };
        const frontDetails = {
          goliath: { center: [2.4, 3.8, 9.5], span: 7.5 },
          wraith: { center: [1.3, 1.2, -1.6], span: 6 },
          bulwark: { center: [0, 2.6, 5.5], span: 8 },
          kestrel: { center: [0.65, 0.7, 1.65], span: 2 },
          shrike: { center: [0.65, 0.8, 1.3], span: 2 },
          bastion: { center: [0.65, 0.5, 1.6], span: 2 },
          needle: { center: [0.5, 0.75, 1.7], span: 2 },
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
          currentAsset,
          customDetail;
        const referenceLength = bounds.kestrel.max[2] - bounds.kestrel.min[2];
        const assetResources = new Set();
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
        window.__shipArtStudio = {
          async load(id, quality, asset, detail) {
            release();
            currentId = id;
            currentAsset = asset;
            customDetail = detail;
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
            const model = asset
              ? (await loadFleetGLTF(asset)).scene
              : undefined;
            if (model)
              for (const resources of Object.values(resourcesFor(model)))
                for (const resource of resources) assetResources.add(resource);
            const player = playerIds.has(id);
            subject = await (player
              ? createShip({ id, model })
              : createBossTarget(id, { quality, reducedMotion: true }));
            if (model && !player) {
              model.traverse((object) => {
                if (object.isMesh)
                  object.castShadow = object.receiveShadow = true;
              });
              const original = subject.group.children.find((child) =>
                /chassis/.test(child.name),
              );
              if (!original)
                throw new Error('No authored chassis for asset comparison');
              original.removeFromParent();
              subject.group.add(model);
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
            const detail =
              customDetail ??
              (view === 'bow'
                ? frontDetails[currentId]
                : view === 'intake' && currentId === 'goliath'
                  ? { center: [4.7, 2.9, 10.5], span: 7.1 }
                  : details[currentId]);
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
            disposeShipTextures();
            renderer.dispose();
            renderer.forceContextLoss();
            renderer.domElement.remove();
          },
        };
      },
      { width, height },
    );
    for (const [
      index,
      { id, quality, output, asset, file, detail },
    ] of captures.entries()) {
      const candidateRoute = new URL(
        `/__ship-art-capture/model-${index}.glb`,
        base,
      ).href;
      const serveFile = (route) =>
        route.fulfill({ path: file, contentType: 'model/gltf-binary' });
      if (file) await page.route(candidateRoute, serveFile);
      try {
        await page.evaluate(
          ({ id, quality, asset, detail }) =>
            window.__shipArtStudio.load(id, quality, asset, detail),
          { id, quality, asset: file ? candidateRoute : asset, detail },
        );
      } finally {
        if (file) await page.unroute(candidateRoute, serveFile);
      }
      if (errors.length)
        throw new Error('Browser capture errors: ' + errors.join('\n'));
      await mkdir(output, { recursive: true });
      for (const view of views) {
        const metrics = await page.evaluate(
          ({ view, quality }) => window.__shipArtStudio.capture(view, quality),
          { view, quality },
        );
        if (errors.length)
          throw new Error('Browser capture errors: ' + errors.join('\n'));
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
            asset: file ?? metrics.asset,
            errors: [...errors],
          }),
        );
      }
    }
    await page.evaluate(() => window.__shipArtStudio.dispose());
  } finally {
    await browser.close();
  }
}
