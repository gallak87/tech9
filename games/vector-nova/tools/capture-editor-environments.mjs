import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  launchVerificationBrowser,
  collectPageErrors,
} from './verification-browser.mjs';

// Static art comparisons use the real renderer, road, environment, ship and
// chase rig. They do not step simulation or establish foreground FPS headroom.
const base = process.env.VN_URL;
if (!base) throw new Error('Set VN_URL to an isolated Vector Nova server.');
const evidence = process.env.VN_EVIDENCE
  ? resolve(process.env.VN_EVIDENCE)
  : null;
const selected = (value, fallback) =>
  (value || fallback).split(',').map((part) => part.trim());
const courses = selected(process.env.VN_COURSES, 'circuit,downhill');
const qualities = selected(process.env.VN_QUALITIES, 'high,low');
const views = selected(
  process.env.VN_VIEWS,
  'overview,race-12,race-38,race-65,race-85,pre-jump',
);
const biome = process.env.VN_BIOME || 'shatterline';
const layout = Number(process.env.VN_LAYOUT ?? 2);
const diagnostic = process.env.VN_DIAGNOSTIC || null;
assert(diagnostic === null || diagnostic === 'plain-terrain');
const seed = Number(process.env.VN_SEED ?? 42017);
const environmentSeed = Number(process.env.VN_WORLD_SEED ?? 90210);
const viewport = {
  width: Number(process.env.VN_WIDTH ?? 1440),
  height: Number(process.env.VN_HEIGHT ?? 900),
};
const format = 'png';
assert(courses.every((course) => ['circuit', 'downhill'].includes(course)));
assert(qualities.every((quality) => ['high', 'low'].includes(quality)));
if (evidence) await mkdir(evidence, { recursive: true });
const browser = await launchVerificationBrowser();
const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
const errors = [],
  glErrors = [],
  results = [];
