import * as T from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { createNacreOceanClock } from '../../nacre/environment/ocean-clock.js';

const ROOT_BODY_THRESHOLD = 0.32;
const ROOT_LIGHT_WRAP = 0.08,
  ROOT_LIGHT_FLOOR = 0.06;
// For uniformly distributed outward normals, mu = dot(normal, sun) is uniform
// on [-1, 1]. Preserve the broad response's mean energy, 0.5360294, while
// concentrating its warm light on exposed lobes. The narrower linear wrap has
// mean (1 + wrap) / 4, so its gain is 1.763072 rather than an arbitrary boost.
const ROOT_LIGHT_MEAN = 0.15 + (1.05 * 1.25) / (2 * 1.7);
const ROOT_LIGHT_GAIN =
  (ROOT_LIGHT_MEAN - ROOT_LIGHT_FLOOR) / ((1 + ROOT_LIGHT_WRAP) / 4);

const smooth = (a, b, x) => {
  const t = T.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// Periodic fields are built once. Weather controls stay smooth and separate
// from the 3D body: using a nearest-cell field as both a height map and a warp
// folded the distant deck into pointed fans, even with dense ray integration.
function cloudField(seed) {
  const hash = (x, y, z) => {
    let v =
      Math.imul(x + seed, 374761393) ^
      Math.imul(y, 668265263) ^
      Math.imul(z, 2147483647);
    v = Math.imul(v ^ (v >>> 13), 1274126177);
    return ((v ^ (v >>> 16)) >>> 0) / 4294967295;
  };
  const wrap = (v, period) => ((v % period) + period) % period;
  function noise(x, y, z, period) {
    const ix = Math.floor(x),
      iy = Math.floor(y),
      iz = Math.floor(z);
    const fx = smooth(0, 1, x - ix),
      fy = smooth(0, 1, y - iy),
      fz = smooth(0, 1, z - iz);
    let result = 0;
    for (let k = 0; k < 2; k++)
      for (let j = 0; j < 2; j++)
        for (let i = 0; i < 2; i++) {
          result +=
            hash(
              wrap(ix + i, period),
              wrap(iy + j, period),
              wrap(iz + k, period),
            ) *
            (i ? fx : 1 - fx) *
            (j ? fy : 1 - fy) *
            (k ? fz : 1 - fz);
        }
    return result;
  }
  function lobes(period) {
    const span = period + 2,
      sites = new Float32Array(span ** 3 * 4);
    for (let z = -1; z <= period; z++)
      for (let y = -1; y <= period; y++)
        for (let x = -1; x <= period; x++) {
          const at = 4 * (x + 1 + span * (y + 1 + span * (z + 1)));
          const wx = wrap(x, period),
            wy = wrap(y, period),
            wz = wrap(z, period);
          sites[at] = x + 0.15 + hash(wx + 31, wy, wz) * 0.7;
          sites[at + 1] = y + 0.15 + hash(wx, wy + 47, wz) * 0.7;
          sites[at + 2] = z + 0.15 + hash(wx, wy, wz + 73) * 0.7;
          sites[at + 3] = 1 / (0.74 + hash(wx + 103, wy + 79, wz) * 0.3) ** 2;
        }
    return (x, y, z) => {
      const ix = Math.floor(x),
        iy = Math.floor(y),
        iz = Math.floor(z);
      let total = 0;
      for (let k = -1; k <= 1; k++)
        for (let j = -1; j <= 1; j++)
          for (let i = -1; i <= 1; i++) {
            const at =
              4 * (ix + i + 1 + span * (iy + j + 1 + span * (iz + k + 1)));
            const dx = x - sites[at],
              dy = y - sites[at + 1],
              dz = z - sites[at + 2];
            const kernel = Math.max(
              0,
              1 - (dx * dx + dy * dy + dz * dz) * sites[at + 3],
            );
            // Overlapping compact C2 kernels blend with continuous slopes. A hard
            // nearest-site winner made crease lines between adjoining cloud lobes.
            total += kernel * kernel * kernel;
          }
      return 1 - Math.exp(-total * 3.6);
    };
  }
  return { noise, lobes };
}

function volumeTexture(data, size, name, type) {
  const texture = new T.Data3DTexture(data, size, size, size);
  texture.name = name;
  texture.format = T.RGBAFormat;
  texture.type = type;
  texture.minFilter = T.LinearMipmapLinearFilter;
  texture.magFilter = T.LinearFilter;
  texture.wrapS = texture.wrapT = texture.wrapR = T.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

export function createWorldspireCloudNoise(size = 48, seed = 7139) {
  const { noise } = cloudField(seed),
    data = new Uint8Array(size ** 3 * 4);
  for (let z = 0; z < size; z++)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const at = 4 * (x + size * (y + size * z));
        const n = (p) =>
          noise((x / size) * p, (y / size) * p, (z / size) * p, p);
        data[at] = Math.round(255 * n(2));
        data[at + 1] = Math.round(255 * n(4));
        data[at + 2] = Math.round(255 * n(2));
        data[at + 3] = Math.round(255 * n(3));
      }
  return volumeTexture(
    data,
    size,
    'Worldspire / smooth cloud weather controls',
    T.UnsignedByteType,
  );
}

export function createWorldspireCloudBody(size = 48, seed = 7139) {
  const { noise, lobes } = cloudField(seed),
    large = lobes(3),
    small = lobes(6);
  const density = new Float32Array(size ** 3);
  for (let z = 0; z < size; z++)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const nx = x / size,
          ny = y / size,
          nz = z / size;
        const core = noise(nx * 2, ny * 2, nz * 2, 2);
        const body =
          large(nx * 3, ny * 3, nz * 3) * 0.85 +
          small(nx * 6, ny * 6, nz * 6) * 0.15;
        density[x + size * (y + size * z)] =
          body * body * smooth(0.18, 0.55, core);
      }
  return createWorldspireCloudGradientVolume(
    density,
    size,
    'Worldspire / billow density and gradient',
  );
}

