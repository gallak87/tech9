import * as T from 'three';

// CPU density derived from the retained Blender plume pockets. A single
// bounded volume per event replaces translucent surface skins; thin authored
// cores remain actual geometry. Emitted radiance is integrated before tone
// mapping and added once, preserving direct-render and HDR-pipeline luminosity. No fluid simulation or external texture.
export function createPlasmaVolume(pockets) {
  const bounds = new T.Box3();
  for (const pocket of pockets) {
    const p = new T.Vector3().fromArray(pocket.p);
    const extent = new T.Vector3().setScalar(pocket.r * 2.3);
    bounds.expandByPoint(p.clone().sub(extent));
    bounds.expandByPoint(p.clone().add(extent));
  }
  const size = bounds.getSize(new T.Vector3());
  const width = 64,
    height = 48,
    depth = 32;
  const data = new Uint8Array(width * height * depth);
  for (let z = 0; z < depth; z++)
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const px = bounds.min.x + ((x + 0.5) / width) * size.x;
        const py = bounds.min.y + ((y + 0.5) / height) * size.y;
        const pz = bounds.min.z + ((z + 0.5) / depth) * size.z;
        let density = 0;
        for (const pocket of pockets) {
          const dx = px - pocket.p[0],
            dy = py - pocket.p[1],
            dz = pz - pocket.p[2];
          const along = dx * pocket.d[0] + dy * pocket.d[1] + dz * pocket.d[2];
          const radial = Math.max(
            0,
            dx * dx + dy * dy + dz * dz - along * along,
          );
          const field =
            radial / (pocket.r * pocket.r) +
            (along * along) / (pocket.r * pocket.r * 3.5);
          if (field < 5) density = Math.max(density, Math.exp(-field * 1.8));
        }
        data[x + width * (y + height * z)] = Math.round(density * 255);
      }
  const texture = new T.Data3DTexture(data, width, height, depth);
  texture.name = 'Helion / source-derived plasma density';
  texture.format = T.RedFormat;
  texture.type = T.UnsignedByteType;
  texture.minFilter = texture.magFilter = T.LinearFilter;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  const geometry = new T.BoxGeometry(size.x, size.y, size.z);
  geometry.translate(...bounds.getCenter(new T.Vector3()).toArray());
  const material = new T.ShaderMaterial({
    name: 'Helion / integrated turbulent plasma volume',
    side: T.BackSide,
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    uniforms: {
      density: { value: texture },
      cameraLocal: { value: new T.Vector3() },
      minimum: { value: bounds.min },
      maximum: { value: bounds.max },
      time: { value: 0 },
      strength: { value: 0.6 },
      steps: { value: 24 },
    },
    vertexShader: `varying vec3 volumePosition;
    void main(){volumePosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `precision highp sampler3D;
    varying vec3 volumePosition;uniform sampler3D density;uniform vec3 cameraLocal,minimum,maximum;uniform float time,strength;uniform int steps;
    float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
    float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
    void main(){vec3 ray=normalize(volumePosition-cameraLocal);vec3 inverseRay=1./(ray+vec3(.000001));
      vec3 a=(minimum-cameraLocal)*inverseRay,b=(maximum-cameraLocal)*inverseRay;
      vec3 near=min(a,b),far=max(a,b);float enter=max(max(near.x,near.y),near.z),leave=min(min(far.x,far.y),far.z);
      if(leave<=max(0.,enter))discard;float travel=max(0.,enter),stepSize=(leave-travel)/float(steps);vec3 sum=vec3(0.);float opacity=0.;
      for(int i=0;i<32;i++){if(i>=steps)break;vec3 p=cameraLocal+ray*(travel+(float(i)+.5)*stepSize);
        vec3 flow=p*.045+vec3(0.,-time*.035,time*.018);float coarse=noise(flow*.47),fine=noise(flow*2.3+coarse*4.);
        vec3 coord=(p-minimum)/(maximum-minimum)+vec3(sin(flow.y+coarse*5.),sin(flow.z*1.7+coarse*4.),cos(flow.x+coarse*4.))*.014;
        float field=texture(density,coord).r;float d=max(0.,field-.14)*smoothstep(.2,.68,coarse*.58+fine*.42);
        float alpha=1.-exp(-d*d*stepSize*.028*(.45+strength*.55));
        vec3 radiance=mix(vec3(.38,.003,.001),vec3(3.2,.35,.012),pow(clamp(field*fine*1.4,0.,1.),2.));radiance*=.5+strength*.85;
        sum+=(1.-opacity)*alpha*radiance;opacity+=(1.-opacity)*alpha;
      }
      if(opacity<.018)discard;gl_FragColor=vec4(sum,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  const mesh = new T.Mesh(geometry, material);
  mesh.name = 'Helion / bounded source-derived prominence volume';
  mesh.userData.aoExclude = true;
  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    camera.getWorldPosition(material.uniforms.cameraLocal.value);
    mesh.worldToLocal(material.uniforms.cameraLocal.value);
  };
  let disposed = false;
  return {
    mesh,
    update(strength, time, settings) {
      material.uniforms.strength.value = strength;
      material.uniforms.time.value = settings.reducedMotion ? 0 : time;
      material.uniforms.steps.value = settings.quality === 'low' ? 16 : 24;
      mesh.scale.y = 0.14 + 0.86 * strength;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      texture.dispose();
    },
  };
}