const watchdog = setTimeout(() => {
  process.exitCode = 1;
  void browser.close();
}, 240000);
const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#111}</style><script type="module">
import * as T from '__THREE_IMPORT__';
import {createRenderer} from '/src/renderer/index.js';
import {createEditorLevel} from '/src/editor/nightweir.js';
import {generateDocument, validateDocument} from '/src/editor/document.js';
import {editorBiome} from '/src/editor/biomes.js';
import {createShip} from '/src/ships/index.js';
import {createCameraRig} from '/src/camera/index.js';
window.__EDITOR_ART = { T };
const capture = window.__EDITOR_ART;
capture.load = async (options) => {
  capture.dispose?.();
  const character = editorBiome(options.biome).presets.find((p)=>p.id===options.preset) ?? editorBiome(options.biome).presets[0];
  const document = validateDocument(generateDocument({
    seed:options.seed, environmentSeed:options.environmentSeed,
    biome:options.biome, sceneryPreset:character.id, density:character.density,
    waterLevel:character.waterLevel, courseType:options.courseType,
    length:options.length, bendiness:.55, elevation:.55,
    jumpFrequency:'normal', jumpSize:'mixed',
    environment:{version:1,seed:options.environmentSeed,layoutVersion:options.layout},
  }));
  const definition = createEditorLevel(document), track = definition.createTrack();
  const settings = {quality:'high',reducedMotion:true,steeringAssist:.3,volume:0,masterVolume:0,musicVolume:0};
  const view = await createRenderer(globalThis.document.body, settings, {...definition.renderer,createBackdrop:(context)=>definition.createBackdrop({...context,track})});
  const context = {track,view,settings};
  const road = await definition.createRoad(context), environment = await definition.createEnvironment(context);
  view.scene.add(road.group,environment.group);
  await Promise.all([road.ready,environment.ready]);
  const ship = await createShip({id:'kestrel'}), bounds = new T.Box3().setFromObject(ship.group);
  view.scene.add(ship.group);
  const reflectionPoint = track.sample(100).position.add(new T.Vector3(0,8,0));
  view.follow(reflectionPoint);
  const reflection = view.bakeCityReflection(reflectionPoint,[ship.group]);
  road.setReflection?.(reflection);environment.setReflection?.(reflection);
  ship.group.traverse((node)=>{for(const material of [node.material].flat().filter(Boolean))if(material.isMeshStandardMaterial)material.envMap=reflection;});
  const rig = createCameraRig(view.camera,definition.camera,bounds);
  Object.assign(capture,{view,track,document,settings,road,environment,ship,rig});
  capture.dispose=()=>{road.dispose();environment.dispose();ship.dispose();view.dispose();};
  capture.quality = async (quality) => {settings.quality=quality;view.apply();await view.warm();};
  capture.pose = (kind) => {
    let station = 0;
    if(kind==='overview') {
      const center=track.bounds.getCenter(new T.Vector3()),size=track.bounds.getSize(new T.Vector3());
      const distance=Math.max(size.x,size.z,size.y*1.4)*1.2;
      ship.group.visible=false;view.camera.fov=55;view.camera.up.set(0,1,0);
      view.camera.position.copy(center).add(new T.Vector3(.7,.9,1).normalize().multiplyScalar(distance));view.camera.lookAt(center);view.camera.updateProjectionMatrix();
      view.follow(center);view.updatePresentation({mode:'fly',time:12,dt:0});
    } else {
      const limit=track.finishDistance??track.length;
      station=kind==='pre-jump' && track.jumps.length ? Math.max(0,track.jumps[0].takeoff-100) : Number(kind.slice(5))/100*limit;
      if(kind!=='pre-jump' && track.isJumpProtected(station)) {
        const requested=station;
        // Find the nearest ordinary road on either side, rather than moving
        // every sample in a long jump recovery to the same later station.
        for(let radius=20;radius<limit;radius+=20) {
          const safe=[requested-radius,requested+radius].find((candidate)=>candidate>=100 && candidate<limit-100 && !track.isJumpProtected(candidate));
          if(safe!==undefined){station=safe;break;}
        }
      }
      const f=track.sample(station);
      const position=f.position.clone().addScaledVector(f.up,.72);
      const state={distance:station,lateral:0,speed:112,heading:0,time:12,energy:1};
      const pose={position,quaternion:f.quaternion,grounded:true};
      ship.group.visible=true;ship.group.position.copy(position);ship.group.quaternion.copy(f.quaternion);ship.update({speed:112,time:12,reducedMotion:true});
      rig.reset();view.camera.fov=64;view.camera.updateProjectionMatrix();
      for(let i=0;i<100;i++)rig.update(track,state,1/60,{worldPose:pose,subject:ship.group,reducedMotion:true});
      view.follow(position);view.updateContact(track,state);
      view.updatePresentation({mode:'racing',time:12,dt:0});environment.update?.({time:12,settings,state});
    }
    view.camera.updateMatrixWorld();
    return {station,position:view.camera.position.toArray(),quaternion:view.camera.quaternion.toArray(),fov:view.camera.fov};
  };
  capture.measure = async () => {
    const cpu=[];view.resetMetrics();
    for(let i=0;i<40;i++)await new Promise((done)=>requestAnimationFrame((now)=>{const start=performance.now();view.render(now);cpu.push(performance.now()-start);done();}));
    const gl=view.renderer.getContext(),extension=gl.getExtension('EXT_disjoint_timer_query_webgl2');
    let gpuMs=null;
    if(extension){const query=gl.createQuery();gl.beginQuery(extension.TIME_ELAPSED_EXT,query);view.render(performance.now());gl.endQuery(extension.TIME_ELAPSED_EXT);for(let i=0;i<120;i++){await new Promise(requestAnimationFrame);if(gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE)){if(!gl.getParameter(extension.GPU_DISJOINT_EXT))gpuMs=gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6;break;}}gl.deleteQuery(query);}
    cpu.sort((a,b)=>a-b);
    return {...view.getMetrics(),cpuRenderMs:{p50:cpu[Math.floor(cpu.length*.5)],p95:cpu[Math.floor(cpu.length*.95)]},gpuMs,gpuTimingNote:extension?'Single non-disjoint GPU sample when available':'GPU timer unavailable',timingNote:'Matched warm static draws; headless RAF and submission timings do not certify foreground FPS headroom.'};
  };
  capture.pose('race-12');
  await view.warm();
  return {name:document.name,courseType:document.courseType,biome:document.biome,preset:document.settings.sceneryPreset,layout:document.environment.layoutVersion,points:document.points.length,jumps:document.jumps.length,length:track.length};
};
window.ready=true;
</script>`;

try {
  const page = await context.newPage();
  collectPageErrors(page, errors);
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      /WebGL|GL_INVALID|shader|OUT_OF_MEMORY|context lost/i.test(message.text())
    )
      glErrors.push(message.text());
  });
  const rendererSource = await (
    await context.request.get(new URL('/src/renderer/index.js', base).href)
  ).text();
  const threeImport = rendererSource.match(
    /import \* as T from ['"]([^'"]+)['"]/,
  );
  assert(threeImport, 'the served renderer exposes its resolved Three module');
  await page.route('**/__editor_environment_capture__', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: html.replace('__THREE_IMPORT__', threeImport[1]),
    }),
  );
  await page.goto(new URL('/__editor_environment_capture__', base).href);
  await page.waitForFunction(() => window.ready, null, { timeout: 90000 });
  for (const courseType of courses) {
    const info = await page.evaluate(
      (options) => window.__EDITOR_ART.load(options),
      {
        biome,
        preset: process.env.VN_PRESET,
        layout,
        seed,
        environmentSeed,
        courseType,
        length: Number(
          process.env.VN_LENGTH ?? (courseType === 'circuit' ? 4000 : 10000),
        ),
      },
    );
    console.log('Loaded', JSON.stringify(info));
    if (diagnostic)
      await page.evaluate(() => {
        const { T, environment } = window.__EDITOR_ART;
        for (const child of environment.group.children)
          if (child.isGroup) child.visible = false;
        environment.group.traverse((mesh) => {
          if (!mesh.userData.regionChunk) return;
          const material = new T.MeshStandardMaterial({
            color: '#a2a2a2',
            roughness: 1,
          });
          environment.materials.add(material);
          mesh.material = material;
        });
      });
    for (const quality of qualities) {
      await page.evaluate(
        (quality) => window.__EDITOR_ART.quality(quality),
        quality,
      );
      for (const kind of views) {
        const pose = await page.evaluate(
          (kind) => window.__EDITOR_ART.pose(kind),
          kind,
        );
        const metrics = await page.evaluate(() =>
          window.__EDITOR_ART.measure(),
        );
        const file =
          [biome, courseType, quality, kind].join('-') + '.' + format;
        if (evidence)
          await page.screenshot({
            path: resolve(evidence, file),
            type: format,
          });
        results.push({
          ...info,
          quality,
          kind,
          pose,
          file: evidence ? file : null,
          metrics,
        });
        console.log(
          'Captured',
          file,
          JSON.stringify({
            calls: metrics.calls,
            triangles: metrics.triangles,
            textureMiB: metrics.textureMiB,
            gpuMs: metrics.gpuMs,
          }),
        );
      }
    }
  }
  assert.deepEqual(errors, [], 'capture has no page errors');
  assert.deepEqual(glErrors, [], 'capture has no WebGL/shader errors');
  if (evidence)
    await writeFile(
      resolve(evidence, 'manifest.json'),
      JSON.stringify(
        { viewport, layout, seed, environmentSeed, diagnostic, results },
        null,
        2,
      ),
    );
  else
    console.log(
      JSON.stringify({ viewport, layout, seed, environmentSeed, results }),
    );
} finally {
  clearTimeout(watchdog);
  await context.close();
  await browser.close();
}