export function createWorldspireCloudRootBody(size = 48, seed = 7139) {
  const { noise, lobes } = cloudField(seed),
    large = lobes(3),
    middle = lobes(4);
  const density = new Float32Array(size ** 3);
  for (let z = 0; z < size; z++)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const nx = x / size,
          ny = y / size,
          nz = z / size;
        const core = noise(nx * 2, ny * 2, nz * 2, 2);
        // These two overlapping body scales remain resolved at Low's footprint.
        // Tiny six-cell detail averaged away before contributing visible relief.
        const body =
          large(nx * 3, ny * 3, nz * 3) * 0.58 +
          middle(nx * 4, ny * 4, nz * 4) * 0.42;
        const raw = body * body * smooth(0.18, 0.55, core);
        // Filter actual extinction, not raw noise followed by a threshold. This
        // preserves the optical mass of smaller lobes in coarse mip footprints.
        density[x + size * (y + size * z)] = Math.max(
          0,
          (raw - ROOT_BODY_THRESHOLD) / (1 - ROOT_BODY_THRESHOLD),
        );
      }
  return createWorldspireCloudGradientVolume(
    density,
    size,
    'Worldspire / root optical density and gradient',
  );
}

export function createWorldspireCloudGradientVolume(
  density,
  size,
  name = 'Worldspire / density and gradient',
) {
  const data = new Uint16Array(size ** 3 * 4);
  const at = (x, y, z) =>
    ((x + size) % size) +
    size * (((y + size) % size) + size * ((z + size) % size));
  for (let z = 0; z < size; z++)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const index = at(x, y, z) * 4;
        data[index] = T.DataUtils.toHalfFloat(density[at(x, y, z)]);
        data[index + 1] = T.DataUtils.toHalfFloat(
          (density[at(x + 1, y, z)] - density[at(x - 1, y, z)]) * size * 0.5,
        );
        data[index + 2] = T.DataUtils.toHalfFloat(
          (density[at(x, y + 1, z)] - density[at(x, y - 1, z)]) * size * 0.5,
        );
        data[index + 3] = T.DataUtils.toHalfFloat(
          (density[at(x, y, z + 1)] - density[at(x, y, z - 1)]) * size * 0.5,
        );
      }
  // Signed, unnormalized gradients average with density in every mip. They
  // replace the old bulk fetch; no per-sample finite differences are needed.
  return volumeTexture(data, size, name, T.HalfFloatType);
}

