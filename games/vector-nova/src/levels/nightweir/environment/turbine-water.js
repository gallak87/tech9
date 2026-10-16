import * as T from 'three';

const noiseGLSL = `
float hydroHash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float hydroNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hydroHash(i),hydroHash(i+vec2(1,0)),f.x),mix(hydroHash(i+vec2(0,1)),hydroHash(i+vec2(1,1)),f.x),f.y);}
`;
const vec = (p) => new T.Vector3(...p);
const up = new T.Vector3(0, 1, 0);

// The authored hydraulic kit supplies actual mouth, impact and channel levels.
// These meshes only animate their surfaces; the exported city owns containment.
export function createTurbineWater(records, clock, rippleTexture) {
  const group = new T.Group();
  group.name = 'Nightweir / connected turbine water';
  const geometries = new Set(),
    materials = new Set();
  const water = new T.MeshPhysicalMaterial({
    name: 'Nightweir / turbine discharge and circulating tailrace',
    color: '#557779',
    roughness: 0.24,
    metalness: 0,
    ior: 1.333,
    specularIntensity: 1,
    envMapIntensity: 0.9,
    side: T.DoubleSide,
  });
  water.onBeforeCompile = (shader) => {
    shader.uniforms.hydroTime = clock;
    shader.uniforms.hydroRipple = { value: rippleTexture };
    shader.vertexShader =
      `uniform float hydroTime;attribute vec2 hydroCoord;attribute vec4 hydroData;attribute vec3 hydroOutlet;
      varying vec2 vHydroCoord;varying vec4 vHydroData;varying vec3 vHydroOutlet;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
      #include <begin_vertex>
      vHydroCoord=hydroCoord;vHydroData=hydroData;vHydroOutlet=hydroOutlet;
      float jetVertex=step(.5,hydroData.w)*(1.-step(1.5,hydroData.w))+step(4.5,hydroData.w);
      float ringVertex=max(jetVertex,step(2.5,hydroData.w)*(1.-step(3.5,hydroData.w)));
      float acrossPhase=mix(hydroCoord.x*.47,hydroCoord.x/max(1.,hydroData.x)*6.2831853,ringVertex);
      float wave=sin(acrossPhase*3.+hydroTime*1.9)*sin(hydroCoord.y*.51-hydroTime*9.);
      wave+=.45*sin(acrossPhase*5.-hydroTime*2.4+hydroCoord.y*.91);
      float attached=smoothstep(0.,5.,hydroCoord.y);
      transformed+=normal*wave*(jetVertex>.5?.48*attached:.22);
      vec2 drainDirection=normalize(hydroOutlet.xy);
      float poolCurrent=(1.-step(.5,hydroData.w))*exp(-abs(dot(hydroCoord,vec2(-drainDirection.y,drainDirection.x)))*.08);
      transformed.y+=poolCurrent*sin(dot(hydroCoord,drainDirection)*.8-hydroTime*5.)*.18;
      transformed+=normal*step(3.5,hydroData.w)*.025;
      float jetAeration=step(4.5,hydroData.w)*smoothstep(.3,.82,hydroCoord.y/max(1.,hydroData.y));
      transformed+=normal*jetAeration*(.5+.22*sin(acrossPhase*7.+hydroCoord.y*.7-hydroTime*8.));
    `,
      );
    shader.fragmentShader =
      `uniform float hydroTime;uniform sampler2D hydroRipple;
      varying vec2 vHydroCoord;varying vec4 vHydroData;varying vec3 vHydroOutlet;\n${noiseGLSL}\n` +
      shader.fragmentShader
        .replace(
          '#include <map_fragment>',
          `
        #include <map_fragment>
        float jetEdge=step(4.5,vHydroData.w);
        float jet=step(.5,vHydroData.w)*(1.-step(1.5,vHydroData.w))+jetEdge;
        float fringe=step(3.5,vHydroData.w)*(1.-jetEdge);
        float channel=step(1.5,vHydroData.w)*(1.-step(2.5,vHydroData.w))+fringe;
        float crown=step(2.5,vHydroData.w)*(1.-step(3.5,vHydroData.w));
        vec2 p=vHydroCoord;
        float speed=mix(7.,34.,jet)+channel*75.;
        float streaming=max(jet,channel);
        float movingY=p.y-hydroTime*speed;
        float ring=p.x/max(1.,vHydroData.x)*6.2831853;
        vec2 flow=vec2(p.x*.23,movingY*.067);
        flow=mix(flow,vec2(cos(ring)*vHydroData.x*.18,movingY*.09+sin(ring)*vHydroData.x*.045),max(jet,crown));
        vec2 drift=vec2(hydroNoise(flow*.37+vHydroData.z),hydroNoise(flow*.31+vec2(17.,3.)))-.5;
        flow+=drift*1.6;
        float coarse=hydroNoise(flow+vHydroData.z*7.);
        float detail=hydroNoise(flow*vec2(2.6,1.4)+vec2(coarse*.85,17.));
        float visibility=1.-smoothstep(.2,.9,max(length(dFdx(flow)),length(dFdy(flow))));
        coarse=mix(.5,coarse,1.-smoothstep(.6,1.8,max(length(dFdx(flow)),length(dFdy(flow)))));
        detail=mix(.5,detail,visibility);
        float boil=1.-smoothstep(.25,1.5,length(p/vec2(17.,24.)));
        vec2 drainDirection=normalize(vHydroOutlet.xy);
        float drainLength=length(vHydroOutlet.xy);
        float currentAlong=dot(p,drainDirection),currentAcross=dot(p,vec2(-drainDirection.y,drainDirection.x));
        float downstream=smoothstep(-5.,8.,currentAlong)*(1.-smoothstep(drainLength+4.,drainLength+10.,currentAlong));
        float currentWidth=mix(8.,vHydroOutlet.z*.5,smoothstep(0.,max(1.,drainLength),currentAlong));
        float pathWander=(hydroNoise(vec2(currentAlong*.12-hydroTime*.65,vHydroData.z))-.5)*3.;
        float ribbon=1.-smoothstep(.45,1.1,abs(currentAcross+pathWander)/max(1.,currentWidth));
        float turbulence=smoothstep(.36,.76,coarse*.48+detail*.52);
        vec2 eddy=vec2(currentAcross,currentAlong-hydroTime*6.);
        float deflection=hydroNoise(eddy*.11+vec2(vHydroData.z,7.))-.5;
        vec2 poolFlow=vec2((currentAcross+deflection*3.)*.36,eddy.y*.26);
        float eddyFootprint=max(length(dFdx(poolFlow)),length(dFdy(poolFlow)));
        float smallFoam=mix(.5,hydroNoise(poolFlow*vec2(2.8,1.7)+13.),1.-smoothstep(.4,1.3,eddyFootprint*2.8));
        vec2 foamWarp=vec2(hydroNoise(poolFlow*.31+5.),hydroNoise(poolFlow*.27+19.))-.5;
        float patches=hydroNoise(poolFlow+foamWarp*1.3)*.65+smallFoam*.35;
        patches=mix(.5,patches,1.-smoothstep(.5,1.5,eddyFootprint));
        float patchAA=min(.055,fwidth(patches)*.35);
        float cells=smoothstep(.38-patchAA,.62+patchAA,patches);
        float foamDensity=.68+.32*hydroNoise(poolFlow*.61+vec2(3.,vHydroData.z));
        float smallAeration=smoothstep(.59,.78,smallFoam)*(1.-cells)*.3;
        float foamCoverage=cells*foamDensity+smallAeration;
        float lipAcross=abs(p.x-vHydroOutlet.x)/max(4.,vHydroOutlet.z*.5);
        float lipEdge=vHydroOutlet.y+1.2+(hydroNoise(vec2(p.x*.4,hydroTime*.8))-.5)*1.5;
        float lipBand=(1.-smoothstep(.4,1.4,abs(p.y-lipEdge)))*(1.-smoothstep(.7,1.15,lipAcross));
        float lipFoam=lipBand*(.12+foamCoverage*.82);
        float foamPool=max(max(boil*(.12+foamCoverage*.67),downstream*ribbon*(.035+foamCoverage*.98)),lipFoam);
        float foamJet=mix(.21,.68,smoothstep(0.,vHydroData.y,p.y))*turbulence+
          smoothstep(.65,.98,p.y/max(1.,vHydroData.y))*.12;
        float edge=abs(p.x)/max(1.,vHydroData.x*.5);
        float interrupted=hydroNoise(flow*vec2(.45,.8)+vec2(23.,vHydroData.z));
        float foamChannel=.08+turbulence*(.48+smoothstep(.72,.98,edge)*.24)*(.35+.65*smoothstep(.25,.7,interrupted));
        float breakup=smoothstep(30.,480.,p.y)*channel;
        float coreEdge=.98-breakup*.54;
        float streamer=hydroNoise(vec2(p.x*.24+drift.x,movingY*.035)+vHydroData.z);
        bool hydroDiscard=channel>.5&&fringe<.5&&edge>coreEdge+(.04+breakup*.05)*(coarse-.5);
        if(fringe>.5){
          float edgeFade=1.-smoothstep(.88,1.02,edge);
          diffuseColor.a=breakup*smoothstep(coreEdge-.06,coreEdge+.08,edge)*edgeFade*(.12+.65*smoothstep(.25,.7,streamer));
        }
        if(jetEdge>.5){
          float jetAge=smoothstep(.3,.82,p.y/max(1.,vHydroData.y))*(1.-smoothstep(.9,1.,p.y/max(1.,vHydroData.y)));
          diffuseColor.a=jetAge*(.08+.42*smoothstep(.38,.72,coarse*.5+detail*.5));
        }
        float foam=mix(mix(foamPool,foamJet,jet),foamChannel,channel);
        foam=mix(foam,.4+turbulence*.5,jetEdge);
        foam=mix(foam,.28+turbulence*.6,crown);
        hydroDiscard=hydroDiscard||(crown>.5&&p.y>.25&&coarse<.22+p.y*.2);
        foam=clamp(foam,0.,.92);
        diffuseColor.rgb=mix(vec3(.036,.10,.11),vec3(.46,.56,.55),foam);
        // Surface chop has its own metre scale; stretched foam coordinates must
        // not turn specular reflections into continuous satin ribbons.
        vec2 chop=vec2(p.x*.12,movingY*.12);
        chop=mix(chop,vec2(cos(ring)*vHydroData.x*.09,movingY*.12+sin(ring)*vHydroData.x*.025),max(jet,crown));
        vec2 ripple=texture2D(hydroRipple,chop*.24).rg*2.-1.;
        vec2 rippleFine=texture2D(hydroRipple,chop*.72+vec2(17.,hydroTime*.1)).rg*2.-1.;
        vec2 hydroSlope=(ripple*.16+rippleFine*.09*visibility)*(1.-foam*.45)*mix(1.,.45,jet);
      `,
        )
        .replace(
          '#include <opaque_fragment>',
          'if(hydroDiscard)discard;\n#include <opaque_fragment>',
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>\nroughnessFactor=mix(.18,.72,foam);`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
        vec3 q0=dFdx(-vViewPosition),q1=dFdy(-vViewPosition);
        vec2 st0=dFdx(vHydroCoord),st1=dFdy(vHydroCoord);
        float orientation=sign(st0.x*st1.y-st0.y*st1.x);
        vec3 across=normalize(q0*st1.y-q1*st0.y+vec3(1e-8))*orientation;
        vec3 along=normalize(-q0*st1.x+q1*st0.x+vec3(1e-8))*orientation;
        normal=normalize(normal+across*hydroSlope.x+along*hydroSlope.y);
      `,
        );
  };
  water.customProgramCacheKey = () => 'nightweir-turbine-water-v9';
  materials.add(water);
  const runoffFringe = water.clone();
  runoffFringe.name = 'Nightweir / aerated discharge and overflow fringes';
  runoffFringe.transparent = true;
  runoffFringe.depthWrite = false;
  runoffFringe.forceSinglePass = true;
  runoffFringe.onBeforeCompile = water.onBeforeCompile;
  runoffFringe.customProgramCacheKey = () =>
    'nightweir-turbine-water-v9-fringe';
  materials.add(runoffFringe);
  function surface(
    name,
    positions,
    coords,
    indices,
    data,
    outlet = [0, 1, 1],
    material = water,
  ) {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    g.setAttribute('hydroCoord', new T.Float32BufferAttribute(coords, 2));
    g.setAttribute(
      'hydroOutlet',
      new T.Float32BufferAttribute(
        Array.from({ length: positions.length / 3 }, () => outlet).flat(),
        3,
      ),
    );
    g.setAttribute(
      'hydroData',
      new T.Float32BufferAttribute(
        Array.from({ length: positions.length / 3 }, () => data).flat(),
        4,
      ),
    );
    g.setIndex(indices);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    g.boundingSphere.radius += 2;
    geometries.add(g);
    const mesh = new T.Mesh(g, material);
    if (material.transparent) mesh.renderOrder = 3;
    mesh.name = name;
    mesh.userData.aoExclude = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  function sampledPath(points, spacing = 3) {
    const result = [],
      lengths = [0];
    const path = points.map(vec);
    for (let i = 1; i < path.length; i++)
      lengths.push(lengths.at(-1) + path[i].distanceTo(path[i - 1]));
    const length = lengths.at(-1),
      count = Math.max(2, Math.ceil(length / spacing));
    for (let i = 0; i <= count; i++) {
      const s = (i / count) * length;
      let j = 1;
      while (j < lengths.length - 1 && lengths[j] < s) j++;
      const fraction =
        (s - lengths[j - 1]) / Math.max(0.001, lengths[j] - lengths[j - 1]);
      result.push({
        p: path[j - 1].clone().lerp(path[j], fraction),
        s,
        segment: j - 1,
        fraction,
      });
    }
    return { samples: result, length };
  }
  function openChannel(label, record, seed) {
    if (!record?.points?.length) return;
    const { samples, length } = sampledPath(record.points),
      positions = [],
      coords = [],
      indices = [],
      widths = [];
    samples.forEach(({ p, s, segment, fraction }, i) => {
      const tangent = samples[Math.min(i + 1, samples.length - 1)].p
        .clone()
        .sub(samples[Math.max(0, i - 1)].p)
        .normalize();
      const right = up.clone().cross(tangent).normalize();
      if (right.lengthSq() < 0.5) right.set(1, 0, 0);
      const width = record.widths
        ? T.MathUtils.lerp(
            record.widths[segment],
            record.widths[segment + 1],
            fraction,
          )
        : record.width;
      widths.push(width);
      for (let k = 0; k <= 8; k++) {
        const fringe =
          1 +
          Math.min(1, s / 80) *
            (0.055 * Math.sin(s * 0.35) + 0.025 * Math.sin(s * 1.3));
        const x = (k / 8 - 0.5) * width * fringe;
        positions.push(...p.clone().addScaledVector(right, x).toArray());
        coords.push(x, s);
        if (i < samples.length - 1 && k < 8) {
          const a = i * 9 + k;
          indices.push(a, a + 9, a + 1, a + 1, a + 9, a + 10);
        }
      }
    });
    const mesh = surface(label, positions, coords, indices, [
      record.width,
      length,
      seed,
      2,
    ]);
    const fringe = surface(
      `${label} / thinning edge streams`,
      positions,
      coords,
      indices,
      [record.width, length, seed, 4],
      [0, 1, 1],
      runoffFringe,
    );
    for (const m of [mesh, fringe]) {
      const data = m.geometry.attributes.hydroData;
      widths.forEach((width, i) => {
        for (let k = 0; k <= 8; k++) data.setX(i * 9 + k, width);
      });
    }
  }
  const emitters = [];
  records.forEach((record, index) => {
    const discharge = record.discharge,
      basin = record.basin;
    if (!discharge || !basin) return;
    // Continue the stream below the waterline so its open end is submerged.
    const jetPath = discharge.jet.map((p) => [...p]);
    const last = vec(jetPath.at(-1)),
      previous = vec(jetPath.at(-2));
    jetPath.push(
      last
        .clone()
        .add(
          last
            .clone()
            .sub(previous)
            .normalize()
            .multiplyScalar(discharge.height),
        )
        .toArray(),
    );
    const { samples, length } = sampledPath(jetPath, 1.8),
      positions = [],
      coords = [],
      indices = [],
      sides = 24;
    samples.forEach(({ p, s }, i) => {
      const tangent = samples[Math.min(i + 1, samples.length - 1)].p
        .clone()
        .sub(samples[Math.max(0, i - 1)].p)
        .normalize();
      const across = up.clone().cross(tangent).normalize();
      if (across.lengthSq() < 0.5) across.copy(vec(basin.along));
      const vertical = tangent.clone().cross(across).normalize(),
        fraction = s / Math.max(1, length);
      for (let k = 0; k <= sides; k++) {
        const a = (k / sides) * Math.PI * 2;
        const lobes =
          1 +
          fraction *
            (0.022 * Math.sin(a * 3 + s * 0.7) +
              0.014 * Math.cos(a * 5 - s * 0.3));
        const width = discharge.width * (1 + 0.22 * fraction) * lobes,
          height = discharge.height * (1 - 0.35 * fraction) * lobes;
        const offset = across
          .clone()
          .multiplyScalar(Math.cos(a) * width * 0.5)
          .addScaledVector(vertical, Math.sin(a) * height * 0.5);
        positions.push(...p.clone().add(offset).toArray());
        coords.push((k / sides) * discharge.width, s);
        if (i < samples.length - 1 && k < sides) {
          const a = i * (sides + 1) + k;
          indices.push(
            a,
            a + 1,
            a + sides + 1,
            a + 1,
            a + sides + 2,
            a + sides + 1,
          );
        }
      }
    });
    const jet = surface(
      `Nightweir / ${record.id} attached hydraulic discharge`,
      positions,
      coords,
      indices,
      [discharge.width, length, index + 1, 1],
    );
    // Duplicate UV seam vertices share their normal and periodic displacement.
    const normals = jet.geometry.attributes.normal;
    samples.forEach((_, i) => {
      const first = i * (sides + 1),
        last = first + sides;
      const n = new T.Vector3()
        .fromBufferAttribute(normals, first)
        .add(new T.Vector3().fromBufferAttribute(normals, last))
        .normalize();
      normals.setXYZ(first, n.x, n.y, n.z);
      normals.setXYZ(last, n.x, n.y, n.z);
    });
    const jetFringe = surface(
      `Nightweir / ${record.id} lower jet aeration`,
      positions,
      coords,
      indices,
      [discharge.width, length, index + 1, 5],
      [0, 1, 1],
      runoffFringe,
    );
    jetFringe.geometry.setAttribute(
      'normal',
      jet.geometry.attributes.normal.clone(),
    );
    const center = vec(basin.center);
    center.y = basin.waterY;
    const along = vec(basin.along).normalize(),
      out = vec(basin.out).normalize(),
      impact = vec(discharge.impact);
    const local = impact.clone().sub(center),
      impactX = local.dot(along),
      impactZ = local.dot(out);
    const nx = Math.max(8, Math.ceil(basin.width / 3)),
      nz = Math.max(10, Math.ceil(basin.length / 3));
    const pp = [],
      cc = [],
      ii = [];
    for (let z = 0; z <= nz; z++)
      for (let x = 0; x <= nx; x++) {
        const xx = (x / nx - 0.5) * basin.width,
          zz = (z / nz - 0.5) * basin.length;
        pp.push(
          ...center
            .clone()
            .addScaledVector(along, xx)
            .addScaledVector(out, zz)
            .toArray(),
        );
        cc.push(xx - impactX, zz - impactZ);
        if (x < nx && z < nz) {
          const a = z * (nx + 1) + x;
          ii.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
        }
      }
    const drain = vec(record.runoff.points[0]).sub(impact);
    const outlet = [drain.dot(along), drain.dot(out), record.runoff.width];
    surface(
      `Nightweir / ${record.id} contained circulating pool`,
      pp,
      cc,
      ii,
      [basin.width, basin.length, index + 1, 0],
      outlet,
    );
    // Broken splash crown at the physical impact, separate from the pool plane.
    const cp = [],
      cu = [],
      ci = [],
      crownSegments = 64;
    for (let k = 0; k <= crownSegments; k++) {
      const a = (k / crownSegments) * Math.PI * 2,
        crest =
          2.8 +
          2.7 * Math.pow(Math.sin(a * 7 + index), 2) +
          1.3 * Math.sin(a * 11);
      for (let j = 0; j <= 3; j++) {
        const rise = j / 3,
          radius = discharge.width * (0.43 + rise * 0.26);
        const q = impact
          .clone()
          .addScaledVector(along, Math.cos(a) * radius)
          .addScaledVector(out, Math.sin(a) * radius * 0.76);
        q.y += -0.45 + rise * crest;
        cp.push(...q.toArray());
        cu.push((k / crownSegments) * discharge.width, j / 3);
        if (k < crownSegments && j < 3) {
          const n = k * 4 + j;
          ci.push(n, n + 4, n + 1, n + 1, n + 4, n + 5);
        }
      }
    }
    const crown = surface(
      `Nightweir / ${record.id} broken impact crown`,
      cp,
      cu,
      ci,
      [discharge.width, 1, index + 1, 3],
    );
    const crownNormals = crown.geometry.attributes.normal;
    for (let j = 0; j <= 3; j++) {
      const first = j,
        last = crownSegments * 4 + j;
      const n = new T.Vector3()
        .fromBufferAttribute(crownNormals, first)
        .add(new T.Vector3().fromBufferAttribute(crownNormals, last))
        .normalize();
      crownNormals.setXYZ(first, n.x, n.y, n.z);
      crownNormals.setXYZ(last, n.x, n.y, n.z);
    }
    openChannel(
      `Nightweir / ${record.id} open feed`,
      record.openFeed,
      index + 1,
    );
    openChannel(
      `Nightweir / ${record.id} foamy tailrace`,
      record.runoff,
      index + 1,
    );
    emitters.push({
      p: impact,
      right: along,
      forward: out,
      width: discharge.width,
      seed: index + 1,
    });
  });

  // World-space droplets are billboarded on the GPU. Standard lighting uses
  // the actual existing work lamps; there is no emissive sprite or light pool.
  if (emitters.length) {
    const base = new T.PlaneGeometry(1, 1),
      g = new T.InstancedBufferGeometry();
    g.index = base.index.clone();
    g.setAttribute('position', base.attributes.position.clone());
    g.setAttribute('normal', base.attributes.normal.clone());
    g.setAttribute('uv', base.attributes.uv.clone());
    base.dispose();
    const origins = [],
      velocities = [],
      seeds = [];
    for (const e of emitters)
      for (let i = 0; i < 160; i++) {
        const hash = (n) =>
          T.MathUtils.euclideanModulo(
            Math.sin(n * 127.1 + e.seed * 31.7) * 43758.5453,
            1,
          );
        const mist = i >= 96,
          across = (hash(i + 1) - 0.5) * e.width * 1.3;
        const p = e.p
          .clone()
          .addScaledVector(e.right, across)
          .addScaledVector(
            e.forward,
            mist ? 4 + hash(i + 2) * 4 : (hash(i + 2) - 0.5) * 9,
          );
        const v = e.right
          .clone()
          .multiplyScalar(
            mist ? (hash(i + 3) - 0.15) * 3 : (hash(i + 3) - 0.5) * 14,
          )
          .addScaledVector(
            e.forward,
            mist ? 3 + hash(i + 4) * 2 : (hash(i + 4) - 0.25) * 14,
          );
        v.y = mist ? 6 + hash(i + 5) * 4 : 10 + hash(i + 5) * 13;
        origins.push(...p.toArray());
        velocities.push(...v.toArray());
        seeds.push(
          hash(i + 6),
          mist ? 3.2 + hash(i + 7) * 1.7 : 1.8 + hash(i + 7),
          mist ? 7 + hash(i + 8) * 6 : 0.75 + hash(i + 8) * 1.8,
          mist ? 1 : 0,
        );
      }
    g.setAttribute(
      'sprayOrigin',
      new T.InstancedBufferAttribute(new Float32Array(origins), 3),
    );
    g.setAttribute(
      'sprayVelocity',
      new T.InstancedBufferAttribute(new Float32Array(velocities), 3),
    );
    g.setAttribute(
      'spraySeed',
      new T.InstancedBufferAttribute(new Float32Array(seeds), 4),
    );
    g.instanceCount = seeds.length / 4;
    g.boundingBox = new T.Box3();
    emitters.forEach((e) => g.boundingBox.expandByPoint(e.p));
    g.boundingBox.expandByScalar(80);
    g.boundingSphere = g.boundingBox.getBoundingSphere(new T.Sphere());
    geometries.add(g);
    const mist = new T.MeshStandardMaterial({
      name: 'Nightweir / worklight illuminated impact spray',
      color: '#b9cdce',
      roughness: 0.95,
      metalness: 0,
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
      forceSinglePass: true,
      envMapIntensity: 0.22,
    });
    mist.onBeforeCompile = (shader) => {
      shader.uniforms.hydroTime = clock;
      shader.vertexShader =
        `uniform float hydroTime;attribute vec3 sprayOrigin;attribute vec3 sprayVelocity;attribute vec4 spraySeed;varying vec2 vSprayUV;varying vec2 vSprayLife;\n` +
        shader.vertexShader
          .replace(
            '#include <defaultnormal_vertex>',
            'vec3 transformedNormal=vec3(0.,0.,1.);',
          )
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>\nvSprayUV=uv;float phase=fract(hydroTime/spraySeed.y+spraySeed.x);float age=phase*spraySeed.y;vSprayLife=vec2(phase,spraySeed.w);vec3 sprayPoint=sprayOrigin+sprayVelocity*age; sprayPoint.y-=mix(4.9,.55,spraySeed.w)*age*age;transformed=sprayPoint;`,
          )
          .replace(
            '#include <project_vertex>',
            `vec4 mvPosition=modelViewMatrix*vec4(transformed,1.);float size=spraySeed.z*mix(1.,1.+phase*1.5,spraySeed.w);mvPosition.xy+=position.xy*size;gl_Position=projectionMatrix*mvPosition;`,
          );
      shader.fragmentShader =
        `varying vec2 vSprayUV;varying vec2 vSprayLife;\n${noiseGLSL}\n` +
        shader.fragmentShader.replace(
          '#include <map_fragment>',
          `#include <map_fragment>\nvec2 p=vSprayUV-.5;float radius=length(p*vec2(1.,mix(.55,1.,vSprayLife.y)));float grain=hydroNoise(vSprayUV*8.+vSprayLife.x*3.);float edge=1.-smoothstep(.12,.5,radius+grain*.09);float life=smoothstep(0.,.08,vSprayLife.x)*(1.-smoothstep(.5,1.,vSprayLife.x));diffuseColor.rgb*=mix(1.,.62,vSprayLife.y);diffuseColor.a=edge*life*mix(.72,.13,vSprayLife.y);`,
        );
      // Droplet clouds scatter light through their volume, unlike an opaque
      // camera-facing card. Reuse the same real lights and attenuation with a
      // broad phase response; no emissive glow or additional light loop.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_physical_pars_fragment>',
        T.ShaderChunk.lights_physical_pars_fragment.replace(
          'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
          'float phaseLight=.25+.5*pow(saturate(dot(geometryViewDir,-directLight.direction)),2.);float dotNL=mix(saturate(dot(geometryNormal,directLight.direction)),phaseLight,vSprayLife.y);',
        ),
      );
    };
    mist.customProgramCacheKey = () => 'nightweir-lit-turbine-spray-v4';
    materials.add(mist);
    const spray = new T.Mesh(g, mist);
    spray.name = 'Nightweir / illuminated turbine splash and thinning mist';
    spray.userData.aoExclude = true;
    spray.renderOrder = 4;
    group.add(spray);
  }
  let disposed = false;
  return {
    group,
    update() {
      group.userData.flowTime = clock.value;
    },
    setReflection(texture) {
      materials.forEach((m) => {
        m.envMap = texture;
        m.needsUpdate = true;
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      group.clear();
    },
  };
}
