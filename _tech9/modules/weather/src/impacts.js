import {
  InstancedMesh,
  PlaneGeometry,
  ShaderMaterial,
  Object3D,
  Vector3,
  Vector2,
  InstancedBufferAttribute,
  DoubleSide,
} from 'three';
import { surfaceHit } from './surfaces.js';
import { createPuddleMaterial } from './puddles.js';
const random = (n) => (((Math.sin(n * 78.233 + 4.1) * 43758.5453) % 1) + 1) % 1;

export function createImpacts(scene, camera, query) {
  const scratch = new Object3D();
  const normal = new Vector3();
  const localNormal = new Vector3(0, 0, 1);
  const effects = [];
  let centerX = Infinity,
    centerZ = Infinity;
  for (const kind of ['puddles', 'splashes']) {
    const capacity = kind === 'puddles' ? 52 : 100;
    const geometry = new PlaneGeometry(1, 1);
    const phases = new Float32Array(capacity);
    for (let i = 0; i < capacity; i++) phases[i] = random(i + 90);
    geometry.setAttribute('phase', new InstancedBufferAttribute(phases, 1));
    const uniforms = {
      time: { value: 0 },
      wet: { value: 0 },
      rain: { value: 0 },
      snow: { value: 0 },
      wind: { value: new Vector2() },
    };
    const material =
      kind === 'puddles'
        ? createPuddleMaterial(uniforms)
        : new ShaderMaterial({
            uniforms,
            transparent: true,
            depthWrite: false,
            side: DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2,
            vertexShader: `attribute float phase; varying vec2 vUv; varying float vPhase; varying vec3 vPosition; void main(){ vUv=uv;vPhase=phase;vec4 world=modelMatrix*instanceMatrix*vec4(position,1.0);vPosition=world.xyz;gl_Position=projectionMatrix*viewMatrix*world; }`,
            fragmentShader: `
        uniform float time;uniform float wet;uniform float rain;uniform float snow;uniform vec2 wind;
        varying vec2 vUv;varying float vPhase;varying vec3 vPosition;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        void main(){
          vec2 q=(vUv-0.5)*2.0;
          float edge=length(q)+sin(q.x*7.0+vPhase*9.0)*sin(q.y*9.0+vPhase*5.0)*0.16+sin(q.x*21.0+q.y*17.0)*0.035;
          float surfaceMask=1.0-smoothstep(0.5,0.98,edge);
          float cycle=fract(time*1.8+vPhase*13.0);
          float ripple=pow(max(0.0,1.0-abs(length(q)-cycle*0.92)*35.0),2.0)*(1.0-cycle);
          ${
            kind === 'puddles'
              ? `
            float fresnel=pow(1.0-abs(normalize(cameraPosition-vPosition).y),3.0);
            float shimmer=sin(q.x*28.0+time*wind.x)*sin(q.y*23.0+time*wind.y)*0.018;
            vec3 color=mix(vec3(0.08,0.105,0.11),vec3(0.27,0.34,0.37),fresnel*0.55+shimmer);
            color+=ripple*rain*0.07;
            gl_FragColor=vec4(color,surfaceMask*smoothstep(0.32,0.95,wet)*(1.0-smoothstep(0.08,0.5,snow))*0.46);
          `
              : `
            gl_FragColor=vec4(vec3(0.55,0.65,0.68),ripple*surfaceMask*rain*0.4*(1.0-snow));
          `
          }
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
          });
    const mesh = new InstancedMesh(geometry, material, capacity);
    mesh.name = `Weather ${kind}`;
    mesh.receiveShadow = kind === 'puddles';
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    scene.add(mesh);
    effects.push({ kind, capacity, geometry, material, mesh, uniforms });
  }
  function rebuild() {
    centerX = Math.round(camera.position.x / 6) * 6;
    centerZ = Math.round(camera.position.z / 6) * 6;
    for (const e of effects) {
      let count = 0;
      // World-anchored cells retain the same puddles when the viewer moves.
      const phases = e.geometry.getAttribute('phase');
      for (let i = 0; i < 121 && count < e.capacity; i++) {
        const gx = Math.floor(centerX / 3) + (i % 11) - 5;
        const gz = Math.floor(centerZ / 3) + Math.floor(i / 11) - 5;
        const seed = gx * 311 + gz * 919;
        const x = gx * 3 + (random(seed) - 0.5) * 2.1;
        const z = gz * 3 + (random(seed + 1) - 0.5) * 2.1;
        const hit = surfaceHit(query, x, z);
        if (
          !hit ||
          hit.exposure < 0.5 ||
          hit.normal[1] < 0.91 ||
          (e.kind === 'puddles' && hit.puddle < 0.45)
        )
          continue;
        scratch.position.fromArray(hit.position);
        normal.fromArray(hit.normal);
        scratch.position.addScaledVector(normal, 0.012);
        scratch.quaternion.setFromUnitVectors(localNormal, normal);
        const size =
          e.kind === 'puddles'
            ? 0.28 + Math.pow(random(seed + 8), 1.7) * 1.8
            : 0.09 + random(seed + 7) * 0.17;
        scratch.rotateZ(random(seed + 21) * Math.PI * 2);
        scratch.scale.set(
          size,
          size * (e.kind === 'puddles' ? 0.45 + random(seed + 13) * 0.6 : 1),
          1,
        );
        scratch.updateMatrix();
        phases.setX(count, random(seed + 90));
        e.mesh.setMatrixAt(count++, scratch.matrix);
      }
      phases.needsUpdate = true;
      e.mesh.count = count;
      e.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  return {
    update(state) {
      if (
        Math.abs(camera.position.x - centerX) > 7 ||
        Math.abs(camera.position.z - centerZ) > 7
      )
        rebuild();
      for (const e of effects) {
        e.uniforms.time.value = state.time;
        e.uniforms.wet.value = state.wetness;
        e.uniforms.rain.value = state.rain;
        e.uniforms.snow.value = state.snow;
        e.uniforms.wind.value.set(state.windX, state.windZ);
        e.mesh.visible =
          e.kind === 'puddles'
            ? state.wetness > 0.3 && state.snow < 0.5
            : state.rain > 0.01 && state.snow < 0.95;
      }
    },
    snapshot: () =>
      Object.fromEntries(
        effects.map((e) => [e.kind, e.mesh.visible ? e.mesh.count : 0]),
      ),
    dispose() {
      for (const e of effects) {
        e.mesh.removeFromParent();
        e.mesh.dispose();
        e.geometry.dispose();
        e.material.dispose();
      }
    },
  };
}