// A conservative static exclusion volume protects the complete route and each
// jump's vertical flight window. It deliberately clears more than the hull:
// racers must see receivers across a gap, including slower/higher trajectories.
export function createWorldspireCloudClearance(track, size = 96) {
  const bounds = track.bounds.clone().expandByScalar(380);
  const extent = bounds.getSize(new T.Vector3());
  const cell = extent.clone().divideScalar(size - 1);
  const data = new Uint8Array(size ** 3).fill(255);
  const voxelPad = Math.max(cell.x, cell.y, cell.z) * 1.75;
  function stamp(p, radius, low = p.y - 110, high = p.y + 160) {
    const outer = radius + 100 + voxelPad;
    const lo = [p.x - outer, low - 100 - voxelPad, p.z - outer];
    const hi = [p.x + outer, high + 100 + voxelPad, p.z + outer];
    const mins = lo.map((v, i) =>
      Math.max(
        0,
        Math.floor((v - bounds.min.getComponent(i)) / cell.getComponent(i)),
      ),
    );
    const maxs = hi.map((v, i) =>
      Math.min(
        size - 1,
        Math.ceil((v - bounds.min.getComponent(i)) / cell.getComponent(i)),
      ),
    );
    for (let z = mins[2]; z <= maxs[2]; z++)
      for (let y = mins[1]; y <= maxs[1]; y++)
        for (let x = mins[0]; x <= maxs[0]; x++) {
          const wx = bounds.min.x + x * cell.x,
            wy = bounds.min.y + y * cell.y,
            wz = bounds.min.z + z * cell.z;
          const lateral = Math.hypot(wx - p.x, wz - p.z) - radius;
          const vertical = Math.max(low - wy, wy - high, 0);
          const clearance = smooth(
            voxelPad,
            voxelPad + 100,
            Math.max(lateral, vertical),
          );
          const at = x + size * (y + size * z);
          data[at] = Math.min(data[at], Math.round(clearance * 255));
        }
  }
  for (let s = 0; s <= track.length; s += 35)
    stamp(track.sample(s).position, track.width * 0.5 + 115);
  stamp(track.sample(track.length).position, track.width * 0.5 + 115);
  for (const jump of track.jumps ?? []) {
    const a = track.sample(jump.takeoff).position,
      b = track.sample(jump.landingEnd).position;
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 35);
    const low = Math.min(a.y, b.y) - 150,
      high = Math.max(a.y, b.y) + 180;
    for (let i = 0; i <= n; i++)
      stamp(a.clone().lerp(b, i / Math.max(1, n)), 180, low, high);
  }
  const texture = new T.Data3DTexture(data, size, size, size);
  texture.name = 'Worldspire / route and flight cloud exclusion';
  texture.format = T.RedFormat;
  texture.type = T.UnsignedByteType;
  texture.minFilter = texture.magFilter = T.LinearFilter;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  // Kept CPU-side for route regression checks; render samples the same data.
  function sample(point) {
    const p = point
      .clone()
      .sub(bounds.min)
      .divide(extent)
      .multiplyScalar(size - 1);
    if (
      p.x < 0 ||
      p.y < 0 ||
      p.z < 0 ||
      p.x > size - 1 ||
      p.y > size - 1 ||
      p.z > size - 1
    )
      return 1;
    const base = p.clone().floor(),
      f = p.clone().sub(base);
    let value = 0;
    for (let k = 0; k < 2; k++)
      for (let j = 0; j < 2; j++)
        for (let i = 0; i < 2; i++) {
          const x = Math.min(size - 1, base.x + i),
            y = Math.min(size - 1, base.y + j),
            z = Math.min(size - 1, base.z + k);
          value +=
            (data[x + size * (y + size * z)] / 255) *
            (i ? f.x : 1 - f.x) *
            (j ? f.y : 1 - f.y) *
            (k ? f.z : 1 - f.z);
        }
    return value;
  }
  return { texture, bounds, extent, sample };
}

