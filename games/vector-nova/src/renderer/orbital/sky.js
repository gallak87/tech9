import * as T from 'three';

const GALACTIC_NORMAL = new T.Vector3(0.42, 0.88, -0.2).normalize();

function randomGenerator(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function createStars() {
  const fieldCount = 5000;
  const count = fieldCount + 12500;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const random = randomGenerator(41917);
  const along = new T.Vector3()
    .crossVectors(GALACTIC_NORMAL, new T.Vector3(0, 1, 0))
    .normalize();
  const across = new T.Vector3().crossVectors(GALACTIC_NORMAL, along);
  const direction = new T.Vector3();
  for (let i = 0; i < count; i++) {
    const longitude = random() * Math.PI * 2;
    if (i < fieldCount) {
      const y = random() * 2 - 1;
      const radius = Math.sqrt(1 - y * y);
      direction.set(
        Math.cos(longitude) * radius,
        y,
        Math.sin(longitude) * radius,
      );
    } else {
      const latitude =
        Math.sqrt(-2 * Math.log(Math.max(0.00001, random()))) *
        Math.cos(random() * Math.PI * 2) *
        0.055;
      direction
        .copy(along)
        .multiplyScalar(Math.cos(longitude) * Math.cos(latitude))
        .addScaledVector(across, Math.sin(longitude) * Math.cos(latitude))
        .addScaledVector(GALACTIC_NORMAL, Math.sin(latitude));
    }
    positions.set(direction.multiplyScalar(35000).toArray(), i * 3);
    const brightness = (i < fieldCount ? 0.55 : 0.34) + random() ** 7 * 2.5;
    const warmth = random();
    colors.set(
      [
        brightness * (0.78 + warmth * 0.22),
        brightness * 0.91,
        brightness * (1.07 - warmth * 0.23),
      ],
      i * 3,
    );
    sizes[i] = (i < fieldCount ? 1.15 : 0.85) + random() ** 9 * 1.35;
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
  geometry.setAttribute('starSize', new T.BufferAttribute(sizes, 1));
  const material = new T.ShaderMaterial({
    name: 'Asterion / resolved galactic and foreground stars',
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute float starSize;
      varying vec3 vColor;
      void main() {
        vColor=color;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
        gl_PointSize=starSize;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        float alpha=1.-smoothstep(.13,.5,length(gl_PointCoord-.5));
        gl_FragColor=vec4(vColor,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const stars = new T.Points(geometry, material);
  stars.name =
    '17500 resolved stars / galactic concentration and all-sky field';
  stars.frustumCulled = false;
  stars.renderOrder = -990;
  stars.userData.reflectionExclude = true;
  return stars;
}

function createMoonMap() {
  const width = 1024,
    height = 512;
  const data = new Uint8Array(width * height * 4);
  const random = randomGenerator(89347);
  const craters = Array.from({ length: 240 }, (_, i) => {
    const y = random() * 2 - 1;
    const angle = random() * Math.PI * 2;
    const r = Math.sqrt(1 - y * y);
    const radius =
      i < 12 ? 0.1 + random() * 0.13 : 0.018 + random() ** 2 * 0.075;
    return [Math.cos(angle) * r, y, Math.sin(angle) * r, 1 - Math.cos(radius)];
  });
  const hash = (x, y, z) => {
    let h =
      Math.imul(x, 374761393) ^
      Math.imul(y, 668265263) ^
      Math.imul(z, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const noise = (x, y, z) => {
    const ix = Math.floor(x),
      iy = Math.floor(y),
      iz = Math.floor(z);
    x -= ix;
    y -= iy;
    z -= iz;
    x *= x * (3 - 2 * x);
    y *= y * (3 - 2 * y);
    z *= z * (3 - 2 * z);
    const a = T.MathUtils.lerp(hash(ix, iy, iz), hash(ix + 1, iy, iz), x);
    const b = T.MathUtils.lerp(
      hash(ix, iy + 1, iz),
      hash(ix + 1, iy + 1, iz),
      x,
    );
    const c = T.MathUtils.lerp(
      hash(ix, iy, iz + 1),
      hash(ix + 1, iy, iz + 1),
      x,
    );
    const d = T.MathUtils.lerp(
      hash(ix, iy + 1, iz + 1),
      hash(ix + 1, iy + 1, iz + 1),
      x,
    );
    return T.MathUtils.lerp(
      T.MathUtils.lerp(a, b, y),
      T.MathUtils.lerp(c, d, y),
      z,
    );
  };
  for (let j = 0; j < height; j++) {
    const latitude = (j / (height - 1) - 0.5) * Math.PI;
    const ny = Math.sin(latitude),
      r = Math.cos(latitude);
    for (let i = 0; i < width; i++) {
      const longitude = (i / width) * Math.PI * 2;
      const nx = -Math.cos(longitude) * r,
        nz = Math.sin(longitude) * r;
      const broad = noise(nx * 3.8 + 2, ny * 3.8, nz * 3.8);
      const fine = noise(nx * 81, ny * 81, nz * 81);
      let relief = (noise(nx * 24, ny * 24, nz * 24) - 0.5) * 0.025;
      let rim = 0;
      for (const [cx, cy, cz, craterSize] of craters) {
        const q = (1 - nx * cx - ny * cy - nz * cz) / craterSize;
        if (q > 1.7) continue;
        const distance = Math.sqrt(Math.max(0, q));
        const raised = Math.exp(-(((distance - 1) / 0.14) ** 2));
        const bowl = Math.max(0, 1 - distance * distance);
        relief += raised * 0.11 - bowl * 0.07;
        rim += raised * 0.1 + Math.exp(-((distance / 0.16) ** 2)) * 0.04;
      }
      const maria = T.MathUtils.smoothstep(broad, 0.38, 0.62);
      const albedo = 0.35 + maria * 0.31 + rim + (fine - 0.5) * 0.075;
      const pixel = (j * width + i) * 4;
      data[pixel] = T.MathUtils.clamp(albedo * 255, 0, 255);
      data[pixel + 1] = T.MathUtils.clamp((0.5 + relief * 2.3) * 255, 0, 255);
      data[pixel + 2] = maria * 255;
      data[pixel + 3] = 255;
    }
  }
  const map = new T.DataTexture(data, width, height);
  map.name = 'Original deterministic lunar albedo and crater height';
  map.wrapS = T.RepeatWrapping;
  map.wrapT = T.ClampToEdgeWrapping;
  map.minFilter = T.LinearMipmapLinearFilter;
  map.magFilter = T.LinearFilter;
  map.generateMipmaps = true;
  map.needsUpdate = true;
  return map;
}

function createMoon(sunDirection) {
  const map = createMoonMap();
  const material = new T.ShaderMaterial({
    name: 'Asterion / sunlit cratered satellite',
    uniforms: {
      moonMap: { value: map },
      sunDirection: { value: sunDirection },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vTangent;
      void main() {
        vUv=uv;
        vNormal=normalize(mat3(modelMatrix)*normal);
        vTangent=normalize(mat3(modelMatrix)*vec3(position.z,0.,-position.x));
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vTangent;
      uniform sampler2D moonMap;
      uniform vec3 sunDirection;
      void main() {
        vec3 n=normalize(vNormal);
        vec3 t=normalize(vTangent), b=normalize(cross(n,t));
        vec4 surface=texture2D(moonMap,vUv);
        float east=texture2D(moonMap,vUv+vec2(1./1024.,0.)).g;
        float west=texture2D(moonMap,vUv-vec2(1./1024.,0.)).g;
        float north=texture2D(moonMap,vUv+vec2(0.,1./512.)).g;
        float south=texture2D(moonMap,vUv-vec2(0.,1./512.)).g;
        vec3 relief=normalize(n-t*(east-west)*3.8-b*(north-south)*3.8);
        float sun=max(dot(relief,sunDirection),0.);
        float day=smoothstep(-.035,.055,dot(n,sunDirection));
        vec3 rock=mix(vec3(.37,.39,.42),vec3(.64,.60,.53),surface.b)*surface.r;
        vec3 radiance=rock*(.018+sun*3.0*day);
        gl_FragColor=vec4(radiance,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const moon = new T.Mesh(new T.SphereGeometry(2100, 96, 64), material);
  moon.name = 'Selene / 4.2 km cratered natural satellite';
  moon.position.copy(
    new T.Vector3(0.55, 0.28, 0.786).normalize().multiplyScalar(25000),
  );
  moon.renderOrder = -980;
  moon.userData.reflectionExclude = true;
  return { moon, map };
}

export function createOrbitalSky(sunDirection) {
  const stars = createStars();
  const { moon, map } = createMoon(sunDirection);
  const material = new T.ShaderMaterial({
    name: 'Asterion / stellar disc, dust lanes and distant sun',
    side: T.BackSide,
    depthWrite: false,
    uniforms: {
      sunDirection: { value: sunDirection },
      galacticNormal: { value: GALACTIC_NORMAL },
    },
    vertexShader: `
      varying vec3 rayDirection;
      void main() {
        rayDirection=position;
        vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);
        gl_Position=p.xyww;
      }
    `,
    fragmentShader: `
      uniform vec3 sunDirection;
      uniform vec3 galacticNormal;
      varying vec3 rayDirection;
      float hash(vec3 p) { return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
      float noise(vec3 p) {
        vec3 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
      void main() {
        vec3 ray=normalize(rayDirection);
        float latitude=dot(ray,galacticNormal);
        float warp=noise(ray*8.+13.2)-.5;
        float latitudeDust=latitude+warp*.045;
        float mantle=exp(-pow(latitude/.14,2.));
        float core=exp(-pow(latitude/.051,2.));
        float clouds=.42+noise(ray*29.)*.38+noise(ray*79.)*.20;
        float fissure=exp(-pow((latitudeDust+.006)/.018,2.));
        float extinction=1.-fissure*(.72+noise(ray*44.)*.2);
        vec3 galaxy=(vec3(.021,.026,.042)*mantle+vec3(.055,.051,.044)*core)*clouds*extinction;
        float alignment=dot(ray,sunDirection);
        float solarDisc=smoothstep(.999975,.999982,alignment);
        float corona=pow(max(alignment,0.),1800.)*.09;
        vec3 color=vec3(.0005,.0007,.0012)+galaxy+vec3(1.,.94,.84)*(solarDisc*14.+corona);
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const radiance = new T.Mesh(new T.SphereGeometry(37000, 32, 16), material);
  radiance.name = 'Broad galactic disc with structured interstellar dust';
  radiance.frustumCulled = false;
  radiance.renderOrder = -1000;
  return { radiance, stars, moon, ownedTextures: [map] };
}
