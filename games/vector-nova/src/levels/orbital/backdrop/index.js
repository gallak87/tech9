import { assetURL } from '../../../assets/url.js';
import * as T from 'three';
import { createOrbitalSky } from './sky.js';

const PLANET_RADIUS = 12000;
const PLANET_CENTER = new T.Vector3(0, -13500, 100);
const SUN_DIRECTION = new T.Vector3(-0.62, 0.36, 0.69).normalize();
const vertexShader = `
  varying vec2 vUv;
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec3 vTangent;
  void main() {
    vUv=uv;
    vec4 world=modelMatrix*vec4(position,1.);
    vPosition=world.xyz;
    vNormal=normalize(mat3(modelMatrix)*normal);
    vTangent=normalize(mat3(modelMatrix)*vec3(position.z,0.,-position.x));
    gl_Position=projectionMatrix*viewMatrix*world;
  }
`;

// Global maps carry the full sphere. A regional material map adds native
// metre-scale texels below the circuit through precisely the same spherical UVs.
const detailBounds = new T.Vector4(0.265, 0.495, 0.11, 0.105);
const regionSampling = `
  uniform vec4 detailBounds;
  float weatherCover(vec3 point, vec3 normal) {
    // Two synoptic systems flank a clear coastal corridor below the circuit.
    // Fine convection remains subordinate to kilometre-scale weather masses.
    vec2 northwest=(point.xz-vec2(-2200.,1700.))/vec2(2300.,1150.);
    vec2 southeast=(point.xz-vec2(1900.,-1700.))/vec2(1800.,2300.);
    float systems=exp(-dot(northwest,northwest))+exp(-dot(southeast,southeast));
    float localWeather=smoothstep(.18,.72,systems);
    return mix(1.,localWeather,smoothstep(.78,.94,normal.y));
  }
  vec2 regionUv(vec2 uv) { return (uv-detailBounds.xy)/detailBounds.zw; }
  float regionWeight(vec2 uv) {
    vec2 region=regionUv(uv);
    float boundary=min(min(region.x,region.y),min(1.-region.x,1.-region.y));
    return smoothstep(0.,.08,boundary);
  }
  float surroundWeight(vec2 uv) {
    // The surrounding artwork covers the entire cap visible from this orbit.
    // Only the distant, unobserved hemisphere returns to the global atlas.
    vec2 cap=(uv-vec2(.307,.535))/vec2(.115,.225);
    return 1.-smoothstep(.87,1.,length(cap));
  }
  vec2 terrainSurroundUv(vec2 uv) {
    vec2 regional=regionUv(uv);
    // Smoothly compress peripheral coordinates into the extended portrait
    // atlas. Central coast/ridge landmarks remain aligned; terrain frequency
    // decreases continuously into the foreshortened distance, without tiling.
    float east=1./(1.+exp(-4.*(regional.x-.5)));
    float north=.078+.92/(1.+exp(-1.92*(regional.y-.5)));
    return vec2(east,north);
  }
  vec4 regionSample(sampler2D globalMap, sampler2D regionalMap, vec2 uv) {
    vec4 surrounding=mix(texture2D(globalMap,uv),texture2D(surfaceSurroundMap,terrainSurroundUv(uv)),surroundWeight(uv));
    return mix(surrounding,texture2D(regionalMap,clamp(regionUv(uv),0.,1.)),regionWeight(uv));
  }

`;

const cloudSampling = `
  vec3 sampleCloud(vec2 uv) {
    vec3 globalCloud=texture2D(cloudMap,uv).rgb;
    vec2 surroundingUv=(regionUv(uv)+vec2(1.03,1.22))/vec2(3.2,3.5);
    float surroundingDensity=texture2D(cloudSurroundMap,clamp(surroundingUv,0.,1.)).r;
    vec3 surrounding=vec3(surroundingDensity,pow(surroundingDensity,.65)*.035,surroundingDensity);
    globalCloud=mix(globalCloud,surrounding,surroundWeight(uv));
    vec2 cloudUv=regionUv(uv)+vec2(.20,.18);
    float edge=min(min(cloudUv.x,cloudUv.y),min(1.-cloudUv.x,1.-cloudUv.y));
    float density=texture2D(cloudDetailMap,clamp(cloudUv,0.,1.)).r*smoothstep(0.,.035,edge);
    vec3 authoredCloud=vec3(density,pow(density,.65)*.035,density);
    return mix(globalCloud,authoredCloud,regionWeight(uv));
  }
`;