const vertexShader = `precision highp float;
in vec3 position;in vec2 uv;out vec2 vUv;
void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const volumeShader = `precision highp float;precision highp sampler3D;
in vec2 vUv;layout(location=0)out vec4 outColor;layout(location=1)out vec4 outDepth;
uniform vec2 volumeTexel;uniform vec2 rootDeckBounds;uniform vec2 bankYBounds[6];
uniform vec4 lowerShoulder;uniform float lowerFade;
uniform sampler2D sceneDepth;uniform sampler3D weather;uniform sampler3D bodyField;uniform sampler3D rootBodyField;uniform sampler3D clearance;
uniform float weatherWarp;uniform float rootBodyScale;uniform float rootBodyThreshold;
uniform mat3 bodyFrame;
uniform mat4 inverseProjection;uniform mat4 cameraWorld;
uniform vec3 eye;uniform vec3 maskMin;uniform vec3 maskExtent;uniform vec3 sunDirection;
uniform vec4 bands[3];uniform vec3 cloudTint[3];uniform vec3 rootLightResponse;
uniform vec3 bankCenters[6];uniform vec3 bankRadii[6];uniform vec2 bankRotation[6];uniform vec2 bankShape[6];
uniform float time;uniform float spireHeight;uniform float cameraFar;uniform int steps;uniform bool depthReady;
float freeAir(vec3 p){
 vec3 uv=(p-maskMin)/maskExtent;
 if(any(lessThan(uv,vec3(0.)))||any(greaterThan(uv,vec3(1.))))return 1.;
 vec3 size=vec3(textureSize(clearance,0));return texture(clearance,(uv*(size-1.)+.5)/size).r;
}
vec3 bankLocal(vec3 p,int bank){
 vec2 rotation=bankRotation[bank];
 return vec3(p.x*rotation.x+p.z*rotation.y,p.y,-p.x*rotation.y+p.z*rotation.x);
}
float density(vec3 p,int band,float stride,bool protectRoute,out vec3 bodyGradient,out float shapeConfidence){
 bodyGradient=vec3(0.);shapeConfidence=0.;
 vec4 b=bands[band];float radius=length(p.xz);
 float inner=90.+1000.*pow(max(0.,1.-(p.y+300.)/(spireHeight+300.)),1.25)+55.;
 // The radial hole protects the visible race-height spire. Below the course,
 // solid rock already depth-occludes cloud; a hole there exposes its cut base.
 float skirt=mix(1.,smoothstep(inner,inner+200.,radius),smoothstep(-180.,100.,p.y));
 if(skirt<.001)return 0.;
 float nearest=10.;
 for(int i=0;i<2;i++){
  int bank=band*2+i;
  nearest=min(nearest,length(bankLocal(p-bankCenters[bank],bank)/bankRadii[bank]));
 }
 if(nearest>1.36)return 0.;
 vec3 q=p+vec3(time*2.6,0.,time*1.1);
 float angle=atan(p.z,p.x)+b.w;
 q.xz+=vec2(-p.z,p.x)/max(radius,1.)*sin(angle*2.+p.y*.0011)*90.;
 // A column-scale weather field controls unequal towers and bends the finer
 // 3D body. It does not move the bounds or the protected driving airspace.
 float weatherScale=mix(1.75,1.25,float(band)*.5);
 float coarseScale=3100.*weatherScale;
 // The sea contains several resolved billows through its depth, rather than
 // one kilometre-scale lobe stretched into a smooth continuous ribbon.
 float bodyScale=band==0?rootBodyScale:2050.*weatherScale;
 float coarseLod=clamp(log2(max(1.,stride*48./coarseScale)),0.,3.);
 vec4 coarse=textureLod(weather,vec3(q.x/coarseScale+b.w,b.w*.13,q.z/coarseScale),coarseLod);
 vec3 warp=vec3(coarse.b-.5,(coarse.g-.5)*.42,coarse.a-.5)*weatherWarp*weatherScale;
 float bulkLod=clamp(log2(max(1.,stride*48./bodyScale)),0.,3.);
 // A connected wind-aligned body has kilometre-scale shoulders and smaller
 // rising lobes. Isotropic noise made separate, similarly sized soft puffs.
 vec3 shaped=q+warp;
 vec3 bodyPoint=bodyFrame*shaped;
 vec3 bodyUv=bodyPoint/bodyScale+vec3(.17*b.w,.11*b.w,b.w);
 vec4 bulk;
 if(band==0)bulk=textureLod(rootBodyField,bodyUv,bulkLod);
 else bulk=textureLod(bodyField,bodyUv,bulkLod);
 float structure=bulk.r;
 if(protectRoute&&band>0){
  float detailScale=1500.*weatherScale;
  float detailLod=clamp(log2(max(1.,stride*48./detailScale)),0.,4.);
  float detail=textureLod(weather,(q+warp*.4)/detailScale+vec3(.19,b.w,.31),detailLod).g;
  // Erode only the exposed boundary. The core stays a connected mass;
  // separate high-frequency wisps would exceed the bounded ray budget.
  structure=bulk.r-(1.-detail)*.14*(1.-smoothstep(.46,.76,bulk.r));
 }
 float result=0.,shapeEnvelope=0.;
 for(int i=0;i<2;i++){
  int bank=band*2+i;
  vec3 local=bankLocal(p-bankCenters[bank],bank)/bankRadii[bank];
  float guard=1.-smoothstep(1.10,1.36,length(local));
  // Bend a bank toward the monolith and shear its upper body downstream.
  // The unwarped guard keeps these arcs inside the analytic ray bounds.
  local.z-=bankShape[bank].x*(local.x*local.x-.12);
  local.x-=local.y*bankShape[bank].y;
  // Ellipsoids are loose acceleration bounds only. The cloud has a broken,
  // comparatively flat base, variable towers, and voids through its interior.
  float base=-.57+(coarse.g-.5)*.14;
  float fade=.17;
  if(band>0){
   // A broad weather-shaped shoulder lets the 3D billows define the lower
   // silhouette. The former narrow, nearly level shelf sliced all lobes at
   // the same height and read as a solid block from the course and overview.
   base=lowerShoulder.x+(coarse.b-.5)*lowerShoulder.y
       +(coarse.a-.5)*lowerShoulder.z+clamp(local.x,-1.,1.)*lowerShoulder.w;
   fade=lowerFade;
  }
  float tower=(.16+1.02*smoothstep(.2,.8,coarse.r))*mix(1.,.52,smoothstep(.05,1.1,local.x));
  float bottom=smoothstep(base,base+fade,local.y);
  float top=1.-smoothstep(tower-.20,tower+.16,local.y);
  if(band==0){
   float deckTop=mix(-230.,110.,smoothstep(.28,.76,coarse.r));
   top*=1.-smoothstep(deckTop-130.,deckTop+60.,p.y);
  }
  float sides=1.-smoothstep(.50,1.17,length(local.xz));
  float envelope=bottom*top*sides*guard;
  float threshold=(band==0?.32:.37)+(1.-envelope)*.31;
  // Keep optical depth proportional to the root body's interior structure.
  // The former narrow smoothstep saturated most of this thick deck, leaving
  // only its broad envelope and a vertically extruded channel visible.
  // The root texture has already applied its body threshold before mip
  // filtering. Only the existing envelope shoulder remains to be applied.
  float rootEdge=(1.-envelope)*.31/(1.-rootBodyThreshold);
  float coverage=band==0?max(0.,(structure-rootEdge)/(1.-rootEdge))
                        :smoothstep(threshold,threshold+.16,structure);
  float body=coverage*envelope;
  if(body>result){result=body;shapeEnvelope=envelope;}
 }
 // Root openings now come from the three-dimensional body itself. No
 // height-invariant strip cuts a vertical wall through the cloud sea.
 float route=protectRoute?freeAir(p):1.;
 if(protectRoute){
  // Transpose of the wind-aligned body transform. Slow column warp has a
  // bounded Jacobian; omitting its small derivative avoids extra fetches.
  bodyGradient=transpose(bodyFrame)*bulk.gba;
  // Never shade a route-mask cut or acceleration-envelope boundary as a
  // solid surface. The cue belongs only to the resolved 3D body lobes.
  shapeConfidence=smoothstep(.35,2.,length(bodyGradient))
                 *smoothstep(.28,.78,shapeEnvelope)*smoothstep(.72,.98,skirt*route)
                 *(band==0?1.:1.-smoothstep(.75,.98,structure));
 }
 return result*skirt*route;
}
vec2 bankInterval(vec3 originWorld,vec3 ray,int bank,float limit){
 // The expanded ellipsoid encloses the entire zero-density guard. March
 // only occupied bank intervals, skipping the open space between the two.
 vec3 radius=bankRadii[bank]*1.4;
 vec3 origin=bankLocal(originWorld-bankCenters[bank],bank)/radius;
 vec3 direction=bankLocal(ray,bank)/radius;
 float a=dot(direction,direction),b=dot(origin,direction),c=dot(origin,origin)-1.;
 float discriminant=b*b-a*c;
 if(discriminant<0.)return vec2(limit,limit);
 float root=sqrt(discriminant);
 float start=max(0.,(-b-root)/a),end=min(limit,(-b+root)/a);
 // The cloud base and tallest tower are strictly bounded before any noise
 // threshold. Clip that provably empty part of the loose ellipsoid so the
 // bounded samples concentrate on actual weather rather than clear sky.
 // Bounds come from the same authored shoulder coefficients as density().
 vec2 verticalBounds=bankYBounds[bank];
 if(abs(ray.y)<.000001){
  if(originWorld.y<verticalBounds.x||originWorld.y>verticalBounds.y)return vec2(limit,limit);
 }else{
  vec2 vertical=(verticalBounds-vec2(originWorld.y))/ray.y;
  start=max(start,min(vertical.x,vertical.y));
  end=min(end,max(vertical.x,vertical.y));
 }
 return end>start?vec2(start,end):vec2(limit,limit);
}
void main(){
 if(!depthReady){outColor=vec4(0.);outDepth=vec4(cameraFar);return;}
 vec4 viewPoint=inverseProjection*vec4(vUv*2.-1.,1.,1.);
 vec3 ray=normalize((cameraWorld*vec4(viewPoint.xyz/viewPoint.w,0.)).xyz);
 float depth=texture(sceneDepth,vUv).r;
 // Conservative subpixel depth keeps opaque road/rail silhouettes clear when
 // the integrated volume is enlarged. This attachment is read only here.
 for(int y=0;y<2;y++)for(int x=0;x<2;x++)depth=min(depth,texture(sceneDepth,vUv+(vec2(float(x),float(y))-.5)*volumeTexel*.8).r);
 float limit=cameraFar;
 if(depth<.999999){vec4 v=inverseProjection*vec4(vUv*2.-1.,depth*2.-1.,1.);limit=min(limit,length(v.xyz/v.w));}
 outDepth=vec4(limit,0.,0.,1.);
 vec3 light=vec3(0.);float transmission=1.;
 for(int order=0;order<3;order++){
  int band=ray.y>=0.?order:2-order;
  vec2 first=bankInterval(eye,ray,band*2,limit),second=bankInterval(eye,ray,band*2+1,limit);
  if(first.x>second.x){vec2 swap=first;first=second;second=swap;}
  if(first.y>=second.x){first.y=max(first.y,second.y);second=vec2(limit,limit);}
  float firstLength=first.y-first.x,total=firstLength+second.y-second.x;
  if(total<=0.)continue;
  float stride=total/float(steps);
  for(int i=0;i<24;i++){
   if(i>=steps||transmission<.025)break;
   // With no temporal accumulation, screen-random phase remains visible as
   // opacity stipple. Midpoints give neighbouring rays coherent quadrature.
   float along=(float(i)+.5)*stride;
   float distance=along<firstLength?first.x+along:second.x+along-firstLength;
   vec3 p=eye+ray*distance,bodyGradient;float shapeConfidence;
   float d=density(p,band,stride,true,bodyGradient,shapeConfidence);
   if(d<.002)continue;
   // Resolve the visible billow before approximating the far light column.
   // Fractional taps across the entire loose envelope can jump over the lobe
   // in front of us and give a sunlit face and its recess the same radiance.
   float lightLength=0.;
   for(int bank=0;bank<2;bank++){
    vec2 segment=bankInterval(p,sunDirection,band*2+bank,6000.);
    if(segment.x<.01)lightLength=max(lightLength,segment.y);
   }
   float lobeScale=band==0?rootBodyScale:2050.*mix(1.75,1.25,float(band)*.5);
   float nearDistance=min(lightLength,lobeScale*.075);
   float farDistance=min(lightLength,nearDistance*3.2);
   vec3 unusedGradient;float unusedConfidence;
   float nearShade=density(p+sunDirection*nearDistance,band,stride,false,unusedGradient,unusedConfidence);
   float farShade=density(p+sunDirection*farDistance,band,stride,false,unusedGradient,unusedConfidence);
   float localColumn=(d+nearShade)*.5*nearDistance
                    +(nearShade+farShade)*.5*(farDistance-nearDistance);
   // Continue only the measured far density, at reduced weight for the open
   // pockets in the remaining envelope. No extra shadow samples are needed.
   float column=localColumn+farShade*max(0.,lightLength-farDistance)*.30;
   float optical=column*bands[band].z;
   float sun=exp(-optical*1.45);
   float rim=pow(max(0.,dot(ray,sunDirection)),8.);
   float height=clamp((p.y-bands[band].x)/bands[band].y*.5+.5,0.,1.);
   float skyVisibility=mix(.35,1.,exp(-localColumn*bands[band].z*.8));
   vec3 ambient=mix(vec3(.055,.10,.18),vec3(.19,.27,.37),height)*skyVisibility;
   // The broad low-energy term represents light scattered inside the bank;
   // direct warm light remains concentrated on the exposed tops and rims.
   float scatter=exp(-optical*.28)*.15;
   // A soft light-facing cue resolves overlapping lobes that the two optical
   // probes cannot distinguish. Root lobes also use their orientation for
   // diffuse sky fill; measured light-column shadow remains independent.
   vec3 outward=-bodyGradient/max(length(bodyGradient),.0001);
   float facing=smoothstep(-.65,.85,dot(outward,sunDirection));
   float bodyLight=mix(1.,mix(.30,1.35,facing),shapeConfidence);
   vec3 illumination=ambient+cloudTint[band]*(sun*(.86+rim*.24)*bodyLight+scatter);
   if(band==0){
    // Density increases inward, so the negative gradient faces out of each
    // billow. A narrow wrap preserves soft edges; the normalized gain keeps
    // mean directional energy while separating warm tops from cool valleys.
    float rootIncident=clamp((dot(outward,sunDirection)+rootLightResponse.x)/(1.+rootLightResponse.x),0.,1.);
    float rootLight=mix(1.,rootLightResponse.y+rootLightResponse.z*rootIncident,shapeConfidence);
    // Sky-hemisphere exposure varies with the outward lobe orientation.
    // Warm scattered fill follows local incidence as well as the sun column;
    // using the column alone washed shaded lobes back toward neutral white.
    float skyFacing=clamp(outward.y*.5+.5,0.,1.);
    vec3 rootAmbient=ambient*mix(1.,.55+.65*skyFacing,shapeConfidence);
    float warmFraction=sun*mix(1.,rootIncident,shapeConfidence);
    vec3 scattered=mix(vec3(.12,.20,.34),cloudTint[band],warmFraction)*scatter;
    illumination=rootAmbient+cloudTint[band]*sun*(.86+rim*.24)*rootLight+scattered;
   }
   // Only cloud radiance receives aerial perspective. Empty channels and
   // the road keep their scene contrast; distant banks join the sky palette.
   vec3 air=mix(vec3(.16,.27,.36),vec3(.58,.46,.34),smoothstep(-.45,.2,ray.y));
   illumination=mix(illumination,air,1.-exp(-distance*.000055));
   float alpha=1.-exp(-d*stride*bands[band].z);
   light+=transmission*alpha*illumination;transmission*=1.-alpha;
  }
 }
 outColor=vec4(light,1.-transmission);
}`;
const compositeShader = `precision highp float;
in vec2 vUv;out vec4 outColor;
uniform sampler2D sceneColor;uniform sampler2D volumeDepth;uniform sampler2D cloudColor;
uniform vec2 cloudTexel;
void main(){
 vec4 scene=texture(sceneColor,vUv);float center=texture(volumeDepth,vUv).r;
 vec2 pixel=vUv/cloudTexel-.5;
 vec2 base=floor(pixel+.5),fraction=pixel-base;
 vec4 cloud=vec4(0.);float total=0.;
 // Reconstruct only cloud radiance/opacity with a compact Gaussian. The
 // zero-weight support boundary makes its 3x3 window continuous as it moves.
 // Exact texel centres avoid hardware bilinear mixing across a road edge
 // before the depth weight can reject the far cloud sample.
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  vec2 offset=vec2(float(x),float(y));vec2 uv=(base+offset+.5)*cloudTexel;
  float neighbor=texture(volumeDepth,uv).r;
  vec2 delta=offset-fraction;
  vec2 gaussian=max(exp(-.5*delta*delta)-vec2(.324652467),vec2(0.));
  float weight=gaussian.x*gaussian.y;
  weight*=exp(-abs(center-neighbor)/max(1.,center*.012));
  cloud+=texture(cloudColor,uv)*weight;total+=weight;
 }
 cloud=total>.00001?cloud/total:vec4(0.);
 outColor=vec4(scene.rgb*(1.-cloud.a)+cloud.rgb,scene.a);
}`;

class WorldspireCloudPass extends Pass {
  constructor({ camera, settings, uniforms }) {
    super();
    this.needsSwap = true;
    this.camera = camera;
    this.settings = settings;
    this.uniforms = uniforms;
    this.width = this.height = 1;
    this.scale = settings?.quality === 'low' ? 0.35 : 0.5;
    this.target = new T.WebGLRenderTarget(1, 1, {
      count: 2,
      type: T.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: T.LinearFilter,
      magFilter: T.LinearFilter,
    });
    this.target.texture.name = 'Worldspire / integrated cloud radiance';
    this.target.textures[1].name = 'Worldspire / cloud depth guide';
    this.target.textures[1].format = T.RedFormat;
    this.target.textures[1].type = T.FloatType;
    this.target.textures[1].minFilter = this.target.textures[1].magFilter =
      T.NearestFilter;
    this.volume = new T.RawShaderMaterial({
      name: 'Worldspire / bounded cloud integration',
      glslVersion: T.GLSL3,
      vertexShader,
      fragmentShader: volumeShader,
      uniforms,
      depthTest: false,
      depthWrite: false,
    });
    this.composite = new T.RawShaderMaterial({
      name: 'Worldspire / depth aware cloud composite',
      glslVersion: T.GLSL3,
      vertexShader,
      fragmentShader: compositeShader,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        sceneColor: { value: null },
        volumeDepth: { value: this.target.textures[1] },
        cloudColor: { value: this.target.texture },
        cloudTexel: { value: new T.Vector2(1, 1) },
      },
    });
    this.quad = new FullScreenQuad(this.volume);
  }
  setSceneDepth(texture) {
    this.uniforms.sceneDepth.value = texture;
    this.uniforms.depthReady.value = Boolean(texture);
  }
  setSize(width, height) {
    this.width = width;
    this.height = height;
    const w = Math.max(1, Math.ceil(width * this.scale)),
      h = Math.max(1, Math.ceil(height * this.scale));
    this.target.setSize(w, h);
    this.composite.uniforms.cloudTexel.value.set(1 / w, 1 / h);
    this.uniforms.volumeTexel.value.set(1 / w, 1 / h);
  }
  prepareSceneDepth(renderer, texture) {
    this.setSceneDepth(texture);
    const camera = this.camera;
    if (camera) {
      camera.updateMatrixWorld();
      this.uniforms.inverseProjection.value.copy(
        camera.projectionMatrixInverse,
      );
      this.uniforms.cameraWorld.value.copy(camera.matrixWorld);
      this.uniforms.eye.value.setFromMatrixPosition(camera.matrixWorld);
      this.uniforms.cameraFar.value = camera.far;
    }
    // Consume beauty depth before other effects can overwrite it. This draw
    // already stores both integrated radiance and its depth guide in our target.
    this.quad.material = this.volume;
    renderer.setRenderTarget(this.target);
    this.quad.render(renderer);
  }
  render(renderer, writeBuffer, readBuffer) {
    // Later composition reads only owned cloud data and the current scene color.
    this.composite.uniforms.sceneColor.value = readBuffer.texture;
    this.quad.material = this.composite;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
  dispose() {
    this.target.dispose();
    this.volume.dispose();
    this.composite.dispose();
    this.quad.dispose();
  }
}

export function createWorldspireClouds({ track, camera, settings = {} }) {
  const group = new T.Group();
  group.name = 'Worldspire / broken cloud strata';
  const weather = createWorldspireCloudNoise();
  const body = createWorldspireCloudBody();
  const rootBody = createWorldspireCloudRootBody();
  const mask = createWorldspireCloudClearance(track);
  const height = track.spireHeight;
  // Each altitude has an outer weather front and a smaller displaced wake.
  // Tangential long axes, unequal headings, curved bodies and open quadrants
  // create a weather system around the spire rather than six nearby ornaments.
  // x/y/z, tangent/vertical/radial radii, heading, arc bend, vertical wind shear.
  const bankPlan = [
    [-1200, -670, 1450, 5500, 850, 3500, -2.45, 0.34, 0.24],
    [2400, -720, -1500, 4600, 800, 3000, 1.01, 0.4, 0.36],
    [-2600, height * 0.46 - 220, 1800, 3150, 650, 1350, -2.177, 0.76, 0.37],
    [-1900, height * 0.46 + 30, -900, 2450, 480, 1000, -1.3, 0.48, 0.58],
    [2400, height * 0.79 - 230, 1800, 3400, 560, 1250, 2.2, 0.7, 0.48],
    [600, height * 0.79 - 40, 3500, 2250, 450, 1050, 2.7, 0.45, 0.72],
  ];
  const rootDeckBounds = new T.Vector2(-1300, 170);
  // centre, two slow weather amplitudes, and the bounded wind-aligned slope.
  const lowerShoulder = new T.Vector4(-0.66, 0.56, 0.42, 0.22),
    lowerFade = 0.46;
  const lowerMinimum =
    lowerShoulder.x -
    (lowerShoulder.y + lowerShoulder.z) * 0.5 -
    lowerShoulder.w;
  const bankYBounds = bankPlan.map((p, i) => {
    const bounds = new T.Vector2(
      p[1] + p[4] * (i < 2 ? -0.64 : lowerMinimum),
      p[1] + p[4] * 1.34,
    );
    if (i < 2) {
      bounds.x = Math.max(bounds.x, rootDeckBounds.x);
      bounds.y = Math.min(bounds.y, rootDeckBounds.y);
    }
    return bounds;
  });
  const uniforms = {
    sceneDepth: { value: null },
    depthReady: { value: false },
    volumeTexel: { value: new T.Vector2(1, 1) },
    rootDeckBounds: { value: rootDeckBounds },
    bankYBounds: { value: bankYBounds },
    lowerShoulder: { value: lowerShoulder },
    lowerFade: { value: lowerFade },
    weather: { value: weather },
    bodyField: { value: body },
    rootBodyField: { value: rootBody },
    weatherWarp: { value: 320 },
    rootBodyScale: { value: 1600 },
    rootBodyThreshold: { value: ROOT_BODY_THRESHOLD },
    bodyFrame: {
      value: new T.Matrix3().set(
        0.62 * 0.835,
        0.23,
        -0.62 * 0.55,
        0,
        1,
        0,
        0.55,
        0,
        0.835,
      ),
    },
    clearance: { value: mask.texture },
    inverseProjection: { value: new T.Matrix4() },
    cameraWorld: { value: new T.Matrix4() },
    eye: { value: new T.Vector3() },
    maskMin: { value: mask.bounds.min.clone() },
    maskExtent: { value: mask.extent.clone() },
    sunDirection: { value: new T.Vector3(-0.65, 0.5, 0.6).normalize() },
    rootLightResponse: {
      value: new T.Vector3(ROOT_LIGHT_WRAP, ROOT_LIGHT_FLOOR, ROOT_LIGHT_GAIN),
    },
    spireHeight: { value: height },
    cameraFar: { value: camera?.far ?? 26000 },
    time: { value: 0 },
    bands: {
      value: [
        new T.Vector4(-650, 900, 0.0024, 0.6),
        new T.Vector4(height * 0.46 - 100, 900, 0.0028, 2.3),
        new T.Vector4(height * 0.79 - 100, 750, 0.0023, 4.1),
      ],
    },
    bankCenters: { value: bankPlan.map(([x, y, z]) => new T.Vector3(x, y, z)) },
    bankRadii: { value: bankPlan.map((p) => new T.Vector3(...p.slice(3, 6))) },
    bankRotation: {
      value: bankPlan.map((p) => new T.Vector2(Math.cos(p[6]), Math.sin(p[6]))),
    },
    bankShape: { value: bankPlan.map((p) => new T.Vector2(p[7], p[8])) },
    cloudTint: {
      value: [
        new T.Vector3(1.05, 0.79, 0.55),
        new T.Vector3(1.16, 0.84, 0.55),
        new T.Vector3(1.3, 0.94, 0.62),
      ],
    },
    steps: { value: settings.quality === 'low' ? 16 : 24 },
  };
  const pass = new WorldspireCloudPass({ camera, settings, uniforms });
  const clock = createNacreOceanClock();
  let disposed = false,
    lastClock = null,
    presentationTime = 0,
    previousWaiting = false;
  group.userData.cloudTime = 0;
  group.userData.cloudStepBudget = uniforms.steps.value * 3;
  group.userData.cloudBanks = bankPlan;
  return {
    group,
    pass,
    uniforms,
    update(frame = {}) {
      if (disposed) return;
      if (frame.camera) pass.camera = frame.camera;
      const quality = frame.settings?.quality ?? settings.quality;
      const scale = quality === 'low' ? 0.35 : 0.5;
      uniforms.steps.value = quality === 'low' ? 16 : 24;
      if (scale !== pass.scale) {
        pass.scale = scale;
        pass.setSize(pass.width, pass.height);
      }
      const value = clock(frame);
      const waiting = frame.mode === 'title' || frame.mode === 'countdown';
      // Starting the countdown rebuilds presentation, but the waiting sky must
      // retain its existing phase. Fresh sessions/scenario rewinds still reset.
      const reset =
        (frame.reset && !(waiting && previousWaiting)) ||
        (lastClock !== null && value < lastClock);
      if (reset) presentationTime = 0;
      else if (
        lastClock !== null &&
        !(frame.settings?.reducedMotion ?? settings.reducedMotion) &&
        !['paused', 'fly', 'inspection'].includes(frame.mode)
      )
        presentationTime += Math.max(0, value - lastClock);
      lastClock = value;
      previousWaiting = waiting;
      uniforms.time.value = presentationTime;
      group.userData.cloudTime = presentationTime;
      group.userData.cloudStepBudget = uniforms.steps.value * 3;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      pass.dispose();
      weather.dispose();
      body.dispose();
      rootBody.dispose();
      mask.texture.dispose();
      group.clear();
    },
  };
}
