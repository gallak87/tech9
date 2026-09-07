import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// The entire chapter is an authored, miniature landscape. All scenery is batched
// by material; only actors, lights and moving machinery incur individual draws.
const TAU = Math.PI * 2;
const HERO_IDS = ['kaida', 'vex', 'rune'];
const COLORS = { kaida: 0xffbd72, vex: 0xe599ff, rune: 0x79eae0 };
const LANDMARKS = [
  { id: 'mira', name: 'Mira · Settlement keeper', x: -3, z: 14, kind: 'npc' },
  { id: 'beacon', name: 'Hearthlight Beacon', x: 0, z: 12, kind: 'build' },
  { id: 'causeway', name: 'The Broken Causeway', x: 1, z: 4, kind: 'encounter' },
  { id: 'garden', name: 'Glassroot Garden', x: -14, z: -5, kind: 'encounter' },
  { id: 'wardens', name: 'Archive Wardens', x: 12, z: -12, kind: 'encounter' },
  { id: 'boss', name: 'The Dusk Observatory', x: 0, z: -23, kind: 'boss' },
  { id: 'cache-west', name: 'A scavenger’s cache', x: -18, z: 6, kind: 'cache' },
  { id: 'cache-east', name: 'Lost supply capsule', x: 17, z: 1, kind: 'cache' },
  { id: 'memory', name: 'A voice from before', x: -15, z: -15, kind: 'memory' },
  { id: 'relay-west', name: 'Garden Relay', x: -12, z: -10, kind: 'relay' },
  { id: 'relay-east', name: 'Archive Relay', x: 12, z: -17, kind: 'relay' },
];

