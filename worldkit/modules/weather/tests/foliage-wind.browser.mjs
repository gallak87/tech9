/* global window */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../../../', import.meta.url));
await mkdir(path.join(root, '.experiments'), { recursive: true });
const scratch = await mkdtemp(path.join(root, '.experiments/foliage-wind-'));
let server, browser;
try {
  await writeFile(path.join(scratch, 'index.html'), `<!doctype html><script type="module">
import * as T from 'three';
import {createFoliageWind} from '/modules/weather/src/foliage-wind.js';
import {createWeatherState} from '/modules/weather/src/state.js';
import {createFoliageSprayGeometry} from '/modules/living-forest/src/geometry.js';
const renderer=new T.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
renderer.setSize(320,240);renderer.shadowMap.enabled=true;renderer.info.autoReset=false;
document.body.append(renderer.domElement);
const errors=[];renderer.debug.onShaderError=(gl,program,vertex,fragment)=>errors.push(gl.getProgramInfoLog(program)+' '+gl.getShaderInfoLog(vertex)+' '+gl.getShaderInfoLog(fragment));
const scene=new T.Scene();scene.background=new T.Color('#39434a');
const camera=new T.PerspectiveCamera(48,320/240,.1,100);camera.position.set(13,13,21);camera.lookAt(0,1,2);
scene.add(new T.HemisphereLight(0xd9ebff,0x35452d,1.1));
const sun=new T.DirectionalLight(0xffffff,3);sun.position.set(3,12,8);sun.castShadow=true;sun.shadow.mapSize.set(256,256);Object.assign(sun.shadow.camera,{left:-16,right:16,top:16,bottom:-16,near:.1,far:60});scene.add(sun);
const point=new T.PointLight(0xffd1a1,100,60);point.position.set(-7,9,5);point.castShadow=true;point.shadow.mapSize.set(128,128);scene.add(point);
const ground=new T.Mesh(new T.PlaneGeometry(80,80),new T.MeshStandardMaterial({color:0x687967}));ground.rotation.x=-Math.PI/2;ground.position.y=-1;ground.receiveShadow=true;scene.add(ground);
const pixels=new Uint8Array(32*32*4);for(let y=0;y<32;y++)for(let x=0;x<32;x++){let i=(y*32+x)*4;pixels[i]=85;pixels[i+1]=165;pixels[i+2]=45;pixels[i+3]=((x-16)**2/220+(y-17)**2/250<1||Math.abs(x-16)<2)?255:0;}
const map=new T.DataTexture(pixels,32,32);map.needsUpdate=true;
const material=new T.MeshStandardMaterial({map,color:0xa8bc79,side:T.DoubleSide,alphaTest:.5,roughness:.8});
const geometry=createFoliageSprayGeometry({length:8,width:5,bend:.7,wind:true,phase:1.2});
const mesh=new T.InstancedMesh(geometry,material,2);mesh.setMatrixAt(0,new T.Matrix4().compose(new T.Vector3(-5,1,0),new T.Quaternion().setFromEuler(new T.Euler(.4,.2,.2)),new T.Vector3(1,1.4,1.1)));mesh.setMatrixAt(1,new T.Matrix4().compose(new T.Vector3(4,2,0),new T.Quaternion().setFromEuler(new T.Euler(-.2,-.6,-.1)),new T.Vector3(.8,1.3,.9)));mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);
const crown=new T.Mesh(geometry,material);crown.position.set(0,5,-5);crown.rotation.set(.3,.7,.6);crown.scale.set(1.4,1.2,1.6);crown.castShadow=true;scene.add(crown);
const weather=createWeatherState({wind:.85,windDirection:25,transition:0});weather.update(.05);
const wind=createFoliageWind({maxOffset:2.4});
function image(){renderer.info.reset();renderer.render(scene,camera);const data=new Uint8Array(320*240*4);renderer.getContext().readPixels(0,0,320,240,renderer.getContext().RGBA,renderer.getContext().UNSIGNED_BYTE,data);return{data,calls:renderer.info.render.calls};}
function shadowImages(){material.colorWrite=false;material.depthWrite=false;point.intensity=0;sun.intensity=3;const sunImage=image().data;point.intensity=100;sun.intensity=0;const pointImage=image().data;point.intensity=100;sun.intensity=3;material.colorWrite=true;material.depthWrite=true;return{sun:sunImage,point:pointImage};}
function overrideImage(material){scene.overrideMaterial=material;const data=image().data;scene.overrideMaterial=null;return data;}
const normalOverride=new T.MeshNormalMaterial(),depthOverride=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking});
function changes(a,b){let count=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])count++;return count;}
image();wind.bind(mesh);wind.bind(crown);wind.update({...weather.current,windX:0,windZ:0});const original=image();wind.update(weather.current);
const before=image(),shadowsBefore=shadowImages(),normalBefore=overrideImage(normalOverride),depthBefore=overrideImage(depthOverride);
for(let i=0;i<70;i++){weather.update(.05);wind.update(weather.current);}
const after=image(),shadowsAfter=shadowImages(),normalAfter=overrideImage(normalOverride),depthAfter=overrideImage(depthOverride);
weather.configure({paused:true});for(let i=0;i<30;i++){weather.update(.05);wind.update(weather.current);}
const paused=image();weather.configure({paused:false});for(let i=0;i<30;i++){weather.update(.05);wind.update(weather.current,{reducedMotion:true});}
const reduced=image();
window.__foliageWindResult={errors,changed:changes(before.data,after.data),sunChanged:changes(shadowsBefore.sun,shadowsAfter.sun),pointChanged:changes(shadowsBefore.point,shadowsAfter.point),normalChanged:changes(normalBefore,normalAfter),depthChanged:changes(depthBefore,depthAfter),pausedChanged:changes(after.data,paused.data),reducedChanged:changes(after.data,reduced.data),originalCalls:original.calls,windCalls:after.calls,programs:renderer.info.programs.length};
wind.dispose();renderer.dispose();
</script>`);
  server = await createServer({
    root,
    configFile: false,
    logLevel: 'error',
    cacheDir: path.join(scratch, '.vite'),
    server: { host: '127.0.0.1', port: 0 },
    resolve: { dedupe: ['three'] },
  });
  await server.listen();
  const port = server.httpServer.address().port;
  browser = await chromium.launch({channel:process.env.WK_BROWSER_CHANNEL ?? 'chrome',headless:true,args:['--mute-audio']});
  const page = await browser.newPage({viewport:{width:360,height:280}});
  const errors=[];page.on('pageerror',(error)=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/.experiments/${path.basename(scratch)}/index.html`);
  await page.waitForFunction(()=>window.__foliageWindResult,{},{timeout:30000});
  const result=await page.evaluate(()=>window.__foliageWindResult);
  assert.deepEqual(errors,[]);
  assert.deepEqual(result.errors,[],'all beauty/depth/distance shader programs compile');
  assert.ok(result.changed>100,'rendered foliage moves over shared Weather time');
  assert.ok(result.sunChanged>100,'directional shadow follows the moving leaves');
  assert.ok(result.pointChanged>100,'point shadow follows the moving leaves');
  assert.ok(result.normalChanged>100,'normal overrides retain moving leaf geometry');
  assert.ok(result.depthChanged>100,'depth overrides retain moving leaf geometry');
  assert.equal(result.pausedChanged,0,'pause freezes the rendered pose');
  assert.equal(result.reducedChanged,0,'reduced motion holds a static pose');
  assert.equal(result.windCalls,result.originalCalls,'motion adds no draw calls with equal conservative culling bounds');
  console.log(JSON.stringify(result));
} finally {
  await browser?.close();
  await server?.close();
  await rm(scratch,{recursive:true,force:true});
}