function material(name, uniforms, fragmentShader, options = {}) {
  return new T.ShaderMaterial({
    name,
    uniforms,
    vertexShader,
    fragmentShader: `
      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vTangent;
      uniform vec3 sunDirection;
      ${fragmentShader}
    `,
    ...options,
  });
}

/** Authored material maps on a real 24 km spherical world, with separately
 * shaded cloud deck and thin atmospheric limb. Coordinates are scene-fixed;
 * the star sphere alone follows the camera. Lighting metadata is shared with
 * the local shipyard renderer. No baked illumination or scenic screenshots. */
export async function createOrbitalBackdrop() {
  const loader = new T.TextureLoader();
  const [
    surface,
    clouds,
    surfaceDetail,
    cloudDetail,
    surfaceSurround,
    cloudSurround,
  ] = await Promise.all(
    [
      'asterion-surface.webp',
      'asterion-clouds.webp',
      'asterion-terrain-authored-v1.png',
      'asterion-weather-density-v1.png',
      'asterion-terrain-surround-v1.png',
      'asterion-weather-surround-v1.png',
    ].map((file) =>
      loader.loadAsync(assetURL(`assets/levels/orbital/${file}`)),
    ),
  );
  surface.colorSpace = T.SRGBColorSpace;
  surfaceDetail.colorSpace = T.SRGBColorSpace;
  surfaceSurround.colorSpace = T.SRGBColorSpace;
  const ownedTextures = [
    surface,
    clouds,
    surfaceDetail,
    cloudDetail,
    surfaceSurround,
    cloudSurround,
  ];
  for (const map of ownedTextures) {
    map.wrapS = T.RepeatWrapping;
    map.wrapT = T.ClampToEdgeWrapping;
    map.anisotropy = 4;
  }
  const group = new T.Group();
  group.name = 'Asterion / terrestrial world and orbital radiance';
  group.userData.spaceBackdrop = true;
  group.userData.aoExclude = true;
  const surfaceMaterial = material(
    'Asterion / live ocean, continent and terminator shading',
    {
      surfaceMap: { value: surface },
      surfaceDetailMap: { value: surfaceDetail },
      surfaceSurroundMap: { value: surfaceSurround },
      planetToLocal: { value: new T.Matrix3() },
      planetCenter: { value: PLANET_CENTER },
      cloudMap: { value: clouds },
      cloudDetailMap: { value: cloudDetail },
      cloudSurroundMap: { value: cloudSurround },
      detailBounds: { value: detailBounds },
      sunDirection: { value: SUN_DIRECTION },
    },
    `
      uniform sampler2D surfaceMap;
      uniform sampler2D surfaceDetailMap;
      uniform sampler2D surfaceSurroundMap;
      uniform mat3 planetToLocal;
      uniform vec3 planetCenter;
      uniform sampler2D cloudMap;
      uniform sampler2D cloudDetailMap;
      uniform sampler2D cloudSurroundMap;
      ${regionSampling}
      ${cloudSampling}
      void main() {
        vec3 n=normalize(vNormal);
        vec3 view=normalize(cameraPosition-vPosition);
        vec4 terrain=regionSample(surfaceMap,surfaceDetailMap,vUv);
        vec3 albedo=terrain.rgb;
        float globalLand=clamp((terrain.a-.251)/.749,0.,1.);
        // The original authored albedo stays untouched. Chromatic separation
        // supplies only its physically different water reflection response.
        float authoredOcean=smoothstep(.016,.085,terrain.b-terrain.r)*(1.-smoothstep(.04,.20,terrain.r));
        float land=mix(globalLand,1.-authoredOcean,surroundWeight(vUv));
        float sun=max(dot(n,sunDirection),0.);
        float day=smoothstep(-.12,.19,dot(n,sunDirection));
        float grazing=1.-max(dot(n,view),0.);
        // Clouds cast a small coherent, displaced soft shadow on the sphere.
        vec3 radial=vPosition-planetCenter;
        float alongSun=dot(radial,sunDirection);
        float shadowDistance=-alongSun+sqrt(max(0.,alongSun*alongSun+12035.*12035.-dot(radial,radial)));
        vec3 cloudPoint=vPosition+sunDirection*shadowDistance;
        vec3 cloudLocal=normalize(planetToLocal*(cloudPoint-planetCenter));
        vec2 shadowUv=vec2(fract(atan(cloudLocal.z,-cloudLocal.x)/6.28318530718),asin(cloudLocal.y)/3.14159265359+.5);
        float cloudShadow=sampleCloud(shadowUv).r*mix(weatherCover(cloudPoint,normalize(cloudPoint-planetCenter)),1.,surroundWeight(shadowUv));
        float irradiance=.055+sun*2.7*(1.-cloudShadow*.34);
        vec3 radiance=albedo*irradiance*day;
        float water=1.-land;
        float glint=pow(max(dot(reflect(-sunDirection,n),view),0.),105.);
        radiance+=vec3(1.,.91,.76)*glint*water*sun*.9;
        // Blue aerial perspective is a material-space optical approximation;
        // a separate physical sphere supplies the silhouetted atmospheric rim.
        radiance+=vec3(.018,.075,.14)*pow(grazing,3.8)*day;
        radiance+=vec3(.0005,.001,.0018);
        gl_FragColor=vec4(radiance,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  );
  const globe = new T.Mesh(
    new T.SphereGeometry(PLANET_RADIUS, 128, 80),
    surfaceMaterial,
  );
  globe.name = 'Asterion ocean and continental crust';
  globe.position.copy(PLANET_CENTER);
  // Place the broken-cloud equatorial archipelago beneath the circuit so
  // down-looking sections reveal shoreline and ocean instead of a polar cap.
  const coastNormal = new T.Vector3(0.342, 0.104, 0.934).normalize();
  globe.quaternion.setFromUnitVectors(coastNormal, new T.Vector3(0, 1, 0));
  surfaceMaterial.uniforms.planetToLocal.value
    .setFromMatrix4(
      new T.Matrix4().makeRotationFromQuaternion(globe.quaternion),
    )
    .transpose();
  globe.renderOrder = -950;
  group.add(globe);
  const cloudMaterial = material(
    'Asterion / sunlit high troposphere',
    {
      cloudMap: { value: clouds },
      cloudDetailMap: { value: cloudDetail },
      cloudSurroundMap: { value: cloudSurround },
      surfaceSurroundMap: { value: surfaceSurround },
      detailBounds: { value: detailBounds },
      sunDirection: { value: SUN_DIRECTION },
    },
    `
      uniform sampler2D cloudMap;
      uniform sampler2D cloudDetailMap;
      uniform sampler2D cloudSurroundMap;
      uniform sampler2D surfaceSurroundMap;
      ${regionSampling}
      ${cloudSampling}
      void main() {
        vec3 n=normalize(vNormal);
        vec3 view=normalize(cameraPosition-vPosition);
        vec3 cloud=sampleCloud(vUv);
        float coverage=clamp(pow(cloud.r,1.55)*.84+cloud.g*.45,0.,1.)*mix(weatherCover(vPosition,n),1.,surroundWeight(vUv));
        // Cloud top slopes respond to the same sun as the planet and dockyard;
        // this is resolved convective structure rather than unlit soft noise.
        float east=sampleCloud(vUv+vec2(.00005,0.)).b;
        float west=sampleCloud(vUv-vec2(.00005,0.)).b;
        float north=sampleCloud(vUv+vec2(0.,.00010)).b;
        float south=sampleCloud(vUv-vec2(0.,.00010)).b;
        vec3 tangent=normalize(vTangent);
        vec3 bitangent=normalize(cross(n,tangent));
        vec3 cloudNormal=normalize(n-tangent*(east-west)*1.2-bitangent*(north-south)*1.2);
        float cosine=dot(n,sunDirection);
        float day=smoothstep(-.09,.18,cosine);
        float sun=max(dot(cloudNormal,sunDirection),0.);
        float edge=1.-max(dot(n,view),0.);
        vec3 shade=mix(vec3(.59,.68,.75),vec3(1.,.985,.94),smoothstep(.12,.7,cloud.r))*(.72+cloud.b*.46);
        vec3 radiance=shade*(.10+sun*1.15)*day;
        radiance+=vec3(.09,.23,.43)*pow(edge,4.)*day;
        gl_FragColor=vec4(radiance,coverage*.93);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    { transparent: true, depthWrite: false },
  );
  const cloudDeck = new T.Mesh(
    new T.SphereGeometry(PLANET_RADIUS + 35, 128, 80),
    cloudMaterial,
  );
  cloudDeck.name = 'Asterion separated cyclonic cloud deck';
  cloudDeck.position.copy(PLANET_CENTER);
  cloudDeck.rotation.copy(globe.rotation);
  cloudDeck.renderOrder = -940;
  group.add(cloudDeck);
  const atmosphereMaterial = material(
    'Asterion / thin Rayleigh limb',
    {
      sunDirection: { value: SUN_DIRECTION },
      planetCenter: { value: PLANET_CENTER },
      planetRadius: { value: PLANET_RADIUS },
    },
    `
      uniform vec3 planetCenter;
      uniform float planetRadius;
      void main() {
        vec3 n=normalize(vNormal);
        vec3 view=normalize(cameraPosition-vPosition);
        float mu=max(dot(n,view),0.);
        float limb=pow(1.-mu,7.5);
        float daylight=smoothstep(-.18,.35,dot(n,sunDirection));
        float forward=pow(max(dot(view,-sunDirection),0.),8.);
        vec3 tint=mix(vec3(.025,.11,.36),vec3(.075,.32,.83),daylight);
        tint+=vec3(.2,.19,.14)*forward*daylight;
        float tangentAltitude=(length(cross(planetCenter-cameraPosition,view))-planetRadius)/48.;
        float exteriorFade=1.-smoothstep(0.,1.,tangentAltitude);
        float opacity=(limb*.63+pow(1.-mu,2.)*.025)*(.1+daylight*.9)*exteriorFade;
        gl_FragColor=vec4(tint,opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    { transparent: true, depthWrite: false },
  );
  const atmosphere = new T.Mesh(
    new T.SphereGeometry(PLANET_RADIUS + 48, 128, 80),
    atmosphereMaterial,
  );
  atmosphere.name = 'Asterion luminous atmospheric limb';
  atmosphere.position.copy(PLANET_CENTER);
  atmosphere.renderOrder = -930;
  group.add(atmosphere);
  const {
    stars,
    radiance,
    moon,
    ownedTextures: skyTextures,
  } = createOrbitalSky(SUN_DIRECTION);
  group.add(radiance, stars, moon);
  ownedTextures.push(...skyTextures);
  return {
    group,
    sunDirection: SUN_DIRECTION.clone(),
    sunColor: '#fff5e3',
    sunIntensity: 2.6,
    ambientSky: '#c3d8e5',
    ambientGround: '#8ab7ce',
    ambientIntensity: 1.65,
    fillColor: '#b6dbf5',
    fillIntensity: 0.65,
    environmentIntensity: 0.6,
    far: 42000,
    ownedTextures,
    planetRadius: PLANET_RADIUS,
    planetCenter: PLANET_CENTER.clone(),
    update(cameraPosition) {
      stars.position.copy(cameraPosition);
      radiance.position.copy(cameraPosition);
    },
    dispose() {
      for (const map of ownedTextures) map.dispose();
      group.traverse((object) => {
        object.geometry?.dispose();
        object.material?.dispose();
      });
      group.clear();
    },
  };
}
