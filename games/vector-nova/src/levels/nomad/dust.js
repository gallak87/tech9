import * as T from 'three';
import { sampleCarrierMotion } from './motion.js';
import { createNomadDustField, sampleNomadDustParticle } from './dust-field.js';

function noiseTexture() {
  const size = 128;
  const pixels = new Uint8Array(size * size * 4);
  const lattice = (x, y, period, salt) => {
    let n =
      Math.imul((x + period) % period, 374761393) ^
      Math.imul((y + period) % period, 668265263) ^
      salt;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const value = (u, v, period, salt) => {
    const x = u * period,
      y = v * period;
    const ix = Math.floor(x),
      iy = Math.floor(y);
    const fx = x - ix,
      fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx),
      sy = fy * fy * (3 - 2 * fy);
    return T.MathUtils.lerp(
      T.MathUtils.lerp(
        lattice(ix, iy, period, salt),
        lattice(ix + 1, iy, period, salt),
        sx,
      ),
      T.MathUtils.lerp(
        lattice(ix, iy + 1, period, salt),
        lattice(ix + 1, iy + 1, period, salt),
        sx,
      ),
      sy,
    );
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      pixels[offset] = value(x / size, y / size, 7, 149) * 255;
      pixels[offset + 1] = value(x / size, y / size, 17, 367) * 255;
      pixels[offset + 2] = value(x / size, y / size, 41, 853) * 255;
      pixels[offset + 3] = 255;
    }
  const texture = new T.DataTexture(pixels, size, size);
  texture.name = 'Nomad / owned tileable salt turbulence';
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.magFilter = T.LinearFilter;
  texture.minFilter = T.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function dustMaterial(track, texture) {
  const normal = new T.Vector3(0, 1, track.saltPlane.grade).normalize();
  const benches = track.saltBenches?.length
    ? track.saltBenches
    : [{ minX: -18000, maxX: 18000, heightOffset: 0 }];
  return new T.ShaderMaterial({
    name: 'Nomad / dense rolling salt and tire spray',
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: true,
    defines: { NOMAD_DUST_BENCH_COUNT: benches.length },
    uniforms: {
      ...T.UniformsUtils.clone(T.UniformsLib.fog),
      turbulence: { value: texture },
      dustBase: { value: new T.Color('#afa58f') },
      dustCrown: { value: new T.Color('#f1e9d4') },
      groundNormal: { value: normal },
      groundHeight: { value: track.saltPlane.height },
      groundGrade: { value: track.saltPlane.grade },
      saltBenches: {
        value: benches.map(
          (bench) => new T.Vector3(bench.minX, bench.maxX, bench.heightOffset),
        ),
      },
      dustOpacity: { value: 0.68 },
      sunDirection: { value: new T.Vector3(-0.62, 0.39, -0.67).normalize() },
    },
    vertexShader: `
      attribute vec4 dustState;
      varying vec2 dustUV;
      varying vec4 state;
      varying vec3 saltWorldPoint;
      varying float distanceFade;
      #include <fog_pars_vertex>
      void main(){
        dustUV=uv;state=dustState;
        vec3 centre=(modelMatrix*vec4(instanceMatrix[3].xyz,1.)).xyz;
        vec3 axis=normalize(mat3(modelMatrix)*instanceMatrix[1].xyz);
        vec3 side=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]);
        side-=axis*dot(side,axis);
        side=dot(side,side)>.00001?normalize(side):vec3(1.,0.,0.);
        float width=instanceMatrix[0][0];
        float halfLength=length(instanceMatrix[1].xyz);
        float taper=mix(1.,mix(.25,1.,smoothstep(0.,.8,uv.y)),state.y);
        vec3 point=centre+side*position.x*width*taper+axis*position.y*halfLength;
        saltWorldPoint=point;
        float distance=length(cameraPosition-centre);
        distanceFade=smoothstep(10.,30.,distance)*(1.-smoothstep(4300.,6500.,distance));
        vec4 mvPosition=viewMatrix*vec4(point,1.);
        gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform sampler2D turbulence;
      uniform vec3 dustBase,dustCrown,sunDirection,groundNormal;
      uniform vec3 saltBenches[NOMAD_DUST_BENCH_COUNT];
      uniform float dustOpacity,groundHeight,groundGrade;
      varying vec2 dustUV;
      varying vec4 state;
      varying vec3 saltWorldPoint;
      varying float distanceFade;
      #include <fog_pars_fragment>
      float benchHeight(float x){
        float offset=saltBenches[0].z;
        for(int i=1;i<NOMAD_DUST_BENCH_COUNT;i++){
          if(x<saltBenches[i].x){
            float blend=clamp((x-saltBenches[i-1].y)/
              (saltBenches[i].x-saltBenches[i-1].y),0.,1.);
            return mix(offset,saltBenches[i].z,blend);
          }
          offset=saltBenches[i].z;
        }
        return offset;
      }
      void main(){
        vec2 q=dustUV*2.-1.;
        float seed=state.x,spray=state.y,age=state.z;
        float flow=state.w*mix(.35,1.,spray);
        vec3 noise=texture2D(turbulence,q*.72+seed*19.+vec2(flow*.15,-flow*.28)).rgb;
        float grain=dot(noise,vec3(.62,.28,.10));
        float radius=length(q)+(.5-grain)*.36;
        float edge=(1.-smoothstep(.53,.98,radius))*
          (1.-smoothstep(.90,1.,max(abs(q.x),abs(q.y))));
        float stream=(1.-smoothstep(.65,1.,abs(q.x)))*
          smoothstep(-1.,-.82,q.y)*(1.-smoothstep(.60,1.,q.y));
        edge=mix(edge,stream,spray);
        float life=mix(smoothstep(0.,.045,age)*(1.-smoothstep(.70,1.,age)),1.,spray);
        float crown=smoothstep(-.65,.68,q.y+(grain-.5)*.55);
        float density=(.72+.50*grain)*mix(1.0,.56,crown);
        float aboveGround=(saltWorldPoint.y+groundGrade*saltWorldPoint.z-
          groundHeight-benchHeight(saltWorldPoint.x))*groundNormal.y;
        float alpha=dustOpacity*edge*life*density*distanceFade*
          smoothstep(.04,1.4,aboveGround)*mix(1.,1.13,spray);
        if(alpha<.004)discard;
        vec3 normal=normalize(vec3(q*vec2(.60,.75),sqrt(max(.04,1.-dot(q,q)*.65))));
        vec3 light=normalize(mat3(viewMatrix)*sunDirection);
        float shade=.82+.24*max(0.,dot(normal,light))+(grain-.5)*.14;
        gl_FragColor=vec4(mix(dustBase,dustCrown,crown)*shade,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

/** Short contact spray feeds overlapping, ground-advected side wakes. Each
 * carrier owns one bounded draw; no simulation buffer or secondary render pass.
 */
export function createNomadDust({ track, settings = {} }) {
  const group = new T.Group();
  group.name = 'Nomad / rolling ground salt';
  group.userData.aoExclude = true;
  group.userData.reflectionExclude = true;
  const texture = noiseTexture();
  const material = dustMaterial(track, texture);
  const records = track.carriers.map((carrier) => {
    const field = createNomadDustField(track, carrier);
    const geometry = new T.PlaneGeometry(2, 2);
    const data = new T.InstancedBufferAttribute(
      new Float32Array(field.particles.length * 4),
      4,
    ).setUsage(T.DynamicDrawUsage);
    geometry.setAttribute('dustState', data);
    const mesh = new T.InstancedMesh(
      geometry,
      material,
      field.particles.length,
    );
    mesh.name = `${carrier.id} / wheel spray and rolling salt wake`;
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    mesh.castShadow = mesh.receiveShadow = false;
    mesh.userData.aoExclude = true;
    mesh.userData.reflectionExclude = true;
    mesh.userData.nomadDust = true;
    mesh.boundingBox = field.bounds;
    mesh.boundingSphere = field.bounds.getBoundingSphere(new T.Sphere());
    group.add(mesh);
    return { carrier, field, mesh, geometry, data, time: null, count: null };
  });
  let disposed = false;
  const matrix = new T.Matrix4(),
    sample = {};
  const cameraPosition = new T.Vector3(),
    worldBounds = new T.Box3();
  const sphere = new T.Sphere(),
    frustum = new T.Frustum();
  function update(frame = {}) {
    if (disposed) return;
    const current = { ...settings, ...frame.settings };
    const low = current.quality === 'low';
    const reduced = current.reducedMotion === true;
    const time = Number.isFinite(track.presentationTime)
      ? track.presentationTime
      : 0;
    const decorationTime = reduced ? 0 : time;
    const camera = frame.camera;
    if (camera) {
      group.updateWorldMatrix(true, false);
      cameraPosition.setFromMatrixPosition(camera.matrixWorld);
      matrix.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      );
      frustum.setFromProjectionMatrix(matrix);
    }
    material.uniforms.dustOpacity.value = low ? 0.64 : 0.68;
    for (const record of records) {
      const { carrier, field, mesh, geometry, data } = record;
      mesh.position
        .copy(carrier.origin)
        .add(sampleCarrierMotion(carrier, time).translation);
      mesh.updateWorldMatrix(true, false);
      let distance = 0;
      if (camera) {
        worldBounds.copy(mesh.boundingBox).applyMatrix4(mesh.matrixWorld);
        distance = worldBounds.distanceToPoint(cameraPosition) / camera.zoom;
        sphere.copy(mesh.boundingSphere).applyMatrix4(mesh.matrixWorld);
        mesh.visible = distance < 6500 && frustum.intersectsSphere(sphere);
      } else mesh.visible = true;
      if (!mesh.visible) continue;
      mesh.count = distance > 2500 ? 18 : low || distance > 1400 ? 36 : 54;
      if (
        record.time === decorationTime &&
        record.reduced === reduced &&
        record.count === mesh.count
      )
        continue;
      record.time = decorationTime;
      record.reduced = reduced;
      record.count = mesh.count;
      for (let index = 0; index < mesh.count; index++) {
        const particle = field.particles[index];
        sampleNomadDustParticle(
          track,
          carrier,
          particle,
          time,
          reduced,
          sample,
        );
        matrix.makeScale(sample.width, 1, 1).setPosition(sample.position);
        matrix.elements[4] = sample.axis.x * sample.height;
        matrix.elements[5] = sample.axis.y * sample.height;
        matrix.elements[6] = sample.axis.z * sample.height;
        mesh.setMatrixAt(index, matrix);
        data.setXYZW(
          index,
          particle.seed,
          particle.kind === 'spray' ? 1 : 0,
          sample.fraction,
          decorationTime,
        );
      }
      mesh.instanceMatrix.needsUpdate = true;
      geometry.attributes.dustState.needsUpdate = true;
    }
  }
  update();
  return {
    group,
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      for (const { mesh, geometry } of records) {
        mesh.dispose();
        geometry.dispose();
      }
      material.dispose();
      texture.dispose();
    },
  };
}