export function createWorld(canvas, callbacks = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.01;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9d7f8e);
  scene.fog = new THREE.FogExp2(0xa888a2, .008);
  const battleScene=new THREE.Scene();battleScene.background=new THREE.Color(0x5b4655);battleScene.fog=new THREE.FogExp2(0x776471,.014);
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 200);
  const cameraTarget = new THREE.Vector3(0, 1, -1);
  const desiredTarget = cameraTarget.clone();
  const sun = new THREE.DirectionalLight(0xffb388, 2.35);
  sun.position.set(-25, 23, -28);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 40, bottom: -40, near: .5, far: 110 });
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -.0005;
  sun.shadow.normalBias = .055;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xa3a8db, 0x593652, 1.25));
  const rim = new THREE.DirectionalLight(0x91dcff, .6);
  rim.position.set(18, 16, 16);
  scene.add(rim);
  const pmrem=new THREE.PMREMGenerator(renderer),studio=new RoomEnvironment();
  const environmentTarget=pmrem.fromScene(studio,.08);scene.environment=environmentTarget.texture;scene.environmentIntensity=.22;battleScene.environment=environmentTarget.texture;battleScene.environmentIntensity=.10;
  studio.dispose();pmrem.dispose();
  const composer=new EffectComposer(renderer),renderPass=new RenderPass(scene,camera);
  const ssaoPass=new SSAOPass(scene,camera,512,512,16);
  ssaoPass.kernelRadius=6;ssaoPass.minDistance=.003;ssaoPass.maxDistance=.085;
  const bloomPass=new UnrealBloomPass(new THREE.Vector2(512,512),.34,.52,.95),outputPass=new OutputPass();
  const flashPass=new ShaderPass({uniforms:{tDiffuse:{value:null},flash:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform sampler2D tDiffuse;uniform float flash;varying vec2 vUv;void main(){vec4 c=texture2D(tDiffuse,vUv);c.rgb+=vec3(.93,.81,.62)*flash;gl_FragColor=c;}'});
  composer.addPass(renderPass);composer.addPass(ssaoPass);composer.addPass(bloomPass);composer.addPass(flashPass);composer.addPass(outputPass);
  renderer.info.autoReset=false;

  let seed = 7813;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const range = (a, b) => a + rand() * (b - a);
  const surfaceTextures=[];
  function surfaceTexture(kind,repeat=3) {
    const c=document.createElement('canvas');c.width=512;c.height=512;const ctx=c.getContext('2d'),data=ctx.createImageData(512,512);
    for(let y=0;y<512;y++)for(let x=0;x<512;x++) {
      const u=x/512*TAU,v=y/512*TAU;
      const noise=Math.sin(u*4+Math.sin(v*3))*.4+Math.sin(v*11+u*7)*.2+Math.sin(u*39-v*21)*.09;
      let value=218+noise*17+(rand()-.5)*12;
      if(kind==='fabric')value+=((x%5===0)?-16:0)+((y%5===0)?-12:0);
      if(kind==='metal')value+=Math.sin(y*2.1)*7;
      const i=(y*512+x)*4;data.data[i]=value;data.data[i+1]=value*(kind==='soil'?.98:1);data.data[i+2]=value*(kind==='soil'?.92:.99);data.data[i+3]=255;
    }
    ctx.putImageData(data,0,0);
    if(kind==='stone'||kind==='soil') {
      for(let i=0;i<1800;i++) {ctx.fillStyle=i%3?'rgba(255,255,250,.14)':'rgba(56,51,55,.10)';ctx.beginPath();ctx.ellipse(rand()*512,rand()*512,rand()*2+.3,rand()*1.2+.3,rand()*TAU,0,TAU);ctx.fill();}
      if(kind==='stone')for(let i=0;i<15;i++) {let x=rand()*512,y=rand()*512;ctx.strokeStyle='rgba(61,62,69,.16)';ctx.lineWidth=.65;ctx.beginPath();ctx.moveTo(x,y);for(let j=0;j<5;j++){x+=range(-12,12);y+=range(5,15);ctx.lineTo(x,y);}ctx.stroke();}
    }
    const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(repeat,repeat);texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());surfaceTextures.push(texture);return texture;
  }
  const soilTexture=surfaceTexture('soil',18),stoneTexture=surfaceTexture('stone',2),fabricTexture=surfaceTexture('fabric',4),metalTexture=surfaceTexture('metal',2);
  const mats = {};
  const mat = (name, color, options = {}) => mats[name] || (mats[name] = new THREE.MeshStandardMaterial({ color, roughness: .87, ...options }));
  const m = {
    earth: mat('earth', 0x806f67), sand: mat('sand', 0xb99a7c), path: mat('path', 0xc9a68d),
    rock: mat('rock', 0x6e7080), darkRock: mat('darkRock', 0x424e66), paleRock: mat('paleRock', 0x9a9394),
    stone: mat('stone', 0x999499), stoneTop: mat('stoneTop', 0xc4bbb0), darkStone: mat('darkStone', 0x536177),
    metal: mat('metal', 0x394958, { metalness: .65, roughness: .4 }), bronze: mat('bronze', 0xb18a5a, { metalness: .58, roughness: .48 }),
    gold: mat('gold', 0xe0b776, { metalness: .42, roughness: .45 }), wood: mat('wood', 0x654c4b),
    grass: mat('grass', 0x788b8b, { side: THREE.DoubleSide }), grassGold: mat('grassGold', 0xc2a36b, { side: THREE.DoubleSide }),
    leaf: mat('leaf', 0x537e89), leafLight: mat('leafLight', 0x84aa99), coral: mat('coral', 0xd28d78),
    tent: mat('tent', 0xd29d78, { side: THREE.DoubleSide }), tentTeal: mat('tentTeal', 0x739d9c, { side: THREE.DoubleSide }),
    dark: mat('dark', 0x293247), rope: mat('rope', 0xc4ad83), skin: mat('skin', 0xe7b095),
    cyan: mat('cyan', 0x99fff2, { emissive: 0x49eacb, emissiveIntensity: 1.6, roughness: .25 }),
    pink: mat('pink', 0xf79bdd, { emissive: 0xd43cce, emissiveIntensity: 1.25 }),
    amber: mat('amber', 0xffd995, { emissive: 0xffa44c, emissiveIntensity: 1.7 }),
    violet: mat('violet', 0x73669b), orange: mat('orange', 0xbe6264),
  };
  for(const material of [m.stone,m.stoneTop,m.darkStone,m.rock,m.darkRock,m.paleRock]){material.map=stoneTexture;material.bumpMap=stoneTexture;material.bumpScale=.065;material.roughness=.93;}
  for(const material of [m.metal,m.bronze,m.gold]){material.map=metalTexture;material.roughness=.43;material.envMapIntensity=.55;}
  for(const material of [m.tent,m.tentTeal]){material.map=fabricTexture;material.bumpMap=fabricTexture;material.bumpScale=.027;}
  const pathTexture=soilTexture.clone();pathTexture.repeat.set(22,1);surfaceTextures.push(pathTexture);m.path.map=pathTexture;m.path.bumpMap=pathTexture;m.path.bumpScale=.025;
  const base = {
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(.5, 18, 12),
    ico: new THREE.IcosahedronGeometry(.5, 2),
    cyl: new THREE.CylinderGeometry(.5, .5, 1, 20),
    cone: new THREE.ConeGeometry(.5, 1, 20),
    torus: new THREE.TorusGeometry(.5, .065, 8, 64),
  };
  // A gently irregular surface remains smooth under grazing light.
  const rockPositions=base.ico.attributes.position;
  for(let i=0;i<rockPositions.count;i++){const x=rockPositions.getX(i),y=rockPositions.getY(i),z=rockPositions.getZ(i),n=1+.055*Math.sin(x*19+z*12)*Math.cos(y*15)+.027*Math.sin(z*31-y*21);rockPositions.setXYZ(i,x*n,y*n,z*n);}
  base.ico.computeVertexNormals();
  const replacements=[],sceneryBlockers=[];
  function replaceWithAsset(name,fallback,x,z,scale=[1,1,1],rotation=0) {
    fallback.userData.externalFallback=true;
    const transform=new THREE.Object3D();transform.position.set(x,0,z);transform.rotation.y=rotation;transform.scale.set(...scale);transform.updateMatrix();
    replacements.push({name,fallback,matrix:transform.matrix.clone()});
  }
  const staticRoot = new THREE.Group();
  scene.add(staticRoot);
  function mesh(kind, material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, parent = staticRoot, rx = 0, ry = 0, rz = 0) {
    const obj = new THREE.Mesh(base[kind], material);
    obj.position.set(x, y, z); obj.scale.set(sx, sy, sz); obj.rotation.set(rx, ry, rz);
    obj.castShadow = true; obj.receiveShadow = true; parent.add(obj); return obj;
  }
  const box = (material,x,y,z,sx,sy,sz,parent=staticRoot,ry=0) => mesh('box',material,x,y,z,sx,sy,sz,parent,0,ry);
  function beam(a, b, radius, material, parent = staticRoot, kind = 'cyl') {
    const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b), delta = bv.clone().sub(av);
    const obj = mesh(kind, material, ...av.clone().add(bv).multiplyScalar(.5).toArray(), radius, delta.length(), radius, parent);
    obj.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), delta.normalize()); return obj;
  }
  function group(x=0,y=0,z=0,parent=staticRoot) { const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);return g; }
  const groundY = (x,z) => .035 * Math.sin(x*.48) + .035*Math.cos(z*.42);
  function surfaceY(x,z) {
    for(const [cx,cz,hx,hz,a] of [[1,3.9,4.65,2.55,0],[-13.7,3.5,1.35,2.55,.18],[14.5,6.3,1.35,2.55,-.22]]) {
      const dx=x-cx,dz=z-cz,lx=dx*Math.cos(a)-dz*Math.sin(a),lz=dx*Math.sin(a)+dz*Math.cos(a);
      if(Math.abs(lx)<hx&&Math.abs(lz)<hz)return .41;
    }
    return groundY(x,z)+.10;
  }

  // Muted painted terrain with hand-placed routes and tiny mineral facets.
  const terrainGeo = new THREE.PlaneGeometry(116, 120, 84, 84);
  terrainGeo.rotateX(-Math.PI/2);
  const positions=terrainGeo.attributes.position, terrainColors=[];
  const c1=new THREE.Color(0xad826e), c2=new THREE.Color(0x83798b), c3=new THREE.Color(0x8da992);
  for(let i=0;i<positions.count;i++) {
    const x=positions.getX(i), z=positions.getZ(i)-3;
    positions.setZ(i,z);
    const edge=Math.max(0,Math.abs(x)-23,Math.abs(z+3)-25);
    positions.setY(i,groundY(x,z)-.1+edge*.075+rand()*.035);
    let c=c1.clone().lerp(c2,Math.min(1, .25+Math.sin(x*.23+z*.1)*.19+(z<0?.22:0)+rand()*.15));
    if(x < -8 && z < 0) c.lerp(c3,.25);
    terrainColors.push(c.r,c.g,c.b);
  }
  terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(terrainColors,3));terrainGeo.computeVertexNormals();
  const terrain = new THREE.Mesh(terrainGeo,new THREE.MeshStandardMaterial({vertexColors:true,map:soilTexture,bumpMap:soilTexture,bumpScale:.06,roughness:1}));
  terrain.receiveShadow=true;scene.add(terrain);
  function ribbon(points,width,material,y=.015) {
    const curve=new THREE.CatmullRomCurve3(points.map(([x,z])=>new THREE.Vector3(x,y,z)));
    const verts=[], uv=[], ix=[];
    const count=points.length*14;
    for(let i=0;i<=count;i++) {
      const t=i/count,p=curve.getPoint(t),dir=curve.getTangent(t),variation=1+Math.sin(i*1.75)*.05;
      for(const side of [-1,1]){verts.push(p.x+dir.z*width*.5*side*variation, y+groundY(p.x,p.z),p.z-dir.x*width*.5*side*variation);uv.push(t,side*.5+.5);}
      if(i<count){const n=i*2;ix.push(n,n+2,n+1,n+1,n+2,n+3);}
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(ix);geo.computeVertexNormals();
    const obj=new THREE.Mesh(geo,material);obj.receiveShadow=true;staticRoot.add(obj);return curve;
  }
  const routes=[[[0,23],[0,16],[0,11],[1,5],[0,-2],[1,-10],[0,-18],[0,-25]],[[0,11],[-7,10],[-13,5],[-14,-4],[-12,-10],[-8,-17],[0,-22]],[[0,10],[8,9],[14,5],[17,1],[15,-5],[12,-12],[12,-17],[5,-22]], [[-14,-5],[-18,-8],[-17,-13],[-15,-15]], [[-12,7],[-18,6],[-21,8]]];
  routes.forEach((r,i)=>ribbon(r,i===0?3.6:2.25,m.path));
  for(let i=0;i<180;i++) {
    const route=routes[Math.floor(rand()*routes.length)], p=route[Math.floor(rand()*route.length)];
    const x=p[0]+range(-2.7,2.7),z=p[1]+range(-2.7,2.7);
    mesh('ico',rand()>.5?m.sand:m.paleRock,x,.05,z,range(.1,.35),.08,range(.1,.3),staticRoot,0,rand()*TAU);
  }

  const waterUniforms={time:{value:0}};
  const waterMat=new THREE.ShaderMaterial({ uniforms:waterUniforms, transparent:true, side:THREE.DoubleSide,
    vertexShader:`varying vec3 vWorld; varying vec2 vUv; void main(){vUv=uv;vec4 p=modelMatrix*vec4(position,1.);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
    fragmentShader:`varying vec3 vWorld; varying vec2 vUv; uniform float time; void main(){float ripple=sin(vWorld.x*2.7+time*.9+sin(vWorld.z*2.))*sin(vWorld.z*4.-time*.8);float glint=pow(max(0.,ripple),12.);vec3 c=mix(vec3(.14,.35,.43),vec3(.39,.65,.63),.43+ripple*.10);c+=vec3(.39,.22,.15)*pow(max(0.,sin(vWorld.x*.5+vWorld.z*.3)),4.);c+=glint*.21;gl_FragColor=vec4(c,.89);}` });
  const canal=ribbon([[-29,2],[-22,3],[-14,3.5],[-7,2],[0,3.8],[8,4.2],[18,7],[29,5]],3.25,waterMat,.08);
  function bridge(x,z,angle=0,w=3.6) {
    const g=group(x,0,z);g.rotation.y=angle;
    box(m.darkStone,0,.12,0,w,.2,5,g);
    for(let i=-4;i<=4;i++)box(i%2?m.stone:m.stoneTop,0,.28,i*.53,w-.06,.2,.47,g);
    for(const side of [-1,1]) {
      for(const zz of [-2.2,0,2.2]){box(m.darkStone,side*w*.53,.7,zz,.3,1.25,.35,g);box(m.bronze,side*w*.53,1.27,zz,.4,.13,.4,g);}
      beam([side*w*.53,1,-2.3],[side*w*.53,1,2.3],.1,m.bronze,g);
    }
  }
  bridge(1,3.9,0,9.2);bridge(-13.7,3.5,.18,2.6);bridge(14.5,6.3,-.22,2.6);
  // Bank reeds and small glints of bioluminescent river moss.
  for(let i=0;i<90;i++) {
    const t=rand(),p=canal.getPoint(t),d=canal.getTangent(t),s=rand()>.5?1:-1;
    const x=p.x+d.z*(1.65+rand()*.35)*s,z=p.z-d.x*(1.65+rand()*.35)*s;
    if(Math.abs(x-1)<3 || Math.abs(x+13.7)<1.8 ||Math.abs(x-14.5)<1.8)continue;
    for(let j=0;j<3;j++)beam([x+j*.07,.05,z],[x+j*.07+range(-.1,.1),range(.4,.9),z+.1],.025,m.grassGold);
    if(i%8===0)mesh('ico',m.cyan,x,.13,z,.19,.1,.3);
  }

  function rock(x,z,size=1) {
    const g=group(x,0,z),rotation=rand()*TAU;g.rotation.y=rotation;
    mesh('ico',rand()>.55?m.rock:m.paleRock,0,size*.34,0,size*range(.9,1.6),size*range(.7,1),size*range(.7,1.3),g,rand()*.4,0,rand()*.25);
    if(size>1.4)mesh('ico',m.darkRock,.45*size,.16*size,.34*size,size*.55,size*.5,size*.65,g);
    replaceWithAsset('boulder',g,x,z,[size*1.12,size*.93,size*.92],rotation);
    if(!nearRoute(x,z)&&!LANDMARKS.some(l=>Math.hypot(l.x-x,l.z-z)<size+2))sceneryBlockers.push({x,z,r:size*.47});
  }
  for(let i=0;i<70;i++) {
    let x,z,s;
    if(i<40) {const side=i%2?1:-1;x=side*range(24,31);z=range(-31,25);s=range(2,5);}
    else{x=range(-23,23);z=range(-32,-28);s=range(2.5,5);}
    rock(x,z,s);
  }
  [[-8,19,2.1],[8,21,2.2],[-21,11,1.5],[20,0,2],[-20,-17,2.5],[20,-18,2.4],[5,-15,1.3],[-7,-7,1.6],[9,-4,1.2]].forEach(p=>rock(...p));
  // Overlapping sculpted ridges fade into the violet distance.
  for(let layer=0;layer<3;layer++) {
    const geo=new THREE.PlaneGeometry(160,26,100,12);geo.rotateX(-Math.PI/2);const p=geo.attributes.position;
    for(let i=0;i<p.count;i++) {
      const x=p.getX(i),z=p.getZ(i),edge=Math.max(0,1-Math.abs(z)/15);
      const h=9+7*Math.sin(x*.056+layer*.7)**2+4*Math.sin(x*.127+1+layer)**2;
      p.setY(i,Math.pow(edge,.66)*h-3+Math.sin(x*.48+z*.31)*.45);p.setZ(i,z-48-layer*16);
    }
    geo.computeVertexNormals();const mountain=new THREE.Mesh(geo,mat('mountain'+layer,[0x555b78,0x6f6884,0x87778e][layer],{roughness:1}));mountain.receiveShadow=true;scene.add(mountain);
  }
  const skyGeo=new THREE.SphereGeometry(150,24,16);
  const sky=new THREE.Mesh(skyGeo,new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,
    vertexShader:`varying vec3 v;void main(){v=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec3 v;void main(){float h=normalize(v).y;vec3 c=mix(vec3(.91,.57,.44),vec3(.19,.23,.39),smoothstep(-.03,.7,h));c=mix(vec3(.64,.57,.66),c,smoothstep(-.3,.0,h));gl_FragColor=vec4(c,1.);}` }));
  scene.add(sky);
  const sunDisc=mesh('sphere',new THREE.MeshBasicMaterial({color:0xffd2a1}),-41,22,-79,13,13,1,scene);sunDisc.castShadow=false;
  // Vertical trunks support clustered leaves shaped like carefully cut paper.
  function tree(x,z,s=1,alien=false) {
    const trunk=group(x,0,z);trunk.rotation.y=rand()*TAU;
    beam([0,0,0],[.16,s*2.6,0],s*.2,m.wood,trunk);
    beam([.08,s*1.5,0],[-.6*s,s*2.8,.1*s],s*.12,m.wood,trunk);
    beam([.1,s*1.9,0],[.8*s,s*3.05,-.1*s],s*.11,m.wood,trunk);
    if(alien) {
      for(let j=0;j<7;j++) {
        const a=j*TAU/7;
        mesh('sphere',j%3?m.leaf:m.leafLight,Math.cos(a)*.62*s,s*(2.45+rand()*.5),Math.sin(a)*.55*s,s*.43,s*.22,s*1.8,trunk,.25,a+.7,.2);
      }
      mesh('ico',m.pink,.1,s*3.05,0,.24*s,.4*s,.24*s,trunk);
    } else {
      for(let j=0;j<5;j++){const a=j*TAU/5;mesh('ico',j%2?m.coral:m.leafLight,Math.cos(a)*.55*s,(2.7+rand()*.5)*s,Math.sin(a)*.5*s,s*1.6,s*.9,s*1.55,trunk,.2,a);}
    }
    if(!nearRoute(x,z))sceneryBlockers.push({x,z,r:s*.24});
    if(!alien)replaceWithAsset('canopy-tree',trunk,x,z,[s*.82,s*.82,s*.82],trunk.rotation.y);
  }
  [[-9,22,1.2],[8,19,.85],[-10,14,.95],[-22,8,1.3],[19,12,1.3],[22,4,.9],[20,-8,1.1],[-20,-1,1.1],[-21,-9,1.6],[-17,-11,1],[-8,-12,1.2],[-19,-21,1.2],[17,-23,.95],[-23,18,.9]].forEach(([x,z,s])=>tree(x,z,s,x<0&&z<0));
  // Feathered grass tufts are batched, leaving room around the routes and landmarks.
  const grassGeometry=new THREE.BufferGeometry(),bladeVerts=[],bladeIndices=[];
  for(let i=0;i<=5;i++){const t=i/5,width=.042*(1-t);bladeVerts.push(t*t*.19-width,t*.6,Math.sin(t*Math.PI)*.035,t*t*.19+width,t*.6,Math.sin(t*Math.PI)*.035);if(i<5){const n=i*2;bladeIndices.push(n,n+1,n+2,n+1,n+3,n+2);}}
  grassGeometry.setAttribute('position',new THREE.Float32BufferAttribute(bladeVerts,3));grassGeometry.setIndex(bladeIndices);grassGeometry.computeVertexNormals();
  function nearRoute(x,z) { return routes.some(route=>route.some((p,i)=> { if(!i)return false;const q=route[i-1],dx=p[0]-q[0],dz=p[1]-q[1],t=THREE.MathUtils.clamp(((x-q[0])*dx+(z-q[1])*dz)/(dx*dx+dz*dz),0,1);return Math.hypot(x-q[0]-t*dx,z-q[1]-t*dz)<2.25;})); }
  for(let i=0;i<1800;i++) {
    const x=range(-24,24),z=range(-28,24);
    if(nearRoute(x,z) || LANDMARKS.some(p=>Math.hypot(p.x-x,p.z-z)<1.8))continue;
    for(let j=0;j<3;j++) {
      const obj=new THREE.Mesh(grassGeometry,(i+j)%3?m.grass:m.grassGold);obj.position.set(x+range(-.15,.15),.02,z+range(-.15,.15));obj.rotation.y=rand()*TAU;obj.scale.setScalar(range(.45,1.0));staticRoot.add(obj);
    }
    if(i%11===0) {mesh('ico',i%2?m.coral:m.violet,x,.17,z,.5,.35,.48);mesh('ico',m.leaf,x+.2,.12,z+.15,.35,.23,.4);}
  }
  function flower(x,z,s=1) {
    beam([x,.05,z],[x,.6*s,z],.045*s,m.leaf);
    for(let j=0;j<5;j++){const a=j*TAU/5;mesh('sphere',m.pink,x+Math.cos(a)*s*.17,.64*s,z+Math.sin(a)*s*.17,.22*s,.11*s,.34*s,staticRoot,0,a);}
    mesh('sphere',m.amber,x,.69*s,z,.15*s,.1*s,.15*s);
  }
  for(let i=0;i<42;i++)flower(range(-22,-8),range(-17,0),range(.5,1.2));

  // Camp Hearth: layered canvas, ropes, crates, cooking fire and inhabited details.
  const flameObjects=[],lanterns=[];
  function lantern(x,y,z,parent=staticRoot) {
    box(m.metal,x,y,z,.26,.42,.26,parent);box(m.amber,x,y+.02,z,.20,.26,.20,parent);
    mesh('cone',m.bronze,x,y+.29,z,.4,.2,.4,parent);
  }
  function tent(x,z,size=1,teal=false,rot=0) {
    const g=group(x,0,z);g.rotation.y=rot;g.scale.setScalar(size);
    box(m.wood,0,.08,0,4.1,.14,3.5,g);
    const fabric=teal?m.tentTeal:m.tent;
    const geometry=new THREE.BufferGeometry(),roof=[],roofUv=[],roofIndex=[];
    for(const side of [-1,1]) {
      const start=roof.length/3;
      for(let j=0;j<=12;j++)for(let i=0;i<=12;i++){const u=i/12,v=j/12,x=side*(1-u)*2,z=-1.5+v*3;roof.push(x,.2+u*2.6-Math.sin(u*Math.PI)*.12+Math.sin(v*TAU*5)*.025*(1-u),z);roofUv.push(u,v);if(i<12&&j<12){const n=start+j*13+i;roofIndex.push(n,n+1,n+13,n+1,n+14,n+13);}}
    }
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(roof,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(roofUv,2));geometry.setIndex(roofIndex);geometry.computeVertexNormals();
    const cloth=new THREE.Mesh(geometry,fabric);cloth.castShadow=true;cloth.receiveShadow=true;g.add(cloth);
    box(m.dark,0,1.04,-1.45,2.4,1.85,.06,g);
    mesh('cone',fabric,0,1.44,1.46,4,2.7,.06,g);
    box(m.dark,0,.8,1.52,.9,1.5,.07,g);
    for(const end of [-1.65,1.7]) {
      beam([0,0,end],[0,2.93,end],.1,m.wood,g);
      beam([0,2.85,end],[-2.7,.05,end+.5],.025,m.rope,g);
      beam([0,2.85,end],[2.7,.05,end+.5],.025,m.rope,g);
    }
    beam([0,2.86,-1.8],[0,2.86,1.9],.14,m.wood,g);
    box(m.coral,-.9,.18,1.88,.9,.12,.65,g);lantern(.68,1.05,1.76,g);
    for(let j=0;j<3;j++)box(m.bronze,-1.4+j*.4,.21,1.74,.2,.2,.2,g);
  }
  tent(-5.4,17,1.03,false,-.22);tent(5.9,18,1.03,true,.22);tent(-6.2,22,.8,true,-.3);
  function crate(x,z,s=1,rot=0) {
    const g=group(x,0,z);g.rotation.y=rot;
    box(m.wood,0,s*.4,0,s,.8*s,.8*s,g);
    for(const xx of [-.36,.36])box(m.bronze,xx*s,s*.4,0,s*.075,s*.84,s*.84,g);
    box(m.gold,0,s*.48,.41*s,s*.28,s*.16,.035,g);
  }
  [[-7.9,14.8,.8,.1],[3.5,21.3,.95,.2],[4.5,21.4,.75,-.1],[-4,20.2,.65,-.2],[8.1,16.3,.65,.3]].forEach(a=>crate(...a));
  const farm=group(9.6,0,20);
  box(m.wood,0,.09,0,3.5,.15,3.1,farm);
  for(let j=0;j<5;j++) {
    box(m.earth,-1.35+j*.68,.17,0,.5,.14,2.8,farm);
    for(let i=0;i<5;i++) {const z=-1.15+i*.56;mesh('cone',m.leafLight,-1.35+j*.68,.47,z,.36,.55,.35,farm);mesh('sphere',m.coral,-1.35+j*.68,.38,z,.22,.2,.22,farm);}
  }
  for(const x of [-1.85,1.85])for(const z of [-1.65,1.65])box(m.wood,x,.45,z,.12,.9,.12,farm);
  for(const z of [-1.65,1.65])beam([-1.85,.6,z],[1.85,.6,z],.05,m.rope,farm);
  const hearth=group(1.9,0,18.5);
  for(let i=0;i<9;i++){const a=i*TAU/9;mesh('ico',m.rock,Math.cos(a)*.7,.14,Math.sin(a)*.7,.35,.3,.3,hearth);}
  for(let i=0;i<3;i++)box(m.wood,0,.16,0,.18,.15,1.05,hearth,i*TAU/3);
  const fire=group(1.9,.2,18.5,scene);
  for(let i=0;i<5;i++){const f=mesh('cone',i%2?m.amber:m.coral,range(-.22,.22),.28,range(-.22,.22),.34,.85,.34,fire,0,rand()*TAU,.12);flameObjects.push(f);}
  const firelight=new THREE.PointLight(0xff8c45,6,7,2);firelight.position.set(1.9,1.2,18.5);scene.add(firelight);
  box(m.wood,1.9,.3,20.1,2,.45,.48);box(m.wood,3.5,.3,18.8,.48,.45,1.8);
  // Pennants, cables and a welcome sign make the camp legible from afar.
  for(const x of [-9,9]){beam([x,0,13],[x,3.9,13],.16,m.wood);lantern(x,2.4,13);}
  for(let i=0;i<16;i++) {
    const x=-9+i*1.2,y=3.55-Math.sin(i/15*Math.PI)*.8;
    if(i<15)beam([x,y,13],[x+1.2,3.55-Math.sin((i+1)/15*Math.PI)*.8,13],.025,m.rope);
    mesh('cone',i%3===0?m.coral:i%3===1?m.tentTeal:m.gold,x,y-.22,13,.37,.5,.045,staticRoot,0,0,Math.PI);
  }
  beam([-2,0,15],[-2,1.45,15],.12,m.wood);box(m.wood,-2,1.35,15,1.05,.4,.12,staticRoot,-.15);box(m.gold,-2,1.36,15.075,.75,.05,.015,staticRoot,-.15);
  // Settlement beacon: its transformation is visible in geometry and light.
  const beacon=group(0,0,12,scene),beaconPowered=group(0,0,0,beacon);
  mesh('cyl',m.darkStone,0,.17,0,2.6,.32,2.6,beacon);mesh('cyl',m.bronze,0,.35,0,1.85,.1,1.85,beacon);
  for(let i=0;i<3;i++){const a=i*TAU/3;beam([Math.cos(a)*.65,.4,Math.sin(a)*.65],[Math.cos(a)*.33,2.25,Math.sin(a)*.33],.18,m.metal,beacon);mesh('box',m.gold,Math.cos(a)*.61,.62,Math.sin(a)*.61,.32,.55,.32,beacon,0,a);}
  const beaconOrb=mesh('ico',m.cyan,0,1.9,0,.63,.95,.63,beaconPowered);
  mesh('torus',m.gold,0,2,0,1.6,1.6,1.6,beaconPowered,Math.PI/2);
  const beaconRing=mesh('torus',m.cyan,0,2,0,1.75,1.75,1.75,beaconPowered,.5);
  const beaconUpgrade=group(0,0,0,beacon);
  for(const side of [-1,1]) {
    beam([side*.8,.3,0],[side*1.65,1.1,0],.12,m.bronze,beaconUpgrade);
    mesh('box',m.metal,side*1.85,1.07,0,1.05,.12,1.25,beaconUpgrade,0,0,side*.3);
    for(let j=0;j<3;j++)mesh('box',m.cyan,side*1.85,1.15,-.42+j*.42,.81,.02,.26,beaconUpgrade,0,0,side*.3);
  }
  mesh('torus',m.gold,0,2.75,0,1.0,1.0,1.0,beaconUpgrade,Math.PI/2);
  mesh('ico',m.amber,0,2.9,0,.28,.48,.28,beaconUpgrade);
  const beaconLight=new THREE.PointLight(0x6effdf,7,8);beaconLight.position.set(0,2,12);scene.add(beaconLight);
  for(const x of [-4,4]){box(m.darkStone,x,.24,11,.65,.45,.65);mesh('cyl',m.bronze,x,.85,11,.22,1.5,.22);lantern(x,1.7,11);}

  // Old world masonry: chipped columns, scattered capitals, and a half aqueduct.
  function column(x,z,h=3,broken=false,rot=0) {
    const g=group(x,0,z);g.rotation.y=rot;
    box(m.darkStone,0,.12,0,1.3,.24,1.3,g);box(m.stone,0,.37,0,1.08,.26,1.08,g);
    mesh('cyl',m.stone,0,.5+h*.5,0,.8,h,.8,g);
    for(let i=0;i<6;i++){const a=i*TAU/6;box(m.stoneTop,Math.cos(a)*.37,.5+h*.5,Math.sin(a)*.37,.075,h-.08,.075,g,a);}
    if(!broken){box(m.stoneTop,0,h+.57,0,1.15,.23,1.15,g);box(m.darkStone,0,h+.72,0,1.3,.15,1.3,g);}
    else{mesh('ico',m.stoneTop,.05,h+.52,0,.82,.3,.75,g);}
    replaceWithAsset('ruin-column',g,x,z,[1,(h+.72)/3.8,1],rot);
    if(!nearRoute(x,z)&&!LANDMARKS.some(l=>Math.hypot(l.x-x,l.z-z)<2.4))sceneryBlockers.push({x,z,r:.46});
  }
  for(let i=0;i<5;i++)column(-8+i*3.4,-1.2, i===2?1.45:3.2,i===2);
  for(const i of [0,3]) {
    for(let j=0;j<=8;j++) {
      const a=Math.PI*j/8,x=-8+i*3.4+1.7-Math.cos(a)*1.7,y=3.5+Math.sin(a)*1.1;
      mesh('box',m.stone,x,y,-1.2,.63,.5,.82,staticRoot,0,0,-a);
    }
  }
  for(const [x,z,h] of [[-17,-2,2.6],[-10,-6,1.3],[-21,-13,3.8],[9,-9,3.5],[17,-11,2.5],[8,-15,1.6],[16,-16,4.1]])column(x,z,h,h<3,range(-.3,.3));
  for(const [x,z,w,h] of [[19,-12,3,2.3],[17,-19,5,2.1],[7,-20,2,1.5],[-18,-18,3,1.6]]) {
    box(m.darkStone,x,h*.5,z,w,h,.75,staticRoot,.2);
    for(let j=0;j<3;j++)box(m.stone,x-w*.32+j*w*.3,h+.08,z,w*.27,.28,.9,staticRoot,.2);
    box(m.cyan,x,h*.62,z+.41,w*.4,.04,.02,staticRoot,.2);
  }
  for(let i=0;i<38;i++) {
    const x=range(8,20),z=range(-20,-7);if(nearRoute(x,z))continue;
    box(m.stone,x,.12,z,range(.4,1.1),range(.15,.45),range(.4,1),staticRoot,rand()*TAU);
  }
  // Garden mushrooms and tall glass shards reflect the interleaving of life and machinery.
  for(let i=0;i<15;i++) {
    const x=range(-22,-10),z=range(-17,-2);if(nearRoute(x,z))continue;
    const s=range(.45,1.2);beam([x,0,z],[x,s,z],.16,m.violet);
    mesh('sphere',i%3?m.leafLight:m.pink,x,s,z,s*.95,s*.22,s*.9);
    mesh('torus',m.cyan,x,s-.06,z,s*.65,s*.65,s*.65,staticRoot,Math.PI/2);
  }
  for(const [x,z] of [[-17,-6],[-10,-14],[-22,-4],[20,-22]]) {
    for(let i=0;i<3;i++)mesh('cone',i%2?m.leafLight:m.cyan,x+i*.25,.6+i*.16,z+i*.19,.3,1.2+i*.3,.3,staticRoot,0,.3,-.2+i*.2);
  }
  for(const [x,z,rotation,scale]of [[0,-13,.1,.86],[-15,-19,.32,.74]]) {
    const g=group(x,0,z);g.rotation.y=rotation;
    for(const side of [-1,1])mesh('cyl',m.stone,side*2.4*scale,1.8*scale,0,.6*scale,3.6*scale,.6*scale,g);
    const arch=new THREE.Mesh(new THREE.TorusGeometry(2.4*scale,.24*scale,10,40,Math.PI),m.stoneTop);arch.position.y=3.6*scale;g.add(arch);
    replaceWithAsset('ruin-arch',g,x,z,[scale,scale,scale],rotation);
  }
  const relays={};
  for(const lm of LANDMARKS.filter(l=>l.kind==='relay')) {
    const g=group(lm.x,0,lm.z,scene);relays[lm.id]={g};
    mesh('cyl',m.darkStone,0,.18,0,2.5,.35,2.5,g);mesh('cyl',m.bronze,0,.4,0,1.8,.12,1.8,g);
    const p=group(0,0,0,g);relays[lm.id].power=p;
    for(let j=0;j<4;j++){const a=j*TAU/4;box(m.darkStone,Math.cos(a)*.6,1.2,Math.sin(a)*.6,.38,1.65,.38,g,a);mesh('box',m.gold,Math.cos(a)*.6,2.05,Math.sin(a)*.6,.45,.2,.45,g,0,a);}
    mesh('ico',m.cyan,0,1.6,0,.5,.95,.5,p);
    const r=mesh('torus',m.cyan,0,2.3,0,1.6,1.6,1.6,p,Math.PI/2);relays[lm.id].ring=r;
    mesh('torus',m.bronze,0,2.3,0,1.9,1.9,1.9,g,Math.PI/2);
  }
  const caches={};
  for(const lm of LANDMARKS.filter(l=>l.kind==='cache')) {
    const g=group(lm.x,0,lm.z,scene);caches[lm.id]=g;g.rotation.y=.28;
    box(m.metal,0,.35,0,1.25,.65,.8,g);box(m.bronze,0,.74,0,1.35,.18,.87,g);
    for(const x of [-.42,.42])box(m.gold,x,.42,0,.12,.77,.9,g);
    box(m.cyan,0,.45,.418,.27,.17,.04,g);
  }
  const memory=group(-15,0,-15,scene);
  box(m.darkStone,0,.18,0,1.5,.35,1.35,memory);box(m.metal,0,.9,0,.8,1.2,.55,memory);
  mesh('box',m.pink,0,1.37,.17,.64,.65,.035,memory,-.5);
  mesh('torus',m.bronze,0,2,0,1.2,1.2,1.2,memory,0,0,.2);

  // The observatory is the region's silhouette: a broken armillary halo above a
  // terraced instrument, with a suspended time-heart at its centre.
  const observatory=group(0,0,-25);
  mesh('cyl',m.darkStone,0,.18,0,13,.4,11,observatory);
  mesh('cyl',m.stone,0,.45,0,11.7,.22,9.7,observatory);
  for(let i=0;i<3;i++)box(m.stoneTop,0,.16+i*.1,5.4-i*.55,5.4,.2,.7,observatory);
  for(const x of [-4.5,4.5]) {
    box(m.darkStone,x,2.6,0,1.8,5.2,2.1,observatory);
    box(m.stone,x,3.1,.08,1.44,5.2,1.72,observatory);
    box(m.bronze,x,5.6,0,2,.4,2.3,observatory);
    box(m.cyan,x,3,1,.12,3.5,.07,observatory);
    for(let j=0;j<4;j++)box(m.darkStone,x,1.1+j*1.2,0,1.85,.15,2.05,observatory);
  }
  const halo=group(0,7.1,0,observatory);halo.rotation.z=-.17;
  const arcGeo=new THREE.TorusGeometry(4.85,.32,7,72,Math.PI*1.76);
  const arc=new THREE.Mesh(arcGeo,m.stoneTop);arc.rotation.z=.25;arc.castShadow=true;halo.add(arc);
  const arc2=new THREE.Mesh(new THREE.TorusGeometry(4.41,.075,6,72,Math.PI*1.84),m.bronze);arc2.rotation.z=.18;halo.add(arc2);
  for(let i=0;i<25;i++) {
    const a=i/25*TAU;if(a<.38||a>5.9)continue;
    mesh('box',m.bronze,Math.cos(a)*4.82,Math.sin(a)*4.82,.37,.22,.65,.18,halo,0,0,a-Math.PI/2);
    if(i%2===0)mesh('box',m.cyan,Math.cos(a)*4.42,Math.sin(a)*4.42,.06,.1,.32,.11,halo,0,0,a-Math.PI/2);
  }
  beam([-4.4,4.6,0],[-1.4,8.1,0],.14,m.bronze,observatory);
  beam([4.4,4.6,0],[1.4,8.1,0],.14,m.bronze,observatory);
  const heart=group(0,7.25,-25,scene);
  mesh('ico',m.pink,0,0,0,1.1,1.65,1.1,heart);
  mesh('torus',m.gold,0,0,0,2.35,2.35,2.35,heart,Math.PI/3,.2);
  mesh('torus',m.cyan,0,0,0,1.9,1.9,1.9,heart,-Math.PI/3,-.2);
  const altar=group(0,0,-23);
  mesh('cyl',m.metal,0,.7,0,2.4,1.15,2.4,altar);mesh('cyl',m.bronze,0,1.32,0,2.6,.15,2.6,altar);
  for(let i=0;i<8;i++){const a=i*TAU/8;mesh('box',m.cyan,Math.cos(a)*.98,1.42,Math.sin(a)*.98,.07,.06,.3,altar,0,-a);}
  for(const [x,z] of [[-7,-25],[7,-25],[-6,-20],[6,-20]])column(x,z,2.5,true);

  // Small, depth-tested halos give emissive instruments a soft optical glow
  // without paying for full-screen bloom or bleaching the dusk palette.
  const glowCanvas=document.createElement('canvas');glowCanvas.width=128;glowCanvas.height=128;
  const glowContext=glowCanvas.getContext('2d'),glowGradient=glowContext.createRadialGradient(64,64,0,64,64,64);
  glowGradient.addColorStop(0,'rgba(255,255,255,.86)');glowGradient.addColorStop(.13,'rgba(255,255,255,.48)');glowGradient.addColorStop(.40,'rgba(255,255,255,.13)');glowGradient.addColorStop(1,'rgba(255,255,255,0)');
  glowContext.fillStyle=glowGradient;glowContext.fillRect(0,0,128,128);
  const glowTexture=new THREE.CanvasTexture(glowCanvas),glows=[];
  function glow(parent,x,y,z,size,color,opacity=.42) {
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture,color,transparent:true,opacity,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending,toneMapped:false}));
    sprite.position.set(x,y,z);sprite.scale.set(size,size,1);parent.add(sprite);glows.push({sprite,opacity,phase:glows.length*.93});return sprite;
  }
  glow(beaconPowered,0,1.95,0,3.7,0x63ffe3,.45);
  glow(beaconUpgrade,0,2.9,0,2.5,0xffce81,.34);
  for(const r of Object.values(relays))glow(r.power,0,1.65,0,3.0,0x77ffd9,.44);
  glow(heart,0,0,0,4.8,0xff8ede,.43);
  glow(fire,0,.52,0,3.0,0xff924e,.53);
  glow(memory,0,1.48,.19,1.9,0xfba2f5,.27);
  for(const x of [-4,4])glow(scene,x,1.72,11,1.4,0xffbc72,.32);

  // Bake static groups. Merging removes thousands of draw calls while retaining
  // the palette, vertex normals, shadows, and all of the handcrafted detail.
  staticRoot.updateMatrixWorld(true);
  const batches=new Map();
  staticRoot.traverse(obj=>{
    if(!obj.isMesh)return;
    for(let parent=obj.parent;parent&&parent!==staticRoot;parent=parent.parent)if(parent.userData.externalFallback)return;
    const key=obj.material.uuid;
    if(!batches.has(key))batches.set(key,{material:obj.material,geometries:[]});
    const geo=obj.geometry.clone();geo.applyMatrix4(obj.matrixWorld);
    if(!geo.attributes.uv)geo.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count*2),2));
    if(geo.index)batches.get(key).geometries.push(geo.toNonIndexed());else batches.get(key).geometries.push(geo);
  });
  for(const entry of replacements)scene.attach(entry.fallback);
  scene.remove(staticRoot);
  for(const {material,geometries} of batches.values()) {
    const merged=mergeGeometries(geometries,false);
    if(!merged)continue;
    const obj=new THREE.Mesh(merged,material);obj.castShadow=material!==waterMat&&material!==m.path&&material!==m.grass&&material!==m.grassGold;obj.receiveShadow=true;scene.add(obj);
    geometries.forEach(g=>g.dispose());
  }

  // Soft circular contact shadows make feet and hovering machines read clearly.
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=64;shadowCanvas.height=64;
  const sc=shadowCanvas.getContext('2d'),gradient=sc.createRadialGradient(32,32,1,32,32,31);
  gradient.addColorStop(0,'rgba(13,19,35,.6)');gradient.addColorStop(.5,'rgba(13,19,35,.32)');gradient.addColorStop(1,'rgba(13,19,35,0)');sc.fillStyle=gradient;sc.fillRect(0,0,64,64);
  const shadowMat=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false});
  const actorRoot=new THREE.Group();scene.add(actorRoot);
  const actors={};
  function batchArticulated(g,exclude=new Set()) {
    const buckets=new Map();
    for(const child of [...g.children]) {
      if(child.isGroup)batchArticulated(child,exclude);
      if(!child.isMesh||exclude.has(child))continue;
      child.castShadow=false;
      const key=child.material.uuid;
      if(!buckets.has(key))buckets.set(key,[]);
      buckets.get(key).push(child);
    }
    for(const arr of buckets.values()) {
      if(arr.length<2)continue;
      const geos=arr.map(o=>{o.updateMatrix();let geo=o.geometry.clone();geo.applyMatrix4(o.matrix);if(!geo.attributes.uv)geo.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count*2),2));return geo.index?geo.toNonIndexed():geo;});
      const geo=mergeGeometries(geos,false);if(!geo)continue;
      const obj=new THREE.Mesh(geo,arr[0].material);obj.receiveShadow=true;g.add(obj);arr.forEach(o=>g.remove(o));geos.forEach(g=>g.dispose());
    }
  }
  function contact(g,size=1.2) {const o=new THREE.Mesh(new THREE.PlaneGeometry(size,size),shadowMat);o.rotation.x=-Math.PI/2;o.position.y=.09;g.add(o);return o;}
  const characterMats={
    kaida:{cloth:mat('kaidaCloth',0x334c66),cape:mat('kaidaCape',0xb95f5b,{side:THREE.DoubleSide}),hair:mat('kaidaHair',0x422d38),armor:m.bronze,skin:m.skin,light:m.cyan},
    vex:{cloth:mat('vexCloth',0x343251),cape:mat('vexCape',0x625985,{side:THREE.DoubleSide}),hair:mat('vexHair',0xd5c4d3),armor:mat('vexArmor',0x76678a,{metalness:.45}),skin:mat('vexSkin',0xc0a3bc),light:m.pink},
    rune:{cloth:mat('runeCloth',0x394958),cape:mat('runeCape',0x659893,{side:THREE.DoubleSide}),hair:mat('runeHair',0x535565),armor:mat('runeArmor',0x67878b,{metalness:.55,roughness:.38}),skin:mat('runeSkin',0xc6aa91),light:m.cyan},
    mira:{cloth:mat('miraCloth',0x78675f),cape:m.tentTeal,hair:mat('miraHair',0xd6c1a6),armor:m.bronze,skin:m.skin,light:m.amber},
  };
  function character(id,parent=actorRoot) {
    const cfg=characterMats[id]||characterMats.kaida;
    const g=group(0,0,0,parent),body=group(0,0,0,g),mass=id==='rune'?1.2:1;
    contact(g,id==='rune'?1.45:1.15);
    const ring=new THREE.Mesh(new THREE.RingGeometry(.47*mass,.50*mass,40),new THREE.MeshBasicMaterial({color:COLORS[id]||0xffd396,transparent:true,opacity:.64,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.1;g.add(ring);
    const hips=group(0,.75,0,body);
    const legs=[];
    for(const side of [-1,1]) {
      const leg=group(side*.17*mass,0,0,hips);legs.push(leg);
      mesh('cyl',cfg.cloth,0,-.17,0,.19,.38,.19,leg);
      const knee=group(0,-.32,0,leg);leg.userData.knee=knee;
      mesh('sphere',cfg.armor,0,0,-.025,.23,.21,.25,knee);
      mesh('cyl',id==='rune'?cfg.armor:cfg.cloth,0,-.15,0,.19,.31,.19,knee);
      box(m.dark,0,-.32,.085,.23,.18,.36,knee);box(cfg.armor,0,-.28,.20,.23,.08,.16,knee);
      if(id==='rune')box(m.gold,0,-.12,.11,.13,.11,.04,knee);
    }
    mesh('sphere',cfg.cloth,0,.79,0,.49*mass,.37,.32,body);
    mesh('cyl',cfg.cloth,0,1.09,0,.51*mass,.55,.37,body);
    mesh('sphere',cfg.armor,0,1.17,.025,.56*mass,.47,.4,body);
    box(m.bronze,0,.86,.015,.59*mass,.10,.39,body);box(m.gold,.04,.86,.235,.15,.12,.06,body);
    beam([-.20*mass,1.34,.215],[.18*mass,.94,.215],.055,m.dark,body,'box');
    const cloakGeo=new THREE.BufferGeometry();cloakGeo.setAttribute('position',new THREE.Float32BufferAttribute([-.23*mass,0,0,.23*mass,0,0,-.38*mass,-.90,-.21,.23*mass,0,0,.38*mass,-.94,-.21,-.38*mass,-.90,-.21],3));cloakGeo.computeVertexNormals();
    const cloak=new THREE.Mesh(cloakGeo,cfg.cape);cloak.position.set(0,1.38,-.18);cloak.castShadow=true;body.add(cloak);
    if(id==='vex') {mesh('cone',cfg.cape,0,.58,-.02,.85,1.02,.7,body);mesh('torus',m.gold,0,1.43,0,.52,.52,.52,body,Math.PI/2);}
    const head=group(0,1.57,0,body);
    mesh('sphere',cfg.skin,0,.05,.015,.43,.49,.4,head);
    mesh('sphere',cfg.hair,0,.14,-.07,.47,.42,.4,head);
    // Visible forehead, nose, eye whites and dark pupils all face local +Z.
    mesh('sphere',cfg.skin,0,.055,.11,.33,.35,.28,head);
    mesh('sphere',cfg.skin,0,.01,.264,.08,.1,.09,head);
    for(const side of [-1,1]) {
      box(m.dark,side*.09,.095,.249,.081,.035,.018,head);
      box(id==='vex'?m.pink:m.stoneTop,side*.09,.098,.26,.044,.022,.013,head);
      mesh('sphere',cfg.skin,side*.205,.015,.025,.09,.14,.07,head);
    }
    box(id==='vex'?cfg.hair:m.wood,0,-.07,.235,.10,.023,.018,head);
    if(id==='kaida') {
      for(let i=0;i<5;i++)mesh('cone',cfg.hair,-.17+i*.078,.235,.19,.12,.32,.13,head,0,.2,.45-i*.15);
      const pony=group(.11,.12,-.2,head);mesh('cone',cfg.hair,0,-.08,-.12,.25,.7,.25,pony,-.6,0,.22);mesh('cyl',m.coral,0,.08,-.08,.21,.07,.21,pony,Math.PI/2);
      mesh('sphere',m.coral,.20,.22,0,.11,.1,.1,head);
    } else if(id==='vex') {
      mesh('sphere',cfg.cape,0,.20,-.09,.55,.55,.43,head);
      for(const side of [-1,1])mesh('cone',cfg.hair,side*.20,-.04,.15,.16,.54,.17,head,0,0,side*.16);
      mesh('cone',cfg.cape,0,.49,-.13,.38,.47,.33,head,-.35,0,.1);
      box(m.pink,0,.22,.259,.055,.07,.022,head);
    } else if(id==='rune') {
      mesh('sphere',cfg.armor,0,.21,-.035,.52,.36,.47,head);
      box(m.dark,0,.105,.253,.4,.14,.05,head);box(m.cyan,0,.112,.285,.31,.052,.028,head);
      mesh('sphere',cfg.hair,0,-.115,.11,.32,.2,.28,head);box(m.gold,0,.25,.198,.12,.08,.12,head);
    } else {
      mesh('sphere',cfg.hair,0,.26,-.03,.5,.3,.43,head);mesh('sphere',cfg.hair,0,.1,-.24,.29,.26,.28,head);
    }
    const arms=[];
    for(const side of [-1,1]) {
      const arm=group(side*.33*mass,1.34,0,body);arms.push(arm);
      mesh('sphere',cfg.armor,0,-.05,0,id==='rune'?.39:.27,id==='rune'?.33:.22,.32,arm);
      mesh('cyl',cfg.cloth,0,-.24,0,.16,.3,.16,arm);
      mesh('sphere',cfg.armor,0,-.40,.015,.20,.23,.20,arm);
      mesh('sphere',cfg.skin,0,-.52,.035,.14,.17,.16,arm);
      if(id==='rune')box(m.gold,side*.12,-.05,.13,.1,.16,.07,arm);
    }
    const weapon=group(0,-.5,.02,arms[1]);
    if(id==='kaida') {
      box(m.dark,0,.01,.02,.065,.27,.065,weapon);box(m.gold,0,-.13,.02,.33,.055,.14,weapon);
      mesh('box',m.stoneTop,0,-.67,.02,.115,1.0,.043,weapon,0,0,-.08);
      mesh('box',m.cyan,.034,-.67,.049,.022,.98,.011,weapon,0,0,-.08);
      mesh('cone',m.stoneTop,.045,-1.22,.02,.112,.18,.035,weapon,0,0,Math.PI-.08);
      // Sheathed second blade at her left hip.
      beam([-.26,.87,-.17],[-.40,.26,-.36],.1,m.dark,body,'box');
    } else if(id==='vex') {
      beam([0,-.53,0],[0,1.15,0],.06,m.bronze,weapon);
      mesh('torus',m.gold,0,1.12,0,.46,.46,.46,weapon);
      mesh('ico',m.pink,0,1.13,0,.20,.28,.2,weapon);
      for(const s of [-1,1])mesh('cone',m.violet,s*.15,1.42,0,.11,.35,.11,weapon,0,0,s*-.4);
    } else if(id==='rune') {
      box(cfg.armor,0,0,.19,.26,.32,.62,weapon);box(m.dark,0,.01,.50,.19,.22,.1,weapon);box(m.cyan,0,.01,.56,.11,.12,.05,weapon);
      const shield=group(-.11,-.24,.16,arms[0]);
      mesh('sphere',cfg.armor,0,0,0,.53,.77,.2,shield);box(m.bronze,0,0,.1,.10,.64,.07,shield);box(m.cyan,0,.03,.16,.28,.055,.03,shield);
      box(m.metal,0,1.2,-.28,.52,.48,.24,body);
      for(const side of [-1,1]){mesh('cyl',m.bronze,side*.17,1.4,-.31,.12,.53,.12,body);mesh('cyl',m.cyan,side*.17,1.7,-.31,.11,.09,.11,body);}
    }
    const actor={id,g,body,head,legs,arms,cloak,ring,weapon,phase:rand()*TAU,attack:0,hit:0,prev:new THREE.Vector3(),target:new THREE.Vector3(),moving:false};
    batchArticulated(g,new Set([cloak,ring]));cloak.castShadow=false;g.name='actor-'+id;actors[id]=actor;return actor;
  }
  HERO_IDS.forEach((id,i)=>{const a=character(id);a.g.position.set(i===1?-1:i===2?1:0,0,16+(i?1:0));a.prev.copy(a.g.position);});
  const mira=character('mira');mira.g.position.set(-3,0,14);mira.g.rotation.y=.4;mira.ring.visible=false;

  const ambientEnemies={};
  function enemy(type,id,parent=actorRoot) {
    const g=group(0,0,0,parent),body=group(0,0,0,g);contact(g,type==='boss'?3:1.5);
    const boss=type==='boss'||type==='archon'||type==='guardian',plant=['spore','plant','bloom','stalker'].includes(type),wisp=type==='wisp',sentinel=type==='sentinel';
    const armor=boss?m.darkStone:plant?m.leaf:m.metal,glow=boss?m.pink:plant?m.pink:m.amber;
    if(boss) {
      mesh('sphere',armor,0,1.45,0,1.8,1.45,.9,body);mesh('ico',glow,0,1.55,.51,.43,.62,.28,body);
      mesh('sphere',m.dark,0,2.3,0,.65,.75,.57,body);box(glow,0,2.34,.32,.37,.055,.04,body);
      for(const s of [-1,1]) {
        mesh('cone',m.bronze,s*.27,2.91,-.03,.18,.8,.16,body,0,0,-s*.22);
        mesh('ico',armor,s*1.0,1.98,0,.85,.72,.84,body);
        beam([s*1.08,1.85,0],[s*1.27,.8,.1],.30,m.metal,body);
        mesh('ico',glow,s*1.28,.76,.1,.32,.38,.3,body);
        beam([s*.47,1.03,0],[s*.6,.38,.12],.3,m.metal,body);
        box(m.darkStone,s*.63,.23,.24,.48,.30,.72,body);
        for(let j=0;j<3;j++)mesh('cone',m.stoneTop,s*(1.1+j*.14),2.19+j*.10,-.1,.2,.6,.2,body,0,0,s*-.6);
      }
      const halo=mesh('torus',m.bronze,0,2.05,-.36,2.65,2.65,2.65,body);halo.rotation.y=.1;
      mesh('torus',glow,0,2.05,-.37,2.38,2.38,2.38,body);
    } else if(wisp) {
      mesh('ico',m.violet,0,1.3,0,.73,.65,.7,body);
      mesh('sphere',m.pink,0,1.37,.12,.44,.45,.44,body);
      mesh('torus',m.gold,0,1.33,0,1.15,1.15,1.15,body,Math.PI/2,.3);
      for(let i=0;i<6;i++) {
        const a=i*TAU/6;
        mesh('cone',m.leafLight,Math.cos(a)*.43,1.62,Math.sin(a)*.43,.25,.85,.29,body,Math.sin(a)*.6,0,-Math.cos(a)*.6);
        beam([Math.cos(a)*.25,1.12,Math.sin(a)*.25],[Math.cos(a)*.35,.53,Math.sin(a)*.35],.035,m.pink,body);
      }
    } else if(sentinel) {
      mesh('cyl',m.metal,0,1.0,0,.85,1.2,.6,body);
      mesh('ico',m.stone,0,1.8,0,.60,.59,.56,body);box(m.pink,0,1.85,.31,.37,.06,.05,body);
      mesh('ico',m.bronze,0,1.17,.28,.28,.41,.16,body);
      for(const s of [-1,1]) {
        mesh('ico',m.darkStone,s*.61,1.45,0,.62,.65,.66,body);
        beam([s*.62,1.25,0],[s*.69,.74,.08],.24,m.metal,body);
        mesh('sphere',m.bronze,s*.68,.72,.12,.28,.34,.28,body);
        beam([s*.25,.72,0],[s*.34,.25,.1],.24,m.metal,body);
        box(m.darkStone,s*.36,.15,.23,.32,.23,.52,body);
        mesh('cone',m.stoneTop,s*.63,1.96,-.05,.19,.62,.17,body,0,0,-s*.3);
      }
      beam([.7,.85,.2],[.7,.6,1.25],.09,m.stoneTop,body,'box');
      mesh('torus',m.pink,0,1.68,-.22,1.2,1.2,1.2,body);
    } else if(plant) {
      mesh('cone',m.leaf,0,.45,0,1.1,.9,1.1,body);
      for(let i=0;i<5;i++){const a=i*TAU/5;mesh('sphere',i%2?m.coral:m.violet,Math.cos(a)*.35,1.05,Math.sin(a)*.35,.44,.85,.44,body,0,0,Math.cos(a)*.35);}
      mesh('sphere',m.dark,0,1.15,.10,.6,.46,.5,body);mesh('ico',glow,0,1.21,.36,.23,.18,.12,body);
      for(let i=0;i<5;i++){const a=i*TAU/5;beam([0,.4,0],[Math.cos(a)*.9,.15,Math.sin(a)*.9],.15,m.leaf,body);}
    } else {
      mesh('ico',armor,0,.9,0,1.15,.83,.88,body);box(glow,0,.98,.40,.42,.09,.045,body);
      mesh('ico',m.bronze,0,1.24,0,.75,.3,.6,body);
      for(const s of [-1,1]) {
        mesh('ico',armor,s*.64,.88,-.08,.48,.51,.68,body);
        beam([s*.43,.65,0],[s*.75,.33,.12],.16,m.bronze,body);
        beam([s*.75,.33,.12],[s*.80,.14,.36],.13,m.metal,body);
        box(m.dark,s*.8,.10,.42,.26,.17,.35,body);
        mesh('cone',m.stoneTop,s*.73,1.27,-.08,.14,.53,.15,body,0,0,-s*.5);
      }
      beam([0,1.2,-.15],[0,1.62,-.24],.035,m.bronze,body);mesh('sphere',glow,0,1.65,-.24,.12,.12,.12,body);
    }
    const a={id,g,body,boss,wisp,type,phase:rand()*TAU,attack:0,hit:0};g.name='actor-'+id;batchArticulated(g);return a;
  }
  for(const lm of LANDMARKS.filter(l=>l.kind==='encounter'||l.kind==='boss')) {
    const a=enemy(lm.kind==='boss'?'boss':lm.id==='garden'?'spore':'drone',lm.id);
    a.g.position.set(lm.x+1.1,0,lm.z);a.g.rotation.y=.6;ambientEnemies[lm.id]=a;
  }
  // Battle is a deliberately composed location in its own scene. Its origin
  // follows the encounter's world coordinates, so game/UI targeting never remaps.
  const battleRoot=group(0,0,0,battleScene),battleLayers={},stagePlacements=[],environmentModels={};
  for(const theme of ['common','causeway','garden','wardens','boss'])battleLayers[theme]=group(0,0,0,battleRoot);
  const stageSun=new THREE.DirectionalLight(0xffbf92,2.45);stageSun.position.set(-11,16,-9);stageSun.castShadow=true;
  stageSun.shadow.mapSize.set(2048,2048);Object.assign(stageSun.shadow.camera,{left:-15,right:15,top:16,bottom:-16,near:.1,far:65});stageSun.shadow.bias=-.0002;stageSun.shadow.normalBias=.025;
  battleRoot.add(stageSun);battleRoot.add(stageSun.target);
  battleScene.add(new THREE.HemisphereLight(0xaebde4,0x423549,.78));
  const stageFill=new THREE.DirectionalLight(0xbacdfa,1.02);stageFill.position.set(8,11,18);battleRoot.add(stageFill);battleRoot.add(stageFill.target);
  const stageRim=new THREE.DirectionalLight(0x8bf5e4,.8);stageRim.position.set(5,7,-9);battleRoot.add(stageRim);battleRoot.add(stageRim.target);
  const stageCanvas=document.createElement('canvas');stageCanvas.width=512;stageCanvas.height=512;
  const stageContext=stageCanvas.getContext('2d'),stagePixels=stageContext.createImageData(512,512);
  for(let i=0;i<512*512;i++){const noise=(rand()-.5)*17;stagePixels.data[i*4]=196+noise;stagePixels.data[i*4+1]=189+noise;stagePixels.data[i*4+2]=175+noise;stagePixels.data[i*4+3]=255;}stageContext.putImageData(stagePixels,0,0);
  for(let i=0;i<90;i++){const x=rand()*512,y=rand()*512,r=range(8,48),gradient=stageContext.createRadialGradient(x,y,0,x,y,r);gradient.addColorStop(0,i%2?'rgba(96,103,78,.13)':'rgba(76,68,65,.12)');gradient.addColorStop(1,'rgba(96,103,78,0)');stageContext.fillStyle=gradient;stageContext.fillRect(x-r,y-r,r*2,r*2);}
  for(let i=0;i<2300;i++){stageContext.fillStyle=i%3?'rgba(255,245,220,.14)':'rgba(58,54,48,.16)';stageContext.beginPath();stageContext.ellipse(rand()*512,rand()*512,range(.3,1.4),range(.2,.8),rand()*TAU,0,TAU);stageContext.fill();}
  const stageTexture=new THREE.CanvasTexture(stageCanvas);stageTexture.colorSpace=THREE.SRGBColorSpace;stageTexture.wrapS=stageTexture.wrapT=THREE.RepeatWrapping;stageTexture.repeat.set(7,7);stageTexture.anisotropy=8;surfaceTextures.push(stageTexture);
  const stageEarth=mat('stageEarth',0x796e54,{map:stageTexture,bumpMap:stageTexture,bumpScale:.018,roughness:.98});
  const stageStone=mat('stageStone',0x8b7e69,{map:stageTexture,bumpMap:stageTexture,bumpScale:.012,roughness:.91});
  const stageBronze=mat('stageBronze',0x978366,{metalness:.32,roughness:.62});
  const stageFloor=new THREE.Mesh(new THREE.PlaneGeometry(70,70,20,20),stageEarth);stageFloor.rotation.x=-Math.PI/2;stageFloor.position.y=-.17;stageFloor.receiveShadow=true;battleLayers.common.add(stageFloor);
  const combatDais=mesh('cyl',stageStone,0,-.08,0,15,.20,12.8,battleLayers.common);combatDais.receiveShadow=true;combatDais.castShadow=false;
  for(const radius of [5.45,6.02]) {const ring=new THREE.Mesh(new THREE.TorusGeometry(radius,.017,5,128),stageBronze);ring.rotation.x=Math.PI/2;ring.position.y=.027;ring.scale.x=1.16;battleLayers.common.add(ring);}
  // Broken, engraved paving stones blend into earth and roots around the stage.
  for(let i=0;i<32;i++){const a=i*TAU/32,r=range(6.3,7.1);box(i%3?stageStone:m.darkStone,Math.cos(a)*r*1.15,-.03,Math.sin(a)*r,range(.50,.88),.19,range(.55,1),battleLayers.common,-a);}
  for(let i=0;i<20;i++){const a=i*TAU/20;box(i%3?stageBronze:m.cyan,Math.cos(a)*6.06*1.16,.036,Math.sin(a)*6.06,.15,.026,.31,battleLayers.common,-a);}
  for(const z of [-3.35,3.35])for(let i=-5;i<=5;i++)box(stageBronze,i*.7,.025,z,.37,.013,.035,battleLayers.common);
  const stageGrass=mat('stageGrass',0x63816c,{side:THREE.DoubleSide,roughness:1}),stageDryGrass=mat('stageDryGrass',0xa2916e,{side:THREE.DoubleSide,roughness:1});
  for(let i=0;i<320;i++){const a=rand()*TAU,r=range(7.1,12),x=Math.cos(a)*r*1.16,z=Math.sin(a)*r;if(z>0&&Math.abs(x)<7)continue;for(let j=0;j<3;j++){const blade=new THREE.Mesh(grassGeometry,i%3?stageGrass:stageDryGrass);blade.position.set(x+range(-.13,.13),-.12,z+range(-.13,.13));blade.rotation.y=rand()*TAU;blade.scale.setScalar(range(.65,1.35));battleLayers.common.add(blade);}if(i%4===0)mesh('sphere',i%2?m.paleRock:m.darkStone,x,-.09,z,range(.09,.28),range(.06,.13),range(.1,.24),battleLayers.common);}
  // A low ridge and a warm horizon frame the ruins, with the battle floor kept clear.
  const stageSky=new THREE.Mesh(new THREE.SphereGeometry(85,32,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,vertexShader:'varying vec3 v;void main(){v=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 v;void main(){float h=normalize(v).y;vec3 c=mix(vec3(.53,.255,.19),vec3(.045,.057,.12),smoothstep(-.04,.65,h));gl_FragColor=vec4(c,1.);}'}));battleRoot.add(stageSky);
  for(let layer=0;layer<3;layer++){const geo=new THREE.PlaneGeometry(120,18,100,8);geo.rotateX(-Math.PI/2);const p=geo.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),f=Math.max(0,1-Math.abs(z)/10);p.setY(i,(1.8+1.5*Math.sin(x*.10+layer)**2+1.1*Math.sin(x*.24+1.5)**2)*f-1.1);p.setZ(i,z-45-layer*15);}geo.computeVertexNormals();battleRoot.add(new THREE.Mesh(geo,mat('stageRidge'+layer,[0x545768,0x6e6778,0x85788a][layer],{roughness:1})));}
  const battleSunDisc=mesh('sphere',new THREE.MeshBasicMaterial({color:0xffce9e}),-22,10,-42,7,7,.6,battleRoot);battleSunDisc.castShadow=false;
  function stageAsset(theme,name,x,z,scale=1,rotation=0){const t=new THREE.Object3D();t.position.set(x,-.14,z);t.rotation.y=rotation;t.scale.setScalar(scale);t.updateMatrix();stagePlacements.push({theme,name,matrix:t.matrix.clone()});}
  [[-9,3,2.2],[9,3,2.3],[-10,-5,2.8],[10,-8,3.2],[-5,-12,1.6],[4,-13,2]].forEach(([x,z,scale])=>stageAsset('common','boulder',x,z,scale,rand()*TAU));
  [[-7.8,-4,1],[8,-4.5,.9],[-7,-10,.8],[7,-11,1.1]].forEach(([x,z,scale])=>stageAsset('common','ruin-column',x,z,scale,.12));
  stageAsset('common','ruin-arch',-.6,-13,.94,.04);
  stageAsset('causeway','canopy-tree',-10,-10,1.05,.3);
  [[-9,-7,1.15],[10,-9,1.25],[-12,1,.85]].forEach(([x,z,scale])=>stageAsset('garden','canopy-tree',x,z,scale,rand()*TAU));
  [[-10,-8,1.5],[11,-10,1.5]].forEach(([x,z,scale])=>stageAsset('wardens','ruin-column',x,z,scale));
  stageAsset('boss','ruin-arch',-7,-16,1.35,-.18);stageAsset('boss','ruin-arch',7,-16,1.35,.18);
  const stageHalo=group(0,7.5,-18,battleLayers.boss);stageHalo.rotation.z=-.16;
  mesh('torus',m.stoneTop,0,0,0,11,11,11,stageHalo);mesh('torus',m.bronze,0,0,.16,10.15,10.15,10.15,stageHalo);
  mesh('torus',m.cyan,0,0,.25,9.75,9.75,9.75,stageHalo);mesh('ico',m.pink,0,0,0,1.05,1.65,1.05,stageHalo);glow(stageHalo,0,0,.3,4.0,0xfaa5ff,.3);
  for(let i=0;i<15;i++){const a=i*TAU/15;box(stageBronze,Math.cos(a)*5.1,Math.sin(a)*5.1,.22,.19,.60,.16,stageHalo,a);}
  for(let i=0;i<20;i++){const x=range(-10,10),z=range(-15,-7);const g=battleLayers.garden;mesh('sphere',m.leafLight,x,.45,z,.48,.13,.48,g);beam([x,-.1,z],[x,.4,z],.06,m.violet,g);mesh('sphere',m.pink,x,.49,z,.17,.10,.17,g);}
  // Rigid stage detail is combined; background GLBs are combined when loaded.
  function batchStageGroup(root) {
    root.updateMatrixWorld(true);const buckets=new Map(),remove=[];
    root.traverse(o=>{if(!o.isMesh||o===stageSky||o.material.transparent)return;let blocked=false;for(let p=o.parent;p&&p!==root;p=p.parent)if(p===stageHalo)blocked=true;if(blocked)return;const key=o.material.uuid;if(!buckets.has(key))buckets.set(key,{material:o.material,geos:[]});let geo=o.geometry.clone();const matrix=new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(o.matrixWorld);geo.applyMatrix4(matrix);if(!geo.attributes.uv)geo.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count*2),2));geo=geo.index?geo.toNonIndexed():geo;buckets.get(key).geos.push(geo);remove.push(o);});
    for(const {material,geos}of buckets.values()){const geo=mergeGeometries(geos,false);if(!geo)continue;const o=new THREE.Mesh(geo,material);o.castShadow=material!==stageGrass&&material!==stageDryGrass;o.receiveShadow=true;root.add(o);geos.forEach(g=>g.dispose());}remove.forEach(o=>o.parent.remove(o));
  }
  Object.values(battleLayers).forEach(batchStageGroup);
  function dressBattleStage(name,gltf) {
    gltf.scene.updateMatrixWorld(true);const buckets=new Map();
    for(const entry of stagePlacements.filter(p=>p.name===name))gltf.scene.traverse(part=>{if(!part.isMesh||Array.isArray(part.material))return;const key=entry.theme+part.material.uuid;if(!buckets.has(key))buckets.set(key,{theme:entry.theme,material:part.material,geos:[]});let geo=part.geometry.clone();geo.applyMatrix4(part.matrixWorld);geo.applyMatrix4(entry.matrix);if(!geo.attributes.uv)geo.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count*2),2));geo=geo.index?geo.toNonIndexed():geo;buckets.get(key).geos.push(geo);});
    for(const {theme,material,geos}of buckets.values()){const geo=mergeGeometries(geos,false);if(!geo)continue;const o=new THREE.Mesh(geo,material);o.castShadow=true;o.receiveShadow=true;o.name='battle-'+name;battleLayers[theme].add(o);geos.forEach(g=>g.dispose());}renderer.shadowMap.needsUpdate=true;
  }
  let battle=null,battleActors=[],elapsed=0,shake=0,impactPause=0,lastMode='title',quality='high';
  let currentState=null,lastBeacon=-1,flashStrength=0,cinematicPulse=0;
  const effects=[],pendingImpacts=[];
  const effectRoot=new THREE.Group();scene.add(effectRoot);
  const raycaster=new THREE.Raycaster(),groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0),pointer=new THREE.Vector2();
  const particlesGeo=new THREE.BufferGeometry(),particlePos=[],particleSeeds=[];
  for(let i=0;i<120;i++){particlePos.push(range(-26,26),range(.4,5.5),range(-30,25));particleSeeds.push(rand()*TAU);}
  particlesGeo.setAttribute('position',new THREE.Float32BufferAttribute(particlePos,3));
  const motes=new THREE.Points(particlesGeo,new THREE.PointsMaterial({color:0xffd69b,size:.045,transparent:true,opacity:.65,depthWrite:false}));scene.add(motes);

  function setBattle(next) {
    for(const a of battleActors)a.g.parent?.remove(a.g);
    battleActors=[];battle=next;pendingImpacts.length=0;impactPause=0;flashStrength=0;cinematicPulse=0;for(const fx of effects){effectRoot.remove(fx.o);fx.o.geometry.dispose();fx.o.material.dispose();}effects.length=0;
    for(const a of HERO_IDS.map(id=>actors[id])){a.motion=null;a.attack=0;a.hit=0;a.visualDeathUntil=0;a.impactLanded=false;a.body.position.set(0,0,0);a.body.rotation.set(0,0,0);}
    if(next) {
      battleRoot.position.set(next.origin.x,0,next.origin.z);stageSun.target.position.set(0,0,0);
      for(const [theme,g]of Object.entries(battleLayers))g.visible=theme==='common'||theme===next.id;
      if(!['garden','wardens','boss'].includes(next.id))battleLayers.causeway.visible=true;
      battleScene.add(effectRoot);
      for(const en of next.enemies) {
        const a=enemy(en.type||'crawler',en.id,battleScene);a.home=new THREE.Vector3(next.origin.x+en.x,.045,next.origin.z+en.z);a.homeYaw=-Math.PI*.26;
        a.g.position.copy(a.home);a.g.rotation.y=a.homeYaw;a.data=en;if(a.boss&&bossTemplate)bindActorModel(a,bossTemplate.clone(true));battleActors.push(a);
      }
      HERO_IDS.forEach((id,i)=>{const a=actors[id];battleScene.add(a.g);a.home=new THREE.Vector3(next.origin.x-3,.045,next.origin.z+(i-1)*2);a.homeYaw=Math.PI*.32;a.g.position.copy(a.home);a.g.rotation.y=a.homeYaw;a.g.traverse(o=>{if(o.isMesh&&o.material?.isMeshStandardMaterial)o.castShadow=true;});});
    } else {
      scene.add(effectRoot);
      HERO_IDS.forEach(id=>{const a=actors[id];a.home=null;actorRoot.add(a.g);a.g.traverse(o=>{if(o.isMesh)o.castShadow=false;});});
    }
    renderer.shadowMap.needsUpdate=true;
  }
  function actorNear(p) {
    if(!p)return null;let closest=null,d=2.3;
    for(const a of [...HERO_IDS.map(id=>actors[id]),...battleActors]){const n=Math.hypot((a.home||a.g.position).x-p.x,(a.home||a.g.position).z-p.z);if(n<d){d=n;closest=a;}}
    return closest;
  }
  function addEffect(geo,color,pos,life,opts={}) {
    const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity:opts.opacity??1,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending});
    const o=new THREE.Mesh(geo,material);o.position.set(pos.x,opts.ground?(battle?.045:surfaceY(pos.x,pos.z))+.025:(pos.y??.18),pos.z);effectRoot.add(o);
    const fx={o,life,max:life,...opts};effects.push(fx);return fx;
  }
  function sparks(p,color,n=14,scale=1) {
    for(let i=0;i<n;i++) {
      const a=rand()*TAU,s=range(1.2,4)*scale;
      const f=addEffect(new THREE.SphereGeometry(range(.025,.07)*scale,4,3),color,{x:p.x,y:range(.6,1.4),z:p.z},range(.35,.8),{velocity:new THREE.Vector3(Math.cos(a)*s,range(1,4)*scale,Math.sin(a)*s),gravity:7});
    }
  }
  const anticipationTimes={attack:.34,tech:.38,combo:.50,triple:.65};
  function getImpactDelay(effect){return anticipationTimes[typeof effect==='string'?effect:effect?.type]||0;}
  function getBattlePresentation(){return {active:!!battle,units:[...HERO_IDS.map(id=>actors[id]),...battleActors].map(a=>({id:a.id,home:a.home?{x:a.home.x,z:a.home.z}:null,position:{x:a.g.position.x,z:a.g.position.z},visible:a.g.visible,attackPhase:a.motion?.phase||'idle',model:a.model?'glb':'procedural'})),camera:{position:camera.position.toArray(),target:cameraTarget.toArray(),fov:camera.fov}};}
  function effect(e={}) {
    const type=e.type||'hit',delay=anticipationTimes[type]||0;
    const source=e.source||e.target||currentState?.player||{x:0,z:0};
    const target=e.target||e.targets?.[0]||source;
    const label=e.label||'';
    const participants=type==='triple'?HERO_IDS:type==='combo'?
      (e.participants||(/rift cleave/i.test(label)?['kaida','vex']:/sunbreak/i.test(label)?['kaida','rune']:/sanctuary/i.test(label)?['vex','rune']:[])):[];
    const acting=participants.length?participants.map(id=>actors[id]).filter(Boolean):[actorNear(source)].filter(Boolean);
    if(delay) {
      for(const a of acting) {
        const home=a.home?a.home.clone():a.g.position.clone(),dx=target.x-home.x,dz=target.z-home.z,distance=Math.hypot(dx,dz)||1,ux=dx/distance,uz=dz/distance;
        const sanctuary=/sanctuary/i.test(label),ranged=a.id==='vex'||a.wisp||a.type==='drone';
        const kind=type==='triple'?'channel':sanctuary?'support':ranged?'cast':'melee';
        const end=home.clone(),index=acting.indexOf(a),side=acting.length>1?(index-(acting.length-1)*.5)*1.05:0;
        if(kind==='melee'){const stop=a.boss?1.45:a.id==='rune'?1.05:.90;end.set(target.x-ux*stop-uz*side,.045,target.z-uz*stop+ux*side);}
        else if(kind==='channel'&&battle)end.set(battle.origin.x-1.15,.045,battle.origin.z+(HERO_IDS.indexOf(a.id)-1)*1.05);
        else end.add(new THREE.Vector3(ux*.18,0,uz*.18));
        const windup=type==='attack'?.16:type==='tech'?.18:type==='combo'?.23:.28;
        a.motion={home,end,kind,windup,impact:delay,contact:.07,retreat:type==='triple'?.36:.28,total:delay+.07+(type==='triple'?.36:.28),elapsed:0,phase:'anticipation',target:{...target},projectile:false,leap:/sunbreak/i.test(label)&&a.id==='kaida',color:e.color||COLORS[a.id]||0xffa276};
        a.attack=a.motion.total;a.attackTotal=a.attack;a.anticipation=delay;a.attackType=type;a.attackTarget={...target};
        if(type==='triple')cinematicPulse=1.1;
        if(type!=='attack') {
          const p=a.g.position;
          addEffect(new THREE.RingGeometry(.43,.48,36),COLORS[a.id]||e.color||0xffb07d,{x:p.x,z:p.z},delay,{ground:true,expand:.55,opacity:.45,rotation:1});
        }
      }
      // Combat damage is resolved by the game immediately. Hold a slain model
      // through anticipation and impact, then let it collapse into the particles.
      if(!/sanctuary/i.test(label))for(const p of e.targets?.length?e.targets:[target]) {
        const a=actorNear(p);if(a){a.visualDeathUntil=Math.max(a.visualDeathUntil||0,elapsed+delay+.46);a.impactLanded=false;}
      }
      pendingImpacts.push({remaining:delay,performers:acting,e:{...e,actorId:acting[0]?.id,source:{...source},target:{...target},targets:e.targets?.map(p=>({...p}))}});
    } else launchImpact(e);
  }
  function launchImpact(e={}) {
    const type=e.type||'hit',source=e.source||e.target||currentState?.player||{x:0,z:0},target=e.target||e.targets?.[0]||source;
    const color=e.color|| (type==='heal'?0x83ffce:type==='triple'?0xffd4a0:type==='combo'?0xe8a1ff:0x89efff);
    const sanctuary=type==='combo'&&/sanctuary/i.test(e.label||'');
    const offensive=['attack','tech','combo','triple','hit'].includes(type)&&!sanctuary;
    if(offensive) {
      for(const p of e.targets?.length?e.targets:[target]) {
        const victim=actorNear(p);if(victim){victim.hit=.30;victim.hitFrom=source;victim.impactLanded=true;}
      }
      impactPause=Math.max(impactPause,type==='combo'||type==='triple'?.10:.06);
    }
    if(sanctuary) {
      for(const id of HERO_IDS) {
        const p=actors[id].g.position;
        addEffect(new THREE.RingGeometry(.48,.57,48),0x83ffdf,{x:p.x,z:p.z},1.2,{expand:2.5,ground:true});
        addEffect(new THREE.SphereGeometry(.72,16,12),0x92f8ea,{x:p.x,z:p.z,y:p.y+1},.8,{expand:.35,opacity:.13});
        for(let j=0;j<6;j++)addEffect(new THREE.SphereGeometry(.045,4,3),0xabffec,{x:p.x+range(-.5,.5),z:p.z+range(-.5,.5),y:p.y+.2},.85,{velocity:new THREE.Vector3(0,range(1,2),0)});
      }
    } else if(type==='combo'||type==='triple') {
      shake=type==='triple'?.43:.24;if(type==='triple'){flashStrength=.8;cinematicPulse=1.2;}
      addEffect(new THREE.RingGeometry(.65,1.05,70),color,{...target,y:.16},1.1,{expand:9,ground:true,rotation:2});
      for(let i=0;i<(type==='triple'?4:2);i++) {
        const fx=addEffect(new THREE.TorusGeometry(1+i*.35,.045,5,64),i%2?0x85ffff:color,{...target,y:1.2},.95,{expand:2+i*.3,rotation:3+i});
        fx.o.rotation.set(.4+i*.65,i*.8,.3);
      }
      if(type==='triple') {
        addEffect(new THREE.CylinderGeometry(.08,.9,13,20,1,true),0xd5fff4,{...target,y:6},.8,{expand:1.8});
        for(let j=0;j<3;j++) {const p=actors[HERO_IDS[j]].g.position;const dir=new THREE.Vector3(target.x-p.x,1,target.z-p.z);const fx=addEffect(new THREE.CylinderGeometry(.035,.12,dir.length(),8),COLORS[HERO_IDS[j]],{x:(p.x+target.x)/2,z:(p.z+target.z)/2,y:1.2},.75);fx.o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());}
      }
      sparks(target,color,type==='triple'?44:26,1.4);
    } else if(type==='attack'&&e.actorId==='vex') {
      addEffect(new THREE.TorusGeometry(.38,.04,6,40),0xdd9bff,{...target,y:1.2},.42,{expand:2.2,rotation:5});sparks(target,0xd89cff,16);shake=Math.max(shake,.10);
    } else if(type==='attack') {
      if(e.actorId==='rune')addEffect(new THREE.RingGeometry(.35,.46,40),0x9effe8,target,.4,{ground:true,expand:3});
      const fx=addEffect(new THREE.TorusGeometry(.83,.052,5,36,Math.PI*1.3),color,{...target,y:1},.35,{expand:1.6,rotation:8});fx.o.rotation.set(.5,Math.PI/2,.3);
      sparks(target,0xffd1aa,11);shake=Math.max(shake,.12);
    } else if(type==='tech') {
      const fx=addEffect(new THREE.RingGeometry(.35,.65,48),color,{...target,y:.14},.8,{expand:4,ground:true,rotation:3});
      for(let j=0;j<6;j++){const a=j*TAU/6;addEffect(new THREE.ConeGeometry(.12,1.9,5),color,{x:target.x+Math.cos(a)*.9,z:target.z+Math.sin(a)*.9,y:.9},.65,{expand:1.5});}
      sparks(target,color,22);shake=Math.max(shake,.2);
    } else if(type==='heal'||type==='build') {
      addEffect(new THREE.RingGeometry(.4,.5,48),color,{...target,y:.12},1.1,{expand:4,ground:true});
      for(let j=0;j<12;j++)addEffect(new THREE.SphereGeometry(.065,5,4),color,{x:target.x+range(-.8,.8),z:target.z+range(-.8,.8),y:range(.1,1)},1.2,{velocity:new THREE.Vector3(0,range(1,2.4),0)});
    } else {
      const victim=actorNear(target);if(victim)victim.hit=.24;sparks(target,color,9);shake=Math.max(shake,.08);
    }
  }
  function animateActor(a,dt,moving=false,dead=false) {
    if(dt<=0)return;
    let motion=a.motion;
    if(motion) {
      motion.elapsed+=dt;a.attack=Math.max(0,motion.total-motion.elapsed);
      if(motion.elapsed>=motion.total){a.g.position.copy(motion.home);a.g.rotation.y=a.homeYaw??a.g.rotation.y;a.motion=null;motion=null;a.attack=0;}
    }
    const strideMotion=motion&&(motion.phase==='dash'||motion.phase==='retreat');
    a.phase+=dt*((moving||strideMotion)?12:1.7);
    if(a.legs) {
      const stride=moving||strideMotion?.63:.025;
      a.legs[0].rotation.x=Math.sin(a.phase)*stride;a.legs[1].rotation.x=-Math.sin(a.phase)*stride;
      a.legs.forEach((l,i)=>l.userData.knee.rotation.x=Math.max(0,Math.sin(a.phase+i*Math.PI))*(moving||strideMotion?.68:0));
      a.arms[0].rotation.x=-Math.sin(a.phase)*stride*.65;a.arms[1].rotation.x=Math.sin(a.phase)*stride*.65;
      a.cloak.rotation.x=(moving||strideMotion?-.27:0)+Math.sin(a.phase*.7)*.055;
      a.head.rotation.y=Math.sin(elapsed*.75+a.phase*.1)*.045;
      a.arms[0].rotation.z=.085;a.arms[1].rotation.z=-.085;
    }
    a.body.position.set(0,moving?Math.abs(Math.sin(a.phase))*.055:Math.sin(a.phase)*.011,0);a.body.rotation.y=0;
    if(a.home&&!motion){a.g.position.copy(a.home);a.g.rotation.y=a.homeYaw;}
    if(motion) {
      const q=motion.elapsed,impact=motion.impact,retreatAt=impact+motion.contact;
      const smooth=t=>{t=THREE.MathUtils.clamp(t,0,1);return t*t*(3-2*t);};
      let travel=0,wind=0,strike=0;
      if(q<motion.windup){motion.phase='anticipation';wind=smooth(q/motion.windup);travel=-.018*wind;}
      else if(q<impact){motion.phase=motion.kind==='cast'?'casting':'dash';travel=smooth((q-motion.windup)/(impact-motion.windup));wind=1-travel;strike=travel;}
      else if(q<retreatAt){motion.phase='contact';travel=1;strike=1;}
      else{motion.phase='retreat';travel=1-smooth((q-retreatAt)/motion.retreat);strike=travel;}
      a.g.position.copy(motion.home).lerp(motion.end,travel);
      const dx=motion.target.x-motion.home.x,dz=motion.target.z-motion.home.z;
      const facing=Math.atan2(dx,dz),turn=motion.kind==='support'||motion.kind==='channel'?.32:Math.min(1,.5+travel*.5);
      const homeYaw=a.homeYaw??a.g.rotation.y;a.g.rotation.y=homeYaw+Math.atan2(Math.sin(facing-homeYaw),Math.cos(facing-homeYaw))*turn;
      if(a.arms) {
        if(motion.kind==='cast'||motion.kind==='support'||motion.kind==='channel') {
          const casting=Math.max(wind,travel);a.arms[1].rotation.x=-.72*casting;a.arms[0].rotation.x=-1.17*casting;a.arms[0].rotation.z=.28*casting;a.body.rotation.y=-.07*casting;
        } else {a.arms[1].rotation.x=.70*wind-1.72*strike;a.arms[1].rotation.z=-.30*wind-.22*strike;a.arms[0].rotation.x=-.24*wind-(a.id==='rune'?1.1:.52)*strike;a.body.rotation.y=-.20*wind+.16*strike;}
      }
      a.body.position.y+=motion.kind==='channel'?.32*travel:motion.leap?Math.sin(Math.max(0,travel)*Math.PI*.82)*.86:-.05*wind+(motion.phase==='dash'?Math.abs(Math.sin(a.phase))*.06:0);
      if(motion.kind==='cast'&&!motion.projectile&&q>=impact-.18&&q<impact) {
        motion.projectile=true;
        const from=new THREE.Vector3(a.g.position.x,1.52,a.g.position.z),to=new THREE.Vector3(motion.target.x,1.0,motion.target.z);
        addEffect(new THREE.SphereGeometry(.13,12,8),motion.color,{x:from.x,y:from.y,z:from.z},Math.max(.04,impact-q),{path:{from,to}});
        addEffect(new THREE.SphereGeometry(.30,12,8),motion.color,{x:from.x,y:from.y,z:from.z},Math.max(.04,impact-q),{path:{from:from.clone(),to:to.clone()},opacity:.20});
      }
      if(motion.kind==='melee'&&motion.phase==='dash'&&!motion.dust){motion.dust=true;for(let i=0;i<5;i++)addEffect(new THREE.SphereGeometry(.045,5,4),0xc4ab80,{x:motion.home.x+range(-.15,.15),y:.09,z:motion.home.z+range(-.15,.15)},.35,{velocity:new THREE.Vector3(range(-.4,.4),range(.15,.45),range(-.4,.4)),opacity:.25});}
    }
    if(a.hit>0) {
      a.hit=Math.max(0,a.hit-dt);a.body.rotation.z=Math.sin(a.hit*34)*.15;
      if(a.hitFrom) {
        const dx=a.g.position.x-a.hitFrom.x,dz=a.g.position.z-a.hitFrom.z,d=Math.hypot(dx,dz)||1,cy=Math.cos(a.g.rotation.y),sy=Math.sin(a.g.rotation.y),push=Math.sin(a.hit/.3*Math.PI)*.18;
        a.body.position.x+=(dx*cy-dz*sy)/d*push;a.body.position.z+=(dx*sy+dz*cy)/d*push;
      }
    } else a.body.rotation.z=a.legs?0:Math.sin(a.phase)*.017;
    if(dead){a.body.rotation.z=-1.25;a.body.position.y=-.06;if(a.ring)a.ring.visible=false;}else if(a.ring)a.ring.visible=a.id!=='mira';
  }
  function update(dt,state) {
    currentState=state;if(lastBeacon!==state.settlement?.beacon){lastBeacon=state.settlement?.beacon;renderer.shadowMap.needsUpdate=true;}elapsed+=dt;waterUniforms.time.value=elapsed;
    const mode=state.mode;const inBattle=!!state.battle&&['battle','victory','defeat','menu','dialogue'].includes(mode);
    if((inBattle&&!battle)|| (inBattle&&battle!==state.battle))setBattle(state.battle);
    if(!inBattle&&battle)setBattle(null);
    for(let i=pendingImpacts.length-1;i>=0;i--) {
      pendingImpacts[i].remaining-=dt;
      if(pendingImpacts[i].remaining<=0){const {e,performers}=pendingImpacts.splice(i,1)[0];for(const a of performers){if(a.motion)a.motion.elapsed=Math.max(a.motion.elapsed,a.motion.impact);animateActor(a,.00001);}launchImpact(e);}
    }
    const actorDt=impactPause>0?0:dt;impactPause=Math.max(0,impactPause-dt);
    const player=state.player||{x:0,z:16};
    if(!inBattle) {
      HERO_IDS.forEach((id,i)=>{
        const a=actors[id],tx=player.x+(i===1?-.85:i===2?.85:0),tz=player.z+(i?1.05:0);
        const dx=tx-a.g.position.x,dz=tz-a.g.position.z,moving=Math.hypot(dx,dz)>.035;
        a.g.position.x+=dx*Math.min(1,dt*(i?7:13));a.g.position.z+=dz*Math.min(1,dt*(i?7:13));
        a.g.position.y=surfaceY(a.g.position.x,a.g.position.z);
        if(moving){const targetAngle=Math.atan2(dx,dz);a.g.rotation.y+=Math.atan2(Math.sin(targetAngle-a.g.rotation.y),Math.cos(targetAngle-a.g.rotation.y))*Math.min(1,dt*10);}
        animateActor(a,dt,moving,false);
      });
    } else {
      HERO_IDS.forEach((id,i)=>{const a=actors[id];animateActor(a,actorDt,false,state.party?.[i]?.hp<=0&&(!a.visualDeathUntil||elapsed>=a.visualDeathUntil-.25));});
      battleActors.forEach(a=>{
        const data=state.battle.enemies.find(e=>e.id===a.id);a.g.visible=!!data&&(data.hp>0||elapsed<(a.visualDeathUntil||0));
        if(data&&a.home)a.home.set(state.battle.origin.x+data.x,.045,state.battle.origin.z+data.z);
        animateActor(a,actorDt,false,!!data&&data.hp<=0&&a.impactLanded);
      });
    }
    if(inBattle&&[...HERO_IDS.map(id=>actors[id]),...battleActors].some(a=>a.motion||a.hit>0))renderer.shadowMap.needsUpdate=true;
    animateActor(mira,dt);
    for(const [id,a]of Object.entries(ambientEnemies)){a.g.visible=!inBattle&&!state.cleared?.includes(id);if(a.g.visible){a.g.position.y=surfaceY(a.g.position.x,a.g.position.z);animateActor(a,dt);}}
    for(const [id,g]of Object.entries(caches))g.visible=!state.flags?.[id]&&!state.flags?.[id==='cache-west'?'cacheWest':'cacheEast'];
    const built=!!state.settlement?.beacon;beaconPowered.visible=built;beaconUpgrade.visible=state.settlement?.beacon>=2;beaconLight.intensity=built?7:0;
    beaconOrb.rotation.y=elapsed*.5;beaconOrb.position.y=1.9+Math.sin(elapsed*2)*.12;beaconRing.rotation.z=elapsed*.5;
    for(const [id,r]of Object.entries(relays)){const on=!!state.flags?.[id==='relay-west'?'relayWest':'relayEast'];r.power.visible=on;r.ring.rotation.z=elapsed*.4;r.ring.position.y=2.3+Math.sin(elapsed*1.2)*.09;}
    heart.rotation.y=elapsed*.18;heart.position.y=7.25+Math.sin(elapsed*.65)*.17;
    flameObjects.forEach((f,i)=>{f.scale.y=.8+Math.sin(elapsed*9+i)*.16;f.rotation.y+=dt*.5;});
    firelight.intensity=5.8+Math.sin(elapsed*12)*.7;
    for(const g of glows)g.sprite.material.opacity=g.opacity*(.91+Math.sin(elapsed*1.9+g.phase)*.09)*(quality==='low'?.55:1);
    const pp=particlesGeo.attributes.position;
    for(let i=0;i<pp.count;i++){pp.setY(i,particlePos[i*3+1]+Math.sin(elapsed*.4+particleSeeds[i])*.25);pp.setX(i,particlePos[i*3]+Math.sin(elapsed*.16+particleSeeds[i])*.5);}pp.needsUpdate=true;
    for(let i=effects.length-1;i>=0;i--) {
      const fx=effects[i];fx.life-=dt;
      if(fx.life<=0){effectRoot.remove(fx.o);fx.o.geometry.dispose();fx.o.material.dispose();effects.splice(i,1);continue;}
      const t=1-fx.life/fx.max;fx.o.material.opacity=(fx.opacity??1)*(1-t);
      if(fx.expand)fx.o.scale.setScalar(1+t*fx.expand);
      if(fx.ground)fx.o.rotation.x=-Math.PI/2;
      if(fx.rotation)fx.o.rotation.z+=dt*fx.rotation;
      if(fx.path)fx.o.position.lerpVectors(fx.path.from,fx.path.to,t);
      if(fx.velocity){fx.o.position.addScaledVector(fx.velocity,dt);fx.velocity.y-=(fx.gravity||0)*dt;}
    }
    // A stable elevated perspective keeps travel legible; battle lowers and moves
    // closer for the same actors and scenery, preserving geographic continuity.
    let offset;
    if(mode==='title') {
      desiredTarget.set(0,1.8,-6);offset=new THREE.Vector3(24,32,45);
    } else if(mode==='ending') {
      desiredTarget.set(0,3,-19);offset=new THREE.Vector3(16,20,30);
    } else if(inBattle) {
      desiredTarget.set(state.battle.origin.x+.20,camera.aspect<.8?0:1.12,state.battle.origin.z+.30);offset=new THREE.Vector3(3.2,4.6,11.1);if(camera.aspect<.8)offset.multiplyScalar(Math.max(1.8,.94/camera.aspect));if(cinematicPulse>.02){desiredTarget.x-=cinematicPulse*.65;offset.multiplyScalar(1+cinematicPulse*.045);}
    } else {
      desiredTarget.set(player.x,0.8,player.z-2.7);offset=new THREE.Vector3(13.8,19.8,23.8);
    }
    const damping=mode!==lastMode?.045:Math.min(1,dt*4);
    cameraTarget.lerp(desiredTarget,damping);
    const cp=cameraTarget.clone().add(offset);
    camera.position.lerp(cp,mode!==lastMode?.065:Math.min(1,dt*3.2));
    if(shake>.003){camera.position.x+=Math.sin(elapsed*97)*shake;camera.position.y+=Math.sin(elapsed*113)*shake*.45;shake*=Math.exp(-dt*9);}
    camera.lookAt(cameraTarget);
    const desiredFov=inBattle?(camera.aspect<.8?44:38)-cinematicPulse*1.5:38;camera.fov=THREE.MathUtils.lerp(camera.fov,desiredFov,dt*6);cinematicPulse*=Math.exp(-dt*2.8);flashStrength*=Math.exp(-dt*22);flashPass.uniforms.flash.value=flashStrength;
    camera.updateProjectionMatrix();lastMode=mode;
  }
  function resize() {
    const rect=canvas.getBoundingClientRect(),w=Math.max(1,rect.width),h=Math.max(1,rect.height);
    renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();composer.setPixelRatio(renderer.getPixelRatio());composer.setSize(w,h);bloomPass.setSize(Math.round(w*.6),Math.round(h*.6));ssaoPass.setSize(Math.round(w*.75),Math.round(h*.75));
  }
  function setQuality(next) {
    quality=next;ssaoPass.enabled=next==='high';bloomPass.enabled=next!=='low';renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,next==='high'?1.7:next==='medium'?1.3:1));
    renderer.shadowMap.enabled=next!=='low';motes.visible=next!=='low';sun.shadow.mapSize.set(next==='high'?2048:1024,next==='high'?2048:1024);
    if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null;}renderer.shadowMap.needsUpdate=true;resize();
  }
  function screenToGround(clientX,clientY) {
    const rect=canvas.getBoundingClientRect();pointer.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);
    raycaster.setFromCamera(pointer,camera);const p=new THREE.Vector3();return raycaster.ray.intersectPlane(groundPlane,p)?{x:p.x,z:p.z}:null;
  }
  function project(x,z,y=1) {
    const rect=canvas.getBoundingClientRect(),v=new THREE.Vector3(x,y,z).project(camera);
    return {x:rect.left+(v.x*.5+.5)*rect.width,y:rect.top+(-v.y*.5+.5)*rect.height,visible:v.z>-1&&v.z<1&&Math.abs(v.x)<1.1&&Math.abs(v.y)<1.1};
  }
  const canalCollisionSamples=Array.from({length:101},(_,i)=>canal.getPoint(i/100));
  function canWalk(x,z) {
    if(x<-24||x>24||z<-27||z>23)return false;
    let onBridge=false;
    for(const [cx,cz,hx,hz,a]of [[1,3.9,4.65,2.65,0],[-13.7,3.5,1.36,2.65,.18],[14.5,6.3,1.36,2.65,-.22]]) {
      const dx=x-cx,dz=z-cz;if(Math.abs(dx*Math.cos(a)-dz*Math.sin(a))<hx&&Math.abs(dx*Math.sin(a)+dz*Math.cos(a))<hz){onBridge=true;break;}
    }
    if(!onBridge)for(let i=1;i<canalCollisionSamples.length;i++) {
      const a=canalCollisionSamples[i-1],b=canalCollisionSamples[i],dx=b.x-a.x,dz=b.z-a.z,t=THREE.MathUtils.clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1);
      if(Math.hypot(x-a.x-dx*t,z-a.z-dz*t)<1.42)return false;
    }
    if(sceneryBlockers.some(p=>Math.hypot(x-p.x,z-p.z)<p.r))return false;
    // Allow generous space around objects and every encounter / interaction.
    for(const [cx,cz,hx,hz] of [[-5.4,17,1.65,1.15],[5.9,18,1.65,1.15],[-6.2,22,1.4,.9],[9.6,20,1.6,1.4]])if(Math.abs(x-cx)<hx&&Math.abs(z-cz)<hz)return false;
    return true;
  }
  function dispose() {
    disposed=true;battleScene.traverse(o=>{if(o.isMesh||o.isPoints||o.isSprite){o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose();}});environmentTarget.dispose();surfaceTextures.forEach(t=>t.dispose());composer.passes.forEach(p=>p.dispose?.());composer.dispose();glowTexture.dispose();scene.traverse(o=>{if(o.isMesh||o.isPoints||o.isSprite){o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose();}});renderer.dispose();
  }
  let disposed=false,bossTemplate=null;
  const loader=new GLTFLoader();
  const modelUrl=name=>new URL(`models/${name}.glb`,new URL(import.meta.env?.BASE_URL||'/',location.href)).href;
  const assetStatus={environment:Object.fromEntries([...new Set(replacements.map(r=>r.name))].map(name=>[name,'loading'])),heroes:Object.fromEntries(HERO_IDS.map(id=>[id,'loading'])),enemies:{'pale-warden':'loading'},errors:[],ready:false};
  async function loadEnvironment(name) {
    try {
      const gltf=await loader.loadAsync(modelUrl(name));if(disposed)return;
      environmentModels[name]=gltf;dressBattleStage(name,gltf);gltf.scene.updateMatrixWorld(true);const buckets=new Map();
      for(const entry of replacements.filter(r=>r.name===name))gltf.scene.traverse(part=>{
        if(!part.isMesh||Array.isArray(part.material))return;
        const material=part.material;material.flatShading=false;material.envMapIntensity=.35;
        if(!buckets.has(material.uuid))buckets.set(material.uuid,{material,geometries:[]});
        let geo=part.geometry.clone();geo.applyMatrix4(part.matrixWorld);geo.applyMatrix4(entry.matrix);
        if(!geo.attributes.normal)geo.computeVertexNormals();if(!geo.attributes.uv)geo.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count*2),2));
        geo=geo.index?geo.toNonIndexed():geo;buckets.get(material.uuid).geometries.push(geo);
      });
      for(const {material,geometries}of buckets.values()) {
        const geometry=mergeGeometries(geometries,false);if(!geometry)continue;
        const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;mesh.name=`sculpted-${name}`;scene.add(mesh);geometries.forEach(g=>g.dispose());
      }
      for(const entry of replacements.filter(r=>r.name===name))scene.remove(entry.fallback);
      renderer.shadowMap.needsUpdate=true;assetStatus.environment[name]='loaded';
    } catch(error){assetStatus.environment[name]='fallback';assetStatus.errors.push({name,message:error.message});console.warn(`Using authored fallback for ${name}: ${error.message}`);}
  }
  function bindActorModel(a,root) {
    const find=(...names)=>{for(const name of names){const node=root.getObjectByName(name);if(node)return node;}const node=new THREE.Group();root.add(node);return node;};
    root.traverse(o=>{if(o.isMesh){o.castShadow=!!battle;o.receiveShadow=true;const materials=Array.isArray(o.material)?o.material:[o.material];materials.forEach(m=>{m.flatShading=false;m.envMapIntensity=.45;});}});
    a.g.remove(a.model||a.body);if(a.boss)root.scale.setScalar(.87);a.g.add(root);a.body=root;
    a.head=find('head','Head');a.arms=[find('leftArm','Arm_L'),find('rightArm','Arm_R')];a.legs=[find('leftLeg','Leg_L'),find('rightLeg','Leg_R')];
    a.legs[0].userData.knee=find('leftKnee','Knee_L');a.legs[1].userData.knee=find('rightKnee','Knee_R');a.cloak=find('cloak','Cape');a.weapon=find('weapon','Weapon');a.model=root;
  }
  async function loadHero(id) {
    try {const gltf=await loader.loadAsync(modelUrl(id));if(disposed)return;bindActorModel(actors[id],gltf.scene);assetStatus.heroes[id]='loaded';}
    catch(error){assetStatus.heroes[id]='fallback';assetStatus.errors.push({name:id,message:error.message});console.warn(`Using authored fallback for ${id}: ${error.message}`);}
  }
  async function loadBoss() {
    try {const gltf=await loader.loadAsync(modelUrl('pale-warden'));if(disposed)return;bossTemplate=gltf.scene;for(const a of battleActors.filter(a=>a.boss))bindActorModel(a,bossTemplate.clone(true));assetStatus.enemies['pale-warden']='loaded';}
    catch(error){assetStatus.enemies['pale-warden']='fallback';assetStatus.errors.push({name:'pale-warden',message:error.message});console.warn(`Using authored boss fallback: ${error.message}`);}
  }
  const assetsReady=Promise.allSettled([...new Set(replacements.map(r=>r.name))].map(loadEnvironment).concat(HERO_IDS.map(loadHero),loadBoss())).then(results=>{assetStatus.ready=true;return results;});
  camera.position.set(24,33.8,39);camera.lookAt(cameraTarget);resize();
  return { update,render:()=>{renderer.info.reset();const active=battle?battleScene:scene;renderPass.scene=active;ssaoPass.scene=active;if(quality==='low')renderer.render(active,camera);else composer.render();},resize,setQuality,screenToGround,project,setBattle,effect,dispose,canWalk,landmarks:LANDMARKS.map(l=>({...l})),renderer,scene,camera,battleScene,assetsReady,assetStatus,getImpactDelay,addBattleOverlay:object=>{battleScene.add(object);return object;},battleGroundY:()=>.045,getBattlePresentation };
}
